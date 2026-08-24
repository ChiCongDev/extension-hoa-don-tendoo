'use strict';

// ============================================================================
//  SỐ DƯ "CHƯA XUẤT HÓA ĐƠN" — TRẦN CỨNG của tính năng tự đặt số tiền mỗi ngày.
//
//  ⚠️ VÌ SAO PHẢI HỎI SELL CHỨ KHÔNG TỰ CỘNG.
//  Bảng Kế toán tổng hợp có những dòng NGƯỜI DÙNG NHẬP TAY (ảnh chụp thật ngày
//  24/08/2026: "6 dòng nhập tay" ở một nơi, "19 dòng nhập tay" ở nơi khác).
//  Extension không hề biết những dòng ấy. Tự cộng "đã xuất" là ra số nhỏ hơn
//  thật -> số dư to hơn thật -> XUẤT VƯỢT TRẦN. Đúng cái thứ tính năng này sinh
//  ra để chặn.
//
//  ⚠️ VÌ SAO PHẢI HỎI KHOẢNG "TẤT CẢ".
//  Bên Sell ghi rõ trong mã: "Chưa xuất HĐ = doanh số trừ đã xuất, CỘNG DỒN
//  TRONG KHOẢNG ĐANG XEM. KHÔNG mang số dư từ trước sang." Hỏi khoảng hẹp là ra
//  một con số hoàn toàn khác, và nó nhỏ hơn sự thật hay lớn hơn thì tùy dữ liệu
//  — cả hai đều sai.
//
//  ⚠️ HÀM Ở ĐÂY KHÔNG BAO GIỜ NÉM. Nó chạy trên đường quyết định có xuất hóa
//  đơn thuế hay không; ném ra là tầng trên rơi vào nhánh "không rõ".
// ============================================================================

(function () {

const NhipDo = (typeof module !== 'undefined' && module.exports)
    ? require('./nhipDo') : globalThis.HDT_NhipDo;

// Cùng nếp với docBangToken.js: mạng chập thì thử lại, còn máy chủ trả lời rõ
// ràng (401/403/500) thì thôi — thử lại một câu từ chối chỉ tốn thời gian.
const SO_LAN_THU_MANG = 3;
const NGHI_GIUA_LAN_MS = 1500;

const DUONG = '/api/extension/hoa-don/ke-toan-bang';

const chuoi = (v) => String(v == null ? '' : v);

/** Hôm nay theo múi giờ Việt Nam, dạng YYYY-MM-DD. */
function homNayVN(luc) {
    const d = new Date(Number(luc) || Date.now());
    // en-CA cho ra sẵn YYYY-MM-DD, khỏi tự ghép chuỗi rồi lệch số 0 đứng đầu.
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d);
}

/**
 * Địa chỉ đầy đủ để hỏi số dư.
 *
 * `loai=tuy_chon` + hai đầu ngày — đúng cách trang Kế toán gọi khi người dùng
 * chọn "Tùy chọn". Không có mã kỳ nào nghĩa là "tất cả", nên phải nói bằng
 * khoảng ngày.
 */
function taoDuong(sellUrl, tuNgay, denNgay) {
    const goc = chuoi(sellUrl).trim().replace(/\/+$/, '');
    return goc + DUONG
        + '?loai=tuy_chon&tu_ngay=' + encodeURIComponent(tuNgay)
        + '&den_ngay=' + encodeURIComponent(denNgay);
}

/**
 * Đọc trả lời của Sell thành bảng `mã khách -> số dư`.
 *
 * ⚠️ GHÉP THEO MÃ KHÁCH HÀNG, không theo tên. Tên đổi được, và trong dữ liệu
 * thật có những tên hiện sai dấu ("ki?n", "ti?n") — ghép theo tên là ghép nhầm.
 *
 * ⚠️ Khách nào KHÔNG có mã thì bỏ hẳn khỏi bảng, để tầng trên thấy "không có
 * số dư" và DỪNG, chứ không lặng lẽ coi là 0.
 */
function docTraLoi(d) {
    const ra = new Map();
    const khach = (d && Array.isArray(d.khach)) ? d.khach : [];
    const du = (d && d.chua_xuat) ? d.chua_xuat : {};
    for (const k of khach) {
        const ma = chuoi(k && k.ma_khach_hang).trim();
        if (!ma) continue;
        const id = k && k.khach_hang_id;
        if (!(String(id) in du) && !(id in du)) continue;
        const so = Number(du[id] != null ? du[id] : du[String(id)]);
        if (!Number.isFinite(so)) continue;
        ra.set(ma, so);
    }
    return ra;
}

/**
 * HỎI SỐ DƯ.
 *
 * @returns {Promise<{ok:boolean, ma:string, soDu:Map<string,number>,
 *                    ngay:{tu:string,den:string}, thongBao:string}>}
 */
async function docSoDu({ caiDat, layFetch, nghi, luc } = {}) {
    const c = caiDat || {};
    const rong = new Map();
    const hong = (ma, thongBao) => ({ ok: false, ma, soDu: rong, ngay: null, thongBao });

    const sellUrl = chuoi(c.sellUrl).trim();
    const token = chuoi(c.sellToken).trim();
    if (!sellUrl || !token) {
        return hong('CHUA_KHAI_BAO',
            'Chưa khai địa chỉ Sell hoặc token ở màn 🔑, nên không đọc được số dư '
            + '"chưa xuất hóa đơn". Máy KHÔNG đoán trần — đoán sai là xuất vượt số.');
    }

    const tuNgay = chuoi((c.henGio || {}).soDuTuNgay).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tuNgay)) {
        return hong('THIEU_MOC_SO_DU',
            'Chưa đặt ô "Số dư tính từ ngày" trong bảng hẹn giờ. Số dư chưa xuất hóa đơn '
            + 'bên Sell CỘNG DỒN THEO KHOẢNG ĐANG XEM, nên thiếu mốc là ra sai trần. '
            + 'Máy KHÔNG tự chọn bừa một ngày.');
    }
    const denNgay = homNayVN(luc);

    const fetchDung = layFetch || (typeof fetch !== 'undefined' ? fetch : null);
    if (!fetchDung) return hong('KHONG_CO_FETCH', 'Không có fetch để gọi Sell.');
    const cho = nghi || (ms => new Promise(r => setTimeout(r, ms)));

    let tra = null;
    let loiMang = '';
    for (let lan = 0; lan < SO_LAN_THU_MANG; lan++) {
        try {
            tra = await fetchDung(taoDuong(sellUrl, tuNgay, denNgay), {
                method: 'GET',
                // ⚠️ ĐÚNG TIÊU ĐỀ MÀ SELL ĐỌC: middleware KiemTraApiHoaDon gọi
                // $request->bearerToken(), tức nó CHỈ nhìn "Authorization:
                // Bearer …". Bản đầu tôi tự bịa 'X-Extension-Token' — Sell
                // không đọc, thấy token rỗng, trả 403, và cả bốn khách hỏng ở
                // lượt 14:30 ngày 24/08/2026.
                //
                // Chép đúng dòng của docBangToken.js — đường token ấy đã chạy
                // tốt bấy lâu. Cạnh một mẫu đang chạy đúng thì đừng sáng tác.
                headers: { 'Accept': 'application/json', 'Authorization': 'Bearer ' + token },
            });
            loiMang = '';
            break;
        } catch (e) {
            // ⚠️ CHỈ thử lại khi fetch NÉM (mất mạng, DNS hỏng). Máy chủ trả lời
            // rõ ràng thì thôi — thử lại một câu từ chối chỉ tốn thời gian, và
            // lượt hẹn giờ đang có người chờ.
            loiMang = chuoi((e && e.message) || e);
            if (lan < SO_LAN_THU_MANG - 1) {
                await cho((NhipDo && NhipDo.NGHI_GIUA_LAN_TOKEN) || NGHI_GIUA_LAN_MS);
            }
        }
    }
    if (loiMang) {
        return hong('KHONG_GOI_DUOC',
            'Không gọi được Sell để đọc số dư (mất mạng?): ' + loiMang);
    }

    if (!tra || !tra.ok) {
        const ma = tra ? tra.status : 0;
        if (ma === 401 || ma === 403) {
            return hong('TOKEN_SAI',
                'Sell từ chối token khi đọc số dư (' + ma + '). Hãy kiểm lại token ở màn 🔑 '
                + 'và token phía máy chủ.');
        }
        return hong('SELL_TU_CHOI', 'Sell trả về ' + ma + ' khi đọc số dư.');
    }

    let d = null;
    try { d = await tra.json(); } catch (e) { d = null; }
    if (!d || d.thanh_cong !== true) {
        return hong('TRA_LOI_LA',
            'Sell trả lời không đúng dạng khi đọc số dư — có thể đường dẫn '
            + DUONG + ' chưa được mở bên Sell.');
    }

    const soDu = docTraLoi(d);
    if (!soDu.size) {
        return hong('KHONG_CO_KHACH_NAO',
            'Sell trả về bảng số dư rỗng. Hãy vào trang Kế toán tổng hợp, bấm '
            + '"Chọn khách hiển thị" và thêm khách cần xuất hóa đơn vào.');
    }
    return { ok: true, ma: 'OK', soDu, ngay: { tu: tuNgay, den: denNgay }, thongBao: '' };
}

const API = { docSoDu, taoDuong, docTraLoi, homNayVN, DUONG, SO_LAN_THU_MANG };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof globalThis !== 'undefined') globalThis.HDT_SoDuKeToan = API;

})();
