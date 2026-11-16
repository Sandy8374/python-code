/// <reference lib="webworker" />
import { loadPyodide, type PyodideInterface } from 'pyodide';
import { PYTHON_HARNESS_SCRIPT } from '../lib/pythonHarness';

type WorkerRequest =
  | { id: number; type: 'init' }
  | {
      id: number;
      type: 'evaluate_single';
      payload: {
        source_code: string;
        mode: string;
        function_name: string | null;
        input_data: string;
        expected_output: string;
        is_custom: boolean;
      };
    }
  | {
      id: number;
      type: 'trace_single';
      payload: {
        source_code: string;
        mode: string;
        function_name: string | null;
        input_data: string;
      };
    }
  | {
      id: number;
      type: 'analyze_quality';
      payload: {
        source_code: string;
      };
    };

let pyodide: PyodideInterface | null = null;
let evaluateFn: ((payloadJson: string) => string) | null = null;
let traceFn: ((payloadJson: string) => string) | null = null;
let analyzeFn: ((payloadJson: string) => string) | null = null;
let cachedPythonVersion: string | null = null;
let initPromise: Promise<string> | null = null;

async function ensurePyodideLoaded(): Promise<string> {
  if (pyodide && evaluateFn && traceFn && analyzeFn && cachedPythonVersion) {
    return cachedPythonVersion;
  }
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const configuredUrl = import.meta.env.VITE_PYODIDE_INDEX_URL as string | undefined;
    const indexURL = configuredUrl && configuredUrl.trim().length > 0
      ? configuredUrl.trim()
      : `${self.location.origin}/pyodide/`;

    const instance = await loadPyodide({ indexURL });
    await instance.runPythonAsync(PYTHON_HARNESS_SCRIPT);
    const pyVersion = String(await instance.runPythonAsync('f"Python {platform.python_version()}"'));
    const fnEval = instance.globals.get('_pymastery_evaluate') as ((payloadJson: string) => string) | undefined;
    const fnTrace = instance.globals.get('_pymastery_trace') as ((payloadJson: string) => string) | undefined;
    const fnAnalyze = instance.globals.get('_pymastery_analyze_quality') as ((payloadJson: string) => string) | undefined;
    if (!fnEval || !fnTrace || !fnAnalyze) {
      throw new Error('Failed to initialize Python evaluation & analysis harness.');
    }

    pyodide = instance;
    evaluateFn = fnEval;
    traceFn = fnTrace;
    analyzeFn = fnAnalyze;
    cachedPythonVersion = pyVersion;
    return pyVersion;
  })();

  try {
    return await initPromise;
  } catch (err) {
    initPromise = null;
    throw err;
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;

  if (msg.type === 'init') {
    try {
      const pythonVersion = await ensurePyodideLoaded();
      self.postMessage({ id: msg.id, type: 'init_success', pythonVersion });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize Pyodide WebAssembly runtime.';
      self.postMessage({ id: msg.id, type: 'init_error', error: message });
    }
    return;
  }

  if (msg.type === 'evaluate_single') {
    try {
      await ensurePyodideLoaded();
      if (!evaluateFn) throw new Error('Pyodide evaluator is not initialized.');
      const rawJson = evaluateFn(JSON.stringify(msg.payload));
      const result = JSON.parse(rawJson);
      self.postMessage({ id: msg.id, type: 'eval_success', result });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected Python execution error.';
      self.postMessage({ id: msg.id, type: 'eval_error', error: message });
    }
    return;
  }

  if (msg.type === 'trace_single') {
    try {
      await ensurePyodideLoaded();
      if (!traceFn) throw new Error('Pyodide dry-run tracer is not initialized.');
      const rawJson = traceFn(JSON.stringify(msg.payload));
      const result = JSON.parse(rawJson);
      self.postMessage({ id: msg.id, type: 'trace_success', result });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected dry-run trace error.';
      self.postMessage({ id: msg.id, type: 'trace_error', error: message });
    }
    return;
  }

  if (msg.type === 'analyze_quality') {
    try {
      await ensurePyodideLoaded();
      if (!analyzeFn) throw new Error('Pyodide quality analyzer is not initialized.');
      const rawJson = analyzeFn(JSON.stringify(msg.payload));
      const result = JSON.parse(rawJson);
      self.postMessage({ id: msg.id, type: 'analyze_success', result });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected quality analysis error.';
      self.postMessage({ id: msg.id, type: 'analyze_error', error: message });
    }
  }
};
