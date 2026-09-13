import { brandedAsset } from '../assets.ts';
import { WEB_UI } from '../globals.ts';
import { useTranslate } from '../i18n/context.tsx';
import { Account } from './Account.tsx';

export function Header() {
  const translate = useTranslate();
  const icon = brandedAsset(WEB_UI.CUSTOM_ASSETS.icon, 'icon.svg');
  const wordmark = WEB_UI.CUSTOM_ASSETS.wordmark
    ? WEB_UI.CUSTOM_ASSETS.wordmark
    : `${brandedAsset('', 'wordmark.svg')}#logo`;

  return (
    <header className="main-header relative flex-none flex flex-row items-center justify-between w-full px-6 md:px-8 h-16 md:h-24 z-20 bg-transparent">
      <a className="flex flex-row items-center" href="/">
        <img alt={translate('title')} src={icon} />
        <svg viewBox="66 0 340 64" className="w-48 md:w-64">
          <use xlinkHref={wordmark} />
        </svg>
      </a>
      <Account />
    </header>
  );
}
