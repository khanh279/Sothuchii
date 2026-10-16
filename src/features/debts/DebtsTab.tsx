import { router } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { PrimaryButton, ScreenTitle, SegmentedControl } from '@/components/design';
import { DebtPeopleSection, DebtStatCard } from '@/features/debts/DebtOverviewCards';
import { useDebtData } from '@/features/debts/hooks';
import { PayTransactions } from '@/features/debts/PayTransactions';
import { useChromeScroll } from '@/hooks/use-chrome';
import { useColors } from '@/hooks/use-colors';
import { usePersistedState } from '@/hooks/use-persisted-state';
import type { Period } from '@/types/expense';

/** Công nợ là số dư toàn thời gian, nên các màn mở từ đây xem "Tất cả". */
const ALL: Period = { mode: 'all' };

type DebtSegment = 'debts' | 'pays';
const SEGMENTS: { value: DebtSegment; label: string }[] = [
  { value: 'debts', label: 'Công nợ' },
  { value: 'pays', label: 'Giao dịch' },
];

/**
 * Tab "Công nợ": nút "Ghi nhận chuyển tiền" ở phía trên (dùng lại biểu mẫu và service có sẵn), rồi hai mục chuyển bằng segmented control:
 * "Công nợ" (tổng nợ hiện tại và từng người còn nợ, bấm để xem chi tiết theo logic hiện có) và "Giao dịch" (lịch sử khoản trả / chuyển tiền
 * của kỳ chung chọn ở Tổng quan). Không có logic tính nợ riêng ở đây.
 */
export default function DebtsTab() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { ref, props } = useChromeScroll();
  const { bills, pays, loaded, error, reload } = useDebtData();
  const [segment, setSegment] = usePersistedState<DebtSegment>('tab:cong-no:segment', () => 'debts');

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <ScreenTitle title="Công nợ" topInset={insets.top} />
      <View style={styles.action}>
        <PrimaryButton label="Ghi nhận chuyển tiền" onPress={() => router.push('/cong-no/ghi-nhan')} />
      </View>
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
          <SegmentedControl options={SEGMENTS} value={segment} onChange={setSegment} />
          {segment === 'debts' ? (
            <>
              <DebtStatCard bills={bills} pays={pays} period={ALL} />
              <DebtPeopleSection bills={bills} pays={pays} period={ALL} onOpenPerson={(name) => router.push({ pathname: '/cong-no/chi-tiet', params: { mode: 'all', name } })} />
            </>
          ) : (
            <PayTransactions bills={bills} pays={pays} reload={reload} />
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  action: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },
  loading: { marginTop: 48 },
  notice: { marginHorizontal: 16, padding: 16, borderRadius: 16 },
  noticeText: { fontSize: 15 },
});
