'use strict';

// Test phần GHI NHẬN CỬA HÀNG đang đăng nhập trên trang Tendoo.
// Không mạng, không trình duyệt: Local Storage được thay bằng đối tượng giả.

const assert = require('node:assert');
const { test, ghiChu, chay } = require('./chay');
const GhiNhan = require('../tendoo/ghiNhanCuaHang');

const MA_THAT = '2c683a17-09ab-4655-8dbf-50ca8105373c';

/** Local Storage giả — hình dạng chép theo bản ghi thật ngày 2026-08-10. */
const lsGia = (duLieu) => ({ getItem: (k) => (k in duLieu ? duLieu[k] : null) });

const LS_THAT = {
    '@business_id': MA_THAT,
    '@business_store': JSON.stringify({ id: MA_THAT, store_name: 'CH THUỲ DƯƠNG' }),
    '@access_token': 'token-khong-duoc-dung-toi',
    '@device_id': 'may-abc',
};

function luuTruGia() {
    let o = null;
    return { async doc() { return o; }, async ghi(x) { o = x; }, xem: () => o };
}

ghiChu('— Bóc mã và tên cửa hàng —');

test('bóc đúng mã + tên từ Local Storage thật', () => {
    const t = GhiNhan.bocThongTin(lsGia(LS_THAT));
    assert.strictEqual(t.maCuaHang, MA_THAT);
    assert.strictEqual(t.tenCuaHang, 'CH THUỲ DƯƠNG');
});

test('mã bị bọc dấu nháy (đúng kiểu Tendoo hay lưu) vẫn ra chuỗi sạch', () => {
    const t = GhiNhan.bocThongTin(lsGia({ ...LS_THAT, '@business_id': `"${MA_THAT}"` }));
    assert.strictEqual(t.maCuaHang, MA_THAT);
});

test('mã dính khoảng trắng vẫn ra chuỗi sạch', () => {
    const t = GhiNhan.bocThongTin(lsGia({ ...LS_THAT, '@business_id': `  ${MA_THAT}\n` }));
    assert.strictEqual(t.maCuaHang, MA_THAT);
});

test('KHÔNG có mã → trả null, KHÔNG bịa', () => {
    assert.strictEqual(GhiNhan.bocThongTin(lsGia({})), null);
    assert.strictEqual(GhiNhan.bocThongTin(lsGia({ '@business_id': '' })), null);
    assert.strictEqual(GhiNhan.bocThongTin(null), null);
});

test('mã SAI ĐỊNH DẠNG → trả null chứ không ghi nhận bừa', () => {
    for (const xau of ['abc', '123', MA_THAT.slice(0, 20), MA_THAT + '-thua', '{}']) {
        assert.strictEqual(GhiNhan.bocThongTin(lsGia({ '@business_id': xau })), null, xau);
    }
});

test('không đọc được TÊN thì vẫn ghi nhận mã, tên để trống', () => {
    const t = GhiNhan.bocThongTin(lsGia({ '@business_id': MA_THAT }));
    assert.strictEqual(t.maCuaHang, MA_THAT);
    assert.strictEqual(t.tenCuaHang, '');
});

test('lấy tên từ @user_store khi @business_store không có', () => {
    const t = GhiNhan.bocThongTin(lsGia({
        '@business_id': MA_THAT,
        '@user_store': JSON.stringify({ display_name: 'CH PHƯƠNG ANH' }),
    }));
    assert.strictEqual(t.tenCuaHang, 'CH PHƯƠNG ANH');
});

test('@business_store hỏng (không phải JSON) cũng không làm nổ', () => {
    const t = GhiNhan.bocThongTin(lsGia({ '@business_id': MA_THAT, '@business_store': '{hỏng' }));
    assert.strictEqual(t.maCuaHang, MA_THAT);
});

test('TUYỆT ĐỐI không đụng tới @access_token', () => {
    const daDoc = [];
    const ls = { getItem: (k) => { daDoc.push(k); return LS_THAT[k] ?? null; } };
    GhiNhan.bocThongTin(ls);
    assert.ok(!daDoc.includes('@access_token'), 'đã đọc token — không được phép');
});

ghiChu('— Ghi nhận vào bộ nhớ extension —');

test('ghi được mã, tên và thời điểm', async () => {
    const lt = luuTruGia();
    const kq = await GhiNhan.ghiNhan({ ls: lsGia(LS_THAT), luuTru: lt, dongHo: () => 1700000000000 });
    assert.strictEqual(kq.daGhi, true);
    assert.deepStrictEqual(lt.xem(),
        { maCuaHang: MA_THAT, tenCuaHang: 'CH THUỲ DƯƠNG', luc: 1700000000000 });
});

test('KHÔNG đọc được gì thì GIỮ NGUYÊN bản ghi cũ, không xóa', async () => {
    const lt = luuTruGia();
    await GhiNhan.ghiNhan({ ls: lsGia(LS_THAT), luuTru: lt });
    const cu = lt.xem();

    // Trang tải dở / vừa đăng xuất -> không có mã.
    const kq = await GhiNhan.ghiNhan({ ls: lsGia({}), luuTru: lt });
    assert.strictEqual(kq.daGhi, false);
    assert.deepStrictEqual(lt.xem(), cu, 'đã xóa mất bản ghi cũ');
});

test('đổi tài khoản → bản ghi được cập nhật sang cửa hàng mới', async () => {
    const lt = luuTruGia();
    const MA_KHAC = '9f1c0b22-1111-2222-3333-444455556666';
    await GhiNhan.ghiNhan({ ls: lsGia(LS_THAT), luuTru: lt });
    await GhiNhan.ghiNhan({
        ls: lsGia({ '@business_id': MA_KHAC,
                    '@business_store': JSON.stringify({ store_name: 'CH TRANG BÉ' }) }),
        luuTru: lt,
    });
    assert.strictEqual(lt.xem().maCuaHang, MA_KHAC);
    assert.strictEqual(lt.xem().tenCuaHang, 'CH TRANG BÉ');
});

ghiChu('— Dọn và kiểm chuỗi người dùng dán vào —');

test('lamSachMa gỡ nháy, khoảng trắng, xuống dòng', () => {
    for (const xau of [` "${MA_THAT}" `, `'${MA_THAT}'`, `\n${MA_THAT}\t`, `""${MA_THAT}""`]) {
        assert.strictEqual(GhiNhan.lamSachMa(xau), MA_THAT, xau);
    }
});

test('laMaHopLe: nhận đúng dạng, từ chối dạng sai', () => {
    assert.ok(GhiNhan.laMaHopLe(MA_THAT));
    assert.ok(GhiNhan.laMaHopLe(MA_THAT.toUpperCase()));
    assert.ok(GhiNhan.laMaHopLe(`"${MA_THAT}"`), 'phải dọn trước rồi mới kiểm');
    for (const xau of ['', 'abc', '2c683a17', MA_THAT.replace(/-/g, ''), MA_THAT + 'x',
                       '2c683a17-09ab-4655-8dbf-50ca8105373g']) {
        assert.ok(!GhiNhan.laMaHopLe(xau), 'phải từ chối: ' + xau);
    }
});

ghiChu('— Không tự chạy sai chỗ —');

test('nạp trong Node (không có trang web) KHÔNG nổ và KHÔNG ghi gì', () => {
    // File tự chạy khi ở trên tendoo.vn. Nạp lại trong Node phải im lặng.
    delete require.cache[require.resolve('../tendoo/ghiNhanCuaHang')];
    assert.doesNotThrow(() => require('../tendoo/ghiNhanCuaHang'));
});

test('KHÓA LƯU dùng riêng, không đụng khóa của kho tài khoản', () => {
    assert.strictEqual(GhiNhan.KHOA_LUU, 'hdt-cua-hang-vua-thay');
    assert.notStrictEqual(GhiNhan.KHOA_LUU, 'hdt-kho-tai-khoan');
});

chay('GHI NHẬN CỬA HÀNG ĐANG ĐĂNG NHẬP');
