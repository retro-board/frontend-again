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

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Clerk
- **Styling**: Tailwind CSS with shadcn/ui
- **State Management**: Zustand & TanStack Query
- **Real-time**: Supabase Realtime
- **Drag & Drop**: @dnd-kit

## Setup Instructions

### Prerequisites

- Node.js 18+ and pnpm
- Supabase account
- Clerk account

### Environment Variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### Database Setup

1. Create a new Supabase project
2. Run the migration script in `supabase/migrations/001_initial_schema.sql` in your Supabase SQL editor
3. Enable Row Level Security (RLS) - the migration includes basic policies

### Installation

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build

# Run production build
pnpm start
```

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
pnpm test

# Run linting
pnpm lint

# Type checking
pnpm typecheck
```

## License

MIT