/**
 * All call sites run inside a click handler, which is what the async clipboard
 * API requires. The old `document.execCommand('copy')` dance and its hidden
 * input are gone with the pre-Clipboard-API browsers.
 */
export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text).catch(e => {
    console.error(e);
  });
}
