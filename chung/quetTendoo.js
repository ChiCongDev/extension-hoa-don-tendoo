'use strict';

// ⚠️ TOÀN BỘ FILE NẰM TRONG MỘT PHẠM VI RIÊNG (hàm bọc ngoài).

(function () {

// ============================================================================
//  QUÉT DOANH THU TENDOO — đọc ngược từ Tendoo về rồi đẩy sang Sell.
//
//  ── LUẬT SỐ MỘT, KHÔNG BAO GIỜ ĐƯỢC PHÁ ────────────────────────────────────
//  Bộ này CHỈ ĐỌC. Nó không phát hành, không sửa, không hủy một tờ hóa đơn nào.
//  Kết cục xấu nhất nó được phép gây ra là "cột Doanh thu Tendoo trống, có ghi
//  lý do". Nó KHÔNG được phép làm lỡ hay làm sai một tờ hóa đơn thuế.
//
//  Vì thế:
//    · KHÔNG giữ khóa chạy, KHÔNG đụng sổ ghi dấu (soGhiDau/hangDoi)
//    · KHÔNG đổi tài khoản Tendoo khi một lượt xuất đang chạy
//    · Mọi lỗi đều nuốt lại thành một dòng "lỗi" trong bản ghi, không ném lên
//
//  ── LẤY THẺ THẾ NÀO ────────────────────────────────────────────────────────
//  Tầng trên (background.moBoNoiTheoThe) lo việc có thẻ: ưu tiên thẻ còn hạn
//  trong kho, không có thì TỰ ĐĂNG NHẬP BẰNG API (chung/dangNhapApi.js) — không
//  mở tab, không đổi tài khoản trên trang. Bộ quét ở đây chỉ nhận `moBoNoi`:
//  trả bộ nối thì đọc, trả null thì ghi "không lấy được" kèm lý do.
//
//  ── MỘT NGÀY MỘT DÒNG ──────────────────────────────────────────────────────
//  Hỏi Tendoo theo TỪNG NGÀY chứ không hỏi cả khoảng một lần. Lý do: trang Kế
//  toán cho đổi Kỳ báo cáo tùy ý, mà một con số tổng chỉ đúng cho đúng một
//  khoảng. Lưu từng ngày thì kỳ nào cũng cộng ra được, và lỡ mấy ngày máy tắt
//  cũng lấp lại được.
// ============================================================================

const HenGio = (typeof module !== 'undefined' && module.exports)
    ? require('./henGio') : globalThis.HDT_HenGio;
const DocTongTendoo = (typeof module !== 'undefined' && module.exports)
    ? require('./docTongTendoo') : globalThis.HDT_DocTongTendoo;

/**
 * Một ngày Việt Nam -> cặp mốc UTC mà Tendoo chờ đợi.
 *
 * ⚠️ ĐÂY LÀ CHỖ DỄ SAI NHẤT CỦA CẢ TÍNH NĂNG. Trang Tendoo gửi
 *     start_time 2026-08-31T17:00:00.000Z  cho ngày 01/09 giờ Việt Nam
 * tức là 00:00 giờ VN = 17:00Z hôm trước (VN = UTC+7). Lệch một tiếng là con
 * số nhảy sang ngày khác, và không ai nhìn ra vì nó vẫn là một con số hợp lý.
 *
 * Dùng Date.UTC nên KHÔNG phụ thuộc múi giờ của máy đang chạy — máy người dùng
 * đặt sai múi giờ thì con số vẫn đúng.
 */
function khoangNgayVN(ngayISO) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ngayISO || ''));
    if (!m) return null;
    const nam = Number(m[1]), thang = Number(m[2]), ngay = Number(m[3]);
    // 00:00:00.000 giờ VN của ngày ấy, tính bằng UTC.
    const dau = Date.UTC(nam, thang - 1, ngay, 0, 0, 0, 0) - 7 * 3600 * 1000;
    // 23:59:59.999 giờ VN cùng ngày.
    const cuoi = dau + 24 * 3600 * 1000 - 1;
    return { tu: new Date(dau).toISOString(), den: new Date(cuoi).toISOString() };
}

/**
 * Số của một ngày đã CHỐT chưa — tức là lấy SAU lúc ngày ấy kết thúc (giờ VN).
 *
 * ⚠️ LỖI THẬT 02/10/2026: trước đây "đã có số" bị coi là "đã chốt". Lấy số lúc
 * 8 giờ sáng thì chỉ được phần phát hành tới 8 giờ; sang hôm sau ngày ấy bị coi
 * là xong và KHÔNG BAO GIỜ được lấy lại — loạt hóa đơn phát hành 09:31 ngày
 * 23/09 của khách PA mất khỏi cột, lệch 15.310.000 so với Tendoo.
 *
 * Một ngày đã kết thúc thì tổng hóa đơn phát hành TRONG ngày ấy không tăng thêm
 * được nữa (hóa đơn phát hành hôm sau thuộc về hôm sau). Nên lấy sau lúc kết
 * thúc là chốt thật.
 *
 * Tính ở ĐÂY bằng UTC chứ không để máy chủ Sell tự tính: múi giờ của ứng dụng
 * trên server đọc từ .env, mình không chắc bản trên Forge đặt gì.
 */
function daChot(ngayISO, luc) {
    const kh = khoangNgayVN(ngayISO);
    if (!kh) return false;
    return Number(luc) > Date.parse(kh.den);
}

/**
 * Những ngày cần đi lấy cho một khách, mới nhất trước.
 *
 * `soNgayLui` cho phép lấp lại quá khứ: máy tắt mấy hôm thì hôm sau đòi lại
 * được, và bật tính năng lần đầu là có luôn lịch sử. Đây là thứ cách đọc màn
 * hình không làm được.
 */
function cacNgayCanLay(homNay, soNgayLui) {
    const nay = String(homNay || HenGio.ngayVN());
    const n = Math.max(1, Math.min(400, Number(soNgayLui) || 1));
    const ra = [];
    for (let i = 0; i < n; i++) ra.push(HenGio.congNgay(nay, -i));
    return ra;
}

/**
 * Đã đến lúc quét lại cho khách này chưa.
 *
 * ⚠️ CHẶN DƯỚI 15 PHÚT. Một lượt quét đăng nhập và gọi API thật; để người dùng
 * gõ "1 phút" là máy quay vòng gõ cửa Tendoo cả ngày, và kết cục là bị chặn
 * tốc độ — lúc ấy hỏng cả việc xuất hóa đơn chứ không riêng việc đọc số.
 */
const PHUT_TOI_THIEU = 15;

function denLucQuet(lanCuoiLuc, phutLayLai, bayGio) {
    const phut = Math.max(PHUT_TOI_THIEU, Number(phutLayLai) || PHUT_TOI_THIEU);
    if (!lanCuoiLuc) return true;
    return (bayGio || Date.now()) - Number(lanCuoiLuc) >= phut * 60 * 1000;
}

/**
 * LỜI GIẢI THÍCH CỐ ĐỊNH CHO TỪNG MÃ LỖI.
 *
 * ⛔⛔ CỐ Ý KHÔNG DÁN NGUYÊN VĂN `e.message`. Chuỗi đó do tầng dưới hoặc chính
 * trình duyệt dựng nên — mình không kiểm soát được nội dung, mà nó thì đi
 * THẲNG vào cơ sở dữ liệu Sell rồi lên màn hình và vào tệp CSV. Một ngày nào
 * đó có thứ không nên hiện lọt vào đấy thì không ai gỡ ra được nữa.
 *
 * Đổi lại còn được cái lợi: người đọc thấy tiếng Việt và biết phải làm gì,
 * thay vì "Tendoo trả lỗi 502".
 */
const LOI_DE_HIEU = {
    HET_PHIEN: 'Thẻ Tendoo hết hạn — sẽ tự đăng nhập lại ở lượt sau.',
    QUA_HAN_CHO: 'Tendoo không trả lời kịp.',
    MAT_MANG: 'Không nối được tới Tendoo.',
    MAY_CHU_LOI: 'Tendoo báo lỗi khi đọc tổng hóa đơn.',
    PHAN_HOI_HONG: 'Tendoo trả về nội dung không đọc được.',
    CHUA_DANG_NHAP: 'Chưa có thẻ Tendoo để đọc.',
    NGAY_HONG: 'Ngày không hợp lệ.',
    LOI_LA: 'Không đọc được doanh thu Tendoo.',
};

/**
 * Đọc doanh thu một ngày của một khách.
 *
 * @returns {{ok:true, ...số} | {ok:false, ma:string, thongBao:string}}
 * ⛔ `thongBao` đi thẳng vào cơ sở dữ liệu Sell và lên màn hình — TUYỆT ĐỐI
 *    không được chứa thẻ hay mật khẩu.
 */
async function docMotNgay(boNoi, ngayISO) {
    const kh = khoangNgayVN(ngayISO);
    if (!kh) return { ok: false, ma: 'NGAY_HONG', thongBao: 'Ngày không hợp lệ' };
    let tho;
    try {
        tho = await boNoi.layTongHoaDon(kh.tu, kh.den);
    } catch (e) {
        // LoiTendoo mang sẵn mã: HET_PHIEN / QUA_HAN_CHO / MAT_MANG / MAY_CHU_LOI
        const ma = (e && e.ma) || 'LOI_LA';
        return { ok: false, ma, thongBao: LOI_DE_HIEU[ma] || LOI_DE_HIEU.LOI_LA };
    }
    const boc = DocTongTendoo.boc(tho);
    if (!boc.ok) return { ok: false, ma: boc.ma, thongBao: boc.thongBao };
    return boc;
}

/**
 * Quét cho một khách: nhiều ngày, trả về các bản ghi sẵn sàng đẩy sang Sell.
 *
 * @param {object} p
 * @param {{maKH:string, tenKH?:string}} p.khach
 * @param {(maKH:string)=>Promise<object|null>} p.moBoNoi  dựng bộ nối theo thẻ
 *        của khách; trả null nghĩa là CHƯA CÓ THẺ DÙNG ĐƯỢC.
 * @param {string[]} p.ngayCanLay
 * @param {()=>number} [p.dongHo]
 */
async function quetMotKhach({ khach, moBoNoi, ngayCanLay, dongHo }) {
    const luc = (dongHo || Date.now)();
    const maKH = String((khach && khach.maKH) || '').trim();
    if (!maKH) return { maKH: '', banGhi: [], heThong: 'THIEU_MA_KHACH' };

    const boNoi = await moBoNoi(maKH);
    if (!boNoi) {
        // Tới đây nghĩa là đã thử ĐĂNG NHẬP API mà vẫn không có thẻ — tức tài
        // khoản chưa khai báo, sai tài khoản/mật khẩu, hoặc Tendoo đang bận.
        // Ghi CẢ dòng lỗi cho ngày mới nhất để trên trang hiện "không lấy được
        // dữ liệu" kèm lý do, chứ không im lặng để trống.
        return {
            maKH, heThong: 'CHUA_CO_THE',
            banGhi: (ngayCanLay.length ? [ngayCanLay[0]] : []).map((ngay) => ({
                ma_khach_hang: maKH,
                ten_khach_hang: String((khach && khach.tenKH) || ''),
                ngay,
                lay_luc: luc,
                loi: 'Không đăng nhập được Tendoo cho khách này — hãy kiểm tra '
                   + 'tài khoản và mật khẩu đã khai (nút chìa khóa), hoặc thử lại sau.',
            })),
        };
    }

    const banGhi = [];
    let heThong = 'XONG';
    for (const ngay of ngayCanLay) {
        const kq = await docMotNgay(boNoi, ngay);
        if (kq.ok) {
            const luc = (dongHo || Date.now)();
            banGhi.push({
                ma_khach_hang: maKH,
                ten_khach_hang: String((khach && khach.tenKH) || ''),
                ngay,
                doanh_thu_truoc_thue: kq.doanhThuTruocThue,
                tong_tien_don_hang: kq.tongTienDonHang,
                so_luong_hoa_don: kq.soLuong,
                lay_luc: luc,
                da_chot: daChot(ngay, luc),
            });
            continue;
        }

        banGhi.push({
            ma_khach_hang: maKH,
            ten_khach_hang: String((khach && khach.tenKH) || ''),
            ngay,
            lay_luc: (dongHo || Date.now)(),
            loi: kq.thongBao,
        });

        // ⚠️ THẺ CHẾT THÌ DỪNG HẲN KHÁCH NÀY. Gọi tiếp 30 ngày nữa chỉ để nhận
        // 30 lần từ chối là quấy máy chủ vô ích — và dễ bị chặn tốc độ, lúc ấy
        // hỏng lây sang việc xuất hóa đơn.
        if (kq.ma === 'HET_PHIEN') { heThong = 'THE_CHET'; break; }
        // Mất mạng thì cũng dừng: ngày sau chắc chắn cũng hỏng.
        if (kq.ma === 'MAT_MANG') { heThong = 'MAT_MANG'; break; }
    }
    return { maKH, banGhi, heThong };
}

const API = { khoangNgayVN, cacNgayCanLay, denLucQuet, docMotNgay,
              quetMotKhach, daChot, PHUT_TOI_THIEU, LOI_DE_HIEU };

if (typeof module !== 'undefined' && module.exports) module.exports = API;
globalThis.HDT_QuetTendoo = API;

})();
