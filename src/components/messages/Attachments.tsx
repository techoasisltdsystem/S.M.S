import { useEffect, useRef, useState } from "react";
import { FileText, ImageIcon, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ATTACH_MAX_FILES, ATTACH_MAX_MB, ATTACH_TYPES, attachProblem, type MessageFile } from "@/hooks/useMessaging";
import { downloadStoredFile, formatBytes, messageFileUrl } from "@/lib/files";
import { cn } from "@/lib/utils";

/** Paperclip button and the list of files chosen for the next message. */
export const AttachmentInput = ({ files, setFiles, disabled }: { files: File[]; setFiles: (f: File[]) => void; disabled?: boolean }) => {
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);

  const add = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      const problem = attachProblem(f);
      if (problem) { toast({ title: "File not added", description: problem, variant: "destructive" }); continue; }
      if (next.length >= ATTACH_MAX_FILES) { toast({ title: "Too many files", description: `A message can carry at most ${ATTACH_MAX_FILES} files.`, variant: "destructive" }); break; }
      next.push(f);
    }
    setFiles(next);
    if (input.current) input.current.value = "";
  };

  return (
    <div className="min-w-0">
      <input ref={input} type="file" multiple hidden accept={ATTACH_TYPES.map((t) => `.${t}`).join(",")} onChange={(e) => add(e.target.files)} />
      <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" disabled={disabled || files.length >= ATTACH_MAX_FILES}
        onClick={() => input.current?.click()} aria-label="Attach a file or image" title={`Images, PDF and Office files up to ${ATTACH_MAX_MB} MB`}>
        <Paperclip className="h-4 w-4" aria-hidden />
      </Button>
      {files.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2" aria-label="Files to send">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex max-w-[14rem] items-center gap-1.5 rounded-full bg-muted py-1 pl-3 pr-1 text-xs">
              <span className="truncate">{f.name}</span><span className="shrink-0 text-muted-foreground">{formatBytes(f.size)}</span>
              <button type="button" onClick={() => setFiles(files.filter((_, n) => n !== i))} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full hover:bg-background" aria-label={`Remove ${f.name}`}><X className="h-3 w-3" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const Thumb = ({ file }: { file: MessageFile }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    let made: string | null = null;
    messageFileUrl(file.file_id).then((u) => { made = u; if (live) setUrl(u); else URL.revokeObjectURL(u); }).catch(() => live && setFailed(true));
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [file.file_id]);
  if (failed) return <span className="flex h-24 w-32 items-center justify-center rounded-lg bg-background/30 text-xs">Image unavailable</span>;
  if (!url) return <span className="block h-24 w-32 animate-pulse rounded-lg bg-background/30" aria-label="Loading image" />;
  return <a href={url} target="_blank" rel="noreferrer" aria-label={`Open ${file.file_name}`}><img src={url} alt={file.file_name} className="max-h-48 max-w-full rounded-lg object-cover" /></a>;
};

/** The files and images on one message. Each is fetched on demand and re-checked by the database. */
export const MessageAttachments = ({ files, mine }: { files: MessageFile[]; mine: boolean }) => {
  const { toast } = useToast();
  if (files.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {files.map((f) => f.mime.startsWith("image/") ? (
        <Thumb key={f.file_id} file={f} />
      ) : (
        <button key={f.file_id} type="button" onClick={() => downloadStoredFile(f.file_id, "get_message_file").catch((e) => toast({ title: "Could not open the file", description: e instanceof Error ? e.message : "", variant: "destructive" }))}
          className={cn("flex max-w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs", mine ? "border-primary-foreground/30 hover:bg-primary-foreground/10" : "border-border bg-background hover:bg-accent")}>
          {f.mime.startsWith("image/") ? <ImageIcon className="h-4 w-4 shrink-0" aria-hidden /> : <FileText className="h-4 w-4 shrink-0" aria-hidden />}
          <span className="min-w-0"><span className="block truncate font-medium">{f.file_name}</span><span className="opacity-70">{formatBytes(f.size_bytes)} · Download</span></span>
        </button>
      ))}
    </div>
  );
};
