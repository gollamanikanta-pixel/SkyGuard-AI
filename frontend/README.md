# SkyGuard AI frontend

The frontend is a Vite, React, TypeScript, and React Router application.

## Development

Use Node.js 20.19+ or 22.12+ and npm:

```powershell
npm install
npm run dev
```

Vite serves the app at <http://localhost:3000>. Start the FastAPI backend separately at <http://localhost:8000>.

If the API runs at a different address, copy `.env.local.example` to `.env.local` and set `VITE_API_BASE_URL` to the backend's reachable URL. The Supabase project URL is not the FastAPI API URL.

## Checks

```powershell
npm run build
npm run lint
```
