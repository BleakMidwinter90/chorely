'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavLinkProps {
  href: string;
  children: React.ReactNode;
  /** Phone layout: icon above label, stretched across the bottom bar. */
  stacked?: boolean;
  icon?: string;
}

export function NavLink({ href, children, stacked = false, icon }: NavLinkProps) {
  const pathname = usePathname();
  // `/home` must not light up for `/home/balance`, but `/home/chores` should
  // stay lit on any page beneath it.
  const isActive = href === '/home' ? pathname === href : pathname.startsWith(href);

  if (stacked) {
    return (
      <Link
        href={href}
        aria-current={isActive ? 'page' : undefined}
        className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] transition ${
          isActive ? 'text-accent' : 'text-ink-muted'
        }`}
      >
        <span aria-hidden className="text-lg leading-none">
          {icon}
        </span>
        {children}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={`rounded-lg px-3 py-1.5 text-sm transition ${
        isActive ? 'bg-accent-soft text-accent-ink' : 'text-ink-muted hover:text-ink'
      }`}
    >
      {children}
    </Link>
  );
}
