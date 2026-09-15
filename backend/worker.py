import os
import sys
import argparse
import time

# Ensure backend root is in PYTHONPATH
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.scheduler import keep_alive_task, fetch_dream_company_jobs_task, fetch_latest_jobs_task

def run_once():
    print("[Worker] Starting scheduled JobCopilot task execution...")
    print("[Worker] 1. Pinging web service keep-alive...")
    try:
        keep_alive_task()
    except Exception as e:
        print(f"[Worker] Keep-alive ping warning: {e}")

    print("[Worker] 2. Fetching dream company jobs...")
    try:
        fetch_dream_company_jobs_task()
    except Exception as e:
        print(f"[Worker] Dream company fetcher warning: {e}")

    print("[Worker] 3. Fetching ATS subscription jobs...")
    try:
        fetch_latest_jobs_task()
    except Exception as e:
        print(f"[Worker] ATS fetcher warning: {e}")

    print("[Worker] Job execution finished successfully.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="JobCopilot Background & Cron Worker")
    parser.add_argument("--daemon", action="store_true", help="Run continuously in a loop for Background Worker")
    parser.add_argument("--interval", type=int, default=600, help="Interval in seconds for loop mode (default: 600s)")
    args = parser.parse_args()

    if args.daemon:
        print(f"[Worker] Running in daemon mode (loop every {args.interval}s)...")
        while True:
            try:
                run_once()
            except Exception as e:
                print(f"[Worker] Unexpected loop error: {e}")
            print(f"[Worker] Sleeping for {args.interval}s...")
            time.sleep(args.interval)
    else:
        run_once()
