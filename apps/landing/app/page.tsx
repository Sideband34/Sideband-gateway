import Link from 'next/link';
import { Download } from '@/components/Download';
import { HeroDemo } from '@/components/HeroDemo';
import { Lifecycle } from '@/components/Lifecycle';
import { Storyboard } from '@/components/Storyboard';
import { UseCases } from '@/components/UseCases';
import { VoucherExplainer } from '@/components/VoucherExplainer';
import {
  IconAlert,
  IconArrowRight,
  IconCheck,
  IconClock,
  IconCloud,
  IconCode,
  IconFlask,
  IconGauge,
  IconGitHub,
  IconLedger,
  IconLink,
  IconRadar,
  IconRepeat,
  IconShield,
  IconSignature,
  IconWallet,
  IconWifiOff,
  IconX,
} from '@/components/Icons';
import { Reveal } from '@/components/Reveal';
import { GITHUB_ORG, REPOS, repoFile } from '@/lib/site';

const steps = [
  {
    n: '01',
    net: 'Online',
    icon: IconWallet,
    title: 'Fund a channel',
    body: 'The payer deposits a Testnet asset into a Soroban payment channel bound to one provider. This is a real on-chain transaction and needs internet.',
  },
  {
    n: '02',
    net: 'Local',
    icon: IconRadar,
    title: 'Discover nearby',
    body: 'Devices find each other over Bluetooth LE or local Wi-Fi, check the provider’s signed manifest, and agree on price, units and a spending cap.',
  },
  {
    n: '03',
    net: 'Offline',
    icon: IconSignature,
    title: 'Stream with signed vouchers',
    body: 'Each metered unit is paid with a cumulative voucher signed on the phone. The provider verifies it locally and refuses replays and rollbacks.',
  },
  {
    n: '04',
    net: 'Online',
    icon: IconLedger,
    title: 'Settle later',
    body: 'When connectivity returns, the provider submits its highest voucher on-chain: it withdraws and keeps the channel open, or closes it and refunds the rest to the payer.',
  },
];

const features = [
  {
    icon: IconSignature,
    title: 'Cumulative signed vouchers',
    body: 'Ed25519 commitments that bind network, channel, payer and provider. One voucher always supersedes the last.',
    status: 'Implemented',
  },
  {
    icon: IconGauge,
    title: 'Hard spending caps',
    body: 'The phone never signs above min(your limit, the offer cap, the channel deposit), whatever the provider asks for.',
    status: 'Implemented',
  },
  {
    icon: IconShield,
    title: 'Local verification',
    body: 'Providers check signatures, channel binding and amounts without a network round-trip, using an atomic compare-and-swap.',
    status: 'Implemented',
  },
  {
    icon: IconClock,
    title: 'Pay only for delivered units',
    body: 'The gateway answers HTTP 402 when vouchers do not cover the work, and reports payer/provider meter discrepancies.',
    status: 'Implemented',
  },
  {
    icon: IconLedger,
    title: 'Honest settlement states',
    body: 'Created, submitted, reconciling, confirmed. A payment is shown as final only with finality evidence from the right network.',
    status: 'Implemented',
  },
  {
    icon: IconRadar,
    title: 'BLE negotiation, Wi-Fi transfer',
    body: 'Negotiate over Bluetooth LE, then move sustained traffic to local Wi-Fi. Needs physical-device testing on each platform.',
    status: 'Planned',
  },
];

const offlineYes = [
  'Verifying the provider’s signed service manifest',
  'Metering units and signing cumulative vouchers',
  'Checking signatures, caps and replay protection',
  'Delivering the service over the local link',
];
const offlineNo = [
  'Opening or funding a new payment channel',
  'Paying a provider you have no channel with',
  'Settling or refunding the channel on Stellar',
  'Showing any payment as final',
];

const safety = [
  {
    icon: IconGauge,
    title: 'Spend caps',
    body: 'You set a limit per session. Signing stops at the cap; the provider cannot raise it.',
  },
  {
    icon: IconRepeat,
    title: 'Monotonic vouchers',
    body: 'Each voucher must be strictly higher than the last accepted one. Replays and lower amounts are rejected.',
  },
  {
    icon: IconLink,
    title: 'Domain separation',
    body: 'Signatures are bound to one network, channel, payer and provider, so they cannot be reused elsewhere.',
  },
  {
    icon: IconClock,
    title: 'Close with a dispute window',
    body: 'If a provider disappears, the payer starts a close on-chain. After a dispute window (never before the channel expiry) the rest is refunded.',
  },
  {
    icon: IconFlask,
    title: 'Testnet only',
    body: 'The gateway and channel tooling refuse Mainnet configuration. Assets are Testnet or synthetic.',
  },
  {
    icon: IconAlert,
    title: 'Unaudited',
    body: 'The channel contract and voucher format have had no security audit. Do not use with real funds.',
  },
];

const faq = [
  {
    q: 'Can two new devices pay each other with no internet at all?',
    a: 'No. The payer must fund a Stellar channel with that provider while online first. Offline, the devices only exchange signed commitments against that funded channel.',
  },
  {
    q: 'Who carries the risk while a session is offline?',
    a: 'The provider. A voucher is only a promise backed by the channel deposit until it is settled on-chain, so providers should cap exposure per session.',
  },
  {
    q: 'What happens if my phone dies mid-session?',
    a: 'Nothing is charged beyond the highest voucher you already signed. The app journals the session and, when reopened, re-attaches to it and re-sends a voucher that was signed but not delivered. If the provider no longer has the session, the receipt is marked interrupted.',
  },
  {
    q: 'Which devices are supported?',
    a: 'None are verified yet. Bluetooth and local Wi-Fi transports still need physical-device testing; the device page tracks this honestly.',
  },
  {
    q: 'Is Sideband on the App Store or Google Play?',
    a: 'Not yet. Android pre-release builds are published on GitHub Releases. Official store badges will appear here only once real listings exist.',
  },
  {
    q: 'Does this site track me?',
    a: 'No. It is a static site with no analytics, cookies or accounts. Your theme choice is stored only in your browser.',
  },
];

export default function Home() {
  return (
    <>
      <section className="hero" aria-labelledby="hero-h">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="eyebrow-dot" /> Pre-release · Stellar Testnet
            </p>
            <h1 id="hero-h">
              Pay nearby devices <span className="hl">by the unit</span>, even when the internet
              drops.
            </h1>
            <p className="lede">
              Sideband lets a phone buy a metered service from a device next to it over Bluetooth or
              local Wi-Fi. Fund a Stellar payment channel while online, stream the service with
              signed vouchers offline, and settle on-chain later.
            </p>
            <div className="hero-ctas">
              <Link className="btn btn-primary btn-lg" href="#download">
                Get the Android beta <IconArrowRight size={18} />
              </Link>
              <a className="btn btn-ghost btn-lg" href={GITHUB_ORG}>
                <IconGitHub size={18} /> View the source
              </a>
            </div>
            <ul className="hero-facts">
              <li>
                <IconCheck size={16} /> MIT licensed
              </li>
              <li>
                <IconCheck size={16} /> Four open repositories
              </li>
              <li>
                <IconCheck size={16} /> Built on Soroban
              </li>
            </ul>
          </div>
          <div className="hero-visual">
            <HeroDemo />
          </div>
        </div>
      </section>

      <div className="wrap">
        <section className="status" aria-labelledby="status-h">
          <div className="status-icon">
            <IconFlask size={22} />
          </div>
          <div>
            <h2 id="status-h">Project status</h2>
            <p>
              <strong>Pre-release.</strong> Everything runs on Stellar Testnet or in synthetic test
              adapters. The mobile app is not published in any app store, has not been tested on
              physical devices, and the contracts are unaudited.
            </p>
          </div>
        </section>
      </div>

      <section id="how-it-works" className="section" aria-labelledby="how-h">
        <div className="wrap">
          <Reveal className="section-head">
            <p className="kicker">How it works</p>
            <h2 id="how-h">Online to fund. Offline to use. Online to settle.</h2>
            <p className="section-lede">
              Connectivity is only needed at the edges. The part in the middle, where the service is
              actually delivered, runs entirely between two nearby devices.
            </p>
          </Reveal>
          <ol className="steps">
            {steps.map((s, i) => (
              <Reveal as="li" className="step" key={s.n} delay={i * 90}>
                <div className="step-top">
                  <span className="step-n mono">{s.n}</span>
                  <span className={`net net-${s.net.toLowerCase()}`}>{s.net}</span>
                </div>
                <span className="icon-tile">
                  <s.icon size={22} />
                </span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      <section id="story" className="section section-alt" aria-labelledby="story-h">
        <div className="wrap">
          <Reveal className="section-head">
            <p className="kicker">One session, three phases</p>
            <h2 id="story-h">Watch a session from deposit to settlement.</h2>
            <p className="section-lede">
              Pick a phase or let it play. The middle phase is the one that works without internet.
            </p>
          </Reveal>
          <Reveal>
            <Storyboard />
          </Reveal>
        </div>
      </section>

      <section id="vouchers" className="section" aria-labelledby="vouchers-h">
        <div className="wrap">
          <Reveal className="section-head">
            <p className="kicker">Spend caps and vouchers</p>
            <h2 id="vouchers-h">Move the sliders: the phone never signs past your cap.</h2>
            <p className="section-lede">
              A voucher is the total committed so far on the channel, not a per-unit payment. A
              later session starts from where the last one ended.
            </p>
          </Reveal>
          <Reveal>
            <VoucherExplainer />
          </Reveal>
        </div>
      </section>

      <section id="features" className="section section-alt" aria-labelledby="features-h">
        <div className="wrap">
          <Reveal className="section-head">
            <p className="kicker">Features</p>
            <h2 id="features-h">Built for small payments that cannot wait for a block.</h2>
            <p className="section-lede">
              Labels show what exists in the open-source reference code today and what is still
              planned.
            </p>
          </Reveal>
          <ul className="feature-grid">
            {features.map((f, i) => (
              <Reveal as="li" className="feature" key={f.title} delay={(i % 3) * 80}>
                <div className="feature-top">
                  <span className="icon-tile">
                    <f.icon size={22} />
                  </span>
                  <span className={f.status === 'Planned' ? 'tag tag-planned' : 'tag tag-done'}>
                    {f.status}
                  </span>
                </div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      <section id="offline" className="section" aria-labelledby="offline-h">
        <div className="wrap">
          <Reveal className="section-head">
            <p className="kicker">What offline means</p>
            <h2 id="offline-h">Offline is a session, not a bank.</h2>
            <p className="section-lede">
              Sideband does not move new money without the internet. It moves signed promises
              against money that was already locked on-chain.
            </p>
          </Reveal>
          <div className="compare">
            <Reveal className="compare-col compare-yes">
              <h3>
                <IconWifiOff size={20} /> Works while offline
              </h3>
              <ul>
                {offlineYes.map((t) => (
                  <li key={t}>
                    <IconCheck size={18} /> {t}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal className="compare-col compare-no" delay={90}>
              <h3>
                <IconCloud size={20} /> Needs the internet
              </h3>
              <ul>
                {offlineNo.map((t) => (
                  <li key={t}>
                    <IconX size={18} /> {t}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>

          <Reveal className="voucher-explainer">
            <div>
              <h3>A voucher is not money yet</h3>
              <p>
                A voucher is a signed promise to pay up to a cumulative amount from a channel that
                is already funded. It is not a completed transfer. The provider carries the risk
                until the channel is settled on-chain, and Sideband only shows a payment as final
                after Stellar confirms it.
              </p>
            </div>
            <div className="table-wrap">
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
                    <th scope="row">
                      <span className="state state-local">Commitment accepted</span>
                    </th>
                    <td>Signature and cap verified locally. Not settled.</td>
                  </tr>
                  <tr>
                    <th scope="row">
                      <span className="state state-pending">Settlement submitted</span>
                    </th>
                    <td>Transaction sent. Outcome not yet confirmed.</td>
                  </tr>
                  <tr>
                    <th scope="row">
                      <span className="state state-warn">Reconciling</span>
                    </th>
                    <td>
                      Outcome unknown after a timeout. Checked by transaction hash, never blindly
                      retried.
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">
                      <span className="state state-final">Confirmed on Stellar</span>
                    </th>
                    <td>Finality observed on the network. Only now is it settled.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Reveal>
        </div>
      </section>

      <section id="use-cases" className="section section-alt" aria-labelledby="usecases-h">
        <div className="wrap">
          <Reveal className="section-head">
            <p className="kicker">Where it could fit</p>
            <h2 id="usecases-h">Small services, paid by the unit, right where you are.</h2>
            <p className="section-lede">
              Example scenarios the protocol is designed for. None of them is a live deployment.
            </p>
          </Reveal>
          <Reveal>
            <UseCases />
          </Reveal>
        </div>
      </section>

      <section id="under-the-hood" className="section" aria-labelledby="hood-h">
        <div className="wrap">
          <Reveal className="section-head">
            <p className="kicker">Under the hood</p>
            <h2 id="hood-h">The channel contract, one call at a time.</h2>
            <p className="section-lede">
              Step through the Soroban reference contract: open, top up, settle, close or refund.
              The totals always add up to the deposit.
            </p>
          </Reveal>
          <Reveal>
            <Lifecycle />
          </Reveal>
        </div>
      </section>

      <section id="safety" className="section section-alt" aria-labelledby="safety-h">
        <div className="wrap">
          <Reveal className="section-head">
            <p className="kicker">Trust &amp; safety</p>
            <h2 id="safety-h">Bounded by design, and honest about its limits.</h2>
          </Reveal>
          <ul className="safety-grid">
            {safety.map((s, i) => (
              <Reveal
                as="li"
                className={s.title === 'Unaudited' ? 'safety-card is-warning' : 'safety-card'}
                key={s.title}
                delay={(i % 3) * 80}
              >
                <s.icon size={22} />
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              </Reveal>
            ))}
          </ul>
          <p className="section-more">
            <Link href="/safety">
              Read the full safety notes and FAQ <IconArrowRight size={16} />
            </Link>
          </p>
        </div>
      </section>

      <section id="providers" className="section" aria-labelledby="providers-h">
        <div className="wrap split">
          <Reveal>
            <p className="kicker">For providers</p>
            <h2 id="providers-h">Run a metered service on hardware you already have.</h2>
            <p className="section-lede">
              The provider gateway is a small TypeScript service: it publishes a signed manifest,
              meters work, verifies vouchers with anti-replay protection and prepares settlement
              intents for when you are back online.
            </p>
            <ul className="checks">
              <li>
                <IconCheck size={18} /> Versioned v1 HTTP API with an OpenAPI spec
              </li>
              <li>
                <IconCheck size={18} /> Durable voucher, nonce and session stores on SQLite
              </li>
              <li>
                <IconCheck size={18} /> Session tokens, admin token and rate limiting
              </li>
              <li>
                <IconCheck size={18} /> Refuses unpaid work with HTTP 402
              </li>
            </ul>
            <div className="hero-ctas">
              <Link className="btn btn-primary" href="/providers">
                Gateway API <IconArrowRight size={18} />
              </Link>
              <a className="btn btn-ghost" href={REPOS[2].url}>
                <IconGitHub size={18} /> Sideband-gateway
              </a>
            </div>
          </Reveal>
          <Reveal className="terminal" delay={100}>
            <div className="terminal-bar" aria-hidden="true">
              <span />
              <span />
              <span />
              <p>provider · Testnet</p>
            </div>
            <pre>
              <code>
                <span className="t-dim"># sibling SDK first (file: dependency)</span>
                {'\n'}
                <span className="t-cmd">git clone</span> {REPOS[3].url}
                {'\n'}
                <span className="t-cmd">git clone</span> {REPOS[2].url}
                {'\n'}
                (cd Sideband-channels &amp;&amp; npm ci &amp;&amp; npm run build)
                {'\n'}
                cd Sideband-gateway &amp;&amp; npm ci &amp;&amp; npm run check
                {'\n\n'}
                <span className="t-dim"># synthetic channel, loopback only</span>
                {'\n'}
                DEV_PAYER_PUBLIC_KEY=G… <span className="t-cmd">npm start</span> &amp;
                {'\n'}
                <span className="t-cmd">curl</span> localhost:3001/v1/health{'\n'}
                <span className="t-ok">{'{"status":"ok","schemaVersion":1,…}'}</span>
              </code>
            </pre>
          </Reveal>
        </div>
      </section>

      <section id="download" className="section section-alt" aria-labelledby="download-h">
        <div className="wrap">
          <Reveal className="section-head">
            <p className="kicker">Try it</p>
            <h2 id="download-h">Get the payer app</h2>
            <p className="section-lede">
              Early builds for developers and testers. Expect rough edges, Testnet assets and a
              synthetic provider. See the <Link href="/devices">device support page</Link> before
              installing.
            </p>
          </Reveal>
          <Reveal>
            <Download />
          </Reveal>
        </div>
      </section>

      <section id="open-source" className="section" aria-labelledby="oss-h">
        <div className="wrap">
          <Reveal className="section-head">
            <p className="kicker">Architecture &amp; open source</p>
            <h2 id="oss-h">Four repositories, one clear boundary each.</h2>
            <p className="section-lede">
              Every component is independently tested and versioned. No payment signing lives in
              transport code, and no chain logic lives in the app.
            </p>
          </Reveal>
          <Reveal className="arch" aria-hidden="true">
            <div className="arch-node">Sideband-mobile</div>
            <div className="arch-edge">
              <span>frames</span>
            </div>
            <div className="arch-node">Sideband-protocol</div>
            <div className="arch-edge">
              <span>BLE · Wi-Fi</span>
            </div>
            <div className="arch-node">Sideband-gateway</div>
            <div className="arch-edge">
              <span>settle</span>
            </div>
            <div className="arch-node arch-chain">Sideband-channels → Stellar</div>
          </Reveal>
          <ul className="repo-grid">
            {REPOS.map((r, i) => (
              <Reveal as="li" key={r.name} delay={(i % 2) * 80}>
                <a className="repo-card" href={r.url}>
                  <div className="repo-top">
                    <IconCode size={20} />
                    <span className="repo-name mono">Sideband34/{r.name}</span>
                  </div>
                  <p className="repo-stack">{r.stack}</p>
                  <p>{r.role}</p>
                  <p className="repo-status">{r.status}</p>
                  <span className="repo-cta">
                    View repository <IconArrowRight size={16} />
                  </span>
                </a>
              </Reveal>
            ))}
          </ul>
          <Reveal className="contribute">
            <div>
              <h3>Contribute</h3>
              <p>
                Issues are scoped to real repository boundaries, each with acceptance tests. Read
                the contributing guide and pick something that matches your stack.
              </p>
            </div>
            <div className="hero-ctas">
              <a className="btn btn-primary" href={repoFile('Sideband-gateway', 'CONTRIBUTING.md')}>
                Contributing guide
              </a>
              <a
                className="btn btn-ghost"
                href={repoFile('Sideband-gateway', 'docs/CONTRIBUTOR_ISSUES.md')}
              >
                Open work
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      <section id="faq" className="section section-alt" aria-labelledby="faq-h">
        <div className="wrap faq-wrap">
          <Reveal className="section-head">
            <p className="kicker">FAQ</p>
            <h2 id="faq-h">Questions, answered plainly</h2>
          </Reveal>
          <div className="faq">
            {faq.map((f) => (
              <details key={f.q}>
                <summary>
                  <h3>{f.q}</h3>
                </summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
