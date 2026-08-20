'use strict';

// Test BỘ NHẬN LỆNH trên trang POS — phần xử lý một khách và DỌN GIỎ.
// Chạy: node test/nhanLenh.test.js   (cần biến HDT_JSDOM)
//
// Trọng tâm: "dọn dẹp thứ MÌNH bày ra, không đụng thứ người khác bày."

const assert = require('node:assert');
const { test, ghiChu, chay } = require('./chay');
require('../chung/domReact');
const BoGio = require('../tendoo/boGio');
globalThis.HDT_BoGio = BoGio;
const BamThanhToan = require('../tendoo/bamThanhToan');
const NhanLenh = require('../tendoo/nhanLenh');
const DanhTinh = require('../tendoo/danhTinh');
const DocSanPham = require('../tendoo/docSanPham');
const GhepTien = require('../chung/ghepTien');
const { taoTrangPos, HANG_MAU } = require('./trangPosGiaLap');

const CH = '2c683a17-09ab-4655-8dbf-50ca8105373c';

function boNoiGia(maCuaHang = CH) {
    return {
        async layPhien() {
            return { success: true, data: {
                account: { display_name: 'CH THUỲ DƯƠNG', max_store_count: 1 },
                business_info: { current_store: { id: maCuaHang, store_name: 'CH THUỲ DƯƠNG' },
                                 current_role: { role_name: 'Chủ cửa hàng' } } } };
        },
        async goiTrangSanPham(trang) {
            return { success: true,
                data: HANG_MAU.map((h, i) => ({
                    id: 'sp-' + i, name: h.ten, product_code: 'SP' + i,
                    variant_mode: 'non_variant', business_id: maCuaHang,
                    base_price: h.gia, final_price: h.gia,
                    available_quantity: h.ton, is_out_of_stock: true, version: 2 })),
                meta: { total: HANG_MAU.length, size: 200, page: trang, total_pages: 1 } };
        },
    };
}

function dung({ gioBanDau = [], tuBam = false, khai = { PA: CH } } = {}) {
    const trang = taoTrangPos({ gioBanDau });
    const khach = {};
    for (const [ma, ch] of Object.entries(khai)) {
        khach[ma] = { maCuaHang: ch, tenDangNhap: 'x', matKhauMaHoa: { iv: 'a', duLieu: 'b' } };
    }
    const boi = {
        tailieu: trang.tailieu,
        DanhTinh, DocSanPham, GhepTien, BoGio,
        BamThanhToan: tuBam ? BamThanhToan : null,
        taoBoNoi: () => boNoiGia(),
        docCaiDat: async () => ({ tuBam, daHieu: tuBam, docDuoc: true }),
        docKhoTaiKhoan: async () => ({ khach }),
    };
    return { trang, boi };
}

const lenh = (them = {}) => ({ maKH: 'PA', tenKH: 'Phương Anh', soTien: 3000000, ...them });

ghiChu('— Xử lý một khách —');

test('đủ điều kiện → bỏ hàng vào giỏ, tổng khớp', async () => {
    const { trang, boi } = dung();
    const kq = await NhanLenh.xuLyMotLenh(lenh(), boi);
    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.strictEqual(kq.ketQua.daBoVaoGio, true);
    assert.strictEqual(kq.ketQua.tongTendoo, kq.ketQua.tong);
    assert.strictEqual(trang.daBam.thanhToan, 0, '❌ đã bấm Thanh toán khi công tắc TẮT');
});

test('chưa khai báo tài khoản → dừng, không đụng giỏ', async () => {
    const { trang, boi } = dung({ khai: {} });
    const kq = await NhanLenh.xuLyMotLenh(lenh(), boi);
    assert.strictEqual(kq.ma, 'CHUA_KHAI_BAO');
    assert.strictEqual(trang.xemGio().length, 0);
});

test('khai báo trỏ cửa hàng KHÁC → SAI_TAI_KHOAN, không đụng giỏ', async () => {
    const { trang, boi } = dung({ khai: { PA: 'cua-hang-khac-0000' } });
    const kq = await NhanLenh.xuLyMotLenh(lenh(), boi);
    assert.strictEqual(kq.ma, 'SAI_TAI_KHOAN');
    assert.match(kq.thongBao, /Hãy đăng nhập Tendoo bằng tài khoản của/);
    assert.strictEqual(trang.xemGio().length, 0);
});

ghiChu('— Giỏ đang có hàng của người dùng —');

test('giỏ chưa trống → báo rõ CÓ MẤY MÓN và NÚT XÓA Ở ĐÂU', async () => {
    const { trang, boi } = dung({ gioBanDau: [
        { ten: 'Quần Jogger thể thao nữ' }, { ten: 'Áo khoác dạ dáng dài nữ', soLuong: 2 },
    ] });
    const kq = await NhanLenh.xuLyMotLenh(lenh(), boi);
    assert.strictEqual(kq.ok, false);
    assert.match(kq.thongBao, /đang có sẵn 2 món/);
    assert.match(kq.thongBao, /Xóa sạch giỏ/);
    assert.match(kq.thongBao, /góc dưới bên phải/);
    assert.strictEqual(trang.xemGio().length, 2, 'đã bỏ thêm vào giỏ của người dùng');
});

test('KHÔNG tự xóa giỏ của người dùng', async () => {
    const { trang, boi } = dung({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }] });
    await NhanLenh.xuLyMotLenh(lenh(), boi);
    assert.deepStrictEqual(trang.xemGio().map(d => d.ten), ['Quần Jogger thể thao nữ'],
        'đã tự ý xóa giỏ mà người dùng đang bày dở');
});

ghiChu('— ⭐ Dọn dẹp thứ MÌNH bày ra —');

test('CÒN khách phía sau → tự dọn giỏ để khách kế tiếp chạy được', async () => {
    const { trang, boi } = dung();
    const kq = await NhanLenh.xuLyMotLenh(lenh({ conKhachPhiaSau: true }), boi);
    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.strictEqual(kq.ketQua.daDonGio, true);
    assert.strictEqual(trang.xemGio().length, 0, 'chưa dọn giỏ — khách kế tiếp sẽ bị chặn');
    assert.match(kq.ketQua.chuThich, /dọn để chạy khách kế tiếp/);
});

test('khách CUỐI → GIỮ NGUYÊN giỏ để người dùng kiểm tra', async () => {
    const { trang, boi } = dung();
    const kq = await NhanLenh.xuLyMotLenh(lenh({ conKhachPhiaSau: false }), boi);
    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.ok(trang.xemGio().length > 0, 'đã dọn mất giỏ của khách cuối');
    assert.match(kq.ketQua.chuThich, /bạn tự bấm Thanh toán/);
});

test('không truyền cờ → coi như khách cuối, giữ giỏ', async () => {
    const { trang, boi } = dung();
    await NhanLenh.xuLyMotLenh(lenh(), boi);
    assert.ok(trang.xemGio().length > 0);
});

test('hai khách nối tiếp: khách 2 chạy được nhờ khách 1 đã dọn', async () => {
    const { trang, boi } = dung({ khai: { PA: CH, TB: CH } });
    const k1 = await NhanLenh.xuLyMotLenh(lenh({ conKhachPhiaSau: true }), boi);
    assert.strictEqual(k1.ok, true, k1.thongBao);
    assert.strictEqual(trang.xemGio().length, 0);

    const k2 = await NhanLenh.xuLyMotLenh(
        { maKH: 'TB', tenKH: 'Trang Bé', soTien: 2000000, conKhachPhiaSau: false }, boi);
    assert.strictEqual(k2.ok, true, k2.thongBao);
    assert.ok(trang.xemGio().length > 0, 'khách cuối phải còn giỏ để kiểm tra');
});

test('dọn giỏ thất bại → BÁO LỖI chứ không coi là xong', async () => {
    const { trang, boi } = dung();
    // Gỡ nút xóa dòng -> không dọn được.
    const goc = BoGio.xoaSachGio;
    BoGio.xoaSachGio = async () => ({ ok: false, thongBao: 'không thấy nút xóa' });
    try {
        const kq = await NhanLenh.xuLyMotLenh(lenh({ conKhachPhiaSau: true }), boi);
        assert.strictEqual(kq.ok, false);
        assert.strictEqual(kq.ma, 'KHONG_DON_DUOC_GIO');
        assert.match(kq.thongBao, /khách kế tiếp sẽ bị chặn/);
    } finally {
        BoGio.xoaSachGio = goc;
    }
    assert.strictEqual(trang.daBam.thanhToan, 0);
});

test('công tắc BẬT → Tendoo tự dọn sau khi phát hành, mình không dọn thêm', async () => {
    const { trang, boi } = dung({ tuBam: true });
    // Tendoo thật dọn sạch giỏ sau khi phát hành. Trang giả phải dọn CẢ dữ
    // liệu bên trong chứ không chỉ xóa phần hiển thị, nếu không test đỏ oan.
    // Gắn tai nghe theo kiểu ỦY QUYỀN: giỏ trống thì trang thật CHƯA có nút
    // "Thanh toán (F1)" (đo 2026-08-12), nút chỉ hiện khi giỏ đã có hàng.
    trang.tailieu.addEventListener('click', (su) => {
        if (su.target && su.target.id === 'nutThanhToan') {
            trang.tailieu.querySelectorAll('#cacDongGio .xoa').forEach(b => b.click());
        }
    });
    const kq = await NhanLenh.xuLyMotLenh(lenh({ conKhachPhiaSau: true }), boi);
    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.strictEqual(kq.ketQua.daBamThanhToan, true);
    assert.strictEqual(trang.daBam.thanhToan, 1);
    assert.strictEqual(trang.xemGio().length, 0);
});

ghiChu('— Phạm vi mở rộng: chỉ làm việc ở ĐÚNG trang bán hàng —');

/** Chạy `tuChay()` của nhanLenh.js trên một trang giả, trả về tai nghe đã gắn. */
function ganTaiNghe(duongDan) {
    const fs = require('fs');
    const path = require('path');
    const vm = require('vm');
    const { JSDOM } = require(process.env.HDT_JSDOM || 'jsdom');

    const dom = new JSDOM('<!doctype html><body></body>', {
        url: 'https://seller-v3.tendoo.vn' + duongDan,
        runScripts: 'outside-only',
    });
    const cuaSo = dom.window;
    const cacTai = [];
    cuaSo.chrome = {
        runtime: { onMessage: { addListener: (f) => cacTai.push(f) } },
        storage: { local: { async get() { return {}; } } },
    };
    // Đủ bộ phận để "sẵn sàng" chỉ còn phụ thuộc đúng một điều: đường dẫn.
    // ⚠️ Danh sách này phải KHỚP với BO_PHAN_BAT_BUOC trong nhanLenh.js. Thiếu
    // một cái ở đó thì tab nạp hụt vẫn được báo "sẵn sàng" rồi chết giữa chừng —
    // đúng chuyện đã xảy ra ngày 2026-08-13 với HDT_DoiTaiKhoan.
    for (const t of ['HDT_BoNoi', 'HDT_DocSanPham', 'HDT_DanhTinh', 'HDT_GhepTien',
                     'HDT_ChiaHoaDon', 'HDT_DomReact', 'HDT_BamThanhToan',
                     'HDT_DoiTaiKhoan', 'HDT_DauGio', 'HDT_CaiDat']) {
        cuaSo[t] = {};
    }
    cuaSo.HDT_BoGio = { docCacDongGio: () => [] };

    const ma = fs.readFileSync(path.join(__dirname, '..', 'tendoo', 'nhanLenh.js'), 'utf8');
    vm.runInContext(ma, dom.getInternalVMContext(), { filename: 'tendoo/nhanLenh.js' });

    return {
        cuaSo,
        soTai: cacTai.length,
        hoi: (tin) => new Promise((xong) => {
            let daTraLoi = false;
            const co = cacTai.some(f => f(tin, {}, (kq) => { daTraLoi = true; xong(kq); }));
            if (!daTraLoi && !co) xong(null);
        }),
    };
}

test('⭐ ở trang /callback → báo CHƯA SẮN SÀNG dù đủ bộ phận', async () => {
    // Đây chính là trang mà trình duyệt dừng lại sau khi đăng nhập. Nó tự
    // nhận là sẵn sàng thì cầu nối sẽ gửi lệnh bỏ hàng vào một trang không có giỏ.
    const t = ganTaiNghe('/callback?step=success&callback=/sales/pos');
    const kq = await t.hoi({ loai: 'hdt-hoi-san-sang' });
    assert.strictEqual(kq.sanSang, false, '❌ trang /callback tự nhận là sẵn sàng');
    assert.ok(kq.thieu.some(x => /dang-o-trang-khac/.test(x)), JSON.stringify(kq.thieu));
});

test('ở đúng /sales/pos → báo SẮN SÀNG', async () => {
    const t = ganTaiNghe('/sales/pos');
    const kq = await t.hoi({ loai: 'hdt-hoi-san-sang' });
    assert.strictEqual(kq.sanSang, true, JSON.stringify(kq.thieu));
});

test('⭐ nhận lệnh xử lý ở trang KHÁC → từ chối thẳng, chưa làm gì cả', async () => {
    const t = ganTaiNghe('/orders');
    const kq = await t.hoi({ loai: 'hdt-xu-ly-khach', lenh: { maKH: 'PA', soTien: 1000 } });
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ma, 'KHONG_PHAI_TRANG_POS');
    assert.match(kq.thongBao, /chưa làm gì/i);
});

test('hỏi danh tính thì trả lời ở MỌI trang — đó là việc cần làm sớm', async () => {
    // Khác với lệnh xử lý: đọc danh tính chỉ đọc localStorage + gọi API, không
    // đụng gì tới giao diện, nên làm ở đâu cũng đúng và càng sớm càng tốt.
    const t = ganTaiNghe('/callback');
    const kq = await t.hoi({ loai: 'hdt-lay-danh-tinh' });
    assert.ok(kq && typeof kq.maCuaHang === 'string', 'không trả lời ở trang /callback');
});

test('trang KHÔNG thuộc tendoo.vn → không gắn tai nghe nào', () => {
    const fs = require('fs');
    const path = require('path');
    const vm = require('vm');
    const { JSDOM } = require(process.env.HDT_JSDOM || 'jsdom');
    const dom = new JSDOM('<!doctype html><body></body>',
        { url: 'https://bongtom.store/bao-cao-khach-hang', runScripts: 'outside-only' });
    const cacTai = [];
    dom.window.chrome = { runtime: { onMessage: { addListener: (f) => cacTai.push(f) } } };
    vm.runInContext(
        fs.readFileSync(path.join(__dirname, '..', 'tendoo', 'nhanLenh.js'), 'utf8'),
        dom.getInternalVMContext(), { filename: 'tendoo/nhanLenh.js' });
    assert.strictEqual(cacTai.length, 0, '❌ gắn tai nghe trên trang ngoài Tendoo');
});

ghiChu('— ⭐ Tự dọn giỏ: chỉ dọn thứ do CHÍNH MÁY để lại —');

const DauGio = require('../chung/dauGio');
const BoGioThat = require('../tendoo/boGio');
const { taoTrangPos: taoPos } = require('./trangPosGiaLap');

/** Bộ phận tối thiểu cho donGioConSot, trên một trang POS thật-như-thật. */
function dungDonGio({ dau = null, xoaGioLa = false, gioBanDau = [] } = {}) {
    const trang = taoPos({ gioBanDau });
    let dauHienTai = dau;
    return {
        trang,
        layDau: () => dauHienTai,
        boi: {
            tailieu: trang.tailieu,
            BoGio: BoGioThat,
            DauGio,
            docDauGio: async () => dauHienTai,
            xoaDauGio: async () => { dauHienTai = null; },
            docCaiDat: async () => ({ tuBam: false, daHieu: false, xoaGioLa }),
        },
    };
}

const MOT_MON = [{ ten: 'Quần Jogger thể thao nữ' }];

test('giỏ đã trống → không làm gì, báo xong ngay', async () => {
    const d = dungDonGio();
    const kq = await NhanLenh.donGioConSot(d.boi);
    assert.strictEqual(kq.ok, true);
    assert.strictEqual(kq.ma, 'GIO_DA_TRONG');
    assert.strictEqual(kq.daXoa, 0);
});

test('⭐ giỏ KHỚP dấu của máy → tự dọn sạch, xóa luôn dấu', async () => {
    const d = dungDonGio({ gioBanDau: MOT_MON });
    const dau = DauGio.taoDau({
        maKH: 'PA',
        danhSach: [{ ten: 'Quần Jogger thể thao nữ', soLuong: 1 }],
        tong: d.trang.tongHienTai(),
    });
    d.boi.docDauGio = async () => dau;
    const kq = await NhanLenh.donGioConSot(d.boi);

    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.strictEqual(kq.ma, 'DA_XOA_GIO_CUA_MAY');
    assert.strictEqual(kq.daXoa, 1);
    assert.deepStrictEqual(d.trang.xemGio(), [], 'giỏ chưa sạch');
    assert.match(kq.thongBao, /khách PA/);
});

test('⭐ giỏ KHÔNG khớp dấu → TỪ CHỐI, giữ nguyên hàng của người dùng', async () => {
    // Đây là điều quan trọng nhất cả tính năng: xóa nhầm hàng người dùng
    // đang chọn dở là làm hỏng việc thật, không phải phiền vặt.
    const d = dungDonGio({ gioBanDau: MOT_MON });
    d.boi.docDauGio = async () => DauGio.taoDau({
        maKH: 'TB', danhSach: [{ ten: 'Giày Boots nữ cổ ngắn da mềm', soLuong: 2 }],
        tong: 999,
    });
    const kq = await NhanLenh.donGioConSot(d.boi);

    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ma, 'GIO_LA');
    assert.strictEqual(kq.daXoa, 0);
    assert.strictEqual(d.trang.xemGio().length, 1, '❌ ĐÃ XÓA hàng người dùng tự chọn');
    assert.match(kq.thongBao, /KHÔNG PHẢI do máy bỏ vào/);
    assert.match(kq.thongBao, /popup/, 'phải chỉ đường bật công tắc');
});

test('⭐ chưa từng ghi dấu → TỪ CHỐI, không mặc định là giỏ của mình', async () => {
    const d = dungDonGio({ gioBanDau: MOT_MON });
    const kq = await NhanLenh.donGioConSot(d.boi);
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ma, 'GIO_LA');
    assert.strictEqual(d.trang.xemGio().length, 1);
});

test('công tắc "xóa cả giỏ lạ" BẬT → dọn luôn, nhưng ghi rõ lý do', async () => {
    const d = dungDonGio({ gioBanDau: MOT_MON, xoaGioLa: true });
    const kq = await NhanLenh.donGioConSot(d.boi);
    assert.strictEqual(kq.ok, true);
    assert.strictEqual(kq.ma, 'DA_XOA_GIO_LA');
    assert.deepStrictEqual(d.trang.xemGio(), []);
    assert.match(kq.thongBao, /công tắc/);
});

test('công tắc TẮT là mặc định — đọc cài đặt hỏng cũng không được xóa bừa', async () => {
    const d = dungDonGio({ gioBanDau: MOT_MON });
    d.boi.docCaiDat = async () => ({});          // thiếu trường xoaGioLa
    const kq = await NhanLenh.donGioConSot(d.boi);
    assert.strictEqual(kq.ok, false, '❌ thiếu cài đặt mà vẫn xóa');
    assert.strictEqual(d.trang.xemGio().length, 1);
});

test('dọn xong thì XÓA DẤU — không để dấu cũ nhận nhầm giỏ sau', async () => {
    const d = dungDonGio({ gioBanDau: MOT_MON });
    const dau = DauGio.taoDau({
        maKH: 'PA', danhSach: [{ ten: 'Quần Jogger thể thao nữ', soLuong: 1 }],
        tong: d.trang.tongHienTai(),
    });
    let hienTai = dau;
    d.boi.docDauGio = async () => hienTai;
    d.boi.xoaDauGio = async () => { hienTai = null; };
    await NhanLenh.donGioConSot(d.boi);
    assert.strictEqual(hienTai, null, 'dọn sạch rồi mà dấu vẫn còn');
});

ghiChu('— ⭐ "Đọc cài đặt hỏng" KHÁC "công tắc tắt" —');

test('⭐ đọc cài đặt hỏng → BÁO LỖI, tuyệt đối không báo "xong"', async () => {
    // Đây chính là đường đã sinh ra "Xong 2 khách" mà chỉ có 1 hóa đơn:
    // đọc hỏng -> tưởng công tắc tắt -> bỏ hàng vào giỏ -> trả ok:true.
    // Đọc hỏng rất dễ xảy ra ngay sau khi tải lại tab (đổi tài khoản).
    const t = dung();
    t.boi.docCaiDat = async () => ({ tuBam: false, daHieu: false, docDuoc: false });
    const kq = await NhanLenh.xuLyMotLenh(lenh(), t.boi);

    assert.strictEqual(kq.ok, false, '❌ BÁO THÀNH CÔNG khi không đọc được cài đặt');
    assert.strictEqual(kq.ma, 'KHONG_DOC_DUOC_CAI_DAT');
    assert.match(kq.thongBao, /CHƯA làm gì cả/i);
    assert.strictEqual(t.trang.xemGio().length, 0, 'đã bỏ hàng vào giỏ dù không biết người dùng muốn gì');
});

test('công tắc TẮT THẬT (đọc được) → vẫn bỏ hàng vào giỏ như cũ', async () => {
    const t = dung();
    t.boi.docCaiDat = async () => ({ tuBam: false, daHieu: false, docDuoc: true });
    const kq = await NhanLenh.xuLyMotLenh(lenh(), t.boi);
    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.ok(t.trang.xemGio().length > 0, 'không bỏ hàng vào giỏ');
});

test('⭐ công tắc tắt → kết quả phải ghi RÕ là CHƯA phát hành', async () => {
    const t = dung();
    t.boi.docCaiDat = async () => ({ tuBam: false, daHieu: false, docDuoc: true });
    const kq = await NhanLenh.xuLyMotLenh(lenh(), t.boi);
    assert.strictEqual(kq.ketQua.daBamThanhToan, false,
        '❌ cờ này sai là màn hình đếm nhầm thành hóa đơn');
    assert.ok(kq.ketQua.chuThich, 'không nói vì sao chưa phát hành');
});

test('không có chrome.storage → cũng là "đọc hỏng", không phải "tắt"', async () => {
    const c = await NhanLenh.docCaiDat(null);
    assert.strictEqual(c.docDuoc, false);
    assert.strictEqual(c.tuBam, false, 'phải luôn ngã về phía KHÔNG được phép bấm');
});

test('đọc được thật → docDuoc = true', async () => {
    const chromeGia = { storage: { local: {
        async get() { return { 'hdt-cai-dat-bang-thu': { tuBam: true, daHieu: true } }; },
    } } };
    const c = await NhanLenh.docCaiDat(chromeGia);
    assert.strictEqual(c.docDuoc, true);
    assert.strictEqual(c.tuBam, true);
});


ghiChu('— ⭐ CHUNG CỬA HÀNG = CHUNG GIỎ: tiền không được lẫn sang nhau —');

/** Tổng tiền đang có trong giỏ của trang giả. */
const tongGio = (trang) =>
    trang.xemGio().reduce((t, d) => t + (d.gia * (d.soLuong || 1)), 0);

test('⭐ khách 2 chỉ mang ĐÚNG tiền của mình, KHÔNG cộng thêm hàng khách 1', async () => {
    // Đây là điều đáng sợ nhất khi hai khách dùng chung một cửa hàng Tendoo:
    // chung tài khoản nghĩa là CHUNG MỘT GIỎ. Sót hàng của khách trước là hóa
    // đơn khách sau phình lên, mà hóa đơn thuế thì không rút lại được.
    const { trang, boi } = dung({ khai: { PA: CH, TB: CH } });

    const k1 = await NhanLenh.xuLyMotLenh(
        { maKH: 'PA', tenKH: 'Phương Anh', soTien: 3000000, conKhachPhiaSau: true }, boi);
    assert.strictEqual(k1.ok, true, k1.thongBao);
    assert.strictEqual(trang.xemGio().length, 0, 'chưa dọn giỏ trước khi sang khách 2');

    const k2 = await NhanLenh.xuLyMotLenh(
        { maKH: 'TB', tenKH: 'Trang Bé', soTien: 1000000, conKhachPhiaSau: false }, boi);
    assert.strictEqual(k2.ok, true, k2.thongBao);

    // Giỏ cuối cùng phải là giỏ CỦA RIÊNG khách 2.
    assert.ok(Math.abs(tongGio(trang) - 1000000) <= 200000,
        'giỏ khách 2 lệch quá xa: ' + tongGio(trang));
    assert.ok(tongGio(trang) < 3000000,
        'giỏ khách 2 nuốt luôn hàng của khách 1: ' + tongGio(trang));
    assert.ok(Math.abs(k2.ketQua.tong - 1000000) <= 200000,
        'kết quả khách 2 sai: ' + k2.ketQua.tong);
});

test('⭐ ba khách chung giỏ: mỗi lượt dọn sạch, khách cuối đúng tiền mình', async () => {
    const { trang, boi } = dung({ khai: { PA: CH, TB: CH, S8: CH } });
    for (const [ma, tien] of [['PA', 3000000], ['TB', 5000000]]) {
        const k = await NhanLenh.xuLyMotLenh(
            { maKH: ma, tenKH: ma, soTien: tien, conKhachPhiaSau: true }, boi);
        assert.strictEqual(k.ok, true, `${ma}: ${k.thongBao}`);
        assert.strictEqual(trang.xemGio().length, 0, `sau ${ma} giỏ chưa sạch`);
    }
    const cuoi = await NhanLenh.xuLyMotLenh(
        { maKH: 'S8', tenKH: 'S8', soTien: 2000000, conKhachPhiaSau: false }, boi);
    assert.strictEqual(cuoi.ok, true, cuoi.thongBao);
    assert.ok(Math.abs(tongGio(trang) - 2000000) <= 200000,
        'giỏ khách cuối lệch: ' + tongGio(trang));
});

test('⭐ dọn giỏ HỎNG giữa chừng → DỪNG, không để khách sau chạy trên giỏ bẩn', async () => {
    // Nếu bỏ qua lỗi dọn thì khách sau bỏ thêm hàng vào giỏ còn nguyên của khách
    // trước — hóa đơn cộng dồn hai người.
    const { trang, boi } = dung({ khai: { PA: CH, TB: CH } });
    const goc = BoGio.xoaSachGio;
    BoGio.xoaSachGio = async () => ({ ok: false, thongBao: 'không thấy nút xóa' });
    try {
        const k1 = await NhanLenh.xuLyMotLenh(
            { maKH: 'PA', tenKH: 'PA', soTien: 3000000, conKhachPhiaSau: true }, boi);
        assert.strictEqual(k1.ok, false, 'dọn hỏng mà vẫn báo xong');
        assert.strictEqual(k1.ma, 'KHONG_DON_DUOC_GIO');
        assert.ok(trang.xemGio().length > 0, 'giỏ vẫn còn hàng — đúng như mô tả lỗi');
    } finally {
        BoGio.xoaSachGio = goc;
    }
});

chay('BỘ NHẬN LỆNH TRÊN TRANG POS');
