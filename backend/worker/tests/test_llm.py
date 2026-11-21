import json
import os
import unittest
from unittest.mock import patch

import httpx

from service.llm import ElizaChatClient, LLMError


class ElizaChatClientTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        env = patch.dict(os.environ, {"MEMORY_ELIZA_OAUTH_TOKEN": "mock-token"}, clear=True)
        env.start()
        self.addCleanup(env.stop)

    def client(self, handler):
        http = httpx.AsyncClient(transport=httpx.MockTransport(handler), follow_redirects=True)
        self.addAsyncCleanup(http.aclose)
        return ElizaChatClient(http)

    async def test_completion(self):
        messages = [{"role": "user", "content": "Hello"}]

        def handler(request):
            self.assertEqual(str(request.url), "https://api.eliza.yandex.net/raw/zai/v1/chat/completions")
            self.assertEqual(request.method, "POST")
            self.assertEqual(request.headers["Authorization"], "Bearer mock-token")
            self.assertEqual(json.loads(request.content), {
                "model": "glm-5.3-flash", "messages": messages, "stream": False, "reasoning_effort": "low",
            })
            return httpx.Response(200, json={"choices": [{"finish_reason": "stop", "message": {"content": "Hi"}}]})

        self.assertEqual(await self.client(handler).complete(messages), "Hi")

    async def test_does_not_follow_redirect_or_echo_response(self):
        seen = []

        def redirect(request):
            seen.append(request.url.host)
            return httpx.Response(307, headers={"Location": "https://example.org/"}, text="mock-token")

        with self.assertRaisesRegex(LLMError, "^Eliza returned HTTP 307$") as error:
            await self.client(redirect).complete([])
        self.assertFalse(error.exception.retryable)
        self.assertEqual(seen, ["api.eliza.yandex.net"])

    async def test_rejects_other_origin_before_sending(self):
        for bad_url in [
            "https://example.org/chat",
            "http://api.eliza.yandex.net/chat",
            "https://api.eliza.yandex.net:8443/chat",
        ]:
            with self.subTest(url=bad_url), patch.dict(os.environ, {"LLM__URL": bad_url}):
                with self.assertRaises(LLMError):
                    self.client(lambda request: self.fail("Request should never be sent"))

    async def test_failure_classification(self):
        for status, retryable in [(401, False), (429, True), (503, True)]:
            with self.subTest(status=status), self.assertRaises(LLMError) as error:
                await self.client(lambda request: httpx.Response(status, text="mock-token")).complete([])
            self.assertEqual(str(error.exception), f"Eliza returned HTTP {status}")
            self.assertEqual(error.exception.retryable, retryable)

    async def test_rejects_malformed_completion(self):
        with self.assertRaisesRegex(LLMError, "invalid chat completion"):
            await self.client(lambda request: httpx.Response(200, json={"choices": []})).complete([])

    async def test_rejects_partial_text_without_echoing_it(self):
        for reason in ["length", "content_filter"]:
            choice = {"finish_reason": reason, "message": {"content": "partial private analysis"}}
            with self.subTest(reason=reason), self.assertRaises(LLMError) as error:
                await self.client(lambda request: httpx.Response(200, json={"choices": [choice]})).complete([])
            self.assertEqual(str(error.exception), "Eliza returned an incomplete chat completion")

    async def test_uses_configured_provider_route_and_model(self):
        url = "https://api.eliza.yandex.net/raw/another/v1/chat/completions"

        def handler(request):
            self.assertEqual(str(request.url), url)
            self.assertEqual(json.loads(request.content)["model"], "alternative-model")
            self.assertNotIn("reasoning_effort", json.loads(request.content))
            self.assertEqual(request.headers["Authorization"], "Bearer mock-token")
            return httpx.Response(200, json={"choices": [{"finish_reason": "stop", "message": {"content": "ok"}}]})

        with patch.dict(os.environ, {"LLM__URL": url, "LLM__MODEL": "alternative-model"}):
            self.assertEqual(await self.client(handler).complete([]), "ok")

    async def test_reasoning_effort_only_applies_to_supported_model_and_provider(self):
        route = "https://api.eliza.yandex.net/raw"
        for provider, model, effort, expected in [
            ("zai", "glm-5.3-flash", "high", "high"),
            ("zai", "glm-5.3-flash", "max", "max"),
            ("other", "glm-5.3-flash", "high", None),
            ("zai", "different-model", "high", None),
        ]:
            def handler(request):
                payload = json.loads(request.content)
                if expected is None:
                    self.assertNotIn("reasoning_effort", payload)
                else:
                    self.assertEqual(payload["reasoning_effort"], expected)
                return httpx.Response(200, json={"choices": [{"finish_reason": "stop", "message": {"content": "ok"}}]})

            settings = {"LLM__URL": f"{route}/{provider}/v1/chat/completions", "LLM__MODEL": model,
                        "LLM__REASONING_EFFORT": effort}
            with self.subTest(provider=provider, model=model, effort=effort), patch.dict(os.environ, settings):
                self.assertEqual(await self.client(handler).complete([]), "ok")
