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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
            <Sidebar isOpen={mobileMenuOpen} setIsOpen={setMobileMenuOpen} />
            <div className="admin-main">
              <Header onMenuToggle={() => setMobileMenuOpen(p => !p)} />
              <main className="admin-content">{children}</main>
            </div>
            {mobileMenuOpen && (
              <div 
                className="mobile-overlay" 
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                  background: 'rgba(0,0,0,0.5)', zIndex: 90
                }}
              />
            )}
          </div>
        )
      )}
    </ToastProvider>
  );
}

