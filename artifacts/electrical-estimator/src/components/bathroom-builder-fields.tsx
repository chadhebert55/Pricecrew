import type { BathroomInputs, PricingSummary, RemodelCircuit } from "@workspace/api-client-react"
import { bathroomCircuitPlan, breakerRequirements, defaultCircuit as sharedDefaultCircuit } from "@workspace/api-zod/remodel-circuits"
import { BuilderSection, CircuitFields, LaborSummary, NumberField, SelectField } from "./remodel-builder"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Button } from "./ui/button"
import { Textarea } from "./ui/textarea"
const defaultCircuit=(key:string,label:string,quantity:number)=>sharedDefaultCircuit(key,label,quantity) as RemodelCircuit

export const initialBathroomInputs: BathroomInputs = {
  circuitConfigurationVersion: 2, gfciReceptacles: 1, additionalReceptacles: 0, vanityLights: 1,
  recessedLights: 0, showerLights: 0, exhaustFans: 1, fanLights: 0, fanLightHeatUnits: 0,
  heatedFloorCircuit: false, heatedFloorThermostat: true, additionalSwitches: 1, threeWaySwitches: 0,
  dimmers: 0, smartSwitches: 0, routeLength: 30, branchWiringLength: 20,
  circuitOption: "Reuse existing circuit", customerSuppliedFixtures: true, customerSuppliedRecessedLights: false,
  notes: "", laborRateType: "residential", panelManufacturer: "Siemens", gfciAmperage: 20,
  recessedLightSize: "4-inch", cableType: "12/2 NM-B", laborAdjustmentHours: 0, fanControl: "Standard switch",
  bathroomCircuits: [
    defaultCircuit("receptacles", "Bathroom Receptacle Circuit", 1),
    {...defaultCircuit("lighting", "Lighting / Fan Circuit", 1), amperage: 15, cableType: "14/2 NM-B", protectionType: "AFCI"},
  ],
}
export function BathroomBuilderFields({inputs:i,onChange,pricing,needsReview}: {inputs:BathroomInputs;onChange:(i:BathroomInputs)=>void;pricing?:PricingSummary;needsReview?:boolean}) {
  const set = <K extends keyof BathroomInputs>(key:K,value:BathroomInputs[K]) => onChange({...i,[key]:value})
  const rows=i.bathroomCircuits ?? []
  const circuits=bathroomCircuitPlan(i), breakers=breakerRequirements(circuits)
  const fans=i.exhaustFans+i.fanLights+i.fanLightHeatUnits
  const controls=i.additionalSwitches+(i.threeWaySwitches??0)+(i.dimmers??0)+(i.smartSwitches??0)+fans+Number(i.heatedFloorCircuit&&i.heatedFloorThermostat)
  const qty=(key:keyof BathroomInputs,label:string)=><NumberField key={key} id={`bath-${key}`} label={label} value={Number(i[key]??0)} quantity onChange={n=>set(key,n as never)}/>
  const check=(key:keyof BathroomInputs,label:string)=><label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={!!i[key]} onChange={e=>set(key,e.target.checked as never)}/>{label}</label>
  if(i.circuitConfigurationVersion!==2) return <div className="space-y-3 rounded-lg border p-4">
    <p>This recovered estimate retains its original circuit-package calculations. Convert explicitly to edit with individual circuits; original saved quotes are not changed.</p>
    <p className="text-sm text-muted-foreground">Conversion replaces package quantities, package cost overrides and fixed circuit labor with itemized circuits. Review circuit sizes, control quantities and route lengths afterward.</p>
    <Button type="button" onClick={()=>onChange({...i,circuitConfigurationVersion:2,
      bathroomCircuits:/new/i.test(i.circuitOption)?[{...defaultCircuit("legacy","Existing draft circuit",1),amperage:15,cableType:"14/2 NM-B",
        routeLength:i.newCircuitCableFootage??i.routeLength,protectionType:i.newCircuitBreakerProtectionType??"AFCI"}]:[],
      branchWiringLength:i.routeLength??0,customerSuppliedFixtures:true,fanControl:"Standard switch"})}>Convert to individual circuits</Button>
  </div>
  return <>
    <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-4" aria-label="Bathroom Summary">
      <p className="text-sm font-semibold">Bathroom Summary</p>
      <p className="text-sm">{circuits.reduce((s,c)=>s+c.quantity,0)} circuits · {i.gfciReceptacles+i.additionalReceptacles} receptacles · {controls} controls · {fans} fans · {i.vanityLights+i.recessedLights+(i.showerLights??0)} lights</p>
      <p className="text-xs">Home-run wiring: {circuits.reduce((s,c)=>s+c.quantity*(c.routeLength??0),0)} FT, priced separately by cable type</p>
      {pricing ? <><p className="text-xs">Materials: ${pricing.materialCost.toFixed(2)} · Selling Price: ${pricing.finalSellingPrice.toFixed(2)} · Status: {(needsReview ?? pricing.pricingWarnings.some(w=>typeof w==="string"||w.severity==="error"))?"Needs Review":"Ready for quote review"}</p><LaborSummary pricing={pricing}/></>:<p className="text-xs">Updating estimate...</p>}
    </div>
    <BuilderSection title="Bathroom Circuits" summary={`${circuits.reduce((s,c)=>s+c.quantity,0)} new home runs · ${breakers.reduce((s,c)=>s+c.quantity,0)} automatic breakers`} open>
      <p className="text-xs text-muted-foreground">Circuits = breakers and home runs. Enter physical receptacles, switches, lights and fans in the sections below; their quantities never add circuits. These editable defaults are estimating assumptions, not a code design. Remove a row or set Circuit Quantity to zero when reusing an existing circuit.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField id="bath-manufacturer" label="Panel manufacturer" value={i.panelManufacturer??""} options={["","Siemens","Square D","Eaton","GE","Murray"]} onChange={v=>set("panelManufacturer",v)}/>
        <NumberField id="bath-route" label="Default Bathroom Wiring Route (FT)" value={i.routeLength??0} onChange={v=>set("routeLength",v)}/>
      </div>
      {rows.map((c,index)=>c.quantity>0&&<div key={c.key} className="space-y-2" data-testid="bathroom-active-circuit">
        <Label htmlFor={`bath-circuit-${index}-name`}>Circuit {index+1} description (optional)</Label>
        <Input id={`bath-circuit-${index}-name`} value={c.label??""} onChange={e=>set("bathroomCircuits",rows.map((r,j)=>j===index?{...r,label:e.target.value}:r))}/>
        <CircuitFields id={`bath-circuit-${index}`} compactCircuit circuit={c} defaultLength={i.routeLength} onChange={v=>set("bathroomCircuits",rows.map((r,j)=>j===index?v as RemodelCircuit:r))}/>
        <Button type="button" variant="ghost" size="sm" aria-label={`Remove circuit ${index+1}`} onClick={()=>set("bathroomCircuits",rows.filter((_,j)=>j!==index))}>Remove circuit</Button>
      </div>)}
      {rows.some(c=>c.quantity===0)&&<details className="rounded border p-3">
        <summary className="cursor-pointer text-xs">Inactive circuits ({rows.filter(c=>c.quantity===0).length})</summary>
        {rows.map((c,index)=>c.quantity===0&&<div key={c.key} className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span>{c.label||`Circuit ${index+1}`} · not priced</span>
          <Button type="button" variant="outline" size="sm" onClick={()=>set("bathroomCircuits",rows.map((r,j)=>j===index?{...r,quantity:1}:r))}>Restore circuit {index+1}</Button>
          <Button type="button" variant="ghost" size="sm" aria-label={`Remove circuit ${index+1}`} onClick={()=>set("bathroomCircuits",rows.filter((_,j)=>j!==index))}>Remove</Button>
        </div>)}
      </details>}
      <Button type="button" variant="outline" onClick={()=>set("bathroomCircuits",[...rows,defaultCircuit(`circuit-${crypto.randomUUID()}`,"Additional circuit",1)])}>+ Add Circuit</Button>
      <div className="space-y-1 text-xs"><p className="font-semibold">Automatic breaker requirements</p>{breakers.map(c=><p key={c.key}>{c.quantity} × {i.panelManufacturer} {c.amperage}A {c.poleCount}-pole {c.protectionType}</p>)}
        {!breakers.length&&<p>No new breakers or home runs. Existing circuit suitability requires field verification.</p>}</div>
      {check("heatedFloorCircuit","Include heated-floor circuit")}
      {i.heatedFloorCircuit&&<div className="space-y-3 rounded-md border p-3">
        <Label htmlFor="bath-floor-source">Heated-floor power source (counted once)</Label>
        <select id="bath-floor-source" className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm" value={i.heatedFloorCircuitKey??""} onChange={e=>set("heatedFloorCircuitKey",e.target.value)}>
          <option value="">Add a separate heated-floor circuit</option>
          {rows.filter(c=>c.quantity>0).map(c=><option key={c.key} value={c.key}>{c.label||c.key}: use this existing configured row</option>)}
        </select>
        {!i.heatedFloorCircuitKey&&<CircuitFields id="bath-floor" compactCircuit circuit={{...defaultCircuit("heated-floor","Heated floor",1),protectionType:"GFCI",...i.heatedFloorConfiguration,quantity:1}} defaultLength={i.routeLength} onChange={c=>set("heatedFloorConfiguration",{...c,quantity:1} as RemodelCircuit)}/>}
        {check("heatedFloorThermostat","Include thermostat / control")}
        <p className="text-xs text-muted-foreground">Circuit and optional thermostat only; heating mat and floor installation are not included.</p>
      </div>}
    </BuilderSection>
    <BuilderSection title="Devices & Controls" summary={`${i.gfciReceptacles+i.additionalReceptacles} receptacles · ${controls} controls`} open>
      <div className="grid grid-cols-2 gap-4">
        {qty("gfciReceptacles","Primary GFCI receptacles")}{qty("additionalReceptacles","Additional downstream receptacles")}
        <SelectField id="bath-gfci-rating" label="GFCI device rating" value={i.gfciAmperage??20} options={[15,20]} onChange={v=>set("gfciAmperage",Number(v))}/>
        {qty("additionalSwitches","Single-pole switches")}{qty("threeWaySwitches","3-way switches (physical devices)")}{qty("dimmers","Dimmers")}{qty("smartSwitches","Smart switches")}
      </div>
      <p className="text-xs text-muted-foreground">Physical devices only; these counts do not change circuit quantity. Incremental remodel labor. Fan controls and floor thermostats are added separately below; do not repeat those quantities here. A typical 3-way setup uses two physical switches.</p>
    </BuilderSection>
    <BuilderSection title="Lighting" summary={`${i.vanityLights+i.recessedLights+(i.showerLights??0)} fixtures`}>
      <div className="grid grid-cols-2 gap-4">{qty("vanityLights","Vanity lights")}{qty("recessedLights","Recessed lights")}{qty("showerLights","Shower / wet-location lights")}
        {i.recessedLights>0&&<SelectField id="bath-recessed-size" label="Recessed light size" value={i.recessedLightSize??"4-inch"} options={["4-inch","6-inch"]} onChange={v=>set("recessedLightSize",v as "4-inch"|"6-inch")}/>}
      </div>
    </BuilderSection>
    <BuilderSection title="Exhaust Equipment" summary={`${fans} equipment units · ${i.fanControl??"Standard switch"}`}>
      <div className="grid grid-cols-2 gap-4">{qty("exhaustFans","Exhaust fan")}{qty("fanLights","Fan / light")}{qty("fanLightHeatUnits","Fan / light / heat")}</div>
      {fans>0&&<>
        <SelectField id="bath-fan-control" label="One fan control per equipment unit" value={i.fanControl??"Standard switch"} options={["Standard switch","Timer switch","Humidity-sensing control"]} onChange={v=>set("fanControl",v as BathroomInputs["fanControl"])}/>
        <p className="text-xs text-muted-foreground">Additional light/heat controls belong in Devices & Controls. Verify the equipment's switching requirements.</p>
        {([["exhaustFans","exhaustFanMaterialCostOverride","Exhaust fan"],["fanLights","fanLightMaterialCostOverride","Fan / light"],["fanLightHeatUnits","fanLightHeatMaterialCostOverride","Fan / light / heat"]] as const).filter(([q])=>i[q]>0).map(([,key,label])=><details key={key} className="rounded border p-3"><summary className="cursor-pointer text-sm">{label}: advanced equipment cost override</summary>
          <Label htmlFor={`bath-${key}`}>Unit cost ($), blank uses company Price Book</Label><Input id={`bath-${key}`} className="mt-2" type="number" min="0" step=".01" value={i[key]??""} onChange={e=>set(key,e.target.value===""?undefined:Number(e.target.value))}/>
        </details>)}
      </>}
    </BuilderSection>
    <BuilderSection title="Customer-Supplied Items" summary={i.vanityLights>0?(i.customerSuppliedFixtures?"Vanity fixtures supplied by customer":"Contractor-supplied vanity fixtures"):"Only selected fixture types appear here"}>
      {i.vanityLights>0&&check("customerSuppliedFixtures","Customer supplies vanity / decorative fixtures")}
      {i.recessedLights>0&&check("customerSuppliedRecessedLights","Customer supplies recessed fixtures")}
      <p className="text-xs text-muted-foreground">Fixture purchase cost is excluded, not installation labor or normal incidental materials. Wet-location shower fixtures remain contractor-supplied.</p>
    </BuilderSection>
    <BuilderSection title="Wiring & Pricing" summary="In-room wiring is separate from home runs">
      <div className="grid grid-cols-2 gap-4">
        <NumberField id="bath-branch-length" label="Additional In-Room Wiring Allowance (FT)" value={i.branchWiringLength??0} onChange={v=>set("branchWiringLength",v)} help="Additional wiring between bathroom devices, controls and fixtures. Circuit home runs are calculated separately above. Zero for existing wiring."/>
        <SelectField id="bath-branch-cable" label="Allowance Cable" value={i.cableType??"12/2 NM-B"} options={["12/2 NM-B","14/2 NM-B","14/3 NM-B"]} onChange={v=>set("cableType",v as BathroomInputs["cableType"])}/>
        <SelectField id="bath-labor-rate" label="Labor rate" value={i.laborRateType??"residential"} options={["residential","commercial"]} onChange={v=>set("laborRateType",v as "residential"|"commercial")}/>
        <NumberField id="bath-labor-adj" label="Labor Adjustment (Hours)" value={i.laborAdjustmentHours??0} signed onChange={v=>set("laborAdjustmentHours",v)}/>
      </div><LaborSummary pricing={pricing}/>
      <p className="text-xs text-muted-foreground">Confirm in-room wire sizing against its actual supplying circuit. Per-circuit home-run sizes are never overridden by this setting.</p>
    </BuilderSection>
    <BuilderSection title="Estimator Notes" summary="Internal only, never copied into customer scope">
      <Label htmlFor="bath-notes">Estimator Notes (Internal)</Label><Textarea id="bath-notes" value={i.notes} onChange={e=>set("notes",e.target.value)}/>
    </BuilderSection>
  </>
}
