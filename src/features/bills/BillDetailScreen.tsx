import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { CategoryIcon } from '@/components/category-icon';
import { AppRadius } from '@/constants/palette';
import { computeSplit } from '@/domain/bills';
import { findBillById } from '@/domain/billHistory';
import { dayHeading, resolveCategory } from '@/domain/expenses';
import { useBills } from '@/features/bills/hooks';
import { SplitReceipt } from '@/features/bills/SplitReceipt';
import { useExpenseSettings } from '@/features/expenses/hooks';
import { useColors } from '@/hooks/use-colors';
import { formatVnDate, todayStr } from '@/utils/date';

/**
 * Chi tiết MỘT bill đã chia (tham số route `id` = mã bill, không dùng tên/ngày/số tiền): tên, ngày, mục, số người và biên lai
 * (Tổng bill, phần mỗi người, ai nhận lại / còn thiếu, các khoản cần chuyển). Dùng chung cho Lịch sử chia bill và mục "Chi tiết"
 * ở Tổng quan. Chỉ xem: sửa / xóa bill làm ở Lịch sử chia bill (vuốt dòng).
 */
export default function BillDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const today = todayStr();
  const { settings } = useExpenseSettings();
  const { bills, loaded, error } = useBills();

  const bill = findBillById(bills, id);
  const category = bill ? resolveCategory(settings, bill.cat) : null;

  let body;
  if (error) {
    body = (
      <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
        <AppText color={colors.danger} style={styles.noticeText}>
          {error}
        </AppText>
      </View>
    );
  } else if (!loaded) {
    body = <ActivityIndicator style={styles.loading} color={colors.primary} />;
  } else if (!bill || !category) {
    body = (
      <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
        <AppText color={colors.danger} style={styles.noticeText}>
          Không tìm thấy bill này. Có thể nó đã bị xoá.
        </AppText>
      </View>
    );
  } else {
    body = (
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.head}>
            <CategoryIcon category={category} />
            <View style={styles.headText}>
              <AppText weight="semibold" style={styles.title}>
                {bill.title || 'Không tên'}
              </AppText>
              <AppText color={colors.muted} style={styles.sub}>
                {dayHeading(bill.date, today)}, {formatVnDate(bill.date)} · {category.name} · {bill.people.length} người
              </AppText>
            </View>
          </View>
          <SplitReceipt split={computeSplit(bill.people)} showTotal framed={false} />
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg, paddingTop: 12 + insets.top }]}>
      <Stack.Screen options={{ title: 'Chi tiết bill', headerShown: false }} />
      <View style={styles.bar}>
        <AppText weight="semibold" style={styles.barTitle}>
          Chi tiết bill
        </AppText>
      </View>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bar: { paddingHorizontal: 16, minHeight: 44, justifyContent: 'center' },
  barTitle: { fontSize: 17 },
  content: { paddingHorizontal: 12, paddingTop: 4 },
  loading: { marginTop: 48 },
  notice: { marginHorizontal: 12, marginTop: 8, padding: 16, borderRadius: 16 },
  noticeText: { fontSize: 15 },
  card: { borderRadius: AppRadius.card, borderWidth: 1, padding: 16, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headText: { flex: 1, minWidth: 0 },
  title: { fontSize: 18, lineHeight: 24 },
  sub: { fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, minHeight: 44, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  actionText: { fontSize: 14.5 },
});
