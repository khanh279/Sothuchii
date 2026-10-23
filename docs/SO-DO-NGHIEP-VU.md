# Sơ đồ 2 — Luồng nghiệp vụ chi tiết từng tính năng

> Thuộc bộ tài liệu bắt đầu từ [`SO-DO-TONG-QUAN.md`](SO-DO-TONG-QUAN.md) (xem mục 0 về ký hiệu ✅ ⚠️ ❓ ❌). Tiền: **mọi thứ là ĐỒNG** (Chi tiêu, Quỹ, Chia bill, Công nợ).
> Chỉ mô tả chức năng **có trong code**. Chức năng không có được ghi rõ là ❌.

Mục lục: [A. Chi tiêu cá nhân](#a-chi-tiêu-cá-nhân) · [B. Quỹ nhóm](#b-quỹ-nhóm) · [C. Chia bill](#c-chia-bill) · [D. Công nợ](#d-công-nợ) · [E. Lịch sử giao dịch](#e-lịch-sử-giao-dịch) · [F. Tổng quan](#f-tổng-quan)

---

## A. Chi tiêu cá nhân

**Màn hình:** `ExpensesTab` (tab), `ExpenseFormScreen` (`/chi-tieu/nhap`), `ExpenseDetailScreen` (`/chi-tieu/chi-tiet`), `HistoryScreen` (`ExpenseRow` dùng lại; route `/lich-su` ❌ không có nơi gọi).
**Kho:** `sct:m:YYYY-MM` (đồng) + `sct:settings`. **Repository:** `src/data/expenseRepository.ts` (ghi trực tiếp, **không** qua `*Synced`).

```mermaid
flowchart TD
  A0["Mở form<br/>nút Chi tiêu (tab) / FAB Tổng quan / HistoryScreen rỗng"] --> A1["ExpenseFormScreen<br/>params: kỳ (periodToParams), d = suggestedDateFor"]
  A1 -->|"có m,id: sửa"| A2{"linkedExpenseNotice(existing)<br/>src = quy hoặc cb?"}
  A2 -->|"có"| A3["Hiện thông báo, khóa form<br/>sửa tại nguồn"]
  A2 -->|"không"| A4
  A1 -->|"thêm mới"| A4["Nhập: số tiền (AmountField + nút nhanh),<br/>nội dung ≤ 80, mục chi, ngày (DateField)"]
  A4 --> A5["Bấm Lưu: validateExpenseInput(input, today)"]
  A5 -->|"tiền ≤ 0 hoặc ngày sai"| A4
  A5 -->|"hợp lệ"| A6["buildExpense(input, existing, now)"]
  A6 -->|"thêm"| A7["addExpense → khóa sct:m:tháng-của-ngày"]
  A6 -->|"sửa"| A8["updateExpense(ref, patch a,c,n,d)<br/>đổi sang tháng khác = chuyển bản ghi, giữ id"]
  A7 --> A9["toast savedMessage → leave()"]
  A8 --> A9
  A9 --> A10["notifyWrite → useExpenses tải lại<br/>Tổng quan, tab Chi tiêu, Giao dịch"]
```

**Xem – sửa – xóa (lịch sử trong tab Chi tiêu):** `useExpenses(period)` → `groupByDay(filterByCategory(...))`; thẻ biểu đồ tròn `ExpenseCategoryOverview` (`summarizeByCategory`, `donutSegments`) và `ChipRow` lọc mục (giữ bằng `usePersistedState`, chỉ trong phiên chạy).

```mermaid
flowchart LR
  R["ExpenseRow (HistoryCard)"] -->|"chạm"| D["/chi-tieu/chi-tiet"]
  R -->|"vuốt Sửa"| E{"src quy/cb?"}
  E -->|"có"| T["toast: sửa tại nguồn"]
  E -->|"không"| F["/chi-tieu/nhap?m,id"]
  R -->|"vuốt Xóa"| X{"src quy/cb?"}
  X -->|"có"| T
  X -->|"không"| U["deleteExpenseUndoable → toast Đã xoá + Hoàn tác"]
  U -->|"Hoàn tác"| UD["ghi lại đúng bản ghi thô cùng id, tháng"]
```

| Điểm | Chi tiết (✅ theo code) |
|---|---|
| Nơi tính | `src/domain/expenses.ts`: `buildExpense`, `validateExpenseInput`, `isInPeriod`, `sumAmounts`, `groupByDay`, `summarizeByCategory`, `budgetSummary` |
| Nơi kiểm tra | UI: `validateExpenseInput`; kho: `addExp` (`expenseApi`) ném `ExpenseInputError`; sửa/xóa khoản tự sinh: **chỉ chặn ở UI** (`linkedExpenseNotice`), `expenseRepository.updateExpense/deleteExpense` không kiểm `src` (xem R-5) |
| Bản ghi liên kết | Không có (khoản tự nhập không có `src`). Khoản có `src` do `billSync`/`fundSync` quản lý |
| Ảnh hưởng sau lưu | Tổng quan (thẻ tổng chi, ngân sách, Chi tiêu, Giao dịch gần đây), tab Chi tiêu, `/giao-dich` |
| Cài đặt liên quan | `SettingsScreen`: `setBudget` (theo tháng, áp dụng cho các tháng sau), mục chi tự thêm (`addCustomCategory`), danh sách người; ghi qua `saveSettings`/`addPersonToList` |

---

## B. Quỹ nhóm

**Màn hình:** `FundListScreen` (tab), `FundExpenseScreen` → `FundExpensePanel` → `ContributionForm` / `FundExpenseForm` (`/quy/thu-quy`, `/quy/chi-tieu`), `FundHistoryScreen`, `FundEntryDetailScreen`, `FundEntryEditScreen`, `FundPersonDebtScreen`, `FundAdvanceActionScreen` (+ `FundActionSheet`, `FundPayFlow`, `AdvanceSpendCard`).
**Kho:** `quy_nhom_v1` (đồng): `funds, contribs, expenses, advances, fundTxns, cur`. **Ghi:** `fundService.*Synced` → `fundRepository` (`mutate` = đọc bản thô, sửa, ghi lại; khóa lạ giữ nguyên).

### B1. Mô hình dữ liệu quỹ (✅ `src/types/fund.ts`, đối chiếu `fundRepository`)

```mermaid
erDiagram
  FUND ||--o{ CONTRIBUTION : "fundId"
  FUND ||--o{ FUNDEXPENSE : "fundId"
  FUND ||--o{ ADVANCE : "fundId"
  FUND ||--o{ FUNDTXN : "fundId"
  ADVANCE ||--o{ FUNDEXPENSE : "advanceId (mode=advance)"
  ADVANCE ||--o{ FUNDTXN : "advanceId (refund, payout phần vượt)"
  FUNDEXPENSE ||--o{ FUNDTXN : "expenseId (payout cho mode=personal)"
  CONTRIBUTION |o--o| EXPENSE_CA_NHAN : "exp {m,id} (phần Tôi, src=quy)"
  FUND {
    string id
    string name
  }
  CONTRIBUTION {
    string id
    string title
    string date
    json people "name + amount"
  }
  FUNDEXPENSE {
    string id
    number amount
    string mode "thiếu=trực tiếp | personal | advance"
    string payer
    string advanceId
    number fundPart "chỉ personal đã chia nguồn tiền"
  }
  ADVANCE {
    string id
    string person
    number amount "có thể 0"
  }
  FUNDTXN {
    string id
    string kind "refund | payout"
    string person
    number amount
  }
```

Hồ sơ ứng trước **không lưu trạng thái**: `advanceSummary` (`src/domain/fundAdvance.ts`) tính `balance = given − spent − refunded + paidExtra`; `balance > 0` = cá nhân còn giữ (`held`), `< 0` = quỹ nợ (`owed`).

### B2. Thu quỹ (đóng quỹ)

```mermaid
flowchart TD
  S1["FundTxnSheet (chọn quỹ) → /quy/thu-quy?fund"] --> S2["FundExpensePanel mode=thu → ContributionForm"]
  S2 --> S3["Nhập nội dung, ngày, số người, từng người (PersonPicker) + tiền<br/>ô nhập đồng (MoneyTextInput), lưu đồng (parseVndInput)"]
  S3 --> S4["validateContribution(draft)"]
  S4 -->|"lỗi"| S3
  S4 --> S5["saveContributionSynced → fundRepository.saveContribution"]
  S5 --> S6["syncFundExpenses: desiredLinkedExpense<br/>= phần tên đúng 'Tôi' (cộng nhiều dòng)"]
  S6 -->|"phần Tôi > 0"| S7["addExp src=quy, mục FUND_CATEGORY_ID<br/>ghi contrib.exp"]
  S6 -->|"= 0"| S8["bỏ liên kết / dọn mồ côi"]
```

Sửa lần đóng: `/quy/sua?kind=contribution` → cùng `ContributionForm`. Xóa: vuốt Xóa ở `FundHistoryScreen` → `deleteContributionSynced` (khoản chi cá nhân mồ côi được `fundSync` dọn).

### B3. Chi quỹ – ba hình thức (`FundExpenseForm`, `KIND_OPTIONS`) + lựa chọn "Quỹ giao tiền A chi"

```mermaid
flowchart TD
  C0["FundExpenseForm (thêm mới)"] --> C1{"Hình thức chi"}
  C1 -->|"Quỹ chi trực tiếp (mặc định)"| D1["amount ≤ tiền thực tế trong quỹ?<br/>(cash = fundPosition.cash)"]
  D1 -->|"đủ"| D2["saveFundExpense mode thiếu<br/>checkDirectSpend lại ở kho"]
  D1 -->|"không đủ"| D3["Thẻ 'Không đủ số dư quỹ'<br/>→ chọn Cá nhân ứng chi"]
  C1 -->|"Cá nhân ứng tiền chi trước"| E1["chọn Người chi (thành viên quỹ)"]
  E1 -->|"từ thẻ thiếu tiền / splitIntent"| E2["splitByCash(cash, amount) → fundPart + personalPart<br/>ConfirmDialog xem lại phân bổ"]
  E1 -->|"không chia"| E3["một bản ghi mode=personal, quỹ nợ người đó cả khoản"]
  E2 --> E4["saveFundExpense mode=personal, fundPart<br/>1 bản ghi duy nhất"]
  E3 --> E4
  C1 -->|"Quỹ giao tiền ứng trước"| F1["Chọn người nhận + số tiền giao (≥ 0)<br/>≤ maxAdvanceGive = tiền thực tế"]
  F1 --> F2["createAdvanceSynced → hồ sơ ứng, tiền thực tế quỹ giảm, KHÔNG phải chi phí"]
  C1 -->|"Quỹ giao tiền A chi (mỗi người đang giữ ứng)"| G1["planAdvanceSpend(data, quỹ, A, amount)<br/>chia theo lần giao CŨ NHẤT trước"]
  G1 --> G2["mỗi phần: saveFundExpense mode=advance, advanceId<br/>phần dư vượt tiền giữ → dồn vào lần giao MỚI NHẤT (thành quỹ nợ A)"]
```

Ý nghĩa tiền (`fundAdvance.ts`): tổng chi thực tế tính **mỗi khoản chi đúng một lần**; số dư quỹ (`fundBalance`) = thu − chi; **tiền thực tế** (`fundCash`/`fundPosition.cash`) = thu − chi trực tiếp (và phần `fundPart`) − tiền đã giao ứng + đã hoàn − quỹ đã trả cho cá nhân. Giao ứng, hoàn tiền, thanh toán **không phải chi phí**.

### B4. Công nợ quỹ theo người – hai phía (`FundPersonDebtScreen`, `fundPerson.ts`)

```mermaid
flowchart TD
  H0["FundHistoryScreen → thẻ Công nợ quỹ<br/>fundPersonBalances(data, fund)"] -->|"1 người có owed > 0"| O["side = owed (Quỹ nợ A)"]
  H0 -->|"1 người có held > 0"| HD["side = held (A nợ quỹ)"]
  O --> O1["Danh sách: khoản A ứng tiền túi chi (personalSpend) chưa trả hết<br/>+ dòng 'Chi vượt tiền ứng' (phần vượt tiền được giao)"]
  O1 -->|"PayActionBar Thanh toán"| O2["FundPayFlow → FundOwedFlow<br/>gộp 1 lần, ưu tiên khoản CŨ NHẤT"]
  O2 --> O3["combinedPayoutLimit → planCombinedPayout → payMany<br/>mỗi phần saveFundTxnSynced kind=payout"]
  O1 -->|"chạm dòng vượt"| O4["/quy/chi-tiet?kind=overflow<br/>OverflowDetail: vì sao nợ + khung chi từ ứng"]
  HD --> H1["Danh sách các lần giao A ứng chưa chi hết, ghi chú 'Đã chi X'<br/>+ khung 'Quỹ giao A ứng chi' (AdvanceSpendCard)"]
  H1 -->|"+ Thêm khoản chi"| H2["/quy/ung-chi?mode=expense&person&fund<br/>FundActionSheet → planAdvanceSpend → saveFundExpenseSynced × N"]
  H1 -->|"Hoàn tiền ứng"| H3["/quy/ung-chi?mode=refund&id (chọn hồ sơ nếu >1)<br/>saveFundTxnSynced kind=refund, checkRefund"]
```

`FundPayFlow` còn nhánh `FundSingleFlow` (chọn từng khoản) nhưng `FundPersonDebtScreen` luôn truyền `side` và tắt thanh toán ở phía `held`, nên nhánh này chỉ chạy khi mở route **không có `side`** (⚠️ không thấy nơi gọi như vậy trong app).

**Tình huống đặc biệt**

| Tình huống | Xử lý (nơi) |
|---|---|
| Chi trực tiếp vượt tiền thực tế | Chặn: `checkDirectSpend` (UI + `saveFundExpense`); gợi ý chuyển sang "Cá nhân ứng chi" |
| Giao ứng vượt tiền thực tế | `checkAdvanceGive`/`maxAdvanceGive` |
| Hoàn tiền quá số đang giữ / thanh toán quá số nợ | `checkRefund` / `checkPayout` (UI trong `FundActionSheet`, lại trong `saveFundTxn`) |
| Xóa khoản chi cá nhân ứng đã có thanh toán | Chặn: "hãy xoá thanh toán trước" (`deleteFundExpense`) |
| Xóa hồ sơ ứng đã có chi/hoàn/thanh toán | Chặn (`deleteAdvance`) |
| Xóa cả quỹ | Xóa `contribs, expenses, advances, fundTxns` của quỹ; chi tiêu cá nhân `src:'quy'` thành mồ côi, `fundSync` dọn |
| Bấm lưu nhiều lần / thử lại | `clientId` sinh một lần mỗi lần mở form → không ghi trùng (`saveFundExpense`, `saveFundTxn`) |

**Cập nhật sau mọi thao tác quỹ:** `fundService.*Synced` → `syncFundExpenses` → `notifyWrite(quy_nhom_v1)` → `useFundData` (mọi màn quỹ, kể cả đang nằm sau) tải lại; Tổng quan: thẻ `FundStatCard` (tổng `fundBalance`).

---

## C. Chia bill

**Màn hình:** `BillCalcScreen` (`/chia-bill/tao`, `/chia-bill/sua`), `BillHistoryScreen` (tab + `/chia-bill/lich-su`), `BillDetailScreen`, `BillPaymentScreen`, (`PersonBillsScreen` ❌ không có nơi gọi).
**Kho:** `chiabill:v2:bills` (+ `chiabill:names`), thanh toán ghi vào `chiabill:v2:pays`. **Tiền: đồng** (dữ liệu cũ nghìn đồng được chuyển một lần, xem `SO-DO-TONG-QUAN.md` mục 3.4).

### C1. Tạo / sửa bill

```mermaid
flowchart TD
  B0["Tạo bill: BillsTab/FAB → /chia-bill/tao<br/>Sửa: vuốt Sửa → /chia-bill/sua?id (EditBillRoute loadBills)"] --> B1["BillCalcScreen<br/>initialPeople(chiabill:names, danh sách người)"]
  B1 --> B2["Nhập: tên bill, ngày, mục chi,<br/>2..20 người; mỗi người: tên, ĐÃ CHI, hệ số w (mặc định 1), mức cố định fix"]
  B2 --> B3["computeSplit(people) — tính trực tiếp khi gõ"]
  B3 --> B4{"split.bad ?"}
  B4 -->|"over: tổng mức cố định > tổng bill<br/>gap: ai cũng cố định nhưng lệch tổng"| B5["describeSplitProblem — nút Lưu khóa"]
  B4 -->|"không"| B6["SplitReceipt: phần mỗi người, net = đã chi − phần,<br/>suggestTransfers → ai chuyển cho ai bao nhiêu"]
  B6 --> B7["Lưu: canSaveBill → saveBillSynced"]
  B7 --> B8["billRepository.saveBill (tính lại computeSplit, id mới hoặc cập nhật)<br/>+ saveBillNames (nhớ nhóm người)"]
  B8 --> B9["syncBillExpenses"]
  B9 --> B10["Mới: toast 'Đã lưu vào lịch sử', reset (giữ người & ngày), quay lại danh sách<br/>Sửa: toast 'Đã lưu thay đổi', quay lại"]
```

**Quy tắc `computeSplit`** (`src/domain/bills.ts`): người có `fix` trả đúng mức; phần còn lại của tổng bill chia cho người còn lại theo hệ số `w` (tổng hệ số 0 → chia đều); `net = paid − share` (dương = nhận lại, âm = còn thiếu); `suggestTransfers` ghép chủ nợ – con nợ thành các `Transfer {from,to,amt}`. Khi `bad` thì **không có** gợi ý chuyển.

### C2. Phần chi tiêu cá nhân sinh từ bill

`desiredBillExpense(bill)`: nếu có người tên đúng `Tôi` và bill không lỗi → khoản `src:'cb'`, số tiền = `Math.round(min(đã chi, phần phải trả))` của "Tôi", mục = `bill.cat`, ghi chú `i` có "Trả trước …" nếu đã chi ít hơn phần mình. Liên kết lưu ở `bill.exp`.

### C3. Danh sách – chi tiết – thanh toán

```mermaid
flowchart TD
  L0["Tab Chia bill = BillHistoryScreen (tab)"] --> L1["BillOverviewSection: số bill, tổng, người chi nhiều nhất<br/>BillPairsSection: các CẶP còn phải thanh toán trong kỳ (buildBillPairs)"]
  L0 --> L2["BillListCard: lọc theo người (chip), nhóm theo ngày,<br/>nhãn Đã thanh toán / Chưa (billSettled ← billTransferStatuses)"]
  L2 -->|"chạm"| L3["BillDetailScreen: người, đã chi, phải chịu,<br/>trạng thái từng khoản chuyển, Lưu ảnh / Chia sẻ"]
  L1 -->|"chạm 1 cặp (pair=billPairKey)"| P0["BillPaymentScreen"]
  P0 --> P1["PayPageFrame: Tôi nợ X / X nợ tôi + danh sách khoản bill của cặp<br/>(buildBillPairItems)"]
  P1 -->|"PayActionBar Thanh toán"| P2["PaymentSheet → BillPaymentPanel → PaymentPanel<br/>Toàn bộ | Một phần (nhập số)"]
  P2 --> P3["recordBillPairPaymentSynced(from,to,period,amount)"]
  P3 --> P4["tính lại buildBillPairs NGAY LÚC GHI;<br/>cặp biến mất/đổi chiều → PayInputError, không ghi"]
  P4 --> P5["checkPairPayment(remaining, amount)"]
  P5 --> P6["pairAmountDraft → finalizeNewPays → appendPays<br/>ĐÚNG MỘT khoản trả sổ bill (kind billpay) giữa hai người"]
  P6 --> P7["syncBillExpenses: nếu 'Tôi' là người TRẢ → allocatePayments phân bổ vào bill cũ→mới → khoản chi cá nhân src=cb 'Trả … · bill dd/mm'"]
```

**Phân bổ khoản thanh toán vào từng bill:** *không lưu* phân bổ. Mỗi lần hiển thị, `billTransferStatuses` (`src/domain/billPayment.ts`) duyệt bill + khoản trả theo thứ tự (ngày, `createdAt`), mỗi khoản trả `from→to` trừ dần vào các khoản "from phải chuyển cho to" **bill cũ trước**. Trạng thái bill: `paid | partial | unpaid` từng khoản; `billSettled` = mọi khoản đã trả. Lưu ý có **3 bản cài đặt cùng quy tắc FIFO** (xem `SO-DO-TAI-SU-DUNG.md`, mục 5).

**Xóa bill:** vuốt Xóa → `deleteBillSynced` → `syncBillExpenses` dọn khoản chi `src:'cb'` mồ côi (chỉ khi không bill nào và không khoản trả nào trỏ tới).

---

## D. Công nợ

**Màn hình:** `DebtsTab`, `DebtDetailScreen` (`/cong-no/chi-tiet`), `PayFormScreen` (`/cong-no/ghi-nhan`, `/cong-no/sua`), `PayDetailScreen`, `PayTransactions` (lịch sử trong tab). **Kho:** `chiabill:v2:pays` + `bills`. **Đồng.**

### D1. Hai sổ và cách tính số dư

Không lưu số dư. `debtEvents(bills, pays)` (`src/domain/ledger.ts`) tạo mọi biến động liên quan "Tôi": gợi ý chuyển của từng bill (sổ `bill`) và khoản trả (sổ `loan` nếu kiểu vay, `bill` nếu kiểu trả bill, `bt` = gộp nợ thuộc sổ `led`). `personLedger(events, name)` → `{loan, bill}`; dương = người đó nợ tôi.

```mermaid
flowchart LR
  EV["debtEvents(bills, pays)"] --> PL["personLedger(name)<br/>loan, bill (dấu: + họ nợ tôi)"]
  EV --> AD["allDebts → get, owe"]
  PL --> DD["buildDebtDetail → DebtDetailScreen"]
  AD --> DO["buildDebtOverview → DebtStatCard, DebtTotalsSection, DebtPeopleSection"]
  PL --> PAYPLAN["planDebtPayment / mergeDrafts"]
```

### D2. Ghi nhận giao dịch (nợ vay / trả bill)

```mermaid
flowchart TD
  G0["DebtsTab nút Giao dịch / FAB Tổng quan → /cong-no/ghi-nhan"] --> G1["PayFormScreen: Người trả → Người nhận (một đầu là 'Tôi'),<br/>Loại: Trả bill (billpay) | Vay (vay), số tiền, ngày, ghi chú"]
  G1 --> G2["canRecordPay(who, amount)"]
  G2 --> G3["addTransferSynced: khoản giống hệt (cùng ngày, người, loại, ghi chú) được CỘNG DỒN"]
  G3 --> G4["payRepository.appendPays + dedupe"]
  G4 --> G5["syncBillExpenses"]
  G5 --> G6["Số dư & lịch sử cập nhật (useReloadOnWrite)"]
```

Sửa: `/cong-no/sua?ids` → `updateTransferSynced` (một khoản) hoặc `updatePayGroupSynced` (nhóm hiển thị chung, thay bằng một khoản `repay`). Xóa: `deletePaySynced(ids)`.

### D3. Thanh toán với một người (`DebtDetailScreen`) – "toàn bộ" / "một phần"

```mermaid
flowchart TD
  T0["DebtDetailScreen (name)"] --> T1["buildDebtDetail → hai ngăn Nợ vay / Nợ bill, lịch sử gộp"]
  T1 --> T2{"canMerge(debt)?<br/>hai sổ TRÁI dấu"}
  T2 -->|"có"| T3["Chỉ cho Gộp nợ: mergeDebtsSynced<br/>ghi 2 khoản kind=bt cùng grp (không tạo nợ mới)"]
  T3 --> T4["Hoàn tác: undoMergeSynced → checkUndoMerge<br/>(từ chối nếu sau gộp đã có giao dịch mới)"]
  T2 -->|"không (cùng dấu hoặc 1 sổ)"| T5["PayActionBar Thanh toán → PaymentSheet → DebtPaymentPanel"]
  T5 --> T6["Toàn bộ → option 'all' | Một phần → option 'partial' + số tiền"]
  T6 --> T7["recordDebtPaymentSynced → planDebtPayment"]
  T7 --> T8["partial: trả NỢ BILL trước, rồi NỢ VAY;<br/>còn dư → ghi thêm 1 khoản vay MỚI note 'Trả dư' (sổ vay đổi chiều)"]
  T8 --> T9["appendPays (1 lần lưu) → syncBillExpenses"]
```

UI chỉ dùng hai lựa chọn `all` và `partial`; `planDebtPayment` còn hỗ trợ `bill` và `loan` nhưng ✅ không có nơi gọi hai lựa chọn này trong `features/`.

### D4. Một người vừa nợ vay vừa nợ bill

- **Cùng dấu** (cả hai họ nợ tôi hoặc cả hai tôi nợ họ): thanh toán một phần chia theo thứ tự bill → vay → dư (D3).
- **Trái dấu**: `planDebtPayment` trả `[]` ("phải Gộp nợ trước, không tự bù trừ"); UI chỉ hiện Gộp nợ. Số tiền gộp = `mergeAmount(debt)`.

### D5. Chi tiêu cá nhân sinh từ công nợ

Khi **"Tôi" trả bill** hoặc gộp nợ làm giảm nợ bill của tôi: `planDebtExpenseSync`/`allocatePayments` (`src/domain/payExpenses.ts`) trừ số tiền đó dần vào các bill tôi còn nợ người ấy (bill cũ trước), mỗi phần thành khoản chi cá nhân `src:'cb'` (mục = mục của bill, `i` = "Trả <ai> · bill dd/mm" hoặc "Bù trừ nợ ..."). Liên kết lưu ở `pay.exp[]`. **Khoản vay không sinh chi tiêu.** Nhận tiền (người khác trả tôi) cũng không sinh chi tiêu.

---

## E. Lịch sử giao dịch

Không có kho "lịch sử" riêng. Mỗi màn dựng lịch sử từ kho gốc bằng hàm thuần, dùng chung giao diện `HistoryCard` (`SwipeRow` + `TransactionRow`).

| Lịch sử | Nguồn dữ liệu | Hàm dựng | Bộ lọc | Thao tác trên dòng | Bảo vệ |
|---|---|---|---|---|---|
| Chi tiêu (tab) | `sct:m:*` | `groupByDay(filterByCategory(...))` | kỳ dùng chung; chip mục chi | chạm → chi tiết; vuốt Sửa/Xóa (+Hoàn tác) | `linkedExpenseNotice` khóa khoản `src quy/cb` |
| Giao dịch (`/giao-dich`, trong Tổng quan) | chi tiêu cá nhân + `pays` | `buildRecentTransactions` | kỳ (cửa sổ + `filterPeriod`) | chỉ xem | Bỏ khoản chi `cb` là "bóng" của khoản trả (`pay.exp`) để không đếm đôi |
| Bill (tab) | `bills` | `buildBillHistory`, `filterBillsByPerson` | kỳ; chip người | chạm/Sửa/Xóa | xóa → dọn chi tiêu `cb` |
| Giao dịch Công nợ (`PayTransactions`) | `pays` | `buildPayHistory`, `filterPayDays`, `filterPayDaysByPerson` | kỳ; chip Trả bill/Chuyển tiền; chip người | chạm → `PayDetailScreen`; Sửa; Xóa | gộp nợ `bt` không hiện; hoàn tác gộp chỉ ở chi tiết nợ |
| Quỹ | `quy_nhom_v1` | `buildFundHistory`, `filterCashMovementDays`, `mergePayoutEntries`, `filterDaysByPerson` | kỳ; chip thành viên | chạm → `FundEntryDetailScreen`; vuốt Sửa → `FundEntryEditScreen`; Xóa | các chặn xóa ở mục B |

**Giao dịch tạo tự động từ nghiệp vụ khác:** (1) `src:'quy'` từ thu quỹ phần "Tôi"; (2) `src:'cb'` từ bill (phần "Tôi") và từ khoản trả nợ bill; (3) khoản gộp nợ `bt` (2 khoản cùng `grp`). Cả (1) và (2) **chỉ sửa/xóa tại nguồn**.

---

## F. Tổng quan

`OverviewScreen` đọc: `useExpenses(period)`, `useExpenseSettings`, `useDebtData` (bills + pays + người), `useFundData` (đếm có quỹ, `FundStatCard`).

```mermaid
flowchart TD
  P["useSharedPeriod → period"] --> SP["SpentCard<br/>total = sumAmounts(items kỳ)<br/>budgetSummary(total, period, settings, today)<br/>averagePerDay (ẩn nếu kỳ Tất cả)"]
  P --> BS["BillStatCard<br/>buildBillOverviewCard: số bill & TỔNG TIỀN HÓA ĐƠN trong kỳ (không phải phần của Tôi)"]
  P --> DS["DebtStatCard<br/>buildDebtOverview: get − owe, TOÀN THỜI GIAN (kỳ chỉ ảnh hưởng danh sách cặp)"]
  P --> ES["ExpenseStatCard<br/>summarizeByCategory: tổng + mục nhiều nhất"]
  FD["useFundData"] --> FS["FundStatCard<br/>Σ fundBalance các quỹ, TOÀN THỜI GIAN"]
  P --> RT["RecentTransactions<br/>cửa sổ RECENT_DAYS ngày gần nhất (buildRecentTransactions)"]
  RT -->|"Xem tất cả"| TX["/giao-dich (theo kỳ dùng chung)"]
```

| Thẻ | Phụ thuộc kỳ? | Nguồn | Ghi chú |
|---|---|---|---|
| Đã chi (SpentCard) | Có | `sct:m:*` | Gồm khoản `src quy/cb` (phần "Tôi") |
| Chia bill | Có | `bills` | Tổng tiền các bill, khác với chi tiêu cá nhân |
| Công nợ | **Không** (số dư) | `bills`+`pays` | Hiển thị dạng `+/−` và "Tôi nợ / Nợ tôi" |
| Chi tiêu | Có | chi tiêu cá nhân | |
| Quỹ nhóm | **Không** | `quy_nhom_v1` | Tổng số dư, số quỹ |
| Giao dịch gần đây | Cửa sổ ngày gần đây | chi tiêu + pays | Dòng **không bấm được**; chỉ nút "Xem tất cả" |

Các thẻ `SummaryCard` **không điều hướng** (✅ `SummaryCard` không có `onPress`); điều hướng từ Tổng quan chỉ có: nút cài đặt, "Xem tất cả" và nút nổi +. Cập nhật sau khi dữ liệu đổi: các hook (`useExpenses`, `useDebtData`, `useFundData`) đều đăng ký `useReloadOnWrite` nên thẻ đổi ngay kể cả khi Tổng quan đang nằm phía sau.
