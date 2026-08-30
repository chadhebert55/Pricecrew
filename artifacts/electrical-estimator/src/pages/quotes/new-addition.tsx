import { type AdditionCircuitEntry, type AdditionInputs, useGetSettings, usePreviewQuote } from "@workspace/api-client-react"
import { pricingWarningKey, pricingWarningMessage } from "@/lib/pricing-warnings"
import { CustomerPicker } from "@/components/customer-picker"
import { PlanTakeoffReview } from "@/components/plan-takeoff-review"
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
import { QuoteBuilderRecovery } from "@/components/quote-builder-recovery"

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
  circuitEntries: [{
    amperage: 20,
    poleCount: 1,
    protectionType: "AFCI",
    cableType: "12/2 NM-B",
    quantity: 1,
  }],
  subpanelOption: "No Subpanel",
  feederDistance: 50,
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

const defaultCircuitEntry: AdditionCircuitEntry = {
  amperage: 15,
  poleCount: 1,
  protectionType: "Standard",
  cableType: "14/2 NM-B",
  quantity: 1,
}

function legacyCircuitEntries(inputs: AdditionInputs): AdditionCircuitEntry[] {
  if (inputs.circuitCount <= 0) return []
  return [{
    amperage: inputs.breakerAmperage,
    poleCount: inputs.breakerPoleCount,
    protectionType: inputs.breakerProtectionType,
    cableType: inputs.cableType,
    quantity: inputs.circuitCount,
  }]
}

export function NewAdditionQuote() {
  const [, setLocation] = useLocation()
  const createQuote = useQuoteCreateMutation()
  const previewQuote = usePreviewQuote()
  const settingsQuery = useGetSettings()
  const { data: settings } = settingsQuery
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
  const [takeoffId, setTakeoffId] = useState<number | undefined>()
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

  const hasSubpanel = inputs.subpanelOption !== undefined && inputs.subpanelOption !== "No Subpanel"
  const setSubpanelIncluded = (included: boolean) => {
    setInputs((current) => ({
      ...current,
      subpanelOption: included
        ? current.subpanelOption === "60A Subpanel" || current.subpanelOption === "100A Subpanel"
          ? current.subpanelOption
          : "60A Subpanel"
        : "No Subpanel",
      feederDistance: included ? current.feederDistance ?? 50 : current.feederDistance,
    }))
  }

  const applyAllowances = () => {
    setInputs((current) => ({ ...current, ...allowances }))
  }

  const circuitEntries = inputs.circuitEntries ?? legacyCircuitEntries(inputs)
  const updateCircuitEntries = (entries: AdditionCircuitEntry[]) => {
    const first = entries[0]
    setInputs((current) => ({
      ...current,
      circuitEntries: entries,
      circuitCount: entries.reduce((sum, entry) => sum + entry.quantity, 0),
      ...(first ? {
        // Keep the legacy scalar fields synchronized for older consumers.
        breakerAmperage: first.amperage === 30 ? 20 : first.amperage,
        breakerPoleCount: first.poleCount === 2 ? 1 : first.poleCount,
        breakerProtectionType: first.protectionType,
        cableType: first.cableType === "10/2 NM-B" || first.cableType === "10/3 NM-B" ? "12/2 NM-B" : first.cableType,
      } : {}),
    }))
  }
  const updateCircuitEntry = (index: number, patch: Partial<AdditionCircuitEntry>) => {
    const entries = circuitEntries.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...patch } : entry)
    updateCircuitEntries(entries)
  }
  const setCircuitAmperage = (index: number, amperage: AdditionCircuitEntry["amperage"]) => {
    const current = circuitEntries[index]
    const cableType = amperage === 30
      ? "10/3 NM-B"
      : amperage === 20
        ? "12/2 NM-B"
        : current.cableType === "10/2 NM-B" || current.cableType === "10/3 NM-B" ? "14/2 NM-B" : current.cableType
    updateCircuitEntry(index, {
      amperage,
      cableType,
      poleCount: amperage === 30 ? 2 : current.poleCount,
    })
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
        takeoffId,
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

            <PlanTakeoffReview
              module="ADDITION"
              baseInputs={inputs as unknown as Record<string, unknown>}
              onTakeoffApplied={(reviewedInputs, reviewedTakeoffId) => {
                setInputs((current) => ({
                  ...current,
                  ...reviewedInputs,
                } as AdditionInputs))
                setTakeoffId(reviewedTakeoffId)
              }}
            />

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
                    <div><p className="font-semibold">{squareFeet.toLocaleString()} square feet used for allowances</p><p className="text-xs text-muted-foreground">{inputs.squareFootageOverride === undefined ? `${calculatedSquareFeet.toLocaleString()} square feet calculated from length × width.` : "Direct square-foot override is active; clear it to use the dimensions."} Suggested allowances update devices, route, and crew hours; the circuit mix stays contractor-defined.</p></div>
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
                    <div className="space-y-2"><Label htmlFor="addition-route">Common wiring route (FT)</Label><Input id="addition-route" type="number" min="0" value={inputs.routeLength} onChange={(event) => setNumber("routeLength", event.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="addition-home-run">Home-run cable (FT per circuit)</Label><Input id="addition-home-run" type="number" min="0" value={inputs.homeRunLength} onChange={(event) => setNumber("homeRunLength", event.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="addition-panel">Panel manufacturer</Label><select id="addition-panel" value={inputs.panelManufacturer} onChange={(event) => setInputs((current) => ({ ...current, panelManufacturer: event.target.value as AdditionInputs["panelManufacturer"] }))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="Siemens">Siemens / ITE</option><option value="Eaton">Eaton BR</option><option value="Square D">Square D Homeline</option></select></div>
                  </div>
                  <div className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-4">
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h4 className="font-semibold">Branch-circuit schedule</h4>
                        <p className="mt-1 text-xs text-muted-foreground">Add each breaker and cable combination separately. Unsupported catalog combinations stay unresolved in the estimate.</p>
                      </div>
                      <Button type="button" variant="outline" className="shrink-0" onClick={() => updateCircuitEntries([...circuitEntries, { ...defaultCircuitEntry }])}>
                        Add circuit
                      </Button>
                    </div>
                    <div className="space-y-4">
                      {circuitEntries.map((entry, index) => (
                        <fieldset key={index} className="rounded-lg border bg-background p-4">
                          <legend className="px-1 text-sm font-semibold">Circuit {index + 1}</legend>
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                            <div className="space-y-2">
                              <Label htmlFor={`addition-circuit-${index}-label`}>Room or equipment label <span className="font-normal text-muted-foreground">(optional)</span></Label>
                              <Input
                                id={`addition-circuit-${index}-label`}
                                aria-label={`Circuit ${index + 1} room or equipment label`}
                                value={entry.label ?? ""}
                                maxLength={80}
                                placeholder="e.g. Dryer or Bedroom"
                                onChange={(event) => {
                                  const label = event.target.value
                                  updateCircuitEntry(index, { label: label.trim() ? label : undefined })
                                }}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`addition-circuit-${index}-amperage`}>Amperage</Label>
                              <select id={`addition-circuit-${index}-amperage`} aria-label={`Circuit ${index + 1} amperage`} value={entry.amperage} onChange={(event) => setCircuitAmperage(index, Number(event.target.value) as AdditionCircuitEntry["amperage"])} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                                <option value={15}>15A</option><option value={20}>20A</option><option value={30}>30A</option>
                              </select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`addition-circuit-${index}-poles`}>Poles</Label>
                              <select id={`addition-circuit-${index}-poles`} aria-label={`Circuit ${index + 1} pole count`} value={entry.poleCount} onChange={(event) => updateCircuitEntry(index, { poleCount: Number(event.target.value) as AdditionCircuitEntry["poleCount"] })} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                                <option value={1}>1-pole</option><option value={2}>2-pole</option>
                              </select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`addition-circuit-${index}-protection`}>Protection</Label>
                              <select id={`addition-circuit-${index}-protection`} aria-label={`Circuit ${index + 1} protection`} value={entry.protectionType} onChange={(event) => updateCircuitEntry(index, { protectionType: event.target.value as AdditionCircuitEntry["protectionType"] })} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                                <option value="Standard">Standard</option><option value="AFCI">AFCI</option><option value="GFCI">GFCI</option><option value="Dual Function">Dual Function</option>
                              </select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`addition-circuit-${index}-cable`}>Cable</Label>
                              <select id={`addition-circuit-${index}-cable`} aria-label={`Circuit ${index + 1} cable`} value={entry.cableType} onChange={(event) => updateCircuitEntry(index, { cableType: event.target.value as AdditionCircuitEntry["cableType"] })} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                                <option value="14/2 NM-B">14/2 NM-B</option><option value="12/2 NM-B">12/2 NM-B</option><option value="14/3 NM-B">14/3 NM-B</option><option value="10/2 NM-B">10/2 NM-B</option><option value="10/3 NM-B">10/3 NM-B</option>
                              </select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`addition-circuit-${index}-quantity`}>Quantity</Label>
                              <div className="flex gap-2">
                                <Input id={`addition-circuit-${index}-quantity`} aria-label={`Circuit ${index + 1} quantity`} type="number" min="1" step="1" value={entry.quantity} onChange={(event) => updateCircuitEntry(index, { quantity: Math.max(1, Math.floor(Number(event.target.value) || 1)) })} />
                                <Button type="button" variant="outline" size="icon" aria-label={`Remove circuit ${index + 1}`} disabled={circuitEntries.length === 1} onClick={() => updateCircuitEntries(circuitEntries.filter((_, entryIndex) => entryIndex !== index))}>×</Button>
                              </div>
                            </div>
                          </div>
                        </fieldset>
                      ))}
                    </div>
                  </div>
                  <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-4">
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="addition-add-subpanel">Add Subpanel?</Label>
                        <select
                          id="addition-add-subpanel"
                          value={hasSubpanel ? "yes" : "no"}
                          onChange={(event) => setSubpanelIncluded(event.target.value === "yes")}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        >
                          <option value="no">No</option>
                          <option value="yes">Yes</option>
                        </select>
                        <p className="text-xs text-muted-foreground">
                          Add a dedicated subpanel when the addition needs separate panel space. Missing verified catalog prices remain unresolved.
                        </p>
                      </div>
                      {hasSubpanel && (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="addition-subpanel-size">Subpanel size</Label>
                            <select
                              id="addition-subpanel-size"
                              value={inputs.subpanelOption}
                              onChange={(event) => setInputs((current) => ({
                                ...current,
                                subpanelOption: event.target.value as AdditionInputs["subpanelOption"],
                              }))}
                              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                            >
                              <option value="60A Subpanel">60A</option>
                              <option value="100A Subpanel">100A</option>
                            </select>
                            <p className="text-xs text-muted-foreground">
                              Choose the feeder ampacity for the addition subpanel.
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="addition-feeder-distance">Feeder distance (FT)</Label>
                            <Input
                              id="addition-feeder-distance"
                              type="number"
                              min="0"
                              step="1"
                              value={inputs.feederDistance ?? 0}
                              onChange={(event) => setNumber("feederDistance", event.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                              {inputs.subpanelOption === "60A Subpanel"
                                ? "Uses #6 copper SER as the proper 4-wire feeder when a verified catalog row is available."
                                : "Uses #1 aluminum SER as the proper 4-wire feeder when a verified catalog row is available."}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
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
             <QuoteBuilderRecovery settings={settingsQuery} revision={revision} />
            <div className="flex items-start gap-3 rounded-md border border-primary/20 bg-primary/10 p-3 text-sm"><Info className="mt-0.5 shrink-0 text-primary" size={16} /><p className="text-secondary-foreground/80">The square-foot figure creates starting allowances only. Final pricing is based on the selected scope, materials, labor, markup, and margin.</p></div>
            {pricing && previewIsCurrent ? <><>{pricing.pricingWarnings.length > 0 && <div className="rounded-md border border-amber-400/40 bg-amber-400/10 p-3"><div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-300"><TriangleAlert size={16} /> Estimate needs confirmation</div><ul className="list-disc space-y-1 pl-5 text-xs text-secondary-foreground/80">{pricing.pricingWarnings.map((warning, index) => <li key={pricingWarningKey(warning, index)}>{pricingWarningMessage(warning)}</li>)}</ul></div>}</><div className="rounded-md border border-secondary-border bg-secondary-foreground/5 p-3 text-sm"><p className="mb-2 font-semibold">Circuit schedule</p><div className="space-y-1 text-xs">{circuitEntries.map((entry, index) => <div key={index} className="flex justify-between gap-3"><span>{entry.label ? <><span className="font-semibold">{entry.label}</span>{" · "}</> : null}{entry.quantity} × {entry.amperage}A {entry.poleCount}-pole {entry.protectionType}</span><span className="font-mono text-right">{entry.cableType}</span></div>)}</div></div><div className="rounded-md border border-secondary-border bg-secondary-foreground/5 p-3 text-sm"><p className="font-semibold">Subpanel scope</p><p className="mt-1 text-xs text-secondary-foreground/75">{inputs.subpanelOption ?? "No Subpanel"}{(inputs.subpanelOption ?? "No Subpanel") !== "No Subpanel" ? ` · ${inputs.feederDistance ?? 0} ft feeder` : ""}</p></div><div className="space-y-2 text-sm"><div className="flex justify-between"><span>Material Cost</span><span className="font-mono">${pricing.materialCost.toFixed(2)}</span></div><div className="flex justify-between"><span>Loaded Internal Labor Cost</span><span className="font-mono">${pricing.laborCost.toFixed(2)}</span></div>{pricing.laborSellAmount !== undefined && <div className="flex justify-between"><span>Customer Labor ({pricing.laborRateType} @ ${pricing.laborSellRate?.toFixed(2)}/hr)</span><span className="font-mono">${pricing.laborSellAmount.toFixed(2)}</span></div>}<div className="flex justify-between"><span>Gross Profit</span><span className="font-mono">${pricing.grossProfit.toFixed(2)}</span></div><div className="flex justify-between"><span>Gross Margin</span><span className="font-mono">{(pricing.grossMargin * 100).toFixed(1)}%</span></div><div className="flex justify-between border-t border-secondary-border pt-2 font-bold"><span>Final Selling Price</span><span className="font-mono text-primary">${pricing.finalSellingPrice.toFixed(2)}</span></div></div></> : <div className="py-6 text-center text-sm text-secondary-foreground/70">Updating authoritative estimate...</div>}
            <div className="space-y-3 border-t border-secondary-border pt-4"><div className="space-y-2"><Label htmlFor="addition-labor-override">Internal Labor Cost Override ($)</Label><Input id="addition-labor-override" min="0" step="0.01" type="number" value={laborOverride} onChange={(event) => setLaborOverride(event.target.value)} placeholder={pricing ? `Calculated: ${pricing.laborCost.toFixed(2)}` : "Optional"} /></div><div className="space-y-2"><Label htmlFor="addition-price-override">Selling Price Override ($)</Label><Input id="addition-price-override" min="0" step="0.01" type="number" value={sellingPriceOverride} onChange={(event) => setSellingPriceOverride(event.target.value)} placeholder={pricing ? `Calculated: ${pricing.calculatedSellingPrice.toFixed(2)}` : "Optional"} /></div></div>
            {previewQuote.isError && <p className="text-sm text-destructive">The estimate preview could not be calculated.</p>}
            <Button className="w-full text-lg font-bold" size="lg" type="submit" disabled={!settingsLoaded || createQuote.isPending || !previewIsCurrent || previewQuote.isError}>{createQuote.isPending ? "Submitting..." : (!settingsLoaded || !previewIsCurrent) ? "Calculating..." : "Generate Addition Quote"}</Button>
          </CardContent></Card></div></div>
        </div>
      </form>
    </div>
  )
}
