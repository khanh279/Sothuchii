import AsyncStorage from '@react-native-async-storage/async-storage';

import { syncBillExpenses } from './billSync';
import { createExpense } from './expenseRepository';
import { loadPays } from './payRepository';
import {
  addTransferSynced,
  deletePaySynced,
  mergeDebtsSynced,
  recordDebtPaymentSynced,
  recordPairPaymentSynced,
  recordPersonBillPaymentSynced,
  recordPaymentSynced,
  undoMergeSynced,
  updatePayGroupSynced,
  updateTransferSynced,
} from './payService';
import { loadBills } from './billRepository';
import { personBillRows } from '@/domain/billPerson';
import { debtEvents, personLedger } from '@/domain/ledger';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Sổ tính bằng NGHÌN đồng, khoản chi bằng ĐỒNG.
const BILLS = 'chiabill:v2:bills';
const PAYS = 'chiabill:v2:pays';
const json = async (key: string) => JSON.parse((await AsyncStorage.getItem(key)) as string);
const p = (name: string, paid: number) => ({ name, paid, w: 1 });
const TODAY = (() => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
})();
const monthOfToday = TODAY.slice(0, 7);

async function seedBills() {
  // Tôi nợ An 30 nghìn (bill Ăn, 01/10/2025).
  await AsyncStorage.setItem(BILLS, JSON.stringify([{ id: 'b1', title: 'Ăn', date: '2025-10-01', cat: 'food', createdAt: 1, people: [p('Tôi', 0), p('An', 90), p('Bình', 0)] }]));
}
const ledger = async (name: string) => personLedger(debtEvents(await loadBills(), await loadPays()), name);
/** Mọi khoản chi cá nhân src "cb" trên máy. */
async function cbExpenses() {
  const out: Record<string, unknown>[] = [];
  for (const key of await AsyncStorage.getAllKeys()) {
    if (!key.startsWith('sct:m:')) continue;
    for (const value of Object.values(await json(key))) if ((value as { src?: string }).src === 'cb') out.push(value as Record<string, unknown>);
  }
  return out;
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('thanh toán', () => {
  it('thanh toán toàn bộ nợ bill: ghi khoản trả, sổ về 0, sinh khoản chi cá nhân ĐỒNG theo bill, liên kết exp', async () => {
    await seedBills();
    const result = await recordPaymentSynced('An', 'bill', 30);
    expect(result).toEqual({ value: { recorded: true, message: 'Đã ghi Tôi → An 30.000 ₫' }, syncFailed: false });
    expect(await ledger('An')).toMatchObject({ bill: 0 });
    const pays = await json(PAYS);
    expect(pays).toHaveLength(1);
    expect(pays[0]).toMatchObject({ kind: 'billpay', from: 'Tôi', to: 'An', amt: 30, date: TODAY, note: '' });
    expect(pays[0].exp).toHaveLength(1);
    const expenses = await cbExpenses();
    expect(expenses).toHaveLength(1);
    expect(expenses[0]).toMatchObject({ a: 30_000, c: 'food', n: 'Ăn', i: 'Trả An · bill 01/10', d: TODAY, src: 'cb' });
  });

  it('thanh toán một phần hai lần trong ngày: gộp thành MỘT khoản (cộng tiền) và chi tiêu khớp tổng', async () => {
    await seedBills();
    await recordPaymentSynced('An', 'bill', 10);
    await recordPaymentSynced('An', 'bill', 20);
    const pays = await json(PAYS);
    expect(pays).toHaveLength(1);
    expect(pays[0].amt).toBe(30);
    expect((await cbExpenses()).map((e) => e.a)).toEqual([30_000]);
    expect(await ledger('An')).toMatchObject({ bill: 0 });
  });

  it('một phần rồi phần còn lại ở ngày khác không gộp; số dư giảm dần', async () => {
    await seedBills();
    await AsyncStorage.setItem(PAYS, JSON.stringify([{ id: 'old', createdAt: 5, date: '2025-10-02', note: '', from: 'Tôi', to: 'An', amt: 10, kind: 'billpay' }]));
    await recordPaymentSynced('An', 'bill', 5);
    expect(await json(PAYS)).toHaveLength(2);
    expect(await ledger('An')).toMatchObject({ bill: -15 });
    expect((await cbExpenses()).map((e) => e.a as number).sort((x, y) => x - y)).toEqual([5_000, 10_000]);
  });

  it('số tiền ≤ 0, sổ đã hết nợ hoặc người lạ → không ghi gì', async () => {
    await seedBills();
    for (const [name, led, amt] of [['An', 'bill', 0], ['An', 'bill', -5], ['An', 'loan', 10], ['Chi', 'bill', 5]] as const) {
      expect((await recordPaymentSynced(name, led, amt)).value.recorded).toBe(false);
    }
    expect(await AsyncStorage.getItem(PAYS)).toBeNull();
    expect(await cbExpenses()).toEqual([]);
  });

  it('trả dư không bị chặn: sổ đổi dấu và chỉ khoản chi đúng phần nợ được tạo', async () => {
    await seedBills();
    await recordPaymentSynced('An', 'bill', 50);
    expect(await ledger('An')).toMatchObject({ bill: 20 });
    expect((await cbExpenses()).map((e) => e.a)).toEqual([30_000]);
  });

  it('thanh toán sổ vay không sinh khoản chi cá nhân', async () => {
    await AsyncStorage.setItem(BILLS, '[]');
    await AsyncStorage.setItem(PAYS, JSON.stringify([{ id: 'l1', createdAt: 1, date: '2025-10-02', note: '', from: 'An', to: 'Tôi', amt: 50, kind: 'vay' }])); // tôi nợ An 50 vay
    const result = await recordPaymentSynced('An', 'loan', 50);
    expect(result.value.recorded).toBe(true);
    expect(await ledger('An')).toMatchObject({ loan: 0 });
    expect(await cbExpenses()).toEqual([]);
  });

  it('cả cặp trong kỳ: thanh toán toàn bộ chênh lệch', async () => {
    await seedBills();
    const result = await recordPairPaymentSynced('Tôi', 'An', { mode: 'all' });
    expect(result.value).toEqual({ recorded: true, message: 'Đã ghi Tôi → An 30.000 ₫' });
    expect((await recordPairPaymentSynced('Tôi', 'An', { mode: 'all' })).value.recorded).toBe(false);
  });
});

describe('thanh toán 4 lựa chọn (nợ bill / nợ vay / một phần / toàn bộ)', () => {
  /** Tôi nợ An 30 (bill) và 50 (vay, An cho tôi vay). Khoản vay có trường lạ để kiểm tra bảo toàn. */
  async function seedOweBoth() {
    await seedBills();
    await AsyncStorage.setItem(PAYS, JSON.stringify([{ id: 'l1', createdAt: 1, date: '2025-10-02', note: '', from: 'An', to: 'Tôi', amt: 50, kind: 'vay', zzz: 'giu-nguyen' }]));
  }

  it('trả quá tổng nợ: bill 30 + vay 50 + dư 20 thành nợ vay mới; ghi một lần, bản ghi dư riêng, không sinh chi tiêu ngoài bill', async () => {
    await seedOweBoth();
    const result = await recordDebtPaymentSynced('An', 'partial', 100);
    expect(result).toEqual({ value: { recorded: true, message: 'Đã ghi Tôi → An 30.000 ₫ · Tôi → An 50.000 ₫ · Tôi → An 20.000 ₫' }, syncFailed: false });
    expect(await ledger('An')).toMatchObject({ bill: 0, loan: 20 });
    const pays = await json(PAYS);
    expect(pays).toHaveLength(4);
    expect(pays[0]).toMatchObject({ id: 'l1', zzz: 'giu-nguyen' });
    expect(pays.slice(1).map((x: { kind: string; amt: number; note: string }) => [x.kind, x.amt, x.note])).toEqual([
      ['billpay', 30, ''],
      ['vay', 50, ''],
      ['vay', 20, 'Trả dư'],
    ]);
    // Chỉ khoản trả nợ bill sinh chi tiêu cá nhân (30.000 đồng), đúng một khoản.
    expect((await cbExpenses()).map((e) => e.a)).toEqual([30_000]);
  });

  it('trả riêng nợ vay: nợ bill giữ nguyên, không sinh chi tiêu', async () => {
    await seedOweBoth();
    await recordDebtPaymentSynced('An', 'loan');
    expect(await ledger('An')).toMatchObject({ bill: -30, loan: 0 });
    expect(await cbExpenses()).toEqual([]);
  });

  it('trả riêng nợ bill rồi toàn bộ phần còn lại; gọi lại khi hết nợ không ghi thêm', async () => {
    await seedOweBoth();
    await recordDebtPaymentSynced('An', 'bill');
    expect(await ledger('An')).toMatchObject({ bill: 0, loan: -50 });
    await recordDebtPaymentSynced('An', 'all');
    expect(await ledger('An')).toMatchObject({ bill: 0, loan: 0 });
    const count = (await json(PAYS)).length;
    expect((await recordDebtPaymentSynced('An', 'all')).value.recorded).toBe(false);
    expect(await json(PAYS)).toHaveLength(count);
    expect((await cbExpenses()).map((e) => e.a)).toEqual([30_000]);
  });

  it('sau khi trả dư, họ nợ tôi 20: thanh toán 20 đưa về 0; khoản "Trả dư" vẫn là một bản ghi, tiền không tính đôi', async () => {
    await seedOweBoth();
    await recordDebtPaymentSynced('An', 'partial', 100); // bill 30 + vay 50 + dư 20 → An nợ tôi vay 20
    expect(await ledger('An')).toMatchObject({ bill: 0, loan: 20 });
    await recordDebtPaymentSynced('An', 'all'); // An trả tôi 20
    expect(await ledger('An')).toMatchObject({ bill: 0, loan: 0 });
    expect((await json(PAYS)).filter((x: { note: string }) => x.note === 'Trả dư')).toHaveLength(1);
    expect((await cbExpenses()).map((e) => e.a)).toEqual([30_000]);
  });

  it('xoá khoản "Trả dư" → số dư trở về trước phần dư; chi tiêu cá nhân của khoản trả bill không đổi', async () => {
    await seedOweBoth();
    await recordDebtPaymentSynced('An', 'partial', 100);
    const surplus = (await json(PAYS)).find((x: { note: string }) => x.note === 'Trả dư');
    await deletePaySynced([surplus.id]);
    expect(await ledger('An')).toMatchObject({ bill: 0, loan: 0 });
    expect((await cbExpenses()).map((e) => e.a)).toEqual([30_000]);
  });

  it('hai sổ trái dấu hoặc số tiền ≤ 0 → không ghi gì', async () => {
    await seedBills();
    await AsyncStorage.setItem(PAYS, JSON.stringify([{ id: 'l1', createdAt: 1, date: '2025-10-02', note: '', from: 'Tôi', to: 'An', amt: 50, kind: 'vay' }])); // An nợ tôi vay 50, tôi nợ An bill 30
    const before = await AsyncStorage.getItem(PAYS);
    expect((await recordDebtPaymentSynced('An', 'all')).value.recorded).toBe(false);
    expect((await recordDebtPaymentSynced('An', 'partial', 10)).value.recorded).toBe(false);
    expect(await AsyncStorage.getItem(PAYS)).toBe(before);
    expect((await recordDebtPaymentSynced('An', 'partial', 0)).value.recorded).toBe(false);
  });
});

describe('thanh toán nợ bill của một người trong kỳ (một phần / nhập số)', () => {
  const OCT = { mode: 'month' as const, month: '2025-10' };
  const remaining = async () => personBillRows(await loadBills(), await loadPays(), 'An', OCT);

  it('trả một phần rồi trả nốt: ghi đúng số tiền, còn lại giảm đúng, chi tiêu cá nhân sinh theo phần trả; hết nợ thì từ chối', async () => {
    await seedBills(); // tôi nợ An 30 (bill 01/10/2025)
    const first = await recordPersonBillPaymentSynced('An', OCT, 10);
    expect(first.value).toEqual({ recorded: true, message: 'Đã ghi Tôi → An 10.000 ₫' });
    expect(await remaining()).toMatchObject({ remaining: 20, rows: [{ id: 'b1', paid: 10, remaining: 20 }] });
    expect((await cbExpenses()).map((e) => e.a)).toEqual([10_000]);

    await recordPersonBillPaymentSynced('An', OCT, 20);
    expect(await remaining()).toMatchObject({ remaining: 0 });
    await expect(recordPersonBillPaymentSynced('An', OCT, 5)).rejects.toThrow('Không còn khoản nào phải thanh toán');
    expect((await json(PAYS)).map((x: { amt: number }) => x.amt)).toEqual([30]); // cùng ngày, cùng người: cộng dồn một dòng
  });

  it('số tiền không hợp lệ hoặc vượt số còn phải thanh toán: báo lỗi, không ghi gì', async () => {
    await seedBills();
    for (const bad of [0, -3, 31]) await expect(recordPersonBillPaymentSynced('An', OCT, bad)).rejects.toThrow();
    expect(await AsyncStorage.getItem(PAYS)).toBeNull();
  });
});

describe('gộp nợ và hoàn tác', () => {
  async function seedLoanAndBill() {
    await seedBills();
    await AsyncStorage.setItem(PAYS, JSON.stringify([{ id: 'l1', createdAt: 1, date: '2025-10-02', note: '', from: 'Tôi', to: 'An', amt: 50, kind: 'vay' }])); // An nợ tôi 50 vay
  }

  it('gộp nợ: cùng nhóm, nợ bill về 0, nợ vay giảm đúng số; sinh khoản "Bù trừ nợ"; hoàn tác trả lại tất cả', async () => {
    await seedLoanAndBill();
    const result = await mergeDebtsSynced('An');
    expect(result.value).toEqual({ recorded: true, message: 'Đã gộp nợ 30.000 ₫' });
    const pays = await json(PAYS);
    const merged = pays.filter((x: { kind: string }) => x.kind === 'bt');
    expect(merged).toHaveLength(2);
    expect(new Set(merged.map((x: { grp: string }) => x.grp)).size).toBe(1);
    expect(await ledger('An')).toMatchObject({ loan: 20, bill: 0 });
    expect((await cbExpenses()).map((e) => [e.a, e.i])).toEqual([[30_000, 'Bù trừ nợ An · bill 01/10']]);

    const group = merged[0].grp as string;
    expect(await undoMergeSynced(group)).toEqual({ value: 2, syncFailed: false });
    expect(await ledger('An')).toMatchObject({ loan: 50, bill: -30 });
    expect(await cbExpenses()).toEqual([]);
    expect(await json(PAYS)).toHaveLength(1);
  });

  it('hoàn tác bị chặn khi sau lần gộp đã có giao dịch mới: báo lỗi, dữ liệu giữ nguyên', async () => {
    await seedLoanAndBill();
    await mergeDebtsSynced('An');
    await new Promise((resolve) => setTimeout(resolve, 5));
    await recordPaymentSynced('An', 'loan', 5); // giao dịch mới sau khi gộp
    const before = await json(PAYS);
    const group = before.find((x: { kind: string }) => x.kind === 'bt').grp as string;
    await expect(undoMergeSynced(group)).rejects.toThrow('Không thể hoàn tác');
    expect(await json(PAYS)).toEqual(before);
  });

  it('gộp → hoàn tác → gộp lại: số dư và khoản chi cá nhân ổn định, không tạo trùng', async () => {
    await seedLoanAndBill();
    await mergeDebtsSynced('An');
    const group = ((await json(PAYS)).find((x: { kind: string }) => x.kind === 'bt') as { grp: string }).grp;
    await undoMergeSynced(group);
    expect(await ledger('An')).toMatchObject({ loan: 50, bill: -30 });
    expect(await cbExpenses()).toEqual([]);
    await mergeDebtsSynced('An');
    expect(await ledger('An')).toMatchObject({ loan: 20, bill: 0 });
    expect((await cbExpenses()).map((e) => e.a)).toEqual([30_000]);
    expect((await json(PAYS)).filter((x: { kind: string }) => x.kind === 'bt')).toHaveLength(2);
  });

  it('không gộp được (cùng dấu hoặc một sổ bằng 0) → không ghi gì', async () => {
    await seedBills();
    expect((await mergeDebtsSynced('An')).value.recorded).toBe(false);
    expect(await AsyncStorage.getItem(PAYS)).toBeNull();
  });

  it('gộp hai lần liên tiếp trong ngày không bị gộp trùng vào nhau (khác nhóm)', async () => {
    await seedLoanAndBill();
    await mergeDebtsSynced('An'); // gộp 30, bill về 0
    expect((await mergeDebtsSynced('An')).value.recorded).toBe(false);
    expect((await json(PAYS)).filter((x: { kind: string }) => x.kind === 'bt')).toHaveLength(2);
  });

  it('hoàn tác nhóm không tồn tại → 0, không ghi', async () => {
    await seedLoanAndBill();
    expect((await undoMergeSynced('g-khong-co')).value).toBe(0);
  });
});

describe('form chuyển tiền: thêm, sửa, xoá', () => {
  it('thêm cùng một khoản hai lần trong ngày → cộng thành một khoản', async () => {
    const input = { date: '2025-10-05', note: ' ăn trưa ', from: 'Tôi', to: 'An', amt: 5, kind: 'vay' as const };
    await addTransferSynced(input);
    await addTransferSynced(input);
    const pays = await json(PAYS);
    expect(pays).toHaveLength(1);
    expect(pays[0]).toMatchObject({ amt: 10, note: 'ăn trưa', kind: 'vay' });
  });

  it('sửa một khoản thành giống hệt khoản khác: KHÔNG cộng hai lần', async () => {
    await addTransferSynced({ date: '2025-10-05', note: '', from: 'Tôi', to: 'An', amt: 5, kind: 'vay' });
    const second = (await addTransferSynced({ date: '2025-10-06', note: '', from: 'Tôi', to: 'An', amt: 7, kind: 'vay' })).value;
    expect((await updateTransferSynced(second, { date: '2025-10-05', note: '', from: 'Tôi', to: 'An', amt: 7 })).value).toBe(true);
    const pays = await json(PAYS);
    expect(pays.map((x: { amt: number }) => x.amt).sort()).toEqual([5, 7]);
  });

  it('sửa số tiền của khoản trả bill → khoản chi cá nhân được cập nhật, không để lại khoản cũ', async () => {
    await seedBills();
    await recordPaymentSynced('An', 'bill', 30);
    const id = (await json(PAYS))[0].id as string;
    await updateTransferSynced(id, { date: TODAY, note: '', from: 'Tôi', to: 'An', amt: 12 });
    expect((await cbExpenses()).map((e) => e.a)).toEqual([12_000]);
    expect(await ledger('An')).toMatchObject({ bill: -18 });
  });

  it('đổi khoản trả bill sang chuyển tiền (vay) → khoản chi cá nhân liên kết biến mất', async () => {
    await seedBills();
    await recordPaymentSynced('An', 'bill', 30);
    const id = (await json(PAYS))[0].id as string;
    await updateTransferSynced(id, { date: TODAY, note: '', from: 'Tôi', to: 'An', amt: 30, kind: 'vay' });
    expect(await cbExpenses()).toEqual([]);
    expect((await json(PAYS))[0]).not.toHaveProperty('exp');
  });

  it('xoá khoản trả: chỉ xoá khoản chi cá nhân liên kết với nó; khoản tự nhập và khoản "quy" còn nguyên', async () => {
    await seedBills();
    await createExpense('mine', { a: 5000, c: 'food', n: 'Phở', d: TODAY, t: 1 });
    await createExpense('fund', { a: 7000, c: 'fund', n: 'Quỹ', d: TODAY, t: 1, src: 'quy' });
    await recordPaymentSynced('An', 'bill', 30);
    const id = (await json(PAYS))[0].id as string;
    expect(await deletePaySynced([id])).toEqual({ value: 1, syncFailed: false });
    expect(await json(PAYS)).toEqual([]);
    const month = await json(`sct:m:${monthOfToday}`);
    expect(Object.keys(month).sort()).toEqual(['fund', 'mine']);
    expect(await ledger('An')).toMatchObject({ bill: -30 });
  });

  it('khoản người dùng tự nhập trỏ nhầm bởi exp: chỉ bỏ liên kết, không xoá', async () => {
    await seedBills();
    await createExpense('mine', { a: 5000, c: 'food', n: 'Phở', d: TODAY, t: 1 });
    await AsyncStorage.setItem(PAYS, JSON.stringify([{ id: 'p1', createdAt: 1, date: TODAY, note: '', from: 'Tôi', to: 'An', amt: 30, kind: 'billpay', exp: [{ m: monthOfToday, id: 'mine' }] }]));
    await syncBillExpenses();
    expect((await json(`sct:m:${monthOfToday}`)).mine).toMatchObject({ a: 5000, n: 'Phở' });
    expect((await cbExpenses()).map((e) => e.a)).toEqual([30_000]);
  });

  it('sửa nhóm trả bill: không đổi gì ngoài ghi chú → chỉ đổi ghi chú; đổi tiền → thay cả nhóm bằng một khoản', async () => {
    await AsyncStorage.setItem(BILLS, '[]');
    await AsyncStorage.setItem(PAYS, JSON.stringify([
      { id: 'g1', createdAt: 1, date: '2025-10-05', note: '', from: 'An', to: 'Bình', amt: 10, kind: 'billpay', bill: 'x' },
      { id: 'g2', createdAt: 2, date: '2025-10-05', note: '', from: 'An', to: 'Bình', amt: 5, kind: 'billpay', bill: 'y' },
    ]));
    const orig = { date: '2025-10-05', from: 'An', to: 'Bình', amt: 15 };
    await updatePayGroupSynced(['g1', 'g2'], orig, { ...orig, note: 'ghi chú' });
    expect((await json(PAYS)).map((x: { note: string }) => x.note)).toEqual(['ghi chú', 'ghi chú']);
    await updatePayGroupSynced(['g1', 'g2'], orig, { ...orig, amt: 20, note: 'mới' });
    const pays = await json(PAYS);
    expect(pays).toHaveLength(1);
    expect(pays[0]).toMatchObject({ amt: 20, note: 'mới', kind: 'repay', lbl: 'Thanh toán bill', bills: ['x', 'y'] });
  });

  it('đồng bộ lỗi sau khi đã lưu → báo syncFailed nhưng khoản trả vẫn được lưu', async () => {
    await seedBills();
    (AsyncStorage.getAllKeys as jest.Mock).mockRejectedValueOnce(new Error('loi doc'));
    const result = await recordPaymentSynced('An', 'bill', 30);
    expect(result.syncFailed).toBe(true);
    expect(await json(PAYS)).toHaveLength(1);
    await syncBillExpenses(); // lần sau tự làm tiếp
    expect((await cbExpenses()).map((e) => e.a)).toEqual([30_000]);
  });
});

describe('bảo toàn dữ liệu', () => {
  it('trường lạ của khoản trả và nexp cũ không bị đọc hay xoá khi ghi liên kết', async () => {
    await seedBills();
    await AsyncStorage.setItem(PAYS, JSON.stringify([{ id: 'p1', createdAt: 1, date: '2025-10-05', note: '', from: 'Tôi', to: 'An', amt: 30, kind: 'billpay', la: 'giữ', nexp: [{ m: '2025-10', id: 'old' }] }, 'mục lạ']));
    await syncBillExpenses();
    const pays = await json(PAYS);
    expect(pays[0]).toMatchObject({ la: 'giữ', nexp: [{ m: '2025-10', id: 'old' }] });
    expect(pays[0].exp).toHaveLength(1);
    expect(pays[1]).toBe('mục lạ');
  });

  it('dữ liệu khoản trả hỏng → từ chối ghi, không đụng dữ liệu', async () => {
    await seedBills();
    await AsyncStorage.setItem(PAYS, '{hong');
    await expect(recordPaymentSynced('An', 'bill', 30)).rejects.toThrow();
    expect(await AsyncStorage.getItem(PAYS)).toBe('{hong');
  });
});
