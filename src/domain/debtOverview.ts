/**
 * Khung "Nợ" ở Tổng quan (hàm thuần): tổng Tôi nợ / Người khác nợ tôi (từ tổng ròng mỗi người), một số tổng cho từng người, và chi tiết theo cặp trong kỳ.
 * Chuyển từ `et()` của `mod-c` trong PWA. Tiền là NGHÌN đồng. Số dư là TOÀN THỜI GIAN; chỉ danh sách cặp theo kỳ đang xem.
 * Khác PWA theo yêu cầu mới: Tổng quan không tách nợ vay / nợ bill (việc tách chỉ ở màn chi tiết).
 */

import { BILL_OWNER_NAME } from '@/domain/bills';
import { toneOf, type Tone } from '@/domain/debtDetail';
import { DEBT_ZERO, allDebts, debtEvents, isNearZero, pairDebts, r3, type PairDebt } from '@/domain/ledger';
import type { Bill } from '@/types/bill';
import type { Period } from '@/types/expense';
import type { Nghin } from '@/types/money';
import type { Pay } from '@/types/pay';

export interface DebtPersonRow {
  name: string;
  /** Tổng nợ = nợ vay + nợ bill (cộng đại số có dấu): dương = họ nợ tôi, âm = tôi nợ họ. */
  total: Nghin;
  /** 'mid' khi tổng về 0 (hai sổ trái dấu bù nhau) – vẫn liệt kê để vào được "Gộp nợ". */
  tone: Tone;
}

export interface PairRow extends PairDebt {
  /** 'owe' khi tôi là người trả, 'get' khi tôi là người nhận, 'mid' với cặp không có tôi. */
  tone: Tone;
}

export interface DebtOverview {
  /** Tổng tôi nợ (số dương), cộng từ tổng ròng của những người tôi đang nợ. */
  owe: Nghin;
  /** Tổng người khác nợ tôi (số dương), cộng từ tổng ròng của những người đang nợ tôi. */
  get: Nghin;
  /** Hiện dấu "−" / "+" trước tổng khi từ 0,05 nghìn (`e.owe >= .05 ? "−" : ""`). */
  oweSigned: boolean;
  getSigned: boolean;
  people: DebtPersonRow[];
  pairs: PairRow[];
}

export function buildDebtOverview(bills: readonly Bill[], pays: readonly Pay[], period: Period): DebtOverview {
  // Người còn nợ ở ít nhất một sổ; mỗi người một con số là tổng đại số hai sổ.
  const people: DebtPersonRow[] = allDebts(debtEvents(bills, pays))
    .list.map((person) => {
      const total = r3(person.loan + person.bill);
      return { name: person.name, total, tone: isNearZero(total) ? ('mid' as const) : toneOf(total) };
    })
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total) || a.name.localeCompare(b.name));
  let get = 0;
  let owe = 0;
  for (const person of people) {
    if (person.tone === 'get') get += person.total;
    else if (person.tone === 'owe') owe -= person.total;
  }
  get = r3(get);
  owe = r3(owe);
  return {
    owe,
    get,
    oweSigned: owe >= DEBT_ZERO,
    getSigned: get >= DEBT_ZERO,
    people,
    pairs: pairDebts(bills, pays, period).map((pair) => ({
      ...pair,
      tone: pair.from === BILL_OWNER_NAME ? 'owe' : pair.to === BILL_OWNER_NAME ? 'get' : 'mid',
    })),
  };
}
