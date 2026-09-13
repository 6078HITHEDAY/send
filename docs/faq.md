# FAQ

## How large a file can I send?

The default limit is about **2.5 GiB** (`MAX_FILE_SIZE`). Operators can raise or
lower it. Encryption and decryption run in the browser, so very large files need
enough memory on the client. For everyday machines, a few hundred megabytes is
the most reliable range.

## Which browsers work?

A current browser with Web Crypto (AES-GCM), WebSocket, and Streams support is
required — recent Firefox, Chrome, Edge, or Safari. Very old browsers are not
supported.

## Why does Send need JavaScript?

Encryption, decryption, the UI, and localization all run in the browser. Without
JavaScript the client cannot keep the server from seeing plaintext.

## How long do files stay available?

By default links expire after **24 hours** or when the download limit is reached
(default **1** download), whichever comes first. Both are configurable
(`DEFAULT_EXPIRE_SECONDS`, `DEFAULT_DOWNLOADS`, and the related allow-lists).

## Can a file be downloaded more than once?

Yes. The uploader can pick a download count from the values in
`DOWNLOAD_COUNTS` (capped by `MAX_DOWNLOADS`).

## Is the download password sent to the server?

No. The password is used only in the browser to derive the auth key (PBKDF2)
together with the share URL. The server stores the derived auth material, not
your password.

## Where is the encryption key?

In the URL fragment after `#`. Browsers do not send fragments to the server, so
the hosting operator cannot decrypt your files from logs alone. Share links look
like `/download/<id>#<secret>`.

## Do I need Redis to try it locally?

Not in development. With `NODE_ENV=development` and `REDIS_HOST=localhost` the
server uses an in-memory Redis stub. Production deployments should run a real
Redis and point `REDIS_HOST` at it.

## Where did Android / the old webpack docs go?

They described stacks this rewrite no longer ships. Snapshots live under
[`docs/archive/`](archive/) for history only.
