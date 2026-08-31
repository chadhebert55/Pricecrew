import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import {
  companyMembersTable,
  companySettingsTable,
  companiesTable,
  db,
} from "@workspace/db";
import { ensureEstimatorSeed } from "../lib/estimating-seed";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      companyId?: number;
    }
  }
}

export function requestCompanyId(req: Request): number {
  if (!req.companyId) {
    throw new Error("Authenticated estimating company was not resolved");
  }
  return req.companyId;
}

export function resolveEstimatorAuthorization(
  userId: string | null | undefined,
  companyId: number | null | undefined,
) {
  if (!userId) return { allowed: false as const, status: 401 as const };
  if (!companyId) return { allowed: false as const, status: 403 as const };
  return { allowed: true as const, userId, companyId };
}

/**
 * Require Clerk authentication and resolve the app-owned company membership.
 *
 * New identities receive a separate neutral company. Existing customers,
 * quotes, and catalog rows are never copied or exposed.
 */
export async function requireEstimatorAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const auth = getAuth(req);
  const userId =
    auth.userId ??
    (process.env.NODE_ENV === "test"
      ? req.header("x-test-clerk-user-id") || null
      : null);
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  req.userId = userId;
  try {
    let [membership] = await db
      .select()
      .from(companyMembersTable)
      .where(eq(companyMembersTable.userId, userId));

    if (!membership) {
      membership = await provisionIsolatedCompany(userId);
    }

    const authorization = resolveEstimatorAuthorization(
      userId,
      membership?.companyId,
    );
    if (!authorization.allowed) {
      res.status(403).json({ error: "No estimating company is assigned" });
      return;
    }

    req.companyId = authorization.companyId;
    next();
  } catch (error) {
    next(error);
  }
}

export function isPublicProposalPath(req: Request) {
  if (req.method !== "GET" && req.method !== "POST") return false;

  const requestPath =
    req.originalUrl?.split("?", 1)[0] ??
    req.path;
  const routerRelativePath = requestPath.replace(/^\/api(?=\/|$)/, "");

  return /^\/proposals\/[^/]+$/.test(routerRelativePath);
}

class MembershipCreatedConcurrently extends Error {}

async function provisionIsolatedCompany(userId: string) {
  await ensureEstimatorSeed();

  try {
    return await db.transaction(async (tx) => {
      const [company] = await tx
        .insert(companiesTable)
        .values({ name: "My Company", trade: "Other", onboardingCompleted: false })
        .returning();
      if (!company) throw new Error("Unable to provision estimating company");

      const [membership] = await tx
        .insert(companyMembersTable)
        .values({ userId, companyId: company.id, role: "owner" })
        .onConflictDoNothing({ target: companyMembersTable.userId })
        .returning();
      if (!membership) throw new MembershipCreatedConcurrently();

      // A new company is intentionally neutral: no catalog, customers, or
      // quotes are copied from the legacy electrical starter tenant.
      await tx.insert(companySettingsTable).values({
        companyId: company.id,
        laborRate: 0,
        residentialLaborSellRate: 0,
        commercialLaborSellRate: 0,
        loadedLaborCost: 0,
        materialMarkup: 0,
        targetMargin: 0,
        defaultTaxRate: 0,
        serviceUpgradeCrewSize: 1,
        serviceUpgradeHoursPerPerson: 0,
        panelReplacementCrewSize: 1,
        panelReplacementHoursPerPerson: 0,
        serviceCallCrewSize: 1,
        serviceCallHoursPerVisit: 0,
        timeMaterialsCrewSize: 1,
        timeMaterialsHours: 0,
        timeMaterialsLaborSellRate: 0,
        timeMaterialsLoadedLaborCost: 0,
        timeMaterialsMaterialMarkup: 0,
        timeMaterialsTargetMargin: 0,
        customLaborHours: 0,
        customLaborSellRate: 0,
        customLoadedLaborCost: 0,
        customMaterialMarkup: 0,
        customTargetMargin: 0,
        newHouseCrewSize: 1,
        newHouseHoursPerPerson: 0,
      });

      return membership;
    });
  } catch (error) {
    if (!(error instanceof MembershipCreatedConcurrently)) throw error;
    const [membership] = await db
      .select()
      .from(companyMembersTable)
      .where(eq(companyMembersTable.userId, userId));
    return membership;
  }
}