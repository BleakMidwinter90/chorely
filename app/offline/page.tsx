import { WifiOff } from 'lucide-react';

export const metadata = { title: 'Offline' };

/**
 * Shown by the service worker when a navigation fails and nothing is cached.
 *
 * Static on purpose — it must render with no database, no session and no
 * network, which is the one situation where every other page in the app is
 * unavailable.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-16 text-center">
      <WifiOff
        size={28}
        strokeWidth={1.5}
        aria-hidden
        className="mx-auto mb-6 text-ink-faint"
      />
      <h1 className="display text-3xl">No connection</h1>
      <p className="mx-auto mt-3 max-w-xs text-[15px] text-pretty text-ink-muted">
        chorely needs to reach your household to know what&rsquo;s due. Anything you ticked off
        before you lost signal is already saved.
      </p>
      <p className="mt-8 text-xs text-ink-faint">This page will work again once you&rsquo;re back.</p>
    </main>
  );
}
