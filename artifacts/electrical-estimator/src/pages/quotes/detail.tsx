import {
  getGetDashboardSummaryQueryKey,
  getGetQuoteQueryKey,
  getListQuotesQueryKey,
  type Takeoff,
  type AdditionCircuitEntry,
  type QuoteStatus,
  useGetQuote,
  useUpdateQuote,
  useGetSettings,
} from "@workspace/api-client-react"
import { pricingWarningKey, pricingWarningMessage } from "@/lib/pricing-warnings"
import { hasUnresolvedMaterialCost } from "@workspace/api-zod/pricing-readiness"
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
import { PlanTakeoffReview } from "@/components/plan-takeoff-review"
import { DEFAULT_PROPOSAL_TERMS } from "@/lib/proposal-presentation"

export function QuoteDetail() {
  const params = useParams<{ id: string }>()
  const quoteId = parseInt(params.id || "0")
  const [_, setLocation] = useLocation()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [view, setView] = useState<"internal" | "customer">("internal")
  const { data: settings } = useGetSettings()
  
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
  const [isTakeoffReviewOpen, setIsTakeoffReviewOpen] = useState(false)
  const [proposedTakeoffCorrection, setProposedTakeoffCorrection] = useState<Takeoff | null>(null)
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
      setIsTakeoffReviewOpen(false)
      setProposedTakeoffCorrection(null)
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
  const gp = effectiveSellingPrice - totalCost
  const margin = effectiveSellingPrice > 0 ? gp / effectiveSellingPrice * 100 : 0
  const estimatorNotes =
    typeof quote.jobInputs.notes === "string" ? quote.jobInputs.notes : ""
  const additionCircuitEntries =
    quote.module === "ADDITION"
      ? (quote.jobInputs as { circuitEntries?: AdditionCircuitEntry[] }).circuitEntries
      : undefined
  const unresolvedMaterialLines = quote.assembly.filter(
    hasUnresolvedMaterialCost,
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
      !(key === "laborAdjustmentHours" && "circuitConfigurationVersion" in quote.jobInputs &&
        quote.jobInputs.circuitConfigurationVersion === 2 &&
        ["KITCHEN", "BATHROOM", "RECESSED_LIGHTING"].includes(quote.module)) &&
      typeof value === "number" &&
      value < 0,
  )
  const hasBlockingWarnings =
    quote.pricing.pricingWarnings.some((warning) => warning.severity === "error") ||
    unresolvedMaterialLines.length > 0 ||
    hasNegativeLaborAdjustment
  const exportPricingBlockers = [
    ...quote.pricing.pricingWarnings
      .filter((warning) => warning.severity === "error")
      .map(pricingWarningMessage),
    ...unresolvedMaterialLines.map((line) => `${contractorMaterialName(line.description)} has no resolved material cost.`),
  ]

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-3 text-muted-foreground" onClick={() => setLocation("/quotes")}>
            <ArrowLeft size={16} className="mr-1" /> Back to Quotes
          </Button>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h1 className="break-words text-3xl font-bold tracking-tight text-foreground">{quote.projectName}</h1>
            <Badge variant={status === 'ready' ? 'success' : 'secondary'} className="text-sm capitalize">
              {status}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 break-words">
            <span className="font-mono text-primary font-medium">{quote.quoteNumber}</span> &bull; 
            {quote.customerName} {quote.customerEmail && `(${quote.customerEmail})`}
          </p>
          <p className="mt-2 text-sm">Proposal: {quote.proposalDecision?.decision === "accepted" ? "Accepted" :
            quote.proposalDecision?.decision === "declined" ? "Declined" : "No decision recorded"}</p>
          {view === "internal" && <div className="mt-3">
            <p className="text-xl font-semibold text-primary">Selling Price: ${quote.pricing.finalSellingPrice.toFixed(2)}</p>
            <p className="text-sm text-muted-foreground">Cost: ${(quote.pricing.materialCost + (quote.pricing.laborOverride ?? quote.pricing.laborCost)).toFixed(2)} | Gross Profit: ${quote.pricing.grossProfit.toFixed(2)} | Margin: {(quote.pricing.grossMargin * 100).toFixed(1)}%</p>
          </div>}
        </div>
        
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Button
            className="w-full sm:w-auto"
            data-testid="button-export-quote-header"
            variant="outline"
            onClick={() => document.getElementById("quote-integrations-exports")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            disabled={hasBlockingWarnings}
            title={hasBlockingWarnings ? "Resolve pricing errors before opening export" : undefined}
          >
            <Download size={16} className="mr-2" /> Export
          </Button>
          <Button className="w-full sm:w-auto" data-testid="button-duplicate-quote" variant="outline" onClick={handleDuplicate}>
            <Copy size={16} className="mr-2" /> Duplicate / Revise
          </Button>
          <Button className="w-full sm:w-auto" onClick={handleOpenProposal} disabled={status !== "ready" || hasBlockingWarnings || updateQuote.isPending} title={status !== "ready" ? "Mark this quote ready before opening the customer proposal" : undefined}>
            <ExternalLink size={16} className="mr-2" /> Customer Proposal
          </Button>
          {status !== 'ready' && (
             <Button variant="outline" className="w-full border-emerald-500 text-emerald-600 hover:bg-emerald-50 sm:w-auto" onClick={handleMarkReady} disabled={updateQuote.isPending || hasBlockingWarnings} title={hasBlockingWarnings ? "Resolve pricing errors before marking ready" : undefined}>
              <Check size={16} className="mr-2" /> Mark Ready
            </Button>
          )}
          <Button className="w-full sm:w-auto" data-testid="button-save-quote" onClick={handleSaveOverrides} disabled={updateQuote.isPending}>
            <Save size={16} className="mr-2" /> {updateQuote.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
      {status !== "ready" && hasBlockingWarnings && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          This quote cannot be marked ready until all unsafe, unresolved, or invalid pricing inputs are resolved.
        </div>
      )}

      {(quote.proposalDecision || quote.proposalDecisions.length > 0) && <Card data-testid="quote-proposal-decision">
        <CardHeader>
          <div className="flex items-center gap-2">
            {quote.proposalDecision?.decision === "accepted" ? (
              <CheckCircle2 className="text-emerald-600" size={20} />
            ) : quote.proposalDecision?.decision === "declined" ? (
              <XCircle className="text-amber-600" size={20} />
            ) : (
              <FileText className="text-muted-foreground" size={20} />
            )}
            <CardTitle>Proposal Activity / Decision</CardTitle>
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
      </Card>}
      <div className="flex gap-2" aria-label="Quote view">
        <Button variant={view === "internal" ? "default" : "outline"} onClick={() => setView("internal")}>Internal View</Button>
        <Button variant={view === "customer" ? "default" : "outline"} onClick={() => setView("customer")}>Customer View</Button>
      </div>
      {view === "customer" && <Card data-testid="customer-view-preview">
        <CardHeader><CardTitle>{settings?.companyName ?? "Customer proposal"}</CardTitle><CardDescription>Proposal #{quote.quoteNumber} · {new Date(quote.createdAt).toLocaleDateString()}</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          <h2 className="text-xl font-semibold">{quote.projectName}</h2>
          <p className="whitespace-pre-wrap">{proposalDesc}</p>
          <div><h3 className="font-semibold">Included Scope</h3><ul className="mt-2 space-y-2">{quote.customerScope?.map(line =>
            <li key={line.id} className="flex justify-between gap-3"><span>{line.description}</span><span>{line.displayValue ?? `${line.quantity} ${line.unit}`}</span></li>)}</ul></div>
          <div><p>Total Investment</p><p className="text-3xl font-bold text-primary">${quote.pricing.finalSellingPrice.toFixed(2)}</p></div>
          <div><h3 className="font-semibold">Terms</h3><p className="whitespace-pre-wrap text-sm">{settings?.proposalTerms || DEFAULT_PROPOSAL_TERMS}</p></div>
          <p className="text-xs text-muted-foreground">Preview only. Use Customer Proposal for the version with acceptance controls. Save any edits first.</p>
        </CardContent>
      </Card>}
      {view === "internal" && <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Col - Proposal & Assembly */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <FileText className="text-muted-foreground" size={20} />
                <CardTitle>Customer-Facing Scope / Proposal Description</CardTitle>
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
              <Table className="min-w-[38rem]">
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
                        {line.extendedCost === 0 && line.intentionalExclusionReason ?
                          /customer.supplied/i.test(line.intentionalExclusionReason) ? "Customer Supplied" :
                          /reus|existing/i.test(line.intentionalExclusionReason) ? "Existing / Reused" :
                          /included/i.test(line.intentionalExclusionReason) ? "Included" : "No additional charge"
                          : `$${line.extendedCost.toFixed(2)}`}
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

          <details className="rounded-lg border bg-card p-4">
            <summary className="cursor-pointer text-sm font-semibold">Advanced → Builder Inputs & Calculation Details</summary>
          <Card className="mt-3 border-0 shadow-none">
            <CardHeader>
              <CardTitle>Builder Inputs Record</CardTitle>
              <CardDescription>The parametric values used to generate this estimate.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3 text-sm">
                {Object.entries(quote.jobInputs).map(([key, value]) => {
                   if (key === 'notes' || key === "circuitEntries") return null;
                  const label =
                    key === "bedroomCount"
                      ? "Bedroom Count"
                      : key === "bathroomQuantity"
                        ? "Bathroom Count"
                        : key.replace(/([A-Z])/g, ' $1').trim()
                  return (
                    <div key={key} className="flex flex-col">
                      <span className="text-muted-foreground text-xs uppercase tracking-wider truncate">{label}</span>
                      <span className="font-medium whitespace-pre-wrap break-words">{readableInput(value)}</span>
                    </div>
                  )
                })}
                {additionCircuitEntries && additionCircuitEntries.length > 0 && (
                  <div className="col-span-full mt-2 rounded-lg border border-primary/20 bg-primary/5 p-4" data-testid="addition-circuit-schedule">
                    <h3 className="text-sm font-semibold">Circuit schedule</h3>
                    <div className="mt-3 grid gap-2 text-sm">
                      {additionCircuitEntries.map((entry, index) => (
                        <div key={index} className="flex flex-col gap-1 rounded-md border bg-background/70 p-3 sm:flex-row sm:items-center sm:justify-between">
                          <span className="font-medium">{entry.label ? <><span className="font-semibold">{entry.label}</span>{" · "}</> : null}{entry.quantity} × {entry.amperage}A {entry.poleCount}-pole {entry.protectionType}</span>
                          <span className="text-muted-foreground">{entry.cableType}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {estimatorNotes && (
                <div className="mt-4 pt-4 border-t border-border">
                  <span className="text-muted-foreground text-xs uppercase tracking-wider block mb-1">Estimator Notes</span>
                  <span className="font-mono text-xs text-foreground/80">{estimatorNotes}</span>
                </div>
              )}
            </CardContent>
          </Card>
          </details>

          {quote.takeoffReview && (
            <Card data-testid="quote-takeoff-audit">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText size={20} className="text-primary" />
                   Blueprint Takeoff Review · Original Saved Approval
                </CardTitle>
                <CardDescription>
                   Approved plan quantities and the immutable review trail saved with this quote. Reopened corrections are kept separate from this original snapshot.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 p-3 text-sm">
                  <span className="font-medium">{quote.takeoffReview.fileName}</span>
                  <span className="text-xs text-muted-foreground">
                    Approved {new Date(quote.takeoffReview.approvedAt).toLocaleString()}
                  </span>
                </div>
                <div className="space-y-3">
                  {quote.takeoffReview.items.map((item) => (
                    <div key={item.id} className="rounded-md border p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {item.status === "accepted" ? (
                            <CheckCircle2 size={16} className="text-emerald-500" />
                          ) : item.status === "rejected" ? (
                            <XCircle size={16} className="text-destructive" />
                          ) : (
                            <TriangleAlert size={16} className="text-amber-500" />
                          )}
                          <span className="font-medium">{item.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{item.confidence} confidence</Badge>
                          <Badge variant={item.status === "accepted" ? "default" : "secondary"}>
                            {item.status}
                          </Badge>
                        </div>
                      </div>
                      <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-[auto_1fr]">
                        <span>
                          Proposed {item.proposedQuantity}
                          {item.status === "accepted" && ` · approved ${item.approvedQuantity}`}
                        </span>
                        <span className="sm:text-right">
                          {item.sourcePage ? `Page ${item.sourcePage}: ` : ""}
                          “{item.sourceContext}”
                        </span>
                      </div>
                      {item.reviewerNote && (
                        <p className="mt-2 rounded bg-muted/40 p-2 text-xs">{item.reviewerNote}</p>
                      )}
                    </div>
                  ))}
                </div>
                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold">Review audit history</h3>
                  <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                    {quote.takeoffReview.reviewEvents.map((event) => (
                      <div key={event.id} className="flex flex-col justify-between gap-1 rounded border p-2 sm:flex-row">
                        <span className="capitalize">
                          {event.action} · {event.previousStatus} → {event.nextStatus}
                          {event.nextQuantity !== null ? ` · quantity ${event.nextQuantity}` : ""}
                        </span>
                        <span>{new Date(event.reviewedAt).toLocaleString()}</span>
                         {event.note && (
                           <span className="whitespace-pre-wrap sm:max-w-[45%] sm:text-right">
                             Note: {event.note}
                           </span>
                         )}
                      </div>
                    ))}
                  </div>
                </div>
                 <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                   <p className="max-w-2xl text-sm text-muted-foreground">
                     Need to correct a saved approval? Reopen the live blueprint review to stage it, then explicitly confirm the new audit entry. The original quote snapshot above is never rewritten.
                   </p>
                   <Button
                     type="button"
                     variant="outline"
                     onClick={() => setIsTakeoffReviewOpen((current) => !current)}
                     data-testid="button-reopen-takeoff-review"
                   >
                     {isTakeoffReviewOpen ? "Hide correction review" : "Reopen saved review"}
                   </Button>
                 </div>
              </CardContent>
            </Card>
          )}
           {quote.takeoffReview && proposedTakeoffCorrection && (
             <Card data-testid="quote-takeoff-proposed-correction" className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
               <CardHeader>
                 <CardTitle className="flex items-center gap-2">
                   <TriangleAlert size={20} className="text-amber-600" />
                   Later Proposed Correction
                 </CardTitle>
                 <CardDescription>
                   This is the current takeoff review after a confirmed correction. It is intentionally separate from the original saved quote approval above.
                 </CardDescription>
               </CardHeader>
               <CardContent className="space-y-3">
                 {proposedTakeoffCorrection.items
                   .filter((item) => {
                     const original = quote.takeoffReview?.items.find((candidate) => candidate.id === item.id)
                     return (
                       !original ||
                       original.status !== item.status ||
                       original.approvedQuantity !== item.approvedQuantity ||
                       original.reviewerNote !== item.reviewerNote
                     )
                   })
                   .map((item) => (
                     <div key={item.id} className="rounded-md border border-amber-300/70 bg-background/70 p-3 text-sm">
                       <div className="flex flex-wrap items-center justify-between gap-2">
                         <span className="font-medium">{item.label}</span>
                         <Badge variant="outline">{item.status}</Badge>
                       </div>
                       <p className="mt-1 text-xs text-muted-foreground">
                         Original: {quote.takeoffReview?.items.find((candidate) => candidate.id === item.id)?.status ?? "not recorded"}
                         {" · "}Current: {item.status}
                         {item.approvedQuantity !== null ? ` · quantity ${item.approvedQuantity}` : ""}
                       </p>
                       {item.reviewerNote && (
                         <p className="mt-2 rounded bg-muted/40 p-2 text-xs">Note: {item.reviewerNote}</p>
                       )}
                     </div>
                   ))}
                 <p className="text-xs text-muted-foreground">
                   Confirmed {new Date(proposedTakeoffCorrection.items
                     .map((item) => item.reviewedAt)
                      .filter((reviewedAt): reviewedAt is string => reviewedAt !== null)
                      .map((reviewedAt) => new Date(reviewedAt).getTime())
                      .sort((left, right) => right - left)[0] ?? proposedTakeoffCorrection.createdAt).toLocaleString()}
                   {" · "}{proposedTakeoffCorrection.reviewEvents.length} total audit events
                 </p>
               </CardContent>
             </Card>
           )}
           {quote.takeoffReview && isTakeoffReviewOpen && (
             <PlanTakeoffReview
               module={quote.module === "ADDITION" ? "ADDITION" : "NEW_HOUSE"}
               baseInputs={quote.jobInputs as unknown as Record<string, unknown>}
               savedTakeoffId={quote.takeoffReview.takeoffId}
               onTakeoffApplied={() => undefined}
               onCorrectionConfirmed={setProposedTakeoffCorrection}
               onClose={() => setIsTakeoffReviewOpen(false)}
             />
           )}
        </div>

        {/* Right Col - Pricing & Overrides */}
        <div className="space-y-6 lg:sticky lg:top-4 self-start">
          {(quote.pricing.pricingWarnings.length > 0 || exportPricingBlockers.length > 0 || quote.assembly.some(l => /customer.supplied/i.test(l.intentionalExclusionReason ?? ""))) && (
            <Card className="border-amber-500/30">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <TriangleAlert size={20} />
                  <CardTitle className="text-lg">Issues to Review</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{exportPricingBlockers.length} pricing issues · {quote.pricing.pricingWarnings.filter(w => w.severity !== "error").length} field-verification notes · {quote.assembly.filter(l => /customer.supplied/i.test(l.intentionalExclusionReason ?? "")).length} customer-supplied items</p>
                <details className="mt-2"><summary className="cursor-pointer text-sm">Review Issues</summary>
                  {(["Pricing", "Field Verification", "Customer-Supplied"] as const).map(group => <div key={group} className="mt-3 text-sm">
                    <h4 className="font-semibold">{group}</h4><ul className="list-disc space-y-1 pl-5">
                      {group === "Customer-Supplied" ? quote.assembly.filter(l => /customer.supplied/i.test(l.intentionalExclusionReason ?? "")).map(l => <li key={l.id}>{l.description}: purchase cost intentionally excluded.</li>) :
                        quote.pricing.pricingWarnings.filter(w => group === "Pricing" ? w.severity === "error" : w.severity !== "error").map((warning, index) =>
                          <li key={pricingWarningKey(warning, index)}>{pricingWarningMessage(warning)}</li>)}
                    </ul></div>)}
                </details>
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
                  <span className="font-mono">${effectiveLabor.toFixed(2)}</span>
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
                  <span>Total Internal Cost</span>
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

          <details className="rounded-lg border bg-card p-4">
            <summary className="cursor-pointer text-sm font-semibold">Advanced Pricing Overrides {laborOverride !== "" || priceOverride !== "" ? "· Active" : ""}</summary>
          <Card className="mt-3 border-0 shadow-none">
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
          </details>
        </div>
      </div>}
      {view === "internal" && <QuoteExportCard quote={quote} isDirty={isDirty} pricingBlockers={exportPricingBlockers}/>}
    </div>
  )
}

function readableInput(value: unknown): string {
  if (value == null) return "Not set"
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (Array.isArray(value)) return value.map((v, i) => `${i + 1}. ${readableInput(v)}`).join("\n") || "None"
  if (typeof value === "object") return Object.entries(value).map(([k, v]) =>
    `${k.replace(/([A-Z])/g, " $1")}: ${readableInput(v)}`).join(" · ")
  return String(value)
}
