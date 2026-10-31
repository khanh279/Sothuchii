import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { LockableScrollView } from '@/components/lockable-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { DetailLink } from '@/components/detail-link';
import { ScreenTitle, TitleAction } from '@/components/design';
import { PageLayout } from '@/constants/layout';
import { ExpenseCategoryOverview } from '@/features/expenses/ExpenseCategoryOverview';
import { ExpenseTrendCard } from '@/features/expenses/ExpenseTrendCard';
import { useExpenseSettings, useExpenses } from '@/features/expenses/hooks';
import { useColors } from '@/hooks/use-colors';
import { periodToParams, suggestedDateFor } from '@/domain/expenses';
import { useSharedPeriod } from '@/hooks/use-shared-period';
import { todayStr } from '@/utils/date';
import { router } from '@/utils/safe-router';

/**
 * Tab "Chi tiêu": thẻ biểu đồ tròn phân bổ chi tiêu theo mục (kèm %), rồi thẻ biểu đồ cột (kỳ tháng: theo ngày; kỳ năm: theo tháng), bên dưới là nút "Lịch sử chi tiêu cá nhân" mở trang Lịch sử chi tiêu
 * (nơi xem, sửa, xoá từng khoản chi). Chạm một mục ở biểu đồ cũng mở trang đó, đã chọn sẵn mục chi ấy. Kỳ là bộ lọc DÙNG CHUNG (bấm ghi chú thời gian dưới tiêu đề hai thẻ để đổi); nút "+ Chi tiêu" ở góc phải tiêu đề mở form thêm khoản chi.
 */
export default function ExpensesTab() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { period } = useSharedPeriod();

  const { settings, error: settingsError } = useExpenseSettings();
  const { items, loaded, error } = useExpenses(period);
  const message = settingsError ?? error;

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <ScreenTitle title="Chi tiêu" topInset={insets.top} right={<TitleAction label="Chi tiêu" onPress={() => router.push({ pathname: '/chi-tieu/nhap', params: { ...periodToParams(period), d: suggestedDateFor(period, todayStr()) } })} />} />
      <LockableScrollView contentContainerStyle={[styles.content, { paddingBottom: PageLayout.bottomClearance + insets.bottom }]} keyboardShouldPersistTaps="handled">
        {message ? (
          <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
            <AppText color={colors.danger} style={styles.noticeText}>
              {message}
            </AppText>
          </View>
        ) : !loaded ? (
          <ActivityIndicator style={styles.loading} color={colors.primary} />
        ) : (
          <>
            <ExpenseCategoryOverview
              items={items}
              settings={settings}
              period={period}
              activeCategory="all"
              onSelectCategory={(id) => router.push({ pathname: '/chi-tieu/ca-nhan', params: { cat: id } })}
            />
            <ExpenseTrendCard items={items} period={period} />
            <DetailLink label="Lịch sử chi tiêu cá nhân" onPress={() => router.push('/chi-tieu/ca-nhan')} />
          </>
        )}
      </LockableScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: PageLayout.paddingX, paddingTop: PageLayout.contentTop, gap: PageLayout.gap },
  loading: { marginTop: 48 },
  notice: { padding: 16, borderRadius: 16 },
  noticeText: { fontSize: 15 },
});
