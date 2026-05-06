import Link from 'next/link';

import './globals.css';
import NavTabs from '../components/NavTabs';
import { displayNameFromAuthUser, roleFromAuthUser } from '../lib/auth/metadata';
import { createServerSupabaseClient } from '../lib/supabase/server';
import { Role } from '../lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = {
  title: 'Emerald Coast Roller League',
  description: 'ECRL PWA MVP'
};

const logoSrc =
  'https://fsmbogksjimrmfjzxrlx.supabase.co/storage/v1/object/public/images/ecrl%20logo.PNG';

async function getHeaderSession() {
  if (process.env.ADMIN_TEST_MODE === 'true' && (process.env.VERCEL_ENV ?? 'development') !== 'production') {
    return {
      role: 'ADMIN' as Role,
      isAuthenticated: true,
      label: 'Test Admin',
    };
  }

  try {
    const server = createServerSupabaseClient();
    const { data: { user } } = await server.auth.getUser();
    if (!user) return { role: 'FAN' as Role, isAuthenticated: false, label: null };

    return {
      role: roleFromAuthUser(user) as Role,
      isAuthenticated: true,
      label: displayNameFromAuthUser(user),
    };
  } catch (error) {
    console.error('Header session fetch failed', error);
    return { role: 'FAN' as Role, isAuthenticated: false, label: null };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getHeaderSession();

  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="site-header-inner">
            <img className="logo-mark" src={logoSrc} alt="Emerald Coast Roller League logo" />
            <NavTabs role={session.role} />
            <div className="header-actions">
              {session.isAuthenticated ? (
                <>
                  <span className="badge">{session.label || 'Member'}</span>
                  <Link className="header-auth-link" href="/register">Account</Link>
                </>
              ) : (
                <>
                  <Link className="header-auth-link" href="/login">Join / Login</Link>
                </>
              )}
            </div>
          </div>
        </header>

        <div className="app-shell">{children}</div>
      </body>
    </html>
  );
}
