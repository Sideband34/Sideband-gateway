import type { Metadata } from 'next';
import { REPOS } from '@/lib/site';

export const metadata: Metadata = { title: 'Providers' };

const endpoints = [
  ['GET', '/v1/health', 'Liveness and shutdown state.'],
  [
    'GET',
    '/.well-known/sideband-service.json',
    'Provider-signed service manifest: price, unit, network, expiry.',
  ],
  ['POST', '/v1/sessions/offer', 'Create a session and receive a service_offer frame.'],
  ['POST', '/v1/sessions/accept', 'Bind a funded channel, spending cap and one-time nonce.'],
  [
    'POST',
    '/v1/sessions/:id/vouchers',
    'Submit a cumulative voucher. Verified, monotonic, atomic.',
  ],
  ['POST', '/v1/sessions/:id/serve', 'Demo metered call. Returns 402 if vouchers do not cover it.'],
  ['POST', '/v1/sessions/:id/meter', 'Compare payer and provider unit counts.'],
  [
    'GET',
    '/v1/sessions/:id/usage',
    'Units, amount owed, highest voucher. Always reports NOT_SETTLED.',
  ],
  ['POST', '/v1/channels/:id/settle', 'Prepare and submit settlement. Returns a stateful intent.'],
  ['GET', '/v1/channels/:id/status', 'Channel and settlement intent state.'],
];

export default function Providers() {
  return (
    <div className="wrap page">
      <div className="page-head">
        <p className="kicker">Providers</p>
        <h1>Provider gateway</h1>
        <p className="lede">
          The gateway hosts a metered service, validates vouchers with anti-replay protection and
          prepares settlement. This describes the v1 API of the current pre-release build.
        </p>
      </div>
      <h2>Guarantees the gateway enforces</h2>
      <ul className="list">
        <li>Cumulative amounts must strictly increase, using an atomic compare-and-swap.</li>
        <li>
          Vouchers are bound to network, channel, payer and provider; other domains are rejected.
        </li>
        <li>Work is refused (HTTP 402) when vouchers do not cover it.</li>
        <li>Settlement never reports confirmed without finality evidence.</li>
        <li>Mainnet configuration is refused.</li>
      </ul>
      <h2>Endpoints</h2>
      <div className="table-wrap">
        <table>
          <caption className="sr-only">Gateway v1 endpoints</caption>
          <thead>
            <tr>
              <th scope="col">Method</th>
              <th scope="col">Path</th>
              <th scope="col">Purpose</th>
            </tr>
          </thead>
          <tbody>
            {endpoints.map(([m, p, d]) => (
              <tr key={`${m}${p}`}>
                <td>
                  <code>{m}</code>
                </td>
                <td>
                  <code>{p}</code>
                </td>
                <td>{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Current limitations</h2>
      <p className="page-note">
        The default runtime uses an in-memory test channel adapter whose receipts are marked
        synthetic and can never reach confirmed. A Soroban adapter exists but has only been
        exercised against a fake chain client: there is no Testnet deployment yet, and the voucher
        format has not been security reviewed. Source and setup:{' '}
        <a href={REPOS[2].url}>Sideband34/Sideband-gateway</a>.
      </p>
    </div>
  );
}
