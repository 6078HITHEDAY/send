import type { TranslateFn } from '../../../core/utils.ts';
import { timeLeft } from '../../../core/utils.ts';

export interface Expiry {
  dlimit: number;
  dtotal: number;
  expiresAt: number;
}

/** "Expires after 1 download or 23h 59m" */
export function expiryInfo(translate: TranslateFn, expiry: Expiry): string {
  const l10n = timeLeft(expiry.expiresAt - Date.now());
  return translate('archiveExpiryInfo', {
    downloadCount: translate('downloadCount', {
      num: expiry.dlimit - expiry.dtotal
    }),
    timespan: translate(l10n.id, { ...l10n })
  });
}
