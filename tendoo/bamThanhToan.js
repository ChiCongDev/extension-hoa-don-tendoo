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
    CA_CHUA_MO: 'CA_CHUA_MO',
    DA_BAM_ROI: 'DA_BAM_ROI',
    KHONG_HIEN_BANG: 'KHONG_HIEN_BANG',
    BANG_SAI_TONG: 'BANG_SAI_TONG',
    GHI_NO_DANG_BAT: 'GHI_NO_DANG_BAT',
    KHONG_THAY_NUT_XAC_NHAN: 'KHONG_THAY_NUT_XAC_NHAN',
    CHUA_THIET_LAP_THUE: 'CHUA_THIET_LAP_THUE',
    BANG_LA_CHAN_DUONG: 'BANG_LA_CHAN_DUONG',
    HOA_DON_DIEN_TU_TAT: 'HOA_DON_DIEN_TU_TAT',
};

const LA_NUT_THANH_TOAN = /thanh toán/i;
const LA_NUT_LUU_DON = /lưu đơn/i;
const LA_NUT_THANH_TOAN_TRUOC = /thanh toán trước/i;
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

// ── CA BÁN HÀNG CHƯA MỞ ─────────────────────────────────────────────────────
//
// Phần mềm bán hàng thường KHÓA nút Thanh toán khi ca chưa mở. Lúc ấy chờ bao
// lâu cũng vô ích — nút sẽ khóa cho tới khi có người bấm "Mở ca".
//
// Gặp thật 21/08/2026: hai lượt liền báo «Nút Thanh toán đang bị khóa», mất
// trọn 12.000.000đ (ki?n) và 9.612.236đ (hoa), không ra tờ nào. Câu ấy chẳng
// chỉ đường đi đâu, trong khi cách chữa chỉ là một cú bấm.
//
// ⛔ MÁY KHÔNG TỰ BẤM "Mở ca". Mở ca là hành vi nghiệp vụ có hệ quả trên sổ
// sách của chủ cửa hàng — không phải thứ một con máy tự quyết thay.
// ⚠️ 22/08/2026 Tendoo THAY GIAO DIỆN ngay trên /sales/pos: nút này giờ ghi
// "Vào ca", không còn là "Mở ca". Bản chốt hôm 21/08 dò đúng chữ cũ nên KHÔNG
// bắt được — và rất có thể đó mới là thủ phạm thật của hai lượt «nút Thanh
// toán đang bị khóa» sáng 21/08, làm mất trọn 12.000.000đ và 9.612.236đ.
//
// Vẫn SO CHỮ TUYỆT ĐỐI, chỉ thêm tên. Dò kiểu "chứa chữ ca" thì một dòng
// hướng dẫn cũng khớp, và máy sẽ đẩy người dùng đi mở một cái ca đang mở sẵn.
const CHU_MO_CA = /^(?:m[ởo]|v[àa]o)\s*ca$/i;
const CHU_DONG_CA = /^(?:[đd][óo]ng|k[ếe]t\s*th[úu]c|ra)\s*ca$/i;

/**
 * Trang có nút "Mở ca" đang hiện không — dấu hiệu ca ĐANG ĐÓNG.
 *
 * ⚠️ SO CHỮ TUYỆT ĐỐI, và loại luôn "Đóng ca". Dò kiểu "chứa chữ mở ca" thì
 * một nút "Đóng ca" hay một dòng hướng dẫn cũng khớp, và máy sẽ báo sai bệnh —
 * đẩy người dùng đi mở một cái ca đang mở sẵn.
 */
/**
 * Gỡ đồ trang trí ở HAI ĐẦU chuỗi trước khi so.
 *
 * ⚠️ Nút thật trên giao diện 22/08/2026 ghi "→ Vào ca" — có mũi tên đứng trước.
 * Mẫu neo đầu chuỗi trượt sạch, và tôi chỉ phát hiện khi dựng lại đúng cái nút
 * ấy để chạy thử. Nếu mũi tên là ảnh SVG thì không sao, nhưng nếu nó là KÝ TỰ
 * thì chốt "ca chưa vào" chết câm — đúng lúc cần nó nhất.
 *
 * ⛔ CHỈ gỡ ở HAI ĐẦU. Không đụng vào giữa, nên "Hướng dẫn vào ca" vẫn trượt
 * như phải thế — đây không phải nới lỏng.
 */
const gonVien = (t) => String(t || '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

function timNutMoCa(tailieu) {
    const D = boDo();
    try {
        return [...tailieu.querySelectorAll('button, [role=button], a')]
            .filter(b => !(b.closest && b.closest('.ant-modal, [role=dialog], .ant-drawer')))
            .find(b => {
                const t = gonVien(D.gonChu(b));
                return CHU_MO_CA.test(t) && !CHU_DONG_CA.test(t);
            })
            || null;
    } catch (e) { return null; }
}

const CHU_NUT_XAC_NHAN = 'Xác nhận';
const CHU_NUT_BO_QUA = 'Bỏ qua';
// ⛔ NÚT NÀY KHÔNG BAO GIỜ ĐƯỢC BẤM. Bấm vào là rời khỏi trang bán hàng,
// nhảy sang màn thiết lập thuế — đang giữa một lượt chạy hàng loạt thì hỏng hết.
const CHU_NUT_THIET_LAP_THUE = 'Thiết lập quản lý thuế';
/**
 * Nhãn nút HỦY bảng xác nhận. Nới rộng được vì bấm hủy KHÔNG phát hành gì —
 * ngược hẳn với nút "Xác nhận", chỗ duy nhất trong tệp này không được đoán.
 *
 * ⚠️ Bảng mới không có nút "Quay lại". Hủy không xong thì bảng nằm mở chình
 * ình, và cửa "giỏ phải trống" chặn luôn mọi lượt sau — đúng vòng luẩn quẩn
 * đã ăn trọn ngày 22/08/2026.
 */
const CHU_NUT_QUAY_LAI = 'Quay lại';
const CAC_NHAN_HUY = [/^quays*l[ạa]i$/i, /^h[ủu]y( b[ỏo])?$/i, /^[đd][óo]ng$/i,
                      /^cancel$/i, /^close$/i];
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
    const ungVien = cac.filter(b => {
        // Bỏ qua nút nằm trong bảng nổi. Trang POS thật lúc nào cũng có 2 bảng
        // quảng cáo đè lên, và bảng xác nhận cũng chứa chữ "thanh toán" ở tiêu
        // đề — quét cả trang là có ngày bấm nhầm sang "Trải nghiệm POS V2 ngay".
        if (b.closest && b.closest('.ant-modal, [role=dialog], .ant-drawer')) return false;
        const chu = D.gonChu(b);
        // ⛔ "Thanh toán trước" là nút KHÁC, không phải nút phát hành.
        return LA_NUT_THANH_TOAN.test(chu) && !LA_NUT_LUU_DON.test(chu)
            && !LA_NUT_THANH_TOAN_TRUOC.test(chu);
    });
    if (ungVien.length <= 1) return ungVien[0] || null;

    // ⚠️ CA HỎNG 31/10/2026, khách Trang Bé TB, ba lượt liền. Chân giỏ Tendoo
    // mọc thêm nút xám «Thanh toán trước» đứng TRƯỚC nút đỏ «Thanh toán & Xuất
    // hóa đơn (F1)». Bản cũ lấy nút ĐẦU TIÊN chứa chữ "thanh toán" nên bấm nhầm
    // nút xám, Tendoo mở bảng «Thanh toán trước» và máy dừng ở "bảng lạ".
    //
    // Còn nhiều ứng viên thì chỉ nhận nút mang chữ "Xuất hóa đơn", và chỉ khi
    // CHỈ CÓ MỘT. Vẫn không phân biệt được -> trả null (máy dừng, không bấm).
    // Thà dừng còn hơn đoán: nút này là nút dẫn tới hóa đơn thật.
    const xuat = ungVien.filter(b => CHU_XUAT_HOA_DON.test(D.gonChu(b)));
    return xuat.length === 1 ? xuat[0] : null;
}

/**
 * Phần tử có đang hiện không.
 *
 * Ant Design KHÔNG xóa bảng khỏi DOM khi đóng — nó đặt `display:none` lên
 * `.ant-modal-wrap`. Chữ bên trong vẫn đọc được như thường. Nhận diện "bảng
 * đang mở" bằng cách tìm chữ là sai: bảng đã đóng vẫn khớp. Phải xét display.
 * (Không dùng getClientRects vì môi trường test không dựng hình.)
 *
 * ⚠️ 31/10/2026: bảng xác nhận mới là một DRAWER trượt từ bên phải
 * (`payment-confirm-drawer`). Đóng rồi nó vẫn nằm trong trang, chỉ được ẩn bằng
 * CLASS `ant-drawer-content-wrapper-hidden` (CSS tính ra display:none) — KHÔNG
 * có `style="display:none"` nào cả. Bản cũ chỉ nhìn thuộc tính inline nên coi
 * bảng ĐÃ ĐÓNG là đang mở: sang khách kế tiếp, vừa bấm Thanh toán máy đã "thấy"
 * ngay bảng cũ trước khi bảng mới kịp mở. Đo trên trang thật.
 *
 * Nay hỏi thêm display đã tính của trình duyệt, và class ẩn của drawer. Chỉ làm
 * kiểm tra CHẶT hơn: phần tử nào trước đây bị coi là ẩn thì nay vẫn ẩn.
 */
const LA_LOP_AN = /(^|\s)ant-drawer-content-wrapper-hidden(\s|$)/;
function dangHien(e) {
    for (let n = e; n && n.style !== undefined; n = n.parentElement) {
        if (n.style.display === 'none' || n.style.visibility === 'hidden') return false;
        if (n.hasAttribute && n.hasAttribute('hidden')) return false;
        if (LA_LOP_AN.test(String(n.className || ''))) return false;
        try {
            const w = n.ownerDocument && n.ownerDocument.defaultView;
            if (w && w.getComputedStyle(n).display === 'none') return false;
        } catch (x) { /* không hỏi được thì dựa vào các dấu hiệu trên */ }
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
    // ⚠️⚠️ THÔNG BÁO NỔI CỦA TENDOO — QUÉT TOÀN TRANG, KHÔNG CHỈ TRONG BẢNG.
    //
    // Ngày 24/08/2026 người dùng NHÌN THẤY chữ «tạo đơn thất bại» trên màn hình
    // trong khi máy ghi "Tendoo nhận rồi mà không làm gì". Vì keRuotBang() chỉ
    // dò lỗi bên TRONG bảng, còn Ant Design vẽ message/notification vào một
    // portal ở CUỐI <body> — ngoài bảng. Máy mù đúng câu quan trọng nhất, và
    // tôi đã phải đoán suốt hai ngày trong khi Tendoo nói thẳng ra ngay đó.
    try {
        const D = boDo();
        const tin = [...tailieu.querySelectorAll(
            '.ant-message-notice-content, .ant-notification-notice, .ant-message, '
            + '.ant-notification, [role=alert], .ant-form-item-explain-error')]
            .map(e => D.gonChu(e)).filter(Boolean);
        // Ant lồng nhiều lớp cho CÙNG một tin: .ant-message > .ant-message-notice-content
        // > [role=alert] đều cho ra y hệt một chuỗi. Lọc "chuỗi con" thôi thì
        // KHÔNG đủ — ba chuỗi GIỐNG HỆT nhau không cái nào là con của cái nào,
        // nên phải bỏ trùng chính xác TRƯỚC, rồi mới bỏ chuỗi con.
        const rieng = [...new Set(tin)];
        const gon = rieng.filter(t => !rieng.some(k => k !== t && k.includes(t)))
            .map(t => t.slice(0, 160)).slice(0, 3);
        if (gon.length) phan.push('Tendoo báo: ' + gon.map(x => '«' + x + '»').join(' / '));
    } catch (e) { /* kể được gì hay nấy */ }
    // ⚠️ TRẠNG THÁI CA. Nút "Vào ca" còn hiện nghĩa là ca chưa mở — một trong
    // hai nghi phạm của việc Tendoo lặng lẽ từ chối tạo đơn. Ghi lại để lần sau
    // khẳng định hoặc loại bỏ được ngay, thay vì ngồi suy tiếp.
    try {
        phan.push(timNutMoCa(tailieu) ? 'ca CHƯA mở (trang còn hiện nút mở ca)' : 'ca đang mở');
    } catch (e) { /* kể được gì hay nấy */ }
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

/**
 * Phần tử này có CÒN NẰM TRONG TRANG không.
 *
 * ⚠️ ĐÂY LÀ CHỐT CHẶN QUAN TRỌNG NHẤT CỦA CẢ BẢN VÁ NÀY. Bấm vào một nút đã bị
 * React tháo khỏi trang thì sự kiện KHÔNG tới được React: không lỗi, không
 * cảnh báo, im lặng tuyệt đối. Bảng vẫn mở, giỏ vẫn nguyên — nhìn y hệt như
 * Tendoo đang xử lý chậm.
 *
 * Gặp thật 20/08/2026, khách "hoa", tờ thứ 5/6: bấm "Xác nhận" xong 8 giây
 * không có gì xảy ra, và chủ dự án kiểm Tendoo thì chỉ có 4 tờ.
 */
function conTrongTrang(tailieu, e) {
    try { return !!(e && tailieu && tailieu.contains && tailieu.contains(e)); }
    catch (x) { return false; }
}

/** Nút đang quay vòng chờ — dấu hiệu Tendoo ĐANG LÀM, chưa phải đã xong. */
function dangQuay(e) {
    if (!e) return false;
    const lop = String((e.className && e.className.baseVal) || e.className || '');
    if (/(^|\s)(ant-btn-loading|is-loading|loading)(\s|$)/.test(lop)) return true;
    if (e.getAttribute && (e.getAttribute('aria-busy') === 'true'
        || e.getAttribute('data-loading') === 'true')) return true;
    try { return !!e.querySelector('.ant-btn-loading-icon, .anticon-loading, .ant-spin'); }
    catch (x) { return false; }
}

/**
 * KỂ RUỘT BẢNG XÁC NHẬN — không chỉ "bảng vẫn đang mở".
 *
 * ⚠️ Bản hôm 20/08 kể được CÁI VỎ mà chưa kể được RUỘT: nó nói "bảng xác nhận
 * VẪN đang mở" nhưng không nói nút có đang quay không, có dòng lỗi đỏ nào
 * không. Mà đúng ba thứ đó mới phân biệt được "Tendoo đang xử lý" với "Tendoo
 * đã từ chối" — hai chuyện dẫn tới hai kết luận NGƯỢC NHAU về việc tiền đã ra
 * hay chưa.
 */
function keRuotBang(bang) {
    const phan = [];
    try {
        const D = boDo();
        // ⚠️ XẾP NÚT CÓ CHỮ LÊN TRƯỚC. Bảng xác nhận mới có 8 nút "gợi ý tiền"
        // toàn con số đứng trên cùng; cắt danh sách ở 8 là chúng chiếm sạch chỗ
        // và NÚT THẬT bị cắt mất. Log 10:45 ngày 23/08/2026 kể ra đúng 8 con số
        // rồi hết — làm tôi đi tìm nhầm bệnh mất một vòng.
        const chiSo = (t) => MAU_TIEN_TRONG_BANG.test(t);
        const nut = [...bang.querySelectorAll('button, [role=button]')]
            .map(b => {
                const t = D.gonChu(b);
                if (!t) return null;
                const co = [];
                if (b.disabled) co.push('khóa');
                if (dangQuay(b)) co.push('ĐANG QUAY');
                return { t, chu: '«' + t + '»' + (co.length ? '(' + co.join(',') + ')' : '') };
            })
            .filter(Boolean)
            .sort((a, b) => (chiSo(a.t) ? 1 : 0) - (chiSo(b.t) ? 1 : 0))
            .map(x => x.chu)
            .slice(0, 14);
        if (nut.length) phan.push('nút trong bảng: ' + nut.join(' / '));
    } catch (e) { /* kể được gì hay nấy */ }
    try {
        const D = boDo();
        const loi = [...bang.querySelectorAll(
            '.ant-form-item-explain-error, .ant-alert-message, .ant-alert-description, [role=alert]')]
            .map(e => D.gonChu(e)).filter(Boolean).slice(0, 3);
        if (loi.length) phan.push('bảng báo lỗi: ' + loi.map(x => '«' + x + '»').join(' / '));
    } catch (e) { /* kể được gì hay nấy */ }
    try {
        const t = docTongTrongBang(bang);
        if (t != null) phan.push('tổng trong bảng ' + Number(t).toLocaleString('vi-VN') + 'đ');
    } catch (e) { /* kể được gì hay nấy */ }
    try {
        const g = kiemGhiNo(bang);
        // ⚠️ KHÔNG được viết "tắt" khi thật ra CHƯA KIỂM ĐƯỢC GÌ. Câu "Ghi nợ
        // tắt" trong log 10:45 ngày 23/08/2026 là một câu SAI — lúc ấy ô đang
        // tick, chỉ là bộ dò không nhìn thấy ô tick. Nó đánh lừa cả người đi sửa.
        phan.push('Ghi nợ ' + (g.bat
            ? (g.lyDo === 'KHONG_NHAN_RA' ? 'KHÔNG NHẬN RA (' + g.soCongTac + ' nút bật/tắt)'
                                          : 'ĐANG BẬT')
            : (g.daKiem ? 'đã kiểm: tắt' : 'KHÔNG thấy nút Ghi nợ nào để kiểm')));
    } catch (e) { /* kể được gì hay nấy */ }
    try {
        const o = timODaDua(bang);
        phan.push(o ? 'ô tiền khách trả đang là "' + String(o.value) + '"'
                    : 'KHÔNG tìm thấy ô tiền khách trả');
    } catch (e) { /* kể được gì hay nấy */ }
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
/**
 * Những chữ Tendoo có thể dùng cho dòng TỔNG trong bảng xác nhận.
 *
 * ⚠️ 22/08/2026 Tendoo thay giao diện và chữ "Tổng cộng" biến mất khỏi bảng —
 * máy đọc ra `null` rồi dừng ở chốt cuối cùng trước khi ra tiền thật.
 *
 * ⚠️ VÌ SAO NỚI DANH SÁCH Ở ĐÂY LÀ AN TOÀN, TRONG KHI Ở CHÂN GIỎ THÌ KHÔNG.
 * Chân giỏ: máy LẤY con số đó làm tổng -> đọc nhầm là ra hóa đơn sai tiền.
 * Bảng xác nhận: máy chỉ SO SÁNH với con số đã tính từ trước -> đọc nhầm thì
 * kết quả là "không khớp" rồi DỪNG, không đời nào thành hóa đơn sai.
 *
 * Điều kiện vẫn nguyên vẹn: "bảng phải hiện ĐÚNG con số này".
 */
const CAC_NHAN_TONG = [
    // Xếp NHÃN DÀI TRƯỚC cho phần kể lại dễ đọc; mỗi nhãn vẫn dò độc lập.
    // "Khách cần trả" và "Tổng tiền hàng" đọc được từ trang thật 22/08/2026 —
    // danh sách cũ ghi "Khách phải trả", trang lại ghi "cần", nên trượt sạch.
    'Tổng cộng', 'Tổng tiền hàng', 'Tổng tiền', 'Tổng thanh toán', 'Tổng đơn', 'Tổng',
    'Thành tiền', 'Khách cần trả', 'Khách phải trả', 'Cần trả', 'Phải trả', 'Phải thu',
    'Cần thanh toán',
];

/**
 * SỐ TIỀN ĐỨNG NGAY SAU MỘT NHÃN trong một đoạn chữ. Không có thì null.
 *
 * ⚠️⚠️ CA HỎNG THẬT 22:33 ngày 22/08/2026, khách ki?n. Bảng xác nhận hiện ĐÚNG
 * 1.450.000 ở khắp nơi mà máy vẫn từ chối phát hành. Con số nó đọc được là
 * **1** — nhặt từ chữ "(1 sản phẩm)" trong nhãn "Tổng tiền hàng (1 sản phẩm)".
 *
 * Bản cũ dò bằng `nhan + '[^\d]{0,20}?([\d.,]+)'`, ba lỗi chồng lên nhau:
 *   · `([\d.,]+)` nhận cả MỘT CHỮ SỐ TRẦN làm tiền. Tiền Việt trên POS luôn có
 *     dấu nhóm nghìn — "1" không bao giờ là một khoản tiền.
 *   · `[^\d]` KHÔNG vượt qua nổi một chữ số. Gặp "1" trong "(1 sản phẩm)" là
 *     tắc đường, không đời nào với tới 1.450.000 đứng ngay sau đó.
 *   · rồi `break` chốt luôn con số rác, không thử phần tử nào khác nữa.
 *
 * Cách chữa: tìm nhãn, rồi QUÉT TỚI TRƯỚC lấy số CÓ HÌNH DẠNG TIỀN — ít nhất
 * một nhóm ba chữ số. Chữ số lẻ nằm chen giữa không còn chặn đường được nữa.
 *
 * ⚠️ Tầm quét có giới hạn: nhãn cách con số quá xa thì chúng chẳng liên quan
 * gì tới nhau, và vơ bừa là đọc tiền của dòng khác.
 */
const MAU_TIEN_SAU_NHAN = /\d{1,3}(?:[.,]\d{3})+/;
const XA_NHAT_SAU_NHAN = 60;

function soTienSauNhan(chu, nhan) {
    const D = boDo();
    const t = String(chu == null ? '' : chu);
    const i = t.toLowerCase().indexOf(String(nhan).toLowerCase());
    if (i < 0) return null;
    const m = t.slice(i + String(nhan).length, i + String(nhan).length + XA_NHAT_SAU_NHAN)
        .match(MAU_TIEN_SAU_NHAN);
    return m ? D.docSoTien(m[0]) : null;
}

/** Mọi cặp (nhãn, số tiền) đọc được theo danh sách nhãn, không trùng. */
function docCacTongTheoNhan(bang) {
    const D = boDo();
    const ra = [];
    if (!bang || !bang.querySelectorAll) return ra;
    for (const nhan of CAC_NHAN_TONG) {
        const cac = [...bang.querySelectorAll('*')]
            .filter(e => e.textContent && e.textContent.includes(nhan))
            .sort((a, b) => a.children.length - b.children.length);
        for (const e of cac) {
            const so = soTienSauNhan(D.gonChu(e), nhan);
            if (so == null) continue;      // lá chỉ có chữ -> thử tới khối cha
            if (!ra.some(x => x.nhan === nhan && x.so === so)) ra.push({ nhan, so });
            break;
        }
    }
    return ra;
}

/** Số đọc được đầu tiên — dùng để KỂ LẠI, không dùng để quyết định. */
function docTongTrongBang(bang) {
    const cac = docCacTongTheoNhan(bang);
    return cac.length ? cac[0].so : null;
}

/**
 * BẢNG CÓ ĐANG HIỆN ĐÚNG SỐ TIỀN NÀY KHÔNG.
 *
 * ⛔ ĐÂY MỚI LÀ CÂU HỎI THẬT của chốt chặn — không phải "tổng trong bảng là
 * bao nhiêu". Hỏi đúng câu thì nới danh sách nhãn không nới lỏng được gì.
 */
function coTongDung(bang, mongDoi) {
    if (!Number.isFinite(Number(mongDoi))) return false;
    return docCacTongTheoNhan(bang).some(x => x.so === Number(mongDoi));
}

/**
 * KỂ RA MỌI SỐ TIỀN TRONG BẢNG, kèm chữ đứng ngay trước nó.
 *
 * ⚠️ Đây là thứ trả lời cho chính danh sách nhãn ở trên. Đoán trượt tên nhãn
 * thì lần chạy tới log tự nói ra tên đúng — khỏi chụp ảnh, khỏi mò. Lần thứ
 * năm tôi vá loại lỗ hổng "máy biết mà không chịu kể".
 */
function keCacSoTrongBang(bang) {
    try {
        const D = boDo();
        const cap = [];
        let nhan = '';
        for (const e of bang.querySelectorAll('*')) {
            if (e.children.length) continue;              // chỉ xét phần tử lá
            const t = D.gonChu(e);
            if (!t) continue;
            if (MAU_TIEN_TRONG_BANG.test(t)) {
                cap.push((nhan ? '«' + nhan.slice(0, 40) + '» ' : '') + t);
                nhan = '';
            } else {
                nhan = t;
            }
        }
        return cap.length ? cap.slice(0, 12).join(' · ') : 'không thấy số tiền nào';
    } catch (e) { return 'không đọc được'; }
}

/** Số tiền đứng MỘT MÌNH trong ô. */
const MAU_TIEN_TRONG_BANG = /^-?\d{1,3}(?:[.,]\d{3})+\s*(?:đ|vnd)?$/i;

/**
 * NHÃN CỦA Ô "TIỀN KHÁCH TRẢ" — Tendoo đã đổi chữ ít nhất một lần.
 *
 * ⚠️ CA HỎNG THẬT 10:45 ngày 23/08/2026, khách c?ng. Trang đổi nhãn từ
 * "Khách đã đưa" sang "Khách thanh toán", mẫu cũ chỉ dò "khách đã đưa" nên
 * trượt, ô nằm TRỐNG. Tendoo hiểu là khách đưa 0đ -> tự tick "Ghi nợ" 1.450.000
 * -> mà khách là "Khách lẻ" (vô danh, không ghi nợ được) -> bấm "Xác nhận" thì
 * Tendoo NHẬN rồi LẶNG LẼ TỪ CHỐI, không một câu báo lỗi. Giỏ còn nguyên, bảng
 * còn mở, máy đành TREO lệnh — trạng thái tốn công người nhất trong cả dự án.
 *
 * Một ô bỏ trống, ba tầng hậu quả. Nới nhãn ở đây rẻ hơn nhiều so với việc đó.
 */
const CHU_KHACH_DA_DUA =
    /kh[áa]ch\s*(?:[đd][ãa]\s*[đd][ưu]a|thanh\s*to[áa]n|tr[ảa])|ti[ềe]n\s*kh[áa]ch\s*[đd][ưu]a/i;

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

/**
 * MỌI KIỂU NÚT BẬT/TẮT — công tắc gạt VÀ ô tick.
 *
 * ⚠️ CA HỎNG THẬT 23/08/2026. Bản cũ chỉ hỏi `[role=switch], .ant-switch`.
 * Tendoo đổi "Ghi nợ" từ công tắc gạt sang Ô TICK VUÔNG, và mẫu ấy không khớp
 * cái nào — nên hàm trả về "không có công tắc nào", rồi tầng trên đem cái
 * "không tìm thấy" khai thành "Ghi nợ tắt". Log 10:45 ngày 23/08 ghi đúng câu
 * ấy trong khi ẢNH CHỤP CHO THẤY Ô ĐANG TICK.
 *
 * Máy nói chắc nịch một câu sai là loại hỏng tệ nhất — nó đánh lừa cả người
 * đang đi sửa nó.
 */
const CAC_MAU_CONG_TAC = '[role=switch], .ant-switch, [role=checkbox], '
    + '.ant-checkbox, .ant-checkbox-wrapper, input[type=checkbox]';

/** Mọi nút bật/tắt trong một khối, đã bỏ trùng (ô tick lồng trong wrapper). */
function cacCongTac(khoi) {
    const cac = [...khoi.querySelectorAll(CAC_MAU_CONG_TAC)];
    // `.ant-checkbox-wrapper > .ant-checkbox > input` là BA phần tử của CÙNG
    // một ô tick. Đếm cả ba thì "khối có nhiều hơn một công tắc" bắn oan, và
    // chốt sẽ từ chối phát hành với lý do sai hoàn toàn.
    return cac.filter(e => !cac.some(k => k !== e && k.contains && k.contains(e)));
}

/** Một nút bật/tắt có đang BẬT không — theo mọi cách Ant Design đánh dấu. */
function congTacBat(ct) {
    if (!ct) return false;
    if (ct.getAttribute('aria-checked') === 'true') return true;
    const lop = String(ct.className || '');
    if (/ant-switch-checked|ant-checkbox-checked|ant-checkbox-wrapper-checked/.test(lop)) return true;
    // Ô tick thật: hỏi thẳng thuộc tính `checked` của chính nó hoặc của ô con.
    try {
        if (ct.checked === true) return true;
        const o = ct.querySelector && ct.querySelector('input[type=checkbox]');
        if (o && o.checked === true) return true;
    } catch (e) { /* không hỏi được thì thôi */ }
    return false;
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
 *
 * ⚠️ BA TRẠNG THÁI, KHÔNG PHẢI HAI. Bản cũ gộp "không tìm thấy nút nào" vào
 * chung với "đã kiểm và thấy tắt", nên lời kể ghi thẳng "Ghi nợ tắt" trong khi
 * thật ra nó CHƯA HỀ KIỂM ĐƯỢC GÌ. Log 10:45 ngày 23/08/2026 nói đúng câu ấy
 * còn ảnh chụp cho thấy ô đang tick. `daKiem` là để không bao giờ nói bừa nữa.
 *
 * @returns {{bat: boolean, lyDo: string, daKiem: boolean, soCongTac?: number}}
 */
function kiemGhiNo(bang) {
    const D = boDo();
    const cacCt = cacCongTac(bang);
    // Không một nút bật/tắt nào trong bảng -> bảng này không có mục Ghi nợ
    // (giao diện cũ). Cho đi, NHƯNG ghi rõ là chưa kiểm được gì.
    if (!cacCt.length) return { bat: false, lyDo: 'KHONG_CO_NUT', daKiem: false };

    // Tìm nút nằm cùng khối với chữ "Ghi nợ". Đi ngược lên từng cấp cha, lấy
    // khối gần nhất có chứa nhãn — không quét cả bảng để khỏi vơ nhầm.
    for (const ct of cacCt) {
        let o = ct.parentElement;
        for (let cap = 0; o && cap < 4; cap++, o = o.parentElement) {
            const chu = D.gonChu(o);
            if (!CHU_GHI_NO.test(chu)) continue;
            // Khối này có nhãn Ghi nợ. Nhưng nếu nó chứa NHIỀU nút bật/tắt thì
            // không phân biệt được cái nào của nhãn nào -> không đoán.
            if (cacCongTac(o).length !== 1) break;
            return congTacBat(ct)
                ? { bat: true, lyDo: 'CT_BAT', daKiem: true }
                : { bat: false, lyDo: '', daKiem: true };
        }
    }

    // Có công tắc nhưng KHÔNG cái nào gắn được với nhãn "Ghi nợ".
    // Giao diện đã đổi khác với thứ mình biết -> từ chối, không đoán bừa.
    return { bat: true, lyDo: 'KHONG_NHAN_RA', soCongTac: cacCt.length };
}

const CHU_HOA_DON_DIEN_TU = /h[óo]a\s*đ[ơo]n\s*đi[ệe]n\s*t[ửu]/i;
// Chữ trên nút chỉ có khi công tắc BẬT — xem chú thích kiemHoaDonDienTu().
const CHU_XUAT_HOA_DON = /xu[ấa]t\s*h[óo]a\s*đ[ơo]n/i;

/**
 * CÔNG TẮC "HÓA ĐƠN ĐIỆN TỬ" CÓ ĐANG BẬT KHÔNG — chốt chống NÓI DỐI.
 *
 * ⚠️⚠️ VÌ SAO ĐÂY LÀ CHỐT QUAN TRỌNG NHẤT TỆP NÀY.
 * Ảnh chụp trang thật 22/08/2026, hai tấm cách nhau vài phút:
 *
 *   công tắc BẬT  -> nút đỏ ghi "Thanh toán & Xuất hóa đơn (F1)"
 *   công tắc TẮT  -> nút đỏ ghi "Thanh toán (F1)"          <-- KHÔNG xuất gì cả
 *
 * Tắt mà cứ bấm thì đơn VẪN CHỐT, máy vẫn ghi daBamThanhToan:true, sổ Sell vẫn
 * nhận dòng "đã ra hóa đơn", Telegram vẫn nhắn "đã ra hóa đơn" — mà KHÔNG có
 * hóa đơn nào lên cơ quan thuế. Máy không dừng, không kêu, nó NÓI DỐI trơn tru.
 * Đó là loại hỏng tệ nhất trong dự án này, và chính là thứ lichSuChay.js cảnh
 * báo ngay đầu tệp: "XONG KHÔNG ĐỒNG NGHĨA VỚI ĐÃ RA HÓA ĐƠN".
 *
 * ⚠️ TÌM THEO NHÃN, KHÔNG LẤY CÔNG TẮC ĐẦU TIÊN — đúng bài học đã trả giá ngày
 * 19/08/2026 với công tắc "Ghi nợ": vơ đại cái gặp trước rồi từ chối phát hành
 * với lý do sai hoàn toàn, hai khách liền.
 *
 * ⚠️ KHÔNG NHẬN RA -> COI NHƯ TẮT, tức là TỪ CHỐI. Ngả về phía an toàn: dừng
 * oan thì mất một lượt, còn chốt đơn mà tưởng đã xuất hóa đơn thì sổ sách sai
 * và không ai biết để sửa.
 *
 * ⛔ MÁY KHÔNG TỰ BẬT CÔNG TẮC. Đó là quyết định có hệ quả thuế, cùng lý do với
 * việc không tự bấm "Vào ca".
 *
 * @returns {{bat: boolean, lyDo: string, soCongTac?: number}}
 */
function kiemHoaDonDienTu(tailieu) {
    const D = boDo();
    const trongBang = (e) => !!(e.closest
        && e.closest('.ant-modal, [role=dialog], .ant-drawer'));
    // Công tắc ở CHÂN GIỎ, không phải trong bảng nào. Bảng xác nhận có công tắc
    // "Ghi nợ" riêng — vơ nhầm sang đó là trả lời câu hỏi khác hẳn.
    const cacCt = [...tailieu.querySelectorAll('[role=switch], .ant-switch')]
        .filter(ct => !trongBang(ct));

    for (const ct of cacCt) {
        let o = ct.parentElement;
        for (let cap = 0; o && cap < 4; cap++, o = o.parentElement) {
            const chu = D.gonChu(o);
            if (!CHU_HOA_DON_DIEN_TU.test(chu)) continue;
            // Khối có nhãn nhưng chứa NHIỀU công tắc thì không biết cái nào của
            // nhãn nào -> không đoán.
            if (o.querySelectorAll('[role=switch], .ant-switch').length !== 1) break;
            return congTacBat(ct)
                ? { bat: true, lyDo: '' }
                : { bat: false, lyDo: 'CT_TAT' };
        }
    }

    // ⚠️ KHÔNG THẤY CÔNG TẮC NÀO gắn với nhãn — nhưng chưa chắc đã hỏng: giao
    // diện CŨ không có công tắc này, và ở đó nút "Thanh toán (F1)" vẫn xuất hóa
    // đơn qua bảng xác nhận. Nên hỏi DẤU HIỆU THỨ HAI: chữ trên chính cái nút.
    // Có "Xuất hóa đơn" -> chắc chắn đang ở chế độ xuất, cho đi.
    const nut = timNutThanhToan(tailieu);
    if (nut && CHU_XUAT_HOA_DON.test(D.gonChu(nut))) return { bat: true, lyDo: '' };
    // Không có công tắc nào trên trang -> giao diện cũ, giữ nguyên nếp cũ.
    if (!cacCt.length) return { bat: true, lyDo: '' };
    return { bat: false, lyDo: 'KHONG_NHAN_RA', soCongTac: cacCt.length };
}

/** Hủy sạch: bấm "Quay lại". Không có nút thì thôi, còn hơn bấm bừa. */
function huyBang(bang) {
    const D = boDo();
    const nut = timNutTheoChu(bang, CHU_NUT_QUAY_LAI);
    if (nut) { nut.click(); return true; }
    // Không có "Quay lại" -> thử các nhãn hủy khác, rồi mới tới dấu ✕ của Ant.
    const khac = [...bang.querySelectorAll('button, [role=button]')]
        .find(b => CAC_NHAN_HUY.some(r => r.test(D.gonChu(b))));
    if (khac) { khac.click(); return true; }
    const x = bang.querySelector(
        '.ant-modal-close, .ant-drawer-close, [aria-label="Close"], [aria-label="close"]');
    if (x) { x.click(); return true; }
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

        // ⚠️⚠️ NHỊP CHỜ DÙNG CHUNG cho ĐK 2, ĐK 3 và ĐK 4 — KHAI BÁO Ở ĐÂY,
        // TRƯỚC MỌI CHỖ DÙNG. Bản trước từng dùng một biến khai báo mãi phía
        // dưới, và nó ném ReferenceError đúng vào khoảnh khắc bệnh xảy ra, tức
        // là đúng lúc cần nó nhất. Vùng chết thời gian không tha ai.
        const nhipCho = tuyChon.nhipChoMs || NhipDo.NHIN_DOM;
        const hanCho = tuyChon.hanChoNutMo == null
            ? NhipDo.HAN_CHO_NUT_MO_KHOA : tuyChon.hanChoNutMo;

        // ── ĐK 2: giỏ phải có hàng ──────────────────────────────────────────
        //
        // ⚠️ CŨNG PHẢI BIẾT CHỜ. React vẽ lại bảng giỏ thì có một khe rất ngắn
        // trang trông như giỏ rỗng. Nhìn đúng một cái rồi kết luận là hỏng oan
        // cả khách — cùng loại bẫy với ĐK 3 và ĐK 4 bên dưới.
        for (let da = 0; da <= hanCho && B.gioDangTrong(tailieu); da += nhipCho) {
            if (da + nhipCho > hanCho) break;
            await nghi(nhipCho);
        }
        if (B.gioDangTrong(tailieu)) {
            return { ok: false, ma: MA.GIO_TRONG,
                     thongBao: 'Giỏ hàng đang trống — không có gì để phát hành.' };
        }

        // ── ĐK 3: tổng phải khớp TUYỆT ĐỐI ──────────────────────────────────
        //
        // ⚠️⚠️ CA HỎNG THẬT 09:02 ngày 24/08/2026, khách hoa: đã ra 4/6 tờ rồi
        // dừng với «Tổng trên màn hình (null)». boVaoGio() ngay trước đó ĐÃ CHỜ
        // và xác nhận tổng đúng bằng 1.980.000 — rồi chốt này đọc lại ĐÚNG MỘT
        // LẦN, trúng khe React đang vẽ dở, và nhận về null.
        //
        // `null` ở đây nghĩa là BA NGUỒN ĐỌC BẤT ĐỒNG (chân giỏ chậm hơn bảng
        // dòng một nhịp), không phải "giỏ sai tiền". Lưới đối chiếu ba nguồn
        // vẫn đáng giữ; thứ thiếu là sự kiên nhẫn đi kèm nó.
        //
        // Đây đúng loại lỗi đã lấy mất 12.000.000đ và 9.612.236đ ngày 21/08 ở
        // ĐK 4. Vá ĐK 4 xong mà để ĐK 3 ngay bên trên trơ trọi là vá nửa vời.
        //
        // ⚠️ CHỜ KHÔNG ĐỤNG VÀO TRANG nên an toàn tuyệt đối, và khớp rồi là đi
        // ngay — không tốn giây nào khi trang đã sẵn. Điều kiện vẫn nguyên vẹn:
        // KHỚP TUYỆT ĐỐI, lệch một đồng là dừng.
        const mongDoi = Number(tuyChon.tongMongDoi);
        if (Number.isFinite(mongDoi)) {
            for (let da = 0; da <= hanCho && B.docTongGio(tailieu) !== mongDoi; da += nhipCho) {
                if (da + nhipCho > hanCho) break;
                await nghi(nhipCho);
            }
        }
        const tongTrenManHinh = B.docTongGio(tailieu);
        if (!Number.isFinite(mongDoi) || tongTrenManHinh == null
            || tongTrenManHinh !== mongDoi) {
            return {
                ok: false, ma: MA.TONG_KHONG_KHOP,
                thongBao: `Tổng trên màn hình (${tongTrenManHinh}) không khớp tổng đã tính `
                    + `(${tuyChon.tongMongDoi}) sau ${chuThoiGian(hanCho)} — KHÔNG bấm Thanh toán.`
                    // ⚠️ Chữ «null» trơ trọi không nói được gì. Ba con số nói
                    // ngay ai lệch với ai — chẩn đoán 24/08 tốn của tôi một vòng
                    // thử nghiệm chỉ vì thiếu đúng dòng này.
                    + ` Máy đọc được: ${B.keTongGio(tailieu)}.`,
            };
        }

        // ── ĐK 3.5: PHẢI ĐANG Ở CHẾ ĐỘ XUẤT HÓA ĐƠN ────────────────────────
        //
        // ⚠️ Đặt TRƯỚC ĐK 4 chứ không phải sau: mọi đường dẫn tới cú bấm đều đi
        // qua đây, và chốt này không đụng vào trang nên xếp sớm bao nhiêu cũng
        // an toàn. Xếp sau là có ngày một nhánh trả về sớm đi vòng qua nó.
        //
        // ⚠️⚠️ CA HỎNG THẬT 31/10/2026 18:15, khách Hồng Huệ: «CÔNG TẮC "Hóa đơn
        // điện tử" đang TẮT» — trong khi cửa hàng này luôn để nó BẬT. Đo trên trang
        // thật 02/11/2026: mỗi đơn mới bắt đầu với công tắc TẮT, và chỉ khi Tendoo
        // tải xong cấu hình hóa đơn điện tử từ máy chủ nó mới TỰ BẬT. Ngay sau khi
        // mở trang (đúng cảnh mỗi lần đổi khách) giỏ đã có hàng và tổng đã khớp
        // trong khi công tắc còn tắt thêm ~270ms. Bản cũ nhìn ĐÚNG MỘT LẦN, trúng
        // khe ấy là dừng oan.
        //
        // Cùng loại bẫy với ĐK 2, 3 và 4: nên cùng một cách chữa — CHỜ, dùng chung
        // nhịp và hạn với ba chốt kia.
        //
        // ⛔ CHỜ CHỈ NHÌN, KHÔNG BẤM GÌ, KHÔNG TỰ BẬT CÔNG TẮC. Hết hạn mà công tắc
        // vẫn tắt thì DỪNG đúng như cũ: tắt thật vẫn bị chặn, chỉ không còn chặn oan
        // khi Tendoo mới chậm một nhịp.
        let hddt = kiemHoaDonDienTu(tailieu);
        for (let da = 0; !hddt.bat && da <= hanCho; da += nhipCho) {
            if (da + nhipCho > hanCho) break;
            await nghi(nhipCho);
            hddt = kiemHoaDonDienTu(tailieu);
        }
        if (!hddt.bat) {
            return {
                ok: false, ma: MA.HOA_DON_DIEN_TU_TAT,
                thongBao: hddt.lyDo === 'KHONG_NHAN_RA'
                    ? 'KHÔNG nhận ra công tắc "Hóa đơn điện tử" ở chân giỏ (thấy '
                        + (hddt.soCongTac || 0) + ' công tắc nhưng không cái nào gắn với nhãn ấy), '
                        + 'và nút bấm cũng không ghi "Xuất hóa đơn". Giao diện Tendoo có thể vừa '
                        + 'đổi. Máy KHÔNG bấm khi chưa chắc mình đang ở chế độ xuất hóa đơn — '
                        + 'chốt đơn mà không ra hóa đơn thì sổ sách sai và không ai biết để sửa. '
                        + 'CHƯA phát hành hóa đơn nào.'
                    : 'CÔNG TẮC "Hóa đơn điện tử" ở chân giỏ đang TẮT. Bấm lúc này chỉ chốt đơn '
                        + 'chứ KHÔNG xuất hóa đơn nào lên cơ quan thuế, trong khi máy vẫn ghi là '
                        + 'đã ra hóa đơn — sai sổ sách mà không ai biết. Hãy sang tab Tendoo BẬT '
                        + 'công tắc "Hóa đơn điện tử" rồi chạy lại. (Máy KHÔNG tự bật — đó là '
                        + 'quyết định có hệ quả thuế của bạn.) Máy đã chờ ' + chuThoiGian(hanCho)
                        + ' mà công tắc vẫn tắt; nếu cửa hàng này bình thường luôn để BẬT thì có thể '
                        + 'Tendoo chưa tải xong cấu hình hóa đơn điện tử — hãy tải lại (F5) tab '
                        + 'Tendoo rồi chạy lại. CHƯA phát hành hóa đơn nào.',
            };
        }

        // ── ĐK 4: nút phải có và không bị khóa ──────────────────────────────
        //
        // ⚠️ CA HỎNG THẬT 21/08/2026, hai lượt liền: «Nút Thanh toán đang bị
        // khóa», mất trọn 12.000.000đ và 9.612.236đ, không ra tờ nào.
        //
        // ⚠️ ĐÂY TỪNG LÀ CHỐT DUY NHẤT TRONG TỆP KHÔNG CÓ MỘT GIÂY KIÊN NHẪN
        // NÀO: nhìn `disabled` đúng một cái rồi hỏng cả khách. Mà ngay trước
        // đó boVaoGio() vừa kiểm chứng tổng giỏ khớp tuyệt đối rồi trả về,
        // KHÔNG nghỉ một nhịp — giỏ đã đúng, nhưng CHÂN TRANG là một mảnh giao
        // diện khác, React cập nhật chậm hơn một nhịp là chốt này bắn oan.
        //
        // Chờ ở đây KHÔNG bấm gì, nên an toàn tuyệt đối. Nút mở khóa là đi ngay,
        // không tốn giây nào khi trang đã sẵn.
        // ⚠️ NHỊP RIÊNG, KHÔNG DÙNG BIẾN `nhip` CHUNG CỦA HÀM NÀY. Nó khai báo
        // mãi phía dưới (sau cú bấm), nên dùng ở đây là VÙNG CHẾT THỜI GIAN —
        // ném ReferenceError đúng vào khoảnh khắc bệnh xảy ra, tức là đúng lúc
        // cần nó nhất. Đã dính thật lúc viết bản vá này, và bài test bắt được.
        // ⚠️ DÙNG CHUNG nhịp với ĐK 2 và ĐK 3 (khai báo ở đầu hàm). Ba chốt
        // liên tiếp cùng chờ một thứ — React vẽ xong — thì phải cùng một nhịp
        // và cùng một hạn, nếu không sửa hạn ở một chỗ là lệch hai chỗ kia.
        const nhipKhoa = nhipCho;
        const hanKhoa = hanCho;
        let nut = timNutThanhToan(tailieu);
        if (nut && nut.disabled) {
            for (let da = 0; da <= hanKhoa; da += nhipKhoa) {
                nut = timNutThanhToan(tailieu) || nut;
                if (!nut.disabled) break;
                if (da + nhipKhoa > hanKhoa) break;
                await nghi(nhipKhoa);
            }
        }
        if (!nut) {
            return { ok: false, ma: MA.KHONG_THAY_NUT,
                     thongBao: 'Không thấy nút Thanh toán — giao diện Tendoo có thể đã đổi.' };
        }
        if (nut.disabled) {
            // ⚠️ NÓI ĐÚNG BỆNH. "Nút đang bị khóa" không chỉ đường đi đâu cả,
            // trong khi cách chữa hay gặp nhất chỉ là một cú bấm "Mở ca".
            const moCa = timNutMoCa(tailieu);
            if (moCa) {
                return {
                    ok: false, ma: MA.CA_CHUA_MO,
                    thongBao: 'CA BÁN HÀNG CHƯA MỞ — trang Tendoo đang hiện nút "Mở ca", và '
                        + 'Tendoo khóa nút Thanh toán cho tới khi ca được mở. Hãy vào Tendoo '
                        + 'bằng đúng tài khoản này, bấm "Mở ca", rồi cho chạy lại. '
                        + '(Máy KHÔNG tự bấm Mở ca — đó là việc có hệ quả trên sổ sách của bạn.) '
                        + 'CHƯA phát hành hóa đơn nào.',
                };
            }
            return {
                ok: false, ma: MA.NUT_BI_KHOA,
                thongBao: 'Nút Thanh toán vẫn bị khóa sau ' + chuThoiGian(hanKhoa)
                    + '. Máy nhìn thấy: nút ghi «' + boDo().gonChu(nut) + '»; '
                    + 'KHÔNG thấy nút "Mở ca" nên ca có vẻ đang mở; ' + keLaiManHinh(tailieu)
                    + '. CHƯA phát hành hóa đơn nào.',
            };
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
        for (let da = 0; da < hanBang && !coTongDung(bang, mongDoi); da += nhip) {
            await nghi(nhip);
        }
        if (!coTongDung(bang, mongDoi)) {
            huyBang(bang);
            return {
                ok: false, ma: MA.BANG_SAI_TONG,
                thongBao: 'Bảng xác nhận KHÔNG hiện đúng số tiền đã tính ('
                    + Number(mongDoi).toLocaleString('vi-VN') + 'đ) — đã bấm Quay lại, CHƯA '
                    + 'phát hành gì. Máy nhìn thấy trong bảng: ' + keCacSoTrongBang(bang) + '.',
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
            for (let da = 0; da < hanBang && !coTongDung(bang, mongDoi); da += nhip) {
                await nghi(nhip);
            }
            const tongSau = docTongTrongBang(bang);
            if (!coTongDung(bang, mongDoi)) {
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

        // ⚠️ TÌM LẠI BẢNG TỪ TRANG SỐNG, ngay trước khi bấm.
        //
        // Biến `bang` được lấy từ trước bước điền "Khách đã đưa" — mà chính chú
        // thích ở bước ấy đã ghi "Bảng vừa vẽ lại". React vẽ lại thì cái tham
        // chiếu cũ có thể trỏ vào một bảng ĐÃ BỊ THÁO KHỎI TRANG, và nút tìm
        // trong đó là nút của một bảng không còn tồn tại. Bấm vào nó thì sự
        // kiện không tới được React: im lặng tuyệt đối.
        const bangSong = timBangXacNhan(tailieu) || bang;
        const nutXacNhan = timNutTheoChu(bangSong, CHU_NUT_XAC_NHAN);
        if (!nutXacNhan) {
            huyBang(bangSong);
            return {
                ok: false, ma: MA.KHONG_THAY_NUT_XAC_NHAN,
                thongBao: 'Không thấy nút "Xác nhận" trong bảng — CHƯA phát hành gì.',
            };
        }
        if (nutXacNhan.disabled) {
            huyBang(bangSong);
            return { ok: false, ma: MA.NUT_BI_KHOA,
                     thongBao: 'Nút "Xác nhận" đang bị khóa — CHƯA phát hành gì.' };
        }
        // ⛔ THÀ DỪNG CÒN HƠN BẤM VÀO KHOẢNG KHÔNG. Bấm vào nút đã rời khỏi
        // trang thì không có gì xảy ra, và máy sẽ ngồi đợi 8 giây rồi báo
        // "KHÔNG RÕ" — treo lệnh, bắt người đi kiểm tận mắt, trong khi CHẮC
        // CHẮN chưa phát hành gì. Ở đây nói thẳng được thì đừng để "không rõ".
        if (!conTrongTrang(tailieu, nutXacNhan)) {
            return {
                ok: false, ma: MA.KHONG_THAY_NUT_XAC_NHAN,
                thongBao: 'Nút "Xác nhận" tìm được nhưng KHÔNG còn nằm trong trang — bảng đã '
                    + 'bị vẽ lại. Bấm vào đó thì không có gì xảy ra cả. Máy dừng, CHƯA phát '
                    + 'hành gì.',
            };
        }

        // ── BƯỚC 2: ĐÂY MỚI LÀ CÚ BẤM PHÁT HÀNH THẬT. ───────────────────────
        // Từ dòng này trở xuống, mọi kết quả xấu đều là "không rõ" chứ không
        // còn là lỗi thường — vì hóa đơn có thể đã lên cơ quan thuế rồi.
        //
        // ⚠️ ĐẶT MỘT CÁI CHUÔNG — TRÊN TÀI LIỆU, KHÔNG PHẢI TRÊN NÚT.
        //
        // Ngày 20/08/2026 khách "hoa" hỏng mà ba khả năng nhìn từ ngoài giống
        // hệt nhau: cú bấm không tới được ai / Tendoo nhận rồi từ chối im lặng
        // / Tendoo đang xử lý chậm. Chuông tách khả năng đầu ra khỏi hai khả
        // năng sau, chỉ bằng một câu trong log.
        //
        // ⚠️ VÌ SAO PHẢI GẮN TRÊN TÀI LIỆU. Bản đầu tôi gắn chuông thẳng lên
        // nút — VÔ DỤNG: `nut.click()` luôn gọi người nghe gắn trên chính nút
        // đó, kể cả khi nút đã bị tháo khỏi trang. Chuông kêu 100% số lần, đo
        // đúng một thứ: rằng .click() có chạy. Gài lỗi "chuông luôn báo kêu"
        // thì không bài test nào đỏ — nó chưa từng đo được gì.
        //
        // React KHÔNG gắn người nghe lên từng nút; nó gắn một cái duy nhất ở
        // GỐC TÀI LIỆU rồi phân phát xuống. Nên "sự kiện có nổi tới tài liệu
        // không" mới đúng là "React có nhìn thấy cú bấm này không". Nút rời
        // trang, hoặc có ai đó chặn đường nổi lên, thì chuông im.
        //
        // ⛔ Chuông chỉ NGHE. Không bấm gì, không đổi gì, gỡ ra ngay sau đó —
        // không có cách nào sinh ra hóa đơn trùng.
        let chuongKeu = false;
        const nghePhat = (su) => { if (su.target === nutXacNhan) chuongKeu = true; };
        try { tailieu.addEventListener('click', nghePhat); } catch (e) { /* kệ */ }
        nutXacNhan.click();
        try { tailieu.removeEventListener('click', nghePhat); } catch (e) { /* kệ */ }
        // NHÌN giỏ cho tới khi trống, thay vì ngủ cứng 3 giây. Thường trống sau
        // ~0,3 giây. ⛔ KHÔNG nới chốt nào: vẫn phải THẤY giỏ trống mới coi là
        // XONG; hết hạn mà giỏ còn hàng thì vẫn là KHÔNG RÕ và treo lệnh lại.
        const hanGio = tuyChon.doiSauBam == null
            ? NhipDo.HAN_CHO_GIO_TRONG : tuyChon.doiSauBam;
        // ⚠️ CHỜ THEO TÍN HIỆU, KHÔNG THEO ĐỒNG HỒ. Phát hành hóa đơn điện tử
        // là gọi lên hệ thống thuế — chậm hơn mọi thao tác khác. Nút còn quay
        // nghĩa là Tendoo ĐANG LÀM, bỏ cuộc lúc ấy là treo lệnh oan. Ngược lại,
        // ngừng quay mà giỏ vẫn còn hàng thì kết luận ngay, không phí giây nào.
        //
        // ⛔ KHÔNG NỚI CHỐT NÀO: vẫn phải THẤY GIỎ TRỐNG mới coi là XONG, và
        // tuyệt đối KHÔNG bấm "Xác nhận" lần thứ hai dù chờ bao lâu.
        const hanQuay = tuyChon.hanChoQuay == null
            ? NhipDo.HAN_CHO_TENDOO_QUAY : tuyChon.hanChoQuay;
        let daCho = 0;
        for (; daCho <= hanGio; daCho += nhip) {
            if (B.gioDangTrong(tailieu)) break;
            if (daCho + nhip > hanGio) break;
            await nghi(nhip);
        }
        for (; !B.gioDangTrong(tailieu) && daCho <= hanGio + hanQuay; daCho += nhip) {
            if (!dangQuay(nutXacNhan)) break;      // Tendoo thôi làm -> kết luận ngay
            if (daCho + nhip > hanGio + hanQuay) break;
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
            chuongKeu,
            thongBao: 'Đã bấm "Xác nhận" nhưng giỏ vẫn còn hàng sau ' + chuThoiGian(daCho)
                + ' — KHÔNG RÕ hóa đơn đã phát hành hay chưa. '
                // ⚠️ CÂU QUYẾT ĐỊNH. Chuông không kêu = cú bấm không tới được
                // nút = CHẮC CHẮN chưa phát hành gì. Chuông kêu = Tendoo đã
                // nhận và từ chối (hoặc đang làm) — bệnh nằm chỗ khác hẳn.
                + (chuongKeu
                    ? 'Cú bấm ĐÃ NỔI TỚI TRANG (React có nhìn thấy — Tendoo nhận rồi mà '
                      + 'không làm gì). '
                    : '⚠ Cú bấm KHÔNG NỔI TỚI TRANG — React không hề nhìn thấy nó, '
                      + 'gần như chắc chắn CHƯA phát hành gì. ')
                + 'Máy nhìn thấy: ' + keLaiManHinh(tailieu)
                + (bangSong ? '. Trong bảng: ' + keRuotBang(bangSong) : '')
                + '. Hãy mở Tendoo kiểm tra tận mắt. KHÔNG được bấm lại.',
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
              timNutDongThongBao, tenCacNut, docDuongDan, keLaiManHinh, chuThoiGian, gonVien,
              conTrongTrang, dangQuay, keRuotBang, timNutMoCa,
              kiemHoaDonDienTu, congTacBat, cacCongTac,
              docCacTongTheoNhan, coTongDung, keCacSoTrongBang, CAC_NHAN_TONG,
              soTienSauNhan,
              docTongTrongBang, ghiNoDangBat, kiemGhiNo, timODaDua, dienKhachDaDua,
              dangHien, MA, HAN_CHO_BANG_MS };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof globalThis !== 'undefined') globalThis.HDT_BamThanhToan = API;

})();
