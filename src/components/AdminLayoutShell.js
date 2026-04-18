'use client';

import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { ToastProvider } from '@/components/Toast';

export default function AdminLayoutShell({ children }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login' || pathname === '/';

  return (
    <ToastProvider>
      {isLoginPage ? (
        children
      ) : (
        <div className="admin-layout">
          <Sidebar />
          <div className="admin-main">
            <Header />
            <main className="admin-content">{children}</main>
          </div>
        </div>
      )}
    </ToastProvider>
  );
}
