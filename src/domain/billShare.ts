/**
 * Liên kết XEM bill chỉ đọc (hàm thuần): toàn bộ nội dung bill (tên, ngày, từng người đã chi / hệ số / mức cố định) được nén vào PHẦN SAU DẤU `#` của địa chỉ trang web, nên không cần máy chủ
 * và phần này không bao giờ được gửi tới máy chủ khi mở liên kết. Người nhận mở liên kết là thấy biên lai chia (ai nhận lại, ai còn thiếu, các khoản cần chuyển); không có gì được lưu vào máy họ.
 * Chỉ mang dữ liệu của chính bill đó, không kèm trạng thái thanh toán hay dữ liệu khác của người gửi. Tiền là ĐỒNG.
 */

import type { BillPerson } from '@/types/bill';

export interface SharedBill {
  title: string;
  date: string;
  people: BillPerson[];
}

const VERSION = 1;
const MAX_PEOPLE = 60;
const MAX_LINK_CHARS = 6000;

/** Chuỗi để đặt sau `#b=` (đã mã hoá an toàn cho địa chỉ). */
export function encodeBillShare(bill: SharedBill): string {
  const people = bill.people.map((person) => [person.name, person.paid, person.w ?? 1, person.fix ?? null]);
  return encodeURIComponent(JSON.stringify({ v: VERSION, t: bill.title, d: bill.date, p: people }));
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Đọc lại từ chuỗi sau `#b=`; trả null nếu hỏng / quá dài / sai dạng (không ném lỗi: nội dung có thể do người lạ gửi). */
export function decodeBillShare(text: string): SharedBill | null {
  if (!text || text.length > MAX_LINK_CHARS) return null;
  try {
    const raw = JSON.parse(decodeURIComponent(text)) as { v?: unknown; t?: unknown; d?: unknown; p?: unknown };
    if (raw.v !== VERSION || typeof raw.t !== 'string' || typeof raw.d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.d) || !Array.isArray(raw.p) || raw.p.length === 0 || raw.p.length > MAX_PEOPLE) return null;
    const people: BillPerson[] = [];
    for (const item of raw.p) {
      if (!Array.isArray(item) || typeof item[0] !== 'string' || !isFiniteNumber(item[1]) || item[1] < 0) return null;
      const w = item[2];
      const fix = item[3];
      people.push({
        name: item[0].slice(0, 40),
        paid: Math.round(item[1]),
        ...(isFiniteNumber(w) && w > 0 && w !== 1 ? { w } : {}),
        ...(isFiniteNumber(fix) && fix >= 0 ? { fix: Math.round(fix) } : {}),
      });
    }
    return { title: raw.t.slice(0, 80), date: raw.d, people };
  } catch {
    return null;
  }
}

/** Địa chỉ đầy đủ của trang xem bill. `base` là địa chỉ gốc của app (không có dấu `/` ở cuối). */
export const billShareUrl = (base: string, bill: SharedBill): string => `${base.replace(/\/+$/, '')}/xem-bill#b=${encodeBillShare(bill)}`;

/** Lấy phần dữ liệu từ `window.location.hash` (dạng `#b=...`); không có thì chuỗi rỗng. */
export const billShareFromHash = (hash: string): string => (hash.startsWith('#b=') ? hash.slice(3) : '');
