import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { PersonAmountRow, ScreenTitle, StatusBadge, type StatusTone } from '@/components/design';
import { PAY_ACTION_BAR_CLEARANCE } from '@/components/pay-action-bar';
import { SvgIcon } from '@/components/svg-icon';
import { AppRadius } from '@/constants/palette';
import { billTotal } from '@/domain/billHistory';
import { rowStatus } from '@/domain/billForm';
import { mergeBills } from '@/domain/billMerge';
import { TRANSFER_STATE_LABEL, type TransferPayState } from '@/domain/billPayment';
import { buildBillPairsFor } from '@/domain/billPairs';
import { BillPayFlow } from '@/features/bills/BillPayFlow';
import { TransferAmountText } from '@/features/bills/TransferAmountText';
import { TransferNames } from '@/features/bills/TransferNames';
import { useDebtData } from '@/features/debts/hooks';
import { useColors } from '@/hooks/use-colors';
import { formatVnDate } from '@/utils/date';
import { formatVnd } from '@/utils/format';

/**
 * Bill gộp: một bill TỔNG THỂ của nhiều bill đã chọn ở danh sách bill (tham số route `ids` = mã các bill, cách nhau bằng dấu phẩy). Chỉ xem và thanh toán; không tạo,
 * sửa hay xoá bill nào. MỘT khung gồm các phần cách nhau bằng đường kẻ: tổng tiền, các bill được gộp (chạm để mở chi tiết), tổng hợp từng người (đã chi, phải chịu, chênh lệch)
 * và các khoản còn phải thanh toán theo cặp người (đã trừ các khoản trả thực tế). Nút Thanh toán cố định ở đáy: một cặp thì mở bảng thanh toán ngay, nhiều cặp thì chọn cặp trước.
 * Số tiền gộp tính ở `domain/billMerge`, số còn phải thanh toán ở `buildBillPairsFor`; khoản trả ghi bằng `recordMergedPaymentSynced`.
 */
export default function MergedBillScreen() {
  const { ids: idsParam } = useLocalSearchParams<{ ids?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { bills, pays, loaded, error, reload } = useDebtData();
  const ids = useMemo(() => (idsParam ?? '').split(',').filter(Boolean), [idsParam]);

  const merged = useMemo(() => mergeBills(bills, ids), [bills, ids]);
  // Mọi cặp của các bill đã chọn, gồm cả cặp đã trả xong (hiện gạch ngang); chỉ cặp còn nợ mới thanh toán được.
  const allPairs = useMemo(() => buildBillPairsFor(bills, pays, ids, true), [bills, pays, ids]);
  const pairs = useMemo(() => allPairs.filter((pair) => pair.remaining > 0), [allPairs]);
  const canPay = loaded && !error && pairs.length > 0;

  let body;
  if (error) body = <Notice text={error} />;
  else if (!loaded) body = <ActivityIndicator style={styles.loading} color={colors.primary} />;
  else if (merged.bills.length === 0) body = <Notice text="Không tìm thấy các bill đã chọn. Có thể chúng đã bị xoá." />;
  else {
    body = (
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={styles.part}>
          <AppText weight="semibold" style={styles.title}>
            {`Gộp ${merged.bills.length} bill`}
          </AppText>
          <AppText color={colors.muted} style={styles.sub}>
            {merged.from === merged.to ? formatVnDate(merged.from) : `${formatVnDate(merged.from)} – ${formatVnDate(merged.to)}`}
          </AppText>
          <AppText weight="medium" color={colors.muted} style={[styles.label, styles.totalLabel]}>
            Tổng tiền các bill
          </AppText>
          <AppText weight="display" style={styles.total} numberOfLines={1} adjustsFontSizeToFit>
            {formatVnd(merged.total)}
          </AppText>
        </View>

        <Band />
        <View style={styles.part}>
          <AppText weight="bold" style={styles.sectionTitle}>
            Các bill
          </AppText>
          {merged.bills.map((bill, index) => (
            <Pressable
              key={bill.id}
              accessibilityRole="button"
              accessibilityLabel={`${bill.title || 'Không tên'}, ${formatVnd(billTotal(bill))}`}
              onPress={() => router.push({ pathname: '/chia-bill/chi-tiet', params: { id: bill.id } })}
              style={[styles.billRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
              <View style={styles.flex}>
                <AppText weight="medium" style={styles.billTitle} numberOfLines={2}>
                  {bill.title || 'Không tên'}
                </AppText>
                <AppText color={colors.muted} style={styles.sub}>
                  {`${formatVnDate(bill.date)} · ${bill.people.length} người`}
                </AppText>
              </View>
              <AppText weight="semibold" style={styles.billAmount}>
                {formatVnd(billTotal(bill))}
              </AppText>
              <SvgIcon name="chevronRight" size={16} color={colors.muted} strokeWidth={2} />
            </Pressable>
          ))}
        </View>

        <Band />
        <View style={styles.part}>
          <AppText weight="bold" style={styles.sectionTitle}>
            Tổng hợp từng người
          </AppText>
          {merged.hasBad && <Notice text="Có bill lỗi mức cố định nên không được tính vào phần từng người." />}
          {merged.people.map((person, index) => {
            const status = rowStatus(person);
            const tone = status.kind === 'get' ? 'get' : status.kind === 'owe' ? 'owe' : 'mid';
            const amount = status.kind === 'even' ? 'Đã đủ' : `${status.kind === 'get' ? '+' : '−'}${formatVnd(status.amount)}`;
            return <PersonAmountRow key={person.name} first={index === 0} name={person.name} caption={`Đã chi: ${formatVnd(person.paid)}\nPhải chịu: ${formatVnd(person.share)}`} amount={amount} tone={tone} />;
          })}
        </View>

        <Band />
        <View style={styles.part}>
          <AppText weight="bold" style={styles.sectionTitle}>
            Cần chuyển
          </AppText>
          {allPairs.length === 0 ? (
            <AppText color={colors.muted} style={styles.sub}>
              Không có khoản nào cần chuyển giữa các bill đã chọn.
            </AppText>
          ) : (
            allPairs.map((pair, index) => {
              const done = pair.remaining <= 0;
              const state: TransferPayState = done ? 'paid' : pair.partial ? 'partial' : 'unpaid';
              return (
                <View key={pair.key} style={[styles.pairBlock, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]} accessible accessibilityLabel={`${pair.from} trả ${pair.to} ${formatVnd(pair.amount)}, ${TRANSFER_STATE_LABEL[state]}`}>
                  <View style={styles.pairTop}>
                    <TransferNames from={pair.from} to={pair.to} done={done} style={styles.billTitle} />
                    <TransferAmountText from={pair.from} to={pair.to} amount={pair.amount} done={done} style={styles.billAmount} />
                  </View>
                  <View style={styles.pairBottom}>
                    <StatusBadge label={TRANSFER_STATE_LABEL[state]} tone={STATE_TONE[state]} />
                    {state === 'partial' && (
                      <AppText color={colors.muted} style={styles.sub}>
                        {`Đã trả ${formatVnd(pair.amount - pair.remaining)} · Còn thiếu ${formatVnd(pair.remaining)}`}
                      </AppText>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: 'Bill gộp', headerShown: false }} />
      <ScreenTitle title="Bill gộp" topInset={insets.top} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom + (canPay ? PAY_ACTION_BAR_CLEARANCE : 0) }]}>{body}</ScrollView>
      <BillPayFlow billIds={ids} pairs={pairs} scope={`Gộp ${merged.bills.length} bill`} visible={canPay} reload={reload} />
    </View>
  );
}

/** Đường kẻ liền giữa hai phần của khung. */
function Band() {
  const colors = useColors();
  return <View style={[styles.band, { backgroundColor: colors.line }]} />;
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

/** Màu nhãn trạng thái: đã thanh toán xanh lá, chưa thanh toán đỏ, một phần vàng cam (như chi tiết bill). */
const STATE_TONE: Record<TransferPayState, StatusTone> = { paid: 'get', unpaid: 'owe', partial: 'warn' };

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 16 },
  loading: { marginTop: 48 },
  notice: { borderRadius: 16, padding: 16 },
  noticeText: { fontSize: 15 },
  card: { borderRadius: AppRadius.card, overflow: 'hidden' },
  part: { padding: 16, gap: 8 },
  band: { height: 1 },
  title: { fontSize: 18, lineHeight: 24 },
  sub: { fontSize: 12.5, lineHeight: 17 },
  label: { fontSize: 12.5, lineHeight: 17 },
  totalLabel: { marginTop: 6 },
  total: { fontSize: 30, lineHeight: 38, letterSpacing: -0.5 },
  sectionTitle: { fontSize: 16, lineHeight: 22 },
  billRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  billTitle: { fontSize: 15.5, lineHeight: 21 },
  billAmount: { fontSize: 15.5, lineHeight: 21 },
  pairBlock: { paddingVertical: 10, gap: 6 },
  pairTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  pairBottom: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  done: { textDecorationLine: 'line-through' },
});
