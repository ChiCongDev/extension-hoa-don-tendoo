'use strict';

// Test cho việc ĐỌC bảng báo cáo của Sell.
// Chạy: node test/docBang.test.js   (cần biến HDT_JSDOM trỏ tới gói jsdom)

const assert = require('node:assert');
const { JSDOM } = require(process.env.HDT_JSDOM || 'jsdom');
const { test, chay } = require('./chay');
const { taoTrang, KHACH_MAU } = require('./trangGiaLap');
const DocBang = require('../sell/docBang');

function dungBang(tuyChon) {
    const dom = new JSDOM(taoTrang(tuyChon));
    return dom.window.document.getElementById('tableKhachHang');
}

// ------------------------------------------------------------ đọc số tiền
test('đọc "134.040.000" ra 134040000', () => {
    assert.strictEqual(DocBang.docSoTien('134.040.000'), 134040000);
});

test('đọc số âm "-1.235.000"', () => {
    assert.strictEqual(DocBang.docSoTien('-1.235.000'), -1235000);
});

test('đọc số lẻ không tròn nghìn "4.339.999"', () => {
    assert.strictEqual(DocBang.docSoTien('4.339.999'), 4339999);
});

test('đọc số có kèm chữ và khoảng trắng " 1.090.000 đ "', () => {
    assert.strictEqual(DocBang.docSoTien(' 1.090.000 đ '), 1090000);
});

test('ô "---" và ô rỗng trả về null, KHÔNG trả về 0', () => {
    assert.strictEqual(DocBang.docSoTien('---'), null);
    assert.strictEqual(DocBang.docSoTien(''), null);
    assert.strictEqual(DocBang.docSoTien(null), null);
});

test('số 0 vẫn là số 0, không nhầm thành null', () => {
    assert.strictEqual(DocBang.docSoTien('0'), 0);
});

// ------------------------------------------------------------ tìm cột
test('tìm đúng vị trí cột theo tiêu đề (vai trò admin)', () => {
    const bang = dungBang();
    assert.strictEqual(DocBang.viTriCot(bang, 'mã kh'), 1);
    assert.strictEqual(DocBang.viTriCot(bang, 'tên khách hàng'), 2);
    assert.strictEqual(DocBang.viTriCot(bang, 'doanh thu'), 4);
});

test('KHÔNG đếm cứng: vai trò nhân viên bán hàng ẩn 3 cột, vẫn tìm đúng', () => {
    const bang = dungBang({ isNVBH: true });
    assert.strictEqual(DocBang.viTriCot(bang, 'doanh thu'), 4);
    assert.strictEqual(DocBang.viTriCot(bang, 'giá vốn'), -1, 'cột giá vốn phải bị ẩn');
    // Cột Chi tiết dịch từ vị trí 8 về vị trí 5 khi ẩn 3 cột.
    assert.strictEqual(DocBang.viTriCot(bang, 'chi tiết'), 5);
});

test('tiêu đề không tồn tại thì trả -1, không nổ', () => {
    assert.strictEqual(DocBang.viTriCot(dungBang(), 'không có cột này'), -1);
});

// ------------------------------------------------------------ đọc dòng
test('đọc đúng 4 khách xuất hóa đơn được (bỏ khách lẻ và khách doanh thu 0)', () => {
    const ds = DocBang.docCacDong(dungBang());
    assert.strictEqual(ds.length, 4);
    assert.deepStrictEqual(ds.map(k => k.maKH), ['PA', 'TB', '10Q', 'PA2']);
});

test('KHÔNG lấy khách lẻ — không có id thì không gắn được tài khoản Tendoo', () => {
    const ds = DocBang.docCacDong(dungBang());
    assert.ok(!ds.some(k => k.maKH === 'LE'), 'khách lẻ lọt vào danh sách');
});

test('KHÔNG lấy khách doanh thu 0 — không có gì để xuất hóa đơn', () => {
    const ds = DocBang.docCacDong(dungBang());
    assert.ok(!ds.some(k => k.maKH === 'X0'), 'khách doanh thu 0 lọt vào danh sách');
});

test('doanh thu đọc ra đúng con số của từng khách', () => {
    const ds = DocBang.docCacDong(dungBang());
    assert.strictEqual(ds[0].doanhThu, 134040000);
    assert.strictEqual(ds[1].doanhThu, 115825000);
    assert.strictEqual(ds[3].doanhThu, 4339999);
});

test('lấy đúng id khách hàng từ nút Chi tiết', () => {
    const ds = DocBang.docCacDong(dungBang());
    assert.strictEqual(ds[0].khachHangId, 1);
    assert.strictEqual(ds[2].khachHangId, 11);
});

test('tên khách có dấu tiếng Việt đọc nguyên vẹn', () => {
    const ds = DocBang.docCacDong(dungBang());
    assert.strictEqual(ds[0].tenKH, 'Phương Anh - PA');
    assert.strictEqual(ds[2].tenKH, 'CTV Thủy 10Q');
});

test('vai trò nhân viên bán hàng: vẫn đọc đúng doanh thu dù bảng ít cột hơn', () => {
    const ds = DocBang.docCacDong(dungBang({ isNVBH: true }));
    assert.strictEqual(ds.length, 4);
    assert.strictEqual(ds[0].doanhThu, 134040000);
});

test('bảng đang tải (chưa có dòng nào) trả mảng rỗng, không nổ', () => {
    assert.deepStrictEqual(DocBang.docCacDong(dungBang({ dangTai: true })), []);
});

test('bảng không có dữ liệu trả mảng rỗng', () => {
    assert.deepStrictEqual(DocBang.docCacDong(dungBang({ khach: [] })), []);
});

test('truyền null thay vì bảng cũng không nổ', () => {
    assert.deepStrictEqual(DocBang.docCacDong(null), []);
});

chay('ĐỌC BẢNG BÁO CÁO CỦA SELL');
