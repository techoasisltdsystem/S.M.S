import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";

export interface FileInfo { id: string; name: string; mime: string; size: number }

export interface MyAssignment {
  assessment_id: string;
  title: string;
  subject_name: string;
  class_name: string;
  kind: string;
  submission_format: string;
  starts_at: string | null;
  deadline_at: string | null;
  duration_minutes: number | null;
  max_score: number;
  attempts_allowed: number;
  attempts_used: number;
  submission_id: string | null;
  submission_status: string | null;
  submitted_at: string | null;
  is_late: boolean;
}

export interface AssignmentDetail {
  assessment: {
    id: string; title: string; kind: string; description: string | null; instructions: string | null; max_score: number;
    starts_at: string | null; deadline_at: string | null; duration_minutes: number | null; submission_format: string;
    allowed_file_types: string[]; max_file_mb: number; max_files: number; late_policy: string; late_penalty_percent: number | null;
    attempts_allowed: number; rubric: { criterion: string; points: number }[]; released_at: string | null; subject: string; class: string;
  };
  files: FileInfo[];
  submission: null | {
    id: string; attempt: number; status: string; text_answer: string | null; due_by: string | null; submitted_at: string | null;
    is_late: boolean; return_note: string | null; receipt: string; files: FileInfo[];
  };
}

export interface SubmissionRow {
  student_id: string;
  student_name: string;
  submission_id: string | null;
  attempt: number | null;
  status: string;
  submitted_at: string | null;
  is_late: boolean;
  files: number;
  has_text: boolean;
  attempts_used: number;
}

export interface SubmissionDetail {
  id: string; attempt: number; status: string; student: string; text_answer: string | null; submitted_at: string | null;
  is_late: boolean; due_by: string | null; return_note: string | null; late_policy: string; late_penalty_percent: number | null;
  rubric: { criterion: string; points: number }[]; files: FileInfo[];
}

const must = <T,>(res: { data: T | null; error: { message: string } | null }): T => {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
};

export const useMyAssignments = (schoolId: string, enabled = true) =>
  useQuery({
    queryKey: ["my-assignments", schoolId],
    enabled: !!schoolId && enabled,
    refetchInterval: 60_000,
    queryFn: async (): Promise<MyAssignment[]> => (must(await db.rpc("my_assignments", { _school: schoolId })) ?? []) as MyAssignment[],
  });

export const useAssignment = (assessmentId: string | null) =>
  useQuery({
    queryKey: ["assignment", assessmentId],
    enabled: !!assessmentId,
    queryFn: async (): Promise<AssignmentDetail> => must(await db.rpc("get_assignment", { _assessment: assessmentId! })) as unknown as AssignmentDetail,
  });

export const useAssessmentSubmissions = (assessmentId: string | null, enabled = true) =>
  useQuery({
    queryKey: ["assessment-submissions", assessmentId],
    enabled: !!assessmentId && enabled,
    refetchInterval: 30_000,
    queryFn: async (): Promise<SubmissionRow[]> => (must(await db.rpc("assessment_submissions", { _assessment: assessmentId! })) ?? []) as SubmissionRow[],
  });

export const useSubmissionDetail = (submissionId: string | null) =>
  useQuery({
    queryKey: ["submission", submissionId],
    enabled: !!submissionId,
    queryFn: async (): Promise<SubmissionDetail> => must(await db.rpc("get_submission", { _submission: submissionId! })) as unknown as SubmissionDetail,
  });

export const useAssignmentActions = () => {
  const qc = useQueryClient();
  const refresh = () => {
    ["my-assignments", "assignment", "assessment-submissions", "submission", "assessments", "notifications", "unread-notifications"]
      .forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };
  return {
    release: useMutation({
      mutationFn: async (v: { assessmentId: string; release: boolean }) => {
        must(await db.rpc("release_assessment", { _assessment: v.assessmentId, _release: v.release }));
      },
      onSuccess: refresh,
    }),
    attach: useMutation({
      mutationFn: async (v: { assessmentId: string; name: string; b64: string }) =>
        must(await db.rpc("add_assessment_file", { _assessment: v.assessmentId, _name: v.name, _b64: v.b64 })),
      onSuccess: refresh,
    }),
    removeFile: useMutation({
      mutationFn: async (fileId: string) => {
        must(await db.rpc("remove_file", { _file: fileId }));
      },
      onSuccess: refresh,
    }),
    start: useMutation({
      mutationFn: async (assessmentId: string) => must(await db.rpc("start_submission", { _assessment: assessmentId })),
      onSuccess: refresh,
    }),
    save: useMutation({
      mutationFn: async (v: { submissionId: string; text: string }) => {
        must(await db.rpc("save_submission", { _submission: v.submissionId, _text: v.text }));
      },
    }),
    upload: useMutation({
      mutationFn: async (v: { submissionId: string; name: string; b64: string }) =>
        must(await db.rpc("add_submission_file", { _submission: v.submissionId, _name: v.name, _b64: v.b64 })),
      onSuccess: refresh,
    }),
    submit: useMutation({
      mutationFn: async (submissionId: string) =>
        must(await db.rpc("submit_submission", { _submission: submissionId })) as unknown as {
          receipt: string; status: string; submitted_at: string; late: boolean; files: number; penalty_percent: number | null;
        },
      onSuccess: refresh,
    }),
    returnWork: useMutation({
      mutationFn: async (v: { submissionId: string; note: string }) => {
        must(await db.rpc("return_submission", { _submission: v.submissionId, _note: v.note }));
      },
      onSuccess: refresh,
    }),
  };
};

export interface HomeworkSummary { assignments: number; total: number; submitted: number; pending: number; overdue: number }
/** How much of the homework this teacher can mark has come in (counts only). */
export const useHomeworkSummary = (schoolId: string, enabled = true) =>
  useQuery({
    queryKey: ["homework-summary", schoolId], enabled: !!schoolId && enabled, staleTime: 30_000,
    queryFn: async (): Promise<HomeworkSummary> => {
      const { data, error } = await (db.rpc as unknown as (fn: string, a: object) => PromiseLike<{ data: unknown; error: { message: string } | null }>)("teacher_homework_summary", { _school: schoolId });
      if (error) throw new Error(error.message);
      return data as HomeworkSummary;
    },
  });
