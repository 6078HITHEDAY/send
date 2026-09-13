import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore } from '../store.ts';

function getString(item: DataTransferItem): Promise<string> {
  return new Promise(resolve => {
    item.getAsString(resolve);
  });
}

/**
 * Drag-and-drop and paste both add files to the archive, and both only apply on
 * the home route while no upload is running. Replaces the old dragManager and
 * pasteManager choo plugins.
 */
export function useDropAndPaste() {
  const location = useLocation();
  const addFiles = useStore(s => s.addFiles);
  const onHome = location.pathname === '/';

  useEffect(() => {
    if (!onHome) {
      return;
    }

    const isBusy = () => useStore.getState().uploading;

    const onDragOver = (event: DragEvent) => event.preventDefault();

    const onDrop = (event: DragEvent) => {
      if (isBusy() || !event.dataTransfer?.files) {
        return;
      }
      event.preventDefault();
      addFiles(Array.from(event.dataTransfer.files));
    };

    const onPaste = async (event: ClipboardEvent) => {
      const target = event.target as HTMLInputElement | null;
      if (isBusy() || !event.clipboardData) {
        return;
      }
      if (target && ['password', 'text', 'email'].includes(target.type)) {
        return;
      }

      const items = Array.from(event.clipboardData.items);
      const transferFiles = items.filter(item => item.kind === 'file');
      const strings = items.filter(item => item.kind === 'string');

      if (transferFiles.length) {
        // Pasted images arrive as a file plus a sibling string holding the name.
        const files = (
          await Promise.all(
            transferFiles.map(async (item, i) => {
              const blob = item.getAsFile();
              if (!blob) {
                return null;
              }
              const sibling = strings[i];
              const name = sibling ? await getString(sibling) : blob.name;
              return new File([blob], name, { type: blob.type });
            })
          )
        ).filter((file): file is File => file !== null);
        if (files.length) {
          addFiles(files);
        }
        return;
      }

      const first = strings[0];
      if (first) {
        const text = await getString(first);
        addFiles([new File([text], 'pasted.txt', { type: 'text/plain' })]);
      }
    };

    document.body.addEventListener('dragover', onDragOver);
    document.body.addEventListener('drop', onDrop);
    window.addEventListener('paste', onPaste);
    return () => {
      document.body.removeEventListener('dragover', onDragOver);
      document.body.removeEventListener('drop', onDrop);
      window.removeEventListener('paste', onPaste);
    };
  }, [onHome, addFiles]);
}
