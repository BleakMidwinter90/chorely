'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker once the page has settled.
 *
 * Deliberately deferred until after load: registering during hydration competes
 * with the work that actually puts pixels on screen, and the worker is only
 * needed on the *next* visit anyway.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // A service worker needs a secure context. Plain HTTP on a home network is
    // a first-class deployment here, and there it simply will not register —
    // which is fine, the app works without it.
    if (!window.isSecureContext) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // A failed registration costs offline support and nothing else. There
        // is no user-facing recovery, so there is no user-facing error.
      });
    };

    if (document.readyState === 'complete') {
      register();
      return;
    }

    window.addEventListener('load', register);
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
