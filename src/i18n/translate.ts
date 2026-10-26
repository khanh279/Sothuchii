/**
 * Dịch chữ hiển thị (hàm thuần, không phụ thuộc React Native). Chuỗi gốc trong mã là TIẾNG VIỆT; bản tiếng Anh tra theo đúng chuỗi gốc đó:
 * - Khớp nguyên chuỗi: `'Tổng quan': 'Overview'`.
 * - Chuỗi có chỗ điền (số, tên…): viết khoá với `{0}`, `{1}`… rồi dùng lại ở bản dịch: `'Đã thêm {0} người': 'Added {0} {0|person|people}'`.
 *   `{i|một|nhiều}` chọn dạng số ít khi giá trị thứ i bằng 1, ngược lại số nhiều; `{i:month}` đổi số tháng (1–12) thành tên tháng tiếng Anh. Giá trị điền vào được dịch tiếp (tên người, tiền… không khớp thì giữ nguyên).
 * - Không khớp: thử dịch từng dòng (tách bằng xuống dòng) và từng đoạn tách bằng " · ", " → " hoặc ", " (ví dụ "An → Tôi", "Tôi, Bình").
 * Tiếng Việt (mặc định) trả lại nguyên chuỗi, nên mọi kết quả và kiểm thử hiện có không đổi.
 */

export type Language = 'vi' | 'en';

export type Dictionary = Readonly<Record<string, string>>;

interface Pattern {
  regex: RegExp;
  /** Thứ tự các `{n}` theo các nhóm bắt của `regex` (nhóm k ứng với placeholder order[k]). */
  order: number[];
  to: string;
  /** Số ký tự cố định của khoá: khoá cụ thể hơn (nhiều chữ cố định hơn) được thử trước. */
  weight: number;
}

const english: Record<string, string> = {};
let patterns: Pattern[] = [];
let cache = new Map<string, string>();

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasPlaceholder(key: string): boolean {
  return /\{\d+\}/.test(key);
}

function compilePattern(key: string, to: string): Pattern {
  const parts = key.split(/\{\d+\}/);
  // Chỗ điền ở CUỐI khoá được phép rỗng (ví dụ hậu tố tuỳ chọn); các chỗ còn lại cần ít nhất một ký tự.
  const lastIndex = parts.length - 1;
  const body = parts.map(escapeRegex).reduce((acc, part, index) => acc + (index === lastIndex && part === '' ? '([\\s\\S]*?)' : '([\\s\\S]+?)') + part);
  const regex = new RegExp(`^${body}$`);
  const order = [...key.matchAll(/\{(\d+)\}/g)].map((match) => Number(match[1]));
  return { regex, order, to, weight: parts.join('').length };
}

/** Thêm bản dịch tiếng Anh (gọi nhiều lần được; khoá trùng thì bản sau thắng). */
export function registerEnglish(dictionary: Dictionary): void {
  Object.assign(english, dictionary);
  patterns = Object.entries(english)
    .filter(([key]) => hasPlaceholder(key))
    .map(([key, to]) => compilePattern(key, to))
    .sort((a, b) => b.weight - a.weight);
  cache = new Map();
}

/** Số khoá đã đăng ký (cho kiểm thử). */
export function englishSize(): number {
  return Object.keys(english).length;
}

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function fill(template: string, values: Record<number, string>): string {
  return template.replace(/\{(\d+)(?::(month))?(?:\|([^|}]*)\|([^}]*))?\}/g, (_, index: string, format?: string, one?: string, many?: string) => {
    const value = values[Number(index)] ?? '';
    if (format === 'month') return MONTHS_EN[Number(value) - 1] ?? value;
    if (one === undefined) return value;
    return Number(value.replace(/[^\d-]/g, '')) === 1 ? one : (many ?? one);
  });
}

function translateText(text: string, depth: number): string {
  if (depth > 4) return text;
  const exact = english[text];
  if (exact !== undefined) return exact;
  for (const pattern of patterns) {
    const match = pattern.regex.exec(text);
    if (!match) continue;
    const values: Record<number, string> = {};
    pattern.order.forEach((placeholder, group) => {
      values[placeholder] = translateText(match[group + 1], depth + 1);
    });
    return fill(pattern.to, values);
  }
  if (text.includes('\n')) return text.split('\n').map((line) => translateText(line, depth + 1)).join('\n');
  if (text.includes(' · ')) return text.split(' · ').map((part) => translateText(part, depth + 1)).join(' · ');
  if (text.includes(' → ')) return text.split(' → ').map((part) => translateText(part, depth + 1)).join(' → ');
  if (text.includes(', ')) return text.split(', ').map((part) => translateText(part, depth + 1)).join(', ');
  return text;
}

/** Dịch một chuỗi sang ngôn ngữ `language`; tiếng Việt hoặc chuỗi không có bản dịch thì trả nguyên. Khoảng trắng đầu / cuối được giữ. */
export function translate(text: string, language: Language): string {
  if (language === 'vi' || !text) return text;
  const hit = cache.get(text);
  if (hit !== undefined) return hit;
  const lead = /^\s*/.exec(text)?.[0] ?? '';
  const trail = /\s*$/.exec(text)?.[0] ?? '';
  const core = text.slice(lead.length, text.length - trail.length);
  const result = core ? lead + translateText(core, 0) + trail : text;
  if (cache.size > 4000) cache = new Map();
  cache.set(text, result);
  return result;
}

/**
 * Dịch nội dung con của một thẻ chữ: chuỗi → dịch; mảng chỉ gồm chuỗi / số (kiểu `Đã thêm {n} người` do JSX tách đoạn) → nối lại rồi dịch MỘT lần;
 * mảng lẫn phần tử khác → mỗi cụm chuỗi / số liền nhau được nối lại và dịch một lần, các phần tử React đứng nguyên chỗ.
 */
export function translateNode(children: unknown, language: Language): unknown {
  if (language === 'vi') return children;
  if (typeof children === 'string') return translate(children, language);
  if (Array.isArray(children)) {
    const flat: unknown[] = children.flat(Infinity);
    if (flat.every((item) => typeof item === 'string' || typeof item === 'number')) return translate(flat.join(''), language);
    const result: unknown[] = [];
    let run = '';
    let hasRun = false;
    const flush = () => {
      if (hasRun) result.push(translate(run, language));
      run = '';
      hasRun = false;
    };
    for (const item of flat) {
      if (typeof item === 'string' || typeof item === 'number') {
        run += String(item);
        hasRun = true;
      } else {
        flush();
        if (item !== null && item !== undefined && typeof item !== 'boolean') result.push(item);
      }
    }
    flush();
    return result;
  }
  return children;
}
