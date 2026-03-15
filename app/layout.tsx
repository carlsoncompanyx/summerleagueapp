import Link from 'next/link';

import './globals.css';
import NavTabs from '../components/NavTabs';
import { createAdminSupabaseClient } from '../lib/supabase/admin';
import { createServerSupabaseClient } from '../lib/supabase/server';
import { Role } from '../lib/types';
import { socialDisplayName } from '../lib/profiles/display';

export const metadata = {
  title: 'Emerald Coast Roller League',
  description: 'ECRL PWA MVP'
};

const logoSrc =
  'https://fsmbogksjimrmfjzxrlx.supabase.co/storage/v1/object/public/images/ecrl%20logo.PNG';

async function getHeaderSession() {
  if (process.env.NEXT_PUBLIC_ADMIN_TEST_MODE === 'true' && (process.env.VERCEL_ENV ?? 'development') !== 'production') {
    const admin = createAdminSupabaseClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('user_id, role, first_name, last_name, display_name')
      .limit(1)
      .maybeSingle();

    return {
      role: (profile?.role ?? 'ADMIN') as Role,
      isAuthenticated: true,
      label: socialDisplayName(profile as any),
    };
  }

  try {
    const server = createServerSupabaseClient();
    const admin = createAdminSupabaseClient();
    const { data: { user } } = await server.auth.getUser();
    if (!user) return { role: 'FAN' as Role, isAuthenticated: false, label: null };

    const { data: profile } = await admin
      .from('profiles')
      .select('role, first_name, last_name, display_name')
      .eq('user_id', user.id)
      .maybeSingle();

    return {
      role: (profile?.role ?? 'FAN') as Role,
      isAuthenticated: true,
      label: socialDisplayName(profile as any),
    };
  } catch {
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
