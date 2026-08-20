'use strict';

// BẢNG "THÔNG BÁO NÂNG CẤP GIAO DIỆN BÁN HÀNG" CHẶN ĐƯỜNG.
// Chạy: node test/bangNangCapGiaoDien.test.js   (cần biến HDT_JSDOM)
//
// ── CA HỎNG THẬT ───────────────────────────────────────────────────────────
// Lượt 14:48 ngày 19/08/2026, khách Trang Bé TB, 9.980.000đ:
//
//   ✗ Lỗi: Bấm Thanh toán nhưng Tendoo hiện một bảng khác: «Thông báo nâng cấp
//     giao diện bán hàng — Từ ngày 18/08/2026, hệ thống sẽ chuyển sang giao
//     diện bán hàng mới…». Máy KHÔNG tự bấm gì trên bảng lạ. CHƯA phát hành
//     hóa đơn nào. Đã tự dọn 1 món máy vừa bỏ vào giỏ.
//
// Máy dừng đúng luật và dọn giỏ sạch — không có hóa đơn rác. Nhưng mất trắng
// một tờ. Khách thứ hai trong cùng lượt (Thùy Dương S3) chạy trót lọt, nên
// bảng này CHỈ HIỆN MỘT LẦN: đóng được nó một lần là cả loạt đi tiếp.
//
// ── ĐIỀU BÀI TEST NÀY THẬT SỰ ĐI CHỨNG MINH ────────────────────────────────
// KHÔNG phải "máy bấm đúng nút để đóng bảng" — mình chưa có HTML thật của bảng
// ấy, tên nút trong bản giả là mình dựng ra.
//
// Mà là: dù bảng có nút gì đi nữa, máy KHÔNG BAO GIỜ bấm nút dẫn sang giao
// diện mới, và khi không chắc thì DỪNG chứ không đoán. Bấm nhầm nút ấy giữa
// một lượt chạy hàng loạt là hỏng sạch phần còn lại, vì mọi bộ chọn của
// extension đều viết cho giao diện cũ.

const assert = require('node:assert');
const { test, ghiChu, chay } = require('./chay');
require('../chung/domReact');
const BoGio = require('../tendoo/boGio');
const T = require('../tendoo/bamThanhToan');
const { taoTrangPos } = require('./trangPosGiaLap');

const { MA } = T;
const nhanh = { nghi: async () => {}, hanChoBangMs: 60, nhipChoMs: 10, hanChoThueDong: 40,
                doiSauBam: 40 };

/** Dựng trang có sẵn hàng trong giỏ và bấm Thanh toán một lượt. */
async function chayMotLuot(tuyChonTrang = {}, tuyChonBam = {}) {
    const trang = taoTrangPos({
        gioBanDau: [{ ten: 'Áo khoác dạ dáng dài nữ', soLuong: 2 }],   // 1.980.000
        bangNangCap: true,
        ...tuyChonTrang,
    });
    const luot = T.taoLuot();
    const kq = await luot.bam(trang.tailieu, {
        choPhep: true, tongMongDoi: 1980000, ...nhanh, ...tuyChonBam,
    });
    return { trang, luot, kq };
}

ghiChu('— Nhận ra bảng và đóng được nó —');

test('⭐⭐ CA HỎNG 19/08: bảng nâng cấp chặn đường → vẫn PHÁT HÀNH ĐƯỢC', () => {
    return chayMotLuot().then(({ trang, kq }) => {
        assert.strictEqual(kq.ma, MA.XONG, 'thông báo: ' + kq.thongBao);
        assert.strictEqual(kq.ok, true);
        assert.strictEqual(trang.daBam.xacNhan, 1, 'phải xác nhận ĐÚNG một lần');
    });
});

test('⛔⛔ TUYỆT ĐỐI KHÔNG bấm nút dẫn sang giao diện mới', async () => {
    const { trang } = await chayMotLuot();
    assert.strictEqual(trang.daBam.nangCapDoiNgay, 0,
        'đã bấm "Trải nghiệm ngay" — cả loạt chạy sẽ hỏng theo vì trang nhảy sang pos-v2');
});

test('đóng bảng bằng dấu × — thứ chắc chắn không dẫn đi đâu', async () => {
    const { trang } = await chayMotLuot();
    assert.strictEqual(trang.daBam.nangCapDong, 1);
});

test('⛔ đóng bảng TỐI ĐA MỘT LẦN', async () => {
    const { trang, luot } = await chayMotLuot();
    assert.strictEqual(luot.daDongThongBao(), true);
    assert.ok(trang.daBam.nangCapDong <= 1, 'bấm đóng nhiều hơn một lần');
});

test('⛔ nút "Thanh toán" bấm tối đa HAI lần, "Xác nhận" đúng MỘT', async () => {
    const { trang, luot } = await chayMotLuot();
    assert.strictEqual(luot.soLanBamThanhToan(), 2, 'lần 2 là sau khi đã đóng bảng');
    assert.strictEqual(trang.daBam.thanhToan, 2);
    assert.strictEqual(trang.daBam.xacNhan, 1);
});

test('⭐⭐ PHẢI CHỜ bảng đóng hẳn rồi mới bấm lại Thanh toán', async () => {
    // Ant Design có hiệu ứng đóng: bấm × xong bảng còn nấn ná một nhịp, và
    // MẶT NẠ của nó nuốt sạch cú bấm nào rơi vào lúc ấy. Bấm lại Thanh toán
    // ngay là bấm vào khoảng không — mất tờ hóa đơn y như chưa sửa gì.
    //
    // Ở đây `nghi` phải là giấc ngủ THẬT, không phải hàm rỗng, nếu không thì
    // vòng chờ quay hết mấy nhịp trong cùng một khoảnh khắc và chẳng chờ gì cả.
    const trang = taoTrangPos({
        gioBanDau: [{ ten: 'Áo khoác dạ dáng dài nữ', soLuong: 2 }],
        bangNangCap: true, nangCapDongTreMs: 40,
    });
    const luot = T.taoLuot();
    const kq = await luot.bam(trang.tailieu, {
        choPhep: true, tongMongDoi: 1980000,
        nghi: (ms) => new Promise(r => setTimeout(r, ms)),
        hanChoBangMs: 300, nhipChoMs: 10, hanChoThueDong: 300, doiSauBam: 300,
    });
    assert.strictEqual(kq.ma, MA.XONG, 'thông báo: ' + kq.thongBao);
    assert.strictEqual(trang.daBam.xacNhan, 1);
});

ghiChu('— Khi KHÔNG có nút nào an toàn thì phải DỪNG —');

test('⭐⭐ bảng chỉ có nút sang giao diện mới → DỪNG, không bấm bừa', async () => {
    const { trang, kq } = await chayMotLuot({ nangCapKhongNutDong: true });
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ma, MA.BANG_LA_CHAN_DUONG);
    assert.strictEqual(trang.daBam.nangCapDoiNgay, 0, 'ĐÃ BẤM NHẦM nút sang giao diện mới');
    assert.strictEqual(trang.daBam.xacNhan, 0, 'không được xác nhận gì');
    assert.ok(/CHƯA phát hành hóa đơn nào/.test(kq.thongBao), kq.thongBao);
});

test('⭐ thông báo phải KỂ TÊN các nút trên bảng lạ', async () => {
    // Đây là thứ thiếu ở log ngày 19/08: đọc xong vẫn không biết bảng có nút
    // gì để mà thêm vào danh sách trắng. Có tên nút thì lần sau sửa trong một
    // phút thay vì mất cả ngày đoán.
    const { kq } = await chayMotLuot({ nangCapKhongNutDong: true });
    assert.ok(/Các nút trên bảng:/.test(kq.thongBao), kq.thongBao);
    assert.ok(/Trải nghiệm ngay/.test(kq.thongBao), kq.thongBao);
});

ghiChu('— Không được rơi vào vòng lặp —');

test('⭐⭐ đóng rồi bảng VẪN hiện lại → dừng hẳn, KHÔNG lặp vô tận', async () => {
    const { trang, kq } = await chayMotLuot({ nangCapLuonChan: true });
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ma, MA.BANG_LA_CHAN_DUONG);
    assert.strictEqual(trang.daBam.nangCapDong, 1, 'chỉ được thử đóng ĐÚNG một lần');
    assert.ok(trang.daBam.thanhToan <= 2, 'bấm Thanh toán quá hai lần: ' + trang.daBam.thanhToan);
    assert.strictEqual(trang.daBam.xacNhan, 0);
    assert.ok(/ĐÃ thử đóng bảng này một lần/.test(kq.thongBao), kq.thongBao);
});

ghiChu('— ⭐ KIÊN NHẪN: nút Thanh toán vắng mặt một nhịp —');

/** Giấc ngủ THẬT — bắt buộc cho mọi cảnh có độ trễ, xem giải thích ở dưới. */
const cham = {
    nghi: (ms) => new Promise(r => setTimeout(r, ms)),
    hanChoBangMs: 400, nhipChoMs: 10, hanChoThueDong: 400, doiSauBam: 400,
};

test('⭐⭐ CA HỎNG 15:11 19/08: nút bị khoá một nhịp → PHẢI CHỜ, không bỏ cuộc', async () => {
    // Đây là ca đã giết khách Trang Bé TB (9.980.000đ). Trang KHÔNG hề nhảy đi
    // đâu — đóng bảng xong React vẽ lại vùng bán hàng nên nút khoá mất một
    // nhịp. Bản trước nhìn ĐÚNG MỘT LẦN, trúng ngay khoảnh khắc ấy, rồi kết
    // luận "trang đã nhảy sang giao diện mới" và dừng.
    //
    // `nghi` phải là giấc ngủ THẬT: hàm rỗng thì vòng chờ quay hết mọi nhịp
    // trong cùng một khoảnh khắc và chẳng chờ được gì.
    const trang = taoTrangPos({
        gioBanDau: [{ ten: 'Áo khoác dạ dáng dài nữ', soLuong: 2 }],
        bangNangCap: true, nangCapVangNutMs: 60,
    });
    const luot = T.taoLuot();
    const kq = await luot.bam(trang.tailieu, { choPhep: true, tongMongDoi: 1980000, ...cham });

    assert.strictEqual(kq.ma, MA.XONG, 'thông báo: ' + kq.thongBao);
    assert.strictEqual(trang.daBam.xacNhan, 1, 'phải xác nhận đúng một lần');
});

test('⛔ chờ có HẠN — nút không bao giờ trở lại thì vẫn phải dừng', async () => {
    const trang = taoTrangPos({
        gioBanDau: [{ ten: 'Áo khoác dạ dáng dài nữ', soLuong: 2 }],
        bangNangCap: true, nangCapMatNutThanhToan: true,
    });
    const luot = T.taoLuot();
    const kq = await luot.bam(trang.tailieu, {
        choPhep: true, tongMongDoi: 1980000,
        nghi: (ms) => new Promise(r => setTimeout(r, ms)),
        hanChoBangMs: 120, nhipChoMs: 10, hanChoThueDong: 60, doiSauBam: 120,
    });
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ma, MA.BANG_LA_CHAN_DUONG);
    assert.strictEqual(trang.daBam.xacNhan, 0, 'tuyệt đối không được xác nhận');
    assert.ok(/CHƯA phát hành hóa đơn nào/.test(kq.thongBao), kq.thongBao);
});

ghiChu('— Thông báo phải nói ĐÚNG điều quan sát được —');

test('⭐⭐ trang KHÔNG đổi → KHÔNG được vu cho là đã nhảy giao diện mới', async () => {
    // Đây chính là câu sai đã in ra ngày 19/08: «nhiều khả năng trang đã nhảy
    // sang giao diện bán hàng mới» — trong khi trang vẫn ở nguyên chỗ cũ. Một
    // lời buộc tội dựng lên từ chỗ không thấy gì, và nó đẩy người đọc đi sai
    // hướng mất trọn một lượt chạy.
    const trang = taoTrangPos({
        gioBanDau: [{ ten: 'Áo khoác dạ dáng dài nữ', soLuong: 2 }],
        bangNangCap: true, nangCapMatNutThanhToan: true,
    });
    const luot = T.taoLuot();
    const kq = await luot.bam(trang.tailieu, {
        choPhep: true, tongMongDoi: 1980000,
        nghi: (ms) => new Promise(r => setTimeout(r, ms)),
        hanChoBangMs: 120, nhipChoMs: 10, hanChoThueDong: 60, doiSauBam: 120,
    });
    assert.ok(!/đã chuyển từ|đẩy sang giao diện/.test(kq.thongBao),
        'vẫn đang vu cho trang là đã nhảy giao diện: ' + kq.thongBao);
    assert.ok(/nút Thanh toán vẫn không bấm được/.test(kq.thongBao), kq.thongBao);
});

test('⭐⭐ trang THẬT SỰ đổi → mới được nói là nhảy giao diện, kèm cả hai đường dẫn', async () => {
    const trang = taoTrangPos({
        gioBanDau: [{ ten: 'Áo khoác dạ dáng dài nữ', soLuong: 2 }],
        bangNangCap: true, nangCapMatNutThanhToan: true,
    });
    // Bấm × xong thì Tendoo đẩy sang giao diện mới — dựng đúng như vậy.
    trang.tailieu.getElementById('nangCapDong').addEventListener('click', () => {
        trang.dom.reconfigure({ url: 'https://seller-v3.tendoo.vn/sales/pos-v2' });
    });
    const luot = T.taoLuot();
    const kq = await luot.bam(trang.tailieu, {
        choPhep: true, tongMongDoi: 1980000,
        nghi: (ms) => new Promise(r => setTimeout(r, ms)),
        hanChoBangMs: 120, nhipChoMs: 10, hanChoThueDong: 60, doiSauBam: 120,
    });
    assert.strictEqual(kq.ma, MA.BANG_LA_CHAN_DUONG);
    assert.ok(/pos-v2/.test(kq.thongBao), 'thiếu đường dẫn mới: ' + kq.thongBao);
    assert.ok(/\/sales\/pos»/.test(kq.thongBao), 'thiếu đường dẫn cũ: ' + kq.thongBao);
    assert.strictEqual(trang.daBam.xacNhan, 0);
});

test('⛔⛔ dấu × là THẺ LIÊN KẾT thì KHÔNG được bấm — bấm là đi khỏi trang', () => {
    // Cảnh thật hoàn toàn có thể xảy ra: Tendoo dựng nút đóng bằng <a> trỏ
    // thẳng sang /sales/pos-v2 nhưng vẫn đội lớp .ant-modal-close. Nhìn thì
    // giống dấu × y hệt, bấm vào là rời trang giữa lượt chạy.
    const td = taoTrangPos().tailieu;
    const m = td.getElementById('bangNangCap');
    const x = m.querySelector('.ant-modal-close');
    const a = td.createElement('a');
    a.className = 'ant-modal-close';
    a.setAttribute('href', '/sales/pos-v2');
    a.setAttribute('aria-label', 'Close');
    a.textContent = '×';
    x.replaceWith(a);
    m.querySelector('#nangCapDoiNgay span').textContent = 'Trải nghiệm ngay';

    assert.strictEqual(T.timNutDongThongBao(m), null,
        'đã nhận một thẻ có href làm nút đóng — bấm vào là rời trang bán hàng');
});

test('đọc đường dẫn không được thì trả rỗng, KHÔNG kết luận bừa', () => {
    assert.strictEqual(T.docDuongDan(null), '');
    assert.strictEqual(T.docDuongDan({}), '');
    assert.strictEqual(T.docDuongDan(taoTrangPos().tailieu), '/sales/pos');
});

ghiChu('— Không được đụng tới những bảng khác —');

test('⛔ bảng thuế KHÔNG bị nhận nhầm là bảng nâng cấp', async () => {
    // Bảng thuế phải đi đúng luồng của nó: có công tắc, và công tắc TẮT thì dừng.
    const { trang, kq } = await chayMotLuot({ bangNangCap: false, bangThue: true });
    assert.strictEqual(kq.ma, MA.CHUA_THIET_LAP_THUE, 'thông báo: ' + kq.thongBao);
    assert.strictEqual(trang.daBam.thueBoQua, 0, 'công tắc đang TẮT mà đã bấm Bỏ qua');
    assert.strictEqual(trang.daBam.thueThietLap, 0, 'bấm nút này là rời khỏi trang bán hàng');
});

test('⛔ hai bảng quảng cáo quen thuộc vẫn bị kệ như cũ', async () => {
    // Trang POS lúc nào cũng có sẵn hai bảng này đè lên. Chúng KHÔNG chặn
    // đường, và máy không được đụng vào — kể cả nút "Để sau" của bảng POS V2.
    const { trang, kq } = await chayMotLuot({ bangNangCap: false });
    assert.strictEqual(kq.ma, MA.XONG, 'thông báo: ' + kq.thongBao);
    assert.strictEqual(trang.daBam.nangCapDong, 0);
    assert.strictEqual(trang.daBam.nangCapDoiNgay, 0);
});

ghiChu('— Mẫu nhận diện: đúng bảng, không quơ bừa —');

test('nhận đúng nguyên văn Tendoo, không nhận nhầm bảng khác', () => {
    const nhan = (chu) => {
        const td = taoTrangPos().tailieu;
        const m = td.getElementById('bangNangCap');
        m.style.display = '';
        m.querySelector('.ant-modal-title').textContent = chu;
        m.querySelector('p').textContent = '';
        m.querySelector('#nangCapDoiNgay').remove();
        const c = T.timBangChanDuong(td);
        return !!(c && /(nâng cấp|chuyển sang|giao diện).{0,40}giao diện bán hàng|giao diện bán hàng mới/i.test(c.chu));
    };
    assert.strictEqual(nhan('Thông báo nâng cấp giao diện bán hàng'), true);
    assert.strictEqual(nhan('Hệ thống sẽ chuyển sang giao diện bán hàng mới'), true);
    assert.strictEqual(nhan('Chưa thiết lập quản lý thuế'), false);
    assert.strictEqual(nhan('Xác nhận hủy đơn hàng'), false);
});

test('⛔⛔ nút KHÔNG nằm trong danh sách trắng thì KHÔNG BAO GIỜ được chọn', () => {
    // Đây là chốt chặn thật sự — không phải một danh sách "nút cấm" nào cả.
    // So chữ TUYỆT ĐỐI với một danh sách ngắn thì mọi thứ ngoài danh sách đều
    // bị loại, khỏi cần đoán trước Tendoo sẽ đặt tên nút nguy hiểm là gì.
    const td = taoTrangPos().tailieu;
    const m = td.getElementById('bangNangCap');
    m.querySelector('.ant-modal-close').remove();
    const nut = m.querySelector('#nangCapDoiNgay span');
    for (const chu of ['Trải nghiệm ngay', 'Dùng thử ngay', 'Chuyển sang giao diện mới',
                       'Khám phá POS V2', 'Nâng cấp ngay', 'Đồng ý', 'Xem thử',
                       'Bỏ qua và chuyển', 'Đóng và dùng giao diện mới']) {
        nut.textContent = chu;
        assert.strictEqual(T.timNutDongThongBao(m), null, 'lọt nút ngoài danh sách: ' + chu);
    }
});

test('⭐⭐ bảng LẠ HOÀN TOÀN thì vẫn không được đụng vào, kể cả dấu ×', async () => {
    // Nếu mẫu nhận diện bị nới ra thì máy sẽ bấm × lên MỌI bảng nó không hiểu —
    // đó là nới chốt chặn chứ không phải sửa lỗi. Gài lỗi nới mẫu thành /./ mà
    // không có bài này thì lọt lưới hoàn toàn.
    const trang = taoTrangPos({
        gioBanDau: [{ ten: 'Áo khoác dạ dáng dài nữ', soLuong: 2 }],
        bangNangCap: true,
    });
    const m = trang.tailieu.getElementById('bangNangCap');
    m.querySelector('.ant-modal-title').textContent = 'Thông báo bảo trì hệ thống';
    m.querySelector('p').textContent = 'Hệ thống sẽ bảo trì từ 22h đến 24h hôm nay.';

    const luot = T.taoLuot();
    const kq = await luot.bam(trang.tailieu, { choPhep: true, tongMongDoi: 1980000, ...nhanh });

    assert.strictEqual(kq.ma, MA.BANG_LA_CHAN_DUONG, 'thông báo: ' + kq.thongBao);
    assert.strictEqual(trang.daBam.nangCapDong, 0, 'đã bấm × lên một bảng KHÔNG hiểu');
    assert.strictEqual(trang.daBam.nangCapDoiNgay, 0);
    assert.strictEqual(trang.daBam.xacNhan, 0);
    assert.ok(/bảo trì/.test(kq.thongBao), kq.thongBao);
});

test('nhận nút đóng theo chữ khi bảng không có dấu ×', () => {
    const td = taoTrangPos().tailieu;
    const m = td.getElementById('bangNangCap');
    m.querySelector('.ant-modal-close').remove();
    const nut = m.querySelector('#nangCapDoiNgay span');
    for (const chu of ['Để sau', 'Bỏ qua', 'Đóng', 'Đã hiểu']) {
        nut.textContent = chu;
        assert.ok(T.timNutDongThongBao(m), 'không nhận ra nút đóng: ' + chu);
    }
});

chay('BẢNG "THÔNG BÁO NÂNG CẤP GIAO DIỆN BÁN HÀNG"');
