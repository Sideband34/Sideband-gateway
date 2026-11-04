/**
 * LIVE session against a running gateway (ADAPTER=soroban) and a channel deployed by
 * Sideband-channels/scripts/deploy-testnet.sh. Testnet only, synthetic.
 *
 *   GATEWAY_URL=http://127.0.0.1:5001 ADMIN_TOKEN=... CHANNEL_ENV=../Sideband-channels/.testnet-channel-gw.env \
 *     npx tsx scripts/testnet-session.ts [settle|close]
 *
 * Flow: offer -> accept -> unpaid serve (402) -> payer-signed voucher -> serve -> meter -> usage -> admin settle
 * (or close) -> poll the settlement until the ledger confirms -> compare with the on-chain channel state.
 * The payer secret is read in memory from the stellar-cli keystore (`stellar keys show`) and is never printed or written.
 * Output evidence (public ids and hashes only): docs/testnet-session.json
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { Keypair } from '@stellar/stellar-sdk';
import { NETWORK_PASSPHRASES, createVoucher, keypairSigner, parseAmount } from '@sideband/channels';

const BASE = process.env.GATEWAY_URL ?? 'http://127.0.0.1:5001';
const ADMIN = process.env.ADMIN_TOKEN ?? '';
const CHANNEL_ENV = process.env.CHANNEL_ENV ?? '../Sideband-channels/.testnet-channel.env';
const mode =
  process.argv[2] === 'close' ? 'close' : process.argv[2] === 'autoclose' ? 'autoclose' : 'settle';
const OUT = 'docs/testnet-session.json';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const env = Object.fromEntries(
  readFileSync(CHANNEL_ENV, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
) as Record<string, string>;

function secretOf(alias: string): Keypair {
  const r = spawnSync('stellar', ['keys', 'show', alias], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`no stellar-cli key named ${alias}`);
  return Keypair.fromSecret(r.stdout.trim());
}

async function call(
  method: string,
  path: string,
  o: { body?: unknown; headers?: Record<string, string> } = {},
) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(o.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(o.headers ?? {}),
    },
    ...(o.body !== undefined ? { body: JSON.stringify(o.body) } : {}),
  });
  return { status: res.status, json: (await res.json()) as Json, headers: res.headers };
}

function need(cond: unknown, msg: string, ctx?: unknown): asserts cond {
  if (!cond)
    throw new Error(
      `LIVE SESSION FAILED: ${msg}${ctx !== undefined ? `\n${JSON.stringify(ctx, null, 2).slice(0, 1500)}` : ''}`,
    );
}

const steps: { name: string; detail?: unknown }[] = [];
const note = (name: string, detail?: unknown) => {
  steps.push({ name, ...(detail !== undefined ? { detail } : {}) });
  console.log(`OK ${name}${detail !== undefined ? ' ' + JSON.stringify(detail) : ''}`);
};

async function main(): Promise<void> {
  const payer = secretOf(env.PAYER ?? 'sideband-payer');
  need(payer.publicKey() === env.PAYER_ADDR, 'payer key matches the channel env');
  const channelId = env.CHANNEL_ID!;
  const admin = { 'x-admin-token': ADMIN };

  const offerRes = await call('POST', '/v1/sessions/offer', { body: { schemaVersion: 1 } });
  need(offerRes.status < 300 && offerRes.json.type === 'service_offer', 'offer', offerRes.json);
  const auth = { authorization: `Bearer ${offerRes.headers.get('x-sideband-session-token')}` };
  const session = offerRes.json.session as string;
  note('offer received', { session });

  const acc = await call('POST', '/v1/sessions/accept', {
    headers: auth,
    body: {
      type: 'session_accept',
      v: 1,
      session,
      channelRef: channelId,
      maxSpend: '1',
      nonce: `live-${Date.now()}`,
    },
  });
  need(acc.json.status === 'active', 'accept against the REAL on-chain channel', acc.json);
  note('accepted; gateway read the channel from Soroban', { channelId });

  const unpaid = await call('POST', `/v1/sessions/${session}/serve`, {
    headers: auth,
    body: { text: 'hello sideband' },
  });
  need(
    unpaid.status === 402 && unpaid.json.error?.code === 'payment_required',
    'unpaid request gets 402',
    unpaid.json,
  );
  note('402 payment_required', { requiredCumulative: unpaid.json.error.requiredCumulative });

  const amount = unpaid.json.error.requiredCumulative as string;
  const voucher = createVoucher(
    keypairSigner(payer),
    {
      networkPassphrase: NETWORK_PASSPHRASES.testnet,
      channelId,
      payer: payer.publicKey(),
      provider: env.PROVIDER_ADDR!,
    },
    parseAmount(amount),
  );
  const vr = await call('POST', `/v1/sessions/${session}/vouchers`, {
    headers: auth,
    body: { type: 'voucher', v: 1, session, ...voucher },
  });
  need(
    vr.status === 200 && vr.json.status === 'COMMITMENT_ACCEPTED_NOT_SETTLED',
    'voucher accepted (not yet settled)',
    vr.json,
  );
  note('voucher accepted, honestly NOT settled', { status: vr.json.status });

  const replay = await call('POST', `/v1/sessions/${session}/vouchers`, {
    headers: auth,
    body: { type: 'voucher', v: 1, session, ...voucher },
  });
  need(replay.status === 409, 'replayed voucher refused', replay.json);
  note('replayed voucher refused (409)');

  const served = await call('POST', `/v1/sessions/${session}/serve`, {
    headers: auth,
    body: { text: 'hello sideband' },
  });
  need(
    served.status === 200 && served.json.output === 'HELLO SIDEBAND',
    'paid request served',
    served.json,
  );
  note('paid request served', { units: served.json.units });

  const usage = await call('GET', `/v1/sessions/${session}/usage`, { headers: auth });
  note('usage', {
    units: usage.json.units,
    owed: usage.json.owed,
    settlement: usage.json.settlement,
  });

  if (mode === 'autoclose') {
    // The payer starts a close on-chain (stellar-cli signs with the keystore alias); the gateway, running with
    // AUTO_SETTLE_AMOUNT > 0, must answer inside the dispute window by closing with the highest voucher.
    const cs = spawnSync(
      'stellar',
      [
        'contract',
        'invoke',
        '--id',
        channelId,
        '--source',
        env.PAYER ?? 'sideband-payer',
        '--network',
        'testnet',
        '--',
        'close_start',
      ],
      { encoding: 'utf8' },
    );
    need(cs.status === 0, 'payer close_start', (cs.stderr ?? '').slice(0, 400));
    note('payer started a close on-chain', {
      closeStartTx: /tx\/([0-9a-f]{64})/.exec(`${cs.stdout}${cs.stderr}`)?.[1],
    });
    let s2: Json = {};
    for (let i = 0; i < 60; i++) {
      s2 = (await call('GET', `/v1/channels/${channelId}/status`, { headers: admin })).json;
      if (s2.onChainStatus === 'closed') break;
      await new Promise((r) => setTimeout(r, 5000));
    }
    need(
      s2.onChainStatus === 'closed' && s2.withdrawn === amount,
      'gateway answered the payer close with the highest voucher inside the window',
      s2,
    );
    note('gateway auto-closed with the highest voucher', {
      withdrawn: s2.withdrawn,
      txHash: s2.settlement?.txHash,
    });
    const outAuto = {
      network: 'testnet',
      gateway: BASE,
      channelId,
      payer: env.PAYER_ADDR,
      provider: env.PROVIDER_ADDR,
      mode,
      requiredCumulative: amount,
      settlement: s2.settlement,
      onChainStatus: s2.onChainStatus,
      withdrawn: s2.withdrawn,
      steps,
      at: new Date().toISOString(),
    };
    writeFileSync(OUT, JSON.stringify(outAuto, null, 2) + '\n');
    return;
  }

  const settle = await call('POST', `/v1/channels/${channelId}/settle`, {
    headers: admin,
    ...(mode === 'close' ? { body: { mode: 'close' } } : {}),
  });
  need(settle.status === 202, `admin ${mode} accepted as in-flight`, settle.json);
  note(`${mode} submitted`, { state: settle.json.state, amount: settle.json.amount });

  let st: Json = {};
  for (let i = 0; i < 40; i++) {
    st = (await call('GET', `/v1/channels/${channelId}/status`, { headers: admin })).json;
    if (st.settlement?.state === 'CONFIRMED') break;
    await new Promise((r) => setTimeout(r, 5000));
  }
  need(st.settlement?.state === 'CONFIRMED', 'settlement confirmed by the ledger', st);
  note(`${mode} CONFIRMED`, {
    txHash: st.settlement.txHash,
    onChainStatus: st.onChainStatus,
    withdrawn: st.withdrawn,
  });

  const out = {
    network: 'testnet',
    gateway: BASE,
    channelId,
    payer: env.PAYER_ADDR,
    provider: env.PROVIDER_ADDR,
    mode,
    requiredCumulative: amount,
    settlement: st.settlement,
    onChainStatus: st.onChainStatus,
    withdrawn: st.withdrawn,
    steps,
    at: new Date().toISOString(),
  };
  writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
