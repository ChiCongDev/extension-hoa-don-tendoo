'use strict';

// ⚠️ TOÀN BỘ FILE NẰM TRONG MỘT PHẠM VI RIÊNG (hàm bọc ngoài).

(function () {

// ============================================================================
//  BỎ HÀNG VÀO GIỎ TRÊN TRANG POS TENDOO  —  giai đoạn 4c
//
//  ⛔ FILE NÀY KHÔNG BAO GIỜ BẤM "Thanh toán" HAY "Lưu đơn".
//     Nó dừng lại ngay khi giỏ đã đủ hàng. Việc bấm là của giai đoạn 5, ở file
//     khác, và chỉ chạy sau khi CẢ HAI cửa chặn đã qua.
//
//  VÌ SAO PHẢI ĐI QUA GIAO DIỆN CHỨ KHÔNG GỌI API
//  Quan sát thật cho thấy Tendoo KHÔNG có lời gọi "thêm vào giỏ" — giỏ hàng là
//  trạng thái nằm trong trình duyệt. Muốn có giỏ đúng thì phải thao tác như tay
//  người. Đổi lại, mọi kiểm tra của Tendoo (tồn kho, thuế, khuyến mãi) vẫn chạy
//  nguyên vẹn — đó là điều mình MUỐN với thứ sẽ thành hóa đơn có giá trị pháp lý.
//
//  BA CÁI KHÓ CỦA GIAO DIỆN NÀY, VÀ CÁCH XỬ
//
//  1. GÕ TÌM KIẾM **KHÔNG** LỌC LƯỚI — nó mở một BẢNG GỢI Ý nổi lên trên.
//     Quan sát thật 2026-08-11: gõ xong, lưới vẫn nguyên 50 thẻ, món cần tìm
//     nằm trong `div.ant-select-item-option` của bảng gợi ý. Trước đây code đi
//     đọc thẻ trong lưới -> báo "không tìm thấy" dù Tendoo đã tìm ra.
//     Chữ cũng khác nhau: thẻ lưới ghi "(Số lượng tồn: 19)", dòng gợi ý ghi
//     "Tồn: 19".
//
//  2. LƯỚI CHỈ HIỆN 50 TRONG 177 SẢN PHẨM.
//     Nên BẮT BUỘC phải qua bảng gợi ý, không thể chỉ dựa vào lưới.
//
//  2b. THẺ/DÒNG KHÔNG MANG MÃ SẢN PHẨM. Chỉ có tên, giá, tồn. Nên đối chiếu
//     theo TÊN + GIÁ; còn hai dòng trùng cả hai -> KHÔNG ĐOÁN, dừng lại.
//
//  3. GIỎ CÓ THỂ ĐANG CÓ HÀNG CỦA NGƯỜI KHÁC.
//     Bỏ thêm vào một giỏ đang dở là ra hóa đơn sai. Bắt buộc giỏ phải TRỐNG
//     trước khi bắt đầu; không trống thì dừng, để người dùng tự quyết.
// ============================================================================

const MA = {
    OK: 'OK',
    GIO_KHONG_TRONG: 'GIO_KHONG_TRONG',
    KHONG_TIM_THAY_HANG: 'KHONG_TIM_THAY_HANG',
    GO_KHONG_VAO_O_TIM: 'GO_KHONG_VAO_O_TIM',
    GOI_Y_KHONG_KHOP_CHU_GO: 'GOI_Y_KHONG_KHOP_CHU_GO',
    KHONG_PHAN_BIET_DUOC: 'KHONG_PHAN_BIET_DUOC',
    KHONG_DAT_DUOC_SO_LUONG: 'KHONG_DAT_DUOC_SO_LUONG',
    KHONG_VAO_GIO: 'KHONG_VAO_GIO',
    GIO_LECH_TUNG_MON: 'GIO_LECH_TUNG_MON',
    KHONG_DOC_DUOC_TONG: 'KHONG_DOC_DUOC_TONG',
    TONG_KHONG_KHOP: 'TONG_KHONG_KHOP',
};

const CHU_THANH_TOAN = /thanh toán/i;
const CHU_LUU_DON = /lưu đơn/i;

function boDo() {
    const D = (typeof globalThis !== 'undefined' && globalThis.HDT_DomReact) || null;
    if (!D) throw new Error('Thiếu HDT_DomReact — kiểm tra thứ tự nạp script');
    return D;
}

// ── ĐỌC GIÁ VÀ TỒN TỪ ĐÚNG Ô CỦA NÓ ────────────────────────────────────────
//
// ⚠️ VÌ SAO PHẢI CÓ. Cách cũ gom cả dòng thành MỘT chuỗi rồi bắt "số tiền đầu
// tiên". Trên bảng gợi ý thật của Tendoo, giá và tồn nằm cùng một cột — giá ở
// trên, "Tồn: N" ngay dưới. Khi hai khối ấy dính liền nhau trong chuỗi:
//
//     ... SP0425  Tồn: 84  1.450.000
//                   └──┬──┘└───┬────┘   dính, không một dấu cách nào
//     -> chuỗi thành "Tồn: 841.450.000"  ->  bắt ra 841.450.000
//
// Đúng con số đã làm khách "ki?n" hỏng ngày 19/08/2026.
//
// ⚠️ VÌ SAO LÚC HỎNG LÚC KHÔNG — phần này mới đáng sợ. docChu() đọc innerText
// trước: trình duyệt tự chèn xuống dòng giữa các khối nên bình thường ra
// "Tồn: 84 1.450.000", có dấu cách, đọc đúng. Nhưng khi bảng gợi ý ĐANG ĐÓNG
// LẠI thì innerText trả rỗng và máy lùi về textContent — thứ KHÔNG chèn dấu
// cách nào. Đúng lúc đó thì dính. Nên đây là lỗi MAY RỦI VỀ THỜI ĐIỂM, không
// phải lỗi cố định: cùng một đoạn mã, hôm qua hỏng hôm nay chạy. Vá quanh nó
// là vá vào may rủi — nó sẽ quay lại.
//
// Cách chữa: giá nằm trong một phần tử RIÊNG, chữ của nó chỉ là "1.450.000",
// không dính gì cả. Đọc từ đó thì KHÔNG lệ thuộc innerText hay textContent,
// không lệ thuộc thứ tự Tendoo sắp xếp, không lệ thuộc bảng đang mở hay đóng.
//
// Không tìm được ô riêng thì LÙI VỀ CÁCH CŨ, nên không phá cảnh nào đang chạy.

/** Số tiền đứng MỘT MÌNH trong ô: "1.450.000", "1,450,000", "1.450.000 đ". */
const MAU_TIEN_RIENG = /^-?\d{1,3}(?:[.,]\d{3})+\s*(?:đ|vnd)?$/i;

/** Tồn kho đứng một mình: "Tồn: 20", "(Số lượng tồn: 6)", "Còn: 9". */
const MAU_TON_RIENG = /^\(?\s*(?:t[ồo]n|s[ốo]\s*l[ưu][ợo]ng\s*t[ồo]n|c[òo]n)\s*:\s*(\d+)\s*\)?$/i;

/**
 * Chữ của phần tử ĐẦU TIÊN trong khối mà TOÀN BỘ chữ của nó khớp mẫu.
 *
 * ⚠️ SỨC MẠNH NẰM Ở HAI ĐẦU NEO ^…$ CỦA MẪU, không nằm ở việc chọn phần tử
 * nào. Đòi khớp TRỌN VẸN nghĩa là chỉ nhận ô nào chứa MỖI con số ấy và không
 * gì khác — nên chữ của ô bên cạnh có dính vào cũng không lọt được.
 *
 * ⚠️ ĐÃ THỬ hẹp hơn: "chỉ xét phần tử lá (không có con)". Gài lỗi bỏ điều kiện
 * ấy đi thì KHÔNG bài test nào đỏ — nó không gánh gì cả. Tệ hơn, nó GÂY HẠI:
 * Tendoo viết giá thành <span>1.450.000<sup>đ</sup></span> thì cái span có con,
 * bị loại, và máy mất luôn giá. Nên bỏ.
 *
 * Duyệt theo thứ tự tài liệu: khối cha đứng trước con. Cha nào khớp trọn vẹn
 * thì chữ của nó cũng chính là chữ của con, nên lấy cha hay con đều ra một số.
 */
function chuCuaLaKhop(khoi, mau) {
    if (!khoi || !khoi.querySelectorAll) return null;
    const D = boDo();
    for (const e of [khoi, ...khoi.querySelectorAll('*')]) {
        const t = D.gonChu(e);
        if (t && mau.test(t)) return t;
    }
    return null;
}

/** Giá đọc từ ĐÚNG ô giá. Không thấy ô riêng -> null để người gọi lùi về cũ. */
function docGiaTuLa(khoi) {
    const D = boDo();
    const t = chuCuaLaKhop(khoi, MAU_TIEN_RIENG);
    return t == null ? null : D.docSoTien(t);
}

/** Tồn kho đọc từ ĐÚNG ô tồn. Không thấy -> null để người gọi lùi về cũ. */
function docTonTuLa(khoi) {
    const t = chuCuaLaKhop(khoi, MAU_TON_RIENG);
    if (t == null) return null;
    const m = MAU_TON_RIENG.exec(t);
    return m ? Number(m[1]) : null;
}

/** Mọi thẻ hàng đang hiện trên lưới, kèm tên/giá/tồn đọc được. */
function docCacTheHang(tailieu) {
    const D = boDo();
    const oTon = [...tailieu.querySelectorAll('*')]
        .filter(e => !e.children.length && /Số lượng tồn/i.test(e.textContent || ''));

    const the = [];
    for (const o of oTon) {
        // TÊN nằm ở phần tử NGAY TRƯỚC dòng "(Số lượng tồn: …)" trong dải dưới
        // của thẻ. Phải đọc theo CẤU TRÚC chứ không cắt chuỗi: gom cả thẻ rồi
        // cắt sẽ dính cả chữ viết tắt ("ÁKDDDN") lẫn giá vào tên.
        const anhTruoc = o.previousElementSibling;
        const ten = anhTruoc ? D.gonChu(anhTruoc) : '';

        // Đi lên tới phần tử bao trọn cả thẻ (chứa cả giá ở góc phải trên).
        let e = o, buoc = 0;
        while (e && buoc < 8) {
            if (/\d{1,3}([.,]\d{3})+/.test(D.gonChu(e)) && D.gonChu(e).includes('Số lượng tồn')) break;
            e = e.parentElement; buoc++;
        }
        if (!e || the.some(t => t.el === e)) continue;

        const chu = D.gonChu(e);
        const mTon = chu.match(/Số lượng tồn:\s*(\d+)/i);
        // Giá: số tiền đầu tiên trên thẻ. Mẫu \d{1,3}([.,]\d{3})+ đòi ít nhất
        // một nhóm ba chữ số nên không nhầm với thứ như "7cm" trong tên hàng.
        // ⚠️ Chỉ dùng làm ĐƯỜNG LÙI. Ưu tiên đọc từ đúng ô — xem chuCuaLaKhop().
        const mGia = chu.match(/\d{1,3}([.,]\d{3})+/);
        const giaLa = docGiaTuLa(e);
        const tonLa = docTonTuLa(e);
        the.push({
            el: e,
            // ⚠️ PHẢI TRẢ CẢ KHỐI CHỮ. Không có nó thì coGiaTrongChu() nhận
            // undefined và phép đối chiếu giá KHÔNG BAO GIỜ chạy trên thẻ hàng
            // — chỉ chạy trên bảng gợi ý. Đã dính đúng vậy lúc viết bản vá:
            // gây lỗi ngược lại thì lọt lưới, vì nhánh ấy chưa từng chạy.
            chu,
            ten: ten.replace(/\s*\(Số lượng tồn.*$/i, '').trim(),
            gia: giaLa != null ? giaLa : (mGia ? D.docSoTien(mGia[0]) : null),
            ton: tonLa != null ? tonLa : (mTon ? Number(mTon[1]) : null),
        });
    }
    return the;
}

/**
 * Các dòng trong BẢNG GỢI Ý tìm kiếm (Ant Design Select).
 * Cấu trúc thật: div.ant-select-dropdown > … > div.ant-select-item-option
 * Chữ trong dòng: "Set Tất Trắng cổ cao chiếc SP0026 100.000 Tồn: 19"
 */
/**
 * Khối chữ này có chứa ĐÚNG số tiền `gia` không.
 *
 * ⚠️ ĐỐI CHIẾU, KHÔNG BÓC TÁCH. Cách cũ bóc "số tiền đầu tiên" ra khỏi cả khối
 * chữ rồi so bằng nhau. Ngày 19/08/2026 hỏng thật: số tồn kho đứng sát ngay
 * trước giá nên mẫu số tiền nuốt luôn cả hai —
 *     "84" + "1.450.000"  ->  841.450.000
 * Máy báo "không khớp giá cần" trong khi mặt hàng nằm ngay đó.
 *
 * ✅ Từ 19/08/2026 đây là LỚP CHẮN SAU, không còn là tuyến đầu: docGiaTuLa()
 * đọc giá từ đúng ô của nó nên chuỗi dính hầu như không còn hình thành. Hàm
 * này vẫn cần cho những cảnh không tách được ô riêng và phải lùi về cách cũ.
 *
 * Mình ĐÃ BIẾT giá cần là bao nhiêu (từ API, qua bộ lập kế hoạch), nên không
 * cần đoán: chỉ cần kiểm khối chữ CÓ CHỨA đúng con số ấy. Đúng bất kể Tendoo
 * sắp xếp lại thứ tự hay thêm số gì vào thẻ.
 *
 * ⚠️ CHẶN HAI ĐẦU — đây mới là phần quan trọng. Không chặn thì "1.450.000"
 * khớp nhầm bên trong "841.450.000", tức là nới lỏng chốt chặn chứ không phải
 * sửa lỗi:
 *   · trước: không được là chữ số, dấu chấm hay dấu phẩy
 *   · sau  : không được còn chữ số nào nối tiếp
 *
 * Nhận cả hai lối viết Tendoo dùng: "1.450.000" và "1,450,000".
 */
function coGiaTrongChu(chu, gia) {
    const so = Math.round(Number(gia));
    if (!Number.isFinite(so) || so <= 0 || !chu) return false;
    const nhom = String(so).replace(/\B(?=(\d{3})+(?!\d))/g, '#');
    for (const dau of ['\\.', ',']) {
        const mau = nhom.split('#').join(dau);
        if (new RegExp('(?<![\\d.,])' + mau + '(?![\\d.,]*\\d)').test(String(chu))) return true;
    }
    return false;
}

/**
 * Khối chữ này có chứa ĐÚNG mã hàng `ma` không.
 *
 * ⚠️ VÌ SAO CẦN. Máy vốn khớp mặt hàng bằng TÊN — mà tên thì nó phải TỰ CẮT ra
 * từ chữ trên màn hình (lấy phần đứng trước mã hàng, rồi gỡ đơn vị ở đuôi).
 * Phép cắt ấy phụ thuộc mã hàng đúng mẫu "SP + số" và đơn vị nằm trong một
 * danh sách sáu từ. Lệch một chút là tên sai, và máy báo "không có mặt hàng
 * nào tên đó" trong khi mặt hàng nằm ngay trước mặt.
 *
 * Trong khi đó máy ĐÃ CÓ SẴN mã hàng chính xác từ API Tendoo (product_code),
 * mang theo suốt từ lúc lập kế hoạch — mà không dùng. Mã là ĐỊNH DANH, tên thì
 * không: hai mặt hàng trùng tên là chuyện thường, trùng mã thì không.
 *
 * ⚠️ CHẶN HAI ĐẦU. Không chặn thì "SP008" khớp nhầm vào "SP0089" — đó là nới
 * lỏng chốt chặn chứ không phải sửa lỗi. Ký tự liền trước và liền sau đều
 * không được là chữ hay số.
 */
function coMaTrongChu(chu, ma) {
    const m = String(ma == null ? '' : ma).trim();
    if (!m || !chu) return false;
    const thoat = m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(?<![\\p{L}\\p{N}])' + thoat + '(?![\\p{L}\\p{N}])', 'u')
        .test(String(chu));
}

/**
 * Khối này có Ô NÀO chứa ĐÚNG mã hàng `ma` và không gì khác không.
 *
 * ⚠️ VÌ SAO CẦN CẢ HÀM NÀY chứ không chỉ coMaTrongChu(). Đối chiếu trên khối
 * chữ gộp phải chặn hai đầu để "SP002" khỏi khớp nhầm vào "SP0020". Nhưng khi
 * chữ các ô DÍNH LIỀN nhau — cảnh đã biết rõ, xem chú thích docGiaTuLa() ở
 * đầu tệp — thì chuỗi thành "…nữCặpSP0020990.000…", ký tự trước mã là chữ và
 * sau mã là số, nên chặn hai đầu KHÔNG CHO QUA cả mã đúng.
 *
 * Đọc từ ĐÚNG Ô của mã thì không dính được với gì cả, và so BẰNG NHAU TUYỆT
 * ĐỐI thì cũng không có chuyện khớp một phần. Chặt hơn, mà lại đúng nhiều
 * cảnh hơn.
 */
function coOMaRieng(khoi, ma) {
    const m = String(ma == null ? '' : ma).trim();
    if (!m || !khoi || !khoi.querySelectorAll) return false;
    const D = boDo();
    for (const e of [khoi, ...khoi.querySelectorAll('*')]) {
        if (D.gonChu(e) === m) return true;
    }
    return false;
}

function docCacDongGoiY(tailieu) {
    const D = boDo();
    return [...tailieu.querySelectorAll('.ant-select-item-option')].map(el => {
        const chu = D.gonChu(el);
        const mTon = chu.match(/Tồn:\s*(\d+)/i);
        // ⚠️ Hai mẫu dưới chỉ là ĐƯỜNG LÙI khi không tách được ô riêng. Chúng
        // đọc trên cả khối chữ nên có thể nuốt phải số tồn đứng sát giá.
        const mGia = chu.match(/\d{1,3}([.,]\d{3})+/);
        const giaLa = docGiaTuLa(el);
        const tonLa = docTonTuLa(el);

        // ⚠️ Cắt tên phải chịu được CẢ HAI kiểu:
        //   trang thật (innerText):  "Set Tất Trắng cổ cao chiếc SP0026 100.000 Tồn: 19"
        //   nơi không có innerText:  "Set Tất Trắng cổ caochiếcSP0026 100.000Tồn: 19"
        // Nên KHÔNG đòi khoảng trắng quanh mã SP, và gỡ đuôi đơn vị kể cả khi
        // nó dính liền vào tên.
        let ten = chu;
        const mMa = chu.match(/SP\d+/i);
        if (mMa) ten = chu.slice(0, chu.indexOf(mMa[0]));
        else if (mGia) ten = chu.slice(0, chu.indexOf(mGia[0]));
        ten = ten.trim().replace(/\s*(chiếc|cái|bộ|hộp|đôi|kg|gói)$/i, '').trim();
        return {
            el, chu, ten,
            ma: mMa ? mMa[1] : '',
            gia: giaLa != null ? giaLa : (mGia ? D.docSoTien(mGia[0]) : null),
            ton: tonLa != null ? tonLa : (mTon ? Number(mTon[1]) : null),
        };
    });
}

/**
 * Ô tìm kiếm SẢN PHẨM.
 *
 * ⚠️ Trang POS có HAI ô tìm kiếm nhìn rất giống nhau:
 *      - ô tìm SẢN PHẨM   : placeholder TRỐNG, nằm góc trái trên
 *      - ô tìm KHÁCH HÀNG : placeholder "Tìm tên, SĐT, mã số thuế (ALT+C…)"
 *   Gõ tên hàng vào ô khách hàng thì lưới không lọc gì cả, mà lại đang chọn
 *   nhầm khách cho đơn. Nên phải LOẠI ô khách hàng ra trước, và nếu không chắc
 *   chắn thì THÀ KHÔNG GÕ GÌ còn hơn gõ nhầm chỗ.
 */
function timOTimKiem(tailieu) {
    const laOTimKhach = (i) => /sđt|số điện thoại|mã số thuế|khách/i.test(i.placeholder || '');
    const ungVien = [...tailieu.querySelectorAll('input')]
        .filter(i => i.type === 'search' || /search/i.test(String(i.className || '')))
        .filter(i => !laOTimKhach(i));
    return ungVien[0] || null;
}

/** Các dòng đang có trong giỏ. */
const NhipDo = (typeof module !== 'undefined' && module.exports)
    ? require('../chung/nhipDo') : globalThis.HDT_NhipDo;

const CO_TIEN = /\d{1,3}([.,]\d{3})+/;

/**
 * Nhìn cho tới khi `dieuKien()` đúng, hoặc hết hạn.
 *
 * ⚠️ Thay cho kiểu `await nghi(400)` rải khắp file này. Chờ cứng sai cả hai đầu:
 * chậm khi trang nhanh (99% trường hợp), và hụt khi trang chậm — lúc đó máy
 * kết luận "không thấy hàng trong giỏ" trong khi hàng sắp hiện tới nơi.
 */
async function nhinToiKhi(dieuKien, { nghi, hanMs, nhipMs }) {
    for (let da = 0; da <= hanMs; da += nhipMs) {
        const kq = dieuKien();
        if (kq) return kq;
        if (da + nhipMs > hanMs) break;
        await nghi(nhipMs);
    }
    return null;
}
// Có chữ thật (tên món), không phải chỉ toàn số và dấu. Dùng để phân biệt khối
// "chỉ có giá tiền" với khối "cả dòng giỏ, có tên món".
const CO_CHU = /[^\d.,\s×xX+\-]{2,}/;
const TOI_DA_TANG = 12;              // đủ sâu cho mọi cấu trúc đã gặp

/** Ô này có phải ô SỐ LƯỢNG của một dòng giỏ không. */
function laOSoLuong(i) {
    if (i.closest && i.closest('.ant-modal, [role=dialog], .ant-drawer')) return false;
    return /^\d+$/.test(String(i.value)) && i.type !== 'checkbox';
}

/**
 * Từ ô số lượng, đi ngược lên tìm ĐÚNG khối của dòng giỏ đó.
 *
 * ⚠️ TUYỆT ĐỐI KHÔNG ĐẾM TẦNG CỨNG. Bản cũ đi lên đúng 5 tầng rồi dừng, và trên
 * trang THẬT dòng giỏ nằm ở tầng 6 — lệch đúng một tầng:
 *
 *   A  <div class="flex flex-col gap-2 lg:flex-row flex-1">   ← dòng giỏ THẬT
 *   B    <div class="flex-shrink-0">                          ← bản cũ dừng ở đây
 *   C      <div class="flex flex-col items-center gap-1">
 *   D        <div class="">
 *   E          <div class="flex flex-col w-full !w-[140px]">
 *   F            <div>  [−] [input value="1"] [+]
 *
 * Khối B chỉ chứa cụm tăng/giảm, chữ RỖNG và KHÔNG có nút xóa. Hậu quả: không
 * dọn được giỏ, không nhận ra giỏ của chính mình (dấu giỏ so theo tên món trong
 * `chu`), và không đặt được số lượng > 1. Một lỗi lệch tầng, ba tính năng hỏng.
 *
 * Nay dừng theo DẤU HIỆU chứ không theo số tầng: khối nào chứa nút xóa của dòng
 * thì đó chính là dòng. Thêm hai chốt an toàn:
 *   · ôm quá 1 ô số lượng  -> đã đi quá, lùi lại (không gộp nhiều dòng làm một)
 *   · không thấy nút xóa   -> lấy khối gần nhất có chứa số tiền
 */
function timKhoiDong(o) {
    const D = boDo();
    let duPhongXoa = null;          // khối đầu tiên có nút xóa
    let duPhongTien = null;         // khối đầu tiên có số tiền
    let khoi = o.parentElement;

    for (let i = 0; khoi && i < TOI_DA_TANG; i++, khoi = khoi.parentElement) {
        // Ôm quá một ô số lượng nghĩa là đã trèo sang khối chứa NHIỀU dòng.
        // Đi tiếp là gộp hai dòng làm một, tên món của dòng này lẫn sang dòng kia.
        if ([...khoi.querySelectorAll('input')].filter(laOSoLuong).length > 1) break;

        const chu = D.gonChu(khoi);
        const coXoa = !!timNutXoaDong(khoi);
        if (coXoa && !duPhongXoa) duPhongXoa = khoi;
        if (CO_TIEN.test(chu) && !duPhongTien) duPhongTien = khoi;

        // ĐỦ BA DẤU HIỆU mới đúng là dòng giỏ: nút xóa + số tiền + TÊN MÓN.
        // Thiếu tên món thì `chu` vô dụng cho hai việc sống còn: nhận ra giỏ do
        // chính máy để lại (dấu giỏ so theo tên), và đặt số lượng > 1.
        // Trên trang thật, khối có nút xóa đầu tiên (tầng 6) chỉ có "490.000";
        // phải lên tầng 7 mới thấy "ÁPPCN Áo Polo phối cổ nữ … 490.000".
        if (coXoa && CO_TIEN.test(chu) && CO_CHU.test(chu)) return khoi;
    }
    return duPhongXoa || duPhongTien || o.parentElement || o;
}

function docCacDongGio(tailieu) {
    const D = boDo();
    // Ô nhập nằm trong bảng nổi KHÔNG PHẢI dòng giỏ. Bảng "Xác nhận thanh toán"
    // có ô "Khách đã đưa"; đếm nhầm nó là dòng giỏ thì sau khi phát hành xong,
    // giỏ đã trống mà máy vẫn tưởng còn hàng -> báo KHÔNG RÕ oan, treo lệnh oan.
    const oSo = [...tailieu.querySelectorAll('input')].filter(laOSoLuong);
    return oSo.map(o => {
        const khoi = timKhoiDong(o);
        return { oSoLuong: o, khoi, chu: D.gonChu(khoi), soLuong: Number(o.value) };
    });
}

/** Tổng thanh toán mà CHÍNH Tendoo hiện lên. Không đọc được thì null. */
function docTongGio(tailieu) {
    const D = boDo();
    const cac = [...tailieu.querySelectorAll('*')]
        .filter(e => /Tổng thanh toán/i.test(e.textContent || ''))
        .sort((a, b) => (a.children.length - b.children.length));
    for (const e of cac) {
        const chu = D.gonChu(e);
        const m = chu.match(/Tổng thanh toán[^\d]*([\d.,]+)/i);
        if (m) {
            const so = D.docSoTien(m[1]);
            if (so != null) return so;
        }
    }
    return null;
}

/**
 * Tổng thanh toán, CÓ CHỜ và CÓ HIỂU chuyện giỏ trống.
 *
 * ⚠️ Đo trang THẬT ngày 2026-08-12: giỏ trống thì Tendoo KHÔNG vẽ chân giỏ —
 * không có chữ "Tổng thanh toán", cũng chẳng có nút "Thanh toán (F1)". Bỏ một
 * món vào thì cả hai mới hiện ra. Vậy đọc tổng lúc giỏ trống mà ra null là
 * ĐÚNG SỰ THẬT, không phải trang hỏng — và giỏ trống thì tổng đúng bằng 0.
 *
 * Đây chính là lỗi đã bắt cả loạt dừng ngày 2026-08-12: máy đọc tổng TRƯỚC khi
 * bỏ món đầu tiên, nhận null, rồi kết luận "không đọc được Tổng thanh toán".
 *
 * Còn giỏ ĐANG CÓ HÀNG mà chưa đọc được tổng thì thường chỉ là React vẽ chưa
 * kịp -> chờ, đừng vội kết luận.
 */
async function docTongGioChoKip(tailieu, { nghi, hanMs, nhipMs }) {
    for (let da = 0; ; da += nhipMs) {
        const t = docTongGio(tailieu);
        if (t != null) return t;
        if (gioDangTrong(tailieu)) return 0;
        if (da + nhipMs > hanMs) return null;
        await nghi(nhipMs);
    }
}

const gioDangTrong = (tailieu) => docCacDongGio(tailieu).length === 0;

// ⚠️ HAI NÚT − VÀ + CỦA DÒNG GIỎ KHÔNG CÓ CHỮ, KHÔNG CÓ LỚP RIÊNG.
// Chỉ khác nhau ở HÌNH VẼ bên trong, và ở VỊ TRÍ so với ô nhập: [−] [ô] [+].
// Đường vẽ chép từ test/mau/gioHangThat.html (bản chụp thật).
const DUONG_TRU = 'M19 13H5v-2h14v2z';
const DUONG_CONG = 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z';

/**
 * Nút "+" của một dòng giỏ.
 *
 * Nhận theo HÌNH VẼ trước, vì đó là thứ chắc nhất. Không đọc được hình thì lấy
 * nút NGAY SAU ô nhập — trang thật xếp [−] [ô] [+] nên nút sau ô là dấu cộng.
 * Tuyệt đối không lấy "nút cuối cùng trong dòng": nút cuối là nút XÓA.
 */
function timNutCong(oSoLuong) {
    if (!oSoLuong) return null;
    const cha = oSoLuong.parentElement;
    if (cha) {
        const theoHinh = [...cha.querySelectorAll('button')]
            .find(b => b.querySelector(`path[d="${DUONG_CONG}"]`));
        if (theoHinh) return theoHinh;
    }
    let e = oSoLuong.nextElementSibling;
    while (e) {
        if (e.tagName === 'BUTTON') return e;
        const b = e.querySelector && e.querySelector('button');
        if (b) return b;
        e = e.nextElementSibling;
    }
    return null;
}

/** Dòng giỏ của món này, nếu đã có. */
const timDongCua = (tailieu, ten) =>
    docCacDongGio(tailieu).find(d => d.chu.includes(ten)) || null;

const tienChu = (n) => Number(n).toLocaleString('vi-VN');

/**
 * Kể lại giỏ đang có gì, để thông báo lỗi nói được MÁY THẤY GÌ.
 *
 * Đã hai lần liên tiếp phải đoán mò vì thông báo chỉ có hai con số trống
 * không. Có dòng này thì lần sau nhìn phát là biết.
 */
function gonBot(chu) {
    const s = String(chu || '').replace(/\s+/g, ' ').trim();
    return s.length > 70 ? s.slice(0, 70) + '…' : s;
}

function keLaiGio(tailieu) {
    const cac = docCacDongGio(tailieu);
    const tong = docTongGio(tailieu);
    const ke = cac.map(d => `"${gonBot(d.chu)}" ×${d.soLuong}`).join('; ');
    return `Giỏ đang có ${cac.length} dòng${ke ? ': ' + ke : ''}. `
        + `Tổng: ${tong == null ? 'không đọc được' : tienChu(tong) + 'đ'}.`;
}

/**
 * Bỏ danh sách hàng đã chọn vào giỏ.
 *
 * @param {Document} tailieu
 * @param {Array<{id:string, ten:string, gia:number, soLuong:number}>} danhSach
 * @param {{nghi?:Function, doiVeLuoi?:number}} [tuyChon]
 * @returns {Promise<{ok:boolean, ma:string, thongBao?:string, tongTendoo?:number}>}
 */
async function boVaoGio(tailieu, danhSach, tuyChon = {}) {
    const D = boDo();
    const nghi = tuyChon.nghi || (ms => new Promise(r => setTimeout(r, ms)));

    // ── Chốt 1: giỏ phải TRỐNG ──────────────────────────────────────────────
    if (!gioDangTrong(tailieu)) {
        // Nói rõ CÓ MẤY MÓN và NÚT XÓA Ở ĐÂU. Người dùng đang đứng ở tab Sell,
        // còn nút xóa nằm ở tab Tendoo — không chỉ đường thì họ ngồi đoán.
        const soDong = docCacDongGio(tailieu).length;
        const tong = docTongGio(tailieu);
        return {
            ok: false, ma: MA.GIO_KHONG_TRONG,
            soDongGio: soDong,
            thongBao: `Giỏ hàng trên tab Tendoo đang có sẵn ${soDong} món`
                + (tong ? ` (${Number(tong).toLocaleString('vi-VN')}đ)` : '')
                + '. Sang tab Tendoo, bấm nút "Xóa sạch giỏ" trên bảng nổi góc dưới bên phải, '
                + 'rồi chạy lại. Bỏ thêm vào giỏ đang dở sẽ ra hóa đơn sai.',
        };
    }

    // ⚠️ CHỜ TRANG VẼ XONG rồi mới đọc. Máy vào đây ngay sau khi tải lại tab
    // (bước đổi tài khoản bắt buộc phải tải lại), nên rất dễ đọc lúc React chưa
    // vẽ gì: ô tìm kiếm chưa có, lưới hàng còn rỗng -> báo "không tìm thấy mặt
    // hàng" oan. Chờ ở đây không tốn gì khi trang đã sẵn: thấy là đi ngay.
    const nhipDauTien = tuyChon.nhipNhin || NhipDo.NHIN_DOM;
    const hanDauTien = tuyChon.doiVeLuoi == null ? NhipDo.HAN_CHO_BANG : tuyChon.doiVeLuoi;
    await nhinToiKhi(() => timOTimKiem(tailieu) || docCacTheHang(tailieu).length,
                     { nghi, hanMs: hanDauTien, nhipMs: nhipDauTien });
    const oTim = timOTimKiem(tailieu);

    for (const mon of danhSach) {
        // ── Tìm đúng món ────────────────────────────────────────────────────
        const nhipNhin = tuyChon.nhipNhin || NhipDo.NHIN_DOM;
        const hanNhin = tuyChon.doiVeLuoi == null ? NhipDo.HAN_CHO_DONG_GIO : tuyChon.doiVeLuoi;
        // ── GÕ TÌM KIẾM, RỒI ĐỌC LẤY KẾT QUẢ CỦA CHÍNH MÌNH ─────────────────
        //
        // ⚠️ CA HỎNG THẬT 20/08/2026, khách "ti?n", tờ thứ 5/6. Máy báo «Máy
        // thấy 1 mặt hàng nhưng không mặt hàng nào tên "Giày vải thấp cổ
        // unisex"» — trong khi mặt hàng ấy nằm ngay đó, mã SP0089, giá đúng
        // 1.000.000, tồn 12, đơn vị "chiếc". Chủ dự án chụp màn hình chứng minh.
        //
        // Lưới có hai chục thẻ, mà máy chỉ "thấy 1 mặt hàng" -> nó đang đọc
        // BẢNG GỢI Ý CÒN SÓT của lần tìm TRƯỚC, chưa kịp đổi theo chữ vừa gõ.
        //
        // ⚠️ BẢN CŨ VỨT BỎ HAI TÍN HIỆU DO CHÍNH NÓ TẠO RA:
        //   · dienChacChan trả true/false — nó sinh ra CHÍNH VÌ React hay nuốt
        //     chữ gõ vào, và chỗ khác trong dự án CÓ kiểm (ô "Khách đã đưa":
        //     gõ không vào thì dừng). Riêng ô tìm kiếm thì bỏ qua.
        //   · nhinToiKhi trả về "tên cần đã hiện ra chưa" — cũng bỏ qua.
        // Vứt cả hai thì máy đọc thứ còn sót trên màn hình rồi ĐỔ LỖI CHO MẶT
        // HÀNG, trong khi thứ nó cầm còn chưa phải kết quả của câu nó vừa hỏi.
        //
        // ⚠️ VÌ SAO GÕ LẠI Ở ĐÂY LÀ AN TOÀN — và vì sao nó khác mọi chỗ khác:
        // gõ vào ô tìm kiếm KHÔNG bấm gì, KHÔNG bỏ gì vào giỏ, KHÔNG phát hành
        // gì. Không có cách nào sinh ra hóa đơn trùng. Vẫn có trần cứng MỘT
        // lần, không vòng lặp.
        let goDuoc = true;
        let thayTen = false;
        if (oTim) {
            for (let lan = 0; lan < 2; lan++) {
                goDuoc = await D.dienChacChan(oTim, mon.ten, { nghi });
                if (!goDuoc) continue;                   // chữ chưa vào ô -> gõ lại
                thayTen = !!(await nhinToiKhi(
                    () => docCacDongGoiY(tailieu).some(t => t.ten === mon.ten),
                    { nghi, hanMs: hanNhin, nhipMs: nhipNhin }));
                if (thayTen) break;
            }

            if (!goDuoc) {
                return {
                    ok: false, ma: MA.GO_KHONG_VAO_O_TIM,
                    thongBao: `Gõ "${mon.ten}" vào ô tìm kiếm của Tendoo KHÔNG ĂN (đã thử `
                        + 'hai lượt). Máy dừng để khỏi đọc nhầm danh sách còn sót của lần tìm '
                        + 'trước. CHƯA phát hành hóa đơn nào.',
                };
            }

            // ⚠️ CHỐT QUYẾT ĐỊNH: ô tìm kiếm ĐANG CHỨA GÌ ngay lúc này. Chữ
            // trong ô không phải chữ mình vừa gõ thì danh sách gợi ý kia KHÔNG
            // PHẢI CỦA MÌNH — và mọi kết luận về mặt hàng rút ra từ nó đều vô
            // giá trị. Thà dừng còn hơn đổ oan cho một mặt hàng đang có sẵn.
            if (String(oTim.value) !== String(mon.ten)) {
                return {
                    ok: false, ma: MA.GOI_Y_KHONG_KHOP_CHU_GO,
                    thongBao: `Ô tìm kiếm đang chứa "${String(oTim.value)}" chứ không phải `
                        + `"${mon.ten}" — danh sách gợi ý trên màn hình không phải kết quả `
                        + 'của thứ máy vừa gõ, nên máy KHÔNG kết luận gì về mặt hàng. '
                        + 'CHƯA phát hành hóa đơn nào.',
                };
            }
        }

        // Ưu tiên BẢNG GỢI Ý (thứ Tendoo thật sự hiện ra khi gõ tìm kiếm).
        // Không có gợi ý mới lùi về đọc thẻ trong lưới — trường hợp không gõ
        // được vào ô tìm kiếm.
        const cacGoiY = docCacDongGoiY(tailieu);
        const nguon = cacGoiY.length ? cacGoiY : docCacTheHang(tailieu);
        // ƯU TIÊN MÃ HÀNG — định danh thật, không phải cái tên tự cắt ra.
        // Không có mã (hàng cũ, API thiếu) hoặc không dòng nào chứa mã thì mới
        // lùi về so tên như trước. KHÔNG nới chốt nào: khớp mã xong vẫn phải
        // qua đúng phép kiểm giá bên dưới.
        const hopMa = String(mon.ma || '').trim()
            ? nguon.filter(t => coOMaRieng(t.el, mon.ma) || coMaTrongChu(t.chu, mon.ma)) : [];
        const hopTen = hopMa.length ? hopMa : nguon.filter(t => t.ten && t.ten === mon.ten);
        // Vẫn ưu tiên khớp số đã bóc được; không khớp thì ĐỐI CHIẾU thẳng vào
        // khối chữ. Xem coGiaTrongChu() để biết vì sao — và vì sao nó KHÔNG
        // phải là nới lỏng chốt chặn.
        const hop = hopTen.filter(t => mon.gia == null
            || t.gia === mon.gia
            || coGiaTrongChu(t.chu, mon.gia));

        if (hop.length === 0) {
            // ⚠️ NÓI RA MÁY ĐANG THẤY GÌ. Câu "không tìm thấy X" trơ trọi không
            // phân biệt được ba chuyện khác hẳn nhau: hết hàng, đổi giá, hay
            // Tendoo đổi giao diện nên máy đọc không ra thẻ nào cả.
            //
            // Ngày 19/08/2026 gặp thật đúng lúc Tendoo đổi giao diện bán hàng:
            // lời nhắc không đủ để biết nên sửa gì, phải đi lục mã mới đoán ra.
            const dangThay = nguon.length;
            const cungTen = hopTen.map(t => Number(t.gia).toLocaleString('vi-VN') + 'đ');
            // ⚠️ KỂ RA TÊN MÁY ĐANG THẤY. Thiếu dòng này thì đọc log xong vẫn
            // không biết máy nhìn nhầm vào đâu — đã mất trọn một ngày vì đúng
            // chỗ thiếu này, hai lần trước cũng vậy (tên nút trên bảng lạ, màn
            // hình lúc treo). Đây là lần thứ ba.
            const tenDangThay = nguon.map(t => `"${t.ten}"`).slice(0, 5).join(', ')
                + (nguon.length > 5 ? ` …và ${nguon.length - 5} nữa` : '');
            const keRa = dangThay === 0
                ? 'Máy KHÔNG đọc được mặt hàng nào trên màn hình — nhiều khả năng Tendoo đã '
                  + 'đổi giao diện bán hàng, hoặc trang chưa vẽ xong.'
                : cungTen.length
                    ? `Máy thấy ${dangThay} mặt hàng, trong đó có "${mon.ten}" nhưng giá là `
                      + `${cungTen.join(' / ')} — không khớp giá cần.`
                    : `Máy thấy ${dangThay} mặt hàng nhưng không cái nào là "${mon.ten}"`
                      + (String(mon.ma || '').trim() ? ` (mã ${mon.ma})` : '')
                      + `. Máy đang thấy: ${tenDangThay}.`;
            return {
                ok: false, ma: MA.KHONG_TIM_THAY_HANG,
                soThayTrenMan: dangThay,
                thongBao: `Không tìm thấy "${mon.ten}" giá ${Number(mon.gia).toLocaleString('vi-VN')}đ `
                    + `trên màn hình Tendoo. ${keRa} Đã dừng, CHƯA phát hành hóa đơn nào.`,
            };
        }
        if (hop.length > 1) {
            // Hai thẻ trùng CẢ tên lẫn giá -> không có cách nào phân biệt trên
            // giao diện. Đoán bừa = hóa đơn ghi nhầm mặt hàng. Dừng.
            return {
                ok: false, ma: MA.KHONG_PHAN_BIET_DUOC,
                thongBao: `Có ${hop.length} mặt hàng trùng cả tên lẫn giá ("${mon.ten}") — `
                    + 'không phân biệt được trên màn hình, đã dừng để khỏi chọn nhầm.',
            };
        }

        const the = hop[0];
        if (the.ton != null && mon.soLuong > the.ton) {
            return {
                ok: false, ma: MA.KHONG_DAT_DUOC_SO_LUONG,
                thongBao: `"${mon.ten}" chỉ còn ${the.ton} nhưng cần ${mon.soLuong}`,
            };
        }

        // ── BẤM RỒI XÁC MINH BẰNG CHÍNH CON SỐ CỦA TENDOO ───────────────────
        //
        // ⚠️ KHÔNG xác minh bằng cách so TÊN MÓN trong giỏ nữa.
        //
        // Bản trước tìm "dòng nào có chứa tên món". Tên là thứ LẪN LỘN ĐƯỢC: lúc
        // đó bảng gợi ý tìm kiếm đang mở và đang hiện đúng tên vừa gõ, nên khối
        // chữ máy đọc có thể mang tên món trong khi giỏ chưa hề có nó. Hậu quả
        // thật ngày 2026-08-12: máy báo 'Bỏ "Áo Bomber thể thao nam" vào giỏ,
        // tổng đáng ra tăng 790.000đ nhưng thực tế tăng 0đ' — nó tưởng món đã
        // vào, nên phần thử-lại không cứu được.
        //
        // TỔNG TIỀN thì không lẫn được: đó là phép tính của chính Tendoo. Nay:
        //   ghi tổng trước → bấm → NHÌN cho tới khi tổng tăng ĐÚNG bằng giá món.
        // Cách này trị luôn cả trường hợp Tendoo vẽ dòng trước, cập nhật tổng sau.
        const tongTruoc = await docTongGioChoKip(tailieu, { nghi, hanMs: hanNhin, nhipMs: nhipNhin });
        if (tongTruoc == null) {
            return { ok: false, ma: MA.KHONG_DOC_DUOC_TONG,
                     thongBao: 'Không đọc được "Tổng thanh toán" trên trang Tendoo '
                        + `trước khi bỏ "${mon.ten}". ${keLaiGio(tailieu)} Đã dừng.` };
        }

        const canTangMotCai = Number(mon.gia);
        const daTangBaoNhieu = () => {
            const t = docTongGio(tailieu);
            return t == null ? null : t - tongTruoc;
        };

        let vaoRoi = false;
        let themDu = null;      // tổng nhảy NHIỀU HƠN một cái -> bấm lại là hỏng thêm
        for (let lan = 1; lan <= 2 && !vaoRoi; lan++) {
            if (lan > 1) {
                // React đã vẽ lại — thẻ cũ có thể đã bị thay. Tìm lại trước khi bấm.
                const lai = (docCacDongGoiY(tailieu).length
                    ? docCacDongGoiY(tailieu) : docCacTheHang(tailieu))
                    .filter(t => t.ten === mon.ten && (mon.gia == null || t.gia === mon.gia));
                if (lai.length !== 1) break;
                lai[0].el.click();
            } else {
                the.el.click();
            }
            // Chờ tới khi tổng NHÚC NHÍCH — trang thật vẽ dòng giỏ trước, tổng sau.
            await nhinToiKhi(() => { const d = daTangBaoNhieu(); return d != null && d !== 0; },
                             { nghi, hanMs: hanNhin, nhipMs: nhipNhin });
            const daTang = daTangBaoNhieu();
            if (daTang === canTangMotCai) { vaoRoi = true; break; }
            // Nhảy quá tay (một cú bấm vào hai lần) -> DỪNG NGAY, tuyệt đối không
            // bấm lại: bấm lại chỉ làm giỏ sai thêm.
            if (daTang != null && daTang > 0) { themDu = daTang; break; }
        }

        if (themDu != null) {
            const dongDu = timDongCua(tailieu, mon.ten);
            const soCai = dongDu ? dongDu.soLuong : Math.round(themDu / canTangMotCai);
            return {
                ok: false, ma: MA.KHONG_DAT_DUOC_SO_LUONG,
                thongBao: `Cần ${mon.soLuong} cái "${mon.ten}" nhưng chỉ một cú bấm mà `
                    + `giỏ đang có ${soCai} — tổng nhảy ${tienChu(themDu)}đ thay vì `
                    + `${tienChu(canTangMotCai)}đ. ${keLaiGio(tailieu)} Đã dừng để khỏi ra `
                    + 'hóa đơn sai tiền.',
            };
        }

        if (!vaoRoi) {
            const daTang = daTangBaoNhieu();
            return {
                ok: false, ma: MA.KHONG_VAO_GIO,
                thongBao: `Bấm "${mon.ten}" (${tienChu(mon.gia)}đ) hai lần nhưng tổng giỏ `
                    + (!daTang
                        ? 'KHÔNG nhúc nhích'
                        : `đổi ${tienChu(daTang)}đ thay vì ${tienChu(canTangMotCai)}đ`)
                    + `. ${keLaiGio(tailieu)} Đã dừng, CHƯA phát hành hóa đơn nào.`,
            };
        }

        // ── Đặt số lượng: BẤM NÚT "+", KHÔNG GÕ VÀO Ô ───────────────────────
        //
        // ⚠️ GÕ VÀO Ô SỐ LƯỢNG KHÔNG ĂN. Ngày 2026-08-13, chạy thật trên Tendoo:
        // máy gõ "6" vào ô, ô hiện 6, nhưng giỏ vẫn chỉ có 1 cái và tổng đứng im
        // ở đúng một đơn giá (1.400.000đ trong khi 6 cái phải là 8.400.000đ).
        // React chưa từng nhận cú gõ đó — nếu nhận thì nó đã vẽ lại dòng và tổng.
        //
        // Tệ hơn: thông báo lỗi lúc ấy đọc số lượng từ CHÍNH cái ô vừa gõ, nên
        // in ra câu vô nghĩa "Cần 6 cái nhưng giỏ chỉ nhận 6".
        //
        // Nay bấm nút "+" đúng số lần cần, và SAU MỖI CÚ BẤM kiểm tổng tăng đúng
        // một đơn giá. Không nhúc nhích thì dừng ngay — không bao giờ vượt quá.
        if (mon.soLuong > 1) {
            for (let dangCo = 1; dangCo < mon.soLuong; dangCo++) {
                // Tìm lại dòng và nút TRƯỚC MỖI CÚ BẤM: React vẽ lại giỏ sau mỗi
                // thay đổi, nút cũ đã bị gỡ khỏi trang, bấm vào nó là bấm vào hư không.
                const dong = timDongCua(tailieu, mon.ten);
                if (!dong) {
                    return { ok: false, ma: MA.KHONG_TIM_THAY_HANG,
                             thongBao: `Tổng đã tăng đúng nhưng không tìm ra dòng của "${mon.ten}" `
                                + `để đặt số lượng. ${keLaiGio(tailieu)}` };
                }
                const nutCong = timNutCong(dong.oSoLuong);
                if (!nutCong) {
                    return {
                        ok: false, ma: MA.KHONG_DAT_DUOC_SO_LUONG,
                        thongBao: `Không tìm thấy nút "+" của dòng "${mon.ten}" để tăng số `
                            + `lượng — có thể Tendoo đã đổi giao diện giỏ hàng. `
                            + `${keLaiGio(tailieu)} Đã dừng, CHƯA phát hành hóa đơn nào.`,
                    };
                }

                const canCo = canTangMotCai * (dangCo + 1);
                nutCong.click();
                await nhinToiKhi(
                    () => { const t = docTongGio(tailieu); return t != null && t - tongTruoc === canCo; },
                    { nghi, hanMs: hanNhin, nhipMs: nhipNhin });

                const t = docTongGio(tailieu);
                if (t == null || t - tongTruoc !== canCo) {
                    // Số lượng THẬT suy ra từ TỔNG — con số của chính Tendoo —
                    // chứ không đọc lại ô mình vừa động vào.
                    const daTang = t == null ? null : t - tongTruoc;
                    const thucTe = daTang == null ? '?' : Math.round(daTang / canTangMotCai);
                    return {
                        ok: false, ma: MA.KHONG_DAT_DUOC_SO_LUONG,
                        thongBao: `Cần ${mon.soLuong} cái "${mon.ten}" nhưng giỏ chỉ nhận `
                            + `${thucTe} — tổng mới tăng ${daTang == null ? 'không đọc được'
                                : tienChu(daTang) + 'đ'} thay vì `
                            + `${tienChu(canTangMotCai * mon.soLuong)}đ. Nhiều khả năng Tendoo `
                            + `chặn vì hết tồn kho. ${keLaiGio(tailieu)} Đã dừng, CHƯA phát `
                            + 'hành hóa đơn nào.',
                    };
                }
            }
        } else {
            // Tổng đã tăng đúng MỘT lần giá món, nên món chắc chắn có trong giỏ và
            // không bị thêm trùng. Chỉ còn kiểm dòng giỏ NẾU đọc được — không đọc
            // được thì thôi, đừng để chuyện đọc tên hỏng làm hỏng cả đơn đúng.
            const dongLai = timDongCua(tailieu, mon.ten);
            if (dongLai && dongLai.soLuong !== 1) {
                return {
                    ok: false, ma: MA.KHONG_DAT_DUOC_SO_LUONG,
                    thongBao: `Cần 1 cái "${mon.ten}" nhưng giỏ đang có ${dongLai.soLuong} — `
                        + `đã dừng để khỏi ra hóa đơn sai tiền. ${keLaiGio(tailieu)}`,
                };
            }
        }

        // ── TỔNG phải tăng ĐÚNG bằng tiền của món vừa bỏ ────────────────
        // Bắt được cả ba kiểu hỏng ngay tại món gây ra, thay vì để dồn tới cuối:
        // món không vào, món vào hai lần, món vào với giá khác.
        const tongSau = docTongGio(tailieu);
        if (tongTruoc != null && tongSau != null) {
            const daTang = tongSau - tongTruoc;
            const canTang = Number(mon.gia) * Number(mon.soLuong);
            if (daTang !== canTang) {
                return {
                    ok: false, ma: MA.GIO_LECH_TUNG_MON,
                    thongBao: `Bỏ "${mon.ten}" (${tienChu(mon.gia)}đ × ${mon.soLuong}) vào giỏ, `
                        + `tổng đáng ra tăng ${tienChu(canTang)}đ nhưng thực tế tăng `
                        + `${tienChu(daTang)}đ (từ ${tienChu(tongTruoc)}đ lên ${tienChu(tongSau)}đ). `
                        + keLaiGio(tailieu)
                        + ' Đã dừng ngay tại món này, CHƯA phát hành hóa đơn nào.',
                };
            }
        }
    }

    // Trả ô tìm kiếm về trạng thái sạch cho lần sau.
    if (oTim) D.datGiaTri(oTim, '');

    // ── ĐỌC TỔNG LẦN CUỐI: CHỜ ĐÚNG ĐIỀU KIỆN, KHÔNG NGỦ CỨNG ───────────────
    //
    // ⚠️ ĐÃ GÂY LỖI THẬT ngày 18/08/2026. Chỗ này từng là `ngủ 100ms rồi đọc` —
    // chỗ chờ cứng DUY NHẤT còn sót trong tệp, đúng thứ mà chung/nhipDo.js cấm
    // hẳn. Xóa ô tìm kiếm làm React đóng bảng gợi ý và vẽ lại cả khối giỏ; đọc
    // đúng khe ấy ra con số dở dang.
    //
    // Bằng chứng: máy báo "Tendoo hiện 1.250.000 nhưng mình tính 2.000.000" rồi
    // dừng — nhưng NGAY SAU ĐÓ khách kế tiếp bị chặn vì "giỏ đang có 2 món
    // (2.000.000đ)". Cùng một giỏ, hai con số. Hàng đã vào đủ, chỉ là đọc sớm.
    //
    // Nay: mình BIẾT tổng phải là bao nhiêu (cộng giá × số lượng của chính danh
    // sách vừa bỏ), nên chờ tới khi Tendoo hiện đúng con số ấy. Quá hạn mới báo
    // lỗi, và báo kèm con số đọc được để còn lần ra nguyên nhân.
    const mongDoi = danhSach.reduce(
        (t, m) => t + Number(m.gia) * Number(m.soLuong), 0);
    const hanCuoi = tuyChon.doiVeLuoi == null ? NhipDo.HAN_CHO_BANG : tuyChon.doiVeLuoi;
    await nhinToiKhi(() => docTongGio(tailieu) === mongDoi,
                     { nghi, hanMs: hanCuoi, nhipMs: nhipDauTien });

    const tong = docTongGio(tailieu);
    if (tong == null) {
        return { ok: false, ma: MA.KHONG_DOC_DUOC_TONG,
                 thongBao: 'Không đọc được "Tổng thanh toán" trên màn hình Tendoo' };
    }
    if (tong !== mongDoi) {
        return {
            ok: false, ma: MA.GIO_LECH_TUNG_MON,
            thongBao: `Bỏ xong hết hàng nhưng tổng giỏ là ${tienChu(tong)}đ trong khi phải là `
                + `${tienChu(mongDoi)}đ. ${keLaiGio(tailieu)} Đã dừng, CHƯA phát hành hóa đơn nào.`,
            tongTendoo: tong,
        };
    }
    return { ok: true, ma: MA.OK, tongTendoo: tong };
}

/**
 * Nút XÓA của một dòng giỏ. Ant Design đánh dấu nút nguy hiểm bằng lớp
 * `ant-btn-dangerous` — đó là dấu hiệu đáng tin duy nhất, vì cả 4 nút trong
 * dòng đều không có chữ.
 */
function timNutXoaDong(khoi) {
    if (!khoi) return null;
    const D = boDo();
    return [...khoi.querySelectorAll('button')].find(b => {
        const lop = String(b.className || '');
        if (!/dangerous|danger/i.test(lop)) return false;
        const chu = D.gonChu(b);
        return !CHU_THANH_TOAN.test(chu) && !CHU_LUU_DON.test(chu);
    }) || null;
}

/** Xóa sạch giỏ — dùng khi cần dọn trước lượt sau. Không bấm gì ngoài nút xóa dòng. */
async function xoaSachGio(tailieu, tuyChon = {}) {
    const nghi = tuyChon.nghi || (ms => new Promise(r => setTimeout(r, ms)));
    for (let vong = 0; vong < 60; vong++) {
        const cac = docCacDongGio(tailieu);
        if (!cac.length) return { ok: true };
        // ⚠️ Nhận nút xóa theo LỚP "dangerous", KHÔNG theo vị trí.
        // Quan sát thật: mỗi dòng giỏ có 4 nút đều KHÔNG CHỮ (− , + , ghi chú,
        // xóa). Lấy "nút cuối cùng" là kiểu ăn may — đổi thứ tự một cái là bấm
        // nhầm sang tăng số lượng, và hàm này sẽ chạy mãi không hết giỏ.
        const nut = timNutXoaDong(cac[0].khoi);
        if (!nut) {
            // Câu cũ chỉ ghi "Không thấy nút xóa dòng trong giỏ" — người dùng
            // đứng ở tab Sell, đọc xong không biết phải làm gì, và cũng không
            // biết hóa đơn đã ra hay chưa.
            return {
                ok: false,
                thongBao: `Không tìm thấy nút xóa dòng trong giỏ (giỏ đang có ${cac.length} món). `
                    + 'Giao diện Tendoo có thể vừa đổi. Hãy sang tab Tendoo tự xóa từng dòng, '
                    + 'rồi chạy lại. CHƯA phát hành hóa đơn nào.',
            };
        }
        const conLai = cac.length;
        nut.click();
        // Chờ dòng đó biến mất rồi mới xóa dòng tiếp — bấm dồn khi React chưa vẽ
        // lại là bấm vào nút của dòng đã biến mất.
        await nhinToiKhi(() => docCacDongGio(tailieu).length < conLai,
                         { nghi, hanMs: tuyChon.hanXoaDong || 2000,
                           nhipMs: tuyChon.nhipXoa || NhipDo.NHIN_XOA_DONG });
    }
    return {
        ok: false,
        thongBao: 'Bấm xóa nhiều lần mà giỏ vẫn không hết. Hãy sang tab Tendoo tự dọn giỏ '
            + 'rồi chạy lại. CHƯA phát hành hóa đơn nào.',
    };
}

const API = { coGiaTrongChu, coMaTrongChu, coOMaRieng, docGiaTuLa, docTonTuLa, boVaoGio, docTongGio, docCacTheHang, docCacDongGoiY, docCacDongGio, timKhoiDong,
              xoaSachGio, timNutXoaDong, timNutCong, gioDangTrong, timOTimKiem,
              docTongGioChoKip, MA };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof globalThis !== 'undefined') globalThis.HDT_BoGio = API;

})();
