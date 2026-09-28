'use client';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { App, ConfigProvider } from 'antd';
import esES from 'antd/locale/es_ES';
import { supabaseBrowser } from '@/lib/supabase/browser';
import type { MyContext } from '@/lib/types';

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

type Session = { ctx: MyContext | null; refresh: () => Promise<MyContext | null>; setCtx: (c: MyContext | null) => void };
const SessionContext = createContext<Session>({ ctx: null, refresh: async () => null, setCtx: () => {} });
export const useSession = () => useContext(SessionContext);

export function Providers({ initialCtx, children }: { initialCtx: MyContext | null; children: React.ReactNode }) {
  const [ctx, setCtx] = useState<MyContext | null>(initialCtx);

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

  return (
    <ConfigProvider locale={esES} theme={theme}>
      <App message={{ maxCount: 2, top: 72 }}>
        <SessionContext.Provider value={{ ctx, refresh, setCtx }}>{children}</SessionContext.Provider>
      </App>
    </ConfigProvider>
  );
}

/** Toast helper matching the prototype's "✓ …" feedback. */
export function useToast() {
  const { message } = App.useApp();
  return {
    ok: (t: string) => message.success(t),
    err: (e: unknown) => message.error(e instanceof Error ? e.message : String(e)),
    info: (t: string) => message.info(t),
  };
}
