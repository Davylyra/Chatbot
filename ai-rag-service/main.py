# Glinax RAG+CAG Service for Ghanaian University Applicants

import os
import json
import asyncio
import platform
import re
import urllib.parse
from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import requests
from dotenv import load_dotenv
import motor.motor_asyncio
from sentence_transformers import SentenceTransformer
import numpy as np
from groq import Groq

# Load environment variables
load_dotenv()

# URL sanitization for markdown links
def sanitize_markdown_urls(text: str) -> str:
    if not text:
        return text
    
    # Step 1: Fix nested/quadrupled markdown links pattern: [[URL](URL)](URL)](URL)
    # First, normalize multiple opening brackets: [[ -> [
    text = re.sub(r'\[+', '[', text)
    
    # Second, remove chained ](URL patterns
    # This handles both: [URL](URL](URL](URL) and [URL](URL)](URL)
    while True:
        before = text
        # Pattern 1: ](URL]( - remove URL before ](
        text = re.sub(r'\]\(https?://[^\)]+(?=\]\()', '', text)
        # Pattern 2: ](URL)]( - remove ](URL) when followed by another ](
        text = re.sub(r'\]\(https?://[^\)]+\)(?=\]\()', '', text)
        if text == before:
            break
    
    # This matches patterns where URLs are nested multiple times
    nested_pattern = r'\[+([^\[\]]*(?:https?://[^\s\[\]]+)[^\[\]]*)\]+\(+([^)]+)\)+'
    
    def fix_nested(match):
        # Extract the URL from either the text part or URL part (whichever is valid)
        text_part = match.group(1)
        url_part = match.group(2)
        
        # Find the actual URL (prioritize the url_part)
        url = None
        if url_part and url_part.startswith('http'):
            url = url_part
        elif 'http' in text_part:
            # Extract URL from text using regex
            url_match = re.search(r'https?://[^\s\[\]]+', text_part)
            if url_match:
                url = url_match.group(0)
        
        # Find proper link text (if the text is not a URL)
        link_text = text_part
        if url and url in link_text:
            # Remove URL from link text if it's duplicated there
            link_text = re.sub(r'https?://[^\s\[\]]+', '', text_part).strip()
        
        # If link text is empty or just the URL, use a generic text
        if not link_text or link_text == url:
            # Try to extract domain name for better text
            try:
                domain = url.split('/')[2] if url else 'Link'
                link_text = domain
            except:
                link_text = 'Link'
        
        if url:
            return f'[{link_text}]({url})'
        else:
            return match.group(0)  # Return original if we can't parse it
    
    # Apply nested link fix multiple times to catch all levels of nesting
    for _ in range(3):  # Run up to 3 times to catch deeply nested patterns
        text = re.sub(nested_pattern, fix_nested, text)
    
    # Step 2: Fix simple duplicate URLs in markdown format: [URL](URL)
    url_as_text_pattern = r'\[(https?://[^\]]+)\]\(\1\)'
    
    def fix_url_as_text(match):
        url = match.group(1)
        # Extract domain name for better link text
        try:
            domain = url.split('/')[2]
            return f'[{domain}]({url})'
        except:
            return f'[Visit Link]({url})'
    
    text = re.sub(url_as_text_pattern, fix_url_as_text, text)
    
    # Step 3: Standard markdown link cleanup
    markdown_link_pattern = r'\[([^\]]+)\]\(([^)]+)\)'
    
    def clean_url(match):
        link_text = match.group(1)
        url = match.group(2)
        
        # Clean up the URL
        # 1. Decode if over-encoded
        try:
            # Check if URL has %xx patterns - if it does, try to decode
            if '%' in url:
                # Don't decode valid markdown URLs
                # Only decode if it looks like unicode was encoded
                if '%F0%9D' in url or '%2D' in url:  # These are typically bad encodings
                    # Try to decode and re-encode properly
                    try:
                        decoded = urllib.parse.unquote(url)
                        # If decoded version contains non-ASCII, this was double-encoded
                        if any(ord(c) > 127 for c in decoded):
                            # Re-encode using proper URL encoding
                            url = urllib.parse.quote(decoded.encode('utf-8'), safe=':/?#[]@!$&\'()*+,;=')
                    except:
                        pass  # Keep original if decoding fails
        except:
            pass
        
        # 2. Validate URL format
        # Remove any trailing special characters that shouldn't be in URLs
        url = re.sub(r'[`\'"]*$', '', url)
        
        # 3. Ensure URL has protocol if it's a web URL
        if url and not url.startswith(('http://', 'https://', 'mailto:')):
            # If it looks like a domain, add https://
            if '.' in url and '/' in url[10:]:  # Has domain and path
                if not url.startswith('/'):  # Not a relative path
                    url = 'https://' + url
        
        # 4. Return cleaned markdown link
        return f'[{link_text}]({url})'
    
    # Replace all markdown links with cleaned versions
    cleaned_text = re.sub(markdown_link_pattern, clean_url, text)
    
    return cleaned_text

# Initialize FastAPI
app = FastAPI(title="Glinax RAG+CAG Service", version="2.0.0")

from fastapi import Path, Query, Depends, status
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt  

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret")
JWT_ALGOS = ["HS256"]
auth_scheme = HTTPBearer(auto_error=False)

def get_current_user(creds: HTTPAuthorizationCredentials = Depends(auth_scheme)):
    if not creds or not creds.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authorization")
    token = creds.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=JWT_ALGOS)
        user_id = payload.get("sub")
        if not user_id or not isinstance(user_id, str):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")
        return {"user_id": user_id, "claims": payload}
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

def resolve_user_id(token_user: Optional[str], fallback_user: Optional[str]) -> str:
    return token_user or (fallback_user or "")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables for services
embedding_model = None
groq_client = None
db_client = None
ghana_universities_data = []

# Configure Tesseract path on Windows if available
TESSERACT_ENV_PATH = os.getenv("TESSERACT_CMD")
WINDOWS_TESSERACT_CANDIDATES = [
    r"C:\\Program Files\\Tesseract-OCR\\tesseract.exe",
    r"C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe"
]


def configure_tesseract_path_if_needed(pytesseract_module) -> None:
    """Ensure pytesseract knows where the Tesseract binary lives (Windows friendly)."""
    if not pytesseract_module:
        return

    if getattr(pytesseract_module, "pytesseract", None):
        pytesseract_module = pytesseract_module.pytesseract

    # If already set, don't override
    if getattr(pytesseract_module, "tesseract_cmd", None):
        return

    # Env override wins
    if TESSERACT_ENV_PATH and os.path.exists(TESSERACT_ENV_PATH):
        pytesseract_module.tesseract_cmd = TESSERACT_ENV_PATH
        print(f"🔧 Tesseract path set from TESSERACT_CMD env: {TESSERACT_ENV_PATH}")
        return

    # Windows common install locations
    if platform.system().lower() == "windows":
        for candidate in WINDOWS_TESSERACT_CANDIDATES:
            if os.path.exists(candidate):
                pytesseract_module.tesseract_cmd = candidate
                print(f"🔧 Tesseract path auto-configured: {candidate}")
                return

    # If still unset, leave as-is; pytesseract will use PATH

# Request/Response Models
class ChatRequest(BaseModel):
    message: str
    conversation_id: str
    user_id: Optional[str] = None
    university_name: Optional[str] = None
    user_context: Optional[Dict[str, Any]] = None

class ChatResponse(BaseModel):
    model_config = {"protected_namespaces": ()}
    
    success: bool
    reply: str
    sources: List[Dict[str, Any]] = []
    confidence: float = 0.0
    timestamp: str
    processing_time: Optional[float] = None
    model_used: str = "hybrid-rag"

# Ghana Universities Knowledge Base
GHANA_UNIVERSITIES_KNOWLEDGE = {
    "University of Ghana": {
        "location": "Legon, Accra",
        "established": "1948",
        "motto": "Integri Procedamus (Let us proceed with integrity)",
        "programs": {
            "Computer Science": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Math, Physics, Elective Math + 2 other subjects",
                f"fees_{datetime.now().year}": "Contact university for current rates",
                "career_prospects": "Software Developer, Data Scientist, IT Consultant"
            },
            "Medicine": {
                "duration": "6 years",
                "requirements": "WASSCE: A1-B3 in Biology, Chemistry, Physics, Math, English",
                f"fees_{datetime.now().year}": "Contact university for current rates",
                "career_prospects": "Doctor, Medical Researcher, Specialist"
            },
            "Business Administration": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Math, Economics + 3 other subjects",
                f"fees_{datetime.now().year}": "Contact university for current rates",
                "career_prospects": "Manager, Entrepreneur, Consultant"
            }
        },
        "admission_requirements": {
            "general": "WASSCE with minimum of 6 credits (A1-C6) including English and Mathematics",
            "application_deadline": f"March 31, {datetime.now().year + 1}",
            "current_application_status": f"Applications for {datetime.now().year + 1} academic year",
            "application_fee": "Contact university for current application fee",
            "entrance_exam": "Required for competitive programs",
            "online_portal": "https://admissions.ug.edu.gh"
        },
        "contact": {
            "phone": "+233-30-213-8501",
            "email": "admissions@ug.edu.gh",
            "address": "University of Ghana, P.O. Box LG 25, Legon-Accra"
        },
        "website": "www.ug.edu.gh",
        f"current_fees_{datetime.now().year}": {
            "ghanaian_students": "Contact university for current tuition rates",
            "international_students": "Contact university for current international student rates",
            "residential_fees": "Contact university for current accommodation rates",
            "other_fees": "Contact university for detailed fee breakdown",
            "last_updated": datetime.now().strftime("%B %Y"),
            "note": f"Fees are subject to annual review. Contact admissions for {datetime.now().year + 1} rates."
        },
        "scholarships": {
            "ug_excellence": "Up to 100% tuition coverage for outstanding students",
            "need_based": "Partial tuition support for financially disadvantaged students",
            "sports": "Full scholarships for exceptional athletes",
            "sabre_scholarship": "For students from Northern Ghana"
        }
    },

    "Kwame Nkrumah University of Science and Technology": {
        "location": "Kumasi, Ashanti Region",
        "established": "1952",
        "motto": "Technology for Development and Progress",
        "programs": {
            "Computer Engineering": {
                "duration": "4 years (8 semesters)",
                "requirements": "WASSCE: A1-B3 in Mathematics, Physics, Chemistry, English (Aggregate 6-12)",
                f"fees_{datetime.now().year}": "Contact university for current rates",
                "application_fee": "Contact university for current application fee",
                f"deadline_{datetime.now().year}": f"April 15, {datetime.now().year}",
                "entrance_exam": "Required - KNUST Aptitude Test",
                "career_prospects": "Software Engineer, Systems Analyst, Tech Lead, Hardware Engineer",
                "starting_salary": "GHS 4,000 - 10,000 per month",
                "job_market": "Excellent demand, 90% employment rate"
            },
            "Civil Engineering": {
                "duration": "4 years",
                "requirements": "WASSCE: A1-B3 in Mathematics, Physics, Chemistry, English",
                f"fees_{datetime.now().year}": "Contact university for current rates",
                "career_prospects": "Civil Engineer, Project Manager, Construction Consultant",
                "starting_salary": "GHS 5,000 - 12,000 per month"
            },
            "Medicine": {
                "duration": "6 years",
                "requirements": "WASSCE: A1-B3 in Biology, Chemistry, Physics, Mathematics, English",
                f"fees_{datetime.now().year}": "Contact university for current rates",
                "entrance_exam": "Required - Medical Aptitude Test",
                "career_prospects": "Medical Doctor, Surgeon, Medical Researcher",
                "starting_salary": "GHS 6,000 - 15,000 per month"
            },
            "Architecture": {
                "duration": "5 years",
                "requirements": "WASSCE: A1-C6 in Mathematics, Physics, English + Art or Technical Drawing",
                f"fees_{datetime.now().year}": "Contact university for current rates",
                "career_prospects": "Architect, Urban Planner, Design Consultant",
                "starting_salary": "GHS 3,500 - 8,000 per month"
            },
            "Civil Engineering": {
                "duration": "4 years",
                "requirements": "WASSCE: A1-C6 in Math, Physics, Chemistry, English",
                f"fees_{datetime.now().year}": "Contact university for current rates",
                "career_prospects": "Civil Engineer, Project Manager, Construction Consultant"
            },
            "Medicine": {
                "duration": "6 years",
                "requirements": "WASSCE: A1-B3 in Biology, Chemistry, Physics, Math, English",
                f"fees_{datetime.now().year}": "Contact university for current rates",
                "career_prospects": "Medical Doctor, Surgeon, Medical Researcher"
            }
        },
        "admission_requirements": {
            "general": "WASSCE with minimum aggregate 24 for most programs",
            "science_programs": "Strong performance in Mathematics and Science subjects required",
            "application_deadline": f"April 15, {datetime.now().year}",
            "application_fee": "Contact university for current application fee",
            "entrance_exam": "Required for Engineering and Medicine"
        },
        "contact": {
            "phone": "+233-32-206-0331", 
            "email": "admissions@knust.edu.gh",
            "address": "KNUST, PMB, University Post Office, Kumasi"
        },
        "website": "www.knust.edu.gh",
        f"current_fees_{datetime.now().year}": {
            "ghanaian_students": "Contact university for current tuition rates",
            "international_students": "Contact university for current international student rates",
            "residential_fees": "Contact university for current accommodation rates",
            "other_fees": "Contact university for current fees breakdown"
        },
        "scholarships": {
            "knust_excellence": "Merit-based full scholarships",
            "mastercard_foundation": "For disadvantaged but brilliant students", 
            "engineering_scholarship": "Specifically for engineering students",
            "ges_scholarship": "For teacher training candidates"
        }
    },
    "University of Cape Coast": {
        "location": "Cape Coast, Central Region",
        "established": "1962",
        "motto": "Wisdom and Fidelity",
        "specializations": ["Education", "Teacher Training", "Business", "Social Sciences", "Health Sciences", "Agriculture"],
        "programs": {
            "Education": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Math + relevant subjects",
                f"fees_{datetime.now().year}": "Contact university for current rates",
                "career_prospects": "Teacher, Education Administrator, Curriculum Developer"
            },
            "Nursing": {
                "duration": "4 years",
                "requirements": "WASSCE: A1-C6 in English, Math, Biology, Chemistry",
                f"fees_{datetime.now().year}": "Contact university for current rates",
                "career_prospects": "Registered Nurse, Healthcare Professional"
            },
            "Business": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Math, Economics + 3 others",
                f"fees_{datetime.now().year}": "Contact university for current rates",
                "career_prospects": "Business Manager, Entrepreneur, Consultant"
            },
            "Agriculture": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Math, Science subjects",
                f"fees_{datetime.now().year}": "Contact university for current rates",
                "career_prospects": "Agricultural Officer, Agribusiness Manager, Farm Manager"
            }
        },
        "admission_requirements": {
            "general": "WASSCE with 6 credits minimum including English and Mathematics",
            "application_deadline": f"March 31, {datetime.now().year + 1}",
            "application_fee": "Contact university for current application fee",
            "online_portal": "https://admissions.ucc.edu.gh"
        },
        "contact": {
            "phone": "+233-33-213-2440",
            "email": "admissions@ucc.edu.gh",
            "address": "University of Cape Coast, Cape Coast, Central Region"
        },
        "website": "www.ucc.edu.gh", 
        f"current_fees_{datetime.now().year}": {
            "ghanaian_students": "Contact university for current tuition rates",
            "residential_fees": "Contact university for current accommodation rates"
        },
        "scholarships": {
            "teacher_training": "Full scholarships for teacher trainees",
            "excellence_awards": "Merit-based scholarships for outstanding students"
        }
    },
    "University for Development Studies": {
        "location": "Tamale, Northern Region",
        "established": "1992",
        "motto": "Development through Knowledge and Skill",
        "specializations": ["Agriculture", "Development Studies", "Medicine", "Engineering", "Applied Sciences"],
        "programs": {
            "Agriculture": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Math, Science subjects",
                f"fees_{datetime.now().year}": "Contact university for current rates",
                "career_prospects": "Agricultural Officer, Farm Manager, Agribusiness Professional"
            },
            "Medicine": {
                "duration": "6 years",
                "requirements": "WASSCE: A1-B3 in Biology, Chemistry, Physics, Math, English",
                f"fees_{datetime.now().year}": "Contact university for current rates",
                "career_prospects": "Medical Doctor, Healthcare Professional"
            },
            "Development Studies": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Math + Social Science subjects",
                f"fees_{datetime.now().year}": "Contact university for current rates",
                "career_prospects": "Development Worker, Policy Analyst, NGO Professional"
            },
            "Agricultural Engineering": {
                "duration": "4 years",
                "requirements": "WASSCE: A1-C6 in Math, Physics, Chemistry + English",
                f"fees_{datetime.now().year}": "Contact university for current rates",
                "career_prospects": "Agricultural Engineer, Irrigation Specialist, Farm Technology Expert"
            }
        },
        "admission_requirements": {
            "general": "WASSCE with relevant subject combinations",
            "application_deadline": f"April 15, {datetime.now().year + 1}",
            "application_fee": "Contact university for current application fee",
            "online_portal": "https://admissions.uds.edu.gh"
        },
        "contact": {
            "phone": "+233-37-20-9-3541",
            "email": "admissions@uds.edu.gh",
            "address": "University for Development Studies, Tamale, Northern Region"
        },
        "website": "www.uds.edu.gh",
        f"current_fees_{datetime.now().year}": {
            "ghanaian_students": "Contact university for current tuition rates",
            "residential_fees": "Contact university for current accommodation rates"
        },
        "scholarships": {
            "rural_development": "Scholarships for students from rural communities",
            "northern_scholarship": "Special support for Northern Ghana students"
        }
    },
    "University of Professional Studies": {
        "location": "Accra, Greater Accra Region",
        "established": "1965",
        "motto": "Excellence in Professional Studies",
        "specializations": ["Business", "Accounting", "Marketing", "Management", "Public Administration"],
        "programs": {
            "Accounting": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Math, Economics + 3 others",
                f"fees_{datetime.now().year}": "Contact university for current rates",
                "career_prospects": "Accountant, Auditor, Financial Analyst"
            },
            "Marketing": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Math, Economics/Business",
                f"fees_{datetime.now().year}": "Contact university for current rates",
                "career_prospects": "Marketing Manager, Brand Specialist, Sales Executive"
            },
            "Banking and Finance": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Math, Economics",
                f"fees_{datetime.now().year}": "Contact university for current rates",
                "career_prospects": "Banker, Financial Advisor, Investment Analyst"
            },
            "Public Administration": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Math + Social Sciences",
                f"fees_{datetime.now().year}": "Contact university for current rates",
                "career_prospects": "Public Servant, Administrator, Policy Analyst"
            }
        },
        "admission_requirements": {
            "general": "WASSCE with 6 credits including English and Mathematics",
            "application_deadline": f"March 31, {datetime.now().year + 1}",
            "application_fee": "Contact university for current application fee",
            "online_portal": "https://admissions.upsa.edu.gh"
        },
        "contact": {
            "phone": "+233-30-298-1000",
            "email": "admissions@upsa.edu.gh",
            "address": "UPSA, Box LG 149, Legon, Accra"
        },
        "website": "www.upsa.edu.gh",
        f"current_fees_{datetime.now().year}": {
            "ghanaian_students": "Contact university for current tuition rates",
            "professional_programs": "Contact university for professional program rates"
        },
        "scholarships": {
            "professional_excellence": "Merit-based scholarships for top performers",
            "need_based": "Financial support for disadvantaged students"
        }
    },
    "University of Energy and Natural Resources": {
        "location": "Sunyani, Bono Region",
        "established": "2011",
        "motto": "Energy and Natural Resources for Development",
        "specializations": ["Energy Engineering", "Environmental Science", "Natural Resources", "Sustainable Development"],
        "programs": {
            "Renewable Energy Engineering": {
                "duration": "4 years",
                "requirements": "WASSCE: A1-C6 in Math, Physics, Chemistry, English",
                f"fees_{datetime.now().year}": "Contact university for current rates",
                "career_prospects": "Energy Engineer, Renewable Energy Specialist, Sustainability Consultant"
            },
            "Environmental Science": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in Math, Biology, Chemistry, English",
                f"fees_{datetime.now().year}": "Contact university for current rates",
                "career_prospects": "Environmental Scientist, Conservation Officer, Climate Change Analyst"
            },
            "Forest Resources Management": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in Math, Biology/Agriculture, English",
                f"fees_{datetime.now().year}": "Contact university for current rates",
                "career_prospects": "Forestry Officer, Natural Resource Manager, Wildlife Conservationist"
            }
        },
        "admission_requirements": {
            "general": "WASSCE with 6 credits including English, Math, and Science subjects",
            "application_deadline": f"April 15, {datetime.now().year + 1}",
            "application_fee": "Contact university for current application fee",
            "online_portal": "https://admissions.uenr.edu.gh"
        },
        "contact": {
            "phone": "+233-35-206-2108",
            "email": "admissions@uenr.edu.gh",
            "address": "UENR, Box 214, Sunyani, Bono Region"
        },
        "website": "www.uenr.edu.gh",
        f"current_fees_{datetime.now().year}": {
            "ghanaian_students": "Contact university for current tuition rates"
        },
        "scholarships": {
            "energy_scholarship": "For students in energy-related programs",
            "sustainability_award": "For outstanding environmental science students"
        }
    },
    "University of Health and Allied Sciences": {
        "location": "Ho, Volta Region",
        "established": "2011",
        "motto": "Scientiarum Oeconomiaeque Sanitatis",
        "specializations": ["Medicine", "Nursing", "Public Health", "Midwifery", "Allied Health Sciences"],
        "programs": {
            "Medicine": {
                "duration": "6 years",
                "requirements": "WASSCE: A1-B3 in Biology, Chemistry, Physics, Math, English",
                f"fees_{datetime.now().year}": "Contact university for current rates",
                "career_prospects": "Medical Doctor, Surgeon, Healthcare Professional"
            },
            "Nursing": {
                "duration": "4 years",
                "requirements": "WASSCE: A1-C6 in English, Math, Biology, Chemistry",
                f"fees_{datetime.now().year}": "Contact university for current rates",
                "career_prospects": "Registered Nurse, Healthcare Provider"
            },
            "Public Health": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Math, Biology, Chemistry",
                f"fees_{datetime.now().year}": "Contact university for current rates",
                "career_prospects": "Public Health Officer, Epidemiologist, Health Policy Analyst"
            },
            "Physician Assistant Studies": {
                "duration": "4 years",
                "requirements": "WASSCE: A1-C6 in Biology, Chemistry, English, Math",
                f"fees_{datetime.now().year}": "Contact university for current rates",
                "career_prospects": "Physician Assistant, Medical Professional"
            }
        },
        "admission_requirements": {
            "general": "WASSCE with strong performance in science subjects",
            "entrance_exam": "Required for Medicine and competitive programs",
            "application_deadline": f"March 31, {datetime.now().year + 1}",
            "application_fee": "Contact university for current application fee",
            "online_portal": "https://admissions.uhas.edu.gh"
        },
        "contact": {
            "phone": "+233-36-202-1401",
            "email": "admissions@uhas.edu.gh",
            "address": "UHAS, PMB 31, Ho, Volta Region"
        },
        "website": "www.uhas.edu.gh",
        f"current_fees_{datetime.now().year}": {
            "ghanaian_students": "Contact university for current tuition rates"
        },
        "scholarships": {
            "health_professional": "For outstanding health sciences students",
            "rural_health": "For students committed to rural healthcare"
        }
    },
    "Ghana Institute of Management and Public Administration": {
        "location": "Accra, Greater Accra Region",
        "established": "1961",
        "motto": "Excellence in Public Service",
        "specializations": ["Public Administration", "Management", "Governance", "Development Management"],
        "programs": {
            "Public Administration": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Math + Social Science subjects",
                f"fees_{datetime.now().year}": "Contact university for current rates",
                "career_prospects": "Public Administrator, Government Official, Policy Analyst"
            },
            "Public Management": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Math, Economics/Government",
                f"fees_{datetime.now().year}": "Contact university for current rates",
                "career_prospects": "Manager, Public Sector Professional, Administrator"
            },
            "Development Management": {
                "duration": "4 years",
                "requirements": "WASSCE: Credits in English, Math + relevant subjects",
                f"fees_{datetime.now().year}": "Contact university for current rates",
                "career_prospects": "Development Officer, NGO Manager, Project Coordinator"
            }
        },
        "admission_requirements": {
            "general": "WASSCE with 6 credits including English and Mathematics",
            "mature_student": "Age 25+ with relevant work experience",
            "application_deadline": f"March 31, {datetime.now().year + 1}",
            "application_fee": "Contact university for current application fee"
        },
        "contact": {
            "phone": "+233-30-240-1681",
            "email": "admissions@gimpa.edu.gh",
            "address": "GIMPA, Box AH 50, Achimota, Accra"
        },
        "website": "www.gimpa.edu.gh",
        f"current_fees_{datetime.now().year}": {
            "ghanaian_students": "Contact university for current tuition rates"
        },
        "scholarships": {
            "public_service": "For government-sponsored students",
            "excellence_award": "Merit-based scholarships"
        }
    },
    "Ashesi University": {
        "location": "Berekuso, Eastern Region",
        "established": "2002",
        "motto": "Excellence. Ethics. Entrepreneurship.",
        "specializations": ["Computer Science", "Engineering", "Business", "Liberal Arts"],
        "type": "private",
        "programs": {
            "Computer Science": {
                "duration": "4 years",
                "requirements": "WASSCE: Strong performance in Math, English, Science",
                f"fees_{datetime.now().year}": "Contact university for current rates (typically higher for private institution)",
                "career_prospects": "Software Engineer, Tech Entrepreneur, Systems Analyst"
            },
            "Electrical and Electronic Engineering": {
                "duration": "4 years",
                "requirements": "WASSCE: Excellence in Math, Physics, Chemistry",
                f"fees_{datetime.now().year}": "Contact university for current rates (typically higher for private institution)",
                "career_prospects": "Electrical Engineer, Electronics Specialist"
            },
            "Business Administration": {
                "duration": "4 years",
                "requirements": "WASSCE: Strong academic performance",
                f"fees_{datetime.now().year}": "Contact university for current rates (typically higher for private institution)",
                "career_prospects": "Entrepreneur, Business Manager, Consultant"
            }
        },
        "admission_requirements": {
            "general": "Highly competitive, emphasis on leadership and innovation",
            "entrance_exam": "SAT/ACT recommended but not required",
            "application_deadline": f"January 31, {datetime.now().year + 1}",
            "application_fee": "Contact university for current application fee"
        },
        "contact": {
            "phone": "+233-30-286-2831",
            "email": "admissions@ashesi.edu.gh",
            "address": "Ashesi University, 1 University Avenue, Berekuso"
        },
        "website": "www.ashesi.edu.gh",
        f"current_fees_{datetime.now().year}": {
            "international_standard": "Contact university for current tuition rates (private institution rates typically higher)"
        },
        "scholarships": {
            "mastercard_foundation": "Full scholarships for academically strong, financially needy students",
            "merit_scholarship": "Partial to full scholarships based on academic excellence",
            "african_scholars": "For outstanding African students"
        }
    }
}

async def initialize_services():
    """Initialize all services on startup"""
    global embedding_model, groq_client, db_client
    
    print("🚀 Initializing Glinax RAG+CAG Services...")
    
    try:
        # Initialize embedding model (with fallback on error)
        try:
            print("📊 Loading embedding model...")
            embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
            print("✅ Embedding model loaded successfully")
        except Exception as embed_error:
            print(f"⚠️ Embedding model loading failed: {embed_error}")
            print("⚠️ Will use fallback similarity matching")
            embedding_model = None
        
        # Initialize Groq client
        groq_api_key = os.getenv('GROQ_API_KEY')
        if groq_api_key:
            try:
                groq_client = Groq(api_key=groq_api_key)
                print("✅ Groq client initialized")
            except Exception as groq_error:
                print(f"⚠️ Groq client initialization failed: {groq_error}")
                groq_client = None
        else:
            print("⚠️ GROQ_API_KEY not found, will use fallback responses")
        
        # Initialize MongoDB client
        mongodb_uri = os.getenv('MONGODB_URI')
        if mongodb_uri:
            try:
                db_client = motor.motor_asyncio.AsyncIOMotorClient(mongodb_uri)
                await db_client.admin.command('ping')
                print("✅ MongoDB connected successfully")
            except Exception as mongo_error:
                print(f"⚠️ MongoDB connection failed: {mongo_error}")
                db_client = None
        else:
            print("⚠️ MongoDB URI not found")
        
        print("🎯 Services initialization complete (some optional services may have failed gracefully)")
        
    except Exception as e:
        print(f"❌ Critical service initialization error: {e}")
        raise

def search_local_knowledge(query: str, university_name: str = None) -> Dict[str, Any]:
    """Search local Ghana universities knowledge base"""
    
    query_lower = query.lower()
    results = []
    confidence = 0.0
    
    # Check for university name variations - UNBIASED, all universities equal
    uni_name_variations = {
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
        "berekuso": "Ashesi University"
    }
    
    # Find university from query if not provided
    if not university_name:
        for variation, full_name in uni_name_variations.items():
            if variation in query_lower:
                university_name = full_name
                break
    
    # If specific university mentioned, prioritize it
    if university_name:
        uni_data = GHANA_UNIVERSITIES_KNOWLEDGE.get(university_name, {})
        if uni_data:
            results.append({
                "source": university_name,
                "data": uni_data,
                "relevance": 0.98
            })
            confidence = 0.98
    
    # Search all universities for relevant information
    for uni_name, uni_data in GHANA_UNIVERSITIES_KNOWLEDGE.items():
        if university_name and uni_name == university_name:
            continue  # Already added above
            
        relevance = 0.0
        
        # Program-specific matching
        if "programs" in uni_data and isinstance(uni_data["programs"], dict):
            for program_name, program_data in uni_data["programs"].items():
                program_text = f"{program_name} {json.dumps(program_data)}".lower()
                if any(word in program_text for word in query_lower.split()):
                    relevance += 0.4
        
        # Check for keyword matches
        text_to_search = f"{uni_name} {json.dumps(uni_data)}".lower()
        
        # High-value keywords
        high_keywords = ["computer science", "engineering", "medicine", "business"]
        for keyword in high_keywords:
            if keyword in query_lower and keyword in text_to_search:
                relevance += 0.6
        
        # Standard keywords
        keywords = ["admission", "fee", "fees", "cost", "program", "scholarship", "contact", "requirement"]
        for keyword in keywords:
            if keyword in query_lower and keyword in text_to_search:
                relevance += 0.3
        
        # Direct text matching for specific terms
        query_words = query_lower.split()
        for word in query_words:
            if len(word) > 3 and word in text_to_search:
                relevance += 0.2
        
        if relevance > 0.4:
            results.append({
                "source": uni_name,
                "data": uni_data,
                "relevance": min(relevance, 0.95)
            })
    
    # Sort by relevance and take top 3
    results = sorted(results, key=lambda x: x["relevance"], reverse=True)[:3]
    
    return {
        "results": results,
        "confidence": confidence or (max([r["relevance"] for r in results]) if results else 0.0)
    }

async def search_web_realtime(query: str) -> Dict[str, Any]:
    """Search web for real-time information using DuckDuckGo or SerpAPI if available"""
    try:
        serpapi_key = os.getenv('SERPAPI_KEY')
        if serpapi_key:
            return await search_with_serpapi(query, serpapi_key)

        # Use DuckDuckGo Search as default real web search
        from duckduckgo_search import DDGS
        ddgs = DDGS()
        current_year = datetime.now().year
        enhanced_query = f"{query} Ghana universities {current_year} official site"
        results = []
        # Use text search for snippets and URLs; limit to reasonable amount
        for item in ddgs.text(enhanced_query, region='wt-wt', safesearch='moderate', max_results=8):
            if not isinstance(item, dict):
                continue
            url = item.get('href') or item.get('url') or ''
            title = item.get('title') or ''
            snippet = item.get('body') or item.get('snippet') or ''
            # Prioritize official Ghana university domains
            domain = (url or '').lower()
            source_type = 'official_website' if any(d in domain for d in ['ug.edu.gh','knust.edu.gh','ucc.edu.gh','uds.edu.gh','upsa.edu.gh','uenr.edu.gh','uhas.edu.gh']) else 'web_search'
            results.append({
                'title': title,
                'url': url,
                'snippet': snippet,
                'source': source_type,
                'priority': 'high' if source_type == 'official_website' else 'medium'
            })
        return {'results': results, 'confidence': 0.75 if results else 0.0}
    except Exception as e:
        print(f"⚠️ Web search error (continuing with local knowledge): {e}")
        return {"results": [], "confidence": 0.0}

async def search_with_serpapi(query: str, api_key: str) -> Dict[str, Any]:
    """Search using SerpAPI"""
    try:
        # Enhanced query for current year information
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
            "gl": "gh"
        }
        
        response = requests.get(url, params=params, timeout=15)
        data = response.json()
        
        results = []
        for result in data.get("organic_results", [])[:5]:
            # Filter for Ghana university domains
            url = result.get("link", "")
            if any(domain in url.lower() for domain in ["ug.edu.gh", "knust.edu.gh", "ucc.edu.gh", "uds.edu.gh", "upsa.edu.gh"]):
                results.append({
                    "title": result.get("title", ""),
                    "url": url,
                    "snippet": result.get("snippet", ""),
                    "source": "official_website",
                    "priority": "high"
                })
            else:
                results.append({
                    "title": result.get("title", ""),
                    "url": url,
                    "snippet": result.get("snippet", ""),
                    "source": "web_search",
                    "priority": "medium"
                })
        
        return {
            "results": results,
            "confidence": 0.8 if results else 0.0
        }
        
    except Exception as e:
        print(f"❌ SerpAPI error: {e}")
        return {"results": [], "confidence": 0.0}

# Removed simulated web search in favor of real DuckDuckGo and SerpAPI
# async def search_web_direct(query: str) -> Dict[str, Any]:

    pass  # deprecated simulated search body removed
def generate_response_with_groq(query: str, context: str, sources: List[Dict]) -> str:
    """Generate response using Groq LLM with enhanced file processing capabilities"""
    
    try:
        if not groq_client:
            return generate_smart_fallback_response(query, context, sources)
        
        # Enhanced system prompt for Ghana context with STRICT UNBIASED RECOMMENDATIONS
        system_prompt = """You are Glinax, a highly professional AI assistant specializing in Ghanaian university admissions and education. You have advanced capabilities to analyze uploaded files and provide contextual guidance.

Your core competencies:
- Expert knowledge of Ghana's university system and admission requirements
- Professional analysis of academic documents, certificates, and images
- Personalized guidance based on uploaded content
- Current knowledge of fees, deadlines, and application procedures

**CRITICAL: UNBIASED UNIVERSITY RECOMMENDATIONS**
You MUST provide fair, assessment-driven recommendations for ALL Ghanaian universities:
- NEVER default to recommending only University of Ghana, KNUST, or UCC
- Base ALL recommendations on the user's specific assessment data: subjects, SHS program, WASSCE grade, career goals, interests, location preference
- Consider the FULL range of Ghana universities: UG, KNUST, UCC, UDS, UPSA, UENR, UHAS, Ashesi, GIMPA, GTUC, Central University, Valley View, Presbyterian, Methodist, Academic City, etc.
- Match programs to user profile, NOT university prestige
- For technical/vocational interests → recommend technical universities, polytechnics, TVET institutions
- For agriculture → emphasize UDS, UENR, agricultural colleges
- For health sciences → include UHAS, nursing training colleges, not just UG/KNUST Medicine
- For education → highlight UCC, University of Education Winneba, not just big three
- For business/accounting → include UPSA, GIMPA, not just UG/KNUST
- For arts/humanities → recommend universities with strong arts programs
- For lower WASSCE grades → suggest universities with flexible admission, distance learning, mature student programs

**Assessment-Driven Matching Rules:**
1. If user studied General Science + wants Engineering → KNUST, UG Engineering, UENR, UDS Engineering
2. If user studied Business + wants Accounting → UPSA, GIMPA, UCC, UG, private business colleges
3. If user studied Agriculture Science + wants Farming → UDS, UENR, UCC Agriculture, agricultural colleges
4. If user studied General Arts + wants Teaching → UCC, UEW, teacher training colleges
5. If user studied Technical + wants hands-on work → Technical universities, TVET institutions
6. If user has low WASSCE grade → Community colleges, diploma programs, mature student options
7. If user prefers Northern Ghana → UDS, UEW Kumasi, northern campuses
8. If user prefers Ashanti Region → KNUST, UEW Kumasi, Ashesi (Berekuso)
9. If user wants affordable → Public universities, distance learning, scholarship programs at all institutions

**Explanation Requirements:**
For EVERY recommendation, you MUST explain:
- Why this specific university matches their SUBJECTS studied
- How this program aligns with their CAREER GOALS
- Why their WASSCE GRADE makes them eligible
- How their INTERESTS and SHS PROGRAM fit
- Location consideration relative to their preference

**Forbidden Patterns:**
- "I recommend University of Ghana, KNUST, and UCC" (without assessing profile)
- "These are the top three universities in Ghana" (biased statement)
-  "The best universities for you are UG, KNUST, UCC" (ignoring other options)

File Analysis Capabilities:
- Academic transcripts and certificates: Analyze grades and recommend suitable programs
- University brochures and websites: Extract relevant admission information
- Personal statements and essays: Provide feedback and improvement suggestions
- Images of documents: Extract and interpret text content for admission guidance

CRITICAL RULE: When analyzing CVs or Transcripts, you MUST first identify and explicitly state the name of the University/Institution and the Program of Study found at the top of the document before analyzing grades.

If the user uploads a document, prioritize the information found in the document text over your general knowledge base.

Response Standards - STRICTLY ENFORCED:
- ALWAYS maintain a professional, formal, and encouraging tone
- NEVER use slang, casual language, or informal expressions
- NEVER use emojis or text speak in your responses
- Use proper grammar, complete sentences, and formal English language
- Address users respectfully with professional language
- Provide accurate, up-to-date information with specific details
- Structure responses clearly with headings and bullet points using markdown formatting
- Include actionable next steps and contact information
- When analyzing files, be specific about what you observed and how it relates to admission requirements

**CRITICAL LINK FORMATTING RULES:**
- ALL website links must use proper markdown: [descriptive text](URL)
- NEVER use the URL as the link text: ❌ [https://example.com](https://example.com)
- ALWAYS use descriptive text: ✅ [University Admissions Portal](https://example.com)
- NEVER nest brackets or duplicate URLs: ❌ [[URL](URL)](URL)
- Each URL should appear only ONCE in the link
- Examples:
  * ✅ University of Ghana: [Visit Admissions Portal](https://admissions.ug.edu.gh/)
  * ✅ KNUST: [Official Website](https://www.knust.edu.gh/)
  * ❌ University of Ghana: [https://admissions.ug.edu.gh/](https://admissions.ug.edu.gh/)
  * ❌ KNUST: [[https://www.knust.edu.gh/](https://www.knust.edu.gh/)](https://www.knust.edu.gh/)
- ALWAYS include complete URLs when referencing websites or online resources

For university information, ALWAYS provide:
1. **Program Overview**: Duration, focus areas, and specializations
2. **Admission Requirements**: Specific grades, subjects, and additional criteria
3. **Current Fees ({datetime.now().year})**: Tuition, accommodation, registration, and other costs
4. **Application Process**: Deadlines, required documents, and submission methods
5. **Contact Information**: Phone, email, physical address, and website
6. **Financial Aid**: Scholarships, grants, and payment options
7. **Career Prospects**: Employment opportunities and earning potential

When files are uploaded, provide specific analysis and recommendations based on the content.

PROFESSIONAL FILE ANALYSIS PROTOCOL:
1. **Document Identification**: Clearly state what type of document was uploaded
2. **Content Summary**: Provide a brief overview of key information extracted
3. **Admission Relevance**: Explain how the document content relates to university admissions
4. **Recommendations**: Give specific, actionable advice based on the document
5. **Next Steps**: Outline clear steps for the user to take

For academic transcripts/certificates:
- Identify the institution and program
- Analyze grades and performance
- Compare against university requirements
- Recommend suitable programs and universities
- Suggest areas for improvement if applicable

For images of documents:
- Extract and interpret visible text
- Identify document type and purpose
- Provide guidance on document quality and completeness
- Explain how the document fits into the admission process

Maintain the highest standards of professionalism and accuracy in all responses."""

        # Prepare user message with context
        user_message = f"""
Question: {query}

Available Information:
{context}

Sources: {json.dumps(sources, indent=2)}

Please provide a helpful, accurate response based on the available information.
"""

        # Generate response with current supported model
        chat_completion = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
            model="llama-3.1-8b-instant",  # Current working model
            temperature=0.3,
            max_tokens=1024
        )
        
        raw_response = chat_completion.choices[0].message.content
        # Sanitize URLs in the response before returning
        return sanitize_markdown_urls(raw_response)
        
    except Exception as e:
        print(f"❌ Groq generation error: {e}")
        return generate_smart_fallback_response(query, context, sources)

def generate_smart_fallback_response(query: str, context: str, sources: List[Dict]) -> str:
    """Generate intelligent fallback response that actually uses provided sources.

    - Prefer official university sources from web search when LLM is unavailable.
    - Fall back to local knowledge base summaries.
    - Include URLs and snippets where available.
    """

    query_lower = query.lower()

    # 1) If web sources are available, synthesize an answer using them (prioritize official)
    web_items = []
    official_items = []
    for s in sources or []:
        if s.get('type') in ('web_search', 'official_website') or s.get('source') in ('web_search', 'official_website'):
            title = s.get('source') if s.get('type') == 'local_knowledge' else s.get('source')
            web_items.append({
                'title': title or 'Web Result',
                'url': s.get('url') or '',
                'snippet': s.get('snippet') or s.get('body') or ''
            })
    # If sources did not include snippet/body, try to parse from context lines
    if not web_items and context:
        for line in context.splitlines():
            if line.startswith('Web Result:'):
                web_items.append({'title': 'Web Result', 'url': '', 'snippet': line.replace('Web Result:', '').strip()})

    for item in web_items:
        url = (item.get('url') or '').lower()
        if any(d in url for d in ['ug.edu.gh','knust.edu.gh','ucc.edu.gh','uds.edu.gh','upsa.edu.gh','uenr.edu.gh','uhas.edu.gh']):
            official_items.append(item)

    if web_items:
        header = "Here’s what I found from recent web results:"
        lines = [header, ""]
        prioritized = (official_items or web_items)[:5]
        for r in prioritized:
            title = r.get('title') or 'Web Result'
            url = r.get('url') or ''
            snippet = r.get('snippet') or ''
            bullet = f"• {title}: {snippet}"
            if url:
                bullet += f" (Source: {url})"
            lines.append(bullet)
        lines.append("")
        lines.append("If you want, I can fetch more details or verify this from additional sources.")
        return sanitize_markdown_urls("\n".join(lines))

    # 2) Fall back to local knowledge flow (existing structured summaries)
    # Direct access to knowledge base for accurate responses
    relevant_universities = []

    # Identify universities mentioned in query - EXPANDED MAPPING
    university_keywords = {
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
        "uhas": "University of Health and Allied Sciences",
        "gimpa": "Ghana Institute of Management and Public Administration",
        "ashesi": "Ashesi University",
        "gtuc": "Ghana Technology University College",
        "central": "Central University",
        "valley view": "Valley View University",
        "presbyterian": "Presbyterian University",
        "methodist": "Methodist University",
        "academic city": "Academic City University",
        "berekuso": "Ashesi University"
    }
    
    # Find mentioned universities
    for keyword, uni_name in university_keywords.items():
        if keyword in query_lower:
            if uni_name in GHANA_UNIVERSITIES_KNOWLEDGE:
                relevant_universities.append(uni_name)
    
    # If no specific university mentioned, DON'T default to just UG/KNUST - let LLM handle OR show all
    # The system prompt will guide unbiased recommendations based on actual query content
    if not relevant_universities:
        # Include ALL universities for comprehensive responses
        relevant_universities = list(GHANA_UNIVERSITIES_KNOWLEDGE.keys())
    
    # Computer Science specific queries - UNBIASED: Show ALL universities with tech programs
    if any(word in query_lower for word in ["computer science", "computer", "programming", "software", "tech", "technology"]):
        response = "COMPUTER SCIENCE / TECHNOLOGY PROGRAMS IN GHANA\n\n"
        
        # Show universities with technology/computer programs - NOT just UG and KNUST
        tech_universities = [
            "Kwame Nkrumah University of Science and Technology",  # KNUST
            "University of Ghana",  # UG
            "Ashesi University",  # Ashesi
            "Ghana Technology University College",  # GTUC
            "University of Professional Studies",  # UPSA (IT/Business)
            "Central University",
            "Academic City University"
        ]
        
        shown_count = 0
        for uni_name in tech_universities:
            if uni_name in GHANA_UNIVERSITIES_KNOWLEDGE and shown_count < 5:  # Show top 5 to keep response concise
                uni_data = GHANA_UNIVERSITIES_KNOWLEDGE.get(uni_name, {})
                
                # Find CS/tech programs
                programs = uni_data.get("programs", {})
                cs_program = None
                cs_name = None
                
                # Look for computer/technology related programs
                for prog_name, prog_data in programs.items():
                    if any(keyword in prog_name.lower() for keyword in ["computer", "technology", "software", "engineering"]):
                        cs_program = prog_data
                        cs_name = prog_name
                        break
                
                if cs_program:
                    uni_contact = uni_data.get('contact', {})
                    # Use dynamic key based on current year
                    current_year = datetime.now().year
                    fees_key = f"current_fees_{current_year}"
                    uni_fees = uni_data.get(fees_key, {})
                    
                    response += f"""## {uni_name} - {cs_name}

**Program Duration:** {cs_program.get('duration', '4 years')}

**Admission Requirements:**
- WASSCE Requirement: {cs_program.get('requirements', 'WASSCE Credits in Math and English')}
- Application Deadline: {uni_data.get('admission_requirements', {}).get('application_deadline', 'See university website')}
- Application Fee: {uni_data.get('admission_requirements', {}).get('application_fee', 'GHS 200-300')}

**Tuition Fees ({datetime.now().year}):**
- Annual Tuition: {cs_program.get(f'fees_{datetime.now().year}', 'Contact university for current rates')}
- Accommodation: {uni_fees.get('residential_fees', 'GHS 2,500-5,000 per annum')}

**Career Prospects:**
{cs_program.get('career_prospects', 'Software Developer, IT Professional')}

**Contact Information:**
- **Phone:** {uni_contact.get('phone', 'Contact admissions office')}
- **Email:** {uni_contact.get('email', 'admissions@university.edu.gh')}
- **Website:** {uni_data.get('website', 'Visit official university website')}

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
    
    # Fees-related queries  
    elif any(word in query_lower for word in ["fee", "cost", "money", "pay", "tuition"]):
        response = f"## UNIVERSITY FEES INFORMATION ({datetime.now().year})\n\n"
        
        for uni_name, uni_data in GHANA_UNIVERSITIES_KNOWLEDGE.items():
            response += f"### {uni_name}\n\n"
            
            # Use dynamic key based on current year
            current_year = datetime.now().year
            fees_key = f"current_fees_{current_year}"
            if fees_key in uni_data:
                fees = uni_data[fees_key]
                response += f"""**Tuition Fees (per annum):**
- Ghanaian Students: {fees.get('ghanaian_students', 'Contact university')}
- International Students: {fees.get('international_students', 'Contact university')}

**Other Fees:**
- Accommodation: {fees.get('residential_fees', 'GHS 2,500 - 5,000')}
- Registration & Library: {fees.get('other_fees', 'Varies by program')}
- Application Fee: {uni_data.get('admission_requirements', {}).get('application_fee', 'GHS 200-300')}

**Application Deadline:** {uni_data.get('admission_requirements', {}).get('application_deadline', 'Check university website')}

**Contact:** {uni_data.get('contact', {}).get('phone', 'See university website')}

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
    
    # Admission requirements queries
    elif any(word in query_lower for word in ["admission", "apply", "requirement", "entry"]):
        response = "## UNIVERSITY ADMISSION REQUIREMENTS\n\n"
        
        for uni_name, uni_data in GHANA_UNIVERSITIES_KNOWLEDGE.items():
            response += f"### {uni_name}\n\n"
            
            if "admission_requirements" in uni_data:
                req = uni_data["admission_requirements"]
                response += f"""**General Requirements:**
{req.get('general', 'WASSCE with minimum 6 credits (A1-C6) including English and Mathematics')}

**Application Process:**
1. Visit the university website: {uni_data.get('website', 'Visit official university website')}
2. Complete the online application form
3. Submit required documents (WASSCE certificate, birth certificate, etc.)
4. Pay the application fee (GHS {req.get('application_fee', '200-300')})
5. Await admission decision

**Important Dates:**
- Application Deadline: {req.get('application_deadline', 'Check university website for current year')}
- Admission Announcement: {req.get('admission_announcement', 'Typically announced in June-July')}
- Registration: {req.get('registration_date', 'August-September before academic year')}

**Contact Admissions Office:**
- **Phone:** {uni_data.get('contact', {}).get('phone', 'Contact university')}
- **Email:** {uni_data.get('contact', {}).get('email', 'admissions@university.edu.gh')}
- **Address:** {uni_data.get('contact', {}).get('address', 'See university website')}

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
    
    # Default comprehensive response
    else:
        response = "## INFORMATION ABOUT GHANAIAN UNIVERSITIES\n\n"
        
        if GHANA_UNIVERSITIES_KNOWLEDGE:
            for uni_name, uni_data in GHANA_UNIVERSITIES_KNOWLEDGE.items():
                response += f"""### {uni_name}

**Established:** {uni_data.get('established', 'N/A')} | **Type:** {uni_data.get('type', 'Public').title()}

**Location:** {uni_data.get('location', 'Ghana')} ({uni_data.get('region', 'Region')})

**Specializations:** {', '.join(uni_data.get('specializations', ['Various']))}

**Key Strengths:** {', '.join(uni_data.get('strength_areas', ['Excellent academic programs']))}

**Contact Information:**
- **Phone:** {uni_data.get('contact', {}).get('phone', 'Contact admissions')}
- **Email:** {uni_data.get('contact', {}).get('email', 'admissions@university.edu.gh')}
- **Website:** {uni_data.get('website', 'Visit official website')}

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
        db = db_client[os.getenv('DB_NAME', 'glinax_chatbot_db')]
        effective_user_id = current["user_id"]
        pipeline = [
            {"$match": {"user_id": effective_user_id}},
            {"$sort": {"conversation_id": 1, "timestamp": 1}},
            {"$group": {
                "_id": "$conversation_id",
                "title": {"$first": "$query"},
                "last_active": {"$max": "$timestamp"},
                "message_count": {"$sum": 1}
            }},
            {"$sort": {"last_active": -1}}
        ]
        cursor = db.rag_logs.aggregate(pipeline)
        items = []
        async for doc in cursor:
            last = doc.get("last_active")
            items.append({
                "conversation_id": str(doc.get("_id")),
                "title": (doc.get("title") or "Untitled conversation")[:120],
                "last_active_date": last.isoformat() if isinstance(last, datetime) else str(last or ""),
                "message_count": int(doc.get("message_count") or 0)
            })
        return {"success": True, "history": items}
    except Exception as e:
        print(f"❌ Conversations list error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch conversation history")

@app.get("/api/chat/conversations-demo")
async def list_conversations_demo():
    now = datetime.now().isoformat()
    demo = [
        {
            "conversation_id": "demo-1",
            "title": f"University of Ghana fees {datetime.now().year}",
            "last_active_date": now,
            "message_count": 5
        },
        {
            "conversation_id": "demo-2",
            "title": "KNUST Computer Engineering requirements",
            "last_active_date": now,
            "message_count": 8
        },
        {
            "conversation_id": "demo-3",
            "title": "Ashesi University programs and scholarships",
            "last_active_date": now,
            "message_count": 6
        },
        {
            "conversation_id": "demo-4",
            "title": "UDS Agriculture program admission",
            "last_active_date": now,
            "message_count": 4
        },
        {
            "conversation_id": "demo-5",
            "title": "UPSA Business and Accounting opportunities",
            "last_active_date": now,
            "message_count": 7
        }
    ]
    return {"success": True, "history": demo}

# Existing history endpoints
@app.get("/history/{user_id}")
async def get_history(user_id: str):
    if not db_client:
        raise HTTPException(status_code=503, detail="Database not available")
    try:
        db = db_client[os.getenv('DB_NAME', 'glinax_chatbot_db')]
        pipeline = [
            {"$match": {"user_id": user_id}},
            {"$sort": {"conversation_id": 1, "timestamp": 1}},
            {"$group": {
                "_id": "$conversation_id",
                "title": {"$first": "$query"},
                "last_active": {"$max": "$timestamp"},
                "message_count": {"$sum": 1}
            }},
            {"$sort": {"last_active": -1}}
        ]
        cursor = db.rag_logs.aggregate(pipeline)
        items = []
        async for doc in cursor:
            items.append({
                "conversation_id": doc.get("_id"),
                "title": (doc.get("title") or "Untitled conversation")[:120],
                "last_active": (doc.get("last_active").isoformat() if isinstance(doc.get("last_active"), datetime) else str(doc.get("last_active"))),
                "message_count": int(doc.get("message_count", 0))
            })
        return {"success": True, "history": items}
    except Exception as e:
        print(f"❌ History aggregation error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch history")

@app.get("/history/chat/{conversation_id}")
async def get_conversation(conversation_id: str):
    if not db_client:
        raise HTTPException(status_code=503, detail="Database not available")
    try:
        db = db_client[os.getenv('DB_NAME', 'glinax_chatbot_db')]
        cursor = db.rag_logs.find({"conversation_id": conversation_id}).sort("timestamp", 1)
        thread = []
        async for doc in cursor:
            ts = doc.get("timestamp")
            ts_iso = ts.isoformat() if isinstance(ts, datetime) else str(ts)
            user_msg = doc.get("query")
            assistant_msg = doc.get("response")
            if user_msg:
                thread.append({"role": "user", "content": user_msg, "timestamp": ts_iso})
            if assistant_msg:
                thread.append({
                    "role": "assistant",
                    "content": assistant_msg,
                    "timestamp": ts_iso,
                    "meta": {
                        "confidence": doc.get("confidence"),
                        "sources": doc.get("sources", [])
                    }
                })
        return {"success": True, "conversation_id": conversation_id, "messages": thread}
    except Exception as e:
        print(f"❌ Conversation fetch error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch conversation thread")

@app.post("/respond", response_model=ChatResponse)
async def respond_to_query(request: ChatRequest):
    """Main RAG+CAG endpoint with conditional logic (Fast Path + Fallback)
    
    SPECIAL HANDLING: If this is an assessment request from the backend,
    return the assessment data as-is without AI processing
    """

    start_time = datetime.now()

    try:
        # CHECK: Is this an assessment request from the backend?
        is_assessment = False
        assessment_data = None
        
        if request.user_context and isinstance(request.user_context, dict):
            is_assessment = request.user_context.get('is_assessment_request', False)
            assessment_data = request.user_context.get('assessment_data', None)
            
            if is_assessment and assessment_data:
                print("✅ Assessment request detected - returning structured data from backend")
                # For assessment requests, the backend should have already done the matching
                # Return a response that references the assessment
                return ChatResponse(
                    success=True,
                    reply="Assessment data received. Recommendations will be processed by the backend assessment engine.",
                    sources=[],
                    confidence=1.0,
                    timestamp=datetime.now().isoformat(),
                    processing_time=0.01,
                    model_used="assessment-engine"
                )
        
        user_message = (request.message or "").strip()
        if not user_message:
            return ChatResponse(
                success=False,
                reply="I need a question or message to help you.",
                sources=[],
                confidence=0.0,
                timestamp=datetime.now().isoformat(),
                processing_time=0.0,
                model_used="hybrid-rag"
            )

        print(f"📥 Processing query: {user_message[:100]}...")

        # Step A: Search local knowledge base
        local_results = search_local_knowledge(
            user_message,
            request.university_name
        )
        print(f"🔍 Local search found {len(local_results['results'])} results (confidence={local_results.get('confidence', 0.0):.2f})")

        all_sources: List[Dict[str, Any]] = []
        context_parts: List[str] = []

        # Add local sources immediately
        for result in local_results.get("results", []):
            all_sources.append({
                "source": result.get("source"),
                "type": "local_knowledge",
                "confidence": result.get("relevance", 0.0)
            })
            context_parts.append(f"University: {result.get('source')}\n{json.dumps(result.get('data', {}), indent=2)}")

        # Step B: Fast Path if local confidence > 0.7
        if local_results.get('confidence', 0.0) > 0.7:
            print("⚡ Fast Path: Skipping web search due to high local confidence")
            combined_context = "\n\n".join(context_parts)
            final_confidence = local_results.get('confidence', 0.8)
            # Generate response
            if groq_client and (final_confidence > 0.3 or combined_context):
                response_text = generate_response_with_groq(user_message, combined_context, all_sources)
            else:
                response_text = generate_smart_fallback_response(user_message, combined_context, all_sources)
        else:
            # Step C: Fallback – perform real web search and combine contexts
            print("🌐 Fallback path: Running real-time web search via DDG/SerpAPI...")
            web_results = await search_web_realtime(user_message)
            print(f"🌐 Real-time search found {len(web_results.get('results', []))} results")

            for result in web_results.get("results", []):
                all_sources.append({
                    "source": result.get("title", "Web Result"),
                    "url": result.get("url", ""),
                    "type": result.get("source", "web_search"),
                    "confidence": 0.7
                })
                snippet = result.get('snippet') or result.get('body') or ''
                context_parts.append(f"Web Result: {snippet}")

            combined_context = "\n\n".join(context_parts)
            final_confidence = max(local_results.get("confidence", 0.0), web_results.get("confidence", 0.0))

            if groq_client and (final_confidence > 0.3 or combined_context):
                response_text = generate_response_with_groq(user_message, combined_context, all_sources)
            else:
                response_text = generate_smart_fallback_response(user_message, combined_context, all_sources)

        # Calculate processing time
        processing_time = (datetime.now() - start_time).total_seconds()
        print(f"✅ Response generated in {processing_time:.2f}s with confidence {final_confidence:.2f}")

        # Save to MongoDB if available
        if db_client:
            try:
                db = db_client[os.getenv('DB_NAME', 'glinax_chatbot_db')]
                await db.rag_logs.insert_one({
                    "query": request.message,
                    "response": response_text,
                    "confidence": final_confidence,
                    "sources": all_sources,
                    "processing_time": processing_time,
                    "timestamp": datetime.now(),
                    "conversation_id": request.conversation_id,
                    "user_id": request.user_id
                })
            except Exception as e:
                print(f"⚠️ Failed to save to MongoDB: {e}")

        # CRITICAL: Sanitize URLs in response before returning to client
        sanitized_reply = sanitize_markdown_urls(response_text)

        return ChatResponse(
            success=True,
            reply=sanitized_reply,
            sources=all_sources,
            confidence=final_confidence,
            timestamp=datetime.now().isoformat(),
            processing_time=processing_time,
            model_used="hybrid-rag-v2"
        )
        
    except Exception as e:
        print(f"❌ RAG processing error: {e}")
        
        # Even on error, try to provide a helpful fallback response
        try:
            fallback_response = generate_smart_fallback_response(
                request.message, 
                "", 
                []
            )
            
            # Sanitize fallback response too
            sanitized_fallback = sanitize_markdown_urls(fallback_response)
            
            return ChatResponse(
                success=True,
                reply=sanitized_fallback,
                sources=[{"source": "Local Knowledge Base", "type": "fallback", "confidence": 0.5}],
                confidence=0.5,
                timestamp=datetime.now().isoformat(),
                model_used="emergency-fallback"
            )
        except Exception as fallback_error:
            print(f"❌ Even fallback failed: {fallback_error}")
            
            return ChatResponse(
                success=False,
                reply="I apologize, but I'm having technical difficulties. Please try asking about specific universities or programs, and I'll do my best to help with admissions information. For personalized recommendations, please complete our assessment.",
                sources=[],
                confidence=0.0,
                timestamp=datetime.now().isoformat(),
                model_used="minimal-fallback"
            )

@app.post("/respond-with-files", response_model=ChatResponse)
async def respond_with_files(
    message: str = Form(...),
    conversation_id: str = Form(...),
    user_id: str = Form(None),
    university_name: str = Form(None),
    user_context: str = Form(None),
    files: List[UploadFile] = File(None)
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
                model_used="hybrid-rag-with-files"
            )

        print(f"📎 Processing message with files: {user_message[:100]}")
        print(f"📎 File count: {len(files) if files else 0}")
        
        # Process uploaded files if any
        file_contents = []
        file_info = []
        extracted_content_parts: List[str] = []  # Accumulate full extracted text content from files
        
        if files:
            for file in files:
                if file and file.filename:
                    try:
                        print(f"📄 Processing file: {file.filename} ({file.content_type})")
                        
                        # Read file content based on type
                        content = await file.read()
                        
                        # Actual content extraction per type
                        if file.content_type == 'text/plain':
                            try:
                                text_content = content.decode('utf-8', errors='ignore')
                                preview = text_content.strip()[:4000]
                                file_contents.append(f"📄 TEXT: {file.filename}\n{preview}")
                                if text_content:
                                    extracted_content_parts.append(text_content.strip())
                            except Exception as e:
                                file_contents.append(f"📄 TEXT extraction failed for {file.filename}: {e}")
                        
                        # For PDFs - Enhanced analysis for university documents
                        elif file.content_type == 'application/pdf':
                            try:
                                # Extract selectable text from PDF using pdfplumber for robust header/top text capture
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
                                        # Cap overall extracted text to ~15k chars to protect downstream model
                                        if sum(len(p) for p in extracted_pages) > 15000:
                                            break

                                # Join with double newlines to preserve section breaks
                                extracted_text = "\n\n".join(extracted_pages).strip()
                                if not extracted_text:
                                    extracted_text = "[No selectable text extracted from PDF. This may be a scanned document or image-based PDF.]"

                                # Store full extracted content for LLM context
                                extracted_content_parts.append(extracted_text)

                                # Proof-of-life debugging to verify University name capture
                                print(f"DEBUG: Extracted {len(extracted_text)} chars. Start: {extracted_text[:200]}")

                                preview = extracted_text[:4000]
                                file_contents.append(f"📋 PDF: {file.filename}\n{preview}")
                            except Exception as e:
                                file_contents.append(f"📋 PDF extraction failed for {file.filename}: {e}")
                        
                        # For images - Enhanced visual analysis
                        elif file.content_type.startswith('image/'):
                            try:
                                # OCR via pytesseract on Pillow image
                                import io
                                from PIL import Image
                                try:
                                    import pytesseract
                                except Exception as _err:
                                    pytesseract = None
                                image = Image.open(io.BytesIO(content))
                                ocr_text = ''
                                if pytesseract:
                                    try:
                                        configure_tesseract_path_if_needed(pytesseract)
                                    except Exception as cfg_err:
                                        print(f"⚠️ Tesseract path configuration warning: {cfg_err}")
                                    try:
                                        ocr_text = pytesseract.image_to_string(image) or ''
                                    except Exception as ocr_err:
                                        ocr_text = f"[OCR failed: {ocr_err}]"
                                else:
                                    ocr_text = "[OCR engine not available on server. Install pytesseract to enable OCR.]"
                                preview = ocr_text.strip()[:4000]
                                file_contents.append(f"🖼️ IMAGE: {file.filename}\n{preview if preview else '[No text detected]'}")
                                if ocr_text:
                                    extracted_content_parts.append(ocr_text.strip())
                            except Exception as e:
                                file_contents.append(f"🖼️ Image processing failed for {file.filename}: {e}")
                        
                        # For Word documents - Enhanced document analysis
                        elif file.content_type in ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']:
                            try:
                                # Extract text from DOCX using python-docx. For legacy .doc we return a hint.
                                import io
                                if file.content_type == 'application/msword' and not file.filename.lower().endswith('.docx'):
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
                        
                        # For Excel/CSV files - Enhanced data analysis
                        elif file.content_type in ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']:
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
                            except Exception as e:
                                file_contents.append(f"📊 **SPREADSHEET:** {file.filename} (processing error)")
                        
                        # For other documents - Professional handling
                        else:
                            try:
                                file_size_kb = len(content) / 1024
                                file_contents.append(f"""📎 **DOCUMENT ANALYSIS**
**File:** {file.filename}
**Type:** {file.content_type}
**Size:** {file_size_kb:.1f}KB

**General Analysis:** I have received your document and will analyze it in the context of Ghanaian university admissions. Whether it's an application document, academic record, or informational material, I'll provide relevant guidance for your university journey.

Please let me know what specific aspect of this document you'd like me to help you with regarding university admissions.""")
                            except Exception as e:
                                file_contents.append(f"📎 **DOCUMENT:** {file.filename} (processing error - please try a different format)")
                        
                        file_info.append({
                            "name": file.filename,
                            "type": file.content_type,
                            "size": len(content)
                        })
                        
                    except Exception as file_error:
                        print(f"⚠️ Error processing file {file.filename}: {file_error}")
                        file_contents.append(f"File: {file.filename} - processing error")
        
        # Enhance message with file information
        enhanced_message = message
        if file_contents:
            enhanced_message += f"\n\n[Extracted content from uploaded files]\n" + "\n\n".join(file_contents)
        
        # Also append full extracted document text for LLM prioritization
        extracted_content = "\n\n".join(extracted_content_parts).strip()
        if extracted_content:
            enhanced_message += f"\n\n[Document Text]\n{extracted_content}"
            # Proof-of-life log for entire extracted content
            print(f"DEBUG: Extracted {len(extracted_content)} chars. Start: {extracted_content[:200]}")
        
        # Parse user context if provided
        context_data = {}
        if user_context:
            try:
                context_data = json.loads(user_context)
            except:
                context_data = {"raw_context": user_context}
        
        # Create enhanced request
        enhanced_request = ChatRequest(
            message=enhanced_message,
            conversation_id=conversation_id,
            user_id=user_id,
            university_name=university_name,
            user_context={
                **context_data,
                "has_files": len(file_info) > 0,
                "file_count": len(file_info),
                "file_info": file_info
            }
        )
        
        # Process with standard RAG pipeline
        local_results = search_local_knowledge(
            enhanced_message, 
            university_name
        )
        
        print(f"🔍 Local search found {len(local_results['results'])} results")
        
        # Search web for real-time information
        web_results = await search_web_realtime(enhanced_message)
        print(f"🌐 Real-time search found {len(web_results['results'])} results")
        
        # Combine and prepare context
        all_sources = []
        context_parts = []
        
        # Add file sources
        if file_info:
            all_sources.append({
                "source": f"Uploaded Files ({len(file_info)} files)",
                "type": "user_files",
                "confidence": 0.9
            })
            context_parts.append(f"User uploaded {len(file_info)} files: {', '.join([f['name'] for f in file_info])}")
        
        # Add local sources
        for result in local_results["results"]:
            all_sources.append({
                "source": result["source"],
                "type": "local_knowledge",
                "confidence": result["relevance"]
            })
            context_parts.append(f"University: {result['source']}\n{json.dumps(result['data'], indent=2)}")
        
        # Add web sources
        for result in web_results["results"]:
            all_sources.append({
                "source": result.get("title", "Web Result"),
                "url": result.get("url", ""),
                "type": "web_search",
                "confidence": 0.7
            })
            context_parts.append(f"Web Result: {result.get('snippet', '')}")
        
        combined_context = "\n\n".join(context_parts)
        
        # Generate response with file context
        final_confidence = max(local_results["confidence"], web_results["confidence"])
        if file_info:
            final_confidence = max(final_confidence, 0.8)  # Boost confidence with files
        
        if groq_client and (final_confidence > 0.3 or combined_context):
            print("🤖 Generating response with Groq LLM (including file context)...")
            response_text = generate_response_with_groq(
                enhanced_message, 
                combined_context, 
                all_sources
            )
        else:
            print("🧠 Generating smart fallback response (with file acknowledgment)...")
            response_text = generate_smart_fallback_response(
                enhanced_message, 
                combined_context, 
                all_sources
            )
        
        # ENHANCED PROFESSIONAL FILE ANALYSIS
        if file_info:
            file_list = ", ".join([f['name'] for f in file_info])
            file_types = set([f['type'].split('/')[0] for f in file_info])
            total_files = len(file_info)

            # Smart file type detection and contextual response
            if 'image' in file_types and any(f['name'].lower().endswith(('.jpg', '.jpeg', '.png')) for f in file_info):
                # Likely certificates, transcripts, or ID documents
                analysis_intro = f"**📄 Academic Document Analysis**\n\nI have analyzed your uploaded image(s): {file_list}. These appear to be academic documents such as certificates, transcripts, or identification materials. I can provide specific guidance based on the visible information."
            elif any('pdf' in f['name'].lower() for f in file_info):
                # PDF documents - likely official university materials
                analysis_intro = f"**📋 Official Document Review**\n\nI have processed the PDF document(s) you uploaded: {file_list}. This appears to contain official university or academic information that I can analyze for admission guidance."
            elif any(word in ' '.join([f['name'] for f in file_info]).lower() for word in ['transcript', 'certificate', 'diploma', 'result', 'grade']):
                # Academic records
                analysis_intro = f"**🎓 Academic Record Analysis**\n\nI have reviewed your academic document(s): {file_list}. I can analyze your grades, subjects, and performance to recommend suitable university programs and provide admission guidance."
            elif 'text' in file_types or any(f['name'].lower().endswith('.txt') for f in file_info):
                # Text files - could be essays, notes, or information
                analysis_intro = f"**📝 Document Analysis**\n\nI have processed your text document(s): {file_list}. I can provide guidance based on the content and help with university admission questions."
            else:
                # Generic file handling
                analysis_intro = f"**📎 File Analysis Complete**\n\nI have successfully processed {total_files} file(s): {file_list}. I can now provide targeted university admission assistance based on the content."

            # Create enhanced professional response
            enhanced_response = f"{analysis_intro}\n\n---\n\n{response_text}\n\n---\n\n**🎯 Specific Recommendations Based on Your Documents:**\n\n"

            # Add smart recommendations based on file content analysis
            if extracted_content:
                content_lower = extracted_content.lower()

                # Check for specific academic content
                if any(word in content_lower for word in ['grade', 'score', 'mark', 'point', 'aggregate']):
                    enhanced_response += "• **Grade Analysis**: I've reviewed your academic performance. Let me recommend programs that match your grade profile.\n"
                if any(word in content_lower for word in ['university', 'college', 'institution']):
                    enhanced_response += "• **University Matching**: Based on your document content, I can suggest specific universities and programs.\n"
                if any(word in content_lower for word in ['subject', 'course', 'program', 'major']):
                    enhanced_response += "• **Program Guidance**: I can help identify suitable programs based on your subject background.\n"
                if any(word in content_lower for word in ['deadline', 'application', 'admission']):
                    enhanced_response += "• **Application Timeline**: I can provide current deadlines and application procedures.\n"

            enhanced_response += "• **Scholarship Opportunities**: Explore funding options that match your academic profile.\n"
            enhanced_response += "• **Career Guidance**: Get insights on job prospects for different programs.\n\n"

            enhanced_response += "**💬 Next Steps:**\n"
            enhanced_response += "• Ask me specific questions about universities or programs\n"
            enhanced_response += "• Request detailed admission requirements\n"
            enhanced_response += "• Inquire about fees, scholarships, or career prospects\n"
            enhanced_response += "• Get help with application procedures\n\n"

            enhanced_response += "What specific aspect of university admissions would you like me to help you with based on your documents?"

            response_text = enhanced_response
        
        # Calculate processing time
        processing_time = (datetime.now() - start_time).total_seconds()
        
        print(f"✅ File response generated in {processing_time:.2f}s with confidence {final_confidence:.2f}")
        
        # Save to MongoDB if available (including user_id)
        if db_client:
            try:
                db = db_client[os.getenv('DB_NAME', 'glinax_chatbot_db')]
                await db.rag_logs.insert_one({
                    "query": message,
                    "response": response_text,
                    "confidence": final_confidence,
                    "sources": all_sources,
                    "processing_time": processing_time,
                    "timestamp": datetime.now(),
                    "conversation_id": conversation_id,
                    "user_id": user_id,
                    "has_files": bool(file_info),
                    "file_info": file_info
                })
            except Exception as e:
                print(f"⚠️ Failed to save file-response to MongoDB: {e}")
        
        return ChatResponse(
            success=True,
            reply=sanitize_markdown_urls(response_text),
            sources=all_sources,
            confidence=final_confidence,
            timestamp=datetime.now().isoformat(),
            processing_time=processing_time,
            model_used="hybrid-rag-with-files"
        )
        
    except Exception as e:
        print(f"❌ File processing error: {e}")
        
        return ChatResponse(
            success=True,
            reply=f"I received your files but had some trouble processing them. However, I can still help with your question: {message}\n\nPlease let me know how I can assist you with Ghanaian university information!",
            sources=[{"source": "File Processing Error", "type": "fallback", "confidence": 0.3}],
            confidence=0.3,
            timestamp=datetime.now().isoformat(),
            model_used="file-error-fallback"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
