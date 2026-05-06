import { NextRequest, NextResponse } from 'next/server';
import { displayNameFromAuthUser, listAuthUserProfiles, roleFromAuthUser } from '../../../lib/auth/metadata';
import { createAdminSupabaseClient } from '../../../lib/supabase/admin';
import { createServerSupabaseClient } from '../../../lib/supabase/server';
import { isAdminRole, normalizeRole } from '../../../lib/roles';

function testModeAdmin() {
  return process.env.ADMIN_TEST_MODE === 'true' && (process.env.VERCEL_ENV ?? 'development') !== 'production';
}

async function currentUser() {
  const admin = createAdminSupabaseClient();
  if (testModeAdmin()) {
    const { profiles } = await listAuthUserProfiles(admin);
    const profile = profiles[0];
    if (!profile?.user_id) return null;
    return { id: profile.user_id, admin: true, role: 'ADMIN', displayName: profile.display_name || profile.email || `User ${profile.user_id.slice(0, 8)}` };
  }

  const server = createServerSupabaseClient();
  const { data: { user } } = await server.auth.getUser();
  if (!user) return null;
  const role = roleFromAuthUser(user);
  return {
    id: user.id,
    admin: isAdminRole(role),
    role: normalizeRole(role),
    displayName: displayNameFromAuthUser(user),
  };
}

function authMetadataName(profile: any) {
  const display = String(profile?.display_name ?? '').trim();
  if (display) return display;
  const full = `${String(profile?.first_name ?? '').trim()} ${String(profile?.last_name ?? '').trim()}`.trim();
  return full || null;
}

function shortUserId(userId: string | null | undefined) {
  return userId ? `User ${userId.slice(0, 8)}` : 'Member';
}

function cleanText(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

export async function GET(req: NextRequest) {
  const seasonId = req.nextUrl.searchParams.get('season_id');
  const admin = createAdminSupabaseClient();
  const actor = await currentUser();

  let chatQ = admin.from('chat_messages').select('*').order('created_at', { ascending: false }).limit(60);
  if (seasonId) chatQ = chatQ.eq('season_id', seasonId);

  const chat = await chatQ;
  if (chat.error) return NextResponse.json({ error: chat.error.message }, { status: 500 });

  const authorIds = Array.from(new Set((chat.data ?? []).map((row: any) => row.user_id).filter(Boolean)));
  const [{ profiles }, playersRes] = await Promise.all([
    listAuthUserProfiles(admin, authorIds),
    authorIds.length ? admin.from('players').select('user_id,name').in('user_id', authorIds) : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  if (playersRes.error) return NextResponse.json({ error: playersRes.error.message }, { status: 500 });

  const profileById = new Map(profiles.map((profile: any) => [profile.user_id, profile]));
  const playerNameByUser = new Map((playersRes.data ?? []).filter((player: any) => player.user_id).map((player: any) => [player.user_id, player.name]));

  const displayFor = (userId: string | null | undefined) => {
    const profile = userId ? profileById.get(userId) : null;
    return authMetadataName(profile)
      ?? (userId ? playerNameByUser.get(userId) : null)
      ?? cleanText(profile?.email)
      ?? shortUserId(userId);
  };

  return NextResponse.json({
    actor: actor ? { id: actor.id, role: actor.role, admin: actor.admin, displayName: actor.displayName } : null,
    chat: (chat.data ?? []).map((message: any) => ({
      ...message,
      author_display: displayFor(message.user_id),
      can_delete: Boolean(actor?.admin),
    })),
  });
}

export async function POST(req: NextRequest) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Login required' }, { status: 401 });
  const admin = createAdminSupabaseClient();
  const { action, payload } = await req.json();

  try {
    if (action === 'chat_send') {
      const message = String(payload.message || '').trim();
      if (!message) return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
      if (message.length > 1000) return NextResponse.json({ error: 'Message too long (max 1000).' }, { status: 400 });
      const { error } = await admin.from('chat_messages').insert({
        season_id: payload.season_id || null,
        user_id: me.id,
        role: me.role || 'FAN',
        message,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === 'admin_delete_chat') {
      if (!me.admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
      const id = String(payload.id || '').trim();
      if (!id) return NextResponse.json({ error: 'Message id is required.' }, { status: 400 });
      const { error } = await admin.from('chat_messages').delete().eq('id', id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Failed' }, { status: 500 });
  }
}
