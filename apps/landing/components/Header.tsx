'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { GITHUB_ORG } from '@/lib/site';
import { IconGitHub, IconMenu, IconX } from './Icons';
import { ThemeToggle } from './ThemeToggle';

export const NAV_LINKS = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/safety', label: 'Safety & FAQ' },
  { href: '/providers', label: 'Providers' },
  { href: '/#open-source', label: 'Open source' },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="site-header">
      <div className="wrap header-row">
        <Link href="/" className="brand" aria-label="Sideband home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" width={34} height={34} />
          <span>Sideband</span>
        </Link>
        <nav
          aria-label="Primary"
          id="primary-nav"
          className={open ? 'primary-nav open' : 'primary-nav'}
        >
          <ul>
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} onClick={() => setOpen(false)}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="header-actions">
          <a className="icon-btn" href={GITHUB_ORG} aria-label="Sideband on GitHub">
            <IconGitHub size={20} />
          </a>
          <ThemeToggle />
          <Link className="btn btn-primary btn-sm header-cta" href="/#download">
            Get the beta
          </Link>
          <button
            type="button"
            className="icon-btn menu-btn"
            aria-expanded={open}
            aria-controls="primary-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <IconX size={22} /> : <IconMenu size={22} />}
          </button>
        </div>
      </div>
    </header>
  );
}
