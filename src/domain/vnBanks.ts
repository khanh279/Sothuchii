/**
 * Ngân hàng Việt Nam dùng cho mã QR chuyển khoản nhanh (VietQR / NAPAS 247): `bin` là mã định danh ngân hàng 6 số trong mã QR, `code` là tên ngắn hiện trên nút chọn.
 * Danh sách các ngân hàng phổ biến; không có ngân hàng của bạn thì chưa tạo được mã QR.
 */
export interface VnBank {
  bin: string;
  code: string;
  name: string;
}

export const VN_BANKS: readonly VnBank[] = [
  { bin: '970436', code: 'Vietcombank', name: 'Ngân hàng TMCP Ngoại thương Việt Nam' },
  { bin: '970415', code: 'VietinBank', name: 'Ngân hàng TMCP Công thương Việt Nam' },
  { bin: '970418', code: 'BIDV', name: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam' },
  { bin: '970405', code: 'Agribank', name: 'Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam' },
  { bin: '970407', code: 'Techcombank', name: 'Ngân hàng TMCP Kỹ thương Việt Nam' },
  { bin: '970422', code: 'MB Bank', name: 'Ngân hàng TMCP Quân đội' },
  { bin: '970416', code: 'ACB', name: 'Ngân hàng TMCP Á Châu' },
  { bin: '970432', code: 'VPBank', name: 'Ngân hàng TMCP Việt Nam Thịnh Vượng' },
  { bin: '970423', code: 'TPBank', name: 'Ngân hàng TMCP Tiên Phong' },
  { bin: '970403', code: 'Sacombank', name: 'Ngân hàng TMCP Sài Gòn Thương Tín' },
  { bin: '970437', code: 'HDBank', name: 'Ngân hàng TMCP Phát triển Thành phố Hồ Chí Minh' },
  { bin: '970441', code: 'VIB', name: 'Ngân hàng TMCP Quốc tế Việt Nam' },
  { bin: '970443', code: 'SHB', name: 'Ngân hàng TMCP Sài Gòn - Hà Nội' },
  { bin: '970426', code: 'MSB', name: 'Ngân hàng TMCP Hàng hải Việt Nam' },
  { bin: '970448', code: 'OCB', name: 'Ngân hàng TMCP Phương Đông' },
  { bin: '970440', code: 'SeABank', name: 'Ngân hàng TMCP Đông Nam Á' },
  { bin: '970431', code: 'Eximbank', name: 'Ngân hàng TMCP Xuất Nhập khẩu Việt Nam' },
  { bin: '970449', code: 'LPBank', name: 'Ngân hàng TMCP Lộc Phát Việt Nam' },
  { bin: '970428', code: 'Nam A Bank', name: 'Ngân hàng TMCP Nam Á' },
  { bin: '970409', code: 'Bac A Bank', name: 'Ngân hàng TMCP Bắc Á' },
  { bin: '970425', code: 'ABBank', name: 'Ngân hàng TMCP An Bình' },
  { bin: '970412', code: 'PVcomBank', name: 'Ngân hàng TMCP Đại chúng Việt Nam' },
  { bin: '970454', code: 'BVBank', name: 'Ngân hàng TMCP Bản Việt' },
  { bin: '970429', code: 'SCB', name: 'Ngân hàng TMCP Sài Gòn' },
  { bin: '970427', code: 'VietABank', name: 'Ngân hàng TMCP Việt Á' },
  { bin: '970419', code: 'NCB', name: 'Ngân hàng TMCP Quốc Dân' },
  { bin: '970452', code: 'KienlongBank', name: 'Ngân hàng TMCP Kiên Long' },
  { bin: '546034', code: 'CAKE', name: 'Ngân hàng số CAKE by VPBank' },
  { bin: '546035', code: 'Ubank', name: 'Ngân hàng số Ubank by VPBank' },
];

export const bankByBin = (bin: string): VnBank | undefined => VN_BANKS.find((bank) => bank.bin === bin);
