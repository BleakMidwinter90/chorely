import type { MetadataRoute } from 'next';

/**
 * Web app manifest.
 *
 * `display: standalone` is what makes chorely open without browser chrome once
 * it is added to a home screen, which is the whole point — the people using
 * this are tapping "Done" on a phone in a kitchen, and a URL bar in that moment
 * is pure noise.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'chorely — a fair share of the housework',
    short_name: 'chorely',
    description:
      'Rotates your household chores and keeps an honest tally of who is actually pulling their weight.',
    start_url: '/home',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#fcfbf8',
    theme_color: '#fcfbf8',
    categories: ['lifestyle', 'productivity', 'utilities'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Launchers crop maskable icons to their own shape, so this variant keeps
      // the mark well inside the safe area.
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: "Today's chores", short_name: 'Today', url: '/home' },
      { name: 'Balance', short_name: 'Balance', url: '/home/balance' },
    ],
  };
}
