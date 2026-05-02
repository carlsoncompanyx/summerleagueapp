export function normalizeRole(role: string | null | undefined): string {
  return String(role ?? '').trim().toUpperCase();
}

export function isAdminRole(role: string | null | undefined): boolean {
  return normalizeRole(role) === 'ADMIN';
}
