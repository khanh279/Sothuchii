import { useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View, type HostInstance } from 'react-native';

import { AppText } from '@/components/app-text';
import { PrimaryButton, SecondaryButton } from '@/components/design';
import { QrCode } from '@/components/qr-code';
import { SheetFrame, SheetHeader } from '@/components/sheet-frame';
import { useToast } from '@/components/toast';
import type { ReminderItem } from '@/domain/debtReminder';
import { buildVietQrPayload, transferContent } from '@/domain/vietQr';
import { bankByBin } from '@/domain/vnBanks';
import { saveDebtImage, shareDebtImage } from '@/features/debts/debtImageExport';
import { useColors } from '@/hooks/use-colors';
import { tr } from '@/i18n/language';
import type { BankAccount } from '@/types/expense';
import { formatVnDate, todayStr } from '@/utils/date';
import { formatVnd } from '@/utils/format';

/** Màu cố định của ảnh (ảnh gửi đi luôn nền sáng, không đổi theo giao diện sáng / tối của app). */
const INK = '#0F172A';
const MUTED = '#64748B';
const LINE = '#E2E8F0';
const GREEN = '#15803D';

interface Props {
  /** Tên người đang nợ mình. */
  name: string;
  loans: readonly ReminderItem[];
  bills: readonly ReminderItem[];
  /** Tổng người đó còn nợ mình (đồng). */
  total: number;
  /** Các tài khoản nhận tiền đã lưu ở Thiết lập; chọn một tài khoản để in mã QR vào ảnh. */
  banks: readonly BankAccount[];
  onClose: () => void;
}

/**
 * Ảnh NHẮC NỢ: tên người nợ, các khoản nợ vay / nợ bill còn lại, tổng cộng và, ở GÓC DƯỚI PHẢI, mã QR chuyển khoản (VietQR) của tài khoản đã chọn với đúng tổng tiền cùng thông tin tài khoản.
 * Màu cố định nền sáng để ảnh gửi đi luôn rõ. Mã QR dựng trên máy; chưa lưu tài khoản nào thì ảnh không có mã.
 */
export function DebtImageCard({ name, loans, bills, total, bank }: Omit<Props, 'banks' | 'onClose'> & { bank: BankAccount | undefined }) {
  const payload = useMemo(() => {
    if (!bank) return null;
    try {
      return buildVietQrPayload({ bin: bank.bin, account: bank.account, amount: total, content: `${name} tra no` });
    } catch {
      return null;
    }
  }, [bank, total, name]);
  const section = (title: string, items: readonly ReminderItem[]) =>
    items.length > 0 && (
      <View style={styles.block}>
        <AppText weight="semibold" color={MUTED} style={styles.blockTitle}>
          {title}
        </AppText>
        {items.map((item, index) => (
          <View key={`${item.title}${index}`} style={[styles.row, index > 0 && { borderTopColor: LINE, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <View style={styles.rowText}>
              <AppText weight="medium" color={INK} style={styles.rowTitle} numberOfLines={2}>
                {item.title || 'Khoản'}
              </AppText>
              <AppText color={MUTED} style={styles.rowSub}>
                {formatVnDate(item.date)}
              </AppText>
            </View>
            <AppText weight="semibold" color={INK} style={styles.rowAmount}>
              {formatVnd(item.amount)}
            </AppText>
          </View>
        ))}
      </View>
    );
  return (
    <View style={styles.card}>
      <AppText color={MUTED} style={styles.kicker}>
        Nhắc nợ · {formatVnDate(todayStr())}
      </AppText>
      <AppText weight="display" color={INK} style={styles.name} numberOfLines={2}>
        {name}
      </AppText>
      <AppText weight="display" color={GREEN} style={styles.total}>
        {formatVnd(total)}
      </AppText>
      {section('Nợ vay', loans)}
      {section('Nợ bill', bills)}
      {/* Chân ảnh: thông tin tài khoản bên trái, mã QR ở góc dưới phải. */}
      <View style={[styles.footer, { borderTopColor: LINE }]}>
        <View style={styles.footerText}>
          {bank ? (
            <>
              <AppText weight="semibold" color={INK} style={styles.rowTitle}>
                Chuyển khoản
              </AppText>
              <AppText color={INK} style={styles.rowSub}>
                {bankByBin(bank.bin)?.code ?? 'Ngân hàng'} · {bank.account}
              </AppText>
              {!!bank.name && (
                <AppText color={MUTED} style={styles.rowSub}>
                  {bank.name}
                </AppText>
              )}
              <AppText color={MUTED} style={styles.rowSub}>
                Nội dung: {transferContent(`${name} tra no`)}
              </AppText>
            </>
          ) : (
            <AppText color={MUTED} style={styles.rowSub}>
              Cảm ơn bạn!
            </AppText>
          )}
        </View>
        {payload && <QrCode value={payload} size={112} />}
      </View>
    </View>
  );
}

/**
 * Tờ "Ảnh nhắc nợ": chọn tài khoản nhận tiền (khi có nhiều tài khoản), xem trước ảnh rồi "Lưu ảnh" vào thư viện hoặc "Chia sẻ" ảnh qua Zalo, Messenger… Lưu / chia sẻ ảnh chỉ có trên
 * ứng dụng điện thoại; web chỉ xem trước.
 */
export function DebtImageSheet(props: Props) {
  return (
    <SheetFrame placement="center" onClose={props.onClose}>
      <Body {...props} />
    </SheetFrame>
  );
}

function Body({ name, loans, bills, total, banks }: Props) {
  const colors = useColors();
  const toast = useToast();
  const shot = useRef<HostInstance>(null);
  const [picked, setPicked] = useState(0);
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
  const bank: BankAccount | undefined = banks.length > 0 ? banks[Math.min(picked, banks.length - 1)] : undefined;

  async function run(kind: 'save' | 'share') {
    if (busy) return;
    setBusy(kind);
    try {
      const result = await (kind === 'save' ? saveDebtImage(shot.current) : shareDebtImage(shot.current));
      if (result.message) toast.show(tr(result.message));
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.body}>
      <SheetHeader title="Ảnh nhắc nợ" />
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
                style={[styles.chip, selected ? { backgroundColor: colors.primary, borderColor: colors.primary } : { backgroundColor: colors.bg, borderColor: colors.line }]}>
                <AppText weight="semibold" color={selected ? colors.primaryInk : colors.ink} style={styles.chipText} numberOfLines={1}>
                  {bankByBin(item.bin)?.code ?? 'Ngân hàng'} ·· {item.account.slice(-4)}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      )}
      {banks.length === 0 && (
        <AppText color={colors.muted} style={styles.hint}>
          Chưa lưu tài khoản nhận tiền nên ảnh chưa có mã QR. Thêm tài khoản ở Thiết lập.
        </AppText>
      )}
      <ScrollView style={styles.preview} contentContainerStyle={styles.previewContent}>
        <View ref={shot} collapsable={false} style={styles.shot}>
          <DebtImageCard name={name} loans={loans} bills={bills} total={total} bank={bank} />
        </View>
      </ScrollView>
      <View style={styles.actions}>
        <SecondaryButton label="Lưu ảnh" onPress={() => void run('save')} disabled={!!busy} style={styles.flex} />
        <PrimaryButton label="Chia sẻ ảnh" onPress={() => void run('share')} disabled={!!busy} style={styles.flex} />
      </View>
      {Platform.OS === 'web' && (
        <AppText color={colors.muted} style={styles.hint}>
          Lưu / chia sẻ ảnh chỉ dùng được trên ứng dụng điện thoại.
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: 10 },
  accounts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 13, lineHeight: 18 },
  hint: { fontSize: 12.5, lineHeight: 17 },
  preview: { height: 240, flexGrow: 0, flexShrink: 0 },
  previewContent: { alignItems: 'center' },
  shot: { width: 300, backgroundColor: '#FFFFFF' },
  actions: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  card: { backgroundColor: '#FFFFFF', padding: 16, gap: 4 },
  kicker: { fontSize: 12.5, lineHeight: 17 },
  name: { fontSize: 22, lineHeight: 28 },
  total: { fontSize: 28, lineHeight: 36, marginBottom: 4 },
  block: { marginTop: 6 },
  blockTitle: { fontSize: 12.5, lineHeight: 17, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14, lineHeight: 19 },
  rowSub: { fontSize: 12, lineHeight: 16 },
  rowAmount: { fontSize: 14, lineHeight: 19 },
  footer: { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 },
  footerText: { flex: 1, minWidth: 0, gap: 1 },
});
