import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Home from '@/app/page';
import Providers from '@/app/providers/page';
import Devices from '@/app/devices/page';
import Safety from '@/app/safety/page';
import { SiteFooter, SiteHeader } from '@/components/Chrome';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const pages = { Home, Providers, Devices, Safety };

describe('landing pages', () => {
  for (const [name, Page] of Object.entries(pages)) {
    it(`${name} has exactly one h1 and no fabricated store links`, () => {
      const { container } = render(<Page />);
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');
      expect(hrefs.some((h) => /apple\.com|play\.google|apps\.apple/.test(h))).toBe(false);
    });

    it(`${name} never claims funds are final or the product is audited/live`, () => {
      const { container } = render(<Page />);
      const text = container.textContent ?? '';
      expect(text).not.toMatch(/\binstant(ly)? (final|settle)/i);
      expect(text).not.toMatch(/\b(fully )?audited and/i);
      expect(text).not.toMatch(/available (now )?on the app store|download on the/i);
    });
  }

  it('home states pre-release/Testnet status and the voucher-not-money rule', () => {
    render(<Home />);
    const status = screen.getByRole('region', { name: /project status/i });
    expect(within(status).getByText(/Pre-release/)).toBeInTheDocument();
    expect(within(status).getByText(/Testnet/)).toBeInTheDocument();
    expect(screen.getByText(/A voucher is not money yet/)).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Confirmed on Stellar/ })).toBeInTheDocument();
  });

  it('device matrix lists nothing as supported', () => {
    render(<Devices />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(4);
    for (const r of rows) expect(r).toHaveTextContent(/Not tested/);
    expect(screen.queryByText(/^Supported$/)).toBeNull();
  });

  it('chrome exposes labelled navigation and a footer disclaimer', () => {
    render(
      <>
        <SiteHeader />
        <SiteFooter />
      </>,
    );
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).getAllByRole('link')).toHaveLength(4);
    expect(screen.getByRole('contentinfo')).toHaveTextContent(/Testnet and synthetic assets only/);
  });

  it('every table has a caption and header cells', () => {
    for (const Page of [Home, Providers, Devices]) {
      const { container, unmount } = render(<Page />);
      for (const t of container.querySelectorAll('table')) {
        expect(t.querySelector('caption')).not.toBeNull();
        expect(t.querySelector('th')).not.toBeNull();
      }
      unmount();
    }
  });
});
