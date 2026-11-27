import asyncio
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

AI_DIR = Path(__file__).resolve().parent.parent
if str(AI_DIR) not in sys.path:
    sys.path.insert(0, str(AI_DIR))

import main  # noqa: E402
import retrieval  # noqa: E402
import streaming  # noqa: E402


class TestAIServiceCore(unittest.TestCase):
    def test_serpapi_real_url_extraction(self):
        self.assertEqual(
            main.extract_real_serpapi_url({"link": "https://admissions.ug.edu.gh/apply"}),
            "https://admissions.ug.edu.gh/apply",
        )
        self.assertEqual(
            main.extract_real_serpapi_url(
                {"link": "https://www.google.com/url?q=https://knust.edu.gh/admissions&sa=U"}
            ),
            "https://knust.edu.gh/admissions",
        )
        self.assertEqual(
            main.extract_real_serpapi_url(
                {"link": "https://www.google.com/goto?url=https://ucc.edu.gh/news"}
            ),
            "https://ucc.edu.gh/news",
        )
        self.assertEqual(
            main.extract_real_serpapi_url(
                {
                    "link": "https://www.google.com/goto?token=xyz",
                    "displayed_link": "https://www.ashesi.edu.gh › admissions",
                }
            ),
            "https://www.ashesi.edu.gh",
        )

    def test_verify_internal_key(self):
        prev = os.environ.pop("INTERNAL_API_KEY", None)
        try:
            self.assertIsNone(main.verify_internal_key(None))
            os.environ["INTERNAL_API_KEY"] = "test-secret-key"
            self.assertIsNone(main.verify_internal_key("test-secret-key"))
            for bad in (None, "", "wrong"):
                with self.assertRaises(main.HTTPException) as ctx:
                    main.verify_internal_key(bad)
                self.assertEqual(ctx.exception.status_code, 401)
        finally:
            if prev is None:
                os.environ.pop("INTERNAL_API_KEY", None)
            else:
                os.environ["INTERNAL_API_KEY"] = prev

    def test_removed_unauthenticated_history_routes(self):
        paths = {r.path for r in main.app.routes}
        self.assertNotIn("/history/{user_id}", paths)
        self.assertNotIn("/history/chat/{conversation_id}", paths)
        self.assertIn("/respond", paths)
        self.assertIn("/respond-stream", paths)
        self.assertIn("/respond-with-files", paths)

    def test_query_helpers(self):
        self.assertEqual(retrieval.extract_aggregate("I got aggregate 12"), 12)
        self.assertEqual(retrieval.extract_aggregate("My WASSCE grade is 08"), 8)
        self.assertIsNone(retrieval.extract_aggregate("I got 99 percent"))
        self.assertTrue(retrieval.is_small_talk("Hello!"))
        self.assertFalse(retrieval.is_small_talk("What is the cut-off for UG Computer Science?"))
        self.assertTrue(retrieval.needs_fresh_info("When is the KNUST admission deadline this year?"))
        self.assertTrue(retrieval.is_about_app("Who built this app?"))

    def test_strip_stray_html_tags(self):
        cleaned = main.strip_stray_html_tags("<b>KNUST</b><br/>Line 2<li>Item</li>")
        self.assertNotIn("<b>", cleaned)
        self.assertNotIn("<br", cleaned)
        self.assertIn("**KNUST**", cleaned)

    def test_build_profile_section(self):
        section = main.build_profile_section(
            {
                "name": "Ama",
                "shs_program": "General Science",
                "wassce_grade": "10",
                "career_goals": "Software Engineer",
                "user_id": "should-not-appear",
            }
        )
        self.assertIn("Ama", section)
        self.assertIn("General Science", section)
        self.assertNotIn("should-not-appear", section)

    def test_career_coach_prompt_and_history_limit(self):
        captured = {}

        class FakeCompletions:
            async def create(self, **kwargs):
                captured.update(kwargs)
                return SimpleNamespace(
                    choices=[
                        SimpleNamespace(
                            message=SimpleNamespace(content="What hobbies do you enjoy?")
                        )
                    ]
                )

        prev_client = main.groq_client
        main.groq_client = SimpleNamespace(
            chat=SimpleNamespace(completions=FakeCompletions())
        )
        try:
            history = [
                {"role": "assistant" if i % 2 == 0 else "user", "content": f"turn {i}"}
                for i in range(12)
            ]
            reply = asyncio.run(
                main.generate_response_with_groq(
                    "I like Biology and Chemistry",
                    "",
                    [],
                    {"shs_program": "General Science"},
                    history,
                    is_coach_mode=True,
                )
            )
            self.assertIn("Career Coach", captured["messages"][0]["content"])
            self.assertEqual(len(captured["messages"]), 1 + 10 + 1)
            self.assertIn("hobbies", reply)
        finally:
            main.groq_client = prev_client

    def test_streaming_sse_generator_with_mocked_groq(self):
        async def fake_stream():
            for token in ("Hello ", "student!"):
                yield SimpleNamespace(
                    choices=[SimpleNamespace(delta=SimpleNamespace(content=token))]
                )

        class FakeCompletions:
            async def create(self, **kwargs):
                return fake_stream()

        fake_client = SimpleNamespace(chat=SimpleNamespace(completions=FakeCompletions()))

        async def collect():
            frames = []
            async for frame in streaming.stream_groq_response(
                groq_client=fake_client,
                query="Hi",
                context="",
                sources=[],
                confidence=0.9,
                fallback_fn=lambda: "fallback",
                sanitize_fn=lambda s: s.strip(),
            ):
                frames.append(frame)
            return frames

        frames = asyncio.run(collect())
        self.assertTrue(any(f.startswith("event: meta\n") for f in frames))
        self.assertEqual(sum(1 for f in frames if f.startswith("event: delta\n")), 2)
        self.assertTrue(any(f.startswith("event: done\n") for f in frames))
        self.assertIn("Hello student!", frames[-1])


if __name__ == "__main__":
    unittest.main()

