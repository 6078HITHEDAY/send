import { useEffect } from 'react';
import { percent } from '../../core/utils.ts';
import { updateFavicon } from '../favicon.ts';
import { useStore } from '../store.ts';

/**
 * While the tab is in the background the title shows transfer progress, so an
 * upload can be watched from another tab.
 */
export function useTransferTitle() {
  const progressRatio = useStore(s => s.progressRatio);
  const transfer = useStore(s => s.transfer);

  useEffect(() => {
    const onBlur = () => {
      if (useStore.getState().transfer) {
        document.title = percent(useStore.getState().progressRatio);
      }
    };
    const onFocus = () => {
      document.title = 'Send';
      updateFavicon(0);
    };
    document.addEventListener('blur', onBlur);
    document.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('blur', onBlur);
      document.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    if (transfer && !document.hasFocus()) {
      document.title = percent(progressRatio);
    }
  }, [transfer, progressRatio]);
}
