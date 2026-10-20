import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";

export interface Conversation {
  conversation_id: string;
  subject: string;
  last_message_at: string;
  last_message_preview: string | null;
  last_sender_name: string | null;
  unread_count: number;
  participants: { id: string; name: string }[];
}

export interface ThreadMessage {
  message_id: string;
  sender_id: string;
  sender_name: string;
  body: string | null;
  created_at: string;
  hidden: boolean;
  mine: boolean;
  reported: boolean;
}

export interface Recipient {
  profile_id: string;
  full_name: string;
  roles: string[];
}

export interface ModerationItem {
  message_id: string;
  conversation_id: string;
  sender_name: string;
  body: string;
  created_at: string;
  reported_at: string;
  reported_by_name: string | null;
  report_reason: string | null;
  hidden_at: string | null;
}

// There is no push channel on the laptop database, so lists refresh on a timer.
const POLL_MS = 15_000;

const must = <T,>(res: { data: T | null; error: { message: string } | null }): T => {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
};

export const useConversations = (schoolId: string) =>
  useQuery({
    queryKey: ["conversations", schoolId],
    enabled: !!schoolId,
    refetchInterval: POLL_MS,
    queryFn: async (): Promise<Conversation[]> => {
      const rows = must(await db.rpc("my_conversations", { _school: schoolId }));
      return (rows ?? []).map((r) => ({ ...r, participants: (r.participants as Conversation["participants"]) ?? [] }));
    },
  });

export const useThread = (conversationId: string | null) =>
  useQuery({
    queryKey: ["thread", conversationId],
    enabled: !!conversationId,
    refetchInterval: POLL_MS,
    queryFn: async (): Promise<ThreadMessage[]> => must(await db.rpc("conversation_thread", { _conversation: conversationId! })) ?? [],
  });

export const useRecipients = (schoolId: string, enabled: boolean) =>
  useQuery({
    queryKey: ["message-recipients", schoolId],
    enabled: !!schoolId && enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<Recipient[]> => must(await db.rpc("message_recipients", { _school: schoolId })) ?? [],
  });

export const useUnreadCount = (schoolId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ["unread-messages", schoolId],
    enabled: !!schoolId && enabled,
    refetchInterval: POLL_MS * 2,
    queryFn: async (): Promise<number> => must(await db.rpc("unread_message_count", { _school: schoolId! })) ?? 0,
  });

export const useModerationQueue = (schoolId: string, enabled: boolean) =>
  useQuery({
    queryKey: ["moderation-queue", schoolId],
    enabled: !!schoolId && enabled,
    queryFn: async (): Promise<ModerationItem[]> => must(await db.rpc("moderation_queue", { _school: schoolId })) ?? [],
  });

/** Calls that change messages, each followed by a refresh of what the screen shows. */
export const useMessagingActions = (schoolId: string) => {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["conversations", schoolId] });
    qc.invalidateQueries({ queryKey: ["unread-messages", schoolId] });
  };
  return {
    start: useMutation({
      mutationFn: async (v: { recipients: string[]; subject: string; body: string }) =>
        must(await db.rpc("start_conversation", { _school: schoolId, _recipients: v.recipients, _subject: v.subject, _body: v.body })),
      onSuccess: refresh,
    }),
    send: useMutation({
      mutationFn: async (v: { conversationId: string; body: string }) =>
        must(await db.rpc("send_message", { _conversation: v.conversationId, _body: v.body })),
      onSuccess: (_d, v) => {
        qc.invalidateQueries({ queryKey: ["thread", v.conversationId] });
        refresh();
      },
    }),
    markRead: useMutation({
      mutationFn: async (conversationId: string) => {
        must(await db.rpc("mark_conversation_read", { _conversation: conversationId }));
      },
      onSuccess: refresh,
    }),
    report: useMutation({
      mutationFn: async (v: { messageId: string; conversationId: string; reason: string }) => {
        must(await db.rpc("report_message", { _message: v.messageId, _reason: v.reason }));
      },
      onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["thread", v.conversationId] }),
    }),
    hide: useMutation({
      mutationFn: async (v: { messageId: string; reason: string }) => {
        must(await db.rpc("hide_message", { _message: v.messageId, _reason: v.reason }));
      },
      onSuccess: () => qc.invalidateQueries({ queryKey: ["moderation-queue", schoolId] }),
    }),
  };
};
