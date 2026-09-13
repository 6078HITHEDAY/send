import { secondsToL10nId } from '../../core/utils.ts';
import { DEFAULTS } from '../globals.ts';
import { useTranslate } from '../i18n/context.tsx';
import { useStore } from '../store.ts';
import { Selectbox } from './Selectbox.tsx';

const DL_SLOT = '\u0000dlCount\u0000';
const TIME_SLOT = '\u0000timespan\u0000';
const SLOTS = /\u0000(dlCount|timespan)\u0000/;

/**
 * `archiveExpiryInfo` is a sentence with two interpolated values, so the
 * selects have to appear inline wherever the translation puts them. The old
 * code injected raw HTML and swapped the placeholders out of the DOM; here the
 * translated string is split on sentinels and the selects rendered in place.
 */
export function ExpiryOptions() {
  const translate = useTranslate();
  const archive = useStore(s => s.archive);
  const capabilities = useStore(s => s.capabilities);
  const user = useStore(s => s.user);
  const touch = useStore(s => s.touch);

  const counts = DEFAULTS.DOWNLOAD_COUNTS.filter(
    i => capabilities.account || i <= user.maxDownloads
  );
  const expiries = DEFAULTS.EXPIRE_TIMES_SECONDS.filter(
    i => capabilities.account || i <= user.maxExpireSeconds
  );

  const template = translate('archiveExpiryInfo', {
    downloadCount: DL_SLOT,
    timespan: TIME_SLOT
  });

  return (
    <div className="px-1">
      {template.split(SLOTS).map((part, index) => {
        if (part === 'dlCount') {
          return (
            <Selectbox
              key="dlCount"
              id="expire-after-dl-count-select"
              selected={archive.dlimit}
              options={counts}
              label={num => translate('downloadCount', { num })}
              onChange={value => {
                archive.dlimit = value;
                touch();
              }}
            />
          );
        }
        if (part === 'timespan') {
          return (
            <Selectbox
              key="timespan"
              id="expire-after-time-select"
              selected={archive.timeLimit}
              options={expiries}
              label={num => {
                const l10n = secondsToL10nId(num);
                return translate(l10n.id, { ...l10n });
              }}
              onChange={value => {
                archive.timeLimit = value;
                touch();
              }}
            />
          );
        }
        // biome-ignore lint/suspicious/noArrayIndexKey: literal text segments
        return <span key={index}>{part}</span>;
      })}
    </div>
  );
}
