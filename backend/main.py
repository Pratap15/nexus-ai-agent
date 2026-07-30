import json
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from agent import run_agent

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="NEXUS AI Agent", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OUTPUTS_DIR = Path("outputs").resolve()
OUTPUTS_DIR.mkdir(exist_ok=True)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_SAFE_ID_RE = __import__("re").compile(r"^[A-Za-z0-9_\-]{1,80}$")


def _validate_id(value: str, label: str) -> None:
    """Reject path-traversal attempts in session IDs and filenames."""
    if not _SAFE_ID_RE.match(value):
        raise HTTPException(status_code=400, detail=f"Invalid {label}")


def _safe_session_dir(session_id: str) -> Path:
    _validate_id(session_id, "session_id")
    path = (OUTPUTS_DIR / session_id).resolve()
    if not str(path).startswith(str(OUTPUTS_DIR)):
        raise HTTPException(status_code=400, detail="Invalid session_id")
    return path


def _safe_file_path(session_id: str, filename: str) -> Path:
    session_dir = _safe_session_dir(session_id)
    # Validate filename separately
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    path = (session_dir / filename).resolve()
    if not str(path).startswith(str(session_dir)):
        raise HTTPException(status_code=400, detail="Invalid filename")
    return path


# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


@app.get("/files/{session_id}")
async def list_files(session_id: str):
    """List generated files for a session."""
    session_dir = _safe_session_dir(session_id)
    if not session_dir.exists():
        return JSONResponse({"files": []})

    files = []
    for f in sorted(session_dir.iterdir()):
        if f.is_file():
            files.append(
                {
                    "name": f.name,
                    "size": f.stat().st_size,
                    "ext": f.suffix.lstrip(".") or "txt",
                }
            )
    return JSONResponse({"files": files})


@app.get("/files/{session_id}/{filename}")
async def download_file(session_id: str, filename: str):
    """Download a generated file."""
    file_path = _safe_file_path(session_id, filename)
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(file_path), filename=filename)


# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    # Validate session_id before accepting; reject if invalid
    if not _SAFE_ID_RE.match(session_id):
        await websocket.close(code=4000)
        return

    await websocket.accept()
    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)

            if msg.get("type") == "task":
                task = msg.get("content", "").strip()
                if task:
                    await run_agent(task, websocket, session_id)
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        try:
            await websocket.send_text(
                json.dumps({"type": "error", "content": str(exc)})
            )
        except Exception:
            pass
