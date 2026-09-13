import { useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import type FileReceiver from '../../core/fileReceiver.ts';
import { DownloadCompleted } from '../components/DownloadCompleted.tsx';
import { DownloadPassword } from '../components/DownloadPassword.tsx';
import { Modal } from '../components/Modal.tsx';
import { NoStreams } from '../components/NoStreams.tsx';
import { Downloading } from '../components/archive/Downloading.tsx';
import { Preview } from '../components/archive/Preview.tsx';
import { downloadMetadata } from '../globals.ts';
import { useTranslate } from '../i18n/context.tsx';
import { useStore } from '../store.ts';
import { NotFound } from './NotFound.tsx';

/** Above this, buffering the whole plaintext in memory is not viable. */
const BIG_SIZE = 1024 * 1024 * 256;

export function Download() {
  const translate = useTranslate();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const capabilities = useStore(s => s.capabilities);
  const fileInfo = useStore(s => s.fileInfo);
  const transfer = useStore(s => s.transfer) as FileReceiver | null;
  const modal = useStore(s => s.modal);
  const startDownload = useStore(s => s.startDownload);
  const getMetadata = useStore(s => s.getMetadata);
  useStore(s => s.revision);

  const meta = downloadMetadata();
  // The secret key lives only in the fragment. React Router never sees it as a
  // route parameter, and it is never put in a request.
  const secretKey = location.hash.replace(/^#/, '');

  useEffect(() => {
    if (!id || meta.status === 404) {
      return;
    }
    if (!meta.nonce) {
      // Arrived without a server-seeded nonce, e.g. via the back button.
      window.location.reload();
      return;
    }
    startDownload({
      id,
      secretKey,
      nonce: meta.nonce,
      requiresPassword: meta.pwd
    });
  }, [id, secretKey, meta.nonce, meta.pwd, meta.status, startDownload]);

  useEffect(() => {
    if (fileInfo && !transfer && !fileInfo.requiresPassword) {
      getMetadata();
    }
  }, [fileInfo, transfer, getMetadata]);

  if (meta.status === 404) {
    return <NotFound />;
  }

  const content = (() => {
    if (transfer) {
      switch (transfer.state) {
        case 'downloading':
        case 'decrypting':
          return (
            <div className="flex flex-col w-full h-full items-center md:justify-center md:-mt-8">
              <h1 className="text-3xl font-bold mb-4">
                {translate('downloadingTitle')}
              </h1>
              <Downloading fileInfo={transfer.fileInfo} />
            </div>
          );
        case 'complete':
          return <DownloadCompleted />;
        default:
          if (
            !capabilities.streamDownload &&
            (transfer.fileInfo.size ?? 0) > BIG_SIZE
          ) {
            return <NoStreams fileInfo={transfer.fileInfo} />;
          }
          return (
            <div className="flex flex-col w-full max-w-md h-full mx-auto items-center justify-center">
              <h1 className="text-3xl font-bold mb-4">
                {translate('downloadTitle')}
              </h1>
              <p className="w-full text-grey-80 text-center leading-normal dark:text-grey-40">
                {translate('downloadDescription')}
              </p>
              <Preview fileInfo={transfer.fileInfo} />
            </div>
          );
      }
    }
    if (fileInfo?.requiresPassword && !fileInfo.password) {
      return <DownloadPassword fileInfo={fileInfo} />;
    }
    return null;
  })();

  return (
    <main className="main">
      {modal && <Modal />}
      <section className="relative h-full w-full p-6 md:p-8 md:rounded-xl md:shadow-big">
        {content}
      </section>
    </main>
  );
}
