export function officialName(profile: { first_name?: string | null; last_name?: string | null; display_name?: string | null }) {
  const first = (profile.first_name ?? '').trim();
  const last = (profile.last_name ?? '').trim();
  const full = `${first} ${last}`.trim();
  if (full) return full;
  return (profile.display_name ?? '').trim() || 'Unknown Player';
}

export function socialDisplayName(profile: { first_name?: string | null; last_name?: string | null; display_name?: string | null }) {
  const preferred = (profile.display_name ?? '').trim();
  if (preferred) return preferred;
  return officialName(profile);
}

export function profileDisplayLabel(profile: {
  user_id?: string | null;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  contact?: string | null;
  email?: string | null;
} | null | undefined) {
  if (!profile) return 'Unlinked';

  const display = (profile.display_name ?? '').trim();
  if (display) return display;

  const full = `${(profile.first_name ?? '').trim()} ${(profile.last_name ?? '').trim()}`.trim();
  if (full) return full;

  const contact = (profile.contact ?? '').trim();
  if (contact) return contact;

  const email = (profile.email ?? '').trim();
  if (email) return email;

  const userId = (profile.user_id ?? '').trim();
  if (userId) return `User ${userId.slice(0, 8)}`;

  return 'User';
}
