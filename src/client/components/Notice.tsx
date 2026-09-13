/**
 * Operator-supplied notice HTML from server config. It is deliberately raw:
 * the deployment owner controls these strings, and the old UI rendered them
 * the same way.
 */
export function Notice({
  html,
  className = ''
}: {
  html: string;
  className?: string;
}) {
  if (!html) {
    return null;
  }
  return (
    <p
      className={`w-full p-2 border-default dark:border-grey-70 rounded-default text-orange-60 bg-yellow-40 text-center leading-normal ${className}`}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: operator config
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
