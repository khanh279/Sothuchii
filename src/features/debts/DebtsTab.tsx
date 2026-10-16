import { router } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { PrimaryButton, ScreenTitle } from '@/components/design';
import { DebtPeopleSection, DebtStatCard, PaysEntry } from '@/features/debts/DebtOverviewCards';
import { useDebtData } from '@/features/debts/hooks';
import { useChromeScroll } from '@/hooks/use-chrome';
import { useColors } from '@/hooks/use-colors';
import type { Period } from '@/types/expense';

/** Công nợ là số dư toàn thời gian, nên các màn mở từ đây xem "Tất cả". */
const ALL: Period = { mode: 'all' };

/**
 * Tab "Công nợ": tổng nợ hiện tại, danh sách từng người còn nợ (bấm để xem chi tiết các khoản nợ theo logic hiện có), lối vào lịch
 * sử giao dịch và nút "Ghi nhận chuyển tiền" (dùng lại biểu mẫu và service chuyển tiền có sẵn). Không có logic tính nợ riêng ở đây.
 */
export default function DebtsTab() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { ref, props } = useChromeScroll();
  const { bills, pays, loaded, error } = useDebtData();

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <ScreenTitle title="Công nợ" topInset={insets.top} />
      {error ? (
        <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
          <AppText color={colors.danger} style={styles.noticeText}>
            {error}
          </AppText>
        </View>
      ) : !loaded ? (
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      ) : (
        <ScrollView ref={ref} {...props} contentContainerStyle={[styles.content, { paddingBottom: 110 + insets.bottom }]}>
          <DebtStatCard bills={bills} pays={pays} period={ALL} />
          <PrimaryButton label="Ghi nhận chuyển tiền" onPress={() => router.push('/cong-no/ghi-nhan')} />
          <DebtPeopleSection bills={bills} pays={pays} period={ALL} onOpenPerson={(name) => router.push({ pathname: '/cong-no/chi-tiet', params: { mode: 'all', name } })} />
          <PaysEntry bills={bills} pays={pays} period={ALL} onOpen={() => router.push({ pathname: '/cong-no/lich-su', params: { mode: 'all' } })} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },
  loading: { marginTop: 48 },
  notice: { marginHorizontal: 16, padding: 16, borderRadius: 16 },
  noticeText: { fontSize: 15 },
});
