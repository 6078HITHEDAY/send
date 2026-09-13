import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';
import type { TranslateFn } from '../../core/utils.ts';

const TranslateContext = createContext<TranslateFn | null>(null);

export function TranslateProvider({
  translate,
  children
}: {
  translate: TranslateFn;
  children: ReactNode;
}) {
  return (
    <TranslateContext.Provider value={translate}>
      {children}
    </TranslateContext.Provider>
  );
}

export function useTranslate(): TranslateFn {
  const translate = useContext(TranslateContext);
  if (!translate) {
    throw new Error('useTranslate outside of a TranslateProvider');
  }
  return translate;
}
