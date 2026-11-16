import { db, initSchema } from './db.ts';
import { hashPassword } from './auth.ts';
import { CATEGORIES_SEED } from './data/categories.ts';
import { ALL_QUESTIONS } from './data/questions/index.ts';

export function seedDatabase(): void {
  initSchema();

  const existingCatCount = (db.prepare('SELECT COUNT(*) AS cnt FROM categories').get() as { cnt: number }).cnt;
  const existingQCount = (db.prepare('SELECT COUNT(*) AS cnt FROM questions').get() as { cnt: number }).cnt;
  const underHintedRow = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM questions q
       WHERE (SELECT COUNT(*) FROM question_hints h WHERE h.question_id = q.id) < 3`
    )
    .get() as { cnt: number };
  const staleDebugAsync = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM questions
       WHERE slug = 'debug-unawaited-coroutine' AND starter_code LIKE '%asyncio.run%'`
    )
    .get() as { cnt: number };

  if (
    existingCatCount >= CATEGORIES_SEED.length &&
    existingQCount >= ALL_QUESTIONS.length &&
    underHintedRow.cnt === 0 &&
    staleDebugAsync.cnt === 0
  ) {
    ensureDemoUser();
    return;
  }

  db.exec('BEGIN TRANSACTION;');
  try {
    const insertCat = db.prepare(`
      INSERT INTO categories (slug, order_index, name, description)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET
        order_index = excluded.order_index,
        name = excluded.name,
        description = excluded.description
    `);

    const getCatId = db.prepare('SELECT id FROM categories WHERE slug = ?');

    const insertConcept = db.prepare(`
      INSERT INTO concepts (category_id, slug, order_index, name, summary)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET
        category_id = excluded.category_id,
        order_index = excluded.order_index,
        name = excluded.name,
        summary = excluded.summary
    `);

    const getConceptId = db.prepare('SELECT id FROM concepts WHERE slug = ?');

    const categoryMap = new Map<string, number>();
    const conceptMap = new Map<string, number>();

    for (const cat of CATEGORIES_SEED) {
      insertCat.run(cat.slug, cat.order_index, cat.name, cat.description);
      const catRow = getCatId.get(cat.slug) as { id: number };
      categoryMap.set(cat.slug, catRow.id);

      for (const con of cat.concepts) {
        insertConcept.run(catRow.id, con.slug, con.order_index, con.name, con.summary);
        const conRow = getConceptId.get(con.slug) as { id: number };
        conceptMap.set(con.slug, conRow.id);
      }
    }

    const insertQuestion = db.prepare(`
      INSERT INTO questions (
        question_number, slug, title, category_id, concept_id, difficulty,
        question_type, problem_statement, input_format, output_format,
        constraints, examples_json, starter_code, function_name,
        evaluation_mode, explanation, related_concepts_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET
        question_number = excluded.question_number,
        title = excluded.title,
        category_id = excluded.category_id,
        concept_id = excluded.concept_id,
        difficulty = excluded.difficulty,
        question_type = excluded.question_type,
        problem_statement = excluded.problem_statement,
        input_format = excluded.input_format,
        output_format = excluded.output_format,
        constraints = excluded.constraints,
        examples_json = excluded.examples_json,
        starter_code = excluded.starter_code,
        function_name = excluded.function_name,
        evaluation_mode = excluded.evaluation_mode,
        explanation = excluded.explanation,
        related_concepts_json = excluded.related_concepts_json,
        updated_at = datetime('now')
    `);

    const getQId = db.prepare('SELECT id FROM questions WHERE slug = ?');
    const delTests = db.prepare('DELETE FROM question_test_cases WHERE question_id = ?');
    const delHints = db.prepare('DELETE FROM question_hints WHERE question_id = ?');
    const insertTest = db.prepare(`
      INSERT INTO question_test_cases (question_id, order_index, input_data, expected_output, description, is_hidden)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertHint = db.prepare(`
      INSERT INTO question_hints (question_id, order_index, hint_text)
      VALUES (?, ?, ?)
    `);
    const insertSolution = db.prepare(`
      INSERT INTO question_solutions (question_id, reference_code, explanation)
      VALUES (?, ?, ?)
      ON CONFLICT(question_id) DO UPDATE SET
        reference_code = excluded.reference_code,
        explanation = excluded.explanation
    `);

    for (let idx = 0; idx < ALL_QUESTIONS.length; idx++) {
      const item = ALL_QUESTIONS[idx];
      const catId = categoryMap.get(item.category_slug);
      const conId = conceptMap.get(item.concept_slug);
      if (!catId || !conId) {
        throw new Error(`Invalid category/concept for ${item.slug}: ${item.category_slug}/${item.concept_slug}`);
      }

      insertQuestion.run(
        idx + 1,
        item.slug,
        item.title,
        catId,
        conId,
        item.difficulty,
        item.question_type,
        item.problem_statement,
        item.input_format,
        item.output_format,
        item.constraints,
        JSON.stringify(item.examples),
        item.starter_code,
        item.function_name,
        item.evaluation_mode,
        item.explanation,
        JSON.stringify(item.related_concepts)
      );

      const qRow = getQId.get(item.slug) as { id: number };
      delTests.run(qRow.id);
      delHints.run(qRow.id);

      item.test_cases.forEach((tc, tcIdx) => {
        insertTest.run(
          qRow.id,
          tcIdx + 1,
          tc.input_data,
          tc.expected_output,
          tc.description,
          tc.is_hidden ? 1 : 0
        );
      });

      item.hints.forEach((hint, hIdx) => {
        insertHint.run(qRow.id, hIdx + 1, hint);
      });

      insertSolution.run(qRow.id, item.reference_solution, item.explanation);
    }

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  ensureDemoUser();
}

function ensureDemoUser(): void {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get('alex@pythonmastery.dev') as
    | { id: number }
    | undefined;
  if (existing) return;

  db.prepare(`
    INSERT INTO users (username, email, full_name, password_hash, role, bio, target_role)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    'alex_py',
    'alex@pythonmastery.dev',
    'Alex Rivera',
    hashPassword('PythonMastery!2026'),
    'learner',
    'Backend & GenAI Python engineer preparing for senior systems interviews.',
    'GenAI & Backend Python Engineer'
  );
}
