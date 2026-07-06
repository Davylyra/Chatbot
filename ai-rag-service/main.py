import json
import os
import platform
import re
import urllib.parse
from datetime import datetime
from typing import Any, Dict, List, Optional

import motor.motor_asyncio
import requests
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from groq import AsyncGroq
import asyncio
from pydantic import BaseModel

load_dotenv()


def sanitize_markdown_urls(text: str) -> str:
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


async def initialize_services():
    """Initialize all services on startup"""
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

                # Seed + load university knowledge base from MongoDB
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
    """
    Wipes and re-seeds the universities collection from GHANA_UNIVERSITIES_KNOWLEDGE.
    This clears any stale/old universities from previous versions on every restart.
    To make MongoDB the editable source later: remove delete_many and insert_many.
    """
    global GHANA_UNIVERSITIES_KNOWLEDGE
    db = db_client[os.getenv("DB_NAME", "glinax_chatbot_db")]
    col = db["universities_knowledge"]

    # Seed only if collection is empty
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
        doc.pop("_id", None)  # remove Mongo's _id before storing
        if name:
            loaded[name] = doc
    
    if loaded:
        GHANA_UNIVERSITIES_KNOWLEDGE = loaded
        print(f" University knowledge base loaded from MongoDB ({len(loaded)} entries)")
# Shared university name/alias mapping — used by search and fallback functions
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


def build_university_context(uni_name: str, uni_data: dict) -> str:
    """Build a clean, readable context string for the LLM instead of raw JSON."""
    current_year = datetime.now().year
    fees_key = f"current_fees_{current_year}"
    fees = uni_data.get(fees_key, {})
    programs = uni_data.get("programs", {})
    admission = uni_data.get("admission_requirements", {})
    contact = uni_data.get("contact", {})
    scholarships = uni_data.get("scholarships", {})

    program_lines = []
    for prog_name, prog_data in programs.items():
        program_lines.append(
            f"  - {prog_name} ({prog_data.get('duration', 'N/A')}): "
            f"Requirements: {prog_data.get('requirements', 'N/A')} | "
            f"Careers: {prog_data.get('career_prospects', 'N/A')}"
        )

    scholarship_lines = [f"  - {k}: {v}" for k, v in scholarships.items()]

    return f"""UNIVERSITY: {uni_name}
Location: {uni_data.get("location", "Ghana")}
Established: {uni_data.get("established", "N/A")}
Website: {uni_data.get("website", "N/A")}

PROGRAMS OFFERED:
{chr(10).join(program_lines) or "  - See university website"}

ADMISSION REQUIREMENTS:
  - General: {admission.get("general", "WASSCE with minimum credits")}
  - Application Deadline: {admission.get("application_deadline", "Check university website")}
  - Application Fee: {admission.get("application_fee", "Contact university")}
  - Entrance Exam: {admission.get("entrance_exam", "Not specified")}
  - Online Portal: {admission.get("online_portal", uni_data.get("website", ""))}

FEES ({current_year}):
  - Ghanaian Students: {fees.get("ghanaian_students", "Contact university for current rates")}
  - International Students: {fees.get("international_students", "Contact university for current rates")}
  - Accommodation: {fees.get("residential_fees", "Contact university for current rates")}

SCHOLARSHIPS:
{chr(10).join(scholarship_lines) or "  - Contact university for scholarship information"}

CONTACT:
  - Phone: {contact.get("phone", "N/A")}
  - Email: {contact.get("email", "N/A")}
  - Address: {contact.get("address", "N/A")}
"""


def search_local_knowledge(query: str, university_name: str = None) -> Dict[str, Any]:
    query_lower = query.lower()
    matches = []
    top_confidence = 0.0

    alias_map = UNI_NAME_VARIATIONS

    if not university_name:
        for variation, full_name in alias_map.items():
            if variation in query_lower:
                university_name = full_name
                break

    if university_name:
        university_data = GHANA_UNIVERSITIES_KNOWLEDGE.get(university_name, {})
        if university_data:
            matches.append(
                {"source": university_name, "data": university_data, "relevance": 0.98}
            )
            top_confidence = 0.98

    for university_name_key, university_data in GHANA_UNIVERSITIES_KNOWLEDGE.items():
        if university_name and university_name_key == university_name:
            continue

        match_score = 0.0

        if "programs" in university_data and isinstance(university_data["programs"], dict):
            for program_name, program_data in university_data["programs"].items():
                program_text = f"{program_name} {json.dumps(program_data)}".lower()
                if any(word in program_text for word in query_lower.split()):
                    match_score += 0.4

        text_to_search = f"{university_name_key} {json.dumps(university_data)}".lower()

        priority_keywords = ["computer science", "engineering", "medicine", "business"]
        for keyword in priority_keywords:
            if keyword in query_lower and keyword in text_to_search:
                match_score += 0.6

        supporting_keywords = [
            "admission",
            "fee",
            "fees",
            "cost",
            "program",
            "scholarship",
            "contact",
            "requirement",
        ]
        for keyword in supporting_keywords:
            if keyword in query_lower and keyword in text_to_search:
                match_score += 0.3

        query_terms = query_lower.split()
        for term in query_terms:
            if len(term) > 3 and term in text_to_search:
                match_score += 0.2

        if match_score > 0.4:
            matches.append(
                {
                    "source": university_name_key,
                    "data": university_data,
                    "relevance": min(match_score, 0.95),
                }
            )

    matches = sorted(matches, key=lambda x: x["relevance"], reverse=True)[:3]

    return {
        "results": matches,
        "confidence": top_confidence
        or (max([match["relevance"] for match in matches]) if matches else 0.0),
    }


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


async def generate_response_with_groq(
    query: str, context: str, sources: List[Dict], user_profile: Dict = None, chat_history: List[Dict] = None
) -> str:
    """Generate response using Async Groq LLM."""

    try:
        if not groq_client:
            return generate_smart_fallback_response(
                query, context, sources, user_profile
            )

        current_year = datetime.now().year
        
        is_coach_mode = user_profile.get("is_coach_mode", False) if user_profile else False

        if is_coach_mode:
            system_prompt = f"""You are an interactive AI Career Coach. 
Your goal is strictly Socratic and exploratory. The student is confused about their path.
Do NOT give immediate university recommendations. Instead:
- Ask one insightful question at a time to uncover their strengths, weaknesses, and interests.
- Guide them to discover potential career paths naturally.
- Keep your responses short, conversational, and deeply encouraging.
- Only map out specific programs or universities after you have confidently narrowed down their interests.
Current year: {current_year}"""
        else:
            system_prompt = f"""You are Cerkyl — a smart, friendly, and knowledgeable AI admission counsellor built specifically for Ghanaian SHS graduates. You are the trusted senior friend every student wishes they had when choosing a university — someone who truly understands the Ghanaian education system, speaks plainly, and gives honest, personalised advice.

Your personality:
- Warm, encouraging, and supportive — never cold or robotic
- Formal but conversational — like a knowledgeable older sibling or mentor
- Honest — if a program is competitive or a grade may be insufficient, say so kindly and suggest alternatives
- Proactive — anticipate follow-up questions and address them before the student has to ask
- Concise — never dump information the student did not ask for

What makes you better than Google:
- Google gives everyone the same results. You give personalised advice based on THIS student's specific subjects, grades, career goals, and location.
- You understand Ghanaian grading (WASSCE aggregates, A1–F9 grades), SHS programmes (General Science, General Arts, Business, Home Economics, Visual Arts, Agricultural Science, Technical), and how they map to university programmes.
- You remember the student's profile within the conversation and refer back to it naturally.
- You explain the WHY behind every recommendation — not just what, but why it fits them specifically.
- You flag things students miss — application deadlines, entrance exams, hidden fees, scholarship opportunities.

RESPONSE RULES — STRICTLY FOLLOW:
1. Answer ONLY what was asked. Do not volunteer all 7 categories of information for every message.
2. For a simple question (e.g. "What is the deadline for KNUST?") — give a direct, focused answer in 2–4 sentences or a short list.
3. For recommendation requests — recommend ONLY 2–4 universities that genuinely fit the student's profile. Explain why each fits THEIR subjects, grade, and goals. Do not list every university in Ghana.
4. DO NOT introduce yourself repeatedly. Only introduce yourself in the very first message. For all follow-up questions, skip the greeting and respond directly to the query.
5. If the student has NOT provided their profile and asks for a recommendation — ask 2–3 short, friendly questions to gather: SHS programme, WASSCE aggregate or expected grade, and career interest. Do not guess.
6. Never start a response with "I" — vary your opening naturally.
7. Use markdown formatting (bold headings, bullet points) only when it genuinely improves readability. Short answers should be plain prose.

UNIVERSITY MATCHING RULES (use when profile is available):
- General Science → Engineering (KNUST, UG, UENR, UDS), Medicine (UG, KNUST, UHAS, UDS), Computer Science (KNUST, UG, Ashesi, GTUC, Academic City)
- Business → Accounting/Finance (UPSA, UCC, UG, GIMPA), Marketing (UPSA, UCC), Banking (UPSA, UG)
- General Arts → Law (UG, KNUST, UCC), Education (UCC, UEW), Social Sciences (UG, UCC, GIMPA), Journalism (GIJ, UG)
- Agricultural Science → Agriculture (UDS, UCC, UENR), Agricultural Engineering (KNUST, UDS, UENR)
- Home Economics → Nursing (UHAS, UCC), Food Science (KNUST, UG), Hospitality (Ho Technical, Accra Technical)
- Visual Arts → Fine Art (KNUST), Communication Design (KNUST, UG), Architecture (KNUST)
- Technical → Engineering Technology (KNUST, technical universities), TVET programmes
- Low aggregate (24–36) → Distance learning, diploma programmes, mature student entry, community colleges
- Location preference: Northern Ghana → UDS (Tamale); Ashanti → KNUST, Ashesi; Volta → UHAS (Ho); Bono → UENR (Sunyani); Accra → UG, UPSA, GIMPA, Ashesi, Academic City

WASSCE GRADE ELIGIBILITY GUIDE:
- Aggregate 6–12: Very competitive — qualifies for Medicine, Engineering at KNUST/UG
- Aggregate 13–18: Good — qualifies for most Science and Business programmes
- Aggregate 19–24: Average — qualifies for most Arts and Business programmes, some Science
- Aggregate 25–36: Below average — target diploma programmes, distance learning, or universities with flexible entry
- Always state clearly whether the student's grade meets the requirement for each recommended programme

LINK FORMATTING:
- Use proper markdown links: [University Admissions Portal](https://admissions.ug.edu.gh)
- Never use the URL as link text
- Only include links when genuinely relevant

DOCUMENT ANALYSIS:
- When a document is uploaded, first state what type of document it is and the institution/programme at the top
- Then extract and analyse the relevant information
- Prioritise information from the document over your general knowledge

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

Respond naturally and helpfully. Answer only what was asked. If this is a recommendation request, base it strictly on the student profile above — explain why each recommendation fits their specific subjects, grade, and goals."""

        messages_array = [{"role": "system", "content": system_prompt}]
        if chat_history:
            messages_array.extend(chat_history)
        messages_array.append({"role": "user", "content": user_message})

        chat_completion = await groq_client.chat.completions.create(
            messages=messages_array,
            model="llama-3.1-8b-instant",
            temperature=0.4,
            max_tokens=2048,
        )

        raw_response = chat_completion.choices[0].message.content
        # Sanitize URLs in the response before returning
        return sanitize_markdown_urls(raw_response)

    except Exception as e:
        print(f" Groq generation error: {e}")
        return generate_smart_fallback_response(query, context, sources, user_profile)


def generate_smart_fallback_response(
    query: str, context: str, sources: List[Dict], user_profile: Dict = None
) -> str:

    query_lower = query.lower()

    web_items = []
    official_items = []
    for s in sources or []:
        if s.get("type") in ("web_search", "official_website") or s.get("source") in (
            "web_search",
            "official_website",
        ):
            title = (
                s.get("source")
                if s.get("type") == "local_knowledge"
                else s.get("source")
            )
            web_items.append(
                {
                    "title": title or "Web Result",
                    "url": s.get("url") or "",
                    "snippet": s.get("snippet") or s.get("body") or "",
                }
            )
    if not web_items and context:
        for line in context.splitlines():
            if line.startswith("Web Result:"):
                web_items.append(
                    {
                        "title": "Web Result",
                        "url": "",
                        "snippet": line.replace("Web Result:", "").strip(),
                    }
                )

    for item in web_items:
        url = (item.get("url") or "").lower()
        if any(
            d in url
            for d in [
                "ug.edu.gh",
                "knust.edu.gh",
                "ucc.edu.gh",
                "uds.edu.gh",
                "upsa.edu.gh",
                "uenr.edu.gh",
                "uhas.edu.gh",
            ]
        ):
            official_items.append(item)

    if web_items:
        header = "Here’s what I found from recent web results:"
        lines = [header, ""]
        prioritized = (official_items or web_items)[:5]
        for r in prioritized:
            title = r.get("title") or "Web Result"
            url = r.get("url") or ""
            snippet = r.get("snippet") or ""
            bullet = f"• {title}: {snippet}"
            if url:
                bullet += f" (Source: {url})"
            lines.append(bullet)
        lines.append("")
        lines.append(
            "If you want, I can fetch more details or verify this from additional sources."
        )
        return sanitize_markdown_urls("\n".join(lines))

    relevant_universities = []

    university_keywords = UNI_NAME_VARIATIONS

    for keyword, uni_name in university_keywords.items():
        if keyword in query_lower:
            if uni_name in GHANA_UNIVERSITIES_KNOWLEDGE:
                relevant_universities.append(uni_name)

    if not relevant_universities:
        relevant_universities = list(GHANA_UNIVERSITIES_KNOWLEDGE.keys())

    if any(
        word in query_lower
        for word in [
            "computer science",
            "computer",
            "programming",
            "software",
            "tech",
            "technology",
        ]
    ):
        response = "COMPUTER SCIENCE / TECHNOLOGY PROGRAMS IN GHANA\n\n"

        tech_universities = [
            "Kwame Nkrumah University of Science and Technology",
            "University of Ghana",
            "Ashesi University",
            "Ghana Technology University College",
            "University of Professional Studies",
            "Central University",
            "Academic City University",
            "University of Mines and Techonology",
        ]

        shown_count = 0
        for uni_name in tech_universities:
            if (
                uni_name in GHANA_UNIVERSITIES_KNOWLEDGE and shown_count < 5
            ):  # Show top 5 to keep response concise
                uni_data = GHANA_UNIVERSITIES_KNOWLEDGE.get(uni_name, {})

                programs = uni_data.get("programs", {})
                cs_program = None
                cs_name = None

                for prog_name, prog_data in programs.items():
                    if any(
                        keyword in prog_name.lower()
                        for keyword in [
                            "computer",
                            "technology",
                            "software",
                            "engineering",
                        ]
                    ):
                        cs_program = prog_data
                        cs_name = prog_name
                        break

                if cs_program:
                    uni_contact = uni_data.get("contact", {})
                    current_year = datetime.now().year
                    fees_key = f"current_fees_{current_year}"
                    uni_fees = uni_data.get(fees_key, {})

                    response += f"""## {uni_name} - {cs_name}

**Program Duration:** {cs_program.get("duration", "4 years")}

**Admission Requirements:**
- WASSCE Requirement: {cs_program.get("requirements", "WASSCE Credits in Math and English")}
- Application Deadline: {uni_data.get("admission_requirements", {}).get("application_deadline", "See university website")}
- Application Fee: {uni_data.get("admission_requirements", {}).get("application_fee", "GHS 200-300")}

**Tuition Fees ({datetime.now().year}):**
- Annual Tuition: {cs_program.get(f"fees_{datetime.now().year}", "Contact university for current rates")}
- Accommodation: {uni_fees.get("residential_fees", "GHS 2,500-5,000 per annum")}

**Career Prospects:**
{cs_program.get("career_prospects", "Software Developer, IT Professional")}

**Contact Information:**
- **Phone:** {uni_contact.get("phone", "Contact admissions office")}
- **Email:** {uni_contact.get("email", "admissions@university.edu.gh")}
- **Website:** {uni_data.get("website", "Visit official university website")}

"""
                    shown_count += 1

        response += """
**Recommendation:** Choose based on YOUR preferences:
- **KNUST**: Strong engineering and practical focus
- **UG**: Broad computer science curriculum
- **Ashesi**: Strong liberal arts + tech approach
- **GTUC**: Newer, focused on technology
- **Academic City**: Private option with industry partnerships

Match universities to your learning style and career goals!
"""
        return sanitize_markdown_urls(response)

    elif any(
        word in query_lower for word in ["fee", "cost", "money", "pay", "tuition"]
    ):
        response = f"## UNIVERSITY FEES INFORMATION ({datetime.now().year})\n\n"

        for uni_name, uni_data in GHANA_UNIVERSITIES_KNOWLEDGE.items():
            response += f"### {uni_name}\n\n"

            current_year = datetime.now().year
            fees_key = f"current_fees_{current_year}"
            if fees_key in uni_data:
                fees = uni_data[fees_key]
                response += f"""**Tuition Fees (per annum):**
- Ghanaian Students: {fees.get("ghanaian_students", "Contact university")}
- International Students: {fees.get("international_students", "Contact university")}

**Other Fees:**
- Accommodation: {fees.get("residential_fees", "GHS 2,500 - 5,000")}
- Registration & Library: {fees.get("other_fees", "Varies by program")}
- Application Fee: {uni_data.get("admission_requirements", {}).get("application_fee", "GHS 200-300")}

**Application Deadline:** {uni_data.get("admission_requirements", {}).get("application_deadline", "Check university website")}

**Contact:** {uni_data.get("contact", {}).get("phone", "See university website")}

---

"""

        if not GHANA_UNIVERSITIES_KNOWLEDGE:
            response += """**General Fee Ranges for Ghanaian Public Universities:**
- Arts/Business Programs: GHS 6,000 - 8,000 per year
- Science Programs: GHS 8,000 - 12,000 per year  
- Engineering: GHS 10,000 - 15,000 per year
- Medicine: GHS 15,000 - 18,000 per year
- Accommodation: GHS 2,500 - 5,000 per year
"""

        response += "\n**Note:** Fees are subject to change annually. Always confirm current rates with the university admissions office."
        return sanitize_markdown_urls(response)

    elif any(
        word in query_lower for word in ["admission", "apply", "requirement", "entry"]
    ):
        response = "## UNIVERSITY ADMISSION REQUIREMENTS\n\n"

        for uni_name, uni_data in GHANA_UNIVERSITIES_KNOWLEDGE.items():
            response += f"### {uni_name}\n\n"

            if "admission_requirements" in uni_data:
                req = uni_data["admission_requirements"]
                response += f"""**General Requirements:**
{req.get("general", "WASSCE with minimum 6 credits (A1-C6) including English and Mathematics")}

**Application Process:**
1. Visit the university website: {uni_data.get("website", "Visit official university website")}
2. Complete the online application form
3. Submit required documents (WASSCE certificate, birth certificate, etc.)
4. Pay the application fee (GHS {req.get("application_fee", "200-300")})
5. Await admission decision

**Important Dates:**
- Application Deadline: {req.get("application_deadline", "Check university website for current year")}
- Admission Announcement: {req.get("admission_announcement", "Typically announced in June-July")}
- Registration: {req.get("registration_date", "August-September before academic year")}

**Contact Admissions Office:**
- **Phone:** {uni_data.get("contact", {}).get("phone", "Contact university")}
- **Email:** {uni_data.get("contact", {}).get("email", "admissions@university.edu.gh")}
- **Address:** {uni_data.get("contact", {}).get("address", "See university website")}

---

"""

        if not GHANA_UNIVERSITIES_KNOWLEDGE:
            response += """**Standard Requirements for Ghanaian Universities:**
- WASSCE certificate with minimum 6 credits (A1-C6)
- English Language and Mathematics are mandatory
- Relevant science subjects for science/engineering programs
- Good aggregate scores (usually 6-36 depending on program)

**Application Process:**
1. Check university websites for specific requirements
2. Complete online application forms
3. Submit required documents
4. Pay application fees (typically GHS 200-300)
5. Wait for admission decisions
"""

        response += "\n**Pro Tip:** Start your applications early and apply to multiple universities to increase your chances of admission!"
        return sanitize_markdown_urls(response)

    else:
        response = "## INFORMATION ABOUT GHANAIAN UNIVERSITIES\n\n"

        if GHANA_UNIVERSITIES_KNOWLEDGE:
            for uni_name, uni_data in GHANA_UNIVERSITIES_KNOWLEDGE.items():
                response += f"""### {uni_name}

**Established:** {uni_data.get("established", "N/A")} | **Type:** {uni_data.get("type", "Public").title()}

**Location:** {uni_data.get("location", "Ghana")} ({uni_data.get("region", "Region")})

**Specializations:** {", ".join(uni_data.get("specializations", ["Various"]))}

**Key Strengths:** {", ".join(uni_data.get("strength_areas", ["Excellent academic programs"]))}

**Contact Information:**
- **Phone:** {uni_data.get("contact", {}).get("phone", "Contact admissions")}
- **Email:** {uni_data.get("contact", {}).get("email", "admissions@university.edu.gh")}
- **Website:** {uni_data.get("website", "Visit official website")}

---

"""

        response += """## HOW CAN I HELP YOU?

I can assist you with the following information about Ghanaian universities:

**Program Information**
- Specific courses and degree offerings
- Program duration, focus areas, and specializations
- Career prospects for different programs

**Admission & Application**
- Entry requirements and WASSCE grade expectations
- Application deadlines and procedures
- Required documents and application fees

**Fees & Financial Aid**
- Current tuition costs by program
- Accommodation fees and other expenses
- Available scholarships and financial support options

**University Profiles**
- Location and campus facilities
- Strengths and specializations
- Contact and website information

## QUICK QUESTIONS YOU CAN ASK:

- "Tell me about Computer Science programs in Ghana"
- "What are the fees for Medicine at UG?"
- "How do I apply to KNUST Engineering?"
- "Which universities offer Business programs?"
- "What scholarships are available at UCC?"
- "What are the admission requirements for nursing programs?"

**Feel free to ask specific questions about any Ghanaian university!**
"""

        return sanitize_markdown_urls(response)


@app.on_event("startup")
async def startup_event():
    """Initialize services when app starts"""
    await initialize_services()


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "glinax-rag", "version": "2.0.0"}


# Conversation history endpoints
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


# Existing history endpoints
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
    """Main RAG+CAG endpoint with conditional logic (Fast Path + Fallback)

    SPECIAL HANDLING: If this is an assessment request from the backend,
    return the assessment data as-is without AI processing
    """

    start_time = datetime.now()

    try:
        user_profile = {}
        if request.user_context and isinstance(request.user_context, dict):
            assessment_data = request.user_context.get("assessment_data", None)
            # Merge assessment_data fields into user_profile
            if assessment_data and isinstance(assessment_data, dict):
                user_profile.update(assessment_data)
            # Also pull any top-level profile fields from user_context directly
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
            print("🌐 Fallback path: Running real-time web search via DDG/SerpAPI...")
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
                reply="I apologize, but I'm having technical difficulties. Please try asking about specific universities or programs, and I'll do my best to help with admissions information. For personalized recommendations, please complete our assessment.",
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
    """Enhanced endpoint for handling file uploads with RAG+CAG processing"""

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
        extracted_content_parts: List[
            str
        ] = []  # Accumulate full extracted text content from files

        if files:
            for file in files:
                if file and file.filename:
                    try:
                        print(
                            f"📄 Processing file: {file.filename} ({file.content_type})"
                        )

                        content = await file.read()

                        if file.content_type == "text/plain":
                            try:
                                text_content = content.decode("utf-8", errors="ignore")
                                preview = text_content.strip()[:4000]
                                file_contents.append(
                                    f"📄 TEXT: {file.filename}\n{preview}"
                                )
                                if text_content:
                                    extracted_content_parts.append(text_content.strip())
                            except Exception as e:
                                file_contents.append(
                                    f"📄 TEXT extraction failed for {file.filename}: {e}"
                                )

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

                                print(
                                    f"DEBUG: Extracted {len(extracted_text)} chars. Start: {extracted_text[:200]}"
                                )

                                preview = extracted_text[:4000]
                                file_contents.append(
                                    f"📋 PDF: {file.filename}\n{preview}"
                                )
                            except Exception as e:
                                file_contents.append(
                                    f"📋 PDF extraction failed for {file.filename}: {e}"
                                )

                        elif file.content_type.startswith("image/"):
                            try:
                                import io

                                from PIL import Image

                                try:
                                    import pytesseract
                                except Exception as _err:
                                    pytesseract = None
                                image = Image.open(io.BytesIO(content))
                                ocr_text = ""
                                if pytesseract:
                                    try:
                                        configure_tesseract_path_if_needed(pytesseract)
                                    except Exception as cfg_err:
                                        print(
                                            f"⚠️ Tesseract path configuration warning: {cfg_err}"
                                        )
                                    try:
                                        ocr_text = (
                                            pytesseract.image_to_string(image) or ""
                                        )
                                    except Exception as ocr_err:
                                        ocr_text = f"[OCR failed: {ocr_err}]"
                                else:
                                    ocr_text = "[OCR engine not available on server. Install pytesseract to enable OCR.]"
                                preview = ocr_text.strip()[:4000]
                                file_contents.append(
                                    f"🖼️ IMAGE: {file.filename}\n{preview if preview else '[No text detected]'}"
                                )
                                if ocr_text:
                                    extracted_content_parts.append(ocr_text.strip())
                            except Exception as e:
                                file_contents.append(
                                    f"🖼️ Image processing failed for {file.filename}: {e}"
                                )

                        elif file.content_type in [
                            "application/msword",
                            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        ]:
                            try:
                                import io

                                if (
                                    file.content_type == "application/msword"
                                    and not file.filename.lower().endswith(".docx")
                                ):
                                    file_contents.append(
                                        f"📝 {file.filename}: Legacy .doc files are not supported. Please convert to .docx and try again."
                                    )
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
                                    file_contents.append(
                                        f"📝 DOCX: {file.filename}\n{preview if preview else '[No text extracted]'}"
                                    )
                                    if text:
                                        extracted_content_parts.append(text)
                            except Exception as e:
                                file_contents.append(
                                    f"📝 DOCX extraction failed for {file.filename}: {e}"
                                )

                        elif file.content_type in [
                            "text/csv",
                            "application/vnd.ms-excel",
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        ]:
                            try:
                                file_size_kb = len(content) / 1024
                                file_contents.append(f"""📊 **SPREADSHEET ANALYSIS**
**File:** {file.filename}
**Size:** {file_size_kb:.1f}KB

**Data Analysis Capabilities:**
• **Grade Calculations:** CGPA/GPA analysis and university program matching
• **University Comparisons:** Cost analysis, program comparisons, ranking data
• **Academic Planning:** Course planning and credit calculations
• **Financial Planning:** University cost analysis and scholarship planning
• **Application Tracking:** University application status and deadline management

I can interpret your data and provide personalized university recommendations based on the spreadsheet content.""")
                            except Exception:
                                file_contents.append(
                                    f"📊 **SPREADSHEET:** {file.filename} (processing error)"
                                )

                        else:
                            try:
                                file_size_kb = len(content) / 1024
                                file_contents.append(f"""📎 **DOCUMENT ANALYSIS**
**File:** {file.filename}
**Type:** {file.content_type}
**Size:** {file_size_kb:.1f}KB

**General Analysis:** I have received your document and will analyze it in the context of Ghanaian university admissions. Whether it's an application document, academic record, or informational material, I'll provide relevant guidance for your university journey.

Please let me know what specific aspect of this document you'd like me to help you with regarding university admissions.""")
                            except Exception:
                                file_contents.append(
                                    f"📎 **DOCUMENT:** {file.filename} (processing error - please try a different format)"
                                )

                        file_info.append(
                            {
                                "name": file.filename,
                                "type": file.content_type,
                                "size": len(content),
                            }
                        )

                    except Exception as file_error:
                        print(f" Error processing file {file.filename}: {file_error}")
                        file_contents.append(
                            f"File: {file.filename} - processing error"
                        )

        enhanced_message = message
        if file_contents:
            enhanced_message += (
                "\n\n[Extracted content from uploaded files]\n"
                + "\n\n".join(file_contents)
            )

        extracted_content = "\n\n".join(extracted_content_parts).strip()
        if extracted_content:
            enhanced_message += f"\n\n[Document Text]\n{extracted_content}"
            print(
                f"DEBUG: Extracted {len(extracted_content)} chars. Start: {extracted_content[:200]}"
            )

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
            final_confidence = max(final_confidence, 0.8)  # Boost confidence with files

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
            file_list = ", ".join([f["name"] for f in file_info])
            file_types = set([f["type"].split("/")[0] for f in file_info])
            total_files = len(file_info)

            if "image" in file_types and any(
                f["name"].lower().endswith((".jpg", ".jpeg", ".png")) for f in file_info
            ):
                analysis_intro = f"**📄 Academic Document Analysis**\n\nI have analyzed your uploaded image(s): {file_list}. These appear to be academic documents such as certificates, transcripts, or identification materials. I can provide specific guidance based on the visible information."
            elif any("pdf" in f["name"].lower() for f in file_info):
                analysis_intro = f"**📋 Official Document Review**\n\nI have processed the PDF document(s) you uploaded: {file_list}. This appears to contain official university or academic information that I can analyze for admission guidance."
            elif any(
                word in " ".join([f["name"] for f in file_info]).lower()
                for word in ["transcript", "certificate", "diploma", "result", "grade"]
            ):
                analysis_intro = f"**🎓 Academic Record Analysis**\n\nI have reviewed your academic document(s): {file_list}. I can analyze your grades, subjects, and performance to recommend suitable university programs and provide admission guidance."
            elif "text" in file_types or any(
                f["name"].lower().endswith(".txt") for f in file_info
            ):
                analysis_intro = f"**📝 Document Analysis**\n\nI have processed your text document(s): {file_list}. I can provide guidance based on the content and help with university admission questions."
            else:
                analysis_intro = f"**📎File Analysis Complete**\n\nI have successfully processed {total_files} file(s): {file_list}. I can now provide targeted university admission assistance based on the content."

            enhanced_response = f"{analysis_intro}\n\n---\n\n{response_text}\n\n---\n\n**🎯 Specific Recommendations Based on Your Documents:**\n\n"

            if extracted_content:
                content_lower = extracted_content.lower()

                if any(
                    word in content_lower
                    for word in ["grade", "score", "mark", "point", "aggregate"]
                ):
                    enhanced_response += "• **Grade Analysis**: I've reviewed your academic performance. Let me recommend programs that match your grade profile.\n"
                if any(
                    word in content_lower
                    for word in ["university", "college", "institution"]
                ):
                    enhanced_response += " **University Matching**: Based on your document content, I can suggest specific universities and programs.\n"
                if any(
                    word in content_lower
                    for word in ["subject", "course", "program", "major"]
                ):
                    enhanced_response += "**Program Guidance**: I can help identify suitable programs based on your subject background.\n"
                if any(
                    word in content_lower
                    for word in ["deadline", "application", "admission"]
                ):
                    enhanced_response += " **Application Timeline**: I can provide current deadlines and application procedures.\n"

            enhanced_response += "**Scholarship Opportunities**: Explore funding options that match your academic profile.\n"
            enhanced_response += "**Career Guidance**: Get insights on job prospects for different programs.\n\n"

            enhanced_response += "** Next Steps:**\n"
            enhanced_response += (
                "• Ask me specific questions about universities or programs\n"
            )
            enhanced_response += "Request detailed admission requirements\n"
            enhanced_response += (
                "• Inquire about fees, scholarships, or career prospects\n"
            )
            enhanced_response += "Get help with application procedures\n\n"

            enhanced_response += "What specific aspect of university admissions would you like me to help you with based on your documents?"

            response_text = enhanced_response

        processing_time = (datetime.now() - start_time).total_seconds()

        print(
            f"File response generated in {processing_time:.2f}s with confidence {final_confidence:.2f}"
        )

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
