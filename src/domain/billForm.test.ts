import { computeSplit } from './bills';
import { applyMemberSelection, emptyPerson, initialPeople, maskFixedInput, maskWeightInput, parseFixedText, parseWeightText, resetAfterSave, rowStatus, toSplitPeople, withFixedText, withWeightText } from './billForm';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng. Tiền là ĐỒNG.
describe('ô nhập', () => {

  it('hệ số: chữ số và phẩy, chấm thành phẩy, tối đa 4 ký tự', () => {
    expect(maskWeightInput('1.5')).toBe('1,5');
    expect(maskWeightInput('a2b')).toBe('2');
    expect(maskWeightInput('12345')).toBe('1234');
    expect(parseWeightText('1,5')).toBe(1.5);
    expect(parseWeightText('')).toBe(1);
    expect(parseWeightText(',')).toBe(1);
    expect(parseWeightText('0')).toBe(0);
  });

  it('mức cố định: chỉ chữ số (ĐỒNG), tối đa 9 chữ số; đọc ra đúng số đồng (không nhân thêm)', () => {
    expect(maskFixedInput('1234567890')).toBe('123456789');
    expect(maskFixedInput('30.000')).toBe('30000');
    expect(parseFixedText('')).toBeUndefined();
    expect(parseFixedText('30000')).toBe(30_000);
    expect(parseFixedText('1.234')).toBe(1234);
    expect(parseFixedText('0')).toBe(0);
  });

  it('gõ hệ số thì bỏ mức cố định; gõ mức cố định thì bỏ hệ số; xoá mức cố định thì giữ hệ số đang có', () => {
    const base = { ...emptyPerson('An'), weightText: '2', fixedText: '' };
    expect(withFixedText(base, '30000')).toMatchObject({ fixedText: '30000', weightText: '' });
    expect(withWeightText({ ...base, fixedText: '30000', weightText: '' }, '3')).toMatchObject({ weightText: '3', fixedText: '' });
    expect(withFixedText(base, '')).toMatchObject({ fixedText: '', weightText: '2' });
  });
});

describe('toSplitPeople', () => {
  it('người đầu luôn là "Tôi"; tên trống dùng chữ cái theo dòng; tiền là đồng', () => {
    const people = toSplitPeople([
      { ...emptyPerson('gì đó'), paidText: '100000' },
      { ...emptyPerson(''), paidText: '' },
      { ...emptyPerson(' Chi '), paidText: '5000' },
      emptyPerson(''),
    ]);
    expect(people.map((p) => p.name)).toEqual(['Tôi', 'B', 'Chi', 'D']);
    expect(people.map((p) => p.paid)).toEqual([100_000, 0, 5000, 0]);
  });

  it('hệ số và mức cố định đi vào phép chia đúng như PWA', () => {
    const rows = [
      { ...emptyPerson(), paidText: '120000', weightText: '2' },
      { ...emptyPerson('B'), fixedText: '30000' },
      { ...emptyPerson('C'), weightText: '1' },
    ];
    const split = computeSplit(toSplitPeople(rows));
    expect(split.sumFix).toBe(30_000);
    expect(split.rows.map((r) => r.share)).toEqual([60_000, 30_000, 30_000]); // (120-30) chia theo hệ số 2:1
  });

  it('mức cố định 0 là hợp lệ; ô trống thì không cố định', () => {
    expect(toSplitPeople([emptyPerson(), { ...emptyPerson('B'), fixedText: '0' }])[1].fix).toBe(0);
    expect(toSplitPeople([emptyPerson(), emptyPerson('B')])[1].fix).toBeUndefined();
  });
});

describe('số người và danh sách ban đầu', () => {

  it('nhóm ban đầu: "Tôi" + người nhớ từ lần trước mà còn trong Danh sách người, bỏ trùng', () => {
    const rows = initialPeople(['Tôi', 'An', 'Bình', 'An', 'Đã xoá', ''], ['An', 'Bình', 'Chi']);
    expect(rows.map((r) => r.name)).toEqual(['Tôi', 'An', 'Bình']);
    expect(initialPeople([], []).map((r) => r.name)).toEqual(['Tôi']);
  });
});

describe('hiển thị kết quả', () => {

  it('trạng thái: nhận lại / còn thiếu / đã đủ, làm tròn đến đồng', () => {
    expect(rowStatus({ net: 66_667.4 })).toEqual({ kind: 'get', amount: 66_667 });
    expect(rowStatus({ net: -33_333.3 })).toEqual({ kind: 'owe', amount: 33_333 });
    expect(rowStatus({ net: 0.4 })).toEqual({ kind: 'even', amount: 0 });
  });
});

describe('chọn thành viên và đặt lại sau khi lưu', () => {
  const rows = [
    { ...emptyPerson('Tôi'), paidText: '100' },
    { ...emptyPerson('An'), paidText: '5', weightText: '2' },
    emptyPerson(''),
  ];

  it('giữ dữ liệu "Tôi" và người đã có; người mới là dòng trống; thứ tự theo lựa chọn', () => {
    const next = applyMemberSelection(rows, ['Tôi', 'Bình', 'An']);
    expect(next.map((r) => r.name)).toEqual(['Tôi', 'Bình', 'An']);
    expect(next[0].paidText).toBe('100');
    expect(next[1]).toEqual(emptyPerson('Bình'));
    expect(next[2]).toMatchObject({ paidText: '5', weightText: '2' });
  });

  it('bỏ chọn hết người khác thì còn mình "Tôi"; tên trùng và "Tôi" lặp bị bỏ', () => {
    expect(applyMemberSelection(rows, []).map((r) => r.name)).toEqual(['Tôi']);
    expect(applyMemberSelection(rows, ['An', 'An', 'Tôi']).map((r) => r.name)).toEqual(['Tôi', 'An']);
  });

  it('không sửa đầu vào', () => {
    const copy = JSON.parse(JSON.stringify(rows));
    applyMemberSelection(rows, ['Chi']);
    resetAfterSave(rows);
    expect(rows).toEqual(copy);
  });

  it('sau khi lưu: xoá tiền, hệ số, mức cố định; giữ tên', () => {
    expect(resetAfterSave(rows)).toEqual([emptyPerson('Tôi'), emptyPerson('An'), emptyPerson('')]);
  });
});

describe('ô "Đã chi" nhập bằng đồng, lưu bằng đồng', () => {
  it('chữ có hoặc không có chấm hàng nghìn đều đọc đúng ra đồng', () => {
    const rows = [{ ...emptyPerson('Tôi'), paidText: '1.200.000' }, { ...emptyPerson('An'), paidText: '1500' }, { ...emptyPerson('Bình'), paidText: '' }];
    expect(toSplitPeople(rows).map((p) => p.paid)).toEqual([1_200_000, 1500, 0]);
  });
});
