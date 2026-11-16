import { useEffect, useSyncExternalStore } from 'react';
import type { ExecutionBatchResponse, SubmissionStatus, TestCaseExecutionResult } from './api';
import { MAX_SOURCE_BYTES } from './pythonHarness';

export type PyodideRuntimeStatus = 'idle' | 'initializing' | 'ready' | 'error';

export interface PyodideRuntimeSnapshot {
  status: PyodideRuntimeStatus;
  pythonVersion: string | null;
  error: string | null;
}

export interface PyodideTestCaseInput {
  id: number;
  order_index: number;
  input_data: string;
  expected_output: string;
  description: string;
  is_hidden?: boolean | number;
}

export interface DryRunVariable {
  name: string;
  value: string;
  type: string;
}

export interface DryRunTraceStep {
  step_index: number;
  event: 'call' | 'line' | 'return' | 'exception';
  line_number: number;
  line_code: string;
  function_name: string;
  call_stack: string[];
  variables: DryRunVariable[];
  return_value: string | null;
  stdout: string;
}

export interface DryRunTraceResult {
  ok: boolean;
  error: string;
  steps: DryRunTraceStep[];
  truncated: boolean;
  final_stdout: string;
  return_value: string | null;
  execution_time_ms: number;
}

export interface CodeQualityIssue {
  line: number;
  column: number;
  severity: 'warning' | 'suggestion' | 'info';
  category: string;
  code: string;
  message: string;
}

export interface CodeQualityReport {
  syntax_valid: boolean;
  score: number;
  summary: {
    errors: number;
    warnings: number;
    suggestions: number;
  };
  issues: CodeQualityIssue[];
  formatted_code: string;
}

interface SingleEvalResult {
  status: SubmissionStatus;
  passed: boolean;
  actual_output: string;
  error: string;
  execution_time_ms: number;
}

const PER_TEST_TIMEOUT_MS = 3500;
const INIT_TIMEOUT_MS = 60000;

let snapshot: PyodideRuntimeSnapshot = {
  status: 'idle',
  pythonVersion: null,
  error: null,
};

const listeners = new Set<() => void>();
let worker: Worker | null = null;
let initPromise: Promise<string> | null = null;
let nextRequestId = 1;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  isTimeoutError?: boolean;
}

const pending = new Map<number, PendingRequest>();

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function setSnapshot(next: Partial<PyodideRuntimeSnapshot>) {
  snapshot = { ...snapshot, ...next };
  emitChange();
}

function teardownWorker(reason: string, markTimeout = false) {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  initPromise = null;

  for (const [id, req] of pending.entries()) {
    clearTimeout(req.timer);
    const err = new Error(reason);
    if (markTimeout) {
      (err as Error & { isTLE?: boolean }).isTLE = true;
    }
    req.reject(err);
    pending.delete(id);
  }
}

function createWorkerInstance(): Worker {
  const w = new Worker(new URL('../workers/pyodide.worker.ts', import.meta.url), {
    type: 'module',
  });

  w.onmessage = (event: MessageEvent) => {
    const data = event.data as {
      id: number;
      type:
        | 'init_success'
        | 'init_error'
        | 'eval_success'
        | 'eval_error'
        | 'trace_success'
        | 'trace_error'
        | 'analyze_success'
        | 'analyze_error';
      pythonVersion?: string;
      result?: unknown;
      error?: string;
    };

    const req = pending.get(data.id);
    if (!req) return;
    clearTimeout(req.timer);
    pending.delete(data.id);

    if (data.type === 'init_success') {
      req.resolve(data.pythonVersion || 'Python 3');
    } else if (data.type === 'eval_success' || data.type === 'trace_success' || data.type === 'analyze_success') {
      req.resolve(data.result);
    } else {
      req.reject(new Error(data.error || 'Execution error in Pyodide worker.'));
    }
  };

  w.onerror = (event: ErrorEvent) => {
    const msg = event.message || 'Pyodide Web Worker crashed unexpectedly.';
    teardownWorker(msg);
    setSnapshot({ status: 'error', error: msg });
  };

  return w;
}

export function initPyodide(): Promise<string> {
  if (snapshot.status === 'ready' && worker && snapshot.pythonVersion) {
    return Promise.resolve(snapshot.pythonVersion);
  }
  if (initPromise) {
    return initPromise;
  }

  setSnapshot({ status: 'initializing', error: null });

  initPromise = (async () => {
    if (!worker) {
      worker = createWorkerInstance();
    }

    const id = nextRequestId++;
    const version = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        teardownWorker('Python WebAssembly runtime timed out while loading.');
        reject(new Error('Python WebAssembly runtime timed out while loading.'));
      }, INIT_TIMEOUT_MS);

      pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });

      worker!.postMessage({ id, type: 'init' });
    });

    setSnapshot({
      status: 'ready',
      pythonVersion: version,
      error: null,
    });
    return version;
  })();

  initPromise.catch((err) => {
    initPromise = null;
    const msg = err instanceof Error ? err.message : 'Failed to initialize Python runtime.';
    setSnapshot({ status: 'error', error: msg });
  });

  return initPromise;
}

export function retryPyodideInit(): Promise<string> {
  teardownWorker('Reinitializing Python WebAssembly runtime.');
  setSnapshot({ status: 'idle', error: null });
  return initPyodide();
}

export function subscribePyodideStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPyodideSnapshot(): PyodideRuntimeSnapshot {
  return snapshot;
}

export function usePyodideRuntime(autoInit = true): PyodideRuntimeSnapshot & { retry: () => Promise<string> } {
  const snap = useSyncExternalStore(subscribePyodideStatus, getPyodideSnapshot, getPyodideSnapshot);

  useEffect(() => {
    if (autoInit && snap.status === 'idle') {
      void initPyodide();
    }
  }, [autoInit, snap.status]);

  return {
    ...snap,
    retry: retryPyodideInit,
  };
}

async function executeSingleTest(payload: {
  source_code: string;
  mode: string;
  function_name: string | null;
  input_data: string;
  expected_output: string;
  is_custom: boolean;
}): Promise<SingleEvalResult> {
  try {
    await initPyodide();
  } catch (err) {
    return {
      status: 'Initialization Error',
      passed: false,
      actual_output: '',
      error: err instanceof Error ? err.message : 'Python WebAssembly runtime failed to initialize.',
      execution_time_ms: 0,
    };
  }

  if (!worker) {
    return {
      status: 'Initialization Error',
      passed: false,
      actual_output: '',
      error: 'Python WebAssembly worker is unavailable.',
      execution_time_ms: 0,
    };
  }

  const id = nextRequestId++;
  try {
    return await new Promise<SingleEvalResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        teardownWorker(`Execution exceeded ${PER_TEST_TIMEOUT_MS / 1000}s time limit.`, true);
        setSnapshot({ status: 'idle', error: null });
        void initPyodide();
      }, PER_TEST_TIMEOUT_MS);

      pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });

      worker!.postMessage({
        id,
        type: 'evaluate_single',
        payload,
      });
    });
  } catch (err) {
    const isTLE = Boolean((err as Error & { isTLE?: boolean })?.isTLE);
    if (isTLE) {
      return {
        status: 'Time Limit Exceeded',
        passed: false,
        actual_output: '',
        error: `Execution exceeded ${PER_TEST_TIMEOUT_MS / 1000}s time limit (infinite loop or long computation).`,
        execution_time_ms: PER_TEST_TIMEOUT_MS,
      };
    }
    return {
      status: 'Runtime Error',
      passed: false,
      actual_output: '',
      error: err instanceof Error ? err.message : 'Python execution failed.',
      execution_time_ms: 0,
    };
  }
}

export async function traceExecutionInPyodide(params: {
  sourceCode: string;
  evaluationMode: string;
  functionName: string | null;
  inputData: string;
}): Promise<DryRunTraceResult> {
  if (!params.sourceCode.trim()) {
    return {
      ok: false,
      error: 'Please write Python code before running the Dry Run visualizer.',
      steps: [],
      truncated: false,
      final_stdout: '',
      return_value: null,
      execution_time_ms: 0,
    };
  }

  await initPyodide();
  if (!worker) {
    throw new Error('Python WebAssembly worker is unavailable.');
  }

  const id = nextRequestId++;
  try {
    return await new Promise<DryRunTraceResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        teardownWorker(`Dry run exceeded ${PER_TEST_TIMEOUT_MS / 1000}s time limit.`, true);
        setSnapshot({ status: 'idle', error: null });
        void initPyodide();
      }, PER_TEST_TIMEOUT_MS);

      pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });

      worker!.postMessage({
        id,
        type: 'trace_single',
        payload: {
          source_code: params.sourceCode,
          mode: params.evaluationMode,
          function_name: params.functionName,
          input_data: params.inputData,
        },
      });
    });
  } catch (err) {
    const isTLE = Boolean((err as Error & { isTLE?: boolean })?.isTLE);
    return {
      ok: false,
      error: isTLE
        ? `Dry run exceeded ${PER_TEST_TIMEOUT_MS / 1000}s time limit (infinite loop detected).`
        : err instanceof Error
        ? err.message
        : 'Dry run failed.',
      steps: [],
      truncated: false,
      final_stdout: '',
      return_value: null,
      execution_time_ms: isTLE ? PER_TEST_TIMEOUT_MS : 0,
    };
  }
}

export async function analyzeCodeQualityInPyodide(sourceCode: string): Promise<CodeQualityReport> {
  if (!sourceCode.trim()) {
    return {
      syntax_valid: true,
      score: 100,
      summary: { errors: 0, warnings: 0, suggestions: 0 },
      issues: [],
      formatted_code: sourceCode,
    };
  }

  await initPyodide();
  if (!worker) {
    throw new Error('Python WebAssembly worker is unavailable.');
  }

  const id = nextRequestId++;
  return await new Promise<CodeQualityReport>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Code quality analysis timed out.'));
    }, PER_TEST_TIMEOUT_MS);

    pending.set(id, {
      resolve: resolve as (v: unknown) => void,
      reject,
      timer,
    });

    worker!.postMessage({
      id,
      type: 'analyze_quality',
      payload: { source_code: sourceCode },
    });
  });
}

function toVerdict(status: SubmissionStatus, passed: boolean): TestCaseExecutionResult['verdict'] {
  if (passed) return 'Passed';
  if (status === 'Time Limit Exceeded') return 'Time Limit Exceeded';
  if (status === 'Memory Limit Exceeded') return 'Memory Limit Exceeded';
  if (status === 'Runtime Error' || status === 'Initialization Error' || status === 'Internal Execution Error') {
    return 'Runtime Error';
  }
  return 'Failed';
}

function getEngineLabel(): string {
  return snapshot.pythonVersion
    ? `Pyodide WASM (${snapshot.pythonVersion})`
    : 'Pyodide WebAssembly Worker';
}

export async function runTestCasesInPyodide(params: {
  sourceCode: string;
  evaluationMode: string;
  functionName: string | null;
  testCases: PyodideTestCaseInput[];
  includeHiddenDetails: boolean;
  mode?: 'public_tests' | undefined;
}): Promise<ExecutionBatchResponse> {
  const sourceBytes = new TextEncoder().encode(params.sourceCode).length;
  if (!params.sourceCode.trim()) {
    return {
      mode: params.mode,
      engine: getEngineLabel(),
      status: 'Runtime Error',
      passed_count: 0,
      total_count: params.testCases.length,
      execution_time_ms: 0,
      memory_kb: 0,
      error_output: 'Please write Python code before running.',
      results: [],
    };
  }

  if (sourceBytes > MAX_SOURCE_BYTES) {
    return {
      mode: params.mode,
      engine: getEngineLabel(),
      status: 'Runtime Error',
      passed_count: 0,
      total_count: params.testCases.length,
      execution_time_ms: 0,
      memory_kb: 0,
      error_output: `Source code exceeds maximum allowed size of ${MAX_SOURCE_BYTES} bytes.`,
      results: [],
    };
  }

  const results: TestCaseExecutionResult[] = [];
  let passedCount = 0;
  let totalTimeMs = 0;
  let firstFailureStatus: SubmissionStatus = 'Accepted';
  let firstError = '';

  for (const tc of params.testCases) {
    const res = await executeSingleTest({
      source_code: params.sourceCode,
      mode: params.evaluationMode,
      function_name: params.functionName,
      input_data: tc.input_data,
      expected_output: tc.expected_output,
      is_custom: false,
    });

    totalTimeMs += res.execution_time_ms;
    if (res.passed) {
      passedCount += 1;
    } else if (firstFailureStatus === 'Accepted') {
      firstFailureStatus = res.status;
      firstError = res.error;
    }

    const isHidden = Boolean(tc.is_hidden);
    const hideDetails = isHidden && !params.includeHiddenDetails;

    results.push({
      test_case_id: tc.id,
      order_index: tc.order_index,
      description: hideDetails ? `Hidden Test Case #${tc.order_index}` : tc.description,
      is_hidden: isHidden,
      passed: res.passed,
      verdict: toVerdict(res.status, res.passed),
      status: res.status,
      ...(hideDetails
        ? {}
        : {
            input: tc.input_data,
            expected_output: tc.expected_output,
            actual_output: res.actual_output,
            error: res.error,
          }),
      execution_time_ms: res.execution_time_ms,
    });
  }

  return {
    mode: params.mode,
    engine: getEngineLabel(),
    status: passedCount === params.testCases.length ? 'Accepted' : firstFailureStatus,
    passed_count: passedCount,
    total_count: params.testCases.length,
    execution_time_ms: totalTimeMs,
    memory_kb: 16384,
    error_output: firstError,
    results,
  };
}

export async function runCustomInputInPyodide(params: {
  sourceCode: string;
  evaluationMode: string;
  functionName: string | null;
  customInput: string;
}): Promise<ExecutionBatchResponse> {
  const sourceBytes = new TextEncoder().encode(params.sourceCode).length;
  if (!params.sourceCode.trim()) {
    return {
      mode: 'custom',
      engine: getEngineLabel(),
      status: 'Runtime Error',
      passed_count: 0,
      total_count: 0,
      execution_time_ms: 0,
      memory_kb: 0,
      error_output: 'Please write Python code before running.',
      stdout: '',
      stderr: 'Please write Python code before running.',
      results: [],
    };
  }

  if (sourceBytes > MAX_SOURCE_BYTES) {
    const msg = `Source code exceeds maximum allowed size of ${MAX_SOURCE_BYTES} bytes.`;
    return {
      mode: 'custom',
      engine: getEngineLabel(),
      status: 'Runtime Error',
      passed_count: 0,
      total_count: 0,
      execution_time_ms: 0,
      memory_kb: 0,
      error_output: msg,
      stdout: '',
      stderr: msg,
      results: [],
    };
  }

  const res = await executeSingleTest({
    source_code: params.sourceCode,
    mode: params.evaluationMode,
    function_name: params.functionName,
    input_data: params.customInput,
    expected_output: '',
    is_custom: true,
  });

  return {
    mode: 'custom',
    engine: getEngineLabel(),
    status: res.status,
    passed_count: res.passed ? 1 : 0,
    total_count: 1,
    execution_time_ms: res.execution_time_ms,
    memory_kb: 16384,
    error_output: res.error,
    stdout: res.actual_output,
    stderr: res.error,
    results: [],
  };
}
