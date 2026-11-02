// Single source for outbound links. Every URL here points at something that exists today.
export const GITHUB_ORG = 'https://github.com/Sideband34';

export const APK_RELEASES_URL = `${GITHUB_ORG}/Sideband-mobile/releases`;

export type Repo = {
  name: string;
  url: string;
  stack: string;
  role: string;
  status: string;
};

export const REPOS: Repo[] = [
  {
    name: 'Sideband-mobile',
    url: `${GITHUB_ORG}/Sideband-mobile`,
    stack: 'Flutter · Dart',
    role: 'Payer app: discovery UX, spend limits, voucher signing, history and receipts.',
    status: 'Payer domain and app shell on a synthetic provider; no BLE yet.',
  },
  {
    name: 'Sideband-protocol',
    url: `${GITHUB_ORG}/Sideband-protocol`,
    stack: 'Dart package',
    role: 'Versioned session frames, canonical encoding, session state machine, metering and transport contract.',
    status: 'Frames, state machine and loopback transport; BLE/Wi-Fi adapters planned.',
  },
  {
    name: 'Sideband-gateway',
    url: `${GITHUB_ORG}/Sideband-gateway`,
    stack: 'TypeScript · Node',
    role: 'Provider runtime: signed manifest, metered service, anti-replay voucher checks, settlement prep. Hosts this site.',
    status: 'v1 API with durable stores, auth and rate limits on a test channel adapter.',
  },
  {
    name: 'Sideband-channels',
    url: `${GITHUB_ORG}/Sideband-channels`,
    stack: 'Rust · Soroban · TypeScript',
    role: 'Payment channel contract, domain-separated cumulative commitments, settlement intents and chain adapters.',
    status: 'Reference contract tested in the Soroban SDK environment; not deployed.',
  },
];

export const repoFile = (repo: string, path: string) => `${GITHUB_ORG}/${repo}/blob/main/${path}`;
