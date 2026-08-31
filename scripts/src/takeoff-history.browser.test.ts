import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  companiesTable,
  companyMembersTable,
  companySettingsTable,
  customersTable,
  db,
  planTakeoffsTable,
  priceBookItemsTable,
  quotesTable,
  takeoffItemsTable,
  takeoffReviewEventsTable,
  type AdditionInputRecord,
  type TakeoffQuoteSnapshotRecord,
} from "@workspace/db";

const apiUrl = "http://127.0.0.1:5080";
const originalNote = "Approved from the original plan set.";
const correctionNote = "Correction: field-verified five receptacles.";

const jobInputs: AdditionInputRecord = {
  length: 20,
  width: 16,
  receptacles: 3,
  switches: 1,
  dimmers: 0,
  recessedLights: 0,
  ceilingFans: 0,
  customerSuppliedFans: true,
  circuitCount: 1,
  routeLength: 50,
  homeRunLength: 35,
  panelManufacturer: "Siemens",
  breakerAmperage: 20,
  breakerPoleCount: 1,
  breakerProtectionType: "Standard",
  cableType: "12/2 NM-B",
  subpanelOption: "No Subpanel",
  feederDistance: 0,
  crewSize: 1,
  crewHours: 1,
  notes: "",
};

type TakeoffResponse = {
  id: number;
  fileName: string;
  approvedInputs: Record<string, number>;
  items: TakeoffQuoteSnapshotRecord["items"];
  reviewEvents: TakeoffQuoteSnapshotRecord["reviewEvents"];
};

test("confirmed takeoff correction stays separate from the saved quote snapshot", async ({
  browser,
  request,
}) => {
  const marker = randomUUID();
  const userId = `takeoff_history_ui_${marker}`;
  let companyId: number | undefined;
  let takeoffId: number | undefined;
  let quoteId: number | undefined;

  try {
    const [company] = await db
      .insert(companiesTable)
      .values({ name: `Takeoff history UI ${marker}` })
      .returning({ id: companiesTable.id });
    expect(company).toBeTruthy();
    companyId = company!.id;

    await db.insert(companyMembersTable).values({
      userId,
      companyId,
      role: "owner",
    });

    const [takeoff] = await db
      .insert(planTakeoffsTable)
      .values({
        companyId,
        builderModule: "ADDITION",
        fileName: `addition-plan-${marker}.pdf`,
        objectPath: `/objects/e2e/${companyId}/${marker}`,
        fileSize: 1,
        contentType: "application/pdf",
        baseInputs: jobInputs,
        status: "ready",
        pageCount: 1,
        extractionSummary: {
          pages: 1,
          sections: ["Electrical schedule"],
          textCharacters: 100,
          ocrUsed: false,
          ocrPages: [],
          ocrSkippedPages: [],
          ocrWarning: null,
          ocrCharacters: 0,
          ocrAverageConfidence: null,
        },
        completedAt: new Date("2026-08-30T12:00:00.000Z"),
      })
      .returning({ id: planTakeoffsTable.id });
    expect(takeoff).toBeTruthy();
    takeoffId = takeoff!.id;

    const [item] = await db
      .insert(takeoffItemsTable)
      .values({
        takeoffId,
        fieldKey: "receptacles",
        label: "Receptacles",
        kind: "quantity",
        proposedQuantity: 3,
        approvedQuantity: null,
        confidence: "high",
        sourceContext: "Room schedule calls for three receptacles.",
        sourcePage: 1,
        status: "pending",
      })
      .returning({ id: takeoffItemsTable.id });
    expect(item).toBeTruthy();

    const initialApprovalResponse = await request.patch(
      `${apiUrl}/api/takeoffs/${takeoffId}/items/${item!.id}`,
      {
        headers: {
          "x-test-clerk-user-id": userId,
        },
        data: {
          status: "accepted",
          approvedQuantity: 3,
          reviewerNote: originalNote,
          expectedStatus: "pending",
          expectedApprovedQuantity: null,
          expectedReviewerNote: null,
        },
      },
    );
    expect(initialApprovalResponse.ok()).toBe(true);
    const initialTakeoff =
      (await initialApprovalResponse.json()) as TakeoffResponse;
    const approvedAt = new Date().toISOString();
    const snapshot: TakeoffQuoteSnapshotRecord = {
      takeoffId,
      fileName: initialTakeoff.fileName,
      approvedInputs: initialTakeoff.approvedInputs,
      items: initialTakeoff.items,
      reviewEvents: initialTakeoff.reviewEvents,
      approvedAt,
    };

    const [quote] = await db
      .insert(quotesTable)
      .values({
        companyId,
        quoteNumber: `E2E-${marker.slice(0, 8)}`,
        customerName: `Snapshot customer ${marker}`,
        customerEmail: `snapshot-${marker}@example.com`,
        projectName: `Historical addition quote ${marker}`,
        module: "ADDITION",
        status: "draft",
        jobInputs,
        assembly: [
          {
            id: "fixture-receptacles",
            category: "Devices",
            description: "Fixture receptacles",
            quantity: 3,
            unit: "ea",
            unitCost: 100,
            extendedCost: 300,
            source: "Browser test fixture",
          },
        ],
        pricing: {
          materialCost: 300,
          laborCost: 300,
          materialMarkup: 0.25,
          calculatedSellingPrice: 1500,
          finalSellingPrice: 1500,
          laborOverride: null,
          sellingPriceOverride: null,
          grossProfit: 900,
          grossMargin: 0.6,
          pricingWarnings: [],
        },
        proposalDescription: "Original approved blueprint scope",
        takeoffId,
        takeoffReview: snapshot,
        total: 1500,
        margin: 0.6,
      })
      .returning({ id: quotesTable.id });
    expect(quote).toBeTruthy();
    quoteId = quote!.id;

    const context = await browser.newContext({
      extraHTTPHeaders: {
        "x-test-clerk-user-id": userId,
      },
    });
    const page = await context.newPage();

    await page.goto(`/quotes/${quoteId}`);

    const originalSnapshot = page.getByTestId("quote-takeoff-audit");
    await expect(originalSnapshot).toContainText(
      "Blueprint Takeoff Review · Original Saved Approval",
    );
    await expect(originalSnapshot).toContainText("Proposed 3 · approved 3");
    await expect(originalSnapshot).toContainText(originalNote);
    const originalSummary = await page
      .getByText("$1,500.00", { exact: true })
      .last()
      .textContent();

    await page.getByTestId("button-reopen-takeoff-review").click();
    await expect(page.getByText("Propose Blueprint Correction")).toBeVisible();
    await page.getByTestId("takeoff-quantity-receptacles").fill("5");
    await page.getByTestId("takeoff-note-receptacles").fill(correctionNote);
    await page.getByRole("button", { name: "Stage accept" }).click();

    const competingNote = "Competing contractor correction.";
    const competingCorrectionResponse = await request.patch(
      `${apiUrl}/api/takeoffs/${takeoffId}/items/${item!.id}`,
      {
        headers: {
          "x-test-clerk-user-id": userId,
        },
        data: {
          status: "accepted",
          approvedQuantity: 4,
          reviewerNote: competingNote,
          expectedStatus: "accepted",
          expectedApprovedQuantity: 3,
          expectedReviewerNote: originalNote,
        },
      },
    );
    expect(competingCorrectionResponse.ok()).toBe(true);

    await page.getByTestId("button-confirm-takeoff-correction").click();
    const staleAlert = page.getByTestId("alert-takeoff-review-stale");
    await expect(staleAlert).toContainText("Another contractor saved a decision");
    await expect(
      page.getByTestId("button-confirm-takeoff-correction"),
    ).toBeDisabled();
    await page.getByTestId("button-reload-takeoff-review").click();
    await expect(staleAlert).toBeHidden();
    await expect(page.getByTestId("takeoff-quantity-receptacles")).toHaveValue(
      "4",
    );
    await expect(page.getByTestId("takeoff-note-receptacles")).toHaveValue(
      competingNote,
    );

    await page.getByTestId("takeoff-quantity-receptacles").fill("5");
    await page.getByTestId("takeoff-note-receptacles").fill(correctionNote);
    await page.getByRole("button", { name: "Stage accept" }).click();
    await page.getByTestId("button-confirm-takeoff-correction").click();

    await expect(
      page.getByTestId("toast-title").filter({ hasText: "Correction recorded" }),
    ).toBeVisible();
    await expect(originalSnapshot).toContainText("Proposed 3 · approved 3");
    await expect(originalSnapshot).toContainText(originalNote);
    await expect(
      page.getByText("$1,500.00", { exact: true }).last(),
    ).toHaveText(originalSummary ?? "$1,500.00");

    const liveHistory = page.getByTestId(
      "quote-takeoff-proposed-correction",
    );
    await expect(liveHistory).toContainText("Later Proposed Correction");
    await expect(liveHistory).toContainText("Current: accepted · quantity 5");
    await expect(liveHistory).toContainText(correctionNote);
    await expect(liveHistory).toContainText(/Confirmed .+ · 3 total audit events/);

    await page.reload();
    await expect(originalSnapshot).toContainText("Proposed 3 · approved 3");
    await expect(originalSnapshot).toContainText(originalNote);
    await expect(
      page.getByText("$1,500.00", { exact: true }).last(),
    ).toHaveText(originalSummary ?? "$1,500.00");
    await page.getByTestId("button-reopen-takeoff-review").click();
    await expect(page.getByTestId("takeoff-quantity-receptacles")).toHaveValue(
      "5",
    );
    await expect(page.getByTestId("takeoff-note-receptacles")).toHaveValue(
      correctionNote,
    );

    const liveTakeoffResponse = await request.get(
      `${apiUrl}/api/takeoffs/${takeoffId}`,
      {
        headers: {
          "x-test-clerk-user-id": userId,
        },
      },
    );
    expect(liveTakeoffResponse.ok()).toBe(true);
    const liveTakeoff = (await liveTakeoffResponse.json()) as TakeoffResponse;
    expect(liveTakeoff.items[0]?.approvedQuantity).toBe(5);
    expect(liveTakeoff.reviewEvents).toHaveLength(3);
    expect(liveTakeoff.reviewEvents[1]?.nextQuantity).toBe(4);
    expect(liveTakeoff.reviewEvents[2]?.previousQuantity).toBe(4);
    expect(liveTakeoff.reviewEvents[2]?.nextQuantity).toBe(5);

    await context.close();
  } finally {
    if (companyId !== undefined) {
      await db
        .delete(quotesTable)
        .where(eq(quotesTable.companyId, companyId));
      if (takeoffId !== undefined) {
        await db
          .delete(takeoffReviewEventsTable)
          .where(eq(takeoffReviewEventsTable.takeoffId, takeoffId));
        await db
          .delete(takeoffItemsTable)
          .where(eq(takeoffItemsTable.takeoffId, takeoffId));
        await db
          .delete(planTakeoffsTable)
          .where(
            and(
              eq(planTakeoffsTable.id, takeoffId),
              eq(planTakeoffsTable.companyId, companyId),
            ),
          );
      }
      await db
        .delete(companyMembersTable)
        .where(eq(companyMembersTable.userId, userId));
      await db
        .delete(customersTable)
        .where(eq(customersTable.companyId, companyId));
      await db
        .delete(priceBookItemsTable)
        .where(eq(priceBookItemsTable.companyId, companyId));
      await db
        .delete(companySettingsTable)
        .where(eq(companySettingsTable.companyId, companyId));
      await db.delete(companiesTable).where(eq(companiesTable.id, companyId));
    }
  }
});