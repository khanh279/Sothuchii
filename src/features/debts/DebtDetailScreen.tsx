import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { PrimaryButton, ScreenTitle, SectionHeader } from '@/components/design';
import { PayPageFrame } from '@/components/pay-page-frame';
import { PAY_ACTION_BAR_CLEARANCE, PayActionBar } from '@/components/pay-action-bar';
import { PaymentSheet } from '@/components/payment-sheet';
import { useToast } from '@/components/toast';
import { AppRadius } from '@/constants/palette';
import { PayInputError } from '@/data/payRepository';
import { mergeDebtsSynced, undoMergeSynced, type RecordResult, type SyncedPayChange } from '@/data/payService';
import { buildDebtDetail } from '@/domain/debtDetail';
import { periodFromParams, periodTitle, resolveCategory } from '@/domain/expenses';
import { DebtBreakdown, debtTotalSummary } from '@/features/debts/DebtBreakdown';
import { DebtPaymentPanel, debtPaySummary } from '@/features/debts/DebtPeoplePanel';
import { describeDebtError, useDebtData } from '@/features/debts/hooks';
import { useExpenseSettings } from '@/features/expenses/hooks';
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
  const detail = loaded && !error ? buildDebtDetail(bills, pays, name, period, categoryName) : null;
  const summary = detail ? debtPaySummary(detail, name) : null;

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
        name={name}
        detail={detail!}
        busy={busy}
        run={run}
        periodLabel={periodTitle(period)}
        today={today}
      />
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: 'Chi tiết nợ', headerShown: false }} />
      <ScreenTitle title={params.name ? `Công nợ với ${params.name}` : 'Chi tiết công nợ'} topInset={insets.top} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom + (summary ? PAY_ACTION_BAR_CLEARANCE : 0) }]} keyboardShouldPersistTaps="handled">
        {body}
      </ScrollView>
      <PayActionBar visible={!!summary} bottom={16} onPress={() => setPayOpen(true)} />
      {payOpen && summary && (
        <PaymentSheet heading={`${summary.payer} trả ${summary.receiver}`} amountText={formatVnd(summary.total)} amountColor={summary.receiving ? colors.success : colors.danger} onClose={() => setPayOpen(false)}>
          <DebtPaymentPanel
            name={name}
            bills={bills}
            pays={pays}
            period={period}
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
  periodLabel,
  today,
}: {
  name: string;
  detail: ReturnType<typeof buildDebtDetail>;
  busy: boolean;
  run: Run;
  periodLabel: string;
  today: string;
}) {
  const colors = useColors();
  const [armedUndo, setArmedUndo] = useState<string | null>(null);
  const total = debtTotalSummary(detail);

  return (
    <View style={styles.personWrap}>
      <PayPageFrame
        label="Tổng nợ hiện tại (vay + bill)"
        amount={total.amount}
        amountColor={total.tone === 'owe' ? colors.danger : total.tone === 'get' ? colors.success : undefined}
        caption={total.caption}
        detailsTitle="Chi tiết nợ"
      >
        <DebtBreakdown detail={detail} periodLabel={periodLabel} today={today} />
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
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderRadius: AppRadius.field },
  undo: { minHeight: 34, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
