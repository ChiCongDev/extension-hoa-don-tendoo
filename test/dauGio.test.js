'use strict';

// ============================================================================
//  TEST DẤU GIỎ — máy chỉ được xóa thứ do CHÍNH NÓ tạo ra
//
//  Hai điều phải giữ, và chúng kéo ngược nhau:
//    1. Giỏ còn sót do lần chạy hỏng -> tự dọn, đừng bắt người dùng xóa tay.
//    2. Giỏ do NGƯỜI DÙNG tự chọn   -> tuyệt đối không đụng vào.
//  Cả file này chỉ để chứng minh máy phân biệt được hai thứ đó.
// ============================================================================

const assert = require('node:assert');
const { test, ghiChu, chay } = require('./chay');
const DauGio = require('../chung/dauGio');

const DON = [
    { ten: 'Quần Jogger thể thao nữ', gia: 490000, soLuong: 1 },
    { ten: 'Áo Gilet phao Thu Đông nữ', gia: 890000, soLuong: 2 },
];

/** Giỏ trên màn hình, đúng hình dạng docCacDongGio trả về. */
const gio = (...cac) => cac.map(c => ({
    chu: `${c.ten} ${c.soLuong} ${(c.gia * c.soLuong).toLocaleString('vi-VN')}`,
    soLuong: c.soLuong,
}));

const TONG = 490000 + 890000 * 2;

ghiChu('— Ghi dấu —');

test('dấu ghi đủ khách, số dòng, tổng và từng món', () => {
    const d = DauGio.taoDau({ maKH: 'PA', danhSach: DON, tong: TONG, luc: 111 });
    assert.strictEqual(d.maKH, 'PA');
    assert.strictEqual(d.soDong, 2);
    assert.strictEqual(d.tong, TONG);
    assert.strictEqual(d.luc, 111);
    assert.deepStrictEqual(d.cacDong,
        [{ ten: DON[0].ten, soLuong: 1 }, { ten: DON[1].ten, soLuong: 2 }]);
});

test('dấu KHÔNG mang giá hay mã sản phẩm — chỉ đủ để nhận ra giỏ của mình', () => {
    const d = DauGio.taoDau({ maKH: 'PA', danhSach: DON, tong: TONG });
    const chuoi = JSON.stringify(d);
    assert.ok(!chuoi.includes('890000'), 'dấu mang cả giá từng món — thừa');
    for (const k of Object.keys(d.cacDong[0])) {
        assert.ok(['ten', 'soLuong'].includes(k), 'dấu có trường thừa: ' + k);
    }
});

test('bỏ qua dòng không có tên, không tính vào số dòng', () => {
    const d = DauGio.taoDau({ danhSach: [{ ten: '', soLuong: 3 }, DON[0]] });
    assert.strictEqual(d.soDong, 1);
});

ghiChu('— ⭐ Nhận ra giỏ CỦA MÌNH —');

test('giỏ y hệt dấu → KHỚP', () => {
    const d = DauGio.taoDau({ maKH: 'PA', danhSach: DON, tong: TONG });
    const kt = DauGio.khopVoiGio(d, gio(...DON), TONG);
    assert.strictEqual(kt.khop, true, kt.lyDo);
});

test('thứ tự dòng trong giỏ khác đi vẫn KHỚP', () => {
    const d = DauGio.taoDau({ danhSach: DON, tong: TONG });
    const kt = DauGio.khopVoiGio(d, gio(DON[1], DON[0]), TONG);
    assert.strictEqual(kt.khop, true, kt.lyDo);
});

test('không đọc được tổng → vẫn khớp theo từng món, không suy diễn', () => {
    const d = DauGio.taoDau({ danhSach: DON, tong: TONG });
    assert.strictEqual(DauGio.khopVoiGio(d, gio(...DON), null).khop, true);
});

ghiChu('— ⛔ KHÔNG được nhận nhầm giỏ người dùng —');

test('chưa từng ghi dấu → KHÔNG khớp (không mặc định là của mình)', () => {
    assert.strictEqual(DauGio.khopVoiGio(null, gio(...DON), TONG).khop, false);
    assert.strictEqual(DauGio.khopVoiGio({ cacDong: [] }, gio(...DON), TONG).khop, false);
});

test('giỏ thừa một món → KHÔNG khớp', () => {
    const d = DauGio.taoDau({ danhSach: DON, tong: TONG });
    const them = { ten: 'Giày Boots nữ cổ ngắn da mềm', gia: 1400000, soLuong: 1 };
    const kt = DauGio.khopVoiGio(d, gio(...DON, them), TONG + 1400000);
    assert.strictEqual(kt.khop, false);
    assert.match(kt.lyDo, /3 dòng/);
});

test('giỏ thiếu một món → KHÔNG khớp', () => {
    const d = DauGio.taoDau({ danhSach: DON, tong: TONG });
    assert.strictEqual(DauGio.khopVoiGio(d, gio(DON[0]), 490000).khop, false);
});

test('⭐ đúng món nhưng SỐ LƯỢNG khác → KHÔNG khớp', () => {
    // Người dùng bấm dấu + trên một dòng là giỏ đã khác. Không được coi là của mình.
    const d = DauGio.taoDau({ danhSach: DON, tong: TONG });
    // Kiểm cả khi tổng đọc không được — để chắc chắn chặn được nhờ SỐ LƯỢNG
    // chứ không phải nhờ ăn may ở phép so tổng.
    const kt = DauGio.khopVoiGio(d, gio(DON[0], { ...DON[1], soLuong: 3 }), null);
    assert.strictEqual(kt.khop, false);
    assert.match(kt.lyDo, /Áo Gilet/);
});

test('⭐ đúng món đúng số lượng nhưng TỔNG lệch → KHÔNG khớp', () => {
    // Tendoo có giảm giá / đổi giá thì tổng đổi — giỏ không còn là thứ mình để lại.
    const d = DauGio.taoDau({ danhSach: DON, tong: TONG });
    const kt = DauGio.khopVoiGio(d, gio(...DON), TONG - 1);
    assert.strictEqual(kt.khop, false);
    assert.match(kt.lyDo, /Tổng giỏ/);
});

test('giỏ toàn hàng khác hẳn → KHÔNG khớp', () => {
    const d = DauGio.taoDau({ danhSach: DON, tong: TONG });
    const la = [{ ten: 'Set Tất Đen Cổ Ngắn', gia: 50000, soLuong: 1 },
                { ten: 'Giày lười (Loafer) da nữ', gia: 1150000, soLuong: 1 }];
    assert.strictEqual(DauGio.khopVoiGio(d, gio(...la), 1200000).khop, false);
});

test('⭐ hai món TRÙNG TÊN: mỗi dấu chỉ được ghép vào MỘT dòng giỏ', () => {
    // Ghép cẩu thả thì một dòng giỏ khớp cả hai dấu, và một giỏ 1 dòng lại được
    // coi là khớp với dấu 2 dòng.
    const trung = [{ ten: 'Áo thun', gia: 100000, soLuong: 1 },
                   { ten: 'Áo thun', gia: 100000, soLuong: 1 }];
    const d = DauGio.taoDau({ danhSach: trung, tong: 200000 });
    assert.strictEqual(DauGio.khopVoiGio(d, gio(...trung), 200000).khop, true);
    // Giỏ chỉ còn MỘT dòng thì phải là không khớp.
    assert.strictEqual(DauGio.khopVoiGio(d, gio(trung[0]), 100000).khop, false);
});

ghiChu('— Mô tả cho người đọc —');

test('mô tả nói rõ mấy món, của khách nào, lúc nào', () => {
    const d = DauGio.taoDau({ maKH: 'PA', danhSach: DON, tong: TONG, luc: Date.UTC(2026, 7, 12, 3, 34) });
    const m = DauGio.moTa(d);
    assert.match(m, /2 món/);
    assert.match(m, /PA/);
    assert.match(m, /12\/8\/2026|2026/);
});

test('không có dấu → mô tả rỗng, không nổ', () => {
    assert.strictEqual(DauGio.moTa(null), '');
});

ghiChu('— Nơi cất dấu —');

test('không có chrome → dùng bộ nhớ tạm, không nổ', async () => {
    const lt = DauGio.taoLuuTru(null);
    assert.strictEqual(await lt.doc(), null);
    await lt.ghi({ soDong: 1 });
    assert.deepStrictEqual(await lt.doc(), { soDong: 1 });
});

test('ghi null → xóa hẳn khỏi kho', async () => {
    let kho = {};
    const chromeGia = { storage: { local: {
        async get(k) { return kho[k] ? { [k]: kho[k] } : {}; },
        async set(o) { Object.assign(kho, o); },
        async remove(k) { delete kho[k]; },
    } } };
    const lt = DauGio.taoLuuTru(chromeGia);
    await lt.ghi({ soDong: 2 });
    assert.ok(kho[DauGio.KHOA_LUU]);
    await lt.ghi(null);
    assert.strictEqual(kho[DauGio.KHOA_LUU], undefined);
    assert.strictEqual(await lt.doc(), null);
});

chay('DẤU GIỎ — chỉ xóa thứ do chính mình tạo ra');
