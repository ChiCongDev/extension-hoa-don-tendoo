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
 *  - trongLich  [{maKH, tenKH, soTienNgay?, kieu?}]  khách của mốc này
 *  - ghep       {chay:[{maKH,tenKH,soTien}], thieu:[{maKH,tenKH,lyDo}]} — từ ghepVoiBang
 * @returns {{chay:Array, thieu:Array, coAiDat:boolean}}
 *
 * ⚠️ TỪ 27/08/2026 CỜ `kieu` MỚI LÀ THỨ QUYẾT ĐỊNH, không phải sự có mặt của
 * `soTienNgay`. Hai lịch nay tách rời: cùng một khách có thể vừa nằm ở mốc này
 * với kiểu 'he_thong' (lấy doanh thu), vừa nằm ở mốc khác với kiểu 'tu_chon'
 * (lấy số đã đặt). Đoán qua `soTienNgay` như bản cũ là mục 'he_thong' của khách
 * ấy cũng bị thay bằng số đã đặt — mất hẳn lượt xuất theo doanh thu.
 */
function apDung({ trongLich, ghep } = {}) {
    const g = ghep || { chay: [], thieu: [] };
    const ds = Array.isArray(trongLich) ? trongLich : [];
    const dat = new Map();
    for (const k of ds) {
        // Không có cờ `kieu` -> gói dựng theo kiểu cũ, giữ nếp cũ: có tiền là
        // xuất theo tiền. Có cờ thì CHỈ mục 'tu_chon' mới lấy số đã đặt.
        if (k && 'kieu' in k && chuoi(k.kieu) !== 'tu_chon') continue;
        const so = Number(k && k.soTienNgay);
        if (Number.isFinite(so) && so > 0) dat.set(chuoi(k.maKH), { so, cuoi: !!k.ngayCuoi });
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

    // ⚠️ CÙNG MỘT KHÁCH CÓ THỂ CÓ CẢ HAI MỤC TRONG MỘT MỐC — khi người dùng đặt
    // giờ hệ thống và giờ tiền/ngày TRÙNG NHAU. Lúc đó lọc theo MÃ KHÁCH là vứt
    // luôn mục hệ thống: khách ra đúng một tờ tiền/ngày, còn tờ theo doanh thu
    // biến mất không một lời nào. `gomTheoMoc` đã giữ đúng cả hai mục rồi, hỏng
    // đúng ở đây.
    //
    // Có cờ `kieu` thì mỗi mục tự lo phần của mình: mục hệ thống giữ nguyên
    // doanh thu, mục tự chọn được dựng lại từ số đã đặt ở vòng dưới.
    const coCoKieu = ds.some(k => k && 'kieu' in k)
        || [...(g.chay || []), ...(g.thieu || [])].some(x => x && 'kieu' in x);
    if (coCoKieu) {
        for (const x of g.chay || []) if (chuoi(x.kieu) !== 'tu_chon') chay.push(x);
        for (const x of g.thieu || []) if (chuoi(x.kieu) !== 'tu_chon') thieu.push(x);
    } else {
        // Gói dựng tay kiểu cũ: giữ nguyên nếp cũ, lọc theo mã khách.
        for (const x of g.chay || []) if (!dat.has(chuoi(x.maKH))) chay.push(x);
        for (const x of g.thieu || []) if (!dat.has(chuoi(x.maKH))) thieu.push(x);
    }

    for (const [ma, o] of dat) {
        const soDat = o.so;
        // ⚠️ CHẠY KỂ CẢ KHI HÔM NAY KHÔNG CÓ DOANH THU. Cả điểm của tính năng là
        // xuất cho phần doanh số NHỮNG NGÀY CŨ còn nợ hóa đơn; giữ luật "không
        // doanh thu thì bỏ qua" ở đây là vô hiệu hóa nó.
        chay.push({ maKH: ma, tenKH: tenCua.get(ma) || ma, soTien: soDat, soTienDat: soDat,
                    ...(o.cuoi ? { ngayCuoiTuChon: true } : {}) });
    }

    return { chay, thieu, coAiDat: true };
}

/** Có mục nào trong mốc này xuất theo số đã đặt không. */
function coKhachDatSo(trongLich) {
    return (Array.isArray(trongLich) ? trongLich : []).some((k) => {
        if (k && 'kieu' in k && chuoi(k.kieu) !== 'tu_chon') return false;
        const so = Number(k && k.soTienNgay);
        return Number.isFinite(so) && so > 0;
    });
}

/**
 * Mốc này CHỈ toàn mục 'tu_chon' -> KHÔNG cần đọc bảng doanh thu bên Sell.
 *
 * ⚠️ Đây là chỗ sửa một cái hỏng có thật: tiến trình nền đọc bảng TRƯỚC, đọc
 * không được thì bỏ cả lượt. Nhưng lượt tự chọn không dùng một con số nào của
 * bảng — bỏ nó vì bảng hỏng là mất hóa đơn hoàn toàn vô cớ.
 */
function mocThuanTuChon(trongLich) {
    const ds = Array.isArray(trongLich) ? trongLich : [];
    if (!ds.length) return false;
    return ds.every(k => k && chuoi(k.kieu) === 'tu_chon');
}

const API = { apDung, coKhachDatSo, mocThuanTuChon };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof globalThis !== 'undefined') globalThis.HDT_ApDungSoDat = API;

})();
