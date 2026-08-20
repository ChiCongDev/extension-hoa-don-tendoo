'use strict';

// ⚠️ TOÀN BỘ FILE NẰM TRONG MỘT PHẠM VI RIÊNG (hàm bọc ngoài).
// Chrome nạp nhiều file vào CÙNG MỘT phạm vi — hai file cùng khai `const API`
// là file thứ hai nổ ngay khi nạp mà KHÔNG có lỗi nào hiện ra: trang chỉ đơn
// giản trống trơn. Đã dính đúng lỗi này một lần.

(function () {

// ============================================================================
//  TRANG KHAI BÁO — bản nhúng vào trang Sell (khaiBao.html)
//
//  Nối màn hình khai báo (popup/khaiBao.js) vào chrome.storage, y hệt popup
//  trước đây. Khác đúng ba chỗ:
//    1. Điền sẵn mã khách lấy từ đường dẫn -> khỏi phải nhớ rồi gõ lại.
//    2. Lưu xong thì báo cho trang cha để nó tô lại dấu hiệu trên bảng ngay.
//    3. Tự co giãn chiều cao theo nội dung.
//
//  CHỈ ĐỐI TƯỢNG KHO (đã mã hóa) được ghi xuống chrome.storage. Khóa mở và mật
//  khẩu dạng thường không bao giờ đi qua đây, và KHÔNG BAO GIỜ được gửi ra
//  trang cha — postMessage bên dưới chỉ mang đúng một chữ "đã đổi".
// ============================================================================

const KHOA_LUU = 'hdt-kho-tai-khoan';

function taoLuuTru() {
    const coChrome = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
    if (!coChrome) {
        let tam = null;
        return { async doc() { return tam; }, async ghi(o) { tam = o; } };
    }
    return {
        async doc() {
            const kq = await chrome.storage.local.get(KHOA_LUU);
            return kq[KHOA_LUU] || null;
        },
        async ghi(o) {
            if (o == null) await chrome.storage.local.remove(KHOA_LUU);
            else await chrome.storage.local.set({ [KHOA_LUU]: o });
            bao();                       // kho vừa đổi -> nhắc trang cha tô lại
        },
    };
}

/** Tải một chuỗi xuống thành tệp. Dùng thẻ <a download>, không cần quyền gì thêm. */
function taiXuong(tenTep, noiDung) {
    const goi = new Blob([noiDung], { type: 'application/json' });
    const diaChi = URL.createObjectURL(goi);
    const a = document.createElement('a');
    a.href = diaChi;
    a.download = tenTep;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(diaChi), 5000);
}

/** Mở hộp chọn tệp, trả về nội dung. Người dùng bấm Hủy -> trả null. */
function chonTep() {
    return new Promise((xong) => {
        const o = document.createElement('input');
        o.type = 'file';
        o.accept = 'application/json,.json';
        o.style.display = 'none';
        o.addEventListener('change', () => {
            const tep = o.files && o.files[0];
            if (!tep) { o.remove(); return xong(null); }
            const doc = new FileReader();
            doc.onload = () => { o.remove(); xong(String(doc.result || '')); };
            doc.onerror = () => { o.remove(); xong(null); };
            doc.readAsText(tep);
        });
        document.body.appendChild(o);
        o.click();
    });
}

async function guiNen(tin) {
    try {
        if (typeof chrome === 'undefined' || !chrome.runtime) return null;
        return await chrome.runtime.sendMessage(tin);
    } catch (e) {
        return null;
    }
}

/**
 * Báo trang cha "có gì đó vừa đổi, đọc lại tình trạng đi".
 *
 * CHỈ gửi đúng một nhãn. Không kèm mã khách, không kèm số lượng, tuyệt đối
 * không kèm mật khẩu — trang cha là trang Sell, mọi thứ gửi sang đó coi như
 * công khai. Muốn biết tình trạng thì trang cha tự hỏi tiến trình nền.
 */
function bao() {
    try {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ hdt: 'khai-bao-doi' }, '*');
        }
    } catch (e) { /* không có cha, hoặc bị chặn -> kệ */ }
}

/** Mã khách + tên lấy từ đường dẫn, để điền sẵn. Không có gì bí mật ở đây. */
function docThamSo() {
    try {
        const q = new URLSearchParams(String(location.search || ''));
        return { maKH: (q.get('maKH') || '').trim(), ten: (q.get('ten') || '').trim() };
    } catch (e) {
        return { maKH: '', ten: '' };
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const goc = document.getElementById('khaiBao');
    if (!goc || !globalThis.HDT_KhaiBao || !globalThis.HDT_KhoMatKhau) return;

    const ts = docThamSo();
    const GhiNhan = globalThis.HDT_GhiNhanCuaHang || null;
    const manHinh = globalThis.HDT_KhaiBao.gan(goc, {
        Kho: globalThis.HDT_KhoMatKhau,
        luuTru: taoLuuTru(),
        luuTruCuaHang: GhiNhan ? GhiNhan.taoLuuTruChrome(globalThis.chrome) : null,
        GhiNhan,
        taiXuong, chonTep, guiNen,
        // Điền sẵn theo dòng khách vừa bấm — đúng cái làm nên tiện lợi của việc
        // dời khai báo về trang Sell.
        dienSanKhach: ts.maKH ? { maKH: ts.maKH, ghiChu: ts.ten } : null,
    });
    await manHinh.nap();
    bao();
});

const API = { taoLuuTru, docThamSo, bao, KHOA_LUU };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof globalThis !== 'undefined') globalThis.HDT_KhaiBaoTrang = API;

})();
