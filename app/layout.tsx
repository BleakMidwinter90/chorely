import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';

import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'chorely — a fair share of the housework',
  description:
    'A chore tracker that shows who is actually pulling their weight. Self-hosted, no accounts, no subscription.',
  applicationName: 'chorely',
};

export const viewport: Viewport = {
  // Phone-first: this gets opened in a kitchen far more often than at a desk.
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf8f5' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0a09' },
  ],
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
