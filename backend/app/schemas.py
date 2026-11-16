from typing import Literal
from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[a-zA-Z0-9_]+$")
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=6, max_length=128)
    target_role: str = Field(default="Python Backend Engineer", max_length=80)


class LoginRequest(BaseModel):
    identifier: str = Field(min_length=1)
    password: str = Field(min_length=1)


class ProfileUpdateRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=80)
    bio: str = Field(default="", max_length=500)
    target_role: str = Field(min_length=2, max_length=80)


class PasswordUpdateRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=6, max_length=128)


class TestCaseResultPayload(BaseModel):
    test_case_id: int
    order_index: int
    description: str = Field(max_length=500)
    is_hidden: bool
    passed: bool
    verdict: Literal["Passed", "Failed", "Runtime Error", "Time Limit Exceeded", "Memory Limit Exceeded"] | None = None
    status: Literal[
        "Accepted",
        "Wrong Answer",
        "Runtime Error",
        "Time Limit Exceeded",
        "Memory Limit Exceeded",
        "Initialization Error",
        "Internal Execution Error",
    ]
    input: str | None = Field(default=None, max_length=65536)
    expected_output: str | None = Field(default=None, max_length=65536)
    actual_output: str | None = Field(default=None, max_length=65536)
    error: str | None = Field(default=None, max_length=65536)
    execution_time_ms: int = Field(ge=0)


class ExecuteSubmitRequest(BaseModel):
    question_id: int | str
    source_code: str = Field(min_length=1, max_length=65536)
    status: Literal[
        "Accepted",
        "Wrong Answer",
        "Runtime Error",
        "Time Limit Exceeded",
        "Memory Limit Exceeded",
        "Initialization Error",
        "Internal Execution Error",
    ]
    passed_count: int = Field(ge=0)
    total_count: int = Field(ge=0)
    execution_time_ms: int = Field(ge=0)
    memory_kb: int = Field(default=16384, ge=0)
    error_output: str = Field(default="", max_length=65536)
    results: list[TestCaseResultPayload] = Field(default_factory=list, max_length=200)
    engine: str | None = Field(default=None, max_length=120)
    hints_used: list[int] = Field(default_factory=list, max_length=3)


class ProgressStatusRequest(BaseModel):
    status: Literal["Not Started", "Attempted", "Solved", "Needs Revision"]


class RevisionUpsertRequest(BaseModel):
    notes: str = Field(default="", max_length=1000)
    priority: Literal["Low", "Medium", "High"] = "Medium"


class RevisionSettingsRequest(BaseModel):
    incorrect_interval_days: int = Field(ge=1, le=60)
    hinted_interval_days: int = Field(ge=1, le=60)
    independent_interval_days: int = Field(ge=1, le=90)
    forgotten_interval_days: int = Field(ge=1, le=30)


class RevisionReviewRequest(BaseModel):
    outcome: Literal["good", "forgot"]


class SavedCodeRequest(BaseModel):
    source_code: str = Field(max_length=65536)


class MockInterviewStartRequest(BaseModel):
    difficulty: Literal["Easy", "Medium", "Hard", "Mixed"] = "Mixed"
    category_slug: str = Field(default="", max_length=120)
    duration_minutes: int = Field(default=30, ge=5, le=120)
    question_count: int = Field(default=3, ge=1, le=5)


class MockInterviewAnswerItem(BaseModel):
    question_id: int
    slug: str
    title: str
    difficulty: str
    source_code: str = Field(max_length=65536)
    status: str
    passed_count: int = Field(ge=0)
    total_count: int = Field(ge=0)
    execution_time_ms: int = Field(ge=0)


class MockInterviewSubmitRequest(BaseModel):
    time_spent_seconds: int = Field(ge=0)
    answers: list[MockInterviewAnswerItem] = Field(default_factory=list)


class NoteCreateRequest(BaseModel):
    target_type: Literal["concept", "question", "interview", "pattern"]
    target_ref: str = Field(default="", max_length=160)
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=12000)
    tags: str = Field(default="", max_length=255)


class InterviewPrepProgressRequest(BaseModel):
    is_reviewed: bool
    confidence: Literal["Low", "Medium", "High"]

