import {
  type CustomInputs,
  type EstimatePreview,
  useGetSettings,
  usePreviewQuote,
} from "@workspace/api-client-react"
import { pricingWarningKey, pricingWarningMessage } from "@/lib/pricing-warnings"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Calculator, Info, Plus, Shapes, Trash2, TriangleAlert } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useLocation } from "wouter"
import { CustomerPicker } from "@/components/customer-picker"
import { useQuoteCreateMutation } from "@/hooks/use-quote-create-mutation"
import { useQuoteRevisionPrefill } from "@/hooks/use-quote-revision-prefill"
import { useQuoteBuilderDraft } from "@/hooks/use-quote-builder-draft"
import { QuoteBuilderRecovery } from "@/components/quote-builder-recovery"

const initialInputs: CustomInputs = {
  laborHours: 8,
  laborRateType: "residential",
  laborSellRate: 150,
  loadedLaborCost: 65,
  materialMarkup: 25,
  targetMargin: 40,
  materials: [],
  miscellaneousMaterials: [],
  notes: "",
}

function optionalAmount(value: string) {
  if (value.trim() === "") return null
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? amount : null
}

export function NewCustomQuote() {
  const [, setLocation] = useLocation()
  const createQuote = useQuoteCreateMutation()
  const previewQuote = usePreviewQuote()
  const settingsQuery = useGetSettings()
  const { data: settings } = settingsQuery
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [previewedInputKey, setPreviewedInputKey] = useState("")
  const [preview, setPreview] = useState<EstimatePreview>()
  const previewRequestId = useRef(0)
  const [customerName, setCustomerName] = useState("")
  const [customerEmail, setCustomerEmail] = useState("")
  const [customerId, setCustomerId] = useState<number | undefined>()
  const [projectName, setProjectName] = useState("")
  const [proposalDescription, setProposalDescription] = useState(
    "Provide labor and materials for the custom electrical scope described below. Final routing, existing conditions, and code requirements will be verified before work begins.",
  )
  const [laborOverride, setLaborOverride] = useState("")
  const [sellingPriceOverride, setSellingPriceOverride] = useState("")
  const [inputs, setInputs] = useState<CustomInputs>(initialInputs)
  const revision = useQuoteRevisionPrefill("CUSTOM", { setCustomerName, setCustomerEmail, setCustomerId, setProjectName, setProposalDescription, setInputs, setSettingsLoaded })
  const { draftRecovery } = useQuoteBuilderDraft({
    module: "CUSTOM",
    ready: settingsLoaded && !revision.isRevision,
    values: { customerName, customerEmail, customerId, projectName, proposalDescription, inputs, laborOverride, sellingPriceOverride },
    setters: { setCustomerName, setCustomerEmail, setCustomerId, setProjectName, setProposalDescription, setInputs, setLaborOverride, setSellingPriceOverride },
  })

  useEffect(() => {
    if (settings && !settingsLoaded && !revision.isRevision) {
      setInputs((current) => ({
        ...current,
        laborHours: settings.customLaborHours,
        laborRateType: settings.customLaborRateType,
        laborSellRate: settings.customLaborSellRate,
        loadedLaborCost: settings.customLoadedLaborCost,
        materialMarkup: settings.customMaterialMarkup,
        targetMargin: settings.customTargetMargin,
      }))
      setSettingsLoaded(true)
    }
  }, [settings, settingsLoaded])

  const previewPayload = {
    module: "CUSTOM" as const,
    jobInputs: inputs,
    laborOverride: optionalAmount(laborOverride),
    sellingPriceOverride: optionalAmount(sellingPriceOverride),
  }
  const currentInputKey = JSON.stringify(previewPayload)
  const previewIsCurrent = currentInputKey === previewedInputKey

  useEffect(() => {
    if (!settingsLoaded) return
    const inputKey = JSON.stringify(previewPayload)
    const requestId = ++previewRequestId.current
    const timeout = window.setTimeout(() => {
      previewQuote.mutate(
        { data: previewPayload },
        {
          onSuccess: (result) => {
            if (requestId !== previewRequestId.current) return
            setPreview(result)
            setPreviewedInputKey(inputKey)
          },
        },
      )
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [inputs, laborOverride, sellingPriceOverride, settingsLoaded])

  const setNumber = (
    key: "laborHours" | "laborSellRate" | "loadedLaborCost" | "materialMarkup" | "targetMargin",
    value: string,
  ) => {
    setInputs((current) => ({
      ...current,
      [key]: Math.max(0, Number(value) || 0),
    }))
  }

  const addMaterial = () => {
    setInputs((current) => ({
      ...current,
      materials: [
        ...current.materials,
        { id: crypto.randomUUID(), description: "", quantity: 1, unit: "ea", unitCost: 0 },
      ],
    }))
  }

  const updateMaterial = (
    id: string,
    field: "description" | "quantity" | "unit" | "unitCost",
    value: string,
  ) => {
    setInputs((current) => ({
      ...current,
      materials: current.materials.map((line) =>
        line.id === id
          ? {
              ...line,
              [field]:
                field === "quantity" || field === "unitCost"
                  ? Math.max(0, Number(value) || 0)
                  : value,
            }
          : line,
      ),
    }))
  }

  const addMiscellaneous = () => {
    setInputs((current) => ({
      ...current,
      miscellaneousMaterials: [
        ...current.miscellaneousMaterials,
        { id: crypto.randomUUID(), description: "", cost: 0 },
      ],
    }))
  }

  const setMaterialExclusion = (
    collection: "materials" | "miscellaneousMaterials",
    id: string,
    confirmed: boolean,
  ) => {
    setInputs((current) => ({
      ...current,
      [collection]: current[collection].map((line) => {
        if (line.id !== id) return line
        if (!confirmed) {
          const { intentionalExclusion: _removed, ...remaining } = line
          return remaining
        }
        return {
          ...line,
          intentionalExclusion: { confirmed: true, reason: "" },
        }
      }),
    }))
  }

  const setMaterialExclusionReason = (
    collection: "materials" | "miscellaneousMaterials",
    id: string,
    reason: string,
  ) => {
    setInputs((current) => ({
      ...current,
      [collection]: current[collection].map((line) =>
        line.id === id
          ? {
              ...line,
              intentionalExclusion: { confirmed: true, reason },
            }
          : line,
      ),
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
          module: "CUSTOM",
          jobInputs: inputs,
          proposalDescription,
          laborOverride: optionalAmount(laborOverride),
          sellingPriceOverride: optionalAmount(sellingPriceOverride),
        },
      },
      { onSuccess: (quote) => setLocation(`/quotes/${quote.id}`) },
    )
  }

  const pricing = preview?.pricing
  const assembly = preview?.assembly

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-24">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New Custom Quote</h1>
        <p className="mt-1 text-muted-foreground">Build a reusable custom scope from labor, materials, and allowances.</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <Card className="border-t-4 border-t-secondary">
              <CardHeader><CardTitle>Project Details</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <CustomerPicker idPrefix="custom" customerId={customerId} customerName={customerName} customerEmail={customerEmail} onCustomerIdChange={setCustomerId} onCustomerNameChange={setCustomerName} onCustomerEmailChange={setCustomerEmail} />
                <div className="space-y-2">
                  <Label htmlFor="custom-customer">Customer Name *</Label>
                  <Input id="custom-customer" required value={customerName} onChange={(event) => { setCustomerId(undefined); setCustomerName(event.target.value) }} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="custom-email">Customer Email</Label>
                  <Input id="custom-email" type="email" value={customerEmail} onChange={(event) => { setCustomerId(undefined); setCustomerEmail(event.target.value) }} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="custom-project">Scope / Project Name *</Label>
                  <Input id="custom-project" required value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Detached garage electrical fit-out" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="custom-proposal">Customer-facing Proposal Description *</Label>
                  <Textarea id="custom-proposal" required value={proposalDescription} onChange={(event) => setProposalDescription(event.target.value)} />
                </div>
              </CardContent>
            </Card>

            <Card className="border-t-4 border-t-primary shadow-md">
              <CardHeader className="border-b border-primary/10 bg-primary/5">
                <div className="flex items-center gap-2"><Shapes className="text-primary" size={20} /><CardTitle>Custom Scope Builder</CardTitle></div>
                <CardDescription>All entered costs stay internal; the proposal exposes descriptions, quantities, and the final price only.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8 pt-6">
                <section>
                  <h3 className="mb-4 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Labor</h3>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="custom-hours">Labor Hours</Label>
                      <Input id="custom-hours" type="number" min="0" step="0.25" value={inputs.laborHours} onChange={(event) => setNumber("laborHours", event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="custom-rate-type">Rate Type</Label>
                      <select id="custom-rate-type" value={inputs.laborRateType} onChange={(event) => {
                        const laborRateType = event.target.value as CustomInputs["laborRateType"]
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
                      <Label htmlFor="custom-sell-rate">Customer Labor Rate ($/HR)</Label>
                      <Input id="custom-sell-rate" type="number" min="0" step="0.01" value={inputs.laborSellRate} onChange={(event) => setNumber("laborSellRate", event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="custom-loaded-cost">Loaded Labor Cost ($/HR)</Label>
                      <Input id="custom-loaded-cost" type="number" min="0" step="0.01" value={inputs.loadedLaborCost} onChange={(event) => setNumber("loadedLaborCost", event.target.value)} />
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Material Lines</h3>
                    <Button type="button" variant="outline" size="sm" onClick={addMaterial}><Plus size={14} className="mr-1" /> Add Material</Button>
                  </div>
                  {inputs.materials.length === 0 ? (
                    <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">Add exact custom materials with quantity, unit, and internal unit cost.</div>
                  ) : (
                    <div className="space-y-3">
                      {inputs.materials.map((line) => (
                        <div key={line.id} className="space-y-3 rounded-md border p-4">
                          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_90px_90px_120px_40px]">
                            <div className="space-y-1"><Label>Description</Label><Input value={line.description} onChange={(event) => updateMaterial(line.id, "description", event.target.value)} placeholder="Panelboard, conduit, fittings..." /></div>
                            <div className="space-y-1"><Label>Qty</Label><Input type="number" min="0" step="0.01" value={line.quantity || ""} onChange={(event) => updateMaterial(line.id, "quantity", event.target.value)} /></div>
                            <div className="space-y-1"><Label>Unit</Label><Input value={line.unit} onChange={(event) => updateMaterial(line.id, "unit", event.target.value)} /></div>
                            <div className="space-y-1"><Label>Unit Cost</Label><Input type="number" min="0" step="0.01" value={line.unitCost || ""} onChange={(event) => updateMaterial(line.id, "unitCost", event.target.value)} /></div>
                            <Button type="button" variant="ghost" size="icon" className="mt-6 text-destructive" onClick={() => setInputs((current) => ({ ...current, materials: current.materials.filter((item) => item.id !== line.id) }))}><Trash2 size={16} /></Button>
                          </div>
                          {line.quantity > 0 && line.unitCost === 0 && (
                            <div className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
                              <div className="flex items-start gap-2">
                                <Checkbox id={`custom-material-exclude-${line.id}`} checked={Boolean(line.intentionalExclusion)} onCheckedChange={(checked) => setMaterialExclusion("materials", line.id, checked === true)} />
                                <Label htmlFor={`custom-material-exclude-${line.id}`} className="text-sm">Intentionally exclude this contractor-supplied material from cost</Label>
                              </div>
                              {line.intentionalExclusion && (
                                <div className="space-y-1">
                                  <Label htmlFor={`custom-material-exclude-reason-${line.id}`} className="text-xs">Exclusion reason *</Label>
                                  <Textarea id={`custom-material-exclude-reason-${line.id}`} minLength={10} maxLength={500} value={line.intentionalExclusion.reason} onChange={(event) => setMaterialExclusionReason("materials", line.id, event.target.value)} placeholder="Explain why this material cost is intentionally excluded..." />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label htmlFor="custom-markup">Material Markup (%)</Label><Input id="custom-markup" type="number" min="0" max="500" value={inputs.materialMarkup} onChange={(event) => setNumber("materialMarkup", event.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="custom-margin">Target Margin (%)</Label><Input id="custom-margin" type="number" min="0" max="99.99" value={inputs.targetMargin} onChange={(event) => setNumber("targetMargin", event.target.value)} /></div>
                  </div>
                  <div className="flex items-center justify-between border-b pb-2">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Miscellaneous Allowances</h3>
                    <Button type="button" variant="outline" size="sm" onClick={addMiscellaneous}><Plus size={14} className="mr-1" /> Add Allowance</Button>
                  </div>
                  {inputs.miscellaneousMaterials.map((line) => (
                    <div key={line.id} className="space-y-3 rounded-md border p-4">
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_140px_40px]">
                        <div className="space-y-1"><Label>Description</Label><Input value={line.description} onChange={(event) => setInputs((current) => ({ ...current, miscellaneousMaterials: current.miscellaneousMaterials.map((item) => item.id === line.id ? { ...item, description: event.target.value } : item) }))} placeholder="Permit, lift rental, consumables..." /></div>
                        <div className="space-y-1"><Label>Cost</Label><Input type="number" min="0" step="0.01" value={line.cost || ""} onChange={(event) => setInputs((current) => ({ ...current, miscellaneousMaterials: current.miscellaneousMaterials.map((item) => item.id === line.id ? { ...item, cost: Math.max(0, Number(event.target.value) || 0) } : item) }))} /></div>
                        <Button type="button" variant="ghost" size="icon" className="mt-6 text-destructive" onClick={() => setInputs((current) => ({ ...current, miscellaneousMaterials: current.miscellaneousMaterials.filter((item) => item.id !== line.id) }))}><Trash2 size={16} /></Button>
                      </div>
                      {line.cost === 0 && line.description.trim() !== "" && (
                        <div className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
                          <div className="flex items-start gap-2">
                            <Checkbox id={`custom-misc-exclude-${line.id}`} checked={Boolean(line.intentionalExclusion)} onCheckedChange={(checked) => setMaterialExclusion("miscellaneousMaterials", line.id, checked === true)} />
                            <Label htmlFor={`custom-misc-exclude-${line.id}`} className="text-sm">Intentionally exclude this contractor-supplied allowance from cost</Label>
                          </div>
                          {line.intentionalExclusion && (
                            <div className="space-y-1">
                              <Label htmlFor={`custom-misc-exclude-reason-${line.id}`} className="text-xs">Exclusion reason *</Label>
                              <Textarea id={`custom-misc-exclude-reason-${line.id}`} minLength={10} maxLength={500} value={line.intentionalExclusion.reason} onChange={(event) => setMaterialExclusionReason("miscellaneousMaterials", line.id, event.target.value)} placeholder="Explain why this allowance cost is intentionally excluded..." />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </section>

                <div className="space-y-2">
                  <Label htmlFor="custom-notes">Estimator Notes (Internal)</Label>
                  <Textarea id="custom-notes" value={inputs.notes} onChange={(event) => setInputs((current) => ({ ...current, notes: event.target.value }))} />
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <div className="sticky top-6">
              <Card className="border-primary bg-secondary text-secondary-foreground shadow-lg">
                <CardHeader className="border-b border-secondary-border">
                  <div className="flex items-center gap-2"><Calculator className="text-primary" size={20} /><CardTitle className="text-secondary-foreground">Calculation Preview</CardTitle></div>
                  <CardDescription className="text-secondary-foreground/70">Server-calculated from this exact custom scope.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5 pt-6">
                  <QuoteBuilderRecovery settings={settingsQuery} revision={revision} draft={draftRecovery} />
                  <div className="flex items-start gap-3 rounded-md border border-primary/20 bg-primary/10 p-3 text-sm"><Info className="mt-0.5 shrink-0 text-primary" size={16} /><p className="text-secondary-foreground/80">Preview and saved quote use the same calculation and immutable input snapshot.</p></div>
                  {pricing && previewIsCurrent ? (
                    <>
                      {pricing.pricingWarnings.length > 0 && (
                        <div className="rounded-md border border-amber-400/40 bg-amber-400/10 p-3">
                          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-300"><TriangleAlert size={16} /> Estimate needs confirmation</div>
                          <ul className="list-disc space-y-1 pl-5 text-xs text-secondary-foreground/80">{pricing.pricingWarnings.map((warning, index) => <li key={pricingWarningKey(warning, index)}>{pricingWarningMessage(warning)}</li>)}</ul>
                        </div>
                      )}
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between"><span>Material Cost</span><span className="font-mono">${pricing.materialCost.toFixed(2)}</span></div>
                        <div className="flex justify-between"><span>Loaded Labor Cost</span><span className="font-mono">${pricing.laborCost.toFixed(2)}</span></div>
                        {pricing.laborSellAmount !== undefined && <div className="flex justify-between"><span>Customer Labor</span><span className="font-mono">${pricing.laborSellAmount.toFixed(2)}</span></div>}
                        <div className="flex justify-between border-t border-secondary-border pt-2 font-bold"><span>Final Selling Price</span><span className="font-mono text-primary">${pricing.finalSellingPrice.toFixed(2)}</span></div>
                      </div>
                      {assembly && assembly.length > 0 && <div className="max-h-64 space-y-2 overflow-y-auto border-t border-secondary-border pt-4 text-xs">{assembly.map((line) => <div key={line.id} className="flex justify-between gap-3"><span>{line.description} × {line.quantity} {line.unit}</span><span className="font-mono">${line.extendedCost.toFixed(2)}</span></div>)}</div>}
                    </>
                  ) : <div className="py-6 text-center text-sm text-secondary-foreground/70">Updating authoritative estimate...</div>}
                  <div className="space-y-3 border-t border-secondary-border pt-4">
                    <div className="space-y-2"><Label htmlFor="custom-labor-override">Internal Labor Cost Override ($)</Label><Input id="custom-labor-override" type="number" min="0" step="0.01" value={laborOverride} onChange={(event) => setLaborOverride(event.target.value)} placeholder="Optional" /></div>
                    <div className="space-y-2"><Label htmlFor="custom-price-override">Selling Price Override ($)</Label><Input id="custom-price-override" type="number" min="0" step="0.01" value={sellingPriceOverride} onChange={(event) => setSellingPriceOverride(event.target.value)} placeholder="Optional" /></div>
                  </div>
                  {previewQuote.isError && <p className="text-sm text-destructive">The estimate preview could not be calculated.</p>}
                  <Button className="w-full text-lg font-bold" size="lg" type="submit" disabled={!settingsLoaded || createQuote.isPending || !previewIsCurrent || previewQuote.isError}>{createQuote.isPending ? "Submitting..." : !settingsLoaded || !previewIsCurrent ? "Calculating..." : "Generate Custom Quote"}</Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}