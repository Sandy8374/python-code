# Python Mastery – Browser Pyodide Edition

A LeetCode-style coding platform engineered exclusively for **Python programming**, running **100% free in-browser Python execution via Pyodide (WebAssembly)** inside a dedicated Web Worker — zero Judge0, zero RapidAPI, zero server subprocess execution, and compatible with both local development and static/hosted preview deployments.

## Key Features

- **In-Browser Pyodide WebAssembly Worker**: Initializes Python CPython WASM once per session and reuses it seamlessly across consecutive exercises. Infinite loops are isolated in a Web Worker and automatically terminated after 3.5 seconds without freezing the UI.
- **20 Python Categories · 98 Concepts · 306 Exercises**: Covers Python fundamentals, control flow, strings, collections, functions, comprehensions, modules/packages, exceptions, file handling, OOP, iterators/generators, decorators/context managers, advanced Python, concurrency patterns, `asyncio`, testing/logging, and engineering practices.
- **SQLite Progress & Analytics**: Persists submissions, saved code drafts, bookmarks, revision tracker notes, and daily streaks via JWT-authenticated endpoints.
- **Offline Monaco Editor**: Bundled locally via `monaco-editor` with keyboard shortcuts (`Ctrl+Enter` Run, `Ctrl+Shift+Enter` Submit, `Ctrl+S` Save).

---

## Quick Start (Full-Stack Node + Express + Vite + Pyodide)

```powershell
npm install
npm run dev
```

Open **http://localhost:3000**.

Production build:

```powershell
npm run build
$env:NODE_ENV="production"
npm start
```

*(Static Pyodide WASM assets are bundled into `dist/pyodide/` automatically during `npm run build`.)*

---

## Optional FastAPI Backend Mode

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python seed.py
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In a second terminal:

```powershell
npm install
$env:VITE_FASTAPI_PROXY="true"
npm run dev:vite
```

## Demo Account

- **Email**: `alex@pythonmastery.dev`
- **Password**: `PythonMastery!2026`

## Running Tests

```powershell
# API + SQLite integration tests
npm run test:api

# Pyodide WASM evaluation harness verification
npx tsx tests/pyodide.test.ts
```
