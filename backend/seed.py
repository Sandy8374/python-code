import json
import os
from pathlib import Path
from sqlalchemy import select
from app.auth import hash_password
from app.database import Base, SessionLocal, engine
from app.models import (
    Category,
    Concept,
    Question,
    QuestionHint,
    QuestionSolution,
    QuestionTestCase,
    User,
)


def seed_database():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        demo = db.scalar(select(User).where(User.email == "alex@pythonmastery.dev"))
        if not demo:
            db.add(
                User(
                    username="alex_py",
                    email="alex@pythonmastery.dev",
                    full_name="Alex Rivera",
                    password_hash=hash_password("PythonMastery!2026"),
                    role="learner",
                    bio="Local Python developer workspace.",
                    target_role="Python Backend Engineer",
                )
            )
            db.commit()

        existing_count = db.query(Question).count()
        if existing_count >= 300:
            print(f"Database already seeded with {existing_count} questions.")
            return

        catalog_path = Path(os.environ.get("SEED_CATALOG_JSON", Path(__file__).parent / "seed_catalog.json"))
        if not catalog_path.exists():
            raise FileNotFoundError(f"Catalog file not found: {catalog_path}")

        payload = json.loads(catalog_path.read_text(encoding="utf-8"))
        cat_map = {}
        con_map = {}

        for cat in payload["categories"]:
            c_obj = db.scalar(select(Category).where(Category.slug == cat["slug"]))
            if not c_obj:
                c_obj = Category(
                    slug=cat["slug"],
                    order_index=cat["order_index"],
                    name=cat["name"],
                    description=cat["description"],
                )
                db.add(c_obj)
                db.flush()
            cat_map[cat["slug"]] = c_obj.id

            for con in cat["concepts"]:
                con_obj = db.scalar(select(Concept).where(Concept.category_id == c_obj.id, Concept.slug == con["slug"]))
                if not con_obj:
                    con_obj = Concept(
                        category_id=c_obj.id,
                        slug=con["slug"],
                        order_index=con["order_index"],
                        name=con["name"],
                        summary=con["summary"],
                    )
                    db.add(con_obj)
                    db.flush()
                con_map[f"{cat['slug']}:{con['slug']}"] = con_obj.id

        for idx, q in enumerate(payload["questions"], start=1):
            if db.scalar(select(Question).where(Question.slug == q["slug"])):
                continue
            q_obj = Question(
                question_number=idx,
                slug=q["slug"],
                title=q["title"],
                category_id=cat_map[q["category_slug"]],
                concept_id=con_map[f"{q['category_slug']}:{q['concept_slug']}"],
                difficulty=q["difficulty"],
                question_type=q["question_type"],
                problem_statement=q["problem_statement"],
                input_format=q["input_format"],
                output_format=q["output_format"],
                constraints=q["constraints"],
                examples_json=json.dumps(q["examples"]),
                starter_code=q["starter_code"],
                function_name=q["function_name"],
                evaluation_mode=q["evaluation_mode"],
                related_concepts_json=json.dumps(q["related_concepts"]),
            )
            db.add(q_obj)
            db.flush()

            for t_idx, tc in enumerate(q["test_cases"], start=1):
                db.add(
                    QuestionTestCase(
                        question_id=q_obj.id,
                        order_index=t_idx,
                        input_data=tc["input_data"],
                        expected_output=tc["expected_output"],
                        description=tc["description"],
                        is_hidden=bool(tc["is_hidden"]),
                    )
                )
            for h_idx, h_text in enumerate(q["hints"], start=1):
                db.add(QuestionHint(question_id=q_obj.id, order_index=h_idx, hint_text=h_text))
            db.add(QuestionSolution(question_id=q_obj.id, reference_code=q["reference_solution"], explanation=q["explanation"]))

        db.commit()
        print(f"Seeded {len(payload['questions'])} Python questions into local database.")
    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
