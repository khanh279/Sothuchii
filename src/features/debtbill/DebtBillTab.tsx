import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { DetailLink } from '@/components/detail-link';
import { ScreenTitle, SectionCard } from '@/components/design';
import { LockableScrollView } from '@/components/lockable-scroll-view';
import { PeriodFilter } from '@/components/period-filter';
import { PageLayout } from '@/constants/layout';
import { buildBillOverviewCard } from '@/domain/billHistory';
import { periodTitle } from '@/domain/expenses';
import { BillSpenderRows } from '@/features/bills/BillPairsPanel';
import { DebtTotalTiles } from '@/features/debts/DebtPeoplePanel';
import { useDebtData } from '@/features/debts/hooks';
import { useChromeScroll } from '@/hooks/use-chrome';
import { useColors } from '@/hooks/use-colors';
import { useSharedPeriod } from '@/hooks/use-shared-period';
import { todayStr } from '@/utils/date';
import { router } from '@/utils/safe-router';

/**
 * Tab "Nợ & bill" (gộp hai tab Chia bill và Công nợ cũ), ba khối cuộn cùng nhau:
 * (1) Thẻ "Các khoản nợ & bill": hai ô "Tôi nợ" / "Nợ tôi" (toàn thời gian) và nút "Chi tiết nợ & bill" mở trang chi tiết (nợ vay theo người, nợ bill theo cặp).
 * (2) Thẻ "Danh sách bill" (kỳ dùng chung ghi dưới tiêu đề): TẤT CẢ những người chi bill (nhiều → ít), không có tiêu đề riêng, và ô bấm "Chi tiết danh sách bill" mở trang danh sách bill.
 * (3) Nút "Lịch sử chuyển tiền & bill" mở trang Lịch sử chuyển tiền & bill (xem, sửa, xoá khoản chuyển tiền và bill). Không có logic tính nợ riêng ở đây: dùng lại các hàm domain và các khối hiện có.
 */
export default function DebtBillTab() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { ref, props } = useChromeScroll();
  const { view, setView, period } = useSharedPeriod();
  const { bills, pays, loaded, error } = useDebtData();

  const card = useMemo(() => buildBillOverviewCard(bills, period, true), [bills, period]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <ScreenTitle title="Nợ & bill" topInset={insets.top} right={<PeriodFilter compact view={view} onChange={setView} today={todayStr()} />} />
      {error ? (
        <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
          <AppText color={colors.danger} style={styles.noticeText}>
            {error}
          </AppText>
        </View>
      ) : !loaded ? (
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      ) : (
        <LockableScrollView ref={ref} {...props} contentContainerStyle={[styles.content, { paddingBottom: PageLayout.bottomClearance + insets.bottom }]}>
          <SectionCard title="Các khoản nợ & bill">
            <View style={styles.inner}>
              <DebtTotalTiles bills={bills} pays={pays} />
              <DetailLink variant="inner" label="Chi tiết nợ & bill" onPress={() => router.push('/cong-no/no-bill')} />
            </View>
          </SectionCard>

          <SectionCard title="Danh sách bill" subtitle={periodTitle(period)}>
            <View style={styles.inner}>
              <BillSpenderRows rows={card.rows} />
              <DetailLink variant="inner" label="Chi tiết danh sách bill" onPress={() => router.push('/chia-bill/lich-su')} />
            </View>
          </SectionCard>

          <DetailLink label="Lịch sử chuyển tiền & bill" onPress={() => router.push('/cong-no/chuyen-tien-bill')} />
        </LockableScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: PageLayout.paddingX, paddingTop: PageLayout.contentTop, gap: PageLayout.gap },
  loading: { marginTop: 48 },
  notice: { marginHorizontal: 16, padding: 16, borderRadius: 16 },
  noticeText: { fontSize: 15 },
  inner: { gap: 12 },
});
