import { NextResponse } from 'next/server';

import { createAdminSupabaseClient } from '../../../../lib/supabase/admin';
import { createServerSupabaseClient } from '../../../../lib/supabase/server';

export async function GET() {
  const now = new Date().toISOString();

  const supabase = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminSupabaseClient()
    : createServerSupabaseClient();

  const { data, error } = await supabase
    .from('seasons')
    .select('id, name, registration_open_at, registration_close_at')
    .lte('registration_open_at', now)
    .gte('registration_close_at', now)
    .order('start_date', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ seasons: data ?? [] });
}
