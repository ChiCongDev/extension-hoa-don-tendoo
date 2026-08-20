'use strict';

// ⚠️ TOÀN BỘ FILE NẰM TRONG MỘT PHẠM VI RIÊNG (hàm bọc ngoài).

(function () {

// ============================================================================
//  PHÁT HÀNH HÓA ĐƠN — HAI BƯỚC, đúng như Tendoo làm
//
//  ⛔ ĐÂY LÀ FILE DUY NHẤT TRONG CẢ DỰ ÁN ĐƯỢC PHÉP BẤM NÚT "Xác nhận".
//     Bấm = phát hành hóa đơn điện tử THẬT, đẩy lên cơ quan thuế, trừ tồn kho
//     thật. KHÔNG CÓ NÚT HOÀN TÁC. Sai thì phải làm hóa đơn điều chỉnh.
//
//  ⚠️ LUỒNG THẬT (quan sát tận mắt ngày 2026-08-12, tài khoản thật, trang thật):
//
//     Bấm "Thanh toán (F1)"  ->  KHÔNG phát hành gì cả.
//                                Nó mở bảng "Xác nhận thanh toán - Mang về":
//                                  · "1 sản phẩm            490.000"
//                                  · "Điểm tích lũy               0"
//                                  · "Tổng cộng          490.000 đ"
//                                  · ô "Khách đã đưa" điền sẵn 490.000
//                                  · công tắc "Ghi nợ" (ant-switch) đang TẮT
//                                  · nhãn xanh "Đủ tiền", radio "Tiền mặt"
//                                  · chân bảng: [Quay lại] [Xác nhận]
//     Bấm "Xác nhận"          ->  MỚI phát hành thật, giỏ mới trống.
//
//  Trước đây code chỉ bấm bước 1 rồi nhìn giỏ, thấy còn hàng nên báo "KHÔNG RÕ".
//  Thật ra chẳng có hóa đơn nào ra cả — máy đứng ở bảng xác nhận. Trang POS giả
//  dùng để test thì cú bấm chỉ CỘNG MỘT BIẾN ĐẾM, nên không bài test nào bắt
//  được. Nay bảng giả được dựng lại từ HTML thật đã chụp.
//
//  NĂM ĐIỀU KIỆN TIÊN QUYẾT — thiếu MỘT là không bấm:
//    1. Người dùng đã BẬT cho phép, truyền vào tường minh (choPhep === true).
//       Mặc định của cả hệ thống là TẮT; không có đường nào bật ngầm.
//    2. Giỏ hàng KHÔNG rỗng.
//    3. Tổng trên màn hình KHỚP TUYỆT ĐỐI với tổng mình tính. Lệch 1 đồng là dừng.
//    4. Tìm được đúng nút "Thanh toán" và nút đó KHÔNG bị khóa.
//    5. Chưa từng bấm trong lượt này (chống bấm hai lần).
//
//  BA ĐIỀU KIỆN NỮA NGAY TRONG BẢNG XÁC NHẬN — thiếu một là BẤM "Quay lại"
//  để hủy sạch rồi báo lỗi:
//    6. Bảng phải đúng là bảng xác nhận thanh toán (xét theo tiêu đề).
//    7. "Tổng cộng" TRONG BẢNG khớp tuyệt đối. Đây là chốt cuối cùng trước khi
//       tiền thật thành hóa đơn thật.
//    8. Công tắc "Ghi nợ" phải TẮT. Bật là hóa đơn ghi nợ — sai bản chất khoản thu.
//
//  ⭐ Ý NGHĨA CỦA VIỆC TÁCH HAI BƯỚC: mọi thứ hỏng TRƯỚC khi bấm "Xác nhận" đều
//  là lỗi thường, hủy đi là sạch, chắc chắn chưa có hóa đơn nào. Chỉ khoảng thời
//  gian SAU cú bấm "Xác nhận" mới có thể "không rõ". Cửa sổ bất định thu từ cả
//  bước thanh toán xuống còn đúng một cú bấm.
//
//  SAU KHI BẤM "Xác nhận":
//    Giỏ trống đi  -> đã phát hành (XONG).
//    Giỏ còn nguyên-> KHÔNG BIẾT đã phát hành hay chưa (KHONG_RO). Trả về đúng
//                     như vậy để tầng trên TREO lại và bắt người kiểm tra.
//                     TUYỆT ĐỐI KHÔNG BẤM LẠI để "thử xem".
//
//  ⚠️ TRÊN TRANG POS THẬT LUÔN CÓ SẴN 2 BẢNG QUẢNG CÁO ĐÈ LÊN ("Tính năng mới
//  POS V2", "Thông báo thay đổi cách ghi tên người mua"), kèm nút "Trải nghiệm
//  POS V2 ngay". Bấm nhầm nút đó là nhảy sang giao diện khác, hỏng toàn bộ.
//  Nên MỌI phép tìm nút ở đây đều phải giới hạn trong đúng khối cần tìm.
// ============================================================================

const MA = {
    XONG: 'XONG',
    KHONG_RO: 'KHONG_RO',
    CHUA_CHO_PHEP: 'CHUA_CHO_PHEP',
    GIO_TRONG: 'GIO_TRONG',
    TONG_KHONG_KHOP: 'TONG_KHONG_KHOP',
    KHONG_THAY_NUT: 'KHONG_THAY_NUT',
    NUT_BI_KHOA: 'NUT_BI_KHOA',
    DA_BAM_ROI: 'DA_BAM_ROI',
    KHONG_HIEN_BANG: 'KHONG_HIEN_BANG',
    BANG_SAI_TONG: 'BANG_SAI_TONG',
    GHI_NO_DANG_BAT: 'GHI_NO_DANG_BAT',
    KHONG_THAY_NUT_XAC_NHAN: 'KHONG_THAY_NUT_XAC_NHAN',
    CHUA_THIET_LAP_THUE: 'CHUA_THIET_LAP_THUE',
    BANG_LA_CHAN_DUONG: 'BANG_LA_CHAN_DUONG',
};

const LA_NUT_THANH_TOAN = /thanh toán/i;
const LA_NUT_LUU_DON = /lưu đơn/i;
const LA_BANG_XAC_NHAN = /xác nhận thanh toán/i;

// Bảng CHẶN ĐƯỜNG đã gặp thật. Bấm "Thanh toán (F1)" mà tài khoản chưa thiết
// lập quản lý thuế thì Tendoo bật bảng này lên THAY CHO bảng xác nhận:
//   "Chưa thiết lập quản lý thuế — Khi phát hành hóa đơn điện tử, bạn cần thiết
//    lập quản lý thuế. Nếu không thiết lập, dữ liệu trên Tờ khai thuế và Sổ kế
//    toán sẽ không chính xác."   [Bỏ qua] [Thiết lập quản lý thuế]
//
// ⛔ MÁY KHÔNG ĐƯỢC BẤM "Bỏ qua". Đó là quyết định kế toán của người dùng, ảnh
// hưởng tới số liệu thuế thật. Việc của máy là DỪNG và nói đúng bệnh.
const LA_BANG_CHUA_THIET_LAP_THUE = /chưa thiết lập quản lý thuế/i;

// Hai bảng quảng cáo LUÔN có sẵn trên trang POS thật. Chúng không chặn gì, chỉ
// làm nhiễu — nhận diện để khỏi báo nhầm là "Tendoo hiện bảng lạ".
const CAC_BANG_QUEN_THUOC = [
    /bán nhanh hơn với pos bán hàng/i,        // quảng cáo POS V2
    /thay đổi cách ghi tên người mua/i,       // thông báo Nghị định
];
// ── BẢNG "THÔNG BÁO NÂNG CẤP GIAO DIỆN BÁN HÀNG" ────────────────────────────
//
// Nguyên văn Tendoo hiện lên sau khi bấm Thanh toán, ghi lại được từ lượt chạy
// 14:48 ngày 19/08/2026 (khách Trang Bé TB, 9.980.000đ mất trắng):
//
//     «Thông báo nâng cấp giao diện bán hàng — Từ ngày 18/08/2026, hệ thống sẽ
//      chuyển sang giao diện bán hàng mới, giúp thao tác thuận tiện và nhanh
//      hơn. Nếu cần hỗ trợ …»
//
// Bảng này CHẶN bảng xác nhận, nên máy dừng đúng luật "không bấm gì trên bảng
// lạ". An toàn, nhưng mất một tờ hóa đơn.
//
// ⚠️ NÓ CHỈ HIỆN MỘT LẦN. Trong đúng lượt ấy, khách thứ hai (Thùy Dương S3)
// chạy trót lọt ngay sau đó. Nên đóng được nó MỘT lần là cả loạt đi tiếp.
const LA_BANG_NANG_CAP_GIAO_DIEN =
    /(nâng cấp|chuyển sang|giao diện).{0,40}giao diện bán hàng|giao diện bán hàng mới/i;

// Chữ trên nút được phép bấm để ĐÓNG bảng thông báo. So chữ TUYỆT ĐỐI.
const CAC_CHU_DONG_THONG_BAO = [
    'Để sau', 'Bỏ qua', 'Đóng', 'Đã hiểu', 'Tôi đã hiểu', 'Không, cảm ơn', 'Huỷ', 'Hủy',
];

// ⛔ ĐIỀU PHẢI GIỮ BẰNG MỌI GIÁ: bảng nâng cấp chắc chắn có một nút dẫn sang
// giao diện mới (/sales/pos-v2). Bấm nhầm vào đó giữa một lượt chạy hàng loạt
// là hỏng sạch phần còn lại — mọi bộ chọn của extension đều viết cho giao diện
// cũ, và cauNoi.js sẽ từ chối tab pos-v2.
//
// Cách giữ: DANH SÁCH TRẮNG SO CHỮ TUYỆT ĐỐI ở trên, cộng dấu ×. Nút nào không
// nằm trong danh sách ấy thì không bao giờ được chọn, khỏi cần biết nó tên gì.
//
// ⚠️ ĐÃ THỬ thêm một danh sách nút CẤM (/trải nghiệm|dùng thử|chuyển|…/) chồng
// lên. Gài lỗi xoá sạch danh sách cấm ấy đi thì KHÔNG bài test nào đỏ: so chữ
// tuyệt đối đã loại hết rồi, cấm thêm chẳng chặn được gì mà chỉ làm người đọc
// tưởng có hai lớp bảo vệ. Đã bỏ. Một lớp CHẶT hơn hai lớp lỏng.

const CHU_NUT_XAC_NHAN = 'Xác nhận';
const CHU_NUT_BO_QUA = 'Bỏ qua';
// ⛔ NÚT NÀY KHÔNG BAO GIỜ ĐƯỢC BẤM. Bấm vào là rời khỏi trang bán hàng,
// nhảy sang màn thiết lập thuế — đang giữa một lượt chạy hàng loạt thì hỏng hết.
const CHU_NUT_THIET_LAP_THUE = 'Thiết lập quản lý thuế';
const CHU_NUT_QUAY_LAI = 'Quay lại';
const NhipDo = (typeof module !== 'undefined' && module.exports)
    ? require('../chung/nhipDo') : globalThis.HDT_NhipDo;

const HAN_CHO_BANG_MS = NhipDo.HAN_CHO_BANG;

function boDo() {
    const D = (typeof globalThis !== 'undefined' && globalThis.HDT_DomReact) || null;
    if (!D) throw new Error('Thiếu HDT_DomReact — kiểm tra thứ tự nạp script');
    return D;
}
function boGio() {
    const B = (typeof globalThis !== 'undefined' && globalThis.HDT_BoGio) || null;
    if (!B) throw new Error('Thiếu HDT_BoGio — kiểm tra thứ tự nạp script');
    return B;
}

/**
 * Tìm nút Thanh toán. Loại thẳng nút "Lưu đơn" — hai nút nằm cạnh nhau, bấm
 * nhầm là lưu đơn nháp chứ không phát hành, hoặc ngược lại.
 */
function timNutThanhToan(tailieu) {
    const D = boDo();
    const cac = [...tailieu.querySelectorAll('button, [role=button]')];
    return cac.find(b => {
        // Bỏ qua nút nằm trong bảng nổi. Trang POS thật lúc nào cũng có 2 bảng
        // quảng cáo đè lên, và bảng xác nhận cũng chứa chữ "thanh toán" ở tiêu
        // đề — quét cả trang là có ngày bấm nhầm sang "Trải nghiệm POS V2 ngay".
        if (b.closest && b.closest('.ant-modal, [role=dialog], .ant-drawer')) return false;
        const chu = D.gonChu(b);
        return LA_NUT_THANH_TOAN.test(chu) && !LA_NUT_LUU_DON.test(chu);
    }) || null;
}

/**
 * Phần tử có đang hiện không.
 *
 * Ant Design KHÔNG xóa bảng khỏi DOM khi đóng — nó đặt `display:none` lên
 * `.ant-modal-wrap`. Chữ bên trong vẫn đọc được như thường. Nhận diện "bảng
 * đang mở" bằng cách tìm chữ là sai: bảng đã đóng vẫn khớp. Phải xét display.
 * (Không dùng getClientRects vì môi trường test không dựng hình.)
 */
function dangHien(e) {
    for (let n = e; n && n.style !== undefined; n = n.parentElement) {
        if (n.style.display === 'none' || n.style.visibility === 'hidden') return false;
        if (n.hasAttribute && n.hasAttribute('hidden')) return false;
    }
    return true;
}

/** Bảng "Xác nhận thanh toán" đang MỞ. Không có -> null. */
function timBangXacNhan(tailieu) {
    const D = boDo();
    const cac = [...tailieu.querySelectorAll('.ant-modal, [role=dialog]')];
    return cac.find(m => LA_BANG_XAC_NHAN.test(D.docChu(m)) && dangHien(m)) || null;
}

/**
 * Bảng nào đang chặn đường thay cho bảng xác nhận. Trả null nếu chỉ có mấy bảng
 * quảng cáo quen thuộc. KHÔNG bấm gì — chỉ nhìn và kể lại.
 */
function timBangChanDuong(tailieu) {
    const D = boDo();
    const cac = [...tailieu.querySelectorAll('.ant-modal, [role=dialog]')]
        .filter(m => dangHien(m));
    for (const m of cac) {
        const chu = D.gonChu(m);
        if (!chu) continue;
        if (LA_BANG_XAC_NHAN.test(chu)) continue;                  // bảng mình chờ
        if (CAC_BANG_QUEN_THUOC.some(r => r.test(chu))) continue;  // quảng cáo, kệ
        return { khoi: m, chu, laThue: LA_BANG_CHUA_THIET_LAP_THUE.test(chu) };
    }
    return null;
}

/** Nút trong ĐÚNG một khối, so chữ tuyệt đối. Không quét cả trang. */
function timNutTheoChu(khoi, chu) {
    const D = boDo();
    return [...khoi.querySelectorAll('button, [role=button]')]
        .find(b => D.gonChu(b) === chu) || null;
}

/**
 * Nút ĐÓNG bảng thông báo — chỉ trả về thứ chắc chắn không điều hướng đi đâu.
 *
 * Thứ tự ưu tiên có chủ ý:
 *   1. Dấu × của Ant Design. Nó chỉ đóng bảng, không bao giờ dẫn đi đâu khác.
 *      Đây là lựa chọn an toàn nhất và cũng là thứ không phụ thuộc vào chữ —
 *      mà chữ thì mình đang không biết.
 *   2. Nút có chữ nằm trong danh sách trắng, so TUYỆT ĐỐI, và vẫn phải qua
 *      được vòng loại LA_NUT_SANG_GIAO_DIEN_MOI.
 *
 * Không thấy gì an toàn -> null. Lúc ấy máy quay về đúng hành vi cũ: dừng,
 * không bấm gì, và kể lại tên mọi nút trên bảng để lần sau biết đường.
 */
function timNutDongThongBao(khoi) {
    // ⛔ Thẻ mang href thì bấm là ĐI KHỎI TRANG, dù nó đội đúng lớp của dấu ×.
    // Không tốn gì để loại, mà loại sót thì mất cả lượt chạy.
    const anToan = (n) => !!n && !(n.hasAttribute && n.hasAttribute('href'));
    const x = khoi.querySelector(
        '.ant-modal-close, .ant-drawer-close, [aria-label="Close"], [aria-label="close"]');
    if (anToan(x)) return x;
    for (const chu of CAC_CHU_DONG_THONG_BAO) {
        const n = timNutTheoChu(khoi, chu);   // so chữ TUYỆT ĐỐI, không chứa-là-được
        if (anToan(n)) return n;
    }
    return null;
}

/**
 * Đường dẫn trang đang đứng. Đọc không được thì trả '' — và khi ấy mọi phép so
 * sánh '' === '' đều hoà, tức là KHÔNG bao giờ kết luận nhầm "đã rời trang".
 * Thà mất một chốt chặn còn hơn dựng ra một lời buộc tội sai.
 */
function docDuongDan(tailieu) {
    try {
        const w = tailieu && tailieu.defaultView;
        return w && w.location ? String(w.location.pathname || '') : '';
    } catch (e) { return ''; }
}

/** "4 giây" / "600ms" — người đọc log không phải tự chia. */
const chuThoiGian = (ms) => (Number(ms) >= 1000 ? Math.round(Number(ms) / 1000) + ' giây'
                                                : Math.round(Number(ms)) + 'ms');

/**
 * KỂ LẠI MÀN HÌNH bằng chữ, để thông báo lỗi mang theo bằng chứng.
 *
 * ⚠️ VÌ SAO CẦN. Ngày 19/08/2026 khách Bích Ngọc S1 treo lệnh với đúng một câu
 * «giỏ vẫn còn hàng». Không biết lúc ấy màn hình có bảng nào, nút nào, giỏ còn
 * mấy dòng — nên không sửa được gì, chỉ đoán. Cũng đúng lỗ hổng ấy từng làm
 * mất trọn một ngày với bảng "nâng cấp giao diện", và tôi mới chỉ vá nó ở bước
 * bấm Thanh toán mà QUÊN bước Xác nhận.
 *
 * ⚠️ CHỈ NHÌN VÀ KỂ. Hàm này không bấm gì, không đổi gì, và KHÔNG BAO GIỜ được
 * ném lỗi: nó chạy trên đường thoát của một lệnh đã hỏng, ném thêm ở đây là
 * nuốt mất luôn cái thông báo mà người dùng đang cần.
 */
function keLaiManHinh(tailieu) {
    const phan = [];
    try {
        const bangXn = timBangXacNhan(tailieu);
        if (bangXn) phan.push('bảng xác nhận VẪN đang mở');
        const chan = timBangChanDuong(tailieu);
        if (chan) {
            const nut = tenCacNut(chan.khoi);
            phan.push('có bảng khác đang mở: «' + String(chan.chu).slice(0, 160) + '»'
                + (nut.length ? ' — nút: ' + nut.map(n => '«' + n + '»').join(' / ') : ''));
        }
        if (!bangXn && !chan) phan.push('không có bảng nào đang mở');
    } catch (e) { phan.push('không đọc được bảng đang mở'); }
    try {
        const B = boGio();
        const dong = B.docCacDongGio(tailieu);
        const tong = B.docTongGio(tailieu);
        phan.push('giỏ còn ' + dong.length + ' dòng'
            + (tong == null ? ', không đọc được tổng'
                            : ', tổng ' + Number(tong).toLocaleString('vi-VN') + 'đ'));
    } catch (e) { phan.push('không đọc được giỏ'); }
    return phan.join('; ');
}

/** Tên mọi nút trên một bảng — để thông báo lỗi nói được cụ thể. */
function tenCacNut(khoi) {
    const D = boDo();
    return [...khoi.querySelectorAll('button, [role=button]')]
        .map(b => D.gonChu(b)).filter(Boolean).slice(0, 8);
}

/**
 * Đọc "Tổng cộng" TRONG bảng xác nhận — con số cuối cùng máy nhìn thấy trước
 * khi tiền thành hóa đơn. Khác với "Tổng thanh toán" ở chân giỏ.
 */
function docTongTrongBang(bang) {
    const D = boDo();
    const cac = [...bang.querySelectorAll('*')]
        .filter(e => /Tổng cộng/i.test(e.textContent || ''))
        .sort((a, b) => a.children.length - b.children.length);
    for (const e of cac) {
        const m = D.gonChu(e).match(/Tổng cộng[^\d]*([\d.,]+)/i);
        if (m) {
            const so = D.docSoTien(m[1]);
            if (so != null) return so;
        }
    }
    return null;
}

const CHU_KHACH_DA_DUA = /kh[áa]ch\s*[đd][ãa]\s*[đd][ưu]a/i;

/**
 * Ô "Khách đã đưa" trong bảng xác nhận — tìm THEO NHÃN, không lấy ô đầu tiên.
 *
 * Cùng kỷ luật với công tắc "Ghi nợ": bảng này còn ô "Nhập ghi chú" và nhiều ô
 * khác, vơ nhầm là gõ số tiền vào chỗ không phải chỗ của nó.
 */
function timODaDua(bang) {
    const D = boDo();
    const cacO = [...bang.querySelectorAll('input')];
    for (const o of cacO) {
        let e = o.parentElement;
        for (let cap = 0; e && cap < 4; cap++, e = e.parentElement) {
            if (!CHU_KHACH_DA_DUA.test(D.gonChu(e))) continue;
            if (e.querySelectorAll('input').length !== 1) break;   // không phân biệt được
            return o;
        }
    }
    return null;
}

/**
 * ĐIỀN "Khách đã đưa" BẰNG ĐÚNG TỔNG ĐƠN.
 *
 * ⚠️ VÌ SAO PHẢI LÀM. Tendoo vốn TỰ ĐIỀN SẴN ô này bằng tổng đơn (quan sát thật
 * 2026-08-12: ô hiện sẵn 490.000), nên extension chưa bao giờ đụng tới. Ngày
 * 19/08/2026 Tendoo thôi điền sẵn — bảng thấy khách đưa thiếu tiền nên TỰ BẬT
 * công tắc "Ghi nợ", và máy từ chối phát hành. Hai khách liền bị chặn vì một
 * ô bỏ trống.
 *
 * ⚠️ KHÔNG NỚI CHỐT CHẶN NÀO. Điền xong vẫn phải:
 *   · đọc lại tổng trong bảng — điền nhầm chỗ mà tổng đổi thì DỪNG
 *   · kiểm "Ghi nợ" như cũ — còn bật thì vẫn TỪ CHỐI
 * Việc của hàm này chỉ là gỡ một nguyên nhân, không phải mở một cửa.
 *
 * Không thấy ô thì THÔI, không coi là lỗi: có thể Tendoo vẫn điền sẵn như xưa.
 *
 * @returns {{daDien:boolean, lyDo:string}}
 */
async function dienKhachDaDua(bang, mongDoi, nghi) {
    const D = boDo();
    const o = timODaDua(bang);
    if (!o) return { daDien: false, lyDo: 'KHONG_THAY_O' };

    // Đã đúng số rồi thì đừng gõ lại — mỗi lần gõ là một lần React vẽ lại.
    if (D.docSoTien(o.value) === Number(mongDoi)) {
        return { daDien: false, lyDo: 'DA_DUNG_SAN' };
    }

    // Gõ theo cách React thật sự nhìn thấy, rồi ĐỌC LẠI xác nhận.
    const daVao = await D.dienChacChan(o, String(mongDoi), { nghi });
    if (!daVao) return { daDien: false, lyDo: 'GO_KHONG_VAO' };
    return { daDien: true, lyDo: '' };
}

const CHU_GHI_NO = /ghi\s*n[ợo]/i;

/** Một công tắc có đang BẬT không — theo cả hai cách Ant Design đánh dấu. */
function congTacBat(ct) {
    if (!ct) return false;
    if (ct.getAttribute('aria-checked') === 'true') return true;
    return /ant-switch-checked/.test(String(ct.className || ''));
}

/**
 * Công tắc "Ghi nợ" có đang BẬT không.
 *
 * ⚠️ PHẢI TÌM THEO NHÃN, KHÔNG ĐƯỢC LẤY CÔNG TẮC ĐẦU TIÊN.
 *
 * Bản cũ viết `bang.querySelector('[role=switch], .ant-switch')` — lấy công tắc
 * đầu tiên gặp rồi coi đó là Ghi nợ, KHÔNG hề kiểm tên. Bảng xác nhận chỉ có
 * đúng một công tắc thì đúng; Tendoo thêm bất kỳ công tắc nào đứng trước (ví dụ
 * "Hóa đơn điện tử", vốn mặc định BẬT) là máy đọc nhầm cái đó và từ chối phát
 * hành với lý do sai hoàn toàn.
 *
 * Ngày 19/08/2026 gặp thật: hai khách liền bị chặn vì "Ghi nợ đang BẬT" trong
 * khi trước đó chưa từng xảy ra — đúng lúc Tendoo đổi giao diện bán hàng.
 *
 * ⚠️ KHÔNG THẤY NHÃN -> COI NHƯ ĐANG BẬT, tức là TỪ CHỐI phát hành.
 * Ngả về phía an toàn: thà dừng oan còn hơn phát hành một hóa đơn ghi nợ mà
 * tưởng là thu tiền — sai bản chất khoản thu thì không sửa được bằng cách xóa.
 */
function ghiNoDangBat(bang) {
    return kiemGhiNo(bang).bat;
}

/**
 * Như trên, nhưng nói RÕ VÌ SAO — "đang bật thật" và "không nhận ra công tắc"
 * là hai chuyện khác hẳn, và người dùng phải chữa theo hai cách khác hẳn.
 * @returns {{bat: boolean, lyDo: string}}
 */
function kiemGhiNo(bang) {
    const D = boDo();
    const cacCt = [...bang.querySelectorAll('[role=switch], .ant-switch')];
    if (!cacCt.length) return { bat: false, lyDo: '' };   // không có công tắc nào

    // Tìm công tắc nằm cùng khối với chữ "Ghi nợ". Đi ngược lên từng cấp cha,
    // lấy khối gần nhất có chứa nhãn — không quét cả bảng để khỏi vơ nhầm.
    for (const ct of cacCt) {
        let o = ct.parentElement;
        for (let cap = 0; o && cap < 4; cap++, o = o.parentElement) {
            const chu = D.gonChu(o);
            if (!CHU_GHI_NO.test(chu)) continue;
            // Khối này có nhãn Ghi nợ. Nhưng nếu nó chứa NHIỀU công tắc thì
            // không phân biệt được cái nào của nhãn nào -> không đoán.
            if (o.querySelectorAll('[role=switch], .ant-switch').length !== 1) break;
            return congTacBat(ct)
                ? { bat: true, lyDo: 'CT_BAT' }
                : { bat: false, lyDo: '' };
        }
    }

    // Có công tắc nhưng KHÔNG cái nào gắn được với nhãn "Ghi nợ".
    // Giao diện đã đổi khác với thứ mình biết -> từ chối, không đoán bừa.
    return { bat: true, lyDo: 'KHONG_NHAN_RA', soCongTac: cacCt.length };
}

/** Hủy sạch: bấm "Quay lại". Không có nút thì thôi, còn hơn bấm bừa. */
function huyBang(bang) {
    const nut = timNutTheoChu(bang, CHU_NUT_QUAY_LAI);
    if (nut) { nut.click(); return true; }
    return false;
}

/** Tạo một "lượt bấm" — mỗi lượt chỉ được bấm tối đa MỘT lần. */
function taoLuot() {
    let daBam = false;
    let daBoQuaThue = false;          // đã bỏ qua cảnh báo thuế trong lượt này chưa
    let daDongThongBao = false;       // đã đóng bảng nâng cấp giao diện chưa — TỐI ĐA MỘT LẦN
    // Bảng thuế có THẬT SỰ đóng sau khi bấm "Bỏ qua" không. Hai bệnh hoàn toàn
    // khác nhau, và bản cũ gộp cả hai vào một câu nên không phân biệt được:
    //   · đóng rồi HIỆN LẠI  -> tài khoản chưa thiết lập thuế, việc của người dùng
    //   · CHƯA TỪNG đóng     -> nút bấm không ăn hoặc giao diện đổi, việc của mình
    let thueDaDongLai = false;
    let soLanBamThanhToan = 0;        // để test đếm được, và để người đọc thấy rõ trần

    /**
     * @param {Document} tailieu
     * @param {{choPhep:boolean, tongMongDoi:number, nghi?:Function, doiSauBam?:number}} tuyChon
     * @returns {Promise<{ok:boolean, ma:string, thongBao:string, tongLucBam?:number}>}
     */
    async function bam(tailieu, tuyChon = {}) {
        const B = boGio();
        const nghi = tuyChon.nghi || (ms => new Promise(r => setTimeout(r, ms)));

        // ── ĐK 5: chống bấm hai lần ─────────────────────────────────────────
        if (daBam) {
            return { ok: false, ma: MA.DA_BAM_ROI,
                     thongBao: 'Lượt này đã bấm Thanh toán rồi — không bấm lại.' };
        }

        // ── ĐK 1: phải được cho phép tường minh ─────────────────────────────
        if (tuyChon.choPhep !== true) {
            return { ok: false, ma: MA.CHUA_CHO_PHEP,
                     thongBao: 'Chưa bật cho phép tự bấm Thanh toán.' };
        }

        // ── ĐK 2: giỏ phải có hàng ──────────────────────────────────────────
        if (B.gioDangTrong(tailieu)) {
            return { ok: false, ma: MA.GIO_TRONG,
                     thongBao: 'Giỏ hàng đang trống — không có gì để phát hành.' };
        }

        // ── ĐK 3: tổng phải khớp TUYỆT ĐỐI ──────────────────────────────────
        const tongTrenManHinh = B.docTongGio(tailieu);
        const mongDoi = Number(tuyChon.tongMongDoi);
        if (!Number.isFinite(mongDoi) || tongTrenManHinh == null
            || tongTrenManHinh !== mongDoi) {
            return {
                ok: false, ma: MA.TONG_KHONG_KHOP,
                thongBao: `Tổng trên màn hình (${tongTrenManHinh}) không khớp tổng đã tính `
                    + `(${tuyChon.tongMongDoi}) — KHÔNG bấm Thanh toán.`,
            };
        }

        // ── ĐK 4: nút phải có và không bị khóa ──────────────────────────────
        const nut = timNutThanhToan(tailieu);
        if (!nut) {
            return { ok: false, ma: MA.KHONG_THAY_NUT,
                     thongBao: 'Không thấy nút Thanh toán — giao diện Tendoo có thể đã đổi.' };
        }
        if (nut.disabled) {
            return { ok: false, ma: MA.NUT_BI_KHOA,
                     thongBao: 'Nút Thanh toán đang bị khóa.' };
        }

        // ── BƯỚC 1: mở bảng xác nhận. Cú bấm này KHÔNG phát hành gì. ────────
        daBam = true;                     // đánh dấu TRƯỚC, để nếu nổ cũng không bấm lại
        nut.click();
        soLanBamThanhToan++;

        const hanBang = tuyChon.hanChoBangMs || HAN_CHO_BANG_MS;
        const nhip = tuyChon.nhipChoMs || NhipDo.NHIN_DOM;
        // Đợi bảng xác nhận — nhưng THÔI ĐỢI NGAY khi thấy một bảng khác chặn
        // đường. Bản trước chỉ nhìn mỗi bảng xác nhận, nên gặp bảng thuế là ngồi
        // đợi cho hết 8 GIÂY rồi mới chịu nhìn xem cái gì đang chặn. Đó là khoản
        // chậm lớn nhất của cả luồng bỏ qua thuế.
        const doiBang = async () => {
            for (let da = 0; da < hanBang; da += nhip) {
                await nghi(nhip);
                const b = timBangXacNhan(tailieu);
                if (b) return b;
                if (timBangChanDuong(tailieu)) return null;   // có cái khác chặn -> xử ngay
            }
            return null;
        };
        let bang = await doiBang();

        // ── BẢNG THUẾ CHẶN ĐƯỜNG — chỉ bỏ qua khi được cho phép tường minh ───
        //
        // Luồng thật (chủ dự án xác nhận 2026-08-12): bấm "Bỏ qua" thì bảng thuế
        // chỉ ĐÓNG LẠI, chưa có bảng xác nhận — phải bấm "Thanh toán (F1)" lần nữa.
        //
        // ⚠️ ĐÂY LÀ CHỖ DUY NHẤT NỚI LUẬT "chỉ bấm Thanh toán MỘT lần".
        // An toàn vì đã quan sát TẬN MẮT trên trang thật: nút "Thanh toán (F1)" KHÔNG
        // phát hành gì, nó chỉ mở bảng. Thứ tạo ra hóa đơn là nút "Xác nhận", và
        // nút đó vẫn bị khóa ở ĐÚNG MỘT lần như cũ.
        //   · "Bỏ qua"      : tối đa 1 lần
        //   · "Thanh toán"  : tối đa 2 lần (lần 2 chỉ sau khi đã bỏ qua)
        //   · "Xác nhận"    : tối đa 1 lần, tuyệt đối
        // KHÔNG CÓ VÒNG LẶP: bảng thuế hiện lại lần nữa thì dừng hẳn.
        if (!bang && tuyChon.boQuaCanhBaoThue === true) {
            const chanThue = timBangChanDuong(tailieu);
            if (chanThue && chanThue.laThue && !daBoQuaThue) {
                const nutBoQua = timNutTheoChu(chanThue.khoi, CHU_NUT_BO_QUA);
                if (!nutBoQua) {
                    return {
                        ok: false, ma: MA.CHUA_THIET_LAP_THUE,
                        thongBao: 'Công tắc "Bỏ qua cảnh báo thuế" ĐANG BẬT, nhưng bảng "Chưa thiết '
                            + 'lập quản lý thuế" không có nút "Bỏ qua" — giao diện Tendoo có thể vừa '
                            + 'đổi. CHƯA phát hành hóa đơn nào.',
                    };
                }
                daBoQuaThue = true;          // đánh dấu TRƯỚC khi bấm
                nutBoQua.click();

                // NHÌN cho tới khi bảng thuế thật sự đóng (hoặc bảng xác nhận tự hiện),
                // thay vì ngủ cứng 800ms rồi đoán. Bấm "Thanh toán" khi bảng thuế còn
                // đè lên là bấm vào khoảng không.
                const hanDong = tuyChon.hanChoThueDong == null
                    ? NhipDo.HAN_CHO_BANG_THUE_DONG : tuyChon.hanChoThueDong;
                for (let da = 0; da <= hanDong; da += nhip) {
                    bang = timBangXacNhan(tailieu);
                    const con = timBangChanDuong(tailieu);
                    if (!(con && con.laThue)) thueDaDongLai = true;   // đã thấy nó đóng
                    if (bang || thueDaDongLai) break;
                    if (da + nhip > hanDong) break;
                    await nghi(nhip);
                }
                bang = bang || timBangXacNhan(tailieu);
                if (!bang) {
                    const nutLai = timNutThanhToan(tailieu);
                    if (!nutLai || nutLai.disabled) {
                        return {
                            ok: false, ma: MA.KHONG_THAY_NUT,
                            thongBao: 'Đã bỏ qua cảnh báo thuế nhưng không bấm lại được nút Thanh toán. '
                                + 'CHƯA phát hành hóa đơn nào.',
                        };
                    }
                    nutLai.click();
                    soLanBamThanhToan++;
                    bang = await doiBang();
                }
            }
        }

        // ── BẢNG "NÂNG CẤP GIAO DIỆN BÁN HÀNG" CHẶN ĐƯỜNG ───────────────────
        //
        // ⚠️ VÌ SAO ĐÓNG TỰ ĐỘNG Ở ĐÂY LÀ AN TOÀN — khác hẳn bảng thuế:
        //   · Bảng thuế phải có công tắc vì bấm "Bỏ qua" là chấp nhận phát hành
        //     khi chưa thiết lập thuế — có hậu quả lên sổ sách thật.
        //   · Bảng này chỉ là THÔNG BÁO. Đóng nó không đổi gì trên hóa đơn,
        //     không đổi gì trong sổ sách. Đóng hay không, tờ hóa đơn y hệt.
        //
        // ⚠️ MỌI CHỐT CHẶN GIỮ NGUYÊN. Đóng bảng xong vẫn phải đi qua đủ:
        // đọc lại tổng trong bảng, kiểm "Ghi nợ", điền "Khách đã đưa". Nút
        // "Xác nhận" — thứ DUY NHẤT tạo ra hóa đơn — vẫn khóa ở ĐÚNG MỘT lần.
        //
        // ⚠️ TỐI ĐA MỘT LẦN, KHÔNG CÓ VÒNG LẶP. Đóng rồi mà bảng hiện lại thì
        // dừng hẳn, không đóng lần hai.
        //
        // ⚠️ NÓI THẬT: gài lỗi bỏ `!daDongThongBao` đi thì KHÔNG bài nào đỏ, vì
        // khối này nằm thẳng trong luồng và chỉ chạy đúng một lượt — cái trần
        // hiện do CẤU TRÚC giữ, không phải do điều kiện này giữ. Vẫn để lại:
        // ngày nào có người bọc đoạn này vào một vòng lặp thì nó là thứ duy
        // nhất chặn việc đóng bảng lặp đi lặp lại.
        if (!bang && !daDongThongBao) {
            const chanTb = timBangChanDuong(tailieu);
            if (chanTb && !chanTb.laThue && LA_BANG_NANG_CAP_GIAO_DIEN.test(chanTb.chu)) {
                const nutDong = timNutDongThongBao(chanTb.khoi);
                if (nutDong) {
                    daDongThongBao = true;        // đánh dấu TRƯỚC khi bấm
                    const duongDanTruoc = docDuongDan(tailieu);
                    nutDong.click();

                    // Nhìn cho tới khi bảng thật sự đóng, thay vì ngủ cứng rồi đoán.
                    const hanTb = tuyChon.hanChoThueDong == null
                        ? NhipDo.HAN_CHO_BANG_THUE_DONG : tuyChon.hanChoThueDong;
                    for (let da = 0; da <= hanTb; da += nhip) {
                        bang = timBangXacNhan(tailieu);
                        const con = timBangChanDuong(tailieu);
                        if (bang || !(con && LA_BANG_NANG_CAP_GIAO_DIEN.test(con.chu))) break;
                        if (da + nhip > hanTb) break;
                        await nghi(nhip);
                    }
                    bang = bang || timBangXacNhan(tailieu);

                    if (!bang) {
                        // ── CHỜ NÚT THANH TOÁN TRỞ LẠI ──────────────────────
                        //
                        // ⚠️ CA HỎNG 15:11 NGÀY 19/08/2026 — khách Trang Bé TB,
                        // 9.980.000đ. Bản trước nhìn nút ĐÚNG MỘT LẦN, ngay lập
                        // tức. Không thấy là kết luận luôn «nhiều khả năng trang
                        // đã nhảy sang giao diện bán hàng mới» rồi dừng.
                        //
                        // Trang KHÔNG hề nhảy đi đâu (chủ dự án xác nhận). Đóng
                        // bảng xong React chỉ vẽ lại vùng bán hàng mất một nhịp,
                        // và máy nhìn trúng đúng khoảnh khắc trống ấy.
                        //
                        // ⚠️ Suy ra "đã rời trang" TỪ CHỖ KHÔNG THẤY GÌ chính là
                        // lỗi tư duy mà tệp này đã cấm ở chỗ khác (xem chốt
                        // KHONG_RO). Tôi vừa phạm lại nó. Nay chỉ được kết luận
                        // rời trang khi ĐƯỜNG DẪN THẬT SỰ ĐỔI — còn lại thì CHỜ.
                        let nutLai = null;
                        let daRoiTrang = false;
                        for (let da = 0; da <= hanTb; da += nhip) {
                            if (docDuongDan(tailieu) !== duongDanTruoc) { daRoiTrang = true; break; }
                            bang = timBangXacNhan(tailieu);
                            if (bang) break;
                            const n = timNutThanhToan(tailieu);
                            if (n && !n.disabled) { nutLai = n; break; }
                            if (da + nhip > hanTb) break;
                            await nghi(nhip);
                        }

                        if (!bang && !nutLai) {
                            const sau = docDuongDan(tailieu);
                            return {
                                ok: false, ma: MA.BANG_LA_CHAN_DUONG, daDongThongBao: true,
                                thongBao: 'Đã đóng bảng "Thông báo nâng cấp giao diện bán hàng" '
                                    + (daRoiTrang
                                        ? `nhưng trang đã chuyển từ «${duongDanTruoc}» sang «${sau}» `
                                          + '— nhiều khả năng Tendoo đẩy sang giao diện bán hàng mới. '
                                          + 'Máy KHÔNG làm việc trên giao diện mới nên dừng ở đây. '
                                        : `nhưng chờ ${chuThoiGian(hanTb)} mà nút Thanh toán `
                                          + `vẫn không bấm được${sau ? `, trang vẫn ở «${sau}»` : ''}. `
                                          + 'Máy dừng. ')
                                    + 'CHƯA phát hành hóa đơn nào.',
                            };
                        }
                        if (nutLai) {
                            nutLai.click();
                            soLanBamThanhToan++;
                            bang = await doiBang();
                        }
                    }
                }
            }
        }

        if (!bang) {
            // ⛔ TUYỆT ĐỐI KHÔNG kết luận "đã phát hành" ở đây.
            //
            // Trước đây chỗ này suy ra: giỏ trống đi mà không thấy bảng => chắc
            // Tendoo đã đổi luồng, phát hành thẳng => trả XONG. Đó là suy đoán
            // TỪ CHỖ KHÔNG THẤY GÌ, trong khi nút "Xác nhận" CHƯA HỀ ĐƯỢC BẤM.
            // Giỏ đọc ra 0 dòng cũng có thể chỉ vì trang vừa vẽ lại hoặc panel
            // giỏ bị tháo trong lúc bảng đang mở.
            //
            // Hậu quả đã xảy ra thật: màn hình báo "Xong 2 khách" trong khi chỉ
            // có 1 hóa đơn. Nay trả KHÔNG RÕ -> hàng đợi treo lệnh lại và bắt
            // người dùng tự mở Tendoo kiểm tra. Thà kiểm tra một lần còn hơn
            // tưởng đã xong rồi không bao giờ biết.
            if (B.gioDangTrong(tailieu)) {
                return {
                    ok: false, ma: MA.KHONG_RO, tongLucBam: mongDoi,
                    thongBao: 'Bấm Thanh toán xong thì giỏ trống đi nhưng bảng xác nhận không '
                        + 'hiện ra. Máy CHƯA bấm "Xác nhận" nên KHÔNG RÕ hóa đơn đã phát hành '
                        + 'hay chưa — hãy mở Tendoo kiểm tra tận mắt. KHÔNG được bấm lại.',
                };
            }
            // Có bảng khác chặn đường không? Nói ĐÚNG BỆNH thay vì đổ cho
            // "giao diện Tendoo có thể đã đổi" — câu đó từng làm người dùng đi
            // tìm sai hướng suốt một lượt chạy.
            const chan = timBangChanDuong(tailieu);
            if (chan && chan.laThue) {
                // ⚠️ THÔNG BÁO PHẢI NÓI ĐÚNG TRẠNG THÁI CÔNG TẮC.
                // Bản cũ viết cứng câu "Máy KHÔNG tự bấm Bỏ qua" từ hồi chưa có công
                // tắc nào. Hậu quả: công tắc TẮT thì người dùng tưởng máy không bao giờ
                // làm được việc đó (không hề nhắc tới công tắc), còn công tắc BẬT mà
                // vẫn tắc thì câu đó sai hoàn toàn — máy đã bấm "Bỏ qua" rồi.
                const daBat = tuyChon.boQuaCanhBaoThue === true;
                const hanThue = tuyChon.hanChoThueDong == null
                    ? NhipDo.HAN_CHO_BANG_THUE_DONG : tuyChon.hanChoThueDong;
                return {
                    ok: false, ma: MA.CHUA_THIET_LAP_THUE, daBatBoQuaThue: daBat, thueDaDongLai,
                    thongBao: daBat
                        ? ('Đã bấm "Bỏ qua" ' + (thueDaDongLai
                              ? ('thì bảng "Chưa thiết lập quản lý thuế" ĐÃ ĐÓNG, nhưng bấm Thanh '
                                 + 'toán lần nữa là nó HIỆN LẠI và VẪN chặn đường. Tendoo nhắc lại '
                                 + 'mỗi lần thanh toán vì tài khoản này chưa thiết lập quản lý thuế '
                                 + '— hãy vào Tendoo thiết lập MỘT LẦN cho tài khoản này, làm xong '
                                 + 'là hết. ')
                              : ('nhưng bảng "Chưa thiết lập quản lý thuế" KHÔNG ĐÓNG trong '
                                 + chuThoiGian(hanThue) + ' và VẪN chặn đường — nút "Bỏ qua" bấm '
                                 + 'không ăn, hoặc giao diện Tendoo vừa đổi. Đây là lỗi của '
                                 + 'extension, không phải của tài khoản. '))
                           + 'Máy dừng để không bấm lặp vô tận. CHƯA phát hành hóa đơn nào.')
                        : ('Tài khoản Tendoo này CHƯA THIẾT LẬP QUẢN LÝ THUẾ. Hai cách: (1) vào '
                           + 'Tendoo bằng đúng tài khoản của khách rồi thiết lập quản lý thuế một lần '
                           + '— nên làm cách này; hoặc (2) BẬT CÔNG TẮC "Bỏ qua cảnh báo Chưa thiết '
                           + 'lập quản lý thuế" trong popup extension — bật thì hóa đơn vẫn ra, nhưng '
                           + 'Tờ khai thuế và Sổ kế toán sẽ không chính xác. Công tắc đang TẮT nên '
                           + 'máy dừng. CHƯA phát hành hóa đơn nào.'),
                };
            }
            if (chan) {
                // ⚠️ PHẢI KỂ TÊN CÁC NÚT. Lần trước thông báo chỉ chép 160 chữ
                // đầu của bảng, nên đọc log xong vẫn không biết bấm vào đâu —
                // mất trọn một ngày chỉ để đoán tên nút. Có tên nút thì lần sau
                // thêm vào danh sách trắng là xong.
                const nut = tenCacNut(chan.khoi);
                const daThu = daDongThongBao
                    ? ' Máy ĐÃ thử đóng bảng này một lần và nó hiện lại — dừng hẳn.'
                    : ' Máy KHÔNG tự bấm gì trên bảng lạ.';
                return {
                    ok: false, ma: MA.BANG_LA_CHAN_DUONG, daDongThongBao,
                    thongBao: 'Bấm Thanh toán nhưng Tendoo hiện một bảng khác: «'
                        + chan.chu.slice(0, 160) + '».'
                        + (nut.length ? ' Các nút trên bảng: ' + nut.map(n => '«' + n + '»').join(' / ') + '.' : '')
                        + daThu + ' CHƯA phát hành hóa đơn nào.',
                };
            }
            // Giỏ còn nguyên và không có bảng nào -> cú bấm không ăn. CHƯA phát
            // hành gì cả, nên đây là lỗi thường, không phải "không rõ".
            return {
                ok: false, ma: MA.KHONG_HIEN_BANG,
                thongBao: 'Bấm Thanh toán nhưng bảng xác nhận không hiện ra, giỏ vẫn nguyên. '
                    + 'CHƯA phát hành hóa đơn nào. Giao diện Tendoo có thể đã đổi.',
            };
        }

        // ── ĐK 7: tổng TRONG BẢNG phải khớp tuyệt đối ───────────────────────
        //
        // ⚠️ CHỜ TỚI KHI BẢNG VẼ XONG rồi mới đọc. Bảng xác nhận vừa hiện ra là
        // đọc ngay thì rất dễ trúng khe React chưa điền số: ngày 18/08/2026 gặp
        // thật, máy báo «Tổng cộng trong bảng xác nhận (0) không khớp tổng đã
        // tính (2000000)» rồi bấm Quay lại — trong khi bảng chỉ chậm một nhịp.
        //
        // Chờ ở đây không tốn gì khi bảng đã sẵn: thấy đúng số là đi ngay.
        // Dùng đúng lối chờ sẵn có của tệp này (vòng nghỉ theo nhịp), không
        // mượn helper ở tệp khác — mượn nhầm thứ không tồn tại thì ReferenceError
        // xảy ra ĐÚNG LÚC vừa bấm Thanh toán, chỗ nguy hiểm nhất cả luồng.
        for (let da = 0; da < hanBang && docTongTrongBang(bang) !== mongDoi; da += nhip) {
            await nghi(nhip);
        }
        const tongBang = docTongTrongBang(bang);
        if (tongBang == null || tongBang !== mongDoi) {
            huyBang(bang);
            return {
                ok: false, ma: MA.BANG_SAI_TONG,
                thongBao: `Tổng cộng trong bảng xác nhận (${tongBang}) không khớp tổng đã tính `
                    + `(${mongDoi}) — đã bấm Quay lại, CHƯA phát hành gì.`,
            };
        }

        // ── ĐK 8: không được ghi nợ ─────────────────────────────────────────
        // ── Điền "Khách đã đưa" TRƯỚC khi xét Ghi nợ ────────────────────────
        // Tendoo tự bật Ghi nợ khi thấy khách đưa thiếu tiền. Ô bỏ trống =
        // đưa 0 đồng = thiếu = ghi nợ. Xem dienKhachDaDua().
        const daDua = await dienKhachDaDua(bang, mongDoi, nghi);
        if (daDua.daDien) {
            // ⚠️ ĐỌC LẠI TỔNG. Gõ nhầm vào ô khác (ví dụ ô giảm giá) là tổng
            // đổi ngay — mà tổng mới sai thì hóa đơn sai tiền. Chờ tới khi
            // bảng vẽ xong rồi mới kết luận.
            for (let da = 0; da < hanBang && docTongTrongBang(bang) !== mongDoi; da += nhip) {
                await nghi(nhip);
            }
            const tongSau = docTongTrongBang(bang);
            if (tongSau !== mongDoi) {
                huyBang(bang);
                return {
                    ok: false, ma: MA.BANG_SAI_TONG,
                    thongBao: `Sau khi điền "Khách đã đưa" ${Number(mongDoi).toLocaleString('vi-VN')}đ `
                        + `thì tổng trong bảng đổi thành ${tongSau} — đã bấm Quay lại, CHƯA phát `
                        + 'hành gì. Có thể máy gõ nhầm sang ô khác.',
                };
            }
            // Bảng vừa vẽ lại; cho React kịp cập nhật công tắc Ghi nợ theo số mới.
            for (let da = 0; da < hanBang && kiemGhiNo(bang).bat; da += nhip) {
                await nghi(nhip);
            }
        }

        const gn = kiemGhiNo(bang);
        if (gn.bat) {
            huyBang(bang);
            return {
                ok: false, ma: MA.GHI_NO_DANG_BAT,
                thongBao: gn.lyDo === 'KHONG_NHAN_RA'
                    ? `Bảng xác nhận có ${gn.soCongTac} công tắc nhưng KHÔNG nhận ra cái nào là `
                      + '"Ghi nợ" — nhiều khả năng Tendoo đã đổi giao diện bảng này. Máy KHÔNG '
                      + 'đoán bừa: phát hành nhầm thành hóa đơn ghi nợ là sai bản chất khoản '
                      + 'thu, xóa đi cũng không sửa được. Đã bấm Quay lại, CHƯA phát hành gì.'
                    : 'Công tắc "Ghi nợ" trong bảng xác nhận đang BẬT — hóa đơn sẽ thành '
                      + 'ghi nợ, sai bản chất khoản thu. Đã bấm Quay lại, CHƯA phát hành gì.'
                      + (daDua.lyDo === 'KHONG_THAY_O'
                          ? ' (Máy KHÔNG tìm thấy ô "Khách đã đưa" để điền — giao diện Tendoo '
                            + 'có thể vừa đổi.)'
                          : daDua.lyDo === 'GO_KHONG_VAO'
                              ? ' (Máy có tìm thấy ô "Khách đã đưa" nhưng gõ số vào không ăn.)'
                              : ''),
            };
        }

        const nutXacNhan = timNutTheoChu(bang, CHU_NUT_XAC_NHAN);
        if (!nutXacNhan) {
            huyBang(bang);
            return {
                ok: false, ma: MA.KHONG_THAY_NUT_XAC_NHAN,
                thongBao: 'Không thấy nút "Xác nhận" trong bảng — CHƯA phát hành gì.',
            };
        }
        if (nutXacNhan.disabled) {
            huyBang(bang);
            return { ok: false, ma: MA.NUT_BI_KHOA,
                     thongBao: 'Nút "Xác nhận" đang bị khóa — CHƯA phát hành gì.' };
        }

        // ── BƯỚC 2: ĐÂY MỚI LÀ CÚ BẤM PHÁT HÀNH THẬT. ───────────────────────
        // Từ dòng này trở xuống, mọi kết quả xấu đều là "không rõ" chứ không
        // còn là lỗi thường — vì hóa đơn có thể đã lên cơ quan thuế rồi.
        nutXacNhan.click();
        // NHÌN giỏ cho tới khi trống, thay vì ngủ cứng 3 giây. Thường trống sau
        // ~0,3 giây. ⛔ KHÔNG nới chốt nào: vẫn phải THẤY giỏ trống mới coi là
        // XONG; hết hạn mà giỏ còn hàng thì vẫn là KHÔNG RÕ và treo lệnh lại.
        const hanGio = tuyChon.doiSauBam == null
            ? NhipDo.HAN_CHO_GIO_TRONG : tuyChon.doiSauBam;
        for (let da = 0; da <= hanGio; da += nhip) {
            if (B.gioDangTrong(tailieu)) break;
            if (da + nhip > hanGio) break;
            await nghi(nhip);
        }

        if (B.gioDangTrong(tailieu)) {
            return {
                ok: true, ma: MA.XONG, tongLucBam: mongDoi, daBoQuaThue,
                thongBao: 'Đã xác nhận thanh toán, giỏ đã trống — hóa đơn đã phát hành.'
                    + (daBoQuaThue ? ' ⚠ Phát hành khi CHƯA thiết lập quản lý thuế.' : ''),
            };
        }
        // ⚠️ CHỈ THÊM CHỮ, KHÔNG ĐỔI QUYẾT ĐỊNH. Vẫn là KHÔNG RÕ, vẫn treo lệnh,
        // vẫn cấm bấm lại. Tiền có thể đã lên cơ quan thuế rồi.
        return {
            ok: false, ma: MA.KHONG_RO, tongLucBam: mongDoi,
            thongBao: 'Đã bấm "Xác nhận" nhưng giỏ vẫn còn hàng sau ' + chuThoiGian(hanGio)
                + ' — KHÔNG RÕ hóa đơn đã phát hành hay chưa. Máy nhìn thấy: '
                + keLaiManHinh(tailieu) + '. Hãy mở Tendoo kiểm tra tận mắt. '
                + 'KHÔNG được bấm lại.',
        };
    }

    return {
        bam, daBam: () => daBam,
        daBoQuaThue: () => daBoQuaThue,
        daDongThongBao: () => daDongThongBao,
        soLanBamThanhToan: () => soLanBamThanhToan,
    };
}

const API = { taoLuot, timNutThanhToan, timBangXacNhan, timBangChanDuong, timNutTheoChu,
              timNutDongThongBao, tenCacNut, docDuongDan, keLaiManHinh, chuThoiGian,
              docTongTrongBang, ghiNoDangBat, kiemGhiNo, timODaDua, dienKhachDaDua,
              dangHien, MA, HAN_CHO_BANG_MS };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof globalThis !== 'undefined') globalThis.HDT_BamThanhToan = API;

})();
