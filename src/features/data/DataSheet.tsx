import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { SheetFrame, SheetHeader } from '@/components/sheet-frame';
import { createBackupText, restoreFromText, wipeSection } from '@/data/backupRepository';
import { StorageCorruptError } from '@/data/storage';
import { backupFileName, parseBackup, type BackupSection } from '@/domain/backup';
import { useColors } from '@/hooks/use-colors';

interface Props {
  onClose: () => void;
  /** Dữ liệu vừa được khôi phục / xoá: màn cha đọc lại. */
  onDataChanged: () => void;
}

const WIPE_ORDER: BackupSection[] = ['quy-nhom', 'chia-bill', 'chi-tieu'];
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

/** Một file sao lưu đã chọn: tên (để hiện) và nội dung văn bản. */
interface PickedFile {
  name: string;
  text: string;
}

/** Chọn file bằng ô chọn file của trình duyệt (bản web); đóng hộp chọn không chọn gì thì trả null. */
function pickTextFileWeb(): Promise<PickedFile | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json,text/plain';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) resolve(null);
      else file.text().then((text) => resolve({ name: file.name, text }), reject);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** Mở bảng chọn file của hệ thống (web: ô chọn file; điện thoại: `File.pickFileAsync`) rồi đọc nội dung văn bản. */
async function pickTextFile(): Promise<PickedFile | null> {
  if (Platform.OS === 'web') return pickTextFileWeb();
  const picked = await File.pickFileAsync({ mimeTypes: ['application/json', 'text/plain', '*/*'] });
  if (picked.canceled) return null;
  return { name: picked.result.name, text: await picked.result.text() };
}

/**
 * Bảng "Sao lưu và khôi phục" (`#stSheet` của PWA): thẻ Sao lưu (lưu ra FILE), thẻ Khôi phục (CHỌN FILE sao lưu rồi khôi phục) và nút "Xoá tất cả dữ liệu". Khôi phục và xoá bấm hai lần ("Bấm lại để xác nhận"). Khôi phục THAY phần dữ liệu có trong file.
 * Kết quả hiện ngay trong bảng (thông báo nổi có thể bị bảng che).
 */
export function DataSheet({ onClose, onDataChanged }: Props) {
  const colors = useColors();
  const [picked, setPicked] = useState<PickedFile | null>(null);
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
        // Điện thoại: ghi file .json vào thư mục tạm rồi mở bảng chia sẻ / lưu của hệ thống (Lưu vào Tệp, Drive…).
        if (!(await Sharing.isAvailableAsync())) {
          say('Máy này không mở được bảng lưu file.', true);
          return;
        }
        const file = new File(Paths.cache, name);
        file.create({ overwrite: true });
        file.write(data);
        await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: name });
      }
    } catch (e) {
      say(describeError(e), true);
    }
  }

  async function pickFile() {
    try {
      const file = await pickTextFile();
      if (!file) return;
      const parsed = parseBackup(file.text);
      if (!parsed.ok) {
        setPicked(null);
        say(parsed.error, true);
        return;
      }
      setPicked(file);
      setMessage(null);
    } catch {
      setPicked(null);
      say('Không đọc được file này. Hãy thử lại.', true);
    }
  }

  function restore() {
    if (!picked) return;
    const { text } = picked;
    confirmThen('restore', async () => {
      const result = await restoreFromText(text);
      if (!result.ok) {
        say(result.error, true);
        return;
      }
      onDataChanged();
      setPicked(null);
      say(result.message);
    });
  }

  /** Xoá cả ba phần (Quỹ nhóm và Chia bill trước, vì chúng còn xoá các khoản chi cá nhân do chúng tạo; Chi tiêu sau cùng). */
  function wipeAll() {
    confirmThen('wipe:all', async () => {
      for (const section of WIPE_ORDER) await wipeSection(section);
      onDataChanged();
      say('Đã xoá tất cả dữ liệu');
    });
  }

  return (
    <SheetFrame onClose={onClose}>
      <SheetHeader title="Sao lưu và khôi phục" />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!!message && (
          <View style={[styles.message, { backgroundColor: message.error ? colors.dangerSoft : colors.primarySoft }]} accessibilityRole="alert">
            <AppText weight="semibold" color={message.error ? colors.danger : colors.primary} style={styles.messageText}>
              {message.text}
            </AppText>
          </View>
        )}

        <View style={[styles.section, { backgroundColor: colors.bg }]}>
          <AppText weight="bold" style={styles.h3}>
            Sao lưu
          </AppText>
          <View style={styles.row}>
            <Button label="Lưu file sao lưu" primary onPress={() => void save()} />
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: colors.bg }]}>
          <AppText weight="bold" style={styles.h3}>
            Khôi phục
          </AppText>
          {!!picked && (
            <AppText color={colors.muted} style={styles.fileName} numberOfLines={1}>
              {picked.name}
            </AppText>
          )}
          <View style={styles.row}>
            <Button label={picked ? 'Chọn file khác' : 'Chọn file khôi phục'} primary={!picked} disabled={busy} onPress={() => void pickFile()} />
            {!!picked && (
              <Button
                label={armed === 'restore' ? 'Xác nhận' : 'Khôi phục'}
                primary={armed !== 'restore'}
                armed={armed === 'restore'}
                disabled={busy}
                onPress={restore}
              />
            )}
          </View>
        </View>

        <Button label={armed === 'wipe:all' ? 'Bấm lại để xác nhận' : 'Xoá tất cả dữ liệu'} danger armed={armed === 'wipe:all'} disabled={busy} onPress={wipeAll} />
      </ScrollView>
    </SheetFrame>
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
  const background = armed ? colors.danger : primary ? colors.primary : colors.surface;
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
  content: { paddingTop: 12, paddingBottom: 4, gap: 12 },
  message: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  messageText: { fontSize: 14 },
  section: { gap: 10, padding: 14, borderRadius: 16 },
  h3: { fontSize: 15 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fileName: { fontSize: 13.5 },
  button: { flexGrow: 1, flexBasis: 0, minWidth: 96, minHeight: 44, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 14.5 },
});
