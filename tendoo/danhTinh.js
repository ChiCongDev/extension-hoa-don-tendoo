'use strict';

// ⚠️ TOÀN BỘ FILE NẰM TRONG MỘT PHẠM VI RIÊNG (hàm bọc ngoài).
// Chrome nạp nhiều file vào CÙNG MỘT phạm vi — hai file cùng khai `const API`
// là file thứ hai nổ ngay khi nạp, và KHÔNG có lỗi nào hiện ra cho người dùng:
// popup chỉ đơn giản trống trơn. Đã dính đúng lỗi này một lần. Bọc lại để không
// bao giờ dính nữa. Xuất ra ngoài qua globalThis.HDT_* ở cuối file.

(function () {

// ============================================================================
//  DANH TÍNH PHIÊN ĐĂNG NHẬP TENDOO  —  đọc từ lời gọi `info`
//
//  Đây là ADAPTER (Ranh giới 4): dữ liệu thô của Tendoo DỪNG LẠI ở file này.
//  Phần còn lại của extension chỉ thấy mấy trường sạch bên dưới, không bao giờ
//  thấy JSON gốc. Tendoo đổi cấu trúc thì chỉ file này phải sửa.
//
//  Vì sao lấy `business_info.current_store.id` chứ không lấy tên:
//    - tên cửa hàng là số điện thoại, người dùng đổi được bất cứ lúc nào
//    - display_name ("CH THUỲ DƯƠNG") do người dùng tự đặt, có thể trùng nhau
//    - `current_store.id` là UUID do máy chủ cấp, và nó KHỚP với `business_id`
//      nằm trong từng sản phẩm -> đối chiếu chéo được (xem docSanPham.js)
// ============================================================================

/**
 * Bóc danh tính từ JSON của lời gọi `info`.
 * @returns {{maCuaHang:string, tenCuaHang:string, tenTaiKhoan:string,
 *            vaiTro:string, soCuaHangToiDa:number}|null}  null nếu không đọc được.
 */
function doc(json) {
    const duLieu = json && json.data;
    if (!duLieu) return null;

    const cuaHang = duLieu.business_info && duLieu.business_info.current_store;
    if (!cuaHang || !cuaHang.id) return null;      // không có mã cửa hàng -> vô dụng

    const taiKhoan = duLieu.account || {};
    const vaiTro = (duLieu.business_info && duLieu.business_info.current_role) || {};

    return {
        maCuaHang: String(cuaHang.id).trim(),
        tenCuaHang: String(cuaHang.store_name || '').trim(),
        tenTaiKhoan: String(taiKhoan.display_name || '').trim(),
        vaiTro: String(vaiTro.role_name || '').trim(),
        soCuaHangToiDa: Number(taiKhoan.max_store_count || 0),
    };
}

/**
 * CHỐT CHẶN NHẦM TÀI KHOẢN — luật cứng số 1.
 *
 * Từ chối theo mặc định: thiếu dữ liệu, đọc không được, khai báo trống —
 * TẤT CẢ đều là KHÔNG KHỚP. Không bao giờ đoán, không bao giờ "chắc là đúng".
 *
 * @returns {{khop:boolean, lyDo:string}}
 */
function doiChieu(danhTinh, maCuaHangMongDoi) {
    if (!danhTinh || !danhTinh.maCuaHang) {
        return { khop: false, lyDo: 'Không đọc được tài khoản đang đăng nhập' };
    }
    const mongDoi = String(maCuaHangMongDoi || '').trim();
    if (!mongDoi) {
        return { khop: false, lyDo: 'Khách này chưa khai báo tài khoản Tendoo' };
    }
    if (danhTinh.maCuaHang.toLowerCase() !== mongDoi.toLowerCase()) {
        return {
            khop: false,
            lyDo: `Đang đăng nhập cửa hàng khác (${danhTinh.tenTaiKhoan || danhTinh.maCuaHang})`,
        };
    }
    return { khop: true, lyDo: '' };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { doc, doiChieu };
if (typeof globalThis !== 'undefined') globalThis.HDT_DanhTinh = { doc, doiChieu };
})();
