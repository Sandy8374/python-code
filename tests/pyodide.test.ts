import assert from 'node:assert/strict';
import path from 'node:path';
import { loadPyodide } from 'pyodide';
import { PYTHON_HARNESS_SCRIPT } from '../src/lib/pythonHarness.ts';
import { BATCH_6_DEBUGGING_QUESTIONS } from '../server/data/questions/batch6_debugging.ts';

interface EvalOutput {
  status: string;
  passed: boolean;
  actual_output: string;
  error: string;
  execution_time_ms: number;
}

interface TraceOutput {
  ok: boolean;
  error: string;
  steps: { line_number: number; event: string; function_name: string; variables: { name: string; value: string; type: string }[] }[];
  truncated: boolean;
  final_stdout: string;
  return_value: string | null;
}

interface QualityOutput {
  syntax_valid: boolean;
  score: number;
  summary: { errors: number; warnings: number; suggestions: number };
  issues: { code: string; line: number; category: string; message: string }[];
  formatted_code: string;
}

async function runPyodideHarnessTests() {
  const pyodideDir = path.resolve(process.cwd(), 'node_modules/pyodide');
  console.log('Initializing Pyodide WebAssembly once...');
  const pyodide = await loadPyodide({ indexURL: pyodideDir });
  await pyodide.runPythonAsync(PYTHON_HARNESS_SCRIPT);
  const pyVersion = String(await pyodide.runPythonAsync('f"Python {platform.python_version()}"'));
  const evaluate = pyodide.globals.get('_pymastery_evaluate') as (payload: string) => string;
  const traceFn = pyodide.globals.get('_pymastery_trace') as (payload: string) => string;
  const qualityFn = pyodide.globals.get('_pymastery_analyze_quality') as (payload: string) => string;

  const evalSingle = (payload: Record<string, unknown>): EvalOutput =>
    JSON.parse(evaluate(JSON.stringify(payload))) as EvalOutput;
  const runTrace = (payload: Record<string, unknown>): TraceOutput =>
    JSON.parse(traceFn(JSON.stringify(payload))) as TraceOutput;
  const analyzeQuality = (sourceCode: string): QualityOutput =>
    JSON.parse(qualityFn(JSON.stringify({ source_code: sourceCode }))) as QualityOutput;

  console.log(`Initialized ${pyVersion}. Running required evaluation test matrix...`);

  // 1. Swap two integers (function mode)
  const swapInts = evalSingle({
    source_code: 'def swap_values(a, b):\n    a, b = b, a\n    return [a, b]\n',
    mode: 'function',
    function_name: 'swap_values',
    input_data: '[10, 25]',
    expected_output: '[25, 10]',
    is_custom: false,
  });
  assert.equal(swapInts.status, 'Accepted');
  assert.equal(swapInts.passed, true);
  assert.equal(swapInts.actual_output, '[25, 10]');

  // 2. Swap two strings
  const swapStrings = evalSingle({
    source_code: 'def swap_values(a, b):\n    return [b, a]\n',
    mode: 'function',
    function_name: 'swap_values',
    input_data: '["py", "go"]',
    expected_output: '["go", "py"]',
    is_custom: false,
  });
  assert.equal(swapStrings.status, 'Accepted');
  assert.equal(swapStrings.passed, true);

  // 3. Classify Python runtime value types
  const classifyCode = `
def classify_value(val) -> str:
    if val is None:
        return "none"
    if isinstance(val, bool):
        return "bool"
    if isinstance(val, int):
        return "int"
    if isinstance(val, float):
        return "float"
    if isinstance(val, str):
        return "str"
    if isinstance(val, list):
        return "list"
    if isinstance(val, dict):
        return "dict"
    return "other"
`;
  for (const [inp, exp] of [
    ['[true]', '"bool"'],
    ['[42]', '"int"'],
    ['[null]', '"none"'],
    ['[{"a": 1}]', '"dict"'],
  ]) {
    const res = evalSingle({
      source_code: classifyCode,
      mode: 'function',
      function_name: 'classify_value',
      input_data: inp,
      expected_output: exp,
      is_custom: false,
    });
    assert.equal(res.status, 'Accepted', `classify_value failed for ${inp}: ${res.error}`);
    assert.equal(res.passed, true);
  }

  // 4. Stdin/stdout + error handling
  const vowelPass = evalSingle({
    source_code: 's = input().strip().lower()\nprint(sum(1 for ch in s if ch in "aeiou"))\n',
    mode: 'stdout',
    function_name: null,
    input_data: 'Pyodide WebAssembly\n',
    expected_output: '6',
    is_custom: false,
  });
  assert.equal(vowelPass.status, 'Accepted');

  const syntaxErr = evalSingle({
    source_code: 'def broken(:\n    pass\n',
    mode: 'function',
    function_name: 'broken',
    input_data: '[]',
    expected_output: 'null',
    is_custom: false,
  });
  assert.equal(syntaxErr.status, 'Runtime Error');
  assert.ok(syntaxErr.error.includes('SyntaxError'));

  // 5. Verify ALL 12 Debugging Challenges (starter code fails, reference solution passes every public & hidden test)
  console.log(`Verifying all ${BATCH_6_DEBUGGING_QUESTIONS.length} debugging challenge harnesses in Pyodide...`);
  for (const q of BATCH_6_DEBUGGING_QUESTIONS) {
    for (const tc of q.test_cases) {
      const passRes = evalSingle({
        source_code: q.reference_solution,
        mode: q.evaluation_mode,
        function_name: q.function_name,
        input_data: tc.input_data,
        expected_output: tc.expected_output,
        is_custom: false,
      });
      assert.equal(
        passRes.passed,
        true,
        `Debugging reference solution failed for ${q.slug} (${tc.description}): status=${passRes.status} actual=${passRes.actual_output} err=${passRes.error}`
      );
    }
    // Starter code must fail at least one test case (intentionally buggy)
    const anyFail = q.test_cases.some((tc) => {
      const bugRes = evalSingle({
        source_code: q.starter_code,
        mode: q.evaluation_mode,
        function_name: q.function_name,
        input_data: tc.input_data,
        expected_output: tc.expected_output,
        is_custom: false,
      });
      return !bugRes.passed;
    });
    assert.equal(anyFail, true, `Starter code for ${q.slug} must fail at least one test case`);
  }

  // 6. Dry Run Tracer tests
  console.log('Verifying Dry Run line-by-line execution tracer...');
  const fnTrace = runTrace({
    source_code: 'def sum_evens(n):\n    total = 0\n    for i in range(n):\n        if i % 2 == 0:\n            total += i\n    return total\n',
    mode: 'function',
    function_name: 'sum_evens',
    input_data: '[5]',
  });
  assert.equal(fnTrace.ok, true);
  assert.ok(fnTrace.steps.length >= 5);
  assert.equal(fnTrace.return_value, '6');

  const loopCapTrace = runTrace({
    source_code: 'def big_loop():\n    s = 0\n    for i in range(1000):\n        s += i\n    return s\n',
    mode: 'function',
    function_name: 'big_loop',
    input_data: '[]',
  });
  assert.equal(loopCapTrace.ok, true);
  assert.equal(loopCapTrace.truncated, true);
  assert.equal(loopCapTrace.steps.length, 250);

  // 7. Code Quality Static Analyzer & Auto-Formatter tests
  console.log('Verifying Code Quality AST analyzer & formatter...');
  const noisyCode = [
    'import json',
    'def BadName(items=[]):   ',
    '    UnusedVar = 10',
    '    try:',
    '        return items == True',
    '    except:',
    '        return False',
  ].join('\n');

  const qReport = analyzeQuality(noisyCode);
  assert.equal(qReport.syntax_valid, true);
  assert.ok(qReport.score < 90);
  const codes = new Set(qReport.issues.map((i) => i.code));
  assert.ok(codes.has('F401'), 'Expected unused import F401');
  assert.ok(codes.has('N802'), 'Expected non-snake_case function N802');
  assert.ok(codes.has('B006'), 'Expected mutable default B006');
  assert.ok(codes.has('F841'), 'Expected unused variable F841');
  assert.ok(codes.has('E722'), 'Expected bare except E722');
  assert.ok(codes.has('E712'), 'Expected == True E712');
  assert.ok(!qReport.formatted_code.includes('items=[]):   '));

  console.log('ALL PYODIDE HARNESS, TRACER, QUALITY & DEBUGGING TESTS PASSED!');
}

runPyodideHarnessTests().catch((err) => {
  console.error('PYODIDE HARNESS TEST FAILURE:', err);
  process.exit(1);
});
