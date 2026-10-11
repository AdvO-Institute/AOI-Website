/* ----------------------------------------------------------------------------
 * Board vault: how a Board member reaches the Board's shared passwords.
 *
 * The vault is Vaultwarden, hosted on a Synology outside this site. This page
 * only links to it — no password ever passes through the website.
 * -------------------------------------------------------------------------- */
const VAULT_URL = 'https://vaultwarden.silvermist.synology.me/'
const SERVER_URL = 'https://vaultwarden.silvermist.synology.me'
const CHROME_EXTENSION = 'https://chromewebstore.google.com/detail/bitwarden-password-manager/nngceckbapebfimnlniiiahkandclblb'
const IPHONE_APP = 'https://apps.apple.com/us/app/bitwarden-password-manager/id1137397744'
const ANDROID_APP = 'https://play.google.com/store/apps/details?id=com.x8bit.bitwarden'

const out = { target: '_blank', rel: 'noopener noreferrer' } as const

export default function VaultPanel() {
  return (
    <>
      <h1>Board vault</h1>
      <div className="ma-sub">
        The Board's shared passwords, kept in a private vault. This page only links to it — the website never sees the passwords.
      </div>
      <div className="ma-panel">
        <div className="ma-row">
          <div>
            <b>1. Open the vault</b>
            <span>Sign in with your vault email and master password. This is a separate login from this website.</span>
          </div>
          <a className="b p-btn sm" href={VAULT_URL} {...out}>Open the vault</a>
        </div>
        <div className="ma-row">
          <div>
            <b>2. Add it to Chrome</b>
            <span>Vaultwarden works with Bitwarden's extension. Install it, then sign in as shown in step 4.</span>
          </div>
          <a className="b s-btn on-light xs" href={CHROME_EXTENSION} {...out}>Get the Chrome extension</a>
        </div>
        <div className="ma-row">
          <div>
            <b>3. On your phone (optional)</b>
            <span>Install the Bitwarden app, then sign in as shown in step 4.</span>
          </div>
          {/* The stores' own badges, used as their guidelines ask: unaltered, each linking to the app. */}
          <div className="vault-badges">
            <a href={IPHONE_APP} {...out}><img src="/images/badges/app-store.svg" alt="Download on the App Store" /></a>
            <a href={ANDROID_APP} {...out}><img className="gp" src="/images/badges/google-play.png" alt="Get it on Google Play" /></a>
          </div>
        </div>
        <div className="ma-row">
          <div>
            <b>4. Sign in to our server, not Bitwarden's</b>
            <span>The extension and the apps start out pointed at Bitwarden's own service. Before you sign in:</span>
            <ol className="vault-steps">
              <li>On the sign-in screen, find <strong>Logging in on</strong> (it shows <strong>bitwarden.com</strong>) and choose <strong>Self-hosted</strong>.</li>
              <li>Under <strong>Server URL</strong>, enter <strong>{SERVER_URL}</strong> and tap <strong>Save</strong>.</li>
              <li>Enter your vault email, then your master password.</li>
            </ol>
            <span>You only do this once on each device.</span>
          </div>
        </div>
        <div className="ma-note">
          <b>Don't have a login?</b> Contact James Beadle and he'll set you up.
          Keep your master password somewhere safe — no one, including James, can recover it.
        </div>
      </div>
    </>
  )
}
