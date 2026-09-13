import type { FileInfo } from '../../../core/fileReceiver.ts';
import { WEB_UI } from '../../globals.ts';
import { useTranslate } from '../../i18n/context.tsx';
import { useStore } from '../../store.ts';
import { ArchiveDetails } from '../ArchiveDetails.tsx';
import { ArchiveInfo } from '../FileEntry.tsx';
import { Notice } from '../Notice.tsx';
import { ThunderbirdSponsor } from '../ThunderbirdSponsor.tsx';

/** What the recipient sees before starting the download. */
export function Preview({ fileInfo }: { fileInfo: FileInfo }) {
  const translate = useTranslate();
  const download = useStore(s => s.download);
  const files = (fileInfo.manifest as { files?: unknown[] } | undefined)?.files;
  const single = !files || files.length === 1;

  return (
    <div className="flex flex-col max-h-full bg-white p-4 w-full md:w-128 dark:bg-grey-90">
      <div className="border-default rounded-default py-3 px-6 dark:border-grey-70">
        <ArchiveInfo
          archive={{ name: fileInfo.name ?? '', size: fileInfo.size ?? 0 }}
        />
        {!single && (
          <div className="mt-4 h-full md:h-48 overflow-y-auto">
            <ArchiveDetails manifest={fileInfo.manifest} defaultOpen />
          </div>
        )}
      </div>
      <button
        type="button"
        id="download-btn"
        className="btn rounded-lg mt-4 w-full flex-shrink-0 focus:outline"
        title={translate('downloadButtonLabel')}
        onClick={() => download()}
      >
        {translate('downloadButtonLabel')}
      </button>
      <Notice html={WEB_UI.DOWNLOAD_NOTICE_HTML} className="mt-4" />
      <ThunderbirdSponsor className="mt-5 mb-2" />
    </div>
  );
}
