FROM node:22-alpine AS base
# Pinned, not @latest. CI's pnpm/action-setup pins version 9 and the lockfile
# is lockfileVersion 9.0, so @latest silently drifted the image away from both.
# pnpm 12.4.2 (published 2026-09-15) turned the ignored-build-scripts warning
# into a hard ERR_PNPM_IGNORED_BUILDS, which broke `pnpm build` below on every
# branch at once — the day after main's last green run. Keep this in step with
# `packageManager` in package.json, which is the single source of truth: the
# workflows read it via pnpm/action-setup, which errors if a `version:` input
# also specifies one.
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
COPY prisma ./prisma/
# HUSKY=0 prevents the prepare script from running git-hook setup in Docker
# (no .git dir in build context). --ignore-scripts keeps dependency postinstalls
# out of the image; prisma's is handled by `pnpm db:generate` on the next line.
ENV HUSKY=0
RUN pnpm install --frozen-lockfile --ignore-scripts || pnpm install --ignore-scripts
RUN pnpm db:generate

# Build
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build
# Compile seed script for production (ts-node not available in runner)
RUN npx tsc prisma/seed.ts --outDir dist/seed --esModuleInterop --module commonjs --target ES2021 --skipLibCheck

# Production
FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package.json ./

EXPOSE 3200
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/seed/seed.js && node dist/main"]
