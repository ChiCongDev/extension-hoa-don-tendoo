'use strict';

// ============================================================================
//  TEST NHỊP ĐỘ — canh nguyên tắc "KHÔNG CHỜ CỨNG"
//
//  Trước đây tốc độ mất vào những chỗ ngồi đếm đủ N giây rồi mới nhìn:
//    · nghỉ 5–10 giây giữa hai khách
//    · ngủ 3 giây sau khi bấm "Xác nhận" để xem giỏ trống chưa
//    · ngủ 800ms sau khi bấm "Bỏ qua"
//    · ngủ 1,2 giây trước khi điền form đăng nhập
//    · ngủ 400ms mỗi món bỏ vào giỏ
//  Cộng lại: một khách phải đổi tài khoản lãng phí 15–25 giây.
//
//  File này khóa lại hai điều:
//    1. Những chỗ đó KHÔNG được quay lại kiểu chờ cứng.
//    2. Tăng tốc KHÔNG được đổi lấy bất kỳ chốt an toàn nào.
// ============================================================================

const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { test, ghiChu, chay } = require('./chay');
const NhipDo = require('../chung/nhipDo');

const GOC = path.join(__dirname, '..');
const doc = (f) => fs.readFileSync(path.join(GOC, f), 'utf8');
/** Bỏ chú thích — chỉ soi mã CHẠY THẬT, không soi chữ trong ghi chú. */
const than = (f) => doc(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

ghiChu('— Mọi con số thời gian ở đúng một chỗ —');

test('nhipDo là nguồn duy nhất, các file khác lấy từ đó', () => {
    for (const f of ['chung/hangDoi.js', 'chung/doiTaiKhoan.js',
                     'tendoo/bamThanhToan.js', 'tendoo/boGio.js', 'tendoo/dangNhap.js']) {
        assert.match(than(f), /NhipDo/, `${f} tự chế số thời gian riêng`);
    }
    assert.match(than('background.js'), /HDT_NhipDo/, 'tiến trình nền tự chế nhịp riêng');
});

test('nhipDo được nạp ở MỌI nhóm trang — thiếu là script nổ khi chạy', () => {
    const manifest = JSON.parse(doc('manifest.json'));
    for (const cs of manifest.content_scripts) {
        assert.ok(cs.js.includes('chung/nhipDo.js'),
            `nhóm ${cs.matches[0]} chưa nạp chung/nhipDo.js`);
        assert.strictEqual(cs.js[0], 'chung/nhipDo.js', 'nhipDo phải nạp TRƯỚC mọi file khác');
    }
    assert.match(doc('background.js'), /chung\/nhipDo\.js/, 'tiến trình nền chưa nạp nhipDo');
});

ghiChu('— ⭐ KHÔNG chờ cứng ở những chỗ đã từng chậm —');

test('⭐ sau "Xác nhận": NHÌN giỏ theo nhịp, KHÔNG ngủ 3 giây', () => {
    const ma = than('tendoo/bamThanhToan.js');
    assert.ok(!/nghi\(tuyChon\.doiSauBam \|\| 3000\)/.test(ma), '❌ lại ngủ cứng 3 giây');
    const dau = ma.indexOf('nutXacNhan.click()');
    const doan = ma.slice(dau, dau + 700);
    assert.match(doan, /gioDangTrong/, 'không nhìn giỏ sau khi bấm');
    assert.match(doan, /for \(/, 'không có vòng nhìn — vẫn là chờ một phát');
});

test('⭐ sau "Bỏ qua": NHÌN cho tới khi bảng thuế đóng, KHÔNG ngủ 800ms', () => {
    const ma = than('tendoo/bamThanhToan.js');
    assert.ok(!/doiSauBoQua == null \? 800/.test(ma), '❌ lại ngủ cứng 800ms');
    const dau = ma.indexOf('nutBoQua.click()');
    const doan = ma.slice(dau, dau + 700);
    assert.match(doan, /timBangChanDuong/, 'không kiểm bảng thuế đã đóng chưa');
});

test('⭐ trước khi điền form đăng nhập: chờ Ô NHẬP, KHÔNG ngủ 1,2 giây', () => {
    assert.ok(!/nghi\(1200\)/.test(than('chung/doiTaiKhoan.js')), '❌ lại ngủ cứng 1,2 giây');
    const ma = than('tendoo/dangNhap.js');
    assert.match(ma, /HAN_CHO_O_DANG_NHAP/, 'không chờ ô nhập xuất hiện');
});

test('⭐ bỏ hàng vào giỏ: chờ giỏ THẬT SỰ đổi, KHÔNG ngủ 400ms mỗi món', () => {
    const ma = than('tendoo/boGio.js');
    assert.ok(!/nghi\(tuyChon\.doiVeLuoi \|\| 400\)/.test(ma), '❌ lại ngủ cứng 400ms');
    assert.match(ma, /function nhinToiKhi/, 'không có hàm nhìn theo điều kiện');
});

test('⭐ KHÔNG còn con số thời gian viết thẳng trong mã', () => {
    // Số viết thẳng là số sẽ bị quên khi cần chỉnh. Mọi con số phải có tên.
    for (const f of ['tendoo/bamThanhToan.js', 'tendoo/boGio.js',
                     'chung/doiTaiKhoan.js', 'chung/hangDoi.js']) {
        const xau = [...than(f).matchAll(/nghi\((\d{3,})\)/g)].map(m => m[1]);
        assert.deepStrictEqual(xau, [], `${f} còn chờ cứng: ${xau.join(', ')}`);
    }
});

ghiChu('— Nhịp phải đủ nhỏ để nhanh, hạn phải đủ lớn để chắc —');

test('nhịp nhìn đủ mịn', () => {
    assert.ok(NhipDo.NHIN_DOM <= 150, `nhịp nhìn ${NhipDo.NHIN_DOM}ms còn thô`);
    assert.ok(NhipDo.NHIN_TAB <= 200);
    assert.ok(NhipDo.NHIN_DANH_TINH <= 300);
    // Nhưng đừng nhỏ tới mức quay cuồng làm nặng trang.
    assert.ok(NhipDo.NHIN_DOM >= 40, 'nhịp quá nhỏ, chỉ tổ làm nặng trang');
});

test('hạn vẫn đủ rộng — nhanh KHÔNG đổi lấy việc bỏ cuộc sớm', () => {
    assert.ok(NhipDo.HAN_CHO_BANG >= 5000, 'bảng xác nhận chưa kịp hiện đã bỏ cuộc');
    assert.ok(NhipDo.HAN_CHO_GIO_TRONG >= 5000, 'giỏ chưa kịp trống đã kết luận KHÔNG RÕ');
    assert.ok(NhipDo.HAN_DOC_DANH_TINH >= 20000, 'trang POS thật cần hơn 12 giây');
    assert.ok(NhipDo.HAN_DOI_TRANG >= 30000, 'mạng chậm là hỏng');
});

test('nghỉ giữa hai khách phải ngắn nhưng khác 0', () => {
    const [min, max] = NhipDo.NGHI_GIUA_KHACH;
    assert.ok(min > 0, 'dồn dập lên máy chủ Tendoo');
    assert.ok(max <= 1000, `nghỉ tới ${max}ms — quá lâu`);
    assert.ok(min <= max);
});

ghiChu('— ⛔ Tăng tốc KHÔNG được đụng vào chốt an toàn —');

test('⛔ mọi chốt chặn trước khi phát hành còn nguyên', () => {
    const ma = than('tendoo/bamThanhToan.js');
    for (const [ten, mau] of [
        ['tổng phải khớp tuyệt đối', /TONG_KHONG_KHOP/],
        ['tổng TRONG BẢNG phải khớp', /BANG_SAI_TONG/],
        ['Ghi nợ phải tắt', /GHI_NO_DANG_BAT/],
        ['chống bấm hai lần', /DA_BAM_ROI/],
        ['phải được cho phép tường minh', /choPhep !== true/],
        ['hết hạn mà giỏ còn hàng là KHÔNG RÕ', /MA\.KHONG_RO/],
    ]) {
        assert.match(ma, mau, `mất chốt: ${ten}`);
    }
});

test('⛔ ghi sổ TRƯỚC khi bấm — không vì nhanh mà ghi sau', () => {
    const ma = than('chung/hangDoi.js');
    const ghi = ma.indexOf('danhDauDangXuLy');
    const chay = ma.indexOf('await thucThi(lenh)');
    assert.ok(ghi > 0 && chay > 0);
    assert.ok(ghi < chay, '❌ chạy trước rồi mới ghi sổ — mất chống trùng hóa đơn');
});

test('⛔ trần số lần bấm không đổi', () => {
    const ma = than('tendoo/bamThanhToan.js');
    assert.strictEqual((ma.match(/nutXacNhan\.click\(\)/g) || []).length, 1,
        '❌ có nhiều hơn một đường bấm "Xác nhận"');
    assert.strictEqual((ma.match(/nutBoQua\.click\(\)/g) || []).length, 1,
        '❌ có nhiều hơn một đường bấm "Bỏ qua"');
});

ghiChu('— ⭐ Đo tốc độ thật, không tin cảm giác —');

test('⭐ gặp bảng thuế thì THÔI ĐỢI NGAY, không ngồi hết hạn 8 giây', async () => {
    // Lỗi thật vừa mắc khi tăng tốc: hàm đợi chỉ nhìn mỗi bảng xác nhận, nên gặp
    // bảng thuế là ngồi đủ HAN_CHO_BANG rồi mới chịu nhìn cái gì đang chặn.
    // Đo được 9.076ms cho một lượt đáng ra chỉ mất ~0,26 giây.
    require('../chung/domReact');
    const BoGio = require('../tendoo/boGio');
    globalThis.HDT_BoGio = BoGio;
    const Bam = require('../tendoo/bamThanhToan');
    const { taoTrangPos } = require('./trangPosGiaLap');

    const t = taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }], bangThue: true });
    const bd = Date.now();
    const kq = await Bam.taoLuot().bam(t.tailieu,
        { choPhep: true, tongMongDoi: t.tongHienTai(), boQuaCanhBaoThue: true });
    const mat = Date.now() - bd;

    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.ok(mat < 2000, `mất ${mat}ms — đang ngồi đợi hết hạn thay vì nhìn`);
    // Nhanh nhưng KHÔNG được bấm thừa.
    assert.strictEqual(t.daBam.thueBoQua, 1);
    assert.strictEqual(t.daBam.thanhToan, 2);
    assert.strictEqual(t.daBam.xacNhan, 1);
});

test('⭐ đường thuận lợi (không bảng thuế) phải cực nhanh', async () => {
    const BoGio = require('../tendoo/boGio');
    globalThis.HDT_BoGio = BoGio;
    const Bam = require('../tendoo/bamThanhToan');
    const { taoTrangPos } = require('./trangPosGiaLap');

    const t = taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }] });
    const bd = Date.now();
    const kq = await Bam.taoLuot().bam(t.tailieu,
        { choPhep: true, tongMongDoi: t.tongHienTai() });
    const mat = Date.now() - bd;
    assert.strictEqual(kq.ma, 'XONG', kq.thongBao);
    assert.ok(mat < 800, `mất ${mat}ms — bản cũ ngủ cứng 3 giây ở đây`);
});

test('⭐ bỏ 3 món vào giỏ không còn ngủ 400ms mỗi món', async () => {
    const BoGio = require('../tendoo/boGio');
    globalThis.HDT_BoGio = BoGio;
    const { taoTrangPos, HANG_MAU } = require('./trangPosGiaLap');
    const t = taoTrangPos();
    const ds = [HANG_MAU[0], HANG_MAU[1], HANG_MAU[5]]
        .map(h => ({ id: h.ma, ten: h.ten, gia: h.gia, soLuong: 1 }));
    const bd = Date.now();
    const kq = await BoGio.boVaoGio(t.tailieu, ds);
    const mat = Date.now() - bd;
    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.strictEqual(t.xemGio().length, 3);
    assert.ok(mat < 2500, `mất ${mat}ms cho 3 món — bản cũ tốn 400ms/món chờ suông`);
});

chay('NHỊP ĐỘ — KHÔNG CHỜ CỨNG');
