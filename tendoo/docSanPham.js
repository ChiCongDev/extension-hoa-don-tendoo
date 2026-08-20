'use strict';

// ⚠️ TOÀN BỘ FILE NẰM TRONG MỘT PHẠM VI RIÊNG (hàm bọc ngoài).
// Chrome nạp nhiều file vào CÙNG MỘT phạm vi — hai file cùng khai `const API`
// là file thứ hai nổ ngay khi nạp, và KHÔNG có lỗi nào hiện ra cho người dùng:
// popup chỉ đơn giản trống trơn. Đã dính đúng lỗi này một lần. Bọc lại để không
// bao giờ dính nữa. Xuất ra ngoài qua globalThis.HDT_* ở cuối file.

(function () {

// ============================================================================
//  ĐỌC SẢN PHẨM TỪ API TENDOO  —  products?page=&page_size=&sort=newest
//
//  ADAPTER (Ranh giới 4). Thuật toán ghép tiền KHÔNG BAO GIỜ thấy JSON gốc của
//  Tendoo — nó chỉ nhận { id, ten, ma, gia, ton }. Tendoo đổi tên trường thì
//  chỉ file này phải sửa.
//
//  BA CÁI BẪY ĐÃ GẶP TRONG DỮ LIỆU THẬT, chép lại để đời sau khỏi dẫm lại:
//
//  1. `is_out_of_stock` LUÔN BẰNG true — kể cả sản phẩm còn tồn 22 cái.
//     Tin vào nó là loại sạch kho, không ghép được gì. Chỉ dùng
//     `available_quantity`.
//
//  2. Chữ trên thẻ hàng ở màn hình POS ("ÁKDDDN") KHÔNG PHẢI mã sản phẩm.
//     Mã thật là `product_code` = "SP0095"; "ÁKDDDN" chỉ là chữ cái đầu của
//     "Áo khoác dạ dáng dài nữ" do giao diện tự sinh. Dò hàng theo chữ trên
//     màn hình là sai. Khóa duy nhất đáng tin là `id` (UUID).
//
//  3. `is_active` cũng luôn bằng false trên toàn bộ mẫu thu được -> vô dụng,
//     không dùng để lọc.
// ============================================================================

const LY_DO_BO = {
    NHIEU_BIEN_THE: 'hàng nhiều biến thể — chưa hỗ trợ',
    HET_HANG: 'hết hàng',
    GIA_KHONG_HOP_LE: 'giá không hợp lệ',
    THIEU_MA: 'thiếu mã định danh',
};

/**
 * Chuẩn hóa MỘT trang kết quả.
 * @returns {{hang:Array, meta:object, boQua:Array<{ten:string, lyDo:string}>,
 *            maCuaHang:string|null}}
 */
function chuanHoaTrang(json) {
    if (!json || json.success !== true || !Array.isArray(json.data)) {
        throw new Error('Phản hồi products không đúng dạng mong đợi');
    }

    const hang = [];
    const boQua = [];
    const cacMaCuaHang = new Set();

    for (const sp of json.data) {
        const ten = String(sp && sp.name || '').trim();

        if (!sp || !sp.id) { boQua.push({ ten, lyDo: LY_DO_BO.THIEU_MA }); continue; }

        // Hàng nhiều biến thể (mỗi size/màu một giá, một tồn riêng) cần biết
        // cách bỏ vào giỏ theo biến thể — chưa có mẫu thật nên KHÔNG đoán.
        // Bỏ qua và báo rõ, hơn là ghép nhầm rồi xuất hóa đơn sai.
        if (sp.variant_mode && sp.variant_mode !== 'non_variant') {
            boQua.push({ ten, lyDo: LY_DO_BO.NHIEU_BIEN_THE });
            continue;
        }

        // final_price đã tính khuyến mãi; base_price chỉ là giá gốc.
        const gia = Math.round(Number(
            sp.final_price != null ? sp.final_price : sp.base_price));
        if (!Number.isFinite(gia) || gia <= 0) {
            boQua.push({ ten, lyDo: LY_DO_BO.GIA_KHONG_HOP_LE });
            continue;
        }

        // KHÔNG dùng is_out_of_stock (xem bẫy số 1 ở đầu file).
        const ton = Math.floor(Number(sp.available_quantity));
        if (!Number.isFinite(ton) || ton <= 0) {
            boQua.push({ ten, lyDo: LY_DO_BO.HET_HANG });
            continue;
        }

        if (sp.business_id) cacMaCuaHang.add(String(sp.business_id));

        hang.push({
            id: String(sp.id),
            ten,
            ma: String(sp.product_code || '').trim(),
            gia,
            ton,
            phienBan: Number(sp.version || 0),   // calculate-order cần product_version
            maCuaHang: sp.business_id ? String(sp.business_id) : null,
        });
    }

    return {
        hang,
        boQua,
        meta: json.meta || {},
        maCuaHang: cacMaCuaHang.size === 1 ? [...cacMaCuaHang][0] : null,
    };
}

/**
 * Lấy TOÀN BỘ sản phẩm, tự lật hết các trang.
 *
 * @param {(trang:number)=>Promise<object>} goiTrang  Hàm gọi API, do bên ngoài
 *        truyền vào. Adapter không tự dựng URL/không tự cầm token — nhờ vậy
 *        test được ngoài trình duyệt và không lẫn việc xác thực vào đây.
 * @param {{tranSoTrang?:number}} [tuyChon]
 * @returns {Promise<{hang:Array, boQua:Array, tongTheoMayChu:number,
 *                    soTrangDaDoc:number, maCuaHang:string|null}>}
 */
async function layTatCa(goiTrang, tuyChon = {}) {
    const tranSoTrang = tuyChon.tranSoTrang || 100;   // chặn vòng lặp chạy loạn

    const dau = chuanHoaTrang(await goiTrang(1));
    const hang = [...dau.hang];
    const boQua = [...dau.boQua];
    const cacMaCuaHang = new Set(dau.maCuaHang ? [dau.maCuaHang] : []);

    // Dùng total_pages DO MÁY CHỦ TRẢ VỀ, không tự tính từ page_size mình xin:
    // máy chủ có quyền phớt lờ page_size và trả về cỡ trang khác.
    const tongTrang = Math.min(Number(dau.meta.total_pages || 1), tranSoTrang);

    for (let trang = 2; trang <= tongTrang; trang++) {
        const t = chuanHoaTrang(await goiTrang(trang));
        hang.push(...t.hang);
        boQua.push(...t.boQua);
        if (t.maCuaHang) cacMaCuaHang.add(t.maCuaHang);
    }

    // Trùng id giữa các trang (hay xảy ra khi kho đổi lúc đang lật trang) ->
    // giữ bản đầu tiên, không cộng dồn tồn kho.
    const theoId = new Map();
    for (const h of hang) if (!theoId.has(h.id)) theoId.set(h.id, h);

    return {
        hang: [...theoId.values()],
        boQua,
        tongTheoMayChu: Number(dau.meta.total || 0),
        soTrangDaDoc: tongTrang,
        // Nhiều hơn một mã cửa hàng trong cùng một kho = dữ liệu lẫn lộn -> null
        // để tầng trên coi là KHÔNG XÁC ĐỊNH và dừng.
        maCuaHang: cacMaCuaHang.size === 1 ? [...cacMaCuaHang][0] : null,
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { chuanHoaTrang, layTatCa, LY_DO_BO };
}
if (typeof globalThis !== 'undefined') {
    globalThis.HDT_DocSanPham = { chuanHoaTrang, layTatCa, LY_DO_BO };
}
})();
