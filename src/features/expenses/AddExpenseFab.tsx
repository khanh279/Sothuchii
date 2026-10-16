import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { SvgIcon } from '@/components/svg-icon';
import { AppRadius } from '@/constants/palette';
import { useChrome } from '@/hooks/use-chrome';
import { useColors } from '@/hooks/use-colors';

interface Props {
  onAddPersonal: () => void;
  /** Có giá trị khi đã có Quỹ nhóm: hiện thêm mục "Chi tiêu quỹ". */
  onAddFund?: () => void;
}

const USE_NATIVE = Platform.OS !== 'web';
/** Nền mờ phủ cả màn hình (kể cả thanh tab dưới); chỉ các nút chọn còn sáng. */
const SCRIM = 'rgba(0,0,0,0.5)';
const OPEN_MS = 280;
const CLOSE_MS = 200;

/**
 * Nút nổi "+ Chi tiêu" của PWA (`#stFab`). Bấm thì nút ẩn đi và hiện menu lựa chọn ngay phía trên (`#stFabMenu`):
 * "Chi tiêu cá nhân" ở trên (nền trắng, chữ xanh), "Chi tiêu quỹ" ở dưới (chỉ khi đã có Quỹ nhóm, `onAddFund`).
 * Menu nằm trong `Modal` nên nền mờ phủ cả màn hình kể cả thanh tab dưới; bấm ra ngoài thì đóng.
 * Mở / đóng có hiệu ứng mượt: nền mờ dần, hai nút trồi lên lần lượt.
 */
export function AddExpenseFab({ onAddPersonal, onAddFund }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { hidden } = useChrome();
  const [open, setOpen] = useState(false);
  const [y] = useState(() => new Animated.Value(0));
  const [progress] = useState(() => new Animated.Value(0));

  // Cuộn xuống nhanh thì nút trượt xuống khỏi màn hình cùng thanh tab dưới.
  useEffect(() => {
    Animated.timing(y, {
      toValue: hidden ? 140 + insets.bottom : 0,
      duration: 220,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
      useNativeDriver: USE_NATIVE,
    }).start();
  }, [hidden, insets.bottom, y]);

  function show() {
    progress.setValue(0);
    setOpen(true);
    Animated.timing(progress, { toValue: 1, duration: OPEN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: USE_NATIVE }).start();
  }

  /** Đóng menu (nền mờ dần, nút chìm xuống) rồi mới gỡ khỏi màn hình; `after` chạy sau khi đã đóng hẳn. */
  function hide(after?: () => void) {
    Animated.timing(progress, { toValue: 0, duration: CLOSE_MS, easing: Easing.in(Easing.cubic), useNativeDriver: USE_NATIVE }).start(({ finished }) => {
      if (!finished) return;
      setOpen(false);
      after?.();
    });
  }

  // Mỗi nút trồi lên và hiện dần, nút dưới (Chi tiêu quỹ) bắt đầu trước, nút trên theo sau một nhịp.
  const itemStyle = (from: number, to: number) => ({
    opacity: progress.interpolate({ inputRange: [from, to], outputRange: [0, 1], extrapolate: 'clamp' }),
    transform: [
      { translateY: progress.interpolate({ inputRange: [from, to], outputRange: [22, 0], extrapolate: 'clamp' }) },
      { scale: progress.interpolate({ inputRange: [from, to], outputRange: [0.9, 1], extrapolate: 'clamp' }) },
    ],
  });
  const fundStyle = itemStyle(0, 0.75);
  const personalStyle = itemStyle(onAddFund ? 0.2 : 0, onAddFund ? 1 : 0.75);

  return (
    <>
      {!open && (
        <Animated.View style={[styles.fabWrap, { bottom: 76 + insets.bottom, transform: [{ translateY: y }] }]} pointerEvents={hidden ? 'none' : 'box-none'}>
          <Pressable style={[styles.fab, { backgroundColor: colors.primary }]} accessibilityRole="button" accessibilityLabel="Thêm khoản chi" onPress={show}>
            <SvgIcon name="plus" size={18} color={colors.primaryInk} strokeWidth={2.4} />
            <AppText weight="bold" color={colors.primaryInk} style={styles.fabText}>
              Chi tiêu
            </AppText>
          </Pressable>
        </Animated.View>
      )}

      {open && (
        <Modal transparent animationType="none" visible statusBarTranslucent onRequestClose={() => hide()}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: SCRIM, opacity: progress }]}>
            <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Đóng menu" onPress={() => hide()} />
          </Animated.View>
          <View style={[styles.menu, { bottom: 82 + insets.bottom }]} pointerEvents="box-none">
            <Animated.View style={personalStyle}>
              <Pressable
                style={[styles.menuItem, { backgroundColor: colors.surface }]}
                accessibilityRole="button"
                onPress={() => hide(onAddPersonal)}>
                <SvgIcon name="person" size={22} color={colors.primary} strokeWidth={2} />
                <AppText weight="bold" color={colors.primary} style={styles.menuText}>
                  Chi tiêu cá nhân
                </AppText>
              </Pressable>
            </Animated.View>
            {onAddFund && (
              <Animated.View style={fundStyle}>
                <Pressable
                  style={[styles.menuItem, { backgroundColor: colors.primary }]}
                  accessibilityRole="button"
                  onPress={() => hide(onAddFund)}>
                  <SvgIcon name="people" size={22} color={colors.primaryInk} strokeWidth={2} />
                  <AppText weight="bold" color={colors.primaryInk} style={styles.menuText}>
                    Chi tiêu quỹ
                  </AppText>
                </Pressable>
              </Animated.View>
            )}
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  fabWrap: { position: 'absolute', right: 12 },
  fab: {
    height: 44,
    paddingLeft: 12,
    paddingRight: 16,
    gap: 5,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: AppRadius.pill,
    shadowColor: '#15202B',
    shadowOpacity: 0.16,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  fabText: { fontSize: 14.5 },
  menu: { position: 'absolute', right: 12, alignItems: 'flex-end', gap: 10 },
  menuItem: {
    height: 52,
    paddingLeft: 15,
    paddingRight: 20,
    gap: 9,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: AppRadius.pill,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  menuText: { fontSize: 15.5 },
});
