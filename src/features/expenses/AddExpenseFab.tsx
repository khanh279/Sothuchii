import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { SvgIcon } from '@/components/svg-icon';
import type { IconName } from '@/constants/icons';
import { AppRadius } from '@/constants/palette';
import { useChrome } from '@/hooks/use-chrome';
import { useColors } from '@/hooks/use-colors';

interface Props {
  onAddPersonal: () => void;
  /** Mở luồng chi tiêu quỹ (chỉ dùng được khi đã có quỹ). */
  onAddFund: () => void;
  /** Mở luồng ghi nhận chuyển tiền. */
  onTransfer: () => void;
  /** Mở màn tạo bill để chia tiền. */
  onCreateBill: () => void;
  /** Đã có ít nhất một quỹ nhóm; chưa có thì mục "Chi tiêu quỹ" mờ đi kèm lời nhắc. */
  hasFunds: boolean;
}

const USE_NATIVE = Platform.OS !== 'web';
const SHEET_OFFSET = 440;
const OPEN_MS = 260;
const CLOSE_MS = 200;

/**
 * Nút nổi "+" ở Tổng quan. Bấm thì mở bottom sheet bốn lựa chọn: Chi tiêu, Chi tiêu quỹ, Giao dịch, Tạo bill — mỗi lựa
 * chọn mở thẳng luồng nghiệp vụ hiện có (không tạo luồng mới). Đóng bằng chạm nền mờ, nút Back hoặc chọn một mục.
 */
export function AddExpenseFab({ onAddPersonal, onAddFund, onTransfer, onCreateBill, hasFunds }: Props) {
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

  /** Đóng sheet (trượt xuống, nền sáng lại) rồi mới gỡ khỏi màn hình; `after` chạy sau khi đã đóng (hẹn giờ, không phụ thuộc khung hình). */
  function hide(after?: () => void) {
    Animated.timing(progress, { toValue: 0, duration: CLOSE_MS, easing: Easing.in(Easing.cubic), useNativeDriver: USE_NATIVE }).start();
    setTimeout(() => {
      setOpen(false);
      after?.();
    }, CLOSE_MS + 20);
  }

  const options: { icon: IconName; label: string; hint: string; disabled?: boolean; onPress: () => void }[] = [
    { icon: 'person', label: 'Chi tiêu', hint: 'Ghi một khoản chi của bạn', onPress: onAddPersonal },
    { icon: 'people', label: 'Chi tiêu quỹ', hint: hasFunds ? 'Ghi khoản chi từ một quỹ' : 'Chưa có quỹ — tạo quỹ ở tab Quỹ nhóm', disabled: !hasFunds, onPress: onAddFund },
    { icon: 'tabTransactions', label: 'Giao dịch', hint: 'Ghi nhận chuyển tiền hoặc trả nợ giữa hai người', onPress: onTransfer },
    { icon: 'receipt', label: 'Tạo bill', hint: 'Tạo bill và chia tiền cho mọi người', onPress: onCreateBill },
  ];

  return (
    <>
      {!open && (
        <Animated.View style={[styles.fabWrap, { bottom: 76 + insets.bottom, transform: [{ translateY: y }] }]} pointerEvents={hidden ? 'none' : 'box-none'}>
          <Pressable style={[styles.fab, { backgroundColor: colors.primary }]} accessibilityRole="button" accessibilityLabel="Thêm nhanh" onPress={show}>
            <SvgIcon name="plus" size={22} color={colors.primaryInk} strokeWidth={2.4} />
          </Pressable>
        </Animated.View>
      )}

      {open && (
        <Modal transparent animationType="none" visible statusBarTranslucent onRequestClose={() => hide()}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: progress }]}>
            <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Đóng" onPress={() => hide()} />
          </Animated.View>
          <View style={styles.sheetHost} pointerEvents="box-none">
            <Animated.View
              accessibilityViewIsModal
              style={[
                styles.sheet,
                { backgroundColor: colors.surface, paddingBottom: 16 + insets.bottom, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [SHEET_OFFSET, 0] }) }] },
              ]}>
              <View style={[styles.handle, { backgroundColor: colors.line }]} />
              <AppText weight="bold" style={styles.sheetTitle}>
                Chọn loại giao dịch
              </AppText>
              {options.map((option, index) => (
                <Pressable
                  key={option.label}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !!option.disabled }}
                  disabled={option.disabled}
                  onPress={() => hide(option.onPress)}
                  style={({ pressed }) => [styles.option, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }, { opacity: option.disabled ? 0.45 : pressed ? 0.7 : 1 }]}>
                  <View style={[styles.optionIcon, { backgroundColor: colors.primarySoft }]}>
                    <SvgIcon name={option.icon} size={22} color={colors.primary} strokeWidth={1.9} />
                  </View>
                  <View style={styles.optionText}>
                    <AppText weight="semibold" style={styles.optionLabel}>
                      {option.label}
                    </AppText>
                    <AppText color={colors.muted} style={styles.optionHint}>
                      {option.hint}
                    </AppText>
                  </View>
                  <SvgIcon name="chevronRight" size={16} color={colors.muted} strokeWidth={2} />
                </Pressable>
              ))}
            </Animated.View>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  fabWrap: { position: 'absolute', right: 16 },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0B2A4A',
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  sheetHost: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: AppRadius.hero, borderTopRightRadius: AppRadius.hero, paddingHorizontal: 16, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 12 },
  sheetTitle: { fontSize: 17, lineHeight: 24, marginBottom: 4 },
  option: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  optionIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  optionText: { flex: 1, minWidth: 0 },
  optionLabel: { fontSize: 15.5, lineHeight: 21 },
  optionHint: { fontSize: 12.5, lineHeight: 17 },
});
