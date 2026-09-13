import type { ReactNode } from 'react';
import { WEB_UI } from '../globals.ts';
import { useTranslate } from '../i18n/context.tsx';

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <li className="m-2">
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    </li>
  );
}

export function Footer() {
  const translate = useTranslate();

  const custom = (() => {
    const { CUSTOM_FOOTER_URL, CUSTOM_FOOTER_TEXT } = WEB_UI;
    if (CUSTOM_FOOTER_URL && CUSTOM_FOOTER_TEXT) {
      return (
        <ExternalLink href={CUSTOM_FOOTER_URL}>
          {CUSTOM_FOOTER_TEXT}
        </ExternalLink>
      );
    }
    if (CUSTOM_FOOTER_URL) {
      return (
        <ExternalLink href={CUSTOM_FOOTER_URL}>
          {CUSTOM_FOOTER_URL}
        </ExternalLink>
      );
    }
    if (CUSTOM_FOOTER_TEXT) {
      return <li className="m-2">{CUSTOM_FOOTER_TEXT}</li>;
    }
    return <li className="m-2">{translate('footerText')}</li>;
  })();

  return (
    <footer className="flex flex-col md:flex-row items-start w-full flex-none self-start p-6 md:p-8 font-medium text-xs text-grey-60 dark:text-grey-40 md:items-center justify-between">
      <ul className="flex flex-col md:flex-row items-start md:items-center md:justify-start">
        {custom}
      </ul>
      <ul className="flex flex-col md:flex-row items-start md:items-center md:justify-end">
        {WEB_UI.FOOTER_DONATE_URL && (
          <ExternalLink href={WEB_UI.FOOTER_DONATE_URL}>
            {translate('footerLinkDonate')}
          </ExternalLink>
        )}
        {WEB_UI.FOOTER_CLI_URL && (
          <ExternalLink href={WEB_UI.FOOTER_CLI_URL}>
            {translate('footerLinkCli')}
          </ExternalLink>
        )}
        {WEB_UI.FOOTER_DMCA_URL && (
          <ExternalLink href={WEB_UI.FOOTER_DMCA_URL}>
            {translate('footerLinkDmca')}
          </ExternalLink>
        )}
        {WEB_UI.FOOTER_SOURCE_URL && (
          <ExternalLink href={WEB_UI.FOOTER_SOURCE_URL}>
            {translate('footerLinkSource')}
          </ExternalLink>
        )}
      </ul>
    </footer>
  );
}
