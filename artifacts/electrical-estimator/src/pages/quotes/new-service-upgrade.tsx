import {
  type ServiceUpgradeInputs,
  type ExistingBreakerCount,
  type ExistingBreakerCountProtectionType,
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
import { Calculator, Info, Construction, TriangleAlert } from "lucide-react"
import { useEffect, useState } from "react"
import { useLocation } from "wouter"

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"

type ExactCatalogPartKey = keyof NonNullable<ServiceUpgradeInputs["exactCatalogParts"]>

const MILBANK_200A_METER_MAIN =
  "Milbank U3990-XL-200 200A meter-main — SKU 304898"
const SIEMENS_200A_PANEL =
  "Siemens PN4040B1200C 200A 40-space panel — SKU 1552599"

const exactCatalogOptions = {
  meterDisconnect: [
    { value: MILBANK_200A_METER_MAIN, label: "200A meter-main with built-in disconnect" },
    { value: "Siemens MC0816B1200 200A meter-load-center — SKU 132873", label: "200A meter-load-center with built-in disconnect" },
  ],
  servicePanel: [
    { value: SIEMENS_200A_PANEL, label: "200A Siemens panel" },
    { value: "Square D HOM612L100R 100A 6-space MLO load center — SKU 79511", label: "100A Square D panel" },
  ],
  mastRaceway: [{ value: "PVCFIT 200P40-20F 2-inch Sch40 PVC conduit 10-ft stick — SKU 8891", label: "2-inch PVC" }],
  mastWeatherhead: [{ value: "PVCFIT 200P WH 2-inch PVC service weatherhead — SKU 512902", label: "2-inch weatherhead" }],
  mastExpansionCoupling: [{ value: "PVCFIT 200P EC 2-inch PVC expansion coupling — SKU 15350", label: "2-inch expansion coupling" }],
  mastStrap: [{ value: "PVCFIT 200P PS 2-inch two-hole PVC conduit strap — SKU 152755", label: "2-inch two-hole strap" }],
  mastHub: [{ value: "Siemens ECHS200 2-inch load-center rain hub — SKU 26750", label: "2-inch panel hub" }],
  mastLb: [{ value: "PVCFIT 2-inch LB — 100-count confirmed package — SKU 25807", label: "2-inch LB" }],
  mastNinety: [{ value: "PVCFIT 2-inch 90 Sch40 elbow — 100-count confirmed package — SKU 18745", label: "2-inch PVC 90" }],
  mastCoupling: [{ value: "PVCFIT 200P CP 2-inch PVC conduit coupling — SKU 26466", label: "2-inch coupling" }],
  serviceToPanelRaceway: [{ value: "PVCFIT 200P40-20F 2-inch Sch40 PVC conduit 10-ft stick — SKU 8891", label: "2-inch PVC" }],
  serviceToPanelConductor: [
    "28551", "79651", "1266468", "239663", "300640",
  ].map((sku, index) => ({ value: `Wia 4/0 aluminum SER — SKU ${sku}`, label: `4/0 aluminum SER${index === 0 ? "" : ` — company option ${index + 1}`}` })),
  groundBar: [
    { value: "GE TGK12 12-hole ground bar — SKU 17742", label: "Universal ground bar" },
    { value: "Siemens ECGB20 20-position ground bar — SKU 35113", label: "Siemens ground bar" },
    { value: "Square D PK3GTA1 ground bar — SKU 86163", label: "Square D ground bar" },
  ],
  groundRod: [{ value: "Erico 615880 5/8x8ft copper ground rod — SKU 160523", label: "Ground rod" }],
  acornClamp: [{ value: "Erico CP58 5/8 ground rod clamp — SKU 31589", label: "Acorn clamp" }],
  groundingRaceway: [{ value: "PVC 3/4-inch Sch40 conduit — 100-foot confirmed package — SKU 9871", label: "3/4-inch PVC" }],
  groundingRacewayFitting: [{ value: "Ocal CPL3/4-G 3/4-inch coupling — SKU 30952", label: "3/4-inch coupling" }],
  ductSeal: [{ value: "AGP DS1 1lb duct seal — SKU 1009903", label: "Duct seal" }],
  pvcPrimer: [{ value: "PVCFIT clear quart primer — 100-count confirmed package — SKU 152609", label: "PVC primer" }],
  pvcGlue: [{ value: "PVCFIT clear quart cement — 100-count confirmed package — SKU 152791", label: "PVC cement" }],
  antiOxidant: [{ value: "Ideal 30-026 4oz anti-oxidant — SKU 32650", label: "Anti-oxidant compound" }],
  electricalTape: [{ value: "3M 69 3/4x66ft electrical tape — SKU 21719", label: "Electrical tape" }],
} satisfies Partial<Record<ExactCatalogPartKey, { value: string; label: string }[]>>

const initialInputs: ServiceUpgradeInputs = {
  serviceSize: "200A",
  serviceConfiguration: "Overhead mast",
  serviceDisconnect: "Meter-main combination",
  panelManufacturer: "Siemens",
  breakerAmperage: 200,
  breakerPoleCount: 2,
  breakerProtectionType: "Standard",
  meterDisconnectEquipment: "200A meter-main with built-in outdoor disconnect",
  surgeProtection: "Whole-home surge protection",
  includeOverheadMast: true,
  mastFootage: 10,
  weatherheadQuantity: 1,
  hubQuantity: 1,
  lbQuantity: 1,
  ninetyQuantity: 1,
  couplingQuantity: 2,
  mastExpansionCouplingQuantity: 1,
  mastStrapQuantity: 2,
  mastRelatedPartsQuantity: 0,
  mastConductor: "4/0 aluminum XHHW conductor",
  mastConductorQuantity: 3,
  mastConductorFootage: 10,
  serviceToPanelConductor: "4/0 aluminum XHHW in raceway",
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
  fourSquareBoxQuantity: 1,
  receptacle20AQuantity: 1,
  receptaclePlateQuantity: 1,
  plywoodQuantity: 1,
  studsQuantity: 2,
  ductSealQuantity: 1,
  pvcPrimerQuantity: 1,
  pvcGlueQuantity: 1,
  antiOxidantQuantity: 1,
  electricalTapeQuantity: 2,
  permitAllowance: 0,
  inspectionAllowance: 0,
  utilityCoordinationAllowance: 0,
  miscellaneousAllowance: 0,
  crewSize: 2,
  crewHours: 16,
  relocationLaborHours: 0,
  accessDifficultyLaborHours: 0,
  groundingReworkLaborHours: 0,
  feederDistanceLaborHours: 0,
  serviceConditionLaborHours: 0,
  utilityCoordinationLaborHours: 0,
  generalLaborAdjustmentHours: 0,
  existingBreakers: [],
  existingOtherBreakerQuantity: 0,
  laborRateType: "residential",
  exactCatalogParts: {
    meterDisconnect: MILBANK_200A_METER_MAIN,
    servicePanel: SIEMENS_200A_PANEL,
    mastRaceway: exactCatalogOptions.mastRaceway[0].value,
    mastWeatherhead: exactCatalogOptions.mastWeatherhead[0].value,
    mastExpansionCoupling: exactCatalogOptions.mastExpansionCoupling[0].value,
    mastStrap: exactCatalogOptions.mastStrap[0].value,
    mastHub: exactCatalogOptions.mastHub[0].value,
    mastLb: exactCatalogOptions.mastLb[0].value,
    mastNinety: exactCatalogOptions.mastNinety[0].value,
    mastCoupling: exactCatalogOptions.mastCoupling[0].value,
    serviceToPanelRaceway: exactCatalogOptions.serviceToPanelRaceway[0].value,
    groundBar: exactCatalogOptions.groundBar[1].value,
    groundRod: exactCatalogOptions.groundRod[0].value,
    acornClamp: exactCatalogOptions.acornClamp[0].value,
    groundingRaceway: exactCatalogOptions.groundingRaceway[0].value,
    groundingRacewayFitting: exactCatalogOptions.groundingRacewayFitting[0].value,
    ductSeal: exactCatalogOptions.ductSeal[0].value,
    pvcPrimer: exactCatalogOptions.pvcPrimer[0].value,
    pvcGlue: exactCatalogOptions.pvcGlue[0].value,
    antiOxidant: exactCatalogOptions.antiOxidant[0].value,
    electricalTape: exactCatalogOptions.electricalTape[0].value,
  },
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
  const { data: settings } = useGetSettings()
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  
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
  const [existingBreakersState, setExistingBreakersState] = useState<Record<string, number>>({})

  useEffect(() => {
    if (settings && !settingsLoaded) {
      setInputs((current) => ({
        ...current,
        crewSize: settings.serviceUpgradeCrewSize ?? 2,
        crewHours: settings.serviceUpgradeHoursPerPerson ?? 16,
      }))
      setSettingsLoaded(true)
    }
  }, [settings, settingsLoaded])

  const previewPayload = {
    module: "SERVICE_UPGRADE" as const,
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
    key: keyof ServiceUpgradeInputs,
    value: string,
    minimum = 0,
  ) => {
    setInputs((current) => ({ ...current, [key]: numberValue(value, minimum) }))
  }

  const exactCatalogSelect = (
    id: string,
    key: keyof typeof exactCatalogOptions,
    options = exactCatalogOptions[key],
  ) => (
    <div className="space-y-2">
      <Label>Material</Label>
      <div
        id={id}
        className="flex min-h-9 items-center rounded-md border border-input bg-muted/35 px-3 text-sm text-foreground"
      >
        {options.find((option) => option.value === inputs.exactCatalogParts?.[key])?.label ??
          "Company price-book material"}
      </div>
    </div>
  )

  const setServiceSize = (serviceSize: ServiceUpgradeInputs["serviceSize"]) => {
    const defaults = {
      "100A": {
        breakerAmperage: 100,
        meterDisconnectEquipment:
          inputs.serviceDisconnect === "Meter-main combination"
            ? "100A meter-main with built-in outdoor disconnect"
            : "100A outdoor meter/disconnect",
        mastConductor: "1/0 aluminum XHHW conductor" as const,
        serviceToPanelConductor: "1/0 aluminum SER" as const,
      },
      "150A": {
        breakerAmperage: 150,
        meterDisconnectEquipment:
          inputs.serviceDisconnect === "Meter-main combination"
            ? "150A meter-main with built-in outdoor disconnect"
            : "150A outdoor meter/disconnect",
        mastConductor: "3/0 aluminum XHHW conductor" as const,
        serviceToPanelConductor: "3/0 aluminum SER" as const,
      },
      "200A": {
        breakerAmperage: 200,
        meterDisconnectEquipment:
          inputs.serviceDisconnect === "Meter-main combination"
            ? "200A meter-main with built-in outdoor disconnect"
            : "200A outdoor meter/disconnect",
        mastConductor: "4/0 aluminum XHHW conductor" as const,
        serviceToPanelConductor: "4/0 aluminum SER" as const,
      },
    }[serviceSize]
    setInputs(({ exactCatalogParts, ...current }) => {
      const next = { ...(exactCatalogParts ?? {}) }
      delete next.servicePanel
      delete next.serviceToPanelConductor
      delete next.serviceToPanelRaceway
      delete next.meterDisconnect
      if (serviceSize === "200A") {
        if (inputs.serviceDisconnect === "Meter-main combination") {
          next.meterDisconnect = MILBANK_200A_METER_MAIN
        }
        if (inputs.panelManufacturer === "Siemens") {
          next.servicePanel = SIEMENS_200A_PANEL
        }
      }
      return { ...current, serviceSize, ...defaults, ...(Object.keys(next).length > 0 ? { exactCatalogParts: next } : {}) }
    })
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
    inputs.crewSize * inputs.crewHours +
      (inputs.relocationLaborHours || 0) +
      (inputs.accessDifficultyLaborHours || 0) +
      (inputs.groundingReworkLaborHours || 0) +
      (inputs.feederDistanceLaborHours || 0) +
      (inputs.serviceConditionLaborHours || 0) +
      (inputs.utilityCoordinationLaborHours || 0) +
      (inputs.generalLaborAdjustmentHours ?? inputs.laborAdjustmentHours ?? 0),
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
                      <select
                        id="su-disconnect"
                        className={selectClassName}
                        value={inputs.serviceDisconnect}
                        onChange={(e) => {
                          const serviceDisconnect = e.target.value as ServiceUpgradeInputs["serviceDisconnect"]
                          setInputs(({ exactCatalogParts, ...current }) => {
                            const next = { ...(exactCatalogParts ?? {}) }
                            delete next.meterDisconnect
                            if (
                              serviceDisconnect === "Meter-main combination" &&
                              current.serviceSize === "200A"
                            ) {
                              next.meterDisconnect = MILBANK_200A_METER_MAIN
                            }
                            return {
                              ...current,
                              serviceDisconnect,
                              meterDisconnectEquipment:
                                serviceDisconnect === "Meter-main combination"
                                  ? `${current.serviceSize} meter-main with built-in outdoor disconnect`
                                  : `${current.serviceSize} outdoor meter/disconnect`,
                              ...(Object.keys(next).length > 0 ? { exactCatalogParts: next } : {}),
                            }
                          })
                        }}
                      >
                        <option value="Outdoor service disconnect">Outdoor service disconnect</option>
                        <option value="Indoor main disconnect">Indoor main disconnect</option>
                        <option value="Meter-main combination">Meter-main combination</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-panel-mfr">Panel Manufacturer</Label>
                      <select id="su-panel-mfr" className={selectClassName} value={inputs.panelManufacturer} onChange={(e) => setInputs(c => {
                        const exactCatalogParts = { ...(c.exactCatalogParts ?? {}) }
                        delete exactCatalogParts.servicePanel
                        delete exactCatalogParts.groundBar
                        delete exactCatalogParts.mastHub
                        const panelManufacturer = e.target.value as ServiceUpgradeInputs["panelManufacturer"]
                        if (panelManufacturer === "Siemens" && c.serviceSize === "200A") {
                          exactCatalogParts.servicePanel = SIEMENS_200A_PANEL
                        }
                        return { ...c, panelManufacturer, ...(Object.keys(exactCatalogParts).length > 0 ? { exactCatalogParts } : { exactCatalogParts: undefined }) }
                      })}>
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
                    {exactCatalogSelect(
                      "su-meter-exact",
                      "meterDisconnect",
                        inputs.serviceSize === "200A" &&
                          inputs.serviceDisconnect === "Meter-main combination"
                        ? exactCatalogOptions.meterDisconnect
                        : [],
                    )}
                    {exactCatalogSelect(
                      "su-panel-exact",
                      "servicePanel",
                      exactCatalogOptions.servicePanel.filter((option) =>
                        (inputs.serviceSize === "200A" &&
                          inputs.panelManufacturer === "Siemens" &&
                          option.value === SIEMENS_200A_PANEL) ||
                        (inputs.serviceSize === "100A" &&
                          inputs.panelManufacturer === "Square D" &&
                          option.value !== SIEMENS_200A_PANEL),
                      ),
                    )}
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
                          <Label htmlFor="su-mast-ft">2-Inch PVC Conduit Footage (FT)</Label>
                          <Input id="su-mast-ft" type="number" min="0" step="1" value={inputs.mastFootage} onChange={(e) => setNumber("mastFootage", e.target.value)} />
                        </div>
                        {exactCatalogSelect("su-mast-raceway-exact", "mastRaceway")}
                        <div className="space-y-2">
                          <Label htmlFor="su-weatherhead">Weatherhead Qty</Label>
                          <Input id="su-weatherhead" type="number" min="0" step="1" value={inputs.weatherheadQuantity} onChange={(e) => setNumber("weatherheadQuantity", e.target.value)} />
                        </div>
                        {exactCatalogSelect("su-weatherhead-exact", "mastWeatherhead")}
                        <div className="space-y-2">
                          <Label htmlFor="su-expansion-coupling">Expansion Coupling Qty</Label>
                          <Input id="su-expansion-coupling" type="number" min="0" step="1" value={inputs.mastExpansionCouplingQuantity ?? 0} onChange={(e) => setNumber("mastExpansionCouplingQuantity", e.target.value)} />
                        </div>
                        {exactCatalogSelect("su-expansion-coupling-exact", "mastExpansionCoupling")}
                        <div className="space-y-2">
                          <Label htmlFor="su-mast-strap">Two-Hole Strap Qty</Label>
                          <Input id="su-mast-strap" type="number" min="0" step="1" value={inputs.mastStrapQuantity ?? 0} onChange={(e) => setNumber("mastStrapQuantity", e.target.value)} />
                        </div>
                        {exactCatalogSelect("su-mast-strap-exact", "mastStrap")}
                        <div className="space-y-2">
                          <Label htmlFor="su-hub">Hub Qty</Label>
                          <Input id="su-hub" type="number" min="0" step="1" value={inputs.hubQuantity} onChange={(e) => setNumber("hubQuantity", e.target.value)} />
                        </div>
                        {exactCatalogSelect(
                          "su-hub-exact",
                          "mastHub",
                          inputs.panelManufacturer === "Siemens"
                            ? exactCatalogOptions.mastHub
                            : [],
                        )}
                        <div className="space-y-2">
                          <Label htmlFor="su-lb">LB Qty</Label>
                          <Input id="su-lb" type="number" min="0" step="1" value={inputs.lbQuantity} onChange={(e) => setNumber("lbQuantity", e.target.value)} />
                        </div>
                        {exactCatalogSelect("su-lb-exact", "mastLb")}
                        <div className="space-y-2">
                          <Label htmlFor="su-90">90-Degree Qty</Label>
                          <Input id="su-90" type="number" min="0" step="1" value={inputs.ninetyQuantity} onChange={(e) => setNumber("ninetyQuantity", e.target.value)} />
                        </div>
                        {exactCatalogSelect("su-90-exact", "mastNinety")}
                        <div className="space-y-2">
                          <Label htmlFor="su-coupling">Coupling Qty</Label>
                          <Input id="su-coupling" type="number" min="0" step="1" value={inputs.couplingQuantity} onChange={(e) => setNumber("couplingQuantity", e.target.value)} />
                        </div>
                        {exactCatalogSelect("su-coupling-exact", "mastCoupling")}
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
                      <select id="su-ser-cond" className={selectClassName} value={inputs.serviceToPanelConductor} onChange={(e) => setInputs(({ exactCatalogParts, ...current }) => {
                        const next = { ...(exactCatalogParts ?? {}) }
                        delete next.serviceToPanelConductor
                         delete next.serviceToPanelRaceway
                         return { ...current, serviceToPanelConductor: e.target.value as ServiceUpgradeInputs["serviceToPanelConductor"], ...(Object.keys(next).length > 0 ? { exactCatalogParts: next } : {}) }
                      })}>
                        <option value="1/0 aluminum SER">1/0 aluminum SER</option>
                        <option value="1/0 copper alternative">1/0 copper alternative</option>
                        <option value="3/0 aluminum SER">3/0 aluminum SER</option>
                        <option value="2/0 copper alternative">2/0 copper alternative</option>
                         <option value="4/0 aluminum XHHW in raceway">4/0 aluminum XHHW in raceway</option>
                        <option value="4/0 aluminum SER">4/0 aluminum SER</option>
                        <option value="4/0 copper alternative">4/0 copper alternative</option>
                        <option value="Other configured conductor">Other configured conductor</option>
                      </select>
                    </div>
                    {inputs.serviceToPanelConductor === "4/0 aluminum SER" && exactCatalogSelect("su-ser-exact", "serviceToPanelConductor")}
                    {inputs.serviceToPanelConductor === "4/0 aluminum XHHW in raceway" && exactCatalogSelect("su-service-raceway-exact", "serviceToPanelRaceway")}
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
                    {exactCatalogSelect(
                      "su-ground-bar-exact",
                      "groundBar",
                      exactCatalogOptions.groundBar.filter((option) =>
                        option.value.startsWith("GE ") || option.value.startsWith(`${inputs.panelManufacturer} `),
                      ),
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="su-ground-rod">Ground Rod Qty</Label>
                      <Input id="su-ground-rod" type="number" min="0" step="1" value={inputs.groundRodQuantity} onChange={(e) => setNumber("groundRodQuantity", e.target.value)} />
                    </div>
                    {exactCatalogSelect("su-ground-rod-exact", "groundRod")}
                    <div className="space-y-2">
                      <Label htmlFor="su-acorn">Acorn Clamp Qty</Label>
                      <Input id="su-acorn" type="number" min="0" step="1" value={inputs.acornClampQuantity} onChange={(e) => setNumber("acornClampQuantity", e.target.value)} />
                    </div>
                    {exactCatalogSelect("su-acorn-exact", "acornClamp")}
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
                    {exactCatalogSelect("su-grounding-raceway-exact", "groundingRaceway")}
                    <div className="space-y-2">
                      <Label htmlFor="su-pvc-fittings">3/4" PVC Fittings Qty</Label>
                      <Input id="su-pvc-fittings" type="number" min="0" step="1" value={inputs.pvcThreeQuarterFittingsQuantity} onChange={(e) => setNumber("pvcThreeQuarterFittingsQuantity", e.target.value)} />
                    </div>
                    {exactCatalogSelect("su-grounding-raceway-fitting-exact", "groundingRacewayFitting")}
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
                    <div className="space-y-2">
                      <Label htmlFor="su-duct-seal">Service / Duct Seal Qty</Label>
                      <Input id="su-duct-seal" type="number" min="0" step="1" value={inputs.ductSealQuantity ?? 0} onChange={(e) => setNumber("ductSealQuantity", e.target.value)} />
                    </div>
                    {exactCatalogSelect("su-duct-seal-exact", "ductSeal")}
                    <div className="space-y-2">
                      <Label htmlFor="su-pvc-primer">PVC Primer Qty</Label>
                      <Input id="su-pvc-primer" type="number" min="0" step="1" value={inputs.pvcPrimerQuantity ?? 0} onChange={(e) => setNumber("pvcPrimerQuantity", e.target.value)} />
                    </div>
                    {exactCatalogSelect("su-pvc-primer-exact", "pvcPrimer")}
                    <div className="space-y-2">
                      <Label htmlFor="su-pvc-glue">PVC Glue Qty</Label>
                      <Input id="su-pvc-glue" type="number" min="0" step="1" value={inputs.pvcGlueQuantity ?? 0} onChange={(e) => setNumber("pvcGlueQuantity", e.target.value)} />
                    </div>
                    {exactCatalogSelect("su-pvc-glue-exact", "pvcGlue")}
                    <div className="space-y-2">
                      <Label htmlFor="su-anti-oxidant">Anti-Oxidation Compound Qty</Label>
                      <Input id="su-anti-oxidant" type="number" min="0" step="1" value={inputs.antiOxidantQuantity ?? 0} onChange={(e) => setNumber("antiOxidantQuantity", e.target.value)} />
                    </div>
                    {exactCatalogSelect("su-anti-oxidant-exact", "antiOxidant")}
                    <div className="space-y-2">
                      <Label htmlFor="su-tape">Electrical Tape Qty</Label>
                      <Input id="su-tape" type="number" min="0" step="1" value={inputs.electricalTapeQuantity ?? 0} onChange={(e) => setNumber("electricalTapeQuantity", e.target.value)} />
                    </div>
                    {exactCatalogSelect("su-tape-exact", "electricalTape")}
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
                    <div className="space-y-2">
                      <Label htmlFor="su-util-coord">Utility Coordination Allowance ($)</Label>
                      <Input id="su-util-coord" type="number" min="0" step="1" value={inputs.utilityCoordinationAllowance} onChange={(e) => setNumber("utilityCoordinationAllowance", e.target.value)} />
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
                      <Label htmlFor="su-crew-hours">Hours Per Person</Label>
                      <Input id="su-crew-hours" type="number" min="0" step="0.25" value={inputs.crewHours} onChange={(e) => setNumber("crewHours", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-reloc-labor">Relocation Labor (hr)</Label>
                      <Input id="su-reloc-labor" type="number" min="0" step="0.25" value={inputs.relocationLaborHours ?? 0} onChange={(e) => setNumber("relocationLaborHours", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-access-labor">Access Difficulty Labor (hr)</Label>
                      <Input id="su-access-labor" type="number" min="0" step="0.25" value={inputs.accessDifficultyLaborHours ?? 0} onChange={(e) => setNumber("accessDifficultyLaborHours", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-gnd-labor">Grounding Rework Labor (hr)</Label>
                      <Input id="su-gnd-labor" type="number" min="0" step="0.25" value={inputs.groundingReworkLaborHours ?? 0} onChange={(e) => setNumber("groundingReworkLaborHours", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-fdr-labor">Feeder Distance Labor (hr)</Label>
                      <Input id="su-fdr-labor" type="number" min="0" step="0.25" value={inputs.feederDistanceLaborHours ?? 0} onChange={(e) => setNumber("feederDistanceLaborHours", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-cond-labor">Service Condition Labor (hr)</Label>
                      <Input id="su-cond-labor" type="number" min="0" step="0.25" value={inputs.serviceConditionLaborHours ?? 0} onChange={(e) => setNumber("serviceConditionLaborHours", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-util-labor">Utility Coord Labor (hr)</Label>
                      <Input id="su-util-labor" type="number" min="0" step="0.25" value={inputs.utilityCoordinationLaborHours ?? 0} onChange={(e) => setNumber("utilityCoordinationLaborHours", e.target.value)} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="su-labor-adj">General Labor Adjustment (hr)</Label>
                      <Input id="su-labor-adj" type="number" min="-100" step="0.5" value={inputs.generalLaborAdjustmentHours ?? 0} onChange={(e) => setInputs((c) => ({ ...c, generalLaborAdjustmentHours: Number(e.target.value) || 0 }))} />
                      <p className="text-xs text-muted-foreground">Adds or removes field-assessed labor before pricing. Does not change company defaults.</p>
                    </div>
                  </div>
                  
                  <div className="mt-4 rounded-lg border border-primary/25 bg-primary/5 p-4 text-sm flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-primary block">Calculated Total Person-Hours</span>
                      <span className="text-muted-foreground mt-0.5 block">Baseline: {inputs.crewSize} crew &times; {inputs.crewHours} hours/person</span>
                    </div>
                    <div className="text-2xl font-mono font-bold">
                      {totalPersonHours}
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="mb-4 border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Existing Breaker Inventory</h3>
                  <p className="text-sm text-muted-foreground mb-4">Record existing breakers to transfer. This will generate material requirements for the new panel.</p>

                  <div className="space-y-6">
                    <div>
                      <h4 className="font-medium text-sm mb-3">1-Pole (120V)</h4>
                      <div className="grid grid-cols-5 gap-3 text-xs text-center border-b pb-2">
                        <div className="text-left font-semibold">Amperage</div>
                        <div className="font-semibold">Standard</div>
                        <div className="font-semibold">AFCI</div>
                        <div className="font-semibold">GFCI</div>
                        <div className="font-semibold">Dual Function</div>
                      </div>

                      {[15, 20].map(amp => (
                        <div key={amp} className="grid grid-cols-5 gap-3 items-center py-2 border-b border-border/50">
                          <div className="text-sm font-medium">{amp}A</div>
                          {(["Standard", "AFCI", "GFCI", "Dual Function"] as ExistingBreakerCountProtectionType[]).map(prot => {
                            const key = `${amp}-1-${prot}`
                            return (
                              <div key={prot}>
                                <Input
                                  type="number"
                                  min="0"
                                  className="h-8 text-center"
                                  value={existingBreakersState[key] || ""}
                                  onChange={e => handleExistingBreakerChange(amp, 1, prot, e.target.value)}
                                  placeholder="0"
                                />
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </div>

                    <div>
                      <h4 className="font-medium text-sm mb-3">2-Pole (240V)</h4>
                      <div className="grid grid-cols-5 gap-3 text-xs text-center border-b pb-2">
                        <div className="text-left font-semibold col-span-2">Amperage</div>
                        <div className="font-semibold col-span-2">Standard</div>
                        <div className="font-semibold">GFCI</div>
                      </div>

                      {[30, 40, 50, 60].map(amp => (
                        <div key={amp} className="grid grid-cols-5 gap-3 items-center py-2 border-b border-border/50">
                          <div className="text-sm font-medium col-span-2">{amp}A</div>
                          <div className="col-span-2">
                            <Input
                              type="number"
                              min="0"
                              className="h-8 text-center"
                              value={existingBreakersState[`${amp}-2-Standard`] || ""}
                              onChange={e => handleExistingBreakerChange(amp, 2, "Standard", e.target.value)}
                              placeholder="0"
                            />
                          </div>
                          <div>
                            <Input
                              type="number"
                              min="0"
                              className="h-8 text-center"
                              value={existingBreakersState[`${amp}-2-GFCI`] || ""}
                              onChange={e => handleExistingBreakerChange(amp, 2, "GFCI", e.target.value)}
                              placeholder="0"
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-4 items-center max-w-sm pt-2">
                      <Label htmlFor="su-other-breakers" className="text-sm font-medium">Other Breakers Qty</Label>
                      <Input
                        id="su-other-breakers"
                        type="number"
                        min="0"
                        className="h-8"
                        value={inputs.existingOtherBreakerQuantity || ""}
                        onChange={e => setNumber("existingOtherBreakerQuantity", e.target.value)}
                        placeholder="0"
                      />
                    </div>
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

                      <Button type="submit" className="w-full" size="lg" disabled={!settingsLoaded || !previewIsCurrent || createQuote.isPending}>
                        {createQuote.isPending ? "Creating Quote..." : (!settingsLoaded || !previewIsCurrent) ? "Calculating..." : "Create Quote Snapshot"}
                      </Button>
                      
                      {assembly.length > 0 && (
                        <div className="mt-6">
                          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-secondary-foreground/70">Generated Assembly Preview ({assembly.length})</h4>
                          <div className="max-h-48 overflow-y-auto rounded border border-secondary-border bg-secondary-foreground/5 p-2 text-xs">
                            <ul className="space-y-1 text-secondary-foreground/80">
                              {assembly.map((item, index) => (
                                <li key={index} className="flex justify-between border-b border-secondary-border/50 pb-1 last:border-0 last:pb-0">
                                  <span className="truncate pr-2">{contractorMaterialName(item.description)}</span>
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
