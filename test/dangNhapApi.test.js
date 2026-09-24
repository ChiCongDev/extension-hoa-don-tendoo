'use strict';

// ============================================================================
//  ĐĂNG NHẬP TENDOO BẰNG API — lấy thẻ không cần mở tab.
//
//  Chủ dự án duyệt 23/09/2026. Địa chỉ/tên trường/thuật toán/khóa đều QUAN SÁT
//  TRỰC TIẾP từ mã công khai của Tendoo, rồi kiểm chứng:
//    · vòng mã-hóa-giải-mã khớp bộ giải của Tendoo
//    · gọi thật với tài khoản GIẢ -> máy chủ trả ASILA01 "không tìm thấy người
//      dùng", tức ĐÃ giải mã được mật khẩu và chấp nhận định dạng.
//
//  ── BÀI KIỂM NÀY GHIM ──────────────────────────────────────────────────────
//  1. Mã hóa ĐÚNG thuật toán Tendoo (AES-256-GCM, hex(IV+bản_mã+tag)) — sai là
//     máy chủ không giải nổi mật khẩu, đăng nhập luôn hỏng.
//  2. Thân yêu cầu ĐÚNG tên trường — pwd (không phải password), phone_number,
//     device_id, platform=pro_web.
//  3. Bóc thẻ ĐÚNG chỗ body.data.access_token.
//  4. Mật khẩu và thẻ KHÔNG rò ra thông báo lỗi.
// ============================================================================

const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { test, ghiChu, chay } = require('./chay');

const D = require('../chung/dangNhapApi');
const GOC = path.join(__dirname, '..');
const doc = (f) => fs.readFileSync(path.join(GOC, f), 'utf8');

/** Giải mã kiểu Tendoo (Node createDecipheriv) — để kiểm mã hóa của module. */
function giaiKieuTendoo(hex) {
    const t = Buffer.from(hex, 'hex');
    const d = crypto.createDecipheriv('aes-256-gcm', D.OTP_SECRET_KEY,
        t.subarray(0, 12), { authTagLength: 16 });
    d.setAuthTag(t.subarray(-16));
    return Buffer.concat([d.update(t.subarray(12, -16)), d.final()]).toString('utf8');
}

ghiChu('── MÃ HÓA MẬT KHẨU: sai thuật toán là đăng nhập luôn hỏng ──');

test('⭐⭐⭐ maHoaMatKhau tạo đúng định dạng Tendoo giải được', async () => {
    const thu = 'chuoi-thu-KHONG-phai-mat-khau-that';
    const hex = await D.maHoaMatKhau(globalThis.crypto.subtle, thu);
    assert.strictEqual(giaiKieuTendoo(hex), thu,
        'module mã hóa ra thứ bộ giải của Tendoo không đọc được -> máy chủ từ chối');
});

test('⭐⭐⭐ khóa AES đúng GIÁ TRỊ quan sát từ Tendoo, không chỉ đúng độ dài', () => {
    // ⚠️ Ghim CHÍNH GIÁ TRỊ chứ không chỉ độ dài. Vòng mã-hóa-giải-mã cục bộ
    // dùng cùng một khóa nên khóa nào cũng "khớp" — chỉ MÁY CHỦ TENDOO mới phân
    // biệt đúng/sai, mà bài kiểm không gọi máy chủ. Nên đổi khóa sai vẫn xanh
    // nếu chỉ kiểm độ dài. Cách duy nhất bắt được là chốt đúng giá trị đã dò.
    assert.strictEqual(D.OTP_SECRET_KEY, 'YrMjl2hou0Jp59EzxlNYqGYQRTZe4u7b',
        'khóa khác giá trị quan sát từ mã Tendoo -> máy chủ không giải nổi mật khẩu');
    assert.strictEqual(D.OTP_SECRET_KEY.length, 32, 'không phải AES-256');
});

test('⭐⭐ mỗi lần mã hóa ra một chuỗi KHÁC (IV ngẫu nhiên)', async () => {
    const a = await D.maHoaMatKhau(globalThis.crypto.subtle, 'x');
    const b = await D.maHoaMatKhau(globalThis.crypto.subtle, 'x');
    assert.notStrictEqual(a, b, 'IV không đổi -> lộ quy luật, và sai cách GCM phải dùng');
    // Nhưng cả hai vẫn giải ra đúng.
    assert.strictEqual(giaiKieuTendoo(a), 'x');
    assert.strictEqual(giaiKieuTendoo(b), 'x');
});

test('mật khẩu rỗng -> ném lỗi, không mã hóa chuỗi rỗng', async () => {
    await assert.rejects(() => D.maHoaMatKhau(globalThis.crypto.subtle, ''));
});

ghiChu('── THÂN YÊU CẦU: đúng tên trường mới đăng nhập được ──');

/** Bắt lấy thân yêu cầu module gửi đi, trả một phản hồi giả. */
async function batYeuCau(traVe, trangThai = 200) {
    let daGui = null;
    const kq = await D.dangNhap({
        tenDangNhap: '+84379215004', matKhau: 'mat-khau-thu',
        deviceId: 'thiet-bi-thu',
        goiMang: async (url, o) => {
            daGui = { url, ...o, than: JSON.parse(o.body) };
            return { ok: trangThai >= 200 && trangThai < 300, status: trangThai,
                     json: async () => traVe };
        },
    });
    return { daGui, kq };
}

test('⭐⭐⭐ gửi pwd đã MÃ HÓA, không gửi mật khẩu thô', async () => {
    const { daGui } = await batYeuCau({ data: { access_token: 'the.gia.day' } });
    assert.ok(daGui.than.pwd, 'không có trường pwd');
    assert.notStrictEqual(daGui.than.pwd, 'mat-khau-thu', 'gửi mật khẩu THÔ ra mạng');
    assert.strictEqual(giaiKieuTendoo(daGui.than.pwd), 'mat-khau-thu',
        'pwd không giải ra đúng mật khẩu -> máy chủ từ chối');
    assert.ok(!('password' in daGui.than), 'gửi nhầm trường `password` (Tendoo đòi `pwd`)');
});

test('⭐⭐⭐ đủ và đúng tên các trường bắt buộc', async () => {
    const { daGui } = await batYeuCau({ data: { access_token: 'the.gia.day' } });
    assert.strictEqual(daGui.than.phone_number, '+84379215004');
    assert.strictEqual(daGui.than.device_id, 'thiet-bi-thu');
    assert.strictEqual(daGui.than.platform, 'pro_web', 'platform sai -> Tendoo từ chối');
    assert.ok('device_name' in daGui.than);
    assert.ok(daGui.url.endsWith('/user/v2/auth/login'), daGui.url);
    assert.strictEqual(daGui.method, 'POST');
});

ghiChu('── BÓC THẺ + XỬ LÝ LỖI ──');

test('⭐⭐⭐ lấy thẻ đúng chỗ body.data.access_token', async () => {
    const { kq } = await batYeuCau({ data: { access_token: 'the-that-day', refresh_token: 'r' } });
    assert.strictEqual(kq.ok, true);
    assert.strictEqual(kq.the, 'the-that-day');
});

test('⭐⭐⭐ đăng nhập xong mà không có thẻ -> báo lỗi, không trả undefined', async () => {
    const { kq } = await batYeuCau({ data: {} });
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ma, D.MA.KHONG_CO_THE);
});

test('⭐⭐⭐ 400/401/404 -> SAI_TAI_KHOAN, lời khuyên khai báo lại', async () => {
    for (const st of [400, 401, 404]) {
        const { kq } = await batYeuCau({ error: { detail: 'gì đó' } }, st);
        assert.strictEqual(kq.ok, false, 'status ' + st);
        assert.strictEqual(kq.ma, D.MA.SAI_TAI_KHOAN, 'status ' + st);
    }
});

test('⭐⭐ thiếu tài khoản hoặc mật khẩu -> báo THIEU, không gọi mạng', async () => {
    let daGoi = false;
    const kq = await D.dangNhap({ tenDangNhap: '', matKhau: 'x',
        goiMang: async () => { daGoi = true; return {}; } });
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ma, D.MA.THIEU);
    assert.strictEqual(daGoi, false, 'thiếu thông tin mà vẫn gọi mạng');
});

ghiChu('── MẬT KHẨU VÀ THẺ KHÔNG ĐƯỢC RÒ ──');

test('⭐⭐⭐ mọi thông báo lỗi KHÔNG chứa mật khẩu hay thẻ', async () => {
    // Thông báo đi thẳng vào cơ sở dữ liệu Sell rồi lên màn hình.
    const cac = [];
    cac.push((await batYeuCau({ data: {} })).kq);
    cac.push((await batYeuCau({ error: {} }, 401)).kq);
    cac.push(await D.dangNhap({ tenDangNhap: '', matKhau: 'sieu-bi-mat-123' }));
    for (const kq of cac) {
        const chu = JSON.stringify(kq);
        assert.ok(!chu.includes('sieu-bi-mat-123'), 'lộ mật khẩu: ' + chu);
        assert.ok(!chu.includes('the-that') && !chu.includes('access_token'),
            'lộ thẻ: ' + chu);
    }
});

test('⭐⭐⭐ không dòng console nào nhắc tới mật khẩu hay thẻ', () => {
    const s = doc('chung/dangNhapApi.js');
    for (const dong of s.split('\n')) {
        if (!/console\./.test(dong)) continue;
        assert.ok(!/matKhau|pwd|\bthe\b|token|access_token/i.test(dong.replace(/\/\/.*$/, '')),
            'dòng console nhắc bí mật: ' + dong.trim().slice(0, 80));
    }
});

test('⭐⭐ lời giải thích lỗi phủ đủ mọi mã lỗi', () => {
    for (const ma of Object.values(D.MA)) {
        assert.ok(D.LOI_DE_HIEU[ma], 'thiếu lời giải cho ' + ma);
    }
});

chay('ĐĂNG NHẬP TENDOO BẰNG API (23/09/2026)');
