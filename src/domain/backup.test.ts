import {
  BACKUP_APP,
  RESTORE_ERRORS,
  backupFileName,
  buildBackup,
  describeRestore,
  parseBackup,
  type BackupSnapshot,
} from './backup';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật của người dùng.
const snapshot: BackupSnapshot = {
  people: ['An', 'Bình'],
  settings: { budget: 3_000_000, cats: [] },
  months: { '2025-10': { x1: { a: 5000, c: 'food', n: 'Phở', d: '2025-10-05', t: 1 } }, '2025-09': {}, '2025-08': 'rác' },
  fund: { funds: [{ id: 'f', name: 'Quỹ' }], contribs: [], expenses: [] },
  bills: [{ id: 'b1', people: [] }],
  pays: [],
  names: ['Tôi', 'An'],
};

describe('buildBackup', () => {
  it('đúng định dạng PWA: app, v, at, people, chiTieu, quyNhom, chiaBill', () => {
    const doc = buildBackup(snapshot, Date.UTC(2025, 9, 15, 3, 0, 0));
    expect(doc).toEqual({
      app: 'so-tien',
      v: 2,
      at: '2025-10-15T03:00:00.000Z',
      people: ['An', 'Bình'],
      chiTieu: { settings: { budget: 3_000_000, cats: [] }, months: { '2025-10': snapshot.months['2025-10'] } },
      quyNhom: snapshot.fund,
      chiaBill: { v: 6, unit: 'k', bills: [{ id: 'b1', people: [] }], pays: [], names: ['Tôi', 'An'] },
    });
  });

  it('bỏ tháng rỗng hoặc không phải đối tượng; chưa có Quỹ thì null; cài đặt lạ thành {}', () => {
    const doc = buildBackup({ ...snapshot, fund: undefined, settings: 'lạ' }, 0);
    expect(Object.keys(doc.chiTieu.months)).toEqual(['2025-10']);
    expect(doc.quyNhom).toBeNull();
    expect(doc.chiTieu.settings).toEqual({});
  });

  it('không sửa đầu vào', () => {
    const copy = JSON.parse(JSON.stringify(snapshot));
    buildBackup(snapshot, 1);
    expect(snapshot).toEqual(copy);
  });

  it('đi và về: file vừa dựng khôi phục được đủ ba phần', () => {
    const result = parseBackup(JSON.stringify(buildBackup(snapshot, 1)));
    expect(result.ok && result.plan.sections).toEqual(['chi-tieu', 'quy-nhom', 'chia-bill']);
  });
});

describe('backupFileName', () => {
  it('theo ngày giờ máy, không lệch múi giờ', () => {
    expect(backupFileName(new Date(2025, 0, 5, 23, 59))).toBe('so-thu-chi-2025-01-05.json');
    expect(backupFileName(new Date(2025, 11, 31, 0, 1))).toBe('so-thu-chi-2025-12-31.json');
  });
});

describe('parseBackup', () => {
  it('JSON hỏng / không đúng định dạng', () => {
    expect(parseBackup('{hong')).toEqual({ ok: false, error: RESTORE_ERRORS.invalidJson });
    expect(parseBackup('123')).toEqual({ ok: false, error: RESTORE_ERRORS.format });
    expect(parseBackup('{"a":1}')).toEqual({ ok: false, error: RESTORE_ERRORS.format });
    expect(parseBackup('null')).toEqual({ ok: false, error: RESTORE_ERRORS.format });
  });

  it('file Sổ Thu Chi không có phần nào dùng được → báo rỗng', () => {
    expect(parseBackup(JSON.stringify({ app: BACKUP_APP, v: 2 }))).toEqual({ ok: false, error: RESTORE_ERRORS.empty });
    expect(parseBackup(JSON.stringify({ app: BACKUP_APP, quyNhom: { contribs: 1 }, chiaBill: { bills: 'x' } }))).toEqual({ ok: false, error: RESTORE_ERRORS.empty });
  });

  it('chỉ lấy tháng đúng định dạng và là đối tượng; cài đặt không phải đối tượng bị bỏ', () => {
    const r = parseBackup(JSON.stringify({ app: 'so-tien', chiTieu: { settings: [], months: { '2025-10': { a: 1 }, '2025-13x': { b: 1 }, abc: {}, '2025-09': [] } } }));
    expect(r.ok && r.plan.chiTieu).toEqual({ months: { '2025-10': { a: 1 } } });
  });

  it('Chi tiêu có mặt (kể cả rỗng) nghĩa là THAY toàn bộ Chi tiêu', () => {
    const r = parseBackup(JSON.stringify({ app: 'so-tien', chiTieu: {} }));
    expect(r.ok && r.plan.sections).toEqual(['chi-tieu']);
    expect(r.ok && r.plan.chiTieu).toEqual({ months: {} });
  });

  it('Chia bill: thiếu pays / names thì là mảng rỗng; people được giữ', () => {
    const r = parseBackup(JSON.stringify({ app: 'so-tien', people: ['An'], chiaBill: { bills: [{ id: 'b' }] } }));
    expect(r.ok && r.plan.chiaBill).toEqual({ bills: [{ id: 'b' }], pays: [], names: [] });
    expect(r.ok && r.plan.people).toEqual(['An']);
  });

  it('bản sao lưu Quỹ nhóm riêng của app cũ được nhận', () => {
    const fund = { funds: [], contribs: [], expenses: [] };
    expect(parseBackup(JSON.stringify(fund))).toEqual({ ok: true, plan: { sections: ['quy-nhom'], fund } });
  });

  it('bản sao lưu Chia bill cũ (mảng hoặc {bills}) bị từ chối rõ ràng', () => {
    expect(parseBackup('[{"id":"b"}]')).toEqual({ ok: false, error: RESTORE_ERRORS.legacyBills });
    expect(parseBackup('{"bills":[]}')).toEqual({ ok: false, error: RESTORE_ERRORS.legacyBills });
  });

  it('thông báo sau khi khôi phục', () => {
    expect(describeRestore(['chi-tieu', 'quy-nhom'])).toBe('Đã khôi phục: Chi tiêu, Quỹ nhóm');
  });
});
