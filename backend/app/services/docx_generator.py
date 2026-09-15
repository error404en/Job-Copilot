"""
docx_generator.py

Builds a clean, ATS-compliant .docx resume in a Harvard/professional style
from a structured JSON resume object. No tables, no text boxes, no columns —
only simple paragraph-based formatting that every ATS parser can read.
"""
import io
from typing import Optional
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement


def _set_font(run, name="Calibri", size=11, bold=False, color: Optional[RGBColor] = None):
    run.font.name = name
    run.font.size = Pt(size)
    run.font.bold = bold
    if color:
        run.font.color.rgb = color


def _add_section_heading(doc: Document, title: str):
    """Adds a section header with a bottom border rule (no text box needed)."""
    para = doc.add_paragraph()
    para.paragraph_format.space_before = Pt(8)
    para.paragraph_format.space_after = Pt(2)
    run = para.add_run(title.upper())
    _set_font(run, name="Calibri", size=11, bold=True, color=RGBColor(0x1A, 0x56, 0x8C))

    # Add bottom border to the paragraph
    pPr = para._p.get_or_add_pPr()
    pBdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "6")
    bottom.set(qn("w:space"), "1")
    bottom.set(qn("w:color"), "1A568C")
    pBdr.append(bottom)
    pPr.append(pBdr)
    return para


def _add_bullet(doc: Document, text: str):
    para = doc.add_paragraph(style="List Bullet")
    para.paragraph_format.space_before = Pt(0)
    para.paragraph_format.space_after = Pt(1)
    run = para.add_run(text)
    _set_font(run, size=10)
    return para


def generate_docx_from_structured_resume(resume_data: dict) -> bytes:
    """
    Takes a structured resume dict and generates an ATS-compliant .docx.

    Expected schema:
    {
      "name": str,
      "email": str,
      "phone": str,
      "linkedin": str,
      "github": str,
      "summary": str,
      "experience": [
        {
          "company": str,
          "title": str,
          "location": str,
          "dates": str,
          "bullets": [str, ...]
        }
      ],
      "projects": [
        {
          "name": str,
          "tech": str,
          "bullets": [str, ...]
        }
      ],
      "education": [
        {
          "institution": str,
          "degree": str,
          "dates": str,
          "gpa": str (optional)
        }
      ],
      "skills": {
        "languages": str,
        "frameworks": str,
        "tools": str,
        "databases": str
      }
    }
    """
    doc = Document()

    # ── Page margins (0.75in each side, common for tech resumes)
    for section in doc.sections:
        section.top_margin = Inches(0.65)
        section.bottom_margin = Inches(0.65)
        section.left_margin = Inches(0.75)
        section.right_margin = Inches(0.75)

    # ── Name (large, bold, centered)
    name_para = doc.add_paragraph()
    name_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    name_para.paragraph_format.space_after = Pt(2)
    name_run = name_para.add_run(resume_data.get("name", ""))
    _set_font(name_run, name="Calibri", size=18, bold=True)

    # ── Contact line (centered)
    contact_parts = []
    if resume_data.get("phone"): contact_parts.append(resume_data["phone"])
    if resume_data.get("email"): contact_parts.append(resume_data["email"])
    if resume_data.get("linkedin"): contact_parts.append(resume_data["linkedin"])
    if resume_data.get("github"): contact_parts.append(resume_data["github"])

    contact_para = doc.add_paragraph()
    contact_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    contact_para.paragraph_format.space_after = Pt(4)
    contact_run = contact_para.add_run("  |  ".join(contact_parts))
    _set_font(contact_run, size=9.5, color=RGBColor(0x44, 0x44, 0x44))

    # ── Summary (optional)
    if resume_data.get("summary"):
        _add_section_heading(doc, "Summary")
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(2)
        r = p.add_run(resume_data["summary"])
        _set_font(r, size=10)

    # ── Experience
    experience = resume_data.get("experience", [])
    if experience:
        _add_section_heading(doc, "Experience")
        for job in experience:
            # Company + dates on same line (left/right aligned via tab)
            role_para = doc.add_paragraph()
            role_para.paragraph_format.space_before = Pt(4)
            role_para.paragraph_format.space_after = Pt(0)
            title_run = role_para.add_run(f"{job.get('title', '')}  —  {job.get('company', '')}")
            _set_font(title_run, size=10.5, bold=True)

            # Location + dates (smaller, grey)
            meta_para = doc.add_paragraph()
            meta_para.paragraph_format.space_before = Pt(0)
            meta_para.paragraph_format.space_after = Pt(2)
            meta_text = f"{job.get('location', '')}  |  {job.get('dates', '')}"
            meta_run = meta_para.add_run(meta_text)
            _set_font(meta_run, size=9.5, color=RGBColor(0x55, 0x55, 0x55))

            for bullet in job.get("bullets", []):
                _add_bullet(doc, bullet)

    # ── Projects
    projects = resume_data.get("projects", [])
    if projects:
        _add_section_heading(doc, "Projects")
        for proj in projects:
            proj_para = doc.add_paragraph()
            proj_para.paragraph_format.space_before = Pt(4)
            proj_para.paragraph_format.space_after = Pt(1)
            proj_name_run = proj_para.add_run(proj.get("name", ""))
            _set_font(proj_name_run, size=10.5, bold=True)
            if proj.get("tech"):
                tech_run = proj_para.add_run(f"  |  {proj['tech']}")
                _set_font(tech_run, size=9.5, color=RGBColor(0x55, 0x55, 0x55))
            for bullet in proj.get("bullets", []):
                _add_bullet(doc, bullet)

    # ── Education
    education = resume_data.get("education", [])
    if education:
        _add_section_heading(doc, "Education")
        for edu in education:
            edu_para = doc.add_paragraph()
            edu_para.paragraph_format.space_before = Pt(4)
            edu_para.paragraph_format.space_after = Pt(1)
            deg_run = edu_para.add_run(f"{edu.get('degree', '')}  —  {edu.get('institution', '')}")
            _set_font(deg_run, size=10.5, bold=True)
            edu_meta = doc.add_paragraph()
            edu_meta.paragraph_format.space_before = Pt(0)
            edu_meta.paragraph_format.space_after = Pt(2)
            meta_str = edu.get("dates", "")
            if edu.get("gpa"):
                meta_str += f"  |  GPA: {edu['gpa']}"
            meta_run = edu_meta.add_run(meta_str)
            _set_font(meta_run, size=9.5, color=RGBColor(0x55, 0x55, 0x55))

    # ── Technical Skills
    skills = resume_data.get("skills", {})
    if skills:
        _add_section_heading(doc, "Technical Skills")
        skill_lines = []
        if skills.get("languages"):   skill_lines.append(("Languages", skills["languages"]))
        if skills.get("frameworks"):  skill_lines.append(("Frameworks", skills["frameworks"]))
        if skills.get("tools"):       skill_lines.append(("Tools", skills["tools"]))
        if skills.get("databases"):   skill_lines.append(("Databases", skills["databases"]))
        for label, value in skill_lines:
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(1)
            p.paragraph_format.space_after = Pt(1)
            label_run = p.add_run(f"{label}: ")
            _set_font(label_run, size=10, bold=True)
            val_run = p.add_run(value)
            _set_font(val_run, size=10)

    # ── Save to bytes buffer
    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf.read()
