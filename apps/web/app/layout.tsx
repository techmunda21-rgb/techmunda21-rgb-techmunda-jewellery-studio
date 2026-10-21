import type { Metadata, Viewport } from 'next';
import '../styles/globals.css';
import { Providers } from '@/lib/providers';

export const metadata: Metadata = {
  title: { default: 'Techmunda — AI Jewellery Growth Studio', template: '%s · Techmunda' },
  description: 'Premium product visuals, AI lead capture, CRM and approved follow-ups for jewellery retailers.',
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#461318' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:bg-royal focus:px-4 focus:py-2 focus:text-ivory">Skip to content</a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
