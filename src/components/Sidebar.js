'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

const navSections = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard' },
    ],
  },
  {
    title: 'Management',
    items: [
      { label: 'Users', href: '/users' },
      { label: 'Moderation', href: '/moderation' },
      { label: 'Clubs', href: '/clubs' },
    ],
  },
  {
    title: 'Commerce',
    items: [
      { label: 'Books', href: '/books' },
      { label: 'Orders', href: '/orders' },
    ],
  },
  {
    title: 'Engagement',
    items: [
      { label: 'Notifications', href: '/notifications' },
      { label: 'Referrals', href: '/referrals' },
      { label: 'Analytics', href: '/analytics' },
    ],
  },
  {
    title: 'Support',
    items: [
      { label: 'Support Tickets', href: '/support' },
      { label: 'Content', href: '/content' },
      { label: 'Settings', href: '/settings' },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar" id="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">E</div>
        <span className="sidebar-logo-text">ENARV</span>
      </div>

      <nav className="sidebar-nav">
        {navSections.map((section) => (
          <div key={section.title}>
            <div className="sidebar-section-title">{section.title}</div>
            {section.items.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`sidebar-link ${isActive ? 'active' : ''}`}
                  id={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <span className="icon">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
