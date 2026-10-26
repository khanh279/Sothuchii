import '@/i18n/en';
import { part1 } from '@/i18n/en/part1';
import { part2 } from '@/i18n/en/part2';
import { part3 } from '@/i18n/en/part3';
import { part4 } from '@/i18n/en/part4';
import { part5 } from '@/i18n/en/part5';
import { englishSize, translate, translateNode } from '@/i18n/translate';

describe('translate', () => {
  it('tiếng Việt trả nguyên chuỗi', () => {
    expect(translate('Tổng quan', 'vi')).toBe('Tổng quan');
    expect(translate('Chuỗi chưa có bản dịch', 'en')).toBe('Chuỗi chưa có bản dịch');
  });

  it('khớp nguyên chuỗi và giữ khoảng trắng đầu / cuối', () => {
    expect(translate('Tổng quan', 'en')).toBe('Overview');
    expect(translate(' Quỹ nhóm ', 'en')).toBe(' Group funds ');
  });

  it('chuỗi có chỗ điền: điền lại giá trị, dịch tiếp giá trị bên trong và chọn số ít / số nhiều', () => {
    expect(translate('Tôi nợ An', 'en')).toBe('I owe An');
    expect(translate('Tôi nợ Tôi', 'en')).toBe('I owe Me');
    expect(translate('3 người', 'en')).toBe('3 people');
    expect(translate('1 người', 'en')).toBe('1 person');
    expect(translate('Đã thêm (1 người)', 'en')).toBe('Added (1 person)');
    expect(translate('Chia bill 120.000 ₫ · 2 người', 'en')).toBe('Split bill 120.000 ₫ · 2 people');
  });

  it('tháng được đổi thành tên tháng tiếng Anh', () => {
    expect(translate('Tháng 10, 2026', 'en')).toBe('October 2026');
    expect(translate('Đã chi trong tháng 3', 'en')).toBe('Spent in March');
  });

  it('chuỗi nhiều dòng và nhiều đoạn " · " được dịch từng phần', () => {
    expect(translate('Quỹ chi: 10 ₫\nCá nhân ứng (An): 5 ₫', 'en')).toBe('Fund pays: 10 ₫\nMember advances (An): 5 ₫');
    expect(translate('Quỹ nhóm · Tổng quan', 'en')).toBe('Group funds · Overview');
  });

  it('tên người và nội dung do người dùng nhập không bị đổi', () => {
    expect(translate('Phở sáng', 'en')).toBe('Phở sáng');
    expect(translate('Nợ An', 'en')).toBe('Nợ An');
  });

  it('translateNode: mảng chuỗi / số được nối lại rồi dịch một lần; phần tử giữ nguyên chỗ', () => {
    expect(translateNode(['Đã thêm ', 3, ' người'], 'en')).toBe('Added 3 people');
    const element = { type: 'x' };
    expect(translateNode(['Còn ', 5, ' ngày · mỗi ngày chi được khoảng', ' ', element], 'en')).toEqual(['5 days left · you can spend about ', element]);
    expect(translateNode(['Tổng quan'], 'vi')).toEqual(['Tổng quan']);
  });
});

describe('bản dịch tiếng Anh', () => {
  const all = { ...part1, ...part2, ...part3, ...part4, ...part5 };

  it('mỗi bản dịch dùng đúng các chỗ điền {n} của khoá (không thiếu, không thừa)', () => {
    const placeholders = (text: string) => [...new Set([...text.matchAll(/\{(\d+)/g)].map((match) => match[1]))].sort();
    for (const [key, value] of Object.entries(all)) {
      expect({ key, placeholders: placeholders(value) }).toEqual({ key, placeholders: placeholders(key) });
    }
  });

  it('không có bản dịch rỗng và đã đăng ký đủ khoá', () => {
    expect(Object.values(all).every((value) => value.trim().length > 0)).toBe(true);
    expect(englishSize()).toBe(Object.keys(all).length);
  });
});
