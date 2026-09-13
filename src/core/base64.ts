// URL-safe, unpadded base64. The wire format of secret keys, nonces, auth
// tags and encrypted metadata depends on this exact alphabet and padding
// behaviour, so it must stay byte-compatible with existing Send links.

export function arrayToB64(array: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i] as number);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// The explicit `ArrayBuffer` type argument (rather than the default
// `ArrayBufferLike`) lets the result be passed straight to WebCrypto, which
// rejects `SharedArrayBuffer`-backed views.
export function b64ToArray(str: string): Uint8Array<ArrayBuffer> {
  const padded = str + '==='.slice((str.length + 3) % 4);
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return array;
}
