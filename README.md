# quiz1v1

**Aptitude practice and live 1v1 quiz duels for campus placements and competitive exams.**
Live at [quiz1v1.tech](https://quiz1v1.tech).

Drill quantitative aptitude, data interpretation, verbal ability and reasoning topic by topic, then test your
speed against another student in a live 1v1 duel. Missed questions come back sooner until you answer them right,
and a rating, leagues and a leaderboard keep score.

Built by [Prem2310](https://github.com/Prem2310). Open to contributions: see [CONTRIBUTING.md](CONTRIBUTING.md).

## What is in here

| Path | What it is |
| --- | --- |
| `artifacts/quizit` | The web app: React, Vite, TypeScript, Tailwind, shadcn/ui, wouter, TanStack Query |
| `artifacts/api-server` | The API: FastAPI, SQLAlchemy (SQLite or PostgreSQL), Redis (optional), WebSockets for duels |
| `lib/api-spec` | The OpenAPI spec, the single source of truth for the API |
| `lib/api-client-react`, `lib/api-zod` | Clients and schemas generated from that spec (do not edit by hand) |

Design decisions for the UI live in [`artifacts/quizit/DESIGN.md`](artifacts/quizit/DESIGN.md) and the product intent in
[`artifacts/quizit/PRODUCT.md`](artifacts/quizit/PRODUCT.md).

## Run it locally

You need Node 22 with [pnpm](https://pnpm.io) and Python 3.11+ (with [uv](https://docs.astral.sh/uv/) or pip).

```bash
pnpm install

# API (http://localhost:8000, docs at /api/docs). Uses a local SQLite file when no database is configured.
uv sync                                  # or install the dependencies listed in pyproject.toml
pnpm --filter @workspace/api-server run dev

# Web app (http://localhost:5173), in another terminal
pnpm --filter @workspace/quizit run dev
```

Optional: `python artifacts/api-server/scripts/seed_dev_data.py` seeds a small synthetic question bank so practice and duels work locally (it is not the real IndiaBix import).

### Configuration

Backend, as environment variables (or an `artifacts/api-server/.env` file, which is git-ignored):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` / `SUPABASE_DATABASE_URL` | Database. SQLite by default; set the Supabase/PostgreSQL URL for production |
| `JWT_SECRET` | Secret for signing access tokens. Set it in every deployment: without it the API falls back to an insecure built-in default |
| `REDIS_URL` | Optional. Enables shared duel rooms, caching and the "online now" count across workers |
| `CORS_ORIGINS` | Comma-separated allowed browser origins. Defaults to `https://quiz1v1.tech` and `https://www.quiz1v1.tech` |

Frontend, at build or dev time:

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | Where the API lives (defaults to `http://localhost:8000`) |
| `VITE_SITE_URL` | Public site URL used for the canonical link, share tags and sitemap (defaults to `https://quiz1v1.tech`) |

## Checks

```bash
pnpm run typecheck                        # all TypeScript
pnpm --filter @workspace/quizit run build # production build
cd artifacts/api-server && python -m pytest   # backend tests (throwaway SQLite, never a real database)
```

After changing `lib/api-spec/openapi.yaml`, regenerate the clients with `pnpm --filter @workspace/api-spec run codegen`.

## License

The code in this repository is released under the [MIT License](LICENSE).

**The question content is not covered by that license.** The question bank is sourced from
[IndiaBix](https://www.indiabix.com) and all credit for it belongs to IndiaBix. Check their terms before
redistributing any of that content.
