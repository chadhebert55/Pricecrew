import { type AdditionInputs, useGetSettings, usePreviewQuote } from "@workspace/api-client-react"
import { pricingWarningKey, pricingWarningMessage } from "@/lib/pricing-warnings"
import { CustomerPicker } from "@/components/customer-picker"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useQuoteCreateMutation } from "@/hooks/use-quote-create-mutation"
import { useQuoteRevisionPrefill } from "@/hooks/use-quote-revision-prefill"
import { Calculator, HousePlus, Info, TriangleAlert } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useLocation } from "wouter"

const initialInputs: AdditionInputs = {
  length: 20,
  width: 16,
  receptacles: 6,
  switches: 2,
  dimmers: 1,
  recessedLights: 4,
  ceilingFans: 1,
  customerSuppliedFans: true,
  circuitCount: 1,
  routeLength: 50,
  homeRunLength: 50,
  panelManufacturer: "Siemens",
  breakerAmperage: 20,
  breakerPoleCount: 1,
  breakerProtectionType: "AFCI",
  cableType: "12/2 NM-B",
  crewSize: 1,
  crewHours: 8,
  laborAdjustmentHours: 0,
  laborRateType: "residential",
  notes: "",
}

function optionalAmount(value: string) {
  if (value.trim() === "") return null
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? amount : null
}

function nonNegativeNumber(value: string) {
  return Math.max(0, Number(value) || 0)
}

export function NewAdditionQuote() {
  const [, setLocation] = useLocation()
  const createQuote = useQuoteCreateMutation()
  const previewQuote = usePreviewQuote()
  const { data: settings } = useGetSettings()
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [previewedInputKey, setPreviewedInputKey] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [customerEmail, setCustomerEmail] = useState("")
  const [customerId, setCustomerId] = useState<number | undefined>()
  const [projectName, setProjectName] = useState("")
  const [proposalDescription, setProposalDescription] = useState(
    "Provide labor and listed materials for the selected addition electrical scope, including the selected outlets, lighting, ceiling-fan connections, switching, branch circuits, testing, and final trim. Final layout, equipment specifications, applicable protection requirements, and existing conditions will be verified before work begins.",
  )
  const [laborOverride, setLaborOverride] = useState("")
  const [sellingPriceOverride, setSellingPriceOverride] = useState("")
  const [inputs, setInputs] = useState<AdditionInputs>(initialInputs)
  const revision = useQuoteRevisionPrefill("ADDITION", {
    setCustomerName,
    setCustomerEmail,
    setCustomerId,
    setProjectName,
    setProposalDescription,
    setInputs,
    setSettingsLoaded,
  })

  useEffect(() => {
    if (settings && !settingsLoaded && !revision.isRevision) {
      setInputs((current) => ({
        ...current,
        laborAdjustmentHours: settings.additionLaborAdjustmentHours ?? 0,
      }))
      setSettingsLoaded(true)
    }
  }, [revision.isRevision, settings, settingsLoaded])

  const calculatedSquareFeet = Math.round(Math.max(0, inputs.length) * Math.max(0, inputs.width))
  const squareFeet = inputs.squareFootageOverride ?? calculatedSquareFeet
  const allowances = useMemo(() => ({
    receptacles: Math.max(1, Math.ceil(squareFeet / 75)),
    switches: Math.max(1, Math.ceil(squareFeet / 250)),
    dimmers: Math.max(0, Math.ceil(squareFeet / 500)),
    recessedLights: Math.max(1, Math.ceil(squareFeet / 100)),
    ceilingFans: squareFeet >= 250 ? 1 : 0,
    circuitCount: Math.max(1, Math.ceil(squareFeet / 500)),
    routeLength: Math.max(20, Math.ceil(squareFeet / 4)),
    homeRunLength: Math.max(20, Math.ceil(squareFeet / 4)),
    crewHours: Math.max(4, Math.ceil(squareFeet / 50)),
  }), [squareFeet])

  const previewPayload = {
    module: "ADDITION" as const,
    jobInputs: inputs,
    laborOverride: optionalAmount(laborOverride),
    sellingPriceOverride: optionalAmount(sellingPriceOverride),
  }
  const currentInputKey = JSON.stringify(previewPayload)
  const previewIsCurrent = currentInputKey === previewedInputKey

  useEffect(() => {
    if (!settingsLoaded) return
    const inputKey = JSON.stringify(previewPayload)
    const timeout = window.setTimeout(() => {
      previewQuote.mutate({ data: previewPayload }, { onSuccess: () => setPreviewedInputKey(inputKey) })
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [inputs, laborOverride, sellingPriceOverride, settingsLoaded])

  const setNumber = (key: keyof AdditionInputs, value: string) => {
    setInputs((current) => ({ ...current, [key]: nonNegativeNumber(value) }))
  }

  const setOptionalNumber = (key: keyof AdditionInputs, value: string) => {
    setInputs((current) => ({ ...current, [key]: value.trim() === "" ? undefined : nonNegativeNumber(value) }))
  }

  const applyAllowances = () => {
    setInputs((current) => ({ ...current, ...allowances }))
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!settingsLoaded || !previewIsCurrent) return
    createQuote.mutate({
      data: {
        customerId,
        sourceQuoteId: revision.sourceQuoteId,
        customerName,
        customerEmail: customerEmail || null,
        projectName,
        module: "ADDITION",
        jobInputs: inputs,
        proposalDescription,
        laborOverride: optionalAmount(laborOverride),
        sellingPriceOverride: optionalAmount(sellingPriceOverride),
      },
    }, { onSuccess: (quote) => setLocation(`/quotes/${quote.id}`) })
  }

  const pricing = previewQuote.data?.pricing
  const quantities: Array<{ key: keyof AdditionInputs; label: string; description: string }> = [
    { key: "receptacles", label: "Standard receptacles", description: "General-use outlet locations" },
    { key: "switches", label: "Switches", description: "Single-location lighting controls" },
    { key: "dimmers", label: "Dimmers", description: "Dimmable lighting controls" },
    { key: "recessedLights", label: "Recessed lights", description: "Ceiling lighting locations" },
    { key: "ceilingFans", label: "Ceiling fans", description: "Fan-rated outlet, support, and connection" },
  ]

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-24">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New Addition Quote</h1>
        <p className="mt-1 text-muted-foreground">Residential Addition Electrical Builder</p>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <Card className="border-t-4 border-t-secondary">
              <CardHeader><CardTitle>Project Details</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <CustomerPicker idPrefix="addition" customerId={customerId} customerName={customerName} customerEmail={customerEmail} onCustomerIdChange={setCustomerId} onCustomerNameChange={setCustomerName} onCustomerEmailChange={setCustomerEmail} />
                <div className="space-y-2"><Label htmlFor="addition-customer">Customer Name *</Label><Input id="addition-customer" required value={customerName} onChange={(event) => { setCustomerId(undefined); setCustomerName(event.target.value) }} /></div>
                <div className="space-y-2"><Label htmlFor="addition-email">Customer Email</Label><Input id="addition-email" type="email" value={customerEmail} onChange={(event) => { setCustomerId(undefined); setCustomerEmail(event.target.value) }} /></div>
                <div className="space-y-2 md:col-span-2"><Label htmlFor="addition-project">Project Name *</Label><Input id="addition-project" required value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Rear family-room addition" /></div>
                <div className="space-y-2 md:col-span-2"><Label htmlFor="addition-proposal">Customer-facing Proposal Description *</Label><Textarea id="addition-proposal" required value={proposalDescription} onChange={(event) => setProposalDescription(event.target.value)} /></div>
              </CardContent>
            </Card>

            <Card className="border-t-4 border-t-primary shadow-md">
              <CardHeader className="border-b border-primary/10 bg-primary/5">
                <div className="flex items-center gap-2"><HousePlus className="text-primary" size={20} /><CardTitle>Parametric Builder: Addition</CardTitle></div>
                <CardDescription>Size establishes editable starting allowances; it is not a fixed price per square foot.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8 pt-6">
                <section>
                  <h3 className="mb-4 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Addition size and allowances</h3>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="space-y-2"><Label htmlFor="addition-length">Length (FT)</Label><Input id="addition-length" type="number" min="0" value={inputs.length} onChange={(event) => setNumber("length", event.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="addition-width">Width (FT)</Label><Input id="addition-width" type="number" min="0" value={inputs.width} onChange={(event) => setNumber("width", event.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="addition-square-foot-override">Square-foot override (optional)</Label><Input id="addition-square-foot-override" type="number" min="0" value={inputs.squareFootageOverride ?? ""} onChange={(event) => setOptionalNumber("squareFootageOverride", event.target.value)} placeholder={`${calculatedSquareFeet} calculated`} /></div>
                  </div>
                  <div className="mt-4 flex flex-col justify-between gap-3 rounded-md border bg-muted/20 p-4 sm:flex-row sm:items-center">
                    <div><p className="font-semibold">{squareFeet.toLocaleString()} square feet used for allowances</p><p className="text-xs text-muted-foreground">{inputs.squareFootageOverride === undefined ? `${calculatedSquareFeet.toLocaleString()} square feet calculated from length × width.` : "Direct square-foot override is active; clear it to use the dimensions."}</p></div>
                    <Button type="button" variant="outline" onClick={applyAllowances}>Apply suggested allowances</Button>
                  </div>
                </section>

                <section>
                  <h3 className="mb-4 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Devices, lighting, and fans</h3>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {quantities.map((field) => <div key={field.key} className="rounded-lg border bg-muted/15 p-4"><div className="flex items-start justify-between gap-4"><div><Label htmlFor={`addition-${field.key}`}>{field.label}</Label><p className="mt-1 text-xs text-muted-foreground">{field.description}</p></div><Input id={`addition-${field.key}`} className="w-24 text-right font-mono" type="number" min="0" value={inputs[field.key] as number} onChange={(event) => setNumber(field.key, event.target.value)} /></div></div>)}
                  </div>
                  <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
                    <label className="flex items-start gap-3 text-sm font-medium"><Checkbox checked={inputs.customerSuppliedFans} onCheckedChange={(checked) => setInputs((current) => ({ ...current, customerSuppliedFans: checked === true }))} /><span>Customer supplies ceiling fans <span className="block pt-1 text-xs font-normal text-muted-foreground">Fan installation labor and fan-rated support remain included.</span></span></label>
                    {!inputs.customerSuppliedFans && <div className="mt-4 max-w-sm space-y-2"><Label htmlFor="addition-fan-cost">Contractor-supplied fan unit-cost override ($)</Label><Input id="addition-fan-cost" type="number" min="0" step="0.01" value={inputs.ceilingFanMaterialCostOverride ?? ""} onChange={(event) => setOptionalNumber("ceilingFanMaterialCostOverride", event.target.value)} placeholder="Use verified Price Book value" /></div>}
                  </div>
                </section>

                <section>
                  <h3 className="mb-4 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Circuits, route, and labor</h3>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="space-y-2"><Label htmlFor="addition-circuits">New branch circuits</Label><Input id="addition-circuits" type="number" min="0" value={inputs.circuitCount} onChange={(event) => setNumber("circuitCount", event.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="addition-route">Common wiring route (FT)</Label><Input id="addition-route" type="number" min="0" value={inputs.routeLength} onChange={(event) => setNumber("routeLength", event.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="addition-home-run">Home-run cable (FT per circuit)</Label><Input id="addition-home-run" type="number" min="0" value={inputs.homeRunLength} onChange={(event) => setNumber("homeRunLength", event.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="addition-panel">Panel manufacturer</Label><select id="addition-panel" value={inputs.panelManufacturer} onChange={(event) => setInputs((current) => ({ ...current, panelManufacturer: event.target.value as AdditionInputs["panelManufacturer"] }))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="Siemens">Siemens / ITE</option><option value="Eaton">Eaton BR</option><option value="Square D">Square D Homeline</option></select></div>
                    <div className="space-y-2"><Label htmlFor="addition-breaker-amps">Breaker amperage</Label><Input id="addition-breaker-amps" type="number" min="1" value={inputs.breakerAmperage} onChange={(event) => setNumber("breakerAmperage", event.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="addition-protection">Breaker protection</Label><select id="addition-protection" value={inputs.breakerProtectionType} onChange={(event) => setInputs((current) => ({ ...current, breakerProtectionType: event.target.value as AdditionInputs["breakerProtectionType"] }))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="Standard">Standard</option><option value="AFCI">AFCI / Arc Fault</option><option value="GFCI">GFCI</option><option value="Dual Function">Dual Function AFCI + GFCI</option></select></div>
                    <div className="space-y-2"><Label htmlFor="addition-cable">Circuit cable</Label><select id="addition-cable" value={inputs.cableType} onChange={(event) => setInputs((current) => ({ ...current, cableType: event.target.value as AdditionInputs["cableType"] }))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="12/2 NM-B">12/2 NM-B</option><option value="14/2 NM-B">14/2 NM-B</option><option value="14/3 NM-B">14/3 NM-B</option></select></div>
                    <div className="space-y-2"><Label htmlFor="addition-labor-rate">Labor sell rate</Label><select id="addition-labor-rate" value={inputs.laborRateType ?? "residential"} onChange={(event) => setInputs((current) => ({ ...current, laborRateType: event.target.value as AdditionInputs["laborRateType"] }))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="residential">Residential</option><option value="commercial">Commercial</option></select></div>
                    <div className="space-y-2"><Label htmlFor="addition-crew-size">Crew size</Label><Input id="addition-crew-size" type="number" min="1" value={inputs.crewSize} onChange={(event) => setNumber("crewSize", event.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="addition-crew-hours">Crew hours</Label><Input id="addition-crew-hours" type="number" min="0" step="0.25" value={inputs.crewHours} onChange={(event) => setNumber("crewHours", event.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="addition-labor-adjustment">Labor adjustment (hours)</Label><Input id="addition-labor-adjustment" type="number" step="0.25" value={inputs.laborAdjustmentHours ?? 0} onChange={(event) => setInputs((current) => ({ ...current, laborAdjustmentHours: Number(event.target.value) || 0 }))} /></div>
                  </div>
                </section>
                <div className="space-y-2"><Label htmlFor="addition-notes">Estimator Notes (Internal)</Label><Textarea id="addition-notes" value={inputs.notes} onChange={(event) => setInputs((current) => ({ ...current, notes: event.target.value }))} /></div>
              </CardContent>
            </Card>
          </div>

          <div><div className="sticky top-6"><Card className="border-primary bg-secondary text-secondary-foreground shadow-lg"><CardHeader className="border-b border-secondary-border"><div className="flex items-center gap-2"><Calculator className="text-primary" size={20} /><CardTitle className="text-secondary-foreground">Calculation Preview</CardTitle></div><CardDescription className="text-secondary-foreground/70">Uses the same server estimator as saved quote creation.</CardDescription></CardHeader><CardContent className="space-y-5 pt-6">
            <div className="flex items-start gap-3 rounded-md border border-primary/20 bg-primary/10 p-3 text-sm"><Info className="mt-0.5 shrink-0 text-primary" size={16} /><p className="text-secondary-foreground/80">The square-foot figure creates starting allowances only. Final pricing is based on the selected scope, materials, labor, markup, and margin.</p></div>
            {pricing && previewIsCurrent ? <><>{pricing.pricingWarnings.length > 0 && <div className="rounded-md border border-amber-400/40 bg-amber-400/10 p-3"><div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-300"><TriangleAlert size={16} /> Estimate needs confirmation</div><ul className="list-disc space-y-1 pl-5 text-xs text-secondary-foreground/80">{pricing.pricingWarnings.map((warning, index) => <li key={pricingWarningKey(warning, index)}>{pricingWarningMessage(warning)}</li>)}</ul></div>}</><div className="space-y-2 text-sm"><div className="flex justify-between"><span>Material Cost</span><span className="font-mono">${pricing.materialCost.toFixed(2)}</span></div><div className="flex justify-between"><span>Loaded Internal Labor Cost</span><span className="font-mono">${pricing.laborCost.toFixed(2)}</span></div>{pricing.laborSellAmount !== undefined && <div className="flex justify-between"><span>Customer Labor ({pricing.laborRateType} @ ${pricing.laborSellRate?.toFixed(2)}/hr)</span><span className="font-mono">${pricing.laborSellAmount.toFixed(2)}</span></div>}<div className="flex justify-between"><span>Gross Profit</span><span className="font-mono">${pricing.grossProfit.toFixed(2)}</span></div><div className="flex justify-between"><span>Gross Margin</span><span className="font-mono">{(pricing.grossMargin * 100).toFixed(1)}%</span></div><div className="flex justify-between border-t border-secondary-border pt-2 font-bold"><span>Final Selling Price</span><span className="font-mono text-primary">${pricing.finalSellingPrice.toFixed(2)}</span></div></div></> : <div className="py-6 text-center text-sm text-secondary-foreground/70">Updating authoritative estimate...</div>}
            <div className="space-y-3 border-t border-secondary-border pt-4"><div className="space-y-2"><Label htmlFor="addition-labor-override">Internal Labor Cost Override ($)</Label><Input id="addition-labor-override" min="0" step="0.01" type="number" value={laborOverride} onChange={(event) => setLaborOverride(event.target.value)} placeholder={pricing ? `Calculated: ${pricing.laborCost.toFixed(2)}` : "Optional"} /></div><div className="space-y-2"><Label htmlFor="addition-price-override">Selling Price Override ($)</Label><Input id="addition-price-override" min="0" step="0.01" type="number" value={sellingPriceOverride} onChange={(event) => setSellingPriceOverride(event.target.value)} placeholder={pricing ? `Calculated: ${pricing.calculatedSellingPrice.toFixed(2)}` : "Optional"} /></div></div>
            {previewQuote.isError && <p className="text-sm text-destructive">The estimate preview could not be calculated.</p>}
            <Button className="w-full text-lg font-bold" size="lg" type="submit" disabled={!settingsLoaded || createQuote.isPending || !previewIsCurrent || previewQuote.isError}>{createQuote.isPending ? "Submitting..." : (!settingsLoaded || !previewIsCurrent) ? "Calculating..." : "Generate Addition Quote"}</Button>
          </CardContent></Card></div></div>
        </div>
      </form>
    </div>
  )
}