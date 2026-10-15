import { useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { AppFonts } from '@/constants/fonts';
import { createBackupText, restoreFromText, wipeSection } from '@/data/backupRepository';
import { StorageCorruptError } from '@/data/storage';
import { SECTION_LABELS, backupFileName, parseBackup, type BackupSection } from '@/domain/backup';
import { useColors } from '@/hooks/use-colors';
import { withAlpha } from '@/utils/color';

interface Props {
  onClose: () => void;
  /** Dữ liệu vừa được khôi phục / xoá: màn cha đọc lại. */
  onDataChanged: () => void;
}

const SECTIONS: BackupSection[] = ['chi-tieu', 'quy-nhom', 'chia-bill'];
const ARM_MS = 3200;

function describeError(error: unknown): string {
  if (error instanceof StorageCorruptError) return 'Một phần dữ liệu trên máy bị hỏng nên chưa xử lý được. App không ghi đè lên dữ liệu này.';
  return 'Không đọc hoặc ghi được dữ liệu. Hãy thử lại.';
}

/** Tải xuống một file văn bản (chỉ bản web). */
function downloadText(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Bảng "Sao lưu và dữ liệu" (`#stSheet` của PWA): lưu / sao chép sao lưu, khôi phục từ nội dung dán vào, và xoá dữ liệu
 * từng phần. Khôi phục và xoá bấm hai lần ("Bấm lại để xác nhận"). Khôi phục THAY phần dữ liệu có trong file.
 * Kết quả hiện ngay trong bảng (thông báo nổi có thể bị bảng che).
 */
export function DataSheet({ onClose, onDataChanged }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = (value: string, error = false) => setMessage({ text: value, error });

  /** Bấm lần đầu thì "lên đạn" trong 3,2 giây; bấm lần hai mới chạy. */
  function confirmThen(id: string, action: () => Promise<void>) {
    if (busy) return;
    if (armed !== id) {
      setArmed(id);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setArmed(null), ARM_MS);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    setArmed(null);
    setBusy(true);
    action()
      .catch((e) => say(describeError(e), true))
      .finally(() => setBusy(false));
  }

  async function save() {
    try {
      const data = await createBackupText();
      const name = backupFileName(new Date());
      if (Platform.OS === 'web') {
        downloadText(data, name);
        say(`Đã tạo file ${name}`);
      } else {
        await Share.share({ message: data, title: name });
      }
    } catch (e) {
      say(describeError(e), true);
    }
  }

  async function copy() {
    try {
      const data = await createBackupText();
      if (Platform.OS === 'web' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(data);
        say('Đã sao chép dữ liệu');
      } else {
        setText(data);
        say('Chọn và sao chép đoạn dữ liệu bên dưới');
      }
    } catch (e) {
      say(describeError(e), true);
    }
  }

  function restore() {
    const parsed = parseBackup(text);
    if (!parsed.ok) {
      say(parsed.error, true);
      return;
    }
    confirmThen('restore', async () => {
      const result = await restoreFromText(text);
      if (!result.ok) {
        say(result.error, true);
        return;
      }
      onDataChanged();
      setText('');
      say(result.message);
    });
  }

  function wipe(section: BackupSection) {
    confirmThen(`wipe:${section}`, async () => {
      await wipeSection(section);
      onDataChanged();
      say(`Đã xoá dữ liệu ${SECTION_LABELS[section]}`);
    });
  }

  const noteStyle = [styles.note, { color: colors.muted }];
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={[styles.scrim, { backgroundColor: withAlpha('#000000', 0.45) }]}>
        <Pressable style={styles.flex} onPress={onClose} accessibilityLabel="Đóng" />
        <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: 12 + insets.bottom }]}>
          <View style={styles.header}>
            <AppText weight="display" style={styles.title}>
              Sao lưu và dữ liệu
            </AppText>
            <Pressable accessibilityRole="button" accessibilityLabel="Đóng" onPress={onClose} style={styles.close}>
              <AppText weight="bold" color={colors.muted} style={styles.closeText}>
                ×
              </AppText>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {!!message && (
              <View style={[styles.message, { backgroundColor: message.error ? colors.dangerSoft : colors.primarySoft }]} accessibilityRole="alert">
                <AppText weight="semibold" color={message.error ? colors.danger : colors.primary} style={styles.messageText}>
                  {message.text}
                </AppText>
              </View>
            )}

            <View style={styles.section}>
              <AppText weight="bold" style={styles.h3}>
                Sao lưu
              </AppText>
              <AppText style={noteStyle}>
                Toàn bộ dữ liệu của sổ nằm trên máy này. Sao lưu thường xuyên, nhất là trước khi đổi máy hoặc xoá dữ liệu ứng dụng.
              </AppText>
              <View style={styles.row}>
                <Button label="Lưu file sao lưu" primary onPress={() => void save()} />
                <Button label="Sao chép dữ liệu" onPress={() => void copy()} />
              </View>
            </View>

            <View style={styles.section}>
              <AppText weight="bold" style={styles.h3}>
                Khôi phục
              </AppText>
              <AppText style={noteStyle}>
                Dán dữ liệu sao lưu vào ô dưới. Bản sao lưu Sổ Thu Chi sẽ thay phần dữ liệu có trong file. Bản sao lưu của app Quỹ nhóm cũ cũng dùng được.
              </AppText>
              <TextInput
                value={text}
                onChangeText={(value) => {
                  setText(value);
                  setMessage(null);
                }}
                multiline
                numberOfLines={3}
                placeholder="Dán dữ liệu sao lưu vào đây"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                accessibilityLabel="Dữ liệu sao lưu"
                style={[styles.textarea, { backgroundColor: colors.bg, borderColor: colors.line, color: colors.ink, fontFamily: AppFonts.regular }]}
              />
              <View style={styles.row}>
                <Button
                  label={armed === 'restore' ? 'Bấm lại để xác nhận' : 'Khôi phục'}
                  primary={armed !== 'restore'}
                  armed={armed === 'restore'}
                  disabled={!text.trim() || busy}
                  onPress={restore}
                />
              </View>
            </View>

            <View style={styles.section}>
              <AppText weight="bold" style={styles.h3}>
                Xoá dữ liệu
              </AppText>
              <AppText style={noteStyle}>
                Xoá toàn bộ dữ liệu của một phần, không hoàn tác được. Xoá Quỹ nhóm hoặc Chia bill cũng xoá các khoản chi cá nhân do phần đó tạo.
              </AppText>
              <View style={styles.row}>
                {SECTIONS.map((section) => (
                  <Button
                    key={section}
                    label={armed === `wipe:${section}` ? 'Bấm lại để xác nhận' : SECTION_LABELS[section]}
                    danger
                    armed={armed === `wipe:${section}`}
                    disabled={busy}
                    onPress={() => wipe(section)}
                  />
                ))}
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Button({
  label,
  onPress,
  primary,
  danger,
  armed,
  disabled,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  danger?: boolean;
  armed?: boolean;
  disabled?: boolean;
}) {
  const colors = useColors();
  const background = armed ? '#D64545' : primary ? colors.primary : colors.bg;
  const color = armed ? '#FFFFFF' : primary ? colors.primaryInk : danger ? colors.danger : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, { backgroundColor: background, borderColor: primary || armed ? 'transparent' : colors.line, opacity: disabled ? 0.45 : 1 }]}>
      <AppText weight="semibold" color={color} style={styles.buttonText}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '90%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 18, paddingRight: 8, paddingTop: 8 },
  title: { fontSize: 18 },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 24 },
  content: { paddingHorizontal: 18, paddingBottom: 12, gap: 18 },
  message: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  messageText: { fontSize: 14 },
  section: { gap: 8 },
  h3: { fontSize: 15 },
  note: { fontSize: 13, lineHeight: 18.85 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  textarea: { minHeight: 84, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, textAlignVertical: 'top' },
  button: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 14.5 },
});
