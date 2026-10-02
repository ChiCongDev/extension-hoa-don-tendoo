'use strict';

// ⚠️ TOÀN BỘ FILE NẰM TRONG MỘT PHẠM VI RIÊNG (hàm bọc ngoài).

(function () {

// ============================================================================
//  KHO THẺ RA VÀO TENDOO — mỗi khách một thẻ, dùng để ĐỌC doanh thu.
//
//  ⛔⛔⛔ THẺ NÀY NGANG MẬT KHẨU. Ai cầm được chuỗi ấy là vào được tài khoản
//  Tendoo của khách và PHÁT HÀNH ĐƯỢC HÓA ĐƠN THUẾ. Cho nên, y hệt luật đang
//  áp cho mật khẩu trong khoMatKhau.js:
//
//      · KHÔNG ghi ra console, KHÔNG đưa vào thông báo lỗi
//      · KHÔNG gửi về Sell, KHÔNG gửi vào tin Telegram
//      · KHÔNG trả ra ngoài trong bất kỳ hàm "xem/liệt kê" nào
//
//  `lietKe()` dưới đây cố ý CHỈ trả về mã khách và hạn dùng — không bao giờ
//  trả chuỗi thẻ. Muốn dùng thẻ thì gọi `doc()`, và nơi gọi phải nhét thẳng
//  vào tiêu đề Authorization rồi quên đi.
//
//  ── VÌ SAO CẦN CẤT THẺ THAY VÌ ĐĂNG NHẬP MỖI LẦN ───────────────────────────
//  Thẻ Tendoo sống ~30 ngày (quan sát thật: cấp 15:54 22/09 -> hết 15:54
//  22/10). Extension vốn đã đăng nhập từng khách mỗi ngày để xuất hóa đơn, nên
//  chỉ việc NHẶT thẻ lúc đi ngang qua rồi dùng lại cả tháng. Nhờ vậy việc đọc
//  doanh thu KHÔNG phải đổi tài khoản lần nào — tức là không bao giờ chen
//  ngang một lượt xuất hóa đơn đang dở.
//
//  ── HẠN DÙNG NẰM NGAY TRONG THẺ ────────────────────────────────────────────
//  Thẻ là chuỗi JWT: ba phần ngăn bởi dấu chấm, phần giữa là JSON mã base64url
//  có trường `exp` (giây). Đọc được hạn nghĩa là máy BIẾT TRƯỚC thẻ sắp chết,
//  không phải đợi bị từ chối mới biết. Đọc KHÔNG cần khóa bí mật nào — phần
//  giữa vốn công khai; chữ ký ở phần ba mới là thứ chỉ máy chủ kiểm được.
// ============================================================================

// Coi như đã chết khi còn dưới mức này — đi lấy thẻ mới trước, đừng để một
// lượt quét dài bắt đầu bằng thẻ sắp tắt rồi chết giữa chừng.
const LE_AN_TOAN_MS = 6 * 60 * 60 * 1000;      // 6 giờ

/**
 * Đọc hạn dùng ghi trong thẻ.
 * @returns {number|null} mốc mili-giây, hoặc null nếu không đọc được
 *
 * ⚠️ Không đọc được thì trả null, và nơi gọi coi như HẾT HẠN. Thà đi lấy thẻ
 * mới thừa một lần còn hơn dùng một cái thẻ mình không hiểu.
 */
/** Bóc phần giữa (công khai) của thẻ JWT. Hỏng -> null. ⛔ Không in `the`. */
function thanThe(the) {
    if (typeof the !== 'string') return null;
    const phan = the.split('.');
    if (phan.length !== 3) return null;
    try {
        const giua = phan[1].replace(/-/g, '+').replace(/_/g, '/');
        const dem = giua + '='.repeat((4 - (giua.length % 4)) % 4);
        const json = JSON.parse(
            typeof atob === 'function'
                ? atob(dem)
                : Buffer.from(dem, 'base64').toString('utf8'));
        return (json && typeof json === 'object') ? json : null;
    } catch (e) {
        return null;
    }
}

function hanCuaThe(the) {
    const json = thanThe(the);
    const exp = json && json.exp;
    if (typeof exp !== 'number' || !Number.isFinite(exp) || exp <= 0) return null;
    return Math.round(exp * 1000);
}

/**
 * Mã cửa hàng ghi TRONG thẻ (trường business_id).
 *
 * Dùng để biết những khách nào DÙNG CHUNG một cửa hàng Tendoo — chủ dự án xác
 * nhận 02/10/2026 có khách như vậy (Hải Đăng Sport và Hồng Huệ S8). Tendoo chỉ
 * trả tổng THEO CỬA HÀNG, nên hai khách chung cửa hàng đọc ra cùng một số; hàng
 * TỔNG phải cộng cửa hàng ấy MỘT lần chứ không phải hai.
 *
 * Lấy từ thẻ chứ không từ két: thẻ chính là thứ máy chủ dùng để quyết định trả
 * số của cửa hàng nào, nên đây là sự thật, còn két là thứ người gõ tay. Mã cửa
 * hàng KHÔNG phải bí mật — nó là định danh, không đăng nhập được bằng nó.
 */
function cuaHangCuaThe(the) {
    const json = thanThe(the);
    const id = json && json.business_id;
    if (typeof id !== 'string') return null;
    const s = id.trim();
    // Chỉ nhận định danh gọn gàng — chặn chuỗi lạ đi thẳng vào sổ kế toán.
    return /^[A-Za-z0-9-]{1,64}$/.test(s) ? s : null;
}

/**
 * Thẻ vừa nhặt có ĐÚNG là của cửa hàng mình mong đợi không.
 *
 * ⚠️ PHÉP SO ĐỂ Ở ĐÂY CHỨ KHÔNG CHÔN TRONG PHẦN NỀN — đúng nếp
 * `doiTaiKhoan.canDoiTaiKhoan()`: chôn trong nền thì không bài kiểm nào chạm
 * tới, mà đây là phép so quyết định thẻ của khách nào vào ô khách nào.
 *
 * Cất nhầm thẻ khách A vào ô khách B nghĩa là sau này đọc ra doanh thu của
 * CỬA HÀNG KHÁC rồi ghi thẳng vào sổ kế toán — đúng kiểu lẫn lộn mà cả
 * doiTaiKhoan.js sinh ra để chống.
 *
 * ⚠️ RỖNG LÀ KHÔNG KHỚP. Tab chưa biết mình đang ở cửa hàng nào thì thà bỏ
 * lỡ một lần nhặt thẻ, còn hơn cất bừa.
 */
function cungCuaHang(a, b) {
    const x = String(a || '').trim().toLowerCase();
    const y = String(b || '').trim().toLowerCase();
    if (!x || !y) return false;
    return x === y;
}

/** Thẻ còn dùng được không (tính cả lề an toàn). */
function conDung(the, bayGio) {
    const han = hanCuaThe(the);
    if (han === null) return false;
    return han - (bayGio || Date.now()) > LE_AN_TOAN_MS;
}

/**
 * @param {{doc:()=>Promise<any>, ghi:(o:any)=>Promise<void>}} kho
 */
function taoKhoThe(kho) {
    async function tatCa() {
        const o = await kho.doc();
        return (o && typeof o === 'object' && o.the && typeof o.the === 'object')
            ? o : { the: {} };
    }

    /** Cất thẻ của một khách. Ghi đè thẻ cũ. */
    async function ghi(maKH, the) {
        const ma = String(maKH || '').trim();
        if (!ma) return false;
        if (typeof the !== 'string' || the.split('.').length !== 3) return false;
        // Thẻ đã chết thì đừng cất — cất vào chỉ để lần sau lôi ra rồi vứt.
        if (hanCuaThe(the) === null) return false;

        const o = await tatCa();
        o.the[ma] = { the, ghiLuc: Date.now() };
        await kho.ghi(o);
        return true;
    }

    /**
     * Lấy thẻ dùng được của một khách. Hết hạn hoặc chưa có -> null.
     * ⛔ Giá trị trả về là BÍ MẬT.
     */
    async function doc(maKH, bayGio) {
        const o = await tatCa();
        const bg = o.the[String(maKH || '').trim()];
        if (!bg || !conDung(bg.the, bayGio)) return null;
        return bg.the;
    }

    /** Vứt thẻ của một khách — gọi khi Tendoo từ chối nó. */
    async function xoa(maKH) {
        const o = await tatCa();
        const ma = String(maKH || '').trim();
        if (!(ma in o.the)) return false;
        delete o.the[ma];
        await kho.ghi(o);
        return true;
    }

    /**
     * Liệt kê để hiện lên giao diện.
     *
     * ⛔⛔ CỐ Ý KHÔNG TRẢ CHUỖI THẺ. Hàm này sinh ra để vẽ bảng "khách nào đã
     * có thẻ, hạn đến bao giờ" — mà bảng thì đi vào DOM, vào ảnh chụp màn hình,
     * có khi vào cả tin nhắn. Trả kèm thẻ ở đây là rò cả kho.
     */
    async function lietKe(bayGio) {
        const o = await tatCa();
        const nay = bayGio || Date.now();
        return Object.entries(o.the).map(([maKH, bg]) => ({
            maKH,
            hetHanLuc: hanCuaThe(bg && bg.the),
            conDung: conDung(bg && bg.the, nay),
        }));
    }

    /** Dọn thẻ đã chết — gọi lúc khởi động cho kho khỏi phình. */
    async function donThe(bayGio) {
        const o = await tatCa();
        const nay = bayGio || Date.now();
        let n = 0;
        for (const [ma, bg] of Object.entries(o.the)) {
            const han = hanCuaThe(bg && bg.the);
            if (han === null || han <= nay) { delete o.the[ma]; n++; }
        }
        if (n) await kho.ghi(o);
        return n;
    }

    return { ghi, doc, xoa, lietKe, donThe };
}

const API = { taoKhoThe, hanCuaThe, cuaHangCuaThe, conDung, cungCuaHang, LE_AN_TOAN_MS };

if (typeof module !== 'undefined' && module.exports) module.exports = API;
globalThis.HDT_KhoThe = API;

})();
