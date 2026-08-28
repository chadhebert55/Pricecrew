import {
  getGetSettingsQueryKey,
  useGetSettings,
  useUpdateSettings,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"

function NumberField({ label, testId, value, onChange, min, step = "0.01" }: { label: string; testId: string; value: string; onChange: (value: string) => void; min: string; step?: string }) {
  return <div className="space-y-2"><Label>{label}</Label><Input data-testid={testId} type="number" min={min} step={step} className="font-mono" value={value} onChange={(event) => onChange(event.target.value)} /></div>
}

function RateTypeField({ label, testId, value, onChange }: { label: string; testId: string; value: string; onChange: (value: "residential" | "commercial") => void }) {
  return <div className="space-y-2"><Label>{label}</Label><select data-testid={testId} value={value} onChange={(event) => onChange(event.target.value as "residential" | "commercial")} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"><option value="residential">Residential</option><option value="commercial">Commercial</option></select></div>
}

export function Settings() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { data: settings, isLoading } = useGetSettings()
  const updateSettings = useUpdateSettings({
    mutation: {
      onSuccess: (updatedSettings) => {
        queryClient.setQueryData(getGetSettingsQueryKey(), updatedSettings)
        toast({ title: "Settings saved", description: "Company defaults and proposal presentation have been updated." })
      },
      onError: (error) => toast({ variant: "destructive", title: "Could not save settings", description: error instanceof Error ? error.message : "Please review the values and try again." }),
    },
  })
  
  const [form, setForm] = useState({
    companyName: "",
    residentialLaborSellRate: "0",
    commercialLaborSellRate: "0",
    loadedLaborCost: "0",
    materialMarkup: "0",
    targetMargin: "0",
    defaultTaxRate: "0",
    evLaborAdjustmentHours: "0",
    evDefaultCableType: "8/3 NM-B",
    bathroomLaborAdjustmentHours: "0",
    kitchenLaborAdjustmentHours: "0",
    additionLaborAdjustmentHours: "0",
    recessedLightingLaborAdjustmentHours: "0",
    serviceUpgradeCrewSize: "2",
    serviceUpgradeHoursPerPerson: "16",
    panelReplacementCrewSize: "2",
    panelReplacementHoursPerPerson: "10",
    serviceCallVisitQuantity: "1",
    serviceCallCrewSize: "1",
    serviceCallHoursPerVisit: "1",
    timeMaterialsCrewSize: "1",
    timeMaterialsHours: "1",
    timeMaterialsLaborRateType: "commercial",
    timeMaterialsLaborSellRate: "0",
    timeMaterialsLoadedLaborCost: "0",
    timeMaterialsMaterialMarkup: "0",
    timeMaterialsTargetMargin: "0",
    customLaborHours: "0",
    customLaborRateType: "commercial",
    customLaborSellRate: "0",
    customLoadedLaborCost: "0",
    customMaterialMarkup: "0",
    customTargetMargin: "0",
    newHouseCrewSize: "2",
    newHouseHoursPerPerson: "80",
    newHouseLaborAdjustmentHours: "0",
    contactPhone: "",
    contactEmail: "",
    contactAddress: "",
    proposalAccentColor: "#2563eb",
    proposalTerms: "",
  })

  useEffect(() => {
    if (settings) {
      setForm({
        companyName: settings.companyName,
        residentialLaborSellRate: settings.residentialLaborSellRate.toString(),
        commercialLaborSellRate: settings.commercialLaborSellRate.toString(),
        loadedLaborCost: settings.loadedLaborCost.toString(),
        materialMarkup: (settings.materialMarkup * 100).toString(),
        targetMargin: (settings.targetMargin * 100).toString(),
        defaultTaxRate: (settings.defaultTaxRate * 100).toString(),
        evLaborAdjustmentHours: settings.evLaborAdjustmentHours.toString(),
        evDefaultCableType: settings.evDefaultCableType,
        bathroomLaborAdjustmentHours: settings.bathroomLaborAdjustmentHours.toString(),
        kitchenLaborAdjustmentHours: settings.kitchenLaborAdjustmentHours.toString(),
        additionLaborAdjustmentHours: settings.additionLaborAdjustmentHours.toString(),
        recessedLightingLaborAdjustmentHours: settings.recessedLightingLaborAdjustmentHours.toString(),
        serviceUpgradeCrewSize: settings.serviceUpgradeCrewSize.toString(),
        serviceUpgradeHoursPerPerson: settings.serviceUpgradeHoursPerPerson.toString(),
        panelReplacementCrewSize: settings.panelReplacementCrewSize.toString(),
        panelReplacementHoursPerPerson: settings.panelReplacementHoursPerPerson.toString(),
        serviceCallVisitQuantity: settings.serviceCallVisitQuantity.toString(),
        serviceCallCrewSize: settings.serviceCallCrewSize.toString(),
        serviceCallHoursPerVisit: settings.serviceCallHoursPerVisit.toString(),
        timeMaterialsCrewSize: settings.timeMaterialsCrewSize.toString(),
        timeMaterialsHours: settings.timeMaterialsHours.toString(),
        timeMaterialsLaborRateType: settings.timeMaterialsLaborRateType,
        timeMaterialsLaborSellRate: settings.timeMaterialsLaborSellRate.toString(),
        timeMaterialsLoadedLaborCost: settings.timeMaterialsLoadedLaborCost.toString(),
        timeMaterialsMaterialMarkup: settings.timeMaterialsMaterialMarkup.toString(),
        timeMaterialsTargetMargin: settings.timeMaterialsTargetMargin.toString(),
        customLaborHours: settings.customLaborHours.toString(),
        customLaborRateType: settings.customLaborRateType,
        customLaborSellRate: settings.customLaborSellRate.toString(),
        customLoadedLaborCost: settings.customLoadedLaborCost.toString(),
        customMaterialMarkup: settings.customMaterialMarkup.toString(),
        customTargetMargin: settings.customTargetMargin.toString(),
        newHouseCrewSize: settings.newHouseCrewSize.toString(),
        newHouseHoursPerPerson: settings.newHouseHoursPerPerson.toString(),
        newHouseLaborAdjustmentHours: settings.newHouseLaborAdjustmentHours.toString(),
        contactPhone: settings.contactPhone ?? "",
        contactEmail: settings.contactEmail ?? "",
        contactAddress: settings.contactAddress ?? "",
        proposalAccentColor: settings.proposalAccentColor,
        proposalTerms: settings.proposalTerms,
      })
    }
  }, [settings])

  const handleSave = () => {
    updateSettings.mutate({
      data: {
        companyName: form.companyName,
        residentialLaborSellRate: parseFloat(form.residentialLaborSellRate),
        commercialLaborSellRate: parseFloat(form.commercialLaborSellRate),
        loadedLaborCost: parseFloat(form.loadedLaborCost),
        materialMarkup: parseFloat(form.materialMarkup) / 100,
        targetMargin: parseFloat(form.targetMargin) / 100,
        defaultTaxRate: parseFloat(form.defaultTaxRate) / 100,
        evLaborAdjustmentHours: parseFloat(form.evLaborAdjustmentHours),
        evDefaultCableType: form.evDefaultCableType as "8/3 NM-B" | "8/2 NM-B" | "6/3 NM-B" | "8/2 SER",
        bathroomLaborAdjustmentHours: parseFloat(form.bathroomLaborAdjustmentHours),
        kitchenLaborAdjustmentHours: parseFloat(form.kitchenLaborAdjustmentHours),
        additionLaborAdjustmentHours: parseFloat(form.additionLaborAdjustmentHours),
        recessedLightingLaborAdjustmentHours: parseFloat(form.recessedLightingLaborAdjustmentHours),
        serviceUpgradeCrewSize: parseInt(form.serviceUpgradeCrewSize, 10),
        serviceUpgradeHoursPerPerson: parseFloat(form.serviceUpgradeHoursPerPerson),
        panelReplacementCrewSize: parseInt(form.panelReplacementCrewSize, 10),
        panelReplacementHoursPerPerson: parseFloat(form.panelReplacementHoursPerPerson),
        serviceCallVisitQuantity: parseInt(form.serviceCallVisitQuantity, 10),
        serviceCallCrewSize: parseInt(form.serviceCallCrewSize, 10),
        serviceCallHoursPerVisit: parseFloat(form.serviceCallHoursPerVisit),
        timeMaterialsCrewSize: parseInt(form.timeMaterialsCrewSize, 10),
        timeMaterialsHours: parseFloat(form.timeMaterialsHours),
        timeMaterialsLaborRateType: form.timeMaterialsLaborRateType as "residential" | "commercial",
        timeMaterialsLaborSellRate: parseFloat(form.timeMaterialsLaborSellRate),
        timeMaterialsLoadedLaborCost: parseFloat(form.timeMaterialsLoadedLaborCost),
        timeMaterialsMaterialMarkup: parseFloat(form.timeMaterialsMaterialMarkup),
        timeMaterialsTargetMargin: parseFloat(form.timeMaterialsTargetMargin),
        customLaborHours: parseFloat(form.customLaborHours),
        customLaborRateType: form.customLaborRateType as "residential" | "commercial",
        customLaborSellRate: parseFloat(form.customLaborSellRate),
        customLoadedLaborCost: parseFloat(form.customLoadedLaborCost),
        customMaterialMarkup: parseFloat(form.customMaterialMarkup),
        customTargetMargin: parseFloat(form.customTargetMargin),
        newHouseCrewSize: parseInt(form.newHouseCrewSize, 10),
        newHouseHoursPerPerson: parseFloat(form.newHouseHoursPerPerson),
        newHouseLaborAdjustmentHours: parseFloat(form.newHouseLaborAdjustmentHours),
        contactPhone: form.contactPhone || null,
        contactEmail: form.contactEmail || null,
        contactAddress: form.contactAddress || null,
        proposalAccentColor: form.proposalAccentColor,
        proposalTerms: form.proposalTerms,
      }
    })
  }

  if (isLoading) return <div className="p-8 animate-pulse text-muted-foreground">Loading settings...</div>

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">Company-wide estimating defaults and rates.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Company Details</CardTitle>
          <CardDescription>Basic information for proposals.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Company Name</Label>
            <Input 
              data-testid="input-company-name"
              value={form.companyName}
              onChange={(e) => setForm(f => ({ ...f, companyName: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Proposal Contact Email</Label><Input data-testid="input-proposal-email" type="email" value={form.contactEmail} onChange={(e) => setForm(f => ({ ...f, contactEmail: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Proposal Contact Phone</Label><Input data-testid="input-proposal-phone" value={form.contactPhone} onChange={(e) => setForm(f => ({ ...f, contactPhone: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Proposal Accent Color</Label><Input data-testid="input-proposal-accent-color" value={form.proposalAccentColor} onChange={(e) => setForm(f => ({ ...f, proposalAccentColor: e.target.value }))} placeholder="#2563eb" /></div>
            <div className="space-y-2"><Label>Proposal Address</Label><Input data-testid="input-proposal-address" value={form.contactAddress} onChange={(e) => setForm(f => ({ ...f, contactAddress: e.target.value }))} /></div>
          </div>
          <div className="space-y-2"><Label>Proposal Terms</Label><textarea data-testid="input-proposal-terms" className="flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.proposalTerms} onChange={(e) => setForm(f => ({ ...f, proposalTerms: e.target.value }))} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Estimating Defaults</CardTitle>
          <CardDescription>Sell rates price customer labor. Loaded labor cost is used only for internal job cost, profit, and margin on new estimates.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Residential Labor Sell Rate ($/hr)</Label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-muted-foreground">$</span>
                <Input 
                  type="number"
                  min="0"
                  step="0.01"
                  className="pl-7 font-mono"
                  value={form.residentialLaborSellRate}
                  onChange={(e) => setForm(f => ({ ...f, residentialLaborSellRate: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Commercial Labor Sell Rate ($/hr)</Label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-muted-foreground">$</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  className="pl-7 font-mono"
                  value={form.commercialLaborSellRate}
                  onChange={(e) => setForm(f => ({ ...f, commercialLaborSellRate: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Loaded Internal Labor Cost ($/hr)</Label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-muted-foreground">$</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  className="pl-7 font-mono"
                  value={form.loadedLaborCost}
                  onChange={(e) => setForm(f => ({ ...f, loadedLaborCost: e.target.value }))}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Target Margin (%)</Label>
              <div className="relative">
                <Input 
                  type="number"
                  className="pr-8 font-mono"
                  value={form.targetMargin}
                  onChange={(e) => setForm(f => ({ ...f, targetMargin: e.target.value }))}
                />
                <span className="absolute right-3 top-2 text-muted-foreground">%</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Default Material Markup (%)</Label>
              <div className="relative">
                <Input 
                  type="number"
                  className="pr-8 font-mono"
                  value={form.materialMarkup}
                  onChange={(e) => setForm(f => ({ ...f, materialMarkup: e.target.value }))}
                />
                <span className="absolute right-3 top-2 text-muted-foreground">%</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Default Tax Rate (%)</Label>
              <div className="relative">
                <Input 
                  type="number"
                  className="pr-8 font-mono"
                  value={form.defaultTaxRate}
                  onChange={(e) => setForm(f => ({ ...f, defaultTaxRate: e.target.value }))}
                />
                <span className="absolute right-3 top-2 text-muted-foreground">%</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Builder Labor Defaults</CardTitle>
          <CardDescription>Independent labor assumptions copied into each new builder quote. Quote edits do not change these company defaults.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>EV Charger Labor Adjustment (hr)</Label>
              <Input
                type="number"
                step="0.25"
                className="font-mono"
                value={form.evLaborAdjustmentHours}
                onChange={(e) => setForm(f => ({ ...f, evLaborAdjustmentHours: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>EV Default Cable Type</Label>
              <select
                value={form.evDefaultCableType}
                onChange={(e) => setForm(f => ({ ...f, evDefaultCableType: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              >
                <option value="8/3 NM-B">8/3 NM-B</option>
                <option value="8/2 NM-B">8/2 NM-B</option>
                <option value="6/3 NM-B">6/3 NM-B</option>
                <option value="8/2 SER">8/2 SER</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Bathroom Labor Adjustment (hr)</Label>
              <Input
                type="number"
                step="0.25"
                className="font-mono"
                value={form.bathroomLaborAdjustmentHours}
                onChange={(e) => setForm(f => ({ ...f, bathroomLaborAdjustmentHours: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Kitchen Labor Adjustment (hr)</Label>
              <Input
                type="number"
                step="0.25"
                className="font-mono"
                value={form.kitchenLaborAdjustmentHours}
                onChange={(e) => setForm(f => ({ ...f, kitchenLaborAdjustmentHours: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Addition Labor Adjustment (hr)</Label>
              <Input
                type="number"
                step="0.25"
                className="font-mono"
                value={form.additionLaborAdjustmentHours}
                onChange={(e) => setForm(f => ({ ...f, additionLaborAdjustmentHours: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Recessed Lighting Labor Adj. (hr)</Label>
              <Input
                type="number"
                step="0.25"
                className="font-mono"
                value={form.recessedLightingLaborAdjustmentHours}
                onChange={(e) => setForm(f => ({ ...f, recessedLightingLaborAdjustmentHours: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Service Upgrade Crew Size</Label>
              <Input
                type="number"
                min="1"
                step="1"
                className="font-mono"
                value={form.serviceUpgradeCrewSize}
                onChange={(e) => setForm(f => ({ ...f, serviceUpgradeCrewSize: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Service Upgrade Hours Per Person</Label>
              <Input
                type="number"
                min="0"
                step="0.25"
                className="font-mono"
                value={form.serviceUpgradeHoursPerPerson}
                onChange={(e) => setForm(f => ({ ...f, serviceUpgradeHoursPerPerson: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Panel Replacement Crew Size</Label>
              <Input
                type="number"
                min="1"
                step="1"
                className="font-mono"
                value={form.panelReplacementCrewSize}
                onChange={(e) => setForm(f => ({ ...f, panelReplacementCrewSize: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Panel Replacement Hours Per Person</Label>
              <Input
                type="number"
                min="0"
                step="0.25"
                className="font-mono"
                value={form.panelReplacementHoursPerPerson}
                onChange={(e) => setForm(f => ({ ...f, panelReplacementHoursPerPerson: e.target.value }))}
              />
            </div>
            <div className="col-span-2 pt-3"><h3 className="font-semibold">Service Call Defaults</h3><p className="text-sm text-muted-foreground">Copied into new Service Call quotes.</p></div>
            <NumberField label="Visits" testId="input-service-call-visits" value={form.serviceCallVisitQuantity} onChange={(value) => setForm(f => ({ ...f, serviceCallVisitQuantity: value }))} min="1" step="1" />
            <NumberField label="Crew Size" testId="input-service-call-crew-size" value={form.serviceCallCrewSize} onChange={(value) => setForm(f => ({ ...f, serviceCallCrewSize: value }))} min="1" step="1" />
            <NumberField label="Hours Per Visit" testId="input-service-call-hours" value={form.serviceCallHoursPerVisit} onChange={(value) => setForm(f => ({ ...f, serviceCallHoursPerVisit: value }))} min="0" />
            <div className="col-span-2 pt-3"><h3 className="font-semibold">Time &amp; Materials Defaults</h3><p className="text-sm text-muted-foreground">Copied into new Time &amp; Materials quotes.</p></div>
            <NumberField label="Crew Size" testId="input-time-materials-crew-size" value={form.timeMaterialsCrewSize} onChange={(value) => setForm(f => ({ ...f, timeMaterialsCrewSize: value }))} min="1" step="1" />
            <NumberField label="Labor Hours" testId="input-time-materials-hours" value={form.timeMaterialsHours} onChange={(value) => setForm(f => ({ ...f, timeMaterialsHours: value }))} min="0" />
            <RateTypeField label="Labor Rate Type" testId="select-time-materials-rate-type" value={form.timeMaterialsLaborRateType} onChange={(value) => setForm(f => ({ ...f, timeMaterialsLaborRateType: value }))} />
            <NumberField label="Labor Sell Rate ($/hr)" testId="input-time-materials-sell-rate" value={form.timeMaterialsLaborSellRate} onChange={(value) => setForm(f => ({ ...f, timeMaterialsLaborSellRate: value }))} min="0" />
            <NumberField label="Loaded Labor Cost ($/hr)" testId="input-time-materials-loaded-cost" value={form.timeMaterialsLoadedLaborCost} onChange={(value) => setForm(f => ({ ...f, timeMaterialsLoadedLaborCost: value }))} min="0" />
            <NumberField label="Material Markup (%)" testId="input-time-materials-markup" value={form.timeMaterialsMaterialMarkup} onChange={(value) => setForm(f => ({ ...f, timeMaterialsMaterialMarkup: value }))} min="0" />
            <NumberField label="Target Margin (%)" testId="input-time-materials-margin" value={form.timeMaterialsTargetMargin} onChange={(value) => setForm(f => ({ ...f, timeMaterialsTargetMargin: value }))} min="0" />
            <div className="col-span-2 pt-3"><h3 className="font-semibold">Custom Items Defaults</h3><p className="text-sm text-muted-foreground">Copied into new Custom Items quotes.</p></div>
            <NumberField label="Labor Hours" testId="input-custom-hours" value={form.customLaborHours} onChange={(value) => setForm(f => ({ ...f, customLaborHours: value }))} min="0" />
            <RateTypeField label="Labor Rate Type" testId="select-custom-rate-type" value={form.customLaborRateType} onChange={(value) => setForm(f => ({ ...f, customLaborRateType: value }))} />
            <NumberField label="Labor Sell Rate ($/hr)" testId="input-custom-sell-rate" value={form.customLaborSellRate} onChange={(value) => setForm(f => ({ ...f, customLaborSellRate: value }))} min="0" />
            <NumberField label="Loaded Labor Cost ($/hr)" testId="input-custom-loaded-cost" value={form.customLoadedLaborCost} onChange={(value) => setForm(f => ({ ...f, customLoadedLaborCost: value }))} min="0" />
            <NumberField label="Material Markup (%)" testId="input-custom-markup" value={form.customMaterialMarkup} onChange={(value) => setForm(f => ({ ...f, customMaterialMarkup: value }))} min="0" />
            <NumberField label="Target Margin (%)" testId="input-custom-margin" value={form.customTargetMargin} onChange={(value) => setForm(f => ({ ...f, customTargetMargin: value }))} min="0" />
            <div className="col-span-2 pt-3"><h3 className="font-semibold">New House Defaults</h3><p className="text-sm text-muted-foreground">Copied into new New House quotes. Scope quantities and footage remain quote-specific.</p></div>
            <NumberField label="Crew Size" testId="input-new-house-crew-size" value={form.newHouseCrewSize} onChange={(value) => setForm(f => ({ ...f, newHouseCrewSize: value }))} min="1" step="1" />
            <NumberField label="Hours Per Person" testId="input-new-house-hours" value={form.newHouseHoursPerPerson} onChange={(value) => setForm(f => ({ ...f, newHouseHoursPerPerson: value }))} min="0" />
            <NumberField label="Labor Adjustment (hr)" testId="input-new-house-labor-adjustment" value={form.newHouseLaborAdjustmentHours} onChange={(value) => setForm(f => ({ ...f, newHouseLaborAdjustmentHours: value }))} min="0" />
          </div>

          <div className="pt-4 flex justify-end">
            <Button data-testid="button-save-settings" onClick={handleSave} disabled={updateSettings.isPending}>
              {updateSettings.isPending ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
