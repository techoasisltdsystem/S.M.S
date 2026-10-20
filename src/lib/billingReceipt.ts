import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { day, money, stamp, type Interval } from "@/hooks/useBilling";

export interface ReceiptData {
  reference: string; status: string; school: string | null; plan: string; interval: Interval; currency: string;
  base_minor: number; tax_minor: number; total_minor: number; tax_label: string | null; channel: string | null;
  paid_at: string | null; period_start: string | null; period_end: string | null; demo: boolean;
}

/** A receipt exists only for a payment the server has verified. Anything else is refused. */
export const billingReceiptPdf = (r: ReceiptData, business: string, support?: string | null) => {
  if (r.status !== "paid" || !r.paid_at) throw new Error("A receipt is only available for a verified payment.");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setFontSize(18); doc.setFont("helvetica", "bold"); doc.text(business, 14, 20);
  doc.setFontSize(11); doc.setFont("helvetica", "normal"); doc.text("Subscription receipt", 14, 27);
  if (r.demo) {
    doc.setTextColor(200, 30, 30); doc.setFont("helvetica", "bold");
    doc.text("DEMO PAYMENT - NOT A REAL TRANSACTION", 14, 35);
    doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "normal");
  }
  autoTable(doc, {
    startY: 42, theme: "plain", styles: { fontSize: 10, cellPadding: 2 }, columnStyles: { 0: { fontStyle: "bold", cellWidth: 55 } }, margin: { left: 14, right: 14 },
    body: [
      ["Receipt for", r.school ?? "-"],
      ["Transaction reference", r.reference],
      ["Package", `${r.plan} (${r.interval === "yearly" ? "yearly" : "monthly"})`],
      ["Subscription period", `${day(r.period_start)} to ${day(r.period_end)}`],
      ["Payment method", r.channel ? r.channel.replace(/_/g, " ") : "-"],
      ["Paid on", stamp(r.paid_at)],
      ["Status", "Paid (verified)"],
    ],
  });
  const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  autoTable(doc, {
    startY: y, head: [["Description", "Amount"]], styles: { fontSize: 10 }, headStyles: { fillColor: [30, 64, 175] }, margin: { left: 14, right: 14 },
    columnStyles: { 1: { halign: "right" } },
    body: [
      [`${r.plan} subscription`, money(r.base_minor, r.currency)],
      ...(r.tax_minor > 0 ? [[r.tax_label ?? "Tax", money(r.tax_minor, r.currency)]] : []),
      [{ content: "Total paid", styles: { fontStyle: "bold" } }, { content: money(r.total_minor, r.currency), styles: { fontStyle: "bold" } }],
    ],
  });
  doc.setFontSize(9); doc.setTextColor(110, 110, 110);
  doc.text(support ? `Questions? ${support}` : "Questions? Contact support.", 14, 280);
  doc.save(`receipt-${r.reference}.pdf`);
};
