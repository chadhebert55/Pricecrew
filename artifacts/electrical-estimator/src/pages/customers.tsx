import { Card, CardContent } from "@/components/ui/card"

export function Customers() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Customers</h1>
        <p className="text-muted-foreground mt-1">Client management workspace.</p>
      </div>
      
      <Card>
        <CardContent className="p-12 text-center text-muted-foreground flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-foreground mb-2">Customer CRM (Upcoming)</div>
          <p className="max-w-md">
            Customer management is currently handled per-quote. A centralized customer database with 
            historical quote tracking and approval metrics will be available in a future update.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
