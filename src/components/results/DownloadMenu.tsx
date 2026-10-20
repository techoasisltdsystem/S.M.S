import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2, Table } from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { exportClassResults, exportStudentReport, type ClassReport, type Format, type StudentReport } from "@/lib/reports";

type Target = { kind: "student"; studentId: string; label?: string } | { kind: "class"; classId: string; label?: string };

/**
 * One button for PDF, Excel and CSV. The data is requested from the database at
 * the moment of the click, which re-checks who is asking and records the export.
 */
const DownloadMenu = ({ target, size = "sm", label = "Download" }: { target: Target; size?: "sm" | "default"; label?: string }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const run = async (format: Format) => {
    setBusy(true);
    try {
      if (target.kind === "student") {
        const { data, error } = await db.rpc("student_report", { _student: target.studentId });
        if (error) throw new Error(error.message);
        await exportStudentReport(data as unknown as StudentReport, format);
      } else {
        const { data, error } = await db.rpc("class_results", { _class: target.classId });
        if (error) throw new Error(error.message);
        await exportClassResults(data as unknown as ClassReport, format);
      }
      toast({ title: "Download ready", description: `Your ${format.toUpperCase()} file has been saved.` });
    } catch (e) {
      toast({
        title: "Could not create the file",
        description: e instanceof Error ? e.message : "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size} disabled={busy} aria-label={target.label ? `${label}: ${target.label}` : label}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Download className="mr-2 h-4 w-4" aria-hidden />}
          {busy ? "Preparing…" : label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Published results only</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => run("pdf")}><FileText className="mr-2 h-4 w-4" /> PDF (printable)</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run("xlsx")}><FileSpreadsheet className="mr-2 h-4 w-4" /> Excel (.xlsx)</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run("csv")}><Table className="mr-2 h-4 w-4" /> CSV</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default DownloadMenu;
