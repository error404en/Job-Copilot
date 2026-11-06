import pytest
import os
import json
from app.api.jobs import (
    get_viewed_jobs,
    mark_job_viewed,
    mark_batch_jobs_viewed,
    unmark_job_viewed,
    BatchViewRequest,
)

def test_viewed_jobs_user_isolation_and_persistence(tmp_path, monkeypatch):
    test_file = str(tmp_path / "test_viewed_jobs.json")
    monkeypatch.setattr("app.api.jobs._VIEWED_JOBS_FILE", test_file)

    user_a = "user_test_alpha_1"
    user_b = "user_test_beta_2"

    # Initially empty for both users
    res_a = get_viewed_jobs(user_id=user_a)
    assert res_a["viewed_job_ids"] == []
    assert res_a["count"] == 0

    res_b = get_viewed_jobs(user_id=user_b)
    assert res_b["viewed_job_ids"] == []
    assert res_b["count"] == 0

    # User A marks job 101 as viewed
    res_mark = mark_job_viewed(job_id="job_101", user_id=user_a)
    assert res_mark["status"] == "ok"
    assert res_mark["is_viewed"] is True

    # User A should now have job 101
    res_a_after = get_viewed_jobs(user_id=user_a)
    assert "job_101" in res_a_after["viewed_job_ids"]
    assert res_a_after["count"] == 1

    # User B must still have 0 (complete user isolation)
    res_b_after = get_viewed_jobs(user_id=user_b)
    assert res_b_after["viewed_job_ids"] == []
    assert res_b_after["count"] == 0

    # User A batch marks jobs
    req = BatchViewRequest(job_ids=["job_102", "job_103", "job_101"])
    res_batch = mark_batch_jobs_viewed(req=req, user_id=user_a)
    assert res_batch["status"] == "ok"
    assert res_batch["viewed_count"] == 3

    # User A unmarks job 102
    res_unmark = unmark_job_viewed(job_id="job_102", user_id=user_a)
    assert res_unmark["status"] == "ok"
    assert res_unmark["is_viewed"] is False

    res_a_final = get_viewed_jobs(user_id=user_a)
    assert sorted(res_a_final["viewed_job_ids"]) == ["job_101", "job_103"]
    assert res_a_final["count"] == 2

    # Verify underlying JSON persistence file is valid
    assert os.path.exists(test_file)
    with open(test_file, "r") as f:
        data = json.load(f)
    assert user_a in data
    assert sorted(data[user_a]) == ["job_101", "job_103"]
