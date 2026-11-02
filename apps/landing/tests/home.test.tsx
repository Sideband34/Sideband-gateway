import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Home from '@/app/page';
import { Download } from '@/components/Download';
import { formatAmount, HeroDemo } from '@/components/HeroDemo';
import { APK_RELEASES_URL, REPOS } from '@/lib/site';
import { parseStoreUrl, storeLinksFromEnv } from '@/lib/stores';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const STORE_RE = /apple\.com|play\.google|apps\.apple/;
const hrefs = (root: HTMLElement) =>
  [...root.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');

afterEach(() => vi.unstubAllEnvs());

describe('home sections', () => {
  const section = (name: RegExp) => screen.getByRole('region', { name });

  it('hero states the value proposition with a beta CTA and source link', () => {
    render(<Home />);
    const hero = section(/pay nearby devices by the unit/i);
    expect(within(hero).getByRole('link', { name: /android beta/i })).toHaveAttribute(
      'href',
      '#download',
    );
    expect(within(hero).getByRole('link', { name: /view the source/i })).toHaveAttribute(
      'href',
      'https://github.com/Sideband34',
    );
  });

  it('how it works walks fund → discover → stream → settle with connectivity labels', () => {
    render(<Home />);
    const how = section(/online to fund/i);
    const steps = within(how).getAllByRole('listitem');
    expect(steps.map((s) => within(s).getByRole('heading').textContent)).toEqual([
      'Fund a channel',
      'Discover nearby',
      'Stream with signed vouchers',
      'Settle later',
    ]);
    expect(steps[0]).toHaveTextContent('Online');
    expect(steps[2]).toHaveTextContent('Offline');
    expect(steps[3]).toHaveTextContent('Online');
  });

  it('features label planned work honestly', () => {
    render(<Home />);
    const features = section(/cannot wait for a block/i);
    const ble = within(features)
      .getByRole('heading', { name: /BLE negotiation/ })
      .closest('li')!;
    expect(ble).toHaveTextContent('Planned');
  });

  it('offline explainer separates what needs the internet', () => {
    render(<Home />);
    const offline = section(/offline is a session/i);
    expect(within(offline).getByText(/Settling or refunding the channel/)).toBeInTheDocument();
    expect(
      within(offline).getByText(/Opening or funding a new payment channel/),
    ).toBeInTheDocument();
  });

  it('trust and safety covers caps, monotonic vouchers, Testnet only and unaudited', () => {
    render(<Home />);
    const safety = section(/bounded by design/i);
    for (const t of ['Spend caps', 'Monotonic vouchers', 'Testnet only', 'Unaudited']) {
      expect(within(safety).getByRole('heading', { name: t })).toBeInTheDocument();
    }
  });

  it('providers section links the gateway API and repository', () => {
    render(<Home />);
    const providers = section(/run a metered service/i);
    expect(hrefs(providers)).toEqual(
      expect.arrayContaining(['/providers', 'https://github.com/Sideband34/Sideband-gateway']),
    );
  });

  it('open source section links exactly the four real repositories', () => {
    render(<Home />);
    const oss = section(/four repositories/i);
    const repoLinks = hrefs(oss).filter((h) =>
      /^https:\/\/github\.com\/Sideband34\/[^/]+$/.test(h),
    );
    expect(new Set(repoLinks)).toEqual(new Set(REPOS.map((r) => r.url)));
    expect(REPOS.map((r) => r.name).sort()).toEqual([
      'Sideband-channels',
      'Sideband-gateway',
      'Sideband-mobile',
      'Sideband-protocol',
    ]);
  });

  it('FAQ answers the store question without claiming a listing', () => {
    render(<Home />);
    const faq = section(/questions, answered plainly/i);
    expect(within(faq).getAllByRole('group').length).toBeGreaterThanOrEqual(5);
    expect(faq).toHaveTextContent(/Is Sideband on the App Store or Google Play\?\s*Not yet/);
  });

  it('makes no user, partner, metric, testimonial, audit or Mainnet claims', () => {
    const { container } = render(<Home />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\b\d[\d,.]*\+? (users|downloads|providers|partners)\b/i);
    expect(text).not.toMatch(/testimonial|trusted by|as seen in/i);
    expect(text).not.toMatch(
      /live on mainnet|available on mainnet|security audit(ed)? (by|passed)/i,
    );
  });
});

describe('download options', () => {
  it('without store env vars: no store links, beta APK on GitHub Releases, iOS coming soon', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_STORE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_PLAY_STORE_URL', '');
    const { container } = render(<Download />);
    expect(hrefs(container).some((h) => STORE_RE.test(h))).toBe(false);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('link', { name: /Download for Android \(beta APK\)/ })).toHaveAttribute(
      'href',
      APK_RELEASES_URL,
    );
    expect(APK_RELEASES_URL).toBe('https://github.com/Sideband34/Sideband-mobile/releases');
    expect(screen.getByText('iOS — coming soon')).toBeInTheDocument();
  });

  it('the home page renders no store links by default', () => {
    const { container } = render(<Home />);
    expect(hrefs(container).some((h) => STORE_RE.test(h))).toBe(false);
  });

  it('renders official badges only when listing URLs are configured', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_STORE_URL', 'https://apps.apple.com/app/id000');
    vi.stubEnv('NEXT_PUBLIC_PLAY_STORE_URL', 'https://play.google.com/store/apps/details?id=x');
    render(<Download links={storeLinksFromEnv()} />);
    expect(screen.getByRole('link', { name: 'Download on the App Store' })).toHaveAttribute(
      'href',
      'https://apps.apple.com/app/id000',
    );
    expect(screen.getByRole('link', { name: 'Get it on Google Play' })).toBeInTheDocument();
    expect(screen.queryByText(/beta APK/)).toBeNull();
    expect(screen.queryByText(/coming soon/)).toBeNull();
  });

  it('ignores store URLs that are not https links on the vendor host', () => {
    expect(parseStoreUrl('http://apps.apple.com/x', 'appStore')).toBeUndefined();
    expect(parseStoreUrl('https://evil.example/apps.apple.com', 'appStore')).toBeUndefined();
    expect(parseStoreUrl('https://apps.apple.com/x', 'playStore')).toBeUndefined();
    expect(parseStoreUrl('not a url', 'playStore')).toBeUndefined();
    expect(parseStoreUrl('  ', 'playStore')).toBeUndefined();
  });
});

describe('hero demo', () => {
  it('formats integer minor units without floats', () => {
    expect(formatAmount(7)).toBe('0.007');
    expect(formatAmount(20)).toBe('0.020');
  });

  it('describes itself to assistive tech and never claims settlement', () => {
    const { container } = render(<HeroDemo />);
    expect(screen.getByRole('figure')).toHaveAccessibleName(/synthetic Sideband session/);
    expect(container).toHaveTextContent(/not settled/i);
    expect(container.textContent).not.toMatch(/confirmed|final|paid/i);
  });
});
