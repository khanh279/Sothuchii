import type { Pay } from '@/types/pay';

import { buildPayHistory } from './payForm';
import { payLinkLabel, payLinkedExpenses, payRowType } from './expenseTab';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Khoản trả: NGHÌN đồng.
const pay = (id: string, from: string, to: string, amt: number, over: Partial<Pay> = {}): Pay => ({ id, createdAt: 10, date: '2025-10-05', note: '', from, to, amt, kind: 'vay', ...over });
const history = (pays: Pay[]) => buildPayHistory(pays, [], { mode: 'all' });

describe('loại khoản trả', () => {
  it('nhóm trả bill giữa hai người khác "Tôi" là trả bill', () => {
    const days = history([pay('g1', 'An', 'Bình', 10, { kind: 'billpay' }), pay('g2', 'An', 'Bình', 20, { kind: 'billpay' })]).days;
    expect(days[0].rows).toHaveLength(1);
    expect(days[0].rows[0].group).toBe(true);
    expect(payRowType(days[0].rows[0])).toBe('bill');
  });
});

describe('liên kết', () => {

  it('khoản trả chỉ có nhãn khi pay.exp có căn cứ, không suy diễn theo nội dung', () => {
    const linked = history([pay('p', 'Tôi', 'An', 30, { kind: 'billpay', exp: [{ m: '2025-10', id: 'e1' }] })]).days[0].rows[0];
    const plain = history([pay('q', 'Tôi', 'An', 30, { kind: 'billpay' })]).days[0].rows[0];
    expect(payLinkedExpenses(linked)).toEqual([{ m: '2025-10', id: 'e1' }]);
    expect(payLinkLabel(linked)).toBe('Đã tính vào chi tiêu');
    expect(payLinkedExpenses(plain)).toEqual([]);
    expect(payLinkLabel(plain)).toBeNull();
  });
});
