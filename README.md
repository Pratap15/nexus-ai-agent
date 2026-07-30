# NEXUS AI Agent

NEXUS is a full-stack autonomous AI agent application built with **FastAPI** (backend) and **React** (frontend).

## Features

- 🔍 **Multi-step web research** – DuckDuckGo search with no API key required
- 🧠 **Autonomous ReAct reasoning loop** – the agent plans, searches, acts, and reflects
- 💻 **File generation** – produces CSV, Markdown, Python, JSON, and TXT files
- 📡 **Real-time streaming** – WebSocket-based token-by-token response streaming
- ⬇️ **File download panel** – generated files appear instantly and can be downloaded
- 🌗 **Dark / light theme** – ChatGPT-style modern UI with sidebar and output panel
- 🤖 **Multi-provider AI** – NVIDIA Inference API (primary) or OpenAI API (fallback)

---

## Project Structure

```
nexus-ai-agent/
├── backend/
│   ├── main.py          # FastAPI app, WebSocket + REST endpoints
│   ├── agent.py         # Autonomous ReAct agent loop
│   ├── tools.py         # DuckDuckGo search + file creation utilities
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx            # Root layout & WebSocket manager
│   │   ├── App.css            # Dark/light theme CSS variables
│   │   └── components/
│   │       ├── Sidebar.jsx        # Session history
│   │       ├── ChatArea.jsx       # Message list + task input
│   │       ├── MessageBubble.jsx  # Typed message rendering
│   │       ├── OutputPanel.jsx    # Generated file downloads
│   │       └── ThinkingIndicator.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── .env.example
└── README.md
```

---

## Quick Start

### 1. Configure API Keys

```bash
cp .env.example backend/.env
# Edit backend/.env and add your NVIDIA_API_KEY or OPENAI_API_KEY
```

Get a free NVIDIA API key at <https://build.nvidia.com/>.

### 2. Start the Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The API will be available at <http://localhost:8000>.

### 3. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:3000> in your browser.

### 4. Demo Mode

If no API key is configured, NEXUS runs in **demo mode** – it simulates an AI response and creates a sample file so you can explore the UI without any credentials.

---

## WebSocket Protocol

The frontend opens a WebSocket connection to `/ws/{session_id}`.

**Client → Server:**
```json
{ "type": "task", "content": "Research the latest AI trends" }
```

**Server → Client event types:**

| Type | Description |
|---|---|
| `agent_start` | Agent begins processing |
| `thinking` | Step N reasoning notification |
| `stream_start` / `stream_chunk` / `stream_end` | LLM token stream |
| `tool_use` | Search or file-creation action |
| `file_created` | A file was generated |
| `agent_finish` | Task complete + summary |
| `agent_done` | All done, agent idle |
| `warning` / `error` | Diagnostic messages |

---

## REST Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/files/{session_id}` | List generated files |
| GET | `/files/{session_id}/{filename}` | Download a file |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11+, FastAPI, Uvicorn, httpx |
| AI | NVIDIA Inference API / OpenAI API (streaming) |
| Search | DuckDuckGo Search (no API key) |
| Frontend | React 18, Vite, plain CSS |
| Realtime | WebSockets (native browser API) |
