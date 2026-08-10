'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, ListChecks, Scale, ShoppingBasket, Sparkles, Wallet } from 'lucide-react';

/**
 * Icons are looked up here, on the client, rather than passed in.
 *
 * A Lucide icon is a function component, and function components cannot cross
 * the Server→Client boundary — React has no way to serialise them. The server
 * passes a name; this side resolves it. That also lets the icon respond to the
 * active state, which is computed from the pathname and therefore only known
 * here.
 */
const ICONS = {
  today: ListChecks,
  shopping: ShoppingBasket,
  money: Wallet,
  balance: Scale,
  chores: Sparkles,
  home: House,
} as const;

export type NavIcon = keyof typeof ICONS;

interface NavLinkProps {
  href: string;
  children: React.ReactNode;
  icon: NavIcon;
  /** Phone layout: icon above label, stretched across the bottom bar. */
  stacked?: boolean;
}

export function NavLink({ href, children, icon, stacked = false }: NavLinkProps) {
  const pathname = usePathname();
  // `/home` must not light up for `/home/balance`, but `/home/chores` should
  // stay lit on any page beneath it.
  const isActive = href === '/home' ? pathname === href : pathname.startsWith(href);
  const Icon = ICONS[icon];

  if (stacked) {
    return (
      <Link
        href={href}
        aria-current={isActive ? 'page' : undefined}
        className={`flex min-w-0 flex-1 flex-col items-center gap-1 px-0.5 py-2.5 text-[10px] font-medium tracking-tight transition-colors ${
          isActive ? 'text-brand' : 'text-ink-faint'
        }`}
      >
        <Icon size={19} strokeWidth={isActive ? 2.1 : 1.6} aria-hidden />
        <span className="w-full truncate text-center">{children}</span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] transition-colors ${
        isActive
          ? 'bg-brand-soft font-medium text-brand-ink'
          : 'text-ink-muted hover:bg-sunk hover:text-ink'
      }`}
    >
      <Icon size={15} strokeWidth={1.7} aria-hidden />
      {children}
    </Link>
  );
}
