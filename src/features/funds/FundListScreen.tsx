import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { SvgIcon } from '@/components/svg-icon';
import { SwipeRow } from '@/components/swipe-row';
import { useToast } from '@/components/toast';
import { AppFonts } from '@/constants/fonts';
import { FundInputError } from '@/data/fundRepository';
import { createFundSynced, deleteFundSynced, renameFundSynced } from '@/data/fundService';
import { FUND_NAME_MAX, fundBalance } from '@/domain/funds';
import { ContributionForm } from '@/features/funds/ContributionForm';
import { FundExpenseForm } from '@/features/funds/FundExpenseForm';
import { describeFundError, useFundData } from '@/features/funds/hooks';
import { useColors } from '@/hooks/use-colors';
import type { Fund } from '@/types/fund';
import { withAlpha } from '@/utils/color';

/** Đang soạn tên quỹ: thêm mới, hoặc đổi tên một quỹ có sẵn. */
type Editing = { mode: 'add' } | { mode: 'edit'; id: string };
type EntryMode = 'thu' | 'chi';

/**
 * Danh sách quỹ (phần "Đóng quỹ" của tab Giao dịch): tạo quỹ mới, đổi tên, xoá bằng cách vuốt dòng;
 * chạm một quỹ để mở form Thu (đóng quỹ) / Chi (chi quỹ) của quỹ đó. Nút "Thêm khoản chi" ở góc mở form chi
 * cho quỹ tuỳ chọn. Xem / sửa / xoá các lần đóng và khoản chi đã lưu thuộc bước 3E.
 */
export default function FundListScreen() {
  const colors = useColors();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { data, loaded, error, reload } = useFundData();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [entryMode, setEntryMode] = useState<EntryMode>('thu');
  const [sheetFundId, setSheetFundId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
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
      const created = await createFundSynced(name);
      setExpandedId(created.value.id); // PWA: quỹ vừa tạo được mở sẵn
      setEntryMode('thu');
      return 'Đã tạo quỹ mới';
    });

  const remove = (fund: Fund) =>
    run(async () => {
      await deleteFundSynced(fund.id);
      if (expandedId === fund.id) setExpandedId(null);
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

  const sheetFund = data.funds.find((fund) => fund.id === sheetFundId) ?? data.funds[0] ?? null;

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.list, data.funds.length ? styles.listWithFab : null]}
        onScrollBeginDrag={() => setOpenId(null)}
        keyboardShouldPersistTaps="handled">
        {data.funds.map((fund) => {
          const expanded = expandedId === fund.id;
          return (
            <View
              key={fund.id}
              style={[styles.row, { backgroundColor: colors.surface, borderColor: expanded ? colors.primary : colors.line }]}>
              <SwipeRow
                open={openId === fund.id}
                onOpen={() => setOpenId(fund.id)}
                onClose={() => setOpenId((current) => (current === fund.id ? null : current))}
                onPressRow={() => {
                  setOpenId(null);
                  setExpandedId(expanded ? null : fund.id);
                }}
                onEdit={() => setEditing({ mode: 'edit', id: fund.id })}
                onDelete={() => void remove(fund)}
                background={colors.surface}
                radius={13}
                accessibilityLabel={fund.name}>
                <View style={styles.head}>
                  <AppText weight="bold" style={styles.name}>
                    {fund.name}
                  </AppText>
                  <View style={{ transform: [{ rotate: expanded ? '-90deg' : '90deg' }] }}>
                    <SvgIcon name="chevronRight" size={18} color={colors.muted} />
                  </View>
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

              {expanded && (
                <View style={[styles.body, { backgroundColor: colors.bg, borderTopColor: colors.line }]}>
                  <EntryTabs mode={entryMode} onChange={setEntryMode} />
                  {entryMode === 'thu' ? (
                    <ContributionForm fund={fund} onChanged={reload} />
                  ) : (
                    <FundExpenseForm fund={fund} balance={fundBalance(data, fund.id)} onChanged={reload} />
                  )}
                </View>
              )}
            </View>
          );
        })}

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

      {data.funds.length > 0 && (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setSheetFundId(expandedId ?? data.funds[0].id);
            setSheetOpen(true);
          }}
          style={[styles.fab, { backgroundColor: colors.primary }]}>
          <SvgIcon name="plus" size={20} color={colors.primaryInk} />
          <AppText weight="semibold" color={colors.primaryInk} style={styles.fabText}>
            Thêm khoản chi
          </AppText>
        </Pressable>
      )}

      {sheetOpen && sheetFund && (
        <Modal transparent animationType="fade" visible onRequestClose={() => setSheetOpen(false)}>
          <View style={[styles.scrim, { backgroundColor: withAlpha('#000000', 0.45) }]}>
            <Pressable style={styles.flex} onPress={() => setSheetOpen(false)} accessibilityLabel="Đóng" />
            <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: 16 + insets.bottom }]}>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetContent}>
                <Pressable accessibilityRole="button" accessibilityLabel="Đóng" onPress={() => setSheetOpen(false)} style={styles.close}>
                  <AppText weight="bold" color={colors.muted} style={styles.closeText}>
                    ×
                  </AppText>
                </Pressable>
                {data.funds.length > 1 && (
                  <View style={styles.fundChips}>
                    {data.funds.map((fund) => {
                      const selected = fund.id === sheetFund.id;
                      return (
                        <Pressable
                          key={fund.id}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          onPress={() => setSheetFundId(fund.id)}
                          style={[styles.fundChip, { borderColor: selected ? colors.primary : colors.line, backgroundColor: selected ? colors.primarySoft : colors.bg }]}>
                          <AppText weight="semibold" color={selected ? colors.primary : colors.ink} style={styles.chipLabel} numberOfLines={1}>
                            {fund.name}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
                <FundExpenseForm
                  key={sheetFund.id}
                  fund={sheetFund}
                  balance={fundBalance(data, sheetFund.id)}
                  onChanged={() => {
                    setSheetOpen(false);
                    void reload();
                  }}
                />
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

/** Thanh chuyển Thu / Chi trong một quỹ (`#entryTabs` của PWA). */
function EntryTabs({ mode, onChange }: { mode: EntryMode; onChange: (mode: EntryMode) => void }) {
  const colors = useColors();
  return (
    <View style={[styles.tabs, { backgroundColor: colors.surface, borderColor: colors.line }]} accessibilityRole="tablist">
      {(['thu', 'chi'] as const).map((id) => {
        const selected = id === mode;
        return (
          <Pressable
            key={id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(id)}
            style={[styles.tab, selected && { backgroundColor: colors.primary }]}>
            <AppText weight="semibold" color={selected ? colors.primaryInk : colors.muted} style={styles.tabText}>
              {id === 'thu' ? 'Thu' : 'Chi'}
            </AppText>
          </Pressable>
        );
      })}
    </View>
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
  flex: { flex: 1 },
  list: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 24, gap: 10 },
  listWithFab: { paddingBottom: 90 },
  row: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  head: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  name: { fontSize: 16, flex: 1 },
  body: { padding: 14, gap: 12, borderTopWidth: 1 },
  tabs: { flexDirection: 'row', gap: 4, padding: 4, borderWidth: 1, borderRadius: 12 },
  tab: { flex: 1, minHeight: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 14 },
  form: { padding: 14 },
  label: { fontSize: 13, marginBottom: 4 },
  input: { height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 18 },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 12 },
  smallButton: { minHeight: 36, paddingHorizontal: 11, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  saveButton: { flex: 1 },
  smallText: { fontSize: 13.5 },
  addButton: { minHeight: 46, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  addText: { fontSize: 16 },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    height: 48,
    paddingHorizontal: 18,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fabText: { fontSize: 15 },
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '88%' },
  sheetContent: { padding: 16, gap: 12 },
  close: { alignSelf: 'flex-end', width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 24 },
  fundChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fundChip: { minHeight: 36, maxWidth: '100%', paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, justifyContent: 'center' },
  chipLabel: { fontSize: 14 },
  notice: { marginHorizontal: 12, marginTop: 12, padding: 14, borderRadius: 14 },
  noticeText: { fontSize: 14, lineHeight: 20 },
  loading: { marginTop: 40 },
});
