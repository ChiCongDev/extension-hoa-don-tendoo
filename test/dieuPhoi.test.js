'use strict';

// Test ĐẦU-CUỐI cho bộ điều phối: khai báo -> đăng nhập -> đối chiếu tài khoản
// -> đọc kho -> ghép tiền -> (bỏ giỏ) -> đối chiếu tổng -> (bấm Thanh toán).
// Chạy trên MÁY CHỦ TENDOO GIẢ LẬP: không mạng, không Chrome, không tài khoản thật.

const assert = require('node:assert');
const { test, ghiChu, chay } = require('./chay');
const DieuPhoi = require('../chung/dieuPhoi');
const Kho = require('../chung/khoMatKhau');
const DanhTinh = require('../tendoo/danhTinh');
const DocSanPham = require('../tendoo/docSanPham');
const GhepTien = require('../chung/ghepTien');
const SoGhiDau = require('../chung/soGhiDau');
const HangDoi = require('../chung/hangDoi');
const { taoMayChuGiaLap } = require('./tendooGiaLap');

const { MA_LOI } = DieuPhoi;
const KHOA_MO = 'khoa-mo-thu-nghiem';
const CH_PA = 'cua-hang-pa-0001';
const CH_TB = 'cua-hang-tb-0002';

/** Kho hàng đủ rộng để ghép trúng nhiều mức tiền. */
const HANG_PA = [
    { id: 'a', ten: 'Áo khoác dạ', gia: 990000, ton: 22 },
    { id: 'b', ten: 'Giày Boots', gia: 1450000, ton: 19 },
    { id: 'c', ten: 'Áo Gilet nữ', gia: 890000, ton: 13 },
    { id: 'd', ten: 'Quần Jogger', gia: 490000, ton: 18 },
    { id: 'e', ten: 'Áo Bomber', gia: 790000, ton: 19 },
];

function mayChu(themCaiDat = {}) {
    return taoMayChuGiaLap({
        cuaHang: {
            [CH_PA]: { tenHienThi: 'CH PHƯƠNG ANH', tenDangNhap: 'pa@x', matKhau: 'MatKhauPA!1', sanPham: HANG_PA },
            [CH_TB]: { tenHienThi: 'CH TRANG BÉ', tenDangNhap: 'tb@x', matKhau: 'MatKhauTB!1', sanPham: HANG_PA },
        },
        ...themCaiDat,
    });
}

async function dungBoi(tendoo, tuyChon = {}, khaiBao = 'day-du') {
    const kho = await Kho.taoKho(KHOA_MO);
    const { khoa } = await Kho.moKho(kho, KHOA_MO);
    if (khaiBao === 'day-du') {
        await Kho.ghiKhach(kho, khoa, 'PA', { maCuaHang: CH_PA, tenDangNhap: 'pa@x', matKhau: 'MatKhauPA!1' });
        await Kho.ghiKhach(kho, khoa, 'TB', { maCuaHang: CH_TB, tenDangNhap: 'tb@x', matKhau: 'MatKhauTB!1' });
    }
    return { kho, khoa, Kho, DanhTinh, DocSanPham, GhepTien, tendoo, tuyChon };
}

const chay1 = (boi, maKH = 'PA', soTien = 10000000) =>
    DieuPhoi.xuLyMotKhach({ maKH, tenKH: maKH, soTien }, boi);

// ─── LUỒNG ĐẦY ĐỦ ───────────────────────────────────────────────────────────
ghiChu('— Luồng đầy đủ —');

test('đủ điều kiện → đăng nhập, đọc kho, ghép tiền, trả kết quả', async () => {
    const tendoo = mayChu();
    const kq = await chay1(await dungBoi(tendoo), 'PA', 10000000);

    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.ok(Math.abs(kq.ketQua.lech) <= 200000);
    assert.strictEqual(kq.ketQua.cuaHang, CH_PA);
    assert.strictEqual(kq.ketQua.tenTaiKhoan, 'CH PHƯƠNG ANH');
    assert.strictEqual(kq.ketQua.soSanPhamDocDuoc, 5);
    assert.ok(kq.ketQua.chon.every(d => d.soLuong > 0));
});

test('MẶC ĐỊNH: KHÔNG bỏ giỏ, KHÔNG bấm Thanh toán', async () => {
    const tendoo = mayChu();
    const kq = await chay1(await dungBoi(tendoo));
    assert.strictEqual(kq.ok, true);
    assert.strictEqual(kq.ketQua.daBoVaoGio, false);
    assert.strictEqual(kq.ketQua.daBamThanhToan, false);
    assert.strictEqual(tendoo.goiTheoLoai('boVaoGio').length, 0, 'đã tự bỏ hàng vào giỏ!');
    assert.strictEqual(tendoo.goiTheoLoai('bamThanhToan').length, 0, 'ĐÃ TỰ BẤM THANH TOÁN!');
});

test('đề xuất KHÔNG BAO GIỜ vượt tồn kho', async () => {
    const tendoo = mayChu();
    const kq = await chay1(await dungBoi(tendoo), 'PA', 60000000);
    assert.strictEqual(kq.ok, true);
    for (const d of kq.ketQua.chon) {
        const that = HANG_PA.find(h => h.id === d.id);
        assert.ok(d.soLuong <= that.ton, `${d.id}: lấy ${d.soLuong} > tồn ${that.ton}`);
    }
});

test('bẫy thật: is_out_of_stock=true không làm mất hàng', async () => {
    const tendoo = mayChu();
    const kq = await chay1(await dungBoi(tendoo));
    assert.strictEqual(kq.ketQua.soSanPhamDocDuoc, 5, 'đã loại nhầm hàng còn tồn');
});

// ─── CỬA CHẶN 1: ĐÚNG TÀI KHOẢN ────────────────────────────────────────────
ghiChu('— Cửa chặn 1: đúng tài khoản —');

test('chưa khai báo → dừng NGAY, KHÔNG hề gọi đăng nhập', async () => {
    const tendoo = mayChu();
    const boi = await dungBoi(tendoo, {}, 'trong');
    const kq = await chay1(boi);
    assert.strictEqual(kq.ma, MA_LOI.CHUA_KHAI_BAO);
    assert.strictEqual(tendoo.goiTheoLoai('dangNhap').length, 0);
    assert.strictEqual(tendoo.goiTheoLoai('goiTrangSanPham').length, 0);
});

test('đang đăng nhập SẴN đúng tài khoản → KHÔNG đăng nhập lại', async () => {
    const tendoo = mayChu({ dangDangNhap: CH_PA });
    const kq = await chay1(await dungBoi(tendoo));
    assert.strictEqual(kq.ok, true);
    assert.strictEqual(tendoo.goiTheoLoai('dangNhap').length, 0, 'đăng nhập thừa');
});

test('đang đăng nhập tài khoản KHÁC → tự đăng nhập lại đúng khách', async () => {
    const tendoo = mayChu({ dangDangNhap: CH_TB });
    const kq = await chay1(await dungBoi(tendoo), 'PA');
    assert.strictEqual(kq.ok, true);
    assert.strictEqual(tendoo.goiTheoLoai('dangNhap').length, 1);
    assert.strictEqual(kq.ketQua.cuaHang, CH_PA);
});

test('sai mật khẩu → DANG_NHAP_LOI, không đọc kho', async () => {
    const tendoo = mayChu();
    const boi = await dungBoi(tendoo);
    await Kho.ghiKhach(boi.kho, boi.khoa, 'PA',
        { maCuaHang: CH_PA, tenDangNhap: 'pa@x', matKhau: 'MatKhauSai!9' });
    const kq = await chay1(boi);
    assert.strictEqual(kq.ma, MA_LOI.DANG_NHAP_LOI);
    assert.strictEqual(tendoo.goiTheoLoai('goiTrangSanPham').length, 0);
});

test('gặp captcha → CAPTCHA (nhóm dừng cả loạt)', async () => {
    const tendoo = mayChu({ epLoi: { captcha: true } });
    const kq = await chay1(await dungBoi(tendoo));
    assert.strictEqual(kq.ma, MA_LOI.CAPTCHA);
    assert.ok(HangDoi.LOI_DUNG_CA_LOAT.has(kq.ma));
});

test('kho đang khóa (không đọc được mật khẩu) → KHOA_MO_SAI', async () => {
    const tendoo = mayChu();
    const boi = await dungBoi(tendoo);
    boi.khoa = null;                       // như khi người dùng chưa gõ khóa mở
    const kq = await chay1(boi);
    assert.strictEqual(kq.ma, MA_LOI.KHOA_MO_SAI);
    assert.strictEqual(tendoo.goiTheoLoai('dangNhap').length, 0);
});

test('CỬA CHẶN CHÉO: kho hàng thuộc cửa hàng khác → SAI_TAI_KHOAN', async () => {
    // Phiên nói đang ở CH_PA, nhưng hàng hóa đọc về mang mã cửa hàng khác.
    // Hai nguồn độc lập không khớp -> dừng, không đoán bên nào đúng.
    const tendoo = mayChu({ epLoi: { khoCuaCuaHangKhac: 'cua-hang-la-hoac' } });
    const kq = await chay1(await dungBoi(tendoo));
    assert.strictEqual(kq.ma, MA_LOI.SAI_TAI_KHOAN);
    assert.match(kq.thongBao, /không thuộc cửa hàng đang đăng nhập/);
});

test('máy chủ trả lỗi khi đọc kho → báo lỗi, không ghép bừa', async () => {
    const tendoo = mayChu({ epLoi: { khoHong: true } });
    const kq = await chay1(await dungBoi(tendoo));
    assert.strictEqual(kq.ma, MA_LOI.KHONG_DOC_DUOC_KHO);
});

// ─── GHÉP TIỀN ──────────────────────────────────────────────────────────────
ghiChu('— Ghép tiền —');

test('vượt tổng giá trị kho → KHONG_DU_HANG', async () => {
    const tendoo = mayChu();
    const kq = await chay1(await dungBoi(tendoo), 'PA', 900000000);
    assert.strictEqual(kq.ma, MA_LOI.KHONG_DU_HANG);
});

test('khoản nhỏ vẫn ghép được — trần là 200.000, không chặn theo tỷ lệ', async () => {
    // Kho rẻ nhất 490.000; doanh thu 369.698 -> lệch 120.302, dưới trần 200.000.
    const kq = await chay1(await dungBoi(mayChu()), 'PA', 369698);
    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.strictEqual(kq.ketQua.tong, 490000);
    assert.ok(Math.abs(kq.ketQua.lech) <= 200000);
});

test('lệch quá 200.000 → LECH_QUA_200K, có báo mức gần nhất', async () => {
    // 100.000 mà món rẻ nhất 490.000 -> không cách nào tới gần trong 200.000.
    const kq = await chay1(await dungBoi(mayChu()), 'PA', 100000);
    assert.strictEqual(kq.ma, MA_LOI.LECH_QUA_200K);
    assert.strictEqual(kq.dungSaiThuc, 200000);
    assert.ok(kq.tongGanNhat > 0);
});

test('LECH_QUA_200K và KHONG_DU_HANG KHÔNG làm dừng cả loạt', async () => {
    assert.ok(!HangDoi.LOI_DUNG_CA_LOAT.has(MA_LOI.LECH_QUA_200K));
    assert.ok(!HangDoi.LOI_DUNG_CA_LOAT.has(MA_LOI.KHONG_DU_HANG));
    assert.ok(!HangDoi.LOI_DUNG_CA_LOAT.has(MA_LOI.CHUA_KHAI_BAO));
});

// ─── CỬA CHẶN 2: ĐÚNG SỐ TIỀN ──────────────────────────────────────────────
ghiChu('— Cửa chặn 2: tổng phải khớp —');

test('bỏ giỏ, tổng khớp → cho qua nhưng vẫn CHƯA bấm Thanh toán', async () => {
    const tendoo = mayChu();
    const kq = await chay1(await dungBoi(tendoo, { boVaoGio: true }));
    assert.strictEqual(kq.ok, true);
    assert.strictEqual(kq.ketQua.daBoVaoGio, true);
    assert.strictEqual(kq.ketQua.tongTendoo, kq.ketQua.tong);
    assert.strictEqual(tendoo.goiTheoLoai('bamThanhToan').length, 0);
});

test('TỔNG LỆCH DÙ 1 ĐỒNG → KHÔNG bấm Thanh toán', async () => {
    const tendoo = mayChu({ epLoi: { tongLech: 9999999 } });
    const kq = await chay1(await dungBoi(tendoo, { boVaoGio: true, bamThanhToan: true }));
    assert.strictEqual(kq.ma, MA_LOI.TONG_KHONG_KHOP);
    assert.strictEqual(tendoo.goiTheoLoai('bamThanhToan').length, 0, 'ĐÃ BẤM DÙ TỔNG LỆCH!');
});

test('bỏ giỏ thất bại → không đi tiếp, không bấm', async () => {
    const tendoo = mayChu({ epLoi: { boGioHong: true } });
    const kq = await chay1(await dungBoi(tendoo, { boVaoGio: true, bamThanhToan: true }));
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(tendoo.goiTheoLoai('bamThanhToan').length, 0);
});

test('qua CẢ HAI cửa chặn thì mới bấm Thanh toán', async () => {
    const tendoo = mayChu();
    const kq = await chay1(await dungBoi(tendoo, { boVaoGio: true, bamThanhToan: true }));
    assert.strictEqual(kq.ok, true);
    assert.strictEqual(kq.ketQua.daBamThanhToan, true);
    assert.strictEqual(tendoo.goiTheoLoai('bamThanhToan').length, 1);
});

test('bật bấm Thanh toán mà chưa bật bỏ giỏ → TỪ CHỐI chạy', async () => {
    const tendoo = mayChu();
    const boi = await dungBoi(tendoo, { bamThanhToan: true });
    await assert.rejects(() => chay1(boi), /chưa bật boVaoGio/);
    assert.strictEqual(tendoo.goiTheoLoai('bamThanhToan').length, 0);
});

// ─── NỐI VỚI HÀNG ĐỢI ───────────────────────────────────────────────────────
ghiChu('— Nối với hàng đợi hàng loạt —');

function taoLuuTruTam() {
    let o = null;
    return { async doc() { return o ? JSON.parse(JSON.stringify(o)) : null; },
             async ghi(x) { o = x ? JSON.parse(JSON.stringify(x)) : null; } };
}

async function dungLoat(tendoo, boi) {
    const so = SoGhiDau.taoSo(taoLuuTruTam());
    await so.nap();
    const hd = HangDoi.taoHangDoi({
        so, khoaLuuTru: taoLuuTruTam(), mayId: 'may-test',
        tuyChon: { nguNghi: async () => {}, ngauNhien: () => 0 },
    });
    return { so, hd, thucThi: (lenh) => DieuPhoi.xuLyMotKhach(lenh, boi) };
}

test('chạy 2 khách qua hàng đợi — mỗi khách vào đúng cửa hàng của mình', async () => {
    const tendoo = mayChu();
    const boi = await dungBoi(tendoo);
    const { hd, thucThi } = await dungLoat(tendoo, boi);
    await hd.xepHang([
        { maKH: 'PA', soTien: 10000000 }, { maKH: 'TB', soTien: 8000000 },
    ]);
    const kq = await hd.chayLoat(thucThi);
    assert.strictEqual(kq.loi.length, 0, JSON.stringify(kq.loi));
    assert.strictEqual(kq.xong.length, 2);
    assert.strictEqual(kq.xong[0].ketQua.cuaHang, CH_PA);
    assert.strictEqual(kq.xong[1].ketQua.cuaHang, CH_TB);
});

test('một khách chưa khai báo → chỉ khách đó lỗi, khách sau vẫn chạy', async () => {
    const tendoo = mayChu();
    const boi = await dungBoi(tendoo);
    delete boi.kho.khach.PA;
    const { hd, thucThi } = await dungLoat(tendoo, boi);
    await hd.xepHang([{ maKH: 'PA', soTien: 10000000 }, { maKH: 'TB', soTien: 8000000 }]);
    const kq = await hd.chayLoat(thucThi);
    assert.strictEqual(kq.dung, false);
    assert.strictEqual(kq.loi.length, 1);
    assert.strictEqual(kq.xong.length, 1);
});

test('captcha giữa loạt → DỪNG CẢ LOẠT, khách sau bị bỏ', async () => {
    const tendoo = mayChu({ epLoi: { captcha: true } });
    const boi = await dungBoi(tendoo);
    const { hd, thucThi } = await dungLoat(tendoo, boi);
    await hd.xepHang([
        { maKH: 'PA', soTien: 10000000 }, { maKH: 'TB', soTien: 8000000 },
    ]);
    const kq = await hd.chayLoat(thucThi);
    assert.strictEqual(kq.dung, true);
    assert.strictEqual(kq.ly_do, 'CAPTCHA');
    assert.strictEqual(kq.bo, 1);
});


ghiChu('— ⭐ NHIỀU KHÁCH DÙNG CHUNG MỘT CỬA HÀNG TENDOO —');

/** Kho khai báo HAI khách trỏ về CÙNG một cửa hàng, cùng một tài khoản. */
async function boiChungCuaHang(tendoo) {
    const kho = await Kho.taoKho(KHOA_MO);
    const { khoa } = await Kho.moKho(kho, KHOA_MO);
    // Cả hai khách Sell dùng chung tài khoản Tendoo của CH_PA.
    await Kho.ghiKhach(kho, khoa, 'PA', { maCuaHang: CH_PA, tenDangNhap: 'pa@x', matKhau: 'MatKhauPA!1' });
    await Kho.ghiKhach(kho, khoa, 'TB', { maCuaHang: CH_PA, tenDangNhap: 'pa@x', matKhau: 'MatKhauPA!1' });
    return { kho, khoa, Kho, DanhTinh, DocSanPham, GhepTien, tendoo, tuyChon: {} };
}

test('⭐ hai khách chung cửa hàng: CHẠY ĐƯỢC CẢ HAI, không ai bị chặn', async () => {
    const tendoo = mayChu();
    const boi = await boiChungCuaHang(tendoo);
    const { hd, thucThi } = await dungLoat(tendoo, boi);
    await hd.xepHang([
        { maKH: 'PA', soTien: 10000000 }, { maKH: 'TB', soTien: 8000000 },
    ]);
    const kq = await hd.chayLoat(thucThi);
    assert.strictEqual(kq.loi.length, 0, JSON.stringify(kq.loi));
    assert.strictEqual(kq.xong.length, 2, 'không chạy đủ hai khách');
});

test('⭐ CẢ HAI hóa đơn ra ở ĐÚNG cửa hàng dùng chung', async () => {
    const tendoo = mayChu();
    const boi = await boiChungCuaHang(tendoo);
    const { hd, thucThi } = await dungLoat(tendoo, boi);
    await hd.xepHang([{ maKH: 'PA', soTien: 10000000 }, { maKH: 'TB', soTien: 8000000 }]);
    const kq = await hd.chayLoat(thucThi);
    assert.strictEqual(kq.xong[0].ketQua.cuaHang, CH_PA);
    assert.strictEqual(kq.xong[1].ketQua.cuaHang, CH_PA);
});

test('⭐ MỖI KHÁCH ra ĐÚNG SỐ TIỀN của mình, không lẫn sang nhau', async () => {
    // Đây là điều đáng sợ nhất khi chung giỏ: tiền khách này cộng sang khách kia.
    const tendoo = mayChu();
    const boi = await boiChungCuaHang(tendoo);
    const { hd, thucThi } = await dungLoat(tendoo, boi);
    await hd.xepHang([{ maKH: 'PA', soTien: 10000000 }, { maKH: 'TB', soTien: 8000000 }]);
    const kq = await hd.chayLoat(thucThi);

    const cua = (ma) => kq.xong.find((x) => x.maKH === ma).ketQua;
    assert.ok(Math.abs(cua('PA').tong - 10000000) <= 200000,
        'PA lệch quá xa: ' + cua('PA').tong);
    assert.ok(Math.abs(cua('TB').tong - 8000000) <= 200000,
        'TB lệch quá xa: ' + cua('TB').tong);
    // Tổng của TB tuyệt đối KHÔNG được mang theo hàng của PA.
    assert.ok(cua('TB').tong < 10000000,
        'tổng của TB nuốt luôn hàng của PA: ' + cua('TB').tong);
});

test('⭐ chung cửa hàng thì CHỈ ĐĂNG NHẬP MỘT LẦN, không đăng nhập lại giữa chừng', async () => {
    // Khớp cửa hàng sẵn nên bỏ qua bước đổi tài khoản — chạy nhanh hơn, và
    // KHÔNG có khoảng nào Tendoo bị đăng xuất giữa hai khách.
    const tendoo = mayChu();
    const boi = await boiChungCuaHang(tendoo);
    const { hd, thucThi } = await dungLoat(tendoo, boi);
    await hd.xepHang([{ maKH: 'PA', soTien: 10000000 }, { maKH: 'TB', soTien: 8000000 }]);
    await hd.chayLoat(thucThi);
    assert.strictEqual(tendoo.goiTheoLoai('dangNhap').length, 1,
        'đăng nhập ' + tendoo.goiTheoLoai('dangNhap').length + ' lần cho hai khách chung cửa hàng');
});

test('KHÁC cửa hàng thì vẫn phải đăng nhập lại — đối chứng', async () => {
    const tendoo = mayChu();
    const boi = await dungBoi(tendoo);          // PA và TB khác cửa hàng
    const { hd, thucThi } = await dungLoat(tendoo, boi);
    await hd.xepHang([{ maKH: 'PA', soTien: 10000000 }, { maKH: 'TB', soTien: 8000000 }]);
    await hd.chayLoat(thucThi);
    assert.strictEqual(tendoo.goiTheoLoai('dangNhap').length, 2,
        'khác cửa hàng mà không đăng nhập đủ hai lần');
});

test('⭐ ba khách chung một cửa hàng vẫn chạy tuần tự, đủ cả ba', async () => {
    const tendoo = mayChu();
    const boi = await boiChungCuaHang(tendoo);
    const { khoa } = await Kho.moKho(boi.kho, KHOA_MO);
    await Kho.ghiKhach(boi.kho, khoa, 'S8', { maCuaHang: CH_PA, tenDangNhap: 'pa@x', matKhau: 'MatKhauPA!1' });
    const { hd, thucThi } = await dungLoat(tendoo, boi);
    await hd.xepHang([
        { maKH: 'PA', soTien: 3000000 }, { maKH: 'TB', soTien: 5000000 },
        { maKH: 'S8', soTien: 7000000 },
    ]);
    const kq = await hd.chayLoat(thucThi);
    assert.strictEqual(kq.loi.length, 0, JSON.stringify(kq.loi));
    assert.deepStrictEqual(kq.xong.map((x) => x.maKH), ['PA', 'TB', 'S8'],
        'không chạy đủ ba khách theo đúng thứ tự');
    assert.strictEqual(tendoo.goiTheoLoai('dangNhap').length, 1);
});

test('⭐ khách sau LỖI thì khách trước VẪN GIỮ kết quả (chung cửa hàng)', async () => {
    const tendoo = mayChu();
    const boi = await boiChungCuaHang(tendoo);
    delete boi.kho.khach.TB;                     // TB mất khai báo
    const { hd, thucThi } = await dungLoat(tendoo, boi);
    await hd.xepHang([{ maKH: 'PA', soTien: 10000000 }, { maKH: 'TB', soTien: 8000000 }]);
    const kq = await hd.chayLoat(thucThi);
    assert.strictEqual(kq.xong.length, 1);
    assert.strictEqual(kq.xong[0].maKH, 'PA');
    assert.strictEqual(kq.loi.length, 1);
    assert.strictEqual(kq.loi[0].maKH, 'TB');
});

ghiChu('— ⭐ Kho: một cửa hàng kể ra ĐỦ khách —');

test('⭐ timCacKhachTheoCuaHang trả về MỌI khách, không chỉ người đầu', async () => {
    const kho = await Kho.taoKho(KHOA_MO);
    const { khoa } = await Kho.moKho(kho, KHOA_MO);
    for (const ma of ['PA', 'TB', 'S8']) {
        await Kho.ghiKhach(kho, khoa, ma, { maCuaHang: CH_PA, tenDangNhap: 'x', matKhau: 'M!1' });
    }
    await Kho.ghiKhach(kho, khoa, 'RIENG', { maCuaHang: CH_TB, tenDangNhap: 'y', matKhau: 'M!2' });

    assert.deepStrictEqual(Kho.timCacKhachTheoCuaHang(kho, CH_PA), ['PA', 'TB', 'S8']);
    assert.deepStrictEqual(Kho.timCacKhachTheoCuaHang(kho, CH_TB), ['RIENG']);
    assert.deepStrictEqual(Kho.timCacKhachTheoCuaHang(kho, 'khong-co'), []);
    assert.deepStrictEqual(Kho.timCacKhachTheoCuaHang(kho, ''), []);
    // Không phân biệt hoa thường, y như hàm cũ.
    assert.deepStrictEqual(Kho.timCacKhachTheoCuaHang(kho, CH_PA.toUpperCase()), ['PA', 'TB', 'S8']);
});

test('hàm cũ timTheoCuaHang vẫn chạy, trả về khách đầu tiên', async () => {
    const kho = await Kho.taoKho(KHOA_MO);
    const { khoa } = await Kho.moKho(kho, KHOA_MO);
    await Kho.ghiKhach(kho, khoa, 'PA', { maCuaHang: CH_PA, tenDangNhap: 'x', matKhau: 'M!1' });
    await Kho.ghiKhach(kho, khoa, 'TB', { maCuaHang: CH_PA, tenDangNhap: 'x', matKhau: 'M!1' });
    assert.strictEqual(Kho.timTheoCuaHang(kho, CH_PA), 'PA');
    assert.strictEqual(Kho.timTheoCuaHang(kho, 'khong-co'), null);
});

chay('ĐIỀU PHỐI — LUỒNG ĐẦU-CUỐI TRÊN MÁY CHỦ GIẢ LẬP');
