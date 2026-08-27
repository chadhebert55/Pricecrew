const catalogDescriptionRules: Array<[RegExp, string]> = [
  [/^Milbank .*200A meter-main.*$/i, "200A meter-main with built-in disconnect"],
  [/^Siemens .*200A .*panel.*$/i, "200A Siemens panel"],
  [/^Square D .*100A .*load center.*$/i, "100A Square D panel"],
  [/^.*intersystem bonding (?:terminal|connector).*$/i, "Intersystem bonding connector"],
  [/^#8 solid grounding conductor$/i, "#8 bare copper"],
  [/^#4 green bonding conductor$/i, "#4 green copper"],
  [/^.*Pass & Seymour.*traditional 3-way switches.*$/i, "3-way switches"],
  [/^.*Pass & Seymour.*single-pole switches?.*$/i, "Single-pole switch"],
  [/^.*Lutron.*dimmer.*$/i, "Dimmer"],
  [/^.*Juno.*4-inch.*(?:wafer|light).*$/i, "4-inch recessed light"],
  [/^.*Juno.*6-inch.*(?:wafer|light).*$/i, "6-inch recessed light"],
]

export function contractorMaterialName(description: string) {
  for (const [pattern, replacement] of catalogDescriptionRules) {
    if (pattern.test(description)) return replacement
  }

  if (/\bbreaker\b/i.test(description)) {
    return description.replace(/\s+—\s+[^—]+$/, "")
  }

  return description
}

export function contractorMaterialSource(source: string) {
  if (
    /\b(?:SKU|UPC|MPN)\b/i.test(source) ||
    /\bNortheast Electrical\b/i.test(source) ||
    source.includes(" • ") ||
    source === "Default price book"
  ) {
    return "Company price book"
  }

  return source
}