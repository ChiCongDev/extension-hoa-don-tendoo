'use strict';

// BẢNG XÁC NHẬN LÀ DRAWER — đã đóng thì KHÔNG được tính là đang mở.
// Chạy: node test/bangXacNhanDrawer.test.js   (cần jsdom)
//
// ── ĐO TRÊN TRANG THẬT 31/10/2026 ───────────────────────────────────────────
//
// Bảng «Xác nhận thanh toán» mới là `.ant-drawer-content.payment-confirm-drawer`.
// Đóng rồi nó VẪN nằm trong trang, chữ bên trong vẫn đọc được, và được ẩn bằng
// class `ant-drawer-content-wrapper-hidden` (CSS ra display:none) — không có
// `style="display:none"`. Bản cũ chỉ nhìn thuộc tính inline nên vẫn trả về
// bảng cũ: sang khách kế tiếp, máy "thấy" bảng trước khi bảng mới kịp mở.

const assert = require('node:assert');
const { test, ghiChu, chay } = require('./chay');
const { JSDOM } = require(process.env.HDT_JSDOM || 'jsdom');
require('../chung/domReact');
require('../tendoo/boGio');
const T = require('../tendoo/bamThanhToan');

const drawer = (lopWrapper, ghiThem = '') => new JSDOM(`<!doctype html><body>
  ${ghiThem}
  <div class="ant-drawer ant-drawer-right">
    <div class="ant-drawer-content-wrapper ${lopWrapper}">
      <div class="ant-drawer-content payment-confirm-drawer" role="dialog">
        <div>Xác nhận thanh toán</div>
        <div>Khách cần trả 590.000</div>
        <button>Xác nhận</button>
      </div>
    </div>
  </div></body>`).window.document;

ghiChu('— drawer ĐANG MỞ vẫn nhận ra —');

test('⭐ drawer đang mở → nhận ra là bảng xác nhận', () => {
    const tl = drawer('');
    assert.ok(T.timBangXacNhan(tl), 'bảng đang mở mà không nhận ra');
});

ghiChu('— drawer ĐÃ ĐÓNG không được tính là đang mở —');

test('⭐⭐ drawer đã đóng (class ẩn của Ant) → KHÔNG tính là bảng đang mở', () => {
    const tl = drawer('ant-drawer-content-wrapper-hidden');
    assert.strictEqual(T.timBangXacNhan(tl), null,
        'bảng ĐÃ ĐÓNG vẫn bị coi là đang mở');
});
test('⭐ drawer đã đóng bằng CSS (display:none tính ra) → không tính là đang mở', () => {
    const tl = drawer('dong', '<style>.dong{display:none}</style>');
    assert.strictEqual(T.timBangXacNhan(tl), null);
});
test('⭐ bảng đã đóng không bị coi là bảng chặn đường', () => {
    const tl = drawer('ant-drawer-content-wrapper-hidden');
    assert.strictEqual(T.timBangChanDuong(tl), null);
});

ghiChu('— kiểu ẩn cũ vẫn ẩn —');

test('⭐ style="display:none" kiểu cũ vẫn được coi là ẩn', () => {
    const tl = new JSDOM(`<!doctype html><body>
      <div class="ant-modal-wrap" style="display:none">
        <div role="dialog" class="ant-modal">Xác nhận thanh toán</div></div></body>`).window.document;
    assert.strictEqual(T.timBangXacNhan(tl), null);
});

chay('BẢNG XÁC NHẬN LÀ DRAWER');
