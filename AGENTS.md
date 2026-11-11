# Agent Guide

## Project overview

Retro Board & Sprint Poker is a Next.js 16 App Router application using React 19 and strict TypeScript. It supports collaborative retrospectives, planning poker, anonymous participants, and TrackLin.es integrations.

- Authentication: Clerk, plus cookie-based anonymous sessions.
- Persistence: PostgreSQL through the server-side query builder in `src/lib/db/index.ts`.
- Realtime: authenticated SSE backed by Redis/Valkey streams.
- UI: Tailwind CSS 4, shadcn/Radix components, and dnd-kit.
- Client state: TanStack Query and Zustand.

## Setup and commands

Use Bun: CI and Docker pin Bun 1.3.14 and install from `bun.lock`. Although `package.json` still declares pnpm and `CLAUDE.md` uses pnpm commands, the current README, CI, and Docker workflows use Bun. Keep dependency changes consistent with `bun.lock`.

Local setup:

```sh
cp .env.example .env
# Configure Clerk keys and local service URLs in .env.
docker compose up -d --wait
bun install --frozen-lockfile
bun run db:migrate
bun run dev
```

The development app uses port 3000 by default. Compose exposes PostgreSQL on localhost:55432 and Redis on localhost:56379. The optional `app` Compose profile builds and runs the application like production.

Available checks:

| Command | Purpose |
| --- | --- |
| `bun run typecheck` | TypeScript checking without emitting files |
| `bun run check` | Biome linting and formatting checks |
| `bun run lint:fix` | Apply Biome fixes; review the resulting diff |
| `bun run test` | Type checking, Biome, then Jest |
| `bun run test:coverage` | Jest with coverage |
| `bun run build` | Production Next.js build |
| `bun run test:backend` | Integration checks against isolated PostgreSQL and Redis |

CI runs `SKIP_ENV_VALIDATION=true bun run test`. This bypasses environment schema validation; it does not provide working external services or Clerk credentials. Builds may require the public Clerk key. Report which checks were run and any blockers accurately.

## Code map and conventions

- `src/app/`: App Router pages and `api/**/route.ts` handlers. Next.js route parameters are promises; await them before use.
- `src/components/`: Feature components; reuse primitives in `src/components/ui/`.
- `src/hooks/`: Shared React hooks for voting, timers, channels, and user synchronization.
- `src/lib/`: Database access, realtime transport, reporting, flags, scoring, exports, and TrackLin.es integration.
- `src/types/`: Database and channel types; keep these aligned with schema and payload changes.
- `src/test/`: Shared Jest setup, mocks, and request/authentication helpers.
- `db/migrations/`: Active PostgreSQL migrations; `scripts/migrate.ts` applies them in filename order.

Use the `~/` alias for imports from `src/`, explicit type imports where appropriate, and the existing Biome formatting conventions. Keep changes focused and reuse nearby patterns. Use `reportError` from `~/lib/bugfixes` for server error reporting where surrounding code does so.

## Database, authorization, and realtime

Keep database and Redis access on the server. Browser code calls Next.js API routes and the realtime client. Preserve resource membership, ownership/facilitator checks, anonymous participant behavior, and private votes when changing these flows; consult `src/lib/realtime/authorize.ts` and neighboring handlers.

Use parameterized SQL or the existing query builder. Its nested relationship projections are explicitly registered in `src/lib/db/index.ts`; update that mapping when introducing relationships used by projections.

Add schema changes as new numbered SQL files in `db/migrations/`. Applied migrations are checksum-validated, so do not edit previously applied files. The migration runner uses transactions and a PostgreSQL advisory lock. Files under `supabase/` and `docs/RLS_SETUP.md` describe the historical backend; do not apply those migrations to the current PostgreSQL deployment. Consult `docs/RAILWAY_MIGRATION.md` for cutover work.

When changing realtime behavior, check event payloads, channel authorization, replay, and client state recovery together. TrackLin.es features use flags in `src/lib/flags.ts` and integration logic in `src/lib/tracklines/`; preserve normal boards and poker sessions when those integrations are disabled or unavailable.

## Tests and environment

Jest uses `next/jest` with SWC and jsdom, with setup in `src/test/setup.ts`. Tests are colocated as `.test.ts` or `.test.tsx`; reuse `src/test/helpers.ts` and mock Clerk, database access, Redis, and external APIs as appropriate. Avoid tests that merely duplicate shadcn primitives.

Backend checks require explicit `BACKEND_CHECK_DATABASE_URL` and `BACKEND_CHECK_REDIS_URL` pointing to isolated local services after migrations. TrackLin.es checks run through `bun scripts/check-tracklines.ts` with an isolated `BACKEND_CHECK_DATABASE_URL`. These scripts create and remove fixtures; keep them away from shared or production data.

Environment validation lives in `src/env.ts`; document new settings in `.env.example` and the README. Keep `DATABASE_URL`, `REDIS_URL`, Clerk secrets, and integration credentials server-only. Only expose intentionally public settings through `NEXT_PUBLIC_` variables. Never commit secrets or local environment files.
