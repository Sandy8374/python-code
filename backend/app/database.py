from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from app.config import settings

is_sqlite = settings.database_url.startswith("sqlite")
connect_args = {"check_same_thread": False} if is_sqlite else {}

engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    pool_pre_ping=not is_sqlite,
    future=True,
)

if is_sqlite:
    @event.listens_for(engine, "connect")
    def _enable_sqlite_fk(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)


class Base(DeclarativeBase):
    pass


def run_lightweight_migrations():
    if not is_sqlite:
        return
    with engine.begin() as conn:
        sub_cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(user_submissions)").fetchall()}
        if sub_cols:
            if "hints_used" not in sub_cols:
                conn.exec_driver_sql("ALTER TABLE user_submissions ADD COLUMN hints_used INTEGER NOT NULL DEFAULT 0")
            if "hints_used_json" not in sub_cols:
                conn.exec_driver_sql("ALTER TABLE user_submissions ADD COLUMN hints_used_json TEXT NOT NULL DEFAULT '[]'")
        rev_cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(user_revisions)").fetchall()}
        if rev_cols:
            if "interval_days" not in rev_cols:
                conn.exec_driver_sql("ALTER TABLE user_revisions ADD COLUMN interval_days INTEGER NOT NULL DEFAULT 3")
            if "next_review_at" not in rev_cols:
                conn.exec_driver_sql("ALTER TABLE user_revisions ADD COLUMN next_review_at TEXT")
            if "last_reviewed_at" not in rev_cols:
                conn.exec_driver_sql("ALTER TABLE user_revisions ADD COLUMN last_reviewed_at TEXT")
            if "review_count" not in rev_cols:
                conn.exec_driver_sql("ALTER TABLE user_revisions ADD COLUMN review_count INTEGER NOT NULL DEFAULT 0")
            if "reason" not in rev_cols:
                conn.exec_driver_sql("ALTER TABLE user_revisions ADD COLUMN reason TEXT NOT NULL DEFAULT 'manual'")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

