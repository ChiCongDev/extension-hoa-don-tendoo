'use strict';

// ⚠️ TOÀN BỘ FILE NẰM TRONG MỘT PHẠM VI RIÊNG (hàm bọc ngoài).

(function () {

// ============================================================================
//  MẤY VIỆC CƠ BẢN KHI ĐIỀU KHIỂN GIAO DIỆN REACT / ANT DESIGN
//
//  Cả trang đăng nhập lẫn trang bán hàng của Tendoo đều dựng bằng React
//  (Ant Design). Có hai điều bắt buộc phải biết, đã trả giá để học:
//
//  1. GÁN `input.value` THẲNG LÀ VÔ HÌNH VỚI REACT.
//     Ô hiện chữ nhưng React vẫn nghĩ nó rỗng. Bấm nút thì báo "chưa nhập gì".
//     Phải gọi native setter rồi phát sự kiện `input` để React nhận.
//
//  2. GIAO DIỆN VẼ LẠI SAU KHI GẮN, XÓA TRẮNG THỨ VỪA ĐIỀN.
//     Nên điền xong PHẢI ĐỌC LẠI xác nhận, sai thì làm lại.
//
//  Thêm một việc nhỏ: đọc chữ trên trang phải có `textContent` làm lối lui,
//  vì `innerText` không phải nơi nào cũng có — thiếu nó là phần dò captcha/lỗi
//  im lặng bỏ qua, tưởng trang sạch.
// ============================================================================

/** Đặt giá trị theo cách React/Ant Design thật sự nhìn thấy. */
function datGiaTri(o, giaTri) {
    if (!o) return;
    const mota = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(o) || {}, 'value');
    if (mota && mota.set) mota.set.call(o, giaTri);
    else o.value = giaTri;

    const CuaSo = (o.ownerDocument && o.ownerDocument.defaultView) || globalThis;
    for (const ten of ['input', 'change']) {
        if (CuaSo.Event) o.dispatchEvent(new CuaSo.Event(ten, { bubbles: true }));
    }
}

/**
 * Điền rồi ĐỌC LẠI xác nhận, thử tối đa `soLanThu` lần.
 * @returns {Promise<boolean>} true nếu giá trị đã thật sự nằm trong ô.
 */
async function dienChacChan(o, giaTri, { soLanThu = 3, nghi } = {}) {
    const cho = nghi || (ms => new Promise(r => setTimeout(r, ms)));
    const mong = String(giaTri);
    for (let lan = 0; lan < soLanThu; lan++) {
        datGiaTri(o, '');
        datGiaTri(o, mong);
        await cho(200);
        if (String(o.value) === mong) return true;
    }
    return false;
}

/** Đọc chữ của một phần tử, chịu được nơi không có innerText. */
function docChu(el) {
    if (!el) return '';
    return String(el.innerText || el.textContent || '');
}

/** Gom chữ về một dòng, bỏ khoảng trắng thừa — để so sánh cho chắc. */
const gonChu = (el) => docChu(el).replace(/\s+/g, ' ').trim();

/** Bóc số tiền kiểu "1.400.000 đ" -> 1400000. Không đọc được thì trả null. */
function docSoTien(chu) {
    const s = String(chu == null ? '' : chu);
    // Phải nhận được cả số MỘT chữ số: giỏ trống hiện "Tổng thanh toán: 0 đ",
    // đòi tối thiểu 2 ký tự là trả null và tầng trên tưởng đọc hỏng.
    const m = s.match(/-?\d[\d.,]*/);
    if (!m) return null;
    const so = Number(m[0].replace(/[.,\s]/g, ''));
    return Number.isFinite(so) ? so : null;
}

const API = { datGiaTri, dienChacChan, docChu, gonChu, docSoTien };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof globalThis !== 'undefined') globalThis.HDT_DomReact = API;

})();
