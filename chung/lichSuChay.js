'use strict';

// ============================================================================
//  LỊCH SỬ CHẠY — khách nào thành công, khách nào không, và VÌ SAO.
//
//  ⚠️ VÌ SAO PHẢI CÓ FILE NÀY
//  Trước đây kết quả hẹn giờ ghi vào ĐÚNG MỘT Ô, lần sau đè lần trước. Máy chạy
//  lúc không có ai ngồi xem, nên đè xong là mất sạch dấu vết — có hỏng cũng
//  không ai biết đã hỏng ở khách nào.
//
//  ⚠️ "XONG" KHÔNG ĐỒNG NGHĨA VỚI "ĐÃ RA HÓA ĐƠN"
//  Công tắc tự bấm tắt thì máy chỉ bỏ hàng vào giỏ rồi dừng — vẫn tính là xong
//  việc của nó, nhưng CHƯA có hóa đơn nào. Đã có lần báo "Xong 2 khách" trong
//  khi chỉ có 1 hóa đơn. Ở đây tách hẳn hai trạng thái đó.
// ============================================================================

(function () {

const GIOI_HAN_MAC_DINH = 60;
const KHOA = 'hdt-lich-su-chay';

const KET = {
    RA_HOA_DON: 'RA_HOA_DON',   // đã phát hành thật
    VAO_GIO: 'VAO_GIO',         // đã bỏ vào giỏ, CHƯA phát hành
    BO_QUA: 'BO_QUA',           // không có gì để xuất (không phải lỗi)
    LOI: 'LOI',
    TREO: 'TREO',               // không biết hóa đơn đã ra hay chưa
    CHUA_CHAY: 'CHUA_CHAY',     // loạt dừng trước khi tới khách này
};

const NHAN = {
    RA_HOA_DON: 'Đã ra hóa đơn',
    VAO_GIO: 'Đã vào giỏ, CHƯA phát hành',
    BO_QUA: 'Bỏ qua',
    LOI: 'Lỗi',
    TREO: 'TREO — chưa rõ đã ra hóa đơn chưa',
    CHUA_CHAY: 'Chưa chạy tới',
};

const NGUON = { HEN_GIO: 'HEN_GIO', TAY: 'TAY', THU: 'THU' };

const chuoi = (v) => String(v == null ? '' : v);

/**
 * Dựng một bản ghi lịch sử từ kết quả một lần chạy.
 *
 * @param {object} d
 *  - nguon      HEN_GIO | TAY | THU
 *  - moc        mốc giờ đã hẹn (nếu là hẹn giờ)
 *  - ngay       { tu, den } khoảng ngày ĐÃ KIỂM CHỨNG của bảng
 *  - chay       có thật sự bắt tay vào làm không
 *  - lyDo/thongBao  vì sao không chạy (nếu không chạy)
 *  - trongLich  danh sách khách trong lịch  [{maKH, tenKH}]
 *  - thieu      khách bị bỏ qua            [{maKH, tenKH, lyDo}]
 *  - ketQua     kết quả từ hàng đợi        { xong[], loi[], treo[], bo, dung, ly_do }
 */
function taoBanGhi(d = {}) {
    const kq = d.ketQua || {};
    const theoMa = new Map();

    const ghi = (maKH, o) => {
        const ma = chuoi(maKH).trim();
        if (!ma) return;
        theoMa.set(ma, { maKH: ma, ...(theoMa.get(ma) || {}), ...o });
    };

    // 1. Khởi tạo mọi khách trong lịch là "chưa chạy tới". Loạt dừng giữa chừng
    //    thì những khách phía sau phải hiện ra, chứ không được biến mất im lặng.
    for (const k of d.trongLich || []) {
        ghi(k.maKH, { tenKH: chuoi(k.tenKH), ket: KET.CHUA_CHAY, chiTiet: '' });
    }

    // 2. Bỏ qua — KHÔNG phải lỗi.
    for (const k of d.thieu || []) {
        ghi(k.maKH, { tenKH: chuoi(k.tenKH), ket: KET.BO_QUA, chiTiet: chuoi(k.lyDo) });
    }

    // 3. Xong — nhưng phải tách "đã phát hành" với "mới vào giỏ".
    for (const l of kq.xong || []) {
        const r = l.ketQua || {};
        ghi(l.maKH, {
            maLenh: chuoi(l.id),
            tenKH: chuoi(l.tenKH),
            soTien: Number(l.soTien) || 0,
            // SỐ NGƯỜI DÙNG TỰ ĐẶT trong ô "tiền/ngày", 0 nếu không đặt. Bản ghi
            // là nguồn DUY NHẤT của đường "gửi lại ở cuối loạt"; không mang theo
            // thì đường ấy không biết đây là tờ tự chọn hay theo hệ thống, và
            // Sell xếp nhầm cột.
            soTienDat: Number(l.soTienDat) || 0,
            ket: r.daBamThanhToan ? KET.RA_HOA_DON : KET.VAO_GIO,
            tongTendoo: r.tong == null ? null : Number(r.tong),
            lech: r.lech == null ? null : Number(r.lech),
            daBoQuaThue: !!r.daBoQuaThue,
            chiTiet: r.daBamThanhToan ? '' : 'Công tắc tự bấm đang tắt nên máy dừng ở giỏ hàng.',
        });
    }

    // 4. Lỗi.
    for (const l of kq.loi || []) {
        ghi(l.maKH, {
            maLenh: chuoi(l.id),
            tenKH: chuoi(l.tenKH), soTien: Number(l.soTien) || 0,
            soTienDat: Number(l.soTienDat) || 0,
            ket: KET.LOI, maLoi: chuoi(l.maLoi), chiTiet: chuoi(l.thongBao),
        });
    }

    // 5. Treo — ghi SAU CÙNG để đè lên mọi trạng thái khác: đây là thứ nguy hiểm
    //    nhất, không được để nó bị lấp bởi một dòng "xong" nào đó.
    for (const l of kq.treo || []) {
        ghi(l.maKH, {
            maLenh: chuoi(l.id),
            tenKH: chuoi(l.tenKH), soTien: Number(l.soTien) || 0,
            soTienDat: Number(l.soTienDat) || 0,
            ket: KET.TREO, chiTiet: chuoi(l.thongBao),
        });
    }

    const khach = [...theoMa.values()];
    const dem = {
        raHoaDon: khach.filter(k => k.ket === KET.RA_HOA_DON).length,
        vaoGio: khach.filter(k => k.ket === KET.VAO_GIO).length,
        boQua: khach.filter(k => k.ket === KET.BO_QUA).length,
        loi: khach.filter(k => k.ket === KET.LOI).length,
        treo: khach.filter(k => k.ket === KET.TREO).length,
        chuaChay: khach.filter(k => k.ket === KET.CHUA_CHAY).length,
    };

    return {
        luc: d.luc || Date.now(),
        // ⚠️ SỐ HIỆU BẢN ĐANG CHẠY. Ngày 22/08/2026 tôi vá bốn đợt trong một
        // ngày, rồi đọc log lượt 22:33 mà KHÔNG xác định nổi nó chạy 2.21.0,
        // 2.22.0 hay 2.23.0 — trong khi điều đó đổi hẳn cách luận bệnh. Đoán
        // "lúc ấy máy chạy mã nào" là đoán cả nền móng của mọi kết luận sau đó.
        banExt: chuoi(d.banExt),
        nguon: d.nguon || NGUON.HEN_GIO,
        moc: chuoi(d.moc),
        ngay: d.ngay || null,
        chay: !!d.chay,
        lyDo: chuoi(d.lyDo),
        thongBao: chuoi(d.thongBao),
        khach, dem,
    };
}

/**
 * LƯỢT NÀY CÓ THẬT SỰ BẮT TAY VÀO LÀM KHÔNG?
 *
 * ⚠️ VÌ SAO PHẢI GOM VÀO ĐÂY. Lối hẹn giờ từng đóng đinh `chay: true` rồi vứt
 * luôn `ly_do`/`thongBao` của hàng đợi. Hậu quả ngày 22/08/2026, mốc 14:41:
 * cầu nối bỏ cuộc ở TẦNG LƯỢT (giỏ còn sót hàng, chưa đụng tới khách nào),
 * nhưng bản ghi vẫn khai là "đã chạy". Bảng lịch sử hiện trơ "1 chưa chạy tới"
 * KHÔNG kèm một chữ lý do, và `baoLuot()` có cửa `if (b.chay !== false) return`
 * nên Telegram im lặng nốt. Cả lượt hỏng mà người dùng không nhận được gì.
 *
 * ⚠️ ĐẾM CẢ `loi` VÀ `treo`, KHÔNG CHỈ `xong`. Lượt làm được một khách rồi mới
 * dừng thì vẫn là CÓ chạy: khách ấy đã có tin Telegram riêng, bắn thêm tin "cả
 * lượt KHÔNG chạy" là báo sai. Lối chạy tay trước đây chỉ đếm `xong` nên dính
 * đúng chỗ này — giờ hai lối dùng chung một luật.
 *
 * ⚠️ KHÔNG CÓ KẾT QUẢ -> COI LÀ KHÔNG CHẠY. Hàng đợi luôn trả về một đối tượng;
 * không có nghĩa là có chuyện bất thường, mà bất thường thì phải KÊU chứ không
 * được lặng lẽ khai là đã chạy.
 */
function daChay(ketQua) {
    // ⚠️ Mảng cũng là object. Một cái mảng lọt vào đây sẽ không có `dung`, và
    // `!undefined` là true -> khai bừa là ĐÃ CHẠY. Đúng kiểu im lặng đang sửa.
    if (!ketQua || typeof ketQua !== 'object' || Array.isArray(ketQua)) return false;
    const dem = (t) => (Array.isArray(ketQua[t]) ? ketQua[t].length : 0);
    if (dem('xong') + dem('loi') + dem('treo') > 0) return true;
    return !ketQua.dung;
}

/**
 * Thêm bản ghi vào lịch sử, mới nhất lên đầu, cắt bớt phần quá cũ.
 * Cắt bớt là bắt buộc: chrome.storage.local có hạn, phình ra thì hỏng cả kho.
 */
function themVao(dsCu, banGhi, gioiHan = GIOI_HAN_MAC_DINH) {
    const ds = Array.isArray(dsCu) ? dsCu : [];
    return [banGhi, ...ds].slice(0, Math.max(1, gioiHan));
}

/** Một dòng tóm tắt cho người đọc, không cần mở chi tiết. */
function tomTat(b) {
    if (!b) return '';
    if (!b.chay) return `KHÔNG chạy — ${b.thongBao || b.lyDo || 'không rõ lý do'}`;
    const p = [];
    if (b.dem.raHoaDon) p.push(`${b.dem.raHoaDon} ra hóa đơn`);
    if (b.dem.vaoGio) p.push(`${b.dem.vaoGio} mới vào giỏ`);
    if (b.dem.loi) p.push(`${b.dem.loi} lỗi`);
    if (b.dem.treo) p.push(`${b.dem.treo} TREO`);
    if (b.dem.boQua) p.push(`${b.dem.boQua} bỏ qua`);
    if (b.dem.chuaChay) p.push(`${b.dem.chuaChay} chưa chạy tới`);
    return p.length ? p.join(' · ') : 'không có khách nào';
}

const API = { taoBanGhi, themVao, tomTat, daChay, KET, NHAN, NGUON, KHOA, GIOI_HAN_MAC_DINH };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof globalThis !== 'undefined') globalThis.HDT_LichSuChay = API;

})();
