import Link from 'next/link';
import { APK_RELEASES_URL, GITHUB_ORG, REPOS, repoFile } from '@/lib/site';

export { SiteHeader } from './Header';

const columns = [
  {
    title: 'Product',
    links: [
      { href: '/#how-it-works', label: 'How it works' },
      { href: '/#offline', label: 'What offline means' },
      { href: '/devices', label: 'Device support' },
      { href: APK_RELEASES_URL, label: 'Android beta builds' },
    ],
  },
  {
    title: 'Developers',
    links: [
      { href: '/providers', label: 'Provider gateway API' },
      ...REPOS.map((r) => ({ href: r.url, label: r.name })),
    ],
  },
  {
    title: 'Project',
    links: [
      { href: '/safety', label: 'Safety & FAQ' },
      { href: repoFile('Sideband-gateway', 'CONTRIBUTING.md'), label: 'Contributing' },
      { href: repoFile('Sideband-gateway', 'SECURITY.md'), label: 'Security policy' },
      { href: GITHUB_ORG, label: 'GitHub organization' },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-grid">
          <div className="footer-brand">
            <Link href="/" className="brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon.svg" alt="" width={34} height={34} />
              <span>Sideband</span>
            </Link>
            <p>Nearby services. Metered value. Stellar settlement.</p>
            <p className="footer-license">Open source under the MIT License.</p>
          </div>
          {columns.map((c) => (
            <div key={c.title}>
              <h2 className="footer-title">{c.title}</h2>
              <ul>
                {c.links.map((l) => (
                  <li key={l.href}>
                    {l.href.startsWith('/') ? (
                      <Link href={l.href}>{l.label}</Link>
                    ) : (
                      <a href={l.href}>{l.label}</a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="footer-disclaimer">
          Sideband is pre-release software. Stellar Testnet and synthetic assets only. The channel
          contract and voucher format are unaudited. Nothing here is financial, legal, or investment
          advice, and no real funds are handled.
        </p>
      </div>
    </footer>
  );
}
