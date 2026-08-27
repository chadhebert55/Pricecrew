import {
  getListCustomersQueryKey,
  useCreateCustomer,
  useListCustomers,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Mail, Plus, Search } from "lucide-react"
import { useState } from "react"
import { useLocation } from "wouter"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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

export function Customers() {
  const [, setLocation] = useLocation()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const { data: customers, isLoading } = useListCustomers(
    search.trim() ? { search: search.trim() } : undefined,
  )
  const createCustomer = useCreateCustomer()

  const addCustomer = (event: React.FormEvent) => {
    event.preventDefault()
    createCustomer.mutate(
      { data: { name, email: email || null } },
      {
        onSuccess: (customer) => {
          void queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() })
          setDialogOpen(false)
          setName("")
          setEmail("")
          setLocation(`/customers/${customer.id}`)
        },
      },
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Customers</h1>
          <p className="text-muted-foreground mt-1">Manage customer records and quote history.</p>
        </div>
        <Button className="gap-2" onClick={() => setDialogOpen(true)}><Plus size={16} /> Add Customer</Button>
      </div>

      <Card>
        <div className="flex items-center border-b p-4">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input type="search" className="pl-9" placeholder="Search by name or email..." value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
        </div>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-10 text-center text-muted-foreground">Loading customers...</div>
          ) : !customers?.length ? (
            <div className="p-10 text-center text-muted-foreground">{search ? "No customers match this search." : "No customers yet. Add one or create a quote to get started."}</div>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Email</TableHead><TableHead className="text-right">Quotes</TableHead><TableHead className="text-right">Total Quoted</TableHead><TableHead>Latest Activity</TableHead></TableRow></TableHeader>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow key={customer.id} className="cursor-pointer" onClick={() => setLocation(`/customers/${customer.id}`)}>
                    <TableCell className="font-medium">{customer.name}</TableCell>
                    <TableCell><span className="flex items-center gap-2 text-muted-foreground"><Mail size={14} />{customer.email ?? "No email"}</span></TableCell>
                    <TableCell className="text-right font-mono">{customer.quoteCount}</TableCell>
                    <TableCell className="text-right font-mono">${customer.totalQuoted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                    <TableCell>{customer.latestQuoteAt ? new Date(customer.latestQuoteAt).toLocaleDateString() : "No quotes"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={addCustomer} className="space-y-5">
            <DialogHeader><DialogTitle>Add Customer</DialogTitle><DialogDescription>Create a customer record before starting a quote. People with the same name stay separate when their emails differ.</DialogDescription></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2"><Label htmlFor="new-customer-name">Name *</Label><Input id="new-customer-name" required value={name} onChange={(event) => setName(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="new-customer-email">Email</Label><Input id="new-customer-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
              {createCustomer.isError && <p className="text-sm text-destructive">This customer could not be added. Check that the email is not already in use.</p>}
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={createCustomer.isPending || !name.trim()}>{createCustomer.isPending ? "Adding..." : "Add Customer"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
