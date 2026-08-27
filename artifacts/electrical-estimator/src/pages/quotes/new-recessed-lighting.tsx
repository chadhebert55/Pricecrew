import {
  type RecessedLightingInputs,
  useCreateQuote,
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
import { Calculator, Info, Lightbulb, Ruler, TriangleAlert } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useLocation } from "wouter"

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"

const initialInputs: RecessedLightingInputs = {
  roomLength: 16,
  roomWidth: 12,
  fixtureQuantity: 4,
  fixtureSize: "4-inch",
  wiringOption: "New wiring from source",
  circuitOption: "Reuse existing circuit",
  switchType: "Single-pole",
  switchingMethod: "single-pole",
  traditionalThreeWayFootage: 40,
  dimmerSelection: "Include dimmer",
  customerSuppliedFixtures: false,
  ceilingHeight: "Standard 8-10 ft",
  accessDifficulty: "Attic access",
  laborAdjustmentHours: 0,
  wireRunLength: 40,
  wiringAllowanceFeet: 10,
  additionalSwitches: 0,
  additionalLights: 0,
  notes: "",
  laborRateType: "residential",
  panelManufacturer: "Siemens",
  breakerAmperage: 20,
  breakerPoleCount: 1,
  breakerProtectionType: "Standard",
  cableType: "12/2 NM-B",
}

type SwitchingMethod = NonNullable<RecessedLightingInputs["switchingMethod"]>

function proposalDescriptionFor(method: SwitchingMethod) {
  const switchingScope =
    method === "traditional-3-way"
      ? "traditional 3-way switching with contractor-entered 14/3 NM-B between the switches"
      : method === "smart-3-way"
        ? "a smart dimmer 3-way kit with a wireless companion"
        : "standard single-pole switching"
  return `Provide labor and listed materials to install recessed lighting at the agreed locations, including fixture installation, wiring, ${switchingScope}, testing, and final trim. Final fixture spacing, ceiling conditions, circuit capacity, protection requirements, switching compatibility, and concealed obstructions will be verified before work begins.`
}

function optionalAmount(value: string) {
  if (value.trim() === "") return null
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? amount : null
}

function numberValue(value: string, minimum = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(minimum, parsed) : minimum
}

export function NewRecessedLightingQuote() {
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
    proposalDescriptionFor("single-pole"),
  )
  const [laborOverride, setLaborOverride] = useState("")
  const [sellingPriceOverride, setSellingPriceOverride] = useState("")
  const [inputs, setInputs] = useState<RecessedLightingInputs>(initialInputs)

  useEffect(() => {
    if (settings && !settingsLoaded) {
      setInputs((current) => ({
        ...current,
        laborAdjustmentHours: settings.recessedLightingLaborAdjustmentHours ?? 0,
      }))
      setSettingsLoaded(true)
    }
  }, [settings, settingsLoaded])

  const planning = useMemo(() => {
    if (inputs.roomLength <= 0 || inputs.roomWidth <= 0) {
      return { count: 0, spacingLength: 0, spacingWidth: 0 }
    }
    const columns = Math.max(1, Math.ceil(inputs.roomLength / 8))
    const rows = Math.max(1, Math.ceil(inputs.roomWidth / 8))
    return {
      count: columns * rows,
      spacingLength: inputs.roomLength / columns,
      spacingWidth: inputs.roomWidth / rows,
    }
  }, [inputs.roomLength, inputs.roomWidth])

  const previewPayload = {
    module: "RECESSED_LIGHTING" as const,
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
    key: keyof RecessedLightingInputs,
    value: string,
    minimum = 0,
  ) => {
    setInputs((current) => ({ ...current, [key]: numberValue(value, minimum) }))
  }

  const handleSwitchingMethod = (switchingMethod: SwitchingMethod) => {
    setInputs((current) => ({
      ...current,
      switchType: switchingMethod === "single-pole" ? "Single-pole" : "3-way",
      switchingMethod,
      dimmerSelection:
        switchingMethod === "smart-3-way"
          ? "No dimmer"
          : current.dimmerSelection,
      cableType:
        switchingMethod === "traditional-3-way"
          ? "14/3 NM-B"
          : current.breakerAmperage <= 15
            ? "14/2 NM-B"
            : "12/2 NM-B",
    }))
    setProposalDescription((currentDescription) => {
      const currentMethod = inputs.switchingMethod ?? "single-pole"
      return currentDescription === proposalDescriptionFor(currentMethod)
        ? proposalDescriptionFor(switchingMethod)
        : currentDescription
    })
  }

  const handleBreakerAmperage = (value: string) => {
    const breakerAmperage: RecessedLightingInputs["breakerAmperage"] =
      value === "15" ? 15 : 20
    setInputs((current) => ({
      ...current,
      breakerAmperage,
      cableType:
        current.switchingMethod === "traditional-3-way"
          ? "14/3 NM-B"
          : breakerAmperage <= 15
            ? "14/2 NM-B"
            : "12/2 NM-B",
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
  const assembly = previewQuote.data?.assembly ?? []
  const fixtureCountIsSuggested = inputs.fixtureQuantity === planning.count
  const isNewWiring = inputs.wiringOption === "New wiring from source"
  const isNewCircuit = inputs.circuitOption === "New dedicated circuit"
  const switchingMethod = inputs.switchingMethod ?? (
    inputs.switchType === "3-way" ? "traditional-3-way" : "single-pole"
  )
  const isTraditionalThreeWay = switchingMethod === "traditional-3-way"
  const isSmartThreeWay = switchingMethod === "smart-3-way"

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-24">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New Recessed Lighting Quote</h1>
        <p className="mt-1 text-muted-foreground">
          Room planning, verified fixture pricing, field risk, and exact circuit protection.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <Card className="border-t-4 border-t-secondary">
              <CardHeader><CardTitle>Project Details</CardTitle></CardHeader>
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
                <CardDescription>
                  Configure the room plan, fixture product, wiring, controls, circuit, and labor conditions.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-8 pt-6">
                <section>
                  <h3 className="mb-4 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Room planning guidance</h3>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="recessed-length">Room Length (FT)</Label>
                      <Input id="recessed-length" type="number" min="0" step="0.5" value={inputs.roomLength} onChange={(event) => setNumber("roomLength", event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="recessed-width">Room Width (FT)</Label>
                      <Input id="recessed-width" type="number" min="0" step="0.5" value={inputs.roomWidth} onChange={(event) => setNumber("roomWidth", event.target.value)} />
                    </div>
                  </div>
                  <div className="mt-4 rounded-lg border border-primary/25 bg-primary/5 p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        <Ruler className="mt-0.5 shrink-0 text-primary" size={20} />
                        <div>
                          <p className="font-semibold">Planning-only suggestion</p>
                          {planning.count > 0 ? (
                            <p className="mt-1 text-sm text-muted-foreground">
                              {planning.count} fixtures on an approximately {planning.spacingLength.toFixed(1)} ft × {planning.spacingWidth.toFixed(1)} ft grid. This is not a photometric or code-compliance design.
                            </p>
                          ) : (
                            <p className="mt-1 text-sm text-muted-foreground">Enter both room dimensions to calculate guidance.</p>
                          )}
                        </div>
                      </div>
                      <Button type="button" variant="outline" disabled={planning.count === 0 || fixtureCountIsSuggested} onClick={() => setInputs((current) => ({ ...current, fixtureQuantity: planning.count }))}>
                        {fixtureCountIsSuggested ? "Suggestion applied" : "Use suggestion"}
                      </Button>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="mb-4 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Fixtures and quantity</h3>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="recessed-quantity">Quoted Fixture Quantity</Label>
                      <Input id="recessed-quantity" type="number" min="1" step="1" value={inputs.fixtureQuantity} onChange={(event) => setNumber("fixtureQuantity", event.target.value, 1)} />
                      <p className="text-xs text-muted-foreground">{fixtureCountIsSuggested ? "Matches planning guidance." : "Manual quantity override is active."}</p>
                    </div>
                    <div className="space-y-2">
                       <Label htmlFor="recessed-size">Recessed light</Label>
                      <select id="recessed-size" className={selectClassName} value={inputs.fixtureSize} onChange={(event) => setInputs((current) => ({ ...current, fixtureSize: event.target.value as RecessedLightingInputs["fixtureSize"] }))}>
                         <option value="4-inch">4-inch regressed wafer light</option>
                         <option value="6-inch">6-inch regressed wafer light</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="recessed-additional-lights">Additional Light Locations</Label>
                      <Input id="recessed-additional-lights" type="number" min="0" step="1" value={inputs.additionalLights} onChange={(event) => setNumber("additionalLights", event.target.value)} />
                    </div>
                    <label className="flex items-center gap-3 rounded-lg border p-4 text-sm font-medium">
                      <Checkbox checked={inputs.customerSuppliedFixtures} onCheckedChange={(checked) => setInputs((current) => ({ ...current, customerSuppliedFixtures: checked === true }))} />
                      Customer supplies recessed fixtures
                    </label>
                  </div>
                </section>

                <section>
                  <h3 className="mb-4 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Wiring and controls</h3>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="recessed-wiring-option">Wiring Scope</Label>
                      <select id="recessed-wiring-option" className={selectClassName} value={inputs.wiringOption} onChange={(event) => setInputs((current) => ({ ...current, wiringOption: event.target.value as RecessedLightingInputs["wiringOption"] }))}>
                        <option value="Existing switch leg / lighting box">Existing switch leg / lighting box</option>
                        <option value="New wiring from source">New wiring from source</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="recessed-switch-type">Switching Method</Label>
                      <select id="recessed-switch-type" className={selectClassName} value={switchingMethod} onChange={(event) => handleSwitchingMethod(event.target.value as SwitchingMethod)}>
                        <option value="single-pole">Standard single-pole</option>
                        <option value="traditional-3-way">Traditional 3-way (wired)</option>
                        <option value="smart-3-way">Smart switch + wireless companion</option>
                      </select>
                      <p className="text-xs text-muted-foreground">
                        {isSmartThreeWay
                           ? "Includes one smart dimmer 3-way kit with a wireless companion."
                          : isTraditionalThreeWay
                            ? "Uses contractor-entered 14/3 NM-B footage between the two traditional 3-way switches."
                            : "One standard switch control for the recessed lighting group."}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="recessed-dimmer">Dimmer</Label>
                      <select id="recessed-dimmer" className={selectClassName} value={inputs.dimmerSelection} disabled={isSmartThreeWay} onChange={(event) => setInputs((current) => ({ ...current, dimmerSelection: event.target.value as RecessedLightingInputs["dimmerSelection"] }))}>
                        <option value="No dimmer">No dimmer</option>
                        <option value="Include dimmer">Include dimmer</option>
                      </select>
                      {isSmartThreeWay && <p className="text-xs text-muted-foreground">The smart combo pack includes the dimming control.</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="recessed-additional-switches">Additional Switches</Label>
                      <Input id="recessed-additional-switches" type="number" min="0" step="1" value={inputs.additionalSwitches} onChange={(event) => setNumber("additionalSwitches", event.target.value)} />
                    </div>
                    {isNewWiring && (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="recessed-cable">Selected Cable</Label>
                          <select id="recessed-cable" className={selectClassName} value={inputs.cableType} onChange={(event) => setInputs((current) => ({ ...current, cableType: event.target.value as RecessedLightingInputs["cableType"] }))}>
                            {isTraditionalThreeWay ? (
                              <option value="14/3 NM-B">14/3 NM-B — 15A 3-way circuits only</option>
                            ) : inputs.breakerAmperage > 15 ? (
                              <option value="12/2 NM-B">12/2 NM-B — selected 20A circuit</option>
                            ) : (
                              <>
                                <option value="14/2 NM-B">14/2 NM-B</option>
                                <option value="12/2 NM-B">12/2 NM-B</option>
                              </>
                            )}
                          </select>
                          {isTraditionalThreeWay && isNewCircuit && inputs.breakerAmperage > 15 && (
                            <p className="text-xs text-amber-700">No verified 12/3 row is available. This cable remains unresolved until the circuit is 15A or a sourced 12/3 item is added.</p>
                          )}
                        </div>
                        {isTraditionalThreeWay ? (
                          <div className="space-y-2">
                            <Label htmlFor="recessed-traditional-3-way-footage">Traditional 3-way 14/3 NM-B Footage (FT)</Label>
                            <Input id="recessed-traditional-3-way-footage" type="number" min="0" step="1" value={inputs.traditionalThreeWayFootage ?? 0} onChange={(event) => setNumber("traditionalThreeWayFootage", event.target.value)} />
                            <p className="text-xs text-muted-foreground">The estimate uses this entered footage plus the additional wiring allowance below; there is no hidden fixed 3-way footage.</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <Label htmlFor="recessed-wire-run">Approximate Wire Run (FT)</Label>
                            <Input id="recessed-wire-run" type="number" min="0" step="1" value={inputs.wireRunLength} onChange={(event) => setNumber("wireRunLength", event.target.value)} />
                          </div>
                        )}
                        <div className="space-y-2">
                          <Label htmlFor="recessed-wire-allowance">Additional Wiring Allowance (FT)</Label>
                          <Input id="recessed-wire-allowance" type="number" min="0" step="1" value={inputs.wiringAllowanceFeet} onChange={(event) => setNumber("wiringAllowanceFeet", event.target.value)} />
                        </div>
                      </>
                    )}
                  </div>
                </section>

                <section>
                  <h3 className="mb-4 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Circuit and field conditions</h3>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="recessed-circuit">Circuit Scope</Label>
                      <select id="recessed-circuit" className={selectClassName} value={inputs.circuitOption} onChange={(event) => setInputs((current) => ({ ...current, circuitOption: event.target.value as RecessedLightingInputs["circuitOption"] }))}>
                        <option value="Reuse existing circuit">Reuse existing circuit</option>
                        <option value="New dedicated circuit">New dedicated circuit</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="recessed-labor-rate">Labor Sell Rate</Label>
                      <select id="recessed-labor-rate" className={selectClassName} value={inputs.laborRateType ?? "residential"} onChange={(event) => setInputs((current) => ({ ...current, laborRateType: event.target.value as RecessedLightingInputs["laborRateType"] }))}>
                        <option value="residential">Residential</option>
                        <option value="commercial">Commercial</option>
                      </select>
                    </div>
                    {isNewCircuit && (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="recessed-panel">Panel Manufacturer</Label>
                          <select id="recessed-panel" className={selectClassName} value={inputs.panelManufacturer} onChange={(event) => setInputs((current) => ({ ...current, panelManufacturer: event.target.value }))}>
                            <option value="Siemens">Siemens / ITE</option>
                            <option value="Eaton">Eaton BR</option>
                            <option value="Square D">Square D Homeline</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="recessed-breaker-protection">Breaker Protection</Label>
                          <select id="recessed-breaker-protection" className={selectClassName} value={inputs.breakerProtectionType} onChange={(event) => setInputs((current) => ({ ...current, breakerProtectionType: event.target.value }))}>
                            <option value="Standard">Standard</option>
                            <option value="AFCI">AFCI</option>
                            <option value="GFCI">GFCI</option>
                            <option value="Dual Function">Dual Function</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="recessed-breaker-amps">Breaker Amperage</Label>
                          <select id="recessed-breaker-amps" className={selectClassName} value={inputs.breakerAmperage} onChange={(event) => handleBreakerAmperage(event.target.value)}>
                            <option value="15">15A</option>
                            <option value="20">20A</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="recessed-breaker-poles">Breaker Pole Count</Label>
                          <select id="recessed-breaker-poles" className={selectClassName} value={inputs.breakerPoleCount} onChange={(event) => setNumber("breakerPoleCount", event.target.value, 1)}>
                            <option value="1">1-pole</option>
                            <option value="2">2-pole</option>
                          </select>
                        </div>
                      </>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="recessed-ceiling">Ceiling Height</Label>
                      <select id="recessed-ceiling" className={selectClassName} value={inputs.ceilingHeight} onChange={(event) => setInputs((current) => ({ ...current, ceilingHeight: event.target.value as RecessedLightingInputs["ceilingHeight"] }))}>
                        <option value="Standard 8-10 ft">Standard 8-10 ft</option>
                        <option value="High 11-14 ft">High 11-14 ft</option>
                        <option value="Vaulted 15+ ft">Vaulted 15+ ft</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="recessed-access">Ceiling Access</Label>
                      <select id="recessed-access" className={selectClassName} value={inputs.accessDifficulty} onChange={(event) => setInputs((current) => ({ ...current, accessDifficulty: event.target.value as RecessedLightingInputs["accessDifficulty"] }))}>
                        <option value="Attic access">Attic access</option>
                        <option value="Limited / blind access">Limited / blind access</option>
                        <option value="Open ceiling">Open ceiling</option>
                        <option value="Difficult access">Difficult access</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="recessed-labor-adjustment">Labor Adjustment (Hours)</Label>
                      <Input id="recessed-labor-adjustment" type="number" min="-10" step="0.25" value={inputs.laborAdjustmentHours} onChange={(event) => setInputs((current) => ({ ...current, laborAdjustmentHours: Number(event.target.value) || 0 }))} />
                      <p className="text-xs text-muted-foreground">Adds or removes field-assessed labor before pricing. Does not change company defaults.</p>
                    </div>
                  </div>
                </section>

                <div className="space-y-2">
                  <Label htmlFor="recessed-notes">Estimator Notes (Internal)</Label>
                  <Textarea id="recessed-notes" value={inputs.notes} onChange={(event) => setInputs((current) => ({ ...current, notes: event.target.value }))} />
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
                  <CardDescription className="text-secondary-foreground/70">Uses the same server calculation path as the saved immutable quote snapshot.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5 pt-6">
                  <div className="flex items-start gap-3 rounded-md border border-primary/20 bg-primary/10 p-3 text-sm">
                    <Info className="mt-0.5 shrink-0 text-primary" size={16} />
                    <p className="text-secondary-foreground/80">Room spacing is planning guidance. Catalog materials, internal labor, customer labor, selling price, and overrides remain separate.</p>
                  </div>

                  {pricing && previewIsCurrent ? (
                    <>
                      {pricing.pricingWarnings.length > 0 && (
                        <div className="max-h-64 overflow-auto rounded-md border border-amber-400/40 bg-amber-400/10 p-3">
                          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-300">
                            <TriangleAlert size={16} /> Estimate needs confirmation
                          </div>
                          <ul className="list-disc space-y-1 pl-5 text-xs text-secondary-foreground/80">
                            {pricing.pricingWarnings.map((warning, index) => (
                              <li key={pricingWarningKey(warning, index)}>
                                {pricingWarningMessage(warning)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between"><span>Material Cost</span><span className="font-mono">${pricing.materialCost.toFixed(2)}</span></div>
                        <div className="flex justify-between"><span>Loaded Internal Labor Cost</span><span className="font-mono">${pricing.laborCost.toFixed(2)}</span></div>
                        {pricing.laborSellAmount !== undefined && <div className="flex justify-between gap-4"><span>Customer Labor ({pricing.laborRateType} @ ${pricing.laborSellRate?.toFixed(2)}/hr)</span><span className="font-mono">${pricing.laborSellAmount.toFixed(2)}</span></div>}
                        <div className="flex justify-between"><span>Calculated Sell Price</span><span className="font-mono">${pricing.calculatedSellingPrice.toFixed(2)}</span></div>
                        <div className="flex justify-between border-t border-secondary-border pt-2 font-bold"><span>Final Selling Price</span><span className="font-mono text-primary">${pricing.finalSellingPrice.toFixed(2)}</span></div>
                        <div className="flex justify-between text-secondary-foreground/70"><span>Internal Margin</span><span className="font-mono">{(pricing.grossMargin * 100).toFixed(1)}%</span></div>
                      </div>
                      <div className="space-y-2 border-t border-secondary-border pt-4">
                        <p className="text-xs font-bold uppercase tracking-wider text-secondary-foreground/60">Priced assembly</p>
                        {assembly.slice(0, 5).map((line) => (
                          <div key={line.id} className="flex justify-between gap-3 text-xs">
                            <span className="text-secondary-foreground/75">{contractorMaterialName(line.description)}</span>
                            <span className="shrink-0 font-mono">${line.extendedCost.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
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
                  <Button className="w-full text-lg font-bold" size="lg" type="submit" disabled={!settingsLoaded || createQuote.isPending || !previewIsCurrent || previewQuote.isError}>
                    {createQuote.isPending ? "Submitting..." : (!settingsLoaded || !previewIsCurrent) ? "Calculating..." : "Generate Recessed Lighting Quote"}
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