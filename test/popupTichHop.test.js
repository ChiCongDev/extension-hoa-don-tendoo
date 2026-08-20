'use strict';

// ============================================================================
//  TEST TÍCH HỢP TRANG POPUP — nạp popup.html rồi chạy các <script src> ĐÚNG
//  THỨ TỰ như Chrome làm, với chrome.storage giả.
//
//  VÌ SAO CẦN: các test khác gọi thẳng hàm qua require(). Cách đó KHÔNG kiểm
//  tra được đường nối thật: script có gán vào globalThis không, popup.js có
//  thấy chúng không, DOMContentLoaded có chạy không. Popup từng hiện ra trống
//  trơn mà toàn bộ 226 test vẫn xanh — chính vì thiếu bài test này.
// ============================================================================

const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require(process.env.HDT_JSDOM || 'jsdom');
const { test, ghiChu, chay } = require('./chay');

const GOC = path.join(__dirname, '..');

/** Dựng popup y như Chrome: nạp HTML, chạy từng script, rồi bắn DOMContentLoaded. */
async function moPopup({ khoDaLuu = null, tinhTrang = null } = {}) {
    const html = fs.readFileSync(path.join(GOC, 'popup.html'), 'utf8');
    const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'chrome-extension://test/popup.html' });
    const cuaSo = dom.window;

    // jsdom KHÔNG có crypto.subtle (Chrome thật thì có) -> mượn WebCrypto của
    // Node, nếu không phần mã hóa sẽ nổ và test đỏ oan.
    Object.defineProperty(cuaSo, 'crypto', {
        value: require('node:crypto').webcrypto, configurable: true, writable: true,
    });

    let luuTru = khoDaLuu;
    const loiScript = [];
    const tinDaGui = [];
    let caiDat = khoDaLuu && khoDaLuu.__caiDat ? khoDaLuu.__caiDat : { tuBam: false, daHieu: false };
    void tinhTrang;
    cuaSo.chrome = {
        runtime: {
            getManifest: () => ({ version: '0.0.0-test' }),
            async sendMessage(tin) {
                tinDaGui.push(tin);
                if (tin.loai === 'hdt-hoi-cai-dat') return caiDat;
                if (tin.loai === 'hdt-tinh-trang-kho') return tinhTrang;
                if (tin.loai === 'hdt-dat-cai-dat') {
                    // GỘP y như tiến trình nền thật — mỗi công tắc chỉ gửi phần
                    // của mình, ghi đè cả gói là tắt lây sang công tắc kia.
                    const c = { ...caiDat };
                    if ('tuBam' in tin || 'daHieu' in tin) {
                        c.tuBam = !!tin.tuBam;
                        c.daHieu = !!(tin.tuBam && tin.daHieu);
                    }
                    if ('xoaGioLa' in tin) c.xoaGioLa = !!tin.xoaGioLa;
                    if ('boQuaThue' in tin) c.boQuaThue = !!tin.boQuaThue;
                    caiDat = c;
                    return { ok: true, ...caiDat };
                }
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
    assert.ok(cacScript.length >= 1, 'popup.html không có script nào để chạy');

    for (const duong of cacScript) {
        const ma = fs.readFileSync(path.join(GOC, duong), 'utf8');
        try {
            vm.runInContext(ma, dom.getInternalVMContext(), { filename: duong });
        } catch (e) {
            loiScript.push(`${duong}: ${e.message}`);
        }
    }

    cuaSo.document.dispatchEvent(new cuaSo.Event('DOMContentLoaded', { bubbles: true }));
    await new Promise(r => setTimeout(r, 50));   // đợi phần async của popup.js

    return { dom, cuaSo, tailieu: cuaSo.document, loiScript, layKhoDaLuu: () => luuTru,
             tinDaGui, layCaiDat: () => caiDat };
}

ghiChu('— Script có nạp được không —');

test('không script nào NỔ khi chạy', async () => {
    const { loiScript } = await moPopup();
    assert.deepStrictEqual(loiScript, [], 'có script nổ: ' + loiScript.join(' | '));
});

ghiChu('— Popup KHÔNG còn ô nhập nào —');

test('⭐ popup KHÔNG có bất kỳ ô nhập chữ/mật khẩu nào', async () => {
    // Người dùng đã dời hẳn việc khai báo sang trang Sell. Còn sót một ô nhập ở
    // đây là còn hai chỗ làm cùng một việc, sớm muộn lệch nhau.
    const { tailieu } = await moPopup();
    const oNhap = [...tailieu.querySelectorAll('input')]
        .filter(o => o.type !== 'checkbox');
    assert.deepStrictEqual(oNhap.map(o => o.id), [],
        'popup vẫn còn ô nhập: ' + oNhap.map(o => o.id || o.type).join(', '));
});

test('⭐ popup KHÔNG nạp màn hình khai báo nữa', async () => {
    const html = fs.readFileSync(path.join(GOC, 'popup.html'), 'utf8');
    assert.ok(!/popup\/khaiBao\.js/.test(html),
        'popup vẫn nạp popup/khaiBao.js — hai chỗ khai báo song song');
    assert.ok(!/id="khaiBao"/.test(html), 'popup vẫn còn ô chứa màn khai báo');
});

test('popup chỉ dẫn người dùng sang trang Sell', async () => {
    const { tailieu } = await moPopup();
    const chu = tailieu.getElementById('chiDuong').textContent.replace(/\s+/g, ' ');
    assert.match(chu, /báo cáo khách hàng của bongtom\.store/i);
    assert.match(chu, /Không còn khóa mở/i);
});

ghiChu('— Tóm tắt kho: chỉ đếm, không lộ gì —');

test('chưa khai báo gì → nói thẳng là chưa có', async () => {
    const { tailieu } = await moPopup({ tinhTrang: { coKho: false, dangMo: false, khach: {} } });
    assert.match(tailieu.getElementById('tomTatKho').textContent, /Chưa khai báo/);
});

test('khai báo từ BẢN CŨ → nhắc sang trang Sell chuyển đổi', async () => {
    const { tailieu } = await moPopup({ tinhTrang: {
        coKho: true, dangMo: false, khach: { PA: { daKhaiBao: true, daMoKhoa: false } } } });
    const chu = tailieu.getElementById('tomTatKho').textContent;
    assert.match(chu, /chuyển đổi/i);
    assert.match(chu, /1 khách/);
});

test('⭐ khai báo bình thường → báo SẮN SÀNG, không đòi gõ gì', async () => {
    const { tailieu } = await moPopup({ tinhTrang: {
        coKho: true, dangMo: true, khach: { PA: { daKhaiBao: true, daMoKhoa: true } } } });
    const chu = tailieu.getElementById('tomTatKho').textContent;
    assert.match(chu, /sẵn sàng/i);
    assert.ok(!/khóa mở/i.test(chu), 'vẫn nhắc khóa mở trong khi đã bỏ');
});

test('không có tiến trình nền → không nổ, chỉ báo chưa đọc được', async () => {
    const { tailieu } = await moPopup({ tinhTrang: null });
    assert.match(tailieu.getElementById('tomTatKho').textContent, /Chưa đọc được/);
});

ghiChu('— Popup nói đúng sự thật —');

test('số phiên bản trên popup lấy từ manifest thật', async () => {
    const { tailieu } = await moPopup();
    assert.match(tailieu.getElementById('phienBan').textContent, /0\.0\.0-test/);
});

test('phần ghi chú quyền (đã ẩn) vẫn phải ĐÚNG — bật lại lúc nào cũng đúng', async () => {
    // Popup từng ghi "chưa xin quyền tendoo" rồi "chưa xin quyền tabs" trong khi
    // manifest đã xin cả hai. Test này khóa lại: nói sai về quyền là ĐỎ.
    //
    // ⚠️ Từ bản 2.14.0 đoạn này bị ẨN (popup chỉ còn ô tích). Nó vẫn nằm trong
    // tệp để bật lại được, nên vẫn phải canh cho đúng — nhưng đừng đọc test này
    // thành "người dùng đang thấy danh sách quyền". Họ KHÔNG thấy.
    const html = fs.readFileSync(path.join(GOC, 'popup.html'), 'utf8');
    const manifest = JSON.parse(fs.readFileSync(path.join(GOC, 'manifest.json'), 'utf8'));

    for (const q of manifest.permissions) {
        assert.ok(!new RegExp('Chưa xin quyền[^<]{0,40}' + q, 'i').test(html),
            `popup bảo chưa xin quyền "${q}" trong khi manifest đã xin`);
        assert.ok(html.includes(q), `popup không liệt kê quyền "${q}" đang có`);
    }
    assert.ok(!/Chưa xin quyền nào với tendoo/i.test(html));
});

test('phần cảnh báo (đã ẩn) vẫn nói ĐÚNG: công tắc mặc định TẮT', async () => {
    // ⚠️ Cũng như trên: đoạn này đã ẩn từ bản 2.14.0, vẫn canh cho đúng phòng
    // khi bật lại. Thứ NGƯỜI DÙNG thật sự thấy được canh ở nhóm "GIAO DIỆN GỌN".
    const html = fs.readFileSync(path.join(GOC, 'popup.html'), 'utf8');
    assert.ok(/MẶC ĐỊNH TẮT/i.test(html),
        'popup phải nói rõ công tắc mặc định tắt');
    assert.ok(/không bấm Thanh toán/i.test(html),
        'popup phải nói rõ khi tắt thì không bấm Thanh toán');
    assert.ok(/không tạo/i.test(html) && /hóa đơn nào/i.test(html),
        'popup phải nói rõ khi tắt thì không tạo hóa đơn nào');
});

ghiChu('— Công tắc tự bấm Thanh toán ngay trong popup —');

test('mở lần đầu: công tắc TẮT, KHÔNG hiện ô xác nhận', async () => {
    const { tailieu } = await moPopup();
    const o = tailieu.getElementById('ctTuBam');
    assert.ok(o, 'popup thiếu công tắc tự bấm');
    assert.strictEqual(o.checked, false);
    assert.strictEqual(tailieu.getElementById('ctLopHai').style.display, 'none',
        'lộ ô xác nhận khi chưa bật lớp trên');
    assert.match(tailieu.getElementById('ctTrangThai').textContent, /Đang TẮT/);
});

test('bật lớp trên nhưng chưa xác nhận → vẫn coi là CHƯA bật', async () => {
    const { tailieu, layCaiDat } = await moPopup();
    tailieu.getElementById('ctTuBam').click();
    await new Promise(r => setTimeout(r, 30));
    assert.strictEqual(layCaiDat().daHieu, false);
    assert.match(tailieu.getElementById('ctTrangThai').textContent, /CHƯA xác nhận/);
});

test('bật đủ hai lớp → lưu lại và cảnh báo bằng chữ đỏ', async () => {
    const { tailieu, layCaiDat } = await moPopup();
    tailieu.getElementById('ctTuBam').click();
    await new Promise(r => setTimeout(r, 30));
    tailieu.getElementById('ctDaHieu').click();
    await new Promise(r => setTimeout(r, 30));
    assert.deepStrictEqual(layCaiDat(), { tuBam: true, daHieu: true });
    assert.match(tailieu.getElementById('ctTrangThai').textContent, /ĐANG BẬT/);
    assert.match(tailieu.getElementById('congTacTuBam').className, /bat/);
});

test('tắt lớp trên → xác nhận bị xóa theo', async () => {
    const { tailieu, layCaiDat } = await moPopup();
    tailieu.getElementById('ctTuBam').click();
    await new Promise(r => setTimeout(r, 30));
    tailieu.getElementById('ctDaHieu').click();
    await new Promise(r => setTimeout(r, 30));
    tailieu.getElementById('ctTuBam').click();
    await new Promise(r => setTimeout(r, 30));
    assert.deepStrictEqual(layCaiDat(), { tuBam: false, daHieu: false });
});

ghiChu('— Công tắc tự xóa giỏ lạ —');

test('mở lần đầu: TẮT, nói rõ chỉ dọn giỏ của máy', async () => {
    const { tailieu } = await moPopup();
    const o = tailieu.getElementById('ctXoaGioLa');
    assert.ok(o, 'popup thiếu công tắc xóa giỏ lạ');
    assert.strictEqual(o.checked, false, '❌ mặc định BẬT — máy được phép xóa hàng người dùng');
    assert.match(tailieu.getElementById('ctXoaGioTrangThai').textContent,
        /Chỉ tự dọn giỏ do chính máy để lại/);
});

test('bật lên → lưu lại và cảnh báo rõ hậu quả', async () => {
    const { tailieu, layCaiDat } = await moPopup();
    tailieu.getElementById('ctXoaGioLa').click();
    await new Promise(r => setTimeout(r, 30));
    assert.strictEqual(layCaiDat().xoaGioLa, true);
    assert.match(tailieu.getElementById('ctXoaGioTrangThai').textContent,
        /kể cả hàng bạn tự chọn/);
});

test('⭐ gạt công tắc xóa giỏ KHÔNG làm tắt công tắc tự bấm', async () => {
    // Hai công tắc dùng chung một chỗ lưu. Ghi đè cả gói là gạt cái này thì cái
    // kia tự tắt, người dùng không hiểu vì sao hóa đơn thôi không ra nữa.
    const { tailieu, layCaiDat } = await moPopup();
    tailieu.getElementById('ctTuBam').click();
    await new Promise(r => setTimeout(r, 30));
    tailieu.getElementById('ctDaHieu').click();
    await new Promise(r => setTimeout(r, 30));
    assert.strictEqual(layCaiDat().daHieu, true);

    tailieu.getElementById('ctXoaGioLa').click();
    await new Promise(r => setTimeout(r, 30));
    assert.strictEqual(layCaiDat().tuBam, true, '❌ tắt lây công tắc tự bấm');
    assert.strictEqual(layCaiDat().daHieu, true, '❌ mất xác nhận tự bấm');
    assert.strictEqual(layCaiDat().xoaGioLa, true);
});

test('⭐ gạt công tắc tự bấm KHÔNG làm tắt công tắc xóa giỏ', async () => {
    const { tailieu, layCaiDat } = await moPopup();
    tailieu.getElementById('ctXoaGioLa').click();
    await new Promise(r => setTimeout(r, 30));
    tailieu.getElementById('ctTuBam').click();
    await new Promise(r => setTimeout(r, 30));
    assert.strictEqual(layCaiDat().xoaGioLa, true, '❌ tắt lây công tắc xóa giỏ');
});

ghiChu('— ⭐ Công tắc bỏ qua cảnh báo thuế —');

test('mở lần đầu: TẮT, nói rõ máy sẽ dừng', async () => {
    const { tailieu } = await moPopup();
    const o = tailieu.getElementById('ctBoQuaThue');
    assert.ok(o, 'popup thiếu công tắc bỏ qua thuế');
    assert.strictEqual(o.checked, false, '❌ mặc định BẬT — tự ý bỏ qua cảnh báo thuế');
    assert.match(tailieu.getElementById('ctBoQuaThueTrangThai').textContent,
        /Đang TẮT[\s\S]*không phát hành/);
});

test('⭐ bật lên → lưu lại và cảnh báo ĐÚNG hậu quả Tendoo nói', async () => {
    const { tailieu, layCaiDat } = await moPopup();
    tailieu.getElementById('ctBoQuaThue').click();
    await new Promise(r => setTimeout(r, 30));
    assert.strictEqual(layCaiDat().boQuaThue, true);
    const chu = tailieu.getElementById('ctBoQuaThueTrangThai').textContent;
    assert.match(chu, /Tờ khai thuế/);
    assert.match(chu, /Sổ kế toán/);
    assert.match(chu, /KHÔNG chính xác/i);
});

test('⭐ gạt công tắc thuế KHÔNG làm tắt hai công tắc kia', async () => {
    const { tailieu, layCaiDat } = await moPopup();
    tailieu.getElementById('ctTuBam').click();
    await new Promise(r => setTimeout(r, 30));
    tailieu.getElementById('ctDaHieu').click();
    await new Promise(r => setTimeout(r, 30));
    tailieu.getElementById('ctXoaGioLa').click();
    await new Promise(r => setTimeout(r, 30));

    tailieu.getElementById('ctBoQuaThue').click();
    await new Promise(r => setTimeout(r, 30));

    const c = layCaiDat();
    assert.strictEqual(c.tuBam, true, '❌ tắt lây công tắc tự bấm');
    assert.strictEqual(c.daHieu, true, '❌ mất xác nhận tự bấm');
    assert.strictEqual(c.xoaGioLa, true, '❌ tắt lây công tắc xóa giỏ');
    assert.strictEqual(c.boQuaThue, true);
});

ghiChu('— Các nhóm script chèn vào trang cũng không được đụng nhau —');

/** Nạp cả nhóm content script vào MỘT phạm vi, đúng như Chrome làm. */
function napNhom(cacFile) {
    const dom = new JSDOM('<!doctype html><body></body>', {
        runScripts: 'outside-only', url: 'https://vi-du.test/',
    });
    Object.defineProperty(dom.window, 'crypto', {
        value: require('node:crypto').webcrypto, configurable: true, writable: true,
    });
    const loi = [];
    for (const f of cacFile) {
        const ma = fs.readFileSync(path.join(GOC, f), 'utf8');
        try { vm.runInContext(ma, dom.getInternalVMContext(), { filename: f }); }
        catch (e) { loi.push(`${f}: ${e.message}`); }
    }
    return { cuaSo: dom.window, loi };
}

const manifest = JSON.parse(fs.readFileSync(path.join(GOC, 'manifest.json'), 'utf8'));

test('MỌI nhóm content script nạp chung mà KHÔNG file nào nổ', () => {
    // Đây là bài test đáng lẽ phải có từ đầu: hai file cùng khai `const API`
    // thì file thứ hai nổ, Chrome nuốt lỗi, và tính năng chết lặng lẽ.
    for (const cs of manifest.content_scripts) {
        const { loi } = napNhom(cs.js);
        assert.deepStrictEqual(loi, [],
            `nhóm ${cs.matches[0]} có file nổ: ${loi.join(' | ')}`);
    }
});

test('nhóm trang POS Tendoo gắn đủ bộ phận cần dùng', () => {
    const cs = manifest.content_scripts.find(c => c.matches.some(m => m.includes('seller-v3')));
    const { cuaSo, loi } = napNhom(cs.js);
    assert.deepStrictEqual(loi, []);
    for (const ten of ['HDT_DanhTinh', 'HDT_DocSanPham', 'HDT_BoNoi', 'HDT_GhepTien']) {
        assert.ok(cuaSo[ten], `trang POS thiếu ${ten} — nối vào Tendoo sẽ chết lặng lẽ`);
    }
});

test('nhóm trang báo cáo Sell gắn đủ bộ phận cần dùng', () => {
    const cs = manifest.content_scripts.find(c => c.matches.some(m => m.includes('bao-cao-khach-hang')));
    const { cuaSo, loi } = napNhom(cs.js);
    assert.deepStrictEqual(loi, []);
    // Từ giai đoạn 6, trang Sell KHÔNG còn ghép tiền tại chỗ nữa (bỏ lưới hàng
    // mẫu) — nó chỉ đọc bảng, chèn cột và gửi lệnh sang tab Tendoo.
    for (const ten of ['HDT_GhepTien', 'HDT_DocBang', 'HDT_ChenCot']) {
        assert.ok(cuaSo[ten], `trang báo cáo thiếu ${ten}`);
    }
});

test('nhóm trang đăng nhập Tendoo gắn được bộ đăng nhập', () => {
    const cs = manifest.content_scripts.find(c => c.matches.some(m => m.includes('id-v3')));
    const { cuaSo, loi } = napNhom(cs.js);
    assert.deepStrictEqual(loi, []);
    assert.ok(cuaSo.HDT_DangNhap);
});

test('KHÔNG file nào rò biến ra phạm vi chung ngoài HDT_* đã định', () => {
    const chuan = new Set(Object.getOwnPropertyNames(new JSDOM('').window));
    for (const cs of manifest.content_scripts) {
        const { cuaSo } = napNhom(cs.js);
        const roRi = Object.getOwnPropertyNames(cuaSo)
            .filter(k => !chuan.has(k) && k !== 'crypto')
            .filter(k => !/^HDT_/.test(k));   // CHỈ được xuất ra dưới tiền tố HDT_
        assert.deepStrictEqual(roRi, [],
            `nhóm ${cs.matches[0]} rò biến ra ngoài: ${roRi.join(', ')}`);
    }
});


ghiChu('— ⭐ GIAO DIỆN GỌN: chỉ còn các ô tích —');

/** Có thật sự nhìn thấy được không — xét cả cha ông, vì display:none di truyền. */
function hienRa(cuaSo, el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        const s = cuaSo.getComputedStyle(n);
        if (s.display === 'none' || s.visibility === 'hidden') return false;
    }
    return true;
}

/** Mọi mẩu chữ NGƯỜI DÙNG THẬT SỰ ĐỌC ĐƯỢC trên popup. */
function chuNhinThay(cuaSo) {
    const d = cuaSo.document;
    const ra = [];
    const đi = d.createTreeWalker(d.body, cuaSo.NodeFilter.SHOW_TEXT);
    for (let n = đi.nextNode(); n; n = đi.nextNode()) {
        const chu = n.textContent.replace(/\s+/g, ' ').trim();
        if (!chu) continue;
        if (!hienRa(cuaSo, n.parentElement)) continue;
        ra.push(chu);
    }
    return ra;
}

const NHAN_MONG_DOI = ['Tự bấm Thanh toán', 'Hóa đơn THẬT', 'Bỏ cảnh báo thuế', 'Xóa giỏ lạ'];

test('⭐ popup KHÔNG còn khối chữ nào hiện ra, ngoài nhãn của các ô tích', async () => {
    // Yêu cầu của người dùng: ẩn hết chữ, chỉ còn ô tích. Test này là chỗ duy
    // nhất phát hiện được nếu sau này ai đó thêm một đoạn giải thích mới vào
    // popup mà quên đánh dấu ẩn.
    const { cuaSo } = await moPopup();
    // Bật công tắc để CẢ BỐN ô cùng lộ ra, mới soi được hết nhãn.
    cuaSo.document.getElementById('ctTuBam').click();
    await new Promise(r => setTimeout(r, 30));

    const thua = chuNhinThay(cuaSo).filter(c => !NHAN_MONG_DOI.includes(c));
    assert.deepStrictEqual(thua, [],
        'còn chữ lọt ra ngoài màn popup: ' + JSON.stringify(thua));
});

test('⭐ tiêu đề, phiên bản, khung cảnh báo, 7 bước, ghi chú quyền — ẩn hết', async () => {
    const { cuaSo, tailieu } = await moPopup();
    const phaiAn = [
        ['h1', tailieu.querySelector('h1')],
        ['phienBan', tailieu.getElementById('phienBan')],
        ['khung cảnh báo', tailieu.querySelector('.khung')],
        ['danh sách bước', tailieu.querySelector('.buoc')],
        ['ghi chú quyền', tailieu.querySelector('.ghi-chu')],
        ['khối tài khoản', tailieu.getElementById('chiDuong')],
        ['dòng trạng thái tự bấm', tailieu.getElementById('ctTrangThai')],
        ['dòng trạng thái thuế', tailieu.getElementById('ctBoQuaThueTrangThai')],
        ['dòng trạng thái xóa giỏ', tailieu.getElementById('ctXoaGioTrangThai')],
    ];
    for (const [ten, el] of phaiAn) {
        assert.ok(el, `mất hẳn phần "${ten}" — phải ẩn chứ không được xóa`);
        assert.strictEqual(hienRa(cuaSo, el), false, `"${ten}" vẫn hiện ra`);
    }
    for (const h2 of tailieu.querySelectorAll('h2')) {
        assert.strictEqual(hienRa(cuaSo, h2), false, `tiêu đề mục "${h2.textContent}" vẫn hiện`);
    }
});

test('⭐ MỖI ô tích vẫn có nhãn nhìn thấy được — không ô nào trơ trọi', async () => {
    // Bốn ô này không cùng hạng: ô đầu là phát hành hóa đơn thuế THẬT, không
    // hoàn tác được; ô cuối là xóa cả giỏ hàng người dùng tự chọn. Không nhãn
    // thì chúng trông y hệt nhau, tích nhầm là mất thật.
    const { cuaSo, tailieu } = await moPopup();
    tailieu.getElementById('ctTuBam').click();
    await new Promise(r => setTimeout(r, 30));

    for (const id of ['ctTuBam', 'ctDaHieu', 'ctBoQuaThue', 'ctXoaGioLa']) {
        const o = tailieu.getElementById(id);
        assert.ok(o, `mất ô ${id}`);
        const nhan = o.closest('label');
        assert.ok(nhan, `ô ${id} không nằm trong <label> nào`);
        const chu = [...nhan.querySelectorAll('span')]
            .filter(sp => hienRa(cuaSo, sp))
            .map(sp => sp.textContent.trim()).join(' ').trim();
        assert.ok(chu.length > 0, `ô ${id} không còn nhãn nào nhìn thấy được`);
        assert.ok(chu.length <= 24, `nhãn ô ${id} dài quá, không còn là nhãn ngắn: "${chu}"`);
    }
});

test('⭐ bốn nhãn PHẢI khác nhau — trùng nhau thì vẫn tích nhầm', async () => {
    const { cuaSo, tailieu } = await moPopup();
    tailieu.getElementById('ctTuBam').click();
    await new Promise(r => setTimeout(r, 30));
    const nhan = ['ctTuBam', 'ctDaHieu', 'ctBoQuaThue', 'ctXoaGioLa'].map(id => {
        const l = tailieu.getElementById(id).closest('label');
        return [...l.querySelectorAll('span')].filter(sp => hienRa(cuaSo, sp))
            .map(sp => sp.textContent.trim()).join(' ');
    });
    assert.strictEqual(new Set(nhan).size, 4, 'có nhãn trùng nhau: ' + JSON.stringify(nhan));
});

test('⭐ ẨN chứ KHÔNG XÓA — mọi id popup.js cần vẫn còn nguyên', async () => {
    // Nếu xóa hẳn phần chữ khỏi HTML thì popup.js ghi vào chỗ không tồn tại.
    // Vài chỗ nó có `if (!o) return;` nên sẽ IM LẶNG bỏ qua — hỏng mà không ai
    // biết. Giữ lại phần tử, chỉ ẩn, là cách đổi giao diện không đụng logic.
    const { tailieu } = await moPopup();
    for (const id of ['phienBan', 'ctTrangThai', 'ctBoQuaThueTrangThai',
                      'ctXoaGioTrangThai', 'tomTatKho', 'ctLopHai', 'congTacTuBam']) {
        assert.ok(tailieu.getElementById(id), `xóa mất #${id} — popup.js sẽ ghi vào hư không`);
    }
    // Và popup.js vẫn ghi được vào đó thật (chữ vẫn đúng, chỉ là không hiện).
    assert.match(tailieu.getElementById('ctTrangThai').textContent, /Đang TẮT/);
    assert.match(tailieu.getElementById('phienBan').textContent, /0\.0\.0-test/);
});

test('⭐ popup.js KHÔNG bị sửa để chiều giao diện — chốt hai lớp còn nguyên', async () => {
    const { tailieu, layCaiDat } = await moPopup();
    // Tích ô 1 một mình: vẫn phải là CHƯA bật.
    tailieu.getElementById('ctTuBam').click();
    await new Promise(r => setTimeout(r, 30));
    assert.strictEqual(layCaiDat().daHieu, false, 'một cú tích đã bật được hóa đơn thật');

    // Ô xác nhận vẫn chỉ lộ ra sau khi bật ô 1 — giữ đúng như cũ.
    assert.notStrictEqual(tailieu.getElementById('ctLopHai').style.display, 'none');
    tailieu.getElementById('ctDaHieu').click();
    await new Promise(r => setTimeout(r, 30));
    assert.strictEqual(layCaiDat().daHieu, true);
});

test('⭐ ô xác nhận vẫn ẩn khi CHƯA bật ô trên — không lộ sẵn 4 ô', async () => {
    const { cuaSo, tailieu } = await moPopup();
    assert.strictEqual(hienRa(cuaSo, tailieu.getElementById('ctDaHieu')), false,
        'ô "Hóa đơn THẬT" lộ ra khi chưa bật công tắc');
});

test('⭐ ĐANG BẬT vẫn đổi màu ĐỎ — dấu hiệu duy nhất còn lại không phải chữ', async () => {
    // Đã bỏ hết chữ thì màu nền là thứ duy nhất báo "công tắc nguy hiểm đang
    // bật". Mất nốt nó là không còn cách nào biết.
    const { tailieu, layCaiDat } = await moPopup();
    const khoi = tailieu.getElementById('congTacTuBam');
    assert.ok(!khoi.classList.contains('bat'), 'chưa bật mà đã đỏ');
    tailieu.getElementById('ctTuBam').click();
    await new Promise(r => setTimeout(r, 30));
    tailieu.getElementById('ctDaHieu').click();
    await new Promise(r => setTimeout(r, 30));
    assert.strictEqual(layCaiDat().daHieu, true);
    assert.ok(khoi.classList.contains('bat'), 'bật hóa đơn thật mà khối không đổi màu cảnh báo');

    const html = fs.readFileSync(path.join(GOC, 'popup.html'), 'utf8');
    assert.match(html, /\.hdt-tu-bam\.bat\s*\{[^}]*background/,
        'mất luật tô màu khi bật — không còn dấu hiệu nào ngoài chữ đã ẩn');
});

test('⭐ hiện lại chữ chỉ cần bỏ MỘT dòng CSS', async () => {
    // Đây là lý do chọn ẩn bằng CSS thay vì xóa chữ: đổi ý là lấy lại được ngay,
    // không phải đi chép lại từng đoạn giải thích.
    const html = fs.readFileSync(path.join(GOC, 'popup.html'), 'utf8');
    const luat = html.match(/\.hdt-chu-dai\s*\{[^}]*\}/g) || [];
    assert.strictEqual(luat.length, 1,
        'luật ẩn nằm rải rác nhiều chỗ, bỏ một dòng không hiện lại hết được');
    assert.match(luat[0], /display:\s*none/);
    // Và chữ gốc vẫn còn đủ trong tệp, không bị cắt đi mẩu nào.
    for (const mau of ['MẶC ĐỊNH TẮT', 'không hoàn tác được', 'Chưa thiết lập quản lý thuế',
                       'kể cả khi không phải giỏ của máy', 'Thuật toán ghép tiền']) {
        assert.ok(html.includes(mau), `chữ "${mau}" đã bị xóa khỏi tệp, không hiện lại được`);
    }
});

chay('TÍCH HỢP TRANG POPUP & NHÓM SCRIPT');
