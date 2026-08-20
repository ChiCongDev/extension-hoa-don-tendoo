'use strict';

// Test màn hình khai báo tài khoản trong popup.
// Chạy: node test/khaiBao.test.js   (cần biến HDT_JSDOM trỏ tới gói jsdom)
// Mật khẩu dùng ở đây là GIẢ.

const assert = require('node:assert');
const { JSDOM } = require(process.env.HDT_JSDOM || 'jsdom');
const { test, ghiChu, chay } = require('./chay');
const KhaiBao = require('../popup/khaiBao');
const Kho = require('../chung/khoMatKhau');

const KHOA_MO = 'khoa-mo-thu-nghiem';
const MAT_KHAU_GIA = 'MatKhauGia!123';
const CUA_HANG_PA = '2c683a17-09ab-4655-8dbf-50ca8105373c';
const CUA_HANG_TB = '9f1c0b22-1111-2222-3333-444455556666';

function taoLuuTru() {
    let noiDung = null;
    return {
        async doc() { return noiDung ? JSON.parse(JSON.stringify(noiDung)) : null; },
        async ghi(o) { noiDung = o ? JSON.parse(JSON.stringify(o)) : null; },
        docThang: () => noiDung,
    };
}

async function dungManHinh(luuTru = taoLuuTru()) {
    const dom = new JSDOM('<!doctype html><div id="goc"></div>');
    const goc = dom.window.document.getElementById('goc');
    const mh = KhaiBao.gan(goc, { Kho, luuTru });
    await mh.nap();
    return { dom, goc, mh, luuTru };
}

/** Màn hình có sẵn khách PA. Không còn khóa mở nên không phải mở gì. */
async function manHinhDaMo() {
    const t = await dungManHinh();
    await t.mh.themKhach({
        maKH: 'PA', maCuaHang: CUA_HANG_PA, tenDangNhap: '0344168490',
        matKhau: MAT_KHAU_GIA, ghiChu: 'Phương Anh',
    });
    return t;
}

ghiChu('— ⭐ Không còn khóa mở —');

test('⭐ chưa có kho → VÀO THẲNG màn khai báo, không hỏi gì', async () => {
    const { goc, luuTru } = await dungManHinh();
    assert.ok(goc.querySelector('#kbLuu'), 'không vào được màn khai báo');
    assert.strictEqual(goc.querySelector('#kbDatKhoaMo'), null, 'vẫn hỏi đặt khóa mở');
    assert.strictEqual(goc.querySelector('#kbMoKho'), null, 'vẫn hỏi mở kho');
    assert.ok(luuTru.docThang(), 'chưa dựng kho xuống đĩa');
    assert.ok(luuTru.docThang().chiaKhoa, 'kho dựng ra thiếu chìa tự sinh');
});

test('⭐ mở lại lần sau → vẫn vào thẳng, không hỏi gì', async () => {
    // Đây chính là cái phiền cũ: tải lại extension là mất khóa, phải gõ lại.
    const t = await manHinhDaMo();
    const lai = await dungManHinh(t.luuTru);
    assert.ok(lai.goc.querySelector('#kbLuu'), 'lần sau lại bị chặn');
    assert.ok(lai.goc.querySelector('#kbDanhSach'), 'không thấy danh sách khách');
    assert.match(lai.goc.textContent, /PA/);
});

test('KHÔNG còn nút "Khóa lại" hay "Đổi khóa mở"', async () => {
    const { goc } = await manHinhDaMo();
    assert.strictEqual(goc.querySelector('#kbKhoaLai'), null);
    assert.strictEqual(goc.querySelector('#kbHienDoiKhoaMo'), null);
});

test('mật khẩu KHÔNG bao giờ bị vẽ ra màn hình', async () => {
    const { goc } = await manHinhDaMo();
    const chu = goc.textContent;
    assert.ok(!chu.includes(MAT_KHAU_GIA), 'mật khẩu bị vẽ ra màn hình!');
    assert.ok(!goc.innerHTML.includes(MAT_KHAU_GIA));
});


test('lưu xong thì XÓA ô mật khẩu, không để nằm lại trên màn hình', async () => {
    const { goc } = await manHinhDaMo();
    assert.strictEqual(goc.querySelector('#kbMatKhau').value, '');
    assert.strictEqual(goc.querySelector('#kbMaKH').value, '');
});

test('⭐ màn hình KHÔNG bao giờ ở trạng thái "đang khóa" nữa', async () => {
    const { goc } = await manHinhDaMo();
    assert.ok(goc.querySelector('#kbDanhSach'), 'không thấy danh sách');
    assert.strictEqual(goc.querySelector('#kbMoKho'), null, 'vẫn còn màn nhập khóa mở');
});

test('tên khách chứa mã HTML thì hiện nguyên chữ, không chạy thành mã', async () => {
    const { goc, mh } = await manHinhDaMo();
    await mh.themKhach({
        maKH: 'X', maCuaHang: CUA_HANG_TB, tenDangNhap: 'x',
        matKhau: MAT_KHAU_GIA, ghiChu: '<img src=x onerror=alert(1)>',
    });
    assert.ok(!goc.querySelector('img'), 'dữ liệu người dùng biến thành thẻ HTML');
    assert.ok(goc.textContent.includes('<img src=x onerror=alert(1)>'));
});

ghiChu('— Quy tắc khai báo —');

test('⭐ HAI KHÁCH cùng một cửa hàng → CHO LƯU (chủ dự án chốt 2026-08-15)', async () => {
    // Trước đây CHẶN thẳng. Chặn ấy sinh ra để bắt lỗi gõ nhầm mã cửa hàng,
    // nhưng nó cấm luôn cả trường hợp cố ý dùng chung một tài khoản Tendoo.
    const { mh } = await manHinhDaMo();
    await mh.themKhach({
        maKH: 'TB', maCuaHang: CUA_HANG_PA, tenDangNhap: 'y', matKhau: MAT_KHAU_GIA,
    });
    assert.strictEqual(mh.soKhaiBao(), 2, 'vẫn chặn — khách thứ hai không lưu được');
});

test('⭐ lưu xong vẫn NÓI RA việc dùng chung, để còn bắt được gõ nhầm', async () => {
    // Bỏ chặn mà im lặng luôn thì dán nhầm mã cửa hàng của khách khác sẽ không
    // ai nhận ra, và hóa đơn ra ở chỗ người ta.
    const { goc, mh } = await manHinhDaMo();
    await mh.themKhach({
        maKH: 'TB', maCuaHang: CUA_HANG_PA, tenDangNhap: 'y', matKhau: MAT_KHAU_GIA,
    });
    const chu = goc.querySelector('#kbOk').textContent;
    assert.match(chu, /dùng chung với khách/);
    assert.match(chu, /PA/, 'không nêu tên khách đang dùng chung');
    assert.match(chu, /dán nhầm/, 'không chỉ ra khả năng gõ nhầm');
});

test('⭐ CẢ HAI bản ghi còn nguyên trên đĩa, không đè lên nhau', async () => {
    const { mh, luuTru } = await manHinhDaMo();
    await mh.themKhach({
        maKH: 'TB', maCuaHang: CUA_HANG_PA, tenDangNhap: 'y', matKhau: MAT_KHAU_GIA,
    });
    // Soi thẳng kho dưới đĩa: cả hai khách phải cùng trỏ về đúng cửa hàng đó.
    const kho = luuTru.docThang();
    assert.deepStrictEqual(Kho.timCacKhachTheoCuaHang(kho, CUA_HANG_PA).sort(), ['PA', 'TB']);
});

test('khách KHÔNG dùng chung thì không bị nhắc gì thừa', async () => {
    const { goc, mh } = await manHinhDaMo();
    await mh.themKhach({
        maKH: 'TB', maCuaHang: CUA_HANG_TB, tenDangNhap: 'y', matKhau: MAT_KHAU_GIA,
    });
    assert.ok(!/dùng chung/.test(goc.querySelector('#kbOk').textContent));
});

test('sửa lại chính khách đó với cùng cửa hàng thì được', async () => {
    const { mh } = await manHinhDaMo();
    await mh.themKhach({
        maKH: 'PA', maCuaHang: CUA_HANG_PA, tenDangNhap: 'moi', matKhau: 'MatKhauKhac!9',
    });
    assert.strictEqual(mh.soKhaiBao(), 1);
});

test('thiếu mã cửa hàng hoặc mật khẩu → báo lỗi, không lưu', async () => {
    const { goc, mh } = await manHinhDaMo();
    await mh.themKhach({ maKH: 'TB', maCuaHang: '', matKhau: MAT_KHAU_GIA });
    assert.ok(goc.querySelector('#kbLoi'));
    await mh.themKhach({ maKH: 'TB', maCuaHang: CUA_HANG_TB, matKhau: '' });
    assert.ok(goc.querySelector('#kbLoi'));
    assert.strictEqual(mh.soKhaiBao(), 1);
});

test('thêm khách thứ hai (cửa hàng khác) thì được', async () => {
    const { goc, mh } = await manHinhDaMo();
    await mh.themKhach({
        maKH: 'TB', maCuaHang: CUA_HANG_TB, tenDangNhap: 'y', matKhau: MAT_KHAU_GIA,
    });
    assert.strictEqual(mh.soKhaiBao(), 2);
    assert.ok(goc.querySelector('[data-ma-kh="TB"]'));
});

test('xóa khách → mất khỏi danh sách và khỏi đĩa', async () => {
    const { goc, mh, luuTru } = await manHinhDaMo();
    await mh.xoaKhach('PA');
    assert.strictEqual(mh.soKhaiBao(), 0);
    assert.ok(!goc.querySelector('[data-ma-kh="PA"]'));
    assert.deepStrictEqual(luuTru.docThang().khach, {});
});

test('kho cũ chưa chuyển đổi → hiện màn chuyển đổi, không cho khai báo', async () => {
    // Kho bản 1 còn mã hóa bằng khóa mở -> chưa đọc được, phải chuyển trước.
    const luuTru = taoLuuTru();
    await luuTru.ghi({ phienBan: 1, muoi: 'xxx', cauKiemTra: { iv: 'a', duLieu: 'b' }, khach: {} });
    const { goc } = await dungManHinh(luuTru);
    assert.ok(goc.querySelector('#kbKhoCu'), 'không hỏi chuyển đổi kho cũ');
    assert.ok(goc.querySelector('#kbChuyenKhoCu'), 'thiếu nút chuyển đổi');
    assert.ok(goc.querySelector('#kbBoKhoCu'), 'thiếu đường thoát khi quên khóa mở');
    assert.strictEqual(goc.querySelector('#kbLuu'), null, 'cho khai báo khi chưa chuyển đổi');
});

test('⭐ bỏ kho cũ → dựng kho mới trống, vào thẳng màn khai báo', async () => {
    const luuTru = taoLuuTru();
    await luuTru.ghi({ phienBan: 1, muoi: 'xxx', cauKiemTra: { iv: 'a', duLieu: 'b' },
                       khach: { PA: { maCuaHang: 'x', matKhauMaHoa: { iv: 'a', duLieu: 'b' } } } });
    const { goc, mh } = await dungManHinh(luuTru);
    await mh.boKhoCu();
    assert.ok(goc.querySelector('#kbLuu'), 'không vào được màn khai báo');
    assert.strictEqual(luuTru.docThang().phienBan, 2);
    assert.deepStrictEqual(luuTru.docThang().khach, {}, 'kho mới phải trống');
});

// Nhóm "đổi khóa mở" đã bỏ: không còn khóa mở nào để đổi.
// Nhóm "chuyển kho cũ" nằm ở test/khoMatKhau.test.js.

chay('MÀN HÌNH KHAI BÁO TÀI KHOẢN');
