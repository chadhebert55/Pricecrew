# Beta audit contract

Baseline: `87f206b77f19fb02980fa48f8c36a4f7f9606293`, latest locally fetched main, including PR 30 and PR 32. Audit branch: `audit/beta-readiness-20260927`. Audit date: 2026-09-27.

## Scope and evidence

All eleven builders from `artifacts/electrical-estimator/src/lib/builder-directory.ts`, shared quote lifecycle, outputs, company isolation, settings, responsive navigation, onboarding, draft persistence, and error states.

Use local Postgres and synthetic companies only. The catalog snapshot is read-only evidence preserved on 2026-09-26; its contents are not proof of today's live Price Book. Distinguish browser UI actions, API checks, source inspection, and unavailable production verification.

## Invariants

- No production writes, customer communications, charges, catalog mutations or historical quote updates.
- No pricing formula, labor coefficient, company default, billing, or assembly changes.
- No migration and no unrelated PR merge.
- Preserve all routes, IDs, P0 fixes, proposal totals and immutable snapshots.
- Unresolved contractor materials remain unresolved. Customer-supplied cost exclusion is not missing pricing.
- Only isolated proven low-risk fixes with regression coverage may enter this branch.

## Excluded work

Uncommitted Addition/New House and Panel/Service improvement work remains in separate worktrees and is not part of main or this audit.

## Access limitations

At the audit start, GitHub returned Forbidden, Vercel team discovery failed, and the selected local device did not expose comet-bridge. GitHub access subsequently recovered and main was fetched and confirmed at the baseline above. Live signed-in verification and production deployment verification remain unavailable. The release artifact is an unmerged review PR, not a production release.
