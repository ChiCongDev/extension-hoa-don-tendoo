'use strict';

// ⚠️ TOÀN BỘ FILE NẰM TRONG MỘT PHẠM VI RIÊNG (hàm bọc ngoài).
// Chrome nạp nhiều file vào CÙNG MỘT phạm vi — hai file cùng khai `const API`
// là file thứ hai nổ ngay khi nạp, và KHÔNG có lỗi nào hiện ra cho người dùng:
// popup chỉ đơn giản trống trơn. Đã dính đúng lỗi này một lần. Bọc lại để không
// bao giờ dính nữa. Xuất ra ngoài qua globalThis.HDT_* ở cuối file.

(function () {

// ============================================================================
//  GHÉP TIỀN — chọn tổ hợp sản phẩm có TỔNG GIÁ sát nhất với số tiền đích.
//
//  Hàm này THUẦN TÍNH TOÁN: không đụng DOM, không gọi mạng, không dùng API
//  trình duyệt. Nhờ vậy test được bằng Node ngoài Chrome, và không thể gây tác
//  dụng phụ. Mọi việc bấm/chọn trên Tendoo nằm ở file khác.
//
//  Bài toán: tổng con có giới hạn số lượng (bounded subset-sum).
//  Mẹo làm nhanh: mọi mức giá đều là bội của ƯCLN g (thực tế g = 10.000), nên
//  quy về "đơn vị g" là bảng quy hoạch động co lại hàng nghìn lần mà kết quả
//  vẫn TỐI ƯU TUYỆT ĐỐI — không phải ghép tham lam/ghép mò.
// ============================================================================

const KET_QUA = {
    OK: 'OK',
    KHONG_CO_HANG: 'KHONG_CO_HANG',       // không có sản phẩm nào còn bán được
    KHONG_DU_HANG: 'KHONG_DU_HANG',       // vét sạch kho vẫn không tới số tiền
    LECH_QUA_DUNG_SAI: 'LECH_QUA_200K',   // đủ hàng nhưng không ghép nổi vào dung sai
    QUA_LON: 'QUA_LON',                   // số tiền lớn bất thường, từ chối tính
};

const DUNG_SAI_MAC_DINH = 200000;
// TRẦN CỨNG DUY NHẤT LÀ 200.000, KHÔNG chặn theo tỷ lệ.
// Từng có thời gian chặn thêm 5% cho các khoản nhỏ; chủ dự án quyết bỏ vì nó
// từ chối quá nhiều khách nhỏ. Vẫn giữ tham số `tyLeToiDa` để ai cần thì bật
// lại (truyền vào lúc gọi), nhưng MẶC ĐỊNH LÀ TẮT.
//
// Bỏ chặn tỷ lệ KHÔNG làm kết quả kém sát đi: thuật toán luôn chọn phương án
// |lệch| nhỏ nhất, nên nới trần chỉ mở thêm những phương án XA HƠN — chúng chỉ
// được chọn khi không có gì gần hơn. Khách đang ghép được thì kết quả không đổi
// một đồng. Có test quét ngẫu nhiên khóa đúng điều này.
const TY_LE_TOI_DA_MAC_DINH = 0;
const VO_CUC = 0x7fffffff;

function ucln(a, b) {
    while (b) { const t = a % b; a = b; b = t; }
    return a;
}

/**
 * @param {object} thamSo
 * @param {Array<{ma:string, ten?:string, gia:number, ton:number}>} thamSo.sanPham
 * @param {number} thamSo.soTien   Số tiền đích (doanh thu của khách).
 * @param {number} [thamSo.dungSai=200000]  Lệch tối đa tuyệt đối.
 * @param {number} [thamSo.tyLeToiDa=0]  Chặn thêm theo tỷ lệ số tiền — MẶC ĐỊNH TẮT.
 *        Bật (ví dụ 0.05) thì dung sai thực = giá trị nhỏ hơn giữa hai cái.
 *        Mặc định tắt theo quyết định của chủ dự án: trần duy nhất là 200.000,
 *        không phân biệt hóa đơn lớn hay nhỏ.
 * @param {number} [thamSo.tranBoNho=5000000]  Chặn an toàn cho bảng quy hoạch động.
 * @returns {{ma:string, tong?:number, lech?:number, chon?:Array, thongBao:string}}
 */
function ghepSanPham({ sanPham, soTien, dungSai = DUNG_SAI_MAC_DINH,
                      tyLeToiDa = TY_LE_TOI_DA_MAC_DINH, tranBoNho = 5000000 }) {
    if (!Number.isFinite(soTien) || soTien <= 0) {
        return { ma: KET_QUA.KHONG_CO_HANG, thongBao: 'Số tiền không hợp lệ' };
    }

    // Dung sai THỰC. Mặc định `tyLeToiDa` = 0 -> đúng bằng trần tuyệt đối.
    const dungSaiThuc = (Number(tyLeToiDa) > 0)
        ? Math.min(dungSai, Math.floor(soTien * Number(tyLeToiDa)))
        : dungSai;

    // Loại sản phẩm không bán được. Giá/tồn phải là số nguyên dương.
    const hang = (sanPham || [])
        .map(sp => ({
            ma: sp.ma,
            ten: sp.ten || sp.ma,
            gia: Math.round(Number(sp.gia)),
            ton: Math.floor(Number(sp.ton)),
        }))
        .filter(sp => Number.isFinite(sp.gia) && sp.gia > 0 && Number.isFinite(sp.ton) && sp.ton > 0);

    if (hang.length === 0) {
        return { ma: KET_QUA.KHONG_CO_HANG, thongBao: 'Không có sản phẩm nào còn hàng để ghép' };
    }

    // Vét sạch kho vẫn không chạm nổi cận dưới -> thiếu hàng, không phải lệch.
    const giaTriKho = hang.reduce((t, sp) => t + sp.gia * sp.ton, 0);
    if (giaTriKho < soTien - dungSaiThuc) {
        return {
            ma: KET_QUA.KHONG_DU_HANG,
            thongBao: 'Không đủ hàng để ghép đủ số tiền',
            giaTriKho,
        };
    }

    // Quy về đơn vị ƯCLN của các mức giá.
    const g = hang.reduce((u, sp) => ucln(u, sp.gia), 0);
    const tran = soTien + dungSaiThuc;          // không bao giờ vượt quá mức này
    const cap = Math.floor(tran / g);       // số ô của bảng quy hoạch động

    if (cap > tranBoNho) {
        return { ma: KET_QUA.QUA_LON, thongBao: 'Số tiền quá lớn so với mức giá, không tính được' };
    }

    // Tách nhị phân: một sản phẩm còn 13 cái -> các gói 1, 2, 4, 6 cái. Nhờ vậy
    // bài toán "được lấy nhiều cái" quy về bài toán "mỗi gói lấy hoặc không lấy".
    const goi = [];
    hang.forEach((sp, chiSo) => {
        const nangW = Math.floor(cap / (sp.gia / g)); // lấy nhiều hơn cũng vượt trần
        let conLai = Math.min(sp.ton, nangW);
        let k = 1;
        while (conLai > 0) {
            const soCai = Math.min(k, conLai);
            goi.push({ chiSo, soCai, nang: (sp.gia / g) * soCai });
            conLai -= soCai;
            k *= 2;
        }
    });

    // Quy hoạch động: soCaiToiThieu[j] = ít cái nhất để đạt đúng j đơn vị tiền.
    // Tối thiểu hóa số cái => hóa đơn ít dòng hơn, đúng ý "ít sản phẩm hơn".
    //
    // ⚠️ Vì sao phải ghi dấu THEO TỪNG TẦNG (mỗi gói một tầng) chứ không chỉ ghi
    // "ô j do gói nào tạo ra":
    // Một ô có thể được cải thiện nhiều lần bởi nhiều gói khác nhau. Nếu chỉ giữ
    // gói cuối cùng rồi lần ngược, đường đi có thể quay lại DÙNG MỘT GÓI HAI LẦN
    // -> đề nghị lấy 19 cái trong khi kho chỉ còn 5. Lỗi này KHÔNG lộ ra ở tổng
    // tiền (tổng vẫn đúng), chỉ lộ khi kiểm tra tồn kho — test quét ngẫu nhiên
    // bắt được. Ghi dấu theo tầng rồi lần ngược từ tầng cao xuống thì mỗi gói
    // chỉ có thể được dùng đúng một lần.
    const soNhom = goi.length;
    const oMoiTang = cap + 1;
    if (soNhom * oMoiTang > 80000000) {
        return { ma: KET_QUA.QUA_LON, thongBao: 'Số tiền quá lớn so với mức giá, không tính được' };
    }

    const soCaiToiThieu = new Int32Array(oMoiTang).fill(VO_CUC);
    const daDung = new Uint8Array(soNhom * oMoiTang);   // daDung[i*oMoiTang + j]
    soCaiToiThieu[0] = 0;

    for (let i = 0; i < soNhom; i++) {
        const { nang, soCai } = goi[i];
        const goc = i * oMoiTang;
        for (let j = cap; j >= nang; j--) {
            const truoc = soCaiToiThieu[j - nang];
            if (truoc !== VO_CUC && truoc + soCai < soCaiToiThieu[j]) {
                soCaiToiThieu[j] = truoc + soCai;
                daDung[goc + j] = 1;
            }
        }
    }

    // Chọn tổng tốt nhất: |lệch| nhỏ nhất; hòa thì ưu tiên phương án THẤP HƠN.
    const canDuoi = Math.max(1, Math.ceil((soTien - dungSaiThuc) / g));
    let tot = -1, lechTot = Infinity;
    for (let j = canDuoi; j <= cap; j++) {
        if (soCaiToiThieu[j] === VO_CUC) continue;
        const lech = Math.abs(j * g - soTien);
        if (lech < lechTot) { lechTot = lech; tot = j; }
    }

    if (tot === -1) {
        // Đủ hàng nhưng không mức tổng nào rơi vào dung sai. Báo kèm mức gần nhất
        // để người dùng hiểu vì sao, thay vì chỉ nói "không được".
        let ganNhat = -1, lechGanNhat = Infinity;
        for (let j = 1; j <= cap; j++) {
            if (soCaiToiThieu[j] === VO_CUC) continue;
            const lech = Math.abs(j * g - soTien);
            if (lech < lechGanNhat) { lechGanNhat = lech; ganNhat = j; }
        }

        // Bảng chỉ dựng tới `soTien + dung sai`. Nếu MỌI sản phẩm đều đắt hơn
        // mức đó (số tiền 369.698 mà hàng rẻ nhất 490.000) thì không ô nào với
        // tới -> người dùng nhận lỗi trống trơn, không hiểu vì sao.
        // Khi đó mức đạt được gần nhất chính là món RẺ NHẤT lấy đúng 1 cái:
        // mọi tổ hợp khác đều lớn hơn nó.
        if (ganNhat === -1) {
            const reNhat = hang.reduce((m, sp) => Math.min(m, sp.gia), Infinity);
            return {
                ma: KET_QUA.LECH_QUA_DUNG_SAI,
                thongBao: `Không thể tạo hóa đơn vì chệnh nhau quá ${dungSaiThuc.toLocaleString('vi-VN')}`,
                dungSaiThuc,
                tongGanNhat: reNhat,
                lechGanNhat: reNhat - soTien,
            };
        }

        return {
            ma: KET_QUA.LECH_QUA_DUNG_SAI,
            thongBao: `Không thể tạo hóa đơn vì chệnh nhau quá ${dungSaiThuc.toLocaleString('vi-VN')}`,
            dungSaiThuc,
            tongGanNhat: ganNhat === -1 ? null : ganNhat * g,
            lechGanNhat: ganNhat === -1 ? null : lechGanNhat,
        };
    }

    // Lần ngược TỪ TẦNG CAO XUỐNG. Mỗi tầng ứng với một gói và chỉ được xét một
    // lần, nên không thể dùng trùng gói.
    const soLuongTheoSanPham = new Map();
    let j = tot;
    for (let i = soNhom - 1; i >= 0 && j > 0; i--) {
        if (!daDung[i * oMoiTang + j]) continue;
        const { chiSo, soCai, nang } = goi[i];
        soLuongTheoSanPham.set(chiSo, (soLuongTheoSanPham.get(chiSo) || 0) + soCai);
        j -= nang;
    }

    const chon = [...soLuongTheoSanPham.entries()]
        .map(([chiSo, soLuong]) => ({
            ma: hang[chiSo].ma,
            ten: hang[chiSo].ten,
            gia: hang[chiSo].gia,
            soLuong,
            thanhTien: hang[chiSo].gia * soLuong,
        }))
        .sort((a, b) => b.thanhTien - a.thanhTien);

    const tong = chon.reduce((t, d) => t + d.thanhTien, 0);

    return {
        ma: KET_QUA.OK,
        tong,
        lech: tong - soTien,
        soCai: chon.reduce((t, d) => t + d.soLuong, 0),
        chon,
        thongBao: `Đã ghép ${chon.length} loại, tổng ${tong.toLocaleString('vi-VN')}đ`,
    };
}

// Dùng được ở cả 2 nơi: content script trong Chrome (biến toàn cục) và Node (test).
if (typeof globalThis !== 'undefined') globalThis.HDT_GhepTien = { ghepSanPham, KET_QUA, DUNG_SAI_MAC_DINH, TY_LE_TOI_DA_MAC_DINH };
if (typeof module !== 'undefined' && module.exports) module.exports = { ghepSanPham, KET_QUA, DUNG_SAI_MAC_DINH, TY_LE_TOI_DA_MAC_DINH };
})();
