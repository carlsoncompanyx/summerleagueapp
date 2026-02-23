import Link from 'next/link';

import { canViewAdmin, canViewTrades } from '../lib/authz';
import { Role } from '../lib/types';

const ITEMS = [
  { label: 'Home', href: '/', testId: 'tab-home' },
  { label: 'Registration', href: '/registration', testId: 'tab-registration' },
  { label: 'Schedule', href: '/schedule', testId: 'tab-schedule' },
  { label: 'Standings', href: '/standings', testId: 'tab-standings' },
  { label: 'Statistics', href: '/statistics', testId: 'tab-statistics' },
  { label: 'Betting', href: '/betting', testId: 'tab-betting' },
  { label: 'Shit Talk', href: '/chat', testId: 'tab-chat' },
  { label: 'Wallet', href: '/wallet', testId: 'tab-wallet' },
  { label: 'Trades', href: '/trades', testId: 'tab-trades' },
  { label: 'Admin', href: '/admin', testId: 'tab-admin' },
] as const;

export default function NavTabs({ role }: { role: Role }) {
  const filtered = ITEMS.filter((item) => {
    if (item.label === 'Admin') return canViewAdmin(role);
    if (item.label === 'Trades') return canViewTrades(role);
    return true;
  });

  return (
    <nav className="tabs" aria-label="Primary tabs">
      {filtered.map((item) => (
        <Link key={item.href} data-testid={item.testId} className="tab-link" href={item.href}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
