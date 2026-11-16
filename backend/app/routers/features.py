import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import asc, desc, func, select
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_optional_user
from app.database import get_db
from app.models import (
    Category,
    Concept,
    DailyChallengeCompletion,
    InterviewPrepProgress,
    MockInterview,
    Question,
    QuestionTestCase,
    User,
    UserHintUsage,
    UserNote,
    UserQuestionProgress,
    UserSubmission,
)
from app.routers.execution import get_daily_question_id
from app.schemas import (
    InterviewPrepProgressRequest,
    MockInterviewStartRequest,
    MockInterviewSubmitRequest,
    NoteCreateRequest,
)

router = APIRouter(prefix="/api", tags=["features"])


@router.post("/mock-interviews/start", status_code=201)
def start_mock_interview(
    payload: MockInterviewStartRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = select(Question, Category, Concept).join(Category, Category.id == Question.category_id).join(Concept, Concept.id == Question.concept_id)
    if payload.difficulty != "Mixed":
        stmt = stmt.where(Question.difficulty == payload.difficulty)
    if payload.category_slug:
        stmt = stmt.where(Category.slug == payload.category_slug)
    pool = db.execute(stmt.order_by(func.random()).limit(payload.question_count)).all()
    if not pool:
        pool = db.execute(
            select(Question, Category, Concept)
            .join(Category, Category.id == Question.category_id)
            .join(Concept, Concept.id == Question.concept_id)
            .order_by(func.random())
            .limit(payload.question_count)
        ).all()

    interview = MockInterview(
        user_id=current_user.id,
        difficulty=payload.difficulty,
        category_slug=payload.category_slug,
        duration_minutes=payload.duration_minutes,
        question_ids_json=json.dumps([q.id for q, _, _ in pool]),
        total_questions=len(pool),
        status="in_progress",
    )
    db.add(interview)
    db.commit()
    db.refresh(interview)

    questions = []
    for q, c, con in pool:
        tests = db.scalars(select(QuestionTestCase).where(QuestionTestCase.question_id == q.id).order_by(asc(QuestionTestCase.is_hidden), asc(QuestionTestCase.order_index))).all()
        questions.append({
            "id": q.id,
            "question_number": q.question_number,
            "slug": q.slug,
            "title": q.title,
            "difficulty": q.difficulty,
            "question_type": q.question_type,
            "problem_statement": q.problem_statement,
            "input_format": q.input_format,
            "output_format": q.output_format,
            "constraints": q.constraints,
            "examples": json.loads(q.examples_json or "[]"),
            "starter_code": q.starter_code,
            "function_name": q.function_name,
            "evaluation_mode": q.evaluation_mode,
            "category_slug": c.slug,
            "category_name": c.name,
            "concept_name": con.name,
            "public_test_cases": [
                {"id": t.id, "order_index": t.order_index, "input_data": t.input_data, "expected_output": t.expected_output, "description": t.description}
                for t in tests if not t.is_hidden
            ],
            "eval_test_cases": [
                {"id": t.id, "order_index": t.order_index, "input_data": t.input_data, "expected_output": t.expected_output, "description": t.description, "is_hidden": bool(t.is_hidden)}
                for t in tests
            ],
        })

    return {
        "interview": {
            "id": interview.id,
            "difficulty": interview.difficulty,
            "category_slug": interview.category_slug,
            "duration_minutes": interview.duration_minutes,
            "total_questions": interview.total_questions,
            "status": interview.status,
        },
        "questions": questions,
    }


@router.post("/mock-interviews/{interview_id}/submit")
def submit_mock_interview(
    interview_id: int,
    payload: MockInterviewSubmitRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    interview = db.scalar(select(MockInterview).where(MockInterview.id == interview_id, MockInterview.user_id == current_user.id))
    if not interview:
        raise HTTPException(status_code=404, detail="Mock interview not found.")
    answers = [a.model_dump() for a in payload.answers]
    total_q = max(1, interview.total_questions or len(answers))
    passed_q = sum(1 for a in answers if a["status"] == "Accepted" and a["total_count"] > 0 and a["passed_count"] == a["total_count"])
    score_pct = round((passed_q / total_q) * 100, 1)

    interview.answers_json = json.dumps(answers)
    interview.score_pct = score_pct
    interview.passed_questions = passed_q
    interview.time_spent_seconds = payload.time_spent_seconds
    interview.status = "completed"
    interview.completed_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    db.commit()
    return {
        "interview": {
            "id": interview.id,
            "difficulty": interview.difficulty,
            "category_slug": interview.category_slug,
            "duration_minutes": interview.duration_minutes,
            "score_pct": score_pct,
            "passed_questions": passed_q,
            "total_questions": total_q,
            "time_spent_seconds": payload.time_spent_seconds,
            "status": "completed",
            "answers": answers,
        }
    }


@router.get("/mock-interviews")
def list_mock_interviews(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(MockInterview).where(MockInterview.user_id == current_user.id).order_by(desc(MockInterview.id)).limit(25)).all()
    return {
        "interviews": [
            {
                "id": r.id,
                "difficulty": r.difficulty,
                "category_slug": r.category_slug,
                "duration_minutes": r.duration_minutes,
                "score_pct": r.score_pct,
                "passed_questions": r.passed_questions,
                "total_questions": r.total_questions,
                "time_spent_seconds": r.time_spent_seconds,
                "status": r.status,
                "started_at": r.started_at.isoformat() if r.started_at else "",
                "completed_at": r.completed_at,
                "answers": json.loads(r.answers_json or "[]"),
            }
            for r in rows
        ]
    }


@router.get("/roadmap")
def get_roadmap(user: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    uid = user.id if user else -1
    cats = db.scalars(select(Category).order_by(asc(Category.order_index))).all()
    cons = db.scalars(select(Concept).order_by(asc(Concept.order_index))).all()
    qs = db.scalars(select(Question)).all()
    solved_ids = set()
    if uid > 0:
        solved_ids = set(db.scalars(select(UserQuestionProgress.question_id).where(UserQuestionProgress.user_id == uid, UserQuestionProgress.status == "Solved")))

    modules = []
    for c in cats:
        c_qs = [q for q in qs if q.category_id == c.id]
        c_cons = [con for con in cons if con.category_id == c.id]
        solved = sum(1 for q in c_qs if q.id in solved_ids)
        con_items = []
        for con in c_cons:
            con_qs = [q for q in c_qs if q.concept_id == con.id]
            c_solved = sum(1 for q in con_qs if q.id in solved_ids)
            con_items.append({
                "id": con.id,
                "slug": con.slug,
                "name": con.name,
                "summary": con.summary,
                "category_slug": c.slug,
                "category_name": c.name,
                "total_count": len(con_qs),
                "solved_count": c_solved,
                "completion_pct": round((c_solved / len(con_qs)) * 100, 1) if con_qs else 0,
                "is_completed": len(con_qs) > 0 and c_solved >= len(con_qs),
            })
        modules.append({
            "id": c.id,
            "slug": c.slug,
            "order_index": c.order_index,
            "name": c.name,
            "description": c.description,
            "total_count": len(c_qs),
            "solved_count": solved,
            "completion_pct": round((solved / len(c_qs)) * 100, 1) if c_qs else 0,
            "is_completed": len(c_qs) > 0 and solved >= len(c_qs),
            "concept_total": len(con_items),
            "concept_completed": sum(1 for ci in con_items if ci["is_completed"]),
            "concepts": con_items,
        })

    all_cons = [ci for m in modules for ci in m["concepts"]]
    return {
        "summary": {
            "modules_completed": sum(1 for m in modules if m["is_completed"]),
            "modules_total": len(modules),
            "concepts_completed": sum(1 for ci in all_cons if ci["is_completed"]),
            "concepts_total": len(all_cons),
            "questions_solved": len(solved_ids),
            "questions_total": len(qs),
            "overall_pct": round((len(solved_ids) / len(qs)) * 100, 1) if qs else 0,
        },
        "difficulty_progress": [
            {
                "difficulty": d,
                "total": sum(1 for q in qs if q.difficulty == d),
                "solved": sum(1 for q in qs if q.difficulty == d and q.id in solved_ids),
                "pct": round((sum(1 for q in qs if q.difficulty == d and q.id in solved_ids) / max(1, sum(1 for q in qs if q.difficulty == d))) * 100, 1),
            }
            for d in ("Easy", "Medium", "Hard")
        ],
        "recommended_next_concepts": [ci for ci in all_cons if not ci["is_completed"]][:4],
        "weak_concepts": [],
        "modules": modules,
    }


@router.get("/daily-challenge")
def daily_challenge(user: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    qid = get_daily_question_id(db, today_str)
    if not qid:
        raise HTTPException(status_code=404, detail="No questions available.")
    q = db.get(Question, qid)
    comp = None
    total_comp = 0
    if user and q:
        comp = db.scalar(select(DailyChallengeCompletion).where(DailyChallengeCompletion.user_id == user.id, DailyChallengeCompletion.challenge_date == today_str))
        total_comp = len(db.scalars(select(DailyChallengeCompletion.id).where(DailyChallengeCompletion.user_id == user.id)).all())
    return {
        "date": today_str,
        "question": {
            "id": q.id,
            "question_number": q.question_number,
            "slug": q.slug,
            "title": q.title,
            "difficulty": q.difficulty,
            "question_type": q.question_type,
            "problem_statement": q.problem_statement,
            "category_name": q.category.name,
            "category_slug": q.category.slug,
            "concept_name": q.concept.name,
        } if q else None,
        "is_completed": comp is not None,
        "daily_streak": 1 if comp else 0,
        "total_completed": total_comp,
        "recent_completions": [],
    }


@router.get("/notes")
def list_notes(q: str = "", type: str = "", current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = select(UserNote).where(UserNote.user_id == current_user.id)
    if type in {"concept", "question", "interview", "pattern"}:
        stmt = stmt.where(UserNote.target_type == type)
    rows = db.scalars(stmt.order_by(desc(UserNote.updated_at), desc(UserNote.id))).all()
    if q.strip():
        needle = q.strip().lower()
        rows = [r for r in rows if needle in r.title.lower() or needle in r.content.lower() or needle in r.tags.lower()]
    return {
        "notes": [
            {
                "id": r.id,
                "target_type": r.target_type,
                "target_ref": r.target_ref,
                "title": r.title,
                "content": r.content,
                "tags": r.tags,
                "created_at": r.created_at.isoformat() if r.created_at else "",
                "updated_at": r.updated_at.isoformat() if r.updated_at else "",
            }
            for r in rows
        ]
    }


@router.post("/notes", status_code=201)
def create_note(payload: NoteCreateRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    note = UserNote(user_id=current_user.id, **payload.model_dump())
    db.add(note)
    db.commit()
    db.refresh(note)
    return {"note": {"id": note.id, "target_type": note.target_type, "target_ref": note.target_ref, "title": note.title, "content": note.content, "tags": note.tags}}


@router.put("/notes/{note_id}")
def update_note(note_id: int, payload: NoteCreateRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    note = db.scalar(select(UserNote).where(UserNote.id == note_id, UserNote.user_id == current_user.id))
    if not note:
        raise HTTPException(status_code=404, detail="Note not found.")
    note.target_type = payload.target_type
    note.target_ref = payload.target_ref
    note.title = payload.title
    note.content = payload.content
    note.tags = payload.tags
    db.commit()
    return {"note": {"id": note.id, "target_type": note.target_type, "target_ref": note.target_ref, "title": note.title, "content": note.content, "tags": note.tags}}


@router.delete("/notes/{note_id}")
def delete_note(note_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    note = db.scalar(select(UserNote).where(UserNote.id == note_id, UserNote.user_id == current_user.id))
    if not note:
        raise HTTPException(status_code=404, detail="Note not found.")
    db.delete(note)
    db.commit()
    return {"ok": True}
