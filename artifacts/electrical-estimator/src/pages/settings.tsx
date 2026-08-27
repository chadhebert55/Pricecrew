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

export function Settings() {
  const queryClient = useQueryClient()
  const { data: settings, isLoading } = useGetSettings()
  const updateSettings = useUpdateSettings({
    mutation: {
      onSuccess: (updatedSettings) => {
        queryClient.setQueryData(getGetSettingsQueryKey(), updatedSettings)
      },
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
    recessedLightingLaborAdjustmentHours: "0",
    serviceUpgradeCrewSize: "2",
    serviceUpgradeHoursPerPerson: "16",
    panelReplacementCrewSize: "2",
    panelReplacementHoursPerPerson: "10",
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
        recessedLightingLaborAdjustmentHours: settings.recessedLightingLaborAdjustmentHours.toString(),
        serviceUpgradeCrewSize: settings.serviceUpgradeCrewSize.toString(),
        serviceUpgradeHoursPerPerson: settings.serviceUpgradeHoursPerPerson.toString(),
        panelReplacementCrewSize: settings.panelReplacementCrewSize.toString(),
        panelReplacementHoursPerPerson: settings.panelReplacementHoursPerPerson.toString(),
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
        recessedLightingLaborAdjustmentHours: parseFloat(form.recessedLightingLaborAdjustmentHours),
        serviceUpgradeCrewSize: parseInt(form.serviceUpgradeCrewSize, 10),
        serviceUpgradeHoursPerPerson: parseFloat(form.serviceUpgradeHoursPerPerson),
        panelReplacementCrewSize: parseInt(form.panelReplacementCrewSize, 10),
        panelReplacementHoursPerPerson: parseFloat(form.panelReplacementHoursPerPerson),
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
              value={form.companyName}
              onChange={(e) => setForm(f => ({ ...f, companyName: e.target.value }))}
            />
          </div>
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
          </div>

          <div className="pt-4 flex justify-end">
            <Button onClick={handleSave} disabled={updateSettings.isPending}>
              {updateSettings.isPending ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
