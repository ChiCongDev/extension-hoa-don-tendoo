'use strict';

// ⚠️ TOÀN BỘ FILE NẰM TRONG MỘT PHẠM VI RIÊNG (hàm bọc ngoài).
// Chrome nạp nhiều file vào CÙNG MỘT phạm vi — hai file cùng khai `const API`
// là file thứ hai nổ ngay khi nạp, và KHÔNG có lỗi nào hiện ra cho người dùng.

(function () {

// ============================================================================
//  GHI NHẬN CỬA HÀNG ĐANG ĐĂNG NHẬP
//
//  Chạy trên trang POS của Tendoo. Mỗi lần bạn mở trang đó, nó ghi lại:
//      { maCuaHang, tenCuaHang, luc }
//  vào bộ nhớ extension. Popup đọc lại để:
//      1. ĐỐI CHIẾU khai báo sẵn có  -> "khớp với khách PA" hay "chưa gán cho ai"
//      2. ĐIỀN SẴN mã cửa hàng khi khai báo khách mới -> khỏi mò F12
//
//  KHÔNG XIN THÊM QUYỀN NÀO: trang seller-v3.tendoo.vn đã nằm trong quyền hiện
//  có, và `storage` cũng đã có sẵn.
//
//  CHỈ ĐỌC, KHÔNG GỬI ĐI ĐÂU. Không đụng tới `@access_token`. Thứ ghi lại chỉ
//  là mã cửa hàng và tên cửa hàng — không phải bí mật, chính là thứ hiện trên
//  màn hình Tendoo.
// ============================================================================

const KHOA_LUU = 'hdt-cua-hang-vua-thay';

// Mã cửa hàng Tendoo là UUID: 8-4-4-4-12 chữ số hex.
const DANG_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Dọn chuỗi người dùng dán vào: bỏ khoảng trắng và dấu nháy bao ngoài.
 * Đây là hai lỗi hay gặp nhất khi copy từ Local Storage — Chrome hiện giá trị
 * kèm dấu nháy, dán nguyên vào là hỏng mà nhìn thì thấy giống hệt.
 */
function lamSachMa(chuoi) {
    return String(chuoi == null ? '' : chuoi).trim().replace(/^["']+|["']+$/g, '').trim();
}

const laMaHopLe = (chuoi) => DANG_UUID.test(lamSachMa(chuoi));

/** Đọc một khóa, tự gỡ lớp JSON nếu Tendoo lưu dạng chuỗi JSON. */
function docKhoa(ls, ten) {
    if (!ls || typeof ls.getItem !== 'function') return null;
    const tho = ls.getItem(ten);
    if (tho == null || tho === '') return null;
    try {
        const p = JSON.parse(tho);
        return p;
    } catch (e) {
        return tho;
    }
}

/**
 * Bóc mã + tên cửa hàng từ Local Storage của trang Tendoo.
 * Tendoo có nhiều khóa hình dạng khác nhau nên thử lần lượt, KHÔNG đoán bừa:
 * không tìm được tên thì để trống, còn không có mã thì trả null.
 * @returns {{maCuaHang:string, tenCuaHang:string}|null}
 */
function bocThongTin(ls) {
    const ma = lamSachMa(docKhoa(ls, '@business_id'));
    if (!DANG_UUID.test(ma)) return null;      // không có mã đúng dạng -> vô dụng

    let ten = '';
    for (const khoa of ['@business_store', '@user_store']) {
        const o = docKhoa(ls, khoa);
        if (!o) continue;
        if (typeof o === 'string') { ten = o; break; }
        if (typeof o === 'object') {
            const ch = o.current_store || o.store || o;
            ten = String(ch.store_name || ch.name || o.display_name || o.name || '').trim();
            if (ten) break;
        }
    }
    return { maCuaHang: ma, tenCuaHang: ten };
}

/**
 * Ghi nhận vào bộ nhớ extension. Không có gì để ghi thì KHÔNG xóa bản ghi cũ —
 * trang tải dở hoặc chưa đăng nhập không được làm mất thông tin lần trước.
 */
async function ghiNhan({ ls, luuTru, dongHo = () => Date.now() }) {
    const tin = bocThongTin(ls);
    if (!tin) return { daGhi: false, lyDo: 'Chưa đăng nhập hoặc chưa đọc được mã cửa hàng' };
    await luuTru.ghi({ ...tin, luc: dongHo() });
    return { daGhi: true, ...tin };
}

/** Bọc chrome.storage.local cho riêng khóa này. */
function taoLuuTruChrome(chromeApi) {
    const kho = chromeApi && chromeApi.storage && chromeApi.storage.local;
    if (!kho) return null;
    return {
        async doc() { const kq = await kho.get(KHOA_LUU); return kq[KHOA_LUU] || null; },
        async ghi(o) {
            if (o == null) await kho.remove(KHOA_LUU);
            else await kho.set({ [KHOA_LUU]: o });
        },
    };
}

const API = { bocThongTin, ghiNhan, taoLuuTruChrome, lamSachMa, laMaHopLe, KHOA_LUU, DANG_UUID };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof globalThis !== 'undefined') globalThis.HDT_GhiNhanCuaHang = API;

// Tự chạy KHI VÀ CHỈ KHI đang ở trên trang Tendoo. File này cũng được nạp vào
// popup (để dùng chung hàm dọn chuỗi), nên phải chặn, không thì popup sẽ ghi đè
// bản ghi bằng Local Storage của chính nó.
(async function tuChay() {
    if (typeof globalThis.location === 'undefined') return;
    if (!/(^|\.)tendoo\.vn$/i.test(String(globalThis.location.hostname || ''))) return;
    const luuTru = taoLuuTruChrome(globalThis.chrome);
    if (!luuTru) return;
    try {
        await ghiNhan({ ls: globalThis.localStorage, luuTru });
    } catch (e) {
        // Nuốt lỗi có chủ đích: đây là việc phụ, hỏng thì thôi, tuyệt đối không
        // được làm ảnh hưởng tới trang bán hàng của khách.
    }
})();

})();
