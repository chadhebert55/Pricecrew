import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import test from "node:test";
import { inArray } from "drizzle-orm";
import type { AdditionInputRecord } from "@workspace/db";
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
} from "@workspace/db";
import app from "../app";
import { seedEstimatorData } from "./estimating-seed";

type JsonRecord = Record<string, unknown>;

type Tenant = {
  companyId: number;
  userId: string;
};

type TakeoffResponse = JsonRecord & {
  items: Array<JsonRecord & { id: number }>;
  reviewEvents: JsonRecord[];
};

type QuoteResponse = JsonRecord & {
  id: number;
  jobInputs: JsonRecord;
  assembly: unknown;
  pricing: unknown;
  total: number;
  takeoffReview: JsonRecord | null;
};

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

async function startServer() {
  return new Promise<Server>((resolve, reject) => {
    const candidate = app.listen(0, () => resolve(candidate));
    candidate.once("error", reject);
  });
}

async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

async function createTenant(marker: string, label: string): Promise<Tenant> {
  const [company] = await db
    .insert(companiesTable)
    .values({ name: `Takeoff history ${label} ${marker}` })
    .returning({ id: companiesTable.id });
  assert.ok(company);
  const userId = `takeoff_history_${label.toLowerCase()}_${marker}`;
  await seedEstimatorData(db, { companyId: company.id });
  await db.insert(companyMembersTable).values({
    userId,
    companyId: company.id,
    role: "owner",
  });
  return { companyId: company.id, userId };
}

function headers(userId: string) {
  return {
    "content-type": "application/json",
    "x-test-clerk-user-id": userId,
  };
}

async function requestJson(
  baseUrl: string,
  path: string,
  userId: string,
  init: RequestInit = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...headers(userId),
      ...init.headers,
    },
  });
  const body = (await response.json()) as JsonRecord;
  return { status: response.status, body };
}

async function cleanupTenants(tenants: Tenant[]) {
  const companyIds = tenants.map((tenant) => tenant.companyId);
  await db
    .delete(quotesTable)
    .where(inArray(quotesTable.companyId, companyIds));
  await db
    .delete(planTakeoffsTable)
    .where(inArray(planTakeoffsTable.companyId, companyIds));
  await db
    .delete(customersTable)
    .where(inArray(customersTable.companyId, companyIds));
  await db
    .delete(priceBookItemsTable)
    .where(inArray(priceBookItemsTable.companyId, companyIds));
  await db
    .delete(companySettingsTable)
    .where(inArray(companySettingsTable.companyId, companyIds));
  await db.delete(companyMembersTable).where(
    inArray(
      companyMembersTable.userId,
      tenants.map((tenant) => tenant.userId),
    ),
  );
  await db.delete(companiesTable).where(inArray(companiesTable.id, companyIds));
}

test("blueprint corrections stay in live takeoff history, not saved quote snapshots", async () => {
  const marker = randomUUID();
  const tenantA = await createTenant(marker, "A");
  const tenantB = await createTenant(marker, "B");
  const server = await startServer();
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const [takeoff] = await db
      .insert(planTakeoffsTable)
      .values({
        companyId: tenantA.companyId,
        builderModule: "ADDITION",
        fileName: "addition-plan.pdf",
        objectPath: `/objects/uploads/${tenantA.companyId}/${marker}`,
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
      .returning();
    assert.ok(takeoff);

    const [item] = await db
      .insert(takeoffItemsTable)
      .values({
        takeoffId: takeoff.id,
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
      .returning();
    assert.ok(item);

    const initialReview = await requestJson(
      baseUrl,
      `/api/takeoffs/${takeoff.id}/items/${item.id}`,
      tenantA.userId,
      {
        method: "PATCH",
        body: JSON.stringify({
          status: "accepted",
          approvedQuantity: 3,
          reviewerNote: "Approved from the original plan set.",
        }),
      },
    );
    assert.equal(initialReview.status, 200);
    const initialTakeoff = initialReview.body as TakeoffResponse;
    assert.equal(initialTakeoff.items[0]?.approvedQuantity, 3);
    assert.equal(initialTakeoff.reviewEvents.length, 1);

    const createdQuote = await requestJson(
      baseUrl,
      "/api/quotes",
      tenantA.userId,
      {
        method: "POST",
        body: JSON.stringify({
          customerName: `Snapshot customer ${marker}`,
          customerEmail: `snapshot-${marker}@example.com`,
          projectName: "Historical addition quote",
          module: "ADDITION",
          jobInputs,
          proposalDescription: "Original approved blueprint scope",
          takeoffId: takeoff.id,
        }),
      },
    );
    assert.equal(createdQuote.status, 201);
    const quoteId = (createdQuote.body as QuoteResponse).id;

    const beforeCorrectionResponse = await requestJson(
      baseUrl,
      `/api/quotes/${quoteId}`,
      tenantA.userId,
    );
    assert.equal(beforeCorrectionResponse.status, 200);
    const beforeCorrection = beforeCorrectionResponse.body as QuoteResponse;
    const originalSnapshot = {
      jobInputs: beforeCorrection.jobInputs,
      assembly: beforeCorrection.assembly,
      pricing: beforeCorrection.pricing,
      total: beforeCorrection.total,
      takeoffReview: beforeCorrection.takeoffReview,
    };
    assert.ok(originalSnapshot.takeoffReview);

    const correction = await requestJson(
      baseUrl,
      `/api/takeoffs/${takeoff.id}/items/${item.id}`,
      tenantA.userId,
      {
        method: "PATCH",
        body: JSON.stringify({
          status: "accepted",
          approvedQuantity: 5,
          reviewerNote: "Correction: field-verified five receptacles.",
        }),
      },
    );
    assert.equal(correction.status, 200);
    const correctedTakeoff = correction.body as TakeoffResponse;
    const correctedItem = correctedTakeoff.items.find(
      (candidate) => candidate.id === item.id,
    );
    assert.ok(correctedItem);
    assert.equal(correctedItem.approvedQuantity, 5);
    assert.equal(
      correctedItem.reviewerNote,
      "Correction: field-verified five receptacles.",
    );
    assert.equal(typeof correctedItem.reviewedAt, "string");
    assert.notEqual(
      correctedItem.reviewedAt,
      initialTakeoff.items[0]?.reviewedAt,
    );
    const correctionEvent = correctedTakeoff.reviewEvents.at(-1);
    assert.equal(correctionEvent?.action, "edited");
    assert.equal(correctionEvent?.previousQuantity, 3);
    assert.equal(correctionEvent?.nextQuantity, 5);
    assert.equal(
      correctionEvent?.note,
      "Correction: field-verified five receptacles.",
    );
    assert.equal(typeof correctionEvent?.reviewedAt, "string");

    const afterCorrectionResponse = await requestJson(
      baseUrl,
      `/api/quotes/${quoteId}`,
      tenantA.userId,
    );
    assert.equal(afterCorrectionResponse.status, 200);
    const afterCorrection = afterCorrectionResponse.body as QuoteResponse;
    assert.deepEqual(
      {
        jobInputs: afterCorrection.jobInputs,
        assembly: afterCorrection.assembly,
        pricing: afterCorrection.pricing,
        total: afterCorrection.total,
        takeoffReview: afterCorrection.takeoffReview,
      },
      originalSnapshot,
    );
    const savedItems = (
      afterCorrection.takeoffReview as JsonRecord & {
        items: JsonRecord[];
      }
    ).items;
    assert.equal(
      savedItems.find((saved) => saved.id === item.id)?.approvedQuantity,
      3,
    );
    assert.equal(
      savedItems.find((saved) => saved.id === item.id)?.reviewerNote,
      "Approved from the original plan set.",
    );

    const noOp = await requestJson(
      baseUrl,
      `/api/takeoffs/${takeoff.id}/items/${item.id}`,
      tenantA.userId,
      {
        method: "PATCH",
        body: JSON.stringify({
          status: "accepted",
          approvedQuantity: 5,
          reviewerNote: "Correction: field-verified five receptacles.",
        }),
      },
    );
    assert.equal(noOp.status, 200);
    const noOpTakeoff = noOp.body as TakeoffResponse;
    assert.equal(
      noOpTakeoff.reviewEvents.length,
      correctedTakeoff.reviewEvents.length,
    );
    assert.deepEqual(noOpTakeoff.items, correctedTakeoff.items);

    const foreignCorrection = await requestJson(
      baseUrl,
      `/api/takeoffs/${takeoff.id}/items/${item.id}`,
      tenantB.userId,
      {
        method: "PATCH",
        body: JSON.stringify({
          status: "accepted",
          approvedQuantity: 99,
          reviewerNote: "Must not cross tenant boundary.",
        }),
      },
    );
    assert.equal(foreignCorrection.status, 404);
    const foreignQuoteRead = await requestJson(
      baseUrl,
      `/api/quotes/${quoteId}`,
      tenantB.userId,
    );
    assert.equal(foreignQuoteRead.status, 404);

    const finalTakeoffResponse = await requestJson(
      baseUrl,
      `/api/takeoffs/${takeoff.id}`,
      tenantA.userId,
    );
    assert.equal(finalTakeoffResponse.status, 200);
    const finalTakeoff = finalTakeoffResponse.body as TakeoffResponse;
    const finalItem = finalTakeoff.items.find(
      (candidate) => candidate.id === item.id,
    );
    assert.equal(finalItem?.approvedQuantity, 5);
    assert.equal(
      finalTakeoff.reviewEvents.length,
      correctedTakeoff.reviewEvents.length,
    );
  } finally {
    await closeServer(server);
    await cleanupTenants([tenantA, tenantB]);
  }
});