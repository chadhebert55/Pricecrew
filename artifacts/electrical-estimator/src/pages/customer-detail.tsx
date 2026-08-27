import {
  getGetCustomerQueryKey,
  getListCustomersQueryKey,
  useGetCustomer,
  useUpdateCustomer,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Mail, Pencil, Save } from "lucide-react"
import { useEffect, useState } from "react"
import { useLocation, useParams } from "wouter"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export function CustomerDetail() {
  const params = useParams<{ id: string }>()
  const customerId = Number(params.id)
  const [, setLocation] = useLocation()
  const queryClient = useQueryClient()
  const { data: customer, isLoading } = useGetCustomer(customerId, {
    query: {
      enabled: Number.isFinite(customerId) && customerId > 0,
      queryKey: getGetCustomerQueryKey(customerId),
    },
  })
  const updateCustomer = useUpdateCustomer()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")

  useEffect(() => {
    if (!customer) return
    setName(customer.name)
    setEmail(customer.email ?? "")
  }, [customer])

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading customer...</div>
  if (!customer) return <div className="p-8 text-center text-destructive">Customer not found.</div>

  const save = () => {
    updateCustomer.mutate(
      { id: customer.id, data: { name, email: email || null } },
      {
        onSuccess: (updated) => {
          queryClient.setQueryData(getGetCustomerQueryKey(customer.id), {
            ...customer,
            ...updated,
          })
          void queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() })
          setEditing(false)
        },
      },
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="-ml-3 mb-2 text-muted-foreground" onClick={() => setLocation("/customers")}><ArrowLeft size={16} className="mr-1" /> Back to Customers</Button>
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{customer.name}</h1>
            <p className="mt-1 flex items-center gap-2 text-muted-foreground"><Mail size={15} /> {customer.email ?? "No email on file"}</p>
          </div>
          <Button variant={editing ? "default" : "outline"} onClick={() => editing ? save() : setEditing(true)} disabled={updateCustomer.isPending || !name.trim()}>
            {editing ? <Save size={16} className="mr-2" /> : <Pencil size={16} className="mr-2" />}
            {editing ? "Save Customer" : "Edit Customer"}
          </Button>
        </div>
      </div>

      {editing && (
        <Card>
          <CardHeader><CardTitle>Customer Details</CardTitle><CardDescription>Email addresses are unique within the company to prevent accidental customer merges.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="customer-detail-name">Name</Label><Input id="customer-detail-name" value={name} onChange={(event) => setName(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="customer-detail-email">Email</Label><Input id="customer-detail-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
            {updateCustomer.isError && <p className="text-sm text-destructive md:col-span-2">This customer could not be updated. Check that the email is not already in use.</p>}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-5"><div className="text-xs uppercase tracking-wider text-muted-foreground">Quotes</div><div className="mt-1 text-2xl font-bold">{customer.quoteCount}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-xs uppercase tracking-wider text-muted-foreground">Total Quoted</div><div className="mt-1 text-2xl font-bold">${customer.totalQuoted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-xs uppercase tracking-wider text-muted-foreground">Latest Activity</div><div className="mt-1 text-lg font-bold">{customer.latestQuoteAt ? new Date(customer.latestQuoteAt).toLocaleDateString() : "No quotes yet"}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Quote History</CardTitle><CardDescription>Every estimate linked to this customer.</CardDescription></CardHeader>
        <CardContent className="p-0">
          {customer.quotes.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">No quotes have been created for this customer.</div>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Quote</TableHead><TableHead>Project</TableHead><TableHead>Module</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead><TableHead>Updated</TableHead></TableRow></TableHeader>
              <TableBody>
                {customer.quotes.map((quote) => (
                  <TableRow key={quote.id} className="cursor-pointer" onClick={() => setLocation(`/quotes/${quote.id}`)}>
                    <TableCell className="font-mono font-medium text-primary">{quote.quoteNumber}</TableCell>
                    <TableCell className="font-medium">{quote.projectName}</TableCell>
                    <TableCell><Badge variant="outline">{quote.module.replaceAll("_", " ")}</Badge></TableCell>
                    <TableCell className="text-right font-mono">${quote.total.toFixed(2)}</TableCell>
                    <TableCell><Badge variant={quote.status === "ready" ? "success" : "secondary"}>{quote.status}</Badge></TableCell>
                    <TableCell>{new Date(quote.updatedAt).toLocaleDateString()}</TableCell>
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