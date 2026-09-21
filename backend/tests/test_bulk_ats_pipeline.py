import logging
from unittest.mock import MagicMock, patch

from app.api.jobs import FetchAtsRequest, fetch_and_analyze_ats


def _run_enqueued_task(background_tasks):
    task = background_tasks.add_task.call_args.args[0]
    args = background_tasks.add_task.call_args.args[1:]
    kwargs = background_tasks.add_task.call_args.kwargs
    task(*args, **kwargs)


def _greenhouse_job():
    return {
        "raw_jd": "Backend Engineer\nLocation: Remote\nPython and APIs.",
        "source_type": "greenhouse",
        "source_confidence": 1.0,
        "url": "https://boards.greenhouse.io/acme/jobs/123",
        "official_apply_url": "https://boards.greenhouse.io/acme/jobs/123",
        "external_job_id": "123",
        "company": "acme",
    }


def test_bulk_ats_uses_v2_pipeline_with_full_provenance_and_user_isolation():
    background_tasks = MagicMock()
    req = FetchAtsRequest(company_tokens=["acme"], system="greenhouse")

    with patch("app.api.jobs.fetch_greenhouse_jobs", return_value=[_greenhouse_job()]), patch(
        "app.api.jobs.process_and_store_job", return_value={"job_id": "job-1", "is_duplicate": False}
    ) as process_job:
        response = fetch_and_analyze_ats(req, background_tasks, user_id="user-a")
        _run_enqueued_task(background_tasks)

    assert response["message"] == "Started processing jobs for 1 companies in the background."
    process_job.assert_called_once()
    parse_request, user_id = process_job.call_args.args[:2]
    assert user_id == "user-a"
    assert parse_request.source == "ats_bulk"
    assert parse_request.source_type == "greenhouse"
    assert parse_request.source_confidence == 1.0
    assert parse_request.url == "https://boards.greenhouse.io/acme/jobs/123"
    assert parse_request.official_apply_url == "https://boards.greenhouse.io/acme/jobs/123"
    assert parse_request.external_job_id == "123"
    assert parse_request.company_name == "acme"
    assert process_job.call_args.kwargs["skip_analysis"] is True


def test_bulk_ats_preserves_duplicate_result_for_v2_stable_deduplication():
    background_tasks = MagicMock()
    req = FetchAtsRequest(company_tokens=["acme"], system="greenhouse")

    with patch("app.api.jobs.fetch_greenhouse_jobs", return_value=[_greenhouse_job()]), patch(
        "app.api.jobs.process_and_store_job", return_value={"job_id": "existing-job", "is_duplicate": True}
    ) as process_job:
        fetch_and_analyze_ats(req, background_tasks, user_id="user-a")
        _run_enqueued_task(background_tasks)

    parse_request, user_id = process_job.call_args.args[:2]
    assert user_id == "user-a"
    assert parse_request.source_type == "greenhouse"
    assert parse_request.company_name == "acme"
    assert parse_request.external_job_id == "123"


def test_bulk_ats_logs_pipeline_failure_without_stopping_other_jobs(caplog):
    background_tasks = MagicMock()
    req = FetchAtsRequest(company_tokens=["acme"], system="greenhouse")

    with patch("app.api.jobs.fetch_greenhouse_jobs", return_value=[_greenhouse_job()]), patch(
        "app.api.jobs.process_and_store_job", side_effect=RuntimeError("database unavailable")
    ):
        with caplog.at_level(logging.ERROR, logger="app.api.jobs"):
            fetch_and_analyze_ats(req, background_tasks, user_id="user-a")
            _run_enqueued_task(background_tasks)

    assert "Bulk ATS V2 ingestion failed" in caplog.text
