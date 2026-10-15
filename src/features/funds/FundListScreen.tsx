import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { SwipeRow } from '@/components/swipe-row';
import { useToast } from '@/components/toast';
import { AppFonts } from '@/constants/fonts';
import { createFundSynced, deleteFundSynced, renameFundSynced } from '@/data/fundService';
import { FundInputError } from '@/data/fundRepository';
import { FUND_NAME_MAX } from '@/domain/funds';
import { describeFundError, useFundData } from '@/features/funds/hooks';
import { useColors } from '@/hooks/use-colors';
import type { Fund } from '@/types/fund';

/** Đang soạn tên quỹ: thêm mới, hoặc đổi tên một quỹ có sẵn. */
type Editing = { mode: 'add' } | { mode: 'edit'; id: string };

/**
 * Danh sách quỹ (phần "Đóng quỹ" của tab Giao dịch): tạo quỹ mới, đổi tên và xoá bằng cách vuốt dòng.
 * Mở một quỹ để đóng quỹ / ghi khoản chi sẽ thêm ở bước 3D.
 */
export default function FundListScreen() {
  const colors = useColors();
  const toast = useToast();
  const { data, loaded, error, reload } = useFundData();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(task: () => Promise<string>) {
    if (busy) return;
    setBusy(true);
    try {
      const message = await task();
      setEditing(null);
      setOpenId(null);
      toast.show(message);
      await reload();
    } catch (e) {
      toast.show(e instanceof FundInputError ? e.message : describeFundError(e));
    } finally {
      setBusy(false);
    }
  }

  const save = (name: string) =>
    run(async () => {
      if (editing?.mode === 'edit') {
        await renameFundSynced(editing.id, name);
        return 'Đã đổi tên quỹ';
      }
      await createFundSynced(name);
      return 'Đã tạo quỹ mới';
    });

  const remove = (fund: Fund) =>
    run(async () => {
      await deleteFundSynced(fund.id);
      return 'Đã xóa quỹ';
    });

  if (error) {
    return (
      <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
        <AppText color={colors.danger} style={styles.noticeText}>
          {error}
        </AppText>
      </View>
    );
  }
  if (!loaded) return <ActivityIndicator style={styles.loading} color={colors.primary} />;

  return (
    <ScrollView
      contentContainerStyle={styles.list}
      onScrollBeginDrag={() => setOpenId(null)}
      keyboardShouldPersistTaps="handled">
      {data.funds.map((fund) => (
        <View key={fund.id} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <SwipeRow
            open={openId === fund.id}
            onOpen={() => setOpenId(fund.id)}
            onClose={() => setOpenId((current) => (current === fund.id ? null : current))}
            onPressRow={() => setOpenId(null)}
            onEdit={() => setEditing({ mode: 'edit', id: fund.id })}
            onDelete={() => void remove(fund)}
            background={colors.surface}
            radius={13}
            accessibilityLabel={fund.name}>
            <View style={styles.head}>
              <AppText weight="bold" style={styles.name}>
                {fund.name}
              </AppText>
            </View>
          </SwipeRow>
          {editing?.mode === 'edit' && editing.id === fund.id && (
            <NameForm
              label="Tên quỹ"
              initial={fund.name}
              busy={busy}
              onSave={save}
              onCancel={() => setEditing(null)}
              style={{ backgroundColor: colors.bg, borderTopColor: colors.line, borderTopWidth: 1 }}
            />
          )}
        </View>
      ))}

      {editing?.mode === 'add' && (
        <NameForm
          label="Tên quỹ mới"
          initial=""
          busy={busy}
          onSave={save}
          onCancel={() => setEditing(null)}
          style={{ backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 14 }}
        />
      )}

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setOpenId(null);
          setEditing({ mode: 'add' });
        }}
        style={[styles.addButton, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <AppText weight="semibold" color={colors.primary} style={styles.addText}>
          + Quỹ mới
        </AppText>
      </Pressable>
    </ScrollView>
  );
}

interface NameFormProps {
  label: string;
  initial: string;
  busy: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
  style: object;
}

/** Khung nhập tên quỹ (`.fedit` của PWA): ô nhập tối đa 40 ký tự, nút Lưu và Hủy. */
function NameForm({ label, initial, busy, onSave, onCancel, style }: NameFormProps) {
  const colors = useColors();
  const [name, setName] = useState(initial);
  return (
    <View style={[styles.form, style]}>
      <AppText weight="medium" color={colors.muted} style={styles.label}>
        {label}
      </AppText>
      <TextInput
        autoFocus
        value={name}
        onChangeText={setName}
        maxLength={FUND_NAME_MAX}
        placeholder="Ví dụ: Quỹ ăn trưa"
        placeholderTextColor={colors.muted}
        returnKeyType="done"
        onSubmitEditing={() => onSave(name)}
        style={[styles.input, { backgroundColor: colors.bg, borderColor: colors.line, color: colors.ink, fontFamily: AppFonts.semibold }]}
      />
      <View style={styles.buttons}>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => onSave(name)}
          style={[styles.smallButton, styles.saveButton, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
          <AppText weight="semibold" color={colors.primaryInk} style={styles.smallText}>
            Lưu
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onCancel}
          style={[styles.smallButton, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <AppText weight="semibold" style={styles.smallText}>
            Hủy
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

// Số đo lấy từ CSS `.mod-b` của PWA: dòng quỹ cao tối thiểu 58, bo 14, viền 1; ô nhập cao 46, bo 12, chữ 18/600;
// nút nhỏ cao 36, chữ 13.5; nút "+ Quỹ mới" viền nét đứt cao 46, bo 10; các dòng cách nhau 10.
const styles = StyleSheet.create({
  list: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 24, gap: 10 },
  row: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  head: { minHeight: 58, justifyContent: 'center', paddingHorizontal: 16 },
  name: { fontSize: 16 },
  form: { padding: 14 },
  label: { fontSize: 13, marginBottom: 4 },
  input: { height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 18 },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 12 },
  smallButton: { minHeight: 36, paddingHorizontal: 11, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  saveButton: { flex: 1 },
  smallText: { fontSize: 13.5 },
  addButton: { minHeight: 46, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  addText: { fontSize: 16 },
  notice: { marginHorizontal: 12, marginTop: 12, padding: 14, borderRadius: 14 },
  noticeText: { fontSize: 14, lineHeight: 20 },
  loading: { marginTop: 40 },
});
