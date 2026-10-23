import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { EmptyState, ScreenTitle } from '@/components/design';
import { PayPageFrame } from '@/components/pay-page-frame';
import { PAY_ACTION_BAR_CLEARANCE, PayActionBar } from '@/components/pay-action-bar';
import { PaymentSheet } from '@/components/payment-sheet';
import { SvgIcon } from '@/components/svg-icon';
import { useToast } from '@/components/toast';
import { PageLayout } from '@/constants/layout';
import { AppRadius } from '@/constants/palette';
import { buildBillPairItems, buildBillPairs, findBillPair, type BillPair, type BillPairItem } from '@/domain/billPairs';
import { BILL_OWNER_NAME } from '@/domain/bills';
import { periodTitle } from '@/domain/expenses';
import { BillPaymentPanel } from '@/features/bills/BillPairsPanel';
import { useDebtData } from '@/features/debts/hooks';
import { useColors } from '@/hooks/use-colors';
import { useSharedPeriod } from '@/hooks/use-shared-period';
import { formatVnDate } from '@/utils/date';
import { formatNote } from '@/utils/note';
import { formatVnd } from '@/utils/format';

/** Chiều tiền theo góc nhìn của "Tôi": '−' tôi trả đi, '+' tôi nhận về, '' cặp không có tôi (không dấu, màu thường). */
type Sign = '+' | '−' | '';

/** Dấu của khoản cùng chiều với cặp (`from` → `to`); khoản bù trừ (chiều ngược lại) có dấu ngược. */
function signOf(pair: Pick<BillPair, 'from' | 'to'>, offset: boolean): Sign {
  const forward: Sign = pair.from === BILL_OWNER_NAME ? '−' : pair.to === BILL_OWNER_NAME ? '+' : '';
  if (!forward || !offset) return forward;
  return forward === '−' ? '+' : '−';
}

/**
 * Trang "Thanh toán bill" của MỘT cặp người (mở khi chạm thẻ ở mục Thanh toán bill của tab Chia bill), gọn và dễ hiểu:
 * (1) thẻ tổng: "Tôi nợ A" hoặc "A nợ tôi" và TỔNG SỐ TIỀN còn phải thanh toán của cặp (có dấu −/+);
 * (2) danh sách các khoản bill tạo nên số đó, trích từ chính các bill trong kỳ (`buildBillPairItems`): tên bill, ngày, số tiền còn lại. Khoản cùng chiều với tổng
 *     cùng dấu / màu, khoản bù trừ (chiều ngược lại) ngược dấu / màu; khoản đã thanh toán đủ không hiện nên cộng các dòng ra đúng thẻ tổng;
 * (3) nút Thanh toán cố định ở cuối trang mở tờ nổi Thanh toán toàn bộ / một phần (dùng lại `BillPaymentPanel`, không có logic tính hay ghi riêng); ghi xong thì ở lại trang.
 * Quy ước: − đỏ là tiền tôi phải trả, + xanh là tiền người khác phải trả tôi. Kỳ là kỳ dùng chung đang chọn.
 */
export default function BillPaymentScreen() {
  const { pair: pairKey } = useLocalSearchParams<{ pair?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { period } = useSharedPeriod();
  const { bills, pays, loaded, error, reload } = useDebtData();
  const [payOpen, setPayOpen] = useState(false);
  const pair = useMemo(() => findBillPair(buildBillPairs(bills, pays, period), pairKey ?? null), [bills, pays, period, pairKey]);
  // Chỉ các khoản còn phải thanh toán (đã trả đủ thì ẩn); mỗi dòng ghi SỐ CÒN LẠI của khoản đó.
  const items = useMemo(() => (pair ? buildBillPairItems(bills, pays, pair).filter((item) => item.remaining > 0) : []), [bills, pays, pair]);

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
    // Đã thanh toán hết (hoặc cặp không còn khoản trong kỳ): ở lại trang, hiện thẻ tổng bằng 0 và danh sách rỗng.
    const other = (pairKey ?? '').split('\u0001').find((name) => name && name !== BILL_OWNER_NAME);
    body = (
      <PayPageFrame label={other ? `Đã thanh toán xong với ${other}` : 'Đã thanh toán xong'} amount={formatVnd(0)} detailsTitle="Các khoản bill" detailsCount={`${periodTitle(period)} · 0 khoản`}>
        <EmptyState text="Không còn khoản nào cần thanh toán trong kỳ" icon="check" />
      </PayPageFrame>
    );
  } else {
    const total = signOf(pair, false);
    const label = pair.from === BILL_OWNER_NAME ? `Tôi nợ ${pair.to}` : pair.to === BILL_OWNER_NAME ? `${pair.from} nợ tôi` : `${pair.from} nợ ${pair.to}`;
    body = (
      <PayPageFrame
        label={label}
        amount={`${total}${formatVnd(pair.remaining)}`}
        amountColor={total === '+' ? colors.success : total === '−' ? colors.danger : undefined}
        detailsTitle="Các khoản bill"
        detailsCount={`${periodTitle(period)} · ${items.length} khoản`}
      >
        {items.length === 0 ? (
          <EmptyState text="Không có khoản nào trong kỳ" icon="check" />
        ) : (
          <View>
            {items.map((item, index) => (
              <ItemRow key={`${item.billId}>${index}`} item={item} sign={signOf(pair, item.offset)} first={index === 0} />
            ))}
          </View>
        )}
      </PayPageFrame>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: 'Thanh toán bill', headerShown: false }} />
      <ScreenTitle title="Thanh toán bill" topInset={insets.top} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom + (pair ? PAY_ACTION_BAR_CLEARANCE : 0) }]} keyboardShouldPersistTaps="handled">
        {body}
      </ScrollView>
      <PayActionBar visible={!!pair && loaded && !error} bottom={16} onPress={() => setPayOpen(true)} />
      {payOpen && pair && (
        <PaymentSheet heading={`${pair.from} trả ${pair.to}`} amountText={formatVnd(pair.remaining)} onClose={() => setPayOpen(false)}>
          <BillPaymentPanel
            pair={pair}
            period={period}
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

/** Một khoản bill: tên bill, bên dưới ngày (và "Đã trả …" / "Bù trừ" nếu có), bên phải số còn lại có dấu và màu theo quy ước. Chạm để mở chi tiết bill. */
function ItemRow({ item, sign, first }: { item: BillPairItem; sign: Sign; first: boolean }) {
  const colors = useColors();
  const color = sign === '+' ? colors.success : sign === '−' ? colors.danger : undefined;
  const sub = [formatVnDate(item.date), item.offset ? 'Bù trừ' : '', !item.offset && item.state === 'partial' ? `Đã trả ${formatVnd(item.paid)}` : ''].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title || 'Không tên'}, ${sign}${formatVnd(item.remaining)}`}
      onPress={() => router.push({ pathname: '/chia-bill/chi-tiet', params: { id: item.billId } })}
      style={[styles.item, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
      <View style={styles.flex}>
        <AppText weight="semibold" style={styles.itemTitle} numberOfLines={2}>
          {item.title || 'Không tên'}
        </AppText>
        <AppText color={colors.muted} style={styles.itemSub}>
          {formatNote(sub)}
        </AppText>
      </View>
      <AppText weight="bold" color={color} style={styles.itemAmount}>
        {sign}
        {formatVnd(item.remaining)}
      </AppText>
      <SvgIcon name="chevronRight" size={14} color={colors.muted} strokeWidth={2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  content: { paddingHorizontal: PageLayout.paddingX, paddingTop: PageLayout.contentTop, gap: PageLayout.gap },
  loading: { marginTop: 48 },
  card: { borderRadius: AppRadius.card, padding: 16, gap: 12 },
  note: { fontSize: 14, lineHeight: 20 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  itemTitle: { fontSize: 15.5, lineHeight: 21 },
  itemSub: { fontSize: 12.5, lineHeight: 17 },
  itemAmount: { fontSize: 16, lineHeight: 22 },
});
