import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../store.ts';
import { Blank } from './Blank.tsx';

/** The FxA redirect target: exchanges the code, then goes home. */
export function OAuth() {
  const [params] = useSearchParams();
  const authenticate = useStore(s => s.authenticate);

  useEffect(() => {
    const code = params.get('code');
    const state = params.get('state');
    if (code && state) {
      authenticate(code, state);
    }
  }, [params, authenticate]);

  return <Blank />;
}
