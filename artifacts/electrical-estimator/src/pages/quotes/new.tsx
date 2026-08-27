import { type EvChargerInputs, useCreateQuote, usePreviewQuote, useGetSettings } from "@workspace/api-client-react"
import { pricingWarningKey, pricingWarningMessage } from "@/lib/pricing-warnings"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useEffect, useState } from "react"
import { useLocation } from "wouter"
import { Zap, Calculator, Info, TriangleAlert } from "lucide-react"

function BasicSelect({ value, onChange, options, id }: { value: string, onChange: (v: string) => void, options: {label: string, value: string}[], id?: string }) {
  return (
    <select 
      id={id}
      value={value} 
      onChange={e => onChange(e.target.value)}
      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    >
      <option value="" disabled>Select option...</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export function NewQuote() {
  const [_, setLocation] = useLocation()
  const createQuote = useCreateQuote()
  const previewQuote = usePreviewQuote()
  const { data: settings } = useGetSettings()
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [previewedInputKey, setPreviewedInputKey] = useState("")
  
  // Base details
  const [customerName, setCustomerName] = useState("")
  const [customerEmail, setCustomerEmail] = useState("")
  const [projectName, setProjectName] = useState("")
  const [proposalDescription, setProposalDescription] = useState("Provide and install dedicated 240V circuit for Level 2 EV charging equipment. Includes proper wire sizing, conduit/routing, and required overcurrent protection to meet NEC standards and manufacturer specifications.")
  
  // EV Charger Inputs - completely covering schema
  const [inputs, setInputs] = useState<EvChargerInputs>({
    chargerQuantity: 1,
    chargerOutputAmps: 40,
    circuitAmps: "Auto", 
    chargerSupply: "Customer Provided",
    connection: "Hardwired",
    routeLength: 15,
    wiringMethod: "SER Cable",
    location: "Indoor",
    panelManufacturer: "Siemens",
    panelSpace: "Available",
    breakerRequirement: "GFCI 2-Pole",
    access: "Standard",
    permit: "Required",
    loadManagement: "None",
    disconnect: "Not Required",
    surgeProtection: "None",
    panelModifications: "None",
    difficulty: "Standard",
    notes: "Trade default: 50A circuit, #8 wire. Future service upgrade ref: 3 x 4/0 XHHW for mast work.",
    laborRateType: "residential",
    laborAdjustmentHours: 0,
  })

  useEffect(() => {
    if (settings && !settingsLoaded) {
      setInputs(current => ({
        ...current,
        laborAdjustmentHours: settings.evLaborAdjustmentHours ?? 0,
      }))
      setSettingsLoaded(true)
    }
  }, [settings, settingsLoaded])

  const currentInputKey = JSON.stringify(inputs)
  const previewIsCurrent = previewedInputKey === currentInputKey

  useEffect(() => {
    if (!settingsLoaded) return
    const inputKey = JSON.stringify(inputs)
    const timeout = window.setTimeout(() => {
      previewQuote.mutate({
        data: {
          module: "EV_CHARGER",
          jobInputs: inputs,
        },
      }, {
        onSuccess: () => setPreviewedInputKey(inputKey),
      })
    }, 250)

    return () => window.clearTimeout(timeout)
  }, [inputs, settingsLoaded])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!settingsLoaded || !previewIsCurrent) return

    createQuote.mutate({
      data: {
        customerName,
        customerEmail: customerEmail || null,
        projectName,
        module: "EV_CHARGER",
        proposalDescription,
        jobInputs: inputs,
      }
    }, {
      onSuccess: (quote) => {
        setLocation(`/quotes/${quote.id}`)
      }
    })
  }

  const previewPricing = previewQuote.data?.pricing
  const totalCost = previewPricing
    ? previewPricing.materialCost + previewPricing.laborCost
    : 0

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-24">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">New Quote</h1>
        <p className="text-muted-foreground mt-1">EV Charger Installation Builder</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Left Column: Form Inputs */}
          <div className="xl:col-span-2 space-y-6">
            
            {/* Project Details */}
            <Card className="border-t-4 border-t-secondary">
              <CardHeader>
                <CardTitle>Project Details</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="customerName">Customer Name *</Label>
                  <Input 
                    id="customerName" 
                    required 
                    value={customerName} 
                    onChange={e => setCustomerName(e.target.value)} 
                    placeholder="e.g. John Doe"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customerEmail">Customer Email</Label>
                  <Input 
                    id="customerEmail" 
                    type="email" 
                    value={customerEmail} 
                    onChange={e => setCustomerEmail(e.target.value)} 
                    placeholder="john@example.com"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="projectName">Project Name *</Label>
                  <Input 
                    id="projectName" 
                    required 
                    value={projectName} 
                    onChange={e => setProjectName(e.target.value)} 
                    placeholder="e.g. Tesla Model 3 Charger Install"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="proposalDesc">Proposal Description</Label>
                  <Textarea 
                    id="proposalDesc" 
                    required 
                    value={proposalDescription} 
                    onChange={e => setProposalDescription(e.target.value)} 
                  />
                </div>
              </CardContent>
            </Card>

            {/* Builder Inputs */}
            <Card className="border-t-4 border-t-primary shadow-md">
              <CardHeader className="bg-primary/5 border-b border-primary/10 pb-4">
                <div className="flex items-center gap-2">
                  <Zap className="text-primary" size={20} />
                  <CardTitle className="text-xl">Parametric Builder: EV Charger</CardTitle>
                </div>
                <CardDescription className="text-primary/80 font-medium">
                  Configure the installation to dynamically generate materials and labor.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-8">
                
                {/* Equipment & Electrical */}
                <div>
                  <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 border-b pb-2">Equipment & Electrical</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <Label>Labor Sell Rate</Label>
                      <BasicSelect
                        value={inputs.laborRateType ?? "residential"}
                        onChange={v => setInputs({...inputs, laborRateType: v as EvChargerInputs["laborRateType"]})}
                        options={[
                          {value: "residential", label: "Residential"},
                          {value: "commercial", label: "Commercial"},
                        ]}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Charger Quantity</Label>
                      <Input 
                        type="number" 
                        min="1"
                        value={inputs.chargerQuantity} 
                        onChange={e => setInputs({...inputs, chargerQuantity: parseInt(e.target.value) || 1})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Charger Output (Amps)</Label>
                      <Input 
                        type="number" 
                        value={inputs.chargerOutputAmps} 
                        onChange={e => setInputs({...inputs, chargerOutputAmps: parseInt(e.target.value) || 0})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Circuit Amps</Label>
                      <BasicSelect 
                        value={inputs.circuitAmps} 
                        onChange={v => setInputs({...inputs, circuitAmps: v})}
                        options={[
                          {value: "Auto", label: "Auto (Default 50A)"},
                          {value: "20A", label: "20A"},
                          {value: "30A", label: "30A"},
                          {value: "40A", label: "40A"},
                          {value: "50A", label: "50A"},
                          {value: "60A", label: "60A"},
                        ]}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Charger Supply</Label>
                      <BasicSelect 
                        value={inputs.chargerSupply} 
                        onChange={v => setInputs({...inputs, chargerSupply: v})}
                        options={[
                          {value: "Customer Provided", label: "Customer Provided"},
                          {value: "Contractor Provided", label: "Contractor Provided"},
                        ]}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Connection Type</Label>
                      <BasicSelect 
                        value={inputs.connection} 
                        onChange={v => setInputs({...inputs, connection: v})}
                        options={[
                          {value: "Hardwired", label: "Hardwired"},
                          {value: "NEMA 14-50 Receptacle", label: "NEMA 14-50 Receptacle"},
                          {value: "NEMA 6-50 Receptacle", label: "NEMA 6-50 Receptacle"},
                        ]}
                      />
                    </div>
                  </div>
                </div>

                {/* Routing & Location */}
                <div>
                  <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 border-b pb-2">Routing & Location</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <Label>Route Length (One-way FT)</Label>
                      <Input 
                        type="number" 
                        value={inputs.routeLength} 
                        onChange={e => setInputs({...inputs, routeLength: parseInt(e.target.value) || 0})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Wiring Method</Label>
                      <BasicSelect 
                        value={inputs.wiringMethod} 
                        onChange={v => setInputs({...inputs, wiringMethod: v})}
                        options={[
                          {value: "SER Cable", label: "SER Cable (Concealed)"},
                          {value: "EMT Conduit", label: "EMT Conduit"},
                          {value: "PVC Conduit", label: "PVC Conduit"},
                          {value: "MC Cable", label: "MC Cable"},
                          {value: "Romex (NM-B)", label: "Romex (NM-B)"}
                        ]}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Location</Label>
                      <BasicSelect 
                        value={inputs.location} 
                        onChange={v => setInputs({...inputs, location: v})}
                        options={[
                          {value: "Indoor", label: "Indoor (Garage)"},
                          {value: "Outdoor", label: "Outdoor (Exterior Wall)"},
                          {value: "Post/Pedestal", label: "Post/Pedestal"},
                        ]}
                      />
                    </div>
                  </div>
                </div>

                {/* Panel & Service */}
                <div>
                  <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 border-b pb-2">Panel & Service</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <Label>Panel Manufacturer</Label>
                      <BasicSelect 
                        value={inputs.panelManufacturer} 
                        onChange={v => setInputs({...inputs, panelManufacturer: v})}
                        options={[
                          {value: "Square D", label: "Square D"},
                          {value: "Siemens", label: "Siemens"},
                          {value: "Eaton", label: "Eaton"},
                          {value: "GE", label: "GE"},
                          {value: "Other", label: "Other"},
                        ]}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Panel Space</Label>
                      <BasicSelect 
                        value={inputs.panelSpace} 
                        onChange={v => setInputs({...inputs, panelSpace: v})}
                        options={[
                          {value: "Available", label: "Available (Full Size)"},
                          {value: "Needs Tandems", label: "Needs Tandems"},
                          {value: "Full", label: "Full - Needs Subpanel"},
                        ]}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Breaker Requirement</Label>
                      <BasicSelect 
                        value={inputs.breakerRequirement} 
                        onChange={v => setInputs({...inputs, breakerRequirement: v})}
                        options={[
                          {value: "Standard 2-Pole", label: "Standard 2-Pole"},
                          {value: "GFCI 2-Pole", label: "GFCI 2-Pole"},
                          {value: "AFCI 2-Pole", label: "AFCI 2-Pole"},
                          {value: "Dual Function 2-Pole", label: "Dual Function 2-Pole"},
                        ]}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Load Management</Label>
                      <BasicSelect 
                        value={inputs.loadManagement} 
                        onChange={v => setInputs({...inputs, loadManagement: v})}
                        options={[
                          {value: "None", label: "None Required"},
                          {value: "DCC-9", label: "DCC-9 Energy Manager"},
                          {value: "Simple Share", label: "Simple Load Share"},
                        ]}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Surge Protection</Label>
                      <BasicSelect 
                        value={inputs.surgeProtection} 
                        onChange={v => setInputs({...inputs, surgeProtection: v})}
                        options={[
                          {value: "None", label: "None"},
                          {value: "Whole House", label: "Whole House SPD"},
                          {value: "Local", label: "Local Disconnect SPD"},
                        ]}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Panel Modifications</Label>
                      <BasicSelect 
                        value={inputs.panelModifications} 
                        onChange={v => setInputs({...inputs, panelModifications: v})}
                        options={[
                          {value: "None", label: "None"},
                          {value: "Consolidate Breakers", label: "Consolidate Breakers"},
                          {value: "Subpanel Needed", label: "Subpanel Needed"},
                        ]}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Disconnect</Label>
                      <BasicSelect 
                        value={inputs.disconnect} 
                        onChange={v => setInputs({...inputs, disconnect: v})}
                        options={[
                          {value: "Not Required", label: "Not Required"},
                          {value: "Non-Fused 60A", label: "Non-Fused 60A"},
                          {value: "Fused 60A", label: "Fused 60A"},
                        ]}
                      />
                    </div>
                  </div>
                </div>

                {/* Scope & Complexity */}
                <div>
                  <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 border-b pb-2">Scope & Complexity</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <Label>Access Conditions</Label>
                      <BasicSelect 
                        value={inputs.access} 
                        onChange={v => setInputs({...inputs, access: v})}
                        options={[
                          {value: "Standard", label: "Standard / Open"},
                          {value: "Hard", label: "Hard (Crawlspace/Attic)"},
                          {value: "Extreme", label: "Extreme (Trenching/Drywall)"},
                        ]}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Difficulty</Label>
                      <BasicSelect 
                        value={inputs.difficulty} 
                        onChange={v => setInputs({...inputs, difficulty: v})}
                        options={[
                          {value: "Standard", label: "Standard"},
                          {value: "Hard", label: "Hard"},
                          {value: "Extreme", label: "Extreme"},
                        ]}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Permit Requirement</Label>
                      <BasicSelect 
                        value={inputs.permit} 
                        onChange={v => setInputs({...inputs, permit: v})}
                        options={[
                          {value: "Required", label: "Required (Include Fee)"},
                          {value: "Not Required", label: "Not Required"},
                        ]}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Labor Adjustment (Hours)</Label>
                      <Input
                        type="number"
                        step="0.25"
                        value={inputs.laborAdjustmentHours ?? 0}
                        onChange={e => setInputs({...inputs, laborAdjustmentHours: parseFloat(e.target.value) || 0})}
                      />
                      <p className="text-xs text-muted-foreground">Adds or removes field-assessed labor before pricing. Does not change company defaults.</p>
                    </div>
                  </div>
                  <div className="space-y-2 pt-6">
                    <Label>Estimator Notes (Internal)</Label>
                    <Textarea 
                      value={inputs.notes}
                      onChange={e => setInputs({...inputs, notes: e.target.value})}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>

              </CardContent>
            </Card>
          </div>

          {/* Right Column: Sticky Preview */}
          <div className="space-y-6 relative">
            <div className="sticky top-6">
              <Card className="border-primary bg-secondary text-secondary-foreground shadow-lg">
                <CardHeader className="pb-4 border-b border-secondary-border">
                  <div className="flex items-center gap-2">
                    <Calculator className="text-primary" size={20} />
                    <CardTitle className="text-secondary-foreground">Calculation Preview</CardTitle>
                  </div>
                  <CardDescription className="text-secondary-foreground/70">
                    Server-calculated using current company settings and price book.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  
                  <div className="bg-primary/10 border border-primary/20 rounded-md p-3 text-sm flex items-start gap-3">
                    <Info className="text-primary shrink-0 mt-0.5" size={16} />
                    <div className="space-y-1">
                      <p className="font-semibold text-primary">Starter Assumptions Applied</p>
                      <p className="text-secondary-foreground/80 leading-snug">
                        <strong>Auto</strong> sets a 50A circuit with #8 wire. Service upgrade references apply 3 x 4/0 XHHW for mast work if triggered.
                      </p>
                    </div>
                  </div>
                  
                  {!previewPricing || !previewIsCurrent ? (
                    <div className="py-8 text-center text-sm text-secondary-foreground/70 animate-pulse">
                      Updating authoritative estimate...
                    </div>
                  ) : (
                    <>
                      {previewPricing.pricingWarnings.length > 0 && (
                        <div className="space-y-2 rounded-md border border-amber-400/40 bg-amber-400/10 p-3">
                          <div className="flex items-center gap-2 text-sm font-semibold text-amber-300">
                            <TriangleAlert size={16} />
                            Pricing needs confirmation
                          </div>
                          <ul className="space-y-1 pl-6 text-xs text-secondary-foreground/80 list-disc">
                            {previewPricing.pricingWarnings.map((warning, index) => (
                              <li key={pricingWarningKey(warning, index)}>{pricingWarningMessage(warning)}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="space-y-3">
                        <div className="flex justify-between items-center text-sm text-secondary-foreground/80">
                          <span>Material Cost</span>
                          <span className="font-mono">${previewPricing.materialCost.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm text-secondary-foreground/80">
                          <span>Loaded Internal Labor Cost</span>
                          <span className="font-mono">${previewPricing.laborCost.toFixed(2)}</span>
                        </div>
                        {previewPricing.laborSellAmount !== undefined && (
                          <div className="flex justify-between items-center text-sm text-secondary-foreground/80">
                            <span>Customer Labor ({previewPricing.laborRateType} @ ${previewPricing.laborSellRate?.toFixed(2)}/hr)</span>
                            <span className="font-mono">${previewPricing.laborSellAmount.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="border-t border-secondary-border pt-3 flex justify-between items-center font-bold">
                          <span>Total Cost</span>
                          <span className="font-mono">${totalCost.toFixed(2)}</span>
                        </div>
                      </div>
                    </>
                  )}
                  
                  <div className="pt-4 border-t border-secondary-border flex flex-col gap-1">
                    <span className="text-xs text-secondary-foreground/60 uppercase tracking-wider">Calculated Selling Price</span>
                    <span className="text-4xl font-bold font-mono text-primary tracking-tight">
                      {previewPricing && previewIsCurrent
                        ? `$${previewPricing.finalSellingPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : "—"}
                    </span>
                  </div>

                  <p className="text-xs text-secondary-foreground/50 leading-relaxed pt-2 border-t border-secondary-border mt-4">
                    This preview uses the same server estimator as quote creation. Saved assemblies and calculated pricing remain fixed unless an explicit override is entered later.
                  </p>

                  {previewQuote.isError && (
                    <p className="text-sm text-destructive">
                      The estimate preview could not be calculated. Check the inputs and try again.
                    </p>
                  )}

                  <Button type="submit" size="lg" disabled={!settingsLoaded || createQuote.isPending || !previewIsCurrent || previewQuote.isError} className="w-full font-bold text-lg mt-4">
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
