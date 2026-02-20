import { Role } from './types';

export const canViewTrades = (role: Role) => role === 'ADMIN' || role === 'CAPTAIN';
export const canViewAdmin = (role: Role) => role === 'ADMIN';
export const canEnterScores = (role: Role) => role === 'ADMIN';
export const canFanChatPost = (role: Role) => role !== 'FAN' || true;
