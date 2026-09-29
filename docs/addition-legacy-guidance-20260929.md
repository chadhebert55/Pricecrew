# Addition old-draft fan guidance

Baseline: main `7309c13`, after fan support PR #36 and customer proposal PR #37.

An Addition draft with customer-supplied ceiling fans and no `ceilingFanInstallation` selection still correctly produces blocking `ADDITION_SUPPLIED_FAN_SCOPE_REVIEW`. However, its message incorrectly said the builder does not generate support assemblies. That instruction predates PR #36 and now contradicts the available installation controls.

This fix changes only that internal warning message. It directs the estimator to choose new support plus required wiring/controls or verified reuse and complete the confirmations. The warning prefix, code, error severity, field-verification category, Ready blocking, calculation formulas, material assembly, labor and pricing are unchanged. Historical saved warning text is not rewritten; historical financial snapshots are not touched.

The existing identity regression gained two wording assertions: the two supported choices must be named, and the obsolete "does not generate" statement must be absent. Baseline: seven passed, one failed. Follow-up lifecycle tests must retain both paths and incomplete-scope blocking.

This is intentionally separate from the dependency patch PR. No catalog record, company setting, or unrelated builder changes.
