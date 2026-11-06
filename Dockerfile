FROM oven/bun:1.3.14-slim AS base
WORKDIR /app

# install dependencies
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# build
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

# Build-time args injected by Railway
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_FLAGS_PROJECT_ID
ARG NEXT_PUBLIC_FLAGS_AGENT_ID
ARG NEXT_PUBLIC_FLAGS_ENVIRONMENT
ARG CLERK_SECRET_KEY
ARG UPLOADTHING_TOKEN

ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_FLAGS_PROJECT_ID=$NEXT_PUBLIC_FLAGS_PROJECT_ID
ENV NEXT_PUBLIC_FLAGS_AGENT_ID=$NEXT_PUBLIC_FLAGS_AGENT_ID
ENV NEXT_PUBLIC_FLAGS_ENVIRONMENT=$NEXT_PUBLIC_FLAGS_ENVIRONMENT
ENV CLERK_SECRET_KEY=$CLERK_SECRET_KEY
ENV UPLOADTHING_TOKEN=$UPLOADTHING_TOKEN

RUN SKIP_ENV_VALIDATION=1 bun run build

# production
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrate.ts ./scripts/migrate.ts
COPY --from=builder --chown=nextjs:nodejs /app/db ./db

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["bun", "server.js"]
