'use strict';

// ⚠️ TOÀN BỘ FILE NẰM TRONG MỘT PHẠM VI RIÊNG (hàm bọc ngoài).
// Chrome nạp nhiều file vào CÙNG MỘT phạm vi — hai file cùng khai `const API`
// là file thứ hai nổ ngay khi nạp, và KHÔNG có lỗi nào hiện ra cho người dùng:
// popup chỉ đơn giản trống trơn. Đã dính đúng lỗi này một lần. Bọc lại để không
// bao giờ dính nữa. Xuất ra ngoài qua globalThis.HDT_* ở cuối file.

(function () {

// ============================================================================
//  KHO TÀI KHOẢN TENDOO — KHÔNG CÒN KHÓA MỞ (phiên bản 2)
//
//  Giữ ánh xạ:  Mã KH trong Sell  ->  { mã cửa hàng Tendoo, tên đăng nhập,
//                                       mật khẩu (đã mã hóa) }
//
//  ⚠️ ĐỌC KỸ TRƯỚC KHI SỬA — MỨC BẢO VỆ Ở ĐÂY LÀ CÓ CHỦ ĐÍCH, KHÔNG PHẢI SƠ SUẤT
//
//  Bản 1 mã hóa bằng KHÓA MỞ do người dùng gõ (PBKDF2 600.000 vòng). Khóa đó chỉ
//  nằm trong đầu người dùng, nên kho trên đĩa thật sự an toàn kể cả khi máy bị
//  sao chép. Đổi lại: mỗi lần mở Chrome, mỗi lần tải lại extension, mỗi 2 tiếng
//  là phải gõ lại — và người dùng bị chặn giữa chừng liên tục.
//
//  Chủ dự án đã cân nhắc và CHỌN BỎ HẲN KHÓA MỞ (2026-08-12), chấp nhận đánh đổi.
//  Nay chìa khóa AES do máy tự sinh và nằm NGAY TRONG KHO, trên đĩa.
//
//  NÓI CHO ĐÚNG: đây là CHE MẮT, KHÔNG PHẢI BẢO VỆ.
//  Ai đọc được kho thì cũng đọc được chìa nằm cạnh nó. Lớp AES ở đây chỉ ngăn
//  mật khẩu hiện ra dạng chữ thường khi lỡ chụp màn hình hoặc xem bộ nhớ
//  extension. Từ nay, an toàn của mọi tài khoản khách hàng phụ thuộc vào việc
//  CÁI MÁY NÀY có an toàn hay không. Đừng viết chú thích nào nói khác đi.
//
//  BA ĐIỀU VẪN KHÔNG BAO GIỜ ĐƯỢC LÀM Ở FILE NÀY
//    1. Không ghi mật khẩu ra console / log / thông báo lỗi.
//    2. Không ghi mật khẩu vào bất kỳ file nào trong thư mục extension.
//    3. Không gửi mật khẩu về máy chủ Sell — Sell không cần và không được biết.
//
//  Chỗ DUY NHẤT còn hỏi mật khẩu là TỆP SAO LƯU, vì tệp đó rời khỏi máy (USB,
//  Zalo, Drive). Bỏ trống cũng được — khi đó tệp mở được bằng tay không.
//
//  Module này KHÔNG tự đụng chrome.storage: nó nhận vào / trả ra một đối tượng
//  thuần. Nhờ vậy test được ngoài trình duyệt, và việc lưu trữ nằm ở tầng khác.
// ============================================================================

const SO_VONG_BAM = 600000;          // khuyến nghị OWASP cho PBKDF2-HMAC-SHA256
const CAU_KIEM_TRA = 'hdt-kiem-tra-khoa-mo';
const PHIEN_BAN_KHO = 2;             // 1 = có khóa mở, 2 = chìa tự sinh
const PHIEN_BAN_KHO_CU = 1;

const mahoa = new TextEncoder();
const giaima = new TextDecoder();

function layCrypto() {
    const c = (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
    if (!c || !c.subtle) throw new Error('Môi trường không có WebCrypto');
    return c;
}

const sangB64 = (bytes) => (typeof Buffer !== 'undefined')
    ? Buffer.from(bytes).toString('base64')
    : btoa(String.fromCharCode(...new Uint8Array(bytes)));

const tuB64 = (chuoi) => (typeof Buffer !== 'undefined')
    ? new Uint8Array(Buffer.from(chuoi, 'base64'))
    : Uint8Array.from(atob(chuoi), c => c.charCodeAt(0));

function nhienNgau(soByte) {
    const b = new Uint8Array(soByte);
    layCrypto().getRandomValues(b);
    return b;
}

/** Từ mật khẩu + muối -> khóa AES-256. Chậm là CỐ Ý: chống dò mật khẩu.
 *  Chỉ còn dùng cho KHO CŨ và cho TỆP SAO LƯU có đặt mật khẩu. */
async function dungKhoa(matKhau, muoi) {
    const c = layCrypto();
    const goc = await c.subtle.importKey('raw', mahoa.encode(matKhau), 'PBKDF2', false, ['deriveKey']);
    return c.subtle.deriveKey(
        { name: 'PBKDF2', salt: muoi, iterations: SO_VONG_BAM, hash: 'SHA-256' },
        goc,
        { name: 'AES-GCM', length: 256 },
        false,                                  // KHÔNG cho phép trích xuất khóa
        ['encrypt', 'decrypt'],
    );
}

/** Nạp chìa AES-256 thô (đã sinh ngẫu nhiên) thành CryptoKey. */
function napChia(byteChia) {
    return layCrypto().subtle.importKey(
        'raw', byteChia, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function mahoaChuoi(khoa, chuoi) {
    const iv = nhienNgau(12);                   // mỗi bản ghi một IV RIÊNG
    const banMa = await layCrypto().subtle.encrypt(
        { name: 'AES-GCM', iv }, khoa, mahoa.encode(chuoi));
    return { iv: sangB64(iv), duLieu: sangB64(banMa) };
}

async function giaimaChuoi(khoa, goi) {
    const ro = await layCrypto().subtle.decrypt(
        { name: 'AES-GCM', iv: tuB64(goi.iv) }, khoa, tuB64(goi.duLieu));
    return giaima.decode(ro);
}

// ── KHO PHIÊN BẢN 2: chìa tự sinh, không hỏi ai ─────────────────────────────

/** Kho rỗng, chìa do máy tự sinh và nằm ngay trong kho. */
async function taoKho() {
    return {
        phienBan: PHIEN_BAN_KHO,
        chiaKhoa: sangB64(nhienNgau(32)),       // AES-256
        khach: {},
    };
}

const laKhoCu = (kho) => !!(kho && Number(kho.phienBan) === PHIEN_BAN_KHO_CU);

/**
 * Mở kho. Không cần mật khẩu gì cả.
 *
 * Kho CŨ (bản 1) thì KHÔNG mở được ở đây — phải chuyển đổi trước, xem
 * `chuyenKhoCu`. Trả cờ `khoCu` để tầng trên biết mà hỏi khóa mở lần cuối.
 * @returns {Promise<{ok:boolean, khoa?:CryptoKey, lyDo?:string, khoCu?:boolean}>}
 */
async function moKho(kho) {
    if (!kho) return { ok: false, lyDo: 'Kho chưa được tạo' };
    if (laKhoCu(kho)) {
        return { ok: false, khoCu: true,
                 lyDo: 'Kho cũ còn mã hóa bằng khóa mở — cần chuyển đổi một lần' };
    }
    if (!kho.chiaKhoa) return { ok: false, lyDo: 'Kho thiếu chìa khóa' };
    try {
        return { ok: true, khoa: await napChia(tuB64(kho.chiaKhoa)) };
    } catch (e) {
        return { ok: false, lyDo: 'Chìa khóa trong kho bị hỏng' };
    }
}

async function ghiKhach(kho, khoa, maKH, thongTin) {
    const ma = String(maKH || '').trim();
    if (!ma) throw new Error('Thiếu mã khách hàng');
    const maCuaHang = String(thongTin && thongTin.maCuaHang || '').trim();
    if (!maCuaHang) throw new Error('Thiếu mã cửa hàng Tendoo');
    const matKhau = String(thongTin && thongTin.matKhau || '');
    if (!matKhau) throw new Error('Thiếu mật khẩu');

    kho.khach[ma] = {
        maCuaHang,
        tenDangNhap: String(thongTin.tenDangNhap || '').trim(),
        ghiChu: String(thongTin.ghiChu || '').trim(),
        matKhauMaHoa: await mahoaChuoi(khoa, matKhau),
        capNhatLuc: new Date().toISOString(),
    };
    return kho;
}

/** Mật khẩu chỉ ra khỏi kho qua đúng cửa này. */
async function docMatKhau(kho, khoa, maKH) {
    const bg = kho && kho.khach && kho.khach[String(maKH).trim()];
    if (!bg) return null;
    try {
        return await giaimaChuoi(khoa, bg.matKhauMaHoa);
    } catch (e) {
        return null;
    }
}

/** Danh sách để hiển thị — KHÔNG kèm mật khẩu, kể cả dạng mã hóa. */
function danhSachKhach(kho) {
    if (!kho || !kho.khach) return [];
    return Object.entries(kho.khach).map(([maKH, bg]) => ({
        maKH,
        maCuaHang: bg.maCuaHang,
        tenDangNhap: bg.tenDangNhap,
        ghiChu: bg.ghiChu,
        capNhatLuc: bg.capNhatLuc,
    }));
}

function xoaKhach(kho, maKH) {
    if (kho && kho.khach) delete kho.khach[String(maKH).trim()];
    return kho;
}

/**
 * MỌI khách đang dùng một cửa hàng Tendoo — trả về MẢNG mã khách.
 *
 * ⚠️ Từ 2026-08-15 một cửa hàng được gán cho NHIỀU khách (chủ dự án chốt).
 * Trả về một khách như trước là giấu mất những khách còn lại, mà "khách nào
 * hiện ra" lại phụ thuộc thứ tự lưu — nhìn vào tưởng chỉ có một người.
 *
 * Giữ thứ tự như trong kho để màn hình kể ra ổn định, không nhảy lung tung.
 */
function timCacKhachTheoCuaHang(kho, maCuaHang) {
    const can = String(maCuaHang || '').trim().toLowerCase();
    if (!can || !kho || !kho.khach) return [];
    const ra = [];
    for (const [maKH, bg] of Object.entries(kho.khach)) {
        if (String(bg.maCuaHang).toLowerCase() === can) ra.push(maKH);
    }
    return ra;
}

/**
 * Khách ĐẦU TIÊN dùng cửa hàng này, hoặc null.
 *
 * Giữ lại để không phá chỗ nào đang gọi. Cần biết ĐỦ danh sách thì dùng
 * timCacKhachTheoCuaHang() — cửa hàng nay có thể có nhiều khách.
 */
function timTheoCuaHang(kho, maCuaHang) {
    const cac = timCacKhachTheoCuaHang(kho, maCuaHang);
    return cac.length ? cac[0] : null;
}

// ── CHUYỂN KHO CŨ (bản 1) SANG KHO MỚI ──────────────────────────────────────
//
//  Người dùng đã khai báo bằng khóa mở trước khi bỏ khóa. Bỏ khóa đi mà không
//  chuyển thì những khai báo đó vĩnh viễn không đọc được nữa. Nên xin khóa mở
//  ĐÚNG MỘT LẦN CUỐI rồi mã hóa lại bằng chìa tự sinh.

/** Mở kho bản 1 bằng khóa mở. Chỉ dùng cho việc chuyển đổi. */
async function moKhoCu(kho, khoaMo) {
    if (!kho || !kho.muoi || !kho.cauKiemTra) return { ok: false, lyDo: 'Không phải kho cũ' };
    if (!khoaMo) return { ok: false, lyDo: 'Chưa nhập khóa mở' };
    try {
        const khoa = await dungKhoa(khoaMo, tuB64(kho.muoi));
        const thu = await giaimaChuoi(khoa, kho.cauKiemTra);
        if (thu !== CAU_KIEM_TRA) return { ok: false, lyDo: 'Khóa mở không đúng' };
        return { ok: true, khoa };
    } catch (e) {
        // Nuốt lỗi gốc CÓ CHỦ ĐÍCH: thông báo của thư viện mã hóa không nên lọt ra.
        return { ok: false, lyDo: 'Khóa mở không đúng' };
    }
}

/** @returns {Promise<{ok:true, kho:object, soKhach:number}|{ok:false, lyDo:string}>} */
async function chuyenKhoCu(khoCu, khoaMo) {
    const mo = await moKhoCu(khoCu, khoaMo);
    if (!mo.ok) return { ok: false, lyDo: mo.lyDo };

    const khoMoi = await taoKho();
    const moMoi = await moKho(khoMoi);
    let n = 0;
    for (const [maKH, bg] of Object.entries(khoCu.khach || {})) {
        const matKhau = await docMatKhau(khoCu, mo.khoa, maKH);
        if (!matKhau) continue;              // bản ghi hỏng thì bỏ, không đoán
        await ghiKhach(khoMoi, moMoi.khoa, maKH, {
            maCuaHang: bg.maCuaHang, tenDangNhap: bg.tenDangNhap,
            ghiChu: bg.ghiChu, matKhau,
        });
        n++;
    }
    return { ok: true, kho: khoMoi, soKhach: n };
}

// ── SAO LƯU / KHÔI PHỤC ─────────────────────────────────────────────────────
//
//  Khai báo 20 khách xong mà lỡ gỡ extension là mất sạch. Bản sao lưu để cất dự
//  phòng, hoặc chuyển sang máy khác.
//
//  ⚠️ TỆP SAO LƯU LÀ THỨ RỜI KHỎI MÁY — USB, Zalo, Drive. Kho trên đĩa nay đã
//  mang sẵn chìa khóa bên trong, nên chép nguyên kho ra tệp = chép luôn mật khẩu
//  đọc được. Vì vậy đây là chỗ DUY NHẤT còn hỏi mật khẩu, và có thể BỎ TRỐNG:
//    · có mật khẩu  -> cả kho bị bọc thêm một lớp PBKDF2 + AES, mở cần mật khẩu
//    · bỏ trống     -> tệp mở được bằng tay không. Đừng để giữa đường.

const LOAI_BAN_SAO = 'hdt-sao-luu-tai-khoan';
const PHIEN_BAN_BAN_SAO = 2;

/**
 * Đóng gói kho thành chuỗi để tải xuống.
 * @param {object} kho
 * @param {string} [matKhauTep]  bỏ trống = tệp không có mật khẩu
 */
async function taoBanSaoLuu(kho, matKhauTep = '') {
    if (!kho || (!kho.chiaKhoa && !kho.muoi)) throw new Error('Chưa có kho để sao lưu');
    const chung = {
        loai: LOAI_BAN_SAO,
        phienBan: PHIEN_BAN_BAN_SAO,
        luc: new Date().toISOString(),
        soKhach: Object.keys(kho.khach || {}).length,
    };
    if (!matKhauTep) {
        return JSON.stringify({ ...chung, coMatKhau: false, kho }, null, 2);
    }
    const muoi = nhienNgau(16);
    const khoa = await dungKhoa(matKhauTep, muoi);
    const goi = await mahoaChuoi(khoa, JSON.stringify(kho));
    return JSON.stringify({
        ...chung, coMatKhau: true, muoiTep: sangB64(muoi), goiMa: goi,
    }, null, 2);
}

/** Tệp này có cần mật khẩu không — hỏi trước khi bắt người dùng gõ. */
function banSaoCanMatKhau(chuoi) {
    try {
        const g = JSON.parse(String(chuoi || ''));
        return !!(g && g.coMatKhau);
    } catch (e) {
        return false;
    }
}

/** Kho đọc từ tệp có đủ hình hài không. Nhận nhầm file rác = xóa sạch khai báo thật. */
function kiemKho(kho) {
    if (!kho || typeof kho !== 'object') return 'Nội dung tệp không đúng';
    if (!kho.chiaKhoa && !(kho.muoi && kho.cauKiemTra)) {
        return 'Bản sao thiếu phần khóa — không dùng được';
    }
    if (kho.khach && typeof kho.khach !== 'object') {
        return 'Bản sao có danh sách khách không đúng dạng';
    }
    if (!kho.khach) kho.khach = {};
    for (const [maKH, bg] of Object.entries(kho.khach)) {
        if (!bg || !bg.maCuaHang || !bg.matKhauMaHoa
            || !bg.matKhauMaHoa.iv || !bg.matKhauMaHoa.duLieu) {
            return `Bản ghi của khách "${maKH}" bị hỏng`;
        }
    }
    return null;
}

/**
 * Đọc và KIỂM TRA bản sao. Từ chối theo mặc định.
 * @returns {Promise<{ok:true, kho, soKhach, luc}|{ok:false, lyDo, canMatKhau?}>}
 */
async function docBanSaoLuu(chuoi, matKhauTep = '') {
    let goi;
    try {
        goi = JSON.parse(String(chuoi || ''));
    } catch (e) {
        return { ok: false, lyDo: 'Tệp không phải JSON hợp lệ' };
    }
    if (!goi || typeof goi !== 'object') return { ok: false, lyDo: 'Nội dung tệp không đúng' };
    if (goi.loai !== LOAI_BAN_SAO) {
        return { ok: false, lyDo: 'Không phải bản sao khai báo tài khoản Tendoo' };
    }
    if (Number(goi.phienBan) > PHIEN_BAN_BAN_SAO) {
        return { ok: false, lyDo: 'Bản sao tạo bởi phiên bản mới hơn — hãy cập nhật extension' };
    }

    let kho = goi.kho;
    if (goi.coMatKhau) {
        if (!matKhauTep) {
            return { ok: false, canMatKhau: true, lyDo: 'Tệp này có mật khẩu — hãy nhập mật khẩu của tệp' };
        }
        if (!goi.muoiTep || !goi.goiMa) return { ok: false, lyDo: 'Tệp có mật khẩu nhưng thiếu phần mã' };
        try {
            const khoa = await dungKhoa(matKhauTep, tuB64(goi.muoiTep));
            kho = JSON.parse(await giaimaChuoi(khoa, goi.goiMa));
        } catch (e) {
            return { ok: false, canMatKhau: true, lyDo: 'Mật khẩu của tệp không đúng' };
        }
    }

    const loi = kiemKho(kho);
    if (loi) return { ok: false, lyDo: loi };
    return { ok: true, kho, soKhach: Object.keys(kho.khach).length, luc: String(goi.luc || '') };
}

const API = {
    taoKho, moKho, ghiKhach, docMatKhau, danhSachKhach, xoaKhach, timTheoCuaHang,
    timCacKhachTheoCuaHang,
    laKhoCu, moKhoCu, chuyenKhoCu,
    taoBanSaoLuu, docBanSaoLuu, banSaoCanMatKhau,
    SO_VONG_BAM, LOAI_BAN_SAO, PHIEN_BAN_BAN_SAO, PHIEN_BAN_KHO,
};

if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof globalThis !== 'undefined') globalThis.HDT_KhoMatKhau = API;
})();
