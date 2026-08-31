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
    """Remove stray HTML tags (e.g. <br>, <br/>, <table>, <li>, <b>) that can
    otherwise leak into an AI reply. The chat UI renders Markdown, not HTML, so
    any raw tag that slips through would show up as literal text like "<br>"
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
        "admission_requirements": {
            "general": "Most first-degree programmes are 4 years. WASSCE/SSSCE: Credit passes (A1-C6 WASSCE / A-D SSSCE) in the 3 core subjects - English Language, Mathematics, Integrated Science (prerequisite for ALL programmes) - plus credit passes in 3 elective subjects relevant to the chosen programme, with an aggregate of 24 or better.",
            "gce_igcse": "GCE/IGCSE (Cambridge) 'A' & 'O' Levels: 5 'O' Level credits including English Language and Mathematics, plus passes in at least 3 subjects at 'A' Level (or 3 credits for mature applicants), plus the appropriate Faculty/Departmental subject requirements.",
            "gbce_abce": "Both GBCE and ABCE are needed together to qualify. GBCE: passes in 3 compulsory subjects (incl. English Language) plus 3 elective subjects (incl. Business Mathematics). ABCE: passes in 3 compulsory subjects plus 3 optional subjects relevant to the programme.",
            "ib": "Minimum grade 4 at Higher Level (HL) in 3 subjects relevant to the programme, with a minimum of grade 5 in Chemistry for Health and Allied Sciences, and at least grade 5 HL in Mathematics for Engineering. Also requires a minimum of grade 4 in English Language and Mathematics at Standard Level (SL), and at least grade C in a Science subject at IGCSE.",
            "american_high_school": "Final Grade Point Average of at least 3.0 (at least 3.25 for the School of Medicine and Dentistry). Admission is to Year 1.",
            "mature": "25+ years old at time of application; requirements vary by programme (typically a relevant Diploma/HND with 2-3 years post-qualification experience, or the standard WASSCE/GCE requirements). Short-listed applicants may need to take an entrance examination and pass an interview.",
            "how_to_apply": "Purchase an E-Voucher one of three ways: (1) Register at https://apps.knust.edu.gh/admissions/ and pay via Visa, Mastercard, or Mobile Money; (2) Dial *415*55# on a mobile device and pay via Mobile Money, then register and validate the voucher on the portal; (3) Purchase from a Ghana Post Company regional office, then register and validate on the portal. Then complete the application, uploading examination results, birth certificate, Ghana Card/Passport, and a passport photograph (light green background). Applicants from non-English-speaking countries need a minimum one-year English Proficiency Certificate.",
            "international_applicants": "International applicants pay a non-refundable application processing fee of US$100.00, in addition to completing the same application process.",
            "foreign_qualifications": "Foreign results/certificates not listed among the standard qualification types may require an evaluation from the Ghana Tertiary Education Commission (GTEC) and/or another International Credential Evaluation Agency. Documents not in English must be accompanied by accredited English translations.",
            "campuses": "Main Campus (Kumasi) and Obuasi Campus (selected Engineering, Health Sciences, and Business programmes - cutoffs differ by campus for the same programme)",
            "fee_paying_note": "Opting for Fee-Paying/Parallel admission is a decision for the entire duration of the programme once selected.",
            "application_deadline": "Check the admissions portal - deadlines change annually",
            "online_portal": "https://apps.knust.edu.gh/admissions/",
            "application_fee": "E-Voucher cost varies by purchase method (Visa/Mastercard/Mobile Money/Ghana Post); international applicants additionally pay US$100",
            "entrance_exam": "Required (plus interview) for Medicine (MBChB) and Dentistry (BDS); required for various mature/HND-entry categories across other programmes"
        },
        "contact": {
            "phone": "+233-32-206-0331",
            "email": "admissions@knust.edu.gh",
            "address": "Private Mail Bag, Kumasi, Ghana",
            "international_programmes_email": "ipo@knust.edu.gh"
        },
        "colleges": {
            "Agriculture and Natural Resources": {
                "cutoff_range": "15-24",
                "requirements": "Core: credit passes in English Language, Mathematics, Integrated Science. Electives vary by programme (see individual programmes). Mature applicants need a relevant Diploma/HND plus 2 years post-qualification experience, or standard WASSCE/GCE electives, and may sit an entrance exam/interview.",
                "programs": [
                    {"name": "BSc Agriculture", "school": "Faculty of Agriculture", "cutoff": "20", "requirements": "Chemistry + any 2 of Physics/Mathematics, Biology, General Agriculture, Animal Husbandry, Crop Husbandry, or Horticulture"},
                    {"name": "BSc Agricultural Biotechnology", "school": "Faculty of Agriculture", "cutoff": "17", "requirements": "Chemistry + any 2 of Physics/Mathematics, Biology, General Agriculture, Animal Husbandry, Crop Husbandry, or Horticulture"},
                    {"name": "BSc Agribusiness Management", "school": "Faculty of Agriculture", "cutoff": "15", "requirements": "3 electives from one path - Science: Chemistry, Physics/Maths, Biology/General Agriculture; Business: Economics, Accounting, Business Management, Business Maths, Costing, Elective Maths (min B3 Integrated Science); General Arts: Economics, Geography, Elective Maths (min B3 Integrated Science); General Agriculture: Chemistry, Physics/Maths, Biology/General Agriculture/Crop Husbandry/Horticulture"},
                    {"name": "BSc Landscape Design and Management", "school": "Faculty of Agriculture", "cutoff": "17", "requirements": "3 electives from Science (Chemistry, Physics/Maths/Crop Husbandry, Biology/General Agriculture), General Arts (Maths, Geography, Economics, Technical Drawing, General Knowledge in Art), or Visual Art (General Knowledge in Art, Graphic Design, Chemistry, Picture Making, Painting and Sculpture)"},
                    {"name": "BSc Natural Resource Management", "school": "Faculty of Natural Resource Management", "cutoff": "18", "requirements": "Chemistry, Physics/Mathematics, Biology/General Agriculture"},
                    {"name": "BSc Forest Resources Technology", "school": "Faculty of Natural Resource Management", "cutoff": "24", "requirements": "Chemistry, Physics/Mathematics, Biology/General Agriculture"},
                    {"name": "BSc Aquaculture and Water Resource Management", "school": "Faculty of Natural Resource Management", "cutoff": "20", "requirements": "Chemistry, Physics/Mathematics, Biology/General Agriculture"},
                    {"name": "BSc Packaging Technology", "school": "Faculty of Natural Resource Management", "cutoff": "15", "requirements": "3 electives from Science, General Arts, Visual Art, Technical, or Home Economics"}
                ]
            },
            "Art and Built Environment": {
                "cutoff_range": "7-24",
                "requirements": "Core: credit passes in English Language, Mathematics, Integrated Science. Most Art/Design programmes require a written/practical entrance exam and interview for mature and Diploma/HND-holder applicants.",
                "programs": [
                    {"name": "BSc Architecture", "school": "Faculty of Built Environment", "cutoff": "7", "requirements": "Elective Maths + 2 from Technical (Tech Drawing/Eng Science, Woodwork/Metalwork, Building Construction), General Science (Chemistry, Physics, Biology), Visual Art (Gen Knowledge in Art, Graphic Design, Picture Making), or General Arts (Economics, Geography)"},
                    {"name": "BSc Construction Technology and Management", "school": "Faculty of Built Environment", "cutoff": "9", "requirements": "Elective Maths + 2 from Technical (Tech Drawing/Eng Science, Woodwork, Building Construction, Metalwork), Science (Chemistry, Physics), or General Arts (Economics, Geography)"},
                    {"name": "BSc Quantity Surveying and Construction Economics", "school": "Faculty of Built Environment", "cutoff": "9", "requirements": "Elective Maths + 2 from General Science (Chemistry, Physics), General Arts (Economics, Geography), or Technical (Tech Drawing/Eng Science, Building Construction, Woodwork, Metalwork)"},
                    {"name": "BSc Development Planning", "school": "Faculty of Built Environment", "cutoff": "9", "requirements": "3 electives from Group A (Geography, Economics, Government/History, Elective Maths, Gen Knowledge in Art) or Group B (Intro to Business Management, Accounting, Business Maths and Costing), or a mix"},
                    {"name": "BSc Human Settlement Planning", "school": "Faculty of Built Environment", "cutoff": "10", "requirements": "3 electives including Geography from Group A (Economics, Business Mgmt, Geography, Government, Elective Maths, Financial/Cost Accounting, Graphic Design) plus optionally 1 from Group B (Accounting, Tech Drawing, Graphic Design, Picture Making, Sculpture, Physics, Painting, History, Building Tech, Woodwork, Metalwork, Gen Knowledge in Art)"},
                    {"name": "BSc Land Economy", "school": "Faculty of Built Environment", "cutoff": "8", "requirements": "Economics, Geography + 1 relevant subject (Accounting, Business Management, Government, Business Maths, French, Literature in English, History, Building Construction, Technical Drawing, or Mathematics)"},
                    {"name": "BSc Real Estate", "school": "Faculty of Built Environment", "cutoff": "9", "requirements": "Economics, Geography + 1 relevant subject (Accounting, Business Management, Government, Business Maths, French, Literature in English, History, Building Construction, Technical Drawing, or Mathematics)"},
                    {"name": "BFA Fine Art and Curatorial Practice", "school": "Faculty of Art", "cutoff": "16", "requirements": "3 electives from one group (each requiring General Knowledge in Art plus 2 others) - Visual Art, Home Economics, Technical, Science, General Arts, or Business"},
                    {"name": "BA Communication Design", "school": "Faculty of Art", "cutoff": "11", "requirements": "Graphic Design, General Knowledge in Art, ICT, plus another Visual Arts elective (excluding Leatherwork, Basketry, Bead making)"},
                    {"name": "BA Integrated Rural Art and Industry", "school": "Faculty of Art", "cutoff": "15", "requirements": "3 electives from a wide list (Picture Making, Leatherwork, Graphic Design, Textiles, Jewellery, Sculpture, Ceramics, Gen Knowledge in Art, and others) or 3 relevant technical subjects"},
                    {"name": "BA Publishing Studies", "school": "Faculty of Art", "cutoff": "12", "requirements": "3 electives from Visual Arts, General Arts, Business, Vocational/Home Economics, or Science groupings"},
                    {"name": "BA Metal Product Design Technology", "school": "Faculty of Art", "requirements": "3 electives from Visual Art, Home Economics, Technical, or Science"},
                    {"name": "BSc Textile Design and Technology", "school": "Faculty of Art", "cutoff": "13", "requirements": "3 electives from Visual Arts, Home Economics, Technical, Science, General Arts, or Business"},
                    {"name": "BSc Fashion Design", "school": "Faculty of Art", "cutoff": "11", "requirements": "3 electives from Visual Arts, Home Economics, Technical, Science, General Arts, or Business"},
                    {"name": "BFA Ceramics", "school": "Faculty of Art", "cutoff": "24", "requirements": "3 electives from Visual Art, Home Economics, or General Arts"},
                    {"name": "BSc Ceramics Technology", "school": "Faculty of Art", "cutoff": "23", "requirements": "3 electives from Visual Art (Ceramics, Gen Knowledge in Art, Chemistry/Maths/Physics), Science (Maths, Chemistry, Physics/Biology), or Technical (Tech Drawing, Building Construction, Applied Electricity, Auto Mechanics, Electronics, Physics)"},
                    {"name": "B.Ed Junior High School Education", "school": "Faculty of Educational Studies", "cutoff": "15", "options": "Mathematics, Science, ICT, Agricultural Science, Visual Art, History, Geography", "requirements": "3 electives matching the chosen option (Science/General Agriculture/ICT for a-d; Visual Art for e; General Arts incl. History or Geography for f/g)"},
                    {"name": "B.Ed Chemistry", "school": "Faculty of Educational Studies", "cutoff": "20", "requirements": "Chemistry, Mathematics, and Physics/Biology/ICT"},
                    {"name": "B.Ed Biology", "school": "Faculty of Educational Studies", "cutoff": "18", "requirements": "Biology, Chemistry, and ICT/Physics/Mathematics"},
                    {"name": "B.Ed Mathematics", "school": "Faculty of Educational Studies", "cutoff": "21", "requirements": "Mathematics, Physics, and Chemistry/ICT/Biology"},
                    {"name": "B.Ed Physics", "school": "Faculty of Educational Studies", "cutoff": "24", "requirements": "Physics, Mathematics, and Chemistry/ICT/Electronics"},
                    {"name": "B.Ed STEM (Aviation and Aerospace)", "school": "Faculty of Educational Studies", "cutoff": "21", "requirements": "Physics, Mathematics, and one relevant technical/science subject"},
                    {"name": "B.Ed STEM (Manufacturing)", "school": "Faculty of Educational Studies", "cutoff": "24", "requirements": "Physics, Mathematics, and one relevant technical subject"},
                    {"name": "B.Ed STEM (Robotics)", "school": "Faculty of Educational Studies", "requirements": "Mathematics, Physics, and Chemistry/ICT/Electronics"},
                    {"name": "B.Ed STEM (Biomedical Science)", "school": "Faculty of Educational Studies", "requirements": "Biology, Chemistry, and Physics/Mathematics"},
                    {"name": "B.Ed Art and Design Technology", "school": "Faculty of Educational Studies", "requirements": "3 subjects from Visual Arts, Vocational, Science, Technical, or General Arts"},
                    {"name": "B.Ed ICT", "school": "Faculty of Educational Studies", "requirements": "Mathematics + 2 from General Science, General Arts, Business, Visual Art, Technical, or Home Economics"}
                ]
            },
            "Engineering": {
                "cutoff_range": "6-13",
                "requirements": "Core: English Language, Mathematics, Integrated Science. Electives: Physics, Elective Mathematics, and Chemistry - though many programmes accept a relevant technical/vocational subject (e.g. Applied Electricity, Auto Mechanics, Metalwork, Technical Drawing, ICT) in place of Chemistry; applicants without Chemistry must have at least B3 in Integrated Science. Obuasi Campus offers several of these programmes with separate, typically higher, cut-offs.",
                "programs": [
                    {"name": "BSc Civil Engineering", "cutoff": "7", "campuses": "Main"},
                    {"name": "BSc Civil Engineering (Obuasi Campus)", "cutoff": "11", "campuses": "Obuasi"},
                    {"name": "BSc Geological Engineering", "cutoff": "8", "campuses": "Main", "requirements": "Geography or Technical Drawing accepted in place of Chemistry"},
                    {"name": "BSc Geological Engineering (Obuasi Campus)", "cutoff": "14", "campuses": "Obuasi"},
                    {"name": "BSc Geomatic (Geodetic) Engineering", "cutoff": "9", "campuses": "Main", "requirements": "Geography or Technical Drawing accepted in place of Chemistry"},
                    {"name": "BSc Geomatic (Geodetic) Engineering (Obuasi Campus)", "cutoff": "15", "campuses": "Obuasi"},
                    {"name": "BSc Petroleum Engineering", "cutoff": "6", "campuses": "Main"},
                    {"name": "BSc Biomedical Engineering", "cutoff": "6", "campuses": "Main", "requirements": "Biology accepted in place of Chemistry"},
                    {"name": "BSc Computer Engineering", "cutoff": "6", "campuses": "Main", "requirements": "Applied Electricity/Electronics/ICT accepted in place of Chemistry"},
                    {"name": "BSc Electrical/Electronic Engineering", "cutoff": "6", "campuses": "Main", "requirements": "Applied Electricity/Electronics/ICT/Robotics accepted in place of Chemistry"},
                    {"name": "BSc Electrical/Electronic Engineering (Obuasi Campus)", "cutoff": "10", "campuses": "Obuasi"},
                    {"name": "BSc Telecommunications Engineering", "cutoff": "9", "campuses": "Main", "requirements": "Applied Electricity/Electronics/ICT accepted in place of Chemistry"},
                    {"name": "BSc Mechanical Engineering", "cutoff": "7", "campuses": "Main", "requirements": "Metalwork, Auto Mechanics, Applied Electricity, Tech Drawing, Building Construction, Woodwork, ICT, or Robotics accepted in place of Chemistry"},
                    {"name": "BSc Mechanical Engineering (Obuasi Campus)", "cutoff": "12", "campuses": "Obuasi"},
                    {"name": "BSc Aerospace Engineering", "cutoff": "7", "campuses": "Main"},
                    {"name": "BSc Chemical Engineering", "cutoff": "7", "campuses": "Main"},
                    {"name": "BSc Metallurgical Engineering", "cutoff": "11", "campuses": "Main"},
                    {"name": "BSc Metallurgical Engineering (Obuasi Campus)", "cutoff": "16", "campuses": "Obuasi"},
                    {"name": "BSc Materials Engineering", "cutoff": "10", "campuses": "Main"},
                    {"name": "BSc Materials Engineering (Obuasi Campus)", "cutoff": "15", "campuses": "Obuasi"},
                    {"name": "BSc Marine Engineering", "cutoff": "9", "campuses": "Main", "requirements": "Physics, Mathematics + Chemistry/Metalwork/Auto Mechanics/Applied Electricity/Tech Drawing/Building Construction/Woodwork"},
                    {"name": "BSc Industrial Engineering", "cutoff": "10", "campuses": "Main"},
                    {"name": "BSc Automobile Engineering", "cutoff": "10", "campuses": "Main"},
                    {"name": "BSc Agricultural Engineering", "cutoff": "13", "campuses": "Main", "requirements": "Technical Drawing, Engineering Science, General Agriculture, Biology, Metalwork, Auto Mechanics, Applied Electricity, or Building Construction accepted in place of Chemistry"},
                    {"name": "BSc Petrochemical Engineering", "cutoff": "7", "campuses": "Main"}
                ]
            },
            "Health Sciences": {
                "cutoff_range": "6-14",
                "requirements": "Core: English Language, Mathematics, Integrated Science. Most clinical programmes: Biology, Chemistry, and Physics/Mathematics. Medicine and Dentistry require a mandatory entrance examination and interview.",
                "programs": [
                    {"name": "MBChB (Human Biology/Medicine)", "duration": "6 years (includes a 3-year clinical phase)", "cutoff": "6", "entrance_exam": "Yes", "requirements": "Biology, Chemistry, Physics/Mathematics"},
                    {"name": "Bachelor of Dental Surgery (BDS)", "duration": "6 years (includes a 3-year clinical phase)", "cutoff": "6", "entrance_exam": "Yes", "requirements": "Fee-Paying only. Biology, Chemistry, Physics/Mathematics"},
                    {"name": "Doctor of Veterinary Medicine (DVM)", "duration": "6 years", "cutoff": "10", "requirements": "Biology, Chemistry, Physics/Mathematics (Animal Husbandry accepted in place of Biology). Diploma holders (e.g. Pong-Tamale Veterinary School) with 3 years' relevant experience may enter directly into Year 2."},
                    {"name": "BSc Medical Laboratory Science", "duration": "4 years", "cutoff": "7", "campuses": "Main"},
                    {"name": "BSc Medical Laboratory Science (Obuasi Campus)", "duration": "4 years", "cutoff": "9", "campuses": "Obuasi"},
                    {"name": "BSc Nursing", "duration": "4 years", "cutoff": "7", "campuses": "Main", "requirements": "Interview required prior to admission"},
                    {"name": "BSc Nursing (Obuasi Campus)", "duration": "4 years", "cutoff": "12", "campuses": "Obuasi"},
                    {"name": "BSc Nursing (Emergency Option for Practicing Nurses Only)", "requirements": "Must be a registered General Nurse with a Diploma in Nursing, 25+ years old, minimum 2 years clinical experience, and pass an interview"},
                    {"name": "BSc Midwifery (Females only)", "duration": "4 years", "cutoff": "8", "campuses": "Main", "requirements": "Interview required prior to admission"},
                    {"name": "BSc Midwifery (Obuasi Campus)", "duration": "4 years", "cutoff": "13", "campuses": "Obuasi"},
                    {"name": "BSc Midwifery (Females practicing Midwives only, Sandwich)", "requirements": "Registered Midwife with a Diploma in Midwifery, 25+ years old, minimum 2 years clinical experience, pass an interview - taken during holidays"},
                    {"name": "BSc Physiotherapy and Sports Science", "duration": "4 years", "cutoff": "12"},
                    {"name": "Doctor of Pharmacy (Pharm D)", "duration": "6 years", "cutoff": "6"},
                    {"name": "Doctor of Pharmacy (Pharm D), 2-year Top-Up", "requirements": "For practicing Pharmacists only, with a BPharm degree and Pharmacy Licensure Certificate"},
                    {"name": "Bachelor of Herbal Medicine (BHM)", "cutoff": "14"},
                    {"name": "BSc Medical Imaging", "cutoff": "7"},
                    {"name": "BSc Disability and Rehabilitation Studies", "cutoff": "13", "requirements": "3 credits from General Science, General Arts, Business, Visual Art, or Home Economics"}
                ]
            },
            "Humanities and Social Sciences": {
                "cutoff_range": "6-22",
                "requirements": "Core: English Language, Mathematics, Integrated Science. Electives vary by programme - most accept combinations from General Arts, Business, and General Science groupings.",
                "programs": [
                    {"name": "LLB (Bachelor of Laws)", "school": "Faculty of Law", "duration": "4 years", "cutoff": "6", "requirements": "3 electives from General Arts, Business, Visual Art, or General Science"},
                    {"name": "LLB (Degree Holders Only, Fee-Paying)", "school": "Faculty of Law", "duration": "3 years (Parallel mode)", "requirements": "Degree/Higher Degree holders in any discipline; entrance exam and interview required. Mature applicants with a Diploma and 10+ years' experience may also apply."},
                    {"name": "BA Economics", "school": "Faculty of Social Science", "cutoff": "10", "requirements": "Mathematics + 2 electives from General Arts, Business, General Science, Technical, Home Economics, or Visual Arts"},
                    {"name": "BA English", "school": "Faculty of Social Science", "cutoff": "13", "requirements": "3 electives from Literature in English, French, History, Government, Economics, Geography, Akan, Religious Studies, or other General Arts subjects"},
                    {"name": "BA Geography and Rural Development", "school": "Faculty of Social Science", "cutoff": "10", "requirements": "Geography + 2 from Economics, Government, French, Literature in English, Religious Studies, History, Elective Maths, Akan, or other General Arts electives"},
                    {"name": "BA History", "school": "Faculty of Social Science", "cutoff": "15", "requirements": "3 electives from General Arts, Business, General Science, Home Economics, or Visual Art"},
                    {"name": "BA Political Studies", "school": "Faculty of Social Science", "cutoff": "9", "requirements": "3 electives from General Arts, Business, General Science, Home Economics, or Visual Art"},
                    {"name": "Bachelor of Public Administration", "school": "Faculty of Social Science", "cutoff": "11", "requirements": "3 electives from General Arts, Business, General Science, Home Economics, or Visual Art"},
                    {"name": "BA Akan Language and Culture", "school": "Faculty of Social Science", "cutoff": "22", "requirements": "Akan (Asante Twi, Fante, or Akuapem Twi) + 2 from History, Geography, Literature in English, French, Economics, Religious Studies, Government, or Business Management"},
                    {"name": "BA French and Francophone Studies", "school": "Faculty of Social Science", "cutoff": "14", "requirements": "French (A1-B3) + 2 from History, Religious Studies, Economics, Geography, Government, Literature in English, Business Management, or Ghanaian Language"},
                    {"name": "BA Linguistics", "school": "Faculty of Social Science", "cutoff": "15", "requirements": "3 electives from Group A (English Literature, Ghanaian Language, Foreign Language) and/or Group B (History, Geography, Economics, Religious Studies, Government, Business Management)"},
                    {"name": "BA Media and Communication Studies", "school": "Faculty of Social Science", "cutoff": "9", "requirements": "3 relevant elective subjects"},
                    {"name": "BA Religion and Human Development (BA Religious Studies)", "school": "Faculty of Social Science", "cutoff": "20", "requirements": "3 General Arts electives including Christian Religious Studies or Islamic Religious Studies"},
                    {"name": "BA Sociology", "school": "Faculty of Social Science", "cutoff": "11", "requirements": "3 electives from General Arts, General Science, and Business"},
                    {"name": "BA Social Work", "school": "Faculty of Social Science", "cutoff": "11", "requirements": "3 electives from General Arts, General Science, and Business"},
                    {"name": "BSc Business Administration (HRM/Management)", "school": "KNUST School of Business", "cutoff": "7", "campuses": "Main", "requirements": "3 electives from Business, General Arts, or General Science"},
                    {"name": "BSc Business Administration (HRM/Management) (Obuasi Campus)", "school": "KNUST School of Business", "cutoff": "15", "campuses": "Obuasi"},
                    {"name": "BSc Business Administration (Marketing/International Business)", "school": "KNUST School of Business", "cutoff": "9", "campuses": "Main", "requirements": "3 electives from Business, General Arts, or General Science"},
                    {"name": "BSc Business Administration (Marketing/International Business) (Obuasi Campus)", "school": "KNUST School of Business", "cutoff": "16", "campuses": "Obuasi"},
                    {"name": "BSc Business Administration (Accounting/Banking and Finance)", "school": "KNUST School of Business", "cutoff": "7", "campuses": "Main", "requirements": "3 electives from Business, General Arts, or General Science"},
                    {"name": "BSc Business Administration (Accounting/Banking and Finance) (Obuasi Campus)", "school": "KNUST School of Business", "cutoff": "12", "campuses": "Obuasi"},
                    {"name": "BSc Business Administration (Logistics and SCM/Business IT)", "school": "KNUST School of Business", "cutoff": "8", "campuses": "Main", "requirements": "3 electives from Business, General Arts, or General Science"},
                    {"name": "BSc Business Administration (Logistics and SCM/Business IT) (Obuasi Campus)", "school": "KNUST School of Business", "cutoff": "15", "campuses": "Obuasi"},
                    {"name": "BSc Hospitality and Tourism Management", "school": "KNUST School of Business", "cutoff": "10", "requirements": "3 electives from Business, General Arts, General Science, or Vocational/Home Economics"}
                ]
            },
            "Science": {
                "cutoff_range": "6-17",
                "requirements": "Core: English Language, Mathematics, Integrated Science. Electives typically include Biology, Chemistry, and Physics/Mathematics (Biosciences) or Mathematics, Physics, and Chemistry (Physical/Computational Sciences).",
                "programs": [
                    {"name": "BSc Biochemistry", "school": "Faculty of Biosciences", "cutoff": "9", "requirements": "Biology, Chemistry, Physics/Elective Maths"},
                    {"name": "BSc Food Science and Technology", "school": "Faculty of Biosciences", "cutoff": "11", "requirements": "Biology, Chemistry, Physics/Elective Maths"},
                    {"name": "BSc Dietetics", "school": "Faculty of Biosciences", "cutoff": "9", "requirements": "Biology, Chemistry, Physics/Maths OR Food & Nutrition, Management in Living, and Chemistry/Biology"},
                    {"name": "BSc Human Nutrition", "school": "Faculty of Biosciences", "cutoff": "10", "requirements": "Biology, Chemistry, Physics/Maths OR Food & Nutrition, Management in Living, and Chemistry/Biology"},
                    {"name": "BSc Biological Science", "school": "Faculty of Biosciences", "cutoff": "9", "requirements": "Biology, Chemistry, Physics/Elective Maths"},
                    {"name": "BSc Environmental Science", "school": "Faculty of Biosciences", "cutoff": "12", "campuses": "Main", "requirements": "Biology (or Agricultural Science), Chemistry, Physics/Elective Maths"},
                    {"name": "BSc Environmental Science (Obuasi Campus)", "school": "Faculty of Biosciences", "cutoff": "19", "campuses": "Obuasi"},
                    {"name": "Doctor of Optometry", "school": "Faculty of Biosciences", "cutoff": "6", "requirements": "Biology, Physics, and Chemistry/Mathematics; shortlisted applicants must pass an interview"},
                    {"name": "BSc Chemistry", "school": "Faculty of Physical and Computational Sciences", "cutoff": "15", "requirements": "Chemistry, Physics, Mathematics or Biology"},
                    {"name": "BSc Science Laboratory Technology", "school": "Faculty of Physical and Computational Sciences", "requirements": "Chemistry, Biology/Agricultural Science, and Physics/Mathematics"},
                    {"name": "BSc Mathematics", "school": "Faculty of Physical and Computational Sciences", "cutoff": "15", "requirements": "Mathematics, Physics, Chemistry or Biology"},
                    {"name": "BSc Physics", "school": "Faculty of Physical and Computational Sciences", "cutoff": "16"},
                    {"name": "BSc Computer Science", "school": "Faculty of Physical and Computational Sciences", "cutoff": "7", "requirements": "Elective Mathematics, Physics, and Chemistry/Applied Electricity/Electronics"},
                    {"name": "BSc Statistics", "school": "Faculty of Physical and Computational Sciences", "cutoff": "12", "requirements": "Elective Mathematics + 2 elective subjects"},
                    {"name": "BSc Actuarial Science", "school": "Faculty of Physical and Computational Sciences", "cutoff": "10", "requirements": "Elective Mathematics + 2 elective subjects"},
                    {"name": "BSc Meteorology and Climate Science", "school": "Faculty of Physical and Computational Sciences", "cutoff": "17", "requirements": "Mathematics, Physics, Chemistry/Electronics"},
                    {"name": "BSc Information Technology", "school": "Faculty of Physical and Computational Sciences", "cutoff": "10", "requirements": "Mathematics + 2 electives from General Science, General Arts, Business, Visual Art, Technical, or Home Economics"}
                ]
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
        "admission_requirements": {
            "general": "WASSCE: Credit passes (A1-C6) in 6 subjects (4 Core + 3 Electives). Aggregate 24 or better for regular admission. Distance Education: Aggregate 30.",
            "wassce": "Credit passes A1-C6 in English, Core Maths, Integrated Science, Social Studies + 3 relevant electives",
            "sssce": "Credit passes A-D in English, Core Maths, Integrated Science, Social Studies + 3 relevant electives",
            "aggregate_calculation": "Science-related disciplines: English + Core Maths + Integrated Science + 3 Science Electives (Social Studies excluded). Non-Science disciplines: English + Core Maths + Social Studies + 3 Electives (Integrated Science excluded). A lower aggregate is a better/more competitive score.",
            "gce": "3 'A' Level passes + 5 'O' Level credits including English and Maths",
            "ib": "Grade 4+ in 3 HL subjects",
            "mature": "25+ years old, entrance exam, relevant work experience",
            "how_to_apply": "Purchase an E-Voucher from an approved bank - Consolidated Bank Ghana (*924*200*25#), Fidelity Bank (*776*108#), or Prudential Bank (*772*100#), costing about GH¢250. Access the Admissions Portal, complete the application with personal details, academic records, and programme choices, then upload transcripts, certificates, and result slips before the deadline (application window typically runs March-June).",
            "international_applicants": "Do NOT purchase an e-voucher. Apply through the International Programmes Office and pay a non-refundable application fee of US$55.",
            "fee_schedule_status": "The official 2026/2027 fee schedule had not been published as of August 2026; figures here are based on the 2024/2025 and 2025/2026 schedules. Academic Facility User Fees (AFUF) have been maintained at the same rates since 2023/2024.",
            "application_deadline": "August 31, 2026 (Pending WASSCE release)",
            "online_portal": "https://admissions.ug.edu.gh",
            "application_fee": "GH¢ 250 (via *924*200*25#)",
            "entrance_exam": "Required for Medicine, Law, and other competitive programmes",
            "first_choice_policy": "Many competitive programmes (Medicine, Law, Business, Computer Science, Engineering) are strictly 'First Choice Only'. If selecting LLB as first choice, select a BA bouquet as your second choice."
        },
        "contact": {
            "phone": "+233-30-213-8501",
            "email": "admissions@ug.edu.gh",
            "address": "P.O. Box LG 25, Legon, Accra"
        },
        "colleges": {
            "Humanities": {
                "cutoff_range": "7-24",
                "programs": [
                    {"name": "LLB (Law)", "duration": "4 years", "cutoff": "7", "first_choice": "Yes"},
                    {"name": "BSc Administration - Accounting", "cutoff": "9", "first_choice": "Yes"},
                    {"name": "BSc Administration - Banking & Finance", "cutoff": "9", "first_choice": "Yes"},
                    {"name": "BSc Administration - Marketing", "cutoff": "9", "first_choice": "Yes"},
                    {"name": "BSc Administration - Human Resource Management", "cutoff": "9", "first_choice": "Yes"},
                    {"name": "BSc Administration - Public Administration", "cutoff": "9", "first_choice": "Yes"},
                    {"name": "BSc Administration - Insurance", "cutoff": "9", "first_choice": "Yes"},
                    {"name": "BSc Administration - Health Services Management", "cutoff": "9", "first_choice": "Yes"},
                    {"name": "BSc Administration - E-Commerce & Customer Management", "cutoff": "9", "first_choice": "Yes"},
                    {"name": "BA Political Science", "cutoff": "24"},
                    {"name": "BA Economics", "cutoff": "24"},
                    {"name": "BA Geography & Resource Development", "cutoff": "24"},
                    {"name": "BA Psychology", "cutoff": "24"},
                    {"name": "BA Social Work", "cutoff": "24"},
                    {"name": "BA Sociology", "cutoff": "24"},
                    {"name": "BA English", "cutoff": "24"},
                    {"name": "BA French", "cutoff": "24"},
                    {"name": "BA History", "cutoff": "24"},
                    {"name": "BA Archaeology & Heritage Studies", "cutoff": "24"},
                    {"name": "BA Information Studies", "cutoff": "24"},
                    {"name": "BA Music", "cutoff": "24", "requirements": "Audition"},
                    {"name": "BA Theatre Arts", "cutoff": "24", "requirements": "Audition"},
                    {"name": "BA Dance Studies", "cutoff": "24", "requirements": "Audition"}
                ]
            },
            "Basic and Applied Sciences": {
                "cutoff_range": "6-24",
                "requirements": "Credit passes in English, Core Maths, Integrated Science + 3 Science electives (Social Studies excluded from aggregate). Houses 6 schools across engineering, physical/mathematical sciences, biological sciences, agriculture, computer science, earth science, and veterinary medicine. Note: the School of Nuclear and Allied Sciences (SNAS) is graduate-only (MPhil/PhD, run with the Ghana Atomic Energy Commission and IAEA) and does not offer undergraduate programmes.",
                "programs": [
                    {"name": "BSc Biomedical Engineering", "cutoff": "6-7", "first_choice": "Yes", "requirements": "Elective Maths (B3+)"},
                    {"name": "BSc Computer Engineering", "cutoff": "7", "first_choice": "Yes", "requirements": "Elective Maths (B3+)"},
                    {"name": "BSc Computer Science", "cutoff": "7-9", "first_choice": "Yes", "requirements": "Elective Maths (B3+)"},
                    {"name": "BSc Information Technology", "cutoff": "12", "first_choice": "Yes", "requirements": "Core Maths (C4+)"},
                    {"name": "BSc Actuarial Science", "cutoff": "12", "requirements": "Elective Maths (high grade required)"},
                    {"name": "BSc Agricultural Engineering", "cutoff": "15", "requirements": "Elective Maths (B3+)"},
                    {"name": "BSc Food Process Engineering", "cutoff": "14", "requirements": "Elective Maths (B3+)"},
                    {"name": "BSc Materials Science & Engineering", "cutoff": "14", "requirements": "Elective Maths (B3+)"},
                    {"name": "Doctor of Veterinary Medicine", "duration": "6 years", "cutoff": "14", "first_choice": "Yes"},
                    {"name": "BSc Agriculture", "cutoff": "24"},
                    {"name": "BSc Earth Science", "cutoff": "24"},
                    {"name": "BSc Mathematics", "cutoff": "24", "requirements": "Elective Maths required"},
                    {"name": "BSc Mathematical Sciences", "cutoff": "24", "requirements": "Combined departments; Elective Maths required"},
                    {"name": "BSc Statistics", "cutoff": "24"},
                    {"name": "BSc Physics", "cutoff": "24", "requirements": "Physics, Elective Maths required"},
                    {"name": "BSc Geophysics", "cutoff": "24", "requirements": "Physics, Elective Maths required"},
                    {"name": "BSc Chemistry", "cutoff": "24"},
                    {"name": "BSc Biochemistry, Cell & Molecular Biology", "cutoff": "24"},
                    {"name": "BSc Nutrition & Food Science", "cutoff": "24"},
                    {"name": "BSc Animal Biology & Conservation Science", "cutoff": "24"},
                    {"name": "BSc Plant & Environmental Biology", "cutoff": "24"},
                    {"name": "BSc Marine & Fisheries Sciences", "cutoff": "24"}
                ]
            },
            "Health Sciences": {
                "cutoff_range": "8-16",
                "first_choice_only": "Yes",
                "programs": [
                    {"name": "MB ChB (Medicine & Surgery)", "duration": "6 years", "cutoff": "8", "first_choice": "Yes", "entrance_exam": "Yes", "requirements": "Computer-based entrance exam may be required. Electives: Biology, Chemistry, Physics or Elective Maths."},
                    {"name": "Graduate Entry Medical Programme (GEMP)", "duration": "4 years", "cutoff": "N/A (degree required)", "requirements": "Good first degree (min. 2nd Class Lower) in a relevant science field, good grades in 3 core + 3 science electives including Chemistry, national service completion, entrance exam and interview"},
                    {"name": "BDS (Dental Surgery)", "duration": "6 years", "cutoff": "10", "first_choice": "Yes", "entrance_exam": "Yes"},
                    {"name": "Graduate Entry Dental Programme (GEDP)", "duration": "4 years", "cutoff": "N/A (degree required)"},
                    {"name": "Pharm.D (Doctor of Pharmacy)", "duration": "6 years", "cutoff": "10", "first_choice": "Yes"},
                    {"name": "BSc Nursing", "duration": "4 years", "cutoff": "15", "first_choice": "Yes", "requirements": "Non-Science applicants may be considered from General Arts, Home Economics, or Business backgrounds if core requirements are met"},
                    {"name": "BSc Midwifery", "duration": "4 years", "cutoff": "15", "first_choice": "Yes"},
                    {"name": "BSc Medical Laboratory Science", "duration": "4 years", "cutoff": "12", "first_choice": "Yes"},
                    {"name": "BSc Diagnostic Radiography", "duration": "4 years", "cutoff": "13", "first_choice": "Yes"},
                    {"name": "BSc Physiotherapy", "duration": "4 years", "cutoff": "14", "first_choice": "Yes"},
                    {"name": "BSc Dietetics", "duration": "4 years", "cutoff": "14", "first_choice": "Yes"},
                    {"name": "BSc Occupational Therapy", "duration": "4 years", "cutoff": "14-15", "first_choice": "Yes"},
                    {"name": "BSc Respiratory Therapy", "duration": "4 years", "cutoff": "14", "first_choice": "Yes"},
                    {"name": "BSc Physiotherapy (Top-Up)", "requirements": "For diploma holders"},
                    {"name": "BSc Occupational Therapy (Top-Up)", "requirements": "For diploma holders"},
                    {"name": "BSc Radiography (Top-Up)", "requirements": "For diploma holders"},
                    {"name": "BPH (Bachelor of Public Health)", "duration": "4 years", "cutoff": "16", "first_choice": "Yes", "requirements": "Diploma holders (Level 200 entry) need a Diploma in health/related sciences with FGPA 3.2+, plus entrance exam and interview"}
                ]
            },
            "Education": {
                "cutoff_range": "24-30",
                "requirements": "Credit passes in 4 core subjects + 3 relevant elective subjects. Aggregate 24 or better (regular), 30 or better (distance). The School of Continuing and Distance Education offers distance-learning versions of programmes from other colleges for working professionals, with learning centres across Ghana and weekend/evening classes.",
                "programs": [
                    {"name": "B.Ed Education", "cutoff": "24"},
                    {"name": "B.Ed Early Grade Specialism", "cutoff": "24"},
                    {"name": "B.Ed Upper Primary Specialism", "cutoff": "24"},
                    {"name": "B.Ed JHS Specialism", "cutoff": "24"},
                    {"name": "B.Ed Arabic", "cutoff": "24", "requirements": "C6 in French"},
                    {"name": "B.Ed Computer Science", "cutoff": "24"},
                    {"name": "B.Ed Consumer Sciences", "cutoff": "24"},
                    {"name": "B.Ed English", "cutoff": "24", "requirements": "C6 in Literature in English"},
                    {"name": "B.Ed French", "cutoff": "24", "requirements": "C6 in French"},
                    {"name": "B.Ed Ghanaian Language", "cutoff": "24"},
                    {"name": "B.Ed Mathematics", "cutoff": "24", "requirements": "C6 in Elective Mathematics"},
                    {"name": "B.Ed Science", "cutoff": "24", "requirements": "C6 in relevant science subject"},
                    {"name": "B.Ed Social Studies", "cutoff": "24"},
                    {"name": "BA Information Studies", "cutoff": "24"},
                    {"name": "BSc Administration (Accra City Campus)", "cutoff": "24"},
                    {"name": "BA (Accra City Campus)", "cutoff": "24"}
                ]
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
                "Telecel Broadband Levy": "GH¢ 122 (optional)",
                "GRASAG Development Levy": "GH¢ 250 (graduate students only)",
                "Reprographic Fees": "GH¢ 5"
            },
            "payment_policy": "1st Semester: at least 50% before registration; 2nd Semester: 100% before registration; Residential Fees: 100% before hostel registration",
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
        "admission_requirements": {
            "general": "WASSCE: Credit passes (A1-C6) in 6 subjects (3 Core + 3 Electives). Maximum aggregate 36 (more accessible than UG/KNUST). SSSCE: Maximum aggregate 24.",
            "wassce": "Credit passes A1-C6 in English, Core Maths, Integrated Science/Social Studies + 3 relevant electives. Aggregate 36 or better.",
            "sssce": "Credit passes A-D in English, Core Maths, Integrated Science/Social Studies + 3 relevant electives. Aggregate 24 or better.",
            "gce": "5 'O' Level credits + 3 'A' Level passes in relevant subjects",
            "gce_business": "GBCE/ABCE credits in relevant subjects",
            "igcse": "Equivalent grade requirements in relevant subjects",
            "ib": "Grade 4+ in relevant subjects",
            "american_high_school": "Grade 12 certificate with equivalent grades",
            "diploma_hnd": "Assessed individually for Level 100/200/300 placement",
            "mature": "25+ years by June 30, SHS certificate or equivalent, 5+ years work experience, entrance exam",
            "how_to_apply": "Purchase an E-Voucher from GCB Bank, ADB, Fidelity Bank, Ecobank, or Ghana Post, complete the application with personal details, academic records, and programme choices, upload result slips/certificates/identification, then check your status using the voucher serial number and PIN.",
            "study_modes": "Regular (Full-time on-campus); Distance Learning via the College of Distance Education (CoDE); Sandwich/Part-time programmes",
            "status_check_portal": "https://admissions.ucc.edu.gh",
            "application_deadline": "August 31, 2026",
            "online_portal": "https://apply.ucc.edu.gh",
            "application_fee": "Contact university for current fee"
        },
        "contact": {
            "phone": "+233-33-213-2440",
            "email": "admissions@ucc.edu.gh",
            "address": "University of Cape Coast, Cape Coast, Central Region"
        },
        "colleges": {
            "Health and Allied Sciences": {
                "cutoff_range": "8-22",
                "programs": [
                    {"name": "MBChB (Medicine & Surgery)", "duration": "6 years", "cutoff": "8", "entrance_exam": "Yes"},
                    {"name": "Doctor of Pharmacy (PharmD)", "duration": "6 years", "cutoff": "9"},
                    {"name": "BSc Physician Assistant Studies", "duration": "4 years", "cutoff": "11"},
                    {"name": "BSc Nursing", "duration": "4 years", "cutoff": "12"},
                    {"name": "BSc Midwifery", "duration": "4 years", "cutoff": "12"},
                    {"name": "Doctor of Optometry", "duration": "6 years", "cutoff": "12"},
                    {"name": "BSc Medical Laboratory Science", "duration": "4 years", "cutoff": "12"},
                    {"name": "BSc Mental Health Nursing", "duration": "4 years", "cutoff": "14"},
                    {"name": "BSc Community Mental Health Nursing", "duration": "4 years", "cutoff": "14"},
                    {"name": "BSc Clinical Nutrition & Dietetics", "duration": "4 years", "cutoff": "14"},
                    {"name": "BSc Biomedical Sciences", "duration": "4 years", "cutoff": "14"},
                    {"name": "BSc Diagnostic Imaging Technology", "duration": "4 years", "cutoff": "14"},
                    {"name": "BSc Diagnostic Medical Sonography", "duration": "4 years", "cutoff": "14"},
                    {"name": "BSc Health Information Management", "duration": "4 years", "cutoff": "16"},
                    {"name": "BSc Sports & Exercise Science", "duration": "4 years", "cutoff": "16"}
                ]
            },
            "Humanities and Legal Studies": {
                "cutoff_range": "8-25",
                "programs": [
                    {"name": "LLB (Law)", "duration": "4 years", "cutoff": "8-10"},
                    {"name": "LLB (3-year Post-First-Degree)", "duration": "3 years", "requirements": "Degree + entrance exam"},
                    {"name": "BSc Economics", "cutoff": "15"},
                    {"name": "BSc Economics with Finance", "cutoff": "15"},
                    {"name": "BA Economics", "cutoff": "16"},
                    {"name": "BBA Accounting", "cutoff": "15"},
                    {"name": "BBA Human Resource Management", "cutoff": "16"},
                    {"name": "BBA Management", "cutoff": "16"},
                    {"name": "B.Com Finance", "cutoff": "15"},
                    {"name": "B.Com Marketing", "cutoff": "16"},
                    {"name": "B.Com Management", "cutoff": "16"},
                    {"name": "B.Com Procurement & Supply Chain Management", "cutoff": "16"},
                    {"name": "B.Com Commerce", "cutoff": "16"},
                    {"name": "BSc Hospitality Management", "cutoff": "16"},
                    {"name": "BSc Tourism Management", "cutoff": "16"},
                    {"name": "BA Communication Studies", "cutoff": "17"},
                    {"name": "BA English", "cutoff": "18"},
                    {"name": "BA Sociology", "cutoff": "18"},
                    {"name": "BA Population & Health", "cutoff": "18"},
                    {"name": "BSc Geography & Regional Planning", "cutoff": "18"},
                    {"name": "BA History", "cutoff": "19"},
                    {"name": "BA African Studies", "cutoff": "19"},
                    {"name": "BA French", "cutoff": "20"},
                    {"name": "BA Theatre Studies", "cutoff": "20"},
                    {"name": "BA Film Studies", "cutoff": "20"},
                    {"name": "BA Social Behaviour & Conflict Management", "cutoff": "20"},
                    {"name": "BA Anthropology", "cutoff": "22"},
                    {"name": "BA Dance", "cutoff": "22"},
                    {"name": "Bachelor of Music (B.Mus)", "cutoff": "22"},
                    {"name": "BA Ghanaian Language & Linguistics", "cutoff": "22"},
                    {"name": "BA Classics & Philosophy", "cutoff": "22"},
                    {"name": "BA Religious Studies", "cutoff": "22"},
                    {"name": "BA Chinese", "cutoff": "25"}
                ]
            },
            "Education Studies": {
                "cutoff_range": "18-24",
                "programs": [
                    {"name": "B.Ed Accounting", "cutoff": "18"},
                    {"name": "B.Ed Mathematics", "cutoff": "18"},
                    {"name": "B.Ed Computer Science / ICT", "cutoff": "18"},
                    {"name": "B.Ed Robotics & Intelligent Systems", "cutoff": "18"},
                    {"name": "B.Ed Arts", "cutoff": "20"},
                    {"name": "B.Ed Social Science", "cutoff": "20"},
                    {"name": "B.Ed Social Studies", "cutoff": "20"},
                    {"name": "B.Ed Management", "cutoff": "20"},
                    {"name": "B.Ed Science", "cutoff": "20"},
                    {"name": "B.Ed Health Science", "cutoff": "20"},
                    {"name": "B.Ed Health, Physical Education & Recreation", "cutoff": "22"},
                    {"name": "B.Ed Home Economics", "cutoff": "22"},
                    {"name": "B.Ed Basic Education", "cutoff": "22"},
                    {"name": "B.Ed Early Childhood Education", "cutoff": "24"}
                ]
            },
            "Agriculture and Natural Sciences": {
                "cutoff_range": "14-24",
                "programs": [
                    {"name": "BSc Actuarial Science", "cutoff": "14"},
                    {"name": "BSc Forensic Science", "cutoff": "14"},
                    {"name": "BSc Computer Science", "cutoff": "15"},
                    {"name": "BSc Biochemistry", "cutoff": "16"},
                    {"name": "BSc Molecular Biology & Biotechnology", "cutoff": "16"},
                    {"name": "BSc Information Technology", "cutoff": "16"},
                    {"name": "BSc Agribusiness", "cutoff": "18"},
                    {"name": "BSc Fisheries & Aquatic Science", "cutoff": "18"},
                    {"name": "BSc Environmental Science", "cutoff": "18"},
                    {"name": "BSc Mathematics", "cutoff": "18"},
                    {"name": "BSc Statistics", "cutoff": "18"},
                    {"name": "BSc Mathematics & Statistics", "cutoff": "18"},
                    {"name": "BSc Mathematics with Business", "cutoff": "18"},
                    {"name": "BSc Mathematics with Economics", "cutoff": "18"},
                    {"name": "BSc Engineering Physics", "cutoff": "18"},
                    {"name": "BSc Industrial Chemistry", "cutoff": "18"},
                    {"name": "BSc Laboratory Technology", "cutoff": "18"},
                    {"name": "BSc Agriculture", "cutoff": "20"},
                    {"name": "BSc Agro-Processing", "cutoff": "20"},
                    {"name": "BSc Animal Health", "cutoff": "20"},
                    {"name": "BSc Physics", "cutoff": "20"},
                    {"name": "BSc Chemistry", "cutoff": "20"},
                    {"name": "BSc Agricultural Extension & Community Development", "cutoff": "22"},
                    {"name": "BSc Entomology & Wildlife", "cutoff": "20"},
                    {"name": "BSc Meteorology & Atmospheric Physics", "cutoff": "22"},
                    {"name": "BSc Water & Sanitation", "cutoff": "22"}
                ]
            },
            "Distance Education (CoDE)": {
                "cutoff_range": "Generally higher aggregate thresholds than regular admission (more accessible entry)",
                "requirements": "Provides distance learning versions of programmes from other colleges for working professionals and remote students. Study centres across all regions of Ghana, weekend/evening classes with online components. Awards the same UCC degree upon completion.",
                "programs": [
                    {"name": "B.Ed Basic Education (Distance)"},
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
                "Humanities/Arts/Education": "~GH¢ 1,300-2,400",
                "Social Sciences/Business/Economics": "~GH¢ 1,500-2,500",
                "Sciences/Agriculture": "~GH¢ 1,600-3,000",
                "Health Sciences (Nursing/Allied Health)": "~GH¢ 2,500-3,500+",
                "Health Sciences (Medicine/Pharmacy)": "~GH¢ 3,000-4,000+",
                "Distance Education": "Varies by programme"
            },
            "payment_policy": "1st Semester: at least 50% before registration; 2nd Semester: 100% before registration. Fee amount confirmed via the admission letter (freshmen) or Student Portal (continuing students). Residential students pay additional accommodation fees on top of tuition.",
            "international_students": "Fees are higher and typically quoted in USD equivalents; contact the International Programmes Office for exact amounts."
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
            
            # Build program list for this college
            prog_lines = []
            for prog in prog_list:
                if isinstance(prog, dict):
                    prog_name = prog.get("name", "")
                    cutoff = prog.get("cutoff", "")
                    duration = prog.get("duration", "")
                    reqs = prog.get("requirements", "")
                    first_choice = prog.get("first_choice", "")
                    entrance_exam = prog.get("entrance_exam", "")
                    
                    parts = [f"  - **{prog_name}**"]
                    if cutoff:
                        parts.append(f"Cut-off: {cutoff}")
                    if duration:
                        parts.append(f"Duration: {duration}")
                    if reqs:
                        parts.append(f"Requirements: {reqs}")
                    if first_choice == "Yes":
                        parts.append("⚠️ FIRST CHOICE ONLY")
                    if entrance_exam == "Yes":
                        parts.append("📝 Entrance Exam Required")
                    prog_lines.append(" | ".join(parts))
                else:
                    prog_lines.append(f"  - {prog}")
            
            if prog_lines:
                req_line = f"**Requirements:** {college_reqs}" if college_reqs else ""
                college_sections.append(f"""
### {college_name}
**Cut-off Range:** {college_cutoff if college_cutoff else 'Varies by programme'}
{req_line}

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
    
    context = f"""
# {uni_name}

**Location:** {uni_data.get('location', 'Ghana')}
**Established:** {uni_data.get('established', 'N/A')}
**Type:** {uni_data.get('type', 'Public')}
**Website:** {uni_data.get('website', 'N/A')}

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
        
        # Strategy 1: Exact university name match
        for variation, uni_name in self.name_variations.items():
            if variation in query_lower:
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
        
        # Sort by score - but a university the person explicitly named (Strategy 1)
        # always outranks one that only scored from generic keyword/program-name
        # volume. Without this, a university with many matching program names
        # (e.g. KNUST's many "Engineering" programs) can numerically bury the one
        # university actually named in the question.
        #
        # More importantly: when the query DOES explicitly name a university (or
        # several), scope the results down to just those - don't let 3-4 other
        # universities that only scored via generic keyword overlap ride along.
        # Every result here gets its FULL context concatenated and sent to the
        # LLM in one prompt, so including unrelated universities doesn't just
        # waste tokens - it visibly confuses the answer (e.g. a KNUST-specific
        # question getting a reply about "only having University of Ghana data"
        # because Ghana's data was buried in the same mixed-up prompt).
        if name_matched_universities:
            scored = {uni: s for uni, s in scored.items() if uni in name_matched_universities}

        sorted_results = sorted(
            scored.items(),
            key=lambda x: (x[0] in name_matched_universities, x[1]),
            reverse=True
        )
        
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
        """Find programs within a university that match the query."""
        matches = []
        data = self.universities.get(uni_name, {})
        
        # Search in colleges
        if "colleges" in data:
            for college_name, college_data in data["colleges"].items():
                for prog in college_data.get("programs", []):
                    if isinstance(prog, dict):
                        prog_name = prog.get("name", "")
                        if any(word in prog_name.lower() for word in query.split()) or \
                           any(word in json.dumps(prog).lower() for word in query.split()):
                            matches.append(prog_name)
        
        # Search in programs
        if "programs" in data:
            for prog_name, prog_data in data["programs"].items():
                if any(word in prog_name.lower() for word in query.split()):
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


def search_local_knowledge(query: str, university_name: str = None, chat_history: List[Dict] = None) -> Dict[str, Any]:
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
    
    # If this message doesn't itself name a university, a natural follow-up
    # like "what about civil engineering there?" has nothing for search() to
    # anchor to and can silently drift to whichever university happens to
    # score highest on generic keyword overlap. Check recent chat history for
    # the last message that DID explicitly name a university, and anchor the
    # search to it - this only fires when the current message has no explicit
    # match of its own, so a genuine topic change still overrides it normally.
    search_query = query
    query_lower = query.lower()
    already_explicit = any(
        re.search(r'\b' + re.escape(variation) + r'\b', query_lower)
        for variation in university_kb.name_variations.keys()
    )
    if not already_explicit and chat_history:
        for past_message in reversed(chat_history[-8:]):
            past_text = (past_message.get("content") or "").lower()
            anchor_uni = None
            for variation, uni_name in university_kb.name_variations.items():
                if re.search(r'\b' + re.escape(variation) + r'\b', past_text):
                    anchor_uni = uni_name
                    break
            if anchor_uni:
                search_query = f"{anchor_uni} {query}"
                break
    
    results = university_kb.search(search_query)
    
    # Check for cut-off based queries
    agg_match = re.search(r'aggregate\s*(\d+)', query.lower())
    if agg_match and results:
        aggregate = int(agg_match.group(1))
        program_matches = find_programs_by_cutoff(aggregate, university_kb)
        if program_matches:
            for match in program_matches[:5]:
                uni_data = university_kb.get_university(match["university"])
                # Unlike the program-type branch below, this loop previously had
                # no duplicate check - a university with several programs near
                # the given aggregate (e.g. KNUST) could get appended as 5
                # separate near-identical result entries, each carrying its own
                # full copy of the same university's context into the prompt.
                if uni_data and not any(r.get("source") == match["university"] for r in results):
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
8. **PLAIN MARKDOWN ONLY - NO HTML**: Never output raw HTML tags such as <br>, <table>, <div>, <b>, <li>, etc. This chat renders Markdown, not HTML — for a line break just start a new line, for emphasis use **bold** or *italic*, for lists use "-" or "1.".

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


def generate_smart_fallback_response(
    query: str, context: str, sources: List[Dict], user_profile: Dict = None
) -> str:
    """Generate fallback response using the knowledge base directly."""
    query_lower = query.lower()
    
    results = university_kb.search(query)
    
    if results:
        response_parts = []
        
        for result in results[:3]:
            uni_name = result["source"]
            uni_data = result["data"]
            
            if result.get("matched_program"):
                # This is a program match
                prog_name = result["matched_program"]
                cutoff = result.get("matched_cutoff", "N/A")
                duration = result.get("duration", "4 years")
                first_choice = result.get("first_choice", "")
                
                response_parts.append(f"""
### {prog_name} at {uni_name}

**Cut-off Range:** {cutoff}
**Duration:** {duration}
{f'**⚠️ FIRST CHOICE ONLY**' if first_choice == 'Yes' else ''}

Let me know if you'd like more details about this program!
""")
            else:
                # General university info
                programs = []
                if "colleges" in uni_data:
                    for college_name, college_data in uni_data["colleges"].items():
                        for prog in college_data.get("programs", [])[:3]:
                            if isinstance(prog, dict):
                                prog_name = prog.get("name", "")
                                cutoff = prog.get("cutoff", "")
                                programs.append(f"  - {prog_name}: {cutoff}")
                elif "programs" in uni_data:
                    for prog_name, prog_data in list(uni_data["programs"].items())[:3]:
                        if isinstance(prog_data, dict):
                            programs.append(f"  - {prog_name}")
                        else:
                            programs.append(f"  - {prog_name}")
                
                response_parts.append(f"""
### {uni_name}

**Programs:**
{chr(10).join(programs) if programs else "  - See website for full list"}

**Deadline:** {uni_data.get('admission_requirements', {}).get('application_deadline', 'Check website')}

Would you like more information about any specific program at {uni_name}?
""")
        
        if response_parts:
            return "Here's what I found based on your question:\n\n" + "\n\n---\n\n".join(response_parts)
    
    # Ultimate fallback - list all universities
    uni_list = []
    for uni_name, data in university_kb.universities.items():
        prog_count = len(data.get("programs", {})) or sum(len(c.get("programs", [])) for c in data.get("colleges", {}).values())
        deadlines = data.get("admission_requirements", {})
        deadline = deadlines.get("application_deadline", "Check website")
        uni_list.append(f"- **{uni_name}**: {prog_count} programs | Deadline: {deadline}")
    
    return f"""
That's a great question! I have detailed information about these Ghanaian universities:

{chr(10).join(uni_list)}

What specific information would you like to know about any of these universities? I can help with:
- **Cut-off points** for specific programs
- **Subject requirements** for admission
- **Application deadlines**
- **Entrance exam dates**
- **Program recommendations** based on your aggregate
- **Fees** and scholarships

Just let me know what you're looking for! 😊
"""


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

        local_matches = search_local_knowledge(user_message, request.university_name, request.chat_history)
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

        if local_matches.get("confidence", 0.0) >= 0.95:
            print("⚡ Fast Path: Skipping web search due to exact university match")
            combined_context = "\n\n".join(context_segments)
            combined_context = combined_context[:12000]  # sized to stay under the Groq account's 8000 TPM rate limit even with multiple matched universities, while still far fuller than the original 8000-char cap
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
            combined_context = combined_context[:12000]  # sized to stay under the Groq account's 8000 TPM rate limit even with multiple matched universities, while still far fuller than the original 8000-char cap
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
        combined_context = combined_context[:12000]  # sized to stay under the Groq account's 8000 TPM rate limit even with multiple matched universities, while still far fuller than the original 8000-char cap
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
