import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { AppRadius } from '@/constants/palette';
import { useColors } from '@/hooks/use-colors';

/** Thời gian toast hiện (ms), như PWA. */
const TOAST_MS = 2400;

interface ToastApi {
  /** Hiện một thông báo ngắn dưới màn hình. Toast mới thay toast đang hiện. */
  show: (message: string) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => undefined });

/** Toast dùng chung: nền màu chữ chính, chữ màu nền, viên thuốc (đúng `.st-toast` của PWA). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const show = useCallback((next: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(next);
    timer.current = setTimeout(() => setMessage(null), TOAST_MS);
  }, []);
  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {message !== null && (
        <View pointerEvents="none" style={[styles.wrap, { bottom: 96 + insets.bottom }]}>
          <View style={[styles.toast, { backgroundColor: colors.ink }]} accessibilityRole="alert">
            <AppText weight="semibold" color={colors.bg} style={styles.text}>
              {message}
            </AppText>
          </View>
        </View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: AppRadius.pill, maxWidth: '100%' },
  text: { fontSize: 13.5, textAlign: 'center' },
});
