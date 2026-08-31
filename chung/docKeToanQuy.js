'use strict';

// ============================================================================
//  ĐỌC HAI CON SỐ CHO TIN NHẮN TELEGRAM — chủ dự án chốt 31/08/2026.
//
//    · doanh thu HÔM NAY của khách
//    · tổng TIỀN XUẤT HÓA ĐƠN của khối ba tháng đang chứa hôm nay
//
//  ── VÌ SAO HỎI SELL CHỨ KHÔNG TỰ TÍNH ────────────────────────────────────
//  Extension biết số nó vừa xuất, nhưng lượt "tiền/ngày" KHÔNG đọc bảng doanh
//  thu (chốt 27/08/2026, để một trang báo cáo hỏng không giết chết lượt hóa đơn
//  chẳng liên quan). Còn tổng xuất hóa đơn cả quý thì nằm trong sổ kế toán bên
//  Sell — extension hoàn toàn không có.
//
//  ── MỘT LẦN GỌI RA CẢ HAI SỐ ─────────────────────────────────────────────
//  `/api/extension/hoa-don/ke-toan-bang` trỏ đúng vào hàm mà trang Kế toán tổng
//  hợp đang dùng. Xin khoảng ba tháng thì:
//    · `cong_don[id].xhd`            -> đúng cột "TIỀN XUẤT HÓA ĐƠN" trên trang
//    · dòng của hôm nay -> `o[id].ds` -> doanh thu hôm nay
//  Cùng một nguồn với thứ người dùng nhìn thấy, nên hai bên không bao giờ ra
//  hai con số khác nhau.
//
//  ⛔ VIỆC PHỤ, KHÔNG BAO GIỜ ĐƯỢC LÀM HỎNG LƯỢT CHẠY. Đây chỉ là hai dòng chữ
//  trong tin nhắn. Sell sập, sai token, mất mạng — hóa đơn vẫn phải ra bình
//  thường và tin nhắn vẫn phải gửi, chỉ là hai dòng ấy ghi "không đọc được".
//  Mọi hàm ở đây NUỐT LỖI và trả về mã lý do, KHÔNG ném ra ngoài.
// ============================================================================

(function () {

const DUONG_BANG = '/api/extension/hoa-don/ke-toan-bang';

/** Giữ kết quả bấy lâu rồi mới hỏi lại. Một loạt vài khách chỉ tốn một lần gọi. */
const HAN_NHO_MS = 20 * 1000;

const chuoi = (v) => String(v == null ? '' : v).trim();

/**
 * Hỏi Sell hai con số cho MỘT ngày (theo khối ba tháng chứa ngày ấy).
 *
 * @param {object} caiDat   cần `sellUrl` và `sellToken`
 * @param {string} ngay     "YYYY-MM-DD" theo giờ Việt Nam
 * @param {object} khoi     kết quả của `henGio.khoiBaThang(ngay)`
 * @returns {Promise<{ok:boolean, ma?:string, thongBao?:string,
 *                    theoMa?:object, thang?:number[]}>}
 *          `theoMa` là { [mã khách]: { dsHomNay, xhdQuy } }
 */
async function docQua(caiDat, ngay, khoi, layFetch) {
    const c = caiDat || {};
    const url = chuoi(c.sellUrl).replace(/\/+$/, '');
    const token = chuoi(c.sellToken);
    if (!url || !token) return { ok: false, ma: 'CHUA_KHAI_BAO' };
    if (!khoi || !khoi.tu || !khoi.den) return { ok: false, ma: 'KHOI_KHONG_HOP_LE' };

    const fetchDung = layFetch || (typeof fetch !== 'undefined' ? fetch : null);
    if (!fetchDung) return { ok: false, ma: 'KHONG_CO_FETCH' };

    const duong = `${url}${DUONG_BANG}?ky=tuy_chon`
        + `&tu_ngay=${encodeURIComponent(khoi.tu)}&den_ngay=${encodeURIComponent(khoi.den)}`;

    let tra;
    try {
        tra = await fetchDung(duong, {
            headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
        });
    } catch (e) {
        return { ok: false, ma: 'KHONG_GOI_DUOC',
                 thongBao: chuoi((e && e.message) || e) };
    }
    if (!tra || !tra.ok) {
        const ma = tra && tra.status;
        return { ok: false,
                 ma: ma === 403 ? 'SAI_TOKEN' : (ma === 404 ? 'SAI_DIA_CHI' : 'SELL_LOI'),
                 thongBao: `bongtom.store trả về ${ma || 'không rõ'}` };
    }

    let than = null;
    try { than = await tra.json(); } catch (e) { than = null; }
    if (!than || !than.khach) return { ok: false, ma: 'DOC_KHONG_RA' };

    // ⚠️ Bảng trả về theo `khach_hang_id`, còn extension chỉ biết MÃ KHÁCH.
    // Bắc cầu qua danh sách `khach` mà chính bảng ấy gửi kèm — đừng đoán.
    const maCua = new Map();
    for (const k of than.khach || []) {
        const ma = chuoi(k.ma_khach_hang);
        if (ma) maCua.set(String(k.khach_hang_id), ma);
    }

    const theoMa = {};
    for (const [id, o] of Object.entries(than.cong_don || {})) {
        const ma = maCua.get(String(id));
        if (ma) theoMa[ma] = { dsHomNay: null, xhdQuy: Number(o && o.xhd) || 0 };
    }
    // Doanh thu HÔM NAY nằm ở dòng của đúng ngày ấy trong lưới theo ngày.
    for (const r of than.dong || []) {
        if (chuoi(r && r.ngay) !== chuoi(ngay)) continue;
        for (const [id, o] of Object.entries((r && r.o) || {})) {
            const ma = maCua.get(String(id));
            if (ma && theoMa[ma]) theoMa[ma].dsHomNay = Number(o && o.ds) || 0;
        }
    }
    return { ok: true, theoMa, thang: khoi.thang };
}

/**
 * Bọc `docQua` bằng một chỗ nhớ ngắn hạn.
 *
 * ⚠️ Một loạt chạy có nhiều khách, mỗi khách một tin nhắn. Không nhớ lại thì
 * mỗi tin là một lần gọi Sell với đúng cùng một khoảng ngày — tốn vô ích và làm
 * chậm chuỗi thông báo. Hạn nhớ để NGẮN (20 giây) vì con số phải bao gồm tờ vừa
 * xuất: nhớ lâu là tin của khách sau đọc phải số cũ.
 */
function taoBoDoc({ layFetch, dongHo } = {}) {
    const gio = dongHo || (() => Date.now());
    let nho = null;      // { khoa, luc, kq }

    return async function doc(caiDat, ngay, khoi) {
        const khoa = `${chuoi((caiDat || {}).sellUrl)}|${chuoi(ngay)}|${khoi && khoi.tu}`;
        if (nho && nho.khoa === khoa && gio() - nho.luc < HAN_NHO_MS) return nho.kq;
        const kq = await docQua(caiDat, ngay, khoi, layFetch);
        // Chỉ nhớ khi ĐỌC ĐƯỢC. Nhớ cả lần hỏng là cả loạt cùng thiếu số vì một
        // cú mạng chập duy nhất.
        if (kq.ok) nho = { khoa, luc: gio(), kq };
        return kq;
    };
}

const API = { docQua, taoBoDoc, DUONG_BANG, HAN_NHO_MS };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof globalThis !== 'undefined') globalThis.HDT_DocKeToanQuy = API;

})();
