import { useCallback, useState } from 'react';

/**
 * Chỉ MỘT dòng vuốt (`SwipeRow`) được mở tại một thời điểm: mở dòng khác thì dòng đang mở tự đóng.
 * Dùng: `<SwipeRow {...rowProps(id)} ... />`; gọi `closeAll` khi cuộn hoặc đổi bộ lọc.
 */
export function useSingleOpenRow() {
  const [openId, setOpenId] = useState<string | null>(null);
  const closeAll = useCallback(() => setOpenId(null), []);
  const rowProps = useCallback(
    (id: string) => ({
      open: openId === id,
      onOpen: () => setOpenId(id),
      onClose: () => setOpenId((current) => (current === id ? null : current)),
      onPressRow: () => setOpenId(null),
    }),
    [openId],
  );
  return { openId, closeAll, rowProps };
}
