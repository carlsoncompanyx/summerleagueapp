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
