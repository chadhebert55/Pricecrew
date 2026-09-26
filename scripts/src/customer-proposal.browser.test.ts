import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const requireApi = createRequire(new URL("../../artifacts/api-server/package.json", import.meta.url));
const { PDFParse } = requireApi("pdf-parse");

const proposal = {
  quoteNumber: "Q-000016", customerName: "Alex Customer", projectName: "200A panel replacement",
  createdAt: "2026-09-26T12:00:00Z", status: "ready", finalSellingPrice: 3812.95,
  proposalDescription: "Replace the existing electrical panel with a 200A, 40-space panel and reconnect the existing feeder.",
  scope: [
    ["200A 40-space electrical panel", "Included"],
    ["Existing feeder", "Reconnect/reuse"],
    ["Required circuit breakers", "Included"],
    ["Grounding & bonding", "Included"],
    ["Panel mounting/backboard", "Included"],
    ["Circuit identification & panel directory", "Included"],
    ["Testing & cleanup", "Included"],
  ].map(([description, displayValue], index) => ({ id: String(index), description, displayValue, quantity: 1, unit: "scope" })),
  assumptions: ["Existing feeder cable will be reused only after field verification of its condition, size, ampacity, length, terminations, grounding, and suitability for the new panel."],
  company: { displayName: "Example Electrical Service", contactPhone: "(603) 555-0100",
    contactEmail: "office@example.com", contactAddress: "", accentColor: "#2563eb" },
  terms: "", decision: null,
};

test("customer proposal produces a one-page contractor PDF and gates acceptance with agreement", async ({ page }) => {
  let decisionBody: Record<string, unknown> | undefined;
  await page.route("**/api/proposals/pdf-preview", async route => {
    if (route.request().method() === "POST") {
      decisionBody = route.request().postDataJSON();
      await route.fulfill({ json: { id: 1, quoteId: 1, revisionNumber: 3,
        tokenIssuedAt: proposal.createdAt, decidedAt: "2026-09-26T19:00:00Z", ...decisionBody } });
    } else await route.fulfill({ json: proposal });
  });
  await page.goto("/proposals/pdf-preview");
  await expect(page.getByTestId("proposal-reference")).toContainText("Proposal #Q-000016");
  await expect(page.getByTestId("proposal-reference")).toContainText("September 26, 2026");
  await expect(page.getByText("Ready", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("button-accept-proposal")).toBeDisabled();
  await expect(page.getByTestId("button-decline-proposal")).toBeEnabled();
  await expect(page.getByText(/Scheduling: Work dates/)).toBeVisible();
  await expect(page.getByTestId("button-accept-proposal")).toHaveCSS("background-color", "rgb(37, 99, 235)");

  await page.route("**/fonts/proposal-regular.ttf", route => route.abort());
  await page.getByTestId("button-download-customer-pdf").click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByTestId("button-download-customer-pdf")).toBeEnabled();
  await page.unroute("**/fonts/proposal-regular.ttf");
  const downloaded = page.waitForEvent("download");
  await page.getByTestId("button-download-customer-pdf").click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe("Proposal-Q-000016.pdf");
  const path = test.info().outputPath("customer-panel-proposal.pdf");
  await file.saveAs(path);
  const parser = new PDFParse({ data: new Uint8Array(await readFile(path)) });
  const pdf = await parser.getText();
  await parser.destroy();
  expect(pdf.total).toBe(1);
  expect(pdf.text).toContain("$3,812.95");
  expect(pdf.text).toContain("Page 1 of 1");
  expect(pdf.text).toContain("office@example.com");
  expect(pdf.text).toContain("Acceptance");
  expect(pdf.text).toContain("Signature:");
  expect(pdf.text).not.toMatch(/PriceCrew|Ready|https?:|not required|unitCost|Gross Profit/);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: test.info().outputPath("proposal-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: test.info().outputPath("proposal-mobile.png"), fullPage: true });
  expect(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true);
  await page.getByTestId("checkbox-proposal-agreement").check();
  await page.getByTestId("button-accept-proposal").click();
  await page.getByTestId("input-decision-customer-name").fill("Alex Customer");
  await page.getByTestId("input-decision-signature").fill("Alex Customer");
  await page.getByTestId("button-submit-decision").click();
  await expect(page.getByTestId("proposal-decision-status")).toContainText("Proposal accepted");
  expect(decisionBody).toMatchObject({ decision: "accepted", scopeAcknowledged: true,
    customerName: "Alex Customer", signature: "Alex Customer" });
});

test("long scope PDFs repeat headings and preserve custom terms with no orphan row", async ({ page }) => {
  const long = { ...proposal, projectName: "Larger electrical project", terms: "Company-specific terms: Payment is due on completion.",
    assumptions: [], scope: Array.from({ length: 55 }, (_, index) => ({
      id: String(index), description: `Electrical work area ${index + 1}`, displayValue: "Included", quantity: 1, unit: "scope",
    })) };
  await page.route("**/api/proposals/pdf-long", route => route.fulfill({ json: long }));
  await page.goto("/proposals/pdf-long");
  await expect(page.getByText(long.terms, { exact: true })).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await page.getByTestId("button-download-customer-pdf").click();
  const file = await downloaded;
  const path = test.info().outputPath("long-proposal.pdf");
  await file.saveAs(path);
  const parser = new PDFParse({ data: new Uint8Array(await readFile(path)) });
  const pdf = await parser.getText();
  await parser.destroy();
  expect(pdf.total).toBeGreaterThan(1);
  expect(pdf.text).toContain(long.terms);
  expect(pdf.text).not.toContain("Validity: Pricing");
  for (const documentPage of pdf.pages) {
    const rows = documentPage.text.match(/Electrical work area \d+/g) ?? [];
    if (rows.length) {
      expect(rows.length).toBeGreaterThanOrEqual(3);
      expect(documentPage.text).toContain("Included Scope");
      expect(documentPage.text).toContain("Description");
    }
  }
  for (let i = 1; i <= 55; i++) expect(pdf.text).toContain(`Electrical work area ${i}`);
});
