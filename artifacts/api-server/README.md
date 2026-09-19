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