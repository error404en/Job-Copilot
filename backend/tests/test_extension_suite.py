import json
import zipfile
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest
from app.api.auto_apply import extract_candidate_extended_meta, QuestionItem, SolveQuestionsRequest

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
EXTENSION_DIR = ROOT_DIR / "extension"
ZIP_PATH = ROOT_DIR / "frontend" / "public" / "JobCopilot_Extension.zip"


def test_manifest_compliance():
    """Validates that manifest.json conforms strictly to Manifest V3 requirements."""
    manifest_file = EXTENSION_DIR / "manifest.json"
    assert manifest_file.exists(), "extension/manifest.json must exist"

    with open(manifest_file, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    assert manifest.get("manifest_version") == 3
    assert "activeTab" in manifest.get("permissions", [])
    assert "scripting" in manifest.get("permissions", [])
    assert "tabs" in manifest.get("permissions", [])
    assert "cookies" in manifest.get("permissions", [])
    assert manifest.get("action", {}).get("default_popup") == "popup.html"
    assert manifest.get("background", {}).get("service_worker") == "background.js"

    # Verify content scripts matches
    content_scripts = manifest.get("content_scripts", [])
    assert len(content_scripts) >= 2
    auto_apply_cs = next((cs for cs in content_scripts if "content-scripts/auto_apply.js" in cs.get("js", [])), None)
    assert auto_apply_cs is not None
    matches = auto_apply_cs.get("matches", [])
    assert any("greenhouse" in m for m in matches)
    assert any("lever" in m for m in matches)
    assert any("ashbyhq" in m for m in matches)
    assert any("workday" in m for m in matches)


def test_popup_html_structure_and_typography():
    """Validates that popup.html has required typography and all DOM IDs needed by popup.js."""
    popup_file = EXTENSION_DIR / "popup.html"
    assert popup_file.exists()

    with open(popup_file, "r", encoding="utf-8") as f:
        html = f.read()

    # Typography & Styles
    assert "Instrument+Serif" in html, "Instrument Serif font must be imported in popup.html"
    assert "Inter" in html, "Inter font must be imported in popup.html"
    assert "JetBrains+Mono" in html, "JetBrains Mono font must be imported in popup.html"
    assert "serif" in html
    assert "glass" in html

    # Essential DOM Element IDs used by popup.js
    required_ids = [
        "autofillBtn",
        "aiSolveBtn",
        "analyzeBtn",
        "dashboardBtn",
        "status",
        "resumePill",
        "resumeTitle",
        "error",
    ]
    for element_id in required_ids:
        assert f'id="{element_id}"' in html, f'popup.html must contain id="{element_id}"'

    # Scripts
    assert '<script src="auth_helper.js"></script>' in html
    assert '<script src="popup.js"></script>' in html


def test_content_scripts_integrity():
    """Validates that content scripts define the HUD widget and capture button."""
    auto_apply_file = EXTENSION_DIR / "content-scripts" / "auto_apply.js"
    assert auto_apply_file.exists()
    with open(auto_apply_file, "r", encoding="utf-8") as f:
        js = f.read()
    assert "jobcopilot-autofill-hud" in js
    assert "jobcopilot-hud-status" in js
    assert "executeAutoFill" in js
    assert "solveCustomQuestionsWithAI" in js

    capture_file = EXTENSION_DIR / "content-scripts" / "capture.js"
    assert capture_file.exists()
    with open(capture_file, "r", encoding="utf-8") as f:
        capture_js = f.read()
    assert "jobcopilot-capture-btn" in capture_js
    assert "parseJobBackground" in capture_js or "fetchBackend" in capture_js


def test_candidate_extended_meta_extraction():
    """Validates deep ATS candidate metadata extraction."""
    raw_resume = """
    Jaypee Institute of Information Technology (JIIT), Noida
    B.Tech in Computer Science & Engineering, 2023 - 2027
    CGPA: 8.5/10.0
    Software Engineering Intern at Northwind Labs
    Full stack and backend engineering with Python, FastAPI, and Next.js
    """
    profile = {
        "pay_floor_ncr_remote": 1400000,
        "base_location": "Noida, Delhi NCR",
    }
    meta = extract_candidate_extended_meta(raw_resume, profile)

    assert meta["school"] is not None
    assert meta["degree"] is not None
    assert meta["grad_year"] == "2027"
    assert meta["gpa"] == "8.5"
    assert "1400000" in meta["expected_salary"] or "14,00,000" in meta["expected_salary"]
    assert meta["authorized_to_work"] == "Yes"
    assert meta["requires_sponsorship"] == "No"


def test_zip_package_integrity():
    """Validates that the downloadable JobCopilot_Extension.zip is complete and valid."""
    assert ZIP_PATH.exists(), "frontend/public/JobCopilot_Extension.zip must exist"
    with zipfile.ZipFile(ZIP_PATH, "r") as z:
        names = z.namelist()
        assert any("manifest.json" in n for n in names)
        assert any("popup.html" in n for n in names)
        assert any("popup.js" in n for n in names)
        assert any("auth_helper.js" in n for n in names)
        assert any("background.js" in n for n in names)
        assert any("auto_apply.js" in n for n in names)
        assert any("capture.js" in n for n in names)
