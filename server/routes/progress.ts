import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.ts';
import { optionalAuth, requireAuth, type AuthenticatedRequest } from '../auth.ts';

const router = Router();

function resolveQuestionId(idOrSlug: string): number | null {
  const isNum = /^\d+$/.test(idOrSlug);
  const row = db
    .prepare(`SELECT id FROM questions WHERE ${isNum ? 'id = ?' : 'slug = ?'}`)
    .get(isNum ? Number(idOrSlug) : idOrSlug) as { id: number } | undefined;
  return row ? row.id : null;
}

function computeStreak(userId: number): number {
  const rows = db
    .prepare(
      `SELECT activity_date FROM user_activity
       WHERE user_id = ? AND submissions_count > 0
       ORDER BY activity_date DESC`
    )
    .all(userId) as { activity_date: string }[];

  if (rows.length === 0) return 0;

  const dateSet = new Set(rows.map((r) => r.activity_date));
  const today = new Date();
  let cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const todayIso = cursor.toISOString().slice(0, 10);

  if (!dateSet.has(todayIso)) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    const yesterdayIso = cursor.toISOString().slice(0, 10);
    if (!dateSet.has(yesterdayIso)) return 0;
  }

  let streak = 0;
  while (dateSet.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

function buildOverview(userId: number) {
  const totals = db
    .prepare(
      `SELECT
         COUNT(*) AS total_questions,
         SUM(CASE WHEN difficulty = 'Easy' THEN 1 ELSE 0 END) AS easy_total,
         SUM(CASE WHEN difficulty = 'Medium' THEN 1 ELSE 0 END) AS medium_total,
         SUM(CASE WHEN difficulty = 'Hard' THEN 1 ELSE 0 END) AS hard_total
       FROM questions`
    )
    .get() as { total_questions: number; easy_total: number; medium_total: number; hard_total: number };

  if (userId <= 0) {
    return {
      total_questions: totals.total_questions,
      solved_questions: 0,
      attempted_questions: 0,
      pending_questions: totals.total_questions,
      revision_questions: 0,
      bookmarked_questions: 0,
      mastery_percentage: 0,
      current_streak: 0,
      difficulty: {
        Easy: { solved: 0, total: totals.easy_total },
        Medium: { solved: 0, total: totals.medium_total },
        Hard: { solved: 0, total: totals.hard_total },
      },
    };
  }

  const stats = db
    .prepare(
      `SELECT
         SUM(CASE WHEN uqp.status = 'Solved' THEN 1 ELSE 0 END) AS solved_count,
         SUM(CASE WHEN uqp.status = 'Attempted' THEN 1 ELSE 0 END) AS attempted_count,
         SUM(CASE WHEN uqp.status = 'Solved' AND q.difficulty = 'Easy' THEN 1 ELSE 0 END) AS easy_solved,
         SUM(CASE WHEN uqp.status = 'Solved' AND q.difficulty = 'Medium' THEN 1 ELSE 0 END) AS medium_solved,
         SUM(CASE WHEN uqp.status = 'Solved' AND q.difficulty = 'Hard' THEN 1 ELSE 0 END) AS hard_solved
       FROM user_question_progress uqp
       JOIN questions q ON q.id = uqp.question_id
       WHERE uqp.user_id = ?`
    )
    .get(userId) as {
    solved_count: number | null;
    attempted_count: number | null;
    easy_solved: number | null;
    medium_solved: number | null;
    hard_solved: number | null;
  };

  const revCount = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT question_id) AS cnt FROM (
           SELECT question_id FROM user_revisions WHERE user_id = ?
           UNION
           SELECT question_id FROM user_question_progress WHERE user_id = ? AND status = 'Needs Revision'
         )`
      )
      .get(userId, userId) as { cnt: number }
  ).cnt;

  const bmCount = (
    db.prepare('SELECT COUNT(*) AS cnt FROM user_bookmarks WHERE user_id = ?').get(userId) as { cnt: number }
  ).cnt;

  const solved = stats.solved_count || 0;
  const attempted = stats.attempted_count || 0;
  const pending = Math.max(0, totals.total_questions - solved);
  const masteryPct = totals.total_questions > 0 ? Math.round((solved / totals.total_questions) * 1000) / 10 : 0;

  return {
    total_questions: totals.total_questions,
    solved_questions: solved,
    attempted_questions: attempted,
    pending_questions: pending,
    revision_questions: revCount,
    bookmarked_questions: bmCount,
    mastery_percentage: masteryPct,
    current_streak: computeStreak(userId),
    difficulty: {
      Easy: { solved: stats.easy_solved || 0, total: totals.easy_total },
      Medium: { solved: stats.medium_solved || 0, total: totals.medium_total },
      Hard: { solved: stats.hard_solved || 0, total: totals.hard_total },
    },
  };
}

function buildCategoryProgress(userId: number) {
  return db
    .prepare(
      `SELECT
         c.id, c.slug, c.order_index, c.name,
         COUNT(q.id) AS total_count,
         SUM(CASE WHEN uqp.status = 'Solved' THEN 1 ELSE 0 END) AS solved_count,
         SUM(CASE WHEN uqp.status = 'Attempted' THEN 1 ELSE 0 END) AS attempted_count
       FROM categories c
       LEFT JOIN questions q ON q.category_id = c.id
       LEFT JOIN user_question_progress uqp ON uqp.question_id = q.id AND uqp.user_id = ?
       GROUP BY c.id
       ORDER BY c.order_index ASC`
    )
    .all(userId)
    .map((r: Record<string, unknown>) => {
      const total = Number(r.total_count) || 0;
      const solved = Number(r.solved_count) || 0;
      return {
        ...r,
        completion_pct: total > 0 ? Math.round((solved / total) * 1000) / 10 : 0,
      };
    });
}

router.get('/progress', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json(buildOverview(req.user!.id));
});

router.put('/progress/:questionId', requireAuth, (req: AuthenticatedRequest, res) => {
  const qId = resolveQuestionId(String(req.params.questionId));
  if (!qId) {
    res.status(404).json({ detail: 'Question not found.' });
    return;
  }
  const schema = z.object({
    status: z.enum(['Not Started', 'Attempted', 'Solved', 'Needs Revision']),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: 'Invalid progress status.' });
    return;
  }

  db.prepare(
    `INSERT INTO user_question_progress (user_id, question_id, status, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, question_id) DO UPDATE SET
       status = excluded.status,
       updated_at = datetime('now')`
  ).run(req.user!.id, qId, parsed.data.status);

  res.json({ ok: true, status: parsed.data.status });
});

router.get('/progress/categories', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ categories: buildCategoryProgress(req.user!.id) });
});

// Bookmarks
router.get('/bookmarks', requireAuth, (req: AuthenticatedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT q.id, q.question_number, q.slug, q.title, q.difficulty, q.question_type,
              c.name AS category_name, c.slug AS category_slug,
              con.name AS concept_name,
              COALESCE(uqp.status, 'Not Started') AS status,
              ub.created_at AS bookmarked_at
       FROM user_bookmarks ub
       JOIN questions q ON q.id = ub.question_id
       JOIN categories c ON c.id = q.category_id
       JOIN concepts con ON con.id = q.concept_id
       LEFT JOIN user_question_progress uqp ON uqp.question_id = q.id AND uqp.user_id = ub.user_id
       WHERE ub.user_id = ?
       ORDER BY ub.created_at DESC`
    )
    .all(req.user!.id);
  res.json({ bookmarks: rows });
});

router.post('/bookmarks/:questionId', requireAuth, (req: AuthenticatedRequest, res) => {
  const qId = resolveQuestionId(String(req.params.questionId));
  if (!qId) {
    res.status(404).json({ detail: 'Question not found.' });
    return;
  }
  db.prepare(
    `INSERT OR IGNORE INTO user_bookmarks (user_id, question_id) VALUES (?, ?)`
  ).run(req.user!.id, qId);
  res.status(201).json({ ok: true, bookmarked: true });
});

router.delete('/bookmarks/:questionId', requireAuth, (req: AuthenticatedRequest, res) => {
  const qId = resolveQuestionId(String(req.params.questionId));
  if (!qId) {
    res.status(404).json({ detail: 'Question not found.' });
    return;
  }
  db.prepare('DELETE FROM user_bookmarks WHERE user_id = ? AND question_id = ?').run(req.user!.id, qId);
  res.json({ ok: true, bookmarked: false });
});

function getRevisionSettingsForUser(userId: number) {
  const row = db
    .prepare(
      `SELECT incorrect_interval_days, hinted_interval_days, independent_interval_days, forgotten_interval_days
       FROM user_revision_settings WHERE user_id = ?`
    )
    .get(userId) as
    | {
        incorrect_interval_days: number;
        hinted_interval_days: number;
        independent_interval_days: number;
        forgotten_interval_days: number;
      }
    | undefined;
  return (
    row ?? {
      incorrect_interval_days: 1,
      hinted_interval_days: 2,
      independent_interval_days: 7,
      forgotten_interval_days: 1,
    }
  );
}

// Revisions
router.get('/revisions', requireAuth, (req: AuthenticatedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT q.id, q.question_number, q.slug, q.title, q.difficulty, q.question_type,
              c.name AS category_name, c.slug AS category_slug,
              con.name AS concept_name,
              COALESCE(uqp.status, 'Needs Revision') AS status,
              ur.notes, ur.priority, ur.interval_days, ur.next_review_at, ur.last_reviewed_at,
              ur.review_count, ur.reason, ur.updated_at AS revision_updated_at,
              CASE WHEN ur.next_review_at IS NULL OR ur.next_review_at <= datetime('now') THEN 1 ELSE 0 END AS is_due
       FROM user_revisions ur
       JOIN questions q ON q.id = ur.question_id
       JOIN categories c ON c.id = q.category_id
       JOIN concepts con ON con.id = q.concept_id
       LEFT JOIN user_question_progress uqp ON uqp.question_id = q.id AND uqp.user_id = ur.user_id
       WHERE ur.user_id = ?
       ORDER BY is_due DESC, CASE ur.priority WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END, ur.updated_at DESC`
    )
    .all(req.user!.id);
  res.json({ revisions: rows });
});

router.get('/revisions/settings', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ settings: getRevisionSettingsForUser(req.user!.id) });
});

router.put('/revisions/settings', requireAuth, (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    incorrect_interval_days: z.number().int().min(1).max(60),
    hinted_interval_days: z.number().int().min(1).max(60),
    independent_interval_days: z.number().int().min(1).max(90),
    forgotten_interval_days: z.number().int().min(1).max(30),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.issues[0]?.message || 'Invalid interval settings.' });
    return;
  }
  const s = parsed.data;
  db.prepare(
    `INSERT INTO user_revision_settings (
       user_id, incorrect_interval_days, hinted_interval_days, independent_interval_days, forgotten_interval_days, updated_at
     ) VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET
       incorrect_interval_days = excluded.incorrect_interval_days,
       hinted_interval_days = excluded.hinted_interval_days,
       independent_interval_days = excluded.independent_interval_days,
       forgotten_interval_days = excluded.forgotten_interval_days,
       updated_at = datetime('now')`
  ).run(req.user!.id, s.incorrect_interval_days, s.hinted_interval_days, s.independent_interval_days, s.forgotten_interval_days);

  res.json({ ok: true, settings: s });
});

router.get('/revisions/dashboard', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const settings = getRevisionSettingsForUser(userId);

  const queued = db
    .prepare(
      `SELECT q.id, q.question_number, q.slug, q.title, q.difficulty, q.question_type,
              c.name AS category_name, c.slug AS category_slug,
              con.name AS concept_name,
              COALESCE(uqp.status, 'Needs Revision') AS status,
              ur.notes, ur.priority, ur.interval_days, ur.next_review_at, ur.last_reviewed_at,
              ur.review_count, ur.reason, ur.updated_at AS revision_updated_at,
              CASE WHEN ur.next_review_at IS NULL OR ur.next_review_at <= datetime('now') THEN 1 ELSE 0 END AS is_due
       FROM user_revisions ur
       JOIN questions q ON q.id = ur.question_id
       JOIN categories c ON c.id = q.category_id
       JOIN concepts con ON con.id = q.concept_id
       LEFT JOIN user_question_progress uqp ON uqp.question_id = q.id AND uqp.user_id = ur.user_id
       WHERE ur.user_id = ?
       ORDER BY is_due DESC, CASE ur.priority WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END, ur.updated_at DESC`
    )
    .all(userId) as Record<string, unknown>[];

  const incorrectSuggestions = db
    .prepare(
      `SELECT q.id, q.question_number, q.slug, q.title, q.difficulty, c.name AS category_name, con.name AS concept_name,
              COUNT(s.id) AS fail_count, MAX(s.created_at) AS last_failed_at
       FROM user_submissions s
       JOIN questions q ON q.id = s.question_id
       JOIN categories c ON c.id = q.category_id
       JOIN concepts con ON con.id = q.concept_id
       WHERE s.user_id = ? AND s.status != 'Accepted'
       GROUP BY q.id
       ORDER BY last_failed_at DESC
       LIMIT 12`
    )
    .all(userId);

  const hintedSuggestions = db
    .prepare(
      `SELECT q.id, q.question_number, q.slug, q.title, q.difficulty, c.name AS category_name, con.name AS concept_name,
              COUNT(uh.id) AS hints_count, MAX(uh.used_at) AS last_hint_at
       FROM user_hint_usage uh
       JOIN questions q ON q.id = uh.question_id
       JOIN categories c ON c.id = q.category_id
       JOIN concepts con ON con.id = q.concept_id
       WHERE uh.user_id = ?
       GROUP BY q.id
       ORDER BY last_hint_at DESC
       LIMIT 12`
    )
    .all(userId);

  const independentSuggestions = db
    .prepare(
      `SELECT q.id, q.question_number, q.slug, q.title, q.difficulty, c.name AS category_name, con.name AS concept_name,
              uqp.solved_at
       FROM user_question_progress uqp
       JOIN questions q ON q.id = uqp.question_id
       JOIN categories c ON c.id = q.category_id
       JOIN concepts con ON con.id = q.concept_id
       WHERE uqp.user_id = ? AND uqp.status = 'Solved'
         AND NOT EXISTS (SELECT 1 FROM user_hint_usage uh WHERE uh.user_id = uqp.user_id AND uh.question_id = q.id)
       ORDER BY COALESCE(uqp.solved_at, uqp.updated_at) ASC
       LIMIT 12`
    )
    .all(userId);

  const dueCount = queued.filter((item) => Number(item.is_due) === 1).length;
  const forgottenItems = queued.filter((item) => item.reason === 'forgotten');

  res.json({
    settings,
    summary: {
      total_queued: queued.length,
      due_now: dueCount,
      forgotten_count: forgottenItems.length,
      incorrect_count: incorrectSuggestions.length,
      hinted_count: hintedSuggestions.length,
      independent_count: independentSuggestions.length,
    },
    queued,
    suggestions: {
      due_now: queued.filter((item) => Number(item.is_due) === 1),
      incorrect: incorrectSuggestions,
      hinted: hintedSuggestions,
      independent: independentSuggestions,
      forgotten: forgottenItems,
    },
  });
});

router.post('/revisions/:questionId/review', requireAuth, (req: AuthenticatedRequest, res) => {
  const qId = resolveQuestionId(String(req.params.questionId));
  if (!qId) {
    res.status(404).json({ detail: 'Question not found.' });
    return;
  }
  const schema = z.object({
    outcome: z.enum(['good', 'forgot']),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: 'Review outcome must be good or forgot.' });
    return;
  }

  const userId = req.user!.id;
  const settings = getRevisionSettingsForUser(userId);
  const existing = db
    .prepare('SELECT interval_days, review_count FROM user_revisions WHERE user_id = ? AND question_id = ?')
    .get(userId, qId) as { interval_days: number; review_count: number } | undefined;

  if (parsed.data.outcome === 'forgot') {
    const days = Math.max(1, settings.forgotten_interval_days);
    db.prepare(
      `INSERT INTO user_revisions (
         user_id, question_id, notes, priority, interval_days, next_review_at, last_reviewed_at, review_count, reason, updated_at
       ) VALUES (?, ?, '', 'High', ?, datetime('now', ?), datetime('now'), 1, 'forgotten', datetime('now'))
       ON CONFLICT(user_id, question_id) DO UPDATE SET
         priority = 'High',
         interval_days = excluded.interval_days,
         next_review_at = excluded.next_review_at,
         last_reviewed_at = datetime('now'),
         review_count = review_count + 1,
         reason = 'forgotten',
         updated_at = datetime('now')`
    ).run(userId, qId, days, `+${days} days`);
    res.json({ ok: true, interval_days: days, reason: 'forgotten' });
    return;
  }

  const baseDays = existing ? Math.max(settings.independent_interval_days, existing.interval_days * 2) : settings.independent_interval_days;
  const nextDays = Math.min(30, Math.max(1, baseDays));
  db.prepare(
    `INSERT INTO user_revisions (
       user_id, question_id, notes, priority, interval_days, next_review_at, last_reviewed_at, review_count, reason, updated_at
     ) VALUES (?, ?, '', 'Low', ?, datetime('now', ?), datetime('now'), 1, 'independent', datetime('now'))
     ON CONFLICT(user_id, question_id) DO UPDATE SET
       priority = 'Low',
       interval_days = excluded.interval_days,
       next_review_at = excluded.next_review_at,
       last_reviewed_at = datetime('now'),
       review_count = review_count + 1,
       reason = 'independent',
       updated_at = datetime('now')`
  ).run(userId, qId, nextDays, `+${nextDays} days`);

  res.json({ ok: true, interval_days: nextDays, reason: 'independent' });
});

router.post('/revisions/:questionId', requireAuth, (req: AuthenticatedRequest, res) => {
  const qId = resolveQuestionId(String(req.params.questionId));
  if (!qId) {
    res.status(404).json({ detail: 'Question not found.' });
    return;
  }
  const schema = z.object({
    notes: z.string().max(1000).optional(),
    priority: z.enum(['Low', 'Medium', 'High']).optional(),
  });
  const parsed = schema.safeParse(req.body || {});
  const notes = parsed.success ? parsed.data.notes ?? '' : '';
  const priority = parsed.success ? parsed.data.priority ?? 'Medium' : 'Medium';

  db.prepare(
    `INSERT INTO user_revisions (user_id, question_id, notes, priority, next_review_at, reason, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'), 'manual', datetime('now'))
     ON CONFLICT(user_id, question_id) DO UPDATE SET
       notes = excluded.notes,
       priority = excluded.priority,
       updated_at = datetime('now')`
  ).run(req.user!.id, qId, notes, priority);

  res.status(201).json({ ok: true, revision: true, notes, priority });
});

router.delete('/revisions/:questionId', requireAuth, (req: AuthenticatedRequest, res) => {
  const qId = resolveQuestionId(String(req.params.questionId));
  if (!qId) {
    res.status(404).json({ detail: 'Question not found.' });
    return;
  }
  db.prepare('DELETE FROM user_revisions WHERE user_id = ? AND question_id = ?').run(req.user!.id, qId);
  res.json({ ok: true, revision: false });
});

// Analytics endpoints
router.get('/analytics/overview', optionalAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id ?? -1;
  const overview = buildOverview(userId);

  const recentSubmissions =
    userId > 0
      ? db
          .prepare(
            `SELECT s.id, s.status, s.passed_count, s.total_count, s.execution_time_ms, s.hints_used, s.created_at,
                    q.question_number, q.slug AS question_slug, q.title AS question_title, q.difficulty
             FROM user_submissions s
             JOIN questions q ON q.id = s.question_id
             WHERE s.user_id = ?
             ORDER BY s.id DESC
             LIMIT 6`
          )
          .all(userId)
      : [];

  const continuePractising =
    userId > 0
      ? db
          .prepare(
            `SELECT q.id, q.question_number, q.slug, q.title, q.difficulty, c.name AS category_name,
                    COALESCE(uqp.status, 'Not Started') AS status
             FROM questions q
             JOIN categories c ON c.id = q.category_id
             LEFT JOIN user_question_progress uqp ON uqp.question_id = q.id AND uqp.user_id = ?
             WHERE uqp.status IS NULL OR uqp.status != 'Solved'
             ORDER BY CASE WHEN uqp.status = 'Attempted' THEN 0 ELSE 1 END, q.question_number ASC
             LIMIT 5`
          )
          .all(userId)
      : db
          .prepare(
            `SELECT q.id, q.question_number, q.slug, q.title, q.difficulty, c.name AS category_name,
                    'Not Started' AS status
             FROM questions q
             JOIN categories c ON c.id = q.category_id
             ORDER BY q.question_number ASC
             LIMIT 5`
          )
          .all();

  res.json({
    ...overview,
    recent_submissions: recentSubmissions,
    continue_practising: continuePractising,
  });
});

router.get('/analytics/activity', optionalAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id ?? -1;
  const days = Math.min(90, Math.max(7, Number(req.query.days) || 14));

  const activityMap = new Map<string, { submissions_count: number; solved_count: number }>();
  if (userId > 0) {
    const rows = db
      .prepare('SELECT activity_date, submissions_count, solved_count FROM user_activity WHERE user_id = ?')
      .all(userId) as { activity_date: string; submissions_count: number; solved_count: number }[];
    for (const r of rows) {
      activityMap.set(r.activity_date, {
        submissions_count: r.submissions_count,
        solved_count: r.solved_count,
      });
    }
  }

  const series = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    const iso = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const entry = activityMap.get(iso) || { submissions_count: 0, solved_count: 0 };
    series.push({
      date: iso,
      label,
      submissions: entry.submissions_count,
      solved: entry.solved_count,
    });
  }

  res.json({ activity: series });
});

router.get('/analytics/difficulty', optionalAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id ?? -1;
  const overview = buildOverview(userId);
  res.json({
    difficulty: [
      { difficulty: 'Easy', ...overview.difficulty.Easy },
      { difficulty: 'Medium', ...overview.difficulty.Medium },
      { difficulty: 'Hard', ...overview.difficulty.Hard },
    ],
  });
});

router.get('/analytics/categories', optionalAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id ?? -1;
  res.json({ categories: buildCategoryProgress(userId) });
});

router.get('/analytics/detailed', optionalAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id ?? -1;
  const overview = buildOverview(userId);

  const categoryPerf = db
    .prepare(
      `SELECT c.id, c.slug, c.order_index, c.name,
              COUNT(DISTINCT q.id) AS total_count,
              COUNT(DISTINCT CASE WHEN uqp.status = 'Solved' THEN q.id END) AS solved_count,
              COUNT(DISTINCT CASE WHEN uqp.status = 'Attempted' THEN q.id END) AS attempted_count,
              (SELECT COUNT(*) FROM user_submissions s JOIN questions sq ON sq.id = s.question_id WHERE sq.category_id = c.id AND s.user_id = ?) AS submissions_count,
              (SELECT COUNT(*) FROM user_submissions s JOIN questions sq ON sq.id = s.question_id WHERE sq.category_id = c.id AND s.user_id = ? AND s.status = 'Accepted') AS accepted_count
       FROM categories c
       LEFT JOIN questions q ON q.category_id = c.id
       LEFT JOIN user_question_progress uqp ON uqp.question_id = q.id AND uqp.user_id = ?
       GROUP BY c.id
       ORDER BY c.order_index ASC`
    )
    .all(userId, userId, userId)
    .map((r: Record<string, unknown>) => {
      const total = Number(r.total_count) || 0;
      const solved = Number(r.solved_count) || 0;
      const subs = Number(r.submissions_count) || 0;
      const acc = Number(r.accepted_count) || 0;
      return {
        ...r,
        completion_pct: total > 0 ? Math.round((solved / total) * 1000) / 10 : 0,
        accuracy_pct: subs > 0 ? Math.round((acc / subs) * 1000) / 10 : 0,
      };
    });

  const diffRates = (['Easy', 'Medium', 'Hard'] as const).map((tier) => {
    const row =
      userId > 0
        ? (db
            .prepare(
              `SELECT COUNT(*) AS subs,
                      SUM(CASE WHEN s.status = 'Accepted' THEN 1 ELSE 0 END) AS accepted
               FROM user_submissions s
               JOIN questions q ON q.id = s.question_id
               WHERE s.user_id = ? AND q.difficulty = ?`
            )
            .get(userId, tier) as { subs: number; accepted: number | null })
        : { subs: 0, accepted: 0 };
    const subs = row.subs || 0;
    const accepted = row.accepted || 0;
    return {
      difficulty: tier,
      solved: overview.difficulty[tier].solved,
      total: overview.difficulty[tier].total,
      submissions: subs,
      accepted,
      success_rate_pct: subs > 0 ? Math.round((accepted / subs) * 1000) / 10 : 0,
    };
  });

  const failedQuestions =
    userId > 0
      ? db
          .prepare(
            `SELECT q.id, q.question_number, q.slug, q.title, q.difficulty, c.name AS category_name,
                    COUNT(*) AS fail_count,
                    (SELECT COUNT(*) FROM user_submissions s2 WHERE s2.user_id = ? AND s2.question_id = q.id) AS total_attempts,
                    MAX(s.created_at) AS last_failed_at,
                    COALESCE(uqp.status, 'Attempted') AS current_status
             FROM user_submissions s
             JOIN questions q ON q.id = s.question_id
             JOIN categories c ON c.id = q.category_id
             LEFT JOIN user_question_progress uqp ON uqp.question_id = q.id AND uqp.user_id = s.user_id
             WHERE s.user_id = ? AND s.status != 'Accepted'
             GROUP BY q.id
             ORDER BY fail_count DESC, last_failed_at DESC
             LIMIT 10`
          )
          .all(userId, userId)
      : [];

  let hintStats = {
    total_hints_revealed: 0,
    questions_with_hints: 0,
    solved_independently: 0,
    solved_with_hints: 0,
  };
  let revisionStats = {
    total_queued: 0,
    due_now: 0,
    total_reviews: 0,
    forgotten_count: 0,
    avg_interval_days: 0,
  };
  let mockInterviewStats = {
    completed_count: 0,
    avg_score_pct: 0,
    best_score_pct: 0,
    recent_sessions: [] as Record<string, unknown>[],
  };

  if (userId > 0) {
    const hTotal = db
      .prepare('SELECT COUNT(*) AS total_hints, COUNT(DISTINCT question_id) AS q_count FROM user_hint_usage WHERE user_id = ?')
      .get(userId) as { total_hints: number; q_count: number };
    const hSolved = db
      .prepare(
        `SELECT
           SUM(CASE WHEN EXISTS (SELECT 1 FROM user_hint_usage uh WHERE uh.user_id = uqp.user_id AND uh.question_id = uqp.question_id) THEN 1 ELSE 0 END) AS with_hints,
           SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM user_hint_usage uh WHERE uh.user_id = uqp.user_id AND uh.question_id = uqp.question_id) THEN 1 ELSE 0 END) AS independent
         FROM user_question_progress uqp
         WHERE uqp.user_id = ? AND uqp.status = 'Solved'`
      )
      .get(userId) as { with_hints: number | null; independent: number | null };
    hintStats = {
      total_hints_revealed: hTotal.total_hints || 0,
      questions_with_hints: hTotal.q_count || 0,
      solved_independently: hSolved.independent || 0,
      solved_with_hints: hSolved.with_hints || 0,
    };

    const rRow = db
      .prepare(
        `SELECT COUNT(*) AS total_queued,
                SUM(CASE WHEN next_review_at IS NULL OR next_review_at <= datetime('now') THEN 1 ELSE 0 END) AS due_now,
                SUM(review_count) AS total_reviews,
                SUM(CASE WHEN reason = 'forgotten' THEN 1 ELSE 0 END) AS forgotten_count,
                AVG(interval_days) AS avg_interval
         FROM user_revisions WHERE user_id = ?`
      )
      .get(userId) as {
      total_queued: number;
      due_now: number | null;
      total_reviews: number | null;
      forgotten_count: number | null;
      avg_interval: number | null;
    };
    revisionStats = {
      total_queued: rRow.total_queued || 0,
      due_now: rRow.due_now || 0,
      total_reviews: rRow.total_reviews || 0,
      forgotten_count: rRow.forgotten_count || 0,
      avg_interval_days: rRow.avg_interval ? Math.round(rRow.avg_interval * 10) / 10 : 0,
    };

    const mAgg = db
      .prepare(
        `SELECT COUNT(*) AS cnt, AVG(score_pct) AS avg_score, MAX(score_pct) AS best_score
         FROM mock_interviews WHERE user_id = ? AND status = 'completed'`
      )
      .get(userId) as { cnt: number; avg_score: number | null; best_score: number | null };
    const mRecent = db
      .prepare(
        `SELECT id, difficulty, category_slug, duration_minutes, score_pct, passed_questions, total_questions, time_spent_seconds, completed_at
         FROM mock_interviews WHERE user_id = ? AND status = 'completed'
         ORDER BY id DESC LIMIT 6`
      )
      .all(userId) as Record<string, unknown>[];
    mockInterviewStats = {
      completed_count: mAgg.cnt || 0,
      avg_score_pct: mAgg.avg_score ? Math.round(mAgg.avg_score * 10) / 10 : 0,
      best_score_pct: mAgg.best_score ? Math.round(mAgg.best_score * 10) / 10 : 0,
      recent_sessions: mRecent,
    };
  }

  // Weekly coding activity (last 8 weeks)
  const weeklyActivity: { week: string; submissions: number; solved: number }[] = [];
  const now = new Date();
  for (let w = 7; w >= 0; w--) {
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - w * 7));
    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - 6));
    const startIso = start.toISOString().slice(0, 10);
    const endIso = end.toISOString().slice(0, 10);
    const agg =
      userId > 0
        ? (db
            .prepare(
              `SELECT SUM(submissions_count) AS subs, SUM(solved_count) AS solved
               FROM user_activity
               WHERE user_id = ? AND activity_date >= ? AND activity_date <= ?`
            )
            .get(userId, startIso, endIso) as { subs: number | null; solved: number | null })
        : { subs: 0, solved: 0 };
    weeklyActivity.push({
      week: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
      submissions: agg.subs || 0,
      solved: agg.solved || 0,
    });
  }

  res.json({
    overview,
    category_performance: categoryPerf,
    difficulty_success: diffRates,
    failed_questions: failedQuestions,
    hint_stats: hintStats,
    revision_stats: revisionStats,
    weekly_activity: weeklyActivity,
    mock_interview_stats: mockInterviewStats,
  });
});

export default router;

