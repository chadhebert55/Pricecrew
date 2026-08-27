import {
  type TimeMaterialsInputs,
  useCreateQuote,
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
import { Calculator, Info, TriangleAlert, Clock, Plus, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { useLocation } from "wouter"

const initialInputs: TimeMaterialsInputs = {
  serviceType: "General time and materials",
  crewSize: 1,
  crewHours: 8,
  laborRateType: "commercial",
  laborSellRate: 165,
  loadedLaborCost: 65,
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

export function NewTimeMaterialsQuote() {
  const [, setLocation] = useLocation()
  const createQuote = useCreateQuote()
  const previewQuote = usePreviewQuote()
  const { data: settings } = useGetSettings()
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  
  const [previewedInputKey, setPreviewedInputKey] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [customerEmail, setCustomerEmail] = useState("")
  const [projectName, setProjectName] = useState("")
  const [proposalDescription, setProposalDescription] = useState(
    "Provide labor and materials on a time and materials basis to execute the requested electrical scope. Estimated hours and materials are provided for authorization; final billing will reflect actual time and materials used."
  )
  const [laborOverride, setLaborOverride] = useState("")
  const [sellingPriceOverride, setSellingPriceOverride] = useState("")
  const [inputs, setInputs] = useState<TimeMaterialsInputs>(initialInputs)

  useEffect(() => {
    if (settings && !settingsLoaded) {
      setInputs((current) => ({
        ...current,
        laborSellRate: settings.commercialLaborSellRate,
        loadedLaborCost: settings.loadedLaborCost,
        materialMarkup: settings.materialMarkup * 100,
        targetMargin: settings.targetMargin * 100,
      }))
      setSettingsLoaded(true)
    }
  }, [settings, settingsLoaded])

  const previewPayload = {
    module: "TIME_MATERIALS" as const,
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
    key: "crewSize" | "crewHours" | "laborSellRate" | "loadedLaborCost" | "materialMarkup" | "targetMargin",
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
          customerName,
          customerEmail: customerEmail || null,
          projectName,
          module: "TIME_MATERIALS",
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
        <h1 className="text-3xl font-bold tracking-tight">New Time & Materials Quote</h1>
        <p className="mt-1 text-muted-foreground">T&M Estimating Builder</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <Card className="border-t-4 border-t-secondary">
              <CardHeader><CardTitle>Project Details</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="tm-customer">Customer Name *</Label>
                  <Input id="tm-customer" required value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tm-email">Customer Email</Label>
                  <Input id="tm-email" type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="tm-project">Project Name *</Label>
                  <Input id="tm-project" required value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="T&M Maintenance - Warehouse Lighting" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="tm-proposal">Customer-facing Proposal Description *</Label>
                  <Textarea id="tm-proposal" required value={proposalDescription} onChange={(event) => setProposalDescription(event.target.value)} />
                </div>
              </CardContent>
            </Card>

            <Card className="border-t-4 border-t-primary shadow-md">
              <CardHeader className="border-b border-primary/10 bg-primary/5">
                <div className="flex items-center gap-2">
                  <Clock className="text-primary" size={20} />
                  <CardTitle>Parametric Builder: Time & Materials</CardTitle>
                </div>
                <CardDescription>Estimate projected hours and materials for T&M approval.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8 pt-6">
                
                <section>
                  <h3 className="mb-4 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Engagement Type</h3>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="tm-type">Service Type</Label>
                      <select id="tm-type" value={inputs.serviceType} onChange={(event) => setInputs(c => ({ ...c, serviceType: event.target.value as TimeMaterialsInputs["serviceType"] }))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="General time and materials">General time and materials</option>
                        <option value="Residential time and materials">Residential time and materials</option>
                        <option value="Commercial time and materials">Commercial time and materials</option>
                      </select>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="mb-4 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Labor & Crew (Estimated)</h3>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="tm-crew-size">Crew Size</Label>
                      <Input id="tm-crew-size" type="number" min="1" step="1" value={inputs.crewSize} onChange={(event) => setNumber("crewSize", event.target.value, 1)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tm-crew-hours">Estimated Hours / Person</Label>
                      <Input id="tm-crew-hours" type="number" step="0.25" min="0" value={inputs.crewHours} onChange={(event) => setNumber("crewHours", event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tm-labor-rate">Labor Sell Rate</Label>
                      <select id="tm-labor-rate" value={inputs.laborRateType} onChange={(event) => {
                        const laborRateType = event.target.value as TimeMaterialsInputs["laborRateType"]
                        setInputs((current) => ({
                          ...current,
                          laborRateType,
                          laborSellRate: laborRateType === "commercial" ? settings?.commercialLaborSellRate ?? 165 : settings?.residentialLaborSellRate ?? 150,
                        }))
                      }} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="residential">Residential</option>
                        <option value="commercial">Commercial</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tm-sell-rate">Customer Labor Rate ($/HR)</Label>
                      <Input id="tm-sell-rate" type="number" min="0" step="0.01" value={inputs.laborSellRate} onChange={(event) => setNumber("laborSellRate", event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tm-loaded-cost">Loaded Labor Cost ($/HR)</Label>
                      <Input id="tm-loaded-cost" type="number" min="0" step="0.01" value={inputs.loadedLaborCost} onChange={(event) => setNumber("loadedLaborCost", event.target.value)} />
                    </div>
                  </div>
                  <div className="mt-4 rounded-md border bg-background p-3 text-sm">
                    <span className="font-semibold">Estimated Total Labor: </span>
                    <span className="font-mono">{inputs.crewSize} workers × {inputs.crewHours} hours = {inputs.crewSize * inputs.crewHours} person-hours</span>
                  </div>
                </section>

                <section>
                  <h3 className="mb-4 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Estimated Materials</h3>
                  
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="tm-markup">Material Markup (%)</Label>
                      <Input id="tm-markup" type="number" min="0" className="w-32" value={inputs.materialMarkup} onChange={(event) => setNumber("materialMarkup", event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tm-margin">Target Margin (%)</Label>
                      <Input id="tm-margin" type="number" min="0" max="99.99" className="w-32" value={inputs.targetMargin} onChange={(event) => setNumber("targetMargin", event.target.value)} />
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
                          No materials added. Click "Add Line" to include estimated materials for the T&M engagement.
                        </div>
                      ) : (
                        <div className="divide-y">
                          {inputs.miscellaneousMaterials.map((mat, i) => (
                            <div key={mat.id} className="p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                              <div className="flex-1 w-full space-y-2">
                                <Label className="text-xs" htmlFor={`mat-desc-${mat.id}`}>Description</Label>
                                <Input id={`mat-desc-${mat.id}`} placeholder="e.g. Expected conduit and wire, fixtures..." value={mat.description} onChange={(e) => updateMiscMaterial(mat.id, "description", e.target.value)} />
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
                  <Label htmlFor="tm-notes">Estimator Notes (Internal)</Label>
                  <Textarea id="tm-notes" value={inputs.notes} onChange={(event) => setInputs((current) => ({ ...current, notes: event.target.value }))} />
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
                  <div className="flex items-start gap-3 rounded-md border border-primary/20 bg-primary/10 p-3 text-sm">
                    <Info className="mt-0.5 shrink-0 text-primary" size={16} />
                    <p className="text-secondary-foreground/80">This provides an upfront estimate authorization. T&M billing will be based on actuals tracked in the field.</p>
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
                        <div className="flex justify-between border-t border-secondary-border pt-2 font-bold"><span>Final Selling Price (Est)</span><span className="font-mono text-primary">${pricing.finalSellingPrice.toFixed(2)}</span></div>
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
                      <Label htmlFor="tm-labor-override">Internal Labor Cost Override ($)</Label>
                      <Input id="tm-labor-override" type="number" min="0" step="0.01" value={laborOverride} onChange={(event) => setLaborOverride(event.target.value)} placeholder={pricing ? `Calculated: ${pricing.laborCost.toFixed(2)}` : "Optional"} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tm-price-override">Selling Price Override ($)</Label>
                      <Input id="tm-price-override" type="number" min="0" step="0.01" value={sellingPriceOverride} onChange={(event) => setSellingPriceOverride(event.target.value)} placeholder={pricing ? `Calculated: ${pricing.calculatedSellingPrice.toFixed(2)}` : "Optional"} />
                    </div>
                  </div>

                  {previewQuote.isError && <p className="text-sm text-destructive">The estimate preview could not be calculated.</p>}
                  <Button className="w-full text-lg font-bold" size="lg" type="submit" disabled={!settingsLoaded || createQuote.isPending || !previewIsCurrent || previewQuote.isError}>
                    {createQuote.isPending ? "Submitting..." : (!settingsLoaded || !previewIsCurrent) ? "Calculating..." : "Generate T&M Quote"}
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
