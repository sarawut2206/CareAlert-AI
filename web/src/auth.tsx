import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getToken, setToken } from './api';

export type Role = 'student' | 'teacher' | 'counselor' | 'admin' | 'director';

export type User = {
  id: number;
  role: Role;
  username: string;
  displayName: string;
  mustChangePassword: boolean;
};

export type StudentInfo = {
  id: number;
  studentCode: string;
  classroom: string | null;
  hasConsent: boolean;
};

type AuthValue = {
  user: User | null;
  student: StudentInfo | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthValue>(null as unknown as AuthValue);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    if (!getToken()) { setUser(null); setStudent(null); setLoading(false); return; }
    try {
      const data = await api<{ user: User; student: StudentInfo | null }>('/auth/me');
      setUser(data.user);
      setStudent(data.student);
    } catch {
      setToken(null);
      setUser(null);
      setStudent(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function login(username: string, password: string) {
    const data = await api<{ token: string; user: User }>('/auth/login', {
      method: 'POST', body: { username, password },
    });
    setToken(data.token);
    await refresh();
  }

  function logout() {
    setToken(null);
    setUser(null);
    setStudent(null);
  }

  return (
    <AuthContext.Provider value={{ user, student, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

/** บุคลากรที่ทำงานกับเคสรายบุคคลได้ (director ไม่รวม — เห็นเฉพาะภาพรวม) */
export const isStaff = (role?: Role) => role === 'teacher' || role === 'counselor' || role === 'admin';

/** ผู้บริหาร — เห็นแดชบอร์ดรวมทั้งโรงเรียน แต่ไม่เห็นข้อมูลนักเรียนรายคน */
export const isExecutive = (role?: Role) => role === 'director';
