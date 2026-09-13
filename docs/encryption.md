# File encryption

Send encrypts in the browser with the
[Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
(AES-GCM) before upload. Implementation:
[`src/core/keychain.ts`](../src/core/keychain.ts),
[`src/core/ece.ts`](../src/core/ece.ts), and the transfer helpers under `src/core/`.

## Upload

1. Generate a random secret key (`crypto.getRandomValues`).
2. Derive keys with HKDF-SHA-256:
   - file encryption keys for ECE ([RFC 8188](https://tools.ietf.org/html/rfc8188)) AES-GCM records
   - metadata encryption key (AES-GCM)
   - request authentication key (HMAC-SHA-256)
3. Encrypt file bytes and metadata.
4. Upload ciphertext over WebSocket (`/api/ws`) or the HTTP fallback (`POST /api/upload`),
   authenticating with a `send-v1` signature.
5. Server returns an id, owner token, and share URL **without** the secret.
6. Client appends the secret as a URL fragment: `/download/<id>#<secret>`.

## Download

1. Load the share page; the HTML shell seeds an auth nonce.
2. Read the secret from `location.hash` (never from the path).
3. Derive the same keys as on upload.
4. Sign the nonce and fetch encrypted metadata, then decrypt it for the UI.
5. Authenticated download of ciphertext; decrypt in the browser and save.

## Passwords

Optional download passwords replace the HMAC auth key:

1. Uploader derives a new auth key with PBKDF2 from the password **and** the full
   share URL (including `#secret`).
2. Owner-authenticated API call stores the new auth key and marks the file as
   password-protected.
3. Downloader must enter the same password; the fragment key alone is not enough.

## Threat model (short)

| Party | Sees |
| --- | --- |
| Server / hoster | Ciphertext, encrypted metadata, owner token, auth material |
| Network observer | Same as server on HTTPS body; not the `#secret` |
| Recipient with link | Plaintext after decrypting in their browser |

The hoster cannot decrypt uploads if they never learn the fragment secret (and
password, when set).
