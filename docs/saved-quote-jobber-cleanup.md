# PriceCrew Saved Quote and Jobber export

## Outcome

Saved Quote now puts the quote, customer-facing description and saved financials before exports. Internal and customer views use the same saved snapshot. Proposal activity appears only when a decision/history exists; overrides and structured builder diagnostics start collapsed. Included, reused and customer-supplied assembly items have explicit labels rather than an unexplained zero.

Jobber defaults to one Service line at the exact saved selling price. Up to ten deliberately allocated customer-facing scope lines are supported, never an automatic stock-list dump. Generic Quote CSV remains available. QuickBooks Online and Housecall Pro are hidden from the beta UI; their legacy API exporters remain unverified and are not advertised as compatible.

Kitchen undercabinet fixtures are contractor-supplied in the current builder. The decorative customer-supply checkbox now covers sink lights and pendants only. Undercabinet quantity uses verified company pricing or blocks readiness; installation labor remains. Legacy snapshots are not rewritten.

## Official format verification

The downloaded [official Jobber sample](https://help.getjobber.com/help-center/files/39456455271831/quotes-sample-file.csv) has **119 columns**, not 121: 49 quote/client/property columns and ten groups of seven line-item columns. The exporter and regression tests compare every header, spelling, capitalization and position against that actual file. Section labels such as “Client” and “Quote” are not CSV columns.

CSV uses UTF-8, CRLF records and quoted/escaped cells. The generated CSV is parsed again and checked for exact headers/count, booleans, categories, numeric fields, malformed object/null values, and totals. Rounded unit prices and optional costs must still reconcile. No scope is silently discarded. [Jobber's import instructions](https://help.getjobber.com/en/articles/import-quotes/) describe the destination workflow; an actual account import remains the final integration verification.

## Exact PriceCrew to Jobber mapping

Explicit export mapping overrides stored customer/primary-property mapping. Saved quote name/email are fallback identity fields. Empty information remains empty.

| Jobber header | PriceCrew value |
|---|---|
| Jobber Client ID | `jobberClientId`, stored on customer or entered for export |
| Client Title | `clientTitle`, optional API mapping; otherwise blank |
| Client First Name | `clientFirstName`, otherwise first token of saved customer name |
| Client Last Name | `clientLastName`, otherwise remaining saved customer name |
| Client Full Name (Display Only) | Company name, or resolved first and last name |
| Client Company Name | `clientCompanyName` |
| Client Is a Company? (True/False) | TRUE when company supplied; FALSE for named individual; otherwise blank |
| Client Email | Explicit `clientEmail`, otherwise saved customer email |
| Client Main Phone | `clientMainPhone` |
| Client Home Phone | `clientHomePhone`, optional API mapping |
| Client Work Phone | `clientWorkPhone`, optional API mapping |
| Client Mobile Phone | `clientMobilePhone`, optional API mapping |
| Client Fax Phone | `clientFaxPhone`, optional API mapping |
| Client Other Phone | `clientOtherPhone`, optional API mapping |
| Client SMS Enabled Phone Number | `clientSmsEnabledPhoneNumber`, optional API mapping |
| Jobber Property ID | `jobberPropertyId` |
| Property Street 1 | `propertyStreet1` |
| Property Street 2 | `propertyStreet2` |
| Property City | `propertyCity` |
| Property State/Province | `propertyStateProvince` |
| Property Zip/Postal Code | `propertyZipPostalCode` |
| Property Country | `propertyCountry`, never defaulted |
| Billing Street 1 | `billingStreet1` |
| Billing Street 2 | `billingStreet2` |
| Billing City | `billingCity` |
| Billing State/Province | `billingStateProvince` |
| Billing Zip/Postal Code | `billingZipPostalCode` |
| Billing Country | `billingCountry` |
| Client Receives Auto Visit Reminders? (True/False) | `autoVisitReminders`, explicit TRUE/FALSE or blank |
| Client Receives Auto Job Follow-ups? (True/False) | `autoJobFollowups`, explicit TRUE/FALSE or blank |
| Client Receives Auto Quote Follow-ups? (True/False) | `autoQuoteFollowups`, explicit TRUE/FALSE or blank |
| Client Receives Auto Invoice Follow-ups? (True/False) | `autoInvoiceFollowups`, explicit TRUE/FALSE or blank |
| Client Receives Auto Review Requests? (True/False) | `autoReviewRequests`, explicit TRUE/FALSE or blank |
| Quote Number | Saved `quoteNumber` |
| Quote Title | Saved `projectName` |
| Quote Status (Draft/Awaiting Response/Approved) | Draft by default; explicit Awaiting Response allowed; never Approved |
| Quote Message | Explicit `quoteMessage`, otherwise saved customer-facing proposal description |
| Quote Internal Note | `Created from PriceCrew quote <quoteNumber>.` only |
| Quote Introduction Title | `introductionTitle`, otherwise blank |
| Quote Introduction Body | `introductionBody`, otherwise blank |
| Quote Contract Disclaimer | Explicit `contractDisclaimer`, otherwise company proposal terms |
| Quote Discount Type (Unit/Percentage) | Intentional `discountType`, otherwise blank |
| Quote Discount Amount (Unit/Percentage) | `discountAmount` only with a valid discount type |
| Quote Deposit Type (Unit/Percentage) | Intentional `depositType`, otherwise blank |
| Quote Deposit Amount (Unit/Percentage) | `depositAmount` only with a valid deposit type |
| Quote New Tax Rate Name | Explicit `newTaxRateName`; mutually exclusive with existing rate |
| Quote New Tax Rate (Percentage) | `newTaxRate` only when new rate name supplied |
| Quote Existing Tax Rate Name | Explicit `existingTaxRateName`; verified percentage retained locally for reconciliation |
| Tax Method (Inclusive/Exclusive) | Explicit `taxMethod`; omitted for confirmed non-taxable export |

For each X from 1 through 10, these seven headers occur in this order:

| Jobber header | Summary mode / customer-facing scope mode |
|---|---|
| Line Item X Category (Service/Product) | Service for every active exported line |
| Line Item X Name | Saved project title / intentional scope-line name |
| Line Item X Description | Saved proposal description, or sanitized work summary / intentional scope-line description |
| Line Item X Quantity | 1 / entered positive quantity |
| Line Item X UNIT Price | Saved final selling price / entered unit-price allocation |
| Line Item X UNIT Cost | Blank by default; opt-in saved material cost plus effective loaded labor / intentional cost allocation |
| Line Item X Taxable (True/False) | Explicit confirmed taxable choice |

Unused line slots are entirely blank. The sum of rounded extended prices, less any intentional discount and plus exclusive tax when applicable, must equal the saved final selling price exactly in cents. Inclusive tax does not add to the saved gross total. Deposits do not change the quoted total. With cost export enabled, costs must equal saved material plus effective loaded labor, including an internal labor override.

## Missing data and assumptions

- Customer records previously had name/email only. An additive `integration_mapping` JSONB column now stores optional Jobber identity and one primary property. It is not a full multi-property CRM; verify each job's property. Changing an address clears its old property ID.
- Billing, communication preferences, export tax treatment, scope allocations, discounts, deposits and introduction content are advanced export inputs, not a new quote-pricing system. They are not automatically persisted as new quote financial data. Company proposal terms are reused; no company-specific template is hard-coded.
- Existing company default tax rate alone does not prove taxable service, Jobber tax-rate identity, or inclusive/exclusive treatment. Explicit confirmation is required. Changing tax configuration clears confirmation.
- The system has proposal decision/history records but no reliable sent/viewed tracking. It displays actual recorded decisions or “No decision recorded”, rather than fabricating sent/viewed status.
- Saved totals, original assembly, company rates, markup, proposals, decision history and existing records are not recalculated or rewritten by this feature.
- Kitchen/Bathroom/Recessed customer views group the saved work into installation scope; their complete takeoffs remain internal. Panel scope retains its existing targeted summary.

## Verification and live-test prerequisite

Local checks cover all ten requested export cases: panel, recessed, multiple scope lines, existing client ID, name/email matching, existing property ID, new address, customer supply, final-price override and special characters. Checks also cover conflicting/missing prices, tax reconciliation, cost rounding, JSON/NaN protection, unchanged saved snapshots, customer mapping reuse and responsive layouts.

The existing production quote Q-000016 has a saved final price of 3,812.95 and internal cost of 1,840.36. Its customer is named “Test”, with no email, Jobber ID, property address or confirmed tax treatment. Export must remain blocked until real test-client identity, property and tax treatment are provided. No import-ready CSV is fabricated from missing customer data. Production schema migration is additive; existing quote count, total sum and snapshot hash are checked before/after.

Live Jobber ingestion remains unverified until the user imports the generated file in Jobber → Quotes → More Actions → Quote Imports. Structural compatibility is not a claim of successful account ingestion.
