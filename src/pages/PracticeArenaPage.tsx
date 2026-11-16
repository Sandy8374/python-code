import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Shuffle, Play, Clock, RefreshCw, CheckCircle2, XCircle, Terminal } from 'lucide-react';
import { Layout } from '../components/Layout';
import { PythonEditor } from '../components/PythonEditor';
import { DryRunVisualizer } from '../components/DryRunVisualizer';
import { CodeQualityPanel } from '../components/CodeQualityPanel';
import { DifficultyText, ProgressStatusText, SubmissionVerdictText } from '../components/StatusText';
import { useAuth } from '../context/AuthContext';
import {
  apiFetch,
  QUESTION_TYPE_LABELS,
  type CategorySummary,
  type EvalTestCase,
  type ExecutionBatchResponse,
  type QuestionDetailResponse,
  type QuestionListItem,
} from '../lib/api';
import {
  analyzeCodeQualityInPyodide,
  runCustomInputInPyodide,
  runTestCasesInPyodide,
  traceExecutionInPyodide,
  usePyodideRuntime,
  type CodeQualityReport,
  type DryRunTraceResult,
} from '../lib/pyodideRunner';

type RunnerTab = 'results' | 'dry_run' | 'code_quality' | 'custom_input';

export function PracticeArenaPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [categorySlug, setCategorySlug] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [onlyUnsolved, setOnlyUnsolved] = useState(false);
  const [sprintSeconds, setSprintSeconds] = useState(0);
  const [sprintActive, setSprintActive] = useState(false);
  const [seedNonce, setSeedNonce] = useState(0);

  // Inline random practice workspace state
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [customInput, setCustomInput] = useState('');
  const [runnerTab, setRunnerTab] = useState<RunnerTab>('results');
  const [execResult, setExecResult] = useState<ExecutionBatchResponse | null>(null);
  const [dryRunResult, setDryRunResult] = useState<DryRunTraceResult | null>(null);
  const [qualityReport, setQualityReport] = useState<CodeQualityReport | null>(null);

  const pyodideRuntime = usePyodideRuntime(true);

  useEffect(() => {
    if (!sprintActive) return;
    const id = setInterval(() => {
      setSprintSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [sprintActive]);

  const categoriesQuery = useQuery({
    queryKey: ['categories', user?.id ?? 'anon'],
    queryFn: () => apiFetch<{ categories: CategorySummary[] }>('/api/categories'),
  });

  const poolQuery = useQuery({
    queryKey: ['arena-pool', categorySlug, difficulty, onlyUnsolved, user?.id ?? 'anon', seedNonce],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (categorySlug) params.set('category', categorySlug);
      if (difficulty) params.set('difficulty', difficulty);
      if (onlyUnsolved) params.set('status', 'Not Started');
      params.set('limit', '120');
      const res = await apiFetch<{ items: QuestionListItem[] }>(`/api/questions?${params.toString()}`);
      const shuffled = [...res.items].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, 8);
    },
  });

  const sprintList = poolQuery.data ?? [];

  useEffect(() => {
    if (!activeSlug && sprintList.length > 0) {
      setActiveSlug(sprintList[0].slug);
    }
  }, [activeSlug, sprintList]);

  const activeDetailQuery = useQuery({
    queryKey: ['arena-question-detail', activeSlug, user?.id ?? 'anon'],
    queryFn: () => apiFetch<QuestionDetailResponse>(`/api/questions/${activeSlug}`),
    enabled: Boolean(activeSlug),
  });

  useEffect(() => {
    const d = activeDetailQuery.data;
    if (!d) return;
    setCode(d.user_state.saved_code ?? d.question.starter_code);
    setCustomInput(d.public_test_cases[0]?.input_data ?? '');
    setExecResult(null);
    setDryRunResult(null);
    setQualityReport(null);
    setRunnerTab('results');
  }, [activeDetailQuery.data]);

  const runMutation = useMutation({
    mutationFn: async (useCustom: boolean) => {
      const d = activeDetailQuery.data;
      if (!d) throw new Error('Select a problem first.');
      if (useCustom) {
        return runCustomInputInPyodide({
          sourceCode: code,
          evaluationMode: d.question.evaluation_mode,
          functionName: d.question.function_name,
          customInput,
        });
      }
      return runTestCasesInPyodide({
        sourceCode: code,
        evaluationMode: d.question.evaluation_mode,
        functionName: d.question.function_name,
        testCases: d.public_test_cases,
        includeHiddenDetails: false,
        mode: 'public_tests',
      });
    },
    onSuccess: (res) => {
      setExecResult(res);
      setRunnerTab('results');
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const d = activeDetailQuery.data;
      if (!d) throw new Error('Select a problem first.');
      const evalData = await apiFetch<{ test_cases: EvalTestCase[] }>(
        `/api/questions/${d.question.slug}/eval-tests`
      );
      const batchResult = await runTestCasesInPyodide({
        sourceCode: code,
        evaluationMode: d.question.evaluation_mode,
        functionName: d.question.function_name,
        testCases: evalData.test_cases,
        includeHiddenDetails: false,
      });
      if (!user) return batchResult;
      return apiFetch<ExecutionBatchResponse>('/api/execute/submit', {
        method: 'POST',
        body: JSON.stringify({
          question_id: d.question.slug,
          source_code: code,
          status: batchResult.status,
          passed_count: batchResult.passed_count,
          total_count: batchResult.total_count,
          execution_time_ms: batchResult.execution_time_ms,
          memory_kb: batchResult.memory_kb,
          error_output: batchResult.error_output,
          results: batchResult.results,
          engine: batchResult.engine,
        }),
      });
    },
    onSuccess: (res) => {
      setExecResult(res);
      setRunnerTab('results');
      if (user) {
        void queryClient.invalidateQueries({ queryKey: ['arena-pool'] });
        void queryClient.invalidateQueries({ queryKey: ['analytics-overview'] });
      }
    },
  });

  const dryRunMutation = useMutation({
    mutationFn: async () => {
      const d = activeDetailQuery.data;
      if (!d) throw new Error('Select a problem first.');
      return traceExecutionInPyodide({
        sourceCode: code,
        evaluationMode: d.question.evaluation_mode,
        functionName: d.question.function_name,
        inputData: customInput || d.public_test_cases[0]?.input_data || '[]',
      });
    },
    onSuccess: (res) => {
      setDryRunResult(res);
      setRunnerTab('dry_run');
    },
  });

  const qualityMutation = useMutation({
    mutationFn: () => analyzeCodeQualityInPyodide(code),
    onSuccess: (res) => {
      setQualityReport(res);
      setRunnerTab('code_quality');
    },
  });

  const formatTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const rem = sec % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  const activeQ = activeDetailQuery.data?.question;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white">Practice Arena</h1>
            <p className="text-sm text-zinc-400 mt-0.5">
              Generate random Python drills across all 21 modules and execute code directly inside the inline Pyodide runner.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="inline-flex items-center gap-2 rounded-md border border-zinc-800 bg-[#11141B] px-3 py-1.5 text-xs font-mono tabular-nums text-zinc-200">
              <Clock className="h-3.5 w-3.5 text-blue-400" />
              {formatTime(sprintSeconds)}
            </div>
            <button
              type="button"
              onClick={() => setSprintActive((a) => !a)}
              className="rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 whitespace-nowrap"
            >
              {sprintActive ? 'Pause Timer' : 'Start Timer'}
            </button>
            {sprintSeconds > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSprintActive(false);
                  setSprintSeconds(0);
                }}
                className="rounded-md border border-zinc-800 bg-[#11141B] px-2.5 py-1.5 text-xs text-zinc-400 hover:text-white"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Drill Generator Controls */}
        <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={categorySlug}
              onChange={(e) => {
                setCategorySlug(e.target.value);
                setActiveSlug(null);
              }}
              className="rounded-md border border-zinc-800 bg-[#0B0D11] px-3 py-1.5 text-xs text-zinc-200 focus:border-blue-500 focus:outline-none"
            >
              <option value="">All 21 Python Categories</option>
              {(categoriesQuery.data?.categories ?? []).map((c) => (
                <option key={c.id} value={c.slug}>
                  {String(c.order_index).padStart(2, '0')}. {c.name}
                </option>
              ))}
            </select>

            <select
              value={difficulty}
              onChange={(e) => {
                setDifficulty(e.target.value);
                setActiveSlug(null);
              }}
              className="rounded-md border border-zinc-800 bg-[#0B0D11] px-3 py-1.5 text-xs text-zinc-200 focus:border-blue-500 focus:outline-none"
            >
              <option value="">Mixed Difficulty</option>
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
            </select>

            <label className="inline-flex items-center gap-2 text-xs text-zinc-300 cursor-pointer px-2">
              <input
                type="checkbox"
                checked={onlyUnsolved}
                onChange={(e) => {
                  setOnlyUnsolved(e.target.checked);
                  setActiveSlug(null);
                }}
                className="rounded border-zinc-700 bg-zinc-900 accent-blue-600"
              />
              Unsolved only
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveSlug(null);
                setSeedNonce((n) => n + 1);
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 whitespace-nowrap"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Shuffle Set
            </button>
            <button
              type="button"
              disabled={sprintList.length === 0}
              onClick={() => {
                if (sprintList.length > 0) {
                  const pick = sprintList[Math.floor(Math.random() * sprintList.length)];
                  setActiveSlug(pick.slug);
                  setSprintActive(true);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-40 px-3.5 py-1.5 text-xs font-medium text-white whitespace-nowrap"
            >
              <Shuffle className="h-3.5 w-3.5" />
              Load Random Problem
            </button>
          </div>
        </div>

        {/* Inline Random Practice Runner */}
        {activeQ && (
          <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800/80 bg-[#0F1218] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Terminal className="h-4 w-4 text-blue-400 shrink-0" />
                <span className="font-mono text-xs text-zinc-500 tabular-nums">#{activeQ.question_number}</span>
                <span className="text-sm font-semibold text-white truncate">{activeQ.title}</span>
                <DifficultyText difficulty={activeQ.difficulty} />
                <span className="text-xs text-zinc-500 hidden md:inline">· {activeQ.category_name}</span>
              </div>
              <Link
                to={`/problems/${activeQ.slug}`}
                className="text-xs text-blue-400 hover:text-blue-300 whitespace-nowrap shrink-0"
              >
                Open Full Workbench →
              </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[480px]">
              {/* Prompt Summary */}
              <div className="lg:col-span-5 p-4 border-b lg:border-b-0 lg:border-r border-zinc-800 space-y-4 overflow-y-auto max-h-[540px] text-xs">
                <div className="text-zinc-200 leading-relaxed whitespace-pre-wrap">{activeQ.problem_statement}</div>
                {activeQ.examples.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Examples</div>
                    {activeQ.examples.slice(0, 2).map((ex, idx) => (
                      <div key={idx} className="rounded border border-zinc-800 bg-[#0B0D11] p-2.5 font-mono text-[11px] space-y-1">
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

              {/* Editor & Inline Results */}
              <div className="lg:col-span-7 flex flex-col min-h-[480px]">
                <div className="h-[290px] border-b border-zinc-800">
                  <PythonEditor
                    value={code}
                    onChange={setCode}
                    onRun={() => runMutation.mutate(runnerTab === 'custom_input')}
                    onSubmit={() => submitMutation.mutate()}
                    onSave={() => {}}
                    onReset={() => setCode(activeQ.starter_code)}
                    isRunning={runMutation.isPending}
                    isSubmitting={submitMutation.isPending}
                    isSaving={false}
                    runtimeStatus={pyodideRuntime.status}
                    pythonVersion={pyodideRuntime.pythonVersion}
                    runtimeError={pyodideRuntime.error}
                    onRetryRuntime={() => void pyodideRuntime.retry()}
                  />
                </div>

                <div className="bg-[#0F1218] px-3 py-1.5 border-b border-zinc-800 flex items-center gap-1 overflow-x-auto">
                  {(
                    [
                      { id: 'results', label: 'Execution Results' },
                      { id: 'dry_run', label: 'Dry Run' },
                      { id: 'code_quality', label: 'Code Quality' },
                      { id: 'custom_input', label: 'Custom Input' },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setRunnerTab(t.id)}
                      className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap shrink-0 ${
                        runnerTab === t.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="p-3.5 bg-[#0F1218] flex-1 overflow-y-auto max-h-[240px] text-xs">
                  {runnerTab === 'results' && (
                    !execResult ? (
                      <div className="text-zinc-500">
                        Click Run to execute public tests or Submit to evaluate all tests in Pyodide.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <SubmissionVerdictText status={execResult.status} />
                            <span className="font-mono text-zinc-300 tabular-nums">
                              {execResult.passed_count}/{execResult.total_count} passed
                            </span>
                          </div>
                          <span className="font-mono text-[11px] text-zinc-500 tabular-nums">
                            {execResult.execution_time_ms}ms
                          </span>
                        </div>
                        {execResult.error_output && (
                          <pre className="rounded border border-rose-500/30 bg-rose-500/10 p-2 font-mono text-[11px] text-rose-300 whitespace-pre-wrap">
                            {execResult.error_output}
                          </pre>
                        )}
                        {execResult.stdout && (
                          <pre className="rounded border border-zinc-800 bg-[#0B0D11] p-2 font-mono text-[11px] text-emerald-300 whitespace-pre-wrap">
                            {execResult.stdout}
                          </pre>
                        )}
                        <div className="space-y-1.5">
                          {execResult.results.map((tc) => (
                            <div
                              key={`${tc.test_case_id}-${tc.order_index}`}
                              className="rounded border border-zinc-800 bg-[#0B0D11] px-2.5 py-1.5 flex items-center justify-between text-[11px]"
                            >
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
                      </div>
                    )
                  )}

                  {runnerTab === 'dry_run' && (
                    <DryRunVisualizer
                      sourceCode={code}
                      trace={dryRunResult}
                      isLoading={dryRunMutation.isPending}
                      error={dryRunMutation.error?.message}
                      runtimeReady={pyodideRuntime.status === 'ready'}
                      onRunDryRun={() => dryRunMutation.mutate()}
                    />
                  )}

                  {runnerTab === 'code_quality' && (
                    <CodeQualityPanel
                      report={qualityReport}
                      isLoading={qualityMutation.isPending}
                      runtimeReady={pyodideRuntime.status === 'ready'}
                      onAnalyze={() => qualityMutation.mutate()}
                      onApplyFormat={(formatted) => setCode(formatted)}
                    />
                  )}

                  {runnerTab === 'custom_input' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400">Custom Test Input:</span>
                        <button
                          type="button"
                          disabled={pyodideRuntime.status !== 'ready' || runMutation.isPending}
                          onClick={() => runMutation.mutate(true)}
                          className="inline-flex items-center gap-1 rounded bg-blue-600 hover:bg-blue-500 px-2.5 py-1 text-[11px] font-medium text-white"
                        >
                          <Play className="h-3 w-3" />
                          Run Custom
                        </button>
                      </div>
                      <textarea
                        rows={4}
                        value={customInput}
                        onChange={(e) => setCustomInput(e.target.value)}
                        className="w-full rounded border border-zinc-800 bg-[#0B0D11] p-2 font-mono text-xs text-zinc-200 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Generated Drill Queue */}
        <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800/80 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Focused Drill Deck ({sprintList.length} exercises)</h2>
          </div>

          {poolQuery.isLoading ? (
            <div className="p-6 space-y-2.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 rounded bg-zinc-900 animate-pulse" />
              ))}
            </div>
          ) : sprintList.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-400">
              No matching exercises found for this combination. Try unchecking “Unsolved only” or choosing another category.
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/60">
              {sprintList.map((q) => (
                <div
                  key={q.id}
                  className={`px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                    activeSlug === q.slug ? 'bg-blue-600/10' : 'hover:bg-zinc-800/25'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs font-medium text-white">
                      <span className="font-mono text-zinc-500 tabular-nums">#{q.question_number}</span>
                      <button
                        type="button"
                        onClick={() => setActiveSlug(q.slug)}
                        className="hover:text-blue-400 truncate text-left"
                      >
                        {q.title}
                      </button>
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span>{q.category_name}</span>
                      <span>·</span>
                      <span>{q.concept_name}</span>
                      <span>·</span>
                      <span>{QUESTION_TYPE_LABELS[q.question_type]}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <DifficultyText difficulty={q.difficulty} />
                    <ProgressStatusText status={q.status} />
                    <button
                      type="button"
                      onClick={() => setActiveSlug(q.slug)}
                      className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 whitespace-nowrap"
                    >
                      <Play className="h-3 w-3 text-blue-400" />
                      Load Inline
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
