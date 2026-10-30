import { BACKUP_APP, buildBackup, parseBackup } from './backup';
import { normalizeBills } from './bills';
import { normalizeFundData } from './funds';
import { normalizePays } from './pays';
import { validBackupPhotos } from './photos';

// DỮ LIỆU MẪU do tôi tự tạo; KHÔNG phải dữ liệu thật.
const DATA_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

describe('trường ảnh `ph` của các bản ghi', () => {
  it('bill, khoản trả và chi tiêu quỹ giữ mã ảnh hợp lệ và bỏ mã sai; bản ghi cũ không có `ph`', () => {
    const bill = { id: 'b1', title: 'T', date: '2025-10-01', createdAt: 1, cat: 'food', people: [{ name: 'A', paid: 1 }], ph: ['pabc123', '../bad'] };
    expect(normalizeBills([bill])[0].ph).toEqual(['pabc123']);
    expect(normalizeBills([{ ...bill, ph: undefined }])[0].ph).toBeUndefined();

    const pay = { id: 'p1', createdAt: 1, date: '2025-10-01', note: '', from: 'Tôi', to: 'An', amt: 1000, kind: 'vay', ph: ['pxyz789'] };
    expect(normalizePays([pay])[0].ph).toEqual(['pxyz789']);
    expect(normalizePays([{ ...pay, ph: [] }])[0].ph).toBeUndefined();

    const fund = {
      funds: [{ id: 'f1', name: 'Quỹ' }],
      contribs: [],
      expenses: [{ id: 'e1', fundId: 'f1', title: 'x', date: '2025-10-01', amount: 500, ph: ['pfund01'] }],
    };
    expect(normalizeFundData(fund).expenses[0].ph).toEqual(['pfund01']);
  });
});

describe('ảnh trong file sao lưu', () => {
  it('chỉ nhận mã đúng dạng và nội dung là data URL ảnh', () => {
    expect(validBackupPhotos({ pgood01: DATA_URL, '../bad': DATA_URL, pbad001: 'http://evil/x.jpg', pbad002: 5 })).toEqual({ pgood01: DATA_URL });
    expect(validBackupPhotos(null)).toEqual({});
  });

  it('buildBackup thêm `photos` khi có ảnh; parseBackup đọc lại vào kế hoạch khôi phục; file cũ không có ảnh vẫn khôi phục bình thường', () => {
    const snapshot = { people: [], settings: {}, months: {}, fund: null, bills: [], pays: [], names: [] };
    expect(buildBackup(snapshot, 1).photos).toBeUndefined();
    const withPhoto = buildBackup({ ...snapshot, photos: { pgood01: DATA_URL } }, 1);
    expect(withPhoto.photos).toEqual({ pgood01: DATA_URL });
    const parsed = parseBackup(JSON.stringify(withPhoto));
    expect(parsed.ok && parsed.plan.photos).toEqual({ pgood01: DATA_URL });
    const old = parseBackup(JSON.stringify({ app: BACKUP_APP, v: 2, chiaBill: { v: 7, unit: 'd', bills: [], pays: [], names: [] } }));
    expect(old.ok && old.plan.photos).toBeUndefined();
  });
});
