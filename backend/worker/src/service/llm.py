"""Async chat completions for the video analysis worker.

The model receives the text timeline only. Video stays on disk and is not sent to DeepSeek.
"""

import os
from collections.abc import Sequence
from typing import Literal, Protocol, TypedDict

import httpx


class ChatMessage(TypedDict):
    role: Literal["system", "user", "assistant"]
    content: str


class ChatClient(Protocol):
    async def complete(self, messages: Sequence[ChatMessage]) -> str: ...


class LLMError(RuntimeError):
    """A safe error to store on a task. The worker applies its own retry policy."""

    def __init__(self, message: str, *, retryable: bool = False) -> None:
        super().__init__(message)
        self.retryable = retryable


class DeepSeekChatClient:
    """Text chat on api.deepseek.com. The caller owns the HTTP pool."""

    def __init__(self, http: httpx.AsyncClient) -> None:
        self._http = http
        self._model = os.environ.get("LLM__MODEL", "deepseek-chat").strip()
        try:
            url = httpx.URL(os.environ.get("LLM__URL", "https://api.deepseek.com/chat/completions"))
        except httpx.InvalidURL:
            raise LLMError("Invalid DeepSeek endpoint") from None
        if (
            url.scheme != "https"
            or url.host != "api.deepseek.com"
            or url.port is not None
            or url.userinfo
            or url.query
            or url.fragment
        ):
            raise LLMError("LLM__URL must be an HTTPS endpoint on api.deepseek.com")
        self._url = url
        if not self._model:
            raise LLMError("LLM__MODEL must specify a model")
        token = os.environ.get("DEEPSEEK_API_KEY", "").strip()
        if not token or not token.isascii() or not token.isprintable():
            raise LLMError("DEEPSEEK_API_KEY is missing or malformed")
        self._headers = httpx.Headers({"Authorization": f"Bearer {token}"})

    async def complete(self, messages: Sequence[ChatMessage]) -> str:
        payload = {"model": self._model, "messages": list(messages), "stream": False}
        try:
            response = await self._http.post(
                self._url,
                headers=self._headers,
                json=payload,
                timeout=httpx.Timeout(connect=10.0, read=360.0, write=30.0, pool=10.0),
                follow_redirects=False,
            )
        except httpx.RequestError as exc:
            raise LLMError(f"DeepSeek request failed ({type(exc).__name__})", retryable=True) from None

        if not response.is_success:
            status = response.status_code
            raise LLMError(f"DeepSeek returned HTTP {status}", retryable=status in {408, 429} or status >= 500)
        try:
            choice = response.json()["choices"][0]
            if choice["finish_reason"] != "stop":
                raise LLMError("DeepSeek returned an incomplete chat completion")
            content = choice["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError):
            raise LLMError("DeepSeek returned an invalid chat completion") from None
        if not isinstance(content, str) or not content.strip():
            raise LLMError("DeepSeek returned an empty chat completion")
        return content
