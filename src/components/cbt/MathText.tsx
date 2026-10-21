import { Fragment, useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/utils";

// $...$ is an inline equation and $$...$$ a displayed one; \$ is a plain dollar sign.
const SPLIT = /(\$\$[\s\S]+?\$\$|(?<!\\)\$[^$\n]+?(?<!\\)\$)/g;

/** Question text with LaTeX equations drawn by KaTeX. Everything outside the dollars stays plain text, and KaTeX is not trusted with links or HTML. */
const MathText = ({ text, className }: { text: string; className?: string }) => {
  const parts = useMemo(() => text.split(SPLIT).map((p) => {
    const display = p.startsWith("$$") && p.endsWith("$$") && p.length > 4;
    const inline = !display && p.length > 2 && p.startsWith("$") && p.endsWith("$");
    if (!display && !inline) return { text: p.replace(/\\\$/g, "$") };
    try {
      return { html: katex.renderToString(p.slice(display ? 2 : 1, display ? -2 : -1), { displayMode: display, throwOnError: false, trust: false, strict: "ignore", maxSize: 20, maxExpand: 200 }) };
    } catch { return { text: p }; }
  }), [text]);
  return (
    <span className={cn("whitespace-pre-wrap", className)}>
      {parts.map((p, i) => "html" in p ? <span key={i} dangerouslySetInnerHTML={{ __html: p.html! }} /> : <Fragment key={i}>{p.text}</Fragment>)}
    </span>
  );
};

export default MathText;
