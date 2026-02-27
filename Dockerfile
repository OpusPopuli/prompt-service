FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
COPY prisma ./prisma/
RUN pnpm install --frozen-lockfile || pnpm install
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

EXPOSE 3100
CMD ["sh", "-c", "pnpm db:migrate:deploy && node dist/seed/seed.js && node dist/main"]
