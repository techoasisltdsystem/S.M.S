export const errorText = (err: unknown, fallback = "Try again.") =>
  err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : fallback;

export const AUDIENCES = [
  { value: "everyone", label: "Everyone" },
  { value: "staff", label: "Staff only" },
  { value: "students", label: "Students" },
  { value: "parents", label: "Parents" },
] as const;

const pad = (n: number) => String(n).padStart(2, "0");

/** Local YYYY-MM-DD of an ISO timestamp. */
export const localDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Value for a datetime-local input, in the viewer's time zone. */
export const toLocalInput = (iso: string) => `${localDate(iso)}T${pad(new Date(iso).getHours())}:${pad(new Date(iso).getMinutes())}`;
