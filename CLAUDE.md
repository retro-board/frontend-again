# Claude Configuration

## Project Context
This is a Retro Board application built with Next.js 15, TypeScript, Supabase, and Clerk for authentication.

## Important Commands
Always run these commands before considering any task complete:

### 1. Linting & Formatting
```bash
pnpm check        # Run Biome linting checks
pnpm lint:fix     # Auto-fix linting issues
```

### 2. Type Checking
```bash
pnpm typecheck    # Run TypeScript type checking
```

### 3. Testing
```bash
pnpm test         # Run all tests
```

### 4. Build Verification
```bash
pnpm build        # Ensure the project builds successfully
```

## Task Completion Checklist
Before marking any coding task as complete, ensure:
- [ ] Code passes linting (`pnpm check`)
- [ ] TypeScript has no errors (`pnpm typecheck`)
- [ ] All tests pass (`pnpm test`)
- [ ] Project builds successfully (`pnpm build`)

## Project Structure
- `/src/app` - Next.js 15 App Router pages and API routes
- `/src/components` - React components (excluding `/ui` which contains shadcn components)
- `/src/lib` - Utility functions and configurations
- `/src/hooks` - Custom React hooks
- `/src/types` - TypeScript type definitions

## Testing Guidelines
- Tests use Jest with ts-jest
- Test files should be colocated with source files using `.test.ts` or `.test.tsx` extension
- Mock external dependencies (Clerk, Supabase, etc.)
- Don't test shadcn UI components in `/src/components/ui`

## Common Issues & Solutions

### Next.js 15 Route Handlers
- Route handler params are now async Promises
- Always await params: `const resolvedParams = await params;`

### Clerk Authentication Mocking
- Mock as `auth as unknown as jest.Mock` to avoid type issues
- Clerk modules may need special handling in Jest config

### Zustand Store Testing
- Use `useBreadcrumbStore.setState()` to set initial state
- Use `useBreadcrumbStore.getState()` to access store directly in tests
- Don't use React's `act()` for Zustand state updates

## Dependencies
- Package manager: pnpm
- Linter: Biome
- Test runner: Jest
- Framework: Next.js 15 with Turbopack