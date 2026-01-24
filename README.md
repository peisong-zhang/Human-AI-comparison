# Human–AI Comparison Experiment Platform

This repository provides a full-stack web application for running binary decision
experiments that compare human clinicians with AI support. Participants review
patient-case images, respond ✔/✘, and the system captures detailed timing and
metadata. The stack is **FastAPI + SQLite** on the backend and **React + Vite +
TailwindCSS** on the frontend.

## Features
- Multi-stage experiments with group-specific sequences, role-aware quotas, and per-item timing (soft/hard timeouts).
- Required participant login fields (ID, role, group), group confirmation, and start checklist guidance.
- Bilingual UI with language toggle and language-specific image sets via `image_dirs`.
- Floating Task Instructions panel that pauses timers while open.
- Skip support with prioritized "next unfinished" navigation and keyboard shortcuts (Y/N/S/←/→).
- Global + per-item timers, progress indicators, and summary page metrics.
- Detailed record storage (`sessions`, `records`, `items`) including timestamps, IP hash, and user agent.
- Optional auto CSV snapshots, CSV export endpoint with filters, and database snapshot download.
- Optional Google Sheets export with header auto-write and row upsert to prevent duplicate answers.
- Admin utilities to clear the database and/or configured Google Sheet.

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
export EXPERIMENT_AUTO_EXPORT_DIR=./exports
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
- Application settings live in `config/experiment.json`. Define subsets, multi-stage group sequences,
  timing rules, and markdown instructions here.
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
| `/api/quota_status` | GET | Returns completed-session counts and remaining quota per group for a participant role. |
| `/api/export/csv` | GET | Streams CSV of records (optional filters: `group_id`, `mode_id`, `session_id`). |
| `/api/export/db` | GET | Downloads a consistent SQLite snapshot of the experiment database. |
| `/images/{mode}/{filename}` | GET | Serves static case images for the requested mode. |
| `/admin/clear_google_sheet` | POST | Clears the configured Google Sheet and rewrites the header row. |
| `/admin/clear_db` | POST | Clears all `items`, `records`, and `sessions` from the database. |

---

## Frontend Highlights
- Home/Login screen with required ID/role/group, quota visibility, and confirmation checklist.
- Task workspace with bilingual toggle, image language switching, timers, skip navigation, and case progress.
- Optional localStorage resume (disabled when `allow_resume=false`).
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

## Render Persistent Disk (SQLite + CSV exports)
If you deploy on Render and want SQLite + CSV exports to persist across deploys,
attach a Persistent Disk (e.g. mount path `/var/data`) and set:

```bash
EXPERIMENT_DATABASE_URL=sqlite:////var/data/experiment.db
EXPERIMENT_AUTO_EXPORT_DIR=/var/data/exports
```

This ensures the database and auto-exported CSV files live on the persistent disk.

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
