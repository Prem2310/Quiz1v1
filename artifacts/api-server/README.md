# quiz1v1 API

FastAPI backend for quiz1v1, a competitive aptitude practice platform.

## Run

The workspace workflow starts the API on the configured port:

```bash
pnpm --filter @workspace/api-server run dev
```

For a PostgreSQL/Supabase database, set the secure `SUPABASE_DATABASE_URL` secret to a standard
`postgresql://...` or async SQLAlchemy URL such as `postgresql+asyncpg://...`. The backend prefers
this secret over the runtime-managed `DATABASE_URL`. Set `JWT_SECRET` and optionally `REDIS_URL`
in the environment.

The API is mounted at `/api`. Interactive OpenAPI docs are available at `/api/docs`.

## Core endpoints

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/topics`, `GET /api/topics/{topic_id}/subtopics`
- `GET /api/questions`
- `POST /api/quizzes`, `POST /api/quizzes/{quiz_id}/start`
- `POST /api/quizzes/attempts/{attempt_id}/responses`
- `POST /api/quizzes/attempts/{attempt_id}/complete`
- `GET /api/analytics/me`, `GET /api/analytics/leaderboard`
- `WS /api/ws/rooms/{room_id}?token=<jwt>`

Use Alembic for a production schema:

```bash
cd artifacts/api-server
alembic upgrade head
```

## Google and GitHub sign-in

The API runs the OAuth authorization-code flow itself (`app/core/oauth.py`, routes in `app/routers/auth.py`). A provider
is offered on the login page only when both its id and secret are set, so nothing shows until you configure it.

| Env var | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud Console > APIs & Services > Credentials > OAuth client ID (Web application) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub > Settings > Developer settings > OAuth Apps |
| `FRONTEND_URL` | Where the browser lands after sign-in (default `https://quiz1v1.tech`) |
| `API_PUBLIC_URL` | This API's public origin, used to build the redirect URI (falls back to the request's origin) |

Register this **authorization callback URL** with each provider (one per environment):

- Production: `https://<api-host>/api/auth/oauth/google/callback` and `.../github/callback`
- Local: `http://localhost:8000/api/auth/oauth/google/callback` and `.../github/callback`

Behind a proxy, set `API_PUBLIC_URL` so the redirect URI is `https`, exactly as registered.

Accounts: the same provider account always signs into the same user. A provider-**verified** email that matches an
existing account links to it; otherwise a new account is created (no password, so email/password login is refused for it).
Emails the provider has not verified are rejected.

Existing databases need the new columns before this code is deployed:
`python scripts/ensure_oauth_columns.py` (PostgreSQL, idempotent). Local SQLite: delete `quizit.db` and restart.

## College list

Profile and signup pick a college from a shared list (`GET /api/colleges?q=`, words matched in any order). The list is
seeded from `app/data/colleges_in.txt` (Hipo/university-domains-list, MIT, plus a few well-known institutions it lacks):

`python scripts/seed_colleges.py` creates the `college` table if it is missing and adds any college not yet listed. It is
idempotent and works on PostgreSQL and SQLite.

A student whose college isn't listed types it under "My college isn't listed". Saving the profile (or signing up) adds
it to the list, and every save stores the *listed* spelling, so "IIT  delhi" and "iit Delhi" are one college and land on
the same college leaderboard. User-added rows have `source = 'user'` if you ever need to review or merge them.
