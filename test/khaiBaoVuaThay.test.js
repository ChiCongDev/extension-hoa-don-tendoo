'use strict';

// Test hộp "CỬA HÀNG VỪA THẤY" trong popup — phần đối chiếu và điền sẵn.
// Chạy: node test/khaiBaoVuaThay.test.js   (cần biến HDT_JSDOM)
//
// Đây là thứ DUY NHẤT kiểm chứng được rằng mã cửa hàng đã khai đúng là của
// khách đó, chứ không phải copy nhầm lúc đang đăng nhập tài khoản khác.

const assert = require('node:assert');
const { JSDOM } = require(process.env.HDT_JSDOM || 'jsdom');
const { test, ghiChu, chay } = require('./chay');
const KhaiBao = require('../popup/khaiBao');
const Kho = require('../chung/khoMatKhau');
const GhiNhan = require('../tendoo/ghiNhanCuaHang');

const KHOA_MO = 'khoa-mo-thu-nghiem';
const MAT_KHAU_GIA = 'MatKhauGia!123';
const CH_PA = '2c683a17-09ab-4655-8dbf-50ca8105373c';
const CH_TB = '9f1c0b22-1111-2222-3333-444455556666';

function taoLuuTru() {
    let o = null;
    return {
        async doc() { return o ? JSON.parse(JSON.stringify(o)) : null; },
        async ghi(x) { o = x ? JSON.parse(JSON.stringify(x)) : null; },
    };
}

async function dung(luuTru = taoLuuTru(), vuaThay = null) {
    const dom = new JSDOM('<!doctype html><div id="goc"></div>');
    const goc = dom.window.document.getElementById('goc');
    const mh = KhaiBao.gan(goc, {
        Kho, luuTru, GhiNhan,
        luuTruCuaHang: { async doc() { return vuaThay; }, async ghi() {} },
    });
    await mh.nap();
    return { goc, mh, luuTru };
}

/** Đã mở kho, đã có khách PA gán với cửa hàng CH_PA. */
async function daKhaiPA(vuaThay = null) {
    const luuTru = taoLuuTru();
    const t0 = await dung(luuTru);
    await t0.mh.themKhach({
        maKH: 'PA', maCuaHang: CH_PA, tenDangNhap: '0344168490',
        matKhau: MAT_KHAU_GIA, ghiChu: 'Phương Anh',
    });
    const t = await dung(luuTru, vuaThay);
    return t;
}

const banGhi = (ma, ten) => ({ maCuaHang: ma, tenCuaHang: ten, luc: Date.now() });

ghiChu('— Hộp đối chiếu —');

test('chưa ghi nhận cửa hàng nào → báo rõ và chỉ việc phải làm', async () => {
    const { goc } = await daKhaiPA(null);
    const hop = goc.querySelector('#kbVuaThay');
    assert.ok(hop, 'thiếu hộp đối chiếu');
    assert.match(hop.textContent, /Chưa ghi nhận cửa hàng nào/);
    assert.match(hop.textContent, /Mở trang bán hàng Tendoo/);
});

test('KHỚP khai báo → tô xanh, nói rõ khách nào', async () => {
    const { goc } = await daKhaiPA(banGhi(CH_PA, 'CH THUỲ DƯƠNG'));
    const hop = goc.querySelector('#kbVuaThay');
    assert.ok(hop.className.includes('hdt-khop'), 'không tô màu khớp');
    assert.match(hop.textContent, /Đã gán cho khách "PA"/);
    assert.match(hop.textContent, /Phương Anh/);
    assert.ok(!goc.querySelector('#kbDungVuaThay'), 'đã gán rồi vẫn mời gán lại');
});

test('KHỚP không phân biệt hoa thường', async () => {
    const { goc } = await daKhaiPA(banGhi(CH_PA.toUpperCase(), 'CH THUỲ DƯƠNG'));
    assert.match(goc.querySelector('#kbVuaThay').textContent, /Đã gán cho khách "PA"/);
});

test('CHƯA gán cho ai → tô vàng + nút "Dùng để khai báo"', async () => {
    const { goc } = await daKhaiPA(banGhi(CH_TB, 'CH TRANG BÉ'));
    const hop = goc.querySelector('#kbVuaThay');
    assert.ok(hop.className.includes('hdt-chua-gan'));
    assert.match(hop.textContent, /CHƯA gán cho khách nào/);
    assert.ok(goc.querySelector('#kbDungVuaThay'));
});

test('hiện đủ mã + tên + thời điểm để đối chiếu bằng mắt', async () => {
    const { goc } = await daKhaiPA(banGhi(CH_TB, 'CH TRANG BÉ'));
    const chu = goc.querySelector('#kbVuaThay').textContent;
    assert.ok(chu.includes(CH_TB), 'không hiện mã cửa hàng');
    assert.ok(chu.includes('CH TRANG BÉ'), 'không hiện tên cửa hàng');
    assert.match(chu, /Ghi nhận lúc/);
});

test('không đọc được tên → vẫn dùng được, nói rõ là không đọc được', async () => {
    const { goc } = await daKhaiPA(banGhi(CH_TB, ''));
    assert.match(goc.querySelector('#kbVuaThay').textContent, /không đọc được tên/);
    assert.ok(goc.querySelector('#kbDungVuaThay'));
});

test('kho CŨ chưa chuyển đổi → KHÔNG hiện hộp đối chiếu', async () => {
    // Chưa đọc được kho thì không biết đã gán cho ai — đừng đoán bừa.
    const luuTru = taoLuuTru();
    await luuTru.ghi({ phienBan: 1, muoi: 'x', cauKiemTra: { iv: 'a', duLieu: 'b' }, khach: {} });
    const { goc } = await dung(luuTru, banGhi(CH_PA, 'CH THUỲ DƯƠNG'));
    assert.ok(!goc.querySelector('#kbVuaThay'), 'hiện hộp khi chưa đọc được kho');
});

test('tên cửa hàng chứa mã HTML thì hiện nguyên chữ, không chạy thành mã', async () => {
    const { goc } = await daKhaiPA(banGhi(CH_TB, '<img src=x onerror=alert(1)>'));
    assert.ok(!goc.querySelector('img'), 'dữ liệu từ trang Tendoo biến thành thẻ HTML');
    assert.ok(goc.textContent.includes('<img src=x onerror=alert(1)>'));
});

ghiChu('— Điền sẵn —');

test('bấm "Dùng để khai báo" → điền sẵn mã cửa hàng và ghi chú', async () => {
    const { goc } = await daKhaiPA(banGhi(CH_TB, 'CH TRANG BÉ'));
    goc.querySelector('#kbDungVuaThay').click();
    assert.strictEqual(goc.querySelector('#kbCuaHang').value, CH_TB);
    assert.strictEqual(goc.querySelector('#kbGhiChu').value, 'CH TRANG BÉ');
    assert.match(goc.querySelector('#kbOk').textContent, /Gõ nốt Mã KH và mật khẩu/);
});

test('điền sẵn KHÔNG tự lưu — vẫn phải bấm Lưu', async () => {
    const { goc, mh } = await daKhaiPA(banGhi(CH_TB, 'CH TRANG BÉ'));
    goc.querySelector('#kbDungVuaThay').click();
    assert.strictEqual(mh.soKhaiBao(), 1, 'đã tự lưu khách mới mà chưa hỏi');
});

test('lưu xong → hộp chuyển sang KHỚP, mất nút mời gán', async () => {
    const { goc, mh } = await daKhaiPA(banGhi(CH_TB, 'CH TRANG BÉ'));
    goc.querySelector('#kbDungVuaThay').click();
    await mh.themKhach({
        maKH: 'TB', maCuaHang: goc.querySelector('#kbCuaHang').value,
        tenDangNhap: '0987654321', matKhau: MAT_KHAU_GIA, ghiChu: 'CH TRANG BÉ',
    });
    assert.strictEqual(mh.soKhaiBao(), 2);
    assert.ok(goc.querySelector('#kbVuaThay').className.includes('hdt-khop'));
    assert.ok(!goc.querySelector('#kbDungVuaThay'));
});

test('lưu xong thì XÓA phần điền sẵn, không dính sang khách sau', async () => {
    const { goc, mh } = await daKhaiPA(banGhi(CH_TB, 'CH TRANG BÉ'));
    goc.querySelector('#kbDungVuaThay').click();
    assert.ok(mh.dienSan(), 'chưa ghi nhận điền sẵn');
    await mh.themKhach({ maKH: 'TB', maCuaHang: CH_TB, tenDangNhap: 'x', matKhau: MAT_KHAU_GIA });
    assert.strictEqual(mh.dienSan(), null, 'điền sẵn còn dính lại');
    assert.strictEqual(goc.querySelector('#kbCuaHang').value, '');
});

ghiChu('— Kiểm định dạng mã cửa hàng —');

test('mã SAI ĐỊNH DẠNG → chặn, chỉ rõ dạng đúng', async () => {
    const { goc, mh } = await daKhaiPA();
    await mh.themKhach({ maKH: 'TB', maCuaHang: 'abc-khong-phai-uuid',
                         tenDangNhap: 'x', matKhau: MAT_KHAU_GIA });
    assert.match(goc.querySelector('#kbLoi').textContent, /8-4-4-4-12/);
    assert.strictEqual(mh.soKhaiBao(), 1, 'vẫn lưu dù mã sai dạng');
});

test('mã thiếu vài ký tự → chặn', async () => {
    const { mh } = await daKhaiPA();
    await mh.themKhach({ maKH: 'TB', maCuaHang: CH_TB.slice(0, 30),
                         tenDangNhap: 'x', matKhau: MAT_KHAU_GIA });
    assert.strictEqual(mh.soKhaiBao(), 1);
});

test('mã dính DẤU NHÁY — lỗi copy hay gặp nhất → tự dọn rồi lưu được', async () => {
    const { goc, mh } = await daKhaiPA();
    await mh.themKhach({ maKH: 'TB', maCuaHang: '"' + CH_TB + '"',
                         tenDangNhap: 'x', matKhau: MAT_KHAU_GIA });
    assert.strictEqual(mh.soKhaiBao(), 2, goc.querySelector('#kbLoi')
        ? goc.querySelector('#kbLoi').textContent : '');
    assert.ok(goc.querySelector('[data-ma-kh="TB"]').textContent.includes(CH_TB),
        'mã lưu xuống vẫn còn dấu nháy');
});

test('mã dính khoảng trắng / xuống dòng → tự dọn', async () => {
    const { mh } = await daKhaiPA();
    await mh.themKhach({ maKH: 'TB', maCuaHang: '  ' + CH_TB + '\n',
                         tenDangNhap: 'x', matKhau: MAT_KHAU_GIA });
    assert.strictEqual(mh.soKhaiBao(), 2);
});

test('⭐ dọn TRƯỚC rồi mới so trùng — dán kèm nháy vẫn NHẬN RA là dùng chung', async () => {
    // Từ 2026-08-15 dùng chung cửa hàng KHÔNG còn bị chặn, nhưng phép dọn chuỗi
    // vẫn phải chạy trước khi so: không dọn thì `"abc"` khác `abc`, máy tưởng là
    // hai cửa hàng khác nhau và im lặng — mất luôn lời nhắc bắt gõ nhầm.
    const { goc, mh } = await daKhaiPA();
    await mh.themKhach({ maKH: 'TB', maCuaHang: '"' + CH_PA + '"',
                         tenDangNhap: 'x', matKhau: MAT_KHAU_GIA });
    assert.match(goc.querySelector('#kbOk').textContent, /dùng chung với khách/);
    assert.match(goc.querySelector('#kbOk').textContent, /PA/);
    assert.strictEqual(mh.soKhaiBao(), 2, 'vẫn chặn — lẽ ra phải cho lưu');
});

test('mã dọn xong khớp được với bản ghi "vừa thấy"', async () => {
    // Người dùng dán kèm nháy; sau khi lưu, hộp đối chiếu vẫn phải nhận ra là khớp.
    const { goc, mh } = await daKhaiPA(banGhi(CH_TB, 'CH TRANG BÉ'));
    await mh.themKhach({ maKH: 'TB', maCuaHang: '"' + CH_TB + '"',
                         tenDangNhap: 'x', matKhau: MAT_KHAU_GIA });
    assert.ok(goc.querySelector('#kbVuaThay').className.includes('hdt-khop'),
        'lưu kèm nháy xong thì không khớp nữa — dọn chuỗi chưa tới nơi');
});

chay('HỘP CỬA HÀNG VỪA THẤY');
