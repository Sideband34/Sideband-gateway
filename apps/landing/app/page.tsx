import Link from 'next/link';

const steps = [
  {
    title: '1. Fund a channel while online',
    body: 'The payer deposits a Testnet asset into a Soroban payment channel bound to one provider. This needs internet and is a real on-chain transaction on Testnet.',
  },
  {
    title: '2. Meet nearby, go offline',
    body: 'Devices discover each other over Bluetooth or local Wi-Fi and agree on a price, a unit cap and a spending cap.',
  },
  {
    title: '3. Use the service, sign commitments',
    body: 'As units are metered, the payer signs ever-increasing cumulative vouchers. The provider checks each signature locally and refuses replays and rollbacks.',
  },
  {
    title: '4. Settle when connectivity returns',
    body: 'The provider submits its highest voucher on-chain. The remainder of the deposit goes back to the payer. Only then is the payment final.',
  },
];

export default function Home() {
  return (
    <>
      <h1>Nearby services. Metered value. Stellar settlement.</h1>
      <p className="lede">
        Sideband lets two devices exchange a small metered service without internet, using signed
        payment commitments backed by a channel funded beforehand on Stellar.
      </p>
      <section className="status" aria-labelledby="status-h">
        <h2 id="status-h" style={{ marginTop: 0 }}>
          Project status
        </h2>
        <p>
          Pre-release. Everything runs on Stellar Testnet or in synthetic test adapters. The mobile
          app is not published in any app store and has not been tested on physical devices yet.
        </p>
      </section>
      <p>
        <Link className="cta" href="/providers">
          Read the provider docs
        </Link>
      </p>

      <h2>How it works</h2>
      <ol className="grid">
        {steps.map((s) => (
          <li className="card" key={s.title}>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
          </li>
        ))}
      </ol>

      <h2>A voucher is not money yet</h2>
      <p>
        A voucher is a signed promise to pay up to a cumulative amount from a channel that is
        already funded. It is not a completed transfer. The provider carries the risk until the
        channel is settled on-chain, and Sideband only shows a payment as final after Stellar
        confirms it.
      </p>
      <table>
        <caption className="sr-only">Payment states and what they mean</caption>
        <thead>
          <tr>
            <th scope="col">State</th>
            <th scope="col">What it means</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Commitment accepted</th>
            <td>Signature and cap verified locally. Not settled.</td>
          </tr>
          <tr>
            <th scope="row">Settlement submitted</th>
            <td>Transaction sent. Outcome not yet confirmed.</td>
          </tr>
          <tr>
            <th scope="row">Reconciling</th>
            <td>Outcome unknown after a timeout. Checked by transaction hash, never blindly retried.</td>
          </tr>
          <tr>
            <th scope="row">Confirmed on Stellar</th>
            <td>Finality observed on the network. Only now is it settled.</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
