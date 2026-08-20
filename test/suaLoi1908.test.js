'use strict';

// ===========================================================================
//  TEST HAI BẢN VÁ ngày 19/08/2026, sau lượt chạy thật hỏng 4/4 khách.
//  Chạy: node test/suaLoi1908.test.js   (cần biến HDT_JSDOM)
//
//  ① "Khách đã đưa": Tendoo vốn tự điền sẵn ô này bằng tổng đơn nên extension
//     chưa bao giờ đụng tới. Nay Tendoo thôi điền — bảng thấy khách đưa thiếu
//     tiền nên TỰ BẬT "Ghi nợ", và máy từ chối. Hai khách bị chặn vì một ô
//     bỏ trống.
//
//  ② Giá mặt hàng: cách cũ bóc "số tiền đầu tiên" khỏi cả khối chữ. Số tồn kho
//     đứng sát ngay trước giá nên bị nuốt chung:
//         "84" + "1.450.000"  ->  841.450.000
//     Nay ĐỐI CHIẾU thay vì bóc tách — mình đã biết giá cần là bao nhiêu.
//
//  ⚠️ Trọng tâm: cả hai bản vá KHÔNG được nới lỏng chốt chặn nào.
// ===========================================================================

const assert = require('node:assert');
const { JSDOM } = require(process.env.HDT_JSDOM || 'jsdom');
const { test, ghiChu, chay } = require('./chay');
require('../chung/domReact');
const BoGio = require('../tendoo/boGio');
globalThis.HDT_BoGio = BoGio;
const BamThanhToan = require('../tendoo/bamThanhToan');
const { taoTrangPos, HANG_MAU } = require('./trangPosGiaLap');

const nghi = (ms) => new Promise((r) => setTimeout(r, ms));

// ════════════════════════════════════════════════════════════════════════════
//  ② ĐỐI CHIẾU GIÁ
// ════════════════════════════════════════════════════════════════════════════

ghiChu('— ⭐⭐ Đối chiếu giá, không bóc tách —');

const co = BoGio.coGiaTrongChu;

test('⭐⭐ CHÍNH CA HỎNG 19/08: "841.450.000" KHÔNG được coi là 1.450.000', () => {
    // Đây là toàn bộ lý do có hàm này. Bỏ chặn hai đầu là nới lỏng chốt chặn,
    // không phải sửa lỗi — máy sẽ nhận nhầm một mặt hàng giá khác hẳn.
    assert.strictEqual(co('841.450.000', 1450000), false);
});

test('⭐ giá đứng riêng thì nhận', () => {
    assert.strictEqual(co('1.450.000', 1450000), true);
    assert.strictEqual(co('1.450.000đ', 1450000), true);
    assert.strictEqual(co('1,450,000', 1450000), true);
});

test('⭐ số tồn đứng trước, CÓ khoảng trắng → vẫn nhận đúng giá', () => {
    assert.strictEqual(co('Tồn: 84 1.450.000', 1450000), true);
    assert.strictEqual(co('Giày Boots SP0387 84 1.450.000 Tồn: 84', 1450000), true);
});

test('⭐ chữ số nối tiếp phía sau → KHÔNG nhận', () => {
    assert.strictEqual(co('1.450.0001', 1450000), false);
    assert.strictEqual(co('1.450.000.000', 1450000), false);
});

test('⭐ giá KHÁC thì tuyệt đối không nhận', () => {
    for (const chu of ['14.500.000', '145.000', '1.400.000', '2.450.000']) {
        assert.strictEqual(co(chu, 1450000), false, chu);
    }
});

test('đầu vào rác → false, không nổ', () => {
    for (const [chu, gia] of [['', 1450000], [null, 1450000], ['1.450.000', 0],
                              ['1.450.000', -5], ['1.450.000', NaN], ['1.450.000', null]]) {
        assert.strictEqual(co(chu, gia), false, JSON.stringify([chu, gia]));
    }
});

test('giá nhỏ (3 chữ số) vẫn xử đúng', () => {
    assert.strictEqual(co('Tồn: 9 850.000', 850000), true);
    assert.strictEqual(co('99850.000', 850000), false);
});

ghiChu('— ⭐ Đối chiếu giá đi ĐÚNG VÀO luồng bỏ giỏ —');

// ⚠️ KHÔNG dựng phép kiểm "đi hết luồng" cho phần đối chiếu giá.
// Đã thử: sửa chữ trên THẺ hàng thì luồng bỏ giỏ vẫn dùng BẢNG GỢI Ý (thứ hiện
// ra khi gõ tìm kiếm), nên nhánh đối chiếu không hề được chạy tới — phép kiểm
// xanh vì lý do sai. Gây lỗi ngược lại thì lọt lưới, đúng như vậy.
// Nhánh này được phủ ở mức đơn vị ngay bên trên; muốn phủ ở mức luồng thì cần
// bản chụp DOM thật của bảng gợi ý Tendoo.

test('⭐⭐ GIỚI HẠN CỦA RIÊNG PHÉP ĐỐI CHIẾU: số dính liền giá thì nó bó tay', () => {
    // Ghi lại để không ai tưởng RIÊNG phép đối chiếu chữ này chữa được ca
    // "841.450.000" của khách ki?n ngày 19/08.
    //
    // Khi số tồn dính liền giá KHÔNG có dấu cách, chuỗi "1.450.000" chỉ tồn tại
    // như một phần của "841.450.000". Nhìn chữ thì không tài nào phân biệt được
    // "84 dính vào 1.450.000" với "giá thật là 841.450.000". Nới chặn hai đầu
    // để cứu ca này là mở cửa cho việc nhận nhầm một mặt hàng giá khác hẳn —
    // đắt hơn 580 lần. KHÔNG đánh đổi. Hai dòng dưới ghim nguyên tắc ấy lại.
    //
    // ✅ ĐÃ CHỮA TẬN GỐC Ở CHỖ KHÁC (19/08/2026, muộn hơn): docCacDongGoiY() và
    // docCacTheHang() giờ ĐỌC GIÁ TỪ ĐÚNG Ô CỦA NÓ chứ không gom cả dòng thành
    // một chuỗi nữa, nên chuỗi dính không còn hình thành. Xem docGiaTuLa() trong
    // tendoo/boGio.js và test/docGiaTuO.test.js.
    //
    // Hoá ra KHÔNG cần bản chụp DOM thật như từng nghĩ: chỉ cần đòi ô nào chứa
    // MỖI con số ấy và không gì khác, thì thứ tự Tendoo sắp xếp ra sao cũng đúng.
    //
    // Phép đối chiếu này vẫn giữ nguyên làm lớp chắn sau, cho những cảnh không
    // tách được ô riêng và phải lùi về cách đọc cũ.
    assert.strictEqual(BoGio.coGiaTrongChu('841.450.000', 1450000), false);
    assert.strictEqual(BoGio.coGiaTrongChu('84 1.450.000', 1450000), true);
});

test('⭐ thẻ hàng CÓ trả về khối chữ để còn đối chiếu được', () => {
    // Thiếu trường này thì phép đối chiếu chỉ chạy trên bảng gợi ý, còn thẻ
    // hàng thì không — nhánh chết mà không ai biết. Đã dính đúng vậy lúc viết.
    const trang = taoTrangPos({ hang: HANG_MAU });
    const the = BoGio.docCacTheHang(trang.tailieu);
    assert.ok(the.length > 0, 'không đọc được thẻ nào');
    assert.ok(typeof the[0].chu === 'string' && the[0].chu.length > 0,
        'thẻ hàng không có trường `chu`');
});

// ════════════════════════════════════════════════════════════════════════════
//  ① ĐIỀN "KHÁCH ĐÃ ĐƯA"
// ════════════════════════════════════════════════════════════════════════════

ghiChu('— ⭐⭐ Điền "Khách đã đưa" —');

/** Bảng xác nhận giả, tuỳ chọn ô "Khách đã đưa" và các ô nhiễu. */
function bangXn({ daDua = '0', coO = true, oNhieu = false, tongCong = '790.000 đ' } = {}) {
    const dom = new JSDOM('<!doctype html><body><div class="ant-modal" id="b"></div></body>');
    const b = dom.window.document.getElementById('b');
    b.innerHTML = `
      <div>Xác nhận thanh toán</div>
      <div class="flex"><span>Tổng cộng</span><span id="tc">${tongCong}</span></div>
      ${oNhieu ? '<div class="flex"><span>Nhập ghi chú</span><input class="ant-input" value=""></div>' : ''}
      ${coO ? `<div class="flex"><span>Khách đã đưa</span>
                 <input class="ant-input" id="dd" value="${daDua}"></div>` : ''}
      <div class="flex"><span>Ghi nợ</span>
        <button role="switch" aria-checked="false" class="ant-switch"></button></div>`;
    return { b, cuaSo: dom.window };
}

test('⭐ tìm đúng ô "Khách đã đưa", không vơ nhầm ô ghi chú', () => {
    const { b } = bangXn({ oNhieu: true });
    const o = BamThanhToan.timODaDua(b);
    assert.ok(o, 'không tìm thấy ô');
    assert.strictEqual(o.id, 'dd', 'vơ nhầm ô khác');
});

test('không có ô nào mang nhãn đó → trả null, không đoán', () => {
    const { b } = bangXn({ coO: false, oNhieu: true });
    assert.strictEqual(BamThanhToan.timODaDua(b), null);
});

test('⭐⭐ ô để 0 → điền đúng tổng đơn', async () => {
    const { b } = bangXn({ daDua: '0' });
    const kq = await BamThanhToan.dienKhachDaDua(b, 790000, nghi);
    assert.strictEqual(kq.daDien, true, kq.lyDo);
    assert.strictEqual(b.querySelector('#dd').value, '790000');
});

test('⭐ ô ĐÃ đúng số rồi → KHÔNG gõ lại', async () => {
    // Mỗi lần gõ là một lần React vẽ lại; gõ thừa chỉ tăng cơ hội hỏng.
    const { b } = bangXn({ daDua: '790.000' });
    const kq = await BamThanhToan.dienKhachDaDua(b, 790000, nghi);
    assert.strictEqual(kq.daDien, false);
    assert.strictEqual(kq.lyDo, 'DA_DUNG_SAN');
    assert.strictEqual(b.querySelector('#dd').value, '790.000', 'đã gõ lại dù không cần');
});

test('⭐ không thấy ô → báo lý do riêng, KHÔNG coi là lỗi', async () => {
    const { b } = bangXn({ coO: false });
    const kq = await BamThanhToan.dienKhachDaDua(b, 790000, nghi);
    assert.strictEqual(kq.daDien, false);
    assert.strictEqual(kq.lyDo, 'KHONG_THAY_O');
});

ghiChu('— ⭐⭐ Chạy thật: ô để trống thì Ghi nợ tự bật —');

test('⭐⭐ Tendoo KHÔNG điền sẵn → máy tự điền → VẪN phát hành được', async () => {
    // Đúng cảnh 19/08. Trang giả lập dựng lại: ô "Khách đã đưa" để 0, và bảng
    // tự bật Ghi nợ khi thấy thiếu tiền.
    const trang = taoTrangPos({ hang: HANG_MAU, khongDienSanDaDua: true });
    const mon = HANG_MAU[0];
    const bo = await BoGio.boVaoGio(trang.tailieu,
        [{ ma: 'x', ten: mon.ten, gia: mon.gia, soLuong: 1 }]);
    assert.strictEqual(bo.ok, true, bo.thongBao);
    const luot = BamThanhToan.taoLuot();
    const r = await luot.bam(trang.tailieu, { choPhep: true, tongMongDoi: mon.gia });
    assert.strictEqual(r.ok, true, r.thongBao);
    assert.strictEqual(trang.daBam.xacNhan, 1);
});

test('⭐ Ghi nợ bật vì lý do KHÁC → vẫn TỪ CHỐI, không nới chốt chặn', async () => {
    const trang = taoTrangPos({ hang: HANG_MAU, ghiNoBat: true });
    const mon = HANG_MAU[0];
    await BoGio.boVaoGio(trang.tailieu, [{ ma: 'x', ten: mon.ten, gia: mon.gia, soLuong: 1 }]);
    const luot = BamThanhToan.taoLuot();
    const r = await luot.bam(trang.tailieu, { choPhep: true, tongMongDoi: mon.gia });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.ma, 'GHI_NO_DANG_BAT');
    assert.strictEqual(trang.daBam.xacNhan, 0, '❌ đã phát hành dù Ghi nợ bật');
});

test('⭐⭐ điền xong mà TỔNG ĐỔI → DỪNG, không phát hành', async () => {
    // Gõ nhầm vào ô khác (giảm giá, phụ thu…) là tổng đổi ngay. Không đọc lại
    // tổng SAU KHI ĐIỀN thì hóa đơn ra sai tiền mà không ai biết.
    //
    // ⚠️ Phải dùng `doiTongKhiDien`: bảng bắt đầu ĐÚNG tổng rồi mới lệch sau cú
    // gõ. Cho lệch sẵn từ đầu thì chốt chặn CŨ bắt được, và phép kiểm này xanh
    // mà chẳng dò gì cả — đã dính đúng vậy lúc viết.
    const trang = taoTrangPos({ hang: HANG_MAU, khongDienSanDaDua: true, doiTongKhiDien: true });
    const mon = HANG_MAU[0];
    await BoGio.boVaoGio(trang.tailieu, [{ ma: 'x', ten: mon.ten, gia: mon.gia, soLuong: 1 }]);
    const luot = BamThanhToan.taoLuot();
    const r = await luot.bam(trang.tailieu, { choPhep: true, tongMongDoi: mon.gia });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(trang.daBam.xacNhan, 0, '❌ đã phát hành dù tổng lệch');
});

// ════════════════════════════════════════════════════════════════════════════
//  ③ GIỎ CÓ SẴN ĐƠN DỞ -> DỌN RỒI THỬ LẠI ĐÚNG MỘT LẦN
// ════════════════════════════════════════════════════════════════════════════

ghiChu('— ⭐⭐ Giỏ có sẵn đơn dở: dọn rồi thử lại —');

const NhanLenh = require('../tendoo/nhanLenh');
const DanhTinh = require('../tendoo/danhTinh');
const DocSanPham = require('../tendoo/docSanPham');
const ChiaHoaDon = require('../chung/chiaHoaDon');
const DauGio = require('../chung/dauGio');
const CH2 = '2c683a17-09ab-4655-8dbf-50ca8105373c';

function boNoi2(hang) {
    return {
        async layPhien() {
            return { success: true, data: {
                account: { display_name: 'CH', max_store_count: 1 },
                business_info: { current_store: { id: CH2, store_name: 'CH' },
                                 current_role: { role_name: 'Chủ' } } } };
        },
        async goiTrangSanPham(t) {
            return { success: true,
                data: hang.map((h, i) => ({ id: 'sp-' + i, name: h.ten, product_code: 'SP' + i,
                    variant_mode: 'non_variant', business_id: CH2, base_price: h.gia,
                    final_price: h.gia, available_quantity: h.ton, is_out_of_stock: true, version: 2 })),
                meta: { total: hang.length, size: 200, page: t, total_pages: 1 } };
        },
    };
}

/**
 * @param {boolean} cuaNguoiDung  giỏ sót là hàng NGƯỜI DÙNG bày (dấu giỏ không
 *   khớp) -> máy KHÔNG được tự xóa, và do đó KHÔNG được thử lại.
 */
function dungGioSot({ cuaNguoiDung = false } = {}) {
    const hang = HANG_MAU.map((h) => ({ ...h, ton: 400 }));
    const sot = { ten: HANG_MAU[2].ten, gia: HANG_MAU[2].gia, soLuong: 1 };
    const trang = taoTrangPos({ hang, gioBanDau: [sot] });
    // Dấu giỏ: khớp thì máy nhận ra là của mình và dọn được.
    let dauGio = cuaNguoiDung ? null : DauGio.taoDau({
        maKH: 'PA', danhSach: [{ ten: sot.ten, soLuong: 1 }], tong: sot.gia,
    });
    const boi = {
        tailieu: trang.tailieu,
        DanhTinh, DocSanPham, BoGio, ChiaHoaDon, DauGio,
        BamThanhToan,
        taoBoNoi: () => boNoi2(hang),
        docCaiDat: async () => ({ tuBam: true, daHieu: true, docDuoc: true,
                                  dungSai: 200000, tranMoiHoaDon: 2000000, xoaGioLa: false }),
        docKhoTaiKhoan: async () => ({ khach: {
            PA: { maCuaHang: CH2, tenDangNhap: 'x', matKhauMaHoa: { iv: 'a', duLieu: 'b' } } } }),
        ghiDauGio: async (d) => { dauGio = DauGio.taoDau(d); },
        docDauGio: async () => dauGio,
        xoaDauGio: async () => { dauGio = null; },
    };
    return { trang, boi };
}

test('⭐⭐ giỏ sót ĐÚNG là của máy → dọn rồi THỬ LẠI, khách vẫn xuất được', async () => {
    // Đây là cảnh thật lượt 10:17 ngày 19/08: đổi tài khoản làm tải lại tab,
    // Tendoo khôi phục đơn dở, khách ĐẦU TIÊN chết oan làm vật hy sinh.
    const { trang, boi } = dungGioSot();
    const kq = await NhanLenh.xuLyMotLenh(
        { maKH: 'PA', tenKH: 'Phương Anh', soTien: 3000000 }, boi);
    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.ok(trang.daBam.xacNhan > 0, 'không phát hành được tờ nào');
    // ⚠️ PHẢI KIỂM ĐỦ SỐ TỜ VÀ ĐỦ TIỀN. Chỉ khẳng định "ok" là chưa đủ: nếu
    // lần thử lại BỎ QUA rổ đó thay vì làm lại, khách vẫn "thành công" nhưng
    // THIẾU MỘT TỜ và thiếu tiền — mà không phép kiểm nào đỏ.
    assert.strictEqual(kq.ketQua.soHoaDon, kq.ketQua.soHoaDonTheoKeHoach,
        'ra ' + kq.ketQua.soHoaDon + ' tờ trong khi kế hoạch có '
        + kq.ketQua.soHoaDonTheoKeHoach);
    assert.ok(Math.abs(kq.ketQua.tong - 3000000) <= 200000,
        'tổng đã xuất ' + kq.ketQua.tong + ', lệch ' + kq.ketQua.lech);
    assert.strictEqual(trang.daBam.xacNhan, kq.ketQua.soHoaDon);
});

test('⭐⭐ thử lại GIỮA LOẠT → giữ nguyên các tờ đã ra, không mất tờ nào', async () => {
    // Giỏ tự có lại đơn dở sau khi Tendoo khôi phục — có thể xảy ra ở rổ thứ
    // hai chứ không riêng rổ đầu. Lúc ấy đã có tờ ra rồi, nên lần thử lại
    // tuyệt đối không được đè lên hay bỏ sót.
    const { trang, boi } = dungGioSot();
    let lan = 0;
    const BoGioBoc = { ...BoGio,
        async boVaoGio(td, ds, tc) {
            lan++;
            // Lượt 1: giỏ có đơn dở thật (do gioBanDau) -> dọn + thử lại.
            // Lượt 3: giả cảnh Tendoo khôi phục đơn dở lần nữa GIỮA loạt.
            if (lan === 3) {
                return { ok: false, ma: 'GIO_KHONG_TRONG', soDongGio: 1,
                         thongBao: 'Giỏ hàng trên tab Tendoo đang có sẵn 1 món.' };
            }
            return BoGio.boVaoGio(td, ds, tc);
        } };
    const kq = await NhanLenh.xuLyMotLenh(
        { maKH: 'PA', tenKH: 'Phương Anh', soTien: 3000000 },
        { ...boi, BoGio: BoGioBoc });
    // Lượt 1 đã tiêu mất lần thử lại, nên lượt 3 hỏng là dừng hẳn — nhưng tờ
    // đã ra phải được giữ nguyên và báo đúng.
    assert.strictEqual(kq.ok, false);
    assert.ok(kq.ketQua.tong > 0, 'mất trắng số tiền đã xuất');
    assert.strictEqual(kq.ketQua.tong,
        kq.ketQua.cacHoaDon.reduce((t, x) => t + x.tong, 0));
    assert.strictEqual(kq.ketQua.daBamThanhToan, true);
    assert.notStrictEqual(kq.chuaLamGi, true, '❌ đã ra tờ mà báo "chưa làm gì"');
});

test('⭐⭐ giỏ sót là hàng NGƯỜI DÙNG → KHÔNG xóa, KHÔNG thử lại', async () => {
    // Dấu giỏ không khớp -> donGioConSot từ chối -> không được thử lại.
    // Thử lại lúc này chỉ gặp đúng cái giỏ ấy, và tệ hơn là che mất lời nhắc.
    const { trang, boi } = dungGioSot({ cuaNguoiDung: true });
    const truoc = trang.xemGio().length;
    const kq = await NhanLenh.xuLyMotLenh(
        { maKH: 'PA', tenKH: 'Phương Anh', soTien: 3000000 }, boi);
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ma, 'GIO_KHONG_TRONG');
    assert.strictEqual(trang.xemGio().length, truoc, '❌ đã xóa giỏ của người dùng');
    assert.strictEqual(trang.daBam.xacNhan, 0, '❌ đã phát hành hóa đơn');
});

test('⭐⭐ dọn giỏ THẤT BẠI → chỉ thử ĐÚNG MỘT lượt, không thử lại', async () => {
    // Không có phép kiểm này thì bỏ điều kiện "dọn được mới thử lại" vẫn xanh:
    // thử lại cũng gặp đúng cái giỏ ấy nên kết quả cuối giống hệt. Phải ĐẾM số
    // lượt mới thấy. Thử lại lúc dọn không được là phí thời gian và che mất
    // lời nhắc chỉ đường cho người dùng.
    const { boi } = dungGioSot({ cuaNguoiDung: true });
    let lan = 0;
    const BoGioBoc = { ...BoGio,
        async boVaoGio(td, ds, tc) { lan++; return BoGio.boVaoGio(td, ds, tc); } };
    await NhanLenh.xuLyMotLenh(
        { maKH: 'PA', tenKH: 'Phương Anh', soTien: 3000000 },
        { ...boi, BoGio: BoGioBoc });
    assert.strictEqual(lan, 1, 'đã thử lại dù dọn giỏ thất bại (' + lan + ' lượt)');
});

test('⭐⭐ KHONG_RO (đã bấm Xác nhận, không rõ kết quả) → KHÔNG gắn chuaLamGi', async () => {
    // ĐÂY LÀ CA NGUY HIỂM NHẤT của cờ này. KHONG_RO nghĩa là đã bấm Xác nhận
    // nhưng không đọc được kết quả — có thể hóa đơn ĐÃ RA. Hàng đợi phải TREO
    // lệnh để người dùng tự kết luận. Gắn `chuaLamGi` là bảo nó "chưa làm gì",
    // nó sẽ cho chạy lại và ra HÓA ĐƠN TRÙNG.
    const { boi } = dungGioSot();
    const BamBoc = {
        ...BamThanhToan,
        taoLuot() {
            return { async bam() {
                return { ok: false, ma: 'KHONG_RO',
                         thongBao: 'Đã bấm Xác nhận nhưng không rõ kết quả.' };
            } };
        },
    };
    const kq = await NhanLenh.xuLyMotLenh(
        { maKH: 'PA', tenKH: 'Phương Anh', soTien: 3000000 },
        { ...boi, BamThanhToan: BamBoc });
    assert.strictEqual(kq.ok, false);
    assert.match(String(kq.ma || ''), /KHONG_RO/);
    assert.notStrictEqual(kq.chuaLamGi, true,
        '❌ đã bấm Xác nhận mà báo "chưa làm gì" — hàng đợi sẽ cho chạy lại, ra hóa đơn trùng');
});

test('⭐⭐ ĐÃ RA HÓA ĐƠN rồi mới hỏng → TUYỆT ĐỐI không gắn chuaLamGi', async () => {
    // Gắn bừa cờ này là nói dối hàng đợi: nó sẽ coi như chưa làm gì và cho chạy
    // lại -> hóa đơn TRÙNG. Đây là hậu quả nặng nhất trong cả bản vá.
    const { boi } = dungGioSot();
    let lan = 0;
    const BoGioBoc = { ...BoGio,
        async boVaoGio(td, ds, tc) {
            lan++;
            // Lượt 1 dọn giỏ + thử lại; lượt 2-3 chạy thật; từ lượt 4 thì hỏng.
            if (lan >= 4) return { ok: false, ma: 'KHONG_VAO_GIO', thongBao: 'bấm không ăn' };
            return BoGio.boVaoGio(td, ds, tc);
        } };
    const kq = await NhanLenh.xuLyMotLenh(
        { maKH: 'PA', tenKH: 'Phương Anh', soTien: 5000000 },
        { ...boi, BoGio: BoGioBoc });
    assert.strictEqual(kq.ok, false);
    assert.ok(kq.ketQua && kq.ketQua.tong > 0, 'kịch bản chưa ra tờ nào — phép kiểm vô nghĩa');
    assert.notStrictEqual(kq.chuaLamGi, true,
        '❌ đã ra hóa đơn rồi mà vẫn báo "chưa làm gì" — hàng đợi sẽ cho chạy lại');
});

test('⭐ lỗi này mang cờ chuaLamGi → hàng đợi không treo oan', async () => {
    const { boi } = dungGioSot({ cuaNguoiDung: true });
    const kq = await NhanLenh.xuLyMotLenh(
        { maKH: 'PA', tenKH: 'Phương Anh', soTien: 3000000 }, boi);
    assert.strictEqual(kq.chuaLamGi, true);
});

test('⭐⭐ THỬ LẠI TỐI ĐA MỘT LẦN — giỏ đầy lại lần nữa thì DỪNG', async () => {
    // Không có chốt này thì một trang cứ khôi phục đơn dở là máy quay vòng mãi.
    const { trang, boi } = dungGioSot();
    let lan = 0;
    const BoGioBoc = { ...BoGio,
        async boVaoGio(td, ds, tc) {
            lan++;
            // ⚠️ CÓ BIÊN. Bỏ chốt "tối đa một lần" mà stub cứ trả lỗi mãi thì
            // vòng lặp chạy vô tận và bài dò TREO — treo không phải là đỏ, nó
            // chỉ làm cả bộ test đứng im. Sau 5 lượt thì trả lỗi khác để vòng
            // lặp thoát, rồi soi con số `lan`.
            if (lan > 5) return { ok: false, ma: 'KHONG_VAO_GIO', thongBao: 'thôi' };
            return { ok: false, ma: 'GIO_KHONG_TRONG', soDongGio: 1,
                     thongBao: 'Giỏ hàng trên tab Tendoo đang có sẵn 1 món (790.000đ).' };
        } };
    const kq = await NhanLenh.xuLyMotLenh(
        { maKH: 'PA', tenKH: 'Phương Anh', soTien: 3000000 },
        { ...boi, BoGio: BoGioBoc });
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(lan, 2, 'phải thử ĐÚNG 2 lần (lần đầu + 1 lần thử lại), thực tế ' + lan);
    assert.strictEqual(trang.daBam.xacNhan, 0);
});

test('⭐⭐ KHÔNG thử lại với mã lỗi khác — tránh hóa đơn trùng', async () => {
    // Mọi mã lỗi khác đều có thể xảy ra SAU khi đã bấm gì đó. Thử lại lúc ấy là
    // tự tay tạo hóa đơn trùng.
    const { boi } = dungGioSot();
    let lan = 0;
    const BoGioBoc = { ...BoGio,
        async boVaoGio() {
            lan++;
            return { ok: false, ma: 'KHONG_VAO_GIO', thongBao: 'bấm không ăn' };
        } };
    const kq = await NhanLenh.xuLyMotLenh(
        { maKH: 'PA', tenKH: 'Phương Anh', soTien: 3000000 },
        { ...boi, BoGio: BoGioBoc });
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(lan, 1, 'đã thử lại với mã lỗi KHÔNG được phép thử lại');
});

chay('HAI BẢN VÁ SAU LƯỢT CHẠY HỎNG 19/08/2026');
