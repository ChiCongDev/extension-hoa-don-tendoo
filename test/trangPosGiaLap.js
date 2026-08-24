'use strict';

// ============================================================================
//  BẢN SAO TRANG POS CỦA TENDOO — dùng cho test.
//
//  Cấu trúc HTML chép theo bản chụp THẬT ngày 2026-08-10:
//    - thẻ hàng: div.border-2.shadow-md.rounded-md, bên trong có
//        · chữ viết tắt trong <span>              ("ÁKDDDN")
//        · giá ở góc phải trên                     ("990.000")
//        · tên + "(Số lượng tồn: 22)" ở dải dưới
//      -> THẺ KHÔNG MANG MÃ SẢN PHẨM. Đó là lý do phải tìm theo tên + giá.
//    - HAI ô tìm kiếm: ô sản phẩm (placeholder trống) và ô khách hàng
//      (placeholder "Tìm tên, SĐT, mã số thuế (ALT+C / Option+C)")
//    - giỏ: mỗi dòng có ô số lượng <input> ở giữa hai nút − +
//    - "Tổng thanh toán:" và hai nút "Lưu đơn (F2)" / "Thanh toán (F1)"
//
//  ⚠️ SỬA LẠI 2026-08-12 theo bản chụp THẬT lần ba — BƯỚC THANH TOÁN:
//    - Bấm "Thanh toán (F1)" KHÔNG phát hành gì. Nó mở bảng
//      `div.ant-modal-wrap > div.ant-modal` có `.ant-modal-title` ghi
//      "Xác nhận thanh toán - Mang về", bên trong có dòng "Tổng cộng … đ",
//      ô "Khách đã đưa", công tắc `button[role=switch].ant-switch` cho "Ghi nợ",
//      và chân bảng `.ant-modal-footer` với hai nút [Quay lại] [Xác nhận].
//    - Bấm "Xác nhận" MỚI phát hành, giỏ mới trống.
//    - Đóng bảng thì Ant KHÔNG xóa khỏi DOM, chỉ đặt display:none lên
//      `.ant-modal-wrap` — nên nhận diện "bảng đang mở" phải xét display.
//    - Trang thật LUÔN có 2 bảng quảng cáo đè lên ngay khi vào, kèm nút
//      "Trải nghiệm POS V2 ngay" — dựng luôn để không bao giờ bấm nhầm.
//    Trước đây cú bấm ở trang giả này chỉ CỘNG MỘT BIẾN ĐẾM, nên toàn bộ test
//    xanh trong khi thực tế máy đứng chết ở bảng xác nhận.
//
//  ⚠️ SỬA LẠI 2026-08-11 theo bản chụp THẬT lần hai:
//    - Gõ tìm kiếm KHÔNG lọc lưới. Nó mở BẢNG GỢI Ý
//      `div.ant-select-dropdown > … > div.ant-select-item-option`,
//      chữ trong dòng: "Tên chiếc SP0026 100.000 Tồn: 19"  (KHÁC lưới, lưới ghi
//      "(Số lượng tồn: 19)").
//    - Mỗi dòng giỏ có 4 nút ĐỀU KHÔNG CHỮ; nút xóa phân biệt bằng lớp
//      `ant-btn-dangerous`.
//  Trước đây trang giả này tự bịa hai phần đó (tìm kiếm lọc lưới, nút xóa là
//  nút cuối) -> test xanh trong khi thực tế hỏng. Đừng lặp lại: phần nào chưa
//  chụp được thì ĐỪNG dựng, thà thiếu test còn hơn test sai sự thật.
//
//  Nếu Tendoo đổi giao diện, file này sẽ vẫn xanh trong khi thực tế đã hỏng —
//  nên mỗi lần Tendoo đổi thì phải dò lại và sửa file này cho khớp.
// ============================================================================

const { JSDOM } = require(process.env.HDT_JSDOM || 'jsdom');

const HANG_MAU = [
    { ma: 'ÁKDDDN', ten: 'Áo khoác dạ dáng dài nữ', gia: 990000, ton: 22 },
    { ma: 'GBNCNDM', ten: 'Giày Boots nữ cổ ngắn da mềm', gia: 1400000, ton: 6 },
    { ma: 'ÁGPTĐN', ten: 'Áo Gilet phao Thu Đông nam', gia: 850000, ton: 4 },
    { ma: 'ÁGPTĐN', ten: 'Áo Gilet phao Thu Đông nữ', gia: 890000, ton: 13 },
    { ma: 'QJTTN', ten: 'Quần Jogger thể thao nữ', gia: 490000, ton: 1 },
    { ma: 'GBNCCDL', ten: 'Giày Boots nam cổ cao da lộn', gia: 1450000, ton: 19 },
];

const tien = (n) => new Intl.NumberFormat('vi-VN').format(n);

// ⚠️ HAI NÚT − VÀ + CỦA DÒNG GIỎ KHÔNG CÓ CHỮ, KHÔNG CÓ LỚP RIÊNG.
// Chỉ khác nhau ở HÌNH VẼ bên trong và VỊ TRÍ so với ô nhập ([−] [ô] [+]).
// Chép nguyên đường vẽ từ test/mau/gioHangThat.html (bản chụp thật 2026-08-12).
//
// Trước đây trang giả này gắn sẵn lớp `cong`/`tru` cho tiện -> máy tìm nút bằng
// lớp đó và test xanh, trong khi trang thật không hề có. Đây là lần thứ SÁU
// trang giả bịa cho tiện. Đừng lặp lại.
const DUONG_TRU = 'M19 13H5v-2h14v2z';
const DUONG_CONG = 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z';

function theHang(sp, chiSo) {
    return `
    <div class="border-2 shadow-md rounded-md p-2 h-[180px] w-full overflow-hidden relative cursor-pointer group"
         data-thu-tu="${chiSo}">
      <div class="!absolute top-0 left-0 w-full h-full">
        <div class="bg-primary-50 w-full h-full flex justify-center items-center">
          <p class="text-xl font-semibold text-center"><span>${sp.ma}</span></p>
        </div>
      </div>
      <div class="absolute top-0 right-0 z-10">
        <div class="inline-flex items-center p-1 bg-black/50 rounded-bl-md">
          <span class="text-xs font-normal text-white">${tien(sp.gia)}</span>
        </div>
      </div>
      <div class="absolute bottom-0 left-0 w-full z-10">
        <div class="w-full p-1 bg-black/50 flex flex-col items-center min-h-12">
          <span class="text-sm text-white text-center font-bold mb-1">${sp.ten}</span>
          <span class="text-xs text-white text-center font-normal">(Số lượng tồn: ${sp.ton})</span>
        </div>
      </div>
    </div>`;
}

/**
 * @param {object} [tuyChon]
 *   - tongBangXn         ép tổng TRONG BẢNG lệch với giỏ (thử chốt chặn số 7)
 *   - bangXnMoi         BẢNG XÁC NHẬN KIỂU 23/08/2026 (ảnh chụp thật):
 *                          · nhãn ô nhập đổi "Khách đã đưa" -> "Khách thanh toán"
 *                          · "Ghi nợ" từ CÔNG TẮC GẠT thành Ô TICK VUÔNG
 *                          · chân bảng KHÔNG còn nút "Quay lại", chỉ có "Hủy"
 *                        Một ô nhập không điền được đã kéo theo cả ba tầng hỏng
 *                        của lượt 10:45 ngày 23/08/2026.
 *   - ghiNoBat           bảng mở ra với công tắc Ghi nợ đang BẬT
 *   - khongMoBang        bấm Thanh toán mà bảng không hiện (giao diện đổi)
 *   - giuGioSauXacNhan   bấm Xác nhận xong giỏ vẫn còn hàng (ca KHÔNG RÕ)
 *   - veLaiBangXn        SAU khi điền "Khách đã đưa", React THÁO bảng xác nhận cũ ra
 *                        và dựng lại một bảng mới y hệt. Nút của bảng cũ vẫn tìm
 *                        được nhưng KHÔNG còn nằm trong trang — bấm vào là bấm vào
 *                        khoảng không. Đây là nghi phạm số một của ca khách "hoa"
 *                        ngày 20/08/2026.
 *   - nutTtKhoa          nút Thanh toán bị KHÓA và không bao giờ mở.
 *   - nutTtThayMoiSauMs  nút Thanh toán khóa, và sau N mili-giây React THÁO nó ra
 *                        dựng một nút MỚI đã mở khóa. Tham chiếu cũ khóa vĩnh viễn —
 *                        ai giữ nó thì chờ mãi cũng vô ích.
 *   - nutTtMoSauMs      nút Thanh toán khóa lúc đầu rồi MỞ sau N mili-giây — đúng
 *                        cảnh React vẽ lại chân trang chậm hơn giỏ một nhịp, thứ
 *                        đã làm hai khách mất trắng ngày 21/08/2026.
 *   - giaoDienMoi       GIAO DIỆN MỚI 22/08/2026: dòng giỏ có HAI cột tiền — "Giá
 *                        bán" và "Thành tiền" — còn chân giỏ MẤT SẠCH NHÃN, chỉ còn
 *                        biểu tượng giỏ và con số. Không còn chữ "Tổng thanh toán"
 *                        nào để dò. Dùng KÈM khongCoDongTong để dựng đủ cảnh.
 *   - nhanTongBang      ĐỔI CHỮ của dòng tổng trong BẢNG XÁC NHẬN. Ngày 22/08/2026
 *                        Tendoo bỏ chữ "Tổng cộng" và máy dừng ở chốt cuối cùng
 *                        trước khi ra tiền thật. Đặt 'Phải thu' để dựng lại giao
 *                        diện mới, hay một chữ lạ hoắc để xem máy có chịu dừng.
 *   - thanhTienSai      thành tiền KHÔNG bằng giá × số lượng. Máy phải DỪNG chứ
 *                        không đoán — đây là chốt chặn của phép cộng theo dòng.
 *   - coNutMoCa          trang có nút "Mở ca" (ca bán hàng đang ĐÓNG). Tendoo khóa
 *                        nút Thanh toán tới khi ca được mở; chờ bao lâu cũng vô ích.
 *   - thaoBangXn         React THÁO HẲN bảng xác nhận khỏi trang sau khi điền "Khách
 *                        đã đưa", không dựng lại. Tham chiếu cũ vẫn tìm được nút,
 *                        nhưng nút ấy KHÔNG còn nằm trong trang.
 *   - chanCuBamXn        có kẻ CHẶN cú bấm giữa đường (mặt nạ modal gọi
 *                        stopPropagation) — nút vẫn trong trang, vẫn nhận cú bấm,
 *                        nhưng sự kiện KHÔNG nổi tới tài liệu nên React không thấy.
 *   - xacNhanQuayMs      bấm Xác nhận xong nút QUAY VÒNG CHỜ N mili-giây rồi mới
 *                        phát hành — dựng lại cảnh hệ thống thuế trả lời chậm.
 *   - xacNhanNuot        Tendoo NHẬN cú bấm nhưng không làm gì (từ chối im lặng).
 *   - xacNhanBaoLoi      bảng hiện một dòng lỗi đỏ với nội dung này.
 *   - giuBangSauXacNhan  bấm Xác nhận xong bảng xác nhận VẪN đứng đó — cảnh này
 *                        khác hẳn: nó nói cú bấm chưa được Tendoo nhận
 *   - bangThue           tài khoản chưa thiết lập thuế: bấm Thanh toán thì hiện bảng
 *                        "Chưa thiết lập quản lý thuế" THAY CHO bảng xác nhận
 *   - thueLuonChan       bỏ qua rồi bảng thuế VẪN chặn — cảnh xấu nhất, để kiểm
 *                        máy không rơi vào vòng lặp
 *   - themGapDoi         một cú bấm thẻ hàng lại thêm HAI cái vào giỏ (tay nghe bị
 *                        gắn hai lần) — để kiểm máy bắt được hóa đơn sai tiền
 *   - oTimNuotChu        ô tìm kiếm NUỐT chữ gõ vào (React ghi đè lại rỗng) — đúng
 *                        cảnh mà dienChacChan() sinh ra để phát hiện.
 *   - goiYSot            BẢNG GỢI Ý LUÔN hiện ĐÚNG MỘT DÒNG của mặt hàng có tên
 *                        này, bất kể gõ gì — dựng lại "danh sách còn sót của lần
 *                        tìm TRƯỚC". Đây là cảnh đã làm khách "ti?n" hỏng ngày
 *                        20/08/2026: máy đọc danh sách sót rồi đổ lỗi cho mặt
 *                        hàng đang nằm ngay trước mặt.
 *   - goiYTreMs          bảng gợi ý chỉ vẽ sau N mili-giây (Tendoo hỏi máy chủ).
 *   - oTimXoaSauMs       ô tìm kiếm bị xóa trắng sau N mili-giây kể từ lúc gõ —
 *                        React dọn ô trong khi danh sách vẫn còn trên màn hình.
 *                        Đặt nhỏ hơn goiYTreMs để dựng cảnh "danh sách hiện ra
 *                        khi ô đã rỗng".
 *   - boQuaNLanTim       N lần tìm ĐẦU TIÊN không trả kết quả gì (Tendoo hỏi máy chủ
 *                        hụt). Dùng để kiểm máy có GÕ LẠI hay không.
 *   - donViLa            đơn vị tính KHÔNG nằm trong danh sách sáu từ mà phép cắt
 *                        tên biết gỡ (VD "Cặp"). Lúc ấy tên máy tự cắt ra bị thừa
 *                        chữ đơn vị -> so tên TRƯỢT, và chỉ mã hàng cứu được.
 *   - nuotCuBamDau       N cú bấm thẻ hàng ĐẦU TIÊN bị NUỐT, không thêm gì vào giỏ.
 *                        Đây chính là cảnh đã xảy ra thật ngày 2026-08-12: máy chọn 2
 *                        món, chỉ 1 món vào giỏ, và bản cũ KHÔNG HỀ BIẾT — đi tiếp im
 *                        lặng tới khi so tổng ở cuối mới hỏng.
 *   - tongTreMs          DÒNG GIỎ hiện ngay nhưng "Tổng thanh toán" mãi N mili-giây
 *                        sau mới đổi. Máy phải BIẾT CHỜ tổng, không được kết luận
 *                        "món không vào giỏ" chỉ vì đọc tổng một phát quá sớm.
 *   - chanTangTai        giỏ KHÔNG cho tăng quá N cái (Tendoo chặn vì hết tồn thật,
 *                        trong khi lưới vẫn ghi tồn cao hơn). Máy phải dừng ngay và
 *                        nói đúng số THẬT nhận được, suy từ TỔNG.
 *   - oSoLuongNhanGo     ô số lượng nhận GÕ THẲNG. Trang THẬT KHÔNG như vậy (đo
 *                        2026-08-13) — chỉ bật để dựng lại cảnh giả định.
 *   - thueKhongDong      bấm "Bỏ qua" mà bảng thuế KHÔNG đóng — khác hẳn với
 *                        thueLuonChan (đóng rồi hiện lại). Hai bệnh này phải ra
 *                        hai thông báo khác nhau: một cái là việc của người dùng
 *                        (tài khoản chưa thiết lập thuế), một cái là lỗi extension.
 *   - bangNangCap        bấm Thanh toán thì hiện bảng "Thông báo nâng cấp giao diện
 *                        bán hàng" THAY CHO bảng xác nhận (gặp thật 19/08/2026)
 *   - nangCapLuonChan    đóng rồi bảng vẫn hiện lại — kiểm máy KHÔNG lặp vô tận
 *   - nangCapDongTreMs   bấm × rồi bảng còn nấn ná N mili-giây mới ẩn hẳn, đúng
 *                        như hiệu ứng đóng của Ant Design. Trong lúc ấy MẶT NẠ
 *                        bảng vẫn nuốt mọi cú bấm — nên máy bắt buộc phải CHỜ
 *                        bảng đóng xong rồi mới bấm lại Thanh toán.
 *   - nangCapKhongNutDong  bảng KHÔNG có dấu × và không có nút nào an toàn: chỉ
 *                        còn mỗi nút dẫn sang giao diện mới. Máy phải DỪNG, và
 *                        tuyệt đối không được bấm nút ấy.
 *   - nangCapMatNutThanhToan  đóng bảng xong thì nút Thanh toán biến mất HẲN
 *   - nangCapVangNutMs   đóng bảng xong nút Thanh toán bị KHÓA N mili-giây rồi
 *                        mở lại — đúng cảnh React vẽ lại vùng bán hàng. Đây là
 *                        thứ đã giết khách Trang Bé TB lúc 15:11 ngày 19/08/2026:
 *                        máy nhìn nút ĐÚNG MỘT LẦN, trúng ngay khoảnh khắc khoá,
 *                        rồi kết luận "trang đã nhảy sang giao diện mới" và dừng.
 *   - khongCoDongTong    chân giỏ có, NHƯNG thiếu hẳn dòng "Tổng thanh toán"
 *                        (giao diện Tendoo đổi chữ) — máy phải báo lỗi, không đoán số.
 *   - kieuNutXoa        HÌNH DẠNG nút xóa dòng giỏ. Ảnh chụp trang thật 22/08/2026
 *                        cho thấy thùng rác màu XÁM, tức nhiều khả năng KHÔNG mang
 *                        lớp "dangerous" nữa. Ba kiểu:
 *                          'dangerous'  — như cũ, có lớp nguy hiểm (mặc định)
 *                          'bieuTuong'  — không lớp, không nhãn, CHỈ có anticon-delete
 *                          'voDanh'     — không lớp, không nhãn, không cả biểu tượng:
 *                                         máy PHẢI chịu thua và KỂ RA mình thấy gì
 *                          'hinhThat'   — ĐÚNG DOM THẬT ngày 23/08/2026, chép từ lời
 *                                         khai của xoaSachGio: nút sửa giá «990.000»,
 *                                         nút nhân bản và thùng rác đều là <svg><path>
 *                                         thô — không lớp "dangerous", không title,
 *                                         không tên biểu tượng của thư viện nào.
 *                          'tooltip'    — như thật 22/08: chữ "Xóa sản phẩm" chỉ hiện
 *                                         trong Ant Tooltip ở GÓC KHÁC của trang, nút
 *                                         thì trơ, chỉ có anticon-delete
 *   - hoaDonDienTu      CÔNG TẮC "Hóa đơn điện tử" ở chân giỏ (giao diện 22/08/2026).
 *                        Ảnh chụp trang thật cho thấy nó QUYẾT ĐỊNH nút đỏ làm gì:
 *                          BẬT -> nút ghi "Thanh toán & Xuất hóa đơn (F1)"
 *                          TẮT -> nút ghi "Thanh toán (F1)", và bấm thì đơn VẪN
 *                                 chốt nhưng KHÔNG xuất hóa đơn nào.
 *                        Nhận: true (bật) · false (tắt) · 'khong' (trang không có
 *                        công tắc — giao diện cũ). Mặc định: giao diện mới thì có
 *                        và BẬT, giao diện cũ thì không có.
 *   - chanGioLechMs     CHÂN GIỎ VẼ CHẬM HƠN BẢNG DÒNG một nhịp — cảnh thật ngày
 *                        24/08/2026. Trong `chanGioLechMs` mili-giây đầu, chân giỏ
 *                        còn giữ con số CŨ; sau đó mới đuổi kịp. Ba nguồn đọc bất
 *                        đồng trong khe ấy nên docTongGio() trả null — và chốt nào
 *                        nhìn đúng một cái rồi kết luận sẽ hỏng oan cả khách.
 *   - chanGioLech       ÉP con số ở chân giỏ lệch khỏi tổng các dòng. Ảnh trang thật
 *                        22/08/2026: chân giỏ ghi 2.300.000 trong khi giỏ chỉ có một
 *                        dòng 1.450.000. Một trong hai sai — máy phải DỪNG.
 */
function taoTrangPos({ hang = HANG_MAU, gioBanDau = [], tongBangXn = null,
                       ghiNoBat = false, khongMoBang = false, bangXnMoi = false,
                       giuGioSauXacNhan = false, giuBangSauXacNhan = false, bangThue = false,
                       khongDienSanDaDua = false, doiTongKhiDien = false,
                       thueLuonChan = false, thueKhongDong = false, nuotCuBamDau = 0,
                       oTimNuotChu = false, goiYSot = '', oTimXoaSauMs = 0,
                       goiYTreMs = 0, donViLa = '', boQuaNLanTim = 0,
                       veLaiBangXn = false, thaoBangXn = false, chanCuBamXn = false,
                       nutTtKhoa = false, nutTtMoSauMs = 0, coNutMoCa = false,
                       giaoDienMoi = false, thanhTienSai = false, nhanTongBang = null,
                       nutTtThayMoiSauMs = 0,
                       xacNhanQuayMs = 0, xacNhanNuot = false,
                       xacNhanBaoLoi = '',
                       bangNangCap = false, nangCapLuonChan = false, nangCapDongTreMs = 0,
                       nangCapKhongNutDong = false, nangCapMatNutThanhToan = false,
                       nangCapVangNutMs = 0,
                       themGapDoi = false, tongTreMs = 0,
                       khongCoDongTong = false, oSoLuongNhanGo = false,
                       kieuNutXoa = 'dangerous', chanGioLech = null, chanGioLechMs = 0,
                       hoaDonDienTu,
                       chanTangTai = 0 } = {}) {
    // 'khong' | true | false — xem chú thích `hoaDonDienTu`.
    const hddt = hoaDonDienTu === undefined ? (giaoDienMoi ? true : 'khong') : hoaDonDienTu;
    const hddtBat = hddt === true;
    const dom = new JSDOM(`<!doctype html><body>
      <div class="pos">
        <div class="thanh-tren">
          <input id="oTimSanPham" type="search" class="ant-input" placeholder="">
          <div class="ant-select-dropdown" id="bangGoiY" style="display:none"></div>
        </div>
        <div class="infinite-scroll-component">
          <div class="grid md:grid-cols-3 lg:grid-cols-4" id="luoiHang">
            ${hang.map(theHang).join('')}
          </div>
        </div>
        <div class="p-2 border border-neutral-200" id="khoiPhai">
          <input id="oTimKhachHang" type="search" class="ant-input"
                 placeholder="Tìm tên, SĐT, mã số thuế (ALT+C / Option+C)">
          <div id="cacDongGio"></div>
          <div class="border-t pt-2 border-neutral-200" id="chanGio">
            ${hddt === 'khong' ? '' : `<div id="dongHddt" class="flex items-center gap-2">
              <button type="button" role="switch" aria-checked="${hddtBat}"
                class="ant-switch${hddtBat ? ' ant-switch-checked' : ''}"><span
                class="ant-switch-handle"></span></button>
              <span>Hóa đơn điện tử</span>
              ${hddtBat ? '<span>Tự động phát hành sau 22:00</span><a>Xem trước</a>' : ''}
            </div>`}
            <div id="dongTongSp">Tổng <span id="soMon">0</span> sản phẩm : <span id="tongSp">0</span> đ</div>
            <div id="dongTongTt">Tổng thanh toán: <span id="tongTt">0</span> đ</div>
            <div class="flex gap-2 flex-wrap">
              <button id="nutLuuDon" class="ant-btn">Lưu đơn (F2)</button>
              <button id="nutThanhToan" class="ant-btn">${hddtBat
                ? 'Thanh toán &amp; Xuất hóa đơn (F1)' : 'Thanh toán (F1)'}</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Hai bảng quảng cáo LUÔN đè lên trang thật ngay khi vào. Dựng đúng để
           không bao giờ có chuyện tìm nút mà vớ nhầm sang đây. -->
      <div class="ant-modal-wrap ant-modal-centered" id="bangThongBao">
        <div role="dialog" aria-modal="true" class="ant-modal"><div class="ant-modal-content">
          <div class="ant-modal-body">
            <span class="ant-typography">Thông báo thay đổi cách ghi tên người mua trên hóa đơn điện tử</span>
            <button type="button" class="ant-btn ant-btn-primary"><span>Đóng</span></button>
          </div>
        </div></div>
      </div>
      <div class="ant-modal-wrap ant-modal-centered" id="bangPosV2">
        <div role="dialog" aria-modal="true" class="ant-modal"><div class="ant-modal-content">
          <div class="ant-modal-body">
            <span>Tính năng mới BÁN NHANH HƠN VỚI POS BÁN HÀNG V2</span>
            <span>Thanh toán tiện lợi</span>
            <button class="_laterButton_196hw_462">Để sau</button>
            <button class="_experienceButton_196hw_463">Trải nghiệm POS V2 ngay</button>
          </div>
        </div></div>
      </div>

      <!-- Bảng chặn đường thật: tài khoản chưa thiết lập quản lý thuế thì
           bấm "Thanh toán (F1)" sẽ hiện cái này THAY CHO bảng xác nhận.
           Chụp từ tài khoản thật ngày 2026-08-12. -->
      <div class="ant-modal-wrap ant-modal-centered" id="bangThue" style="display: none">
        <div role="dialog" aria-modal="true" class="ant-modal"><div class="ant-modal-content">
          <div class="ant-modal-body">
            <div class="ant-modal-title">Chưa thiết lập quản lý thuế</div>
            <p>Khi phát hành hóa đơn điện tử, bạn cần thiết lập quản lý thuế.
               Nếu <b>không thiết lập</b>, dữ liệu trên <b>Tờ khai thuế</b> và
               <b>Sổ kế toán</b> sẽ <b>không chính xác</b></p>
            <label><input type="checkbox"><span>Không hiển thị thông báo này</span></label>
            <button type="button" class="ant-btn" id="thueBoQua"><span>Bỏ qua</span></button>
            <button type="button" class="ant-btn ant-btn-primary" id="thueThietLap">
              <span>Thiết lập quản lý thuế</span></button>
          </div>
        </div></div>
      </div>

      <!-- Bảng "Thông báo nâng cấp giao diện bán hàng". Nguyên văn lấy từ log
           lượt chạy 14:48 ngày 19/08/2026 (khách Trang Bé TB mất trắng tờ hóa
           đơn 9.980.000đ vì bảng này).

           ⚠️ MÌNH KHÔNG BIẾT bảng thật có những nút gì — log cũ chỉ chép 160 chữ
           đầu, không chép tên nút. Nên ở đây dựng cảnh XẤU NHẤT hợp lý: có dấu ×
           để đóng, và một nút primary dẫn sang giao diện mới. Điều bài test đi
           chứng minh KHÔNG phải "máy bấm đúng nút Để sau" (nút ấy là mình bịa),
           mà là "máy KHÔNG BAO GIỜ bấm nút dẫn sang giao diện mới". -->
      <div class="ant-modal-wrap ant-modal-centered" id="bangNangCap" style="display: none">
        <div role="dialog" aria-modal="true" class="ant-modal"><div class="ant-modal-content">
          <button type="button" class="ant-modal-close" aria-label="Close" id="nangCapDong">
            <span class="ant-modal-close-x">×</span></button>
          <div class="ant-modal-body">
            <div class="ant-modal-title">Thông báo nâng cấp giao diện bán hàng</div>
            <p>Từ ngày 18/08/2026, hệ thống sẽ chuyển sang giao diện bán hàng mới,
               giúp thao tác thuận tiện và nhanh hơn. Nếu cần hỗ trợ vui lòng liên
               hệ tổng đài.</p>
            <button type="button" class="ant-btn ant-btn-primary" id="nangCapDoiNgay">
              <span>Trải nghiệm ngay</span></button>
          </div>
        </div></div>
      </div>

      <!-- Bảng xác nhận thanh toán: dựng theo HTML thật, mặc định ĐÓNG. -->
      <div tabindex="-1" class="ant-modal-wrap ant-modal-centered" id="bangXacNhan" style="display: none">
        <div role="dialog" aria-modal="true" class="ant-modal" style="width: 480px">
          <div class="ant-modal-content">
            <div class="ant-modal-header">
              <div class="ant-modal-title" id="tieuDeXacNhan">Xác nhận thanh toán - Mang về</div>
            </div>
            <div class="ant-modal-body">
              <div class="flex justify-between items-center">
                <span class="text-sm text-neutral-700"><span id="xnSoMon">0</span> sản phẩm</span>
                <span class="text-base font-semibold text-neutral-900" id="xnTienHang">0</span>
              </div>
              <div class="flex justify-between items-center mt-4">
                <span class="text-sm text-neutral-700">Điểm tích lũy</span>
                <span class="text-base font-semibold text-neutral-900">0</span>
              </div>
              <div class="flex justify-between items-center py-2">
                <span class="text-base font-bold">Tổng cộng</span>
                <div class="flex items-center gap-x-2">
                  <span class="text-sm line-through"></span>
                  <span class="text-lg font-bold text-[#cc4d23]" id="xnTongCong">0 đ</span>
                </div>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-base font-medium">${bangXnMoi
                  ? 'Khách thanh toán' : 'Khách đã đưa'}</span>
                <input class="ant-input" type="text" id="xnKhachDua" value="0">
              </div>
              <div class="flex justify-between items-center">
                ${bangXnMoi ? '' : '<span class="text-base font-medium">Ghi nợ</span>'}
                ${bangXnMoi
                  ? '<label class="ant-checkbox-wrapper"><span class="ant-checkbox">'
                    + '<input type="checkbox" class="ant-checkbox-input" id="xnGhiNo">'
                    + '</span><span>Ghi nợ</span></label>'
                  : '<button type="button" role="switch" aria-checked="false"'
                    + ' class="ant-switch" id="xnGhiNo"><div class="ant-switch-handle"></div></button>'}
                <span class="text-base font-medium text-green-500">Đủ tiền</span>
              </div>
              <label class="ant-radio-wrapper ant-radio-wrapper-checked">
                <span class="ant-radio ant-radio-checked"><input class="ant-radio-input" type="radio"></span>
                <span>Tiền mặt</span>
              </label>
              <div class="flex gap-2">
                <button type="button" class="ant-btn"><span>500.000đ</span></button>
                <button type="button" class="ant-btn"><span>1.000.000đ</span></button>
              </div>
            </div>
            <div class="ant-modal-footer" style="display: flex; justify-content: flex-end;">
              <div class="flex gap-2 items-center">
                <button type="button" class="ant-btn ant-btn-default" id="xnQuayLai"><span>${bangXnMoi
                  ? 'Hủy' : 'Quay lại'}</span></button>
                <button type="button" class="ant-btn ant-btn-primary" id="xnXacNhan"><span>Xác nhận</span></button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </body>`, {
        // Địa chỉ THẬT của trang POS. Cần cho phép kiểm "máy có bị đẩy sang
        // /sales/pos-v2 không" — mặc định about:blank thì đường dẫn vô nghĩa.
        url: 'https://seller-v3.tendoo.vn/sales/pos',
    });

    const cuaSo = dom.window;
    const td = cuaSo.document;
    const gio = [];                       // { sp, soLuong }
    // Giữ sẵn chân giỏ để gỡ ra / gắn lại theo giỏ có hàng hay không (xem veGio).
    const chanGio = td.getElementById('chanGio');
    let conNuot = nuotCuBamDau;
    let soLanBamCong = 0;
    const daTim = [];   // mọi chữ đã gõ vào ô tìm sản phẩm
    const daBam = { thanhToan: 0, luuDon: 0, xacNhan: 0, quayLai: 0,
                    thueBoQua: 0, thueThietLap: 0,
                    nangCapDong: 0, nangCapDoiNgay: 0 };

    const timSp = (ten, gia) => hang.find(h => h.ten === ten && (gia == null || h.gia === gia));

    /**
     * NÚT XÓA của một dòng giỏ, ba kiểu — xem chú thích `kieuNutXoa`.
     *
     * ⚠️ Lớp "xoa" giữ nguyên ở CẢ BA kiểu: trang giả cần chỗ bám để tự bấm,
     * còn mã thật KHÔNG BAO GIỜ được dùng lớp ấy để nhận nút — Tendoo đâu có
     * đặt tên lớp bằng tiếng Việt.
     */
    const nutXoaDong = () => {
        const chung = 'xoa ant-btn ant-btn-text ant-btn-sm ant-btn-icon-only';
        if (kieuNutXoa === 'voDanh') return `<button class="${chung}"></button>`;
        // ⚠️ DOM THẬT 23/08/2026. Ba nút không chữ nằm cạnh nhau, phân biệt được
        // với nhau CHỈ BẰNG HÌNH VẼ. Nút «990.000» là nút SỬA GIÁ — bấm nhầm
        // vào nó ngay trước khi xuất hóa đơn là sai tiền trên tờ hóa đơn thuế.
        // (Nút sửa giá ngoài đời nằm ở cột giá; đặt chung khối ở đây vì bộ dò
        // quét MỌI nút trong dòng, nên vị trí không đổi được kết quả.)
        if (kieuNutXoa === 'hinhThat') {
            const ve = (...d) => '<svg>' + d.map(x => `<path d="${x}"></path>`).join('') + '</svg>';
            const AB = 'ant-btn css-1rtpktv css-var-_r_1_ ant-btn-text ant-btn-color-default';
            return `<button class="${AB}">990.000${ve('M7.97606 1.82159L8.9', 'M5.16602 11.168H9.16')}</button>`
                + `<button class="nhanBan ${AB}">${ve('M6 10C6 8.11438 6 7.11157 6.58579 6.52579',
                    'M11.3339 5.9987C11.3339 4.11308 11.3339 3.17027')}</button>`
                + `<button class="xoa ${AB}">${ve('M13 3.66406L12.5868 10.4451',
                    'M2 3.66536L14 3.66536', 'M6.33398 11L6.33398 7')}</button>`;
        }
        // ⚠️ ẢNH CHỤP TRANG THẬT 22/08/2026: rê chuột lên thùng rác thì hiện chữ
        // "Xóa sản phẩm". Nhưng Ant Design vẽ Tooltip Ở MỘT GÓC KHÁC của trang,
        // KHÔNG đặt title/aria-label lên nút. Nên chữ ấy nhìn thấy được bằng mắt
        // mà mã KHÔNG với tới — chỉ còn tên biểu tượng để bám.
        if (kieuNutXoa === 'tooltip') {
            return `<button class="${chung}"><span role="img" class="anticon anticon-delete">`
                + '<svg viewBox="64 64 896 896" data-icon="delete" fill="currentColor">'
                + '<path d="M292.7 840h438.6l24.2-512h-487z"></path></svg></span></button>'
                + '<div class="ant-tooltip"><div class="ant-tooltip-inner" role="tooltip">'
                + 'Xóa sản phẩm</div></div>';
        }
        if (kieuNutXoa === 'bieuTuong') {
            return `<button class="${chung}"><span role="img" class="anticon anticon-delete">`
                + '<svg viewBox="64 64 896 896" data-icon="delete" fill="currentColor">'
                + '<path d="M292.7 840h438.6l24.2-512h-487z"></path></svg></span></button>';
        }
        return `<button class="${chung} ant-btn-dangerous ant-btn-color-dangerous `
            + 'ant-btn-variant-text"></button>';
    };

    /**
     * DÒNG GIỎ — dựng theo ĐÚNG bản chụp thật (test/mau/gioHangThat.html,
     * chụp 2026-08-12 từ trang POS thật).
     *
     * ⚠️ GIỮ NGUYÊN ĐỘ SÂU. Bản cũ dựng dòng giỏ NÔNG HƠN thật, nên hàm đi
     * ngược lên tìm khối dòng chạy đúng trên trang giả nhưng LỆCH MỘT TẦNG trên
     * trang thật — 657 test xanh trong khi thực tế không dọn nổi giỏ. Đây là lần
     * THỨ BA cùng kiểu sai (ô tìm kiếm, nút Thanh toán, dòng giỏ).
     *
     * Cấu trúc thật, đếm từ ô số lượng đi ngược lên:
     *   7  relative border ... rounded-md p-2   ← DÒNG GIỎ THẬT (mã + tên + giá + nút xóa)
     *   6    flex flex-col gap-2 lg:flex-row    ← chỉ có giá + nút xóa, KHÔNG có tên
     *   5      flex-shrink-0                     ← bản cũ dừng ở đây: chữ RỖNG, không nút xóa
     *   4        flex flex-col items-center gap-1
     *   3          <div class="">
     *   2            flex flex-col w-full !w-[140px]
     *   1              flex justify-between ...   [−] [input] [+]
     */
    function veGio() {
        const boc = td.getElementById('cacDongGio');
        boc.innerHTML = gio.map((d, i) => `
          <div class="relative border border-neutral-200 rounded-md p-2" data-dong="${i}">
            <div class="flex gap-2">
              <div class="flex flex-col flex-1">
                <span class="text-xs">${d.sp.ma}</span>
                <span class="ten text-sm font-semibold">${d.sp.ten}</span>
                <div class="flex items-center">
                  <button class="ghiChu ant-btn ant-btn-text ant-btn-color-default"></button>
                  <span class="text-2sm italic">Nhập ghi chú</span>
                </div>
              </div>
            </div>
            <div class="flex flex-col gap-2 lg:flex-row flex-1">
              <div class="flex-shrink-0">
                <div class="flex flex-col items-center gap-1">
                  <div class="">
                    <div class="flex flex-col w-full !w-[140px]">
                      <div class="flex justify-between items-center w-full rounded border border-solid transition-all border-neutral-200">
                        <button type="button" class="ant-btn ant-btn-text ant-btn-color-default ant-btn-variant-text ant-btn-sm ant-btn-icon-only aspect-square"><span class="ant-btn-icon"><svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 24 24" height="18" width="18"><path fill="none" d="M0 0h24v24H0z"></path><path d="${DUONG_TRU}"></path></svg></span></button>
                        <input placeholder="0" inputmode="decimal" class="ant-input ant-input-sm ant-input-borderless bg-transparent text-center font-bold text-sm text-black w-5/12 !px-0 w-fit"
                               type="text" value="${d.soLuong}">
                        <button type="button" class="ant-btn ant-btn-text ant-btn-color-default ant-btn-variant-text ant-btn-sm ant-btn-icon-only aspect-square"><span class="ant-btn-icon"><svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 24 24" height="18" width="18"><path fill="none" d="M0 0h24v24H0z"></path><path d="${DUONG_CONG}"></path></svg></span></button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-2 flex-1">
                <div class="flex-1 text-right">
                  ${giaoDienMoi ? '<div class="giaBan">' + tien(d.sp.gia) + '</div>' : ''}
                  <div class="tien text-blue-700 font-semibold">${tien(d.sp.gia * d.soLuong + (thanhTienSai ? 7 : 0))}</div>
                </div>
                <div class="flex items-center">
                  <button title="Tách dòng (SL=1)" class="tach ant-btn ant-btn-text ant-btn-color-default ant-btn-sm ant-btn-icon-only"></button>
                  ${nutXoaDong()}
                </div>
              </div>
            </div>
          </div>`).join('');

        const tong = gio.reduce((t, d) => t + d.sp.gia * d.soLuong, 0);
        const soCai = gio.reduce((t, d) => t + d.soLuong, 0);
        // Có test cố tình gỡ bỏ dòng tổng để xem code chịu được không -> phải
        // dựng chắc, không nổ khi thiếu phần tử.
        const dat = (id, chu) => { const o = td.getElementById(id); if (o) o.textContent = chu; };
        // ⚠️ GIỎ TRỐNG THÌ KHÔNG CÓ CHÂN GIỎ. Đo trang thật ngày 2026-08-12
        // (scratchpad/ketQuaDo/nut-truoc-khi-bo-hang.json): lúc giỏ chưa có gì,
        // trang KHÔNG hề có chữ "Tổng thanh toán" lẫn nút "Thanh toán (F1)";
        // thêm một món vào thì cả hai mới hiện ra.
        //
        // Trang giả trước đây LUÔN vẽ chân giỏ với "Tổng thanh toán: 0" — thành
        // ra 734 test xanh trong khi ngoài đời máy đọc tổng trước lúc bỏ món đầu
        // và nhận về null, rồi dừng cả loạt. Đây là lần thứ NĂM trang giả bịa.
        const chanCu = td.getElementById('chanGio');
        if (gio.length === 0) { if (chanCu) chanCu.remove(); }
        else if (!chanCu) td.getElementById('khoiPhai').appendChild(chanGio);
        if (khongCoDongTong) {
            const d = td.getElementById('dongTongTt');
            if (d) d.remove();
        }

        dat('soMon', String(soCai));
        dat('tongSp', tien(tong));
        // ⚠️ Trang thật vẽ DÒNG GIỎ trước, "Tổng thanh toán" nhảy sau. Với
        // tongTreMs, trang giả cũng vậy — để kiểm máy biết CHỜ tổng chứ không
        // đọc một phát rồi kết luận oan là món không vào giỏ.
        if (tongTreMs > 0) setTimeout(() => dat('tongTt', tien(tong)), tongTreMs);
        else dat('tongTt', tien(tong));
        // ÉP chân giỏ lệch — dựng lại đúng mâu thuẫn thấy trên trang thật 22/08:
        // chân giỏ 2.300.000 trong khi giỏ chỉ có một dòng 1.450.000. Đặt SAU
        // mọi phép gán ở trên, nếu không nó bị ghi đè ngay và test xanh giả.
        if (chanGioLech != null) {
            dat('tongTt', tien(chanGioLech));
            dat('tongSp', tien(chanGioLech));
        }
        // ⚠️ CHÂN GIỎ ĐUỔI THEO SAU. Đặt con số CŨ vào trước, đúng nhịp sau mới
        // sửa lại — dựng lại khe mà lượt 09:02 ngày 24/08/2026 rơi trúng.
        if (chanGioLechMs > 0 && gio.length) {
            const cu = tong + 990000;
            dat('tongTt', tien(cu));
            dat('tongSp', tien(cu));
            setTimeout(() => { dat('tongTt', tien(tong)); dat('tongSp', tien(tong)); },
                       chanGioLechMs);
        }

        boc.querySelectorAll('[data-dong]').forEach((khoi) => {
            const i = Number(khoi.dataset.dong);
            khoi.querySelector('.xoa').addEventListener('click', () => {
                gio.splice(i, 1); veGio();
            });
            // − và + làm đúng việc: bấm nhầm chúng thì giỏ KHÔNG hết, và test
            // "xóa sạch giỏ" sẽ đỏ — đúng như ngoài đời.
            const nutHinh = (duong) => [...khoi.querySelectorAll('button')]
                .find(b => b.querySelector(`path[d="${duong}"]`));
            nutHinh(DUONG_CONG).addEventListener('click', () => {
                soLanBamCong++;
                const tran = chanTangTai > 0 ? Math.min(chanTangTai, gio[i].sp.ton)
                                             : gio[i].sp.ton;
                if (gio[i].soLuong < tran) gio[i].soLuong++;
                veGio();
            });
            nutHinh(DUONG_TRU).addEventListener('click', () => {
                if (gio[i].soLuong > 1) gio[i].soLuong--;
                veGio();
            });
            // ⚠️ Ô SỐ LƯỢNG KHÔNG NHẬN GÕ THẲNG — đúng như Tendoo thật.
            //
            // Ngày 2026-08-13 máy gõ "6" vào ô này trên trang THẬT: ô hiện 6
            // nhưng giỏ vẫn chỉ có 1 cái, tổng đứng im ở một đơn giá. Tức React
            // không hề nhận cú gõ. Trang giả trước đây LẠI NHẬN, nên toàn bộ
            // test đặt số lượng đều xanh trong khi ngoài đời không bao giờ chạy.
            //
            // Muốn dựng lại cảnh "ô nhận gõ" thì bật oSoLuongNhanGo.
            const o = khoi.querySelector('input');
            if (oSoLuongNhanGo) o.addEventListener('input', () => {
                const muon = Number(o.value);
                if (!Number.isFinite(muon) || muon < 1) return;
                // Tendoo THẬT chặn vượt tồn kho — trang giả cũng phải chặn,
                // nếu không test sẽ tưởng đặt được số lượng vô hạn.
                gio[i].soLuong = Math.min(muon, gio[i].sp.ton);
                const cu = o.value;
                veGio();
                const oMoi = td.querySelectorAll('#cacDongGio input')[i];
                if (oMoi && String(gio[i].soLuong) !== String(cu)) oMoi.value = String(gio[i].soLuong);
            });
        });
    }

    // Lưới được VẼ LẠI mỗi lần lọc, đúng như ứng dụng thật (React dựng lại danh
    // sách). Trước đây trang giả này xóa hẳn thẻ không khớp — sai, vì tìm lần
    // thứ hai sẽ thấy lưới rỗng và test đỏ oan.
    function veLuoi(tu = '') {
        const loc = String(tu || '').toLowerCase().trim();
        const hopLe = hang
            .map((sp, i) => ({ sp, i }))
            .filter(({ sp }) => !loc || sp.ten.toLowerCase().includes(loc)
                                     || sp.ma.toLowerCase().includes(loc));
        td.getElementById('luoiHang').innerHTML =
            hopLe.map(({ sp, i }) => theHang(sp, i)).join('');

        td.querySelectorAll('#luoiHang > div').forEach((the) => {
            the.addEventListener('click', () => {
                const sp = hang[Number(the.dataset.thuTu)];
                const co = gio.find(d => d.sp === sp);
                if (co) { if (co.soLuong < sp.ton) co.soLuong++; }
                else gio.push({ sp, soLuong: 1 });
                veGio();
            });
        });
    }

    // Gõ vào ô tìm SẢN PHẨM -> mở BẢNG GỢI Ý, KHÔNG lọc lưới (đúng như thật).
    function veGoiY(tu) {
        const loc = String(tu || '').toLowerCase().trim();
        const boc = td.getElementById('bangGoiY');
        if (!loc) { boc.innerHTML = ''; boc.style.display = 'none'; return; }
        const hopLe = hang.map((sp, i) => ({ sp, i }))
            .filter(({ sp }) => sp.ten.toLowerCase().includes(loc));
        boc.style.display = hopLe.length ? '' : 'none';
        boc.innerHTML = hopLe.map(({ sp, i }) => `
          <div aria-selected="false" class="ant-select-item ant-select-item-option" data-thu-tu="${i}">
            <div class="ant-select-item-option-content">
              <div class="flex justify-between gap-2">
                <span>${sp.ten}</span><span>${donViLa || 'chiếc'}</span><span>SP00${20 + i}</span>
                <span>${tien(sp.gia)}</span><span>Tồn: ${sp.ton}</span>
              </div>
            </div>
          </div>`).join('');
        boc.querySelectorAll('.ant-select-item-option').forEach((d) => {
            d.addEventListener('click', () => {
                if (conNuot > 0) { conNuot--; return; }   // cú bấm bị nuốt
                const sp = hang[Number(d.dataset.thuTu)];
                const them = themGapDoi ? 2 : 1;
                for (let i = 0; i < them; i++) {
                    const co = gio.find(x => x.sp === sp);
                    if (co) { if (co.soLuong < sp.ton) co.soLuong++; }
                    else gio.push({ sp, soLuong: 1 });
                }
                veGio();
            });
        });
    }
    // Nút Thanh toán bị khóa — dựng lại ca hỏng 21/08/2026.
    if (nutTtKhoa || nutTtMoSauMs > 0) {
        td.getElementById('nutThanhToan').disabled = true;
        // Khóa rồi MỞ sau một nhịp: React vẽ lại chân trang chậm hơn giỏ.
        if (nutTtMoSauMs > 0) {
            setTimeout(() => { td.getElementById('nutThanhToan').disabled = false; },
                       nutTtMoSauMs);
        }
    }
    // Ca bán hàng đang ĐÓNG: trang hiện nút "Mở ca" ở thanh trên.
    if (coNutMoCa) {
        const n = td.createElement('button');
        n.id = 'nutMoCa';
        n.textContent = 'Mở ca';
        td.querySelector('.thanh-tren').appendChild(n);
    }

    // ⚠️ 22/08/2026 Tendoo bỏ chữ "Tổng cộng" khỏi bảng xác nhận. Bản giả phải
    // dựng được cảnh ấy, nếu không thì chốt cuối cùng chẳng bao giờ được kiểm.
    if (nhanTongBang) {
        const o = [...td.querySelectorAll('#bangXacNhan *')]
            .find(e => !e.children.length && /Tổng cộng/i.test(e.textContent || ''));
        if (o) o.textContent = String(o.textContent).replace(/Tổng cộng/gi, nhanTongBang);
    }

    const oTim = td.getElementById('oTimSanPham');
    oTim.addEventListener('input', (su) => {
        // Ô nuốt chữ: React ghi đè lại rỗng ngay sau khi gõ. Bản giả phải dựng
        // được cảnh này, nếu không thì chốt "gõ không vào" chẳng bao giờ chạy.
        if (oTimNuotChu) { su.target.value = ''; return; }
        // Danh sách CÒN SÓT: luôn một dòng cố định, không đổi theo chữ gõ.
        if (goiYSot) { veGoiY(goiYSot); return; }
        // Ghi lại MỌI lần tìm có chữ — để bài test đếm được máy đã gõ mấy lượt.
        if (su.target.value) {
            daTim.push(su.target.value);
            if (daTim.length <= boQuaNLanTim) { veGoiY(''); return; }
        }
        if (oTimXoaSauMs > 0) setTimeout(() => { su.target.value = ''; }, oTimXoaSauMs);
        if (goiYTreMs > 0) {
            const chu = su.target.value;
            setTimeout(() => veGoiY(chu), goiYTreMs);
        } else {
            veGoiY(su.target.value);
        }
    });
    veLuoi();

    // ── Bước thanh toán, đúng như trang thật ──────────────────────────
    const bangXn = td.getElementById('bangXacNhan');

    function moBangXacNhan() {
        const tong = gio.reduce((t, d) => t + d.sp.gia * d.soLuong, 0);
        const soCai = gio.reduce((t, d) => t + d.soLuong, 0);
        td.getElementById('xnSoMon').textContent = String(soCai);
        td.getElementById('xnTienHang').textContent = tien(tong);
        // Tổng trong bảng lấy từ giỏ THẬT. Test nào muốn thử chốt chặn số 7 thì
        // ép lệch qua tuyện chọn tongBangXn.
        td.getElementById('xnTongCong').textContent =
            tien(tongBangXn == null ? tong : tongBangXn) + ' \u0111';
        // ⚠️ HÀNH VI ĐỔI NGÀY 19/08/2026. Trước đó Tendoo TỰ ĐIỀN SẴN ô này
        // bằng tổng đơn (quan sát thật 2026-08-12: hiện sẵn 490.000). Nay có
        // lượt chạy gặp ô để trống, bảng thấy khách đưa thiếu tiền nên TỰ BẬT
        // "Ghi nợ" — hai khách bị chặn vì đúng một ô bỏ trống.
        const oDua = td.getElementById('xnKhachDua');
        oDua.value = khongDienSanDaDua ? '0' : tien(tong);
        if (khongDienSanDaDua) {
            // Bảng thật tự gạt Ghi nợ theo số tiền khách đưa. Dựng lại đúng vậy
            // thì mới dò được bản vá "điền Khách đã đưa" có thật sự gỡ được không.
            const theoSoTien = () => {
                const so = Number(String(oDua.value).replace(/[^\d]/g, '')) || 0;
                const ct = td.getElementById('xnGhiNo');
                const thieu = so < tong;
                // Bảng 23/08/2026 dùng Ô TICK; bảng cũ dùng công tắc gạt.
                if (ct.type === 'checkbox') { ct.checked = thieu; return; }
                ct.setAttribute('aria-checked', thieu ? 'true' : 'false');
                ct.className = thieu ? 'ant-switch ant-switch-checked' : 'ant-switch';
            };
            // Dựng cảnh gõ NHẦM sang ô khác: tổng trong bảng đổi theo.
            if (doiTongKhiDien) {
                oDua.addEventListener('input', () => {
                    td.getElementById('xnTongCong').textContent = tien(tong + 1) + ' đ';
                });
            }
            oDua.addEventListener('input', theoSoTien);
            oDua.addEventListener('change', theoSoTien);
            theoSoTien();
        }
        bangXn.style.display = '';
    }

    // ⚠️ HÀNH VI THẬT (chủ dự án xác nhận 2026-08-12):
    //   bấm "Thanh toán (F1)" -> bảng thuế hiện, KHÔNG có bảng xác nhận
    //   bấm "Bỏ qua"          -> bảng thuế chỉ ĐÓNG LẠI, vẫn chưa có bảng xác nhận
    //   bấm "Thanh toán (F1)" LẦN NỮA -> bây giờ bảng xác nhận mới hiện
    // Dựng đúng như vậy, không dựng theo tưởng tượng.
    let daBoQuaThue = false;
    let daDongNangCap = false;
    // Đặt tên cho việc bấm Thanh toán, để cảnh 'React thay hẳn nút' còn gắn
    // lại được vào nút mới.
    const bamThanhToan = () => {
        daBam.thanhToan++;                 // bấm nút này KHÔNG phát hành gì
        // Bảng nâng cấp còn hiện thì MẶT NẠ của nó nuốt cú bấm này, y như modal
        // thật. Không dựng chi tiết ấy thì "chờ bảng đóng" thành thừa trong bản
        // giả, và bài test không đòi hỏi được gì.
        if (td.getElementById('bangNangCap').style.display !== 'none') return;
        // Bảng thuế cũng vậy: modal thật có mặt nạ, còn hiện là nuốt sạch cú bấm.
        // Thiếu chi tiết này thì cảnh 'bấm Bỏ qua mà bảng không đóng' lại cho
        // bảng xác nhận mở đè lên bảng thuế — chuyện không đời nào xảy ra thật.
        if (td.getElementById('bangThue').style.display !== 'none') return;
        // `thueLuonChan`: cảnh xấu nhất — bỏ qua rồi bảng vẫn chặn tiếp. Dùng để
        // kiểm máy KHÔNG rơi vào vòng lặp bỏ-qua-rồi-bấm-lại vô tận.
        if (bangThue && (thueLuonChan || !daBoQuaThue)) {
            td.getElementById('bangThue').style.display = '';
            return;
        }
        if (bangNangCap && (nangCapLuonChan || !daDongNangCap)) {
            td.getElementById('bangNangCap').style.display = '';
            return;
        }
        if (!khongMoBang && gio.length) moBangXacNhan();
    };
    td.getElementById('nutThanhToan').addEventListener('click', bamThanhToan);

    // React THÁO nút cũ ra, dựng nút MỚI đã mở khóa. Ai còn giữ tham chiếu cũ
    // thì chờ tới già cũng thấy nó khóa — phải ĐỌC LẠI nút mỗi vòng.
    if (nutTtThayMoiSauMs > 0) {
        td.getElementById('nutThanhToan').disabled = true;
        setTimeout(() => {
            const cu = td.getElementById('nutThanhToan');
            if (!cu) return;
            const moi = cu.cloneNode(true);
            moi.disabled = false;
            cu.removeAttribute('id');
            cu.disabled = true;              // nút cũ khóa VĨNH VIỄN
            cu.replaceWith(moi);
            moi.addEventListener('click', bamThanhToan);
        }, nutTtThayMoiSauMs);
    }

    // Bảng nâng cấp: dấu × chỉ ĐÓNG bảng, y như Ant Design thật.
    td.getElementById('nangCapDong').addEventListener('click', () => {
        daBam.nangCapDong++;
        daDongNangCap = true;
        const anDi = () => {
            td.getElementById('bangNangCap').style.display = 'none';
            // Dựng lại cảnh trang bị đẩy sang giao diện mới: nút Thanh toán biến mất.
            if (nangCapMatNutThanhToan) td.getElementById('nutThanhToan').remove();
            // React vẽ lại vùng bán hàng: nút khoá một nhịp rồi mở lại.
            if (nangCapVangNutMs > 0) {
                const n = td.getElementById('nutThanhToan');
                if (n) {
                    n.disabled = true;
                    setTimeout(() => { n.disabled = false; }, nangCapVangNutMs);
                }
            }
        };
        if (nangCapDongTreMs > 0) setTimeout(anDi, nangCapDongTreMs);
        else anDi();
    });
    // Bảng KHÔNG có lối đóng an toàn nào: gỡ dấu × ĐI SAU khi đã gắn sự kiện,
    // nếu không thì gỡ nhầm lúc phần tử chưa có ai nghe và cả bản giả nổ tung.
    if (nangCapKhongNutDong) td.getElementById('nangCapDong').remove();

    // ⛔ Nút này máy TUYỆT ĐỐI không được bấm: bấm là sang /sales/pos-v2, nơi
    // mọi bộ chọn của extension đều vô dụng và cả loạt chạy hỏng theo.
    td.getElementById('nangCapDoiNgay').addEventListener('click', () => {
        daBam.nangCapDoiNgay++;
        td.getElementById('bangNangCap').style.display = 'none';
    });

    // Đếm xem máy có bấm bậy vào bảng thuế không.
    // ⚠️ React VẼ LẠI BẢNG XÁC NHẬN sau khi ô "Khách đã đưa" đổi giá trị: tháo
    // hẳn nút cũ ra khỏi trang và dựng nút mới y hệt. Nút cũ vẫn tìm được qua
    // tham chiếu đã giữ, nhưng bấm vào nó thì KHÔNG có gì xảy ra — sự kiện
    // không tới được ai cả. Đây là nghi phạm số một của ca khách "hoa".
    // Tháo HẲN bảng xác nhận khỏi trang, không dựng lại: tham chiếu cũ vẫn tìm
    // được nút, nhưng nút ấy không còn nằm trong trang nữa.
    if (thaoBangXn) {
        const oD = td.getElementById('xnKhachDua');
        // Tháo SAU một nhịp, để bảng kịp cập nhật Ghi nợ theo số vừa điền —
        // nếu tháo ngay thì máy dừng ở chốt Ghi nợ và không tới được cú bấm.
        if (oD) oD.addEventListener('input', () => setTimeout(() => bangXn.remove(), 5), { once: true });
    }
    // Mặt nạ modal chặn cú bấm giữa đường: nút vẫn nhận, nhưng sự kiện không
    // nổi tới tài liệu nên React không bao giờ thấy.
    if (chanCuBamXn) {
        // ⚠️ CHẶN Ở PHA NỔI BỌT, KHÔNG PHẢI PHA BẮT. Chặn ở pha bắt thì sự kiện
        // không tới được cả chính cái nút — và chuông gắn trên nút cũng im theo,
        // nên không phân biệt được chuông tốt với chuông vô dụng.
        bangXn.addEventListener('click', (su) => su.stopPropagation());
    }
    if (veLaiBangXn) {
        const oDua = td.getElementById('xnKhachDua');
        if (oDua) {
            // Vẽ lại SAU một nhịp, để bảng kịp cập nhật Ghi nợ theo số vừa điền —
            // bản sao chụp trước lúc đó thì máy dừng ở chốt Ghi nợ, không tới cú bấm.
            oDua.addEventListener('input', () => setTimeout(() => {
                // ⚠️ THAY CẢ CÁI BẢNG, không chỉ thay cái nút. Thay mỗi nút thì
                // tham chiếu bảng cũ vẫn nằm trong trang và phép tìm nút trên nó
                // vẫn ra nút MỚI — cảnh dựng ra không đòi hỏi được gì.
                const bangCu = td.querySelector('#bangXacNhan .ant-modal');
                if (!bangCu) return;
                const bangMoi = bangCu.cloneNode(true);   // bản sao KHÔNG mang người nghe
                bangCu.replaceWith(bangMoi);
                const moi = bangMoi.querySelector('#xnXacNhan');
                if (moi) moi.addEventListener('click', () => {
                    daBam.xacNhan++;
                    if (!giuBangSauXacNhan) bangXn.style.display = 'none';
                    if (!giuGioSauXacNhan) { gio.length = 0; veGio(); }
                });
            }, 5), { once: true });
        }
    }

    td.getElementById('thueBoQua').addEventListener('click', () => {
        daBam.thueBoQua++;
        daBoQuaThue = true;
        // `thueKhongDong`: cú bấm không ăn — bảng cứ đứng đó. Máy phải nói ĐÚNG
        // rằng bảng CHƯA TỪNG ĐÓNG, chứ không được đổ cho tài khoản chưa thiết
        // lập thuế: hai bệnh ấy chữa ở hai nơi hoàn toàn khác nhau.
        if (thueKhongDong) return;
        td.getElementById('bangThue').style.display = 'none';   // chỉ đóng lại
    });
    // ⛔ Nút này máy TUYỆT ĐỐI không được bấm: bấm là rời trang bán hàng.
    td.getElementById('thueThietLap').addEventListener('click', () => {
        daBam.thueThietLap++;
        td.getElementById('bangThue').style.display = 'none';
    });
    td.getElementById('nutLuuDon').addEventListener('click', () => { daBam.luuDon++; });

    td.getElementById('xnQuayLai').addEventListener('click', () => {
        daBam.quayLai++;
        bangXn.style.display = 'none';     // Ant chỉ ẩn đi, KHÔNG xóa khỏi DOM
    });

    td.getElementById('xnXacNhan').addEventListener('click', (su) => {
        daBam.xacNhan++;                   // ĐÂY mới là cú phát hành thật

        // Tendoo NHẬN cú bấm nhưng không làm gì — "từ chối im lặng". Khác hẳn
        // với bấm vào khoảng không: ở đây bộ đếm CÓ tăng.
        if (xacNhanBaoLoi) {
            const l = td.createElement('div');
            l.className = 'ant-form-item-explain-error';
            l.textContent = xacNhanBaoLoi;
            su.currentTarget.closest('.ant-modal').appendChild(l);
        }
        if (xacNhanNuot || xacNhanBaoLoi) return;

        const xong = () => {
            if (!giuBangSauXacNhan) bangXn.style.display = 'none';
            if (!giuGioSauXacNhan) { gio.length = 0; veGio(); }
        };
        // Hệ thống thuế trả lời chậm: nút quay vòng chờ rồi mới xong.
        if (xacNhanQuayMs > 0) {
            const n = su.currentTarget;
            n.className += ' ant-btn-loading';
            setTimeout(() => {
                n.className = String(n.className).replace(' ant-btn-loading', '');
                xong();
            }, xacNhanQuayMs);
            return;
        }
        xong();
    });

    if (ghiNoBat) {
        const ct = td.getElementById('xnGhiNo');
        // Bảng 23/08/2026 dùng Ô TICK; bảng cũ dùng công tắc gạt.
        if (ct.type === 'checkbox') {
            ct.checked = true;
        } else {
            ct.setAttribute('aria-checked', 'true');
            ct.className = 'ant-switch ant-switch-checked';
        }
    }

    for (const g of gioBanDau) {
        const sp = timSp(g.ten, g.gia);
        if (sp) gio.push({ sp, soLuong: g.soLuong || 1 });
    }
    veGio();

    return {
        dom, cuaSo, tailieu: td, daBam,
        xemGio: () => gio.map(d => ({ ten: d.sp.ten, gia: d.sp.gia, soLuong: d.soLuong })),
        soLanBamCong: () => soLanBamCong,
        xemTim: () => daTim.slice(),
        tongHienTai: () => gio.reduce((t, d) => t + d.sp.gia * d.soLuong, 0),
        // Dọn giỏ TỪ BÊN NGOÀI, không qua nút xóa — để dựng đúng cảnh "giỏ tự
        // trống đi mà bảng xác nhận không hiện".
        xoaGio: () => { gio.length = 0; veGio(); },
    };
}

module.exports = { taoTrangPos, HANG_MAU };
