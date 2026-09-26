import { useUser } from "@clerk/react"
import { useCallback, useEffect, useState } from "react"
import { useLocation } from "wouter"
import { builderDirectory } from "@/lib/builder-directory"
import { e2eDraftScope } from "@/lib/quote-builder-draft-storage"

type Preferences = { favorites: string[]; recent: string[]; sessionOnly: boolean }
const empty: Preferences = { favorites: [], recent: [], sessionOnly: false }
const eventName = "pricecrew:builder-preferences"
const sessionCache = new Map<string, Preferences>()
const validIds = new Set(builderDirectory.map(builder => builder.id))
const keyFor = (scope: string) => `pricecrew:builder-directory:v1:${encodeURIComponent(scope)}`
const cleanIds = (value: unknown) => Array.isArray(value)
  ? [...new Set(value.filter((id): id is string => typeof id === "string" && validIds.has(id)))]
  : []

function read(scope: string | null): Preferences {
  if (!scope) return empty
  if (sessionCache.get(scope)?.sessionOnly) return sessionCache.get(scope)!
  try {
    const raw = window.localStorage.getItem(keyFor(scope))
    if (!raw) return sessionCache.get(scope) ?? empty
    const data = JSON.parse(raw)
    if (data?.version !== 1) return empty
    return { favorites: cleanIds(data.favorites), recent: cleanIds(data.recent).slice(0, 3), sessionOnly: false }
  } catch {
    return sessionCache.get(scope) ?? empty
  }
}

function write(scope: string, value: Preferences) {
  let sessionOnly = false
  try {
    window.localStorage.setItem(keyFor(scope), JSON.stringify({ version: 1, favorites: value.favorites, recent: value.recent }))
  } catch {
    sessionOnly = true
  }
  sessionCache.set(scope, { ...value, sessionOnly })
  window.dispatchEvent(new Event(eventName))
}

export function useBuilderPreferences() {
  // Match the existing draft-storage authentication boundary. No anonymous shared key.
  const clerk = import.meta.env.VITE_E2E_AUTH === "true" ? null : useUser()
  const scope = clerk?.user?.id ?? e2eDraftScope()
  const [state, setState] = useState(() => ({ scope, value: read(scope) }))
  useEffect(() => {
    const refresh = () => setState({ scope, value: read(scope) })
    refresh()
    window.addEventListener("storage", refresh)
    window.addEventListener(eventName, refresh)
    return () => {
      window.removeEventListener("storage", refresh)
      window.removeEventListener(eventName, refresh)
    }
  }, [scope])
  const toggleFavorite = useCallback((id: string) => {
    if (!scope || !validIds.has(id)) return
    const current = read(scope)
    write(scope, { ...current, favorites: current.favorites.includes(id)
      ? current.favorites.filter(favorite => favorite !== id) : [...current.favorites, id] })
  }, [scope])
  const recordRecent = useCallback((id: string) => {
    if (!scope || !validIds.has(id)) return
    const current = read(scope)
    if (current.recent[0] === id) return
    write(scope, { ...current, recent: [id, ...current.recent.filter(recent => recent !== id)].slice(0, 3) })
  }, [scope])
  return { ...(state.scope === scope ? state.value : read(scope)), toggleFavorite, recordRecent }
}

/** Observe existing routes, including direct bookmarks; never modify builder inputs. */
export function BuilderRecentTracker() {
  const [location] = useLocation()
  const { recordRecent } = useBuilderPreferences()
  useEffect(() => {
    const builder = builderDirectory.find(item => item.route === location)
    if (builder) recordRecent(builder.id)
  }, [location, recordRecent])
  return null
}
