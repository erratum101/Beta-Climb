"""Async chat completions for the video analysis worker."""

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


class ElizaChatClient:
    """Uses a caller-owned HTTP pool and the worker's Eliza credentials."""

    def __init__(self, http: httpx.AsyncClient) -> None:
        self._http = http
        self._model = os.environ.get("LLM__MODEL", "glm-5.3-flash").strip()
        try:
            url = httpx.URL(os.environ.get(
                "LLM__URL", "https://api.eliza.yandex.net/raw/zai/v1/chat/completions",
            ))
        except httpx.InvalidURL:
            raise LLMError("Invalid Eliza endpoint") from None
        if (
            url.scheme != "https"
            or url.host != "api.eliza.yandex.net"
            or url.port is not None
            or url.userinfo
            or url.query
            or url.fragment
        ):
            raise LLMError("LLM__URL must be an HTTPS endpoint on api.eliza.yandex.net")
        self._url = url

        if not self._model:
            raise LLMError("LLM__MODEL must specify a model")
        self._reasoning_effort = None
        if self._model == "glm-5.3-flash" and url.path.startswith("/raw/zai/"):
            self._reasoning_effort = os.environ.get("LLM__REASONING_EFFORT", "low")
            if self._reasoning_effort not in {"low", "high", "max"}:
                raise LLMError("LLM__REASONING_EFFORT must be low, high or max")
        token = os.environ.get("MEMORY_ELIZA_OAUTH_TOKEN", "").strip()
        if not token or not token.isascii() or not token.isprintable():
            raise LLMError("MEMORY_ELIZA_OAUTH_TOKEN is missing or malformed")
        self._headers = httpx.Headers({"Authorization": f"Bearer {token}"})

    async def complete(self, messages: Sequence[ChatMessage]) -> str:
        payload = {"model": self._model, "messages": list(messages), "stream": False}
        if self._reasoning_effort is not None:
            payload["reasoning_effort"] = self._reasoning_effort
        try:
            response = await self._http.post(
                self._url,
                headers=self._headers,
                json=payload,
                # The reasoning model can take several minutes on a complete timeline.
                timeout=httpx.Timeout(connect=10.0, read=360.0, write=30.0, pool=10.0),
                follow_redirects=False,
            )
        except httpx.RequestError as exc:
            raise LLMError(f"Eliza request failed ({type(exc).__name__})", retryable=True) from None

        if not response.is_success:
            status = response.status_code
            raise LLMError(f"Eliza returned HTTP {status}", retryable=status in {408, 429} or status >= 500)
        try:
            choice = response.json()["choices"][0]
            if choice["finish_reason"] != "stop":
                raise LLMError("Eliza returned an incomplete chat completion")
            content = choice["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError):
            raise LLMError("Eliza returned an invalid chat completion") from None
        if not isinstance(content, str) or not content.strip():
            raise LLMError("Eliza returned an empty chat completion")
        return content
