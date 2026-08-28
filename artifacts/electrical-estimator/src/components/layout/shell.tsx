import { Link, useLocation } from "wouter"
import { useClerk, useUser } from "@clerk/react"
import { LayoutDashboard, FileText, Blocks, BookOpen, Users, Settings, Zap, LogOut } from "lucide-react"

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation()
  const { signOut } = useClerk()
  const { user } = useUser()
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "")

  const navItems = [
    { label: "Dashboard", href: "/", icon: LayoutDashboard },
    { label: "Quotes", href: "/quotes", icon: FileText },
    { label: "Builders", href: "/builders", icon: Blocks },
    { label: "Price Book", href: "/price-book", icon: BookOpen },
    { label: "Customers", href: "/customers", icon: Users },
    { label: "Settings", href: "/settings", icon: Settings },
  ]

  return (
    <div className="flex min-h-screen w-full flex-col bg-background md:flex-row">
      {/* Sidebar */}
      <aside className="flex flex-col w-full md:w-64 shrink-0 border-r border-border bg-secondary text-secondary-foreground">
        <div className="p-4 flex items-center gap-3 border-b border-secondary-border">
          <div className="bg-primary p-1.5 rounded text-primary-foreground">
            <Zap size={20} />
          </div>
          <span className="font-bold tracking-tight text-lg uppercase">Estimator</span>
        </div>
        
        <nav className="flex-1 py-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href))
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-md transition-colors text-sm font-medium
                  ${isActive ? "bg-primary text-primary-foreground" : "text-secondary-foreground/70 hover:bg-secondary-foreground/10 hover:text-secondary-foreground"}`}
              >
                <item.icon size={18} />
                {item.label}
              </Link>
            )
          })}
        </nav>

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
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 p-6 overflow-auto">
          <div className="max-w-6xl mx-auto w-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}
