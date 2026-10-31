import { useRef, useState, type ReactNode } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { pressStyle } from '@/components/press-feedback';
import { tapHaptic } from '@/utils/haptics';
import { PrimaryButton, SecondaryButton } from '@/components/design';
import { MoneyTextInput } from '@/components/money-input';
import { PaymentSummary, usePaymentSheet } from '@/components/payment-sheet';
import { ReceiveQrInline, type ReceiveQr } from '@/components/receive-qr-sheet';
import { SheetFrame, SheetHeader, useSheetClose } from '@/components/sheet-frame';
import { AppFonts } from '@/constants/fonts';
import { PayInputError } from '@/data/payRepository';
import { useColors } from '@/hooks/use-colors';
import { formatVnd } from '@/utils/format';
import { roundVnd } from '@/domain/money';

/** Kiểm tra số tiền nhập (ĐỒNG): > 0 và, nếu có giới hạn, không vượt `max`. */
function checkAmount(max: number | null, amount: number): { ok: true; amount: number } | { ok: false; message: string } {
  const value = roundVnd(Number(amount));
  if (!(value > 0)) return { ok: false, message: 'Nhập số tiền lớn hơn 0.' };
  if (max !== null && value > max) return { ok: false, message: `Số tiền vượt quá số còn phải thanh toán (${formatVnd(max)}).` };
  return { ok: true, amount: value };
}

/**
 * Một lựa chọn thanh toán. Có `amount` = THANH TOÁN TOÀN BỘ: trả đúng số đó. Không có `amount` = THANH TOÁN MỘT PHẦN: người dùng nhập số
 * (`max` mặc định là số còn lại, null = không giới hạn). `sub` chỉ còn để tương thích, không hiển thị.
 */
export interface PayChoice {
  id: string;
  label: string;
  sub?: string;
  amount?: number;
  max?: number | null;
  placeholder?: string;
}

interface Props {
  /** Số còn phải thanh toán (ĐỒNG); toàn bộ / một phần mặc định bị chặn ở mức này. */
  remaining: number;
  /** Các lựa chọn thanh toán; bỏ trống = Toàn bộ (trả đúng `remaining`) và Một phần. Chỉ lấy lựa chọn có `amount` đầu tiên làm "toàn bộ" và lựa chọn không có `amount` đầu tiên làm "một phần". */
  choices?: readonly PayChoice[];
  /** Người trả / người nhận, hiện trong các thẻ xác nhận (ví dụ "Tôi trả An"). */
  payer: string;
  receiver: string;
  /** Dòng ghi chú trong thẻ xác nhận toàn bộ (bỏ trống = không hiện); có thể phụ thuộc lựa chọn. */
  note?: string | ((choiceId: string) => string);
  /** Cảnh báo nhỏ màu cam đặt trên hai nút ở tờ đáy (ví dụ quỹ chỉ còn đủ trả một phần). */
  warning?: string;
  /** Ghi nhận khoản thanh toán; ném `PayInputError` nếu số tiền không còn hợp lệ (hiện ngay trong thẻ), lỗi khác giao cho `onFailure`. */
  onPay: (amount: number, choiceId: string) => Promise<void>;
  /**
   * Có thì hiện thêm nút "Chọn các khoản thanh toán" ở giữa hai nút kia: bấm thì tờ đáy đóng (cả luồng thanh toán) rồi gọi hàm này để trang vào chế độ tích chọn các khoản cần trả.
   * Không truyền = chỉ hai nút như cũ (nơi chưa hỗ trợ trả theo từng khoản).
   */
  onSelectItems?: () => void;
  /** Người kia trả tiền cho mình: thẻ xác nhận có nút "Mã QR nhận tiền" với đúng số tiền đang xác nhận. */
  receiveQr?: ReceiveQr;
  /** Gọi sau khi ghi thành công (đóng tờ, làm mới dữ liệu…). */
  onDone: () => void;
  onFailure: (error: unknown) => void;
}

type Step = { kind: 'confirm'; amount: number; id: string } | { kind: 'partial' };

/**
 * Bảng thanh toán dùng chung (bill, công nợ, quỹ). Các nút: **Thanh toán toàn bộ** (nền navy), **Chọn các khoản thanh toán** (viền navy, chỉ khi có `onSelectItems`) và **Thanh toán một phần** (viền navy).
 * Trong `PaymentSheet` (các trang thanh toán): bấm nút Thanh toán cố định ở đáy trang thì tờ nổi ở đáy hiện tóm tắt và hai nút; chọn một nút thì tờ đó trượt xuống (nền mờ đứng yên)
 * rồi tờ BƯỚC hiện tại giữa màn hình (mờ dần, phóng nhẹ):
 * - toàn bộ → bước xác nhận "A trả B / số tiền" → Xác nhận mới ghi;
 * - một phần → bước nhập số tiền (chạm vào ô mới hiện bàn phím), kiểm tra (> 0, không vượt số còn phải thanh toán) rồi Xác nhận là ghi.
 * Huỷ / chạm nền / Back ở bước thì tờ bước đóng và tờ đáy hiện lại. Ngoài `PaymentSheet` (nút nằm sẵn trong trang) thì chỉ có tờ bước.
 * Việc ghi giao dịch và cách phân bổ do `onPay` của từng nghiệp vụ quyết định. Chống ghi trùng: khi đang ghi thì bỏ qua mọi lần bấm xác nhận thêm
 * (khoá bằng ref nên không phụ thuộc lần render). Ghi xong thì `onDone` (nơi dùng gỡ mọi tờ ngay).
 */
export function PaymentPanel({ remaining, choices, payer, receiver, note, warning, onSelectItems, receiveQr, onPay, onDone, onFailure }: Props) {
  const colors = useColors();
  const sheet = usePaymentSheet();
  const [step, setStep] = useState<Step | null>(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  /** Đang chuyển từ tờ đáy sang tờ bước: tờ đáy đóng xong thì KHÔNG đóng cả luồng. */
  const switching = useRef(false);

  const options: readonly PayChoice[] = choices ?? [
    { id: 'all', label: 'Thanh toán toàn bộ', amount: remaining },
    { id: 'partial', label: 'Thanh toán một phần', placeholder: 'Nhập số tiền' },
  ];
  const full = options.find((option) => option.amount !== undefined) ?? null;
  const partial = options.find((option) => option.amount === undefined) ?? null;
  const partialMax = partial ? (partial.max === undefined ? remaining : partial.max) : remaining;

  /** Ghi một khoản; thành công thì `onDone`, số không hợp lệ thì báo ngay trong bước, lỗi khác thì bỏ bước và giao `onFailure`. */
  async function run(amount: number, id: string): Promise<boolean> {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    try {
      await onPay(amount, id);
      onDone();
      return true;
    } catch (e) {
      if (e instanceof PayInputError) {
        setProblem(e.message);
        return false;
      }
      setStep(null);
      onFailure(e);
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function submitPartial(typed: number) {
    if (!partial) return;
    const check = checkAmount(partialMax, typed);
    if (!check.ok) {
      setProblem(check.message);
      return;
    }
    setProblem('');
    Keyboard.dismiss();
    void run(check.amount, partial.id);
  }

  /** Chọn một nút: trong tờ nổi thì tờ đáy trượt xuống (nền đứng yên) rồi mới mở tờ bước; ngoài tờ nổi mở thẳng tờ bước. */
  function pick(next: Step, hide: (after?: () => void, keepScrim?: boolean) => void) {
    setProblem('');
    if (!sheet) {
      setStep(next);
      return;
    }
    switching.current = true;
    hide(() => {
      switching.current = false;
      setStep(next);
    }, true);
  }

  const buttons = <Choices full={full} partial={partial} busy={busy} onPick={pick} onSelect={onSelectItems} onFull={(amount, id) => ({ kind: 'confirm', amount, id })} />;
  const message = `${payer} trả ${receiver}`;

  let stepSheet = null;
  if (step?.kind === 'confirm') {
    const noteText = typeof note === 'function' ? note(step.id) : (note ?? '');
    stepSheet = (
      <StepCard
        title="Xác nhận thanh toán"
        message={message}
        problem={problem}
        busy={busy}
        onConfirm={() => void run(step.amount, step.id)}
        footer={receiveQr && <ReceiveQrInline qr={receiveQr} amount={step.amount} />}>
        <AppText weight="display" style={styles.stepAmount}>
          {formatVnd(step.amount)}
        </AppText>
        {!!noteText && (
          <AppText color={colors.muted} style={styles.stepNote}>
            {noteText}
          </AppText>
        )}
      </StepCard>
    );
  } else if (step?.kind === 'partial' && partial) {
    stepSheet = (
      <PartialStep message={message} placeholder={partial.placeholder ?? 'Nhập số tiền'} problem={problem} busy={busy} receiveQr={receiveQr} onEdit={() => setProblem('')} onSubmit={submitPartial} />
    );
  }

  return (
    <>
      {sheet
        ? step === null && (
            <SheetFrame
              onClose={() => {
                if (!switching.current) sheet.onClose();
              }}
            >
              <View style={styles.sheetBody}>
                <SheetHeader title={sheet.title} />
                <PaymentSummary heading={sheet.heading} amountText={sheet.amountText} scope={sheet.scope} amountColor={sheet.amountColor} />
                {!!warning && (
                  <AppText color={colors.danger} style={styles.stepNote}>
                    {warning}
                  </AppText>
                )}
                {buttons}
              </View>
            </SheetFrame>
          )
        : buttons}
      {stepSheet && (
        <SheetFrame placement="center" keepScrim={!!sheet} onClose={() => setStep(null)}>
          {stepSheet}
        </SheetFrame>
      )}
    </>
  );
}

/**
 * Thẻ XÁC NHẬN thanh toán giữa màn hình dùng khi trang tự tính số tiền (thanh toán các khoản đã chọn): giống hệt bước xác nhận của "Thanh toán toàn bộ" — tiêu đề "Xác nhận thanh toán",
 * dòng "A trả B", số tiền lớn, ghi chú nhỏ, hai nút Huỷ / Xác nhận. Huỷ / chạm nền / Back thì `onCancel`.
 */
export function PaymentConfirmSheet({ message, amountText, amount, note, receiveQr, busy, onConfirm, onCancel }: { message: string; amountText: string; amount: number; note?: string; receiveQr?: ReceiveQr; busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  const colors = useColors();
  return (
    <SheetFrame placement="center" onClose={onCancel}>
      <StepCard title="Xác nhận thanh toán" message={message} problem="" busy={busy} onConfirm={onConfirm} footer={receiveQr && <ReceiveQrInline qr={receiveQr} amount={amount} />}>
        <AppText weight="display" style={styles.stepAmount}>
          {amountText}
        </AppText>
        {!!note && (
          <AppText color={colors.muted} style={styles.stepNote}>
            {note}
          </AppText>
        )}
      </StepCard>
    </SheetFrame>
  );
}

/** Hai nút chọn cách thanh toán; chạm một nút thì báo `onPick` kèm hàm đóng tờ chứa nút (để chạy hiệu ứng trượt xuống). */
function Choices({
  full,
  partial,
  busy,
  onPick,
  onSelect,
  onFull,
}: {
  full: PayChoice | null;
  partial: PayChoice | null;
  busy: boolean;
  onPick: (step: Step, hide: (after?: () => void, keepScrim?: boolean) => void) => void;
  onSelect?: () => void;
  onFull: (amount: number, id: string) => Step;
}) {
  const colors = useColors();
  const hide = useSheetClose();
  const sheet = usePaymentSheet();
  return (
    <View style={styles.buttons}>
      {full && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={full.label}
          disabled={busy}
          onPress={() => {
            tapHaptic();
            onPick(onFull(full.amount ?? 0, full.id), hide);
          }}
          style={({ pressed }) => [styles.button, { backgroundColor: colors.heroBg }, pressStyle(pressed, busy)]}
        >
          <AppText weight="bold" color={colors.heroInk} style={styles.fullLabel} numberOfLines={1}>
            {full.label}
          </AppText>
        </Pressable>
      )}
      {onSelect && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chọn các khoản thanh toán"
          disabled={busy}
          // Tờ đáy trượt xuống (đóng cả luồng thanh toán) rồi trang vào chế độ tích chọn; không có tờ bao quanh thì vào thẳng.
          onPress={() => (sheet ? hide(onSelect) : onSelect())}
          style={({ pressed }) => [styles.button, styles.partialButton, { borderColor: colors.primary, backgroundColor: colors.surface }, pressStyle(pressed, busy)]}
        >
          <AppText weight="bold" color={colors.primary} style={styles.partialLabel} numberOfLines={1}>
            Chọn các khoản thanh toán
          </AppText>
        </Pressable>
      )}
      {partial && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={partial.label}
          disabled={busy}
          onPress={() => onPick({ kind: 'partial' }, hide)}
          style={({ pressed }) => [styles.button, styles.partialButton, { borderColor: colors.primary, backgroundColor: colors.surface }, pressStyle(pressed, busy)]}
        >
          <AppText weight="bold" color={colors.primary} style={styles.partialLabel} numberOfLines={1}>
            {partial.label}
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

/** Khung một bước (xác nhận / nhập số): tiêu đề, cảnh báo (nếu có), dòng "A trả B", nội dung, hai nút Huỷ / Xác nhận. Huỷ đóng tờ bước có hiệu ứng (về lại tờ đáy). */
function StepCard({
  title,
  message,
  problem,
  busy,
  onConfirm,
  footer,
  children,
}: {
  title: string;
  message: string;
  problem: string;
  busy: boolean;
  onConfirm: () => void;
  /** Phần đặt dưới hai nút Huỷ / Xác nhận (ví dụ nút "Mã QR nhận tiền"). */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const colors = useColors();
  const hide = useSheetClose();
  return (
    <View style={styles.step}>
      <SheetHeader title={title} />
      {!!problem && (
        <View style={[styles.stepWarning, { backgroundColor: colors.dangerSoft }]} accessibilityRole="alert">
          <AppText weight="semibold" color={colors.danger} style={styles.stepWarningText}>
            {problem}
          </AppText>
        </View>
      )}
      <AppText style={styles.stepMessage}>{message}</AppText>
      {children}
      <View style={styles.stepButtons}>
        <SecondaryButton
          label="Huỷ"
          disabled={busy}
          onPress={() => {
            Keyboard.dismiss();
            hide();
          }}
          style={styles.flex}
        />
        <PrimaryButton label="Xác nhận" disabled={busy} onPress={onConfirm} style={styles.flex} />
      </View>
      {!!footer && <View style={styles.stepFooter}>{footer}</View>}
    </View>
  );
}

/**
 * Bước nhập số của "Thanh toán một phần". Không tự bật bàn phím: chạm vào ô mới hiện. Số đang gõ nằm trong state RIÊNG của bước nên mỗi lần gõ chỉ dựng lại phần này (gõ mượt).
 * `onEdit` chỉ gọi khi đang có cảnh báo để xoá nó.
 */
function PartialStep({
  message,
  placeholder,
  problem,
  busy,
  receiveQr,
  onEdit,
  onSubmit,
}: {
  message: string;
  placeholder: string;
  problem: string;
  busy: boolean;
  receiveQr?: ReceiveQr;
  onEdit: () => void;
  onSubmit: (typedDong: number) => void;
}) {
  const colors = useColors();
  /** Số đang gõ, ĐỒNG. */
  const [typed, setTyped] = useState(0);
  return (
    <StepCard
      title="Thanh toán một phần"
      message={message}
      problem={problem}
      busy={busy}
      onConfirm={() => onSubmit(typed)}
      footer={receiveQr && <ReceiveQrInline qr={receiveQr} amount={typed} />}>
      <View style={styles.inputWrap}>
        <MoneyTextInput
          value={typed}
          onChangeValue={(value) => {
            setTyped(value);
            if (problem) onEdit();
          }}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          accessibilityLabel="Số tiền thanh toán"
          style={[styles.input, { backgroundColor: colors.bg, borderColor: problem ? colors.danger : colors.line, color: colors.ink, fontFamily: AppFonts.bold }]}
        />
        <AppText color={colors.muted} style={styles.suffix} pointerEvents="none">
          ₫
        </AppText>
      </View>
    </StepCard>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  sheetBody: { gap: 12 },
  buttons: { gap: 10 },
  button: { minHeight: 56, borderRadius: 16, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10 },
  fullLabel: { flex: 1, fontSize: 16, textAlign: 'center' },
  partialButton: { borderWidth: 1.5, justifyContent: 'center' },
  partialLabel: { fontSize: 16 },
  step: { gap: 6 },
  stepWarning: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  stepWarningText: { fontSize: 14, lineHeight: 20 },
  stepMessage: { fontSize: 14 },
  stepAmount: { fontSize: 26, lineHeight: 32 },
  stepNote: { fontSize: 12, lineHeight: 16 },
  stepButtons: { flexDirection: 'row', gap: 10, marginTop: 6 },
  stepFooter: { marginTop: 4 },
  inputWrap: { justifyContent: 'center', alignSelf: 'stretch' },
  input: { minHeight: 50, borderWidth: 1.5, borderRadius: 14, paddingLeft: 12, paddingRight: 36, fontSize: 22 },
  suffix: { position: 'absolute', right: 14, fontSize: 15 },
});
