import { and, asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateTakeoffBody,
  CreateTakeoffResponse,
  GetTakeoffDocumentParams,
  GetTakeoffParams,
  GetTakeoffResponse,
  RequestTakeoffUploadUrlBody,
  RequestTakeoffUploadUrlResponse,
  ReviewTakeoffItemBody,
  ReviewTakeoffItemParams,
  ReviewTakeoffItemResponse,
} from "@workspace/api-zod";
import {
  db,
  planTakeoffsTable,
  takeoffItemsTable,
  takeoffReviewEventsTable,
  type PlanTakeoff,
  type TakeoffItem,
  type TakeoffReviewEvent,
} from "@workspace/db";
import {
  downloadTakeoffObject,
  requestTakeoffUploadUrl,
} from "../lib/pdf-storage";
import {
  extractTakeoff,
  TakeoffExtractionError,
} from "../lib/takeoff-extractor";
import {
  requestCompanyId,
  requireEstimatorAuth,
} from "../middlewares/estimatorAuth";

const router: IRouter = Router();

router.use("/takeoffs", (req, res, next) => {
  void requireEstimatorAuth(req, res, next);
});

function approvedInputs(items: TakeoffItem[]) {
  return Object.fromEntries(
    items
      .filter(
        (item) =>
          item.status === "accepted" && item.approvedQuantity !== null,
      )
      .map((item) => [item.fieldKey, item.approvedQuantity as number]),
  );
}

function serializeTakeoffItem(item: TakeoffItem) {
  return {
    id: item.id,
    fieldKey: item.fieldKey,
    label: item.label,
    kind: item.kind,
    proposedQuantity: item.proposedQuantity,
    approvedQuantity: item.approvedQuantity,
    confidence: item.confidence,
    sourceContext: item.sourceContext,
    sourcePage: item.sourcePage,
    status: item.status,
    reviewerNote: item.reviewerNote,
    reviewedAt: item.reviewedAt?.toISOString() ?? null,
  };
}

function serializeReviewEvent(event: TakeoffReviewEvent) {
  return {
    id: event.id,
    itemId: event.itemId,
    action: event.action,
    previousStatus: event.previousStatus,
    nextStatus: event.nextStatus,
    previousQuantity: event.previousQuantity,
    nextQuantity: event.nextQuantity,
    note: event.note,
    reviewedAt: event.createdAt.toISOString(),
  };
}

function serializeTakeoff(
  takeoff: PlanTakeoff,
  items: TakeoffItem[],
  events: TakeoffReviewEvent[],
) {
  return {
    id: takeoff.id,
    module: takeoff.builderModule,
    fileName: takeoff.fileName,
    fileSize: takeoff.fileSize,
    contentType: takeoff.contentType,
    status: takeoff.status,
    pageCount: takeoff.pageCount,
    errorCode: takeoff.errorCode,
    errorMessage: takeoff.errorMessage,
    extractionSummary: takeoff.extractionSummary,
    items: items.map(serializeTakeoffItem),
    reviewEvents: events.map(serializeReviewEvent),
    approvedInputs: approvedInputs(items),
    createdAt: takeoff.createdAt.toISOString(),
    completedAt: takeoff.completedAt?.toISOString() ?? null,
  };
}

async function takeoffDetail(companyId: number, id: number) {
  const [takeoff] = await db
    .select()
    .from(planTakeoffsTable)
    .where(
      and(
        eq(planTakeoffsTable.id, id),
        eq(planTakeoffsTable.companyId, companyId),
      ),
    );
  if (!takeoff) return null;
  const [items, events] = await Promise.all([
    db
      .select()
      .from(takeoffItemsTable)
      .where(eq(takeoffItemsTable.takeoffId, takeoff.id))
      .orderBy(asc(takeoffItemsTable.id)),
    db
      .select()
      .from(takeoffReviewEventsTable)
      .where(eq(takeoffReviewEventsTable.takeoffId, takeoff.id))
      .orderBy(asc(takeoffReviewEventsTable.createdAt)),
  ]);
  return { takeoff, items, events };
}

router.post("/takeoffs/upload-url", async (req, res): Promise<void> => {
  const companyId = requestCompanyId(req);
  const parsed = RequestTakeoffUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error:
        "Upload a PDF no larger than 25 MB. If the plan set is larger, split it into smaller PDFs.",
    });
    return;
  }
  if (!parsed.data.fileName.toLowerCase().endsWith(".pdf")) {
    res.status(400).json({ error: "The uploaded file must use a .pdf extension." });
    return;
  }
  try {
    const result = await requestTakeoffUploadUrl(companyId);
    res.json(RequestTakeoffUploadUrlResponse.parse(result));
  } catch (error) {
    req.log.error({ err: error }, "Could not create takeoff upload URL");
    res.status(500).json({ error: "Plan storage is unavailable. Try again in a few minutes." });
  }
});

router.post("/takeoffs", async (req, res): Promise<void> => {
  const companyId = requestCompanyId(req);
  const parsed = CreateTakeoffBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!parsed.data.objectPath.startsWith(`/objects/uploads/${companyId}/`)) {
    res.status(403).json({ error: "This uploaded plan does not belong to your company." });
    return;
  }
  const [takeoff] = await db
    .insert(planTakeoffsTable)
    .values({
      companyId,
      builderModule: parsed.data.module,
      fileName: parsed.data.fileName,
      objectPath: parsed.data.objectPath,
      fileSize: parsed.data.fileSize,
      contentType: parsed.data.contentType,
      baseInputs: parsed.data.baseInputs,
      status: "processing",
    })
    .returning();
  if (!takeoff) throw new Error("Unable to create plan takeoff");

  try {
    const buffer = await downloadTakeoffObject(takeoff.objectPath);
    if (buffer.byteLength !== takeoff.fileSize) {
      throw new Error("The uploaded PDF is incomplete. Upload it again and wait for the upload to finish.");
    }
    const extraction = await extractTakeoff(buffer, takeoff.builderModule);
    const completedAt = new Date();
    const [updated] = await db.transaction(async (tx) => {
      await tx.insert(takeoffItemsTable).values(
        extraction.items.map((item) => ({
          takeoffId: takeoff.id,
          ...item,
          status: "pending" as const,
        })),
      );
      return tx
        .update(planTakeoffsTable)
        .set({
          status: "ready",
          pageCount: extraction.pageCount,
          extractionSummary: {
            pages: extraction.pageCount,
            sections: extraction.sections,
            textCharacters: extraction.textCharacters,
            ocrUsed: extraction.ocrUsed,
            ocrPages: extraction.ocrPages,
            ocrSkippedPages: extraction.ocrSkippedPages,
            ocrWarning: extraction.ocrWarning,
            ocrCharacters: extraction.ocrCharacters,
            ocrAverageConfidence: extraction.ocrAverageConfidence,
          },
          completedAt,
        })
        .where(eq(planTakeoffsTable.id, takeoff.id))
        .returning();
    });
    const detail = await takeoffDetail(companyId, updated?.id ?? takeoff.id);
    if (!detail) throw new Error("Unable to load completed plan takeoff");
    res.status(201).json(
      CreateTakeoffResponse.parse(
        serializeTakeoff(detail.takeoff, detail.items, detail.events),
      ),
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The plan PDF could not be read safely.";
    await db
      .update(planTakeoffsTable)
      .set({
        status: "failed",
        errorCode:
          error instanceof TakeoffExtractionError
            ? error.code
            : "PDF_EXTRACTION_FAILED",
        errorMessage: message,
        completedAt: new Date(),
      })
      .where(eq(planTakeoffsTable.id, takeoff.id));
    req.log.warn({ takeoffId: takeoff.id, err: error }, "Plan takeoff extraction failed");
    res.status(422).json({ error: message });
  }
});

router.get("/takeoffs/:id", async (req, res): Promise<void> => {
  const companyId = requestCompanyId(req);
  const params = GetTakeoffParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const detail = await takeoffDetail(companyId, params.data.id);
  if (!detail) {
    res.status(404).json({ error: "Takeoff not found" });
    return;
  }
  res.json(
    GetTakeoffResponse.parse(
      serializeTakeoff(detail.takeoff, detail.items, detail.events),
    ),
  );
});

router.get("/takeoffs/:id/document", async (req, res): Promise<void> => {
  const companyId = requestCompanyId(req);
  const params = GetTakeoffDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const detail = await takeoffDetail(companyId, params.data.id);
  if (!detail) {
    res.status(404).json({ error: "Takeoff not found" });
    return;
  }
  try {
    const buffer = await downloadTakeoffObject(detail.takeoff.objectPath);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${detail.takeoff.fileName.replace(/["\r\n]/g, "_")}"`,
    );
    res.end(buffer);
  } catch (error) {
    req.log.warn({ takeoffId: detail.takeoff.id, err: error }, "Takeoff PDF not found");
    res.status(404).json({ error: "Source plan PDF is unavailable" });
  }
});

router.patch("/takeoffs/:id/items/:itemId", async (req, res): Promise<void> => {
  const companyId = requestCompanyId(req);
  const params = ReviewTakeoffItemParams.safeParse(req.params);
  const parsed = ReviewTakeoffItemBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const detail = await takeoffDetail(companyId, params.data.id);
  const existing = detail?.items.find((item) => item.id === params.data.itemId);
  if (!detail || !existing) {
    res.status(404).json({ error: "Takeoff item not found" });
    return;
  }
  if (detail.takeoff.status !== "ready") {
    res.status(409).json({ error: "This takeoff is not ready for review." });
    return;
  }
  const nextQuantity =
    parsed.data.status === "accepted"
      ? parsed.data.approvedQuantity ?? existing.proposedQuantity
      : null;
  const reviewedAt = new Date();
  const action =
    parsed.data.status === existing.status &&
    nextQuantity !== existing.approvedQuantity
      ? "edited"
      : parsed.data.status === "pending"
        ? "unresolved"
        : parsed.data.status;
  await db.transaction(async (tx) => {
    await tx
      .update(takeoffItemsTable)
      .set({
        status: parsed.data.status,
        approvedQuantity: nextQuantity,
        reviewerNote: parsed.data.reviewerNote ?? null,
        reviewedBy: req.userId ?? "unknown",
        reviewedAt,
      })
      .where(eq(takeoffItemsTable.id, existing.id));
    await tx.insert(takeoffReviewEventsTable).values({
      takeoffId: detail.takeoff.id,
      itemId: existing.id,
      action,
      previousStatus: existing.status,
      nextStatus: parsed.data.status,
      previousQuantity: existing.approvedQuantity,
      nextQuantity,
      note: parsed.data.reviewerNote ?? null,
      reviewedBy: req.userId ?? "unknown",
    });
  });
  const updated = await takeoffDetail(companyId, detail.takeoff.id);
  if (!updated) throw new Error("Unable to load reviewed takeoff");
  res.json(
    ReviewTakeoffItemResponse.parse(
      serializeTakeoff(updated.takeoff, updated.items, updated.events),
    ),
  );
});

export default router;