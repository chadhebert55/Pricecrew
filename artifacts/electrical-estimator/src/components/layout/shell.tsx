import { Link, useLocation } from "wouter"
import { useClerk, useUser } from "@clerk/react"
import { LayoutDashboard, FileText, Blocks, BookOpen, Users, Settings, Zap, LogOut, Menu, X, CreditCard } from "lucide-react"
import { lazy, Suspense, useEffect, useState } from "react"

const ProposalNotificationCenter = lazy(() =>
  import("@/components/proposal-notification-center").then((module) => ({
    default: module.ProposalNotificationCenter,
  })),
)

export function Shell({ children }: { children: React.ReactNode }) {
  return <ShellFrame account={<AuthenticatedAccount />}>{children}</ShellFrame>
}

export function E2eShell({ children }: { children: React.ReactNode }) {
  return <ShellFrame account={<TestAccount />}>{children}</ShellFrame>
}

function ShellFrame({
  children,
  account,
}: {
  children: React.ReactNode
  account: React.ReactNode
}) {
  const [location] = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const navItems = [
    { label: "Dashboard", href: "/", icon: LayoutDashboard },
    { label: "Quotes", href: "/quotes", icon: FileText },
    { label: "Builders", href: "/builders", icon: Blocks },
    { label: "Price Book", href: "/price-book", icon: BookOpen },
    { label: "Customers", href: "/customers", icon: Users },
    { label: "Billing", href: "/billing", icon: CreditCard },
    { label: "Settings", href: "/settings", icon: Settings },
  ]

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location])

  const navigation = (
    <nav className="flex-1 space-y-1 py-4" aria-label="Main navigation">
      {navItems.map((item) => {
        const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href))
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileNavOpen(false)}
            className={`mx-2 flex items-center gap-3 rounded-md px-4 py-2.5 text-sm font-medium transition-colors
              ${isActive ? "bg-primary text-primary-foreground" : "text-secondary-foreground/70 hover:bg-secondary-foreground/10 hover:text-secondary-foreground"}`}
          >
            <item.icon size={18} />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-secondary text-secondary-foreground md:flex">
        <div className="flex items-center gap-3 border-b border-secondary-border p-4">
          <div className="rounded bg-primary p-1.5 text-primary-foreground">
            <Zap size={20} />
          </div>
          <span className="text-lg font-bold uppercase tracking-tight">Estimator</span>
        </div>
        {navigation}
        {account}
      </aside>

      {/* Mobile navigation stays out of document flow so it does not push the builder below the fold. */}
      {mobileNavOpen && (
        <>
          <button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-0 z-40 bg-secondary/60 md:hidden"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-[min(18rem,calc(100vw-2rem))] flex-col border-r border-secondary-border bg-secondary text-secondary-foreground shadow-xl md:hidden">
            <div className="flex items-center justify-between border-b border-secondary-border p-4">
              <div className="flex items-center gap-3">
                <div className="rounded bg-primary p-1.5 text-primary-foreground">
                  <Zap size={20} />
                </div>
                <span className="text-lg font-bold uppercase tracking-tight">Estimator</span>
              </div>
              <button
                type="button"
                aria-label="Close navigation"
                className="rounded p-2 text-secondary-foreground/80 hover:bg-secondary-foreground/10"
                onClick={() => setMobileNavOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            {navigation}
            {account}
          </aside>
        </>
      )}

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between border-b border-border bg-background/95 px-3 backdrop-blur sm:px-4 md:justify-end md:px-6">
          <div className="flex items-center gap-3 md:hidden">
            <button
              type="button"
              aria-label="Open navigation"
              aria-expanded={mobileNavOpen}
              data-testid="button-mobile-navigation"
              className="rounded-md border border-border p-2 text-foreground hover:bg-muted"
              onClick={() => setMobileNavOpen(true)}
            >
              <Menu size={20} />
            </button>
            <span className="font-bold uppercase tracking-tight">Estimator</span>
          </div>
          <Suspense
            fallback={
              <div
                aria-hidden="true"
                className="h-10 w-10 animate-pulse rounded-md border border-border bg-muted"
              />
            }
          >
            <ProposalNotificationCenter />
          </Suspense>
        </header>
        <main className="min-w-0 flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-6xl p-3 sm:p-4 md:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

function AuthenticatedAccount() {
  const { signOut } = useClerk()
  const { user } = useUser()
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "")

  return (
    <div className="border-t border-secondary-border p-4">
      <p className="truncate text-xs font-medium text-secondary-foreground/80">
        {user?.primaryEmailAddress?.emailAddress ?? "Signed in"}
      </p>
      <button
        type="button"
        onClick={() => signOut({ redirectUrl: basePath || "/" })}
        className="mt-3 flex w-full items-center gap-2 rounded px-2 py-2 text-xs text-secondary-foreground/70 transition-colors hover:bg-secondary-foreground/10 hover:text-secondary-foreground"
      >
        <LogOut size={14} />
        Sign out
      </button>
    </div>
  )
}

function TestAccount() {
  return (
    <div className="border-t border-secondary-border p-4 text-xs text-secondary-foreground/70">
      Browser test session
    </div>
  )
}
