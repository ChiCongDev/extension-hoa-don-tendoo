'use strict';

// ⚠️ TOÀN BỘ FILE NẰM TRONG MỘT PHẠM VI RIÊNG (hàm bọc ngoài).
// Chrome nạp nhiều file vào CÙNG MỘT phạm vi — hai file cùng khai `const API`
// là file thứ hai nổ ngay khi nạp, và KHÔNG có lỗi nào hiện ra cho người dùng:
// popup chỉ đơn giản trống trơn. Đã dính đúng lỗi này một lần. Bọc lại để không
// bao giờ dính nữa. Xuất ra ngoài qua globalThis.HDT_* ở cuối file.

(function () {

// ============================================================================
//  SỔ GHI DẤU — chống xuất trùng hóa đơn
//
//  VẤN ĐỀ CẦN GIẢI
//  Manifest V3 cho phép Chrome giết tiến trình nền BẤT CỨ LÚC NÀO. Nếu bị giết
//  đúng khoảnh khắc vừa bấm Thanh toán, lần chạy sau KHÔNG có cách nào biết hóa
//  đơn đã ra hay chưa. Chạy lại = xuất trùng một hóa đơn thật, có giá trị pháp
//  lý, đã đẩy lên cơ quan thuế.
//
//  CÁCH GIẢI — GHI TRƯỚC KHI LÀM (write-ahead)
//    1. Ghi "đang xử lý" xuống đĩa  ─┐
//    2. Bấm Thanh toán               ├─ nếu chết ở giữa, dấu vẫn còn
//    3. Ghi "xong"                  ─┘
//
//  Khởi động lại mà thấy còn dấu "đang xử lý" => KHÔNG BIẾT hóa đơn đã ra chưa.
//  Lúc đó luật là: chuyển thành TREO, DỪNG CẢ LOẠT, bắt người dùng vào Tendoo
//  nhìn tận mắt rồi quyết. TUYỆT ĐỐI KHÔNG TỰ THỬ LẠI.
//
//  Thà bắt người dùng kiểm tra tay một lần, còn hơn tự động xuất trùng.
//
//  Sổ nằm trong bộ nhớ của extension. KHÔNG đụng database của Sell.
// ============================================================================

const TRANG_THAI = {
    CHO: 'cho',                 // đã xếp hàng, chưa chạy
    DANG_XU_LY: 'dang_xu_ly',   // đã ghi dấu, sắp/đang bấm Thanh toán
    XONG: 'xong',               // đã phát hành, chắc chắn
    LOI: 'loi',                 // không phát hành được, biết rõ lý do
    TREO: 'treo',               // KHÔNG BIẾT đã phát hành hay chưa -> người kiểm
    BO: 'bo',                   // bị hủy vì cả loạt đã dừng
};

const KHOANG_TRUNG_MAC_DINH = 12 * 60 * 60 * 1000;   // 12 tiếng
const PHIEN_BAN_SO = 1;

function maNgauNhien() {
    const c = typeof globalThis !== 'undefined' && globalThis.crypto;
    if (c && c.randomUUID) return c.randomUUID();
    return 'lenh-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

/**
 * @param {{doc:()=>Promise<object|null>, ghi:(o:object)=>Promise<void>}} luuTru
 * @param {{dongHo?:()=>number}} [tuyChon]
 */
function taoSo(luuTru, tuyChon = {}) {
    const dongHo = tuyChon.dongHo || (() => Date.now());
    let so = null;

    async function nap() {
        so = (await luuTru.doc()) || { phienBan: PHIEN_BAN_SO, lenh: [] };
        if (!Array.isArray(so.lenh)) so.lenh = [];
        return so;
    }

    function batBuocNap() {
        if (!so) throw new Error('Chưa nạp sổ — gọi nap() trước');
    }

    const luu = () => luuTru.ghi(so);
    const tim = (id) => so.lenh.find(l => l.id === id) || null;

    /**
     * PHẢI gọi đầu tiên mỗi lần khởi động, TRƯỚC khi chạy bất cứ lệnh nào.
     * Mọi dấu "đang xử lý" còn sót lại nghĩa là lần trước bị giết giữa chừng.
     * @returns {Promise<Array>} các lệnh vừa bị treo (rỗng = sạch)
     */
    async function quetKhiKhoiDong() {
        batBuocNap();
        const treo = [];
        for (const l of so.lenh) {
            if (l.trangThai === TRANG_THAI.DANG_XU_LY) {
                l.trangThai = TRANG_THAI.TREO;
                l.thongBao = 'Bị ngắt giữa chừng — KHÔNG rõ hóa đơn đã phát hành hay chưa. '
                    + 'Hãy mở Tendoo kiểm tra tận mắt trước khi chạy lại.';
                l.treoLuc = dongHo();
                treo.push(l);
            }
        }
        if (treo.length) await luu();
        return treo;
    }

    /** Còn lệnh treo thì KHÔNG được chạy gì thêm cho tới khi người dùng xử lý. */
    function coLenhTreo() {
        batBuocNap();
        return so.lenh.some(l => l.trangThai === TRANG_THAI.TREO);
    }

    async function taoLenh({ maKH, tenKH, soTien, soTienDat, ngayCuoiTuChon }) {
        batBuocNap();
        const ma = String(maKH || '').trim();
        if (!ma) throw new Error('Thiếu mã khách hàng');
        if (!Number.isFinite(Number(soTien)) || Number(soTien) <= 0) {
            throw new Error('Số tiền không hợp lệ');
        }
        const lenh = {
            id: maNgauNhien(),
            maKH: ma,
            tenKH: String(tenKH || '').trim(),
            soTien: Math.round(Number(soTien)),
            // ⚠️ SỐ NGƯỜI DÙNG TỰ ĐẶT trong ô "tiền/ngày", CHỈ ghi khi có đặt.
            // Đây là chỗ hẹp DUY NHẤT mà mọi lệnh đi qua, nên cũng là chỗ duy
            // nhất giữ được dấu vết "tờ này xuất theo số tự chọn". Không ghi ở
            // đây thì cả hai đường đẩy về Sell đều mất dấu và Sell xếp nhầm cột.
            // Không đặt thì KHÔNG thêm khoá — sổ cũ đọc lên vẫn y nguyên.
            ...(Number(soTienDat) > 0 ? { soTienDat: Math.round(Number(soTienDat)) } : {}),
            // ⚠️ HÔM NAY LÀ NGÀY CUỐI của hạn "tiền/ngày" — cùng lý do với dòng
            // ngay trên: đây là chỗ hẹp DUY NHẤT mọi lệnh đi qua. Quên ở đây thì
            // tin nhắn "từ mai không xuất nữa" KHÔNG BAO GIỜ gửi được, và hôm
            // sau máy dừng trong im lặng.
            //
            // Đã hỏng thật một lần: bài kiểm tự tay gắn cờ vào lệnh nên xanh,
            // trong khi đường chạy thật rơi mất cờ ngay tại đây.
            ...(ngayCuoiTuChon ? { ngayCuoiTuChon: true } : {}),
            trangThai: TRANG_THAI.CHO,
            taoLuc: dongHo(),
        };
        so.lenh.push(lenh);
        await luu();
        return lenh;
    }

    /** Đã phát hành cho khách này, đúng số tiền này, trong khoảng thời gian gần? */
    function timLanXuatGanDay(maKH, soTien, trongVongMs = KHOANG_TRUNG_MAC_DINH) {
        batBuocNap();
        const moc = dongHo() - trongVongMs;
        return so.lenh.find(l =>
            l.trangThai === TRANG_THAI.XONG
            && l.maKH === String(maKH).trim()
            && l.soTien === Math.round(Number(soTien))
            && (l.xongLuc || 0) >= moc) || null;
    }

    /**
     * GHI DẤU TRƯỚC KHI BẤM. Hàm này phải hoàn tất (đã ghi xuống đĩa) rồi mới
     * được đụng vào nút Thanh toán.
     */
    async function danhDauDangXuLy(id) {
        batBuocNap();
        const l = tim(id);
        if (!l) throw new Error('Không tìm thấy lệnh');
        if (l.trangThai !== TRANG_THAI.CHO) {
            throw new Error(`Lệnh đang ở trạng thái "${l.trangThai}", không được chạy lại`);
        }
        l.trangThai = TRANG_THAI.DANG_XU_LY;
        l.batDauLuc = dongHo();
        await luu();
        return l;
    }

    async function danhDauXong(id, ketQua = {}) {
        batBuocNap();
        const l = tim(id);
        if (!l) throw new Error('Không tìm thấy lệnh');
        l.trangThai = TRANG_THAI.XONG;
        l.xongLuc = dongHo();
        l.ketQua = {
            tong: Number(ketQua.tong || 0),
            lech: Number(ketQua.lech || 0),
            soCai: Number(ketQua.soCai || 0),
            soLoai: Number(ketQua.soLoai || 0),
            // ⚠️ PHẢI GIỮ. Trước đây trường này bị vứt đi, nên sổ ghi dấu KHÔNG
            // còn phân biệt được "đã ra hóa đơn" với "mới bỏ hàng vào giỏ" —
            // màn hình có muốn nói đúng cũng không có dữ liệu để nói, và đã báo
            // "Xong 2 khách" trong khi chỉ có 1 hóa đơn.
            daBamThanhToan: !!ketQua.daBamThanhToan,
            // Hóa đơn ra trong lúc tài khoản CHƯA thiết lập quản lý thuế. Người
            // dùng cần con số này khi làm sổ sách — vứt đi là họ không bao giờ
            // biết hóa đơn nào bị ảnh hưởng.
            daBoQuaThue: !!ketQua.daBoQuaThue,
            chuThich: String(ketQua.chuThich || ''),
        };
        await luu();
        return l;
    }

    async function danhDauLoi(id, ma, thongBao) {
        batBuocNap();
        const l = tim(id);
        if (!l) throw new Error('Không tìm thấy lệnh');
        l.trangThai = TRANG_THAI.LOI;
        l.maLoi = String(ma || 'KHONG_RO');
        l.thongBao = String(thongBao || '');
        l.xongLuc = dongHo();
        await luu();
        return l;
    }

    /**
     * ĐÃ BẤM THANH TOÁN NHƯNG KHÔNG BIẾT KẾT QUẢ -> treo, y như bị ngắt giữa chừng.
     *
     * Khác `danhDauLoi` ở chỗ sống còn: lệnh LỖI được phép chạy lại, lệnh TREO
     * thì không. Đã bấm rồi mà chạy lại là con đường ra HAI hóa đơn cho cùng một
     * khoản tiền — đẩy lên cơ quan thuế, không hoàn tác được. Chỉ người dùng, sau
     * khi tự mở Tendoo nhìn tận mắt, mới được kết luận (xem xuLyLenhTreo).
     */
    async function danhDauTreo(id, thongBao) {
        batBuocNap();
        const l = tim(id);
        if (!l) throw new Error('Không tìm thấy lệnh');
        l.trangThai = TRANG_THAI.TREO;
        l.maLoi = 'KHONG_RO';
        l.thongBao = String(thongBao || '');
        l.treoLuc = dongHo();
        await luu();
        return l;
    }

    /** Cả loạt dừng -> các lệnh chưa chạy bị bỏ, KHÔNG âm thầm chạy tiếp. */
    /**
     * DỌN LỆNH CHỜ CÒN SÓT TỪ LƯỢT TRƯỚC, và kể tên chúng ra.
     *
     * ⚠️ LỖI THẬT NGÀY 31/08/2026. `cauNoi` xếp hàng TRƯỚC rồi mới giành khóa;
     * khóa bận thì lượt ấy trả về ngay, nhưng lệnh ĐÃ nằm trong sổ ở trạng thái
     * CHỜ và không ai dọn. Lượt sau rút sạch mọi lệnh CHỜ nên nó gánh luôn lệnh
     * của lượt trước: mốc 15:35 chỉ có ki?n mà máy xuất cả hóa đơn 5.000.000 của
     * c?ng — HÓA ĐƠN RA THẬT, vào giờ chủ dự án không hề hẹn.
     *
     * Lệnh kẹt qua đêm còn tệ hơn: nó ra vào NGÀY HÔM SAU và tính vào sổ ngày ấy.
     *
     * `moiXep` là danh sách id vừa xếp cho lượt này — mọi lệnh CHỜ KHÁC là đồ
     * còn sót. Truyền id chứ không đếm số lượng: hai lượt có thể xếp cùng một
     * khách, đếm thì lẫn.
     */
    async function boLenhChoCu(moiXep, lyDo) {
        batBuocNap();
        const giu = new Set((moiXep || []).map(x => String(x)));
        const daBo = [];
        for (const l of so.lenh) {
            if (l.trangThai !== TRANG_THAI.CHO || giu.has(String(l.id))) continue;
            l.trangThai = TRANG_THAI.BO;
            l.thongBao = String(lyDo || 'Lệnh còn sót từ lượt trước — đã bỏ, không xuất hóa đơn.');
            daBo.push({ ...l });
        }
        if (daBo.length) await luu();
        return daBo;
    }

    async function boCacLenhCho(lyDo) {
        batBuocNap();
        let n = 0;
        for (const l of so.lenh) {
            if (l.trangThai === TRANG_THAI.CHO) {
                l.trangThai = TRANG_THAI.BO;
                l.thongBao = String(lyDo || 'Đã dừng cả loạt');
                n++;
            }
        }
        if (n) await luu();
        return n;
    }

    const layLenhCho = () => { batBuocNap(); return so.lenh.filter(l => l.trangThai === TRANG_THAI.CHO); };
    const layLenhTreo = () => { batBuocNap(); return so.lenh.filter(l => l.trangThai === TRANG_THAI.TREO); };
    const danhSach = () => { batBuocNap(); return so.lenh.slice(); };
    const layLenh = (id) => { batBuocNap(); return tim(id); };

    /** Người dùng đã tự kiểm tra trên Tendoo và kết luận. */
    async function xuLyLenhTreo(id, daPhatHanh) {
        batBuocNap();
        const l = tim(id);
        if (!l || l.trangThai !== TRANG_THAI.TREO) throw new Error('Lệnh này không ở trạng thái treo');
        l.trangThai = daPhatHanh ? TRANG_THAI.XONG : TRANG_THAI.LOI;
        if (!daPhatHanh) {
            l.maLoi = 'BI_NGAT';
            // ⚠️ GIỮ NGUYÊN VĂN lý do treo, chỉ ghi thêm kết luận vào sau.
            // Bản cũ ghi đè mất — mà đó là manh mối duy nhất để biết vì sao lệnh
            // này từng không rõ kết quả, và hóa đơn nào cần tự kiểm trên Tendoo.
            const cu = String(l.thongBao || '').trim();
            l.thongBao = (cu ? cu + ' — ' : '') + 'đã kết luận: chưa phát hành.';
        }
        l.xongLuc = dongHo();
        await luu();
        return l;
    }

    return {
        nap, quetKhiKhoiDong, coLenhTreo, taoLenh, timLanXuatGanDay,
        danhDauDangXuLy, danhDauXong, danhDauLoi, danhDauTreo, boCacLenhCho, boLenhChoCu,
        layLenhCho, layLenhTreo, layLenh, danhSach, xuLyLenhTreo,
    };
}

const API = { taoSo, TRANG_THAI, KHOANG_TRUNG_MAC_DINH };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof globalThis !== 'undefined') globalThis.HDT_SoGhiDau = API;
})();
