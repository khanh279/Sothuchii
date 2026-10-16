import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { CategoryIcon } from '@/components/category-icon';
import { Panel, PersonAmountRow, ScreenTitle, SectionHeader, StatusBadge, type StatusTone } from '@/components/design';
import { AppRadius } from '@/constants/palette';
import { computeSplit, describeSplitProblem } from '@/domain/bills';
import { formatMoney, rowStatus } from '@/domain/billForm';
import { TRANSFER_STATE_LABEL, billTransferStatuses, type BillTransferStatus, type TransferPayState } from '@/domain/billPayment';
import { findBillById } from '@/domain/billHistory';
import { resolveCategory } from '@/domain/expenses';
import { useDebtData } from '@/features/debts/hooks';
import { useExpenseSettings } from '@/features/expenses/hooks';
import { useColors } from '@/hooks/use-colors';
import { formatVnDate } from '@/utils/date';

/** Màu nhãn theo trạng thái khoản chuyển: đã thanh toán xanh lá, chưa thanh toán đỏ, một phần vàng cam. */
const STATE_TONE: Record<TransferPayState, StatusTone> = { paid: 'get', unpaid: 'owe', partial: 'warn' };

/**
 * Chi tiết MỘT bill đã chia (tham số route `id` = mã bill, không dùng tên/ngày/số tiền). Chỉ xem, dùng cùng nền trang, thẻ trắng viền mảnh
 * và bo góc với danh sách bill: thông tin bill (tên, ngày dd/mm/yyyy, số người, tổng tiền), tổng hợp từng người (đã chi, phải chịu,
 * còn thiếu / nhận lại) và các khoản cần chuyển, mỗi khoản kèm trạng thái thanh toán của chính nó. Số tiền do `computeSplit` tính; trạng thái
 * đọc từ khoản trả thực tế qua `billTransferStatuses` (không ghi nhận hay đổi giao dịch nào khi mở màn hình).
 */
export default function BillDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { settings } = useExpenseSettings();
  const { bills, pays, loaded, error } = useDebtData();

  const bill = findBillById(bills, id);
  const category = bill ? resolveCategory(settings, bill.cat) : null;

  let body;
  if (error) body = <Notice text={error} />;
  else if (!loaded) body = <ActivityIndicator style={styles.loading} color={colors.primary} />;
  else if (!bill || !category) body = <Notice text="Không tìm thấy bill này. Có thể nó đã bị xoá." />;
  else {
    const split = computeSplit(bill.people);
    const statuses = billTransferStatuses(bills, pays).get(bill.id) ?? [];
    body = (
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.infoTop}>
            <CategoryIcon category={category} />
            <View style={styles.flex}>
              <AppText weight="semibold" style={styles.title} numberOfLines={2}>
                {bill.title || 'Không tên'}
              </AppText>
              <AppText color={colors.muted} style={styles.sub}>
                {formatVnDate(bill.date)} · {category.name} · {bill.people.length} người
              </AppText>
            </View>
          </View>
          <View style={styles.totalRow}>
            <View style={styles.flex}>
              <AppText weight="medium" color={colors.muted} style={styles.label}>
                Tổng tiền bill
              </AppText>
              <AppText weight="display" style={styles.total} numberOfLines={1} adjustsFontSizeToFit>
                {formatMoney(split.total)}
              </AppText>
            </View>
            {split.total > 0 && !split.bad && (
              <View style={styles.shareCol}>
                <AppText weight="medium" color={colors.muted} style={styles.label}>
                  {split.even ? 'Mỗi người' : 'Mỗi phần'}
                </AppText>
                <AppText weight="bold" style={styles.share}>
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
              <SectionHeader title="Tổng hợp từng người" subtitle="Đã chi, phải chịu và chênh lệch" />
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
                      caption={`Đã chi ${formatMoney(row.paid)} · Phải chịu ${formatMoney(row.share)}${status.kind === 'even' ? '' : status.kind === 'get' ? ' · Nhận lại' : ' · Còn thiếu'}`}
                      amount={amount}
                      tone={tone}
                    />
                  );
                })}
              </Panel>
            </View>
            {statuses.length > 0 && (
              <View>
                <SectionHeader title="Cần chuyển" subtitle="Người trả → người nhận và trạng thái thanh toán" />
                <Panel>
                  {statuses.map((transfer, index) => (
                    <TransferRow key={`${transfer.from}>${transfer.to}>${index}`} first={index === 0} transfer={transfer} />
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

/** Một khoản chuyển: người trả → người nhận, tổng số tiền, và ngay trong cụm đó là trạng thái (kèm đã trả / còn thiếu nếu một phần). */
function TransferRow({ transfer, first }: { transfer: BillTransferStatus; first: boolean }) {
  const colors = useColors();
  return (
    <View
      style={[styles.transfer, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}
      accessible
      accessibilityLabel={`${transfer.from} trả ${transfer.to} ${formatMoney(transfer.amount)}, ${TRANSFER_STATE_LABEL[transfer.state]}`}>
      <View style={styles.transferTop}>
        <AppText weight="semibold" style={styles.transferName} numberOfLines={2}>
          {transfer.from} → {transfer.to}
        </AppText>
        <AppText weight="bold" style={styles.transferAmount}>
          {formatMoney(transfer.amount)}
        </AppText>
      </View>
      <View style={styles.transferBottom}>
        <StatusBadge label={TRANSFER_STATE_LABEL[transfer.state]} tone={STATE_TONE[transfer.state]} />
        {transfer.state === 'partial' && (
          <AppText color={colors.muted} style={styles.transferNote}>
            Đã trả {formatMoney(transfer.paid)} · Còn thiếu {formatMoney(transfer.remaining)}
          </AppText>
        )}
      </View>
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
  card: { borderRadius: AppRadius.card, borderWidth: 1, padding: 16, gap: 14 },
  infoTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 18, lineHeight: 24 },
  sub: { fontSize: 12.5, lineHeight: 17 },
  totalRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  label: { fontSize: 12.5, lineHeight: 17 },
  total: { fontSize: 30, lineHeight: 38, letterSpacing: -0.5 },
  shareCol: { alignItems: 'flex-end' },
  share: { fontSize: 16, lineHeight: 24 },
  transfer: { paddingVertical: 12, gap: 8 },
  transferTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  transferName: { flex: 1, fontSize: 15.5, lineHeight: 21 },
  transferAmount: { fontSize: 16, lineHeight: 22 },
  transferBottom: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  transferNote: { fontSize: 12.5, lineHeight: 17, flexShrink: 1 },
});
