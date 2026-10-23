import AsyncStorage from '@react-native-async-storage/async-storage';

import { createBackupDocument, createBackupText, restoreFromText, wipeSection } from './backupRepository';
import { loadBills } from './billRepository';
import { syncBillExpenses } from './billSync';
import { loadPays } from './payRepository';
import { checkUndoMerge, debtEvents, personLedger } from '@/domain/ledger';
import { createExpense } from './expenseRepository';
import { StorageCorruptError } from './storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng.
const raw = async (key: string) => JSON.parse((await AsyncStorage.getItem(key)) as string);
const put = (key: string, value: unknown) => AsyncStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
const keys = async () => [...(await AsyncStorage.getAllKeys())].sort();
const exp = (over: Record<string, unknown> = {}) => ({ a: 5000, c: 'food', n: 'Phở', d: '2025-10-05', t: 1, ...over });
const fund = { funds: [{ id: 'f', name: 'Quỹ' }], contribs: [{ id: 'c', fundId: 'f', title: 'T', date: '2025-10-05', people: [{ name: 'Bình', amount: 1000 }] }], expenses: [] };

async function seedAll() {
  await AsyncStorage.setItem('chiabill:unit', 'vnd'); // bill / khoản trả mẫu đã ở đơn vị đồng
  await put('sct:settings', { budget: 3_000_000, cats: [] });
  await put('sct:m:2025-10', { x1: exp() });
  await put('sct:m:2025-09', { x2: exp({ d: '2025-09-01' }) });
  await put('quy_nhom_v1', fund);
  await put('chiabill:v2:bills', [{ id: 'b1', title: 'T', date: '2025-10-05', cat: 'food', createdAt: 1, people: [{ name: 'An', paid: 10_000, w: 1 }] }]);
  await put('chiabill:v2:pays', []);
  await put('chiabill:names', ['Tôi', 'An']);
  await put('sotien:people', ['An']);
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('tạo sao lưu', () => {
  it('gom đủ dữ liệu theo định dạng PWA', async () => {
    await seedAll();
    const doc = await createBackupDocument(Date.UTC(2025, 9, 15));
    expect(doc).toMatchObject({ app: 'so-tien', v: 2, people: ['An'], quyNhom: fund });
    expect(Object.keys(doc.chiTieu.months).sort()).toEqual(['2025-09', '2025-10']);
    expect(doc.chiTieu.settings).toEqual({ budget: 3_000_000, cats: [] });
    expect(doc.chiaBill).toMatchObject({ v: 7, unit: 'd', names: ['Tôi', 'An'] });
    expect(doc.chiaBill.bills).toHaveLength(1);
  });

  it('chưa có dữ liệu → file hợp lệ nhưng rỗng; không ghi gì vào bộ nhớ', async () => {
    const doc = await createBackupDocument(0);
    expect(doc).toMatchObject({ people: [], quyNhom: null, chiTieu: { settings: {}, months: {} } });
    expect(await keys()).toEqual([]);
  });

  it('dữ liệu hỏng → ném StorageCorruptError, không tạo file thiếu âm thầm', async () => {
    await seedAll();
    await put('sct:m:2025-10', '{hong');
    await expect(createBackupText()).rejects.toBeInstanceOf(StorageCorruptError);
    await put('sct:m:2025-10', { x1: exp() });
    await put('chiabill:v2:bills', '{"a":1}');
    await expect(createBackupText()).rejects.toBeInstanceOf(StorageCorruptError);
  });
});

describe('khôi phục', () => {
  it('sao lưu rồi khôi phục trên máy trống cho ra đúng dữ liệu ban đầu', async () => {
    await seedAll();
    const text = await createBackupText(1);
    const before = Object.fromEntries(await Promise.all((await keys()).map(async (k) => [k, await AsyncStorage.getItem(k)])));
    await AsyncStorage.clear();
    const result = await restoreFromText(text);
    expect(result).toEqual({ ok: true, sections: ['chi-tieu', 'quy-nhom', 'chia-bill'], message: 'Đã khôi phục: Chi tiêu, Quỹ nhóm, Chia bill' });
    for (const [key, value] of Object.entries(before)) {
      if (key === 'sotien:people') continue; // được bổ sung tên từ dữ liệu sau khi khôi phục (xem dưới)
      if (key === 'chiabill:unit') {
        expect(await AsyncStorage.getItem(key)).toBe('vnd'); // khôi phục đặt dấu hiệu đơn vị đồng cùng lúc
        continue;
      }
      expect(JSON.parse(await AsyncStorage.getItem(key) as string)).toEqual(JSON.parse(value as string));
    }
    expect(await raw('sotien:people')).toEqual(['An', 'Bình']);
    expect(await AsyncStorage.getItem('chiabill:v4:me')).toBe('1');
  });

  it('nội dung sai → trả lỗi và KHÔNG ghi / xoá gì', async () => {
    await seedAll();
    const snapshot = await keys();
    const month = await AsyncStorage.getItem('sct:m:2025-10');
    for (const text of ['{hong', '123', '[{"id":"b"}]', JSON.stringify({ app: 'so-tien' })]) {
      expect((await restoreFromText(text)).ok).toBe(false);
    }
    expect(await keys()).toEqual(snapshot);
    expect(await AsyncStorage.getItem('sct:m:2025-10')).toBe(month);
  });

  it('Chi tiêu trong file THAY thế: tháng cũ không có trong file bị xoá, phần khác giữ nguyên', async () => {
    await seedAll();
    const file = { app: 'so-tien', chiTieu: { settings: { budget: 1 }, months: { '2025-11': { n1: exp({ d: '2025-11-02' }) } } } };
    expect((await restoreFromText(JSON.stringify(file))).ok).toBe(true);
    expect((await keys()).filter((k) => k.startsWith('sct:m:'))).toEqual(['sct:m:2025-11']);
    expect(await raw('sct:settings')).toEqual({ budget: 1 });
    expect(await raw('quy_nhom_v1')).toEqual(fund); // không có trong file → giữ nguyên
    expect(await raw('chiabill:v2:bills')).toHaveLength(1);
  });

  it('file không có cài đặt thì cài đặt cũ bị bỏ (như PWA)', async () => {
    await seedAll();
    await restoreFromText(JSON.stringify({ app: 'so-tien', chiTieu: { months: {} } }));
    expect(await AsyncStorage.getItem('sct:settings')).toBeNull();
    expect((await keys()).some((k) => k.startsWith('sct:m:'))).toBe(false);
  });

  it('sao lưu Quỹ nhóm riêng của app cũ chỉ thay Quỹ', async () => {
    await seedAll();
    const other = { funds: [{ id: 'g', name: 'Mới' }], contribs: [], expenses: [] };
    expect((await restoreFromText(JSON.stringify(other))).ok).toBe(true);
    expect(await raw('quy_nhom_v1')).toEqual(other);
    expect(await raw('sct:m:2025-10')).toEqual({ x1: exp() });
  });

  it('sau khi khôi phục, tên người trong dữ liệu được thêm vào Danh sách người', async () => {
    await put('sotien:people', ['An']);
    await restoreFromText(JSON.stringify({ app: 'so-tien', quyNhom: fund }));
    expect(await raw('sotien:people')).toEqual(['An', 'Bình']);
    await restoreFromText(JSON.stringify({ app: 'so-tien', people: ['Chi'], quyNhom: fund }));
    expect(await raw('sotien:people')).toEqual(['Chi', 'Bình']);
  });

  it('ghi lỗi giữa chừng → trả lại dữ liệu cũ nguyên vẹn', async () => {
    await seedAll();
    const snapshot = Object.fromEntries(await Promise.all((await keys()).map(async (k) => [k, await AsyncStorage.getItem(k)])));
    (AsyncStorage.multiSet as jest.Mock).mockRejectedValueOnce(new Error('day bo nho'));
    const result = await restoreFromText(JSON.stringify({ app: 'so-tien', chiTieu: { months: { '2025-12': { z: exp() } } }, quyNhom: { funds: [], contribs: [], expenses: [] } }));
    expect(result.ok).toBe(false);
    expect(Object.fromEntries(await Promise.all((await keys()).map(async (k) => [k, await AsyncStorage.getItem(k)])))).toEqual(snapshot);
  });

  it('xoá phần cũ lỗi sau khi đã ghi → khôi phục lại đúng giá trị cũ', async () => {
    await seedAll();
    const snapshot = Object.fromEntries(await Promise.all((await keys()).map(async (k) => [k, await AsyncStorage.getItem(k)])));
    (AsyncStorage.multiRemove as jest.Mock).mockRejectedValueOnce(new Error('loi'));
    const result = await restoreFromText(JSON.stringify({ app: 'so-tien', chiTieu: { months: { '2025-12': { z: exp() } } } }));
    expect(result.ok).toBe(false);
    expect(Object.fromEntries(await Promise.all((await keys()).map(async (k) => [k, await AsyncStorage.getItem(k)])))).toEqual(snapshot);
  });
});

describe('xoá dữ liệu', () => {
  it('Chi tiêu: xoá mọi tháng và cài đặt, giữ Quỹ / Chia bill / Danh sách người', async () => {
    await seedAll();
    await wipeSection('chi-tieu');
    expect(await keys()).toEqual(['chiabill:names', 'chiabill:unit', 'chiabill:v2:bills', 'chiabill:v2:pays', 'quy_nhom_v1', 'sotien:people']);
  });

  it('Quỹ nhóm: xoá dữ liệu Quỹ và chỉ khoản chi cá nhân src "quy"; khoản tự nhập và "cb" còn nguyên', async () => {
    await seedAll();
    await createExpense('q1', exp({ src: 'quy', c: 'fund' }));
    await createExpense('c1', exp({ src: 'cb' }));
    await wipeSection('quy-nhom');
    expect(await AsyncStorage.getItem('quy_nhom_v1')).toBeNull();
    const month = await raw('sct:m:2025-10');
    expect(Object.keys(month).sort()).toEqual(['c1', 'x1']);
    expect(await AsyncStorage.getItem('chiabill:v2:bills')).not.toBeNull();
  });

  it('Chia bill: xoá bills, pays, names và khoản chi src "cb"; giữ Quỹ và khoản "quy"', async () => {
    await seedAll();
    await createExpense('q1', exp({ src: 'quy', c: 'fund' }));
    await createExpense('c1', exp({ src: 'cb' }));
    await put('chiabill:v2:bills:nghin-backup', '[]');
    await put('chiabill:v2:pays:nghin-backup', '[]');
    await wipeSection('chia-bill');
    for (const k of ['chiabill:v2:bills', 'chiabill:v2:pays', 'chiabill:names', 'chiabill:v2:bills:nghin-backup', 'chiabill:v2:pays:nghin-backup']) expect(await AsyncStorage.getItem(k)).toBeNull();
    expect(Object.keys(await raw('sct:m:2025-10')).sort()).toEqual(['q1', 'x1']);
    expect(await raw('quy_nhom_v1')).toEqual(fund);
  });

  it('khoản chi cá nhân hỏng khi dọn → dừng và KHÔNG xoá dữ liệu gốc', async () => {
    await seedAll();
    await put('sct:m:2025-10', '{hong');
    await expect(wipeSection('quy-nhom')).rejects.toBeInstanceOf(StorageCorruptError);
    expect(await raw('quy_nhom_v1')).toEqual(fund);
  });
});

// ───────────── Công nợ: khoản trả trong sao lưu / khôi phục / xoá ─────────────

describe('khoản trả (Công nợ)', () => {
  const PAYS = 'chiabill:v2:pays';
  const payExp = { a: 30_000, c: 'food', n: 'Ăn', i: 'Trả An · bill 01/10', d: '2025-10-05', t: 1, src: 'cb' };

  async function seedDebt() {
    await AsyncStorage.setItem('chiabill:unit', 'vnd'); // bill / khoản trả mẫu đã ở đơn vị đồng
    await put('chiabill:v2:bills', [{ id: 'b1', title: 'Ăn', date: '2025-10-01', cat: 'food', createdAt: 1, people: [{ name: 'Tôi', paid: 0, w: 1 }, { name: 'An', paid: 90_000, w: 1 }, { name: 'Bình', paid: 0, w: 1 }] }]);
    await put(PAYS, [
      { id: 'p1', createdAt: 2, date: '2025-10-05', note: '', from: 'Tôi', to: 'An', amt: 30_000, kind: 'billpay', exp: [{ m: '2025-10', id: 'pe' }], la: 'giữ', nexp: [{ m: '2025-10', id: 'cu' }] },
      'mục lạ',
    ]);
    await put('sct:m:2025-10', { pe: payExp, mine: exp(), fund: exp({ src: 'quy', c: 'fund' }) });
  }

  it('sao lưu giữ nguyên khoản trả (trường lạ, exp, nexp, mục lạ) và khôi phục lại đúng từng chữ', async () => {
    await seedDebt();
    const before = await AsyncStorage.getItem(PAYS);
    const text = await createBackupText(1);
    expect((JSON.parse(text) as { chiaBill: { pays: unknown[] } }).chiaBill.pays).toEqual(JSON.parse(before as string));
    await AsyncStorage.clear();
    expect((await restoreFromText(text)).ok).toBe(true);
    expect(await AsyncStorage.getItem(PAYS)).toBe(before);
  });

  it('sau khôi phục, đồng bộ không đổi gì: khoản chi của khoản trả còn nguyên, không tạo trùng', async () => {
    await seedDebt();
    const text = await createBackupText(1);
    await AsyncStorage.clear();
    await restoreFromText(text);
    expect(await syncBillExpenses()).toMatchObject({ added: 0, replaced: 0, unlinked: 0, paysReplaced: 0, paysUnlinked: 0, orphansRemoved: 0 });
    expect(Object.keys(await raw('sct:m:2025-10')).sort()).toEqual(['fund', 'mine', 'pe']);
  });

  it('khôi phục thay thế khoản trả hiện có; file không có pays thì pays thành rỗng', async () => {
    await seedDebt();
    await restoreFromText(JSON.stringify({ app: 'so-tien', chiaBill: { bills: [] } }));
    expect(await raw(PAYS)).toEqual([]);
    await restoreFromText(JSON.stringify({ app: 'so-tien', chiaBill: { bills: [], pays: 'sai' } }));
    expect(await raw(PAYS)).toEqual([]);
  });

  it('xoá Chia bill: xoá bills, pays, names và MỌI khoản chi cb (cả của khoản trả); khoản tự nhập và "quy" giữ nguyên', async () => {
    await seedDebt();
    await wipeSection('chia-bill');
    for (const k of ['chiabill:v2:bills', PAYS, 'chiabill:names']) expect(await AsyncStorage.getItem(k)).toBeNull();
    expect(Object.keys(await raw('sct:m:2025-10')).sort()).toEqual(['fund', 'mine']);
  });

  it('xoá Chi tiêu rồi đồng bộ: khoản chi của khoản trả được tạo lại từ dữ liệu Công nợ, khoản tự nhập mất như đã xoá', async () => {
    await seedDebt();
    await wipeSection('chi-tieu');
    expect(await syncBillExpenses()).toMatchObject({ paysReplaced: 1 });
    const month = await raw('sct:m:2025-10');
    expect(Object.values(month)).toHaveLength(1);
    expect(Object.values(month)[0]).toMatchObject({ a: 30_000, src: 'cb', i: 'Trả An · bill 01/10' });
  });

  it('gộp nợ (nhóm bt) và khoản "Trả dư": sao lưu → khôi phục giữ nguyên từng chữ, số dư và khả năng hoàn tác không đổi', async () => {
    await AsyncStorage.setItem('chiabill:unit', 'vnd');
    await put('chiabill:v2:bills', [{ id: 'b1', title: 'Ăn', date: '2025-10-01', cat: 'food', createdAt: 1, people: [{ name: 'Tôi', paid: 0, w: 1 }, { name: 'An', paid: 60_000, w: 1 }] }]); // tôi nợ An 30.000 (bill)
    await put(PAYS, [
      { id: 'l1', createdAt: 2, date: '2025-10-02', note: '', from: 'Tôi', to: 'An', amt: 50_000, kind: 'vay', zz: 1 },
      { id: 'm1', createdAt: 20, date: '2025-10-05', note: '', from: 'An', to: 'Tôi', amt: 30_000, kind: 'bt', led: 'loan', grp: 'g1' },
      { id: 'm2', createdAt: 21, date: '2025-10-05', note: '', from: 'Tôi', to: 'An', amt: 30_000, kind: 'bt', led: 'bill', grp: 'g1' },
      { id: 'd1', createdAt: 30, date: '2025-10-06', note: 'Trả dư', from: 'Tôi', to: 'An', amt: 20_000, kind: 'vay' },
    ]);
    const state = async () => {
      const [bills, pays] = [await loadBills(), await loadPays()];
      return { ledger: personLedger(debtEvents(bills, pays), 'An'), undoG1: checkUndoMerge(bills, pays, 'g1') };
    };
    const before = await AsyncStorage.getItem(PAYS);
    const stateBefore = await state();
    const text = await createBackupText(1);
    await AsyncStorage.clear();
    expect((await restoreFromText(text)).ok).toBe(true);
    expect(await AsyncStorage.getItem(PAYS)).toBe(before);
    expect(await state()).toEqual(stateBefore);
    expect(stateBefore.undoG1.ok).toBe(false); // đã có khoản "Trả dư" sau lần gộp
    // Bản sao lưu này chưa có khoản chi cá nhân: lần đồng bộ đầu tạo "Bù trừ nợ" của lần gộp (một khoản), lần sau không đổi gì.
    expect(await syncBillExpenses()).toMatchObject({ paysReplaced: 1, orphansRemoved: 0 });
    expect(await syncBillExpenses()).toMatchObject({ added: 0, replaced: 0, paysReplaced: 0, paysUnlinked: 0, orphansRemoved: 0 });
    expect(Object.values(await raw('sct:m:2025-10'))).toHaveLength(1);
  });

  it('khoản trả hỏng → không tạo sao lưu thiếu', async () => {
    await seedDebt();
    await put(PAYS, '{"a":1}');
    await expect(createBackupText()).rejects.toBeInstanceOf(StorageCorruptError);
  });
});
