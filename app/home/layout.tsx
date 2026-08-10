import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NavLink, type NavIcon } from '@/components/NavLink';
import { getIdentity } from '@/lib/auth/session';

// Names rather than components: a function cannot cross the Server→Client
// boundary, so NavLink resolves these on its own side.
const NAV: Array<{ href: string; label: string; icon: NavIcon }> = [
  { href: '/home', label: 'Today', icon: 'today' },
  { href: '/home/balance', label: 'Balance', icon: 'balance' },
  { href: '/home/chores', label: 'Chores', icon: 'chores' },
  { href: '/home/settings', label: 'Home', icon: 'home' },
];

export default async function HomeLayout({ children }: LayoutProps<'/home'>) {
  const identity = await getIdentity();
  if (!identity) redirect('/');

  const { member, household } = identity;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-5 py-3">
          <Link href="/home" className="group flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-[15px] leading-none"
            >
              {member.emoji}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium leading-tight">
                {household.name}
              </span>
              <span className="block truncate text-[11px] leading-tight text-ink-faint">
                {member.name}
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-0.5 sm:flex">
            {NAV.map((item) => (
              <NavLink key={item.href} href={item.href} icon={item.icon}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-28 pt-8 sm:pb-16">{children}</main>

      {/* Bottom bar on phones — the thumb lives down here. */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden">
        <div className="mx-auto flex max-w-3xl">
          {NAV.map((item) => (
            <NavLink key={item.href} href={item.href} icon={item.icon} stacked>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
