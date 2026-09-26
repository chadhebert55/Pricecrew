import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  getGetCustomerProposalQueryKey,
  useGetCustomerProposal,
  useSubmitProposalDecision,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, Download, Printer, XCircle } from "lucide-react"
import { proposalDate, proposalScopeValue, proposalTerms } from "@/lib/proposal-presentation"
import { useEffect, useRef, useState } from "react"
import { useParams } from "wouter"

function safeCssColor(value: string) {
  const candidate = value.trim()
  // Permit only standard hex colors; never inject arbitrary CSS values from settings.
  return /^#[0-9a-f]{3,8}$/i.test(candidate) ? candidate : "#2563eb"
}

export function QuoteProposal() {
  const params = useParams<{ token: string }>()
  const token = params.token || ""
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<"accepted" | "declined" | null>(null)
  const [customerName, setCustomerName] = useState("")
  const [signature, setSignature] = useState("")
  const [explanation, setExplanation] = useState("")
  const [submitError, setSubmitError] = useState("")
  const [pdfPending, setPdfPending] = useState(false)
  const [pdfError, setPdfError] = useState("")
  const [scopeAcknowledged, setScopeAcknowledged] = useState(false)
  const initializedForToken = useRef("")
  const { data: quote, isLoading } = useGetCustomerProposal(token, {
    query: { enabled: token.length > 0, queryKey: getGetCustomerProposalQueryKey(token) },
  })
  const submitDecision = useSubmitProposalDecision({
    mutation: {
      onSuccess: (decision) => {
        queryClient.setQueryData(
          getGetCustomerProposalQueryKey(token),
          (current: typeof quote) =>
            current
              ? {
                  ...current,
                  decision: {
                    decision: decision.decision,
                    customerName: decision.customerName,
                    decidedAt: decision.decidedAt,
                  },
                }
              : current,
        )
        setDialog(null)
        setSubmitError("")
      },
      onError: (error) => {
        void queryClient.invalidateQueries({
          queryKey: getGetCustomerProposalQueryKey(token),
        })
        setSubmitError(
          error instanceof Error
            ? error.message
            : "The decision could not be recorded. Please try again.",
        )
      },
    },
  })

  useEffect(() => {
    if (quote && initializedForToken.current !== token) {
      initializedForToken.current = token
      setCustomerName(quote.customerName)
      setScopeAcknowledged(false)
    }
  }, [quote, token])

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading proposal…</div>
  }
  if (!quote) {
    return (
      <div
        className="mx-auto max-w-2xl p-8 text-center"
        data-testid="proposal-unavailable"
      >
        <h1 className="text-2xl font-semibold text-foreground">Proposal unavailable</h1>
        <p className="mt-2 text-muted-foreground">
          This proposal link is no longer current. Please ask the contractor for a new link.
        </p>
      </div>
    )
  }

  const canPrint = quote.status === "ready"
  const accentColor = safeCssColor(quote.company.accentColor)
  const downloadPdf = async () => {
    setPdfPending(true); setPdfError("")
    try {
      const { downloadProposalPdf } = await import("@/lib/proposal-pdf")
      await downloadProposalPdf(quote)
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : "PDF download failed. Please try again.")
    } finally { setPdfPending(false) }
  }
  const openDecisionDialog = (decision: "accepted" | "declined") => {
    if (decision === "accepted" && !scopeAcknowledged) return
    setSubmitError("")
    setDialog(decision)
  }
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!dialog) return
    if (dialog === "accepted" && !scopeAcknowledged) return
    submitDecision.mutate({
      token,
      data: {
        decision: dialog,
        scopeAcknowledged: dialog === "accepted" ? scopeAcknowledged : undefined,
        customerName: customerName.trim() || undefined,
        signature: dialog === "accepted" ? signature.trim() || undefined : undefined,
        explanation: explanation.trim() || undefined,
      },
    })
  }

  return (
    <div className="customer-proposal mx-auto max-w-4xl space-y-6 pb-16 print:max-w-none print:pb-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <p className="text-sm text-muted-foreground">
          Download a customer-ready PDF with your company footer. For browser printing, turn off Headers and footers to hide the web address.
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" data-testid="button-print-customer-quote" disabled={!canPrint} onClick={() => window.print()}>
            <Printer size={16} className="mr-2" /> Print
          </Button>
          <Button data-testid="button-download-customer-pdf" disabled={!canPrint || pdfPending} onClick={downloadPdf}>
            <Download size={16} className="mr-2" /> {pdfPending ? "Preparing PDF…" : "Download PDF"}
          </Button>
        </div>
      </div>
      {pdfError && <p className="text-sm text-destructive print:hidden" role="alert">{pdfError}</p>}

      <Card className="print:border-0 print:shadow-none" style={{ borderTopColor: accentColor, borderTopWidth: "4px" }}>
        <CardHeader className="border-b">
          <div className="proposal-heading flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest" style={{ color: accentColor }}>Customer Proposal</p>
              <CardTitle className="mt-2 text-3xl">{quote.projectName}</CardTitle>
              <p className="mt-2 text-muted-foreground">Prepared for {quote.customerName}</p>
            </div>
            <div className="text-sm text-muted-foreground md:text-right">
              <div className="mb-4" data-testid="proposal-reference">
                <p className="font-semibold text-foreground">Proposal #{quote.quoteNumber}</p>
                <p>{proposalDate(quote.createdAt)}</p>
              </div>
              <p className="font-semibold text-foreground">{quote.company.displayName}</p>
              {quote.company.contactPhone && <p>{quote.company.contactPhone}</p>}
              {quote.company.contactEmail && <p>{quote.company.contactEmail}</p>}
              {quote.company.contactAddress && <p className="whitespace-pre-wrap">{quote.company.contactAddress}</p>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-8 pt-6">
          <section>
            <h2 className="mb-3 text-lg font-semibold">Proposed Work</h2>
            <p className="whitespace-pre-wrap leading-7 text-foreground/85">{quote.proposalDescription}</p>
          </section>

          {quote.scope.length > 0 && (
            <section className="proposal-scope">
              <h2 className="mb-3 text-lg font-semibold">Included Scope</h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Scope</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quote.scope.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>{line.description}</TableCell>
                      <TableCell className="text-right">{proposalScopeValue(line)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          )}
          {!!quote.assumptions?.length && (
            <section className="text-sm">
              <h2 className="mb-2 text-lg font-semibold">Assumptions</h2>
              {quote.assumptions.map((assumption, index) => <p key={index} className="leading-6 text-muted-foreground">{assumption}</p>)}
            </section>
          )}

          <section className="proposal-total rounded-lg bg-primary/5 p-6 text-right">
            <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Total Investment</p>
            <p className="mt-1 font-mono text-4xl font-bold" style={{ color: accentColor }}>
              ${quote.finalSellingPrice.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </section>

          <section className="print:hidden">
            {quote.decision ? (
              <div
                data-testid="proposal-decision-status"
                className={`rounded-lg border p-5 ${
                  quote.decision.decision === "accepted"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                    : "border-amber-300 bg-amber-50 text-amber-950"
                }`}
              >
                <div className="flex items-start gap-3">
                  {quote.decision.decision === "accepted" ? (
                    <CheckCircle2 className="mt-0.5 shrink-0" size={22} />
                  ) : (
                    <XCircle className="mt-0.5 shrink-0" size={22} />
                  )}
                  <div>
                    <h2 className="font-semibold">
                      Proposal {quote.decision.decision}
                    </h2>
                    <p className="mt-1 text-sm">
                      Recorded {new Date(quote.decision.decidedAt).toLocaleString()}
                      {quote.decision.customerName
                        ? ` for ${quote.decision.customerName}`
                        : ""}.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border bg-muted/20 p-5">
                <h2 className="text-lg font-semibold">Your decision</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Review the scope, total investment, and terms before making your decision.
                </p>
                <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm leading-6">
                  <input type="checkbox" className="mt-1 h-4 w-4 shrink-0"
                    style={{ accentColor }} data-testid="checkbox-proposal-agreement"
                    checked={scopeAcknowledged}
                    onChange={(event) => setScopeAcknowledged(event.target.checked)} />
                  <span>I have reviewed and agree to the proposed scope, total investment, and terms.</span>
                </label>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Button
                    data-testid="button-accept-proposal"
                    className="h-11"
                    style={{ backgroundColor: accentColor, color: "#ffffff" }}
                    disabled={!scopeAcknowledged}
                    onClick={() => openDecisionDialog("accepted")}
                  >
                    <CheckCircle2 size={17} className="mr-2" />
                    Accept proposal
                  </Button>
                  <Button
                    data-testid="button-decline-proposal"
                    variant="outline"
                    className="h-11"
                    onClick={() => openDecisionDialog("declined")}
                  >
                    <XCircle size={17} className="mr-2" />
                    Decline proposal
                  </Button>
                </div>
              </div>
            )}
          </section>

          <section className="border-t pt-5 text-sm text-muted-foreground">
            <h2 className="mb-2 font-semibold text-foreground">Terms</h2>
            <p className="whitespace-pre-wrap leading-6">{proposalTerms(quote)}</p>
          </section>
          <section className="proposal-acceptance hidden print:block text-sm">
            <h2 className="mb-3 font-semibold">Acceptance</h2>
            <p>Customer name: __________________  Signature: __________________  Date: __________</p>
            <p className="mt-2 text-xs text-muted-foreground">By signing, the customer approves the scope, total, and terms of this proposal.</p>
          </section>
          <footer className="border-t pt-3 text-xs text-muted-foreground">
            {[quote.company.displayName, quote.company.contactPhone, quote.company.contactEmail].filter(Boolean).join(" | ")}
          </footer>
        </CardContent>
      </Card>

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open && !submitDecision.isPending) setDialog(null)
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)] sm:max-w-lg">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>
                {dialog === "accepted" ? "Accept this proposal" : "Decline this proposal"}
              </DialogTitle>
              <DialogDescription>
                {dialog === "accepted"
                  ? "Enter your name and signature to accept this exact proposal revision."
                  : "You may include your name or a short explanation for the contractor."}
              </DialogDescription>
            </DialogHeader>

            <div className="my-5 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="decision-customer-name">
                  Customer name {dialog === "accepted" ? "(required)" : "(optional)"}
                </Label>
                <Input
                  id="decision-customer-name"
                  data-testid="input-decision-customer-name"
                  autoComplete="name"
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  required={dialog === "accepted"}
                  disabled={submitDecision.isPending}
                />
              </div>
              {dialog === "accepted" && (
                <div className="space-y-2">
                  <Label htmlFor="decision-signature">Signature (required)</Label>
                  <Input
                    id="decision-signature"
                    data-testid="input-decision-signature"
                    value={signature}
                    onChange={(event) => setSignature(event.target.value)}
                    placeholder="Type your full legal name"
                    required
                    disabled={submitDecision.isPending}
                  />
                  <p className="text-xs text-muted-foreground">
                    Typing your name here records your electronic signature and acceptance timestamp.
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="decision-explanation">
                  {dialog === "accepted" ? "Note (optional)" : "Explanation (optional)"}
                </Label>
                <Textarea
                  id="decision-explanation"
                  data-testid="input-decision-explanation"
                  value={explanation}
                  onChange={(event) => setExplanation(event.target.value)}
                  maxLength={2000}
                  disabled={submitDecision.isPending}
                />
              </div>
              {submitError && (
                <p
                  role="alert"
                  className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                >
                  {submitError}
                </p>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialog(null)}
                disabled={submitDecision.isPending}
              >
                Cancel
              </Button>
              <Button
                data-testid="button-submit-decision"
                type="submit"
                variant={dialog === "declined" ? "destructive" : "default"}
                style={dialog === "accepted" ? { backgroundColor: accentColor, color: "#ffffff" } : undefined}
                disabled={
                  submitDecision.isPending ||
                  (dialog === "accepted" &&
                    (!scopeAcknowledged || !customerName.trim() || !signature.trim()))
                }
              >
                {submitDecision.isPending
                  ? "Recording..."
                  : dialog === "accepted"
                    ? "Sign and accept"
                    : "Decline proposal"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
