import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = process.env.SQLITE_DB_PATH || path.join(DATA_DIR, 'python_mastery.db');

export const db = new DatabaseSync(DB_PATH);

// Enable WAL mode and foreign keys for concurrency and referential integrity
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'learner',
      bio TEXT NOT NULL DEFAULT '',
      target_role TEXT NOT NULL DEFAULT 'Python Backend Engineer',
      avatar_url TEXT NOT NULL DEFAULT '/src/assets/images/avatar_python_engineer_1794809909403.jpg',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      order_index INTEGER NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS concepts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      slug TEXT NOT NULL UNIQUE,
      order_index INTEGER NOT NULL,
      name TEXT NOT NULL,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_number INTEGER NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      concept_id INTEGER NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
      difficulty TEXT NOT NULL CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
      question_type TEXT NOT NULL,
      problem_statement TEXT NOT NULL,
      input_format TEXT NOT NULL,
      output_format TEXT NOT NULL,
      constraints TEXT NOT NULL,
      examples_json TEXT NOT NULL,
      starter_code TEXT NOT NULL,
      function_name TEXT,
      evaluation_mode TEXT NOT NULL,
      explanation TEXT NOT NULL,
      related_concepts_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS question_test_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      order_index INTEGER NOT NULL,
      input_data TEXT NOT NULL,
      expected_output TEXT NOT NULL,
      description TEXT NOT NULL,
      is_hidden INTEGER NOT NULL DEFAULT 0 CHECK (is_hidden IN (0, 1))
    );

    CREATE TABLE IF NOT EXISTS question_hints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      order_index INTEGER NOT NULL,
      hint_text TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS question_solutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL UNIQUE REFERENCES questions(id) ON DELETE CASCADE,
      reference_code TEXT NOT NULL,
      explanation TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_question_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'Not Started' CHECK (status IN ('Not Started', 'Attempted', 'Solved', 'Needs Revision')),
      attempts_count INTEGER NOT NULL DEFAULT 0,
      last_attempted_at TEXT,
      solved_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS user_bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS user_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      source_code TEXT NOT NULL,
      status TEXT NOT NULL,
      passed_count INTEGER NOT NULL DEFAULT 0,
      total_count INTEGER NOT NULL DEFAULT 0,
      execution_time_ms INTEGER NOT NULL DEFAULT 0,
      memory_kb INTEGER NOT NULL DEFAULT 0,
      error_output TEXT NOT NULL DEFAULT '',
      results_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_saved_code (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      source_code TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS user_revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      notes TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS user_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      activity_date TEXT NOT NULL,
      submissions_count INTEGER NOT NULL DEFAULT 0,
      solved_count INTEGER NOT NULL DEFAULT 0,
      UNIQUE (user_id, activity_date)
    );

    CREATE TABLE IF NOT EXISTS user_hint_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      hint_order INTEGER NOT NULL CHECK (hint_order IN (1, 2, 3)),
      used_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, question_id, hint_order)
    );

    CREATE TABLE IF NOT EXISTS user_revision_settings (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      incorrect_interval_days INTEGER NOT NULL DEFAULT 1,
      hinted_interval_days INTEGER NOT NULL DEFAULT 2,
      independent_interval_days INTEGER NOT NULL DEFAULT 7,
      forgotten_interval_days INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mock_interviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      difficulty TEXT NOT NULL DEFAULT 'Mixed',
      category_slug TEXT NOT NULL DEFAULT '',
      duration_minutes INTEGER NOT NULL DEFAULT 30,
      question_ids_json TEXT NOT NULL DEFAULT '[]',
      answers_json TEXT NOT NULL DEFAULT '[]',
      score_pct REAL NOT NULL DEFAULT 0,
      passed_questions INTEGER NOT NULL DEFAULT 0,
      total_questions INTEGER NOT NULL DEFAULT 0,
      time_spent_seconds INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS output_prediction_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      snippet_id TEXT NOT NULL,
      predicted_output TEXT NOT NULL,
      is_correct INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS interview_prep_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL,
      is_reviewed INTEGER NOT NULL DEFAULT 1 CHECK (is_reviewed IN (0, 1)),
      confidence TEXT NOT NULL DEFAULT 'Medium' CHECK (confidence IN ('Low', 'Medium', 'High')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, item_id)
    );

    CREATE TABLE IF NOT EXISTS daily_challenge_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      challenge_date TEXT NOT NULL,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'Solved',
      submission_id INTEGER,
      completed_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, challenge_date)
    );

    CREATE TABLE IF NOT EXISTS user_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL CHECK (target_type IN ('concept', 'question', 'interview', 'pattern')),
      target_ref TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_concepts_category ON concepts(category_id);
    CREATE INDEX IF NOT EXISTS idx_questions_category ON questions(category_id);
    CREATE INDEX IF NOT EXISTS idx_questions_concept ON questions(concept_id);
    CREATE INDEX IF NOT EXISTS idx_questions_difficulty ON questions(difficulty);
    CREATE INDEX IF NOT EXISTS idx_test_cases_question ON question_test_cases(question_id, is_hidden);
    CREATE INDEX IF NOT EXISTS idx_progress_user ON user_question_progress(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_submissions_user_q ON user_submissions(user_id, question_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_activity_user_date ON user_activity(user_id, activity_date);
    CREATE INDEX IF NOT EXISTS idx_hint_usage_user_q ON user_hint_usage(user_id, question_id);
    CREATE INDEX IF NOT EXISTS idx_mock_interviews_user ON mock_interviews(user_id, started_at);
    CREATE INDEX IF NOT EXISTS idx_output_pred_user ON output_prediction_attempts(user_id, snippet_id);
    CREATE INDEX IF NOT EXISTS idx_notes_user_type ON user_notes(user_id, target_type);
  `);

  runMigrations();
}

function getColumnNames(tableName: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[];
  return new Set(rows.map((r) => r.name));
}

function runMigrations(): void {
  const subCols = getColumnNames('user_submissions');
  if (!subCols.has('hints_used')) {
    db.exec(`ALTER TABLE user_submissions ADD COLUMN hints_used INTEGER NOT NULL DEFAULT 0;`);
  }
  if (!subCols.has('hints_used_json')) {
    db.exec(`ALTER TABLE user_submissions ADD COLUMN hints_used_json TEXT NOT NULL DEFAULT '[]';`);
  }

  const revCols = getColumnNames('user_revisions');
  if (!revCols.has('interval_days')) {
    db.exec(`ALTER TABLE user_revisions ADD COLUMN interval_days INTEGER NOT NULL DEFAULT 3;`);
  }
  if (!revCols.has('next_review_at')) {
    db.exec(`ALTER TABLE user_revisions ADD COLUMN next_review_at TEXT;`);
  }
  if (!revCols.has('last_reviewed_at')) {
    db.exec(`ALTER TABLE user_revisions ADD COLUMN last_reviewed_at TEXT;`);
  }
  if (!revCols.has('review_count')) {
    db.exec(`ALTER TABLE user_revisions ADD COLUMN review_count INTEGER NOT NULL DEFAULT 0;`);
  }
  if (!revCols.has('reason')) {
    db.exec(`ALTER TABLE user_revisions ADD COLUMN reason TEXT NOT NULL DEFAULT 'manual';`);
  }
}
