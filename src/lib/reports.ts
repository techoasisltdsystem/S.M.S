import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import writeExcelFile from "write-excel-file/browser";

// The data for every report comes from database functions that check who is
// asking and return published marks only (student_report, class_results). This
// file only lays that data out; it never changes a score or invents a grade.

export interface ReportRow {
  subject?: string;
  student?: string;
  admission_number?: string | null;
  assessment: string;
  kind: string;
  date?: string | null;
  score: number;
  max_score: number;
  percent: number;
  grade: string | null;
  comment: string | null;
}
interface School { name: string; logo_url: string | null }
export interface StudentReport {
  school: School;
  student: { name: string; admission_number: string | null; class: string | null; academic_year: string | null };
  term: string | null;
  rows: ReportRow[];
  bands: { min_percent: number; grade: string; remark: string | null }[];
  issued_at: string;
}
export interface ClassReport {
  school: School;
  class: string;
  academic_year: string | null;
  term: string | null;
  rows: ReportRow[];
  issued_at: string;
}

const safeName = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "report";
const dateText = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

type Cell = string | number | null | undefined;

// A cell that starts with = + - @ could be run as a formula by a spreadsheet.
const csvCell = (v: Cell) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const saveBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

export const downloadCsv = (filename: string, headers: string[], rows: Cell[][]) => {
  const text = [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  // The byte order mark lets Excel open accented names correctly.
  saveBlob(new Blob(["﻿", text], { type: "text/csv;charset=utf-8" }), filename);
};

export const downloadXlsx = async (filename: string, sheet: string, headers: string[], rows: Cell[][]) => {
  const data = [
    headers.map((h) => ({ value: h, fontWeight: "bold" as const })),
    ...rows.map((r) => r.map((v) => (v === null || v === undefined || v === "" ? null : typeof v === "number" ? { value: v } : { value: String(v) }))),
  ];
  await writeExcelFile(data as never, { sheet: sheet.slice(0, 31) }).toFile(filename);
};

const imageFormat = (dataUrl: string | null): "PNG" | "JPEG" | null => {
  if (!dataUrl) return null;
  if (dataUrl.startsWith("data:image/png")) return "PNG";
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) return "JPEG";
  return null;
};

const pageHeader = (doc: jsPDF, school: School, title: string, lines: string[]) => {
  const margin = 14;
  let x = margin;
  const fmt = imageFormat(school.logo_url);
  if (fmt && school.logo_url) {
    try {
      doc.addImage(school.logo_url, fmt, margin, 10, 18, 18);
      x = margin + 22;
    } catch {
      // A logo that cannot be drawn is skipped; the report still prints.
    }
  }
  doc.setFont("helvetica", "bold").setFontSize(16).text(school.name, x, 17);
  doc.setFont("helvetica", "normal").setFontSize(11).text(title, x, 24);
  doc.setFontSize(9).setTextColor(90);
  lines.forEach((l, i) => doc.text(l, x, 30 + i * 4.5));
  doc.setTextColor(0);
  return 32 + lines.length * 4.5;
};

const addPageNumbers = (doc: jsPDF, issued: string) => {
  const n = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(8).setTextColor(110);
    doc.text(`Issued ${dateText(issued)}`, 14, h - 8);
    doc.text(`Page ${i} of ${n}`, w - 14, h - 8, { align: "right" });
    doc.setTextColor(0);
  }
};

export const studentReportPdf = (r: StudentReport) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const y0 = pageHeader(doc, r.school, "Student report", [
    `Student: ${r.student.name}${r.student.admission_number ? `   Admission no.: ${r.student.admission_number}` : ""}`,
    `Class: ${r.student.class ?? "—"}   Academic year: ${r.student.academic_year ?? "—"}   Term: ${r.term ?? "All terms"}`,
  ]);

  const hasGrades = r.rows.some((x) => x.grade);
  const head = ["Subject", "Assessment", "Type", "Score", "%", ...(hasGrades ? ["Grade"] : []), "Teacher comment"];
  const body = r.rows.map((x) => [
    x.subject ?? "", x.assessment, x.kind, `${num(x.score)} / ${num(x.max_score)}`, `${x.percent.toFixed(0)}%`,
    ...(hasGrades ? [x.grade ?? ""] : []), x.comment ?? "",
  ]);

  if (body.length === 0) {
    doc.setFontSize(11).text("No published results for this period.", 14, y0 + 8);
  } else {
    autoTable(doc, {
      startY: y0 + 2,
      head: [head],
      body,
      styles: { fontSize: 8.5, cellPadding: 1.8, overflow: "linebreak" },
      headStyles: { fillColor: [30, 64, 175] },
      rowPageBreak: "avoid",
      margin: { left: 14, right: 14, bottom: 16 },
    });

    const bySubject = new Map<string, number[]>();
    r.rows.forEach((x) => bySubject.set(x.subject ?? "", [...(bySubject.get(x.subject ?? "") ?? []), x.percent]));
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const summary = [...bySubject.entries()].map(([s, xs]) => [s, `${avg(xs).toFixed(1)}%`, String(xs.length)]);
    const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y0;
    doc.setFont("helvetica", "bold").setFontSize(10);
    if (last > 245) doc.addPage();
    const startY = last > 245 ? 20 : last + 8;
    doc.text("Subject averages", 14, startY - 2);
    autoTable(doc, {
      startY,
      head: [["Subject", "Average", "Assessments"]],
      body: [...summary, ["Overall (all published results)", `${avg(r.rows.map((x) => x.percent)).toFixed(1)}%`, String(r.rows.length)]],
      styles: { fontSize: 8.5, cellPadding: 1.8 },
      headStyles: { fillColor: [71, 85, 105] },
      rowPageBreak: "avoid",
      tableWidth: 120,
      margin: { left: 14, right: 14, bottom: 16 },
    });
  }

  if (r.bands.length > 0) {
    const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y0 + 10;
    const needs = 14 + r.bands.length * 5;
    if (last + needs > 280) doc.addPage();
    const y = last + needs > 280 ? 20 : last + 8;
    doc.setFont("helvetica", "bold").setFontSize(9).text("Grading scale", 14, y);
    doc.setFont("helvetica", "normal").setFontSize(8.5);
    r.bands.forEach((b, i) => doc.text(`${b.grade}: ${b.min_percent}% and above${b.remark ? ` (${b.remark})` : ""}`, 14, y + 5 + i * 4.5));
  }
  addPageNumbers(doc, r.issued_at);
  doc.save(`report-${safeName(r.student.name)}.pdf`);
};

export const classResultsPdf = (r: ClassReport) => {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const y0 = pageHeader(doc, r.school, "Class results", [
    `Class: ${r.class}   Academic year: ${r.academic_year ?? "—"}   Term: ${r.term ?? "All terms"}`,
  ]);
  const hasGrades = r.rows.some((x) => x.grade);
  autoTable(doc, {
    startY: y0 + 2,
    head: [["Student", "Adm. no.", "Subject", "Assessment", "Score", "%", ...(hasGrades ? ["Grade"] : []), "Comment"]],
    body: r.rows.map((x) => [
      x.student ?? "", x.admission_number ?? "", x.subject ?? "", x.assessment, `${num(x.score)} / ${num(x.max_score)}`,
      `${x.percent.toFixed(0)}%`, ...(hasGrades ? [x.grade ?? ""] : []), x.comment ?? "",
    ]),
    styles: { fontSize: 8, cellPadding: 1.6, overflow: "linebreak" },
    headStyles: { fillColor: [30, 64, 175] },
    rowPageBreak: "avoid",
    margin: { left: 14, right: 14, bottom: 16 },
  });
  addPageNumbers(doc, r.issued_at);
  doc.save(`class-results-${safeName(r.class)}.pdf`);
};

const studentTable = (r: StudentReport) => {
  const headers = ["Subject", "Assessment", "Type", "Date", "Score", "Maximum", "Percent", "Grade", "Teacher comment"];
  const rows: Cell[][] = r.rows.map((x) => [x.subject, x.assessment, x.kind, x.date ?? "", x.score, x.max_score, x.percent, x.grade, x.comment]);
  return { headers, rows };
};
const classTable = (r: ClassReport) => {
  const headers = ["Student", "Admission number", "Subject", "Assessment", "Type", "Score", "Maximum", "Percent", "Grade", "Comment"];
  const rows: Cell[][] = r.rows.map((x) => [x.student, x.admission_number, x.subject, x.assessment, x.kind, x.score, x.max_score, x.percent, x.grade, x.comment]);
  return { headers, rows };
};

export type Format = "pdf" | "xlsx" | "csv";

export const exportStudentReport = async (r: StudentReport, format: Format) => {
  const base = `report-${safeName(r.student.name)}`;
  const { headers, rows } = studentTable(r);
  if (format === "pdf") studentReportPdf(r);
  else if (format === "csv") downloadCsv(`${base}.csv`, headers, rows);
  else await downloadXlsx(`${base}.xlsx`, "Results", headers, rows);
};

export const exportClassResults = async (r: ClassReport, format: Format) => {
  const base = `class-results-${safeName(r.class)}`;
  const { headers, rows } = classTable(r);
  if (format === "pdf") classResultsPdf(r);
  else if (format === "csv") downloadCsv(`${base}.csv`, headers, rows);
  else await downloadXlsx(`${base}.xlsx`, "Results", headers, rows);
};

// ---------------------------------------------------------------------------
// Fee invoices and receipts
// ---------------------------------------------------------------------------
export interface InvoiceDoc {
  invoice: { number: string; title: string; issued_on: string; due_on: string; total: number; paid: number; balance: number; status: string };
  school: { name: string; currency: string; logo_url: string | null };
  student: { name: string; admission_number: string | null; class: string | null };
  lines: { description: string; amount: number }[];
  payments: { receipt: string; amount: number; method: string; reference: string | null; paid_on: string; status: string }[];
}

const cash = (n: number, c: string) => `${c === "GHS" ? "GHS " : c + " "}${Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dayText = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const methodText = (m: string) => ({ cash: "Cash", mobile_money: "Mobile money", bank_transfer: "Bank transfer", cheque: "Cheque", other: "Other" } as Record<string, string>)[m] ?? m;

/** An invoice with its payments (a statement). Only payments that count are listed. */
export const invoicePdf = (d: InvoiceDoc) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const cur = d.school.currency;
  const y0 = pageHeader(doc, d.school, `Invoice ${d.invoice.number}`, [
    `Student: ${d.student.name}${d.student.admission_number ? `   Admission no.: ${d.student.admission_number}` : ""}`,
    `Class: ${d.student.class ?? "—"}   Issued: ${dayText(d.invoice.issued_on)}   Due: ${dayText(d.invoice.due_on)}`,
  ]);
  autoTable(doc, {
    startY: y0 + 2, head: [["Description", "Amount"]],
    body: [...d.lines.map((l) => [l.description, cash(l.amount, cur)]), [{ content: "Total", styles: { fontStyle: "bold" } }, { content: cash(d.invoice.total, cur), styles: { fontStyle: "bold" } }]],
    styles: { fontSize: 9, cellPadding: 2 }, headStyles: { fillColor: [30, 64, 175] }, columnStyles: { 1: { halign: "right" } },
    rowPageBreak: "avoid", margin: { left: 14, right: 14, bottom: 16 },
  });
  const counted = d.payments.filter((p) => p.status === "recorded");
  let last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y0;
  doc.setFont("helvetica", "bold").setFontSize(10).text("Payments received", 14, last + 9);
  autoTable(doc, {
    startY: last + 11, head: [["Receipt", "Date", "Method", "Reference", "Amount"]],
    body: counted.length ? counted.map((p) => [p.receipt, dayText(p.paid_on), methodText(p.method), p.reference ?? "", cash(p.amount, cur)]) : [[{ content: "No payments yet", colSpan: 5 }]],
    styles: { fontSize: 9, cellPadding: 2 }, headStyles: { fillColor: [71, 85, 105] }, columnStyles: { 4: { halign: "right" } },
    rowPageBreak: "avoid", margin: { left: 14, right: 14, bottom: 16 },
  });
  last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? last;
  if (last > 262) { doc.addPage(); last = 14; }
  doc.setFont("helvetica", "bold").setFontSize(11);
  doc.text(`Paid: ${cash(d.invoice.paid, cur)}`, 14, last + 9);
  doc.text(`Balance due: ${cash(d.invoice.balance, cur)}`, 14, last + 15);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(90);
  doc.text(d.invoice.status === "cancelled" ? "This invoice was cancelled." : d.invoice.balance <= 0 ? "Paid in full. Thank you." : "Please pay at the school office or as the school directs.", 14, last + 21);
  addPageNumbers(doc, new Date().toISOString());
  doc.save(`invoice-${safeName(d.invoice.number)}.pdf`);
};

/** A receipt for one payment. */
export const receiptPdf = (d: InvoiceDoc, receipt: string) => {
  const p = d.payments.find((x) => x.receipt === receipt && x.status === "recorded");
  if (!p) throw new Error("That payment is not available.");
  const doc = new jsPDF({ unit: "mm", format: "a5", orientation: "landscape" });
  const cur = d.school.currency;
  const y0 = pageHeader(doc, d.school, `Receipt ${p.receipt}`, [`Received from the family of ${d.student.name}${d.student.class ? ` (${d.student.class})` : ""}`]);
  autoTable(doc, {
    startY: y0 + 4,
    body: [["Invoice", `${d.invoice.number}: ${d.invoice.title}`], ["Date paid", dayText(p.paid_on)], ["Method", `${methodText(p.method)}${p.reference ? `, ref. ${p.reference}` : ""}`],
           ["Amount received", cash(p.amount, cur)], ["Balance on the invoice", cash(d.invoice.balance, cur)]],
    theme: "plain", styles: { fontSize: 10, cellPadding: 2 }, columnStyles: { 0: { fontStyle: "bold", cellWidth: 50 } }, margin: { left: 14, right: 14 },
  });
  addPageNumbers(doc, new Date().toISOString());
  doc.save(`receipt-${safeName(p.receipt)}.pdf`);
};

// ---------------------------------------------------------------------------
// Performance summary for a student or a parent (from what the dashboard already shows)
// ---------------------------------------------------------------------------
export interface PerformanceData {
  school: School;
  student: { name: string; class: string | null };
  average: number | null;
  rank: number | null;
  classSize: number | null;
  attendancePct: number | null;
  attendanceDays: number;
  subjects: { subject: string; average: number; count: number }[];
  results: { subject: string; title: string; kind: string; date: string; score: number; max: number; percent: number }[];
  issued_at: string;
}

const performanceRows = (d: PerformanceData): { headers: string[]; rows: Cell[][] } => {
  const blank: Cell[] = ["", "", "", "", "", ""];
  const rows: Cell[][] = [
    ["Student", d.student.name, "", "", "", ""],
    ["Class", d.student.class ?? "", "", "", "", ""],
    ["Average of published results (%)", d.average ?? "", "", "", "", ""],
    ["Class position", d.rank != null ? `${d.rank} of ${d.classSize ?? ""}` : "", "", "", "", ""],
    ["Attendance (%)", d.attendancePct ?? "", `${d.attendanceDays} day(s) recorded`, "", "", ""],
    blank,
    ["Subject", "Assessments", "Average (%)", "", "", ""],
    ...d.subjects.map((s): Cell[] => [s.subject, s.count, Math.round(s.average * 10) / 10, "", "", ""]),
    blank,
    ["Subject", "Assessment", "Type", "Date", "Score", "Percent"],
    ...d.results.map((r): Cell[] => [r.subject, r.title, r.kind, r.date ? dateText(r.date) : "", `${num(r.score)}/${num(r.max)}`, Math.round(r.percent * 10) / 10]),
  ];
  return { headers: ["Performance summary", "", "", "", "", ""], rows };
};

const performancePdf = (d: PerformanceData) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = pageHeader(doc, d.school, "Performance summary", [d.student.name + (d.student.class ? ` · ${d.student.class}` : "")]);
  autoTable(doc, {
    startY: y + 4, theme: "grid", styles: { fontSize: 10 }, margin: { left: 14, right: 14 },
    head: [["Average", "Class position", "Attendance"]],
    body: [[d.average != null ? `${num(d.average)}%` : "No published results", d.rank != null ? `${d.rank} of ${d.classSize}` : "-", d.attendancePct != null ? `${d.attendancePct}% (${d.attendanceDays} days)` : "No register yet"]],
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  if (d.subjects.length) {
    doc.setFont("helvetica", "bold").setFontSize(12).text("Average by subject", 14, y);
    y += 5;
    const labelW = 48, maxW = 120;
    d.subjects.forEach((s) => {
      if (y > 262) { doc.addPage(); y = 20; }
      doc.setFont("helvetica", "normal").setFontSize(9).text(s.subject.slice(0, 26), 14, y + 4);
      doc.setFillColor(226, 232, 240).rect(14 + labelW, y, maxW, 5, "F");
      const col = s.average >= 70 ? [34, 139, 94] : s.average >= 50 ? [30, 100, 200] : [200, 60, 60];
      doc.setFillColor(col[0], col[1], col[2]).rect(14 + labelW, y, Math.max(0.5, (maxW * Math.min(100, s.average)) / 100), 5, "F");
      doc.text(`${num(s.average)}%`, 14 + labelW + maxW + 3, y + 4);
      y += 8;
    });
    y += 4;
  }
  autoTable(doc, {
    startY: y, margin: { left: 14, right: 14 }, styles: { fontSize: 9 }, headStyles: { fillColor: [30, 64, 175] },
    head: [["Subject", "Assessment", "Type", "Date", "Score", "%"]],
    body: d.results.map((r) => [r.subject, r.title, r.kind, r.date ? dateText(r.date) : "", `${num(r.score)}/${num(r.max)}`, `${num(r.percent)}`]),
  });
  addPageNumbers(doc, d.issued_at);
  doc.save(`performance-${safeName(d.student.name)}.pdf`);
};

export const exportPerformance = async (d: PerformanceData, format: Format) => {
  const base = `performance-${safeName(d.student.name)}`;
  if (format === "pdf") return performancePdf(d);
  const { headers, rows } = performanceRows(d);
  if (format === "csv") downloadCsv(`${base}.csv`, headers, rows);
  else await downloadXlsx(`${base}.xlsx`, "Performance", headers, rows);
};

export interface StatementDoc {
  school: { name: string; currency: string }; student: { name: string; admission_number: string | null };
  invoices: { number: string; title: string; term: string | null; year: string | null; issued_on: string; due_on: string; total: number; paid: number; status: string;
    payments: { receipt: string; amount: number; method: string; paid_on: string; status: string }[] }[];
}

/** Every invoice and payment of one student, with the outstanding balance. Only counted payments are listed as paid. */
export const statementPdf = (d: StatementDoc) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const cur = d.school.currency;
  const y0 = pageHeader(doc, { ...d.school, logo_url: null }, "Fee statement", [`Student: ${d.student.name}${d.student.admission_number ? `   Admission no.: ${d.student.admission_number}` : ""}`, `Printed: ${dayText(new Date().toISOString())}`]);
  const live = d.invoices.filter((i) => i.status !== "cancelled");
  autoTable(doc, {
    startY: y0 + 2, head: [["Invoice", "Period", "Due", "Total", "Paid", "Balance"]],
    body: live.length ? live.map((i) => [`${i.number} ${i.title}`, [i.year, i.term].filter(Boolean).join(" ") || "-", dayText(i.due_on), cash(i.total, cur), cash(i.paid, cur), cash(i.total - i.paid, cur)]) : [[{ content: "No invoices", colSpan: 6 }]],
    styles: { fontSize: 8.5, cellPadding: 2 }, headStyles: { fillColor: [30, 64, 175] }, columnStyles: { 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } }, margin: { left: 14, right: 14, bottom: 16 },
  });
  const pays = live.flatMap((i) => i.payments.filter((p) => p.status === "recorded").map((p) => [p.receipt, dayText(p.paid_on), i.number, methodText(p.method), cash(p.amount, cur)]));
  const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y0;
  doc.setFont("helvetica", "bold").setFontSize(10).text("Payments received", 14, last + 9);
  autoTable(doc, {
    startY: last + 11, head: [["Receipt", "Date", "Invoice", "Method", "Amount"]], body: pays.length ? pays : [[{ content: "No payments yet", colSpan: 5 }]],
    styles: { fontSize: 8.5, cellPadding: 2 }, headStyles: { fillColor: [71, 85, 105] }, columnStyles: { 4: { halign: "right" } }, margin: { left: 14, right: 14, bottom: 16 },
  });
  const end = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? last;
  const owed = live.reduce((n, i) => n + (i.total - i.paid), 0);
  doc.setFont("helvetica", "bold").setFontSize(11).text(`Total outstanding: ${cash(owed, cur)}`, 14, Math.min(end + 10, 285));
  doc.save(`fee-statement-${d.student.name.replace(/\W+/g, "-").toLowerCase()}.pdf`);
};
