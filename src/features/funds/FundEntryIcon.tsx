import { IconTile } from '@/components/history-card';
import { SvgIcon } from '@/components/svg-icon';
import type { IconName } from '@/constants/icons';
import type { FundHistoryKind } from '@/domain/fundHistory';
import { useColors } from '@/hooks/use-colors';
import type { FundExpenseMode } from '@/types/fund';

/**
 * Biểu tượng của một dòng lịch sử quỹ, mỗi loại một hình + một màu để phân biệt rõ:
 * - Quỹ chi trực tiếp: ví (đỏ) · Cá nhân ứng tiền túi chi: người (cam) · Chi từ tiền ứng trước: hoá đơn (tím)
 * - Giao tiền ứng trước: mũi tên chuyển (xanh dương) · Đóng quỹ: dấu cộng (xanh lá)
 * - Hoàn tiền ứng: mũi tên tải vào (xanh lá) · Quỹ trả cá nhân: dấu tích (xám).
 * Chỉ trình bày, không tính gì.
 */
export function FundEntryIcon({ kind, mode }: { kind: FundHistoryKind; mode?: FundExpenseMode }) {
  const colors = useColors();
  let icon: IconName = 'wallet';
  let tint = colors.danger;
  if (kind === 'contribution') {
    icon = 'plus';
    tint = colors.success;
  } else if (kind === 'expense') {
    if (mode === 'personal') {
      icon = 'person';
      tint = colors.iconOrange;
    } else if (mode === 'advance') {
      icon = 'receipt';
      tint = colors.iconPurple;
    }
  } else if (kind === 'advance') {
    icon = 'tabTransactions';
    tint = colors.iconBlue;
  } else if (kind === 'refund') {
    icon = 'download';
    tint = colors.success;
  } else {
    icon = 'check';
    tint = colors.muted;
  }
  return (
    <IconTile color={tint}>
      <SvgIcon name={icon} size={22} color={tint} strokeWidth={1.9} />
    </IconTile>
  );
}
