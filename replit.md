# quiz1v1 Backend

FastAPI backend for competitive aptitude practice, personalized quiz sessions, analytics, and real-time quiz rooms.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the FastAPI server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `cd artifacts/api-server && alembic upgrade head` — apply the database migration
- Required env: `SUPABASE_DATABASE_URL` — PostgreSQL/Supabase connection string; local development defaults to SQLite
- Optional env: `JWT_SECRET` (falls back to the existing `SESSION_SECRET`), `REDIS_URL`, `CORS_ORIGINS`, `COOKIE_SECURE`

## Stack

- Python 3.11, FastAPI, Pydantic v2
- Database: PostgreSQL/Supabase with SQLAlchemy 2.x and Alembic
- Redis: optional async Redis broker for real-time rooms
- Authentication: application-owned JWT tokens in an HTTP-only cookie or bearer header

## Where things live

- `artifacts/api-server/app/main.py` — FastAPI application and lifecycle
- `artifacts/api-server/app/models.py` — SQLAlchemy mapping for the existing quiz1v1 tables
- `artifacts/api-server/app/routers/` — auth, catalog, quizzes, analytics, health, and room routes
- `artifacts/api-server/alembic/versions/0001_quizit_core.py` — initial schema migration for a fresh database

## Architecture decisions

- The supplied database contract is preserved through the existing table names and core column names.
- Supabase is treated as PostgreSQL only; Supabase Auth is intentionally not used.
- SQLite is the local default so the service can boot without external infrastructure; PostgreSQL is selected through `DATABASE_URL`.
- Redis is optional for local development and becomes the cross-process room broker when `REDIS_URL` is configured.

## Product

quiz1v1 supports account registration/login, topic and question discovery, practice and competitive quiz creation, answer submission, scoring, personal analytics, leaderboards, and authenticated WebSocket rooms.

## User preferences

The backend should remain compatible with the existing React frontend and avoid unnecessary frontend rewrites.

## Gotchas

- Set a strong `JWT_SECRET` in non-development environments.
- Use `postgresql+asyncpg://` or a standard `postgresql://` URL; the app normalizes the latter automatically.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
