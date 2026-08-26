import {
  type KitchenInputs,
  useCreateQuote,
  usePreviewQuote,
} from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Calculator, Info, TriangleAlert, UtensilsCrossed } from "lucide-react"
import { useEffect, useState } from "react"
import { useLocation } from "wouter"

const initialInputs: KitchenInputs = {
  refrigeratorCircuits: 1,
  dishwasherCircuits: 1,
  disposalCircuits: 1,
  gasRangeCircuits: 0,
  electricRangeCircuits: 1,
  countertopReceptacles: 4,
  sinkLights: 1,
  islandPendants: 2,
  undercabinetLighting: 1,
  recessedLights: 4,
  threeWayOptions: 1,
  dimmers: 2,
  usbReceptacles: 1,
  additionalDedicatedCircuits: 0,
  routeLength: 80,
  customerSuppliedFixtures: true,
  notes: "",
}

function optionalAmount(value: string) {
  if (value.trim() === "") return null
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? amount : null
}

export function NewKitchenQuote() {
  const [, setLocation] = useLocation()
  const createQuote = useCreateQuote()
  const previewQuote = usePreviewQuote()
  const [previewedInputKey, setPreviewedInputKey] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [customerEmail, setCustomerEmail] = useState("")
  const [projectName, setProjectName] = useState("")
  const [proposalDescription, setProposalDescription] = useState(
    "Provide labor and listed materials for the kitchen electrical scope, including appliance circuits, countertop receptacles, lighting, controls, device trim, testing, and final connections. Final appliance specifications, layout, and field conditions will be verified before work begins.",
  )
  const [laborOverride, setLaborOverride] = useState("")
  const [sellingPriceOverride, setSellingPriceOverride] = useState("")
  const [inputs, setInputs] = useState<KitchenInputs>(initialInputs)

  const previewPayload = {
    module: "KITCHEN" as const,
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

  const setQuantity = (key: keyof KitchenInputs, value: string) => {
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
          module: "KITCHEN",
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
  const groups: Array<{
    title: string
    fields: Array<{ key: keyof KitchenInputs; label: string; help: string }>
  }> = [
    {
      title: "Appliance circuits",
      fields: [
        { key: "refrigeratorCircuits", label: "Refrigerator", help: "Dedicated refrigerator circuits" },
        { key: "dishwasherCircuits", label: "Dishwasher", help: "Dedicated dishwasher circuits" },
        { key: "disposalCircuits", label: "Disposal", help: "Garbage disposal circuits" },
        { key: "gasRangeCircuits", label: "Gas range", help: "Gas range convenience circuits" },
        { key: "electricRangeCircuits", label: "Electric range", help: "Electric range circuits" },
        { key: "additionalDedicatedCircuits", label: "Additional dedicated", help: "Other appliance circuits" },
      ],
    },
    {
      title: "Devices and controls",
      fields: [
        { key: "countertopReceptacles", label: "Countertop receptacles", help: "GFCI countertop devices" },
        { key: "usbReceptacles", label: "USB receptacles", help: "USB charging devices" },
        { key: "threeWayOptions", label: "3-way options", help: "Paired 3-way controls" },
        { key: "dimmers", label: "Dimmers", help: "Lighting dimmer controls" },
      ],
    },
    {
      title: "Lighting",
      fields: [
        { key: "sinkLights", label: "Sink lights", help: "Task lighting above sink" },
        { key: "islandPendants", label: "Island pendants", help: "Pendant fixture locations" },
        { key: "undercabinetLighting", label: "Undercabinet lighting", help: "Lighting zones or runs" },
        { key: "recessedLights", label: "Recessed lights", help: "Ceiling lighting locations" },
      ],
    },
  ]

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-24">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New Kitchen Quote</h1>
        <p className="mt-1 text-muted-foreground">Kitchen Electrical Builder</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <Card className="border-t-4 border-t-secondary">
              <CardHeader><CardTitle>Project Details</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="kitchen-customer">Customer Name *</Label>
                  <Input id="kitchen-customer" required value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kitchen-email">Customer Email</Label>
                  <Input id="kitchen-email" type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="kitchen-project">Project Name *</Label>
                  <Input id="kitchen-project" required value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Kitchen renovation" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="kitchen-proposal">Customer-facing Proposal Description *</Label>
                  <Textarea id="kitchen-proposal" required value={proposalDescription} onChange={(event) => setProposalDescription(event.target.value)} />
                </div>
              </CardContent>
            </Card>

            <Card className="border-t-4 border-t-primary shadow-md">
              <CardHeader className="border-b border-primary/10 bg-primary/5">
                <div className="flex items-center gap-2">
                  <UtensilsCrossed className="text-primary" size={20} />
                  <CardTitle>Parametric Builder: Kitchen</CardTitle>
                </div>
                <CardDescription>Configure appliance circuits, devices, lighting, controls, and common wiring.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8 pt-6">
                {groups.map((group) => (
                  <section key={group.title}>
                    <h3 className="mb-4 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">{group.title}</h3>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {group.fields.map((field) => (
                        <div key={field.key} className="rounded-lg border bg-muted/15 p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <Label htmlFor={`kitchen-${field.key}`}>{field.label}</Label>
                              <p className="mt-1 text-xs text-muted-foreground">{field.help}</p>
                            </div>
                            <Input
                              id={`kitchen-${field.key}`}
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
                  </section>
                ))}

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="kitchen-route">Common Wiring Route Length (FT)</Label>
                    <Input id="kitchen-route" type="number" min="0" value={inputs.routeLength} onChange={(event) => setQuantity("routeLength", event.target.value)} />
                  </div>
                  <label className="flex items-center gap-3 rounded-lg border p-4 text-sm font-medium">
                    <Checkbox checked={inputs.customerSuppliedFixtures} onCheckedChange={(checked) => setInputs((current) => ({ ...current, customerSuppliedFixtures: checked === true }))} />
                    Customer supplies decorative light fixtures
                  </label>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="kitchen-notes">Estimator Notes (Internal)</Label>
                  <Textarea id="kitchen-notes" value={inputs.notes} onChange={(event) => setInputs((current) => ({ ...current, notes: event.target.value }))} />
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
                    <p className="text-secondary-foreground/80">Appliance specifications, countertop spacing, route, and protection requirements remain visible verification items rather than hidden assumptions.</p>
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
                      <Label htmlFor="kitchen-labor-override">Labor Cost Override ($)</Label>
                      <Input id="kitchen-labor-override" type="number" min="0" step="0.01" value={laborOverride} onChange={(event) => setLaborOverride(event.target.value)} placeholder={pricing ? `Calculated: ${pricing.laborCost.toFixed(2)}` : "Optional"} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="kitchen-price-override">Selling Price Override ($)</Label>
                      <Input id="kitchen-price-override" type="number" min="0" step="0.01" value={sellingPriceOverride} onChange={(event) => setSellingPriceOverride(event.target.value)} placeholder={pricing ? `Calculated: ${pricing.calculatedSellingPrice.toFixed(2)}` : "Optional"} />
                    </div>
                  </div>

                  {previewQuote.isError && <p className="text-sm text-destructive">The estimate preview could not be calculated.</p>}
                  <Button className="w-full text-lg font-bold" size="lg" type="submit" disabled={createQuote.isPending || !previewIsCurrent || previewQuote.isError}>
                    {createQuote.isPending ? "Submitting..." : !previewIsCurrent ? "Calculating..." : "Generate Kitchen Quote"}
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