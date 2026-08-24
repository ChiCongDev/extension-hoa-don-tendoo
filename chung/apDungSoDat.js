'use strict';

// ============================================================================
//  ÁP SỐ TIỀN NGƯỜI DÙNG TỰ ĐẶT — quyết định cuối cùng "khách này xuất bao nhiêu".
//
//  ⚠️ HÀM THUẦN. Không mạng, không `chrome`, không đồng hồ. Nó quyết định con số
//  đi thẳng vào hóa đơn thuế, nên phải kiểm được từng luật một mà không cần
//  dựng nguyên một lượt chạy.
//
//  LUẬT:
//    · KHÔNG đặt số  -> giữ NGUYÊN kết quả cũ (kể cả bị bỏ qua vì không doanh thu)
//    · CÓ đặt số     -> soTien = min(số đặt, số dư), và CHẠY KỂ CẢ khi hôm nay
//                       không phát sinh doanh thu — vì đang xuất cho phần doanh
//                       số những NGÀY CŨ còn nợ hóa đơn
//    · dư <= 0       -> BỎ QUA, không phải lỗi
//    · không có dư   -> DỪNG. Không có trần thì không được xuất một đồng nào
// ============================================================================

(function () {

const chuoi = (v) => String(v == null ? '' : v);
const tienChu = (n) => Number(n).toLocaleString('vi-VN');

/**
 * @param {object} d
 *  - trongLich  [{maKH, tenKH, soTienNgay?}]  khách của mốc này
 *  - ghep       {chay:[{maKH,tenKH,soTien}], thieu:[{maKH,tenKH,lyDo}]} — từ ghepVoiBang
 *  - soDu       Map<maKH, number> | null      null = CHƯA đọc được
 *  - loiSoDu    câu giải thích vì sao không đọc được (nếu soDu null)
 * @returns {{chay:Array, thieu:Array, loi:Array, coAiDat:boolean}}
 */
function apDung({ trongLich, ghep, soDu, loiSoDu } = {}) {
    const g = ghep || { chay: [], thieu: [] };
    const ds = Array.isArray(trongLich) ? trongLich : [];
    const dat = new Map();
    for (const k of ds) {
        const so = Number(k && k.soTienNgay);
        if (Number.isFinite(so) && so > 0) dat.set(chuoi(k.maKH), so);
    }
    // Không ai đặt số -> KHÔNG ĐỤNG GÌ HẾT. Đây là lời hứa quan trọng nhất của
    // cả tính năng: khách để trống ô phải chạy đúng nếp cũ, không thêm một điều
    // kiện nào, không thêm một cách hỏng nào.
    if (!dat.size) return { chay: g.chay || [], thieu: g.thieu || [], loi: [], coAiDat: false };

    const tenCua = new Map(ds.map(k => [chuoi(k.maKH), chuoi(k.tenKH)]));
    for (const x of [...(g.chay || []), ...(g.thieu || [])]) {
        if (chuoi(x.tenKH)) tenCua.set(chuoi(x.maKH), chuoi(x.tenKH));
    }

    const chay = [];
    const thieu = [];
    const loi = [];

    // Khách KHÔNG đặt số: bê nguyên xi kết quả cũ sang, không xét lại gì.
    for (const x of g.chay || []) if (!dat.has(chuoi(x.maKH))) chay.push(x);
    for (const x of g.thieu || []) if (!dat.has(chuoi(x.maKH))) thieu.push(x);

    for (const [ma, soDat] of dat) {
        const ten = tenCua.get(ma) || ma;
        if (!soDu) {
            loi.push({ maKH: ma, tenKH: ten,
                thongBao: 'Đặt xuất ' + tienChu(soDat) + 'đ/ngày nhưng KHÔNG đọc được số dư '
                    + 'chưa xuất hóa đơn' + (chuoi(loiSoDu) ? ': ' + chuoi(loiSoDu) : '')
                    + '. Máy KHÔNG xuất khi chưa biết trần.' });
            continue;
        }
        if (!soDu.has(ma)) {
            loi.push({ maKH: ma, tenKH: ten,
                thongBao: 'Đặt xuất ' + tienChu(soDat) + 'đ/ngày nhưng khách này KHÔNG có '
                    + 'trong bảng Kế toán tổng hợp nên không có số dư. Vào trang Kế toán, bấm '
                    + '"Chọn khách hiển thị" rồi thêm khách vào. Máy KHÔNG xuất khi chưa biết trần.' });
            continue;
        }
        const du = Number(soDu.get(ma));
        if (!Number.isFinite(du)) {
            loi.push({ maKH: ma, tenKH: ten,
                thongBao: 'Số dư chưa xuất hóa đơn của khách này đọc ra không phải một con số. '
                    + 'Máy KHÔNG xuất khi chưa biết trần.' });
            continue;
        }
        if (du <= 0) {
            // KHÔNG phải lỗi: đã xuất hết phần còn nợ, hoặc đã xuất vượt từ trước.
            thieu.push({ maKH: ma, tenKH: ten,
                lyDo: 'số dư chưa xuất hóa đơn không đủ (còn ' + tienChu(du) + 'đ)' });
            continue;
        }
        // ⚠️ min() chứ không phải số đặt. Trần là TUYỆT ĐỐI: dư ít hơn số đặt
        // thì xuất nốt phần còn lại, không bao giờ vượt.
        chay.push({ maKH: ma, tenKH: ten, soTien: Math.min(soDat, du),
                    soTienDat: soDat, soDu: du });
    }

    return { chay, thieu, loi, coAiDat: true };
}

/** Có khách nào trong mốc này đặt số không — để khỏi gọi Sell khi không cần. */
function coKhachDatSo(trongLich) {
    return (Array.isArray(trongLich) ? trongLich : []).some((k) => {
        const so = Number(k && k.soTienNgay);
        return Number.isFinite(so) && so > 0;
    });
}

/**
 * TRỪ NHỮNG TỜ ĐÃ PHÁT HÀNH MÀ CHƯA ĐẨY ĐƯỢC VỀ SELL.
 *
 * ⚠️ Số dư Sell trả về chỉ phản ánh những dòng ĐÃ TỚI NƠI. Extension có hàng
 * chờ: tờ đã ra thật nhưng chưa đẩy được (mất mạng, Sell từ chối, phiên hết
 * hạn). Không trừ chúng ra thì số dư trông TO HƠN THẬT, và lượt này xuất vượt
 * đúng bằng phần đang kẹt trong hàng chờ.
 *
 * Chỉ trừ dòng RA_HOA_DON — dòng "mới vào giỏ" thì chưa có hóa đơn nào cả.
 */
function truHangCho(soDu, hangCho) {
    if (!soDu) return soDu;
    const ra = new Map(soDu);
    for (const d of (Array.isArray(hangCho) ? hangCho : [])) {
        if (!d || chuoi(d.ket_qua) !== 'RA_HOA_DON') continue;
        const ma = chuoi(d.ma_khach_hang).trim();
        if (!ma || !ra.has(ma)) continue;
        const tien = Number(d.so_tien);
        if (!Number.isFinite(tien) || tien <= 0) continue;
        ra.set(ma, ra.get(ma) - tien);
    }
    return ra;
}

const API = { apDung, coKhachDatSo, truHangCho };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof globalThis !== 'undefined') globalThis.HDT_ApDungSoDat = API;

})();
