import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("customer list distinguishes failed requests from an empty company", async ({ page }) => {
  await page.route("**/api/customers**", route => route.fulfill({
    status: 503, contentType: "application/json", body: '{"error":"Internal test failure"}',
  }));
  await page.goto("/customers");
  await expect(page.getByRole("alert")).toContainText("Could not load customers", { timeout: 15000 });
  await expect(page.getByText("No customers yet. Add one or create a quote to get started.")).toHaveCount(0);
  await expect(page.getByText("Internal test failure")).toHaveCount(0);
  if (process.env.AUDIT_OUTPUT) {
    await mkdir(process.env.AUDIT_OUTPUT, { recursive: true });
    await page.screenshot({ path: `${process.env.AUDIT_OUTPUT}/customers-error-after.png`, fullPage: true });
  }
  await page.unroute("**/api/customers**");
  await page.route("**/api/customers**", route => route.fulfill({ json: [] }));
  await page.getByRole("button", { name: "Retry loading customers" }).click();
  await expect(page.getByText("No customers yet. Add one or create a quote to get started.")).toBeVisible();
});

test("customer search and customer names have keyboard-accessible controls", async ({ page }) => {
  await page.route("**/api/customers**", route => route.fulfill({ json: [{
    id: 987654, name: "QA Keyboard Customer", email: "keyboard@example.com",
    quoteCount: 0, totalQuoted: 0, latestQuoteAt: null,
  }] }));
  await page.goto("/customers");
  await expect(page.getByRole("searchbox", { name: "Search customers" })).toBeVisible();
  const customer = page.getByRole("link", { name: "QA Keyboard Customer", exact: true });
  await customer.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/customers\/987654$/);
});
