import { billShareFromHash, billShareUrl, decodeBillShare, encodeBillShare, type SharedBill } from './billShare';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật. Tiền: ĐỒNG.
const bill: SharedBill = { title: 'Ăn tối & cà phê', date: '2025-10-05', people: [{ name: 'Tôi', paid: 120_000 }, { name: 'An', paid: 0, w: 2 }, { name: 'Bình', paid: 0, fix: 30_000 }] };

describe('liên kết xem bill', () => {
  it('mã hoá rồi đọc lại đúng nội dung (kể cả tiếng Việt, ký tự đặc biệt, hệ số và mức cố định)', () => {
    expect(decodeBillShare(encodeBillShare(bill))).toEqual(bill);
  });

  it('địa chỉ có dạng /xem-bill#b=…; lấy lại dữ liệu từ hash', () => {
    const url = billShareUrl('https://x.github.io/app/', bill);
    expect(url.startsWith('https://x.github.io/app/xem-bill#b=')).toBe(true);
    const hash = url.slice(url.indexOf('#'));
    expect(decodeBillShare(billShareFromHash(hash))).toEqual(bill);
    expect(billShareFromHash('#x=1')).toBe('');
  });

  it('dữ liệu hỏng / sai dạng / quá dài / không có người thì trả null, không ném lỗi', () => {
    expect(decodeBillShare('')).toBeNull();
    expect(decodeBillShare('%7Bkhong-phai-json')).toBeNull();
    expect(decodeBillShare(encodeURIComponent(JSON.stringify({ v: 2, t: 'x', d: '2025-10-05', p: [['A', 1, 1, null]] })))).toBeNull();
    expect(decodeBillShare(encodeURIComponent(JSON.stringify({ v: 1, t: 'x', d: 'hôm nay', p: [['A', 1, 1, null]] })))).toBeNull();
    expect(decodeBillShare(encodeURIComponent(JSON.stringify({ v: 1, t: 'x', d: '2025-10-05', p: [] })))).toBeNull();
    expect(decodeBillShare(encodeURIComponent(JSON.stringify({ v: 1, t: 'x', d: '2025-10-05', p: [['A', -5, 1, null]] })))).toBeNull();
    expect(decodeBillShare('a'.repeat(7000))).toBeNull();
  });
});
