import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';

import { ServiceWorker } from '@/components/ServiceWorker';
import './globals.css';

const sans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const mono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

/**
 * Display face, used only for headline moments.
 *
 * A serif is an unusual choice for an app like this, and that is rather the
 * point: it gives chorely a voice instead of the default geometric-sans
 * anonymity every product ships with. Restricted to page titles, the balance
 * score and empty states, where it reads as considered rather than decorative.
 */
const display = Instrument_Serif({
  variable: '--font-instrument-serif',
  subsets: ['latin'],
  weight: '400',
});

export const metadata: Metadata = {
  title: {
    default: 'chorely — a fair share of the housework',
    template: '%s · chorely',
  },
  description:
    'A chore tracker that shows who is actually pulling their weight. Self-hosted, no accounts, no subscription.',
  applicationName: 'chorely',
  appleWebApp: { capable: true, title: 'chorely', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  // Phone-first: opened in a kitchen far more often than at a desk.
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fcfbf8' },
    { media: '(prefers-color-scheme: dark)', color: '#0f0f0e' },
  ],
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
