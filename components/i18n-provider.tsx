'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  formatDate,
  formatNumber,
  tFor,
  type DateValue,
  type Locale,
  type Translator,
} from '@/lib/i18n-dict';

type I18nValue = {
  locale: Locale;
  t: Translator;
  formatDate: (value: DateValue, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo<I18nValue>(() => ({
    locale,
    t: tFor(locale),
    formatDate: (input, options) => formatDate(locale, input, options),
    formatNumber: (input, options) => formatNumber(locale, input, options),
  }), [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used within I18nProvider');
  return value;
}
