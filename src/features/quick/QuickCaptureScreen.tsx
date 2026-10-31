import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { AppTextInput as TextInput } from '@/components/app-text-input';
import { ScreenTitle } from '@/components/design';
import { AmountField, FormLabel, FormSaveButton, formStyles } from '@/components/expense-form-parts';
import { KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll';
import { SvgIcon } from '@/components/svg-icon';
import { useToast } from '@/components/toast';
import { MEMO_MAX } from '@/constants/categories';
import { AppFonts } from '@/constants/fonts';
import { AppRadius } from '@/constants/palette';
import { listMonthKeys, loadMonths } from '@/data/expenseRepository';
import { getPhotoUri, putPhoto } from '@/data/photoStore';
import { periodToParams, suggestedDateFor } from '@/domain/expenses';
import { newPhotoId } from '@/domain/photos';
import { suggestFromHistory, type QuickHistoryItem, type QuickSource } from '@/domain/quickSuggest';
import { useBills } from '@/features/bills/hooks';
import { useFundData } from '@/features/funds/hooks';
import { pickPhotos } from '@/features/photos/pickPhoto';
import { useColors } from '@/hooks/use-colors';
import { useSharedPeriod } from '@/hooks/use-shared-period';
import { tr } from '@/i18n/language';
import { todayStr } from '@/utils/date';
import { formatVnd } from '@/utils/format';
import { setQuickDraft } from '@/utils/quick-draft';
import { router } from '@/utils/safe-router';

/** Số tháng gần nhất lấy làm lịch sử gợi ý cho chi tiêu cá nhân. */
const HISTORY_MONTHS = 6;

const SOURCES: { key: QuickSource; label: string }[] = [
  { key: 'personal', label: 'Chi tiêu cá nhân' },
  { key: 'bill', label: 'Chia bill' },
  { key: 'fund', label: 'Chi tiêu quỹ' },
];

/**
 * "Chụp nhanh" (mở từ nút "+", tách khỏi các mục thêm khác): chụp ảnh món đồ / hóa đơn, chọn nguồn chi (chi tiêu cá nhân, chia bill hoặc chi tiêu quỹ), app gợi ý nội dung và số tiền
 * từ CÁC KHOẢN ĐÃ NHẬP TRƯỚC ĐÓ của nguồn đó (không nhận diện ảnh, không gửi ảnh ra ngoài). Chọn gợi ý hoặc tự sửa, rồi "Tiếp tục" sang form của nguồn đã chọn với nội dung, số tiền và ảnh điền sẵn để xem lại và lưu.
 */
export default function QuickCaptureScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { period } = useSharedPeriod();
  const { bills } = useBills();
  const fundData = useFundData().data;
  const [source, setSource] = useState<QuickSource>('personal');
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState(0);
  const [fundId, setFundId] = useState('');
  const [personal, setPersonal] = useState<QuickHistoryItem[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const months = (await listMonthKeys()).slice(-HISTORY_MONTHS);
        const list = await loadMonths(months);
        if (alive) setPersonal(list.filter((item) => !item.src).map((item) => ({ title: item.n, amount: item.a, date: item.d })));
      } catch {
        // Không đọc được lịch sử thì chỉ không có gợi ý; vẫn nhập tay được.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!photo) return;
    let alive = true;
    void getPhotoUri(photo).then((uri) => alive && setPhotoUri(uri));
    return () => {
      alive = false;
    };
  }, [photo]);

  const funds = fundData.funds;
  const activeFund = funds.find((fund) => fund.id === fundId) ?? funds.find((fund) => fund.id === fundData.cur) ?? funds[0];

  const history = useMemo<QuickHistoryItem[]>(() => {
    if (source === 'bill') return bills.map((bill) => ({ title: bill.title, amount: bill.people.reduce((sum, person) => sum + (person.paid || 0), 0), date: bill.date }));
    if (source === 'fund') return fundData.expenses.filter((item) => !activeFund || item.fundId === activeFund.id).map((item) => ({ title: item.title, amount: item.amount, date: item.date }));
    return personal;
  }, [source, bills, fundData.expenses, activeFund, personal]);
  const suggestions = useMemo(() => suggestFromHistory(history, 6, title), [history, title]);

  async function takePhoto() {
    if (busy) return;
    setBusy(true);
    try {
      const [dataUrl] = await pickPhotos(Platform.OS === 'web' ? 'library' : 'camera', 1);
      if (!dataUrl) return;
      const id = newPhotoId(Date.now());
      await putPhoto(id, dataUrl);
      setPhoto(id);
    } catch (error) {
      toast.show(tr(error instanceof Error && error.message ? error.message : 'Không thêm được ảnh.'));
    } finally {
      setBusy(false);
    }
  }

  function next() {
    setQuickDraft({ title: title.trim(), amount, ph: photo ? [photo] : [] });
    if (source === 'personal') router.replace({ pathname: '/chi-tieu/nhap', params: { ...periodToParams(period), d: suggestedDateFor(period, todayStr()) } });
    else if (source === 'bill') router.replace('/chia-bill/tao');
    else router.replace({ pathname: '/quy/chi-tieu', params: { fund: activeFund?.id } });
  }

  const noFund = source === 'fund' && funds.length === 0;

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: 'Chụp nhanh', headerShown: false }} />
      <ScreenTitle title="Chụp nhanh" topInset={insets.top} />
      <KeyboardAwareScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={photo ? 'Chụp lại' : 'Chụp ảnh'}
            onPress={() => void takePhoto()}
            style={[styles.shot, { backgroundColor: colors.bg, borderColor: colors.line }]}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.shotImage} contentFit="cover" />
            ) : (
              <View style={styles.shotEmpty}>
                <SvgIcon name="camera" size={32} color={colors.primary} strokeWidth={2} />
                <AppText weight="semibold" color={colors.primary} style={styles.shotText}>
                  Chụp ảnh món đồ / hóa đơn
                </AppText>
              </View>
            )}
          </Pressable>
          {!!photo && (
            <AppText color={colors.muted} style={styles.hint}>
              Bấm vào ảnh để chụp lại.
            </AppText>
          )}

          <View style={formStyles.field}>
            <FormLabel>Nguồn chi</FormLabel>
            <View style={styles.chips}>
              {SOURCES.map((item) => {
                const selected = item.key === source;
                return (
                  <Pressable
                    key={item.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setSource(item.key)}
                    style={[styles.chip, selected ? { backgroundColor: colors.primary, borderColor: colors.primary } : { backgroundColor: colors.bg, borderColor: colors.line }]}>
                    <AppText weight="semibold" color={selected ? colors.primaryInk : colors.ink} style={styles.chipText}>
                      {item.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {source === 'fund' && funds.length > 1 && (
            <View style={formStyles.field}>
              <FormLabel>Quỹ</FormLabel>
              <View style={styles.chips}>
                {funds.map((fund) => {
                  const selected = fund.id === activeFund?.id;
                  return (
                    <Pressable
                      key={fund.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setFundId(fund.id)}
                      style={[styles.chip, selected ? { backgroundColor: colors.primary, borderColor: colors.primary } : { backgroundColor: colors.bg, borderColor: colors.line }]}>
                      <AppText weight="semibold" color={selected ? colors.primaryInk : colors.ink} style={styles.chipText}>
                        {fund.name}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
          {noFund && (
            <AppText color={colors.danger} style={styles.hint}>
              Chưa có quỹ — tạo quỹ ở tab Quỹ nhóm.
            </AppText>
          )}

          <View style={formStyles.field}>
            <FormLabel>Nội dung</FormLabel>
            <TextInput
              style={[formStyles.input, { backgroundColor: colors.bg, borderColor: colors.line, color: colors.ink, fontFamily: AppFonts.semibold }]}
              value={title}
              onChangeText={setTitle}
              maxLength={MEMO_MAX}
              placeholder="Ví dụ: Phở sáng, cà phê"
              placeholderTextColor={colors.muted}
            />
          </View>

          {suggestions.length > 0 ? (
            <View style={formStyles.field}>
              <FormLabel>Gợi ý từ các khoản đã nhập</FormLabel>
              <View style={styles.chips}>
                {suggestions.map((item) => (
                  <Pressable
                    key={item.title}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.title} ${formatVnd(item.amount)}`}
                    onPress={() => {
                      setTitle(item.title.slice(0, MEMO_MAX));
                      setAmount(item.amount);
                    }}
                    style={[styles.chip, { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }]}>
                    <AppText weight="semibold" color={colors.primary} style={styles.chipText} numberOfLines={1}>
                      {item.title} · {formatVnd(item.amount)}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            <AppText color={colors.muted} style={styles.hint}>
              Chưa có khoản nào để gợi ý ở nguồn này. Nhập nội dung và số tiền rồi tiếp tục.
            </AppText>
          )}

          <AmountField value={amount} onChange={setAmount} />
        </View>

        <View style={formStyles.actions}>
          <FormSaveButton label="Tiếp tục" disabled={noFund} onPress={next} />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  card: { borderRadius: AppRadius.card, padding: 16, gap: 12 },
  shot: { height: 180, borderRadius: AppRadius.card, borderWidth: 1, borderStyle: 'dashed', overflow: 'hidden' },
  shotImage: { width: '100%', height: '100%' },
  shotEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  shotText: { fontSize: 14 },
  hint: { fontSize: 12.5, lineHeight: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, maxWidth: '100%' },
  chipText: { fontSize: 13, lineHeight: 18 },
});
