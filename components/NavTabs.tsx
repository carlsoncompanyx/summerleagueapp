import Link from 'next/link';

import { canViewAdmin, canViewTrades } from '../lib/authz';
import { Role } from '../lib/types';

const ITEMS = [
  { label: 'Home', href: '/', testId: 'tab-home' },
  { label: 'Schedule', href: '/schedule', testId: 'tab-schedule' },
  { label: 'Standings', href: '/standings', testId: 'tab-standings' },
  { label: 'Leaders', href: '/leaders', testId: 'tab-leaders' },
  { label: 'Betting', href: '/betting', testId: 'tab-betting' },
  { label: 'Wallet', href: '/wallet', testId: 'tab-wallet' },
  { label: 'Trades', href: '/trades', testId: 'tab-trades' },
  { label: 'Shit Talk', href: '/chat', testId: 'tab-chat' },
  { label: 'Admin', href: '/admin', testId: 'tab-admin' },
] as const;

export default function NavTabs({ role }: { role: Role }) {
  const filtered = ITEMS.filter((item) => {
    if (item.label === 'Admin') return canViewAdmin(role);
    if (item.label === 'Trades') return canViewTrades(role);
    return true;
  });

  return (
    <nav className="grid grid-cols-3 gap-2 text-sm" aria-label="Primary tabs">
      {filtered.map((item) => (
        <Link key={item.href} data-testid={item.testId} className="rounded border p-2" href={item.href}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
