FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
COPY prisma ./prisma/
# HUSKY=0 prevents the prepare script from running git-hook setup in Docker
# (no .git dir in build context). pnpm@latest (v10+) requires explicit approval
# for package build scripts; prisma's postinstall is handled by pnpm db:generate below.
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
