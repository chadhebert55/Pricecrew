import { expect, test } from "@playwright/test"
import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import {
  companiesTable, companyMembersTable, companySettingsTable, customersTable,
  db, priceBookItemsTable, quotesTable,
} from "@workspace/db"

const apiUrl = "http://127.0.0.1:5080"

test("EV job permit fee previews, restores, persists, and revises without changing its source", async ({
  browser, request,
}, testInfo) => {
  const marker = randomUUID()
  const userId = `permit_fee_ui_${marker}`
  const headers = { "x-test-clerk-user-id": userId }
  let companyId: number | undefined
  const context = await browser.newContext({
    extraHTTPHeaders: headers,
    viewport: { width: 1280, height: 900 },
  })
  try {
    expect((await request.get(`${apiUrl}/api/settings`, { headers })).ok()).toBe(true)
    const [membership] = await db.select().from(companyMembersTable)
      .where(eq(companyMembersTable.userId, userId))
    companyId = membership!.companyId
    const page = await context.newPage()
    await page.goto(`/quotes/new?draftScope=permit-${marker}`)
    const fee = page.getByLabel("Permit Fee ($)", { exact: true })
    const requirement = page.getByLabel("Permit Requirement", { exact: true })
    await expect(fee).toHaveValue("")
    await expect(page.getByText(/EV permit fee is unconfirmed/)).toBeVisible()
    await page.locator("#customerName").fill(`Permit test ${marker}`)
    await page.locator("#projectName").fill("Job-specific permit test")

    // Wait for the response for this exact input, not an older in-flight preview.
    const previewFor = (value: number | null, permit = "Required") =>
      page.waitForResponse(response => {
        if (!response.url().endsWith("/api/quotes/preview")) return false
        const inputs = response.request().postDataJSON()?.jobInputs
        return inputs?.permitFee === value && inputs?.permit === permit
      })

    let response = previewFor(150.25)
    await fee.fill("150.25")
    const priced = await (await response).json()
    expect(priced.assembly.find((line: { id: string }) => line.id === "permit").unitCost).toBe(150.25)
    await expect(page.getByText(/EV permit fee is unconfirmed/)).toHaveCount(0)

    response = previewFor(150.25, "Not Required")
    await requirement.selectOption("Not Required")
    await expect(fee).toHaveCount(0)
    const noPermit = await (await response).json()
    expect(noPermit.assembly.some((line: { id: string }) => line.id === "permit")).toBe(false)
    response = previewFor(150.25)
    await requirement.selectOption("Required")
    await expect(fee).toHaveValue("150.25")
    await response

    response = previewFor(null)
    await fee.fill("")
    await response
    await expect(page.getByText(/EV permit fee is unconfirmed/)).toBeVisible()
    response = previewFor(0)
    await fee.fill("0")
    const zero = await (await response).json()
    expect(zero.assembly.find((line: { id: string }) => line.id === "permit").intentionalExclusionReason)
      .toContain("confirmed no permit fee")
    await expect(page.getByText(/EV permit fee is unconfirmed/)).toHaveCount(0)

    await fee.fill("-1")
    expect(await fee.evaluate(element =>
      (element as unknown as { validity: { rangeUnderflow: boolean } }).validity.rangeUnderflow,
    )).toBe(true)
    response = previewFor(150.25)
    await fee.fill("150.25")
    await response
    // The draft must contain the amount before navigating away.
    await expect.poll(() => page.evaluate(() =>
      Object.keys(localStorage).some(key => {
        try { return JSON.parse(localStorage.getItem(key) ?? "{}").values?.inputs?.permitFee === 150.25 }
        catch { return false }
      }),
    )).toBe(true)
    await page.reload()
    await page.getByTestId("button-restore-quote-draft").click()
    await expect(fee).toHaveValue("150.25")

    await fee.scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath("permit-fee-desktop.png") })
    await page.setViewportSize({ width: 375, height: 812 })
    await fee.scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath("permit-fee-mobile.png") })
    expect(await fee.evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(375)
    await page.setViewportSize({ width: 1280, height: 900 })

    await page.getByRole("button", { name: "Generate Quote" }).click()
    await expect(page).toHaveURL(/\/quotes\/\d+$/)
    const sourceId = Number(page.url().split("/").at(-1))
    const sourceResponse = await request.get(`${apiUrl}/api/quotes/${sourceId}`, { headers })
    expect(sourceResponse.ok()).toBe(true)
    const source = await sourceResponse.json()
    expect(source.jobInputs.permitFee).toBe(150.25)
    expect(source.assembly.find((line: { id: string }) => line.id === "permit").unitCost).toBe(150.25)

    await page.reload()
    await page.getByTestId("button-duplicate-quote").click()
    await expect(fee).toHaveValue("150.25")
    response = previewFor(75)
    await fee.fill("75")
    await response
    await page.getByRole("button", { name: "Generate Quote" }).click()
    await expect(page).toHaveURL(/\/quotes\/\d+$/)
    const revisionId = Number(page.url().split("/").at(-1))
    expect(revisionId).not.toBe(sourceId)
    const revision = await (await request.get(`${apiUrl}/api/quotes/${revisionId}`, { headers })).json()
    expect(revision.jobInputs.permitFee).toBe(75)
    const original = await (await request.get(`${apiUrl}/api/quotes/${sourceId}`, { headers })).json()
    expect(original.jobInputs.permitFee).toBe(150.25)
    expect(original.pricing).toEqual(source.pricing)
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
