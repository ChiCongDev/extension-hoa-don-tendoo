# Extension Hóa đơn điện tử Tendoo — Sell

Tạo hóa đơn điện tử trên **Tendoo** từ trang **Báo cáo theo khách hàng** của
project **Sell**: chọn khách → ghép tổ hợp sản phẩm có tổng tiền sát nhất với
doanh thu của khách (lệch ≤ 200.000đ) → tạo hóa đơn trong **tài khoản Tendoo
riêng của chính khách đó**.

> ## ⚠️ CÔNG TẮC TỰ BẤM THANH TOÁN — MẶC ĐỊNH TẮT
> Khi tắt, máy chỉ ghép tiền rồi **bỏ hàng vào giỏ và dừng** cho người dùng tự
> kiểm — không bấm Thanh toán, không phát hành hóa đơn nào. Muốn máy tự bấm phải
> gạt **hai lớp** công tắc trong popup: bật, rồi tick thêm ô xác nhận. Tắt lớp
> trên là xác nhận mất theo, lần sau phải tick lại từ đầu.

---

## Vì sao là extension riêng, không gộp vào `extension-theo-doi-gia`

1. **Extension theo dõi giá được gửi cho người trong công ty.** Extension này về
   sau chứa mật khẩu tài khoản Tendoo của khách — gộp vào là mỗi lần gửi
   extension lấy giá cho đồng nghiệp thành ra phát tán luôn mật khẩu.
2. **Quyền hạn khác nhau.** Không cho extension đang chạy tốt phình quyền quá
   việc nó làm.
3. **Manifest V3 mỗi extension một tiến trình nền.** Chạy hàng loạt hóa đơn sẽ
   giành khóa / hàng đợi / báo thức với việc lấy giá chạy mỗi giờ.
4. **Vòng đời khác nhau.** Tendoo đổi giao diện không được kéo theo cái đang chạy.

Extension này **học lại cách làm** của `extension-theo-doi-gia` (cầu nối trang ↔
extension, hàng đợi lưu tiến độ, khóa có hạn) nhưng **không chép file, không phụ
thuộc**. Tin nhắn dùng tiền tố riêng `hdt-` để hai extension không nghe nhầm nhau.

## Không đụng gì tới project Sell

Extension **tự chèn** cột vào trang báo cáo lúc trang chạy. Project Sell giữ
nguyên từng byte — không sửa file, không migration, không deploy lại. Gỡ
extension là trang trở về y như cũ.

Bonus: vì không phải deploy, cột mới **chạy ngay trên bongtom.store**.

---

## Cài đặt (Developer Mode)

1. Mở Chrome, vào `chrome://extensions`
2. Bật **Developer mode** (góc trên bên phải)
3. Bấm **Load unpacked**, chọn thư mục này: `d:\company-dev\extension-hoa-don-tendoo`
4. Mở `https://bongtom.store/bao-cao-khach-hang` → thấy cột **"Tạo HĐĐT"** ở cuối bảng

4. Bấm nút 🔑 cạnh nút "Tạo HĐ" của từng khách để khai báo tài khoản Tendoo
5. Xong. **Không còn khóa mở** — khai báo rồi là chạy được ngay, kể cả sau khi
   đóng Chrome hay tải lại extension

Quyền: `storage`, `tabs`, `alarms` (hẹn giờ tự chạy), các trang báo cáo của Sell
và 3 tên miền Tendoo (`seller-v3`, `id-v3`, `apiv3`).

## Cài độ lệch và hẹn giờ

Bấm nút **⚙** ở tiêu đề cột "Tạo HĐĐT" trên trang báo cáo:

- **Độ lệch tối đa** — mặc định 200.000đ. Đặt cao hơn thì cảnh báo hiện ngay lúc
  gõ: hóa đơn sẽ lệch xa doanh thu thật hơn, mà đây là số đi vào tờ khai thuế.
- **Hẹn giờ tự chạy** — chọn khách ngay trong bảng, gõ **giờ chung** (`21:00`),
  bật rồi Lưu. Tới giờ máy ép bảng về **"Hôm nay"**, kiểm chứng đúng ngày, rồi
  chạy với doanh thu của riêng ngày đó.
- **Giờ riêng từng khách** — ô giờ nhỏ bên phải mỗi khách. Để trống = theo giờ
  chung. Điền vào = khách đó chạy giờ riêng, **giờ chung bỏ qua khách đó**.

Mở ⚙ còn thấy: **tình trạng sẵn sàng** (tới giờ có chạy được không, đang vướng
gì), nút **Kiểm tra thử** (không phát hành gì), và **lịch sử chạy** từng khách.

> ⚠️ Hẹn giờ chỉ chạy khi **Chrome đang mở**. Ở đây không có máy chủ nào — tắt
> máy là không có gì chạy. Và hẹn giờ **không chạy** nếu công tắc "Tự bấm Thanh
> toán" đang tắt, hoặc đang có lệnh treo chưa kết luận.

## Cấu trúc

```
manifest.json          khai báo extension
background.js          tiến trình nền — cầu nối, mở/đóng tab POS, đổi tài khoản

chung/ghepTien.js      thuật toán ghép tiền (thuần tính toán, không đụng DOM)
chung/khoMatKhau.js    kho mật khẩu — chìa TỰ SINH nằm ngay trong kho
chung/dauGio.js        dấu tay của máy trên giỏ hàng, để tự dọn đúng giỏ của mình
chung/soGhiDau.js      sổ ghi dấu, chống tạo trùng hóa đơn
chung/hangDoi.js       hàng đợi tuần tự + khóa có hạn
chung/cauNoi.js        điều phối cả loạt khách, tự mở/đóng tab Tendoo
chung/dieuPhoi.js      điều phối MỘT khách, hai cửa chặn
chung/doiTaiKhoan.js   đổi tài khoản Tendoo mà không cần đăng xuất
chung/domReact.js      gõ vào ô nhập của React/Ant Design cho đúng cách
chung/caiDat.js        chuẩn hóa + GỘP cài đặt (một nơi duy nhất, test được)
chung/henGio.js        logic hẹn giờ: mốc giờ, lần kế tiếp, và các cửa chặn
chung/lichSuChay.js    lịch sử từng lần chạy: khách nào thành công, khách nào không

sell/docBang.js        đọc bảng báo cáo của Sell (CHỈ ĐỌC)
sell/epHomNay.js       ép bảng về đúng HÔM NAY rồi kiểm chứng bằng dòng "Từ…đến…"
sell/chenCot.js        chèn cột, ô tick, thanh nổi, modal
sell/oKhaiBao.js       nút 🔑 trên từng dòng + khung khai báo (iframe)

tendoo/boNoi.js        gọi API thật của Tendoo
tendoo/docSanPham.js   đọc danh sách hàng (lớp chắn, JSON thô không lọt ra ngoài)
tendoo/danhTinh.js     đọc tài khoản đang đăng nhập
tendoo/boGio.js        bỏ hàng vào giỏ trên trang POS
tendoo/bamThanhToan.js NƠI DUY NHẤT được bấm Thanh toán
tendoo/nhanLenh.js     nhận lệnh từ tiến trình nền
tendoo/dangNhap.js     điền form đăng nhập

khaiBao.html/js        trang khai báo, được NHÚNG vào trang Sell bằng iframe
popup.html/js          trạng thái + công tắc tự bấm (KHÔNG còn ô nhập nào)
test/                  bộ test
```

## Chạy test

Phần logic không cần cài gì:

```bash
node test/ghepTien.test.js
```

Phần thao tác DOM cần `jsdom`. Cố ý **không** để `node_modules` trong thư mục
extension (extension phải sạch để nạp vào Chrome), nên trỏ tới nơi đã cài:

```bash
export HDT_JSDOM="/duong/dan/toi/node_modules/jsdom"
node test/docBang.test.js
node test/chenCot.test.js
```

Hiện có **1005 ca test**. Đáng chú ý:

- **Lịch sử chạy chia trang 10 bản ghi.** Đổi trang KHÔNG hỏi lại tiến trình
  nền — cả danh sách đã tải sẵn lúc mở bảng, nên chuyển tức thì và nội dung
  không nhảy lung tung khi có một lượt chạy vừa xong ở giữa chừng. Nút hết
  đường bị khóa và trông như bị khóa; chỉ một trang thì không vẽ thanh.

- **KHÔNG CẦN KHAI BÁO GÌ để ghi sổ kế toán.** Máy ưu tiên ghi qua **chính tab
  Sell bạn đang đăng nhập**: trang Sell gửi kèm cookie phiên + CSRF, Sell xác
  thực bằng phiên **admin** của chính bạn. Chặt hơn hẳn một chuỗi token dùng
  chung, mà lại khỏi khai địa chỉ lẫn token.
  Token vẫn giữ làm **lối phụ** — chỉ cần khi muốn gửi mà không mở tab Sell.
  Hai đường dùng **chung một hàm ghi** bên Sell nên chống trùng và luật "chỉ
  RA_HOA_DON mới tính" không thể lệch nhau.
- **Báo kết quả NGAY TẠI CHỖ.** Khối "gửi sang Sell" nằm cuối màn khai báo,
  nhưng thông báo lại vẽ ở đầu màn — bấm Lưu trong lúc cuộn ở cuối thì không
  thấy gì, tưởng nút không ăn. Nay báo ngay dưới nút, và nói **đúng cái còn
  thiếu** ("chưa có token" / "chưa điền địa chỉ") thay vì "thiếu địa chỉ hoặc
  token".
- **Nút "Thử kết nối"** — gửi một gói thăm dò (mã khách rỗng, Sell bỏ qua nên
  **không ghi gì vào sổ**) rồi báo thẳng đi được đường nào. Biết trong một giây
  thay vì phải chạy hẳn một lượt hóa đơn thật.

- **Nói đúng bệnh khi Sell từ chối.** `403` nay báo thẳng *"Sell TỪ CHỐI TOKEN —
  kiểm tra `EXTENSION_HOA_DON_TOKEN` trong `.env` của Sell"*, `404` báo *"sai địa
  chỉ"*. Trước đây chỉ ghi "Sell trả về 403" và không ai đoán ra phải làm gì —
  mà đó lại là nguyên nhân số một khiến cột XHD bên Sell trống.
  Dòng vẫn nằm lại hàng chờ, cài token xong bấm "Gửi lại" là đẩy bù được.

- **Gửi sang Sell NGAY sau mỗi khách**, không đợi hết loạt. Trước đây chỉ gửi
  một lần ở cuối; loạt bị ngắt giữa chừng (Chrome đóng, máy sập) là những hóa
  đơn **đã ra thật** cũng không sang được Sell — Tendoo có hóa đơn, trang kế
  toán trống. Lần gửi ở cuối loạt vẫn giữ làm **lưới an toàn** (và để gom cả
  những khách chưa từng chạy).
  Hai đường dùng **chung mã chống trùng** lấy từ id lệnh trong sổ ghi dấu, nên
  Sell cập nhật đúng dòng cũ chứ không cộng đôi — có test khoá điều đó.
- **Hàng chờ gửi.** Gửi hỏng thì dòng **nằm lại**, lần chạy sau gửi bù, và tự
  gửi bù khi Chrome mở lại. Trước đây gửi hỏng là mất luôn số của cả lượt.
  Màn khai báo hiện **số dòng đang chờ** kèm nút **"Gửi lại"**.
  Hàng chờ có trần 500 dòng — kho Chrome có hạn, phình ra là hỏng cả kho.

- **Đẩy kết quả sang Sell** cho trang *Kế toán tổng hợp* (`Hệ thống → Kế toán
  tổng hợp`, chỉ Admin). Sau mỗi lần chạy, máy gửi kết quả TỪNG KHÁCH về Sell:
  đã ra hóa đơn thì ghi, **CHƯA ra cũng ghi kèm lý do**.
  ⚠️ **VIỆC PHỤ, luôn chạy sau cùng và luôn nuốt lỗi** — Sell sập, mất mạng,
  token sai đều không được làm hỏng việc phát hành hóa đơn. Có test đọc mã nguồn
  canh đúng thứ tự đó.
  Chống ghi trùng bằng mã lệnh dựng từ (thời điểm chạy + mã khách): gửi lại bao
  nhiêu lần cũng chỉ vào một dòng bên Sell.
  Địa chỉ Sell và token khai ở **màn khai báo** (nút 🔑), không phải popup —
  popup có chốt cứng "không được có ô nhập chữ/mật khẩu nào".

- **LỆNH TREO KHÔNG CÒN CHẶN** (chủ dự án chốt 2026-08-13: *"không cần quan tâm
  trùng hay không, chỉ cần có lệnh chạy là chạy"*). Trước đây còn lệnh treo là
  mọi lần chạy sau đều bị từ chối cho tới khi người dùng tự kết luận từng lệnh.
  Nay: treo tồn đọng được **tự kết luận "chưa ra"** ở đầu mỗi loạt; khách bị
  không-rõ giữa loạt được **ghi lại rồi chạy tiếp** khách sau; dòng "Lệnh treo"
  trong bảng sẵn sàng chỉ còn là **thông tin**.
  ⚠️ Đánh đổi đã được chấp nhận: máy không biết hóa đơn lần trước đã ra hay chưa
  nên **có thể ra hóa đơn trùng**.
  Chốt còn giữ: lệnh **đã từng bấm Thanh toán KHÔNG BAO GIỜ tự chạy lại** — nó
  chuyển sang LỖI chứ không quay về hàng chờ. Và **nguyên văn lý do treo được
  giữ lại** trong sổ (trước đây bị ghi đè mất) để còn tự kiểm trên Tendoo.

- **Canh bảng mã lỗi** (`test/maLoi.test.js`). Ngày 2026-08-13 thêm `MA.TAB_CAM`
  bằng một phép thay chuỗi KHÔNG KHỚP nên im lặng không làm gì; `MA.TAB_CAM`
  thành `undefined`, hàng đợi làm `(kq.ma) || 'KHONG_RO'` nên rơi về `KHONG_RO`
  → **TREO oan → khóa hẳn hẹn giờ**. Mà 916 test vẫn xanh, vì bài test viết
  `assert.strictEqual(kq.ma, MA.TAB_CAM)` — hai vế đều `undefined` nên bằng nhau.
  Nay canh: mọi giá trị trong bảng `MA` phải là **chuỗi không rỗng**, mọi `MA.X`
  dùng trong file phải **có mặt** trong bảng, và không hai mã nào trùng giá trị.
- **Lỗi TRƯỚC KHI đụng Tendoo không bao giờ thành TREO.** Móc "trước mỗi khách"
  (đổi tài khoản) chạy trước mọi việc với giỏ hàng, nên hỏng ở đó là chắc chắn
  chưa phát hành gì — cầu nối gắn cờ `chuaLamGi`, hàng đợi ghi là **LỖI** (chạy
  lại được) thay vì TREO (phải người kết luận). Cờ này còn là lưới an toàn cho
  chính lỗi lập trình kiểu trên. Nhưng nó **không** nới lỏng việc dừng cả loạt:
  sai tài khoản thì vẫn dừng.
- **Sau khi tải lại tab, chờ tới khi tab THẬT SỰ TRẢ LỜI** rồi mới hỏi. "Trang
  đã tải xong" không đồng nghĩa "đã có mã extension" — Chrome chèn mã ở
  `document_idle`, muộn hơn một nhịp; hỏi đúng khe đó là kết luận oan "tab câm".

- **Tab Tendoo câm thì TỰ CHỮA, và nói đúng bệnh.** Trước đây ba chuyện khác hẳn
  nhau — tab không trả lời · tab thiếu bộ phận · trình duyệt chặn localStorage —
  đều in ra cùng một câu *"Không xóa được trạng thái đăng nhập cũ"*, và **vứt đi
  nguyên văn lý do Chrome trả về**. Nay tách ba đường, kèm nguyên văn lý do; và
  tab không trả lời thì máy **tự tải lại tab (F5) rồi thử lại đúng một lần** —
  đúng cách đã dùng sau khi đăng nhập.
- **Kiểm "tab đã sẵn sàng chưa" xét ĐỦ 10 bộ phận.** Bản cũ chỉ xét 5 và **thiếu
  `HDT_DoiTaiKhoan`** — nên tab nạp hụt vẫn được báo sẵn sàng rồi chết giữa
  chừng, lúc giỏ có thể đã có hàng và tài khoản có thể đã đổi. Có test đối chiếu
  danh sách này với chính manifest: đòi bộ phận nào thì manifest phải nạp file
  định nghĩa nó.

- **Giờ riêng cho từng khách.** Mỗi khách trong lịch có một ô giờ; để trống thì
  chạy theo **giờ chung**, điền vào thì chạy theo giờ của riêng mình và **giờ
  chung không đụng tới khách đó nữa**. Nhiều khách cùng một giờ riêng thì gộp
  thành một lượt; giờ riêng trùng giờ chung thì gộp làm **một** mốc (dựng hai
  báo thức cùng giờ là lượt sau đụng khóa chống chạy chồng rồi bị bỏ qua).
- **"Tự chạy theo giờ đã hẹn" là công tắc TỔNG** — tắt là không có gì tự chạy,
  kể cả khách có giờ riêng. Cần đúng một chỗ để tắt sạch mọi thứ tự động.
- **Cảnh báo hai mốc cách nhau dưới 5 phút.** Máy chạy tuần tự từng khách (mỗi
  khách khoảng nửa phút tới một phút), nên lượt sau có thể bị bỏ qua vì lượt
  trước chưa xong.
- **Khách nằm trong lịch mà không có giờ nào** (chưa đặt giờ chung, cũng không
  có giờ riêng) được kể tên ra và tô đỏ — im lặng thì khách đó không bao giờ
  chạy mà chẳng ai biết.

- **Đặt số lượng bằng cách BẤM NÚT "+", không gõ vào ô.** Chạy thật 2026-08-13:
  máy gõ "6" vào ô số lượng, ô hiện 6 nhưng giỏ vẫn chỉ có 1 cái và tổng đứng im
  ở đúng một đơn giá — React chưa từng nhận cú gõ. Nay bấm "+" đúng số lần cần,
  **sau mỗi cú bấm kiểm tổng tăng đúng một đơn giá**; không nhúc nhích thì dừng
  ngay nên không bao giờ vượt quá.
  Nút "+" nhận theo **hình vẽ SVG** và **vị trí so với ô nhập** (`[−] [ô] [+]`),
  vì trang thật không cho nó chữ hay lớp riêng — có test chạy thẳng trên HTML
  thật đã chụp để chắc điều đó.
- **Số lượng thật suy từ TỔNG, không đọc lại ô vừa gõ.** Thông báo cũ đọc chính
  cái ô mình vừa ghi nên in ra câu vô nghĩa *"Cần 6 cái nhưng giỏ chỉ nhận 6"*.
  Nay: *"Cần 6 cái nhưng giỏ chỉ nhận 1 — tổng mới tăng 1.400.000đ thay vì
  8.400.000đ"*.

- **Lịch sử chạy** — mỗi lần chạy (hẹn giờ lẫn chạy tay) ghi lại một bản ghi:
  từng khách một, kèm kết quả và lý do. Giữ 60 lần gần nhất. Trước đây kết quả
  ghi vào ĐÚNG MỘT ô, lần sau đè lần trước — máy chạy lúc không có ai ngồi xem
  nên đè xong là mất sạch dấu vết.
  **"Xong" KHÔNG đồng nghĩa "đã ra hóa đơn"**: công tắc tự bấm tắt thì máy chỉ
  bỏ vào giỏ. Hai trạng thái đó tách hẳn, và **TREO đè lên mọi trạng thái khác**
  vì đó là thứ nguy hiểm nhất.
- **Tình trạng sẵn sàng** — mở ⚙ là thấy ngay "tới giờ có chạy được không" và
  đang vướng cái gì. Bốn thứ chặn hẹn giờ vốn VÔ HÌNH: lịch chưa bật, còn lệnh
  treo, công tắc tự bấm tắt, chưa có tab báo cáo.
- **Kiểm tra thử (không phát hành)** — đi hết đường của hẹn giờ nhưng **dừng
  trước khi đụng Tendoo**: không mở tab Tendoo, không đăng nhập, không phát hành.
  Biết ngay trong vài giây thay vì đợi tới giờ. Có test đọc mã nguồn canh nút
  này không bao giờ gọi tới đường tạo hóa đơn thật.
- **Chọn khách ngay trong bảng cài đặt.** Bản trước đọc danh sách khách lúc MỞ
  bảng, mà bảng cài đặt lại che mất bảng khách — người dùng bật hẹn giờ, bấm
  Lưu, rồi nhận "Hẹn giờ TẮT" mà không hiểu vì sao.

- **Hẹn giờ chỉ lấy doanh thu CỦA ĐÚNG NGÀY HÔM ĐÓ.** Trang báo cáo của Sell mặc
  định lọc **"Tháng này"** (`<option value="thang_nay" selected>`), nên đọc thẳng
  là xuất hóa đơn theo doanh thu cả tháng — mà con số vẫn "trông hợp lý" nên
  không ai phát hiện. Tới giờ, máy đặt bộ lọc về "Hôm nay", dọn ô tìm kiếm, đặt
  lại "Tất cả đơn", nâng 20 → 100 dòng/trang, bấm "Xem báo cáo", rồi **kiểm
  chứng** bằng dòng "Từ … đến …" do chính máy chủ điền: hai đầu phải bằng nhau
  và bằng hôm nay mới được đọc số.
- **Mỗi ngày ĐÚNG MỘT mốc giờ.** Hai mốc trong ngày là tính trùng phần buổi sáng,
  mà chốt chống trùng sẵn có không bắt được (nó đòi trùng cả số tiền).
- **Khách không phát sinh doanh thu hôm đó thì không có dòng trong bảng** — đây
  là chuyện bình thường, không phải lỗi: bỏ qua khách đó, giữ nguyên trong lịch,
  không dừng cả loạt. Ba lý do bỏ qua được nói tách bạch: chưa phát sinh · doanh
  thu 0 (mua rồi trả hết) · doanh thu âm (trả hàng của đơn hôm trước).
  Và **bảng chưa kiểm chứng được thì KHÔNG kết luận khách nào cả** — nếu không,
  bảng tải hỏng sẽ thành "hôm nay cả lịch đều im".

- **Độ lệch tối đa tự cài** (mặc định vẫn 200.000) và **hẹn giờ tự chạy** — cài
  ngay trên trang báo cáo, qua nút ⚙ ở tiêu đề cột "Tạo HĐĐT". Bảng cài đặt do
  extension vẽ ra, **không sửa một dòng nào trong project Sell**.
- **Hẹn giờ là con đường duy nhất máy phát hành khi không có ai ngồi trước máy**,
  nên nó có bốn cửa chặn riêng: công tắc "Tự bấm Thanh toán" phải BẬT, không được
  có lệnh treo, không được đang chạy dở, và đọc cài đặt hỏng là bỏ qua lần hẹn.
  Tới giờ, máy **đọc lại số từ bảng** chứ không dùng số đã chốt lúc đặt hẹn.
  Máy tính tắt hoặc Chrome đóng thì không có gì chạy — ở đây không có máy chủ.

- **Giỏ trống thì Tendoo KHÔNG vẽ chân giỏ** — không có chữ "Tổng thanh toán",
  cũng không có nút "Thanh toán (F1)"; bỏ một món vào thì cả hai mới hiện (đo
  trang thật 2026-08-12). Đọc tổng lúc giỏ trống mà ra null là ĐÚNG SỰ THẬT chứ
  không phải trang hỏng — giỏ trống thì tổng bằng 0. Trang POS giả trước đây
  luôn vẽ "Tổng thanh toán: 0" nên test xanh trong khi ngoài đời máy dừng cả loạt.

- **Món vào giỏ được xác minh bằng TỔNG của Tendoo, không bằng tên món.** Tên
  lẫn lộn được (bảng gợi ý đang mở cũng mang tên đó; hàng "… size L" chứa nguyên
  tên hàng "…"), tổng thì không. Có test cho cả ca tổng cập nhật TRỄ hơn dòng giỏ
  (máy phải chờ) lẫn ca tên món nằm trong tên món khác (máy không được nhận nhầm).

- **Đối chứng bằng vét cạn** — thử hết mọi tổ hợp trên kho nhỏ rồi so với đáp án
  thuật toán, 300 ca ngẫu nhiên. Chính bộ này bắt được lỗi *lần ngược đường đi
  dùng trùng gói hàng*, khiến kết quả đề nghị lấy nhiều hơn tồn kho.
- **Quét rộng 400 số tiền ngẫu nhiên** kiểm 3 bất biến: tổng khớp các dòng đã
  chọn · không lệch quá 200.000 · không vượt tồn kho.
- **Sell vẽ lại bảng** (lọc/sắp xếp/đổi trang ghi đè sạch `tbody`) → cột phải tự
  chèn lại và không được nhân đôi.
- **Mọi dòng đủ số cột** — kể cả dòng "Đang tải...", "Không có dữ liệu", dòng
  TỔNG CỘNG, và cả khi vai trò là nhân viên bán hàng (bảng ẩn bớt 3 cột).
- **Đếm số lần bấm Thanh toán** qua mọi ca thử: phải đúng bằng số hóa đơn đáng
  ra phải ra, không hơn một cái nào.
- **Ranh giới dữ liệu**: kiểm bằng mã nguồn rằng tiến trình nền không gửi mật
  khẩu / tên đăng nhập / mã cửa hàng sang trang Sell, và khung khai báo chỉ báo
  ngược lại đúng một nhãn "đã đổi".

> `test/trangGiaLap.js` là **bản sao** cấu trúc bảng của Sell. Nếu Sell sửa trang
> báo cáo thì phải đối chiếu lại file này, nếu không test vẫn xanh trong khi
> thực tế đã hỏng.

## Còn lại

| GĐ | Việc | Trạng thái |
|---|---|---|
| 1 | Thuật toán ghép tiền | ✔ xong |
| 2 | Cột trong Sell | ✔ xong |
| 3 | Khai báo tài khoản (có khóa mở) + chốt chặn nhầm tài khoản | ✔ xong |
| 4 | Đọc sản phẩm thật qua API, bỏ hàng vào giỏ | ✔ xong |
| 5 | Công tắc tự bấm Thanh toán (hai lớp, mặc định tắt) | ✔ xong |
| 6 | Cầu nối Sell → Tendoo, chạy hàng loạt | ✔ xong |
| 7 | Tự đổi tài khoản giữa các khách, không cần đăng xuất | ✔ xong |
| 8 | Tự mở tab POS rồi tự đóng — bấm một lần bên Sell là xong | ✔ xong |
| 9 | Khai báo làm ngay trong trang Sell | ✔ xong |
| 10 | Phát hành hóa đơn hai bước (Thanh toán → Xác nhận) | ✔ xong |
| 11 | Đổi tài khoản liên tục: tải lại trang sau khi đăng nhập | ✔ xong |
| 12 | Tự dọn giỏ máy để lại; nhận diện bảng "Chưa thiết lập quản lý thuế" | ✔ xong |
| 13 | **Bỏ hẳn khóa mở** — xem cảnh báo bên dưới | ✔ xong |

## ⚠️ Mật khẩu đi đường nào — đọc kỹ

Bản 2.0 **bỏ hẳn khóa mở** theo yêu cầu của chủ dự án (2026-08-12). Chìa AES do
máy tự sinh và nằm **ngay trong kho, trên ổ cứng**.

**Nói cho đúng: đây là CHE MẮT, không phải bảo vệ.** Ai đọc được kho thì cũng
đọc được chìa nằm cạnh nó. Lớp AES chỉ ngăn mật khẩu hiện ra dạng chữ thường khi
lỡ chụp màn hình hay xem bộ nhớ extension.

| Nơi | Dạng |
|---|---|
| `chrome.storage.local` (ổ cứng) | bản mã AES-GCM, **chìa nằm cạnh** |
| Trang Sell / máy chủ Sell / cơ sở dữ liệu / GitHub | **không bao giờ** |
| Tệp sao lưu **có** mật khẩu | bản mã PBKDF2 600.000 vòng + AES-GCM |
| Tệp sao lưu **bỏ trống** mật khẩu | đọc được bằng tay không |

**Hệ quả:** an toàn của mọi tài khoản khách hàng nay phụ thuộc vào việc **cái máy
này** có an toàn hay không. Ai mở được hồ sơ Chrome trên máy — người mượn máy,
phần mềm chạy dưới tài khoản Windows, mã độc — đều đọc được mật khẩu Tendoo của
toàn bộ khách hàng.

Đổi lại: khai báo một lần là xong, không phải gõ lại sau mỗi lần mở Chrome hay
tải lại extension.

Ô nhập mật khẩu tuy hiện trong trang Sell nhưng nằm trong **iframe của
extension**, khác nguồn gốc — script của trang Sell không đọc được giá trị,
cũng không nghe được phím gõ.
