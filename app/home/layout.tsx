import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getIdentity } from '@/lib/auth/session';
import { NavLink } from '@/components/NavLink';

export default async function HomeLayout({ children }: LayoutProps<'/home'>) {
  const identity = await getIdentity();
  if (!identity) redirect('/');

  const { member, household } = identity;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-5 py-3">
          <Link href="/home" className="min-w-0">
            <span className="block truncate text-sm font-semibold">{household.name}</span>
            <span className="block truncate text-xs text-ink-muted">
              {member.emoji} {member.name}
            </span>
          </Link>

          {/* Bottom nav on phones, inline on wider screens. */}
          <nav className="hidden gap-1 sm:flex">
            <NavLink href="/home">Today</NavLink>
            <NavLink href="/home/balance">Balance</NavLink>
            <NavLink href="/home/chores">Chores</NavLink>
            <NavLink href="/home/settings">Home</NavLink>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-28 pt-6 sm:pb-12">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden">
        <div className="mx-auto flex max-w-2xl">
          <NavLink href="/home" stacked icon="📋">
            Today
          </NavLink>
          <NavLink href="/home/balance" stacked icon="⚖️">
            Balance
          </NavLink>
          <NavLink href="/home/chores" stacked icon="🧹">
            Chores
          </NavLink>
          <NavLink href="/home/settings" stacked icon="🏠">
            Home
          </NavLink>
        </div>
      </nav>
    </div>
  );
}
