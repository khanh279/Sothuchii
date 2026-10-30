import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { PrimaryButton, SecondaryButton } from '@/components/design';
import { QrCode } from '@/components/qr-code';
import { SvgIcon } from '@/components/svg-icon';
import { SheetFrame, SheetHeader, useSheetClose } from '@/components/sheet-frame';
import { buildVietQrPayload, transferContent } from '@/domain/vietQr';
import { bankByBin } from '@/domain/vnBanks';
import { useColors } from '@/hooks/use-colors';
import type { BankAccount } from '@/types/expense';
import { formatVnd } from '@/utils/format';
import { router } from '@/utils/safe-router';

interface Props {
  /** Các tài khoản nhận tiền đã lưu ở Thiết lập; chưa có thì thẻ nhắc đi thiết lập; có nhiều thì chọn tài khoản ngay trên thẻ. */
  banks: readonly BankAccount[];
  /** Số tiền người kia cần chuyển cho mình (ĐỒNG, > 0); điền sẵn vào mã QR. */
  amount: number;
  /** Lời nhắn chuyển khoản (có dấu cũng được; tự bỏ dấu và cắt còn 25 ký tự). */
  content: string;
  onClose: () => void;
}

/** Thông tin để hiện mã QR nhận tiền ở thẻ xác nhận thanh toán: lời nhắn chuyển khoản và tài khoản đã lưu (đọc ở trang, rồi truyền xuống vì thẻ nổi không tự đọc được thiết lập). */
export interface ReceiveQr {
  content: string;
  /** Các tài khoản nhận tiền đã lưu ở Thiết lập (thứ tự như trong Thiết lập; tài khoản đầu là mặc định). */
  banks: readonly BankAccount[];
}

/**
 * Nút "Mã QR nhận tiền" đặt DƯỚI thẻ xác nhận thanh toán khi người kia trả tiền cho mình: bấm thì hiện mã QR của tài khoản của mình với ĐÚNG SỐ TIỀN đang xác nhận (không phải toàn bộ số nợ).
 * Không hiện khi số tiền chưa hợp lệ (ví dụ chưa nhập ở bước thanh toán một phần).
 */
export function ReceiveQrInline({ qr, amount }: { qr: ReceiveQr; amount: number }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  if (!(amount > 0)) return null;
  return (
    <>
      <SecondaryButton label="Mã QR nhận tiền" icon={<SvgIcon name="qr" size={20} color={colors.primary} strokeWidth={2} />} onPress={() => setOpen(true)} />
      {open && <ReceiveQrSheet amount={amount} content={qr.content} banks={qr.banks} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * Thẻ "Mã QR nhận tiền" giữa màn hình: mã VietQR của TÀI KHOẢN CỦA MÌNH (đã lưu ở Thiết lập) kèm số tiền và lời nhắn, để người đang nợ quét bằng app ngân hàng. Chưa thiết lập tài khoản thì
 * hiện lời nhắc và nút mở trang Thiết lập. Mã được dựng và vẽ ngay trên máy.
 */
export function ReceiveQrSheet({ banks, amount, content, onClose }: Props) {
  return (
    <SheetFrame placement="center" onClose={onClose}>
      <Body amount={amount} content={content} banks={banks} />
    </SheetFrame>
  );
}

function Body({ amount, content, banks }: { amount: number; content: string; banks: readonly BankAccount[] }) {
  const colors = useColors();
  const hide = useSheetClose();
  const [picked, setPicked] = useState(0);
  const bank: BankAccount | undefined = banks[Math.min(picked, banks.length - 1)];
  const payload = useMemo(() => {
    if (!bank) return null;
    try {
      return buildVietQrPayload({ bin: bank.bin, account: bank.account, amount, content });
    } catch {
      return null;
    }
  }, [bank, amount, content]);
  const bankInfo = bank ? bankByBin(bank.bin) : undefined;

  return (
    <View style={styles.body}>
      <SheetHeader title="Mã QR nhận tiền" />
      {/* Nhiều tài khoản: chọn tài khoản nhận tiền ngay trên thẻ, mã QR đổi theo. */}
      {banks.length > 1 && (
        <View style={styles.accounts}>
          {banks.map((item, index) => {
            const selected = item === bank;
            return (
              <Pressable
                key={`${item.bin}:${item.account}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setPicked(index)}
                style={[styles.account, selected ? { backgroundColor: colors.primary, borderColor: colors.primary } : { backgroundColor: colors.bg, borderColor: colors.line }]}>
                <AppText weight="semibold" color={selected ? colors.primaryInk : colors.ink} style={styles.accountText} numberOfLines={1}>
                  {bankByBin(item.bin)?.code ?? 'Ngân hàng'} ·· {item.account.slice(-4)}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      )}
      {payload && bank ? (
        <>
          <View style={styles.qr}>
            <QrCode value={payload} size={236} />
          </View>
          <AppText weight="display" style={styles.amount}>
            {formatVnd(amount)}
          </AppText>
          <AppText weight="semibold" style={styles.line}>
            {bankInfo?.code ?? 'Ngân hàng'} · {bank.account}
          </AppText>
          {!!bank.name && (
            <AppText color={colors.muted} style={styles.line}>
              {bank.name}
            </AppText>
          )}
          {!!transferContent(content) && (
            <AppText color={colors.muted} style={styles.note}>
              Nội dung: {transferContent(content)}
            </AppText>
          )}
          <PrimaryButton label="Xong" onPress={() => hide()} />
        </>
      ) : (
        <>
          <AppText style={styles.line}>Bạn chưa lưu tài khoản nhận tiền. Vào Thiết lập, chọn ngân hàng và nhập số tài khoản để tạo mã QR.</AppText>
          <View style={styles.actions}>
            <SecondaryButton label="Đóng" onPress={() => hide()} style={styles.flex} />
            <PrimaryButton
              label="Thiết lập"
              onPress={() =>
                hide(() => {
                  router.push('/thiet-lap');
                })
              }
              style={styles.flex}
            />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: 8, alignItems: 'stretch' },
  accounts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  account: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  accountText: { fontSize: 13, lineHeight: 18 },
  qr: { alignSelf: 'center', borderRadius: 12, overflow: 'hidden', marginVertical: 4 },
  amount: { fontSize: 26, lineHeight: 32, textAlign: 'center' },
  line: { fontSize: 14.5, lineHeight: 20, textAlign: 'center' },
  note: { fontSize: 12.5, lineHeight: 17, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  flex: { flex: 1, minWidth: 0 },
});
