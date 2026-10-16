import { TabList, TabSlot, TabTrigger, Tabs, type TabListProps, type TabTriggerSlotProps } from 'expo-router/ui';
import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { SvgIcon } from '@/components/svg-icon';
import { AppRadius } from '@/constants/palette';
import type { IconName } from '@/constants/icons';
import { useChrome } from '@/hooks/use-chrome';
import { useColors } from '@/hooks/use-colors';

/** Thanh điều hướng dưới: năm mục (Tổng quan, Chi tiêu, Chia bill, Công nợ, Quỹ nhóm), mỗi mục một biểu tượng và nhãn ngắn; mục đang chọn tô màu chủ đạo (navy). */
const TABS: { name: string; href: '/' | '/chi-tieu' | '/chia-bill' | '/cong-no' | '/quy'; icon: IconName; label: string; short: string }[] = [
  { name: 'index', href: '/', icon: 'tabOverview', label: 'Tổng quan', short: 'Tổng quan' },
  { name: 'chi-tieu', href: '/chi-tieu', icon: 'wallet', label: 'Chi tiêu cá nhân', short: 'Chi tiêu' },
  { name: 'chia-bill', href: '/chia-bill', icon: 'receipt', label: 'Chia bill', short: 'Chia bill' },
  { name: 'cong-no', href: '/cong-no', icon: 'tabTransactions', label: 'Công nợ', short: 'Công nợ' },
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

function FloatingTabList(props: TabListProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { hidden } = useChrome();
  const [y] = useState(() => new Animated.Value(0));

  // Cuộn xuống nhanh thì thanh trượt xuống khỏi màn hình (và không bấm được); cuộn lên thì trượt lại.
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
      <Animated.View
        pointerEvents={hidden ? 'none' : 'auto'}
        style={[
          styles.bar,
          { borderColor: colors.line, backgroundColor: colors.surface, transform: [{ translateY: y }] },
        ]}>
        {props.children}
      </Animated.View>
    </View>
  );
}

function TabButton({ icon, label, short, isFocused, ...props }: TabTriggerSlotProps & { icon: IconName; label: string; short: string }) {
  const colors = useColors();
  const { scrollToTop, setHidden } = useChrome();
  return (
    <Pressable
      {...props}
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
        {short}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 12 },
  bar: {
    width: '100%',
    maxWidth: 496,
    flexDirection: 'row',
    gap: 2,
    padding: 4,
    borderRadius: AppRadius.card,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#0B2A4A',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  button: { flex: 1, minWidth: 0, height: 56, borderRadius: AppRadius.field, alignItems: 'center', justifyContent: 'center', gap: 2 },
  buttonLabel: { fontSize: 10.5, lineHeight: 14 },
});
