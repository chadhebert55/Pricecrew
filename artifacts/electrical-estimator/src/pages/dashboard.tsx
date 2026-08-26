import { useGetDashboardSummary } from "@workspace/api-client-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FileText, CheckCircle2, FileEdit, TrendingUp, ArrowRight } from "lucide-react"
import { Link } from "wouter"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export function Dashboard() {
  const { data: summary, isLoading, error } = useGetDashboardSummary()

  if (isLoading) return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading dashboard data...</div>
  if (error || !summary) return <div className="p-8 text-center text-destructive">Failed to load dashboard data.</div>

  const metrics = [
    { label: "Total Quotes", value: summary.totalQuotes, icon: FileText },
    { label: "Draft Quotes", value: summary.draftQuotes, icon: FileEdit },
    { label: "Ready Quotes", value: summary.readyQuotes, icon: CheckCircle2 },
    { label: "Average Margin", value: `${(summary.averageMargin * 100).toFixed(1)}%`, icon: TrendingUp },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of your estimating performance.</p>
        </div>
        <Link href="/quotes/new">
          <Button className="gap-2">
            New Quote
            <ArrowRight size={16} />
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {metric.label}
              </CardTitle>
              <metric.icon size={16} className="text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">{metric.value}</div>
            </CardContent>
          </Card>
        ))}
        <Card className="col-span-1 md:col-span-2 lg:col-span-4 bg-secondary text-secondary-foreground border-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-secondary-foreground/70">
              Total Quoted Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold font-mono text-primary">
              ${summary.totalQuoted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight">Recent Quotes</h2>
          <Link href="/quotes">
            <Button variant="outline" size="sm">View All</Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {summary.recentQuotes.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                No recent quotes found.
              </CardContent>
            </Card>
          ) : (
            summary.recentQuotes.map((quote) => (
              <Link key={quote.id} href={`/quotes/${quote.id}`}>
                <Card className="hover:border-primary transition-colors cursor-pointer group">
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-primary font-medium">{quote.quoteNumber}</span>
                        <Badge variant={quote.status === 'ready' ? 'success' : 'secondary'}>
                          {quote.status}
                        </Badge>
                      </div>
                      <h3 className="font-bold text-lg group-hover:text-primary transition-colors">{quote.projectName}</h3>
                      <p className="text-sm text-muted-foreground">{quote.customerName} &bull; {quote.module}</p>
                    </div>
                    <div className="flex flex-col sm:items-end gap-1">
                      <div className="font-mono font-bold text-lg">
                        ${quote.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Margin: <span className="font-mono text-foreground">{(quote.margin * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
