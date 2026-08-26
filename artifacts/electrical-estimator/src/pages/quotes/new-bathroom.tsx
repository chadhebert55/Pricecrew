import {
  BathroomInputsCircuitOption,
  type BathroomInputs,
  useCreateQuote,
  usePreviewQuote,
} from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Calculator, Info, TriangleAlert, Waves } from "lucide-react"
import { useEffect, useState } from "react"
import { useLocation } from "wouter"

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
}

function optionalAmount(value: string) {
  if (value.trim() === "") return null
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? amount : null
}

export function NewBathroomQuote() {
  const [, setLocation] = useLocation()
  const createQuote = useCreateQuote()
  const previewQuote = usePreviewQuote()
  const [previewedInputKey, setPreviewedInputKey] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [customerEmail, setCustomerEmail] = useState("")
  const [projectName, setProjectName] = useState("")
  const [proposalDescription, setProposalDescription] = useState(
    "Provide labor and listed materials for the bathroom electrical scope, including device installation, lighting and ventilation connections, switching, testing, and final trim. Existing conditions and applicable protection requirements will be verified before work begins.",
  )
  const [laborOverride, setLaborOverride] = useState("")
  const [sellingPriceOverride, setSellingPriceOverride] = useState("")
  const [inputs, setInputs] = useState<BathroomInputs>(initialInputs)

  const previewPayload = {
    module: "BATHROOM" as const,
    jobInputs: inputs,
    laborOverride: optionalAmount(laborOverride),
    sellingPriceOverride: optionalAmount(sellingPriceOverride),
  }
  const currentInputKey = JSON.stringify(previewPayload)
  const previewIsCurrent = currentInputKey === previewedInputKey

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

  const setQuantity = (key: keyof BathroomInputs, value: string) => {
    setInputs((current) => ({
      ...current,
      [key]: Math.max(0, Number.parseInt(value, 10) || 0),
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
                <div className="space-y-2">
                  <Label htmlFor="bath-customer">Customer Name *</Label>
                  <Input id="bath-customer" required value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bath-email">Customer Email</Label>
                  <Input id="bath-email" type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} />
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
                  <div className="space-y-4 rounded-lg border p-4">
                    <label className="flex items-center gap-3 text-sm font-medium">
                      <Checkbox
                        checked={inputs.heatedFloorCircuit}
                        onCheckedChange={(checked) => setInputs((current) => ({ ...current, heatedFloorCircuit: checked === true }))}
                      />
                      Include heated-floor circuit
                    </label>
                    <label className="flex items-center gap-3 text-sm font-medium">
                      <Checkbox
                        checked={inputs.customerSuppliedFixtures}
                        onCheckedChange={(checked) => setInputs((current) => ({ ...current, customerSuppliedFixtures: checked === true }))}
                      />
                      Customer supplies light and fan fixtures
                    </label>
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
                  <div className="flex items-start gap-3 rounded-md border border-primary/20 bg-primary/10 p-3 text-sm">
                    <Info className="mt-0.5 shrink-0 text-primary" size={16} />
                    <p className="text-secondary-foreground/80">Customer-supplied fixtures remain visible in the assembly at zero material cost. Existing circuits and heat equipment produce verification warnings.</p>
                  </div>

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
                        <div className="flex justify-between"><span>Calculated Labor</span><span className="font-mono">${pricing.laborCost.toFixed(2)}</span></div>
                        <div className="flex justify-between border-t border-secondary-border pt-2 font-bold"><span>Final Selling Price</span><span className="font-mono text-primary">${pricing.finalSellingPrice.toFixed(2)}</span></div>
                      </div>
                    </>
                  ) : (
                    <div className="py-6 text-center text-sm text-secondary-foreground/70">Updating authoritative estimate...</div>
                  )}

                  <div className="space-y-3 border-t border-secondary-border pt-4">
                    <div className="space-y-2">
                      <Label htmlFor="bath-labor-override">Labor Cost Override ($)</Label>
                      <Input id="bath-labor-override" min="0" step="0.01" type="number" value={laborOverride} onChange={(event) => setLaborOverride(event.target.value)} placeholder={pricing ? `Calculated: ${pricing.laborCost.toFixed(2)}` : "Optional"} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bath-price-override">Selling Price Override ($)</Label>
                      <Input id="bath-price-override" min="0" step="0.01" type="number" value={sellingPriceOverride} onChange={(event) => setSellingPriceOverride(event.target.value)} placeholder={pricing ? `Calculated: ${pricing.calculatedSellingPrice.toFixed(2)}` : "Optional"} />
                    </div>
                  </div>

                  {previewQuote.isError && <p className="text-sm text-destructive">The estimate preview could not be calculated.</p>}
                  <Button className="w-full text-lg font-bold" size="lg" type="submit" disabled={createQuote.isPending || !previewIsCurrent || previewQuote.isError}>
                    {createQuote.isPending ? "Submitting..." : !previewIsCurrent ? "Calculating..." : "Generate Bathroom Quote"}
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