import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Eye,
  Lightbulb,
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Lock,
  Copy,
  Check,
  StickyNote,
  ArrowLeftRight,
} from 'lucide-react';
import { Layout } from '../components/Layout';
import { PythonEditor } from '../components/PythonEditor';
import { DryRunVisualizer } from '../components/DryRunVisualizer';
import { CodeQualityPanel } from '../components/CodeQualityPanel';
import { QuickNoteModal } from '../components/QuickNoteModal';
import { SubmissionDiffModal } from '../components/SubmissionDiffModal';
import { DifficultyText, ProgressStatusText, SubmissionVerdictText } from '../components/StatusText';
import { useAuth } from '../context/AuthContext';
import {
  apiFetch,
  QUESTION_TYPE_LABELS,
  type EvalTestCase,
  type ExecutionBatchResponse,
  type ProgressStatus,
  type QuestionDetailResponse,
  type SubmissionRecord,
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

type LeftTab = 'description' | 'hints' | 'solution' | 'submissions';
type BottomTab =
  | 'test_cases'
  | 'test_results'
  | 'dry_run'
  | 'code_quality'
  | 'custom_input'
  | 'submission_output';

const HINT_STAGE_TITLES: Record<number, string> = {
  1: 'Hint 1 · Understand Problem',
  2: 'Hint 2 · Think About Approach',
  3: 'Hint 3 · Logical Direction & Pseudocode',
};

export function ProblemDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user, openAuthModal } = useAuth();
  const queryClient = useQueryClient();

  const [leftTab, setLeftTab] = useState<LeftTab>('description');
  const [bottomTab, setBottomTab] = useState<BottomTab>('test_cases');
  const [code, setCode] = useState('');
  const [customInput, setCustomInput] = useState('');
  const [revealedHints, setRevealedHints] = useState(0);
  const [usedHints, setUsedHints] = useState<number[]>([]);
  const [showSolution, setShowSolution] = useState(false);
  const [lastSavedText, setLastSavedText] = useState('');
  const [runResult, setRunResult] = useState<ExecutionBatchResponse | null>(null);
  const [submitResult, setSubmitResult] = useState<ExecutionBatchResponse | null>(null);
  const [dryRunResult, setDryRunResult] = useState<DryRunTraceResult | null>(null);
  const [qualityReport, setQualityReport] = useState<CodeQualityReport | null>(null);
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionRecord | null>(null);
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [copiedSol, setCopiedSol] = useState(false);

  // Initialize Pyodide WebAssembly runtime once and reuse across all exercises
  const pyodideRuntime = usePyodideRuntime(true);

  // Resizable split ratios
  const containerRef = useRef<HTMLDivElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);
  const [leftWidthPct, setLeftWidthPct] = useState(44);
  const [editorHeightPct, setEditorHeightPct] = useState(62);
  const draggingRef = useRef<'horizontal' | 'vertical' | null>(null);

  const detailQuery = useQuery({
    queryKey: ['question-detail', slug, user?.id ?? 'anon'],
    queryFn: () => apiFetch<QuestionDetailResponse>(`/api/questions/${slug}`),
    enabled: Boolean(slug),
  });

  const solutionQuery = useQuery({
    queryKey: ['question-solution', slug],
    queryFn: () =>
      apiFetch<{ solution: { reference_code: string; explanation: string } }>(`/api/questions/${slug}/solution`),
    enabled: Boolean(slug && showSolution),
  });

  const submissionsQuery = useQuery({
    queryKey: ['question-submissions', slug, user?.id ?? 'anon'],
    queryFn: () => apiFetch<{ submissions: SubmissionRecord[] }>(`/api/questions/${slug}/submissions`),
    enabled: Boolean(slug && user && leftTab === 'submissions'),
  });

  // Reset local workbench state when navigating to another question
  useEffect(() => {
    setLeftTab('description');
    setBottomTab('test_cases');
    setRevealedHints(0);
    setUsedHints([]);
    setShowSolution(false);
    setRunResult(null);
    setSubmitResult(null);
    setDryRunResult(null);
    setQualityReport(null);
    setSelectedSubmission(null);
    setCompareIds([]);
    setCompareModalOpen(false);
    setLastSavedText('');
  }, [slug]);

  // Populate editor from saved_code -> guest localStorage -> DB starter_code
  useEffect(() => {
    const data = detailQuery.data;
    if (!data) return;
    const guestDraftKey = `pm_draft_${data.question.slug}`;
    const guestDraft = !user ? localStorage.getItem(guestDraftKey) : null;
    const initialCode = data.user_state.saved_code ?? guestDraft ?? data.question.starter_code;
    setCode(initialCode);
    const serverUsedHints = data.user_state.used_hints ?? [];
    if (serverUsedHints.length > 0) {
      setUsedHints(serverUsedHints);
      setRevealedHints((prev) => Math.max(prev, Math.max(...serverUsedHints)));
    }
    if (data.public_test_cases.length > 0) {
      setCustomInput(data.public_test_cases[0].input_data);
    } else {
      setCustomInput('');
    }
  }, [detailQuery.data, user]);

  // Resizable divider mouse handlers
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      if (draggingRef.current === 'horizontal' && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const pct = ((e.clientX - rect.left) / rect.width) * 100;
        setLeftWidthPct(Math.min(68, Math.max(26, pct)));
      } else if (draggingRef.current === 'vertical' && rightPaneRef.current) {
        const rect = rightPaneRef.current.getBoundingClientRect();
        const pct = ((e.clientY - rect.top) / rect.height) * 100;
        setEditorHeightPct(Math.min(82, Math.max(28, pct)));
      }
    };
    const onMouseUp = () => {
      draggingRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const startDrag = (dir: 'horizontal' | 'vertical') => {
    draggingRef.current = dir;
    document.body.style.cursor = dir === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  };

  // Save draft mutation
  const saveMutation = useMutation({
    mutationFn: async (sourceCode: string) => {
      if (!detailQuery.data) return;
      if (!user) {
        localStorage.setItem(`pm_draft_${detailQuery.data.question.slug}`, sourceCode);
        return;
      }
      await apiFetch(`/api/saved-code/${detailQuery.data.question.slug}`, {
        method: 'PUT',
        body: JSON.stringify({ source_code: sourceCode }),
      });
    },
    onSuccess: () => {
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setLastSavedText(user ? `Saved at ${now}` : `Draft cached at ${now}`);
    },
  });

  // Auto-save draft after 2.5s of inactivity
  useEffect(() => {
    if (!detailQuery.data || !code) return;
    const timer = setTimeout(() => {
      if (user) {
        void apiFetch(`/api/saved-code/${detailQuery.data.question.slug}`, {
          method: 'PUT',
          body: JSON.stringify({ source_code: code }),
        })
          .then(() => {
            const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            setLastSavedText(`Auto-saved ${now}`);
          })
          .catch(() => {});
      } else {
        localStorage.setItem(`pm_draft_${detailQuery.data.question.slug}`, code);
      }
    }, 2500);
    return () => clearTimeout(timer);
  }, [code, detailQuery.data, user]);

  // Run public tests or custom input in browser Pyodide Web Worker
  const runMutation = useMutation({
    mutationFn: async (useCustom: boolean) => {
      if (!detailQuery.data) throw new Error('Question not loaded');
      if (pyodideRuntime.status !== 'ready') {
        throw new Error(pyodideRuntime.error || 'Python WebAssembly runtime is still initializing.');
      }
      if (useCustom) {
        return runCustomInputInPyodide({
          sourceCode: code,
          evaluationMode: detailQuery.data.question.evaluation_mode,
          functionName: detailQuery.data.question.function_name,
          customInput,
        });
      }
      return runTestCasesInPyodide({
        sourceCode: code,
        evaluationMode: detailQuery.data.question.evaluation_mode,
        functionName: detailQuery.data.question.function_name,
        testCases: detailQuery.data.public_test_cases,
        includeHiddenDetails: false,
        mode: 'public_tests',
      });
    },
    onSuccess: (data) => {
      setRunResult(data);
      setBottomTab('test_results');
    },
  });

  // Dry run trace mutation
  const dryRunMutation = useMutation({
    mutationFn: async () => {
      if (!detailQuery.data) throw new Error('Question not loaded');
      if (pyodideRuntime.status !== 'ready') {
        throw new Error(pyodideRuntime.error || 'Python WebAssembly runtime is still initializing.');
      }
      const fallbackInput =
        customInput || detailQuery.data.public_test_cases[0]?.input_data || '[]';
      return traceExecutionInPyodide({
        sourceCode: code,
        evaluationMode: detailQuery.data.question.evaluation_mode,
        functionName: detailQuery.data.question.function_name,
        inputData: fallbackInput,
      });
    },
    onSuccess: (data) => {
      setDryRunResult(data);
      setBottomTab('dry_run');
    },
  });

  // Code quality static analyzer mutation
  const qualityMutation = useMutation({
    mutationFn: async () => {
      if (pyodideRuntime.status !== 'ready') {
        throw new Error(pyodideRuntime.error || 'Python WebAssembly runtime is still initializing.');
      }
      return analyzeCodeQualityInPyodide(code);
    },
    onSuccess: (data) => {
      setQualityReport(data);
      setBottomTab('code_quality');
    },
  });

  // Submit against ALL public + hidden test cases in Pyodide Web Worker, then persist if authenticated
  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!detailQuery.data) throw new Error('Question not loaded');
      if (pyodideRuntime.status !== 'ready') {
        throw new Error(pyodideRuntime.error || 'Python WebAssembly runtime is still initializing.');
      }

      const evalData = await apiFetch<{ test_cases: EvalTestCase[] }>(
        `/api/questions/${detailQuery.data.question.slug}/eval-tests`
      );

      const batchResult = await runTestCasesInPyodide({
        sourceCode: code,
        evaluationMode: detailQuery.data.question.evaluation_mode,
        functionName: detailQuery.data.question.function_name,
        testCases: evalData.test_cases,
        includeHiddenDetails: false,
      });

      if (!user) {
        return batchResult;
      }

      return apiFetch<ExecutionBatchResponse>('/api/execute/submit', {
        method: 'POST',
        body: JSON.stringify({
          question_id: detailQuery.data.question.slug,
          source_code: code,
          status: batchResult.status,
          passed_count: batchResult.passed_count,
          total_count: batchResult.total_count,
          execution_time_ms: batchResult.execution_time_ms,
          memory_kb: batchResult.memory_kb,
          error_output: batchResult.error_output,
          results: batchResult.results,
          engine: batchResult.engine,
          hints_used: usedHints,
        }),
      });
    },
    onSuccess: (data) => {
      setSubmitResult(data);
      setRunResult(data);
      setBottomTab('submission_output');
      if (user) {
        void queryClient.invalidateQueries({ queryKey: ['question-detail', slug] });
        void queryClient.invalidateQueries({ queryKey: ['question-submissions', slug] });
        void queryClient.invalidateQueries({ queryKey: ['analytics-overview'] });
        void queryClient.invalidateQueries({ queryKey: ['daily-challenge'] });
        void queryClient.invalidateQueries({ queryKey: ['revisions-dashboard'] });
        void queryClient.invalidateQueries({ queryKey: ['questions'] });
        void queryClient.invalidateQueries({ queryKey: ['categories'] });
      }
    },
  });

  const bookmarkMutation = useMutation({
    mutationFn: async () => {
      if (!detailQuery.data) return;
      if (!user) {
        openAuthModal('login');
        throw new Error('Auth required');
      }
      const active = detailQuery.data.user_state.is_bookmarked;
      return apiFetch(`/api/bookmarks/${detailQuery.data.question.slug}`, {
        method: active ? 'DELETE' : 'POST',
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['question-detail', slug] });
      void queryClient.invalidateQueries({ queryKey: ['analytics-overview'] });
    },
  });

  const revisionMutation = useMutation({
    mutationFn: async () => {
      if (!detailQuery.data) return;
      if (!user) {
        openAuthModal('login');
        throw new Error('Auth required');
      }
      const active = detailQuery.data.user_state.is_revision;
      if (active) {
        await apiFetch(`/api/revisions/${detailQuery.data.question.slug}`, { method: 'DELETE' });
      } else {
        await apiFetch(`/api/revisions/${detailQuery.data.question.slug}`, {
          method: 'POST',
          body: JSON.stringify({ priority: 'Medium', notes: '' }),
        });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['question-detail', slug] });
      void queryClient.invalidateQueries({ queryKey: ['analytics-overview'] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (status: ProgressStatus) => {
      if (!detailQuery.data) return;
      if (!user) {
        openAuthModal('login');
        throw new Error('Auth required');
      }
      return apiFetch(`/api/progress/${detailQuery.data.question.slug}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['question-detail', slug] });
      void queryClient.invalidateQueries({ queryKey: ['analytics-overview'] });
      void queryClient.invalidateQueries({ queryKey: ['questions'] });
    },
  });

  const handleRun = useCallback(() => {
    runMutation.mutate(bottomTab === 'custom_input');
  }, [bottomTab, runMutation]);

  const handleSubmit = useCallback(() => {
    submitMutation.mutate();
  }, [submitMutation]);

  const handleReset = useCallback(() => {
    if (!detailQuery.data) return;
    setCode(detailQuery.data.question.starter_code);
    if (!user) {
      localStorage.removeItem(`pm_draft_${detailQuery.data.question.slug}`);
    }
  }, [detailQuery.data, user]);

  if (detailQuery.isLoading) {
    return (
      <Layout fullBleed>
        <div className="p-6 space-y-4">
          <div className="h-10 w-1/2 rounded bg-zinc-900 animate-pulse" />
          <div className="h-[75vh] rounded-lg border border-zinc-800 bg-[#11141B] animate-pulse" />
        </div>
      </Layout>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <Layout>
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-300 space-y-3">
          <div>Unable to load this Python exercise.</div>
          <Link to="/problems" className="inline-block text-xs text-blue-400 hover:text-blue-300">
            ← Return to Python Problems
          </Link>
        </div>
      </Layout>
    );
  }

  const { question, public_test_cases, hints, user_state, prev_question, next_question } = detailQuery.data;

  return (
    <Layout fullBleed>
      <div className="flex flex-col h-[calc(100vh-3.5rem)] min-h-0">
        {/* Compact Workbench Sub-header */}
        <div className="h-11 px-4 border-b border-zinc-800/80 bg-[#0F1218] flex items-center justify-between gap-3 shrink-0 overflow-x-auto">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              to={`/problems/category/${question.category_slug}`}
              className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {question.category_name}
            </Link>
            <span className="text-zinc-700">/</span>
            <span className="font-mono text-xs text-zinc-400 tabular-nums shrink-0">#{question.question_number}</span>
            <h1 className="text-xs font-semibold text-white truncate">{question.title}</h1>
            <span className="text-zinc-700 hidden md:inline">·</span>
            <span className="hidden md:inline shrink-0">
              <DifficultyText difficulty={question.difficulty} />
            </span>
            <span className="text-zinc-700 hidden xl:inline">·</span>
            <span className="hidden xl:inline text-xs text-zinc-400 whitespace-nowrap shrink-0">
              {QUESTION_TYPE_LABELS[question.question_type]}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <select
              aria-label="Question status"
              value={user_state.status}
              onChange={(e) => statusMutation.mutate(e.target.value as ProgressStatus)}
              className="rounded border border-zinc-800 bg-[#0B0D11] px-2 py-1 text-[11px] text-zinc-300 focus:border-blue-500 focus:outline-none"
            >
              <option value="Not Started">Not Started</option>
              <option value="Attempted">Attempted</option>
              <option value="Solved">Solved</option>
              <option value="Needs Revision">Needs Revision</option>
            </select>

            <button
              type="button"
              onClick={() => setNoteModalOpen(true)}
              title="Add personal note for this question"
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded border border-zinc-800 bg-[#0B0D11] text-zinc-300 hover:text-white text-[11px] whitespace-nowrap shrink-0"
            >
              <StickyNote className="h-3.5 w-3.5 text-blue-400" />
              <span className="hidden sm:inline">Note</span>
            </button>

            <button
              type="button"
              onClick={() => bookmarkMutation.mutate()}
              title={user_state.is_bookmarked ? 'Remove bookmark' : 'Bookmark problem'}
              className={`p-1.5 rounded border text-xs transition-colors ${
                user_state.is_bookmarked
                  ? 'border-blue-500/40 bg-blue-500/10 text-blue-400'
                  : 'border-zinc-800 bg-[#0B0D11] text-zinc-400 hover:text-white'
              }`}
            >
              <Bookmark className="h-3.5 w-3.5" fill={user_state.is_bookmarked ? 'currentColor' : 'none'} />
            </button>

            <button
              type="button"
              onClick={() => revisionMutation.mutate()}
              title={user_state.is_revision ? 'Remove from revision tracker' : 'Mark for revision'}
              className={`p-1.5 rounded border text-xs transition-colors ${
                user_state.is_revision
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                  : 'border-zinc-800 bg-[#0B0D11] text-zinc-400 hover:text-white'
              }`}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>

            <div className="flex items-center border border-zinc-800 rounded bg-[#0B0D11] overflow-hidden">
              <button
                type="button"
                disabled={!prev_question}
                onClick={() => prev_question && navigate(`/problems/${prev_question.slug}`)}
                title={prev_question ? `Previous: #${prev_question.question_number} ${prev_question.title}` : 'No previous question'}
                className="p-1.5 text-zinc-400 hover:text-white disabled:opacity-30"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <div className="w-px h-4 bg-zinc-800" />
              <button
                type="button"
                disabled={!next_question}
                onClick={() => next_question && navigate(`/problems/${next_question.slug}`)}
                title={next_question ? `Next: #${next_question.question_number} ${next_question.title}` : 'No next question'}
                className="p-1.5 text-zinc-400 hover:text-white disabled:opacity-30"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Resizable Split Workbench */}
        <div
          ref={containerRef}
          className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden"
        >
          {/* Left Panel: Problem Statement / Hints / Solution / Submissions */}
          <section
            style={{ '--left-w': `${leftWidthPct}%` } as React.CSSProperties}
            className="w-full lg:w-[var(--left-w)] h-1/2 lg:h-full flex flex-col min-h-0 border-b lg:border-b-0 border-zinc-800 bg-[#0F1218]"
          >
            {/* Left Tabs */}
            <div className="h-10 px-3 border-b border-zinc-800/80 flex items-center gap-1 shrink-0 overflow-x-auto">
              {(
                [
                  { id: 'description', label: 'Description' },
                  { id: 'hints', label: `Hints (${hints.length})` },
                  { id: 'solution', label: 'Solution' },
                  { id: 'submissions', label: 'Submissions' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setLeftTab(t.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    leftTab === t.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Left Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5 text-sm">
              {leftTab === 'description' && (
                <>
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                      <DifficultyText difficulty={question.difficulty} />
                      <span>·</span>
                      <span className="text-zinc-300">{question.concept_name}</span>
                      <span>·</span>
                      <ProgressStatusText status={user_state.status} />
                    </div>
                    <h2 className="text-lg font-semibold text-white">
                      {question.question_number}. {question.title}
                    </h2>
                  </div>

                  <div className="text-[13.5px] leading-relaxed text-zinc-200 whitespace-pre-wrap">
                    {question.problem_statement}
                  </div>

                  {/* Examples */}
                  {question.examples.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Examples</h3>
                      {question.examples.map((ex, idx) => (
                        <div
                          key={idx}
                          className="rounded-md border border-zinc-800 bg-[#0B0D11] p-3.5 font-mono text-xs space-y-1.5"
                        >
                          <div>
                            <span className="text-zinc-500">Input: </span>
                            <span className="text-zinc-200">{ex.input}</span>
                          </div>
                          <div>
                            <span className="text-zinc-500">Output: </span>
                            <span className="text-emerald-400">{ex.output}</span>
                          </div>
                          {ex.explanation && (
                            <div className="text-zinc-400 font-sans pt-1">{ex.explanation}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Formats & Constraints */}
                  <div className="space-y-3 pt-2 border-t border-zinc-800/80 text-xs">
                    <div>
                      <span className="font-semibold text-zinc-300">Input Format: </span>
                      <span className="text-zinc-400">{question.input_format}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-zinc-300">Output Format: </span>
                      <span className="text-zinc-400">{question.output_format}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-zinc-300">Constraints: </span>
                      <span className="text-zinc-400">{question.constraints}</span>
                    </div>
                    {question.related_concepts.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="font-semibold text-zinc-300">Concepts:</span>
                        <span className="text-zinc-400">{question.related_concepts.join(' · ')}</span>
                      </div>
                    )}
                  </div>
                </>
              )}

              {leftTab === 'hints' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-white">Progressive Python Hints</h3>
                      <p className="text-[11px] text-zinc-500 mt-0.5 tabular-nums">
                        {usedHints.length} of {hints.length} hints revealed · Tracked on your next submission
                      </p>
                    </div>
                    {revealedHints < hints.length && (
                      <button
                        type="button"
                        onClick={() => {
                          const nextOrder = revealedHints + 1;
                          setRevealedHints(nextOrder);
                          setUsedHints((prev) =>
                            prev.includes(nextOrder) ? prev : [...prev, nextOrder].sort((a, b) => a - b)
                          );
                          if (user) {
                            void apiFetch(`/api/questions/${question.slug}/hints/${nextOrder}/use`, {
                              method: 'POST',
                            })
                              .then(() => {
                                void queryClient.invalidateQueries({ queryKey: ['analytics-overview'] });
                              })
                              .catch(() => {});
                          }
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-300 hover:bg-blue-500/20 whitespace-nowrap shrink-0"
                      >
                        <Lightbulb className="h-3.5 w-3.5" />
                        Reveal Hint {revealedHints + 1} of {hints.length}
                      </button>
                    )}
                  </div>

                  {hints.length === 0 ? (
                    <p className="text-xs text-zinc-400">No hints configured for this exercise.</p>
                  ) : revealedHints === 0 ? (
                    <div className="rounded-md border border-zinc-800 bg-[#0B0D11] p-4 text-xs text-zinc-400 space-y-1.5">
                      <div>
                        Attempt the exercise independently first. Three progressive hints guide you from problem intuition to approach and pseudocode without revealing the reference solution.
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {hints.slice(0, revealedHints).map((h) => (
                        <div key={h.id} className="rounded-md border border-zinc-800 bg-[#0B0D11] p-3.5 space-y-1.5">
                          <div className="text-[11px] font-mono text-amber-400">
                            {HINT_STAGE_TITLES[h.order_index] ?? `Hint #${h.order_index}`}
                          </div>
                          <div className="text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap">
                            {h.hint_text}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {leftTab === 'solution' && (
                <div className="space-y-4">
                  {!showSolution ? (
                    <div className="rounded-md border border-zinc-800 bg-[#0B0D11] p-5 text-center space-y-3">
                      <Eye className="h-6 w-6 text-zinc-400 mx-auto" />
                      <div>
                        <h3 className="text-sm font-semibold text-white">Reveal Reference Python Solution</h3>
                        <p className="text-xs text-zinc-400 mt-1">
                          Inspect idiomatic Python code and the engineering explanation behind it.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowSolution(true)}
                        className="rounded-md bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-medium text-white"
                      >
                        Show Reference Solution
                      </button>
                    </div>
                  ) : solutionQuery.isLoading ? (
                    <div className="h-40 rounded bg-zinc-900 animate-pulse" />
                  ) : solutionQuery.data?.solution ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-white">Reference Solution</h3>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard.writeText(solutionQuery.data.solution.reference_code);
                              setCopiedSol(true);
                              setTimeout(() => setCopiedSol(false), 1500);
                            }}
                            className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-[#0B0D11] px-2.5 py-1 text-xs text-zinc-300 hover:text-white"
                          >
                            {copiedSol ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                            {copiedSol ? 'Copied' : 'Copy'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setCode(solutionQuery.data.solution.reference_code)}
                            className="rounded border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-xs text-blue-300 hover:bg-blue-500/20"
                          >
                            Load into Editor
                          </button>
                        </div>
                      </div>
                      <pre className="rounded-md border border-zinc-800 bg-[#0B0D11] p-4 font-mono text-xs text-emerald-300 overflow-x-auto leading-relaxed">
                        {solutionQuery.data.solution.reference_code}
                      </pre>
                      <div className="rounded-md border border-zinc-800 bg-[#0B0D11] p-4 space-y-1.5">
                        <div className="text-xs font-semibold text-zinc-200">Explanation</div>
                        <p className="text-xs text-zinc-400 leading-relaxed">
                          {solutionQuery.data.solution.explanation}
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {leftTab === 'submissions' && (
                <div className="space-y-3">
                  {!user ? (
                    <div className="rounded-md border border-zinc-800 bg-[#0B0D11] p-5 text-center space-y-2">
                      <p className="text-xs text-zinc-400">Sign in to inspect your personal submission history for this exercise.</p>
                      <button
                        type="button"
                        onClick={() => openAuthModal('login')}
                        className="text-xs font-medium text-blue-400 hover:text-blue-300"
                      >
                        Sign In →
                      </button>
                    </div>
                  ) : submissionsQuery.isLoading ? (
                    <div className="h-32 rounded bg-zinc-900 animate-pulse" />
                  ) : (submissionsQuery.data?.submissions ?? []).length === 0 ? (
                    <div className="rounded-md border border-zinc-800 bg-[#0B0D11] p-5 text-center text-xs text-zinc-400">
                      No submissions recorded for this exercise yet. Click Submit to evaluate against all public &amp; hidden tests.
                    </div>
                  ) : (
                    <>
                      {(submissionsQuery.data?.submissions ?? []).length >= 2 && (
                        <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-400">
                          <span>Select any 2 attempts to compare code changes:</span>
                          <button
                            type="button"
                            disabled={compareIds.length !== 2}
                            onClick={() => setCompareModalOpen(true)}
                            className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 px-2.5 py-1 text-[11px] font-medium text-zinc-200 whitespace-nowrap"
                          >
                            <ArrowLeftRight className="h-3 w-3 text-blue-400" />
                            Compare ({compareIds.length}/2)
                          </button>
                        </div>
                      )}

                      <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-md overflow-hidden">
                        {submissionsQuery.data!.submissions.map((sub) => {
                          const checked = compareIds.includes(sub.id);
                          return (
                            <div
                              key={sub.id}
                              className="px-3.5 py-2.5 bg-[#0B0D11] hover:bg-zinc-800/40 flex items-center justify-between gap-2 text-xs transition-colors"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  aria-label={`Select submission #${sub.id} for comparison`}
                                  onChange={() => {
                                    setCompareIds((prev) =>
                                      prev.includes(sub.id)
                                        ? prev.filter((x) => x !== sub.id)
                                        : prev.length >= 2
                                        ? [prev[1], sub.id]
                                        : [...prev, sub.id]
                                    );
                                  }}
                                  className="rounded border-zinc-700 bg-zinc-900 accent-blue-600 shrink-0"
                                />
                                <button
                                  type="button"
                                  onClick={() => setSelectedSubmission(selectedSubmission?.id === sub.id ? null : sub)}
                                  className="text-left min-w-0"
                                >
                                  <SubmissionVerdictText status={sub.status} />
                                  <div className="text-[11px] text-zinc-500 mt-0.5 tabular-nums truncate">
                                    {sub.passed_count}/{sub.total_count} passed · {sub.execution_time_ms}ms ·{' '}
                                    {sub.hints_used ?? 0} hints · {new Date(sub.created_at + 'Z').toLocaleString()}
                                  </div>
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => setSelectedSubmission(selectedSubmission?.id === sub.id ? null : sub)}
                                className="text-[11px] text-blue-400 shrink-0"
                              >
                                {selectedSubmission?.id === sub.id ? 'Hide' : 'Inspect'}
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {selectedSubmission && (
                        <div className="rounded-md border border-zinc-800 bg-[#0B0D11] p-3.5 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-zinc-200">
                              Submission #{selectedSubmission.id} Source
                            </span>
                            <button
                              type="button"
                              onClick={() => setCode(selectedSubmission.source_code)}
                              className="text-xs text-blue-400 hover:text-blue-300"
                            >
                              Restore into Editor
                            </button>
                          </div>
                          <pre className="font-mono text-xs text-zinc-300 overflow-x-auto max-h-60">
                            {selectedSubmission.source_code}
                          </pre>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Horizontal Resizer Handle */}
          <div
            onMouseDown={() => startDrag('horizontal')}
            role="separator"
            aria-orientation="vertical"
            title="Drag to resize panels"
            className="hidden lg:block w-1.5 bg-zinc-900 hover:bg-blue-600/60 cursor-col-resize shrink-0 transition-colors"
          />

          {/* Right Panel: Monaco Editor + Bottom Execution Console */}
          <section
            ref={rightPaneRef}
            className="flex-1 h-1/2 lg:h-full flex flex-col min-h-0 min-w-0 bg-[#0C0E12]"
          >
            {/* Editor Container */}
            <div style={{ height: `${editorHeightPct}%` }} className="min-h-0">
              <PythonEditor
                value={code}
                onChange={setCode}
                onRun={handleRun}
                onSubmit={handleSubmit}
                onSave={() => saveMutation.mutate(code)}
                onReset={handleReset}
                isRunning={runMutation.isPending}
                isSubmitting={submitMutation.isPending}
                isSaving={saveMutation.isPending}
                lastSavedText={lastSavedText}
                runtimeStatus={pyodideRuntime.status}
                pythonVersion={pyodideRuntime.pythonVersion}
                runtimeError={pyodideRuntime.error}
                onRetryRuntime={() => void pyodideRuntime.retry()}
              />
            </div>

            {/* Vertical Resizer Handle */}
            <div
              onMouseDown={() => startDrag('vertical')}
              role="separator"
              aria-orientation="horizontal"
              title="Drag to resize output console"
              className="h-1.5 bg-zinc-900 hover:bg-blue-600/60 cursor-row-resize shrink-0 border-y border-zinc-800/80 transition-colors"
            />

            {/* Bottom Execution Panel */}
            <div className="flex-1 min-h-0 flex flex-col bg-[#0F1218]">
              <div className="h-9 px-3 border-b border-zinc-800/80 flex items-center justify-between gap-2 shrink-0 overflow-x-auto">
                <div className="flex items-center gap-1">
                  {(
                    [
                      { id: 'test_cases', label: `Test Cases (${public_test_cases.length})` },
                      { id: 'test_results', label: 'Test Results' },
                      { id: 'dry_run', label: 'Dry Run' },
                      { id: 'code_quality', label: 'Code Quality' },
                      { id: 'custom_input', label: 'Custom Input' },
                      { id: 'submission_output', label: 'Submission' },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setBottomTab(t.id)}
                      className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                        bottomTab === t.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <span className="hidden sm:inline text-[11px] font-mono text-zinc-500 whitespace-nowrap">
                  +{question.hidden_test_count} hidden tests on Submit
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-3.5 text-xs space-y-3">
                {bottomTab === 'test_cases' && (
                  <div className="space-y-2.5">
                    {public_test_cases.map((tc) => (
                      <div key={tc.id} className="rounded-md border border-zinc-800 bg-[#0B0D11] p-3 space-y-1.5">
                        <div className="text-[11px] font-medium text-zinc-400">
                          Case #{tc.order_index} · {tc.description}
                        </div>
                        <div className="font-mono text-[11px]">
                          <span className="text-zinc-500">Input: </span>
                          <span className="text-zinc-200 whitespace-pre-wrap">{tc.input_data}</span>
                        </div>
                        <div className="font-mono text-[11px]">
                          <span className="text-zinc-500">Expected: </span>
                          <span className="text-emerald-400 whitespace-pre-wrap">{tc.expected_output}</span>
                        </div>
                      </div>
                    ))}
                    <div className="text-[11px] text-zinc-500 pt-1">
                      Note: Code executes client-side inside your browser&apos;s Pyodide WebAssembly runtime; hidden test cases are intended for personal practice.
                    </div>
                  </div>
                )}

                {bottomTab === 'test_results' && (
                  <ExecutionResultsView
                    result={runResult}
                    isLoading={runMutation.isPending || submitMutation.isPending}
                    error={runMutation.error?.message}
                    emptyMessage="Click Run (Ctrl+Enter) to execute your Python code against public test cases."
                  />
                )}

                {bottomTab === 'dry_run' && (
                  <DryRunVisualizer
                    sourceCode={code}
                    trace={dryRunResult}
                    isLoading={dryRunMutation.isPending}
                    error={dryRunMutation.error?.message}
                    runtimeReady={pyodideRuntime.status === 'ready'}
                    onRunDryRun={() => dryRunMutation.mutate()}
                  />
                )}

                {bottomTab === 'code_quality' && (
                  <CodeQualityPanel
                    report={qualityReport}
                    isLoading={qualityMutation.isPending}
                    runtimeReady={pyodideRuntime.status === 'ready'}
                    onAnalyze={() => qualityMutation.mutate()}
                    onApplyFormat={(formatted) => setCode(formatted)}
                  />
                )}

                {bottomTab === 'custom_input' && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-400">
                        {question.evaluation_mode === 'function'
                          ? 'Enter JSON argument array (e.g. [1, 2]) or {"__kw__": true, "args": [...], "kwargs": {...}}:'
                          : question.evaluation_mode === 'stdout'
                          ? 'Enter standard input (stdin) lines:'
                          : 'Enter Python assertion script to run against your solution:'}
                      </span>
                      <button
                        type="button"
                        disabled={pyodideRuntime.status !== 'ready' || runMutation.isPending}
                        onClick={() => runMutation.mutate(true)}
                        className="inline-flex items-center gap-1 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1 text-xs font-medium text-white whitespace-nowrap"
                      >
                        <Play className="h-3 w-3" />
                        Run Custom Input
                      </button>
                    </div>
                    <textarea
                      value={customInput}
                      onChange={(e) => setCustomInput(e.target.value)}
                      rows={4}
                      spellCheck={false}
                      className="w-full rounded-md border border-zinc-800 bg-[#0B0D11] p-3 font-mono text-xs text-zinc-200 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                )}

                {bottomTab === 'submission_output' && (
                  <div className="space-y-3">
                    {!user && submitResult && (
                      <div className="rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 flex items-center justify-between gap-2 text-xs text-blue-300">
                        <span>Evaluated locally in Pyodide. Sign in to persist submissions and track streaks.</span>
                        <button
                          type="button"
                          onClick={() => openAuthModal('login')}
                          className="font-medium text-white underline underline-offset-2 whitespace-nowrap shrink-0"
                        >
                          Sign In
                        </button>
                      </div>
                    )}
                    <ExecutionResultsView
                      result={submitResult}
                      isLoading={submitMutation.isPending}
                      error={submitMutation.error?.message}
                      emptyMessage="Click Submit (Ctrl+Shift+Enter) to evaluate against all public and hidden test cases."
                    />
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>

      <QuickNoteModal
        isOpen={noteModalOpen}
        onClose={() => setNoteModalOpen(false)}
        defaultType="question"
        defaultRef={question.slug}
        defaultTitle={`#${question.question_number} ${question.title}`}
      />

      {compareModalOpen && compareIds.length === 2 && (
        <SubmissionDiffModal
          left={(submissionsQuery.data?.submissions ?? []).find((s) => s.id === compareIds[0]) ?? null}
          right={(submissionsQuery.data?.submissions ?? []).find((s) => s.id === compareIds[1]) ?? null}
          onClose={() => setCompareModalOpen(false)}
        />
      )}
    </Layout>
  );
}

function ExecutionResultsView({
  result,
  isLoading,
  error,
  emptyMessage,
}: {
  result: ExecutionBatchResponse | null;
  isLoading: boolean;
  error?: string;
  emptyMessage: string;
}) {
  if (isLoading) {
    return (
      <div className="p-4 rounded-md border border-zinc-800 bg-[#0B0D11] text-xs text-zinc-400">
        Executing Python in Pyodide WebAssembly Worker...
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-3.5 rounded-md border border-rose-500/30 bg-rose-500/10 text-xs text-rose-300">
        {error}
      </div>
    );
  }
  if (!result) {
    return <div className="p-4 text-xs text-zinc-500">{emptyMessage}</div>;
  }

  if (result.mode === 'custom') {
    return (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <SubmissionVerdictText status={result.status} />
          <span className="font-mono text-[11px] text-zinc-400 tabular-nums">
            {result.execution_time_ms}ms · {result.engine}
          </span>
        </div>
        {result.stdout && (
          <div className="rounded-md border border-zinc-800 bg-[#0B0D11] p-3 font-mono text-xs text-emerald-300 whitespace-pre-wrap">
            {result.stdout}
          </div>
        )}
        {result.stderr && (
          <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 font-mono text-xs text-rose-300 whitespace-pre-wrap">
            {result.stderr}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <SubmissionVerdictText status={result.status} />
          <span className="font-mono text-xs text-zinc-300 tabular-nums">
            {result.passed_count} / {result.total_count} test cases passed
          </span>
        </div>
        <span className="font-mono text-[11px] text-zinc-500 tabular-nums">
          {result.execution_time_ms}ms · {Math.round((result.memory_kb || 0) / 1024)} MB · {result.engine}
        </span>
      </div>

      {result.error_output && (
        <pre className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 font-mono text-[11px] text-rose-300 whitespace-pre-wrap overflow-x-auto">
          {result.error_output}
        </pre>
      )}

      <div className="space-y-2">
        {result.results.map((tc) => {
          const tcVerdict =
            tc.verdict ??
            (tc.passed
              ? 'Passed'
              : tc.status === 'Time Limit Exceeded'
              ? 'Time Limit Exceeded'
              : tc.status === 'Runtime Error'
              ? 'Runtime Error'
              : 'Failed');
          const verdictColor =
            tcVerdict === 'Passed'
              ? 'text-emerald-400'
              : tcVerdict === 'Time Limit Exceeded'
              ? 'text-amber-400'
              : 'text-rose-400';

          return (
            <div
              key={`${tc.test_case_id}-${tc.order_index}`}
              className="rounded-md border border-zinc-800 bg-[#0B0D11] p-3 space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-medium text-zinc-200">
                  {tc.passed ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                  )}
                  <span>{tc.description}</span>
                  {tc.is_hidden && <Lock className="h-3 w-3 text-zinc-500" />}
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <span className={`text-[11px] font-semibold ${verdictColor}`}>{tcVerdict}</span>
                  <span className="font-mono text-[11px] text-zinc-500 tabular-nums">{tc.execution_time_ms}ms</span>
                </div>
              </div>

              {!tc.is_hidden && (
                <div className="font-mono text-[11px] space-y-1 pt-1">
                  {tc.input !== undefined && (
                    <div>
                      <span className="text-zinc-500">Input: </span>
                      <span className="text-zinc-300">{tc.input}</span>
                    </div>
                  )}
                  {tc.expected_output !== undefined && (
                    <div>
                      <span className="text-zinc-500">Expected Output: </span>
                      <span className="text-emerald-400">{tc.expected_output}</span>
                    </div>
                  )}
                  {tc.actual_output !== undefined && (
                    <div>
                      <span className="text-zinc-500">Actual Output: </span>
                      <span className={tc.passed ? 'text-emerald-300' : 'text-rose-300'}>{tc.actual_output || '(empty)'}</span>
                    </div>
                  )}
                  {tc.error && <div className="text-rose-400 whitespace-pre-wrap">{tc.error}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
