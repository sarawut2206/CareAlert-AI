import { useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { isExecutive, isStaff, useAuth } from './auth';
import { api, DEMO_MODE } from './api';
import { Spinner } from './components/ui';
import { HelpButton } from './components/HelpButton';
import { DemoBanner } from './components/DemoBanner';

import Login from './pages/Login';
import FirstRunSetup from './pages/FirstRunSetup';
import ChangePassword from './pages/ChangePassword';

import StudentHome from './pages/student/StudentHome';
import CheckIn from './pages/student/CheckIn';
import TellUs from './pages/student/TellUs';
import FriendConcern from './pages/student/FriendConcern';
import Skills from './pages/student/Skills';
import SkillModule from './pages/student/SkillModule';

import Queue from './pages/staff/Queue';
import ExecDashboard from './pages/staff/ExecDashboard';
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

  // ยังไม่เคยมีใครเข้าระบบสำเร็จ = ยังตั้งค่าไม่เสร็จ ให้ขึ้นหน้าตั้งค่าครั้งแรกแทนหน้าเข้าสู่ระบบ
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  useEffect(() => {
    if (user) { setNeedsSetup(false); return; }
    api<{ needsSetup: boolean }>('/auth/setup-status')
      .then((d) => setNeedsSetup(!!d.needsSetup))
      .catch(() => setNeedsSetup(false));
  }, [user]);

  if (loading || (!user && needsSetup === null)) return <div className="app"><Spinner /></div>;
  if (!user && needsSetup) return <FirstRunSetup onDone={() => setNeedsSetup(false)} />;
  if (!user) return <><DemoBannerIfDemo /><Login /></>;
  if (user.mustChangePassword) return <ChangePassword />;

  const staff = isStaff(user.role);
  const executive = isExecutive(user.role);

  return (
    <div className="app">
      <DemoBannerIfDemo />
      <TopBar />
      {(staff || executive) && <StaffNav role={user.role} />}

      <Routes>
        {executive ? (
          /* ผู้บริหารเห็นเฉพาะภาพรวม — เข้าคิวเคสและข้อมูลนักเรียนรายคนไม่ได้ */
          <>
            <Route path="/" element={<ExecDashboard />} />
            <Route path="/rules" element={<RuleBook />} />
          </>
        ) : staff ? (
          <>
            <Route path="/" element={<Queue />} />
            <Route path="/cases/:id" element={<CaseDetail />} />
            <Route path="/students" element={<StudentsPage />} />
            <Route path="/students/:id" element={<StudentProfile />} />
            <Route path="/note" element={<StaffNote />} />
            <Route path="/analytics" element={<Analytics />} />
            {['counselor', 'admin'].includes(user.role) && (
              <Route path="/executive" element={<ExecDashboard />} />
            )}
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

      {!staff && !executive && location.pathname !== '/help' && <HelpButton />}
    </div>
  );
}

function DemoBannerIfDemo() {
  return DEMO_MODE ? <DemoBanner /> : null;
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
  const tabs = role === 'director'
    ? [
        { to: '/', label: 'แดชบอร์ดผู้บริหาร', end: true },
        { to: '/rules', label: 'กฎของระบบ' },
      ]
    : [
        { to: '/', label: 'คิวเคส', end: true },
        { to: '/students', label: 'นักเรียน' },
        { to: '/note', label: 'บันทึกข้อสังเกต' },
        { to: '/analytics', label: 'ภาพรวม' },
        ...(['counselor', 'admin'].includes(role) ? [{ to: '/executive', label: 'สรุปผู้บริหาร' }] : []),
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
