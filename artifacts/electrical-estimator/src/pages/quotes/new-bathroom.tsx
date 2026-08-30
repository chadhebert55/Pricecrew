import {
  BathroomInputsCircuitOption,
  type BathroomInputs,
  usePreviewQuote,
  useGetSettings,
} from "@workspace/api-client-react"
import { pricingWarningKey, pricingWarningMessage } from "@/lib/pricing-warnings"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Calculator, Info, TriangleAlert, Waves } from "lucide-react"
import { useEffect, useState } from "react"
import { useLocation } from "wouter"
import { CustomerPicker } from "@/components/customer-picker"
import { useQuoteCreateMutation } from "@/hooks/use-quote-create-mutation"
import { useQuoteRevisionPrefill } from "@/hooks/use-quote-revision-prefill"
import { QuoteBuilderRecovery } from "@/components/quote-builder-recovery"

const initialInputs: BathroomInputs = {
  gfciReceptacles: 1,
  additionalReceptacles: 0,
  vanityLights: 1,
  recessedLights: 0,
  exhaustFans: 1,
  fanLights: 0,
  fanLightHeatUnits: 0,
  heatedFloorCircuit: false,
  additionalSwitches: 1,
  routeLength: 30,
  circuitOption: BathroomInputsCircuitOption.New_dedicated_circuit,
  customerSuppliedFixtures: true,
  notes: "",
  laborRateType: "residential",
  panelManufacturer: "Siemens",
  breakerAmperage: 20,
  breakerPoleCount: 1,
  breakerProtectionType: "AFCI",
  gfciAmperage: 20,
  recessedLightSize: "4-inch",
  cableType: "12/2 NM-B",
  laborAdjustmentHours: 0,
  newCircuitCableFootage: 30,
  newCircuitMaterialsQuantity: 1,
  newCircuitLaborHours: 3,
  newCircuitBreakerProtectionType: "AFCI",
}

function optionalAmount(value: string) {
  if (value.trim() === "") return null
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? amount : null
}

export function NewBathroomQuote() {
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
    "Provide labor and listed materials for the bathroom electrical scope, including device installation, lighting and ventilation connections, switching, testing, and final trim. Existing conditions and applicable protection requirements will be verified before work begins.",
  )
  const [laborOverride, setLaborOverride] = useState("")
  const [sellingPriceOverride, setSellingPriceOverride] = useState("")
  const [inputs, setInputs] = useState<BathroomInputs>(initialInputs)
  const revision = useQuoteRevisionPrefill("BATHROOM", { setCustomerName, setCustomerEmail, setCustomerId, setProjectName, setProposalDescription, setInputs, setSettingsLoaded })

  useEffect(() => {
    if (settings && !settingsLoaded && !revision.isRevision) {
      setInputs((current) => ({
        ...current,
        laborAdjustmentHours: settings.bathroomLaborAdjustmentHours ?? 0,
      }))
      setSettingsLoaded(true)
    }
  }, [settings, settingsLoaded])

  const previewPayload = {
    module: "BATHROOM" as const,
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

  const setQuantity = (key: keyof BathroomInputs, value: string) => {
    setInputs((current) => ({
      ...current,
      [key]: Math.max(0, Number.parseInt(value, 10) || 0),
    }))
  }

  const setOptionalNumber = (key: keyof BathroomInputs, value: string) => {
    setInputs((current) => ({
      ...current,
      [key]: value.trim() === "" ? undefined : Math.max(0, Number(value) || 0),
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
          module: "BATHROOM",
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
  const quantityFields: Array<{
    key: keyof BathroomInputs
    label: string
    description: string
  }> = [
    { key: "gfciReceptacles", label: "GFCI receptacles", description: "Primary bathroom GFCI devices" },
    { key: "additionalReceptacles", label: "Additional receptacles", description: "Downstream from the GFCI" },
    { key: "vanityLights", label: "Vanity lights", description: "Fixture outlets and trim" },
    { key: "recessedLights", label: "Recessed lights", description: "Ceiling lighting locations" },
    { key: "exhaustFans", label: "Exhaust fans", description: "Fan with new switch leg" },
    { key: "fanLights", label: "Fan / light units", description: "Combination ventilation and light" },
    { key: "fanLightHeatUnits", label: "Fan / light / heat units", description: "Combination unit with heat" },
    { key: "additionalSwitches", label: "Additional switches", description: "Beyond included controls" },
  ]

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-24">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New Bathroom Quote</h1>
        <p className="mt-1 text-muted-foreground">Bathroom Electrical Builder</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <Card className="border-t-4 border-t-secondary">
              <CardHeader>
                <CardTitle>Project Details</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <CustomerPicker idPrefix="bath" customerId={customerId} customerName={customerName} customerEmail={customerEmail} onCustomerIdChange={setCustomerId} onCustomerNameChange={setCustomerName} onCustomerEmailChange={setCustomerEmail} />
                <div className="space-y-2">
                  <Label htmlFor="bath-customer">Customer Name *</Label>
                  <Input id="bath-customer" required value={customerName} onChange={(event) => { setCustomerId(undefined); setCustomerName(event.target.value) }} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bath-email">Customer Email</Label>
                  <Input id="bath-email" type="email" value={customerEmail} onChange={(event) => { setCustomerId(undefined); setCustomerEmail(event.target.value) }} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="bath-project">Project Name *</Label>
                  <Input id="bath-project" required value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Primary bathroom renovation" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="bath-proposal">Customer-facing Proposal Description *</Label>
                  <Textarea id="bath-proposal" required value={proposalDescription} onChange={(event) => setProposalDescription(event.target.value)} />
                </div>
              </CardContent>
            </Card>

            <Card className="border-t-4 border-t-primary shadow-md">
              <CardHeader className="border-b border-primary/10 bg-primary/5">
                <div className="flex items-center gap-2">
                  <Waves className="text-primary" size={20} />
                  <CardTitle>Parametric Builder: Bathroom</CardTitle>
                </div>
                <CardDescription>Configure devices, fixtures, ventilation, switching, and circuit scope.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8 pt-6">
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  {quantityFields.map((field) => (
                    <div key={field.key} className="rounded-lg border bg-muted/15 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <Label htmlFor={`bath-${field.key}`}>{field.label}</Label>
                          <p className="mt-1 text-xs text-muted-foreground">{field.description}</p>
                        </div>
                        <Input
                          id={`bath-${field.key}`}
                          className="w-24 text-right font-mono"
                          type="number"
                          min="0"
                          value={String(inputs[field.key])}
                          onChange={(event) => setQuantity(field.key, event.target.value)}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <section>
                  <h3 className="mb-4 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Pricing and materials</h3>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="bath-labor-rate">Labor Sell Rate</Label>
                      <select id="bath-labor-rate" value={inputs.laborRateType ?? "residential"} onChange={(event) => setInputs((current) => ({ ...current, laborRateType: event.target.value as BathroomInputs["laborRateType"] }))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="residential">Residential</option>
                        <option value="commercial">Commercial</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bath-gfci-rating">GFCI Device Rating</Label>
                      <select id="bath-gfci-rating" value={inputs.gfciAmperage ?? 20} onChange={(event) => setInputs((current) => ({ ...current, gfciAmperage: Number(event.target.value) }))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="15">15A tamper-resistant GFCI</option>
                        <option value="20">20A tamper-resistant GFCI</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bath-recessed-size">Recessed light</Label>
                      <select id="bath-recessed-size" value={inputs.recessedLightSize ?? "4-inch"} onChange={(event) => setInputs((current) => ({ ...current, recessedLightSize: event.target.value as BathroomInputs["recessedLightSize"] }))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="4-inch">4-inch regressed wafer light</option>
                        <option value="6-inch">6-inch regressed wafer light</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bath-cable">Common-Route Cable</Label>
                      <select id="bath-cable" value={inputs.cableType ?? "12/2 NM-B"} onChange={(event) => setInputs((current) => ({ ...current, cableType: event.target.value as BathroomInputs["cableType"] }))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="12/2 NM-B">12/2 NM-B</option>
                        <option value="14/2 NM-B">14/2 NM-B</option>
                        <option value="14/3 NM-B">14/3 NM-B</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bath-panel">Panel Manufacturer</Label>
                      <select id="bath-panel" value={inputs.panelManufacturer ?? "Siemens"} onChange={(event) => setInputs((current) => ({ ...current, panelManufacturer: event.target.value }))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="Siemens">Siemens / ITE</option>
                        <option value="Eaton">Eaton BR</option>
                        <option value="Square D">Square D Homeline</option>
                      </select>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="mb-4 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Contractor-supplied exhaust equipment</h3>
                  <p className="mb-4 text-sm text-muted-foreground">Leave an override blank to use the editable company Price Book cost.</p>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="bath-fan-cost">Standard Panasonic fan unit cost ($)</Label>
                      <Input id="bath-fan-cost" type="number" min="0" step="0.01" value={inputs.exhaustFanMaterialCostOverride ?? ""} onChange={(event) => setOptionalNumber("exhaustFanMaterialCostOverride", event.target.value)} placeholder="Price Book: $119.291" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bath-fan-light-cost">Fan / light unit cost ($)</Label>
                      <Input id="bath-fan-light-cost" type="number" min="0" step="0.01" value={inputs.fanLightMaterialCostOverride ?? ""} onChange={(event) => setOptionalNumber("fanLightMaterialCostOverride", event.target.value)} placeholder="Price Book: $164.804" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bath-fan-heat-cost">Fan / light / heat unit cost ($)</Label>
                      <Input id="bath-fan-heat-cost" type="number" min="0" step="0.01" value={inputs.fanLightHeatMaterialCostOverride ?? ""} onChange={(event) => setOptionalNumber("fanLightHeatMaterialCostOverride", event.target.value)} placeholder="Price Book: $354.581" />
                    </div>
                  </div>
                </section>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="bath-circuit">Circuit Scope</Label>
                    <select
                      id="bath-circuit"
                      value={inputs.circuitOption}
                      onChange={(event) => setInputs((current) => ({
                        ...current,
                        circuitOption: event.target.value as BathroomInputs["circuitOption"],
                      }))}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value={BathroomInputsCircuitOption.New_dedicated_circuit}>New dedicated circuit</option>
                      <option value={BathroomInputsCircuitOption.Reuse_existing_circuit}>Reuse existing circuit</option>
                    </select>
                  </div>
                  {inputs.circuitOption === BathroomInputsCircuitOption.New_dedicated_circuit && (
                    <div className="grid grid-cols-1 gap-5 rounded-lg border border-primary/20 bg-primary/5 p-4 md:col-span-2 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="bath-circuit-protection">15A Breaker Protection</Label>
                        <select
                          id="bath-circuit-protection"
                          value={inputs.newCircuitBreakerProtectionType ?? "AFCI"}
                          onChange={(event) => setInputs((current) => ({
                            ...current,
                            breakerAmperage: 15,
                            breakerPoleCount: 1,
                            breakerProtectionType: event.target.value,
                            newCircuitBreakerProtectionType: event.target.value as NonNullable<BathroomInputs["newCircuitBreakerProtectionType"]>,
                          }))}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        >
                          <option value="Standard">15A standard breaker</option>
                          <option value="AFCI">15A AFCI (arc-fault) breaker</option>
                          <option value="GFCI">15A GFCI breaker</option>
                          <option value="Dual Function">15A dual-function AFCI/GFCI breaker</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="bath-circuit-cable">Dedicated 14/2 NM-B (FT)</Label>
                        <Input id="bath-circuit-cable" type="number" min="0" step="1" value={inputs.newCircuitCableFootage ?? 0} onChange={(event) => setOptionalNumber("newCircuitCableFootage", event.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="bath-circuit-material-qty">Circuit material packages</Label>
                        <Input id="bath-circuit-material-qty" type="number" min="0" step="1" value={inputs.newCircuitMaterialsQuantity ?? 1} onChange={(event) => setOptionalNumber("newCircuitMaterialsQuantity", event.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="bath-circuit-material-cost">Material package unit-cost override ($)</Label>
                        <Input id="bath-circuit-material-cost" type="number" min="0" step="0.01" value={inputs.newCircuitMaterialsUnitCostOverride ?? ""} onChange={(event) => setOptionalNumber("newCircuitMaterialsUnitCostOverride", event.target.value)} placeholder="Use Price Book" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="bath-circuit-labor">Circuit labor (Hours)</Label>
                        <Input id="bath-circuit-labor" type="number" min="0" step="0.25" value={inputs.newCircuitLaborHours ?? 3} onChange={(event) => setOptionalNumber("newCircuitLaborHours", event.target.value)} />
                      </div>
                      <p className="self-end text-xs text-muted-foreground">The selected 15A breaker, 14/2 cable, normal circuit materials, and labor all flow through the same markup, target-margin, and profit calculation as the rest of the quote.</p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="bath-route">Common Wiring Route Length (FT)</Label>
                    <Input
                      id="bath-route"
                      type="number"
                      min="0"
                      value={inputs.routeLength}
                      onChange={(event) => setQuantity("routeLength", event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bath-labor-adj">Labor Adjustment (Hours)</Label>
                    <Input
                      id="bath-labor-adj"
                      type="number"
                      step="0.25"
                      value={inputs.laborAdjustmentHours ?? 0}
                      onChange={(event) => setInputs(c => ({...c, laborAdjustmentHours: parseFloat(event.target.value) || 0}))}
                    />
                    <p className="text-xs text-muted-foreground">Adds or removes field-assessed labor before pricing. Does not change company defaults.</p>
                  </div>
                  <div className="space-y-4 rounded-lg border p-4 md:col-span-2">
                    <label className="flex items-center gap-3 text-sm font-medium">
                      <Checkbox
                        checked={inputs.heatedFloorCircuit}
                        onCheckedChange={(checked) => setInputs((current) => ({ ...current, heatedFloorCircuit: checked === true }))}
                      />
                      Include heated-floor circuit
                    </label>
                    <p className="text-sm font-medium">Customer supplies the vanity light fixture; installation labor and incidental rough-in materials remain included.</p>
                    <p className="text-xs text-muted-foreground">Recessed lights and every selected exhaust configuration are contractor-supplied and priced through the company Price Book or the quote-local overrides above.</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bath-notes">Estimator Notes (Internal)</Label>
                  <Textarea id="bath-notes" value={inputs.notes} onChange={(event) => setInputs((current) => ({ ...current, notes: event.target.value }))} />
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
                  <CardDescription className="text-secondary-foreground/70">Uses the same server estimator as saved quote creation.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5 pt-6">
                  <QuoteBuilderRecovery settings={settingsQuery} revision={revision} />
                  <div className="flex items-start gap-3 rounded-md border border-primary/20 bg-primary/10 p-3 text-sm">
                    <Info className="mt-0.5 shrink-0 text-primary" size={16} />
                    <p className="text-secondary-foreground/80">The customer-supplied vanity fixture remains visible at zero purchase cost. Contractor-supplied exhaust equipment and the optional 15A circuit are included in pricing and margin.</p>
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
                        <div className="flex justify-between"><span>Gross Profit</span><span className="font-mono">${pricing.grossProfit.toFixed(2)}</span></div>
                        <div className="flex justify-between"><span>Gross Margin</span><span className="font-mono">{(pricing.grossMargin * 100).toFixed(1)}%</span></div>
                        <div className="flex justify-between border-t border-secondary-border pt-2 font-bold"><span>Final Selling Price</span><span className="font-mono text-primary">${pricing.finalSellingPrice.toFixed(2)}</span></div>
                      </div>
                    </>
                  ) : (
                    <div className="py-6 text-center text-sm text-secondary-foreground/70">Updating authoritative estimate...</div>
                  )}

                  <div className="space-y-3 border-t border-secondary-border pt-4">
                    <div className="space-y-2">
                       <Label htmlFor="bath-labor-override">Internal Labor Cost Override ($)</Label>
                      <Input id="bath-labor-override" min="0" step="0.01" type="number" value={laborOverride} onChange={(event) => setLaborOverride(event.target.value)} placeholder={pricing ? `Calculated: ${pricing.laborCost.toFixed(2)}` : "Optional"} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bath-price-override">Selling Price Override ($)</Label>
                      <Input id="bath-price-override" min="0" step="0.01" type="number" value={sellingPriceOverride} onChange={(event) => setSellingPriceOverride(event.target.value)} placeholder={pricing ? `Calculated: ${pricing.calculatedSellingPrice.toFixed(2)}` : "Optional"} />
                    </div>
                  </div>

                  {previewQuote.isError && <p className="text-sm text-destructive">The estimate preview could not be calculated.</p>}
                  <Button className="w-full text-lg font-bold" size="lg" type="submit" disabled={!settingsLoaded || createQuote.isPending || !previewIsCurrent || previewQuote.isError}>
                    {createQuote.isPending ? "Submitting..." : (!settingsLoaded || !previewIsCurrent) ? "Calculating..." : "Generate Bathroom Quote"}
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