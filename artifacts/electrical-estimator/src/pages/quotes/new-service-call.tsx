import {
  type ServiceCallInputs,
  usePreviewQuote,
  useGetSettings,
} from "@workspace/api-client-react"
import { pricingWarningKey, pricingWarningMessage } from "@/lib/pricing-warnings"
import { contractorMaterialName } from "@/lib/material-display"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Calculator, Info, TriangleAlert, Wrench, Plus, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { useLocation } from "wouter"
import { CustomerPicker } from "@/components/customer-picker"
import { useQuoteCreateMutation } from "@/hooks/use-quote-create-mutation"
import { useQuoteRevisionPrefill } from "@/hooks/use-quote-revision-prefill"
import { useQuoteBuilderDraft } from "@/hooks/use-quote-builder-draft"
import { QuoteBuilderRecovery } from "@/components/quote-builder-recovery"

const initialInputs: ServiceCallInputs = {
  serviceType: "Residential standard service visit",
  visitQuantity: 1,
  receptacleReplacementQuantity: 0,
  trReceptacleReplacementQuantity: 1,
  switchReplacementQuantity: 0,
  gfciReplacementQuantity: 0,
  crewSize: 1,
  crewHours: 2,
  laborRateType: "residential",
  materialMarkup: 25,
  targetMargin: 40,
  miscellaneousMaterials: [],
  notes: "",
}

function optionalAmount(value: string) {
  if (value.trim() === "") return null
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? amount : null
}

export function NewServiceCallQuote() {
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
    "Provide diagnostic troubleshooting and standard repair services per customer request. Labor and incidental materials included. Final scope and routing are subject to field verification."
  )
  const [laborOverride, setLaborOverride] = useState("")
  const [sellingPriceOverride, setSellingPriceOverride] = useState("")
  const [inputs, setInputs] = useState<ServiceCallInputs>(initialInputs)
  const revision = useQuoteRevisionPrefill("SERVICE_CALL", { setCustomerName, setCustomerEmail, setCustomerId, setProjectName, setProposalDescription, setInputs, setSettingsLoaded })
  const { draftRecovery } = useQuoteBuilderDraft({
    module: "SERVICE_CALL",
    ready: settingsLoaded && !revision.isRevision,
    values: { customerName, customerEmail, customerId, projectName, proposalDescription, inputs, laborOverride, sellingPriceOverride },
    setters: { setCustomerName, setCustomerEmail, setCustomerId, setProjectName, setProposalDescription, setInputs, setLaborOverride, setSellingPriceOverride },
  })
  const deviceLaborHours =
    inputs.receptacleReplacementQuantity * 0.5 +
    inputs.trReceptacleReplacementQuantity * 0.5 +
    inputs.switchReplacementQuantity * 0.5 +
    inputs.gfciReplacementQuantity * 0.75
  const totalLaborHours =
    inputs.visitQuantity * inputs.crewSize * inputs.crewHours + deviceLaborHours

  useEffect(() => {
    if (settings && !settingsLoaded && !revision.isRevision) {
      setInputs((current) => ({
        ...current,
        visitQuantity: settings.serviceCallVisitQuantity,
        crewSize: settings.serviceCallCrewSize,
        crewHours: settings.serviceCallHoursPerVisit,
        materialMarkup: settings.materialMarkup * 100,
        targetMargin: settings.targetMargin * 100,
      }))
      setSettingsLoaded(true)
    }
  }, [settings, settingsLoaded])

  const previewPayload = {
    module: "SERVICE_CALL" as const,
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
      previewQuote.mutate(
        { data: previewPayload },
        { onSuccess: () => setPreviewedInputKey(inputKey) },
      )
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [inputs, laborOverride, sellingPriceOverride, settingsLoaded])

  const setNumber = (
    key:
      | "visitQuantity"
      | "receptacleReplacementQuantity"
      | "trReceptacleReplacementQuantity"
      | "switchReplacementQuantity"
      | "gfciReplacementQuantity"
      | "crewSize"
      | "crewHours"
      | "materialMarkup"
      | "targetMargin",
    value: string,
    minimum = 0,
  ) => {
    setInputs((current) => ({
      ...current,
      [key]: Math.max(minimum, Number(value) || 0),
    }))
  }

  const addMiscMaterial = () => {
    setInputs(c => ({
      ...c,
      miscellaneousMaterials: [
        ...c.miscellaneousMaterials,
        { id: crypto.randomUUID(), description: "", cost: 0 }
      ]
    }))
  }

  const updateMiscMaterial = (id: string, field: "description" | "cost", value: string) => {
    setInputs(c => ({
      ...c,
      miscellaneousMaterials: c.miscellaneousMaterials.map(m => 
        m.id === id ? { ...m, [field]: field === "cost" ? Math.max(0, Number(value) || 0) : value } : m
      )
    }))
  }

  const removeMiscMaterial = (id: string) => {
    setInputs(c => ({
      ...c,
      miscellaneousMaterials: c.miscellaneousMaterials.filter(m => m.id !== id)
    }))
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!settingsLoaded || !previewIsCurrent) return
    createQuote.mutate(
      {
        data: {
          customerId,
          sourceQuoteId: revision.sourceQuoteId,
          customerName,
          customerEmail: customerEmail || null,
          projectName,
          module: "SERVICE_CALL",
          jobInputs: inputs,
          proposalDescription,
          laborOverride: optionalAmount(laborOverride),
          sellingPriceOverride: optionalAmount(sellingPriceOverride),
        },
      },
      { onSuccess: (quote) => setLocation(`/quotes/${quote.id}`) },
    )
  }

  const pricing = previewQuote.data?.pricing
  const assembly = previewQuote.data?.assembly

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-24">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New Service Call Quote</h1>
        <p className="mt-1 text-muted-foreground">Service & Troubleshooting Builder</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <Card className="border-t-4 border-t-secondary">
              <CardHeader><CardTitle>Project Details</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <CustomerPicker idPrefix="sc" customerId={customerId} customerName={customerName} customerEmail={customerEmail} onCustomerIdChange={setCustomerId} onCustomerNameChange={setCustomerName} onCustomerEmailChange={setCustomerEmail} />
                <div className="space-y-2">
                  <Label htmlFor="sc-customer">Customer Name *</Label>
                  <Input id="sc-customer" required value={customerName} onChange={(event) => { setCustomerId(undefined); setCustomerName(event.target.value) }} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sc-email">Customer Email</Label>
                  <Input id="sc-email" type="email" value={customerEmail} onChange={(event) => { setCustomerId(undefined); setCustomerEmail(event.target.value) }} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="sc-project">Project Name *</Label>
                  <Input id="sc-project" required value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Service visit - no power to kitchen" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="sc-proposal">Customer-facing Proposal Description *</Label>
                  <Textarea id="sc-proposal" required value={proposalDescription} onChange={(event) => setProposalDescription(event.target.value)} />
                </div>
              </CardContent>
            </Card>

            <Card className="border-t-4 border-t-primary shadow-md">
              <CardHeader className="border-b border-primary/10 bg-primary/5">
                <div className="flex items-center gap-2">
                  <Wrench className="text-primary" size={20} />
                  <CardTitle>Parametric Builder: Service Call</CardTitle>
                </div>
                <CardDescription>Configure service type, visits, crew labor, and miscellaneous parts.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8 pt-6">
                
                <section>
                  <h3 className="mb-4 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Service Parameters</h3>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="sc-type">Service Type</Label>
                      <select id="sc-type" value={inputs.serviceType} onChange={(event) => {
                        const serviceType = event.target.value as ServiceCallInputs["serviceType"]
                        setInputs(c => ({
                          ...c,
                          serviceType,
                          laborRateType: serviceType === "Commercial standard service visit" ? "commercial" : "residential",
                        }))
                      }} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="Diagnostic service call">Diagnostic / troubleshooting</option>
                        <option value="Residential standard service visit">Residential standard visit</option>
                        <option value="Commercial standard service visit">Commercial standard visit</option>
                      </select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="sc-visits">Visit Quantity</Label>
                      <Input id="sc-visits" type="number" min="1" step="1" value={inputs.visitQuantity} onChange={(event) => setNumber("visitQuantity", event.target.value, 1)} />
                      <p className="text-xs text-muted-foreground">Number of distinct trips to the site</p>
                    </div>
                    
                    {([
                      ["receptacleReplacementQuantity", "Standard receptacles", "Unverified generic device; unresolved until selected in the company price book."],
                      ["trReceptacleReplacementQuantity", "Residential TR receptacles", "Uses the verified Northeast Pass & Seymour residential TR receptacle row."],
                      ["switchReplacementQuantity", "Single-pole switches", "Uses a verified company catalog row when available."],
                      ["gfciReplacementQuantity", "20A TR GFCI receptacles", "Uses the verified Northeast self-test GFCI row."],
                    ] as const).map(([key, label, help]) => (
                      <div className="space-y-2" key={key}>
                        <Label htmlFor={`sc-${key}`}>{label}</Label>
                        <Input id={`sc-${key}`} type="number" min="0" step="1" value={inputs[key]} onChange={(event) => setNumber(key, event.target.value)} />
                        <p className="text-xs text-muted-foreground">{help}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="mb-4 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Labor & Crew</h3>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="sc-crew-size">Crew Size</Label>
                      <Input id="sc-crew-size" type="number" min="1" step="1" value={inputs.crewSize} onChange={(event) => setNumber("crewSize", event.target.value, 1)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sc-crew-hours">Hours per Person</Label>
                      <Input id="sc-crew-hours" type="number" step="0.25" min="0" value={inputs.crewHours} onChange={(event) => setNumber("crewHours", event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sc-labor-rate">Labor Sell Rate</Label>
                      <select id="sc-labor-rate" value={inputs.laborRateType} onChange={(event) => setInputs((current) => ({ ...current, laborRateType: event.target.value as ServiceCallInputs["laborRateType"] }))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="residential">Residential</option>
                        <option value="commercial">Commercial</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-4 rounded-md border bg-background p-3 text-sm">
                    <span className="font-semibold">Estimated Total Labor: </span>
                    <span className="font-mono">{inputs.visitQuantity} visit(s) × {inputs.crewSize} worker(s) × {inputs.crewHours} hours + {deviceLaborHours.toFixed(2)} device hours = {totalLaborHours.toFixed(2)} person-hours</span>
                  </div>
                </section>

                <section>
                  <h3 className="mb-4 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Miscellaneous Materials</h3>
                  
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="sc-markup">Material Markup (%)</Label>
                      <Input id="sc-markup" type="number" min="0" className="w-32" value={inputs.materialMarkup} onChange={(event) => setNumber("materialMarkup", event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sc-margin">Target Margin (%)</Label>
                      <Input id="sc-margin" type="number" min="0" max="99.99" className="w-32" value={inputs.targetMargin} onChange={(event) => setNumber("targetMargin", event.target.value)} />
                    </div>
                    </div>

                    <div className="rounded-md border border-primary/20 bg-background overflow-hidden">
                      <div className="bg-primary/5 px-4 py-3 flex items-center justify-between border-b">
                        <Label className="font-semibold m-0 text-foreground">Material Lines</Label>
                        <Button type="button" variant="outline" size="sm" onClick={addMiscMaterial} className="h-8">
                          <Plus size={14} className="mr-1" /> Add Line
                        </Button>
                      </div>
                      
                      {inputs.miscellaneousMaterials.length === 0 ? (
                        <div className="p-8 text-center text-sm text-muted-foreground">
                          No miscellaneous materials added. Click "Add Line" to include parts not covered by standard assemblies.
                        </div>
                      ) : (
                        <div className="divide-y">
                          {inputs.miscellaneousMaterials.map((mat, i) => (
                            <div key={mat.id} className="p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                              <div className="flex-1 w-full space-y-2">
                                <Label className="text-xs" htmlFor={`mat-desc-${mat.id}`}>Description</Label>
                                <Input id={`mat-desc-${mat.id}`} placeholder="e.g. Specialty breaker, junction box..." value={mat.description} onChange={(e) => updateMiscMaterial(mat.id, "description", e.target.value)} />
                              </div>
                              <div className="w-full sm:w-32 space-y-2">
                                <Label className="text-xs" htmlFor={`mat-cost-${mat.id}`}>Est. Cost ($)</Label>
                                <Input id={`mat-cost-${mat.id}`} type="number" min="0" step="0.01" value={mat.cost || ""} onChange={(e) => updateMiscMaterial(mat.id, "cost", e.target.value)} />
                              </div>
                              <div className="pt-6">
                                <Button type="button" variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => removeMiscMaterial(mat.id)}>
                                  <Trash2 size={16} />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                <div className="space-y-2">
                  <Label htmlFor="sc-notes">Estimator Notes (Internal)</Label>
                  <Textarea id="sc-notes" value={inputs.notes} onChange={(event) => setInputs((current) => ({ ...current, notes: event.target.value }))} />
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <div className="sticky top-6">
              <Card className="border-primary bg-secondary text-secondary-foreground shadow-lg">
                <CardHeader className="border-b border-secondary-border">
                  <div className="flex items-center gap-2">
                    <Calculator className="text-primary" size={20} />
                    <CardTitle className="text-secondary-foreground">Calculation Preview</CardTitle>
                  </div>
                  <CardDescription className="text-secondary-foreground/70">Server-calculated from company catalog items and current settings.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5 pt-6">
                  <QuoteBuilderRecovery settings={settingsQuery} revision={revision} draft={draftRecovery} />
                  <div className="flex items-start gap-3 rounded-md border border-primary/20 bg-primary/10 p-3 text-sm">
                    <Info className="mt-0.5 shrink-0 text-primary" size={16} />
                    <p className="text-secondary-foreground/80">Labor, trips, and misc materials are combined dynamically into a final service quote.</p>
                  </div>

                  {pricing && previewIsCurrent ? (
                    <>
                      {pricing.pricingWarnings.length > 0 && (
                        <div className="rounded-md border border-amber-400/40 bg-amber-400/10 p-3">
                          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-300">
                            <TriangleAlert size={16} /> Estimate needs confirmation
                          </div>
                          <ul className="space-y-1 pl-5 text-xs text-secondary-foreground/80 list-disc">
                            {pricing.pricingWarnings.map((warning, index) => (
                              <li key={pricingWarningKey(warning, index)}>{pricingWarningMessage(warning)}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between"><span>Material Cost</span><span className="font-mono">${pricing.materialCost.toFixed(2)}</span></div>
                        <div className="flex justify-between"><span>Loaded Internal Labor Cost</span><span className="font-mono">${pricing.laborCost.toFixed(2)}</span></div>
                        {pricing.laborSellAmount !== undefined && <div className="flex justify-between"><span>Customer Labor ({pricing.laborRateType} @ ${pricing.laborSellRate?.toFixed(2)}/hr)</span><span className="font-mono">${pricing.laborSellAmount.toFixed(2)}</span></div>}
                        <div className="flex justify-between border-t border-secondary-border pt-2 font-bold"><span>Final Selling Price</span><span className="font-mono text-primary">${pricing.finalSellingPrice.toFixed(2)}</span></div>
                      </div>
                      {assembly && assembly.length > 0 && (
                        <div className="border-t border-secondary-border pt-4">
                          <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-secondary-foreground/60">Priced Assembly</h4>
                          <div className="max-h-80 space-y-2 overflow-y-auto pr-1 text-xs">
                            {assembly.map((line, index) => (
                              <div key={`${line.id}-${index}`} className="flex justify-between gap-3">
                                <span className="text-secondary-foreground/80">{contractorMaterialName(line.description)} × {line.quantity} {line.unit}</span>
                                <span className="shrink-0 font-mono">${line.extendedCost.toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="py-6 text-center text-sm text-secondary-foreground/70">Updating authoritative estimate...</div>
                  )}

                  <div className="space-y-3 border-t border-secondary-border pt-4">
                    <div className="space-y-2">
                      <Label htmlFor="sc-labor-override">Internal Labor Cost Override ($)</Label>
                      <Input id="sc-labor-override" type="number" min="0" step="0.01" value={laborOverride} onChange={(event) => setLaborOverride(event.target.value)} placeholder={pricing ? `Calculated: ${pricing.laborCost.toFixed(2)}` : "Optional"} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sc-price-override">Selling Price Override ($)</Label>
                      <Input id="sc-price-override" type="number" min="0" step="0.01" value={sellingPriceOverride} onChange={(event) => setSellingPriceOverride(event.target.value)} placeholder={pricing ? `Calculated: ${pricing.calculatedSellingPrice.toFixed(2)}` : "Optional"} />
                    </div>
                  </div>

                  {previewQuote.isError && <p className="text-sm text-destructive">The estimate preview could not be calculated.</p>}
                  <Button className="w-full text-lg font-bold" size="lg" type="submit" disabled={!settingsLoaded || createQuote.isPending || !previewIsCurrent || previewQuote.isError}>
                    {createQuote.isPending ? "Submitting..." : (!settingsLoaded || !previewIsCurrent) ? "Calculating..." : "Generate Service Quote"}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
