import { redirect } from 'next/navigation';
import AdminClient from '../../components/AdminClient';
import { roleFromAuthUser } from '../../lib/auth/metadata';
import { createServerSupabaseClient } from '../../lib/supabase/server';
import { isAdminRole, normalizeRole } from '../../lib/roles';

function testModeAdmin() {
  return process.env.ADMIN_TEST_MODE === 'true' && (process.env.VERCEL_ENV ?? 'development') !== 'production';
}

export default async function AdminPage() {
  if (!testModeAdmin()) {
    const server = createServerSupabaseClient();
    const { data: { user } } = await server.auth.getUser();
    if (!user) redirect('/login');

    const role = roleFromAuthUser(user);
    if (!isAdminRole(role)) {
      return (
        <main>
          <h1>Admin Access Denied</h1>
          <p className="muted">Your account is logged in but is not authorized for admin access.</p>
          <ul>
            <li><strong>User email:</strong> {user.email ?? 'unknown'}</li>
            <li><strong>Role source:</strong> auth.users app metadata</li>
            <li><strong>Raw role value:</strong> {String(user.app_metadata?.role ?? user.app_metadata?.app_role ?? user.app_metadata?.ecrl_role ?? '') || '(empty)'}</li>
            <li><strong>Normalized role value:</strong> {normalizeRole(role) || '(empty)'}</li>
            <li><strong>Denial reason:</strong> role is not admin</li>
          </ul>
        </main>
      );
    }
  }

  return <AdminClient />;
}
