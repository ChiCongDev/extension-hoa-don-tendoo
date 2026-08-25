'use strict';

// ============================================================================
//  ÁP SỐ TIỀN NGƯỜI DÙNG TỰ ĐẶT — quyết định cuối cùng "khách này xuất bao nhiêu".
//
//  LUẬT (chủ dự án chốt 25/08/2026):
//    · KHÔNG đặt số -> giữ NGUYÊN kết quả cũ, kể cả bị bỏ qua vì không doanh thu
//    · CÓ đặt số    -> xuất ĐÚNG con số ấy, KHÔNG so với bất cứ dữ liệu nào, và
//                      CHẠY KỂ CẢ khi hôm nay không phát sinh doanh thu
//
//  ── VÌ SAO KHÔNG CÒN TRẦN THEO SỐ DƯ ──────────────────────────────────────
//  Bản 24/08 có trần: không bao giờ xuất quá "tiền chưa xuất hóa đơn" của khách,
//  đọc từ trang Kế toán tổng hợp bên Sell. Chủ dự án bỏ hẳn phần ấy ngày
//  25/08/2026 — muốn con số gõ vào là con số cuối cùng, không phụ thuộc gì.
//
//  ⚠️ GHI RA CHO NGƯỜI ĐỌC SAU BIẾT: từ đây KHÔNG còn gì canh việc xuất vượt
//  phần doanh số còn nợ hóa đơn. Đó là quyết định của người nắm sổ sách, không
//  phải một chốt bị quên. Muốn bật lại thì cơ chế vẫn còn nguyên:
//  ghepTien.ghepSanPham({ tranTuyetDoi }) và đường truyền qua chiaHoaDon →
//  nhanLenh vẫn đủ bài kiểm.
//
//  ⚠️ HÀM THUẦN. Không mạng, không `chrome`, không đồng hồ. Nó quyết định con số
//  đi thẳng vào hóa đơn thuế, nên phải kiểm được từng luật một mà không cần
//  dựng nguyên một lượt chạy.
// ============================================================================

(function () {

const chuoi = (v) => String(v == null ? '' : v);

/**
 * @param {object} d
 *  - trongLich  [{maKH, tenKH, soTienNgay?}]  khách của mốc này
 *  - ghep       {chay:[{maKH,tenKH,soTien}], thieu:[{maKH,tenKH,lyDo}]} — từ ghepVoiBang
 * @returns {{chay:Array, thieu:Array, coAiDat:boolean}}
 */
function apDung({ trongLich, ghep } = {}) {
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
    if (!dat.size) return { chay: g.chay || [], thieu: g.thieu || [], coAiDat: false };

    const tenCua = new Map(ds.map(k => [chuoi(k.maKH), chuoi(k.tenKH)]));
    for (const x of [...(g.chay || []), ...(g.thieu || [])]) {
        if (chuoi(x.tenKH)) tenCua.set(chuoi(x.maKH), chuoi(x.tenKH));
    }

    const chay = [];
    const thieu = [];

    // Khách KHÔNG đặt số: bê nguyên xi kết quả cũ sang, không xét lại gì.
    for (const x of g.chay || []) if (!dat.has(chuoi(x.maKH))) chay.push(x);
    for (const x of g.thieu || []) if (!dat.has(chuoi(x.maKH))) thieu.push(x);

    for (const [ma, soDat] of dat) {
        // ⚠️ CHẠY KỂ CẢ KHI HÔM NAY KHÔNG CÓ DOANH THU. Cả điểm của tính năng là
        // xuất cho phần doanh số NHỮNG NGÀY CŨ còn nợ hóa đơn; giữ luật "không
        // doanh thu thì bỏ qua" ở đây là vô hiệu hóa nó.
        chay.push({ maKH: ma, tenKH: tenCua.get(ma) || ma, soTien: soDat, soTienDat: soDat });
    }

    return { chay, thieu, coAiDat: true };
}

/** Có khách nào trong mốc này đặt số không. */
function coKhachDatSo(trongLich) {
    return (Array.isArray(trongLich) ? trongLich : []).some((k) => {
        const so = Number(k && k.soTienNgay);
        return Number.isFinite(so) && so > 0;
    });
}

const API = { apDung, coKhachDatSo };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof globalThis !== 'undefined') globalThis.HDT_ApDungSoDat = API;

})();
