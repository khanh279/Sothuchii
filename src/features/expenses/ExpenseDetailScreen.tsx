import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { CategoryIcon } from '@/components/category-icon';
import { Panel, ScreenTitle } from '@/components/design';
import { getExpense } from '@/data/expenseRepository';
import { resolveCategory } from '@/domain/expenses';
import { linkedExpenseNotice } from '@/domain/linkedExpense';
import { describeStorageError, useExpenseSettings } from '@/features/expenses/hooks';
import { useColors } from '@/hooks/use-colors';
import type { ExpenseWithId } from '@/types/expense';
import { formatVnDate } from '@/utils/date';
import { formatVnd } from '@/utils/format';

type Loaded = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; expense: ExpenseWithId | null };

const SOURCE: Record<string, string> = { cb: 'Chia bill / khoản trả nợ', quy: 'Quỹ nhóm' };

/**
 * Chi tiết MỘT khoản chi cá nhân (tham số route `m` = tháng, `id`): số tiền, nội dung, mục chi, ngày, nguồn. Chỉ xem, không đổi
 * dữ liệu. Sửa / xoá khoản tự nhập làm ở tab Chi tiêu (vuốt dòng); khoản tự sinh từ chia bill hoặc quỹ chỉ sửa được tại nguồn.
 */
export default function ExpenseDetailScreen() {
  const { m, id } = useLocalSearchParams<{ m?: string; id?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { settings } = useExpenseSettings();
  const [state, setState] = useState<Loaded>({ status: 'loading' });

  useEffect(() => {
    if (!m || !id) return;
    let cancelled = false;
    getExpense({ m, id })
      .then((expense) => !cancelled && setState({ status: 'ready', expense }))
      .catch((e) => !cancelled && setState({ status: 'error', message: describeStorageError(e) }));
    return () => {
      cancelled = true;
    };
  }, [m, id]);

  let body;
  if (state.status === 'error') body = <Notice text={state.message} tone="error" />;
  else if (!m || !id || (state.status === 'ready' && !state.expense)) body = <Notice text="Không tìm thấy khoản chi này. Có thể nó đã bị xoá." tone="error" />;
  else if (state.status === 'loading') body = <ActivityIndicator style={styles.loading} color={colors.primary} />;
  else {
    const expense = state.expense as ExpenseWithId;
    const category = resolveCategory(settings, expense.c);
    const notice = linkedExpenseNotice(expense);
    body = (
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
        <View style={[styles.hero, { backgroundColor: colors.heroBg }]}>
          <AppText weight="medium" color={colors.heroSoft} style={styles.heroLabel}>
            Số tiền
          </AppText>
          <AppText weight="display" color={colors.heroInk} style={styles.heroAmount} adjustsFontSizeToFit numberOfLines={1}>
            {formatVnd(expense.a)}
          </AppText>
        </View>
        <Panel>
          <Field label="Nội dung" value={expense.n || category.name} />
          <Field
            label="Mục chi"
            value={category.name}
            icon={<CategoryIcon category={category} size={28} />}
          />
          <Field label="Ngày" value={formatVnDate(expense.d)} />
          <Field label="Nguồn" value={(expense.src && SOURCE[expense.src]) || 'Tự nhập'} />
          {!!expense.i && <Field label="Chi tiết" value={expense.i} last />}
        </Panel>
        <Notice text={notice ?? 'Sửa hoặc xoá khoản chi này: vuốt dòng sang trái ở tab Chi tiêu.'} tone="info" />
      </ScrollView>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: 'Chi tiết chi tiêu', headerShown: false }} />
      <ScreenTitle title="Chi tiết chi tiêu" topInset={insets.top} />
      {body}
    </View>
  );
}

function Field({ label, value, icon, last }: { label: string; value: string; icon?: React.ReactNode; last?: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.field, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }]}>
      <AppText color={colors.muted} style={styles.fieldLabel}>
        {label}
      </AppText>
      <View style={styles.fieldValueWrap}>
        {icon}
        <AppText weight="semibold" style={styles.fieldValue}>
          {value}
        </AppText>
      </View>
    </View>
  );
}

function Notice({ text, tone }: { text: string; tone: 'error' | 'info' }) {
  const colors = useColors();
  return (
    <View style={[styles.notice, { backgroundColor: tone === 'error' ? colors.dangerSoft : colors.primarySoft }]}>
      <AppText color={tone === 'error' ? colors.danger : colors.muted} style={styles.noticeText}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },
  loading: { marginTop: 48 },
  hero: { borderRadius: 22, paddingHorizontal: 20, paddingVertical: 18, gap: 4 },
  heroLabel: { fontSize: 13.5 },
  heroAmount: { fontSize: 36, lineHeight: 44, letterSpacing: -0.6 },
  field: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10 },
  fieldLabel: { fontSize: 13.5 },
  fieldValueWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  fieldValue: { fontSize: 15, textAlign: 'right', flexShrink: 1 },
  notice: { borderRadius: 14, padding: 14 },
  noticeText: { fontSize: 13.5, lineHeight: 19 },
});
