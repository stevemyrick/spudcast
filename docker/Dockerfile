# syntax=docker/dockerfile:1

# --- Build stage: install deps (incl. native modules) and build the frontends ---
FROM node:22-bookworm AS builder
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

# Install with the lockfile first for better layer caching.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
COPY web/admin/package.json ./web/admin/
COPY web/player/package.json ./web/player/
RUN pnpm install --frozen-lockfile || pnpm install

# Copy the rest and build the admin + player bundles.
COPY . .
RUN pnpm build

# --- Runtime stage ---
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV SPUDCAST_DATA_DIR=/data
ENV SPUDCAST_WEB_DIR=/app/public
ENV PORT=8080
RUN corepack enable

# App source + dependencies (native modules already compiled in the builder).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/backend ./backend
# Built frontends served by the backend: admin at /, player at /tv.
COPY --from=builder /app/web/admin/dist ./public/admin
COPY --from=builder /app/web/player/dist ./public/player

VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["pnpm", "--filter", "@spudcast/backend", "start"]
