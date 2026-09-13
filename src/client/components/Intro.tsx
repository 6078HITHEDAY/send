import { WEB_UI } from '../globals.ts';
import { useTranslate } from '../i18n/context.tsx';
import { Notice } from './Notice.tsx';
import { ThunderbirdSponsor } from './ThunderbirdSponsor.tsx';

/** Shown in place of the uploads list when there is nothing to list. */
export function Intro() {
  const translate = useTranslate();
  return (
    <section className="flex flex-col items-center justify-center bg-white px-6 md:py-0 py-6 mb-0 h-full w-full dark:bg-grey-90">
      <Notice html={WEB_UI.MAIN_NOTICE_HTML} className="mt-2" />
      <div className="mt-12 flex flex-col h-full">
        <h1 className="text-3xl font-bold md:pb-2">
          {translate('introTitle')}
        </h1>
        <p className="max-w-sm leading-loose mt-6 md:mt-2 md:pr-14">
          {translate('introDescription')}
        </p>
      </div>
      <ThunderbirdSponsor className="mt-5 mb-2" />
    </section>
  );
}
