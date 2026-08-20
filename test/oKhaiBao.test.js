'use strict';

// ============================================================================
//  TEST Ô KHAI BÁO TRÊN TRANG SELL
//
//  Hai thứ phải giữ bằng mọi giá:
//    1. Ô nhập phải nằm trong IFRAME của extension, KHÔNG cắm thẳng vào trang.
//       Cắm thẳng là mọi script của trang Sell đọc được mật khẩu.
//    2. Trang Sell chỉ được biết "đã khai báo chưa / đã mở khóa chưa". Không
//       tên đăng nhập, không mã cửa hàng, không mật khẩu.
// ============================================================================

const assert = require('node:assert');
const { JSDOM } = require(process.env.HDT_JSDOM || 'jsdom');
const { test, ghiChu, chay } = require('./chay');

globalThis.__HDT_KHONG_TU_CHAY__ = true;
const OKhaiBao = require('../sell/oKhaiBao');

function dung({ tinhTrang = null, loi = false } = {}) {
    const dom = new JSDOM('<!doctype html><body><div id="the"><table id="b"></table></div></body>');
    const tailieu = dom.window.document;
    const daHoi = [];
    const o = OKhaiBao.taoOKhaiBao({
        tailieu,
        diaChiTrang: OKhaiBao.taoDiaChiTrang({
            runtime: { getURL: (t) => 'chrome-extension://abcxyz/' + t },
        }),
        guiNen: async (tin) => {
            daHoi.push(tin);
            if (loi) throw new Error('không có tiến trình nền');
            return tinhTrang;
        },
    });
    return { dom, tailieu, o, daHoi, the: tailieu.getElementById('the') };
}

const TT = (khach, dangMo = true) => ({ coKho: true, dangMo, khach });

ghiChu('— Dấu hiệu trên từng dòng —');

test('chưa khai báo → nút XÁM, nói rõ là chưa khai báo', async () => {
    const { o } = dung({ tinhTrang: TT({}) });
    await o.docTinhTrang();
    const nut = o.taoNut('PA', 'Phương Anh');
    assert.strictEqual(nut.dataset.hdtMuc, 'chua');
    assert.match(nut.className, /chua/);
    assert.match(nut.title, /CHƯA khai báo/);
});

test('đã khai báo + kho mở → nút XANH', async () => {
    const { o } = dung({ tinhTrang: TT({ PA: { daKhaiBao: true, daMoKhoa: true } }) });
    await o.docTinhTrang();
    assert.strictEqual(o.taoNut('PA').dataset.hdtMuc, 'xong');
});

test('khai báo từ BẢN CŨ chưa chuyển đổi → nút VÀNG, bảo đi chuyển đổi', async () => {
    // Từ 2026-08-12 không còn khóa mở. Mức "khóa" chỉ còn đúng một nghĩa:
    // kho bản 1 cũ chưa được chuyển sang kho không khóa.
    const { o } = dung({ tinhTrang: TT({ PA: { daKhaiBao: true, daMoKhoa: false } }, false) });
    await o.docTinhTrang();
    const nut = o.taoNut('PA');
    assert.strictEqual(nut.dataset.hdtMuc, 'khoa');
    assert.match(nut.title, /chuyển đổi/);
});

test('không có tiến trình nền → coi như CHƯA khai báo, KHÔNG nổ', async () => {
    const { o } = dung({ loi: true });
    await o.docTinhTrang();
    assert.strictEqual(o.taoNut('PA').dataset.hdtMuc, 'chua');
});

test('khai báo xong → nút tự đổi màu, không bắt tải lại trang', async () => {
    let tt = TT({});
    const dom = new JSDOM('<!doctype html><body><div id="the"></div></body>');
    const o = OKhaiBao.taoOKhaiBao({
        tailieu: dom.window.document,
        diaChiTrang: OKhaiBao.taoDiaChiTrang(null),
        guiNen: async () => tt,
    });
    await o.docTinhTrang();
    const nut = o.taoNut('PA');
    dom.window.document.getElementById('the').appendChild(nut);
    assert.strictEqual(nut.dataset.hdtMuc, 'chua');

    tt = TT({ PA: { daKhaiBao: true, daMoKhoa: true } });
    await o.lamMoi();
    assert.strictEqual(nut.dataset.hdtMuc, 'xong', 'không tô lại sau khi khai báo xong');
});

test('dòng đã bị Sell vẽ lại → quên nút cũ đi, không giữ rác', async () => {
    const { o, the } = dung({ tinhTrang: TT({}) });
    await o.docTinhTrang();
    the.appendChild(o.taoNut('PA'));
    o.taoNut('TB');                      // nút này không gắn vào đâu cả
    assert.strictEqual(o.soNut(), 2);
    o.toLaiTatCa();
    assert.strictEqual(o.soNut(), 1, 'giữ lại nút đã rời khỏi trang');
});

ghiChu('— Khung khai báo phải là IFRAME của extension —');

test('⭐ ô nhập nằm trong IFRAME, KHÔNG cắm thẳng vào trang Sell', async () => {
    const { o, tailieu } = dung({ tinhTrang: TT({}) });
    o.mo('PA', 'Phương Anh');
    const khung = tailieu.getElementById(OKhaiBao.ID_KHUNG);
    assert.ok(khung, 'không mở được khung');
    const iframe = khung.querySelector('iframe');
    assert.ok(iframe, '❌ KHÔNG có iframe — ô nhập mật khẩu bị cắm thẳng vào trang Sell');
    assert.strictEqual(khung.querySelectorAll('input').length, 0,
        '❌ có ô <input> nằm ngoài iframe — trang Sell đọc được chữ người dùng gõ');
});

test('⭐ iframe trỏ vào chrome-extension://, KHÔNG trỏ vào máy chủ nào', async () => {
    const { o, tailieu } = dung({ tinhTrang: TT({}) });
    o.mo('PA');
    const src = tailieu.querySelector('iframe').src;
    assert.match(src, /^chrome-extension:\/\//, 'iframe không thuộc extension: ' + src);
    assert.ok(!/^https?:/.test(src), 'iframe trỏ ra ngoài internet');
    assert.match(src, /khaiBao\.html/);
});

test('mở từ dòng khách → mã khách đi kèm để điền sẵn', async () => {
    const { o, tailieu } = dung({ tinhTrang: TT({}) });
    o.mo('KH2607160003', 'kiên');
    const src = tailieu.querySelector('iframe').src;
    assert.match(src, /maKH=KH2607160003/);
    assert.match(src, /ten=ki/);
});

test('mở từ thanh nhắc (không kèm khách) → không đính tham số rỗng', async () => {
    const { o, tailieu } = dung({ tinhTrang: TT({}) });
    o.mo('');
    assert.ok(!tailieu.querySelector('iframe').src.includes('?'),
        'đính tham số rỗng vào đường dẫn');
});

test('mở hai lần → chỉ một khung, không chồng lên nhau', async () => {
    const { o, tailieu } = dung({ tinhTrang: TT({}) });
    o.mo('PA'); o.mo('TB');
    assert.strictEqual(tailieu.querySelectorAll('iframe').length, 1);
});

test('bấm ✕ → khung biến mất hẳn', async () => {
    const { o, tailieu } = dung({ tinhTrang: TT({}) });
    o.mo('PA');
    tailieu.querySelector('.hdt-kb-dau button').click();
    assert.strictEqual(tailieu.getElementById(OKhaiBao.ID_KHUNG), null);
});

test('bấm nút chìa khóa trên dòng → mở đúng khách đó', async () => {
    const { o, tailieu, the } = dung({ tinhTrang: TT({}) });
    await o.docTinhTrang();
    the.appendChild(o.taoNut('PA', 'Phương Anh'));
    the.querySelector('button[data-hdt-khai-bao="PA"]').click();
    assert.match(tailieu.querySelector('iframe').src, /maKH=PA/);
});

ghiChu('— Lối thoát khi trang chặn nhúng —');

test('⭐ khung im lặng quá lâu → chỉ đường mở trang khai báo ở tab riêng', async () => {
    // Nếu trang Sell chặn iframe bằng CSP thì khung trắng trơn. Popup đã bỏ hết
    // ô nhập, nên không có lối thoát là người dùng KẸT HẲN, không khai báo được.
    const { o, tailieu } = dung({ tinhTrang: TT({}) });
    o.mo('PA', 'Phương Anh');
    assert.strictEqual(tailieu.getElementById('hdt-kb-loi-thoat'), null, 'bày lối thoát quá sớm');

    await new Promise(r => setTimeout(r, OKhaiBao.HAN_CHO_KHUNG_MS + 120));
    const loi = tailieu.getElementById('hdt-kb-loi-thoat');
    assert.ok(loi, '❌ khung chết mà không có lối thoát nào — người dùng kẹt hẳn');
    const a = tailieu.getElementById('hdt-kb-mo-tab');
    assert.match(a.href, /^chrome-extension:\/\/.*khaiBao\.html/);
    assert.match(a.href, /maKH=PA/, 'lối thoát quên mang mã khách theo');
    assert.strictEqual(a.target, '_blank');
});

test('khung sống bình thường → KHÔNG bày lối thoát ra làm rối', async () => {
    const { o, tailieu, dom } = dung({ tinhTrang: TT({}) });
    o.mo('PA');
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { hdt: 'khai-bao-doi' } }));
    await new Promise(r => setTimeout(r, OKhaiBao.HAN_CHO_KHUNG_MS + 120));
    assert.strictEqual(tailieu.getElementById('hdt-kb-loi-thoat'), null,
        'khung sống mà vẫn báo là chặn — nói sai với người dùng');
});

test('đóng khung trước khi hết hạn → không bày lối thoát vào chỗ trống', async () => {
    const { o, tailieu } = dung({ tinhTrang: TT({}) });
    o.mo('PA');
    o.dong();
    await new Promise(r => setTimeout(r, OKhaiBao.HAN_CHO_KHUNG_MS + 120));
    assert.strictEqual(tailieu.getElementById(OKhaiBao.ID_KHUNG), null);
    assert.strictEqual(tailieu.getElementById('hdt-kb-loi-thoat'), null);
});

ghiChu('— Thanh nhắc mở khóa —');

test('chưa có kho → nhắc khai báo', async () => {
    const { o, the, tailieu } = dung({ tinhTrang: { coKho: false, dangMo: false, khach: {} } });
    await o.lamMoi(the);
    const thanh = tailieu.getElementById(OKhaiBao.ID_THANH_KHOA);
    assert.ok(thanh, 'không hiện thanh nhắc');
    assert.match(thanh.textContent, /Chưa khai báo/);
});

test('kho BẢN CŨ → nhắc chuyển đổi một lần, kèm số khách', async () => {
    const { o, the, tailieu } = dung({
        tinhTrang: TT({ PA: { daKhaiBao: true, daMoKhoa: false },
                        TB: { daKhaiBao: true, daMoKhoa: false } }, false),
    });
    await o.lamMoi(the);
    const thanh = tailieu.getElementById(OKhaiBao.ID_THANH_KHOA);
    assert.match(thanh.textContent, /chuyển đổi MỘT LẦN/);
    assert.match(thanh.textContent, /2 khách/);
});

test('kho đã mở → KHÔNG nhắc nữa, đỡ rối mắt', async () => {
    const { o, the, tailieu } = dung({ tinhTrang: TT({ PA: { daKhaiBao: true, daMoKhoa: true } }) });
    await o.lamMoi(the);
    assert.strictEqual(tailieu.getElementById(OKhaiBao.ID_THANH_KHOA), null);
});

test('vẽ lại nhiều lần → chỉ một thanh, không xếp chồng', async () => {
    const { o, the, tailieu } = dung({ tinhTrang: TT({}, false) });
    await o.lamMoi(the); await o.lamMoi(the); await o.lamMoi(the);
    assert.strictEqual(tailieu.querySelectorAll('.hdt-thanh-khoa').length, 1);
});

test('bấm nút trên thanh nhắc → mở khung khai báo', async () => {
    const { o, the, tailieu } = dung({ tinhTrang: TT({ PA: { daKhaiBao: true, daMoKhoa: false } }, false) });
    await o.lamMoi(the);
    tailieu.getElementById('hdt-nut-mo-kho').click();
    assert.ok(tailieu.querySelector('iframe'), 'không mở được khung từ thanh nhắc');
});

ghiChu('— Nghe tin từ khung con —');

test('khung con báo "đã đổi" → đọc lại tình trạng và tô lại', async () => {
    let tt = TT({});
    const dom = new JSDOM('<!doctype html><body><div id="the"></div></body>');
    const tailieu = dom.window.document;
    const o = OKhaiBao.taoOKhaiBao({
        tailieu, diaChiTrang: OKhaiBao.taoDiaChiTrang(null), guiNen: async () => tt,
    });
    await o.docTinhTrang();
    const nut = o.taoNut('PA');
    tailieu.getElementById('the').appendChild(nut);
    o.nghe(tailieu.getElementById('the'));

    tt = TT({ PA: { daKhaiBao: true, daMoKhoa: true } });
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { hdt: 'khai-bao-doi' } }));
    for (let i = 0; i < 40 && nut.dataset.hdtMuc !== 'xong'; i++) await new Promise(r => setTimeout(r, 10));
    assert.strictEqual(nut.dataset.hdtMuc, 'xong');
});

test('⭐ tin lạ từ trang khác → BỎ QUA, không hỏi han gì', async () => {
    // Bất kỳ trang nào cũng bắn postMessage được. Nghe bừa là mở đường cho
    // trang lạ điều khiển giao diện của mình.
    const { o, the, dom, daHoi } = dung({ tinhTrang: TT({}) });
    o.nghe(the);
    const truoc = daHoi.length;
    for (const d of [null, 'chuoi', 42, { hdt: 'linh-tinh' }, { loai: 'khai-bao-doi' }, {}]) {
        dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: d }));
    }
    await new Promise(r => setTimeout(r, 30));
    assert.strictEqual(daHoi.length, truoc, 'nghe cả tin lạ');
});

test('thôi nghe → không phản ứng nữa', async () => {
    const { o, the, dom, daHoi } = dung({ tinhTrang: TT({}) });
    o.nghe(the);
    o.thoi();
    const truoc = daHoi.length;
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { hdt: 'khai-bao-doi' } }));
    await new Promise(r => setTimeout(r, 30));
    assert.strictEqual(daHoi.length, truoc);
});

ghiChu('— Ranh giới dữ liệu —');

test('⭐ chỉ hỏi tiến trình nền ĐÚNG MỘT loại tin, không đòi thêm gì', async () => {
    const { o, the, daHoi } = dung({ tinhTrang: TT({}) });
    await o.lamMoi(the);
    assert.deepStrictEqual([...new Set(daHoi.map(t => t.loai))], ['hdt-tinh-trang-kho']);
});

test('⭐ mã nguồn KHÔNG đụng tới mật khẩu, tên đăng nhập hay khóa mở', () => {
    const ma = require('fs').readFileSync(require('path').join(__dirname, '..', 'sell/oKhaiBao.js'), 'utf8');
    // Bỏ phần chú thích: ở đó có nhắc các chữ này để giải thích, không phải mã chạy.
    const than = ma.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const cam of ['matKhau', 'tenDangNhap', 'khoaMo', 'maCuaHang']) {
        assert.ok(!than.includes(cam),
            `❌ oKhaiBao.js đụng tới "${cam}" — dữ liệu này không được xuống trang Sell`);
    }
});

test('khung nói cho người dùng biết vì sao an toàn', async () => {
    const { o, tailieu } = dung({ tinhTrang: TT({}) });
    o.mo('PA');
    const chu = tailieu.getElementById(OKhaiBao.ID_KHUNG).textContent;
    assert.match(chu, /trang bongtom\.store không đọc được/i);
    assert.match(chu, /không gửi lên máy chủ bongtom\.store/i);
});

chay('Ô KHAI BÁO TRÊN TRANG SELL');
