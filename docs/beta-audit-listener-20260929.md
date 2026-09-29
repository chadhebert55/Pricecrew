# Beta audit preview listener lifecycle

Baseline: main `fb36455`, after merged PRs #38 and #39.

The opt-in Service Upgrade audit intermittently fails at `response.json()` with `Network.getResponseBody: No resource with given identifier found`, as the audit reloads the page while its asynchronous response listener is reading an old document's response. The September 29 combined run had 66 passes and this one failure; an unchanged isolated rerun passed. The same protocol failure was recorded before these maintenance changes.

This is a test-harness lifecycle defect, not evidence of an application draft persistence failure. The listener is now attached after reload and before Restore, so its observations describe restored previews, not old pre-reload responses. Once the expected preview is captured, Playwright's existing `removeAllListeners` wait behavior drains outstanding reads before quote generation can navigate. Failure cleanup also drains before closing the context.

No application code, localStorage behavior, API behavior, debounce, timeout, assertion strength, monetary formula or catalog changes. No catch-and-ignore of failed preview reads. Existing exact restored-value and preview/save/snapshot assertions remain.

Validation requires repeated Service Upgrade runs and the full audit-enabled browser suite, plus unchanged full API, typecheck/build, deployment tests and independent CI. This test-only repair is isolated from the dependency and internal-warning changes.
