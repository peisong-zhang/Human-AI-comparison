# Human–AI Comparison Experiment Platform

This repository provides a full-stack web application for running binary decision
experiments that compare human clinicians with AI support. Participants review
patient-case images, respond ✔/✘, and the system captures detailed timing and
metadata. The stack is **FastAPI + SQLite** on the backend and **React + Vite +
TailwindCSS** on the frontend.

## Features
- Multi-mode experiments (e.g. Standard vs. AI-Human comparison) with per-mode image pools.
- Participant grouping with configurable timers (soft or hard item timeouts).
- Global and per-item timing, keyboard shortcuts (Y/N/S/←/→), auto-save + resume.
- Detailed record storage (`sessions`, `records`, `items`) including timestamps, IP hash, and user agent.
- CSV export endpoint with optional filters.
- Responsive UI with instructions panel, timers, progress, and session summary dashboard.

---

## Quick Start with Docker

1. Ensure Docker (and optionally Docker Compose v2) is installed.
2. From the repository root run:
   ```bash
   docker-compose up --build
   ```
3. Access the UI at http://localhost:5173  
   Backend API is served at http://localhost:8000.

The compose file mounts `config/` and `data/` so you can tweak settings or add images without rebuilding.

---

## Manual Setup

### Backend (FastAPI)
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

export EXPERIMENT_CONFIG_PATH=config/experiment.json
export EXPERIMENT_DATABASE_URL=sqlite:///./backend/app/experiment.db
uvicorn app.main:app --reload --app-dir backend/app
```
The API will listen on `http://127.0.0.1:8000`.

### Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev -- --host
```
Visit http://127.0.0.1:5173. During development the Vite dev server proxies `/api` and `/images`
requests to the backend running on port 8000.

---

## Configuration & Data
- Application settings live in `config/experiment.json`. Define subsets、multi-stage group sequences、
  参与者角色列表、时间限制以及指南文案都在这里配置。
- Place case images inside the subset directories (e.g. `data/cases/subset_a/`, `data/cases/subset_b/`).
  Filenames (without extension) become `image_id`s. When AI interpretation is needed, bake the
  overlay/text into the image itself—no separate hint files are required.
- Update the JSON config if you introduce new modes, subsets, or relocate image directories.
- On startup the backend generates/updates `backend/app/experiment.db` (SQLite).
- Every response (and session finish) automatically writes CSV exports under
  `exports/records_<participant>_<mode>.csv` and a consolidated `records_<participant>.csv`. Override
  the base name with `EXPERIMENT_AUTO_EXPORT_FILENAME`, directory with `EXPERIMENT_AUTO_EXPORT_DIR`,
  or disable via `EXPERIMENT_AUTO_EXPORT_ENABLED=false`.

---

## API Overview
| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/config` | GET | Returns experiment configuration and image manifest. |
| `/api/session/start` | POST | Starts or resumes a participant session (payload: participant_id, group_id). |
| `/api/record` | POST | Records a single response with timestamps and metadata. |
| `/api/session/finish` | POST | Marks the session as complete, storing total elapsed time. |
| `/api/export/csv` | GET | Streams CSV of records (optional filters: `group_id`, `mode_id`, `session_id`). |
| `/images/{mode}/{filename}` | GET | Serves static case images for the requested mode. |

---

## Frontend Highlights
- Home/Login screen for participant auth and mode selection.
- Task workspace with responsive layout, timers, keyboard shortcuts, skip support, and case progress.
- Auto-save to `localStorage` enabling resume if the browser refreshes or closes.
- Summary page listing per-item metrics, aggregated stats, and per-session CSV download.

---

## Project Structure
```
backend/         FastAPI app, models, schemas, Dockerfile
frontend/        React + Vite client, Tailwind config, Dockerfile
config/          Experiment configuration JSON
data/            Image folders per mode (see data/README.md)
docker-compose.yml
```

---

## Next Steps & Suggestions
1. Replace placeholder images with real case data under `data/cases/*`.
2. Harden security: generate a unique `EXPERIMENT_IP_HASH_SECRET`, add auth to export endpoints.
3. Add automated tests (Pytest + React Testing Library) and CI pipeline.
4. Extend analytics (per-image heatmaps, dashboard) and integrate with an external database (PostgreSQL).

---

## License
This project is provided as an experiment scaffold. Adapt licensing, privacy, and consent
language to match your institution's requirements.
