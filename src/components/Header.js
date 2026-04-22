'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { getAdminUser, clearTokens } from '@/lib/api';

const pageTitles = {
  '/dashboard': { title: 'Dashboard', subtitle: 'Platform overview at a glance' },
  '/users': { title: 'Users', subtitle: 'Manage registered users' },
  '/moderation': { title: 'Content Moderation', subtitle: 'Moderate posts, comments & stories' },
  '/clubs': { title: 'Clubs', subtitle: 'Manage community clubs' },
  '/books': { title: 'Books Inventory', subtitle: 'Manage book catalog & stock' },
  '/orders': { title: 'Orders', subtitle: 'Manage e-commerce orders' },
  '/notifications': { title: 'Notifications', subtitle: 'Send push notifications' },
  '/referrals': { title: 'Referrals', subtitle: 'Track referral activity' },
  '/analytics': { title: 'Analytics', subtitle: 'Platform insights & trends' },
  '/support': { title: 'Support Tickets', subtitle: 'Manage customer support' },
  '/content': { title: 'Content Manager', subtitle: 'Manage blogs, banners & announcements' },
  '/settings': { title: 'System Settings', subtitle: 'Platform configuration' },
};

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);

  useEffect(() => {
    setUser(getAdminUser());
  }, []);

  const page = pageTitles[pathname] || pageTitles[Object.keys(pageTitles).find(k => pathname?.startsWith(k))] || { title: 'Admin', subtitle: '' };

  const handleLogout = () => {
    clearTokens();
    router.push('/login');
  };

  return (
    <header className="header" id="header">
      <div className="header-left">
        <div>
          <div className="header-title">{page.title}</div>
          {page.subtitle && <div className="header-subtitle">{page.subtitle}</div>}
        </div>
      </div>
      <div className="header-right">
        <button className="btn btn-ghost btn-sm" onClick={handleLogout} id="logout-btn">
          Logout
        </button>
        <div className="header-avatar" title={user?.email || 'Admin'} id="header-avatar">
          {user?.email?.charAt(0).toUpperCase() || 'A'}
        </div>
      </div>
    </header>
  );
}
