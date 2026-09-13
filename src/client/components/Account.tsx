import { useState } from 'react';
import { useTranslate } from '../i18n/context.tsx';
import { useStore } from '../store.ts';

/**
 * The old component also had a branch for `user.loginRequired`, which was never
 * set anywhere, so it is gone.
 */
export function Account() {
  const translate = useTranslate();
  const capabilities = useStore(s => s.capabilities);
  const user = useStore(s => s.user);
  const signupCta = useStore(s => s.signupCta);
  const logout = useStore(s => s.logout);
  // Login state lives on the mutable User instance, so follow the revision.
  useStore(s => s.revision);
  const [menuOpen, setMenuOpen] = useState(false);

  if (!capabilities.account) {
    return <div />;
  }

  if (!user.loggedIn) {
    return (
      <button
        type="button"
        className="px-4 py-2 md:px-8 md:py-4 focus:outline signin border-2 link-primary border-primary hover:border-primary dark:border-primary dark:hover:border-primary"
        onClick={() => signupCta('button')}
        title={translate('signInOnlyButton')}
      >
        {translate('signInOnlyButton')}
      </button>
    );
  }

  return (
    <div className="relative h-8">
      <input
        type="image"
        alt={user.email}
        className="w-8 h-8 rounded-full border-default text-primary md:text-white focus:outline"
        src={user.avatar}
        onClick={() => setMenuOpen(!menuOpen)}
      />
      <ul
        id="accountMenu"
        className={`${
          menuOpen ? '' : 'invisible'
        } absolute top-0 right-0 mt-10 pt-2 pb-2 bg-white shadow-md whitespace-nowrap outline-none z-50 dark:bg-grey-80`}
        onBlur={() => setMenuOpen(false)}
      >
        <li className="p-2 text-grey-60 dark:text-grey-50">{user.email}</li>
        <li>
          <button
            type="button"
            className="block w-full text-left px-4 py-2 text-grey-80 dark:text-grey-30 hover:bg-primary hover:text-white cursor-pointer focus:outline"
            onClick={() => logout()}
            title={translate('signOut')}
          >
            {translate('signOut')}
          </button>
        </li>
      </ul>
    </div>
  );
}
