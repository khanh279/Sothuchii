import { Stack } from 'expo-router';
import { useMemo } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { ScreenTitle } from '@/components/design';
import { PageLayout } from '@/constants/layout';
import { AppRadius } from '@/constants/palette';
import { billShareFromHash, decodeBillShare } from '@/domain/billShare';
import { computeSplit } from '@/domain/bills';
import { SplitReceipt } from '@/features/bills/SplitReceipt';
import { useColors } from '@/hooks/use-colors';
import { formatVnDate } from '@/utils/date';
import { formatVnd } from '@/utils/format';

/**
 * Trang XEM bill chỉ đọc mở từ liên kết người khác gửi (`/xem-bill#b=…`, xem `domain/billShare`): hiện tên bill, ngày, ai đã chi bao nhiêu và biên lai chia (ai nhận lại, ai còn thiếu, các khoản cần chuyển).
 * Dữ liệu nằm trong chính địa chỉ, không có gì được lưu vào máy người xem và không gọi máy chủ. Chỉ chạy trên web (liên kết là địa chỉ trang web); địa chỉ hỏng thì báo không đọc được.
 */
export default function SharedBillScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bill = useMemo(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
    return decodeBillShare(billShareFromHash(window.location.hash));
  }, []);
  const split = useMemo(() => (bill ? computeSplit(bill.people) : null), [bill]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: 'Xem bill', headerShown: false }} />
      <ScreenTitle title={bill?.title || 'Xem bill'} topInset={insets.top} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
        {!bill || !split ? (
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <AppText weight="semibold" style={styles.title}>
              Không đọc được liên kết này
            </AppText>
            <AppText color={colors.muted} style={styles.note}>
              Liên kết bị cắt ngắn hoặc không đúng. Hãy nhờ người gửi chia sẻ lại liên kết xem bill.
            </AppText>
          </View>
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <AppText color={colors.muted} style={styles.note}>
                {formatVnDate(bill.date)} · {bill.people.length} người
              </AppText>
              {bill.people.map((person) => (
                <View key={person.name} style={styles.row}>
                  <AppText weight="semibold" style={styles.name} numberOfLines={1}>
                    {person.name}
                  </AppText>
                  <AppText color={colors.muted} style={styles.note}>
                    Đã chi {formatVnd(person.paid)}
                  </AppText>
                </View>
              ))}
            </View>
            <SplitReceipt split={split} showTotal framed />
            <AppText color={colors.muted} style={styles.foot}>
              Đây là bản xem chỉ đọc từ liên kết; không có gì được lưu vào máy của bạn.
            </AppText>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: PageLayout.paddingX, paddingTop: PageLayout.contentTop, gap: PageLayout.gap },
  card: { borderRadius: AppRadius.card, padding: 16, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  name: { flex: 1, minWidth: 0, fontSize: 15.5 },
  title: { fontSize: 16 },
  note: { fontSize: 13, lineHeight: 18 },
  foot: { fontSize: 12.5, lineHeight: 17, textAlign: 'center', paddingHorizontal: 8 },
});
