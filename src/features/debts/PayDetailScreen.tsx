import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DetailField, DetailHero, DetailNotice } from '@/components/detail-parts';
import { Panel, ScreenTitle } from '@/components/design';
import { PAY_FILTER_LABEL, payRowType } from '@/domain/expenseTab';
import { buildPayHistory, type PayRow } from '@/domain/payForm';
import { useDebtData } from '@/features/debts/hooks';
import { useColors } from '@/hooks/use-colors';
import { formatVnDate } from '@/utils/date';
import { formatVnd } from '@/utils/format';

/**
 * Chi tiết MỘT giao dịch trả bill / chuyển tiền (tham số route `id` = mã khoản trả; khoản nằm trong nhóm thì mã nào của nhóm cũng được), cùng kiểu
 * giao diện với Chi tiêu: thẻ "Số tiền", bảng các dòng (nội dung, người trả, người nhận, loại, ngày, ghi chú) và dòng ghi chú cuối trang. Chỉ xem;
 * sửa / xoá bằng cách vuốt dòng ở Lịch sử giao dịch.
 */
export default function PayDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { bills, pays, loaded, error } = useDebtData();
  const row = useMemo<PayRow | null>(() => {
    if (!id) return null;
    for (const day of buildPayHistory(pays, bills, { mode: 'all' }).days) {
      const found = day.rows.find((item) => item.ids.includes(id));
      if (found) return found;
    }
    return null;
  }, [pays, bills, id]);

  let body;
  if (error) body = <DetailNotice text={error} tone="error" />;
  else if (!loaded) body = <ActivityIndicator style={styles.loading} color={colors.primary} />;
  else if (!row) body = <DetailNotice text="Không tìm thấy giao dịch này. Có thể nó đã bị xoá." tone="error" />;
  else {
    const rows: { label: string; value: string }[] = [
      { label: 'Nội dung', value: row.title || `${row.from} → ${row.to}` },
      { label: 'Người trả', value: row.from },
      { label: 'Người nhận', value: row.to },
      { label: 'Loại', value: PAY_FILTER_LABEL[payRowType(row)] },
      { label: 'Ngày', value: formatVnDate(row.date) },
    ];
    if (row.detail) rows.push({ label: 'Chi tiết', value: row.detail });
    if (row.note) rows.push({ label: 'Ghi chú', value: row.note });
    if (row.group) rows.push({ label: 'Gồm', value: `${row.ids.length} khoản trả` });
    body = (
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
        <DetailHero amount={formatVnd(row.amt)} />
        <Panel>
          {rows.map((item, index) => (
            <DetailField key={item.label} label={item.label} value={item.value} last={index === rows.length - 1} />
          ))}
        </Panel>
        <DetailNotice text="Vuốt dòng sang trái để sửa hoặc xóa" tone="info" />
      </ScrollView>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: 'Chi tiết giao dịch', headerShown: false }} />
      <ScreenTitle title="Chi tiết giao dịch" topInset={insets.top} />
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },
  loading: { marginTop: 48 },
});
