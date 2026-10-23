import { formatNote } from './note';

describe('formatNote', () => {
  it('tách nội dung ghép bằng dấu chấm giữa thành các dòng và viết hoa đầu mỗi dòng', () => {
    expect(formatNote('chi tiêu · ăn uống')).toBe('Chi tiêu\nĂn uống');
    expect(formatNote('Quỹ lớp · cá nhân ứng')).toBe('Quỹ lớp\nCá nhân ứng');
    expect(formatNote('a · b · c')).toBe('A\nB\nC');
  });

  it('giữ dòng xuống sẵn có, cũng viết hoa đầu dòng', () => {
    expect(formatNote('quỹ chi: 100.000 ₫\ncá nhân ứng (An): 50.000 ₫')).toBe('Quỹ chi: 100.000 ₫\nCá nhân ứng (An): 50.000 ₫');
    expect(formatNote('Chia bill 05/10 · 2 người\ntrả trước 10.000 ₫')).toBe('Chia bill 05/10\n2 người\nTrả trước 10.000 ₫');
  });

  it('số có dấu chấm ngăn nghìn không bị tách; chuỗi rỗng giữ rỗng; bỏ dòng trống', () => {
    expect(formatNote('1.000.000 ₫')).toBe('1.000.000 ₫');
    expect(formatNote('')).toBe('');
    expect(formatNote('a ·  · b')).toBe('A\nB');
  });
});
