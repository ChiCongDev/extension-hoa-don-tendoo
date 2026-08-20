'use strict';

// THÔNG BÁO LỖI PHẢI MANG THEO BẰNG CHỨNG.
// Chạy: node test/keLaiManHinh.test.js   (cần biến HDT_JSDOM)
//
// ── HAI CA HỎNG THẬT, LƯỢT CHẠY 19/08/2026 ─────────────────────────────────
//
// 18:10 · Bích Ngọc S1 (5.230.000đ) — TREO
//   «Đã phát hành 1/3 hóa đơn (1.450.000) rồi dừng: Đã bấm "Xác nhận" nhưng
//    giỏ vẫn còn hàng — KHÔNG RÕ hóa đơn đã phát hành hay chưa.»
//
//   Máy dừng ĐÚNG: tiền có thể đã lên cơ quan thuế, bấm lại là hóa đơn trùng.
//   Nhưng nó KHÔNG KỂ LẠI nhìn thấy gì — không biết màn hình lúc ấy có bảng
//   nào, nút nào, giỏ còn mấy dòng. Đọc log xong vẫn không sửa được gì.
//
//   Đúng lỗ hổng đã làm mất trọn một ngày với bảng "nâng cấp giao diện". Tôi
//   đã vá nó ở bước bấm Thanh toán mà QUÊN bước Xác nhận.
//
// 18:00 · Phương Anh PA (10.200.000đ) — LỖI
//   «Đã bấm "Bỏ qua" nhưng bảng "Chưa thiết lập quản lý thuế" VẪN chặn đường.»
//
//   Câu này gộp HAI BỆNH khác hẳn nhau vào một:
//     · bảng ĐÓNG RỒI HIỆN LẠI -> tài khoản chưa thiết lập thuế, việc của
//       người dùng, vào Tendoo làm một lần là hết
//     · bảng CHƯA TỪNG ĐÓNG    -> nút bấm không ăn / giao diện đổi, LỖI CỦA
//       EXTENSION, người dùng có làm gì cũng vô ích
//   Chữa ở hai nơi hoàn toàn khác nhau mà log không phân biệt được.
//
// ⚠️ TOÀN BỘ TỆP NÀY CHỈ NÓI VỀ CHỮ. Không một chốt chặn nào được nới: giỏ
// không trống thì VẪN là KHÔNG RÕ, VẪN treo lệnh, VẪN cấm bấm lại. Có bài
// riêng ở dưới ghim đúng điều đó.

const assert = require('node:assert');
const { test, ghiChu, chay } = require('./chay');
require('../chung/domReact');
const BoGio = require('../tendoo/boGio');
const T = require('../tendoo/bamThanhToan');
const { taoTrangPos } = require('./trangPosGiaLap');

const { MA } = T;
const CHAM = { nghi: async () => {}, hanChoBangMs: 60, nhipChoMs: 10,
               hanChoThueDong: 40, doiSauBam: 40 };

/** Bấm một lượt trên trang có sẵn hàng trong giỏ. */
async function chayMotLuot(tuyChonTrang = {}, tuyChonBam = {}) {
    const trang = taoTrangPos({
        gioBanDau: [{ ten: 'Áo khoác dạ dáng dài nữ', soLuong: 2 }],   // 1.980.000
        ...tuyChonTrang,
    });
    const kq = await T.taoLuot().bam(trang.tailieu, {
        choPhep: true, tongMongDoi: 1980000, ...CHAM, ...tuyChonBam,
    });
    return { trang, kq };
}

ghiChu('— Giỏ không trống sau "Xác nhận": phải kể lại màn hình —');

test('⭐⭐ CA BÍCH NGỌC S1: thông báo KHÔNG RÕ phải mang theo bằng chứng', async () => {
    // `giuGioSauXacNhan`: bấm Xác nhận xong giỏ vẫn còn hàng — đúng cảnh 18:10.
    const { kq } = await chayMotLuot({ giuGioSauXacNhan: true });
    assert.strictEqual(kq.ma, MA.KHONG_RO, 'thông báo: ' + kq.thongBao);
    assert.match(kq.thongBao, /Máy nhìn thấy:/, 'không kể lại màn hình: ' + kq.thongBao);
    assert.match(kq.thongBao, /giỏ còn \d+ dòng/, kq.thongBao);
    assert.match(kq.thongBao, /tổng [\d.]+đ/, kq.thongBao);
});

test('⭐ nói rõ ĐÃ CHỜ BAO LÂU, đừng bắt người đọc tự đoán', async () => {
    const { kq } = await chayMotLuot({ giuGioSauXacNhan: true }, { doiSauBam: 2000 });
    assert.match(kq.thongBao, /giỏ vẫn còn hàng sau 2 giây/, kq.thongBao);
});

test('⭐⭐ có bảng lạ đè lên sau khi Xác nhận → phải KỂ TÊN NÓ và TÊN CÁC NÚT', async () => {
    // Nếu ca 18:10 là do một bảng nào đó bật lên ngay sau cú Xác nhận, thì đây
    // chính là dòng chữ sẽ phá được án — y như với bảng "nâng cấp giao diện".
    const trang = taoTrangPos({
        gioBanDau: [{ ten: 'Áo khoác dạ dáng dài nữ', soLuong: 2 }],
        giuGioSauXacNhan: true,
    });
    // Bấm "Xác nhận" xong thì một bảng lạ bật lên và giỏ đứng im. Gắn sau bản
    // giả nên chạy sau nó — đúng thứ tự thật.
    trang.tailieu.getElementById('xnXacNhan').addEventListener('click', () => {
        trang.tailieu.getElementById('bangNangCap').style.display = '';
    });
    const kq = await T.taoLuot().bam(trang.tailieu,
        { choPhep: true, tongMongDoi: 1980000, ...CHAM });

    assert.strictEqual(kq.ma, MA.KHONG_RO, 'thông báo: ' + kq.thongBao);
    assert.match(kq.thongBao, /có bảng khác đang mở/, kq.thongBao);
    assert.match(kq.thongBao, /nâng cấp giao diện bán hàng/, kq.thongBao);
    assert.match(kq.thongBao, /nút:/, 'không kể tên nút: ' + kq.thongBao);
    assert.match(kq.thongBao, /«Trải nghiệm ngay»/, kq.thongBao);
});

test('⭐ kể được cả khi bảng xác nhận VẪN còn mở', async () => {
    const trang = taoTrangPos({ gioBanDau: [{ ten: 'Áo khoác dạ dáng dài nữ', soLuong: 2 }],
                                giuGioSauXacNhan: true, giuBangSauXacNhan: true });
    const kq = await T.taoLuot().bam(trang.tailieu,
        { choPhep: true, tongMongDoi: 1980000, ...CHAM });
    assert.strictEqual(kq.ma, MA.KHONG_RO);
    assert.match(kq.thongBao, /bảng xác nhận VẪN đang mở/, kq.thongBao);
});

ghiChu('— ⛔ CHỈ THÊM CHỮ, KHÔNG NỚI CHỐT NÀO —');

test('⛔⛔ giỏ không trống thì VẪN là KHÔNG RÕ, VẪN cấm bấm lại', async () => {
    const { trang, kq } = await chayMotLuot({ giuGioSauXacNhan: true });
    assert.strictEqual(kq.ok, false, 'KHÔNG được coi là xong');
    assert.strictEqual(kq.ma, MA.KHONG_RO);
    assert.match(kq.thongBao, /KHÔNG được bấm lại/, kq.thongBao);
    assert.match(kq.thongBao, /kiểm tra tận mắt/, kq.thongBao);
    assert.strictEqual(trang.daBam.xacNhan, 1, '"Xác nhận" vẫn phải đúng MỘT lần');
});

test('⛔ giỏ trống bình thường thì vẫn XONG, không dính chữ thừa', async () => {
    const { kq } = await chayMotLuot();
    assert.strictEqual(kq.ma, MA.XONG, 'thông báo: ' + kq.thongBao);
    assert.ok(!/Máy nhìn thấy:/.test(kq.thongBao), 'lối thành công bị dính chữ chẩn đoán');
});

ghiChu('— keLaiManHinh: chỉ nhìn và kể, KHÔNG BAO GIỜ ném lỗi —');

test('⛔⛔ hỏng cỡ nào cũng không được ném — nó chạy trên đường thoát', () => {
    // Ném ở đây là nuốt mất luôn cái thông báo người dùng đang cần đọc.
    for (const xau of [null, undefined, {}, { querySelectorAll: () => { throw new Error('vỡ'); } }]) {
        const r = T.keLaiManHinh(xau);
        assert.strictEqual(typeof r, 'string', 'phải trả về chuỗi với: ' + String(xau));
        assert.ok(r.length > 0);
    }
});

test('màn hình sạch thì nói là sạch', () => {
    const trang = taoTrangPos();
    const chu = T.keLaiManHinh(trang.tailieu);
    assert.match(chu, /không có bảng nào đang mở/, chu);
    assert.match(chu, /giỏ còn 0 dòng/, chu);
});

test('đọc được số dòng và tổng của giỏ đang có hàng', () => {
    const trang = taoTrangPos({ gioBanDau: [
        { ten: 'Áo khoác dạ dáng dài nữ', soLuong: 2 },   // 1.980.000
        { ten: 'Quần Jogger thể thao nữ', soLuong: 1 },   //   490.000
    ] });
    const chu = T.keLaiManHinh(trang.tailieu);
    assert.match(chu, /giỏ còn 2 dòng/, chu);
    assert.match(chu, /2\.470\.000đ/, chu);
});

ghiChu('— Bảng thuế: TÁCH HAI BỆNH —');

test('⭐⭐ CA PHƯƠNG ANH: đóng rồi HIỆN LẠI → chỉ đúng việc của người dùng', async () => {
    const { kq } = await chayMotLuot(
        { bangThue: true, thueLuonChan: true }, { boQuaCanhBaoThue: true });
    assert.strictEqual(kq.ma, MA.CHUA_THIET_LAP_THUE);
    assert.strictEqual(kq.thueDaDongLai, true);
    assert.match(kq.thongBao, /ĐÃ ĐÓNG/, kq.thongBao);
    assert.match(kq.thongBao, /HIỆN LẠI/, kq.thongBao);
    assert.match(kq.thongBao, /thiết lập MỘT LẦN cho tài khoản này/, kq.thongBao);
    assert.ok(!/lỗi của extension/.test(kq.thongBao), 'đổ oan cho extension: ' + kq.thongBao);
});

test('⭐⭐ CHƯA TỪNG ĐÓNG → phải nhận đây là LỖI CỦA EXTENSION', async () => {
    // Bấm "Bỏ qua" mà bảng đứng im. Người dùng có vào Tendoo thiết lập thuế
    // cũng vô ích — nói sai bệnh là đẩy họ đi làm một việc không cứu được gì.
    const { kq } = await chayMotLuot(
        { bangThue: true, thueKhongDong: true }, { boQuaCanhBaoThue: true });
    assert.strictEqual(kq.ma, MA.CHUA_THIET_LAP_THUE);
    assert.strictEqual(kq.thueDaDongLai, false);
    assert.match(kq.thongBao, /KHÔNG ĐÓNG trong/, kq.thongBao);
    assert.match(kq.thongBao, /lỗi của extension/, kq.thongBao);
    assert.ok(!/thiết lập MỘT LẦN/.test(kq.thongBao),
        'bảo người dùng đi thiết lập thuế trong khi lỗi nằm ở máy: ' + kq.thongBao);
});

test('⛔ hai bệnh phải ra hai thông báo KHÁC NHAU', async () => {
    const a = await chayMotLuot({ bangThue: true, thueLuonChan: true },
                                { boQuaCanhBaoThue: true });
    const b = await chayMotLuot({ bangThue: true, thueKhongDong: true },
                                { boQuaCanhBaoThue: true });
    assert.notStrictEqual(a.kq.thongBao, b.kq.thongBao,
        'hai bệnh khác nhau mà ra cùng một câu — đúng lỗi đang chữa');
});

test('⛔ cả hai bệnh đều KHÔNG được phát hành gì', async () => {
    for (const tt of [{ thueLuonChan: true }, { thueKhongDong: true }]) {
        const { trang, kq } = await chayMotLuot({ bangThue: true, ...tt },
                                                { boQuaCanhBaoThue: true });
        assert.strictEqual(trang.daBam.xacNhan, 0, 'đã xác nhận: ' + JSON.stringify(tt));
        assert.strictEqual(trang.daBam.thueThietLap, 0, 'bấm nút rời khỏi trang bán hàng');
        assert.match(kq.thongBao, /CHƯA phát hành hóa đơn nào/, kq.thongBao);
        assert.ok(trang.daBam.thueBoQua <= 1, 'bấm "Bỏ qua" quá một lần');
    }
});

test('công tắc TẮT thì thông báo giữ nguyên như cũ, không dính chữ mới', async () => {
    const { kq } = await chayMotLuot({ bangThue: true });
    assert.strictEqual(kq.ma, MA.CHUA_THIET_LAP_THUE);
    assert.match(kq.thongBao, /BẬT CÔNG TẮC/, kq.thongBao);
    assert.ok(!/ĐÃ ĐÓNG|KHÔNG ĐÓNG trong/.test(kq.thongBao),
        'nhánh công tắc TẮT bị dính chữ của nhánh BẬT: ' + kq.thongBao);
});

ghiChu('— chuThoiGian —');

test('ghi thời gian cho người đọc, không bắt tự chia', () => {
    assert.strictEqual(T.chuThoiGian(8000), '8 giây');
    assert.strictEqual(T.chuThoiGian(4000), '4 giây');
    assert.strictEqual(T.chuThoiGian(1000), '1 giây');
    assert.strictEqual(T.chuThoiGian(600), '600ms');
    assert.strictEqual(T.chuThoiGian(40), '40ms');
    // ⚠️ 60ms từng bị ghi thành "0 giây" — vô nghĩa với người đọc log.
    assert.strictEqual(T.chuThoiGian(60), '60ms');
});

chay('THÔNG BÁO LỖI PHẢI MANG THEO BẰNG CHỨNG');
