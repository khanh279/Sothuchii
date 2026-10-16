import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { SvgIcon } from '@/components/svg-icon';
import { AppRadius } from '@/constants/palette';
import { useChrome } from '@/hooks/use-chrome';
import { useColors } from '@/hooks/use-colors';

interface Props {
  onAddPersonal: () => void;
}

/**
 * Nút nổi "+ Chi tiêu" của PWA (`#stFab`). Bấm thì nút ẩn đi và hiện menu lựa chọn ngay phía trên
 * (`#stFabMenu`); bấm ra ngoài thì trở lại. Mục "Chi tiêu quỹ" chỉ có khi đã có Quỹ nhóm — module này
 * chưa chuyển sang mobile nên menu hiện chỉ có "Chi tiêu cá nhân".
 */
export function AddExpenseFab({ onAddPersonal }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const { hidden } = useChrome();
  const [y] = useState(() => new Animated.Value(0));

  // Cuộn xuống nhanh thì nút trượt xuống khỏi màn hình cùng thanh tab dưới.
  useEffect(() => {
    Animated.timing(y, {
      toValue: hidden ? 140 + insets.bottom : 0,
      duration: 220,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [hidden, insets.bottom, y]);

  return (
    <>
      {open && (
        <>
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.18)' }]}
            accessibilityLabel="Đóng menu"
            onPress={() => setOpen(false)}
          />
          <View style={[styles.menu, { bottom: 82 + insets.bottom }]} pointerEvents="box-none">
            <Pressable
              style={[styles.menuItem, { backgroundColor: colors.primary }]}
              accessibilityRole="button"
              onPress={() => {
                setOpen(false);
                onAddPersonal();
              }}>
              <SvgIcon name="person" size={22} color={colors.primaryInk} strokeWidth={2} />
              <AppText weight="bold" color={colors.primaryInk} style={styles.menuText}>
                Chi tiêu cá nhân
              </AppText>
            </Pressable>
          </View>
        </>
      )}
      {!open && (
        <Animated.View style={[styles.fabWrap, { bottom: 76 + insets.bottom, transform: [{ translateY: y }] }]} pointerEvents={hidden ? 'none' : 'box-none'}>
          <Pressable
            style={[styles.fab, { backgroundColor: colors.primary }]}
            accessibilityRole="button"
            accessibilityLabel="Thêm khoản chi"
            onPress={() => setOpen(true)}>
            <SvgIcon name="plus" size={18} color={colors.primaryInk} strokeWidth={2.4} />
            <AppText weight="bold" color={colors.primaryInk} style={styles.fabText}>
              Chi tiêu
            </AppText>
          </Pressable>
        </Animated.View>
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
