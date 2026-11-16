import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TEST_PORT = 3199;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const TEMP_DB = path.join(os.tmpdir(), `pm-api-test-${process.pid}.db`);

async function waitForServer(timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Test server failed to start within timeout');
}

async function api<T>(url: string, opts: RequestInit = {}, token?: string): Promise<{ status: number; data: T }> {
  const headers = new Headers(opts.headers);
  if (opts.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${BASE_URL}${url}`, { ...opts, headers });
  const data = (await res.json()) as T;
  return { status: res.status, data };
}

async function runTests() {
  const tsxBin = path.resolve(process.cwd(), 'node_modules', '.bin', 'tsx');
  const serverProc = spawn(tsxBin, ['server.ts'], {
    cwd: process.cwd(),
    detached: true,
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      SQLITE_DB_PATH: TEMP_DB,
      NODE_ENV: 'development',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitForServer();
    console.log('1. Health & seed verification...');
    const health = await api<{ status: string; engine: string }>('/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.data.status, 'ok');

    // 2. Categories & Question Bank counts (21 categories including Debugging Challenges)
    const cats = await api<{ categories: { id: number; slug: string; easy_count: number; medium_count: number; hard_count: number }[] }>(
      '/api/categories'
    );
    assert.equal(cats.status, 200);
    assert.equal(cats.data.categories.length, 21, 'Expected 21 Python categories including Debugging Challenges');
    for (const c of cats.data.categories) {
      assert.ok(c.easy_count > 0 && c.medium_count > 0 && c.hard_count > 0, `Category ${c.slug} missing difficulty tier`);
    }

    const qList = await api<{ total: number; items: { slug: string }[] }>('/api/questions?limit=400');
    assert.equal(qList.status, 200);
    assert.ok(qList.data.total >= 318, `Expected >= 318 questions, got ${qList.data.total}`);

    // 3. Hidden test protection & 3 progressive hints check
    const detail = await api<{
      question: { slug: string; hidden_test_count: number; starter_code: string };
      public_test_cases: { is_hidden?: number }[];
      hints: { order_index: number; hint_text: string }[];
    }>('/api/questions/swap-two-variables-tuple-unpacking');
    assert.equal(detail.status, 200);
    assert.ok(detail.data.question.hidden_test_count >= 1);
    assert.ok(detail.data.public_test_cases.length >= 1);
    assert.equal(detail.data.hints.length, 3, 'Every question must have 3 progressive hints');
    assert.ok(detail.data.question.starter_code.includes('def '));
    const rawDetail = JSON.stringify(detail.data);
    assert.ok(!rawDetail.includes('"is_hidden":1'), 'Hidden tests must never leak in question detail');

    // 4. Register User A & User B and verify strict JWT user isolation
    console.log('2. Registration, login & multi-user isolation...');
    const regA = await api<{ token?: string; access_token?: string; user: { id: number; username: string } }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: 'user_alpha',
        email: 'alpha@test.dev',
        full_name: 'Alpha Tester',
        password: 'Password123!',
      }),
    });
    assert.equal(regA.status, 201);
    const tokenA = regA.data.access_token || regA.data.token || '';
    assert.ok(tokenA.length > 10);

    const regB = await api<{ token?: string; access_token?: string; user: { id: number; username: string } }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: 'user_beta',
        email: 'beta@test.dev',
        full_name: 'Beta Tester',
        password: 'Password123!',
      }),
    });
    assert.equal(regB.status, 201);
    const tokenB = regB.data.access_token || regB.data.token || '';
    assert.ok(tokenB.length > 10);

    // Unauthenticated submit must be rejected
    const unauthSubmit = await api<{ detail: string }>('/api/execute/submit', {
      method: 'POST',
      body: JSON.stringify({ question_id: 'swap-two-variables-tuple-unpacking', source_code: 'def swap_values(a, b): return [b, a]' }),
    });
    assert.equal(unauthSubmit.status, 401);

    // 5. Track Hint Usage + Eval tests & Submission persistence
    console.log('3. Progressive hint tracking & submission persistence...');
    const hintUse = await api<{ ok: boolean; used_hints: number[] }>(
      '/api/questions/swap-two-variables-tuple-unpacking/hints/1/use',
      { method: 'POST' },
      tokenA
    );
    assert.equal(hintUse.status, 200);
    assert.deepEqual(hintUse.data.used_hints, [1]);

    const evalTests = await api<{
      test_cases: { id: number; order_index: number; input_data: string; expected_output: string; description: string; is_hidden: number }[];
    }>('/api/questions/swap-two-variables-tuple-unpacking/eval-tests');
    assert.equal(evalTests.status, 200);
    assert.ok(evalTests.data.test_cases.length >= 3);

    const acceptedResults = evalTests.data.test_cases.map((tc) => ({
      test_case_id: tc.id,
      order_index: tc.order_index,
      description: tc.is_hidden ? `Hidden Test Case #${tc.order_index}` : tc.description,
      is_hidden: Boolean(tc.is_hidden),
      passed: true,
      verdict: 'Passed' as const,
      status: 'Accepted' as const,
      ...(tc.is_hidden
        ? {}
        : {
            input: tc.input_data,
            expected_output: tc.expected_output,
            actual_output: tc.expected_output,
            error: '',
          }),
      execution_time_ms: 4,
    }));

    const subAccepted = await api<{
      submission_id: number;
      status: string;
      hints_used: number;
      results: { is_hidden: boolean; input?: string }[];
    }>(
      '/api/execute/submit',
      {
        method: 'POST',
        body: JSON.stringify({
          question_id: 'swap-two-variables-tuple-unpacking',
          source_code: 'def swap_values(a, b):\n    a, b = b, a\n    return [a, b]\n',
          status: 'Accepted',
          passed_count: acceptedResults.length,
          total_count: acceptedResults.length,
          execution_time_ms: 16,
          memory_kb: 16384,
          error_output: '',
          results: acceptedResults,
          engine: 'Pyodide WASM (Python 3.14)',
          hints_used: [1],
        }),
      },
      tokenA
    );
    assert.equal(subAccepted.status, 200);
    assert.equal(subAccepted.data.status, 'Accepted');
    assert.equal(subAccepted.data.hints_used, 1);
    const hiddenRes = subAccepted.data.results.filter((r) => r.is_hidden);
    assert.ok(hiddenRes.length >= 1);
    assert.equal(hiddenRes[0].input, undefined, 'Hidden test input must stay hidden in submit response');

    // User B cannot inspect User A's submission
    const crossRead = await api<{ detail: string }>(`/api/submissions/${subAccepted.data.submission_id}`, {}, tokenB);
    assert.equal(crossRead.status, 404);

    // 6. Bookmarks, Spaced Revisions, Analytics
    console.log('4. Spaced revisions, bookmarks, and analytics...');
    const bmAdd = await api('/api/bookmarks/swap-two-variables-tuple-unpacking', { method: 'POST' }, tokenA);
    assert.equal(bmAdd.status, 201);
    const bmListA = await api<{ bookmarks: unknown[] }>('/api/bookmarks', {}, tokenA);
    const bmListB = await api<{ bookmarks: unknown[] }>('/api/bookmarks', {}, tokenB);
    assert.equal(bmListA.data.bookmarks.length, 1);
    assert.equal(bmListB.data.bookmarks.length, 0);

    const revSettingsPut = await api<{
      ok: boolean;
      settings: { incorrect_interval_days: number; hinted_interval_days: number };
    }>(
      '/api/revisions/settings',
      {
        method: 'PUT',
        body: JSON.stringify({
          incorrect_interval_days: 1,
          hinted_interval_days: 3,
          independent_interval_days: 10,
          forgotten_interval_days: 1,
        }),
      },
      tokenA
    );
    assert.equal(revSettingsPut.status, 200);
    assert.equal(revSettingsPut.data.settings.hinted_interval_days, 3);

    const revDash = await api<{ summary: { total_queued: number }; settings: { independent_interval_days: number } }>(
      '/api/revisions/dashboard',
      {},
      tokenA
    );
    assert.equal(revDash.status, 200);
    assert.equal(revDash.data.settings.independent_interval_days, 10);
    assert.ok(revDash.data.summary.total_queued >= 1);

    const revReview = await api<{ ok: boolean; reason: string }>(
      '/api/revisions/swap-two-variables-tuple-unpacking/review',
      { method: 'POST', body: JSON.stringify({ outcome: 'good' }) },
      tokenA
    );
    assert.equal(revReview.status, 200);
    assert.equal(revReview.data.reason, 'independent');

    // 7. Debugging Lab, Output Prediction, Interview Prep, Roadmap, Daily Challenge, Mock Interview, Notes, Detailed Analytics
    console.log('5. Expansion feature endpoints (Debugging, Mock Interview, Output Prediction, Interview Prep, Roadmap, Daily, Notes, Analytics)...');
    const debugOverview = await api<{ stats: { total: number }; questions: unknown[] }>('/api/debugging/overview', {}, tokenA);
    assert.equal(debugOverview.status, 200);
    assert.ok(debugOverview.data.stats.total >= 12, `Expected >= 12 debugging challenges, got ${debugOverview.data.stats.total}`);

    const outPred = await api<{ items: { id: string }[] }>('/api/output-predictions', {}, tokenA);
    assert.equal(outPred.status, 200);
    assert.ok(outPred.data.items.length >= 20);
    const outAttempt = await api<{ is_correct: boolean; expected_output: string }>(
      `/api/output-predictions/${outPred.data.items[0].id}/attempt`,
      { method: 'POST', body: JSON.stringify({ predicted_output: 'wrong_guess' }) },
      tokenA
    );
    assert.equal(outAttempt.status, 200);
    assert.ok(typeof outAttempt.data.expected_output === 'string');

    const prep = await api<{ topics: unknown[]; items: { id: string }[] }>('/api/interview-prep', {}, tokenA);
    assert.equal(prep.status, 200);
    assert.equal(prep.data.topics.length, 12);
    const prepUpdate = await api<{ ok: boolean }>(
      `/api/interview-prep/${prep.data.items[0].id}/progress`,
      { method: 'PUT', body: JSON.stringify({ is_reviewed: true, confidence: 'High' }) },
      tokenA
    );
    assert.equal(prepUpdate.status, 200);

    const roadmap = await api<{ summary: { modules_total: number; questions_solved: number } }>('/api/roadmap', {}, tokenA);
    assert.equal(roadmap.status, 200);
    assert.equal(roadmap.data.summary.modules_total, 21);
    assert.equal(roadmap.data.summary.questions_solved, 1);

    const daily = await api<{ date: string; question: { id: number; slug: string }; is_completed: boolean }>(
      '/api/daily-challenge',
      {},
      tokenA
    );
    assert.equal(daily.status, 200);
    assert.ok(daily.data.question.slug);
    assert.equal(daily.data.is_completed, false);

    // Solve Daily Challenge and verify auto-completion
    const dailyEvalTests = await api<{
      test_cases: { id: number; order_index: number; is_hidden: number }[];
    }>(`/api/questions/${daily.data.question.slug}/eval-tests`);
    const dailySubmit = await api<{ status: string }>(
      '/api/execute/submit',
      {
        method: 'POST',
        body: JSON.stringify({
          question_id: daily.data.question.slug,
          source_code: '# daily solution\npass\n',
          status: 'Accepted',
          passed_count: dailyEvalTests.data.test_cases.length,
          total_count: dailyEvalTests.data.test_cases.length,
          execution_time_ms: 10,
          memory_kb: 16384,
          error_output: '',
          results: dailyEvalTests.data.test_cases.map((tc) => ({
            test_case_id: tc.id,
            order_index: tc.order_index,
            description: 'case',
            is_hidden: Boolean(tc.is_hidden),
            passed: true,
            status: 'Accepted',
            execution_time_ms: 2,
          })),
        }),
      },
      tokenA
    );
    assert.equal(dailySubmit.status, 200);
    const dailyAfter = await api<{ is_completed: boolean; daily_streak: number }>('/api/daily-challenge', {}, tokenA);
    assert.equal(dailyAfter.data.is_completed, true);
    assert.equal(dailyAfter.data.daily_streak, 1);

    // Mock interview start & submit
    const mockStart = await api<{ interview: { id: number }; questions: { id: number; slug: string; title: string; difficulty: string }[] }>(
      '/api/mock-interviews/start',
      { method: 'POST', body: JSON.stringify({ difficulty: 'Easy', duration_minutes: 20, question_count: 2 }) },
      tokenA
    );
    assert.equal(mockStart.status, 201);
    assert.equal(mockStart.data.questions.length, 2);

    const mockSubmit = await api<{ interview: { score_pct: number; status: string } }>(
      `/api/mock-interviews/${mockStart.data.interview.id}/submit`,
      {
        method: 'POST',
        body: JSON.stringify({
          time_spent_seconds: 120,
          answers: mockStart.data.questions.map((q, idx) => ({
            question_id: q.id,
            slug: q.slug,
            title: q.title,
            difficulty: q.difficulty,
            source_code: 'pass',
            status: idx === 0 ? 'Accepted' : 'Wrong Answer',
            passed_count: idx === 0 ? 3 : 1,
            total_count: 3,
            execution_time_ms: 10,
          })),
        }),
      },
      tokenA
    );
    assert.equal(mockSubmit.status, 200);
    assert.equal(mockSubmit.data.interview.status, 'completed');
    assert.equal(mockSubmit.data.interview.score_pct, 50);

    // Personal Notes CRUD
    const noteCreate = await api<{ note: { id: number; title: string } }>(
      '/api/notes',
      {
        method: 'POST',
        body: JSON.stringify({
          target_type: 'concept',
          target_ref: 'decorators',
          title: 'Use functools.wraps',
          content: 'Always preserve __name__ and __doc__ on wrapper functions.',
          tags: 'decorators,functools',
        }),
      },
      tokenA
    );
    assert.equal(noteCreate.status, 201);
    const noteId = noteCreate.data.note.id;

    const noteListA = await api<{ notes: { id: number }[] }>('/api/notes?q=functools', {}, tokenA);
    assert.equal(noteListA.status, 200);
    assert.equal(noteListA.data.notes.length, 1);

    const noteUpdate = await api<{ note: { title: string } }>(
      `/api/notes/${noteId}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          title: 'Use functools.wraps always',
          content: 'Updated takeaway.',
          tags: 'decorators',
        }),
      },
      tokenA
    );
    assert.equal(noteUpdate.status, 200);
    assert.equal(noteUpdate.data.note.title, 'Use functools.wraps always');

    const noteDelete = await api<{ ok: boolean }>(`/api/notes/${noteId}`, { method: 'DELETE' }, tokenA);
    assert.equal(noteDelete.status, 200);

    // Detailed analytics
    const detailed = await api<{
      category_performance: unknown[];
      hint_stats: { total_hints_revealed: number };
      mock_interview_stats: { completed_count: number };
    }>('/api/analytics/detailed', {}, tokenA);
    assert.equal(detailed.status, 200);
    assert.equal(detailed.data.category_performance.length, 21);
    assert.equal(detailed.data.hint_stats.total_hints_revealed, 1);
    assert.equal(detailed.data.mock_interview_stats.completed_count, 1);

    console.log('ALL API INTEGRATION TESTS PASSED!');
  } finally {
    if (serverProc.pid) {
      try {
        process.kill(-serverProc.pid, 'SIGTERM');
      } catch {
        serverProc.kill('SIGTERM');
      }
    }
    try {
      for (const suffix of ['', '-shm', '-wal']) {
        if (fs.existsSync(TEMP_DB + suffix)) fs.unlinkSync(TEMP_DB + suffix);
      }
    } catch {
      // ignore cleanup
    }
  }
}

runTests().catch((err) => {
  console.error('API TEST FAILURE:', err);
  process.exit(1);
});
