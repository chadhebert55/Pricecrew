import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import test from "node:test";
import { eq, inArray } from "drizzle-orm";
import {
  companiesTable,
  companyMembersTable,
  companySettingsTable,
  db,
  priceBookItemsTable,
  quotesTable,
} from "@workspace/db";
import app from "../app";
import {
  createProposalShareToken,
} from "../routes/estimating";
import { ensureEstimatorSeed } from "./estimating-seed";
import {
  isPublicProposalPath,
  resolveEstimatorAuthorization,
} from "../middlewares/estimatorAuth";

test("unauthenticated estimator requests are denied", () => {
  assert.deepEqual(resolveEstimatorAuthorization(undefined, undefined), {
    allowed: false,
    status: 401,
  });
});

test("authenticated users without a company membership are denied", () => {
  assert.deepEqual(resolveEstimatorAuthorization("user_unassigned", undefined), {
    allowed: false,
    status: 403,
  });
});

test("company authorization exposes only the assigned company id", () => {
  const authorization = resolveEstimatorAuthorization("user_alpha", 17);
  assert.deepEqual(authorization, {
    allowed: true,
    userId: "user_alpha",
    companyId: 17,
  });
  assert.equal(authorization.allowed && authorization.companyId === 29, false);
});

test("only customer proposal reads and signed decision submissions bypass estimator authentication", () => {
  assert.equal(
    isPublicProposalPath({
      method: "GET",
      path: "/proposals/high-entropy-token",
    } as never),
    true,
  );
  assert.equal(
    isPublicProposalPath({
      method: "POST",
      path: "/proposals/high-entropy-token",
    } as never),
    true,
  );
  assert.equal(
    isPublicProposalPath({
      method: "PATCH",
      path: "/proposals/high-entropy-token",
    } as never),
    false,
  );
  assert.equal(
    isPublicProposalPath({ method: "GET", path: "/quotes/12" } as never),
    false,
  );
});

test("API authorization hides cross-company quotes and rejects invalid or draft proposal tokens", async () => {
  await ensureEstimatorSeed();
  const marker = randomUUID();
  const [template] = await db.select().from(quotesTable).limit(1);
  assert.ok(template);

  const [companyA, companyB] = await db
    .insert(companiesTable)
    .values([
      { name: `Authorization A ${marker}` },
      { name: `Authorization B ${marker}` },
    ])
    .returning();
  assert.ok(companyA);
  assert.ok(companyB);

  const userA = `user_auth_a_${marker}`;
  await db.insert(companyMembersTable).values({
    userId: userA,
    companyId: companyA.id,
    role: "member",
  });

  const [quoteA, readyQuoteB, draftQuoteB] = await db
    .insert(quotesTable)
    .values([
      {
        companyId: companyA.id,
        quoteNumber: `AUTH-A-${marker}`,
        customerName: template.customerName,
        customerEmail: template.customerEmail,
        projectName: template.projectName,
        module: template.module,
        status: "ready",
        jobInputs: template.jobInputs,
        assembly: template.assembly,
        pricing: template.pricing,
        proposalDescription: template.proposalDescription,
        total: template.total,
        margin: template.margin,
      },
      {
        companyId: companyB.id,
        quoteNumber: `AUTH-B-READY-${marker}`,
        customerName: template.customerName,
        customerEmail: template.customerEmail,
        projectName: template.projectName,
        module: template.module,
        status: "ready",
        jobInputs: template.jobInputs,
        assembly: template.assembly,
        pricing: template.pricing,
        proposalDescription: template.proposalDescription,
        total: template.total,
        margin: template.margin,
      },
      {
        companyId: companyB.id,
        quoteNumber: `AUTH-B-DRAFT-${marker}`,
        customerName: template.customerName,
        customerEmail: template.customerEmail,
        projectName: template.projectName,
        module: template.module,
        status: "draft",
        jobInputs: template.jobInputs,
        assembly: template.assembly,
        pricing: template.pricing,
        proposalDescription: template.proposalDescription,
        total: template.total,
        margin: template.margin,
      },
    ])
    .returning();
  assert.ok(quoteA);
  assert.ok(readyQuoteB);
  assert.ok(draftQuoteB);

  const server = await new Promise<Server>((resolve, reject) => {
    const candidate = app.listen(0, () => resolve(candidate));
    candidate.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const authHeaders = { "x-test-clerk-user-id": userA };
  const isolatedUser = `user_isolated_${marker}`;
  let isolatedCompanyId: number | undefined;

  try {
    assert.equal((await fetch(`${baseUrl}/api/quotes`)).status, 401);
    const isolatedResponse = await fetch(`${baseUrl}/api/quotes`, {
      headers: { "x-test-clerk-user-id": isolatedUser },
    });
    assert.equal(isolatedResponse.status, 200);
    assert.deepEqual(await isolatedResponse.json(), []);
    const [isolatedMembership] = await db
      .select()
      .from(companyMembersTable)
      .where(eq(companyMembersTable.userId, isolatedUser));
    assert.ok(isolatedMembership);
    assert.notEqual(isolatedMembership.companyId, 1);
    isolatedCompanyId = isolatedMembership.companyId;

    assert.equal(
      (
        await fetch(`${baseUrl}/api/quotes/${quoteA.id}`, {
          headers: authHeaders,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await fetch(`${baseUrl}/api/quotes/${readyQuoteB.id}`, {
          headers: authHeaders,
        })
      ).status,
      404,
    );
    const exportRequest = {
      destination: "jobber",
      format: "csv",
      mapping: { propertyStreet1: "123 Company A St" },
    };
    assert.equal(
      (
        await fetch(`${baseUrl}/api/quotes/${quoteA.id}/exports/preflight`, {
          method: "POST",
          headers: { ...authHeaders, "content-type": "application/json" },
          body: JSON.stringify(exportRequest),
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await fetch(
          `${baseUrl}/api/quotes/${readyQuoteB.id}/exports/preflight`,
          {
            method: "POST",
            headers: { ...authHeaders, "content-type": "application/json" },
            body: JSON.stringify(exportRequest),
          },
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await fetch(
          `${baseUrl}/api/quotes/${readyQuoteB.id}/exports/jobber.csv`,
          {
            method: "POST",
            headers: { ...authHeaders, "content-type": "application/json" },
            body: JSON.stringify(exportRequest),
          },
        )
      ).status,
      404,
    );

    const readyToken = createProposalShareToken(
      readyQuoteB.id,
      readyQuoteB.updatedAt,
    );
    assert.equal(
      (await fetch(`${baseUrl}/api/proposals/${readyToken}`)).status,
      200,
    );
    const invalidToken = `${readyToken.slice(0, -1)}${
      readyToken.endsWith("A") ? "B" : "A"
    }`;
    assert.equal(
      (await fetch(`${baseUrl}/api/proposals/${invalidToken}`)).status,
      404,
    );

    const draftToken = createProposalShareToken(
      draftQuoteB.id,
      draftQuoteB.updatedAt,
    );
    assert.equal(
      (await fetch(`${baseUrl}/api/proposals/${draftToken}`)).status,
      404,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await db
      .delete(quotesTable)
      .where(inArray(quotesTable.id, [quoteA.id, readyQuoteB.id, draftQuoteB.id]));
    await db
      .delete(companyMembersTable)
      .where(eq(companyMembersTable.userId, userA));
    if (isolatedCompanyId) {
      await db
        .delete(priceBookItemsTable)
        .where(eq(priceBookItemsTable.companyId, isolatedCompanyId));
      await db
        .delete(companySettingsTable)
        .where(eq(companySettingsTable.companyId, isolatedCompanyId));
      await db
        .delete(companiesTable)
        .where(eq(companiesTable.id, isolatedCompanyId));
    }
    await db
      .delete(companiesTable)
      .where(inArray(companiesTable.id, [companyA.id, companyB.id]));
  }
});