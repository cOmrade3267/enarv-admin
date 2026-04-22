'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { ToastProvider } from '@/components/Toast';

export default function AdminLayoutShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);

  const isLoginPage = pathname === '/login' || pathname === '/login/' || pathname === '/';

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('admin_token');
      if (!token && !isLoginPage) {
        setAuthorized(false);
        setChecking(false);
        router.push('/login');
      } else {
        setAuthorized(true);
        setChecking(false);
      }
    }
  }, [isLoginPage, router]);

  if (checking && !isLoginPage) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0e1a', color: '#6366f1' }}>
        <div className="loading-spinner">Initializing session...</div>
      </div>
    );
  }

  return (
    <ToastProvider>
      {isLoginPage ? (
        children
      ) : (
        authorized && (
          <div className="admin-layout">
            <Sidebar />
            <div className="admin-main">
              <Header />
              <main className="admin-content">{children}</main>
            </div>
          </div>
        )
      )}
    </ToastProvider>
  );
}

