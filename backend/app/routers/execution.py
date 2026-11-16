import json
from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import asc, desc, func, select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import (
    DailyChallengeCompletion,
    Question,
    QuestionTestCase,
    User,
    UserActivity,
    UserHintUsage,
    UserQuestionProgress,
    UserRevision,
    UserRevisionSetting,
    UserSavedCode,
    UserSubmission,
)
from app.schemas import ExecuteSubmitRequest, SavedCodeRequest

router = APIRouter(prefix="/api", tags=["execution"])
PYODIDE_ENGINE_NAME = "Pyodide WebAssembly (Browser Worker)"


def _get_question(db: Session, qid: int | str) -> Question:
    q = db.get(Question, qid) if isinstance(qid, int) or str(qid).isdigit() else db.scalar(select(Question).where(Question.slug == str(qid)))
    if not q:
        raise HTTPException(status_code=404, detail="Question not found.")
    return q


def get_daily_question_id(db: Session, date_str: str) -> int | None:
    qids = list(db.scalars(select(Question.id).order_by(asc(Question.question_number))))
    if not qids:
        return None
    h = 2166136261
    for ch in date_str:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return qids[h % len(qids)]


@router.post("/execute/submit")
def submit_code(
    payload: ExecuteSubmitRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = _get_question(db, payload.question_id)
    expected_count = (
        db.scalar(select(func.count()).select_from(QuestionTestCase).where(QuestionTestCase.question_id == q.id)) or 0
    )

    sanitized_results = []
    for r in payload.results:
        item = r.model_dump()
        if r.is_hidden:
            sanitized_results.append(
                {
                    "test_case_id": r.test_case_id,
                    "order_index": r.order_index,
                    "description": f"Hidden Test Case #{r.order_index}",
                    "is_hidden": True,
                    "passed": r.passed,
                    "verdict": r.verdict,
                    "status": r.status,
                    "execution_time_ms": r.execution_time_ms,
                }
            )
        else:
            sanitized_results.append(item)

    total_count = payload.total_count
    passed_count = min(payload.passed_count, total_count)
    is_accepted = (
        payload.status == "Accepted"
        and total_count > 0
        and total_count == expected_count
        and passed_count == total_count
    )

    client_hints = [h for h in payload.hints_used if h in (1, 2, 3)]
    for h_order in client_hints:
        exists = db.scalar(
            select(UserHintUsage).where(
                UserHintUsage.user_id == current_user.id,
                UserHintUsage.question_id == q.id,
                UserHintUsage.hint_order == h_order,
            )
        )
        if not exists:
            db.add(UserHintUsage(user_id=current_user.id, question_id=q.id, hint_order=h_order))
    db.flush()

    db_hints = list(
        db.scalars(
            select(UserHintUsage.hint_order)
            .where(UserHintUsage.user_id == current_user.id, UserHintUsage.question_id == q.id)
            .order_by(asc(UserHintUsage.hint_order))
        )
    )
    merged_hints = sorted(set(db_hints) | set(client_hints))

    sub = UserSubmission(
        user_id=current_user.id,
        question_id=q.id,
        source_code=payload.source_code,
        status=payload.status,
        passed_count=passed_count,
        total_count=total_count,
        execution_time_ms=payload.execution_time_ms,
        memory_kb=payload.memory_kb,
        error_output=payload.error_output,
        results_json=json.dumps(sanitized_results),
        hints_used=len(merged_hints),
        hints_used_json=json.dumps(merged_hints),
    )
    db.add(sub)
    db.flush()

    saved = db.scalar(select(UserSavedCode).where(UserSavedCode.user_id == current_user.id, UserSavedCode.question_id == q.id))
    if saved:
        saved.source_code = payload.source_code
    else:
        db.add(UserSavedCode(user_id=current_user.id, question_id=q.id, source_code=payload.source_code))

    prog = db.scalar(select(UserQuestionProgress).where(UserQuestionProgress.user_id == current_user.id, UserQuestionProgress.question_id == q.id))
    newly_solved = False
    now = datetime.now(timezone.utc)
    if prog:
        prog.attempts_count += 1
        prog.last_attempted_at = now
        if is_accepted:
            newly_solved = prog.status != "Solved"
            prog.status = "Solved"
            prog.solved_at = prog.solved_at or now
        elif prog.status != "Solved":
            prog.status = "Attempted"
    else:
        newly_solved = is_accepted
        db.add(
            UserQuestionProgress(
                user_id=current_user.id,
                question_id=q.id,
                status="Solved" if is_accepted else "Attempted",
                attempts_count=1,
                last_attempted_at=now,
                solved_at=now if is_accepted else None,
            )
        )

    today = date.today()
    act = db.scalar(select(UserActivity).where(UserActivity.user_id == current_user.id, UserActivity.activity_date == today))
    if act:
        act.submissions_count += 1
        if newly_solved:
            act.solved_count += 1
    else:
        db.add(UserActivity(user_id=current_user.id, activity_date=today, submissions_count=1, solved_count=1 if newly_solved else 0))

    # Spaced Revision auto-scheduling
    rev_settings = db.get(UserRevisionSetting, current_user.id)
    inc_days = rev_settings.incorrect_interval_days if rev_settings else 1
    hint_days = rev_settings.hinted_interval_days if rev_settings else 2
    ind_days = rev_settings.independent_interval_days if rev_settings else 7

    rev = db.scalar(select(UserRevision).where(UserRevision.user_id == current_user.id, UserRevision.question_id == q.id))
    if not is_accepted:
        next_at = (now + timedelta(days=inc_days)).strftime("%Y-%m-%d %H:%M:%S")
        if rev:
            rev.priority = "High"
            rev.interval_days = inc_days
            rev.next_review_at = next_at
            rev.reason = "incorrect"
        else:
            db.add(UserRevision(user_id=current_user.id, question_id=q.id, priority="High", interval_days=inc_days, next_review_at=next_at, reason="incorrect"))
    elif len(merged_hints) > 0:
        next_at = (now + timedelta(days=hint_days)).strftime("%Y-%m-%d %H:%M:%S")
        if rev:
            rev.priority = "Medium"
            rev.interval_days = hint_days
            rev.next_review_at = next_at
            rev.reason = "hinted"
        else:
            db.add(UserRevision(user_id=current_user.id, question_id=q.id, priority="Medium", interval_days=hint_days, next_review_at=next_at, reason="hinted"))
    elif rev:
        next_at = (now + timedelta(days=ind_days)).strftime("%Y-%m-%d %H:%M:%S")
        rev.priority = "Low"
        rev.interval_days = ind_days
        rev.next_review_at = next_at
        rev.last_reviewed_at = now.strftime("%Y-%m-%d %H:%M:%S")
        rev.review_count += 1
        rev.reason = "independent"

    today_str = now.strftime("%Y-%m-%d")
    if is_accepted and get_daily_question_id(db, today_str) == q.id:
        daily = db.scalar(
            select(DailyChallengeCompletion).where(
                DailyChallengeCompletion.user_id == current_user.id,
                DailyChallengeCompletion.challenge_date == today_str,
            )
        )
        if daily:
            daily.status = "Solved"
            daily.submission_id = sub.id
        else:
            db.add(DailyChallengeCompletion(user_id=current_user.id, challenge_date=today_str, question_id=q.id, status="Solved", submission_id=sub.id))

    db.commit()
    db.refresh(sub)
    return {
        "submission_id": sub.id,
        "engine": payload.engine or PYODIDE_ENGINE_NAME,
        "status": payload.status,
        "passed_count": passed_count,
        "total_count": total_count,
        "execution_time_ms": payload.execution_time_ms,
        "memory_kb": payload.memory_kb,
        "error_output": payload.error_output,
        "hints_used": len(merged_hints),
        "hints_used_list": merged_hints,
        "results": sanitized_results,
    }


@router.get("/submissions")
def list_submissions(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(UserSubmission).where(UserSubmission.user_id == current_user.id).order_by(desc(UserSubmission.id)).limit(50)
    ).all()
    return {
        "submissions": [
            {
                "id": s.id,
                "question_id": s.question_id,
                "status": s.status,
                "passed_count": s.passed_count,
                "total_count": s.total_count,
                "execution_time_ms": s.execution_time_ms,
                "source_code": s.source_code,
                "hints_used": s.hints_used,
                "hints_used_list": json.loads(s.hints_used_json or "[]"),
                "created_at": s.created_at.isoformat(),
            }
            for s in rows
        ]
    }


@router.get("/questions/{question_id}/submissions")
def list_question_submissions(question_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = _get_question(db, question_id)
    rows = db.scalars(
        select(UserSubmission)
        .where(UserSubmission.user_id == current_user.id, UserSubmission.question_id == q.id)
        .order_by(desc(UserSubmission.id))
        .limit(30)
    ).all()
    return {
        "submissions": [
            {
                "id": s.id,
                "status": s.status,
                "passed_count": s.passed_count,
                "total_count": s.total_count,
                "execution_time_ms": s.execution_time_ms,
                "memory_kb": s.memory_kb,
                "error_output": s.error_output,
                "source_code": s.source_code,
                "hints_used": s.hints_used,
                "hints_used_list": json.loads(s.hints_used_json or "[]"),
                "created_at": s.created_at.isoformat(),
            }
            for s in rows
        ]
    }


@router.put("/saved-code/{question_id}")
def save_code(
    question_id: str,
    payload: SavedCodeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = _get_question(db, question_id)
    saved = db.scalar(select(UserSavedCode).where(UserSavedCode.user_id == current_user.id, UserSavedCode.question_id == q.id))
    if saved:
        saved.source_code = payload.source_code
    else:
        db.add(UserSavedCode(user_id=current_user.id, question_id=q.id, source_code=payload.source_code))
    db.commit()
    return {"ok": True}
