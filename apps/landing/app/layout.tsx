import type { Metadata } from 'next';
import './globals.css';
import { SiteFooter, SiteHeader } from '@/components/Chrome';

export const metadata: Metadata = {
  title: { default: 'Sideband', template: '%s | Sideband' },
  description:
    'Nearby services, metered value, Stellar settlement. Pre-release, Testnet only.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" tabIndex={-1}>
          <div className="wrap">{children}</div>
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
