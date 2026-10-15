/**
 * Biểu tượng của PWA được lưu dưới dạng chuỗi SVG (<path/>, <circle/>, <rect/>).
 * React Native không render chuỗi, nên tách chúng thành danh sách hình để vẽ bằng react-native-svg.
 */

export type SvgShape =
  | { kind: 'path'; d: string }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'rect'; x: number; y: number; width: number; height: number; rx: number };

function readAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of source.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

const num = (value: string | undefined) => Number(value) || 0;

export function parseSvgMarkup(markup: string): SvgShape[] {
  const shapes: SvgShape[] = [];
  for (const match of markup.matchAll(/<(path|circle|rect)\b([^>]*?)\/?>/g)) {
    const attrs = readAttributes(match[2]);
    if (match[1] === 'path' && attrs.d) {
      shapes.push({ kind: 'path', d: attrs.d });
    } else if (match[1] === 'circle') {
      shapes.push({ kind: 'circle', cx: num(attrs.cx), cy: num(attrs.cy), r: num(attrs.r) });
    } else if (match[1] === 'rect') {
      shapes.push({
        kind: 'rect',
        x: num(attrs.x),
        y: num(attrs.y),
        width: num(attrs.width),
        height: num(attrs.height),
        rx: num(attrs.rx),
      });
    }
  }
  return shapes;
}
