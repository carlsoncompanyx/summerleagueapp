import { isAdminRole, isCaptainRole } from './roles';

export const canViewTrades = (role: string | null | undefined) => isAdminRole(role) || isCaptainRole(role);
export const canViewAdmin = (role: string | null | undefined) => isAdminRole(role);
export const canEnterScores = (role: string | null | undefined) => isAdminRole(role);
export const canFanChatPost = (_role: string | null | undefined) => true;
