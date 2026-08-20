'use strict';

// ⚠️ TOÀN BỘ FILE NẰM TRONG MỘT PHẠM VI RIÊNG (hàm bọc ngoài).

(function () {

// ============================================================================
//  DẤU GIỎ — chữ ký của chính máy để lại trên giỏ hàng
//
//  VẤN ĐỀ: lần chạy hỏng giữa chừng để lại hàng trong giỏ. Lần sau máy thấy giỏ
//  không trống nên từ chối chạy, bắt người dùng sang tab Tendoo bấm "Xóa sạch
//  giỏ" bằng tay. Phiền, mà chẳng bảo vệ được gì — vì giỏ đó là do CHÍNH MÁY để
//  lại chứ không phải hàng người dùng đang chọn dở.
//
//  NHƯNG cũng KHÔNG được xóa bừa: người dùng có thể đang tự tay chọn hàng trên
//  tab đó. Xóa mất công của họ là hỏng việc thật, không phải phiền vặt.
//
//  CÁCH GIẢI: mỗi lần máy bỏ hàng vào giỏ thì ghi lại một dấu — khách nào, mấy
//  món, tên và số lượng từng món, tổng tiền, lúc mấy giờ. Lần sau đối chiếu:
//     · giỏ KHỚP dấu   -> đúng là giỏ của máy -> tự xóa, ghi rõ đã xóa gì
//     · giỏ KHÔNG khớp -> hàng của người dùng -> DỪNG, hỏi cho tử tế
//
//  Nguyên tắc: máy chỉ được xóa thứ do chính nó tạo ra.
// ============================================================================

const KHOA_LUU = 'hdt-dau-gio';

/**
 * Ghi lại dấu sau khi bỏ hàng vào giỏ.
 * @param {{maKH?:string, danhSach:Array<{ten:string, soLuong:number}>, tong?:number,
 *          luc?:number}} boi
 */
function taoDau({ maKH = '', danhSach = [], tong = null, luc = null }) {
    const cacDong = (danhSach || []).map(d => ({
        ten: String(d.ten || '').trim(),
        soLuong: Number(d.soLuong) || 0,
    })).filter(d => d.ten);
    return {
        maKH: String(maKH || ''),
        luc: luc == null ? Date.now() : luc,
        soDong: cacDong.length,
        tong: tong == null ? null : Number(tong),
        cacDong,
    };
}

/**
 * Giỏ đang có trên màn hình có ĐÚNG là giỏ máy để lại không.
 *
 * @param {object|null} dau        dấu đã ghi (đọc từ chrome.storage)
 * @param {Array<{chu:string, soLuong:number}>} cacDongGio  giỏ đang có
 * @param {number|null} tongGio    tổng Tendoo đang hiện, null nếu không đọc được
 * @returns {{khop:boolean, lyDo:string}}
 */
function khopVoiGio(dau, cacDongGio, tongGio = null) {
    if (!dau || !Array.isArray(dau.cacDong) || !dau.cacDong.length) {
        return { khop: false, lyDo: 'Chưa từng ghi dấu giỏ nào' };
    }
    const gio = cacDongGio || [];
    if (gio.length !== dau.cacDong.length) {
        return { khop: false, lyDo: `Giỏ có ${gio.length} dòng, dấu ghi ${dau.cacDong.length} dòng` };
    }
    // Tổng lệch là chắc chắn KHÔNG phải giỏ của mình. Đọc không được thì bỏ qua
    // điều kiện này chứ không suy diễn.
    if (dau.tong != null && tongGio != null && Number(tongGio) !== Number(dau.tong)) {
        return { khop: false, lyDo: `Tổng giỏ ${tongGio} khác dấu đã ghi ${dau.tong}` };
    }

    // Mỗi dòng trong dấu phải tìm được MỘT dòng giỏ riêng khớp cả tên lẫn số
    // lượng. Dùng "đã ghép" để hai món trùng tên không cùng khớp vào một dòng.
    const daGhep = new Array(gio.length).fill(false);
    for (const d of dau.cacDong) {
        const i = gio.findIndex((g, j) => !daGhep[j]
            && String(g.chu || '').includes(d.ten)
            && Number(g.soLuong) === Number(d.soLuong));
        if (i < 0) return { khop: false, lyDo: `Không thấy "${d.ten}" ×${d.soLuong} trong giỏ` };
        daGhep[i] = true;
    }
    return { khop: true, lyDo: '' };
}

/** Mô tả dấu cho người đọc. Không kèm gì nhạy cảm. */
function moTa(dau) {
    if (!dau) return '';
    const luc = new Date(dau.luc || 0).toLocaleString('vi-VN');
    return `${dau.soDong} món${dau.maKH ? ' của khách ' + dau.maKH : ''}, để lại lúc ${luc}`;
}

/** Bọc chrome.storage.local. Không có Chrome -> bộ nhớ tạm để test được. */
function taoLuuTru(chromeApi) {
    const kho = chromeApi && chromeApi.storage && chromeApi.storage.local;
    if (!kho) {
        let tam = null;
        return { async doc() { return tam; }, async ghi(o) { tam = o; } };
    }
    return {
        async doc() { const k = await kho.get(KHOA_LUU); return k[KHOA_LUU] || null; },
        async ghi(o) {
            if (o == null) await kho.remove(KHOA_LUU);
            else await kho.set({ [KHOA_LUU]: o });
        },
    };
}

const API = { taoDau, khopVoiGio, moTa, taoLuuTru, KHOA_LUU };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof globalThis !== 'undefined') globalThis.HDT_DauGio = API;

})();
