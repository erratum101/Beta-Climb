import json
import os
import unittest
from unittest.mock import patch

import httpx

from service.llm import DeepSeekChatClient, LLMError


class DeepSeekChatClientTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        env = patch.dict(os.environ, {"DEEPSEEK_API_KEY": "mock-token"}, clear=True)
        env.start()
        self.addCleanup(env.stop)

    def client(self, handler):
        http = httpx.AsyncClient(transport=httpx.MockTransport(handler), follow_redirects=True)
        self.addAsyncCleanup(http.aclose)
        return DeepSeekChatClient(http)

    async def test_completion_sends_text_only(self):
        messages = [{"role": "user", "content": "Hello"}]

        def handler(request):
            self.assertEqual(str(request.url), "https://api.deepseek.com/chat/completions")
            self.assertEqual(request.method, "POST")
            self.assertEqual(request.headers["Authorization"], "Bearer mock-token")
            self.assertEqual(json.loads(request.content), {
                "model": "deepseek-chat", "messages": messages, "stream": False,
            })
            return httpx.Response(200, json={"choices": [{"finish_reason": "stop", "message": {"content": "Hi"}}]})

        self.assertEqual(await self.client(handler).complete(messages), "Hi")

    async def test_does_not_follow_redirect_or_echo_response(self):
        seen = []

        def redirect(request):
            seen.append(request.url.host)
            return httpx.Response(307, headers={"Location": "https://example.org/"}, text="mock-token")

        with self.assertRaisesRegex(LLMError, "^DeepSeek returned HTTP 307$") as error:
            await self.client(redirect).complete([])
        self.assertFalse(error.exception.retryable)
        self.assertEqual(seen, ["api.deepseek.com"])

    async def test_rejects_other_origin_before_sending(self):
        for bad_url in [
            "https://example.org/chat",
            "http://api.deepseek.com/chat",
            "https://api.deepseek.com:8443/chat",
            "https://api.eliza.yandex.net/raw/zai/v1/chat/completions",
        ]:
            with self.subTest(url=bad_url), patch.dict(os.environ, {"LLM__URL": bad_url}):
                with self.assertRaises(LLMError):
                    self.client(lambda request: self.fail("Request should never be sent"))

    async def test_failure_classification(self):
        for status, retryable in [(401, False), (429, True), (503, True)]:
            with self.subTest(status=status), self.assertRaises(LLMError) as error:
                await self.client(lambda request: httpx.Response(status, text="mock-token")).complete([])
            self.assertEqual(str(error.exception), f"DeepSeek returned HTTP {status}")
            self.assertEqual(error.exception.retryable, retryable)

    async def test_rejects_malformed_completion(self):
        with self.assertRaisesRegex(LLMError, "invalid chat completion"):
            await self.client(lambda request: httpx.Response(200, json={"choices": []})).complete([])

    async def test_rejects_partial_text_without_echoing_it(self):
        for reason in ["length", "content_filter"]:
            choice = {"finish_reason": reason, "message": {"content": "partial private analysis"}}
            with self.subTest(reason=reason), self.assertRaises(LLMError) as error:
                await self.client(lambda request: httpx.Response(200, json={"choices": [choice]})).complete([])
            self.assertEqual(str(error.exception), "DeepSeek returned an incomplete chat completion")

    async def test_uses_configured_model(self):
        def handler(request):
            self.assertEqual(json.loads(request.content)["model"], "deepseek-reasoner")
            self.assertEqual(request.headers["Authorization"], "Bearer mock-token")
            return httpx.Response(200, json={"choices": [{"finish_reason": "stop", "message": {"content": "ok"}}]})

        with patch.dict(os.environ, {"LLM__MODEL": "deepseek-reasoner"}):
            self.assertEqual(await self.client(handler).complete([]), "ok")
