import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  db, companiesTable, companyMembersTable, companySettingsTable,
  priceBookItemsTable, priceBookImportsTable,
} from "@workspace/db";

test("raw supplier CSV review paginates and applies only a selected canonical price update", async ({ browser, request }) => {
  const userId = `supplier_import_ui_${randomUUID()}`;
  const headers = { "x-test-clerk-user-id": userId };
  const api = "http://127.0.0.1:5080";
  let companyId: number | undefined;
  const context = await browser.newContext({ extraHTTPHeaders: headers });
  try {
    expect((await request.get(`${api}/api/settings`, { headers })).ok()).toBe(true);
    const [membership] = await db.select().from(companyMembersTable).where(eq(companyMembersTable.userId, userId));
    companyId = membership!.companyId;
    const [catalogItem] = await db.insert(priceBookItemsTable).values({
      companyId, category: "Conductor", item: "Import test canonical cable",
      unit: "ft", unitCost: 0.5, supplier: "Northeast Electrical",
      supplierSku: "TEST-WIRE-ONLY", sourceDate: "2026-08-25",
      isDefault: false, isContractorOwned: false,
    }).returning();
    const page = await context.newPage();
    await page.goto("/price-book");
    const csv = [
      "NORTHEAST ELECTRICAL",
      "** Price Sheet as of 09/24/26 **",
      "SKU,STOCK NUMBER,DESCRIPTION,UPC,UOM,PRICE",
      "TEST-WIRE-ONLY,TRUNCATED,,,m,750",
      ...Array.from({ length: 101 }, (_, i) => `NEW-TEST-${i},SHORT,New test material ${i},,ea,2.50`),
    ].join("\n");
    await page.getByTestId("northeast-price-file").setInputFiles({
      name: "synthetic-northeast.csv", mimeType: "text/csv", buffer: Buffer.from(csv),
    });
    await page.getByTestId("preview-price-book-import").click();
    await expect(page.getByText("Showing 1–100 of 102 rows")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Select CSV row 4", exact: true })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Select CSV row 5", exact: true })).not.toBeChecked();
    await page.getByRole("button", { name: "Next rows" }).click();
    await expect(page.getByText("Showing 101–102 of 102 rows")).toBeVisible();
    await page.getByRole("button", { name: "Previous rows" }).click();
    await page.getByRole("button", { name: "Deselect all" }).click();
    await page.getByRole("checkbox", { name: "Select CSV row 4", exact: true }).check();
    await page.getByTestId("apply-price-book-import").click();
    await expect(page.getByText("Price book updated", { exact: true })).toBeVisible();
    const [updated] = await db.select().from(priceBookItemsTable).where(eq(priceBookItemsTable.id, catalogItem!.id));
    expect(updated!.unitCost).toBe(0.75);
    expect(updated!.item).toBe("Import test canonical cable");
    const all = await db.select().from(priceBookItemsTable).where(eq(priceBookItemsTable.companyId, companyId));
    expect(all.some(item => item.supplierSku?.startsWith("NEW-TEST-"))).toBe(false);
  } finally {
    await context.close();
    if (companyId !== undefined) {
      await db.delete(priceBookImportsTable).where(eq(priceBookImportsTable.companyId, companyId));
      await db.delete(priceBookItemsTable).where(eq(priceBookItemsTable.companyId, companyId));
      await db.delete(companySettingsTable).where(eq(companySettingsTable.companyId, companyId));
      await db.delete(companyMembersTable).where(eq(companyMembersTable.companyId, companyId));
      await db.delete(companiesTable).where(eq(companiesTable.id, companyId));
    }
  }
});
