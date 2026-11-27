"""Evaluation runner for Glinax / Cerkyl AI retrieval & classification.

Usage:
    python ai-rag-service/eval/run_eval.py            # fast offline eval
    python ai-rag-service/eval/run_eval.py --verbose  # print per-case details
    python ai-rag-service/eval/run_eval.py --live     # also check live Groq replies (requires GROQ_API_KEY)
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List

AI_DIR = Path(__file__).resolve().parent.parent
if str(AI_DIR) not in sys.path:
    sys.path.insert(0, str(AI_DIR))

import retrieval  # noqa: E402

EVAL_FILE = Path(__file__).resolve().parent / "eval_questions.json"


def evaluate_case(retriever: retrieval.ChunkedUniversityRetriever, case: Dict[str, Any]) -> Dict[str, Any]:
    out = retriever.retrieve(
        query=case["query"],
        user_profile=case.get("user_profile"),
        chat_history=case.get("chat_history"),
    )
    failures: List[str] = []

    expected_class = case.get("expected_class")
    if expected_class and out["question_class"] != expected_class:
        failures.append(f"class={out['question_class']!r} != expected {expected_class!r}")

    if "expected_aggregate" in case:
        if out.get("aggregate") != case["expected_aggregate"]:
            failures.append(f"aggregate={out.get('aggregate')!r} != expected {case['expected_aggregate']!r}")

    if "expected_web_search" in case:
        if bool(out.get("use_web_search")) != bool(case["expected_web_search"]):
            failures.append(f"use_web_search={out.get('use_web_search')} != expected {case['expected_web_search']}")

    returned_unis = [r["source"] for r in out.get("results", [])]
    for exp_uni in case.get("expected_universities", []):
        if exp_uni not in returned_unis:
            failures.append(f"missing university {exp_uni!r} (got {returned_unis})")

    min_distinct = case.get("min_distinct_universities")
    if min_distinct and len(set(returned_unis)) < min_distinct:
        failures.append(f"only {len(set(returned_unis))} distinct universities < {min_distinct} (got {returned_unis})")

    ctx_lower = (out.get("context") or "").lower()
    for kw in case.get("expected_keywords", []):
        if kw.lower() not in ctx_lower:
            failures.append(f"keyword {kw!r} missing from retrieved context")

    return {
        "id": case["id"],
        "passed": not failures,
        "failures": failures,
        "question_class": out["question_class"],
        "universities": returned_unis,
        "confidence": out.get("confidence", 0.0),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Cerkyl AI retrieval evaluation suite.")
    parser.add_argument("--verbose", action="store_true", help="Print every test case result.")
    parser.add_argument("--live", action="store_true", help="Also run a live Groq spot-check if GROQ_API_KEY is set.")
    args = parser.parse_args()

    retriever = retrieval.ChunkedUniversityRetriever()
    universities = retriever.universities
    if not universities:
        print("ERROR: No university JSON files loaded from ai-rag-service/data/universities/")
        return 1

    cases = json.loads(EVAL_FILE.read_text(encoding="utf-8"))

    passed = 0
    results = []
    for case in cases:
        res = evaluate_case(retriever, case)
        results.append(res)
        if res["passed"]:
            passed += 1
        if args.verbose or not res["passed"]:
            status = "PASS" if res["passed"] else "FAIL"
            print(f"[{status}] {res['id']} (class={res['question_class']}, unis={len(res['universities'])})")
            for f in res["failures"]:
                print(f"       - {f}")

    # Extra behavioural checks: assessment boost & mid-chat interest pivot
    extra_failures: List[str] = []
    boosted = retriever.retrieve(
        "What engineering courses are available?",
        user_profile={
            "university_matches": [
                {"university_name": "Ashesi University", "programs_eligible": ["Computer Engineering"]}
            ]
        },
    )
    if "Ashesi University" not in [r["source"] for r in boosted["results"]]:
        extra_failures.append("Assessment boost did not surface Ashesi University")

    pivoted = retriever.retrieve(
        "Actually I now want to study law instead",
        user_profile={"interests": ["Medicine"], "career_goals": "Doctor"},
    )
    if not pivoted.get("pivot") or "law" not in (pivoted["pivot"].get("interest") or "").lower():
        extra_failures.append(f"Mid-chat pivot failed to detect law: {pivoted.get('pivot')}")
    elif "law" not in str(pivoted["effective_profile"].get("career_goals", "")).lower():
        extra_failures.append(f"Effective profile was not updated with law: {pivoted['effective_profile']}")

    total = len(cases) + 2
    passed_total = passed + (2 - len(extra_failures))
    for ef in extra_failures:
        print(f"[FAIL] extra: {ef}")

    print(f"\nOffline Eval Summary: {passed_total}/{total} passed ({len(universities)} universities, {len(retriever.chunks)} chunks)")

    if args.live:
        if not os.getenv("GROQ_API_KEY"):
            print("Skipping --live check: GROQ_API_KEY is not set.")
        else:
            import main as app_main

            async def _spot_check():
                await app_main.initialize_services()
                req = app_main.ChatRequest(
                    message="What is the cut-off point for Computer Science at UG?",
                    conversation_id="eval-live-1",
                )
                resp = await app_main.respond_to_query(req)
                print(f"Live Groq spot-check: success={resp.success}, len={len(resp.reply)}")

            asyncio.run(_spot_check())

    return 0 if passed_total == total else 1


if __name__ == "__main__":
    raise SystemExit(main())
