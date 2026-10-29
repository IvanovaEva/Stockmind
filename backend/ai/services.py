import logging

from django.conf import settings
from groq import Groq

logger = logging.getLogger(__name__)

DEFAULT_MODEL = getattr(settings, "GROQ_MODEL", "openai/gpt-oss-120b")


class LLMService:
    """Thin wrapper around the Groq client with sensible defaults."""

    def __init__(self):
        if not settings.GROQ_API_KEY:
            raise RuntimeError("GROQ_API_KEY is not configured in environment")
        self.client = Groq(api_key=settings.GROQ_API_KEY)

    def complete(
        self,
        messages,
        *,
        max_tokens=500,
        temperature=0.7,
        response_format=None,
    ):
        """Single-turn completion. Returns the response text."""
        kwargs = {
            "model": DEFAULT_MODEL,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if response_format:
            kwargs["response_format"] = response_format
        if "gpt-oss" in DEFAULT_MODEL:
            kwargs["extra_body"] = {"reasoning_effort": "low"}
        response = self.client.chat.completions.create(**kwargs)
        return response.choices[0].message.content or ""

    def complete_with_tools(
        self,
        messages,
        tools,
        *,
        max_tokens=1000,
        temperature=0.3,
    ):
        """Tool-calling completion. Returns the raw response (caller handles tool_calls)."""
        return self.client.chat.completions.create(
            model=DEFAULT_MODEL,
            messages=messages,
            tools=tools,
            tool_choice="auto",
            max_tokens=max_tokens,
            temperature=temperature,
        )
