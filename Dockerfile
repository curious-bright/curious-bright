FROM node:20-alpine AS base

# Install OpenSSL and libc compatibility for Prisma engine on Alpine
RUN apk add --no-cache openssl libc6-compat

# Enable pnpm via corepack
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# 1. Copy root workspace configurations
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# 2. Copy shared packages and server applications
COPY packages ./packages
COPY apps/backend ./apps/backend
COPY apps/realtime-gateway ./apps/realtime-gateway
COPY apps/signaling-service ./apps/signaling-service

# 3. Install all monorepo dependencies
RUN pnpm install --frozen-lockfile

# 4. Generate Prisma client (provide dummy DATABASE_URL for build phase)
ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/curious_bright"
RUN pnpm --filter @curious-bright/database generate

# 5. Build backend and services
RUN pnpm --filter backend build
RUN pnpm --filter realtime-gateway build
RUN pnpm --filter signaling-service build

# --- Production Runner Stage ---
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache openssl libc6-compat

ENV NODE_ENV=production
ENV PORT=4000
ENV REALTIME_PORT=4001
ENV SIGNALING_PORT=4002

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Copy workspace setup and built code
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages ./packages
COPY --from=base /app/apps/backend ./apps/backend
COPY --from=base /app/apps/realtime-gateway ./apps/realtime-gateway
COPY --from=base /app/apps/signaling-service ./apps/signaling-service

# Expose backend (4000), realtime (4001), signaling (4002)
EXPOSE 4000 4001 4002

# Default process: Curious Bright Backend API + Realtime Server
CMD ["node", "apps/backend/dist/index.js"]
