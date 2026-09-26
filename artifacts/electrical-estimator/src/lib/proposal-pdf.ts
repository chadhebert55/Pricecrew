import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { CustomerProposal } from "@workspace/api-client-react";
import { proposalAccent, proposalDate, proposalMoney, proposalScopeValue, proposalTerms } from "./proposal-presentation";

async function fontData(file: string) {
  const base = new URL(import.meta.env.BASE_URL, document.baseURI);
  const response = await fetch(new URL(`fonts/${file}`, base));
  if (!response.ok) throw new Error("The PDF font could not be loaded. Please try again.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let start = 0; start < bytes.length; start += 8192)
    binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
  return btoa(binary);
}

/** Uses only the public proposal payload. No saved costs, stock list or share URL. */
export async function downloadProposalPdf(quote: CustomerProposal) {
  const doc = new jsPDF({ unit: "pt", format: "letter", compress: true });
  const regular = await fontData("proposal-regular.ttf");
  const bold = await fontData("proposal-bold.ttf");
  doc.addFileToVFS("proposal-regular.ttf", regular);
  doc.addFont("proposal-regular.ttf", "Proposal", "normal");
  doc.addFileToVFS("proposal-bold.ttf", bold);
  doc.addFont("proposal-bold.ttf", "Proposal", "bold");
  doc.setProperties({ title: `${quote.company.displayName} - Proposal ${quote.quoteNumber}`,
    author: quote.company.displayName, creator: quote.company.displayName });
  const margin = 42, width = 528, bottom = 735;
  const accent = proposalAccent(quote.company.accentColor);
  let y = 48;
  const style = (size = 10, weight = "normal", color = "#222222") => {
    doc.setFont("Proposal", weight); doc.setFontSize(size); doc.setTextColor(color);
  };
  const nextPage = () => {
    doc.addPage(); y = 48;
    style(9, "bold", "#555555");
    doc.text(doc.splitTextToSize(quote.company.displayName, width - 150)[0], margin, y);
    doc.text(`Proposal #${quote.quoteNumber}`, 570, y, { align: "right" });
    y += 22;
  };
  const ensure = (height: number) => { if (y + height > bottom) nextPage(); };
  const paragraph = (text: string, size = 10, lineHeight = 13) => {
    style(size);
    const lines: string[] = doc.splitTextToSize(text, width);
    for (const line of lines) { ensure(lineHeight); style(size); doc.text(line, margin, y); y += lineHeight; }
  };
  const heading = (text: string, following = 26) => {
    ensure(18 + following); style(11, "bold"); doc.text(text, margin, y); y += 16;
  };
  doc.setDrawColor(accent); doc.setLineWidth(2.5); doc.line(margin, y - 12, 570, y - 12);
  style(10, "bold"); doc.text(`Proposal #${quote.quoteNumber}`, 570, y + 8, { align: "right" });
  style(9, "normal", "#555555"); doc.text(proposalDate(quote.createdAt), 570, y + 23, { align: "right" });
  style(9, "bold", accent); doc.text("CUSTOMER PROPOSAL", margin, y + 8); y += 31;
  style(20, "bold");
  const title: string[] = doc.splitTextToSize(quote.projectName, 330);
  for (const line of title) { ensure(24); style(20, "bold"); doc.text(line, margin, y); y += 24; }
  paragraph(`Prepared for ${quote.customerName}`, 10, 14);
  y += 4;
  paragraph(quote.company.displayName, 10, 13);
  const contact = quote.company.contactAddress;
  if (contact) paragraph(contact, 9, 12);
  y += 12;
  heading("Proposed Work");
  paragraph(quote.proposalDescription); y += 10;

  if (quote.scope.length) {
    // Keep a normal scope table intact; very long tables flow with repeated
    // headings, unsplit ordinary rows, and a balanced final group.
    style(9.5);
    const rows = quote.scope.map(line => [line.description, proposalScopeValue(line)]);
    const heights = rows.map(row => Math.max(
      doc.splitTextToSize(row[0], 378).length, doc.splitTextToSize(row[1], 118).length,
    ) * 11 + 9);
    const total = heights.reduce((sum, height) => sum + height, 0) + 40;
    if (total <= bottom - 70) ensure(total);
    let offset = 0;
    while (offset < rows.length) {
      ensure(90);
      heading(offset ? "Included Scope (continued)" : "Included Scope", 40);
      const startY = y;
      let count = 0, taken = 24;
      while (offset + count < rows.length && taken + heights[offset + count]! < bottom - startY) {
        taken += heights[offset + count]!; count++;
      }
      if (count === 0) count = 1; // autoTable can split an exceptionally tall row.
      const remaining = rows.length - offset - count;
      if (remaining > 0 && remaining < 3 && count > 3) count -= 3 - remaining;
      autoTable(doc, {
        startY, head: [["Description", { content: "Scope", styles: { halign: "right" } }]], body: rows.slice(offset, offset + count),
        theme: "plain", margin: { left: margin, right: margin, top: 70, bottom: 57 },
        styles: { font: "Proposal", fontSize: 9.5, cellPadding: 4.5, textColor: "#222222",
          lineWidth: { bottom: 0.4 }, lineColor: "#dddddd", overflow: "linebreak" },
        headStyles: { fillColor: "#f5f6f7", fontStyle: "bold", textColor: "#555555" },
        columnStyles: { 0: { cellWidth: 390 }, 1: { cellWidth: 138, halign: "right" } },
        rowPageBreak: "avoid", pageBreak: "auto",
      });
      y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 13;
      offset += count;
      if (offset < rows.length) nextPage();
    }
  }
  if (quote.assumptions?.length) {
    heading("Assumptions", 30);
    for (const assumption of quote.assumptions) paragraph(assumption, 9, 12);
    y += 10;
  }
  ensure(72);
  doc.setFillColor("#f4f8fa"); doc.roundedRect(margin, y, width, 62, 4, 4, "F");
  style(9, "bold", "#555555"); doc.text("TOTAL INVESTMENT", 554, y + 20, { align: "right" });
  style(29, "bold", accent); doc.text(proposalMoney(quote.finalSellingPrice), 554, y + 49, { align: "right" });
  y += 78;
  heading("Terms", 30);
  for (const term of proposalTerms(quote).split("\n").filter(Boolean)) {
    paragraph(term, 9, 11.5); y += 2;
  }
  y += 8;
  ensure(56);
  heading("Acceptance", 33);
  style(9);
  doc.text("Customer name: ____________________   Signature: ____________________   Date: __________", margin, y);
  y += 15;
  doc.text("By signing, the customer approves the scope, total, and terms of this proposal.", margin, y);

  // Contractor-only footer, no application branding or private bearer URL.
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setDrawColor("#dddddd"); doc.setLineWidth(0.5); doc.line(margin, 750, 570, 750);
    style(9, "normal", "#555555");
    const footer = [quote.company.displayName, quote.company.contactPhone, quote.company.contactEmail].filter(Boolean).join(" | ");
    const footerLines: string[] = doc.splitTextToSize(footer, 425);
    doc.text(footerLines.slice(0, 2), margin, 763);
    doc.text(`Page ${page} of ${pages}`, 570, 763, { align: "right" });
  }
  const filename = `Proposal-${quote.quoteNumber.replace(/[^a-zA-Z0-9_-]/g, "-")}.pdf`;
  doc.save(filename);
}
