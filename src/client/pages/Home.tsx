import { useEffect } from 'react';
import { Intro } from '../components/Intro.tsx';
import { Modal } from '../components/Modal.tsx';
import { Notice } from '../components/Notice.tsx';
import { ThunderbirdSponsor } from '../components/ThunderbirdSponsor.tsx';
import { ArchiveTile } from '../components/archive/ArchiveTile.tsx';
import { EmptyUploadArea } from '../components/archive/EmptyUploadArea.tsx';
import { UploadWip } from '../components/archive/UploadWip.tsx';
import { Uploading } from '../components/archive/Uploading.tsx';
import { WEB_UI } from '../globals.ts';
import { useStore } from '../store.ts';

const FILE_LIST_POLL_MS = 2 * 60 * 1000;
const COUNTDOWN_TICK_MS = 60 * 1000;

export function Home() {
  const uploading = useStore(s => s.uploading);
  const archive = useStore(s => s.archive);
  const storage = useStore(s => s.storage);
  const modal = useStore(s => s.modal);
  const checkFiles = useStore(s => s.checkFiles);
  const touch = useStore(s => s.touch);
  useStore(s => s.revision);

  // Picks up downloads and deletions made elsewhere, and keeps the expiry
  // countdowns on each tile moving.
  useEffect(() => {
    const poll = setInterval(() => {
      if (!useStore.getState().modal) {
        checkFiles();
      }
    }, FILE_LIST_POLL_MS);
    const tick = setInterval(() => {
      const state = useStore.getState();
      if (!state.modal && state.storage.files.length > 0) {
        touch();
      }
    }, COUNTDOWN_TICK_MS);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [checkFiles, touch]);

  const archives = storage.files.filter(file => !file.expired).reverse();

  const left = uploading ? (
    <Uploading />
  ) : archive.numFiles > 0 ? (
    <UploadWip />
  ) : (
    <EmptyUploadArea />
  );

  return (
    <main className="main">
      {modal && <Modal />}
      <section className="h-full w-full p-6 md:p-8 overflow-hidden md:flex md:flex-row md:rounded-xl md:shadow-big">
        <div className="px-2 w-full md:px-0 md:mr-8 md:w-1/2">{left}</div>
        <div className="mt-6 w-full md:w-1/2 md:-m-2">
          {archives.length === 0 ? (
            <Intro />
          ) : (
            <ul className="p-2 h-full overflow-y-auto w-full">
              {archives.map(file => (
                <li key={file.id} className="mb-4 w-full">
                  <ArchiveTile archive={file} />
                </li>
              ))}
              {WEB_UI.UPLOADS_LIST_NOTICE_HTML && (
                <li className="mb-4 w-full">
                  <Notice html={WEB_UI.UPLOADS_LIST_NOTICE_HTML} />
                </li>
              )}
              {WEB_UI.SHOW_THUNDERBIRD_SPONSOR && (
                <li className="mb-4 w-full">
                  <ThunderbirdSponsor />
                </li>
              )}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
