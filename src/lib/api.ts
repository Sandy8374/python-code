export type Difficulty = 'Easy' | 'Medium' | 'Hard';
export type QuestionType =
  | 'function'
  | 'stdin_stdout'
  | 'debugging'
  | 'code_completion'
  | 'output_prediction'
  | 'oop_implementation'
  | 'practical_engineering';
export type ProgressStatus = 'Not Started' | 'Attempted' | 'Solved' | 'Needs Revision';
export type SubmissionStatus =
  | 'Accepted'
  | 'Wrong Answer'
  | 'Runtime Error'
  | 'Time Limit Exceeded'
  | 'Memory Limit Exceeded'
  | 'Initialization Error'
  | 'Internal Execution Error';
export type RevisionPriority = 'Low' | 'Medium' | 'High';

export interface UserProfile {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: string;
  bio: string;
  target_role: string;
  avatar_url: string;
  created_at: string;
}

export interface CategorySummary {
  id: number;
  slug: string;
  order_index: number;
  name: string;
  description: string;
  total_count: number;
  easy_count: number;
  medium_count: number;
  hard_count: number;
  solved_count: number;
  attempted_count: number;
  concept_count: number;
}

export interface ConceptSummary {
  id: number;
  slug: string;
  order_index: number;
  name: string;
  summary: string;
  category_id: number;
  category_slug: string;
  category_name: string;
  category_order: number;
  question_count: number;
  solved_count: number;
}

export interface QuestionListItem {
  id: number;
  question_number: number;
  slug: string;
  title: string;
  difficulty: Difficulty;
  question_type: QuestionType;
  category_id: number;
  category_slug: string;
  category_name: string;
  concept_id: number;
  concept_slug: string;
  concept_name: string;
  status: ProgressStatus;
  attempts_count: number;
  last_attempted_at: string | null;
  is_bookmarked: number | boolean;
  is_revision: number | boolean;
}

export interface PublicTestCase {
  id: number;
  order_index: number;
  input_data: string;
  expected_output: string;
  description: string;
}

export interface EvalTestCase extends PublicTestCase {
  is_hidden: boolean | number;
}

export interface QuestionHint {
  id: number;
  order_index: number;
  hint_text: string;
}

export interface QuestionDetail {
  id: number;
  question_number: number;
  slug: string;
  title: string;
  category_id: number;
  category_slug: string;
  category_name: string;
  concept_id: number;
  concept_slug: string;
  concept_name: string;
  difficulty: Difficulty;
  question_type: QuestionType;
  problem_statement: string;
  input_format: string;
  output_format: string;
  constraints: string;
  examples: { input: string; output: string; explanation?: string }[];
  starter_code: string;
  function_name: string | null;
  evaluation_mode: string;
  related_concepts: string[];
  hidden_test_count: number;
}

export interface QuestionDetailResponse {
  question: QuestionDetail;
  public_test_cases: PublicTestCase[];
  hints: QuestionHint[];
  user_state: {
    status: ProgressStatus;
    attempts_count: number;
    is_bookmarked: boolean;
    is_revision: boolean;
    revision_notes?: string;
    revision_priority?: RevisionPriority;
    saved_code: string | null;
    used_hints: number[];
  };
  prev_question: { slug: string; title: string; question_number: number } | null;
  next_question: { slug: string; title: string; question_number: number } | null;
}

export interface TestCaseExecutionResult {
  test_case_id: number;
  order_index: number;
  description: string;
  is_hidden: boolean;
  passed: boolean;
  verdict?: 'Passed' | 'Failed' | 'Runtime Error' | 'Time Limit Exceeded' | 'Memory Limit Exceeded';
  status: SubmissionStatus;
  input?: string;
  expected_output?: string;
  actual_output?: string;
  error?: string;
  execution_time_ms: number;
}

export interface ExecutionBatchResponse {
  submission_id?: number;
  mode?: 'custom' | 'public_tests';
  engine: string;
  status: SubmissionStatus;
  passed_count: number;
  total_count: number;
  execution_time_ms: number;
  memory_kb: number;
  error_output: string;
  hints_used?: number;
  hints_used_list?: number[];
  results: TestCaseExecutionResult[];
  // Custom input fields:
  stdout?: string;
  stderr?: string;
}

export interface SubmissionRecord {
  id: number;
  question_id: number;
  status: SubmissionStatus;
  passed_count: number;
  total_count: number;
  execution_time_ms: number;
  memory_kb: number;
  error_output: string;
  source_code: string;
  hints_used?: number;
  hints_used_list?: number[];
  created_at: string;
  question_number?: number;
  question_slug?: string;
  question_title?: string;
  difficulty?: Difficulty;
  category_name?: string;
  results?: TestCaseExecutionResult[];
}

export interface AnalyticsOverview {
  total_questions: number;
  solved_questions: number;
  attempted_questions: number;
  pending_questions: number;
  revision_questions: number;
  bookmarked_questions: number;
  mastery_percentage: number;
  current_streak: number;
  difficulty: {
    Easy: { solved: number; total: number };
    Medium: { solved: number; total: number };
    Hard: { solved: number; total: number };
  };
  recent_submissions: {
    id: number;
    status: SubmissionStatus;
    passed_count: number;
    total_count: number;
    execution_time_ms: number;
    hints_used?: number;
    created_at: string;
    question_number: number;
    question_slug: string;
    question_title: string;
    difficulty: Difficulty;
  }[];
  continue_practising: {
    id: number;
    question_number: number;
    slug: string;
    title: string;
    difficulty: Difficulty;
    category_name: string;
    status: ProgressStatus;
  }[];
}

export interface ActivityPoint {
  date: string;
  label: string;
  submissions: number;
  solved: number;
}

export interface CategoryProgressItem {
  id: number;
  slug: string;
  order_index: number;
  name: string;
  total_count: number;
  solved_count: number;
  attempted_count: number;
  completion_pct: number;
}

export interface BookmarkItem {
  id: number;
  question_number: number;
  slug: string;
  title: string;
  difficulty: Difficulty;
  question_type: QuestionType;
  category_name: string;
  category_slug: string;
  concept_name: string;
  status: ProgressStatus;
  bookmarked_at: string;
}

export interface RevisionItem {
  id: number;
  question_number: number;
  slug: string;
  title: string;
  difficulty: Difficulty;
  question_type: QuestionType;
  category_name: string;
  category_slug: string;
  concept_name: string;
  status: ProgressStatus;
  notes: string;
  priority: RevisionPriority;
  interval_days: number;
  next_review_at: string | null;
  last_reviewed_at: string | null;
  review_count: number;
  reason: string;
  is_due: number;
  revision_updated_at: string;
}

export interface RevisionSettings {
  incorrect_interval_days: number;
  hinted_interval_days: number;
  independent_interval_days: number;
  forgotten_interval_days: number;
}

export interface RevisionSuggestionItem {
  id: number;
  question_number: number;
  slug: string;
  title: string;
  difficulty: Difficulty;
  category_name: string;
  concept_name: string;
  fail_count?: number;
  last_failed_at?: string;
  hints_count?: number;
  last_hint_at?: string;
  solved_at?: string;
}

export interface RevisionDashboardResponse {
  settings: RevisionSettings;
  summary: {
    total_queued: number;
    due_now: number;
    forgotten_count: number;
    incorrect_count: number;
    hinted_count: number;
    independent_count: number;
  };
  queued: RevisionItem[];
  suggestions: {
    due_now: RevisionItem[];
    incorrect: RevisionSuggestionItem[];
    hinted: RevisionSuggestionItem[];
    independent: RevisionSuggestionItem[];
    forgotten: RevisionItem[];
  };
}

export interface MockInterviewQuestion {
  id: number;
  question_number: number;
  slug: string;
  title: string;
  difficulty: Difficulty;
  question_type: QuestionType;
  problem_statement: string;
  input_format: string;
  output_format: string;
  constraints: string;
  examples: { input: string; output: string; explanation?: string }[];
  starter_code: string;
  function_name: string | null;
  evaluation_mode: string;
  category_slug: string;
  category_name: string;
  concept_name: string;
  public_test_cases: PublicTestCase[];
  eval_test_cases: EvalTestCase[];
}

export interface MockInterviewAnswerRecord {
  question_id: number;
  slug: string;
  title: string;
  difficulty: string;
  source_code: string;
  status: string;
  passed_count: number;
  total_count: number;
  execution_time_ms: number;
}

export interface MockInterviewSession {
  id: number;
  difficulty: string;
  category_slug: string;
  duration_minutes: number;
  score_pct: number;
  passed_questions: number;
  total_questions: number;
  time_spent_seconds: number;
  status: 'in_progress' | 'completed';
  started_at?: string;
  completed_at?: string | null;
  answers?: MockInterviewAnswerRecord[];
}

export interface OutputPredictionItem {
  id: string;
  title: string;
  difficulty: Difficulty;
  concept: string;
  code: string;
  attempted: boolean;
  is_correct: boolean;
  attempts_count: number;
  last_prediction: string | null;
  expected_output?: string;
  execution_order?: string[];
  variable_changes?: { step: string; variables: string }[];
  explanation?: string;
}

export interface OutputPredictionAttemptResponse {
  snippet_id: string;
  is_correct: boolean;
  predicted_output: string;
  expected_output: string;
  execution_order: string[];
  variable_changes: { step: string; variables: string }[];
  explanation: string;
}

export interface InterviewPrepItem {
  id: string;
  topic: string;
  topic_order: number;
  question: string;
  answer: string;
  key_points: string[];
  follow_up: string;
  difficulty: Difficulty;
  linked_problem_slug: string | null;
  is_reviewed: boolean;
  confidence: 'Low' | 'Medium' | 'High';
  linked_question: {
    id: number;
    question_number: number;
    slug: string;
    title: string;
    difficulty: Difficulty;
    status: ProgressStatus;
  } | null;
}

export interface InterviewPrepResponse {
  topics: { topic: string; topic_order: number; total: number; reviewed: number }[];
  items: InterviewPrepItem[];
}

export interface RoadmapConcept {
  id: number;
  category_id: number;
  slug: string;
  order_index: number;
  name: string;
  summary: string;
  category_slug: string;
  category_name: string;
  category_order: number;
  total_count: number;
  solved_count: number;
  failed_subs: number;
  hints_used: number;
  completion_pct: number;
  is_completed: boolean;
}

export interface RoadmapModule {
  id: number;
  slug: string;
  order_index: number;
  name: string;
  description: string;
  total_count: number;
  solved_count: number;
  completion_pct: number;
  is_completed: boolean;
  concept_total: number;
  concept_completed: number;
  concepts: RoadmapConcept[];
}

export interface RoadmapResponse {
  summary: {
    modules_completed: number;
    modules_total: number;
    concepts_completed: number;
    concepts_total: number;
    questions_solved: number;
    questions_total: number;
    overall_pct: number;
  };
  difficulty_progress: {
    difficulty: Difficulty;
    total: number;
    solved: number;
    pct: number;
  }[];
  recommended_next_concepts: RoadmapConcept[];
  weak_concepts: RoadmapConcept[];
  modules: RoadmapModule[];
}

export interface DailyChallengeResponse {
  date: string;
  question: {
    id: number;
    question_number: number;
    slug: string;
    title: string;
    difficulty: Difficulty;
    question_type: QuestionType;
    problem_statement: string;
    category_name: string;
    category_slug: string;
    concept_name: string;
    progress_status: ProgressStatus;
  };
  is_completed: boolean;
  completion: {
    challenge_date: string;
    status: string;
    submission_id: number | null;
    completed_at: string;
  } | null;
  daily_streak: number;
  total_completed: number;
  recent_completions: {
    challenge_date: string;
    status: string;
    completed_at: string;
    question_number: number;
    slug: string;
    title: string;
    difficulty: Difficulty;
  }[];
}

export type NoteTargetType = 'concept' | 'question' | 'interview' | 'pattern';

export interface UserNote {
  id: number;
  target_type: NoteTargetType;
  target_ref: string;
  title: string;
  content: string;
  tags: string;
  created_at: string;
  updated_at: string;
}

export interface DebuggingOverviewResponse {
  stats: {
    total: number;
    solved: number;
    attempted: number;
    submissions_count: number;
    accepted_count: number;
    accuracy_pct: number;
  };
  questions: {
    id: number;
    question_number: number;
    slug: string;
    title: string;
    difficulty: Difficulty;
    question_type: QuestionType;
    category_slug: string;
    category_name: string;
    concept_slug: string;
    concept_name: string;
    status: ProgressStatus;
    attempts_count: number;
    hints_used_count: number;
  }[];
}

export interface DetailedAnalyticsResponse {
  overview: AnalyticsOverview;
  category_performance: {
    id: number;
    slug: string;
    order_index: number;
    name: string;
    total_count: number;
    solved_count: number;
    attempted_count: number;
    submissions_count: number;
    accepted_count: number;
    completion_pct: number;
    accuracy_pct: number;
  }[];
  difficulty_success: {
    difficulty: Difficulty;
    solved: number;
    total: number;
    submissions: number;
    accepted: number;
    success_rate_pct: number;
  }[];
  failed_questions: {
    id: number;
    question_number: number;
    slug: string;
    title: string;
    difficulty: Difficulty;
    category_name: string;
    fail_count: number;
    total_attempts: number;
    last_failed_at: string;
    current_status: ProgressStatus;
  }[];
  hint_stats: {
    total_hints_revealed: number;
    questions_with_hints: number;
    solved_independently: number;
    solved_with_hints: number;
  };
  revision_stats: {
    total_queued: number;
    due_now: number;
    total_reviews: number;
    forgotten_count: number;
    avg_interval_days: number;
  };
  weekly_activity: {
    week: string;
    submissions: number;
    solved: number;
  }[];
  mock_interview_stats: {
    completed_count: number;
    avg_score_pct: number;
    best_score_pct: number;
    recent_sessions: MockInterviewSession[];
  };
}

const TOKEN_STORAGE_KEY = 'pm_token';

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setAuthToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { detail?: string };
      if (data.detail) detail = data.detail;
    } catch {
      // ignore non-json error
    }
    throw new ApiError(detail, res.status);
  }

  return (await res.json()) as T;
}

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  function: 'Function',
  stdin_stdout: 'Stdin / Stdout',
  debugging: 'Debugging',
  code_completion: 'Completion',
  output_prediction: 'Output Prediction',
  oop_implementation: 'OOP Design',
  practical_engineering: 'Engineering',
};
