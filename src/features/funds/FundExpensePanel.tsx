import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { FormLabel, formStyles } from '@/components/expense-form-parts';
import { InlineSelect } from '@/components/inline-select';
import { SvgIcon } from '@/components/svg-icon';
import { AppRadius } from '@/constants/palette';
import { advanceSummary, fundPosition, planAdvanceSpend } from '@/domain/fundAdvance';
import { loadPeople } from '@/data/peopleRepository';
import { fundBalance } from '@/domain/funds';
import { memberOptions } from '@/domain/people';
import { ContributionForm } from '@/features/funds/ContributionForm';
import { FundExpenseForm } from '@/features/funds/FundExpenseForm';
import { useColors } from '@/hooks/use-colors';
import type { FundData } from '@/types/fund';
import { formatVnd } from '@/utils/format';

interface Props {
  data: FundData;
  /** 'chi' (mặc định): ghi khoản chi quỹ; 'thu': ghi lần đóng (thu) quỹ. Cùng danh sách quỹ và thanh chọn quỹ, chỉ khác form bên dưới. */
  mode?: 'chi' | 'thu';
  /** Gọi sau khi ghi (hoặc sửa) xong một khoản chi; nơi chứa đóng tờ / quay lại và làm mới dữ liệu. */
  onChanged: () => void;
  /** Quỹ đã chọn sẵn (từ thẻ nổi chọn quỹ): có thì form hiện ngay, không có thì bắt đầu bằng danh sách quỹ. */
  initialFundId?: string;
}

/**
 * Giao diện "Chi tiêu quỹ" dùng chung cho nút "+" ở Tổng quan và mục Chi tiêu quỹ ở trang Quỹ nhóm:
 * bước 1 là danh sách quỹ (mỗi dòng: tên quỹ và số dư cùng hàng); chạm một quỹ thì hiện form chi quỹ, với một thanh ngay dưới tiêu đề
 * cho biết quỹ đang chọn và số dư hiện tại ở cùng một hàng (cùng kiểu ô chọn "Hình thức chi": nhãn "Quỹ", biểu tượng tròn, tên, số dư, mũi tên) — chạm cả thanh thì các quỹ khác XỔ XUỐNG ngay trong cùng khung (`InlineSelect`),
 * chọn một quỹ để đổi quỹ (thu gọn lại), chạm thanh lần nữa để thu gọn.
 */
export function FundExpensePanel({ data, onChanged, mode = 'chi', initialFundId }: Props) {
  const colors = useColors();
  const [pickedId, setPickedId] = useState<string | null>(initialFundId ?? null);
  /** Danh sách người trong mục Thiết lập: nguồn DUY NHẤT của danh sách thành viên ở thu / chi quỹ (cùng "Tôi"). */
  const [peopleList, setPeopleList] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    loadPeople()
      .then((list) => !cancelled && setPeopleList(list))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const fund = data.funds.find((item) => item.id === pickedId) ?? null;

  const balanceColor = (id: string) => (fundBalance(data, id) < 0 ? colors.danger : colors.success);

  if (!fund) {
    return (
      <View style={styles.list}>
        <AppText color={colors.muted} style={styles.hint}>
          {mode === 'thu' ? 'Chọn quỹ để ghi khoản thu' : 'Chọn quỹ để ghi khoản chi'}
        </AppText>
        {data.funds.map((item) => (
          <FundRow
            key={item.id}
            name={item.name}
            balance={formatVnd(fundBalance(data, item.id))}
            balanceColor={balanceColor(item.id)}
            label={`${item.name}, số dư ${formatVnd(fundBalance(data, item.id))}`}
            onPress={() => setPickedId(item.id)}
          />
        ))}
      </View>
    );
  }

  const fundSelect = (
    <View style={formStyles.field}>
      <FormLabel>Quỹ</FormLabel>
      <InlineSelect
        accessibilityLabel="Quỹ"
        selectedKey={fund.id}
        onSelect={setPickedId}
        options={data.funds.map((item) => ({
          key: item.id,
          name: item.name,
          trailing: formatVnd(fundBalance(data, item.id)),
          trailingColor: balanceColor(item.id),
          icon: (
            <View style={[styles.badge, { backgroundColor: colors.primarySoft }]}>
              <SvgIcon name="people" size={16} color={colors.primary} strokeWidth={2} />
            </View>
          ),
        }))}
      />
    </View>
  );

  // Thu quỹ: ô chọn quỹ nằm hàng đầu của thẻ trên cùng trong form (hai thẻ như trang tạo bill).
  if (mode === 'thu') return <ContributionForm key={fund.id} fund={fund} header={fundSelect} onChanged={onChanged} />;

  return (
    <View style={styles.list}>
      {fundSelect}
      <FundExpenseForm
        key={fund.id}
        fund={fund}
        members={memberOptions(peopleList, [])}
        freeNames={data.contribs.some((contribution) => contribution.fundId === fund.id && contribution.bulk)}
        heldPersons={[
          ...new Set((data.advances ?? []).filter((advance) => advance.fundId === fund.id && advanceSummary(data, advance).held > 0).map((advance) => advance.person.trim())),
        ]}
        planSpend={(spendPerson, spendAmount) => planAdvanceSpend(data, fund.id, spendPerson, spendAmount)}
        showTitle={false}
        balance={fundBalance(data, fund.id)}
        cash={fundPosition(data, fund.id).cash}
        onChanged={onChanged}
      />
    </View>
  );
}

/** Một dòng quỹ: tên quỹ và số dư cùng hàng, mũi tên bên phải (dùng cả ở thẻ nổi chọn quỹ). */
export function FundRow({
  name,
  balance,
  balanceColor,
  label,
  onPress,
  selected,
  expanded,
}: {
  name: string;
  balance: string;
  balanceColor: string;
  label: string;
  onPress: () => void;
  selected?: boolean;
  expanded?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderColor: selected ? colors.primary : colors.line, backgroundColor: selected ? colors.primarySoft : colors.bg, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <AppText weight="semibold" style={styles.name} numberOfLines={1}>
        {name}
      </AppText>
      <AppText weight="bold" color={balanceColor} style={styles.balance} numberOfLines={1}>
        {balance}
      </AppText>
      <View style={expanded === undefined ? undefined : { transform: [{ rotate: expanded ? '-90deg' : '90deg' }] }}>
        <SvgIcon name="chevronRight" size={16} color={colors.muted} strokeWidth={2} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  badge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 13, lineHeight: 18 },
  row: { minHeight: 52, borderRadius: AppRadius.field, borderWidth: 1.5, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { flex: 1, minWidth: 0, fontSize: 15.5 },
  balance: { flexShrink: 0, fontSize: 15.5 },
});
