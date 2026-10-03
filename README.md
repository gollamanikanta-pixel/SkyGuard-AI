# SkyGuard AI

SkyGuard AI is a full-stack weather trust and anomaly intelligence dashboard for Automatic Weather Stations (AWS). It is built for disaster-management and operational monitoring use cases and combines validation, temporal reasoning, spatial consensus, sensor-health scoring, and ML-based anomaly detection into a single explainable decision engine.

## Overview

The system is designed to help operators answer a simple but critical question:

"Is this AWS reading trustworthy, or is it a sensor fault, data-quality issue, or genuine regional weather event?"

The app uses deterministic simulation data in demo mode so it can run locally without API keys. It calculates dynamic trust scores, anomaly classifications, and recommended actions in real time.

## Problem statement

The project addresses the SIH 2026 requirement for AWS anomaly detection in disaster-management workflows. The goal is to detect inconsistencies in weather station observations, explain why a station may be unreliable, and help emergency planners separate real regional weather events from isolated sensor problems.

## Solution summary

SkyGuard AI provides:

- Simulated AWS station network with historical readings
- On-demand Open-Meteo current-condition references for the demo station coordinates; these are model estimates, not AWS sensor measurements
- Data validation for range, missing, frozen, duplicate, delayed, and sudden-change events
- Temporal and multi-parameter consistency checks
- Nearby-station consensus analysis for spatial evidence
- Isolation Forest algorithm for anomaly detection
- TrustFusion score engine combining all evidence sources
- Explainable AI output and maintenance recommendations
- Alert workflow for suspicious readings
- Dashboard, analytics, and risk monitoring views

## Features

- Interactive dashboard for all stations and operational health
- Station map and network overview
- Trust and sensor-health scoring
- Anomaly classification and explainable recommendations
- Demo scenarios: normal, heatwave, sensor fault, frozen sensor, missing data, degradation
- Alert center with server-side filtering, paginated history, severity, and status handling
- FastAPI backend with OpenAPI docs
- Vite + React Router + Tailwind frontend
- Persistent SQLite local mode and Supabase PostgreSQL connection support
- External provider references stored separately from simulated station observations and scoring

The dashboard remains in demo mode by default. Use **Fetch current conditions** on the dashboard to retrieve an attributed Open-Meteo reference for each demo station location. These model-based conditions do not replace or validate station telemetry and do not affect TrustFusion scores, sensor-health scores, or alerts. Open-Meteo usage is subject to its current terms and fair-use limits.

## Architecture

- Frontend: React, TypeScript, Vite, React Router, Tailwind CSS, Recharts, Leaflet
- Backend: Python, FastAPI, Pydantic, Pandas, NumPy, scikit-learn
- Data layer: SQLite for local development, with Supabase PostgreSQL support when configured
- AI/ML: Isolation Forest + rule-based evidence fusion

## Project structure

```text
skyguard-ai/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── engine.py
│   │   ├── config.py
│   │   └── ...
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── package.json
├── README.md
├── .env.example
├── .env.local.example
├── .gitignore
└── vercel.json
```

## Requirements

- Node.js 20.19+ or 22.12+
- Python 3.12+
- npm
- pip

## Quick start (Windows)

### 1. Backend

For local SQLite mode, no database credentials are needed. To use the Supabase project as the primary database, copy `.env.example` to `.env`, set `DATABASE_BACKEND=supabase`, and set `SUPABASE_DB_PASSWORD` from **Project Settings → Database**. The backend derives the direct PostgreSQL host from `SUPABASE_URL` and requires SSL. Never commit `.env` or paste the database password into source code. If your network requires Supabase's connection pooler, set `SUPABASE_DB_URL` to the pooler URI shown by Supabase. SQLAlchemy creates the prototype tables on startup.

```powershell
cd c:\MyProjects\SkyGuard AI\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Frontend

Open a second terminal:

```powershell
cd c:\MyProjects\SkyGuard AI\frontend
npm install
npm run dev
```

Then open:

- http://localhost:3000
- API docs: http://localhost:8000/docs

If needed, copy `frontend\.env.local.example` to `frontend\.env.local` and update `VITE_API_BASE_URL` to the backend's reachable URL. The Supabase project URL is not the API URL; the FastAPI backend must be running or deployed separately.

### Using hosted Supabase

The app uses SQLite locally by default. To use the configured Supabase project, copy the root `.env.example` to `.env`, set `DATABASE_BACKEND=supabase`, and add the database password privately from the Supabase dashboard (or configure `SUPABASE_DB_URL` with the Supabase pooler connection string). Restart the backend after changing `.env`. Do not commit `.env` or share the database password.

### Deploying the full app to Vercel with Supabase

The repository is configured for a single Vercel FastAPI deployment: the FastAPI framework preset uses the entrypoint in `pyproject.toml`, Vite builds the frontend into `frontend/dist`, and FastAPI serves that build through `app.frontend()`. Supabase remains the persistent PostgreSQL database. Deploy the project with the repository root as Vercel's Root Directory; do not set it to `frontend`.

Set these environment variables in Vercel's Project Settings → Environment Variables, at least for Production:

```text
APP_ENV=production
DATABASE_BACKEND=supabase
SUPABASE_DB_URL=<Supabase Session pooler URI>
```

Copy the Session pooler URI from Supabase Project Settings → Database → Connection string. Enter it directly into Vercel's protected environment-variable form; do not add it to a source file, build argument, or Git commit. Do not set `VITE_API_BASE_URL` for the single-domain deployment—the built frontend uses same-origin `/api/...` routes.

Connect this repository to Vercel from its root directory and deploy. After deployment, verify `/api/health`, the dashboard, scenario runs, and the Open-Meteo reference panel. Vercel Functions are serverless; continuous monitoring depends on an individual function instance and should not be treated as an always-on production data-ingestion worker.

After each deployment, verify that `/api/health` returns `status: "ok"`, `/api/v1/dashboard` returns a dashboard summary and station list, and the dashboard and analytics pages finish loading. A health response with `mode: "simulated"` means the app is serving demo observations, not live station measurements; connecting a real station feed and an always-on ingestion service is a separate deployment requirement.

## Demo workflow

The app runs in demo mode by default and does not require external provider credentials.

Recommended demo flow:

1. Open the overview dashboard.
2. Inspect the station map and system summary cards.
3. Review active alerts and trust scores.
4. Open the simulation page.
5. Run scenarios such as heatwave, sensor-fault, and frozen-sensor events.
6. Compare nearby stations and explain why a reading was classified as a fault or weather event.
7. Review analytics and settings.

## Demo scenarios included

- Normal conditions
- Heatwave
- Sensor fault
- Frozen sensor
- Missing data
- Gradual degradation

## API documentation

FastAPI automatically provides interactive API docs at:

- http://localhost:8000/docs
- http://localhost:8000/redoc

## Validation and tests

Backend tests can be run with:

```powershell
cd c:\MyProjects\SkyGuard AI\backend
python -m pytest -q
```

Current project validation status:

- Backend tests pass
- Frontend production build and lint pass

## Security notes

- Keep database passwords and API tokens in the ignored `.env` file; sample files are configuration templates.
- Supabase database credentials are read by the backend and must never be exposed through frontend environment variables.
- The API allows local development origins and does not implement user authentication; add authenticated access and production CORS rules before public deployment.

## Limitations

This is a local hackathon prototype and intentionally uses simulated data. It is not a production weather ingest platform or a real-time IMD feed replacement. The scores are explainable prototype indicators, not scientific certifications.

## Future enhancements

- Real weather API integration
- Versioned database migrations for hosted upgrades
- User authentication and role-based access
- More advanced forecasting and model tuning
- Real-time WebSocket monitoring for live station streams


## License

MIT
