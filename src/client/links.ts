/**
 * A transfer dies if the page navigates away, so while one is running every
 * link on the page opens in a new tab instead.
 */
export function openLinksInNewTab(
  links?: HTMLAnchorElement[],
  should = true
): HTMLAnchorElement[] {
  const targets =
    links ??
    Array.from(document.querySelectorAll<HTMLAnchorElement>('a:not([target])'));
  for (const link of targets) {
    if (should) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    } else {
      link.removeAttribute('target');
      link.removeAttribute('rel');
    }
  }
  return targets;
}
