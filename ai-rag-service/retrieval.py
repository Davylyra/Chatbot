"""Lightweight pure-Python chunked retrieval, query classification, assessment
boost, and mid-chat interest pivot for the Glinax / Cerkyl AI service.

Designed for Render free-tier RAM and cold-start limits: uses only the Python
standard library (Okapi BM25 + entity/alias scoring + cut-off filtering), with
zero heavy ML dependencies.
"""

from __future__ import annotations

import json
import math
import os
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple


# ============================================================================
# CONSTANTS & DOMAIN VOCABULARY
# ============================================================================

DEFAULT_DATA_DIR = Path(__file__).resolve().parent / "data" / "universities"

# Fallback alias table (merged with `aliases` inside each university JSON file)
UNI_NAME_VARIATIONS: Dict[str, str] = {
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
    "gtuc": "Ghana Communication Technology University",
    # UEW
    "uew": "University of Education, Winneba",
    "winneba": "University of Education, Winneba",
    "university of education": "University of Education, Winneba",
    # UMaT
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
    # Ashesi & others
    "ashesi": "Ashesi University",
    "ashesi university": "Ashesi University",
    "berekuso": "Ashesi University",
}

_STOPWORDS: Set[str] = {
    "the", "a", "an", "and", "or", "but", "for", "on", "at", "to", "in", "of",
    "with", "by", "from", "be", "is", "are", "was", "were", "am", "been",
    "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "should", "could", "can", "may", "might", "must", "shall", "that", "this",
    "these", "those", "it", "its", "i", "me", "my", "we", "our", "you", "your",
    "they", "their", "them", "he", "she", "his", "her", "what", "which", "who",
    "whom", "where", "when", "why", "how", "about", "into", "through", "during",
    "before", "after", "above", "below", "between", "under", "again", "further",
    "then", "once", "here", "there", "all", "any", "both", "each", "few",
    "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own",
    "same", "so", "than", "too", "very", "just", "please", "tell", "give",
    "know", "want", "need", "get", "got", "like", "also", "still", "much",
    "many", "really", "actually", "now",
}

# Lightweight domain synonym expansion for Ghanaian university admissions
_SYNONYMS: Dict[str, List[str]] = {
    "cs": ["computer", "science"],
    "it": ["information", "technology"],
    "ict": ["information", "technology", "computer"],
    "med": ["medicine", "mbchb"],
    "doctor": ["medicine", "mbchb", "medical"],
    "mbchb": ["medicine", "medical"],
    "dentist": ["dentistry", "dental", "bds"],
    "nurse": ["nursing", "midwifery"],
    "midwife": ["midwifery", "nursing"],
    "pharm": ["pharmacy", "pharmd"],
    "pharmacist": ["pharmacy", "pharmd"],
    "lawyer": ["law", "llb"],
    "llb": ["law"],
    "eng": ["engineering"],
    "arch": ["architecture"],
    "biz": ["business", "administration"],
    "acct": ["accounting", "finance"],
    "accountant": ["accounting", "finance"],
    "banker": ["banking", "finance"],
    "econ": ["economics"],
    "agri": ["agriculture", "agribusiness"],
    "agric": ["agriculture", "agribusiness"],
    "teacher": ["education", "bed", "teaching"],
    "teaching": ["education", "bed"],
    "tuition": ["fees", "cost"],
    "cost": ["fees", "tuition"],
    "price": ["fees", "cost"],
    "voucher": ["apply", "application", "portal", "admission"],
    "pin": ["voucher", "apply", "application", "admission"],
    "form": ["voucher", "apply", "application", "admission"],
    "forms": ["voucher", "apply", "application", "admission"],
    "apply": ["application", "admission", "portal", "voucher"],
    "cutoff": ["cutoff", "aggregate"],
    "cutoffs": ["cutoff", "aggregate"],
    "grade": ["aggregate", "wassce", "cutoff"],
    "grades": ["aggregate", "wassce", "cutoff"],
    "coding": ["computer", "software", "information", "technology"],
    "programming": ["computer", "software", "information", "technology"],
    "software": ["computer", "engineering", "information", "technology"],
    "mining": ["mines", "mining", "geological", "minerals"],
}


# ============================================================================
# QUERY UNDERSTANDING HELPERS
# ============================================================================

_AGGREGATE_PATTERNS = [
    re.compile(r"\baggregates?\s*(?:of|is|was|=|:)?\s*(\d{1,2})\b"),
    re.compile(r"\b(\d{1,2})\s*aggregate\b"),
    re.compile(r"\bi\s+(?:got|scored|obtained|had|made)\s+(?:an?\s+)?(?:aggregate\s+(?:of\s+)?)?(\d{1,2})\b"),
    re.compile(r"\bmy\s+(?:wassce\s+)?(?:aggregate|grade|score|result|wassce)\s*(?:is|was|=|:)?\s*(\d{1,2})\b"),
    re.compile(r"\bwith\s+(?:an?\s+)?(?:aggregate\s+(?:of\s+)?)?(\d{1,2})\b"),
]


def extract_aggregate(text: str) -> Optional[int]:
    """Return the WASSCE aggregate (6-36) mentioned in the text, if any."""
    text_lower = (text or "").lower()
    for pattern in _AGGREGATE_PATTERNS:
        match = pattern.search(text_lower)
        if match:
            value = int(match.group(1))
            if 6 <= value <= 36:
                return value
    return None


_SMALL_TALK_WORDS = {
    "hi", "hello", "hey", "hiya", "yo", "sup", "good", "morning", "afternoon",
    "evening", "day", "thanks", "thank", "you", "u", "ok", "okay", "cool",
    "nice", "great", "bye", "goodbye", "see", "later", "how", "are", "doing",
    "there", "cerkyl", "bot", "so", "much", "a", "lot", "again", "all",
    "everyone", "sir", "madam", "very", "noted", "alright", "cheers",
    "welcome", "please", "bro", "charley", "chale",
}


def is_small_talk(message: str) -> bool:
    """True for greetings/thanks that need no retrieval or web search."""
    words = re.findall(r"[a-z']+", (message or "").lower())
    return 0 < len(words) <= 6 and all(w in _SMALL_TALK_WORDS for w in words)


_ABOUT_APP_PATTERNS = [
    re.compile(r"\bwho\s+(?:built|made|created|developed|owns|designed)\s+(?:this|the|you|cerkyl|glinax)\b"),
    re.compile(r"\babout\s+(?:this|the)\s+app\b"),
    re.compile(r"\bwho\s+are\s+you\b"),
    re.compile(r"\bwhat\s+is\s+(?:this\s+app|cerkyl|glinax|qwikstudi)\b"),
    re.compile(r"\bwhich\s+company\s+(?:made|built|created|owns)\b"),
    re.compile(r"\bdeveloper(?:s)?\s+of\s+this\b"),
    re.compile(r"\btell\s+me\s+about\s+(?:glinax|cerkyl|yourself)\b"),
]


def is_about_app(message: str) -> bool:
    text = (message or "").lower().strip()
    return any(p.search(text) for p in _ABOUT_APP_PATTERNS)


_FRESH_INFO_PATTERN = re.compile(
    r"\b(deadline|deadlines|closing date|latest|news|current(ly)?|this year|today|"
    r"admission list|released?|announce(d|ment)?|when (does|do|will|is|are)|"
    r"still (open|selling)|20\d\d)\b"
)


def needs_fresh_info(message: str) -> bool:
    return bool(_FRESH_INFO_PATTERN.search((message or "").lower()))


_COMPARISON_PATTERN = re.compile(
    r"\b(compare|comparison|versus|vs\.?|better\s+than|difference\s+between|"
    r"which\s+is\s+better|between\s+.+\s+and\s+|or\s+which\s+one)\b"
)

_CAREER_ADVICE_PATTERN = re.compile(
    r"\b(career|careers|job\s+prospects?|what\s+(?:course|programme|program|degree)\s+(?:should|can)\s+i\s+(?:study|do|choose|pick)|"
    r"which\s+(?:course|programme|program|degree)\s+(?:suits?|fits?|is\s+best)|"
    r"become\s+an?\s+|want\s+to\s+be\s+an?\s+|future\s+job|what\s+can\s+i\s+become|"
    r"best\s+(?:courses?|programmes?|programs?)\s+for\s+|i\s+(?:love|enjoy|like)\s+.+\s+what\s+(?:should|can)\s+i)\b"
)


# ============================================================================
# MID-CHAT INTEREST PIVOT DETECTION
# ============================================================================

_PIVOT_PATTERNS = [
    # "instead of engineering, I want to study law"
    re.compile(
        r"\binstead\s+of\s+(?P<prev>[a-z][a-z\s&/-]{1,35}?)[,\s]+(?:i\s+)?(?:now\s+)?(?:want|prefer|would\s+rather|would\s+like|plan|hope|think|am\s+thinking)(?:\s+to)?\s+(?:study|do|pursue|take|go\s+into|switch\s+to)?\s*(?P<new>[a-z][a-z\s&/-]{1,40})",
        re.IGNORECASE,
    ),
    # "forget medicine, I want to do nursing"
    re.compile(
        r"\b(?:forget|drop|skip|scratch)\s+(?P<prev>[a-z][a-z\s&/-]{1,30}?)[,;\s]+(?:i\s+)?(?:now\s+)?(?:want|prefer|would\s+rather|will\s+do|am\s+doing)\s+(?:to\s+)?(?:study|do|pursue|take)?\s*(?P<new>[a-z][a-z\s&/-]{1,40})",
        re.IGNORECASE,
    ),
    # "I changed my mind, I want to study law" / "changed my mind to nursing"
    re.compile(
        r"\bchanged\s+my\s+mind(?:[,;\s]+(?:i\s+)?(?:now\s+)?(?:want|prefer|would\s+like|am\s+going)\s+(?:to\s+)?(?:study|do|pursue|take)?|\s+to)\s+(?P<new>[a-z][a-z\s&/-]{1,40})",
        re.IGNORECASE,
    ),
    # "I now want to study law" / "actually I now want to do nursing" / "actually I prefer architecture"
    re.compile(
        r"\b(?:i\s+now|now\s+i|actually[,]?\s+i(?:\s+now)?|on\s+second\s+thought[,]?\s+i(?:\s+now)?|i(?:'d|\s+would)\s+rather|i\s+now\s+prefer|i\s+prefer)\s+(?:want\s+to\s+|would\s+like\s+to\s+|like\s+to\s+|to\s+)?(?:study|do|pursue|take|go\s+into|switch\s+to)?\s*(?P<new>[a-z][a-z\s&/-]{1,40})",
        re.IGNORECASE,
    ),
    # "switching my interest to pharmacy" / "switch to computer science"
    re.compile(
        r"\b(?:switch(?:ing)?|pivot(?:ing)?|chang(?:e|ing))\s+(?:my\s+)?(?:interest|focus|course|programme|program|major|mind)\s+(?:from\s+(?P<prev>[a-z][a-z\s&/-]{1,30}?)\s+)?to\s+(?P<new>[a-z][a-z\s&/-]{1,40})",
        re.IGNORECASE,
    ),
    # "I want to do nursing instead" / "I want to study law now"
    re.compile(
        r"\bi\s+(?:want|would\s+like|prefer|am\s+thinking)\s+(?:to\s+|of\s+)?(?:study|studying|do|doing|pursue|pursuing)\s+(?P<new>[a-z][a-z\s&/-]{1,40}?)\s+(?:instead|now)\b",
        re.IGNORECASE,
    ),
]

_PIVOT_TRIM_TAILS = re.compile(
    r"\b(instead|now|please|in\s+ghana|at\s+[a-z]+|what\s+.*|which\s+.*|where\s+.*|can\s+i.*|do\s+you.*|tell\s+me.*|so\s+.*)$",
    re.IGNORECASE,
)


def _clean_interest_phrase(raw: str) -> str:
    text = re.split(r"[.?!;\n]", raw or "")[0].strip(" ,:-")
    text = _PIVOT_TRIM_TAILS.sub("", text).strip(" ,:-")
    # Drop leading articles / filler verbs
    text = re.sub(r"^(?:a|an|the|to|study|studying|do|doing|pursue|pursuing|be|become|a\s+career\s+in)\s+", "", text, flags=re.IGNORECASE).strip()
    # Keep concise (max 5 words)
    words = text.split()
    if len(words) > 5:
        text = " ".join(words[:5])
    return text.strip()


def _extract_pivot_from_text(text: str) -> Optional[Dict[str, Any]]:
    if not text:
        return None
    for pattern in _PIVOT_PATTERNS:
        match = pattern.search(text)
        if match:
            new_interest = _clean_interest_phrase(match.group("new"))
            prev_interest = (
                _clean_interest_phrase(match.group("prev"))
                if "prev" in pattern.groupindex and match.group("prev")
                else None
            )
            if new_interest and len(new_interest) >= 2 and new_interest.lower() not in _STOPWORDS:
                return {
                    "interest": new_interest,
                    "previous_interest": prev_interest or None,
                    "source_message": text.strip()[:200],
                }
    return None


def detect_interest_pivot(
    query: str,
    chat_history: Optional[List[Dict[str, str]]] = None,
) -> Optional[Dict[str, Any]]:
    """Detect mid-chat interest updates in the current message or recent user history."""
    current_pivot = _extract_pivot_from_text(query)
    if current_pivot:
        return current_pivot

    if chat_history:
        for msg in reversed(chat_history[-8:]):
            if not isinstance(msg, dict):
                continue
            role = (msg.get("role") or "").lower()
            if role and role != "user":
                continue
            hist_pivot = _extract_pivot_from_text(msg.get("content") or "")
            if hist_pivot:
                return hist_pivot

    return None


def apply_interest_pivot(
    user_profile: Optional[Dict[str, Any]],
    pivot: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """Return an updated copy of user_profile reflecting a mid-chat interest pivot."""
    updated = dict(user_profile) if isinstance(user_profile, dict) else {}
    if not pivot or not pivot.get("interest"):
        return updated

    new_interest = pivot["interest"]
    updated["updated_interest_in_chat"] = new_interest
    if pivot.get("previous_interest"):
        updated["previous_interest_in_chat"] = pivot["previous_interest"]

    # Update preferred_program, career_goals, and prepend to interests so prompt & retrieval prioritize it
    updated["preferred_program"] = new_interest
    updated["career_goals"] = new_interest
    existing_interests = updated.get("interests")
    if isinstance(existing_interests, list):
        filtered = [x for x in existing_interests if str(x).lower() != new_interest.lower()]
        updated["interests"] = [new_interest] + filtered
    elif isinstance(existing_interests, str) and existing_interests.strip():
        if new_interest.lower() not in existing_interests.lower():
            updated["interests"] = f"{new_interest} (updated from: {existing_interests})"
    else:
        updated["interests"] = [new_interest]

    return updated


# ============================================================================
# TOKENIZATION & CUT-OFF PARSING
# ============================================================================

def tokenize(text: str, expand_synonyms: bool = False) -> List[str]:
    """Lightweight lowercase tokenizer with basic plural normalization."""
    if not text:
        return []
    raw_tokens = re.findall(r"[a-z0-9]+", text.lower())
    tokens: List[str] = []
    for tok in raw_tokens:
        if len(tok) < 2 and not tok.isdigit():
            continue
        if tok in _STOPWORDS:
            continue
        # Simple plural normalization for longer words
        norm = tok[:-1] if len(tok) > 4 and tok.endswith("s") and not tok.endswith("ss") else tok
        tokens.append(norm)
        if expand_synonyms:
            for syn in _SYNONYMS.get(tok, _SYNONYMS.get(norm, [])):
                tokens.append(syn)
    return tokens


def parse_cutoff_range(cutoff_str: Any) -> Tuple[Optional[int], Optional[int]]:
    """Parse cut-off strings like '6', '10-14', '6–10' into (min, max)."""
    if not cutoff_str:
        return None, None
    s = str(cutoff_str).strip()
    m_range = re.search(r"(\d{1,2})\s*[-–]\s*(\d{1,2})", s)
    if m_range:
        lo, hi = int(m_range.group(1)), int(m_range.group(2))
        if 6 <= lo <= 36 and 6 <= hi <= 36:
            return min(lo, hi), max(lo, hi)
    m_single = re.search(r"\b(\d{1,2})\b", s)
    if m_single:
        val = int(m_single.group(1))
        if 6 <= val <= 36:
            return val, val
    return None, None


# ============================================================================
# UNIVERSITY JSON LOADER
# ============================================================================

def load_universities_from_json(
    data_dir: Optional[Path] = None,
) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, str], Dict[str, str]]:
    """Load all university JSON files from `data/universities/`.

    Returns:
        universities: {canonical_name: university_data_dict}
        aliases: {lowercase_alias: canonical_name}
        slugs: {canonical_name: slug}
    """
    env_dir = os.getenv("UNIVERSITIES_DATA_DIR")
    target_dir = Path(data_dir) if data_dir else (Path(env_dir) if env_dir else DEFAULT_DATA_DIR)

    universities: Dict[str, Dict[str, Any]] = {}
    aliases: Dict[str, str] = dict(UNI_NAME_VARIATIONS)
    slugs: Dict[str, str] = {}

    if not target_dir.exists():
        print(f"⚠️ Universities data directory not found: {target_dir}")
        return universities, aliases, slugs

    for json_file in sorted(target_dir.glob("*.json")):
        try:
            doc = json.loads(json_file.read_text(encoding="utf-8"))
        except Exception as exc:
            print(f"⚠️ Failed to parse {json_file.name}: {exc}")
            continue

        uni_name = doc.get("name")
        if not uni_name:
            continue

        slug = doc.get("slug") or json_file.stem
        slugs[uni_name] = slug

        body = {k: v for k, v in doc.items() if k not in ("slug", "name", "aliases")}
        universities[uni_name] = body

        # Register canonical name, slug, and all declared aliases
        aliases[uni_name.lower()] = uni_name
        aliases[slug.lower()] = uni_name
        for alias in doc.get("aliases", []):
            if isinstance(alias, str) and alias.strip():
                aliases[alias.strip().lower()] = uni_name

    return universities, aliases, slugs


# ============================================================================
# CHUNK MODEL & CHUNKED BM25 RETRIEVER
# ============================================================================

@dataclass
class Chunk:
    chunk_id: str
    university: str
    slug: str
    section: str  # overview | admission | fees | scholarships | contact | program
    title: str
    text: str
    college: str = ""
    program_name: str = ""
    cutoff_raw: str = ""
    cutoff_min: Optional[int] = None
    cutoff_max: Optional[int] = None
    duration: str = ""
    first_choice: str = ""
    entrance_exam: str = ""
    tokens: List[str] = field(default_factory=list)
    token_counts: Counter = field(default_factory=Counter)


class ChunkedUniversityRetriever:
    """Pure-Python chunked BM25 + entity/alias + cut-off + profile retriever."""

    def __init__(self, data_dir: Optional[Path] = None):
        self.universities, self.name_variations, self.slugs = load_universities_from_json(data_dir)
        self.chunks: List[Chunk] = []
        self.uni_chunks: Dict[str, List[Chunk]] = defaultdict(list)
        self.program_index: Dict[str, List[Tuple[str, Any]]] = defaultdict(list)
        self.keyword_index: Dict[str, Set[str]] = defaultdict(set)
        self.cutoff_index: Dict[int, List[Tuple[str, str, str]]] = defaultdict(list)

        # BM25 statistics
        self._doc_freq: Counter = Counter()
        self._avg_doc_len: float = 1.0
        self._k1: float = 1.5
        self._b: float = 0.75

        # Precompiled regexes for university alias detection (longest first)
        self._alias_patterns: List[Tuple[re.Pattern, str, str]] = [
            (re.compile(r"\b" + re.escape(alias) + r"\b"), alias, uni_name)
            for alias, uni_name in sorted(
                self.name_variations.items(), key=lambda kv: len(kv[0]), reverse=True
            )
            if uni_name in self.universities
        ]

        self._build_chunks_and_indexes()

    def _add_chunk(self, chunk: Chunk) -> None:
        chunk.tokens = tokenize(f"{chunk.university} {chunk.title} {chunk.college} {chunk.text}")
        chunk.token_counts = Counter(chunk.tokens)
        self.chunks.append(chunk)
        self.uni_chunks[chunk.university].append(chunk)
        for tok in chunk.token_counts:
            self._doc_freq[tok] += 1
            self.keyword_index[tok].add(chunk.university)

    def _build_chunks_and_indexes(self) -> None:
        current_year = datetime.now().year
        chunk_counter = 0

        for uni_name, data in self.universities.items():
            slug = self.slugs.get(uni_name, uni_name.lower().replace(" ", "-"))
            colleges = data.get("colleges", {})
            programs = data.get("programs", {})
            admission = data.get("admission_requirements", {})
            fees = data.get("fees", {})
            scholarships = data.get("scholarships", {})
            contact = data.get("contact", {})

            prog_count = len(programs) + sum(
                len(c.get("programs", [])) for c in colleges.values() if isinstance(c, dict)
            )
            college_names = list(colleges.keys()) if colleges else list(programs.keys())[:8]

            # 1. Overview chunk
            chunk_counter += 1
            overview_lines = [
                f"# {uni_name} — Overview",
                f"- **Location:** {data.get('location', 'Ghana')}",
                f"- **Established:** {data.get('established', 'N/A')}",
                f"- **Type:** {data.get('type', 'Public')}",
                f"- **Website:** {data.get('website', 'N/A')}",
            ]
            if data.get("also_known_as"):
                overview_lines.append(f"- **Also Known As:** {data['also_known_as']}")
            overview_lines.append(f"- **Indexed Programmes:** {prog_count}")
            if college_names:
                label = "Colleges/Faculties" if colleges else "Key Programmes"
                overview_lines.append(f"- **{label}:** {', '.join(college_names)}")
            self._add_chunk(Chunk(
                chunk_id=f"{slug}-overview-{chunk_counter}",
                university=uni_name,
                slug=slug,
                section="overview",
                title=f"{uni_name} Overview",
                text="\n".join(overview_lines),
            ))

            # 2. Admission requirements & deadlines chunk
            if admission:
                chunk_counter += 1
                adm_lines = [f"## {uni_name} — Admission Requirements, Deadlines & How to Apply"]
                for key, val in admission.items():
                    if val:
                        adm_lines.append(f"- **{key.replace('_', ' ').title()}:** {val}")
                self._add_chunk(Chunk(
                    chunk_id=f"{slug}-admission-{chunk_counter}",
                    university=uni_name,
                    slug=slug,
                    section="admission",
                    title=f"{uni_name} Admission Requirements & Application Process",
                    text="\n".join(adm_lines),
                ))

            # 3. Fees chunk
            if fees:
                chunk_counter += 1
                fee_lines = [f"## {uni_name} — Fees ({current_year})"]
                gh_fees = fees.get("ghanaian_students", {})
                if isinstance(gh_fees, dict):
                    for cat, amt in gh_fees.items():
                        fee_lines.append(f"- {cat}: {amt}")
                levies = fees.get("mandatory_levies", {})
                if isinstance(levies, dict) and levies:
                    fee_lines.append("- **Mandatory Levies:**")
                    for levy, amt in levies.items():
                        fee_lines.append(f"  - {levy}: {amt}")
                for key, val in fees.items():
                    if key not in ("ghanaian_students", "mandatory_levies") and val:
                        fee_lines.append(f"- **{key.replace('_', ' ').title()}:** {val}")
                self._add_chunk(Chunk(
                    chunk_id=f"{slug}-fees-{chunk_counter}",
                    university=uni_name,
                    slug=slug,
                    section="fees",
                    title=f"{uni_name} Tuition & Residential Fees",
                    text="\n".join(fee_lines),
                ))

            # 4. Scholarships & Contact chunk
            if scholarships or contact:
                chunk_counter += 1
                sc_lines = [f"## {uni_name} — Scholarships & Contact"]
                if scholarships:
                    sc_lines.append("**Scholarships:**")
                    for key, val in scholarships.items():
                        if val:
                            sc_lines.append(f"- {key.replace('_', ' ').title()}: {val}")
                if contact:
                    sc_lines.append("**Contact:**")
                    for key, val in contact.items():
                        if val:
                            sc_lines.append(f"- {key.replace('_', ' ').title()}: {val}")
                self._add_chunk(Chunk(
                    chunk_id=f"{slug}-scholarships-contact-{chunk_counter}",
                    university=uni_name,
                    slug=slug,
                    section="scholarships",
                    title=f"{uni_name} Scholarships & Contact Information",
                    text="\n".join(sc_lines),
                ))

            # 5. Programme chunks (hierarchical `colleges` structure)
            if isinstance(colleges, dict):
                for college_name, college_data in colleges.items():
                    if not isinstance(college_data, dict):
                        continue
                    college_reqs = college_data.get("requirements", "")
                    college_cutoff = college_data.get("cutoff_range", "")
                    for prog in college_data.get("programs", []):
                        if not isinstance(prog, dict):
                            continue
                        prog_name = prog.get("name", "").strip()
                        if not prog_name:
                            continue

                        self.program_index[prog_name].append((uni_name, prog))
                        cutoff_raw = str(prog.get("cutoff") or "")
                        c_min, c_max = parse_cutoff_range(cutoff_raw)
                        if c_min is not None and c_max is not None:
                            for agg_val in range(c_min, c_max + 1):
                                self.cutoff_index[agg_val].append((uni_name, prog_name, cutoff_raw))

                        chunk_counter += 1
                        lines = [f"### {prog_name} — {uni_name} ({college_name})"]
                        if prog.get("school"):
                            lines.append(f"- **School/Faculty:** {prog['school']}")
                        if cutoff_raw:
                            lines.append(f"- **Cut-off Point:** {cutoff_raw}")
                        elif college_cutoff:
                            lines.append(f"- **College Cut-off Range:** {college_cutoff}")
                        if prog.get("duration"):
                            lines.append(f"- **Duration:** {prog['duration']}")
                        if prog.get("campuses"):
                            lines.append(f"- **Campus:** {prog['campuses']}")
                        if prog.get("options"):
                            lines.append(f"- **Options:** {prog['options']}")
                        if prog.get("requirements"):
                            lines.append(f"- **Programme Requirements:** {prog['requirements']}")
                        if college_reqs:
                            lines.append(f"- **College Core/General Requirements:** {college_reqs}")
                        if prog.get("career_prospects"):
                            lines.append(f"- **Career Prospects:** {prog['career_prospects']}")
                        if str(prog.get("first_choice", "")).lower() == "yes":
                            lines.append("- **Important:** FIRST CHOICE ONLY")
                        if str(prog.get("entrance_exam", "")).lower() == "yes":
                            lines.append("- **Important:** Entrance Exam / Interview Required")

                        self._add_chunk(Chunk(
                            chunk_id=f"{slug}-prog-{chunk_counter}",
                            university=uni_name,
                            slug=slug,
                            section="program",
                            title=prog_name,
                            college=college_name,
                            program_name=prog_name,
                            cutoff_raw=cutoff_raw,
                            cutoff_min=c_min,
                            cutoff_max=c_max,
                            duration=str(prog.get("duration") or ""),
                            first_choice=str(prog.get("first_choice") or ""),
                            entrance_exam=str(prog.get("entrance_exam") or ""),
                            text="\n".join(lines),
                        ))

            # 6. Programme chunks (flat `programs` structure)
            if isinstance(programs, dict):
                for prog_name, prog_data in programs.items():
                    self.program_index[prog_name].append((uni_name, prog_data))
                    chunk_counter += 1
                    lines = [f"### {prog_name} — {uni_name}"]
                    cutoff_raw = ""
                    c_min, c_max = None, None
                    duration = ""
                    if isinstance(prog_data, dict):
                        cutoff_raw = str(prog_data.get("cutoff") or "")
                        c_min, c_max = parse_cutoff_range(cutoff_raw)
                        duration = str(prog_data.get("duration") or "")
                        if cutoff_raw:
                            lines.append(f"- **Cut-off Point:** {cutoff_raw}")
                        if duration:
                            lines.append(f"- **Duration:** {duration}")
                        if prog_data.get("requirements"):
                            lines.append(f"- **Requirements:** {prog_data['requirements']}")
                        if prog_data.get("career_prospects"):
                            lines.append(f"- **Career Prospects:** {prog_data['career_prospects']}")
                    self._add_chunk(Chunk(
                        chunk_id=f"{slug}-prog-{chunk_counter}",
                        university=uni_name,
                        slug=slug,
                        section="program",
                        title=prog_name,
                        program_name=prog_name,
                        cutoff_raw=cutoff_raw,
                        cutoff_min=c_min,
                        cutoff_max=c_max,
                        duration=duration,
                        text="\n".join(lines),
                    ))

        total_len = sum(len(c.tokens) for c in self.chunks)
        self._avg_doc_len = (total_len / len(self.chunks)) if self.chunks else 1.0

    # ------------------------------------------------------------------
    # Entity detection & classification
    # ------------------------------------------------------------------

    def extract_mentioned_universities(self, text: str) -> List[str]:
        """Return distinct canonical university names mentioned in text, in order."""
        if not text:
            return []
        text_lower = text.lower()
        found: List[Tuple[int, str]] = []
        seen: Set[str] = set()
        for pattern, _alias, uni_name in self._alias_patterns:
            match = pattern.search(text_lower)
            if match and uni_name not in seen:
                seen.add(uni_name)
                found.append((match.start(), uni_name))
        found.sort(key=lambda item: item[0])
        return [u for _, u in found]

    def get_university(self, name: str) -> Optional[Dict[str, Any]]:
        if not name:
            return None
        name_lower = name.strip().lower()
        if name_lower in self.name_variations:
            return self.universities.get(self.name_variations[name_lower])
        return self.universities.get(name)

    def resolve_university_name(self, name: str) -> Optional[str]:
        if not name:
            return None
        name_lower = name.strip().lower()
        if name_lower in self.name_variations:
            canonical = self.name_variations[name_lower]
            if canonical in self.universities:
                return canonical
        if name in self.universities:
            return name
        return None

    def classify_query(
        self,
        query: str,
        university_name: Optional[str] = None,
        chat_history: Optional[List[Dict[str, str]]] = None,
    ) -> Dict[str, Any]:
        """Classify query into one of the 8 routing classes and extract entities."""
        text = (query or "").strip()
        text_lower = text.lower()

        mentioned_unis = self.extract_mentioned_universities(text)
        explicit_param_uni = self.resolve_university_name(university_name) if university_name else None
        if explicit_param_uni and explicit_param_uni not in mentioned_unis:
            mentioned_unis.insert(0, explicit_param_uni)

        aggregate = extract_aggregate(text)
        fresh = needs_fresh_info(text)

        # Anchor from recent chat history only if the query names no university
        # and looks like a follow-up (not small talk, not about_app, not comparison)
        anchored_uni = None
        if not mentioned_unis and chat_history and not is_small_talk(text) and not is_about_app(text):
            # Avoid anchoring on clearly general / career / aggregate-wide questions
            is_followup_cue = bool(re.search(
                r"\b(there|their|that university|that school|this university|it|its|same school|what about|how about)\b",
                text_lower,
            ))
            if is_followup_cue:
                for past_msg in reversed(chat_history[-8:]):
                    if not isinstance(past_msg, dict):
                        continue
                    past_unis = self.extract_mentioned_universities(past_msg.get("content") or "")
                    if len(past_unis) == 1:
                        anchored_uni = past_unis[0]
                        break

        if is_small_talk(text):
            q_class = "small_talk"
        elif is_about_app(text):
            q_class = "about_app"
        elif len(mentioned_unis) >= 2 or (
            bool(_COMPARISON_PATTERN.search(text_lower)) and len(mentioned_unis) >= 2
        ):
            q_class = "comparison"
        elif aggregate is not None:
            q_class = "aggregate_eligibility"
        elif fresh:
            q_class = "deadlines_fresh"
        elif _CAREER_ADVICE_PATTERN.search(text_lower) and not mentioned_unis:
            q_class = "career_advice"
        elif mentioned_unis or anchored_uni:
            q_class = "specific_university"
        else:
            q_class = "general"

        return {
            "question_class": q_class,
            "mentioned_universities": mentioned_unis,
            "anchored_university": anchored_uni,
            "aggregate": aggregate,
            "needs_fresh_info": fresh,
        }

    # ------------------------------------------------------------------
    # BM25 Scoring
    # ------------------------------------------------------------------

    def _bm25_score(self, query_tokens: List[str], chunk: Chunk) -> float:
        if not query_tokens or not chunk.tokens:
            return 0.0
        n_docs = len(self.chunks)
        doc_len = len(chunk.tokens)
        score = 0.0
        for tok in set(query_tokens):
            tf = chunk.token_counts.get(tok, 0)
            if tf == 0:
                continue
            df = self._doc_freq.get(tok, 0)
            idf = math.log((n_docs - df + 0.5) / (df + 0.5) + 1.0)
            denom = tf + self._k1 * (1.0 - self._b + self._b * (doc_len / self._avg_doc_len))
            score += idf * (tf * (self._k1 + 1.0)) / denom
        return score

    def _extract_profile_boosts(
        self,
        user_profile: Optional[Dict[str, Any]],
        pivot: Optional[Dict[str, Any]],
    ) -> Tuple[Set[str], Set[str]]:
        """Extract boosted university names and program keywords from assessment profile."""
        boosted_unis: Set[str] = set()
        boosted_programs: Set[str] = set()
        if not isinstance(user_profile, dict):
            return boosted_unis, boosted_programs

        # If the student pivoted to a brand new interest in chat, don't boost old
        # assessment university_matches that may belong to their old interest.
        if pivot and pivot.get("interest"):
            boosted_programs.add(pivot["interest"].lower())
            return boosted_unis, boosted_programs

        pref_uni = self.resolve_university_name(str(user_profile.get("preferred_university") or ""))
        if pref_uni:
            boosted_unis.add(pref_uni)

        pref_prog = str(user_profile.get("preferred_program") or "").strip().lower()
        if pref_prog:
            boosted_programs.add(pref_prog)

        matches = user_profile.get("university_matches") or []
        if isinstance(matches, list):
            for match in matches[:5]:
                if not isinstance(match, dict):
                    continue
                raw_uni = match.get("university_name") or match.get("universityName") or ""
                resolved = self.resolve_university_name(str(raw_uni))
                if resolved:
                    boosted_unis.add(resolved)
                for prog in match.get("programs_eligible") or []:
                    if isinstance(prog, str) and prog.strip():
                        boosted_programs.add(prog.strip().lower())
                for prog in match.get("recommended_programs") or []:
                    if isinstance(prog, dict) and prog.get("name"):
                        boosted_programs.add(str(prog["name"]).strip().lower())
                    elif isinstance(prog, str) and prog.strip():
                        boosted_programs.add(prog.strip().lower())

        return boosted_unis, boosted_programs

    def _section_intent_boost(self, query_lower: str, section: str) -> float:
        boost = 0.0
        if section == "admission" and re.search(
            r"\b(apply|application|voucher|form|forms|pin|deadline|portal|requirement|mature|international|wassce|entry|admit)\b",
            query_lower,
        ):
            boost += 3.5
        if section == "fees" and re.search(r"\b(fee|fees|tuition|cost|price|pay|payment|hostel|residential|levy)\b", query_lower):
            boost += 4.5
        if section == "scholarships" and re.search(r"\b(scholarship|bursary|financial aid|funding|mastercard|contact|phone|email|whatsapp)\b", query_lower):
            boost += 4.5
        if section == "overview" and re.search(r"\b(overview|about|located|location|where is|established|public|private|website)\b", query_lower):
            boost += 3.0
        return boost

    # ------------------------------------------------------------------
    # Main Retrieval & Routing Pipeline
    # ------------------------------------------------------------------

    def retrieve(
        self,
        query: str,
        university_name: Optional[str] = None,
        chat_history: Optional[List[Dict[str, str]]] = None,
        user_profile: Optional[Dict[str, Any]] = None,
        top_k: int = 8,
        char_budget: int = 12000,
    ) -> Dict[str, Any]:
        """Classify query, detect mid-chat pivot, retrieve chunks, and build context."""
        classification = self.classify_query(query, university_name, chat_history)
        q_class = classification["question_class"]
        mentioned_unis: List[str] = classification["mentioned_universities"]
        anchored_uni: Optional[str] = classification["anchored_university"]
        aggregate: Optional[int] = classification["aggregate"]

        pivot = detect_interest_pivot(query, chat_history)
        effective_profile = apply_interest_pivot(user_profile, pivot)

        # Short-circuit classes that need no university retrieval
        if q_class in ("small_talk", "about_app"):
            return {
                "question_class": q_class,
                "mentioned_universities": mentioned_unis,
                "aggregate": aggregate,
                "pivot": pivot,
                "effective_profile": effective_profile,
                "chunks": [],
                "results": [],
                "context": "",
                "confidence": 0.95 if q_class == "about_app" else 0.0,
                "use_web_search": False,
            }

        # Build effective query text (incorporating mid-chat pivot if relevant)
        effective_query = query
        if pivot and pivot.get("interest"):
            if pivot["interest"].lower() not in query.lower():
                effective_query = f"{query} {pivot['interest']}"
        elif q_class == "career_advice" and isinstance(effective_profile, dict):
            # Enrich career queries with profile interests/career goals if present
            extra_terms = []
            for key in ("interests", "career_goals", "career_goal", "preferred_program"):
                val = effective_profile.get(key)
                if isinstance(val, list):
                    extra_terms.extend(str(v) for v in val[:3])
                elif isinstance(val, str) and val.strip():
                    extra_terms.append(val.strip())
            if extra_terms:
                effective_query = f"{query} {' '.join(extra_terms)}"

        query_lower = effective_query.lower()
        query_tokens = tokenize(effective_query, expand_synonyms=True)

        # Assessment boost only applies when the student did NOT explicitly ask
        # about a university outside their assessment matches.
        boosted_unis, boosted_programs = self._extract_profile_boosts(user_profile, pivot)
        apply_assessment_boost = bool(boosted_unis or boosted_programs) and (
            not mentioned_unis or any(u in boosted_unis for u in mentioned_unis)
        )

        # Route per question class
        selected_chunks: List[Tuple[Chunk, float]] = []

        if q_class == "comparison":
            selected_chunks = self._route_comparison(
                mentioned_unis, query_lower, query_tokens, top_k=max(top_k, len(mentioned_unis) * 3)
            )
        elif q_class == "specific_university":
            target_uni = mentioned_unis[0] if mentioned_unis else anchored_uni
            selected_chunks = self._route_specific_university(
                target_uni, query_lower, query_tokens, top_k=top_k
            )
        elif q_class == "aggregate_eligibility":
            selected_chunks = self._route_aggregate_eligibility(
                aggregate, mentioned_unis, query_lower, query_tokens,
                boosted_unis if apply_assessment_boost else set(),
                boosted_programs if apply_assessment_boost else set(),
                top_k=max(top_k, 10),
            )
        elif q_class == "deadlines_fresh":
            selected_chunks = self._route_deadlines(
                mentioned_unis, query_lower, query_tokens,
                boosted_unis if apply_assessment_boost else set(),
                top_k=top_k,
            )
        elif q_class == "career_advice":
            selected_chunks = self._route_career_advice(
                query_lower, query_tokens,
                boosted_unis if apply_assessment_boost else set(),
                boosted_programs if apply_assessment_boost else set(),
                top_k=max(top_k, 8),
            )
        else:  # general
            selected_chunks = self._route_general(
                query_lower, query_tokens,
                boosted_unis if apply_assessment_boost else set(),
                boosted_programs if apply_assessment_boost else set(),
                top_k=top_k,
            )

        # Assemble university-level summary results (backward-compatible shape)
        results, context = self._assemble_results_and_context(
            selected_chunks, q_class, mentioned_unis, aggregate, char_budget
        )

        if q_class in ("specific_university", "comparison") and results:
            confidence = 0.95
        elif q_class == "aggregate_eligibility" and results:
            confidence = 0.90
        elif q_class == "deadlines_fresh":
            confidence = 0.75 if results else 0.3
        elif results:
            top_score = selected_chunks[0][1] if selected_chunks else 0.0
            confidence = min(0.92, max(0.55, top_score / 12.0))
        else:
            confidence = 0.0

        use_web_search = (
            q_class == "deadlines_fresh"
            or classification["needs_fresh_info"]
            or confidence < 0.75
        )

        return {
            "question_class": q_class,
            "mentioned_universities": mentioned_unis,
            "anchored_university": anchored_uni,
            "aggregate": aggregate,
            "pivot": pivot,
            "effective_profile": effective_profile,
            "assessment_boost_applied": apply_assessment_boost,
            "chunks": [
                {
                    "chunk_id": c.chunk_id,
                    "university": c.university,
                    "section": c.section,
                    "title": c.title,
                    "program_name": c.program_name,
                    "cutoff_raw": c.cutoff_raw,
                    "score": round(score, 3),
                }
                for c, score in selected_chunks
            ],
            "results": results,
            "context": context,
            "confidence": round(confidence, 3),
            "use_web_search": use_web_search,
        }

    # ------------------------------------------------------------------
    # Class-specific routers
    # ------------------------------------------------------------------

    def _score_chunk(
        self,
        chunk: Chunk,
        query_lower: str,
        query_tokens: List[str],
        boosted_unis: Set[str],
        boosted_programs: Set[str],
    ) -> float:
        score = self._bm25_score(query_tokens, chunk)
        score += self._section_intent_boost(query_lower, chunk.section)

        # Exact programme name match bonus
        if chunk.program_name and chunk.program_name.lower() in query_lower:
            score += 8.0

        # Assessment boost
        if chunk.university in boosted_unis:
            score = score * 1.3 + 1.5
        if chunk.program_name and any(
            bp in chunk.program_name.lower() or chunk.program_name.lower() in bp
            for bp in boosted_programs
        ):
            score = score * 1.4 + 2.5

        return score

    def _route_specific_university(
        self,
        uni_name: Optional[str],
        query_lower: str,
        query_tokens: List[str],
        top_k: int,
    ) -> List[Tuple[Chunk, float]]:
        if not uni_name or uni_name not in self.uni_chunks:
            return []
        candidates = self.uni_chunks[uni_name]
        scored = [
            (c, self._score_chunk(c, query_lower, query_tokens, set(), set()))
            for c in candidates
        ]
        scored.sort(key=lambda item: item[1], reverse=True)

        chosen: List[Tuple[Chunk, float]] = []
        chosen_ids: Set[str] = set()

        # Ensure overview or admission chunk is included for grounding
        for sec in ("overview", "admission"):
            for c, s in scored:
                if c.section == sec and c.chunk_id not in chosen_ids:
                    if sec == "overview" or s > 2.0:
                        chosen.append((c, max(s, 1.0)))
                        chosen_ids.add(c.chunk_id)
                        break

        for c, s in scored:
            if len(chosen) >= top_k:
                break
            if c.chunk_id not in chosen_ids:
                chosen.append((c, s))
                chosen_ids.add(c.chunk_id)

        chosen.sort(key=lambda item: item[1], reverse=True)
        return chosen[:top_k]

    def _route_comparison(
        self,
        mentioned_unis: List[str],
        query_lower: str,
        query_tokens: List[str],
        top_k: int,
    ) -> List[Tuple[Chunk, float]]:
        if not mentioned_unis:
            return []
        per_uni = max(3, top_k // len(mentioned_unis))
        selected: List[Tuple[Chunk, float]] = []
        for uni_name in mentioned_unis:
            uni_picks = self._route_specific_university(uni_name, query_lower, query_tokens, top_k=per_uni)
            selected.extend(uni_picks)
        return selected

    def _route_aggregate_eligibility(
        self,
        aggregate: Optional[int],
        mentioned_unis: List[str],
        query_lower: str,
        query_tokens: List[str],
        boosted_unis: Set[str],
        boosted_programs: Set[str],
        top_k: int,
    ) -> List[Tuple[Chunk, float]]:
        if aggregate is None:
            return self._route_general(query_lower, query_tokens, boosted_unis, boosted_programs, top_k)

        pool = (
            [c for u in mentioned_unis for c in self.uni_chunks.get(u, [])]
            if mentioned_unis
            else self.chunks
        )

        # Strip generic aggregate words so programme/subject keywords stand out
        topic_tokens = [
            t for t in query_tokens
            if t not in {"aggregate", "wassce", "cutoff", "grade", "score", "study", "course", "programme", "program", "university", "ghana"}
            and not t.isdigit()
        ]

        scored: List[Tuple[Chunk, float]] = []
        for c in pool:
            if c.section != "program":
                continue

            base = self._bm25_score(topic_tokens, c) if topic_tokens else 0.0
            if c.program_name and c.program_name.lower() in query_lower:
                base += 8.0

            cutoff_score = 0.0
            if c.cutoff_min is not None and c.cutoff_max is not None:
                if c.cutoff_min <= aggregate <= c.cutoff_max:
                    # Ideal match right inside the cut-off range
                    cutoff_score = 8.0
                elif aggregate < c.cutoff_min:
                    # Student beat the cut-off (lower aggregate is better in WASSCE)
                    margin = c.cutoff_min - aggregate
                    cutoff_score = max(3.5, 7.5 - margin * 0.35)
                elif aggregate <= c.cutoff_max + 2:
                    # Borderline / stretch option
                    cutoff_score = 2.5
                else:
                    # Out of reach — keep only if the student specifically asked about this programme
                    if base >= 4.0:
                        cutoff_score = 0.5
                    else:
                        continue
            else:
                # Universities without numeric per-program cut-offs (e.g., UDS, UEW, UPSA, UHAS, GCTU, TTU)
                # General WASSCE eligibility is aggregate 24 or better
                if aggregate <= 24:
                    cutoff_score = 2.5 if base > 0 else 1.2
                else:
                    continue

            total = base * 1.4 + cutoff_score
            if c.university in boosted_unis:
                total = total * 1.25 + 1.0
            if c.program_name and any(bp in c.program_name.lower() for bp in boosted_programs):
                total = total * 1.35 + 1.5

            scored.append((c, total))

        scored.sort(key=lambda item: item[1], reverse=True)

        # Enforce diversity across universities unless the student named a single university
        max_per_uni = top_k if len(mentioned_unis) == 1 else 2
        counts: Counter = Counter()
        selected: List[Tuple[Chunk, float]] = []
        for c, s in scored:
            if counts[c.university] >= max_per_uni:
                continue
            selected.append((c, s))
            counts[c.university] += 1
            if len(selected) >= top_k:
                break

        # If a specific university was named, also include its admission chunk
        if len(mentioned_unis) == 1:
            for c in self.uni_chunks.get(mentioned_unis[0], []):
                if c.section == "admission":
                    selected.append((c, 1.0))
                    break

        return selected

    def _route_deadlines(
        self,
        mentioned_unis: List[str],
        query_lower: str,
        query_tokens: List[str],
        boosted_unis: Set[str],
        top_k: int,
    ) -> List[Tuple[Chunk, float]]:
        target_unis = mentioned_unis if mentioned_unis else list(boosted_unis)
        if not target_unis:
            # Spread across diverse major universities
            target_unis = [
                u for u in (
                    "University of Ghana",
                    "Kwame Nkrumah University of Science and Technology",
                    "University of Cape Coast",
                    "University of Education, Winneba",
                    "University of Professional Studies, Accra",
                    "Ashesi University",
                )
                if u in self.universities
            ]

        selected: List[Tuple[Chunk, float]] = []
        for uni_name in target_unis[:6]:
            for c in self.uni_chunks.get(uni_name, []):
                if c.section == "admission":
                    score = self._bm25_score(query_tokens, c) + 5.0
                    selected.append((c, score))
                    break
        return selected[:top_k]

    def _route_career_advice(
        self,
        query_lower: str,
        query_tokens: List[str],
        boosted_unis: Set[str],
        boosted_programs: Set[str],
        top_k: int,
    ) -> List[Tuple[Chunk, float]]:
        scored: List[Tuple[Chunk, float]] = []
        for c in self.chunks:
            if c.section != "program":
                continue
            s = self._score_chunk(c, query_lower, query_tokens, boosted_unis, boosted_programs)
            if s > 0.5:
                scored.append((c, s))
        scored.sort(key=lambda item: item[1], reverse=True)

        # Diversify across universities (max 2 programmes per university)
        counts: Counter = Counter()
        selected: List[Tuple[Chunk, float]] = []
        for c, s in scored:
            if counts[c.university] >= 2:
                continue
            selected.append((c, s))
            counts[c.university] += 1
            if len(selected) >= top_k:
                break
        return selected

    def _route_general(
        self,
        query_lower: str,
        query_tokens: List[str],
        boosted_unis: Set[str],
        boosted_programs: Set[str],
        top_k: int,
    ) -> List[Tuple[Chunk, float]]:
        is_apply_or_overview = bool(re.search(
            r"\b(how\s+do\s+i\s+apply|how\s+to\s+apply|buy\s+form|voucher|serial\s+pin|e-voucher|"
            r"universities\s+in\s+ghana|public\s+universities|private\s+universities|apply\s+to\s+university)\b",
            query_lower,
        ))

        scored: List[Tuple[Chunk, float]] = []
        for c in self.chunks:
            if is_apply_or_overview and c.section not in ("admission", "overview"):
                continue
            s = self._score_chunk(c, query_lower, query_tokens, boosted_unis, boosted_programs)
            if is_apply_or_overview and c.section == "admission":
                s += 2.0
            if s > 0.5:
                scored.append((c, s))

        scored.sort(key=lambda item: item[1], reverse=True)

        # Strict diversity cap (max 1 chunk per university for general apply/overview,
        # max 2 otherwise) to eliminate KNUST volume bias.
        max_per_uni = 1 if is_apply_or_overview else 2
        counts: Counter = Counter()
        selected: List[Tuple[Chunk, float]] = []
        for c, s in scored:
            if counts[c.university] >= max_per_uni:
                continue
            selected.append((c, s))
            counts[c.university] += 1
            if len(selected) >= top_k:
                break

        # If general apply/overview returned fewer than 4 universities, pad with diverse admission/overview chunks
        if is_apply_or_overview and len(selected) < 4:
            for uni_name in (
                "University of Ghana",
                "Kwame Nkrumah University of Science and Technology",
                "University of Cape Coast",
                "University of Education, Winneba",
                "University for Development Studies",
                "Ashesi University",
            ):
                if counts[uni_name] == 0 and uni_name in self.uni_chunks:
                    for c in self.uni_chunks[uni_name]:
                        if c.section == "admission":
                            selected.append((c, 2.0))
                            counts[uni_name] += 1
                            break
                if len(selected) >= 5:
                    break

        return selected

    # ------------------------------------------------------------------
    # Context Assembly
    # ------------------------------------------------------------------

    def _assemble_results_and_context(
        self,
        selected_chunks: List[Tuple[Chunk, float]],
        q_class: str,
        mentioned_unis: List[str],
        aggregate: Optional[int],
        char_budget: int,
    ) -> Tuple[List[Dict[str, Any]], str]:
        if not selected_chunks:
            return [], ""

        # Group chunks by university while preserving university order
        uni_order: List[str] = []
        grouped: Dict[str, List[Tuple[Chunk, float]]] = defaultdict(list)
        for c, s in selected_chunks:
            if c.university not in grouped:
                uni_order.append(c.university)
            grouped[c.university].append((c, s))

        # On comparisons, guarantee mentioned universities appear in exact order with equal budgets
        if q_class == "comparison" and mentioned_unis:
            uni_order = [u for u in mentioned_unis if u in grouped] + [
                u for u in uni_order if u not in mentioned_unis
            ]

        per_uni_budget = max(1800, char_budget // max(1, len(uni_order)))
        results: List[Dict[str, Any]] = []
        context_parts: List[str] = []

        for uni_name in uni_order:
            uni_chunks = grouped[uni_name]
            uni_data = self.universities.get(uni_name, {})
            top_score = max(s for _, s in uni_chunks)
            matched_programs = [c.program_name for c, _ in uni_chunks if c.program_name]

            uni_text_blocks: List[str] = []
            used = 0
            for c, _ in uni_chunks:
                block = c.text
                if aggregate is not None and c.section == "program" and c.cutoff_max is not None:
                    if aggregate <= c.cutoff_max:
                        block += f"\n- **Eligibility Note (Aggregate {aggregate}):** Meets or beats cut-off ({c.cutoff_raw})."
                    else:
                        block += f"\n- **Eligibility Note (Aggregate {aggregate}):** Above cut-off ({c.cutoff_raw}); likely stretch/not eligible."
                if used + len(block) + 2 > per_uni_budget and uni_text_blocks:
                    break
                uni_text_blocks.append(block)
                used += len(block) + 2

            uni_context = "\n\n".join(uni_text_blocks)[:per_uni_budget]
            context_parts.append(uni_context)

            relevance = (
                0.95
                if uni_name in mentioned_unis
                else min(0.92, max(0.55, top_score / 12.0))
            )
            entry: Dict[str, Any] = {
                "source": uni_name,
                "data": uni_data,
                "relevance": round(relevance, 3),
                "matched_programs": matched_programs[:5],
                "context": uni_context,
            }
            if matched_programs:
                first_prog_chunk = next((c for c, _ in uni_chunks if c.program_name), None)
                if first_prog_chunk:
                    entry["matched_program"] = first_prog_chunk.program_name
                    entry["matched_cutoff"] = first_prog_chunk.cutoff_raw
                    entry["duration"] = first_prog_chunk.duration
                    entry["first_choice"] = first_prog_chunk.first_choice
            if aggregate is not None:
                entry["aggregate_match"] = aggregate
            results.append(entry)

        combined_context = "\n\n---\n\n".join(context_parts)[:char_budget]
        if combined_context:
            combined_context += (
                "\n\nNote: Cut-off points change annually. Meeting minimum cut-offs does NOT "
                "guarantee admission. Always verify current information on the official university website."
            )
        return results, combined_context

    # ------------------------------------------------------------------
    # Backward-compatible search() helper
    # ------------------------------------------------------------------

    def search(self, query: str, top_n: int = 5) -> List[Dict[str, Any]]:
        out = self.retrieve(query, top_k=max(top_n * 2, 8))
        return out["results"][:top_n]
