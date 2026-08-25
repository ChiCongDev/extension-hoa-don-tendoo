'use strict';

// ⚠️ TOÀN BỘ FILE NẰM TRONG MỘT PHẠM VI RIÊNG (hàm bọc ngoài).
// Chrome nạp nhiều file vào CÙNG MỘT phạm vi — hai file cùng khai `const API`
// là file thứ hai nổ ngay khi nạp, và KHÔNG có lỗi nào hiện ra cho người dùng:
// popup chỉ đơn giản trống trơn. Đã dính đúng lỗi này một lần. Bọc lại để không
// bao giờ dính nữa. Xuất ra ngoài qua globalThis.HDT_* ở cuối file.

(function () {

// ============================================================================
//  BỘ NỐI API TENDOO THẬT  —  thay cho máy chủ giả lập ở giai đoạn 4a
//
//  Địa chỉ và cách xác thực dưới đây KHÔNG phải đoán từ tài liệu: chúng được
//  quan sát trực tiếp trên phiên làm việc thật ngày 2026-08-10.
//
//    GET  /user/v2/auth/info                    -> phiên + cửa hàng đang đăng nhập
//    GET  /product/v2/products?business_id=&page=&page_size=200&has_record_deleted=false
//    GET  /process-invoice/api/v1/invoice-process/manage/warning-invoice-quota
//    POST /pricing/api/v2/calculate-order       -> tổng tiền do máy chủ tính
//
//  XÁC THỰC: 19/21 lời gọi mang header `Authorization`. Token nằm trong
//  localStorage của trang Tendoo dưới khóa `@access_token`. Bộ nối KHÔNG tự
//  đọc localStorage — nó nhận hàm `layToken` từ ngoài, để:
//    - test được ngoài trình duyệt
//    - token không bị vương vãi trong nhiều lớp code
//
//  page_size=200 là con số CHÍNH APP TENDOO dùng -> lấy trọn 177 sản phẩm
//  trong MỘT lời gọi thay vì lật 18 trang.
//
//  ⚠️ Bộ nối trả về JSON THÔ. Việc chuẩn hóa là của docSanPham.js / danhTinh.js
//  (Ranh giới 4). Không được để dữ liệu thô của Tendoo chảy sâu hơn hai file đó.
// ============================================================================

const GOC_API = 'https://apiv3.tendoo.vn';
const CO_TRANG = 200;                 // đúng con số app Tendoo dùng
// Ranh giới 5: không lời gọi nào chờ mãi.
//
// ⚠️ 60 GIÂY, nâng từ 20 — chủ dự án chốt 25/08/2026.
// Lượt 10:05 ngày 25/08 hỏng với «Tendoo không trả lời trong 20s» khi đọc tài
// khoản đang đăng nhập. Ảnh chụp lúc ấy cho thấy trang POS CÒN ĐANG TẢI (màn
// xám, vòng quay) — Tendoo chậm thật chứ máy không hỏng.
//
// ⚠️ ĐÁNH ĐỔI, ghi ra cho rõ: chờ lâu hơn thì ít bỏ cuộc oan hơn, NHƯNG một
// khách gọi NHIỀU lần API, nên lượt chạy có thể dài ra đáng kể khi Tendoo ì.
// Lịch đặt các mốc cách nhau 5 phút; lượt tràn qua mốc sau thì mốc ấy bị khóa
// "đang chạy dở" chặn lại và khách đó hôm ấy KHÔNG có hóa đơn. Chuyện đó nay
// có báo về Telegram (lý do DANG_CHAY) nên không mất trong im lặng — nhưng nếu
// Tendoo hay ì thì nên giãn mốc ra 7-10 phút.
const HAN_CHO_MS = 60000;

const DUONG = {
    phien: '/user/v2/auth/info',
    sanPham: '/product/v2/products',
    hanMucHoaDon: '/process-invoice/api/v1/invoice-process/manage/warning-invoice-quota',
    tinhDon: '/pricing/api/v2/calculate-order',
};

class LoiTendoo extends Error {
    constructor(ma, thongBao, trangThai) {
        super(thongBao);
        this.ma = ma;
        this.trangThai = trangThai;
    }
}

/**
 * @param {object} caiDat
 * @param {()=>Promise<string|null>} caiDat.layToken   đọc @access_token
 * @param {()=>Promise<string|null>} [caiDat.layMaCuaHang] đọc @business_id
 * @param {typeof fetch} [caiDat.goiMang]
 */
function taoBoNoi(caiDat) {
    const layToken = caiDat.layToken;
    const layMaCuaHang = caiDat.layMaCuaHang || (async () => null);
    const goiMang = caiDat.goiMang || ((...a) => fetch(...a));
    const hanChoMs = caiDat.hanChoMs || HAN_CHO_MS;
    const gocApi = caiDat.gocApi || GOC_API;

    async function goi(duong, tuyChon = {}) {
        const token = await layToken();
        if (!token) {
            throw new LoiTendoo('CHUA_DANG_NHAP', 'Không đọc được token — chưa đăng nhập Tendoo');
        }

        // Ranh giới 5: mọi lời gọi ra ngoài đều có hạn chờ và có đường lui.
        const boHuy = new AbortController();
        const hen = setTimeout(() => boHuy.abort(), hanChoMs);

        let phanHoi;
        try {
            phanHoi = await goiMang(gocApi + duong, {
                method: tuyChon.method || 'GET',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Accept': 'application/json',
                    ...(tuyChon.body ? { 'Content-Type': 'application/json' } : {}),
                },
                ...(tuyChon.body ? { body: JSON.stringify(tuyChon.body) } : {}),
                signal: boHuy.signal,
            });
        } catch (e) {
            if (e && e.name === 'AbortError') {
                throw new LoiTendoo('QUA_HAN_CHO', `Tendoo không trả lời trong ${hanChoMs / 1000}s`);
            }
            throw new LoiTendoo('MAT_MANG', 'Không gọi được Tendoo: ' + e.message);
        } finally {
            clearTimeout(hen);
        }

        if (phanHoi.status === 401 || phanHoi.status === 403) {
            // Token hết hạn giữa chừng. KHÔNG tự thử lại, KHÔNG tự đăng nhập lại
            // ở đây — tầng trên phải quyết, vì đăng nhập lại có thể nhảy sang
            // tài khoản khác.
            throw new LoiTendoo('HET_PHIEN', 'Phiên Tendoo đã hết hạn', phanHoi.status);
        }
        if (!phanHoi.ok) {
            throw new LoiTendoo('MAY_CHU_LOI', `Tendoo trả lỗi ${phanHoi.status}`, phanHoi.status);
        }

        let json;
        try {
            json = await phanHoi.json();
        } catch (e) {
            throw new LoiTendoo('PHAN_HOI_HONG', 'Tendoo trả về nội dung không đọc được');
        }
        if (json && json.success === false) {
            const tb = (json.error && json.error.message) || 'Tendoo báo thất bại';
            throw new LoiTendoo('MAY_CHU_LOI', tb);
        }
        return json;
    }

    // ── Các việc cụ thể ─────────────────────────────────────────────────────

    /** JSON thô của `info` — danhTinh.js sẽ bóc. */
    const layPhien = () => goi(DUONG.phien);

    /**
     * Một trang sản phẩm. Chữ ký giữ nguyên như máy chủ giả lập để bộ điều phối
     * không phải biết mình đang nói chuyện với đồ thật hay đồ giả.
     */
    async function goiTrangSanPham(trang) {
        const maCuaHang = await layMaCuaHang();
        const thamSo = new URLSearchParams({
            page: String(trang),
            page_size: String(CO_TRANG),
            has_record_deleted: 'false',
        });
        // business_id là tùy chọn với máy chủ, nhưng gửi kèm thì kho trả về chắc
        // chắn thuộc đúng cửa hàng -> phục vụ đối chiếu chéo ở bộ điều phối.
        if (maCuaHang) thamSo.set('business_id', maCuaHang);
        return goi(`${DUONG.sanPham}?${thamSo.toString()}`);
    }

    /**
     * Hạn mức hóa đơn. Tendoo có giới hạn số hóa đơn phát hành — chạy hàng loạt
     * mà đụng trần giữa chừng thì hỏng dở dang. Đọc TRƯỚC khi chạy.
     * Không đọc được thì trả null (không chặn), vì đây là cảnh báo chứ không
     * phải điều kiện bắt buộc.
     */
    async function layHanMucHoaDon() {
        try {
            return await goi(DUONG.hanMucHoaDon);
        } catch (e) {
            return null;
        }
    }

    /** Tổng tiền do CHÍNH Tendoo tính — nguồn cho cửa chặn 2. */
    async function tinhTongTheoTendoo(danhSach) {
        const maCuaHang = await layMaCuaHang();
        const json = await goi(DUONG.tinhDon, {
            method: 'POST',
            body: {
                calculate_id: (globalThis.crypto && globalThis.crypto.randomUUID)
                    ? globalThis.crypto.randomUUID() : String(Date.now()),
                other_discount: 0, delivery_fee: 0,
                promotion_discount: 0, customer_point_discount: 0,
                list_product_fast: [], list_surcharge: [],
                business_id: maCuaHang,
                list_order_item: danhSach.map((d, i) => ({
                    lineId: `${d.id}-${Date.now()}-${i}`,
                    quantity: d.soLuong,
                    price: d.gia,
                    product_id: d.id,
                    additional_item_info: { amount: 0, type: 'value', is_gift: false },
                    order_item_add_on: [],
                })),
            },
        });
        return json;
    }

    return { goi, layPhien, goiTrangSanPham, layHanMucHoaDon, tinhTongTheoTendoo,
             GOC_API: gocApi, CO_TRANG, DUONG };
}

/** Đọc token từ localStorage của trang Tendoo (dùng trong content script). */
function taoDocKhoTrang(cuaSo) {
    const ls = cuaSo && cuaSo.localStorage;
    const doc = (khoa) => {
        if (!ls) return null;
        const v = ls.getItem(khoa);
        if (!v) return null;
        // Tendoo lưu một số khóa dạng JSON có dấu nháy bao ngoài.
        try {
            const p = JSON.parse(v);
            return (typeof p === 'string') ? p : v;
        } catch (e) {
            return v;
        }
    };
    return {
        layToken: async () => doc('@access_token'),
        layMaCuaHang: async () => doc('@business_id'),
    };
}

const API = { taoBoNoi, taoDocKhoTrang, LoiTendoo, GOC_API, CO_TRANG, DUONG,
              HAN_CHO_MS };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof globalThis !== 'undefined') globalThis.HDT_BoNoi = API;
})();
