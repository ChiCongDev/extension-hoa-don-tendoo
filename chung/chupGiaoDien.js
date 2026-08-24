'use strict';

// ============================================================================
//  CHỤP GIAO DIỆN POS — bằng CHỮ, để còn sửa được khi Tendoo đổi giao diện.
//
//  ⚠️ VÌ SAO CÓ TỆP NÀY. Ngày 22/08/2026 Tendoo thay giao diện ngay trên
//  /sales/pos: chân giỏ mất sạch nhãn, thẻ hàng đổi chữ, nút ca đổi tên. Mọi
//  khách hỏng cùng một lúc.
//
//  Lúc ấy tôi không có cách nào nhìn thấy trang: nó là ứng dụng React nằm sau
//  đăng nhập, tải bằng lệnh chỉ được cái vỏ rỗng. Đã thử — Chrome không đầu
//  dựng được JS và mạng chạm được Tendoo, nhưng /sales/pos đá thẳng về trang
//  đăng nhập. Ba đường vượt qua đều đắt hơn thứ cần lấy:
//    · dùng mật khẩu Tendoo  -> không bao giờ
//    · chạy trên hồ sơ Chrome đang mở -> phải đóng Chrome, và phiên thứ hai có
//      thể đá văng phiên thật giữa lúc đang xuất hóa đơn
//    · sao chép hồ sơ Chrome -> bê theo toàn bộ cookie của người dùng
//
//  Trong khi extension ĐÃ Ở SẴN TRONG TRANG ẤY. Nó chạy trong Chrome của người
//  dùng, đã đăng nhập, đọc được toàn bộ DOM. Đáng lẽ phải nghĩ ra từ đầu.
//
//  ⛔ CHỈ ĐỌC. Không bấm gì, không điền gì, không phát hành gì. Nó là con mắt,
//  không phải bàn tay.
//
//  ⛔ KHÔNG CHÉP CẢ TRANG. Lưới sản phẩm có hàng trăm thẻ; chép hết thì vừa
//  nặng vừa không ai đọc nổi. Chỉ lấy đúng bốn mảnh cần cho việc sửa mã.
// ============================================================================

(function () {

/** Cắt bớt cho khỏi phình, và nói rõ đã cắt. */
function catBot(chu, tran) {
    const s = String(chu || '');
    return s.length <= tran ? s : s.slice(0, tran) + `\n… (đã cắt bớt ${s.length - tran} ký tự)`;
}

const gonChu = (e) => {
    try {
        const D = (typeof globalThis !== 'undefined' && globalThis.HDT_DomReact) || null;
        return D ? D.gonChu(e) : String((e && e.textContent) || '').replace(/\s+/g, ' ').trim();
    } catch (x) { return ''; }
};

/** Phần tử LÁ đầu tiên có chữ đúng bằng `chu`. */
function timLaTheoChu(tailieu, chu) {
    try {
        return [...tailieu.querySelectorAll('*')]
            .find(e => !e.children.length && gonChu(e) === chu) || null;
    } catch (e) { return null; }
}

/** Nút có chữ khớp mẫu, KHÔNG nằm trong bảng nổi. */
function timNutTheoMau(tailieu, mau) {
    try {
        return [...tailieu.querySelectorAll('button, [role=button], a')]
            .filter(b => !(b.closest && b.closest('.ant-modal, [role=dialog], .ant-drawer')))
            .find(b => mau.test(gonChu(b))) || null;
    } catch (e) { return null; }
}

/** Đi lên N tầng, dừng sớm nếu hết cha. */
function lenTang(e, n) {
    let x = e;
    for (let i = 0; i < n && x && x.parentElement; i++) x = x.parentElement;
    return x;
}

/**
 * Chụp bốn mảnh cần thiết, trả về MỘT chuỗi để dán thẳng vào chỗ trò chuyện.
 *
 * ⛔ KHÔNG BAO GIỜ NÉM. Mảnh nào đọc không được thì ghi "(không thấy)" rồi đi
 * tiếp — một mảnh hỏng không được làm mất ba mảnh còn lại.
 */
function chupGiaoDien(tailieu, tuyChon = {}) {
    // ⚠️ ĐỌC THAM SỐ Ở TRONG try. Bản đầu tôi đọc `tuyChon.tranMoiMang` NGAY
    // TRƯỚC khối try — một cái getter nổ ở đó là cả hàm ném ra ngoài, đúng cái
    // điều tệp này thề không bao giờ làm. Gài lỗi bỏ khối catch ngoài cùng thì
    // không bài nào đỏ, vì mọi bước bên trong đều tự bắt lỗi riêng: khối ấy
    // chưa từng được chạy tới.
    let tranMoiMang = 6000;
    const phan = [];
    const them = (ten, e) => {
        let html = '(không thấy)';
        try { if (e && e.outerHTML) html = catBot(e.outerHTML, tranMoiMang); } catch (x) { /* kệ */ }
        phan.push('===== ' + ten + ' =====\n' + html);
    };

    try {
        const t = Number(tuyChon && tuyChon.tranMoiMang);
        if (Number.isFinite(t) && t > 0) tranMoiMang = t;

        phan.push('# CHỤP GIAO DIỆN POS — ' + new Date().toISOString());
        try { phan.push('# địa chỉ: ' + String((tailieu.defaultView || {}).location || '')); }
        catch (e) { /* kệ */ }

        // 1. MỘT dòng giỏ — nơi đọc tên, giá bán, thành tiền, số lượng.
        let dongGio = null;
        try {
            const B = (typeof globalThis !== 'undefined' && globalThis.HDT_BoGio) || null;
            const cac = B ? B.docCacDongGio(tailieu) : [];
            dongGio = cac.length ? cac[0].khoi : null;
        } catch (e) { dongGio = null; }
        them('MOT DONG GIO', dongGio);

        // 2. Chân giỏ — nơi lẽ ra có tổng tiền. Neo vào nút "Lưu đơn" rồi lùi ba
        //    tầng: đó là chỗ Tendoo bày tổng và hai nút bấm.
        const luuDon = timNutTheoMau(tailieu, /lưu đơn/i);
        them('CHAN GIO (quanh nut Luu don)', luuDon ? lenTang(luuDon, 3) : null);

        // 3. Bảng gợi ý khi gõ tìm kiếm — khâu chọn mặt hàng, nguy hiểm nhất.
        let goiY = null;
        try {
            goiY = tailieu.querySelector('.ant-select-dropdown')
                || tailieu.querySelector('[class*=dropdown]');
        } catch (e) { goiY = null; }
        them('BANG GOI Y (go tim kiem truoc khi chup)', goiY);

        // 4. MỘT thẻ hàng trên lưới — đường lùi khi bảng gợi ý trống.
        let the = null;
        try {
            const B = (typeof globalThis !== 'undefined' && globalThis.HDT_BoGio) || null;
            const cac = B ? B.docCacTheHang(tailieu) : [];
            the = cac.length ? cac[0].el : null;
        } catch (e) { the = null; }
        them('MOT THE HANG', the);

        // 5. BẢNG XÁC NHẬN THANH TOÁN — chốt cuối cùng trước khi ra tiền thật.
        //
        // ⚠️ Bảng này chỉ tồn tại SAU khi bấm "Thanh toán", nên ảnh chụp giao
        // diện thường không có nó. Ngày 22/08/2026 chính nó là chỗ kẹt: chữ
        // "Tổng cộng" biến mất khỏi bảng và máy dừng ở cửa cuối cùng. Có mặt
        // thì chép luôn, để lần sau khỏi phải mò.
        let bangXn = null;
        try {
            bangXn = [...tailieu.querySelectorAll('.ant-modal, [role=dialog]')]
                .find(m2 => /xác nhận thanh toán/i.test(gonChu(m2))) || null;
        } catch (e) { bangXn = null; }
        them('BANG XAC NHAN (bam Thanh toan truoc khi chup)', bangXn);

        // 6. Thanh trên — nút ca bán hàng ("Mở ca" / "Vào ca" / "Đóng ca").
        const nutCa = timNutTheoMau(tailieu, /\bca\b/i);
        them('NUT CA (thanh tren)', nutCa ? lenTang(nutCa, 1) : null);

        // 6. Chữ trần của vài chỗ hay đổi — đọc nhanh, khỏi lội HTML.
        const chu = [];
        for (const c of ['Thành tiền', 'Giá bán', 'Số lượng', 'Tổng thanh toán']) {
            chu.push(c + ': ' + (timLaTheoChu(tailieu, c) ? 'CÓ' : 'không'));
        }
        phan.push('===== CHU MOC =====\n' + chu.join('\n'));
    } catch (e) {
        phan.push('!! chụp dở dang: ' + String((e && e.message) || e));
    }
    return phan.join('\n\n');
}

const API = { chupGiaoDien, catBot, timLaTheoChu, timNutTheoMau, lenTang };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof globalThis !== 'undefined') globalThis.HDT_ChupGiaoDien = API;

})();
