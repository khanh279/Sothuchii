import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { EmptyState, ScreenTitle } from '@/components/design';
import { PaymentPanel } from '@/components/payment-panel';
import { PaymentSheet } from '@/components/payment-sheet';
import { PAY_ACTION_BAR_CLEARANCE, PayActionBar } from '@/components/pay-action-bar';
import { PayPageFrame } from '@/components/pay-page-frame';
import { useToast } from '@/components/toast';
import { PageLayout } from '@/constants/layout';
import { recordPaymentSynced } from '@/data/payService';
import { toneOf } from '@/domain/debtDetail';
import { DEBT_ZERO, debtEvents, loanLines, personLedger, type LoanLine } from '@/domain/ledger';
import { describeDebtError, useDebtData } from '@/features/debts/hooks';
import { useColors } from '@/hooks/use-colors';
import { formatVnDate } from '@/utils/date';
import { formatVnd } from '@/utils/format';

const SIGN = { get: '+', owe: '−', mid: '' } as const;

/**
 * Chi tiết NỢ VAY với MỘT người (tham số route `name`; mở khi chạm một người ở khối "Nợ vay" của trang Nợ & bill), giao diện như trang Thanh toán bill: khung tổng
 * ("Tôi nợ A" / "A nợ tôi" và số tiền vay còn lại, toàn thời gian), danh sách các khoản vay (ngày + ghi chú ở dưới, số tiền có dấu / màu bên phải) và nút Thanh toán cố định ở cuối trang.
 * CHỈ sổ vay: nợ bill của người đó không hiện ở đây; thanh toán chỉ trừ vào sổ vay (`recordPaymentSynced`, quy tắc có sẵn).
 */
export default function LoanDebtScreen() {
  const { name = '' } = useLocalSearchParams<{ name?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { bills, pays, loaded, error, reload } = useDebtData();
  const [payOpen, setPayOpen] = useState(false);
  const detail = useMemo(() => {
    if (!loaded || error) return null;
    const events = debtEvents(bills, pays);
    return { loan: personLedger(events, name).loan, lines: loanLines(events, name) };
  }, [bills, pays, name, loaded, error]);

  const loan = detail?.loan ?? 0;
  const owe = loan < 0;
  const remaining = Math.abs(loan);
  const canPay = remaining >= DEBT_ZERO;
  const tone = loan > DEBT_ZERO ? 'get' : loan < -DEBT_ZERO ? 'owe' : 'mid';
  const color = tone === 'get' ? colors.success : tone === 'owe' ? colors.danger : undefined;

  let body;
  if (error) {
    body = (
      <View style={[styles.card, { backgroundColor: colors.dangerSoft }]}>
        <AppText color={colors.danger} style={styles.note}>
          {error}
        </AppText>
      </View>
    );
  } else if (!detail) {
    body = <ActivityIndicator style={styles.loading} color={colors.primary} />;
  } else {
    body = (
      <PayPageFrame
        label={tone === 'mid' ? `Không còn nợ vay với ${name}` : 'Còn lại'}
        amount={`${SIGN[tone]}${formatVnd(remaining)}`}
        amountColor={color}
        detailsTitle="Các khoản vay"
        detailsSubtitle="Toàn thời gian"
        detailsCount={`${detail.lines.length} khoản`}
      >
        {detail.lines.length === 0 ? (
          <EmptyState text="Không còn khoản vay nào chưa thanh toán" icon="check" />
        ) : (
          <View>
            {detail.lines.map((line, index) => (
              <LoanRow key={index} line={line} first={index === 0} />
            ))}
          </View>
        )}
      </PayPageFrame>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: 'Chi tiết nợ vay', headerShown: false }} />
      <ScreenTitle title={!name ? 'Chi tiết nợ vay' : tone === 'owe' ? `Tôi nợ ${name}` : tone === 'get' ? `${name} nợ tôi` : `Nợ vay · ${name}`} topInset={insets.top} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom + (canPay ? PAY_ACTION_BAR_CLEARANCE : 0) }]} keyboardShouldPersistTaps="handled">
        {body}
      </ScrollView>
      <PayActionBar visible={!!detail && canPay} bottom={16} onPress={() => setPayOpen(true)} />
      {payOpen && detail && canPay && (
        <PaymentSheet heading={`${owe ? 'Tôi' : name} trả ${owe ? name : 'tôi'}`} amountText={formatVnd(remaining)} amountColor={owe ? colors.danger : colors.success} onClose={() => setPayOpen(false)}>
          <PaymentPanel
            remaining={remaining}
            payer={owe ? 'Tôi' : name}
            receiver={owe ? name : 'Tôi'}
            note="Chỉ trừ vào nợ vay, không đụng tới nợ bill."
            onPay={async (amount) => {
              const result = await recordPaymentSynced(name, 'loan', amount);
              if (result.value.message) toast.show(result.value.message);
              await reload();
            }}
            onDone={() => setPayOpen(false)}
            onFailure={(e) => toast.show(describeDebtError(e))}
          />
        </PaymentSheet>
      )}
    </View>
  );
}

/** Một khoản vay: tiêu đề là nội dung của khoản chuyển tiền, ghi chú nhỏ bên dưới chỉ là ngày; bên phải số tiền có dấu / màu (− đỏ: tôi phải trả, + xanh: người kia phải trả tôi). */
function LoanRow({ line, first }: { line: LoanLine; first: boolean }) {
  const colors = useColors();
  const tone = toneOf(line.v);
  const color = tone === 'get' ? colors.success : tone === 'owe' ? colors.danger : undefined;
  return (
    <View style={[styles.item, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
      <View style={styles.flex}>
        <AppText weight="medium" style={styles.itemTitle} numberOfLines={2}>
          {line.title}
        </AppText>
        <AppText color={colors.muted} style={styles.itemSub}>
          {formatVnDate(line.date)}
        </AppText>
      </View>
      <AppText weight="semibold" color={color} style={styles.itemAmount}>
        {SIGN[tone]}
        {formatVnd(Math.abs(line.v))}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  content: { paddingHorizontal: PageLayout.paddingX, paddingTop: PageLayout.contentTop, gap: PageLayout.gap },
  loading: { marginTop: 48 },
  card: { borderRadius: 16, padding: 16 },
  note: { fontSize: 14, lineHeight: 20 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  itemTitle: { fontSize: 15.5, lineHeight: 21 },
  itemSub: { fontSize: 12.5, lineHeight: 17 },
  itemAmount: { fontSize: 14.5, lineHeight: 20 },
});
