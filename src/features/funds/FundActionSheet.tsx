import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AmountInput } from '@/components/amount-input';
import { AppText } from '@/components/app-text';
import { CalendarPanel } from '@/components/calendar-panel';
import { DateField } from '@/components/date-field';
import { ModalHeader, PrimaryButton } from '@/components/design';
import { useToast } from '@/components/toast';
import { AppFonts } from '@/constants/fonts';
import { FundInputError } from '@/data/fundRepository';
import { saveFundExpenseSynced, saveFundTxnSynced } from '@/data/fundService';
import { newExpenseId } from '@/domain/expenses';
import { checkPayout, checkRefund } from '@/domain/fundAdvance';
import { FUND_TITLE_MAX } from '@/domain/fundForms';
import { describeFundError } from '@/features/funds/hooks';
import { useColors } from '@/hooks/use-colors';
import type { FundData } from '@/types/fund';
import { todayStr } from '@/utils/date';
import { formatVnd } from '@/utils/format';

/**
 * Tờ nổi cho ba thao tác nhỏ của chi quỹ nâng cao, dùng lại giao diện form chi quỹ (nhãn, ô số tiền, ô ngày, nút lưu):
 * - 'expense': thêm khoản chi thực tế từ một hồ sơ ứng trước (chi tiêu +, KHÔNG trừ tiền quỹ lần nữa).
 * - 'refund': người nhận ứng hoàn tiền thừa cho quỹ (tiền quỹ +, không phải khoản thu).
 * - 'payout': quỹ trả tiền cho cá nhân (cho khoản cá nhân đã ứng hoặc phần chi vượt tiền ứng); chỉ đổi dòng tiền và công nợ.
 * Số tiền được kiểm tra lại ở domain và lần nữa ở tầng lưu trữ; mã bản ghi sinh một lần cho mỗi lần mở nên bấm lưu nhiều lần không tạo trùng.
 */
export type FundActionTarget =
  | { mode: 'expense'; advanceId: string; fundId: string }
  | { mode: 'refund'; advanceId: string; max: number }
  | { mode: 'payout'; expenseId?: string; advanceId?: string; person: string; max: number };

interface Props {
  target: FundActionTarget;
  data: Pick<FundData, 'contribs' | 'expenses' | 'advances' | 'txns'>;
  onClose: () => void;
  onDone: () => void;
}

export function FundActionSheet({ target, data, onClose, onDone }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const today = todayStr();
  const [amount, setAmount] = useState(target.mode === 'expense' ? 0 : target.max);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(today);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [clientId] = useState(() => newExpenseId(Date.now()));

  const heading = target.mode === 'expense' ? 'Thêm khoản chi từ tiền ứng' : target.mode === 'refund' ? 'Hoàn tiền ứng' : `Thanh toán cho ${target.person}`;
  const hint =
    target.mode === 'expense'
      ? 'Khoản chi được ghi vào lịch sử chi quỹ và tính vào tổng chi; tiền quỹ không bị trừ thêm vì đã giao ứng trước.'
      : target.mode === 'refund'
        ? `Số tiền ứng còn giữ: ${formatVnd(target.max)}. Hoàn tiền chỉ làm tăng tiền quỹ, không phải khoản thu.`
        : `Quỹ còn nợ: ${formatVnd(target.max)}. Thanh toán chỉ đổi dòng tiền và công nợ, không tăng tổng chi.`;

  async function save() {
    if (busy) return;
    setError('');
    if (target.mode === 'expense') {
      if (!title.trim()) return setError('Nhập nội dung chi.');
      if (!(amount > 0)) return setError('Nhập số tiền lớn hơn 0.');
    } else {
      const check = target.mode === 'refund' ? checkRefund(data, target.advanceId, amount) : checkPayout(data, target.expenseId ? { expenseId: target.expenseId } : { advanceId: target.advanceId! }, amount);
      if (!check.ok) return setError(check.message);
    }
    setBusy(true);
    try {
      if (target.mode === 'expense') {
        await saveFundExpenseSynced({ clientId, fundId: target.fundId, title: title.trim(), date, amount, mode: 'advance', advanceId: target.advanceId });
        toast.show('Đã ghi khoản chi');
      } else if (target.mode === 'refund') {
        await saveFundTxnSynced({ clientId, kind: 'refund', advanceId: target.advanceId, amount, date });
        toast.show('Đã ghi nhận hoàn tiền');
      } else {
        await saveFundTxnSynced({ clientId, kind: 'payout', expenseId: target.expenseId, advanceId: target.expenseId ? undefined : target.advanceId, amount, date });
        toast.show('Đã ghi nhận thanh toán');
      }
      onDone();
    } catch (e) {
      setError(e instanceof FundInputError ? e.message : describeFundError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={[styles.scrim, { backgroundColor: colors.scrim }]}>
        <Pressable style={styles.flex} onPress={onClose} accessibilityLabel="Đóng" />
        <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: 16 + insets.bottom }]}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <ModalHeader title={heading} onClose={onClose} />
            <AppText color={colors.muted} style={styles.hint}>
              {hint}
            </AppText>
            <View>
              <AppText weight="medium" color={colors.muted} style={styles.label}>
                Số tiền
              </AppText>
              <AmountInput
                value={amount}
                onChangeValue={(next) => {
                  setAmount(next);
                  setError('');
                }}
              />
            </View>
            {target.mode === 'expense' && (
              <View>
                <AppText weight="medium" color={colors.muted} style={styles.label}>
                  Nội dung
                </AppText>
                <TextInput
                  value={title}
                  onChangeText={(text) => {
                    setTitle(text);
                    setError('');
                  }}
                  maxLength={FUND_TITLE_MAX}
                  placeholder="Ví dụ: Mua nước, thuê sân"
                  placeholderTextColor={colors.muted}
                  style={[styles.input, { backgroundColor: colors.bg, borderColor: colors.line, color: colors.ink, fontFamily: AppFonts.semibold }]}
                />
              </View>
            )}
            <View>
              <AppText weight="medium" color={colors.muted} style={styles.label}>
                Ngày
              </AppText>
              <DateField value={date} onPress={() => setCalendarOpen(true)} />
            </View>
            {!!error && (
              <AppText color={colors.danger} style={styles.error} accessibilityRole="alert">
                {error}
              </AppText>
            )}
            <PrimaryButton label={target.mode === 'expense' ? 'Lưu khoản chi' : target.mode === 'refund' ? 'Lưu hoàn tiền' : 'Lưu thanh toán'} disabled={busy} onPress={() => void save()} />
          </ScrollView>
        </View>
      </View>
      {calendarOpen && (
        <CalendarPanel
          variant="popup"
          value={date}
          today={today}
          max={today}
          onCancel={() => setCalendarOpen(false)}
          onConfirm={(picked) => {
            setDate(picked);
            setCalendarOpen(false);
          }}
        />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '88%' },
  content: { padding: 16, gap: 12 },
  hint: { fontSize: 13, lineHeight: 18 },
  label: { fontSize: 13, marginBottom: 4 },
  input: { height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 16 },
  error: { fontSize: 13.5 },
});
