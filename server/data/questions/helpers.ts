import type { Difficulty, EvaluationMode, QuestionExample, QuestionSeed, QuestionType, TestCaseSeed } from '../../types.ts';

export interface CompactQuestionInput {
  slug: string;
  title: string;
  cat: string;
  con: string;
  diff: Difficulty;
  qtype?: QuestionType;
  mode?: EvaluationMode;
  fn?: string | null;
  stmt: string;
  inp: string;
  out: string;
  cons?: string;
  ex: QuestionExample[];
  starter: string;
  tests: [string, string, string, boolean?][];
  hints: string[];
  sol: string;
  expl: string;
  rel?: string[];
}

function normalizeThreeHints(item: CompactQuestionInput, fnName: string | null): string[] {
  const clean = item.hints.map((h) => h.trim()).filter(Boolean);

  const hint1 =
    clean[0] ??
    `Understand the Problem: Focus on transforming ${item.inp.toLowerCase()} into ${item.out.toLowerCase()} while honoring edge cases.`;

  const hint2 =
    clean[1] ??
    `Think About the Approach: Apply Python ${item.con.replace(/-/g, ' ')} idioms cleanly and handle empty or boundary inputs upfront.`;

  let hint3 = clean[2];
  if (!hint3) {
    if (item.mode === 'stdout') {
      hint3 = `Logical Direction (Pseudocode):\n1. Read input via input().strip() and parse required values.\n2. Process using ${item.con.replace(/-/g, ' ')} operations.\n3. Format and print() the exact expected output without extra whitespace.`;
    } else if (item.mode === 'oop_assert') {
      hint3 = `Logical Direction (Pseudocode):\n1. Inspect all required class methods, attributes, and magic/dunder hooks.\n2. Validate edge-case state transitions and invariants.\n3. Return clean values matching the assertion harness contract.`;
    } else {
      const target = fnName ? `def ${fnName}(...)` : 'your function';
      hint3 = `Logical Direction (Pseudocode):\n1. Inside ${target}, guard boundary/empty inputs first.\n2. Transform or aggregate inputs step by step using Python ${item.con.replace(/-/g, ' ')}.\n3. Return the computed value directly (avoid printing instead of returning).`;
    }
  }

  return [hint1, hint2, hint3];
}

export function q(item: CompactQuestionInput): QuestionSeed {
  const test_cases: TestCaseSeed[] = item.tests.map(([input_data, expected_output, description, is_hidden]) => ({
    input_data,
    expected_output,
    description,
    is_hidden: Boolean(is_hidden),
  }));

  const fnName = item.fn === undefined ? inferFunctionName(item.starter) : item.fn;

  return {
    slug: item.slug,
    title: item.title,
    category_slug: item.cat,
    concept_slug: item.con,
    difficulty: item.diff,
    question_type: item.qtype ?? 'function',
    problem_statement: item.stmt,
    input_format: item.inp,
    output_format: item.out,
    constraints: item.cons ?? 'Standard Python 3.10+ execution limits (3s timeout, 128 MB RAM).',
    examples: item.ex,
    starter_code: item.starter,
    function_name: fnName,
    evaluation_mode: item.mode ?? 'function',
    explanation: item.expl,
    related_concepts: item.rel ?? [item.con],
    test_cases,
    hints: normalizeThreeHints(item, fnName),
    reference_solution: item.sol,
  };
}

function inferFunctionName(starter: string): string | null {
  const match = starter.match(/^def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/m);
  return match ? match[1] : null;
}
