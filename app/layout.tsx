import Link from 'next/link';

import './globals.css';
import NavTabs from '../components/NavTabs';
import ViewModeSwitcher from '../components/ViewModeSwitcher';
import { Role } from '../lib/types';

export const metadata = {
  title: 'Emerald Coast Roller League',
  description: 'ECRL PWA MVP'
};

const role: Role = 'ADMIN';
const logoSrc =
  'https://fsmbogksjimrmfjzxrlx.supabase.co/storage/v1/object/public/images/ecrl%20logo.PNG';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="site-header-inner">
            <img className="logo-mark" src={logoSrc} alt="Emerald Coast Roller League logo" />
            <NavTabs role={role} />
            <div className="header-actions">
              <ViewModeSwitcher />
              <div className="bucks-pill">$150 BB</div>
              <Link className="header-auth-link" href="/register">Register</Link>
              <Link className="header-auth-link" href="/login">Login</Link>
            </div>
          </div>
        </header>

        <div className="app-shell">{children}</div>
      </body>
    </html>
  );
}
