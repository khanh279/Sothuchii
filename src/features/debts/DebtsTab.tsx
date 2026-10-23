import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { LockableScrollView } from '@/components/lockable-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { ScreenTitle, TitleAction } from '@/components/design';
import { PageLayout } from '@/constants/layout';
import { DebtPeopleSection, DebtTotalsSection } from '@/features/debts/DebtPeoplePanel';
import { useDebtData } from '@/features/debts/hooks';
import { PayTransactions } from '@/features/debts/PayTransactions';
import { useChromeScroll } from '@/hooks/use-chrome';
import { useColors } from '@/hooks/use-colors';
import type { Period } from '@/types/expense';

/** Công nợ là số dư toàn thời gian, nên các màn mở từ đây xem "Tất cả". */
const ALL: Period = { mode: 'all' };

/**
 * Tab "Công nợ" gồm ba phần cuộn cùng nhau: (1) Tổng quan "Tôi nợ" / "Nợ tôi", (2) Chi tiết nợ theo từng người, (3) Lịch sử giao dịch của kỳ chung chọn ở Tổng quan.
 * Chạm một người ở phần 2 để chọn: phần 3 chỉ còn giao dịch giữa tôi và người đó và hiện nút Thanh toán cố định ở cuối màn hình; chạm lại để bỏ chọn.
 * Nút "+ Giao dịch" ở hàng tiêu đề mở biểu mẫu ghi nhận chuyển tiền có sẵn. Không có logic tính nợ riêng ở đây: số dư, thanh toán, gộp nợ đều dùng logic Công nợ hiện có.
 */
export default function DebtsTab() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { ref, props } = useChromeScroll();
  const { bills, pays, loaded, error, reload } = useDebtData();

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <ScreenTitle title="Công nợ" topInset={insets.top} right={<TitleAction label="Giao dịch" onPress={() => router.push('/cong-no/ghi-nhan')} />} />
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
          <DebtTotalsSection bills={bills} pays={pays} period={ALL} />
          <DebtPeopleSection bills={bills} pays={pays} period={ALL} onOpen={(name) => router.push({ pathname: '/cong-no/chi-tiet', params: { mode: 'all', name } })} />
          <PayTransactions bills={bills} pays={pays} reload={reload} />
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
});
