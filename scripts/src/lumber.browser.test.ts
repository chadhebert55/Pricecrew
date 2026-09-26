import { expect, test } from "@playwright/test"
import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import {
  companiesTable, companyMembersTable, companySettingsTable, customersTable,
  db, priceBookItemsTable, quotesTable,
} from "@workspace/db"

const apiUrl = "http://127.0.0.1:5080"

// QA: blank default, charged once, clear-to-unknown, deliberate zero, invalid negative,
// draft recovery, persisted snapshot/revision isolation, unrelated readiness blockers,
// new-quote reset and desktop/mobile fit. No production data or credentials.
test("Service Upgrade job lumber is blank by default and persists independently per quote", async ({
  browser, request,
}, testInfo) => {
  const marker = randomUUID()
  const userId = `lumber_ui_${marker}`
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
    const page = await context.newPage()
    const previewFor = (amount: number | null) => page.waitForResponse(response => {
      if (!response.url().endsWith("/api/quotes/preview")) return false
      return response.request().postDataJSON()?.jobInputs?.lumberCost === amount
    })
    let response = previewFor(null)
    await page.goto(`/quotes/new/service-upgrade?draftScope=lumber-${marker}`)
    const blank = await (await response).json()
    const input = page.getByLabel("Lumber Cost for This Job ($)", { exact: true })
    await expect(input).toHaveValue("")
    expect(JSON.stringify(blank.pricing.pricingWarnings)).toContain("lumber cost is unresolved")
    await page.locator("#su-customer").fill(`Lumber test ${marker}`)
    await page.locator("#su-project").fill("Job-specific lumber test")
    await input.scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath("lumber-desktop-blank.png") })

    response = previewFor(75)
    await input.fill("75")
    const priced = await (await response).json()
    expect(priced.assembly.find((row: { id: string }) => row.id === "job-lumber").extendedCost).toBe(75)
    expect(priced.assembly.some((row: { id: string }) =>
      ["plywood-backing", "studs"].includes(row.id))).toBe(false)
    expect(priced.pricing.materialCost).toBe(Number((blank.pricing.materialCost + 75).toFixed(2)))

    response = previewFor(0)
    await input.fill("0")
    const free = await (await response).json()
    expect(free.assembly.find((row: { id: string }) => row.id === "job-lumber")
      .intentionalExclusionReason).toContain("no lumber cost")
    response = previewFor(null)
    await input.fill("")
    const cleared = await (await response).json()
    expect(JSON.stringify(cleared.pricing.pricingWarnings)).toContain("lumber cost is unresolved")
    response = previewFor(-1)
    await input.fill("-1")
    expect((await response).status()).toBe(400)
    expect(await input.evaluate(element =>
      (element as unknown as { validity: { rangeUnderflow: boolean } }).validity.rangeUnderflow,
    )).toBe(true)
    response = previewFor(0.5)
    await input.fill("")
    await input.pressSequentially("0.50")
    await response
    await expect(input).toHaveValue("0.50")
    response = previewFor(75)
    await input.fill("75")
    await response

    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some(key => {
      try { return JSON.parse(localStorage.getItem(key) ?? "{}").values?.inputs?.lumberCost === 75 }
      catch { return false }
    }))).toBe(true)
    await page.reload()
    await page.getByTestId("button-restore-quote-draft").click()
    await expect(input).toHaveValue("75")
    await input.scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath("lumber-desktop-entered.png") })
    await page.setViewportSize({ width: 375, height: 812 })
    await input.scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath("lumber-mobile.png") })
    expect(await input.evaluate(el => el.getBoundingClientRect().right)).toBeLessThanOrEqual(375)
    await page.setViewportSize({ width: 1280, height: 900 })

    const save = () => page.getByRole("button", { name: "Create Quote Snapshot" }).click()
    await save()
    await expect(page).toHaveURL(/\/quotes\/\d+$/)
    const originalId = Number(page.url().split("/").at(-1))
    const original = await (await request.get(`${apiUrl}/api/quotes/${originalId}`, { headers })).json()
    expect(original.jobInputs.lumberCost).toBe(75)
    expect(original.assembly.find((row: { id: string }) => row.id === "job-lumber").extendedCost).toBe(75)
    // Entered lumber must not waive unrelated missing-material blockers.
    expect((await request.patch(`${apiUrl}/api/quotes/${originalId}`, {
      headers, data: { status: "ready" },
    })).status()).toBe(409)
    await page.reload()
    await page.getByTestId("button-duplicate-quote").click()
    await expect(input).toHaveValue("75")
    response = previewFor(120)
    await input.fill("120")
    await response
    await save()
    await expect(page).toHaveURL(/\/quotes\/\d+$/)
    const revisedId = Number(page.url().split("/").at(-1))
    expect(revisedId).not.toBe(originalId)
    const revised = await (await request.get(`${apiUrl}/api/quotes/${revisedId}`, { headers })).json()
    expect(revised.jobInputs.lumberCost).toBe(120)
    const unchanged = await (await request.get(`${apiUrl}/api/quotes/${originalId}`, { headers })).json()
    expect(unchanged.jobInputs.lumberCost).toBe(75)
    expect(unchanged.pricing).toEqual(original.pricing)

    response = previewFor(null)
    await page.goto(`/quotes/new/service-upgrade?draftScope=fresh-lumber-${marker}`)
    await response
    await expect(input).toHaveValue("")
    await page.locator("#su-customer").fill(`Blank lumber ${marker}`)
    await page.locator("#su-project").fill("Unresolved lumber")
    await save()
    await expect(page).toHaveURL(/\/quotes\/\d+$/)
    const blankId = Number(page.url().split("/").at(-1))
    const savedBlank = await (await request.get(`${apiUrl}/api/quotes/${blankId}`, { headers })).json()
    expect(savedBlank.jobInputs.lumberCost).toBeNull()
    expect(JSON.stringify(savedBlank.pricing.pricingWarnings)).toContain("lumber cost is unresolved")
    await page.reload()
    await page.getByTestId("button-duplicate-quote").click()
    await expect(input).toHaveValue("")
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
