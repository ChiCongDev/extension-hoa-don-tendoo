'use strict';

// ⚠️ TOÀN BỘ FILE NẰM TRONG MỘT PHẠM VI RIÊNG (hàm bọc ngoài).
// Chrome nạp nhiều file vào CÙNG MỘT phạm vi — hai file cùng khai `const API`
// là file thứ hai nổ ngay khi nạp, và KHÔNG có lỗi nào hiện ra cho người dùng:
// popup chỉ đơn giản trống trơn. Đã dính đúng lỗi này một lần. Bọc lại để không
// bao giờ dính nữa. Xuất ra ngoài qua globalThis.HDT_* ở cuối file.

(function () {

// ============================================================================
//  HÀNG ĐỢI CHẠY HÀNG LOẠT
//
//  Chạy TUẦN TỰ từng khách. Không chạy song song: một trình duyệt chỉ đăng nhập
//  được MỘT tài khoản Tendoo tại một thời điểm (cookie theo tên miền), nên chạy
//  song song là đăng nhập đè lên nhau -> xuất hóa đơn vào nhầm tài khoản.
//
//  BA CƠ CHẾ BẢO VỆ (học từ extension theo dõi giá đang chạy của công ty):
//
//  1. GHI TIẾN ĐỘ SAU MỖI KHÁCH — Chrome giết tiến trình thì lần sau chạy tiếp
//     phần còn lại, không làm lại từ đầu.
//  2. KHÓA CÓ HẠN, TỰ GIA HẠN — chống chạy chồng. Khóa TỰ HẾT HẠN nếu tiến
//     trình chết, nên không bao giờ kẹt vĩnh viễn.
//  3. DỪNG CẢ LOẠT KHI GẶP LỖI NGHIÊM TRỌNG — sai tài khoản hoặc có lệnh treo
//     thì dừng hết, KHÔNG bỏ qua rồi chạy tiếp. Một lần lệch tài khoản nghĩa là
//     bảng khai báo có vấn đề; chạy tiếp chỉ nhân cái sai lên.
// ============================================================================

const NhipDo = (typeof module !== 'undefined' && module.exports)
    ? require('./nhipDo') : globalThis.HDT_NhipDo;

const HAN_KHOA_MAC_DINH = 2 * 60 * 1000;    // 2 phút
// Nghỉ giữa hai khách — xem chung/nhipDo.js. Bản cũ để 5–10 GIÂY, mỗi loạt 10
// khách mất gần một phút rưỡi ngồi không.
const NGHI_MAC_DINH = NhipDo.NGHI_GIUA_KHACH;

/** Lỗi thuộc nhóm này thì DỪNG CẢ LOẠT, không chạy tiếp khách sau. */
const LOI_DUNG_CA_LOAT = new Set([
    'SAI_TAI_KHOAN',      // đang đăng nhập nhầm cửa hàng
    'DANG_NHAP_LOI',      // sai mật khẩu / OTP / captcha
    'CAPTCHA',
    'KHOA_MO_SAI',        // không mở được kho mật khẩu
    // Trang Tendoo không chịu cho biết đang ở cửa hàng nào. KHÔNG phải sai khai
    // báo — nhưng chưa biết đang đứng ở đâu thì tuyệt đối không được làm tiếp,
    // vì mọi việc sau đó đều dựa vào giả định "đang đúng cửa hàng".
    'KHONG_DOC_DUOC_DANH_TINH',
]);

/**
 * ĐÃ BẤM THANH TOÁN MÀ KHÔNG BIẾT KẾT QUẢ.
 *
 * Đây KHÔNG phải lỗi thường. Lỗi thường (thiếu hàng, lệch quá dung sai, chưa
 * khai báo) thì chắc chắn chưa có hóa đơn nào, ghi nhận rồi chạy tiếp là an
 * toàn. Còn nhóm này nghĩa là nút đã bị bấm rồi và mình KHÔNG biết hóa đơn đã
 * lên cơ quan thuế hay chưa:
 *   - coi là lỗi rồi cho chạy lại  -> có thể ra HAI hóa đơn cho một khoản tiền
 *   - chạy tiếp khách sau           -> nhân cái không rõ đó lên
 * Nên phải TREO lệnh lại và DỪNG CẢ LOẠT, bắt người dùng tự mở Tendoo kết luận.
 */
const KET_QUA_KHONG_RO = new Set([
    'KHONG_RO',
]);

/**
 * @param {object} phuThuoc
 * @param {object} phuThuoc.so         sổ ghi dấu (soGhiDau.taoSo)
 * @param {object} phuThuoc.khoaLuuTru { doc(), ghi() } — nơi giữ khóa chống chạy chồng
 * @param {string} phuThuoc.mayId      định danh máy/phiên đang chạy
 */
function taoHangDoi({ so, khoaLuuTru, mayId, tuyChon = {} }) {
    const dongHo = tuyChon.dongHo || (() => Date.now());
    const hanKhoaMs = tuyChon.hanKhoaMs || HAN_KHOA_MAC_DINH;
    const nghiKhoang = tuyChon.nghiKhoang || NGHI_MAC_DINH;
    const nguNghi = tuyChon.nguNghi || (ms => new Promise(r => setTimeout(r, ms)));
    const ngauNhien = tuyChon.ngauNhien || Math.random;

    async function giuKhoa() {
        const hienTai = await khoaLuuTru.doc();
        if (hienTai && hienTai.mayId !== mayId && Number(hienTai.hetHanLuc) > dongHo()) {
            return { ok: false, lyDo: 'Một cửa sổ khác đang chạy — đợi nó xong đã' };
        }
        await khoaLuuTru.ghi({ mayId, hetHanLuc: dongHo() + hanKhoaMs, giuLuc: dongHo() });
        return { ok: true };
    }

    async function giaHanKhoa() {
        await khoaLuuTru.ghi({ mayId, hetHanLuc: dongHo() + hanKhoaMs, giuLuc: dongHo() });
    }

    async function nhaKhoa() {
        const hienTai = await khoaLuuTru.doc();
        if (!hienTai || hienTai.mayId === mayId) await khoaLuuTru.ghi(null);
    }

    async function xepHang(danhSach) {
        const daXep = [];
        for (const kh of danhSach || []) daXep.push(await so.taoLenh(kh));
        return daXep;
    }

    /**
     * Chạy hết hàng đợi.
     *
     * @param {(lenh:object)=>Promise<{ok:boolean, ketQua?:object, ma?:string, thongBao?:string}>} thucThi
     *        Hàm làm việc thật với một khách. GỌI SAU KHI đã ghi dấu "đang xử lý".
     * @param {(tinTuc:object)=>void} [bao] báo tiến độ ra ngoài
     */
    async function chayLoat(thucThi, bao = () => {}) {
        // (a) Quét dấu sót lại TRƯỚC MỌI THỨ.
        await so.quetKhiKhoiDong();

        // ⚠️ LỆNH TREO KHÔNG CÒN CHẶN — quyết định của chủ dự án 2026-08-13:
        // "không cần quan tâm trùng hay không, chỉ cần có lệnh chạy là chạy".
        //
        // Bản cũ thấy còn lệnh treo là dừng ngay, chưa làm gì cả, và bắt người
        // dùng tự mở Tendoo kết luận từng lệnh. Nay tự kết luận "chưa ra — cho
        // chạy lại" để chúng không dồn đống, rồi chạy tiếp.
        //
        // Đánh đổi ĐÃ ĐƯỢC CHẤP NHẬN: máy không biết hóa đơn lần trước đã ra hay
        // chưa, nên có thể ra hóa đơn trùng. Lệnh treo vẫn được GHI vào sổ và
        // hiện trong lịch sử — chỉ không dùng để chặn nữa.
        const treoCu = so.layLenhTreo();
        for (const l of treoCu) {
            try { await so.xuLyLenhTreo(l.id, false); } catch (e) { /* kệ, chạy tiếp */ }
        }

        // (b) Giành khóa.
        const khoa = await giuKhoa();
        if (!khoa.ok) return { dung: true, ly_do: 'DANG_CHAY_CHO_KHAC', thongBao: khoa.lyDo };

        const ketQua = { xong: [], loi: [], bo: 0, dung: false,
                         treoDaTuBoQua: treoCu.length };

        try {
            let lenh;
            let dauTien = true;
            while ((lenh = so.layLenhCho()[0])) {
                if (!dauTien) {
                    const [min, max] = nghiKhoang;
                    await nguNghi(Math.floor(min + ngauNhien() * (max - min)));
                }
                dauTien = false;

                await giaHanKhoa();

                // (c) GHI DẤU XUỐNG ĐĨA TRƯỚC KHI LÀM BẤT CỨ ĐIỀU GÌ.
                await so.danhDauDangXuLy(lenh.id);
                bao({ loai: 'bat-dau', lenh });

                let kq;
                try {
                    kq = await thucThi(lenh);
                } catch (e) {
                    // Ngoại lệ không lường trước: để nguyên dấu "đang xử lý" là
                    // đúng — mình KHÔNG biết đã bấm Thanh toán hay chưa. Lần sau
                    // khởi động sẽ thấy và treo lại, bắt người kiểm tra.
                    ketQua.dung = true;
                    ketQua.ly_do = 'NGOAI_LE';
                    ketQua.thongBao = 'Có lỗi bất ngờ khi đang xử lý — '
                        + 'KHÔNG rõ hóa đơn đã phát hành chưa. Hãy kiểm tra trên Tendoo.';
                    ketQua.bo += await so.boCacLenhCho(ketQua.thongBao);
                    return ketQua;
                }

                if (kq && kq.ok) {
                    await so.danhDauXong(lenh.id, kq.ketQua || {});
                    ketQua.xong.push({ ...lenh, ketQua: kq.ketQua });
                    bao({ loai: 'xong', lenh, ketQua: kq.ketQua });
                    continue;
                }

                const ma = (kq && kq.ma) || 'KHONG_RO';
                const thongBao = (kq && kq.thongBao) || '';

                // Không rõ đã phát hành hay chưa -> TREO, không phải lỗi thường.
                //
                // ⚠️ TRỪ khi bên dưới nói thẳng `chuaLamGi` — nghĩa là hỏng
                // TRƯỚC KHI đụng tới giỏ hàng (đổi tài khoản, mở tab…). Lúc đó
                // chắc chắn chưa có hóa đơn nào, treo lại là oan: TREO chặn hẳn
                // hẹn giờ cho tới khi người dùng tự kết luận từng lệnh một.
                //
                // Cờ này còn là lưới an toàn cho lỗi lập trình: mã lỗi nào lọt
                // lưới sẽ rơi về 'KHONG_RO' (xem dòng `|| 'KHONG_RO'` ở trên) và
                // hóa thành TREO oan — đã xảy ra thật 2026-08-13.
                if (KET_QUA_KHONG_RO.has(ma) && !(kq && kq.chuaLamGi)) {
                    // GHI LẠI rồi CHẠY TIẾP khách sau — không dừng cả loạt nữa.
                    // Khách này vẫn hiện là TREO trong lịch sử để bạn xem lại.
                    await so.danhDauTreo(lenh.id, thongBao);
                    ketQua.treo = so.layLenhTreo();
                    // ⚠️ KÈM `ketQua`. Từ 2026-08-18 một lệnh có thể ra NHIỀU
                    // hóa đơn; treo ở tờ thứ 4 thì 3 tờ đầu ĐÃ RA THẬT. Không
                    // gửi kèm thì dayVeSell không có cách nào biết, và số tiền
                    // đã xuất biến mất khỏi mọi sổ sách.
                    bao({ loai: 'treo', lenh, ma, thongBao, ketQua: kq && kq.ketQua });
                    continue;
                }

                await so.danhDauLoi(lenh.id, ma, (kq && kq.thongBao) || '');
                ketQua.loi.push({ ...lenh, maLoi: ma, thongBao: (kq && kq.thongBao) || '' });
                // ⚠️ KÈM `ketQua` — cùng lý do với nhánh TREO ngay trên: một lệnh
                // có thể đã ra vài hóa đơn trước khi hỏng, và chúng KHÔNG rút lại
                // được. Thiếu chỗ này thì dayVeSell chỉ thấy "lỗi" và ghi 0.
                bao({ loai: 'loi', lenh, ma, thongBao: kq && kq.thongBao,
                      ketQua: kq && kq.ketQua });

                if (LOI_DUNG_CA_LOAT.has(ma)) {
                    ketQua.dung = true;
                    ketQua.ly_do = ma;
                    ketQua.thongBao = (kq && kq.thongBao) || 'Lỗi nghiêm trọng — đã dừng cả loạt';
                    ketQua.bo += await so.boCacLenhCho(ketQua.thongBao);
                    return ketQua;
                }
                // Lỗi riêng của một khách (lệch quá dung sai, thiếu hàng, chưa
                // khai báo) -> ghi nhận rồi chạy tiếp khách sau.
            }
            return ketQua;
        } finally {
            await nhaKhoa();     // nhả khóa kể cả khi ném lỗi
        }
    }

    return { xepHang, chayLoat, giuKhoa, giaHanKhoa, nhaKhoa,
             LOI_DUNG_CA_LOAT, KET_QUA_KHONG_RO };
}

const API = { taoHangDoi, LOI_DUNG_CA_LOAT, KET_QUA_KHONG_RO, HAN_KHOA_MAC_DINH };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof globalThis !== 'undefined') globalThis.HDT_HangDoi = API;
})();
