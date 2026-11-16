import platform
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import Base, engine, run_lightweight_migrations
from app.routers import auth, execution, features, progress, questions


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Ensure tables exist cleanly for local SQLite runs
    Base.metadata.create_all(bind=engine)
    run_lightweight_migrations()
    yield


app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(questions.router)
app.include_router(execution.router)
app.include_router(progress.router)
app.include_router(features.router)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "engine": "Pyodide WebAssembly (Browser Worker)",
        "python_runtime": "Pyodide CPython WebAssembly",
    }
