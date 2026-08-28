import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import {
  companyMembersTable,
  companySettingsTable,
  companiesTable,
  db,
  priceBookItemsTable,
} from "@workspace/db";
import { DEFAULT_COMPANY_ID, ensureEstimatorSeed } from "../lib/estimating-seed";

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
 * New identities receive a separate company initialized from catalog/settings
 * defaults. Existing customers and quotes are never copied or exposed.
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
  if (!req.path.startsWith("/proposals/")) return false;
  return (
    req.method === "GET" ||
    (req.method === "POST" && /^\/proposals\/[^/]+$/.test(req.path))
  );
}

class MembershipCreatedConcurrently extends Error {}

async function provisionIsolatedCompany(userId: string) {
  await ensureEstimatorSeed();

  try {
    return await db.transaction(async (tx) => {
      const [company] = await tx
        .insert(companiesTable)
        .values({ name: "My Electrical Company" })
        .returning();
      if (!company) throw new Error("Unable to provision estimating company");

      const [membership] = await tx
        .insert(companyMembersTable)
        .values({ userId, companyId: company.id, role: "owner" })
        .onConflictDoNothing({ target: companyMembersTable.userId })
        .returning();
      if (!membership) throw new MembershipCreatedConcurrently();

      const [starterSettings, starterPriceBook] = await Promise.all([
        tx
          .select()
          .from(companySettingsTable)
          .where(eq(companySettingsTable.companyId, DEFAULT_COMPANY_ID))
          .then(([settings]) => settings),
        tx
          .select()
          .from(priceBookItemsTable)
          .where(eq(priceBookItemsTable.companyId, DEFAULT_COMPANY_ID)),
      ]);
      if (!starterSettings) {
        throw new Error("Starter estimating settings were not initialized");
      }

      const {
        id: _settingsId,
        companyId: _settingsCompanyId,
        updatedAt: _settingsUpdatedAt,
        ...settingsDefaults
      } = starterSettings;
      await tx.insert(companySettingsTable).values({
        ...settingsDefaults,
        companyId: company.id,
      });

      if (starterPriceBook.length > 0) {
        await tx.insert(priceBookItemsTable).values(
          starterPriceBook.map((item) => {
            const {
              id: _itemId,
              companyId: _itemCompanyId,
              updatedAt: _itemUpdatedAt,
              ...catalogDefaults
            } = item;
            return { ...catalogDefaults, companyId: company.id };
          }),
        );
      }

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