import { exportJobberQuoteCsv, preflightQuoteExport, useGetCustomer, getGetCustomerQueryKey, useGetSettings, useUpdateCustomer,
  type Quote, type QuoteExportMapping, type QuoteExportPreflight } from "@workspace/api-client-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"

const customerFields = [
  ["jobberClientId", "Jobber Client ID"], ["clientFirstName", "First name"],
  ["clientLastName", "Last name"], ["clientCompanyName", "Company name"],
  ["clientEmail", "Email"], ["clientMainPhone", "Phone"],
  ["jobberPropertyId", "Jobber Property ID"], ["propertyStreet1", "Property Street 1"],
  ["propertyStreet2", "Property Street 2"], ["propertyCity", "Property city"],
  ["propertyStateProvince", "Property state/province"], ["propertyZipPostalCode", "Property ZIP/postal code"],
  ["propertyCountry", "Property country"],
] as const

export function CustomerIntegrationFields({ mapping, onChange }: {
  mapping: QuoteExportMapping; onChange: (mapping: QuoteExportMapping) => void
}) {
  return <div className="grid gap-3 sm:grid-cols-2">{customerFields.map(([key, label]) =>
    <div key={key} className="min-w-0 space-y-1">
      <Label htmlFor={`export-${key}`}>{label}</Label>
      <Input id={`export-${key}`} value={mapping[key] ?? ""} onChange={e => onChange({
        ...mapping, [key]: e.target.value,
        // An ID belongs to one address. Never retain it after changing that address.
        ...(key.startsWith("property") ? { jobberPropertyId: "" } : {}),
      })}/>
    </div>)}</div>
}

function download(csv: string, filename: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const cell = (value: unknown) => {
  let v = value == null ? "" : String(value)
  if (/^\s*[=+\-@]/.test(v)) v = `'${v}`
  return `"${v.replaceAll('"', '""')}"`
}

export function QuoteExportCard({quote, isDirty, pricingBlockers}: {
  quote: Quote; isDirty: boolean; pricingBlockers: string[]
}) {
  const { toast } = useToast()
  const { data: customer, isLoading: customerLoading } = useGetCustomer(quote.customerId ?? 0, {
    query: { enabled: Boolean(quote.customerId), queryKey: getGetCustomerQueryKey(quote.customerId ?? 0) },
  })
  const { data: settings, isLoading: settingsLoading } = useGetSettings()
  const updateCustomer = useUpdateCustomer()
  const [mapping, setMapping] = useState<QuoteExportMapping>({})
  const initialized = useRef<number | null>(null)
  const [check, setCheck] = useState<{key: string; result: QuoteExportPreflight} | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const key = JSON.stringify([quote.id, quote.updatedAt, mapping])
  useEffect(() => {
    if (initialized.current === quote.id || settingsLoading || (quote.customerId && customerLoading)) return
    initialized.current = quote.id
    const [first = "", ...last] = quote.customerName.trim().split(/\s+/)
    setMapping({ clientFirstName: first, clientLastName: last.join(" "), clientEmail: quote.customerEmail ?? "",
      ...customer?.integrationMapping, quoteStatus: "Draft", lineItemDetail: "summary", includeInternalCost: false,
      contractDisclaimer: settings?.proposalTerms ?? "" })
  }, [quote, customer, customerLoading, settings, settingsLoading])
  useEffect(() => {
    let live = true
    setError("")
    const timer = setTimeout(() => {
      preflightQuoteExport(quote.id, { destination: "jobber", format: "csv", mapping }).then(result => {
        if (live) setCheck({ key, result })
      }).catch(() => { if (live) setError("Could not validate export. Check your connection and try again.") })
    }, 300)
    return () => { live = false; clearTimeout(timer) }
  }, [key])
  const set = (field: keyof QuoteExportMapping, value: unknown) => setMapping(current => ({
    ...current, [field]: value,
    ...(["taxMethod", "existingTaxRateName", "existingTaxRatePercentage", "newTaxRateName", "newTaxRate"].includes(field) ? { taxConfirmed: false } : {}),
    ...(field === "taxable" ? { taxConfirmed: false, ...(value === "FALSE" ? {
      taxMethod: undefined, existingTaxRateName: undefined, existingTaxRatePercentage: undefined,
      newTaxRateName: undefined, newTaxRate: undefined,
    } : {}) } : {}),
  }))
  const ready = check?.key === key && check.result.ready && !isDirty && !pricingBlockers.length
  const select = (field: keyof QuoteExportMapping, label: string, options: string[], blank = false) =>
    <div className="space-y-1"><Label htmlFor={`export-${field}`}>{label}</Label>
      <select id={`export-${field}`} className="h-10 w-full rounded-md border bg-background px-3 text-sm"
        value={String(mapping[field] ?? "")} onChange={e => set(field, e.target.value || undefined)}>
        {blank && <option value="">Not configured</option>}{options.map(v => <option key={v} value={v}>{v === "summary" ? "Single summarized service" : v === "scope" ? "Customer-facing scope items" : v}</option>)}
      </select></div>
  const textField = (field: keyof QuoteExportMapping, label: string, numeric = false) =>
    <div className="space-y-1"><Label htmlFor={`export-${field}`}>{label}</Label><Input id={`export-${field}`}
      type={numeric ? "number" : "text"} min={numeric ? 0 : undefined} step={numeric ? "any" : undefined}
      value={String(mapping[field] ?? "")} onChange={e => set(field, numeric ? (e.target.value === "" ? undefined : Number(e.target.value)) : e.target.value)}/></div>
  const exportCsv = async () => {
    if (!ready) return
    setBusy(true)
    try {
      const csv = await exportJobberQuoteCsv(quote.id, { destination: "jobber", format: "csv", mapping }, { responseType: "text" })
      download(csv, `${quote.quoteNumber}-jobber.csv`)
      toast({title: "Jobber draft CSV downloaded", description: "Review the imported draft in Jobber before sending it."})
    } catch (e) { setError(e instanceof Error ? e.message : "Export failed.") }
    finally { setBusy(false) }
  }
  const generic = () => {
    const rows = [
      ["Quote", "Customer", "Email", "Project", "Status", "Customer-facing scope", "Material cost", "Internal labor cost", "Final selling price"],
      [quote.quoteNumber, quote.customerName, quote.customerEmail, quote.projectName, quote.status, quote.proposalDescription,
        quote.pricing.materialCost, quote.pricing.laborOverride ?? quote.pricing.laborCost, quote.pricing.finalSellingPrice],
      [], ["Category", "Description", "Qty", "Unit", "Unit cost", "Extended cost", "Cost classification"],
      ...quote.assembly.map(l => [l.category, l.description, l.quantity, l.unit, l.unitCost, l.extendedCost, l.intentionalExclusionReason ?? ""]),
    ]
    download(rows.map(row => row.map(cell).join(",")).join("\r\n") + "\r\n", `${quote.quoteNumber}-generic.csv`)
  }
  return <Card id="quote-integrations-exports" data-testid="quote-export-card">
    <CardHeader><CardTitle>Export Quote</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 text-sm"><h3 className="font-semibold">Jobber · Quote Import CSV</h3>
          <p className="break-words">{quote.customerName} · {quote.projectName}</p>
          <p className="text-muted-foreground">{mapping.jobberPropertyId ? `Property ID: ${mapping.jobberPropertyId}` :
            [mapping.propertyStreet1, mapping.propertyCity, mapping.propertyStateProvince].filter(Boolean).join(", ") || "Add the property in Advanced Jobber Mapping."}</p>
          <p className="mt-1">${quote.pricing.finalSellingPrice.toFixed(2)} · Jobber Status: {mapping.quoteStatus ?? "Draft"}</p>
        </div>
        <div className="flex flex-wrap gap-2"><Button data-testid="button-download-jobber-csv" disabled={!ready || busy} onClick={exportCsv}>Download Jobber Quote CSV</Button>
          <Button variant="outline" onClick={generic} disabled={isDirty}>Generic Quote CSV</Button></div>
      </div>
      <div className="rounded-md border p-3 text-sm" data-testid="jobber-export-readiness">
        <p className="font-semibold">{ready ? "Ready for Jobber Export" : "Jobber Export Needs Review"}</p>
        {isDirty && <p>Save quote changes before exporting.</p>}
        {pricingBlockers.length > 0 && <p>Resolve required material pricing before exporting.</p>}
        {check?.key !== key && !error && <p>Checking saved quote and mapping…</p>}
        {check?.key === key && check.result.issues.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5">
          {check.result.issues.map((i, n) => <li key={n}>{i.message}</li>)}</ul>}
        {error && <p role="alert" className="text-destructive">{error}</p>}
      </div>
      <details><summary className="cursor-pointer text-sm font-semibold">Advanced Jobber Mapping</summary>
        <div className="mt-4 space-y-5">
          <CustomerIntegrationFields mapping={mapping} onChange={setMapping}/>
          {quote.customerId && <div><Button variant="outline" disabled={updateCustomer.isPending} onClick={async () => {
            try {
              const integrationMapping = Object.fromEntries(customerFields.map(([k]) => [k, mapping[k] ?? ""]))
              await updateCustomer.mutateAsync({ id: quote.customerId!, data: { integrationMapping } })
              toast({title: "Customer / primary property mapping saved", description: "These fields will be reused for this customer's future exports."})
            } catch { setError("Could not save customer mapping.") }
          }}>Save mapping to customer / primary property</Button><p className="mt-1 text-xs text-muted-foreground">Only identity and primary-property fields are saved. Confirm the property for each job.</p></div>}
          <div className="grid gap-3 sm:grid-cols-2">
            {select("quoteStatus", "Jobber quote status", ["Draft", "Awaiting Response"])}
            {select("lineItemDetail", "Jobber Line Item Detail", ["summary", "scope"])}
          </div>
          <p className="text-xs text-muted-foreground">Summary = one summarized service (default). Scope = up to 10 intentional customer-facing items, never a material dump.</p>
          {mapping.lineItemDetail === "scope" && <div className="space-y-3">
            {(mapping.scopeLines ?? []).map((line, i) => <div key={i} className="rounded-md border p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                {(["name", "description", "quantity", "unitPrice", ...(mapping.includeInternalCost ? ["unitCost"] : [])] as const).map(field =>
                  <div key={field}><Label htmlFor={`scope-${i}-${field}`}>{field.replace(/([A-Z])/g, " $1")}</Label><Input id={`scope-${i}-${field}`}
                    type={["quantity", "unitPrice", "unitCost"].includes(field) ? "number" : "text"}
                    min="0" step="any" value={String(line[field as keyof typeof line] ?? "")} onChange={e => set("scopeLines", mapping.scopeLines!.map((l, n) =>
                      i === n ? {...l, [field]: ["quantity", "unitPrice", "unitCost"].includes(field) ? Number(e.target.value) : e.target.value} : l))}/></div>)}
              </div><Button variant="ghost" onClick={() => set("scopeLines", mapping.scopeLines!.filter((_, n) => n !== i))}>Remove line</Button>
            </div>)}
            <Button variant="outline" disabled={(mapping.scopeLines?.length ?? 0) >= 10} onClick={() => set("scopeLines", [...mapping.scopeLines ?? [], {name: "", description: "", quantity: 1, unitPrice: 0}])}>Add customer-facing scope line</Button>
            <p className="text-xs text-muted-foreground">Allocate the saved selling price deliberately. Export is blocked unless all lines, discounts and taxes reconcile to the saved total.</p>
          </div>}
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={mapping.includeInternalCost ?? false} onChange={e => set("includeInternalCost", e.target.checked)}/>Include internal unit cost in Jobber (contractor-only cost field)</label>
          <div className="rounded-md border p-3 space-y-3"><h4 className="text-sm font-semibold">Tax review</h4>
            {select("taxable", "Taxable service?", ["TRUE", "FALSE"], true)}
            {mapping.taxable === "TRUE" && <div className="grid gap-3 sm:grid-cols-2">
              {select("taxMethod", "Tax method", ["Inclusive", "Exclusive"], true)}
              {textField("existingTaxRateName", "Existing Jobber tax rate name")}
              {textField("existingTaxRatePercentage", "Verified existing rate (%)", true)}
              {textField("newTaxRateName", "Or: new tax rate name")}
              {textField("newTaxRate", "New rate (%)", true)}
            </div>}
            <label className="flex gap-2 text-sm"><input type="checkbox" checked={mapping.taxConfirmed ?? false} onChange={e => set("taxConfirmed", e.target.checked)}/>I verified the tax treatment for this job.</label>
          </div>
          <details><summary className="cursor-pointer text-sm">Billing, message, terms & adjustments</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(["billingStreet1","billingStreet2","billingCity","billingStateProvince","billingZipPostalCode","billingCountry"] as const).map(k =>
              <div key={k}>{textField(k, k.replace(/([A-Z])/g, " $1"))}</div>)}
            {select("discountType", "Discount type", ["Unit", "Percentage"], true)}{textField("discountAmount", "Intentional discount amount", true)}
            {select("depositType", "Deposit type", ["Unit", "Percentage"], true)}{textField("depositAmount", "Intentional deposit amount", true)}
            {textField("introductionTitle", "Introduction title")}
            {(["quoteMessage", "introductionBody", "contractDisclaimer"] as const).map(k =>
              <div key={k} className="sm:col-span-2"><Label htmlFor={`export-${k}`}>{k.replace(/([A-Z])/g, " $1")}</Label><Textarea id={`export-${k}`} value={mapping[k] ?? ""} onChange={e => set(k, e.target.value)}/></div>)}
            {(["autoVisitReminders", "autoJobFollowups", "autoQuoteFollowups", "autoInvoiceFollowups", "autoReviewRequests"] as const).map(k =>
              <div key={k}>{select(k, k.replace(/([A-Z])/g, " $1"), ["TRUE", "FALSE"], true)}</div>)}
          </div></details>
        </div>
      </details>
      <p className="text-xs text-muted-foreground">Jobber: structurally checked against its official 119-column sample; a live import still needs verification. QuickBooks Online and Housecall Pro exports are hidden for beta because direct import compatibility is unverified. Generic CSV contains internal estimating data and is not a customer proposal.</p>
    </CardContent>
  </Card>
}
