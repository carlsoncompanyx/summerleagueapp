import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '../../../lib/supabase/admin';
import { createServerSupabaseClient } from '../../../lib/supabase/server';
import { socialDisplayName } from '../../../lib/profiles/display';

function testModeAdmin() {
  return process.env.ADMIN_TEST_MODE === 'true' && (process.env.VERCEL_ENV ?? 'development') !== 'production';
}

async function currentUser() {
  if (testModeAdmin()) {
    const admin = createAdminSupabaseClient();
    const { data: profile } = await admin.from('profiles').select('user_id').limit(1).maybeSingle();
    if (!profile?.user_id) return null;
    return { id: profile.user_id, admin: true };
  }
  const server = createServerSupabaseClient();
  const { data: { user } } = await server.auth.getUser();
  if (!user) return null;
  const admin = createAdminSupabaseClient();
  const { data: p } = await admin.from('profiles').select('role').eq('user_id', user.id).maybeSingle();
  return { id: user.id, admin: p?.role === 'ADMIN' };
}

export async function GET(req: NextRequest) {
  const seasonId = req.nextUrl.searchParams.get('season_id');
  const admin = createAdminSupabaseClient();

  let chatQ = admin.from('chat_messages').select('*').order('created_at', { ascending: false }).limit(60);
  let threadQ = admin.from('forum_threads').select('*').is('deleted_at', null).order('updated_at', { ascending: false }).limit(50);
  if (seasonId) {
    chatQ = chatQ.eq('season_id', seasonId);
    threadQ = threadQ.eq('season_id', seasonId);
  }

  const [chat, threads, posts, profiles] = await Promise.all([
    chatQ,
    threadQ,
    admin.from('forum_posts').select('*').is('deleted_at', null).order('created_at', { ascending: true }),
    admin.from('profiles').select('user_id,first_name,last_name,display_name'),
  ]);

  const profileById = new Map((profiles.data ?? []).map((p: any) => [p.user_id, p]));
  const mapAuthor = (userId: string | null | undefined) => {
    if (!userId) return null;
    const profile = profileById.get(userId);
    return profile ? socialDisplayName(profile) : null;
  };

  return NextResponse.json({
    chat: (chat.data ?? []).map((m: any) => ({ ...m, author_display: mapAuthor(m.user_id) })),
    threads: (threads.data ?? []).map((th: any) => ({ ...th, author_display: mapAuthor(th.author_id) })),
    posts: (posts.data ?? []).map((po: any) => ({ ...po, author_display: mapAuthor(po.author_id) })),
  });
}

export async function POST(req: NextRequest) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Login required' }, { status: 401 });
  const admin = createAdminSupabaseClient();
  const { action, payload } = await req.json();

  try {
    if (action === 'chat_send') {
      const { error } = await admin.from('chat_messages').insert({
        season_id: payload.season_id || null,
        user_id: me.id,
        role: payload.role || 'FAN',
        message: payload.message,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (action === 'thread_create') {
      const { error } = await admin.from('forum_threads').insert({
        season_id: payload.season_id || null,
        author_id: me.id,
        title: payload.title,
        body: payload.body,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (action === 'post_reply') {
      const { error } = await admin.from('forum_posts').insert({
        thread_id: payload.thread_id,
        author_id: me.id,
        body: payload.body,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (action === 'admin_delete_post') {
      if (!me.admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
      const { error } = await admin.from('forum_posts').update({ deleted_at: new Date().toISOString() }).eq('id', payload.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (action === 'admin_delete_thread') {
      if (!me.admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
      const { error } = await admin.from('forum_threads').update({ deleted_at: new Date().toISOString() }).eq('id', payload.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Failed' }, { status: 500 });
  }
}
