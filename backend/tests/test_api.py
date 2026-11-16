from fastapi.testclient import TestClient
from app.main import app
from seed import seed_database

seed_database()
client = TestClient(app)


def test_health_endpoint_pyodide():
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert "Pyodide" in body["engine"]


def test_eval_tests_endpoint():
    res = client.get("/api/questions/swap-two-variables-tuple-unpacking/eval-tests")
    assert res.status_code == 200
    body = res.json()
    assert len(body["test_cases"]) >= 3


def test_unauthenticated_submit_rejected():
    res = client.post(
        "/api/execute/submit",
        json={
            "question_id": "swap-two-variables-tuple-unpacking",
            "source_code": "def swap_values(a, b): return [b, a]",
            "status": "Accepted",
            "passed_count": 4,
            "total_count": 4,
            "execution_time_ms": 10,
            "results": [],
        },
    )
    assert res.status_code == 401
