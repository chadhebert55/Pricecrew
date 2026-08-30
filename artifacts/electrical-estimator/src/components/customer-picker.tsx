import { useListCustomers } from "@workspace/api-client-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useState } from "react"

type CustomerPickerProps = {
  customerId?: number
  customerName: string
  customerEmail: string
  onCustomerIdChange: (customerId?: number) => void
  onCustomerNameChange: (name: string) => void
  onCustomerEmailChange: (email: string) => void
  idPrefix: string
}

/** Shared existing-customer search with a deliberately retained free-text/new-customer mode. */
export function CustomerPicker({ customerId, customerName, customerEmail, onCustomerIdChange, onCustomerNameChange, onCustomerEmailChange, idPrefix }: CustomerPickerProps) {
  const [search, setSearch] = useState("")
  const { data: customers = [], isLoading, isError, refetch } = useListCustomers(search.trim() ? { search: search.trim() } : undefined)
  const changeName = (value: string) => {
    if (customerId !== undefined) onCustomerIdChange(undefined)
    onCustomerNameChange(value)
  }
  const changeEmail = (value: string) => {
    if (customerId !== undefined) onCustomerIdChange(undefined)
    onCustomerEmailChange(value)
  }
  const chooseCustomer = (customer: typeof customers[number]) => {
    onCustomerIdChange(customer.id)
    onCustomerNameChange(customer.name)
    onCustomerEmailChange(customer.email ?? "")
    setSearch("")
  }

  return <div className="space-y-2 md:col-span-2">
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-customer-search`}>Find existing customer</Label>
      <Input id={`${idPrefix}-customer-search`} data-testid={`input-${idPrefix}-customer-search`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search company customers by name or email" />
      {search && <div className="max-h-36 overflow-y-auto rounded-md border bg-popover p-1">
        {isLoading ? <p className="p-2 text-sm text-muted-foreground">Searching customers…</p> : isError ? <div className="flex items-center justify-between gap-2 p-2 text-sm text-destructive"><span>Customer search failed. Try again.</span><button type="button" className="underline" onClick={() => { void refetch() }}>Retry</button></div> : customers.length === 0 ? <p className="p-2 text-sm text-muted-foreground">No matching customers. Enter a new customer in the fields below.</p> : customers.map((customer) =>
          <button key={customer.id} type="button" data-testid={`button-select-customer-${customer.id}`} onClick={() => chooseCustomer(customer)} className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted">
            <span className="font-medium">{customer.name}</span>{customer.email && <span className="ml-2 text-muted-foreground">{customer.email}</span>}
          </button>)}
      </div>}
    </div>
    {customerId !== undefined && <p data-testid={`text-${idPrefix}-selected-customer`} className="text-sm text-primary">Using existing customer. Editing either customer field below switches to a new customer.</p>}
  </div>
}