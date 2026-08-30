import assert from "node:assert/strict";
import { basename } from "node:path";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";
import {
  companiesTable,
  db,
  planTakeoffsTable,
  takeoffItemsTable,
} from "@workspace/db";
import { pendingTakeoffItems } from "../routes/takeoffs";
import {
  extractTakeoff,
  TakeoffExtractionError,
  type ExtractedTakeoffItem,
} from "./takeoff-extractor";

type PdfPage = {
  text?: string;
  width?: number;
  height?: number;
};

function escapePdfText(text: string) {
  return text.replace(/([\\()])/g, "\\$1");
}

/**
 * Build only the PDF structures the production parser needs. Keeping these
 * fixtures local makes OCR tests deterministic and avoids checking model
 * binaries or generated PDFs into the repository.
 */
function createPdf(pages: PdfPage[]) {
  const pageObjectIds = pages.map((_, index) => 3 + index * 2);
  const objects = new Map<number, string>();
  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects.set(
    2,
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  );

  pages.forEach((page, index) => {
    const pageId = pageObjectIds[index]!;
    const contentId = pageId + 1;
    const width = page.width ?? 612;
    const height = page.height ?? 792;
    const content = page.text
      ? `BT /F1 12 Tf 72 ${height - 72} Td (${escapePdfText(page.text)}) Tj ET`
      : "";
    objects.set(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 ${3 + pages.length * 2} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    objects.set(
      contentId,
      `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    );
  });
  const fontId = 3 + pages.length * 2;
  objects.set(fontId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let pdf = "%PDF-1.4\n";
  const offsets = new Map<number, number>();
  for (let id = 1; id <= fontId; id += 1) {
    offsets.set(id, Buffer.byteLength(pdf));
    pdf += `${id} 0 obj\n${objects.get(id)}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${fontId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= fontId; id += 1) {
    pdf += `${String(offsets.get(id)).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${fontId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf);
}

function mockOcr(
  linesByPage: Record<number, Array<{ text: string; mean: number }>>,
) {
  return {
    async detect(imagePath: string) {
      const match = basename(imagePath).match(/page-(\d+)\.png$/);
      const pageNumber = Number(match?.[1]);
      return (linesByPage[pageNumber] ?? []).map((line, index) => ({
        ...line,
        box: [[0, index * 20]],
      }));
    },
  };
}

function highConfidenceScheduleLines() {
  return [
    { text: "ELECTRICAL SCHEDULE", mean: 0.96 },
    { text: "8 receptacles", mean: 0.96 },
    { text: "3 switches", mean: 0.96 },
    { text: "2 branch circuits", mean: 0.96 },
  ];
}

async function assertExtractionCode(
  promise: Promise<unknown>,
  code: TakeoffExtractionError["code"],
) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof TakeoffExtractionError);
    assert.equal(error.code, code);
    return true;
  });
}

test("image-only scans produce page-attributed OCR suggestions", async () => {
  const pdf = createPdf([{}, {}]);
  const extraction = await extractTakeoff(pdf, "ADDITION", {
    renderPage: async () => Buffer.from("rendered page"),
    ocr: mockOcr({
      1: [],
      2: highConfidenceScheduleLines(),
    }),
  });

  assert.equal(extraction.ocrUsed, true);
  assert.deepEqual(extraction.ocrPages, [1, 2]);
  assert.equal(extraction.ocrSkippedPages.length, 0);
  assert.deepEqual(
    extraction.items.map(
      ({ fieldKey, proposedQuantity, sourcePage, confidence }) => ({
        fieldKey,
        proposedQuantity,
        sourcePage,
        confidence,
      }),
    ),
    [
      {
        fieldKey: "receptacles",
        proposedQuantity: 8,
        sourcePage: 2,
        confidence: "medium",
      },
      {
        fieldKey: "switches",
        proposedQuantity: 3,
        sourcePage: 2,
        confidence: "medium",
      },
      {
        fieldKey: "circuitCount",
        proposedQuantity: 2,
        sourcePage: 2,
        confidence: "medium",
      },
    ],
  );
  assert.match(extraction.items[0]?.sourceContext ?? "", /^\[OCR\]/);
});

test("a blank scanned cover does not hide a selectable-text schedule", async () => {
  const pdf = createPdf([
    {},
    {
      text: "ELECTRICAL SCHEDULE: 8 receptacles, 3 switches, 2 branch circuits, 1 lighting panel",
    },
  ]);
  const extraction = await extractTakeoff(pdf, "ADDITION", {
    renderPage: async () => Buffer.from("blank cover"),
    ocr: mockOcr({ 1: [] }),
  });

  assert.equal(extraction.ocrUsed, false);
  assert.deepEqual(extraction.ocrPages, []);
  assert.deepEqual(extraction.ocrSkippedPages, [1]);
  assert.match(extraction.ocrWarning ?? "", /confidence/i);
  assert.deepEqual(
    extraction.items.map(
      ({ fieldKey, proposedQuantity, sourcePage, confidence }) => ({
        fieldKey,
        proposedQuantity,
        sourcePage,
        confidence,
      }),
    ),
    [
      {
        fieldKey: "receptacles",
        proposedQuantity: 8,
        sourcePage: 2,
        confidence: "high",
      },
      {
        fieldKey: "switches",
        proposedQuantity: 3,
        sourcePage: 2,
        confidence: "high",
      },
      {
        fieldKey: "circuitCount",
        proposedQuantity: 2,
        sourcePage: 2,
        confidence: "high",
      },
    ],
  );
});

test("low-confidence OCR fails closed with its specific error code", async () => {
  const lowConfidenceLines = highConfidenceScheduleLines().map((line) => ({
    ...line,
    mean: 0.42,
  }));
  await assertExtractionCode(
    extractTakeoff(createPdf([{}]), "ADDITION", {
      renderPage: async () => Buffer.from("rendered page"),
      ocr: mockOcr({ 1: lowConfidenceLines }),
    }),
    "OCR_LOW_CONFIDENCE",
  );
});

test("OCR page limits fail before rendering or recognition", async () => {
  let rendered = 0;
  let recognized = 0;
  await assertExtractionCode(
    extractTakeoff(
      createPdf(Array.from({ length: 13 }, () => ({}))),
      "ADDITION",
      {
        renderPage: async () => {
          rendered += 1;
          return Buffer.from("rendered page");
        },
        ocr: {
          async detect() {
            recognized += 1;
            return highConfidenceScheduleLines();
          },
        },
      },
    ),
    "OCR_PAGE_LIMIT_EXCEEDED",
  );
  assert.equal(rendered, 0);
  assert.equal(recognized, 0);
});

test("rendered-byte overflow fails with its specific error code", async () => {
  let rendered = 0;
  await assertExtractionCode(
    extractTakeoff(
      createPdf(Array.from({ length: 9 }, () => ({}))),
      "ADDITION",
      {
        renderPage: async () => {
          rendered += 1;
          return Buffer.alloc(1024 * 1024);
        },
        ocr: mockOcr({}),
      },
    ),
    "OCR_SIZE_LIMIT_EXCEEDED",
  );
  assert.equal(rendered, 9);
});

test("extreme page geometry fails before unsafe rasterization", async () => {
  await assertExtractionCode(
    extractTakeoff(createPdf([{ width: 100, height: 100_000 }]), "ADDITION", {
      ocr: mockOcr({}),
    }),
    "OCR_SIZE_LIMIT_EXCEEDED",
  );
});

test("OCR-derived suggestions persist as pending until review", async () => {
  const extraction = await extractTakeoff(createPdf([{}]), "ADDITION", {
    renderPage: async () => Buffer.from("rendered page"),
    ocr: mockOcr({ 1: highConfidenceScheduleLines() }),
  });
  const marker = randomUUID();
  const [company] = await db
    .insert(companiesTable)
    .values({ name: `OCR regression ${marker}` })
    .returning();
  assert.ok(company);
  const [takeoff] = await db
    .insert(planTakeoffsTable)
    .values({
      companyId: company.id,
      builderModule: "ADDITION",
      fileName: "scan.pdf",
      objectPath: `/objects/uploads/${company.id}/${marker}`,
      fileSize: 1,
      contentType: "application/pdf",
      baseInputs: {},
      status: "ready",
      pageCount: extraction.pageCount,
    })
    .returning();
  assert.ok(takeoff);

  try {
    const pendingItems = pendingTakeoffItems(takeoff.id, extraction.items);
    await db.insert(takeoffItemsTable).values(pendingItems);
    const persisted = await db
      .select()
      .from(takeoffItemsTable)
      .where(eq(takeoffItemsTable.takeoffId, takeoff.id));

    assert.ok(persisted.length > 0);
    assert.ok(persisted.every((item) => item.status === "pending"));
    assert.ok(persisted.every((item) => item.approvedQuantity === null));
    assert.ok(persisted.every((item) => item.reviewedAt === null));
    assert.ok(persisted.every((item) => item.sourcePage === 1));
    assert.ok(persisted.every((item) => item.confidence === "medium"));
  } finally {
    await db
      .delete(planTakeoffsTable)
      .where(eq(planTakeoffsTable.id, takeoff.id));
    await db.delete(companiesTable).where(eq(companiesTable.id, company.id));
  }
});