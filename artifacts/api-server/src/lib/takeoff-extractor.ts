import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Ocr from "@gutenye/ocr-node";
import { PDFParse } from "pdf-parse";
import type { TakeoffBuilderModule, TakeoffConfidence } from "@workspace/db";

const MAX_TEXT = 1_000_000;
const MAX_OCR_PAGES = 12;
const MAX_OCR_RENDERED_BYTES = 8 * 1024 * 1024;
const MAX_OCR_PAGE_BYTES = 2 * 1024 * 1024;
const OCR_RENDER_WIDTH = 1800;
const MAX_OCR_RENDER_HEIGHT = 6000;
const MAX_OCR_RENDER_PIXELS = 10_800_000;
const MIN_OCR_LINE_SCORE = 0.6;
const MIN_OCR_CHARACTERS = 30;

export type ExtractedTakeoffItem = {
  fieldKey: string;
  label: string;
  kind: "quantity" | "circuit" | "dimension";
  proposedQuantity: number;
  confidence: TakeoffConfidence;
  sourceContext: string;
  sourcePage: number | null;
};

type OcrLine = {
  text: string;
  mean: number;
  box?: number[][];
};

type OcrEngine = {
  detect(imagePath: string): Promise<OcrLine[]>;
};

type TakeoffPage = {
  pageNumber: number;
  text: string;
  ocr: boolean;
};

type TakeoffExtractionOptions = {
  ocr?: OcrEngine;
  renderPage?: (pageNumber: number) => Promise<Uint8Array>;
};

export class TakeoffExtractionError extends Error {
  constructor(
    message: string,
    readonly code:
      | "OCR_PAGE_LIMIT_EXCEEDED"
      | "OCR_SIZE_LIMIT_EXCEEDED"
      | "OCR_LOW_CONFIDENCE",
  ) {
    super(message);
    this.name = "TakeoffExtractionError";
  }
}

const ADDITION_RULES = [
  ["receptacles", "Standard receptacles", "receptacles?|outlets?"],
  ["switches", "Switches", "switches?"],
  ["dimmers", "Dimmers", "dimmers?"],
  ["recessedLights", "Recessed lights", "recessed\\s+lights?|can\\s+lights?"],
  ["ceilingFans", "Ceiling fans", "ceiling\\s+fans?|fan\\s+locations?"],
  ["circuitCount", "Branch circuits", "branch\\s+circuits?|circuits?"],
  ["routeLength", "Route length (ft)", "route\\s+length|wire\\s+run"],
  ["homeRunLength", "Home-run length (ft)", "home[-\\s]?run"],
] as const;

const HOUSE_RULES = [
  ["outletQuantity", "Outlets", "outlets?|receptacles?"],
  ["switchQuantity", "Switches", "switches?"],
  ["dimmerQuantity", "Dimmers", "dimmers?"],
  ["recessedLightQuantity", "Recessed lights", "recessed\\s+lights?|can\\s+lights?"],
  ["fanQuantity", "Ceiling fans", "ceiling\\s+fans?|fan\\s+locations?"],
  ["smokeCoQuantity", "Smoke/CO alarms", "smoke\\s*(?:and|&)\\s*co|smoke\\s+alarms?"],
  ["bedroomCount", "Bedrooms", "bedrooms?"],
  ["bathroomQuantity", "Bathrooms", "bathrooms?"],
  ["kitchenApplianceCircuitQuantity", "Kitchen appliance circuits", "kitchen\\s+appliance\\s+circuits?"],
  ["laundryCircuitQuantity", "Laundry circuits", "laundry\\s+circuits?"],
  ["exteriorReceptacleQuantity", "Exterior receptacles", "exterior\\s+(?:receptacles?|outlets?)"],
  ["exteriorLightingQuantity", "Exterior lighting", "exterior\\s+lighting"],
  ["garageReceptacleQuantity", "Garage receptacles", "garage\\s+(?:receptacles?|outlets?)"],
  ["garageCircuitQuantity", "Garage circuits", "garage\\s+circuits?"],
  ["hvacEquipmentCircuitQuantity", "HVAC equipment circuits", "hvac\\s+(?:equipment\\s+)?circuits?"],
  ["miniSplitCircuitQuantity", "Mini-split circuits", "mini[-\\s]?split\\s+circuits?"],
  ["commonBranchCircuitQuantity", "Common branch circuits", "common\\s+branch\\s+circuits?"],
  ["finishedSquareFootage", "Finished square footage", "finished\\s+(?:area|square\\s+footage)|living\\s+area"],
  ["garageSquareFootage", "Garage square footage", "garage\\s+(?:area|square\\s+footage)"],
  ["basementSquareFootage", "Basement square footage", "basement\\s+(?:area|square\\s+footage)"],
] as const;

function extractNumber(line: string, keyword: RegExp) {
  const match = line.match(new RegExp(`(?:^|[^\\d])([0-9]{1,5})(?:\\s*(?:x|×|qty|quantity))?\\s*(?:${keyword.source})|(?:${keyword.source})\\s*[:=\\-]?\\s*([0-9]{1,5})`, "i"));
  const raw = match?.[1] ?? match?.[2];
  if (!raw) return null;
  const quantity = Number(raw);
  return Number.isInteger(quantity) && quantity >= 0 ? quantity : null;
}

let ocrPromise: Promise<OcrEngine> | undefined;

function getOcr() {
  ocrPromise ??= Ocr.create().then((ocr) => ocr as OcrEngine).catch((error) => {
    ocrPromise = undefined;
    throw error;
  });
  return ocrPromise;
}

async function runOcr(
  parser: PDFParse,
  pageNumbers: number[],
  options: TakeoffExtractionOptions,
) {
  if (pageNumbers.length > MAX_OCR_PAGES) {
    throw new TakeoffExtractionError(
      `This scanned plan set has ${pageNumbers.length} pages. Automatic OCR is limited to ${MAX_OCR_PAGES} pages; split the plan set by electrical sheets and try again.`,
      "OCR_PAGE_LIMIT_EXCEEDED",
    );
  }

  const pageGeometry = options.renderPage
    ? new Map<number, { width: number; height: number }>()
    : new Map(
        (
          await parser.getInfo({
            partial: pageNumbers,
            parsePageInfo: true,
          })
        ).pages.map((page) => [
          page.pageNumber,
          { width: page.width, height: page.height },
        ]),
      );
  const ocr = options.ocr ?? (await getOcr());
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "takeoff-ocr-"));
  let renderedBytes = 0;
  let recognizedCharacters = 0;
  let confidentCharacters = 0;
  let confidenceTotal = 0;
  let confidenceLines = 0;
  const pages: TakeoffPage[] = [];

  try {
    for (const pageNumber of pageNumbers) {
      const geometry = pageGeometry.get(pageNumber);
      if (geometry) {
        const renderHeight = Math.ceil(
          (OCR_RENDER_WIDTH * geometry.height) / geometry.width,
        );
        if (
          !Number.isFinite(renderHeight) ||
          geometry.width <= 0 ||
          geometry.height <= 0 ||
          renderHeight > MAX_OCR_RENDER_HEIGHT ||
          OCR_RENDER_WIDTH * renderHeight > MAX_OCR_RENDER_PIXELS
        ) {
          throw new TakeoffExtractionError(
            `The scanned plan on page ${pageNumber} is too large to render safely for OCR. Export that sheet at a standard page size and try again.`,
            "OCR_SIZE_LIMIT_EXCEEDED",
          );
        }
      }
      const image = options.renderPage
        ? await options.renderPage(pageNumber)
        : Buffer.from(
            (
              await parser.getScreenshot({
                partial: [pageNumber],
                desiredWidth: OCR_RENDER_WIDTH,
                imageBuffer: true,
                imageDataUrl: false,
              })
            ).pages[0]?.data ?? [],
          );
      if (image.byteLength === 0) {
        throw new TakeoffExtractionError(
          `The scanned plan on page ${pageNumber} could not be rendered for OCR. Upload the original PDF or split the plan set.`,
          "OCR_LOW_CONFIDENCE",
        );
      }
      if (image.byteLength > MAX_OCR_PAGE_BYTES || renderedBytes + image.byteLength > MAX_OCR_RENDERED_BYTES) {
        throw new TakeoffExtractionError(
          `The scanned plan images exceed the ${Math.round(MAX_OCR_RENDERED_BYTES / 1024 / 1024)} MB automatic OCR limit. Split the plan set by electrical sheets and try again.`,
          "OCR_SIZE_LIMIT_EXCEEDED",
        );
      }
      renderedBytes += image.byteLength;

      const imagePath = path.join(temporaryDirectory, `page-${pageNumber}.png`);
      await writeFile(imagePath, image);
      const lines = (await ocr.detect(imagePath))
        .map((line) => ({
          text: line.text.replace(/\s+/g, " ").trim(),
          mean: line.mean,
          box: line.box,
        }))
        .filter((line) => line.text.length > 0);
      const pageCharacters = lines.reduce((total, line) => total + line.text.replace(/\s/g, "").length, 0);
      recognizedCharacters += pageCharacters;
      for (const line of lines) {
        if (Number.isFinite(line.mean)) {
          confidenceTotal += line.mean;
          confidenceLines += 1;
        }
        if (line.mean >= MIN_OCR_LINE_SCORE) {
          confidentCharacters += line.text.replace(/\s/g, "").length;
        }
      }
      pages.push({
        pageNumber,
        ocr: true,
        text: lines
          .filter((line) => line.mean >= MIN_OCR_LINE_SCORE)
          .sort((left, right) => (left.box?.[0]?.[1] ?? 0) - (right.box?.[0]?.[1] ?? 0))
          .map((line) => `[OCR] ${line.text}`)
          .join("\n"),
      });
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }

  const averageConfidence = confidenceLines > 0 ? confidenceTotal / confidenceLines : 0;
  if (
    recognizedCharacters < MIN_OCR_CHARACTERS ||
    confidentCharacters < MIN_OCR_CHARACTERS ||
    averageConfidence < MIN_OCR_LINE_SCORE
  ) {
    throw new TakeoffExtractionError(
      "The scanned plan text could not be read with enough confidence to suggest safe quantities. Upload a higher-resolution scan or a text-searchable PDF.",
      "OCR_LOW_CONFIDENCE",
    );
  }

  return {
    pages,
    characters: confidentCharacters,
    averageConfidence,
  };
}

export async function extractTakeoff(
  buffer: Buffer,
  module: TakeoffBuilderModule,
  options: TakeoffExtractionOptions = {},
) {
  if (buffer.byteLength < 5 || buffer.subarray(0, 5).toString() !== "%PDF-") {
    throw new Error("This file is not a valid PDF. Upload the original plan PDF.");
  }
  if (buffer.byteLength > 25 * 1024 * 1024) {
    throw new Error("This plan set is larger than 25 MB. Export a smaller PDF or split the plan set.");
  }
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText({ itemJoiner: " " });
    const extractedTextByPage = new Map(
      result.pages.map((page) => [
        page.num,
        page.text.replace(/\u0000/g, " ").slice(0, MAX_TEXT),
      ]),
    );
    const textPages: TakeoffPage[] = Array.from(
      { length: result.total },
      (_, index) => ({
        pageNumber: index + 1,
        text: extractedTextByPage.get(index + 1) ?? "",
        ocr: false,
      }),
    );
    const ocrPageNumbers = textPages
      .filter((page) => page.text.replace(/\s/g, "").length < MIN_OCR_CHARACTERS)
      .map((page) => page.pageNumber);
    let ocrCharacters = 0;
    let ocrAverageConfidence: number | null = null;
    let pages = textPages;
    let ocrWarning: TakeoffExtractionError | null = null;

    if (ocrPageNumbers.length > 0) {
      try {
        const ocrResult = await runOcr(parser, ocrPageNumbers, options);
        ocrCharacters = ocrResult.characters;
        ocrAverageConfidence = ocrResult.averageConfidence;
        const ocrByPage = new Map(ocrResult.pages.map((page) => [page.pageNumber, page]));
        pages = textPages.map((page) => ocrByPage.get(page.pageNumber) ?? page);
      } catch (error) {
        if (!(error instanceof TakeoffExtractionError)) throw error;
        ocrWarning = error;
      }
    }

    const text = pages.map((page) => page.text).join("\n\f\n").slice(0, MAX_TEXT);
    if (text.replace(/\s/g, "").length < MIN_OCR_CHARACTERS) {
      if (ocrWarning) throw ocrWarning;
      throw new Error("No readable plan text was found. Upload an electrical plan PDF with legends or schedules.");
    }
    const rules = module === "ADDITION" ? ADDITION_RULES : HOUSE_RULES;
    const items: ExtractedTakeoffItem[] = [];
    for (const [fieldKey, label, expression] of rules) {
      const keyword = new RegExp(expression, "i");
      let match: { line: string; pageNumber: number; ocr: boolean } | undefined;
      for (const page of pages) {
        const line = page.text
          .split(/\r?\n/)
          .map((value) => value.trim())
          .filter(Boolean)
          .find((value) => keyword.test(value) && extractNumber(value, keyword) !== null);
        if (line) {
          match = { line, pageNumber: page.pageNumber, ocr: page.ocr };
          break;
        }
      }
      if (!match) continue;
      const quantity = extractNumber(match.line, keyword);
      if (quantity === null) continue;
      const sourceContext = match.line.length > 240 ? `${match.line.slice(0, 237)}...` : match.line;
      items.push({
        fieldKey,
        label,
        kind: fieldKey.toLowerCase().includes("circuit")
          ? "circuit"
          : fieldKey.toLowerCase().includes("square") || fieldKey.includes("Length")
            ? "dimension"
            : "quantity",
        proposedQuantity: quantity,
        confidence: match.ocr
          ? "medium"
          : sourceContext.match(/(?:schedule|legend|plan|electrical|e\d)/i)
            ? "high"
            : "medium",
        sourceContext,
        sourcePage: match.pageNumber,
      });
    }
    if (items.length === 0) {
      if (ocrWarning) throw ocrWarning;
      throw new Error("The PDF opened, but no labeled electrical quantities were found. Check that legends or schedules are included and try again.");
    }
    return {
      items,
      pageCount: result.total ?? pages.length,
      sections: [
        ...( /legend/i.test(text) ? ["legend"] : []),
        ...( /schedule/i.test(text) ? ["schedule"] : []),
        ...( /electrical|power|lighting/i.test(text) ? ["drawings"] : []),
      ],
      textCharacters: text.length,
      ocrUsed: pages.some((page) => page.ocr),
      ocrPages: pages.filter((page) => page.ocr).map((page) => page.pageNumber),
      ocrSkippedPages: ocrWarning ? ocrPageNumbers : [],
      ocrWarning: ocrWarning?.message ?? null,
      ocrCharacters,
      ocrAverageConfidence,
    };
  } finally {
    await parser.destroy();
  }
}