import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { SvgIcon } from '@/components/svg-icon';
import { useToast } from '@/components/toast';
import { AppFonts } from '@/constants/fonts';
import { AppRadius } from '@/constants/palette';
import { PayInputError } from '@/data/payRepository';
import { mergeDebtsSynced, recordPairPaymentSynced, recordPaymentSynced, undoMergeSynced, type RecordResult, type SyncedPayChange } from '@/data/payService';
import { formatMoney } from '@/domain/billForm';
import { buildDebtDetail, buildPairDetail, type DayGroup, type DebtRow, type MonthGroup, type Tone } from '@/domain/debtDetail';
import { dayHeading, periodFromParams, periodTitle, resolveCategory } from '@/domain/expenses';
import { maskPayAmount, parsePayAmount } from '@/domain/payForm';
import { describeDebtError, useDebtData } from '@/features/debts/hooks';
import { useExpenseSettings } from '@/features/expenses/hooks';
import { useColors } from '@/hooks/use-colors';
import type { Ledger } from '@/types/pay';
import { formatVnDate, todayStr } from '@/utils/date';

const TONE_COLOR = { get: '#0F8A4B', owe: '#D64545' } as const;
const SIGN = { get: '+', owe: '−', mid: '' } as const;

/**
 * Chi tiết nợ (`#v-debt` của PWA). Hai kiểu, chọn bằng tham số route:
 * - `name`: nợ với MỘT người — hai ngăn Nợ vay / Nợ bill, thanh toán toàn bộ / một phần, gộp nợ, lịch sử gộp và hoàn tác;
 * - `x` và `z`: bill giữa MỘT CẶP người trong kỳ, kèm thanh toán toàn bộ và gộp nợ.
 * Kỳ xem lấy từ tham số (`mode`, `month`, `year`, `from`, `to`) và chỉ lọc danh sách bill; số dư luôn là toàn thời gian.
 */
export default function DebtDetailScreen() {
  const params = useLocalSearchParams<{ name?: string; x?: string; z?: string; mode?: string; month?: string; year?: string; from?: string; to?: string }>();
  const today = todayStr();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { settings } = useExpenseSettings();
  const { bills, pays, loaded, error, reload } = useDebtData();
  const period = useMemo(() => periodFromParams(params, today), [params, today]);
  const categoryName = (id: string) => resolveCategory(settings, id).name;

  const [busy, setBusy] = useState(false);

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
  } else if (params.x && params.z) {
    body = <PairView x={params.x} z={params.z} detail={buildPairDetail(bills, pays, params.x, params.z, period, categoryName)} busy={busy} run={run} period={period} />;
  } else {
    body = <PersonView name={params.name ?? ''} detail={buildDebtDetail(bills, pays, params.name ?? '', period, categoryName)} busy={busy} run={run} periodLabel={periodTitle(period)} today={today} />;
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg, paddingTop: 12 + insets.top }]}>
      <Stack.Screen options={{ title: 'Chi tiết nợ', headerShown: false }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        {body}
      </ScrollView>
    </View>
  );
}

type Run = (task: () => Promise<SyncedPayChange<RecordResult | number>>, done?: (value: RecordResult | number) => string) => Promise<void>;

// ───────────────────────── Một người ─────────────────────────

function PersonView({ name, detail, busy, run, periodLabel, today }: { name: string; detail: ReturnType<typeof buildDebtDetail>; busy: boolean; run: Run; periodLabel: string; today: string }) {
  const colors = useColors();
  const [open, setOpen] = useState<{ loan?: boolean; bill?: boolean }>({});
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  const [partial, setPartial] = useState<Ledger | null>(null);
  const [partialText, setPartialText] = useState('');
  const [armedUndo, setArmedUndo] = useState<string | null>(null);

  const pay = (ledger: Ledger, amount: number) => run(() => recordPaymentSynced(name, ledger, amount));

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <AppText weight="display" style={styles.title}>
        {detail.name}
      </AppText>

      {detail.hasLoan && (
        <Stack2 label="Nợ vay" sub={detail.loanSubtitle} balance={detail.loan} open={!!open.loan} onToggle={() => setOpen({ ...open, loan: !open.loan })}>
          {detail.loanRows.map((row, index) => (
            <Row key={index} row={row} sub={`${formatVnDate(row.d)}${row.s ? ` · ${row.s}` : ''}`} />
          ))}
        </Stack2>
      )}

      {detail.hasBill && (
        <Stack2 label="Nợ bill" sub={detail.billSubtitle} balance={detail.bill} open={!!open.bill} onToggle={() => setOpen({ ...open, bill: !open.bill })}>
          {detail.billPeriodTotal !== null && (
            <View style={styles.totalRow}>
              <AppText weight="semibold" color={colors.muted} style={styles.small}>
                Tổng {periodLabel}
              </AppText>
              <Amount value={detail.billPeriodTotal} />
            </View>
          )}
          {detail.billEmpty ? (
            <AppText color={colors.muted} style={styles.empty}>
              Không có bill trong khoảng này
            </AppText>
          ) : detail.monthMode ? (
            <Days days={detail.billDays} today={today} />
          ) : (
            <Months months={detail.billMonths} openMonth={openMonth} onToggle={(month) => setOpenMonth(openMonth === month ? null : month)} today={today} />
          )}
        </Stack2>
      )}

      {detail.settled && (
        <AppText color={colors.muted} style={styles.empty}>
          Không còn khoản nợ nào
        </AppText>
      )}

      {detail.canMerge && (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void run(() => mergeDebtsSynced(name))}
          style={[styles.action, { backgroundColor: colors.bg, borderColor: colors.line }]}>
          <AppText weight="semibold" style={styles.actionText}>
            Gộp nợ
          </AppText>
          <AppText color={colors.muted} style={styles.small}>
            Trừ {formatMoney(detail.mergeAmount)} giữa nợ vay và nợ bill
          </AppText>
        </Pressable>
      )}

      {detail.payActions.map((action) => (
        <View key={action.ledger} style={[styles.payBox, { borderColor: partial === action.ledger ? colors.primary : colors.line, backgroundColor: colors.bg }]}>
          <AppText weight="semibold" color={colors.muted} style={styles.small}>
            {action.label} · {action.owes} {formatMoney(Math.abs(action.balance))}
          </AppText>
          <View style={styles.payButtons}>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => {
                setPartial(null);
                void pay(action.ledger, Math.abs(action.balance));
              }}
              style={[styles.payAll, { backgroundColor: colors.primary }]}>
              <AppText weight="semibold" color={colors.primaryInk} style={styles.actionText}>
                Thanh toán toàn bộ
              </AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => {
                setPartial(action.ledger);
                setPartialText('');
              }}
              style={[styles.payPart, { borderColor: colors.line, backgroundColor: colors.surface }]}>
              <AppText weight="semibold" style={styles.actionText}>
                Một phần
              </AppText>
            </Pressable>
          </View>
          {partial === action.ledger && (
            <View style={styles.partRow}>
              <TextInput
                autoFocus
                value={partialText}
                onChangeText={(text) => setPartialText(maskPayAmount(text))}
                keyboardType="decimal-pad"
                maxLength={11}
                placeholder="Nhập số tiền"
                placeholderTextColor={colors.muted}
                accessibilityLabel="Số tiền thanh toán, nghìn đồng"
                style={[styles.partInput, { backgroundColor: colors.surface, borderColor: colors.line, color: colors.ink, fontFamily: AppFonts.semibold }]}
              />
              <Pressable accessibilityRole="button" onPress={() => setPartial(null)} style={[styles.small2, { borderColor: colors.line }]}>
                <AppText weight="semibold" color={colors.muted} style={styles.actionText}>
                  Huỷ
                </AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => {
                  const amount = parsePayAmount(partialText);
                  if (amount > 0) {
                    setPartial(null);
                    void pay(action.ledger, amount);
                  }
                }}
                style={[styles.small2, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                <AppText weight="semibold" color={colors.primaryInk} style={styles.actionText}>
                  Lưu
                </AppText>
              </Pressable>
            </View>
          )}
        </View>
      ))}

      {detail.history.length > 0 && (
        <View style={styles.history}>
          <AppText weight="semibold" color={colors.muted} style={styles.small}>
            Lịch sử gộp nợ
          </AppText>
          {detail.history.map((record) => {
            const armed = armedUndo === record.id;
            return (
              <View key={record.id} style={[styles.historyRow, { backgroundColor: colors.bg }]}>
                <View style={styles.flex}>
                  <AppText weight="semibold" style={styles.rowTitle}>
                    Gộp nợ {formatMoney(Math.max(record.loan, record.bill))}
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
                    void run(() => undoMergeSynced(record.id), () => 'Đã hoàn tác gộp nợ');
                  }}
                  style={[styles.undo, { backgroundColor: armed ? '#D64545' : colors.surface, borderColor: armed ? '#D64545' : colors.line }]}>
                  <AppText weight="semibold" color={armed ? '#FFFFFF' : colors.ink} style={styles.actionText}>
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

// ───────────────────────── Một cặp ─────────────────────────

function PairView({ x, z, detail, busy, run, period }: { x: string; z: string; detail: ReturnType<typeof buildPairDetail>; busy: boolean; run: Run; period: ReturnType<typeof periodFromParams> }) {
  const colors = useColors();
  const today = todayStr();
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  const toneColor = detail.tone === 'mid' ? colors.ink : TONE_COLOR[detail.tone];
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <View style={styles.pairHead}>
        <View style={styles.flex}>
          <AppText weight="display" style={styles.title}>
            {detail.empty ? `${x} · ${z}` : detail.label}
          </AppText>
          <AppText color={colors.muted} style={styles.small}>
            {periodTitle(period)}
          </AppText>
        </View>
        <AppText weight="bold" color={detail.empty ? colors.ink : toneColor} style={styles.pairAmount}>
          {detail.empty ? '0 ₫' : `${SIGN[detail.tone]}${formatMoney(detail.amount)}`}
        </AppText>
      </View>

      {detail.empty ? (
        <AppText color={colors.muted} style={styles.empty}>
          Không có bill nào trong khoảng này
        </AppText>
      ) : (
        <>
          <AppText weight="semibold" color={colors.muted} style={styles.small}>
            Các bill trong khoảng này
          </AppText>
          {detail.monthMode ? <Days days={detail.days} today={today} /> : <Months months={detail.months} openMonth={openMonth} onToggle={(month) => setOpenMonth(openMonth === month ? null : month)} today={today} />}
        </>
      )}

      {(detail.canPay || detail.canMerge) && (
        <View style={styles.payButtons}>
          {detail.canPay && (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void run(() => recordPairPaymentSynced(x, z, period))}
              style={[styles.payAll, { backgroundColor: colors.primary }]}>
              <AppText weight="semibold" color={colors.primaryInk} style={styles.actionText}>
                Thanh toán toàn bộ
              </AppText>
            </Pressable>
          )}
          {detail.canMerge && detail.other && (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void run(() => mergeDebtsSynced(detail.other as string))}
              style={[styles.payPart, { borderColor: colors.line, backgroundColor: colors.bg }]}>
              <AppText weight="semibold" style={styles.actionText}>
                Gộp nợ
              </AppText>
            </Pressable>
          )}
        </View>
      )}
      {detail.canMerge && detail.other && (
        <AppText color={colors.muted} style={styles.small}>
          Gộp {formatMoney(detail.mergeAmount)} giữa nợ vay và nợ bill của {detail.other}
        </AppText>
      )}
    </View>
  );
}

// ───────────────────────── Thành phần dùng chung ─────────────────────────

function Amount({ value, tone }: { value: number; tone?: Tone }) {
  const colors = useColors();
  const resolved: Tone = tone ?? (value > 5e-4 ? 'get' : value < -5e-4 ? 'owe' : 'mid');
  return (
    <AppText weight="bold" color={resolved === 'mid' ? colors.muted : TONE_COLOR[resolved]} style={styles.amount}>
      {SIGN[resolved]}
      {formatMoney(Math.abs(value))}
    </AppText>
  );
}

function Row({ row, sub }: { row: DebtRow; sub: string }) {
  const colors = useColors();
  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <AppText weight="semibold" style={styles.rowTitle}>
          {row.t}
        </AppText>
        {!!sub && (
          <AppText color={colors.muted} style={styles.small}>
            {sub}
          </AppText>
        )}
      </View>
      <Amount value={row.v} tone={row.tone} />
    </View>
  );
}

function Days({ days, today }: { days: DayGroup[]; today: string }) {
  const colors = useColors();
  return (
    <>
      {days.map((day) => (
        <View key={day.date}>
          <View style={styles.dayHeader}>
            <AppText color={colors.muted} style={styles.small} numberOfLines={1}>
              <AppText weight="semibold" style={styles.small}>
                {dayHeading(day.date, today)}
              </AppText>
              , {formatVnDate(day.date)}
            </AppText>
            <Amount value={day.net} tone={day.tone} />
          </View>
          {day.rows.map((row, index) => (
            <Row key={index} row={row} sub={row.s} />
          ))}
        </View>
      ))}
    </>
  );
}

function Months({ months, openMonth, onToggle, today }: { months: MonthGroup[]; openMonth: string | null; onToggle: (month: string) => void; today: string }) {
  const colors = useColors();
  return (
    <>
      {months.map((month) => {
        const open = openMonth === month.month;
        return (
          <View key={month.month}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => onToggle(month.month)} style={[styles.row, styles.monthRow, { backgroundColor: colors.bg }]}>
              <View style={styles.flex}>
                <AppText weight="semibold" style={styles.rowTitle}>
                  Tháng {Number(month.month.slice(5, 7))}/{month.month.slice(0, 4)}
                </AppText>
                <AppText color={colors.muted} style={styles.small}>
                  {month.count} khoản
                </AppText>
              </View>
              <Amount value={month.net} tone={month.tone} />
              <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}>
                <SvgIcon name="chevronRight" size={16} color={colors.muted} />
              </View>
            </Pressable>
            {open && <Days days={month.days} today={today} />}
          </View>
        );
      })}
    </>
  );
}

function Stack2({ label, sub, balance, open, onToggle, children }: { label: string; sub: string; balance: number; open: boolean; onToggle: () => void; children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.stack, { borderColor: open ? colors.primary : colors.line, backgroundColor: colors.bg }]}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onToggle} style={styles.stackHead}>
        <View style={styles.flex}>
          <AppText weight="bold" style={styles.stackTitle}>
            {label}
          </AppText>
          <AppText color={colors.muted} style={styles.small}>
            {sub}
          </AppText>
        </View>
        <Amount value={balance} />
        <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}>
          <SvgIcon name="chevronRight" size={16} color={colors.muted} />
        </View>
      </Pressable>
      {open && <View style={styles.stackBody}>{children}</View>}
    </View>
  );
}

// Số đo theo `.mod-c .dd` của PWA: thẻ bo 16 đệm 14; ngăn bo 14; dòng cách nhau 8; nút cao 44.
const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  screen: { flex: 1 },
  content: { paddingHorizontal: 12, paddingTop: 4 },
  loading: { marginTop: 48 },
  notice: { padding: 16, borderRadius: 16 },
  noticeText: { fontSize: 15 },
  card: { borderRadius: AppRadius.card, borderWidth: 1, padding: 14, gap: 12 },
  title: { fontSize: 20 },
  small: { fontSize: 12.5, lineHeight: 17 },
  empty: { textAlign: 'center', fontSize: 14, paddingVertical: 12 },
  stack: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  stackHead: { minHeight: 58, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  stackTitle: { fontSize: 16 },
  stackBody: { paddingHorizontal: 14, paddingBottom: 12, gap: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingTop: 8, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  monthRow: { paddingHorizontal: 10, borderRadius: 10 },
  rowTitle: { fontSize: 15 },
  amount: { fontSize: 15 },
  action: { minHeight: 52, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  actionText: { fontSize: 14.5 },
  payBox: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 10 },
  payButtons: { flexDirection: 'row', gap: 8 },
  payAll: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  payPart: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  partRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  partInput: { flex: 1, minWidth: 0, height: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 16 },
  small2: { minHeight: 44, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  history: { gap: 8 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12 },
  undo: { minHeight: 40, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pairHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pairAmount: { fontSize: 20 },
});
