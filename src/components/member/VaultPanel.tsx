/* ----------------------------------------------------------------------------
 * Board vault: how a Board member reaches the Board's shared passwords.
 *
 * The vault is Vaultwarden, hosted on a Synology outside this site. This page
 * only links to it — no password ever passes through the website.
 * -------------------------------------------------------------------------- */
const VAULT_URL = 'https://vaultwarden.silvermist.synology.me/'
const VAULT_HOST = 'vaultwarden.silvermist.synology.me'
const CHROME_EXTENSION = 'https://chromewebstore.google.com/detail/bitwarden-password-manager/nngceckbapebfimnlniiiahkandclblb'

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
          <a className="b p-btn sm" href={VAULT_URL} target="_blank" rel="noopener noreferrer">Open the vault</a>
        </div>
        <div className="ma-row">
          <div>
            <b>2. Add it to Chrome</b>
            <span>
              Install the Bitwarden extension (Vaultwarden works with Bitwarden's apps). On its sign-in screen, change
              “Logging in on” to <strong>self-hosted</strong> and enter <strong>{VAULT_HOST}</strong> as the server.
            </span>
          </div>
          <a className="b s-btn on-light xs" href={CHROME_EXTENSION} target="_blank" rel="noopener noreferrer">Get the Chrome extension</a>
        </div>
        <div className="ma-row">
          <div>
            <b>3. On your phone (optional)</b>
            <span>Install the Bitwarden app from your app store and choose the same self-hosted server.</span>
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
