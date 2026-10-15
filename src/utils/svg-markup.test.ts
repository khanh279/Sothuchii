import { ICON_PATHS } from '@/constants/categories';

import { parseSvgMarkup } from './svg-markup';

describe('parseSvgMarkup', () => {
  it('tách path, circle, rect', () => {
    const shapes = parseSvgMarkup(
      '<rect x="4" y="9" width="16" height="11" rx="1"/><circle cx="6" cy="12" r="1.4"/><path d="M4 13h16"/>',
    );
    expect(shapes).toEqual([
      { kind: 'rect', x: 4, y: 9, width: 16, height: 11, rx: 1 },
      { kind: 'circle', cx: 6, cy: 12, r: 1.4 },
      { kind: 'path', d: 'M4 13h16' },
    ]);
  });

  it('bỏ qua thẻ lạ và chuỗi rỗng', () => {
    expect(parseSvgMarkup('')).toEqual([]);
    expect(parseSvgMarkup('<line x1="1"/>')).toEqual([]);
    expect(parseSvgMarkup('<path/>')).toEqual([]);
  });

  it('mọi biểu tượng của PWA đều có ít nhất một hình hợp lệ', () => {
    for (const [name, markup] of Object.entries(ICON_PATHS)) {
      const shapes = parseSvgMarkup(markup);
      expect({ name, count: shapes.length > 0 }).toEqual({ name, count: true });
      for (const shape of shapes) {
        if (shape.kind === 'path') expect(shape.d).toMatch(/^[Mm]/);
        if (shape.kind === 'circle') expect(shape.r).toBeGreaterThan(0);
      }
    }
  });
});
