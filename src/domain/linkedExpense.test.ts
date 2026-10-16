import { BILL_LINKED_MESSAGE, linkedExpenseNotice } from './linkedExpense';

describe('linkedExpenseNotice', () => {
  it('khoản từ Quỹ và từ Chia bill/khoản trả bị khoá, kèm lời giải thích', () => {
    expect(linkedExpenseNotice({ src: 'quy' })).toBe('Khoản này được tạo từ Quỹ, vui lòng sửa tại Quỹ');
    expect(linkedExpenseNotice({ src: 'cb' })).toBe(BILL_LINKED_MESSAGE);
  });

  it('khoản tự nhập (không có src hoặc src lạ) được sửa/xoá tự do', () => {
    expect(linkedExpenseNotice({})).toBeNull();
    expect(linkedExpenseNotice({ src: undefined })).toBeNull();
    expect(linkedExpenseNotice({ src: 'khac' })).toBeNull();
  });
});
