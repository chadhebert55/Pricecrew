import { useEffect, useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Link } from "wouter"
import { ArrowRight, Search, Star, X } from "lucide-react"
import type { CompanyTrade } from "@workspace/api-client-react"
import { builderCategories, builderDirectory, searchBuilders, type BuilderListing } from "@/lib/builder-directory"
import { useBuilderPreferences } from "@/hooks/use-builder-preferences"

const genericIds = new Set(["custom", "service-call", "time-materials"])

export function Builders({ trade, choosingQuote = false }: { trade: CompanyTrade; choosingQuote?: boolean }) {
  const [query, setQuery] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)
  const { favorites, recent, sessionOnly, toggleFavorite } = useBuilderPreferences()
  const available = trade === "Electrical" ? builderDirectory : builderDirectory.filter(item => genericIds.has(item.id))
  const matches = searchBuilders(available, query)
  const matchingIds = new Set(matches.map(item => item.id))
  const findItems = (ids: string[]) => ids.flatMap(id => {
    const item = available.find(builder => builder.id === id)
    return item && matchingIds.has(id) ? [item] : []
  })
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey
        || target?.closest("input, textarea, select, [contenteditable=true], [role=textbox]")) return
      event.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener("keydown", focusSearch)
    return () => window.removeEventListener("keydown", focusSearch)
  }, [])

  function quickLinks(title: string, items: BuilderListing[]) {
    if (!items.length) return null
    return <section aria-label={title} className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      <div className="flex flex-wrap gap-2">
        {items.map(item => <Link key={item.id} href={item.route}
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
          {title === "Favorites" && <Star size={14} className="fill-primary text-primary" aria-hidden="true" />}
          {item.displayName}<ArrowRight size={14} className="text-primary" aria-hidden="true" />
        </Link>)}
      </div>
    </section>
  }

  return <div className="space-y-6">
    <div>
      <h1 className="text-xl font-bold tracking-tight text-foreground">{choosingQuote ? "New Quote" : "Quote Builders"}</h1>
      <p className="text-muted-foreground mt-1">
        {choosingQuote ? "Choose the type of job you want to quote." : trade === "Electrical"
          ? "Electrical estimating modules designed for speed and accuracy."
          : `Start with flexible ${trade} quote builders while trade-specific modules are developed.`}
      </p>
    </div>
    <div className="max-w-xl">
      <label htmlFor="builder-search" className="sr-only">Search builders</label>
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-3 top-3.5 text-muted-foreground" aria-hidden="true" />
        <Input ref={searchRef} id="builder-search" type="search" placeholder="Search builders..."
          value={query} onChange={event => setQuery(event.target.value)} className="min-h-11 pl-10 pr-12" />
        {query && <button type="button" aria-label="Clear builder search" onClick={() => { setQuery(""); searchRef.current?.focus() }}
          className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><X size={16} aria-hidden="true" /></button>}
      </div>
      <span className="sr-only" role="status">{matches.length} builders found</span>
    </div>
    {quickLinks("Favorites", findItems(favorites))}
    {quickLinks("Recently Used", findItems(recent))}
    {sessionOnly && <p className="text-xs text-muted-foreground" role="status">Browser storage is unavailable. Favorites and recent builders are saved for this session only.</p>}
    {!matches.length && <div className="rounded-lg border border-dashed border-border p-6 text-center">
      <p className="text-muted-foreground">No builders match your search.</p>
      <Button variant="ghost" onClick={() => { setQuery(""); searchRef.current?.focus() }} className="mt-2">Reset search</Button>
    </div>}
    {builderCategories.map(category => {
      const items = matches.filter(item => item.category === category)
      if (!items.length) return null
      return <section key={category} aria-label={category} className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">{category}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
          {items.map(item => <Card key={item.id} data-testid={`builder-card-${item.id}`} className="group relative flex shadow-sm transition-colors hover:border-primary">
            <Link href={item.route} data-testid={`select-builder-${item.id}`} aria-label={`Start ${item.displayName} quote`}
              className="flex min-h-44 w-full cursor-pointer flex-col rounded-lg p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
              <item.icon size={22} className="mb-3 text-primary" aria-hidden="true" />
              <h3 className="pr-5 text-base font-semibold text-foreground">{item.displayName}</h3>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">{item.description}</p>
              <span className="ml-auto mt-auto pt-3"><ArrowRight size={16} className="text-primary transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></span>
            </Link>
            <button type="button" aria-label={`${favorites.includes(item.id) ? "Remove" : "Add"} ${item.displayName} ${favorites.includes(item.id) ? "from" : "to"} favorites`}
              aria-pressed={favorites.includes(item.id)} onClick={() => toggleFavorite(item.id)}
              className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Star size={18} className={favorites.includes(item.id) ? "fill-primary text-primary" : ""} aria-hidden="true" />
            </button>
          </Card>)}
        </div>
      </section>
    })}
  </div>
}
