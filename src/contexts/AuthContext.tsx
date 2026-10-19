import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import {
  AuthError,
  currentAuthUserId,
  db,
  mfaState,
  onAuthChange,
  signIn,
  signOut,
  type MfaState,
} from "@/lib/db";
import type { Database } from "@/integrations/supabase/types";

/** The four sign-in screens and dashboard layouts. */
export type UserRole = "admin" | "teacher" | "student" | "parent";
/** A role as stored in the database for one school. */
export type MemberRole = Database["public"]["Enums"]["member_role"];

export const MEMBER_ROLE_LABEL: Record<MemberRole, string> = {
  school_admin: "School administrator",
  teacher: "Teacher",
  student: "Student",
  parent: "Parent or guardian",
  finance_officer: "Finance officer",
  auditor: "Auditor",
};

// Finance officers and auditors use the administrator layout; what they can
// open is still limited by their permissions.
const LAYOUT_FOR: Record<MemberRole, UserRole> = {
  school_admin: "admin",
  finance_officer: "admin",
  auditor: "admin",
  teacher: "teacher",
  student: "student",
  parent: "parent",
};

// Permissions the database only grants after a second sign-in factor.
const MFA_PERMISSIONS = ["users.manage", "staff.manage", "school.settings.manage", "payments.refund"];

export interface Membership {
  schoolId: string;
  schoolName: string;
  schoolSuspended: boolean;
  profileId: string;
  name: string;
  email: string;
  avatar?: string;
  memberRole: MemberRole;
  permissions: string[];
}

export interface User extends Membership {
  /** The school profile id (used as the user's id across pages). */
  id: string;
  role: UserRole;
}

interface AuthContextType {
  user: User | null;
  memberships: Membership[];
  loading: boolean;
  isAuthenticated: boolean;
  /** Signs in. `screenRole` only picks which of the user's roles to open first. */
  login: (email: string, password: string, screenRole: UserRole) => Promise<void>;
  logout: () => Promise<void>;
  switchMembership: (m: Membership) => void;
  /** Interface hint only; the database checks every request itself. */
  can: (permission: string) => boolean;
  /** Set while an administrator still has to pass the second factor. */
  mfa: MfaState | null;
  refreshMfa: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ACTIVE_KEY = "tosms.active-membership";
const keyOf = (m: Membership) => `${m.schoolId}:${m.memberRole}`;

const loadMemberships = async (): Promise<Membership[]> => {
  const { data, error } = await db.rpc("my_memberships");
  if (error) throw new AuthError("We could not load your school access. Try again.");
  return (data ?? []).map((m) => ({
    schoolId: m.school_id,
    schoolName: m.school_name,
    schoolSuspended: m.school_status === "suspended",
    profileId: m.profile_id,
    name: m.full_name,
    email: m.email ?? "",
    avatar: m.avatar_url ?? undefined,
    memberRole: m.role,
    permissions: m.permissions ?? [],
  }));
};

const toUser = (m: Membership): User => ({ ...m, id: m.profileId, role: LAYOUT_FOR[m.memberRole] });

const pick = (list: Membership[], preferred?: string | null, screenRole?: UserRole) =>
  list.find((m) => keyOf(m) === preferred) ??
  (screenRole && list.find((m) => LAYOUT_FOR[m.memberRole] === screenRole)) ??
  list[0] ??
  null;

const remember = (m: Membership | null) => {
  try {
    if (m) sessionStorage.setItem(ACTIVE_KEY, keyOf(m));
    else sessionStorage.removeItem(ACTIVE_KEY);
  } catch {
    // Storage blocked: the first membership is used after a reload.
  }
};

const remembered = () => {
  try {
    return sessionStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfa, setMfa] = useState<MfaState | null>(null);

  const refreshMfa = useCallback(async () => {
    setMfa(await mfaState());
  }, []);

  const activate = useCallback(
    async (list: Membership[], m: Membership | null) => {
      setMemberships(list);
      setUser(m ? toUser(m) : null);
      remember(m);
      if (m && m.permissions.some((p) => MFA_PERMISSIONS.includes(p))) await refreshMfa();
      else setMfa(null);
    },
    [refreshMfa],
  );

  // Restore an existing session on load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (await currentAuthUserId()) {
          const list = await loadMemberships();
          if (!cancelled) await activate(list, pick(list, remembered()));
        }
      } catch {
        if (!cancelled) await activate([], null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const stop = onAuthChange((id) => {
      if (!id) {
        setUser(null);
        setMemberships([]);
        setMfa(null);
      }
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [activate]);

  const login = async (email: string, password: string, screenRole: UserRole) => {
    await signIn(email, password);
    const list = await loadMemberships();
    if (list.length === 0) {
      await signOut();
      throw new AuthError(
        "This login has no active school access. Ask your school administrator to send you an invitation.",
      );
    }
    const m = pick(list, null, screenRole);
    await activate(list, m);
    if (m) await db.rpc("log_session_event", { _school: m.schoolId, _action: "login" });
  };

  const logout = async () => {
    if (user) await db.rpc("log_session_event", { _school: user.schoolId, _action: "logout" });
    await signOut();
    await activate([], null);
  };

  const switchMembership = (m: Membership) => {
    void activate(memberships, m);
  };

  const can = (permission: string) => !!user?.permissions.includes(permission);

  return (
    <AuthContext.Provider
      value={{
        user,
        memberships,
        loading,
        isAuthenticated: !!user,
        login,
        logout,
        switchMembership,
        can,
        mfa,
        refreshMfa,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
