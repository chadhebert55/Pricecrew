import {
  type PriceBookImport,
  type PriceBookItem,
  useListPriceBookImports,
  useListPriceBookItems,
  useUpdatePriceBookItem,
} from "@workspace/api-client-react"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { AlertTriangle, CheckCircle2, FileClock, Search, Save } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PriceBookImportPanel } from "@/components/price-book-import-panel"

export function PriceBook() {
  const { data: items, isLoading } = useListPriceBookItems()
  const [historyPage, setHistoryPage] = useState(1)
  const [activeImport, setActiveImport] = useState<PriceBookImport | null>(null)
  const importHistory = useListPriceBookImports({
    page: historyPage,
    pageSize: 10,
  })
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

      <PriceBookImportPanel
        review={activeImport}
        onReviewChange={setActiveImport}
      />

      <PriceBookImportHistory
        history={importHistory.data}
        isError={importHistory.isError}
        isLoading={importHistory.isLoading}
        page={historyPage}
        onPageChange={setHistoryPage}
        onOpen={setActiveImport}
      />

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

function formatDate(value: string | null) {
  if (!value) return "Not supplied"
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(date)
}

function formatDateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date)
}

function PriceBookImportHistory({
  history,
  isError,
  isLoading,
  page,
  onPageChange,
  onOpen,
}: {
  history:
    | {
        items: PriceBookImport[]
        page: number
        pageSize: number
        total: number
        hasNextPage: boolean
      }
    | undefined
  isError: boolean
  isLoading: boolean
  page: number
  onPageChange: (page: number) => void
  onOpen: (review: PriceBookImport) => void
}) {
  return (
    <Card data-testid="price-book-import-history">
      <CardContent className="p-0">
        <div className="flex flex-col gap-2 border-b border-border p-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <FileClock className="h-5 w-5" />
              Import history
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Reopen saved comparisons to verify applied dates, before/after costs, and unresolved reasons.
            </p>
          </div>
          {history && history.total > 0 && (
            <span className="text-sm text-muted-foreground">
              {history.total} report{history.total === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading import history...</div>
        ) : isError ? (
          <div className="p-8 text-center text-sm text-destructive">
            Import history could not be loaded. Refresh the page and try again.
          </div>
        ) : !history || history.items.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No saved import reports yet. Review a Northeast customer-price CSV to create one.
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source file</TableHead>
                  <TableHead>Price date</TableHead>
                  <TableHead>Reviewed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Report</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.items.map((importReport) => (
                  <TableRow key={importReport.id}>
                    <TableCell className="font-medium">
                      <div>{importReport.sourceFileName}</div>
                      <div className="text-xs text-muted-foreground">Import #{importReport.id}</div>
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(importReport.sourceDate)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(importReport.createdAt)}
                      {importReport.appliedAt && (
                        <div className="mt-1 text-xs text-emerald-700">
                          Applied {formatDateTime(importReport.appliedAt)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={importReport.status === "applied" ? "success" : "secondary"}>
                        {importReport.status === "applied" ? "Applied" : "Review"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <div>
                        {importReport.report.inserted} inserted · {importReport.report.updated} updated
                      </div>
                      <div>
                        {importReport.report.skipped} skipped · {importReport.report.unresolved} unresolved
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        data-testid={`open-price-book-import-${importReport.id}`}
                        onClick={() => onOpen(importReport)}
                      >
                        Open report
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between border-t border-border p-4">
              <span className="text-xs text-muted-foreground">
                Page {history.page} of {Math.max(1, Math.ceil(history.total / history.pageSize))}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => onPageChange(Math.max(1, page - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!history.hasNextPage}
                  onClick={() => onPageChange(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
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
