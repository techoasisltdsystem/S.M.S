import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { td, th } from "@/components/kit/Dash";
import { errMsg } from "@/components/students/QueryState";
import { useToast } from "@/hooks/use-toast";
import { KIND_LABEL, type QKind } from "@/hooks/useCbt";
import { rpc } from "@/lib/rpc";
import MathText from "./MathText";

const HEADER = ["type", "question", "option_a", "option_b", "option_c", "option_d", "option_e", "option_f", "answer", "marks", "difficulty", "subject"];
const TEMPLATE = [
  HEADER,
  ["mcq", "What is $3 \\times 4$?", "7", "12", "34", "1", "", "", "B", "1", "easy", ""],
  ["true_false", "The sun rises in the east.", "", "", "", "", "", "", "true", "1", "easy", ""],
  ["short", "What is the capital of Ghana?", "", "", "", "", "", "", "Accra", "1", "easy", ""],
  ["essay", "Explain how plants make food.", "", "", "", "", "", "", "", "5", "medium", ""],
];
const KINDS: Record<string, QKind> = { mcq: "mcq", "multiple choice": "mcq", true_false: "true_false", "true/false": "true_false", tf: "true_false", short: "short", "short answer": "short", essay: "essay" };

/** RFC 4180 CSV: quoted fields may hold commas, quotes ("") and line breaks. */
const parseCsv = (text: string): string[][] => {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  const s = text.startsWith("\u{FEFF}") ? text.slice(1) : text;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
};

interface Parsed { line: number; kind: QKind | null; prompt: string; options: string[]; correct: unknown; marks: number; difficulty: string; subject_id: string | null; error: string | null }

const toRow = (cols: Record<string, string>, line: number, subjects: { id: string; name: string }[], fallback: string): Parsed => {
  const kind = KINDS[(cols.type ?? "").trim().toLowerCase()] ?? null;
  const prompt = (cols.question ?? "").trim();
  const options = ["a", "b", "c", "d", "e", "f"].map((k) => (cols[`option_${k}`] ?? "").trim()).filter(Boolean);
  const ans = (cols.answer ?? "").trim();
  const subjName = (cols.subject ?? "").trim().toLowerCase();
  const subject_id = subjName ? subjects.find((s) => s.name.toLowerCase() === subjName)?.id ?? null : fallback || null;
  const marks = cols.marks?.trim() ? Number(cols.marks) : 1;
  const difficulty = (cols.difficulty ?? "").trim().toLowerCase() || "medium";
  let correct: unknown = null; let error: string | null = null;
  if (!kind) error = `unknown type "${cols.type ?? ""}" (use mcq, true_false, short or essay)`;
  else if (prompt.length < 3) error = "the question is empty";
  else if (!subject_id) error = subjName ? `no subject called "${cols.subject}" that you teach` : "choose a subject";
  else if (!Number.isFinite(marks) || marks <= 0 || marks > 100) error = "marks must be between 0 and 100";
  else if (!["easy", "medium", "hard"].includes(difficulty)) error = "difficulty must be easy, medium or hard";
  else if (kind === "mcq") {
    if (options.length < 2) error = "a multiple-choice question needs at least two options";
    else {
      const letter = /^[a-f]$/i.test(ans) ? ans.toUpperCase().charCodeAt(0) - 65 : -1;
      const idx = letter >= 0 ? letter : options.findIndex((o) => o.toLowerCase() === ans.toLowerCase());
      if (idx < 0 || idx >= options.length) error = `answer "${ans}" is not one of the options (use the letter A–F)`; else correct = idx;
    }
  } else if (kind === "true_false") {
    if (!/^(true|false|t|f|yes|no)$/i.test(ans)) error = "answer must be true or false"; else correct = /^(true|t|yes)$/i.test(ans);
  } else if (kind === "short") {
    const acc = ans.split("|").map((a) => a.trim()).filter(Boolean);
    if (!acc.length) error = "give at least one accepted answer (separate several with |)"; else correct = acc;
  }
  return { line, kind, prompt, options: kind === "mcq" ? options : [], correct, marks, difficulty, subject_id, error };
};

const ImportQuestions = ({ sid, subjects, onClose }: { sid: string; subjects: { id: string; name: string }[]; onClose: () => void }) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [subject, setSubject] = useState(subjects[0]?.id ?? "");
  const [raw, setRaw] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const header = raw?.[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_")) ?? [];
  const rows: Parsed[] = raw ? raw.slice(1).map((r, i) => toRow(Object.fromEntries(header.map((h, j) => [h, r[j] ?? ""])), i + 2, subjects, subject)) : [];
  const bad = rows.filter((r) => r.error);

  const load = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setError("The file must be under 2 MB."); return; }
    const r = new FileReader();
    r.onload = () => {
      const parsed = parseCsv(String(r.result));
      const h = parsed[0]?.map((x) => x.trim().toLowerCase()) ?? [];
      if (!h.includes("type") || !h.includes("question")) { setError("The first row must be the column names. Download the template to see them."); setRaw(null); return; }
      if (parsed.length < 2) { setError("The file has no questions under the column names."); setRaw(null); return; }
      if (parsed.length > 501) { setError("Import at most 500 questions at a time."); setRaw(null); return; }
      setError(null); setRaw(parsed); setFileName(file.name);
    };
    r.readAsText(file);
  };

  const template = () => {
    const csv = TEMPLATE.map((l) => l.map((c) => /[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = "cbt-questions-template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const run = useMutation({
    mutationFn: () => rpc<number>("cbt_questions_import", { _school: sid, _rows: rows.map((r) => ({ subject_id: r.subject_id, kind: r.kind, prompt: r.prompt, options: r.options, correct: r.correct, marks: r.marks, difficulty: r.difficulty })) }),
    onSuccess: (n) => { toast({ title: `${n} question${n === 1 ? "" : "s"} imported` }); void qc.invalidateQueries({ queryKey: ["cbt-questions"] }); onClose(); },
    onError: (e) => setError(errMsg(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !run.isPending) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>Import questions</DialogTitle>
          <DialogDescription>Upload a CSV file (Excel and Google Sheets can save one). Every row is checked first; nothing is added unless all rows are valid.</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="imp-subj">Subject for rows with no subject column</Label>
              <select id="imp-subj" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={subject} onChange={(e) => setSubject(e.target.value)}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div className="flex items-end"><Button type="button" variant="outline" onClick={template}><Download className="mr-1 h-4 w-4" aria-hidden /> Download template</Button></div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground hover:bg-muted/40">
            <FileSpreadsheet className="h-5 w-5" aria-hidden /> {fileName ? `${fileName} · choose another file` : "Choose a CSV file"}
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => { load(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
            <li><b>type</b>: mcq, true_false, short or essay. <b>answer</b>: the option letter (A–F) for mcq; true or false; accepted answers separated by | for short; blank for essay.</li>
            <li>Equations go between dollar signs, e.g. $x^2 + 1$. Add pictures afterwards by editing the question.</li>
          </ul>
          {raw && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <p className="px-4 pt-3 text-sm font-semibold">{rows.length} question{rows.length === 1 ? "" : "s"} found{bad.length ? <span className="text-destructive"> · {bad.length} need fixing</span> : <span className="text-success"> · all valid</span>}</p>
              <table className="mt-2 w-full"><thead><tr><th className={th}>Row</th><th className={th}>Type</th><th className={th}>Question</th><th className={th}>Marks</th><th className={th}>Check</th></tr></thead>
                <tbody className="divide-y divide-border">{rows.slice(0, 200).map((r) => (
                  <tr key={r.line}><td className={`${td} text-xs text-muted-foreground`}>{r.line}</td><td className={`${td} text-xs`}>{r.kind ? KIND_LABEL[r.kind] : "-"}</td>
                    <td className={`${td} max-w-sm text-sm`}><span className="line-clamp-2"><MathText text={r.prompt} /></span></td><td className={td}>{r.marks}</td>
                    <td className={`${td} text-xs`}>{r.error ? <span className="text-destructive">{r.error}</span> : <span className="text-success">OK</span>}</td></tr>
                ))}</tbody></table>
              {rows.length > 200 && <p className="px-4 py-2 text-xs text-muted-foreground">Showing the first 200 rows.</p>}
            </div>
          )}
          {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={run.isPending}>Cancel</Button>
          <Button disabled={!raw || rows.length === 0 || bad.length > 0 || run.isPending} onClick={() => { setError(null); run.mutate(); }}>{run.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Import {rows.length || ""} question{rows.length === 1 ? "" : "s"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImportQuestions;
