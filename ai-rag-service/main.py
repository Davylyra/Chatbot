import hmac
import json
import os
import platform
import re
import urllib.parse
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple
from pathlib import Path

import httpx
import motor.motor_asyncio
import requests
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from groq import AsyncGroq
import asyncio
from pydantic import BaseModel

try:
    from streaming import SSE_HEADERS, format_sse, stream_groq_response
except ImportError:
    from .streaming import SSE_HEADERS, format_sse, stream_groq_response

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


def verify_internal_key(
    x_internal_key: Optional[str] = Header(default=None, alias="X-Internal-Key"),
):
    """Require a shared X-Internal-Key header when INTERNAL_API_KEY is configured.

    Left open when INTERNAL_API_KEY is unset so existing deploys stay safe until
    both Render services have the env var configured.
    """
    expected = os.getenv("INTERNAL_API_KEY", "").strip()
    if not expected:
        return
    if not x_internal_key or not hmac.compare_digest(x_internal_key.strip(), expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing internal API key",
        )


_raw_origins = os.getenv(
    "ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:5000"
)
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization", "x-user-id", "X-Internal-Key"],
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
# KNOWLEDGE BASE & CHUNKED RETRIEVAL (Loaded from data/universities/*.json)
# ============================================================================

from retrieval import (
    ChunkedUniversityRetriever,
    apply_interest_pivot,
    detect_interest_pivot,
    extract_aggregate,
    is_about_app,
    is_small_talk,
    needs_fresh_info,
)

university_kb = ChunkedUniversityRetriever()
GHANA_UNIVERSITIES_KNOWLEDGE = university_kb.universities
print(
    f" Knowledge Base loaded from JSON: {len(university_kb.universities)} universities, "
    f"{len(university_kb.chunks)} chunks indexed"
)


async def initialize_services():
    global embedding_model, groq_client, db_client

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
            except Exception as mongo_error:
                print(f" MongoDB connection failed: {mongo_error}")
                db_client = None
        else:
            print(" MongoDB URI not found - logging to MongoDB disabled")

        print(" Services initialization complete")

    except Exception as e:
        print(f" Critical service initialization error: {e}")
        raise


def build_university_context(uni_name: str, uni_data: Dict[str, Any], query: str = "") -> str:
    """Fallback context formatter when a caller does not already have chunked context."""
    out = university_kb.retrieve(query or uni_name, university_name=uni_name)
    if out.get("context"):
        return out["context"]
    return f"=== {uni_name} ===\nWebsite: {(uni_data or {}).get('website', 'Check official site')}"


def search_local_knowledge(
    query: str,
    university_name: str = None,
    chat_history: List[Dict] = None,
    user_profile: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Chunked BM25 retrieval + question classification + assessment boost + interest pivot."""
    return university_kb.retrieve(
        query=query,
        university_name=university_name,
        chat_history=chat_history,
        user_profile=user_profile,
    )


# ============================================================================
# WEB SEARCH FUNCTIONS (Preserved)
# ============================================================================

OFFICIAL_GHANA_UNI_DOMAINS = (
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
    "ashesi.edu.gh",
)


def _is_google_redirect_url(url: str) -> bool:
    if not url:
        return False
    parsed = urllib.parse.urlparse(url)
    host = (parsed.netloc or "").lower()
    path = (parsed.path or "").lower()
    return (host == "google.com" or host.endswith(".google.com")) and path in ("/url", "/goto")


def extract_real_serpapi_url(organic_result: Dict[str, Any]) -> str:
    """Resolve the real destination URL from a SerpAPI organic result.

    SerpAPI occasionally returns Google redirect links (google.com/goto?... or
    google.com/url?q=...). Unwrap them or fall back to displayed_link so
    official-domain detection and student-facing source links work properly.
    """
    raw_link = str(organic_result.get("link") or "").strip()

    if raw_link and _is_google_redirect_url(raw_link):
        qs = urllib.parse.parse_qs(urllib.parse.urlparse(raw_link).query)
        for param in ("q", "url", "u", "dest"):
            candidates = qs.get(param) or []
            for candidate in candidates:
                candidate = candidate.strip()
                if candidate.startswith(("http://", "https://")) and not _is_google_redirect_url(candidate):
                    return candidate
    elif raw_link:
        return raw_link

    # Fallback: parse displayed_link (e.g. "https://www.ug.edu.gh › admissions" or "ug.edu.gh › apply")
    displayed = str(organic_result.get("displayed_link") or "").strip()
    if displayed:
        head = re.split(r"\s*[›>]\s*|\s+", displayed, maxsplit=1)[0].strip().rstrip(".,;:")
        if head and "." in head:
            if not head.startswith(("http://", "https://")):
                head = "https://" + head
            if not _is_google_redirect_url(head):
                return head

    return raw_link


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
                if any(d in url_domain for d in OFFICIAL_GHANA_UNI_DOMAINS)
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

        # Async client: requests.get() here blocked the whole event loop, so
        # every other in-flight chat request stalled while SerpAPI responded.
        async with httpx.AsyncClient(timeout=15) as http_client:
            response = await http_client.get(url, params=params)
        serpapi_payload = response.json()

        search_results = []
        for organic_result in serpapi_payload.get("organic_results", [])[:5]:
            result_url = extract_real_serpapi_url(organic_result)
            is_official = any(
                domain in result_url.lower() for domain in OFFICIAL_GHANA_UNI_DOMAINS
            )
            search_results.append(
                {
                    "title": organic_result.get("title", ""),
                    "url": result_url,
                    "snippet": organic_result.get("snippet", ""),
                    "source": "official_website" if is_official else "web_search",
                    "priority": "high" if is_official else "medium",
                }
            )

        return {"results": search_results, "confidence": 0.8 if search_results else 0.0}

    except Exception as e:
        print(f" SerpAPI error: {e}")
        return {"results": [], "confidence": 0.0}


# ============================================================================
# RESPONSE GENERATION (Enhanced)
# ============================================================================

# Profile fields worth showing the model, in display order. Each label lists
# every key name the frontend/backend uses for it (they aren't consistent:
# the assessment stores career_goals/preferred_location, older code used
# career_goal/location_preference). Everything else in user_context
# (user_id, timestamps, session_context, UI flags...) is noise and is dropped.
PROFILE_FIELDS = [
    ("Student Name", ("name",)),
    ("SHS Programme", ("shs_program", "shsProgram")),
    ("Subjects Studied", ("subjects",)),
    ("Best Subject", ("bestSubject", "best_subject")),
    ("WASSCE Aggregate/Grade", ("wassce_grade", "wassceGrade")),
    ("Updated Interest (This Chat)", ("updated_interest_in_chat",)),
    ("Interests", ("interests",)),
    ("Career Goal", ("career_goals", "career_goal", "careerGoals")),
    ("Location Preference", ("preferred_location", "location_preference", "preferredLocation")),
    ("Preferred Programme", ("preferred_program",)),
    ("Preferred University", ("preferred_university",)),
    ("Budget / Financial Situation", ("budget", "financial_situation", "financialSituation")),
]


def _profile_value_to_text(value: Any) -> str:
    if value is None or isinstance(value, bool):
        return ""
    if isinstance(value, (list, tuple, set)):
        return ", ".join(str(v) for v in value if v not in (None, ""))
    if isinstance(value, dict):
        return ""  # nested objects are summarised separately or dropped
    return str(value).strip()


def official_website_url(uni_data: Dict[str, Any]) -> str:
    """The university's official website as a full https URL, or "" if unknown."""
    website = str((uni_data or {}).get("website") or "").strip()
    if not website or " " in website:
        return ""
    if not website.startswith(("http://", "https://")):
        website = "https://" + website
    return website


def build_profile_section(user_profile: Optional[Dict[str, Any]]) -> str:
    """Render a short, clean STUDENT PROFILE block for the prompt."""
    if not user_profile:
        return ""

    lines = []
    for label, keys in PROFILE_FIELDS:
        for key in keys:
            text = _profile_value_to_text(user_profile.get(key))
            if text:
                lines.append(f"  - {label}: {text}")
                break

    # Summarise the assessment's pre-computed university matches (top 3)
    # instead of dumping the raw objects into the prompt.
    matches = user_profile.get("university_matches") or []
    match_lines = []
    if isinstance(matches, list):
        for match in matches[:3]:
            if not isinstance(match, dict):
                continue
            uni = match.get("university_name") or match.get("universityName")
            if not uni:
                continue
            programs = match.get("programs_eligible") or [
                p.get("name") for p in match.get("recommended_programs", []) if isinstance(p, dict)
            ]
            programs_text = ", ".join(p for p in programs[:3] if p)
            match_lines.append(f"{uni} ({programs_text})" if programs_text else uni)
    if match_lines:
        lines.append(f"  - Top Matches From Assessment: {'; '.join(match_lines)}")

    if not lines:
        return ""
    return "STUDENT PROFILE:\n" + "\n".join(lines) + "\n\n"


async def generate_response_with_groq(
    query: str,
    context: str,
    sources: List[Dict],
    user_profile: Dict = None,
    chat_history: List[Dict] = None,
    is_coach_mode: bool = False,
) -> str:
    """Generate response using Groq LLM."""
    try:
        if not groq_client:
            return generate_smart_fallback_response(
                query, context, sources, user_profile
            )

        current_year = datetime.now().year

        if is_coach_mode:
            system_prompt = f"""You are Cerkyl in **Career Coach** mode — a warm, thoughtful Socratic career counsellor built specifically for Ghanaian SHS graduates.

**CAREER COACH RULES - STRICTLY FOLLOW:**

1. **SOCRATIC, ONE STEP AT A TIME**: Help the student discover what suits them through a natural conversation. Ask **only ONE** focused follow-up question per reply. Never dump a checklist of questions.
2. **EXPLORE BEFORE RECOMMENDING**: Do not rush to list universities or programmes on the first 1-3 turns unless the student explicitly asks for recommendations right now. Spend the first 3-4 exchanges gently uncovering:
   - Subjects they enjoy and find easy
   - Activities, hobbies, or problems they like solving outside class
   - The kind of work environment, lifestyle, or impact they want
   - Their SHS programme and actual/expected WASSCE aggregate (skip if already in STUDENT PROFILE)
3. **SYNTHESISE WHEN READY**: Once you have a clear picture (typically after 3-4 student replies, or if they ask directly), connect their strengths to **2-3 specific career paths** and matching university degree programmes in Ghana. Explain *why* each fits what they shared, then offer to look up exact cut-off points or universities for whichever path excites them most.
4. **USE ONLY RETRIEVED DATA FOR FACTS**: Only quote specific cut-off points, fees, or deadlines if they appear in the "Retrieved university data" section below. Never invent cut-offs.
5. **KEEP IT SHORT & CONVERSATIONAL**: 2-4 concise sentences reflecting what they just said, followed by your single next question. No filler openings like "Great answer!" or "That's awesome!".
6. **PLAIN MARKDOWN ONLY - NO HTML**: Never output raw HTML tags such as <br>, <table>, <div>, <b>, <li>.

Current year: {current_year}"""
        else:
            system_prompt = f"""You are Cerkyl — a smart, friendly, and knowledgeable AI admission counsellor built specifically for Ghanaian SHS graduates. You have access to detailed information about Ghanaian universities including programs with cut-off points, subject requirements, application deadlines, entrance exam dates, and fees.

**CRITICAL RULES - STRICTLY FOLLOW:**

1. **USE ONLY RETRIEVED DATA**: Only state specific numbers, dates, or requirements if they appear in the "Retrieved university data" section below - that data comes from our own knowledge base, not from the student.
2. **CUT-OFF POINTS**: Provide exact cut-off points from the data. If a range is given (e.g., "10-14"), mention the range.
3. **FIRST CHOICE**: If a program is marked "FIRST CHOICE ONLY", clearly state this.
4. **ENTRANCE EXAMS**: Mention if a program requires an entrance exam.
5. **BE CONVERSATIONAL**: Answer like you're having a friendly conversation. Don't just dump raw data — explain it.
6. **BE HONEST**: If a student's aggregate doesn't meet the cut-off, say so kindly and suggest alternatives.
7. **BE CONCISE**: Answer what was asked. Don't share all information if not requested.
8. **PLAIN MARKDOWN ONLY - NO HTML**: Never output raw HTML tags such as <br>, <table>, <div>, <b>, <li>, etc. This chat renders Markdown, not HTML — for a line break just start a new line, for emphasis use **bold** or *italic*, for lists use "-" or "1.".
9. **OWN YOUR OWN GAPS**: The student is asking YOU for information - they never supplied any of it themselves. If something they asked about isn't in the retrieved data below, say plainly that you don't currently have that specific information, and suggest checking the university's official site. NEVER phrase a gap as "the information you provided/gave doesn't include..." or anything that implies the student was supposed to supply data - that data came from our own retrieval, not from them, and framing it that way is confusing and sounds like you're blaming them for a gap that isn't theirs.
10. **VOUCHER/FORM PURCHASES**: Whenever your answer covers how to apply, or where/how to buy a university's application voucher or serial pin, lead with our own option: tell the student to go to the homepage, select "Buy Forms," choose the university they're applying to, and purchase the voucher/serial pin there to begin their application. Mention the official channels too (bank USSD codes, Ghana Post, the university's own portal) as additional ways to get one - don't omit or hide them, just lead with ours.
11. **ABOUT THIS APP**: Only when asked who built this app, who made it, or about the company behind it, say: this app was built by Glinax and its tech team, an organisation working to improve education through the propagation of STEAM education (Science, Technology, Engineering, Arts, and Mathematics). Glinax has also built Qwikstudi (https://qwikstudi.com), a learning platform where students can upload study documents to generate quizzes and summaries, record lecture sessions, and generate audio versions of uploaded documents. Don't bring this up unless asked.

**CONVERSATIONAL STYLE:**
- Use "you" and "I" naturally
- Open with the answer itself. Don't start with filler such as "Great question!", "Let me check that for you" or "Here's what I found"
- Tailor the answer to the student's profile (programme, grades, interests) when one is given
- Be encouraging and supportive
- End with at most one specific follow-up question, and only when it would genuinely help

Current year: {current_year}"""

        profile_section = build_profile_section(user_profile)

        if is_coach_mode:
            retrieved_block = (
                f"\n\nRetrieved university data (use only if referencing specific Ghanaian programmes/cut-offs):\n{context}"
                if context
                else ""
            )
            user_message = (
                f"{profile_section}Student's message: {query}{retrieved_block}\n\n"
                "Continue the Career Coach conversation naturally, keeping your reply concise and ending with one focused question (unless you are ready to present tailored career/programme options)."
            )
        else:
            user_message = f"""{profile_section}Student's question: {query}

Retrieved university data (from our own knowledge base - the student did not supply this):
{context}

Respond naturally and helpfully like you're having a conversation with a student. Base your answer strictly on the retrieved data above. If it doesn't cover something they asked, say YOU don't currently have that specific information - never imply they were supposed to provide it."""

        messages_array = [{"role": "system", "content": system_prompt}]
        if chat_history:
            history_limit = 10 if is_coach_mode else 5
            recent_history = (
                chat_history[-history_limit:]
                if len(chat_history) > history_limit
                else chat_history
            )
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

    # "Who built this" style questions are answered directly, without going
    # through university search at all - this is about the app, not a university.
    about_app_keywords = ["who built", "who made", "who created", "who developed", "about this app", "about the app", "who are you", "which company made", "developer of this"]
    if any(kw in query_lower for kw in about_app_keywords):
        return (
            "This app was built by **Glinax** and its tech team — an organisation working to improve education "
            "through the propagation of STEAM education (Science, Technology, Engineering, Arts, and Mathematics). "
            "Glinax has also built **Qwikstudi** (https://qwikstudi.com), a learning platform where students can "
            "upload study documents to generate quizzes and summaries, record lecture sessions, and generate audio "
            "versions of uploaded documents.\n\nHappy to help with any Ghanaian university admissions questions too! 😊"
        )

    # Whenever the question is actually about applying, or buying a voucher/
    # serial pin/form, lead with our own Buy Forms option before anything else -
    # official channels (banks, Ghana Post, portals) still come through in the
    # matched university's own admission_requirements data below, this just
    # adds our option ahead of them.
    apply_keywords = ["how do i apply", "how to apply", "application", "voucher", "serial pin", "e-voucher", "buy form", "buy the form", "get the form"]
    buy_forms_tip = ""
    if any(kw in query_lower for kw in apply_keywords):
        buy_forms_tip = (
            "\n\n💡 **To buy your voucher/serial pin:** head to our homepage, select **Buy Forms**, choose the "
            "university you're applying to, and purchase the voucher there to start your application. Banks, "
            "Ghana Post, and the university's own portal are also options if you'd rather use those."
        )

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
            return "Here's what I found based on your question:\n\n" + "\n\n---\n\n".join(response_parts) + buy_forms_tip
    
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
""" + buy_forms_tip


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


@app.post("/respond", response_model=ChatResponse, dependencies=[Depends(verify_internal_key)])
async def respond_to_query(request: ChatRequest):
    start_time = datetime.now()

    try:
        is_coach_mode = bool(
            isinstance(request.user_context, dict)
            and request.user_context.get("is_coach_mode")
        )
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
                "is_coach_mode",
                "coach_opening",
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

        print(f"📥 Processing query (coach={is_coach_mode}): {user_message[:100]}...")

        # Greetings/thanks need neither retrieval nor a web search.
        small_talk = (not is_coach_mode) and is_small_talk(user_message)
        if small_talk:
            local_matches = {"results": [], "confidence": 0.0, "context": "", "use_web_search": False}
        else:
            local_matches = search_local_knowledge(
                user_message, request.university_name, request.chat_history, user_profile
            )
            if isinstance(local_matches.get("effective_profile"), dict):
                user_profile = local_matches["effective_profile"]
        print(
            f"🔍 Local search found {len(local_matches['results'])} results "
            f"(class={local_matches.get('question_class', 'general')}, confidence={local_matches.get('confidence', 0.0):.2f})"
        )

        source_documents: List[Dict[str, Any]] = []
        context_segments: List[str] = []

        for search_result in local_matches.get("results", []):
            source_documents.append(
                {
                    "source": search_result.get("source"),
                    "type": "local_knowledge",
                    "confidence": search_result.get("relevance", 0.0),
                    # Shown to students as the official website link under the answer.
                    "url": official_website_url(search_result.get("data", {})),
                }
            )

        if local_matches.get("context"):
            context_segments.append(local_matches["context"])

        # Web search only when local data isn't a confident match, or the
        # question is time-sensitive (deadlines, lists, news).
        # In Career Coach mode, skip web search unless the student asks for
        # time-sensitive info so coaching turns stay fast and conversational.
        if is_coach_mode:
            use_web_search = needs_fresh_info(user_message)
        elif "use_web_search" in local_matches:
            use_web_search = bool(local_matches["use_web_search"])
        else:
            use_web_search = not small_talk and (
                local_matches.get("confidence", 0.0) < 0.95 or needs_fresh_info(user_message)
            )

        if not use_web_search:
            print("⚡ Fast Path: Skipping web search (coach mode, small talk, or confident local match)")
            combined_context = "\n\n".join(context_segments)
            combined_context = combined_context[:12000]  # sized to stay under the Groq account's 8000 TPM rate limit even with multiple matched universities, while still far fuller than the original 8000-char cap
            final_confidence = local_matches.get("confidence", 0.8)
            if groq_client and (is_coach_mode or small_talk or final_confidence > 0.3 or combined_context):
                response_text = await generate_response_with_groq(
                    user_message,
                    combined_context,
                    source_documents,
                    user_profile,
                    request.chat_history,
                    is_coach_mode=is_coach_mode,
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

            if groq_client and (is_coach_mode or final_confidence > 0.3 or combined_context):
                response_text = await generate_response_with_groq(
                    user_message,
                    combined_context,
                    source_documents,
                    user_profile,
                    request.chat_history,
                    is_coach_mode=is_coach_mode,
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


@app.post("/respond-with-files", response_model=ChatResponse, dependencies=[Depends(verify_internal_key)])
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

        num_matches_files = len(local_results.get("results", [])) or 1
        per_university_cap_files = max(3000, 12000 // num_matches_files)

        for result in local_results["results"]:
            all_sources.append(
                {
                    "source": result["source"],
                    "type": "local_knowledge",
                    "confidence": result["relevance"],
                }
            )
            uni_context_f = build_university_context(result["source"], result["data"], message)
            context_parts.append(uni_context_f[:per_university_cap_files])

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


@app.post("/respond-stream", dependencies=[Depends(verify_internal_key)])
async def respond_to_query_stream(request: ChatRequest):
    start_time = datetime.now()
    user_profile: Dict[str, Any] = {}

    async def event_generator():
        try:
            is_coach_mode = bool(
                isinstance(request.user_context, dict)
                and request.user_context.get("is_coach_mode")
            )
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
                    "is_coach_mode",
                    "coach_opening",
                }
                for k, v in request.user_context.items():
                    if k not in skip_keys and v:
                        user_profile.setdefault(k, v)

            user_message = (request.message or "").strip()
            if not user_message:
                empty_msg = "I need a question or message to help you."
                yield format_sse("meta", {"sources": [], "confidence": 0.0})
                yield format_sse("delta", {"text": empty_msg})
                yield format_sse(
                    "done",
                    {
                        "reply": empty_msg,
                        "sources": [],
                        "confidence": 0.0,
                        "processing_time": 0.0,
                        "timestamp": datetime.now().isoformat(),
                    },
                )
                return

            print(
                f"📥 [STREAM] Processing query (coach={is_coach_mode}): {user_message[:100]}..."
            )

            small_talk = (not is_coach_mode) and is_small_talk(user_message)
            if small_talk:
                local_matches = {"results": [], "confidence": 0.0, "context": "", "use_web_search": False}
            else:
                local_matches = search_local_knowledge(
                    user_message, request.university_name, request.chat_history, user_profile
                )
                if isinstance(local_matches.get("effective_profile"), dict):
                    user_profile = local_matches["effective_profile"]

            source_documents: List[Dict[str, Any]] = []
            context_segments: List[str] = []

            for search_result in local_matches.get("results", []):
                source_documents.append(
                    {
                        "source": search_result.get("source"),
                        "type": "local_knowledge",
                        "confidence": search_result.get("relevance", 0.0),
                        "url": official_website_url(search_result.get("data", {})),
                    }
                )

            if local_matches.get("context"):
                context_segments.append(local_matches["context"])

            if is_coach_mode:
                use_web_search = needs_fresh_info(user_message)
            elif "use_web_search" in local_matches:
                use_web_search = bool(local_matches["use_web_search"])
            else:
                use_web_search = not small_talk and (
                    local_matches.get("confidence", 0.0) < 0.95
                    or needs_fresh_info(user_message)
                )

            if not use_web_search:
                combined_context = "\n\n".join(context_segments)[:12000]
                final_confidence = local_matches.get("confidence", 0.8)
                can_use_groq = bool(
                    groq_client
                    and (
                        is_coach_mode
                        or small_talk
                        or final_confidence > 0.3
                        or combined_context
                    )
                )
            else:
                web_matches = await search_web_realtime(user_message)
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

                combined_context = "\n\n".join(context_segments)[:12000]
                final_confidence = max(
                    local_matches.get("confidence", 0.0),
                    web_matches.get("confidence", 0.0),
                )
                can_use_groq = bool(
                    groq_client
                    and (is_coach_mode or final_confidence > 0.3 or combined_context)
                )

            async def log_rag_completion(reply_text: str, processing_time: float):
                print(
                    f"✅ [STREAM] Response generated in {processing_time:.2f}s with confidence {final_confidence:.2f}"
                )
                if db_client:
                    try:
                        db = db_client[os.getenv("DB_NAME", "glinax_chatbot_db")]
                        await db.rag_logs.insert_one(
                            {
                                "query": request.message,
                                "response": reply_text,
                                "confidence": final_confidence,
                                "sources": source_documents,
                                "processing_time": processing_time,
                                "timestamp": datetime.now(),
                                "conversation_id": request.conversation_id,
                                "user_id": request.user_id,
                            }
                        )
                    except Exception as db_exc:
                        print(f" Failed to save stream log to MongoDB: {db_exc}")

            async for frame in stream_groq_response(
                groq_client=groq_client,
                query=user_message,
                context=combined_context,
                sources=source_documents,
                confidence=final_confidence,
                user_profile=user_profile,
                chat_history=request.chat_history,
                is_coach_mode=is_coach_mode,
                use_groq=can_use_groq,
                model=GROQ_MODEL,
                temperature=GROQ_TEMPERATURE,
                reasoning_effort=GROQ_REASONING_EFFORT,
                build_profile_section_fn=build_profile_section,
                fallback_fn=lambda: generate_smart_fallback_response(
                    user_message, combined_context, source_documents, user_profile
                ),
                sanitize_fn=sanitize_markdown_urls,
                start_time=start_time,
                on_complete=log_rag_completion,
            ):
                yield frame

        except Exception as e:
            print(f" [STREAM] RAG processing error: {e}")
            try:
                fallback_response = sanitize_markdown_urls(
                    generate_smart_fallback_response(
                        request.message, "", [], user_profile
                    )
                )
                fallback_sources = [
                    {
                        "source": "Local Knowledge Base",
                        "type": "fallback",
                        "confidence": 0.5,
                    }
                ]
                yield format_sse(
                    "meta", {"sources": fallback_sources, "confidence": 0.5}
                )
                yield format_sse("delta", {"text": fallback_response})
                yield format_sse(
                    "done",
                    {
                        "reply": fallback_response,
                        "sources": fallback_sources,
                        "confidence": 0.5,
                        "processing_time": (datetime.now() - start_time).total_seconds(),
                        "timestamp": datetime.now().isoformat(),
                    },
                )
            except Exception as fallback_error:
                print(f" [STREAM] Even fallback failed: {fallback_error}")
                yield format_sse(
                    "error",
                    {
                        "error": "AI_UNAVAILABLE",
                        "retryable": True,
                        "message": "I apologize, but I'm having technical difficulties. Please try again.",
                    },
                )

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
