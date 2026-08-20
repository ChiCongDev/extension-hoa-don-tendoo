'use strict';

// Test BẢNG THỬ nổi trên trang POS — công cụ nghiệm thu giai đoạn 4c.
// Chạy: node test/bangThu.test.js   (cần biến HDT_JSDOM)
//
// Cả file này dựng bảng KHÔNG truyền bộ bấm Thanh toán -> mọi ca đều phải
// KHÔNG có cú bấm nào. Phần công tắc tự bấm (giai đoạn 5) test riêng ở
// test/bangThuTuBam.test.js.

const assert = require('node:assert');
const { test, ghiChu, chay } = require('./chay');
require('../chung/domReact');
const BangThu = require('../tendoo/bangThu');
const BoGio = require('../tendoo/boGio');
const DocSanPham = require('../tendoo/docSanPham');
const DanhTinh = require('../tendoo/danhTinh');
const GhepTien = require('../chung/ghepTien');
const { taoTrangPos, HANG_MAU } = require('./trangPosGiaLap');

const CH = '2c683a17-09ab-4655-8dbf-50ca8105373c';

/** Bộ nối giả: trả sản phẩm đúng bằng kho của trang POS giả. */
function boNoiGia({ hang = HANG_MAU, maCuaHang = CH, hong = null } = {}) {
    return {
        async layPhien() {
            if (hong === 'phien') throw new Error('máy chủ lỗi');
            return {
                success: true,
                data: {
                    account: { display_name: 'CH THUỲ DƯƠNG', max_store_count: 1 },
                    business_info: { current_store: { id: maCuaHang, store_name: 'CH THUỲ DƯƠNG' },
                                     current_role: { role_name: 'Chủ cửa hàng' } },
                },
            };
        },
        async goiTrangSanPham(trang) {
            if (hong === 'sanPham') throw new Error('Tendoo trả lỗi 500');
            return {
                success: true,
                data: hang.map((h, i) => ({
                    id: 'sp-' + i, name: h.ten, product_code: 'SP' + i,
                    variant_mode: 'non_variant', business_id: maCuaHang,
                    base_price: h.gia, final_price: h.gia,
                    available_quantity: h.ton, is_out_of_stock: true, is_active: false, version: 2,
                })),
                meta: { total: hang.length, size: 200, page: trang, total_pages: 1 },
            };
        },
    };
}

function dung(tuyChon = {}) {
    const trang = taoTrangPos({ gioBanDau: tuyChon.gioBanDau || [] });
    const bang = BangThu.taoBang(trang.tailieu, {
        DocSanPham, DanhTinh, GhepTien, BoGio,
        taoBoNoi: () => boNoiGia(tuyChon),
    });
    return { trang, bang, td: trang.tailieu };
}

ghiChu('— Bảng hiện ra —');

test('dựng được bảng, có ô nhập và hai nút', () => {
    const { td } = dung();
    assert.ok(td.getElementById(BangThu.ID_BANG), 'không thấy bảng');
    assert.ok(td.getElementById('hdt-thu-so-tien'));
    assert.ok(td.getElementById('hdt-thu-chay'));
    assert.ok(td.getElementById('hdt-thu-xoa'));
});

test('có cảnh báo nói rõ CHƯA thanh toán', () => {
    const { td } = dung();
    assert.match(td.getElementById('hdt-thu-canh').textContent, /không bấm Thanh toán/i);
    assert.match(td.getElementById(BangThu.ID_BANG).textContent, /CHƯA thanh toán/i);
});

test('hiện cửa hàng đang đăng nhập sau khi nạp danh tính', async () => {
    const { td, bang } = dung();
    await bang.napDanhTinh();
    const chu = td.getElementById('hdt-thu-cua-hang').textContent;
    assert.ok(chu.includes('CH THUỲ DƯƠNG'));
    assert.ok(chu.includes(CH));
});

test('bấm × thì ẩn bảng, không đụng gì tới trang', () => {
    const { td, trang } = dung();
    td.getElementById('hdt-thu-dong').click();
    assert.strictEqual(td.getElementById(BangThu.ID_BANG), null);
    assert.strictEqual(trang.xemGio().length, 0);
    assert.strictEqual(trang.daBam.thanhToan, 0);
});

ghiChu('— Chạy thử —');

test('ghép và bỏ hàng vào giỏ thật', async () => {
    const { td, trang, bang } = dung();
    await bang.chay(3000000);
    const kq = bang.ketQua();
    assert.strictEqual(kq.dat, true, kq.chu);
    assert.ok(trang.xemGio().length > 0, 'giỏ vẫn trống');
    assert.strictEqual(trang.tongHienTai(), kq.tong);
    assert.match(td.getElementById('hdt-thu-ket-qua').textContent, /Hãy KIỂM TRA giỏ/);
});

test('kết quả hiện đủ từng món và đối chiếu tổng của Tendoo', async () => {
    const { td, bang } = dung();
    await bang.chay(3000000);
    const chu = td.getElementById('hdt-thu-ket-qua').textContent;
    for (const d of bang.ketQua().chon) assert.ok(chu.includes(d.ten), 'thiếu ' + d.ten);
    assert.match(chu, /Tendoo hiện/);
    assert.match(chu, /✓ khớp/);
});

test('số tiền gõ có dấu chấm vẫn đọc đúng', async () => {
    const { td, bang } = dung();
    td.getElementById('hdt-thu-so-tien').value = '3.000.000';
    td.getElementById('hdt-thu-chay').click();
    // Quy trình thật có quãng nghỉ giữa mỗi món (cố ý, để giao diện Tendoo kịp
    // vẽ lại) -> chờ theo điều kiện chứ không chờ cứng.
    for (let i = 0; i < 200 && !bang.ketQua(); i++) await new Promise(r => setTimeout(r, 50));
    assert.ok(bang.ketQua(), 'chạy mãi không ra kết quả');
    assert.strictEqual(bang.ketQua().dat, true, bang.ketQua().chu);
});

test('không nhập số tiền → nhắc nhở, KHÔNG đụng vào giỏ', async () => {
    const { trang, bang } = dung();
    await bang.chay(0);
    assert.match(bang.ketQua().chu, /nhập số tiền/i);
    assert.strictEqual(trang.xemGio().length, 0);
});

test('nút "Xóa sạch giỏ" dọn được giỏ', async () => {
    const { trang, bang } = dung({ gioBanDau: [
        { ten: 'Quần Jogger thể thao nữ' }, { ten: 'Áo khoác dạ dáng dài nữ', soLuong: 2 },
    ] });
    await bang.xoaGio();
    assert.strictEqual(trang.xemGio().length, 0);
    assert.strictEqual(trang.daBam.thanhToan, 0);
});

ghiChu('— Mọi đường hỏng đều dừng đàng hoàng —');

test('giỏ đang có hàng → báo lỗi, không bỏ chồng lên', async () => {
    const { trang, bang } = dung({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }] });
    await bang.chay(3000000);
    assert.strictEqual(bang.ketQua().dat, false);
    // Thông báo phải chỉ rõ CÓ MẤY MÓN và NÚT XÓA Ở ĐÂU — người dùng đang
    // đứng ở tab Sell, nút lại nằm ở tab Tendoo.
    assert.match(bang.ketQua().chu, /đang có sẵn 1 món/);
    assert.match(bang.ketQua().chu, /Xóa sạch giỏ/);
    assert.match(bang.ketQua().chu, /góc dưới bên phải/);
    assert.strictEqual(trang.xemGio().length, 1);
});

test('kho hàng thuộc cửa hàng KHÁC → dừng, không đụng giỏ', async () => {
    const trang = taoTrangPos();
    const bang = BangThu.taoBang(trang.tailieu, {
        DocSanPham, DanhTinh, GhepTien, BoGio,
        taoBoNoi: () => ({
            layPhien: boNoiGia().layPhien,
            goiTrangSanPham: boNoiGia({ maCuaHang: 'cua-hang-la' }).goiTrangSanPham,
        }),
    });
    await bang.chay(3000000);
    assert.strictEqual(bang.ketQua().dat, false);
    assert.match(bang.ketQua().chu, /không thuộc cửa hàng đang đăng nhập/);
    assert.strictEqual(trang.xemGio().length, 0);
});

test('số tiền quá lớn so với kho → báo không đủ hàng', async () => {
    const { trang, bang } = dung();
    await bang.chay(900000000);
    assert.strictEqual(bang.ketQua().dat, false);
    assert.match(bang.ketQua().chu, /không đủ hàng/i);
    assert.strictEqual(trang.xemGio().length, 0);
});

test('máy chủ lỗi khi đọc sản phẩm → báo lỗi, không đụng giỏ', async () => {
    const { trang, bang } = dung({ hong: 'sanPham' });
    await bang.chay(3000000);
    assert.strictEqual(bang.ketQua().dat, false);
    assert.match(bang.ketQua().chu, /Lỗi/);
    assert.strictEqual(trang.xemGio().length, 0);
});

test('không đọc được phiên đăng nhập → dừng ngay', async () => {
    const { trang, bang } = dung({ hong: 'phien' });
    await bang.chay(3000000);
    assert.strictEqual(bang.ketQua().dat, false);
    assert.strictEqual(trang.xemGio().length, 0);
});

test('bấm hai lần liên tiếp không chạy chồng', async () => {
    const { td, bang } = dung();
    const p = bang.chay(3000000);
    const nut = td.getElementById('hdt-thu-chay');
    assert.strictEqual(nut.disabled, true, 'nút phải bị khóa trong lúc đang làm');
    await p;
    assert.strictEqual(td.getElementById('hdt-thu-chay').disabled, false);
});

ghiChu('— ⛔ KHÔNG BẤM khi chưa nạp bộ bấm (mọi ca trong file này) —');
// LƯU Ý: từ giai đoạn 5, bảng CÓ thể bấm Thanh toán — nhưng chỉ khi được
// truyền vào bộ bấm VÀ người dùng bật công tắc VÀ tick xác nhận. Cả file này
// dựng bảng KHÔNG truyền bộ bấm, nên tuyệt đối không được có cú bấm nào.
// Phần công tắc được test riêng ở test/bangThuTuBam.test.js.

test('chạy thành công vẫn KHÔNG bấm Thanh toán / Lưu đơn', async () => {
    const { trang, bang } = dung();
    await bang.chay(3000000);
    assert.strictEqual(trang.daBam.thanhToan, 0, '❌ ĐÃ BẤM THANH TOÁN — phát hành hóa đơn thật!');
    assert.strictEqual(trang.daBam.luuDon, 0);
});

test('mọi đường LỖI cũng không bấm', async () => {
    for (const ca of [{ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }] },
                      { hong: 'sanPham' }, { hong: 'phien' }]) {
        const { trang, bang } = dung(ca);
        await bang.chay(3000000);
        assert.strictEqual(trang.daBam.thanhToan, 0, '❌ ĐÃ BẤM THANH TOÁN trên đường lỗi!');
    }
});

test('KHÔNG truyền bộ bấm → bảng không hiện công tắc, không có đường nào bấm', async () => {
    const { td, bang, trang } = dung();
    await bang.chay(3000000);
    assert.strictEqual(td.getElementById('hdt-thu-khoi-tu-bam'), null,
        'hiện công tắc dù chưa nạp bộ bấm');
    assert.strictEqual(trang.daBam.thanhToan, 0);
});

test('đường bấm duy nhất phải đi qua công tắc — không có lối tắt trong mã nguồn', () => {
    const ma = require('fs').readFileSync(
        require('path').join(__dirname, '..', 'tendoo', 'bangThu.js'), 'utf8');
    // Chỉ được có ĐÚNG MỘT chỗ gọi bấm, và chỗ đó phải nằm sau kiểm tra công tắc.
    const soLanGoiBam = (ma.match(/luot\.bam\s*\(/g) || []).length;
    assert.strictEqual(soLanGoiBam, 1, 'có nhiều hơn một chỗ gọi bấm Thanh toán');
    assert.ok(/if \(!\(BamThanhToan && tuBam && daHieu\)\)/.test(ma),
        'thiếu chốt chặn "phải bật công tắc + tick xác nhận" trước khi bấm');
    assert.ok(!/nutThanhToan/.test(ma), 'bảng chạm thẳng vào nút thanh toán, bỏ qua bộ bấm!');
});

chay('BẢNG THỬ TRÊN TRANG POS');
