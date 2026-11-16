import { Router } from 'express';
import type { SQLInputValue } from 'node:sqlite';
import { z } from 'zod';
import { db } from '../db.ts';
import { requireAuth, type AuthenticatedRequest } from '../auth.ts';
import { getDailyChallengeQuestionId, getTodayUtcDate } from '../lib/dailyChallenge.ts';
import type { EvaluationMode } from '../types.ts';

const router = Router();
const MAX_SOURCE_BYTES = 65536;
const PYODIDE_ENGINE_NAME = 'Pyodide WebAssembly (Browser Worker)';

// Simple sliding-window in-memory rate limiter (60 submissions/min per user)
const rateBuckets = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const timestamps = (rateBuckets.get(key) || []).filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX) {
    rateBuckets.set(key, timestamps);
    return false;
  }
  timestamps.push(now);
  rateBuckets.set(key, timestamps);
  return true;
}

function getQuestionForExecution(idOrSlug: string | number) {
  const str = String(idOrSlug);
  const isNum = /^\d+$/.test(str);
  return db
    .prepare(`SELECT id, slug, title, evaluation_mode, function_name FROM questions WHERE ${isNum ? 'id = ?' : 'slug = ?'}`)
    .get(isNum ? Number(str) : str) as
    | {
        id: number;
        slug: string;
        title: string;
        evaluation_mode: EvaluationMode;
        function_name: string | null;
      }
    | undefined;
}

const testCaseResultSchema = z.object({
  test_case_id: z.number().int(),
  order_index: z.number().int(),
  description: z.string().max(500),
  is_hidden: z.boolean(),
  passed: z.boolean(),
  verdict: z.enum(['Passed', 'Failed', 'Runtime Error', 'Time Limit Exceeded', 'Memory Limit Exceeded']).optional(),
  status: z.enum([
    'Accepted',
    'Wrong Answer',
    'Runtime Error',
    'Time Limit Exceeded',
    'Memory Limit Exceeded',
    'Initialization Error',
    'Internal Execution Error',
  ]),
  input: z.string().max(65536).optional(),
  expected_output: z.string().max(65536).optional(),
  actual_output: z.string().max(65536).optional(),
  error: z.string().max(65536).optional(),
  execution_time_ms: z.number().int().min(0),
});

const submitSchema = z.object({
  question_id: z.union([z.number().int().positive(), z.string().min(1)]),
  source_code: z.string().min(1).max(MAX_SOURCE_BYTES),
  status: z.enum([
    'Accepted',
    'Wrong Answer',
    'Runtime Error',
    'Time Limit Exceeded',
    'Memory Limit Exceeded',
    'Initialization Error',
    'Internal Execution Error',
  ]),
  passed_count: z.number().int().min(0),
  total_count: z.number().int().min(0),
  execution_time_ms: z.number().int().min(0),
  memory_kb: z.number().int().min(0).default(16384),
  error_output: z.string().max(65536).default(''),
  results: z.array(testCaseResultSchema).max(200),
  engine: z.string().max(120).optional(),
  hints_used: z.array(z.number().int().min(1).max(3)).max(3).optional(),
});

router.post('/execute/submit', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  if (!checkRateLimit(`user:${userId}`)) {
    res.status(429).json({ detail: 'Submission rate limit exceeded. Please wait a moment.' });
    return;
  }

  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.issues[0]?.message || 'Invalid submission payload.' });
    return;
  }

  const question = getQuestionForExecution(parsed.data.question_id);
  if (!question) {
    res.status(404).json({ detail: 'Question not found.' });
    return;
  }

  const expectedCountRow = db
    .prepare('SELECT COUNT(*) AS cnt FROM question_test_cases WHERE question_id = ?')
    .get(question.id) as { cnt: number };

  const sanitizedResults = parsed.data.results.map((r) =>
    r.is_hidden
      ? {
          test_case_id: r.test_case_id,
          order_index: r.order_index,
          description: `Hidden Test Case #${r.order_index}`,
          is_hidden: true,
          passed: r.passed,
          verdict: r.verdict,
          status: r.status,
          execution_time_ms: r.execution_time_ms,
        }
      : r
  );

  const totalCount = parsed.data.total_count;
  const passedCount = Math.min(parsed.data.passed_count, totalCount);
  const isAccepted =
    parsed.data.status === 'Accepted' &&
    totalCount > 0 &&
    totalCount === expectedCountRow.cnt &&
    passedCount === totalCount;
  const today = getTodayUtcDate();
  const clientHints = parsed.data.hints_used ?? [];
  const dbHintRows = db
    .prepare('SELECT hint_order FROM user_hint_usage WHERE user_id = ? AND question_id = ? ORDER BY hint_order ASC')
    .all(userId, question.id) as { hint_order: number }[];
  const mergedHints = Array.from(new Set([...dbHintRows.map((r) => r.hint_order), ...clientHints])).sort((a, b) => a - b);

  let submissionId = 0;
  db.exec('BEGIN TRANSACTION;');
  try {
    for (const hOrder of clientHints) {
      db.prepare('INSERT OR IGNORE INTO user_hint_usage (user_id, question_id, hint_order) VALUES (?, ?, ?)').run(
        userId,
        question.id,
        hOrder
      );
    }

    const subInsert = db
      .prepare(
        `INSERT INTO user_submissions (
           user_id, question_id, source_code, status, passed_count, total_count,
           execution_time_ms, memory_kb, error_output, results_json, hints_used, hints_used_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        userId,
        question.id,
        parsed.data.source_code,
        parsed.data.status,
        passedCount,
        totalCount,
        parsed.data.execution_time_ms,
        parsed.data.memory_kb,
        parsed.data.error_output,
        JSON.stringify(sanitizedResults),
        mergedHints.length,
        JSON.stringify(mergedHints)
      );
    submissionId = Number(subInsert.lastInsertRowid);

    // Save latest submitted code as saved draft too
    db.prepare(
      `INSERT INTO user_saved_code (user_id, question_id, source_code, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, question_id) DO UPDATE SET
         source_code = excluded.source_code,
         updated_at = datetime('now')`
    ).run(userId, question.id, parsed.data.source_code);

    // Update user_question_progress (preserve Solved once solved unless explicitly marked Needs Revision)
    const existingProg = db
      .prepare('SELECT status, solved_at FROM user_question_progress WHERE user_id = ? AND question_id = ?')
      .get(userId, question.id) as { status: string; solved_at: string | null } | undefined;

    let nextStatus = isAccepted ? 'Solved' : 'Attempted';
    if (existingProg?.status === 'Solved' && !isAccepted) {
      nextStatus = 'Solved';
    }
    const solvedAt = isAccepted ? existingProg?.solved_at || new Date().toISOString() : existingProg?.solved_at || null;

    db.prepare(
      `INSERT INTO user_question_progress (user_id, question_id, status, attempts_count, last_attempted_at, solved_at, updated_at)
       VALUES (?, ?, ?, 1, datetime('now'), ?, datetime('now'))
       ON CONFLICT(user_id, question_id) DO UPDATE SET
         status = ?,
         attempts_count = attempts_count + 1,
         last_attempted_at = datetime('now'),
         solved_at = ?,
         updated_at = datetime('now')`
    ).run(userId, question.id, nextStatus, solvedAt, nextStatus, solvedAt);

    // Track daily coding activity
    const newlySolved = isAccepted && existingProg?.status !== 'Solved' ? 1 : 0;
    db.prepare(
      `INSERT INTO user_activity (user_id, activity_date, submissions_count, solved_count)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(user_id, activity_date) DO UPDATE SET
         submissions_count = submissions_count + 1,
         solved_count = solved_count + excluded.solved_count`
    ).run(userId, today, newlySolved);

    // Spaced Revision Auto-Scheduling based on user settings
    const revSettings = (db
      .prepare(
        `SELECT incorrect_interval_days, hinted_interval_days, independent_interval_days
         FROM user_revision_settings WHERE user_id = ?`
      )
      .get(userId) as
      | { incorrect_interval_days: number; hinted_interval_days: number; independent_interval_days: number }
      | undefined) ?? {
      incorrect_interval_days: 1,
      hinted_interval_days: 2,
      independent_interval_days: 7,
    };

    if (!isAccepted) {
      const days = Math.max(1, revSettings.incorrect_interval_days);
      db.prepare(
        `INSERT INTO user_revisions (
           user_id, question_id, notes, priority, interval_days, next_review_at, reason, updated_at
         ) VALUES (?, ?, '', 'High', ?, datetime('now', ?), 'incorrect', datetime('now'))
         ON CONFLICT(user_id, question_id) DO UPDATE SET
           priority = 'High',
           interval_days = excluded.interval_days,
           next_review_at = excluded.next_review_at,
           reason = 'incorrect',
           updated_at = datetime('now')`
      ).run(userId, question.id, days, `+${days} days`);
    } else if (mergedHints.length > 0) {
      const days = Math.max(1, revSettings.hinted_interval_days);
      db.prepare(
        `INSERT INTO user_revisions (
           user_id, question_id, notes, priority, interval_days, next_review_at, reason, updated_at
         ) VALUES (?, ?, '', 'Medium', ?, datetime('now', ?), 'hinted', datetime('now'))
         ON CONFLICT(user_id, question_id) DO UPDATE SET
           priority = 'Medium',
           interval_days = excluded.interval_days,
           next_review_at = excluded.next_review_at,
           reason = 'hinted',
           updated_at = datetime('now')`
      ).run(userId, question.id, days, `+${days} days`);
    } else {
      const days = Math.max(1, revSettings.independent_interval_days);
      db.prepare(
        `UPDATE user_revisions
         SET priority = 'Low',
             interval_days = ?,
             next_review_at = datetime('now', ?),
             last_reviewed_at = datetime('now'),
             review_count = review_count + 1,
             reason = 'independent',
             updated_at = datetime('now')
         WHERE user_id = ? AND question_id = ?`
      ).run(days, `+${days} days`, userId, question.id);
    }

    // Complete Daily Challenge if this question is today's challenge
    const dailyQId = getDailyChallengeQuestionId(today);
    if (isAccepted && dailyQId === question.id) {
      db.prepare(
        `INSERT INTO daily_challenge_completions (user_id, challenge_date, question_id, status, submission_id)
         VALUES (?, ?, ?, 'Solved', ?)
         ON CONFLICT(user_id, challenge_date) DO UPDATE SET
           status = 'Solved',
           submission_id = excluded.submission_id`
      ).run(userId, today, question.id, submissionId);
    }

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  res.json({
    submission_id: submissionId,
    engine: parsed.data.engine || PYODIDE_ENGINE_NAME,
    status: parsed.data.status,
    passed_count: passedCount,
    total_count: totalCount,
    execution_time_ms: parsed.data.execution_time_ms,
    memory_kb: parsed.data.memory_kb,
    error_output: parsed.data.error_output,
    hints_used: mergedHints.length,
    hints_used_list: mergedHints,
    results: sanitizedResults,
  });
});

router.get('/execute/:submissionId', requireAuth, (req: AuthenticatedRequest, res) => {
  const sub = db
    .prepare(
      `SELECT s.*, q.slug AS question_slug, q.title AS question_title, q.question_number, q.difficulty
       FROM user_submissions s
       JOIN questions q ON q.id = s.question_id
       WHERE s.id = ? AND s.user_id = ?`
    )
    .get(Number(req.params.submissionId), req.user!.id) as Record<string, unknown> | undefined;

  if (!sub) {
    res.status(404).json({ detail: 'Submission not found.' });
    return;
  }
  res.json({
    submission: {
      ...sub,
      results: JSON.parse(String(sub.results_json || '[]')),
    },
  });
});

router.get('/submissions', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const statusFilter = typeof req.query.status === 'string' ? req.query.status : '';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const offset = (page - 1) * limit;

  const where = ['s.user_id = ?'];
  const params: SQLInputValue[] = [userId];
  if (statusFilter) {
    where.push('s.status = ?');
    params.push(statusFilter);
  }

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS cnt FROM user_submissions s WHERE ${where.join(' AND ')}`)
    .get(...params) as { cnt: number };

  const rows = db
    .prepare(
      `SELECT s.id, s.question_id, s.status, s.passed_count, s.total_count, s.execution_time_ms,
              s.memory_kb, s.error_output, s.source_code, s.hints_used, s.hints_used_json, s.created_at,
              q.question_number, q.slug AS question_slug, q.title AS question_title, q.difficulty,
              c.name AS category_name
       FROM user_submissions s
       JOIN questions q ON q.id = s.question_id
       JOIN categories c ON c.id = q.category_id
       WHERE ${where.join(' AND ')}
       ORDER BY s.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset)
    .map((r: Record<string, unknown>) => ({
      ...r,
      hints_used_list: JSON.parse(String(r.hints_used_json || '[]')),
    }));

  res.json({
    submissions: rows,
    total: totalRow.cnt,
    page,
    limit,
    total_pages: Math.max(1, Math.ceil(totalRow.cnt / limit)),
  });
});

router.get('/submissions/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const sub = db
    .prepare(
      `SELECT s.*, q.question_number, q.slug AS question_slug, q.title AS question_title, q.difficulty
       FROM user_submissions s
       JOIN questions q ON q.id = s.question_id
       WHERE s.id = ? AND s.user_id = ?`
    )
    .get(Number(req.params.id), req.user!.id) as Record<string, unknown> | undefined;

  if (!sub) {
    res.status(404).json({ detail: 'Submission not found.' });
    return;
  }

  res.json({
    submission: {
      ...sub,
      results: JSON.parse(String(sub.results_json || '[]')),
    },
  });
});

router.get('/questions/:id/submissions', requireAuth, (req: AuthenticatedRequest, res) => {
  const q = getQuestionForExecution(String(req.params.id));
  if (!q) {
    res.status(404).json({ detail: 'Question not found.' });
    return;
  }

  const rows = db
    .prepare(
      `SELECT id, status, passed_count, total_count, execution_time_ms, memory_kb, error_output, source_code,
              hints_used, hints_used_json, created_at
       FROM user_submissions
       WHERE user_id = ? AND question_id = ?
       ORDER BY id DESC
       LIMIT 30`
    )
    .all(req.user!.id, q.id)
    .map((r: Record<string, unknown>) => ({
      ...r,
      hints_used_list: JSON.parse(String(r.hints_used_json || '[]')),
    }));

  res.json({ submissions: rows });
});

router.get('/saved-code/:questionId', requireAuth, (req: AuthenticatedRequest, res) => {
  const q = getQuestionForExecution(String(req.params.questionId));
  if (!q) {
    res.status(404).json({ detail: 'Question not found.' });
    return;
  }
  const row = db
    .prepare('SELECT source_code, updated_at FROM user_saved_code WHERE user_id = ? AND question_id = ?')
    .get(req.user!.id, q.id);
  res.json({ saved: row ?? null });
});

router.put('/saved-code/:questionId', requireAuth, (req: AuthenticatedRequest, res) => {
  const q = getQuestionForExecution(String(req.params.questionId));
  if (!q) {
    res.status(404).json({ detail: 'Question not found.' });
    return;
  }
  const schema = z.object({ source_code: z.string().max(MAX_SOURCE_BYTES) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: 'Invalid source code.' });
    return;
  }

  db.prepare(
    `INSERT INTO user_saved_code (user_id, question_id, source_code, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, question_id) DO UPDATE SET
       source_code = excluded.source_code,
       updated_at = datetime('now')`
  ).run(req.user!.id, q.id, parsed.data.source_code);

  res.json({ ok: true });
});

export default router;
