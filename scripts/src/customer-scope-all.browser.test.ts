import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { eq } from "drizzle-orm";
import {
  db,
  companyMembersTable,
  quotesTable,
  customersTable,
  priceBookItemsTable,
  companySettingsTable,
  companiesTable,
} from "@workspace/db";
import { readFileSync } from "node:fs";
const fixtures = JSON.parse(
  readFileSync(
    new URL("./customer-scope-fixtures.json", import.meta.url),
    "utf8",
  ),
) as Array<{
  id: string;
  module: string;
  jobInputs: Record<string, unknown>;
  customerName: string;
  projectName: string;
  proposalDescription: string;
}>;
const requireApi = createRequire(
  new URL("../../artifacts/api-server/package.json", import.meta.url),
);
const { PDFParse } = requireApi("pdf-parse");
const before = process.env.SCOPE_PHASE === "before";
const out = process.env.SCOPE_OUTPUT;
for (const fixture of fixtures)
  test(`customer scope ${fixture.id}: saved/internal/public-render/PDF/immutable revision`, async ({
    browser,
    request,
  }, info) => {
    if (
      !["localhost", "127.0.0.1"].includes(
        new URL(process.env.DATABASE_URL!).hostname,
      )
    )
      throw Error("Local only");
    const userId = `scope_${randomUUID()}`,
      headers = { "x-test-clerk-user-id": userId },
      api = "http://127.0.0.1:5080/api";
    await request.get(`${api}/settings`, { headers });
    const [member] = await db
      .select()
      .from(companyMembersTable)
      .where(eq(companyMembersTable.userId, userId));
    const companyId = member!.companyId;
    const context = await browser.newContext({
      extraHTTPHeaders: headers,
      viewport: { width: 1280, height: 1000 },
    });
    await context.route("https://**/*", (r) => {
      const h = { ...r.request().headers() };
      delete h["x-test-clerk-user-id"];
      return r.continue({ headers: h });
    });
    const path = async (name: string) => {
      if (out) {
        await mkdir(out, { recursive: true });
        return `${out}/${fixture.id}-${name}`;
      }
      return info.outputPath(`${fixture.id}-${name}`);
    };
    try {
      const created = await request.post(`${api}/quotes`, {
        headers,
        data: fixture,
      });
      expect(created.status()).toBe(201);
      const saved = await created.json();
    const original = structuredClone(saved);
    if (fixture.id === "custom" && !before) {
      const ambiguous = await request.post(`${api}/quotes`, {
        headers,
        data: { ...fixture, jobInputs: { ...fixture.jobInputs,
          materials: [{ id: "ambiguous", description: "Electrical material", quantity: 1, unit: "ea", unitCost: 25 }] } },
      });
      expect(ambiguous.status()).toBe(201);
      const draft = await ambiguous.json();
      expect(draft.customerScopeReview.length).toBeGreaterThan(0);
      const blocked = await request.patch(`${api}/quotes/${draft.id}`, { headers, data: { status: "ready" } });
      expect(blocked.status()).toBe(409);
      expect((await blocked.json()).error).toContain("Customer scope needs review");
    }
      const p = saved.pricing,
        round = (n: number) => Math.round(n * 100) / 100;
      expect(p.materialCost).toBe(
        round(
          saved.assembly.reduce((s: number, l: any) => s + l.extendedCost, 0),
        ),
      );
      expect(p.grossProfit).toBe(
        round(
          p.finalSellingPrice -
            p.materialCost -
            (p.laborOverride ?? p.laborCost),
        ),
      );
      if (p.finalSellingPrice > 0)
        expect(p.grossMargin).toBeCloseTo(
          p.grossProfit / p.finalSellingPrice,
          4,
        );
      const page = await context.newPage();
      await page.goto(`/quotes/${saved.id}`);
      await expect(
        page.getByRole("heading", { name: fixture.projectName, exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Customer View", exact: true })
        .click();
      const preview = page.getByTestId("customer-view-preview");
      if (!before)
        expect(await preview.innerText()).not.toMatch(
          /Electrical material|^Circuit breaker$|\bSKU\b|PRIVATE ESTIMATOR|Gross Profit|Gross Margin|Loaded Labor|unitCost|\[object Object\]/m,
        );
      if (!before) expect(saved.customerScopeReview).toEqual([]);
      await page.screenshot({
        path: await path("saved-customer.png"),
        fullPage: true,
      });
      // Exercise the real readiness API; never make incomplete fixture estimates Ready.
      const ready = await request.patch(`${api}/quotes/${saved.id}`, {
        headers,
        data: { status: "ready" },
      });
      const hasErrors =
        saved.pricing.pricingWarnings.some(
          (w: any) => w.severity === "error",
        ) ||
        saved.assembly.some((l: any) =>
          l.resolutionStatus?.startsWith("UNRESOLVED"),
        );
      if (hasErrors) expect(ready.status()).toBe(409);
      const current = await (
        await request.get(`${api}/quotes/${saved.id}`, { headers })
      ).json();
      if (ready.status() === 200) {
        // Real public endpoint parity on ready fixtures (no mock).
        await page.reload();
        const publicResponse = page.waitForResponse((r) =>
          r.url().includes("/api/proposals/"),
        );
        await page
          .getByRole("button", { name: "Customer Proposal", exact: true })
          .click();
        const actual = await (await publicResponse).json();
        expect(actual.scope).toEqual(saved.customerScope);
        expect(actual.finalSellingPrice).toBe(saved.pricing.finalSellingPrice);
      expect(actual).not.toHaveProperty("customerScopeReview");
      if (fixture.id === "custom" && !before) {
        const url=(await publicResponse).url();
        const [issuedRow]=await db.select().from(quotesTable).where(eq(quotesTable.id,saved.id));
        // Synthetic historical issued payload; no production quote is touched.
        await db.update(quotesTable).set({
          assembly: saved.assembly.map((l:any)=>({...l,description:"Electrical material"})),
          updatedAt: issuedRow!.updatedAt,
        }).where(eq(quotesTable.id,saved.id));
        const blocked=await request.get(url);
        expect(blocked.status()).toBe(409);
        expect(JSON.stringify(await blocked.json())).not.toMatch(/custom-material|unitCost/);
        await db.update(quotesTable).set({assembly:saved.assembly,updatedAt:issuedRow!.updatedAt}).where(eq(quotesTable.id,saved.id));
      }
      }
      // Public-render fixture uses the actual saved DTO scope, not hand-authored material replacements.
      // This tests presentation/PDF for unresolved jobs WITHOUT bypassing their live sharing gate.
      const publicFixture = {
        quoteNumber: saved.quoteNumber,
        customerName: saved.customerName,
        projectName: saved.projectName,
        status: "ready",
        proposalDescription: saved.proposalDescription,
        createdAt: saved.createdAt,
        finalSellingPrice: saved.pricing.finalSellingPrice,
        scope: saved.customerScope,
        assumptions: saved.customerAssumptions ?? [],
        terms: "",
        decision: null,
        company: {
          displayName: "Example Electrical",
          contactPhone: "603-555-0100",
          contactEmail: "qa@example.com",
          contactAddress: "",
          accentColor: "#01696f",
        },
      };
      await context.route(`**/api/proposals/scope-${fixture.id}`, (r) =>
        r.fulfill({ json: publicFixture }),
      );
      await page.goto(`/proposals/scope-${fixture.id}`);
      await expect(
        page.getByTestId("button-download-customer-pdf"),
      ).toBeEnabled();
      for (const width of [1280, 834, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(
          await page.evaluate(
            "document.documentElement.scrollWidth <= innerWidth",
          ),
        ).toBe(true);
        await page.screenshot({
          path: await path(`proposal-${width}.png`),
          fullPage: true,
        });
      }
      for (const line of saved.customerScope)
        await expect(
          page.getByText(line.description, { exact: true }).first(),
        ).toBeVisible();
      const download = page.waitForEvent("download");
      await page.getByTestId("button-download-customer-pdf").click();
      const file = await path("proposal.pdf");
      await (await download).saveAs(file);
      const parser = new PDFParse({
        data: new Uint8Array(await readFile(file)),
      });
      const pdf = await parser.getText();
      await parser.destroy();
      expect(pdf.text).toContain(
        saved.pricing.finalSellingPrice.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
      );
      if (!before)
        expect(pdf.text).not.toMatch(
          /Electrical material|^Circuit breaker$|\bSKU\b|PRIVATE ESTIMATOR|Gross Profit|Gross Margin|Loaded Labor|unitCost|\[object Object\]/m,
        );
      for (const line of saved.customerScope)
        expect(pdf.text.replace(/\s+/g, " ")).toContain(
          line.description.replace(/\s+/g, " "),
        );
      const duplicate = await request.post(
        `${api}/quotes/${saved.id}/duplicate`,
        { headers, data: {} },
      );
      expect(duplicate.status()).toBe(201);
      const revised = await duplicate.json();
      expect(revised.assembly).toEqual(saved.assembly);
      expect(revised.customerScope).toEqual(saved.customerScope);
      await db
        .update(priceBookItemsTable)
        .set({ unitCost: 999 })
        .where(eq(priceBookItemsTable.companyId, companyId));
      const reopened = await (
        await request.get(`${api}/quotes/${saved.id}`, { headers })
      ).json();
      expect(reopened.assembly).toEqual(original.assembly);
      expect(reopened.pricing).toEqual(current.pricing);
      expect(reopened.total).toBe(original.total);
    expect(reopened.customerScope).toEqual(original.customerScope);
      await writeFile(
        await path("evidence.json"),
        JSON.stringify(
          {
            fixture,
            saved,
            readinessStatus: ready.status(),
            scope: publicFixture.scope,
            pdfPages: pdf.total,
          },
          null,
          2,
        ),
      );
    } finally {
      await context.close();
      for (const table of [
        quotesTable,
        customersTable,
        priceBookItemsTable,
        companySettingsTable,
        companyMembersTable,
      ])
        await db.delete(table).where(eq(table.companyId, companyId));
      await db.delete(companiesTable).where(eq(companiesTable.id, companyId));
    }
  });
