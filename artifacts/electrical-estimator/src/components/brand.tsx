import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"
import { Link } from "wouter"

/** Reuses the actual getpricecrew.com artwork, not a substitute wordmark. */
export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" aria-label="PriceCrew home" className={`inline-flex shrink-0 rounded bg-[#f7f6f2] p-1 ${className}`}>
      <img
        src={`${import.meta.env.BASE_URL}brand/wordmark.png`}
        alt="PriceCrew"
        className="h-8 w-auto max-w-full object-contain"
        data-testid="pricecrew-logo"
      />
    </Link>
  )
}

export function ThemeToggle() {
  const [dark, setDark] = useState(() =>
    document.documentElement.dataset.appTheme
      ? document.documentElement.dataset.appTheme === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches,
  )
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
    document.documentElement.dataset.appTheme = dark ? "dark" : "light"
  }, [dark])
  return (
    <button
      type="button"
      aria-label={`Switch to ${dark ? "light" : "dark"} mode`}
      data-testid="button-theme-toggle"
      onClick={() => setDark(!dark)}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
