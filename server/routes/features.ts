import { Router } from 'express';
import type { SQLInputValue } from 'node:sqlite';
import { z } from 'zod';
import { db } from '../db.ts';
import { optionalAuth, requireAuth, type AuthenticatedRequest } from '../auth.ts';
import { OUTPUT_PREDICTION_SNIPPETS } from '../data/outputPredictions.ts';
import { INTERVIEW_PREP_ITEMS } from '../data/interviewPrep.ts';
import { getDailyChallengeQuestionId, getTodayUtcDate } from '../lib/dailyChallenge.ts';

const router = Router();

function normalizePredictedOutput(s: string): string {
  return s
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/g, ''))
    .join('\n')
    .trim();
}

// ==========================================
// FEATURE 5: MOCK INTERVIEW
// ==========================================
router.post('/mock-interviews/start', requireAuth, (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    difficulty: z.enum(['Easy', 'Medium', 'Hard', 'Mixed']).default('Mixed'),
    category_slug: z.string().max(120).optional().default(''),
    duration_minutes: z.number().int().min(5).max(120).default(30),
    question_count: z.number().int().min(1).max(5).default(3),
  });
  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.issues[0]?.message || 'Invalid mock interview config.' });
    return;
  }

  const { difficulty, category_slug, duration_minutes, question_count } = parsed.data;
  const where: string[] = ['1=1'];
  const params: SQLInputValue[] = [];
  if (difficulty !== 'Mixed') {
    where.push('q.difficulty = ?');
    params.push(difficulty);
  }
  if (category_slug) {
    where.push('c.slug = ?');
    params.push(category_slug);
  }

  let pool = db
    .prepare(
      `SELECT q.id, q.question_number, q.slug, q.title, q.difficulty, q.question_type,
              q.problem_statement, q.input_format, q.output_format, q.constraints,
              q.examples_json, q.starter_code, q.function_name, q.evaluation_mode,
              c.slug AS category_slug, c.name AS category_name, con.name AS concept_name
       FROM questions q
       JOIN categories c ON c.id = q.category_id
       JOIN concepts con ON con.id = q.concept_id
       WHERE ${where.join(' AND ')}
       ORDER BY RANDOM()
       LIMIT ?`
    )
    .all(...params, question_count) as Record<string, unknown>[];

  if (pool.length === 0) {
    // Fallback across all categories if strict filter had zero matches
    pool = db
      .prepare(
        `SELECT q.id, q.question_number, q.slug, q.title, q.difficulty, q.question_type,
                q.problem_statement, q.input_format, q.output_format, q.constraints,
                q.examples_json, q.starter_code, q.function_name, q.evaluation_mode,
                c.slug AS category_slug, c.name AS category_name, con.name AS concept_name
         FROM questions q
         JOIN categories c ON c.id = q.category_id
         JOIN concepts con ON con.id = q.concept_id
         ORDER BY RANDOM()
         LIMIT ?`
      )
      .all(question_count) as Record<string, unknown>[];
  }

  const questionIds = pool.map((q) => Number(q.id));
  const insert = db
    .prepare(
      `INSERT INTO mock_interviews (
         user_id, difficulty, category_slug, duration_minutes, question_ids_json, total_questions, status
       ) VALUES (?, ?, ?, ?, ?, ?, 'in_progress')`
    )
    .run(req.user!.id, difficulty, category_slug, duration_minutes, JSON.stringify(questionIds), pool.length);

  const interviewId = Number(insert.lastInsertRowid);
  const questions = pool.map((q) => {
    const qId = Number(q.id);
    const publicTests = db
      .prepare(
        `SELECT id, order_index, input_data, expected_output, description
         FROM question_test_cases WHERE question_id = ? AND is_hidden = 0 ORDER BY order_index ASC`
      )
      .all(qId);
    const evalTests = db
      .prepare(
        `SELECT id, order_index, input_data, expected_output, description, is_hidden
         FROM question_test_cases WHERE question_id = ? ORDER BY is_hidden ASC, order_index ASC`
      )
      .all(qId);
    return {
      ...q,
      examples: JSON.parse(String(q.examples_json || '[]')),
      public_test_cases: publicTests,
      eval_test_cases: evalTests,
    };
  });

  res.status(201).json({
    interview: {
      id: interviewId,
      difficulty,
      category_slug,
      duration_minutes,
      total_questions: pool.length,
      status: 'in_progress',
    },
    questions,
  });
});

router.post('/mock-interviews/:id/submit', requireAuth, (req: AuthenticatedRequest, res) => {
  const interviewId = Number(req.params.id);
  const existing = db
    .prepare('SELECT * FROM mock_interviews WHERE id = ? AND user_id = ?')
    .get(interviewId, req.user!.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ detail: 'Mock interview session not found.' });
    return;
  }

  const schema = z.object({
    time_spent_seconds: z.number().int().min(0),
    answers: z.array(
      z.object({
        question_id: z.number().int().positive(),
        slug: z.string(),
        title: z.string(),
        difficulty: z.string(),
        source_code: z.string().max(65536),
        status: z.string(),
        passed_count: z.number().int().min(0),
        total_count: z.number().int().min(0),
        execution_time_ms: z.number().int().min(0),
      })
    ),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.issues[0]?.message || 'Invalid interview submission.' });
    return;
  }

  const answers = parsed.data.answers;
  const totalQ = Math.max(1, Number(existing.total_questions) || answers.length);
  const passedQ = answers.filter((a) => a.status === 'Accepted' && a.total_count > 0 && a.passed_count === a.total_count).length;
  const scorePct = Math.round((passedQ / totalQ) * 1000) / 10;

  db.prepare(
    `UPDATE mock_interviews
     SET answers_json = ?,
         score_pct = ?,
         passed_questions = ?,
         time_spent_seconds = ?,
         status = 'completed',
         completed_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  ).run(JSON.stringify(answers), scorePct, passedQ, parsed.data.time_spent_seconds, interviewId, req.user!.id);

  res.json({
    interview: {
      id: interviewId,
      difficulty: existing.difficulty,
      category_slug: existing.category_slug,
      duration_minutes: existing.duration_minutes,
      score_pct: scorePct,
      passed_questions: passedQ,
      total_questions: totalQ,
      time_spent_seconds: parsed.data.time_spent_seconds,
      status: 'completed',
      answers,
    },
  });
});

router.get('/mock-interviews', requireAuth, (req: AuthenticatedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT id, difficulty, category_slug, duration_minutes, score_pct, passed_questions,
              total_questions, time_spent_seconds, status, started_at, completed_at, answers_json
       FROM mock_interviews
       WHERE user_id = ?
       ORDER BY id DESC
       LIMIT 25`
    )
    .all(req.user!.id)
    .map((r: Record<string, unknown>) => ({
      ...r,
      answers: JSON.parse(String(r.answers_json || '[]')),
    }));

  res.json({ interviews: rows });
});

router.get('/mock-interviews/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const row = db
    .prepare('SELECT * FROM mock_interviews WHERE id = ? AND user_id = ?')
    .get(Number(req.params.id), req.user!.id) as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ detail: 'Mock interview not found.' });
    return;
  }
  res.json({
    interview: {
      ...row,
      question_ids: JSON.parse(String(row.question_ids_json || '[]')),
      answers: JSON.parse(String(row.answers_json || '[]')),
    },
  });
});

// ==========================================
// FEATURE 7: PYTHON OUTPUT PREDICTION
// ==========================================
router.get('/output-predictions', optionalAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id ?? -1;
  const attemptMap = new Map<string, { is_correct: boolean; predicted_output: string; attempts: number }>();

  if (userId > 0) {
    const rows = db
      .prepare(
        `SELECT snippet_id, predicted_output, is_correct, id
         FROM output_prediction_attempts
         WHERE user_id = ?
         ORDER BY id ASC`
      )
      .all(userId) as { snippet_id: string; predicted_output: string; is_correct: number; id: number }[];
    for (const r of rows) {
      const prev = attemptMap.get(r.snippet_id);
      attemptMap.set(r.snippet_id, {
        is_correct: Boolean(r.is_correct) || Boolean(prev?.is_correct),
        predicted_output: r.predicted_output,
        attempts: (prev?.attempts ?? 0) + 1,
      });
    }
  }

  const items = OUTPUT_PREDICTION_SNIPPETS.map((s) => {
    const att = attemptMap.get(s.id);
    return {
      id: s.id,
      title: s.title,
      difficulty: s.difficulty,
      concept: s.concept,
      code: s.code,
      attempted: Boolean(att),
      is_correct: att?.is_correct ?? false,
      attempts_count: att?.attempts ?? 0,
      last_prediction: att?.predicted_output ?? null,
      // Reveal answer details once attempted by signed-in user
      ...(att
        ? {
            expected_output: s.expected_output,
            execution_order: s.execution_order,
            variable_changes: s.variable_changes,
            explanation: s.explanation,
          }
        : {}),
    };
  });

  const correctCount = items.filter((i) => i.is_correct).length;
  const attemptedCount = items.filter((i) => i.attempted).length;

  res.json({
    stats: {
      total: items.length,
      attempted: attemptedCount,
      correct: correctCount,
      accuracy_pct: attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 1000) / 10 : 0,
    },
    items,
  });
});

router.post('/output-predictions/:id/attempt', optionalAuth, (req: AuthenticatedRequest, res) => {
  const snippet = OUTPUT_PREDICTION_SNIPPETS.find((s) => s.id === req.params.id);
  if (!snippet) {
    res.status(404).json({ detail: 'Output prediction snippet not found.' });
    return;
  }

  const schema = z.object({
    predicted_output: z.string().max(4000),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: 'Please enter a predicted output.' });
    return;
  }

  const normalizedPred = normalizePredictedOutput(parsed.data.predicted_output);
  const normalizedExp = normalizePredictedOutput(snippet.expected_output);
  const isCorrect = normalizedPred === normalizedExp;

  if (req.user) {
    db.prepare(
      `INSERT INTO output_prediction_attempts (user_id, snippet_id, predicted_output, is_correct)
       VALUES (?, ?, ?, ?)`
    ).run(req.user.id, snippet.id, parsed.data.predicted_output, isCorrect ? 1 : 0);
  }

  res.json({
    snippet_id: snippet.id,
    is_correct: isCorrect,
    predicted_output: parsed.data.predicted_output,
    expected_output: snippet.expected_output,
    execution_order: snippet.execution_order,
    variable_changes: snippet.variable_changes,
    explanation: snippet.explanation,
  });
});

// ==========================================
// FEATURE 9: INTERVIEW PREPARATION
// ==========================================
router.get('/interview-prep', optionalAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id ?? -1;
  const progMap = new Map<string, { is_reviewed: boolean; confidence: string }>();

  if (userId > 0) {
    const rows = db
      .prepare('SELECT item_id, is_reviewed, confidence FROM interview_prep_progress WHERE user_id = ?')
      .all(userId) as { item_id: string; is_reviewed: number; confidence: string }[];
    for (const r of rows) {
      progMap.set(r.item_id, { is_reviewed: Boolean(r.is_reviewed), confidence: r.confidence });
    }
  }

  const linkedSlugs = Array.from(
    new Set(INTERVIEW_PREP_ITEMS.map((i) => i.linked_problem_slug).filter((s): s is string => Boolean(s)))
  );
  const questionMap = new Map<string, Record<string, unknown>>();
  for (const slug of linkedSlugs) {
    const qRow = db
      .prepare(
        `SELECT q.id, q.question_number, q.slug, q.title, q.difficulty,
                COALESCE(uqp.status, 'Not Started') AS status
         FROM questions q
         LEFT JOIN user_question_progress uqp ON uqp.question_id = q.id AND uqp.user_id = ?
         WHERE q.slug = ?`
      )
      .get(userId, slug) as Record<string, unknown> | undefined;
    if (qRow) questionMap.set(slug, qRow);
  }

  const items = INTERVIEW_PREP_ITEMS.map((item) => {
    const p = progMap.get(item.id);
    return {
      ...item,
      is_reviewed: p?.is_reviewed ?? false,
      confidence: (p?.confidence as 'Low' | 'Medium' | 'High') ?? 'Medium',
      linked_question: item.linked_problem_slug ? questionMap.get(item.linked_problem_slug) ?? null : null,
    };
  });

  const topicsMap = new Map<string, { topic: string; topic_order: number; total: number; reviewed: number }>();
  for (const item of items) {
    const cur = topicsMap.get(item.topic) ?? {
      topic: item.topic,
      topic_order: item.topic_order,
      total: 0,
      reviewed: 0,
    };
    cur.total += 1;
    if (item.is_reviewed) cur.reviewed += 1;
    topicsMap.set(item.topic, cur);
  }

  res.json({
    topics: Array.from(topicsMap.values()).sort((a, b) => a.topic_order - b.topic_order),
    items,
  });
});

router.put('/interview-prep/:id/progress', requireAuth, (req: AuthenticatedRequest, res) => {
  const item = INTERVIEW_PREP_ITEMS.find((i) => i.id === req.params.id);
  if (!item) {
    res.status(404).json({ detail: 'Interview prep item not found.' });
    return;
  }
  const schema = z.object({
    is_reviewed: z.boolean(),
    confidence: z.enum(['Low', 'Medium', 'High']),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: 'Invalid interview prep update.' });
    return;
  }

  db.prepare(
    `INSERT INTO interview_prep_progress (user_id, item_id, is_reviewed, confidence, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, item_id) DO UPDATE SET
       is_reviewed = excluded.is_reviewed,
       confidence = excluded.confidence,
       updated_at = datetime('now')`
  ).run(req.user!.id, item.id, parsed.data.is_reviewed ? 1 : 0, parsed.data.confidence);

  res.json({ ok: true, item_id: item.id, ...parsed.data });
});

// ==========================================
// FEATURE 10: PERSONAL PYTHON ROADMAP
// ==========================================
router.get('/roadmap', optionalAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id ?? -1;

  const categories = db
    .prepare(
      `SELECT c.id, c.slug, c.order_index, c.name, c.description,
              COUNT(DISTINCT q.id) AS total_count,
              COUNT(DISTINCT CASE WHEN uqp.status = 'Solved' THEN q.id END) AS solved_count
       FROM categories c
       LEFT JOIN questions q ON q.category_id = c.id
       LEFT JOIN user_question_progress uqp ON uqp.question_id = q.id AND uqp.user_id = ?
       GROUP BY c.id
       ORDER BY c.order_index ASC`
    )
    .all(userId) as Record<string, unknown>[];

  const concepts = db
    .prepare(
      `SELECT con.id, con.category_id, con.slug, con.order_index, con.name, con.summary,
              c.slug AS category_slug, c.name AS category_name, c.order_index AS category_order,
              COUNT(DISTINCT q.id) AS total_count,
              COUNT(DISTINCT CASE WHEN uqp.status = 'Solved' THEN q.id END) AS solved_count,
              (SELECT COUNT(*) FROM user_submissions s JOIN questions sq ON sq.id = s.question_id WHERE sq.concept_id = con.id AND s.user_id = ? AND s.status != 'Accepted') AS failed_subs,
              (SELECT COUNT(*) FROM user_hint_usage uh JOIN questions hq ON hq.id = uh.question_id WHERE hq.concept_id = con.id AND uh.user_id = ?) AS hints_used
       FROM concepts con
       JOIN categories c ON c.id = con.category_id
       LEFT JOIN questions q ON q.concept_id = con.id
       LEFT JOIN user_question_progress uqp ON uqp.question_id = q.id AND uqp.user_id = ?
       GROUP BY con.id
       ORDER BY c.order_index ASC, con.order_index ASC`
    )
    .all(userId, userId, userId) as Record<string, unknown>[];

  const conceptsByCategory = new Map<number, Record<string, unknown>[]>();
  const enrichedConcepts: Array<Record<string, unknown> & { completion_pct: number; is_completed: boolean; failed_subs: unknown; hints_used: unknown }> = concepts.map((con) => {
    const total = Number(con.total_count) || 0;
    const solved = Number(con.solved_count) || 0;
    const completionPct = total > 0 ? Math.round((solved / total) * 1000) / 10 : 0;
    const item = {
      ...con,
      failed_subs: con.failed_subs,
      hints_used: con.hints_used,
      completion_pct: completionPct,
      is_completed: total > 0 && solved >= total,
    };
    const arr = conceptsByCategory.get(Number(con.category_id)) ?? [];
    arr.push(item);
    conceptsByCategory.set(Number(con.category_id), arr);
    return item;
  });

  const modules = categories.map((cat) => {
    const total = Number(cat.total_count) || 0;
    const solved = Number(cat.solved_count) || 0;
    const catConcepts = conceptsByCategory.get(Number(cat.id)) ?? [];
    const completedConcepts = catConcepts.filter((c) => c.is_completed).length;
    return {
      ...cat,
      total_count: total,
      solved_count: solved,
      completion_pct: total > 0 ? Math.round((solved / total) * 1000) / 10 : 0,
      is_completed: total > 0 && solved >= total,
      concept_total: catConcepts.length,
      concept_completed: completedConcepts,
      concepts: catConcepts,
    };
  });

  const recommendedNext = enrichedConcepts.filter((c) => !c.is_completed).slice(0, 4);
  const weakConcepts = enrichedConcepts
    .filter((c) => Number(c.failed_subs) > 0 || Number(c.hints_used) > 0)
    .sort((a, b) => Number(b.failed_subs) * 2 + Number(b.hints_used) - (Number(a.failed_subs) * 2 + Number(a.hints_used)))
    .slice(0, 6);

  const diffRows = db
    .prepare(
      `SELECT q.difficulty,
              COUNT(q.id) AS total_count,
              SUM(CASE WHEN uqp.status = 'Solved' THEN 1 ELSE 0 END) AS solved_count
       FROM questions q
       LEFT JOIN user_question_progress uqp ON uqp.question_id = q.id AND uqp.user_id = ?
       GROUP BY q.difficulty`
    )
    .all(userId) as { difficulty: string; total_count: number; solved_count: number | null }[];

  const totalQuestions = modules.reduce((acc, m) => acc + m.total_count, 0);
  const solvedQuestions = modules.reduce((acc, m) => acc + m.solved_count, 0);
  const completedModules = modules.filter((m) => m.is_completed).length;
  const completedConceptsCount = enrichedConcepts.filter((c) => c.is_completed).length;

  res.json({
    summary: {
      modules_completed: completedModules,
      modules_total: modules.length,
      concepts_completed: completedConceptsCount,
      concepts_total: enrichedConcepts.length,
      questions_solved: solvedQuestions,
      questions_total: totalQuestions,
      overall_pct: totalQuestions > 0 ? Math.round((solvedQuestions / totalQuestions) * 1000) / 10 : 0,
    },
    difficulty_progress: diffRows.map((d) => ({
      difficulty: d.difficulty,
      total: d.total_count,
      solved: d.solved_count || 0,
      pct: d.total_count > 0 ? Math.round(((d.solved_count || 0) / d.total_count) * 1000) / 10 : 0,
    })),
    recommended_next_concepts: recommendedNext,
    weak_concepts: weakConcepts,
    modules,
  });
});

// ==========================================
// FEATURE 11: DAILY CHALLENGE
// ==========================================
function computeDailyStreak(userId: number): number {
  const rows = db
    .prepare('SELECT challenge_date FROM daily_challenge_completions WHERE user_id = ? ORDER BY challenge_date DESC')
    .all(userId) as { challenge_date: string }[];
  if (rows.length === 0) return 0;

  const set = new Set(rows.map((r) => r.challenge_date));
  const now = new Date();
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const todayIso = cursor.toISOString().slice(0, 10);

  if (!set.has(todayIso)) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (!set.has(cursor.toISOString().slice(0, 10))) return 0;
  }

  let streak = 0;
  while (set.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

router.get('/daily-challenge', optionalAuth, (req: AuthenticatedRequest, res) => {
  const today = getTodayUtcDate();
  const questionId = getDailyChallengeQuestionId(today);
  if (!questionId) {
    res.status(404).json({ detail: 'No questions available for daily challenge.' });
    return;
  }

  const userId = req.user?.id ?? -1;
  const q = db
    .prepare(
      `SELECT q.id, q.question_number, q.slug, q.title, q.difficulty, q.question_type,
              q.problem_statement, c.name AS category_name, c.slug AS category_slug,
              con.name AS concept_name, COALESCE(uqp.status, 'Not Started') AS progress_status
       FROM questions q
       JOIN categories c ON c.id = q.category_id
       JOIN concepts con ON con.id = q.concept_id
       LEFT JOIN user_question_progress uqp ON uqp.question_id = q.id AND uqp.user_id = ?
       WHERE q.id = ?`
    )
    .get(userId, questionId) as Record<string, unknown>;

  let completion: Record<string, unknown> | undefined;
  let totalCompleted = 0;
  let dailyStreak = 0;
  let recentCompletions: Record<string, unknown>[] = [];

  if (userId > 0) {
    completion = db
      .prepare('SELECT challenge_date, status, submission_id, completed_at FROM daily_challenge_completions WHERE user_id = ? AND challenge_date = ?')
      .get(userId, today) as Record<string, unknown> | undefined;
    totalCompleted = (
      db.prepare('SELECT COUNT(*) AS cnt FROM daily_challenge_completions WHERE user_id = ?').get(userId) as { cnt: number }
    ).cnt;
    dailyStreak = computeDailyStreak(userId);
    recentCompletions = db
      .prepare(
        `SELECT dc.challenge_date, dc.status, dc.completed_at, q.question_number, q.slug, q.title, q.difficulty
         FROM daily_challenge_completions dc
         JOIN questions q ON q.id = dc.question_id
         WHERE dc.user_id = ?
         ORDER BY dc.challenge_date DESC
         LIMIT 7`
      )
      .all(userId) as Record<string, unknown>[];
  }

  res.json({
    date: today,
    question: q,
    is_completed: Boolean(completion),
    completion: completion ?? null,
    daily_streak: dailyStreak,
    total_completed: totalCompleted,
    recent_completions: recentCompletions,
  });
});

// ==========================================
// FEATURE 12: PERSONAL NOTES
// ==========================================
router.get('/notes', requireAuth, (req: AuthenticatedRequest, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
  const type = typeof req.query.type === 'string' ? req.query.type.trim() : '';

  const where = ['user_id = ?'];
  const params: SQLInputValue[] = [req.user!.id];

  if (type && ['concept', 'question', 'interview', 'pattern'].includes(type)) {
    where.push('target_type = ?');
    params.push(type);
  }
  if (q) {
    where.push('(lower(title) LIKE ? OR lower(content) LIKE ? OR lower(tags) LIKE ? OR lower(target_ref) LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  const notes = db
    .prepare(
      `SELECT id, target_type, target_ref, title, content, tags, created_at, updated_at
       FROM user_notes
       WHERE ${where.join(' AND ')}
       ORDER BY updated_at DESC, id DESC`
    )
    .all(...params);

  res.json({ notes });
});

router.post('/notes', requireAuth, (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    target_type: z.enum(['concept', 'question', 'interview', 'pattern']),
    target_ref: z.string().max(160).default(''),
    title: z.string().min(1).max(200),
    content: z.string().min(1).max(12000),
    tags: z.string().max(255).default(''),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.issues[0]?.message || 'Invalid note payload.' });
    return;
  }

  const d = parsed.data;
  const result = db
    .prepare(
      `INSERT INTO user_notes (user_id, target_type, target_ref, title, content, tags)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(req.user!.id, d.target_type, d.target_ref, d.title.trim(), d.content.trim(), d.tags.trim());

  const note = db.prepare('SELECT * FROM user_notes WHERE id = ?').get(Number(result.lastInsertRowid));
  res.status(201).json({ note });
});

router.put('/notes/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const noteId = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM user_notes WHERE id = ? AND user_id = ?').get(noteId, req.user!.id);
  if (!existing) {
    res.status(404).json({ detail: 'Note not found.' });
    return;
  }

  const schema = z.object({
    target_type: z.enum(['concept', 'question', 'interview', 'pattern']).optional(),
    target_ref: z.string().max(160).optional(),
    title: z.string().min(1).max(200),
    content: z.string().min(1).max(12000),
    tags: z.string().max(255).default(''),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.issues[0]?.message || 'Invalid note payload.' });
    return;
  }

  const d = parsed.data;
  db.prepare(
    `UPDATE user_notes
     SET target_type = COALESCE(?, target_type),
         target_ref = COALESCE(?, target_ref),
         title = ?,
         content = ?,
         tags = ?,
         updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  ).run(d.target_type ?? null, d.target_ref ?? null, d.title.trim(), d.content.trim(), d.tags.trim(), noteId, req.user!.id);

  const note = db.prepare('SELECT * FROM user_notes WHERE id = ?').get(noteId);
  res.json({ note });
});

router.delete('/notes/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const noteId = Number(req.params.id);
  const info = db.prepare('DELETE FROM user_notes WHERE id = ? AND user_id = ?').run(noteId, req.user!.id);
  if (info.changes === 0) {
    res.status(404).json({ detail: 'Note not found.' });
    return;
  }
  res.json({ ok: true });
});

export default router;
