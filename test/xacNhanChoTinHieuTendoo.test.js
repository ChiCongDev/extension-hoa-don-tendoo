'use strict';

// SAU KHI BẤM «XÁC NHẬN»: CHỜ THEO TÍN HIỆU CỦA TENDOO, GHI LẠI LỜI TENDOO NÓI,
// VÀ KỂ ĐỦ BA CON SỐ TỔNG GIỎ KHI KHÔNG ĐỌC ĐƯỢC.
// Chạy: node test/xacNhanChoTinHieuTendoo.test.js   (cần jsdom)
//
// ── CA HỎNG THẬT: 03/11/2026 ────────────────────────────────────────────────
//   19:45 · Thùy Dương S3 — «Đã bấm "Xác nhận" nhưng giỏ vẫn còn hàng sau 8 giây —
//           KHÔNG RÕ… Cú bấm ĐÃ NỔI TỚI TRANG … bảng xác nhận VẪN đang mở.»
//           Nút Xác nhận KHÔNG quay, nên máy bỏ cuộc dù Tendoo còn đang làm.
//   18:35 · Hải Đăng Sport — «Không đọc được "Tổng thanh toán" … Tổng: không đọc
//           được.» Không biết nguồn nào lệch với nguồn nào.
//
// Đọc mã Tendoo: lúc xử lý đơn nó bật một LỚP PHỦ MỜ phủ kín trang
// (`fixed inset-0 z-[9999]`), gọi máy chủ phát hành hóa đơn, rồi mới đóng bảng và
// làm trống giỏ; lỗi thì hiện thông báo nổi tự tắt sau ~3 giây.
//
// ⛔ Chờ lâu hơn CHỈ NHÌN. Tuyệt đối không bấm «Xác nhận» lần thứ hai.

const assert = require('node:assert');
const { test, ghiChu, chay } = require('./chay');
const { JSDOM } = require(process.env.HDT_JSDOM || 'jsdom');
require('../chung/domReact');
const BoGio = require('../tendoo/boGio');
const T = require('../tendoo/bamThanhToan');
const NhipDo = require('../chung/nhipDo');
const { taoTrangPos, HANG_MAU } = require('./trangPosGiaLap');

const { MA } = T;
const THAT = (them = {}) => ({
    nghi: (ms) => new Promise(r => setTimeout(r, ms)),
    hanChoBangMs: 400, nhipChoMs: 10, hanChoThueDong: 200,
    doiSauBam: 100, hanChoQuay: 1500, hanChoNutMo: 400, ...them,
});
const GIO = [{ ten: 'Áo khoác dạ dáng dài nữ', soLuong: 2 }];   // 1.980.000

async function chayMotLuot(tuyChonTrang = {}, tuyChonBam = {}) {
    const trang = taoTrangPos({ gioBanDau: GIO, ...tuyChonTrang });
    const kq = await T.taoLuot().bam(trang.tailieu, {
        choPhep: true, tongMongDoi: 1980000, ...THAT(tuyChonBam),
    });
    return { trang, kq };
}

ghiChu('— hạn chờ thật đã được nâng —');

test('⭐ các hạn chờ thật của Tendoo POS đã nâng lên (30 giây / trần ~80 giây)', () => {
    // Đọc giá trị gốc từ file, không từ bản đã rút ngắn cho test.
    const goc = require('node:fs').readFileSync(
        require('node:path').join(__dirname, '..', 'chung', 'nhipDo.js'), 'utf8');
    const lay = (k) => Number((goc.match(new RegExp(k + ':\\s*(\\d+)')) || [])[1]);
    assert.strictEqual(lay('HAN_CHO_DONG_GIO'), 30000);
    assert.strictEqual(lay('HAN_CHO_NUT_MO_KHOA'), 30000);
    assert.strictEqual(lay('HAN_CHO_BANG_XAC_NHAN'), 30000);
    assert.strictEqual(lay('HAN_CHO_GIO_VE_DU'), 30000);
    assert.strictEqual(lay('HAN_CHO_GIO_TRONG') + lay('HAN_CHO_TENDOO_QUAY'), 80000,
        'trần bước Xác nhận phải là 80 giây');
    assert.strictEqual(lay('HAN_CHO_BANG'), 8000, 'HAN_CHO_BANG của trang Sell không được đổi');
    assert.ok(NhipDo.NHIP_GIA_HAN_KHOA_MS > 0);
});

ghiChu('— lớp phủ «đang xử lý» của Tendoo = Tendoo còn làm → chờ tiếp —');

test('⭐⭐ lớp phủ che ~600ms, nút KHÔNG quay, vượt xa hạn 100ms → vẫn chờ rồi XONG', async () => {
    const { trang, kq } = await chayMotLuot({ lopPhuMs: 600 });
    assert.strictEqual(kq.ma, MA.XONG, 'bỏ cuộc dù Tendoo còn đang làm: ' + kq.thongBao);
    assert.strictEqual(trang.daBam.xacNhan, 1, 'bấm Xác nhận không đúng một lần');
});
test('⛔⛔ lớp phủ kẹt MÃI → hết trần vẫn KHÔNG RÕ, và KHÔNG bấm Xác nhận lần hai', async () => {
    const { trang, kq } = await chayMotLuot({ lopPhuMs: 100000 }, { hanChoQuay: 300 });
    assert.strictEqual(kq.ma, MA.KHONG_RO, 'thông báo: ' + kq.thongBao);
    assert.strictEqual(trang.daBam.xacNhan, 1, '⛔ đã bấm Xác nhận lần hai!');
});
test('⭐ KHÔNG có tín hiệu nào (không lớp phủ, nút không quay) → kết luận NGAY, không chờ trần', async () => {
    const t0 = Date.now();
    const { trang, kq } = await chayMotLuot({ giuGioSauXacNhan: true }, { hanChoQuay: 5000 });
    assert.strictEqual(kq.ma, MA.KHONG_RO);
    assert.ok(Date.now() - t0 < 2000, 'chờ hết trần dù Tendoo đã thôi làm');
    assert.strictEqual(trang.daBam.xacNhan, 1);
});

ghiChu('— tendooDangXuLy: chỉ nhận đúng lớp phủ —');

const trangTu = (html) => new JSDOM('<!doctype html><body>' + html + '</body>').window.document;
test('lớp phủ fixed inset-0 z-[9999] đang hiện → true', () => {
    assert.strictEqual(T.tendooDangXuLy(trangTu('<div class="fixed inset-0 z-[9999]"><div class="ant-spin"></div></div>')), true);
});
test('lớp phủ đã ẩn (display:none) → false', () => {
    assert.strictEqual(T.tendooDangXuLy(trangTu('<div class="fixed inset-0 z-[9999]" style="display:none"></div>')), false);
});
test('thẻ fixed khác (không phải lớp phủ z-[9999]) → false', () => {
    assert.strictEqual(T.tendooDangXuLy(trangTu('<div class="fixed bottom-4 right-4 z-50">Bảng nổi</div>')), false);
    assert.strictEqual(T.tendooDangXuLy(trangTu('<div class="fixed inset-0 z-50"></div>')), false);
});
test('⛔ bảng nổi của CHÍNH MÌNH (id hdt-…) không phải tín hiệu của Tendoo', () => {
    assert.strictEqual(T.tendooDangXuLy(trangTu('<div id="hdt-bang" class="fixed inset-0 z-[9999]"></div>')), false);
});
test('không có gì → false, không nổ', () => {
    assert.strictEqual(T.tendooDangXuLy(trangTu('')), false);
    assert.strictEqual(T.tendooDangXuLy({}), false);
});

ghiChu('— ghi lại thông báo nổi tự tắt của Tendoo —');

test('⭐⭐ Tendoo báo «Tạo đơn thất bại» rồi tự tắt sau 150ms → vẫn kể lại trong thông báo lỗi', async () => {
    const { trang, kq } = await chayMotLuot(
        { xacNhanToast: { chu: 'Tạo đơn thất bại', ms: 150 } }, { doiSauBam: 600, hanChoQuay: 100 });
    assert.strictEqual(kq.ma, MA.KHONG_RO);
    assert.match(kq.thongBao, /Tendoo đã báo trong lúc chờ/);
    assert.match(kq.thongBao, /Tạo đơn thất bại/);
    assert.deepStrictEqual(kq.thongBaoTendoo, ['Tạo đơn thất bại']);
    assert.strictEqual(trang.daBam.xacNhan, 1);
    assert.strictEqual(trang.tailieu.querySelector('.ant-message-notice-content'), null,
        'thông báo phải đã tự tắt — nếu còn thì test không chứng minh được gì');
});
test('⭐ Tendoo không hiện thông báo nào → nói rõ điều đó', async () => {
    const { kq } = await chayMotLuot({ giuGioSauXacNhan: true }, { doiSauBam: 100, hanChoQuay: 100 });
    assert.strictEqual(kq.ma, MA.KHONG_RO);
    assert.match(kq.thongBao, /KHÔNG hiện thông báo nào/);
    assert.deepStrictEqual(kq.thongBaoTendoo, []);
});
test('⭐ thành công thì KHÔNG dính chữ thông báo', async () => {
    const { kq } = await chayMotLuot();
    assert.strictEqual(kq.ma, MA.XONG);
    assert.doesNotMatch(kq.thongBao, /Tendoo đã báo/);
});

ghiChu('— không đọc được tổng giỏ → kể đủ ba phép đọc —');

test('⭐⭐ chân giỏ LỆCH vĩnh viễn → thông báo mang theo cả ba con số', async () => {
    const g = HANG_MAU[0];
    const trang = taoTrangPos({ gioBanDau: [], giaoDienMoi: true, khongCoDongTong: true,
                                chanGioLech: g.gia + 500000 });
    const kq = await BoGio.boVaoGio(trang.tailieu,
        [{ id: g.id, ten: g.ten, gia: g.gia, ma: g.ma, soLuong: 1 }],
        { nghi: (ms) => new Promise(r => setTimeout(r, ms)), doiVeLuoi: 150, nhipNhin: 10 });
    assert.strictEqual(kq.ok, false);
    assert.match(kq.thongBao, /nhãn .* chân giỏ .* cộng dòng/,
        'thông báo lỗi không kể ba phép đọc tổng: ' + kq.thongBao);
});
test('⭐ keLaiGio khi đọc được tổng thì KHÔNG thêm đuôi dài dòng', () => {
    const trang = taoTrangPos({ gioBanDau: GIO });
    assert.doesNotMatch(BoGio.keLaiGio(trang.tailieu), /Các phép đọc tổng/);
});

chay('XÁC NHẬN: CHỜ THEO TÍN HIỆU CỦA TENDOO');
