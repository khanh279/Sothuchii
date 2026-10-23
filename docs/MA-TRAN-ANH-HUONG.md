# Sơ đồ 6 — Ma trận ảnh hưởng khi thay đổi dữ liệu · Rủi ro · Tài liệu ≠ code · Chưa xác minh

> Thuộc bộ tài liệu bắt đầu từ [`SO-DO-TONG-QUAN.md`](SO-DO-TONG-QUAN.md). Mức xác minh: ✅ đã đối chiếu code · ⚠️ suy từ đọc code, **chưa tái hiện bằng test/chạy app** · ❓ chưa xác minh · ❌ thiếu/mã chết/không khớp.
> Quy ước "bản ghi liên kết": trong code chỉ có **tham chiếu** (`exp`, `bill`, `bills`, `advanceId`, `expenseId`, `grp`) và **hàm đồng bộ**; không có khóa ngoại. Hai thứ hiển thị cạnh nhau **không** đồng nghĩa chung một bản ghi.

## 1. Ma trận thao tác → dữ liệu → màn hình

Viết tắt kho: **CT** = `sct:m:*`, **Q** = `quy_nhom_v1`, **B** = `chiabill:v2:bills`, **P** = `chiabill:v2:pays`, **PPL** = `sotien:people`. "Sync" = `syncBillExpenses` (B+P→CT) hoặc `syncFundExpenses` (Q→CT).

### 1.1 Chi tiêu cá nhân

| Thao tác | Dữ liệu chính | Dữ liệu liên kết | Màn hình / số liệu bị ảnh hưởng | Logic dùng chung | Rủi ro |
|---|---|---|---|---|---|
| Thêm khoản tự nhập | CT (tháng của ngày) | — | Tổng quan: Đã chi, Chi tiêu, Giao dịch gần đây; tab Chi tiêu; `/giao-dich` | `buildExpense`, `isInPeriod`, `sumAmounts` | — |
| Sửa khoản tự nhập | CT | Đổi ngày sang tháng khác = **ghi 2 khóa** (`saveManyJsonStrict`: tháng mới trước, tháng cũ sau) | như trên | `updateExpense` | R-2 nhẹ (hai khóa một lệnh `multiSet`) |
| Xóa khoản tự nhập | CT | Hoàn tác = ghi lại bản ghi thô cùng id | như trên | `deleteExpenseUndoable` | — |
| Sửa/xóa khoản `src:'quy'` / `'cb'` | **UI chặn** (`linkedExpenseNotice`) | Nguồn là Q / B / P | toast giải thích | `linkedExpense.ts` | R-5: kho không chặn |
| Đổi ngân sách / thêm-xóa mục chi | `sct:settings` | Khoản dùng mục đã xóa hiển thị là `other` ✅ (`types/expense.ts`) | Tổng quan (ngân sách), biểu đồ mục | `setBudget`, `addCustomCategory`, `removeCustomCategory` | — |

### 1.2 Quỹ nhóm

| Thao tác | Dữ liệu chính | Dữ liệu liên kết | Bị ảnh hưởng | Logic dùng chung | Rủi ro |
|---|---|---|---|---|---|
| Thu quỹ (thêm/sửa) | Q.`contribs` | Phần tên **đúng "Tôi"** → CT `src:'quy'` + `contrib.exp` (Sync) | Số dư/tiền thực tế quỹ, lịch sử quỹ, `FundStatCard`, **Chi tiêu cá nhân** (nếu "Tôi" đóng) | `validateContribution`, `desiredLinkedExpense`, `planFundExpenseSync` | Sync lỗi → `syncFailed`, lần mở màn sau làm tiếp (R-3) |
| Xóa thu quỹ | Q | CT `src:'quy'` mồ côi → Sync dọn | như trên | | R-3 |
| Chi quỹ trực tiếp | Q.`expenses` (không `mode`) | Không sinh CT | số dư & tiền thực tế quỹ giảm; lịch sử quỹ | `checkDirectSpend`, `fundBalance`, `fundCash` | D-2, D-3 |
| Cá nhân ứng chi (+ chia nguồn `fundPart`) | Q.`expenses` `mode:'personal'`, `payer`, `fundPart?` | `fundTxns` `payout` gắn `expenseId` khi quỹ trả | "Quỹ nợ A" (owed); phần `fundPart` giảm tiền thực tế ngay | `splitByCash`, `personalDebt`, `expenseFundPart` | Không sinh CT kể cả `payer = Tôi` ⚠️ (chỉ `contribs` được sync, theo `fundSync.ts`) |
| Giao tiền ứng | Q.`advances` | — | tiền thực tế quỹ giảm (số dư `fundBalance` **không đổi**); "A nợ quỹ" (held) tăng | `checkAdvanceGive`, `advanceSummary` | — |
| Chi từ tiền ứng ("Quỹ giao A chi") | Q.`expenses` `mode:'advance'` + `advanceId` (**1..N bản ghi**, mỗi lần giao một phần) | `advanceSummary.spent` tăng, `held` giảm; vượt → `owed` | số dư quỹ giảm; Nợ quỹ/Quỹ nợ; `AdvanceSpendCard` | `planAdvanceSpend` | R-2 (N lần ghi tách rời), R-4 |
| Hoàn tiền ứng | Q.`fundTxns` `refund` | `advanceId` | tiền thực tế quỹ tăng; `held` giảm | `checkRefund` | — |
| Quỹ trả cá nhân | Q.`fundTxns` `payout` (`expenseId` hoặc `advanceId`) | | tiền thực tế quỹ giảm; `owed` giảm | `combinedPayoutLimit`, `planCombinedPayout`, `checkPayout` | R-2 (payMany nhiều lần ghi) |
| Sửa số tiền/ngày hoàn/thanh toán | Q.`fundTxns` | | như trên | `updateFundTxn` kiểm lại bằng dữ liệu đã bỏ chính nó ✅ | — |
| Xóa khoản chi quỹ | Q.`expenses` | Chặn nếu còn `fundTxns` có `expenseId` trỏ tới ✅ | số dư/lịch sử | `deleteFundExpense` | **R-4** (payout theo `advanceId` không bị chặn) |
| Sửa/xóa hồ sơ giao ứng | Q.`advances` | Xóa bị chặn nếu còn chi/hoàn/thanh toán ✅; sửa số tiền **chỉ kiểm khi tăng** | held/owed tính lại | `updateAdvance`, `deleteAdvance` | R-4 (giảm số giao khi đã chi) |
| Xóa cả quỹ | Q (xóa `funds`, `contribs`, `expenses`, `advances`, `fundTxns` của quỹ) | CT `src:'quy'` mồ côi → Sync dọn | mọi màn quỹ; Chi tiêu cá nhân | `deleteFund` | Không hoàn tác; R-3 |

### 1.3 Chia bill & Công nợ

| Thao tác | Dữ liệu chính | Dữ liệu liên kết | Bị ảnh hưởng | Logic dùng chung | Rủi ro |
|---|---|---|---|---|---|
| Tạo bill | B (+ `chiabill:names`) | CT `src:'cb'` phần "Tôi" (`min(đã chi, phải trả)`) + `bill.exp` (Sync) | tab Chia bill (danh sách, cặp cần thanh toán), thẻ Chia bill, **Công nợ** (`debtEvents` sinh gợi ý chuyển của bill), Chi tiêu | `computeSplit`, `canSaveBill`, `desiredBillExpense` | R-3 |
| Sửa bill | B (giữ `id`, `createdAt`, `exp`) | CT `cb` tính lại; **phân bổ trả theo FIFO tính lại** vì không lưu phân bổ | trạng thái "đã thanh toán" từng khoản/bill có thể đổi; số dư công nợ đổi | `billTransferStatuses`, `allocatePayments` | **R-8** |
| Xóa bill | B | Khoản trả P **không bị xóa**; CT `cb` mồ côi bị dọn; khoản trả đã ghi có thể thành "trả dư"/khoản vay hiển thị ⚠️ | cặp thanh toán, Công nợ, Chi tiêu | `deleteBillSynced` | R-8 |
| Thanh toán bill theo cặp (toàn bộ/một phần) | P (+1 khoản `kind:'billpay'`) | Nếu "Tôi" là người trả: CT `cb` "Trả … · bill dd/mm" (Sync, `pay.exp`) | `BillPaymentScreen`, danh sách bill (nhãn), Công nợ (sổ bill), Chi tiêu, Giao dịch gần đây (dòng khoản trả, ẩn bóng `cb`) | `buildBillPairs`, `pairAmountDraft`, `allocatePayments` | Kiểm tra lại số còn lại **lúc ghi** (`PayInputError`) |
| Ghi nhận chuyển tiền / trả bill thủ công | P (khoản giống hệt thì **cộng dồn**) | như trên; `vay` không sinh CT | Công nợ, Giao dịch | `addTransferSynced`, `payKindFor` | — |
| Sửa / xóa khoản trả | P | CT `cb` tạo lại/dọn (Sync); nhóm hiển thị chung → thay bằng một khoản `repay` | Công nợ, bill, Chi tiêu | `updateTransferSynced`, `updatePayGroupSynced`, `deletePaySynced` | R-3 |
| Thanh toán công nợ (toàn bộ/một phần) | P (1–3 khoản: bill, vay, "Trả dư") | Sổ bill → CT `cb` như trên | Công nợ, tổng quan nợ | `planDebtPayment` | Hai sổ trái dấu → không ghi (phải gộp nợ) |
| Gộp nợ / Hoàn tác gộp | P (2 khoản `kind:'bt'` cùng `grp`; hoàn tác xóa cả `grp`) | Nếu giảm nợ bill của tôi: CT `cb` "Bù trừ nợ …" | số dư hai sổ | `mergeDrafts`, `checkUndoMerge` | Hoàn tác bị từ chối nếu sau gộp đã có giao dịch mới ✅ |
| Danh sách người (thêm/xóa tên, từ Cài đặt) | PPL | — | ô chọn người ở bill, quỹ, giao dịch | `addPerson`, `removePerson` | Xóa tên không xóa dữ liệu cũ (⚠️ chưa xác minh bằng chạy) |

### 1.4 Sao lưu / Khôi phục / Xóa dữ liệu

| Thao tác | Dữ liệu chính | Hành vi (✅ `backupRepository`/`domain/backup`) | Rủi ro |
|---|---|---|---|
| Sao lưu | đọc `sct:*`, Q, B, P, `chiabill:names`, PPL | Đọc **nghiêm ngặt**: khóa hỏng → báo lỗi, không tạo file sai; xuất qua `Share`/clipboard (web: tải file) | — |
| Khôi phục | thay các phần **có trong file**: Chi tiêu (cả các tháng cũ không có trong file bị xóa), Q, Bill (B+P+names), PPL | Sao chép nguyên văn các khóa sẽ đụng vào; ghi mới trước, xóa cũ sau; lỗi thì thử trả lại bản cũ; rồi `refreshPeopleFromData` | R-9: không chạy Sync ngay; bản dán nội dung (không chọn file) |
| Xóa dữ liệu một phần | `wipeSection`: chi-tieu (`sct:*` + settings) · quy-nhom (CT `src:'quy'` + Q) · chia-bill (CT `src:'cb'` + B + P + names) | Bấm hai lần xác nhận | Không hoàn tác |

## 2. Quan hệ giữa các dữ liệu: cái gì thật sự chung bản ghi

| Quan hệ | Cơ chế thật | Chung bản ghi? |
|---|---|---|
| Chi tiêu cá nhân ↔ giao dịch phát sinh từ quỹ | Chỉ **phần "Tôi" của một lần đóng quỹ** sinh CT `src:'quy'`; liên kết `contrib.exp` | Không. Chi quỹ, ứng, hoàn, thanh toán của quỹ **không** sinh CT |
| Bill ↔ khoản thanh toán bill | Khoản trả ghi vào P với `from/to`; **phân bổ vào từng bill không lưu**, tính lại bằng FIFO mỗi lần hiển thị | Không (`pay.bill/bills` chỉ là nhãn cho khoản gộp/hiển thị) |
| Bill ↔ công nợ | `debtEvents` sinh sự kiện từ **gợi ý chuyển** của bill (sổ bill) và từ khoản trả | Không lưu số dư; tính lại từ B+P |
| Nợ vay ↔ nợ bill | Hai sổ tách bằng `payClass`/`payLedger`; chỉ trừ nhau qua `bt` (cùng `grp`) | Không |
| Cá nhân ứng chi ↔ hoàn trả | `fundTxns` `payout` có `expenseId` (trả khoản cá nhân ứng) hoặc `advanceId` (phần chi vượt tiền ứng); `refund` có `advanceId` | Liên kết bằng mã, không lưu trạng thái trên chi phí |
| Lịch sử ↔ bản ghi tạo từ nghiệp vụ khác | Không có kho lịch sử; mỗi lịch sử là phép chiếu của kho gốc | — |
| Tổng quan ↔ dữ liệu gốc | Mỗi thẻ gọi hàm thuần trên dữ liệu đã tải (xem `SO-DO-NGHIEP-VU.md` mục F) | — |

## 3. Danh sách rủi ro

| # | Rủi ro | Căn cứ | Mức |
|---|---|---|---|
| R-1 | Dữ liệu chỉ nằm trên máy (`AsyncStorage`); không đồng bộ đám mây; sao lưu là thao tác tay | ✅ không có API trong `src/data`; `backupRepository` | Thiết kế |
| R-2 | **Ghi nhiều bước không nguyên tử**: `planAdvanceSpend` ghi N khoản chi bằng N lần `saveFundExpenseSynced` (FundActionSheet / FundExpenseForm); `payMany` ghi N giao dịch (có `finally reload`); lỗi giữa chừng để lại các phần đã ghi | ✅ code `FundActionSheet`, `FundPayFlow.useFundPay.payMany` | ⚠️ chưa tái hiện lỗi giữa chừng |
| R-3 | **Không có giao dịch xuyên kho**: B/P/CT/Q có hàng đợi riêng; đồng bộ là bước sau và có thể lỗi (`syncFailed`). Trong khoảng đó Tổng quan có thể tạm thiếu/dư khoản chi tự sinh. Thiết kế "tạo trước – xóa sau – ghi liên kết – dọn mồ côi" giảm thiểu mất tiền | ✅ `billSync.ts`, `fundSync.ts` | ⚠️ |
| R-4 | **Xóa khoản chi `mode:'advance'` có thể làm lệch số dư hồ sơ ứng** nếu hồ sơ đã có `payout` gắn `advanceId` (quỹ đã trả phần vượt): `deleteFundExpense` chỉ chặn theo `expenseId`; `updateAdvance` chỉ kiểm khi **tăng** số giao | ✅ đọc `fundRepository.deleteFundExpense/updateAdvance`; ⚠️ chưa chạy ca cụ thể | ⚠️ cần test hồi quy |
| R-5 | Bảo vệ khoản tự sinh (`src quy/cb`) chỉ ở UI/route; `expenseRepository.updateExpense/deleteExpense` không kiểm `src` | ✅ không thấy kiểm `src` trong repository | ⚠️ sync hoàn lại khi sửa trực tiếp (theo chú thích `linkedExpense.ts`) |
| R-6 | ✅ Đã thống nhất: mọi nơi so tên "Tôi" dùng `isOwnerName` (`funds.ts`, có `trim`). Còn lại vài chỗ so `=== BILL_OWNER_NAME` trên tên đã được làm sạch từ trước (ví dụ `pair.from`) | ✅ | thấp |
| R-7 | ~~Hai đơn vị `Vnd`/`Nghin`~~ — **đã bỏ**: mọi tiền là đồng. Rủi ro còn lại: dữ liệu cũ phải qua `ensureVndUnits`; thao tác đọc `bills`/`pays` KHÔNG đi qua `readBillsRaw`/`readPaysRaw` sẽ thấy dữ liệu nghìn đồng chưa chuyển (hiện chỉ `backupRepository`, đã gọi `ensureVndUnits`) | ✅ `data/moneyMigration.ts` | ⚠️ cần giữ kỷ luật khi thêm chỗ đọc mới |
| R-8 | Sửa/xóa **bill đã có khoản trả**: vì phân bổ không lưu, trạng thái đã trả và các khoản chi `cb` "Trả …" được tính lại; khoản trả không bị xóa theo bill | ✅ `deleteBill`, `billTransferStatuses` | ⚠️ chưa xác minh UI có cảnh báo |
| R-9 | Khôi phục không chạy Sync ngay; CT `src` có thể lệch tới lần mở màn tiếp theo | ✅ `restoreFromText` không gọi sync | ⚠️ |
| R-10 | Số "Chia bill" (tổng hóa đơn) khác "Chi tiêu" (phần của Tôi) trên cùng màn Tổng quan: dễ hiểu nhầm | ✅ `buildBillOverviewCard` vs `sumAmounts` | Thiết kế |
| R-11 | ~~Ba bản cài FIFO, hai quy tắc kiểm tiền quỹ~~ — đã gộp (D-1, D-2 ở `SO-DO-TAI-SU-DUNG.md`); còn D-3, D-4, D-7 là trùng nhẹ | ✅ | thấp |
| R-12 | `src/app/chia-bill/sua.tsx` tự gọi `loadBills()` (tầng route chứa truy cập dữ liệu), trái quy tắc phụ thuộc ở `KIEN-TRUC-DU-AN.md` | ✅ | nhẹ |

## 4. Tài liệu ≠ code

| Tài liệu / chú thích | Nói rằng | Code thực tế |
|---|---|---|
| `docs/KIEN-TRUC-DU-AN.md` mục 4 | `src/app/index.tsx`, `explore.tsx` là route mẫu còn giữ | ❌ không còn: route chính là `(tabs)/…` và 23 route con |
| `docs/KIEN-TRUC-DU-AN.md` mục 4 | `features/funds|bills|debts` "chưa có logic nghiệp vụ xác nhận", `domain/`, `data/` "tạo sau" | ❌ đã đầy đủ (30 file `domain`, 13 file `data`, 56 file test) |
| `docs/KIEN-TRUC-DU-AN.md` mục 1, 4 | `components/ui/`, `global.css`, `src/features/expenses/ExpenseScreen.tsx` | ❌ không tồn tại (kiểm `find src`) |
| `docs/SESSION-STATE.md` (`CLAUDE.md` bảo đọc nếu có) | — | ❌ file **chưa tồn tại** |
| Chú thích `DebtsTab.tsx` | "Chạm một người ở phần 2 để chọn: phần 3 chỉ còn giao dịch giữa tôi và người đó và hiện nút Thanh toán cố định" | ❌ code mở `/cong-no/chi-tiet` khi chạm người; nút Thanh toán nằm ở `DebtDetailScreen` |
| Chú thích `DebtOverviewCards.tsx` (`DebtPeopleSection`: "bấm một người để mở chi tiết nợ") | — | ⚠️ đúng cho bản trong `DebtPeoplePanel.tsx`; bản trong `DebtOverviewCards.tsx` không còn được dựng |
| Chú thích `FundOverviewCard.tsx` ("vào chi tiết bằng tab Quỹ nhóm") | — | ✅ khớp: thẻ không bấm được |
| `docs/` chỉ có 1 file trước lượt này | — | Bộ 4 tài liệu này là mới |

## 5. Những nội dung **chưa** xác minh được

- ❓ Chưa chạy app trên **thiết bị thật/iPhone** trong lượt này; không xác minh giao diện, vuốt, bàn phím, `Share`, lưu ảnh bill.
- ❓ Chưa tái hiện bằng test các ca R-2, R-4, R-8, R-9 (chỉ đọc code).
- ❓ D-1 (ba bản FIFO) — chú thích nói kết quả trùng nhau cho cặp có "Tôi"; chưa kiểm lại từng test trong lượt này.
- ❓ Chưa kiểm tra các nhánh `FundSingleFlow`, `planDebtPayment('bill'|'loan')` bằng chạy (chỉ xác nhận không có nơi gọi).
- ⚠️ Cả 20 khối Mermaid đã được kiểm **cú pháp** bằng `mermaid.parse` (mermaid 10.9.1, nạp trong trình duyệt tích hợp) và đều hợp lệ; chưa kiểm bố cục khi render, và trình xem Markdown khác (phiên bản Mermaid khác) có thể hiển thị khác.
- ❓ Dữ liệu thật của người dùng và bản PWA gốc không được đọc; mọi so sánh với PWA chỉ dựa vào chú thích trong code.

## 6. Cách bảo trì tài liệu

1. Đổi route → sửa bảng 2.5 và sơ đồ 2.x trong `SO-DO-TONG-QUAN.md`.
2. Đổi luồng ghi/đồng bộ → sửa mục 3 của `SO-DO-TONG-QUAN.md` và cột "Dữ liệu liên kết" ở mục 1 của file này.
3. Thêm/bỏ component hoặc hàm dùng chung → chạy lại các lệnh `grep` ghi ở đầu `SO-DO-TAI-SU-DUNG.md` rồi cập nhật bảng.
4. Mỗi khi xác minh thêm một mục ⚠️/❓, đổi ký hiệu và ghi ngày + lệnh/test đã chạy.
