import { PDFParse } from "pdf-parse";
import type { TakeoffBuilderModule, TakeoffConfidence } from "@workspace/db";

const MAX_TEXT = 1_000_000;

export type ExtractedTakeoffItem = {
  fieldKey: string;
  label: string;
  kind: "quantity" | "circuit" | "dimension";
  proposedQuantity: number;
  confidence: TakeoffConfidence;
  sourceContext: string;
  sourcePage: number | null;
};

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

function pageFor(text: string, index: number) {
  const pages = text.split(/\f/);
  let offset = 0;
  for (let page = 0; page < pages.length; page += 1) {
    const next = offset + pages[page].length;
    if (index <= next) return page + 1;
    offset = next + 1;
  }
  return null;
}

function extractNumber(line: string, keyword: RegExp) {
  const match = line.match(new RegExp(`(?:^|[^\\d])([0-9]{1,5})(?:\\s*(?:x|×|qty|quantity))?\\s*(?:${keyword.source})|(?:${keyword.source})\\s*[:=\\-]?\\s*([0-9]{1,5})`, "i"));
  const raw = match?.[1] ?? match?.[2];
  if (!raw) return null;
  const quantity = Number(raw);
  return Number.isInteger(quantity) && quantity >= 0 ? quantity : null;
}

export async function extractTakeoff(buffer: Buffer, module: TakeoffBuilderModule) {
  if (buffer.byteLength < 5 || buffer.subarray(0, 5).toString() !== "%PDF-") {
    throw new Error("This file is not a valid PDF. Upload the original plan PDF.");
  }
  if (buffer.byteLength > 25 * 1024 * 1024) {
    throw new Error("This plan set is larger than 25 MB. Export a smaller PDF or split the plan set.");
  }
  const parser = new PDFParse({ data: buffer });
  let result: { text: string; total?: number };
  try {
    result = await parser.getText();
  } finally {
    await parser.destroy();
  }
  const text = result.text.replace(/\u0000/g, " ").slice(0, MAX_TEXT);
  if (text.replace(/\s/g, "").length < 30) {
    throw new Error("No selectable plan text was found. Upload a text-searchable PDF; scanned-only plans need OCR before upload.");
  }
  const rules = module === "ADDITION" ? ADDITION_RULES : HOUSE_RULES;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const items: ExtractedTakeoffItem[] = [];
  for (const [fieldKey, label, expression] of rules) {
    const keyword = new RegExp(expression, "i");
    const lineIndex = lines.findIndex((line) => keyword.test(line) && extractNumber(line, keyword) !== null);
    if (lineIndex < 0) continue;
    const line = lines[lineIndex];
    const quantity = extractNumber(line, keyword);
    if (quantity === null) continue;
    const sourceContext = line.length > 240 ? `${line.slice(0, 237)}...` : line;
    const sourceIndex = text.indexOf(line);
    items.push({
      fieldKey,
      label,
      kind: fieldKey.toLowerCase().includes("circuit") ? "circuit" : fieldKey.toLowerCase().includes("square") || fieldKey.includes("Length") ? "dimension" : "quantity",
      proposedQuantity: quantity,
      confidence: line.match(/(?:schedule|legend|plan|electrical|e\d)/i) ? "high" : "medium",
      sourceContext,
      sourcePage: pageFor(text, sourceIndex),
    });
  }
  if (items.length === 0) {
    throw new Error("The PDF opened, but no labeled electrical quantities were found. Check that legends or schedules are included and try again.");
  }
  return {
    items,
    pageCount: result.total ?? text.split(/\f/).length,
    sections: [
      ...( /legend/i.test(text) ? ["legend"] : []),
      ...( /schedule/i.test(text) ? ["schedule"] : []),
      ...( /electrical|power|lighting/i.test(text) ? ["drawings"] : []),
    ],
    textCharacters: text.length,
  };
}