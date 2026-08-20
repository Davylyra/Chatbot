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

# ============================================================================
# EXISTING CONFIGURATION - KEEPING ALL ORIGINAL VARIABLES
# ============================================================================

def sanitize_markdown_urls(text: str) -> str:
    """Original function - kept exactly as is"""
    if not text:
        return text

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

# Groq model config - kept as env-overridable constants
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
# ORIGINAL HARDCODED UNIVERSITY DATA - PRESERVED
# ============================================================================

GHANA_UNIVERSITIES_KNOWLEDGE = {
    "Kwame Nkrumah University of Science and Technology": {
        "location": "Kumasi, Ashanti Region",
        "established": "1952",
        "website": "www.knust.edu.gh",
        "programs": {
            "Computer Engineering": {
                "duration": "4 years",
                "requirements": "WASSCE: A1-B3 in Maths, Physics, Chemistry, English (Agg 6-12)",
                "career_prospects": "Software Engineer, Systems Analyst, Tech Lead",
            },
            "Civil Engineering": {
                "duration": "4 years",
                "requirements": "WASSCE: A1-B3 in Maths, Physics, Chemistry, English",
                "career_prospects": "Civil Engineer, Project Manager",
            },
            "Medicine": {
                "duration": "6 years",
                "requirements": "WASSCE: A1-B3 in Biology, Chemistry, Physics, Maths, English",
                "career_prospects": "Medical Doctor, Surgeon",
            },
            "Architecture": {
                "duration": "5 years",
                "requirements": "WASSCE: A1-C6 in Maths, Physics, English + Art or Technical Drawing",
                "career_prospects": "Architect, Urban Planner",
            },
            "Electrical Engineering": {
                "duration": "4 years",
                "requirements": "WASSCE: A1-B3 in Maths, Physics, Chemistry, English",
                "career_prospects": "Electrical Engineer, Power Systems Specialist",
            },
        },
        "admission_requirements": {
            "general": "WASSCE with minimum aggregate 24 for most programs",
            "application_deadline": "August 31, 2026",
            "entrance_exam": "Required for Engineering and Medicine",
            "online_portal": "https://admissions.knust.edu.gh",
        },
        "contact": {"phone": "+233-32-206-0331", "email": "admissions@knust.edu.gh"},
        "scholarships": {
            "knust_excellence": "Merit-based full scholarships",
            "mastercard_foundation": "For disadvantaged but brilliant students",
        },
    },
    "University of Ghana": {
        "location": "Legon, Accra",
        "established": "1948",
        "website": "www.ug.edu.gh",
        "programs": {
            "Computer Science": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Maths, Physics, Elective Maths + 2 others",
                "career_prospects": "Software Developer, Data Scientist",
            },
            "Medicine": {
                "duration": "6 years",
                "requirements": "WASSCE: A1-B3 in Biology, Chemistry, Physics, Maths, English",
                "career_prospects": "Doctor, Medical Researcher, Specialist",
            },
            "Business Administration": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Maths, Economics + 3 others",
                "career_prospects": "Manager, Entrepreneur, Consultant",
            },
            "Law": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Maths + Social Sciences",
                "career_prospects": "Lawyer, Judge, Legal Consultant",
            },
            "Economics": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Maths, Economics",
                "career_prospects": "Economist, Policy Analyst",
            },
        },
        "admission_requirements": {
            "general": "WASSCE with minimum of 6 credits (A1-C6) including English and Maths",
            "application_deadline": "August 31, 2026 (Pending WASSCE release)",
            "entrance_exam": "Required for competitive programs",
            "online_portal": "https://admissions.ug.edu.gh",
        },
        "contact": {"phone": "+233-30-213-8501", "email": "admissions@ug.edu.gh"},
        "scholarships": {
            "ug_excellence": "Up to 100% tuition coverage for outstanding students",
            "sabre_scholarship": "For students from Northern Ghana",
        },
    },
    "University of Cape Coast": {
        "location": "Cape Coast, Central Region",
        "established": "1962",
        "website": "www.ucc.edu.gh",
        "programs": {
            "Education": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Maths + relevant subjects",
                "career_prospects": "Teacher, Education Administrator",
            },
            "Nursing": {
                "duration": "4 years",
                "requirements": "WASSCE: A1-C6 in English, Maths, Biology, Chemistry",
                "career_prospects": "Registered Nurse, Healthcare Professional",
            },
            "Business Administration": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Maths, Economics + 3 others",
                "career_prospects": "Business Manager, Entrepreneur",
            },
            "Agriculture": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Maths, Science subjects",
                "career_prospects": "Agricultural Officer, Agribusiness Manager",
            },
        },
        "admission_requirements": {
            "general": "WASSCE with 6 credits minimum including English and Maths",
            "application_deadline": "August 31, 2026",
            "online_portal": "https://admissions.ucc.edu.gh",
        },
        "contact": {"phone": "+233-33-213-2440", "email": "admissions@ucc.edu.gh"},
        "scholarships": {
            "teacher_training": "Full scholarships for teacher trainees",
            "excellence_awards": "Merit-based scholarships",
        },
    },
    "University for Development Studies": {
        "location": "Tamale, Northern Region",
        "established": "1992",
        "website": "www.uds.edu.gh",
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
        "scholarships": {
            "energy_scholarship": "For students in energy-related programs"
        },
    },
    "University of Education, Winneba": {
        "location": "Winneba, Central Region",
        "established": "1992",
        "website": "www.uew.edu.gh",
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
        "scholarships": {
            "teacher_training": "Government scholarships for teacher trainees"
        },
    },
    "University of Mines and Technology": {
        "location": "Tarkwa, Western Region",
        "established": "2004",
        "website": "www.umat.edu.gh",
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
        "scholarships": {
            "mining_scholarship": "For students in mining-related programs"
        },
    },
    "University of Health and Allied Sciences": {
        "location": "Ho, Volta Region",
        "established": "2011",
        "website": "www.uhas.edu.gh",
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
        },
        "contact": {"phone": "+233-30-295-4900", "email": "admissions@gctu.edu.gh"},
        "scholarships": {"ict_scholarship": "For outstanding ICT students"},
    },
    "Takoradi Technical University": {
        "location": "Takoradi, Western Region",
        "established": "1954",
        "website": "www.ttu.edu.gh",
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
        "scholarships": {
            "technical_scholarship": "For outstanding technical program students"
        },
    },
    "University of Professional Studies, Accra": {
        "location": "Accra, Greater Accra",
        "established": "1965",
        "website": "www.upsa.edu.gh",
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
# ORIGINAL NAME VARIATIONS - PRESERVED
# ============================================================================

UNI_NAME_VARIATIONS = {
    "university of ghana": "University of Ghana",
    "ug": "University of Ghana",
    "legon": "University of Ghana",
    "knust": "Kwame Nkrumah University of Science and Technology",
    "kwame nkrumah": "Kwame Nkrumah University of Science and Technology",
    "kumasi": "Kwame Nkrumah University of Science and Technology",
    "ucc": "University of Cape Coast",
    "cape coast": "University of Cape Coast",
    "uds": "University for Development Studies",
    "tamale": "University for Development Studies",
    "upsa": "University of Professional Studies",
    "uenr": "University of Energy and Natural Resources",
    "sunyani": "University of Energy and Natural Resources",
    "uhas": "University of Health and Allied Sciences",
    "ho": "University of Health and Allied Sciences",
    "gctu": "Ghana Communication Technology University",
    "gctU": "Ghana Communication Technology University",
    "communication technology": "Ghana Communication Technology University",
    "gimpa": "Ghana Institute of Management and Public Administration",
    "ashesi": "Ashesi University",
    "berekuso": "Ashesi University",
    "gtuc": "Ghana Technology University College",
    "central": "Central University",
    "valley view": "Valley View University",
    "presbyterian": "Presbyterian University",
    "methodist": "Methodist University",
    "academic city": "Academic City University",
    "umat": "University of Mines and Technology",
    "tarkwa": "University of Mines and Technology",
    "mines": "University of Mines and Technology",
    "uew": "University of Education, Winneba",
    "winneba": "University of Education, Winneba",
    "education winneba": "University of Education, Winneba",
}

# ============================================================================
# ENHANCED UNIVERSITY DATA LOADER - NEW BUT COMPATIBLE
# ============================================================================

class UniversityDataParser:
    """Parser for university context files - keeps all existing data intact"""
    
    def __init__(self):
        self.current_year = datetime.now().year
        
    def parse_file(self, content: str, uni_name: str) -> Dict[str, Any]:
        """Parse a university context file into structured data."""
        parsed = {
            "name": uni_name,
            "programs": {},
            "admission_requirements": {},
            "deadlines": {},
            "cutoff_points": {},
            "entrance_exams": [],
            "fees": {},
            "contact": {},
            "application_fee": None,
            "raw_content": content,
            "study_options": [],
            "special_notes": []
        }
        
        self._parse_programs(content, parsed)
        self._parse_cutoff_points(content, parsed)
        self._parse_deadlines(content, parsed)
        self._parse_requirements(content, parsed)
        self._parse_contact_info(content, parsed)
        self._parse_fees(content, parsed)
        self._parse_entrance_exams(content, parsed)
        self._parse_study_options(content, parsed)
        self._parse_special_notes(content, parsed)
        
        return parsed
    
    def _parse_programs(self, content: str, parsed: Dict[str, Any]):
        """Parse program information including cut-offs and requirements."""
        lines = content.split('\n')
        current_section = None
        program_patterns = [
            r'^([A-Z][a-zA-Z\s\.\-]+?)\s+(\d+(?:\(?\d*\)?)?)\s+(\d+(?:\(?\d*\)?)?|[-])\s+([-\d]+)?\s*(.*?)$',
            r'^([A-Z][a-zA-Z\s\.\-]+?)\s+(\d+)\s+([-\d]+)\s+([-\d]+)?\s*(.*?)$',
            r'^([A-Z][a-zA-Z\s\.\-]+?)\s+(\d+)\s+([-\d]+)\s+(.*?)$',
        ]
        
        for i, line in enumerate(lines):
            line = line.strip()
            if not line:
                continue
            
            if any(x in line for x in ['College of', 'Faculty of', 'School of', 'Department of']):
                current_section = line
                continue
            
            for pattern in program_patterns:
                match = re.match(pattern, line)
                if match:
                    groups = match.groups()
                    prog_name = groups[0].strip()
                    
                    cut_offs = []
                    reqs = []
                    
                    for g in groups[1:]:
                        if g and g != '-':
                            if any(x in g for x in ['Maths', 'Science', 'Chemistry', 'Physics', 'Biology', 'English']):
                                reqs.append(g)
                            else:
                                cut_offs.append(g)
                    
                    program_data = {
                        "name": prog_name,
                        "section": current_section,
                        "cut_offs": cut_offs,
                        "requirements": ' '.join(reqs) if reqs else '',
                        "raw_line": line
                    }
                    
                    parsed["programs"][prog_name] = program_data
                    break
    
    def _parse_cutoff_points(self, content: str, parsed: Dict[str, Any]):
        """Parse cut-off point tables specifically."""
        cutoff_sections = re.findall(r'(CUT-OFF POINTS|CUT OFF POINTS|ADMISSIONS CUT-OFF).*?([\s\S]+?)(?=\n\n[A-Z][A-Z\s]+:|Contacts:|NB:|$)',
                                    content, re.IGNORECASE | re.DOTALL)
        
        for section_title, section_content in cutoff_sections:
            lines = section_content.strip().split('\n')
            for line in lines:
                line = line.strip()
                if not line or line.startswith('NB:'):
                    continue
                    
                match = re.match(r'^([A-Z][a-zA-Z\s\.\-]+?)\s+(\d+(?:\s*[/*]\s*\d+)?(?:\s*\(?\d*\)?)?)', line)
                if match:
                    prog_name = match.group(1).strip()
                    cutoff = match.group(2).strip()
                    
                    if prog_name not in parsed["cutoff_points"]:
                        parsed["cutoff_points"][prog_name] = []
                    parsed["cutoff_points"][prog_name].append(cutoff)
    
    def _parse_deadlines(self, content: str, parsed: Dict[str, Any]):
        """Parse application deadlines."""
        deadline_patterns = [
            (r'Application\s+Deadline\s*[:.]?\s*([A-Za-z]+\s+\d+,\s+\d{4})', 'application_deadline'),
            (r'closing date for (?:submission of )?applications?\s+is\s+([A-Za-z]+\s+\d+,\s+\d{4})', 'closing_date'),
            (r'deadline for submission of applications?\s+is\s+([A-Za-z]+\s+\d+,\s+\d{4})', 'submission_deadline'),
            (r'application\s+opens\s+([A-Za-z]+\s+\d+,\s+\d{4})', 'application_opens'),
            (r'application\s+closes\s+([A-Za-z]+\s+\d+,\s+\d{4})', 'application_closes'),
        ]
        
        for pattern, key in deadline_patterns:
            matches = re.findall(pattern, content, re.IGNORECASE)
            if matches:
                parsed["deadlines"][key] = matches[0]
    
    def _parse_requirements(self, content: str, parsed: Dict[str, Any]):
        """Parse admission requirements."""
        req_sections = re.findall(
            r'(?:GENERAL ENTRY REQUIREMENTS|ENTRY REQUIREMENTS|ADMISSION REQUIREMENTS)[\s\S]+?(?=\n\n[A-Z][A-Z\s]+:|$)',
            content, re.IGNORECASE
        )
        
        if req_sections:
            parsed["admission_requirements"]["general"] = req_sections[0].strip()
        
        qual_patterns = [
            (r'WASSCE.*?(?:credit|pass).*?(?:\n\n|$)', 'wassce'),
            (r'SSSCE.*?(?:credit|pass).*?(?:\n\n|$)', 'sssce'),
            (r'GCE.*?(?:credit|pass).*?(?:\n\n|$)', 'gce'),
            (r'HND.*?(?:credit|pass).*?(?:\n\n|$)', 'hnd'),
            (r'Diploma.*?(?:credit|pass).*?(?:\n\n|$)', 'diploma'),
            (r'Mature.*?(?:credit|pass).*?(?:\n\n|$)', 'mature'),
        ]
        
        for pattern, key in qual_patterns:
            matches = re.findall(pattern, content, re.IGNORECASE | re.DOTALL)
            if matches:
                parsed["admission_requirements"][key] = matches[0].strip()
    
    def _parse_contact_info(self, content: str, parsed: Dict[str, Any]):
        """Parse contact information."""
        contact_patterns = [
            (r'Phone\s*[:.]?\s*([+0-9\s\-\(\)]+)', 'phone'),
            (r'Tel\s*[:.]?\s*([+0-9\s\-\(\)]+)', 'phone'),
            (r'WhatsApp\s*[:.]?\s*([+0-9\s\-\(\)]+)', 'whatsapp'),
            (r'Email\s*[:.]?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})', 'email'),
            (r'Website\s*[:.]?\s*(?:https?://)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})', 'website'),
        ]
        
        for pattern, key in contact_patterns:
            matches = re.findall(pattern, content, re.IGNORECASE)
            if matches:
                parsed["contact"][key] = matches[0].strip()
    
    def _parse_fees(self, content: str, parsed: Dict[str, Any]):
        """Parse fee information."""
        fee_patterns = [
            (r'(?:Cost|Application Fee|Form Fee)\s*[:.]?\s*[GH₵]?(\d+\.?\d*)', 'application_fee'),
            (r'(?:Tuition|School)\s+Fees.*?([\d,]+\.?\d*)', 'tuition_fees'),
            (r'(?:E-voucher|Voucher)\s*[:.]?\s*[GH₵]?(\d+\.?\d*)', 'voucher_fee'),
        ]
        
        for pattern, key in fee_patterns:
            matches = re.findall(pattern, content, re.IGNORECASE)
            if matches:
                parsed["fees"][key] = matches[0]
        
        intl_fee = re.search(r'International\s+Forms?\s*[:.]?\s*[USD$]?(\d+\.?\d*)', content, re.IGNORECASE)
        if intl_fee:
            parsed["fees"]["international_fee"] = intl_fee.group(1)
    
    def _parse_entrance_exams(self, content: str, parsed: Dict[str, Any]):
        """Parse entrance examination information."""
        exam_patterns = [
            r'(entrance\s+examination|entrance\s+exam).*?(?:will be held|is scheduled for|takes place on|date is)\s+([A-Za-z]+\s+\d+\s*(?:-|to|,)\s*[A-Za-z]+\s+\d+|\d+[a-z]+\s+[A-Za-z]+\s+\d{4})',
            r'(entrance\s+examination|entrance\s+exam).*?(?:from|on)\s+([A-Za-z]+\s+\d+\s*(?:-|to|,)\s*[A-Za-z]+\s+\d+)',
        ]
        
        for pattern in exam_patterns:
            matches = re.findall(pattern, content, re.IGNORECASE | re.DOTALL)
            for match in matches:
                exam_data = {
                    "name": match[0] if isinstance(match, tuple) else match,
                    "date": match[1] if isinstance(match, tuple) and len(match) > 1 else ""
                }
                parsed["entrance_exams"].append(exam_data)
    
    def _parse_study_options(self, content: str, parsed: Dict[str, Any]):
        """Parse study options."""
        study_patterns = [
            r'(Day|Evening|Weekend|Sandwich|Distance|Regular|Full-time|Part-time)',
        ]
        
        options = set()
        for pattern in study_patterns:
            matches = re.findall(pattern, content, re.IGNORECASE)
            for match in matches:
                option = match.strip().title()
                if option in ['Day', 'Evening', 'Weekend', 'Sandwich', 'Distance', 'Regular', 'Full-time', 'Part-time']:
                    options.add(option)
        
        if options:
            parsed["study_options"] = list(options)
    
    def _parse_special_notes(self, content: str, parsed: Dict[str, Any]):
        """Parse special notes."""
        note_patterns = [
            r'(NB:|NOTE:|NOTICE:|Important|Please note)[\s\S]+?(?=\n\n|\Z)',
            r'(affirmative action|only female|only male|gender)',
        ]
        
        for pattern in note_patterns:
            matches = re.findall(pattern, content, re.IGNORECASE)
            for match in matches:
                if isinstance(match, str) and len(match) > 20:
                    parsed["special_notes"].append(match.strip())
                elif isinstance(match, tuple):
                    parsed["special_notes"].append(' '.join(match).strip())

# ============================================================================
# ENHANCED KNOWLEDGE BASE - KEEPS ALL ORIGINAL DATA
# ============================================================================

class EnhancedUniversityKnowledgeBase:
    """Enhanced knowledge base - maintains all original data + adds enhancements"""
    
    def __init__(self):
        self.universities: Dict[str, Dict[str, Any]] = {}
        self.name_variations: Dict[str, str] = {}
        self.program_index: Dict[str, List[Tuple[str, str]]] = {}
        self.keyword_index: Dict[str, Set[str]] = {}
        self.cutoff_index: Dict[int, List[Tuple[str, str, str]]] = {}
        self.parser = UniversityDataParser()
        
        # First load from hardcoded data
        self._load_hardcoded_data()
        
        # Then try to load from files (overlay)
        self._load_from_files()
        
        # Build indexes
        self._build_indexes()
        
        print(f"✅ Knowledge Base loaded: {len(self.universities)} universities")
        print(f"   - {len(self.program_index)} unique programs indexed")
        print(f"   - {len(self.keyword_index)} keywords indexed")
        print(f"   - Cut-off points indexed for {len(self.cutoff_index)} aggregate values")
    
    def _load_hardcoded_data(self):
        """Load from the original GHANA_UNIVERSITIES_KNOWLEDGE"""
        global GHANA_UNIVERSITIES_KNOWLEDGE
        
        for uni_name, data in GHANA_UNIVERSITIES_KNOWLEDGE.items():
            # Add to universities
            self.universities[uni_name] = data.copy()
            
            # Convert programs to the enhanced format
            if "programs" in data:
                enhanced_programs = {}
                for prog_name, prog_data in data["programs"].items():
                    if isinstance(prog_data, dict):
                        # Create enhanced program data with cut_offs extracted
                        enhanced_programs[prog_name] = {
                            "name": prog_name,
                            "cut_offs": [],
                            "requirements": prog_data.get("requirements", ""),
                            "duration": prog_data.get("duration", ""),
                            "career_prospects": prog_data.get("career_prospects", ""),
                            "original_data": prog_data
                        }
                        
                        # Try to extract cut-off from requirements
                        req_text = prog_data.get("requirements", "")
                        agg_match = re.search(r'(?:Agg|Aggregate)\s*(\d+[-–]\d+)', req_text, re.IGNORECASE)
                        if not agg_match:
                            agg_match = re.search(r'(\d+[-–]\d+)', req_text)
                        if agg_match:
                            enhanced_programs[prog_name]["cut_offs"].append(agg_match.group(1))
                    else:
                        enhanced_programs[prog_name] = {"name": prog_name, "data": str(prog_data)}
                
                self.universities[uni_name]["programs"] = enhanced_programs
            
            # Add name variations
            self._add_name_variations(uni_name)
    
    def _load_from_files(self):
        """Load from context files - overlays on top of hardcoded data"""
        context_files = {
            "University of Ghana": "University of Ghana.txt",
            "University for Development Studies": "University of Development studies.txt",
            "University of Energy and Natural Resources": "University of Energy and Natural Resources.txt",
            "University of Education Winneba": "University of education Winneba.txt",
            "University of Mines and Technology": "University of Mines and Technology.txt",
            "University of Health and Allied Sciences": "University of Health and Allied Sciences.txt",
            "Ghana Communication Technology University": "Ghana Communication Technology University (GCTU),.txt",
        }
        
        for uni_name, filename in context_files.items():
            filepath = Path(filename)
            if filepath.exists():
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    parsed_data = self.parser.parse_file(content, uni_name)
                    if parsed_data and parsed_data.get("programs"):
                        # Merge with existing data
                        if uni_name in self.universities:
                            # Preserve existing data and add parsed info
                            existing = self.universities[uni_name]
                            # Add raw content
                            existing["raw_content"] = parsed_data["raw_content"]
                            # Add parsed programs (enhanced)
                            for prog_name, prog_data in parsed_data["programs"].items():
                                if prog_name not in existing.get("programs", {}):
                                    if "programs" not in existing:
                                        existing["programs"] = {}
                                    existing["programs"][prog_name] = prog_data
                            # Add deadlines
                            if parsed_data.get("deadlines"):
                                if "deadlines" not in existing:
                                    existing["deadlines"] = {}
                                existing["deadlines"].update(parsed_data["deadlines"])
                            # Add cutoff points
                            if parsed_data.get("cutoff_points"):
                                if "cutoff_points" not in existing:
                                    existing["cutoff_points"] = {}
                                existing["cutoff_points"].update(parsed_data["cutoff_points"])
                            # Add study options
                            if parsed_data.get("study_options"):
                                if "study_options" not in existing:
                                    existing["study_options"] = []
                                existing["study_options"].extend(parsed_data["study_options"])
                            # Add special notes
                            if parsed_data.get("special_notes"):
                                if "special_notes" not in existing:
                                    existing["special_notes"] = []
                                existing["special_notes"].extend(parsed_data["special_notes"])
                        else:
                            self.universities[uni_name] = parsed_data
                            self._add_name_variations(uni_name)
                        
                        print(f"✅ Loaded from file: {uni_name} ({len(parsed_data['programs'])} programs)")
                    else:
                        print(f"⚠️ Failed to parse: {uni_name}")
                except Exception as e:
                    print(f"❌ Error loading {uni_name}: {e}")
            else:
                print(f"⚠️ File not found: {filename}")
    
    def _add_name_variations(self, uni_name: str):
        """Add comprehensive name variations."""
        # Use the global UNI_NAME_VARIATIONS
        global UNI_NAME_VARIATIONS
        
        for key, value in UNI_NAME_VARIATIONS.items():
            if value == uni_name:
                self.name_variations[key] = uni_name
        
        # Add lowercase version
        self.name_variations[uni_name.lower()] = uni_name
        
        # Add short version (remove "University of")
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
            programs = data.get("programs", {})
            
            for prog_name, prog_data in programs.items():
                # Index by program name
                if prog_name not in self.program_index:
                    self.program_index[prog_name] = []
                self.program_index[prog_name].append((uni_name, prog_data))
                
                # Extract and index keywords
                text = f"{prog_name} {json.dumps(prog_data)}".lower()
                keywords = self._extract_keywords(text)
                for keyword in keywords:
                    if keyword not in self.keyword_index:
                        self.keyword_index[keyword] = set()
                    self.keyword_index[keyword].add(uni_name)
                
                # Index cut-off points
                cut_offs = prog_data.get("cut_offs", []) if isinstance(prog_data, dict) else []
                for cutoff in cut_offs:
                    try:
                        numeric = re.search(r'(\d+)', str(cutoff))
                        if numeric:
                            agg = int(numeric.group(1))
                            if agg not in self.cutoff_index:
                                self.cutoff_index[agg] = []
                            self.cutoff_index[agg].append((uni_name, prog_name, cutoff))
                    except (ValueError, AttributeError):
                        pass
    
    def _extract_keywords(self, text: str) -> List[str]:
        """Extract meaningful keywords from text."""
        stopwords = {'the', 'a', 'an', 'and', 'or', 'but', 'for', 'on', 'at', 'to', 'in', 'of', 'with', 'by', 'from', 'for', 'be', 'is', 'are', 'was', 'were'}
        words = re.findall(r'[a-z]{3,}', text)
        return [w for w in words if w not in stopwords]
    
    # ============ SEARCH STRATEGIES ============
    
    def search(self, query: str, top_n: int = 5) -> List[Dict[str, Any]]:
        """Multi-strategy search with scoring."""
        query_lower = query.lower()
        query_words = set(self._extract_keywords(query_lower))
        
        scored = {}
        
        # STRATEGY 1: Exact university name match
        for variation, uni_name in self.name_variations.items():
            if variation in query_lower:
                if uni_name not in scored:
                    scored[uni_name] = 0
                scored[uni_name] += 5.0
        
        # STRATEGY 2: Program name match
        for prog_name, universities in self.program_index.items():
            if prog_name.lower() in query_lower:
                for uni_name, prog_data in universities:
                    if uni_name not in scored:
                        scored[uni_name] = 0
                    scored[uni_name] += 4.0
        
        # STRATEGY 3: Keyword overlap
        for keyword, universities in self.keyword_index.items():
            if keyword in query_words:
                for uni_name in universities:
                    if uni_name not in scored:
                        scored[uni_name] = 0
                    scored[uni_name] += 1.0
        
        # STRATEGY 4: Cut-off point matching
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
        """Find programs within a university that match the query."""
        matches = []
        data = self.universities.get(uni_name, {})
        programs = data.get("programs", {})
        
        query_lower = query.lower()
        for prog_name, prog_data in programs.items():
            prog_lower = prog_name.lower()
            if any(word in prog_lower for word in query_lower.split()) or \
               any(word in json.dumps(prog_data).lower() for word in query_lower.split()):
                matches.append(prog_name)
        
        return matches[:5]
    
    def get_university(self, name: str) -> Optional[Dict[str, Any]]:
        """Get university data by name with variation matching."""
        name_lower = name.lower()
        if name_lower in self.name_variations:
            return self.universities.get(self.name_variations[name_lower])
        return self.universities.get(name)
    
    def find_programs_by_cutoff(self, aggregate: int, within_range: int = 3) -> List[Dict[str, Any]]:
        """Find all programs within a certain range of the given aggregate."""
        results = []
        for cutoff_agg, programs in self.cutoff_index.items():
            if abs(cutoff_agg - aggregate) <= within_range:
                for uni_name, prog_name, cutoff in programs:
                    results.append({
                        "university": uni_name,
                        "program": prog_name,
                        "cutoff": cutoff,
                        "aggregate": cutoff_agg,
                        "difference": abs(cutoff_agg - aggregate)
                    })
        return sorted(results, key=lambda x: x["difference"])

# ============================================================================
# ENHANCED SEARCH FUNCTION - KEEPS ORIGINAL SIGNATURE
# ============================================================================

def search_local_knowledge(query: str, university_name: str = None) -> Dict[str, Any]:
    """Enhanced search using the knowledge base - maintains original interface."""
    
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
    
    agg_match = re.search(r'aggregate\s*(\d+)', query.lower())
    if agg_match and results:
        aggregate = int(agg_match.group(1))
        program_matches = university_kb.find_programs_by_cutoff(aggregate)
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
                        "aggregate_match": aggregate
                    })
    
    if results:
        return {
            "results": results[:5],
            "confidence": max([r.get("relevance", 0) for r in results]) if results else 0.0
        }
    
    return {"results": [], "confidence": 0.0}

# ============================================================================
# ORIGINAL BUILD_CONTEXT FUNCTION - MODIFIED TO USE ENHANCED DATA
# ============================================================================

def build_university_context(uni_name: str, uni_data: Dict[str, Any]) -> str:
    """Build comprehensive context - enhanced but maintains original interface."""
    current_year = datetime.now().year
    
    programs = uni_data.get("programs", {})
    admission = uni_data.get("admission_requirements", {})
    deadlines = uni_data.get("deadlines", {})
    contact = uni_data.get("contact", {})
    scholarships = uni_data.get("scholarships", {})
    study_options = uni_data.get("study_options", [])
    special_notes = uni_data.get("special_notes", [])
    
    # Build program list with cut-offs from enhanced data
    program_lines = []
    for prog_name, prog_data in programs.items():
        if isinstance(prog_data, dict):
            parts = [f"  - **{prog_name}**"]
            if "duration" in prog_data and prog_data["duration"]:
                parts.append(f"Duration: {prog_data['duration']}")
            if "cut_offs" in prog_data and prog_data["cut_offs"]:
                parts.append(f"Cut-off: {', '.join(prog_data['cut_offs'])}")
            if "requirements" in prog_data and prog_data["requirements"]:
                parts.append(f"Requirements: {prog_data['requirements']}")
            if "career_prospects" in prog_data and prog_data["career_prospects"]:
                parts.append(f"Careers: {prog_data['career_prospects']}")
            program_lines.append(" | ".join(parts))
        else:
            program_lines.append(f"  - {prog_name}: {str(prog_data)[:100]}")
    
    # Build deadlines
    deadline_lines = []
    for key, val in deadlines.items():
        if val:
            deadline_lines.append(f"  - {key.replace('_', ' ').title()}: {val}")
    
    # Build study options
    study_line = f"  - Study Options: {', '.join(study_options)}" if study_options else ""
    
    # Build scholarships
    scholarship_lines = []
    for key, val in scholarships.items():
        if val:
            scholarship_lines.append(f"  - {key}: {val}")
    
    context = f"""UNIVERSITY: {uni_name}
Location: {uni_data.get("location", "Ghana")}
Established: {uni_data.get("established", "N/A")}
Website: {uni_data.get("website", "N/A")}

PROGRAMS OFFERED:
{chr(10).join(program_lines) if program_lines else "  - See university website for full list"}

ADMISSION DEADLINES:
{chr(10).join(deadline_lines) if deadline_lines else "  - Check university website"}

{study_line if study_line else ""}

ADMISSION REQUIREMENTS:
  - General: {admission.get("general", "WASSCE with minimum credits")[:500] if admission.get("general") else "  - WASSCE with minimum credits"}
  - Application Deadline: {admission.get("application_deadline", "Check university website")}
  - Entrance Exam: {admission.get("entrance_exam", "Not specified")}
  - Online Portal: {admission.get("online_portal", uni_data.get("website", ""))}

FEES ({current_year}):
  - Application Fee: {uni_data.get("fees", {}).get("application_fee", "Contact university")}
  - Ghanaian Students: {uni_data.get("fees", {}).get("tuition_fees", "Contact university for current rates")}
  - International Students: {uni_data.get("fees", {}).get("international_fee", "Contact university for current rates")}

SCHOLARSHIPS:
{chr(10).join(scholarship_lines) if scholarship_lines else "  - Contact university for scholarship information"}

SPECIAL NOTES:
{chr(10).join([f"  - {note}" for note in special_notes]) if special_notes else "  - None"}

CONTACT:
  - Phone: {contact.get("phone", "N/A")}
  - Email: {contact.get("email", "N/A")}
  - Address: {contact.get("address", "N/A")}
"""
    return context

# ============================================================================
# ORIGINAL FUNCTIONS - PRESERVED
# ============================================================================

async def initialize_services():
    """Initialize all services on startup - preserved"""
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
    """Seed MongoDB with university data - preserved but enhanced"""
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


# ============================================================================
# OTHER ORIGINAL FUNCTIONS - PRESERVED
# ============================================================================

async def search_web_realtime(query: str) -> Dict[str, Any]:
    """Original search_web_realtime function - preserved"""
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
    """Original search_with_serpapi function - preserved"""
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
# ENHANCED RESPONSE GENERATION - KEEPS ORIGINAL SIGNATURE
# ============================================================================

async def generate_response_with_groq(
    query: str, context: str, sources: List[Dict], user_profile: Dict = None, chat_history: List[Dict] = None
) -> str:
    """Enhanced response generation - maintains original signature"""
    try:
        if not groq_client:
            return generate_smart_fallback_response(
                query, context, sources, user_profile
            )

        current_year = datetime.now().year
        
        system_prompt = f"""You are Cerkyl — a smart, friendly, and knowledgeable AI admission counsellor built specifically for Ghanaian SHS graduates.

You have access to detailed information about Ghanaian universities including:
- Program names with cut-off points
- Subject requirements for each program  
- Application deadlines
- Entrance exam dates
- Entry requirements for different qualifications
- Study options

**CRITICAL RULES:**
1. **USE ONLY PROVIDED DATA**: Only state specific numbers, dates, or requirements if they appear in the "Available university information" section.
2. **CUT-OFF POINTS**: Provide exact cut-off points from the data. Mention multiple cut-offs if available.
3. **SUBJECT REQUIREMENTS**: Always mention specific subject requirements.
4. **DEADLINES**: Always include application deadlines when discussing programs.
5. **HONESTY**: If a student's aggregate doesn't meet the cut-off, say so clearly and suggest alternatives.
6. **BE CONCISE**: Answer what was asked. Don't dump all information.

**RESPONSE FORMAT:**
- Use markdown for readability
- Include specific numbers when available
- End with a helpful follow-up question

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

Respond naturally and helpfully. Base your answer strictly on the information provided above."""
        
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
    """Enhanced fallback response - uses knowledge base"""
    query_lower = query.lower()
    
    results = university_kb.search(query)
    
    if results:
        response_parts = []
        
        for result in results[:3]:
            uni_name = result["source"]
            uni_data = result["data"]
            matched_progs = result.get("matched_programs", [])
            
            if result.get("matched_program"):
                prog_name = result["matched_program"]
                cutoff = result["matched_cutoff"]
                prog_data = uni_data.get("programs", {}).get(prog_name, {})
                reqs = prog_data.get("requirements", "See university website")
                
                response_parts.append(f"""
### {prog_name} at {uni_name}
- **Cut-off Point:** {cutoff}
- **Subject Requirements:** {reqs}
- **Study Options:** {', '.join(uni_data.get('study_options', ['See website'])) if uni_data.get('study_options') else 'See website'}
""")
            elif matched_progs:
                prog_list = []
                for p in matched_progs[:3]:
                    p_data = uni_data.get("programs", {}).get(p, {})
                    if isinstance(p_data, dict):
                        cutoff = ', '.join(p_data.get("cut_offs", ["N/A"]))
                        prog_list.append(f"  - {p}: {cutoff}")
                    else:
                        prog_list.append(f"  - {p}")
                
                response_parts.append(f"""
### {uni_name}
**Programs matching your query:**
{chr(10).join(prog_list)}

**Application Deadline:** {uni_data.get('deadlines', {}).get('application_deadline', 'Check website')}
**Contact:** {uni_data.get('contact', {}).get('phone', 'N/A')}
""")
            else:
                programs = uni_data.get("programs", {})
                program_list = []
                for pname, pdata in list(programs.items())[:5]:
                    if isinstance(pdata, dict):
                        cutoff = ', '.join(pdata.get("cut_offs", ["N/A"]))
                        program_list.append(f"  - {pname}: {cutoff}")
                    else:
                        program_list.append(f"  - {pname}")
                
                response_parts.append(f"""
### {uni_name}
**Programs with Cut-off Points:**
{chr(10).join(program_list) if program_list else "  - See website for full list"}

**Application Deadline:** {uni_data.get('deadlines', {}).get('application_deadline', 'Check website')}
**Contact:** {uni_data.get('contact', {}).get('phone', 'N/A')}
""")
        
        if response_parts:
            return "\n\n---\n\n".join(response_parts)
    
    # Ultimate fallback - list all universities
    uni_list = []
    for uni_name, data in university_kb.universities.items():
        prog_count = len(data.get("programs", {}))
        deadlines = data.get("deadlines", {})
        deadline = deadlines.get("application_deadline", deadlines.get("closing_date", "Check website"))
        uni_list.append(f"- **{uni_name}**: {prog_count} programs | Deadline: {deadline}")
    
    return f"""
I understand you're asking about: "{query}"

Here are the universities I have detailed information about:

{chr(10).join(uni_list)}

For specific information, please ask about:
- **Cut-off points** for specific programs
- **Subject requirements** for admission
- **Application deadlines**
- **Entrance exam dates**
- **Program recommendations** based on your aggregate
- **Study options** (Day/Evening/Weekend)

What specific information would you like about any of these universities?
"""


# ============================================================================
# INITIALIZE KNOWLEDGE BASE
# ============================================================================

university_kb = EnhancedUniversityKnowledgeBase()

# ============================================================================
# FASTAPI STARTUP EVENT - PRESERVED
# ============================================================================

@app.on_event("startup")
async def startup_event():
    """Initialize services when app starts"""
    await initialize_services()


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "glinax-rag", "version": "2.0.0"}


# ============================================================================
# ORIGINAL FASTAPI ENDPOINTS - PRESERVED
# ============================================================================

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
    """Main RAG+CAG endpoint - preserved"""
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
            combined_context = combined_context[:6000]
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
            combined_context = combined_context[:6000]
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
            reply=response_text,
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
                reply=fallback_response,
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
    """Enhanced endpoint for handling file uploads - preserved"""
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
        combined_context = combined_context[:6000]
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
