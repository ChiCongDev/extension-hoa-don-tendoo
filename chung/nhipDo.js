'use strict';

// ⚠️ TOÀN BỘ FILE NẰM TRONG MỘT PHẠM VI RIÊNG (hàm bọc ngoài).

(function () {

// ============================================================================
//  NHỊP ĐỘ — MỌI CON SỐ THỜI GIAN CỦA CẢ DỰ ÁN, ĐỂ Ở ĐÚNG MỘT CHỖ
//
//  NGUYÊN TẮC KHÔNG ĐƯỢC PHÁ: KHÔNG CHỜ CỨNG.
//
//  Trước đây rải rác khắp nơi những câu kiểu `await nghi(3000)` — ngồi đếm đủ 3
//  giây rồi mới nhìn xem việc đã xong chưa. Cách đó SAI CẢ HAI ĐẦU:
//    · chậm  — 99% trường hợp việc xong sau 0,3 giây mà vẫn phải đợi hết 3 giây
//    · hụt   — 1% còn lại máy lag, 3 giây chưa đủ, và mình kết luận sai
//
//  Nay mọi chỗ đều NHÌN LIÊN TỤC theo nhịp nhỏ cho tới khi ĐIỀU KIỆN THẬT xảy
//  ra, hoặc hết hạn. Nhanh hơn và chắc hơn cùng lúc.
//
//  ⛔ TĂNG TỐC KHÔNG ĐƯỢC ĐỔI LẤY BẤT KỲ CHỐT AN TOÀN NÀO. Những thứ sau giữ
//     nguyên tuyệt đối, không có con số nào ở đây đụng tới được:
//       · ghi sổ xuống đĩa TRƯỚC khi bấm
//       · tổng phải khớp tuyệt đối, lệch 1 đồng là dừng
//       · công tắc "Ghi nợ" phải tắt
//       · "Xác nhận" tối đa 1 lần, "Thanh toán" tối đa 2, "Bỏ qua" tối đa 1
//       · hết hạn mà thiếu bằng chứng thì là KHÔNG RÕ, không phải "xong"
//
//  Hạn (HAN_*) là mức chịu đựng tối đa — để dài không làm chậm đường thuận lợi,
//  vì đã nhìn liên tục thì xong là đi ngay. Nhịp (NHIP_*) mới là thứ quyết định
//  độ trễ, nên để nhỏ.
// ============================================================================

const NHIP_DO = {
    // ── Nhịp nhìn ───────────────────────────────────────────────────────────
    NHIN_DOM: 100,          // nhìn thay đổi ngay trong trang (bảng, dòng giỏ…)
    NHIN_TAB: 120,          // hỏi trạng thái tab qua chrome.tabs — đắt hơn chút
    NHIN_DANH_TINH: 250,    // hỏi trang POS đang ở cửa hàng nào (có gọi API)
    NHIN_XOA_DONG: 60,      // giữa hai cú bấm xóa dòng giỏ
    NHIN_DIEN_O: 120,       // đọc lại ô nhập sau khi gõ, xem React có nuốt không

    // ── Nghỉ giữa hai khách ─────────────────────────────────────────────────
    // Chỉ để đỡ dồn dập lên máy chủ Tendoo. Mỗi khách chỉ gọi vài lần đọc sản
    // phẩm chứ không quét dữ liệu, nên không cần nghỉ lâu. Bản cũ để 5–10 GIÂY,
    // tức mỗi loạt 10 khách mất gần một phút rưỡi ngồi không.
    NGHI_GIUA_KHACH: [250, 400],

    // ── Hạn chịu đựng ───────────────────────────────────────────────────────
    // ⚠️ HAN_CHO_BANG vẫn dùng cho trang SELL (epHomNay) — KHÔNG đổi ở đây. Phần
    // Tendoo POS dùng các hằng số riêng bên dưới.
    HAN_CHO_BANG: 8000,           // trang Sell: bảng dữ liệu phải hiện
    // ── 03/11/2026: NÂNG HẠN CHỜ CHO PHẦN TENDOO POS ────────────────────────
    // Ba lượt hỏng buổi tối 31/10 và 03/11 (18:15, 18:35, 19:45) đều là máy bỏ
    // cuộc trước khi Tendoo kịp trả lời. Chờ CHỈ NHÌN, không bấm gì, nên dài hơn
    // không thêm rủi ro hóa đơn sai; thấy đúng là đi ngay, không mất giây nào.
    // Hạn càng dài thì khi Tendoo hỏng THẬT càng báo chậm — nên có trần, và hàng
    // đợi phải gia hạn khóa trong lúc chạy (xem hangDoi.js, NHIP_GIA_HAN_KHOA_MS).
    HAN_CHO_BANG_XAC_NHAN: 30000, // bảng "Xác nhận thanh toán" phải hiện
    HAN_CHO_GIO_VE_DU: 30000,     // trang vẽ xong / tổng giỏ cuối phải đúng
    HAN_CHO_GIO_TRONG: 8000,      // sau khi bấm "Xác nhận", giỏ phải trống đi
    // Chờ THÊM chừng này khi Tendoo còn ĐANG LÀM: nút "Xác nhận" quay vòng, hoặc
    // lớp phủ "đang xử lý" phủ kín trang. Phát hành hóa đơn điện tử là gọi lên
    // hệ thống thuế, chậm hơn mọi thao tác khác — bỏ cuộc lúc Tendoo còn đang
    // làm là treo lệnh oan. Hết tín hiệu là kết luận ngay, nên hạn này gần như
    // không bao giờ dùng hết. Tổng tối đa = HAN_CHO_GIO_TRONG + hạn này ≈ 80 giây.
    HAN_CHO_TENDOO_QUAY: 72000,
    // Sau khi bỏ hàng vào giỏ, chân trang là một mảnh giao diện KHÁC — React
    // cập nhật chậm hơn giỏ một nhịp (đo 02/11/2026: 0,5–0,9 giây; 18:15 tối
    // 31/10 công tắc hóa đơn còn tắt khi máy nhìn). Chờ nút Thanh toán mở khóa
    // và công tắc Hóa đơn điện tử bật. Ca chưa mở thì chờ bao lâu cũng vô ích.
    HAN_CHO_NUT_MO_KHOA: 30000,
    HAN_CHO_BANG_THUE_DONG: 4000, // sau khi bấm "Bỏ qua", bảng thuế phải đóng
    HAN_CHO_O_DANG_NHAP: 8000,    // form đăng nhập phải gắn xong
    HAN_CHO_DONG_GIO: 30000,      // món vừa bấm phải hiện trong giỏ, tổng phải khớp
    // Trong lúc MỘT khách đang chạy, hàng đợi gia hạn khóa chống chạy chồng sau
    // mỗi chừng này (khóa tự hết hạn sau HAN_KHOA_MAC_DINH = 2 phút nếu Chrome bị tắt).
    NHIP_GIA_HAN_KHOA_MS: 30000,
    HAN_DOI_TRANG: 45000,         // tab phải tới được địa chỉ mong đợi
    HAN_DOC_DANH_TINH: 30000,     // SAU đăng nhập: rỗng ở đây là LỖI -> chờ lâu
    HAN_DOC_TRUOC_KHI_DOI: 2500,  // TRƯỚC khi đổi: rỗng là bình thường (chưa
                                  // đăng nhập bao giờ) -> chờ lâu vô ích
    // Chờ thanh công cụ trang Kế toán tổng hợp hiện ra để chèn nút "Doanh thu
    // Tendoo". Không thấy sau chừng này thì THÔI — có thể Sell đã đổi giao
    // diện. Thà thiếu một nút còn hơn treo một bộ theo dõi DOM suốt phiên làm
    // việc của người dùng.
    HAN_CHO_THANH_CONG_CU: 20000,
};

if (typeof module !== 'undefined' && module.exports) module.exports = NHIP_DO;
if (typeof globalThis !== 'undefined') globalThis.HDT_NhipDo = NHIP_DO;

})();
