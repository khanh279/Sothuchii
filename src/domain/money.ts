import type { Vnd } from '@/types/money';

/** Làm tròn đồng về số nguyên. Giá trị không hợp lệ (NaN, undefined...) được coi là 0. */
export function roundVnd(vnd: Vnd): Vnd {
  return Math.round(+vnd || 0);
}

// ───────────── Ô nhập tiền theo ĐỒNG ─────────────
// Mọi số tiền của ứng dụng là ĐỒNG (số nguyên). Ô nhập (`MoneyTextInput`) tự thêm dấu chấm hàng nghìn khi hiển thị;
// phần chữ lưu trong state của form chỉ gồm chữ số ("120000").

/** Chỉ giữ chữ số, bỏ số 0 đầu, tối đa `maxDigits` chữ số. */
export function maskVndInput(text: string, maxDigits = 9): string {
  return String(text)
    .replace(/\D/g, '')
    .replace(/^0+(?=\d)/, '')
    .slice(0, maxDigits);
}

/** Chữ trong ô nhập (chỉ chữ số, có thể có dấu chấm hàng nghìn) -> ĐỒNG. Chữ không hợp lệ -> 0. */
export function parseVndInput(text: string): Vnd {
  const value = Number(String(text).replace(/\D/g, ''));
  return Number.isFinite(value) ? value : 0;
}

/** ĐỒNG -> chữ lưu trong state của form: 120000 -> "120000"; 0 -> "". */
export function formatVndInput(vnd: Vnd): string {
  const value = Math.round(+vnd || 0);
  return value > 0 ? String(value) : '';
}
