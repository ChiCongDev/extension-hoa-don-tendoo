'use strict';

// ============================================================================
//  ẨN HAI ĐOẠN CHỮ Ở MÀN KHAI BÁO (chủ dự án yêu cầu 2026-08-15).
//
//    1. Dòng đầu trang khai báo — "Khai báo nằm trong khung riêng…"  (khaiBao.html)
//    2. Dòng chân khung trên trang Sell — "Ô nhập nằm trong khung riêng…"
//       (sell/oKhaiBao.js)
//
//  ⚠️ ẨN, KHÔNG XOÁ. Hai đoạn này là chỗ DUY NHẤT viết ra cam kết về nơi cất
//  mật khẩu Tendoo (chỉ nằm trên máy này, không lên máy chủ Sell, không lên
//  GitHub). Xoá đi là mất hẳn, sau này không ai đọc mã cũng biết. Giữ chữ lại
//  thì bật hiện lại chỉ là bỏ một dòng.
//
//  Chạy: node test/anChuKhaiBao.test.js   (cần HDT_JSDOM)
// ============================================================================

const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require(process.env.HDT_JSDOM || 'jsdom');
const { test, ghiChu, chay } = require('./chay');

globalThis.__HDT_KHONG_TU_CHAY__ = true;
const OKhaiBao = require('../sell/oKhaiBao');

const GOC = path.join(__dirname, '..');
const doc = (t) => fs.readFileSync(path.join(GOC, t), 'utf8');

/** Có thật sự nhìn thấy được không — xét cả cha ông. */
function hienRa(w, el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        const s = w.getComputedStyle(n);
        if (s.display === 'none' || s.visibility === 'hidden') return false;
    }
    return true;
}

/** Mọi mẩu chữ NGƯỜI DÙNG THẬT SỰ ĐỌC ĐƯỢC. */
function chuNhinThay(w, goc) {
    const d = w.document;
    const ra = [];
    const di = d.createTreeWalker(goc || d.body, w.NodeFilter.SHOW_TEXT);
    for (let n = di.nextNode(); n; n = di.nextNode()) {
        const c = n.textContent.replace(/\s+/g, ' ').trim();
        if (c && hienRa(w, n.parentElement)) ra.push(c);
    }
    return ra.join(' ');
}

ghiChu('— ⭐ Dòng đầu trang khai báo (khaiBao.html) —');

/** Nạp khaiBao.html vào jsdom, KHÔNG chạy script (chỉ cần xét CSS). */
function moTrangKhaiBao() {
    const dom = new JSDOM(doc('khaiBao.html'));
    return { w: dom.window, d: dom.window.document };
}

test('⭐ đoạn "Khai báo nằm trong khung riêng…" KHÔNG nhìn thấy được', () => {
    const { w, d } = moTrangKhaiBao();
    const p = d.querySelector('.dan-dau');
    assert.ok(p, 'mất hẳn đoạn chữ — phải ẩn chứ không được xoá');
    assert.strictEqual(hienRa(w, p), false, 'đoạn chữ vẫn hiện ra');
});

test('⭐ các mẩu chữ cụ thể đều biến khỏi màn', () => {
    const { w } = moTrangKhaiBao();
    const chu = chuNhinThay(w);
    for (const mau of ['khung riêng của extension', 'không gửi lên máy chủ bongtom.store',
                       'cơ sở dữ liệu', 'GitHub']) {
        assert.ok(!chu.includes(mau), 'vẫn đọc được: ' + mau);
    }
});

test('⭐ chữ VẪN CÒN trong tệp — ẩn chứ không xoá', () => {
    const html = doc('khaiBao.html');
    for (const m of ['Khai báo nằm trong', 'khung riêng của extension',
                     'không gửi lên máy chủ bongtom.store', 'không lên GitHub']) {
        assert.ok(html.includes(m), 'đã bị xoá khỏi tệp: ' + m);
    }
});

test('⭐ ô chứa màn khai báo VẪN HIỆN — không ẩn nhầm cả trang', () => {
    const { w, d } = moTrangKhaiBao();
    const o = d.getElementById('khaiBao');
    assert.ok(o, 'mất ô chứa màn khai báo');
    assert.strictEqual(hienRa(w, o), true, 'ẩn nhầm cả màn khai báo');
});

test('các thẻ <script> của trang vẫn còn đủ', () => {
    const html = doc('khaiBao.html');
    for (const t of ['chung/khoMatKhau.js', 'tendoo/ghiNhanCuaHang.js',
                     'popup/khaiBao.js', 'khaiBaoTrang.js']) {
        assert.ok(html.includes(t), 'mất script: ' + t);
    }
});

ghiChu('— ⭐ Dòng chân khung trên trang Sell (oKhaiBao.js) —');

function moKhungTrenSell() {
    const dom = new JSDOM('<!doctype html><body><div id="the"><table id="b"></table></div></body>');
    const tailieu = dom.window.document;
    const o = OKhaiBao.taoOKhaiBao({
        tailieu,
        diaChiTrang: OKhaiBao.taoDiaChiTrang({
            runtime: { getURL: (t) => 'chrome-extension://abcxyz/' + t },
        }),
        guiNen: async () => ({ coKho: true, dangMo: true, khach: {} }),
    });
    o.mo('PA', 'Phương Anh');
    return { w: dom.window, d: tailieu };
}

test('⭐ dòng chân "Ô nhập nằm trong khung riêng…" KHÔNG nhìn thấy được', () => {
    const { w, d } = moKhungTrenSell();
    const chan = d.getElementById('hdt-kb-chan');
    assert.ok(chan, 'mất hẳn dòng chân — phải ẩn chứ không được xoá');
    assert.strictEqual(hienRa(w, chan), false, 'dòng chân vẫn hiện ra');
});

test('⭐ chữ trong đó vẫn còn nguyên, chỉ là không hiện', () => {
    const { d } = moKhungTrenSell();
    const chan = d.getElementById('hdt-kb-chan');
    assert.match(chan.textContent, /trang bongtom\.store không đọc được chữ bạn gõ/);
    assert.match(chan.textContent, /không gửi lên máy chủ bongtom\.store/);
});

test('⭐ mẩu chữ đó biến khỏi màn', () => {
    const { w, d } = moKhungTrenSell();
    const khung = d.getElementById(OKhaiBao.ID_KHUNG);
    const chu = chuNhinThay(w, khung);
    assert.ok(!chu.includes('Ô nhập nằm trong khung riêng'), 'vẫn đọc được dòng chân');
});

test('⭐ IFRAME khai báo VẪN CÒN — không ẩn nhầm khung nhập', () => {
    // Ẩn nhầm chỗ này là người dùng mất sạch đường khai báo, vì popup đã bỏ hết
    // ô nhập. Đây là thứ phải giữ bằng mọi giá.
    const { w, d } = moKhungTrenSell();
    const khung = d.getElementById(OKhaiBao.ID_KHUNG);
    const iframe = khung.querySelector('iframe');
    assert.ok(iframe, 'mất iframe khai báo');
    assert.strictEqual(hienRa(w, iframe), true, 'ẩn nhầm cả iframe khai báo');
    assert.match(iframe.src, /^chrome-extension:\/\//);
});

test('⭐ nút đóng khung vẫn bấm được', () => {
    const { w, d } = moKhungTrenSell();
    const khung = d.getElementById(OKhaiBao.ID_KHUNG);
    const nut = khung.querySelector('button');
    assert.ok(nut, 'mất nút đóng');
    assert.strictEqual(hienRa(w, nut), true);
});

test('⭐ vẫn KHÔNG có ô <input> nào nằm ngoài iframe', () => {
    // Luật cũ, không được phá: cắm ô nhập thẳng vào trang là trang Sell đọc
    // được mật khẩu.
    const { d } = moKhungTrenSell();
    const khung = d.getElementById(OKhaiBao.ID_KHUNG);
    assert.strictEqual(khung.querySelectorAll('input').length, 0);
});

ghiChu('— ⭐ Ẩn bằng MỘT chỗ, bật lại dễ —');

test('⭐ khaiBao.html: đúng một luật ẩn, bỏ đi là hiện lại', () => {
    const html = doc('khaiBao.html');
    const luat = html.match(/\.dan-dau\s*\{\s*display:\s*none;?\s*\}/g) || [];
    assert.strictEqual(luat.length, 1, 'luật ẩn nằm rải rác ' + luat.length + ' chỗ');
});

test('⭐ oKhaiBao.js: ẩn bằng đúng một dòng style, không xoá phần tử', () => {
    const ma = doc('sell/oKhaiBao.js');
    const than = ma.slice(ma.indexOf("chan.id = 'hdt-kb-chan'"), ma.indexOf('LỐI THOÁT'));
    assert.match(than, /chan\.style\.display = 'none'/);
    assert.match(than, /chan\.textContent = /, 'đã xoá luôn chữ thay vì ẩn');
});

chay('ẨN CHỮ Ở MÀN KHAI BÁO — ẩn chứ không xoá');
