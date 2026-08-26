import {
  type RecessedLightingInputs,
  useCreateQuote,
  usePreviewQuote,
} from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Calculator, Info, Lightbulb, TriangleAlert } from "lucide-react"
import { useEffect, useState } from "react"
import { useLocation } from "wouter"

const initialInputs: RecessedLightingInputs = {
  roomLength: 16,
  roomWidth: 12,
  ceilingHeight: 8,
  fixtureSize: "4-inch",
  fixtureQuantity: 0,
  spacingFeet: 6,
  customerSuppliedFixtures: false,
  circuitOption: "Reuse existing lighting box/circuit",
  wiringDistance: 45,
  wiringAllowance: 15,
  switchType: "Single-pole",
  dimmerOption: "No dimmer",
  threeWaySwitchingOption: "Not included",
  notes: "",
  laborRateType: "residential",
  panelManufacturer: "Siemens",
  breakerAmperage: 20,
  breakerPoleCount: 1,
  breakerProtectionType: "Standard",
  cableType: "14/2 NM-B",
}

function optionalAmount(value: string) {
  if (value.trim() === "") return null
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? amount : null
}

function numericValue(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

export function NewRecessedLightingQuote() {
  const [, setLocation] = useLocation()
  const createQuote = useCreateQuote()
  const previewQuote = usePreviewQuote()
  const [previewedInputKey, setPreviewedInputKey] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [customerEmail, setCustomerEmail] = useState("")
  const [projectName, setProjectName] = useState("")
  const [proposalDescription, setProposalDescription] = useState(
    "Provide labor and listed materials for the recessed lighting scope, including fixture installation, switching, wiring, testing, and final trim. Fixture layout, access, circuit capacity, and applicable requirements will be verified before work begins.",
  )
  const [laborOverride, setLaborOverride] = useState("")
  const [sellingPriceOverride, setSellingPriceOverride] = useState("")
  const [inputs, setInputs] = useState<RecessedLightingInputs>(initialInputs)

  const previewPayload = {
    module: "RECESSED_LIGHTING" as const,
    jobInputs: inputs,
    laborOverride: optionalAmount(laborOverride),
    sellingPriceOverride: optionalAmount(sellingPriceOverride),
  }
  const currentInputKey = JSON.stringify(previewPayload)
  const previewIsCurrent = currentInputKey === previewedInputKey
  const isNewCircuit = inputs.circuitOption === "New dedicated circuit"

  useEffect(() => {
    const inputKey = JSON.stringify(previewPayload)
    const timeout = window.setTimeout(() => {
      previewQuote.mutate(
        { data: previewPayload },
        { onSuccess: () => setPreviewedInputKey(inputKey) },
      )
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [inputs, laborOverride, sellingPriceOverride])

  const setNumber = (
    key: keyof RecessedLightingInputs,
    value: string,
  ) => {
    setInputs((current) => ({
      ...current,
      [key]: numericValue(value),
    }))
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!previewIsCurrent) return
    createQuote.mutate(
      {
        data: {
          customerName,
          customerEmail: customerEmail || null,
          projectName,
          module: "RECESSED_LIGHTING",
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
  const planning = previewQuote.data?.planning
  const assembly = previewQuote.data?.assembly ?? []

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-24">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New Recessed Lighting Quote</h1>
        <p className="mt-1 text-muted-foreground">Recessed Lighting Builder</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <Card className="border-t-4 border-t-secondary">
              <CardHeader>
                <CardTitle>Project Details</CardTitle>
                <CardDescription>Keep the customer proposal separate from internal estimate notes.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="recessed-customer">Customer Name *</Label>
                  <Input id="recessed-customer" required value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recessed-email">Customer Email</Label>
                  <Input id="recessed-email" type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="recessed-project">Project Name *</Label>
                  <Input id="recessed-project" required value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Living room recessed lighting" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="recessed-proposal">Customer-facing Proposal Description *</Label>
                  <Textarea id="recessed-proposal" required value={proposalDescription} onChange={(event) => setProposalDescription(event.target.value)} />
                </div>
              </CardContent>
            </Card>

            <Card className="border-t-4 border-t-primary shadow-md">
              <CardHeader className="border-b border-primary/10 bg-primary/5">
                <div className="flex items-center gap-2">
                  <Lightbulb className="text-primary" size={20} />
                  <CardTitle>Parametric Builder: Recessed Lighting</CardTitle>
                </div>
                <CardDescription>Use room dimensions for planning guidance, then confirm the final layout in the field.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8 pt-6">
                <section>
                  <h3 className="mb-4 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Room and fixture plan</h3>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="recessed-length">Room Length (FT)</Label>
                      <Input id="recessed-length" type="number" min="0" step="0.1" value={inputs.roomLength} onChange={(event) => setNumber("roomLength", event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="recessed-width">Room Width (FT)</Label>
                      <Input id="recessed-width" type="number" min="0" step="0.1" value={inputs.roomWidth} onChange={(event) => setNumber("roomWidth", event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="recessed-height">Ceiling Height (FT)</Label>
                      <Input id="recessed-height" type="number" min="0" step="0.1" value={inputs.ceilingHeight} onChange={(event) => setNumber("ceilingHeight", event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="recessed-size">Fixture Size</Label>
                      <select id="recessed-size" value={inputs.fixtureSize} onChange={(event) => setInputs((current) => ({ ...current, fixtureSize: event.target.value as RecessedLightingInputs["fixtureSize"] }))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="4-inch">Juno 4-inch regressed wafer — $29 default</option>
                        <option value="6-inch">Juno 6-inch regressed wafer — $32 default</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="recessed-quantity">Fixture Quantity</Label>
                      <Input id="recessed-quantity" type="number" min="0" step="1" value={inputs.fixtureQuantity} onChange={(event) => setNumber("fixtureQuantity", event.target.value)} />
                      <p className="text-xs text-muted-foreground">Use 0 to use the room-dimension suggestion.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="recessed-spacing">Planning Spacing Assumption (FT)</Label>
                      <Input id="recessed-spacing" type="number" min="4" max="12" step="0.5" value={inputs.spacingFeet} onChange={(event) => setNumber("spacingFeet", event.target.value)} />
                    </div>
                  </div>
                  <label className="mt-5 flex items-center gap-3 rounded-lg border p-4 text-sm font-medium">
                    <Checkbox checked={inputs.customerSuppliedFixtures} onCheckedChange={(checked) => setInputs((current) => ({ ...current, customerSuppliedFixtures: checked === true }))} />
                    Customer supplies recessed fixtures
                  </label>
                </section>

                <section>
                  <h3 className="mb-4 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Circuit and wiring</h3>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="recessed-circuit">Lighting Feed</Label>
                      <select id="recessed-circuit" value={inputs.circuitOption} onChange={(event) => setInputs((current) => ({ ...current, circuitOption: event.target.value as RecessedLightingInputs["circuitOption"] }))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="Reuse existing lighting box/circuit">Reuse existing lighting box / circuit</option>
                        <option value="New dedicated circuit">New dedicated circuit</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="recessed-cable">Cable Selection</Label>
                      <select id="recessed-cable" value={inputs.cableType} onChange={(event) => setInputs((current) => ({ ...current, cableType: event.target.value as RecessedLightingInputs["cableType"] }))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="14/2 NM-B">14/2 NM-B — $0.37/FT verified default</option>
                        <option value="14/3 NM-B">14/3 NM-B — $0.53/FT verified default</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="recessed-distance">Approximate Wiring Distance (FT)</Label>
                      <Input id="recessed-distance" type="number" min="0" step="1" value={inputs.wiringDistance} onChange={(event) => setNumber("wiringDistance", event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="recessed-allowance">Wiring Allowance (%)</Label>
                      <Input id="recessed-allowance" type="number" min="0" step="1" value={inputs.wiringAllowance} onChange={(event) => setNumber("wiringAllowance", event.target.value)} />
                    </div>
                  </div>
                  {isNewCircuit && (
                    <div className="mt-5 rounded-lg border bg-muted/15 p-4">
                      <p className="mb-4 text-sm font-semibold">New-circuit protection selection</p>
                      <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
                        <div className="space-y-2">
                          <Label htmlFor="recessed-panel">Panel Manufacturer</Label>
                          <select id="recessed-panel" value={inputs.panelManufacturer ?? ""} onChange={(event) => setInputs((current) => ({ ...current, panelManufacturer: event.target.value }))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                            <option value="Siemens">Siemens / ITE</option>
                            <option value="Eaton">Eaton BR</option>
                            <option value="Square D">Square D Homeline</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="recessed-amps">Breaker Amperage</Label>
                          <Input id="recessed-amps" type="number" min="0" value={inputs.breakerAmperage ?? 0} onChange={(event) => setNumber("breakerAmperage", event.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="recessed-poles">Pole Count</Label>
                          <select id="recessed-poles" value={inputs.breakerPoleCount ?? 0} onChange={(event) => setInputs((current) => ({ ...current, breakerPoleCount: Number(event.target.value) }))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                            <option value="1">1-pole</option>
                            <option value="2">2-pole</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="recessed-protection">Protection Type</Label>
                          <select id="recessed-protection" value={inputs.breakerProtectionType ?? "Standard"} onChange={(event) => setInputs((current) => ({ ...current, breakerProtectionType: event.target.value }))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                            <option value="Standard">Standard</option>
                            <option value="GFCI">GFCI</option>
                            <option value="AFCI">AFCI</option>
                            <option value="Dual Function">Dual Function</option>
                          </select>
                        </div>
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">The estimate matches the company price book exactly. Missing combinations remain unresolved instead of being substituted.</p>
                    </div>
                  )}
                </section>

                <section>
                  <h3 className="mb-4 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Switching and labor</h3>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="recessed-switch">Switch Type</Label>
                      <select id="recessed-switch" value={inputs.switchType} onChange={(event) => setInputs((current) => ({ ...current, switchType: event.target.value as RecessedLightingInputs["switchType"] }))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="Single-pole">Single-pole</option>
                        <option value="3-way">3-way</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="recessed-three-way">3-way Switching Option</Label>
                      <select id="recessed-three-way" value={inputs.threeWaySwitchingOption} onChange={(event) => setInputs((current) => ({ ...current, threeWaySwitchingOption: event.target.value as RecessedLightingInputs["threeWaySwitchingOption"] }))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="Not included">Not included</option>
                        <option value="Include 3-way switching">Include 3-way switching</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="recessed-dimmer">Dimmer Option</Label>
                      <select id="recessed-dimmer" value={inputs.dimmerOption} onChange={(event) => setInputs((current) => ({ ...current, dimmerOption: event.target.value as RecessedLightingInputs["dimmerOption"] }))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="No dimmer">No dimmer</option>
                        <option value="Include dimmer">Include dimmer</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="recessed-labor-rate">Labor Sell Rate</Label>
                      <select id="recessed-labor-rate" value={inputs.laborRateType ?? "residential"} onChange={(event) => setInputs((current) => ({ ...current, laborRateType: event.target.value as RecessedLightingInputs["laborRateType"] }))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="residential">Residential</option>
                        <option value="commercial">Commercial</option>
                      </select>
                    </div>
                  </div>
                </section>

                <div className="space-y-2">
                  <Label htmlFor="recessed-notes">Estimator Notes (Internal)</Label>
                  <Textarea id="recessed-notes" value={inputs.notes} onChange={(event) => setInputs((current) => ({ ...current, notes: event.target.value }))} placeholder="Access, existing conditions, fixture layout notes..." />
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
                  <CardDescription className="text-secondary-foreground/70">Server-calculated from current company settings and price-book rows.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5 pt-6">
                  <div className="flex items-start gap-3 rounded-md border border-primary/20 bg-primary/10 p-3 text-sm">
                    <Info className="mt-0.5 shrink-0 text-primary" size={16} />
                    <p className="text-secondary-foreground/80">Room dimensions and spacing are planning guidance only. Verify layout, access, conductors, circuit capacity, and applicable requirements in the field.</p>
                  </div>

                  {planning && previewIsCurrent && (
                    <div className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm">
                      <p className="font-semibold text-primary">Planning guidance</p>
                      <p className="mt-1 text-secondary-foreground/80">Suggested: <strong>{planning.suggestedFixtureQuantity || "—"}</strong> fixtures at approximately <strong>{planning.spacingFeet} FT</strong> spacing.</p>
                      <p className="mt-1 text-xs text-secondary-foreground/70">Estimate quantity: {planning.actualFixtureQuantity || "—"} ({planning.quantitySource}).</p>
                    </div>
                  )}

                  {pricing && previewIsCurrent ? (
                    <>
                      {pricing.pricingWarnings.length > 0 && (
                        <div className="rounded-md border border-amber-400/40 bg-amber-400/10 p-3">
                          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-300">
                            <TriangleAlert size={16} /> Estimate needs confirmation
                          </div>
                          <ul className="space-y-1 pl-5 text-xs text-secondary-foreground/80 list-disc">
                            {pricing.pricingWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                          </ul>
                        </div>
                      )}
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between"><span>Material Cost</span><span className="font-mono">${pricing.materialCost.toFixed(2)}</span></div>
                        <div className="flex justify-between"><span>Loaded Internal Labor Cost</span><span className="font-mono">${pricing.laborCost.toFixed(2)}</span></div>
                        {pricing.laborSellAmount !== undefined && <div className="flex justify-between"><span>Customer Labor ({pricing.laborRateType} @ ${pricing.laborSellRate?.toFixed(2)}/hr)</span><span className="font-mono">${pricing.laborSellAmount.toFixed(2)}</span></div>}
                        <div className="flex justify-between border-t border-secondary-border pt-2 font-bold"><span>Calculated Sell Price</span><span className="font-mono text-primary">${pricing.calculatedSellingPrice.toFixed(2)}</span></div>
                        <div className="flex justify-between font-bold"><span>Final Selling Price</span><span className="font-mono text-primary">${pricing.finalSellingPrice.toFixed(2)}</span></div>
                      </div>
                      {assembly.length > 0 && (
                        <div className="border-t border-secondary-border pt-4">
                          <p className="mb-2 text-sm font-semibold">Calculated Assembly</p>
                          <div className="space-y-2 text-xs">
                            {assembly.map((line) => (
                              <div key={line.id} className="border-b border-secondary-border/60 pb-2">
                                <div className="flex justify-between gap-2">
                                  <span>{line.description}</span>
                                  <span className="shrink-0 font-mono">${line.extendedCost.toFixed(2)}</span>
                                </div>
                                <p className="mt-0.5 text-secondary-foreground/60">{line.quantity} {line.unit} · {line.source}</p>
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
                      <Label htmlFor="recessed-labor-override">Internal Labor Cost Override ($)</Label>
                      <Input id="recessed-labor-override" type="number" min="0" step="0.01" value={laborOverride} onChange={(event) => setLaborOverride(event.target.value)} placeholder={pricing ? `Calculated: ${pricing.laborCost.toFixed(2)}` : "Optional"} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="recessed-price-override">Selling Price Override ($)</Label>
                      <Input id="recessed-price-override" type="number" min="0" step="0.01" value={sellingPriceOverride} onChange={(event) => setSellingPriceOverride(event.target.value)} placeholder={pricing ? `Calculated: ${pricing.calculatedSellingPrice.toFixed(2)}` : "Optional"} />
                    </div>
                  </div>

                  {previewQuote.isError && <p className="text-sm text-destructive">The estimate preview could not be calculated.</p>}
                  <Button className="w-full text-lg font-bold" size="lg" type="submit" disabled={createQuote.isPending || !previewIsCurrent || previewQuote.isError}>
                    {createQuote.isPending ? "Submitting..." : !previewIsCurrent ? "Calculating..." : "Generate Recessed Lighting Quote"}
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