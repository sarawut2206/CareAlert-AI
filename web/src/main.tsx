import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);

// ลงทะเบียน Service Worker เฉพาะฉบับ build จริง (ตอนพัฒนาไม่ลง เพื่อไม่ให้ cache บังโค้ดใหม่)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch(() => { /* ออฟไลน์ไม่ได้ก็แค่กลับไปเป็นเว็บปกติ ไม่ต้องรบกวนผู้ใช้ */ });
  });
}
