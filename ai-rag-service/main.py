import json
import os
import platform
import re
import urllib.parse
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple
from pathlib import Path

import motor.motor_asyncio
import requests
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from groq import AsyncGroq
import asyncio
from pydantic import BaseModel

load_dotenv()


_HTML_TAG_PATTERN = re.compile(r"</?[a-zA-Z][a-zA-Z0-9]*(?:\s+[^<>]*?)?/?>")


def strip_stray_html_tags(text: str) -> str:
    """Remove stray HTML tags (e.g. <br>, <br/>, <table>, <li>, <b>) that an LLM
    can leak into an otherwise-Markdown reply. The chat UI renders Markdown, not
    HTML, so any raw tag that slips through shows up as literal text like "<br>"
    in the response. This converts the common ones to their Markdown/plain-text
    equivalent and strips anything else that still looks like a tag."""
    if not text:
        return text

    # Line-break tags (including HTML-escaped forms) become real newlines
    text = re.sub(r"(?i)(&lt;|<)\s*br\s*/?\s*(&gt;|>)", "\n", text)

    # List-item tags become Markdown bullets
    text = re.sub(r"(?i)<li[^>]*>\s*", "- ", text)

    # Bold/italic tags become Markdown emphasis
    text = re.sub(r"(?i)</?(b|strong)>", "**", text)
    text = re.sub(r"(?i)</?(i|em)>", "*", text)

    # Paragraph/div/table/etc. block tags: drop the tag, keep the inner text,
    # and add a line break so content doesn't run together
    text = re.sub(r"(?i)</(p|div|tr|table)>", "\n", text)

    # Anything else that still looks like a tag (e.g. <span>, <td>, <h2>) is stripped
    text = _HTML_TAG_PATTERN.sub("", text)

    # Collapse blank lines left behind by removed block tags
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


def sanitize_markdown_urls(text: str) -> str:
    if not text:
        return text

    text = strip_stray_html_tags(text)

    text = re.sub(r"\[+", "[", text)

    while True:
        previous_text = text
        text = re.sub(r"\]\(https?://[^\)]+(?=\]\()", "", text)
        text = re.sub(r"\]\(https?://[^\)]+\)(?=\]\()", "", text)
        if text == previous_text:
            break

    nested_pattern = r"\[+([^\[\]]*(?:https?://[^\s\[\]]+)[^\[\]]*)\]+\(+([^)]+)\)+"

    def fix_nested(match):
        candidate_text = match.group(1)
        candidate_url = match.group(2)

        url = None
        if candidate_url and candidate_url.startswith("http"):
            url = candidate_url
        elif "http" in candidate_text:
            url_match = re.search(r"https?://[^\s\[\]]+", candidate_text)
            if url_match:
                url = url_match.group(0)

        link_text = candidate_text
        if url and url in link_text:
            link_text = re.sub(r"https?://[^\s\[\]]+", "", candidate_text).strip()

        if not link_text or link_text == url:
            try:
                link_text = url.split("/")[2] if url else "Link"
            except Exception:
                link_text = "Link"

        if url:
            return f"[{link_text}]({url})"
        return match.group(0)

    for _ in range(3):
        text = re.sub(nested_pattern, fix_nested, text)

    url_as_text_pattern = r"\[(https?://[^\]]+)\]\(\1\)"

    def fix_url_as_text(match):
        url = match.group(1)

        try:
            domain = url.split("/")[2]
            return f"[{domain}]({url})"
        except Exception:
            return f"[Visit Link]({url})"

    text = re.sub(url_as_text_pattern, fix_url_as_text, text)

    markdown_link_pattern = r"\[([^\]]+)\]\(([^)]+)\)"

    def clean_url(match):
        link_text = match.group(1)
        url = match.group(2)

        try:
            if "%" in url:
                if "%F0%9D" in url or "%2D" in url:
                    try:
                        decoded = urllib.parse.unquote(url)
                        if any(ord(c) > 127 for c in decoded):
                            url = urllib.parse.quote(
                                decoded.encode("utf-8"), safe=":/?#[]@!$&'()*+,;="
                            )
                    except Exception:
                        pass
        except Exception:
            pass

        url = re.sub(r'[`\'"]*$', "", url)

        if url and not url.startswith(("http://", "https://", "mailto:")):
            if "." in url and "/" in url[10:]:
                if not url.startswith("/"):
                    url = "https://" + url

        return f"[{link_text}]({url})"

    cleaned_text = re.sub(markdown_link_pattern, clean_url, text)

    return cleaned_text


app = FastAPI(title="Glinax RAG+CAG Service", version="2.0.0")

import jwt
from fastapi import Depends, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGOS = ["HS256"]
auth_scheme = HTTPBearer(auto_error=False)


def get_current_user(creds: HTTPAuthorizationCredentials = Depends(auth_scheme)):
    if not creds or not creds.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authorization"
        )
    token = creds.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=JWT_ALGOS)
        user_id = payload.get("sub")
        if not user_id or not isinstance(user_id, str):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject"
            )
        return {"user_id": user_id, "claims": payload}
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        )


def resolve_user_id(token_user: Optional[str], fallback_user: Optional[str]) -> str:
    return token_user or (fallback_user or "")


_raw_origins = os.getenv(
    "ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:5000"
)
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization", "x-user-id"],
)
embedding_model = None
groq_client = None
db_client = None
ghana_universities_data = []

GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
GROQ_REASONING_EFFORT = os.getenv("GROQ_REASONING_EFFORT", "medium")
GROQ_TEMPERATURE = float(os.getenv("GROQ_TEMPERATURE", "0.6"))

TESSERACT_ENV_PATH = os.getenv("TESSERACT_CMD")
WINDOWS_TESSERACT_CANDIDATES = [
    r"C:\\Program Files\\Tesseract-OCR\\tesseract.exe",
    r"C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe",
]


def configure_tesseract_path_if_needed(pytesseract_module) -> None:
    if not pytesseract_module:
        return

    if getattr(pytesseract_module, "pytesseract", None):
        pytesseract_module = pytesseract_module.pytesseract

    if getattr(pytesseract_module, "tesseract_cmd", None):
        return

    if TESSERACT_ENV_PATH and os.path.exists(TESSERACT_ENV_PATH):
        pytesseract_module.tesseract_cmd = TESSERACT_ENV_PATH
        print(f"🔧 Tesseract path set from TESSERACT_CMD env: {TESSERACT_ENV_PATH}")
        return

    if platform.system().lower() == "windows":
        for candidate in WINDOWS_TESSERACT_CANDIDATES:
            if os.path.exists(candidate):
                pytesseract_module.tesseract_cmd = candidate
                print(f"🔧 Tesseract path auto-configured: {candidate}")
                return


class ChatRequest(BaseModel):
    message: str
    conversation_id: str
    user_id: Optional[str] = None
    university_name: Optional[str] = None
    user_context: Optional[Dict[str, Any]] = None
    chat_history: Optional[List[Dict[str, str]]] = None


class ChatResponse(BaseModel):
    model_config = {"protected_namespaces": ()}

    success: bool
    reply: str
    sources: List[Dict[str, Any]] = []
    confidence: float = 0.0
    timestamp: str
    processing_time: Optional[float] = None
    model_used: str = "hybrid-rag"


# ============================================================================
# COMPLETE GHANA UNIVERSITIES KNOWLEDGE BASE
# ============================================================================

GHANA_UNIVERSITIES_KNOWLEDGE = {
    # ========================================================================
    # KWAME NKRUMAH UNIVERSITY OF SCIENCE AND TECHNOLOGY (KNUST)
    # ========================================================================
    "Kwame Nkrumah University of Science and Technology": {
        "location": "Kumasi, Ashanti Region",
        "established": "1952",
        "website": "www.knust.edu.gh",
        "type": "Public",
        "overview": "KNUST is Ghana's premier science and technology university, offering over 100 undergraduate programmes across 6 colleges.",
        "admission_requirements": {
            "general": "WASSCE: Credit passes (A1-C6) in 6 subjects (3 Core + 3 Electives). Aggregate 24 or better for regular admission. Fee-Paying/Parallel up to 30-36 depending on programme. D7, E8, F9 are NOT accepted for any programme.",
            "wassce": "Credit passes A1-C6 in English, Core Maths, Integrated Science/Social Studies + 3 relevant electives",
            "sssce": "Credit passes A-D in English, Core Maths, Integrated Science/Social Studies + 3 relevant electives",
            "aggregate_calculation": "Science disciplines: English + Core Maths + Integrated Science + 3 Science Electives (Social Studies excluded). Non-Science disciplines: English + Core Maths + Social Studies + 3 Electives (Integrated Science excluded).",
            "gce": "5 'O' Level credits + 3 'A' Level passes in relevant subjects",
            "ib": "Grade 4+ in 3 HL subjects",
            "mature": "25+ years old, 2-3 years work experience, entrance exam/interview",
            "how_to_apply": "1) Purchase an E-Voucher by dialling *415*55# (Mobile Money) or online via Visa/Mastercard. 2) Register at the admissions portal with a valid email and validate the voucher. 3) Upload your birth certificate, Ghana Card/Passport, and academic results. 4) Submit before the deadline.",
            "international_applicants": "Select the 'International' application mode - no e-voucher needed via mobile; purchase online instead and provide certified transcripts.",
            "campuses": "Main Campus (Kumasi) and Obuasi Campus (selected programmes)",
            "application_deadline": "August 31, 2026 (may extend for candidates awaiting results)",
            "online_portal": "https://apps.knust.edu.gh/admissions/",
            "application_fee": "GH¢ 220 (via *415*55#)",
            "entrance_exam": "Required for Medicine, Dentistry, and some competitive programmes"
        },
        "contact": {
            "phone": "+233-32-206-0331",
            "email": "admissions@knust.edu.gh",
            "address": "Private Mail Bag, Kumasi, Ghana",
            "admissions_portal": "https://apps.knust.edu.gh/admissions/",
            "e_voucher_dial_code": "*415*55#",
            "school_of_business_website": "https://ksb.knust.edu.gh"
        },
        "colleges": {
            "Engineering": {
                "cutoff_range": "10-20",
                "requirements": "Core: English, Core Maths, Integrated Science (all A1-C6). Electives: Elective Mathematics + Physics + Chemistry (all A1-C6). Social Studies is excluded from the aggregate calculation.",
                "programs": [
                    {"name": "BSc Civil Engineering", "school": "Civil & Geo-Engineering", "cutoff": "10-14", "campuses": "Main/Obuasi"},
                    {"name": "BSc Geological Engineering", "school": "Civil & Geo-Engineering", "cutoff": "10-16", "campuses": "Main/Obuasi"},
                    {"name": "BSc Geomatic Engineering", "school": "Civil & Geo-Engineering", "cutoff": "12-18", "campuses": "Main/Obuasi"},
                    {"name": "BSc Petroleum Engineering", "school": "Civil & Geo-Engineering", "cutoff": "10-16", "campuses": "Main"},
                    {"name": "BSc Electrical/Electronic Engineering", "school": "Electrical & Computer Engineering", "cutoff": "10-14", "campuses": "Main/Obuasi"},
                    {"name": "BSc Computer Engineering", "school": "Electrical & Computer Engineering", "cutoff": "10-14", "campuses": "Main"},
                    {"name": "BSc Biomedical Engineering", "school": "Electrical & Computer Engineering", "cutoff": "10-14", "campuses": "Main"},
                    {"name": "BSc Telecommunications Engineering", "school": "Electrical & Computer Engineering", "cutoff": "12-16", "campuses": "Main"},
                    {"name": "BSc Mechanical Engineering", "school": "Mechanical & Related Engineering", "cutoff": "10-16", "campuses": "Main/Obuasi"},
                    {"name": "BSc Aerospace Engineering", "school": "Mechanical & Related Engineering", "cutoff": "10-16", "campuses": "Main"},
                    {"name": "BSc Chemical Engineering", "school": "Mechanical & Related Engineering", "cutoff": "10-16", "campuses": "Main"},
                    {"name": "BSc Petrochemical Engineering", "school": "Mechanical & Related Engineering", "cutoff": "12-18", "campuses": "Main"},
                    {"name": "BSc Automobile Engineering", "school": "Mechanical & Related Engineering", "cutoff": "12-18", "campuses": "Main"},
                    {"name": "BSc Industrial Engineering", "school": "Mechanical & Related Engineering", "cutoff": "12-18", "campuses": "Main"},
                    {"name": "BSc Marine Engineering", "school": "Mechanical & Related Engineering", "cutoff": "14-20", "campuses": "Main"},
                    {"name": "BSc Agricultural Engineering", "school": "Mechanical & Related Engineering", "cutoff": "14-20", "campuses": "Main"},
                    {"name": "BSc Materials Engineering", "school": "Materials Engineering", "cutoff": "14-20", "campuses": "Main/Obuasi"},
                    {"name": "BSc Metallurgical Engineering", "school": "Materials Engineering", "cutoff": "14-20", "campuses": "Main/Obuasi"}
                ]
            },
            "Health Sciences": {
                "cutoff_range": "6-22",
                "requirements": "Biology, Chemistry + Physics/Elective Maths. Medicine and Dentistry require a mandatory entrance examination and interview.",
                "programs": [
                    {"name": "MBChB (Medicine & Surgery)", "school": "School of Medicine", "duration": "6 years", "cutoff": "6-10", "entrance_exam": "Yes (plus interview)", "first_choice": "Yes", "notes": "Grade Point of 3.25+ noted for competitive entry"},
                    {"name": "BDS (Dental Surgery)", "school": "School of Dentistry", "duration": "6 years", "cutoff": "8-12", "entrance_exam": "Yes (plus interview)", "first_choice": "Yes"},
                    {"name": "PharmD (Doctor of Pharmacy)", "school": "School of Pharmacy", "duration": "6 years", "cutoff": "8-14", "first_choice": "Yes"},
                    {"name": "BSc Nursing", "school": "School of Nursing and Midwifery", "duration": "4 years", "cutoff": "14-20", "requirements": "Science and Non-Science backgrounds accepted"},
                    {"name": "BSc Midwifery", "school": "School of Nursing and Midwifery", "duration": "4 years", "cutoff": "14-20", "requirements": "Science and Non-Science backgrounds accepted"},
                    {"name": "BSc Emergency Nursing (Top-Up)", "school": "School of Nursing and Midwifery", "duration": "2 years", "requirements": "Diploma + NMC registration + national clinical rotation"},
                    {"name": "BSc Medical Laboratory Technology", "school": "Faculty of Allied Health Sciences", "duration": "4 years", "cutoff": "12-16"},
                    {"name": "BSc Physiotherapy & Sports Science", "school": "Faculty of Allied Health Sciences", "duration": "4 years", "cutoff": "12-16"},
                    {"name": "BSc Optometry", "school": "Faculty of Allied Health Sciences", "duration": "4 years", "cutoff": "10-14"},
                    {"name": "BSc Sonography", "school": "Faculty of Allied Health Sciences", "duration": "4 years", "cutoff": "14-18"},
                    {"name": "BSc Disability & Rehabilitation Studies", "school": "Faculty of Allied Health Sciences", "duration": "4 years", "cutoff": "16-22"},
                    {"name": "BSc Herbal Medicine", "school": "Faculty of Allied Health Sciences", "duration": "4 years", "cutoff": "14-20"}
                ]
            },
            "Humanities and Social Sciences": {
                "cutoff_range": "6-24",
                "programs": [
                    {"name": "BSc Business Administration - Accounting", "school": "KNUST School of Business (KSB)", "cutoff": "14-20", "backgrounds": "Business, Arts, Science"},
                    {"name": "BSc Business Administration - Banking & Finance", "school": "KNUST School of Business (KSB)", "cutoff": "14-20", "backgrounds": "Business, Arts, Science"},
                    {"name": "BSc Business Administration - Marketing", "school": "KNUST School of Business (KSB)", "cutoff": "14-20", "backgrounds": "Business, Arts, Science, Vocational"},
                    {"name": "BSc Business Administration - International Business", "school": "KNUST School of Business (KSB)", "cutoff": "14-20", "backgrounds": "Business, Arts, Science, Vocational"},
                    {"name": "BSc Business Administration - Human Resource Management", "school": "KNUST School of Business (KSB)", "cutoff": "14-20", "backgrounds": "Business, Arts, Science, Vocational"},
                    {"name": "BSc Business Administration - Management", "school": "KNUST School of Business (KSB)", "cutoff": "14-20", "backgrounds": "Business, Arts, Science, Vocational"},
                    {"name": "BSc Business Administration - Logistics & Supply Chain", "school": "KNUST School of Business (KSB)", "cutoff": "14-20", "backgrounds": "Business, Arts, Science"},
                    {"name": "BSc Business Administration - Business IT", "school": "KNUST School of Business (KSB)", "cutoff": "14-20", "backgrounds": "Business, Arts, Science"},
                    {"name": "BSc Hospitality & Tourism Management", "school": "KNUST School of Business (KSB)", "cutoff": "16-22"},
                    {"name": "LLB (4-year Full-Time)", "school": "Faculty of Law", "duration": "4 years", "cutoff": "6-8", "first_choice": "Yes", "electives": "Government, History, Literature in English, Economics preferred", "backgrounds": "Arts, Business, Visual Arts, and Science accepted"},
                    {"name": "LLB Post-First-Degree (3-year)", "school": "Faculty of Law", "duration": "3 years", "requirements": "Degree + entrance exam"},
                    {"name": "LLB Post-First-Degree (4-year Part-Time)", "school": "Faculty of Law", "duration": "4 years", "requirements": "Degree + entrance exam"},
                    {"name": "BA Political Studies", "school": "Faculty of Social Sciences", "cutoff": "12-18"},
                    {"name": "BA Economics", "school": "Faculty of Social Sciences", "cutoff": "14-20"},
                    {"name": "BA English", "school": "Faculty of Social Sciences", "cutoff": "14-20"},
                    {"name": "BA Communication Studies", "school": "Faculty of Social Sciences", "cutoff": "14-20"},
                    {"name": "BA Sociology / Social Work", "school": "Faculty of Social Sciences", "cutoff": "16-22"},
                    {"name": "BA French", "school": "Faculty of Social Sciences", "cutoff": "16-24"},
                    {"name": "BA History", "school": "Faculty of Social Sciences", "cutoff": "16-24"},
                    {"name": "BA Geography & Rural Development", "school": "Faculty of Social Sciences", "cutoff": "16-24"},
                    {"name": "BA Religious Studies", "school": "Faculty of Social Sciences", "cutoff": "18-24"},
                    {"name": "BA Culture & Tourism", "school": "Faculty of Social Sciences", "cutoff": "18-24"}
                ],
                "notes": "All Faculty of Social Sciences/Arts programmes require 3 relevant Arts/Business/Social Science electives."
            },
            "Science": {
                "cutoff_range": "10-24",
                "programs": [
                    {"name": "BSc Computer Science", "school": "Faculty of Physical and Computational Sciences", "cutoff": "12-18", "requirements": "Maths, Physics + Chemistry/Applied Electricity/Electronics"},
                    {"name": "BSc Actuarial Science", "school": "Faculty of Physical and Computational Sciences", "cutoff": "10-16", "requirements": "Maths, Physics, Chemistry"},
                    {"name": "BSc Mathematics", "school": "Faculty of Physical and Computational Sciences", "cutoff": "16-22", "requirements": "Maths, Physics, Chemistry"},
                    {"name": "BSc Statistics", "school": "Faculty of Physical and Computational Sciences", "cutoff": "16-22", "requirements": "Maths, Physics, Chemistry"},
                    {"name": "BSc Physics", "school": "Faculty of Physical and Computational Sciences", "cutoff": "16-24", "requirements": "Maths, Physics, Chemistry"},
                    {"name": "BSc Chemistry", "school": "Faculty of Physical and Computational Sciences", "cutoff": "16-24", "requirements": "Maths, Physics, Chemistry"},
                    {"name": "BSc Meteorology & Climate Science", "school": "Faculty of Physical and Computational Sciences", "cutoff": "18-24", "requirements": "Maths, Physics, Chemistry"},
                    {"name": "BSc Biochemistry", "school": "Faculty of Biosciences", "cutoff": "12-18", "requirements": "Biology, Chemistry + Physics/Maths"},
                    {"name": "BSc Biotechnology", "school": "Faculty of Biosciences", "cutoff": "14-20", "requirements": "Biology, Chemistry + Physics/Maths"},
                    {"name": "BSc Food Science & Technology", "school": "Faculty of Biosciences", "cutoff": "14-20", "requirements": "Biology, Chemistry + Physics/Maths"},
                    {"name": "BSc Environmental Science", "school": "Faculty of Biosciences", "cutoff": "16-22", "requirements": "Biology/Agric, Chemistry + Physics/Maths"},
                    {"name": "BSc Biological Science", "school": "Faculty of Biosciences", "cutoff": "16-22", "requirements": "Biology, Chemistry + Physics/Maths"}
                ]
            },
            "Agriculture and Natural Resources": {
                "cutoff_range": "16-24",
                "programs": [
                    {"name": "BSc Agriculture", "school": "Faculty of Agriculture", "cutoff": "18-24", "options": "Crop Science, Soil Science, Agric Economics, Agric Extension", "requirements": "Chemistry, Physics/Maths + Biology/General Agriculture"},
                    {"name": "BSc Agricultural Biotechnology", "school": "Faculty of Agriculture", "cutoff": "16-22", "requirements": "Chemistry, Physics/Maths + Biology"},
                    {"name": "BSc Agribusiness Management", "school": "Faculty of Agriculture", "cutoff": "18-24", "notes": "Multiple entry paths - Science: Chemistry, Physics/Maths + Biology/General Agriculture; Business: Economics, Accounting, Business Management, Elective Maths; Arts: Economics, Geography + Elective Maths. Business/Arts applicants need B3+ in Integrated Science."},
                    {"name": "BSc Post Harvest Technology", "school": "Faculty of Agriculture", "cutoff": "18-24", "requirements": "Chemistry, Biology + Physics/Maths"},
                    {"name": "BSc Natural Resources Management", "school": "Faculty of Natural Resource Management", "cutoff": "18-24", "requirements": "Chemistry, Biology + Physics/Maths"},
                    {"name": "BSc Forest Resources Technology", "school": "Faculty of Natural Resource Management", "cutoff": "18-24", "requirements": "Chemistry, Biology + Physics/Maths/Agric"},
                    {"name": "BSc Landscape Design & Management", "school": "Faculty of Natural Resource Management", "cutoff": "18-24", "requirements": "Science, Arts, or Visual Arts background"},
                    {"name": "BSc Aquaculture & Water Resources Management", "school": "Faculty of Natural Resource Management", "cutoff": "18-24", "requirements": "Chemistry, Biology + Physics/Maths"}
                ]
            },
            "Art and Built Environment": {
                "cutoff_range": "9-24",
                "programs": [
                    {"name": "BSc Architecture", "school": "Faculty of Built Environment", "cutoff": "9-14", "requirements": "Elective Maths + 2 from Tech/Science/Visual Arts"},
                    {"name": "BSc Construction Tech & Management", "school": "Faculty of Built Environment", "cutoff": "12-18", "requirements": "Maths + 2 from Tech/Science/Arts"},
                    {"name": "BSc Quantity Surveying", "school": "Faculty of Built Environment", "cutoff": "12-18", "requirements": "Elective Maths + 2 relevant"},
                    {"name": "BSc Development Planning", "school": "Faculty of Built Environment", "cutoff": "14-20", "requirements": "Geography, Economics, Maths, History, Government"},
                    {"name": "BSc Land Economy (Real Estate)", "school": "Faculty of Built Environment", "cutoff": "14-20", "requirements": "Arts, Business, or Science background"},
                    {"name": "BA Communication Design", "school": "Faculty of Art", "cutoff": "12-18"},
                    {"name": "BSc Fashion Design", "school": "Faculty of Art", "cutoff": "14-22"},
                    {"name": "BSc Industrial Art", "school": "Faculty of Art", "cutoff": "14-22", "options": "Ceramics, Metal, Textile"},
                    {"name": "BFA Painting & Sculpture", "school": "Faculty of Art", "cutoff": "16-24"},
                    {"name": "BA Publishing Studies", "school": "Faculty of Art", "cutoff": "16-24"},
                    {"name": "BA Integrated Rural Art & Industry", "school": "Faculty of Art", "cutoff": "18-24"},
                    {"name": "B.Ed JHS Education", "school": "Faculty of Educational Studies", "cutoff": "18-24", "specializations": "Maths, Science, ICT, Agric, History, Visual Arts, Geography"}
                ],
                "notes": "Some Art programmes require practical exams or portfolio submissions."
            }
        },
        "fees": {
            "ghanaian_students": {
                "Humanities & Social Sciences (General)": "~GH¢ 1,948",
                "Business/Law": "~GH¢ 2,501",
                "Hospitality & Tourism": "~GH¢ 2,921",
                "Science (General)": "~GH¢ 2,821",
                "Maths/Stats/Actuarial": "~GH¢ 2,221",
                "Engineering": "~GH¢ 2,800-3,200",
                "Agriculture & Natural Resources": "~GH¢ 2,200-2,800",
                "Art & Built Environment": "~GH¢ 2,500-3,000",
                "Health Sciences (Medicine/Dentistry/Pharmacy)": "~GH¢ 4,141+",
                "Health Sciences (Nursing/Allied Health)": "~GH¢ 3,200-3,800",
                "Freshmen Fee-Paying/Humanities": "~GH¢ 4,543",
                "Freshmen Fee-Paying/Business/Hospitality": "~GH¢ 5,740-6,160",
                "Freshmen Fee-Paying/Science/Engineering": "~GH¢ 5,000-6,500",
                "Freshmen Fee-Paying/Health Sciences": "~GH¢ 6,000-8,000",
                "Freshmen Residential (total)": "~GH¢ 2,168"
            },
            "residential_note": "Residential and academic fees are paid separately with different pay-in-slips.",
            "approved_banks": "GCB Bank, Ecobank, UBA, and other approved partners",
            "international_students": "Fees are significantly higher and benchmarked in USD; vary by college and programme. Pay into the KNUST Main Fees Collection Account. Contact Students' Financial Services for exact amounts.",
            "payment_policy": "1st Semester: at least 50% before course registration; 2nd Semester: 100% before registration"
        },
        "scholarships": {
            "knust_excellence": "Merit-based full scholarships for outstanding students",
            "mastercard_foundation": "For disadvantaged but brilliant students",
            "engineering_scholarship": "For students in engineering programmes",
            "health_science_scholarship": "For health sciences students"
        }
    },

    # ========================================================================
    # UNIVERSITY OF GHANA (UG)
    # ========================================================================
    "University of Ghana": {
        "location": "Legon, Accra",
        "established": "1948",
        "website": "www.ug.edu.gh",
        "type": "Public",
        "overview": "UG is Ghana's oldest and largest public university, offering over 90 undergraduate programmes across 4 colleges.",
        "admission_requirements": {
            "general": "WASSCE: Credit passes (A1-C6) in 6 subjects (4 Core + 3 Electives). Aggregate 24 or better for regular admission. Distance Education: Aggregate 30.",
            "wassce": "Credit passes A1-C6 in English, Core Maths, Integrated Science, Social Studies + 3 relevant electives",
            "sssce": "Credit passes A-D in English, Core Maths, Integrated Science, Social Studies + 3 relevant electives",
            "aggregate_calculation": "Science-related disciplines: English + Core Maths + Integrated Science + 3 Science Electives (Social Studies excluded). Non-Science disciplines: English + Core Maths + Social Studies + 3 Electives (Integrated Science excluded). A lower aggregate is a better/more competitive score.",
            "gce": "3 'A' Level passes + 5 'O' Level credits including English and Maths",
            "ib": "Grade 4+ in 3 HL subjects",
            "mature": "25+ years old, entrance exam, relevant work experience",
            "how_to_apply": "1) Purchase an E-Voucher from an approved bank - Consolidated Bank Ghana (*924*200*25#), Fidelity Bank (*776*108#), or Prudential Bank (*772*100#); costs about GH¢250. 2) Access the Admissions Portal and complete the online application with personal details, academic records, and programme choices. 3) Upload transcripts, certificates, and result slips. 4) Submit before the deadline (application window typically runs March-June).",
            "international_applicants": "Do NOT purchase an e-voucher. Apply through the International Programmes Office and pay a non-refundable application fee of US$55.",
            "application_deadline": "August 31, 2026 (Pending WASSCE release)",
            "online_portal": "https://admissions.ug.edu.gh",
            "application_fee": "GH¢ 250 (via *924*200*25#)",
            "entrance_exam": "Required for Medicine, Law, and other competitive programmes",
            "first_choice_policy": "Many competitive programmes (Medicine, Law, Business, Computer Science, Engineering, etc.) are strictly 'First Choice Only'. Selecting them as second or third choice drastically reduces admission chances - always select competitive programmes as your first choice. If selecting LLB as first choice, select a BA bouquet as your second choice.",
            "fee_schedule_status": "The official 2026/2027 fee schedule had not been published as of August 2026. Figures here are based on the 2024/2025 and 2025/2026 schedules; Academic Facility User Fees (AFUF) have been maintained at the same rates since 2023/2024."
        },
        "contact": {
            "phone": "+233-30-213-8501",
            "email": "admissions@ug.edu.gh",
            "address": "P.O. Box LG 25, Legon, Accra",
            "admissions_portal": "https://admissions.ug.edu.gh",
            "cutoff_points_portal": "https://admissions.ug.edu.gh/undergraduate/cut-off",
            "fees_schedule_portal": "https://sts.ug.edu.gh/services/fees",
            "international_programmes_portal": "https://ip.ug.edu.gh",
            "business_school_website": "https://ugbs.ug.edu.gh"
        },
        "colleges": {
            "Humanities": {
                "cutoff_range": "7-24",
                "requirements": "Credit passes in 4 core subjects + 3 elective subjects relevant to the chosen programme. Houses 6 schools: UG Business School, School of Law, School of Arts, School of Social Sciences, School of Languages, School of Performing Arts.",
                "programs": [
                    {"name": "LLB (Law)", "school": "School of Law", "duration": "4 years", "cutoff": "7", "first_choice": "Yes", "electives": "Government/History, Literature in English, Economics, French, Business Management preferred", "backgrounds": "Both Arts and Science backgrounds accepted"},
                    {"name": "BSc Administration - Accounting", "school": "UG Business School (UGBS)", "cutoff": "9", "first_choice": "Yes"},
                    {"name": "BSc Administration - Banking & Finance", "school": "UG Business School (UGBS)", "cutoff": "9", "first_choice": "Yes"},
                    {"name": "BSc Administration - Marketing", "school": "UG Business School (UGBS)", "cutoff": "9", "first_choice": "Yes"},
                    {"name": "BSc Administration - Human Resource Management", "school": "UG Business School (UGBS)", "cutoff": "9", "first_choice": "Yes"},
                    {"name": "BSc Administration - Public Administration", "school": "UG Business School (UGBS)", "cutoff": "9", "first_choice": "Yes"},
                    {"name": "BSc Administration - Insurance", "school": "UG Business School (UGBS)", "cutoff": "9", "first_choice": "Yes"},
                    {"name": "BSc Administration - Health Services Management", "school": "UG Business School (UGBS)", "cutoff": "9", "first_choice": "Yes"},
                    {"name": "BSc Administration - E-Commerce & Customer Management", "school": "UG Business School (UGBS)", "cutoff": "9", "first_choice": "Yes"},
                    {"name": "BA Political Science", "school": "School of Social Sciences", "cutoff": "24"},
                    {"name": "BA Economics", "school": "School of Social Sciences", "cutoff": "24"},
                    {"name": "BA Geography & Resource Development", "school": "School of Social Sciences", "cutoff": "24"},
                    {"name": "BA Psychology", "school": "School of Social Sciences", "cutoff": "24"},
                    {"name": "BA Social Work", "school": "School of Social Sciences", "cutoff": "24"},
                    {"name": "BA Sociology", "school": "School of Social Sciences", "cutoff": "24"},
                    {"name": "BA English (English Literature / Creative Writing)", "school": "School of Arts - Dept. of English", "cutoff": "24"},
                    {"name": "BA Philosophy", "school": "School of Arts - Dept. of Philosophy & Classics", "cutoff": "24"},
                    {"name": "BA Classics", "school": "School of Arts - Dept. of Philosophy & Classics", "cutoff": "24"},
                    {"name": "BA History", "school": "School of Arts - Dept. of History", "cutoff": "24"},
                    {"name": "BA Study of Religions", "school": "School of Arts - Dept. of Study of Religions", "cutoff": "24"},
                    {"name": "BA Archaeology", "school": "School of Arts - Dept. of Archaeology & Heritage Studies", "cutoff": "24"},
                    {"name": "BA Information Studies", "school": "School of Arts - Dept. of Information Studies", "cutoff": "24"},
                    {"name": "BA French", "school": "School of Languages - Dept. of French", "cutoff": "24"},
                    {"name": "BA Linguistics", "school": "School of Languages - Dept. of Linguistics", "cutoff": "24"},
                    {"name": "BA Spanish / Chinese (Mandarin) / Swahili / Russian", "school": "School of Languages - Dept. of Modern Languages", "cutoff": "24", "notes": "Offered as bouquet subjects alongside another discipline; short proficiency courses also available in Arabic, Chinese, French, Russian, Spanish, and Swahili"},
                    {"name": "BA/BFA Music", "school": "School of Performing Arts", "cutoff": "24", "requirements": "Auditions and/or portfolio submissions may be required"},
                    {"name": "BA/BFA Theatre Arts", "school": "School of Performing Arts", "cutoff": "24", "requirements": "Auditions and/or portfolio submissions may be required"},
                    {"name": "BA/BFA Dance Studies", "school": "School of Performing Arts", "cutoff": "24", "requirements": "Auditions and/or portfolio submissions may be required"}
                ],
                "notes": "Most School of Arts and School of Social Sciences programmes are offered through a subject bouquet system - students select combinations of 2-3 subjects (e.g. Political Science, Philosophy & Classics, Archaeology or Sociology, English & Study of Religions)."
            },
            "Basic and Applied Sciences": {
                "cutoff_range": "6-24",
                "requirements": "Credit passes in English, Core Maths, Integrated Science + 3 Science electives (Social Studies excluded from aggregate). Houses 6 schools across engineering, physical/mathematical sciences, biological sciences, agriculture, computer science, earth science, and veterinary medicine.",
                "programs": [
                    {"name": "BSc Biomedical Engineering", "school": "School of Engineering Sciences", "cutoff": "6-7", "first_choice": "Yes", "requirements": "Elective Maths (B3+), Physics, Chemistry"},
                    {"name": "BSc Computer Engineering", "school": "School of Engineering Sciences", "cutoff": "7", "first_choice": "Yes", "requirements": "Elective Maths (B3+), Physics, Chemistry"},
                    {"name": "BSc Computer Science", "school": "Department of Computer Science", "cutoff": "7-9", "first_choice": "Yes", "requirements": "Elective Mathematics (B3+) critical"},
                    {"name": "BSc Information Technology", "school": "Department of Computer Science", "cutoff": "12", "first_choice": "Yes", "requirements": "Core Mathematics (C4+)"},
                    {"name": "BSc Actuarial Science", "school": "School of Physical and Mathematical Sciences - Dept. of Statistics & Actuarial Science", "cutoff": "12", "requirements": "Elective Maths (high grade required)"},
                    {"name": "BSc Agricultural Engineering", "school": "School of Engineering Sciences", "cutoff": "15", "requirements": "Elective Maths (B3+), Physics, Chemistry"},
                    {"name": "BSc Food Process Engineering", "school": "School of Engineering Sciences", "cutoff": "14", "requirements": "Elective Maths (B3+), Physics, Chemistry"},
                    {"name": "BSc Materials Science & Engineering", "school": "School of Engineering Sciences", "cutoff": "14", "requirements": "Elective Maths (B3+), Physics, Chemistry"},
                    {"name": "Doctor of Veterinary Medicine (DVM)", "school": "School of Veterinary Medicine", "duration": "6 years", "cutoff": "14", "first_choice": "Yes", "notes": "Professional doctorate, not a BSc. Electives: Biology, Chemistry + Physics or Elective Maths. Degree holders (BSc in Biological Science, Allied Health, or Animal Science) may enter at Level 100; Diploma in Animal Health with Distinction also accepted."},
                    {"name": "BSc Agriculture", "school": "School of Agriculture", "cutoff": "24", "options": "Crop Science, Animal Science, Soil Science, Agribusiness/Agricultural Economics, Agricultural Extension"},
                    {"name": "BSc Earth Science", "school": "Department of Earth Science", "cutoff": "24", "options": "Geology, Hydrogeology, Mineral Exploration, Petroleum Geoscience, Engineering Geology, Environmental Earth Science", "requirements": "Chemistry and Physics typically required"},
                    {"name": "BSc Mathematics", "school": "School of Physical and Mathematical Sciences - Dept. of Mathematics", "cutoff": "24", "requirements": "Elective Maths required"},
                    {"name": "BSc Statistics", "school": "School of Physical and Mathematical Sciences - Dept. of Statistics & Actuarial Science", "cutoff": "24", "requirements": "Elective Maths required"},
                    {"name": "BSc Mathematical Sciences", "school": "School of Physical and Mathematical Sciences (combined departments)", "cutoff": "24", "requirements": "Elective Maths required"},
                    {"name": "BSc Physics", "school": "School of Physical and Mathematical Sciences - Dept. of Physics", "cutoff": "24", "requirements": "Physics, Elective Maths required"},
                    {"name": "BSc Geophysics", "school": "School of Physical and Mathematical Sciences - Dept. of Physics", "cutoff": "24", "requirements": "Physics, Elective Maths required"},
                    {"name": "BSc Chemistry", "school": "School of Physical and Mathematical Sciences - Dept. of Chemistry", "cutoff": "24", "requirements": "Chemistry required"},
                    {"name": "BSc Biochemistry, Cell & Molecular Biology", "school": "School of Biological Sciences", "cutoff": "24"},
                    {"name": "BSc Nutrition & Food Science", "school": "School of Biological Sciences", "cutoff": "24"},
                    {"name": "BSc Animal Biology & Conservation Science", "school": "School of Biological Sciences", "cutoff": "24"},
                    {"name": "BSc Plant & Environmental Biology", "school": "School of Biological Sciences", "cutoff": "24"},
                    {"name": "BSc Marine & Fisheries Sciences", "school": "School of Biological Sciences", "cutoff": "24"}
                ],
                "notes": "School of Physical and Mathematical Sciences programmes can be taken as a Single Major, Combined Major, or Major-Minor. School of Nuclear and Allied Sciences (SNAS) is a graduate-only school (MPhil/PhD in Nuclear Engineering, Radiation Protection, Applied Nuclear Physics, Medical Physics, Nuclear Earth Science, Nuclear Agriculture & Radiation Processing, Nuclear & Radiochemistry, run with the Ghana Atomic Energy Commission and IAEA) - it does not offer undergraduate programmes."
            },
            "Health Sciences": {
                "cutoff_range": "8-16",
                "first_choice_only": "Yes",
                "requirements": "All programmes are First Choice programmes and are extremely competitive. Applicants must select science-based subjects for their second and third choices. Houses 6 schools.",
                "programs": [
                    {"name": "MB ChB (Medicine & Surgery)", "school": "Medical School", "duration": "6 years", "cutoff": "8", "first_choice": "Yes", "entrance_exam": "Computer-based entrance exam may be required", "requirements": "Biology, Chemistry, Physics or Elective Maths"},
                    {"name": "Graduate Entry Medical Programme (GEMP)", "school": "Medical School", "duration": "4 years", "cutoff": "N/A (degree required)", "requirements": "Good first degree (minimum 2nd Class Lower) in a relevant science field (Biological Sciences, Biochemistry, Pharmacy, Nursing, etc.), good grades in 3 core + 3 science electives including Chemistry, national service completion, entrance exam and interview"},
                    {"name": "BDS (Dental Surgery)", "school": "Dental School", "duration": "6 years", "cutoff": "10", "first_choice": "Yes", "entrance_exam": "May be required", "requirements": "Same as MB ChB: Biology, Chemistry, Physics/Elective Maths"},
                    {"name": "Graduate Entry Dental Programme (GEDP)", "school": "Dental School", "duration": "4 years", "cutoff": "N/A (degree required)"},
                    {"name": "Pharm.D (Doctor of Pharmacy)", "school": "School of Pharmacy", "duration": "6 years", "cutoff": "10", "first_choice": "Yes", "requirements": "Chemistry (mandatory), Biology, Physics or Elective Maths"},
                    {"name": "BSc Nursing", "school": "School of Nursing and Midwifery", "duration": "4 years", "cutoff": "15", "first_choice": "Yes", "requirements": "Science: Biology, Chemistry, Physics, Elective Maths. Non-Science applicants may be considered from General Arts, Home Economics, or Business backgrounds if core requirements are met. Entrance exam and/or interview possible."},
                    {"name": "BSc Midwifery", "school": "School of Nursing and Midwifery", "duration": "4 years", "cutoff": "15", "first_choice": "Yes"},
                    {"name": "BSc Medical Laboratory Science", "school": "School of Biomedical and Allied Health Sciences (SBAHS)", "duration": "4 years", "cutoff": "12", "first_choice": "Yes", "electives": "Chemistry, Physics, Biology/Elective Maths"},
                    {"name": "BSc Diagnostic Radiography", "school": "School of Biomedical and Allied Health Sciences (SBAHS)", "duration": "4 years", "cutoff": "13", "first_choice": "Yes"},
                    {"name": "BSc Physiotherapy", "school": "School of Biomedical and Allied Health Sciences (SBAHS)", "duration": "4 years", "cutoff": "14", "first_choice": "Yes"},
                    {"name": "BSc Dietetics", "school": "School of Biomedical and Allied Health Sciences (SBAHS)", "duration": "4 years", "cutoff": "14", "first_choice": "Yes"},
                    {"name": "BSc Occupational Therapy", "school": "School of Biomedical and Allied Health Sciences (SBAHS)", "duration": "4 years", "cutoff": "14-15", "first_choice": "Yes", "electives": "Chemistry, Physics, Biology/Elective Maths"},
                    {"name": "BSc Respiratory Therapy", "school": "School of Biomedical and Allied Health Sciences (SBAHS)", "duration": "4 years", "cutoff": "14", "first_choice": "Yes"},
                    {"name": "BSc Physiotherapy (Top-Up)", "school": "School of Biomedical and Allied Health Sciences (SBAHS)", "notes": "For diploma holders"},
                    {"name": "BSc Occupational Therapy (Top-Up)", "school": "School of Biomedical and Allied Health Sciences (SBAHS)", "notes": "For diploma holders"},
                    {"name": "BSc Radiography (Top-Up)", "school": "School of Biomedical and Allied Health Sciences (SBAHS)", "notes": "For diploma holders"},
                    {"name": "BPH (Bachelor of Public Health)", "school": "School of Public Health", "duration": "4 years", "cutoff": "16", "first_choice": "Yes", "requirements": "Science students: Chemistry, Physics, Biology or Elective Maths. Non-Science students: relevant electives in General Arts, Agricultural Science, or Home Economics.", "notes": "Diploma holders (Level 200 entry) need a Diploma in health/related sciences with FGPA 3.2+, plus entrance exam and interview"}
                ]
            },
            "Education": {
                "cutoff_range": "24-30",
                "requirements": "Credit passes in 4 core subjects + 3 relevant elective subjects. Aggregate 24 or better (regular), 30 or better (distance). Houses 3 main schools.",
                "programs": [
                    {"name": "B.Ed Education", "school": "School of Education and Leadership", "cutoff": "24"},
                    {"name": "B.Ed Early Grade Specialism", "school": "School of Education and Leadership", "cutoff": "24"},
                    {"name": "B.Ed Upper Primary Specialism", "school": "School of Education and Leadership", "cutoff": "24"},
                    {"name": "B.Ed JHS Specialism", "school": "School of Education and Leadership", "cutoff": "24"},
                    {"name": "B.Ed Arabic", "school": "School of Education and Leadership", "cutoff": "24", "requirements": "C6 in French"},
                    {"name": "B.Ed Computer Science", "school": "School of Education and Leadership", "cutoff": "24"},
                    {"name": "B.Ed Consumer Sciences", "school": "School of Education and Leadership", "cutoff": "24"},
                    {"name": "B.Ed English", "school": "School of Education and Leadership", "cutoff": "24", "requirements": "C6 in Literature in English"},
                    {"name": "B.Ed French", "school": "School of Education and Leadership", "cutoff": "24", "requirements": "C6 in French"},
                    {"name": "B.Ed Ghanaian Language", "school": "School of Education and Leadership", "cutoff": "24"},
                    {"name": "B.Ed Mathematics", "school": "School of Education and Leadership", "cutoff": "24", "requirements": "C6 in Elective Mathematics"},
                    {"name": "B.Ed Science", "school": "School of Education and Leadership", "cutoff": "24", "requirements": "C6 in relevant science subject"},
                    {"name": "B.Ed Social Studies", "school": "School of Education and Leadership", "cutoff": "24"},
                    {"name": "BA Information Studies", "school": "School of Information and Communication Studies", "cutoff": "24"},
                    {"name": "BSc Administration (Accra City Campus)", "cutoff": "24"},
                    {"name": "BA (Accra City Campus)", "cutoff": "24"}
                ],
                "notes": "School of Continuing and Distance Education offers distance-learning versions of programmes from other colleges for working professionals - aggregate requirement 30 or better, learning centres across Ghana, weekend and evening classes."
            }
        },
        "fees": {
            "ghanaian_students": {
                "Humanities (BA, BSc Admin, LLB)": "~GH¢ 2,300-2,500",
                "Basic & Applied Sciences": "~GH¢ 2,500-3,000",
                "Education": "~GH¢ 2,300-2,500",
                "Medical School": "~GH¢ 2,900-3,000",
                "Dental School": "~GH¢ 2,900-3,000",
                "Pharmacy": "~GH¢ 4,500-4,600",
                "Biomedical & Allied Health": "~GH¢ 4,200-4,300",
                "Nursing": "~GH¢ 3,800-4,000"
            },
            "mandatory_levies": {
                "SRC Dues": "GH¢ 50",
                "SRC Development Levy": "GH¢ 150",
                "75th Anniversary Legacy Project Levy": "GH¢ 100",
                "Telecel Broadband Levy": "GH¢ 122 (optional - students may opt out)",
                "GRASAG Development Levy": "GH¢ 250 (graduate students only)",
                "Reprographic Fees": "GH¢ 5"
            },
            "payment_policy": "1st Semester: at least 50% of total fees before registration; 2nd Semester: 100% of total fees before registration; Residential Fees: 100% before hostel registration",
            "international_students": "Fees are significantly higher and quoted in USD. Payment via approved banks (Ecobank Ghana, Access Bank) or the online portal https://sts.ug.edu.gh/ugpay. Application processing fee: US$55 (non-refundable). Contact the International Programmes Office (IPO) for exact amounts."
        },
        "scholarships": {
            "ug_excellence": "Up to 100% tuition coverage for outstanding students",
            "sabre_scholarship": "For students from Northern Ghana",
            "mastercard_foundation": "For disadvantaged but brilliant students",
            "needy_student_scholarship": "For students with financial need"
        }
    },

    # ========================================================================
    # UNIVERSITY OF CAPE COAST (UCC)
    # ========================================================================
    "University of Cape Coast": {
        "location": "Cape Coast, Central Region",
        "established": "1962",
        "website": "www.ucc.edu.gh",
        "type": "Public",
        "overview": "UCC is Ghana's foremost university for teacher education and one of the most prestigious public universities, offering over 150 undergraduate programmes across 5 colleges.",
        "admission_requirements": {
            "general": "WASSCE: Credit passes (A1-C6) in 6 subjects (3 Core + 3 Electives). Maximum aggregate 36 - more accessible than UG/KNUST, which cap at 24. SSSCE: Maximum aggregate 24.",
            "wassce": "Credit passes A1-C6 in English Language, Core Mathematics, Integrated Science OR Social Studies (depending on programme) + 3 relevant electives. Aggregate 36 or better.",
            "sssce": "Credit passes A-D in English, Core Maths, Integrated Science/Social Studies + 3 relevant electives. Aggregate 24 or better.",
            "gce_a_levels": "5 'O' Level credits + 3 'A' Level passes in relevant subjects",
            "gbce_abce": "Credits in relevant subjects",
            "igcse": "Equivalent grade requirements in relevant subjects",
            "ib": "International Baccalaureate: Grade 4+ in relevant subjects",
            "american_high_school": "Grade 12 certificate with equivalent grades",
            "diploma_hnd": "Diploma/HND assessed individually for Level 100/200/300 placement",
            "mature": "25+ years by June 30, SHS certificate or equivalent, 5+ years work experience, entrance exam",
            "how_to_apply": "1) Purchase an E-Voucher from GCB Bank, ADB, Fidelity Bank, Ecobank, or Ghana Post. 2) Complete the application at the portal - fill in personal details, academic records, and programme choices. 3) Upload documents - result slips, certificates, identification. 4) Check application status using the voucher serial number and PIN.",
            "study_modes": "Regular (Full-time on-campus); Distance Learning via the College of Distance Education (CoDE); Sandwich/Part-time programmes",
            "application_deadline": "Check the admissions portal - deadlines change annually",
            "online_portal": "https://apply.ucc.edu.gh",
            "status_check_portal": "https://admissions.ucc.edu.gh",
            "application_fee": "Contact university for current fee"
        },
        "contact": {
            "phone": "+233-33-213-2440",
            "email": "admissions@ucc.edu.gh",
            "academic_affairs_email": "academic.affairs@ucc.edu.gh",
            "address": "University of Cape Coast, Cape Coast, Central Region",
            "application_portal": "https://apply.ucc.edu.gh",
            "admissions_status_portal": "https://admissions.ucc.edu.gh",
            "student_portal": "https://portal.ucc.edu.gh"
        },
        "colleges": {
            "Health and Allied Sciences (CoHAS)": {
                "cutoff_range": "8-16",
                "requirements": "Credit passes in English, Core Maths, Integrated Science + 3 Science electives (Biology, Chemistry, Physics/Elective Maths). Interview or selection exam may be required for some programmes. The most competitive college at UCC.",
                "programs": [
                    {"name": "MBChB (Medicine & Surgery)", "school": "School of Medical Sciences", "duration": "6 years", "cutoff": "8", "electives": "Biology, Chemistry + Physics/Elective Maths", "entrance_exam": "May be required", "notes": "Extremely competitive"},
                    {"name": "Doctor of Pharmacy (PharmD)", "school": "School of Pharmacy and Pharmaceutical Sciences", "duration": "6 years", "cutoff": "9", "electives": "Biology, Chemistry + Physics/Elective Maths"},
                    {"name": "BSc Nursing", "school": "School of Nursing and Midwifery", "duration": "4 years", "cutoff": "12", "requirements": "Credit in English, Core Maths, Integrated Science + 3 relevant electives. Science and Non-Science backgrounds accepted."},
                    {"name": "BSc Midwifery", "school": "School of Nursing and Midwifery", "duration": "4 years", "cutoff": "12"},
                    {"name": "BSc Mental Health Nursing", "school": "School of Nursing and Midwifery", "duration": "4 years", "cutoff": "14"},
                    {"name": "BSc Community Mental Health Nursing", "school": "School of Nursing and Midwifery", "duration": "4 years", "cutoff": "14"},
                    {"name": "Doctor of Optometry", "school": "School of Allied Health Sciences", "duration": "6 years", "cutoff": "12"},
                    {"name": "BSc Physician Assistant Studies", "school": "School of Allied Health Sciences", "duration": "4 years", "cutoff": "11"},
                    {"name": "BSc Medical Laboratory Science/Technology", "school": "School of Allied Health Sciences", "duration": "4 years", "cutoff": "12"},
                    {"name": "BSc Clinical Nutrition & Dietetics", "school": "School of Allied Health Sciences", "duration": "4 years", "cutoff": "14"},
                    {"name": "BSc Biomedical Sciences", "school": "School of Allied Health Sciences", "duration": "4 years", "cutoff": "14"},
                    {"name": "BSc Diagnostic Imaging Technology", "school": "School of Allied Health Sciences", "duration": "4 years", "cutoff": "14"},
                    {"name": "BSc Diagnostic Medical Sonography", "school": "School of Allied Health Sciences", "duration": "4 years", "cutoff": "14"},
                    {"name": "BSc Health Information Management", "school": "School of Allied Health Sciences", "duration": "4 years", "cutoff": "16"},
                    {"name": "BSc Sports & Exercise Science", "school": "School of Allied Health Sciences", "duration": "4 years", "cutoff": "16"}
                ]
            },
            "Humanities and Legal Studies (CHLS)": {
                "cutoff_range": "8-25",
                "requirements": "Houses the Faculty of Arts, Faculty of Law, Faculty of Social Sciences, School of Business, and School of Economics. Credit passes in English, Core Maths, Social Studies + 3 relevant electives (backgrounds vary by programme).",
                "programs": [
                    {"name": "LLB (4-year First Degree)", "school": "Faculty of Law", "duration": "4 years", "cutoff": "8-10", "requirements": "Excellent grades in English + relevant electives. Highly competitive."},
                    {"name": "LLB (3-year Post-First-Degree)", "school": "Faculty of Law", "duration": "3 years", "requirements": "Bachelor's degree in another discipline + entrance exam"},
                    {"name": "BSc Economics", "school": "School of Economics", "cutoff": "15"},
                    {"name": "BSc Economics with Finance", "school": "School of Economics", "cutoff": "15"},
                    {"name": "BA Economics", "school": "School of Economics", "cutoff": "16"},
                    {"name": "BBA Accounting", "school": "School of Business", "cutoff": "15"},
                    {"name": "BBA Human Resource Management", "school": "School of Business", "cutoff": "16"},
                    {"name": "BBA Management", "school": "School of Business", "cutoff": "16"},
                    {"name": "B.Com Finance", "school": "School of Business", "cutoff": "15"},
                    {"name": "B.Com Marketing", "school": "School of Business", "cutoff": "16"},
                    {"name": "B.Com Management", "school": "School of Business", "cutoff": "16"},
                    {"name": "B.Com Procurement & Supply Chain Management", "school": "School of Business", "cutoff": "16"},
                    {"name": "B.Com Commerce", "school": "School of Business", "cutoff": "16"},
                    {"name": "BSc Hospitality Management", "school": "Faculty of Social Sciences", "cutoff": "16"},
                    {"name": "BSc Tourism Management", "school": "Faculty of Social Sciences", "cutoff": "16"},
                    {"name": "BA Communication Studies", "school": "Faculty of Arts", "cutoff": "17"},
                    {"name": "BA English", "school": "Faculty of Arts", "cutoff": "18"},
                    {"name": "BA Sociology", "school": "Faculty of Social Sciences", "cutoff": "18"},
                    {"name": "BA Population & Health", "school": "Faculty of Social Sciences", "cutoff": "18"},
                    {"name": "BSc Geography & Regional Planning", "school": "Faculty of Social Sciences", "cutoff": "18"},
                    {"name": "BA History", "school": "Faculty of Arts", "cutoff": "19"},
                    {"name": "BA African Studies", "school": "Faculty of Arts", "cutoff": "19"},
                    {"name": "BA French", "school": "Faculty of Arts", "cutoff": "20"},
                    {"name": "BA Theatre Studies", "school": "Faculty of Arts", "cutoff": "20"},
                    {"name": "BA Film Studies", "school": "Faculty of Arts", "cutoff": "20"},
                    {"name": "BA Social Behaviour & Conflict Management", "school": "Faculty of Social Sciences", "cutoff": "20"},
                    {"name": "BA Anthropology", "school": "Faculty of Social Sciences", "cutoff": "22"},
                    {"name": "BA Dance", "school": "Faculty of Arts", "cutoff": "22"},
                    {"name": "Bachelor of Music (B.Mus)", "school": "Faculty of Arts", "cutoff": "22"},
                    {"name": "BA Ghanaian Language & Linguistics", "school": "Faculty of Arts", "cutoff": "22"},
                    {"name": "BA Classics & Philosophy", "school": "Faculty of Arts", "cutoff": "22"},
                    {"name": "BA Religious Studies", "school": "Faculty of Arts", "cutoff": "22"},
                    {"name": "BA Chinese", "school": "Faculty of Arts", "cutoff": "25"}
                ],
                "notes": "School for Development Studies focuses primarily on postgraduate research and teaching; undergraduates interested in development studies typically pursue BA Social Sciences."
            },
            "Education Studies (CES)": {
                "cutoff_range": "18-24",
                "requirements": "UCC's flagship college - the university was originally established as a teacher training institution. Credit passes in English, Core Maths, Integrated Science/Social Studies + 3 electives matching the teaching specialization.",
                "programs": [
                    {"name": "B.Ed Accounting", "school": "Faculty of Humanities and Social Sciences Education", "cutoff": "18"},
                    {"name": "B.Ed Mathematics", "school": "Faculty of Science and Technology Education", "cutoff": "18"},
                    {"name": "B.Ed Computer Science / ICT", "school": "Faculty of Science and Technology Education", "cutoff": "18"},
                    {"name": "B.Ed Robotics and Intelligent Systems", "school": "Faculty of Science and Technology Education", "cutoff": "18"},
                    {"name": "B.Ed Arts", "school": "Faculty of Humanities and Social Sciences Education", "cutoff": "20"},
                    {"name": "B.Ed Social Science", "school": "Faculty of Humanities and Social Sciences Education", "cutoff": "20"},
                    {"name": "B.Ed Social Studies", "school": "Faculty of Humanities and Social Sciences Education", "cutoff": "20"},
                    {"name": "B.Ed Management", "school": "Faculty of Humanities and Social Sciences Education", "cutoff": "20"},
                    {"name": "B.Ed Science", "school": "Faculty of Science and Technology Education", "cutoff": "20"},
                    {"name": "B.Ed Health Science", "school": "Faculty of Science and Technology Education", "cutoff": "20"},
                    {"name": "B.Ed Health, Physical Education & Recreation", "school": "Faculty of Science and Technology Education", "cutoff": "22"},
                    {"name": "B.Ed Home Economics", "school": "Faculty of Science and Technology Education", "cutoff": "22"},
                    {"name": "B.Ed Basic Education", "school": "Faculty of Educational Foundations", "cutoff": "22"},
                    {"name": "B.Ed Early Childhood Education", "school": "Faculty of Educational Foundations", "cutoff": "24"}
                ],
                "notes": "School of Educational Development and Outreach manages distance learning, sandwich, and outreach education in coordination with CoDE."
            },
            "Agriculture and Natural Sciences (CANS)": {
                "cutoff_range": "14-24",
                "requirements": "Credit passes in English, Core Maths, Integrated Science + 3 Science electives. Most require Elective Maths/Physics/Chemistry; Computer Science needs Maths + Physics + Chemistry/Electronics.",
                "programs": [
                    {"name": "BSc Actuarial Science", "school": "School of Physical Sciences", "cutoff": "14"},
                    {"name": "BSc Forensic Science", "school": "School of Biological Sciences", "cutoff": "14"},
                    {"name": "BSc Computer Science", "school": "School of Physical Sciences", "cutoff": "15"},
                    {"name": "BSc Biochemistry", "school": "School of Biological Sciences", "cutoff": "16"},
                    {"name": "BSc Molecular Biology & Biotechnology", "school": "School of Biological Sciences", "cutoff": "16"},
                    {"name": "BSc Information Technology", "school": "School of Physical Sciences", "cutoff": "16"},
                    {"name": "BSc Agribusiness", "school": "School of Agriculture", "cutoff": "18"},
                    {"name": "BSc Fisheries & Aquatic Science", "school": "School of Biological Sciences", "cutoff": "18"},
                    {"name": "BSc Environmental Science", "school": "School of Biological Sciences", "cutoff": "18"},
                    {"name": "BSc Mathematics", "school": "School of Physical Sciences", "cutoff": "18"},
                    {"name": "BSc Statistics", "school": "School of Physical Sciences", "cutoff": "18"},
                    {"name": "BSc Mathematics & Statistics", "school": "School of Physical Sciences", "cutoff": "18"},
                    {"name": "BSc Mathematics with Business", "school": "School of Physical Sciences", "cutoff": "18"},
                    {"name": "BSc Mathematics with Economics", "school": "School of Physical Sciences", "cutoff": "18"},
                    {"name": "BSc Engineering Physics", "school": "School of Physical Sciences", "cutoff": "18"},
                    {"name": "BSc Industrial Chemistry", "school": "School of Physical Sciences", "cutoff": "18"},
                    {"name": "BSc Laboratory Technology", "school": "School of Physical Sciences", "cutoff": "18"},
                    {"name": "BSc Agriculture", "school": "School of Agriculture", "cutoff": "20"},
                    {"name": "BSc Agro-Processing", "school": "School of Agriculture", "cutoff": "20"},
                    {"name": "BSc Animal Health", "school": "School of Agriculture", "cutoff": "20"},
                    {"name": "BSc Physics", "school": "School of Physical Sciences", "cutoff": "20"},
                    {"name": "BSc Chemistry", "school": "School of Physical Sciences", "cutoff": "20"},
                    {"name": "BSc Entomology & Wildlife", "school": "School of Biological Sciences", "cutoff": "20"},
                    {"name": "BSc Agricultural Extension & Community Development", "school": "School of Agriculture", "cutoff": "22"},
                    {"name": "BSc Meteorology & Atmospheric Physics", "school": "School of Physical Sciences", "cutoff": "22"},
                    {"name": "BSc Water & Sanitation", "school": "School of Physical Sciences", "cutoff": "22"}
                ]
            },
            "Distance Education (CoDE)": {
                "cutoff_range": "Generally higher aggregate thresholds than regular admission (more accessible entry)",
                "requirements": "Provides distance learning versions of programmes from other colleges, enabling working professionals and remote students to study part-time. Study centres across all regions of Ghana. Weekend/evening classes with online components. Awards the same UCC degree upon completion.",
                "programs": [
                    {"name": "B.Ed Basic Education (Distance)", "notes": "Popular distance learning programme"},
                    {"name": "B.Ed Arts (Distance)"},
                    {"name": "B.Ed Science (Distance)"},
                    {"name": "B.Ed Social Studies (Distance)"},
                    {"name": "B.Ed Accounting (Distance)"},
                    {"name": "B.Ed Management (Distance)"},
                    {"name": "BBA/B.Com Accounting (Distance)"},
                    {"name": "BBA/B.Com Human Resource Management (Distance)"},
                    {"name": "BBA/B.Com Marketing (Distance)"},
                    {"name": "BBA/B.Com Finance (Distance)"},
                    {"name": "BA Social Sciences (Distance)"},
                    {"name": "BA Communication Studies (Distance)"},
                    {"name": "BSc Computer Science (Distance)"},
                    {"name": "BSc Information Technology (Distance)"},
                    {"name": "BSc Mathematics (Distance)"}
                ]
            }
        },
        "fees": {
            "ghanaian_students": {
                "Humanities/Arts/Education (Non-Resident)": "~GH¢ 1,300-2,400",
                "Social Sciences/Business/Economics (Non-Resident)": "~GH¢ 1,500-2,500",
                "Sciences/Agriculture (Non-Resident)": "~GH¢ 1,600-3,000",
                "Health Sciences - Nursing/Allied Health (Non-Resident)": "~GH¢ 2,500-3,500+",
                "Health Sciences - Medicine/Pharmacy (Non-Resident)": "~GH¢ 3,000-4,000+",
                "Distance Education": "Varies by programme"
            },
            "payment_policy": "Minimum Payment (1st Semester): typically at least 50% of fees before registration. Full Payment (2nd Semester): 100% before registration. Fee amount confirmed via the admission letter (freshmen) or Student Portal (continuing students). Residential students pay additional accommodation fees on top of tuition.",
            "official_fee_portal": "https://portal.ucc.edu.gh",
            "international_students": "Fees are higher and typically quoted in USD equivalents; they vary significantly by programme and college. Contact the International Programmes Office for exact amounts."
        },
        "scholarships": {
            "teacher_training": "Government scholarships for teacher trainees",
            "excellence_awards": "Merit-based scholarships for outstanding students",
            "need_based": "Financial support for disadvantaged students",
            "distance_education_scholarship": "Scholarships for distance education students"
        }
    },

    # ========================================================================
    # OTHER UNIVERSITIES (Preserved from original)
    # ========================================================================
    "University for Development Studies": {
        "location": "Tamale, Northern Region",
        "established": "1992",
        "website": "www.uds.edu.gh",
        "type": "Public",
        "programs": {
            "Agriculture": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Maths, Science subjects",
                "career_prospects": "Agricultural Officer, Farm Manager",
            },
            "Medicine": {
                "duration": "6 years",
                "requirements": "WASSCE: A1-B3 in Biology, Chemistry, Physics, Maths, English",
                "career_prospects": "Medical Doctor, Healthcare Professional",
            },
            "Development Studies": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Maths + Social Science subjects",
                "career_prospects": "Development Worker, Policy Analyst",
            },
            "Agricultural Engineering": {
                "duration": "4 years",
                "requirements": "WASSCE: A1-C6 in Maths, Physics, Chemistry + English",
                "career_prospects": "Agricultural Engineer, Irrigation Specialist",
            },
        },
        "admission_requirements": {
            "general": "WASSCE with relevant subject combinations",
            "application_deadline": "September 30, 2026",
            "online_portal": "https://admissions.uds.edu.gh",
        },
        "contact": {"phone": "+233-37-209-3541", "email": "admissions@uds.edu.gh"},
        "scholarships": {
            "rural_development": "Scholarships for students from rural communities",
            "northern_scholarship": "Special support for Northern Ghana students",
        },
    },
    "University of Energy and Natural Resources": {
        "location": "Sunyani, Bono Region",
        "established": "2011",
        "website": "www.uenr.edu.gh",
        "type": "Public",
        "programs": {
            "Renewable Energy Engineering": {
                "duration": "4 years",
                "requirements": "WASSCE: A1-C6 in Maths, Physics, Chemistry, English",
                "career_prospects": "Energy Engineer, Renewable Energy Specialist",
            },
            "Environmental Science": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in Maths, Biology, Chemistry, English",
                "career_prospects": "Environmental Scientist, Conservation Officer",
            },
            "Forest Resources Management": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in Maths, Biology/Agriculture, English",
                "career_prospects": "Forestry Officer, Wildlife Conservationist",
            },
        },
        "admission_requirements": {
            "general": "WASSCE with 6 credits including English, Maths, and Science subjects",
            "application_deadline": "August 31, 2026",
            "online_portal": "https://admissions.uenr.edu.gh",
        },
        "contact": {"phone": "+233-35-206-2108", "email": "admissions@uenr.edu.gh"},
        "scholarships": {"energy_scholarship": "For students in energy-related programs"},
    },
    "University of Education, Winneba": {
        "location": "Winneba, Central Region",
        "established": "1992",
        "website": "www.uew.edu.gh",
        "type": "Public",
        "programs": {
            "Basic Education": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Maths + relevant subjects",
                "career_prospects": "Primary School Teacher, Education Administrator",
            },
            "Science Education": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Maths, Science subjects",
                "career_prospects": "Science Teacher, STEM Educator",
            },
            "Physical Education": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Maths + Sports aptitude",
                "career_prospects": "PE Teacher, Sports Coach",
            },
            "Business Education": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Maths, Business subjects",
                "career_prospects": "Business Teacher, Vocational Trainer",
            },
        },
        "admission_requirements": {
            "general": "WASSCE with 6 credits including English and Maths",
            "application_deadline": "September 10, 2026",
            "online_portal": "https://admissions.uew.edu.gh",
        },
        "contact": {"phone": "+233-23-202-6660", "email": "admissions@uew.edu.gh"},
        "scholarships": {"teacher_training": "Government scholarships for teacher trainees"},
    },
    "University of Mines and Technology": {
        "location": "Tarkwa, Western Region",
        "established": "2004",
        "website": "www.umat.edu.gh",
        "type": "Public",
        "programs": {
            "Mining Engineering": {
                "duration": "4 years",
                "requirements": "WASSCE: A1-C6 in Maths, Physics, Chemistry, English",
                "career_prospects": "Mining Engineer, Resources Manager",
            },
            "Geological Engineering": {
                "duration": "4 years",
                "requirements": "WASSCE: A1-C6 in Maths, Physics, Chemistry, English",
                "career_prospects": "Geologist, Mining Consultant",
            },
            "Environmental Engineering": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in Maths, Chemistry, Biology, English",
                "career_prospects": "Environmental Engineer, Sustainability Specialist",
            },
            "Computer Science": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in Maths, Physics, English",
                "career_prospects": "Software Developer, IT Specialist",
            },
        },
        "admission_requirements": {
            "general": "WASSCE with 6 credits including English, Maths, and Science subjects",
            "application_deadline": "August 31, 2026",
            "online_portal": "https://admissions.umat.edu.gh",
        },
        "contact": {"phone": "+233-31-209-2072", "email": "admissions@umat.edu.gh"},
        "scholarships": {"mining_scholarship": "For students in mining-related programs"},
    },
    "University of Health and Allied Sciences": {
        "location": "Ho, Volta Region",
        "established": "2011",
        "website": "www.uhas.edu.gh",
        "type": "Public",
        "programs": {
            "Medicine": {
                "duration": "6 years",
                "requirements": "WASSCE: A1-B3 in Biology, Chemistry, Physics, Maths, English",
                "career_prospects": "Medical Doctor, Surgeon",
            },
            "Nursing": {
                "duration": "4 years",
                "requirements": "WASSCE: A1-C6 in English, Maths, Biology, Chemistry",
                "career_prospects": "Registered Nurse, Healthcare Provider",
            },
            "Public Health": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Maths, Biology, Chemistry",
                "career_prospects": "Public Health Officer, Epidemiologist",
            },
            "Physician Assistant Studies": {
                "duration": "4 years",
                "requirements": "WASSCE: A1-C6 in Biology, Chemistry, English, Maths",
                "career_prospects": "Physician Assistant, Medical Professional",
            },
            "Biomedical Sciences": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in Biology, Chemistry, Maths, English",
                "career_prospects": "Biomedical Scientist, Lab Specialist",
            },
        },
        "admission_requirements": {
            "general": "WASSCE with strong performance in science subjects",
            "entrance_exam": "Required for Medicine and competitive programs",
            "application_deadline": "August 14, 2026",
            "online_portal": "https://admissions.uhas.edu.gh",
            "application_fee": "GH¢ 230"
        },
        "contact": {"phone": "+233-36-202-1401", "email": "admissions@uhas.edu.gh"},
        "scholarships": {
            "health_professional": "For outstanding health sciences students",
            "rural_health": "For students committed to rural healthcare",
        },
    },
    "Ghana Communication Technology University": {
        "location": "Accra, Greater Accra",
        "established": "2005",
        "website": "www.gctu.edu.gh",
        "type": "Public",
        "programs": {
            "Computer Science": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in Maths, Physics/ICT, English",
                "career_prospects": "Software Developer, Systems Analyst",
            },
            "Information Technology": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in Maths, ICT, English",
                "career_prospects": "IT Specialist, Network Engineer",
            },
            "Telecommunications Engineering": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in Maths, Physics, Chemistry, English",
                "career_prospects": "Telecom Engineer, ICT Consultant",
            },
            "Communication Studies": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Maths + relevant subjects",
                "career_prospects": "Journalist, Media Specialist",
            },
        },
        "admission_requirements": {
            "general": "WASSCE with 6 credits including English and Maths",
            "application_deadline": "August 31, 2026",
            "online_portal": "https://admissions.gctu.edu.gh",
            "application_fee": "GH¢ 250",
            "study_options": "Day, Evening, Weekend"
        },
        "contact": {"phone": "+233-30-295-4900", "email": "admissions@gctu.edu.gh"},
        "scholarships": {"ict_scholarship": "For outstanding ICT students"},
    },
    "Takoradi Technical University": {
        "location": "Takoradi, Western Region",
        "established": "1954",
        "website": "www.ttu.edu.gh",
        "type": "Public",
        "programs": {
            "Mechanical Engineering Technology": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in Maths, Physics, Chemistry, English",
                "career_prospects": "Mechanical Technologist, Manufacturing Specialist",
            },
            "Civil Engineering Technology": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in Maths, Physics, Chemistry, English",
                "career_prospects": "Civil Technologist, Construction Manager",
            },
            "Electrical Engineering Technology": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in Maths, Physics, Chemistry, English",
                "career_prospects": "Electrical Technologist, Power Systems Specialist",
            },
            "Petroleum Engineering": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in Maths, Physics, Chemistry, English",
                "career_prospects": "Petroleum Engineer, Energy Consultant",
            },
            "Hospitality Management": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Maths + Home Economics",
                "career_prospects": "Hotel Manager, Catering Professional",
            },
        },
        "admission_requirements": {
            "general": "WASSCE with 6 credits including English and Maths",
            "application_deadline": "October 31, 2026",
            "online_portal": "https://admissions.ttu.edu.gh",
        },
        "contact": {"phone": "+233-31-202-3490", "email": "admissions@ttu.edu.gh"},
        "scholarships": {"technical_scholarship": "For outstanding technical program students"},
    },
    "University of Professional Studies, Accra": {
        "location": "Accra, Greater Accra",
        "established": "1965",
        "website": "www.upsa.edu.gh",
        "type": "Public",
        "programs": {
            "Accounting": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Maths, Economics + 3 others",
                "career_prospects": "Accountant, Auditor, Financial Analyst",
            },
            "Marketing": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Maths, Economics/Business",
                "career_prospects": "Marketing Manager, Brand Specialist",
            },
            "Banking and Finance": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Maths, Economics",
                "career_prospects": "Banker, Financial Advisor",
            },
            "Human Resource Management": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Maths + relevant subjects",
                "career_prospects": "HR Manager, Recruitment Specialist",
            },
            "Public Administration": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Maths + Social Sciences",
                "career_prospects": "Public Servant, Administrator",
            },
        },
        "admission_requirements": {
            "general": "WASSCE with 6 credits including English and Maths",
            "application_deadline": "August 21, 2026",
            "online_portal": "https://admissions.upsa.edu.gh",
        },
        "contact": {"phone": "+233-30-298-1000", "email": "admissions@upsa.edu.gh"},
        "scholarships": {
            "professional_excellence": "Merit-based scholarships for top performers",
            "need_based": "Financial support for disadvantaged students",
        },
    },
}


# ============================================================================
# UNI_NAME_VARIATIONS - COMPLETE
# ============================================================================

UNI_NAME_VARIATIONS = {
    # University of Ghana
    "university of ghana": "University of Ghana",
    "ug": "University of Ghana",
    "legon": "University of Ghana",
    "ug legon": "University of Ghana",
    # KNUST
    "knust": "Kwame Nkrumah University of Science and Technology",
    "kwame nkrumah": "Kwame Nkrumah University of Science and Technology",
    "kwame nkrumah university": "Kwame Nkrumah University of Science and Technology",
    "kumasi": "Kwame Nkrumah University of Science and Technology",
    "nkrumah": "Kwame Nkrumah University of Science and Technology",
    # UCC
    "ucc": "University of Cape Coast",
    "cape coast": "University of Cape Coast",
    "university of cape coast": "University of Cape Coast",
    # UDS
    "uds": "University for Development Studies",
    "tamale": "University for Development Studies",
    "university for development studies": "University for Development Studies",
    # UENR
    "uenr": "University of Energy and Natural Resources",
    "sunyani": "University of Energy and Natural Resources",
    "energy and natural resources": "University of Energy and Natural Resources",
    # UHAS
    "uhas": "University of Health and Allied Sciences",
    "ho": "University of Health and Allied Sciences",
    "health and allied sciences": "University of Health and Allied Sciences",
    # GCTU
    "gctu": "Ghana Communication Technology University",
    "communication technology": "Ghana Communication Technology University",
    "gctu university": "Ghana Communication Technology University",
    # UEW
    "uew": "University of Education, Winneba",
    "winneba": "University of Education, Winneba",
    "university of education": "University of Education, Winneba",
    # UMAT
    "umat": "University of Mines and Technology",
    "tarkwa": "University of Mines and Technology",
    "mines and technology": "University of Mines and Technology",
    # UPSA
    "upsa": "University of Professional Studies, Accra",
    "professional studies": "University of Professional Studies, Accra",
    # TTU
    "ttu": "Takoradi Technical University",
    "takoradi": "Takoradi Technical University",
    "takoradi technical": "Takoradi Technical University",
    # Others
    "gimpa": "Ghana Institute of Management and Public Administration",
    "ashesi": "Ashesi University",
    "berekuso": "Ashesi University",
    "gtuc": "Ghana Technology University College",
    "central": "Central University",
    "valley view": "Valley View University",
    "presbyterian": "Presbyterian University",
    "methodist": "Methodist University",
    "academic city": "Academic City University",
}


# ============================================================================
# ENHANCED HELPER FUNCTIONS
# ============================================================================

def search_programs_by_criteria(query: str, university_kb: Any) -> List[Dict[str, Any]]:
    """
    Search for programs matching specific criteria in the query.
    This is used to find specific programs when the user asks about them.
    """
    query_lower = query.lower()
    results = []
    
    # Check if query mentions a specific program type
    program_keywords = {
        "engineering": ["BSc", "Engineering"],
        "medicine": ["MBChB", "MB ChB", "Medicine", "Medical"],
        "nursing": ["BSc Nursing", "Nursing"],
        "law": ["LLB", "Law"],
        "business": ["BSc Administration", "BBA", "Business", "Accounting", "Finance"],
        "computer": ["BSc Computer Science", "Information Technology", "Computer Engineering"],
        "pharmacy": ["PharmD", "Pharmacy"],
        "education": ["B.Ed", "Education"],
        "agriculture": ["BSc Agriculture", "Agribusiness"],
        "dentistry": ["BDS", "Dental Surgery"],
        "allied_health": ["Medical Laboratory", "Physiotherapy", "Optometry", "Radiography", "Dietetics"]
    }
    
    # Find matching program type
    matched_type = None
    for prog_type, keywords in program_keywords.items():
        if any(kw.lower() in query_lower for kw in keywords):
            matched_type = prog_type
            break
    
    if matched_type:
        # Search for programs of this type across all universities
        for uni_name, uni_data in university_kb.universities.items():
            # Check if university has 'colleges' structure (KNUST, UG, UCC)
            if "colleges" in uni_data:
                for college_name, college_data in uni_data.get("colleges", {}).items():
                    for prog in college_data.get("programs", []):
                        if isinstance(prog, dict):
                            prog_name = prog.get("name", "")
                            if any(kw.lower() in prog_name.lower() for kw in program_keywords.get(matched_type, [])):
                                results.append({
                                    "university": uni_name,
                                    "college": college_name,
                                    "program": prog_name,
                                    "cutoff": prog.get("cutoff", "N/A"),
                                    "duration": prog.get("duration", "4 years"),
                                    "requirements": prog.get("requirements", ""),
                                    "first_choice": prog.get("first_choice", "No"),
                                    "entrance_exam": prog.get("entrance_exam", "No")
                                })
            # Check if university has 'programs' structure (other universities)
            elif "programs" in uni_data:
                for prog_name, prog_data in uni_data.get("programs", {}).items():
                    if isinstance(prog_data, dict):
                        if any(kw.lower() in prog_name.lower() for kw in program_keywords.get(matched_type, [])):
                            results.append({
                                "university": uni_name,
                                "program": prog_name,
                                "cutoff": prog_data.get("requirements", ""),
                                "duration": prog_data.get("duration", "4 years"),
                                "requirements": prog_data.get("requirements", ""),
                            })
    
    return results[:10]


def find_programs_by_cutoff(aggregate: int, university_kb: Any, within_range: int = 3) -> List[Dict[str, Any]]:
    """
    Find programs that match a given aggregate score.
    """
    results = []
    
    for uni_name, uni_data in university_kb.universities.items():
        # Check if university has 'colleges' structure
        if "colleges" in uni_data:
            for college_name, college_data in uni_data.get("colleges", {}).items():
                for prog in college_data.get("programs", []):
                    if isinstance(prog, dict):
                        cutoff_str = prog.get("cutoff", "")
                        if cutoff_str:
                            # Parse cutoff ranges like "10-14" or "6-10"
                            match = re.search(r'(\d+)\s*[-–]\s*(\d+)', str(cutoff_str))
                            if match:
                                low = int(match.group(1))
                                high = int(match.group(2))
                                if low - within_range <= aggregate <= high + within_range:
                                    results.append({
                                        "university": uni_name,
                                        "college": college_name,
                                        "program": prog.get("name", ""),
                                        "cutoff": cutoff_str,
                                        "duration": prog.get("duration", "4 years"),
                                        "requirements": prog.get("requirements", ""),
                                        "first_choice": prog.get("first_choice", "No"),
                                        "match_type": "range_match"
                                    })
                            else:
                                # Try single number
                                match = re.search(r'(\d+)', str(cutoff_str))
                                if match:
                                    cutoff_num = int(match.group(1))
                                    if abs(cutoff_num - aggregate) <= within_range:
                                        results.append({
                                            "university": uni_name,
                                            "college": college_name,
                                            "program": prog.get("name", ""),
                                            "cutoff": cutoff_str,
                                            "duration": prog.get("duration", "4 years"),
                                            "requirements": prog.get("requirements", ""),
                                            "first_choice": prog.get("first_choice", "No"),
                                            "match_type": "exact_match"
                                        })
    
    return sorted(results, key=lambda x: int(re.search(r'(\d+)', str(x["cutoff"])).group(1)) if re.search(r'(\d+)', str(x["cutoff"])) else 999)[:10]


# ============================================================================
# ORIGINAL FUNCTIONS (Preserved)
# ============================================================================

async def initialize_services():
    global embedding_model, groq_client, db_client, GHANA_UNIVERSITIES_KNOWLEDGE

    print(" Initializing Glinax RAG+CAG Services...")

    try:
        groq_api_key = os.getenv("GROQ_API_KEY")
        if groq_api_key:
            try:
                groq_client = AsyncGroq(api_key=groq_api_key)
                print(" Groq client initialized")
            except Exception as groq_error:
                print(f" Groq client initialization failed: {groq_error}")
                groq_client = None
        else:
            print(" GROQ_API_KEY not found, will use fallback responses")

        mongodb_uri = os.getenv("MONGODB_URI")
        if mongodb_uri:
            try:
                db_client = motor.motor_asyncio.AsyncIOMotorClient(mongodb_uri)
                await db_client.admin.command("ping")
                print(" MongoDB connected successfully")
                await seed_and_load_universities()
            except Exception as mongo_error:
                print(f" MongoDB connection failed: {mongo_error}")
                db_client = None
        else:
            print(" MongoDB URI not found — using hardcoded knowledge base")

        print(" Services initialization complete")

    except Exception as e:
        print(f" Critical service initialization error: {e}")
        raise


async def seed_and_load_universities():
    global GHANA_UNIVERSITIES_KNOWLEDGE
    db = db_client[os.getenv("DB_NAME", "glinax_chatbot_db")]
    col = db["universities_knowledge"]

    if await col.count_documents({}) == 0:
        docs = [
            {"name": name, **data} for name, data in GHANA_UNIVERSITIES_KNOWLEDGE.items()
        ]
        await col.insert_many(docs)
        print(f" Seeded {len(docs)} universities into MongoDB")
    else:
        print(" Universities collection already seeded; skipping overwrite.")

    cursor = col.find({})
    loaded = {}
    async for doc in cursor:
        name = doc.pop("name", None)
        doc.pop("_id", None)
        if name:
            loaded[name] = doc
    
    if loaded:
        GHANA_UNIVERSITIES_KNOWLEDGE = loaded
        print(f" University knowledge base loaded from MongoDB ({len(loaded)} entries)")


def build_university_context(uni_name: str, uni_data: Dict[str, Any]) -> str:
    """Build comprehensive context from university data."""
    current_year = datetime.now().year
    
    admission = uni_data.get("admission_requirements", {})
    contact = uni_data.get("contact", {})
    fees = uni_data.get("fees", {})
    colleges = uni_data.get("colleges", {})
    programs = uni_data.get("programs", {})
    scholarships = uni_data.get("scholarships", {})
    
    # Build college and program information
    college_sections = []
    if colleges:
        for college_name, college_data in colleges.items():
            if not college_data or not isinstance(college_data, dict):
                continue
            
            college_cutoff = college_data.get("cutoff_range", "")
            prog_list = college_data.get("programs", [])
            college_reqs = college_data.get("requirements", "")
            college_notes = college_data.get("notes", "")
            
            # Build program list for this college
            prog_lines = []
            for prog in prog_list:
                if isinstance(prog, dict):
                    prog_name = prog.get("name", "")
                    cutoff = prog.get("cutoff", "")
                    duration = prog.get("duration", "")
                    school = prog.get("school", "")
                    reqs = prog.get("requirements", "")
                    electives = prog.get("electives", "")
                    campuses = prog.get("campuses", "")
                    backgrounds = prog.get("backgrounds", "")
                    notes = prog.get("notes", "")
                    first_choice = prog.get("first_choice", "")
                    entrance_exam = prog.get("entrance_exam", "")

                    parts = [f"  - **{prog_name}**"]
                    if school:
                        parts.append(f"School/Dept: {school}")
                    if cutoff:
                        parts.append(f"Cut-off: {cutoff}")
                    if duration:
                        parts.append(f"Duration: {duration}")
                    if electives:
                        parts.append(f"Electives: {electives}")
                    if reqs:
                        parts.append(f"Requirements: {reqs}")
                    if backgrounds:
                        parts.append(f"Accepted backgrounds: {backgrounds}")
                    if campuses:
                        parts.append(f"Campus: {campuses}")
                    if notes:
                        parts.append(f"Note: {notes}")
                    if first_choice == "Yes":
                        parts.append("⚠️ FIRST CHOICE ONLY")
                    if entrance_exam and entrance_exam not in ("No",):
                        exam_note = "📝 Entrance Exam Required" if entrance_exam == "Yes" else f"📝 Entrance Exam: {entrance_exam}"
                        parts.append(exam_note)
                    prog_lines.append(" | ".join(parts))
                else:
                    prog_lines.append(f"  - {prog}")
            
            if prog_lines:
                req_line = f"**Requirements:** {college_reqs}" if college_reqs else ""
                notes_line = f"**Note:** {college_notes}" if college_notes else ""
                college_sections.append(f"""
### {college_name}
**Cut-off Range:** {college_cutoff if college_cutoff else 'Varies by programme'}
{req_line}
{notes_line}

**Programmes:**
{chr(10).join(prog_lines)}
""")
    
    # Build program information for universities without colleges
    if not colleges and programs:
        prog_lines = []
        for prog_name, prog_data in programs.items():
            if isinstance(prog_data, dict):
                parts = [f"  - **{prog_name}**"]
                if "duration" in prog_data:
                    parts.append(f"Duration: {prog_data['duration']}")
                if "requirements" in prog_data:
                    parts.append(f"Requirements: {prog_data['requirements']}")
                if "career_prospects" in prog_data:
                    parts.append(f"Careers: {prog_data['career_prospects']}")
                prog_lines.append(" | ".join(parts))
            else:
                prog_lines.append(f"  - {prog_name}")
        
        if prog_lines:
            college_sections.append(f"""
### Programmes Offered
{chr(10).join(prog_lines)}
""")
    
    # Build deadlines
    deadline_lines = []
    deadline_keys = ["application_deadline", "closing_date", "submission_deadline", "application_opens", "application_closes"]
    for key in deadline_keys:
        val = admission.get(key, "")
        if val:
            deadline_lines.append(f"  - {key.replace('_', ' ').title()}: {val}")
    
    # Build fee information
    fee_lines = []
    ghana_fees = fees.get("ghanaian_students", {})
    if ghana_fees:
        for category, amount in ghana_fees.items():
            if isinstance(amount, str):
                fee_lines.append(f"  - {category}: {amount}")
    
    # Build mandatory levies
    mandatory_levies = fees.get("mandatory_levies", {})
    if mandatory_levies:
        fee_lines.append("  - **Mandatory Levies:**")
        for levy, amount in mandatory_levies.items():
            fee_lines.append(f"    - {levy}: {amount}")
    
    # Build scholarship information
    scholarship_lines = []
    for key, val in scholarships.items():
        if val:
            scholarship_lines.append(f"  - {key.replace('_', ' ').title()}: {val}")
    
    # Build contact information
    contact_lines = []
    if contact.get("phone"):
        contact_lines.append(f"  - Phone: {contact['phone']}")
    if contact.get("email"):
        contact_lines.append(f"  - Email: {contact['email']}")
    if contact.get("address"):
        contact_lines.append(f"  - Address: {contact['address']}")
    if contact.get("whatsapp"):
        contact_lines.append(f"  - WhatsApp: {contact['whatsapp']}")
    
    overview = uni_data.get("overview", "")

    context = f"""
# {uni_name}

**Location:** {uni_data.get('location', 'Ghana')}
**Established:** {uni_data.get('established', 'N/A')}
**Type:** {uni_data.get('type', 'Public')}
**Website:** {uni_data.get('website', 'N/A')}
{f'**Overview:** {overview}' if overview else ''}

## Admission Requirements
- **General:** {admission.get('general', 'WASSCE with minimum credits')[:600] if admission.get('general') else 'WASSCE with minimum credits'}
- **Application Deadline:** {admission.get('application_deadline', 'Check university website')}
- **Application Fee:** {admission.get('application_fee', 'Contact university')}
- **Entrance Exam:** {admission.get('entrance_exam', 'Not specified')}
- **Online Portal:** {admission.get('online_portal', uni_data.get('website', ''))}
{chr(10).join([f'  - {key.replace("_", " ").title()}: {val}' for key, val in admission.items() if key not in ["general", "application_deadline", "application_fee", "entrance_exam", "online_portal"] and val])}

{''.join(college_sections)}

## Application Deadlines
{chr(10).join(deadline_lines) if deadline_lines else '  - Check university website'}

## Fees ({current_year})
{chr(10).join(fee_lines) if fee_lines else '  - Contact university for current rates'}

**Payment Policy:** {fees.get('payment_policy', 'Contact university for payment details')}

## Scholarships
{chr(10).join(scholarship_lines) if scholarship_lines else '  - Contact university for scholarship information'}

## Contact Information
{chr(10).join(contact_lines) if contact_lines else '  - Contact university directly'}

---
**Note:** Cut-off points change annually. Meeting minimum cut-offs does NOT guarantee admission. Always verify current information on the official university website.
"""
    return context


# ============================================================================
# ENHANCED KNOWLEDGE BASE CLASS
# ============================================================================

class EnhancedUniversityKnowledgeBase:
    """Enhanced knowledge base with search and retrieval capabilities."""
    
    def __init__(self):
        self.universities: Dict[str, Dict[str, Any]] = {}
        self.name_variations: Dict[str, str] = {}
        self.program_index: Dict[str, List[Tuple[str, str]]] = {}
        self.keyword_index: Dict[str, Set[str]] = {}
        self.cutoff_index: Dict[int, List[Tuple[str, str, str]]] = {}
        
        # Load from hardcoded data
        self._load_hardcoded_data()
        
        # Build indexes
        self._build_indexes()
        
        print(f"✅ Knowledge Base loaded: {len(self.universities)} universities")
        print(f"   - {len(self.program_index)} unique programs indexed")
        print(f"   - {len(self.keyword_index)} keywords indexed")
        print(f"   - Cut-off points indexed for {len(self.cutoff_index)} aggregate values")
    
    def _load_hardcoded_data(self):
        """Load from the GHANA_UNIVERSITIES_KNOWLEDGE."""
        global GHANA_UNIVERSITIES_KNOWLEDGE
        
        for uni_name, data in GHANA_UNIVERSITIES_KNOWLEDGE.items():
            self.universities[uni_name] = data.copy()
            self._add_name_variations(uni_name)
    
    def _add_name_variations(self, uni_name: str):
        """Add name variations for a university."""
        global UNI_NAME_VARIATIONS
        
        for key, value in UNI_NAME_VARIATIONS.items():
            if value == uni_name:
                self.name_variations[key] = uni_name
        
        self.name_variations[uni_name.lower()] = uni_name
        
        # Add short version
        if "University of" in uni_name:
            short = uni_name.replace("University of", "").strip()
            if short and short not in self.name_variations:
                self.name_variations[short.lower()] = uni_name
    
    def _build_indexes(self):
        """Build comprehensive search indexes."""
        self.program_index = {}
        self.keyword_index = {}
        self.cutoff_index = {}
        
        for uni_name, data in self.universities.items():
            # Index programs from 'colleges' structure
            if "colleges" in data:
                for college_name, college_data in data["colleges"].items():
                    for prog in college_data.get("programs", []):
                        if isinstance(prog, dict):
                            prog_name = prog.get("name", "")
                            self._index_program(uni_name, prog_name, prog)
                            self._index_cutoff(uni_name, prog_name, prog)
            
            # Index programs from 'programs' structure
            if "programs" in data:
                for prog_name, prog_data in data["programs"].items():
                    self._index_program(uni_name, prog_name, prog_data)
                    self._index_cutoff(uni_name, prog_name, prog_data)
    
    def _index_program(self, uni_name: str, prog_name: str, prog_data: Any):
        """Index a program for search."""
        if prog_name not in self.program_index:
            self.program_index[prog_name] = []
        self.program_index[prog_name].append((uni_name, prog_data))
        
        # Index keywords
        text = f"{prog_name} {json.dumps(prog_data)}".lower()
        keywords = self._extract_keywords(text)
        for keyword in keywords:
            if keyword not in self.keyword_index:
                self.keyword_index[keyword] = set()
            self.keyword_index[keyword].add(uni_name)
    
    def _index_cutoff(self, uni_name: str, prog_name: str, prog_data: Any):
        """Index cut-off points for a program."""
        if isinstance(prog_data, dict):
            cutoff = prog_data.get("cutoff", "")
            if cutoff:
                try:
                    numbers = re.findall(r'(\d+)', str(cutoff))
                    for num in numbers:
                        agg = int(num)
                        if agg not in self.cutoff_index:
                            self.cutoff_index[agg] = []
                        self.cutoff_index[agg].append((uni_name, prog_name, cutoff))
                except (ValueError, AttributeError):
                    pass
    
    def _extract_keywords(self, text: str) -> List[str]:
        """Extract meaningful keywords from text."""
        stopwords = {'the', 'a', 'an', 'and', 'or', 'but', 'for', 'on', 'at', 'to', 'in', 'of', 'with', 'by', 'from', 'be', 'is', 'are', 'was', 'were'}
        words = re.findall(r'[a-z]{3,}', text)
        return [w for w in words if w not in stopwords]
    
    def search(self, query: str, top_n: int = 5) -> List[Dict[str, Any]]:
        """Multi-strategy search with scoring."""
        query_lower = query.lower()
        query_words = set(self._extract_keywords(query_lower))
        
        scored = {}
        name_matched_universities = set()
        
        # Strategy 1: Exact university name match (word-boundary match, not a raw
        # substring check - short abbreviations like "ug" or "ho" would otherwise
        # false-positive inside ordinary words like "though" or "how")
        for variation, uni_name in self.name_variations.items():
            if re.search(r'\b' + re.escape(variation) + r'\b', query_lower):
                if uni_name not in scored:
                    scored[uni_name] = 0
                scored[uni_name] += 5.0
                name_matched_universities.add(uni_name)
        
        # Strategy 2: Program name match
        for prog_name, universities in self.program_index.items():
            if prog_name.lower() in query_lower or any(word in prog_name.lower() for word in query_words):
                for uni_name, prog_data in universities:
                    if uni_name not in scored:
                        scored[uni_name] = 0
                    scored[uni_name] += 4.0
        
        # Strategy 3: Keyword overlap
        for keyword, universities in self.keyword_index.items():
            if keyword in query_words:
                for uni_name in universities:
                    if uni_name not in scored:
                        scored[uni_name] = 0
                    scored[uni_name] += 1.0
        
        # Strategy 4: Cut-off point matching
        if any(word in query_lower for word in ["cut-off", "cutoff", "aggregate", "grade"]):
            agg_match = re.search(r'aggregate\s*(\d+)', query_lower)
            if agg_match:
                agg = int(agg_match.group(1))
                for cutoff_agg, programs in self.cutoff_index.items():
                    if abs(cutoff_agg - agg) <= 5:
                        for uni_name, prog_name, cutoff in programs:
                            if uni_name not in scored:
                                scored[uni_name] = 0
                            scored[uni_name] += 3.0
        
        # If the query explicitly names one or more universities, don't let
        # generic keyword overlap from unrelated universities dilute or crowd
        # out the results - scope the results down to just the named
        # university/universities, since that's a far stronger signal than a
        # shared word like "science" or "programme".
        if name_matched_universities:
            scored = {uni: s for uni, s in scored.items() if uni in name_matched_universities}
        
        # Sort by score
        sorted_results = sorted(scored.items(), key=lambda x: x[1], reverse=True)
        
        results = []
        for uni_name, score in sorted_results[:top_n]:
            if score > 0:
                data = self.universities.get(uni_name, {})
                results.append({
                    "source": uni_name,
                    "data": data,
                    "relevance": min(score / 10.0, 0.95),
                    "raw_content": data.get("raw_content", ""),
                    "matched_programs": self._find_matching_programs(query_lower, uni_name)
                })
        
        return results
    
    def _find_matching_programs(self, query: str, uni_name: str) -> List[str]:
        """Find programs within a university that match the query. Uses filtered
        keywords (3+ letters, stopwords removed) matched against a program's real
        text fields - not a raw substring check against the program's whole JSON
        dump, which used to false-match almost anything (e.g. the word "at"
        matching inside "Geomatic Engineering", or a JSON key like "cutoff")."""
        matches = []
        data = self.universities.get(uni_name, {})
        query_words = set(self._extract_keywords(query))
        if not query_words:
            return matches

        def text_matches(text: str) -> bool:
            return bool(query_words & set(self._extract_keywords(text.lower())))

        # Search in colleges
        if "colleges" in data:
            for college_name, college_data in data["colleges"].items():
                for prog in college_data.get("programs", []):
                    if isinstance(prog, dict):
                        prog_name = prog.get("name", "")
                        # A shared keyword with the program's actual NAME is a strong,
                        # reliable signal. A shared keyword with the secondary fields
                        # (electives/requirements/etc.) is much noisier - domain-generic
                        # words like "science" show up in nearly every programme's
                        # requirements text (e.g. "Integrated Science"), so require at
                        # least two shared keywords there to avoid one generic word
                        # matching almost everything.
                        name_overlap = query_words & set(self._extract_keywords(prog_name.lower()))
                        other_text = " ".join(str(prog.get(f, "")) for f in
                                               ("school", "electives", "requirements", "backgrounds"))
                        other_overlap = query_words & set(self._extract_keywords(other_text.lower()))
                        if name_overlap or len(other_overlap) >= 2:
                            matches.append(prog_name)
        
        # Search in programs
        if "programs" in data:
            for prog_name, prog_data in data["programs"].items():
                if text_matches(prog_name):
                    matches.append(prog_name)
        
        return matches[:5]
    
    def get_university(self, name: str) -> Optional[Dict[str, Any]]:
        """Get university data by name with variation matching."""
        name_lower = name.lower()
        if name_lower in self.name_variations:
            return self.universities.get(self.name_variations[name_lower])
        return self.universities.get(name)


# ============================================================================
# ENHANCED SEARCH FUNCTION
# ============================================================================

# Initialize knowledge base
university_kb = EnhancedUniversityKnowledgeBase()


def search_local_knowledge(query: str, university_name: str = None) -> Dict[str, Any]:
    """Enhanced search using the knowledge base."""
    
    if university_name:
        uni_data = university_kb.get_university(university_name)
        if uni_data:
            return {
                "results": [{
                    "source": university_name,
                    "data": uni_data,
                    "relevance": 0.95,
                    "raw_content": uni_data.get("raw_content", ""),
                    "matched_programs": []
                }],
                "confidence": 0.95
            }
    
    results = university_kb.search(query)
    
    # Check for cut-off based queries
    agg_match = re.search(r'aggregate\s*(\d+)', query.lower())
    if agg_match and results:
        aggregate = int(agg_match.group(1))
        program_matches = find_programs_by_cutoff(aggregate, university_kb)
        if program_matches:
            for match in program_matches[:5]:
                uni_data = university_kb.get_university(match["university"])
                if uni_data:
                    results.append({
                        "source": match["university"],
                        "data": uni_data,
                        "relevance": 0.85,
                        "matched_program": match["program"],
                        "matched_cutoff": match["cutoff"],
                        "aggregate_match": aggregate,
                        "duration": match.get("duration", ""),
                        "first_choice": match.get("first_choice", "")
                    })
    
    # Check for program type queries
    if not results or results[0].get("relevance", 0) < 0.5:
        program_results = search_programs_by_criteria(query, university_kb)
        for pr in program_results[:3]:
            uni_data = university_kb.get_university(pr["university"])
            if uni_data and not any(r.get("source") == pr["university"] for r in results):
                results.append({
                    "source": pr["university"],
                    "data": uni_data,
                    "relevance": 0.7,
                    "matched_program": pr["program"],
                    "matched_cutoff": pr.get("cutoff", ""),
                    "duration": pr.get("duration", ""),
                    "first_choice": pr.get("first_choice", "")
                })
    
    if results:
        return {
            "results": results[:5],
            "confidence": max([r.get("relevance", 0) for r in results]) if results else 0.0
        }
    
    return {"results": [], "confidence": 0.0}


# ============================================================================
# WEB SEARCH FUNCTIONS (Preserved)
# ============================================================================

async def search_web_realtime(query: str) -> Dict[str, Any]:
    try:
        serpapi_key = os.getenv("SERPAPI_KEY")
        if serpapi_key:
            return await search_with_serpapi(query, serpapi_key)

        from duckduckgo_search import DDGS

        ddgs = DDGS()
        current_year = datetime.now().year
        enhanced_query = f"{query} Ghana universities {current_year} official site"
        search_results = []
        search_items = await asyncio.to_thread(
            lambda: list(ddgs.text(enhanced_query, region="wt-wt", safesearch="moderate", max_results=8))
        )
        for search_item in search_items:
            if not isinstance(search_item, dict):
                continue
            url = search_item.get("href") or search_item.get("url") or ""
            title = search_item.get("title") or ""
            snippet = search_item.get("body") or search_item.get("snippet") or ""
            url_domain = (url or "").lower()
            source_type = (
                "official_website"
                if any(
                    d in url_domain
                    for d in [
                        "ug.edu.gh",
                        "knust.edu.gh",
                        "ucc.edu.gh",
                        "uds.edu.gh",
                        "upsa.edu.gh",
                        "uenr.edu.gh",
                        "uhas.edu.gh",
                        "gctu.edu.gh",
                        "umat.edu.gh",
                        "uew.edu.gh",
                        "ttu.edu.gh",
                    ]
                )
                else "web_search"
            )
            search_results.append(
                {
                    "title": title,
                    "url": url,
                    "snippet": snippet,
                    "source": source_type,
                    "priority": "high"
                    if source_type == "official_website"
                    else "medium",
                }
            )
        return {"results": search_results, "confidence": 0.75 if search_results else 0.0}
    except Exception as e:
        print(f" Web search error (continuing with local knowledge): {e}")
        return {"results": [], "confidence": 0.0}


async def search_with_serpapi(query: str, api_key: str) -> Dict[str, Any]:
    try:
        current_year = datetime.now().year
        enhanced_query = f"{query} Ghana universities admission {current_year} latest"

        url = "https://serpapi.com/search"
        params = {
            "engine": "google",
            "q": enhanced_query,
            "api_key": api_key,
            "num": 8,
            "location": "Ghana",
            "hl": "en",
            "gl": "gh",
        }

        response = requests.get(url, params=params, timeout=15)
        serpapi_payload = response.json()

        search_results = []
        for organic_result in serpapi_payload.get("organic_results", [])[:5]:
            url = organic_result.get("link", "")
            if any(
                domain in url.lower()
                for domain in [
                    "ug.edu.gh",
                    "knust.edu.gh",
                    "ucc.edu.gh",
                    "uds.edu.gh",
                    "upsa.edu.gh",
                ]
            ):
                search_results.append(
                    {
                        "title": organic_result.get("title", ""),
                        "url": url,
                        "snippet": organic_result.get("snippet", ""),
                        "source": "official_website",
                        "priority": "high",
                    }
                )
            else:
                search_results.append(
                    {
                        "title": organic_result.get("title", ""),
                        "url": url,
                        "snippet": organic_result.get("snippet", ""),
                        "source": "web_search",
                        "priority": "medium",
                    }
                )

        return {"results": search_results, "confidence": 0.8 if search_results else 0.0}

    except Exception as e:
        print(f" SerpAPI error: {e}")
        return {"results": [], "confidence": 0.0}


# ============================================================================
# RESPONSE GENERATION (Enhanced)
# ============================================================================

async def generate_response_with_groq(
    query: str, context: str, sources: List[Dict], user_profile: Dict = None, chat_history: List[Dict] = None
) -> str:
    """Generate response using Groq LLM."""
    try:
        if not groq_client:
            return generate_smart_fallback_response(
                query, context, sources, user_profile
            )

        current_year = datetime.now().year
        
        system_prompt = f"""You are Cerkyl — a smart, friendly, and knowledgeable AI admission counsellor built specifically for Ghanaian SHS graduates. You have access to detailed information about Ghanaian universities including programs with cut-off points, subject requirements, application deadlines, entrance exam dates, and fees.

**CRITICAL RULES - STRICTLY FOLLOW:**

1. **USE ONLY PROVIDED DATA**: Only state specific numbers, dates, or requirements if they appear in the "Available university information" section.
2. **CUT-OFF POINTS**: Provide exact cut-off points from the data. If a range is given (e.g., "10-14"), mention the range.
3. **FIRST CHOICE**: If a program is marked "FIRST CHOICE ONLY", clearly state this.
4. **ENTRANCE EXAMS**: Mention if a program requires an entrance exam.
5. **BE CONVERSATIONAL**: Answer like you're having a friendly conversation. Don't just dump raw data — explain it.
6. **BE HONEST**: If a student's aggregate doesn't meet the cut-off, say so kindly and suggest alternatives.
7. **BE CONCISE**: Answer what was asked. Don't share all information if not requested.
8. **PLAIN MARKDOWN ONLY - NO HTML**: Never output raw HTML tags such as <br>, <br/>, <table>, <tr>, <td>, <div>, <p>, <b>, <li>, etc. This chat renders Markdown, not HTML. For a line break, just start a new line. For emphasis use **bold** or *italic*. For lists use "-" or "1." For tables, use Markdown pipe tables ( | Column | Column | ) or plain bullet points instead of any HTML table tags.

**CONVERSATIONAL STYLE:**
- Use "you" and "I" naturally
- Use phrases like "That's a great question!", "Let me check that for you", "Here's what I found"
- Be encouraging and supportive
- Ask helpful follow-up questions

Current year: {current_year}"""

        # Build student profile section
        profile_section = ""
        if user_profile:
            field_labels = {
                "shs_program": "SHS Programme",
                "subjects": "Subjects Studied",
                "wassce_grade": "WASSCE Aggregate/Grade",
                "career_goal": "Career Goal",
                "interests": "Interests",
                "location_preference": "Location Preference",
                "preferred_program": "Preferred Programme",
                "budget": "Budget / Financial Situation",
                "name": "Student Name",
            }
            profile_lines = []
            for key, label in field_labels.items():
                val = user_profile.get(key)
                if val:
                    profile_lines.append(f"  - {label}: {val}")
            for key, val in user_profile.items():
                if key not in field_labels and val and key not in ("raw_context",):
                    profile_lines.append(f"  - {key.replace('_', ' ').title()}: {val}")
            if profile_lines:
                profile_section = (
                    "STUDENT PROFILE:\n" + "\n".join(profile_lines) + "\n\n"
                )

        user_message = f"""{profile_section}Student's question: {query}

Available university information:
{context}

Respond naturally and helpfully like you're having a conversation with a student. Base your answer strictly on the information provided above."""
        
        messages_array = [{"role": "system", "content": system_prompt}]
        if chat_history:
            recent_history = chat_history[-5:] if len(chat_history) > 5 else chat_history
            messages_array.extend(recent_history)
        messages_array.append({"role": "user", "content": user_message})

        chat_completion = await groq_client.chat.completions.create(
            messages=messages_array,
            model=GROQ_MODEL,
            temperature=GROQ_TEMPERATURE,
            max_completion_tokens=2048,
            reasoning_effort=GROQ_REASONING_EFFORT,
        )

        raw_response = chat_completion.choices[0].message.content
        return sanitize_markdown_urls(raw_response)

    except Exception as e:
        print(f" Groq generation error: {e}")
        return generate_smart_fallback_response(query, context, sources, user_profile)


def _find_program_detail(uni_data: Dict[str, Any], prog_name: str) -> Optional[Dict[str, Any]]:
    """Look up the full dict for a named program inside a university's colleges."""
    if "colleges" in uni_data:
        for college_name, college_data in uni_data["colleges"].items():
            for prog in college_data.get("programs", []):
                if isinstance(prog, dict) and prog.get("name") == prog_name:
                    enriched = dict(prog)
                    enriched["_college"] = college_name
                    return enriched
    return None


def _format_program_card(uni_name: str, prog: Dict[str, Any]) -> str:
    """Render one program as a detailed card."""
    lines = [f"### {prog.get('name', '')} at {uni_name}"]
    if prog.get("_college"):
        lines.append(f"**College:** {prog['_college']}")
    if prog.get("school"):
        lines.append(f"**School/Department:** {prog['school']}")
    if prog.get("cutoff"):
        lines.append(f"**Cut-off:** {prog['cutoff']}")
    if prog.get("duration"):
        lines.append(f"**Duration:** {prog['duration']}")
    if prog.get("electives"):
        lines.append(f"**Electives:** {prog['electives']}")
    if prog.get("requirements"):
        lines.append(f"**Requirements:** {prog['requirements']}")
    if prog.get("backgrounds"):
        lines.append(f"**Accepted backgrounds:** {prog['backgrounds']}")
    if prog.get("campuses"):
        lines.append(f"**Campus:** {prog['campuses']}")
    if prog.get("notes"):
        lines.append(f"**Note:** {prog['notes']}")
    if prog.get("first_choice") == "Yes":
        lines.append("⚠️ **FIRST CHOICE ONLY**")
    if prog.get("entrance_exam") and prog.get("entrance_exam") != "No":
        exam = prog["entrance_exam"]
        lines.append("📝 **Entrance Exam Required**" if exam == "Yes" else f"📝 **Entrance Exam:** {exam}")
    return "\n".join(lines)


def _format_colleges_section(uni_name: str, uni_data: Dict[str, Any]) -> str:
    """List every college/faculty at a university with its cut-off range and requirements."""
    colleges = uni_data.get("colleges", {})
    if not colleges:
        return f"### {uni_name}\n\nI don't have a college breakdown for {uni_name} yet - check the official website for the full faculty structure."

    lines = [f"### Colleges at {uni_name}"]
    for college_name, college_data in colleges.items():
        prog_count = len(college_data.get("programs", []))
        cutoff = college_data.get("cutoff_range", "")
        lines.append(f"\n**{college_name}**")
        if cutoff:
            lines.append(f"- Cut-off range: {cutoff}")
        lines.append(f"- Programmes offered: {prog_count}")
        reqs = college_data.get("requirements", "")
        if reqs:
            lines.append(f"- Requirements: {reqs}")
    return "\n".join(lines)


def _format_fees_section(uni_name: str, uni_data: Dict[str, Any]) -> str:
    """Summarize fee information for a university."""
    fees = uni_data.get("fees", {})
    if not fees:
        return f"### {uni_name}\n\nI don't have fee details for {uni_name} yet - check the official website."

    lines = [f"### Fees at {uni_name}"]
    ghanaian = fees.get("ghanaian_students", {})
    if ghanaian:
        lines.append("\n**Ghanaian students (approximate annual fees):**")
        for category, amount in ghanaian.items():
            lines.append(f"- {category}: {amount}")
    for key in ("mandatory_levies",):
        levies = fees.get(key, {})
        if levies:
            lines.append("\n**Mandatory/optional levies:**")
            for levy, amount in levies.items():
                lines.append(f"- {levy}: {amount}")
    for key, label in (
        ("payment_policy", "Payment policy"),
        ("residential_note", "Residential fees"),
        ("approved_banks", "Approved banks"),
        ("international_students", "International students"),
    ):
        if fees.get(key):
            lines.append(f"\n**{label}:** {fees[key]}")
    return "\n".join(lines)


def _format_admission_section(uni_name: str, uni_data: Dict[str, Any]) -> str:
    """Summarize admission requirements and how-to-apply steps for a university."""
    admission = uni_data.get("admission_requirements", {})
    if not admission:
        return f"### {uni_name}\n\nI don't have admission details for {uni_name} yet - check the official website."

    lines = [f"### Admission Requirements at {uni_name}"]
    if admission.get("general"):
        lines.append(f"\n{admission['general']}")
    for key, label in (
        ("how_to_apply", "How to apply"),
        ("study_modes", "Study modes"),
        ("campuses", "Campuses"),
        ("first_choice_policy", "First-choice policy"),
        ("international_applicants", "International applicants"),
        ("application_deadline", "Application deadline"),
        ("online_portal", "Application portal"),
        ("application_fee", "Application fee"),
        ("entrance_exam", "Entrance exam"),
    ):
        if admission.get(key):
            lines.append(f"\n**{label}:** {admission[key]}")
    return "\n".join(lines)


def _format_contact_section(uni_name: str, uni_data: Dict[str, Any]) -> str:
    """Summarize contact details and portals for a university."""
    contact = uni_data.get("contact", {})
    if not contact:
        return f"### {uni_name}\n\nI don't have contact details for {uni_name} yet - check the official website."

    lines = [f"### Contact - {uni_name}"]
    for key, value in contact.items():
        label = key.replace("_", " ").title()
        lines.append(f"- **{label}:** {value}")
    if uni_data.get("website"):
        lines.append(f"- **Website:** {uni_data['website']}")
    return "\n".join(lines)


def _format_scholarships_section(uni_name: str, uni_data: Dict[str, Any]) -> str:
    """Summarize scholarship info for a university."""
    scholarships = uni_data.get("scholarships", {})
    if not scholarships:
        return f"### {uni_name}\n\nI don't have scholarship details for {uni_name} yet - check the official website."

    lines = [f"### Scholarships at {uni_name}"]
    for name, desc in scholarships.items():
        label = name.replace("_", " ").title()
        lines.append(f"- **{label}:** {desc}")
    return "\n".join(lines)


def _format_programs_overview(uni_name: str, uni_data: Dict[str, Any]) -> str:
    """Give a college-by-college programme summary, without dumping every single line."""
    colleges = uni_data.get("colleges", {})
    if not colleges:
        return f"### {uni_name}\n\nI don't have a full programme list for {uni_name} yet - check the official website."

    lines = [f"### Programmes at {uni_name}"]
    for college_name, college_data in colleges.items():
        programs = college_data.get("programs", [])
        names = [p.get("name", "") for p in programs if isinstance(p, dict)]
        lines.append(f"\n**{college_name}** ({len(names)} programmes)")
        preview = ", ".join(names[:5])
        if len(names) > 5:
            preview += f", and {len(names) - 5} more"
        lines.append(f"- {preview}")
    lines.append(f"\nAsk me about a specific college to see its full programme list and cut-offs for {uni_name}.")
    return "\n".join(lines)


def _format_general_overview(uni_name: str, uni_data: Dict[str, Any]) -> str:
    """A short general overview used when the query names a university but no clearer intent is detected."""
    lines = [f"### {uni_name}"]
    if uni_data.get("overview"):
        lines.append(f"\n{uni_data['overview']}")
    lines.append(f"\n**Location:** {uni_data.get('location', 'Ghana')} | **Established:** {uni_data.get('established', 'N/A')} | **Type:** {uni_data.get('type', 'Public')}")
    lines.append("\n" + _format_colleges_section(uni_name, uni_data))
    admission = uni_data.get("admission_requirements", {})
    if admission.get("application_deadline"):
        lines.append(f"\n**Application deadline:** {admission['application_deadline']}")
    lines.append(f"\nAsk me about colleges, programmes, cut-offs, fees, admission requirements, or scholarships for {uni_name} and I'll go into detail.")
    return "\n".join(lines)


def generate_smart_fallback_response(
    query: str, context: str, sources: List[Dict], user_profile: Dict = None
) -> str:
    """Generate a fallback response directly from the knowledge base (used when
    the LLM is unavailable). Detects what the person is actually asking about
    (colleges, programmes, fees, admission steps, contact, scholarships, or a
    specific programme) and answers that, instead of always dumping a generic
    program list - and, thanks to the university-scoped search(), a query that
    names one university stays scoped to that university."""
    query_lower = query.lower()

    results = university_kb.search(query)

    if results:
        # Detect intent from the query text
        wants_colleges = any(w in query_lower for w in ["college", "colleges", "faculty", "faculties", "school of", "schools does"])
        wants_fees = any(w in query_lower for w in ["fee", "fees", "cost", "tuition", "how much"])
        wants_admission = any(w in query_lower for w in ["admission", "how to apply", "apply", "e-voucher", "evoucher", "how do i apply"])
        wants_contact = any(w in query_lower for w in ["contact", "phone number", "email address", "website"])
        wants_scholarships = any(w in query_lower for w in ["scholarship", "scholarships", "financial aid", "bursary"])
        wants_programs = any(w in query_lower for w in ["program", "programme", "course", "courses", "what can i study", "what can i do"])
        any_explicit_intent = wants_colleges or wants_fees or wants_admission or wants_contact or wants_scholarships or wants_programs

        response_parts = []

        for result in results[:3]:
            uni_name = result["source"]
            uni_data = result["data"]

            # A specific program name was matched in the query text - give full detail
            # on it, but only when there's no clearer explicit intent (e.g. a fees
            # question about a named program should get the fees section, not just
            # that program's cut-off card with no fee info in it).
            matched_names = result.get("matched_programs") or []
            if matched_names and not any_explicit_intent:
                cards = []
                for prog_name in matched_names[:3]:
                    detail = _find_program_detail(uni_data, prog_name)
                    if detail:
                        cards.append(_format_program_card(uni_name, detail))
                if cards:
                    response_parts.append("\n\n".join(cards))
                    continue

            if wants_colleges:
                response_parts.append(_format_colleges_section(uni_name, uni_data))
            elif wants_fees:
                response_parts.append(_format_fees_section(uni_name, uni_data))
            elif wants_admission:
                response_parts.append(_format_admission_section(uni_name, uni_data))
            elif wants_contact:
                response_parts.append(_format_contact_section(uni_name, uni_data))
            elif wants_scholarships:
                response_parts.append(_format_scholarships_section(uni_name, uni_data))
            elif wants_programs:
                response_parts.append(_format_programs_overview(uni_name, uni_data))
            else:
                response_parts.append(_format_general_overview(uni_name, uni_data))

        if response_parts:
            return "\n\n---\n\n".join(response_parts)

    # Ultimate fallback - no specific match, list all universities
    uni_list = []
    for uni_name, data in university_kb.universities.items():
        prog_count = len(data.get("programs", {})) or sum(len(c.get("programs", [])) for c in data.get("colleges", {}).values())
        deadlines = data.get("admission_requirements", {})
        deadline = deadlines.get("application_deadline", "Check website")
        uni_list.append(f"- **{uni_name}**: {prog_count} programs | Deadline: {deadline}")

    return f"""That's a great question! I have detailed information about these Ghanaian universities:

{chr(10).join(uni_list)}

What specific information would you like to know about any of these universities? I can help with:
- **Colleges/faculties** and their programmes
- **Cut-off points** for specific programs
- **Subject requirements** for admission
- **Application deadlines and how to apply**
- **Fees** and scholarships

Just let me know what you're looking for! 😊"""


# ============================================================================
# FASTAPI APP ENDPOINTS (Preserved)
# ============================================================================

@app.on_event("startup")
async def startup_event():
    await initialize_services()


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "glinax-rag", "version": "2.0.0"}


@app.get("/api/chat/conversations")
async def list_conversations(current=Depends(get_current_user)):
    if not db_client:
        raise HTTPException(status_code=503, detail="Database not available")
    try:
        db = db_client[os.getenv("DB_NAME", "glinax_chatbot_db")]
        effective_user_id = current["user_id"]
        pipeline = [
            {"$match": {"user_id": effective_user_id}},
            {"$sort": {"conversation_id": 1, "timestamp": 1}},
            {
                "$group": {
                    "_id": "$conversation_id",
                    "title": {"$first": "$query"},
                    "last_active": {"$max": "$timestamp"},
                    "message_count": {"$sum": 1},
                }
            },
            {"$sort": {"last_active": -1}},
        ]
        cursor = db.rag_logs.aggregate(pipeline)
        items = []
        async for doc in cursor:
            last = doc.get("last_active")
            items.append(
                {
                    "conversation_id": str(doc.get("_id")),
                    "title": (doc.get("title") or "Untitled conversation")[:120],
                    "last_active_date": last.isoformat()
                    if isinstance(last, datetime)
                    else str(last or ""),
                    "message_count": int(doc.get("message_count") or 0),
                }
            )
        return {"success": True, "history": items}
    except Exception as e:
        print(f" Conversations list error: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to fetch conversation history"
        )


@app.get("/api/chat/conversations-demo")
async def list_conversations_demo():
    now = datetime.now().isoformat()
    demo = [
        {
            "conversation_id": "demo-1",
            "title": f"University of Ghana fees {datetime.now().year}",
            "last_active_date": now,
            "message_count": 5,
        },
        {
            "conversation_id": "demo-2",
            "title": "KNUST Computer Engineering requirements",
            "last_active_date": now,
            "message_count": 8,
        },
        {
            "conversation_id": "demo-3",
            "title": "Ashesi University programs and scholarships",
            "last_active_date": now,
            "message_count": 6,
        },
        {
            "conversation_id": "demo-4",
            "title": "UDS Agriculture program admission",
            "last_active_date": now,
            "message_count": 4,
        },
        {
            "conversation_id": "demo-5",
            "title": "UPSA Business and Accounting opportunities",
            "last_active_date": now,
            "message_count": 7,
        },
    ]
    return {"success": True, "history": demo}


@app.get("/history/{user_id}")
async def get_history(user_id: str):
    if not db_client:
        raise HTTPException(status_code=503, detail="Database not available")
    try:
        db = db_client[os.getenv("DB_NAME", "glinax_chatbot_db")]
        pipeline = [
            {"$match": {"user_id": user_id}},
            {"$sort": {"conversation_id": 1, "timestamp": 1}},
            {
                "$group": {
                    "_id": "$conversation_id",
                    "title": {"$first": "$query"},
                    "last_active": {"$max": "$timestamp"},
                    "message_count": {"$sum": 1},
                }
            },
            {"$sort": {"last_active": -1}},
        ]
        cursor = db.rag_logs.aggregate(pipeline)
        items = []
        async for doc in cursor:
            items.append(
                {
                    "conversation_id": doc.get("_id"),
                    "title": (doc.get("title") or "Untitled conversation")[:120],
                    "last_active": (
                        doc.get("last_active").isoformat()
                        if isinstance(doc.get("last_active"), datetime)
                        else str(doc.get("last_active"))
                    ),
                    "message_count": int(doc.get("message_count", 0)),
                }
            )
        return {"success": True, "history": items}
    except Exception as e:
        print(f" History aggregation error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch history")


@app.get("/history/chat/{conversation_id}")
async def get_conversation(conversation_id: str):
    if not db_client:
        raise HTTPException(status_code=503, detail="Database not available")
    try:
        db = db_client[os.getenv("DB_NAME", "glinax_chatbot_db")]
        cursor = db.rag_logs.find({"conversation_id": conversation_id}).sort(
            "timestamp", 1
        )
        thread = []
        async for doc in cursor:
            ts = doc.get("timestamp")
            ts_iso = ts.isoformat() if isinstance(ts, datetime) else str(ts)
            user_msg = doc.get("query")
            assistant_msg = doc.get("response")
            if user_msg:
                thread.append(
                    {"role": "user", "content": user_msg, "timestamp": ts_iso}
                )
            if assistant_msg:
                thread.append(
                    {
                        "role": "assistant",
                        "content": assistant_msg,
                        "timestamp": ts_iso,
                        "meta": {
                            "confidence": doc.get("confidence"),
                            "sources": doc.get("sources", []),
                        },
                    }
                )
        return {"success": True, "conversation_id": conversation_id, "messages": thread}
    except Exception as e:
        print(f" Conversation fetch error: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to fetch conversation thread"
        )


@app.post("/respond", response_model=ChatResponse)
async def respond_to_query(request: ChatRequest):
    start_time = datetime.now()

    try:
        user_profile = {}
        if request.user_context and isinstance(request.user_context, dict):
            assessment_data = request.user_context.get("assessment_data", None)
            if assessment_data and isinstance(assessment_data, dict):
                user_profile.update(assessment_data)
            skip_keys = {
                "is_assessment_request",
                "assessment_data",
                "has_files",
                "file_count",
                "file_info",
            }
            for k, v in request.user_context.items():
                if k not in skip_keys and v:
                    user_profile.setdefault(k, v)

        user_message = (request.message or "").strip()
        if not user_message:
            return ChatResponse(
                success=False,
                reply="I need a question or message to help you.",
                sources=[],
                confidence=0.0,
                timestamp=datetime.now().isoformat(),
                processing_time=0.0,
                model_used="hybrid-rag",
            )

        print(f"📥 Processing query: {user_message[:100]}...")

        local_matches = search_local_knowledge(user_message, request.university_name)
        print(
            f"🔍 Local search found {len(local_matches['results'])} results (confidence={local_matches.get('confidence', 0.0):.2f})"
        )

        source_documents: List[Dict[str, Any]] = []
        context_segments: List[str] = []

        for search_result in local_matches.get("results", []):
            source_documents.append(
                {
                    "source": search_result.get("source"),
                    "type": "local_knowledge",
                    "confidence": search_result.get("relevance", 0.0),
                }
            )
            context_segments.append(
                build_university_context(
                    search_result.get("source", ""), search_result.get("data", {})
                )
            )

        if local_matches.get("confidence", 0.0) > 0.95:
            print("⚡ Fast Path: Skipping web search due to exact university match")
            combined_context = "\n\n".join(context_segments)
            combined_context = combined_context[:24000]  # generous cap so a data-rich university (multiple colleges) isn't cut off before reaching the LLM
            final_confidence = local_matches.get("confidence", 0.8)
            if groq_client and (final_confidence > 0.3 or combined_context):
                response_text = await generate_response_with_groq(
                    user_message, combined_context, source_documents, user_profile, request.chat_history
                )
            else:
                response_text = generate_smart_fallback_response(
                    user_message, combined_context, source_documents, user_profile
                )
        else:
            print("🌐 Fallback path: Running real-time web search...")
            web_matches = await search_web_realtime(user_message)
            print(
                f"🌐 Real-time search found {len(web_matches.get('results', []))} results"
            )

            for web_match in web_matches.get("results", []):
                source_documents.append(
                    {
                        "source": web_match.get("title", "Web Result"),
                        "url": web_match.get("url", ""),
                        "type": web_match.get("source", "web_search"),
                        "confidence": 0.7,
                    }
                )
                snippet = web_match.get("snippet") or web_match.get("body") or ""
                context_segments.append(f"Web Result: {snippet}")

            combined_context = "\n\n".join(context_segments)
            combined_context = combined_context[:24000]  # generous cap so a data-rich university (multiple colleges) isn't cut off before reaching the LLM
            final_confidence = max(
                local_matches.get("confidence", 0.0), web_matches.get("confidence", 0.0)
            )

            if groq_client and (final_confidence > 0.3 or combined_context):
                response_text = await generate_response_with_groq(
                    user_message, combined_context, source_documents, user_profile, request.chat_history
                )
            else:
                response_text = generate_smart_fallback_response(
                    user_message, combined_context, source_documents, user_profile
                )

        processing_time = (datetime.now() - start_time).total_seconds()
        print(
            f"✅ Response generated in {processing_time:.2f}s with confidence {final_confidence:.2f}"
        )

        if db_client:
            try:
                db = db_client[os.getenv("DB_NAME", "glinax_chatbot_db")]
                await db.rag_logs.insert_one(
                    {
                        "query": request.message,
                        "response": response_text,
                        "confidence": final_confidence,
                        "sources": source_documents,
                        "processing_time": processing_time,
                        "timestamp": datetime.now(),
                        "conversation_id": request.conversation_id,
                        "user_id": request.user_id,
                    }
                )
            except Exception as e:
                print(f" Failed to save to MongoDB: {e}")

        return ChatResponse(
            success=True,
            reply=sanitize_markdown_urls(response_text),
            sources=source_documents,
            confidence=final_confidence,
            timestamp=datetime.now().isoformat(),
            processing_time=processing_time,
            model_used="hybrid-rag-v2",
        )

    except Exception as e:
        print(f" RAG processing error: {e}")

        try:
            fallback_response = generate_smart_fallback_response(
                request.message, "", [], user_profile if "user_profile" in dir() else {}
            )

            return ChatResponse(
                success=True,
                reply=sanitize_markdown_urls(fallback_response),
                sources=[
                    {
                        "source": "Local Knowledge Base",
                        "type": "fallback",
                        "confidence": 0.5,
                    }
                ],
                confidence=0.5,
                timestamp=datetime.now().isoformat(),
                model_used="emergency-fallback",
            )
        except Exception as fallback_error:
            print(f" Even fallback failed: {fallback_error}")

            return ChatResponse(
                success=False,
                reply="I apologize, but I'm having technical difficulties. Please try asking about specific universities or programs, and I'll do my best to help with admissions information.",
                sources=[],
                confidence=0.0,
                timestamp=datetime.now().isoformat(),
                model_used="minimal-fallback",
            )


@app.post("/respond-with-files", response_model=ChatResponse)
async def respond_with_files(
    message: str = Form(...),
    conversation_id: str = Form(...),
    user_id: str = Form(None),
    university_name: str = Form(None),
    user_context: str = Form(None),
    files: List[UploadFile] = File(None),
):
    start_time = datetime.now()

    try:
        user_message = (message or "").strip()
        if not user_message and not files:
            return ChatResponse(
                success=False,
                reply="Please provide a message or at least one file for analysis.",
                sources=[],
                confidence=0.0,
                timestamp=datetime.now().isoformat(),
                processing_time=0.0,
                model_used="hybrid-rag-with-files",
            )

        print(f" Processing message with files: {user_message[:100]}")
        print(f" File count: {len(files) if files else 0}")

        file_contents = []
        file_info = []
        extracted_content_parts: List[str] = []

        if files:
            for file in files:
                if file and file.filename:
                    try:
                        print(f"📄 Processing file: {file.filename} ({file.content_type})")
                        content = await file.read()

                        if file.content_type == "text/plain":
                            try:
                                text_content = content.decode("utf-8", errors="ignore")
                                preview = text_content.strip()[:4000]
                                file_contents.append(f"📄 TEXT: {file.filename}\n{preview}")
                                if text_content:
                                    extracted_content_parts.append(text_content.strip())
                            except Exception as e:
                                file_contents.append(f"📄 TEXT extraction failed for {file.filename}: {e}")

                        elif file.content_type == "application/pdf":
                            try:
                                import io
                                import pdfplumber

                                extracted_pages = []
                                with pdfplumber.open(io.BytesIO(content)) as pdf:
                                    for i, page in enumerate(pdf.pages):
                                        try:
                                            page_text = page.extract_text() or ""
                                        except Exception:
                                            page_text = ""
                                        if page_text:
                                            extracted_pages.append(page_text)
                                        if sum(len(p) for p in extracted_pages) > 15000:
                                            break

                                extracted_text = "\n\n".join(extracted_pages).strip()
                                if not extracted_text:
                                    extracted_text = "[No selectable text extracted from PDF. This may be a scanned document or image-based PDF.]"

                                extracted_content_parts.append(extracted_text)
                                preview = extracted_text[:4000]
                                file_contents.append(f"📋 PDF: {file.filename}\n{preview}")
                            except Exception as e:
                                file_contents.append(f"📋 PDF extraction failed for {file.filename}: {e}")

                        elif file.content_type.startswith("image/"):
                            try:
                                import io
                                from PIL import Image
                                try:
                                    import pytesseract
                                except Exception:
                                    pytesseract = None
                                image = Image.open(io.BytesIO(content))
                                ocr_text = ""
                                if pytesseract:
                                    try:
                                        configure_tesseract_path_if_needed(pytesseract)
                                    except Exception:
                                        pass
                                    try:
                                        ocr_text = pytesseract.image_to_string(image) or ""
                                    except Exception as ocr_err:
                                        ocr_text = f"[OCR failed: {ocr_err}]"
                                else:
                                    ocr_text = "[OCR engine not available on server]"
                                preview = ocr_text.strip()[:4000]
                                file_contents.append(f"🖼️ IMAGE: {file.filename}\n{preview if preview else '[No text detected]'}")
                                if ocr_text:
                                    extracted_content_parts.append(ocr_text.strip())
                            except Exception as e:
                                file_contents.append(f"🖼️ Image processing failed for {file.filename}: {e}")

                        elif file.content_type in ["application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]:
                            try:
                                import io
                                if file.content_type == "application/msword" and not file.filename.lower().endswith(".docx"):
                                    file_contents.append(f"📝 {file.filename}: Legacy .doc files are not supported. Please convert to .docx and try again.")
                                else:
                                    from docx import Document
                                    doc = Document(io.BytesIO(content))
                                    paragraphs = []
                                    for p in doc.paragraphs:
                                        txt = p.text.strip()
                                        if txt:
                                            paragraphs.append(txt)
                                        if sum(len(x) for x in paragraphs) > 15000:
                                            break
                                    text = "\n".join(paragraphs)
                                    preview = text[:4000] if text else ""
                                    file_contents.append(f"📝 DOCX: {file.filename}\n{preview if preview else '[No text extracted]'}")
                                    if text:
                                        extracted_content_parts.append(text)
                            except Exception as e:
                                file_contents.append(f"📝 DOCX extraction failed for {file.filename}: {e}")

                        else:
                            try:
                                file_size_kb = len(content) / 1024
                                file_contents.append(f"""📎 **DOCUMENT ANALYSIS**
**File:** {file.filename}
**Type:** {file.content_type}
**Size:** {file_size_kb:.1f}KB

I have received your document and will analyze it in the context of Ghanaian university admissions. Please let me know what specific aspect you'd like me to help with.""")
                            except Exception:
                                file_contents.append(f"📎 **DOCUMENT:** {file.filename} (processing error)")

                        file_info.append(
                            {
                                "name": file.filename,
                                "type": file.content_type,
                                "size": len(content),
                            }
                        )

                    except Exception as file_error:
                        print(f" Error processing file {file.filename}: {file_error}")
                        file_contents.append(f"File: {file.filename} - processing error")

        enhanced_message = message
        if file_contents:
            enhanced_message += "\n\n[Extracted content from uploaded files]\n" + "\n\n".join(file_contents)

        extracted_content = "\n\n".join(extracted_content_parts).strip()
        if extracted_content:
            enhanced_message += f"\n\n[Document Text]\n{extracted_content}"

        context_data = {}
        if user_context:
            try:
                context_data = json.loads(user_context)
            except Exception:
                context_data = {"raw_context": user_context}

        file_user_profile = {}
        skip_keys = {
            "is_assessment_request",
            "assessment_data",
            "has_files",
            "file_count",
            "file_info",
            "raw_context",
        }
        assessment_data = context_data.get("assessment_data", {})
        if assessment_data and isinstance(assessment_data, dict):
            file_user_profile.update(assessment_data)
        for k, v in context_data.items():
            if k not in skip_keys and v:
                file_user_profile.setdefault(k, v)

        local_results = search_local_knowledge(enhanced_message, university_name)
        print(f" Local search found {len(local_results['results'])} results")

        web_results = await search_web_realtime(enhanced_message)
        print(f"🌐 Real-time search found {len(web_results['results'])} results")

        all_sources = []
        context_parts = []

        if file_info:
            all_sources.append(
                {
                    "source": f"Uploaded Files ({len(file_info)} files)",
                    "type": "user_files",
                    "confidence": 0.9,
                }
            )
            context_parts.append(
                f"User uploaded {len(file_info)} files: {', '.join([f['name'] for f in file_info])}"
            )

        for result in local_results["results"]:
            all_sources.append(
                {
                    "source": result["source"],
                    "type": "local_knowledge",
                    "confidence": result["relevance"],
                }
            )
            context_parts.append(
                build_university_context(result["source"], result["data"])
            )

        for result in web_results["results"]:
            all_sources.append(
                {
                    "source": result.get("title", "Web Result"),
                    "url": result.get("url", ""),
                    "type": "web_search",
                    "confidence": 0.7,
                }
            )
            context_parts.append(f"Web Result: {result.get('snippet', '')}")

        combined_context = "\n\n".join(context_parts)
        combined_context = combined_context[:24000]  # generous cap so a data-rich university (multiple colleges) isn't cut off before reaching the LLM
        final_confidence = max(local_results["confidence"], web_results["confidence"])
        if file_info:
            final_confidence = max(final_confidence, 0.8)

        if groq_client and (final_confidence > 0.3 or combined_context):
            print(" Generating response with Groq LLM (including file context)...")
            response_text = await generate_response_with_groq(
                enhanced_message, combined_context, all_sources, file_user_profile
            )
        else:
            print(" Generating smart fallback response (with file acknowledgment)...")
            response_text = generate_smart_fallback_response(
                enhanced_message, combined_context, all_sources, file_user_profile
            )

        if file_info:
            response_text = f"""**📄 File Analysis Complete**

I have processed {len(file_info)} file(s): {', '.join([f['name'] for f in file_info])}

---

{response_text}

---

**What would you like to know about:**
- Cut-off points for specific programs?
- Subject requirements?
- Application deadlines?
- Program recommendations?

Just let me know! 😊
"""
            response_text = sanitize_markdown_urls(response_text)

        processing_time = (datetime.now() - start_time).total_seconds()
        print(f"File response generated in {processing_time:.2f}s with confidence {final_confidence:.2f}")

        if db_client:
            try:
                db = db_client[os.getenv("DB_NAME", "glinax_chatbot_db")]
                await db.rag_logs.insert_one(
                    {
                        "query": message,
                        "response": response_text,
                        "confidence": final_confidence,
                        "sources": all_sources,
                        "processing_time": processing_time,
                        "timestamp": datetime.now(),
                        "conversation_id": conversation_id,
                        "user_id": user_id,
                        "has_files": bool(file_info),
                        "file_info": file_info,
                    }
                )
            except Exception as e:
                print(f" Failed to save file-response to MongoDB: {e}")

        return ChatResponse(
            success=True,
            reply=sanitize_markdown_urls(response_text),
            sources=all_sources,
            confidence=final_confidence,
            timestamp=datetime.now().isoformat(),
            processing_time=processing_time,
            model_used="hybrid-rag-with-files",
        )

    except Exception as e:
        print(f" File processing error: {e}")

        return ChatResponse(
            success=True,
            reply=f"I received your files but had some trouble processing them. However, I can still help with your question: {message}\n\nPlease let me know how I can assist you with Ghanaian university information!",
            sources=[
                {
                    "source": "File Processing Error",
                    "type": "fallback",
                    "confidence": 0.3,
                }
            ],
            confidence=0.3,
            timestamp=datetime.now().isoformat(),
            model_used="file-error-fallback",
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
