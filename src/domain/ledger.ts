/**
 * Sổ nợ (hàm thuần, không đọc/ghi lưu trữ, không phụ thuộc giao diện). Chuyển từ khối "NỢ" (`nx*`) của `mod-c` trong PWA.
 *
 * HAI SỔ RIÊNG BIỆT với mỗi người: "Nợ vay" (chuyển tiền) và "Nợ bill". Dấu số dư nhìn từ phía "Tôi":
 *   dương = người kia nợ tôi (tôi sẽ nhận lại);  âm = tôi nợ người kia (tôi sẽ phải trả).
 * Hai sổ chỉ trừ vào nhau khi "Gộp nợ" (sinh hai khoản `kind:'bt'` cùng `grp`; xoá cả nhóm là hoàn tác).
 *
 * ĐƠN VỊ: NGHÌN đồng (số lẻ đến 3 chữ số = từng đồng). Số dư dưới 0,05 nghìn coi là bằng 0. Không tự làm tròn khác PWA:
 * cộng dồn bằng `r3`, hiển thị đổi sang đồng ở tầng giao diện.
 */

import { BILL_OWNER_NAME, computeSplit } from '@/domain/bills';
import { formatMoney } from '@/domain/billForm';
import { isInPeriod } from '@/domain/expenses';
import type { Bill } from '@/types/bill';
import type { DateStr, Period } from '@/types/expense';
import type { Nghin } from '@/types/money';
import type { AllDebts, DebtEvent, Ledger, Pay, PersonDebt, PersonLedger } from '@/types/pay';

/** Số dư nhỏ hơn mức này (nghìn đồng) coi là đã thanh toán xong (`nxZ`). */
export const DEBT_ZERO = 0.05;
/** Khoản trả nhỏ hơn hoặc bằng mức này bị bỏ khi lưu (`ot`). */
export const MIN_PAY_AMOUNT = 5e-4;

/** Làm tròn đến 3 chữ số thập phân (từng đồng), như `r3`. */
export const r3 = (x: number): number => Math.round(x * 1e3) / 1e3;
export const isNearZero = (x: number): boolean => Math.abs(x) < DEBT_ZERO;

/** `y()` của PWA: đúng chữ "Tôi". */
const isMe = (name: unknown): boolean => String(name || '') === BILL_OWNER_NAME;
/** `A()` của PWA: cắt khoảng trắng hai đầu. */
const clean = (name: unknown): string => String(name || '').trim();

// ───────────────────────── Phân loại khoản trả ─────────────────────────

/** Khoản trả thuộc sổ nào (`nxCls`): 'loan' | 'bill' | 'bt' (gộp nợ). Thiếu loại: có `item` là vay, ngược lại là bill. */
export function payClass(pay: Pick<Pay, 'kind' | 'item'>): Ledger | 'bt' {
  const kind = pay.kind;
  if (kind === 'bt') return 'bt';
  if (kind === 'bill' || kind === 'billpay') return 'bill';
  if (kind === 'vay' || kind === 'loan' || kind === 'other' || kind === 'xfer') return 'loan';
  return pay.item ? 'loan' : 'bill';
}

/** Khoản gộp nợ thuộc sổ nào (`nxBtLed`). */
export function mergeLedger(pay: Pick<Pay, 'led' | 'bill'>): Ledger {
  return (pay.led as Ledger | undefined) || (pay.bill ? 'bill' : 'loan');
}

/** Sổ tính của một khoản trả (gộp nợ theo `led`). */
export function payLedger(pay: Pick<Pay, 'kind' | 'item' | 'led' | 'bill'>): Ledger {
  const cls = payClass(pay);
  return cls === 'bt' ? mergeLedger(pay) : cls;
}

/** Khoản "Đối soát" cũ (`Nt`): chỉ để hiển thị là "Trả nợ". */
export const isReconciliation = (pay: Pick<Pay, 'ds' | 'note'>): boolean => !!pay.ds || pay.note === 'Đối soát';

// ───────────────────────── Biến động nợ ─────────────────────────

/**
 * Mọi biến động nợ liên quan đến "Tôi", theo thời gian (`nxEvs`): gợi ý chuyển tiền của từng bill và các khoản trả.
 * Khoản trả không có số tiền > 0, hoặc không liên quan đến "Tôi" thì bỏ qua. Cùng ngày xếp theo `createdAt`.
 */
export function debtEvents(bills: readonly Bill[], pays: readonly Pay[]): DebtEvent[] {
  const events: DebtEvent[] = [];
  for (const bill of bills) {
    for (const transfer of computeSplit(bill.people).transfers) {
      const from = clean(transfer.from);
      const to = clean(transfer.to);
      const base = { led: 'bill' as const, k: 'bill' as const, bill, d: String(bill.date), c: bill.createdAt || 0 };
      if (isMe(to) && !isMe(from)) events.push({ ...base, who: from, v: transfer.amt });
      else if (isMe(from) && !isMe(to)) events.push({ ...base, who: to, v: -transfer.amt });
    }
  }
  for (const pay of pays) {
    const amt = +pay.amt || 0;
    if (!(amt > 0)) continue;
    const from = clean(pay.from);
    const to = clean(pay.to);
    const cls = payClass(pay);
    const base = { led: cls === 'bt' ? mergeLedger(pay) : cls, k: cls === 'bt' ? ('bt' as const) : ('pay' as const), pay, d: String(pay.date), c: pay.createdAt || 0 };
    if (isMe(from) && !isMe(to)) events.push({ ...base, who: to, v: amt });
    else if (isMe(to) && !isMe(from)) events.push({ ...base, who: from, v: -amt });
  }
  return events.sort((a, b) => a.d.localeCompare(b.d) || a.c - b.c);
}

/** Số dư và lịch sử với MỘT người (`nxPer`). */
export function personLedger(events: readonly DebtEvent[], name: string): PersonLedger {
  const who = clean(name);
  const result: PersonLedger = { name: who, loan: 0, bill: 0, ev: { loan: [], bill: [] } };
  for (const event of events) {
    if (event.who !== who) continue;
    result[event.led] += event.v;
    result.ev[event.led].push(event);
  }
  result.loan = r3(result.loan);
  result.bill = r3(result.bill);
  return result;
}

/** Nợ với tất cả mọi người (`nxAll`): chỉ người còn nợ ở ít nhất một sổ; lớn nhất trước. */
export function allDebts(events: readonly DebtEvent[]): AllDebts {
  const per = new Map<string, PersonDebt>();
  for (const event of events) {
    const entry = per.get(event.who) ?? { name: event.who, loan: 0, bill: 0 };
    entry[event.led] += event.v;
    per.set(event.who, entry);
  }
  const list = [...per.values()]
    .map((entry) => ({ ...entry, loan: r3(entry.loan), bill: r3(entry.bill) }))
    .filter((entry) => !isNearZero(entry.loan) || !isNearZero(entry.bill));
  let get = 0;
  let owe = 0;
  for (const entry of list) {
    for (const value of [entry.loan, entry.bill]) {
      if (isNearZero(value)) continue;
      if (value > 0) get += value;
      else owe -= value;
    }
  }
  list.sort((a, b) => Math.abs(b.loan) + Math.abs(b.bill) - (Math.abs(a.loan) + Math.abs(a.bill)) || a.name.localeCompare(b.name));
  return { list, get, owe };
}

// ───────────────────────── Gộp nợ ─────────────────────────

/** Hai sổ có số dư khác dấu (một bên nợ tôi, một bên tôi nợ) thì gộp được (`nxCanMerge`). */
export function canMerge(debt: Pick<PersonDebt, 'loan' | 'bill'>): boolean {
  return !isNearZero(debt.loan) && !isNearZero(debt.bill) && debt.loan > 0 !== debt.bill > 0;
}

/** Số tiền được trừ khi gộp: nhỏ hơn giữa hai số dư (`nxMergeAmt`); 0 nếu không gộp được. */
export function mergeAmount(debt: Pick<PersonDebt, 'loan' | 'bill'>): Nghin {
  return canMerge(debt) ? r3(Math.min(Math.abs(debt.loan), Math.abs(debt.bill))) : 0;
}

/** Bản ghi khoản trả chưa có `id`, `createdAt`, `date`, `note` (được thêm khi lưu bằng `finalizeNewPays`). */
export interface PayDraft {
  kind: string;
  from: string;
  to: string;
  amt: Nghin;
  led?: Ledger;
}

/**
 * Hai khoản `bt` của một lần "Gộp nợ" với `name` (`nxMerge`): trừ `mergeAmount` giữa nợ vay và nợ bill.
 * Người đó nợ tôi vay → họ "trả" tôi ở sổ vay và tôi "trả" họ ở sổ bill; ngược lại thì đổi chiều. Rỗng nếu không gộp được.
 */
export function mergeDrafts(debt: PersonDebt): PayDraft[] {
  const amount = mergeAmount(debt);
  if (!(amount > 0)) return [];
  const name = debt.name;
  return debt.loan > 0
    ? [
        { kind: 'bt', led: 'loan', from: name, to: BILL_OWNER_NAME, amt: amount },
        { kind: 'bt', led: 'bill', from: BILL_OWNER_NAME, to: name, amt: amount },
      ]
    : [
        { kind: 'bt', led: 'loan', from: BILL_OWNER_NAME, to: name, amt: amount },
        { kind: 'bt', led: 'bill', from: name, to: BILL_OWNER_NAME, amt: amount },
      ];
}

// ───────────────────────── Thanh toán ─────────────────────────

/**
 * Khoản trả cho `name` ở sổ `ledger` (`nxPay`): "Thanh toán toàn bộ" hay "Một phần" đều dùng hàm này với `amount` khác nhau.
 * Số dư âm (tôi nợ) thì tôi trả họ; số dư dương thì họ trả tôi. `amount` làm tròn `r3`; null nếu số tiền không dương hoặc đã hết nợ.
 * KHÔNG giới hạn số tiền theo số dư (như PWA: trả dư thì sổ đổi dấu).
 */
export function paymentDraft(debt: PersonDebt, ledger: Ledger, amount: Nghin): PayDraft | null {
  const amt = r3(amount);
  if (!(amt > 0)) return null;
  const balance = debt[ledger];
  if (isNearZero(balance)) return null;
  const owed = balance < 0;
  return { kind: ledger === 'loan' ? 'vay' : 'billpay', from: owed ? BILL_OWNER_NAME : debt.name, to: owed ? debt.name : BILL_OWNER_NAME, amt };
}

/** Câu thông báo sau khi ghi một khoản trả: "Đã ghi A → B 50.000 ₫". */
export function paymentMessage(draft: Pick<PayDraft, 'from' | 'to' | 'amt'>): string {
  return `Đã ghi ${draft.from} → ${draft.to} ${formatMoney(draft.amt)}`;
}

/** Câu thông báo sau khi gộp nợ. */
export const mergeMessage = (amount: Nghin): string => `Đã gộp nợ ${formatMoney(amount)}`;

export interface NewPayContext {
  now: number;
  today: DateStr;
  newId: () => string;
  /** Mã nhóm cho một lần gộp nợ. */
  group?: string;
}

/**
 * Biến các bản nháp thành khoản trả sẽ lưu (`ot`): mã mới, `createdAt` tăng dần từ `now`, ngày hôm nay (giờ máy),
 * ghi chú trống, số tiền làm tròn `r3`; khoản `bt` mang `grp`. Khoản có số tiền ≤ 0,0005 nghìn bị bỏ.
 */
export function finalizeNewPays(drafts: readonly PayDraft[], context: NewPayContext): Pay[] {
  return drafts
    .map((draft, index) => {
      const pay: Pay = {
        ...draft,
        id: context.newId(),
        createdAt: context.now + index,
        date: context.today,
        note: '',
        amt: r3(draft.amt),
      };
      if (context.group && draft.kind === 'bt') pay.grp = context.group;
      return pay;
    })
    .filter((pay) => pay.amt > MIN_PAY_AMOUNT);
}

/** Mã nhóm gộp nợ: "g" + thời gian (base 36), như PWA. */
export const newMergeGroupId = (now: number): string => `g${now.toString(36)}`;

// ───────────────────────── Hoàn tác gộp nợ ─────────────────────────

export interface MergeRecord {
  id: string;
  date: DateStr;
  createdAt: number;
  loan: Nghin;
  bill: Nghin;
}

/** Các lần gộp nợ với `name` (`nxHist`), mới nhất trước; hiển thị "Gộp nợ" với số lớn hơn giữa hai sổ. */
export function mergeHistory(pays: readonly Pay[], name: string): MergeRecord[] {
  const target = clean(name);
  const groups = new Map<string, MergeRecord>();
  const order: MergeRecord[] = [];
  for (const pay of pays) {
    if (pay.kind !== 'bt' || !pay.grp) continue;
    const from = clean(pay.from);
    const to = clean(pay.to);
    if (!((from === target && isMe(to)) || (isMe(from) && to === target))) continue;
    let record = groups.get(pay.grp);
    if (!record) {
      record = { id: pay.grp, date: pay.date, createdAt: pay.createdAt || 0, loan: 0, bill: 0 };
      groups.set(pay.grp, record);
      order.push(record);
    }
    if (mergeLedger(pay) === 'bill') record.bill += +pay.amt || 0;
    else record.loan += +pay.amt || 0;
  }
  return order.sort((a, b) => b.createdAt - a.createdAt);
}

export type UndoMergeCheck = { ok: true } | { ok: false; message: string };

/**
 * Có được hoàn tác lần gộp nợ `group` không. Khác PWA (hoàn tác không điều kiện): chỉ cho hoàn tác khi, kể từ lúc gộp,
 * người đó chưa có biến động nào khác ở cả hai sổ (bill, chuyển tiền, thanh toán, hoặc lần gộp khác). "Sau" tính theo `createdAt`
 * (thời điểm tạo), không theo ngày ghi trên giao dịch. Nếu đã có, không khôi phục máy móc hai số dư cũ mà báo rõ để người dùng tự xử lý.
 * Nhóm không tồn tại → ok (không có gì để hoàn tác).
 */
export function checkUndoMerge(bills: readonly Bill[], pays: readonly Pay[], group: string): UndoMergeCheck {
  const members = pays.filter((pay) => pay.kind === 'bt' && pay.grp === group);
  if (!members.length) return { ok: true };
  const mergedAt = Math.max(...members.map((pay) => pay.createdAt || 0));
  const first = members[0];
  const person = isMe(clean(first.from)) ? clean(first.to) : clean(first.from);
  const later = debtEvents(bills, pays).some((event) => event.who === person && event.pay?.grp !== group && event.c > mergedAt);
  return later
    ? { ok: false, message: `Không thể hoàn tác: đã có giao dịch mới với ${person} sau lần gộp nợ này.` }
    : { ok: true };
}

/** Hoàn tác một lần gộp nợ = bỏ mọi khoản `grp` đó (số dư trở lại như trước khi gộp). */
export function withoutMergeGroup(pays: readonly Pay[], group: string): Pay[] {
  return pays.filter((pay) => pay.grp !== group);
}

// ───────────────────────── Nhãn dòng sổ ─────────────────────────

export interface LedgerItem {
  d: DateStr;
  v: Nghin;
  /** Tiêu đề dòng. */
  t: string;
  /** Dòng phụ. */
  s: string;
}

/** Nhãn dòng trong sổ (`nxLbl`). `prev` là số dư ngay trước dòng này. */
export function eventLabel(event: DebtEvent, prev: Nghin): string {
  const who = event.who;
  if (event.k === 'bt') return 'Gộp nợ';
  if (event.k === 'bill') return event.bill?.title || 'Không tên';
  if (event.led === 'bill') return event.v > 0 ? `Tôi trả ${who}` : `${who} trả tôi`;
  const next = prev + event.v;
  if (isNearZero(prev) || prev * event.v > 0) return event.v > 0 ? `Tôi cho ${who} vay` : `${who} cho tôi vay`;
  if (!isNearZero(next) && next * event.v > 0) return event.v > 0 ? `Tôi chuyển cho ${who}` : `${who} chuyển cho tôi`;
  return event.v > 0 ? `Tôi trả ${who}` : `${who} trả tôi`;
}

/** Dòng phụ (`nxSub`); `categoryName` đổi mã mục chi của bill sang tên. */
export function eventSubtitle(event: DebtEvent, categoryName: (id: string) => string = () => ''): string {
  if (event.k === 'bill') return categoryName(event.bill?.cat || 'other') || 'Bill';
  if (event.k === 'bt') return 'Trừ giữa nợ vay và nợ bill';
  const pay = event.pay;
  const note = pay && pay.note && pay.note !== 'Đối soát' && pay.note !== 'Trả nợ' ? pay.note : '';
  return note || (event.led === 'bill' ? 'Thanh toán bill' : 'Chuyển tiền');
}

/** Các dòng của một sổ, kèm số dư chạy (`nxItems`). */
export function ledgerItems(events: readonly DebtEvent[], categoryName?: (id: string) => string): LedgerItem[] {
  let balance = 0;
  return events.map((event) => {
    const item = { d: event.d, v: event.v, t: eventLabel(event, balance), s: eventSubtitle(event, categoryName) };
    balance = r3(balance + event.v);
    return item;
  });
}

// ───────────────────────── Theo cặp người trong kỳ ─────────────────────────

export interface PairDebt {
  from: string;
  to: string;
  amt: Nghin;
  n: number;
}

/**
 * Nợ bill theo từng cặp người trong kỳ đang xem (`nxPairs`): cộng gợi ý chuyển tiền của bill và các khoản trả thuộc sổ bill
 * (kể cả giữa hai người khác "Tôi"). Chỉ giữ cặp còn lệch từ 0,05 nghìn; cặp có "Tôi" là người nhận lên trước, rồi "Tôi" là người trả.
 */
export function pairDebts(bills: readonly Bill[], pays: readonly Pay[], period: Period): PairDebt[] {
  const map = new Map<string, { a: string; b: string; v: number; n: number }>();
  const add = (from: string, to: string, amount: number) => {
    if (!from || !to || from === to) return;
    const low = from < to;
    const key = low ? `${from}\u0001${to}` : `${to}\u0001${from}`;
    let entry = map.get(key);
    if (!entry) {
      entry = { a: low ? from : to, b: low ? to : from, v: 0, n: 0 };
      map.set(key, entry);
    }
    entry.v += low ? amount : -amount;
    entry.n++;
  };
  for (const bill of bills) {
    if (!isInPeriod(bill.date, period)) continue;
    for (const transfer of computeSplit(bill.people).transfers) add(clean(transfer.from), clean(transfer.to), transfer.amt);
  }
  for (const pay of pays) {
    const amt = +pay.amt || 0;
    if (!(amt > 0) || !isInPeriod(String(pay.date), period)) continue;
    if (payLedger(pay) === 'bill') add(clean(pay.from), clean(pay.to), -amt);
  }
  const rank = (p: PairDebt) => (isMe(p.to) ? 0 : isMe(p.from) ? 1 : 2);
  return [...map.values()]
    .map((entry) => {
      const value = r3(entry.v);
      return value >= 0 ? { from: entry.a, to: entry.b, amt: value, n: entry.n } : { from: entry.b, to: entry.a, amt: -value, n: entry.n };
    })
    .filter((pair) => pair.amt > DEBT_ZERO)
    .sort((a, b) => rank(a) - rank(b) || b.amt - a.amt || a.from.localeCompare(b.from));
}

export interface PairItem {
  d: DateStr;
  c: number;
  /** Dương: `x` nợ `z` thêm (theo chiều x → z). */
  s: Nghin;
  t: string;
  x: string;
}

export interface PairNet {
  items: PairItem[];
  net: Nghin;
  from: string;
  to: string;
  amt: Nghin;
}

/** Chi tiết nợ bill giữa hai người `x` và `z` trong kỳ (`nxPairItems` + `nxCtNet`). */
export function pairNet(
  bills: readonly Bill[],
  pays: readonly Pay[],
  x: string,
  z: string,
  period: Period,
  categoryName: (id: string) => string = () => '',
): PairNet {
  const items: PairItem[] = [];
  for (const bill of bills) {
    if (!isInPeriod(bill.date, period)) continue;
    for (const transfer of computeSplit(bill.people).transfers) {
      const from = clean(transfer.from);
      const to = clean(transfer.to);
      const sign = from === x && to === z ? 1 : from === z && to === x ? -1 : 0;
      if (sign) items.push({ d: String(bill.date), c: bill.createdAt || 0, s: sign * transfer.amt, t: bill.title || 'Không tên', x: categoryName(bill.cat || 'other') || 'Bill' });
    }
  }
  for (const pay of pays) {
    const amt = +pay.amt || 0;
    const date = String(pay.date);
    if (!(amt > 0) || !isInPeriod(date, period) || payLedger(pay) !== 'bill') continue;
    const from = clean(pay.from);
    const to = clean(pay.to);
    const s = from === x && to === z ? -amt : from === z && to === x ? amt : 0;
    if (!s) continue;
    const merged = payClass(pay) === 'bt';
    items.push({ d: date, c: pay.createdAt || 0, s, t: merged ? 'Gộp nợ' : `${from} trả ${to}`, x: merged ? 'Trừ giữa nợ vay và nợ bill' : 'Thanh toán bill' });
  }
  items.sort((a, b) => a.d.localeCompare(b.d) || a.c - b.c);
  const net = r3(items.reduce((sum, item) => sum + item.s, 0));
  return { items, net, from: net >= 0 ? x : z, to: net >= 0 ? z : x, amt: Math.abs(net) };
}

/** "Thanh toán toàn bộ" cho cả cặp (`nxCtPay`): null nếu chênh lệch dưới 0,05 nghìn. */
export function pairPaymentDraft(net: Pick<PairNet, 'from' | 'to' | 'amt'>): PayDraft | null {
  if (net.amt < DEBT_ZERO) return null;
  return { kind: 'billpay', from: net.from, to: net.to, amt: net.amt };
}
