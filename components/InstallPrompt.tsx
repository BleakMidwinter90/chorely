'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Download, Share } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const STANDALONE_QUERY = '(display-mode: standalone)';

function subscribeToDisplayMode(onChange: () => void) {
  const query = window.matchMedia(STANDALONE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function readIsInstalled(): boolean {
  return (
    window.matchMedia(STANDALONE_QUERY).matches ||
    // Safari's own non-standard flag, the only signal available on iOS.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Device facts never change mid-session, so there is nothing to subscribe to. */
const noSubscription = () => () => {};

function readIsIosSafari(): boolean {
  const ua = window.navigator.userAgent;
  // iPadOS reports itself as a Mac, so touch support is the distinguishing signal.
  const iosLike =
    /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return iosLike && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua);
}

/**
 * Offers to install chorely to the home screen.
 *
 * Two entirely different worlds. Chromium fires `beforeinstallprompt` and hands
 * you a real install dialog. iOS Safari has no such API and never will, so the
 * only honest thing to do there is name the two taps required.
 *
 * Browser-only facts are read through `useSyncExternalStore` rather than an
 * effect. Both server snapshots deliberately resolve to "nothing to offer", so
 * the server and the first client render agree and hydration stays quiet — the
 * server cannot possibly know whether an app is already installed.
 */
export function InstallPrompt() {
  const isInstalled = useSyncExternalStore(subscribeToDisplayMode, readIsInstalled, () => true);
  const isIosSafari = useSyncExternalStore(noSubscription, readIsIosSafari, () => false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      // Suppress Chrome's mini-infobar so the offer appears where it belongs in
      // the page rather than floating over the content.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (isInstalled) return null;

  if (deferred) {
    return (
      <div className="panel flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h2 className="text-[15px] font-medium">Add chorely to your home screen</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Opens like an app, without the browser bar in the way.
          </p>
        </div>
        <button
          type="button"
          onClick={async () => {
            await deferred.prompt();
            await deferred.userChoice;
            // The event is single-use, whichever way the user answered.
            setDeferred(null);
          }}
          className="tap inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-brand px-5 text-sm font-medium text-on-brand transition-colors hover:bg-brand-hover"
        >
          <Download size={15} strokeWidth={1.9} aria-hidden />
          Install
        </button>
      </div>
    );
  }

  if (isIosSafari) {
    return (
      <div className="panel p-5">
        <h2 className="text-[15px] font-medium">Add chorely to your home screen</h2>
        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
          Tap
          <Share size={15} strokeWidth={1.8} aria-hidden className="inline-block text-ink" />
          <span className="font-medium text-ink">Share</span>, then
          <span className="font-medium text-ink">Add to Home Screen</span>.
        </p>
      </div>
    );
  }

  // Neither route available: an install button that does nothing is worse than
  // no button at all.
  return null;
}
