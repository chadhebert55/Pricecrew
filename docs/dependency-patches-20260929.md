# Beta dependency patch verification

## Audit contract

Baseline: main `7309c134c251d56d46a9bb20e0831d8d55b29fcc`, after PRs #36 and #37. This focused change updates three existing transitive dependencies within their current release lines and adds isolated regression tests. No estimating source, schema, catalog, financial snapshot, rate, billing configuration, or production data is modified.

The baseline production dependency audit reports nine advisories: three high and six moderate. These are dependency findings, not proof that every exploit is reachable through PriceCrew. Reproduction uses harmless local inputs and a mock HTTP dispatcher, never a production endpoint.

## Bounded remediation

- **qs 6.15.3 to 6.16.0:** Express/body-parser depend on this parser. Four-value regression reproduces the bracketed comma array-limit bypass, and a small parse/stringify regression reproduces the non-callable `constructor.isBuffer` failure. PriceCrew uses extended form parsing but does not enable comma parsing, and no application parse/stringify exploit chain has been established. This is preventive dependency hardening, not a claimed production incident. [Array-limit advisory](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx) and [serialization advisory](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g).
- **undici 6.28.0 to 6.28.1:** Used through Vercel Blob. Patch-floor and mock HTTP compatibility tests cover the resolved package. No hostile WebSocket or resource-exhaustion test is performed; this does not patch Node's separately bundled WebSocket implementation. [WebSocket advisory](https://github.com/advisories/GHSA-3wwx-pv8p-q78v).
- **adm-zip 0.6.0 to 0.6.1:** Used by the ONNX runtime installer beneath OCR. Patch-floor and in-memory ZIP round-trip tests cover the actual transitive package. No large-allocation payload or filesystem extraction is executed. [Allocation advisory](https://github.com/advisories/GHSA-7q85-xj36-vmfc).

Existing package release-age policy remains unchanged. The three exact-version overrides are mirrored in root `package.json` for the existing pnpm 9 CI and `pnpm-workspace.yaml` for pnpm 12, which no longer reads the root pnpm field. Neither package manager nor CI is migrated. The lockfile only changes those three packages, integrity hashes, dependency edges, and override entries.

The post-patch production audit reports four remaining advisories: two high (sharp/libvips/libheif) and two moderate (uuid and OpenTelemetry). Neither adm-zip advisory remains in the fresh audit output, although the older symlink advisory did not provide a useful fixed-version range; do not infer independently proven symlink protection from the in-memory compatibility test.

Larger sharp, uuid, and OpenTelemetry upgrade lines require separate compatibility work. A successful build is not proof of a clean security audit.

## Verification

- Baseline focused tests: 1 passed, 4 failed (two qs failures and two patch-floor checks).
- Patched dependency tests: 5 passed.
- Combined Addition/customer-scope/dependency tests: 46 passed.
- Full API suite: 338 passed, 0 failed.
- Deployment-configuration suite: 13 passed.
- Typecheck and production build: passed.
- Full browser suite with audit fixtures enabled: 67 passed, including 11-builder customer scope/PDF/immutable revision checks and both Addition fan paths.
- Independent CI: pending; merge remains gated on this.

The initial local API run overlapped build code generation and failed to import the briefly removed generated API module (329 passed, one file failed). Repeating after code generation completed passed all 338 tests. No timeout or implementation was changed to hide the failure; avoid overlapping codegen with source-consuming tests.

The pnpm 12 install completed package extraction/native builds but reported its existing unapproved optional core-js build. Its generated approval placeholder was removed, not approved. Unrelated lockfile sorting and optional-peer rebinding were discarded. CI's existing pnpm 9 path must separately demonstrate successful installation.
