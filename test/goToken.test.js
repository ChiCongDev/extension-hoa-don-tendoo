'use strict';

// ============================================================================
//  GỠ TOKEN — phải có đường gỡ, và gỡ phải gỡ được thật.
//
//  ⚠️ Ô token là loại `password` nên mở lại KHÔNG hiện token cũ, và bấm Lưu với
//  ô trống thì CỐ Ý giữ nguyên token (kẻo mỗi lần lưu là mất). Hệ quả: không có
//  nút gỡ thì token đã lưu là VĨNH VIỄN. Từ bản 2.15.0 token còn là đường chính
//  để đọc doanh thu, nên bật được mà không tắt được là hỏng thật.
//
//  Chạy: node test/goToken.test.js   (cần HDT_JSDOM)
// ============================================================================

const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require(process.env.HDT_JSDOM || 'jsdom');
const { test, ghiChu, chay } = require('./chay');
const KhaiBao = require('../popup/khaiBao');
const Kho = require('../chung/khoMatKhau');
const CaiDat = require('../chung/caiDat');

const GOC = path.join(__dirname, '..');

function taoLuuTru() {
    let noiDung = null;
    return {
        async doc() { return noiDung ? JSON.parse(JSON.stringify(noiDung)) : null; },
        async ghi(o) { noiDung = o ? JSON.parse(JSON.stringify(o)) : null; },
    };
}

/**
 * Dựng màn khai báo với một tiến trình nền GIẢ, nhưng phần gộp cài đặt dùng
 * ĐÚNG HÀM THẬT (CaiDat.gop) — nếu giả luôn phần đó thì test chỉ chứng minh
 * được cái giả của chính mình.
 */
async function dungMan({ sellUrl = 'http://127.0.0.1:8000', sellToken = 'token-cu-abc' } = {}) {
    const dom = new JSDOM('<!doctype html><div id="goc"></div>');
    const goc = dom.window.document.getElementById('goc');

    let caiDat = CaiDat.gop(null, { sellUrl, sellToken });
    const daGui = [];
    const guiNen = async (tin) => {
        daGui.push(tin);
        if (tin.loai === 'hdt-hoi-cai-dat') return caiDat;
        if (tin.loai === 'hdt-dat-cai-dat') {
            caiDat = CaiDat.gop(caiDat, tin);
            return { ok: true, ...caiDat };
        }
        if (tin.loai === 'hdt-so-cho-gui-sell') return { soCho: 0 };
        return { ok: true };
    };

    const mh = KhaiBao.gan(goc, { Kho, luuTru: taoLuuTru(), guiNen });
    await mh.nap();
    return { goc, mh, daGui, layCaiDat: () => caiDat };
}

const co = (goc, id) => !!goc.querySelector('#' + id);

ghiChu('— ⭐ Có đường gỡ, và chỉ hiện khi đang có token —');

test('⭐ đang có token → hiện nút "Gỡ token"', async () => {
    const { goc } = await dungMan();
    assert.ok(co(goc, 'kbGoToken'), 'không có nút gỡ token — token đã lưu là vĩnh viễn');
});

test('⭐ CHƯA có token → KHÔNG hiện nút gỡ (không có gì để gỡ)', async () => {
    const { goc } = await dungMan({ sellToken: '' });
    assert.ok(!co(goc, 'kbGoToken'));
});

test('nút gỡ nằm cạnh nút Lưu và Thử kết nối, trong cùng khối', async () => {
    const { goc } = await dungMan();
    const khoi = goc.querySelector('#kbGuiSell');
    assert.ok(khoi.querySelector('#kbLuuSell'));
    assert.ok(khoi.querySelector('#kbThuKetNoi'));
    assert.ok(khoi.querySelector('#kbGoToken'));
});

ghiChu('— ⭐ Hỏi xác nhận trước, nói rõ mất gì —');

test('⭐ bấm "Gỡ token" chỉ HỎI, chưa gỡ gì cả', async () => {
    const { goc, mh, layCaiDat } = await dungMan();
    goc.querySelector('#kbGoToken').onclick();
    await new Promise(r => setTimeout(r, 0));
    assert.strictEqual(mh.choGoToken(), true);
    assert.strictEqual(layCaiDat().sellToken, 'token-cu-abc', 'đã gỡ khi mới chỉ bấm hỏi');
});

test('⭐ câu hỏi nói RÕ hậu quả, không hỏi chung chung', async () => {
    const { goc, mh } = await dungMan();
    goc.querySelector('#kbGoToken').onclick();
    await new Promise(r => setTimeout(r, 0));
    const chu = mh.veLai().querySelector('#kbXacNhanGoToken').textContent;
    assert.match(chu, /chưa đăng nhập/);
    assert.match(chu, /trang báo cáo/);
    assert.match(chu, /Địa chỉ bongtom\.store vẫn giữ/);
});

test('⭐ bấm Hủy → KHÔNG mất gì, quay về như cũ', async () => {
    const { goc, mh, layCaiDat } = await dungMan();
    goc.querySelector('#kbGoToken').onclick();
    await new Promise(r => setTimeout(r, 0));
    let man = mh.veLai();
    man.querySelector('#kbGoTokenHuy').onclick();
    await new Promise(r => setTimeout(r, 0));
    man = mh.veLai();
    assert.strictEqual(layCaiDat().sellToken, 'token-cu-abc', 'hủy mà vẫn gỡ mất');
    assert.strictEqual(mh.choGoToken(), false);
    assert.ok(!man.querySelector('#kbXacNhanGoToken'), 'câu hỏi vẫn còn treo');
    assert.ok(man.querySelector('#kbGoToken'), 'mất luôn nút gỡ');
});

ghiChu('— ⭐ Gỡ thật thì kho phải RỖNG token —');

test('⭐ xác nhận gỡ → kho không còn token', async () => {
    const { goc, mh, layCaiDat, daGui } = await dungMan();
    goc.querySelector('#kbGoToken').onclick();
    await new Promise(r => setTimeout(r, 0));
    mh.veLai().querySelector('#kbGoTokenXacNhan').onclick();
    await new Promise(r => setTimeout(r, 0));

    assert.strictEqual(layCaiDat().sellToken, '', 'token vẫn còn trong kho');
    // Phải gửi CHUỖI RỖNG tường minh, không thì gop() bỏ qua và token còn nguyên.
    const g = daGui.filter(t => t.loai === 'hdt-dat-cai-dat').pop();
    assert.ok('sellToken' in g, 'không gửi khóa sellToken -> kho sẽ giữ nguyên token cũ');
    assert.strictEqual(g.sellToken, '');
});

test('⭐ GIỮ LẠI địa chỉ Sell — không phải bí mật, xoá luôn là bắt gõ lại cả hai', async () => {
    const { goc, mh, layCaiDat, daGui } = await dungMan();
    goc.querySelector('#kbGoToken').onclick();
    await new Promise(r => setTimeout(r, 0));
    mh.veLai().querySelector('#kbGoTokenXacNhan').onclick();
    await new Promise(r => setTimeout(r, 0));

    assert.strictEqual(layCaiDat().sellUrl, 'http://127.0.0.1:8000');
    const g = daGui.filter(t => t.loai === 'hdt-dat-cai-dat').pop();
    assert.ok(!('sellUrl' in g), 'gửi kèm sellUrl là có ngày xoá nhầm địa chỉ');
});

test('⭐ gỡ xong thì nút gỡ BIẾN MẤT, và màn báo đúng tình trạng mới', async () => {
    const { goc, mh } = await dungMan();
    goc.querySelector('#kbGoToken').onclick();
    await new Promise(r => setTimeout(r, 0));
    mh.veLai().querySelector('#kbGoTokenXacNhan').onclick();
    await new Promise(r => setTimeout(r, 0));
    const man = mh.veLai();

    assert.ok(!man.querySelector('#kbGoToken'), 'gỡ rồi mà vẫn còn nút gỡ');
    assert.ok(!man.querySelector('#kbXacNhanGoToken'));
    assert.match(man.querySelector('#kbSellBao').textContent, /Đã gỡ token/);
    assert.match(man.querySelector('#kbSellTrangThai').textContent, /CHƯA ĐIỀN ĐỊA CHỈ|Chưa nối/);
});

ghiChu('— ⭐ Nút LƯU vẫn KHÔNG được biến thành nút xoá —');

test('⭐ bấm Lưu với ô token TRỐNG → token cũ còn nguyên', async () => {
    // Đây là lý do phải có nút gỡ riêng. Nếu ô trống mà cũng xoá thì mỗi lần
    // sửa địa chỉ là mất token, vì ô password không hiện lại giá trị cũ.
    const { goc, mh, layCaiDat } = await dungMan();
    goc.querySelector('#kbSellToken').value = '';
    goc.querySelector('#kbSellUrl').value = 'http://127.0.0.1:8000';
    goc.querySelector('#kbLuuSell').onclick();
    await new Promise(r => setTimeout(r, 0));
    assert.strictEqual(layCaiDat().sellToken, 'token-cu-abc', 'bấm Lưu đã làm mất token');
    assert.ok(mh.veLai().querySelector('#kbGoToken'), 'mất luôn nút gỡ');
});

test('bấm Lưu với token MỚI → đổi được như cũ', async () => {
    const { goc, layCaiDat } = await dungMan();
    goc.querySelector('#kbSellToken').value = 'token-moi-xyz';
    goc.querySelector('#kbLuuSell').onclick();
    await new Promise(r => setTimeout(r, 0));
    assert.strictEqual(layCaiDat().sellToken, 'token-moi-xyz');
});

test('⭐ gỡ token rồi xoá địa chỉ → về trắng hoàn toàn, không kẹt', async () => {
    // Nhánh "đã xoá hết" trước đây là MÃ CHẾT: xoá địa chỉ thì token vẫn còn nên
    // không bao giờ chạy tới. Có nút gỡ rồi thì nhánh ấy mới sống.
    const { goc, mh, layCaiDat } = await dungMan();
    goc.querySelector('#kbGoToken').onclick();
    await new Promise(r => setTimeout(r, 0));
    mh.veLai().querySelector('#kbGoTokenXacNhan').onclick();
    await new Promise(r => setTimeout(r, 0));

    const man = mh.veLai();
    man.querySelector('#kbSellUrl').value = '';
    man.querySelector('#kbLuuSell').onclick();
    await new Promise(r => setTimeout(r, 0));

    assert.strictEqual(layCaiDat().sellUrl, '');
    assert.strictEqual(layCaiDat().sellToken, '');
    assert.match(mh.veLai().querySelector('#kbSellBao').textContent, /Đã xoá lối phụ|Đã gỡ/);
});

ghiChu('— ⭐ Mở lại màn thì không còn câu hỏi treo —');

test('⭐ đang hỏi mà nạp lại màn → bỏ câu hỏi, không tự gỡ', async () => {
    const { goc, mh, layCaiDat } = await dungMan();
    goc.querySelector('#kbGoToken').onclick();
    await new Promise(r => setTimeout(r, 0));
    assert.strictEqual(mh.choGoToken(), true);

    const man = await mh.nap();
    assert.strictEqual(mh.choGoToken(), false, 'câu hỏi còn treo sau khi mở lại');
    assert.ok(!man.querySelector('#kbXacNhanGoToken'));
    assert.strictEqual(layCaiDat().sellToken, 'token-cu-abc', 'nạp lại mà tự gỡ mất token');
});

ghiChu('— ⭐ Chữ trên màn phải ĐÚNG với bản 2.15.0 —');

test('⭐ nói rõ token giúp chạy được khi CHƯA ĐĂNG NHẬP', async () => {
    // Trước 2.15.0 token chỉ là lối phụ để ghi. Nay nó là đường chính để ĐỌC
    // doanh thu. Để nguyên câu cũ là nói dối ngay trên màn hình.
    const { goc } = await dungMan();
    const chu = goc.querySelector('#kbGuiSell').textContent;
    assert.match(chu, /ĐỌC DOANH THU/);
    assert.match(chu, /CHƯA ĐĂNG NHẬP|đăng xuất/);
});

test('⭐ KHÔNG còn gọi token là "lối phụ" ở phần mô tả', async () => {
    const { goc } = await dungMan();
    const moTa = [...goc.querySelectorAll('#kbGuiSell .hdt-dan')]
        .slice(0, 3).map(o => o.textContent).join(' ');
    assert.ok(!/chỉ là lối phụ/.test(moTa), 'vẫn nói token chỉ là lối phụ');
});

test('đang có token: dòng trạng thái nói máy chạy được khi chưa đăng nhập', async () => {
    const { goc } = await dungMan();
    const tt = goc.querySelector('#kbSellTrangThai').textContent;
    assert.match(tt, /chưa đăng nhập/);
});

test('chưa khai gì: dòng trạng thái nói PHẢI còn đăng nhập', async () => {
    const { goc } = await dungMan({ sellUrl: '', sellToken: '' });
    const tt = goc.querySelector('#kbSellTrangThai').textContent;
    assert.match(tt, /PHẢI còn đăng nhập/);
});

ghiChu('— ⭐ Không rò token ra ngoài —');

test('⭐ token KHÔNG bị in ra chỗ nào trên màn hình', async () => {
    const { goc, mh } = await dungMan();
    goc.querySelector('#kbGoToken').onclick();
    await new Promise(r => setTimeout(r, 0));
    const man = mh.veLai();
    assert.ok(!man.textContent.includes('token-cu-abc'), 'token bị in thẳng ra màn hình');
    // Kể cả sau khi gỡ, thông báo cũng không được nhắc lại giá trị token.
    man.querySelector('#kbGoTokenXacNhan').onclick();
    await new Promise(r => setTimeout(r, 0));
    assert.ok(!mh.veLai().textContent.includes('token-cu-abc'));
});

test('ô token vẫn là loại password', async () => {
    const { goc } = await dungMan();
    assert.strictEqual(goc.querySelector('#kbSellToken').type, 'password');
});

test('⭐ mã nguồn KHÔNG ghi token ra log', () => {
    const ma = fs.readFileSync(path.join(GOC, 'popup', 'khaiBao.js'), 'utf8');
    const than = ma.slice(ma.indexOf('async function goToken'), ma.indexOf('async function luuNoiGui'));
    assert.ok(!/console\.|sellToken\s*\+/.test(than), 'có chỗ in token ra');
});

chay('GỠ TOKEN — bật được thì phải tắt được');
