import type { RecessedLightingInputs, LightingGroup, PricingSummary } from "@workspace/api-client-react"
import { recessedWiringPlan, lightingControls, lightingWiringScopes, circuitProtections } from "@workspace/api-zod/remodel-circuits"
import { BuilderSection, LaborSummary, NumberField, SelectField } from "./remodel-builder"
import { Button } from "./ui/button"
import { Textarea } from "./ui/textarea"
import { Label } from "./ui/label"

export const initialRecessedInputs:RecessedLightingInputs={
  circuitConfigurationVersion:2,roomLength:16,roomWidth:12,fixtureQuantity:4,fixtureSize:"4-inch",
  wiringOption:"New wiring from source",circuitOption:"Reuse existing circuit",switchType:"Single-pole",
  dimmerSelection:"No dimmer",customerSuppliedFixtures:false,ceilingHeight:"Standard 8-10 ft",
  accessDifficulty:"Attic access",laborAdjustmentHours:0,wireRunLength:40,wiringAllowanceFeet:0,
  additionalSwitches:0,additionalLights:0,notes:"",laborRateType:"residential",panelManufacturer:"Siemens",
  breakerAmperage:15,breakerPoleCount:1,breakerProtectionType:"AFCI",cableType:"14/2 NM-B",
  wiringScope:"New wiring from nearby source",locationType:"Create new light locations",
  lightingGroups:[{key:"main",quantity:4,controlType:"Dimmer"}],fixtureSpacingFeet:8,wireWastePercent:0,quantitySource:"Manual",
}
export function RecessedBuilderFields({inputs:i,onChange,pricing}:{inputs:RecessedLightingInputs;onChange:(i:RecessedLightingInputs)=>void;pricing?:PricingSummary}){
  const set=<K extends keyof RecessedLightingInputs>(key:K,value:RecessedLightingInputs[K])=>onChange({...i,[key]:value})
  const plan=recessedWiringPlan(i),groups=i.lightingGroups??[{key:"main",quantity:i.fixtureQuantity,controlType:"Existing switch" as const}]
  const suggested=i.roomLength>0&&i.roomWidth>0?Math.ceil(i.roomLength/8)*Math.ceil(i.roomWidth/8):0
  const changeQty=(n:number,source:"Manual"|"Planning suggestion")=>onChange({...i,fixtureQuantity:Math.max(1,n),quantitySource:source,
    lightingGroups:groups.length===1?[{...groups[0]!,quantity:Math.max(1,n)}]:groups})
  const groupChange=(index:number,g:LightingGroup)=>set("lightingGroups",groups.map((v,j)=>index===j?g:v))
  const check=(key:keyof RecessedLightingInputs,label:string)=><label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={!!i[key]} onChange={e=>set(key,e.target.checked as never)}/>{label}</label>
  if(i.circuitConfigurationVersion!==2)return <div className="space-y-3 rounded border p-4">
    <p>This recovered draft retains its original calculation. Convert explicitly to lighting groups and review its wiring and controls; the original saved quote is unchanged.</p>
    <p className="text-xs text-muted-foreground">Additional light locations are combined into the primary fixture quantity. Review any legacy smart-kit or additional-switch scope after conversion.</p>
    <Button type="button" onClick={()=>onChange({...i,circuitConfigurationVersion:2,fixtureQuantity:i.fixtureQuantity+i.additionalLights,additionalLights:0,
      wiringScope:/new/i.test(i.circuitOption)?"New home run to panel":/new/i.test(i.wiringOption)?"New wiring from nearby source":"Existing wiring / fixture replacement",
      locationType:/new/i.test(i.wiringOption)?"Create new light locations":"Replace existing fixtures",
      lightingGroups:[{key:"main",quantity:i.fixtureQuantity+i.additionalLights,controlType:i.switchingMethod==="traditional-3-way"?"3-way switching":/include/i.test(i.dimmerSelection)?"Dimmer":"Single-pole switch",travelerLength:i.traditionalThreeWayFootage}],
      fixtureSpacingFeet:0,wireWastePercent:0,quantitySource:"Manual"})}>Convert to lighting groups</Button>
  </div>
  return <>
    <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <p className="text-sm font-semibold">Recessed Lighting Summary</p>
      <p className="text-sm">{i.fixtureQuantity} lights · {groups.filter(g=>g.quantity>0).length} lighting {groups.filter(g=>g.quantity>0).length===1?"group":"groups"} · {groups.length===1?groups[0]?.controlType:"Multiple controls"} · {plan.homeRun?"New":"Existing"} {i.breakerAmperage}A circuit · {plan.total+plan.travelers} FT wiring</p>
      {pricing?<><p className="text-xs">Materials: ${pricing.materialCost.toFixed(2)} · Selling Price: ${pricing.finalSellingPrice.toFixed(2)} · Status: {pricing.pricingWarnings.some(w=>typeof w==="string"||w.severity==="error")?"Needs Review":"Ready for quote review"}</p><LaborSummary pricing={pricing}/></>:<p className="text-xs">Updating estimate...</p>}
    </div>
    <BuilderSection title="Room Planning Guidance" summary={`${i.roomLength} × ${i.roomWidth} FT · ${suggested} suggested fixtures, planning only`}>
      <div className="grid grid-cols-2 gap-4">
        <NumberField id="recessed-room-length" label="Room length (FT)" value={i.roomLength} onChange={v=>set("roomLength",v)}/>
        <NumberField id="recessed-room-width" label="Room width (FT)" value={i.roomWidth} onChange={v=>set("roomWidth",v)}/>
      </div>
      <p className="text-xs text-muted-foreground">Approximately 8 FT planning grid: {suggested} fixtures. This is not a photometric or code-compliance design. Changing room dimensions never changes quoted quantity automatically.</p>
      <Button type="button" variant="outline" disabled={!suggested} onClick={()=>changeQty(suggested,"Planning suggestion")}>Apply planning suggestion</Button>
    </BuilderSection>
    <BuilderSection title="Lights" summary={`${i.fixtureQuantity} ${i.fixtureSize} fixtures · ${i.locationType}`} open>
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField id="recessed-quantity" label="Recessed Light Quantity" value={i.fixtureQuantity} quantity onChange={v=>changeQty(v,"Manual")} help={`Quantity source: ${i.quantitySource??"Manual"}`}/>
        <SelectField id="recessed-product" label="Recessed light product" value={i.fixtureSize} options={["4-inch","6-inch"]} onChange={v=>set("fixtureSize",v as RecessedLightingInputs["fixtureSize"])}/>
        <SelectField id="recessed-location-type" label="Installation scope" value={i.locationType??"Create new light locations"} options={["Create new light locations","Replace existing fixtures"]} onChange={v=>set("locationType",v as RecessedLightingInputs["locationType"])}/>
      </div>
      <p className="text-xs text-muted-foreground">{i.fixtureSize==="6-inch"?"Juno WF6-DREG":"Juno WF4DREGSMAL"} regressed wafer, priced from the company catalog.</p>
      {check("customerSuppliedFixtures","Customer supplies recessed fixtures")}
      {i.customerSuppliedFixtures&&<p className="text-xs text-muted-foreground">Fixture purchase cost is $0 to the contractor. Installation labor, wiring and normal incidental materials remain.</p>}
    </BuilderSection>
    <BuilderSection title="Wiring Scope" summary={i.wiringScope} open>
      <SelectField id="recessed-wiring-scope" label="Wiring scope" value={i.wiringScope??""} options={lightingWiringScopes} onChange={v=>onChange({...i,wiringScope:v as RecessedLightingInputs["wiringScope"],
        locationType:v===lightingWiringScopes[0]?"Replace existing fixtures":i.locationType,
        protectionUpgrade:v===lightingWiringScopes[0]?false:i.protectionUpgrade})}/>
      {plan.newWiring?<><div className="grid gap-4 sm:grid-cols-2">
        <NumberField id="recessed-route" label={plan.homeRun?"Home run to panel (FT)":"Estimated Wiring Route Length (FT)"} value={i.wireRunLength} onChange={v=>set("wireRunLength",v)} help="Source/panel to the first light. Fixture-to-fixture and traveler wiring are calculated separately."/>
        <SelectField id="recessed-amperage" label={plan.homeRun?"New circuit amperage":"Existing supplying circuit amperage"} value={i.breakerAmperage} options={[15,20]} onChange={v=>set("breakerAmperage",Number(v) as 15|20)}/>
      </div>
      <p className="text-xs">{plan.cable}: {plan.route} FT source route + {plan.interconnect} FT fixture-to-fixture + {plan.waste} FT waste + {plan.manual} FT manual allowance = {plan.total} FT.</p>
      {!plan.homeRun&&check("protectionUpgrade","Include a breaker / protection upgrade")}
      <BuilderSection title="Advanced Wiring" summary="Spacing, waste and cable overrides">
        <div className="grid grid-cols-2 gap-4">
          <NumberField id="recessed-spacing" label="Fixture-to-fixture spacing (FT)" value={i.fixtureSpacingFeet??8} onChange={v=>set("fixtureSpacingFeet",v)} help="Sum of (fixtures per group − 1) × spacing; confirm the actual layout."/>
          <NumberField id="recessed-waste" label="Wire waste (%)" value={i.wireWastePercent??0} onChange={v=>set("wireWastePercent",Math.min(100,v))}/>
          <NumberField id="recessed-extra-wire" label="Manual additional wire (FT)" value={i.wiringAllowanceFeet} onChange={v=>set("wiringAllowanceFeet",v)}/>
          <SelectField id="recessed-cable-override" label="Cable override (blank = automatic)" value={i.advancedCableType??""} options={["","14/2 NM-B","14/3 NM-B","12/2 NM-B","12/3 NM-B"]} onChange={v=>set("advancedCableType",v? v as RecessedLightingInputs["advancedCableType"]:undefined)}/>
        </div>
      </BuilderSection></>:<p className="text-xs text-muted-foreground">Existing wiring retained. No new source route, home run or breaker is charged. New multi-location control wiring, if selected below, is priced separately.</p>}
    </BuilderSection>
    <BuilderSection title="Controls" summary={`${groups.filter(g=>g.quantity>0).length} lighting groups`} open>
      {!plan.newWiring&&groups.some(g=>g.quantity>0&&g.controlType.startsWith("3-way"))&&<SelectField id="recessed-existing-control-amperage" label="Existing circuit amperage for new traveler wiring" value={i.breakerAmperage} options={[15,20]} onChange={v=>set("breakerAmperage",Number(v) as 15|20)}/>}
      {groups.map((g,index)=><div key={g.key} className="space-y-3 rounded-md border p-3">
        {groups.length>1&&<p className="text-sm font-semibold">Lighting Group {index+1}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.length>1&&<NumberField id={`recessed-group-${index}-quantity`} label="Fixtures in this group" value={g.quantity} quantity onChange={v=>groupChange(index,{...g,quantity:v})}/>}
          <SelectField id={`recessed-group-${index}-control`} label={groups.length===1?`Control for all ${i.fixtureQuantity} lights`:"Control type"} value={g.controlType} options={lightingControls} onChange={v=>groupChange(index,{...g,controlType:v as LightingGroup["controlType"]})}/>
          {g.controlType.startsWith("3-way")&&<>
            <NumberField id={`recessed-group-${index}-four-way`} label="Additional 4-way locations" value={g.fourWayLocations??0} quantity onChange={v=>groupChange(index,{...g,fourWayLocations:v})}/>
            <NumberField id={`recessed-group-${index}-traveler`} label="Total traveler route (FT)" value={g.travelerLength??0} onChange={v=>groupChange(index,{...g,travelerLength:v})} help={`${plan.travelerCable}, includes all 3-way / 4-way control locations. Separate from source and fixture wiring.`}/>
          </>}
        </div>
        {groups.length>1&&<Button type="button" variant="ghost" onClick={()=>{const remaining=groups.filter((_,j)=>j!==index);set("lightingGroups",remaining.length===1?[{...remaining[0]!,quantity:i.fixtureQuantity}]:remaining)}}>Remove group</Button>}
      </div>)}
      <Button type="button" variant="outline" onClick={()=>set("lightingGroups",[...groups,{key:crypto.randomUUID(),quantity:0,controlType:"Dimmer"}])}>+ Add Lighting Group</Button>
      {groups.length>1&&<p className={`text-xs ${groups.reduce((s,g)=>s+g.quantity,0)!==i.fixtureQuantity?"text-amber-500":"text-muted-foreground"}`}>{groups.reduce((s,g)=>s+g.quantity,0)} of {i.fixtureQuantity} fixtures assigned. Assign every fixture once; no more than the quoted quantity.</p>}
    </BuilderSection>
    {plan.newWiring&&(plan.homeRun||i.protectionUpgrade)&&<BuilderSection title="Circuit / Breaker" summary="Exact company Price Book resolution" open>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField id="recessed-manufacturer" label="Panel manufacturer" value={i.panelManufacturer} options={["","Siemens","Square D","Eaton","GE","Murray"]} onChange={v=>set("panelManufacturer",v)}/>
        <SelectField id="recessed-protection" label="Breaker protection" value={i.breakerProtectionType} options={circuitProtections} onChange={v=>set("breakerProtectionType",v)}/>
      </div><p className="text-xs">1 × {i.panelManufacturer} {i.breakerAmperage}A 1-pole {i.breakerProtectionType}. Circuit cable: {plan.cable}.</p>
    </BuilderSection>}
    <BuilderSection title="Field Conditions" summary={`${i.ceilingHeight} · ${i.accessDifficulty}`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField id="recessed-height" label="Ceiling height" value={i.ceilingHeight} options={["Standard 8-10 ft","High 11-14 ft","Vaulted 15+ ft"]} onChange={v=>set("ceilingHeight",v as RecessedLightingInputs["ceilingHeight"])}/>
        <SelectField id="recessed-access" label="Ceiling access" value={i.accessDifficulty} options={["Attic access","Open ceiling","Limited / blind access","Difficult access"]} onChange={v=>set("accessDifficulty",v as RecessedLightingInputs["accessDifficulty"])}/>
      </div>
      <p className="text-xs text-muted-foreground">Open ceiling means exposed framing. Limited / blind access covers finished ceilings with no attic access. Restricted access adds labor; high/vaulted ceilings apply the existing height multiplier.</p>
      {i.locationType!=="Replace existing fixtures"&&check("insulationPresent","Insulation present (additional handling labor)")}
    </BuilderSection>
    <BuilderSection title="Labor" summary={pricing?`${pricing.finalLaborHours?.toFixed(1)} final hours`:"Company labor settings"}>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField id="recessed-labor-rate" label="Labor rate" value={i.laborRateType??"residential"} options={["residential","commercial"]} onChange={v=>set("laborRateType",v as "residential"|"commercial")}/>
        <NumberField id="recessed-labor-adj" label="Labor Adjustment (Hours)" value={i.laborAdjustmentHours} signed onChange={v=>set("laborAdjustmentHours",v)}/>
      </div><LaborSummary pricing={pricing}/>
    </BuilderSection>
    <BuilderSection title="Estimator Notes" summary="Internal only">
      <Label htmlFor="recessed-notes">Estimator Notes (Internal)</Label><Textarea id="recessed-notes" value={i.notes} onChange={e=>set("notes",e.target.value)}/>
    </BuilderSection>
  </>
}
