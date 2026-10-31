import { TabList, TabSlot, TabTrigger, Tabs, type TabListProps, type TabTriggerSlotProps } from 'expo-router/ui';
import { Children, useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, View, type LayoutChangeEvent, type PressableProps } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { SvgIcon } from '@/components/svg-icon';
import { AppRadius } from '@/constants/palette';
import type { IconName } from '@/constants/icons';
import { useChrome } from '@/hooks/use-chrome';
import { AddMenu } from '@/features/expenses/AddMenu';
import { pressStyle } from '@/components/press-feedback';
import { useColors } from '@/hooks/use-colors';
import { useLanguage } from '@/i18n/language';

/**
 * Thanh điều hướng dưới: bốn mục (Tổng quan, Chi tiêu, Nợ & bill, Quỹ nhóm) chia hai bên nút "+" tròn nổi ở CHÍNH GIỮA (mở menu thêm nhanh ở mọi trang chính). Mỗi mục một biểu tượng và nhãn ngắn; mục đang chọn nền xanh nhạt.
 */
const TABS: { name: string; href: '/' | '/chi-tieu' | '/no-bill' | '/quy'; icon: IconName; label: string; short: string }[] = [
  { name: 'index', href: '/', icon: 'tabOverview', label: 'Tổng quan', short: 'Tổng quan' },
  { name: 'chi-tieu', href: '/chi-tieu', icon: 'wallet', label: 'Chi tiêu cá nhân', short: 'Chi tiêu' },
  { name: 'no-bill', href: '/no-bill', icon: 'tabTransactions', label: 'Nợ và bill', short: 'Nợ & bill' },
  { name: 'quy', href: '/quy', icon: 'people', label: 'Quỹ nhóm', short: 'Quỹ nhóm' },
];

export default function FloatingTabs() {
  return (
    <Tabs>
      <TabSlot style={{ flex: 1 }} />
      <TabList asChild>
        <FloatingTabList>
          {TABS.map((tab) => (
            <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
              <TabButton icon={tab.icon} label={tab.label} short={tab.short} />
            </TabTrigger>
          ))}
        </FloatingTabList>
      </TabList>
    </Tabs>
  );
}

/** Chiều cao khung và đường kính nút "+" nổi ở giữa. */
const BAR_H = 56;
const PLUS = 72;
/** Mép trên của nút "+" cao hơn mép trên khung bấy nhiêu (đáy nút vẫn nằm trong khung). */
const RAISE = 16;
/** Tâm nút "+" tính từ mép trên khung. */
const PLUS_CY = PLUS / 2 - RAISE;
/**
 * Vòng khoét ôm nút: bán kính lớn hơn nút `NOTCH_GAP` và tâm DỊCH LÊN `NOTCH_SHIFT` so với tâm nút, nên viền khoét vẫn cong theo nút nhưng khoảng hở KHÔNG đều:
 * hở ở phía trên (NOTCH_GAP + NOTCH_SHIFT) rộng hơn phía dưới (NOTCH_GAP − NOTCH_SHIFT).
 */
const NOTCH_GAP = 9;
const NOTCH_SHIFT = 4;
const NOTCH_R = PLUS / 2 + NOTCH_GAP;
const NOTCH_CY = PLUS_CY - NOTCH_SHIFT;
const CORNER = AppRadius.card;
/** Nửa bề rộng của cung khoét tại mép trên / dưới khung (giao của vòng khoét với hai cạnh đó). */
const HALF_TOP = Math.sqrt(NOTCH_R * NOTCH_R - NOTCH_CY * NOTCH_CY);
const HALF_BOTTOM = Math.sqrt(NOTCH_R * NOTCH_R - (BAR_H - NOTCH_CY) * (BAR_H - NOTCH_CY));

/** Đường viền hai nửa khung: góc ngoài bo `CORNER`, cạnh trong lõm theo vòng khoét quanh nút "+". */
function halves(width: number) {
  const cx = width / 2;
  const r = CORNER;
  return {
    left: `M ${r} 0 H ${cx - HALF_TOP} A ${NOTCH_R} ${NOTCH_R} 0 0 0 ${cx - HALF_BOTTOM} ${BAR_H} H ${r} A ${r} ${r} 0 0 1 0 ${BAR_H - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`,
    right: `M ${cx + HALF_TOP} 0 H ${width - r} A ${r} ${r} 0 0 1 ${width} ${r} V ${BAR_H - r} A ${r} ${r} 0 0 1 ${width - r} ${BAR_H} H ${cx + HALF_BOTTOM} A ${NOTCH_R} ${NOTCH_R} 0 0 0 ${cx + HALF_TOP} 0 Z`,
  };
}

function FloatingTabList(props: TabListProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { hidden } = useChrome();
  const [y] = useState(() => new Animated.Value(0));
  const [width, setWidth] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const items = Children.toArray(props.children as ReactNode);
  const paths = width > 0 ? halves(width) : null;

  // Cuộn xuống nhanh thì thanh (cả nút "+") trượt xuống khỏi màn hình (và không bấm được); cuộn lên thì trượt lại.
  useEffect(() => {
    Animated.timing(y, {
      toValue: hidden ? 120 + insets.bottom : 0,
      duration: 220,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [hidden, insets.bottom, y]);

  return (
    <View {...props} pointerEvents="box-none" style={[styles.wrap, { bottom: 10 + insets.bottom }]}>
      <Animated.View pointerEvents={hidden ? 'none' : 'auto'} style={[styles.bar, { transform: [{ translateY: y }] }]} onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}>
        {paths && (
          <Svg width={width} height={BAR_H} style={styles.shape} pointerEvents="none">
            <Path d={paths.left} fill={colors.surface} stroke={colors.line} strokeWidth={StyleSheet.hairlineWidth} />
            <Path d={paths.right} fill={colors.surface} stroke={colors.line} strokeWidth={StyleSheet.hairlineWidth} />
          </Svg>
        )}
        <View style={styles.row}>
          <View style={[styles.half, { paddingRight: NOTCH_R + 2 }]}>{items.slice(0, 2)}</View>
          <View style={[styles.half, { paddingLeft: NOTCH_R + 2 }]}>{items.slice(2)}</View>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Thêm nhanh" onPress={() => setMenuOpen(true)} style={({ pressed }) => [styles.plus, { backgroundColor: colors.primary }, pressStyle(pressed, false, 0.9)]}>
          <SvgIcon name="plus" size={34} color={colors.primaryInk} strokeWidth={2.6} />
        </Pressable>
      </Animated.View>
      <AddMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </View>
  );
}

/** Nhãn ngắn của tab khi dùng tiếng Anh (tiếng Anh dài hơn nên nhãn đầy đủ sẽ bị cắt trong ô tab hẹp). */
const SHORT_EN: Record<string, string> = { 'Tổng quan': 'Overview', 'Chi tiêu': 'Expenses', 'Nợ & bill': 'Debts', 'Quỹ nhóm': 'Funds' };

function TabButton({ icon, label, short, isFocused, ...props }: TabTriggerSlotProps & { icon: IconName; label: string; short: string }) {
  const colors = useColors();
  const language = useLanguage();
  const { scrollToTop, setHidden } = useChrome();
  return (
    <Pressable
      // Kiểu ref của slot expo-router còn theo View cũ; ép sang kiểu thuộc tính của Pressable (RN 0.88 đổi kiểu ref).
      {...(props as unknown as PressableProps)}
      onPress={(event) => {
        // Chạm lại tab đang đứng thì cuộn trang về đầu (như PWA); chuyển tab thì luôn hiện lại thanh.
        if (isFocused) scrollToTop();
        setHidden(false);
        props.onPress?.(event);
      }}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!isFocused }}
      style={[styles.button, isFocused && { backgroundColor: colors.primarySoft }]}>
      <SvgIcon name={icon} size={22} color={isFocused ? colors.primary : colors.muted} strokeWidth={isFocused ? 2 : 1.8} />
      <AppText weight={isFocused ? 'semibold' : 'medium'} color={isFocused ? colors.primary : colors.muted} style={styles.buttonLabel} numberOfLines={1}>
        {language === 'en' ? (SHORT_EN[short] ?? short) : short}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 12 },
  /** Khung cao thêm RAISE ở trên để nút "+" nhô lên vẫn nằm TRONG vùng của khung (bấm được trên mọi nền tảng). */
  bar: { width: '100%', maxWidth: 496, height: BAR_H + RAISE },
  shape: { position: 'absolute', left: 0, bottom: 0 },
  row: { position: 'absolute', left: 0, right: 0, bottom: 0, height: BAR_H, flexDirection: 'row', alignItems: 'center' },
  half: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 4 },
  plus: {
    position: 'absolute',
    alignSelf: 'center',
    left: '50%',
    marginLeft: -PLUS / 2,
    top: 0,
    width: PLUS,
    height: PLUS,
    borderRadius: PLUS / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0B2A4A',
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  button: { flex: 1, minWidth: 0, height: BAR_H - 8, borderRadius: AppRadius.field, alignItems: 'center', justifyContent: 'center', gap: 2 },
  buttonLabel: { fontSize: 10.5, lineHeight: 14 },
});
