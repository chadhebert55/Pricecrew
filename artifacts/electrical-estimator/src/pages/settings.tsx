import { useGetSettings, useUpdateSettings } from "@workspace/api-client-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { useState, useEffect } from "react"

export function Settings() {
  const { data: settings, isLoading } = useGetSettings()
  const updateSettings = useUpdateSettings()
  
  const [form, setForm] = useState({
    companyName: "",
    laborRate: "0",
    materialMarkup: "0",
    targetMargin: "0",
    defaultTaxRate: "0"
  })

  useEffect(() => {
    if (settings) {
      setForm({
        companyName: settings.companyName,
        laborRate: settings.laborRate.toString(),
        materialMarkup: (settings.materialMarkup * 100).toString(),
        targetMargin: (settings.targetMargin * 100).toString(),
        defaultTaxRate: (settings.defaultTaxRate * 100).toString(),
      })
    }
  }, [settings])

  const handleSave = () => {
    updateSettings.mutate({
      data: {
        companyName: form.companyName,
        laborRate: parseFloat(form.laborRate),
        materialMarkup: parseFloat(form.materialMarkup) / 100,
        targetMargin: parseFloat(form.targetMargin) / 100,
        defaultTaxRate: parseFloat(form.defaultTaxRate) / 100
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
          <CardDescription>These rates apply to all new quotes automatically.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Base Labor Rate ($/hr)</Label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-muted-foreground">$</span>
                <Input 
                  type="number"
                  className="pl-7 font-mono"
                  value={form.laborRate}
                  onChange={(e) => setForm(f => ({ ...f, laborRate: e.target.value }))}
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
