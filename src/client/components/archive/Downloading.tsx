import type { FileInfo } from '../../../core/fileReceiver.ts';
import { percent } from '../../../core/utils.ts';
import { useStore } from '../../store.ts';
import { ArchiveInfo } from '../FileEntry.tsx';

export function Downloading({ fileInfo }: { fileInfo: FileInfo }) {
  const progress = useStore(s => s.progressRatio);
  const progressPercent = percent(progress);

  return (
    <div className="flex flex-col bg-white rounded-default shadow-light p-4 w-full max-w-sm md:w-128 dark:bg-grey-90">
      <ArchiveInfo
        archive={{ name: fileInfo.name ?? '', size: fileInfo.size ?? 0 }}
      />
      <div className="link-primary text-sm font-medium mt-2">
        {progressPercent}
      </div>
      <progress className="my-3" value={progress}>
        {progressPercent}
      </progress>
    </div>
  );
}
