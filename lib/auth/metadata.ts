import { normalizeRole } from '../roles';
import type { Role } from '../types';

type AuthUserLike = {
  id?: string | null;
  email?: string | null;
  phone?: string | null;
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
};

const KNOWN_ROLES = new Set(['FAN', 'PLAYER', 'CAPTAIN', 'ADMIN']);

function cleanText(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

export function roleFromAuthUser(user: AuthUserLike | null | undefined, fallback: Role = 'FAN'): Role {
  const metadata = user?.app_metadata ?? {};
  const rawRole = metadata.role ?? metadata.app_role ?? metadata.ecrl_role;
  const normalized = normalizeRole(cleanText(rawRole) ?? fallback);
  return (KNOWN_ROLES.has(normalized) ? normalized : fallback) as Role;
}

export function profileFromAuthUser(user: AuthUserLike) {
  const metadata = user.user_metadata ?? {};
  const firstName = cleanText(metadata.first_name ?? metadata.firstName);
  const lastName = cleanText(metadata.last_name ?? metadata.lastName);
  const displayName = cleanText(metadata.display_name ?? metadata.displayName ?? metadata.full_name ?? metadata.name);

  return {
    user_id: cleanText(user.id) ?? '',
    first_name: firstName,
    last_name: lastName,
    display_name: displayName,
    contact: cleanText(metadata.phone ?? metadata.contact ?? user.phone),
    email: cleanText(user.email ?? metadata.email),
    role: roleFromAuthUser(user),
    team_id: null,
  };
}

export function displayNameFromAuthUser(user: AuthUserLike | null | undefined) {
  if (!user) return null;
  const profile = profileFromAuthUser(user);
  const fullName = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim();
  return profile.display_name || fullName || profile.email || (profile.user_id ? `User ${profile.user_id.slice(0, 8)}` : null);
}

export async function listAuthUserProfiles(admin: any, userIds?: Iterable<string>) {
  const requestedIds = userIds ? new Set(Array.from(userIds).filter(Boolean)) : null;
  const profiles: ReturnType<typeof profileFromAuthUser>[] = [];
  let errorMessage: string | null = null;

  try {
    const authAdmin = (admin.auth as any)?.admin;
    if (!authAdmin?.listUsers) return { profiles, errorMessage };
    const result = await authAdmin.listUsers({ page: 1, perPage: 1000 });
    if (result.error) {
      errorMessage = result.error.message ?? 'Unable to list auth users.';
      return { profiles, errorMessage };
    }

    for (const user of result.data?.users ?? []) {
      if (requestedIds && !requestedIds.has(user.id)) continue;
      profiles.push(profileFromAuthUser(user));
    }
  } catch (error: any) {
    errorMessage = error?.message ?? 'Unable to list auth users.';
  }

  return { profiles, errorMessage };
}
