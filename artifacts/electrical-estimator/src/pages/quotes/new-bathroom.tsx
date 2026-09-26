import { type BathroomInputs, usePreviewQuote, useGetSettings } from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useEffect, useRef, useState } from "react"
import { useLocation } from "wouter"
import { CustomerPicker } from "@/components/customer-picker"
import { useQuoteCreateMutation } from "@/hooks/use-quote-create-mutation"
import { useQuoteRevisionPrefill } from "@/hooks/use-quote-revision-prefill"
import { useQuoteBuilderDraft } from "@/hooks/use-quote-builder-draft"
import { QuoteBuilderRecovery } from "@/components/quote-builder-recovery"
import { BathroomBuilderFields, initialBathroomInputs } from "@/components/bathroom-builder-fields"
import { PricingReview, pricingNeedsReview } from "@/components/remodel-builder"

const initialInputs: BathroomInputs = initialBathroomInputs
function optionalAmount(value: string) {
  if (value.trim() === "") return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}
export function NewBathroomQuote() {
  const [, setLocation] = useLocation()
  const createQuote = useQuoteCreateMutation()
  const previewQuote = usePreviewQuote()
  const settingsQuery = useGetSettings()
  const {data:settings} = settingsQuery
  const [settingsLoaded,setSettingsLoaded] = useState(false)
  const [previewedInputKey,setPreviewedInputKey] = useState("")
  const [customerName,setCustomerName] = useState("")
  const [customerEmail,setCustomerEmail] = useState("")
  const [customerId,setCustomerId] = useState<number|undefined>()
  const [projectName,setProjectName] = useState("")
  const [proposalDescription,setProposalDescription] = useState("Provide labor and listed materials for the selected bathroom electrical scope, including receptacles, lighting, ventilation controls, testing, and final trim. Equipment specifications, circuit assumptions, layout, and field conditions will be verified before work begins.")
  const [laborOverride,setLaborOverride] = useState("")
  const [sellingPriceOverride,setSellingPriceOverride] = useState("")
  const [inputs,setInputs] = useState<BathroomInputs>(initialInputs)
  const revision = useQuoteRevisionPrefill("BATHROOM",{setCustomerName,setCustomerEmail,setCustomerId,setProjectName,setProposalDescription,setInputs,setSettingsLoaded})
  const {draftRecovery} = useQuoteBuilderDraft({module:"BATHROOM",ready:settingsLoaded && !revision.isRevision,
    values:{customerName,customerEmail,customerId,projectName,proposalDescription,inputs,laborOverride,sellingPriceOverride},
    setters:{setCustomerName,setCustomerEmail,setCustomerId,setProjectName,setProposalDescription,setInputs,setLaborOverride,setSellingPriceOverride}})
  useEffect(()=>{
    if(settings && !settingsLoaded && !revision.isRevision) {
      setInputs(current=>({...current,laborAdjustmentHours:settings.bathroomLaborAdjustmentHours ?? 0}))
      setSettingsLoaded(true)
    }
  },[settings,settingsLoaded,revision.isRevision])
  const payload={module:"BATHROOM" as const,jobInputs:inputs,laborOverride:optionalAmount(laborOverride),sellingPriceOverride:optionalAmount(sellingPriceOverride)}
  const currentInputKey=JSON.stringify(payload)
  const currentKeyRef=useRef(currentInputKey)
  currentKeyRef.current=currentInputKey
  const previewIsCurrent=currentInputKey===previewedInputKey
  useEffect(()=>{
    if(!settingsLoaded) return
    const key=currentInputKey
    const timer=window.setTimeout(()=>previewQuote.mutate({data:payload},{onSuccess:()=>{if(currentKeyRef.current===key)setPreviewedInputKey(key)}}),250)
    return()=>window.clearTimeout(timer)
  },[currentInputKey,settingsLoaded])
  const pricing=previewQuote.data?.pricing
  const assembly=previewQuote.data?.assembly
  const blocked=pricingNeedsReview(pricing,assembly) || inputs.circuitConfigurationVersion !== 2
  const canSave=settingsLoaded && previewIsCurrent && !previewQuote.isError && !createQuote.isPending
  const handleSubmit=(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault()
    const draft=(event.nativeEvent as SubmitEvent).submitter?.getAttribute("value")==="draft"
    if(!canSave || (blocked && !draft)) return
    createQuote.mutate({data:{customerId,sourceQuoteId:revision.sourceQuoteId,customerName,customerEmail:customerEmail||null,projectName,
      ...payload,proposalDescription}},{onSuccess:q=>setLocation(`/quotes/${q.id}`)})
  }
  return <div className="mx-auto max-w-7xl space-y-6 pb-24">
    <div><h1 className="text-3xl font-bold tracking-tight">New Bathroom Quote</h1><p className="mt-1 text-muted-foreground">Bathroom Electrical Builder</p></div>
    <form onSubmit={handleSubmit}><div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="min-w-0 space-y-6 xl:col-span-2">
        <Card className="border-t-4 border-t-secondary"><CardHeader><CardTitle>Project Details</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <CustomerPicker idPrefix="bathroom" customerId={customerId} customerName={customerName} customerEmail={customerEmail} onCustomerIdChange={setCustomerId} onCustomerNameChange={setCustomerName} onCustomerEmailChange={setCustomerEmail}/>
            <div className="space-y-2"><Label htmlFor="bathroom-customer">Customer Name *</Label><Input id="bathroom-customer" required value={customerName} onChange={e=>{setCustomerId(undefined);setCustomerName(e.target.value)}}/></div>
            <div className="space-y-2"><Label htmlFor="bathroom-email">Customer Email</Label><Input id="bathroom-email" type="email" value={customerEmail} onChange={e=>{setCustomerId(undefined);setCustomerEmail(e.target.value)}}/></div>
            <div className="space-y-2 md:col-span-2"><Label htmlFor="bathroom-project">Project Name *</Label><Input id="bathroom-project" required value={projectName} onChange={e=>setProjectName(e.target.value)}/></div>
            <div className="space-y-2 md:col-span-2"><Label htmlFor="bathroom-proposal">Customer-facing Proposal Description *</Label><Textarea id="bathroom-proposal" required value={proposalDescription} onChange={e=>setProposalDescription(e.target.value)}/></div>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-primary"><CardHeader className="bg-primary/5"><CardTitle>Parametric Builder: Bathroom</CardTitle><CardDescription>Configure circuits once. Breakers, home runs and pricing follow automatically.</CardDescription></CardHeader>
          <CardContent className="space-y-4 pt-6"><BathroomBuilderFields inputs={inputs} onChange={setInputs} pricing={previewIsCurrent?pricing:undefined}/></CardContent>
        </Card>
      </div>
      <div className="min-w-0"><Card className="border-primary bg-secondary text-secondary-foreground xl:sticky xl:top-6">
        <CardHeader><CardTitle>Calculation Preview</CardTitle><CardDescription>Company catalog and current labor settings. No invented prices.</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          <QuoteBuilderRecovery settings={settingsQuery} revision={revision} draft={draftRecovery}/>
          {pricing && previewIsCurrent ? <PricingReview pricing={pricing} assembly={assembly}/> : <p className="text-sm">Updating authoritative estimate...</p>}
          <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm">Advanced price overrides</summary><div className="mt-3 space-y-3">
            <div><Label htmlFor="bathroom-labor-override">Internal Labor Cost Override ($)</Label><Input id="bathroom-labor-override" type="number" min="0" step=".01" value={laborOverride} onChange={e=>setLaborOverride(e.target.value)} placeholder="Company-calculated"/></div>
            <div><Label htmlFor="bathroom-price-override">Selling Price Override ($)</Label><Input id="bathroom-price-override" type="number" min="0" step=".01" value={sellingPriceOverride} onChange={e=>setSellingPriceOverride(e.target.value)} placeholder="Company-calculated"/></div>
          </div></details>
          {previewQuote.isError && <p role="alert" className="text-sm text-destructive">The estimate could not be calculated. Check inputs and retry.</p>}
          {createQuote.isError && <p role="alert" className="text-sm text-destructive">The quote could not be saved. Your inputs are retained.</p>}
          <Button className="w-full whitespace-normal" type="submit" value="quote" disabled={!canSave || blocked}>Generate Bathroom Quote</Button>
          {blocked && <><Button className="w-full whitespace-normal" variant="outline" type="submit" value="draft" disabled={!canSave}>Generate Draft / Unfinished Quote</Button><p className="text-xs">Unfinished estimates are saved as drafts, not customer-ready proposals. Resolve pricing before sending.</p></>}
        </CardContent>
      </Card></div>
    </div></form>
  </div>
}
