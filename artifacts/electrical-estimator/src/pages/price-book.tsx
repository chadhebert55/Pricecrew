import { useListPriceBookItems, useUpdatePriceBookItem } from "@workspace/api-client-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Search, Save } from "lucide-react"
import { useState, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"

export function PriceBook() {
  const { data: items, isLoading } = useListPriceBookItems()
  const updateItem = useUpdatePriceBookItem()
  const [search, setSearch] = useState("")

  const filteredItems = items?.filter(item => 
    item.item.toLowerCase().includes(search.toLowerCase()) || 
    item.category.toLowerCase().includes(search.toLowerCase())
  ) || []

  // Group by category
  const categories = Array.from(new Set(filteredItems.map(i => i.category)))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Price Book</h1>
        <p className="text-muted-foreground mt-1">Manage company-specific material costs.</p>
      </div>

      <Card>
        <div className="p-4 border-b border-border flex items-center gap-4 bg-muted/20">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              type="search"
              placeholder="Search materials..." 
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
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
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Item Description</TableHead>
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

function PriceBookRow({ item, updateItem }: { item: any, updateItem: any }) {
  const [cost, setCost] = useState(item.unitCost.toString())
  const [isDirty, setIsDirty] = useState(false)
  const isPending = updateItem.isPending

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
    <TableRow>
      <TableCell className="font-medium">{item.item}</TableCell>
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
