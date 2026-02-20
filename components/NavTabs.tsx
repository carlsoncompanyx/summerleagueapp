import { NAV_ITEMS, Role } from '@/lib/types';
import { canViewAdmin, canViewTrades } from '@/lib/authz';

export default function NavTabs({ role }: { role: Role }) {
  const filtered = NAV_ITEMS.filter((item) => {
    if (item === 'Admin') return canViewAdmin(role);
    if (item === 'Trades') return canViewTrades(role);
    return true;
  });
  return <nav className="grid grid-cols-3 gap-2 text-sm">{filtered.map((i) => <div key={i} className="rounded border p-2">{i}</div>)}</nav>;
}
