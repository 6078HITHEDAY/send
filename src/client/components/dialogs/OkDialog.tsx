import { useTranslate } from '../../i18n/context.tsx';

export function OkDialog({
  message,
  close
}: {
  message: string;
  close: () => void;
}) {
  const translate = useTranslate();
  return (
    <div className="flex flex-col max-w-sm p-4 m-auto">
      <h2 className="text-center text-xl font-bold m-8 leading-normal">
        {message}
      </h2>
      <button
        type="button"
        className="btn rounded-lg w-full flex-shrink-0"
        onClick={close}
        title={translate('okButton')}
      >
        {translate('okButton')}
      </button>
    </div>
  );
}
