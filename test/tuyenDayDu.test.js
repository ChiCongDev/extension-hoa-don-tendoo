'use strict';

// ============================================================================
//  TEST TOÀN TUYẾN — từ khai báo tài khoản tới giỏ hàng đã đầy đủ.
//
//  Nối THẬT các bộ phận với nhau, không giả lập ở giữa:
//     kho tài khoản  →  đăng nhập  →  chốt chặn tài khoản  →  đọc 3 trang sản
//     phẩm  →  ghép tiền  →  BỎ HÀNG VÀO GIỎ trên bản sao trang POS  →  đối
//     chiếu tổng  →  DỪNG.
//
//  Chỉ hai thứ là giả: máy chủ Tendoo (đúng hình dạng phản hồi thật) và trang
//  POS (đúng cấu trúc HTML thật).
//
//  ⛔ Bài test quan trọng nhất cả file: NÚT THANH TOÁN KHÔNG BAO GIỜ ĐƯỢC BẤM.
// ============================================================================

const assert = require('node:assert');
const { test, ghiChu, chay } = require('./chay');
require('../chung/domReact');
const DieuPhoi = require('../chung/dieuPhoi');
const Kho = require('../chung/khoMatKhau');
const DanhTinh = require('../tendoo/danhTinh');
const DocSanPham = require('../tendoo/docSanPham');
const GhepTien = require('../chung/ghepTien');
const BoGio = require('../tendoo/boGio');
const SoGhiDau = require('../chung/soGhiDau');
const HangDoi = require('../chung/hangDoi');
globalThis.HDT_BoGio = BoGio;
const BamThanhToan = require('../tendoo/bamThanhToan');
const { taoTrangPos, HANG_MAU } = require('./trangPosGiaLap');

const { MA_LOI } = DieuPhoi;
const KHOA_MO = 'khoa-mo-thu-nghiem';
const CH_PA = '2c683a17-09ab-4655-8dbf-50ca8105373c';
const CH_TB = '9f1c0b22-1111-2222-3333-444455556666';
const MK_PA = 'MatKhauGiaPA!1';

/** Máy chủ Tendoo giả, dùng CHÍNH kho hàng của trang POS giả để hai bên khớp. */
function mayChu(hang, { dangDangNhap = null, epLoi = {} } = {}) {
    let phien = dangDangNhap;
    const nhatKy = [];
    return {
        nhatKy,
        dem: (loai) => nhatKy.filter(x => x === loai).length,
        async layPhien() {
            nhatKy.push('layPhien');
            if (!phien) return { success: true, data: { account: {}, business_info: {} } };
            return {
                success: true,
                data: {
                    account: { display_name: 'CH THUỲ DƯƠNG', max_store_count: 1 },
                    business_info: { current_store: { id: phien, store_name: 'CH THUỲ DƯƠNG' },
                                     current_role: { role_name: 'Chủ cửa hàng' } },
                },
            };
        },
        async dangNhap({ matKhau }) {
            nhatKy.push('dangNhap');
            if (epLoi.captcha) return { ok: false, ma: 'CAPTCHA', thongBao: 'captcha' };
            if (matKhau !== MK_PA) return { ok: false, ma: 'DANG_NHAP_LOI' };
            phien = CH_PA;
            return { ok: true };
        },
        async goiTrangSanPham(trang) {
            nhatKy.push('goiTrangSanPham');
            const coTrang = 3;                       // ép lật nhiều trang
            const dau = (trang - 1) * coTrang;
            return {
                success: true,
                data: hang.slice(dau, dau + coTrang).map((h, i) => ({
                    id: 'sp-' + (dau + i), name: h.ten, product_code: 'SP' + (dau + i),
                    variant_mode: 'non_variant', business_id: phien,
                    base_price: h.gia, final_price: h.gia,
                    available_quantity: h.ton, is_out_of_stock: true, is_active: false, version: 2,
                })),
                meta: { total: hang.length, size: coTrang, page: trang,
                        total_pages: Math.ceil(hang.length / coTrang) },
            };
        },
    };
}

// Bộ nối trang POS CÓ PHÁT HÀNH THẬT — chỉ dùng cho nhóm test giai đoạn 5.
//
// Trang giả nay tự dọn giỏ sau khi bấm "Xác nhận", đúng như trang thật. Muốn
// thử cảnh Tendoo treo giữa chừng thì dựng trang bằng
// taoTrangPos({ giuGioSauXacNhan: true }).
function noiTrangPosCoBam(trang) {
    let tongDaBo = null;
    return {
        async boVaoGio(danhSach) {
            const kq = await BoGio.boVaoGio(trang.tailieu, danhSach,
                { nghi: async () => {}, doiVeLuoi: 0 });
            if (kq.ok) tongDaBo = kq.tongTendoo;
            return kq.ok ? { ok: true } : { ok: false, thongBao: kq.thongBao, ma: kq.ma };
        },
        async docTongGio() { return BoGio.docTongGio(trang.tailieu); },
        async bamThanhToan() {
            const luot = BamThanhToan.taoLuot();
            const r = await luot.bam(trang.tailieu, {
                choPhep: true, tongMongDoi: tongDaBo,
                nghi: async () => {}, doiSauBam: 0,
            });
            return { ok: r.ok, thongBao: r.thongBao, ma: r.ma };
        },
    };
}

/** Bộ nối trang POS: nối bộ điều phối với bản sao trang bán hàng. */
function noiTrangPos(trang) {
    return {
        async boVaoGio(danhSach) {
            const kq = await BoGio.boVaoGio(trang.tailieu, danhSach,
                { nghi: async () => {}, doiVeLuoi: 0 });
            return kq.ok ? { ok: true } : { ok: false, thongBao: kq.thongBao, ma: kq.ma };
        },
        async docTongGio() { return BoGio.docTongGio(trang.tailieu); },
        async bamThanhToan() {
            throw new Error('KHÔNG ĐƯỢC GỌI Ở GIAI ĐOẠN 4c');
        },
    };
}

async function dungBoi({ hang = HANG_MAU, trang, mayChuTuyChon = {}, tuyChon = {} } = {}) {
    const kho = await Kho.taoKho(KHOA_MO);
    const { khoa } = await Kho.moKho(kho, KHOA_MO);
    await Kho.ghiKhach(kho, khoa, 'PA', { maCuaHang: CH_PA, tenDangNhap: '0344168490', matKhau: MK_PA });
    const mc = mayChu(hang, mayChuTuyChon);
    const pos = noiTrangPos(trang);
    return {
        boi: {
            kho, khoa, Kho, DanhTinh, DocSanPham, GhepTien,
            tendoo: { ...mc, ...pos },
            tuyChon,
        },
        mayChu: mc,
    };
}

const chay1 = (boi, soTien) =>
    DieuPhoi.xuLyMotKhach({ maKH: 'PA', tenKH: 'Phương Anh', soTien }, boi);

ghiChu('— Toàn tuyến, dừng trước nút Thanh toán —');

test('chạy trọn tuyến: đăng nhập → đọc hàng → ghép → bỏ giỏ → tổng khớp', async () => {
    const trang = taoTrangPos();
    const { boi, mayChu: mc } = await dungBoi({ trang, tuyChon: { boVaoGio: true } });

    const kq = await chay1(boi, 3000000);
    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.strictEqual(kq.ketQua.daBoVaoGio, true);
    assert.strictEqual(kq.ketQua.daBamThanhToan, false, '❌ đã bấm Thanh toán');
    assert.strictEqual(trang.daBam.thanhToan, 0, '❌ ĐÃ BẤM THANH TOÁN THẬT');
    assert.strictEqual(trang.daBam.luuDon, 0);

    // Tổng Tendoo hiện lên phải bằng đúng tổng mình tính.
    assert.strictEqual(kq.ketQua.tongTendoo, kq.ketQua.tong);
    assert.strictEqual(trang.tongHienTai(), kq.ketQua.tong);
    assert.ok(mc.dem('dangNhap') === 1, 'phải đăng nhập đúng một lần');
});

test('giỏ hàng thật khớp từng dòng với đề xuất', async () => {
    const trang = taoTrangPos();
    const { boi } = await dungBoi({ trang, tuyChon: { boVaoGio: true } });
    const kq = await chay1(boi, 4500000);
    assert.strictEqual(kq.ok, true, kq.thongBao);

    const trongGio = trang.xemGio();
    assert.strictEqual(trongGio.length, kq.ketQua.chon.length);
    for (const d of kq.ketQua.chon) {
        const g = trongGio.find(x => x.ten === d.ten);
        assert.ok(g, `thiếu "${d.ten}" trong giỏ`);
        assert.strictEqual(g.soLuong, d.soLuong, `số lượng "${d.ten}" lệch`);
        assert.strictEqual(g.gia, d.gia, `giá "${d.ten}" lệch`);
    }
});

test('KHÔNG BAO GIỜ vượt tồn kho thật của trang POS', async () => {
    const trang = taoTrangPos();
    const { boi } = await dungBoi({ trang, tuyChon: { boVaoGio: true } });
    await chay1(boi, 9000000);
    for (const g of trang.xemGio()) {
        const that = HANG_MAU.find(h => h.ten === g.ten);
        assert.ok(g.soLuong <= that.ton, `${g.ten}: ${g.soLuong} > tồn ${that.ton}`);
    }
});

test('lật đủ các trang sản phẩm, không bỏ sót món nào', async () => {
    const trang = taoTrangPos();
    const { boi, mayChu: mc } = await dungBoi({ trang });
    const kq = await chay1(boi, 3000000);
    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.strictEqual(kq.ketQua.soSanPhamDocDuoc, HANG_MAU.length);
    assert.strictEqual(mc.dem('goiTrangSanPham'), Math.ceil(HANG_MAU.length / 3));
});

ghiChu('— Cửa chặn vẫn chặn khi nối thật —');

test('SAI TÀI KHOẢN → không đụng vào giỏ hàng', async () => {
    const trang = taoTrangPos();
    const { boi } = await dungBoi({ trang, tuyChon: { boVaoGio: true } });
    boi.kho.khach.PA.maCuaHang = CH_TB;          // khai báo trỏ sai cửa hàng
    const kq = await chay1(boi, 3000000);
    assert.strictEqual(kq.ma, MA_LOI.SAI_TAI_KHOAN);
    assert.strictEqual(trang.xemGio().length, 0, 'đã bỏ hàng vào giỏ dù sai tài khoản');
    assert.strictEqual(trang.daBam.thanhToan, 0);
});

test('GIỎ ĐANG CÓ HÀNG SẴN → dừng, không bỏ chồng lên', async () => {
    const trang = taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }] });
    const { boi } = await dungBoi({ trang, tuyChon: { boVaoGio: true } });
    const kq = await chay1(boi, 3000000);
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(trang.xemGio().length, 1, 'đã bỏ thêm vào giỏ đang dở');
    assert.strictEqual(trang.daBam.thanhToan, 0);
});

test('TỔNG LỆCH → báo lỗi, KHÔNG bấm Thanh toán', async () => {
    const trang = taoTrangPos();
    const { boi } = await dungBoi({ trang, tuyChon: { boVaoGio: true } });
    // Ép trang hiện sai tổng, giống cảnh giá đổi giữa chừng.
    const goc = boi.tendoo.docTongGio;
    boi.tendoo.docTongGio = async () => (await goc()) + 1;
    const kq = await chay1(boi, 3000000);
    assert.strictEqual(kq.ma, MA_LOI.TONG_KHONG_KHOP);
    assert.strictEqual(trang.daBam.thanhToan, 0, '❌ bấm Thanh toán dù tổng lệch');
});

test('captcha khi đăng nhập → dừng trước khi đụng tới hàng hóa', async () => {
    const trang = taoTrangPos();
    const { boi } = await dungBoi({ trang, mayChuTuyChon: { epLoi: { captcha: true } },
                                    tuyChon: { boVaoGio: true } });
    const kq = await chay1(boi, 3000000);
    assert.strictEqual(kq.ma, MA_LOI.CAPTCHA);
    assert.strictEqual(trang.xemGio().length, 0);
});

test('mặc định (chưa bật bỏ giỏ) → KHÔNG đụng gì tới trang POS', async () => {
    const trang = taoTrangPos();
    const { boi } = await dungBoi({ trang });
    const kq = await chay1(boi, 3000000);
    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.strictEqual(kq.ketQua.daBoVaoGio, false);
    assert.strictEqual(trang.xemGio().length, 0, 'tự bỏ hàng vào giỏ khi chưa được phép');
});

ghiChu('— Chạy hàng loạt qua hàng đợi —');

function luuTruTam() {
    let o = null;
    return { async doc() { return o ? JSON.parse(JSON.stringify(o)) : null; },
             async ghi(x) { o = x ? JSON.parse(JSON.stringify(x)) : null; } };
}

test('hai khách nối tiếp: khách sau chỉ chạy khi giỏ đã được dọn', async () => {
    const trang = taoTrangPos();
    const { boi } = await dungBoi({ trang, tuyChon: { boVaoGio: true } });
    await Kho.ghiKhach(boi.kho, boi.khoa, 'TB',
        { maCuaHang: CH_PA, tenDangNhap: '0344168490', matKhau: MK_PA });

    const so = SoGhiDau.taoSo(luuTruTam());
    await so.nap();
    const hd = HangDoi.taoHangDoi({ so, khoaLuuTru: luuTruTam(), mayId: 'may-test',
                                    tuyChon: { nguNghi: async () => {}, ngauNhien: () => 0 } });
    await hd.xepHang([{ maKH: 'PA', soTien: 2000000 }, { maKH: 'TB', soTien: 2000000 }]);

    const kq = await hd.chayLoat(async (lenh) => {
        const r = await DieuPhoi.xuLyMotKhach(lenh, boi);
        // Giai đoạn 4c dừng ở giỏ hàng -> phải DỌN GIỎ trước khách kế tiếp,
        // nếu không khách sau sẽ gặp "giỏ không trống" và dừng.
        if (r.ok) await BoGio.xoaSachGio(trang.tailieu, { nghi: async () => {} });
        return r;
    });

    assert.strictEqual(kq.xong.length, 2, JSON.stringify(kq.loi));
    assert.strictEqual(trang.daBam.thanhToan, 0, '❌ ĐÃ BẤM THANH TOÁN trong lượt chạy hàng loạt');
    assert.strictEqual(trang.xemGio().length, 0, 'giỏ chưa được dọn sau lượt cuối');
});

test('KHÔNG dọn giỏ → khách thứ hai bị chặn, không ra hóa đơn chồng', async () => {
    const trang = taoTrangPos();
    const { boi } = await dungBoi({ trang, tuyChon: { boVaoGio: true } });
    await Kho.ghiKhach(boi.kho, boi.khoa, 'TB',
        { maCuaHang: CH_PA, tenDangNhap: '0344168490', matKhau: MK_PA });

    const so = SoGhiDau.taoSo(luuTruTam());
    await so.nap();
    const hd = HangDoi.taoHangDoi({ so, khoaLuuTru: luuTruTam(), mayId: 'may-test',
                                    tuyChon: { nguNghi: async () => {}, ngauNhien: () => 0 } });
    await hd.xepHang([{ maKH: 'PA', soTien: 2000000 }, { maKH: 'TB', soTien: 2000000 }]);

    const kq = await hd.chayLoat((lenh) => DieuPhoi.xuLyMotKhach(lenh, boi));
    assert.strictEqual(kq.xong.length, 1);
    assert.strictEqual(kq.loi.length, 1, 'khách thứ hai đáng lẽ phải bị chặn');
    assert.strictEqual(trang.daBam.thanhToan, 0);
});

ghiChu('— GIAI ĐOẠN 5: có bấm Thanh toán —');

async function dungBoiCoBam(trang, tuyChon, mayChuTuyChon = {}) {
    const kho = await Kho.taoKho(KHOA_MO);
    const { khoa } = await Kho.moKho(kho, KHOA_MO);
    await Kho.ghiKhach(kho, khoa, 'PA', { maCuaHang: CH_PA, tenDangNhap: '0344168490', matKhau: MK_PA });
    const mc = mayChu(HANG_MAU, mayChuTuyChon);
    return { kho, khoa, Kho, DanhTinh, DocSanPham, GhepTien,
             tendoo: { ...mc, ...noiTrangPosCoBam(trang) },
             tuyChon };
}

test('bật đủ hai công tắc → chạy trọn tuyến và bấm ĐÚNG MỘT lần', async () => {
    const trang = taoTrangPos();
    const boi = await dungBoiCoBam(trang, { boVaoGio: true, bamThanhToan: true });
    const kq = await chay1(boi, 3000000);

    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.strictEqual(kq.ketQua.daBamThanhToan, true);
    assert.strictEqual(trang.daBam.thanhToan, 1, 'phải bấm đúng một lần');
    assert.strictEqual(trang.daBam.luuDon, 0);
});

test('chỉ bật bỏ giỏ (chưa bật bấm) → KHÔNG bấm', async () => {
    const trang = taoTrangPos();
    const boi = await dungBoiCoBam(trang, { boVaoGio: true });
    const kq = await chay1(boi, 3000000);
    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.strictEqual(kq.ketQua.daBamThanhToan, false);
    assert.strictEqual(trang.daBam.thanhToan, 0, '❌ ĐÃ BẤM khi chưa bật');
});

test('TỔNG LỆCH → dù đã bật vẫn KHÔNG bấm', async () => {
    const trang = taoTrangPos();
    const boi = await dungBoiCoBam(trang, { boVaoGio: true, bamThanhToan: true });
    const goc = boi.tendoo.docTongGio;
    boi.tendoo.docTongGio = async () => (await goc()) + 1;
    const kq = await chay1(boi, 3000000);
    assert.strictEqual(kq.ma, MA_LOI.TONG_KHONG_KHOP);
    assert.strictEqual(trang.daBam.thanhToan, 0, '❌ ĐÃ BẤM dù tổng lệch');
});

test('SAI TÀI KHOẢN → dù đã bật vẫn KHÔNG bấm, không đụng giỏ', async () => {
    const trang = taoTrangPos();
    const boi = await dungBoiCoBam(trang, { boVaoGio: true, bamThanhToan: true });
    boi.kho.khach.PA.maCuaHang = CH_TB;
    const kq = await chay1(boi, 3000000);
    assert.strictEqual(kq.ma, MA_LOI.SAI_TAI_KHOAN);
    assert.strictEqual(trang.xemGio().length, 0);
    assert.strictEqual(trang.daBam.thanhToan, 0);
});

test('không đủ hàng → dù đã bật vẫn KHÔNG bấm', async () => {
    const trang = taoTrangPos();
    const boi = await dungBoiCoBam(trang, { boVaoGio: true, bamThanhToan: true });
    const kq = await chay1(boi, 900000000);
    assert.strictEqual(kq.ma, MA_LOI.KHONG_DU_HANG);
    assert.strictEqual(trang.daBam.thanhToan, 0);
});

test('bấm Xác nhận xong giỏ KHÔNG dọn → báo KHÔNG RÕ, KHÔNG bấm lại', async () => {
    const trang = taoTrangPos({ giuGioSauXacNhan: true });
    const boi = await dungBoiCoBam(trang, { boVaoGio: true, bamThanhToan: true });
    const kq = await chay1(boi, 3000000);
    assert.strictEqual(kq.ok, false, 'giỏ còn hàng thì KHÔNG được coi là xong');
    assert.strictEqual(kq.ma, 'KHONG_RO');
    assert.strictEqual(trang.daBam.xacNhan, 1, 'chỉ được bấm Xác nhận đúng một lần');
});

test('⭐ tổng trong BẢNG XÁC NHẬN lệch → hủy bằng Quay lại, KHÔNG phát hành', async () => {
    // Chốt chặn cuối cùng, ngay trước khi tiền thành hóa đơn thật.
    const trang = taoTrangPos({ tongBangXn: 12345 });
    const boi = await dungBoiCoBam(trang, { boVaoGio: true, bamThanhToan: true });
    const kq = await chay1(boi, 3000000);
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ma, 'BANG_SAI_TONG');
    assert.strictEqual(trang.daBam.xacNhan, 0, '❌ PHÁT HÀNH với tổng sai');
    assert.strictEqual(trang.daBam.quayLai, 1);
});

test('⭐ bảng bật "Ghi nợ" → hủy, KHÔNG phát hành hóa đơn ghi nợ', async () => {
    const trang = taoTrangPos({ ghiNoBat: true });
    const boi = await dungBoiCoBam(trang, { boVaoGio: true, bamThanhToan: true });
    const kq = await chay1(boi, 3000000);
    assert.strictEqual(kq.ma, 'GHI_NO_DANG_BAT');
    assert.strictEqual(trang.daBam.xacNhan, 0);
});

test('hàng loạt 2 khách, bật bấm → mỗi khách đúng MỘT lần bấm', async () => {
    const trang = taoTrangPos();
    const boi = await dungBoiCoBam(trang, { boVaoGio: true, bamThanhToan: true });
    await Kho.ghiKhach(boi.kho, boi.khoa, 'TB',
        { maCuaHang: CH_PA, tenDangNhap: '0344168490', matKhau: MK_PA });

    const so = SoGhiDau.taoSo(luuTruTam());
    await so.nap();
    const hd = HangDoi.taoHangDoi({ so, khoaLuuTru: luuTruTam(), mayId: 'may-test',
                                    tuyChon: { nguNghi: async () => {}, ngauNhien: () => 0 } });
    await hd.xepHang([{ maKH: 'PA', soTien: 2000000 }, { maKH: 'TB', soTien: 2000000 }]);

    const kq = await hd.chayLoat((lenh) => DieuPhoi.xuLyMotKhach(lenh, boi));
    assert.strictEqual(kq.xong.length, 2, JSON.stringify(kq.loi));
    assert.strictEqual(trang.daBam.thanhToan, 2, 'mỗi khách đúng một lần bấm');
});

test('ĐẾM TỔNG: qua mọi ca ở trên, số lần bấm luôn đúng bằng số hóa đơn đáng ra phải ra', async () => {
    let tongBam = 0, tongMongDoi = 0;

    // 3 ca KHÔNG được bấm
    for (const tc of [{ boVaoGio: true },
                      { boVaoGio: true, bamThanhToan: true, hong: 'tong' },
                      { boVaoGio: true, bamThanhToan: true, hong: 'taiKhoan' }]) {
        const trang = taoTrangPos();
        const boi = await dungBoiCoBam(trang, tc);
        if (tc.hong === 'tong') {
            const g = boi.tendoo.docTongGio;
            boi.tendoo.docTongGio = async () => (await g()) + 1;
        }
        if (tc.hong === 'taiKhoan') boi.kho.khach.PA.maCuaHang = CH_TB;
        await chay1(boi, 3000000);
        tongBam += trang.daBam.thanhToan;
    }
    // 1 ca ĐƯỢC bấm
    {
        const trang = taoTrangPos();
        const boi = await dungBoiCoBam(trang, { boVaoGio: true, bamThanhToan: true });
        await chay1(boi, 3000000);
        tongBam += trang.daBam.thanhToan;
        tongMongDoi += 1;
    }
    assert.strictEqual(tongBam, tongMongDoi,
        `❌ số lần bấm (${tongBam}) khác số hóa đơn đáng ra phải ra (${tongMongDoi})`);
});

chay('TOÀN TUYẾN — TỚI GIỎ HÀNG, DỪNG TRƯỚC THANH TOÁN');
