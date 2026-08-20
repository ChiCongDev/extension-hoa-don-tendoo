'use strict';

// ============================================================================
//  MÁY CHỦ TENDOO GIẢ LẬP — dùng cho test đầu-cuối.
//
//  Bắt chước ĐÚNG hình dạng phản hồi thật đã thu được ngày 2026-08-10:
//    - products: { success, data[], meta{total,size,page,total_pages} }
//      mỗi sản phẩm có business_id, final_price, available_quantity,
//      is_out_of_stock=true (bẫy thật!), variant_mode='non_variant'
//    - info: { success, data{ account{...}, business_info{ current_store{id} } } }
//
//  Ghi lại mọi lời gọi để test khẳng định được những việc KHÔNG được xảy ra
//  (ví dụ: không bấm Thanh toán, không đăng nhập lại khi đã đúng tài khoản).
// ============================================================================

function taoMayChuGiaLap(caiDat = {}) {
    const cacCuaHang = caiDat.cuaHang || {};
    let dangDangNhap = caiDat.dangDangNhap || null;   // mã cửa hàng, null = chưa đăng nhập
    const nhatKy = [];
    let gio = [];

    // Cho phép test ép lỗi.
    const epLoi = caiDat.epLoi || {};

    function tinhSanPham(maCuaHang) {
        const ch = cacCuaHang[maCuaHang];
        return (ch && ch.sanPham) || [];
    }

    return {
        nhatKy,
        goiTheoLoai: (loai) => nhatKy.filter(x => x.loai === loai),
        gioHienTai: () => gio.slice(),
        datPhien: (ma) => { dangDangNhap = ma; },

        async layPhien() {
            nhatKy.push({ loai: 'layPhien' });
            if (!dangDangNhap) return { success: true, data: { account: {}, business_info: {} } };
            const ch = cacCuaHang[dangDangNhap];
            return {
                success: true,
                data: {
                    account: { display_name: ch.tenHienThi, max_store_count: 1 },
                    business_info: {
                        current_store: { id: dangDangNhap, store_name: ch.tenHienThi },
                        current_role: { role_name: 'Chủ cửa hàng' },
                    },
                },
            };
        },

        async dangNhap({ tenDangNhap, matKhau }) {
            nhatKy.push({ loai: 'dangNhap', tenDangNhap });
            if (epLoi.captcha) return { ok: false, ma: 'CAPTCHA', thongBao: 'Hiện captcha' };
            const tim = Object.entries(cacCuaHang).find(([, ch]) =>
                ch.tenDangNhap === tenDangNhap && ch.matKhau === matKhau);
            if (!tim) return { ok: false, ma: 'DANG_NHAP_LOI', thongBao: 'Sai tài khoản hoặc mật khẩu' };
            dangDangNhap = tim[0];
            gio = [];
            return { ok: true };
        },

        async goiTrangSanPham(trang) {
            nhatKy.push({ loai: 'goiTrangSanPham', trang });
            if (epLoi.khoHong) throw new Error('Máy chủ trả lỗi 500');

            // Cho phép giả lập kho hàng THUỘC CỬA HÀNG KHÁC (dữ liệu lẫn lộn).
            const maGan = epLoi.khoCuaCuaHangKhac || dangDangNhap;
            const ds = tinhSanPham(dangDangNhap);
            const coTrang = 10;
            const dau = (trang - 1) * coTrang;
            const lat = ds.slice(dau, dau + coTrang);
            return {
                success: true,
                data: lat.map((sp, i) => ({
                    id: sp.id || `sp-${dau + i}`,
                    name: sp.ten || `Hàng ${dau + i}`,
                    product_code: sp.ma || `SP${dau + i}`,
                    variant_mode: 'non_variant',
                    business_id: maGan,
                    base_price: sp.gia,
                    final_price: sp.gia,
                    available_quantity: sp.ton,
                    is_out_of_stock: true,      // bẫy thật của Tendoo
                    is_active: false,           // bẫy thật của Tendoo
                    version: 2,
                })),
                meta: {
                    total: ds.length, size: coTrang, page: trang,
                    total_pages: Math.max(1, Math.ceil(ds.length / coTrang)),
                },
            };
        },

        async boVaoGio(danhSach) {
            nhatKy.push({ loai: 'boVaoGio', danhSach });
            if (epLoi.boGioHong) return { ok: false, thongBao: 'Không thêm được vào giỏ' };
            gio = danhSach.map(d => ({ id: d.id, soLuong: d.soLuong, gia: d.gia }));
            return { ok: true };
        },

        async docTongGio() {
            nhatKy.push({ loai: 'docTongGio' });
            const tong = gio.reduce((t, d) => t + d.gia * d.soLuong, 0);
            // Giả lập Tendoo tính ra số khác (giá đổi giữa chừng, hàng bị chặn...)
            return epLoi.tongLech != null ? epLoi.tongLech : tong;
        },

        async bamThanhToan() {
            nhatKy.push({ loai: 'bamThanhToan' });
            if (epLoi.thanhToanHong) return { ok: false, thongBao: 'Thanh toán lỗi' };
            return { ok: true };
        },
    };
}

module.exports = { taoMayChuGiaLap };
