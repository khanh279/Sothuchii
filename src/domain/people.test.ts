import { addPerson, cleanPersonName, mergePeople, normalizePeople, pickerOptions, removePerson, seedNamesFrom } from './people';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng.
describe('chuẩn hoá tên và danh sách', () => {
  it('gộp khoảng trắng, cắt 30 ký tự, nhận giá trị lạ', () => {
    expect(cleanPersonName('  An   Bình ')).toBe('An Bình');
    expect(cleanPersonName('x'.repeat(40))).toHaveLength(30);
    expect(cleanPersonName(null)).toBe('');
    expect(cleanPersonName(undefined)).toBe('');
    expect(cleanPersonName(12)).toBe('12');
  });

  it('bỏ trống, bỏ "Tôi", bỏ trùng không phân biệt hoa thường (giữ bản đầu)', () => {
    expect(normalizePeople(['An', ' an ', 'Bình', '', 'Tôi', 'tôi', 'AN', 7, null])).toEqual(['An', 'Bình', 'tôi', '7']);
  });

  it('không phải mảng → danh sách rỗng', () => {
    expect(normalizePeople(undefined)).toEqual([]);
    expect(normalizePeople('An')).toEqual([]);
    expect(normalizePeople({})).toEqual([]);
  });
});

describe('thêm / bỏ', () => {
  it('thêm mới, trùng thì dùng lại tên đã có, "Tôi" luôn có sẵn, trống bị bỏ qua', () => {
    expect(addPerson(['An'], ' Bình ')).toEqual({ status: 'added', name: 'Bình', people: ['An', 'Bình'] });
    expect(addPerson(['An'], 'aN')).toEqual({ status: 'exists', name: 'An', people: ['An'] });
    expect(addPerson(['An'], 'TÔI')).toEqual({ status: 'me' });
    expect(addPerson(['An'], '   ')).toEqual({ status: 'empty' });
  });

  it('không sửa mảng đầu vào', () => {
    const list = ['An'];
    addPerson(list, 'B');
    removePerson(list, 'An');
    mergePeople(list, ['C']);
    expect(list).toEqual(['An']);
  });

  it('bỏ đúng tên được chọn', () => {
    expect(removePerson(['An', 'Bình'], 'An')).toEqual(['Bình']);
    expect(removePerson(['An'], 'an')).toEqual(['An']);
  });

  it('gộp tên mới vào danh sách, không trùng', () => {
    expect(mergePeople(['An'], ['an', 'Bình', 'BÌNH', 'Chi'])).toEqual(['An', 'Bình', 'Chi']);
  });
});

describe('tạo danh sách lần đầu từ dữ liệu cũ', () => {
  it('bỏ "Tôi", "Người N" và chữ A–T đơn lẻ; giữ tên thật', () => {
    expect(seedNamesFrom(['Tôi', 'Người 2', 'A', 'T', 'U', 'An', '  Bình  ', '', 'Người X'])).toEqual(['U', 'An', 'Bình', 'Người X']);
  });
});

describe('bộ chọn một người', () => {
  it('"Tôi" đứng đầu, rồi danh sách, rồi tên đang chọn nếu chưa có', () => {
    expect(pickerOptions(['An', 'Bình'], null)).toEqual(['Tôi', 'An', 'Bình']);
    expect(pickerOptions(['An'], 'Chi')).toEqual(['Tôi', 'An', 'Chi']);
    expect(pickerOptions(['An'], 'An')).toEqual(['Tôi', 'An']);
    expect(pickerOptions([], 'Tôi')).toEqual(['Tôi']);
    expect(pickerOptions([], '  ')).toEqual(['Tôi']);
  });
});
