import AsyncStorage from '@react-native-async-storage/async-storage';

import { syncBillExpenses } from './billSync';
import { createExpense } from './expenseRepository';
import { loadPays } from './payRepository';
import {
  addTransferSynced,
  deletePaySynced,
  mergeDebtsSynced,
  recordPairPaymentSynced,
  recordPaymentSynced,
  undoMergeSynced,
  updatePayGroupSynced,
  updateTransferSynced,
} from './payService';
import { loadBills } from './billRepository';
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
