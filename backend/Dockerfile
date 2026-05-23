# ClinicBridge backend — LOCAL/STAGING container image (Sprint 3.10).
# Multi-stage. Build context is the REPO ROOT (pnpm workspace + lockfile live there).
#   docker build -f backend/Dockerfile -t clinicbridge-backend .
# NO secrets are baked in; runtime config comes from environment (see docker-compose).
# Migrations are NOT run here — run them from the host: pnpm --filter backend migrate:latest.

# --- Builder: install (incl. dev) + compile TypeScript to dist/ ---
FROM node:20-slim AS builder
WORKDIR /repo
# Toolchain so the native dep (argon2) builds if no prebuilt is available (glibc).
RUN corepack enable \
  && apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Manifests first for layer caching. frontend/package.json is needed so the pnpm
# workspace resolves (we only install the backend subtree).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN pnpm install --frozen-lockfile --filter backend

# Backend source + build → dist/.
COPY backend ./backend
RUN pnpm --filter backend build

# --- Runtime: a FRESH prod-only install (no dev deps) + the compiled dist ---
FROM node:20-slim AS runtime
ENV NODE_ENV=development
WORKDIR /repo
RUN corepack enable
# Prod-only deps. A clean install never links dev deps (typescript/tsx/@types);
# argon2 uses its bundled prebuilt binary, so no toolchain is needed here.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN pnpm install --frozen-lockfile --filter backend --prod
# Compiled app only (no source, no .env — those never enter the runtime image).
COPY --from=builder /repo/backend/dist ./backend/dist

# Run as the unprivileged built-in node user (uid 1000).
USER node
WORKDIR /repo/backend
EXPOSE 3001
CMD ["node", "dist/server.js"]
