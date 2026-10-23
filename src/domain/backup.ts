/**
 * Sao lưu / khôi phục / xoá dữ liệu (hàm thuần). Chuyển từ `Jt`, `We`, `ue` của phần Thiết lập trong PWA.
 *
 * Định dạng file sao lưu (khung của PWA): { app: 'so-tien', v: 2, at, people, chiTieu: { settings, months: {'YYYY-MM': {...}} }, quyNhom, chiaBill: { v: 7, unit: 'd', bills, pays, names } }
 * `chiaBill.unit`: 'd' = tiền ĐỒNG (bản hiện tại ghi); thiếu hoặc 'k' = NGHÌN đồng (file của PWA / bản cũ) — khi khôi phục được đổi sang đồng (xem `moneyMigration`).
 * Việc đọc / ghi bộ nhớ nằm ở tầng `data`; file này chỉ dựng và kiểm tra dữ liệu.
 */

import { billsNghinToVnd, paysNghinToVnd } from '@/domain/moneyMigration';

export const BACKUP_APP = 'so-tien';
export const BACKUP_VERSION = 2;

export type BackupSection = 'chi-tieu' | 'quy-nhom' | 'chia-bill';

export const SECTION_LABELS: Record<BackupSection, string> = {
  'chi-tieu': 'Chi tiêu',
  'quy-nhom': 'Quỹ nhóm',
  'chia-bill': 'Chia bill',
};

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Quỹ nhóm hợp lệ để khôi phục: có mảng `contribs` và `expenses` (hàm `ce`). */
export const isFundData = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) && Array.isArray(value.contribs) && Array.isArray(value.expenses);

/** Dữ liệu hiện có của máy, đọc nguyên văn từ bộ nhớ. */
export interface BackupSnapshot {
  people: readonly string[];
  settings: unknown;
  /** Mọi tháng đã có khóa, khóa là 'YYYY-MM'. Tháng rỗng bị bỏ khi dựng file. */
  months: Readonly<Record<string, unknown>>;
  fund: unknown;
  bills: readonly unknown[];
  pays: readonly unknown[];
  names: readonly unknown[];
}

export interface BackupDocument {
  app: typeof BACKUP_APP;
  v: typeof BACKUP_VERSION;
  at: string;
  people: string[];
  chiTieu: { settings: unknown; months: Record<string, unknown> };
  quyNhom: unknown;
  chiaBill: { v: 7; unit: 'd'; bills: unknown[]; pays: unknown[]; names: unknown[] };
}

/** Dựng nội dung file sao lưu. `at` là mốc thời gian ISO (UTC) chỉ để ghi chú, không dùng làm ngày lịch. */
export function buildBackup(snapshot: BackupSnapshot, now: number): BackupDocument {
  const months: Record<string, unknown> = {};
  for (const [month, value] of Object.entries(snapshot.months)) {
    if (isRecord(value) && Object.keys(value).length) months[month] = value;
  }
  return {
    app: BACKUP_APP,
    v: BACKUP_VERSION,
    at: new Date(now).toISOString(),
    people: [...snapshot.people],
    chiTieu: { settings: isRecord(snapshot.settings) ? snapshot.settings : {}, months },
    quyNhom: snapshot.fund ?? null,
    chiaBill: { v: 7, unit: 'd', bills: [...snapshot.bills], pays: [...snapshot.pays], names: [...snapshot.names] },
  };
}

/** Tên file theo NGÀY GIỜ MÁY: so-thu-chi-YYYY-MM-DD.json (không dùng toISOString). */
export function backupFileName(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `so-thu-chi-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

/** Những gì sẽ ghi khi khôi phục; chỉ chứa phần có trong file. */
export interface RestorePlan {
  sections: BackupSection[];
  /** Có mặt = THAY toàn bộ Chi tiêu (xoá các tháng và cài đặt hiện có rồi ghi các mục này). */
  chiTieu?: { settings?: Record<string, unknown>; months: Record<string, Record<string, unknown>> };
  fund?: Record<string, unknown>;
  chiaBill?: { bills: unknown[]; pays: unknown[]; names: unknown[] };
  /** Danh sách người trong file (có trong file nghĩa là thay danh sách hiện có). */
  people?: unknown[];
}

export type ParseResult = { ok: true; plan: RestorePlan } | { ok: false; error: string };

export const RESTORE_ERRORS = {
  invalidJson: 'Dữ liệu không hợp lệ',
  empty: 'File sao lưu không có dữ liệu',
  format: 'Dữ liệu không đúng định dạng',
  legacyBills: 'Bản sao lưu Chia bill cũ chưa được hỗ trợ trên bản mobile',
} as const;

/**
 * Kiểm tra nội dung sao lưu và lập kế hoạch khôi phục, CHƯA ghi gì. Nhận:
 * 1. Bản sao lưu Sổ Thu Chi (`app: 'so-tien'`): từng phần có trong file được khôi phục;
 * 2. Bản sao lưu Quỹ nhóm riêng của app cũ (có `contribs` và `expenses`).
 * Bản sao lưu Chia bill cũ (mảng bill) cần migration của PWA nên bị từ chối rõ ràng, không đoán.
 */
export function parseBackup(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: RESTORE_ERRORS.invalidJson };
  }

  if (isRecord(data) && data.app === BACKUP_APP) {
    const plan: RestorePlan = { sections: [] };
    if (isRecord(data.chiTieu)) {
      const monthsRaw = isRecord(data.chiTieu.months) ? data.chiTieu.months : {};
      const months: Record<string, Record<string, unknown>> = {};
      for (const [month, value] of Object.entries(monthsRaw)) {
        if (/^\d{4}-\d{2}$/.test(month) && isRecord(value)) months[month] = value;
      }
      plan.chiTieu = { months };
      if (isRecord(data.chiTieu.settings)) plan.chiTieu.settings = data.chiTieu.settings;
      plan.sections.push('chi-tieu');
    }
    if (isFundData(data.quyNhom)) {
      plan.fund = data.quyNhom;
      plan.sections.push('quy-nhom');
    }
    if (isRecord(data.chiaBill) && Array.isArray(data.chiaBill.bills)) {
      // `unit: 'd'` = đồng; mọi giá trị khác (thiếu, 'k') là file cũ lưu NGHÌN đồng nên đổi sang đồng ngay khi lập kế hoạch.
      const inVnd = data.chiaBill.unit === 'd';
      const bills = data.chiaBill.bills;
      const pays = Array.isArray(data.chiaBill.pays) ? data.chiaBill.pays : [];
      plan.chiaBill = {
        bills: inVnd ? bills : billsNghinToVnd(bills),
        pays: inVnd ? pays : paysNghinToVnd(pays),
        names: Array.isArray(data.chiaBill.names) ? data.chiaBill.names : [],
      };
      plan.sections.push('chia-bill');
    }
    if (!plan.sections.length) return { ok: false, error: RESTORE_ERRORS.empty };
    if (Array.isArray(data.people)) plan.people = data.people;
    return { ok: true, plan };
  }

  if (isFundData(data)) return { ok: true, plan: { sections: ['quy-nhom'], fund: data } };
  if (Array.isArray(data) || (isRecord(data) && Array.isArray(data.bills))) return { ok: false, error: RESTORE_ERRORS.legacyBills };
  return { ok: false, error: RESTORE_ERRORS.format };
}

/** Câu thông báo sau khi khôi phục. */
export function describeRestore(sections: readonly BackupSection[]): string {
  return `Đã khôi phục: ${sections.map((section) => SECTION_LABELS[section]).join(', ')}`;
}
