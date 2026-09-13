import { useStore } from '../store.ts';
import { CopyDialog } from './dialogs/CopyDialog.tsx';
import { OkDialog } from './dialogs/OkDialog.tsx';
import { ShareDialog } from './dialogs/ShareDialog.tsx';
import { SignupDialog } from './dialogs/SignupDialog.tsx';
import { SurveyDialog } from './dialogs/SurveyDialog.tsx';

/**
 * Modals used to be functions returning a vnode plus a `type` tag; they are now
 * a discriminated union in the store, and this switch is the only place that
 * maps a tag to a component.
 */
export function Modal() {
  const modal = useStore(s => s.modal);
  const close = useStore(s => s.closeModal);

  if (!modal) {
    return null;
  }

  const content = (() => {
    switch (modal.type) {
      case 'ok':
        return <OkDialog message={modal.message} close={close} />;
      case 'copy':
        return (
          <CopyDialog name={modal.name} url={modal.url} close={close} />
        );
      case 'share':
        return (
          <ShareDialog name={modal.name} url={modal.url} close={close} />
        );
      case 'signup':
        return <SignupDialog close={close} />;
      case 'survey':
        return <SurveyDialog close={close} />;
    }
  })();

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden z-40 bg-white md:rounded-xl md:my-8 dark:bg-grey-90">
      <div className="h-full w-full max-h-screen absolute top-0 flex justify-center md:items-center">
        <div className="w-full">{content}</div>
      </div>
    </div>
  );
}
