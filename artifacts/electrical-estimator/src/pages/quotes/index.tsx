import { useListQuotes } from "@workspace/api-client-react"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Link, useLocation } from "wouter"
import { Plus, Search } from "lucide-react"
import { useState } from "react"

export function QuotesList() {
  const [_, setLocation] = useLocation()
  const { data: quotes, isLoading } = useListQuotes()
  const [search, setSearch] = useState("")

  const filteredQuotes = quotes?.filter(q => 
    q.projectName.toLowerCase().includes(search.toLowerCase()) || 
    q.customerName.toLowerCase().includes(search.toLowerCase()) ||
    q.quoteNumber.toLowerCase().includes(search.toLowerCase())
  ) || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Quotes</h1>
          <p className="text-muted-foreground mt-1">Manage all your estimates and proposals.</p>
        </div>
        <Link href="/quotes/new">
          <Button className="gap-2">
            <Plus size={16} />
            New Quote
          </Button>
        </Link>
      </div>

      <Card>
        <div className="p-4 border-b border-border flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              type="search"
              placeholder="Search quotes..." 
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading quotes...</div>
          ) : filteredQuotes.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No quotes found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Quote #</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredQuotes.map((quote) => (
                  <TableRow 
                    key={quote.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setLocation(`/quotes/${quote.id}`)}
                  >
                    <TableCell className="font-mono font-medium text-primary">{quote.quoteNumber}</TableCell>
                    <TableCell className="font-medium">{quote.projectName}</TableCell>
                    <TableCell>{quote.customerName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-[10px]">{quote.module}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      ${quote.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {quote.margin.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={quote.status === 'READY' ? 'success' : 'secondary'}>
                        {quote.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
