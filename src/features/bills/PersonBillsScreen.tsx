import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { ConfirmDialog, EmptyState, Panel, PrimaryButton, ScreenTitle, TransactionRow } from '@/components/design';
import { SvgIcon } from '@/components/svg-icon';
import { useToast } from '@/components/toast';
import { AppFonts } from '@/constants/fonts';
import { PayInputError } from '@/data/payRepository';
import { recordPersonBillPaymentSynced } from '@/data/payService';
import { formatMoney } from '@/domain/billForm';
import { checkPairPayment, personBillRows } from '@/domain/billPerson';
import { DEBT_ZERO } from '@/domain/ledger';
import { periodFromParams, periodTitle } from '@/domain/expenses';
import { maskPayAmount, parsePayAmount } from '@/domain/payForm';
import { describeDebtError, useDebtData } from '@/features/debts/hooks';
import { useColors } from '@/hooks/use-colors';
import { formatVnDate, todayStr } from '@/utils/date';

type PayMode = 'all' | 'partial' | 'number';

/**
 * Cấp 2 của "Chi tiết" khung Chia bill ở Tổng quan: các bill của MỘT người trong kỳ đang xem (tham số route `name`, kỳ `mode`/`month`/
 * `year`/`from`/`to`). Mỗi dòng: tên bill, ngày, số tiền theo bill, đã thanh toán, còn phải thanh toán; chạm một bill để xem chi tiết
 * bill (theo mã). Cuối màn hình là nút "Thanh toán": toàn bộ, một phần, hoặc nhập số — luôn có bước xác nhận, số tiền không được
 * vượt số còn phải thanh toán và được trừ vào các bill từ cũ đến mới (quy tắc phân bổ sẵn có).
 */
export default function PersonBillsScreen() {
  const params = useLocalSearchParams<{ name?: string; mode?: string; month?: string; year?: string; from?: string; to?: string }>();
  const { name: nameParam, mode, month, year, from, to } = params;
  const name = nameParam ?? '';
  const today = todayStr();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { bills, pays, loaded, error, reload } = useDebtData();
  const period = useMemo(() => periodFromParams({ mode, month, year, from, to }, today), [mode, month, year, from, to, today]);
  const data = useMemo(() => personBillRows(bills, pays, name, period), [bills, pays, name, period]);

  const [panelOpen, setPanelOpen] = useState(false);
  const [payMode, setPayMode] = useState<PayMode | null>(null);
  const [text, setText] = useState('');
  const [problem, setProblem] = useState('');
  const [confirmAmount, setConfirmAmount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const canPay = data.remaining >= DEBT_ZERO;
  const signed = data.net;
  const sign = signed > 0 ? '+' : signed < 0 ? '−' : '';

  function resetPanel() {
    setPanelOpen(false);
    setPayMode(null);
    setText('');
    setProblem('');
  }

  function choose(next: PayMode) {
    setProblem('');
    setText('');
    setPayMode(next);
    if (next === 'all') setConfirmAmount(data.remaining);
  }

  function submitNumber() {
    const check = checkPairPayment(data.remaining, parsePayAmount(text));
    if (!check.ok) {
      setProblem(check.message);
      return;
    }
    setProblem('');
    setConfirmAmount(check.amount);
  }

  async function confirm() {
    if (busy || confirmAmount === null) return;
    setBusy(true);
    try {
      const result = await recordPersonBillPaymentSynced(name, period, confirmAmount);
      if (result.value.message) toast.show(result.value.message);
      setConfirmAmount(null);
      resetPanel();
      await reload();
    } catch (e) {
      setConfirmAmount(null);
      if (e instanceof PayInputError) setProblem(e.message);
      else toast.show(describeDebtError(e));
    } finally {
      setBusy(false);
    }
  }

  const payer = data.from === 'Tôi' ? 'Tôi' : data.from;
  const receiver = data.to === 'Tôi' ? 'tôi' : data.to;

  let body;
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
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <View style={[styles.hero, { backgroundColor: colors.heroBg }]}>
          <AppText weight="medium" color={colors.heroSoft} style={styles.heroLabel}>
            {periodTitle(period)} · Còn phải thanh toán
          </AppText>
          <AppText weight="display" color={colors.heroInk} style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit>
            {sign}
            {formatMoney(Math.abs(signed))}
          </AppText>
          <AppText color={colors.heroSoft} style={styles.heroCaption}>
            {signed < 0 ? `Tôi nợ ${name}` : signed > 0 ? `${name} nợ tôi` : `Không còn khoản nào với ${name}`}
          </AppText>
        </View>

        <Panel>
          {data.rows.length === 0 ? (
            <EmptyState text={`Không có bill nào của ${name} trong khoảng này`} />
          ) : (
            data.rows.map((row, index) => (
              <TransactionRow
                key={row.id}
                first={index === 0}
                icon={
                  <View style={[styles.billIcon, { backgroundColor: colors.primarySoft }]}>
                    <SvgIcon name="receipt" size={20} color={colors.primary} strokeWidth={1.8} />
                  </View>
                }
                title={row.title}
                subtitle={`${formatVnDate(row.date)} · ${row.dir < 0 ? 'Tôi nợ' : `${name} nợ tôi`} ${formatMoney(Math.abs(row.amount))} · Đã trả ${formatMoney(row.paid)}`}
                amount={formatMoney(row.remaining)}
                tone={row.remaining < DEBT_ZERO ? 'mid' : row.dir < 0 ? 'owe' : 'get'}
                meta="Còn lại"
                accessibilityLabel={`Chi tiết bill ${row.title}, ${formatMoney(Math.abs(row.amount))}`}
                onPress={() => router.push({ pathname: '/chia-bill/chi-tiet', params: { id: row.id } })}
              />
            ))
          )}
        </Panel>

        <View style={styles.payArea}>
          <PrimaryButton label="Thanh toán" disabled={!canPay || busy} onPress={() => (panelOpen ? resetPanel() : setPanelOpen(true))} />
          {!canPay && (
            <AppText color={colors.muted} style={styles.centerNote}>
              Không còn khoản nào phải thanh toán
            </AppText>
          )}

          {panelOpen && canPay && (
            <View style={styles.choices}>
              {(
                [
                  ['all', 'Thanh toán toàn bộ', `Trả hết ${formatMoney(data.remaining)} còn lại`],
                  ['partial', 'Thanh toán một phần', 'Nhập số tiền muốn thanh toán'],
                  ['number', 'Nhập số', 'Nhập trực tiếp số tiền cụ thể'],
                ] as const
              ).map(([id, label, sub]) => {
                const selected = payMode === id;
                return (
                  <Pressable
                    key={id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    disabled={busy}
                    onPress={() => choose(id)}
                    style={[styles.choice, { borderColor: selected ? colors.primary : colors.line, backgroundColor: selected ? colors.primarySoft : colors.surface }]}>
                    <AppText weight="semibold" style={styles.choiceTitle}>
                      {label}
                    </AppText>
                    <AppText color={colors.muted} style={styles.small}>
                      {sub}
                    </AppText>
                  </Pressable>
                );
              })}

              {(payMode === 'partial' || payMode === 'number') && (
                <View style={styles.amountBox}>
                  <AppText color={colors.muted} style={styles.small}>
                    Còn phải thanh toán: {formatMoney(data.remaining)}
                  </AppText>
                  <View style={styles.inputWrap}>
                    <TextInput
                      autoFocus
                      value={text}
                      onChangeText={(value) => {
                        setText(maskPayAmount(value));
                        setProblem('');
                      }}
                      keyboardType="decimal-pad"
                      maxLength={11}
                      placeholder={payMode === 'partial' ? 'Số tiền thanh toán một phần' : 'Nhập số tiền'}
                      placeholderTextColor={colors.muted}
                      accessibilityLabel="Số tiền thanh toán, nghìn đồng"
                      style={[styles.input, { backgroundColor: colors.bg, borderColor: problem ? colors.danger : colors.line, color: colors.ink, fontFamily: AppFonts.semibold }]}
                    />
                    {!!text && (
                      <AppText color={colors.muted} style={styles.suffix} pointerEvents="none">
                        .000 ₫
                      </AppText>
                    )}
                  </View>
                  {!!problem && (
                    <AppText color={colors.danger} style={styles.small} accessibilityRole="alert">
                      {problem}
                    </AppText>
                  )}
                  <Pressable accessibilityRole="button" disabled={busy} onPress={submitNumber} style={[styles.continue, { backgroundColor: colors.primary }]}>
                    <AppText weight="semibold" color={colors.primaryInk} style={styles.choiceTitle}>
                      Tiếp tục
                    </AppText>
                  </Pressable>
                </View>
              )}
              {payMode === 'all' && !!problem && (
                <AppText color={colors.danger} style={styles.small} accessibilityRole="alert">
                  {problem}
                </AppText>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: 'Bill của người', headerShown: false }} />
      <ScreenTitle title={name ? `Bill của ${name}` : 'Bill của người'} topInset={insets.top} />
      {body}

      {confirmAmount !== null && (
        <ConfirmDialog
          title="Xác nhận thanh toán"
          message={`${payer} trả ${receiver}`}
          amountText={formatMoney(confirmAmount)}
          note="Trừ vào các bill còn nợ từ cũ đến mới."
          busy={busy}
          onCancel={() => setConfirmAmount(null)}
          onConfirm={() => void confirm()}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  content: { paddingHorizontal: 12, paddingTop: 4, gap: 14 },
  loading: { marginTop: 48 },
  notice: { marginHorizontal: 12, marginTop: 8, padding: 16, borderRadius: 16 },
  noticeText: { fontSize: 15 },
  hero: { borderRadius: 22, padding: 20, gap: 4 },
  heroLabel: { fontSize: 12.5 },
  heroAmount: { fontSize: 34, lineHeight: 42, letterSpacing: -0.6 },
  heroCaption: { fontSize: 13 },
  billIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64 },
  title: { fontSize: 18, lineHeight: 24 },
  small: { fontSize: 12.5, lineHeight: 17 },
  headAmount: { fontSize: 20 },
  empty: { textAlign: 'center', fontSize: 14, paddingVertical: 24 },
  row: { minHeight: 76, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { fontSize: 15.5 },
  rowRight: { alignItems: 'flex-end' },
  rowAmount: { fontSize: 16 },
  payArea: { gap: 10 },
  payButton: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  payText: { fontSize: 16 },
  centerNote: { textAlign: 'center', fontSize: 13 },
  choices: { gap: 8 },
  choice: { minHeight: 56, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8, justifyContent: 'center' },
  choiceTitle: { fontSize: 15 },
  amountBox: { gap: 8 },
  inputWrap: { justifyContent: 'center' },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 12, paddingLeft: 12, paddingRight: 62, fontSize: 18, textAlign: 'right' },
  suffix: { position: 'absolute', right: 12, fontSize: 13 },
  continue: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
