'use strict';

// ============================================================================
//  ĐỌC DOANH THU TỪ SELL BẰNG TOKEN — không cần đăng nhập.
//
//  ⚠️ VÌ SAO CÓ TỆP NÀY. Trước đây máy lấy doanh thu bằng cách ĐỌC BẢNG trên
//  trang báo cáo, mà trang đó đòi đăng nhập. Đăng xuất hoặc hết hạn phiên là
//  hẹn giờ chạy không lấy được số. Tệp này đi thẳng vào API bằng token, nên
//  chạy y hệt nhau dù có đăng nhập hay không — đúng yêu cầu chủ dự án
//  2026-08-14.
//
//  ⚠️ ĐƯỜNG NÀY LÀ ĐƯỜNG CHÍNH, đọc bảng chỉ còn là lối phụ. Hai đường mà đường
//  nào cũng có thể được dùng thì kết quả có thể lệch nhau; đi mãi một đường thì
//  đăng nhập hay không cũng ra cùng một số.
//
//  ⚠️ Bên Sell trỏ đúng vào hàm mà trang báo cáo đang dùng, KHÔNG viết lại truy
//  vấn. Số này để xuất hóa đơn thuế thật — hai chỗ cùng tính doanh thu là sớm
//  muộn ra hai con số khác nhau mà không ai biết cái nào đúng.
// ============================================================================

(function () {

const DUONG_BANG = '/api/extension/bao-cao-khach-hang';

/** Sell chặn ở 100 bản ghi mỗi trang. Nhiều khách hơn thì phải lấy nhiều trang. */
const MOI_TRANG = 100;

/** Chặn vòng lặp vô tận nếu Sell trả phân trang hỏng. 100 trang = 10.000 khách. */
const TRAN_TRANG = 100;

/**
 * Đổi một dòng của API về ĐÚNG hình mà máy đang dùng (docBang.js trả ra hình
 * này). Đổi hình ở đây, không đổi ở nơi dùng — để mọi bước sau không cần biết
 * số đến từ API hay từ bảng.
 */
function doiHinh(d) {
    return {
        maKH: String((d && d.ma_khach_hang) || '').trim(),
        tenKH: String((d && d.ten_khach_hang) || '').trim(),
        doanhThu: Math.round(Number((d && d.doanh_thu) || 0)),
        khachHangId: Number((d && d.khach_hang_id) || 0) || null,
    };
}

/**
 * Giữ đúng luật lọc của docBang.js: bỏ dòng không có mã, không có id, hoặc
 * doanh thu <= 0. Khác luật là hai đường ra hai danh sách khách khác nhau.
 */
function locDuoc(k) {
    return k.khachHangId !== null && k.maKH !== '' && k.doanhThu > 0;
}

/**
 * Lấy doanh thu HÔM NAY của mọi khách, qua token.
 *
 * @returns {Promise<{ok:boolean, ma?:string, dong?:Array, ngay?:{tu:string,den:string},
 *                    thongBao?:string}>}
 */
async function docBangQuaToken(caiDat, layFetch) {
    const c = caiDat || {};
    const url = String(c.sellUrl || '').trim().replace(/\/+$/, '');
    const token = String(c.sellToken || '').trim();

    if (!url || !token) {
        return { ok: false, ma: 'CHUA_KHAI_BAO',
                 thongBao: 'Chưa khai địa chỉ bongtom.store hoặc token nên không đọc số bằng token được.' };
    }
    const fetchDung = layFetch || (typeof fetch !== 'undefined' ? fetch : null);
    if (!fetchDung) return { ok: false, ma: 'KHONG_CO_FETCH' };

    const tatCa = [];
    let ngay = null;

    for (let trang = 1; trang <= TRAN_TRANG; trang++) {
        // ⚠️ loai=hom_nay là do MÁY CHỦ chốt theo giờ Việt Nam. Không tự tính
        // ngày ở đây: máy người dùng có thể lệch múi giờ, gần nửa đêm là lấy
        // nhầm ngày và xuất hóa đơn cho ngày hôm trước.
        //
        // ⚠️ KHÔNG gửi loai_don: để trống là "mọi loại đơn", đúng bằng mặc định
        // của trang báo cáo. Gửi vào một loại là số lệch với những gì bạn nhìn
        // thấy trên trang.
        const duong = `${url}${DUONG_BANG}?loai=hom_nay&trang=${trang}&so_ban_ghi=${MOI_TRANG}`;
        let tra;
        try {
            tra = await fetchDung(duong, {
                headers: { 'Accept': 'application/json', 'Authorization': 'Bearer ' + token },
            });
        } catch (e) {
            return { ok: false, ma: 'KHONG_GOI_DUOC',
                     thongBao: `Không gọi được bongtom.store ở ${url}: ${(e && e.message) || e}` };
        }

        if (!tra || !tra.ok) {
            const ma = tra && tra.status;
            if (ma === 403) {
                return { ok: false, ma: 'SAI_TOKEN',
                         thongBao: 'bongtom.store TỪ CHỐI TOKEN khi đọc doanh thu. Kiểm tra dòng '
                             + 'EXTENSION_HOA_DON_TOKEN trong .env của bongtom.store có khớp với token '
                             + 'đã khai ở đây không. KHÔNG đọc số, không tạo hóa đơn nào.' };
            }
            if (ma === 404) {
                return { ok: false, ma: 'SAI_DIA_CHI',
                         thongBao: `Không có đường đọc doanh thu ở địa chỉ này (${url}). bongtom.store đã `
                             + 'cập nhật bản có đường /api/extension/bao-cao-khach-hang chưa?' };
            }
            return { ok: false, ma: 'SELL_LOI',
                     thongBao: 'bongtom.store trả về ' + (ma || '?') + ' khi đọc doanh thu. KHÔNG đọc số.' };
        }

        let d;
        try { d = await tra.json(); } catch (e) { d = null; }
        // ⚠️ Đăng xuất giữa chừng thì Sell trả về TRANG ĐĂNG NHẬP chứ không phải
        // JSON. Không bắt được chỗ này là máy tưởng "hôm nay không ai có doanh
        // thu" rồi im lặng bỏ qua cả lượt.
        if (!d || typeof d !== 'object' || !d.thanh_cong || !Array.isArray(d.du_lieu)) {
            return { ok: false, ma: 'TRA_VE_LA',
                     thongBao: 'bongtom.store không trả về dữ liệu doanh thu như mong đợi. KHÔNG đọc số, '
                         + 'không tạo hóa đơn nào.' };
        }

        if (!ngay && d.thoi_gian) ngay = { tu: d.thoi_gian.tu_ngay, den: d.thoi_gian.den_ngay };
        for (const k of d.du_lieu) tatCa.push(doiHinh(k));

        const pt = d.phan_trang || {};
        const tong = Number(pt.tong_trang || 0);
        if (!tong || trang >= tong) break;
    }

    return { ok: true, ma: 'OK', dong: tatCa.filter(locDuoc), ngay: ngay || undefined };
}

const API = { docBangQuaToken, doiHinh, locDuoc, DUONG_BANG, MOI_TRANG, TRAN_TRANG };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof globalThis !== 'undefined') globalThis.HDT_DocBangToken = API;

})();
