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
# CONFIGURATION
# ============================================================================
UNIVERSITY_DATA_DIR = Path("university_data")
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
GROQ_REASONING_EFFORT = os.getenv("GROQ_REASONING_EFFORT", "medium")
GROQ_TEMPERATURE = float(os.getenv("GROQ_TEMPERATURE", "0.6"))

# ============================================================================
# ENHANCED UNIVERSITY DATA LOADER WITH ADVANCED PARSING
# ============================================================================

class UniversityDataParser:
    """Advanced parser for university context files."""
    
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
        
        # Parse different sections
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
            # Pattern: "BSc. Computer Science 7(9) 15 - B3 in Elective Maths"
            r'^([A-Z][a-zA-Z\s\.\-]+?)\s+(\d+(?:\(?\d*\)?)?)\s+(\d+(?:\(?\d*\)?)?|[-])\s+([-\d]+)?\s*(.*?)$',
            # Pattern: "Bachelor of Medicine and Bachelor of Surgery 8 - - -"
            r'^([A-Z][a-zA-Z\s\.\-]+?)\s+(\d+)\s+([-\d]+)\s+([-\d]+)?\s*(.*?)$',
            # Pattern: "BSc. Nursing 15 - - -"
            r'^([A-Z][a-zA-Z\s\.\-]+?)\s+(\d+)\s+([-\d]+)\s+(.*?)$',
        ]
        
        for i, line in enumerate(lines):
            line = line.strip()
            if not line:
                continue
            
            # Detect section headers
            if any(x in line for x in ['College of', 'Faculty of', 'School of', 'Department of']):
                current_section = line
                continue
            
            # Try each pattern
            for pattern in program_patterns:
                match = re.match(pattern, line)
                if match:
                    groups = match.groups()
                    prog_name = groups[0].strip()
                    
                    # Parse cut-off points
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
                    
                    # Store by program name
                    parsed["programs"][prog_name] = program_data
                    break
    
    def _parse_cutoff_points(self, content: str, parsed: Dict[str, Any]):
        """Parse cut-off point tables specifically."""
        # Look for cutoff tables
        cutoff_patterns = [
            r'(?:CUT-OFF POINTS|cutt-off point|cut off).*?([\s\S]+?)(?=Contacts|Key:|NB:|$|SCHOOL OF|FACULTY OF)',
            r'([A-Z][A-Z\s]+?)\s+(\d+)\s+(\d+)?\s*',
            r'(\w+(?:\s+\w+)*)\s+(\d{1,2}(?:\s*[/-]\s*\d{1,2})?)',
        ]
        
        # Find cutoff sections
        cutoff_sections = re.findall(r'(CUT-OFF POINTS|CUT OFF POINTS|ADMISSIONS CUT-OFF).*?([\s\S]+?)(?=\n\n[A-Z][A-Z\s]+:|Contacts:|NB:|$)',
                                    content, re.IGNORECASE | re.DOTALL)
        
        for section_title, section_content in cutoff_sections:
            # Extract program-cutoff pairs
            lines = section_content.strip().split('\n')
            for line in lines:
                line = line.strip()
                if not line or line.startswith('NB:'):
                    continue
                    
                # Try to match program name with cutoff
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
        
        # Parse specific requirements for different qualifications
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
        
        # Parse international fees
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
        """Parse study options (Day, Evening, Weekend, Sandwich, Distance)."""
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
        """Parse special notes like affirmative action, gender restrictions, etc."""
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
# ENHANCED KNOWLEDGE BASE WITH MULTI-STRATEGY SEARCH
# ============================================================================

class EnhancedUniversityKnowledgeBase:
    """Advanced knowledge base with multiple search strategies."""
    
    def __init__(self):
        self.universities: Dict[str, Dict[str, Any]] = {}
        self.name_variations: Dict[str, str] = {}
        self.program_index: Dict[str, List[Tuple[str, str]]] = {}  # program -> [(uni_name, program_data)]
        self.keyword_index: Dict[str, Set[str]] = {}
        self.cutoff_index: Dict[int, List[Tuple[str, str, str]]] = {}  # aggregate -> [(uni_name, program, cutoff)]
        self.parser = UniversityDataParser()
        
        # Load all data
        self._load_from_files()
        self._load_hardcoded_data()
        self._build_indexes()
        
        print(f"✅ Knowledge Base loaded: {len(self.universities)} universities")
        print(f"   - {len(self.program_index)} unique programs indexed")
        print(f"   - {len(self.keyword_index)} keywords indexed")
        print(f"   - Cut-off points indexed for {len(self.cutoff_index)} aggregate values")
    
    def _load_from_files(self):
        """Load university data from all context files."""
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
                        self.universities[uni_name] = parsed_data
                        self._add_name_variations(uni_name)
                        print(f"✅ Loaded: {uni_name} ({len(parsed_data['programs'])} programs)")
                    else:
                        print(f"⚠️ Failed to parse: {uni_name}")
                except Exception as e:
                    print(f"❌ Error loading {uni_name}: {e}")
            else:
                print(f"⚠️ File not found: {filename}")
    
    def _add_name_variations(self, uni_name: str):
        """Add comprehensive name variations."""
        variations_map = {
            "University of Ghana": ["ug", "legon", "university of ghana", "ug legon", "legon university"],
            "University for Development Studies": ["uds", "tamale", "university for development studies", "development studies"],
            "University of Energy and Natural Resources": ["uenr", "sunyani", "energy and natural resources", "uenr sunyani"],
            "University of Education Winneba": ["uew", "winneba", "university of education", "education winneba"],
            "University of Mines and Technology": ["umat", "tarkwa", "mines and technology", "umat tarkwa"],
            "University of Health and Allied Sciences": ["uhas", "ho", "health and allied sciences", "uhas ho"],
            "Ghana Communication Technology University": ["gctu", "communication technology", "gctu tesano"],
        }
        
        if uni_name in variations_map:
            for var in variations_map[uni_name]:
                self.name_variations[var.lower()] = uni_name
        
        self.name_variations[uni_name.lower()] = uni_name
        # Add common abbreviations
        if "University of" in uni_name:
            short = uni_name.replace("University of", "").strip()
            if short:
                self.name_variations[short.lower()] = uni_name
    
    def _load_hardcoded_data(self):
        """Load hardcoded data for any missing universities."""
        # Only add if not already loaded
        for uni_name, data in HARDCODED_UNIVERSITY_DATA.items():
            if uni_name not in self.universities:
                self.universities[uni_name] = data
                self._add_name_variations(uni_name)
    
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
                cut_offs = prog_data.get("cut_offs", [])
                for cutoff in cut_offs:
                    try:
                        # Extract numeric value from cutoff (e.g., "15", "15(16)", "7/9")
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
        
        # STRATEGY 1: Exact university name match (Highest priority)
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
                # Find programs with cut-offs around this aggregate
                for cutoff_agg, programs in self.cutoff_index.items():
                    if abs(cutoff_agg - agg) <= 5:  # Within 5 points
                        for uni_name, prog_name, cutoff in programs:
                            if uni_name not in scored:
                                scored[uni_name] = 0
                            scored[uni_name] += 3.0
        
        # STRATEGY 5: Course/Subject matching
        subjects = ['maths', 'physics', 'chemistry', 'biology', 'english', 'science', 'arts', 'business']
        for subject in subjects:
            if subject in query_lower:
                for uni_name, data in self.universities.items():
                    # Check if university offers programs in this area
                    text = json.dumps(data.get("programs", {})).lower()
                    if subject in text:
                        if uni_name not in scored:
                            scored[uni_name] = 0
                        scored[uni_name] += 2.0
        
        # STRATEGY 6: Location matching
        location_keywords = ['accra', 'kumasi', 'tamale', 'sunyani', 'winneba', 'tarkwa', 'ho', 'tesano']
        for loc in location_keywords:
            if loc in query_lower:
                for uni_name, data in self.universities.items():
                    content = json.dumps(data).lower()
                    if loc in content:
                        if uni_name not in scored:
                            scored[uni_name] = 0
                        scored[uni_name] += 2.0
        
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
        
        return matches[:5]  # Limit to 5 matches
    
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
    
    def recommend_programs(self, aggregate: int, subjects: List[str] = None, interest: str = None) -> List[Dict[str, Any]]:
        """Recommend programs based on aggregate and optional subject/interest filters."""
        candidates = self.find_programs_by_cutoff(aggregate)
        
        if subjects:
            candidates = [c for c in candidates if any(subj.lower() in json.dumps(self.universities.get(c["university"], {})).lower() for subj in subjects)]
        
        if interest:
            candidates = [c for c in candidates if interest.lower() in c["program"].lower() or interest.lower() in c["university"].lower()]
        
        return candidates[:10]  # Top 10 recommendations

# ============================================================================
# ENHANCED CONTEXT BUILDING
# ============================================================================

def build_university_context(uni_name: str, uni_data: Dict[str, Any]) -> str:
    """Build comprehensive context from university data."""
    
    programs = uni_data.get("programs", {})
    deadlines = uni_data.get("deadlines", {})
    admission = uni_data.get("admission_requirements", {})
    contact = uni_data.get("contact", {})
    fees = uni_data.get("fees", {})
    cutoff_points = uni_data.get("cutoff_points", {})
    study_options = uni_data.get("study_options", [])
    special_notes = uni_data.get("special_notes", [])
    
    # Build program list with cut-offs
    program_lines = []
    for prog_name, prog_data in programs.items():
        if isinstance(prog_data, dict):
            parts = [f"  - **{prog_name}**"]
            if prog_data.get("cut_offs"):
                parts.append(f"Cut-off: {', '.join(prog_data['cut_offs'])}")
            if prog_data.get("requirements"):
                parts.append(f"Requirements: {prog_data['requirements']}")
            program_lines.append(" | ".join(parts))
        else:
            program_lines.append(f"  - {prog_name}")
    
    # Build deadline info
    deadline_lines = []
    for key, val in deadlines.items():
        if val:
            deadline_lines.append(f"  - {key.replace('_', ' ').title()}: {val}")
    
    # Build fee info
    fee_lines = []
    for key, val in fees.items():
        if val:
            fee_lines.append(f"  - {key.replace('_', ' ').title()}: GH¢{val}" if "fee" in key else f"  - {key.replace('_', ' ').title()}: {val}")
    
    # Build study options
    study_line = f"  - Study Options: {', '.join(study_options)}" if study_options else ""
    
    context = f"""
# {uni_name}

## Programs Offered:
{chr(10).join(program_lines) if program_lines else '  - See website for full list'}

## Admission Deadlines:
{chr(10).join(deadline_lines) if deadline_lines else '  - Check university website'}

## Study Options:
{study_line if study_line else '  - Contact university for study options'}

## Application Fees:
{chr(10).join(fee_lines) if fee_lines else '  - Check university website'}

## Contact Information:
  - Phone: {contact.get('phone', 'N/A')}
  - Email: {contact.get('email', 'N/A')}
  - Website: {contact.get('website', 'N/A')}

## Special Notes:
{chr(10).join([f'  - {note}' for note in special_notes]) if special_notes else '  - None'}
"""
    return context

# ============================================================================
# MAIN APP (Using enhanced components)
# ============================================================================

# Initialize knowledge base
university_kb = EnhancedUniversityKnowledgeBase()

# FastAPI app setup
app = FastAPI(title="Glinax RAG+CAG Service", version="2.0.0")

# ... (rest of FastAPI code remains the same, using the enhanced functions)

# ============================================================================
# ENHANCED SEARCH FUNCTION
# ============================================================================

def search_local_knowledge(query: str, university_name: str = None) -> Dict[str, Any]:
    """Enhanced search using the knowledge base."""
    
    # If a specific university is mentioned, try to get it
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
    
    # Search the knowledge base
    results = university_kb.search(query)
    
    # Check for cut-off based queries
    agg_match = re.search(r'aggregate\s*(\d+)', query.lower())
    if agg_match and results:
        aggregate = int(agg_match.group(1))
        program_matches = university_kb.find_programs_by_cutoff(aggregate)
        if program_matches:
            # Add program matches as additional context
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
# ENHANCED SYSTEM PROMPT
# ============================================================================

def build_system_prompt(is_coach_mode: bool = False) -> str:
    """Build the system prompt with specific rules."""
    current_year = datetime.now().year
    
    base_prompt = f"""You are Cerkyl — a smart, friendly, and knowledgeable AI admission counsellor built specifically for Ghanaian SHS graduates.

You have access to detailed information about Ghanaian universities including:
- Program names with cut-off points
- Subject requirements for each program  
- Application deadlines
- Entrance exam dates
- Entry requirements for different qualifications (WASSCE, SSSCE, GCE, HND, Mature)
- Study options (Day, Evening, Weekend, Sandwich, Distance)
- Application fees

**CRITICAL RULES - STRICTLY FOLLOW:**

1. **USE ONLY PROVIDED DATA**: Only state a specific number, date, name, or requirement if it appears in the "Available university information" section. Never invent or guess numbers.

2. **CUT-OFF POINTS**: Always provide the exact cut-off points from the data. If multiple cut-offs exist (e.g., regular vs fee-paying), mention all.

3. **SUBJECT REQUIREMENTS**: Always mention specific subject requirements (e.g., "B3 in Elective Maths", "C6 in Chemistry").

4. **DEADLINES**: Always include the application deadline when discussing any program. Current year: {current_year}

5. **ENTRANCE EXAMS**: Mention if the program requires an entrance exam and when it will be held if that information is available.

6. **HONESTY**: If a student's aggregate doesn't meet the cut-off, say so clearly and suggest alternatives.

7. **RECOMMENDATIONS**: When recommending programs, always reference the specific cut-off points and requirements.

8. **STUDY OPTIONS**: Mention study options (Day/Evening/Weekend) if available.

9. **BE CONCISE**: Answer what was asked. Don't dump all information.

**RESPONSE FORMAT:**
- Use markdown for readability
- Start with the most relevant information
- Include specific numbers when available
- End with a helpful follow-up question or next step
"""

    if is_coach_mode:
        return base_prompt + """
**COACH MODE - SPECIAL RULES:**
- Ask one insightful question at a time
- Guide them to discover their path naturally
- Don't jump to recommendations too quickly
- Focus on understanding their strengths and interests
"""
    
    return base_prompt

# ============================================================================
# ENHANCED FALLBACK RESPONSE
# ============================================================================

def generate_smart_fallback_response(
    query: str, context: str, sources: List[Dict], user_profile: Dict = None
) -> str:
    """Generate fallback response using the knowledge base directly."""
    query_lower = query.lower()
    
    # Try to find relevant info from knowledge base
    results = university_kb.search(query)
    
    if results:
        response_parts = []
        
        for result in results[:3]:
            uni_name = result["source"]
            uni_data = result["data"]
            matched_progs = result.get("matched_programs", [])
            
            if result.get("matched_program"):
                # This is a program match
                prog_name = result["matched_program"]
                cutoff = result["matched_cutoff"]
                prog_data = uni_data.get("programs", {}).get(prog_name, {})
                reqs = prog_data.get("requirements", "See university website")
                
                response_parts.append(f"""
### {prog_name} at {uni_name}
- **Cut-off Point:** {cutoff}
- **Subject Requirements:** {reqs}
- **Study Options:** {', '.join(uni_data.get('study_options', ['See website']))}
""")
            elif matched_progs:
                # Show matched programs                prog_list = []
                for p in matched_progs[:3]:
                    p_data = uni_data.get("programs", {}).get(p, {})
                    cutoff = ', '.join(p_data.get("cut_offs", ["N/A"]))
                    prog_list.append(f"  - {p}: Cut-off {cutoff}")
                
                response_parts.append(f"""
### {uni_name}
**Programs matching your query:**
{chr(10).join(prog_list)}

**Study Options:** {', '.join(uni_data.get('study_options', ['See website']))}
**Application Deadline:** {uni_data.get('deadlines', {}).get('application_deadline', 'Check website')}
**Contact:** {uni_data.get('contact', {}).get('phone', 'N/A')}
""")
            else:
                # General university info
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

**Study Options:** {', '.join(uni_data.get('study_options', ['See website']))}
**Application Deadline:** {uni_data.get('deadlines', {}).get('application_deadline', 'Check website')}
**Contact:** {uni_data.get('contact', {}).get('phone', 'N/A')}
""")
        
        if response_parts:
            return "\n\n---\n\n".join(response_parts)
    
    # Ultimate fallback with all universities
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
- **Application fees**

What specific information would you like about any of these universities?
"""

# ============================================================================
# INITIALIZATION
# ============================================================================

# Hardcoded data as fallback
HARDCODED_UNIVERSITY_DATA = {
    "Kwame Nkrumah University of Science and Technology": {
        "location": "Kumasi, Ashanti Region",
        "established": "1952",
        "website": "www.knust.edu.gh",
        "contact": {"phone": "+233-32-206-0331", "email": "admissions@knust.edu.gh"},
        "programs": {}
    },
    # ... other hardcoded data
}

# Initialize MongoDB and Groq clients
# ... (rest of the FastAPI app code remains the same)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
