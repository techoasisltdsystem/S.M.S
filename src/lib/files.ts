import { db } from "@/lib/db";

/** Reads a File into base64 (without the data: prefix) for the upload functions. */
export const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });

export const formatBytes = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/**
 * Downloads a stored file. The database re-checks who is asking on every call and
 * returns the content directly, so there is no link that could be shared or reused.
 */
export const downloadStoredFile = async (fileId: string) => {
  const { data, error } = await db.rpc("get_file", { _file: fileId });
  if (error) throw new Error(error.message);
  const f = data as unknown as { name: string; mime: string; content: string };
  const bytes = Uint8Array.from(atob(f.content), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: f.mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = f.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};
