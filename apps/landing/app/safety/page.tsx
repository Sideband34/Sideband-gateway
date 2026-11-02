import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Safety & FAQ' };

const faq = [
  [
    'Can two new devices pay each other with no internet at all?',
    'No. The payer must fund a Stellar channel while online first. Offline, they only exchange signed commitments against that funded channel.',
  ],
  [
    'Is a voucher the same as a payment?',
    'No. It is a signed commitment up to a cumulative amount. The provider bears the settlement risk until the channel is closed on-chain.',
  ],
  [
    'What if the provider disappears?',
    'The deposit stays locked until the channel expiry. After expiry the payer can reclaim the whole deposit on-chain.',
  ],
  [
    'What stops a payer from reusing an old voucher?',
    'Each voucher carries a cumulative amount that must be strictly higher than the last accepted one, and is bound to a single channel and network. Replays and lower amounts are rejected.',
  ],
  [
    'Is this audited or safe for real money?',
    'No. It is Testnet-only, pre-release software. The channel contract and voucher format have not been audited.',
  ],
  [
    'What data is collected?',
    'This site has no analytics and no accounts. The protocol keeps personal data out of on-chain metadata.',
  ],
];

export default function Safety() {
  return (
    <>
      <h1>Safety and FAQ</h1>
      <dl>
        {faq.map(([q, a]) => (
          <div key={q} className="card" style={{ marginBottom: 16 }}>
            <dt>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{q}</h2>
            </dt>
            <dd style={{ margin: '8px 0 0' }}>{a}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
