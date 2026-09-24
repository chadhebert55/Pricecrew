# PriceCrew estimating frontend deployment

This prepares the estimating app for a separate Vercel project backed by the existing Railway API. It does not authorize a production deploy, domain change, database migration, or replacement of the marketing site.

## Deployment boundary

- **Marketing:** Keep the existing Vercel project `pricecrew`, `getpricecrew.com`, and `www.getpricecrew.com` unchanged.
- **Estimating frontend:** Create a separate project, suggested name `pricecrew-app`, from [chadhebert55/Pricecrew](https://github.com/chadhebert55/Pricecrew). Do not import the repository into the marketing project.
- **Backend:** Keep Railway on `main`. The configured upstream is `https://workspaceapi-server-production-2d60.up.railway.app`.
- **App domain:** `app.getpricecrew.com` is a proposed destination, not a confirmed configured domain. Add it only after approval and a domain ownership check.
- **Database and storage:** Remain behind the Railway API. This frontend preparation does not migrate or seed production data.

## What the preparation changes

- **Same-origin API routing:** Browser calls stay under the app's `/api/...` address. Vercel forwards them to Railway, including `/api/blob/handle-upload`, rather than relying on cross-origin cookie delivery. External rewrites preserve the browser-facing URL; upstream behavior still needs a deployed smoke test ([Vercel rewrites](https://vercel.com/docs/rewrites)).
- **Private responses:** `/api` opts out of Vercel rewrite caching and sends `private, no-store` cache headers. The explicit opt-out is important for newer Vercel projects that may otherwise honor upstream cache headers ([Vercel rewrite caching](https://vercel.com/docs/rewrites)).
- **Clerk configuration:** The frontend and API prefer the explicitly configured publishable key. Host-derived keys remain a legacy fallback, not the Vercel configuration strategy.
- **Build checks:** The Vercel build rejects a missing or malformed Clerk publishable key, cross-origin API settings, custom Clerk proxy settings, test harness variables, and incompatible base/output paths. Key-format validation does not verify credentials, matching instances, or DNS.
- **Reproducible tooling:** Install and build use pnpm 9.15.9. Code generation runs before the frontend build. The temporary non-frozen install matches the repository's existing CI workaround; resolving the lockfile-version mismatch is separate work.

## Release blockers

- [ ] Review and merge the preparation PR only after CI passes. Merging also redeploys the Railway API because this PR corrects its Clerk key selection.
- [ ] Confirm the frontend publishable key and Railway's publishable/secret keys belong to the same Clerk instance. Do not paste secret keys into chat.
- [ ] Decide whether this is internal verification with an existing Clerk test instance or a production launch. A test key is not production sign-off.
- [ ] For production, finish Clerk's production instance and custom-domain DNS setup. Production and development instances are distinct; do not assume existing users or settings transfer automatically ([Clerk production deployment guide](https://clerk.com/docs/guides/development/deployment/production)).
- [ ] Rotate the database credential previously embedded in `docs/deploy-runbook.md` if that has not already been done. Coordinate Neon credential rotation with updating Railway's `DATABASE_URL` to avoid an outage. Redaction does not invalidate the old credential or remove Git history.
- [ ] Verify Railway uses durable storage (`vercel-blob` with a valid server-side token, or another deliberately configured durable adapter), not the in-memory test adapter.
- [ ] Complete the deployed sign-in, API, upload, and quote smoke tests below before inviting contractors.

## Vercel setup

After the release blockers that precede deployment have been resolved:

1. Open Vercel and choose **Add New → Project**.
2. Import `chadhebert55/Pricecrew` into a **new** project named `pricecrew-app` or another clearly distinct name.
3. Set the production branch to `main` after the preparation PR is merged. A branch-preview deployment is optional, but it targets the production API with this configuration; do not treat it as an isolated staging database.
4. Keep the root directory at the repository root, not `artifacts/electrical-estimator`. Workspace packages and code generation need the full monorepo.
5. Choose **Other** as the framework preset and **Node.js 22.x**.
6. Let the repository's `vercel.json` supply the following settings. Remove stale dashboard overrides if present:

| Setting | Value |
|---|---|
| Install command | `npx --yes pnpm@9.15.9 install --frozen-lockfile=false` |
| Build command | `node scripts/vercel-build.mjs` |
| Output directory | `artifacts/electrical-estimator/dist/public` |
| API upstream | `https://workspaceapi-server-production-2d60.up.railway.app` |

7. Add the frontend variables below directly in Vercel. Build-time variable changes require a new build.
8. Review the project name and domain list again before pressing **Deploy**. No marketing domain should be attached.
9. Keep preview access restricted. A preview that uses the production API can mutate real data when signed in; use a designated test company and never destructive sample actions against customer records.

### Frontend environment

| Variable | Setting |
|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Required. Copy the publishable key from the intended Clerk instance; it must match Railway's Clerk configuration. |
| `VITE_API_BASE_URL` | Leave unset. The same-origin rewrite is intentional. |
| `VITE_CLERK_PROXY_URL` | Leave unset for this configuration. |
| `VITE_E2E_*` | Remove all of these from Preview and Production. |
| `BASE_PATH` | Leave unset, or use `/`. |
| `BUNDLE_CHECK_OUTPUT_DIR` | Leave unset. |
| `VITE_SENTRY_DSN` / `VITE_SENTRY_ENVIRONMENT` | Optional monitoring configuration. |

Do not put `DATABASE_URL`, `CLERK_SECRET_KEY`, `ANTHROPIC_API_KEY`, `SESSION_SECRET`, `STRIPE_SECRET_KEY`, or `BLOB_READ_WRITE_TOKEN` in any `VITE_*` variable. These are backend secrets and do not belong in a browser bundle.

### Railway checks

- **Authentication:** `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` must match each other and the frontend instance.
- **Runtime:** Keep `NODE_ENV=production`; never deploy the E2E authentication harness.
- **Storage:** The Blob token belongs on Railway, where upload authorization happens. Attaching a Blob store to Vercel alone does not configure Railway.
- **Billing:** If enabled, `STRIPE_CHECKOUT_APP_URL` must point to the actual app origin, not the Railway API hostname. This preparation does not enable live billing.
- **CORS:** Same-origin browser calls do not require a cross-origin workaround. Preserve any allowlist needed for existing clients; do not enable wildcard origins to troubleshoot authentication.

## Deployed smoke tests

Use the new estimating frontend URL, not the marketing URL. Local browser tests use a test authentication harness and cannot replace these checks.

1. Visit `/api/healthz` through the frontend domain. Expect HTTP 200 with `{"status":"ok"}`, not the SPA HTML.
2. In a signed-out browser, request `/api/company`. Expect HTTP 401, not private company data and not an HTML page.
3. Sign in through Clerk. Confirm the intended user account and company load without redirect loops or requests to an invented `clerk.<preview-host>` domain.
4. Check browser Network: application API requests should target the frontend's `/api/...` URLs. Confirm authenticated company and price-book requests succeed.
5. Refresh a nested route such as the dashboard or quote builder. Confirm the app loads instead of a hosting 404.
6. Within a designated test company, save a small draft estimate, reload it, and verify the line items and totals persist.
7. Upload a harmless sample file using a supported app workflow. Confirm `/api/blob/handle-upload` reaches the API, storage succeeds, and the file remains accessible after reload.
8. Export a sample quote and inspect the result. Do not send a proposal to a real customer during verification.
9. Sign out, then repeat the private API check. Confirm private API responses are not served from a shared cache.
10. Confirm the existing marketing site is unchanged. Test the app once at desktop size and once on a phone.

A failing auth or upload check means **do not launch**. Record the failing URL, HTTP status, and sanitized logs; never paste tokens, cookies, or connection strings.

## Verification record

Prepared on September 24, 2026. Results below are local checks unless explicitly described as live.

- Deployment configuration and preflight tests: 12 passed.
- Repository TypeScript checks: passed.
- Guarded production-mode frontend build: passed with a deliberately fake, correctly formatted test publishable key. This verifies compilation, not real Clerk login.
- Frontend entry JavaScript: 466,403 bytes, within the repository's 500,000-byte budget.
- Build emitted non-fatal source-map diagnostic warnings in existing UI component files.
- Browser regression suite: 16 passed, including onboarding, draft recovery, quote export, and mobile/tablet coverage.
- API regression suite: 206 passed against the local test database.
- Live Railway read-only preflight: `/api/healthz` returned HTTP 200; anonymous `/api/company` returned HTTP 401.
- Not verified yet: a new Vercel deployment, real Clerk authentication, deployed cookie forwarding, Blob upload, estimate persistence through the new frontend, or custom-domain DNS.

No production hosting, domains, environment variables, or database credentials were changed by this preparation.

## Rollback and handoff

- **Frontend:** Retain the previous known-good frontend deployment if one exists. A failed first deployment should not replace the marketing site.
- **API:** The auth-key change deploys separately via Railway after merge. If it fails, roll back to the previous healthy Railway deployment and investigate the Clerk instance mismatch; do not change database schema.
- **Routing:** If the Railway public hostname changes, update the upstream in `vercel.json` and its configuration test before redeploying.
- **Next action:** Review the PR and CI, resolve the credentials and Clerk release gates, then create the separate Vercel app project. Domain activation and contractor invitations follow successful smoke tests, not merely a green build.
