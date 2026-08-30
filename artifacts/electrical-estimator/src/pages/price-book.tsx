import {
  type PriceBookItem,
  useListPriceBookItems,
  useUpdatePriceBookItem,
} from "@workspace/api-client-react"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { AlertTriangle, CheckCircle2, Search, Save } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export function PriceBook() {
  const { data: items, isLoading } = useListPriceBookItems()
  const updateItem = useUpdatePriceBookItem()
  const [search, setSearch] = useState("")
  const [builder, setBuilder] = useState("all")
  const [category, setCategory] = useState("all")
  const [status, setStatus] = useState("unresolved")

  const allItems = items ?? []
  const normalizedSearch = search.trim().toLowerCase()
  const builders = Array.from(new Set(allItems.flatMap((item) => item.builders)))
  const allCategories = Array.from(new Set(allItems.map((item) => item.category)))
  const unresolvedCount = allItems.filter((item) => item.isUnresolved).length
  const unresolvedActiveCount = allItems.filter(
    (item) => item.isUnresolved && item.activeSelection,
  ).length
  const filteredItems = allItems.filter((item) => {
    const matchesSearch =
      !normalizedSearch ||
      item.item.toLowerCase().includes(normalizedSearch) ||
      item.category.toLowerCase().includes(normalizedSearch) ||
      item.builders.some((name) => name.toLowerCase().includes(normalizedSearch))
    const matchesBuilder = builder === "all" || item.builders.includes(builder)
    const matchesCategory = category === "all" || item.category === category
    const matchesStatus =
      status === "all" ||
      (status === "unresolved" && item.isUnresolved) ||
      (status === "verified" && !item.isUnresolved) ||
      (status === "active-unresolved" && item.isUnresolved && item.activeSelection)
    return matchesSearch && matchesBuilder && matchesCategory && matchesStatus
  })

  const categories = Array.from(new Set(filteredItems.map(i => i.category)))
  const selectClassName =
    "h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Price Book</h1>
        <p className="text-muted-foreground mt-1">
          Audit the exact company costs used by each estimate builder.
        </p>
      </div>

      <Card>
        <div className="grid gap-3 border-b border-border bg-muted/20 p-4 md:grid-cols-2 xl:grid-cols-[minmax(16rem,1fr)_14rem_14rem_14rem]">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search item, category, or builder..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            aria-label="Filter by builder"
            data-testid="price-book-builder-filter"
            className={selectClassName}
            value={builder}
            onChange={(event) => setBuilder(event.target.value)}
          >
            <option value="all">All builders</option>
            {builders.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <select
            aria-label="Filter by category"
            data-testid="price-book-category-filter"
            className={selectClassName}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="all">All categories</option>
            {allCategories.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <select
            aria-label="Filter by audit status"
            data-testid="price-book-status-filter"
            className={selectClassName}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="unresolved">All unresolved</option>
            <option value="active-unresolved">Active unresolved only</option>
            <option value="verified">Verified pricing</option>
            <option value="all">All rows</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 text-sm">
          <span className="inline-flex items-center gap-1.5 font-medium text-amber-700">
            <AlertTriangle className="h-4 w-4" />
            {unresolvedActiveCount} active selections need audit
          </span>
          <span className="text-muted-foreground">
            {unresolvedCount} unresolved of {allItems.length} total rows
          </span>
          <span className="ml-auto text-muted-foreground">
            Showing {filteredItems.length} rows
          </span>
        </div>
        <CardContent className="p-0">
          {isLoading ? (
             <div className="p-8 text-center text-muted-foreground">Loading price book...</div>
          ) : (
            <div className="divide-y divide-border">
              {categories.map(category => (
                <div key={category} className="pb-4">
                  <div className="bg-secondary/5 px-4 py-2 font-bold text-sm text-secondary-foreground border-b border-border uppercase tracking-wider">
                    {category}
                  </div>
                  <Table className="min-w-[58rem]">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Item Description</TableHead>
                        <TableHead>Builder Usage</TableHead>
                        <TableHead>Catalog Match</TableHead>
                        <TableHead className="w-24">Unit</TableHead>
                        <TableHead className="text-right w-48">Unit Cost ($)</TableHead>
                        <TableHead className="w-24"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredItems.filter(i => i.category === category).map(item => (
                        <PriceBookRow key={item.id} item={item} updateItem={updateItem} />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
              {filteredItems.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">No items match your search.</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function PriceBookRow({
  item,
  updateItem,
}: {
  item: PriceBookItem
  updateItem: ReturnType<typeof useUpdatePriceBookItem>
}) {
  const [cost, setCost] = useState(item.unitCost.toString())
  const [isDirty, setIsDirty] = useState(false)
  const isPending = updateItem.isPending
  const isCompanyAllowance =
    item.item.toLowerCase().startsWith("unverified allowance") ||
    item.item.toLowerCase().startsWith("unverified starter allowance")

  const handleSave = () => {
    const numCost = parseFloat(cost)
    if (!isNaN(numCost) && numCost !== item.unitCost) {
      updateItem.mutate({ id: item.id, data: { unitCost: numCost } }, {
        onSuccess: () => {
          setIsDirty(false)
        }
      })
    } else {
      setIsDirty(false)
    }
  }

  return (
    <TableRow className={item.isUnresolved ? "bg-amber-50/50" : undefined}>
      <TableCell className="font-medium">
        <div className="space-y-1.5">
          <div>{item.item}</div>
          <div className="flex flex-wrap gap-1.5">
            {isCompanyAllowance ? (
              <Badge variant="outline">Company allowance</Badge>
            ) : item.isUnresolved ? (
              <Badge variant="warning">Unresolved</Badge>
            ) : (
              <Badge variant="success">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Verified
              </Badge>
            )}
            {item.activeSelection && <Badge variant="outline">Active selection</Badge>}
          </div>
          {item.auditMessage && (
            <p className={`max-w-xl text-xs font-normal ${isCompanyAllowance ? "text-muted-foreground" : "text-amber-800"}`}>
              {isCompanyAllowance
                ? "Editable planning allowance; not a sourced catalog price."
                : item.auditMessage}
            </p>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex max-w-xs flex-wrap gap-1.5">
          {item.builders.length > 0
            ? item.builders.map((name) => (
                <Badge key={name} variant="secondary">{name}</Badge>
              ))
            : <span className="text-xs text-muted-foreground">Not used by a V1 builder</span>}
        </div>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {item.manufacturer || item.supplier || item.upc ? (
          <div>
            {(item.manufacturer || item.manufacturerPartNumber) && <div className="font-medium text-foreground">{[item.manufacturer, item.manufacturerPartNumber].filter(Boolean).join(" ")}</div>}
            <div>{[item.supplier, item.supplierSku ? `SKU ${item.supplierSku}` : null, item.upc ? `UPC ${item.upc}` : null, item.sourceDate].filter(Boolean).join(" · ")}</div>
            {(item.amperage || item.poleCount || item.protectionType) && <div>{[item.amperage ? `${item.amperage}A` : null, item.poleCount ? `${item.poleCount}-pole` : null, item.protectionType].filter(Boolean).join(" · ")}</div>}
          </div>
        ) : item.item.startsWith("Unverified") ? <span className="font-medium text-amber-700">Unverified company allowance</span> : "General item"}
      </TableCell>
      <TableCell className="text-muted-foreground text-xs font-mono">{item.unit}</TableCell>
      <TableCell className="text-right">
        <Input 
          type="number" 
          step="0.001"
          className="text-right h-8 font-mono"
          value={cost}
          onChange={(e) => {
            setCost(e.target.value)
            setIsDirty(parseFloat(e.target.value) !== item.unitCost)
          }}
          onBlur={handleSave}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        />
      </TableCell>
      <TableCell>
        {isDirty && (
          <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" onClick={handleSave} disabled={isPending}>
            <Save size={16} />
          </Button>
        )}
      </TableCell>
    </TableRow>
  )
}
