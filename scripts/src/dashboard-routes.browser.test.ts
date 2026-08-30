import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  companiesTable,
  companyMembersTable,
  companySettingsTable,
  customersTable,
  db,
  priceBookItemsTable,
  quotesTable,
} from "@workspace/db";

const apiUrl = "http://127.0.0.1:5080";
const anonymousWebUrl = "http://127.0.0.1:5175";
const authenticatedWebUrl = "http://127.0.0.1:5174";

const landingHeading = "Private estimating for your contracting company.";

test("unauthenticated dashboard entry points stay on the public landing page", async ({
  page,
}) => {
  await page.goto(`${anonymousWebUrl}/`);
  await expect(page).toHaveURL(`${anonymousWebUrl}/`);
  await expect(page.getByRole("heading", { name: landingHeading })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();

  await page.goto(`${anonymousWebUrl}/dashboard`);
  await expect(page).toHaveURL(`${anonymousWebUrl}/dashboard`);
  await expect(page.getByRole("heading", { name: landingHeading })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});

test("authenticated dashboard bookmarks redirect, survive reload, and keep new quotes available", async ({
  browser,
  request,
}) => {
  const marker = randomUUID();
  const userId = `dashboard_routes_ui_${marker}`;
  let companyId: number | undefined;

  try {
    const settingsResponse = await request.get(`${apiUrl}/api/settings`, {
      headers: { "x-test-clerk-user-id": userId },
    });
    expect(settingsResponse.ok()).toBe(true);

    const [membership] = await db
      .select({ companyId: companyMembersTable.companyId })
      .from(companyMembersTable)
      .where(eq(companyMembersTable.userId, userId));
    expect(membership).toBeTruthy();
    companyId = membership!.companyId;

    const context = await browser.newContext({
      extraHTTPHeaders: { "x-test-clerk-user-id": userId },
    });
    const page = await context.newPage();

    await page.goto(`${authenticatedWebUrl}/dashboard`);
    await expect(page).toHaveURL(`${authenticatedWebUrl}/`);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(`${authenticatedWebUrl}/`);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    await page.goto(`${authenticatedWebUrl}/quotes/new`);
    await expect(page).toHaveURL(`${authenticatedWebUrl}/quotes/new`);
    await expect(page.getByRole("heading", { name: "New Quote" })).toBeVisible();

    await context.close();
  } finally {
    if (companyId !== undefined) {
      await db.delete(quotesTable).where(eq(quotesTable.companyId, companyId));
      await db
        .delete(customersTable)
        .where(eq(customersTable.companyId, companyId));
      await db
        .delete(priceBookItemsTable)
        .where(eq(priceBookItemsTable.companyId, companyId));
      await db
        .delete(companySettingsTable)
        .where(eq(companySettingsTable.companyId, companyId));
      await db
        .delete(companyMembersTable)
        .where(eq(companyMembersTable.userId, userId));
      await db.delete(companiesTable).where(eq(companiesTable.id, companyId));
    }
  }
});