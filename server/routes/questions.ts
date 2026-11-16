import { Router } from 'express';
import type { SQLInputValue } from 'node:sqlite';
import { z } from 'zod';
import { db } from '../db.ts';
import { optionalAuth, requireAuth, type AuthenticatedRequest } from '../auth.ts';

const router = Router();

function resolveQuestion(idOrSlug: string) {
  const isNum = /^\d+$/.test(idOrSlug);
  const query = `
    SELECT q.*, c.slug AS category_slug, c.name AS category_name, c.order_index AS category_order,
           con.slug AS concept_slug, con.name AS concept_name
    FROM questions q
    JOIN categories c ON c.id = q.category_id
    JOIN concepts con ON con.id = q.concept_id
    WHERE ${isNum ? 'q.id = ?' : 'q.slug = ?'}
  `;
  return db.prepare(query).get(isNum ? Number(idOrSlug) : idOrSlug) as Record<string, unknown> | undefined;
}

router.get('/categories', optionalAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id ?? -1;
  const rows = db
    .prepare(
      `
      SELECT
        c.id, c.slug, c.order_index, c.name, c.description,
        COUNT(DISTINCT q.id) AS total_count,
        SUM(CASE WHEN q.difficulty = 'Easy' THEN 1 ELSE 0 END) AS easy_count,
        SUM(CASE WHEN q.difficulty = 'Medium' THEN 1 ELSE 0 END) AS medium_count,
        SUM(CASE WHEN q.difficulty = 'Hard' THEN 1 ELSE 0 END) AS hard_count,
        SUM(CASE WHEN uqp.status = 'Solved' THEN 1 ELSE 0 END) AS solved_count,
        SUM(CASE WHEN uqp.status = 'Attempted' THEN 1 ELSE 0 END) AS attempted_count,
        (SELECT COUNT(*) FROM concepts con WHERE con.category_id = c.id) AS concept_count
      FROM categories c
      LEFT JOIN questions q ON q.category_id = c.id
      LEFT JOIN user_question_progress uqp ON uqp.question_id = q.id AND uqp.user_id = ?
      GROUP BY c.id
      ORDER BY c.order_index ASC
    `
    )
    .all(userId);

  res.json({ categories: rows });
});

router.get('/categories/:id', optionalAuth, (req: AuthenticatedRequest, res) => {
  const param = String(req.params.id);
  const isNum = /^\d+$/.test(param);
  const cat = db
    .prepare(`SELECT * FROM categories WHERE ${isNum ? 'id = ?' : 'slug = ?'}`)
    .get(isNum ? Number(param) : param) as { id: number; slug: string; name: string; description: string; order_index: number } | undefined;

  if (!cat) {
    res.status(404).json({ detail: 'Category not found.' });
    return;
  }

  const userId = req.user?.id ?? -1;
  const concepts = db
    .prepare(
      `
      SELECT con.*, COUNT(q.id) AS question_count,
             SUM(CASE WHEN uqp.status = 'Solved' THEN 1 ELSE 0 END) AS solved_count
      FROM concepts con
      LEFT JOIN questions q ON q.concept_id = con.id
      LEFT JOIN user_question_progress uqp ON uqp.question_id = q.id AND uqp.user_id = ?
      WHERE con.category_id = ?
      GROUP BY con.id
      ORDER BY con.order_index ASC
    `
    )
    .all(userId, cat.id);

  const questions = db
    .prepare(
      `
      SELECT
        q.id, q.question_number, q.slug, q.title, q.difficulty, q.question_type,
        con.name AS concept_name, con.slug AS concept_slug,
        COALESCE(uqp.status, 'Not Started') AS status,
        COALESCE(uqp.attempts_count, 0) AS attempts_count,
        CASE WHEN ub.id IS NOT NULL THEN 1 ELSE 0 END AS is_bookmarked,
        CASE WHEN ur.id IS NOT NULL THEN 1 ELSE 0 END AS is_revision
      FROM questions q
      JOIN concepts con ON con.id = q.concept_id
      LEFT JOIN user_question_progress uqp ON uqp.question_id = q.id AND uqp.user_id = ?
      LEFT JOIN user_bookmarks ub ON ub.question_id = q.id AND ub.user_id = ?
      LEFT JOIN user_revisions ur ON ur.question_id = q.id AND ur.user_id = ?
      WHERE q.category_id = ?
      ORDER BY q.question_number ASC
    `
    )
    .all(userId, userId, userId, cat.id);

  res.json({ category: cat, concepts, questions });
});

router.get('/concepts', optionalAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id ?? -1;
  const categorySlug = typeof req.query.category === 'string' ? req.query.category : null;

  let sql = `
    SELECT con.id, con.slug, con.order_index, con.name, con.summary,
           c.id AS category_id, c.slug AS category_slug, c.name AS category_name, c.order_index AS category_order,
           COUNT(q.id) AS question_count,
           SUM(CASE WHEN uqp.status = 'Solved' THEN 1 ELSE 0 END) AS solved_count
    FROM concepts con
    JOIN categories c ON c.id = con.category_id
    LEFT JOIN questions q ON q.concept_id = con.id
    LEFT JOIN user_question_progress uqp ON uqp.question_id = q.id AND uqp.user_id = ?
  `;
  const params: SQLInputValue[] = [userId];
  if (categorySlug) {
    sql += ' WHERE c.slug = ? ';
    params.push(categorySlug);
  }
  sql += ' GROUP BY con.id ORDER BY c.order_index ASC, con.order_index ASC ';

  const concepts = db.prepare(sql).all(...params);
  res.json({ concepts });
});

router.get('/concepts/:id', optionalAuth, (req: AuthenticatedRequest, res) => {
  const param = String(req.params.id);
  const isNum = /^\d+$/.test(param);
  const concept = db
    .prepare(
      `SELECT con.*, c.slug AS category_slug, c.name AS category_name
       FROM concepts con JOIN categories c ON c.id = con.category_id
       WHERE ${isNum ? 'con.id = ?' : 'con.slug = ?'}`
    )
    .get(isNum ? Number(param) : param) as { id: number } | undefined;

  if (!concept) {
    res.status(404).json({ detail: 'Concept not found.' });
    return;
  }

  const userId = req.user?.id ?? -1;
  const questions = db
    .prepare(
      `
      SELECT q.id, q.question_number, q.slug, q.title, q.difficulty, q.question_type,
             COALESCE(uqp.status, 'Not Started') AS status,
             CASE WHEN ub.id IS NOT NULL THEN 1 ELSE 0 END AS is_bookmarked,
             CASE WHEN ur.id IS NOT NULL THEN 1 ELSE 0 END AS is_revision
      FROM questions q
      LEFT JOIN user_question_progress uqp ON uqp.question_id = q.id AND uqp.user_id = ?
      LEFT JOIN user_bookmarks ub ON ub.question_id = q.id AND ub.user_id = ?
      LEFT JOIN user_revisions ur ON ur.question_id = q.id AND ur.user_id = ?
      WHERE q.concept_id = ?
      ORDER BY q.question_number ASC
    `
    )
    .all(userId, userId, userId, concept.id);

  res.json({ concept, questions });
});

router.get('/questions', optionalAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id ?? -1;
  const search = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
  const concept = typeof req.query.concept === 'string' ? req.query.concept.trim() : '';
  const difficulty = typeof req.query.difficulty === 'string' ? req.query.difficulty.trim() : '';
  const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
  const qtype = typeof req.query.type === 'string' ? req.query.type.trim() : '';
  const bookmarkedOnly = req.query.bookmarked === 'true';
  const revisionOnly = req.query.revision === 'true';
  const sort = typeof req.query.sort === 'string' ? req.query.sort : 'number';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(400, Math.max(1, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  const where: string[] = ['1=1'];
  const params: SQLInputValue[] = [userId, userId, userId];

  if (search) {
    where.push('(lower(q.title) LIKE ? OR lower(con.name) LIKE ? OR lower(c.name) LIKE ? OR CAST(q.question_number AS TEXT) = ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, search);
  }
  if (category) {
    where.push('c.slug = ?');
    params.push(category);
  }
  if (concept) {
    where.push('con.slug = ?');
    params.push(concept);
  }
  if (difficulty && ['Easy', 'Medium', 'Hard'].includes(difficulty)) {
    where.push('q.difficulty = ?');
    params.push(difficulty);
  }
  if (qtype) {
    where.push('q.question_type = ?');
    params.push(qtype);
  }
  if (status) {
    if (status === 'Not Started') {
      where.push("(uqp.status IS NULL OR uqp.status = 'Not Started')");
    } else if (status === 'Needs Revision') {
      where.push("(uqp.status = 'Needs Revision' OR ur.id IS NOT NULL)");
    } else {
      where.push('uqp.status = ?');
      params.push(status);
    }
  }
  if (bookmarkedOnly) {
    where.push('ub.id IS NOT NULL');
  }
  if (revisionOnly) {
    where.push("(ur.id IS NOT NULL OR uqp.status = 'Needs Revision')");
  }

  let orderBy = 'q.question_number ASC';
  if (sort === 'difficulty') {
    orderBy = "CASE q.difficulty WHEN 'Easy' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END, q.question_number ASC";
  } else if (sort === 'status') {
    orderBy = "CASE COALESCE(uqp.status, 'Not Started') WHEN 'Solved' THEN 1 WHEN 'Attempted' THEN 2 WHEN 'Needs Revision' THEN 3 ELSE 4 END, q.question_number ASC";
  } else if (sort === 'recent_attempt') {
    orderBy = 'COALESCE(uqp.last_attempted_at, \'\') DESC, q.question_number ASC';
  } else if (sort === 'newest') {
    orderBy = 'q.id DESC';
  }

  const baseFrom = `
    FROM questions q
    JOIN categories c ON c.id = q.category_id
    JOIN concepts con ON con.id = q.concept_id
    LEFT JOIN user_question_progress uqp ON uqp.question_id = q.id AND uqp.user_id = ?
    LEFT JOIN user_bookmarks ub ON ub.question_id = q.id AND ub.user_id = ?
    LEFT JOIN user_revisions ur ON ur.question_id = q.id AND ur.user_id = ?
    WHERE ${where.join(' AND ')}
  `;

  const totalRow = db.prepare(`SELECT COUNT(*) AS cnt ${baseFrom}`).get(...params) as { cnt: number };

  const items = db
    .prepare(
      `
      SELECT
        q.id, q.question_number, q.slug, q.title, q.difficulty, q.question_type,
        c.id AS category_id, c.slug AS category_slug, c.name AS category_name,
        con.id AS concept_id, con.slug AS concept_slug, con.name AS concept_name,
        COALESCE(uqp.status, 'Not Started') AS status,
        COALESCE(uqp.attempts_count, 0) AS attempts_count,
        uqp.last_attempted_at,
        CASE WHEN ub.id IS NOT NULL THEN 1 ELSE 0 END AS is_bookmarked,
        CASE WHEN ur.id IS NOT NULL THEN 1 ELSE 0 END AS is_revision
      ${baseFrom}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `
    )
    .all(...params, limit, offset);

  res.json({
    items,
    total: totalRow.cnt,
    page,
    limit,
    total_pages: Math.max(1, Math.ceil(totalRow.cnt / limit)),
  });
});

router.get('/questions/:id', optionalAuth, (req: AuthenticatedRequest, res) => {
  const q = resolveQuestion(String(req.params.id));
  if (!q) {
    res.status(404).json({ detail: 'Question not found.' });
    return;
  }

  const questionId = Number(q.id);
  // Strictly return ONLY public test cases (is_hidden = 0)
  const publicTests = db
    .prepare(
      `SELECT id, order_index, input_data, expected_output, description
       FROM question_test_cases
       WHERE question_id = ? AND is_hidden = 0
       ORDER BY order_index ASC`
    )
    .all(questionId);

  const hiddenCount = (
    db.prepare('SELECT COUNT(*) AS cnt FROM question_test_cases WHERE question_id = ? AND is_hidden = 1').get(questionId) as {
      cnt: number;
    }
  ).cnt;

  const hints = db
    .prepare('SELECT id, order_index, hint_text FROM question_hints WHERE question_id = ? ORDER BY order_index ASC')
    .all(questionId);

  let userState: Record<string, unknown> = {
    status: 'Not Started',
    attempts_count: 0,
    is_bookmarked: false,
    is_revision: false,
    saved_code: null,
    used_hints: [],
  };

  if (req.user) {
    const prog = db
      .prepare('SELECT status, attempts_count, last_attempted_at, solved_at FROM user_question_progress WHERE user_id = ? AND question_id = ?')
      .get(req.user.id, questionId) as { status: string; attempts_count: number } | undefined;
    const bm = db.prepare('SELECT id FROM user_bookmarks WHERE user_id = ? AND question_id = ?').get(req.user.id, questionId);
    const rev = db
      .prepare('SELECT id, notes, priority FROM user_revisions WHERE user_id = ? AND question_id = ?')
      .get(req.user.id, questionId) as { id: number; notes: string; priority: string } | undefined;
    const saved = db
      .prepare('SELECT source_code, updated_at FROM user_saved_code WHERE user_id = ? AND question_id = ?')
      .get(req.user.id, questionId) as { source_code: string; updated_at: string } | undefined;
    const usedHintRows = db
      .prepare('SELECT hint_order FROM user_hint_usage WHERE user_id = ? AND question_id = ? ORDER BY hint_order ASC')
      .all(req.user.id, questionId) as { hint_order: number }[];

    userState = {
      status: prog?.status ?? 'Not Started',
      attempts_count: prog?.attempts_count ?? 0,
      is_bookmarked: Boolean(bm),
      is_revision: Boolean(rev),
      revision_notes: rev?.notes ?? '',
      revision_priority: rev?.priority ?? 'Medium',
      saved_code: saved?.source_code ?? null,
      used_hints: usedHintRows.map((h) => h.hint_order),
    };
  }

  // Adjacent question links for Previous / Next navigation
  const qNum = Number(q.question_number);
  const prevQ = db.prepare('SELECT slug, title, question_number FROM questions WHERE question_number = ?').get(qNum - 1);
  const nextQ = db.prepare('SELECT slug, title, question_number FROM questions WHERE question_number = ?').get(qNum + 1);

  res.json({
    question: {
      id: q.id,
      question_number: q.question_number,
      slug: q.slug,
      title: q.title,
      category_id: q.category_id,
      category_slug: q.category_slug,
      category_name: q.category_name,
      concept_id: q.concept_id,
      concept_slug: q.concept_slug,
      concept_name: q.concept_name,
      difficulty: q.difficulty,
      question_type: q.question_type,
      problem_statement: q.problem_statement,
      input_format: q.input_format,
      output_format: q.output_format,
      constraints: q.constraints,
      examples: JSON.parse(String(q.examples_json || '[]')),
      starter_code: q.starter_code,
      function_name: q.function_name,
      evaluation_mode: q.evaluation_mode,
      related_concepts: JSON.parse(String(q.related_concepts_json || '[]')),
      hidden_test_count: hiddenCount,
    },
    public_test_cases: publicTests,
    hints,
    user_state: userState,
    prev_question: prevQ ?? null,
    next_question: nextQ ?? null,
  });
});

router.get('/questions/:id/test-cases', (req, res) => {
  const q = resolveQuestion(String(req.params.id));
  if (!q) {
    res.status(404).json({ detail: 'Question not found.' });
    return;
  }
  const publicTests = db
    .prepare(
      `SELECT id, order_index, input_data, expected_output, description
       FROM question_test_cases
       WHERE question_id = ? AND is_hidden = 0
       ORDER BY order_index ASC`
    )
    .all(Number(q.id));
  res.json({ test_cases: publicTests });
});

// Returns all ordered test cases (public + hidden) for personal browser-based Pyodide evaluation on Submit
router.get('/questions/:id/eval-tests', (req, res) => {
  const q = resolveQuestion(String(req.params.id));
  if (!q) {
    res.status(404).json({ detail: 'Question not found.' });
    return;
  }
  const allTests = db
    .prepare(
      `SELECT id, order_index, input_data, expected_output, description, is_hidden
       FROM question_test_cases
       WHERE question_id = ?
       ORDER BY is_hidden ASC, order_index ASC`
    )
    .all(Number(q.id));
  res.json({ test_cases: allTests });
});

router.get('/questions/:id/hints', (req, res) => {
  const q = resolveQuestion(String(req.params.id));
  if (!q) {
    res.status(404).json({ detail: 'Question not found.' });
    return;
  }
  const hints = db
    .prepare('SELECT id, order_index, hint_text FROM question_hints WHERE question_id = ? ORDER BY order_index ASC')
    .all(Number(q.id));
  res.json({ hints });
});

router.get('/questions/:id/solution', (req, res) => {
  const q = resolveQuestion(String(req.params.id));
  if (!q) {
    res.status(404).json({ detail: 'Question not found.' });
    return;
  }
  const sol = db
    .prepare('SELECT reference_code, explanation FROM question_solutions WHERE question_id = ?')
    .get(Number(q.id));
  res.json({ solution: sol });
});

router.post('/questions/:id/hints/:order/use', requireAuth, (req: AuthenticatedRequest, res) => {
  const q = resolveQuestion(String(req.params.id));
  if (!q) {
    res.status(404).json({ detail: 'Question not found.' });
    return;
  }
  const parsedOrder = z.coerce.number().int().min(1).max(3).safeParse(req.params.order);
  if (!parsedOrder.success) {
    res.status(400).json({ detail: 'Hint order must be 1, 2, or 3.' });
    return;
  }
  const questionId = Number(q.id);
  db.prepare(
    `INSERT OR IGNORE INTO user_hint_usage (user_id, question_id, hint_order) VALUES (?, ?, ?)`
  ).run(req.user!.id, questionId, parsedOrder.data);

  const used = db
    .prepare('SELECT hint_order FROM user_hint_usage WHERE user_id = ? AND question_id = ? ORDER BY hint_order ASC')
    .all(req.user!.id, questionId) as { hint_order: number }[];

  res.json({ ok: true, used_hints: used.map((r) => r.hint_order) });
});

router.get('/debugging/overview', optionalAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id ?? -1;
  const questions = db
    .prepare(
      `SELECT q.id, q.question_number, q.slug, q.title, q.difficulty, q.question_type,
              c.slug AS category_slug, c.name AS category_name,
              con.slug AS concept_slug, con.name AS concept_name,
              COALESCE(uqp.status, 'Not Started') AS status,
              COALESCE(uqp.attempts_count, 0) AS attempts_count,
              (SELECT COUNT(*) FROM user_hint_usage uh WHERE uh.question_id = q.id AND uh.user_id = ?) AS hints_used_count
       FROM questions q
       JOIN categories c ON c.id = q.category_id
       JOIN concepts con ON con.id = q.concept_id
       LEFT JOIN user_question_progress uqp ON uqp.question_id = q.id AND uqp.user_id = ?
       WHERE c.slug = 'python-debugging-challenges' OR q.question_type = 'debugging'
       ORDER BY q.question_number ASC`
    )
    .all(userId, userId) as Record<string, unknown>[];

  let totalSubs = 0;
  let acceptedSubs = 0;
  if (userId > 0) {
    const statRow = db
      .prepare(
        `SELECT COUNT(*) AS total_subs,
                SUM(CASE WHEN s.status = 'Accepted' THEN 1 ELSE 0 END) AS accepted_subs
         FROM user_submissions s
         JOIN questions q ON q.id = s.question_id
         JOIN categories c ON c.id = q.category_id
         WHERE s.user_id = ? AND (c.slug = 'python-debugging-challenges' OR q.question_type = 'debugging')`
      )
      .get(userId) as { total_subs: number; accepted_subs: number | null };
    totalSubs = statRow.total_subs || 0;
    acceptedSubs = statRow.accepted_subs || 0;
  }

  const solvedCount = questions.filter((q) => q.status === 'Solved').length;
  const attemptedCount = questions.filter((q) => q.status === 'Attempted').length;

  res.json({
    stats: {
      total: questions.length,
      solved: solvedCount,
      attempted: attemptedCount,
      submissions_count: totalSubs,
      accepted_count: acceptedSubs,
      accuracy_pct: totalSubs > 0 ? Math.round((acceptedSubs / totalSubs) * 1000) / 10 : 0,
    },
    questions,
  });
});

export default router;

