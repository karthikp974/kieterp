import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { Response } from "express";
import { formatIstDateTime } from "./ist-time.util";
import {
  drawPdfInstitutionalHeader,
  drawPdfSectionHeading,
  drawPdfTable,
  formatPdfTimestamp,
  resolveKietLogoPath
} from "./pdf-institutional.util";

export const TABULAR_EXPORT_FORMATS = ["csv", "excel", "google-sheets", "pdf", "docx", "txt"] as const;
export type TabularExportFormat = (typeof TABULAR_EXPORT_FORMATS)[number];
export type TabularExportFormatWithTxt = TabularExportFormat;

const KIET_BLUE = "FF004B8D";
const KIET_SLATE = "FF64748B";
const ROW_STRIPE = "FFF8FAFC";

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

function isKeyValueExport(rows: (string | number | null | undefined)[][]) {
  const headers = rows[0] ?? [];
  return headers.length === 2 && String(headers[0]).toLowerCase() === "field" && String(headers[1]).toLowerCase() === "value";
}

function isSectionMarker(field: string) {
  return field.startsWith("—") && field.endsWith("—");
}

function sectionTitle(field: string) {
  return field.replace(/^—\s*|\s*—$/g, "").trim();
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

function styleInstitutionRow(cell: ExcelJS.Cell, colCount: number) {
  cell.font = { size: 14, bold: true, color: { argb: KIET_BLUE } };
  cell.alignment = { vertical: "middle" };
}

function styleTitleRow(cell: ExcelJS.Cell) {
  cell.font = { size: 12, bold: true, color: { argb: KIET_BLUE } };
}

function styleMetaRow(cell: ExcelJS.Cell) {
  cell.font = { size: 9, color: { argb: KIET_SLATE } };
}

function styleHeaderCell(cell: ExcelJS.Cell) {
  cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: KIET_BLUE } };
  cell.border = { bottom: { style: "thin", color: { argb: KIET_BLUE } } };
}

async function addWorksheetLogo(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, colCount: number) {
  const logoPath = resolveKietLogoPath();
  if (!logoPath) return;
  try {
    const imageId = wb.addImage({ filename: logoPath, extension: "png" });
    ws.addImage(imageId, {
      tl: { col: Math.max(colCount - 1.2, 0), row: 0 },
      ext: { width: 96, height: 48 }
    });
  } catch {
    /* logo optional */
  }
}

async function buildXlsxBuffer(title: string, rows: (string | number | null | undefined)[][]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "College ERP";
  const ws = wb.addWorksheet("Report");
  const colCount = Math.max(rows[0]?.length ?? 1, 2);
  const keyValue = isKeyValueExport(rows);
  const generatedAt = formatIstDateTime(new Date(), false);

  ws.getRow(1).height = 28;
  const institutionCell = ws.getCell("A1");
  institutionCell.value = "KIET Group of Institutions";
  styleInstitutionRow(institutionCell, colCount);
  ws.mergeCells(1, 1, 1, colCount);
  await addWorksheetLogo(wb, ws, colCount);

  const titleCell = ws.getCell("A2");
  titleCell.value = title;
  styleTitleRow(titleCell);
  ws.mergeCells(2, 1, 2, colCount);

  const metaCell = ws.getCell("A3");
  metaCell.value = `Generated ${generatedAt} (IST)`;
  styleMetaRow(metaCell);
  ws.mergeCells(3, 1, 3, colCount);

  if (keyValue) {
    let r = 5;
    for (const row of rows.slice(1)) {
      const field = String(row[0] ?? "");
      if (isSectionMarker(field)) {
        ws.mergeCells(r, 1, r, 2);
        const cell = ws.getCell(r, 1);
        cell.value = sectionTitle(field);
        cell.font = { bold: true, color: { argb: KIET_BLUE } };
        r += 1;
        continue;
      }
      ws.getCell(r, 1).value = field;
      ws.getCell(r, 1).font = { bold: true, color: { argb: KIET_BLUE } };
      ws.getCell(r, 2).value = row[1] ?? "";
      r += 1;
    }
    ws.getColumn(1).width = 28;
    ws.getColumn(2).width = 52;
    ws.views = [{ state: "frozen", ySplit: 4 }];
  } else {
    const headerRowNum = 5;
    const header = rows[0] ?? [];
    header.forEach((value, index) => {
      styleHeaderCell(ws.getCell(headerRowNum, index + 1));
      ws.getCell(headerRowNum, index + 1).value = String(value ?? "");
    });

    rows.slice(1).forEach((row, rowIndex) => {
      row.forEach((value, colIndex) => {
        const cell = ws.getCell(headerRowNum + 1 + rowIndex, colIndex + 1);
        cell.value = value ?? "";
        if (rowIndex % 2 === 1) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROW_STRIPE } };
        }
      });
    });

    ws.columns = header.map(() => ({ width: 16 }));
    ws.views = [{ state: "frozen", ySplit: headerRowNum }];
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

async function buildPdfBuffer(title: string, rows: (string | number | null | undefined)[][]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const keyValue = isKeyValueExport(rows);
    const headers = rows[0] ?? [];
    const colCount = Math.max(headers.length, 1);
    const landscape = !keyValue && colCount > 5;
    const doc = new PDFDocument({ margin: 44, size: "A4", layout: landscape ? "landscape" : "portrait" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const right = doc.page.margins.right;
    const contentWidth = doc.page.width - left - right;
    const bottomLimit = doc.page.height - doc.page.margins.bottom - 24;

    drawPdfInstitutionalHeader(doc, title);
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#64748b")
      .text(`Generated ${formatPdfTimestamp(new Date())}`, left, doc.y, { width: contentWidth, align: "center" });
    doc.moveDown(0.7);

    if (keyValue) {
      for (const row of rows.slice(1)) {
        if (doc.y > bottomLimit) {
          doc.addPage();
        }
        const field = String(row[0] ?? "");
        const value = String(row[1] ?? "—");
        if (isSectionMarker(field)) {
          doc.moveDown(0.25);
          drawPdfSectionHeading(doc, sectionTitle(field));
          continue;
        }
        const y = doc.y;
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#004b8d").text(field, left, y, { width: 148 });
        doc.font("Helvetica").fontSize(9).fillColor("#222").text(value || "—", left + 152, y, { width: contentWidth - 152 });
        doc.moveDown(0.2);
      }
    } else {
      const baseWidth = contentWidth / colCount;
      const columns = headers.map((header) => ({ header: String(header ?? ""), width: baseWidth }));
      drawPdfTable(
        doc,
        doc.y,
        left,
        columns,
        rows.slice(1).map((row) => row.map((cell) => String(cell ?? "—")))
      );
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
