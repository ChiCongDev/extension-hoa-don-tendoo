'use strict';

// NÚT THANH TOÁN BỊ KHÓA — chờ, rồi nói đúng bệnh.
// Chạy: node test/nutThanhToanBiKhoa.test.js   (cần biến HDT_JSDOM)
//
// ── CA HỎNG THẬT: 21/08/2026, HAI LƯỢT LIỀN ────────────────────────────────
//
//   10:10 · ✗ ki?n (12.000.000đ) — Lỗi: Nút Thanh toán đang bị khóa.
//   10:15 · ✗ hoa  (9.612.236đ)  — Lỗi: Nút Thanh toán đang bị khóa.
//
// Mất trọn cả hai khách, không ra tờ nào. Và câu ấy chẳng chỉ đường đi đâu.
//
// ── HAI BỆNH KHÁC HẲN NHAU, CÙNG MỘT TRIỆU CHỨNG ───────────────────────────
//
// 1. NHÌN QUÁ SỚM MỘT NHỊP. Đây từng là chốt DUY NHẤT trong bamThanhToan.js
//    không có một giây kiên nhẫn nào: nhìn `disabled` đúng một cái rồi hỏng cả
//    khách. Mà ngay trước đó boVaoGio() vừa kiểm chứng tổng giỏ khớp tuyệt đối
//    rồi trả về, KHÔNG nghỉ một nhịp — giỏ đã đúng, nhưng CHÂN TRANG là một
//    mảnh giao diện khác, React cập nhật chậm hơn là chốt này bắn oan.
//
// 2. CA BÁN HÀNG CHƯA MỞ. Tendoo khóa nút Thanh toán cho tới khi có người bấm
//    "Mở ca". Chờ bao lâu cũng vô ích. Cách chữa chỉ là MỘT CÚ BẤM — nhưng
//    người đọc log không có cách nào đoán ra điều đó.
//
// ⛔ MÁY KHÔNG TỰ BẤM "Mở ca". Mở ca là hành vi nghiệp vụ có hệ quả trên sổ
// sách của chủ cửa hàng — không phải thứ một con máy tự quyết thay.

const assert = require('node:assert');
const { test, ghiChu, chay } = require('./chay');
require('../chung/domReact');
const BoGio = require('../tendoo/boGio');
const T = require('../tendoo/bamThanhToan');
const { taoTrangPos } = require('./trangPosGiaLap');

const { MA } = T;
const THAT = (them = {}) => ({
    nghi: (ms) => new Promise(r => setTimeout(r, ms)),
    hanChoBangMs: 400, nhipChoMs: 10, hanChoThueDong: 200,
    doiSauBam: 200, hanChoQuay: 400, hanChoNutMo: 400, ...them,
});

async function chayMotLuot(tuyChonTrang = {}, tuyChonBam = THAT()) {
    const trang = taoTrangPos({
        gioBanDau: [{ ten: 'Áo khoác dạ dáng dài nữ', soLuong: 2 }],   // 1.980.000
        ...tuyChonTrang,
    });
    const kq = await T.taoLuot().bam(trang.tailieu, {
        choPhep: true, tongMongDoi: 1980000, ...tuyChonBam,
    });
    return { trang, kq };
}

ghiChu('— ⭐⭐ BỆNH 1: nhìn quá sớm một nhịp —');

test('⭐⭐ nút khóa rồi MỞ sau một nhịp → PHẢI CHỜ, đừng hỏng cả khách', async () => {
    // Đây là ca đã làm ki?n (12.000.000đ) và hoa (9.612.236đ) mất trắng.
    const { trang, kq } = await chayMotLuot({ nutTtMoSauMs: 120 });
    assert.strictEqual(kq.ma, MA.XONG, 'thông báo: ' + kq.thongBao);
    assert.strictEqual(trang.daBam.xacNhan, 1, 'phải xác nhận đúng một lần');
});

test('⛔ chờ CÓ HẠN — nút khóa mãi thì vẫn phải dừng', async () => {
    const { trang, kq } = await chayMotLuot({ nutTtKhoa: true }, THAT({ hanChoNutMo: 80 }));
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ma, MA.NUT_BI_KHOA, 'thông báo: ' + kq.thongBao);
    assert.strictEqual(trang.daBam.thanhToan, 0, 'nút đang khóa mà vẫn bấm');
    assert.strictEqual(trang.daBam.xacNhan, 0);
});

test('⭐⭐ React THAY HẲN nút → phải ĐỌC LẠI mỗi vòng, đừng ôm tham chiếu cũ', async () => {
    // ⚠️ Bài ngay trên KHÔNG chứng minh được việc đọc lại: nó bật khóa trên
    // CÙNG một nút, nên ôm tham chiếu cũ vẫn thấy nó mở. Gài lỗi bỏ dòng đọc
    // lại đi mà bài ấy vẫn xanh.
    //
    // Ở đây nút cũ bị tháo ra và khóa VĨNH VIỄN, nút mới đã mở khóa mọc lên
    // thay chỗ. Ai còn ôm tham chiếu cũ thì chờ tới già cũng vô ích.
    const { trang, kq } = await chayMotLuot({ nutTtThayMoiSauMs: 120 });
    assert.strictEqual(kq.ma, MA.XONG, 'thông báo: ' + kq.thongBao);
    assert.strictEqual(trang.daBam.thanhToan, 1, 'không bấm được nút mới');
    assert.strictEqual(trang.daBam.xacNhan, 1);
});

test('⭐ nút mở sẵn thì KHÔNG chờ phí giây nào', async () => {
    const t0 = Date.now();
    const { kq } = await chayMotLuot({}, THAT({ hanChoNutMo: 5000 }));
    assert.strictEqual(kq.ma, MA.XONG, 'thông báo: ' + kq.thongBao);
    assert.ok(Date.now() - t0 < 3000, 'ngồi chờ dù nút đã mở sẵn');
});

ghiChu('— ⭐⭐ BỆNH 2: CA BÁN HÀNG CHƯA MỞ —');

test('⭐⭐⭐ thấy nút "Mở ca" → nói ĐÚNG BỆNH và chỉ đường sửa', async () => {
    // Câu "nút đang bị khóa" chẳng giúp được gì, trong khi cách chữa chỉ là
    // một cú bấm. Đây là điều biến một lỗi khó hiểu thành mười giây thao tác.
    const { trang, kq } = await chayMotLuot(
        { nutTtKhoa: true, coNutMoCa: true }, THAT({ hanChoNutMo: 80 }));
    assert.strictEqual(kq.ma, MA.CA_CHUA_MO, 'thông báo: ' + kq.thongBao);
    assert.match(kq.thongBao, /CA BÁN HÀNG CHƯA MỞ/, kq.thongBao);
    assert.match(kq.thongBao, /bấm "Mở ca"/, 'không chỉ đường sửa: ' + kq.thongBao);
    assert.match(kq.thongBao, /CHƯA phát hành hóa đơn nào/, kq.thongBao);
    assert.strictEqual(trang.daBam.thanhToan, 0);
});

test('⛔⛔ máy TUYỆT ĐỐI KHÔNG tự bấm "Mở ca"', async () => {
    // Mở ca có hệ quả trên sổ sách của chủ cửa hàng. Máy chỉ được nhìn và kể.
    const { trang } = await chayMotLuot(
        { nutTtKhoa: true, coNutMoCa: true }, THAT({ hanChoNutMo: 80 }));
    let daBam = 0;
    trang.tailieu.getElementById('nutMoCa').addEventListener('click', () => { daBam++; });
    // Chạy thêm một lượt nữa với người nghe đã gắn.
    const kq2 = await T.taoLuot().bam(trang.tailieu, {
        choPhep: true, tongMongDoi: 1980000, ...THAT({ hanChoNutMo: 80 }),
    });
    assert.strictEqual(kq2.ma, MA.CA_CHUA_MO);
    assert.strictEqual(daBam, 0, '⛔ MÁY ĐÃ TỰ BẤM "Mở ca" — việc của chủ cửa hàng');
});

test('⭐ ca ĐANG MỞ mà nút vẫn khóa → nói rõ là KHÔNG phải chuyện ca', async () => {
    const { kq } = await chayMotLuot({ nutTtKhoa: true }, THAT({ hanChoNutMo: 80 }));
    assert.strictEqual(kq.ma, MA.NUT_BI_KHOA);
    assert.match(kq.thongBao, /KHÔNG thấy nút "Mở ca"/, kq.thongBao);
    assert.match(kq.thongBao, /vẫn bị khóa sau/, 'không nói đã chờ bao lâu: ' + kq.thongBao);
    assert.match(kq.thongBao, /nút ghi «Thanh toán \(F1\)»/, 'không chép chữ trên nút: ' + kq.thongBao);
    assert.match(kq.thongBao, /giỏ còn 1 dòng/, 'không kể màn hình: ' + kq.thongBao);
});

ghiChu('— timNutMoCa: đúng nút, không quơ bừa —');

test('⛔⛔ "Đóng ca" KHÔNG được nhận nhầm là "Mở ca"', () => {
    // Nhận nhầm là đẩy người dùng đi mở một cái ca đang mở sẵn — sai bệnh,
    // và họ sẽ không bao giờ tìm ra nguyên nhân thật.
    const trang = taoTrangPos({ coNutMoCa: true });
    const n = trang.tailieu.getElementById('nutMoCa');
    assert.ok(T.timNutMoCa(trang.tailieu), 'không nhận ra nút Mở ca');
    n.textContent = 'Đóng ca';
    assert.strictEqual(T.timNutMoCa(trang.tailieu), null, 'nhận nhầm "Đóng ca"');
});

test('⛔ so chữ TUYỆT ĐỐI, không phải chứa-là-được', () => {
    const trang = taoTrangPos({ coNutMoCa: true });
    const n = trang.tailieu.getElementById('nutMoCa');
    for (const chu of ['Hướng dẫn mở ca bán hàng', 'Mở ca?', 'Chưa mở ca', 'mở cửa']) {
        n.textContent = chu;
        assert.strictEqual(T.timNutMoCa(trang.tailieu), null, 'nhận bừa: ' + chu);
    }
    for (const chu of ['Mở ca', 'mở ca', 'MỞ CA', 'Mở  ca']) {
        n.textContent = chu;
        assert.ok(T.timNutMoCa(trang.tailieu), 'bỏ sót: ' + chu);
    }
});

test('⛔ KHÔNG nhận nút "Mở ca" nằm trong bảng nổi', () => {
    // Trang POS lúc nào cũng có mấy bảng quảng cáo đè lên. Vơ nút trong đó là
    // báo sai bệnh cho một cái ca đang mở bình thường.
    const trang = taoTrangPos();
    const m = trang.tailieu.getElementById('bangPosV2').querySelector('.ant-modal-body');
    const n = trang.tailieu.createElement('button');
    n.textContent = 'Mở ca';
    m.appendChild(n);
    assert.strictEqual(T.timNutMoCa(trang.tailieu), null, 'vơ nhầm nút trong bảng nổi');
});

test('trang sạch thì không thấy nút Mở ca nào', () => {
    assert.strictEqual(T.timNutMoCa(taoTrangPos().tailieu), null);
});

ghiChu('— ⛔ KHÔNG NỚI CHỐT NÀO —');

test('⛔⛔ chờ lâu hơn KHÔNG được làm máy bấm khi nút còn khóa', async () => {
    for (const tt of [{ nutTtKhoa: true }, { nutTtKhoa: true, coNutMoCa: true }]) {
        const { trang, kq } = await chayMotLuot(tt, THAT({ hanChoNutMo: 60 }));
        assert.strictEqual(kq.ok, false, JSON.stringify(tt));
        assert.strictEqual(trang.daBam.thanhToan, 0,
            '⛔ ĐÃ BẤM nút đang khóa: ' + JSON.stringify(tt));
        assert.strictEqual(trang.daBam.xacNhan, 0);
        assert.match(kq.thongBao, /CHƯA phát hành hóa đơn nào/, kq.thongBao);
    }
});

test('⛔ giỏ lệch tổng thì vẫn dừng TRƯỚC khi tới chốt nút', async () => {
    const { trang, kq } = await chayMotLuot({ nutTtMoSauMs: 50 },
                                            THAT({ tongMongDoi: 111000 }));
    assert.strictEqual(kq.ma, MA.TONG_KHONG_KHOP, 'thông báo: ' + kq.thongBao);
    assert.strictEqual(trang.daBam.thanhToan, 0);
});

chay('NÚT THANH TOÁN BỊ KHÓA');
