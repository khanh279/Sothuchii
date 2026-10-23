/**
 * Chuyển dữ liệu Chia bill / Công nợ từ NGHÌN đồng (định dạng PWA cũ, kể cả bản mobile trước đây) sang ĐỒNG (hàm thuần).
 * Mỗi số tiền nhân 1000 rồi làm tròn về đồng nguyên; trường lạ và mục không hiểu được giữ nguyên. Không đọc/ghi lưu trữ:
 * việc đọc, sao lưu bản gốc và ghi nằm ở `data/moneyMigration`.
 */

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

const hasValue = (value: unknown): boolean => value !== undefined && value !== null && value !== '';

/** Nghìn đồng (có thể lẻ đến 3 chữ số) -> đồng nguyên. Giá trị không hợp lệ coi là 0 (giống `+x || 0`). */
export function nghinToVnd(nghin: unknown): number {
  return Math.round((+(nghin as number) || 0) * 1e3);
}

/** Bill: đổi `paid` và `fix` của từng người. */
export function billsNghinToVnd(raw: readonly unknown[]): unknown[] {
  return raw.map((bill) => {
    if (!isRecord(bill) || !Array.isArray(bill.people)) return bill;
    const people = bill.people.map((person) => {
      if (!isRecord(person)) return person;
      const next: Record<string, unknown> = { ...person };
      if (hasValue(person.paid)) next.paid = nghinToVnd(person.paid);
      if (hasValue(person.fix)) next.fix = nghinToVnd(person.fix);
      return next;
    });
    return { ...bill, people };
  });
}

/** Khoản trả: đổi `amt`. */
export function paysNghinToVnd(raw: readonly unknown[]): unknown[] {
  return raw.map((pay) => (isRecord(pay) && hasValue(pay.amt) ? { ...pay, amt: nghinToVnd(pay.amt) } : pay));
}
