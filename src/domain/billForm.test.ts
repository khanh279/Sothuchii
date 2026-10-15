import { computeSplit } from './bills';
import {
  clampBillPeople,
  emptyPerson,
  formatMoney,
  formatPaidText,
  initialPeople,
  maskFixedInput,
  maskPaidInput,
  maskWeightInput,
  parseFixedText,
  parseWeightText,
  resizePeople,
  rowMeta,
  rowStatus,
  toSplitPeople,
  weightCaption,
  withFixedText,
  withWeightText,
} from './billForm';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền là NGHÌN đồng.
describe('ô nhập', () => {
  it('"Đã chi": chỉ chữ số, tối đa 9; hiển thị có dấu chấm hàng nghìn', () => {
    expect(maskPaidInput('1a2.3,4')).toBe('1234');
    expect(maskPaidInput('1234567890')).toBe('123456789');
    expect(formatPaidText('1234567')).toBe('1.234.567');
    expect(formatPaidText('007')).toBe('7');
    expect(formatPaidText('')).toBe('');
  });

  it('hệ số: chữ số và phẩy, chấm thành phẩy, tối đa 4 ký tự', () => {
    expect(maskWeightInput('1.5')).toBe('1,5');
    expect(maskWeightInput('a2b')).toBe('2');
    expect(maskWeightInput('12345')).toBe('1234');
    expect(parseWeightText('1,5')).toBe(1.5);
    expect(parseWeightText('')).toBe(1);
    expect(parseWeightText(',')).toBe(1);
    expect(parseWeightText('0')).toBe(0);
  });

  it('mức cố định: kiểu nghìn đồng, phần nguyên tối đa 7 chữ số; đọc ra NGHÌN đồng (không nhân 1000)', () => {
    expect(maskFixedInput('123456789')).toBe('1.234.567');
    expect(parseFixedText('')).toBeUndefined();
    expect(parseFixedText('30')).toBe(30);
    expect(parseFixedText('1.234,5')).toBe(1234.5);
    expect(parseFixedText('0')).toBe(0);
  });

  it('gõ hệ số thì bỏ mức cố định; gõ mức cố định thì bỏ hệ số; xoá mức cố định thì giữ hệ số đang có', () => {
    const base = { ...emptyPerson('An'), weightText: '2', fixedText: '' };
    expect(withFixedText(base, '30')).toMatchObject({ fixedText: '30', weightText: '' });
    expect(withWeightText({ ...base, fixedText: '30', weightText: '' }, '3')).toMatchObject({ weightText: '3', fixedText: '' });
    expect(withFixedText(base, '')).toMatchObject({ fixedText: '', weightText: '2' });
  });
});

describe('toSplitPeople', () => {
  it('người đầu luôn là "Tôi"; tên trống dùng chữ cái theo dòng; tiền là nghìn đồng', () => {
    const people = toSplitPeople([
      { ...emptyPerson('gì đó'), paidText: '100' },
      { ...emptyPerson(''), paidText: '' },
      { ...emptyPerson(' Chi '), paidText: '5' },
      emptyPerson(''),
    ]);
    expect(people.map((p) => p.name)).toEqual(['Tôi', 'B', 'Chi', 'D']);
    expect(people.map((p) => p.paid)).toEqual([100, 0, 5, 0]);
  });

  it('hệ số và mức cố định đi vào phép chia đúng như PWA', () => {
    const rows = [
      { ...emptyPerson(), paidText: '120', weightText: '2' },
      { ...emptyPerson('B'), fixedText: '30' },
      { ...emptyPerson('C'), weightText: '1' },
    ];
    const split = computeSplit(toSplitPeople(rows));
    expect(split.sumFix).toBe(30);
    expect(split.rows.map((r) => r.share)).toEqual([60, 30, 30]); // (120-30) chia theo hệ số 2:1
  });

  it('mức cố định 0 là hợp lệ; ô trống thì không cố định', () => {
    expect(toSplitPeople([emptyPerson(), { ...emptyPerson('B'), fixedText: '0' }])[1].fix).toBe(0);
    expect(toSplitPeople([emptyPerson(), emptyPerson('B')])[1].fix).toBeUndefined();
  });
});

describe('số người và danh sách ban đầu', () => {
  it('bộ đếm 2–20', () => {
    expect([0, 1, 2, 7, 20, 21, NaN].map(clampBillPeople)).toEqual([2, 2, 2, 7, 20, 20, 2]);
  });

  it('đổi số dòng giữ dữ liệu dòng còn lại; dòng đầu luôn là "Tôi"', () => {
    const rows = [emptyPerson('Tôi'), { ...emptyPerson('An'), paidText: '9' }];
    const more = resizePeople(rows, 4);
    expect(more).toHaveLength(4);
    expect(more[1].paidText).toBe('9');
    expect(resizePeople(more, 2)).toEqual(rows);
    expect(resizePeople([], 2)[0].name).toBe('Tôi');
    expect(resizePeople(rows, 99)).toHaveLength(20);
  });

  it('nhóm ban đầu: "Tôi" + người nhớ từ lần trước mà còn trong Danh sách người, bỏ trùng', () => {
    const rows = initialPeople(['Tôi', 'An', 'Bình', 'An', 'Đã xoá', ''], ['An', 'Bình', 'Chi']);
    expect(rows.map((r) => r.name)).toEqual(['Tôi', 'An', 'Bình']);
    expect(initialPeople([], []).map((r) => r.name)).toEqual(['Tôi']);
  });
});

describe('hiển thị kết quả', () => {
  it('chú thích dưới ô tiền', () => {
    expect(weightCaption({ w: 1 })).toBe('');
    expect(weightCaption({ w: 1.5 })).toBe('Hệ số 1,5');
    expect(weightCaption({ w: 1, fix: 30 })).toBe('Cố định 30.000 ₫');
    expect(weightCaption({ w: 3, fix: 0 })).toBe('Cố định 0 ₫');
  });

  it('trạng thái: nhận lại / còn thiếu / đã đủ, làm tròn đến đồng', () => {
    expect(rowStatus({ net: 66.667 })).toEqual({ kind: 'get', amount: 66_667 });
    expect(rowStatus({ net: -33.3333 })).toEqual({ kind: 'owe', amount: 33_333 });
    expect(rowStatus({ net: 0.0004 })).toEqual({ kind: 'even', amount: 0 });
  });

  it('dòng mô tả', () => {
    expect(rowMeta({ paid: 100, share: 33.333, fixed: false, w: 1 })).toBe('Chi 100.000 ₫ · Phần 33.333 ₫');
    expect(rowMeta({ paid: 0, share: 30, fixed: true, w: 1 })).toBe('Chi 0 ₫ · Phần 30.000 ₫ · Cố định');
    expect(rowMeta({ paid: 0, share: 60, fixed: false, w: 2 })).toBe('Chi 0 ₫ · Phần 60.000 ₫ · Hệ số 2');
    expect(formatMoney(1.5)).toBe('1.500 ₫');
  });
});
