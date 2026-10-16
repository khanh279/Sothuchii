import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { AppRadius } from '@/constants/palette';
import { useColors } from '@/hooks/use-colors';

/** Thời gian toast hiện (ms), như PWA; toast có nút hành động (Hoàn tác) hiện lâu hơn để kịp bấm. */
const TOAST_MS = 2400;
const TOAST_ACTION_MS = 5000;

/** Khoảng cách toast tới mép dưới: 96 mặc định; trang Lịch sử (không có thanh tab) dùng 148, như PWA. */
export const TOAST_BOTTOM = 96;
export const TOAST_BOTTOM_HISTORY = 148;

interface ToastAction {
  label: string;
  onPress: () => void;
}

interface ToastApi {
  /** Hiện một thông báo ngắn dưới màn hình. Toast mới thay toast đang hiện. `action` thêm một nút (vd. Hoàn tác). */
  show: (message: string, options?: { bottom?: number; action?: ToastAction }) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => undefined });

interface ToastState {
  message: string;
  action?: ToastAction;
}

/** Toast dùng chung: nền màu chữ chính, chữ màu nền, viên thuốc (đúng `.st-toast` của PWA). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [bottom, setBottom] = useState(TOAST_BOTTOM);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const show = useCallback((next: string, options?: { bottom?: number; action?: ToastAction }) => {
    if (timer.current) clearTimeout(timer.current);
    setBottom(options?.bottom ?? TOAST_BOTTOM);
    setToast({ message: next, action: options?.action });
    timer.current = setTimeout(() => setToast(null), options?.action ? TOAST_ACTION_MS : TOAST_MS);
  }, []);
  const api = useMemo(() => ({ show }), [show]);

  const action = toast?.action;
  function pressAction() {
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
    action?.onPress();
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast !== null && (
        <View pointerEvents="box-none" style={[styles.wrap, { bottom: bottom + insets.bottom }]}>
          <View style={[styles.toast, { backgroundColor: colors.ink }]} accessibilityRole="alert">
            <AppText weight="semibold" color={colors.bg} style={styles.text}>
              {toast.message}
            </AppText>
            {action && (
              <Pressable accessibilityRole="button" accessibilityLabel={action.label} hitSlop={10} onPress={pressAction}>
                <AppText weight="bold" color={colors.accentSoft} style={styles.text}>
                  {action.label}
                </AppText>
              </Pressable>
            )}
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
  toast: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: AppRadius.pill, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 14 },
  text: { fontSize: 13.5, textAlign: 'center' },
});
