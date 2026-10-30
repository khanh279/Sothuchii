import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { AppTextInput as TextInput } from '@/components/app-text-input';
import { useToast } from '@/components/toast';
import { AppFonts } from '@/constants/fonts';
import { AppRadius } from '@/constants/palette';
import { MAX_BANK_ACCOUNTS } from '@/domain/expenses';
import { VN_BANKS, bankByBin } from '@/domain/vnBanks';
import { cleanAccount, isValidAccount } from '@/domain/vietQr';
import { describeStorageError } from '@/features/expenses/hooks';
import { useColors } from '@/hooks/use-colors';
import type { ExpenseSettings } from '@/types/expense';

/**
 * Thẻ "Nhận tiền bằng mã QR" ở trang Thiết lập: danh sách các tài khoản nhận tiền đã lưu (tối đa `MAX_BANK_ACCOUNTS`, mỗi tài khoản có nút Xoá) và biểu mẫu thêm tài khoản mới
 * (chọn ngân hàng, số tài khoản, tên chủ tài khoản). Chỉ lưu trong máy (cùng nơi với các thiết lập khác nên được sao lưu cùng); dùng để tạo mã QR chuyển khoản ở thẻ xác nhận thanh toán
 * khi người khác nợ mình, có nhiều tài khoản thì chọn tài khoản ngay trên thẻ QR. Không gửi thông tin này đi đâu.
 */
export function BankAccountSection({ settings, save }: { settings: ExpenseSettings; save: (next: ExpenseSettings) => Promise<void> }) {
  const colors = useColors();
  const toast = useToast();
  const saved = settings.banks ?? [];
  const full = saved.length >= MAX_BANK_ACCOUNTS;
  const [bin, setBin] = useState('');
  const [account, setAccount] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const inputStyle = [styles.input, { backgroundColor: colors.bg, borderColor: colors.line, color: colors.ink, fontFamily: AppFonts.regular }];

  async function add() {
    const digits = cleanAccount(account);
    if (!bankByBin(bin)) return setError('Chọn ngân hàng.');
    if (!isValidAccount(digits)) return setError('Số tài khoản gồm 6 đến 19 chữ số.');
    if (saved.some((item) => item.bin === bin && item.account === digits)) return setError('Tài khoản này đã có trong danh sách.');
    setError('');
    try {
      await save({ ...settings, banks: [...saved, { bin, account: digits, name: name.trim().slice(0, 60) }] });
      setBin('');
      setAccount('');
      setName('');
      toast.show('Đã lưu tài khoản nhận tiền');
    } catch (e) {
      setError(describeStorageError(e));
    }
  }

  async function remove(index: number) {
    try {
      const next = saved.filter((_, i) => i !== index);
      await save({ ...settings, banks: next.length > 0 ? next : undefined });
      toast.show('Đã xoá tài khoản nhận tiền');
    } catch (e) {
      setError(describeStorageError(e));
    }
  }

  return (
    <View style={styles.section}>
      <View style={[styles.panel, { backgroundColor: colors.surface }]}>
        <AppText weight="display" style={styles.title}>
          Nhận tiền bằng mã QR
        </AppText>
        <AppText color={colors.muted} style={styles.note}>
          Lưu tài khoản của bạn (có thể nhiều tài khoản) để tạo mã QR khi người khác nợ bạn: họ quét bằng app ngân hàng là có sẵn số tiền và nội dung. Thông tin chỉ nằm trong máy này.
        </AppText>

        {saved.map((item, index) => (
          <View key={`${item.bin}:${item.account}`} style={[styles.saved, { backgroundColor: colors.bg, borderColor: colors.line }]}>
            <View style={styles.savedText}>
              <AppText weight="semibold" style={styles.savedTitle} numberOfLines={1}>
                {bankByBin(item.bin)?.code ?? 'Ngân hàng'} · {item.account}
              </AppText>
              {!!item.name && (
                <AppText color={colors.muted} style={styles.note} numberOfLines={1}>
                  {item.name}
                </AppText>
              )}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Xoá tài khoản ${item.account}`} hitSlop={8} onPress={() => void remove(index)} style={styles.removeButton}>
              <AppText weight="semibold" color={colors.danger} style={styles.removeText}>
                Xoá
              </AppText>
            </Pressable>
          </View>
        ))}

        {full ? (
          <AppText color={colors.muted} style={styles.note}>
            Đã có tối đa {MAX_BANK_ACCOUNTS} tài khoản. Xoá bớt để thêm tài khoản khác.
          </AppText>
        ) : (
          <>
            <AppText weight="semibold" style={styles.subTitle}>
              Thêm tài khoản
            </AppText>
            <AppText weight="medium" color={colors.muted} style={styles.label}>
              Ngân hàng
            </AppText>
            <View style={styles.chips}>
              {VN_BANKS.map((bank) => {
                const selected = bank.bin === bin;
                return (
                  <Pressable
                    key={bank.bin}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={bank.name}
                    onPress={() => {
                      setBin(bank.bin);
                      setError('');
                    }}
                    style={[styles.chip, selected ? { backgroundColor: colors.primary, borderColor: colors.primary } : { backgroundColor: colors.bg, borderColor: colors.line }]}>
                    <AppText weight="semibold" color={selected ? colors.primaryInk : colors.ink} style={styles.chipText}>
                      {bank.code}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            <AppText weight="medium" color={colors.muted} style={styles.label}>
              Số tài khoản
            </AppText>
            <TextInput
              value={account}
              onChangeText={(text) => {
                setAccount(text);
                setError('');
              }}
              keyboardType="number-pad"
              maxLength={24}
              placeholder="Ví dụ: 0123456789"
              placeholderTextColor={colors.muted}
              accessibilityLabel="Số tài khoản"
              style={inputStyle}
            />

            <AppText weight="medium" color={colors.muted} style={styles.label}>
              Tên chủ tài khoản (hiện cạnh mã QR)
            </AppText>
            <TextInput
              value={name}
              onChangeText={setName}
              maxLength={60}
              autoCapitalize="characters"
              placeholder="Ví dụ: NGUYEN VAN A"
              placeholderTextColor={colors.muted}
              accessibilityLabel="Tên chủ tài khoản"
              style={inputStyle}
            />

            {!!error && (
              <AppText color={colors.danger} style={styles.note} accessibilityRole="alert">
                {error}
              </AppText>
            )}
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" onPress={() => void add()} style={[styles.button, { backgroundColor: colors.primary }]}>
                <AppText weight="semibold" color={colors.primaryInk} style={styles.buttonText}>
                  Thêm tài khoản
                </AppText>
              </Pressable>
            </View>
          </>
        )}
        {full && !!error && (
          <AppText color={colors.danger} style={styles.note} accessibilityRole="alert">
            {error}
          </AppText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: 6 },
  panel: { borderRadius: AppRadius.card, padding: 16, gap: 8 },
  title: { fontSize: 18, lineHeight: 24 },
  subTitle: { fontSize: 15, lineHeight: 21, marginTop: 6 },
  note: { fontSize: 12.5, lineHeight: 17 },
  label: { fontSize: 12.5, lineHeight: 17, marginTop: 4 },
  saved: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  savedText: { flex: 1, minWidth: 0 },
  savedTitle: { fontSize: 15, lineHeight: 21 },
  removeButton: { paddingHorizontal: 6, paddingVertical: 4 },
  removeText: { fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: AppRadius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 13, lineHeight: 18 },
  input: { minHeight: 46, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, fontSize: 16 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  button: { minHeight: 46, borderRadius: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 15 },
});
