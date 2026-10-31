import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { DetailLink } from '@/components/detail-link';
import { CardHead, ScreenTitle, SectionCard, TitleAction } from '@/components/design';
import { LockableScrollView } from '@/components/lockable-scroll-view';
import { PeriodNote } from '@/components/period-filter';
import { PageLayout } from '@/constants/layout';
import { buildBillOverviewCard } from '@/domain/billHistory';
import { BillSpenderRows } from '@/features/bills/BillPairsPanel';
import { DebtTotalTiles } from '@/features/debts/DebtPeoplePanel';
import { useDebtData } from '@/features/debts/hooks';
import { useChromeScroll } from '@/hooks/use-chrome';
import { useColors } from '@/hooks/use-colors';
import { useSharedPeriod } from '@/hooks/use-shared-period';
import { todayStr } from '@/utils/date';
import { router } from '@/utils/safe-router';

/**
 * Tab "Nợ & bill" (gộp hai tab Chia bill và Công nợ cũ), bốn thẻ cuộn cùng nhau:
 * (1) Thẻ "Các khoản nợ": hai ô "Tôi nợ" / "Nợ tôi" (toàn thời gian) và bên dưới "Danh sách bill" (kỳ dùng chung ghi dưới tiêu đề, bấm để đổi kỳ): TẤT CẢ những người chi bill (nhiều → ít).
 * (2) Thẻ nút "Chi tiết danh sách bill". (3) Thẻ nút "Chi tiết nợ & bill" (nợ vay theo người, nợ bill theo cặp). (4) Thẻ nút "Lịch sử Nợ & Bill" (xem, sửa, xoá khoản chuyển tiền và bill).
 * Không có logic tính nợ riêng ở đây: dùng lại các hàm domain và các khối hiện có.
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
      <ScreenTitle title="Nợ & bill" topInset={insets.top} right={<TitleAction label="Giao dịch" onPress={() => router.push('/cong-no/ghi-nhan')} />} />
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
          {/* Thẻ 1: các khoản nợ (Tôi nợ / Nợ tôi, toàn thời gian) và bên dưới danh sách bill của kỳ (những người chi bill, kỳ chọn được ở ghi chú nhỏ). */}
          <SectionCard title="Các khoản nợ">
            <View style={styles.inner}>
              <DebtTotalTiles bills={bills} pays={pays} />
              <View style={styles.billHead}>
                <CardHead title="Danh sách bill" subtitleNode={<PeriodNote view={view} onChange={setView} today={todayStr()} />} />
              </View>
              <BillSpenderRows rows={card.rows} />
            </View>
          </SectionCard>

          {/* Thẻ 2, 3, 4: ba nút mở các trang chi tiết. */}
          <DetailLink label="Chi tiết danh sách bill" onPress={() => router.push('/chia-bill/lich-su')} />
          <DetailLink label="Chi tiết nợ & bill" onPress={() => router.push('/cong-no/no-bill')} />
          <DetailLink label="Lịch sử Nợ & Bill" onPress={() => router.push('/cong-no/chuyen-tien-bill')} />
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
  billHead: { marginTop: 4 },
});
