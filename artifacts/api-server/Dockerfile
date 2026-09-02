# syntax=docker/dockerfile:1.7
# Multi-stage build for the PriceCrew API server.
#
# The API has native deps (@gutenye/ocr-node with ONNX runtime,
# @napi-rs/canvas, pdf-parse) so it needs a real Node runtime with
# system libraries — not a slim distroless base.
#
# Runtime targets: Fly.io Machines, Railway, Render, any container host.
# Health check: GET /api/healthz

# ---------------------------------------------------------------------------
# Stage 1: prune the monorepo to just the API server + its workspace deps
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS deps
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /repo

# Copy manifests first so this layer caches on lockfile churn only.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY lib ./lib
COPY scripts/package.json ./scripts/

# Install with the frozen lockfile. --prod=false is required so the
# api-server's devDeps (esbuild, tsx, types) are available for the build.
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Stage 2: build the API bundle
# ---------------------------------------------------------------------------
FROM deps AS build
WORKDIR /repo

COPY artifacts/api-server ./artifacts/api-server
# Re-copy lib in case build touches it during typecheck / codegen.
COPY lib ./lib

# @workspace/api-zod is generated from OpenAPI. Regenerate to be safe.
RUN pnpm --filter @workspace/api-spec run codegen \
 && pnpm --filter @workspace/api-server run build

# ---------------------------------------------------------------------------
# Stage 3: runtime image
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
RUN corepack enable && corepack prepare pnpm@9 --activate

# System libs required by @napi-rs/canvas and OCR native binaries.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      libfontconfig1 \
      libfreetype6 \
      libjpeg62-turbo \
      libpng16-16 \
      libglib2.0-0 \
      dumb-init \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3001

WORKDIR /app

# Copy just the built bundle and the pruned node_modules needed at runtime.
# esbuild bundles server code into dist/ so we mostly need native modules.
COPY --from=build /repo/artifacts/api-server/dist ./dist
COPY --from=build /repo/artifacts/api-server/package.json ./package.json
COPY --from=build /repo/node_modules ./node_modules

EXPOSE 3001

# dumb-init gives us proper SIGTERM handling for graceful shutdown.
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
