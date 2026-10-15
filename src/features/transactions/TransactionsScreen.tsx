import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { AppRadius } from '@/constants/palette';
import BillCalcScreen from '@/features/bills/BillCalcScreen';
import FundListScreen from '@/features/funds/FundListScreen';
import { useColors } from '@/hooks/use-colors';

/** Thứ tự và nhãn đúng thanh chuyển của PWA: Đóng quỹ, Giao dịch, Chia bill. */
const SUBS = [
  { id: 'quy', label: 'Đóng quỹ' },
  { id: 'no', label: 'Giao dịch' },
  { id: 'bill', label: 'Chia bill' },
] as const;
type SubId = (typeof SUBS)[number]['id'];

/**
 * Tab Giao dịch. Hiện chỉ "Đóng quỹ" có nội dung; Giao dịch (chuyển tiền) và Chia bill chưa được chuyển sang
 * mobile nên hiện thông báo, sẽ thay khi làm các module đó.
 */
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

      {sub === 'quy' ? (
        <FundListScreen />
      ) : sub === 'bill' ? (
        <BillCalcScreen />
      ) : (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <AppText weight="display" style={styles.title}>
            Đang phát triển
          </AppText>
          <AppText color={colors.muted} style={styles.text}>
            Chuyển tiền chưa có trên bản mobile. Chức năng này sẽ được bổ sung ở giai đoạn sau.
          </AppText>
        </View>
      )}
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
  card: { marginHorizontal: 12, marginTop: 4, borderRadius: AppRadius.card, borderWidth: 1, padding: 20, gap: 8 },
  title: { fontSize: 18 },
  text: { fontSize: 14, lineHeight: 20 },
});
