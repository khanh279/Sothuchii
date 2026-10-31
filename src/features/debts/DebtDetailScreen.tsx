import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll';
import { AppText } from '@/components/app-text';
import { PrimaryButton, ScreenTitle, SectionHeader } from '@/components/design';
import { SvgIcon } from '@/components/svg-icon';
import { DebtImageSheet } from '@/features/debts/DebtImageSheet';
import { PersonPaidCard } from '@/features/debts/PaidStack';
import { PaymentConfirmSheet } from '@/components/payment-panel';
import { PayPageFrame } from '@/components/pay-page-frame';
import { PAY_ACTION_BAR_CLEARANCE, PayActionBar } from '@/components/pay-action-bar';
import { PaymentSheet } from '@/components/payment-sheet';
import { useToast } from '@/components/toast';
import { AppRadius } from '@/constants/palette';
import { PayInputError } from '@/data/payRepository';
import { mergeDebtsSynced, recordMergedPaymentSynced, recordPaymentSynced, undoMergeSynced, type RecordResult, type SyncedPayChange } from '@/data/payService';
import { buildDebtDetail } from '@/domain/debtDetail';
import { buildDebtPeopleSplit } from '@/domain/debtOverview';
import { periodFromParams, resolveCategory } from '@/domain/expenses';
import { pickedNote, summarizePicked } from '@/domain/pickedPayment';
import { DebtBreakdown, debtTotalSummary, usePersonDebtLists, type PersonDebtLists } from '@/features/debts/DebtBreakdown';
import { DebtPaymentPanel, debtPaySummary } from '@/features/debts/DebtPeoplePanel';
import { describeDebtError, useDebtData } from '@/features/debts/hooks';
import { useExpenseSettings } from '@/features/expenses/hooks';
import { BILL_OWNER_NAME } from '@/domain/bills';
import { useColors } from '@/hooks/use-colors';
import { formatVnDate, todayStr } from '@/utils/date';
import { formatVnd } from '@/utils/format';

/**
 * Chi tiết nợ với MỘT người (tham số route `name`; mở khi chạm một khoản ở tab Công nợ): hai ngăn Nợ vay / Nợ bill, gộp nợ, lịch sử gộp và hoàn tác, và nút Thanh toán
 * cố định ở cuối trang mở tờ nổi Thanh toán toàn bộ / một phần (như trang Thanh toán bill, dùng lại `DebtPaymentPanel`); thanh toán xong thì ở lại trang.
 * Kỳ xem lấy từ tham số (`mode`, `month`, `year`, `from`, `to`) và chỉ lọc danh sách bill; số dư luôn là toàn thời gian.
 */
export default function DebtDetailScreen() {
  const params = useLocalSearchParams<{ name?: string; mode?: string; month?: string; year?: string; from?: string; to?: string }>();
  const today = todayStr();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { settings } = useExpenseSettings();
  const { bills, pays, loaded, error, reload } = useDebtData();
  const period = useMemo(() => periodFromParams(params, today), [params, today]);
  const categoryName = (id: string) => resolveCategory(settings, id).name;

  const [busy, setBusy] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const name = params.name ?? '';
  // Chọn các khoản để thanh toán: tích các khoản nợ bill / dòng nợ vay cần trả rồi thanh toán đúng những khoản đó.
  const [selecting, setSelecting] = useState(false);
  const [pickedBills, setPickedBills] = useState<ReadonlySet<string>>(new Set());
  const [pickedLoans, setPickedLoans] = useState<ReadonlySet<number>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const lists = usePersonDebtLists(bills, pays, name);
  const detail = loaded && !error ? buildDebtDetail(bills, pays, name, period, categoryName) : null;
  const summary = detail ? debtPaySummary(detail, name) : null;
  const loanNet = detail?.loan ?? 0;
  const picked = summarizePicked({ pair: lists.pair, owner: BILL_OWNER_NAME, billItems: lists.billItems, pickedBills, loanViews: lists.loanList, pickedLoans, loanNet });
  const toggleIn = <T,>(set: ReadonlySet<T>, value: T): ReadonlySet<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };
  /** Dữ liệu cho ảnh nhắc nợ: các khoản người này còn nợ mình (nợ vay còn nợ, nợ bill chiều chính còn lại) và tổng. */
  const reminder = {
    loans: lists.loanList.filter((view) => view.kind === 'debt' && view.line.v > 0 && view.remaining > 0).map((view) => ({ title: view.line.title, date: view.line.date, amount: view.remaining })),
    bills: lists.pair?.to === BILL_OWNER_NAME ? lists.billItems.filter((item) => !item.offset).map((item) => ({ title: item.title, date: item.date, amount: item.remaining })) : [],
    total: detail ? Math.abs(detail.loan + detail.bill) : 0,
  };
  const [imageOpen, setImageOpen] = useState(false);
  function stopSelecting() {
    setSelecting(false);
    setConfirmOpen(false);
    setPickedBills(new Set());
    setPickedLoans(new Set());
  }
  function pressPickedPay() {
    if (picked.count === 0) return;
    if (!picked.ok) {
      toast.show(picked.reason ?? 'Chưa thanh toán được các khoản đã chọn.');
      return;
    }
    setConfirmOpen(true);
  }
  /** Ghi các khoản đã chọn: nợ bill chỉ trừ vào đúng các bill đã tích (bill cũ trước), nợ vay trừ vào sổ vay; hai phần là hai giao dịch riêng. */
  async function payPicked() {
    if (busy || !picked.ok) return;
    setBusy(true);
    try {
      const messages: string[] = [];
      if (picked.bill) {
        const result = await recordMergedPaymentSynced(picked.bill.from, picked.bill.to, picked.bill.billIds, picked.bill.amount);
        if (result.value.message) messages.push(result.value.message);
      }
      if (picked.loan) {
        const result = await recordPaymentSynced(name, 'loan', picked.loan.amount, `Trả: ${picked.loan.titles.join(', ')}`, picked.loan.ids);
        if (result.value.message) messages.push(result.value.message);
      }
      if (messages.length > 0) toast.show(messages.join('\n'));
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
  // Tiêu đề theo chiều nợ ròng (nợ vay + nợ bill) với người này: "Tôi nợ A" / "A nợ tôi"; hai sổ bù nhau về 0 hoặc chưa có dữ liệu thì "Công nợ với A".
  const netTone = loaded && !error ? buildDebtPeopleSplit(bills, pays, true).find((person) => person.name === name)?.tone : undefined;
  // Người kia trả tiền cho mình: thẻ xác nhận có nút "Mã QR nhận tiền" (tài khoản của mình, đúng số tiền đang xác nhận).
  const receiveQr = netTone === 'get' ? { content: `${name} tra no`, banks: settings.banks ?? [] } : undefined;
  const title = !name ? 'Chi tiết công nợ' : netTone === 'owe' ? `Tôi nợ ${name}` : netTone === 'get' ? `${name} nợ tôi` : `Công nợ với ${name}`;

  async function run(task: () => Promise<SyncedPayChange<RecordResult | number>>, done?: (value: RecordResult | number) => string) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await task();
      const message = done ? done(result.value) : typeof result.value === 'object' ? result.value.message : '';
      if (message) toast.show(message);
      await reload();
    } catch (e) {
      toast.show(e instanceof PayInputError ? e.message : describeDebtError(e));
    } finally {
      setBusy(false);
    }
  }

  let body: ReactNode;
  if (error) {
    body = (
      <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
        <AppText color={colors.danger} style={styles.noticeText}>
          {error}
        </AppText>
      </View>
    );
  } else if (!loaded) {
    body = <ActivityIndicator style={styles.loading} color={colors.primary} />;
  } else {
    body = (
      <PersonView
        corner={
          netTone === 'get' && !selecting ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Nhắc nợ: tạo ảnh các khoản nợ" hitSlop={8} onPress={() => setImageOpen(true)} style={[styles.bell, { backgroundColor: colors.primarySoft }]}>
              <SvgIcon name="bell" size={20} color={colors.primary} strokeWidth={2} />
            </Pressable>
          ) : undefined
        }
        name={name}
        detail={detail!}
        busy={busy}
        run={run}
        lists={lists}
        selection={
          selecting
            ? {
                bills: { selected: pickedBills, onToggle: (id) => setPickedBills((set) => toggleIn(set, id)) },
                loans: { selected: pickedLoans, onToggle: (index) => setPickedLoans((set) => toggleIn(set, index)) },
              }
            : undefined
        }
      />
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: 'Chi tiết nợ', headerShown: false }} />
      <ScreenTitle
        title={title}
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
      <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom + (summary || selecting ? PAY_ACTION_BAR_CLEARANCE : 0) }]} keyboardShouldPersistTaps="handled">
        {body}
        {imageOpen && <DebtImageSheet name={name} loans={reminder.loans} bills={reminder.bills} total={reminder.total} banks={settings.banks ?? []} onClose={() => setImageOpen(false)} />}
      </KeyboardAwareScrollView>
      <PayActionBar
        visible={selecting || !!summary}
        label={selecting ? (picked.count > 0 ? `Thanh toán ${picked.count} khoản · ${formatVnd(picked.total)}` : 'Chọn khoản cần thanh toán') : undefined}
        disabled={selecting && picked.count === 0}
        bottom={16}
        onPress={selecting ? pressPickedPay : () => setPayOpen(true)}
      />
      {confirmOpen && picked.ok && (
        <PaymentConfirmSheet
          message={picked.direction === 'owe' ? `Tôi trả ${name}` : `${name} trả tôi`}
          amountText={formatVnd(picked.total)}
          amount={picked.total}
          receiveQr={receiveQr}
          note={pickedNote(picked)}
          busy={busy}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => void payPicked()}
        />
      )}
      {payOpen && summary && (
        <PaymentSheet heading={`${summary.payer} trả ${summary.receiver}`} amountText={formatVnd(summary.total)} amountColor={summary.receiving ? colors.success : colors.danger} onClose={() => setPayOpen(false)}>
          <DebtPaymentPanel
            name={name}
            bills={bills}
            pays={pays}
            period={period}
            onSelectItems={() => setSelecting(true)}
            receiveQr={receiveQr}
            onDone={() => setPayOpen(false)}
            onPaid={async (message) => {
              if (message) toast.show(message);
              await reload();
            }}
            onFailure={(message) => toast.show(message)}
          />
        </PaymentSheet>
      )}
    </View>
  );
}

type Run = (task: () => Promise<SyncedPayChange<RecordResult | number>>, done?: (value: RecordResult | number) => string) => Promise<void>;

// ───────────────────────── Một người ─────────────────────────

function PersonView({
  name,
  detail,
  busy,
  run,
  lists,
  selection,
  corner,
}: {
  name: string;
  detail: ReturnType<typeof buildDebtDetail>;
  busy: boolean;
  run: Run;
  lists: PersonDebtLists;
  selection?: ComponentProps<typeof DebtBreakdown>['selection'];
  /** Biểu tượng ở góc phải trên của khung tổng (nút nhắc nợ). */
  corner?: ReactNode;
}) {
  const colors = useColors();
  const [armedUndo, setArmedUndo] = useState<string | null>(null);
  const total = debtTotalSummary(detail);

  return (
    <View style={styles.personWrap}>
      <PayPageFrame
        label="Còn lại"
        amount={total.amount}
        amountColor={total.tone === 'owe' ? colors.danger : total.tone === 'get' ? colors.success : undefined}
        detailsTitle="Chi tiết nợ"
        corner={corner}
      >
        <DebtBreakdown detail={detail} lists={lists} selection={selection} />
      </PayPageFrame>

      {detail.settled && (
        <AppText color={colors.muted} style={styles.empty}>
          Không còn nợ
        </AppText>
      )}

      {detail.canMerge && (
        <View style={styles.actionBox}>
          <PrimaryButton label={`Gộp nợ ${formatVnd(detail.mergeAmount)}`} disabled={busy} onPress={() => void run(() => mergeDebtsSynced(name))} />
          <AppText color={colors.muted} style={styles.hint}>
            Trừ giữa nợ vay và nợ bill; hai khoản trái dấu mới gộp được.
          </AppText>
        </View>
      )}

      {!selection && <PersonPaidCard lists={lists} />}

      {detail.history.length > 0 && (
        <View style={styles.history}>
          <SectionHeader title="Lịch sử gộp nợ" subtitle="Hoàn tác bằng cách bấm hai lần" />
          {detail.history.map((record) => {
            const armed = armedUndo === record.id;
            return (
              <View key={record.id} style={[styles.historyRow, { backgroundColor: colors.surface }]}>
                <View style={styles.flex}>
                  <AppText weight="semibold" style={styles.rowTitle}>
                    Gộp nợ {formatVnd(Math.max(record.loan, record.bill))}
                  </AppText>
                  <AppText color={colors.muted} style={styles.small}>
                    {formatVnDate(record.date)}
                  </AppText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => {
                    if (!armed) {
                      setArmedUndo(record.id);
                      setTimeout(() => setArmedUndo((current) => (current === record.id ? null : current)), 3500);
                      return;
                    }
                    setArmedUndo(null);
                    void run(
                      () => undoMergeSynced(record.id),
                      () => 'Đã hoàn tác gộp nợ',
                    );
                  }}
                  style={[styles.undo, { backgroundColor: armed ? colors.danger : colors.surface, borderColor: colors.danger }]}
                >
                  <AppText weight="semibold" color={armed ? '#FFFFFF' : colors.danger} style={styles.actionText}>
                    {armed ? 'Chắc chắn?' : 'Hoàn tác'}
                  </AppText>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// Số đo theo `.mod-c .dd` của PWA: thẻ bo 16 đệm 14; ngăn bo 14; dòng cách nhau 8; nút cao 44.
const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  screen: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 4 },
  loading: { marginTop: 48 },
  notice: { padding: 16, borderRadius: 16 },
  noticeText: { fontSize: 15 },
  personWrap: { gap: 12 },
  actionBox: { gap: 8 },
  hint: { fontSize: 12.5, lineHeight: 17, textAlign: 'center' },
  title: { fontSize: 15 },
  small: { fontSize: 12.5, lineHeight: 17 },
  empty: { textAlign: 'center', fontSize: 14, paddingVertical: 12 },
  stack: { borderRadius: AppRadius.card, overflow: 'hidden' },
  stackHead: { minHeight: 56, paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  stackTitle: { fontSize: 15.5 },
  stackBody: { paddingHorizontal: 12, paddingBottom: 4 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingTop: 8, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, borderTopWidth: 1 },
  monthRow: { paddingHorizontal: 10, borderRadius: 10 },
  rowTitle: { fontSize: 15 },
  amount: { fontSize: 16 },
  action: { minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, marginTop: 14 },
  smallInk: { fontSize: 12, lineHeight: 16, opacity: 0.9 },
  actionText: { fontSize: 14 },
  payBox: { marginTop: 14, gap: 8 },
  history: { marginTop: 8, gap: 6 },
  bell: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderRadius: AppRadius.field },
  cancel: { minHeight: 36, paddingHorizontal: 8, justifyContent: 'center' },
  cancelText: { fontSize: 16, lineHeight: 22 },
  undo: { minHeight: 34, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
