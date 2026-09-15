import os
import sys

# Add backend directory to sys.path
backend_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
if os.path.isdir(backend_path):
    sys.path.insert(0, backend_path)

if __name__ == "__main__":
    import runpy
    worker_script = os.path.join(backend_path, "worker.py")
    runpy.run_path(worker_script, run_name="__main__")
