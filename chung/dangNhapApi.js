'use strict';

// ⚠️ TOÀN BỘ FILE NẰM TRONG MỘT PHẠM VI RIÊNG (hàm bọc ngoài).

(function () {

// ============================================================================
//  ĐĂNG NHẬP TENDOO BẰNG API — lấy thẻ ra vào KHÔNG cần mở tab, KHÔNG đổi
//  tài khoản trên trang.
//
//  ── VÌ SAO CÓ FILE NÀY ─────────────────────────────────────────────────────
//  Trước đây muốn có thẻ phải đợi một lượt XUẤT HÓA ĐƠN đi ngang qua rồi nhặt
//  thẻ từ trang. Khách cả tháng không xuất hóa đơn thì cột doanh thu trống mãi.
//  File này gọi THẲNG cửa đăng nhập, đúng như trình duyệt làm — nên lấy được
//  thẻ cho MỌI khách bất cứ lúc nào, ngay trong nền.
//
//  ── ĐÂY LÀ BẮT CHƯỚC TRÌNH DUYỆT, KHÔNG PHẢI VƯỢT RÀO ──────────────────────
//  Cùng đường API, cùng phép mã hóa, cùng mật khẩu của chính khách. Địa chỉ,
//  tên trường, thuật toán mã hóa, và cả OTP_SECRET_KEY dưới đây đều QUAN SÁT
//  TRỰC TIẾP từ mã JavaScript công khai của Tendoo ngày 2026-09-23, rồi kiểm
//  chứng bằng vòng mã-hóa-giải-mã và một lần gọi thử với tài khoản giả (máy chủ
//  trả ASILA01 "không tìm thấy người dùng" — tức ĐÃ giải mã được mật khẩu và
//  chấp nhận định dạng, chỉ từ chối vì tài khoản không có thật).
//
//  ⚠️ OTP_SECRET_KEY NẰM CỨNG TRONG MÃ TENDOO. Họ đổi nó lúc nào là đăng nhập
//  API hỏng lúc đó, KHÔNG báo trước. Đây là CỬA HAI CHIỀU: hỏng thì tầng trên
//  lùi về cách nhặt thẻ từ tab như cũ. Không phải chuyện sống còn.
//
//  ⛔⛔⛔ MẬT KHẨU VÀ THẺ ĐỀU LÀ BÍ MẬT. Không file nào ở đây được in mật khẩu
//  hay thẻ ra console/thông báo/Telegram. Mật khẩu chỉ đi qua đúng một đường:
//  mã hóa rồi nhét vào thân yêu cầu.
// ============================================================================

// Quan sát công khai từ mã Tendoo. KHÔNG phải bí mật của người dùng — ai xem
// mã trang Tendoo cũng thấy. Đặt ở đây để đăng nhập bằng API tự chủ được.
const OTP_SECRET_KEY = 'YrMjl2hou0Jp59EzxlNYqGYQRTZe4u7b';
const DUONG_DANG_NHAP = '/user/v2/auth/login';
const GOC_API = 'https://apiv3.tendoo.vn';
const PLATFORM = 'pro_web';        // giá trị của seller (PRO_WEB) trong mã Tendoo
const HAN_CHO_MS = 30000;          // Ranh giới 5: không chờ mãi

/**
 * Mã hóa mật khẩu ĐÚNG NHƯ hàm i(e) của Tendoo: AES-256-GCM, IV 12 byte ngẫu
 * nhiên, authTag 16 byte, kết quả = hex(IV + bản_mã + authTag).
 *
 * WebCrypto trả bản_mã và authTag GỘP SẴN, nên chỉ cần ghép IV vào đầu — đã
 * kiểm chứng khớp với bộ giải mã của Tendoo.
 *
 * @param {SubtleCrypto} subtle
 */
async function maHoaMatKhau(subtle, matKhau) {
    if (!matKhau) throw new Error('Mật khẩu rỗng');
    const mahoa = new TextEncoder();
    const khoa = await subtle.importKey('raw', mahoa.encode(OTP_SECRET_KEY),
        { name: 'AES-GCM' }, false, ['encrypt']);
    const iv = new Uint8Array(12);
    (globalThis.crypto || crypto).getRandomValues(iv);
    const out = new Uint8Array(await subtle.encrypt(
        { name: 'AES-GCM', iv, tagLength: 128 }, khoa, mahoa.encode(matKhau)));
    const goi = new Uint8Array(iv.length + out.length);
    goi.set(iv, 0);
    goi.set(out, iv.length);
    // -> hex
    let hex = '';
    for (const b of goi) hex += b.toString(16).padStart(2, '0');
    return hex;
}

const MA = {
    THIEU: 'THIEU_THONG_TIN',
    SAI_TAI_KHOAN: 'SAI_TAI_KHOAN',
    QUA_HAN: 'QUA_HAN_CHO',
    MAT_MANG: 'MAT_MANG',
    MAY_CHU_LOI: 'MAY_CHU_LOI',
    KHONG_CO_THE: 'KHONG_CO_THE_TRONG_PHAN_HOI',
};

// Lời giải thích cố định — KHÔNG dán nguyên văn lỗi máy chủ (có thể mang theo
// thứ không nên hiện), và cho người đọc biết phải làm gì.
const LOI_DE_HIEU = {
    [MA.THIEU]: 'Thiếu tài khoản hoặc mật khẩu Tendoo của khách.',
    [MA.SAI_TAI_KHOAN]: 'Tendoo từ chối tài khoản hoặc mật khẩu — hãy khai báo lại cho khách này.',
    [MA.QUA_HAN]: 'Tendoo không trả lời kịp khi đăng nhập.',
    [MA.MAT_MANG]: 'Không nối được tới Tendoo để đăng nhập.',
    [MA.MAY_CHU_LOI]: 'Tendoo báo lỗi khi đăng nhập.',
    [MA.KHONG_CO_THE]: 'Đăng nhập xong nhưng Tendoo không trả về thẻ.',
};

/**
 * Đăng nhập một khách, trả về thẻ ra vào.
 *
 * @param {object} p
 * @param {string} p.tenDangNhap  số điện thoại đăng nhập (chính là phone_number)
 * @param {string} p.matKhau      mật khẩu THÔ (đọc từ két ngay trước khi gọi)
 * @param {string} p.deviceId     id thiết bị ỔN ĐỊNH của extension
 * @param {SubtleCrypto} [p.subtle]
 * @param {typeof fetch} [p.goiMang]
 * @param {string} [p.gocApi]
 * @returns {Promise<{ok:true, the:string} | {ok:false, ma:string, thongBao:string}>}
 *
 * ⛔ Giá trị `the` trả về là BÍ MẬT. `thongBao` thì AN TOÀN để hiện.
 */
async function dangNhap(p) {
    const tenDangNhap = String((p && p.tenDangNhap) || '').trim();
    const matKhau = String((p && p.matKhau) || '');
    const deviceId = String((p && p.deviceId) || '').trim() || 'hdt-extension';
    if (!tenDangNhap || !matKhau) {
        return { ok: false, ma: MA.THIEU, thongBao: LOI_DE_HIEU[MA.THIEU] };
    }

    const subtle = (p && p.subtle)
        || (globalThis.crypto && globalThis.crypto.subtle);
    const goiMang = (p && p.goiMang) || ((...a) => fetch(...a));
    const gocApi = (p && p.gocApi) || GOC_API;

    let pwd;
    try {
        pwd = await maHoaMatKhau(subtle, matKhau);
    } catch (e) {
        // ⛔ KHÔNG kèm e.message: nó có thể lỡ mang theo mảnh mật khẩu.
        return { ok: false, ma: MA.MAY_CHU_LOI, thongBao: 'Không mã hóa được mật khẩu.' };
    }

    const than = {
        phone_number: tenDangNhap,
        email_login: '',
        device_id: deviceId,
        device_name: 'Extension hoa don Tendoo',
        platform: PLATFORM,
        pwd,
    };

    const boHuy = new AbortController();
    const hen = setTimeout(() => boHuy.abort(), HAN_CHO_MS);
    let phanHoi;
    try {
        phanHoi = await goiMang(gocApi + DUONG_DANG_NHAP, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'app-platform': 'Addy',
            },
            body: JSON.stringify(than),
            signal: boHuy.signal,
        });
    } catch (e) {
        if (e && e.name === 'AbortError') {
            return { ok: false, ma: MA.QUA_HAN, thongBao: LOI_DE_HIEU[MA.QUA_HAN] };
        }
        return { ok: false, ma: MA.MAT_MANG, thongBao: LOI_DE_HIEU[MA.MAT_MANG] };
    } finally {
        clearTimeout(hen);
    }

    // 400/401/404 khi đăng nhập gần như luôn là sai tài khoản/mật khẩu.
    if (phanHoi.status === 400 || phanHoi.status === 401 || phanHoi.status === 404) {
        return { ok: false, ma: MA.SAI_TAI_KHOAN, thongBao: LOI_DE_HIEU[MA.SAI_TAI_KHOAN] };
    }
    if (!phanHoi.ok) {
        return { ok: false, ma: MA.MAY_CHU_LOI, thongBao: LOI_DE_HIEU[MA.MAY_CHU_LOI] };
    }

    let json;
    try {
        json = await phanHoi.json();
    } catch (e) {
        return { ok: false, ma: MA.MAY_CHU_LOI, thongBao: LOI_DE_HIEU[MA.MAY_CHU_LOI] };
    }
    // Thẻ nằm ở body.data.access_token (quan sát từ hàm wy của Tendoo).
    const the = json && json.data && json.data.access_token;
    if (!the || typeof the !== 'string') {
        return { ok: false, ma: MA.KHONG_CO_THE, thongBao: LOI_DE_HIEU[MA.KHONG_CO_THE] };
    }
    return { ok: true, the };
}

const API = { dangNhap, maHoaMatKhau, MA, LOI_DE_HIEU,
              OTP_SECRET_KEY, DUONG_DANG_NHAP, PLATFORM };

if (typeof module !== 'undefined' && module.exports) module.exports = API;
globalThis.HDT_DangNhapApi = API;

})();
