import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Play, Send, Trophy, CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import { Layout } from '../components/Layout';
import { PythonEditor } from '../components/PythonEditor';
import { DifficultyText, SubmissionVerdictText } from '../components/StatusText';
import { useAuth } from '../context/AuthContext';
import {
  apiFetch,
  type CategorySummary,
  type ExecutionBatchResponse,
  type MockInterviewAnswerRecord,
  type MockInterviewQuestion,
  type MockInterviewSession,
} from '../lib/api';
import { runTestCasesInPyodide, usePyodideRuntime } from '../lib/pyodideRunner';

export function MockInterviewPage() {
  const { user, openAuthModal } = useAuth();
  const queryClient = useQueryClient();
  const pyodideRuntime = usePyodideRuntime(true);

  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard' | 'Mixed'>('Mixed');
  const [categorySlug, setCategorySlug] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [questionCount, setQuestionCount] = useState(2);

  // Active interview state
  const [activeInterview, setActiveInterview] = useState<MockInterviewSession | null>(null);
  const [questions, setQuestions] = useState<MockInterviewQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [codeMap, setCodeMap] = useState<Record<number, string>>({});
  const [resultMap, setResultMap] = useState<Record<number, ExecutionBatchResponse>>({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [reportSession, setReportSession] = useState<MockInterviewSession | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ['categories', user?.id ?? 'anon'],
    queryFn: () => apiFetch<{ categories: CategorySummary[] }>('/api/categories'),
  });

  const historyQuery = useQuery({
    queryKey: ['mock-interviews', user?.id],
    queryFn: () => apiFetch<{ interviews: MockInterviewSession[] }>('/api/mock-interviews'),
    enabled: Boolean(user),
  });

  const startMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ interview: MockInterviewSession; questions: MockInterviewQuestion[] }>(
        '/api/mock-interviews/start',
        {
          method: 'POST',
          body: JSON.stringify({
            difficulty,
            category_slug: categorySlug,
            duration_minutes: durationMinutes,
            question_count: questionCount,
          }),
        }
      ),
    onSuccess: (res) => {
      setReportSession(null);
      setActiveInterview(res.interview);
      setQuestions(res.questions);
      setCurrentIdx(0);
      const initialCode: Record<number, string> = {};
      for (const q of res.questions) {
        initialCode[q.id] = q.starter_code;
      }
      setCodeMap(initialCode);
      setResultMap({});
      const secs = res.interview.duration_minutes * 60;
      setTotalSeconds(secs);
      setSecondsLeft(secs);
    },
  });

  const currentQuestion = questions[currentIdx] ?? null;

  const runPublicMutation = useMutation({
    mutationFn: async () => {
      if (!currentQuestion) throw new Error('No question selected');
      const res = await runTestCasesInPyodide({
        sourceCode: codeMap[currentQuestion.id] ?? currentQuestion.starter_code,
        evaluationMode: currentQuestion.evaluation_mode,
        functionName: currentQuestion.function_name,
        testCases: currentQuestion.public_test_cases,
        includeHiddenDetails: false,
        mode: 'public_tests',
      });
      return { qId: currentQuestion.id, res };
    },
    onSuccess: ({ qId, res }) => {
      setResultMap((prev) => ({ ...prev, [qId]: res }));
    },
  });

  const finishInterviewMutation = useMutation({
    mutationFn: async () => {
      if (!activeInterview) throw new Error('No active interview');
      const answers: MockInterviewAnswerRecord[] = [];
      for (const q of questions) {
        const src = codeMap[q.id] ?? q.starter_code;
        const evalRes = await runTestCasesInPyodide({
          sourceCode: src,
          evaluationMode: q.evaluation_mode,
          functionName: q.function_name,
          testCases: q.eval_test_cases,
          includeHiddenDetails: false,
        });
        answers.push({
          question_id: q.id,
          slug: q.slug,
          title: q.title,
          difficulty: q.difficulty,
          source_code: src,
          status: evalRes.status,
          passed_count: evalRes.passed_count,
          total_count: evalRes.total_count,
          execution_time_ms: evalRes.execution_time_ms,
        });
      }

      const timeSpent = Math.max(1, totalSeconds - secondsLeft);
      return apiFetch<{ interview: MockInterviewSession }>(
        `/api/mock-interviews/${activeInterview.id}/submit`,
        {
          method: 'POST',
          body: JSON.stringify({
            time_spent_seconds: timeSpent,
            answers,
          }),
        }
      );
    },
    onSuccess: (res) => {
      setActiveInterview(null);
      setQuestions([]);
      setReportSession(res.interview);
      void queryClient.invalidateQueries({ queryKey: ['mock-interviews'] });
      void queryClient.invalidateQueries({ queryKey: ['analytics-detailed'] });
    },
  });

  // Countdown timer
  useEffect(() => {
    if (!activeInterview || finishInterviewMutation.isPending) return;
    if (secondsLeft <= 0) return;
    const id = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          finishInterviewMutation.mutate();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [activeInterview, secondsLeft, finishInterviewMutation]);

  const formatClock = (s: number) => {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  };

  if (!user) {
    return (
      <Layout>
        <div className="rounded-lg border border-zinc-800 bg-[#11141B] p-8 text-center space-y-3 max-w-lg mx-auto mt-10">
          <h1 className="text-lg font-semibold text-white">Python Mock Interview</h1>
          <p className="text-xs text-zinc-400">
            Sign in to launch timed Python technical interviews with automatic Pyodide evaluation and persisted scorecards.
          </p>
          <button
            type="button"
            onClick={() => openAuthModal('login')}
            className="rounded-md bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-medium text-white"
          >
            Sign In to Start Interview
          </button>
        </div>
      </Layout>
    );
  }

  // Active timed interview workspace
  if (activeInterview && currentQuestion) {
    const activeRes = resultMap[currentQuestion.id] ?? null;
    return (
      <Layout fullBleed>
        <div className="flex flex-col h-[calc(100vh-3.5rem)] min-h-0">
          {/* Interview Top Bar */}
          <div className="h-12 px-4 border-b border-zinc-800/80 bg-[#0F1218] flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 overflow-x-auto">
              {questions.map((q, idx) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setCurrentIdx(idx)}
                  className={`px-3 py-1 rounded text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                    idx === currentIdx
                      ? 'bg-blue-600 text-white'
                      : 'border border-zinc-800 bg-[#0B0D11] text-zinc-400 hover:text-white'
                  }`}
                >
                  Q{idx + 1}: #{q.question_number}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div
                className={`inline-flex items-center gap-1.5 rounded border border-zinc-800 bg-[#0B0D11] px-3 py-1 text-xs font-mono tabular-nums ${
                  secondsLeft < 180 ? 'text-rose-400 border-rose-500/40' : 'text-zinc-200'
                }`}
              >
                <Clock className="h-3.5 w-3.5" />
                {formatClock(secondsLeft)}
              </div>

              <button
                type="button"
                disabled={finishInterviewMutation.isPending || pyodideRuntime.status !== 'ready'}
                onClick={() => finishInterviewMutation.mutate()}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3.5 py-1.5 text-xs font-semibold text-white whitespace-nowrap"
              >
                <Send className="h-3.5 w-3.5" />
                {finishInterviewMutation.isPending ? 'Grading Interview...' : 'Finish & Grade Interview'}
              </button>
            </div>
          </div>

          {/* Split Body */}
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
            <div className="lg:col-span-5 p-5 border-b lg:border-b-0 lg:border-r border-zinc-800 bg-[#0F1218] overflow-y-auto space-y-4 text-xs">
              <div className="flex items-center gap-2 text-zinc-400">
                <DifficultyText difficulty={currentQuestion.difficulty} />
                <span>·</span>
                <span>{currentQuestion.category_name}</span>
                <span>·</span>
                <span>{currentQuestion.concept_name}</span>
              </div>
              <h2 className="text-base font-semibold text-white">
                {currentQuestion.question_number}. {currentQuestion.title}
              </h2>
              <div className="text-zinc-200 leading-relaxed whitespace-pre-wrap">
                {currentQuestion.problem_statement}
              </div>
              {currentQuestion.examples.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Examples</div>
                  {currentQuestion.examples.map((ex, i) => (
                    <div key={i} className="rounded border border-zinc-800 bg-[#0B0D11] p-3 font-mono text-[11px] space-y-1">
                      <div>
                        <span className="text-zinc-500">Input: </span>
                        <span className="text-zinc-200">{ex.input}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Output: </span>
                        <span className="text-emerald-400">{ex.output}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-7 flex flex-col min-h-0 bg-[#0C0E12]">
              <div className="flex-1 min-h-0">
                <PythonEditor
                  value={codeMap[currentQuestion.id] ?? ''}
                  onChange={(next) => setCodeMap((prev) => ({ ...prev, [currentQuestion.id]: next }))}
                  onRun={() => runPublicMutation.mutate()}
                  onSubmit={() => finishInterviewMutation.mutate()}
                  onSave={() => {}}
                  onReset={() => setCodeMap((prev) => ({ ...prev, [currentQuestion.id]: currentQuestion.starter_code }))}
                  isRunning={runPublicMutation.isPending}
                  isSubmitting={finishInterviewMutation.isPending}
                  isSaving={false}
                  runtimeStatus={pyodideRuntime.status}
                  pythonVersion={pyodideRuntime.pythonVersion}
                  runtimeError={pyodideRuntime.error}
                  onRetryRuntime={() => void pyodideRuntime.retry()}
                />
              </div>

              <div className="h-44 border-t border-zinc-800 bg-[#0F1218] p-3.5 overflow-y-auto text-xs space-y-2">
                {!activeRes ? (
                  <div className="text-zinc-500">
                    Click Run to verify public test cases for Q{currentIdx + 1}, or click Finish &amp; Grade Interview to score all questions.
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <SubmissionVerdictText status={activeRes.status} />
                      <span className="font-mono text-zinc-400 tabular-nums">
                        {activeRes.passed_count}/{activeRes.total_count} public tests · {activeRes.execution_time_ms}ms
                      </span>
                    </div>
                    {activeRes.error_output && (
                      <pre className="rounded border border-rose-500/30 bg-rose-500/10 p-2 font-mono text-[11px] text-rose-300 whitespace-pre-wrap">
                        {activeRes.error_output}
                      </pre>
                    )}
                    <div className="space-y-1">
                      {activeRes.results.map((tc) => (
                        <div key={tc.order_index} className="flex items-center justify-between text-[11px] rounded border border-zinc-800 bg-[#0B0D11] px-2.5 py-1">
                          <span className="flex items-center gap-1.5 text-zinc-200">
                            {tc.passed ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 text-rose-400" />
                            )}
                            {tc.description}
                          </span>
                          <span className="font-mono text-zinc-500 tabular-nums">{tc.execution_time_ms}ms</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  const pastInterviews = historyQuery.data?.interviews ?? [];

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Python Mock Interview Simulator</h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            Configure a timed Python technical interview with automated Pyodide grading and persisted performance reports.
          </p>
        </div>

        {/* Performance Report Card (after completion) */}
        {reportSession && (
          <div className="rounded-lg border border-zinc-800 bg-[#11141B] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2.5">
                <Trophy className="h-5 w-5 text-amber-400" />
                <div>
                  <h2 className="text-sm font-semibold text-white">Interview Performance Report</h2>
                  <p className="text-xs text-zinc-400">
                    {reportSession.difficulty} · {reportSession.category_slug || 'All Categories'}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-mono font-semibold text-emerald-400 tabular-nums">
                  {reportSession.score_pct}%
                </div>
                <div className="text-[11px] text-zinc-400 font-mono tabular-nums">
                  {reportSession.passed_questions}/{reportSession.total_questions} solved · {Math.round(reportSession.time_spent_seconds / 60)}m spent
                </div>
              </div>
            </div>

            <div className="divide-y divide-zinc-800/70 rounded border border-zinc-800 bg-[#0B0D11]">
              {(reportSession.answers ?? []).map((ans) => (
                <div key={ans.question_id} className="px-4 py-3 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-medium text-zinc-100">{ans.title}</div>
                    <div className="text-[11px] text-zinc-500 mt-0.5 font-mono tabular-nums">
                      {ans.passed_count}/{ans.total_count} tests · {ans.execution_time_ms}ms
                    </div>
                  </div>
                  <SubmissionVerdictText status={ans.status as any} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Setup Card */}
        <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Configure New Mock Interview</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block text-zinc-400 mb-1">Difficulty Tier</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as any)}
                className="w-full rounded-md border border-zinc-800 bg-[#0B0D11] px-3 py-2 text-zinc-200 focus:border-blue-500 focus:outline-none"
              >
                <option value="Mixed">Mixed Difficulty</option>
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </div>

            <div>
              <label className="block text-zinc-400 mb-1">Python Category</label>
              <select
                value={categorySlug}
                onChange={(e) => setCategorySlug(e.target.value)}
                className="w-full rounded-md border border-zinc-800 bg-[#0B0D11] px-3 py-2 text-zinc-200 focus:border-blue-500 focus:outline-none"
              >
                <option value="">All 21 Categories</option>
                {(categoriesQuery.data?.categories ?? []).map((c) => (
                  <option key={c.id} value={c.slug}>
                    {String(c.order_index).padStart(2, '0')}. {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-zinc-400 mb-1">Duration</label>
              <select
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full rounded-md border border-zinc-800 bg-[#0B0D11] px-3 py-2 text-zinc-200 focus:border-blue-500 focus:outline-none"
              >
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>60 minutes</option>
              </select>
            </div>

            <div>
              <label className="block text-zinc-400 mb-1">Questions</label>
              <select
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                className="w-full rounded-md border border-zinc-800 bg-[#0B0D11] px-3 py-2 text-zinc-200 focus:border-blue-500 focus:outline-none"
              >
                <option value={1}>1 Question</option>
                <option value={2}>2 Questions</option>
                <option value={3}>3 Questions</option>
                <option value={4}>4 Questions</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-zinc-500">
              Runtime status: <span className="font-mono text-zinc-300">{pyodideRuntime.status}</span>
            </span>
            <button
              type="button"
              disabled={startMutation.isPending}
              onClick={() => startMutation.mutate()}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 text-xs font-medium text-white whitespace-nowrap"
            >
              <Play className="h-3.5 w-3.5" />
              {startMutation.isPending ? 'Preparing Session...' : 'Start Timed Mock Interview'}
            </button>
          </div>
        </div>

        {/* Past Mock Interviews */}
        <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800/80 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Past Interview Sessions</h2>
            <span className="text-xs font-mono text-zinc-500 tabular-nums">{pastInterviews.length} sessions</span>
          </div>
          {pastInterviews.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500">
              No mock interviews recorded yet. Start your first timed session above.
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/60">
              {pastInterviews.map((item) => (
                <div key={item.id} className="px-4 py-3.5 flex items-center justify-between gap-4 text-xs">
                  <div>
                    <div className="font-medium text-zinc-100">
                      Session #{item.id} · {item.difficulty} · {item.category_slug || 'All Categories'}
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-0.5 font-mono tabular-nums">
                      {item.passed_questions}/{item.total_questions} solved · {item.duration_minutes}m limit ·{' '}
                      {Math.round(item.time_spent_seconds / 60)}m spent ·{' '}
                      {item.started_at ? new Date(item.started_at + 'Z').toLocaleString() : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`font-mono font-semibold tabular-nums ${
                        item.score_pct >= 70 ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {item.score_pct}%
                    </span>
                    <button
                      type="button"
                      onClick={() => setReportSession(item)}
                      className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-[#0B0D11] px-2.5 py-1 text-[11px] text-zinc-300 hover:text-white"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Report
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
