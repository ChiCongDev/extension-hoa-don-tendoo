'use strict';

// Test đăng nhập Tendoo trên BẢN SAO form thật (chép từ HTML quan sát được).
// Chạy: node test/dangNhap.test.js   (cần biến HDT_JSDOM trỏ tới gói jsdom)

const assert = require('node:assert');
const { JSDOM } = require(process.env.HDT_JSDOM || 'jsdom');
const { test, ghiChu, chay } = require('./chay');
const DangNhap = require('../tendoo/dangNhap');

const { MA } = DangNhap;
const SDT = '0344168490';
const MK = 'MatKhauGia!123';

/** Bản sao form đăng nhập thật: id ô, và nút Zalo cũng mang ant-btn-primary. */
function trangDangNhap(themVao = '') {
    const dom = new JSDOM(`<!doctype html><body>
      <form>
        <input id="phone_login_form_phone_number" class="ant-input ant-input-lg" placeholder="Nhập số điện thoại">
        <input id="phone_login_form_pwd" type="password" class="ant-input ant-input-lg" placeholder="Điền mật khẩu">
        <button class="ant-btn ant-btn-primary">Đăng nhập</button>
      </form>
      <button class="w-full bg-white text-black">Google</button>
      <button class="ant-btn ant-btn-primary">Zalo</button>
      <a>Quên mật khẩu</a>
      ${themVao}
    </body>`);
    return dom.window.document;
}

const nghiNhanh = async () => {};

ghiChu('— Điền form —');

test('điền được cả hai ô và bấm đúng nút', async () => {
    const td = trangDangNhap();
    let daBam = null;
    [...td.querySelectorAll('button')].forEach(b => {
        b.addEventListener('click', () => { daBam = b.textContent.trim(); });
    });
    const kq = await DangNhap.dangNhap(td, { tenDangNhap: SDT, matKhau: MK },
        { nghi: nghiNhanh, doiRoiTrang: async () => true });

    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.strictEqual(td.querySelector('#phone_login_form_phone_number').value, SDT);
    assert.strictEqual(td.querySelector('#phone_login_form_pwd').value, MK);
    assert.strictEqual(daBam, 'Đăng nhập', 'bấm nhầm nút!');
});

test('BẪY: KHÔNG bấm nhầm nút Zalo (cùng class ant-btn-primary)', async () => {
    const td = trangDangNhap();
    const nut = DangNhap.timNutDangNhap(td);
    assert.strictEqual(nut.textContent.trim(), 'Đăng nhập');
    assert.notStrictEqual(nut.textContent.trim(), 'Zalo');
});

test('BẪY: phát sự kiện input để React/Ant Design nhận được giá trị', async () => {
    const td = trangDangNhap();
    const o = td.querySelector('#phone_login_form_phone_number');
    const suKien = [];
    ['input', 'change'].forEach(t => o.addEventListener(t, () => suKien.push(t)));
    DangNhap.datGiaTri(o, SDT);
    assert.ok(suKien.includes('input'), 'không phát sự kiện input — React sẽ tưởng ô rỗng');
    assert.ok(suKien.includes('change'));
});

test('BẪY: form vẽ lại xóa trắng ô → tự điền lại, tối đa 3 lần', async () => {
    const td = trangDangNhap();
    const o = td.querySelector('#phone_login_form_phone_number');
    let soLanBiXoa = 0;
    // Hai lần đầu bị xóa ngay sau khi điền, lần thứ ba mới giữ được.
    o.addEventListener('input', () => {
        if (o.value === SDT && soLanBiXoa < 2) { soLanBiXoa++; o.value = ''; }
    });
    const kq = await DangNhap.dangNhap(td, { tenDangNhap: SDT, matKhau: MK },
        { nghi: nghiNhanh, doiRoiTrang: async () => true });
    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.strictEqual(soLanBiXoa, 2);
    assert.strictEqual(o.value, SDT);
});

test('form vẽ lại LIÊN TỤC → bỏ cuộc, KHÔNG bấm nút', async () => {
    const td = trangDangNhap();
    const o = td.querySelector('#phone_login_form_phone_number');
    o.addEventListener('input', () => { o.value = ''; });
    let daBam = false;
    DangNhap.timNutDangNhap(td).addEventListener('click', () => { daBam = true; });

    const kq = await DangNhap.dangNhap(td, { tenDangNhap: SDT, matKhau: MK },
        { nghi: nghiNhanh, doiRoiTrang: async () => true });
    assert.strictEqual(kq.ma, MA.KHONG_DIEN_DUOC);
    assert.strictEqual(daBam, false, 'đã bấm Đăng nhập với ô rỗng');
});

test('không thấy form (giao diện Tendoo đổi) → báo rõ, không mò', async () => {
    const dom = new JSDOM('<!doctype html><body><p>Trang lạ</p></body>');
    const kq = await DangNhap.dangNhap(dom.window.document, { tenDangNhap: SDT, matKhau: MK },
        { nghi: nghiNhanh });
    assert.strictEqual(kq.ma, MA.KHONG_THAY_FORM);
});

test('mất nút Đăng nhập → báo lỗi chứ không bấm bừa nút khác', async () => {
    const td = trangDangNhap();
    [...td.querySelectorAll('button')].forEach(b => {
        if (b.textContent.trim() === 'Đăng nhập') b.remove();
    });
    const kq = await DangNhap.dangNhap(td, { tenDangNhap: SDT, matKhau: MK }, { nghi: nghiNhanh });
    assert.strictEqual(kq.ma, MA.KHONG_THAY_NUT);
});

ghiChu('— Rào cản: gặp là DỪNG —');

test('có captcha trên trang → DỪNG, không điền gì cả', async () => {
    const td = trangDangNhap('<div class="g-recaptcha"></div>');
    const kq = await DangNhap.dangNhap(td, { tenDangNhap: SDT, matKhau: MK }, { nghi: nghiNhanh });
    assert.strictEqual(kq.ma, MA.CAPTCHA);
    assert.strictEqual(td.querySelector('#phone_login_form_phone_number').value, '',
        'đã điền số điện thoại dù thấy captcha');
});

test('hỏi mã OTP → DỪNG, báo cần nhập tay', async () => {
    const td = trangDangNhap('<p>Nhập mã OTP vừa gửi tới điện thoại</p>');
    const kq = await DangNhap.dangNhap(td, { tenDangNhap: SDT, matKhau: MK }, { nghi: nghiNhanh });
    assert.strictEqual(kq.ma, MA.CAPTCHA);
    assert.match(kq.thongBao, /OTP/i);
});

test('captcha hiện SAU khi bấm → vẫn bắt được', async () => {
    const td = trangDangNhap();
    const kq = await DangNhap.dangNhap(td, { tenDangNhap: SDT, matKhau: MK }, {
        nghi: nghiNhanh,
        doiRoiTrang: async () => {
            td.body.insertAdjacentHTML('beforeend', '<div class="h-captcha"></div>');
            return false;
        },
    });
    assert.strictEqual(kq.ma, MA.CAPTCHA);
});

ghiChu('— Sau khi bấm —');

test('sai mật khẩu → đọc được thông báo của Tendoo', async () => {
    const td = trangDangNhap();
    const kq = await DangNhap.dangNhap(td, { tenDangNhap: SDT, matKhau: 'sai' }, {
        nghi: nghiNhanh,
        doiRoiTrang: async () => {
            td.body.insertAdjacentHTML('beforeend', '<p>Sai mật khẩu, vui lòng thử lại</p>');
            return false;
        },
    });
    assert.strictEqual(kq.ma, MA.SAI_MAT_KHAU);
    assert.match(kq.thongBao, /Sai mật khẩu/);
});

test('bấm rồi mà không vào được, không rõ vì sao → QUA_HAN_CHO', async () => {
    const td = trangDangNhap();
    const kq = await DangNhap.dangNhap(td, { tenDangNhap: SDT, matKhau: MK },
        { nghi: nghiNhanh, doiRoiTrang: async () => false });
    assert.strictEqual(kq.ma, MA.QUA_HAN_CHO);
});

test('vào được → OK', async () => {
    const td = trangDangNhap();
    const kq = await DangNhap.dangNhap(td, { tenDangNhap: SDT, matKhau: MK },
        { nghi: nghiNhanh, doiRoiTrang: async () => true });
    assert.strictEqual(kq.ok, true);
});

ghiChu('— Không rò rỉ mật khẩu —');

test('thông báo lỗi KHÔNG chứa mật khẩu', async () => {
    const td = trangDangNhap('<div class="g-recaptcha"></div>');
    const kq = await DangNhap.dangNhap(td, { tenDangNhap: SDT, matKhau: MK }, { nghi: nghiNhanh });
    assert.ok(!JSON.stringify(kq).includes(MK), 'mật khẩu lọt vào thông báo lỗi!');
});

chay('ĐĂNG NHẬP TENDOO');
