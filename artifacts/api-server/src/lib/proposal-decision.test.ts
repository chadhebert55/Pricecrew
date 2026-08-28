import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import test from "node:test";
import { eq, inArray } from "drizzle-orm";
import {
  companiesTable,
  companyMembersTable,
  db,
  proposalDecisionsTable,
  quotesTable,
} from "@workspace/db";
import app from "../app";
import { createProposalShareToken } from "../routes/estimating";
import { ensureEstimatorSeed } from "./estimating-seed";

type DecisionJson = {
  id: number;
  decision: "accepted" | "declined";
  customerName: string | null;
  signature: string | null;
};

type ProposalJson = {
  decision: null | {
    decision: "accepted" | "declined";
    customerName: string | null;
    decidedAt: string;
    signature?: never;
  };
};

type QuoteDetailJson = {
  proposalDecision: DecisionJson;
  proposalDecisions: DecisionJson[];
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

test("proposal decisions are revision-bound, tenant-safe, immutable, and idempotent", async () => {
  await ensureEstimatorSeed();
  const marker = randomUUID();
  const [template] = await db.select().from(quotesTable).limit(1);
  assert.ok(template);
  const [companyA, companyB] = await db
    .insert(companiesTable)
    .values([
      { name: `Decision A ${marker}` },
      { name: `Decision B ${marker}` },
    ])
    .returning();
  assert.ok(companyA);
  assert.ok(companyB);
  const userA = `user_decision_a_${marker}`;
  await db.insert(companyMembersTable).values({
    userId: userA,
    companyId: companyA.id,
    role: "member",
  });

  const quoteValues = {
    customerName: template.customerName,
    customerEmail: template.customerEmail,
    projectName: template.projectName,
    module: template.module,
    jobInputs: template.jobInputs,
    assembly: template.assembly,
    pricing: template.pricing,
    proposalDescription: template.proposalDescription,
    total: template.total,
    margin: template.margin,
  };
  const [acceptedQuote, declinedQuote, draftQuote, staleQuote, foreignQuote] =
    await db
      .insert(quotesTable)
      .values([
        {
          ...quoteValues,
          companyId: companyA.id,
          quoteNumber: `DECISION-ACCEPT-${marker}`,
          status: "ready",
        },
        {
          ...quoteValues,
          companyId: companyA.id,
          quoteNumber: `DECISION-DECLINE-${marker}`,
          status: "ready",
        },
        {
          ...quoteValues,
          companyId: companyA.id,
          quoteNumber: `DECISION-DRAFT-${marker}`,
          status: "draft",
        },
        {
          ...quoteValues,
          companyId: companyA.id,
          quoteNumber: `DECISION-STALE-${marker}`,
          status: "ready",
        },
        {
          ...quoteValues,
          companyId: companyB.id,
          quoteNumber: `DECISION-FOREIGN-${marker}`,
          status: "ready",
        },
      ])
      .returning();
  assert.ok(acceptedQuote);
  assert.ok(declinedQuote);
  assert.ok(draftQuote);
  assert.ok(staleQuote);
  assert.ok(foreignQuote);

  const quoteIds = [
    acceptedQuote.id,
    declinedQuote.id,
    draftQuote.id,
    staleQuote.id,
    foreignQuote.id,
  ];
  const acceptedSnapshot = {
    jobInputs: acceptedQuote.jobInputs,
    assembly: acceptedQuote.assembly,
    pricing: acceptedQuote.pricing,
    total: acceptedQuote.total,
    margin: acceptedQuote.margin,
  };
  const server = await startServer();
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const authHeaders = {
    "x-test-clerk-user-id": userA,
    "content-type": "application/json",
  };

  try {
    const acceptedToken = createProposalShareToken(
      acceptedQuote.id,
      acceptedQuote.updatedAt,
    );
    const initialProposal = await fetch(
      `${baseUrl}/api/proposals/${acceptedToken}`,
    );
    assert.equal(initialProposal.status, 200);
    assert.equal(((await initialProposal.json()) as ProposalJson).decision, null);

    for (const incomplete of [
      { decision: "accepted", signature: "Alex Customer" },
      { decision: "accepted", customerName: "Alex Customer" },
    ]) {
      const response = await fetch(
        `${baseUrl}/api/proposals/${acceptedToken}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(incomplete),
        },
      );
      assert.equal(response.status, 422);
    }

    const acceptance = {
      decision: "accepted",
      customerName: "Alex Customer",
      signature: "Alex Customer",
      explanation: "Approved as presented.",
    };
    const firstAcceptance = await fetch(
      `${baseUrl}/api/proposals/${acceptedToken}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(acceptance),
      },
    );
    assert.equal(firstAcceptance.status, 200);
    const firstDecision = (await firstAcceptance.json()) as DecisionJson;
    assert.equal(firstDecision.decision, "accepted");
    assert.equal(firstDecision.customerName, "Alex Customer");
    assert.equal(firstDecision.signature, "Alex Customer");

    const retryAcceptance = await fetch(
      `${baseUrl}/api/proposals/${acceptedToken}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(acceptance),
      },
    );
    assert.equal(retryAcceptance.status, 200);
    assert.equal(
      ((await retryAcceptance.json()) as DecisionJson).id,
      firstDecision.id,
    );

    const changedRetry = await fetch(
      `${baseUrl}/api/proposals/${acceptedToken}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "declined" }),
      },
    );
    assert.equal(changedRetry.status, 409);

    const [decisionCount] = await db
      .select({ id: proposalDecisionsTable.id })
      .from(proposalDecisionsTable)
      .where(eq(proposalDecisionsTable.quoteId, acceptedQuote.id));
    assert.ok(decisionCount);
    const acceptedRows = await db
      .select()
      .from(proposalDecisionsTable)
      .where(eq(proposalDecisionsTable.quoteId, acceptedQuote.id));
    assert.equal(acceptedRows.length, 1);

    const decidedProposal = await fetch(
      `${baseUrl}/api/proposals/${acceptedToken}`,
    );
    const publicDecision = ((await decidedProposal.json()) as ProposalJson)
      .decision;
    assert.ok(publicDecision);
    assert.equal(publicDecision.decision, "accepted");
    assert.equal(publicDecision.signature, undefined);

    const quoteDetail = await fetch(
      `${baseUrl}/api/quotes/${acceptedQuote.id}`,
      { headers: authHeaders },
    );
    assert.equal(quoteDetail.status, 200);
    const detail = (await quoteDetail.json()) as QuoteDetailJson;
    assert.equal(detail.proposalDecision.id, firstDecision.id);
    assert.equal(detail.proposalDecision.signature, "Alex Customer");
    assert.equal(detail.proposalDecisions.length, 1);

    const editAfterDecision = await fetch(
      `${baseUrl}/api/quotes/${acceptedQuote.id}`,
      {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({
          proposalDescription: "This accepted revision must not change.",
        }),
      },
    );
    assert.equal(editAfterDecision.status, 409);

    const [acceptedAfter] = await db
      .select()
      .from(quotesTable)
      .where(eq(quotesTable.id, acceptedQuote.id));
    assert.ok(acceptedAfter);
    assert.deepEqual(
      {
        jobInputs: acceptedAfter.jobInputs,
        assembly: acceptedAfter.assembly,
        pricing: acceptedAfter.pricing,
        total: acceptedAfter.total,
        margin: acceptedAfter.margin,
      },
      acceptedSnapshot,
    );

    const declinedToken = createProposalShareToken(
      declinedQuote.id,
      declinedQuote.updatedAt,
    );
    const declineResponse = await fetch(
      `${baseUrl}/api/proposals/${declinedToken}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision: "declined",
          explanation: "Please revise the scope.",
        }),
      },
    );
    assert.equal(declineResponse.status, 200);
    const declined = (await declineResponse.json()) as DecisionJson;
    assert.equal(declined.decision, "declined");
    assert.equal(declined.customerName, null);
    assert.equal(declined.signature, null);

    const draftToken = createProposalShareToken(
      draftQuote.id,
      draftQuote.updatedAt,
    );
    assert.equal(
      (
        await fetch(`${baseUrl}/api/proposals/${draftToken}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision: "declined" }),
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await fetch(`${baseUrl}/api/quotes/${draftQuote.id}/decision`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ decision: "declined" }),
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await fetch(`${baseUrl}/api/quotes/${foreignQuote.id}/decision`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ decision: "declined" }),
        })
      ).status,
      404,
    );

    const staleToken = createProposalShareToken(
      staleQuote.id,
      staleQuote.updatedAt,
    );
    await db
      .update(quotesTable)
      .set({
        proposalDescription: `${staleQuote.proposalDescription} Updated`,
        updatedAt: new Date(staleQuote.updatedAt.getTime() + 1000),
      })
      .where(eq(quotesTable.id, staleQuote.id));
    assert.equal(
      (
        await fetch(`${baseUrl}/api/proposals/${staleToken}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision: "declined" }),
        })
      ).status,
      404,
    );

    const supersededToken = createProposalShareToken(
      foreignQuote.id,
      foreignQuote.updatedAt,
    );
    const [newerRevision] = await db
      .insert(quotesTable)
      .values({
        ...quoteValues,
        companyId: companyB.id,
        quoteNumber: `DECISION-FOREIGN-REVISION-${marker}`,
        status: "draft",
        sourceQuoteId: foreignQuote.id,
        revisionNumber: foreignQuote.revisionNumber + 1,
      })
      .returning();
    assert.ok(newerRevision);
    quoteIds.push(newerRevision.id);
    assert.equal(
      (
        await fetch(`${baseUrl}/api/proposals/${supersededToken}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision: "declined" }),
        })
      ).status,
      404,
    );

    const tamperedToken = `${acceptedToken.slice(0, -1)}${
      acceptedToken.endsWith("A") ? "B" : "A"
    }`;
    assert.equal(
      (
        await fetch(`${baseUrl}/api/proposals/${tamperedToken}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision: "declined" }),
        })
      ).status,
      404,
    );
  } finally {
    await closeServer(server);
    await db
      .delete(proposalDecisionsTable)
      .where(inArray(proposalDecisionsTable.quoteId, quoteIds));
    await db.delete(quotesTable).where(inArray(quotesTable.id, quoteIds));
    await db
      .delete(companyMembersTable)
      .where(eq(companyMembersTable.userId, userA));
    await db
      .delete(companiesTable)
      .where(inArray(companiesTable.id, [companyA.id, companyB.id]));
  }
});