import { db } from "@/lib/db";

type LooseRpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

/**
 * Calls a database function and returns its result, or throws its error message.
 * The database checks every call itself; this only saves repeating the error handling.
 */
export const rpc = async <T,>(fn: string, args?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await (db.rpc as unknown as LooseRpc)(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
};
