import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { LockableScrollView } from '@/components/lockable-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { OptionSheet } from '@/components/option-sheet';
import { EmptyState, ScreenTitle, SecondaryButton, TitleAction } from '@/components/design';
import { PageLayout } from '@/constants/layout';
import { SvgIcon } from '@/components/svg-icon';
import { SwipeRow } from '@/components/swipe-row';
import { useToast } from '@/components/toast';
import { AppFonts } from '@/constants/fonts';
import { FundInputError } from '@/data/fundRepository';
import { createFundSynced, deleteFundSynced, renameFundSynced } from '@/data/fundService';
import { FUND_NAME_MAX, fundBalance, fundLastActivity } from '@/domain/funds';
import { FundTxnSheet } from '@/features/funds/FundTxnSheet';
import { describeFundError, useFundData } from '@/features/funds/hooks';
import { useChromeScroll } from '@/hooks/use-chrome';
import { useColors } from '@/hooks/use-colors';
import type { Fund } from '@/types/fund';
import { formatVnDate } from '@/utils/date';
import { formatVnd } from '@/utils/format';

/** Đang soạn tên quỹ: thêm mới, hoặc đổi tên một quỹ có sẵn. */
type Editing = { mode: 'add' } | { mode: 'edit'; id: string };

/**
 * Tab "Quỹ nhóm": tiêu đề và nút "+ Giao dịch quỹ" (menu Thu quỹ / Chi tiêu quỹ, mở đúng form đóng quỹ / chi quỹ có sẵn cho quỹ chọn
 * trong tờ nổi), rồi danh sách quỹ dạng thẻ nhỏ (tên, số dư, ngày cập nhật gần nhất): chạm một quỹ để mở lịch sử và chi tiết của quỹ đó
 * (màn Lịch sử quỹ có sẵn); tạo quỹ mới, đổi tên, xoá bằng cách vuốt dòng.
 */
export default function FundListScreen() {
  const { ref: scrollRef, props: scrollProps } = useChromeScroll();
  const colors = useColors();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { data, loaded, error, reload } = useFundData();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  /** Thẻ nổi chọn quỹ cho Thu quỹ / Chi tiêu quỹ (chọn từ menu Giao dịch quỹ). */
  const [txnSheet, setTxnSheet] = useState<'thu' | 'chi' | null>(null);
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

  const title = (
    <ScreenTitle title="Quỹ nhóm" topInset={insets.top} right={loaded && !error ? <TitleAction label="Giao dịch quỹ" onPress={() => setMenuOpen(true)} /> : undefined} />
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
        {data.funds.length === 0 && editing?.mode !== 'add' && <EmptyState text="Chưa có quỹ nào. Tạo quỹ mới để bắt đầu ghi nhận thu và chi của nhóm." icon="check" />}

        {data.funds.map((fund) => {
          const balance = fundBalance(data, fund.id);
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
                    <AppText color={colors.muted} style={styles.balanceLabel}>
                      Số dư
                    </AppText>
                    <AppText weight="bold" color={balance < 0 ? colors.danger : colors.success} style={styles.balance} numberOfLines={1}>
                      {formatVnd(balance)}
                    </AppText>
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

        {editing?.mode === 'add' && (
          <NameForm label="Tên quỹ mới" initial="" busy={busy} onSave={save} onCancel={() => setEditing(null)} style={{ backgroundColor: colors.surface, borderRadius: 16 }} />
        )}

        <SecondaryButton
          label="+ Quỹ mới"
          onPress={() => {
            setOpenId(null);
            setEditing({ mode: 'add' });
          }}
        />
      </LockableScrollView>

      {txnSheet && <FundTxnSheet mode={txnSheet} onClose={() => setTxnSheet(null)} />}

      {menuOpen && (
        <OptionSheet
          title="Giao dịch quỹ"
          note={data.funds.length === 0 ? 'Chưa có quỹ — tạo quỹ mới trước khi ghi giao dịch.' : undefined}
          onClose={() => setMenuOpen(false)}
          options={[
            {
              icon: 'wallet',
              label: 'Thu quỹ',
              hint: 'Ghi nhận tiền đóng góp vào quỹ',
              disabled: data.funds.length === 0,
              // Mở thẻ nổi liệt kê các quỹ; chọn quỹ thì mở trang riêng của form Thu quỹ.
              opensSheet: true,
              onPress: () => setTxnSheet('thu'),
            },
            {
              icon: 'people',
              label: 'Chi tiêu quỹ',
              hint: 'Ghi nhận khoản chi từ quỹ',
              disabled: data.funds.length === 0,
              // Mở thẻ nổi liệt kê các quỹ (cùng thẻ với nút "+" ở Tổng quan); chọn quỹ thì mở trang riêng của form Chi tiêu quỹ.
              onPress: () => setTxnSheet('chi'),
            },
          ]}
        />
      )}
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
  head: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  nameCol: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, lineHeight: 22 },
  balanceCol: { alignItems: 'flex-end', maxWidth: '50%' },
  balanceLabel: { fontSize: 12, lineHeight: 16 },
  balance: { fontSize: 17, lineHeight: 23 },
  form: { padding: 14 },
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
