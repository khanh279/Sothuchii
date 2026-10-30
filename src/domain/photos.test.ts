import { MAX_PHOTOS, isPhotoId, newPhotoId, normalizePhotoIds, orphanPhotoIds, referencedPhotoIds } from './photos';

describe('ảnh đính kèm', () => {
  it('normalizePhotoIds: bỏ mã sai dạng / trùng, tối đa MAX_PHOTOS, rỗng thì undefined', () => {
    expect(normalizePhotoIds(['pabc123', 'pabc123', '../x', 5, 'pdef456'])).toEqual(['pabc123', 'pdef456']);
    expect(normalizePhotoIds(Array.from({ length: 9 }, (_, i) => `photo00${i}`))).toHaveLength(MAX_PHOTOS);
    expect(normalizePhotoIds([])).toBeUndefined();
    expect(normalizePhotoIds('x')).toBeUndefined();
  });

  it('newPhotoId hợp lệ và khác nhau theo thời điểm / số ngẫu nhiên', () => {
    const a = newPhotoId(1_700_000_000_000, () => 0.1);
    const b = newPhotoId(1_700_000_000_001, () => 0.9);
    expect(isPhotoId(a) && isPhotoId(b)).toBe(true);
    expect(a).not.toBe(b);
  });

  it('ảnh mồ côi: chỉ ảnh không ai dùng và đã quá thời gian chờ', () => {
    const used = referencedPhotoIds([[{ ph: ['pkeep01'] }], [{}, { ph: ['pkeep02'] }]]);
    const now = 10 * 24 * 3600_000;
    const stored = [
      { id: 'pkeep01', createdAt: 0 },
      { id: 'pold001', createdAt: 0 },
      { id: 'pnew001', createdAt: now - 1000 },
    ];
    expect(orphanPhotoIds(stored, used, now)).toEqual(['pold001']);
  });
});
