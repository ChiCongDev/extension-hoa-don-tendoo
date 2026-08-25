'use strict';

// ⚠️ TOÀN BỘ FILE NẰM TRONG MỘT PHẠM VI RIÊNG (hàm bọc ngoài).
// Chrome nạp nhiều file vào CÙNG MỘT phạm vi — hai file cùng khai `const API`
// là file thứ hai nổ ngay khi nạp, mà KHÔNG có lỗi nào hiện ra cho người dùng.

(function () {

// ============================================================================
//  LẬP KẾ HOẠCH CHIA HÓA ĐƠN — ghép MỘT LẦN, rồi chia thành nhiều rổ.
//
//  Hàm này THUẦN TÍNH TOÁN: không đụng DOM, không gọi mạng, không đụng Tendoo.
//  Nhờ vậy test được bằng Node ngoài Chrome, và không thể gây tác dụng phụ.
//
//  ⚠️ VÌ SAO KHÔNG CẮT TỪNG KHÚC RỒI GHÉP RIÊNG TỪNG KHÚC (bản 2026-08-18 cũ).
//  Cách ấy gọi ghepSanPham SÁU LẦN cho một khách — sáu cơ hội hỏng, và hỏng ở
//  lần thứ năm thì bốn hóa đơn đã ra, KHÔNG RÚT LẠI ĐƯỢC. Tệ hơn: khúc cuối ôm
//  phần lẻ, rất dễ rơi vào mức không ghép nổi (còn 120.000 mà hàng rẻ nhất
//  490.000) — hỏng vì CHÍNH CÁCH CHIA, không phải vì kho hay vì mạng.
//
//  Nay: ghép MỘT LẦN cho cả doanh thu (đúng như hồi chưa hề chẻ nhỏ, nên độ
//  chính xác y hệt), rồi chia số hàng ấy vào từng rổ. Chia rổ là phép cộng
//  thuần túy — không có gì để hỏng. Một cơ hội hỏng thay vì sáu.
//
//  ⚠️ ĐÚNG TRƯỚC, ĐA DẠNG SAU — luật không được đảo.
//  Muốn các rổ khác nhau thì hạ trần số lượng mỗi mặt hàng, ép hàm ghép dàn ra
//  nhiều loại. Nhưng lấy mức trần ĐẦU TIÊN chạy được là sai: đo thật ngày
//  2026-08-18 trên bảng giá Tendoo của chủ dự án, doanh thu 9.361.884 lệch
//  -181.884 (trong dung sai, nhưng tệ gần 100 lần mức cần thiết). Phải chạy
//  KHÔNG hạn chế trước để biết độ lệch TỐT NHẤT, rồi chỉ nhận mức trần nào cho
//  ra ĐÚNG độ lệch ấy. Sau khi sửa: về lại -1.884.
// ============================================================================

const GhepTien = (typeof module !== 'undefined' && module.exports)
    ? require('./ghepTien') : globalThis.HDT_GhepTien;

const KET_QUA = {
    OK: 'OK',
    THIEU_THAM_SO: 'THIEU_THAM_SO',
    // Mọi mặt hàng đều đắt hơn trần -> không rổ nào chứa nổi dù chỉ một cái.
    HANG_DAT_HON_TRAN: 'HANG_DAT_HON_TRAN',
};

// Các mức trần số lượng sẽ thử, từ dàn nhất tới gom nhất. Dừng ngay ở mức đầu
// tiên giữ được độ lệch tốt nhất, nên danh sách dài không làm chậm đường thuận.
const CAC_MUC_DAN = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32];

/**
 * @param {object} ts
 * @param {Array<{ma:string, ten?:string, gia:number, ton:number}>} ts.sanPham
 * @param {number} ts.soTien   doanh thu cần ra hóa đơn
 * @param {number} ts.tran     trần MỖI hóa đơn; <= 0 nghĩa là không chia nhỏ
 * @param {number} [ts.dungSai]
 * @param {boolean} [ts.uuTienKhacNhau=true]  ép các rổ khác tổ hợp nhau
 * @returns {{ma:string, tong?:number, lech?:number, ro?:Array, soRo?:number,
 *            soToHopKhacNhau?:number, tranSoLuong?:number, thongBao?:string}}
 */
function lapKeHoach({ sanPham, soTien, tran, dungSai, uuTienKhacNhau = true,
                      tranTuyetDoi = null }) {
    if (!Array.isArray(sanPham) || !Number.isFinite(Number(soTien)) || Number(soTien) <= 0) {
        return { ma: KET_QUA.THIEU_THAM_SO, thongBao: 'Thiếu danh sách hàng hoặc số tiền không hợp lệ' };
    }
    // ⚠️ `tranTuyetDoi` KHÁC HẲN `tran`. `tran` là trần MỖI TỜ (chẻ nhỏ hóa
    // đơn); `tranTuyetDoi` là mức mà TỔNG tiền ghép ra không bao giờ được vượt —
    // dùng cho tính năng tự đặt số tiền, nơi trần chính là số dư chưa xuất hóa
    // đơn còn lại. Lẫn hai thứ này là xuất vượt số dư. Xem ghepTien.ghepSanPham.
    const tuyChonGhep = {
        ...(dungSai != null ? { dungSai: Number(dungSai) } : {}),
        ...(Number(tranTuyetDoi) > 0 ? { tranTuyetDoi: Number(tranTuyetDoi) } : {}),
    };
    const tranRo = Number(tran) > 0 ? Math.round(Number(tran)) : 0;

    // ── Loại hàng ĐẮT HƠN TRẦN ──────────────────────────────────────────────
    // Một cái đã vượt trần thì không rổ nào chứa nổi. Phải loại TRƯỚC khi ghép,
    // nếu không hàm ghép sẽ chọn nó rồi tới lúc chia rổ mới phát hiện — mà lúc
    // ấy đã muộn: hoặc phải bỏ cả kế hoạch, hoặc phải xuất một tờ vượt trần.
    const dungDuoc = tranRo > 0
        ? sanPham.filter((h) => Number(h.gia) > 0 && Number(h.gia) <= tranRo)
        : sanPham.slice();
    if (tranRo > 0 && dungDuoc.length === 0) {
        const reNhat = sanPham.reduce((m, h) => Math.min(m, Number(h.gia) || Infinity), Infinity);
        return {
            ma: KET_QUA.HANG_DAT_HON_TRAN,
            thongBao: `Mọi mặt hàng đều đắt hơn trần ${tien(tranRo)}đ mỗi hóa đơn `
                + `(rẻ nhất ${Number.isFinite(reNhat) ? tien(reNhat) : '?'}đ) — không chia được. `
                + 'Hãy nâng trần mỗi hóa đơn.',
        };
    }

    // ── Bước 1: ghép MỘT LẦN, không hạn chế -> biết độ lệch TỐT NHẤT ────────
    const goc = GhepTien.ghepSanPham({ sanPham: dungDuoc, soTien, ...tuyChonGhep });
    if (goc.ma !== 'OK') return goc;          // chuyển nguyên lỗi và lời nhắc lên
    const lechTot = Math.abs(goc.lech);

    // ── Bước 2: tìm mức DÀN NHẤT mà VẪN giữ đúng độ lệch ấy ─────────────────
    let chon = goc;
    let tranSoLuong = 0;                      // 0 = không hạn chế
    if (uuTienKhacNhau && tranRo > 0) {
        for (const muc of CAC_MUC_DAN) {
            const kho = dungDuoc.map((h) => ({ ...h, ton: Math.min(Number(h.ton), muc) }));
            const thu = GhepTien.ghepSanPham({ sanPham: kho, soTien, ...tuyChonGhep });
            // ⚠️ PHẢI BẰNG, không phải "trong dung sai". Nới ở đây là đánh đổi
            // độ chính xác lấy vẻ đa dạng — đúng cái bẫy đã đo được.
            if (thu.ma === 'OK' && Math.abs(thu.lech) === lechTot) {
                chon = thu;
                tranSoLuong = muc;
                break;
            }
        }
    }

    // ── Bước 3: chia rổ ─────────────────────────────────────────────────────
    const ro = tranRo > 0 ? xepRo(bungRa(chon.chon), tranRo) : [gopRo(bungRa(chon.chon))];
    const chuKy = new Set(ro.map(kyHieuRo));

    return {
        ma: KET_QUA.OK,
        tong: chon.tong,
        lech: chon.lech,
        soCai: chon.soCai,
        ro,
        soRo: ro.length,
        soToHopKhacNhau: chuKy.size,
        tranSoLuong,
    };
}

/** Bung {ma, soLuong} thành từng CÁI riêng — có tách ra mới xếp rổ được. */
function bungRa(chon) {
    const cai = [];
    for (const d of chon || []) {
        for (let i = 0; i < Number(d.soLuong); i++) {
            cai.push({ ma: d.ma, ten: d.ten, gia: Number(d.gia) });
        }
    }
    return cai;
}

/**
 * Xếp từng cái vào rổ, mỗi rổ không quá `tran`.
 *
 * Kiểu "cái đắt trước, bỏ vào rổ đầu tiên còn chỗ" (first-fit-decreasing).
 * Mọi cái đều đã được lọc để <= tran, nên phép xếp này KHÔNG BAO GIỜ hỏng:
 * cùng lắm là mở thêm một rổ mới. Đó chính là lý do đổi sang cách này.
 */
function xepRo(cai, tran) {
    const sap = [...cai].sort((a, b) => b.gia - a.gia || String(a.ma).localeCompare(String(b.ma)));
    const ro = [];
    for (const c of sap) {
        let vao = ro.find((r) => r.tong + c.gia <= tran);
        if (!vao) { vao = { tong: 0, cai: [] }; ro.push(vao); }
        vao.tong += c.gia;
        vao.cai.push(c);
    }
    return ro.map(gopRo);
}

/** Gộp các cái cùng mã trong một rổ thành dòng {ma, soLuong, thanhTien}. */
function gopRo(r) {
    const cac = Array.isArray(r) ? r : r.cai;
    const theoMa = new Map();
    let tong = 0;
    let soCai = 0;
    for (const c of cac) {
        tong += c.gia;
        soCai++;
        const cu = theoMa.get(c.ma);
        if (cu) { cu.soLuong++; cu.thanhTien += c.gia; }
        else theoMa.set(c.ma, { ma: c.ma, ten: c.ten, gia: c.gia, soLuong: 1, thanhTien: c.gia });
    }
    return { tong, soCai, chon: [...theoMa.values()] };
}

/**
 * Dấu hiệu nhận dạng một rổ, để đếm xem có bao nhiêu tổ hợp KHÁC NHAU.
 *
 * Chủ dự án chốt 2026-08-18: hai rổ coi là TRÙNG khi giống hệt CẢ danh sách mặt
 * hàng LẪN số lượng từng món. Đổi số lượng một món là đã tính là khác.
 */
function kyHieuRo(r) {
    return (r.chon || []).map((d) => `${d.ma}x${d.soLuong}`).sort().join('|');
}

const tien = (n) => Number(n || 0).toLocaleString('vi-VN');

const API = { lapKeHoach, xepRo, kyHieuRo, bungRa, KET_QUA, CAC_MUC_DAN };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof globalThis !== 'undefined') globalThis.HDT_ChiaHoaDon = API;

})();
