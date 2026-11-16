import json
from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import asc, desc, func, select
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_optional_user
from app.database import get_db
from app.models import (
    Category,
    Concept,
    MockInterview,
    Question,
    User,
    UserActivity,
    UserBookmark,
    UserHintUsage,
    UserQuestionProgress,
    UserRevision,
    UserRevisionSetting,
    UserSubmission,
)
from app.schemas import (
    ProgressStatusRequest,
    RevisionReviewRequest,
    RevisionSettingsRequest,
    RevisionUpsertRequest,
)

router = APIRouter(prefix="/api", tags=["progress"])


def _resolve_qid(db: Session, id_or_slug: str) -> int:
    q = db.get(Question, int(id_or_slug)) if id_or_slug.isdigit() else db.scalar(select(Question).where(Question.slug == id_or_slug))
    if not q:
        raise HTTPException(status_code=404, detail="Question not found.")
    return q.id


def _get_rev_settings(db: Session, user_id: int) -> dict:
    s = db.get(UserRevisionSetting, user_id)
    if not s:
        return {
            "incorrect_interval_days": 1,
            "hinted_interval_days": 2,
            "independent_interval_days": 7,
            "forgotten_interval_days": 1,
        }
    return {
        "incorrect_interval_days": s.incorrect_interval_days,
        "hinted_interval_days": s.hinted_interval_days,
        "independent_interval_days": s.independent_interval_days,
        "forgotten_interval_days": s.forgotten_interval_days,
    }


def _compute_streak(db: Session, user_id: int) -> int:
    rows = db.scalars(
        select(UserActivity.activity_date)
        .where(UserActivity.user_id == user_id, UserActivity.submissions_count > 0)
        .order_by(desc(UserActivity.activity_date))
    ).all()
    if not rows:
        return 0
    dates = set(rows)
    cursor = date.today()
    if cursor not in dates:
        cursor = cursor - timedelta(days=1)
        if cursor not in dates:
            return 0
    streak = 0
    while cursor in dates:
        streak += 1
        cursor = cursor - timedelta(days=1)
    return streak


def _build_overview(db: Session, user: User | None) -> dict:
    all_qs = db.scalars(select(Question)).all()
    total = len(all_qs)
    easy_total = sum(1 for q in all_qs if q.difficulty == "Easy")
    medium_total = sum(1 for q in all_qs if q.difficulty == "Medium")
    hard_total = sum(1 for q in all_qs if q.difficulty == "Hard")

    if not user:
        return {
            "total_questions": total,
            "solved_questions": 0,
            "attempted_questions": 0,
            "pending_questions": total,
            "revision_questions": 0,
            "bookmarked_questions": 0,
            "mastery_percentage": 0,
            "current_streak": 0,
            "difficulty": {
                "Easy": {"solved": 0, "total": easy_total},
                "Medium": {"solved": 0, "total": medium_total},
                "Hard": {"solved": 0, "total": hard_total},
            },
        }

    q_map = {q.id: q for q in all_qs}
    progs = db.scalars(select(UserQuestionProgress).where(UserQuestionProgress.user_id == user.id)).all()
    solved_ids = {p.question_id for p in progs if p.status == "Solved"}
    attempted_count = sum(1 for p in progs if p.status == "Attempted")
    rev_ids = set(db.scalars(select(UserRevision.question_id).where(UserRevision.user_id == user.id))) | {
        p.question_id for p in progs if p.status == "Needs Revision"
    }
    bm_count = len(db.scalars(select(UserBookmark.id).where(UserBookmark.user_id == user.id)).all())

    return {
        "total_questions": total,
        "solved_questions": len(solved_ids),
        "attempted_questions": attempted_count,
        "pending_questions": max(0, total - len(solved_ids)),
        "revision_questions": len(rev_ids),
        "bookmarked_questions": bm_count,
        "mastery_percentage": round((len(solved_ids) / total) * 100, 1) if total > 0 else 0,
        "current_streak": _compute_streak(db, user.id),
        "difficulty": {
            "Easy": {"solved": sum(1 for qid in solved_ids if qid in q_map and q_map[qid].difficulty == "Easy"), "total": easy_total},
            "Medium": {"solved": sum(1 for qid in solved_ids if qid in q_map and q_map[qid].difficulty == "Medium"), "total": medium_total},
            "Hard": {"solved": sum(1 for qid in solved_ids if qid in q_map and q_map[qid].difficulty == "Hard"), "total": hard_total},
        },
    }


@router.put("/progress/{question_id}")
def update_progress(
    question_id: str,
    payload: ProgressStatusRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    qid = _resolve_qid(db, question_id)
    prog = db.scalar(select(UserQuestionProgress).where(UserQuestionProgress.user_id == current_user.id, UserQuestionProgress.question_id == qid))
    if prog:
        prog.status = payload.status
    else:
        db.add(UserQuestionProgress(user_id=current_user.id, question_id=qid, status=payload.status))
    db.commit()
    return {"ok": True, "status": payload.status}


@router.get("/bookmarks")
def get_bookmarks(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        select(UserBookmark, Question, Category, Concept)
        .join(Question, Question.id == UserBookmark.question_id)
        .join(Category, Category.id == Question.category_id)
        .join(Concept, Concept.id == Question.concept_id)
        .where(UserBookmark.user_id == current_user.id)
        .order_by(desc(UserBookmark.created_at))
    ).all()
    prog_map = {p.question_id: p.status for p in db.scalars(select(UserQuestionProgress).where(UserQuestionProgress.user_id == current_user.id))}
    return {
        "bookmarks": [
            {
                "id": q.id,
                "question_number": q.question_number,
                "slug": q.slug,
                "title": q.title,
                "difficulty": q.difficulty,
                "question_type": q.question_type,
                "category_name": cat.name,
                "category_slug": cat.slug,
                "concept_name": con.name,
                "status": prog_map.get(q.id, "Not Started"),
                "bookmarked_at": bm.created_at.isoformat(),
            }
            for bm, q, cat, con in rows
        ]
    }


@router.post("/bookmarks/{question_id}", status_code=201)
def add_bookmark(question_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    qid = _resolve_qid(db, question_id)
    exists = db.scalar(select(UserBookmark).where(UserBookmark.user_id == current_user.id, UserBookmark.question_id == qid))
    if not exists:
        db.add(UserBookmark(user_id=current_user.id, question_id=qid))
        db.commit()
    return {"ok": True, "bookmarked": True}


@router.delete("/bookmarks/{question_id}")
def remove_bookmark(question_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    qid = _resolve_qid(db, question_id)
    bm = db.scalar(select(UserBookmark).where(UserBookmark.user_id == current_user.id, UserBookmark.question_id == qid))
    if bm:
        db.delete(bm)
        db.commit()
    return {"ok": True, "bookmarked": False}


def _serialize_revisions(db: Session, user_id: int) -> list[dict]:
    rows = db.execute(
        select(UserRevision, Question, Category, Concept)
        .join(Question, Question.id == UserRevision.question_id)
        .join(Category, Category.id == Question.category_id)
        .join(Concept, Concept.id == Question.concept_id)
        .where(UserRevision.user_id == user_id)
        .order_by(desc(UserRevision.updated_at))
    ).all()
    prog_map = {p.question_id: p.status for p in db.scalars(select(UserQuestionProgress).where(UserQuestionProgress.user_id == user_id))}
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    return [
        {
            "id": q.id,
            "question_number": q.question_number,
            "slug": q.slug,
            "title": q.title,
            "difficulty": q.difficulty,
            "question_type": q.question_type,
            "category_name": cat.name,
            "category_slug": cat.slug,
            "concept_name": con.name,
            "status": prog_map.get(q.id, "Needs Revision"),
            "notes": rev.notes,
            "priority": rev.priority,
            "interval_days": rev.interval_days,
            "next_review_at": rev.next_review_at,
            "last_reviewed_at": rev.last_reviewed_at,
            "review_count": rev.review_count,
            "reason": rev.reason,
            "revision_updated_at": rev.updated_at.isoformat(),
            "is_due": 1 if (not rev.next_review_at or rev.next_review_at <= now_str) else 0,
        }
        for rev, q, cat, con in rows
    ]


@router.get("/revisions")
def get_revisions(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"revisions": _serialize_revisions(db, current_user.id)}


@router.get("/revisions/settings")
def get_revision_settings(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"settings": _get_rev_settings(db, current_user.id)}


@router.put("/revisions/settings")
def update_revision_settings(
    payload: RevisionSettingsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    s = db.get(UserRevisionSetting, current_user.id)
    if s:
        s.incorrect_interval_days = payload.incorrect_interval_days
        s.hinted_interval_days = payload.hinted_interval_days
        s.independent_interval_days = payload.independent_interval_days
        s.forgotten_interval_days = payload.forgotten_interval_days
    else:
        db.add(UserRevisionSetting(user_id=current_user.id, **payload.model_dump()))
    db.commit()
    return {"ok": True, "settings": payload.model_dump()}


@router.get("/revisions/dashboard")
def get_revision_dashboard(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    settings = _get_rev_settings(db, current_user.id)
    queued = _serialize_revisions(db, current_user.id)
    due_now = [r for r in queued if r["is_due"] == 1]
    forgotten = [r for r in queued if r["reason"] == "forgotten"]
    return {
        "settings": settings,
        "summary": {
            "total_queued": len(queued),
            "due_now": len(due_now),
            "forgotten_count": len(forgotten),
            "incorrect_count": sum(1 for r in queued if r["reason"] == "incorrect"),
            "hinted_count": sum(1 for r in queued if r["reason"] == "hinted"),
            "independent_count": sum(1 for r in queued if r["reason"] == "independent"),
        },
        "queued": queued,
        "suggestions": {
            "due_now": due_now,
            "incorrect": [r for r in queued if r["reason"] == "incorrect"],
            "hinted": [r for r in queued if r["reason"] == "hinted"],
            "independent": [r for r in queued if r["reason"] == "independent"],
            "forgotten": forgotten,
        },
    }


@router.post("/revisions/{question_id}/review")
def review_revision(
    question_id: str,
    payload: RevisionReviewRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    qid = _resolve_qid(db, question_id)
    settings = _get_rev_settings(db, current_user.id)
    rev = db.scalar(select(UserRevision).where(UserRevision.user_id == current_user.id, UserRevision.question_id == qid))
    now = datetime.now(timezone.utc)
    if payload.outcome == "forgot":
        days = settings["forgotten_interval_days"]
        reason = "forgotten"
        prio = "High"
    else:
        days = min(30, max(settings["independent_interval_days"], (rev.interval_days * 2 if rev else 7)))
        reason = "independent"
        prio = "Low"
    next_at = (now + timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
    if rev:
        rev.priority = prio
        rev.interval_days = days
        rev.next_review_at = next_at
        rev.last_reviewed_at = now.strftime("%Y-%m-%d %H:%M:%S")
        rev.review_count += 1
        rev.reason = reason
    else:
        db.add(UserRevision(user_id=current_user.id, question_id=qid, priority=prio, interval_days=days, next_review_at=next_at, last_reviewed_at=now.strftime("%Y-%m-%d %H:%M:%S"), review_count=1, reason=reason))
    db.commit()
    return {"ok": True, "interval_days": days, "reason": reason}


@router.post("/revisions/{question_id}", status_code=201)
def upsert_revision(
    question_id: str,
    payload: RevisionUpsertRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    qid = _resolve_qid(db, question_id)
    rev = db.scalar(select(UserRevision).where(UserRevision.user_id == current_user.id, UserRevision.question_id == qid))
    if rev:
        rev.notes = payload.notes
        rev.priority = payload.priority
    else:
        db.add(UserRevision(user_id=current_user.id, question_id=qid, notes=payload.notes, priority=payload.priority, reason="manual"))
    db.commit()
    return {"ok": True, "revision": True, "notes": payload.notes, "priority": payload.priority}


@router.delete("/revisions/{question_id}")
def remove_revision(question_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    qid = _resolve_qid(db, question_id)
    rev = db.scalar(select(UserRevision).where(UserRevision.user_id == current_user.id, UserRevision.question_id == qid))
    if rev:
        db.delete(rev)
        db.commit()
    return {"ok": True, "revision": False}


@router.get("/analytics/overview")
def analytics_overview(user: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    overview = _build_overview(db, user)
    recent_subs = []
    if user:
        sub_rows = db.execute(
            select(UserSubmission, Question)
            .join(Question, Question.id == UserSubmission.question_id)
            .where(UserSubmission.user_id == user.id)
            .order_by(desc(UserSubmission.id))
            .limit(6)
        ).all()
        recent_subs = [
            {
                "id": s.id,
                "status": s.status,
                "passed_count": s.passed_count,
                "total_count": s.total_count,
                "execution_time_ms": s.execution_time_ms,
                "hints_used": s.hints_used,
                "created_at": s.created_at.isoformat(),
                "question_number": q.question_number,
                "question_slug": q.slug,
                "question_title": q.title,
                "difficulty": q.difficulty,
            }
            for s, q in sub_rows
        ]

    continue_rows = db.execute(
        select(Question, Category)
        .join(Category, Category.id == Question.category_id)
        .order_by(asc(Question.question_number))
        .limit(15)
    ).all()
    prog_map = {}
    if user:
        prog_map = {p.question_id: p.status for p in db.scalars(select(UserQuestionProgress).where(UserQuestionProgress.user_id == user.id))}
    continue_list = [
        {
            "id": q.id,
            "question_number": q.question_number,
            "slug": q.slug,
            "title": q.title,
            "difficulty": q.difficulty,
            "category_name": c.name,
            "status": prog_map.get(q.id, "Not Started"),
        }
        for q, c in continue_rows
        if prog_map.get(q.id) != "Solved"
    ][:5]

    return {**overview, "recent_submissions": recent_subs, "continue_practising": continue_list}


@router.get("/analytics/activity")
def analytics_activity(days: int = Query(14, ge=7, le=90), user: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    act_map = {}
    if user:
        for row in db.scalars(select(UserActivity).where(UserActivity.user_id == user.id)):
            act_map[row.activity_date] = (row.submissions_count, row.solved_count)

    today = date.today()
    series = []
    for i in range(days - 1, -1, -1):
        d = today - timedelta(days=i)
        subs, solved = act_map.get(d, (0, 0))
        series.append({
            "date": d.isoformat(),
            "label": d.strftime("%b %d").replace(" 0", " "),
            "submissions": subs,
            "solved": solved,
        })
    return {"activity": series}


@router.get("/analytics/categories")
def analytics_categories(user: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    cats = db.scalars(select(Category).order_by(asc(Category.order_index))).all()
    solved_ids = set()
    attempted_ids = set()
    if user:
        for p in db.scalars(select(UserQuestionProgress).where(UserQuestionProgress.user_id == user.id)):
            if p.status == "Solved":
                solved_ids.add(p.question_id)
            elif p.status == "Attempted":
                attempted_ids.add(p.question_id)

    all_qs = db.scalars(select(Question)).all()
    out = []
    for c in cats:
        c_qs = [q for q in all_qs if q.category_id == c.id]
        total = len(c_qs)
        solved = sum(1 for q in c_qs if q.id in solved_ids)
        attempted = sum(1 for q in c_qs if q.id in attempted_ids)
        out.append({
            "id": c.id,
            "slug": c.slug,
            "order_index": c.order_index,
            "name": c.name,
            "total_count": total,
            "solved_count": solved,
            "attempted_count": attempted,
            "completion_pct": round((solved / total) * 100, 1) if total > 0 else 0,
        })
    return {"categories": out}


@router.get("/analytics/detailed")
def analytics_detailed(user: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    overview = _build_overview(db, user)
    cats = db.scalars(select(Category).order_by(asc(Category.order_index))).all()
    all_qs = db.scalars(select(Question)).all()
    q_map = {q.id: q for q in all_qs}
    subs = db.scalars(select(UserSubmission).where(UserSubmission.user_id == user.id)).all() if user else []
    progs = db.scalars(select(UserQuestionProgress).where(UserQuestionProgress.user_id == user.id)).all() if user else []
    solved_ids = {p.question_id for p in progs if p.status == "Solved"}
    attempted_ids = {p.question_id for p in progs if p.status == "Attempted"}

    cat_perf = []
    for c in cats:
        c_qids = {q.id for q in all_qs if q.category_id == c.id}
        c_subs = [s for s in subs if s.question_id in c_qids]
        c_acc = sum(1 for s in c_subs if s.status == "Accepted")
        solved_c = sum(1 for qid in c_qids if qid in solved_ids)
        total_c = len(c_qids)
        cat_perf.append({
            "id": c.id,
            "slug": c.slug,
            "order_index": c.order_index,
            "name": c.name,
            "total_count": total_c,
            "solved_count": solved_c,
            "attempted_count": sum(1 for qid in c_qids if qid in attempted_ids),
            "submissions_count": len(c_subs),
            "accepted_count": c_acc,
            "completion_pct": round((solved_c / total_c) * 100, 1) if total_c > 0 else 0,
            "accuracy_pct": round((c_acc / len(c_subs)) * 100, 1) if c_subs else 0,
        })

    diff_success = []
    for tier in ("Easy", "Medium", "Hard"):
        t_subs = [s for s in subs if s.question_id in q_map and q_map[s.question_id].difficulty == tier]
        t_acc = sum(1 for s in t_subs if s.status == "Accepted")
        diff_success.append({
            "difficulty": tier,
            "solved": overview["difficulty"][tier]["solved"],
            "total": overview["difficulty"][tier]["total"],
            "submissions": len(t_subs),
            "accepted": t_acc,
            "success_rate_pct": round((t_acc / len(t_subs)) * 100, 1) if t_subs else 0,
        })

    hint_rows = db.scalars(select(UserHintUsage).where(UserHintUsage.user_id == user.id)).all() if user else []
    hint_qids = {h.question_id for h in hint_rows}
    mock_rows = db.scalars(select(MockInterview).where(MockInterview.user_id == user.id, MockInterview.status == "completed").order_by(desc(MockInterview.id)).limit(6)).all() if user else []
    revs = _serialize_revisions(db, user.id) if user else []

    return {
        "overview": overview,
        "category_performance": cat_perf,
        "difficulty_success": diff_success,
        "failed_questions": [],
        "hint_stats": {
            "total_hints_revealed": len(hint_rows),
            "questions_with_hints": len(hint_qids),
            "solved_independently": sum(1 for qid in solved_ids if qid not in hint_qids),
            "solved_with_hints": sum(1 for qid in solved_ids if qid in hint_qids),
        },
        "revision_stats": {
            "total_queued": len(revs),
            "due_now": sum(1 for r in revs if r["is_due"] == 1),
            "total_reviews": sum(r["review_count"] for r in revs),
            "forgotten_count": sum(1 for r in revs if r["reason"] == "forgotten"),
            "avg_interval_days": round(sum(r["interval_days"] for r in revs) / len(revs), 1) if revs else 0,
        },
        "weekly_activity": [],
        "mock_interview_stats": {
            "completed_count": len(mock_rows),
            "avg_score_pct": round(sum(m.score_pct for m in mock_rows) / len(mock_rows), 1) if mock_rows else 0,
            "best_score_pct": max((m.score_pct for m in mock_rows), default=0),
            "recent_sessions": [
                {
                    "id": m.id,
                    "difficulty": m.difficulty,
                    "score_pct": m.score_pct,
                    "passed_questions": m.passed_questions,
                    "total_questions": m.total_questions,
                    "completed_at": m.completed_at,
                }
                for m in mock_rows
            ],
        },
    }
