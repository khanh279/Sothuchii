import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { SvgIcon } from '@/components/svg-icon';
import { useToast } from '@/components/toast';
import { AppFonts } from '@/constants/fonts';
import { AppRadius } from '@/constants/palette';
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
import { withAlpha } from '@/utils/color';

const GET = '#0F8A4B';
const OWE = '#D64545';

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
  const tone = signed > 0 ? GET : signed < 0 ? OWE : colors.muted;
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
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.head}>
            <View style={styles.flex}>
              <AppText weight="semibold" style={styles.title} numberOfLines={2}>
                {name}
              </AppText>
              <AppText color={colors.muted} style={styles.small}>
                {periodTitle(period)} · Còn phải thanh toán
              </AppText>
            </View>
            <AppText weight="bold" color={tone} style={styles.headAmount}>
              {sign}
              {formatMoney(Math.abs(signed))}
            </AppText>
          </View>

          {data.rows.length === 0 ? (
            <AppText color={colors.muted} style={styles.empty}>
              Không có bill nào của {name} trong khoảng này
            </AppText>
          ) : (
            data.rows.map((row, index) => (
              <Pressable
                key={row.id}
                accessibilityRole="button"
                accessibilityLabel={`Chi tiết bill ${row.title}, ${formatMoney(Math.abs(row.amount))}`}
                onPress={() => router.push({ pathname: '/chia-bill/chi-tiet', params: { id: row.id } })}
                style={[styles.row, index > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
                <View style={styles.flex}>
                  <AppText weight="semibold" style={styles.rowTitle} numberOfLines={1}>
                    {row.title}
                  </AppText>
                  <AppText color={colors.muted} style={styles.small}>
                    {formatVnDate(row.date)} · {row.dir < 0 ? 'Tôi nợ' : `${name} nợ tôi`} {formatMoney(Math.abs(row.amount))}
                  </AppText>
                  <AppText color={colors.muted} style={styles.small}>
                    Đã thanh toán {formatMoney(row.paid)}
                  </AppText>
                </View>
                <View style={styles.rowRight}>
                  <AppText color={colors.muted} style={styles.small}>
                    Còn lại
                  </AppText>
                  <AppText weight="bold" color={row.remaining < DEBT_ZERO ? colors.muted : row.dir < 0 ? OWE : GET} style={styles.rowAmount}>
                    {formatMoney(row.remaining)}
                  </AppText>
                </View>
                <SvgIcon name="chevronRight" size={16} color={colors.muted} />
              </Pressable>
            ))
          )}
        </View>

        <View style={styles.payArea}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canPay || busy, expanded: panelOpen }}
            disabled={!canPay || busy}
            onPress={() => (panelOpen ? resetPanel() : setPanelOpen(true))}
            style={[styles.payButton, { backgroundColor: colors.primary, opacity: canPay ? 1 : 0.45 }]}>
            <AppText weight="bold" color={colors.primaryInk} style={styles.payText}>
              Thanh toán
            </AppText>
          </Pressable>
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
    <View style={[styles.screen, { backgroundColor: colors.bg, paddingTop: 12 + insets.top }]}>
      <Stack.Screen options={{ title: 'Bill của người', headerShown: false }} />
      {body}

      {confirmAmount !== null && (
        <Modal transparent animationType="fade" visible onRequestClose={() => !busy && setConfirmAmount(null)}>
          <View style={[styles.scrim, { backgroundColor: withAlpha('#000000', 0.5) }]}>
            <View style={[styles.dialog, { backgroundColor: colors.surface }]} accessibilityViewIsModal>
              <AppText weight="display" style={styles.dialogTitle}>
                Xác nhận thanh toán
              </AppText>
              <AppText style={styles.dialogText}>
                {payer} trả {receiver}
              </AppText>
              <AppText weight="display" style={styles.dialogAmount}>
                {formatMoney(confirmAmount)}
              </AppText>
              <AppText color={colors.muted} style={styles.small}>
                Trừ vào các bill còn nợ từ cũ đến mới.
              </AppText>
              <View style={styles.dialogButtons}>
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => setConfirmAmount(null)} style={[styles.dialogBtn, { borderColor: colors.line, backgroundColor: colors.surface }]}>
                  <AppText weight="semibold" color={colors.muted} style={styles.choiceTitle}>
                    Huỷ
                  </AppText>
                </Pressable>
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => void confirm()} style={[styles.dialogBtn, { borderColor: colors.primary, backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}>
                  <AppText weight="semibold" color={colors.primaryInk} style={styles.choiceTitle}>
                    Xác nhận
                  </AppText>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
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
  card: { borderRadius: AppRadius.card, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 8 },
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
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 360, borderRadius: 20, padding: 20, gap: 8 },
  dialogTitle: { fontSize: 18 },
  dialogText: { fontSize: 15.5 },
  dialogAmount: { fontSize: 28, lineHeight: 34 },
  dialogButtons: { flexDirection: 'row', gap: 10, marginTop: 8 },
  dialogBtn: { flex: 1, minHeight: 46, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
