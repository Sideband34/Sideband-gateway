import { APK_RELEASES_URL } from '@/lib/site';
import { BADGE_FILES, type StoreLinks, storeLinksFromEnv } from '@/lib/stores';
import { IconAndroid, IconApple, IconArrowRight } from './Icons';

/**
 * Download options. Official store badges appear ONLY when a real listing URL is configured at
 * build time (NEXT_PUBLIC_APP_STORE_URL / NEXT_PUBLIC_PLAY_STORE_URL). Without them, Android
 * points to pre-release builds on GitHub Releases and iOS shows a coming-soon state.
 */
export function Download({ links = storeLinksFromEnv() }: { links?: StoreLinks }) {
  return (
    <div className="download-grid">
      {links.playStore ? (
        <div className="download-card">
          <IconAndroid size={28} />
          <h3>Android</h3>
          <a href={links.playStore} className="store-badge">
            {/* Official artwork supplied by the deployer under Google Play brand terms. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={BADGE_FILES.playStore} alt="Get it on Google Play" height={56} />
          </a>
        </div>
      ) : (
        <div className="download-card">
          <IconAndroid size={28} />
          <h3>Android</h3>
          <p>
            Pre-release builds are attached to tagged releases on GitHub. Testnet and synthetic
            providers only; not yet verified on physical devices.
          </p>
          <a className="btn btn-primary" href={APK_RELEASES_URL}>
            Download for Android (beta APK) <IconArrowRight size={18} />
          </a>
        </div>
      )}

      {links.appStore ? (
        <div className="download-card">
          <IconApple size={28} />
          <h3>iOS</h3>
          <a href={links.appStore} className="store-badge">
            {/* Official artwork supplied by the deployer under Apple marketing guidelines. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={BADGE_FILES.appStore} alt="Download on the App Store" height={56} />
          </a>
        </div>
      ) : (
        <div className="download-card is-muted">
          <IconApple size={28} />
          <h3>iOS</h3>
          <p>
            No iOS build is distributed yet. Bluetooth background limits on iOS need on-device work
            first.
          </p>
          <span className="btn btn-ghost is-disabled">iOS — coming soon</span>
        </div>
      )}
    </div>
  );
}
