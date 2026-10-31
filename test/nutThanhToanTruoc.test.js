'use strict';

// NÚT «THANH TOÁN TRƯỚC» — máy không được bấm nhầm vào nó.
// Chạy: node test/nutThanhToanTruoc.test.js   (cần jsdom)
//
// ── CA HỎNG THẬT: 31/10/2026, khách Trang Bé TB, ba lượt liền ───────────────
//
//   10:35 · 10:37 · 10:38 — «Bấm Thanh toán nhưng Tendoo hiện một bảng khác:
//   «Thanh toán trước Tổng tiền thanh toán: 4.470.000 … Khách còn nợ …»
//
// Chân giỏ Tendoo mọc thêm nút xám «Thanh toán trước» đứng TRƯỚC nút đỏ
// «Thanh toán & Xuất hóa đơn (F1)». Bản cũ lấy nút ĐẦU TIÊN chứa chữ
// "thanh toán" nên bấm nhầm nút xám. (Đo trực tiếp trên trang thật.)

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

async function chayMotLuot(tuyChonTrang = {}) {
    const trang = taoTrangPos({ gioBanDau: GIO, ...tuyChonTrang });
    const kq = await T.taoLuot().bam(trang.tailieu, {
        choPhep: true, tongMongDoi: 1980000, ...THAT(),
    });
    return { trang, kq };
}

ghiChu('— chân giỏ có CẢ HAI nút —');

test('⭐⭐ «Thanh toán trước» đứng trước nút đỏ → máy bấm ĐÚNG nút đỏ, ra hóa đơn', async () => {
    const { trang, kq } = await chayMotLuot({ giaoDienMoi: true, nutThanhToanTruoc: true });
    assert.strictEqual(trang.daBam.thanhToanTruoc, 0, 'đã bấm nhầm nút «Thanh toán trước»');
    assert.strictEqual(trang.daBam.thanhToan, 1, 'không bấm nút Thanh toán thật');
    assert.strictEqual(kq.ma, MA.XONG, 'thông báo: ' + kq.thongBao);
    assert.strictEqual(trang.daBam.xacNhan, 1);
});
test('⭐ timNutThanhToan trả về nút «Xuất hóa đơn», không phải nút «Thanh toán trước»', () => {
    const trang = taoTrangPos({ gioBanDau: GIO, giaoDienMoi: true, nutThanhToanTruoc: true });
    const nut = T.timNutThanhToan(trang.tailieu);
    assert.ok(nut, 'không tìm được nút nào');
    assert.match(nut.textContent, /Xuất hóa đơn/);
    assert.doesNotMatch(nut.textContent, /trước/i);
});

ghiChu('— không phân biệt được thì DỪNG, không đoán —');

test('⛔ có «Thanh toán trước» và nút Thanh toán không ghi «Xuất hóa đơn» → KHÔNG bấm gì', async () => {
    // Chân giỏ hai nút nhưng nút thật không có chữ «Xuất hóa đơn» (công tắc tắt).
    const { trang, kq } = await chayMotLuot({
        giaoDienMoi: true, hoaDonDienTu: false, nutThanhToanTruoc: true });
    assert.strictEqual(trang.daBam.thanhToanTruoc, 0, 'bấm nhầm nút «Thanh toán trước»');
    assert.strictEqual(trang.daBam.thanhToan, 0, 'bấm nút khi chưa chắc là nút nào');
    assert.strictEqual(trang.daBam.xacNhan, 0);
    assert.strictEqual(kq.ok, false);
});
test('⛔ chỉ có «Thanh toán trước», không có nút phát hành → KHÔNG tìm thấy nút', () => {
    const trang = taoTrangPos({ gioBanDau: GIO, nutThanhToanTruoc: true });
    trang.tailieu.getElementById('nutThanhToan').remove();
    assert.strictEqual(T.timNutThanhToan(trang.tailieu), null);
});

ghiChu('— giao diện cũ giữ NGUYÊN —');

test('⭐ giao diện cũ (một nút «Thanh toán (F1)») → vẫn chạy như trước', async () => {
    const { trang, kq } = await chayMotLuot();
    assert.strictEqual(kq.ma, MA.XONG, 'thông báo: ' + kq.thongBao);
    assert.strictEqual(trang.daBam.xacNhan, 1);
});

chay('NÚT THANH TOÁN TRƯỚC');
