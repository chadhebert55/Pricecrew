import { expect, test } from "@playwright/test"
import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { companiesTable, companyMembersTable, companySettingsTable, customersTable, db, priceBookItemsTable, quotesTable } from "@workspace/db"

const api = "http://127.0.0.1:5080/api"
const builders = [
  ["new-house", "new-house", "New House Quote"],
  ["custom", "custom", "New Custom Quote"],
  ["service-call", "service-call", "New Service Call Quote"],
  ["time-materials", "time-materials", "New Time & Materials Quote"],
  ["addition", "addition", "New Addition Quote"],
  ["bathroom", "bathroom", "New Bathroom Quote"],
  ["ev-charger", "ev-charger", "New Quote"],
  ["kitchen", "kitchen", "New Kitchen Quote"],
  ["recessed-lighting", "recessed-lighting", "New Recessed Lighting Quote"],
  ["service-upgrade", "service-upgrade", "New Service Upgrade Quote"],
  ["panel-swap", "panel-replacement", "New Panel Replacement Quote"],
] as const

test("Builder directory: all routes, search, favorites, recent, scoped persistence, draft recovery and responsive keyboard access", async ({ browser, request }, info) => {
  test.setTimeout(120_000)
  const userId = `directory_${randomUUID()}`, headers = { "x-test-clerk-user-id": userId }
  let companyId: number | undefined
  const context = await browser.newContext({ extraHTTPHeaders: headers, viewport: { width: 1280, height: 900 } })
  try {
    expect((await request.get(`${api}/settings`, { headers })).ok()).toBe(true)
    const [member] = await db.select().from(companyMembersTable).where(eq(companyMembersTable.userId, userId))
    companyId = member!.companyId
    const page = await context.newPage()
    await page.goto("/builders")
    await expect(page.locator('[data-testid^="builder-card-"]')).toHaveCount(11)
    await expect(page.getByRole("region", { name: "Favorites", exact: true })).toHaveCount(0)
    await expect(page.getByRole("region", { name: "Recently Used" })).toHaveCount(0)
    await expect(page.getByText("ACTIVE", { exact: true })).toHaveCount(0)
    await expect(page.getByText("Use Builder", { exact: true })).toHaveCount(0)
    await expect(page.getByRole("region", { name: "Residential Projects" }).locator('[data-testid^="builder-card-"]')).toHaveCount(5)
    await expect(page.getByRole("region", { name: "Service & Equipment" }).locator('[data-testid^="builder-card-"]')).toHaveCount(4)
    await expect(page.getByRole("region", { name: "Flexible Estimating" }).locator('[data-testid^="builder-card-"]')).toHaveCount(2)
    for (const [query, ids] of [
      ["panel", ["panel-swap", "service-upgrade"]], ["service", ["service-call", "service-upgrade"]],
      ["car", ["ev-charger"]], ["bath", ["bathroom"]], ["custom", ["custom"]],
    ] as const) {
      await page.getByLabel("Search builders", { exact: true }).fill(query)
      for (const id of ids) await expect(page.getByTestId(`builder-card-${id}`)).toBeVisible()
    }
    await page.getByLabel("Search builders", { exact: true }).fill("xyzabc")
    await expect(page.getByText("No builders match your search.")).toBeVisible()
    await expect(page.locator('[data-testid^="builder-card-"]')).toHaveCount(0)
    await page.getByRole("button", { name: "Reset search" }).click()
    await expect(page.locator('[data-testid^="builder-card-"]')).toHaveCount(11)
    await page.getByRole("button", { name: "Add Kitchen to favorites" }).click()
    await expect(page).toHaveURL(/\/builders$/)
    await expect(page.getByRole("region", { name: "Favorites", exact: true }).getByRole("link", { name: "Kitchen" })).toBeVisible()
    await page.reload()
    await expect(page.getByRole("button", { name: "Remove Kitchen from favorites" })).toHaveAttribute("aria-pressed", "true")
    // No nested link/button elements. Keyboard opens the same existing route.
    expect(await page.locator('[data-testid^="builder-card-"] a button').count()).toBe(0)
    await page.getByTestId("select-builder-bathroom").focus()
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/\/quotes\/new\/bathroom$/)
    await page.locator("#bathroom-project").fill("Directory recovery test")
    await expect.poll(() => page.evaluate(() => JSON.stringify(localStorage).includes("Directory recovery test"))).toBe(true)
    await page.goto("/builders")
    await page.getByRole("region", { name: "Recently Used" }).getByRole("link", { name: "Bathroom" }).click()
    await page.getByTestId("button-restore-quote-draft").click()
    await expect(page.locator("#bathroom-project")).toHaveValue("Directory recovery test")
    await page.goto("/builders")
    await page.getByRole("region", { name: "Favorites", exact: true }).getByRole("link", { name: "Kitchen" }).click()
    await expect(page.getByRole("heading", { name: "New Kitchen Quote", exact: true })).toBeVisible()
    for (const [id, route, heading] of builders) {
      await page.goto("/builders")
      await page.getByTestId(`select-builder-${id}`).click()
      await expect(page).toHaveURL(new RegExp(`/quotes/new/${route}$`))
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible()
    }
    await page.goto("/builders")
    await expect(page.getByRole("region", { name: "Recently Used" }).getByRole("link")).toHaveCount(3)
    await expect(page.getByRole("region", { name: "Recently Used" }).getByRole("link").first()).toHaveText("Panel Replacement")
    // Direct bookmarks participate, without changing the builder itself.
    await page.goto("/quotes/new/bathroom")
    await expect(page.getByRole("heading", { name: "New Bathroom Quote" })).toBeVisible()
    await page.goto("/builders")
    await expect(page.getByRole("region", { name: "Recently Used" }).getByRole("link").first()).toHaveText("Bathroom")
    // Browser test scopes exercise the same per-Clerk-user key isolation used in production.
    await page.goto("/builders?draftScope=other-user")
    await expect(page.getByRole("region", { name: "Favorites", exact: true })).toHaveCount(0)
    await expect(page.getByRole("region", { name: "Recently Used" })).toHaveCount(0)
    await page.goto("/builders")
    await expect(page.getByRole("region", { name: "Favorites", exact: true })).toBeVisible()
    await page.getByRole("heading", { name: "Quote Builders" }).click()
    await page.keyboard.press("/")
    await expect(page.getByLabel("Search builders", { exact: true })).toBeFocused()
    await page.keyboard.type("/")
    await expect(page.getByLabel("Search builders", { exact: true })).toHaveValue("/")
    await page.getByRole("button", { name: "Clear builder search" }).click()
    await page.getByRole("button", { name: "Switch to dark mode" }).click()
    for (const width of [1280, 768, 375]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await page.locator("html").evaluate(el => el.scrollWidth)).toBeLessThanOrEqual(width)
      await expect(page.locator('[data-testid^="builder-card-"]')).toHaveCount(11)
      const cards = page.getByRole("region", { name: "Residential Projects" }).locator('[data-testid^="builder-card-"]')
      const first = await cards.nth(0).boundingBox(), second = await cards.nth(1).boundingBox()
      expect(first!.height).toBeLessThan(230)
      if (width === 375) expect(second!.y).toBeGreaterThan(first!.y)
      else expect(second!.y).toBe(first!.y)
      await page.screenshot({ path: info.outputPath(`builders-${width}.png`), fullPage: true })
    }
    await page.getByRole("button", { name: "Remove Kitchen from favorites" }).click()
    await expect(page.getByRole("region", { name: "Favorites", exact: true })).toHaveCount(0)
    // Corrupt/unknown storage entries are safe; unavailable storage falls back within the session.
    await page.evaluate(() => localStorage.setItem("pricecrew:builder-directory:v1:e2e", '{"version":1,"favorites":["bad","kitchen","kitchen"],"recent":["bad"]}'))
    await page.reload()
    await expect(page.getByRole("region", { name: "Favorites", exact: true }).getByRole("link")).toHaveCount(1)
    await page.evaluate(() => {
      Storage.prototype.setItem = () => { throw new DOMException("blocked", "SecurityError") }
    })
    await page.getByRole("button", { name: "Add Bathroom to favorites" }).click()
    await expect(page.getByText(/saved for this session only/)).toBeVisible()
    await expect(page.getByRole("region", { name: "Favorites", exact: true }).getByRole("link", { name: "Bathroom" })).toBeVisible()
    await page.getByTestId("select-builder-bathroom").click()
    await expect(page.getByRole("heading", { name: "New Bathroom Quote" })).toBeVisible()
  } finally {
    await context.close()
    if (companyId) {
      await db.delete(quotesTable).where(eq(quotesTable.companyId, companyId))
      await db.delete(customersTable).where(eq(customersTable.companyId, companyId))
      await db.delete(priceBookItemsTable).where(eq(priceBookItemsTable.companyId, companyId))
      await db.delete(companySettingsTable).where(eq(companySettingsTable.companyId, companyId))
      await db.delete(companyMembersTable).where(eq(companyMembersTable.companyId, companyId))
      await db.delete(companiesTable).where(eq(companiesTable.id, companyId))
    }
  }
})

// Billing is intentionally not an input to the builder directory or its routes.
// These are response fixtures, NOT claims of testing three live paid accounts.
for (const plan of ["solo", "crew", "pro"]) test(`All 11 builders remain available with ${plan} billing fixture`, async ({ page }) => {
  let billingRequests = 0
  await page.route("**/api/billing", route => {
    billingRequests++
    return route.fulfill({ json: { mode: "test", currentPlan: plan, checkoutAvailable: false, plans: [] } })
  })
  await page.goto("/builders")
  await expect(page.locator('[data-testid^="select-builder-"]')).toHaveCount(11)
  for (const [id, route] of builders) await expect(page.getByTestId(`select-builder-${id}`)).toHaveAttribute("href", `/quotes/new/${route}`)
  await expect(page.locator('[data-testid^="builder-card-"]').getByText(/unlock|upgrade plan|pro.only|crew.only/i)).toHaveCount(0)
  expect(billingRequests).toBe(0)
})
