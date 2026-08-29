#!/bin/bash
set -euo pipefail

pnpm install --frozen-lockfile
pnpm run build
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run test:db-preflight
