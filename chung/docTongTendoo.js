'use strict';

// ⚠️ TOÀN BỘ FILE NẰM TRONG MỘT PHẠM VI RIÊNG (hàm bọc ngoài).
// Chrome nạp nhiều file vào CÙNG MỘT phạm vi — hai file cùng khai `const API`
// là file thứ hai nổ ngay khi nạp, và KHÔNG có lỗi nào hiện ra cho người dùng.

(function () {

// ============================================================================
//  ĐỌC TỔNG DOANH THU TỪ TENDOO — bóc JSON thô thành con số dùng được.
//
//  ── RANH GIỚI 4 ────────────────────────────────────────────────────────────
//  Đây là NƠI DUY NHẤT hiểu hình dạng phản hồi của Tendoo cho đường
//  /e-invoice/v2/invoices/summary. Không tầng nào sâu hơn được đụng vào JSON
//  thô. Tendoo đổi hình dạng thì sửa đúng một file này.
//
//  ── HÌNH DẠNG THẬT, quan sát ngày 2026-09-22 ───────────────────────────────
//      {"success":true,"data":{
//         "sum":167790000,
//         "total_amount_after_discount":167790000,
//         "total_count":123,
//         "total_tax_amount":0, ... }}
//  Đối chiếu với màn hình cùng lúc:
//      TỔNG TIỀN ĐƠN HÀNG 167.790.000 · TỔNG DOANH THU TRƯỚC THUẾ 167.790.000
//      · SỐ LƯỢNG 123
//
//  ⚠️ HAI SỐ ĐANG BẰNG NHAU nên KHÔNG BIẾT CHẮC số nào nuôi ô nào — cửa hàng
//  dùng để dò không có chiết khấu và thuế bằng 0. Ta lấy
//  `total_amount_after_discount` theo nghĩa của tên gọi ("sau chiết khấu" =
//  trước thuế), nhưng TRẢ VỀ CẢ HAI để tầng trên báo cho người dùng khi chúng
//  lệch. Đây là số kế toán: đoán rồi im lặng là không được phép.
//
//  ── VÌ SAO KHÔNG DÙNG Number() ─────────────────────────────────────────────
//  Đã dính đúng bẫy này hai lần (ô "số tiền mỗi ngày" và dấu chấm nghìn):
//  trên 2^53 thì Number() trả về một con số KHÁC. Ở đây tiền là số nguyên đồng
//  do máy chủ trả về dạng số JSON, nên ta kiểm tra thật kỹ và TỪ CHỐI thay vì
//  nhận một con số đã sai.
// ============================================================================

const MA = {
    THIEU_DU_LIEU: 'THIEU_DU_LIEU',
    SO_KHONG_HOP_LE: 'SO_KHONG_HOP_LE',
};

/** Số nguyên đồng, không âm, còn nguyên vẹn (không vượt ngưỡng an toàn). */
function soTienNguyen(v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    if (!Number.isInteger(v)) return null;
    if (v < 0) return null;
    if (v > Number.MAX_SAFE_INTEGER) return null;
    return v;
}

/** Số lượng hóa đơn: nguyên, không âm. */
function soDem(v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    if (!Number.isInteger(v) || v < 0) return null;
    return v;
}

/**
 * Bóc phản hồi thô.
 *
 * @param {any} tho JSON Tendoo trả về
 * @returns {{ok:true, doanhThuTruocThue:number, tongTienDonHang:number,
 *            soLuong:number, lech:boolean}
 *        | {ok:false, ma:string, thongBao:string}}
 */
function boc(tho) {
    const d = tho && tho.data;
    if (!d || typeof d !== 'object') {
        return { ok: false, ma: MA.THIEU_DU_LIEU,
                 thongBao: 'Tendoo trả về không có phần dữ liệu' };
    }

    const truocThue = soTienNguyen(d.total_amount_after_discount);
    const donHang = soTienNguyen(d.sum);
    const soLuong = soDem(d.total_count);

    // ⚠️ THIẾU MỘT TRONG BA LÀ HỎNG CẢ. Không lấy tạm hai cái rồi đoán cái thứ
    // ba — số kế toán thiếu một mảnh thì cả bộ không dùng được.
    if (truocThue === null || donHang === null || soLuong === null) {
        return { ok: false, ma: MA.SO_KHONG_HOP_LE,
                 thongBao: 'Tendoo trả về con số không đọc được' };
    }

    return {
        ok: true,
        doanhThuTruocThue: truocThue,
        tongTienDonHang: donHang,
        soLuong,
        // Hai số lệch nhau -> tầng trên PHẢI báo, không được lặng lẽ tin một cái.
        lech: truocThue !== donHang,
    };
}

const API = { boc, MA };

if (typeof module !== 'undefined' && module.exports) module.exports = API;
globalThis.HDT_DocTongTendoo = API;

})();
