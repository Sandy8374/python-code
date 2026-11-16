import json
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import asc, case, desc, func, or_, select
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_optional_user
from app.database import get_db
from app.models import (
    Category,
    Concept,
    Question,
    QuestionHint,
    QuestionSolution,
    QuestionTestCase,
    User,
    UserBookmark,
    UserHintUsage,
    UserQuestionProgress,
    UserRevision,
    UserSavedCode,
    UserSubmission,
)

router = APIRouter(prefix="/api", tags=["questions"])


def _resolve_question(db: Session, id_or_slug: str) -> Question | None:
    if id_or_slug.isdigit():
        return db.get(Question, int(id_or_slug))
    return db.scalar(select(Question).where(Question.slug == id_or_slug))


def _resolve_category(db: Session, id_or_slug: str) -> Category | None:
    if id_or_slug.isdigit():
        return db.get(Category, int(id_or_slug))
    return db.scalar(select(Category).where(Category.slug == id_or_slug))


@router.get("/categories")
def list_categories(user: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    cats = db.scalars(select(Category).order_by(asc(Category.order_index))).all()
    uid = user.id if user else -1
    out = []
    for c in cats:
        qs = db.scalars(select(Question).where(Question.category_id == c.id)).all()
        solved = 0
        attempted = 0
        if uid > 0 and qs:
            q_ids = [q.id for q in qs]
            solved = (
                db.scalar(
                    select(func.count()).select_from(UserQuestionProgress).where(
                        UserQuestionProgress.user_id == uid,
                        UserQuestionProgress.question_id.in_(q_ids),
                        UserQuestionProgress.status == "Solved",
                    )
                )
                or 0
            )
            attempted = (
                db.scalar(
                    select(func.count()).select_from(UserQuestionProgress).where(
                        UserQuestionProgress.user_id == uid,
                        UserQuestionProgress.question_id.in_(q_ids),
                        UserQuestionProgress.status == "Attempted",
                    )
                )
                or 0
            )
        out.append({
            "id": c.id,
            "slug": c.slug,
            "order_index": c.order_index,
            "name": c.name,
            "description": c.description,
            "total_count": len(qs),
            "easy_count": sum(1 for q in qs if q.difficulty == "Easy"),
            "medium_count": sum(1 for q in qs if q.difficulty == "Medium"),
            "hard_count": sum(1 for q in qs if q.difficulty == "Hard"),
            "solved_count": solved,
            "attempted_count": attempted,
            "concept_count": len(c.concepts),
        })
    return {"categories": out}


@router.get("/categories/{id_or_slug}")
def category_detail(id_or_slug: str, user: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    cat = _resolve_category(db, id_or_slug)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found.")

    uid = user.id if user else -1
    prog_map = {}
    bm_set = set()
    rev_set = set()
    if uid > 0:
        for p in db.scalars(select(UserQuestionProgress).where(UserQuestionProgress.user_id == uid)):
            prog_map[p.question_id] = p
        bm_set = set(db.scalars(select(UserBookmark.question_id).where(UserBookmark.user_id == uid)))
        rev_set = set(db.scalars(select(UserRevision.question_id).where(UserRevision.user_id == uid)))

    concepts = db.scalars(select(Concept).where(Concept.category_id == cat.id).order_by(asc(Concept.order_index))).all()
    qs = db.scalars(select(Question).where(Question.category_id == cat.id).order_by(asc(Question.question_number))).all()

    return {
        "category": {"id": cat.id, "slug": cat.slug, "order_index": cat.order_index, "name": cat.name, "description": cat.description},
        "concepts": [
            {
                "id": con.id,
                "slug": con.slug,
                "order_index": con.order_index,
                "name": con.name,
                "summary": con.summary,
                "question_count": sum(1 for q in qs if q.concept_id == con.id),
                "solved_count": sum(1 for q in qs if q.concept_id == con.id and q.id in prog_map and prog_map[q.id].status == "Solved"),
            }
            for con in concepts
        ],
        "questions": [
            {
                "id": q.id,
                "question_number": q.question_number,
                "slug": q.slug,
                "title": q.title,
                "difficulty": q.difficulty,
                "question_type": q.question_type,
                "concept_name": q.concept.name,
                "concept_slug": q.concept.slug,
                "status": prog_map[q.id].status if q.id in prog_map else "Not Started",
                "attempts_count": prog_map[q.id].attempts_count if q.id in prog_map else 0,
                "is_bookmarked": q.id in bm_set,
                "is_revision": q.id in rev_set,
            }
            for q in qs
        ],
    }


@router.get("/concepts")
def list_concepts(category: str = "", user: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    stmt = select(Concept, Category).join(Category, Category.id == Concept.category_id)
    if category:
        stmt = stmt.where(Category.slug == category)
    stmt = stmt.order_by(asc(Category.order_index), asc(Concept.order_index))
    rows = db.execute(stmt).all()

    uid = user.id if user else -1
    solved_qids = set()
    if uid > 0:
        solved_qids = set(
            db.scalars(
                select(UserQuestionProgress.question_id).where(
                    UserQuestionProgress.user_id == uid, UserQuestionProgress.status == "Solved"
                )
            )
        )

    all_qs = db.scalars(select(Question)).all()
    out = []
    for con, cat in rows:
        con_qs = [q for q in all_qs if q.concept_id == con.id]
        out.append({
            "id": con.id,
            "slug": con.slug,
            "order_index": con.order_index,
            "name": con.name,
            "summary": con.summary,
            "category_id": cat.id,
            "category_slug": cat.slug,
            "category_name": cat.name,
            "category_order": cat.order_index,
            "question_count": len(con_qs),
            "solved_count": sum(1 for q in con_qs if q.id in solved_qids),
        })
    return {"concepts": out}


@router.get("/questions")
def list_questions(
    q: str = "",
    category: str = "",
    concept: str = "",
    difficulty: str = "",
    status: str = "",
    type: str = "",
    bookmarked: bool = False,
    revision: bool = False,
    sort: str = "number",
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=400),
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    stmt = (
        select(Question, Category, Concept)
        .join(Category, Category.id == Question.category_id)
        .join(Concept, Concept.id == Question.concept_id)
    )
    if q.strip():
        needle = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Question.title).like(needle),
                func.lower(Concept.name).like(needle),
                func.lower(Category.name).like(needle),
            )
        )
    if category:
        stmt = stmt.where(Category.slug == category)
    if concept:
        stmt = stmt.where(Concept.slug == concept)
    if difficulty in {"Easy", "Medium", "Hard"}:
        stmt = stmt.where(Question.difficulty == difficulty)
    if type:
        stmt = stmt.where(Question.question_type == type)

    if sort == "difficulty":
        stmt = stmt.order_by(case((Question.difficulty == "Easy", 1), (Question.difficulty == "Medium", 2), else_=3), asc(Question.question_number))
    elif sort == "newest":
        stmt = stmt.order_by(desc(Question.id))
    else:
        stmt = stmt.order_by(asc(Question.question_number))

    rows = db.execute(stmt).all()
    uid = user.id if user else -1
    prog_map = {}
    bm_set = set()
    rev_set = set()
    if uid > 0:
        for p in db.scalars(select(UserQuestionProgress).where(UserQuestionProgress.user_id == uid)):
            prog_map[p.question_id] = p
        bm_set = set(db.scalars(select(UserBookmark.question_id).where(UserBookmark.user_id == uid)))
        rev_set = set(db.scalars(select(UserRevision.question_id).where(UserRevision.user_id == uid)))

    items = []
    for q_obj, c_obj, con_obj in rows:
        st = prog_map[q_obj.id].status if q_obj.id in prog_map else "Not Started"
        is_bm = q_obj.id in bm_set
        is_rev = q_obj.id in rev_set or st == "Needs Revision"
        if status and st != status:
            continue
        if bookmarked and not is_bm:
            continue
        if revision and not is_rev:
            continue
        items.append({
            "id": q_obj.id,
            "question_number": q_obj.question_number,
            "slug": q_obj.slug,
            "title": q_obj.title,
            "difficulty": q_obj.difficulty,
            "question_type": q_obj.question_type,
            "category_id": c_obj.id,
            "category_slug": c_obj.slug,
            "category_name": c_obj.name,
            "concept_id": con_obj.id,
            "concept_slug": con_obj.slug,
            "concept_name": con_obj.name,
            "status": st,
            "attempts_count": prog_map[q_obj.id].attempts_count if q_obj.id in prog_map else 0,
            "last_attempted_at": prog_map[q_obj.id].last_attempted_at.isoformat() if q_obj.id in prog_map and prog_map[q_obj.id].last_attempted_at else None,
            "is_bookmarked": is_bm,
            "is_revision": is_rev,
        })

    total = len(items)
    start = (page - 1) * limit
    total_pages = max(1, (total + limit - 1) // limit)
    return {"items": items[start : start + limit], "total": total, "page": page, "limit": limit, "total_pages": total_pages}


@router.get("/questions/{id_or_slug}")
def question_detail(id_or_slug: str, user: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    q_obj = _resolve_question(db, id_or_slug)
    if not q_obj:
        raise HTTPException(status_code=404, detail="Question not found.")

    public_tests = db.scalars(
        select(QuestionTestCase)
        .where(QuestionTestCase.question_id == q_obj.id, QuestionTestCase.is_hidden.is_(False))
        .order_by(asc(QuestionTestCase.order_index))
    ).all()
    hidden_count = (
        db.scalar(
            select(func.count()).select_from(QuestionTestCase).where(QuestionTestCase.question_id == q_obj.id, QuestionTestCase.is_hidden.is_(True))
        )
        or 0
    )
    hints = db.scalars(select(QuestionHint).where(QuestionHint.question_id == q_obj.id).order_by(asc(QuestionHint.order_index))).all()

    user_state = {"status": "Not Started", "attempts_count": 0, "is_bookmarked": False, "is_revision": False, "saved_code": None, "used_hints": []}
    if user:
        prog = db.scalar(select(UserQuestionProgress).where(UserQuestionProgress.user_id == user.id, UserQuestionProgress.question_id == q_obj.id))
        bm = db.scalar(select(UserBookmark).where(UserBookmark.user_id == user.id, UserBookmark.question_id == q_obj.id))
        rev = db.scalar(select(UserRevision).where(UserRevision.user_id == user.id, UserRevision.question_id == q_obj.id))
        saved = db.scalar(select(UserSavedCode).where(UserSavedCode.user_id == user.id, UserSavedCode.question_id == q_obj.id))
        used_hints = list(db.scalars(select(UserHintUsage.hint_order).where(UserHintUsage.user_id == user.id, UserHintUsage.question_id == q_obj.id).order_by(asc(UserHintUsage.hint_order))))
        user_state = {
            "status": prog.status if prog else "Not Started",
            "attempts_count": prog.attempts_count if prog else 0,
            "is_bookmarked": bm is not None,
            "is_revision": rev is not None,
            "revision_notes": rev.notes if rev else "",
            "revision_priority": rev.priority if rev else "Medium",
            "saved_code": saved.source_code if saved else None,
            "used_hints": used_hints,
        }

    prev_q = db.scalar(select(Question).where(Question.question_number == q_obj.question_number - 1))
    next_q = db.scalar(select(Question).where(Question.question_number == q_obj.question_number + 1))

    return {
        "question": {
            "id": q_obj.id,
            "question_number": q_obj.question_number,
            "slug": q_obj.slug,
            "title": q_obj.title,
            "category_id": q_obj.category_id,
            "category_slug": q_obj.category.slug,
            "category_name": q_obj.category.name,
            "concept_id": q_obj.concept_id,
            "concept_slug": q_obj.concept.slug,
            "concept_name": q_obj.concept.name,
            "difficulty": q_obj.difficulty,
            "question_type": q_obj.question_type,
            "problem_statement": q_obj.problem_statement,
            "input_format": q_obj.input_format,
            "output_format": q_obj.output_format,
            "constraints": q_obj.constraints,
            "examples": json.loads(q_obj.examples_json or "[]"),
            "starter_code": q_obj.starter_code,
            "function_name": q_obj.function_name,
            "evaluation_mode": q_obj.evaluation_mode,
            "related_concepts": json.loads(q_obj.related_concepts_json or "[]"),
            "hidden_test_count": hidden_count,
        },
        "public_test_cases": [
            {"id": t.id, "order_index": t.order_index, "input_data": t.input_data, "expected_output": t.expected_output, "description": t.description}
            for t in public_tests
        ],
        "hints": [{"id": h.id, "order_index": h.order_index, "hint_text": h.hint_text} for h in hints],
        "user_state": user_state,
        "prev_question": {"slug": prev_q.slug, "title": prev_q.title, "question_number": prev_q.question_number} if prev_q else None,
        "next_question": {"slug": next_q.slug, "title": next_q.title, "question_number": next_q.question_number} if next_q else None,
    }


@router.get("/questions/{id_or_slug}/eval-tests")
def question_eval_tests(id_or_slug: str, db: Session = Depends(get_db)):
    q_obj = _resolve_question(db, id_or_slug)
    if not q_obj:
        raise HTTPException(status_code=404, detail="Question not found.")
    all_tests = db.scalars(
        select(QuestionTestCase)
        .where(QuestionTestCase.question_id == q_obj.id)
        .order_by(asc(QuestionTestCase.is_hidden), asc(QuestionTestCase.order_index))
    ).all()
    return {
        "test_cases": [
            {
                "id": t.id,
                "order_index": t.order_index,
                "input_data": t.input_data,
                "expected_output": t.expected_output,
                "description": t.description,
                "is_hidden": bool(t.is_hidden),
            }
            for t in all_tests
        ]
    }


@router.get("/questions/{id_or_slug}/solution")
def question_solution(id_or_slug: str, db: Session = Depends(get_db)):
    q_obj = _resolve_question(db, id_or_slug)
    if not q_obj:
        raise HTTPException(status_code=404, detail="Question not found.")
    sol = db.scalar(select(QuestionSolution).where(QuestionSolution.question_id == q_obj.id))
    return {"solution": {"reference_code": sol.reference_code, "explanation": sol.explanation} if sol else None}


@router.post("/questions/{id_or_slug}/hints/{order}/use")
def use_hint(
    id_or_slug: str,
    order: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if order not in (1, 2, 3):
        raise HTTPException(status_code=400, detail="Hint order must be 1, 2, or 3.")
    q_obj = _resolve_question(db, id_or_slug)
    if not q_obj:
        raise HTTPException(status_code=404, detail="Question not found.")
    exists = db.scalar(
        select(UserHintUsage).where(
            UserHintUsage.user_id == current_user.id,
            UserHintUsage.question_id == q_obj.id,
            UserHintUsage.hint_order == order,
        )
    )
    if not exists:
        db.add(UserHintUsage(user_id=current_user.id, question_id=q_obj.id, hint_order=order))
        db.commit()
    used = list(
        db.scalars(
            select(UserHintUsage.hint_order)
            .where(UserHintUsage.user_id == current_user.id, UserHintUsage.question_id == q_obj.id)
            .order_by(asc(UserHintUsage.hint_order))
        )
    )
    return {"ok": True, "used_hints": used}


@router.get("/debugging/overview")
def debugging_overview(user: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    rows = db.execute(
        select(Question, Category, Concept)
        .join(Category, Category.id == Question.category_id)
        .join(Concept, Concept.id == Question.concept_id)
        .where(or_(Category.slug == "python-debugging-challenges", Question.question_type == "debugging"))
        .order_by(asc(Question.question_number))
    ).all()
    uid = user.id if user else -1
    prog_map = {}
    hint_counts = {}
    total_subs = 0
    accepted_subs = 0
    if uid > 0:
        for p in db.scalars(select(UserQuestionProgress).where(UserQuestionProgress.user_id == uid)):
            prog_map[p.question_id] = p
        for h in db.scalars(select(UserHintUsage).where(UserHintUsage.user_id == uid)):
            hint_counts[h.question_id] = hint_counts.get(h.question_id, 0) + 1
        qids = {q.id for q, _, _ in rows}
        for s in db.scalars(select(UserSubmission).where(UserSubmission.user_id == uid)):
            if s.question_id in qids:
                total_subs += 1
                if s.status == "Accepted":
                    accepted_subs += 1
    questions = [
        {
            "id": q.id,
            "question_number": q.question_number,
            "slug": q.slug,
            "title": q.title,
            "difficulty": q.difficulty,
            "question_type": q.question_type,
            "category_slug": c.slug,
            "category_name": c.name,
            "concept_slug": con.slug,
            "concept_name": con.name,
            "status": prog_map[q.id].status if q.id in prog_map else "Not Started",
            "attempts_count": prog_map[q.id].attempts_count if q.id in prog_map else 0,
            "hints_used_count": hint_counts.get(q.id, 0),
        }
        for q, c, con in rows
    ]
    solved = sum(1 for q in questions if q["status"] == "Solved")
    attempted = sum(1 for q in questions if q["status"] == "Attempted")
    return {
        "stats": {
            "total": len(questions),
            "solved": solved,
            "attempted": attempted,
            "submissions_count": total_subs,
            "accepted_count": accepted_subs,
            "accuracy_pct": round((accepted_subs / total_subs) * 100, 1) if total_subs > 0 else 0,
        },
        "questions": questions,
    }

