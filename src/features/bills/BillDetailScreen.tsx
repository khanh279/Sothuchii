import { Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, type HostInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { CategoryIcon } from '@/components/category-icon';
import { PersonAmountRow, ScreenTitle, StatusBadge, type StatusTone } from '@/components/design';
import { SvgIcon } from '@/components/svg-icon';
import { useToast } from '@/components/toast';
import type { IconName } from '@/constants/icons';
import { AppRadius } from '@/constants/palette';
import { computeSplit, describeSplitProblem } from '@/domain/bills';
import { rowStatus } from '@/domain/billForm';
import { TRANSFER_STATE_LABEL, billTransferStatuses, type BillTransferStatus, type TransferPayState } from '@/domain/billPayment';
import { findBillById } from '@/domain/billHistory';
import { buildBillPairsFor } from '@/domain/billPairs';
import { resolveCategory } from '@/domain/expenses';
import { PAY_ACTION_BAR_CLEARANCE } from '@/components/pay-action-bar';
import { BillPayFlow } from '@/features/bills/BillPayFlow';
import { saveBillImage, shareBillImage, type ExportResult } from '@/features/bills/billImageExport';
import { useDebtData } from '@/features/debts/hooks';
import { useExpenseSettings } from '@/features/expenses/hooks';
import { useColors } from '@/hooks/use-colors';
import { formatVnDate } from '@/utils/date';
import { formatVnd } from '@/utils/format';

/** Màu nhãn theo trạng thái khoản chuyển: đã thanh toán xanh lá, chưa thanh toán đỏ, một phần vàng cam. */
const STATE_TONE: Record<TransferPayState, StatusTone> = { paid: 'get', unpaid: 'owe', partial: 'warn' };

/**
 * Chi tiết MỘT bill đã chia (tham số route `id` = mã bill, không dùng tên/ngày/số tiền). Chỉ xem, MỘT khung gồm ba phần cách nhau bằng đường kẻ:
 * thông tin bill (tên, ngày, số người, tổng tiền), tổng hợp từng người (đã chi, phải chịu, chênh lệch) và các khoản cần chuyển, mỗi khoản kèm trạng thái
 * thanh toán của chính nó (đã thanh toán thì gạch ngang). Số tiền do `computeSplit` tính; trạng thái đọc từ khoản trả thực tế qua
 * `billTransferStatuses` (không ghi nhận hay đổi giao dịch nào khi mở màn hình).
 * Hai biểu tượng Lưu ảnh / Chia sẻ nằm dưới khung và chụp CHÍNH khung đang hiển thị nên ảnh xuất giống hệt bill trên màn hình.
 */
export default function BillDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { settings } = useExpenseSettings();
  const { bills, pays, loaded, error, reload } = useDebtData();

  const toast = useToast();
  const shotRef = useRef<HostInstance>(null);
  const [exporting, setExporting] = useState<'save' | 'share' | null>(null);

  const bill = findBillById(bills, id);
  const category = bill ? resolveCategory(settings, bill.cat) : null;
  const split = bill ? computeSplit(bill.people) : null;
  const statuses = bill ? (billTransferStatuses(bills, pays).get(bill.id) ?? []) : [];
  /** Chỉ xuất ảnh khi bill hợp lệ và chia được (bill lỗi mức cố định chỉ hiện cảnh báo). */
  const canExport = loaded && !error && !!bill && !!category && !!split && !split.bad;
  // Khoản còn phải thanh toán của riêng bill này (đã trừ các khoản trả thực tế); còn khoản nào thì hiện nút Thanh toán ở đáy.
  const pairs = bill ? buildBillPairsFor(bills, pays, [bill.id]) : [];
  const canPay = loaded && !error && !!bill && pairs.length > 0;

  async function runExport(kind: 'save' | 'share') {
    if (exporting) return;
    setExporting(kind);
    let result: ExportResult;
    try {
      result = await (kind === 'save' ? saveBillImage(shotRef.current) : shareBillImage(shotRef.current));
    } finally {
      setExporting(null);
    }
    if (result.message) toast.show(result.message);
  }

  let body;
  if (error) body = <Notice text={error} />;
  else if (!loaded) body = <ActivityIndicator style={styles.loading} color={colors.primary} />;
  else if (!bill || !category) body = <Notice text="Không tìm thấy bill này. Có thể nó đã bị xoá." />;
  else if (!split) body = null;
  else {
    body = (
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom + (canPay ? PAY_ACTION_BAR_CLEARANCE : 0) }]}>
        <View>
        {/* Khung được chụp khi Lưu ảnh / Chia sẻ: nền trang ở góc bo để ảnh không có góc trong suốt. */}
        <View ref={shotRef} collapsable={false} style={{ backgroundColor: colors.bg }}>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.part}>
              <View style={[styles.infoTop, canExport && styles.infoTopWithActions]}>
                <CategoryIcon category={category} />
                <View style={styles.flex}>
                  <AppText weight="semibold" style={styles.title} numberOfLines={2}>
                    {bill.title || 'Không tên'}
                  </AppText>
                  <AppText color={colors.muted} style={styles.sub}>
                    {formatVnDate(bill.date)} · {bill.people.length} người
                  </AppText>
                </View>
              </View>
              <View style={styles.totalRow}>
                <View style={styles.flex}>
                  <AppText weight="medium" color={colors.muted} style={styles.label}>
                    Tổng tiền bill
                  </AppText>
                  <AppText weight="display" style={styles.total} numberOfLines={1} adjustsFontSizeToFit>
                    {formatVnd(split.total)}
                  </AppText>
                </View>
                {split.total > 0 && !split.bad && (
                  <View style={styles.shareCol}>
                    <AppText weight="medium" color={colors.muted} style={styles.label}>
                      {split.even ? 'Mỗi người' : 'Mỗi phần'}
                    </AppText>
                    <AppText weight="bold" style={styles.share}>
                      {formatVnd(split.share)}
                    </AppText>
                  </View>
                )}
              </View>
            </View>

            {split.bad ? (
              <>
                <Band />
                <View style={styles.part}>
                  <Notice text={describeSplitProblem(split)} />
                </View>
              </>
            ) : (
              <>
                <Band />
                <View style={styles.part}>
                  <AppText weight="bold" style={styles.sectionTitle}>
                    Tổng hợp từng người
                  </AppText>
                  {split.rows.map((row, index) => {
                    const status = rowStatus(row);
                    const tone = status.kind === 'get' ? 'get' : status.kind === 'owe' ? 'owe' : 'mid';
                    const amount = status.kind === 'even' ? 'Đã đủ' : `${status.kind === 'get' ? '+' : '−'}${formatVnd(status.amount)}`;
                    return <PersonAmountRow key={row.index} first={index === 0} name={row.name} caption={`Đã chi: ${formatVnd(row.paid)}\n${shareLabel(row)}: ${formatVnd(row.share)}`} amount={amount} tone={tone} />;
                  })}
                </View>
                {statuses.length > 0 && (
                  <>
                    <Band />
                    <View style={styles.part}>
                      <AppText weight="bold" style={styles.sectionTitle}>
                        Cần chuyển
                      </AppText>
                      {statuses.map((transfer, index) => (
                        <TransferRow key={`${transfer.from}>${transfer.to}>${index}`} first={index === 0} transfer={transfer} />
                      ))}
                    </View>
                  </>
                )}
              </>
            )}
          </View>
        </View>

        {/* Hai nút nằm NGOÀI khung được chụp (góc phải trên của thẻ bill) nên không lọt vào ảnh xuất. */}
        {canExport && (
          <View style={styles.cornerActions}>
            <ExportIcon icon="download" label="Lưu ảnh" busy={exporting === 'save'} disabled={!!exporting} onPress={() => void runExport('save')} />
            <ExportIcon icon="share" label="Chia sẻ" busy={exporting === 'share'} disabled={!!exporting} onPress={() => void runExport('share')} />
          </View>
        )}
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: 'Chi tiết bill', headerShown: false }} />
      <ScreenTitle title="Chi tiết bill" topInset={insets.top} />
      {body}
      {bill && <BillPayFlow billIds={[bill.id]} pairs={pairs} visible={canPay} reload={reload} />}
    </View>
  );
}

/** Đường kẻ liền giữa hai phần của khung (các phần nằm sát nhau trong cùng một khung). */
/** Nhãn của phần mỗi người: mức cố định thì "Cố định"; hệ số khác 1 thì "Phải chịu (x2)"; còn lại "Phải chịu". */
function shareLabel(row: { fixed: boolean; w: number }): string {
  if (row.fixed) return 'Cố định';
  return row.w !== 1 ? `Phải chịu (x${String(row.w).replace('.', ',')})` : 'Phải chịu';
}

function Band() {
  const colors = useColors();
  return <View style={[styles.band, { backgroundColor: colors.line }]} />;
}

/** Nút biểu tượng tròn (Lưu ảnh / Chia sẻ) dưới bill; có nhãn cho trình đọc màn hình. */
function ExportIcon({ icon, label, busy, disabled, onPress }: { icon: IconName; label: string; busy: boolean; disabled: boolean; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.exportButton, { backgroundColor: colors.primarySoft, opacity: disabled && !busy ? 0.5 : pressed ? 0.8 : 1 }]}>
      {busy ? <ActivityIndicator size="small" color={colors.primary} /> : <SvgIcon name={icon} size={18} color={colors.primary} strokeWidth={2} />}
    </Pressable>
  );
}

/** Một khoản chuyển: người trả → người nhận, tổng số tiền, và ngay trong cụm đó là trạng thái (kèm đã trả / còn thiếu nếu một phần). */
function TransferRow({ transfer, first }: { transfer: BillTransferStatus; first: boolean }) {
  const colors = useColors();
  /** Đã thanh toán đủ: gạch ngang tên và số tiền để thấy khoản đã hoàn thành. */
  const done = transfer.state === 'paid';
  return (
    <View
      style={[styles.transfer, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}
      accessible
      accessibilityLabel={`${transfer.from} trả ${transfer.to} ${formatVnd(transfer.amount)}, ${TRANSFER_STATE_LABEL[transfer.state]}`}>
      <View style={styles.transferTop}>
        <AppText weight="semibold" color={done ? colors.muted : undefined} style={[styles.transferName, done && styles.done]} numberOfLines={2}>
          {transfer.from} → {transfer.to}
        </AppText>
        <AppText weight="bold" color={done ? colors.muted : undefined} style={[styles.transferAmount, done && styles.done]}>
          {formatVnd(transfer.amount)}
        </AppText>
      </View>
      <View style={styles.transferBottom}>
        <StatusBadge label={TRANSFER_STATE_LABEL[transfer.state]} tone={STATE_TONE[transfer.state]} />
        {transfer.state === 'partial' && (
          <AppText color={colors.muted} style={styles.transferNote}>
            Đã trả {formatVnd(transfer.paid)} · Còn thiếu {formatVnd(transfer.remaining)}
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
  /** Góc phải trên của thẻ bill. */
  cornerActions: { position: 'absolute', top: 12, right: 12, flexDirection: 'row', gap: 8 },
  exportButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  /** Chừa chỗ bên phải cho hai nút ở góc (2 × 36 + khoảng cách 8 + lề). */
  infoTopWithActions: { paddingRight: 84 },
  notice: { borderRadius: 16, padding: 16 },
  noticeText: { fontSize: 15 },
  card: { borderRadius: AppRadius.card, overflow: 'hidden' },
  part: { padding: 16, gap: 8 },
  band: { height: 1 },
  sectionTitle: { fontSize: 16, lineHeight: 22 },
  infoTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 18, lineHeight: 24 },
  sub: { fontSize: 12.5, lineHeight: 17 },
  totalRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 6 },
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
  done: { textDecorationLine: 'line-through' },
});
