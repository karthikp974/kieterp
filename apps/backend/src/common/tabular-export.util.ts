import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { Response } from "express";

export const TABULAR_EXPORT_FORMATS = ["csv", "excel", "google-sheets", "pdf", "docx", "txt"] as const;
export type TabularExportFormat = (typeof TABULAR_EXPORT_FORMATS)[number];
export type TabularExportFormatWithTxt = TabularExportFormat;

function escapeHtml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRtf(value: string | number) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}");
}

function toCsv(rows: (string | number | null | undefined)[][]) {
  return rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
}

function toPlainText(title: string, rows: (string | number | null | undefined)[][]) {
  const lines = [title, ""];
  for (const row of rows) {
    lines.push(row.map((cell) => String(cell ?? "")).join("\t"));
  }
  return lines.join("\r\n");
}

function buildRtf(title: string, rows: (string | number | null | undefined)[][]) {
  const lines = [`\\b ${escapeRtf(title)}\\b0\\par`, "\\par"];
  for (const row of rows) {
    lines.push(`${row.map((cell) => escapeRtf(cell ?? "")).join("\\tab ")}\\par`);
  }
  return `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\\f0\\fs22 ${lines.join("")} }`;
}

async function buildXlsxBuffer(title: string, rows: (string | number | null | undefined)[][]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "College ERP";
  const ws = wb.addWorksheet("Report", { views: [{ state: "frozen", ySplit: 2 }] });
  ws.getCell("A1").value = title;
  ws.getCell("A1").font = { size: 14, bold: true, color: { argb: "FF004B8D" } };
  ws.mergeCells(1, 1, 1, Math.max(rows[0]?.length ?? 1, 1));

  const header = rows[0] ?? [];
  header.forEach((value, index) => {
    const cell = ws.getCell(2, index + 1);
    cell.value = String(value ?? "");
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF004B8D" } };
  });

  rows.slice(1).forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      ws.getCell(rowIndex + 3, colIndex + 1).value = value ?? "";
    });
  });

  ws.columns = header.map(() => ({ width: 18 }));
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

async function buildPdfBuffer(title: string, rows: (string | number | null | undefined)[][]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 44, size: "A4", layout: rows[0]?.length && rows[0].length > 5 ? "landscape" : "portrait" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(16).fillColor("#004b8d").text(title);
    doc.moveDown(0.8);

    const headers = rows[0] ?? [];
    const colCount = Math.max(headers.length, 1);
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colWidth = pageWidth / colCount;
    let y = doc.y;

    doc.font("Helvetica-Bold").fontSize(9).fillColor("#111");
    headers.forEach((header, index) => {
      doc.text(String(header ?? ""), doc.page.margins.left + index * colWidth, y, { width: colWidth - 4 });
    });
    y += 16;
    doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y).strokeColor("#dbe3ef").stroke();
    y += 8;

    doc.font("Helvetica").fontSize(8).fillColor("#222");
    for (const row of rows.slice(1)) {
      if (y > doc.page.height - doc.page.margins.bottom - 24) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      row.forEach((cell, index) => {
        doc.text(String(cell ?? ""), doc.page.margins.left + index * colWidth, y, { width: colWidth - 4 });
      });
      y += 14;
    }

    doc.end();
  });
}

/** Stream a tabular report in the requested format with correct filename + MIME type. */
export async function sendTabularExport(
  response: Response,
  format: TabularExportFormatWithTxt,
  filename: string,
  title: string,
  rows: (string | number | null | undefined)[][]
) {
  const base = filename.replace(/\.[^.]+$/, "");

  if (format === "pdf") {
    const buffer = await buildPdfBuffer(title, rows);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `attachment; filename="${base}.pdf"`);
    response.send(buffer);
    return;
  }

  if (format === "docx") {
    const rtf = buildRtf(title, rows);
    response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    response.setHeader("Content-Disposition", `attachment; filename="${base}.docx"`);
    response.send(rtf);
    return;
  }

  if (format === "excel") {
    const buffer = await buildXlsxBuffer(title, rows);
    response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    response.setHeader("Content-Disposition", `attachment; filename="${base}.xlsx"`);
    response.send(buffer);
    return;
  }

  if (format === "txt") {
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="${base}.txt"`);
    response.send(toPlainText(title, rows));
    return;
  }

  const csv = toCsv(rows);
  if (format === "google-sheets") {
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="${base}.csv"`);
    response.send(csv);
    return;
  }

  response.setHeader("Content-Type", "text/csv; charset=utf-8");
  response.setHeader("Content-Disposition", `attachment; filename="${base}.csv"`);
  response.send(csv);
}

/** @deprecated Internal HTML helper retained for reference — exports now use native PDF/DOC/XLSX. */
export function buildTabularHtml(title: string, rows: (string | number | null | undefined)[][]) {
  const head = rows[0]?.map((h) => `<th>${escapeHtml(h ?? "")}</th>`).join("") ?? "";
  const body = rows
    .slice(1)
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell ?? "")}</td>`).join("")}</tr>`)
    .join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body><h1>${escapeHtml(title)}</h1><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}
