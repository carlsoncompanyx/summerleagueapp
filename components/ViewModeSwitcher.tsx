'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const MODES = [
  { label: 'Fan View', value: 'fan' },
  { label: 'User View', value: 'user' },
  { label: 'Captain View', value: 'captain' },
  { label: 'Admin View', value: 'admin' },
] as const;

export default function ViewModeSwitcher() {
  const pathname = usePathname();

  return (
    <div className="view-mode-switcher">
      {MODES.map((mode) => (
        <Link
          key={mode.value}
          className="view-mode-link"
          href={`${pathname}?view=${mode.value}`}
        >
          {mode.label}
        </Link>
      ))}
    </div>
  );
}
