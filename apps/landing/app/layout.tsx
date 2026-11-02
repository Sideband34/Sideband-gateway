import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './globals.css';
import { SiteFooter, SiteHeader } from '@/components/Chrome';
import { themeBootScript } from '@/components/ThemeToggle';

const description =
  'Metered services between nearby devices, paid with signed vouchers over Bluetooth or local Wi-Fi and settled on Stellar later. Pre-release, Testnet only.';

export const metadata: Metadata = {
  title: {
    default: 'Sideband — Nearby services, metered value, Stellar settlement',
    template: '%s | Sideband',
  },
  description,
  applicationName: 'Sideband',
  openGraph: { title: 'Sideband', description, type: 'website', siteName: 'Sideband' },
  twitter: { card: 'summary', title: 'Sideband', description },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#130b12' },
    { media: '(prefers-color-scheme: light)', color: '#fcf7ef' },
  ],
  colorScheme: 'dark light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <a href="#main" className="skip">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
