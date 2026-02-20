import Link from 'next/link';

import { canViewAdmin, canViewTrades } from '../lib/authz';
import { Role } from '../lib/types';

const ITEMS = [
  { label: 'Home', href: '/' },
  { label: 'Schedule', href: '/schedule' },
  { label: 'Standings', href: '/standings' },
  { label: 'Leaders', href: '/leaders' },
  { label: 'Betting', href: '/betting' },
  { label: 'Wallet', href: '/wallet' },
  { label: 'Trades', href: '/trades' },
  { label: 'Shit Talk', href: '/chat' },
  { label: 'Admin', href: '/admin' },
] as const;

export default function NavTabs({ role }: { role: Role }) {
  const filtered = ITEMS.filter((item) => {
    if (item.label === 'Admin') return canViewAdmin(role);
    if (item.label === 'Trades') return canViewTrades(role);
    return true;
  });

  return (
    <nav className="grid grid-cols-3 gap-2 text-sm">
      {filtered.map((item) => (
        <Link key={item.href} className="rounded border p-2" href={item.href}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
