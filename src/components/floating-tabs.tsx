import { TabList, TabSlot, TabTrigger, Tabs, type TabListProps, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SvgIcon } from '@/components/svg-icon';
import { AppRadius } from '@/constants/palette';
import type { IconName } from '@/constants/icons';
import { useColors } from '@/hooks/use-colors';
import { withAlpha } from '@/utils/color';

/** Thanh điều hướng dưới của PWA (`#stNav`): viên thuốc nổi, ba nút chỉ có biểu tượng. */
const TABS: { name: string; href: '/' | '/giao-dich' | '/thiet-lap'; icon: IconName; label: string }[] = [
  { name: 'index', href: '/', icon: 'tabOverview', label: 'Tổng quan' },
  { name: 'giao-dich', href: '/giao-dich', icon: 'tabTransactions', label: 'Giao dịch: đóng quỹ, chia bill, chuyển tiền' },
  { name: 'thiet-lap', href: '/thiet-lap', icon: 'tabSettings', label: 'Thiết lập và sao lưu' },
];

export default function FloatingTabs() {
  return (
    <Tabs>
      <TabSlot style={{ flex: 1 }} />
      <TabList asChild>
        <FloatingTabList>
          {TABS.map((tab) => (
            <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
              <TabButton icon={tab.icon} label={tab.label} />
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
  return (
    <View {...props} pointerEvents="box-none" style={[styles.wrap, { bottom: 10 + insets.bottom }]}>
      <View
        style={[
          styles.bar,
          { borderColor: colors.line, backgroundColor: withAlpha(colors.surface, 0.94) },
        ]}>
        {props.children}
      </View>
    </View>
  );
}

function TabButton({ icon, label, isFocused, ...props }: TabTriggerSlotProps & { icon: IconName; label: string }) {
  const colors = useColors();
  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!isFocused }}
      style={[styles.button, isFocused && { backgroundColor: colors.primarySoft }]}>
      <SvgIcon name={icon} size={26} color={isFocused ? colors.primary : colors.muted} strokeWidth={1.8} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 12 },
  bar: {
    width: '100%',
    maxWidth: 496,
    flexDirection: 'row',
    gap: 4,
    padding: 5,
    borderRadius: AppRadius.pill,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  button: { flex: 1, minWidth: 0, height: 48, borderRadius: AppRadius.pill, alignItems: 'center', justifyContent: 'center' },
});
