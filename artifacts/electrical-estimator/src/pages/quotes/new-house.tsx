import {
  type NewHouseInputs,
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
import { Calculator, Info, TriangleAlert, Home, Zap, Ruler, Clock } from "lucide-react"
import { useEffect, useState } from "react"
import { useLocation } from "wouter"
import { CustomerPicker } from "@/components/customer-picker"
import { useQuoteCreateMutation } from "@/hooks/use-quote-create-mutation"
import { useQuoteRevisionPrefill } from "@/hooks/use-quote-revision-prefill"
import { PlanTakeoffReview } from "@/components/plan-takeoff-review"

const initialInputs: NewHouseInputs = {
  finishedSquareFootage: 2000,
  floorCount: 2,
  garageSquareFootage: 400,
  basementSquareFootage: 0,
  basementFinished: false,
  outletQuantity: 40,
  switchQuantity: 20,
  dimmerQuantity: 5,
  recessedLightQuantity: 10,
  recessedLightSize: "4-inch",
  fanQuantity: 2,
  fanSupply: "Customer supplied",
  panelManufacturer: "Siemens",
  smokeCoQuantity: 5,
  bedroomCount: 3,
  bathroomQuantity: 2,
  kitchenApplianceCircuitQuantity: 5,
  laundryCircuitQuantity: 2,
  exteriorReceptacleQuantity: 3,
  exteriorLightingQuantity: 4,
  garageReceptacleQuantity: 2,
  garageCircuitQuantity: 1,
  servicePanelAllowance: 0,
  hvacEquipmentCircuitQuantity: 1,
  miniSplitCircuitQuantity: 0,
  commonBranchCircuitQuantity: 10,
  branchCircuitFootage: 60,
  branchCircuitAmperage: 15,
  branchCircuitPoleCount: 1,
  branchCircuitProtectionType: "Dual Function",
  branchCircuitCableType: "14/2 NM-B",
  equipmentCircuitFootage: 60,
  equipmentCircuitAmperage: 30,
  equipmentCircuitPoleCount: 2,
  equipmentCircuitProtectionType: "Standard",
  equipmentCircuitCableType: "10/3 NM-B",
  crewSize: 2,
  crewHours: 80,
  laborAdjustmentHours: 0,
  laborRateType: "residential",
  notes: "",
}

function optionalAmount(value: string) {
  if (value.trim() === "") return null
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? amount : null
}

export function NewHouseQuote() {
  const [, setLocation] = useLocation()
  const createQuote = useQuoteCreateMutation()
  const previewQuote = usePreviewQuote()
  const { data: settings } = useGetSettings()
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  
  const [previewedInputKey, setPreviewedInputKey] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [customerEmail, setCustomerEmail] = useState("")
  const [customerId, setCustomerId] = useState<number | undefined>()
  const [projectName, setProjectName] = useState("")
  const [proposalDescription, setProposalDescription] = useState(
    "Provide labor and listed materials to wire the new home according to the provided floor plans and electrical code requirements. Includes standard device trim, requested lighting, dedicated appliance circuits, and final testing. Temporary power, trenching, and utility fees are excluded unless explicitly noted.",
  )
  const [laborOverride, setLaborOverride] = useState("")
  const [sellingPriceOverride, setSellingPriceOverride] = useState("")
  const [inputs, setInputs] = useState<NewHouseInputs>(initialInputs)
  const [takeoffId, setTakeoffId] = useState<number | undefined>()
  const revision = useQuoteRevisionPrefill("NEW_HOUSE", {
    setCustomerName,
    setCustomerEmail,
    setCustomerId,
    setProjectName,
    setProposalDescription,
    setInputs: (value: NewHouseInputs) =>
      setInputs({ ...value, bedroomCount: value.bedroomCount ?? 0 }),
    setSettingsLoaded,
  })

  useEffect(() => {
    if (settings && !settingsLoaded && !revision.isRevision) {
      setInputs((current) => ({
        ...current,
        crewSize: settings.newHouseCrewSize ?? 2,
        crewHours: settings.newHouseHoursPerPerson ?? 80,
        laborAdjustmentHours: settings.newHouseLaborAdjustmentHours ?? 0,
      }))
      setSettingsLoaded(true)
    }
  }, [settings, settingsLoaded])

  const previewPayload = {
    module: "NEW_HOUSE" as const,
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

  const setQuantity = (key: keyof NewHouseInputs, value: string) => {
    setInputs((current) => ({
      ...current,
      [key]: Math.max(0, Number.parseInt(value, 10) || 0),
    }))
  }

  const setNumber = (key: keyof NewHouseInputs, value: string) => {
    setInputs((current) => ({
      ...current,
      [key]: Math.max(0, Number(value) || 0),
    }))
  }

  const setEquipmentCircuitAmperage = (value: string) => {
    const amperage = Number(value) as NewHouseInputs["equipmentCircuitAmperage"]
    const cableType = amperage === 20
      ? "12/2 NM-B"
      : amperage === 30
        ? "10/3 NM-B"
        : "8/3 NM-B"
    setInputs((current) => ({
      ...current,
      equipmentCircuitAmperage: amperage,
      equipmentCircuitCableType: cableType,
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
          module: "NEW_HOUSE",
          jobInputs: inputs,
          proposalDescription,
          laborOverride: optionalAmount(laborOverride),
          sellingPriceOverride: optionalAmount(sellingPriceOverride),
          takeoffId,
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
        <h1 className="text-3xl font-bold tracking-tight">New House Quote</h1>
        <p className="mt-1 text-muted-foreground">Comprehensive Parametric Whole-Home Estimator</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <Card className="border-t-4 border-t-secondary">
              <CardHeader><CardTitle>Project Details</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <CustomerPicker idPrefix="nh" customerId={customerId} customerName={customerName} customerEmail={customerEmail} onCustomerIdChange={setCustomerId} onCustomerNameChange={setCustomerName} onCustomerEmailChange={setCustomerEmail} />
                <div className="space-y-2">
                  <Label htmlFor="nh-customer">Customer Name *</Label>
                  <Input id="nh-customer" required value={customerName} onChange={(event) => { setCustomerId(undefined); setCustomerName(event.target.value) }} data-testid="input-nh-customer" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nh-email">Customer Email</Label>
                  <Input id="nh-email" type="email" value={customerEmail} onChange={(event) => { setCustomerId(undefined); setCustomerEmail(event.target.value) }} data-testid="input-nh-email" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="nh-project">Project Name *</Label>
                  <Input id="nh-project" required value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="New 3BR House - Lot 42" data-testid="input-nh-project" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="nh-proposal">Customer-facing Proposal Description *</Label>
                  <Textarea id="nh-proposal" required value={proposalDescription} onChange={(event) => setProposalDescription(event.target.value)} data-testid="input-nh-proposal" />
                </div>
              </CardContent>
            </Card>

            <PlanTakeoffReview
              module="NEW_HOUSE"
              baseInputs={inputs as unknown as Record<string, unknown>}
              onTakeoffApplied={(reviewedInputs, reviewedTakeoffId) => {
                setInputs((current) => ({
                  ...current,
                  ...reviewedInputs,
                } as NewHouseInputs))
                setTakeoffId(reviewedTakeoffId)
              }}
            />

            <Card className="border-t-4 border-t-primary shadow-md">
              <CardHeader className="border-b border-primary/10 bg-primary/5">
                <div className="flex items-center gap-2">
                  <Home className="text-primary" size={20} />
                  <CardTitle>Parametric Builder: New House</CardTitle>
                </div>
                <CardDescription>Configure dimensions, devices, specialized circuits, wiring parameters, and labor allowances.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-10 pt-6">
                
                <section>
                  <div className="mb-4 flex items-center gap-2 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                    <Ruler size={16} /> Property Dimensions
                  </div>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="nh-finished-sqft">Finished Sq Ft</Label>
                      <Input id="nh-finished-sqft" type="number" min="1" value={inputs.finishedSquareFootage} onChange={(event) => setQuantity("finishedSquareFootage", event.target.value)} data-testid="input-nh-finished-sqft" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nh-floor-count">Floor Count</Label>
                      <Input id="nh-floor-count" type="number" min="1" value={inputs.floorCount} onChange={(event) => setQuantity("floorCount", event.target.value)} data-testid="input-nh-floor-count" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nh-garage-sqft">Garage Sq Ft</Label>
                      <Input id="nh-garage-sqft" type="number" min="0" value={inputs.garageSquareFootage} onChange={(event) => setQuantity("garageSquareFootage", event.target.value)} data-testid="input-nh-garage-sqft" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nh-basement-sqft">Basement Sq Ft</Label>
                      <Input id="nh-basement-sqft" type="number" min="0" value={inputs.basementSquareFootage} onChange={(event) => setQuantity("basementSquareFootage", event.target.value)} data-testid="input-nh-basement-sqft" />
                    </div>
                    <div className="space-y-2 md:col-span-2 flex items-center pt-6">
                      <label className="flex items-center gap-3">
                        <Checkbox checked={inputs.basementFinished} onCheckedChange={(checked) => setInputs((c) => ({ ...c, basementFinished: checked === true }))} data-testid="input-nh-basement-finished" />
                        <span className="font-medium text-sm">Basement is finished space</span>
                      </label>
                    </div>
                  </div>
                </section>

                <section>
                  <div className="mb-4 flex items-center gap-2 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                    <Zap size={16} /> General Devices & Lighting
                  </div>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="nh-outlets">Standard Outlets</Label>
                      <Input id="nh-outlets" type="number" min="0" value={inputs.outletQuantity} onChange={(event) => setQuantity("outletQuantity", event.target.value)} data-testid="input-nh-outlets" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nh-switches">Standard Switches</Label>
                      <Input id="nh-switches" type="number" min="0" value={inputs.switchQuantity} onChange={(event) => setQuantity("switchQuantity", event.target.value)} data-testid="input-nh-switches" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nh-dimmers">Dimmers</Label>
                      <Input id="nh-dimmers" type="number" min="0" value={inputs.dimmerQuantity} onChange={(event) => setQuantity("dimmerQuantity", event.target.value)} data-testid="input-nh-dimmers" />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="nh-recessed">Recessed Lights</Label>
                      <Input id="nh-recessed" type="number" min="0" value={inputs.recessedLightQuantity} onChange={(event) => setQuantity("recessedLightQuantity", event.target.value)} data-testid="input-nh-recessed" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nh-recessed-size">Recessed Size</Label>
                      <select id="nh-recessed-size" value={inputs.recessedLightSize} onChange={(event) => setInputs(c => ({...c, recessedLightSize: event.target.value as NewHouseInputs["recessedLightSize"]}))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" data-testid="input-nh-recessed-size">
                        <option value="4-inch">4-inch</option>
                        <option value="6-inch">6-inch</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nh-smoke">Smoke/CO Detectors</Label>
                      <Input id="nh-smoke" type="number" min="0" value={inputs.smokeCoQuantity} onChange={(event) => setQuantity("smokeCoQuantity", event.target.value)} data-testid="input-nh-smoke" />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="nh-fans">Ceiling Fans</Label>
                      <Input id="nh-fans" type="number" min="0" value={inputs.fanQuantity} onChange={(event) => setQuantity("fanQuantity", event.target.value)} data-testid="input-nh-fans" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nh-fan-supply">Fan Supply</Label>
                      <select id="nh-fan-supply" value={inputs.fanSupply} onChange={(event) => setInputs(c => ({...c, fanSupply: event.target.value as NewHouseInputs["fanSupply"]}))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" data-testid="input-nh-fan-supply">
                        <option value="Contractor supplied">Contractor supplied</option>
                        <option value="Builder / GC supplied">Builder / GC supplied</option>
                        <option value="Customer supplied">Customer supplied</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nh-fan-override">Fan Cost Override ($)</Label>
                      <Input id="nh-fan-override" type="number" min="0" step="0.01" value={inputs.fanMaterialUnitCostOverride ?? ""} placeholder="Optional" onChange={(event) => setNumber("fanMaterialUnitCostOverride", event.target.value)} data-testid="input-nh-fan-override" />
                    </div>
                  </div>
                </section>

                <section>
                  <div className="mb-4 flex items-center gap-2 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                    <Home size={16} /> Rooms & Exterior Circuits
                  </div>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="nh-bedrooms">Bedroom Count</Label>
                      <Input id="nh-bedrooms" type="number" min="0" step="1" value={inputs.bedroomCount} onChange={(event) => setQuantity("bedroomCount", event.target.value)} data-testid="input-nh-bedrooms" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nh-bathrooms">Bathroom Count</Label>
                      <Input id="nh-bathrooms" type="number" min="0" step="1" value={inputs.bathroomQuantity} onChange={(event) => setQuantity("bathroomQuantity", event.target.value)} data-testid="input-nh-bathrooms" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nh-kitchen">Kitchen App Circuits</Label>
                      <Input id="nh-kitchen" type="number" min="0" value={inputs.kitchenApplianceCircuitQuantity} onChange={(event) => setQuantity("kitchenApplianceCircuitQuantity", event.target.value)} data-testid="input-nh-kitchen" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nh-laundry">Laundry Circuits</Label>
                      <Input id="nh-laundry" type="number" min="0" value={inputs.laundryCircuitQuantity} onChange={(event) => setQuantity("laundryCircuitQuantity", event.target.value)} data-testid="input-nh-laundry" />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="nh-ext-receptacles">Exterior Receptacles</Label>
                      <Input id="nh-ext-receptacles" type="number" min="0" value={inputs.exteriorReceptacleQuantity} onChange={(event) => setQuantity("exteriorReceptacleQuantity", event.target.value)} data-testid="input-nh-ext-receptacles" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nh-ext-lighting">Exterior Lighting Loc.</Label>
                      <Input id="nh-ext-lighting" type="number" min="0" value={inputs.exteriorLightingQuantity} onChange={(event) => setQuantity("exteriorLightingQuantity", event.target.value)} data-testid="input-nh-ext-lighting" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nh-garage-receptacles">Garage Receptacles</Label>
                      <Input id="nh-garage-receptacles" type="number" min="0" value={inputs.garageReceptacleQuantity} onChange={(event) => setQuantity("garageReceptacleQuantity", event.target.value)} data-testid="input-nh-garage-receptacles" />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="nh-garage-circuits">Garage Circuits</Label>
                      <Input id="nh-garage-circuits" type="number" min="0" value={inputs.garageCircuitQuantity} onChange={(event) => setQuantity("garageCircuitQuantity", event.target.value)} data-testid="input-nh-garage-circuits" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nh-hvac">HVAC Circuits</Label>
                      <Input id="nh-hvac" type="number" min="0" value={inputs.hvacEquipmentCircuitQuantity} onChange={(event) => setQuantity("hvacEquipmentCircuitQuantity", event.target.value)} data-testid="input-nh-hvac" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nh-minisplit">Mini-Split Circuits</Label>
                      <Input id="nh-minisplit" type="number" min="0" value={inputs.miniSplitCircuitQuantity} onChange={(event) => setQuantity("miniSplitCircuitQuantity", event.target.value)} data-testid="input-nh-minisplit" />
                    </div>
                  </div>
                </section>

                <section>
                  <div className="mb-4 flex items-center gap-2 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                    <Zap size={16} /> Wiring & Distribution Allowances
                  </div>
                  
                  <div className="space-y-6">
                    <div className="rounded-lg border bg-muted/15 p-4 space-y-4">
                      <h4 className="font-semibold text-sm">Common Branch Circuits</h4>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="space-y-2">
                          <Label htmlFor="nh-branch-qty">Circuit Quantity</Label>
                          <Input id="nh-branch-qty" type="number" min="0" value={inputs.commonBranchCircuitQuantity} onChange={(event) => setQuantity("commonBranchCircuitQuantity", event.target.value)} data-testid="input-nh-branch-qty" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="nh-branch-ft">Average Footage Per Circuit</Label>
                          <Input id="nh-branch-ft" type="number" min="0" value={inputs.branchCircuitFootage} onChange={(event) => setNumber("branchCircuitFootage", event.target.value)} data-testid="input-nh-branch-ft" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="nh-branch-amp">Amperage</Label>
                          <select id="nh-branch-amp" value={inputs.branchCircuitAmperage} onChange={(event) => setInputs(c => ({...c, branchCircuitAmperage: Number(event.target.value) as NewHouseInputs["branchCircuitAmperage"]}))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" data-testid="input-nh-branch-amp">
                            <option value="15">15A</option>
                            <option value="20">20A</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="nh-branch-poles">Pole Count</Label>
                          <select id="nh-branch-poles" value={inputs.branchCircuitPoleCount} onChange={(event) => setQuantity("branchCircuitPoleCount", event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" data-testid="input-nh-branch-poles"><option value="1">1 pole</option></select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="nh-branch-prot">Protection Type</Label>
                          <select id="nh-branch-prot" value={inputs.branchCircuitProtectionType} onChange={(event) => setInputs(c => ({...c, branchCircuitProtectionType: event.target.value as NewHouseInputs["branchCircuitProtectionType"]}))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" data-testid="input-nh-branch-prot">
                            <option value="Standard">Standard</option>
                            <option value="GFCI">GFCI</option>
                            <option value="AFCI">AFCI</option>
                            <option value="Dual Function">Dual Function</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="nh-branch-cable">Cable Type</Label>
                          <select id="nh-branch-cable" value={inputs.branchCircuitCableType} onChange={(event) => setInputs(c => ({...c, branchCircuitCableType: event.target.value as NewHouseInputs["branchCircuitCableType"]}))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" data-testid="input-nh-branch-cable">
                            <option value="12/2 NM-B">12/2 NM-B</option>
                            <option value="14/2 NM-B">14/2 NM-B</option>
                            <option value="14/3 NM-B">14/3 NM-B</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border bg-muted/15 p-4 space-y-4">
                      <h4 className="font-semibold text-sm">Heavy Equipment Circuits</h4>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="space-y-2">
                          <Label htmlFor="nh-equip-ft">Average Footage Per Circuit</Label>
                          <Input id="nh-equip-ft" type="number" min="0" value={inputs.equipmentCircuitFootage} onChange={(event) => setNumber("equipmentCircuitFootage", event.target.value)} data-testid="input-nh-equip-ft" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="nh-equip-amp">Amperage</Label>
                          <select id="nh-equip-amp" value={inputs.equipmentCircuitAmperage} onChange={(event) => setEquipmentCircuitAmperage(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" data-testid="input-nh-equip-amp"><option value="20">20A</option><option value="30">30A</option><option value="40">40A</option></select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="nh-equip-poles">Pole Count</Label>
                          <select id="nh-equip-poles" value={inputs.equipmentCircuitPoleCount} onChange={(event) => setQuantity("equipmentCircuitPoleCount", event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" data-testid="input-nh-equip-poles"><option value="2">2 poles</option></select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="nh-equip-prot">Protection Type</Label>
                          <select id="nh-equip-prot" value={inputs.equipmentCircuitProtectionType} onChange={(event) => setInputs(c => ({...c, equipmentCircuitProtectionType: event.target.value as NewHouseInputs["equipmentCircuitProtectionType"]}))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" data-testid="input-nh-equip-prot">
                            <option value="Standard">Standard</option>
                            <option value="GFCI">GFCI</option>
                            <option value="AFCI">AFCI</option>
                            <option value="Dual Function">Dual Function</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="nh-equip-cable">Cable Type</Label>
                          <select id="nh-equip-cable" value={inputs.equipmentCircuitCableType} onChange={(event) => setInputs(c => ({...c, equipmentCircuitCableType: event.target.value as NewHouseInputs["equipmentCircuitCableType"]}))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" data-testid="input-nh-equip-cable">
                            {inputs.equipmentCircuitAmperage === 20 && <option value="12/2 NM-B">12/2 NM-B</option>}
                            {inputs.equipmentCircuitAmperage === 30 && <><option value="10/3 NM-B">10/3 NM-B</option><option value="10/2 NM-B">10/2 NM-B</option></>}
                            {inputs.equipmentCircuitAmperage === 40 && <><option value="8/3 NM-B">8/3 NM-B</option><option value="8/2 NM-B">8/2 NM-B</option></>}
                          </select>
                          <p className="text-xs text-muted-foreground">Use 3-wire for equipment that requires a neutral; keep 2-wire for straight 240V loads that do not.</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="nh-panel-mfg">Panel Manufacturer</Label>
                        <select id="nh-panel-mfg" value={inputs.panelManufacturer} onChange={(event) => setInputs(c => ({...c, panelManufacturer: event.target.value as NewHouseInputs["panelManufacturer"]}))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" data-testid="input-nh-panel-mfg">
                          <option value="Siemens">Siemens / ITE</option>
                          <option value="Eaton">Eaton BR</option>
                          <option value="Square D">Square D Homeline</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="nh-panel-allowance">Service / Panel Material Allowance ($)</Label>
                        <Input id="nh-panel-allowance" type="number" min="0" step="0.01" value={inputs.servicePanelAllowance} onChange={(event) => setNumber("servicePanelAllowance", event.target.value)} data-testid="input-nh-panel-allowance" />
                      </div>
                    </div>
                  </div>
                </section>

                <section>
                  <div className="mb-4 flex items-center gap-2 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                    <Clock size={16} /> Labor & Adjustments
                  </div>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-2">
                      <Label htmlFor="nh-crew-size">Crew Size</Label>
                      <Input id="nh-crew-size" type="number" min="1" value={inputs.crewSize} onChange={(event) => setQuantity("crewSize", event.target.value)} data-testid="input-nh-crew-size" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nh-crew-hours">Hours Per Person</Label>
                      <Input id="nh-crew-hours" type="number" min="0" value={inputs.crewHours} onChange={(event) => setNumber("crewHours", event.target.value)} data-testid="input-nh-crew-hours" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nh-labor-adj">Labor Adj. (Hours)</Label>
                      <Input id="nh-labor-adj" type="number" step="0.25" value={inputs.laborAdjustmentHours} onChange={(event) => setNumber("laborAdjustmentHours", event.target.value)} data-testid="input-nh-labor-adj" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nh-labor-rate">Labor Sell Rate</Label>
                      <select id="nh-labor-rate" value={inputs.laborRateType ?? "residential"} onChange={(event) => setInputs((current) => ({ ...current, laborRateType: event.target.value as NewHouseInputs["laborRateType"] }))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" data-testid="input-nh-labor-rate">
                        <option value="residential">Residential</option>
                        <option value="commercial">Commercial</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-6 space-y-2">
                    <Label htmlFor="nh-notes">Estimator Notes (Internal)</Label>
                    <Textarea id="nh-notes" value={inputs.notes} onChange={(event) => setInputs((current) => ({ ...current, notes: event.target.value }))} data-testid="input-nh-notes" />
                  </div>
                </section>
                
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
                    <p className="text-secondary-foreground/80">Labor, rough-in, device finish, and distribution are compiled into a comprehensive quote.</p>
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
                      <Label htmlFor="nh-labor-override">Internal Labor Cost Override ($)</Label>
                      <Input id="nh-labor-override" type="number" min="0" step="0.01" value={laborOverride} onChange={(event) => setLaborOverride(event.target.value)} placeholder={pricing ? `Calculated: ${pricing.laborCost.toFixed(2)}` : "Optional"} data-testid="input-nh-labor-override" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nh-price-override">Selling Price Override ($)</Label>
                      <Input id="nh-price-override" type="number" min="0" step="0.01" value={sellingPriceOverride} onChange={(event) => setSellingPriceOverride(event.target.value)} placeholder={pricing ? `Calculated: ${pricing.calculatedSellingPrice.toFixed(2)}` : "Optional"} data-testid="input-nh-price-override" />
                    </div>
                  </div>

                  {previewQuote.isError && <p className="text-sm text-destructive">The estimate preview could not be calculated.</p>}
                  <Button className="w-full text-lg font-bold" size="lg" type="submit" disabled={!settingsLoaded || createQuote.isPending || !previewIsCurrent || previewQuote.isError} data-testid="button-nh-submit">
                    {createQuote.isPending ? "Submitting..." : (!settingsLoaded || !previewIsCurrent) ? "Calculating..." : "Generate Quote"}
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
