import './globals.css';
import AdminLayoutShell from '@/components/AdminLayoutShell';

export const metadata = {
  title: 'ENARV Admin Panel',
  description: 'Admin Control Panel for Enarv Platform',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AdminLayoutShell>{children}</AdminLayoutShell>
      </body>
    </html>
  );
}
