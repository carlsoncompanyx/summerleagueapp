'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { normalizeRole } from '../lib/roles';
import {
  BarChart2,
  Calendar,
  CircleDollarSign,
  Flame,
  Home,
  MessageCircle,
  ShieldAlert,
  Trophy,
} from 'lucide-react';

import { canViewAdmin } from '../lib/authz';
import { Role } from '../lib/types';

const ITEMS = [
  { label: 'Home', href: '/', testId: 'tab-home', icon: Home },
  { label: 'Games', href: '/schedule', testId: 'tab-schedule', icon: Calendar },
  { label: 'Standings', href: '/standings', testId: 'tab-standings', icon: Trophy },
  { label: 'Statistics', href: '/statistics', testId: 'tab-statistics', icon: BarChart2 },
  { label: 'DFS', href: '/dfs', testId: 'tab-dfs', icon: Flame },
  { label: 'Chat', href: '/chat', testId: 'tab-chat', icon: MessageCircle },
  { label: 'Betting', href: '/betting', testId: 'tab-betting', icon: CircleDollarSign },
  { label: 'Admin', href: '/admin', testId: 'tab-admin', icon: ShieldAlert },
] as const;

export default function NavTabs({ role = 'FAN' }: { role?: Role | string }) {
  const pathname = usePathname();
  const [clientRole, setClientRole] = useState<string>(normalizeRole(role));

  useEffect(() => {
    let live = true;
    fetch('/api/me', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`me ${res.status}`);
        const me = await res.json();
        if (!live) return;
        if (me?.authenticated) {
          const nextRole = normalizeRole(me?.normalizedRole || me?.rawRole || role);
          setClientRole(nextRole);
          if (process.env.NODE_ENV !== 'production') console.info('[NavTabs] role sync', { initialRole: role, meRole: nextRole, isAdmin: me?.isAdmin });
        }
      })
      .catch((err) => {
        if (process.env.NODE_ENV !== 'production') console.warn('[NavTabs] /api/me failed', err);
      });
    return () => { live = false; };
  }, [role]);

  const filtered = ITEMS.filter((item) => {
    if (item.label === 'Admin') return canViewAdmin(clientRole);
    return true;
  });

  return (
    <nav className="tabs" aria-label="Primary tabs">
      {filtered.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;

        return (
          <Link
            key={item.href}
            data-testid={item.testId}
            className={`tab-link ${isActive ? 'is-active' : ''}`}
            href={item.href}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
