import { expect, test } from "@playwright/test"
import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import {
  companiesTable, companyMembersTable, companySettingsTable, customersTable,
  db, priceBookItemsTable, quotesTable,
} from "@workspace/db"

const apiUrl = "http://127.0.0.1:5080"
const modules = [
  { module: "SERVICE_UPGRADE", route: "service-upgrade", prefix: "su",
    fields: [
      ["su-permit", "permit", "permitAllowance", "permit-allowance"],
      ["su-inspection", "inspection", "inspectionAllowance", "inspection-allowance"],
      ["su-misc", "miscellaneous", "miscellaneousAllowance", "miscellaneous-allowance"],
      ["su-util-coord", "utility", "utilityCoordinationAllowance", "utility-coordination-allowance"],
    ] },
  { module: "PANEL_REPLACEMENT", route: "panel-replacement", prefix: "pr",
    fields: [
      ["pr-permit", "permit", "permitAllowance", "panel-permit-allowance"],
      ["pr-inspect", "inspection", "inspectionAllowance", "panel-inspection-allowance"],
      ["pr-misc", "miscellaneous", "miscellaneousAllowance", "panel-miscellaneous-allowance"],
    ] },
] as const

for (const config of modules) {
  test(`${config.module} zero allowances toggle, restore, save, and revise safely`, async ({
    browser, request,
  }, testInfo) => {
    const marker = randomUUID()
    const userId = `allowance_ui_${marker}`
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
      await page.goto(`/quotes/new/${config.route}?draftScope=allowances-${marker}`)
      await page.locator(`#${config.prefix}-customer`).fill(`Allowance test ${marker}`)
      await page.locator(`#${config.prefix}-project`).fill("Explicit zero allowance test")
      const previewFor = (field: string, amount: number, flag: string, confirmed: boolean) =>
        page.waitForResponse(response => {
          if (!response.url().endsWith("/api/quotes/preview")) return false
          const body = response.request().postDataJSON()
          return body?.module === config.module && body.jobInputs?.[field] === amount
            && body.jobInputs?.allowancesNotRequired?.[flag] === confirmed
        })

      for (const [id, flag, field, lineId] of config.fields) {
        const input = page.locator(`#${id}`)
        const checkbox = page.locator(`#${id}-not-required`)
        await expect(input).toHaveValue("")
        await expect(checkbox).not.toBeChecked()
        let response = previewFor(field, 0, flag, true)
        await checkbox.check()
        const waived = await (await response).json()
        const line = waived.assembly.find((row: { id: string }) => row.id === lineId)
        expect(line.unitCost).toBe(0)
        expect(line.intentionalExclusionReason).toContain("not required / $0")
        expect(waived.pricing.pricingWarnings.length).toBeGreaterThan(0)
        await expect(input).toHaveValue("0")

        response = previewFor(field, 0, flag, false)
        await checkbox.uncheck()
        const unresolved = await (await response).json()
        expect(unresolved.assembly.find((row: { id: string }) => row.id === lineId)
          .intentionalExclusionReason).toBeUndefined()
        await expect(input).toHaveValue("")

        response = previewFor(field, 25.75, flag, false)
        await input.fill("25.75")
        const priced = await (await response).json()
        expect(priced.assembly.find((row: { id: string }) => row.id === lineId).unitCost).toBe(25.75)
        response = previewFor(field, 0, flag, true)
        await input.fill("0")
        await response
        await expect(checkbox).toBeChecked()
      }

      // A typed leading zero must not disable the field or prevent decimal entry.
      const [permitId, permitFlag, permitField] = config.fields[0]
      const permit = page.locator(`#${permitId}`)
      let response = previewFor(permitField, 0.5, permitFlag, false)
      await permit.fill("")
      await permit.pressSequentially("0.50")
      await response
      await expect(permit).toHaveValue("0.50")
      await expect(page.locator(`#${permitId}-not-required`)).not.toBeChecked()
      await permit.fill("-1")
      expect(await permit.evaluate(element =>
        (element as unknown as { validity: { rangeUnderflow: boolean } }).validity.rangeUnderflow,
      )).toBe(true)
      response = previewFor(permitField, 0, permitFlag, true)
      await permit.fill("0")
      await response

      await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some(key => {
        try {
          const inputs = JSON.parse(localStorage.getItem(key) ?? "{}").values?.inputs
          return inputs?.allowancesNotRequired?.permit === true
            && inputs?.allowancesNotRequired?.miscellaneous === true
        } catch { return false }
      }))).toBe(true)
      await page.reload()
      await page.getByTestId("button-restore-quote-draft").click()
      for (const [id] of config.fields) {
        await expect(page.locator(`#${id}-not-required`)).toBeChecked()
        await expect(page.locator(`#${id}`)).toHaveValue("0")
      }
      const section = permit.locator("xpath=ancestor::section")
      await section.scrollIntoViewIfNeeded()
      await page.screenshot({ path: testInfo.outputPath("allowances-desktop.png") })
      await page.setViewportSize({ width: 375, height: 812 })
      await permit.scrollIntoViewIfNeeded()
      await page.screenshot({ path: testInfo.outputPath("allowances-mobile.png") })
      for (const [id] of config.fields) {
        expect(await page.locator(`#${id}`).evaluate(el => el.getBoundingClientRect().right))
          .toBeLessThanOrEqual(375)
      }
      await page.setViewportSize({ width: 1280, height: 900 })

      const save = () => page.getByRole("button", {
        name: config.module === "SERVICE_UPGRADE" ? "Create Quote Snapshot" : "Generate Quote",
      }).click()
      await save()
      await expect(page).toHaveURL(/\/quotes\/\d+$/)
      const sourceId = Number(page.url().split("/").at(-1))
      const source = await (await request.get(`${apiUrl}/api/quotes/${sourceId}`, { headers })).json()
      for (const [, flag, , lineId] of config.fields) {
        expect(source.jobInputs.allowancesNotRequired[flag]).toBe(true)
        expect(source.assembly.find((row: { id: string }) => row.id === lineId)
          .intentionalExclusionReason).toContain("not required / $0")
      }
      // Waiving allowances cannot make unrelated unpriced material customer-ready.
      expect((await request.patch(`${apiUrl}/api/quotes/${sourceId}`, {
        headers, data: { status: "ready" },
      })).status()).toBe(409)
      await page.reload()
      await page.getByTestId("button-duplicate-quote").click()
      await expect(page.locator(`#${permitId}-not-required`)).toBeChecked()
      response = previewFor(permitField, 42.5, permitFlag, false)
      await permit.fill("42.50")
      await response
      await save()
      await expect(page).toHaveURL(/\/quotes\/\d+$/)
      const revisedId = Number(page.url().split("/").at(-1))
      expect(revisedId).not.toBe(sourceId)
      const revised = await (await request.get(`${apiUrl}/api/quotes/${revisedId}`, { headers })).json()
      expect(revised.jobInputs.allowancesNotRequired.permit).toBe(false)
      expect(revised.jobInputs.permitAllowance).toBe(42.5)
      const original = await (await request.get(`${apiUrl}/api/quotes/${sourceId}`, { headers })).json()
      expect(original.jobInputs.allowancesNotRequired.permit).toBe(true)
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
}
