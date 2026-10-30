import AsyncStorage from '@react-native-async-storage/async-storage';

import { debtEvents, loanLines, personLedger } from '@/domain/ledger';
import { loanLineViews } from '@/domain/loanAllocation';

import { loadBills } from './billRepository';
import { loadPays } from './payRepository';
import { recordPaymentSynced } from './payService';

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật. Tiền: ĐỒNG. Tôi vay An 50.000 (L1) rồi 30.000 (L2).
beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('chiabill:unit', 'vnd');
  await AsyncStorage.setItem(
    'chiabill:v2:pays',
    JSON.stringify([
      { id: 'L1', createdAt: 1, date: '2025-10-01', note: 'Vay xe', from: 'An', to: 'Tôi', amt: 50_000, kind: 'vay' },
      { id: 'L2', createdAt: 2, date: '2025-10-02', note: 'Vay ăn', from: 'An', to: 'Tôi', amt: 30_000, kind: 'vay' },
    ]),
  );
});

describe('trả khoản vay chọn đích danh', () => {
  it('trả đúng L2 thì L2 hết nợ, L1 vẫn nợ nguyên (không dồn vào khoản cũ)', async () => {
    await recordPaymentSynced('An', 'loan', 30_000, 'Trả: Vay ăn', ['L2']);
    const events = debtEvents(await loadBills(), await loadPays());
    const lines = loanLines(events, 'An');
    const views = loanLineViews(lines, personLedger(events, 'An').loan);
    expect(views.filter((v) => v.kind === 'debt').map((v) => [v.line.id, v.state, v.remaining])).toEqual([['L1', 'unpaid', 50_000], ['L2', 'paid', 0]]);
  });

  it('trả thường (không đích danh) thì trừ khoản cũ nhất trước', async () => {
    await recordPaymentSynced('An', 'loan', 30_000);
    const events = debtEvents(await loadBills(), await loadPays());
    const views = loanLineViews(loanLines(events, 'An'), personLedger(events, 'An').loan);
    expect(views.filter((v) => v.kind === 'debt').map((v) => [v.line.id, v.state, v.remaining])).toEqual([['L1', 'partial', 20_000], ['L2', 'unpaid', 30_000]]);
  });
});
