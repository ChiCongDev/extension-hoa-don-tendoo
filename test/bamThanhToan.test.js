'use strict';

// Test BẤM NÚT THANH TOÁN — giai đoạn 5.
// Chạy: node test/bamThanhToan.test.js   (cần biến HDT_JSDOM)
//
// Đây là hành động KHÔNG HOÀN TÁC ĐƯỢC. Test ở đây chủ yếu chứng minh những
// lúc nó PHẢI KHÔNG BẤM, chứ không phải lúc nó bấm được.

const assert = require('node:assert');
const { test, ghiChu, chay } = require('./chay');
require('../chung/domReact');
const BoGio = require('../tendoo/boGio');
globalThis.HDT_BoGio = BoGio;                 // bamThanhToan lấy qua globalThis
const Bam = require('../tendoo/bamThanhToan');
const { taoTrangPos } = require('./trangPosGiaLap');

const { MA } = Bam;
const nhanh = { nghi: async () => {}, doiSauBam: 0 };

/** Trang có sẵn hàng trong giỏ; trả kèm tổng đang hiện. */
function trangCoHang(gioBanDau = [{ ten: 'Quần Jogger thể thao nữ' }]) {
    const t = taoTrangPos({ gioBanDau });
    return { t, tong: t.tongHienTai() };
}

ghiChu('— ⛔ Năm điều kiện tiên quyết: thiếu một là KHÔNG BẤM —');

test('ĐK1: chưa cho phép → KHÔNG bấm', async () => {
    const { t, tong } = trangCoHang();
    const kq = await Bam.taoLuot().bam(t.tailieu, { tongMongDoi: tong, ...nhanh });
    assert.strictEqual(kq.ma, MA.CHUA_CHO_PHEP);
    assert.strictEqual(t.daBam.thanhToan, 0, '❌ ĐÃ BẤM khi chưa được cho phép');
});

test('ĐK1: choPhep phải đúng bằng true, không nhận giá trị "gần giống"', async () => {
    const { t, tong } = trangCoHang();
    for (const gt of [1, 'true', 'có', {}, [], 'yes']) {
        const kq = await Bam.taoLuot().bam(t.tailieu,
            { choPhep: gt, tongMongDoi: tong, ...nhanh });
        assert.strictEqual(kq.ma, MA.CHUA_CHO_PHEP, 'nhận nhầm giá trị: ' + String(gt));
    }
    assert.strictEqual(t.daBam.thanhToan, 0);
});

test('ĐK2: giỏ trống → KHÔNG bấm', async () => {
    const t = taoTrangPos();
    const kq = await Bam.taoLuot().bam(t.tailieu,
        { choPhep: true, tongMongDoi: 0, ...nhanh });
    assert.strictEqual(kq.ma, MA.GIO_TRONG);
    assert.strictEqual(t.daBam.thanhToan, 0);
});

test('ĐK3: TỔNG LỆCH DÙ 1 ĐỒNG → KHÔNG bấm', async () => {
    const { t, tong } = trangCoHang();
    for (const sai of [tong + 1, tong - 1, tong + 1000, 0, -tong]) {
        const kq = await Bam.taoLuot().bam(t.tailieu,
            { choPhep: true, tongMongDoi: sai, ...nhanh });
        assert.strictEqual(kq.ma, MA.TONG_KHONG_KHOP, 'lệch ' + (sai - tong));
    }
    assert.strictEqual(t.daBam.thanhToan, 0, '❌ ĐÃ BẤM dù tổng lệch');
});

test('ĐK3: tổng mong đợi không phải số → KHÔNG bấm', async () => {
    const { t } = trangCoHang();
    for (const sai of [undefined, null, NaN, 'nhiều', {}]) {
        const kq = await Bam.taoLuot().bam(t.tailieu,
            { choPhep: true, tongMongDoi: sai, ...nhanh });
        assert.strictEqual(kq.ma, MA.TONG_KHONG_KHOP);
    }
    assert.strictEqual(t.daBam.thanhToan, 0);
});

test('ĐK4: không thấy nút Thanh toán → báo lỗi, không bấm bừa nút khác', async () => {
    const { t, tong } = trangCoHang();
    t.tailieu.getElementById('nutThanhToan').remove();
    const kq = await Bam.taoLuot().bam(t.tailieu,
        { choPhep: true, tongMongDoi: tong, ...nhanh });
    assert.strictEqual(kq.ma, MA.KHONG_THAY_NUT);
    assert.strictEqual(t.daBam.luuDon, 0, '❌ đã bấm nhầm sang Lưu đơn');
});

test('ĐK4: nút bị khóa → KHÔNG bấm', async () => {
    const { t, tong } = trangCoHang();
    t.tailieu.getElementById('nutThanhToan').disabled = true;
    const kq = await Bam.taoLuot().bam(t.tailieu,
        { choPhep: true, tongMongDoi: tong, ...nhanh });
    assert.strictEqual(kq.ma, MA.NUT_BI_KHOA);
    assert.strictEqual(t.daBam.thanhToan, 0);
});

test('ĐK5: đã bấm rồi thì KHÔNG bấm lần hai', async () => {
    const { t, tong } = trangCoHang();
    const luot = Bam.taoLuot();
    await luot.bam(t.tailieu, { choPhep: true, tongMongDoi: tong, ...nhanh });
    assert.strictEqual(t.daBam.thanhToan, 1);

    for (let i = 0; i < 5; i++) {
        const lai = await luot.bam(t.tailieu, { choPhep: true, tongMongDoi: tong, ...nhanh });
        assert.strictEqual(lai.ma, MA.DA_BAM_ROI);
    }
    assert.strictEqual(t.daBam.thanhToan, 1, '❌ ĐÃ BẤM NHIỀU LẦN — xuất trùng hóa đơn!');
});

ghiChu('— Không bấm nhầm nút —');

test('chọn ĐÚNG nút Thanh toán, không nhầm sang Lưu đơn', () => {
    const { t } = trangCoHang();
    const nut = Bam.timNutThanhToan(t.tailieu);
    assert.ok(nut);
    assert.match(nut.textContent, /Thanh toán/);
    assert.ok(!/Lưu đơn/.test(nut.textContent));
});

test('bấm thành công KHÔNG đụng tới nút Lưu đơn', async () => {
    const { t, tong } = trangCoHang();
    await Bam.taoLuot().bam(t.tailieu, { choPhep: true, tongMongDoi: tong, ...nhanh });
    assert.strictEqual(t.daBam.thanhToan, 1);
    assert.strictEqual(t.daBam.luuDon, 0);
});

ghiChu('— Sau khi bấm —');

test('đủ điều kiện → qua BẢNG XÁC NHẬN rồi mới xong, giỏ trống đi', async () => {
    const { t, tong } = trangCoHang();
    const kq = await Bam.taoLuot().bam(t.tailieu, { choPhep: true, tongMongDoi: tong, ...nhanh });
    assert.strictEqual(kq.ok, true, JSON.stringify(kq));
    assert.strictEqual(kq.ma, MA.XONG);
    assert.strictEqual(kq.tongLucBam, tong);
    assert.strictEqual(t.daBam.thanhToan, 1, 'phải bấm Thanh toán đúng 1 lần');
    assert.strictEqual(t.daBam.xacNhan, 1, 'phải bấm Xác nhận đúng 1 lần');
    assert.deepStrictEqual(t.xemGio(), [], 'giỏ chưa trống sau khi phát hành');
});

test('⭐ bấm Xác nhận rồi mà giỏ CÒN NGUYÊN → KHÔNG RÕ, bắt người kiểm tra', async () => {
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }],
                            giuGioSauXacNhan: true });
    const kq = await Bam.taoLuot().bam(t.tailieu,
        { choPhep: true, tongMongDoi: t.tongHienTai(), ...nhanh });
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ma, MA.KHONG_RO);
    assert.match(kq.thongBao, /kiểm tra tận mắt/i);
    assert.match(kq.thongBao, /KHÔNG được bấm lại/i);
    assert.strictEqual(t.daBam.xacNhan, 1);
});

test('KHÔNG RÕ rồi thì vẫn KHÔNG cho bấm lại để "thử xem"', async () => {
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }],
                            giuGioSauXacNhan: true });
    const tong = t.tongHienTai();
    const luot = Bam.taoLuot();
    const kq1 = await luot.bam(t.tailieu, { choPhep: true, tongMongDoi: tong, ...nhanh });
    assert.strictEqual(kq1.ma, MA.KHONG_RO);
    const kq2 = await luot.bam(t.tailieu, { choPhep: true, tongMongDoi: tong, ...nhanh });
    assert.strictEqual(kq2.ma, MA.DA_BAM_ROI);
    assert.strictEqual(t.daBam.thanhToan, 1);
    assert.strictEqual(t.daBam.xacNhan, 1, '❌ bấm Xác nhận lần thứ hai');
});

test('mỗi LƯỢT là một lần bấm — lượt mới mới được bấm tiếp', async () => {
    const { t, tong } = trangCoHang([{ ten: 'Quần Jogger thể thao nữ' },
                                     { ten: 'Áo Gilet phao Thu Đông nữ' }]);
    const t2 = taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }] });
    await Bam.taoLuot().bam(t.tailieu, { choPhep: true, tongMongDoi: tong, ...nhanh });
    await Bam.taoLuot().bam(t2.tailieu,
        { choPhep: true, tongMongDoi: t2.tongHienTai(), ...nhanh });
    assert.strictEqual(t.daBam.thanhToan, 1);
    assert.strictEqual(t2.daBam.thanhToan, 1, 'lượt mới phải bấm được');
});

ghiChu('— ⛔ Ba chốt chặn NGAY TRONG bảng xác nhận —');

test('⭐ ĐK7: tổng TRONG BẢNG lệch → bấm Quay lại, TUYỆT ĐỐI không Xác nhận', async () => {
    // Chốt cuối cùng trước khi tiền thật thành hóa đơn thật.
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }],
                            tongBangXn: 999999 });
    const kq = await Bam.taoLuot().bam(t.tailieu,
        { choPhep: true, tongMongDoi: t.tongHienTai(), ...nhanh });
    assert.strictEqual(kq.ma, MA.BANG_SAI_TONG);
    assert.strictEqual(t.daBam.xacNhan, 0, '❌ ĐÃ PHÁT HÀNH với tổng sai');
    assert.strictEqual(t.daBam.quayLai, 1, 'phải hủy sạch bằng nút Quay lại');
    assert.match(kq.thongBao, /CHƯA phát hành/i);
});

test('⭐ ĐK8: công tắc "Ghi nợ" đang BẬT → bấm Quay lại, không phát hành', async () => {
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }], ghiNoBat: true });
    const kq = await Bam.taoLuot().bam(t.tailieu,
        { choPhep: true, tongMongDoi: t.tongHienTai(), ...nhanh });
    assert.strictEqual(kq.ma, MA.GHI_NO_DANG_BAT);
    assert.strictEqual(t.daBam.xacNhan, 0, '❌ phát hành hóa đơn GHI NỢ');
    assert.strictEqual(t.daBam.quayLai, 1);
});

test('⭐ bảng KHÔNG hiện ra → báo lỗi thường, KHÔNG phải "không rõ"', async () => {
    // Chưa qua bảng thì chắc chắn chưa có hóa đơn nào — không được treo oan.
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }],
                            khongMoBang: true });
    const kq = await Bam.taoLuot().bam(t.tailieu, {
        choPhep: true, tongMongDoi: t.tongHienTai(),
        nghi: async () => {}, doiSauBam: 0, hanChoBangMs: 40, nhipChoMs: 10,
    });
    assert.strictEqual(kq.ma, MA.KHONG_HIEN_BANG);
    assert.notStrictEqual(kq.ma, MA.KHONG_RO, '❌ treo oan trong khi chưa phát hành gì');
    assert.match(kq.thongBao, /CHƯA phát hành/i);
    assert.strictEqual(t.daBam.xacNhan, 0);
});

test('⭐ bảng không hiện MÀ giỏ trống đi → KHÔNG RÕ, tuyệt đối không dám nói đã xong', async () => {
    // Trước đây chỗ này suy ra "giỏ trống => chắc đã phát hành" và trả XONG,
    // trong khi nút "Xác nhận" CHƯA HỀ ĐƯỢC BẤM. Đó là suy đoán từ chỗ không
    // thấy gì. Hậu quả thật: màn hình báo "Xong 2 khách" mà chỉ có 1 hóa đơn.
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }],
                            khongMoBang: true });
    const tong = t.tongHienTai();
    t.xoaGio();                       // giỏ tự trống, bảng không hiện
    const kq = await Bam.taoLuot().bam(t.tailieu,
        { choPhep: true, tongMongDoi: tong, nghi: async () => {}, doiSauBam: 0,
          hanChoBangMs: 40, nhipChoMs: 10 });

    assert.notStrictEqual(kq.ma, MA.XONG, '❌ vẫn dám kết luận đã phát hành');
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(t.daBam.xacNhan, 0, 'chưa bấm Xác nhận mà dám báo xong');
});

test('⭐ trang có 2 bảng quảng cáo đè lên → vẫn tìm ĐÚNG nút Thanh toán', async () => {
    // Trang thật lúc nào cũng có "Trải nghiệm POS V2 ngay" và "Đóng" nổi lên.
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }] });
    assert.ok(t.tailieu.getElementById('bangPosV2'), 'trang giả thiếu bảng quảng cáo');
    const nut = Bam.timNutThanhToan(t.tailieu);
    assert.strictEqual(nut.id, 'nutThanhToan');
});

test('⭐ nút Thanh toán KHÔNG BAO GIỜ được lấy từ trong một bảng nổi', async () => {
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }] });
    // Cài bẫy: nhét đúng một nút mang chữ đó vào bảng quảng cáo.
    const bay = t.tailieu.createElement('button');
    bay.id = 'nutBay';
    bay.textContent = 'Thanh toán ngay với POS V2';
    t.tailieu.querySelector('#bangPosV2 .ant-modal-body').prepend(bay);
    assert.strictEqual(Bam.timNutThanhToan(t.tailieu).id, 'nutThanhToan',
        '❌ vớ nhầm nút trong bảng quảng cáo');
});

test('bảng xác nhận ĐÃ ĐÓNG thì không được coi là đang mở', async () => {
    // Ant chỉ đặt display:none, chữ vẫn đọc được — tìm theo chữ là nhận nhầm.
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }] });
    assert.strictEqual(Bam.timBangXacNhan(t.tailieu), null, 'bảng đóng mà báo là mở');
    t.tailieu.getElementById('nutThanhToan').click();
    assert.ok(Bam.timBangXacNhan(t.tailieu), 'bảng mở mà không thấy');
    t.tailieu.getElementById('xnQuayLai').click();
    assert.strictEqual(Bam.timBangXacNhan(t.tailieu), null, 'đóng rồi mà vẫn báo mở');
});

test('đọc đúng "Tổng cộng" trong bảng, không nhầm với "Tổng thanh toán" ở giỏ', async () => {
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }] });
    t.tailieu.getElementById('nutThanhToan').click();
    const bang = Bam.timBangXacNhan(t.tailieu);
    assert.strictEqual(Bam.docTongTrongBang(bang), t.tongHienTai());
});

ghiChu('— Đếm số lần bấm trong mọi tình huống —');

test('QUÉT: chỉ đúng MỘT tình huống được bấm, còn lại đều không', async () => {
    const caCanBam = [];
    const caKhongBam = [];

    // 1. Đủ điều kiện -> ĐƯỢC bấm
    {
        const { t, tong } = trangCoHang();
        await Bam.taoLuot().bam(t.tailieu, { choPhep: true, tongMongDoi: tong, ...nhanh });
        caCanBam.push(t.daBam.thanhToan);
    }
    // 2..n. Mỗi ca thiếu một điều kiện -> KHÔNG được bấm
    const caThieu = [
        (t, tong) => ({ tongMongDoi: tong }),                          // thiếu choPhep
        (t, tong) => ({ choPhep: true, tongMongDoi: tong + 1 }),       // tổng lệch
        (t, tong) => ({ choPhep: false, tongMongDoi: tong }),          // tắt tường minh
    ];
    for (const lam of caThieu) {
        const { t, tong } = trangCoHang();
        await Bam.taoLuot().bam(t.tailieu, { ...lam(t, tong), ...nhanh });
        caKhongBam.push(t.daBam.thanhToan);
    }
    // Giỏ trống
    {
        const t = taoTrangPos();
        await Bam.taoLuot().bam(t.tailieu, { choPhep: true, tongMongDoi: 0, ...nhanh });
        caKhongBam.push(t.daBam.thanhToan);
    }

    assert.deepStrictEqual(caCanBam, [1], 'ca đủ điều kiện phải bấm đúng 1 lần');
    assert.deepStrictEqual(caKhongBam, [0, 0, 0, 0], '❌ có ca thiếu điều kiện mà vẫn bấm');
});

test('⭐ ĐẾM CÚ PHÁT HÀNH THẬT: chỉ ca đủ điều kiện mới bấm "Xác nhận"', async () => {
    // Bấm "Thanh toán" chỉ mở bảng, chưa nguy hiểm. Con số THẬT SỰ đáng đếm là
    // số lần bấm "Xác nhận" — mỗi lần là một hóa đơn lên cơ quan thuế.
    const dem = [];
    const ca = [
        ['đủ điều kiện', () => taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }] }), 1],
        ['tổng trong bảng lệch',
            () => taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }], tongBangXn: 1 }), 0],
        ['ghi nợ đang bật',
            () => taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }], ghiNoBat: true }), 0],
        ['bảng không hiện',
            () => taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }], khongMoBang: true }), 0],
    ];
    for (const [ten, dung, mongDoi] of ca) {
        const t = dung();
        await Bam.taoLuot().bam(t.tailieu, {
            choPhep: true, tongMongDoi: t.tongHienTai(),
            nghi: async () => {}, doiSauBam: 0, hanChoBangMs: 40, nhipChoMs: 10,
        });
        dem.push([ten, t.daBam.xacNhan, mongDoi]);
    }
    for (const [ten, that, mongDoi] of dem) {
        assert.strictEqual(that, mongDoi, `ca "${ten}": bấm Xác nhận ${that} lần, đáng ra ${mongDoi}`);
    }
    // Chưa cho phép thì không được đụng gì hết.
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }] });
    await Bam.taoLuot().bam(t.tailieu, { tongMongDoi: t.tongHienTai(), ...nhanh });
    assert.strictEqual(t.daBam.thanhToan, 0);
    assert.strictEqual(t.daBam.xacNhan, 0);
});

ghiChu('— ⭐ Bảng chặn đường: chưa thiết lập quản lý thuế —');

const CHAM = { nghi: async () => {}, doiSauBam: 0, hanChoBangMs: 40, nhipChoMs: 10 };

test('⭐ tài khoản chưa thiết lập thuế → nói ĐÚNG BỆNH, không đổ cho "giao diện đổi"', async () => {
    // Gặp thật ngày 2026-08-12: bấm Thanh toán thì Tendoo bật bảng
    // "Chưa thiết lập quản lý thuế" THAY CHO bảng xác nhận.
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }], bangThue: true });
    const kq = await Bam.taoLuot().bam(t.tailieu,
        { choPhep: true, tongMongDoi: t.tongHienTai(), ...CHAM });

    assert.strictEqual(kq.ma, MA.CHUA_THIET_LAP_THUE);
    assert.match(kq.thongBao, /CHƯA THIẾT LẬP QUẢN LÝ THUẾ/);
    assert.match(kq.thongBao, /CHƯA phát hành hóa đơn nào/);
    assert.ok(!/giao diện Tendoo có thể đã đổi/i.test(kq.thongBao),
        '❌ vẫn đổ cho giao diện đổi — câu đã làm người dùng đi sai hướng cả một lượt');
});

test('⛔ TUYỆT ĐỐI không bấm "Bỏ qua" hay "Thiết lập quản lý thuế"', async () => {
    // Bỏ qua = số liệu Tờ khai thuế và Sổ kế toán sai. Đó là quyết định kế
    // toán của người dùng, không phải việc của một cái máy tự động.
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }], bangThue: true });
    await Bam.taoLuot().bam(t.tailieu, { choPhep: true, tongMongDoi: t.tongHienTai(), ...CHAM });
    assert.strictEqual(t.daBam.thueBoQua, 0, '❌ ĐÃ BẤM "Bỏ qua"');
    assert.strictEqual(t.daBam.thueThietLap, 0, '❌ ĐÃ BẤM "Thiết lập quản lý thuế"');
    assert.strictEqual(t.daBam.xacNhan, 0, '❌ ĐÃ PHÁT HÀNH dù bị chặn');
});

test('thông báo nói rõ HẬU QUẢ nếu bỏ qua, để người dùng cân nhắc', async () => {
    // Ca này trước đây đòi câu "Máy KHÔNG tự bấm Bỏ qua". Câu đó viết từ hồi
    // chưa có công tắc; giữ lại là nói dối khi công tắc bật. Điều CẦN giữ là
    // hậu quả phải luôn hiện ra, dù ở trạng thái nào.
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }], bangThue: true });
    const kq = await Bam.taoLuot().bam(t.tailieu,
        { choPhep: true, tongMongDoi: t.tongHienTai(), ...CHAM });
    assert.match(kq.thongBao, /Tờ khai thuế/);
    assert.match(kq.thongBao, /Sổ kế toán/);
    assert.match(kq.thongBao, /không chính xác/i);
});

test('⭐ bảng LẠ khác chặn đường → kể lại nội dung, không bấm gì', async () => {
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }], khongMoBang: true });
    const la = t.tailieu.createElement('div');
    la.className = 'ant-modal';
    la.textContent = 'Phiên làm việc đã hết hạn, vui lòng đăng nhập lại';
    t.tailieu.body.appendChild(la);

    const kq = await Bam.taoLuot().bam(t.tailieu,
        { choPhep: true, tongMongDoi: t.tongHienTai(), ...CHAM });
    assert.strictEqual(kq.ma, MA.BANG_LA_CHAN_DUONG);
    assert.match(kq.thongBao, /Phiên làm việc đã hết hạn/);
    assert.strictEqual(t.daBam.xacNhan, 0);
});

test('⭐ hai bảng quảng cáo quen thuộc KHÔNG bị báo nhầm là bảng lạ', async () => {
    // Chúng luôn có trên trang thật. Báo nhầm là người dùng đi tìm sai chỗ.
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }], khongMoBang: true });
    assert.ok(t.tailieu.getElementById('bangPosV2'), 'trang giả thiếu bảng quảng cáo');
    const kq = await Bam.taoLuot().bam(t.tailieu,
        { choPhep: true, tongMongDoi: t.tongHienTai(), ...CHAM });
    assert.strictEqual(kq.ma, MA.KHONG_HIEN_BANG, 'báo nhầm quảng cáo là bảng chặn đường');
});

test('bảng thuế đang ẨN thì không tính là chặn đường', async () => {
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }] });
    assert.strictEqual(Bam.timBangChanDuong(t.tailieu), null,
        'bảng đang display:none mà vẫn bị coi là chặn');
});

ghiChu('— ⭐ Bỏ qua cảnh báo thuế: Bỏ qua → Thanh toán lần nữa —');

const CHAM_THUE = { nghi: async () => {}, doiSauBam: 0, hanChoBangMs: 40,
                    nhipChoMs: 10, doiSauBoQua: 0 };

function trangThue() {
    return taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }], bangThue: true });
}

test('⭐ công tắc TẮT → vẫn dừng, KHÔNG bấm "Bỏ qua"', async () => {
    const t = trangThue();
    const kq = await Bam.taoLuot().bam(t.tailieu,
        { choPhep: true, tongMongDoi: t.tongHienTai(), ...CHAM_THUE });
    assert.strictEqual(kq.ma, MA.CHUA_THIET_LAP_THUE);
    assert.strictEqual(t.daBam.thueBoQua, 0, '❌ bỏ qua khi chưa được cho phép');
    assert.strictEqual(t.daBam.xacNhan, 0);
    assert.strictEqual(t.xemGio().length, 1, 'giỏ bị đụng dù đã dừng');
});

test('công tắc phải đúng BẰNG true, không nhận giá trị "gần giống"', async () => {
    for (const bua of [1, 'true', {}, 'x']) {
        const t = trangThue();
        const kq = await Bam.taoLuot().bam(t.tailieu,
            { choPhep: true, tongMongDoi: t.tongHienTai(), boQuaCanhBaoThue: bua, ...CHAM_THUE });
        assert.strictEqual(kq.ma, MA.CHUA_THIET_LAP_THUE, 'nhận bừa giá trị ' + JSON.stringify(bua));
        assert.strictEqual(t.daBam.thueBoQua, 0);
    }
});

test('⭐ công tắc BẬT → Bỏ qua → Thanh toán lần nữa → Xác nhận → hóa đơn ra', async () => {
    // Đúng luồng thật chủ dự án mô tả: bỏ qua xong bảng thuế chỉ ĐÓNG LẠI,
    // phải bấm "Thanh toán (F1)" lần nữa thì bảng xác nhận mới hiện.
    const t = trangThue();
    const luot = Bam.taoLuot();
    const kq = await luot.bam(t.tailieu,
        { choPhep: true, tongMongDoi: t.tongHienTai(), boQuaCanhBaoThue: true, ...CHAM_THUE });

    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.strictEqual(kq.ma, MA.XONG);
    assert.strictEqual(t.daBam.thueBoQua, 1, 'phải bấm "Bỏ qua" đúng một lần');
    assert.strictEqual(t.daBam.thanhToan, 2, 'phải bấm "Thanh toán" đúng hai lần');
    assert.strictEqual(t.daBam.xacNhan, 1, '"Xác nhận" phải đúng MỘT lần');
    assert.strictEqual(t.xemGio().length, 0, 'giỏ chưa trống — chưa phát hành?');
});

test('⛔ TUYỆT ĐỐI không bấm "Thiết lập quản lý thuế"', async () => {
    // Bấm nút đó là rời trang bán hàng, nhảy sang màn thiết lập thuế — đang
    // giữa một lượt chạy hàng loạt thì hỏng hết.
    for (const bat of [false, true]) {
        const t = trangThue();
        await Bam.taoLuot().bam(t.tailieu,
            { choPhep: true, tongMongDoi: t.tongHienTai(), boQuaCanhBaoThue: bat, ...CHAM_THUE });
        assert.strictEqual(t.daBam.thueThietLap, 0, '❌ ĐÃ BẤM "Thiết lập quản lý thuế"');
    }
});

test('⭐ TRẦN số lần bấm: Thanh toán ≤ 2, Bỏ qua ≤ 1, Xác nhận ≤ 1', async () => {
    const t = trangThue();
    const luot = Bam.taoLuot();
    await luot.bam(t.tailieu,
        { choPhep: true, tongMongDoi: t.tongHienTai(), boQuaCanhBaoThue: true, ...CHAM_THUE });
    assert.ok(t.daBam.thanhToan <= 2, 'bấm Thanh toán ' + t.daBam.thanhToan + ' lần');
    assert.ok(t.daBam.thueBoQua <= 1);
    assert.ok(t.daBam.xacNhan <= 1);
    assert.strictEqual(luot.soLanBamThanhToan(), t.daBam.thanhToan, 'đếm trong máy lệch thực tế');
});

test('⭐ KẾT QUẢ mang cờ "đã bỏ qua cảnh báo thuế"', async () => {
    // Người dùng cần đúng danh sách này khi làm sổ sách.
    const t = trangThue();
    const kq = await Bam.taoLuot().bam(t.tailieu,
        { choPhep: true, tongMongDoi: t.tongHienTai(), boQuaCanhBaoThue: true, ...CHAM_THUE });
    assert.strictEqual(kq.daBoQuaThue, true);
    assert.match(kq.thongBao, /CHƯA thiết lập quản lý thuế/);
});

test('không gặp bảng thuế → cờ phải là không, không đánh dấu bừa', async () => {
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }] });
    const kq = await Bam.taoLuot().bam(t.tailieu,
        { choPhep: true, tongMongDoi: t.tongHienTai(), boQuaCanhBaoThue: true, ...CHAM_THUE });
    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.ok(!kq.daBoQuaThue, 'đánh dấu bỏ qua thuế trong khi chẳng gặp bảng nào');
    assert.strictEqual(t.daBam.thanhToan, 1, 'bấm Thanh toán thừa lần');
});

test('⭐ KHÔNG VÒNG LẶP: bảng thuế hiện lại lần nữa → dừng hẳn', async () => {
    // Dựng cảnh xấu nhất: bấm Bỏ qua rồi bảng vẫn hiện lại. Nếu máy cứ bỏ qua
    // rồi bấm tiếp thì thành vòng lặp vô tận trên một trang bán hàng thật.
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }],
                            bangThue: true, thueLuonChan: true });
    const kq = await Bam.taoLuot().bam(t.tailieu,
        { choPhep: true, tongMongDoi: t.tongHienTai(), boQuaCanhBaoThue: true, ...CHAM_THUE });

    assert.strictEqual(kq.ok, false, 'phát hành dù bị chặn');
    assert.strictEqual(t.daBam.thueBoQua, 1, '❌ bấm "Bỏ qua" nhiều lần — vòng lặp');
    assert.ok(t.daBam.thanhToan <= 2, '❌ bấm Thanh toán quá 2 lần');
    assert.strictEqual(t.daBam.xacNhan, 0);
});

test('bảng thuế không có nút "Bỏ qua" → dừng, nói rõ chưa có hóa đơn', async () => {
    const t = trangThue();
    t.tailieu.getElementById('thueBoQua').remove();
    const kq = await Bam.taoLuot().bam(t.tailieu,
        { choPhep: true, tongMongDoi: t.tongHienTai(), boQuaCanhBaoThue: true, ...CHAM_THUE });
    assert.strictEqual(kq.ok, false);
    assert.match(kq.thongBao, /CHƯA phát hành hóa đơn nào/);
    assert.strictEqual(t.daBam.xacNhan, 0);
});

test('⭐ sau khi bỏ qua, TỔNG trong bảng vẫn phải khớp tuyệt đối', async () => {
    // Bỏ qua cảnh báo thuế KHÔNG được nới bất kỳ chốt chặn nào khác.
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }],
                            bangThue: true, tongBangXn: 999999 });
    const kq = await Bam.taoLuot().bam(t.tailieu,
        { choPhep: true, tongMongDoi: t.tongHienTai(), boQuaCanhBaoThue: true, ...CHAM_THUE });
    assert.strictEqual(kq.ma, MA.BANG_SAI_TONG);
    assert.strictEqual(t.daBam.xacNhan, 0, '❌ PHÁT HÀNH dù tổng lệch');
    assert.strictEqual(t.daBam.quayLai, 1, 'phải hủy bằng "Quay lại"');
});

test('⭐ sau khi bỏ qua, "Ghi nợ" BẬT vẫn phải dừng', async () => {
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }],
                            bangThue: true, ghiNoBat: true });
    const kq = await Bam.taoLuot().bam(t.tailieu,
        { choPhep: true, tongMongDoi: t.tongHienTai(), boQuaCanhBaoThue: true, ...CHAM_THUE });
    assert.strictEqual(kq.ma, MA.GHI_NO_DANG_BAT);
    assert.strictEqual(t.daBam.xacNhan, 0);
});

test('⛔ công tắc bỏ qua thuế KHÔNG thay được choPhep', async () => {
    // Bật bỏ qua thuế mà chưa cho phép tự bấm thì vẫn không được đụng gì.
    const t = trangThue();
    const kq = await Bam.taoLuot().bam(t.tailieu,
        { choPhep: false, tongMongDoi: t.tongHienTai(), boQuaCanhBaoThue: true, ...CHAM_THUE });
    assert.strictEqual(kq.ma, MA.CHUA_CHO_PHEP);
    assert.deepStrictEqual(
        [t.daBam.thanhToan, t.daBam.thueBoQua, t.daBam.xacNhan], [0, 0, 0]);
});

ghiChu('— ⭐ Thông báo phải nói ĐÚNG trạng thái công tắc —');

test('⭐ công tắc TẮT → thông báo phải CHỈ ĐƯỜNG tới công tắc', async () => {
    // Câu cũ chỉ ghi "Máy KHÔNG tự bấm Bỏ qua", không hề nhắc tới công tắc —
    // người dùng tưởng máy không bao giờ làm được việc đó, và phải đi hỏi.
    const t = trangThue();
    const kq = await Bam.taoLuot().bam(t.tailieu,
        { choPhep: true, tongMongDoi: t.tongHienTai(), ...CHAM_THUE });
    assert.strictEqual(kq.ma, MA.CHUA_THIET_LAP_THUE);
    assert.strictEqual(kq.daBatBoQuaThue, false);
    assert.match(kq.thongBao, /BẬT CÔNG TẮC/, '❌ không chỉ đường tới công tắc');
    assert.match(kq.thongBao, /Bỏ qua cảnh báo Chưa thiết lập quản lý thuế/,
        'không nói ĐÚNG TÊN công tắc — người dùng phải mò trong popup');
    assert.match(kq.thongBao, /popup/i);
    assert.match(kq.thongBao, /đang TẮT/, 'không nói rõ công tắc đang tắt');
    assert.match(kq.thongBao, /CHƯA phát hành hóa đơn nào/);
    // Vẫn phải khuyên cách đúng trước: tự thiết lập thuế.
    assert.match(kq.thongBao, /nên làm cách này/);
});

test('⭐ công tắc BẬT mà vẫn tắc → KHÔNG được nói "máy không tự bấm Bỏ qua"', async () => {
    // Đây là câu sai hoàn toàn ở bản cũ: máy đã bấm "Bỏ qua" rồi.
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }],
                            bangThue: true, thueLuonChan: true });
    const kq = await Bam.taoLuot().bam(t.tailieu,
        { choPhep: true, tongMongDoi: t.tongHienTai(), boQuaCanhBaoThue: true, ...CHAM_THUE });

    assert.strictEqual(kq.daBatBoQuaThue, true);
    assert.ok(!/Máy KHÔNG tự bấm/.test(kq.thongBao),
        '❌ vẫn nói máy không tự bấm, trong khi nó đã bấm');
    assert.ok(!/BẬT CÔNG TẮC/.test(kq.thongBao),
        'bảo bật công tắc trong khi công tắc đã bật');
    assert.match(kq.thongBao, /Đã bấm "Bỏ qua"/, 'không kể lại là đã bấm');
    assert.match(kq.thongBao, /VẪN chặn/);
    assert.match(kq.thongBao, /CHƯA phát hành hóa đơn nào/);
    assert.strictEqual(t.daBam.xacNhan, 0);
});

test('công tắc BẬT nhưng bảng thiếu nút "Bỏ qua" → nói rõ công tắc đang bật', async () => {
    const t = trangThue();
    t.tailieu.getElementById('thueBoQua').remove();
    const kq = await Bam.taoLuot().bam(t.tailieu,
        { choPhep: true, tongMongDoi: t.tongHienTai(), boQuaCanhBaoThue: true, ...CHAM_THUE });
    assert.match(kq.thongBao, /ĐANG BẬT/, 'không nói công tắc đang bật');
    assert.match(kq.thongBao, /không có nút "Bỏ qua"/);
    assert.match(kq.thongBao, /CHƯA phát hành hóa đơn nào/);
});

chay('PHÁT HÀNH HÓA ĐƠN — HAI BƯỚC');
