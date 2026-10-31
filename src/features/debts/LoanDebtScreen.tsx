import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll';
import { AppText } from '@/components/app-text';
import { EmptyState, ScreenTitle } from '@/components/design';
import { PaymentConfirmSheet, PaymentPanel } from '@/components/payment-panel';
import { useExpenseSettings } from '@/features/expenses/hooks';
import { PaymentSheet } from '@/components/payment-sheet';
import { PAY_ACTION_BAR_CLEARANCE, PayActionBar } from '@/components/pay-action-bar';
import { PayPageFrame } from '@/components/pay-page-frame';
import { useToast } from '@/components/toast';
import { PageLayout } from '@/constants/layout';
import { PayInputError } from '@/data/payRepository';
import { recordPaymentSynced } from '@/data/payService';
import { pickedNote, summarizePicked } from '@/domain/pickedPayment';
import { DEBT_ZERO, debtEvents, loanLines, personLedger } from '@/domain/ledger';
import { isOwedLoan, loanKey, loanLineViews, paidLoanViews } from '@/domain/loanAllocation';
import { describeDebtError, useDebtData } from '@/features/debts/hooks';
import { LoanLinesList } from '@/features/debts/LoanLinesList';
import { PaidStack, useHiddenPaid } from '@/features/debts/PaidStack';
import { useColors } from '@/hooks/use-colors';
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
  const { settings } = useExpenseSettings();
  // Chọn các khoản vay để thanh toán: tích các dòng cần trả; khoản trả được ghi chú tên các dòng đã chọn.
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const detail = useMemo(() => {
    if (!loaded || error) return null;
    const events = debtEvents(bills, pays);
    const loan = personLedger(events, name).loan;
    return { loan, lines: loanLines(events, name), views: loanLineViews(loanLines(events, name), loan) };
  }, [bills, pays, name, loaded, error]);

  const loan = detail?.loan ?? 0;
  const owe = loan < 0;
  const remaining = Math.abs(loan);
  const canPay = remaining >= DEBT_ZERO;
  const tone = loan > DEBT_ZERO ? 'get' : loan < -DEBT_ZERO ? 'owe' : 'mid';
  const color = tone === 'get' ? colors.success : tone === 'owe' ? colors.danger : undefined;

  // Người kia trả tiền cho mình: thẻ xác nhận có nút "Mã QR nhận tiền" (tài khoản của mình, đúng số tiền đang xác nhận).
  const receiveQr = tone === 'get' ? { content: `${name} tra no`, banks: settings.banks ?? [] } : undefined;
  const { hidden } = useHiddenPaid();
  const paidLoans = paidLoanViews(detail?.views ?? [], hidden);
  const summary = summarizePicked({ pair: null, owner: 'Tôi', billItems: [], pickedBills: new Set(), loanViews: detail?.views ?? [], pickedLoans: picked, loanNet: loan });
  function stopSelecting() {
    setSelecting(false);
    setConfirmOpen(false);
    setPicked(new Set());
  }
  function pressPickedPay() {
    if (summary.count === 0) return;
    if (!summary.ok) {
      toast.show(summary.reason ?? 'Chưa thanh toán được các khoản đã chọn.');
      return;
    }
    setConfirmOpen(true);
  }
  async function payPicked() {
    if (busy || !summary.ok || !summary.loan) return;
    setBusy(true);
    try {
      const result = await recordPaymentSynced(name, 'loan', summary.loan.amount, `Trả: ${summary.loan.titles.join(', ')}`, summary.loan.ids);
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
        detailsCount={`${detail.views.filter(isOwedLoan).length} khoản`}
      >
        {detail.views.filter(isOwedLoan).length === 0 ? (
          <EmptyState text="Không còn khoản vay nào chưa thanh toán" icon="check" />
        ) : (
          <LoanLinesList
            views={detail.views}
            selection={
              selecting
                ? {
                    selected: picked,
                    onToggle: (index) =>
                      setPicked((set) => {
                        const next = new Set(set);
                        if (next.has(index)) next.delete(index);
                        else next.add(index);
                        return next;
                      }),
                  }
                : undefined
            }
          />
        )}
      </PayPageFrame>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: 'Chi tiết nợ vay', headerShown: false }} />
      <ScreenTitle title={!name ? 'Chi tiết nợ vay' : tone === 'owe' ? `Tôi vay ${name}` : tone === 'get' ? `${name} vay tôi` : `Nợ vay · ${name}`} topInset={insets.top}
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
      <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom + (canPay ? PAY_ACTION_BAR_CLEARANCE : 0) }]} keyboardShouldPersistTaps="handled">
        {body}
        {/* Mọi khoản vay đã trả xong: một thẻ riêng ở cuối, tách khỏi thẻ nợ phía trên. */}
        {!!detail && !selecting && (
          <PaidStack count={paidLoans.length} keys={paidLoans.flatMap((view) => loanKey(view) ?? [])}>
            <LoanLinesList views={detail.views} mode="paid" hidden={hidden} />
          </PaidStack>
        )}
      </KeyboardAwareScrollView>
      <PayActionBar
        visible={!!detail && canPay}
        label={selecting ? (summary.count > 0 ? `Thanh toán ${summary.count} khoản · ${formatVnd(summary.total)}` : 'Chọn khoản cần thanh toán') : undefined}
        disabled={selecting && summary.count === 0}
        bottom={16}
        onPress={selecting ? pressPickedPay : () => setPayOpen(true)}
      />
      {confirmOpen && summary.ok && summary.loan && (
        <PaymentConfirmSheet
          message={summary.direction === 'owe' ? `Tôi trả ${name}` : `${name} trả tôi`}
          amountText={formatVnd(summary.total)}
          amount={summary.total}
          receiveQr={receiveQr}
          note={pickedNote(summary)}
          busy={busy}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => void payPicked()}
        />
      )}
      {payOpen && detail && canPay && (
        <PaymentSheet heading={`${owe ? 'Tôi' : name} trả ${owe ? name : 'tôi'}`} amountText={formatVnd(remaining)} amountColor={owe ? colors.danger : colors.success} onClose={() => setPayOpen(false)}>
          <PaymentPanel
            remaining={remaining}
            payer={owe ? 'Tôi' : name}
            receiver={owe ? name : 'Tôi'}
            note="Chỉ trừ vào nợ vay, không đụng tới nợ bill."
            onSelectItems={() => setSelecting(true)}
            receiveQr={receiveQr}
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

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: PageLayout.paddingX, paddingTop: PageLayout.contentTop, gap: PageLayout.gap },
  loading: { marginTop: 48 },
  card: { borderRadius: 16, padding: 16 },
  note: { fontSize: 14, lineHeight: 20 },
  cancel: { minHeight: 36, paddingHorizontal: 8, justifyContent: 'center' },
  cancelText: { fontSize: 16, lineHeight: 22 },
});
