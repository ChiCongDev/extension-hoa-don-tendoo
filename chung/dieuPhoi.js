'use strict';

// ⚠️ TOÀN BỘ FILE NẰM TRONG MỘT PHẠM VI RIÊNG (hàm bọc ngoài).
// Chrome nạp nhiều file vào CÙNG MỘT phạm vi — hai file cùng khai `const API`
// là file thứ hai nổ ngay khi nạp, và KHÔNG có lỗi nào hiện ra cho người dùng:
// popup chỉ đơn giản trống trơn. Đã dính đúng lỗi này một lần. Bọc lại để không
// bao giờ dính nữa. Xuất ra ngoài qua globalThis.HDT_* ở cuối file.

(function () {

// ============================================================================
//  ĐIỀU PHỐI — nối các bộ phận thành MỘT luồng cho MỘT khách hàng
//
//    khai báo -> đăng nhập -> ĐỐI CHIẾU TÀI KHOẢN -> đọc kho -> ghép tiền
//              -> (bỏ giỏ) -> ĐỐI CHIẾU TỔNG -> (bấm Thanh toán)
//
//  HAI CỬA CHẶN, ĐẶT Ở HAI ĐẦU:
//    Cửa 1 — ĐÚNG TÀI KHOẢN CHƯA?  Kiểm tra hai lần từ hai nguồn độc lập:
//            (a) phiên đăng nhập nói đang ở cửa hàng nào
//            (b) kho hàng đọc về mang mã cửa hàng nào
//            Hai nguồn phải khớp nhau VÀ khớp khai báo. Lệch một ly là dừng.
//    Cửa 2 — ĐÚNG SỐ TIỀN CHƯA?    Tổng Tendoo tự tính phải khớp tổng mình tính.
//            Lệch là KHÔNG BẤM, dù chỉ 1 đồng.
//
//  MẶC ĐỊNH KHÔNG ĐỤNG GÌ: `boVaoGio` và `bamThanhToan` đều TẮT. Phải bật rõ
//  ràng mới làm. Mặc định an toàn, không phải mặc định tiện.
//
//  Mọi phụ thuộc đều truyền từ ngoài vào -> test được đầu-cuối bằng máy chủ giả,
//  không cần Chrome, không cần mạng, không cần tài khoản thật.
// ============================================================================

const MA_LOI = {
    CHUA_KHAI_BAO: 'CHUA_KHAI_BAO',
    KHOA_MO_SAI: 'KHOA_MO_SAI',
    DANG_NHAP_LOI: 'DANG_NHAP_LOI',
    CAPTCHA: 'CAPTCHA',
    SAI_TAI_KHOAN: 'SAI_TAI_KHOAN',
    KHONG_DOC_DUOC_KHO: 'KHONG_DOC_DUOC_KHO',
    LECH_QUA_200K: 'LECH_QUA_200K',
    KHONG_DU_HANG: 'KHONG_DU_HANG',
    KHONG_CO_HANG: 'KHONG_CO_HANG',
    TONG_KHONG_KHOP: 'TONG_KHONG_KHOP',
    // Đã bấm "Xác nhận" mà không biết hóa đơn đã phát hành chưa. Hàng đợi nhìn
    // mã này để TREO lệnh và dừng cả loạt (xem KET_QUA_KHONG_RO ở hangDoi.js).
    KHONG_RO: 'KHONG_RO',
};

/** Kết quả ghép tiền -> mã lỗi chung. */
function doiMaGhep(ma) {
    if (ma === 'LECH_QUA_200K') return MA_LOI.LECH_QUA_200K;
    if (ma === 'KHONG_DU_HANG') return MA_LOI.KHONG_DU_HANG;
    if (ma === 'KHONG_CO_HANG') return MA_LOI.KHONG_CO_HANG;
    return MA_LOI.KHONG_DOC_DUOC_KHO;
}

const loi = (ma, thongBao, them = {}) => ({ ok: false, ma, thongBao, ...them });

/**
 * @param {{maKH:string, tenKH?:string, soTien:number}} lenh
 * @param {object} boi  các bộ phận + bộ nối Tendoo, xem đầu file
 */
async function xuLyMotKhach(lenh, boi) {
    const { kho, khoa, Kho, DanhTinh, DocSanPham, GhepTien, tendoo } = boi;
    const tuyChon = boi.tuyChon || {};
    const boVaoGio = tuyChon.boVaoGio === true;
    const bamThanhToan = tuyChon.bamThanhToan === true;

    // Chặn cấu hình vô nghĩa: bấm Thanh toán mà chưa bỏ hàng vào giỏ thì hoặc
    // là bấm vào giỏ rỗng, hoặc tệ hơn — bấm vào giỏ của lần trước còn sót.
    if (bamThanhToan && !boVaoGio) {
        throw new Error('Không được bật bamThanhToan khi chưa bật boVaoGio');
    }

    // ── 1. Khách này đã khai báo tài khoản Tendoo chưa? ─────────────────────
    const banGhi = kho && kho.khach && kho.khach[lenh.maKH];
    if (!banGhi || !banGhi.maCuaHang) {
        return loi(MA_LOI.CHUA_KHAI_BAO, `Khách "${lenh.maKH}" chưa khai báo tài khoản Tendoo`);
    }
    const cuaHangMongDoi = banGhi.maCuaHang;

    // ── 2. Đang đăng nhập sẵn đúng cửa hàng thì khỏi đăng nhập lại ──────────
    let danhTinh = DanhTinh.doc(await tendoo.layPhien());

    if (!danhTinh || !DanhTinh.doiChieu(danhTinh, cuaHangMongDoi).khop) {
        const matKhau = await Kho.docMatKhau(kho, khoa, lenh.maKH);
        if (!matKhau) {
            return loi(MA_LOI.KHOA_MO_SAI,
                'Không đọc được mật khẩu — kho đang khóa hoặc khóa mở sai');
        }

        const dn = await tendoo.dangNhap({ tenDangNhap: banGhi.tenDangNhap, matKhau });
        if (!dn || !dn.ok) {
            const ma = (dn && dn.ma === MA_LOI.CAPTCHA) ? MA_LOI.CAPTCHA : MA_LOI.DANG_NHAP_LOI;
            return loi(ma, (dn && dn.thongBao) || 'Không đăng nhập được');
        }
        danhTinh = DanhTinh.doc(await tendoo.layPhien());
    }

    // ── 3. CỬA CHẶN 1a — phiên đăng nhập có đúng cửa hàng không? ────────────
    const doiChieu = DanhTinh.doiChieu(danhTinh, cuaHangMongDoi);
    if (!doiChieu.khop) return loi(MA_LOI.SAI_TAI_KHOAN, doiChieu.lyDo);

    // ── 4. Đọc toàn bộ kho hàng ─────────────────────────────────────────────
    let kq;
    try {
        kq = await DocSanPham.layTatCa((trang) => tendoo.goiTrangSanPham(trang));
    } catch (e) {
        return loi(MA_LOI.KHONG_DOC_DUOC_KHO, 'Không đọc được danh sách sản phẩm: ' + e.message);
    }

    // ── 5. CỬA CHẶN 1b — kho hàng có thuộc đúng cửa hàng đó không? ──────────
    // Nguồn độc lập với bước 3. Phiên nói một đằng, hàng hóa nói một nẻo thì
    // dừng — không đoán bên nào đúng.
    if (!kq.maCuaHang || kq.maCuaHang.toLowerCase() !== danhTinh.maCuaHang.toLowerCase()) {
        return loi(MA_LOI.SAI_TAI_KHOAN,
            'Kho hàng đọc về không thuộc cửa hàng đang đăng nhập — đã dừng để an toàn');
    }

    // ── 6. Ghép tiền ────────────────────────────────────────────────────────
    const ghep = GhepTien.ghepSanPham({
        sanPham: kq.hang.map(h => ({ ma: h.id, ten: h.ten, gia: h.gia, ton: h.ton })),
        soTien: lenh.soTien,
        ...(tuyChon.dungSai != null ? { dungSai: tuyChon.dungSai } : {}),
        ...(tuyChon.tyLeToiDa != null ? { tyLeToiDa: tuyChon.tyLeToiDa } : {}),
    });

    if (ghep.ma !== 'OK') {
        return loi(doiMaGhep(ghep.ma), ghep.thongBao, {
            tongGanNhat: ghep.tongGanNhat, dungSaiThuc: ghep.dungSaiThuc,
        });
    }

    // Gắn lại tên/mã hiển thị (ghép tiền chỉ làm việc với id).
    const theoId = new Map(kq.hang.map(h => [h.id, h]));
    const deXuat = ghep.chon.map(d => {
        const h = theoId.get(d.ma) || {};
        return { id: d.ma, ma: h.ma || '', ten: d.ten, gia: d.gia,
                 soLuong: d.soLuong, thanhTien: d.thanhTien };
    });

    const ketQua = {
        tong: ghep.tong, lech: ghep.lech, soCai: ghep.soCai, soLoai: deXuat.length,
        cuaHang: danhTinh.maCuaHang, tenTaiKhoan: danhTinh.tenTaiKhoan,
        soSanPhamDocDuoc: kq.hang.length, soBoQua: kq.boQua.length,
        chon: deXuat, daBoVaoGio: false, daBamThanhToan: false,
    };

    if (!boVaoGio) return { ok: true, ketQua };   // giai đoạn 4a dừng ở đây

    // ── 7. Bỏ hàng vào giỏ ──────────────────────────────────────────────────
    const boGio = await tendoo.boVaoGio(deXuat);
    if (!boGio || !boGio.ok) {
        return loi(MA_LOI.KHONG_DOC_DUOC_KHO,
            (boGio && boGio.thongBao) || 'Không bỏ được hàng vào giỏ');
    }
    ketQua.daBoVaoGio = true;

    // ── 8. CỬA CHẶN 2 — tổng Tendoo tính phải KHỚP TUYỆT ĐỐI ────────────────
    const tongTendoo = await tendoo.docTongGio();
    ketQua.tongTendoo = tongTendoo;
    if (Number(tongTendoo) !== Number(ghep.tong)) {
        return loi(MA_LOI.TONG_KHONG_KHOP,
            `Tendoo tính ${Number(tongTendoo).toLocaleString('vi-VN')}đ nhưng mình tính `
            + `${ghep.tong.toLocaleString('vi-VN')}đ — KHÔNG bấm Thanh toán`,
            { ketQua });
    }

    if (!bamThanhToan) return { ok: true, ketQua };   // giai đoạn 4c dừng ở đây

    // ── 9. Bấm Thanh toán (chỉ khi đã qua CẢ HAI cửa chặn) ──────────────────
    const bam = await tendoo.bamThanhToan();
    if (!bam || !bam.ok) {
        // ⚠️ PHẢI GIỮ NGUYÊN MÃ LỖI GỐC. Trước đây chỗ này đổi mọi thất bại
        // thành KHONG_DOC_DUOC_KHO — một mã chẳng liên quan gì. Hậu quả: mã
        // KHONG_RO ("đã bấm Xác nhận mà không biết hóa đơn ra chưa") bị che mất,
        // hàng đợi không nhận ra để TREO lệnh, và khách đó được phép chạy lại
        // -> hai hóa đơn cho một khoản tiền. Nuốt mã lỗi ở đây là nuốt luôn
        // cái chốt an toàn quan trọng nhất của cả hệ thống.
        return loi(
            (bam && bam.ma) || MA_LOI.KHONG_RO,
            (bam && bam.thongBao) || 'Bấm Thanh toán không thành công', { ketQua });
    }
    ketQua.daBamThanhToan = true;
    return { ok: true, ketQua };
}

const API = { xuLyMotKhach, MA_LOI };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof globalThis !== 'undefined') globalThis.HDT_DieuPhoi = API;
})();
