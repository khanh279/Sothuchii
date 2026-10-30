/**
 * Mã QR chuyển khoản nhanh VietQR (hàm thuần, KHÔNG gọi dịch vụ bên ngoài): dựng chuỗi nội dung theo chuẩn EMVCo / NAPAS 247 từ ngân hàng, số tài khoản, số tiền và lời nhắn.
 * Ứng dụng ngân hàng quét mã sẽ điền sẵn người nhận, số tiền và nội dung. Số tài khoản không rời khỏi máy: mã QR được vẽ ngay trên máy từ chuỗi này.
 * Số tiền là ĐỒNG (số nguyên).
 */

import type { Vnd } from '@/types/money';

const tlv = (id: string, value: string): string => `${id}${String(value.length).padStart(2, '0')}${value}`;

/** CRC-16/CCITT-FALSE (đa thức 0x1021, khởi tạo 0xFFFF), viết hoa 4 ký tự hex. */
export function crc16(text: string): string {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Chỉ giữ chữ số của số tài khoản (bỏ khoảng trắng, dấu gạch). */
export const cleanAccount = (text: string): string => text.replace(/\D/g, '');

/** Số tài khoản hợp lệ: 6 đến 19 chữ số (giới hạn của NAPAS). */
export const isValidAccount = (account: string): boolean => /^\d{6,19}$/.test(account);

const MAX_CONTENT = 25;

/** Lời nhắn chuyển khoản: bỏ dấu tiếng Việt, chỉ giữ chữ, số và khoảng trắng, tối đa 25 ký tự (nhiều ngân hàng chỉ nhận ký tự không dấu). */
export function transferContent(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CONTENT)
    .trim();
}

/**
 * Chuỗi nội dung của mã QR. Có `amount` (> 0) thì mã "động" điền sẵn số tiền; không có thì người chuyển tự nhập. Ném lỗi nếu ngân hàng / số tài khoản không hợp lệ.
 */
export function buildVietQrPayload(input: { bin: string; account: string; amount?: Vnd; content?: string }): string {
  if (!/^\d{6}$/.test(input.bin)) throw new Error('Mã ngân hàng không hợp lệ.');
  const account = cleanAccount(input.account);
  if (!isValidAccount(account)) throw new Error('Số tài khoản không hợp lệ.');
  const amount = input.amount !== undefined && Number.isFinite(input.amount) ? Math.round(input.amount) : 0;
  const content = transferContent(input.content ?? '');
  const beneficiary = tlv('00', input.bin) + tlv('01', account);
  const merchant = tlv('00', 'A000000727') + tlv('01', beneficiary) + tlv('02', 'QRIBFTTA');
  const body =
    tlv('00', '01') +
    tlv('01', amount > 0 ? '12' : '11') +
    tlv('38', merchant) +
    tlv('53', '704') +
    (amount > 0 ? tlv('54', String(amount)) : '') +
    tlv('58', 'VN') +
    (content ? tlv('62', tlv('08', content)) : '') +
    '6304';
  return body + crc16(body);
}
