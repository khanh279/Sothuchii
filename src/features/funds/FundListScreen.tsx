import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { AppTextInput as TextInput } from '@/components/app-text-input';
import { LockableScrollView } from '@/components/lockable-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { EmptyState, PrimaryButton, ScreenTitle, SecondaryButton, TitleAction } from '@/components/design';
import { SheetFrame, SheetHeader, useSheetClose } from '@/components/sheet-frame';
import { PageLayout } from '@/constants/layout';
import { SvgIcon } from '@/components/svg-icon';
import { SwipeRow } from '@/components/swipe-row';
import { useToast } from '@/components/toast';
import { AppFonts } from '@/constants/fonts';
import { FundInputError } from '@/data/fundRepository';
import { createFundSynced, deleteFundSynced, renameFundSynced } from '@/data/fundService';
import { FundBalanceText } from '@/features/funds/FundBalanceText';
import { fundPosition } from '@/domain/fundAdvance';
import { FUND_NAME_MAX, fundLastActivity } from '@/domain/funds';
import { describeFundError, useFundData } from '@/features/funds/hooks';
import { useChromeScroll } from '@/hooks/use-chrome';
import { useColors } from '@/hooks/use-colors';
import type { Fund } from '@/types/fund';
import { formatVnDate } from '@/utils/date';
import { formatVnd } from '@/utils/format';
import { router } from '@/utils/safe-router';

/** Đang soạn tên quỹ: thêm mới, hoặc đổi tên một quỹ có sẵn. */
type Editing = { mode: 'add' } | { mode: 'edit'; id: string };

/**
 * Tab "Quỹ nhóm": tiêu đề và nút "+ Giao dịch quỹ" (menu Thu quỹ / Chi tiêu quỹ, mở đúng form đóng quỹ / chi quỹ có sẵn cho quỹ chọn
 * trong tờ nổi), rồi danh sách quỹ dạng thẻ nhỏ (tên, số dư, ngày cập nhật gần nhất): chạm một quỹ để mở lịch sử và chi tiết của quỹ đó
 * (màn Lịch sử quỹ có sẵn); đổi tên, xoá bằng cách vuốt dòng. Nút "+ Quỹ mới" ở góc phải tiêu đề mở thẻ tạo quỹ ở giữa màn hình.
 */
export default function FundListScreen() {
  const { ref: scrollRef, props: scrollProps } = useChromeScroll();
  const colors = useColors();
  const toast = useToast();
  const insets = useSafeAreaInsets();
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
      const created = await createFundSynced(name);
      void created;
      return 'Đã tạo quỹ mới';
    });

  const remove = (fund: Fund) =>
    run(async () => {
      await deleteFundSynced(fund.id);
      return 'Đã xóa quỹ';
    });

  // Nút "+ Quỹ mới" nằm ở góc phải ngang với tiêu đề; bấm mở thẻ tạo quỹ ở giữa màn hình.
  const title = (
    <ScreenTitle
      title="Quỹ nhóm"
      topInset={insets.top}
      right={
        <TitleAction
          label="Quỹ mới"
          onPress={() => {
            setOpenId(null);
            setEditing({ mode: 'add' });
          }}
        />
      }
    />
  );

  if (error) {
    return (
      <View style={styles.flex}>
        {title}
        <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
          <AppText color={colors.danger} style={styles.noticeText}>
            {error}
          </AppText>
        </View>
      </View>
    );
  }
  if (!loaded) {
    return (
      <View style={styles.flex}>
        {title}
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      {title}
      <LockableScrollView ref={scrollRef} {...scrollProps} contentContainerStyle={styles.list} onScrollBeginDrag={() => setOpenId(null)} keyboardShouldPersistTaps="handled">
        {data.funds.length === 0 && <EmptyState text="Chưa có quỹ nào. Tạo quỹ mới để bắt đầu ghi nhận thu và chi của nhóm." icon="check" />}

        {data.funds.map((fund) => {
          const position = fundPosition(data, fund.id);
          const balance = position.cash;
          const last = fundLastActivity(data, fund.id);
          return (
            <View key={fund.id} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <SwipeRow
                open={openId === fund.id}
                onOpen={() => setOpenId(fund.id)}
                onClose={() => setOpenId((current) => (current === fund.id ? null : current))}
                onPressRow={() => {
                  setOpenId(null);
                  router.push({ pathname: '/quy/lich-su', params: { fund: fund.id } });
                }}
                onEdit={() => setEditing({ mode: 'edit', id: fund.id })}
                onDelete={() => void remove(fund)}
                background={colors.surface}
                radius={15}
                accessibilityLabel={`${fund.name}, số dư ${formatVnd(balance)}`}
              >
                <View style={styles.head}>
                  <View style={styles.nameCol}>
                    <AppText weight="bold" style={styles.name} numberOfLines={1}>
                      {fund.name}
                    </AppText>
                    <AppText color={colors.muted} style={styles.balanceLabel} numberOfLines={1}>
                      {last ? `Cập nhật ${formatVnDate(last)}` : 'Chưa có giao dịch'}
                    </AppText>
                  </View>
                  <View style={styles.balanceCol}>
                    <FundBalanceText balance={balance} />
                  </View>
                  <SvgIcon name="chevronRight" size={16} color={colors.muted} strokeWidth={2} />
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
          );
        })}

      </LockableScrollView>

      {editing?.mode === 'add' && <AddFundSheet busy={busy} onSave={save} onClose={() => setEditing(null)} />}
    </View>
  );
}

/** Thẻ tạo quỹ mới hiện Ở GIỮA màn hình: ô nhập tên (tối đa `FUND_NAME_MAX` ký tự), Lưu và Hủy; Hủy / chạm nền thì thẻ mờ dần rồi đóng. */
function AddFundSheet({ busy, onSave, onClose }: { busy: boolean; onSave: (name: string) => void; onClose: () => void }) {
  return (
    <SheetFrame placement="center" onClose={onClose}>
      <SheetHeader title="Thêm quỹ mới" />
      <AddFundForm busy={busy} onSave={onSave} />
    </SheetFrame>
  );
}

/**
 * Biểu mẫu tạo quỹ trong tờ đáy: ô nhập tên lớn (viền đổi màu khi đang nhập, đếm ký tự tới `FUND_NAME_MAX`), rồi hai nút bằng nhau: Hủy và Tạo quỹ
 * (nút Tạo quỹ mờ khi chưa có tên). Không tự bật bàn phím khi mở để bàn phím không che tờ; chạm vào ô để nhập.
 */
function AddFundForm({ busy, onSave }: { busy: boolean; onSave: (name: string) => void }) {
  const colors = useColors();
  const hide = useSheetClose();
  const [name, setName] = useState('');
  const [focused, setFocused] = useState(false);
  const ready = name.trim().length > 0 && !busy;
  return (
    <View style={styles.addForm}>
      <View style={styles.addField}>
        <AppText weight="medium" color={colors.muted} style={styles.label}>
          Tên quỹ
        </AppText>
        <TextInput
          value={name}
          onChangeText={setName}
          maxLength={FUND_NAME_MAX}
          placeholder="Ví dụ: Quỹ ăn trưa"
          placeholderTextColor={colors.muted}
          returnKeyType="done"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={() => ready && onSave(name)}
          style={[styles.addInput, { backgroundColor: colors.bg, borderColor: focused ? colors.primary : colors.line, color: colors.ink, fontFamily: AppFonts.semibold }]}
        />
        <AppText color={colors.muted} style={styles.addCounter}>
          {name.length}/{FUND_NAME_MAX}
        </AppText>
      </View>
      <View style={styles.addButtons}>
        <SecondaryButton label="Hủy" onPress={() => hide()} style={styles.addAction} />
        <PrimaryButton label="Tạo quỹ" onPress={() => onSave(name)} disabled={!ready} style={styles.addAction} />
      </View>
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
          style={[styles.smallButton, styles.saveButton, { backgroundColor: colors.primary, borderColor: colors.primary }]}
        >
          <AppText weight="semibold" color={colors.primaryInk} style={styles.smallText}>
            Lưu
          </AppText>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onCancel} style={[styles.smallButton, { backgroundColor: colors.surface, borderColor: colors.line }]}>
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
  list: { paddingHorizontal: PageLayout.paddingX, paddingTop: PageLayout.contentTop, paddingBottom: 24, gap: PageLayout.gap },
  row: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  head: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  nameCol: { flex: 1, minWidth: 0, justifyContent: 'center' },
  name: { fontSize: 16, lineHeight: 20 },
  balanceCol: { alignItems: 'flex-end', justifyContent: 'center', maxWidth: '50%' },
  balanceLabel: { fontSize: 11, lineHeight: 18 },
  form: { padding: 14 },
  addForm: { paddingTop: 4, paddingBottom: 8, gap: 14 },
  addField: { gap: 2 },
  addInput: { height: 52, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, fontSize: 18 },
  addCounter: { alignSelf: 'flex-end', fontSize: 12, lineHeight: 16, marginTop: 4 },
  addButtons: { flexDirection: 'row', gap: 12 },
  addAction: { flex: 1 },
  label: { fontSize: 13, marginBottom: 4 },
  input: { height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 18 },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 12 },
  smallButton: { minHeight: 36, paddingHorizontal: 11, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  saveButton: { flex: 1 },
  smallText: { fontSize: 13.5 },
  addButton: { minHeight: 46, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  addText: { fontSize: 16 },
  menuOption: { minHeight: 64, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  menuLabel: { fontSize: 15.5, lineHeight: 21 },
  menuHint: { fontSize: 12.5, lineHeight: 17 },
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
