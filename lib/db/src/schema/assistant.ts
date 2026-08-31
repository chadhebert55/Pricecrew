import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./estimating";

export type AssistantMessageRole = "user" | "assistant" | "tool";
export type AssistantPendingActionKind =
  | "quote_create"
  | "price_book_import";
export type AssistantPendingActionStatus =
  | "pending"
  | "confirmed"
  | "rejected"
  | "expired"
  | "failed";
export type AssistantImportConfidence =
  | "EXACT"
  | "LIKELY"
  | "AMBIGUOUS"
  | "NO_MATCH";

export const assistantConversationsTable = pgTable("assistant_conversations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  title: text("title").notNull().default("New conversation"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const assistantMessagesTable = pgTable("assistant_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => assistantConversationsTable.id, { onDelete: "cascade" }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  role: text("role").$type<AssistantMessageRole>().notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assistantPendingActionsTable = pgTable(
  "assistant_pending_actions",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => assistantConversationsTable.id, { onDelete: "cascade" }),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    kind: text("kind").$type<AssistantPendingActionKind>().notNull(),
    status: text("status")
      .$type<AssistantPendingActionStatus>()
      .notNull()
      .default("pending"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    summary: jsonb("summary").$type<Record<string, unknown>>().notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    errorMessage: text("error_message"),
  },
  (table) => [
    uniqueIndex("assistant_pending_actions_idempotency_unique").on(
      table.companyId,
      table.idempotencyKey,
    ),
  ],
);

export const assistantImportReviewsTable = pgTable("assistant_import_reviews", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => assistantConversationsTable.id, { onDelete: "cascade" }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  sourceFileName: text("source_file_name").notNull(),
  objectPath: text("object_path").notNull(),
  sourceDate: text("source_date"),
  status: text("status").$type<"review" | "applied" | "expired">().notNull().default("review"),
  rows: jsonb("rows").$type<Array<Record<string, unknown>>>().notNull(),
  report: jsonb("report").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
});

export const insertAssistantConversationSchema = createInsertSchema(
  assistantConversationsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAssistantMessageSchema = createInsertSchema(
  assistantMessagesTable,
).omit({ id: true, createdAt: true });
export const insertAssistantPendingActionSchema = createInsertSchema(
  assistantPendingActionsTable,
).omit({ id: true, createdAt: true, resolvedAt: true });
export const insertAssistantImportReviewSchema = createInsertSchema(
  assistantImportReviewsTable,
).omit({ id: true, createdAt: true, appliedAt: true });

export type AssistantConversation = typeof assistantConversationsTable.$inferSelect;
export type AssistantMessage = typeof assistantMessagesTable.$inferSelect;
export type AssistantPendingAction = typeof assistantPendingActionsTable.$inferSelect;
export type AssistantImportReview = typeof assistantImportReviewsTable.$inferSelect;
export type InsertAssistantConversation = z.infer<
  typeof insertAssistantConversationSchema
>;
export type InsertAssistantMessage = z.infer<typeof insertAssistantMessageSchema>;
export type InsertAssistantPendingAction = z.infer<
  typeof insertAssistantPendingActionSchema
>;
export type InsertAssistantImportReview = z.infer<
  typeof insertAssistantImportReviewSchema
>;