import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { EmptyState, ScreenTitle } from '@/components/design';
import { PaymentConfirmSheet } from '@/components/payment-panel';
import { useExpenseSettings } from '@/features/expenses/hooks';
import { PayPageFrame } from '@/components/pay-page-frame';
import { PAY_ACTION_BAR_CLEARANCE, PayActionBar } from '@/components/pay-action-bar';
import { PaymentSheet } from '@/components/payment-sheet';
import { useToast } from '@/components/toast';
import { PayInputError } from '@/data/payRepository';
import { recordMergedPaymentSynced } from '@/data/payService';
import { pickedNote, summarizePicked } from '@/domain/pickedPayment';
import { PageLayout } from '@/constants/layout';
import { AppRadius } from '@/constants/palette';
import { buildBillPairItems, buildBillPairs, findBillPair } from '@/domain/billPairs';
import { BILL_OWNER_NAME } from '@/domain/bills';
import { periodTitle } from '@/domain/expenses';
import type { Period } from '@/types/expense';
import { BillItemsList, signOf } from '@/features/bills/BillItemsList';
import { BillPaymentPanel } from '@/features/bills/BillPairsPanel';
import { PaidStack, useHiddenPaid } from '@/features/debts/PaidStack';
import { describeDebtError, useDebtData } from '@/features/debts/hooks';
import { useColors } from '@/hooks/use-colors';
import { formatVnd } from '@/utils/format';

/** Trang này luôn xem TẤT CẢ các khoản nợ bill của cặp, toàn bộ thời gian (không theo kỳ dùng chung, không gom theo tháng). */
const ALL_TIME: Period = { mode: 'all' };

/**
 * Trang "Thanh toán bill" của MỘT cặp người (mở khi chạm thẻ ở mục Thanh toán bill của tab Chia bill), gọn và dễ hiểu:
 * (1) thẻ tổng: "Tôi nợ A" hoặc "A nợ tôi" và TỔNG SỐ TIỀN còn phải thanh toán của cặp (có dấu −/+);
 * (2) danh sách các khoản bill tạo nên số đó, trích từ chính các bill trong kỳ (`buildBillPairItems`): tên bill, ngày, số tiền còn lại. Khoản cùng chiều với tổng
 *     cùng dấu / màu, khoản bù trừ (chiều ngược lại) ngược dấu / màu; khoản đã thanh toán đủ không hiện nên cộng các dòng ra đúng thẻ tổng;
 * (3) nút Thanh toán cố định ở cuối trang mở tờ nổi Thanh toán toàn bộ / một phần (dùng lại `BillPaymentPanel`, không có logic tính hay ghi riêng); ghi xong thì ở lại trang.
 * Quy ước: − đỏ là tiền tôi phải trả, + xanh là tiền người khác phải trả tôi. Luôn là toàn bộ thời gian.
 */
export default function BillPaymentScreen() {
  const { pair: pairKey } = useLocalSearchParams<{ pair?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const period = ALL_TIME;
  const { bills, pays, loaded, error, reload } = useDebtData();
  const [payOpen, setPayOpen] = useState(false);
  const { settings } = useExpenseSettings();
  // Chọn các khoản để thanh toán: tích các bill cần trả rồi thanh toán đúng những bill đó (bill cũ trước), không tràn sang bill khác.
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const pair = useMemo(() => findBillPair(buildBillPairs(bills, pays, period), pairKey ?? null), [bills, pays, period, pairKey]);
  // Chỉ các khoản còn phải thanh toán (đã trả đủ thì ẩn); mỗi dòng ghi SỐ CÒN LẠI của khoản đó.
  const allItems = useMemo(() => (pair ? buildBillPairItems(bills, pays, pair) : []), [bills, pays, pair]);
  const items = useMemo(() => allItems.filter((item) => item.remaining > 0), [allItems]);
  const { hidden, hide } = useHiddenPaid();
  const billKey = (billId: string) => `bill:${pair?.key}:${billId}`;
  const paidItems = allItems.filter((item) => !item.offset && item.state === 'paid' && !hidden.has(billKey(item.billId)));
  // Người kia trả tiền cho mình: thẻ xác nhận có nút "Mã QR nhận tiền" (tài khoản của mình, đúng số tiền đang xác nhận).
  const receiveQr = pair && pair.to === BILL_OWNER_NAME ? { content: `${pair.from} tra no`, banks: settings.banks ?? [] } : undefined;
  const summary = summarizePicked({ pair: pair ?? null, owner: BILL_OWNER_NAME, billItems: items, pickedBills: picked, loanViews: [], pickedLoans: new Set(), loanNet: 0 });
  function stopSelecting() {
    setSelecting(false);
    setConfirmOpen(false);
    setPicked(new Set());
  }
  function toggle(billId: string) {
    setPicked((set) => {
      const next = new Set(set);
      if (next.has(billId)) next.delete(billId);
      else next.add(billId);
      return next;
    });
  }
  async function payPicked() {
    if (busy || !summary.ok || !summary.bill) return;
    setBusy(true);
    try {
      const result = await recordMergedPaymentSynced(summary.bill.from, summary.bill.to, summary.bill.billIds, summary.bill.amount);
      if (result.value.message) toast.show(result.value.message);
      stopSelecting();
      await reload();
    } catch (e) {
      setConfirmOpen(false);
      toast.show(e instanceof PayInputError ? e.message : describeDebtError(e));
      await reload();
    } finally {
      setBusy(false);
    }
  }

  let body;
  if (error) {
    body = (
      <View style={[styles.card, { backgroundColor: colors.dangerSoft }]}>
        <AppText color={colors.danger} style={styles.note}>
          {error}
        </AppText>
      </View>
    );
  } else if (!loaded) {
    body = <ActivityIndicator style={styles.loading} color={colors.primary} />;
  } else if (!pair) {
    // Đã thanh toán hết (hoặc cặp không còn khoản nào): ở lại trang, hiện thẻ tổng bằng 0 và danh sách rỗng.
    const other = (pairKey ?? '').split('\u0001').find((name) => name && name !== BILL_OWNER_NAME);
    body = (
      <PayPageFrame label={other ? `Đã thanh toán xong với ${other}` : 'Đã thanh toán xong'} amount={formatVnd(0)} detailsTitle="Các khoản bill" detailsCount={`${periodTitle(period)} · 0 khoản`}>
        <EmptyState text="Không còn khoản nào cần thanh toán" icon="check" />
      </PayPageFrame>
    );
  } else {
    const total = signOf(pair, false);
    body = (
      <PayPageFrame
        label="Còn lại"
        amount={`${total}${formatVnd(pair.remaining)}`}
        amountColor={total === '+' ? colors.success : total === '−' ? colors.danger : undefined}
        detailsTitle="Các khoản bill"
        detailsSubtitle={periodTitle(period)}
        detailsCount={`${items.length} khoản`}
      >
        {items.length === 0 ? (
          <EmptyState text="Không có khoản nào" icon="check" />
        ) : (
          <BillItemsList pair={pair} items={items} selection={selecting ? { selected: picked, onToggle: toggle } : undefined} />
        )}
      </PayPageFrame>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: 'Thanh toán bill', headerShown: false }} />
      <ScreenTitle
        title={pair ? `${pair.from} nợ bill ${pair.to}` : 'Thanh toán bill'}
        topInset={insets.top}
        right={
          selecting ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Hủy chọn khoản" hitSlop={8} onPress={stopSelecting} style={styles.cancel}>
              <AppText weight="semibold" color={colors.danger} style={styles.cancelText}>
                Hủy
              </AppText>
            </Pressable>
          ) : undefined
        }
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom + (pair ? PAY_ACTION_BAR_CLEARANCE : 0) }]} keyboardShouldPersistTaps="handled">
        {body}
        {/* Mọi khoản bill đã trả xong: một thẻ riêng ở cuối, tách khỏi thẻ nợ phía trên. */}
        {!!pair && !selecting && (
          <PaidStack count={paidItems.length} onClear={() => hide(paidItems.map((item) => billKey(item.billId)))}>
            <BillItemsList pair={pair} items={paidItems} />
          </PaidStack>
        )}
      </ScrollView>
      <PayActionBar
        visible={!!pair && loaded && !error}
        label={selecting ? (summary.count > 0 ? `Thanh toán ${summary.count} khoản · ${formatVnd(summary.total)}` : 'Chọn khoản cần thanh toán') : undefined}
        disabled={selecting && summary.count === 0}
        bottom={16}
        onPress={selecting ? () => setConfirmOpen(true) : () => setPayOpen(true)}
      />
      {confirmOpen && pair && summary.ok && (
        <PaymentConfirmSheet
          message={`${pair.from} trả ${pair.to}`}
          amountText={formatVnd(summary.total)}
          amount={summary.total}
          receiveQr={receiveQr}
          note={pickedNote(summary)}
          busy={busy}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => void payPicked()}
        />
      )}
      {payOpen && pair && (
        <PaymentSheet heading={`${pair.from} trả ${pair.to}`} amountText={formatVnd(pair.remaining)} onClose={() => setPayOpen(false)}>
          <BillPaymentPanel
            pair={pair}
            period={period}
            onSelectItems={() => setSelecting(true)}
            receiveQr={receiveQr}
            onPaid={async (message) => {
              if (message) toast.show(message);
              await reload();
            }}
            onDone={() => setPayOpen(false)}
            onFailure={(message) => toast.show(message)}
          />
        </PaymentSheet>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  content: { paddingHorizontal: PageLayout.paddingX, paddingTop: PageLayout.contentTop, gap: PageLayout.gap },
  loading: { marginTop: 48 },
  card: { borderRadius: AppRadius.card, padding: 16, gap: 12 },
  note: { fontSize: 14, lineHeight: 20 },
  cancel: { minHeight: 36, paddingHorizontal: 8, justifyContent: 'center' },
  cancelText: { fontSize: 16, lineHeight: 22 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  itemTitle: { fontSize: 15.5, lineHeight: 21 },
  itemSub: { fontSize: 12.5, lineHeight: 17 },
  itemAmount: { fontSize: 14.5, lineHeight: 20 },
  itemRight: { alignItems: 'flex-end', flexShrink: 0 },
});
