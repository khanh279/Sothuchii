import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { SvgIcon } from '@/components/svg-icon';
import type { DayGroup, DebtRow, MonthGroup, Tone, buildDebtDetail } from '@/domain/debtDetail';
import { dayHeading } from '@/domain/expenses';
import { useColors } from '@/hooks/use-colors';
import { formatVnDate } from '@/utils/date';
import { roundVnd } from '@/domain/money';
import { formatVnd } from '@/utils/format';
import { DEBT_ZERO } from '@/domain/ledger';

const SIGN = { get: '+', owe: '−', mid: '' } as const;

interface Props {
  detail: ReturnType<typeof buildDebtDetail>;
  /** Tên kỳ đang xem, dùng cho dòng "Tổng <kỳ>" của nợ bill. */
  periodLabel: string;
  today: string;
  /** Mở sẵn hai ngăn Nợ vay / Nợ bill (mặc định gập). */
  defaultOpen?: boolean;
}

/** Tóm tắt tổng nợ hiện tại với một người (vay + bill) cho khung trang thanh toán: số có dấu, màu theo quy ước và chú thích chiều nợ. */
export function debtTotalSummary(detail: ReturnType<typeof buildDebtDetail>): { amount: string; tone: 'owe' | 'get' | 'mid'; caption: string } {
  const total = roundVnd(detail.loan + detail.bill);
  const tone = total > DEBT_ZERO ? 'get' : total < -DEBT_ZERO ? 'owe' : 'mid';
  const sign = tone === 'get' ? '+' : tone === 'owe' ? '−' : '';
  const caption = detail.settled ? 'Không còn nợ' : tone === 'owe' ? `Tôi nợ ${detail.name}` : tone === 'get' ? `${detail.name} nợ tôi` : 'Hai khoản nợ bù nhau';
  return { amount: `${sign}${formatVnd(Math.abs(total))}`, tone, caption };
}

/**
 * Hai ngăn chi tiết nợ với MỘT người: Nợ vay (từng khoản cho vay / mượn) và Nợ bill (theo ngày, hoặc theo tháng khi xem toàn thời gian), lấy từ
 * `buildDebtDetail`. Dùng chung cho màn Chi tiết nợ và trang Thanh toán công nợ; chỉ hiển thị, không ghi dữ liệu.
 */
export function DebtBreakdown({ detail, periodLabel, today, defaultOpen = false }: Props) {
  const colors = useColors();
  const [open, setOpen] = useState<{ loan?: boolean; bill?: boolean }>(defaultOpen ? { loan: true, bill: true } : {});
  const [openMonth, setOpenMonth] = useState<string | null>(defaultOpen ? (detail.billMonths[0]?.month ?? null) : null);
  return (
    <>
      {detail.hasLoan && (
        <Stack2 label="Nợ vay" sub={detail.loanSubtitle} balance={detail.loan} open={!!open.loan} onToggle={() => setOpen({ ...open, loan: !open.loan })}>
          {detail.loanRows.map((row, index) => (
            <Row key={index} row={row} sub={`${formatVnDate(row.d)}${row.s ? ` · ${row.s}` : ''}`} />
          ))}
        </Stack2>
      )}

      {detail.hasBill && (
        <Stack2 divider={detail.hasLoan} label="Nợ bill" sub={detail.billSubtitle} balance={detail.bill} open={!!open.bill} onToggle={() => setOpen({ ...open, bill: !open.bill })}>
          {detail.billPeriodTotal !== null && (
            <View style={styles.totalRow}>
              <AppText weight="semibold" color={colors.muted} style={styles.small}>
                Tổng {periodLabel}
              </AppText>
              <Amount value={detail.billPeriodTotal} />
            </View>
          )}
          {detail.billEmpty ? (
            <AppText color={colors.muted} style={styles.empty}>
              Không có bill trong khoảng này
            </AppText>
          ) : detail.monthMode ? (
            <Days days={detail.billDays} today={today} />
          ) : (
            <Months months={detail.billMonths} openMonth={openMonth} onToggle={(month) => setOpenMonth(openMonth === month ? null : month)} today={today} />
          )}
        </Stack2>
      )}
    </>
  );
}

function Amount({ value, tone }: { value: number; tone?: Tone }) {
  const colors = useColors();
  const resolved: Tone = tone ?? (value > 0.5 ? 'get' : value < -0.5 ? 'owe' : 'mid');
  return (
    <AppText weight="bold" color={resolved === 'mid' ? colors.muted : resolved === 'get' ? colors.success : colors.danger} style={styles.amount}>
      {SIGN[resolved]}
      {formatVnd(Math.abs(value))}
    </AppText>
  );
}

function Row({ row, sub }: { row: DebtRow; sub: string }) {
  const colors = useColors();
  return (
    <View style={[styles.row, { borderTopColor: colors.line }]}>
      <View style={styles.flex}>
        <AppText weight="semibold" style={styles.rowTitle}>
          {row.t}
        </AppText>
        {!!sub && (
          <AppText color={colors.muted} style={styles.small}>
            {sub}
          </AppText>
        )}
      </View>
      <Amount value={row.v} tone={row.tone} />
    </View>
  );
}

function Days({ days, today }: { days: DayGroup[]; today: string }) {
  const colors = useColors();
  return (
    <>
      {days.map((day) => (
        <View key={day.date}>
          <View style={styles.dayHeader}>
            <AppText color={colors.muted} style={styles.small} numberOfLines={1}>
              <AppText weight="semibold" style={styles.small}>
                {dayHeading(day.date, today)}
              </AppText>
              , {formatVnDate(day.date)}
            </AppText>
            <Amount value={day.net} tone={day.tone} />
          </View>
          {day.rows.map((row, index) => (
            <Row key={index} row={row} sub={row.s} />
          ))}
        </View>
      ))}
    </>
  );
}

function Months({ months, openMonth, onToggle, today }: { months: MonthGroup[]; openMonth: string | null; onToggle: (month: string) => void; today: string }) {
  const colors = useColors();
  return (
    <>
      {months.map((month) => {
        const open = openMonth === month.month;
        return (
          <View key={month.month}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => onToggle(month.month)} style={[styles.row, styles.monthRow, { backgroundColor: colors.bg }]}>
              <View style={styles.flex}>
                <AppText weight="semibold" style={styles.rowTitle}>
                  Tháng {Number(month.month.slice(5, 7))}/{month.month.slice(0, 4)}
                </AppText>
                <AppText color={colors.muted} style={styles.small}>
                  {month.count} khoản
                </AppText>
              </View>
              <Amount value={month.net} tone={month.tone} />
              <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}>
                <SvgIcon name="chevronRight" size={16} color={colors.muted} />
              </View>
            </Pressable>
            {open && <Days days={month.days} today={today} />}
          </View>
        );
      })}
    </>
  );
}

/** Một ngăn Nợ vay / Nợ bill phẳng (không thẻ riêng): nằm trong khung trang, ngăn thứ hai có đường kẻ mảnh phía trên. */
function Stack2({ label, sub, balance, open, onToggle, divider = false, children }: { label: string; sub: string; balance: number; open: boolean; onToggle: () => void; divider?: boolean; children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.stack, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onToggle} style={styles.stackHead}>
        <View style={styles.flex}>
          <AppText weight="bold" style={styles.stackTitle}>
            {label}
          </AppText>
          <AppText color={colors.muted} style={styles.small}>
            {sub}
          </AppText>
        </View>
        <Amount value={balance} />
        <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}>
          <SvgIcon name="chevronRight" size={16} color={colors.muted} />
        </View>
      </Pressable>
      {open && <View style={styles.stackBody}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  small: { fontSize: 12.5, lineHeight: 17 },
  empty: { textAlign: 'center', fontSize: 14, paddingVertical: 12 },
  stack: { overflow: 'hidden' },
  stackHead: { minHeight: 52, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  stackTitle: { fontSize: 15.5 },
  stackBody: { paddingBottom: 4 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingTop: 8, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, borderTopWidth: 1 },
  monthRow: { paddingHorizontal: 10, borderRadius: 10 },
  rowTitle: { fontSize: 15 },
  amount: { fontSize: 16 },
});
