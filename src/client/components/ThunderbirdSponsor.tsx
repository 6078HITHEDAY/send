import { asset } from '../assets.ts';
import { WEB_UI } from '../globals.ts';
import { useTranslate } from '../i18n/context.tsx';

export function ThunderbirdSponsor({ className = '' }: { className?: string }) {
  const translate = useTranslate();
  if (!WEB_UI.SHOW_THUNDERBIRD_SPONSOR) {
    return null;
  }
  return (
    <a
      className={`w-full p-2 border-default dark:border-grey-70 rounded-default text-orange-60 bg-yellow-40 text-center leading-normal ${className}`}
      href="https://www.thunderbird.net/"
    >
      <img
        src={asset('thunderbird-icon.svg')}
        width="30"
        height="30"
        alt=""
        className="m-2 mr-3 inline-block align-middle"
      />
      {translate('sponsoredByThunderbird')}
    </a>
  );
}
