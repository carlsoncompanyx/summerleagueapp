'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart2,
  Calendar,
  Flame,
  Home,
  MessageCircle,
  Repeat,
  ShieldAlert,
  Trophy,
} from 'lucide-react';

import { canViewAdmin, canViewTrades } from '../lib/authz';
import { Role } from '../lib/types';

const ITEMS = [
  { label: 'Home', href: '/', testId: 'tab-home', icon: Home },
  { label: 'Games', href: '/schedule', testId: 'tab-schedule', icon: Calendar },
  { label: 'Standings', href: '/standings', testId: 'tab-standings', icon: Trophy },
  { label: 'Statistics', href: '/statistics', testId: 'tab-statistics', icon: BarChart2 },
  { label: 'DFS', href: '/dfs', testId: 'tab-dfs', icon: Flame },
  { label: 'Shit Talk', href: '/chat', testId: 'tab-chat', icon: MessageCircle },
  { label: 'Trades', href: '/trades', testId: 'tab-trades', icon: Repeat },
  { label: 'Admin', href: '/admin', testId: 'tab-admin', icon: ShieldAlert },
] as const;

export default function NavTabs({ role = 'ADMIN' }: { role?: Role }) {
  const pathname = usePathname();

  const filtered = ITEMS.filter((item) => {
    if (item.label === 'Admin') return canViewAdmin(role);
    if (item.label === 'Trades') return canViewTrades(role);
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
