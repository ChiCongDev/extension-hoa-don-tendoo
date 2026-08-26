'use strict';

// TÁCH CỘT "TIỀN XUẤT HÓA ĐƠN" LÀM BA — chủ dự án chốt 25/08/2026.
//
//   · tự chọn       — extension xuất theo SỐ TIỀN NGƯỜI DÙNG ĐẶT ở ô "tiền/ngày"
//   · theo hệ thống — xuất theo doanh thu (nếp cũ), VÀ mọi dòng nhập tay
//   · tổng          — luôn bằng hai cột kia cộng lại, không bao giờ sửa thẳng
//
// ⚠️ CHUỖI DÂY DÀI, ĐỨT KHÚC NÀO CŨNG IM LẶNG: apDungSoDat → taoLenh → (lệnh)
// → hai đường đẩy về Sell. Không mắt xích nào tự kêu lên khi mất dấu — tờ hóa
// đơn chỉ lặng lẽ rơi sang cột bên cạnh. Nên test bám TỪNG mắt một, chứ không
// chỉ bám hai đầu.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { test, ghiChu, chay } = require('./chay');
const Day = require('../chung/dayVeSell');
const LS = require('../chung/lichSuChay');
const ApDung = require('../chung/apDungSoDat');
const SoGhiDau = require('../chung/soGhiDau');

const GOC = path.join(__dirname, '..');
const doc = (f) => fs.readFileSync(path.join(GOC, f), 'utf8');
const docSell = (f) => fs.readFileSync(path.join('D:/company-dev/Sell', f), 'utf8');

// Sổ ghi dấu giả lập: kho trong bộ nhớ, đủ để taoLenh chạy.
function taoSoTam() {
    let kho = {};
    return SoGhiDau.taoSo({
        doc: async () => kho,
        ghi: async (o) => { kho = { ...kho, ...o }; },
    });
}

ghiChu('── Mắt 1: apDungSoDat gắn soTienDat vào lệnh sắp chạy ──');

test('⭐ khách có đặt số thì lệnh mang theo soTienDat', () => {
    const r = ApDung.apDung({
        trongLich: [{ maKH: 'KH1', tenKH: 'Anh A', soTienNgay: 5000000 }],
        ghep: { chay: [], thieu: [] },
    });
    assert.strictEqual(r.chay.length, 1);
    assert.strictEqual(r.chay[0].soTienDat, 5000000,
        'lệnh không mang soTienDat — cả dây phía sau mất dấu ngay từ đây');
});

test('khách KHÔNG đặt số thì lệnh không có soTienDat', () => {
    const r = ApDung.apDung({
        trongLich: [{ maKH: 'KH1', tenKH: 'Anh A' }],
        ghep: { chay: [{ maKH: 'KH1', tenKH: 'Anh A', soTien: 300000 }], thieu: [] },
    });
    assert.ok(!Number(r.chay[0].soTienDat),
        'khách chạy theo doanh thu lại bị gắn số đặt — sẽ rơi nhầm cột "tự chọn"');
});

ghiChu('── Mắt 2: soGhiDau.taoLenh giữ lại soTienDat ──');

test('⭐ taoLenh ghi soTienDat vào lệnh', async () => {
    const so = taoSoTam();
    await so.nap();
    const l = await so.taoLenh({ maKH: 'KH1', tenKH: 'A', soTien: 5000000, soTienDat: 5000000 });
    assert.strictEqual(l.soTienDat, 5000000,
        'taoLenh nuốt mất soTienDat — đây là chỗ hẹp DUY NHẤT mọi lệnh đi qua');
});

test('không đặt số thì lệnh KHÔNG mọc thêm khoá soTienDat', async () => {
    const so = taoSoTam();
    await so.nap();
    const l = await so.taoLenh({ maKH: 'KH1', tenKH: 'A', soTien: 300000 });
    assert.ok(!('soTienDat' in l),
        'lệnh thường cũng mọc khoá mới — sổ cũ và sổ mới không còn giống nhau');
});

test('số đặt rác (0, âm, chữ) không lọt vào lệnh', async () => {
    const so = taoSoTam();
    await so.nap();
    for (const rac of [0, -5, 'nhiều', null, undefined, NaN]) {
        const l = await so.taoLenh({ maKH: 'KH1', tenKH: 'A', soTien: 300000, soTienDat: rac });
        assert.ok(!('soTienDat' in l), 'lọt số đặt rác: ' + String(rac));
    }
});

ghiChu('── Mắt 3: kieuXuatCua — một chỗ quyết định duy nhất ──');

test('⭐ có đặt số -> tu_chon, không đặt -> he_thong', () => {
    assert.strictEqual(Day.kieuXuatCua(5000000), 'tu_chon');
    assert.strictEqual(Day.kieuXuatCua(1), 'tu_chon');
    for (const rac of [0, -1, null, undefined, '', NaN, 'abc']) {
        assert.strictEqual(Day.kieuXuatCua(rac), 'he_thong', 'sai với: ' + String(rac));
    }
});

ghiChu('── Mắt 4: ĐƯỜNG GỬI NGAY (dongTuTienDo) ──');

const tienDoXong = (lenh) => ({
    loai: 'xong',
    lenh,
    ketQua: { daBamThanhToan: true, tong: lenh.soTien },
});

test('⭐ khách đặt số -> gói gửi mang kieu_xuat = tu_chon', () => {
    const d = Day.dongTuTienDo(
        tienDoXong({ id: 'L1', maKH: 'KH1', tenKH: 'A', soTien: 5000000, soTienDat: 5000000 }),
        '25/08/2026', 1787000000000);
    assert.ok(d, 'tin xong-mot-khach bị bỏ, không gửi gì');
    assert.strictEqual(d.kieu_xuat, 'tu_chon',
        'đường gửi ngay không nói kiểu — Sell mặc định he_thong và xếp nhầm cột');
});

test('khách thường -> he_thong', () => {
    const d = Day.dongTuTienDo(
        tienDoXong({ id: 'L1', maKH: 'KH1', tenKH: 'A', soTien: 300000 }),
        '25/08/2026', 1787000000000);
    assert.strictEqual(d.kieu_xuat, 'he_thong');
});

ghiChu('── Mắt 5: ĐƯỜNG GỬI LẠI CUỐI LOẠT (bản ghi lịch sử) ──');

const banGhi = (cacLenh) => LS.taoBanGhi({
    nguon: 'HEN_GIO', moc: '21:00', luc: 1787000000000, chay: true,
    ngay: { tu: '25/08/2026', den: '25/08/2026' },
    trongLich: cacLenh.map((l) => ({ maKH: l.maKH, tenKH: l.tenKH })),
    ketQua: {
        xong: cacLenh.map((l) => ({ ...l, ketQua: { daBamThanhToan: true, tong: l.soTien } })),
        loi: [], treo: [],
    },
});

test('⭐ bản ghi lịch sử giữ soTienDat', () => {
    const bg = banGhi([{ id: 'L1', maKH: 'KH1', tenKH: 'A', soTien: 5000000, soTienDat: 5000000 }]);
    assert.strictEqual(bg.khach[0].soTienDat, 5000000,
        'bản ghi đánh rơi số đặt — đường gửi lại cuối loạt không còn nguồn nào để biết');
});

test('⭐ gói dựng từ bản ghi mang kieu_xuat = tu_chon', () => {
    const g = Day.goiTuBanGhi(banGhi(
        [{ id: 'L1', maKH: 'KH1', tenKH: 'A', soTien: 5000000, soTienDat: 5000000 }]));
    assert.strictEqual(g.length, 1);
    assert.strictEqual(g[0].kieu_xuat, 'tu_chon');
});

test('khách thường qua bản ghi -> he_thong', () => {
    const g = Day.goiTuBanGhi(banGhi([{ id: 'L1', maKH: 'KH1', tenKH: 'A', soTien: 300000 }]));
    assert.strictEqual(g[0].kieu_xuat, 'he_thong');
});

test('⭐ lỗi và treo cũng nằm đúng cột — kiểu bám SỐ ĐẶT, không bám kết quả', () => {
    const l = { id: 'L1', maKH: 'KH1', tenKH: 'A', soTien: 5000000, soTienDat: 5000000 };
    const bg = LS.taoBanGhi({
        nguon: 'HEN_GIO', moc: '21:00', luc: 1787000000000, chay: true,
        ngay: { tu: '25/08/2026', den: '25/08/2026' },
        trongLich: [{ maKH: 'KH1', tenKH: 'A' }],
        ketQua: { xong: [], loi: [{ ...l, maLoi: 'X', thongBao: 'hỏng' }], treo: [] },
    });
    assert.strictEqual(Day.goiTuBanGhi(bg)[0].kieu_xuat, 'tu_chon');

    const bg2 = LS.taoBanGhi({
        nguon: 'HEN_GIO', moc: '21:00', luc: 1787000000000, chay: true,
        ngay: { tu: '25/08/2026', den: '25/08/2026' },
        trongLich: [{ maKH: 'KH1', tenKH: 'A' }],
        ketQua: { xong: [], loi: [], treo: [{ ...l, thongBao: 'treo' }] },
    });
    assert.strictEqual(Day.goiTuBanGhi(bg2)[0].kieu_xuat, 'tu_chon');
});

test('⭐⭐ HAI ĐƯỜNG GỬI PHẢI NÓI CÙNG MỘT KIỂU cho cùng một khách', () => {
    // Hai đường dùng CÙNG mã chống trùng, nên dòng sau ĐÈ dòng trước. Nói hai
    // kiểu khác nhau là con số nhảy cột tùy đường nào tới sau — không ai đoán ra.
    for (const dat of [0, 5000000]) {
        const l = {
            id: 'L1', maKH: 'KH1', tenKH: 'A', soTien: dat || 300000,
            ...(dat ? { soTienDat: dat } : {}),
        };
        const a = Day.dongTuTienDo(tienDoXong(l), '25/08/2026', 1787000000000);
        const b = Day.goiTuBanGhi(banGhi([l]))[0];
        assert.strictEqual(a.kieu_xuat, b.kieu_xuat, 'hai đường lệch nhau khi đặt = ' + dat);
        assert.strictEqual(a.ma_lenh, b.ma_lenh, 'mã chống trùng lệch — thành hai dòng riêng');
    }
});

ghiChu('── Nối dây: chạy TAY vẫn là "theo hệ thống" (chủ dự án chốt câu 1) ──');

test('đường chạy tay không gắn số đặt', () => {
    const nen = doc('background.js');
    const than = nen.slice(nen.indexOf('LOAI_TIN.TAO_HOA_DON'));
    assert.ok(!/soTienDat/.test(than.slice(0, 1500)),
        'đường chạy tay lại gắn số đặt — chủ dự án chốt mọi dòng tay vào "theo hệ thống"');
});

ghiChu('── Phía Sell: máy chủ ──');

const CTRL = 'app/Http/Controllers/KeToanTongHopController.php';

test('⭐ cột kieu_xuat có thật, mặc định he_thong, CHỈ THÊM không sửa', () => {
    const m = docSell('database/migrations/2026_08_25_000001_them_kieu_xuat_vao_ke_toan_hoa_don.php');
    assert.match(m, /string\('kieu_xuat', 16\)->default\('he_thong'\)/);
    assert.ok(!/dropColumn\('so_tien'\)|->change\(\)/.test(m),
        'nhà di trú đụng vào cột cũ — số kế toán đang có thể đổi');
});

test('⭐ máy chủ chỉ nhận đúng hai giá trị, rác thì lùi về he_thong', () => {
    const c = docSell('app/Http/Controllers/ExtensionHoaDonController.php');
    assert.match(c, /docKieuXuat/);
    assert.match(c, /'tu_chon' \? 'tu_chon' : 'he_thong'/,
        'không có cửa lọc — extension gửi rác là ghi thẳng rác vào sổ');
});

test('⭐⭐ TỔNG luôn cộng từ hai cột con, không tính riêng', () => {
    const c = docSell(CTRL);
    assert.match(c, /\$mXhd = \$mTuChon \+ \$mHeThong;/,
        'cột tổng tính bằng đường khác — sớm muộn tổng ≠ hai cột cộng lại');
});

test('phép gộp có kieu_xuat trong cả select lẫn group', () => {
    const c = docSell(CTRL);
    const than = c.slice(c.indexOf('function xhdTheoNgay')).slice(0, 1600);
    assert.match(than, /selectRaw\([^)]*kieu_xuat/);
    assert.match(than, /groupBy\('ngay', 'khach_hang_id', 'kieu_xuat'\)/,
        'gộp thiếu kieu_xuat — hai kiểu bị trộn làm một, tách cột thành vô nghĩa');
});

test('⭐ sửa tay: mỗi kiểu MỘT dòng riêng, không đè lên nhau', () => {
    const c = docSell(CTRL);
    const than = c.slice(c.indexOf('function apiLuuXhdTay')).slice(0, 3000);
    assert.match(than, /->where\('kieu_xuat', \$kieu\)/,
        'tìm dòng tay không lọc theo kiểu — sửa ô này ghi đè ô kia');
    assert.match(than, /'kieu_xuat' => \$kieu/);
});

test('API chi tiết ô trả về kieu_xuat', () => {
    const c = docSell(CTRL);
    const than = c.slice(c.indexOf('function apiChiTietO')).slice(0, 1800);
    assert.match(than, /'kieu_xuat' =>/,
        'ô sửa tay không biết dòng nào của kiểu nào — điền sẵn số của cột bên cạnh');
});

ghiChu('── Phía Sell: giao diện ──');

const VIEW = 'resources/views/keToan/tongHop.blade.php';

test('⭐ bảng tổng hợp có đủ BA cột', () => {
    const v = docSell(VIEW);
    assert.match(v, />Tiền xuất hóa đơn tự chọn</);
    assert.match(v, />Tiền xuất hóa đơn theo hệ thống</);
    assert.match(v, />Tiền xuất hóa đơn</);
});

test('⭐ số cột tiêu đề và số ô mỗi dòng KHỚP NHAU', () => {
    const v = docSell(VIEW);
    const dau = v.indexOf('id="ktBang"');
    const soTh = (v.slice(dau, v.indexOf('</thead>', dau)).match(/<th /g) || []).length;
    const dong = v.slice(v.indexOf('return `<tr class="hover:bg-gray-50 cursor-pointer"'));
    const doan = dong.slice(0, dong.indexOf('</tr>'));
    // ${oMa} và ${oTv} là hai ô dựng sẵn ở trên, không đếm được bằng "<td ".
    const soTd = (doan.match(/<td /g) || []).length + 2;
    assert.strictEqual(soTd, soTh, `lệch cột: ${soTh} tiêu đề nhưng ${soTd} ô`);
});

test('⭐ hàng TỔNG cũng đủ cột (colspan tính vào)', () => {
    const v = docSell(VIEW);
    const dau = v.indexOf('id="ktBang"');
    const soTh = (v.slice(dau, v.indexOf('</thead>', dau)).match(/<th /g) || []).length;
    const t = v.slice(v.indexOf("$('ktHangTong').innerHTML"));
    const than = t.slice(0, t.indexOf('`;'));
    const soTd = (than.match(/<td /g) || []).length + 1;   // colspan="2" ăn 2 cột
    assert.strictEqual(soTd, soTh, `hàng TỔNG lệch: ${soTh} tiêu đề, ${soTd} ô`);
});

test('⭐ bảng theo ngày cũng khớp cột', () => {
    const v = docSell(VIEW);
    const dau = v.indexOf('id="ktBangNgay"');
    const soTh = (v.slice(dau, v.indexOf('</thead>', dau)).match(/<th /g) || []).length;
    const t = v.slice(v.indexOf("$('ktHangTongNgay').innerHTML"));
    const soTd = (t.slice(0, t.indexOf('`;')).match(/<td /g) || []).length;
    assert.strictEqual(soTd, soTh, `bảng theo ngày lệch: ${soTh} tiêu đề, ${soTd} ô TỔNG`);
});

test('⭐ bảng theo ngày: hai ô XHD bấm được, ô tổng thì KHÔNG', () => {
    const v = docSell(VIEW);
    assert.match(v, /data-cot="xhdtuchon"/);
    assert.match(v, /data-cot="xhdhethong"/);
    assert.ok(!/data-cot="xhd"/.test(v),
        'ô TỔNG vẫn bấm sửa được — sửa vào đó thì không biết ghi vào kiểu nào');
});

test('⭐⭐ ô sửa tay gửi kèm kieu_xuat, lấy từ đúng cột vừa bấm', () => {
    const v = docSell(VIEW);
    const t = v.slice(v.indexOf('async function luuXhdTay'));
    assert.match(t.slice(0, 900), /kieu_xuat: kieuCuaCot\(oDangMo\.cot\)/,
        'không gửi kiểu — mọi lần sửa tay đều rơi vào cột "theo hệ thống"');
});

test('⭐ điền sẵn phải lọc theo kiểu đang mở', () => {
    const v = docSell(VIEW);
    assert.match(v, /\(x\.kieu_xuat \|\| 'he_thong'\) === kieuMo/,
        'điền sẵn lấy bừa dòng tay đầu tiên — bấm Lưu là chép số sang cột sai');
});

test('khối nhập mở cho CẢ HAI cột XHD', () => {
    const v = docSell(VIEW);
    assert.match(v, /const laCotXhd = \(cot\) => cot === 'xhdtuchon' \|\| cot === 'xhdhethong';/);
    assert.match(v, /\$\('ktXhdKhoi'\)\.classList\.toggle\('hidden', !xhd\)/,
        'bấm ô XHD mà khối nhập vẫn ẩn — mất hẳn đường sửa tay');
});

test('nhãn nói rõ đang sửa cột nào', () => {
    const v = docSell(VIEW);
    assert.match(v, /ktXhdNhan/);
    assert.match(v, /xhdtuchon: 'XHD tự chọn'/);
    assert.match(v, /xhdhethong: 'XHD theo hệ thống'/);
});

test('CSV bám đúng bảng đang hiện — số ô khớp số tiêu đề', () => {
    const v = docSell(VIEW);
    const than = v.slice(v.indexOf('function xuatCsv')).slice(0, 1800);
    assert.match(than, /'tiền xuất hóa đơn tự chọn', 'tiền xuất hóa đơn theo hệ thống'/);
    const tieuDe = than.slice(than.indexOf('const hang = [['), than.indexOf(']];'));
    const soTieuDe = (tieuDe.match(/'/g) || []).length / 2;
    // ⚠️ Tệp Sell dùng CRLF — bám /\n/ là đếm ra 0 rồi test xanh/đỏ vì lý do sai.
    const doanDay = than.slice(
        than.indexOf('hang.push([') + 'hang.push(['.length, than.indexOf(']);'));
    const soO = doanDay.split(/\r?\n/).map((t) => t.trim())
        .filter((t) => t && !t.startsWith('//')).length;
    assert.strictEqual(soO, soTieuDe, `CSV lệch: ${soTieuDe} tiêu đề, ${soO} ô`);
});

ghiChu('── Không phá nếp cũ ──');

test('⭐ phiên bản KHÔNG tụt về trước bản mang tính năng này', () => {
    // ⚠️ KHÔNG so BẰNG một con số. Bản 2.33.0 là bản đầu tiên có tách cột; mọi
    // bản sau đều phải lớn hơn. So bằng thì lần tăng phiên bản kế tiếp là test
    // này đỏ vì một lý do chẳng liên quan gì tới việc tách cột.
    const so = (v) => String(v).split('.').map(Number);
    const [a, b, c] = so(JSON.parse(doc('manifest.json')).version);
    const [x, y, z] = so('2.33.0');
    const lon = a !== x ? a > x : (b !== y ? b > y : c >= z);
    assert.ok(lon, 'phiên bản tụt về trước 2.33.0 — bản đó chưa có tách cột');
});

test('cột "chưa xuất hóa đơn" KHÔNG đổi nghĩa', () => {
    const c = docSell(CTRL);
    assert.ok(!/chua_xuat[^\n]*TuChon|chua_xuat[^\n]*HeThong/.test(c),
        '"chưa xuất hóa đơn" bị nối vào một kiểu — số của cả trang đổi nghĩa');
});

chay('TÁCH CỘT XUẤT HÓA ĐƠN LÀM BA');
