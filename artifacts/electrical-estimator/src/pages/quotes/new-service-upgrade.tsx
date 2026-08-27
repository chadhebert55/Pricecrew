import {
  type ServiceUpgradeInputs,
  useCreateQuote,
  usePreviewQuote,
} from "@workspace/api-client-react"
import { pricingWarningKey, pricingWarningMessage } from "@/lib/pricing-warnings"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Calculator, Info, Construction, TriangleAlert } from "lucide-react"
import { useEffect, useState } from "react"
import { useLocation } from "wouter"

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"

const initialInputs: ServiceUpgradeInputs = {
  serviceSize: "200A",
  serviceConfiguration: "Overhead mast",
  serviceDisconnect: "Outdoor service disconnect",
  panelManufacturer: "Siemens",
  breakerAmperage: 200,
  breakerPoleCount: 2,
  breakerProtectionType: "Standard",
  meterDisconnectEquipment: "200A outdoor meter/disconnect",
  surgeProtection: "whole-home surge protection",
  includeOverheadMast: true,
  mastFootage: 10,
  weatherheadQuantity: 1,
  hubQuantity: 1,
  lbQuantity: 1,
  ninetyQuantity: 1,
  couplingQuantity: 2,
  mastRelatedPartsQuantity: 1,
  mastConductor: "4/0 aluminum XHHW conductor",
  mastConductorQuantity: 3,
  mastConductorFootage: 10,
  serviceToPanelConductor: "4/0 aluminum SER",
  serviceToPanelFootage: 15,
  groundBarQuantity: 2,
  groundRodQuantity: 2,
  acornClampQuantity: 2,
  intersystemBondingQuantity: 1,
  groundingConductorFootage: 30,
  bondingConductorFootage: 20,
  pvcThreeQuarterFootage: 10,
  pvcThreeQuarterFittingsQuantity: 4,
  waterMeterBondingQuantity: 2,
  waterMeterBondingFootage: 20,
  fourSquareBoxQuantity: 0,
  receptacle20AQuantity: 0,
  receptaclePlateQuantity: 0,
  plywoodQuantity: 0,
  studsQuantity: 0,
  permitAllowance: 0,
  inspectionAllowance: 0,
  miscellaneousAllowance: 0,
  crewSize: 2,
  crewHours: 12,
  laborAdjustmentHours: 0,
  laborRateType: "residential",
  notes: "",
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

export function NewServiceUpgradeQuote() {
  const [, setLocation] = useLocation()
  const createQuote = useCreateQuote()
  const previewQuote = usePreviewQuote()
  
  const [previewedInputKey, setPreviewedInputKey] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [customerEmail, setCustomerEmail] = useState("")
  const [projectName, setProjectName] = useState("")
  const [proposalDescription, setProposalDescription] = useState(
    "Provide labor and listed materials to perform a service upgrade, including necessary mast, conductors, metering equipment, main panel, and required grounding/bonding as specified. Final layout and routing are subject to field verification."
  )
  const [laborOverride, setLaborOverride] = useState("")
  const [sellingPriceOverride, setSellingPriceOverride] = useState("")
  const [inputs, setInputs] = useState<ServiceUpgradeInputs>(initialInputs)

  const previewPayload = {
    module: "SERVICE_UPGRADE" as const,
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

  const setNumber = (
    key: keyof ServiceUpgradeInputs,
    value: string,
    minimum = 0,
  ) => {
    setInputs((current) => ({ ...current, [key]: numberValue(value, minimum) }))
  }

  const setServiceSize = (serviceSize: ServiceUpgradeInputs["serviceSize"]) => {
    const defaults = {
      "100A": {
        breakerAmperage: 100,
        meterDisconnectEquipment: "100A outdoor meter/disconnect",
        mastConductor: "1/0 aluminum XHHW conductor" as const,
        serviceToPanelConductor: "1/0 aluminum SER" as const,
      },
      "150A": {
        breakerAmperage: 150,
        meterDisconnectEquipment: "150A outdoor meter/disconnect",
        mastConductor: "3/0 aluminum XHHW conductor" as const,
        serviceToPanelConductor: "3/0 aluminum SER" as const,
      },
      "200A": {
        breakerAmperage: 200,
        meterDisconnectEquipment: "200A outdoor meter/disconnect",
        mastConductor: "4/0 aluminum XHHW conductor" as const,
        serviceToPanelConductor: "4/0 aluminum SER" as const,
      },
    }[serviceSize]
    setInputs((current) => ({ ...current, serviceSize, ...defaults }))
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
          module: "SERVICE_UPGRADE",
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
    inputs.crewSize * inputs.crewHours + inputs.laborAdjustmentHours,
  )

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-24">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New Service Upgrade Quote</h1>
        <p className="mt-1 text-muted-foreground">
          Configure service size, disconnects, mast, grounding, and labor.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <Card className="border-t-4 border-t-secondary">
              <CardHeader><CardTitle>Project Details</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="su-customer">Customer Name *</Label>
                  <Input id="su-customer" required value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-email">Customer Email</Label>
                  <Input id="su-email" type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="su-project">Project Name *</Label>
                  <Input id="su-project" required value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="200A Service Upgrade" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="su-proposal">Customer-facing Proposal Description *</Label>
                  <Textarea id="su-proposal" required value={proposalDescription} onChange={(e) => setProposalDescription(e.target.value)} />
                </div>
              </CardContent>
            </Card>

            <Card className="border-t-4 border-t-primary shadow-md">
              <CardHeader className="border-b border-primary/10 bg-primary/5">
                <div className="flex items-center gap-2">
                  <Construction className="text-primary" size={20} />
                  <CardTitle>Parametric Builder: Service Upgrade</CardTitle>
                </div>
                <CardDescription>
                  Configure equipment, mast, grounding/bonding, materials, allowances, and labor.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-8 pt-6">
                
                <section>
                  <h3 className="mb-4 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Service & Equipment</h3>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="su-size">Service Size</Label>
                      <select id="su-size" className={selectClassName} value={inputs.serviceSize} onChange={(e) => setServiceSize(e.target.value as ServiceUpgradeInputs["serviceSize"])}>
                        <option value="100A">100A</option>
                        <option value="150A">150A</option>
                        <option value="200A">200A</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-config">Service Configuration</Label>
                      <select id="su-config" className={selectClassName} value={inputs.serviceConfiguration} onChange={(e) => setInputs(c => ({ ...c, serviceConfiguration: e.target.value as ServiceUpgradeInputs["serviceConfiguration"] }))}>
                        <option value="Overhead mast">Overhead mast</option>
                        <option value="Underground service">Underground service</option>
                        <option value="Other configured arrangement">Other configured arrangement</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-disconnect">Service Disconnect Location</Label>
                      <select id="su-disconnect" className={selectClassName} value={inputs.serviceDisconnect} onChange={(e) => setInputs(c => ({ ...c, serviceDisconnect: e.target.value as ServiceUpgradeInputs["serviceDisconnect"] }))}>
                        <option value="Outdoor service disconnect">Outdoor service disconnect</option>
                        <option value="Indoor main disconnect">Indoor main disconnect</option>
                        <option value="Meter-main combination">Meter-main combination</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-panel-mfr">Panel Manufacturer</Label>
                      <select id="su-panel-mfr" className={selectClassName} value={inputs.panelManufacturer} onChange={(e) => setInputs(c => ({ ...c, panelManufacturer: e.target.value as ServiceUpgradeInputs["panelManufacturer"] }))}>
                        <option value="Siemens">Siemens</option>
                        <option value="Eaton">Eaton</option>
                        <option value="Square D">Square D</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-breaker-amps">Main Breaker Amperage</Label>
                      <Input id="su-breaker-amps" type="number" min="1" step="1" value={inputs.breakerAmperage} onChange={(e) => setNumber("breakerAmperage", e.target.value, 1)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-breaker-poles">Main Breaker Pole Count</Label>
                      <Input id="su-breaker-poles" type="number" min="1" step="1" value={inputs.breakerPoleCount} onChange={(e) => setNumber("breakerPoleCount", e.target.value, 1)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-breaker-type">Main Breaker Protection</Label>
                      <select id="su-breaker-type" className={selectClassName} value={inputs.breakerProtectionType} onChange={(e) => setInputs(c => ({ ...c, breakerProtectionType: e.target.value as ServiceUpgradeInputs["breakerProtectionType"] }))}>
                        <option value="Standard">Standard</option>
                        <option value="GFCI">GFCI</option>
                        <option value="AFCI">AFCI</option>
                        <option value="Dual Function">Dual Function</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-meter-eq">Meter Disconnect Equipment</Label>
                      <Input id="su-meter-eq" value={inputs.meterDisconnectEquipment} onChange={(e) => setInputs(c => ({ ...c, meterDisconnectEquipment: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-surge">Surge Protection</Label>
                      <Input id="su-surge" value={inputs.surgeProtection} onChange={(e) => setInputs(c => ({ ...c, surgeProtection: e.target.value }))} />
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="mb-4 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Overhead Mast & Conductors</h3>
                  
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <label className="flex items-center gap-3 rounded-lg border p-4 text-sm font-medium md:col-span-2">
                      <Checkbox checked={inputs.includeOverheadMast} onCheckedChange={(checked) => setInputs((c) => ({ ...c, includeOverheadMast: checked === true }))} />
                      Include Overhead Mast Hardware
                    </label>

                    {inputs.includeOverheadMast && (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="su-mast-ft">Mast Footage (FT)</Label>
                          <Input id="su-mast-ft" type="number" min="0" step="1" value={inputs.mastFootage} onChange={(e) => setNumber("mastFootage", e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="su-weatherhead">Weatherhead Qty</Label>
                          <Input id="su-weatherhead" type="number" min="0" step="1" value={inputs.weatherheadQuantity} onChange={(e) => setNumber("weatherheadQuantity", e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="su-hub">Hub Qty</Label>
                          <Input id="su-hub" type="number" min="0" step="1" value={inputs.hubQuantity} onChange={(e) => setNumber("hubQuantity", e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="su-lb">LB Qty</Label>
                          <Input id="su-lb" type="number" min="0" step="1" value={inputs.lbQuantity} onChange={(e) => setNumber("lbQuantity", e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="su-90">90-Degree Qty</Label>
                          <Input id="su-90" type="number" min="0" step="1" value={inputs.ninetyQuantity} onChange={(e) => setNumber("ninetyQuantity", e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="su-coupling">Coupling Qty</Label>
                          <Input id="su-coupling" type="number" min="0" step="1" value={inputs.couplingQuantity} onChange={(e) => setNumber("couplingQuantity", e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="su-mast-parts">Mast Related Parts Qty</Label>
                          <Input id="su-mast-parts" type="number" min="0" step="1" value={inputs.mastRelatedPartsQuantity} onChange={(e) => setNumber("mastRelatedPartsQuantity", e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="su-mast-conductor">Mast Conductor</Label>
                          <select id="su-mast-conductor" className={selectClassName} value={inputs.mastConductor} onChange={(e) => setInputs(c => ({ ...c, mastConductor: e.target.value as ServiceUpgradeInputs["mastConductor"] }))}>
                            <option value="1/0 aluminum XHHW conductor">1/0 aluminum XHHW conductor</option>
                            <option value="3/0 aluminum XHHW conductor">3/0 aluminum XHHW conductor</option>
                            <option value="4/0 aluminum XHHW conductor">4/0 aluminum XHHW conductor</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="su-mast-cond-qty">Mast Conductor Qty</Label>
                          <Input id="su-mast-cond-qty" type="number" min="0" step="1" value={inputs.mastConductorQuantity} onChange={(e) => setNumber("mastConductorQuantity", e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="su-mast-cond-ft">Mast Conductor Footage (FT)</Label>
                          <Input id="su-mast-cond-ft" type="number" min="0" step="1" value={inputs.mastConductorFootage} onChange={(e) => setNumber("mastConductorFootage", e.target.value)} />
                        </div>
                      </>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="su-ser-cond">Service-to-Panel Conductor</Label>
                      <select id="su-ser-cond" className={selectClassName} value={inputs.serviceToPanelConductor} onChange={(e) => setInputs(c => ({ ...c, serviceToPanelConductor: e.target.value as ServiceUpgradeInputs["serviceToPanelConductor"] }))}>
                        <option value="1/0 aluminum SER">1/0 aluminum SER</option>
                        <option value="1/0 copper alternative">1/0 copper alternative</option>
                        <option value="3/0 aluminum SER">3/0 aluminum SER</option>
                        <option value="2/0 copper alternative">2/0 copper alternative</option>
                        <option value="4/0 aluminum SER">4/0 aluminum SER</option>
                        <option value="4/0 copper alternative">4/0 copper alternative</option>
                        <option value="Other configured conductor">Other configured conductor</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-ser-ft">Service-to-Panel Footage (FT)</Label>
                      <Input id="su-ser-ft" type="number" min="0" step="1" value={inputs.serviceToPanelFootage} onChange={(e) => setNumber("serviceToPanelFootage", e.target.value)} />
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="mb-4 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Grounding, Bonding & Raceway</h3>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="su-ground-bar">Ground Bar Qty</Label>
                      <Input id="su-ground-bar" type="number" min="0" step="1" value={inputs.groundBarQuantity} onChange={(e) => setNumber("groundBarQuantity", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-ground-rod">Ground Rod Qty</Label>
                      <Input id="su-ground-rod" type="number" min="0" step="1" value={inputs.groundRodQuantity} onChange={(e) => setNumber("groundRodQuantity", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-acorn">Acorn Clamp Qty</Label>
                      <Input id="su-acorn" type="number" min="0" step="1" value={inputs.acornClampQuantity} onChange={(e) => setNumber("acornClampQuantity", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-intersystem">Intersystem Bonding Qty</Label>
                      <Input id="su-intersystem" type="number" min="0" step="1" value={inputs.intersystemBondingQuantity} onChange={(e) => setNumber("intersystemBondingQuantity", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-ground-cond-ft">Grounding Conductor (FT)</Label>
                      <Input id="su-ground-cond-ft" type="number" min="0" step="1" value={inputs.groundingConductorFootage} onChange={(e) => setNumber("groundingConductorFootage", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-bond-cond-ft">Bonding Conductor (FT)</Label>
                      <Input id="su-bond-cond-ft" type="number" min="0" step="1" value={inputs.bondingConductorFootage} onChange={(e) => setNumber("bondingConductorFootage", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-pvc-ft">3/4" PVC Footage (FT)</Label>
                      <Input id="su-pvc-ft" type="number" min="0" step="1" value={inputs.pvcThreeQuarterFootage} onChange={(e) => setNumber("pvcThreeQuarterFootage", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-pvc-fittings">3/4" PVC Fittings Qty</Label>
                      <Input id="su-pvc-fittings" type="number" min="0" step="1" value={inputs.pvcThreeQuarterFittingsQuantity} onChange={(e) => setNumber("pvcThreeQuarterFittingsQuantity", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-water-bond-qty">Water Meter Bonding Qty</Label>
                      <Input id="su-water-bond-qty" type="number" min="0" step="1" value={inputs.waterMeterBondingQuantity} onChange={(e) => setNumber("waterMeterBondingQuantity", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-water-bond-ft">Water Meter Bonding Footage</Label>
                      <Input id="su-water-bond-ft" type="number" min="0" step="1" value={inputs.waterMeterBondingFootage} onChange={(e) => setNumber("waterMeterBondingFootage", e.target.value)} />
                    </div>
                  </div>
                </section>
                
                <section>
                  <h3 className="mb-4 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Supporting Materials</h3>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="su-4sq">4-Square Box Qty</Label>
                      <Input id="su-4sq" type="number" min="0" step="1" value={inputs.fourSquareBoxQuantity} onChange={(e) => setNumber("fourSquareBoxQuantity", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-rec20">20A Receptacle Qty</Label>
                      <Input id="su-rec20" type="number" min="0" step="1" value={inputs.receptacle20AQuantity} onChange={(e) => setNumber("receptacle20AQuantity", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-rec-plate">Receptacle Plate Qty</Label>
                      <Input id="su-rec-plate" type="number" min="0" step="1" value={inputs.receptaclePlateQuantity} onChange={(e) => setNumber("receptaclePlateQuantity", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-plywood">Plywood Backer Qty</Label>
                      <Input id="su-plywood" type="number" min="0" step="1" value={inputs.plywoodQuantity} onChange={(e) => setNumber("plywoodQuantity", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-studs">Studs Qty</Label>
                      <Input id="su-studs" type="number" min="0" step="1" value={inputs.studsQuantity} onChange={(e) => setNumber("studsQuantity", e.target.value)} />
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="mb-4 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Allowances & Labor</h3>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="su-permit">Permit Allowance ($)</Label>
                      <Input id="su-permit" type="number" min="0" step="1" value={inputs.permitAllowance} onChange={(e) => setNumber("permitAllowance", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-inspection">Inspection Allowance ($)</Label>
                      <Input id="su-inspection" type="number" min="0" step="1" value={inputs.inspectionAllowance} onChange={(e) => setNumber("inspectionAllowance", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-misc">Misc Allowance ($)</Label>
                      <Input id="su-misc" type="number" min="0" step="1" value={inputs.miscellaneousAllowance} onChange={(e) => setNumber("miscellaneousAllowance", e.target.value)} />
                    </div>
                    
                    <div className="space-y-2 md:col-span-2 mt-4 pt-4 border-t border-border">
                      <Label htmlFor="su-labor-rate">Labor Sell Rate</Label>
                      <select id="su-labor-rate" className={selectClassName} value={inputs.laborRateType ?? "residential"} onChange={(e) => setInputs((c) => ({ ...c, laborRateType: e.target.value as ServiceUpgradeInputs["laborRateType"] }))}>
                        <option value="residential">Residential</option>
                        <option value="commercial">Commercial</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="su-crew-size">Crew Size</Label>
                      <Input id="su-crew-size" type="number" min="1" step="1" value={inputs.crewSize} onChange={(e) => setNumber("crewSize", e.target.value, 1)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-crew-hours">Crew Hours</Label>
                      <Input id="su-crew-hours" type="number" min="0" step="1" value={inputs.crewHours} onChange={(e) => setNumber("crewHours", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-labor-adj">Labor Adjustment (Hours)</Label>
                      <Input id="su-labor-adj" type="number" min="-100" step="0.5" value={inputs.laborAdjustmentHours} onChange={(e) => setInputs((c) => ({ ...c, laborAdjustmentHours: Number(e.target.value) || 0 }))} />
                    </div>
                  </div>
                  
                  <div className="mt-4 rounded-lg border border-primary/25 bg-primary/5 p-4 text-sm flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-primary block">Calculated Total Person-Hours</span>
                      <span className="text-muted-foreground mt-0.5 block">({inputs.crewSize} crew &times; {inputs.crewHours} hours) + {inputs.laborAdjustmentHours} adj</span>
                    </div>
                    <div className="text-2xl font-mono font-bold">{totalPersonHours}</div>
                  </div>
                </section>

                <div className="space-y-2">
                  <Label htmlFor="su-notes">Estimator Notes (Internal)</Label>
                  <Textarea id="su-notes" value={inputs.notes} onChange={(e) => setInputs((c) => ({ ...c, notes: e.target.value }))} />
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
                      </div>

                      <div className="space-y-4 border-t border-secondary-border pt-4">
                        <div className="space-y-2">
                          <Label className="text-xs text-secondary-foreground/70 uppercase">Internal Labor Override</Label>
                          <Input type="number" min="0" step="0.01" placeholder={`Calc: $${pricing.laborCost.toFixed(2)}`} value={laborOverride} onChange={(e) => setLaborOverride(e.target.value)} className="h-8 border-secondary-border bg-secondary/50 font-mono text-sm placeholder:text-secondary-foreground/30 focus-visible:ring-primary" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-secondary-foreground/70 uppercase">Selling Price Override</Label>
                          <Input type="number" min="0" step="0.01" placeholder={`Calc: $${pricing.calculatedSellingPrice.toFixed(2)}`} value={sellingPriceOverride} onChange={(e) => setSellingPriceOverride(e.target.value)} className="h-8 border-secondary-border bg-secondary/50 font-mono text-sm placeholder:text-secondary-foreground/30 focus-visible:ring-primary" />
                        </div>
                      </div>

                      <div className="border-t border-secondary-border pt-4 text-center">
                        <div className="text-xs tracking-wider text-secondary-foreground/70 uppercase">Final Selling Price</div>
                        <div className="mt-1 font-mono text-3xl font-bold text-primary">${pricing.finalSellingPrice.toFixed(2)}</div>
                      </div>

                      <Button type="submit" className="w-full" size="lg" disabled={!previewIsCurrent || createQuote.isPending}>
                        {createQuote.isPending ? "Creating Quote..." : "Create Quote Snapshot"}
                      </Button>
                      
                      {assembly.length > 0 && (
                        <div className="mt-6">
                          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-secondary-foreground/70">Generated Assembly Preview ({assembly.length})</h4>
                          <div className="max-h-48 overflow-y-auto rounded border border-secondary-border bg-secondary-foreground/5 p-2 text-xs">
                            <ul className="space-y-1 text-secondary-foreground/80">
                              {assembly.map((item, index) => (
                                <li key={index} className="flex justify-between border-b border-secondary-border/50 pb-1 last:border-0 last:pb-0">
                                  <span className="truncate pr-2">{item.description}</span>
                                  <span className="shrink-0 font-mono opacity-75">{item.quantity} {item.unit}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="py-8 text-center text-sm text-secondary-foreground/50">
                      {previewQuote.isPending ? "Calculating estimate..." : "Enter details to see calculation"}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
