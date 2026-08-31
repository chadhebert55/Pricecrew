import { expect, test } from "@playwright/test"
import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import {
  companiesTable,
  companyMembersTable,
  companySettingsTable,
  customersTable,
  db,
  priceBookItemsTable,
  quotesTable,
} from "@workspace/db"

const apiUrl = "http://127.0.0.1:5080"

test("unfinished quote drafts restore, clear, and stay isolated by user", async ({
  browser,
  request,
}) => {
  const marker = randomUUID()
  const userId = `draft_recovery_ui_${marker}`
  const firstScope = `draft-user-a-${marker}`
  const secondScope = `draft-user-b-${marker}`
  const customerName = `Draft customer ${marker}`
  const projectName = `Recovered EV quote ${marker}`
  let companyId: number | undefined

  try {
    const settingsResponse = await request.get(`${apiUrl}/api/settings`, {
      headers: { "x-test-clerk-user-id": userId },
    })
    expect(settingsResponse.ok()).toBe(true)

    const [membership] = await db
      .select({ companyId: companyMembersTable.companyId })
      .from(companyMembersTable)
      .where(eq(companyMembersTable.userId, userId))
    expect(membership).toBeTruthy()
    companyId = membership!.companyId

    const context = await browser.newContext({
      extraHTTPHeaders: { "x-test-clerk-user-id": userId },
    })
    const page = await context.newPage()
    const firstBuilderUrl = `/quotes/new?draftScope=${encodeURIComponent(firstScope)}`
    const secondBuilderUrl = `/quotes/new?draftScope=${encodeURIComponent(secondScope)}`

    await page.goto(firstBuilderUrl)
    await expect(page.getByRole("heading", { name: "New Quote" })).toBeVisible()
    await page.locator("#customerName").fill(customerName)
    await page.locator("#projectName").fill(projectName)
    await expect.poll(() =>
      page.evaluate((scope) => {
        const storage = (globalThis as unknown as {
          localStorage: { length: number; key: (index: number) => string | null }
        }).localStorage
        return Array.from({ length: storage.length }, (_, index) => storage.key(index))
          .some((key) => key?.includes(encodeURIComponent(scope)))
      }, firstScope),
    ).toBe(true)

    await page.reload()
    await expect(page.getByTestId("alert-quote-draft-available")).toBeVisible()
    await expect(page.locator("#customerName")).toHaveValue("")
    await page.getByTestId("button-restore-quote-draft").click()
    await expect(page.locator("#customerName")).toHaveValue(customerName)
    await expect(page.locator("#projectName")).toHaveValue(projectName)

    await page.goto(secondBuilderUrl)
    await expect(page.getByRole("heading", { name: "New Quote" })).toBeVisible()
    await expect(page.getByTestId("alert-quote-draft-available")).toHaveCount(0)
    await expect(page.locator("#customerName")).toHaveValue("")

    await page.goto(firstBuilderUrl)
    await expect(page.getByTestId("alert-quote-draft-available")).toBeVisible()
    await page.getByTestId("button-discard-quote-draft").click()
    await page.reload()
    await expect(page.getByTestId("alert-quote-draft-available")).toHaveCount(0)

    await page.locator("#customerName").fill(customerName)
    await page.locator("#projectName").fill(projectName)
    await expect.poll(() =>
      page.evaluate((scope) => {
        const storage = (globalThis as unknown as {
          localStorage: { length: number; key: (index: number) => string | null }
        }).localStorage
        return Array.from({ length: storage.length }, (_, index) => storage.key(index))
          .some((key) => key?.includes(encodeURIComponent(scope)))
      }, firstScope),
    ).toBe(true)

    const generateButton = page.getByRole("button", { name: "Generate Quote" })
    await expect(generateButton).toBeEnabled({ timeout: 20_000 })
    await generateButton.click()
    await expect(page).toHaveURL(/\/quotes\/\d+$/, { timeout: 20_000 })

    await page.goto(firstBuilderUrl)
    await expect(page.getByTestId("alert-quote-draft-available")).toHaveCount(0)

    for (const builder of [
      {
        path: "/quotes/new/panel-replacement",
        heading: "New Panel Replacement Quote",
        firstBreaker: "input-breaker-15-1-Standard",
        secondBreaker: "input-breaker-20-1-AFCI",
      },
      {
        path: "/quotes/new/service-upgrade",
        heading: "New Service Upgrade Quote",
        firstBreaker: "input-breaker-15-1-Standard",
        secondBreaker: "input-breaker-20-1-AFCI",
      },
    ]) {
      const scope = `${firstScope}-${builder.path.split("/").at(-1)}`
      const builderUrl = `${builder.path}?draftScope=${encodeURIComponent(scope)}`
      await page.goto(builderUrl)
      await expect(page.getByRole("heading", { name: builder.heading })).toBeVisible()
      await page.getByTestId(builder.firstBreaker).fill("2")
      await page.getByTestId(builder.secondBreaker).fill("3")
      await expect.poll(() =>
        page.evaluate((draftScope) => {
          const storage = (globalThis as unknown as {
            localStorage: { length: number; key: (index: number) => string | null }
          }).localStorage
          return Array.from({ length: storage.length }, (_, index) => storage.key(index))
            .some((key) => key?.includes(encodeURIComponent(draftScope)))
        }, scope),
      ).toBe(true)

      await page.reload()
      await expect(page.getByTestId("alert-quote-draft-available")).toBeVisible()
      await page.getByTestId("button-restore-quote-draft").click()
      await expect(page.getByTestId(builder.firstBreaker)).toHaveValue("2")
      await expect(page.getByTestId(builder.secondBreaker)).toHaveValue("3")

      await page.getByTestId(builder.firstBreaker).fill("4")
      await expect(page.getByTestId(builder.secondBreaker)).toHaveValue("3")
      await page.reload()
      await expect(page.getByTestId("alert-quote-draft-available")).toBeVisible()
      await page.getByTestId("button-restore-quote-draft").click()
      await expect(page.getByTestId(builder.firstBreaker)).toHaveValue("4")
      await expect(page.getByTestId(builder.secondBreaker)).toHaveValue("3")
    }

    await context.close()
  } finally {
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

test("unfinished quote warns when browser storage blocks or rejects draft writes", async ({
  browser,
  request,
}) => {
  const marker = randomUUID()
  const userId = `draft_storage_warning_ui_${marker}`
  let companyId: number | undefined

  try {
    const settingsResponse = await request.get(`${apiUrl}/api/settings`, {
      headers: { "x-test-clerk-user-id": userId },
    })
    expect(settingsResponse.ok()).toBe(true)

    const [membership] = await db
      .select({ companyId: companyMembersTable.companyId })
      .from(companyMembersTable)
      .where(eq(companyMembersTable.userId, userId))
    expect(membership).toBeTruthy()
    companyId = membership!.companyId

    for (const storageFailure of ["blocked", "quota"] as const) {
      const context = await browser.newContext({
        extraHTTPHeaders: { "x-test-clerk-user-id": userId },
      })
      await context.addInitScript((failure) => {
        const state = globalThis as typeof globalThis & {
          __quoteDraftStorageBlocked?: boolean
          name: string
        }
        state.__quoteDraftStorageBlocked = state.name !== "quote-draft-storage-recovered"
        const originalSetItem = Storage.prototype.setItem
        Storage.prototype.setItem = function (key, value) {
          if (state.__quoteDraftStorageBlocked) {
            throw new DOMException(
              failure === "quota" ? "Quota exceeded" : "Storage is blocked",
              failure === "quota" ? "QuotaExceededError" : "SecurityError",
            )
          }
          return originalSetItem.call(this, key, value)
        }
      }, storageFailure)

      const page = await context.newPage()
      await page.goto(`/quotes/new?draftScope=storage-warning-${storageFailure}-${marker}`)
      await expect(page.getByRole("heading", { name: "New Quote" })).toBeVisible()
      await page.locator("#customerName").fill(`Storage test ${storageFailure} ${marker}`)
      await expect(page.getByTestId("alert-quote-draft-storage")).toBeVisible()
      await expect(page.getByTestId("alert-quote-draft-storage")).toContainText(
        "Refreshing or closing this page may lose your work.",
      )
      await page.getByTestId("button-retry-quote-draft-storage").click()
      await expect(page.getByTestId("alert-quote-draft-storage")).toBeVisible()
      await expect(page.locator("#customerName")).toHaveValue(
        `Storage test ${storageFailure} ${marker}`,
      )
      await expect(page.locator("#projectName")).toHaveValue("")

      if (storageFailure === "blocked") {
        await page.evaluate(() => {
          const state = globalThis as typeof globalThis & {
            __quoteDraftStorageBlocked?: boolean
            name: string
          }
          state.__quoteDraftStorageBlocked = false
          state.name = "quote-draft-storage-recovered"
        })
        await page.getByTestId("button-retry-quote-draft-storage").click()
        await expect(page.getByTestId("alert-quote-draft-storage")).toHaveCount(0)
        await expect(page.locator("#customerName")).toHaveValue(
          `Storage test ${storageFailure} ${marker}`,
        )
        await expect(page.locator("#projectName")).toHaveValue("")
        await page.reload()
        await expect(page.getByTestId("alert-quote-draft-available")).toBeVisible()
        await expect(page.locator("#customerName")).toHaveValue("")
        await expect(page.locator("#projectName")).toHaveValue("")
        await page.getByTestId("button-restore-quote-draft").click()
        await expect(page.locator("#customerName")).toHaveValue(
          `Storage test ${storageFailure} ${marker}`,
        )
        await expect(page.locator("#projectName")).toHaveValue("")
      }

      await context.close()
    }
  } finally {
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