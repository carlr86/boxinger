'use client';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { App, ConfigProvider } from 'antd';
import esES from 'antd/locale/es_ES';
import enUS from 'antd/locale/en_US';
import { supabaseBrowser } from '@/lib/supabase/browser';
import type { MyContext } from '@/lib/types';
import { WelcomeConfetti } from '@/components/WelcomeConfetti';
import { applyLocale, useI18n } from '@/lib/i18n/client';

const theme = {
  token: {
    colorPrimary: '#059669',
    colorLink: '#059669',
    colorLinkHover: '#047857',
    colorInfo: '#059669',
    borderRadius: 6,
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI","Helvetica Neue",Arial,"Noto Sans",sans-serif',
  },
  components: {
    Segmented: { trackBg: '#ebebeb' },
    Drawer: { paddingLG: 0 },
  },
};

type Session = { ctx: MyContext | null; refresh: () => Promise<MyContext | null>; setCtx: React.Dispatch<React.SetStateAction<MyContext | null>> };
const SessionContext = createContext<Session>({ ctx: null, refresh: async () => null, setCtx: () => {} });
export const useSession = () => useContext(SessionContext);

export function Providers({ initialCtx, children }: { initialCtx: MyContext | null; children: React.ReactNode }) {
  const [ctx, setCtx] = useState<MyContext | null>(initialCtx);
  const { locale } = useI18n();

  const refresh = useCallback(async () => {
    const { data } = await supabaseBrowser().rpc('get_my_context');
    setCtx((data as MyContext) ?? null);
    return (data as MyContext) ?? null;
  }, []);

  useEffect(() => {
    const { data } = supabaseBrowser().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') refresh();
    });
    if (initialCtx) supabaseBrowser().rpc('touch_last_seen').then(() => {});
    return () => data.subscription.unsubscribe();
  }, [refresh, initialCtx]);

  // The profile keeps the language (for emails and other devices): record the first choice,
  // and follow the profile when this browser shows another one.
  const saved = ctx?.me.locale;
  useEffect(() => {
    if (!ctx) return;
    if (!saved) supabaseBrowser().rpc('set_locale', { p_locale: locale }).then(() => {});
    else if (saved !== locale) applyLocale(saved);
  }, [saved, locale]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ConfigProvider locale={locale === 'en' ? enUS : esES} theme={theme}>
      <App message={{ maxCount: 2, top: 72 }}>
        <SessionContext.Provider value={{ ctx, refresh, setCtx }}>{children}<WelcomeConfetti /></SessionContext.Provider>
      </App>
    </ConfigProvider>
  );
}

/** Toast helper matching the prototype's "✓ …" feedback. */
export function useToast() {
  const { message } = App.useApp();
  const { tm } = useI18n();
  // Texts pass through the translation, so callers can hand the Spanish source (or a database error) as is.
  return {
    ok: (t: string) => message.success(tm(t)),
    err: (e: unknown) => message.error(tm(e instanceof Error ? e.message : String(e))),
    info: (t: string) => message.info(tm(t)),
  };
}
