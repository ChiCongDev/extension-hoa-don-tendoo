'use strict';

// ============================================================================
//  ĐỌC DOANH THU BẰNG TOKEN — chạy được cả khi KHÔNG đăng nhập Sell.
//
//  Chạy: node test/docBangToken.test.js
// ============================================================================

const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { test, ghiChu, chay } = require('./chay');

const GOC = path.join(__dirname, '..');
const doc = (t) => fs.readFileSync(path.join(GOC, t), 'utf8');

const DT = require('../chung/docBangToken');

const CAI_DAT = { sellUrl: 'https://bongtom.store', sellToken: 'chia-khoa-abc' };

/** Một khách như Sell trả về. */
const khach = (ma, ten, tien, id) => ({
    khach_hang_id: id, ten_khach_hang: ten, ma_khach_hang: ma,
    so_don_hang: 1, doanh_thu: tien, gia_von: 0, loi_nhuan: tien, ty_le: 100,
});

/** Dựng fetch giả trả về nhiều trang. */
function taoFetch(cacTrang, { status = 200, nemLoi = false, traRac = false } = {}) {
    const daGoi = [];
    const f = async (url, tuyChon) => {
        daGoi.push({ url: String(url), tuyChon });
        if (nemLoi) throw new Error('mất mạng');
        if (status !== 200) return { ok: false, status };
        if (traRac) return { ok: true, status: 200, json: async () => { throw new Error('không phải JSON'); } };
        const m = /trang=(\d+)/.exec(String(url));
        const i = m ? Number(m[1]) - 1 : 0;
        const ds = cacTrang[i] || [];
        return {
            ok: true, status: 200,
            json: async () => ({
                thanh_cong: true,
                du_lieu: ds,
                tong_hop: { tong_doanh_thu: 0 },
                phan_trang: { trang_hien_tai: i + 1, so_ban_ghi: 100,
                              tong_ban_ghi: cacTrang.flat().length, tong_trang: cacTrang.length },
                thoi_gian: { tu_ngay: '14/08/2026', den_ngay: '14/08/2026', loai: 'hom_nay' },
            }),
        };
    };
    f.daGoi = daGoi;
    return f;
}

ghiChu('— ⭐ Đọc được số, đổi đúng hình máy đang dùng —');

test('⭐ đọc được và trả về đúng hình {maKH, tenKH, doanhThu, khachHangId}', async () => {
    const f = taoFetch([[khach('KH01', 'cường', 10444442, 1), khach('KH02', 'hoa', 1671765, 3)]]);
    const kq = await DT.docBangQuaToken(CAI_DAT, f);
    assert.strictEqual(kq.ok, true);
    assert.deepStrictEqual(kq.dong, [
        { maKH: 'KH01', tenKH: 'cường', doanhThu: 10444442, khachHangId: 1 },
        { maKH: 'KH02', tenKH: 'hoa', doanhThu: 1671765, khachHangId: 3 },
    ]);
});

test('⭐ gửi kèm TOKEN, và hỏi đúng "hôm nay"', async () => {
    const f = taoFetch([[khach('KH01', 'a', 1, 1)]]);
    await DT.docBangQuaToken(CAI_DAT, f);
    const g = f.daGoi[0];
    assert.match(g.url, /^https:\/\/bongtom\.store\/api\/extension\/bao-cao-khach-hang\?/);
    assert.match(g.url, /loai=hom_nay/);
    assert.strictEqual(g.tuyChon.headers.Authorization, 'Bearer chia-khoa-abc');
});

test('⭐ KHÔNG tự tính ngày bằng JavaScript — để máy chủ chốt theo giờ VN', () => {
    // Máy người dùng có thể lệch múi giờ; gần nửa đêm là lấy nhầm ngày rồi xuất
    // hóa đơn cho ngày hôm trước.
    const ma = doc('chung/docBangToken.js');
    assert.ok(!/getMonth|getDate\(\)|toISOString|new Date\(/.test(ma),
        'có chỗ tự tính ngày trong docBangToken.js');
    assert.match(ma, /loai=hom_nay/);
});

test('⭐ KHÔNG gửi loai_don — phải khớp mặc định "mọi loại đơn" của trang báo cáo', () => {
    const ma = doc('chung/docBangToken.js');
    assert.ok(!/loai_don=/.test(ma), 'gửi loai_don thì số lệch với trang báo cáo');
});

test('địa chỉ có dấu / thừa ở cuối vẫn ghép đúng', async () => {
    const f = taoFetch([[khach('KH01', 'a', 1, 1)]]);
    await DT.docBangQuaToken({ ...CAI_DAT, sellUrl: 'https://bongtom.store///' }, f);
    assert.match(f.daGoi[0].url, /^https:\/\/bongtom\.store\/api\/extension\//);
});

ghiChu('— ⭐ Lọc y hệt luật của đọc bảng —');

test('⭐ bỏ khách doanh thu 0 và âm, y như docBang.js', async () => {
    const f = taoFetch([[khach('A', 'a', 0, 1), khach('B', 'b', -5, 2), khach('C', 'c', 7, 3)]]);
    const kq = await DT.docBangQuaToken(CAI_DAT, f);
    assert.deepStrictEqual(kq.dong.map(k => k.maKH), ['C']);
});

test('⭐ bỏ khách thiếu mã hoặc thiếu id — không thì máy chạy cho một khách vô danh', async () => {
    const f = taoFetch([[khach('', 'a', 9, 1), khach('B', 'b', 9, 0), khach('C', 'c', 9, 3)]]);
    const kq = await DT.docBangQuaToken(CAI_DAT, f);
    assert.deepStrictEqual(kq.dong.map(k => k.maKH), ['C']);
});

test('doanh thu lẻ được làm tròn về số nguyên đồng', async () => {
    const f = taoFetch([[khach('A', 'a', 1234.6, 1)]]);
    const kq = await DT.docBangQuaToken(CAI_DAT, f);
    assert.strictEqual(kq.dong[0].doanhThu, 1235);
});

ghiChu('— ⭐ Nhiều trang: KHÔNG được bỏ sót khách —');

test('⭐ lấy đủ cả 3 trang, không sót ai', async () => {
    const f = taoFetch([
        [khach('A', 'a', 1, 1), khach('B', 'b', 2, 2)],
        [khach('C', 'c', 3, 3)],
        [khach('D', 'd', 4, 4)],
    ]);
    const kq = await DT.docBangQuaToken(CAI_DAT, f);
    assert.deepStrictEqual(kq.dong.map(k => k.maKH), ['A', 'B', 'C', 'D']);
    assert.strictEqual(f.daGoi.length, 3, 'phải gọi đúng 3 trang');
});

test('một trang thì DỪNG NGAY, không gọi thừa', async () => {
    const f = taoFetch([[khach('A', 'a', 1, 1)]]);
    await DT.docBangQuaToken(CAI_DAT, f);
    assert.strictEqual(f.daGoi.length, 1);
});

test('⭐ Sell trả phân trang hỏng → KHÔNG lặp vô tận', async () => {
    let goi = 0;
    const f = async () => {
        goi++;
        return { ok: true, status: 200, json: async () => ({
            thanh_cong: true, du_lieu: [],
            phan_trang: { tong_trang: 999999 },      // luôn bảo còn trang
            thoi_gian: { tu_ngay: '14/08/2026', den_ngay: '14/08/2026' },
        }) };
    };
    await DT.docBangQuaToken(CAI_DAT, f);
    assert.ok(goi <= DT.TRAN_TRANG, `gọi ${goi} lần, vượt trần ${DT.TRAN_TRANG}`);
});

ghiChu('— ⭐ Hỏng thì DỪNG, tuyệt đối không đoán bừa là "hôm nay không ai bán được gì" —');

test('⭐ 403 → nói rõ SAI TOKEN, và KHÔNG trả danh sách rỗng', async () => {
    const kq = await DT.docBangQuaToken(CAI_DAT, taoFetch([], { status: 403 }));
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ma, 'SAI_TOKEN');
    assert.match(kq.thongBao, /EXTENSION_HOA_DON_TOKEN/);
    assert.match(kq.thongBao, /không tạo hóa đơn nào/);
    assert.strictEqual(kq.dong, undefined, 'trả danh sách rỗng là máy tưởng hôm nay im ắng');
});

test('404 → nói rõ SAI ĐỊA CHỈ', async () => {
    const kq = await DT.docBangQuaToken(CAI_DAT, taoFetch([], { status: 404 }));
    assert.strictEqual(kq.ma, 'SAI_DIA_CHI');
});

test('500 → dừng, không đọc số', async () => {
    const kq = await DT.docBangQuaToken(CAI_DAT, taoFetch([], { status: 500 }));
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ma, 'SELL_LOI');
});

test('mất mạng → dừng, không nổ', async () => {
    const kq = await DT.docBangQuaToken(CAI_DAT, taoFetch([], { nemLoi: true }));
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ma, 'KHONG_GOI_DUOC');
});

test('⭐ Sell trả về TRANG ĐĂNG NHẬP thay vì JSON → dừng', async () => {
    // Đăng xuất giữa chừng thì Sell chuyển hướng về màn đăng nhập. Không bắt
    // được chỗ này là máy tưởng "hôm nay không ai có doanh thu" rồi bỏ cả lượt.
    const kq = await DT.docBangQuaToken(CAI_DAT, taoFetch([], { traRac: true }));
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ma, 'TRA_VE_LA');
    assert.match(kq.thongBao, /không tạo hóa đơn nào/);
});

test('⭐ thanh_cong = false → dừng, không lấy du_lieu', async () => {
    const f = async () => ({ ok: true, status: 200,
        json: async () => ({ thanh_cong: false, thong_bao: 'Lỗi gì đó' }) });
    const kq = await DT.docBangQuaToken(CAI_DAT, f);
    assert.strictEqual(kq.ma, 'TRA_VE_LA');
});

test('chưa khai địa chỉ hoặc token → nói rõ, không gọi gì', async () => {
    let goi = 0;
    const f = async () => { goi++; return { ok: true, json: async () => ({}) }; };
    for (const c of [{}, { sellUrl: 'https://x' }, { sellToken: 'y' }]) {
        const kq = await DT.docBangQuaToken(c, f);
        assert.strictEqual(kq.ma, 'CHUA_KHAI_BAO');
    }
    assert.strictEqual(goi, 0, 'chưa khai mà vẫn gọi mạng');
});

ghiChu('— ⭐ Nối dây ở tiến trình nền —');

test('⭐ nền ƯU TIÊN token, đọc bảng chỉ là lối phụ', () => {
    // Đi mãi một đường thì đăng nhập hay không cũng ra cùng một số. Hai đường là
    // hai khả năng lệch.
    const ma = doc('background.js');
    const than = ma.slice(ma.indexOf('async function chayTheoHen'),
                          ma.indexOf('async function kiemTraThu'));
    const iToken = than.indexOf('docSoQuaToken');
    const iTab = than.indexOf('timHoacMoTabBang');
    assert.ok(iToken > 0, 'nền chưa gọi docSoQuaToken');
    assert.ok(iToken < iTab, 'đọc bảng trước token — làm ngược thứ tự');
});

test('⭐ khai token rồi mà gọi hỏng thì DỪNG, KHÔNG rơi xuống đọc tab', () => {
    // Tab có thể đang hiện số cũ từ sáng (Sell nuốt lỗi AJAX im lặng khi hết
    // phiên). Rơi xuống đó là xuất hóa đơn thuế thật theo số cũ.
    const ma = doc('background.js');
    const than = ma.slice(ma.indexOf('async function docSoQuaToken'),
                          ma.indexOf('const KHOA_SO'));
    assert.match(than, /return null/, 'phải trả null khi CHƯA KHAI để rơi xuống lối phụ');
    // Trả null chỉ ở đúng nhánh "chưa khai".
    const truocNull = than.slice(0, than.indexOf('return null'));
    assert.match(truocNull, /sellUrl/);
    assert.match(truocNull, /sellToken/);
    // Nhánh lỗi phải trả về object có tinCay=false, KHÔNG phải null.
    assert.match(than, /ok: false, tinCay: false/);
});

test('⭐ đóng tab không được nổ khi đi đường token (không có tab nào)', () => {
    const ma = doc('background.js');
    assert.ok(!/if \(tab\.tuMo\)/.test(ma),
        'còn chỗ dùng thẳng tab.tuMo — đi đường token thì tab là null, sẽ nổ');
    assert.match(ma, /function dongTabNeuTuMo\(tab\) \{\s*if \(tab && tab\.tuMo\)/);
});

test('⭐ Kiểm tra thử đi ĐÚNG đường mà lúc chạy thật sẽ đi', () => {
    // Kiểm thử bằng một đường rồi chạy thật bằng đường khác thì kiểm thử chẳng
    // chứng minh được gì.
    const ma = doc('background.js');
    const than = ma.slice(ma.indexOf('async function kiemTraThu'));
    assert.match(than, /docSoQuaToken/);
    const iToken = than.indexOf('docSoQuaToken');
    const iTab = than.indexOf("loai: 'hdt-doc-bang'");
    assert.ok(iToken < iTab, 'kiểm thử vẫn đọc bảng trước');
});

test('docBangToken.js được nền nạp', () => {
    const ma = doc('background.js');
    assert.match(ma, /importScripts\([^)]*chung\/docBangToken\.js/s);
});

test('⭐ KHÔNG rò biến ra phạm vi chung ngoài HDT_*', () => {
    // Nền nạp mọi file vào CÙNG MỘT phạm vi; trùng tên là file sau nổ im lặng.
    const ma = doc('chung/docBangToken.js');
    assert.match(ma, /^\(function \(\) \{/m, 'chưa bọc trong phạm vi riêng');
    assert.match(ma, /globalThis\.HDT_DocBangToken = API/);
});

ghiChu('— Đường đọc bên Sell —');

test('⭐ đường đọc nằm sau cửa TOKEN, KHÔNG đòi đăng nhập', () => {
    const web = fs.readFileSync(path.join(GOC, '..', 'Sell', 'routes', 'web.php'), 'utf8');
    const i = web.indexOf("Route::get('/bao-cao-khach-hang'");
    assert.ok(i > 0, 'Sell chưa mở đường đọc bằng token');
    const truoc = web.slice(Math.max(0, i - 1500), i);
    assert.match(truoc, /middleware\('kiemTraApiHoaDon'\)/,
        'đường đọc không nằm trong nhóm token');
});

test('⭐ trỏ vào ĐÚNG hàm của trang báo cáo, không viết lại truy vấn', () => {
    // Hai chỗ cùng tính doanh thu là sớm muộn ra hai con số khác nhau, mà số này
    // dùng để xuất hóa đơn thuế thật.
    const web = fs.readFileSync(path.join(GOC, '..', 'Sell', 'routes', 'web.php'), 'utf8');
    assert.match(web, /bao-cao-khach-hang',\s*\[BaoCaoController::class,\s*'apiBaoCaoKhachHang'\]/);
});

chay('ĐỌC DOANH THU BẰNG TOKEN — chạy được khi chưa đăng nhập Sell');
