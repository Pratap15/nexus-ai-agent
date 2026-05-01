import asyncio
import aiofiles
from pathlib import Path


async def search_web(query: str) -> str:
    """Search the web using DuckDuckGo (no API key required)."""
    try:
        from duckduckgo_search import DDGS

        results = []
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=5):
                results.append(
                    f"Title: {r['title']}\nURL: {r['href']}\nSummary: {r['body']}\n"
                )
        return "\n---\n".join(results) if results else "No results found."
    except Exception as e:
        return f"Search error: {str(e)}"


async def create_output_file(session_dir: Path, filename: str, content: str) -> Path:
    """Write content to a file inside the session directory."""
    # Sanitise filename – only allow safe characters
    safe_name = "".join(c for c in filename if c.isalnum() or c in "._- ")
    safe_name = safe_name.strip().replace(" ", "_") or "output.txt"

    file_path = session_dir / safe_name
    async with aiofiles.open(file_path, "w", encoding="utf-8") as f:
        await f.write(content)
    return file_path
