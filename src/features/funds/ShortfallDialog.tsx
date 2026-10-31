import { useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll';
import { AppText } from '@/components/app-text';
import { PrimaryButton, SecondaryButton } from '@/components/design';
import { FormLabel } from '@/components/expense-form-parts';
import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { ModalPresence } from '@/components/modal-presence';
import { PersonSelect } from '@/features/funds/PersonSelect';
import { useColors } from '@/hooks/use-colors';
import { formatVnd } from '@/utils/format';

interface Props {
  /** Tiền thực tế trong quỹ (≤ 0 thì coi là 0). */
  cash: number;
  /** Số tiền khoản chi đang nhập. */
  amount: number;
  /** Những người của quỹ để chọn người chi. */
  members: readonly string[];
  busy?: boolean;
  onClose: () => void;
  /** Bấm Xác nhận với người chi đã chọn: nơi chứa ghi khoản chi (quỹ chi phần đang có, người chi ứng phần còn thiếu). */
  onConfirm: (person: string) => void;
}

/**
 * Hộp thoại "Không đủ số dư quỹ" khi khoản chi vượt số dư: các dòng Số dư quỹ / Khoản chi / Còn thiếu, ghi chú đỏ "Phần còn thiếu sẽ do cá nhân ứng chi trước",
 * ô chọn người chi (ngăn xếp như các ô chọn người khác) và hai nút Đóng / Xác nhận ở dưới. Chưa chọn người thì Xác nhận báo lỗi ngay dưới ô chọn.
 */
export function ShortfallDialog({ cash, amount, members, busy, onClose, onConfirm }: Props) {
  const colors = useColors();
  const [person, setPerson] = useState('');
  const [error, setError] = useState('');
  const available = Math.max(0, cash);
  const missing = Math.max(0, amount - available);

  return (
    <Modal
      transparent
      animationType="fade"
      visible
      statusBarTranslucent
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <ModalPresence />
      <KeyboardAvoid style={[styles.scrim, { backgroundColor: colors.scrim }]}>
        <View style={[styles.dialog, { backgroundColor: colors.surface }]} accessibilityViewIsModal>
          <AppText weight="bold" style={styles.title}>
            Không đủ số dư quỹ
          </AppText>
          <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
            <Line label="Số dư quỹ" value={formatVnd(available)} />
            <Line label="Khoản chi" value={formatVnd(amount)} />
            <Line label="Còn thiếu" value={formatVnd(missing)} valueColor={colors.danger} bold />
            <AppText color={colors.danger} style={styles.note}>
              Phần còn thiếu sẽ do cá nhân ứng chi trước
            </AppText>
            <View style={styles.field}>
              <FormLabel>Người chi</FormLabel>
              <PersonSelect
                members={members}
                value={person}
                onChange={(name) => {
                  setPerson(name);
                  setError('');
                }}
                accessibilityLabel="Người chi"
              />
              {!!error && (
                <AppText color={colors.danger} style={styles.error} accessibilityRole="alert">
                  {error}
                </AppText>
              )}
            </View>
          </KeyboardAwareScrollView>
          <View style={styles.buttons}>
            <SecondaryButton label="Đóng" disabled={busy} onPress={onClose} style={styles.flex} />
            <PrimaryButton
              label="Xác nhận"
              disabled={busy}
              onPress={() => {
                if (!person.trim()) {
                  setError('Chọn người chi.');
                  return;
                }
                onConfirm(person.trim());
              }}
              style={styles.flex}
            />
          </View>
        </View>
      </KeyboardAvoid>
    </Modal>
  );
}

function Line({ label, value, valueColor, bold }: { label: string; value: string; valueColor?: string; bold?: boolean }) {
  const colors = useColors();
  return (
    <View style={styles.line}>
      <AppText color={colors.muted} style={styles.lineText}>
        {label}
      </AppText>
      <AppText weight={bold ? 'bold' : 'semibold'} color={valueColor} style={styles.lineText}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  // Hộp thoại đặt cao hơn giữa màn hình và CỐ ĐỊNH mép trên: mở danh sách người thì chỉ mép dưới dài xuống, hộp thoại không nhảy lên / xuống.
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', paddingHorizontal: 24, paddingTop: 72, paddingBottom: 24 },
  dialog: { width: '100%', maxWidth: 360, maxHeight: '90%', borderRadius: 20, padding: 20, gap: 10 },
  title: { fontSize: 18, lineHeight: 24 },
  body: { gap: 8 },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  lineText: { fontSize: 15.5, lineHeight: 22 },
  note: { fontSize: 13, lineHeight: 18 },
  field: { gap: 6, marginTop: 6 },
  error: { fontSize: 13 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 6 },
});
