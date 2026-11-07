import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Home from '@/app/page';
import { Lifecycle } from '@/components/Lifecycle';
import { Storyboard } from '@/components/Storyboard';
import { UseCases } from '@/components/UseCases';
import { VoucherExplainer } from '@/components/VoucherExplainer';
import { fmt, planVoucher } from '@/lib/voucher-math';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

function mockMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((q: string) => ({
      matches: reduce && q.includes('reduce'),
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('voucher math (integer, like the SDK)', () => {
  const P = 10_000n;
  it('caps the session and stays cumulative from the baseline', () => {
    const p = planVoucher({
      units: 30,
      pricePerUnit: P,
      cap: 200_000n,
      baseline: 0n,
      deposit: 500_000n,
    });
    expect(fmt(p.owed)).toBe('0.03');
    expect(fmt(p.signedInSession)).toBe('0.02');
    expect(p.refusedUnits).toBe(10);
    expect(p.capReached).toBe(true);
    const q = planVoucher({
      units: 5,
      pricePerUnit: P,
      cap: 200_000n,
      baseline: 150_000n,
      deposit: 500_000n,
    });
    expect(fmt(q.voucherCumulative)).toBe('0.02');
    expect(q.capReached).toBe(false);
  });
  it('never signs past the deposit', () => {
    const p = planVoucher({
      units: 40,
      pricePerUnit: P,
      cap: 400_000n,
      baseline: 150_000n,
      deposit: 500_000n,
    });
    expect(p.voucherCumulative).toBe(500_000n);
    expect(fmt(0n)).toBe('0');
  });
});

describe('storyboard', () => {
  it('shows the three phases as tabs with honest connectivity labels', () => {
    mockMotion(true);
    render(<Storyboard />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['01 Online', '02 Offline', '03 Online']);
    expect(screen.getByRole('tabpanel')).toHaveTextContent(/Fund the channel on Soroban/);
    fireEvent.click(tabs[1]!);
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('img', { name: /Pair over BLE/ })).toBeInTheDocument();
    fireEvent.click(tabs[2]!);
    expect(screen.getByRole('tabpanel')).toHaveTextContent(/provider settles/);
  });

  it('does not autoplay (and hides the play control) under reduced motion', () => {
    mockMotion(true);
    vi.useFakeTimers();
    render(<Storyboard />);
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('button', { name: /animation/ })).toBeNull();
  });

  it('autoplays when motion is allowed and can be paused', () => {
    mockMotion(false);
    vi.useFakeTimers();
    render(<Storyboard />);
    act(() => vi.advanceTimersByTime(4300));
    expect(screen.getAllByRole('tab')[1]).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Pause animation' }));
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getAllByRole('tab')[1]).toHaveAttribute('aria-selected', 'true');
  });
});

describe('voucher explainer', () => {
  it('updates the voucher as units move and refuses past the cap', () => {
    render(<VoucherExplainer />);
    const units = screen.getByLabelText(/Units used this session/);
    fireEvent.change(units, { target: { value: '10' } });
    expect(screen.getByTestId('voucher-cumulative')).toHaveTextContent('0.01');
    fireEvent.change(units, { target: { value: '30' } });
    expect(screen.getByTestId('ex-status')).toHaveTextContent(/refuses to sign for 10 more units/);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(units, { target: { value: '5' } });
    expect(screen.getByTestId('voucher-cumulative')).toHaveTextContent('0.02'); // 0.015 + 0.005
  });
});

describe('use cases and lifecycle', () => {
  it('use cases are labelled as examples, with Wi-Fi only where permitted', () => {
    render(<UseCases />);
    expect(screen.getAllByText('Example scenario')).toHaveLength(3);
    expect(
      screen.getByRole('heading', { name: /Metered Wi-Fi, where permitted/ }),
    ).toBeInTheDocument();
  });

  it('steps through the contract calls and always conserves the deposit', () => {
    render(<Lifecycle />);
    const calls = ['init', 'top_up', 'settle', 'close_start', 'settle', 'refund'];
    expect(
      screen.getAllByRole('listitem').map((li) => li.querySelector('.mono')?.textContent),
    ).toEqual(calls);
    const next = screen.getByRole('button', { name: 'Next call' });
    for (let i = 0; i < calls.length; i++) {
      const vals = within(screen.getByTestId('lc-legend'))
        .getAllByRole('definition')
        .map((d) => Number(d.textContent));
      const [dep, paid, held, ref] = vals as [number, number, number, number];
      expect(paid + held + ref).toBe(dep);
      if (i < calls.length - 1) fireEvent.click(next);
    }
    expect(screen.getByText('Refunded', { selector: '.lc-state' })).toBeInTheDocument();
    expect(next).toBeDisabled();
  });
});

describe('home integrates the new sections', () => {
  it('has storyboard, explainer, use cases and under-the-hood regions', () => {
    mockMotion(true);
    render(<Home />);
    for (const name of [
      /deposit to settlement/i,
      /never signs past your cap/i,
      /paid by the unit/i,
      /one call at a time/i,
    ]) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
  });
});
