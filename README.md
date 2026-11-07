# Retro Board & Sprint Poker

A modern web application for facilitating agile retrospectives and sprint planning poker sessions.

## Features

### Retro Boards
- Create boards with dynamic columns for any retrospective format
- Add, edit, and organize cards in real-time
- Vote on cards to prioritize discussion topics
- Drag and drop cards between columns
- Real-time collaboration with team members

### Sprint Poker
- Choose from three estimation scales:
  - Fibonacci (1, 2, 3, 5, 8, 13, 21...)
  - T-shirt sizes (XS, S, M, L, XL, XXL)
  - 1-10 scale
- Private voting with simultaneous reveal
- Facilitator controls for managing sessions
- Story management with descriptions
- Real-time participant status

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript
- **Database**: PostgreSQL hosted on Railway
- **Authentication**: Clerk
- **Styling**: Tailwind CSS with shadcn/ui
- **State Management**: Zustand & TanStack Query
- **Real-time**: Authenticated SSE with Redis/Valkey streams
- **Drag & Drop**: @dnd-kit

## Setup Instructions

### Prerequisites

- Bun
- PostgreSQL and Redis/Valkey (or Docker for local development)
- Clerk account

### Environment Variables

Copy `.env.example` to `.env` and add your Clerk keys. For local services:

```bash
docker compose up -d --wait
bun install
bun run db:migrate
bun run dev
```

`DATABASE_URL` and `REDIS_URL` are server-only. The browser talks to authenticated Next.js API routes. Clerk keys remain unchanged; `UPLOADTHING_TOKEN` is optional when uploads are unused.

### Railway

Run three services in one project/environment:

| Service | Purpose | App variable |
| --- | --- | --- |
| This Next.js app | API, frontend and SSE connections | Existing Clerk keys |
| PostgreSQL | Persistent application data | `DATABASE_URL=${{Postgres.DATABASE_URL}}` |
| Redis or Valkey | Shared events, reconnect replay and presence | `REDIS_URL=${{Redis.REDIS_URL}}` |

Replace `Postgres` and `Redis` with your service names. Use Railway's private service reference variables. Only the app needs a public domain; no separate realtime service is needed. Keep Redis available while the app runs, and enable persistence on its volume if event history should survive Redis restarts.

The Dockerfile builds the standalone app, and `railway.toml` runs `bun scripts/migrate.ts` as a pre-deploy command before `bun server.js`. Migrations use a PostgreSQL advisory lock, transactions and checksums. A failed migration prevents the new deployment from starting.

Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` at build time and `CLERK_SECRET_KEY` at runtime. Keep the existing UploadThing and feature flag configuration where used. Supabase URL, anonymous key, service role key and JWT secret are no longer required by this version.

See [the cutover instructions](docs/RAILWAY_MIGRATION.md) before deploying against existing data. The files under `supabase/` are historical and should not be applied to Railway PostgreSQL.

### Verification

```bash
bun run test
bun run build
# Run only against isolated local services after db:migrate:
BACKEND_CHECK_DATABASE_URL=postgres://retro:retro@127.0.0.1:55432/retro \
BACKEND_CHECK_REDIS_URL=redis://127.0.0.1:56379 bun run test:backend
```

The backend check validates the API's SQL projections, CRUD, anonymous voting, poker state recovery, shared event delivery and replay using real PostgreSQL and Redis connections. It removes its own fixtures afterwards.

## Usage

### Creating a Retro Board

1. Navigate to `/boards`
2. Click "New Board"
3. Enter a name and optional description
4. Add columns (e.g., "What went well?", "What could be improved?", "Action items")
5. Share the board URL with your team

### Running a Sprint Poker Session

1. Navigate to `/poker`
2. Click "New Session"
3. Choose your estimation scale
4. Add stories to estimate
5. Share the session URL with your team
6. Participants vote privately
7. Facilitator reveals votes when ready

## Development

```bash
# Run tests
bun run test

# Run linting
bun run check

# Type checking
bun run typecheck
```

## License

MIT
### TrackLin.es sprint retros (RB-5)

With the `rb-5` flag enabled, signed `sprint.started` deliveries create one retro per connected user and sprint. Open that retro to refresh the sprint's ticket keys, titles and estimates; an unavailable connection shows the last saved list. Authors, including anonymous participants, can select sprint tickets while adding or editing cards. Their links are included in markdown exports.

Deploy migration `005_tracklines_retros.sql` before enabling `rb-5` in both the client and server flag environments. The TrackLin.es board integration creates and promotes ticket flags; an unknown flag stays off. Normal retros remain available without a TrackLin.es connection. For an isolated database check, run `BACKEND_CHECK_DATABASE_URL=... bun scripts/check-tracklines.ts` after migrations.
