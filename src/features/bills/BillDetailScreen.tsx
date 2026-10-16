import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { CategoryIcon } from '@/components/category-icon';
import { SvgIcon } from '@/components/svg-icon';
import { useToast } from '@/components/toast';
import { AppRadius } from '@/constants/palette';
import { deleteBillSynced } from '@/data/billService';
import { computeSplit } from '@/domain/bills';
import { findBillById } from '@/domain/billHistory';
import { dayHeading, resolveCategory } from '@/domain/expenses';
import { describeBillError, useBills } from '@/features/bills/hooks';
import { SplitReceipt } from '@/features/bills/SplitReceipt';
import { useExpenseSettings } from '@/features/expenses/hooks';
import { useColors } from '@/hooks/use-colors';
import { formatVnDate, todayStr } from '@/utils/date';

/** Quay lại màn trước; nếu không có màn trước (mở thẳng trang này) thì về Tổng quan. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * Chi tiết MỘT bill đã chia (tham số route `id` = mã bill, không dùng tên/ngày/số tiền): tên, ngày, mục, số người và biên lai
 * (Tổng bill, phần mỗi người, ai nhận lại / còn thiếu, các khoản cần chuyển). Dùng chung cho Lịch sử chia bill và mục "Chi tiết"
 * ở Tổng quan. Có Sửa (màn tính chia) và Xóa (bấm hai lần; dọn khoản chi cá nhân đã tạo từ bill).
 */
export default function BillDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const today = todayStr();
  const { settings } = useExpenseSettings();
  const { bills, loaded, error } = useBills();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const bill = findBillById(bills, id);
  const category = bill ? resolveCategory(settings, bill.cat) : null;

  async function remove() {
    if (!bill || busy) return;
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 3500);
      return;
    }
    setBusy(true);
    try {
      await deleteBillSynced(bill.id);
      toast.show('Đã xóa');
      leave();
    } catch (e) {
      toast.show(describeBillError(e));
      setBusy(false);
    }
  }

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
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/chia-bill/sua', params: { id: bill.id } })}
              style={[styles.action, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <SvgIcon name="edit" size={16} color={colors.ink} />
              <AppText weight="semibold" style={styles.actionText}>
                Sửa
              </AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={armed ? 'Bấm lần nữa để xóa' : 'Xóa'}
              disabled={busy}
              onPress={() => void remove()}
              style={[styles.action, { backgroundColor: armed ? '#D64545' : colors.dangerSoft, borderColor: 'transparent' }]}>
              <AppText weight="semibold" color={armed ? '#FFFFFF' : colors.danger} style={styles.actionText}>
                {armed ? 'Bấm lần nữa để xóa' : 'Xóa'}
              </AppText>
            </Pressable>
          </View>
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
