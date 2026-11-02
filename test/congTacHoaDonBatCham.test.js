'use strict';

// CÔNG TẮC «HÓA ĐƠN ĐIỆN TỬ» BẬT CHẬM — phải CHỜ, đừng dừng oan.
// Chạy: node test/congTacHoaDonBatCham.test.js   (cần jsdom)
//
// ── CA HỎNG THẬT: 31/10/2026 18:15, khách Hồng Huệ -S8 (1.499.000đ) ─────────
//
//   «CÔNG TẮC "Hóa đơn điện tử" ở chân giỏ đang TẮT. Bấm lúc này chỉ chốt đơn…»
//
// Trong khi cửa hàng này luôn để công tắc BẬT. Đo trên trang thật 02/11/2026:
// mỗi đơn mới khởi đầu với công tắc TẮT, và chỉ TỰ BẬT sau khi Tendoo tải xong
// cấu hình hóa đơn điện tử từ máy chủ. Ngay sau khi mở trang (đúng cảnh mỗi lần
// đổi khách) giỏ đã có hàng, tổng đã khớp, mà công tắc còn tắt thêm ~270ms. Bản
// cũ nhìn ĐÚNG MỘT LẦN rồi dừng.
//
// ⛔ CHỜ CHỈ NHÌN. Công tắc TẮT THẬT thì hết hạn vẫn DỪNG, KHÔNG bấm gì.

const assert = require('node:assert');
const { test, ghiChu, chay } = require('./chay');
require('../chung/domReact');
require('../tendoo/boGio');
const T = require('../tendoo/bamThanhToan');
const { taoTrangPos } = require('./trangPosGiaLap');

const { MA } = T;
const THAT = (them = {}) => ({
    nghi: (ms) => new Promise(r => setTimeout(r, ms)),
    hanChoBangMs: 400, nhipChoMs: 10, hanChoThueDong: 200,
    doiSauBam: 200, hanChoQuay: 400, hanChoNutMo: 400, ...them,
});
const GIO = [{ ten: 'Áo khoác dạ dáng dài nữ', soLuong: 2 }];   // 1.980.000

async function chayMotLuot(tuyChonTrang = {}, tuyChonBam = {}) {
    const trang = taoTrangPos({ gioBanDau: GIO, giaoDienMoi: true, ...tuyChonTrang });
    const kq = await T.taoLuot().bam(trang.tailieu, {
        choPhep: true, tongMongDoi: 1980000, ...THAT(tuyChonBam),
    });
    return { trang, kq };
}

ghiChu('— công tắc bật CHẬM thì phải chờ —');

test('⭐⭐ công tắc tắt rồi TỰ BẬT sau ~120ms → chờ, rồi ra hóa đơn', async () => {
    const { trang, kq } = await chayMotLuot({ hoaDonDienTu: false, hddtBatSauMs: 120 });
    assert.strictEqual(kq.ma, MA.XONG, 'dừng oan: ' + kq.thongBao);
    assert.strictEqual(trang.daBam.xacNhan, 1);
});
test('⭐ công tắc đã BẬT sẵn → đi ngay, không chờ thêm', async () => {
    const t0 = Date.now();
    const { kq } = await chayMotLuot({ hoaDonDienTu: true });
    assert.strictEqual(kq.ma, MA.XONG, 'thông báo: ' + kq.thongBao);
    assert.ok(Date.now() - t0 < 1500, 'chờ thừa khi công tắc đã bật sẵn');
});

ghiChu('— tắt THẬT vẫn bị chặn —');

test('⛔⛔ công tắc tắt thật → chờ hết hạn rồi DỪNG, KHÔNG bấm gì', async () => {
    const { trang, kq } = await chayMotLuot({ hoaDonDienTu: false });
    assert.strictEqual(kq.ok, false, 'đã bấm trong khi công tắc tắt!');
    assert.strictEqual(kq.ma, MA.HOA_DON_DIEN_TU_TAT, 'mã lạ: ' + kq.ma);
    assert.strictEqual(trang.daBam.thanhToan, 0, 'đã bấm Thanh toán');
    assert.strictEqual(trang.daBam.xacNhan, 0);
    assert.match(kq.thongBao, /F5/, 'thiếu gợi ý tải lại trang');
});
test('⛔ công tắc bật SAU hạn chờ → vẫn DỪNG (không chờ vô tận)', async () => {
    const { trang, kq } = await chayMotLuot(
        { hoaDonDienTu: false, hddtBatSauMs: 900 }, { hanChoNutMo: 150 });
    assert.strictEqual(kq.ma, MA.HOA_DON_DIEN_TU_TAT, 'thông báo: ' + kq.thongBao);
    assert.strictEqual(trang.daBam.thanhToan, 0);
});

chay('CÔNG TẮC HÓA ĐƠN ĐIỆN TỬ BẬT CHẬM');
