import { redirect } from 'next/navigation';
import AdminClient from '../../components/AdminClient';
import { createAdminSupabaseClient } from '../../lib/supabase/admin';
import { createServerSupabaseClient } from '../../lib/supabase/server';

function testModeAdmin() {
  return process.env.ADMIN_TEST_MODE === 'true' && (process.env.VERCEL_ENV ?? 'development') !== 'production';
}

export default async function AdminPage() {
  if (!testModeAdmin()) {
    const server = createServerSupabaseClient();
    const admin = createAdminSupabaseClient();
    const { data: { user } } = await server.auth.getUser();
    if (!user) redirect('/login');

    const { data: profile } = await admin.from('profiles').select('role').eq('user_id', user.id).maybeSingle();
    if (profile?.role !== 'ADMIN') redirect('/');
  }

  return <AdminClient />;
}
