import type { KitchenInputs, PricingSummary } from "@workspace/api-client-react"
import { kitchenCircuitFields, kitchenCircuitPlan, defaultCircuit, breakerRequirements, type RemodelCircuit } from "@workspace/api-zod/remodel-circuits"
import { BuilderSection, NumberField, SelectField, CircuitFields, LaborSummary } from "./remodel-builder"
import { Checkbox } from "./ui/checkbox"
import { Textarea } from "./ui/textarea"
import { Label } from "./ui/label"
import { Button } from "./ui/button"

export function KitchenBuilderFields({inputs:i,onChange:set,pricing}: {inputs:KitchenInputs;onChange:(i:KitchenInputs)=>void;pricing?:PricingSummary}) {
  const put = (key:keyof KitchenInputs,value:unknown)=>set({...i,[key]:value})
  const rows = kitchenCircuitPlan(i)
  const extras = i.additionalBreakers ?? [0,1,2].map(n=>defaultCircuit(`extra-${n}`,"Additional breaker"))
  const updateCircuit = (c:RemodelCircuit) => {
    set({...i, ...(c.key !== "lighting" ? {[c.key]: c.quantity} : {}),
      circuitConfigurations: [...(i.circuitConfigurations ?? []).filter(x=>x.key!==c.key),c] as KitchenInputs["circuitConfigurations"]})
  }
  const quantity = (key:keyof KitchenInputs,label:string,help?:string)=><NumberField key={key} id={`kitchen-${key}`} label={label} value={Number(i[key] ?? 0)} quantity onChange={v=>put(key,v)} help={help}/>
  const supplied = (key:"customerSuppliedFixtures"|"customerSuppliedRecessedLights",label:string)=><label className="flex items-center gap-3 text-sm"><Checkbox checked={!!i[key]} onCheckedChange={v=>put(key,v===true)}/>{label}</label>
  const total = rows.reduce((s,c)=>s+c.quantity,0)
  return <>
    {i.circuitConfigurationVersion !== 2 && <div className="rounded-lg border border-amber-500 p-4 text-sm">
      <p>This recovered estimate uses the legacy circuit calculation. Its inputs have been preserved. Review the conversion before generating a new quote.</p>
      <Button className="mt-3" type="button" onClick={()=>set({...i,circuitConfigurationVersion:2,
        customerSuppliedRecessedLights:i.customerSuppliedFixtures,
        smallApplianceCircuits:i.smallApplianceCircuits ?? Number(!!i.smallApplianceCircuit1)+Number(!!i.smallApplianceCircuit2),
        microwaveCircuits:i.microwaveCircuits ?? Number(!!i.microwaveCircuit)})}>Use improved circuit calculations</Button>
    </div>}
    <div className="rounded-lg border bg-primary/5 p-4 text-sm" aria-label="Kitchen Summary">
      <strong>Kitchen Summary</strong>
      <p className="mt-2">{total} circuits · {total+extras.reduce((s,c)=>s+c.quantity,0)} breakers · {i.countertopReceptacles+i.usbReceptacles} receptacles · {i.threeWayOptions*2+(i.fourWayLocations ?? 0)+i.dimmers+(i.smartSwitches ?? 0)} controls · {i.recessedLights} recessed lights</p>
      <p className="mt-1 text-xs">Home-run wiring: {rows.reduce((s,c)=>s+(c.routeLength ?? 0)*c.quantity,0)} FT, separated by cable below. {pricing ? `Materials: $${pricing.materialCost.toFixed(2)} · Selling Price: $${pricing.finalSellingPrice.toFixed(2)}` : "Updating pricing…"}</p>
      <div className="mt-2"><LaborSummary pricing={pricing}/></div>
    </div>
    <BuilderSection title="Appliance Circuits" summary={`${total} configured circuits, including lighting`} open>
      <NumberField id="kitchen-home-run" label="Default appliance home run (FT per circuit)" value={i.applianceHomeRun12_2Length ?? 0} onChange={v=>put("applianceHomeRun12_2Length",v)} help="Applies to every appliance circuit unless its own route is entered. Lighting uses its separate route. Branch interconnect wiring is separate."/>
      <div className="space-y-3">{kitchenCircuitFields.map(([key,label])=>{
        const saved=i.circuitConfigurations?.find(c=>c.key===key)
        const c={...defaultCircuit(key,label),protectionType:i.breaker20AProtectionType ?? "Dual Function",...(key==="electricRangeCircuits" || key==="wallOvenCircuits" ? {protectionType:"Standard"} : {}),...saved,quantity:Number(i[key] ?? 0)}
        return <CircuitFields key={key} id={`kitchen-${key}`} circuit={c} defaultLength={i.applianceHomeRun12_2Length} onChange={updateCircuit}/>
      })}</div>
      <p className="text-xs text-muted-foreground">Sizing and connection methods are estimating assumptions. Verify equipment specifications and field conditions. A 60A selection requires an appropriate larger cable; incompatible selections block readiness.</p>
    </BuilderSection>
    <BuilderSection title="Breakers" summary={`${total} automatic + ${extras.reduce((s,c)=>s+c.quantity,0)} additional`}>
      <SelectField id="kitchen-manufacturer" label="Panel manufacturer" value={i.panelManufacturer ?? "Siemens"} options={["Siemens","Eaton","Square D"]} onChange={v=>put("panelManufacturer",v)}/>
      <div className="space-y-2 text-sm">{breakerRequirements(rows).map(b=><p key={b.key}>{b.quantity} × {b.amperage}A {b.poleCount}-pole {b.protectionType}</p>)}</div>
      <p className="text-xs text-muted-foreground">Automatically derived from circuits above. Countertop devices do not add another breaker on top of their small-appliance circuits. Additional breakers below add breakers and installation labor only, not another cable run.</p>
      {extras.map((b,n)=><CircuitFields key={b.key} id={`kitchen-extra-${n}`} breakerOnly circuit={b} onChange={c=>put("additionalBreakers",extras.map((x,k)=>k===n?c:x))}/>)}
    </BuilderSection>
    <BuilderSection title="Devices & Controls" summary={`${i.countertopReceptacles+i.usbReceptacles} receptacles`}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {quantity("countertopReceptacles","Countertop receptacles")}{quantity("usbReceptacles","USB receptacles")}
        <div className="space-y-4">{quantity("threeWayOptions","3-way control pairs","Two 3-way switches per pair.")}{quantity("fourWayLocations","4-way switch locations")}
          <NumberField id="kitchen-four-way-cable" label="4-way traveler cable (FT total, 14/3)" value={i.fourWayCableFootage ?? 0} onChange={v=>put("fourWayCableFootage",v)}/>
        </div>
        <div className="space-y-4">{quantity("dimmers","Dimmers")}{quantity("smartSwitches","Smart switches","Uses company smart switch catalog cost; missing prices stay unresolved.")}</div>
      </div>
    </BuilderSection>
    <BuilderSection title="Lighting" summary={`${i.sinkLights+i.islandPendants+i.undercabinetLighting+i.recessedLights} lighting locations`}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{quantity("sinkLights","Sink lights")}{quantity("islandPendants","Island pendants")}{quantity("undercabinetLighting","Undercabinet lighting")}{quantity("recessedLights","Recessed lights")}</div>
      <SelectField id="kitchen-recessed-size" label="Recessed light size" value={i.recessedLightSize ?? "4-inch"} options={["4-inch","6-inch"]} onChange={v=>put("recessedLightSize",v)}/>
      <label className="flex items-center gap-3 text-sm"><Checkbox checked={!!i.includeLightingCircuit} onCheckedChange={v=>put("includeLightingCircuit",v===true)}/>Include new lighting circuit</label>
      {i.includeLightingCircuit && <CircuitFields id="kitchen-lighting" circuit={rows.find(c=>c.key==="lighting")!} onChange={updateCircuit}/>}
    </BuilderSection>
    <BuilderSection title="Customer-Supplied Items" summary="Purchase cost excluded; installation labor retained">
      {supplied("customerSuppliedFixtures","Customer supplies sink, pendant and undercabinet fixtures")}
      {supplied("customerSuppliedRecessedLights","Customer supplies recessed fixtures")}
    </BuilderSection>
    <BuilderSection title="Wiring & Pricing" summary={`${i.routeLength} FT branch interconnect, separate from home runs`}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField id="kitchen-cable" label="Default Branch-Circuit Cable" value={i.cableType ?? "12/2 NM-B"} options={["12/2 NM-B","14/2 NM-B","14/3 NM-B"]} onChange={v=>put("cableType",v)}/>
        <NumberField id="kitchen-route" label="Branch interconnect wiring (FT total)" value={i.routeLength} onChange={v=>put("routeLength",v)} help="Total in-room branch wiring only. Excludes all panel home runs and 4-way traveler footage. Does not change appliance cable sizes."/>
        <SelectField id="kitchen-labor-rate" label="Labor rate" value={i.laborRateType ?? "residential"} options={["residential","commercial"]} onChange={v=>put("laborRateType",v)}/>
        <NumberField id="kitchen-labor-adj" label="Labor Adjustment (Hours)" value={i.laborAdjustmentHours ?? 0} signed onChange={v=>put("laborAdjustmentHours",v)}/>
      </div><LaborSummary pricing={pricing}/>
    </BuilderSection>
    <BuilderSection title="Estimator Notes"><Label htmlFor="kitchen-notes">Internal notes</Label><Textarea id="kitchen-notes" value={i.notes} onChange={e=>put("notes",e.target.value)}/></BuilderSection>
  </>
}
