import { router } from 'expo-router';

import { HistoryCard, IconTile } from '@/components/history-card';
import { SvgIcon } from '@/components/svg-icon';
import type { IconName } from '@/constants/icons';
import { payRowType } from '@/domain/expenseTab';
import { payRowSubtitle, type PayRow } from '@/domain/payForm';
import { useColors } from '@/hooks/use-colors';
import type { useSingleOpenRow } from '@/hooks/use-single-open-row';
import { formatVnd } from '@/utils/format';

/** Một dòng khoản trả (vuốt để Sửa / Xoá, chạm để xem chi tiết). `badge`: nhãn liên kết nếu có căn cứ. */
export function PayRowView({ row, rowProps, onDelete, badge }: { row: PayRow; rowProps: ReturnType<ReturnType<typeof useSingleOpenRow>['rowProps']>; onDelete: () => void; badge?: string }) {
  const colors = useColors();
  const tint = row.tone === 'get' ? colors.success : row.tone === 'owe' ? colors.danger : colors.muted;
  const sign = row.tone === 'get' ? '+' : row.tone === 'owe' ? '−' : '';
  const subtitle = payRowSubtitle(row);
  // Biểu tượng theo loại: trả bill = biên lai; chuyển tiền = mũi tên ra (mình trả) / vào (mình nhận) / hai chiều (giữa hai người khác).
  const icon: IconName = payRowType(row) === 'bill' ? 'receipt' : row.tone === 'owe' ? 'arrowOut' : row.tone === 'get' ? 'arrowIn' : 'swapCircle';
  return (
    <HistoryCard
      {...rowProps}
      onPressRow={() => {
        rowProps.onPressRow?.();
        router.push({ pathname: '/cong-no/giao-dich', params: { id: row.ids[0] } });
      }}
      onEdit={() => router.push({ pathname: '/cong-no/sua', params: { ids: row.ids.join(',') } })}
      onDelete={onDelete}
      accessibilityLabel={`${row.from} trả ${row.to}, ${formatVnd(row.amt)}`}
      icon={
        <IconTile color={tint} neutral>
          <SvgIcon name={icon} size={22} color={colors.primary} strokeWidth={1.8} />
        </IconTile>
      }
      title={`${row.from} → ${row.to}`}
      subtitle={[row.title, subtitle].filter(Boolean).join(' · ')}
      badge={badge}
      amount={`${sign}${formatVnd(row.amt)}`}
      tone={row.tone}
    />
  );
}
