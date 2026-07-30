import asyncio
import json
import os
import re
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import WebSocket

from tools import create_output_file, search_web

load_dotenv()

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
OPENAI_BASE_URL = "https://api.openai.com/v1"
MAX_STEPS = 10
OUTPUTS_DIR = Path("outputs")

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """You are NEXUS, an advanced autonomous AI research agent.
You process tasks methodically using the tools described below.

AVAILABLE ACTIONS (use exact XML tags):
1. Web search      → <search>your search query</search>
2. Create a file   → <create_file name="filename.ext">file content</create_file>
3. Final answer    → <finish>your comprehensive summary</finish>

RULES:
- Think step by step before acting.
- Use <search> to obtain current information when needed.
- Use <create_file> to persist results. Choose the right extension:
    .csv  → tabular data
    .md   → reports / documentation
    .txt  → plain text
    .py   → Python code
    .json → structured JSON
- End every task with <finish>.
- Be thorough, accurate, and professional.
- Create files whenever the user asks for data, reports, or code output.
"""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _send(websocket: WebSocket, msg_type: str, content: str, **kwargs):
    payload = {"type": msg_type, "content": content, **kwargs}
    await websocket.send_text(json.dumps(payload))


def _parse_actions(text: str) -> list:
    """Extract all action tags from an LLM response.

    Patterns use non-backtracking alternation instead of ``.*?`` with
    ``re.DOTALL`` to avoid polynomial/exponential ReDoS when the closing tag
    is absent or the input is adversarially crafted.
    """
    actions = []

    # ``(?:[^<]|<(?!/search>))*``  matches anything that is not the start of
    # ``</search>``, preventing catastrophic backtracking.
    _search_re = re.compile(
        r"<search>((?:[^<]|<(?!/search>))*)</search>", re.IGNORECASE
    )
    _file_re = re.compile(
        r'<create_file name="([^"]{1,200})">'
        r"((?:[^<]|<(?!/create_file))*)"
        r"</create_file>",
        re.IGNORECASE,
    )
    _finish_re = re.compile(
        r"<finish>((?:[^<]|<(?!/finish>))*)</finish>", re.IGNORECASE
    )

    for m in _search_re.finditer(text):
        actions.append({"type": "search", "query": m.group(1).strip()})

    for m in _file_re.finditer(text):
        actions.append(
            {
                "type": "create_file",
                "name": m.group(1).strip(),
                "content": m.group(2).strip(),
            }
        )

    m = _finish_re.search(text)
    if m:
        actions.append({"type": "finish", "summary": m.group(1).strip()})

    return actions


# ---------------------------------------------------------------------------
# LLM integration
# ---------------------------------------------------------------------------


async def _call_llm_stream(
    messages: list, websocket: WebSocket, step: int
) -> str:
    """Call the configured LLM with streaming; returns the full response."""

    if NVIDIA_API_KEY:
        api_key = NVIDIA_API_KEY
        base_url = NVIDIA_BASE_URL
        model = "meta/llama-3.3-70b-instruct"
    elif OPENAI_API_KEY:
        api_key = OPENAI_API_KEY
        base_url = OPENAI_BASE_URL
        model = "gpt-4o-mini"
    else:
        await _send(
            websocket,
            "warning",
            "No API key configured – running in demo mode. "
            "Set NVIDIA_API_KEY or OPENAI_API_KEY to enable real AI.",
        )
        return await _demo_response(messages, websocket)

    await _send(websocket, "thinking", f"Step {step + 1}: reasoning …")
    full_response = ""

    async with httpx.AsyncClient(timeout=90.0) as client:
        async with client.stream(
            "POST",
            f"{base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": messages,
                "stream": True,
                "temperature": 0.7,
                "max_tokens": 2048,
            },
        ) as response:
            if response.status_code != 200:
                body = await response.aread()
                raise RuntimeError(
                    f"LLM API error {response.status_code}: {body.decode()}"
                )

            await _send(websocket, "stream_start", "")

            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data = line[6:]
                    if data == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                        delta = chunk["choices"][0]["delta"].get("content", "")
                        if delta:
                            full_response += delta
                            await websocket.send_text(
                                json.dumps(
                                    {"type": "stream_chunk", "content": delta}
                                )
                            )
                    except (json.JSONDecodeError, KeyError):
                        continue

    await _send(websocket, "stream_end", "")
    return full_response


async def _demo_response(messages: list, websocket: WebSocket) -> str:
    """Simulated agent response when no API key is available (demo mode)."""
    last_user = next(
        (m["content"] for m in reversed(messages) if m["role"] == "user"), "a task"
    )
    task = last_user.replace("Task:", "").replace(
        "\n\nPlease complete this task using available tools.", ""
    ).strip()

    response = (
        f"I'll research: **{task}**\n\n"
        f"<search>{task} overview 2024</search>\n\n"
        f"Based on the search results I'll compile a report.\n\n"
        f'<create_file name="report.md">\n'
        f"# Research Report: {task}\n\n"
        f"## Overview\n"
        f"This report was generated by NEXUS AI Agent in demo mode.\n\n"
        f"## Key Findings\n"
        f"- Finding 1: Relevant insight about {task}\n"
        f"- Finding 2: Additional information\n"
        f"- Finding 3: Supporting evidence\n\n"
        f"## Conclusion\n"
        f"The research demonstrates NEXUS's file generation capabilities.\n"
        f"Configure NVIDIA_API_KEY or OPENAI_API_KEY for real AI responses.\n"
        f"</create_file>\n\n"
        f"<finish>\n"
        f"Task completed in demo mode. A markdown report has been created.\n"
        f"Set NVIDIA_API_KEY or OPENAI_API_KEY in the .env file to enable "
        f"real AI-powered responses.\n"
        f"</finish>"
    )

    await _send(websocket, "stream_start", "")
    for char in response:
        await websocket.send_text(
            json.dumps({"type": "stream_chunk", "content": char})
        )
        await asyncio.sleep(0.008)
    await _send(websocket, "stream_end", "")
    return response


# ---------------------------------------------------------------------------
# Main agent loop
# ---------------------------------------------------------------------------


async def run_agent(task: str, websocket: WebSocket, session_id: str):
    """ReAct-style autonomous agent loop."""

    await _send(websocket, "agent_start", f"NEXUS agent starting …")

    session_dir = OUTPUTS_DIR / session_id
    session_dir.mkdir(parents=True, exist_ok=True)

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"Task: {task}\n\n"
                "Please complete this task using available tools."
            ),
        },
    ]

    files_created: list[str] = []
    finished = False

    for step in range(MAX_STEPS):
        # ── LLM call ──────────────────────────────────────────────────────
        try:
            response = await _call_llm_stream(messages, websocket, step)
        except Exception as exc:
            await _send(websocket, "error", f"LLM error: {exc}")
            break

        messages.append({"role": "assistant", "content": response})

        # ── Parse actions ─────────────────────────────────────────────────
        actions = _parse_actions(response)

        if not actions:
            # No structured actions – treat as a natural-language reply
            await _send(websocket, "step_complete", f"Step {step + 1} done.")
            break

        for action in actions:
            if action["type"] == "search":
                query = action["query"]
                await _send(
                    websocket,
                    "tool_use",
                    f"Searching: {query}",
                    tool="search",
                    query=query,
                )
                results = await search_web(query)
                await _send(websocket, "tool_result", results, tool="search")
                messages.append(
                    {
                        "role": "user",
                        "content": (
                            f"[Search results for '{query}']:\n{results}"
                        ),
                    }
                )

            elif action["type"] == "create_file":
                fname = action["name"]
                content = action["content"]
                await _send(
                    websocket,
                    "tool_use",
                    f"Creating file: {fname}",
                    tool="create_file",
                    filename=fname,
                )
                await create_output_file(session_dir, fname, content)
                files_created.append(fname)
                await _send(
                    websocket,
                    "file_created",
                    fname,
                    filename=fname,
                    download_url=f"/files/{session_id}/{fname}",
                )
                messages.append(
                    {
                        "role": "user",
                        "content": f"File '{fname}' created successfully.",
                    }
                )

            elif action["type"] == "finish":
                await _send(
                    websocket,
                    "agent_finish",
                    action["summary"],
                    files=files_created,
                )
                finished = True
                break

        if finished:
            break

        # Prompt continuation if not yet finished
        if step < MAX_STEPS - 1:
            messages.append(
                {
                    "role": "user",
                    "content": (
                        "Continue with the next step. "
                        "Use <finish> when the task is fully complete."
                    ),
                }
            )
    else:
        await _send(
            websocket,
            "agent_finish",
            "Task completed (maximum steps reached).",
            files=files_created,
        )

    await _send(websocket, "agent_done", "Done.", files=files_created)
