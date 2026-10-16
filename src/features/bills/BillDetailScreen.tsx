import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { CategoryIcon } from '@/components/category-icon';
import { Panel, PersonAmountRow, ScreenTitle, SectionHeader } from '@/components/design';
import { computeSplit, describeSplitProblem } from '@/domain/bills';
import { formatMoney, rowMeta, rowStatus } from '@/domain/billForm';
import { findBillById } from '@/domain/billHistory';
import { dayHeading, resolveCategory } from '@/domain/expenses';
import { useBills } from '@/features/bills/hooks';
import { useExpenseSettings } from '@/features/expenses/hooks';
import { useColors } from '@/hooks/use-colors';
import { formatVnDate, todayStr } from '@/utils/date';

/**
 * Chi tiết MỘT bill đã chia (tham số route `id` = mã bill, không dùng tên/ngày/số tiền). Chỉ xem: tổng bill, phần mỗi người, từng
 * người chi bao nhiêu và nhận lại / còn thiếu bao nhiêu, các khoản cần chuyển — tính bằng `computeSplit` (không có logic chia riêng).
 * Dùng chung cho Lịch sử chia bill, mục Chi tiết ở Tổng quan và màn người–bill. Sửa / xóa bill làm ở Lịch sử chia bill (vuốt dòng).
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
  if (error) body = <Notice text={error} />;
  else if (!loaded) body = <ActivityIndicator style={styles.loading} color={colors.primary} />;
  else if (!bill || !category) body = <Notice text="Không tìm thấy bill này. Có thể nó đã bị xoá." />;
  else {
    const split = computeSplit(bill.people);
    body = (
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
        <View style={[styles.hero, { backgroundColor: colors.heroBg }]}>
          <View style={styles.heroTop}>
            <CategoryIcon category={category} />
            <View style={styles.flex}>
              <AppText weight="semibold" color={colors.heroInk} style={styles.heroTitle} numberOfLines={2}>
                {bill.title || 'Không tên'}
              </AppText>
              <AppText color={colors.heroSoft} style={styles.heroSub}>
                {dayHeading(bill.date, today)}, {formatVnDate(bill.date)} · {category.name} · {bill.people.length} người
              </AppText>
            </View>
          </View>
          <View style={styles.heroNumbers}>
            <View style={styles.flex}>
              <AppText weight="medium" color={colors.heroSoft} style={styles.heroLabel}>
                Tổng bill
              </AppText>
              <AppText weight="display" color={colors.heroInk} style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit>
                {formatMoney(split.total)}
              </AppText>
            </View>
            {split.total > 0 && !split.bad && (
              <View style={styles.heroRight}>
                <AppText weight="medium" color={colors.heroSoft} style={styles.heroLabel}>
                  {split.even ? 'Mỗi người' : 'Mỗi phần'}
                </AppText>
                <AppText weight="bold" color={colors.heroInk} style={styles.heroShare}>
                  {formatMoney(split.share)}
                </AppText>
              </View>
            )}
          </View>
        </View>

        {split.bad ? (
          <Notice text={describeSplitProblem(split)} />
        ) : (
          <>
            <View>
              <SectionHeader title="Thành viên" subtitle="Chi, phần phải trả và chênh lệch của từng người" />
              <Panel>
                {split.rows.map((row, index) => {
                  const status = rowStatus(row);
                  const tone = status.kind === 'get' ? 'get' : status.kind === 'owe' ? 'owe' : 'mid';
                  const amount = status.kind === 'even' ? 'Đã đủ' : `${status.kind === 'get' ? '+' : '−'}${formatMoney(status.amount / 1e3)}`;
                  return (
                    <PersonAmountRow
                      key={row.index}
                      first={index === 0}
                      name={row.name}
                      caption={`${rowMeta(row)}${status.kind === 'even' ? '' : status.kind === 'get' ? ' · Nhận lại' : ' · Còn thiếu'}`}
                      amount={amount}
                      tone={tone}
                    />
                  );
                })}
              </Panel>
            </View>
            {split.transfers.length > 0 && (
              <View>
                <SectionHeader title="Cần chuyển" subtitle="Gợi ý chuyển tiền để mọi người cân bằng" />
                <Panel>
                  {split.transfers.map((transfer, index) => (
                    <PersonAmountRow key={`${transfer.from}>${transfer.to}>${index}`} first={index === 0} name={`${transfer.from} → ${transfer.to}`} amount={formatMoney(transfer.amt)} />
                  ))}
                </Panel>
              </View>
            )}
          </>
        )}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: 'Chi tiết bill', headerShown: false }} />
      <ScreenTitle title="Chi tiết bill" topInset={insets.top} />
      {body}
    </View>
  );
}

function Notice({ text }: { text: string }) {
  const colors = useColors();
  return (
    <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
      <AppText color={colors.danger} style={styles.noticeText}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 16 },
  loading: { marginTop: 48 },
  notice: { marginHorizontal: 16, padding: 16, borderRadius: 16 },
  noticeText: { fontSize: 15 },
  hero: { borderRadius: 22, padding: 20, gap: 16 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroTitle: { fontSize: 18, lineHeight: 24 },
  heroSub: { fontSize: 12.5, lineHeight: 17 },
  heroNumbers: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  heroLabel: { fontSize: 12.5 },
  heroAmount: { fontSize: 34, lineHeight: 42, letterSpacing: -0.6 },
  heroRight: { alignItems: 'flex-end' },
  heroShare: { fontSize: 18, lineHeight: 26 },
});
