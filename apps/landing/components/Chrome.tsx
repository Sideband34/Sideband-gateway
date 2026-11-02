import Link from 'next/link';

const links = [
  { href: '/', label: 'Overview' },
  { href: '/providers', label: 'Providers' },
  { href: '/devices', label: 'Devices' },
  { href: '/safety', label: 'Safety & FAQ' },
];

export function SiteHeader() {
  return (
    <header className="site">
      <div className="wrap">
        <Link href="/" className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mark.svg" alt="" width={32} height={32} />
          <span>Sideband</span>
        </Link>
        <nav aria-label="Primary">
          <ul>
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href}>{l.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site">
      <div className="wrap">
        <p>
          Sideband is pre-release software. Stellar Testnet and synthetic assets only. Nothing here
          is financial, legal, or investment advice, and no real funds are handled.
        </p>
      </div>
    </footer>
  );
}
