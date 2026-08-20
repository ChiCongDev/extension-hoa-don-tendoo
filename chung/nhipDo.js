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
    HAN_CHO_BANG: 8000,           // bảng "Xác nhận thanh toán" phải hiện
    HAN_CHO_GIO_TRONG: 8000,      // sau khi bấm "Xác nhận", giỏ phải trống đi
    HAN_CHO_BANG_THUE_DONG: 4000, // sau khi bấm "Bỏ qua", bảng thuế phải đóng
    HAN_CHO_O_DANG_NHAP: 8000,    // form đăng nhập phải gắn xong
    HAN_CHO_DONG_GIO: 4000,       // món vừa bấm phải hiện trong giỏ
    HAN_DOI_TRANG: 45000,         // tab phải tới được địa chỉ mong đợi
    HAN_DOC_DANH_TINH: 30000,     // SAU đăng nhập: rỗng ở đây là LỖI -> chờ lâu
    HAN_DOC_TRUOC_KHI_DOI: 2500,  // TRƯỚC khi đổi: rỗng là bình thường (chưa
                                  // đăng nhập bao giờ) -> chờ lâu vô ích
};

if (typeof module !== 'undefined' && module.exports) module.exports = NHIP_DO;
if (typeof globalThis !== 'undefined') globalThis.HDT_NhipDo = NHIP_DO;

})();
