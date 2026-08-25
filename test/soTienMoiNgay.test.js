'use strict';

// ============================================================================
//  TỰ ĐẶT SỐ TIỀN XUẤT MỖI NGÀY.
//
//  LUẬT HIỆN HÀNH — chủ dự án chốt 25/08/2026:
//    Điền số vào ô "tiền/ngày" thì mỗi ngày tới giờ máy xuất ĐÚNG con số ấy.
//    KHÔNG so với doanh số hôm nay, KHÔNG so với số dư chưa xuất hóa đơn,
//    KHÔNG so với bất cứ dữ liệu nào. Ô để trống = chạy đúng nếp cũ.
//
//  ── LỊCH SỬ, ĐỂ NGƯỜI ĐỌC SAU KHỎI TƯỞNG LÀ CHỐT BỊ QUÊN ───────────────────
//  Bản 24/08 có TRẦN: không bao giờ xuất quá "tiền chưa xuất hóa đơn" của
//  khách, đọc từ trang Kế toán tổng hợp bên Sell. Chủ dự án đã nghe đủ hệ quả
//  của việc bỏ trần rồi vẫn bỏ, ngày 25/08 — muốn con số gõ vào là con số cuối
//  cùng. Từ đây KHÔNG còn gì canh việc xuất vượt phần doanh số còn nợ hóa đơn.
//
//  Cơ chế trần vẫn nằm nguyên trong ghepTien.ghepSanPham({ tranTuyetDoi }) và
//  đường truyền qua chiaHoaDon → nhanLenh, có đủ bài kiểm ở cuối tệp này. Hiện
//  KHÔNG ai nuôi nó — bật lại chỉ là một dòng.
//
//  ⚠️ LỜI HỨA LỚN NHẤT: khách ĐỂ TRỐNG ô phải chạy y hệt như trước — không thêm
//  một điều kiện nào, không thêm một cách hỏng nào, không thêm một lần gọi mạng.
// ============================================================================

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const CaiDat = require('../chung/caiDat');
const HenGio = require('../chung/henGio');
const ApDung = require('../chung/apDungSoDat');

let dat = 0, hong = 0;
const cho = [];
function test(ten, fn) { cho.push([ten, fn]); }
function ghiChu(chu) { cho.push([chu, null]); }

const khach = (ma, them = {}) => ({ maKH: ma, tenKH: 'Khách ' + ma, ...them });
const bang = (cac) => cac.map(([ma, dt]) => ({ maKH: ma, tenKH: 'Khách ' + ma, doanhThu: dt }));

// ────────────────────────────────────────────────────────────────────────────
ghiChu('— ⛔⛔⛔ LỜI HỨA: KHÔNG ĐẶT SỐ THÌ KHÔNG ĐỔI GÌ HẾT —');

test('⛔⛔⛔ không ai đặt số → trả về Y HỆT kết quả cũ', () => {
    // Chốt quan trọng nhất cả tệp. Tính năng này KHÔNG ĐƯỢC làm yếu đường đang
    // chạy tốt: khách để trống ô phải đi đúng con đường cũ, không rẽ đâu cả.
    const trongLich = [khach('A'), khach('B')];
    const ghep = HenGio.ghepVoiBang(trongLich, bang([['A', 990000]]), true);
    const r = ApDung.apDung({ trongLich, ghep });
    assert.deepStrictEqual(r.chay, ghep.chay, 'đã đụng vào danh sách chạy');
    assert.deepStrictEqual(r.thieu, ghep.thieu, 'đã đụng vào danh sách bỏ qua');
    assert.strictEqual(r.coAiDat, false);
});

test('⛔⛔ khách KHÔNG đặt vẫn nguyên xi khi khách KHÁC có đặt', () => {
    // Một khách bật tính năng không được kéo theo khách bên cạnh.
    const trongLich = [khach('A'), khach('B', { soTienNgay: 3000000 })];
    const ghep = HenGio.ghepVoiBang(trongLich, bang([['A', 990000]]), true);
    const r = ApDung.apDung({ trongLich, ghep });
    const a = r.chay.find(x => x.maKH === 'A');
    assert.ok(a, 'khách A biến mất');
    assert.strictEqual(a.soTien, 990000, 'doanh số của A bị đổi');
    assert.strictEqual(a.soTienDat, undefined, 'A bị gắn số đặt của người khác');
});

// ────────────────────────────────────────────────────────────────────────────
ghiChu('— ⭐⭐⭐ CÓ ĐẶT SỐ: xuất ĐÚNG số ấy, không so với gì cả —');

test('⭐⭐⭐ xuất ĐÚNG con số đã đặt, doanh số hôm nay KHÔNG được xen vào', () => {
    const trongLich = [khach('A', { soTienNgay: 5000000 })];
    // Doanh số hôm nay 990.000 — hoàn toàn không liên quan.
    const ghep = HenGio.ghepVoiBang(trongLich, bang([['A', 990000]]), true);
    const r = ApDung.apDung({ trongLich, ghep });
    assert.strictEqual(r.chay.length, 1);
    assert.strictEqual(r.chay[0].soTien, 5000000, 'không xuất đúng số đã đặt');
});

test('⭐⭐ khách KHÔNG có doanh thu hôm nay VẪN chạy nếu có đặt số', () => {
    // Cả điểm của tính năng: xuất cho phần doanh số NHỮNG NGÀY CŨ còn nợ hóa
    // đơn. Giữ luật "không doanh thu thì bỏ qua" ở đây là vô hiệu hóa nó.
    const trongLich = [khach('A', { soTienNgay: 7000000 })];
    const ghep = HenGio.ghepVoiBang(trongLich, bang([]), true);
    assert.strictEqual(ghep.chay.length, 0, 'bộ ghép cũ phải bỏ qua khách này');
    const r = ApDung.apDung({ trongLich, ghep });
    assert.strictEqual(r.chay.length, 1, '⛔ vẫn bỏ qua khách đã đặt số');
    assert.strictEqual(r.chay[0].soTien, 7000000);
});

test('⛔⛔ KHÔNG được gắn trần nào vào lệnh (quyết định 25/08/2026)', () => {
    // Bản 24/08 gắn `tranTuyetDoi` = số dư chưa xuất hóa đơn. Chủ dự án bỏ hẳn.
    // Chốt lại ở đây để không ai lặng lẽ bật lại mà tưởng là sửa lỗi.
    const trongLich = [khach('A', { soTienNgay: 5000000 })];
    const ghep = HenGio.ghepVoiBang(trongLich, bang([['A', 990000]]), true);
    const r = ApDung.apDung({ trongLich, ghep });
    assert.strictEqual(r.chay[0].tranTuyetDoi, undefined,
        'lệnh mang trần trong khi luật hiện hành nói KHÔNG so với dữ liệu nào');
});

test('⛔ số đặt KHÔNG hợp lệ thì coi như không đặt', () => {
    for (const rac of [0, -1, NaN, null, undefined, 'nhiều']) {
        const trongLich = [khach('A', { soTienNgay: rac })];
        const ghep = HenGio.ghepVoiBang(trongLich, bang([['A', 990000]]), true);
        const r = ApDung.apDung({ trongLich, ghep });
        assert.strictEqual(r.coAiDat, false, 'nhận bừa số đặt: ' + String(rac));
        assert.strictEqual(r.chay[0].soTien, 990000, 'với ' + String(rac));
    }
});

test('⛔ coKhachDatSo phải nói đúng — nó là cửa quyết định có rẽ nhánh hay không', () => {
    assert.strictEqual(ApDung.coKhachDatSo([khach('A')]), false);
    assert.strictEqual(ApDung.coKhachDatSo([khach('A', { soTienNgay: 0 })]), false);
    assert.strictEqual(ApDung.coKhachDatSo([khach('A', { soTienNgay: 1 })]), true);
    for (const rac of [null, undefined, 'rác', {}]) {
        assert.strictEqual(ApDung.coKhachDatSo(rac), false, String(rac));
    }
});

// ────────────────────────────────────────────────────────────────────────────
ghiChu('— ⭐ Ô NHẬP: mập mờ thì TỪ CHỐI, không đoán —');

test('⛔⛔ "1.5" KHÔNG được hiểu thành 15', () => {
    // Bản nháp bóc hết dấu chấm rồi cộng lại, nên "1.5" ra 15. Người gõ "1.5"
    // gần như chắc chắn định nói 1,5 triệu — mà máy hiểu là mười lăm đồng rồi
    // đem đi xuất hóa đơn thuế. Mập mờ thì phải từ chối.
    for (const v of ['1.5', '1.50', '1.2345', '0', '-5', 'abc', '', null, '1..000']) {
        assert.strictEqual(CaiDat.chuanSoTienNgay(v), null, 'nhận bừa: ' + JSON.stringify(v));
    }
});

test('⭐ nhận đúng hai dạng người ta hay gõ', () => {
    assert.strictEqual(CaiDat.chuanSoTienNgay('1.500.000'), 1500000);
    assert.strictEqual(CaiDat.chuanSoTienNgay('1500000'), 1500000);
    assert.strictEqual(CaiDat.chuanSoTienNgay(' 2,000,000 '), 2000000);
});

test('⭐ cài đặt GIỮ ĐƯỢC số đã đặt, và BỎ số rác', () => {
    const c = CaiDat.gop({}, { henGio: { bat: true, moc: ['08:00'],
        khach: [khach('A', { soTienNgay: '1.500.000' }), khach('B', { soTienNgay: '1.5' })] } },
        HenGio);
    assert.strictEqual(c.henGio.khach[0].soTienNgay, 1500000);
    assert.strictEqual(c.henGio.khach[1].soTienNgay, undefined, 'giữ lại một con số rác');
});

test('⛔ cài đặt KHÔNG còn ô "số dư tính từ ngày"', () => {
    // Ô ấy chỉ có nghĩa khi còn trần theo số dư. Bỏ luật thì bỏ luôn ô, chứ để
    // lại một ô không ai đọc là bẫy cho người dùng lẫn người sửa mã sau này.
    const c = CaiDat.gop({}, { henGio: { bat: true, moc: ['08:00'],
        khach: [khach('A')], soDuTuNgay: '2026-01-01' } }, HenGio);
    assert.strictEqual('soDuTuNgay' in c.henGio, false, 'ô cũ vẫn còn trong cài đặt');
    assert.strictEqual(typeof CaiDat.chuanNgayISO, 'undefined', 'hàm cũ vẫn còn được xuất');
});

// ────────────────────────────────────────────────────────────────────────────
ghiChu('— ⭐⭐ NÓI RÕ CẢ HAI CON SỐ khi chúng lệch nhau —');

const DayVeSell = require('../chung/dayVeSell');
const BaoTelegram = require('../chung/baoTelegram');

test('⭐⭐⭐ đã xuất KHÁC số định xuất → dòng gửi đi phải kèm CẢ HAI', () => {
    // ⚠️ Vẫn cần, kể cả khi đã bỏ trần: bộ ghép tiền có DUNG SAI 200.000đ và
    // được phép lệch CẢ HAI CHIỀU (chủ dự án chọn 1b ngày 25/08). Nên gõ
    // 5.000.000 mà ra 5.150.000 là chuyện bình thường — nhưng phải NÓI RA, chứ
    // không để người đọc tự hỏi vì sao hai chỗ hiện hai con số.
    const d = DayVeSell.dongTuTienDo({
        loai: 'xong',
        lenh: { id: 'l1', maKH: 'S8', tenKH: 'Hồng Huệ -S8', soTien: 5000000 },
        ketQua: { daBamThanhToan: true, tong: 5150000 },
    }, '2026-08-25', Date.now());
    assert.strictEqual(d.so_tien, 5150000, 'số đã xuất phải là số THẬT');
    assert.strictEqual(d.so_tien_dinh, 5000000, '⛔ giấu mất số định xuất');
});

test('⛔ hai số BẰNG NHAU thì đừng nhắc — đó là mọi lượt bình thường', () => {
    const d = DayVeSell.dongTuTienDo({
        loai: 'xong',
        lenh: { id: 'l1', maKH: 'S8', tenKH: 'Hồng Huệ -S8', soTien: 5000000 },
        ketQua: { daBamThanhToan: true, tong: 5000000 },
    }, '2026-08-25', Date.now());
    assert.strictEqual(d.so_tien_dinh, undefined, 'nhắc thừa ở lượt bình thường');
});

test('⭐⭐ và Telegram phải HIỆN RA cả hai', () => {
    const chu = BaoTelegram.soanTin({
        ten_khach_hang: 'Hồng Huệ -S8', ma_khach_hang: 'S8', ma_lenh: 'l1',
        so_tien: 5150000, so_tien_dinh: 5000000, ket_qua: 'RA_HOA_DON', chay_luc: Date.now(),
    });
    assert.match(chu, /Số tiền: 5\.150\.000đ \(định xuất 5\.000\.000đ\)/, chu);
});

test('⛔ không có số định xuất thì tin nhắn phải sạch như cũ', () => {
    const chu = BaoTelegram.soanTin({
        ten_khach_hang: 'Hồng Huệ -S8', ma_khach_hang: 'S8', ma_lenh: 'l1',
        so_tien: 5000000, ket_qua: 'RA_HOA_DON', chay_luc: Date.now(),
    });
    assert.ok(!/định xuất/.test(chu), 'thêm chữ thừa vào lượt bình thường: ' + chu);
});

// ────────────────────────────────────────────────────────────────────────────
ghiChu('— ⭐⭐ NỐI DÂY: mã có thật sự dùng những thứ trên không —');

const maNen = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
const maThat = maNen.split('\n').filter(d => !/^\s*\/\//.test(d)).join('\n');

test('⭐⭐⭐ tiến trình nền phải NẠP và DÙNG bộ áp số đặt', () => {
    // Bẫy quen thuộc: hàm đúng mà dây không nối thì vô dụng.
    assert.match(maThat, /'chung\/apDungSoDat\.js',/, 'quên nạp apDungSoDat');
    assert.match(maThat, /self\.HDT_ApDungSoDat\.coKhachDatSo\(trongLich\)/,
        '⛔ không hỏi "có ai đặt số không"');
    assert.match(maThat, /self\.HDT_ApDungSoDat\.apDung\(\{ trongLich, ghep \}\)/,
        '⛔ không áp luật');
});

test('⛔⛔ KHÔNG còn gọi Sell để đọc số dư (quyết định 25/08/2026)', () => {
    // Bỏ trần thì phải bỏ luôn lần gọi mạng ấy. Để lại là mỗi lượt vẫn phụ thuộc
    // đăng nhập admin Sell mà chẳng dùng kết quả vào việc gì.
    assert.ok(!/HDT_SoDuKeToan/.test(maNen), '⛔ vẫn còn gọi bộ đọc số dư');
    assert.ok(!/soDuKeToan\.js/.test(maNen), '⛔ vẫn còn nạp soDuKeToan.js');
    assert.ok(!fs.existsSync(path.join(__dirname, '..', 'chung', 'soDuKeToan.js')),
        '⛔ tệp soDuKeToan.js vẫn còn — mã chết');
    const mf = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
    assert.ok(!JSON.stringify(mf).includes('soDuKeToan'), '⛔ manifest vẫn nạp soDuKeToan');
});

test('⭐⭐ tin "cả lượt không chạy" phải nói LÝ DO THẬT của từng khách', () => {
    // Lượt 16:45 ngày 24/08/2026 nhắn "không khách nào phát sinh doanh thu" —
    // câu ĐÓNG ĐINH SẴN trong mã, nên nó nói sai mà không ai biết.
    assert.match(maThat, /const keLyDo = \(thieu \|\| \[\]\)/,
        '⛔ không gom lý do của từng khách bị bỏ qua');
    assert.ok(maThat.includes(
        "+ (keLyDo.length ? 'Lý do từng khách — ' + keLyDo.join('; ') + '. '"),
        '⛔ tin vẫn đóng đinh một câu thay vì dùng lý do thật');
});

// ────────────────────────────────────────────────────────────────────────────
ghiChu('— 🅿️ TRẦN TUYỆT ĐỐI: cơ chế còn nguyên nhưng ĐANG ĐỖ, chưa ai nuôi —');

// ⚠️ ĐỌC KỸ TRƯỚC KHI XÓA. Những bài dưới đây kiểm một cơ chế mà HIỆN TẠI KHÔNG
// CÓ AI GỌI: `ghepSanPham({ tranTuyetDoi })`. Nó được làm ngày 24/08 để chặn
// đúng một ca thật — trần 7.000đ mà dung sai 200.000đ đẩy thành hóa đơn 50.000đ,
// gấp bảy lần. Ngày 25/08 chủ dự án bỏ luật trần, nên nó thành cơ chế đang đỗ.
//
// Giữ lại vì: mặc định KHÔNG truyền = không đổi hành vi một li, và nếu bật lại
// trần thì chỉ là một dòng. Ghi rõ ra đây để người đọc sau biết đây là quyết
// định có cân nhắc, không phải mã bị bỏ quên.

const GhepTien = require('../chung/ghepTien');
const ChiaHoaDon = require('../chung/chiaHoaDon');

test('⭐⭐ trần chặn được đúng ca 16:30 ngày 24/08', () => {
    const hang = [{ ma: 'SP1', ten: 'Món 50k', gia: 50000, ton: 99 }];
    const khongTran = GhepTien.ghepSanPham({ sanPham: hang, soTien: 7000, dungSai: 200000 });
    assert.strictEqual(khongTran.tong, 50000, 'không dựng lại được con bug nữa');
    const coTran = GhepTien.ghepSanPham({
        sanPham: hang, soTien: 7000, dungSai: 200000, tranTuyetDoi: 7000,
    });
    assert.ok(coTran.tong == null || coTran.tong <= 7000, '⛔ vượt trần: ' + coTran.tong);
});

test('⭐⭐ trần chặn phía TRÊN nhưng KHÔNG chặn phía dưới', () => {
    const hang = [{ ma: 'A', ten: 'A', gia: 990000, ton: 99 },
                  { ma: 'B', ten: 'B', gia: 50000, ton: 99 }];
    const k = GhepTien.ghepSanPham({
        sanPham: hang, soTien: 5000000, dungSai: 200000, tranTuyetDoi: 5100000,
    });
    assert.strictEqual(k.ma, 'OK', k.thongBao);
    assert.ok(k.tong <= 5100000, '⛔ vượt trần: ' + k.tong);
});

test('⛔⛔ KHÔNG truyền trần → chạy y hệt từ trước tới nay', () => {
    // Đây là chốt bảo vệ đường ĐANG CHẠY: cơ chế đang đỗ không được đổi gì.
    const hang = [{ ma: 'SP1', ten: 'Món 50k', gia: 50000, ton: 99 }];
    for (const tran of [undefined, null, 0]) {
        const k = GhepTien.ghepSanPham({
            sanPham: hang, soTien: 7000, dungSai: 200000, tranTuyetDoi: tran,
        });
        assert.strictEqual(k.tong, 50000, 'đường cũ bị đổi với tranTuyetDoi=' + tran);
    }
    const k2 = ChiaHoaDon.lapKeHoach({ sanPham: hang, soTien: 7000, tran: 0, dungSai: 200000 });
    assert.strictEqual(k2.ma, 'OK', 'bộ chia bị đổi: ' + k2.thongBao);
});

test('⭐ trần đi xuyên được qua bộ chia và nhanLenh', () => {
    const hang = [{ ma: 'SP1', ten: 'Món 50k', gia: 50000, ton: 99 }];
    const k = ChiaHoaDon.lapKeHoach({
        sanPham: hang, soTien: 7000, tran: 0, dungSai: 200000, tranTuyetDoi: 7000,
    });
    assert.notStrictEqual(k.ma, 'OK', '⛔ bộ chia NUỐT MẤT trần');
    const ma = fs.readFileSync(path.join(__dirname, '..', 'tendoo', 'nhanLenh.js'), 'utf8');
    assert.match(ma, /tranTuyetDoi: Number\(lenh\.tranTuyetDoi\)/,
        '⛔ nhanLenh KHÔNG chuyển trần xuống bộ chia');
});

// ────────────────────────────────────────────────────────────────────────────
(async () => {
    console.log('\nTỰ ĐẶT SỐ TIỀN XUẤT MỖI NGÀY\n');
    for (const [ten, fn] of cho) {
        if (!fn) { console.log('  ' + ten); continue; }
        try { await fn(); dat++; console.log('  \x1b[32m✔\x1b[0m ' + ten); }
        catch (e) {
            hong++;
            console.log('  \x1b[31m✘\x1b[0m ' + ten);
            console.log('      ' + String(e && e.message).split('\n').join('\n      '));
        }
    }
    console.log(`\n${dat} đạt, ${hong} hỏng`);
    if (hong) process.exitCode = 1;
})();
