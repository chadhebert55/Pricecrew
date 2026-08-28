import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { planTakeoffsTable } from "./estimating";

export type TakeoffItemStatus = "pending" | "accepted" | "rejected" | "unresolved";
export type TakeoffConfidence = "high" | "medium" | "low";

export type TakeoffItemRecord = {
  id: number;
  fieldKey: string;
  label: string;
  kind: "quantity" | "circuit" | "dimension";
  proposedQuantity: number;
  approvedQuantity: number | null;
  confidence: TakeoffConfidence;
  sourceContext: string;
  sourcePage: number | null;
  status: TakeoffItemStatus;
  reviewerNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
};

export type TakeoffReviewEventRecord = {
  id: number;
  itemId: number;
  action: "accepted" | "rejected" | "unresolved" | "edited";
  previousStatus: TakeoffItemStatus;
  nextStatus: TakeoffItemStatus;
  previousQuantity: number | null;
  nextQuantity: number | null;
  note: string | null;
  reviewedBy: string;
  createdAt: string;
};

export const takeoffItemsTable = pgTable("takeoff_items", {
  id: serial("id").primaryKey(),
  takeoffId: integer("takeoff_id")
    .notNull()
    .references(() => planTakeoffsTable.id, { onDelete: "cascade" }),
  fieldKey: text("field_key").notNull(),
  label: text("label").notNull(),
  kind: text("kind").$type<"quantity" | "circuit" | "dimension">().notNull(),
  proposedQuantity: integer("proposed_quantity").notNull(),
  approvedQuantity: integer("approved_quantity"),
  confidence: text("confidence").$type<TakeoffConfidence>().notNull(),
  sourceContext: text("source_context").notNull(),
  sourcePage: integer("source_page"),
  status: text("status").$type<TakeoffItemStatus>().notNull().default("pending"),
  reviewerNote: text("reviewer_note"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const takeoffReviewEventsTable = pgTable("takeoff_review_events", {
  id: serial("id").primaryKey(),
  takeoffId: integer("takeoff_id")
    .notNull()
    .references(() => planTakeoffsTable.id, { onDelete: "cascade" }),
  itemId: integer("item_id")
    .notNull()
    .references(() => takeoffItemsTable.id, { onDelete: "cascade" }),
  action: text("action")
    .$type<"accepted" | "rejected" | "unresolved" | "edited">()
    .notNull(),
  previousStatus: text("previous_status").$type<TakeoffItemStatus>().notNull(),
  nextStatus: text("next_status").$type<TakeoffItemStatus>().notNull(),
  previousQuantity: integer("previous_quantity"),
  nextQuantity: integer("next_quantity"),
  note: text("note"),
  reviewedBy: text("reviewed_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PlanTakeoff = typeof planTakeoffsTable.$inferSelect;
export type TakeoffItem = typeof takeoffItemsTable.$inferSelect;
export type TakeoffReviewEvent = typeof takeoffReviewEventsTable.$inferSelect;