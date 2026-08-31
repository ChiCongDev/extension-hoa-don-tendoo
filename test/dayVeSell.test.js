'use strict';

// Test ĐẨY KẾT QUẢ VỀ SELL — cho trang "Kế toán tổng hợp".
//
// ⚠️ Bài quan trọng nhất ở đây KHÔNG phải "gửi được", mà là "GỬI HỎNG KHÔNG
// ĐƯỢC LÀM HỎNG VIỆC PHÁT HÀNH HÓA ĐƠN". Đây là việc phụ; Sell sập, mất mạng,
// token sai — tất cả đều phải im lặng bỏ qua.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { test, ghiChu, chay } = require('./chay');
const Day = require('../chung/dayVeSell');
const LS = require('../chung/lichSuChay');
globalThis.__HDT_KHONG_TU_CHAY__ = true;
require('../chung/ghepTien');
require('../sell/docBang');
require('../sell/oKhaiBao');
const ChenCot = require('../sell/chenCot');

const GOC = path.join(__dirname, '..');
const doc = (f) => fs.readFileSync(path.join(GOC, f), 'utf8');

const CAI_DAT = { sellUrl: 'https://bongtom.store', sellToken: 'abc123' };

/** fetch giả, ghi lại mọi lần gọi. */
function fetchGia({ ok = true, than = { thanh_cong: true, da_ghi: 1 }, nem = null } = {}) {
    const daGoi = [];
    const f = async (url, tuyChon) => {
        daGoi.push({ url, tuyChon });
        if (nem) throw new Error(nem);
        return { ok, status: ok ? 200 : 500, json: async () => than };
    };
    f.daGoi = daGoi;
    return f;
}

const banGhiMau = () => LS.taoBanGhi({
    nguon: 'HEN_GIO', moc: '21:00', luc: 1786000000000, chay: true,
    ngay: { tu: '13/08/2026', den: '13/08/2026' },
    trongLich: [{ maKH: 'S3', tenKH: 'Thùy Dương' }, { maKH: 'S5', tenKH: 'Ngọc Lan' },
                { maKH: 'S1', tenKH: 'Bích Ngọc' }],
    thieu: [{ maKH: 'S1', tenKH: 'Bích Ngọc', lyDo: 'hôm nay chưa phát sinh doanh thu' }],
    ketQua: {
        xong: [{ maKH: 'S3', tenKH: 'Thùy Dương', soTien: 10380000,
                 ketQua: { daBamThanhToan: true, tong: 10350000, lech: 30000 } }],
        loi: [{ maKH: 'S5', tenKH: 'Ngọc Lan', soTien: 12419000,
                maLoi: 'SAI_TAI_KHOAN', thongBao: 'Kho hàng không thuộc cửa hàng' }],
    },
});

ghiChu('— ⭐ Gửi CẢ HAI CHIỀU: đã ra hóa đơn và CHƯA ra —');

test('⭐ mỗi khách trong lịch đều có một dòng gửi đi, không sót ai', () => {
    const g = Day.goiTuBanGhi(banGhiMau());
    assert.strictEqual(g.length, 3);
    assert.deepStrictEqual(g.map(x => x.ma_khach_hang).sort(), ['S1', 'S3', 'S5']);
});

test('⭐ khách ĐÃ ra hóa đơn gửi TỔNG TENDOO TÍNH, không gửi số định xuất', () => {
    // Số tiền hóa đơn thật là con số của Tendoo, không phải doanh thu mình tính.
    // Kế toán cần con số THẬT trên hóa đơn.
    const g = Day.goiTuBanGhi(banGhiMau());
    const s3 = g.find(x => x.ma_khach_hang === 'S3');
    assert.strictEqual(s3.ket_qua, 'RA_HOA_DON');
    assert.strictEqual(s3.so_tien, 10350000, 'gửi số định xuất thay vì tổng Tendoo');
});

test('⭐ khách CHƯA ra hóa đơn vẫn được gửi, KÈM LÝ DO', () => {
    const g = Day.goiTuBanGhi(banGhiMau());
    const s5 = g.find(x => x.ma_khach_hang === 'S5');
    assert.strictEqual(s5.ket_qua, 'LOI');
    assert.match(s5.ly_do, /không thuộc cửa hàng/);
    assert.strictEqual(s5.so_tien, 12419000, 'mất số tiền đáng ra phải xuất');

    const s1 = g.find(x => x.ma_khach_hang === 'S1');
    assert.strictEqual(s1.ket_qua, 'BO_QUA');
    assert.match(s1.ly_do, /chưa phát sinh doanh thu/);
});

test('⭐ gửi NGÀY SỐ LIỆU, không phải ngày máy chạy', () => {
    // Hẹn giờ chạy lúc nửa đêm thì hai cái lệch nhau, và kế toán cần ngày số liệu.
    const g = Day.goiTuBanGhi(banGhiMau());
    assert.ok(g.every(x => x.ngay === '2026-08-13'), JSON.stringify(g.map(x => x.ngay)));
});

test('không có ngày số liệu → lùi về ngày của máy, không bỏ trống', () => {
    const b = LS.taoBanGhi({ chay: true, luc: Date.now(), trongLich: [{ maKH: 'A' }] });
    const g = Day.goiTuBanGhi(b);
    assert.match(g[0].ngay, /^\d{4}-\d{2}-\d{2}$/);
});

test('⭐ mã lệnh chống trùng: gửi lại cùng lượt chạy ra CÙNG mã', () => {
    const b = banGhiMau();
    const a = Day.goiTuBanGhi(b).map(x => x.ma_lenh);
    const c = Day.goiTuBanGhi(b).map(x => x.ma_lenh);
    assert.deepStrictEqual(a, c, 'gửi lại sinh mã mới — Sell sẽ ghi trùng dòng');
    assert.strictEqual(new Set(a).size, a.length, 'hai khách trùng mã lệnh');
});

test('đổi ngày "13/08/2026" sang "2026-08-13"', () => {
    assert.strictEqual(Day.ngayISO('13/08/2026'), '2026-08-13');
    assert.strictEqual(Day.ngayISO('2026-08-13'), '2026-08-13');
    assert.strictEqual(Day.ngayISO('bậy'), null);
});

ghiChu('— ⛔ GỬI HỎNG KHÔNG ĐƯỢC LÀM HỎNG VIỆC CHÍNH —');

test('⛔ Sell sập (500) → trả ok:false, KHÔNG ném lỗi ra ngoài', async () => {
    const f = fetchGia({ ok: false });
    const kq = await Day.dayVeSell(banGhiMau(), CAI_DAT, f);
    assert.strictEqual(kq.ok, false);
    assert.match(kq.thongBao, /500/);
});

test('⛔ mất mạng (fetch ném lỗi) → trả ok:false, KHÔNG ném ra ngoài', async () => {
    const f = fetchGia({ nem: 'Failed to fetch' });
    const kq = await Day.dayVeSell(banGhiMau(), CAI_DAT, f);
    assert.strictEqual(kq.ok, false);
    assert.match(kq.thongBao, /Failed to fetch/);
});

test('⛔ Sell trả JSON hỏng → vẫn không ném ra ngoài', async () => {
    const f = async () => ({ ok: true, status: 200, json: async () => { throw new Error('JSON hỏng'); } });
    const kq = await Day.dayVeSell(banGhiMau(), CAI_DAT, f);
    assert.strictEqual(kq.ok, false);
});

test('chưa khai báo nơi gửi → bỏ qua, KHÔNG coi là lỗi', async () => {
    // Người dùng có thể cố ý không dùng trang kế toán.
    const f = fetchGia();
    const kq = await Day.dayVeSell(banGhiMau(), { sellUrl: '', sellToken: '' }, f);
    assert.strictEqual(kq.boQua, 'CHUA_KHAI_BAO');
    assert.strictEqual(f.daGoi.length, 0, 'gửi đi dù chưa khai báo');
});

test('thiếu token → cũng không gửi', async () => {
    const f = fetchGia();
    await Day.dayVeSell(banGhiMau(), { sellUrl: 'https://x', sellToken: '' }, f);
    assert.strictEqual(f.daGoi.length, 0);
});

test('bản ghi rỗng → không gửi gói rỗng lên máy chủ', async () => {
    const f = fetchGia();
    const kq = await Day.dayVeSell({ khach: [] }, CAI_DAT, f);
    assert.strictEqual(kq.boQua, 'KHONG_CO_GI_DE_GUI');
    assert.strictEqual(f.daGoi.length, 0);
});

ghiChu('— Gói gửi đi —');

test('⭐ token đi trong header Authorization, KHÔNG nằm trong địa chỉ', async () => {
    // Token trong URL là lộ vào log máy chủ, lịch sử trình duyệt, referrer.
    const f = fetchGia();
    await Day.dayVeSell(banGhiMau(), CAI_DAT, f);
    const g = f.daGoi[0];
    assert.ok(!g.url.includes('abc123'), 'TOKEN NẰM TRONG ĐỊA CHỈ — lộ vào log');
    assert.strictEqual(g.tuyChon.headers.Authorization, 'Bearer abc123');
});

test('đúng đường dẫn, đúng phương thức', async () => {
    const f = fetchGia();
    await Day.dayVeSell(banGhiMau(), CAI_DAT, f);
    assert.strictEqual(f.daGoi[0].url, 'https://bongtom.store/api/extension/hoa-don/ghi-nhan');
    assert.strictEqual(f.daGoi[0].tuyChon.method, 'POST');
});

test('địa chỉ có dấu / thừa ở cuối vẫn ghép đúng', async () => {
    const f = fetchGia();
    await Day.dayVeSell(banGhiMau(), { sellUrl: 'https://bongtom.store/', sellToken: 'x' }, f);
    assert.strictEqual(f.daGoi[0].url, 'https://bongtom.store/api/extension/hoa-don/ghi-nhan');
});

test('Sell trả về mã KH không khớp → chuyển nguyên ra ngoài để còn báo', async () => {
    const f = fetchGia({ than: { thanh_cong: true, da_ghi: 2, khong_khop_khach: ['S9'] } });
    const kq = await Day.dayVeSell(banGhiMau(), CAI_DAT, f);
    assert.strictEqual(kq.ok, true);
    assert.deepStrictEqual(kq.khongKhopKhach, ['S9']);
});

ghiChu('— Nối dây —');

test('⭐ nền đẩy sang Sell SAU KHI đã ghi lịch sử, và nuốt lỗi', () => {
    // Ghi lịch sử là việc chính (bằng chứng tại chỗ); đẩy sang Sell là việc phụ.
    // Đảo thứ tự là một lần gửi hỏng có thể làm mất luôn lịch sử.
    const ma = doc('background.js');
    const than = ma.slice(ma.indexOf('async function ghiLichSu'),
                          ma.indexOf('async function ghiKetQuaVaLichSu'));
    const iGhi = than.indexOf('chrome.storage.local.set');
    const iDay = than.indexOf('daySangSell');
    assert.ok(iGhi > 0 && iDay > iGhi, 'đẩy sang Sell trước khi ghi lịch sử');
    assert.match(than.slice(iDay), /catch/, 'không nuốt lỗi — gửi hỏng sẽ làm hỏng lần chạy');
});

test('⭐ token KHÔNG bao giờ được vẽ ra màn hình', () => {
    // Cùng luật với mật khẩu Tendoo: ô trống nghĩa là "giữ nguyên cái cũ".
    const ma = doc('popup/khaiBao.js');
    const than = ma.slice(ma.indexOf('function veGuiSell'), ma.indexOf('function veLai'));
    assert.ok(!/value\s*=\s*c\.sellToken/.test(than), 'vẽ token đã lưu ra ô nhập');
    assert.match(than, /đã lưu — gõ để đổi/, 'không cho biết là đã có token');
});

test('⭐ popup vẫn KHÔNG có ô nhập nào — token nằm ở màn khai báo', () => {
    const html = doc('popup.html');
    assert.ok(!/<input[^>]*type="(text|password)"/.test(html),
        'popup lại có ô nhập chữ — phá chốt "chỉ một chỗ khai báo"');
    assert.ok(!/sellToken/i.test(html));
});

test('extension và Sell dùng ĐÚNG một đường dẫn API', () => {
    assert.match(doc('chung/dayVeSell.js'), /\/api\/extension\/hoa-don\/ghi-nhan/);
    const sell = fs.readFileSync(
        path.join(GOC, '..', 'Sell', 'routes', 'web.php'), 'utf8');
    assert.match(sell, /hoa-don\/ghi-nhan/, 'Sell chưa khai route nhận');
});


ghiChu('— ⭐ GỬI NGAY SAU MỖI KHÁCH, không đợi hết loạt —');

// Trước đây máy chỉ gửi MỘT LẦN ở cuối loạt. Loạt bị ngắt giữa chừng (Chrome
// đóng, máy sập) là những hóa đơn ĐÃ RA THẬT cũng không sang được Sell —
// Tendoo có hóa đơn, trang kế toán trống.

test('⭐ khách vừa RA HÓA ĐƠN → dựng được dòng gửi ngay', () => {
    const d = Day.dongTuTienDo(
        { loai: 'xong', lenh: { id: 'l-1', maKH: 'S3', tenKH: 'Thùy Dương', soTien: 10380000 },
          ketQua: { daBamThanhToan: true, tong: 10350000 } },
        '13/08/2026', 111);
    assert.strictEqual(d.ket_qua, 'RA_HOA_DON');
    assert.strictEqual(d.so_tien, 10350000, 'phải gửi TỔNG TENDOO, không phải số định xuất');
    assert.strictEqual(d.ngay, '2026-08-13');
    assert.strictEqual(d.ma_lenh, 'l-1');
});

test('⭐ mới VÀO GIỎ (chưa bấm Thanh toán) → KHÔNG phải RA_HOA_DON', () => {
    const d = Day.dongTuTienDo(
        { loai: 'xong', lenh: { id: 'l-2', maKH: 'S5', soTien: 500 },
          ketQua: { daBamThanhToan: false } }, '13/08/2026', 1);
    assert.strictEqual(d.ket_qua, 'VAO_GIO');
    assert.match(d.ly_do, /tự bấm đang tắt/);
});

test('lỗi và treo cũng dựng được dòng, kèm lý do', () => {
    const l = Day.dongTuTienDo(
        { loai: 'loi', lenh: { id: 'l-3', maKH: 'A', soTien: 9 },
          ma: 'SAI_TAI_KHOAN', thongBao: 'nhầm cửa hàng' }, '13/08/2026', 1);
    assert.strictEqual(l.ket_qua, 'LOI');
    assert.match(l.ly_do, /nhầm cửa hàng/);

    const t = Day.dongTuTienDo(
        { loai: 'treo', lenh: { id: 'l-4', maKH: 'B' }, thongBao: 'không rõ' }, '13/08/2026', 1);
    assert.strictEqual(t.ket_qua, 'TREO');
});

test('tin "bat-dau" chưa có gì để gửi → trả null', () => {
    assert.strictEqual(Day.dongTuTienDo({ loai: 'bat-dau', lenh: { maKH: 'A' } }, '13/08/2026', 1), null);
    assert.strictEqual(Day.dongTuTienDo({ loai: 'xong' }, '13/08/2026', 1), null);
});

test('⭐ MÃ CHỐNG TRÙNG khớp nhau giữa gửi-từng-khách và gửi-cuối-loạt', () => {
    // Nếu hai đường sinh mã khác nhau thì mỗi khách sẽ có HAI dòng bên Sell,
    // và cột XHD cộng đôi -> số kế toán sai gấp đôi.
    const tienDo = { loai: 'xong', lenh: { id: 'l-9', maKH: 'S3', tenKH: 'TD', soTien: 100 },
                     ketQua: { daBamThanhToan: true, tong: 98 } };
    const ngay = Day.dongTuTienDo(tienDo, '13/08/2026', 5).ma_lenh;

    const b = LS.taoBanGhi({
        chay: true, luc: 5, ngay: { tu: '13/08/2026' }, trongLich: [{ maKH: 'S3' }],
        ketQua: { xong: [{ id: 'l-9', maKH: 'S3', soTien: 100,
                           ketQua: { daBamThanhToan: true, tong: 98 } }] },
    });
    const cuoi = Day.goiTuBanGhi(b).find(x => x.ma_khach_hang === 'S3').ma_lenh;
    assert.strictEqual(ngay, cuoi, 'hai đường sinh mã khác nhau — Sell sẽ ghi hai dòng');
});

ghiChu('— ⭐ HÀNG CHỜ: gửi hỏng thì GIỮ LẠI, không mất —');

/** Kho giả trong bộ nhớ. */
function khoGia(banDau) {
    let d = banDau || null;
    return { async doc() { return d; }, async ghi(o) { d = o; }, xem: () => d };
}

test('⭐ gửi được → hàng chờ sạch', async () => {
    const kho = khoGia();
    const f = fetchGia();
    const kq = await Day.xepVaGui({ kho, caiDat: CAI_DAT, layFetch: f,
        dongMoi: [{ ma_lenh: 'a', ma_khach_hang: 'X', ngay: '2026-08-13' }] });
    assert.strictEqual(kq.ok, true);
    assert.strictEqual(kq.daGui, 1);
    assert.deepStrictEqual(kho.xem(), []);
});

test('⭐ gửi HỎNG → dòng nằm lại hàng chờ, KHÔNG mất', async () => {
    // Đây là lỗ đã có thật: Sell tắt là số của cả lượt biến mất khỏi trang kế
    // toán, dù hóa đơn đã ra.
    const kho = khoGia();
    const f = fetchGia({ nem: 'Failed to fetch' });
    const kq = await Day.xepVaGui({ kho, caiDat: CAI_DAT, layFetch: f,
        dongMoi: [{ ma_lenh: 'a', ma_khach_hang: 'X', ngay: '2026-08-13' }] });
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.conLai, 1);
    assert.strictEqual(kho.xem().length, 1, 'MẤT DÒNG — đúng lỗi cũ');
});

test('⭐ lần sau gửi được → gửi BÙ cả phần đọng lẫn phần mới', async () => {
    const kho = khoGia();
    await Day.xepVaGui({ kho, caiDat: CAI_DAT, layFetch: fetchGia({ nem: 'x' }),
        dongMoi: [{ ma_lenh: 'a', ma_khach_hang: 'X', ngay: '2026-08-13' }] });
    const f = fetchGia();
    const kq = await Day.xepVaGui({ kho, caiDat: CAI_DAT, layFetch: f,
        dongMoi: [{ ma_lenh: 'b', ma_khach_hang: 'Y', ngay: '2026-08-13' }] });
    assert.strictEqual(kq.daGui, 2, 'không gửi bù phần đọng');
    const gui = JSON.parse(f.daGoi[0].tuyChon.body).ban_ghi;
    assert.deepStrictEqual(gui.map(x => x.ma_lenh).sort(), ['a', 'b']);
    assert.deepStrictEqual(kho.xem(), []);
});

test('⭐ gửi bù KHÔNG cần dòng mới — gọi rỗng vẫn đẩy được phần đọng', async () => {
    const kho = khoGia([{ ma_lenh: 'a', ma_khach_hang: 'X', ngay: '2026-08-13' }]);
    const f = fetchGia();
    const kq = await Day.xepVaGui({ kho, caiDat: CAI_DAT, layFetch: f });
    assert.strictEqual(kq.daGui, 1);
    assert.deepStrictEqual(kho.xem(), []);
});

test('hàng chờ rỗng và không có gì mới → không gọi máy chủ', async () => {
    const kho = khoGia([]);
    const f = fetchGia();
    const kq = await Day.xepVaGui({ kho, caiDat: CAI_DAT, layFetch: f });
    assert.strictEqual(kq.ok, true);
    assert.strictEqual(f.daGoi.length, 0, 'gọi máy chủ với gói rỗng');
});

test('⭐ cùng mã lệnh gửi hai lần → dòng MỚI đè dòng cũ, không nhân đôi', async () => {
    // Cùng một lệnh có thể được gửi lại với kết quả KHÁC: lần sau đã kết luận
    // được một lệnh trước đó còn treo.
    const h = Day.themVaoCho(
        [{ ma_lenh: 'a', ma_khach_hang: 'X', ket_qua: 'TREO' }],
        [{ ma_lenh: 'a', ma_khach_hang: 'X', ket_qua: 'RA_HOA_DON' }]);
    assert.strictEqual(h.length, 1);
    assert.strictEqual(h[0].ket_qua, 'RA_HOA_DON');
});

test('⭐ hàng chờ có TRẦN — kho Chrome có hạn, phình là hỏng cả kho', () => {
    let h = [];
    for (let i = 0; i < 700; i++) {
        h = Day.themVaoCho(h, [{ ma_lenh: 'm' + i, ma_khach_hang: 'X' }], 500);
    }
    assert.strictEqual(h.length, 500);
    // Cắt phần CŨ NHẤT, giữ phần mới.
    assert.strictEqual(h[h.length - 1].ma_lenh, 'm699');
});

test('kho hỏng → vẫn cố gửi phần vừa có, không nổ', async () => {
    const kho = { async doc() { throw new Error('kho hỏng'); }, async ghi() {} };
    const f = fetchGia();
    const kq = await Day.xepVaGui({ kho, caiDat: CAI_DAT, layFetch: f,
        dongMoi: [{ ma_lenh: 'a', ma_khach_hang: 'X' }] });
    assert.strictEqual(kq.ok, true);
    assert.strictEqual(kq.daGui, 1);
});

test('đếm được số đang chờ', async () => {
    assert.strictEqual(await Day.soDangCho(khoGia([1, 2, 3])), 3);
    assert.strictEqual(await Day.soDangCho(khoGia(null)), 0);
    assert.strictEqual(await Day.soDangCho({ async doc() { throw new Error('x'); } }), 0);
});

ghiChu('— Nối dây: gửi từng khách + gửi bù —');

test('⭐ hẹn giờ truyền móc GỬI TỪNG KHÁCH vào cầu nối', () => {
    const ma = doc('background.js');
    const than = ma.slice(ma.indexOf('async function chayTheoHen'),
                          ma.indexOf('async function kiemTraThu'));
    assert.match(than, /taoHoaDon\(dsChay, taoMocDaySell\(/,
        'vẫn gửi một lần ở cuối loạt — ngắt giữa chừng là mất hóa đơn đã ra');
});

test('⭐ chạy TAY cũng gửi từng khách', () => {
    const ma = doc('background.js');
    const than = ma.slice(ma.indexOf('TAO_HOA_DON'));
    assert.match(than.slice(0, 1500), /mocDaySellTay\(tienDo\)/);
});

// ⚠️ BÀI NÀY TRƯỚC ĐÂY GHIM ĐÚNG MỘT DÒNG (`if (dong) daySangSell(dong);`).
// Ngày 31/08/2026 móc ấy phải xếp lại thứ tự — ghi sổ Sell XONG rồi mới đọc số
// quý cho tin nhắn, nên `await daySangSell` là CỐ Ý. Nhưng lời hứa "không làm
// chậm loạt" vẫn phải còn: cái await ấy nằm trong khối chạy nền tự bắn đi, còn
// hàm móc vẫn trả về ngay lập tức.
test('⭐ móc gửi-từng-khách KHÔNG làm chậm loạt (việc chậm chạy nền)', () => {
    const ma = doc('background.js');
    const than = ma.slice(ma.indexOf('function taoMocDaySell'), ma.indexOf('const ghiKetQuaHen'));
    assert.match(than, /daySangSell\(dong\)/, 'móc từng khách không đẩy sang Sell nữa');
    assert.ok(!/return\s+async\s*\(/.test(than),
        'hàm móc thành async -> vòng phát hành hóa đơn đứng đợi việc phụ');
    assert.match(than, /\(async \(\) => \{[\s\S]*?\}\)\(\)/,
        'việc chậm nằm thẳng trong hàm móc thay vì chạy nền');
    assert.match(than, /catch/, 'không nuốt lỗi');
});

test('⭐ Chrome mở lại → tự GỬI BÙ phần còn đọng', () => {
    const ma = doc('background.js');
    assert.match(ma, /onStartup[\s\S]{0,200}daySangSell\(\)/, 'mở lại Chrome không gửi bù');
    assert.match(ma, /onInstalled[\s\S]{0,200}daySangSell\(\)/);
});

test('⭐ có nút gửi lại thủ công, và đếm được số đang chờ', () => {
    const nen = doc('background.js');
    assert.match(nen, /'hdt-gui-lai-sell'/);
    assert.match(nen, /'hdt-so-cho-gui-sell'/);
    const kb = doc('popup/khaiBao.js');
    assert.match(kb, /kbGuiLaiSell/, 'màn khai báo không có nút gửi lại');
    assert.match(kb, /Gửi lại \$\{soChoGui\} dòng chưa gửi/);
});

test('⭐ chạy tay gửi kèm NGÀY SỐ LIỆU, và chỉ khi bảng đang ở MỘT ngày', () => {
    // Bảng đang ở khoảng nhiều ngày mà vẫn gửi ngày thì ghi bừa vào một ngày
    // không đúng — thà để trống.
    const ma = doc('sell/chenCot.js');
    const than = ma.slice(ma.indexOf("loai: 'hdt-tao-hoa-don'") - 600);
    assert.match(than.slice(0, 900), /ngaySoLieu:\s*\(khoang && khoang\.tu === khoang\.den\)/);
});


ghiChu('— ⭐ Nói ĐÚNG BỆNH khi Sell từ chối —');

// "Sell trả về 403" thì không ai đoán ra phải làm gì. Mà 403 lại đúng là
// nguyên nhân số một khiến cột XHD bên Sell trống.

test('⭐ 403 → nói thẳng là SAI TOKEN và chỉ ra chỗ sửa', async () => {
    const f = fetchGia({ ok: false });
    f.daGoi.length = 0;
    const f403 = async (url, t) => { f.daGoi.push({ url, tuyChon: t });
        return { ok: false, status: 403, json: async () => ({}) }; };
    const kq = await Day.dayVeSell(banGhiMau(), CAI_DAT, f403);
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ma, 'SAI_TOKEN');
    assert.match(kq.thongBao, /EXTENSION_HOA_DON_TOKEN/, 'không chỉ ra tên biến cần sửa');
    assert.match(kq.thongBao, /\.env/);
    assert.match(kq.thongBao, /giữ lại/, 'không trấn an rằng dòng chưa mất');
});

test('⭐ 404 → nói là SAI ĐỊA CHỈ, kèm địa chỉ đang dùng', async () => {
    const f404 = async () => ({ ok: false, status: 404, json: async () => ({}) });
    const kq = await Day.dayVeSell(banGhiMau(), CAI_DAT, f404);
    assert.strictEqual(kq.ma, 'SAI_DIA_CHI');
    assert.match(kq.thongBao, /bongtom\.store/, 'không nói địa chỉ đang dùng');
});

test('mã lỗi khác vẫn báo nguyên số, không đoán bừa', async () => {
    const f500 = async () => ({ ok: false, status: 500, json: async () => ({}) });
    const kq = await Day.dayVeSell(banGhiMau(), CAI_DAT, f500);
    assert.match(kq.thongBao, /500/);
    assert.strictEqual(kq.ma, undefined, 'gán mã bừa cho lỗi chưa biết');
});

test('⭐ 403 thì dòng VẪN NẰM LẠI hàng chờ — cài token xong gửi bù được', async () => {
    const kho = { _d: null, async doc() { return this._d; }, async ghi(o) { this._d = o; } };
    const f403 = async () => ({ ok: false, status: 403, json: async () => ({}) });
    const kq = await Day.xepVaGui({ kho, caiDat: CAI_DAT, layFetch: f403,
        dongMoi: [{ ma_lenh: 'a', ma_khach_hang: 'X', ngay: '2026-08-14' }] });
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.conLai, 1);
    assert.strictEqual(kho._d.length, 1, 'mất dòng khi token sai');
});

ghiChu('— ⭐ Trang Sell phải NÓI RA vì sao cột XHD trống —');

test('⭐ Sell trả kèm tình trạng kết nối trong dữ liệu bảng', () => {
    const ma = fs.readFileSync(path.join(GOC, '..', 'Sell', 'app', 'Http', 'Controllers',
        'KeToanTongHopController.php'), 'utf8');
    assert.match(ma, /'ket_noi'\s*=>\s*\$this->tinhTrangKetNoi\(\)/,
        'apiBang không kèm tình trạng kết nối');
    const than = ma.slice(ma.indexOf('function tinhTrangKetNoi'));
    assert.match(than.slice(0, 1200), /extension_hoa_don\.token/, 'không xét token đã đặt chưa');
    assert.match(than.slice(0, 1200), /tong_da_nhan/);
    assert.match(than.slice(0, 1200), /lan_nhan_gan_nhat/);
});

test('⭐ trang nói rõ CHƯA NHẬN GÌ và chỉ đường, KHÔNG dọa về token', () => {
    // Token không còn bắt buộc: máy ghi qua chính tab Sell đang đăng nhập. Dọa
    // "chưa đặt token" là sai, và đẩy người dùng đi sửa thứ không cần sửa.
    const bl = fs.readFileSync(path.join(GOC, '..', 'Sell', 'resources', 'views',
        'keToan', 'tongHop.blade.php'), 'utf8');
    const than = bl.slice(bl.indexOf('function veKetNoi'), bl.indexOf('function veBang'));
    assert.match(than, /!k\.tong_da_nhan/, 'không xét trạng thái chưa nhận dòng nào');
    assert.match(than, /Không cần khai báo gì/, 'không nói rõ là khỏi phải khai');
    assert.match(than, /🔑/, 'không chỉ đường tới màn khai báo');
    assert.match(than, /Đã nhận/, 'không có trạng thái bình thường');
    assert.ok(!/Cột XHD sẽ luôn trống/.test(bl),
        'vẫn dọa "cột XHD sẽ luôn trống vì chưa đặt token" — nay không còn đúng');
});


ghiChu('— ⭐ GHI QUA TAB SELL ĐANG ĐĂNG NHẬP — khỏi khai token —');

// Gọi thẳng từ tiến trình nền thì với Sell đó là NGƯỜI LẠ (không phiên), nên
// mới cần token. Còn trang Sell bạn ĐANG ĐĂNG NHẬP thì gửi kèm cookie phiên +
// CSRF — chặt hơn hẳn một chuỗi token dùng chung, mà lại khỏi khai gì.

test('⭐ xepVaGui nhận được HÀM GỬI bơm từ ngoài vào', async () => {
    const kho = { _d: null, async doc() { return this._d; }, async ghi(o) { this._d = o; } };
    const daGoi = [];
    const kq = await Day.xepVaGui({
        kho, dongMoi: [{ ma_lenh: 'a', ma_khach_hang: 'X' }],
        gui: async (cac) => { daGoi.push(cac); return { ok: true, daGhi: cac.length }; },
    });
    assert.strictEqual(kq.ok, true);
    assert.strictEqual(daGoi.length, 1, 'không dùng hàm gửi được bơm vào');
    assert.deepStrictEqual(kho._d, [], 'gửi xong mà không dọn hàng chờ');
});

test('⭐ hàm gửi bơm vào mà HỎNG → dòng vẫn nằm lại hàng chờ', async () => {
    const kho = { _d: null, async doc() { return this._d; }, async ghi(o) { this._d = o; } };
    const kq = await Day.xepVaGui({
        kho, dongMoi: [{ ma_lenh: 'a', ma_khach_hang: 'X' }],
        gui: async () => ({ ok: false, thongBao: 'chưa đăng nhập' }),
    });
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.conLai, 1);
    assert.strictEqual(kho._d.length, 1);
});

test('⭐ nền ƯU TIÊN tab Sell, token chỉ là lối phụ', () => {
    const ma = doc('background.js');
    const than = ma.slice(ma.indexOf('function taoHamGui'), ma.indexOf('async function daySangSell'));
    const iTab = than.indexOf("'hdt-ghi-nhan-tu-may'");
    const iToken = than.indexOf('guiCacDong');
    assert.ok(iTab > 0 && iTab < iToken, 'thử token trước tab — làm ngược thứ tự');
    assert.match(than, /duong: 'TAB_SELL'/);
    assert.match(than, /duong: 'TOKEN'/);
});

test('⭐ tab ghi không được thì RƠI XUỐNG token, không bỏ cuộc', () => {
    const ma = doc('background.js');
    const than = ma.slice(ma.indexOf('function taoHamGui'), ma.indexOf('async function daySangSell'));
    // Sau nhánh tab phải còn phần gọi token, không được `return` thẳng.
    const sauTab = than.slice(than.indexOf("if (tra && tra.ok) return"));
    assert.match(sauTab, /guiCacDong/, 'tab hỏng là bỏ cuộc, không thử token');
});

ghiChu('— ⭐ Trang Sell ghi hộ bằng PHIÊN ĐĂNG NHẬP —');

test('⭐ gửi kèm cookie phiên và CSRF, KHÔNG kèm token nào', async () => {
    const { JSDOM } = require(process.env.HDT_JSDOM || 'jsdom');
    const dom = new JSDOM('<!doctype html><head>'
        + '<meta name="csrf-token" content="csrf-abc"></head><body></body>');
    const cua = dom.window;
    const daGoi = [];
    cua.fetch = async (url, t) => { daGoi.push({ url, t });
        return { ok: true, status: 200, json: async () => ({ thanh_cong: true, da_ghi: 1 }) }; };

    const kq = await ChenCot.ghiNhanTuMay(cua.document, [{ ma_khach_hang: 'S3' }]);
    assert.strictEqual(kq.ok, true);
    const g = daGoi[0];
    assert.strictEqual(g.url, '/ke-toan-tong-hop/api/ghi-nhan-tu-may');
    assert.strictEqual(g.t.credentials, 'same-origin', 'không mang cookie phiên thì Sell từ chối');
    assert.strictEqual(g.t.headers['X-CSRF-TOKEN'], 'csrf-abc');
    assert.ok(!g.t.headers.Authorization, 'vẫn gửi kèm token — đường này không cần');
});

test('⭐ thiếu thẻ csrf-token → dừng và bảo F5, không gửi bừa', async () => {
    const { JSDOM } = require(process.env.HDT_JSDOM || 'jsdom');
    const dom = new JSDOM('<!doctype html><body></body>');
    let daGoi = 0;
    dom.window.fetch = async () => { daGoi++; return { ok: true, json: async () => ({}) }; };
    const kq = await ChenCot.ghiNhanTuMay(dom.window.document, [{ ma_khach_hang: 'S3' }]);
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ma, 'THIEU_CSRF');
    assert.strictEqual(daGoi, 0, 'vẫn gửi dù không có CSRF');
});

test('⭐ 403 ở đây là CHƯA ĐĂNG NHẬP, không phải sai token', async () => {
    // Hai chuyện khác hẳn nhau, cách chữa cũng khác: một đằng đăng nhập lại,
    // một đằng sửa .env.
    const { JSDOM } = require(process.env.HDT_JSDOM || 'jsdom');
    const dom = new JSDOM('<!doctype html><head>'
        + '<meta name="csrf-token" content="x"></head><body></body>');
    dom.window.fetch = async () => ({ ok: false, status: 403 });
    const kq = await ChenCot.ghiNhanTuMay(dom.window.document, [{ ma_khach_hang: 'S3' }]);
    assert.strictEqual(kq.ma, 'CHUA_DANG_NHAP');
    assert.match(kq.thongBao, /Admin/);
    assert.match(kq.thongBao, /gửi bù/, 'không trấn an rằng dòng chưa mất');
});

test('419 → nói là HẾT PHIÊN, bảo F5', async () => {
    const { JSDOM } = require(process.env.HDT_JSDOM || 'jsdom');
    const dom = new JSDOM('<!doctype html><head>'
        + '<meta name="csrf-token" content="x"></head><body></body>');
    dom.window.fetch = async () => ({ ok: false, status: 419 });
    const kq = await ChenCot.ghiNhanTuMay(dom.window.document, [{ ma_khach_hang: 'S3' }]);
    assert.strictEqual(kq.ma, 'HET_PHIEN');
    assert.match(kq.thongBao, /F5/);
});

test('⭐ Sell dùng CHUNG MỘT hàm ghi cho cả hai đường', () => {
    // Hai bản sao logic là sớm muộn lệch nhau: chống trùng hoặc luật
    // "chỉ RA_HOA_DON mới tính" sẽ khác nhau ở một đường.
    const web = fs.readFileSync(path.join(GOC, '..', 'Sell', 'routes', 'web.php'), 'utf8');
    assert.match(web, /ghi-nhan-tu-may.*ExtensionHoaDonController::class,\s*'apiGhiNhan'/s,
        'đường qua tab dùng hàm ghi khác — hai logic sẽ lệch nhau');
    // Và nó phải nằm trong nhóm CHỈ ADMIN.
    const i = web.indexOf('ghi-nhan-tu-may');
    const truoc = web.slice(Math.max(0, i - 2000), i);
    assert.match(truoc, /phanQuyen:admin/, 'đường ghi qua tab không chặn quyền admin');
});

ghiChu('— ⭐ Báo kết quả NGAY TẠI CHỖ —');

test('⭐ khối gửi sang Sell có ô báo RIÊNG, không dùng chỗ báo ở đầu màn', () => {
    // Khối này nằm CUỐI màn khai báo. Bấm Lưu trong lúc đang cuộn ở cuối mà báo
    // ở đầu màn thì người dùng không thấy gì — tưởng nút không ăn. Gặp thật.
    const ma = doc('popup/khaiBao.js');
    const than = ma.slice(ma.indexOf('function veGuiSell'), ma.indexOf('async function thuKetNoi'));
    assert.match(than, /kbSellBao/, 'không có ô báo riêng trong khối');
    assert.match(than, /kbSellTrangThai/, 'không hiện trạng thái ngay khi mở');

    const luu = ma.slice(ma.indexOf('async function luuNoiGui'));
    assert.ok(!/baoOk\s*=/.test(luu.slice(0, 1200)), 'vẫn báo ở chỗ chung trên đầu màn');
    assert.match(luu.slice(0, 1200), /baoSell\s*=/);
});

test('⭐ nói ĐÚNG cái còn thiếu, không nói chung chung', () => {
    const ma = doc('popup/khaiBao.js');
    const luu = ma.slice(ma.indexOf('async function luuNoiGui'));
    assert.match(luu.slice(0, 1600), /CHƯA CÓ TOKEN/);
    assert.match(luu.slice(0, 1600), /CHƯA ĐIỀN ĐỊA CHỈ SELL/);
    // Bắt ĐÚNG câu người dùng nhìn thấy, không bắt cả lời chú thích — chú thích
    // nhắc lại câu cũ là chuyện bình thường và không hại ai.
    assert.ok(!/còn thiếu địa chỉ hoặc token nên chưa gửi gì/.test(ma),
        'vẫn còn câu chung chung "địa chỉ HOẶC token" — người dùng phải tự đoán');
});

test('⭐ có nút Thử kết nối, và gói thăm dò KHÔNG ghi gì vào sổ', () => {
    const kb = doc('popup/khaiBao.js');
    assert.match(kb, /kbThuKetNoi/);
    const nen = doc('background.js');
    assert.match(nen, /'hdt-thu-ket-noi-sell'/);
    const than = nen.slice(nen.indexOf("'hdt-thu-ket-noi-sell'"));
    // Dòng thăm dò phải có mã khách RỖNG -> Sell bỏ qua, da_ghi = 0.
    assert.match(than.slice(0, 900), /ma_khach_hang:\s*''/,
        'gói thăm dò có mã khách thật — sẽ ghi bậy vào sổ kế toán');
});

test('chữ gợi ý không làm người dùng tưởng đã điền sẵn', () => {
    const ma = doc('popup/khaiBao.js');
    const than = ma.slice(ma.indexOf('function veGuiSell'), ma.indexOf('async function thuKetNoi'));
    assert.match(than, /Ví dụ: http/, 'chữ gợi ý địa chỉ vẫn trông như giá trị thật');
    assert.match(than, /Dán token từ \.env/);
});

chay('ĐẨY KẾT QUẢ VỀ SELL');
