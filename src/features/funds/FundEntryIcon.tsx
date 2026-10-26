import { IconTile } from '@/components/history-card';
import { SvgIcon } from '@/components/svg-icon';
import type { IconName } from '@/constants/icons';
import type { FundHistoryKind } from '@/domain/fundHistory';
import { useColors } from '@/hooks/use-colors';
import type { FundExpenseMode } from '@/types/fund';

/**
 * Biểu tượng của một dòng lịch sử quỹ, cùng kiểu với biểu tượng danh mục và giao dịch: ô màu nền của app, viền mảnh, nét màu chủ đạo; mỗi loại một hình:
 * - Đóng quỹ: mũi tên xuống khay · Quỹ chi trực tiếp: ví · Cá nhân ứng tiền túi chi: người · Chi từ tiền ứng trước: thẻ
 * - Giao tiền ứng trước: khay mũi tên lên · Hoàn tiền ứng: mũi tên quay lại · Quỹ trả cá nhân: tờ tiền.
 * Chiều tiền vẫn thể hiện bằng dấu và màu của số tiền. Chỉ trình bày, không tính gì.
 */
export function FundEntryIcon({ kind, mode }: { kind: FundHistoryKind; mode?: FundExpenseMode }) {
  const colors = useColors();
  let icon: IconName = 'wallet';
  if (kind === 'contribution') icon = 'download';
  else if (kind === 'expense') icon = mode === 'personal' ? 'person' : mode === 'advance' ? 'card' : 'wallet';
  else if (kind === 'advance') icon = 'upload';
  else if (kind === 'refund') icon = 'refund';
  else icon = 'cash';
  return (
    <IconTile color={colors.primary} neutral>
      <SvgIcon name={icon} size={22} color={colors.primary} strokeWidth={1.8} />
    </IconTile>
  );
}
