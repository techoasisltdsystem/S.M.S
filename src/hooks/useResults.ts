import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import type { Database, Json } from "@/integrations/supabase/types";

type Tables = Database["public"]["Tables"];
export type Correction = Tables["result_corrections"]["Row"];
export type ResultVersion = Tables["result_versions"]["Row"];
export type GradeBand = Tables["grade_bands"]["Row"];

export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
  read_at: string | null;
}

const must = <T,>(res: { data: T | null; error: { message: string } | null }): T => {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
};

const POLL_MS = 30_000;

export const useCorrections = (schoolId: string, enabled = true) =>
  useQuery({
    queryKey: ["corrections", schoolId],
    enabled: !!schoolId && enabled,
    queryFn: async (): Promise<Correction[]> =>
      must(await db.from("result_corrections").select("*").eq("school_id", schoolId).order("requested_at", { ascending: false })) ?? [],
  });

export const useVersions = (assessmentId: string | null, studentId: string | null) =>
  useQuery({
    queryKey: ["versions", assessmentId, studentId],
    enabled: !!assessmentId && !!studentId,
    queryFn: async (): Promise<ResultVersion[]> =>
      must(await db.from("result_versions").select("*").eq("assessment_id", assessmentId!).eq("student_id", studentId!).order("version", { ascending: false })) ?? [],
  });

export const useGradeBands = (schoolId: string) =>
  useQuery({
    queryKey: ["grade-bands", schoolId],
    enabled: !!schoolId,
    staleTime: 60_000,
    queryFn: async (): Promise<GradeBand[]> =>
      must(await db.from("grade_bands").select("*").eq("school_id", schoolId).order("min_percent", { ascending: false })) ?? [],
  });

export interface ResultsPolicy {
  results_approval_required: boolean;
  correction_approval_required: boolean;
}
export const useResultsPolicy = (schoolId: string, enabled = true) =>
  useQuery({
    queryKey: ["results-policy", schoolId],
    enabled: !!schoolId && enabled,
    queryFn: async (): Promise<ResultsPolicy> => {
      const data = must(await db.from("school_config").select("results_approval_required, correction_approval_required").eq("school_id", schoolId).maybeSingle());
      return { results_approval_required: data?.results_approval_required ?? true, correction_approval_required: data?.correction_approval_required ?? true };
    },
  });

export const useNotifications = (schoolId: string) =>
  useQuery({
    queryKey: ["notifications", schoolId],
    enabled: !!schoolId,
    refetchInterval: POLL_MS,
    queryFn: async (): Promise<AppNotification[]> => must(await db.rpc("my_notifications", { _school: schoolId, _limit: 100 })) ?? [],
  });

export const useUnreadNotifications = (schoolId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ["unread-notifications", schoolId],
    enabled: !!schoolId && enabled,
    refetchInterval: POLL_MS,
    queryFn: async (): Promise<number> => must(await db.rpc("unread_notification_count", { _school: schoolId! })) ?? 0,
  });

export const useResultsActions = (schoolId: string) => {
  const qc = useQueryClient();
  const refreshResults = () => {
    ["marks", "assessments", "corrections", "versions", "notifications", "unread-notifications"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    qc.invalidateQueries({ queryKey: ["standing"] });
  };
  return {
    request: useMutation({
      mutationFn: async (v: { assessmentId: string; studentId: string; score: number; comment: string; reason: string }) =>
        must(await db.rpc("request_correction", { _assessment: v.assessmentId, _student: v.studentId, _new_score: v.score, _new_comment: v.comment, _reason: v.reason })),
      onSuccess: refreshResults,
    }),
    decide: useMutation({
      mutationFn: async (v: { id: string; approve: boolean; note: string }) => {
        must(await db.rpc("decide_correction", { _correction: v.id, _approve: v.approve, _note: v.note }));
      },
      onSuccess: refreshResults,
    }),
    setPolicy: useMutation({
      mutationFn: async (patch: Partial<ResultsPolicy>) => {
        const { error } = await db.from("school_config").update(patch).eq("school_id", schoolId);
        if (error) throw new Error(error.message);
      },
      onSuccess: () => qc.invalidateQueries({ queryKey: ["results-policy", schoolId] }),
    }),
    setBands: useMutation({
      mutationFn: async (bands: { min_percent: number; grade: string; remark?: string }[]) => {
        must(await db.rpc("set_grade_bands", { _school: schoolId, _bands: bands as unknown as Json }));
      },
      onSuccess: () => qc.invalidateQueries({ queryKey: ["grade-bands", schoolId] }),
    }),
    markRead: useMutation({
      mutationFn: async (id?: string) => {
        must(await db.rpc("mark_notifications_read", { _school: schoolId, _id: id }));
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["notifications", schoolId] });
        qc.invalidateQueries({ queryKey: ["unread-notifications", schoolId] });
      },
    }),
  };
};
