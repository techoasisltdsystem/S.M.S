import React, { createContext, useContext, useState, ReactNode } from "react";

export type UserRole = "admin" | "teacher" | "student" | "parent";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string, role: UserRole) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Mock users for demo
const MOCK_USERS: Record<UserRole, User> = {
  admin: { id: "1", name: "Dr. Sarah Mitchell", email: "admin@techoasis.edu", role: "admin" },
  teacher: { id: "2", name: "Mr. James Wilson", email: "teacher@techoasis.edu", role: "teacher" },
  student: { id: "3", name: "Emily Johnson", email: "student@techoasis.edu", role: "student" },
  parent: { id: "4", name: "Michael Johnson", email: "parent@techoasis.edu", role: "parent" },
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);

  const login = async (_email: string, _password: string, role: UserRole) => {
    // Mock login - replace with real auth later
    await new Promise((resolve) => setTimeout(resolve, 800));
    setUser(MOCK_USERS[role]);
  };

  const logout = () => setUser(null);

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
