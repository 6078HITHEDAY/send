import { percent } from '../../../core/utils.ts';
import { useTranslate } from '../../i18n/context.tsx';
import { useStore } from '../../store.ts';
import { ArchiveInfo } from '../FileEntry.tsx';
import { expiryInfo } from './expiryInfo.ts';

export function Uploading() {
  const translate = useTranslate();
  const archive = useStore(s => s.archive);
  const progress = useStore(s => s.progressRatio);
  const cancel = useStore(s => s.cancel);
  const progressPercent = percent(progress);

  return (
    <div className="flex flex-col items-start rounded-default shadow-light bg-white p-4 w-full dark:bg-grey-90">
      <ArchiveInfo archive={archive} />
      <div className="text-xs opacity-75 w-full mt-2 mb-2">
        {expiryInfo(translate, {
          dlimit: archive.dlimit,
          dtotal: 0,
          expiresAt: Date.now() + 500 + archive.timeLimit * 1000
        })}
      </div>
      <div className="link-primary text-sm font-medium mt-2">
        {progressPercent}
      </div>
      <progress className="my-3" value={progress}>
        {progressPercent}
      </progress>
      <button
        type="button"
        className="link-primary self-end font-medium"
        onClick={cancel}
        title={translate('deletePopupCancel')}
      >
        {translate('deletePopupCancel')}
      </button>
    </div>
  );
}
