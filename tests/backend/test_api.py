import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from backend.main import app

client = TestClient(app)

FIXTURE_GLB = Path("tests/pipeline/fixtures/two_box_assembly.glb")


def test_health_check():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_create_job_returns_job_id():
    if not FIXTURE_GLB.exists():
        pytest.skip("Run create_test_assembly.py first")

    with open(FIXTURE_GLB, "rb") as f:
        resp = client.post(
            "/jobs",
            files={"file": ("assembly.glb", f, "application/octet-stream")},
            data={"explode_scalar": "1.5", "style_prompt": "Matte black industrial, dark studio"},
        )
    assert resp.status_code == 202
    body = resp.json()
    assert "job_id" in body
    assert len(body["job_id"]) > 0


def test_get_job_status():
    if not FIXTURE_GLB.exists():
        pytest.skip("Run create_test_assembly.py first")

    with open(FIXTURE_GLB, "rb") as f:
        create_resp = client.post(
            "/jobs",
            files={"file": ("assembly.glb", f, "application/octet-stream")},
            data={"explode_scalar": "1.5", "style_prompt": "Matte black industrial, dark studio"},
        )
    job_id = create_resp.json()["job_id"]

    status_resp = client.get(f"/jobs/{job_id}")
    assert status_resp.status_code == 200
    body = status_resp.json()
    assert body["job_id"] == job_id
    assert body["status"] in {"queued", "running", "done", "error"}


def test_get_unknown_job_returns_404():
    resp = client.get("/jobs/nonexistent-job-id")
    assert resp.status_code == 404
