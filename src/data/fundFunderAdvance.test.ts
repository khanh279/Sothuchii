import AsyncStorage from '@react-native-async-storage/async-storage';

import { fundPosition } from '@/domain/fundAdvance';

import { createAdvance, FundInputError, loadFundData, refundAdvancesForPerson, saveFundTxn } from './fundRepository';

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền là ĐỒNG. Quỹ hết tiền (chưa có khoản đóng nào).
beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('quy_nhom_v1', JSON.stringify({ funds: [{ id: 'f1', name: 'Quỹ' }], contribs: [], expenses: [], advances: [], fundTxns: [], cur: 'f1' }));
});

describe('giao ứng do cá nhân ứng tiền túi (quỹ hết tiền)', () => {
  it('ghi được dù quỹ hết tiền; quỹ nợ người ứng, người nhận giữ tiền; trùng người bị từ chối', async () => {
    const base = { fundId: 'f1', person: 'Bình', title: '', date: '2025-10-03', amount: 100_000 };
    await expect(createAdvance({ ...base, funder: 'Bình' })).rejects.toBeInstanceOf(FundInputError);
    await expect(createAdvance(base)).rejects.toBeInstanceOf(FundInputError); // không có người ứng thì vẫn bị chặn vì quỹ hết tiền
    const id = await createAdvance({ ...base, funder: 'An' });
    const data = await loadFundData();
    expect(data.advances).toMatchObject([{ id, person: 'Bình', funder: 'An', amount: 100_000 }]);
    expect(fundPosition(data, 'f1')).toMatchObject({ cash: 0, owed: 100_000, held: 100_000 });
  });

  it('hoàn hết cho quỹ không xoá hồ sơ; quỹ trả được An sau khi có tiền hoàn, ghi đúng người nhận', async () => {
    const id = await createAdvance({ fundId: 'f1', person: 'Bình', title: '', date: '2025-10-03', amount: 100_000, funder: 'An' });
    await expect(saveFundTxn({ kind: 'payout', advanceId: id, toFunder: true, amount: 10_000, date: '2025-10-04' })).rejects.toBeInstanceOf(FundInputError); // quỹ chưa có tiền
    await refundAdvancesForPerson({ fundId: 'f1', person: 'Bình', amount: 100_000, date: '2025-10-04' });
    expect((await loadFundData()).advances).toHaveLength(1);
    await saveFundTxn({ kind: 'payout', advanceId: id, toFunder: true, amount: 100_000, date: '2025-10-05' });
    const data = await loadFundData();
    expect(data.txns?.find((t) => t.kind === 'payout')).toMatchObject({ person: 'An', amount: 100_000, advanceId: id });
    expect(fundPosition(data, 'f1')).toMatchObject({ cash: 0, owed: 0, held: 0 });
  });
});
