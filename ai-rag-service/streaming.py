"""Server-Sent Events (SSE) streaming helpers for the Glinax AI RAG service.

Kept in a standalone module to minimize merge conflicts with retrieval work in
`main.py` while sharing the exact same Groq prompt logic for both normal and
Career Coach modes.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, AsyncGenerator, Awaitable, Callable, Dict, List, Optional


SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


def format_sse(event: str, data: Dict[str, Any]) -> str:
    """Format a single Server-Sent Event frame."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def build_groq_messages(
    query: str,
    context: str,
    user_profile: Optional[Dict[str, Any]] = None,
    chat_history: Optional[List[Dict[str, str]]] = None,
    is_coach_mode: bool = False,
    build_profile_section_fn: Optional[Callable[[Optional[Dict[str, Any]]], str]] = None,
) -> List[Dict[str, str]]:
    """Build the system/history/user messages array matching `generate_response_with_groq`."""
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

    profile_section = (
        build_profile_section_fn(user_profile) if build_profile_section_fn else ""
    )

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

    messages_array: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]
    if chat_history:
        history_limit = 10 if is_coach_mode else 5
        recent_history = (
            chat_history[-history_limit:]
            if len(chat_history) > history_limit
            else chat_history
        )
        messages_array.extend(recent_history)
    messages_array.append({"role": "user", "content": user_message})
    return messages_array


def _extract_chunk_delta(chunk: Any) -> str:
    """Safely extract text delta from a Groq streaming completion chunk."""
    choices = getattr(chunk, "choices", None)
    if not choices:
        return ""
    first = choices[0]
    delta = getattr(first, "delta", None)
    if delta is None:
        return ""
    content = getattr(delta, "content", None)
    return content if isinstance(content, str) else ""


async def stream_groq_response(
    *,
    groq_client: Any,
    query: str,
    context: str,
    sources: List[Dict[str, Any]],
    confidence: float,
    user_profile: Optional[Dict[str, Any]] = None,
    chat_history: Optional[List[Dict[str, str]]] = None,
    is_coach_mode: bool = False,
    use_groq: bool = True,
    model: str = "openai/gpt-oss-120b",
    temperature: float = 0.6,
    reasoning_effort: str = "medium",
    build_profile_section_fn: Optional[Callable[[Optional[Dict[str, Any]]], str]] = None,
    fallback_fn: Callable[[], str],
    sanitize_fn: Callable[[str], str],
    start_time: Optional[datetime] = None,
    on_complete: Optional[Callable[[str, float], Awaitable[None]]] = None,
) -> AsyncGenerator[str, None]:
    """Stream `meta`, `delta`, and `done` SSE frames for a chat query.

    Falls back gracefully to emitting `fallback_fn()` as a single `delta` event
    if Groq is unavailable, disabled for this request, raises an error before
    streaming tokens, or returns an empty completion.
    """
    started = start_time or datetime.now()

    yield format_sse(
        "meta",
        {
            "sources": sources,
            "confidence": confidence,
        },
    )

    accumulated_parts: List[str] = []

    if groq_client and use_groq:
        try:
            messages_array = build_groq_messages(
                query=query,
                context=context,
                user_profile=user_profile,
                chat_history=chat_history,
                is_coach_mode=is_coach_mode,
                build_profile_section_fn=build_profile_section_fn,
            )

            stream = await groq_client.chat.completions.create(
                messages=messages_array,
                model=model,
                temperature=temperature,
                max_completion_tokens=2048,
                reasoning_effort=reasoning_effort,
                stream=True,
            )

            async for chunk in stream:
                delta_text = _extract_chunk_delta(chunk)
                if delta_text:
                    accumulated_parts.append(delta_text)
                    yield format_sse("delta", {"text": delta_text})
        except Exception as exc:
            print(f" Groq streaming error: {exc}")

    if not accumulated_parts:
        fallback_text = fallback_fn()
        if fallback_text:
            accumulated_parts.append(fallback_text)
            yield format_sse("delta", {"text": fallback_text})

    raw_reply = "".join(accumulated_parts)
    sanitized_reply = sanitize_fn(raw_reply)
    processing_time = (datetime.now() - started).total_seconds()
    timestamp = datetime.now().isoformat()

    if on_complete is not None:
        try:
            await on_complete(sanitized_reply, processing_time)
        except Exception as exc:
            print(f" Failed in stream on_complete hook: {exc}")

    yield format_sse(
        "done",
        {
            "reply": sanitized_reply,
            "sources": sources,
            "confidence": confidence,
            "processing_time": processing_time,
            "timestamp": timestamp,
            "model_used": "hybrid-rag-v2",
        },
    )
