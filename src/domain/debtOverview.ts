/**
 * Khung "Nợ" ở Tổng quan (hàm thuần): tổng Tôi nợ / Người khác nợ tôi (từ tổng ròng mỗi người), một số tổng cho từng người, và chi tiết theo cặp trong kỳ.
 * Chuyển từ `et()` của `mod-c` trong PWA. Tiền là ĐỒNG. Số dư là TOÀN THỜI GIAN; chỉ danh sách cặp theo kỳ đang xem.
 * Khác PWA theo yêu cầu mới: Tổng quan không tách nợ vay / nợ bill (việc tách chỉ ở màn chi tiết).
 */

import { BILL_OWNER_NAME } from '@/domain/bills';
import { toneOf, type Tone } from '@/domain/debtDetail';
import { DEBT_ZERO, allDebts, debtEvents, isNearZero, pairDebts, type PairDebt } from '@/domain/ledger';
import type { Bill } from '@/types/bill';
import type { Period } from '@/types/expense';
import type { Vnd } from '@/types/money';
import type { Pay } from '@/types/pay';
import { roundVnd } from '@/domain/money';

export interface DebtPersonRow {
  name: string;
  /** Tổng nợ = nợ vay + nợ bill (cộng đại số có dấu): dương = họ nợ tôi, âm = tôi nợ họ. */
  total: Vnd;
  /** 'mid' khi tổng về 0 (hai sổ trái dấu bù nhau) – vẫn liệt kê để vào được "Gộp nợ". */
  tone: Tone;
}

/**
 * Nợ VAY (sổ chuyển tiền) theo từng người, TOÀN THỜI GIAN: chỉ người còn nợ vay (từ 50 đồng); dương = họ nợ tôi (tone 'get'), âm = tôi nợ họ (tone 'owe').
 * Lớn nhất trước. Không gồm nợ bill (nợ bill xem theo cặp ở `buildBillPairs`).
 */
export function buildLoanPeople(bills: readonly Bill[], pays: readonly Pay[]): DebtPersonRow[] {
  return allDebts(debtEvents(bills, pays))
    .list.filter((person) => !isNearZero(person.loan))
    .map((person) => ({ name: person.name, total: roundVnd(person.loan), tone: toneOf(person.loan) }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total) || a.name.localeCompare(b.name));
}

export interface PairRow extends PairDebt {
  /** 'owe' khi tôi là người trả, 'get' khi tôi là người nhận, 'mid' với cặp không có tôi. */
  tone: Tone;
}

export interface DebtOverview {
  /** Tổng tôi nợ (số dương), cộng từ tổng ròng của những người tôi đang nợ. */
  owe: Vnd;
  /** Tổng người khác nợ tôi (số dương), cộng từ tổng ròng của những người đang nợ tôi. */
  get: Vnd;
  /** Hiện dấu "−" / "+" trước tổng khi từ 50 đồng (`e.owe >= .05 ? "−" : ""`). */
  oweSigned: boolean;
  getSigned: boolean;
  people: DebtPersonRow[];
  pairs: PairRow[];
}

export function buildDebtOverview(bills: readonly Bill[], pays: readonly Pay[], period: Period): DebtOverview {
  // Người còn nợ ở ít nhất một sổ; mỗi người một con số là tổng đại số hai sổ.
  const people: DebtPersonRow[] = allDebts(debtEvents(bills, pays))
    .list.map((person) => {
      const total = roundVnd(person.loan + person.bill);
      return { name: person.name, total, tone: isNearZero(total) ? ('mid' as const) : toneOf(total) };
    })
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total) || a.name.localeCompare(b.name));
  let get = 0;
  let owe = 0;
  for (const person of people) {
    if (person.tone === 'get') get += person.total;
    else if (person.tone === 'owe') owe -= person.total;
  }
  get = roundVnd(get);
  owe = roundVnd(owe);
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

export interface DebtPersonSplit extends DebtPersonRow {
  /** Phần nợ vay và phần nợ bill của người này (có dấu: dương = họ nợ tôi, âm = tôi nợ họ); `total` = tổng hai phần. */
  loan: Vnd;
  bill: Vnd;
}

/**
 * Nợ THEO NGƯỜI, toàn thời gian, kèm phần nợ vay / nợ bill của từng người: chỉ người còn nợ ròng (hai sổ bù nhau về 0 thì bỏ). Lớn nhất trước.
 * `includeOffsetting`: giữ cả người hai sổ trái chiều bù nhau về 0 (tone 'mid') để vẫn xem được từng khoản. Cùng con số `total` với `buildDebtOverview().people`; chỉ thêm hai phần để trang "Chi tiết nợ & bill" hiện được nợ gồm những gì.
 */
export function buildDebtPeopleSplit(bills: readonly Bill[], pays: readonly Pay[], includeOffsetting = false): DebtPersonSplit[] {
  return allDebts(debtEvents(bills, pays))
    .list.map((person) => {
      const total = roundVnd(person.loan + person.bill);
      return { name: person.name, total, tone: isNearZero(total) ? ('mid' as const) : toneOf(total), loan: roundVnd(person.loan), bill: roundVnd(person.bill) };
    })
    .filter((person) => includeOffsetting || person.tone !== 'mid')
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total) || a.name.localeCompare(b.name));
}
