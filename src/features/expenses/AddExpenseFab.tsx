import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OptionSheet, type SheetOption } from '@/components/option-sheet';
import { SvgIcon } from '@/components/svg-icon';
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
    setOpen(true);
  }

  const options: SheetOption[] = [
    { icon: 'person', label: 'Chi tiêu', hint: 'Ghi một khoản chi của bạn', onPress: onAddPersonal },
    { icon: 'people', label: 'Chi tiêu quỹ', hint: hasFunds ? 'Ghi khoản chi từ một quỹ' : 'Chưa có quỹ — tạo quỹ ở tab Quỹ nhóm', disabled: !hasFunds, opensSheet: true, onPress: onAddFund },
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

      {open && <OptionSheet title="Chọn loại giao dịch" options={options} onClose={() => setOpen(false)} />}
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
});
