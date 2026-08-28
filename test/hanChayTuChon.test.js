'use strict';

// ============================================================================
//  HẠN CHẠY CỦA LƯỢT "TIỀN/NGÀY" — chủ dự án chốt 27/08/2026.
//
//  Ô "số ngày" cạnh ô giờ tiền/ngày: chạy trong N NGÀY LỊCH kể từ lúc lưu (tính
//  cả hôm lưu), hết thì tự ngừng.
//
//  ── BA QUYẾT ĐỊNH ĐÃ CHỐT, VÀ VÌ SAO ─────────────────────────────────────
//  1. Đếm theo NGÀY LỊCH, không theo số lần xuất được. Máy tắt hôm nào thì hôm
//     đó vẫn tiêu. Đổi lại: chỉ cần lưu HAI CON SỐ ĐỨNG YÊN (số ngày + ngày bắt
//     đầu) và tính lại mỗi lần — không có số đếm lùi nào để hỏng khi Chrome
//     giết tiến trình nền giữa chừng.
//  2. Hết hạn thì NGỪNG CHẠY nhưng KHÔNG tự gạt ô tích. Tiến trình nền không tự
//     sửa cài đặt của người dùng.
//  3. Báo Telegram ở LƯỢT CHẠY CUỐI ("từ mai không xuất nữa"), không phải hôm
//     sau — hôm sau mốc ấy không còn báo thức nào để đánh thức máy dậy mà nhắn.
//
//  ⚠️ CÁI BẪY ĐẮT NHẤT: gia hạn ngầm. Nếu mốc bắt đầu nhảy về hôm nay mỗi lần
//  bấm Lưu thì hạn "7 ngày" chạy MÃI MÃI — người dùng sửa giờ của khách khác,
//  bấm Lưu, thế là gia hạn cả bảng mà không ai hay.
// ============================================================================

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require(process.env.HDT_JSDOM || 'jsdom');
const { test, ghiChu, chay, doiMotNhip } = require('./chay');
const { taoTrang } = require('./trangGiaLap');
globalThis.__HDT_KHONG_TU_CHAY__ = true;
require('../chung/ghepTien');
require('../chung/caiDat');
require('../chung/henGio');
require('../chung/lichSuChay');
require('../sell/docBang');
require('../sell/oKhaiBao');
const ChenCot = require('../sell/chenCot');
const HenGio = require('../chung/henGio');
const CaiDat = require('../chung/caiDat');
const ApDung = require('../chung/apDungSoDat');
const Day = require('../chung/dayVeSell');
const Tg = require('../chung/baoTelegram');

const GOC = path.join(__dirname, '..');
const doc = (f) => fs.readFileSync(path.join(GOC, f), 'utf8');

const lich = (khach, cu = null) => CaiDat.gop(
    cu, { henGio: { bat: true, moc: ['09:00'], khach } }, HenGio).henGio;

const khachTuChon = (them = {}) => ({
    maKH: 'A', tenKH: 'ki?n', soTienNgay: '5000000', mocTien: '15:40',
    batHeThong: false, batTuChon: true, ...them,
});

ghiChu('── Ô "số ngày": nhận gì, bỏ gì ──');

test('⭐ số ngày hợp lệ thì giữ', () => {
    assert.strictEqual(CaiDat.chuanSoNgay('7'), 7);
    assert.strictEqual(CaiDat.chuanSoNgay(' 30 '), 30);
    assert.strictEqual(CaiDat.chuanSoNgay(1), 1);
});

test('⭐ để trống = CHẠY MÃI, không tự đặt hạn cho ai', () => {
    // Tự đặt hạn cho khách đang chạy là tự ý dừng hóa đơn của người ta.
    for (const v of ['', null, undefined, '  ']) {
        assert.strictEqual(CaiDat.chuanSoNgay(v), null, 'sai với: ' + JSON.stringify(v));
    }
});

test('⭐ rác bị bỏ hẳn: 0, âm, chữ, số lẻ', () => {
    for (const v of ['0', '-3', 'bảy', '7 ngày', '3.5', '1.000']) {
        assert.strictEqual(CaiDat.chuanSoNgay(v), null, 'lọt rác: ' + v);
    }
});

test('⭐ trần 3650 ngày — gõ thừa số 0 không thành cái hạn không bao giờ tới', () => {
    assert.strictEqual(CaiDat.chuanSoNgay('3650'), 3650);
    assert.strictEqual(CaiDat.chuanSoNgay('36500'), null);
});

ghiChu('── Tính hạn: hai con số đứng yên, không số đếm lùi ──');

const ban = (soNgay, batDau) => ({ soNgayTuChon: soNgay, batDauTuChon: batDau });

test('⭐⭐ NGÀY BẮT ĐẦU TÍNH LUÔN: đặt 1 ngày = chỉ chạy đúng hôm đó', () => {
    const k = ban(1, '2026-08-27');
    assert.strictEqual(HenGio.ngayHetHanTuChon(k), '2026-08-27');
    assert.strictEqual(HenGio.hetHanTuChon(k, '2026-08-27'), false);
    assert.strictEqual(HenGio.hetHanTuChon(k, '2026-08-28'), true);
});

test('⭐ 7 ngày từ 27/08 -> ngày cuối 02/09', () => {
    assert.strictEqual(HenGio.ngayHetHanTuChon(ban(7, '2026-08-27')), '2026-09-02');
});

test('⭐ vắt qua cuối tháng và năm nhuận', () => {
    assert.strictEqual(HenGio.ngayHetHanTuChon(ban(3, '2026-12-30')), '2027-01-01');
    assert.strictEqual(HenGio.ngayHetHanTuChon(ban(2, '2028-02-28')), '2028-02-29');
});

test('⭐ thiếu một trong hai con số -> KHÔNG có hạn (chạy mãi)', () => {
    assert.strictEqual(HenGio.ngayHetHanTuChon(ban(7, '')), '');
    assert.strictEqual(HenGio.ngayHetHanTuChon(ban(null, '2026-08-27')), '');
    assert.strictEqual(HenGio.hetHanTuChon(ban(null, ''), '2099-01-01'), false,
        'thiếu số liệu mà lại coi là hết hạn -> khách ngừng ra hóa đơn vô cớ');
});

test('⭐ đếm ngược đúng số ngày còn lại', () => {
    const k = ban(3, '2026-08-27');
    assert.strictEqual(HenGio.soNgayConLai(k, '2026-08-27'), 3);
    assert.strictEqual(HenGio.soNgayConLai(k, '2026-08-29'), 1);
    assert.strictEqual(HenGio.soNgayConLai(k, '2026-08-30'), 0);
    assert.strictEqual(HenGio.soNgayConLai(ban(null, ''), '2026-08-27'), null);
});

test('⭐⭐ ngày tính theo GIỜ VIỆT NAM, không theo giờ máy', () => {
    // Máy đặt sai múi giờ hay đang ở nơi khác thì "hôm nay" lệch một ngày, và
    // lệch một ngày ở đây là xuất thừa hoặc thiếu một tờ hóa đơn thuế.
    const hg = doc('chung/henGio.js');
    assert.match(hg, /Asia\/Ho_Chi_Minh/, 'không ép múi giờ Việt Nam');
    const t = hg.slice(hg.indexOf('function ngayVN'));
    assert.match(t.slice(0, 500), /timeZone: MUI_GIO/,
        'ngayVN không dùng múi giờ đã khai');
    // 23:30 giờ Anh ngày 26/08 = 05:30 giờ VN ngày 27/08.
    assert.strictEqual(HenGio.ngayVN(Date.parse('2026-08-26T22:30:00Z')), '2026-08-27');
});

ghiChu('── KHÔNG ĐƯỢC GIA HẠN NGẦM ──');

test('⭐⭐⭐ lưu lại vì việc khác thì hạn GIỮ NGUYÊN, không đếm lại', () => {
    // Cái bẫy đắt nhất: mốc bắt đầu nhảy về hôm nay mỗi lần bấm Lưu -> hạn
    // "7 ngày" chạy mãi mãi mà không ai hay.
    const c1 = lich([khachTuChon({ soNgayTuChon: '7' })]);
    assert.match(c1.khach[0].batDauTuChon, /^\d{4}-\d{2}-\d{2}$/, 'không ghi mốc bắt đầu');
    // ⚠️ ĐẨY MỐC VỀ QUÁ KHỨ. Để nguyên hôm nay thì bài này KHÔNG PHÂN BIỆT
    // được: dù mã có đặt lại mốc thành hôm nay, kết quả vẫn y hệt mốc cũ.
    // Vòng gài lỗi bắt được đúng chỗ này.
    c1.khach[0].batDauTuChon = '2026-01-05';
    const bd = '2026-01-05';

    const c2 = CaiDat.gop({ henGio: c1 },
        { henGio: { bat: true, moc: ['09:00'],
                    khach: [khachTuChon({ soNgayTuChon: '7', mocTien: '16:00' })] } },
        HenGio);
    assert.strictEqual(c2.henGio.khach[0].batDauTuChon, bd,
        'đổi giờ rồi lưu -> hạn được gia hạn ngầm, chạy mãi mãi');
});

test('⭐⭐ ĐỔI SỐ NGÀY thì hạn đếm lại từ hôm nay', () => {
    const c1 = lich([khachTuChon({ soNgayTuChon: '7' })]);
    // Giả bộ mốc bắt đầu là tuần trước, rồi người dùng gõ số mới.
    c1.khach[0].batDauTuChon = '2026-01-01';
    const c2 = CaiDat.gop({ henGio: c1 },
        { henGio: { bat: true, moc: ['09:00'],
                    khach: [khachTuChon({ soNgayTuChon: '30' })] } },
        HenGio);
    assert.strictEqual(c2.henGio.khach[0].batDauTuChon, HenGio.ngayVN(),
        'gõ số ngày mới mà hạn vẫn đếm từ mốc cũ');
    assert.strictEqual(c2.henGio.khach[0].soNgayTuChon, 30);
});

test('⭐⭐ ĐỌC TỪ KHO không được đặt lại mốc bắt đầu', () => {
    // Khởi động lại Chrome mỗi ngày mà mốc nhảy về hôm nay thì y hệt gia hạn ngầm.
    globalThis.HDT_HenGio = HenGio;
    const c = CaiDat.tuKho({
        henGio: { bat: true, moc: ['09:00'], khach: [
            { ...khachTuChon(), soNgayTuChon: 7, batDauTuChon: '2026-01-01' },
        ] },
    });
    assert.strictEqual(c.henGio.khach[0].batDauTuChon, '2026-01-01',
        'đọc từ kho lại đặt lại mốc -> khởi động lại là gia hạn thêm 7 ngày');
});

test('tắt ô tích tự chọn thì không giữ hạn nữa', () => {
    const c = lich([khachTuChon({ soNgayTuChon: '7', batTuChon: false })]);
    assert.ok(!c.khach[0].soNgayTuChon);
    assert.ok(!c.khach[0].batDauTuChon);
});

ghiChu('── Tới hạn thì NGỪNG CHẠY, nhưng ô tích còn nguyên ──');

test('⭐⭐⭐ hết hạn -> KHÔNG còn mốc nào, không dựng báo thức', () => {
    const h = lich([khachTuChon({ soNgayTuChon: '3' })]);
    const het = HenGio.ngayHetHanTuChon(h.khach[0]);
    const sau = HenGio.congNgay(het, 1);
    assert.strictEqual(HenGio.khachCuaMoc(h, '15:40', het).length, 1, 'ngày cuối đã ngừng sớm');
    assert.strictEqual(HenGio.khachCuaMoc(h, '15:40', sau).length, 0,
        'quá hạn mà vẫn chạy — tiền cứ ra thêm mãi');
    assert.ok(!HenGio.gomTheoMoc(h, sau).some(o => o.moc === '15:40'),
        'vẫn dựng báo thức cho mốc đã hết hạn');
});

test('⭐⭐ hết hạn nhưng Ô TÍCH VẪN BẬT — nền không tự sửa cài đặt', () => {
    const h = lich([khachTuChon({ soNgayTuChon: '3' })]);
    const sau = HenGio.congNgay(HenGio.ngayHetHanTuChon(h.khach[0]), 1);
    assert.strictEqual(h.khach[0].batTuChon, true, 'ô tích bị gạt xuống');
    assert.strictEqual(HenGio.khachHetHanTuChon(h, sau).length, 1,
        'màn hình không có cách nào biết khách này đã hết hạn');
});

test('⭐ hết hạn tự chọn KHÔNG đụng tới lượt hệ thống', () => {
    const h = lich([khachTuChon({ soNgayTuChon: '3', batHeThong: true, moc: '15:00' })]);
    const sau = HenGio.congNgay(HenGio.ngayHetHanTuChon(h.khach[0]), 1);
    assert.deepStrictEqual(
        HenGio.khachCuaMoc(h, '15:00', sau).map(x => x.kieu), ['he_thong'],
        'hết hạn tiền/ngày mà lượt theo doanh thu cũng chết theo');
});

test('không đặt hạn thì chạy mãi', () => {
    const h = lich([khachTuChon()]);
    assert.strictEqual(HenGio.khachCuaMoc(h, '15:40', '2099-12-31').length, 1,
        'khách không đặt hạn mà vẫn bị dừng');
});

ghiChu('── Báo Telegram ở LƯỢT CUỐI ──');

// ⚠️ ĐI QUA `taoLenh` THẬT, KHÔNG TỰ DỰNG LỆNH.
//
// Bản đầu tôi viết `lenh: { ..., ngayCuoiTuChon: l.ngayCuoiTuChon }` — tức là
// TỰ TAY chép cờ vào lệnh rồi kiểm xem nó có ở đó không. Bài kiểm ấy chứng minh
// cái giả của chính nó: đường chạy thật đi qua `soGhiDau.taoLenh`, và hàm đó
// bóc từng trường một nên nó RƠI MẤT cờ. Kết quả: tin nhắn "ngày cuối" không
// bao giờ gửi được, mà 1702 bài kiểm vẫn xanh.
const SoGhiDau = require('../chung/soGhiDau');

async function dongCua(trongLich) {
    const r = ApDung.apDung({ trongLich, ghep: { chay: [], thieu: [] } });
    let kho = {};
    const so = SoGhiDau.taoSo({
        doc: async () => kho, ghi: async (o) => { kho = { ...kho, ...o }; },
    });
    await so.nap();
    // Đúng thứ hàng đợi làm: đưa NGUYÊN mục của lịch cho taoLenh.
    const lenh = await so.taoLenh(r.chay[0]);
    return Day.dongTuTienDo({
        loai: 'xong', lenh,
        ketQua: { daBamThanhToan: true, tong: lenh.soTien },
    }, '2026-08-29', Date.now());
}

test('⭐⭐⭐ ngày cuối: cờ đi TRỌN lịch -> taoLenh -> gói gửi -> tin nhắn', async () => {
    const h = lich([khachTuChon({ soNgayTuChon: '3' })]);
    const het = HenGio.ngayHetHanTuChon(h.khach[0]);
    const d = await dongCua(HenGio.khachCuaMoc(h, '15:40', het));
    assert.strictEqual(d.ngay_cuoi_tu_chon, true, 'gói gửi đi không mang cờ ngày cuối');
    assert.match(Tg.soanTin(d), /NGÀY CUỐI/, 'tin nhắn không báo gì — hôm sau im lặng dừng');
    assert.match(Tg.soanTin(d), /Từ mai/);
});

test('⭐ ngày thường thì KHÔNG nhắc gì', async () => {
    const h = lich([khachTuChon({ soNgayTuChon: '3' })]);
    const dau = h.khach[0].batDauTuChon;
    const d = await dongCua(HenGio.khachCuaMoc(h, '15:40', dau));
    assert.ok(!d.ngay_cuoi_tu_chon, 'ngày đầu đã báo "ngày cuối"');
    assert.ok(!/NGÀY CUỐI/.test(Tg.soanTin(d)), 'nhắc mỗi ngày -> người đọc bỏ qua');
});

test('⭐ khách KHÔNG đặt hạn thì không bao giờ nhắc', async () => {
    const h = lich([khachTuChon()]);
    const d = await dongCua(HenGio.khachCuaMoc(h, '15:40', '2099-12-31'));
    assert.ok(!d.ngay_cuoi_tu_chon);
});

ghiChu('── LỊCH KHÔNG ĐƯỢC TỰ TẮT khi khách chỉ có giờ tiền/ngày ──');

test('⭐⭐⭐ khách CHỈ có giờ tiền/ngày -> lịch VẪN BẬT', () => {
    // ⚠️ LỖI THẬT của bản 27/08: luật "lịch vô nghĩa thì tắt" chỉ đếm `k.moc`
    // (giờ của lượt hệ thống), không đếm `k.mocTien`. Khách chỉ đặt giờ
    // tiền/ngày mà không có giờ chung là bấm Lưu một cái LỊCH TỰ TẮT — không
    // chạy gì, không báo gì, chỉ biết khi tối ngồi đếm không thấy tờ nào.
    const c = CaiDat.gop(null, { henGio: { bat: true, moc: [''],
        khach: [khachTuChon()] } }, HenGio);
    assert.strictEqual(c.henGio.bat, true,
        'lịch tự tắt — khách chỉ chạy tiền/ngày thì không bao giờ ra hóa đơn');
    assert.deepStrictEqual(HenGio.gomTheoMoc(c.henGio).map(o => o.moc), ['15:40']);
});

test('⭐ thật sự không có giờ nào thì VẪN tắt (luật cũ còn nguyên)', () => {
    const c = CaiDat.gop(null, { henGio: { bat: true, moc: [''],
        khach: [{ maKH: 'B', tenKH: 'B', batHeThong: true, batTuChon: false }] } }, HenGio);
    assert.strictEqual(c.henGio.bat, false,
        'bật lịch mà không mốc nào -> người dùng tưởng máy sẽ chạy');
});

test('⭐ bật tiền/ngày mà QUÊN GIỜ thì không tính là có mốc', () => {
    const c = CaiDat.gop(null, { henGio: { bat: true, moc: [''],
        khach: [khachTuChon({ mocTien: '' })] } }, HenGio);
    assert.strictEqual(c.henGio.bat, false);
});

ghiChu('── Giao diện ──');

const CC = 'sell/chenCot.js';

test('⭐ có ô số ngày, và đường lưu gom nó', () => {
    const v = doc(CC);
    assert.match(v, /hdt-so-ngay/, 'không có ô số ngày — đúng thứ chủ dự án hỏi');
    const t = v.slice(v.indexOf('const dsKhachDaTick'));
    assert.match(t.slice(0, t.indexOf('capNhatGhiTran')),
        /if \(soNgay\) k2\.soNgayTuChon = soNgay;/,
        'gõ số ngày xong bấm Lưu là mất');
});

test('⭐⭐ CẢ HAI đường gửi đều mang cờ ngày cuối', () => {
    // Đường "gửi lại ở cuối loạt" là lưới an toàn khi loạt bị ngắt giữa chừng.
    // Nó đánh rơi cờ thì tin nhắn ngày cuối mất đúng vào lúc cần nhất.
    const bg = require('../chung/lichSuChay').taoBanGhi({
        nguon: 'HEN_GIO', moc: '15:40', luc: Date.now(), chay: true,
        ngay: { tu: '29/08/2026', den: '29/08/2026' },
        trongLich: [{ maKH: 'A', tenKH: 'ki?n' }],
        ketQua: {
            xong: [{ id: 'L1', maKH: 'A', tenKH: 'ki?n', soTien: 5000000,
                     soTienDat: 5000000, ngayCuoiTuChon: true,
                     ketQua: { daBamThanhToan: true, tong: 5000000 } }],
            loi: [], treo: [],
        },
    });
    assert.strictEqual(bg.khach[0].ngayCuoiTuChon, true,
        'bản ghi lịch sử đánh rơi cờ ngày cuối');
    assert.strictEqual(Day.goiTuBanGhi(bg)[0].ngay_cuoi_tu_chon, true,
        'đường gửi lại cuối loạt không báo ngày cuối');
});

test('⭐ MỌI nhánh kết quả đều mang cờ ngày cuối, không riêng nhánh xong', () => {
    // Ngày cuối mà lượt bị lỗi hay treo thì càng phải báo: người dùng cần biết
    // để đi kiểm Tendoo VÀ biết mai không còn lượt nào chạy lại nữa.
    const LS = require('../chung/lichSuChay');
    const l = { id: 'L1', maKH: 'A', tenKH: 'ki?n', soTien: 5000000,
                soTienDat: 5000000, ngayCuoiTuChon: true };
    for (const [ten, kq] of [
        ['lỗi', { xong: [], loi: [{ ...l, maLoi: 'X', thongBao: 'hỏng' }], treo: [] }],
        ['treo', { xong: [], loi: [], treo: [{ ...l, thongBao: 'treo' }] }],
    ]) {
        const bg = LS.taoBanGhi({
            nguon: 'HEN_GIO', moc: '15:40', luc: Date.now(), chay: true,
            ngay: { tu: '29/08/2026', den: '29/08/2026' },
            trongLich: [{ maKH: 'A', tenKH: 'ki?n' }], ketQua: kq,
        });
        assert.strictEqual(bg.khach[0].ngayCuoiTuChon, true, 'nhánh ' + ten + ' đánh rơi cờ');
        assert.strictEqual(Day.goiTuBanGhi(bg)[0].ngay_cuoi_tu_chon, true,
            'nhánh ' + ten + ': gói gửi đi không báo ngày cuối');
    }
});

// ⚠️ BA BÀI DƯỚI ĐÂY DỰNG BẢNG THẬT rồi bấm vào nó. Bản đầu tôi soi chữ trong
// mã nguồn, và vòng gài lỗi chứng minh vô dụng: đổi tên lớp CSS ở chỗ TẠO ô
// (giữ nguyên chỗ ĐỌC) là ô mất tác dụng mà test vẫn xanh.
function dungBang(caiDat, lichSu = []) {
    const dom = new JSDOM(taoTrang());
    const cua = dom.window;
    cua.chrome = {
        runtime: {
            sendMessage: async (tin) => {
                if (tin.loai === 'hdt-hoi-cai-dat') return caiDat;
                if (tin.loai === 'hdt-ket-qua-hen-gio') return { ok: true, sapToi: [] };
                if (tin.loai === 'hdt-dat-cai-dat') return { ok: true, ...caiDat };
                if (tin.loai === 'hdt-tinh-trang-san-sang') {
                    return { ok: true, muc: [], sanSang: true, chanBoi: [] };
                }
                if (tin.loai === 'hdt-lich-su-chay') return { ok: true, ds: lichSu };
                return null;
            },
            onMessage: { addListener: () => {} },
        },
    };
    return { cua, tailieu: cua.document,
             bang: cua.document.getElementById('tableKhachHang') };
}

async function moBang(khach, lichSu = []) {
    const t = dungBang({
        tuBam: true, daHieu: true,
        henGio: { bat: true, moc: ['09:00'], khach },
    }, lichSu);
    ChenCot.chenVao(t.bang);
    await ChenCot.moBangCaiDat(t.bang);
    await doiMotNhip();
    return t;
}

test('⭐⭐ BẤM THẬT: ô số ngày hiện lại giá trị đã lưu và chữ "còn N ngày"', async () => {
    const bd = HenGio.congNgay(HenGio.ngayVN(), -2);   // đã chạy 2 hôm rồi
    const { tailieu } = await moBang([
        { ...khachTuChon(), maKH: 'PA', soTienNgay: 5000000,
          soNgayTuChon: 5, batDauTuChon: bd },
    ]);
    const ds = tailieu.getElementById('hdt-hen-ds-khach');
    const o = ds.querySelector('input.hdt-so-ngay[data-ma="PA"]');
    assert.ok(o, 'không thấy ô số ngày của khách đã lưu');
    assert.strictEqual(o.value, '5', 'số ngày đã lưu không hiện lại — tưởng bị mất');
    const h = ds.querySelector('span.hdt-han[data-ma="PA"]');
    assert.match(h.textContent, /còn 3 ngày/,
        'không bày còn mấy ngày -> phải tự nhẩm từ hôm lưu: ' + h.textContent);
});

test('⭐⭐⭐ BẤM THẬT rồi LƯU: số ngày đi được tới tiến trình nền', async () => {
    // Bài duy nhất chứng minh cả sợi dây đã nối. Đổi tên lớp CSS ở ĐẦU NÀO cũng
    // làm bài này đỏ, dù chuỗi ấy còn nằm ở đầu kia.
    const daGui = [];
    const dom = new JSDOM(taoTrang());
    const cua = dom.window;
    cua.chrome = {
        runtime: {
            sendMessage: async (tin) => {
                daGui.push(tin);
                if (tin.loai === 'hdt-hoi-cai-dat') {
                    return { tuBam: true, daHieu: true,
                             henGio: { bat: true, moc: ['09:00'], khach: [] } };
                }
                if (tin.loai === 'hdt-ket-qua-hen-gio') return { ok: true, sapToi: [] };
                if (tin.loai === 'hdt-tinh-trang-san-sang') {
                    return { ok: true, muc: [], sanSang: true, chanBoi: [] };
                }
                if (tin.loai === 'hdt-lich-su-chay') return { ok: true, ds: [] };
                return { ok: true };
            },
            onMessage: { addListener: () => {} },
        },
    };
    const bang = cua.document.getElementById('tableKhachHang');
    ChenCot.chenVao(bang);
    await ChenCot.moBangCaiDat(bang);
    await doiMotNhip();

    const ds = cua.document.getElementById('hdt-hen-ds-khach');
    const o = ds.querySelector('input.hdt-tick-hen');
    const ma = o.dataset.ma;
    o.checked = true;
    ds.querySelector('input.hdt-bat-tc[data-ma="' + ma + '"]').checked = true;
    ds.querySelector('input.hdt-tien-ngay[data-ma="' + ma + '"]').value = '5000000';
    ds.querySelector('input.hdt-gio-tien[data-ma="' + ma + '"]').value = '15:40';
    ds.querySelector('input.hdt-so-ngay[data-ma="' + ma + '"]').value = '7';

    cua.document.getElementById('hdt-luu-cai-dat').click();
    await doiMotNhip();
    await doiMotNhip();

    const tin = daGui.filter(t => t.loai === 'hdt-dat-cai-dat').pop();
    assert.ok(tin, 'bấm Lưu mà không gửi gì đi');
    const k = ((tin.henGio || {}).khach || []).find(x => x.maKH === ma);
    assert.ok(k, 'khách vừa tích không có trong gói gửi đi');
    assert.strictEqual(String(k.soNgayTuChon), '7',
        'số ngày gõ xong bấm Lưu là mất — hạn không bao giờ có hiệu lực');
});

ghiChu('── XUẤT XONG HÔM NAY THÌ SỐ PHẢI GIẢM (chủ dự án chốt 27/08/2026) ──');

/**
 * Lịch sử "khách này hôm nay đã chạy lượt tiền/ngày" — DỰNG BẰNG MÃ THẬT.
 *
 * ⚠️ KHÔNG TỰ VIẾT TAY BẢN GHI. Bản đầu tôi gõ thẳng
 * `{ luc, khach: [{ maKH, soTienDat }] }` — tức là tự chế ra đúng hình mà hàm
 * đang kiểm mong đợi, rồi kiểm xem nó có nhận ra không. Bài kiểm ấy chứng minh
 * cái giả của chính nó: `taoBanGhi` đổi một tên trường là đường thật đứt mà test
 * vẫn xanh. Đã dính đúng bệnh đó ở `taoLenh` hôm nay.
 *
 * Nên đi qua ĐÚNG chuỗi thật: taoBanGhi -> themVao (thứ nằm trong kho) và đó
 * cũng chính là thứ `hdt-lich-su-chay` trả về nguyên si.
 */
const LSChay = require('../chung/lichSuChay');

function daChayHomNay(maKH, soTienDat = 5000000, ket = 'xong') {
    const l = { id: 'L1', maKH, tenKH: maKH, soTien: 5000000,
                ...(soTienDat ? { soTienDat } : {}) };
    const kq = ket === 'xong'
        ? { xong: [{ ...l, ketQua: { daBamThanhToan: true, tong: 5000000 } }], loi: [], treo: [] }
        : { xong: [], loi: [{ ...l, maLoi: 'X', thongBao: 'Tendoo hỏng' }], treo: [] };
    const bg = LSChay.taoBanGhi({
        nguon: 'HEN_GIO', moc: '15:40', luc: Date.now(), chay: true,
        ngay: { tu: '27/08/2026', den: '27/08/2026' },
        trongLich: [{ maKH, tenKH: maKH }], ketQua: kq,
    });
    return LSChay.themVao([], bg);
}

test('⭐⭐ so ngày trong LỊCH SỬ cũng phải theo GIỜ VIỆT NAM', () => {
    // ⚠️ Lượt chạy lúc 00:30 giờ VN ngày 27 là mốc UTC 17:30 ngày 26. Lấy ngày
    // theo UTC (hay theo giờ máy ở múi khác) là nó rơi sang hôm qua -> hôm nay
    // không trừ, con số đứng yên. Đúng bệnh chủ dự án phàn nàn, chỉ khác là chỉ
    // hiện ra với lượt chạy đêm.
    const bg = [{ luc: Date.parse('2026-08-26T17:30:00Z'),
                  khach: [{ maKH: 'PA', soTienDat: 5000000 }] }];
    assert.strictEqual(HenGio.daChayTuChonHomNay('PA', bg, '2026-08-27'), true,
        'lượt 00:30 giờ VN bị tính sang hôm qua');
    assert.strictEqual(HenGio.daChayTuChonHomNay('PA', bg, '2026-08-26'), false,
        'lượt của hôm nay lại bị tính cho hôm qua');
});

test('⭐⭐⭐ BẤM THẬT: xuất xong hôm nay -> "còn 3 ngày" thành "còn 2 ngày"', async () => {
    // ⚠️ ĐÂY LÀ ĐIỀU CHỦ DỰ ÁN HỎI. Trước đó con số đứng yên tới nửa đêm, nhìn
    // như máy không ghi nhận gì.
    const khach = [{ ...khachTuChon(), maKH: 'PA', soTienNgay: 5000000,
                     soNgayTuChon: 3, batDauTuChon: HenGio.ngayVN() }];
    const chua = await moBang(khach, []);
    assert.match(chua.tailieu.querySelector('span.hdt-han[data-ma="PA"]').textContent,
        /còn 3 ngày/, 'chưa chạy mà đã trừ');

    const roi = await moBang(khach, daChayHomNay('PA'));
    assert.match(roi.tailieu.querySelector('span.hdt-han[data-ma="PA"]').textContent,
        /còn 2 ngày/, 'xuất xong rồi mà con số vẫn đứng yên');
});

test('⭐⭐ ngày CUỐI xuất xong -> "xong hạn — mai dừng", không phải "hết hạn"', async () => {
    // Hai ca khác nhau: vừa chạy nốt ngày cuối (mai mới dừng) và đã quá hạn từ
    // trước. Gộp làm một là người dùng tưởng máy dừng sớm mất một ngày.
    const khach = [{ ...khachTuChon(), maKH: 'PA', soTienNgay: 5000000,
                     soNgayTuChon: 1, batDauTuChon: HenGio.ngayVN() }];
    const { tailieu } = await moBang(khach, daChayHomNay('PA'));
    const h = tailieu.querySelector('span.hdt-han[data-ma="PA"]');
    assert.match(h.textContent, /xong hạn/, 'lẫn với "hết hạn": ' + h.textContent);
    assert.ok(h.classList.contains('het'));
});

test('⭐ lượt HỆ THỐNG chạy hôm nay KHÔNG làm giảm hạn tiền/ngày', async () => {
    // Hai lịch tách rời. `soTienDat` là dấu duy nhất phân biệt hai lượt.
    const khach = [{ ...khachTuChon(), maKH: 'PA', soTienNgay: 5000000,
                     soNgayTuChon: 3, batDauTuChon: HenGio.ngayVN() }];
    const { tailieu } = await moBang(khach, daChayHomNay('PA', 0));
    assert.match(tailieu.querySelector('span.hdt-han[data-ma="PA"]').textContent,
        /còn 3 ngày/, 'lượt theo doanh thu lại ăn mất một ngày của hạn tiền/ngày');
});

test('⭐ khách KHÁC chạy hôm nay không đụng tới khách này', async () => {
    const khach = [{ ...khachTuChon(), maKH: 'PA', soTienNgay: 5000000,
                     soNgayTuChon: 3, batDauTuChon: HenGio.ngayVN() }];
    const { tailieu } = await moBang(khach, daChayHomNay('TB'));
    assert.match(tailieu.querySelector('span.hdt-han[data-ma="PA"]').textContent,
        /còn 3 ngày/);
});

test('⭐ lượt HÔM QUA không làm giảm hạn hôm nay', async () => {
    const homQua = daChayHomNay('PA');
    homQua[0].luc = Date.now() - 24 * 3600 * 1000;
    const khach = [{ ...khachTuChon(), maKH: 'PA', soTienNgay: 5000000,
                     soNgayTuChon: 3, batDauTuChon: HenGio.ngayVN() }];
    const { tailieu } = await moBang(khach, homQua);
    assert.match(tailieu.querySelector('span.hdt-han[data-ma="PA"]').textContent,
        /còn 3 ngày/, 'đếm nhầm lượt của hôm qua');
});

test('⭐⭐ lượt hôm nay bị LỖI vẫn TRỪ ngày (chủ dự án chốt)', async () => {
    // Lượt đã chạy là ngày đó tiêu, dù ra hóa đơn hay không: báo thức hôm nay
    // không kêu lại nữa, và ngày dừng đã tính sẵn nên không đổi.
    const loi = daChayHomNay('PA', 5000000, 'loi');
    const khach = [{ ...khachTuChon(), maKH: 'PA', soTienNgay: 5000000,
                     soNgayTuChon: 3, batDauTuChon: HenGio.ngayVN() }];
    const { tailieu } = await moBang(khach, loi);
    assert.match(tailieu.querySelector('span.hdt-han[data-ma="PA"]').textContent,
        /còn 2 ngày/, 'lượt hỏng không trừ -> con số lệch với ngày dừng');
});

test('⭐ gõ SỐ NGÀY MỚI thì không trừ hôm nay (hạn đếm lại từ đầu)', async () => {
    const khach = [{ ...khachTuChon(), maKH: 'PA', soTienNgay: 5000000,
                     soNgayTuChon: 3, batDauTuChon: HenGio.ngayVN() }];
    const { tailieu } = await moBang(khach, daChayHomNay('PA'));
    const ds = tailieu.getElementById('hdt-hen-ds-khach');
    const o = ds.querySelector('input.hdt-so-ngay[data-ma="PA"]');
    o.value = '10';
    o.dispatchEvent(new tailieu.defaultView.Event('input', { bubbles: true }));
    await doiMotNhip();
    assert.match(ds.querySelector('span.hdt-han[data-ma="PA"]').textContent,
        /còn 10 ngày/, 'gia hạn mới mà vẫn trừ ngày hôm nay đi');
});

test('⭐⭐ BẤM THẬT: hết hạn thì chữ ĐỎ "hết hạn"', async () => {
    const bd = HenGio.congNgay(HenGio.ngayVN(), -10);
    const { tailieu } = await moBang([
        { ...khachTuChon(), maKH: 'PA', soTienNgay: 5000000,
          soNgayTuChon: 3, batDauTuChon: bd },
    ]);
    const h = tailieu.querySelector('span.hdt-han[data-ma="PA"]');
    assert.strictEqual(h.textContent, 'hết hạn');
    assert.ok(h.classList.contains('het'),
        'bày bằng chữ xám — khách ngừng ra hóa đơn mà không ai để ý');
});

test('⭐⭐ BẤM THẬT: gõ số ngày mới thì chữ tính lại NGAY theo số mới', async () => {
    const bd = HenGio.congNgay(HenGio.ngayVN(), -10);
    const { tailieu } = await moBang([
        { ...khachTuChon(), maKH: 'PA', soTienNgay: 5000000,
          soNgayTuChon: 3, batDauTuChon: bd },
    ]);
    const ds = tailieu.getElementById('hdt-hen-ds-khach');
    const o = ds.querySelector('input.hdt-so-ngay[data-ma="PA"]');
    o.value = '9';
    o.dispatchEvent(new tailieu.defaultView.Event('input', { bubbles: true }));
    await doiMotNhip();
    const h = ds.querySelector('span.hdt-han[data-ma="PA"]');
    // Gõ số MỚI -> hạn đếm lại từ hôm nay, nên phải ra đúng 9 ngày, không phải
    // tính theo mốc cũ (đã quá hạn từ lâu).
    assert.match(h.textContent, /còn 9 ngày/,
        'gõ số mới mà chữ vẫn tính theo bản ghi cũ: ' + h.textContent);
    assert.ok(!h.classList.contains('het'), 'vẫn còn báo hết hạn sau khi gia hạn');
});

ghiChu('── Không phá nếp cũ ──');

test('⭐ khách không đặt hạn thì bản ghi KHÔNG mọc thêm khoá nào', () => {
    const c = lich([khachTuChon()]);
    assert.ok(!('soNgayTuChon' in c.khach[0]));
    assert.ok(!('batDauTuChon' in c.khach[0]));
});

test('⭐ phiên bản KHÔNG tụt về trước bản mang tính năng này', () => {
    const so = (v) => String(v).split('.').map(Number);
    const [a, b, c] = so(JSON.parse(doc('manifest.json')).version);
    // ⚠️ SÀN 2.37.0 chứ không phải 2.36.0. Bản 2.36.x có hạn chạy nhưng CHƯA có
    // phần trừ ngày sau khi xuất; để sàn cũ thì tụt về 2.36.1 vẫn xanh, mà bản
    // ấy đúng là bản chủ dự án đã phàn nàn.
    const [x, y, z] = so('2.37.0');
    assert.ok(a !== x ? a > x : (b !== y ? b > y : c >= z),
        'phiên bản tụt về trước 2.37.0 — bản đó chưa trừ ngày sau khi xuất');
});

chay('HẠN CHẠY CỦA LƯỢT TIỀN/NGÀY');
