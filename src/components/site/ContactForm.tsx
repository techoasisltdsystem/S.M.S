import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Opens the visitor's email app with the message filled in, addressed to VITE_CONTACT_EMAIL.
 * Nothing is stored or sent from this page. If no address is configured the form says so
 * instead of pretending to submit.
 */
const TO = (import.meta.env.VITE_CONTACT_EMAIL as string | undefined)?.trim();

const TOPICS = ["Request a demo", "Get a quote", "General question"] as const;

const ContactForm = () => {
  const [form, setForm] = useState({ name: "", school: "", email: "", topic: TOPICS[0] as string, message: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = "Enter your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = "Enter a valid email address.";
    if (form.message.trim().length < 10) next.message = "Tell us a little more (at least 10 characters).";
    setErrors(next);
    if (Object.keys(next).length || !TO) return;

    setBusy(true);
    const body = `Name: ${form.name}\nSchool: ${form.school || "-"}\nEmail: ${form.email}\n\n${form.message}`;
    window.location.href = `mailto:${TO}?subject=${encodeURIComponent(`Tech Oasis SMS: ${form.topic}`)}&body=${encodeURIComponent(body)}`;
    setBusy(false);
    setDone(true);
  };

  const input =
    "w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary";

  const Field = ({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) => (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );

  return (
    <form onSubmit={submit} noValidate className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6">
      {!TO && (
        <p role="status" className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-foreground">
          Contact email is not set up yet, so this form can't send a message. Please check back soon.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="c-name" label="Your name" error={errors.name}>
          <input id="c-name" autoComplete="name" value={form.name} onChange={set("name")} aria-invalid={!!errors.name} aria-describedby={errors.name ? "c-name-err" : undefined} className={`${input} ${errors.name ? "border-destructive" : "border-input"}`} />
        </Field>
        <Field id="c-school" label="School (optional)">
          <input id="c-school" autoComplete="organization" value={form.school} onChange={set("school")} className={`${input} border-input`} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="c-email" label="Email" error={errors.email}>
          <input id="c-email" type="email" autoComplete="email" value={form.email} onChange={set("email")} aria-invalid={!!errors.email} aria-describedby={errors.email ? "c-email-err" : undefined} className={`${input} ${errors.email ? "border-destructive" : "border-input"}`} />
        </Field>
        <Field id="c-topic" label="I would like to">
          <select id="c-topic" value={form.topic} onChange={set("topic")} className={`${input} border-input`}>
            {TOPICS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field id="c-message" label="Message" error={errors.message}>
        <textarea id="c-message" rows={4} value={form.message} onChange={set("message")} aria-invalid={!!errors.message} aria-describedby={errors.message ? "c-message-err" : undefined} className={`${input} ${errors.message ? "border-destructive" : "border-input"}`} />
      </Field>
      <Button type="submit" className="w-full" disabled={busy || !TO}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : "Send message"}
      </Button>
      {done && (
        <p role="status" className="text-sm text-muted-foreground">
          Your email app should open with your message ready. Nothing is sent until you press Send there.
        </p>
      )}
    </form>
  );
};

export default ContactForm;
