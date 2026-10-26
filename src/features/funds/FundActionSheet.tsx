import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppTextInput as TextInput } from '@/components/app-text-input';

import { AmountInput } from '@/components/amount-input';
import { AppText } from '@/components/app-text';
import { KeyboardAnchor } from '@/components/keyboard-aware-scroll';
import { CalendarPanel } from '@/components/calendar-panel';
import { DateField } from '@/components/date-field';
import { PrimaryButton } from '@/components/design';
import { FormPage } from '@/components/form-page';
import { TopFormModal } from '@/components/top-form-modal';
import { useToast } from '@/components/toast';
import { AppFonts } from '@/constants/fonts';
import { FundInputError } from '@/data/fundRepository';
import { refundAdvancesForPersonSynced, saveFundExpenseSynced, saveFundTxnSynced, updateFundTxnSynced } from '@/data/fundService';
import { newExpenseId } from '@/domain/expenses';
import { checkPayout, checkRefund, planAdvanceRefund, planAdvanceSpend } from '@/domain/fundAdvance';
import { FUND_TITLE_MAX } from '@/domain/fundForms';
import { describeFundError } from '@/features/funds/hooks';
import { useColors } from '@/hooks/use-colors';
import type { FundData } from '@/types/fund';
import { todayStr } from '@/utils/date';

/**
 * Tờ nổi cho ba thao tác nhỏ của chi quỹ nâng cao, dùng lại giao diện form chi quỹ (nhãn, ô số tiền, ô ngày, nút lưu):
 * - 'expense': thêm khoản chi thực tế từ một hồ sơ ứng trước (chi tiêu +, KHÔNG trừ tiền quỹ lần nữa).
 * - 'refund': người nhận ứng hoàn tiền thừa cho quỹ (tiền quỹ +, không phải khoản thu).
 * - 'payout': quỹ trả tiền cho cá nhân (cho khoản cá nhân đã ứng hoặc phần chi vượt tiền ứng); chỉ đổi dòng tiền và công nợ.
 * Số tiền được kiểm tra lại ở domain và lần nữa ở tầng lưu trữ; mã bản ghi sinh một lần cho mỗi lần mở nên bấm lưu nhiều lần không tạo trùng.
 */
export type FundActionTarget =
  | { mode: 'expense'; person: string; fundId: string }
  // Hoàn theo MỘT hồ sơ (sửa giao dịch đã ghi) hoặc theo NGƯỜI (`person`, `fundId`; `max` = tổng còn giữ): hoàn trừ vào lần giao mới nhất trước.
  | { mode: 'refund'; advanceId?: string; person?: string; fundId?: string; max: number }
  | { mode: 'payout'; expenseId?: string; advanceId?: string; person: string; max: number };

interface Props {
  target: FundActionTarget;
  data: Pick<FundData, 'contribs' | 'expenses' | 'advances' | 'txns'>;
  /**
   * Đang SỬA một giao dịch hoàn tiền / thanh toán đã ghi: điền sẵn số tiền, ngày và lưu vào đúng giao dịch đó (không tạo mới). Người gọi phải truyền `data`
   * đã bỏ chính giao dịch này để `max` và kiểm tra số tiền tính đúng.
   */
  existing?: { id: string; amount: number; date: string };
  onClose: () => void;
  onDone: () => void;
  /** true: hiện như MỘT TRANG biểu mẫu (khi mở bằng điều hướng, như các trang sửa khác); mặc định là khung phủ toàn màn hình. */
  asPage?: boolean;
}

/** Kiểm tra hoàn tiền theo NGƯỜI: > 0 và không vượt tổng tiền ứng còn giữ của người đó. */
function checkPersonRefund(data: Props['data'], fundId: string, person: string, amount: number) {
  const parts = planAdvanceRefund(data, fundId, person, amount);
  const total = parts.reduce((sum, part) => sum + part.amount, 0);
  if (!(amount > 0)) return { ok: false as const, message: 'Nhập số tiền lớn hơn 0.' };
  if (Math.round(amount) > total) return { ok: false as const, message: total > 0 ? 'Số tiền hoàn vượt số tiền ứng còn giữ.' : 'Không còn tiền ứng để hoàn.' };
  return { ok: true as const, amount: Math.round(amount) };
}

export function FundActionSheet({ target, data, existing, onClose, onDone, asPage = false }: Props) {
  const colors = useColors();
  const toast = useToast();
  const today = todayStr();
  const [amount, setAmount] = useState(existing?.amount ?? (target.mode === 'expense' ? 0 : target.max));
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(existing?.date ?? today);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [clientId] = useState(() => newExpenseId(Date.now()));

  /** Người nhận ứng của hồ sơ (cho tiêu đề "Chi từ A ứng" / "A hoàn tiền ứng"). */
  const advancePerson = target.mode === 'payout' || target.mode === 'expense' ? target.person : (target.person ?? data.advances?.find((item) => item.id === target.advanceId)?.person ?? '');
  const heading =
    target.mode === 'expense'
      ? `Chi từ ${advancePerson} ứng`
      : target.mode === 'refund'
        ? existing
          ? `Sửa ${advancePerson} hoàn tiền ứng`
          : `${advancePerson} hoàn tiền ứng`
        : existing
          ? `Sửa thanh toán cho ${target.person}`
          : `Thanh toán cho ${target.person}`;

  async function save() {
    if (busy) return;
    setError('');
    if (target.mode === 'expense') {
      if (!title.trim()) return setError('Nhập nội dung chi.');
      if (!(amount > 0)) return setError('Nhập số tiền lớn hơn 0.');
    } else {
      const check =
        target.mode === 'refund'
          ? target.advanceId
            ? checkRefund(data, target.advanceId, amount)
            : checkPersonRefund(data, target.fundId ?? 'all', target.person ?? '', amount)
          : checkPayout(data, target.expenseId ? { expenseId: target.expenseId } : { advanceId: target.advanceId! }, amount);
      if (!check.ok) return setError(check.message);
    }
    setBusy(true);
    try {
      if (target.mode === 'expense') {
        // Các lần giao ứng của người này là một khoản chung: chi vào lần giao CŨ NHẤT trước, mới nhất sau (mỗi phần một khoản chi gắn đúng một hồ sơ ứng).
        const parts = planAdvanceSpend(data, target.fundId, target.person, amount);
        if (parts.length === 0) return setError('Người này chưa có khoản giao tiền ứng.');
        for (const [index, part] of parts.entries()) {
          await saveFundExpenseSynced({
            clientId: `${clientId}-${index}`,
            fundId: part.fundId,
            title: title.trim(),
            date,
            amount: part.amount,
            mode: 'advance',
            advanceId: part.advanceId,
          });
        }
        toast.show('Đã ghi khoản chi');
      } else if (existing) {
        const result = await updateFundTxnSynced(existing.id, { amount, date });
        if (!result.value) return setError('Không tìm thấy giao dịch này. Có thể nó đã bị xoá.');
        toast.show('Đã lưu thay đổi');
      } else if (target.mode === 'refund') {
        // Hoàn theo người: trừ vào lần giao mới nhất còn giữ tiền trước; lần giao chưa chi mà hoàn hết thì xoá luôn (một lần ghi nguyên tử).
        if (target.advanceId) await saveFundTxnSynced({ clientId, kind: 'refund', advanceId: target.advanceId, amount, date });
        else await refundAdvancesForPersonSynced({ clientId, fundId: target.fundId ?? 'all', person: target.person ?? '', amount, date });
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

  const form = (
    <>
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
      <KeyboardAnchor>
        <PrimaryButton
          label={target.mode === 'expense' ? 'Lưu khoản chi' : target.mode === 'refund' ? 'Lưu hoàn tiền' : 'Lưu thanh toán'}
          disabled={busy}
          onPress={() => void save()}
        />
      </KeyboardAnchor>
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
    </>
  );
  return asPage ? (
    <FormPage title={heading}>{form}</FormPage>
  ) : (
    <TopFormModal title={heading} onClose={onClose}>
      {form}
    </TopFormModal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  label: { fontSize: 13, marginBottom: 4 },
  input: { height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 16 },
  error: { fontSize: 13.5 },
});
