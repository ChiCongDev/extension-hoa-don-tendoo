'use strict';

// ⚠️ TOÀN BỘ FILE NẰM TRONG MỘT PHẠM VI RIÊNG (hàm bọc ngoài).
// Chrome nạp nhiều file vào CÙNG MỘT phạm vi — hai file cùng khai `const API`
// là file thứ hai nổ ngay khi nạp, và KHÔNG có lỗi nào hiện ra cho người dùng:
// popup chỉ đơn giản trống trơn. Đã dính đúng lỗi này một lần. Bọc lại để không
// bao giờ dính nữa. Xuất ra ngoài qua globalThis.HDT_* ở cuối file.

(function () {

// ============================================================================
//  ĐỌC BẢNG — bóc dữ liệu khách hàng ra khỏi bảng báo cáo của Sell.
//
//  Nguyên tắc: CHỈ ĐỌC. Không sửa một thuộc tính nào của trang Sell.
//
//  Cột được tìm theo TÊN TIÊU ĐỀ chứ không đếm theo vị trí cứng, vì trang Sell
//  ẩn bớt cột (Giá vốn / Lợi nhuận / Tỷ suất) khi người đăng nhập là nhân viên
//  bán hàng. Đếm cứng là sai ngay khi đổi vai trò.
// ============================================================================

function chuanHoa(chuoi) {
    return String(chuoi || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Đọc số tiền kiểu Việt Nam: "134.040.000" -> 134040000, "-1.235.000" -> -1235000.
 * Trả về null nếu không có chữ số nào (ô "---", ô rỗng).
 */
function docSoTien(chuoi) {
    const chu = String(chuoi || '');
    if (!/\d/.test(chu)) return null;
    const am = /^\s*[-−]/.test(chu);           // cả dấu trừ thường lẫn dấu trừ Unicode
    const so = Number(chu.replace(/[^\d]/g, ''));
    if (!Number.isFinite(so)) return null;
    return am ? -so : so;
}

/**
 * Vị trí cột có tiêu đề chứa `nhan`. -1 nếu không tìm thấy.
 */
function viTriCot(bang, nhan) {
    if (!bang) return -1;
    const cacTh = [...bang.querySelectorAll('thead th')];
    const can = chuanHoa(nhan);
    return cacTh.findIndex(th => chuanHoa(th.textContent).includes(can));
}

/**
 * Bóc id khách hàng ra khỏi nút "Chi tiết": onclick="xemChiTiet(123, '...')".
 * Khách lẻ không có nút (hiện "---") -> trả null.
 */
function docIdKhachHang(dong) {
    const nut = dong.querySelector('button[onclick*="xemChiTiet"]');
    if (!nut) return null;
    const khop = String(nut.getAttribute('onclick') || '').match(/xemChiTiet\(\s*(\d+)/);
    return khop ? Number(khop[1]) : null;
}

/**
 * Danh sách khách hàng đang hiển thị trên bảng.
 * Bỏ qua dòng không phải khách thật (khách lẻ, dòng "Đang tải...", dòng rỗng).
 *
 * @returns {Array<{maKH:string, tenKH:string, doanhThu:number, khachHangId:number, dong:HTMLElement}>}
 */
function docCacDong(bang) {
    if (!bang) return [];

    const cotMa = viTriCot(bang, 'mã kh');
    const cotTen = viTriCot(bang, 'tên khách hàng');
    const cotDoanhThu = viTriCot(bang, 'doanh thu');
    if (cotMa < 0 || cotTen < 0 || cotDoanhThu < 0) return [];

    return [...bang.querySelectorAll('tbody tr.khach-hang-row')]
        .map(dong => {
            const o = dong.children;
            const khachHangId = docIdKhachHang(dong);
            const doanhThu = docSoTien(o[cotDoanhThu] ? o[cotDoanhThu].textContent : '');
            return {
                maKH: o[cotMa] ? o[cotMa].textContent.trim() : '',
                tenKH: o[cotTen] ? o[cotTen].textContent.trim() : '',
                doanhThu,
                khachHangId,
                dong,
            };
        })
        // Khách lẻ (không có id) không gắn được với tài khoản Tendoo nào -> bỏ.
        // Doanh thu <= 0 thì không có gì để xuất hóa đơn.
        .filter(k => k.khachHangId !== null && k.maKH !== '' && k.doanhThu !== null && k.doanhThu > 0);
}

if (typeof globalThis !== 'undefined') globalThis.HDT_DocBang = { docSoTien, viTriCot, docIdKhachHang, docCacDong, chuanHoa };
if (typeof module !== 'undefined' && module.exports) module.exports = { docSoTien, viTriCot, docIdKhachHang, docCacDong, chuanHoa };
})();
