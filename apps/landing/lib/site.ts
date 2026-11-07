// Single source for outbound links. Every URL here points at something that exists today.
export const GITHUB_ORG = 'https://github.com/Sideband34';

export const APK_RELEASES_URL = `${GITHUB_ORG}/Sideband-mobile/releases`;
/** Fixed asset name published by Sideband-mobile/.github/workflows/release.yml on every v* tag. */
export const APK_LATEST_URL = `${APK_RELEASES_URL}/latest/download/sideband-android.apk`;
export const APK_SHA256_URL = `${APK_LATEST_URL}.sha256`;

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
    status:
      'Payer app on a synthetic provider: keychain signer, crash resume, simulated channel actions; BLE adapter untested on hardware.',
  },
  {
    name: 'Sideband-protocol',
    url: `${GITHUB_ORG}/Sideband-protocol`,
    stack: 'Dart package',
    role: 'Versioned session frames, canonical encoding, session state machine, metering and transport contract.',
    status: 'Frames v2 (several sessions per channel), state machine and loopback transport.',
  },
  {
    name: 'Sideband-gateway',
    url: `${GITHUB_ORG}/Sideband-gateway`,
    stack: 'TypeScript · Node',
    role: 'Provider runtime: signed manifest, metered service, anti-replay voucher checks, settlement prep. Hosts this site.',
    status:
      'v1 API with durable stores, auth, rate limits and settle/close on a test channel adapter.',
  },
  {
    name: 'Sideband-channels',
    url: `${GITHUB_ORG}/Sideband-channels`,
    stack: 'Rust · Soroban · TypeScript',
    role: 'Payment channel contract, domain-separated cumulative commitments, settlement intents and chain adapters.',
    status:
      'Contract with top-up, settle, dispute window and refund; tested in the SDK environment, not deployed.',
  },
];

export const repoFile = (repo: string, path: string) => `${GITHUB_ORG}/${repo}/blob/main/${path}`;
