import {
  type PanelReplacementInputs,
  type ExistingBreakerCount,
  type ExistingBreakerCountProtectionType,
  useCreateQuote,
  usePreviewQuote,
  useGetSettings,
} from "@workspace/api-client-react"
import { pricingWarningKey, pricingWarningMessage } from "@/lib/pricing-warnings"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Calculator, TriangleAlert, AlertTriangle } from "lucide-react"
import { useEffect, useState } from "react"
import { useLocation } from "wouter"

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"

const initialInputs: PanelReplacementInputs = {
  replacementType: "Like-for-like panel replacement",
  panelManufacturer: "Siemens",
  panelAmperage: 200,
  panelSpaceCount: 40,
  breakerAmperage: 200,
  breakerPoleCount: 2,
  breakerProtectionType: "Standard",
  feederConductor: "4/0 aluminum XHHW conductor",
  feederLength: 10,
  feederConductorQuantity: 3,
  feederRacewayFootage: 10,
  feederRacewayFittingsQuantity: 4,
  groundBarQuantity: 1,
  groundRodQuantity: 0,
  groundingConductorFootage: 0,
  bondingConductorFootage: 0,
  existingBreakers: [],
  existingOtherBreakerQuantity: 0,
  fillerPlateQuantity: 0,
  knockoutSealQuantity: 0,
  plywoodQuantity: 1,
  studsQuantity: 2,
  antiOxidantQuantity: 1,
  electricalTapeQuantity: 1,
  permitAllowance: 0,
  inspectionAllowance: 0,
  miscellaneousAllowance: 0,
  crewSize: 2,
  crewHours: 8,
  panelRemovalLaborHours: 1,
  feederInstallationLaborHours: 1,
  groundingLaborHours: 0,
  accessDifficultyLaborHours: 0,
  generalLaborAdjustmentHours: 0,
  laborRateType: "residential",
  notes: ""
}

const commonBreakers = [
  { amp: 15, pole: 1 },
  { amp: 20, pole: 1 },
  { amp: 20, pole: 2 },
  { amp: 30, pole: 2 },
  { amp: 40, pole: 2 },
  { amp: 50, pole: 2 },
  { amp: 60, pole: 2 },
]

const protectionTypes: ExistingBreakerCountProtectionType[] = ["Standard", "AFCI", "GFCI", "Dual Function"]

function optionalAmount(value: string) {
  if (value.trim() === "") return null
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? amount : null
}

function numberValue(value: string, minimum = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(minimum, parsed) : minimum
}

export function NewPanelReplacementQuote() {
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
    "Provide labor and listed materials to perform a panel replacement, including removal of the existing panel, installation of a new load center, and connection of existing branch circuits with new breakers as required by code. Final layout and routing are subject to field verification."
  )
  const [laborOverride, setLaborOverride] = useState("")
  const [sellingPriceOverride, setSellingPriceOverride] = useState("")
  const [inputs, setInputs] = useState<PanelReplacementInputs>(initialInputs)
  const [existingBreakersState, setExistingBreakersState] = useState<Record<string, number>>({})

  useEffect(() => {
    if (settings && !settingsLoaded) {
      setInputs((current) => ({
        ...current,
        crewSize: settings.serviceUpgradeCrewSize ?? 2,
        crewHours: settings.serviceUpgradeHoursPerPerson ?? 8,
      }))
      setSettingsLoaded(true)
    }
  }, [settings, settingsLoaded])

  const previewPayload = {
    module: "PANEL_REPLACEMENT" as const,
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

  const handleExistingBreakerChange = (amperage: number, poleCount: number, protectionType: ExistingBreakerCountProtectionType, quantityStr: string) => {
    const quantity = numberValue(quantityStr, 0)
    const key = `${amperage}-${poleCount}-${protectionType}`
    const newState = { ...existingBreakersState, [key]: quantity }
    setExistingBreakersState(newState)

    const existingBreakers: ExistingBreakerCount[] = []
    Object.entries(newState).forEach(([k, qty]) => {
      if (qty > 0) {
        const [a, p, prot] = k.split('-')
        existingBreakers.push({
          amperage: Number(a),
          poleCount: Number(p),
          protectionType: prot as ExistingBreakerCountProtectionType,
          quantity: qty,
        })
      }
    })

    setInputs(c => ({ ...c, existingBreakers }))
  }

  const setNumber = (
    key: keyof PanelReplacementInputs,
    value: string,
    minimum = 0,
  ) => {
    setInputs((current) => ({ ...current, [key]: numberValue(value, minimum) }))
  }

  const setPanelAmperage = (panelAmperage: PanelReplacementInputs["panelAmperage"]) => {
    const defaults = {
      100: {
        breakerAmperage: 100,
        feederConductor: "1/0 aluminum XHHW conductor" as const,
      },
      150: {
        breakerAmperage: 150,
        feederConductor: "3/0 aluminum XHHW conductor" as const,
      },
      200: {
        breakerAmperage: 200,
        feederConductor: "4/0 aluminum XHHW conductor" as const,
      },
    }[panelAmperage]
    setInputs((current) => ({ ...current, panelAmperage, ...defaults }))
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
          module: "PANEL_REPLACEMENT",
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
  
  const totalPersonHours = Math.max(
    0,
    inputs.crewSize * inputs.crewHours +
      (inputs.panelRemovalLaborHours || 0) +
      (inputs.feederInstallationLaborHours || 0) +
      (inputs.groundingLaborHours || 0) +
      (inputs.accessDifficultyLaborHours || 0) +
      (inputs.generalLaborAdjustmentHours || 0)
  )

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-24">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New Panel Replacement Quote</h1>
        <p className="mt-1 text-muted-foreground">
          Configure replacement type, panel specs, breakers, feeder, grounding, and labor.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <Card className="border-t-4 border-t-secondary">
              <CardHeader><CardTitle>Project Details</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pr-customer">Customer Name *</Label>
                  <Input id="pr-customer" data-testid="input-customer-name" required value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pr-email">Customer Email</Label>
                  <Input id="pr-email" data-testid="input-customer-email" type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="pr-project">Project Name *</Label>
                  <Input id="pr-project" data-testid="input-project-name" required value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="200A Panel Swap" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="pr-proposal">Customer-facing Proposal Description *</Label>
                  <Textarea id="pr-proposal" data-testid="textarea-proposal" required value={proposalDescription} onChange={(e) => setProposalDescription(e.target.value)} />
                </div>
              </CardContent>
            </Card>

            <Card className="border-t-4 border-t-primary shadow-md">
              <CardHeader className="border-b border-primary/10 bg-primary/5">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="text-primary" size={20} />
                  <CardTitle>Parametric Builder: Panel Replacement</CardTitle>
                </div>
                <CardDescription>
                  Configure the new panel, feeders, breakers, grounding, and related materials.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-8 pt-6">
                
                <section>
                  <h3 className="mb-4 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Panel Specifications</h3>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="pr-type">Replacement Type</Label>
                       <select id="pr-type" data-testid="select-replacement-type" className={selectClassName} value={inputs.replacementType} onChange={(e) => setInputs(c => ({ ...c, replacementType: e.target.value as PanelReplacementInputs["replacementType"] }))}>
                        <option value="Like-for-like panel replacement">Like-for-like panel replacement</option>
                        <option value="Subpanel addition">Subpanel addition</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pr-mfr">Panel Manufacturer</Label>
                       <select id="pr-mfr" data-testid="select-panel-mfr" className={selectClassName} value={inputs.panelManufacturer} onChange={(e) => setInputs(c => ({ ...c, panelManufacturer: e.target.value as PanelReplacementInputs["panelManufacturer"] }))}>
                        <option value="Siemens">Siemens</option>
                        <option value="Eaton">Eaton</option>
                        <option value="Square D">Square D</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pr-amps">Panel Amperage</Label>
                       <select id="pr-amps" data-testid="select-panel-amps" className={selectClassName} value={inputs.panelAmperage} onChange={(e) => setPanelAmperage(Number(e.target.value) as PanelReplacementInputs["panelAmperage"])}>
                        <option value="100">100A</option>
                        <option value="150">150A</option>
                        <option value="200">200A</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pr-spaces">Panel Space Count</Label>
                      <Input id="pr-spaces" data-testid="input-panel-spaces" type="number" min="1" step="1" value={inputs.panelSpaceCount} onChange={(e) => setNumber("panelSpaceCount", e.target.value, 1)} />
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="mb-4 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Main Breaker</h3>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="pr-b-amps">Breaker Amperage</Label>
                      <Input id="pr-b-amps" data-testid="input-breaker-amps" type="number" min="1" step="1" value={inputs.breakerAmperage} onChange={(e) => setNumber("breakerAmperage", e.target.value, 1)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pr-b-poles">Breaker Pole Count</Label>
                      <Input id="pr-b-poles" data-testid="input-breaker-poles" type="number" min="1" step="1" value={inputs.breakerPoleCount} onChange={(e) => setNumber("breakerPoleCount", e.target.value, 1)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pr-b-prot">Breaker Protection</Label>
                       <select id="pr-b-prot" data-testid="select-breaker-prot" className={selectClassName} value={inputs.breakerProtectionType} onChange={(e) => setInputs(c => ({ ...c, breakerProtectionType: e.target.value as PanelReplacementInputs["breakerProtectionType"] }))}>
                        <option value="Standard">Standard</option>
                        <option value="GFCI">GFCI</option>
                        <option value="AFCI">AFCI</option>
                        <option value="Dual Function">Dual Function</option>
                      </select>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="mb-4 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Feeder & Raceway</h3>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="pr-f-cond">Feeder Conductor</Label>
                       <select id="pr-f-cond" data-testid="select-feeder-cond" className={selectClassName} value={inputs.feederConductor} onChange={(e) => setInputs(c => ({ ...c, feederConductor: e.target.value as PanelReplacementInputs["feederConductor"] }))}>
                        <option value="1/0 aluminum XHHW conductor">1/0 aluminum XHHW conductor</option>
                        <option value="3/0 aluminum XHHW conductor">3/0 aluminum XHHW conductor</option>
                        <option value="4/0 aluminum XHHW conductor">4/0 aluminum XHHW conductor</option>
                        <option value="1/0 copper service conductor alternative">1/0 copper service conductor alternative</option>
                        <option value="2/0 copper service conductor alternative">2/0 copper service conductor alternative</option>
                        <option value="Other configured feeder conductor">Other configured feeder conductor</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pr-f-len">Feeder Length (FT)</Label>
                      <Input id="pr-f-len" data-testid="input-feeder-len" type="number" min="0" step="1" value={inputs.feederLength} onChange={(e) => setNumber("feederLength", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pr-f-qty">Feeder Conductor Qty</Label>
                      <Input id="pr-f-qty" data-testid="input-feeder-qty" type="number" min="1" step="1" value={inputs.feederConductorQuantity} onChange={(e) => setNumber("feederConductorQuantity", e.target.value, 1)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pr-rw-ft">Raceway Footage (FT)</Label>
                      <Input id="pr-rw-ft" data-testid="input-rw-ft" type="number" min="0" step="1" value={inputs.feederRacewayFootage} onChange={(e) => setNumber("feederRacewayFootage", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pr-rw-fit">Raceway Fittings Qty</Label>
                      <Input id="pr-rw-fit" data-testid="input-rw-fit" type="number" min="0" step="1" value={inputs.feederRacewayFittingsQuantity} onChange={(e) => setNumber("feederRacewayFittingsQuantity", e.target.value)} />
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="mb-4 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Grounding</h3>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="pr-g-bar">Ground Bar Qty</Label>
                      <Input id="pr-g-bar" data-testid="input-g-bar" type="number" min="0" step="1" value={inputs.groundBarQuantity} onChange={(e) => setNumber("groundBarQuantity", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pr-g-rod">Ground Rod Qty</Label>
                      <Input id="pr-g-rod" data-testid="input-g-rod" type="number" min="0" step="1" value={inputs.groundRodQuantity} onChange={(e) => setNumber("groundRodQuantity", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pr-g-c-ft">Grounding Conductor (FT)</Label>
                      <Input id="pr-g-c-ft" data-testid="input-g-c-ft" type="number" min="0" step="1" value={inputs.groundingConductorFootage} onChange={(e) => setNumber("groundingConductorFootage", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pr-b-c-ft">Bonding Conductor (FT)</Label>
                      <Input id="pr-b-c-ft" data-testid="input-b-c-ft" type="number" min="0" step="1" value={inputs.bondingConductorFootage} onChange={(e) => setNumber("bondingConductorFootage", e.target.value)} />
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="mb-4 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Replacement Breaker Inventory</h3>
                  <div className="overflow-x-auto border rounded-md border-border/50">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 border-b border-border/50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Breaker</th>
                          <th className="px-3 py-2 text-center font-medium">Standard</th>
                          <th className="px-3 py-2 text-center font-medium">AFCI</th>
                          <th className="px-3 py-2 text-center font-medium">GFCI</th>
                          <th className="px-3 py-2 text-center font-medium">Dual Func</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {commonBreakers.map(cb => (
                          <tr key={`${cb.amp}-${cb.pole}`} className="hover:bg-muted/30">
                            <td className="px-3 py-2 whitespace-nowrap font-medium text-muted-foreground">{cb.amp}A {cb.pole}-Pole</td>
                            {protectionTypes.map(pt => (
                              <td key={pt} className="px-3 py-2 text-center">
                                <Input 
                                  type="number" 
                                  min="0" 
                                  data-testid={`input-breaker-${cb.amp}-${cb.pole}-${pt}`}
                                  className="w-16 h-8 text-center mx-auto" 
                                  value={existingBreakersState[`${cb.amp}-${cb.pole}-${pt}`] || ""} 
                                  onChange={(e) => handleExistingBreakerChange(cb.amp, cb.pole, pt, e.target.value)} 
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="space-y-2 mt-5 md:w-1/2">
                    <Label htmlFor="pr-other-b">Other Unlisted Breakers Qty</Label>
                    <Input id="pr-other-b" data-testid="input-other-b" type="number" min="0" step="1" value={inputs.existingOtherBreakerQuantity ?? 0} onChange={(e) => setNumber("existingOtherBreakerQuantity", e.target.value)} />
                  </div>
                </section>

                <section>
                  <h3 className="mb-4 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Supporting Materials</h3>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="pr-filler">Filler Plate Qty</Label>
                      <Input id="pr-filler" data-testid="input-filler-plate" type="number" min="0" step="1" value={inputs.fillerPlateQuantity} onChange={(e) => setNumber("fillerPlateQuantity", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pr-ko-seal">Knockout Seal Qty</Label>
                      <Input id="pr-ko-seal" data-testid="input-ko-seal" type="number" min="0" step="1" value={inputs.knockoutSealQuantity} onChange={(e) => setNumber("knockoutSealQuantity", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pr-plywood">Plywood Backer Qty</Label>
                      <Input id="pr-plywood" data-testid="input-plywood" type="number" min="0" step="1" value={inputs.plywoodQuantity} onChange={(e) => setNumber("plywoodQuantity", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pr-studs">Studs Qty</Label>
                      <Input id="pr-studs" data-testid="input-studs" type="number" min="0" step="1" value={inputs.studsQuantity} onChange={(e) => setNumber("studsQuantity", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pr-anti-ox">Anti-Oxidant Qty</Label>
                      <Input id="pr-anti-ox" data-testid="input-anti-ox" type="number" min="0" step="1" value={inputs.antiOxidantQuantity} onChange={(e) => setNumber("antiOxidantQuantity", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pr-tape">Electrical Tape Qty</Label>
                      <Input id="pr-tape" data-testid="input-tape" type="number" min="0" step="1" value={inputs.electricalTapeQuantity} onChange={(e) => setNumber("electricalTapeQuantity", e.target.value)} />
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="mb-4 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Allowances & Miscellaneous</h3>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="pr-permit">Permit Allowance ($)</Label>
                      <Input id="pr-permit" data-testid="input-permit" type="number" min="0" step="1" value={inputs.permitAllowance} onChange={(e) => setNumber("permitAllowance", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pr-inspect">Inspection Allowance ($)</Label>
                      <Input id="pr-inspect" data-testid="input-inspect" type="number" min="0" step="1" value={inputs.inspectionAllowance} onChange={(e) => setNumber("inspectionAllowance", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pr-misc">Misc Allowance ($)</Label>
                      <Input id="pr-misc" data-testid="input-misc" type="number" min="0" step="1" value={inputs.miscellaneousAllowance} onChange={(e) => setNumber("miscellaneousAllowance", e.target.value)} />
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="mb-4 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Labor Details</h3>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="pr-crew-sz">Baseline Crew Size</Label>
                      <Input id="pr-crew-sz" data-testid="input-crew-sz" type="number" min="1" step="1" value={inputs.crewSize} onChange={(e) => setNumber("crewSize", e.target.value, 1)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pr-crew-hr">Baseline Hours (Per Person)</Label>
                      <Input id="pr-crew-hr" data-testid="input-crew-hr" type="number" min="0" step="0.5" value={inputs.crewHours} onChange={(e) => setNumber("crewHours", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pr-l-removal">Panel Removal Adj. Hours</Label>
                      <Input id="pr-l-removal" data-testid="input-l-removal" type="number" min="0" step="0.5" value={inputs.panelRemovalLaborHours ?? 0} onChange={(e) => setNumber("panelRemovalLaborHours", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pr-l-feeder">Feeder Install Adj. Hours</Label>
                      <Input id="pr-l-feeder" data-testid="input-l-feeder" type="number" min="0" step="0.5" value={inputs.feederInstallationLaborHours ?? 0} onChange={(e) => setNumber("feederInstallationLaborHours", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pr-l-ground">Grounding Adj. Hours</Label>
                      <Input id="pr-l-ground" data-testid="input-l-ground" type="number" min="0" step="0.5" value={inputs.groundingLaborHours ?? 0} onChange={(e) => setNumber("groundingLaborHours", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pr-l-access">Access Difficulty Adj. Hours</Label>
                      <Input id="pr-l-access" data-testid="input-l-access" type="number" min="0" step="0.5" value={inputs.accessDifficultyLaborHours ?? 0} onChange={(e) => setNumber("accessDifficultyLaborHours", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pr-l-gen">General Labor Adj. Hours</Label>
                      <Input id="pr-l-gen" data-testid="input-l-gen" type="number" min="0" step="0.5" value={inputs.generalLaborAdjustmentHours ?? 0} onChange={(e) => setNumber("generalLaborAdjustmentHours", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pr-l-rate">Labor Rate Type</Label>
                       <select id="pr-l-rate" data-testid="select-l-rate" className={selectClassName} value={inputs.laborRateType} onChange={(e) => setInputs(c => ({ ...c, laborRateType: e.target.value as PanelReplacementInputs["laborRateType"] }))}>
                        <option value="residential">Residential</option>
                        <option value="commercial">Commercial</option>
                      </select>
                    </div>
                  </div>
                </section>

                <section className="col-span-full">
                  <div className="space-y-2">
                    <Label htmlFor="pr-notes">Internal Notes (Not shown to customer)</Label>
                    <Textarea id="pr-notes" data-testid="textarea-notes" value={inputs.notes} onChange={(e) => setInputs(c => ({ ...c, notes: e.target.value }))} className="min-h-[100px]" />
                  </div>
                </section>
                
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            {pricing && previewIsCurrent && pricing.pricingWarnings.length > 0 && (
              <Card className="border-amber-300 bg-amber-50 text-amber-950 shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <TriangleAlert size={20} />
                    <CardTitle className="text-lg">Pricing needs confirmation</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul data-testid="list-pricing-warnings" className="max-h-72 space-y-1 overflow-y-auto pl-5 pr-2 text-sm list-disc">
                    {pricing.pricingWarnings.map((warning, index) => (
                      <li key={pricingWarningKey(warning, index)}>
                        {pricingWarningMessage(warning)}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <Card className="sticky top-6 border-t-4 border-t-emerald-500 shadow-md">
              <CardHeader className="border-b border-border/50 pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calculator className="text-emerald-600" size={20} />
                    <CardTitle>Live Preview</CardTitle>
                  </div>
                  {!previewIsCurrent && (
                    <span className="text-xs text-muted-foreground animate-pulse">Calculating...</span>
                  )}
                </div>
                <CardDescription>
                  Material and labor breakdown based on the parametric assembly.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span>Assembly Items</span>
                    <span className="font-mono text-foreground font-medium">{assembly.length}</span>
                  </div>
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span>Total Person-Hours</span>
                    <span className="font-mono text-foreground font-medium">{totalPersonHours.toFixed(1)} hrs</span>
                  </div>
                </div>

                {previewIsCurrent && assembly.length > 0 && (
                  <div className="border-t border-border/50 pt-4">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Generated Assembly
                    </div>
                    <ul data-testid="list-generated-assembly" className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border/50 p-2 text-xs">
                      {assembly.map((item) => (
                        <li key={item.id} data-testid={`row-assembly-${item.id}`} className="flex justify-between gap-3 border-b border-border/40 pb-1 last:border-0 last:pb-0">
                          <span className="truncate">{item.description}</span>
                          <span className="shrink-0 font-mono text-muted-foreground">{item.quantity} {item.unit}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {pricing && previewIsCurrent && (
                  <div className="space-y-3 border-t border-border/50 pt-4">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Material Cost</span>
                      <span className="font-mono font-medium">${pricing.materialCost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Labor Cost</span>
                      <span className="font-mono font-medium">${pricing.laborCost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm font-bold mt-2 pt-2 border-t border-border/50">
                      <span>Total Cost</span>
                      <span className="font-mono">${(pricing.materialCost + pricing.laborCost).toFixed(2)}</span>
                    </div>
                  </div>
                )}

                <div className="space-y-4 border-t border-border/50 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="pr-labor-override">Labor Price Override ($)</Label>
                    <Input 
                      id="pr-labor-override" 
                      data-testid="input-labor-override"
                      type="number" 
                      min="0" step="0.01" 
                       placeholder={pricing && previewIsCurrent ? `Calc: $${pricing.laborCost.toFixed(2)}` : "Auto-calculated"}
                      value={laborOverride}
                      onChange={(e) => setLaborOverride(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pr-sell-override">Final Sell Price Override ($)</Label>
                    <Input 
                      id="pr-sell-override" 
                      data-testid="input-sell-override"
                      type="number" 
                      min="0" step="0.01" 
                       placeholder={pricing && previewIsCurrent ? `Calc: $${pricing.calculatedSellingPrice.toFixed(2)}` : "Auto-calculated"}
                      value={sellingPriceOverride}
                      onChange={(e) => setSellingPriceOverride(e.target.value)}
                    />
                  </div>
                </div>

                <div className="rounded-lg bg-emerald-500/10 p-4 border border-emerald-500/20">
                  <div className="text-xs font-bold uppercase tracking-wider text-emerald-600 mb-1">
                    Effective Selling Price
                  </div>
                  <div data-testid="text-effective-selling-price" className="text-3xl font-bold font-mono tracking-tight text-emerald-700">
                     ${pricing && previewIsCurrent ? pricing.finalSellingPrice.toFixed(2) : "0.00"}
                  </div>
                   {pricing && previewIsCurrent && (
                    <div className="mt-2 flex gap-3 text-[10px] uppercase tracking-wider font-medium text-emerald-600/70">
                      <span data-testid="text-gp">GP: ${pricing.grossProfit.toFixed(0)}</span>
                      <span>•</span>
                      <span data-testid="text-margin">Mgn: {(pricing.grossMargin * 100).toFixed(1)}%</span>
                    </div>
                  )}
                </div>

                <Button 
                  type="submit" 
                  data-testid="button-submit-quote"
                  className="w-full h-12 text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground" 
                   disabled={createQuote.isPending || !settingsLoaded || !previewIsCurrent || !customerName || !projectName}
                >
                  {createQuote.isPending ? "Generating Quote..." : "Generate Quote"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  )
}
