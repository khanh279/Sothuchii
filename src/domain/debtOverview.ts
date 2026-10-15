/**
 * Khung "Nợ" ở Tổng quan (hàm thuần): tổng Tôi nợ / Người khác nợ tôi, từng người với hai sổ, và chi tiết theo cặp trong kỳ.
 * Chuyển từ `et()` của `mod-c` trong PWA. Tiền là NGHÌN đồng. Số dư là TOÀN THỜI GIAN; chỉ danh sách cặp theo kỳ đang xem.
 */

import { BILL_OWNER_NAME } from '@/domain/bills';
import { toneOf, type Tone } from '@/domain/debtDetail';
import { DEBT_ZERO, allDebts, debtEvents, isNearZero, pairDebts, type PairDebt } from '@/domain/ledger';
import type { Bill } from '@/types/bill';
import type { Period } from '@/types/expense';
import type { Nghin } from '@/types/money';
import type { Pay } from '@/types/pay';

export interface DebtLine {
  label: 'Vay' | 'Bill';
  value: Nghin;
  tone: Tone;
}

export interface DebtPersonRow {
  name: string;
  /** Chỉ những sổ còn nợ (từ 0,05 nghìn). */
  lines: DebtLine[];
}

export interface PairRow extends PairDebt {
  /** 'owe' khi tôi là người trả, 'get' khi tôi là người nhận, 'mid' với cặp không có tôi. */
  tone: Tone;
}

export interface DebtOverview {
  /** Tổng tôi nợ (số dương). */
  owe: Nghin;
  /** Tổng người khác nợ tôi (số dương). */
  get: Nghin;
  /** Hiện dấu "−" / "+" trước tổng khi từ 0,05 nghìn (`e.owe >= .05 ? "−" : ""`). */
  oweSigned: boolean;
  getSigned: boolean;
  people: DebtPersonRow[];
  pairs: PairRow[];
}

export function buildDebtOverview(bills: readonly Bill[], pays: readonly Pay[], period: Period): DebtOverview {
  const all = allDebts(debtEvents(bills, pays));
  return {
    owe: all.owe,
    get: all.get,
    oweSigned: all.owe >= DEBT_ZERO,
    getSigned: all.get >= DEBT_ZERO,
    people: all.list.map((person) => ({
      name: person.name,
      lines: (
        [
          ['Vay', person.loan],
          ['Bill', person.bill],
        ] as const
      )
        .filter(([, value]) => !isNearZero(value))
        .map(([label, value]) => ({ label, value, tone: toneOf(value) })),
    })),
    pairs: pairDebts(bills, pays, period).map((pair) => ({
      ...pair,
      tone: pair.from === BILL_OWNER_NAME ? 'owe' : pair.to === BILL_OWNER_NAME ? 'get' : 'mid',
    })),
  };
}
