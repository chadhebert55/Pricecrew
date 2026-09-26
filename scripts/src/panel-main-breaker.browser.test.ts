import { expect, test } from "@playwright/test"
import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import {
  companiesTable, companyMembersTable, companySettingsTable, customersTable,
  db, priceBookItemsTable, quotesTable,
} from "@workspace/db"

const apiUrl = "http://127.0.0.1:5080"
const panel = "Siemens PN4040B1200C 200A 40-space panel — SKU 1552599"

// QA: new-quote default, included main $0, no duplicate-main warning, unrelated
// blockers retained, manufacturer/rating/spaces invalidation, protection change,
// desktop/mobile visuals, save/reopen/revise, and old generic quotes unchanged.
test("Panel Replacement exact Siemens panel includes one main and persists safely", async ({
  browser, request,
}, testInfo) => {
  const marker = randomUUID()
  const userId = `panel_main_${marker}`
  const headers = { "x-test-clerk-user-id": userId }
  let companyId: number | undefined
  const context = await browser.newContext({
    extraHTTPHeaders: headers, viewport: { width: 1280, height: 900 },
  })
  try {
    expect((await request.get(`${apiUrl}/api/settings`, { headers })).ok()).toBe(true)
    const [membership] = await db.select().from(companyMembersTable)
      .where(eq(companyMembersTable.userId, userId))
    companyId = membership!.companyId
    // New test companies have unresolved starter inventory, not the owner's
    // sourced catalog. Supply an explicit fixture rather than relying on seeds.
    await db.insert(priceBookItemsTable).values({
      companyId, category: "Panel", item: panel, unit: "ea", unitCost: 294.625,
      manufacturer: "Siemens", manufacturerPartNumber: "PN4040B1200C",
      supplier: "Northeast Electrical", supplierSku: "1552599",
      sourceDate: "2026-08-25", amperage: 200,
      isDefault: false, isContractorOwned: false,
    })
    const page = await context.newPage()
    const nextPreview = () => page.waitForResponse(r => r.url().endsWith("/api/quotes/preview"))
    let response = nextPreview()
    await page.goto(`/quotes/new/panel-replacement?draftScope=main-${marker}`)
    const initial = await (await response).json()
    const choice = page.getByTestId("select-panel-product")
    const note = page.getByTestId("text-included-main-breaker")
    await expect(choice).toHaveValue(panel)
    await expect(note).toBeVisible()
    expect(initial.assembly.find((r: { id: string }) => r.id === "panel-replacement-panel").unitCost).toBe(294.625)
    expect(initial.assembly.find((r: { id: string }) => r.id === "panel-replacement-breaker")
      .intentionalExclusionReason).toContain("included")
    expect(JSON.stringify(initial.pricing.pricingWarnings)).not.toMatch(/Duplicate.*200A 2-pole/)
    await choice.scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath("panel-main-desktop.png") })
    await page.setViewportSize({ width: 375, height: 812 })
    await choice.scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath("panel-main-mobile.png") })
    expect(await choice.evaluate(el => el.getBoundingClientRect().right)).toBeLessThanOrEqual(375)
    await page.setViewportSize({ width: 1280, height: 900 })

    response = nextPreview()
    await page.getByTestId("select-breaker-prot").selectOption("GFCI")
    const gfci = await (await response).json()
    await expect(note).toHaveCount(0)
    expect(gfci.assembly.find((r: { id: string }) => r.id === "panel-replacement-breaker")
      .intentionalExclusionReason).toBeUndefined()
    response = nextPreview()
    await page.getByTestId("select-breaker-prot").selectOption("Standard")
    await response
    await expect(note).toBeVisible()
    for (const change of [
      async () => page.getByTestId("input-panel-spaces").fill("30"),
      async () => page.getByTestId("select-panel-amps").selectOption("100"),
      async () => page.locator("#pr-mfr").selectOption("Square D"),
    ]) {
      await change()
      await expect(choice).toHaveValue("")
      await expect(note).toHaveCount(0)
      await page.locator("#pr-mfr").selectOption("Siemens")
      await page.getByTestId("select-panel-amps").selectOption("200")
      await page.getByTestId("input-panel-spaces").fill("40")
      await expect(choice).toHaveValue("")
      await choice.selectOption(panel)
    }
    await page.getByTestId("input-breaker-amps").fill("200")
    await page.getByTestId("input-breaker-poles").fill("2")
    await page.locator("#pr-customer").fill(`Panel main test ${marker}`)
    await page.locator("#pr-project").fill("Included main regression")
    await expect(note).toBeVisible()
    await page.getByRole("button", { name: "Generate Quote" }).click()
    await expect(page).toHaveURL(/\/quotes\/\d+$/)
    const id = Number(page.url().split("/").at(-1))
    const saved = await (await request.get(`${apiUrl}/api/quotes/${id}`, { headers })).json()
    expect(saved.jobInputs.exactCatalogParts.panelProduct).toBe(panel)
    expect(saved.assembly.find((r: { id: string }) => r.id === "panel-replacement-breaker")
      .intentionalExclusionReason).toContain("included")
    expect((await request.patch(`${apiUrl}/api/quotes/${id}`, {
      headers, data: { status: "ready" },
    })).status()).toBe(409)
    await page.reload()
    await page.getByTestId("button-duplicate-quote").click()
    await expect(choice).toHaveValue(panel)
    await expect(note).toBeVisible()
    await choice.selectOption("")
    await page.getByRole("button", { name: "Generate Quote" }).click()
    await expect(page).toHaveURL(/\/quotes\/\d+$/)
    const genericId = Number(page.url().split("/").at(-1))
    expect(genericId).not.toBe(id)
    await page.reload()
    await page.getByTestId("button-duplicate-quote").click()
    await expect(choice).toHaveValue("")
    await expect(note).toHaveCount(0)
    const original = await (await request.get(`${apiUrl}/api/quotes/${id}`, { headers })).json()
    expect(original.pricing).toEqual(saved.pricing)
  } finally {
    await context.close()
    if (companyId !== undefined) {
      await db.delete(quotesTable).where(eq(quotesTable.companyId, companyId))
      await db.delete(customersTable).where(eq(customersTable.companyId, companyId))
      await db.delete(priceBookItemsTable).where(eq(priceBookItemsTable.companyId, companyId))
      await db.delete(companySettingsTable).where(eq(companySettingsTable.companyId, companyId))
      await db.delete(companyMembersTable).where(eq(companyMembersTable.userId, userId))
      await db.delete(companiesTable).where(eq(companiesTable.id, companyId))
    }
  }
})

// QA: all three cable choices, exact aluminum identity, per-foot math, optional
// raceway round-trip, missing copper price, draft/revision persistence, legacy
// individual-conductor mode, small-screen fit and light/dark screenshots.
test("Panel Replacement SER and existing-cable reuse persist without automatic raceway", async ({
  browser, request,
}, testInfo) => {
  const marker = randomUUID()
  const userId = `panel_ser_${marker}`
  const headers = { "x-test-clerk-user-id": userId }
  let companyId: number | undefined
  const context = await browser.newContext({ extraHTTPHeaders: headers, viewport: { width: 1280, height: 900 } })
  try {
    await request.get(`${apiUrl}/api/settings`, { headers })
    const [membership] = await db.select().from(companyMembersTable).where(eq(companyMembersTable.userId, userId))
    companyId = membership!.companyId
    const cable = "Wia 4/0 aluminum SER — SKU 28551"
    await db.insert(priceBookItemsTable).values({
      companyId, category: "Conductor", item: cable, unit: "ft", unitCost: 4.419839,
      supplier: "Test verified supplier", supplierSku: "28551", sourceDate: "2026-08-25",
      isDefault: false, isContractorOwned: false,
    })
    const page = await context.newPage()
    const nextPreview = () => page.waitForResponse(r => r.url().endsWith("/api/quotes/preview"))
    let response = nextPreview()
    await page.goto(`/quotes/new/panel-replacement?draftScope=ser-${marker}`)
    await response
    const mode = page.getByTestId("select-feeder-cond")
    const raceway = page.getByTestId("checkbox-feeder-raceway")
    await expect(mode).toHaveValue("4/0 aluminum SER")
    await expect(raceway).not.toBeChecked()
    await expect(page.getByTestId("input-feeder-qty")).toHaveCount(0)
    response = nextPreview()
    await page.getByTestId("select-feeder-cable-product").selectOption(cable)
    await response
    response = nextPreview()
    await page.getByTestId("input-feeder-len").fill("12")
    const aluminum = await (await response).json()
    const line = aluminum.assembly.find((r: { id: string }) => r.id === "panel-replacement-feeder")
    expect(line.quantity).toBe(12)
    expect(line.extendedCost).toBe(53.038)
    expect(aluminum.assembly.some((r: { id: string }) => r.id.startsWith("feeder-raceway"))).toBe(false)
    response = nextPreview()
    await raceway.check()
    const withRaceway = await (await response).json()
    expect(withRaceway.assembly.some((r: { id: string }) => r.id === "feeder-raceway")).toBe(true)
    response = nextPreview()
    await raceway.uncheck()
    await response
    await mode.scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath("ser-desktop.png") })
    response = nextPreview()
    await mode.selectOption("2/0 copper SER")
    const copper = await (await response).json()
    expect(copper.assembly.find((r: { id: string }) => r.id === "panel-replacement-feeder").unitCost).toBe(0)
    expect(JSON.stringify(copper.pricing.pricingWarnings)).toContain("2/0 copper SER cable")
    response = nextPreview()
    await mode.selectOption("Reuse existing cable")
    const reused = await (await response).json()
    expect(reused.assembly.find((r: { id: string }) => r.id === "panel-replacement-feeder").intentionalExclusionReason).toContain("no new feeder cable")
    expect(reused.pricing.laborCost).toBe(aluminum.pricing.laborCost)
    await expect(page.getByTestId("input-feeder-len")).toHaveCount(0)
    await expect(raceway).not.toBeChecked()
    // Reload draft and verify the explicit choice is not replaced by defaults.
    await expect.poll(() => page.evaluate("JSON.stringify(localStorage).includes('Reuse existing cable')")).toBe(true)
    await page.reload()
    await page.getByTestId("button-restore-quote-draft").click()
    await expect(mode).toHaveValue("Reuse existing cable")
    await page.setViewportSize({ width: 375, height: 812 })
    await mode.scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath("ser-reuse-mobile.png") })
    expect(await page.evaluate("document.documentElement.scrollWidth")).toBeLessThanOrEqual(375)
    await page.evaluate("document.documentElement.classList.add('dark')")
    await page.screenshot({ path: testInfo.outputPath("ser-reuse-dark.png") })
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.locator("#pr-customer").fill(`SER test ${marker}`)
    await page.locator("#pr-project").fill("Reuse regression")
    await page.getByRole("button", { name: "Generate Quote" }).click()
    await expect(page).toHaveURL(/\/quotes\/\d+$/)
    const id = Number(page.url().split("/").at(-1))
    const original = await (await request.get(`${apiUrl}/api/quotes/${id}`, { headers })).json()
    await page.reload()
    await page.getByTestId("button-duplicate-quote").click()
    await expect(mode).toHaveValue("Reuse existing cable")
    await expect(raceway).not.toBeChecked()
    response = nextPreview()
    await mode.selectOption("4/0 aluminum XHHW conductor")
    await response
    await expect(raceway).toBeChecked()
    await expect(page.getByTestId("input-feeder-qty")).toHaveValue("3")
    response = nextPreview()
    await mode.selectOption("4/0 aluminum SER")
    await response
    await expect(raceway).not.toBeChecked()
    await expect(page.getByTestId("select-feeder-cable-product")).toHaveValue("")
    await page.getByRole("button", { name: "Generate Quote" }).click()
    await expect(page).toHaveURL(/\/quotes\/\d+$/)
    expect(Number(page.url().split("/").at(-1))).not.toBe(id)
    const unchanged = await (await request.get(`${apiUrl}/api/quotes/${id}`, { headers })).json()
    expect(unchanged.jobInputs).toEqual(original.jobInputs)
    expect(unchanged.pricing).toEqual(original.pricing)
  } finally {
    await context.close()
    if (companyId !== undefined) {
      await db.delete(quotesTable).where(eq(quotesTable.companyId, companyId))
      await db.delete(customersTable).where(eq(customersTable.companyId, companyId))
      await db.delete(priceBookItemsTable).where(eq(priceBookItemsTable.companyId, companyId))
      await db.delete(companySettingsTable).where(eq(companySettingsTable.companyId, companyId))
      await db.delete(companyMembersTable).where(eq(companyMembersTable.userId, userId))
      await db.delete(companiesTable).where(eq(companiesTable.id, companyId))
    }
  }
})
