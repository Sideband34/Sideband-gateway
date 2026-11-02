// Store listings are opt-in at build time. Sideband is NOT published in any store today, so by
// default no store link or badge is rendered. Set these only once a real listing exists:
//   NEXT_PUBLIC_APP_STORE_URL=https://apps.apple.com/...
//   NEXT_PUBLIC_PLAY_STORE_URL=https://play.google.com/store/apps/details?id=...
// and add the official badge artwork (see apps/landing/README.md).

export type StoreLinks = { appStore?: string; playStore?: string };

const ALLOWED_HOSTS = {
  appStore: ['apps.apple.com'],
  playStore: ['play.google.com'],
} as const;

/** Returns the URL only if it is an https link on the vendor's own store host. */
export function parseStoreUrl(
  raw: string | undefined,
  kind: keyof typeof ALLOWED_HOSTS,
): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return undefined;
    if (!(ALLOWED_HOSTS[kind] as readonly string[]).includes(url.hostname)) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export function storeLinksFromEnv(): StoreLinks {
  // Literal `process.env.NEXT_PUBLIC_*` access so Next.js can inline the values at build time.
  return {
    appStore: parseStoreUrl(process.env.NEXT_PUBLIC_APP_STORE_URL, 'appStore'),
    playStore: parseStoreUrl(process.env.NEXT_PUBLIC_PLAY_STORE_URL, 'playStore'),
  };
}

export const BADGE_FILES = {
  appStore: '/badges/app-store.svg',
  playStore: '/badges/google-play.png',
} as const;
