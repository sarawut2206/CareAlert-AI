import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { isStaff, useAuth } from './auth';
import { Spinner } from './components/ui';
import { HelpButton } from './components/HelpButton';

import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';

import StudentHome from './pages/student/StudentHome';
import CheckIn from './pages/student/CheckIn';
import TellUs from './pages/student/TellUs';
import FriendConcern from './pages/student/FriendConcern';
import Skills from './pages/student/Skills';
import SkillModule from './pages/student/SkillModule';

import Queue from './pages/staff/Queue';
import CaseDetail from './pages/staff/CaseDetail';
import StudentsPage from './pages/staff/StudentsPage';
import StudentProfile from './pages/staff/StudentProfile';
import StaffNote from './pages/staff/StaffNote';
import Analytics from './pages/staff/Analytics';
import RuleBook from './pages/staff/RuleBook';
import Admin from './pages/admin/Admin';

export default function App() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="app"><Spinner /></div>;
  if (!user) return <Login />;
  if (user.mustChangePassword) return <ChangePassword />;

  const staff = isStaff(user.role);

  return (
    <div className="app">
      <TopBar />
      {staff && <StaffNav role={user.role} />}

      <Routes>
        {staff ? (
          <>
            <Route path="/" element={<Queue />} />
            <Route path="/cases/:id" element={<CaseDetail />} />
            <Route path="/students" element={<StudentsPage />} />
            <Route path="/students/:id" element={<StudentProfile />} />
            <Route path="/note" element={<StaffNote />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/rules" element={<RuleBook />} />
            {user.role === 'admin' && <Route path="/admin" element={<Admin />} />}
          </>
        ) : (
          <>
            <Route path="/" element={<StudentHome />} />
            <Route path="/checkin" element={<CheckIn />} />
            <Route path="/tell" element={<TellUs />} />
            <Route path="/friend" element={<FriendConcern />} />
            <Route path="/skills" element={<Skills />} />
            <Route path="/skills/:id" element={<SkillModule />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {!staff && location.pathname !== '/help' && <HelpButton />}
    </div>
  );
}

function TopBar() {
  const { user, student, logout } = useAuth();
  return (
    <header className="topbar">
      <span className="logo-mark" aria-hidden>♡</span>
      <span className="brand">
        CareAlert AI
        <small>{user?.displayName}{student?.classroom ? ` · ${student.classroom}` : ''}</small>
      </span>
      <span className="spacer" />
      <button onClick={logout}>ออกจากระบบ</button>
    </header>
  );
}

function StaffNav({ role }: { role: string }) {
  const tabs = [
    { to: '/', label: 'คิวเคส', end: true },
    { to: '/students', label: 'นักเรียน' },
    { to: '/note', label: 'บันทึกข้อสังเกต' },
    { to: '/analytics', label: 'ภาพรวม' },
    { to: '/rules', label: 'กฎของระบบ' },
    ...(role === 'admin' ? [{ to: '/admin', label: 'ผู้ดูแลระบบ' }] : []),
  ];
  return (
    <nav className="nav-tabs">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'active' : '')}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
