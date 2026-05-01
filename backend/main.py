import json
import os
from pathlib import Path

import aiofiles
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
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

OUTPUTS_DIR = Path("outputs")
OUTPUTS_DIR.mkdir(exist_ok=True)

# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


@app.get("/files/{session_id}")
async def list_files(session_id: str):
    """List generated files for a session."""
    session_dir = OUTPUTS_DIR / session_id
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
    file_path = OUTPUTS_DIR / session_id / filename
    if not file_path.exists() or not file_path.is_file():
        return JSONResponse({"error": "File not found"}, status_code=404)
    return FileResponse(str(file_path), filename=filename)


# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
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
