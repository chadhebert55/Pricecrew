import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getGetCustomerProposalQueryKey, useGetCustomerProposal } from "@workspace/api-client-react"
import { Printer } from "lucide-react"
import { useParams } from "wouter"

export function QuoteProposal() {
  const params = useParams<{ token: string }>()
  const token = params.token || ""
  const { data: quote, isLoading } = useGetCustomerProposal(token, {
    query: { enabled: token.length > 0, queryKey: getGetCustomerProposalQueryKey(token) },
  })

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading proposal…</div>
  }
  if (!quote) {
    return <div className="p-8 text-center text-destructive">Proposal not found.</div>
  }

  const canPrint = quote.status === "ready"

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-16">
      <div className="flex justify-end print:hidden">
        <Button disabled={!canPrint} onClick={() => window.print()}>
          <Printer size={16} className="mr-2" /> Print proposal
        </Button>
      </div>

      <Card className="print:border-0 print:shadow-none">
        <CardHeader className="border-b">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-primary">Customer Proposal</p>
              <CardTitle className="mt-2 text-3xl">{quote.projectName}</CardTitle>
              <p className="mt-2 text-muted-foreground">Prepared for {quote.customerName}</p>
              {quote.customerEmail && <p className="text-sm text-muted-foreground">{quote.customerEmail}</p>}
            </div>
            <div className="text-right">
              <Badge variant={canPrint ? "success" : "secondary"} className="capitalize">{quote.status}</Badge>
              <p className="mt-2 font-mono text-sm text-muted-foreground">{quote.quoteNumber}</p>
              <p className="text-sm text-muted-foreground">{new Date(quote.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-8 pt-6">
          <section>
            <h2 className="mb-3 text-lg font-semibold">Proposed Work</h2>
            <p className="whitespace-pre-wrap leading-7 text-foreground/85">{quote.proposalDescription}</p>
          </section>

          {quote.scope.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">Included Scope</h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quote.scope.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>{line.description}</TableCell>
                      <TableCell className="text-right font-mono">{line.quantity} {line.unit}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          )}

          <section className="rounded-lg bg-primary/5 p-6 text-right">
            <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Total Investment</p>
            <p className="mt-1 font-mono text-4xl font-bold text-primary">
              ${quote.finalSellingPrice.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </section>

          <p className="border-t pt-5 text-sm text-muted-foreground">
            Final installation details remain subject to site conditions and the proposed scope above.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}