'use strict';

// Test ÉP BẢNG BÁO CÁO VỀ "HÔM NAY" rồi KIỂM CHỨNG.
// Chạy: node test/epHomNay.test.js   (cần HDT_JSDOM)
//
// ⚠️ Đây là chốt chặn giữa "hẹn giờ" và "hóa đơn thật". Sai ở đây thì hóa đơn
// mang số của CẢ THÁNG mà nhìn vẫn hợp lý — không ai phát hiện.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require(process.env.HDT_JSDOM || 'jsdom');
const { test, ghiChu, chay, doiMotNhip } = require('./chay');
const { taoTrang, gaLapSell, ngayDMY, KHACH_MAU } = require('./trangGiaLap');

globalThis.__HDT_KHONG_TU_CHAY__ = true;
require('../chung/nhipDo');
require('../chung/ghepTien');
require('../chung/caiDat');
require('../chung/henGio');
require('../sell/docBang');
const EpHomNay = require('../sell/epHomNay');
require('../sell/oKhaiBao');
const ChenCot = require('../sell/chenCot');

const HOM_NAY = ngayDMY(new Date());
const nhanh = { nghi: (ms) => new Promise(r => setTimeout(r, ms)), nhipNhin: 5, hanMs: 600 };

// Hai bộ dữ liệu khác nhau rõ rệt: đọc nhầm khoảng là lộ ngay.
const KHACH_HOM_NAY = [
    { id: 1, ma: 'PA', ten: 'Phương Anh - PA', soDon: 2, doanhThu: 1200000,
      giaVon: 900000, loiNhuan: 300000, tyLe: 25 },
];
const KHACH_THANG_NAY = [
    { id: 1, ma: 'PA', ten: 'Phương Anh - PA', soDon: 119, doanhThu: 134040000,
      giaVon: 118920000, loiNhuan: 15120000, tyLe: 11.28 },
    { id: 2, ma: 'TB', ten: 'Trang Bé TB', soDon: 106, doanhThu: 115825000,
      giaVon: 100540000, loiNhuan: 15285000, tyLe: 13.2 },
];

function dungTrang({ treMs = 0, theoLoai, tuHien = '--', denHien = '--', tuKhoa = '' } = {}) {
    const dom = new JSDOM(taoTrang({ tuHien, denHien, tuKhoa }));
    const cua = dom.window;
    // chrome giả tối thiểu, chỉ để gắn được tai nghe onMessage.
    cua.chrome = { runtime: { onMessage: { addListener: (f) => { cua.__tai = f; } },
                              sendMessage: async () => null } };
    const sell = gaLapSell(cua, {
        theoLoai: theoLoai || { hom_nay: KHACH_HOM_NAY, thang_nay: KHACH_THANG_NAY },
        treMs,
    });
    return { dom, cua, tailieu: cua.document, sell };
}

ghiChu('— ⚠️ Trang Sell mặc định là THÁNG NÀY —');

test('⭐ bản sao trang giữ đúng mặc định của Sell: thang_nay', () => {
    // Nếu bản sao này tự đặt sẵn "hom_nay" thì mọi test dưới đây xanh vô nghĩa,
    // trong khi ngoài đời máy vẫn đọc doanh thu cả tháng.
    const { tailieu } = dungTrang();
    assert.strictEqual(tailieu.getElementById('filterLoai').value, 'thang_nay',
        'bản sao không còn khớp trang thật');
    assert.strictEqual(tailieu.getElementById('soBanGhiSelect').value, '20',
        'trang thật mặc định 20 dòng/trang');
});

test('⭐ chưa ép mà đọc thẳng → lấy phải số CẢ THÁNG (chứng minh lỗi có thật)', async () => {
    const { tailieu, sell } = dungTrang();
    sell.loadBaoCao();
    await doiMotNhip();
    const dong = globalThis.HDT_DocBang.docCacDong(tailieu.getElementById('tableKhachHang'));
    const pa = dong.find(d => d.maKH === 'PA');
    assert.strictEqual(pa.doanhThu, 134040000, 'bản sao không tái hiện được lỗi cả tháng');
});

ghiChu('— Ép về hôm nay —');

test('⭐ ép xong bảng hiện đúng số của HÔM NAY', async () => {
    const { tailieu } = dungTrang();
    const kq = await EpHomNay.epVeHomNay(tailieu, nhanh);
    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.deepStrictEqual(kq.ngay, { tu: HOM_NAY, den: HOM_NAY });
    const dong = globalThis.HDT_DocBang.docCacDong(tailieu.getElementById('tableKhachHang'));
    assert.strictEqual(dong.find(d => d.maKH === 'PA').doanhThu, 1200000);
});

test('bộ lọc được đặt về hom_nay và "Tất cả đơn"', async () => {
    const { tailieu } = dungTrang();
    tailieu.getElementById('filterLoaiDon').value = 'order';
    await EpHomNay.epVeHomNay(tailieu, nhanh);
    assert.strictEqual(tailieu.getElementById('filterLoai').value, 'hom_nay');
    assert.strictEqual(tailieu.getElementById('filterLoaiDon').value, '',
        'để nguyên "Đơn order" thì doanh thu chỉ còn một phần');
});

test('⭐ chữ còn sót trong ô TÌM KIẾM bị dọn — nếu không sẽ lọc mất khách', async () => {
    // Không dọn thì khách bị lọc ra ngoài, và máy tưởng khách đó "hôm nay không
    // phát sinh doanh thu" — sai hoàn toàn.
    const { tailieu } = dungTrang({ tuKhoa: 'Trang Bé' });
    const kq = await EpHomNay.epVeHomNay(tailieu, nhanh);
    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.strictEqual(tailieu.getElementById('searchKhachHang').value, '');
    const dong = globalThis.HDT_DocBang.docCacDong(tailieu.getElementById('tableKhachHang'));
    assert.ok(dong.some(d => d.maKH === 'PA'), 'khách vẫn bị chữ tìm kiếm cũ lọc mất');
});

test('⭐ nâng số bản ghi lên 100 — khách ở trang 2 không bị bỏ sót', async () => {
    // Trang thật mặc định 20 dòng/trang. Khách thứ 21 trở đi không có trên màn
    // hình, và máy sẽ tưởng họ không phát sinh doanh thu.
    const nhieu = Array.from({ length: 30 }, (_, i) => ({
        id: i + 1, ma: 'K' + i, ten: 'Khách ' + i, soDon: 1,
        doanhThu: 100000 + i, giaVon: 1, loiNhuan: 1, tyLe: 1,
    }));
    const { tailieu } = dungTrang({ theoLoai: { hom_nay: nhieu, thang_nay: [] } });
    await EpHomNay.epVeHomNay(tailieu, nhanh);
    assert.strictEqual(tailieu.getElementById('soBanGhiSelect').value, '100');
    const dong = globalThis.HDT_DocBang.docCacDong(tailieu.getElementById('tableKhachHang'));
    assert.strictEqual(dong.length, 30, `chỉ thấy ${dong.length} khách — mất khách trang 2`);
});

ghiChu('— ⛔ Kiểm chứng, không phải tin tưởng —');

test('⭐ API trả TRỄ → chờ được, không đọc bảng cũ của tháng', async () => {
    const { tailieu } = dungTrang({ treMs: 120 });
    const kq = await EpHomNay.epVeHomNay(tailieu, nhanh);
    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.deepStrictEqual(kq.ngay, { tu: HOM_NAY, den: HOM_NAY });
});

test('⛔ trang KHÔNG chịu về hôm nay → báo lỗi, KHÔNG cho đọc số', async () => {
    // Ép giữ nguyên "thang_nay" dù ai đặt gì.
    const { tailieu, cua } = dungTrang();
    const o = tailieu.getElementById('filterLoai');
    new cua.MutationObserver(() => {}).observe(o, { attributes: true });
    Object.defineProperty(o, 'value', { get: () => 'thang_nay', set: () => {} });

    const kq = await EpHomNay.epVeHomNay(tailieu, { ...nhanh, hanMs: 120 });
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ma, EpHomNay.MA.KHONG_VE_DUOC_HOM_NAY);
    assert.match(kq.thongBao, /không phải hôm nay/);
    assert.match(kq.thongBao, /không tạo hóa đơn nào/);
});

test('⛔ chưa tải lần nào (dòng ngày là "--") → KHÔNG kết luận gì', async () => {
    const { tailieu } = dungTrang();
    tailieu.getElementById('nutXemBaoCao').remove();
    tailieu.getElementById('soBanGhiSelect').remove();
    const kq = await EpHomNay.epVeHomNay(tailieu, { ...nhanh, hanMs: 60 });
    assert.strictEqual(kq.ok, false);
    assert.match(kq.thongBao, /KHÔNG đọc số/);
});

test('⛔ mất hẳn bộ lọc (Sell đổi giao diện) → dừng, nói rõ nghi ngờ', async () => {
    const { tailieu } = dungTrang();
    tailieu.getElementById('filterLoai').remove();
    const kq = await EpHomNay.epVeHomNay(tailieu, nhanh);
    assert.strictEqual(kq.ma, EpHomNay.MA.KHONG_THAY_BO_LOC);
    assert.match(kq.thongBao, /đổi giao diện/);
});

test('⭐ hai đầu ngày KHÁC NHAU → coi là chưa đúng, dù có chứa hôm nay', async () => {
    // "Từ 01/08 đến hôm nay" vẫn là cả tháng. Phải bằng nhau mới là một ngày.
    const bo = { tuHien: { textContent: '01/08/2026' }, denHien: { textContent: HOM_NAY } };
    const k = EpHomNay.docKhoangDangHien(bo);
    assert.deepStrictEqual(k, { tu: '01/08/2026', den: HOM_NAY });
    assert.notStrictEqual(k.tu, k.den);
});

test('⭐ nút "Xem báo cáo" nhận theo CHỮ, không bấm bừa nút khác', () => {
    // Trang thật gắn hành vi bằng onclick trong HTML nên nút KHÔNG có id. Nhận
    // theo vị trí là có ngày bấm nhầm nút khác trên trang của người dùng.
    const { tailieu } = dungTrang();
    const lac = tailieu.createElement('button');
    lac.textContent = 'Xóa tất cả';
    tailieu.body.insertBefore(lac, tailieu.body.firstChild);
    const nut = EpHomNay.timNutXemBaoCao(tailieu);
    assert.ok(nut, 'không tìm ra nút Xem báo cáo');
    assert.notStrictEqual(nut, lac, 'bấm nhầm nút khác');
    assert.match(nut.textContent, /Xem báo cáo/);
});

ghiChu('— Cú bấm rơi vào lúc đang tải thì bị NUỐT —');

test('⭐ trang đang tải dở → chờ xong rồi mới bấm, không mất cú bấm', async () => {
    const { tailieu, sell } = dungTrang({ treMs: 80 });
    sell.loadBaoCao();                     // đang tải khoảng cũ
    const kq = await EpHomNay.epVeHomNay(tailieu, nhanh);
    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.deepStrictEqual(kq.ngay, { tu: HOM_NAY, den: HOM_NAY });
});

ghiChu('— Nối vào trang Sell —');

test('⭐ tin hdt-doc-bang KHÔNG ép ngày → trả thẳng, tinCay theo yêu cầu', async () => {
    const { cua, tailieu, sell } = dungTrang();
    sell.loadBaoCao();
    await doiMotNhip();
    ChenCot.ganTaiNgheDocBang(tailieu);
    let tra = null;
    cua.__tai({ loai: 'hdt-doc-bang' }, null, (t) => { tra = t; });
    await doiMotNhip();
    assert.strictEqual(tra.ok, true);
    assert.ok(tra.dong.length >= 1);
});

test('⭐ tin hdt-doc-bang CÓ ép ngày → trả kèm ngày đã kiểm chứng', async () => {
    const { cua, tailieu } = dungTrang();
    ChenCot.ganTaiNgheDocBang(tailieu);
    let tra = null;
    cua.__tai({ loai: 'hdt-doc-bang', epHomNay: true }, null, (t) => { tra = t; });
    for (let i = 0; i < 60 && !tra; i++) await new Promise(r => setTimeout(r, 10));
    assert.ok(tra, 'không trả lời');
    assert.strictEqual(tra.ok, true, tra.thongBao);
    assert.strictEqual(tra.tinCay, true);
    assert.deepStrictEqual(tra.ngay, { tu: HOM_NAY, den: HOM_NAY });
    assert.strictEqual(tra.dong.find(d => d.maKH === 'PA').doanhThu, 1200000);
});

test('⛔ ép ngày thất bại → tinCay=false và KHÔNG kèm dòng nào', async () => {
    const { cua, tailieu } = dungTrang();
    tailieu.getElementById('filterLoai').remove();
    ChenCot.ganTaiNgheDocBang(tailieu);
    let tra = null;
    cua.__tai({ loai: 'hdt-doc-bang', epHomNay: true }, null, (t) => { tra = t; });
    for (let i = 0; i < 60 && !tra; i++) await new Promise(r => setTimeout(r, 10));
    assert.strictEqual(tra.ok, false);
    assert.strictEqual(tra.tinCay, false);
    assert.deepStrictEqual(tra.dong, []);
});

ghiChu('— Chạy tay: nói rõ số liệu lấy từ khoảng nào —');

test('⭐ modal nói rõ đang lấy số của MỘT NGÀY nào', async () => {
    const { tailieu, sell } = dungTrang();
    tailieu.getElementById('filterLoai').value = 'hom_nay';
    sell.loadBaoCao();
    await doiMotNhip();
    const bang = tailieu.getElementById('tableKhachHang');
    ChenCot.chenVao(bang);
    ChenCot.moModal(bang, [{ maKH: 'PA', tenKH: 'Phương Anh', doanhThu: 1200000 }]);
    const o = tailieu.getElementById('hdt-khoang-ngay');
    assert.ok(o, 'modal không nói số liệu lấy từ khoảng nào');
    assert.match(o.textContent, /NGÀY/);
    assert.match(o.textContent, new RegExp(HOM_NAY.replace(/\//g, '\\/')));
});

test('⭐ đang ở khoảng NHIỀU NGÀY → modal cảnh báo, không im lặng', async () => {
    const { tailieu, sell } = dungTrang();
    sell.loadBaoCao();               // thang_nay
    await doiMotNhip();
    const bang = tailieu.getElementById('tableKhachHang');
    ChenCot.chenVao(bang);
    ChenCot.moModal(bang, [{ maKH: 'PA', tenKH: 'Phương Anh', doanhThu: 134040000 }]);
    const o = tailieu.getElementById('hdt-khoang-ngay');
    assert.match(o.textContent, /KHÔNG phải một ngày/);
});

ghiChu('— Nối dây —');

const doc = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('⭐ hẹn giờ PHẢI đòi ép hôm nay, không đọc bảng thô', () => {
    const ma = doc('background.js');
    const than = ma.slice(ma.indexOf('async function chayTheoHen'));
    assert.match(than, /epHomNay:\s*true/, 'hẹn giờ đọc bảng mà không ép về hôm nay');
});

test('⭐ bảng không tin cậy → nền KHÔNG kết luận khách nào cả', () => {
    const ma = doc('background.js');
    const than = ma.slice(ma.indexOf('async function chayTheoHen'));
    const iTin = than.indexOf('tinCay');
    const iGhep = than.indexOf('ghepVoiBang');
    assert.ok(iTin > 0 && iTin < iGhep, 'ghép khách trước khi kiểm bảng có tin cậy không');
});

test('epHomNay.js được manifest nạp vào trang Sell', () => {
    const mf = JSON.parse(doc('manifest.json'));
    const cs = mf.content_scripts.find(c => c.matches.some(m => m.includes('bao-cao-khach-hang')));
    assert.ok(cs.js.includes('sell/epHomNay.js'), 'không nạp thì ép ngày không chạy');
    // Phải nạp TRƯỚC chenCot.js, vì chenCot gọi sang nó.
    assert.ok(cs.js.indexOf('sell/epHomNay.js') < cs.js.indexOf('sell/chenCot.js'));
});

chay('ÉP BẢNG BÁO CÁO VỀ ĐÚNG HÔM NAY');
