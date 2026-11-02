/**
 * Quy tắc của hai form Quỹ nhóm (đóng quỹ và chi quỹ), hàm thuần. Chuyển từ `mod-b` của PWA.
 * Số tiền trong file này luôn là ĐỒNG; việc đổi từ chữ trong ô nhập do `money.ts` lo.
 */

import { DEFAULT_CONTRIBUTION_TITLE } from '@/domain/funds';
import type { Contribution, ContributionPerson } from '@/types/fund';
import type { Vnd } from '@/types/money';

export const MAX_PEOPLE = 1000;
export const PERSON_NAME_MAX = 30;
export const FUND_TITLE_MAX = 80;
export const DEFAULT_PERSON_PREFIX = 'Người';

/** Một dòng người đóng trong form. `name` trống nghĩa là chưa đặt tên. */
export interface PersonRow {
  name: string;
  amount: Vnd;
}/** Tổng tiền và số người có số tiền > 0 (dòng "Tổng (n người)"). */
export function contributionSummary(rows: readonly PersonRow[]): { total: Vnd; payers: number } {
  return {
    total: rows.reduce((sum, row) => sum + row.amount, 0),
    payers: rows.filter((row) => row.amount > 0).length,
  };
}

/** Dựng dòng của form từ một lần đóng đã lưu; `all` bật khi mọi người cùng số tiền. */
export function rowsFromContribution(contribution: Pick<Contribution, 'people'>): { rows: PersonRow[]; all: boolean; each: Vnd } {
  const rows = contribution.people.map((person) => ({ name: person.name, amount: person.amount }));
  const all = rows.length > 0 && rows.every((row) => row.amount === rows[0].amount);
  return { rows, all, each: all ? rows[0].amount : 0 };
}

/**
 * Danh sách người sẽ lưu: chỉ người có số tiền > 0; tên bỏ khoảng trắng hai đầu,
 * để trống thì đặt "Người N" theo số thứ tự dòng (đếm cả dòng bị bỏ, như PWA).
 * Tên "Tôi" (đúng chữ) là phần của chính người dùng và sẽ được đồng bộ sang chi tiêu cá nhân.
 */
export function buildContributionPeople(rows: readonly PersonRow[]): ContributionPerson[] {
  const people: ContributionPerson[] = [];
  rows.forEach((row, index) => {
    if (row.amount > 0) people.push({ name: row.name.trim() || `${DEFAULT_PERSON_PREFIX} ${index + 1}`, amount: row.amount });
  });
  return people;
}

export interface ContributionDraft {
  date: string;
  fundId: string;
  people: readonly ContributionPerson[];
  /** Đang ở chế độ "Áp dụng cho tất cả" (chỉ để chọn câu báo lỗi). */
  all: boolean;
}

/** Câu báo lỗi (nếu có) khi lưu lần đóng quỹ, đúng thứ tự kiểm tra của PWA. */
export function validateContribution(draft: ContributionDraft): string | null {
  if (!draft.date) return 'Chọn ngày.';
  if (!draft.fundId) return 'Chọn quỹ trước khi lưu.';
  if (!draft.people.length) {
    return draft.all
      ? 'Nhập số tiền mỗi người.'
      : 'Nhập số tiền cho ít nhất một người.';
  }
  return null;
}

export interface FundExpenseDraft {
  title: string;
  date: string;
  fundId: string;
  amount: Vnd;
}

/** Câu báo lỗi (nếu có) khi lưu khoản chi quỹ, đúng thứ tự kiểm tra của PWA. */
export function validateFundExpense(draft: FundExpenseDraft): string | null {
  if (!draft.title.trim()) return 'Nhập nội dung chi.';
  if (!draft.date) return 'Chọn ngày chi.';
  if (!draft.fundId) return 'Chọn quỹ trước khi lưu.';
  if (!(draft.amount > 0)) return 'Nhập số tiền lớn hơn 0.';
  return null;
}

/** Thông báo sau khi lưu khoản chi quỹ: sửa thì "Đã lưu thay đổi", thêm mới thì "Đã lưu khoản chi". */
export function fundExpenseSavedMessage(editing: boolean): string {
  return editing ? 'Đã lưu thay đổi' : 'Đã lưu khoản chi';
}

/** Thông báo sau khi lưu lần đóng quỹ. */
export function contributionSavedMessage(editing: boolean): string {
  return editing ? 'Đã lưu thay đổi' : 'Đã lưu khoản thu';
}

/** Tiêu đề lần đóng: để trống thì dùng "Đóng quỹ". */
export function contributionTitle(input: string): string {
  return input.trim() || DEFAULT_CONTRIBUTION_TITLE;
}
