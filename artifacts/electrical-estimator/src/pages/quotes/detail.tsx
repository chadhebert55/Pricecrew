import {
  getGetDashboardSummaryQueryKey,
  getGetQuoteQueryKey,
  getListQuotesQueryKey,
  type QuoteStatus,
  useGetQuote,
  useUpdateQuote,
} from "@workspace/api-client-react"
import { pricingWarningKey, pricingWarningMessage } from "@/lib/pricing-warnings"
import { contractorMaterialName, contractorMaterialSource } from "@/lib/material-display"
import { useQueryClient } from "@tanstack/react-query"
import { useLocation, useParams } from "wouter"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, Save, FileText, Check, DollarSign, Calculator, TriangleAlert, ExternalLink, Copy } from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { useToast } from "@/hooks/use-toast"
import { quoteBuilderRoute } from "@/lib/quote-builder-routes"

export function QuoteDetail() {
  const params = useParams<{ id: string }>()
  const quoteId = parseInt(params.id || "0")
  const [_, setLocation] = useLocation()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  
  const { data: quote, isLoading } = useGetQuote(quoteId, {
    query: { enabled: !!quoteId, queryKey: getGetQuoteQueryKey(quoteId) }
  })
  const updateQuote = useUpdateQuote({
    mutation: {
      onSuccess: (updatedQuote) => {
        setStatus(updatedQuote.status)
        queryClient.setQueryData(getGetQuoteQueryKey(updatedQuote.id), updatedQuote)
        void queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() })
        void queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() })
        baseline.current = JSON.stringify({
          laborOverride: updatedQuote.pricing.laborOverride?.toString() || "",
          priceOverride: updatedQuote.pricing.sellingPriceOverride?.toString() || "",
          status: updatedQuote.status,
          proposalDesc: updatedQuote.proposalDescription,
        })
        toast({ title: "Quote saved", description: "Your changes have been saved." })
      },
      onError: (error) => toast({ variant: "destructive", title: "Could not save quote", description: error instanceof Error ? error.message : "Please try again." }),
    },
  })

  // Local state for overrides and descriptive edits
  const initializedForId = useRef<number | null>(null)
  const [laborOverride, setLaborOverride] = useState<string>("")
  const [priceOverride, setPriceOverride] = useState<string>("")
  const [status, setStatus] = useState<QuoteStatus>("draft")
  const [proposalDesc, setProposalDesc] = useState<string>("")
  const baseline = useRef("")

  useEffect(() => {
    if (quote && initializedForId.current !== quote.id) {
      initializedForId.current = quote.id
      setLaborOverride(quote.pricing.laborOverride?.toString() || "")
      setPriceOverride(quote.pricing.sellingPriceOverride?.toString() || "")
      setStatus(quote.status)
      setProposalDesc(quote.proposalDescription)
      baseline.current = JSON.stringify({ laborOverride: quote.pricing.laborOverride?.toString() || "", priceOverride: quote.pricing.sellingPriceOverride?.toString() || "", status: quote.status, proposalDesc: quote.proposalDescription })
    }
  }, [quote])
  const isDirty = baseline.current !== JSON.stringify({ laborOverride, priceOverride, status, proposalDesc })
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!isDirty) return
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [isDirty])

  if (isLoading) return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading quote...</div>
  if (!quote) return <div className="p-8 text-center text-destructive">Quote not found.</div>

  const handleSaveOverrides = () => {
    updateQuote.mutate({
      id: quote.id,
      data: {
        status,
        proposalDescription: proposalDesc,
        laborOverride: laborOverride ? parseFloat(laborOverride) : null,
        sellingPriceOverride: priceOverride ? parseFloat(priceOverride) : null,
      }
    })
  }

  const handleMarkReady = () => {
    updateQuote.mutate({
      id: quote.id,
      data: { status: "ready" }
    })
  }

  const handleOpenProposal = () => {
    if (status !== "ready" || hasBlockingWarnings) return
    if (isDirty) {
      toast({ variant: "destructive", title: "Save changes before opening proposal", description: "The customer proposal would otherwise show stale saved details." })
      return
    }
    updateQuote.mutate(
      { id: quote.id, data: { status: "ready" } },
      {
        onSuccess: (updatedQuote) => {
          if (updatedQuote.proposalShareToken) {
            setLocation(`/proposals/${updatedQuote.proposalShareToken}`)
          }
        },
      },
    )
  }

  const handleDuplicate = () => {
    const route = quoteBuilderRoute(quote.module)
    if (!route) {
      toast({
        variant: "destructive",
        title: "This quote cannot be revised",
        description: `No editable builder is available for module “${quote.module}”.`,
      })
      return
    }
    setLocation(`${route}?reviseFrom=${quote.id}`)
  }

  // Derived effective pricing
  const effectiveLabor = quote.pricing.laborOverride ?? quote.pricing.laborCost
  const effectiveSellingPrice = quote.pricing.finalSellingPrice
  
  const totalCost = quote.pricing.materialCost + effectiveLabor
  const gp = quote.pricing.grossProfit
  const margin = quote.pricing.grossMargin * 100
  const estimatorNotes =
    typeof quote.jobInputs.notes === "string" ? quote.jobInputs.notes : ""
  const hasBlockingWarnings = quote.pricing.pricingWarnings.some(
    (warning) => warning.severity === "error",
  )

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-3 text-muted-foreground" onClick={() => setLocation("/quotes")}>
            <ArrowLeft size={16} className="mr-1" /> Back to Quotes
          </Button>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{quote.projectName}</h1>
            <Badge variant={status === 'ready' ? 'success' : 'secondary'} className="text-sm capitalize">
              {status}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1 flex items-center gap-2">
            <span className="font-mono text-primary font-medium">{quote.quoteNumber}</span> &bull; 
            {quote.customerName} {quote.customerEmail && `(${quote.customerEmail})`}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button data-testid="button-duplicate-quote" variant="outline" onClick={handleDuplicate}>
            <Copy size={16} className="mr-2" /> Duplicate / Revise
          </Button>
          <Button variant="outline" onClick={handleOpenProposal} disabled={status !== "ready" || hasBlockingWarnings || updateQuote.isPending} title={status !== "ready" ? "Mark this quote ready before opening the customer proposal" : undefined}>
            <ExternalLink size={16} className="mr-2" /> Customer Proposal
          </Button>
          {status !== 'ready' && (
            <Button variant="outline" className="border-emerald-500 text-emerald-600 hover:bg-emerald-50" onClick={handleMarkReady} disabled={updateQuote.isPending || hasBlockingWarnings} title={hasBlockingWarnings ? "Resolve pricing errors before marking ready" : undefined}>
              <Check size={16} className="mr-2" /> Mark Ready
            </Button>
          )}
          <Button data-testid="button-save-quote" onClick={handleSaveOverrides} disabled={updateQuote.isPending}>
            <Save size={16} className="mr-2" /> {updateQuote.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
      {status !== "ready" && hasBlockingWarnings && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          This quote cannot be marked ready until all missing or invalid material prices are resolved.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Col - Proposal & Assembly */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <FileText className="text-muted-foreground" size={20} />
                <CardTitle>Proposal Description</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <Textarea 
                value={proposalDesc}
                onChange={e => setProposalDesc(e.target.value)}
                className="min-h-[120px]"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 border-b border-border mb-4">
              <div className="flex items-center gap-2">
                <Calculator className="text-muted-foreground" size={20} />
                <CardTitle>Calculated Assembly</CardTitle>
              </div>
              <CardDescription>
                Generated by the {quote.module === "BATHROOM"
                  ? "Bathroom Builder"
                  : quote.module === "KITCHEN"
                    ? "Kitchen Builder"
                    : quote.module === "RECESSED_LIGHTING"
                      ? "Recessed Lighting Builder"
                      : quote.module === "SERVICE_UPGRADE"
                        ? "Service Upgrade Builder"
                        : quote.module === "PANEL_REPLACEMENT"
                          ? "Panel Replacement Builder"
                           : quote.module === "SERVICE_CALL"
                             ? "Service Call Builder"
                             : quote.module === "TIME_MATERIALS"
                               ? "Time & Materials Builder"
                               : quote.module === "CUSTOM"
                                 ? "Custom Items Builder"
                                  : quote.module === "NEW_HOUSE"
                                    ? "New House Builder"
                                    : "EV Charger Builder"}.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit</TableHead>
                    <TableHead className="text-right">Ext Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quote.assembly.map(line => (
                    <TableRow key={line.id}>
                      <TableCell className="font-medium text-xs uppercase tracking-wider text-muted-foreground">{line.category}</TableCell>
                      <TableCell>
                        <div>{contractorMaterialName(line.description)}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{contractorMaterialSource(line.source)}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono">{line.quantity}</TableCell>
                      <TableCell className="text-right text-xs font-mono text-muted-foreground">{line.unit}</TableCell>
                      <TableCell className="text-right font-mono">
                        ${line.extendedCost.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {quote.assembly.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No assembly items generated.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Builder Inputs Record</CardTitle>
              <CardDescription>The parametric values used to generate this estimate.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3 text-sm">
                {Object.entries(quote.jobInputs).map(([key, value]) => {
                  if (key === 'notes') return null;
                  return (
                    <div key={key} className="flex flex-col">
                      <span className="text-muted-foreground text-xs uppercase tracking-wider truncate">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                      <span className="font-medium truncate">{String(value)}</span>
                    </div>
                  )
                })}
              </div>
              {estimatorNotes && (
                <div className="mt-4 pt-4 border-t border-border">
                  <span className="text-muted-foreground text-xs uppercase tracking-wider block mb-1">Estimator Notes</span>
                  <span className="font-mono text-xs text-foreground/80">{estimatorNotes}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Col - Pricing & Overrides */}
        <div className="space-y-6">
          {quote.pricing.pricingWarnings.length > 0 && (
            <Card className="border-amber-300 bg-amber-50 text-amber-950">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <TriangleAlert size={20} />
                  <CardTitle className="text-lg">Pricing needs confirmation</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 pl-5 text-sm list-disc">
                  {quote.pricing.pricingWarnings.map((warning, index) => (
                    <li key={pricingWarningKey(warning, index)}>{pricingWarningMessage(warning)}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card className="border-t-4 border-t-primary bg-secondary text-secondary-foreground shadow-lg">
            <CardHeader className="pb-2 border-b border-secondary-border">
              <div className="flex items-center gap-2">
                <DollarSign className="text-primary" size={20} />
                <CardTitle className="text-secondary-foreground text-xl">Pricing Summary</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm text-secondary-foreground/80">
                  <span>Material Cost</span>
                  <span className="font-mono">${quote.pricing.materialCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-sm text-secondary-foreground/80">
                  <span>Loaded Internal Labor Cost</span>
                  <span className="font-mono">${quote.pricing.laborCost.toFixed(2)}</span>
                </div>
                {quote.pricing.laborSellAmount !== undefined && (
                  <div className="flex justify-between items-center text-sm text-secondary-foreground/80">
                    <span>Customer Labor ({quote.pricing.laborRateType} @ ${quote.pricing.laborSellRate?.toFixed(2)}/hr)</span>
                    <span className="font-mono">${quote.pricing.laborSellAmount.toFixed(2)}</span>
                  </div>
                )}
                
                {quote.pricing.laborOverride !== null && (
                   <div className="flex justify-between items-center text-sm text-primary font-medium bg-primary/10 p-1.5 -mx-1.5 rounded">
                     <span>Internal Labor Override Active</span>
                     <span className="font-mono">${quote.pricing.laborOverride.toFixed(2)}</span>
                   </div>
                )}
                
                <div className="border-t border-secondary-border pt-3 flex justify-between items-center font-bold">
                  <span>Total Cost</span>
                  <span className="font-mono">${totalCost.toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-secondary-border">
                <div className="flex justify-between items-center text-sm text-secondary-foreground/80">
                  <span>Calculated Sell Price</span>
                  <span className="font-mono">${quote.pricing.calculatedSellingPrice.toFixed(2)}</span>
                </div>
                
                {quote.pricing.sellingPriceOverride !== null && (
                   <div className="flex justify-between items-center text-sm text-primary font-medium bg-primary/10 p-1.5 -mx-1.5 rounded">
                     <span>Sell Price Override Active</span>
                     <span className="font-mono">${quote.pricing.sellingPriceOverride.toFixed(2)}</span>
                   </div>
                )}
              </div>

              <div className="pt-4 border-t border-secondary-border flex flex-col gap-1">
                <span className="text-xs text-secondary-foreground/60 uppercase tracking-wider">Final Selling Price</span>
                <span className="text-4xl font-bold font-mono text-primary tracking-tight">
                  ${effectiveSellingPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-4 bg-background/10 rounded-md p-3">
                <div>
                  <span className="block text-[10px] uppercase text-secondary-foreground/60 tracking-wider">Gross Profit</span>
                  <span className="font-mono font-medium">${gp.toFixed(2)}</span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase text-secondary-foreground/60 tracking-wider">Margin</span>
                  <span className="font-mono font-medium text-primary">{margin.toFixed(1)}%</span>
                </div>
              </div>

            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Overrides</CardTitle>
              <CardDescription>Adjust final numbers manually. Leaves calculated assembly intact.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Internal Labor Cost Override ($)</Label>
                <Input 
                  type="number" 
                  min="0"
                  max="999999999.99"
                  step="0.01"
                  placeholder={`Calc: $${quote.pricing.laborCost.toFixed(2)}`}
                  value={laborOverride}
                  onChange={e => setLaborOverride(e.target.value)}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Selling Price Override ($)</Label>
                <Input 
                  type="number" 
                  min="0"
                  max="999999999.99"
                  step="0.01"
                  placeholder={`Calc: $${quote.pricing.calculatedSellingPrice.toFixed(2)}`}
                  value={priceOverride}
                  onChange={e => setPriceOverride(e.target.value)}
                  className="font-mono border-primary/50 focus-visible:ring-primary"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
