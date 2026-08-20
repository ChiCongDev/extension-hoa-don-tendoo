'use strict';

// Test cho hai ADAPTER đọc dữ liệu Tendoo, chạy trên BẢN GHI THẬT lưu ở
// test/mau/. Không gọi mạng, không cần đăng nhập, không cần trình duyệt.

const assert = require('node:assert');
const { test, ghiChu, chay } = require('./chay');
const DocSanPham = require('../tendoo/docSanPham');
const DanhTinh = require('../tendoo/danhTinh');

const mauSanPham = require('./mau/sanPham.json');
const mauPhien = require('./mau/phienDangNhap.json');

const MA_CUA_HANG_THAT = '2c683a17-09ab-4655-8dbf-50ca8105373c';

// Sao chép sâu để mỗi ca test sửa mẫu mà không ảnh hưởng ca khác.
const ban = o => JSON.parse(JSON.stringify(o));

// ─── ĐỌC SẢN PHẨM ───────────────────────────────────────────────────────────
ghiChu('— Đọc sản phẩm từ API —');

test('đọc đúng giá, tồn, tên từ bản ghi thật', () => {
    const kq = DocSanPham.chuanHoaTrang(mauSanPham);
    assert.strictEqual(kq.hang.length, 3);
    const ao = kq.hang.find(h => h.ma === 'SP0095');
    assert.strictEqual(ao.ten, 'Áo khoác dạ dáng dài nữ');
    assert.strictEqual(ao.gia, 990000);
    assert.strictEqual(ao.ton, 22);
});

test('BẪY 1: is_out_of_stock=true nhưng còn 22 cái → KHÔNG được loại', () => {
    // Toàn bộ mẫu thật đều có is_out_of_stock=true, kể cả hàng còn đầy kho.
    assert.strictEqual(mauSanPham.data[0].is_out_of_stock, true);
    assert.strictEqual(mauSanPham.data[0].available_quantity, 22);
    const kq = DocSanPham.chuanHoaTrang(mauSanPham);
    assert.ok(kq.hang.some(h => h.ma === 'SP0095'), 'đã loại nhầm hàng còn tồn');
});

test('BẪY 2: khóa là id (UUID), KHÔNG phải chữ trên thẻ hàng', () => {
    const kq = DocSanPham.chuanHoaTrang(mauSanPham);
    const ao = kq.hang.find(h => h.ma === 'SP0095');
    // "ÁKDDDN" hiện trên POS chỉ là chữ cái đầu của tên, không có trong dữ liệu.
    assert.strictEqual(ao.id, '006b5c43-c052-4bb8-aa0f-971ae291334e');
    assert.notStrictEqual(ao.ma, 'ÁKDDDN');
});

test('BẪY 3: is_active=false trên mọi mẫu → không được dùng để lọc', () => {
    assert.ok(mauSanPham.data.every(sp => sp.is_active === false));
    assert.strictEqual(DocSanPham.chuanHoaTrang(mauSanPham).hang.length, 3);
});

test('hết hàng (available_quantity = 0) thì bị loại, có ghi lý do', () => {
    const m = ban(mauSanPham);
    m.data[1].available_quantity = 0;
    const kq = DocSanPham.chuanHoaTrang(m);
    assert.strictEqual(kq.hang.length, 2);
    assert.strictEqual(kq.boQua[0].lyDo, DocSanPham.LY_DO_BO.HET_HANG);
});

test('giá 0 hoặc âm thì bị loại', () => {
    const m = ban(mauSanPham);
    m.data[0].final_price = 0;
    m.data[0].base_price = 0;
    const kq = DocSanPham.chuanHoaTrang(m);
    assert.strictEqual(kq.hang.length, 2);
    assert.strictEqual(kq.boQua[0].lyDo, DocSanPham.LY_DO_BO.GIA_KHONG_HOP_LE);
});

test('hàng NHIỀU BIẾN THỂ bị bỏ qua chứ không đoán bừa', () => {
    const m = ban(mauSanPham);
    m.data[0].variant_mode = 'variant';
    const kq = DocSanPham.chuanHoaTrang(m);
    assert.strictEqual(kq.hang.length, 2);
    assert.strictEqual(kq.boQua[0].lyDo, DocSanPham.LY_DO_BO.NHIEU_BIEN_THE);
});

test('ưu tiên final_price (đã tính khuyến mãi) hơn base_price', () => {
    const m = ban(mauSanPham);
    m.data[0].base_price = 990000;
    m.data[0].final_price = 790000;
    const kq = DocSanPham.chuanHoaTrang(m);
    assert.strictEqual(kq.hang.find(h => h.ma === 'SP0095').gia, 790000);
});

test('phản hồi hỏng / success=false thì BÁO LỖI, không trả kho rỗng', () => {
    assert.throws(() => DocSanPham.chuanHoaTrang({ success: false }));
    assert.throws(() => DocSanPham.chuanHoaTrang(null));
    assert.throws(() => DocSanPham.chuanHoaTrang({ success: true, data: 'hỏng' }));
});

// ─── LẬT TRANG ──────────────────────────────────────────────────────────────
ghiChu('— Lật hết trang —');

/** Giả lập máy chủ: 177 sản phẩm, mỗi trang 10 → 18 trang, đúng như thật. */
function mayChuGiaLap({ tongSanPham = 177, coTrang = 10, maCuaHang = MA_CUA_HANG_THAT } = {}) {
    const daGoi = [];
    const goiTrang = async (trang) => {
        daGoi.push(trang);
        const dau = (trang - 1) * coTrang;
        const data = [];
        for (let i = dau; i < Math.min(dau + coTrang, tongSanPham); i++) {
            data.push({
                id: `sp-${i}`, name: `Hàng ${i}`, product_code: `SP${i}`,
                variant_mode: 'non_variant', business_id: maCuaHang,
                final_price: 100000, base_price: 100000,
                available_quantity: 5, is_out_of_stock: true, is_active: false, version: 2,
            });
        }
        return {
            success: true, data,
            meta: { total: tongSanPham, size: coTrang, page: trang,
                    total_pages: Math.ceil(tongSanPham / coTrang) },
        };
    };
    return { goiTrang, daGoi };
}

test('lấy trọn 177 sản phẩm qua 18 trang', async () => {
    const { goiTrang, daGoi } = mayChuGiaLap();
    const kq = await DocSanPham.layTatCa(goiTrang);
    assert.strictEqual(kq.hang.length, 177);
    assert.strictEqual(daGoi.length, 18);
    assert.strictEqual(kq.tongTheoMayChu, 177);
});

test('tin total_pages CỦA MÁY CHỦ, không tự suy từ cỡ trang mình xin', async () => {
    // Xin 100/trang nhưng máy chủ vẫn trả 10/trang → phải đọc đủ 18 trang.
    const { goiTrang, daGoi } = mayChuGiaLap({ coTrang: 10 });
    const kq = await DocSanPham.layTatCa(goiTrang);
    assert.strictEqual(daGoi.length, 18);
    assert.strictEqual(kq.hang.length, 177);
});

test('trùng id giữa các trang → giữ một, KHÔNG cộng dồn tồn kho', async () => {
    const goiTrang = async (trang) => ({
        success: true,
        data: [{ id: 'trung', name: 'Trùng', product_code: 'X', variant_mode: 'non_variant',
                 business_id: MA_CUA_HANG_THAT, final_price: 100000,
                 available_quantity: 5, version: 2 }],
        meta: { total: 2, size: 1, page: trang, total_pages: 2 },
    });
    const kq = await DocSanPham.layTatCa(goiTrang);
    assert.strictEqual(kq.hang.length, 1);
    assert.strictEqual(kq.hang[0].ton, 5, 'tồn kho bị cộng dồn — sẽ đặt quá số hàng có');
});

test('có chặn trần số trang, không lặp vô tận', async () => {
    const goiTrang = async (trang) => ({
        success: true, data: [],
        meta: { total: 1e9, size: 1, page: trang, total_pages: 999999 },
    });
    const kq = await DocSanPham.layTatCa(goiTrang, { tranSoTrang: 5 });
    assert.strictEqual(kq.soTrangDaDoc, 5);
});

test('kho lẫn nhiều cửa hàng → maCuaHang = null (coi như KHÔNG XÁC ĐỊNH)', async () => {
    let n = 0;
    const goiTrang = async (trang) => ({
        success: true,
        data: [{ id: `sp-${n++}`, name: 'H', product_code: 'X', variant_mode: 'non_variant',
                 business_id: trang === 1 ? MA_CUA_HANG_THAT : 'cua-hang-khac',
                 final_price: 100000, available_quantity: 5, version: 2 }],
        meta: { total: 2, size: 1, page: trang, total_pages: 2 },
    });
    const kq = await DocSanPham.layTatCa(goiTrang);
    assert.strictEqual(kq.maCuaHang, null);
});

// ─── DANH TÍNH + CHỐT CHẶN ──────────────────────────────────────────────────
ghiChu('— Chốt chặn nhầm tài khoản —');

test('đọc đúng mã cửa hàng từ bản ghi thật', () => {
    const dt = DanhTinh.doc(mauPhien);
    assert.strictEqual(dt.maCuaHang, MA_CUA_HANG_THAT);
    assert.strictEqual(dt.tenTaiKhoan, 'CH THUỲ DƯƠNG');
    assert.strictEqual(dt.vaiTro, 'Chủ cửa hàng');
});

test('mã cửa hàng trong `info` KHỚP business_id trong sản phẩm', () => {
    // Đây là điểm neo cho phép đối chiếu chéo: kho hàng đọc về có đúng là của
    // cửa hàng đang đăng nhập không.
    const dt = DanhTinh.doc(mauPhien);
    const sp = DocSanPham.chuanHoaTrang(mauSanPham);
    assert.strictEqual(dt.maCuaHang, sp.maCuaHang);
});

test('đúng cửa hàng → cho đi tiếp', () => {
    const kq = DanhTinh.doiChieu(DanhTinh.doc(mauPhien), MA_CUA_HANG_THAT);
    assert.strictEqual(kq.khop, true);
});

test('SAI cửa hàng → chặn, và nói rõ đang đăng nhập ai', () => {
    const kq = DanhTinh.doiChieu(DanhTinh.doc(mauPhien), 'mot-cua-hang-khac');
    assert.strictEqual(kq.khop, false);
    assert.ok(kq.lyDo.includes('CH THUỲ DƯƠNG'));
});

test('TỪ CHỐI THEO MẶC ĐỊNH: chưa khai báo tài khoản → chặn', () => {
    for (const rong of ['', null, undefined, '   ']) {
        assert.strictEqual(DanhTinh.doiChieu(DanhTinh.doc(mauPhien), rong).khop, false);
    }
});

test('TỪ CHỐI THEO MẶC ĐỊNH: đọc không được danh tính → chặn', () => {
    for (const hong of [null, {}, { data: {} }, { data: { business_info: {} } }]) {
        assert.strictEqual(DanhTinh.doc(hong), null);
        assert.strictEqual(DanhTinh.doiChieu(DanhTinh.doc(hong), MA_CUA_HANG_THAT).khop, false);
    }
});

test('thiếu current_store.id → coi như không đọc được, KHÔNG lấy tạm tên', () => {
    const m = ban(mauPhien);
    delete m.data.business_info.current_store.id;
    assert.strictEqual(DanhTinh.doc(m), null);
});

test('so mã cửa hàng không phân biệt hoa thường (UUID)', () => {
    const kq = DanhTinh.doiChieu(DanhTinh.doc(mauPhien), MA_CUA_HANG_THAT.toUpperCase());
    assert.strictEqual(kq.khop, true);
});

test('tài khoản chỉ có 1 cửa hàng → xác nhận KHÔNG có chuyện đổi shop', () => {
    // max_store_count = 1 nghĩa là mỗi khách buộc phải một tài khoản riêng,
    // đúng như đã chốt — không thể một tài khoản nhảy qua lại nhiều cửa hàng.
    assert.strictEqual(DanhTinh.doc(mauPhien).soCuaHangToiDa, 1);
});

chay('TENDOO — ĐỌC SẢN PHẨM & CHỐT CHẶN TÀI KHOẢN');
