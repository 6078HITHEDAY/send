import pkg from '../../../../package.json' with { type: 'json' };
import { browserName } from '../../../core/utils.ts';
import { PREFS } from '../../globals.ts';
import { useStore } from '../../store.ts';

export function SurveyDialog({ close }: { close: () => void }) {
  const user = useStore(s => s.user);
  const storage = useStore(s => s.storage);
  const params = new URLSearchParams({
    ver: pkg.version,
    browser: browserName(),
    anon: String(user.loggedIn),
    active_count: String(storage.files.length)
  });
  const surveyUrl = `${PREFS.surveyUrl}?${params.toString()}`;

  return (
    <div className="flex flex-col items-center text-center p-4 max-w-sm m-auto">
      <h1 className="text-3xl font-bold my-4">Tell us what you think.</h1>
      <p className="font-normal leading-normal text-grey-80 px-4">
        Love Send? Take a quick survey to let us know how we can make it better.
      </p>
      <a
        className="btn rounded-lg w-full flex-shrink-0 focus:outline my-5"
        onClick={close}
        title="Give feedback"
        href={surveyUrl}
        target="_blank"
        rel="noreferrer"
      >
        Give feedback
      </a>
      <button
        type="button"
        className="link-primary font-medium cursor-pointer focus:outline"
        onClick={close}
        title="Skip"
      >
        Skip
      </button>
    </div>
  );
}
