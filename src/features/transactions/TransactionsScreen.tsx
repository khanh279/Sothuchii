import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import BillCalcScreen from '@/features/bills/BillCalcScreen';
import PayFormScreen from '@/features/debts/PayFormScreen';
import FundListScreen from '@/features/funds/FundListScreen';
import { useColors } from '@/hooks/use-colors';

/** Thứ tự và nhãn đúng thanh chuyển của PWA: Đóng quỹ, Giao dịch, Chia bill. */
const SUBS = [
  { id: 'quy', label: 'Đóng quỹ' },
  { id: 'no', label: 'Giao dịch' },
  { id: 'bill', label: 'Chia bill' },
] as const;
type SubId = (typeof SUBS)[number]['id'];

/** Tab Giao dịch: Đóng quỹ, Giao dịch (chuyển tiền / trả bill) và Chia bill, chuyển bằng thanh ở trên như PWA. */
export default function TransactionsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [sub, setSub] = useState<SubId>('quy');

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: 92 + insets.bottom }]}>
      <View style={styles.switchWrap}>
        <View style={[styles.switchIn, { backgroundColor: colors.surface, borderColor: colors.line }]} accessibilityRole="tablist">
          {SUBS.map((item) => {
            const selected = item.id === sub;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setSub(item.id)}
                style={[styles.switchButton, selected && { backgroundColor: colors.primary }]}>
                <AppText weight="semibold" color={selected ? colors.primaryInk : colors.muted} style={styles.switchText} numberOfLines={1}>
                  {item.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>

      {sub === 'quy' ? <FundListScreen /> : sub === 'bill' ? <BillCalcScreen /> : <PayFormScreen />}
    </View>
  );
}

// Thanh chuyển đo từ `.st-switch` của PWA: đệm 10/12/8, khung bo 16 đệm 4 viền 1, nút cao 44 bo 12, chữ 14/600.
const styles = StyleSheet.create({
  screen: { flex: 1 },
  switchWrap: { paddingTop: 10, paddingHorizontal: 12, paddingBottom: 8 },
  switchIn: { flexDirection: 'row', gap: 4, padding: 4, borderWidth: 1, borderRadius: 16 },
  switchButton: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  switchText: { fontSize: 14 },
});
