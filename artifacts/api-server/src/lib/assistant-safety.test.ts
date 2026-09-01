import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import test from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import {
  assistantConversationsTable,
  assistantImportReviewsTable,
  assistantMessagesTable,
  assistantPendingActionsTable,
  companiesTable,
  companyMembersTable,
  companySettingsTable,
  customersTable,
  db,
  priceBookItemsTable,
  quotesTable,
} from "@workspace/db";
import app from "../app";
import { assertNoAssistantCostOverrides } from "../routes/assistant";
import {
  ensureEstimatorSeed,
  initializeElectricalStarterData,
} from "./estimating-seed";

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

test("assistant quote grounding rejects specialized builder cost overrides recursively", () => {
  for (const override of [
    "exhaustFanMaterialCostOverride",
    "fanLightMaterialCostOverride",
    "fanLightHeatMaterialCostOverride",
    "newCircuitMaterialsUnitCostOverride",
    "ceilingFanMaterialCostOverride",
    "fanMaterialUnitCostOverride",
  ]) {
    assert.throws(
      () =>
        assertNoAssistantCostOverrides({
          nested: { [override]: 12.34 },
        }),
      new RegExp(override),
    );
  }
  assert.doesNotThrow(() =>
    assertNoAssistantCostOverrides({
      fanMaterialUnitCostOverride: null,
      materials: [{ unitCost: 12.34 }],
    }),
  );
});

test("assistant conversations and pending writes are tenant/user scoped, confirmation-gated, and idempotent", async () => {
  await ensureEstimatorSeed();
  const marker = randomUUID();
  const [companyA, companyB] = await db
    .insert(companiesTable)
    .values([
      {
        name: `Assistant A ${marker}`,
        trade: "Electrical",
        onboardingCompleted: true,
      },
      {
        name: `Assistant B ${marker}`,
        trade: "Other",
        onboardingCompleted: true,
      },
    ])
    .returning();
  assert.ok(companyA);
  assert.ok(companyB);
  await initializeElectricalStarterData(companyA.id, db, {
    applyStarterSettings: true,
  });
  const userA = `assistant_a_${marker}`;
  const userB = `assistant_b_${marker}`;
  await db.insert(companyMembersTable).values([
    { userId: userA, companyId: companyA.id, role: "member" },
    { userId: userB, companyId: companyB.id, role: "member" },
  ]);

  const server = await startServer();
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const headersA = {
    "content-type": "application/json",
    "x-test-clerk-user-id": userA,
  };
  const headersB = {
    "content-type": "application/json",
    "x-test-clerk-user-id": userB,
  };

  try {
    const unauthenticated = await fetch(
      `${baseUrl}/api/assistant/conversations`,
    );
    assert.equal(unauthenticated.status, 401);

    const createConversation = await fetch(
      `${baseUrl}/api/assistant/conversations`,
      {
        method: "POST",
        headers: headersA,
        body: JSON.stringify({ title: "Safety check" }),
      },
    );
    assert.equal(createConversation.status, 201);
    const conversation = (await createConversation.json()) as { id: number };

    const foreignRead = await fetch(
      `${baseUrl}/api/assistant/conversations/${conversation.id}/messages`,
      { headers: headersB },
    );
    assert.equal(foreignRead.status, 404);

    const quotePayload = {
      customerName: "Assistant Test Customer",
      customerEmail: null,
      projectName: "Confirmation safety",
      module: "CUSTOM",
      proposalDescription: "Confirmed custom work",
      jobInputs: {
        laborHours: 2,
        laborRateType: "residential",
        laborSellRate: 100,
        loadedLaborCost: 50,
        materialMarkup: 20,
        targetMargin: 40,
        materials: [],
        miscellaneousMaterials: [],
        notes: "",
      },
    };
    const [action] = await db
      .insert(assistantPendingActionsTable)
      .values({
        conversationId: conversation.id,
        companyId: companyA.id,
        userId: userA,
        kind: "quote_create",
        payload: quotePayload,
        summary: { total: 0 },
        idempotencyKey: `test-${marker}`,
        expiresAt: new Date(Date.now() + 60_000),
      })
      .returning();
    assert.ok(action);

    const quotesBefore = await db
      .select()
      .from(quotesTable)
      .where(eq(quotesTable.companyId, companyA.id));
    assert.equal(quotesBefore.length, 0);

    const foreignConfirm = await fetch(
      `${baseUrl}/api/assistant/actions/${action.id}/confirm`,
      {
        method: "POST",
        headers: headersB,
        body: "{}",
      },
    );
    assert.equal(foreignConfirm.status, 404);

    const confirm = await fetch(
      `${baseUrl}/api/assistant/actions/${action.id}/confirm`,
      {
        method: "POST",
        headers: headersA,
        body: "{}",
      },
    );
    assert.equal(confirm.status, 200);
    const confirmed = (await confirm.json()) as {
      status: string;
      result: { quoteId: number };
    };
    assert.equal(confirmed.status, "confirmed");
    assert.ok(confirmed.result.quoteId > 0);

    const repeat = await fetch(
      `${baseUrl}/api/assistant/actions/${action.id}/confirm`,
      {
        method: "POST",
        headers: headersA,
        body: "{}",
      },
    );
    assert.equal(repeat.status, 200);
    const repeated = (await repeat.json()) as {
      result: { alreadyConfirmed: boolean };
    };
    assert.equal(repeated.result.alreadyConfirmed, true);

    const quotesAfter = await db
      .select()
      .from(quotesTable)
      .where(eq(quotesTable.companyId, companyA.id));
    assert.equal(quotesAfter.length, 1);
  } finally {
    await closeServer(server);
    const companyIds = [companyA.id, companyB.id];
    await db
      .delete(assistantPendingActionsTable)
      .where(inArray(assistantPendingActionsTable.companyId, companyIds));
    await db
      .delete(assistantMessagesTable)
      .where(inArray(assistantMessagesTable.companyId, companyIds));
    await db
      .delete(assistantImportReviewsTable)
      .where(inArray(assistantImportReviewsTable.companyId, companyIds));
    await db
      .delete(assistantConversationsTable)
      .where(inArray(assistantConversationsTable.companyId, companyIds));
    await db
      .delete(quotesTable)
      .where(inArray(quotesTable.companyId, companyIds));
    await db
      .delete(customersTable)
      .where(inArray(customersTable.companyId, companyIds));
    await db
      .delete(priceBookItemsTable)
      .where(inArray(priceBookItemsTable.companyId, companyIds));
    await db
      .delete(companySettingsTable)
      .where(inArray(companySettingsTable.companyId, companyIds));
    await db
      .delete(companyMembersTable)
      .where(inArray(companyMembersTable.companyId, companyIds));
    await db
      .delete(companiesTable)
      .where(
        and(
          inArray(companiesTable.id, companyIds),
          inArray(companiesTable.name, [
            `Assistant A ${marker}`,
            `Assistant B ${marker}`,
          ]),
        ),
      );
  }
});