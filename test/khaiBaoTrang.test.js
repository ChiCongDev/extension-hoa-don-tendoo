'use strict';

// ============================================================================
//  TEST TÍCH HỢP TRANG KHAI BÁO (khaiBao.html) — trang được NHÚNG vào Sell
//
//  Nạp HTML rồi chạy các <script src> đúng thứ tự như Chrome làm. Đây là bản
//  thay thế cho phần khai báo vốn nằm trong popup: nếu trang này hỏng thì người
//  dùng không còn chỗ nào để khai báo tài khoản nữa.
//
//  Popup từng hiện ra TRỐNG TRƠN mà toàn bộ test vẫn xanh, vì không có bài test
//  nào nạp file HTML thật. Trang này ra đời sau, nhưng dính đúng rủi ro đó.
// ============================================================================

const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require(process.env.HDT_JSDOM || 'jsdom');
const { test, ghiChu, chay } = require('./chay');

const GOC = path.join(__dirname, '..');

async function moTrang({ khoDaLuu = null, thamSo = '' } = {}) {
    const html = fs.readFileSync(path.join(GOC, 'khaiBao.html'), 'utf8');
    const dom = new JSDOM(html, {
        runScripts: 'outside-only',
        url: 'chrome-extension://test/khaiBao.html' + thamSo,
    });
    const cuaSo = dom.window;

    // jsdom KHÔNG có crypto.subtle -> mượn WebCrypto của Node.
    Object.defineProperty(cuaSo, 'crypto', {
        value: require('node:crypto').webcrypto, configurable: true, writable: true,
    });

    let luuTru = khoDaLuu;
    const loiScript = [];
    const tinDaGui = [];
    const tinLenCha = [];
    // Trang cha giả — chỉ để bắt xem con gửi cái gì lên.
    cuaSo.parent = { postMessage: (d) => tinLenCha.push(d) };

    cuaSo.chrome = {
        runtime: {
            getManifest: () => ({ version: '0.0.0-test' }),
            async sendMessage(tin) {
                tinDaGui.push(tin);
                return { ok: true };
            },
        },
        storage: {
            local: {
                async get(k) { return luuTru ? { [k]: luuTru } : {}; },
                async set(o) { luuTru = Object.values(o)[0]; },
                async remove() { luuTru = null; },
            },
        },
    };

    const cacScript = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
    assert.ok(cacScript.length >= 3, 'khaiBao.html không có script nào để chạy');
    for (const duong of cacScript) {
        const ma = fs.readFileSync(path.join(GOC, duong), 'utf8');
        try {
            vm.runInContext(ma, dom.getInternalVMContext(), { filename: duong });
        } catch (e) {
            loiScript.push(`${duong}: ${e.message}`);
        }
    }

    cuaSo.document.dispatchEvent(new cuaSo.Event('DOMContentLoaded', { bubbles: true }));
    await new Promise(r => setTimeout(r, 60));

    return { dom, cuaSo, tailieu: cuaSo.document, loiScript, cacScript,
             layKho: () => luuTru, tinDaGui, tinLenCha };
}

ghiChu('— Trang có chạy được không —');

test('không script nào NỔ khi chạy', async () => {
    const { loiScript } = await moTrang();
    assert.deepStrictEqual(loiScript, [], 'có script nổ: ' + loiScript.join(' | '));
});

test('mọi script khai trong HTML đều CÓ THẬT trên đĩa', async () => {
    const { cacScript } = await moTrang();
    for (const d of cacScript) {
        assert.ok(fs.existsSync(path.join(GOC, d)), `khaiBao.html gọi ${d} nhưng không có file`);
    }
});

test('các bộ phận gắn được vào globalThis', async () => {
    const { cuaSo } = await moTrang();
    assert.ok(cuaSo.HDT_KhoMatKhau, 'thiếu HDT_KhoMatKhau');
    assert.ok(cuaSo.HDT_KhaiBao, 'thiếu HDT_KhaiBao');
    assert.ok(cuaSo.HDT_KhaiBaoTrang, 'thiếu HDT_KhaiBaoTrang');
});

test('KHÔNG có script viết thẳng trong HTML — Manifest V3 chặn, trang sẽ chết câm', () => {
    const html = fs.readFileSync(path.join(GOC, 'khaiBao.html'), 'utf8');
    const cacThe = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)];
    const coMa = cacThe.filter(m => m[1].trim().length > 0);
    assert.strictEqual(coMa.length, 0,
        'có <script> inline — CSP của extension sẽ chặn, trang hiện ra trống trơn');
});

ghiChu('— Ba trạng thái của kho —');

test('⭐ CHƯA CÓ KHO → vào THẲNG màn khai báo, không hỏi khóa mở', async () => {
    const { tailieu, layKho } = await moTrang();
    assert.ok(tailieu.getElementById('kbLuu'), 'không vào được màn khai báo');
    assert.strictEqual(tailieu.getElementById('kbDatKhoaMo'), null, 'vẫn hỏi đặt khóa mở');
    assert.strictEqual(tailieu.getElementById('kbMoKho'), null, 'vẫn hỏi mở kho');
    // Kho được dựng và ghi xuống ngay, không chờ người dùng làm gì.
    for (let i = 0; i < 100 && !layKho(); i++) await new Promise(r => setTimeout(r, 20));
    assert.ok(layKho() && layKho().chiaKhoa, 'chưa dựng kho có chìa tự sinh');
});

test('⭐ ĐÃ CÓ KHO → hiện luôn danh sách, không chặn', async () => {
    const Kho2 = require('../chung/khoMatKhau');
    const kho = await Kho2.taoKho();
    const mo = await Kho2.moKho(kho);
    await Kho2.ghiKhach(kho, mo.khoa, 'PA', {
        maCuaHang: '2c683a17-09ab-4655-8dbf-50ca8105373c',
        tenDangNhap: '0344168490', matKhau: 'mat-khau-that', ghiChu: 'Phương Anh',
    });
    const { tailieu } = await moTrang({ khoDaLuu: kho });
    assert.ok(tailieu.getElementById('kbDanhSach'), 'không thấy danh sách khách');
    assert.ok(tailieu.getElementById('kbLuu'), 'không cho khai báo tiếp');
    assert.ok(!tailieu.body.textContent.includes('mat-khau-that'), 'lộ mật khẩu ra màn hình');
});

test('kho BẢN CŨ → hỏi chuyển đổi MỘT LẦN, chưa cho khai báo', async () => {
    const { tailieu } = await moTrang({ khoDaLuu: {
        phienBan: 1, muoi: 'x', cauKiemTra: { iv: 'a', duLieu: 'b' }, khach: {} } });
    assert.ok(tailieu.getElementById('kbKhoCu'), 'không hỏi chuyển đổi kho cũ');
    assert.ok(tailieu.getElementById('kbChuyenKhoCu'));
    assert.strictEqual(tailieu.getElementById('kbLuu'), null);
});

ghiChu('— Điền sẵn theo khách vừa bấm bên Sell —');

test('⭐ mở từ dòng khách → mã KH điền sẵn, khỏi phải nhớ mà gõ lại', async () => {
    const Kho = require('../chung/khoMatKhau');
    const kho = await Kho.taoKho();
    const { tailieu } = await moTrang({ khoDaLuu: kho, thamSo: '?maKH=KH2607160003&ten=ki%C3%AAn' });
    for (let i = 0; i < 200 && !tailieu.getElementById('kbMaKH'); i++) {
        await new Promise(r => setTimeout(r, 100));
    }
    assert.strictEqual(tailieu.getElementById('kbMaKH').value, 'KH2607160003');
    assert.strictEqual(tailieu.getElementById('kbGhiChu').value, 'kiên');
});

test('mở khai báo ĐÃ CÓ → điền sẵn mã cửa hàng + tên đăng nhập, TUYỆT ĐỐI không điền mật khẩu', async () => {
    const Kho = require('../chung/khoMatKhau');
    const kho = await Kho.taoKho();
    const mo = await Kho.moKho(kho);
    await Kho.ghiKhach(kho, mo.khoa, 'PA', {
        maCuaHang: '2c683a17-09ab-4655-8dbf-50ca8105373c',
        tenDangNhap: '0344168490', matKhau: 'mat-khau-that', ghiChu: 'Phương Anh',
    });
    const { tailieu } = await moTrang({ khoDaLuu: kho, thamSo: '?maKH=PA' });
    for (let i = 0; i < 200 && !tailieu.getElementById('kbMaKH'); i++) {
        await new Promise(r => setTimeout(r, 100));
    }
    assert.strictEqual(tailieu.getElementById('kbCuaHang').value, '2c683a17-09ab-4655-8dbf-50ca8105373c');
    assert.strictEqual(tailieu.getElementById('kbTenDangNhap').value, '0344168490');
    assert.strictEqual(tailieu.getElementById('kbMatKhau').value, '',
        '❌ ĐIỀN LẠI MẬT KHẨU RA MÀN HÌNH — mật khẩu không bao giờ được vẽ ra');
    assert.ok(!tailieu.body.textContent.includes('mat-khau-that'),
        '❌ mật khẩu lọt ra màn hình');
});

test('không có tham số → không điền bậy vào ô mã KH', async () => {
    const Kho = require('../chung/khoMatKhau');
    const kho = await Kho.taoKho();
    const { tailieu } = await moTrang({ khoDaLuu: kho });
    for (let i = 0; i < 200 && !tailieu.getElementById('kbMaKH'); i++) {
        await new Promise(r => setTimeout(r, 100));
    }
    assert.strictEqual(tailieu.getElementById('kbMaKH').value, '');
});

ghiChu('— Nói chuyện với trang cha: CHỈ một nhãn, không kèm dữ liệu —');

test('⭐ tin gửi lên trang cha KHÔNG mang mã khách, tên đăng nhập hay mật khẩu', async () => {
    const Kho = require('../chung/khoMatKhau');
    const kho = await Kho.taoKho();
    const mo = await Kho.moKho(kho);
    await Kho.ghiKhach(kho, mo.khoa, 'PA', {
        maCuaHang: '2c683a17-09ab-4655-8dbf-50ca8105373c',
        tenDangNhap: '0344168490', matKhau: 'mat-khau-that', ghiChu: 'Phương Anh',
    });
    const { tailieu, tinLenCha } = await moTrang({ khoDaLuu: kho, thamSo: '?maKH=PA' });
    for (let i = 0; i < 200 && tinLenCha.length < 2; i++) await new Promise(r => setTimeout(r, 100));

    assert.ok(tinLenCha.length >= 1, 'không báo gì cho trang cha — dấu hiệu trên bảng không tự tô lại');
    for (const t of tinLenCha) {
        // deepStrictEqual không dùng được: đối tượng sinh trong ngữ cảnh vm nên
        // khác prototype. So khóa + giá trị là đủ và đúng ý.
        assert.deepStrictEqual(Object.keys(t).sort(), ['hdt'],
            '❌ gửi thừa dữ liệu sang trang Sell: ' + JSON.stringify(t));
        assert.strictEqual(t.hdt, 'khai-bao-doi');
    }
    const chuoi = JSON.stringify(tinLenCha);
    for (const cam of ['mat-khau-that', '0344168490', '2c683a17', 'PA']) {
        assert.ok(!chuoi.includes(cam), `❌ "${cam}" lọt sang trang cha`);
    }
});

test('lưu khai báo xong → báo cho trang cha để nó tô lại dấu hiệu', async () => {
    const Kho = require('../chung/khoMatKhau');
    const kho = await Kho.taoKho();
    const { tailieu, tinLenCha } = await moTrang({ khoDaLuu: kho });
    for (let i = 0; i < 200 && !tailieu.getElementById('kbLuu'); i++) {
        await new Promise(r => setTimeout(r, 100));
    }
    const truoc = tinLenCha.length;
    tailieu.getElementById('kbMaKH').value = 'PA';
    tailieu.getElementById('kbCuaHang').value = '2c683a17-09ab-4655-8dbf-50ca8105373c';
    tailieu.getElementById('kbTenDangNhap').value = 'tk';
    tailieu.getElementById('kbMatKhau').value = 'mk-tendoo';
    tailieu.getElementById('kbLuu').click();
    for (let i = 0; i < 200 && tinLenCha.length === truoc; i++) await new Promise(r => setTimeout(r, 100));
    assert.ok(tinLenCha.length > truoc, 'lưu xong mà không báo trang cha');
});

ghiChu('— Mật khẩu đi đúng đường —');

test('⭐ mật khẩu đọc lại được NGAY, không qua bộ nhớ phiên nào', async () => {
    const Kho2 = require('../chung/khoMatKhau');
    const kho = await Kho2.taoKho();
    const mo = await Kho2.moKho(kho);
    await Kho2.ghiKhach(kho, mo.khoa, 'PA', {
        maCuaHang: '2c683a17-09ab-4655-8dbf-50ca8105373c',
        tenDangNhap: 'tk', matKhau: 'mat-khau-that', ghiChu: '',
    });
    const { layKho } = await moTrang({ khoDaLuu: kho });

    // Trên ĐĨA vẫn là bản mã — nhưng chìa nằm ngay cạnh, nên mở được ngay.
    // Đây là CHE MẮT chứ không phải bảo vệ, và test này ghi lại đúng sự thật đó.
    const tren = JSON.stringify(layKho());
    assert.ok(!tren.includes('mat-khau-that'), 'mật khẩu nằm dạng chữ thường trên đĩa');
    const mo2 = await Kho2.moKho(layKho());
    assert.strictEqual(mo2.ok, true, 'không mở được kho mà không hỏi ai');
    assert.strictEqual(await Kho2.docMatKhau(layKho(), mo2.khoa, 'PA'), 'mat-khau-that');
});

test('trang KHÔNG tự gửi gì lên máy chủ — không fetch, không XHR, không form action', () => {
    const ma = fs.readFileSync(path.join(GOC, 'khaiBaoTrang.js'), 'utf8')
             + fs.readFileSync(path.join(GOC, 'popup/khaiBao.js'), 'utf8');
    assert.ok(!/\bfetch\s*\(/.test(ma), 'có fetch — khai báo có thể rò ra ngoài');
    assert.ok(!/XMLHttpRequest/.test(ma), 'có XMLHttpRequest');
    assert.ok(!/navigator\.sendBeacon/.test(ma), 'có sendBeacon');
    const html = fs.readFileSync(path.join(GOC, 'khaiBao.html'), 'utf8');
    assert.ok(!/<form/i.test(html), 'có thẻ form — dễ vô tình submit đi đâu đó');
});

test('trang nói rõ dữ liệu KHÔNG lên máy chủ Sell', () => {
    const html = fs.readFileSync(path.join(GOC, 'khaiBao.html'), 'utf8');
    assert.match(html, /không gửi lên máy chủ/i);
});

chay('TRANG KHAI BÁO NHÚNG VÀO SELL');
