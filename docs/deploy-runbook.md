# PriceCrew — Post-Merge Deploy Runbook

Follow this once, top to bottom, the first time you take the `neon-migration` PR to production. Everything after that is a subset (skip whatever's already done).

**Time budget:** ~45 minutes on your first pass. Subsequent deploys are `git push` + smoke test (~5 min).

---

## 0. Before you start

You need accounts / tabs open:
- Vercel (frontend hosting)
- Fly.io *or* Railway (API hosting — pick one)
- Clerk dashboard (for rotated keys)
- Anthropic console (for rotated key)
- Neon dashboard (already set up)
- Sentry (optional — skip if you're deferring observability)

Local prereqs:
- `git`, `pnpm 9+`, `flyctl` (if going Fly) or Railway CLI (if going Railway)
- The repo checked out at `neon-migration` branch or `main` if merged

---

## 1. Rotate the leaked keys (5 min)

The Clerk and Anthropic keys were pasted in chat earlier. Rotate before deploy.

**Clerk:**
1. Dashboard → **API Keys** → your app
2. Click "Regenerate" on both the publishable and secret keys
3. Copy the new values — you'll paste them into Vercel and Fly/Railway shortly

**Anthropic:**
1. Console → **Settings → API Keys**
2. Revoke the old key, create a new one
3. Copy the new value

Also generate a new session secret:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Store all four values somewhere safe (1Password, etc.) — you'll paste them in the next two steps.

---

## 2. Deploy the API server (15 min)

The API has native deps (OCR runtime, canvas, pdf-parse) that don't fit in Vercel serverless functions. It goes on a container host.

### Option A — Fly.io (recommended)

```bash
cd artifacts/api-server
fly launch --no-deploy --copy-config --name pricecrew-api
# Say NO to Postgres (we're using Neon)
# Say NO to Redis
# Region: iad (Ashburn) — matches Neon prod

fly secrets set \
  DATABASE_URL='postgresql://pricecrew_owner:npg_E7rKDA1NjTzq@ep-noisy-wildflower-ax1bw4b4.us-east-2.aws.neon.tech/pricecrew?sslmode=require' \
  CLERK_PUBLISHABLE_KEY='<rotated>' \
  CLERK_SECRET_KEY='<rotated>' \
  ANTHROPIC_API_KEY='<rotated>' \
  SESSION_SECRET='<new random>' \
  STORAGE_DRIVER=auto \
  ALLOWED_ORIGINS='https://<your-vercel-domain>'

fly deploy
```

Wait ~3 min for the first image build. Then:
```bash
fly status              # confirm 1 machine running
curl https://pricecrew-api.fly.dev/api/healthz   # expect 200
fly logs                # watch for boot errors
```

Save the resulting URL (e.g. `https://pricecrew-api.fly.dev`) — you need it for Vercel.

### Option B — Railway

1. New project → **Deploy from GitHub** → pick the repo, `main` branch
2. Set root directory to `artifacts/api-server`
3. Railway auto-detects the Dockerfile — no build config needed
4. Add environment variables (same list as Fly above, minus `ALLOWED_ORIGINS` for now)
5. Deploy, wait for the healthcheck at `/api/healthz` to go green
6. Settings → Networking → Generate a public domain
7. Save the URL

---

## 3. Deploy the frontend (10 min)

1. Vercel → **Add New → Project** → import the GitHub repo
2. Vercel reads `vercel.json` automatically. Confirm the settings match:
   - Framework preset: **Other**
   - Build command: `pnpm --filter @workspace/electrical-estimator run build`
   - Output directory: `artifacts/electrical-estimator/dist/public`
   - Install command: `pnpm install --frozen-lockfile`
3. Environment variables:
   ```
   VITE_CLERK_PUBLISHABLE_KEY = <rotated pk>
   VITE_API_BASE_URL          = https://pricecrew-api.fly.dev  (or Railway URL)
   ```
4. Deploy. Watch the build log — it should finish in ~2 min.
5. Once live, copy the Vercel URL (e.g. `https://pricecrew.vercel.app`).

### Link Vercel Blob (2 min)
1. Project → **Storage → Create → Blob**
2. Vercel auto-injects `BLOB_READ_WRITE_TOKEN` into your project env
3. Redeploy the API so it picks up the token — on Fly:
   ```bash
   fly secrets set BLOB_READ_WRITE_TOKEN='<from Vercel Storage tab>'
   ```
   (Yes, we set it on the API too, because that's where uploads are signed.)

### Close the CORS loop
Now that you know the Vercel URL, set the API's origin allowlist:

```bash
# Fly
fly secrets set ALLOWED_ORIGINS='https://pricecrew.vercel.app,https://<custom-domain-if-any>'

# Railway: same variable in the dashboard
```

The API auto-restarts on secret change. Give it 30s.

---

## 4. Smoke test (5 min)

Open the Vercel URL and confirm:
- [ ] Sign-in flow works (Clerk redirect + return)
- [ ] Dashboard loads without console errors
- [ ] Price book page loads data (proves DB + API connectivity)
- [ ] Try uploading a small PDF via the takeoff review (proves Blob + CORS)
- [ ] Check the browser Network tab — API calls should hit `pricecrew-api.fly.dev`, not the Vercel domain
- [ ] `fly logs` (or Railway logs) show request traffic, no 500s

If sign-in fails with a CORS error, double-check `ALLOWED_ORIGINS` matches the exact Vercel URL (protocol + host, no trailing slash).

---

## 5. Sentry (10 min, optional)

Skip if you want to defer observability.

1. Create a Sentry project — **Node.js** for the API, **React** for the frontend (two projects, or use one with tags)
2. Grab the DSN for each

**API side (Fly):**
```bash
fly secrets set \
  SENTRY_DSN='https://...@sentry.io/...' \
  SENTRY_ENVIRONMENT=production \
  SENTRY_TRACES_SAMPLE_RATE=0.1
fly deploy
```

**Frontend side (Vercel):**
Add to Vercel env vars (all Environments):
```
VITE_SENTRY_DSN                = https://...@sentry.io/...
VITE_SENTRY_ENVIRONMENT        = production
VITE_SENTRY_TRACES_SAMPLE_RATE = 0.1
```
Trigger a redeploy.

**Source maps (optional, for readable stack traces):**
1. Sentry → User Settings → **Auth Tokens** → create with `project:write` + `project:releases`
2. Add to Vercel env vars (Production only):
   ```
   SENTRY_AUTH_TOKEN = sntrys_...
   SENTRY_ORG        = <your-org-slug>
   SENTRY_PROJECT    = electrical-estimator
   SENTRY_RELEASE    = ${VERCEL_GIT_COMMIT_SHA}
   ```
3. Redeploy. The Vite plugin uploads maps then deletes them from the bundle so they never ship to users.

Trigger a test error — visit `/definitely-not-a-page` or open devtools and `throw new Error("sentry test")`. It should appear in Sentry within ~1 min.

---

## 6. Merge the PR

Once smoke test passes:
1. Go to [PR #1](https://github.com/chadhebert55/Pricecrew/pull/1)
2. Merge to `main`
3. CI runs against `main`; Vercel + Fly auto-redeploy on merge (if you enabled auto-deploy)

---

## Troubleshooting

**API 500s with "database does not exist"** — you set the Neon URL to the pooler endpoint but Neon expects `sslmode=require`. Double-check the connection string.

**Frontend loads but every API call fails with CORS** — `ALLOWED_ORIGINS` doesn't include the exact origin the browser is sending. Check the browser's `Origin` header vs your allowlist.

**Uploads work locally but fail on Vercel** — `BLOB_READ_WRITE_TOKEN` isn't set on the API side, or the Vercel Blob store is in a different Vercel project than the frontend.

**Sign-in redirect goes to `clerk.example.com`** — you shipped the placeholder Clerk publishable key. Rotate + set the real one on Vercel and redeploy.

**Fly machine keeps restarting** — `fly logs` should show why. Common: healthcheck path wrong (must be `/api/healthz`), or `PORT` env var overridden.

---

## Rollback

Fly:
```bash
fly releases        # find previous release ID
fly deploy --image registry.fly.io/pricecrew-api:deployment-<id>
```

Vercel: Deployments tab → find last known good → **Promote to Production**.

Both take under 30 seconds.
