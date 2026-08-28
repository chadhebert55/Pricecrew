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
import { Checkbox } from "@/components/ui/checkbox"
import { ArrowLeft, Save, FileText, Check, CheckCircle2, DollarSign, Calculator, TriangleAlert, ExternalLink, Copy, Download, XCircle } from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { useToast } from "@/hooks/use-toast"
import { quoteBuilderRoute } from "@/lib/quote-builder-routes"
import { QuoteExportCard } from "@/components/quote-export-card"

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
          deliberateLossConfirmed: Boolean(updatedQuote.pricing.deliberateLossApproval),
          deliberateLossReason: updatedQuote.pricing.deliberateLossApproval?.reason ?? "",
        })
        setDeliberateLossConfirmed(Boolean(updatedQuote.pricing.deliberateLossApproval))
        setDeliberateLossReason(updatedQuote.pricing.deliberateLossApproval?.reason ?? "")
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
  const [deliberateLossConfirmed, setDeliberateLossConfirmed] = useState(false)
  const [deliberateLossReason, setDeliberateLossReason] = useState("")
  const baseline = useRef("")

  useEffect(() => {
    if (quote && initializedForId.current !== quote.id) {
      initializedForId.current = quote.id
      setLaborOverride(quote.pricing.laborOverride?.toString() || "")
      setPriceOverride(quote.pricing.sellingPriceOverride?.toString() || "")
      setStatus(quote.status)
      setProposalDesc(quote.proposalDescription)
      setDeliberateLossConfirmed(Boolean(quote.pricing.deliberateLossApproval))
      setDeliberateLossReason(quote.pricing.deliberateLossApproval?.reason ?? "")
      baseline.current = JSON.stringify({ laborOverride: quote.pricing.laborOverride?.toString() || "", priceOverride: quote.pricing.sellingPriceOverride?.toString() || "", status: quote.status, proposalDesc: quote.proposalDescription, deliberateLossConfirmed: Boolean(quote.pricing.deliberateLossApproval), deliberateLossReason: quote.pricing.deliberateLossApproval?.reason ?? "" })
    }
  }, [quote])
  const isDirty = baseline.current !== JSON.stringify({ laborOverride, priceOverride, status, proposalDesc, deliberateLossConfirmed, deliberateLossReason })
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
    if (status === "ready" && requiresDeliberateLossConfirmation && !validDeliberateLossConfirmation) {
      toast({ variant: "destructive", title: "Deliberate loss confirmation required", description: "Check the confirmation and record a reason of at least 10 characters." })
      return
    }
    updateQuote.mutate({
      id: quote.id,
      data: {
        status,
        proposalDescription: proposalDesc,
        laborOverride: laborOverride ? parseFloat(laborOverride) : null,
        sellingPriceOverride: priceOverride ? parseFloat(priceOverride) : null,
        deliberateLossConfirmation: requiresDeliberateLossConfirmation && validDeliberateLossConfirmation
          ? { confirmed: true, reason: deliberateLossReason.trim() }
          : undefined,
      }
    })
  }

  const handleMarkReady = () => {
    if (requiresDeliberateLossConfirmation && !validDeliberateLossConfirmation) {
      toast({ variant: "destructive", title: "Deliberate loss confirmation required", description: "This price is below calculated cost. Check the confirmation and record why the loss is intentional." })
      return
    }
    updateQuote.mutate({
      id: quote.id,
      data: {
        status: "ready",
        proposalDescription: proposalDesc,
        laborOverride: laborOverride ? parseFloat(laborOverride) : null,
        sellingPriceOverride: priceOverride ? parseFloat(priceOverride) : null,
        deliberateLossConfirmation: requiresDeliberateLossConfirmation
          ? { confirmed: true, reason: deliberateLossReason.trim() }
          : undefined,
      }
    })
  }

  const handleOpenProposal = () => {
    if (status !== "ready" || hasBlockingWarnings) return
    if (isDirty) {
      toast({ variant: "destructive", title: "Save changes before opening proposal", description: "The customer proposal would otherwise show stale saved details." })
      return
    }
    if (requiresDeliberateLossConfirmation && !validDeliberateLossConfirmation) {
      toast({ variant: "destructive", title: "Deliberate loss confirmation required", description: "Record why the below-cost price is intentional before opening the customer proposal." })
      return
    }
    updateQuote.mutate(
      {
        id: quote.id,
        data: {
          status: "ready",
          deliberateLossConfirmation: requiresDeliberateLossConfirmation
            ? { confirmed: true, reason: deliberateLossReason.trim() }
            : undefined,
        },
      },
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
  const enteredLaborOverride = laborOverride.trim() === "" ? null : Number(laborOverride)
  const enteredSellingPriceOverride = priceOverride.trim() === "" ? null : Number(priceOverride)
  const effectiveLabor =
    enteredLaborOverride !== null && Number.isFinite(enteredLaborOverride)
      ? enteredLaborOverride
      : quote.pricing.laborCost
  const effectiveSellingPrice =
    enteredSellingPriceOverride !== null && Number.isFinite(enteredSellingPriceOverride)
      ? enteredSellingPriceOverride
      : quote.pricing.calculatedSellingPrice
  
  const totalCost = quote.pricing.materialCost + effectiveLabor
  const requiresDeliberateLossConfirmation = effectiveSellingPrice + 0.005 < totalCost
  const validDeliberateLossConfirmation =
    deliberateLossConfirmed && deliberateLossReason.trim().length >= 10
  const gp = quote.pricing.grossProfit
  const margin = quote.pricing.grossMargin * 100
  const estimatorNotes =
    typeof quote.jobInputs.notes === "string" ? quote.jobInputs.notes : ""
  const unresolvedContractorMaterials = quote.assembly.some(
    (line) =>
      line.quantity > 0 &&
      line.unitCost <= 0 &&
      line.source.startsWith("Contractor-entered") &&
      (!line.intentionalExclusionReason || line.intentionalExclusionReason.trim().length < 10),
  )
  const negativeLaborAdjustmentKeys = new Set([
    "laborAdjustmentHours",
    "generalLaborAdjustmentHours",
    "relocationLaborHours",
    "accessDifficultyLaborHours",
    "groundingReworkLaborHours",
    "feederDistanceLaborHours",
    "serviceConditionLaborHours",
    "utilityCoordinationLaborHours",
    "panelRemovalLaborHours",
    "feederInstallationLaborHours",
    "groundingLaborHours",
  ])
  const hasNegativeLaborAdjustment = Object.entries(quote.jobInputs).some(
    ([key, value]) =>
      negativeLaborAdjustmentKeys.has(key) &&
      typeof value === "number" &&
      value < 0,
  )
  const hasBlockingWarnings =
    quote.pricing.pricingWarnings.some((warning) => warning.severity === "error") ||
    unresolvedContractorMaterials ||
    hasNegativeLaborAdjustment

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
        
        <div className="flex flex-wrap items-center gap-2">
          <Button
            data-testid="button-export-quote-header"
            onClick={() => document.getElementById("quote-integrations-exports")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            <Download size={16} className="mr-2" /> Export Quote
          </Button>
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
          This quote cannot be marked ready until all unsafe, unresolved, or invalid pricing inputs are resolved.
        </div>
      )}

      <Card data-testid="quote-proposal-decision">
        <CardHeader>
          <div className="flex items-center gap-2">
            {quote.proposalDecision?.decision === "accepted" ? (
              <CheckCircle2 className="text-emerald-600" size={20} />
            ) : quote.proposalDecision?.decision === "declined" ? (
              <XCircle className="text-amber-600" size={20} />
            ) : (
              <FileText className="text-muted-foreground" size={20} />
            )}
            <CardTitle>Proposal Decision</CardTitle>
          </div>
          <CardDescription>
            Decisions are tied to the exact saved proposal revision and kept as an immutable audit trail.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {quote.proposalDecision ? (
            <div className="rounded-md border bg-muted/20 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={quote.proposalDecision.decision === "accepted" ? "success" : "secondary"}
                  className="capitalize"
                >
                  {quote.proposalDecision.decision}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {new Date(quote.proposalDecision.decidedAt).toLocaleString()}
                </span>
              </div>
              {quote.proposalDecision.customerName && (
                <p className="mt-3 text-sm">
                  Customer: <span className="font-medium">{quote.proposalDecision.customerName}</span>
                </p>
              )}
              {quote.proposalDecision.signature && (
                <p className="mt-1 text-sm">
                  Signature: <span className="font-medium">{quote.proposalDecision.signature}</span>
                </p>
              )}
              {quote.proposalDecision.explanation && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {quote.proposalDecision.explanation}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No customer decision has been recorded for the current saved proposal revision.
            </p>
          )}

          {quote.proposalDecisions.length > 0 && (
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold">Decision audit history</h3>
              <div className="mt-3 space-y-3">
                {quote.proposalDecisions.map((decision) => (
                  <div key={decision.id} className="rounded-md border p-3 text-sm">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="font-medium capitalize">{decision.decision}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(decision.decidedAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Quote revision {decision.revisionNumber} · proposal saved{" "}
                      {new Date(decision.tokenIssuedAt).toLocaleString()}
                    </p>
                    {(decision.customerName || decision.signature) && (
                      <p className="mt-2">
                        {[decision.customerName, decision.signature && `signed ${decision.signature}`]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                    {decision.explanation && (
                      <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                        {decision.explanation}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <QuoteExportCard
        quoteId={quote.id}
        customerName={quote.customerName}
        customerEmail={quote.customerEmail}
        isDirty={isDirty}
      />

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
                    : quote.module === "ADDITION"
                      ? "Addition Builder"
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
              {requiresDeliberateLossConfirmation && (
                <div className="space-y-3 rounded-md border border-destructive/50 bg-destructive/10 p-4" data-testid="deliberate-loss-confirmation">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="deliberate-loss-confirmed"
                      checked={deliberateLossConfirmed}
                      onCheckedChange={(checked) => setDeliberateLossConfirmed(checked === true)}
                    />
                    <div>
                      <Label htmlFor="deliberate-loss-confirmed" className="font-semibold text-destructive">
                        I am deliberately pricing this quote below calculated cost
                      </Label>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Calculated cost is ${totalCost.toFixed(2)}. This approval and its reason are recorded on the quote.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deliberate-loss-reason">Reason for deliberate loss *</Label>
                    <Textarea
                      id="deliberate-loss-reason"
                      value={deliberateLossReason}
                      onChange={(event) => setDeliberateLossReason(event.target.value)}
                      minLength={10}
                      maxLength={500}
                      placeholder="Explain why this below-cost price is intentional..."
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
