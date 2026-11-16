export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export type QuestionType =
  | 'function'
  | 'stdin_stdout'
  | 'debugging'
  | 'code_completion'
  | 'output_prediction'
  | 'oop'
  | 'practical_engineering';

export type EvaluationMode = 'function' | 'stdout' | 'oop_assert' | 'script_assert';

export type ProgressStatus = 'Not Started' | 'Attempted' | 'Solved' | 'Needs Revision';

export type SubmissionStatus =
  | 'Accepted'
  | 'Wrong Answer'
  | 'Runtime Error'
  | 'Time Limit Exceeded'
  | 'Memory Limit Exceeded'
  | 'Internal Execution Error';

export interface QuestionExample {
  input: string;
  output: string;
  explanation?: string;
}

export interface TestCaseSeed {
  input_data: string;
  expected_output: string;
  description: string;
  is_hidden: boolean;
}

export interface QuestionSeed {
  slug: string;
  title: string;
  category_slug: string;
  concept_slug: string;
  difficulty: Difficulty;
  question_type: QuestionType;
  problem_statement: string;
  input_format: string;
  output_format: string;
  constraints: string;
  examples: QuestionExample[];
  starter_code: string;
  function_name: string | null;
  evaluation_mode: EvaluationMode;
  explanation: string;
  related_concepts: string[];
  test_cases: TestCaseSeed[];
  hints: string[];
  reference_solution: string;
}

export interface CategorySeed {
  slug: string;
  order_index: number;
  name: string;
  description: string;
  concepts: {
    slug: string;
    order_index: number;
    name: string;
    summary: string;
  }[];
}
