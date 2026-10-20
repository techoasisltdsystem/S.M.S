import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, FileText, GraduationCap, Search, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { NAV } from "@/components/dashboard/nav";
import { useClasses, useDirectory } from "@/hooks/useSchoolData";
import { cn } from "@/lib/utils";

interface Hit { key: string; label: string; hint: string; to: string; icon: typeof Search }

/**
 * Searches what the signed-in person can already open: menu pages, classes and the school directory
 * (the directory itself only returns the people their role may see). Ctrl or Cmd + K focuses it.
 */
const GlobalSearch = () => {
  const { user, can } = useAuth();
  const nav = useNavigate();
  const school = user && user.role !== "platform" ? user.schoolId : undefined;
  const classes = useClasses(school);
  const people = useDirectory(school);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); input.current?.focus(); }
    };
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", key);
    document.addEventListener("mousedown", away);
    return () => { window.removeEventListener("keydown", key); document.removeEventListener("mousedown", away); };
  }, []);

  const hits = useMemo<Hit[]>(() => {
    const term = q.trim().toLowerCase();
    if (term.length < 2 || !user) return [];
    const pages = NAV[user.role].flatMap((g) => g.items)
      .filter((i) => (!i.permission || can(i.permission)) && i.label.toLowerCase().includes(term))
      .map((i) => ({ key: `p${i.path}`, label: i.label, hint: "Page", to: i.path, icon: FileText }));
    const cls = (classes.data ?? []).filter((c) => c.name.toLowerCase().includes(term)).slice(0, 4)
      .map((c) => ({ key: `c${c.id}`, label: c.name, hint: "Class", to: "/classes", icon: BookOpen }));
    const ppl = (people.data ?? []).filter((p) => p.full_name.toLowerCase().includes(term)).slice(0, 5)
      .map((p) => ({ key: `u${p.profile_id}`, label: p.full_name, hint: p.roles?.includes("student") ? "Student" : "Message",
        to: p.roles?.includes("student") ? "/students" : "/messages", icon: p.roles?.includes("student") ? GraduationCap : Users }));
    return [...pages, ...cls, ...ppl].slice(0, 8);
  }, [q, user, can, classes.data, people.data]);

  const go = (h: Hit) => { setOpen(false); setQ(""); nav(h.to); };

  return (
    <div ref={box} className="relative hidden w-full max-w-md md:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        ref={input}
        type="search"
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-controls="global-search-list"
        aria-label="Search pages, classes and people"
        placeholder="Search students, classes, pages…"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && hits[active]) { e.preventDefault(); go(hits[active]); }
          else if (e.key === "Escape") { setOpen(false); input.current?.blur(); }
        }}
        className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-14 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground lg:block">Ctrl K</kbd>
      {open && q.trim().length >= 2 && (
        <ul id="global-search-list" role="listbox" className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-elevated">
          {hits.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">Nothing found for &ldquo;{q.trim()}&rdquo;.</li>}
          {hits.map((h, i) => (
            <li key={h.key} role="option" aria-selected={i === active}>
              <button type="button" onMouseEnter={() => setActive(i)} onClick={() => go(h)}
                className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm", i === active && "bg-accent")}>
                <h.icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{h.label}</span>
                <span className="text-xs text-muted-foreground">{h.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default GlobalSearch;
