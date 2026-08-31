import {
  type KitchenInputs,
  usePreviewQuote,
  useGetSettings,
} from "@workspace/api-client-react"
import { pricingWarningKey, pricingWarningMessage } from "@/lib/pricing-warnings"
import { contractorMaterialName } from "@/lib/material-display"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Calculator, Info, TriangleAlert, UtensilsCrossed } from "lucide-react"
import { useEffect, useState } from "react"
import { useLocation } from "wouter"
import { CustomerPicker } from "@/components/customer-picker"
import { useQuoteCreateMutation } from "@/hooks/use-quote-create-mutation"
import { useQuoteRevisionPrefill } from "@/hooks/use-quote-revision-prefill"
import { useQuoteBuilderDraft } from "@/hooks/use-quote-builder-draft"
import { QuoteBuilderRecovery } from "@/components/quote-builder-recovery"

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
  fourWayLocations: 0,
  fourWayCableFootage: 0,
  fourWayLaborHoursPerLocation: 0.75,
  dimmers: 2,
  usbReceptacles: 1,
  additionalDedicatedCircuits: 0,
  routeLength: 80,
  includeLightingCircuit: true,
  lightingCircuitAmperage: 15,
  lightingCircuitFootage: 40,
  lightingCircuitLaborHours: 3,
  smallApplianceCircuits: 2,
  microwaveCircuits: 1,
  applianceHomeRun12_2Length: 60,
  applianceCircuitAmperage: 20,
  breaker15AProtectionType: "Dual Function",
  breaker20AProtectionType: "Dual Function",
  customerSuppliedFixtures: true,
  notes: "",
  laborRateType: "residential",
  panelManufacturer: "Siemens",
  recessedLightSize: "4-inch",
  cableType: "12/2 NM-B",
  laborAdjustmentHours: 0,
}

function optionalAmount(value: string) {
  if (value.trim() === "") return null
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? amount : null
}

export function NewKitchenQuote() {
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
    "Provide labor and listed materials for the selected kitchen electrical scope, including the selected appliance branch circuits, a 15A lighting circuit, multi-location lighting controls, device trim, testing, and final connections. Final appliance specifications, circuit assumptions, layout, and field conditions will be verified before work begins.",
  )
  const [laborOverride, setLaborOverride] = useState("")
  const [sellingPriceOverride, setSellingPriceOverride] = useState("")
  const [inputs, setInputs] = useState<KitchenInputs>(initialInputs)
  const revision = useQuoteRevisionPrefill("KITCHEN", { setCustomerName, setCustomerEmail, setCustomerId, setProjectName, setProposalDescription, setInputs, setSettingsLoaded })
  const { draftRecovery } = useQuoteBuilderDraft({
    module: "KITCHEN",
    ready: settingsLoaded && !revision.isRevision,
    values: { customerName, customerEmail, customerId, projectName, proposalDescription, inputs, laborOverride, sellingPriceOverride },
    setters: { setCustomerName, setCustomerEmail, setCustomerId, setProjectName, setProposalDescription, setInputs, setLaborOverride, setSellingPriceOverride },
  })

  useEffect(() => {
    if (settings && !settingsLoaded && !revision.isRevision) {
      setInputs((current) => ({
        ...current,
        laborAdjustmentHours: settings.kitchenLaborAdjustmentHours ?? 0,
      }))
      setSettingsLoaded(true)
    }
  }, [settings, settingsLoaded])

  const previewPayload = {
    module: "KITCHEN" as const,
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

  const setQuantity = (key: keyof KitchenInputs, value: string) => {
    setInputs((current) => ({
      ...current,
      [key]: Math.max(0, Number.parseInt(value, 10) || 0),
    }))
  }

  const setNumber = (key: keyof KitchenInputs, value: string) => {
    setInputs((current) => ({
      ...current,
      [key]: Math.max(0, Number(value) || 0),
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
  const assembly = previewQuote.data?.assembly
  const selectedApplianceCircuitCount =
    Math.max(0, inputs.smallApplianceCircuits ?? 0) +
    Math.max(0, inputs.microwaveCircuits ?? 0)
  const applianceHomeRunLength = Math.max(0, inputs.applianceHomeRun12_2Length ?? 0)
  const applianceHomeRunFootage = applianceHomeRunLength * selectedApplianceCircuitCount
  const includedLightingCircuitCount =
    inputs.includeLightingCircuit &&
    inputs.sinkLights + inputs.islandPendants + inputs.undercabinetLighting + inputs.recessedLights > 0
      ? 1
      : 0
  const applianceCircuitAmperage = Math.max(1, inputs.applianceCircuitAmperage ?? 20)
  const automatic15ABreakerQuantity =
    includedLightingCircuitCount +
    (applianceCircuitAmperage === 15 ? selectedApplianceCircuitCount : 0)
  const automatic20ABreakerQuantity =
    (inputs.countertopReceptacles > 0 ? 1 : 0) +
    (applianceCircuitAmperage === 20 ? selectedApplianceCircuitCount : 0)
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
      title: "Breakers",
      fields: [],
    },
    {
      title: "Devices and controls",
      fields: [
        { key: "countertopReceptacles", label: "Countertop receptacles", help: "Normal Decora tamper-resistant devices; protection is priced separately at the breaker" },
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
                <CustomerPicker idPrefix="kitchen" customerId={customerId} customerName={customerName} customerEmail={customerEmail} onCustomerIdChange={setCustomerId} onCustomerNameChange={setCustomerName} onCustomerEmailChange={setCustomerEmail} />
                <div className="space-y-2">
                  <Label htmlFor="kitchen-customer">Customer Name *</Label>
                  <Input id="kitchen-customer" required value={customerName} onChange={(event) => { setCustomerId(undefined); setCustomerName(event.target.value) }} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kitchen-email">Customer Email</Label>
                  <Input id="kitchen-email" type="email" value={customerEmail} onChange={(event) => { setCustomerId(undefined); setCustomerEmail(event.target.value) }} />
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
                    {group.title === "Appliance circuits" && (
                      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="rounded-lg border bg-muted/15 p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <Label htmlFor="kitchen-small-appliance-circuits">Small Appliance Circuits</Label>
                              <p className="mt-1 text-xs text-muted-foreground">Quantity of configured small-appliance circuit assemblies.</p>
                            </div>
                            <Input id="kitchen-small-appliance-circuits" className="w-24 text-right font-mono" type="number" min="0" value={inputs.smallApplianceCircuits ?? 0} onChange={(event) => setQuantity("smallApplianceCircuits", event.target.value)} />
                          </div>
                        </div>
                        <div className="rounded-lg border bg-muted/15 p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <Label htmlFor="kitchen-microwave-circuits">Microwave Circuit</Label>
                              <p className="mt-1 text-xs text-muted-foreground">Quantity of configured microwave circuit assemblies.</p>
                            </div>
                            <Input id="kitchen-microwave-circuits" className="w-24 text-right font-mono" type="number" min="0" value={inputs.microwaveCircuits ?? 0} onChange={(event) => setQuantity("microwaveCircuits", event.target.value)} />
                          </div>
                        </div>
                        <div className="rounded-lg border bg-primary/5 p-4 md:col-span-2">
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <Label htmlFor="kitchen-appliance-home-run">Home Run 12/2 Length (FT)</Label>
                              <p className="mt-1 max-w-2xl text-xs text-muted-foreground">Approximate distance from the kitchen appliance-circuit area back to the panel. This length is multiplied by the Small Appliance Circuits and Microwave Circuit quantities above.</p>
                            </div>
                            <Input id="kitchen-appliance-home-run" className="w-full text-right font-mono sm:w-32" type="number" min="0" value={inputs.applianceHomeRun12_2Length ?? 0} onChange={(event) => setNumber("applianceHomeRun12_2Length", event.target.value)} />
                          </div>
                          <div className="mt-4 rounded-md border bg-background p-3 text-sm">
                            <span className="font-semibold">Estimated 12/2 home-run material: </span>
                            <span className="font-mono">{applianceHomeRunLength} FT × {selectedApplianceCircuitCount} selected circuits = {applianceHomeRunFootage} FT</span>
                          </div>
                        </div>
                      </div>
                    )}
                    {group.title === "Breakers" && (
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {([
                          {
                            amperage: 15,
                            quantityKey: "breaker15AQuantity",
                            protectionKey: "breaker15AProtectionType",
                            automaticQuantity: automatic15ABreakerQuantity,
                            help: "Automatically includes the selected 15A lighting circuit and any included 15A appliance circuits.",
                          },
                          {
                            amperage: 20,
                            quantityKey: "breaker20AQuantity",
                            protectionKey: "breaker20AProtectionType",
                            automaticQuantity: automatic20ABreakerQuantity,
                            help: "Automatically includes one countertop circuit plus the included 20A small-appliance and microwave circuits.",
                          },
                        ] as const).map((breaker) => {
                          const hasOverride = inputs[breaker.quantityKey] !== undefined
                          return (
                            <div key={breaker.amperage} className="rounded-lg border bg-primary/5 p-4">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <Label htmlFor={`kitchen-breaker-${breaker.amperage}-quantity`}>{breaker.amperage}A Breakers</Label>
                                  <p className="mt-1 text-xs text-muted-foreground">{breaker.help}</p>
                                </div>
                                <Input
                                  id={`kitchen-breaker-${breaker.amperage}-quantity`}
                                  className="w-24 text-right font-mono"
                                  type="number"
                                  min="0"
                                  value={inputs[breaker.quantityKey] ?? breaker.automaticQuantity}
                                  onChange={(event) => setQuantity(breaker.quantityKey, event.target.value)}
                                />
                              </div>
                              <div className="mt-4 space-y-2">
                                <Label htmlFor={`kitchen-breaker-${breaker.amperage}-protection`}>Protection Type</Label>
                                <select
                                  id={`kitchen-breaker-${breaker.amperage}-protection`}
                                  value={inputs[breaker.protectionKey] ?? "Dual Function"}
                                  onChange={(event) => setInputs((current) => ({ ...current, [breaker.protectionKey]: event.target.value }))}
                                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                                >
                                  <option value="AFCI">AFCI / Arc Fault</option>
                                  <option value="GFCI">GFCI</option>
                                  <option value="Dual Function">Dual Function AFCI + GFCI</option>
                                </select>
                              </div>
                              <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                                <span>Included-circuit quantity: {breaker.automaticQuantity}</span>
                                {hasOverride && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-auto px-2 py-1 text-xs"
                                    onClick={() => setInputs((current) => ({ ...current, [breaker.quantityKey]: undefined }))}
                                  >
                                    Use included circuits
                                  </Button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                        <div className="rounded-md border border-primary/20 bg-background p-3 text-sm md:col-span-2">
                          Breaker choices are configurable estimating defaults. Each selection resolves the matching panel manufacturer, protection type, and company price-book material without changing the countertop receptacle device.
                        </div>
                      </div>
                    )}
                    {group.title === "Lighting" && (
                      <div className="mt-4 space-y-4">
                        <div className="rounded-lg border bg-primary/5 p-4">
                          <label className="flex items-start gap-3">
                            <Checkbox checked={inputs.includeLightingCircuit === true} onCheckedChange={(checked) => setInputs((current) => ({ ...current, includeLightingCircuit: checked === true, lightingCircuitAmperage: 15 }))} />
                            <span>
                              <span className="block font-semibold">15A Kitchen Lighting Circuit</span>
                              <span className="text-xs text-muted-foreground">Uses the selected panel manufacturer’s contractor-configured 15A breaker and the editable 14/2 NM-B price-book row.</span>
                            </span>
                          </label>
                          {inputs.includeLightingCircuit && (
                            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                              <div className="space-y-2">
                                <Label>Lighting Circuit</Label>
                                <div className="flex h-9 items-center rounded-md border bg-background px-3 text-sm font-medium">15A / 1-pole / 14/2 NM-B</div>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="kitchen-lighting-footage">14/2 Footage (FT)</Label>
                                <Input id="kitchen-lighting-footage" type="number" min="0" value={inputs.lightingCircuitFootage ?? 0} onChange={(event) => setNumber("lightingCircuitFootage", event.target.value)} />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="kitchen-lighting-labor">Lighting Circuit Labor (HR)</Label>
                                <Input id="kitchen-lighting-labor" type="number" min="0" step="0.25" value={inputs.lightingCircuitLaborHours ?? 0} onChange={(event) => setNumber("lightingCircuitLaborHours", event.target.value)} />
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="rounded-lg border bg-muted/15 p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <Label htmlFor="kitchen-four-way-locations">4-way switch locations</Label>
                              <p className="mt-1 text-xs text-muted-foreground">Additional locations in the multi-location lighting control setup.</p>
                            </div>
                            <Input id="kitchen-four-way-locations" className="w-24 text-right font-mono" type="number" min="0" value={inputs.fourWayLocations ?? 0} onChange={(event) => setQuantity("fourWayLocations", event.target.value)} />
                          </div>
                          {(inputs.fourWayLocations ?? 0) > 0 && (
                            <div className="mt-4 rounded-md border border-primary/20 bg-primary/5 p-3">
                              <p className="font-semibold">4-Way Lighting-Control Extension</p>
                              <p className="mt-1 text-xs text-muted-foreground">Each location adds its own editable switch, box, plate, cable allowance, and labor. It remains part of the selected lighting circuit and does not create another breaker.</p>
                              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                  <Label htmlFor="kitchen-four-way-footage">Configurable 14/3 Footage (FT)</Label>
                                  <Input id="kitchen-four-way-footage" type="number" min="0" value={inputs.fourWayCableFootage ?? 0} onChange={(event) => setNumber("fourWayCableFootage", event.target.value)} />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="kitchen-four-way-labor">Labor per 4-Way Location (HR)</Label>
                                  <Input id="kitchen-four-way-labor" type="number" min="0" step="0.25" value={inputs.fourWayLaborHoursPerLocation ?? 0} onChange={(event) => setNumber("fourWayLaborHoursPerLocation", event.target.value)} />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </section>
                ))}

                <section>
                  <h3 className="mb-4 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Pricing and materials</h3>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="kitchen-labor-rate">Labor Sell Rate</Label>
                      <select id="kitchen-labor-rate" value={inputs.laborRateType ?? "residential"} onChange={(event) => setInputs((current) => ({ ...current, laborRateType: event.target.value as KitchenInputs["laborRateType"] }))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="residential">Residential</option>
                        <option value="commercial">Commercial</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="kitchen-recessed-size">Recessed light</Label>
                      <select id="kitchen-recessed-size" value={inputs.recessedLightSize ?? "4-inch"} onChange={(event) => setInputs((current) => ({ ...current, recessedLightSize: event.target.value as KitchenInputs["recessedLightSize"] }))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="4-inch">4-inch regressed wafer light</option>
                        <option value="6-inch">6-inch regressed wafer light</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="kitchen-cable">Common-Route Cable</Label>
                      <select id="kitchen-cable" value={inputs.cableType ?? "12/2 NM-B"} onChange={(event) => setInputs((current) => ({ ...current, cableType: event.target.value as KitchenInputs["cableType"] }))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="12/2 NM-B">12/2 NM-B</option>
                        <option value="14/2 NM-B">14/2 NM-B</option>
                        <option value="14/3 NM-B">14/3 NM-B</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="kitchen-panel">Panel Manufacturer</Label>
                      <select id="kitchen-panel" value={inputs.panelManufacturer ?? "Siemens"} onChange={(event) => setInputs((current) => ({ ...current, panelManufacturer: event.target.value }))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="Siemens">Siemens / ITE</option>
                        <option value="Eaton">Eaton BR</option>
                        <option value="Square D">Square D Homeline</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="kitchen-appliance-amps">Selected Branch-Circuit Amperage</Label>
                      <Input id="kitchen-appliance-amps" type="number" min="1" value={inputs.applianceCircuitAmperage ?? 20} onChange={(event) => setNumber("applianceCircuitAmperage", event.target.value)} />
                    </div>
                  </div>
                </section>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="kitchen-route">Common Wiring Route Length (FT)</Label>
                    <Input id="kitchen-route" type="number" min="0" value={inputs.routeLength} onChange={(event) => setQuantity("routeLength", event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="kitchen-labor-adj">Labor Adjustment (Hours)</Label>
                    <Input id="kitchen-labor-adj" type="number" step="0.25" value={inputs.laborAdjustmentHours ?? 0} onChange={(event) => setInputs(c => ({...c, laborAdjustmentHours: parseFloat(event.target.value) || 0}))} />
                    <p className="text-xs text-muted-foreground">Adds or removes field-assessed labor before pricing. Does not change company defaults.</p>
                  </div>
                  <label className="flex items-center gap-3 rounded-lg border p-4 text-sm font-medium md:col-span-2">
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
                  <QuoteBuilderRecovery settings={settingsQuery} revision={revision} draft={draftRecovery} />
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
                      <Label htmlFor="kitchen-labor-override">Internal Labor Cost Override ($)</Label>
                      <Input id="kitchen-labor-override" type="number" min="0" step="0.01" value={laborOverride} onChange={(event) => setLaborOverride(event.target.value)} placeholder={pricing ? `Calculated: ${pricing.laborCost.toFixed(2)}` : "Optional"} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="kitchen-price-override">Selling Price Override ($)</Label>
                      <Input id="kitchen-price-override" type="number" min="0" step="0.01" value={sellingPriceOverride} onChange={(event) => setSellingPriceOverride(event.target.value)} placeholder={pricing ? `Calculated: ${pricing.calculatedSellingPrice.toFixed(2)}` : "Optional"} />
                    </div>
                  </div>

                  {previewQuote.isError && <p className="text-sm text-destructive">The estimate preview could not be calculated.</p>}
                  <Button className="w-full text-lg font-bold" size="lg" type="submit" disabled={!settingsLoaded || createQuote.isPending || !previewIsCurrent || previewQuote.isError}>
                    {createQuote.isPending ? "Submitting..." : (!settingsLoaded || !previewIsCurrent) ? "Calculating..." : "Generate Kitchen Quote"}
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