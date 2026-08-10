'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Bell, BellOff, Check } from 'lucide-react';

/**
 * Why notifications might not be on offer at all.
 *
 * Separated from whether they are currently *enabled*, because these are
 * device facts that cannot change while the page is open, whereas the
 * subscription can.
 */
type Capability = 'checking' | 'unsupported' | 'insecure' | 'blocked' | 'available';

type Subscription = 'checking' | 'off' | 'on' | 'working';

/** Device facts never change mid-session, so there is nothing to subscribe to. */
const noSubscription = () => () => {};

function readCapability(): Capability {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'unsupported';
  }
  // Service workers, and therefore push, require a secure context. Plain HTTP
  // on a home network is a first-class deployment here, so this is a normal
  // situation to explain rather than a failure.
  if (!window.isSecureContext) return 'insecure';
  if (Notification.permission === 'denied') return 'blocked';
  return 'available';
}

/** Push keys travel as base64url and must reach the browser as bytes. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

/**
 * Turning daily reminders on for this device.
 *
 * Permission is requested only when someone presses the button, never on page
 * load. An unprompted permission dialog is the fastest route to being denied
 * permanently, and a denial cannot be undone from inside the page.
 */
export function NotificationSetup() {
  // Read through useSyncExternalStore rather than an effect: the server cannot
  // know any of this, so its snapshot is 'checking' and the component renders
  // nothing until hydration, keeping server and client markup in agreement.
  const capability = useSyncExternalStore(noSubscription, readCapability, () => 'checking' as const);

  const [subscription, setSubscription] = useState<Subscription>('checking');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (capability !== 'available') return;

    let cancelled = false;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((existing) => {
        if (!cancelled) setSubscription(existing ? 'on' : 'off');
      })
      .catch(() => {
        if (!cancelled) setSubscription('off');
      });

    return () => {
      cancelled = true;
    };
  }, [capability]);

  const enable = useCallback(async () => {
    setError(null);
    setSubscription('working');

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setSubscription('off');
        return;
      }

      const keyResponse = await fetch('/api/push/subscribe');
      if (!keyResponse.ok) throw new Error('Could not reach the server');
      const { publicKey } = (await keyResponse.json()) as { publicKey: string };

      const registration = await navigator.serviceWorker.ready;
      const created = await registration.pushManager.subscribe({
        // Required by every browser: chorely may only send notifications a
        // person will actually see, never silent background pings.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      const saved = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(created.toJSON()),
      });
      if (!saved.ok) throw new Error('Could not save this device');

      setSubscription('on');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong');
      setSubscription('off');
    }
  }, []);

  const disable = useCallback(async () => {
    setError(null);
    setSubscription('working');

    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();

      if (existing) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: existing.endpoint }),
        });
        await existing.unsubscribe();
      }

      setSubscription('off');
    } catch {
      setError('Could not turn reminders off');
      setSubscription('on');
    }
  }, []);

  if (capability === 'checking') return null;

  if (capability === 'unsupported') {
    return (
      <Shell>
        <p className="text-sm text-ink-muted">
          This browser can&rsquo;t do notifications. Everything else works normally.
        </p>
      </Shell>
    );
  }

  if (capability === 'insecure') {
    return (
      <Shell>
        <p className="text-sm text-pretty text-ink-muted">
          Reminders need HTTPS — browsers won&rsquo;t allow them over a plain{' '}
          <code className="font-mono text-[13px]">http://</code> address. Everything else works
          fine on your home network.
        </p>
      </Shell>
    );
  }

  if (capability === 'blocked') {
    return (
      <Shell>
        <p className="text-sm text-pretty text-ink-muted">
          Notifications are blocked for this site. You&rsquo;ll need to allow them in your
          browser&rsquo;s settings — a page can&rsquo;t ask again once it has been refused.
        </p>
      </Shell>
    );
  }

  if (subscription === 'checking') return null;

  const isOn = subscription === 'on';

  return (
    <Shell>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[15px] font-medium">
            {isOn && <Check size={16} strokeWidth={2.2} aria-hidden className="text-brand" />}
            {isOn ? 'Reminders are on for this device' : 'Daily reminders'}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            One a day, and only when something is actually on your list.
          </p>
        </div>

        <button
          type="button"
          onClick={isOn ? disable : enable}
          disabled={subscription === 'working'}
          className={`tap inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-5 text-sm font-medium transition-colors disabled:cursor-wait disabled:opacity-55 ${
            isOn
              ? 'border border-line text-ink-muted hover:border-line-strong hover:text-ink'
              : 'bg-brand text-on-brand hover:bg-brand-hover'
          }`}
        >
          {isOn ? (
            <>
              <BellOff size={15} strokeWidth={1.9} aria-hidden />
              Turn off
            </>
          ) : (
            <>
              <Bell size={15} strokeWidth={1.9} aria-hidden />
              Turn on
            </>
          )}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-late">
          {error}
        </p>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="panel p-5">{children}</div>;
}
