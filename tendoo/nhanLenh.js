'use strict';

// ⚠️ TOÀN BỘ FILE NẰM TRONG MỘT PHẠM VI RIÊNG (hàm bọc ngoài).

(function () {

// ============================================================================
//  NHẬN LỆNH TỪ TRANG SELL — chạy trên trang POS Tendoo, giai đoạn 6
//
//  Tiến trình nền gửi tới một lệnh { maKH, tenKH, soTien }. File này làm việc
//  thật rồi trả kết quả về.
//
//  ⚠️ KHÔNG TỰ ĐĂNG NHẬP, KHÔNG TỰ ĐỔI TÀI KHOẢN.
//     Nó chỉ làm việc trên cửa hàng ĐANG mở. Khách nào không khớp cửa hàng đang
//     đăng nhập -> trả SAI_TAI_KHOAN để cả loạt dừng. Tự đăng nhập giữa chừng
//     nghĩa là tự ý rời khỏi tài khoản người dùng đang đứng — quá nguy hiểm cho
//     thứ sẽ thành hóa đơn thuế.
//
//  Công tắc "tự bấm Thanh toán" DÙNG CHUNG với bảng thử: tắt thì chỉ bỏ hàng
//  vào giỏ rồi dừng.
// ============================================================================

// Lối nạp chuẩn của dự án: chạy trong Node thì require, chạy trong Chrome
// thì lấy module đã được manifest nạp sẵn vào cùng phạm vi.
const ChiaHoaDonMacDinh = (typeof module !== 'undefined' && module.exports)
    ? require('../chung/chiaHoaDon') : globalThis.HDT_ChiaHoaDon;

const KHOA_CAI_DAT = 'hdt-cai-dat-bang-thu';
const LOAI_XU_LY = 'hdt-xu-ly-khach';
const LOAI_HOI_SAN_SANG = 'hdt-hoi-san-sang';
const LOAI_DON_GIO = 'hdt-don-gio';
const LOAI_CHUP_GIAO_DIEN = 'hdt-chup-giao-dien';

// ⚠️ PHẢI KHỚP với KET_QUA_KHONG_RO trong chung/hangDoi.js. Đây là mã DUY NHẤT
// nghĩa là "đã bấm Xác nhận mà không rõ kết quả" — và cũng là mã duy nhất máy
// KHÔNG được dọn giỏ, vì hóa đơn có thể đã ra thật.
const MA_KHONG_RO = 'KHONG_RO';

// ⚠️ TRẦN SỐ TỜ CHO MỘT KHÁCH. Chẻ nhỏ mà số tiền lớn bất thường thì một lệnh
// hóa thành hàng trăm hóa đơn — chạy cả tiếng, ăn hết hạn mức hóa đơn của gói
// dịch vụ, mà hóa đơn đã ra thì KHÔNG RÚT LẠI ĐƯỢC. Vượt mức này là từ chối
// NGAY TỪ ĐẦU, trước khi xuất tờ nào.
const SO_HOA_DON_TOI_DA = 40;

/**
 * Mọi bộ phận trang POS phải có thì mới coi là SẴN SÀNG.
 *
 * Thiếu bất kỳ cái nào cũng làm máy chết giữa chừng, mà chết giữa chừng thì tệ
 * hơn hẳn từ chối từ đầu: lúc đó giỏ có thể đã có hàng, tài khoản có thể đã đổi.
 */
const BO_PHAN_BAT_BUOC = [
    'HDT_BoNoi', 'HDT_DocSanPham', 'HDT_DanhTinh', 'HDT_GhepTien', 'HDT_BoGio',
    'HDT_ChiaHoaDon',    // lập kế hoạch chia hóa đơn — thiếu là không xuất được gì
    'HDT_DomReact',      // gõ vào ô nhập của React — thiếu là không bỏ được hàng
    'HDT_BamThanhToan',  // nơi DUY NHẤT được bấm Thanh toán
    'HDT_DoiTaiKhoan',   // đổi tài khoản giữa các khách
    'HDT_DauGio',        // dấu giỏ, để tự dọn đúng giỏ của mình
    'HDT_CaiDat',        // đọc công tắc và độ lệch
];

/**
 * Đọc trạng thái các công tắc.
 *
 * ⚠️ `docDuoc` KHÔNG PHẢI trang trí. "Đọc hỏng" và "công tắc tắt" là HAI CHUYỆN:
 *   · công tắc tắt  -> đúng ý người dùng, bỏ hàng vào giỏ rồi dừng là xong việc
 *   · đọc hỏng      -> mình KHÔNG BIẾT người dùng muốn gì
 * Trước đây gộp làm một: đọc hỏng -> tưởng là tắt -> bỏ giỏ rồi báo "Xong",
 * trong khi chẳng có hóa đơn nào. Đọc hỏng rất dễ xảy ra đúng sau khi tải lại
 * tab (đổi tài khoản), nên đây không phải trường hợp hiếm.
 *
 * Giữ nguyên luật cũ: đọc hỏng thì TUYỆT ĐỐI không bấm. Chỉ khác ở chỗ tầng trên
 * nay biết mà báo lỗi thay vì báo thành công.
 */
async function docCaiDat(chromeApi) {
    // Dùng chung bộ chuẩn hóa với tiến trình nền (chung/caiDat.js) để hai bên
    // không bao giờ hiểu khác nhau về cùng một gói cài đặt. Thiếu module thì
    // vẫn chạy được, nhưng ngả hết về phía KHÓA.
    const CD = globalThis.HDT_CaiDat;
    const khoaHet = () => (CD ? CD.khiDocHong()
        // Thiếu module thì `tranMoiHoaDon` KHÔNG có -> trần = 0 -> ra đúng một
        // hóa đơn như bản cũ. Ngả về phía LÀM ÍT HƠN, không phải chẻ bừa.
        : { tuBam: false, daHieu: false, xoaGioLa: false, boQuaThue: false,
            dungSai: 200000, tranMoiHoaDon: 0, docDuoc: false });

    const kho = chromeApi && chromeApi.storage && chromeApi.storage.local;
    if (!kho) return khoaHet();
    try {
        const k = await kho.get(KHOA_CAI_DAT);
        const c = k[KHOA_CAI_DAT] || {};
        if (CD) return CD.tuKho(c, true);
        return { tuBam: !!c.tuBam, daHieu: !!(c.tuBam && c.daHieu),
                 xoaGioLa: !!c.xoaGioLa, boQuaThue: !!c.boQuaThue,
                 dungSai: 200000, tranMoiHoaDon: 0, docDuoc: true };
    } catch (e) {
        // Không bao giờ mặc định về phía "được phép".
        return khoaHet();
    }
}

/**
 * DỌN GIỎ CÒN SÓT — chỉ dọn thứ do CHÍNH MÁY để lại.
 *
 * @param {object} boi  { tailieu, BoGio, DauGio, docDauGio, xoaDauGio, docCaiDat }
 * @returns {Promise<{ok:boolean, ma:string, daXoa:number, thongBao:string}>}
 */
async function donGioConSot(boi) {
    const { tailieu, BoGio, DauGio } = boi;
    const cacDong = BoGio.docCacDongGio(tailieu);
    if (!cacDong.length) return { ok: true, ma: 'GIO_DA_TRONG', daXoa: 0, thongBao: '' };

    const dau = await boi.docDauGio();
    const tongGio = BoGio.docTongGio(tailieu);
    const kt = DauGio.khopVoiGio(dau, cacDong, tongGio);

    const caiDat = await boi.docCaiDat();
    if (!kt.khop && !caiDat.xoaGioLa) {
        // Giỏ KHÔNG phải của máy -> đây là hàng người dùng đang chọn dở. Xóa đi
        // là làm hỏng việc thật của họ, không phải phiền vặt. Dừng và hỏi.
        return {
            ok: false, ma: 'GIO_LA', daXoa: 0,
            thongBao: `Giỏ hàng trên tab Tendoo đang có ${cacDong.length} món KHÔNG PHẢI do máy `
                + `bỏ vào (${kt.lyDo}). Máy không tự xóa hàng bạn tự chọn. Hãy tự dọn giỏ, `
                + 'hoặc bật "Tự xóa giỏ kể cả khi không phải giỏ của máy" trong popup.',
        };
    }

    const don = await BoGio.xoaSachGio(tailieu);
    if (!don || !don.ok) {
        return { ok: false, ma: 'KHONG_DON_DUOC_GIO', daXoa: 0,
                 thongBao: (don && don.thongBao) || 'Không dọn được giỏ' };
    }
    await xoaDau(boi);
    return {
        ok: true, ma: kt.khop ? 'DA_XOA_GIO_CUA_MAY' : 'DA_XOA_GIO_LA', daXoa: cacDong.length,
        thongBao: kt.khop
            ? `Đã tự dọn ${cacDong.length} món máy để lại từ lần chạy trước (${DauGio.moTa(dau)}).`
            : `Đã tự dọn ${cacDong.length} món trong giỏ theo công tắc "xóa cả giỏ lạ".`,
    };
}

/** Giỏ đã sạch thì dấu cũ hết nghĩa — giữ lại chỉ tổ nhận nhầm về sau. */
async function xoaDau(boi) {
    if (!boi.xoaDauGio) return;
    try { await boi.xoaDauGio(); } catch (e) { /* không chặn việc chính */ }
}

/**
 * Xử lý một lệnh. Trả về đúng hình dạng mà hàng đợi mong đợi:
 *   { ok:true, ketQua } | { ok:false, ma, thongBao }
 */
async function xuLyMotLenh(lenh, boi) {
    const { DieuPhoi, Kho, DanhTinh, DocSanPham, BoGio, BamThanhToan } = boi;
    // Bên gọi có thể truyền vào (để test riêng); không thì dùng bản mặc định.
    const ChiaHoaDon = boi.ChiaHoaDon || ChiaHoaDonMacDinh || globalThis.HDT_ChiaHoaDon;

    const caiDat = await boi.docCaiDat();
    if (caiDat.docDuoc === false) {
        // Không biết người dùng muốn gì thì KHÔNG được làm gì rồi báo "Xong".
        return {
            ok: false, ma: 'KHONG_DOC_DUOC_CAI_DAT',
            thongBao: 'Không đọc được cài đặt công tắc trên tab Tendoo (hay gặp ngay sau '
                + 'khi tải lại trang). CHƯA làm gì cả, chưa phát hành hóa đơn nào. Hãy thử lại.',
        };
    }
    const choBam = !!(BamThanhToan && caiDat.tuBam && caiDat.daHieu);

    // Kho tài khoản chỉ dùng để TRA mã cửa hàng của khách. Ở đây KHÔNG cần mật
    // khẩu vì không đăng nhập — nên kho khóa hay mở đều chạy được.
    const kho = await boi.docKhoTaiKhoan();
    const banGhi = kho && kho.khach && kho.khach[lenh.maKH];
    if (!banGhi || !banGhi.maCuaHang) {
        return { ok: false, ma: 'CHUA_KHAI_BAO',
                 thongBao: `Khách "${lenh.maKH}" chưa khai báo tài khoản Tendoo.` };
    }

    const boNoi = boi.taoBoNoi();
    const tailieu = boi.tailieu;

    // ── Cửa chặn 1a: cửa hàng đang mở có đúng khách này không ───────────────
    let danhTinh;
    try {
        danhTinh = DanhTinh.doc(await boNoi.layPhien());
    } catch (e) {
        return { ok: false, ma: 'SAI_TAI_KHOAN',
                 thongBao: 'Không đọc được tài khoản đang đăng nhập: ' + e.message };
    }
    const doiChieu = DanhTinh.doiChieu(danhTinh, banGhi.maCuaHang);
    if (!doiChieu.khop) {
        return {
            ok: false, ma: 'SAI_TAI_KHOAN',
            thongBao: `${doiChieu.lyDo}. Hãy đăng nhập Tendoo bằng tài khoản của `
                + `"${lenh.tenKH || lenh.maKH}" rồi chạy lại.`,
        };
    }

    // ── LẬP KẾ HOẠCH CHIA HÓA ĐƠN, RỒI MỚI XUẤT ─────────────────────────────
    //
    // ⚠️ ĐỔI CÁCH LÀM 2026-08-18 (lần hai). Bản trước cắt từng khúc ≤ trần rồi
    // ghép riêng từng khúc — sáu lần ghép là sáu cơ hội hỏng, mà hỏng ở lần thứ
    // năm thì bốn hóa đơn đã ra và KHÔNG RÚT LẠI ĐƯỢC. Khúc cuối ôm phần lẻ còn
    // rất dễ rơi vào mức không ghép nổi: hỏng vì CHÍNH CÁCH CHIA.
    //
    // Nay ghép MỘT LẦN cho cả doanh thu rồi chia số hàng ấy vào từng rổ — chia
    // rổ là phép cộng thuần túy, không có gì để hỏng. Xem chung/chiaHoaDon.js.
    //
    // Lập được kế hoạch mới đụng tới Tendoo. Không lập được thì bỏ qua khách
    // này, CHƯA xuất tờ nào, và chạy tiếp khách sau.
    const tran = Number(caiDat.tranMoiHoaDon) > 0 ? Math.round(Number(caiDat.tranMoiHoaDon)) : 0;
    const mucTieu = Math.round(Number(lenh.soTien));

    // ── Đọc kho hàng thật ───────────────────────────────────────────────────
    let hang;
    try {
        hang = await DocSanPham.layTatCa((t) => boNoi.goiTrangSanPham(t));
    } catch (e) {
        return { ok: false, ma: 'KHONG_DOC_DUOC_KHO', chuaLamGi: true,
                 thongBao: 'Không đọc được danh sách sản phẩm: ' + e.message };
    }

    // ── Cửa chặn 1b: kho hàng phải thuộc đúng cửa hàng đó ───────────────────
    if (!hang.maCuaHang || hang.maCuaHang.toLowerCase() !== danhTinh.maCuaHang.toLowerCase()) {
        return { ok: false, ma: 'SAI_TAI_KHOAN', chuaLamGi: true,
                 thongBao: 'Kho hàng đọc về không thuộc cửa hàng đang đăng nhập — đã dừng.' };
    }

    const keHoach = ChiaHoaDon.lapKeHoach({
        sanPham: hang.hang.map(h => ({ ma: h.id, ten: h.ten, gia: h.gia, ton: h.ton })),
        soTien: mucTieu,
        tran,
        ...(caiDat.dungSai != null ? { dungSai: caiDat.dungSai } : {}),
    });
    if (keHoach.ma !== 'OK') {
        // `chuaLamGi`: chắc chắn chưa đụng tới giỏ hàng, chưa phát hành gì. Cờ
        // này giữ cho hàng đợi khỏi TREO oan cả lượt vì một khách thiếu hàng.
        return { ok: false, ma: keHoach.ma, chuaLamGi: true,
                 thongBao: keHoach.thongBao, tongGanNhat: keHoach.tongGanNhat };
    }

    // ⚠️ TỪ CHỐI TRƯỚC KHI XUẤT TỜ NÀO. Hóa đơn đã ra thì không rút lại được,
    // nên mọi lời từ chối phải nói ra ở đây, lúc còn chưa đụng gì tới Tendoo.
    if (keHoach.soRo > SO_HOA_DON_TOI_DA) {
        return {
            ok: false, ma: 'QUA_NHIEU_HOA_DON', chuaLamGi: true,
            thongBao: `${tien(mucTieu)} chia theo trần ${tien(tran)} thành ${keHoach.soRo} hóa `
                + `đơn — quá mức cho phép (${SO_HOA_DON_TOI_DA}). CHƯA xuất tờ nào. `
                + 'Hãy nâng trần mỗi hóa đơn hoặc kiểm lại số tiền.',
        };
    }

    const cacHoaDon = [];      // từng tờ đã PHÁT HÀNH XONG
    let daXuat = 0;            // tổng tiền THẬT đã phát hành
    let lanCuoi = null;        // kết quả tờ gần nhất
    let daThuLai = false;      // đã dùng lượt thử lại chưa — TỐI ĐA MỘT LẦN

    for (let vong = 0; vong < keHoach.ro.length; vong++) {
        const roNay = keHoach.ro[vong];
        const to = await xuatMotHoaDon({
            boi, lenh, caiDat, choBam, tailieu,
            chon: roNay.chon,
            tongMongDoi: roNay.tong,
            danhTinh,
            // Tờ giữa loạt phải dọn giỏ; chỉ tờ cuối cùng của khách cuối cùng
            // mới được giữ giỏ lại cho người dùng xem tận mắt.
            conKhachPhiaSau: lenh.conKhachPhiaSau || vong < keHoach.ro.length - 1,
        });

        lanCuoi = to;

        if (!to.ok) {
            // ⚠️ TỜ HỎNG GIỮA CHỪNG -> DỌN GIỎ CỦA CHÍNH MÁY.
            // Không dọn thì giỏ bẩn chặn hết khách phía sau — đúng chuỗi đổ đã
            // xảy ra thật ngày 18/08: c?ng hỏng một tờ, ki?n và ti?n chết theo.
            // donGioConSot ĐỐI CHIẾU DẤU GIỎ trước, đúng hàng máy vừa bỏ mới
            // dọn; hàng người dùng bày dở thì tuyệt đối không đụng.
            let daDon = null;
            try { daDon = await donGioConSot(boi); } catch (e) { daDon = null; }
            const themLoiNhac = daDon && daDon.ok && daDon.daXoa
                ? ` Đã tự dọn ${daDon.daXoa} món máy vừa bỏ vào giỏ.`
                : '';

            // ── THỬ LẠI ĐÚNG MỘT LẦN khi giỏ có sẵn đơn dở ──────────────────
            //
            // ⚠️ Cảnh đã xảy ra thật ngày 19/08/2026, lượt 10:17. Trước khách
            // ĐẦU TIÊN máy đổi tài khoản nên tải lại tab, và Tendoo KHÔI PHỤC
            // đơn dở đang lưu trong tab "Mang về" — giỏ tự có lại 1 món 790.000
            // dù lúc kiểm trước cả loạt nó còn trống. Khách `ti?n` chết oan làm
            // vật hy sinh, ba khách sau chạy sạch vì giỏ đã được dọn.
            //
            // ⚠️ VÌ SAO THỬ LẠI Ở ĐÂY LÀ AN TOÀN — và đây là chỗ duy nhất:
            //   · GIO_KHONG_TRONG là chốt ĐẦU TIÊN của boVaoGio, trả về TRƯỚC
            //     khi đụng vào bất cứ thứ gì. Chắc chắn chưa bỏ hàng, chưa bấm
            //     Thanh toán, chưa có hóa đơn nào -> KHÔNG có nguy cơ trùng.
            //   · Chỉ thử lại khi việc DỌN GIỎ ĐÃ THÀNH CÔNG. Dọn không được
            //     thì thử lại cũng gặp đúng cái giỏ ấy, vô nghĩa.
            //   · TỐI ĐA MỘT LẦN cho cả lệnh. Không có vòng lặp.
            //   · Lần thử lại đi qua TOÀN BỘ chốt chặn như thường, không bỏ bước.
            //
            // ⛔ TUYỆT ĐỐI KHÔNG mở rộng sang mã lỗi khác. Mọi mã lỗi còn lại
            // đều có thể xảy ra SAU khi đã bấm gì đó, và thử lại lúc ấy là tự
            // tay tạo hóa đơn trùng.
            if (to.ma === 'GIO_KHONG_TRONG' && !daThuLai && daDon && daDon.ok) {
                daThuLai = true;
                vong--;                       // làm lại ĐÚNG rổ này
                continue;
            }

            // Những tờ đã ra KHÔNG RÚT LẠI ĐƯỢC — phải báo đúng số đã xuất thật,
            // nếu không Sell ghi 0 trong khi tiền đã ra thật.
            if (daXuat > 0) {
                return {
                    ok: false, ma: to.ma,
                    thongBao: `Đã phát hành ${cacHoaDon.length}/${keHoach.ro.length} hóa đơn `
                        + `(${tien(daXuat)}) rồi dừng: ${boCauChuaRaTo(to.thongBao)}${themLoiNhac}`,
                    ketQua: gopKetQua({ cacHoaDon, daXuat, mucTieu, keHoach, lanCuoi: to.ketQua }),
                };
            }
            // `chuaLamGi` CHỈ đúng khi chưa tờ nào ra. Có tờ rồi mà gắn cờ này
            // là nói dối hàng đợi, và nó sẽ cho chạy lại -> hóa đơn trùng.
            return {
                ...to,
                thongBao: String(to.thongBao || '') + themLoiNhac,
                chuaLamGi: to.ma === 'GIO_KHONG_TRONG' ? true : to.chuaLamGi,
            };
        }

        // Công tắc tự bấm TẮT -> chỉ bỏ giỏ rồi dừng, không có tờ nào ra.
        if (!to.ketQua.daBamThanhToan) return to;

        daXuat += Number(to.ketQua.tong) || 0;
        cacHoaDon.push(to.ketQua);
    }

    return {
        ok: true,
        ketQua: gopKetQua({ cacHoaDon, daXuat, mucTieu, keHoach,
                            lanCuoi: lanCuoi && lanCuoi.ketQua }),
    };
}

const tien = (n) => Number(n || 0).toLocaleString('vi-VN');

/**
 * BỎ CÂU "CHƯA PHÁT HÀNH HÓA ĐƠN NÀO" KHI THỰC TẾ ĐÃ CÓ TỜ RA.
 *
 * ⚠️ CA HỎNG THẬT 20/08/2026, khách "ti?n". Một dòng lỗi tự nói ngược nhau:
 *
 *     «Đã phát hành 4/6 hóa đơn (5.400.000) rồi dừng: … CHƯA phát hành hóa
 *      đơn nào.»
 *
 * Câu sau là của tầng dưới (đúng cho RIÊNG tờ thứ 5); câu đầu là của tầng này
 * (đúng cho CẢ LỆNH). Nối lại thành ra vô nghĩa.
 *
 * ⛔ VÌ SAO PHẢI SỬA, KHÔNG PHẢI CHUYỆN CHỮ NGHĨA: ai đọc tới cuối rồi tin
 * "CHƯA phát hành hóa đơn nào" sẽ cho chạy lại — và 4 tờ ĐÃ LÊN CƠ QUAN THUẾ
 * bị xuất trùng, không rút lại được. Câu này còn được đẩy nguyên vào lịch sử,
 * vào trang kế toán bên Sell, và vào tin nhắn Telegram.
 *
 * Chỉ cắt đúng câu ấy, giữ nguyên phần còn lại — phần còn lại mới là thứ nói
 * vì sao dừng.
 */
const CAU_CHUA_RA_TO = /\s*(?:Đã dừng,\s*)?CH[ƯU]A phát hành hóa đơn nào\.?/gi;
const boCauChuaRaTo = (chu) => String(chu || '').replace(CAU_CHUA_RA_TO, '').trim();



/**
 * Gộp nhiều tờ thành MỘT gói kết quả cho tầng trên.
 *
 * ⚠️ `tong` phải là TỔNG ĐÃ XUẤT THẬT — đây chính là con số dayVeSell đẩy sang
 * Sell. Lấy nhầm số của một tờ thì bảng kế toán thiếu tiền mà không ai biết.
 *
 * Một tờ thì gói này ra đúng hình dạng cũ, nên bản không chẻ nhỏ không đổi gì.
 */
function gopKetQua({ cacHoaDon, daXuat, mucTieu, keHoach, lanCuoi }) {
    // Gộp danh sách hàng theo mã, cộng số lượng — nhìn một chỗ là biết cả loạt
    // đã bán ra những gì.
    const theoMa = new Map();
    let soCai = 0;
    for (const t of cacHoaDon) {
        for (const d of t.chon || []) {
            soCai += Number(d.soLuong) || 0;
            const cu = theoMa.get(d.id);
            if (cu) {
                cu.soLuong += Number(d.soLuong) || 0;
                cu.thanhTien += Number(d.thanhTien) || 0;
            } else {
                theoMa.set(d.id, { ...d });
            }
        }
    }
    const chon = [...theoMa.values()];
    const nen = lanCuoi || {};
    return {
        ...nen,
        tong: daXuat,
        mucTieu,
        lech: daXuat - mucTieu,
        soCai,
        soLoai: chon.length,
        chon,
        soHoaDon: cacHoaDon.length,
        soHoaDonTheoKeHoach: keHoach ? keHoach.ro.length : cacHoaDon.length,
        soToHopKhacNhau: keHoach ? keHoach.soToHopKhacNhau : null,
        cacHoaDon: cacHoaDon.map((t) => ({
            tong: t.tong, soCai: t.soCai, soLoai: t.soLoai, tongTendoo: t.tongTendoo,
        })),
        tongTendoo: cacHoaDon.reduce((t, x) => t + (Number(x.tongTendoo) || 0), 0),
        daBoVaoGio: cacHoaDon.length > 0 || !!nen.daBoVaoGio,
        daBamThanhToan: cacHoaDon.length > 0,
        daBoQuaThue: cacHoaDon.some((t) => t.daBoQuaThue) || !!nen.daBoQuaThue,
    };
}

/**
 * PHÁT HÀNH ĐÚNG MỘT HÓA ĐƠN theo một rổ đã lập sẵn.
 *
 * ⚠️ KHÔNG CÒN GHÉP TIỀN Ở ĐÂY. Danh sách hàng và tổng tiền đã được chốt từ
 * trước ở chung/chiaHoaDon.js; việc của hàm này chỉ là bỏ vào giỏ, đối chiếu,
 * rồi bấm. Tách bạch như vậy thì mọi lời từ chối vì tính toán đều xảy ra TRƯỚC
 * khi có tờ nào ra.
 */
async function xuatMotHoaDon({ boi, lenh, caiDat, choBam, tailieu,
                               chon, tongMongDoi, danhTinh, conKhachPhiaSau }) {
    const { BoGio, BamThanhToan } = boi;

    // ── Bỏ hàng vào giỏ ─────────────────────────────────────────────────────
    const boVao = await BoGio.boVaoGio(tailieu, chon);
    if (!boVao.ok) {
        return { ok: false, ma: boVao.ma || 'KHONG_BO_DUOC_GIO', thongBao: boVao.thongBao };
    }

    // GHI DẤU NGAY sau khi bỏ vào giỏ, trước mọi bước có thể hỏng. Chạy hỏng
    // giữa chừng thì lần sau nhìn dấu là biết giỏ còn sót đúng là của mình, và
    // tự dọn được thay vì bắt người dùng sang tab Tendoo xóa tay.
    if (boi.ghiDauGio) {
        try {
            await boi.ghiDauGio({ maKH: lenh.maKH, danhSach: chon, tong: boVao.tongTendoo });
        } catch (e) { /* ghi dấu hỏng thì thôi, không chặn việc chính */ }
    }

    // ── Cửa chặn 2: tổng phải khớp tuyệt đối ────────────────────────────────
    if (boVao.tongTendoo !== tongMongDoi) {
        return {
            ok: false, ma: 'TONG_KHONG_KHOP',
            thongBao: `Tendoo hiện ${boVao.tongTendoo} nhưng mình tính ${tongMongDoi} — `
                + 'KHÔNG bấm Thanh toán.',
        };
    }

    const ketQua = {
        tong: tongMongDoi, soCai: chon.reduce((t, d) => t + Number(d.soLuong || 0), 0),
        soLoai: chon.length,
        cuaHang: danhTinh.maCuaHang, tenTaiKhoan: danhTinh.tenTaiKhoan,
        chon: chon.map((d) => ({ id: d.ma, ten: d.ten, gia: d.gia,
                                 soLuong: d.soLuong, thanhTien: d.thanhTien })),
        daBoVaoGio: true, daBamThanhToan: false, tongTendoo: boVao.tongTendoo,
    };

    // ── Bấm Thanh toán — chỉ khi công tắc BẬT ───────────────────────────────
    if (!choBam) {
        // Dọn dẹp thứ MÌNH vừa bày ra — và CHỈ khi còn khách phía sau. Khách
        // cuối thì giữ nguyên giỏ để người dùng kiểm tra tận mắt.
        if (conKhachPhiaSau) {
            const don = await BoGio.xoaSachGio(tailieu);
            ketQua.daDonGio = !!(don && don.ok);
            if (ketQua.daDonGio) await xoaDau(boi);   // giỏ sạch -> dấu hết nghĩa
            ketQua.chuThich = ketQua.daDonGio
                ? 'Đã bỏ hàng vào giỏ, kiểm tra xong rồi dọn để chạy khách kế tiếp.'
                : 'Bỏ hàng vào giỏ xong nhưng KHÔNG dọn được — khách kế tiếp sẽ bị chặn.';
            if (!ketQua.daDonGio) {
                return { ok: false, ma: 'KHONG_DON_DUOC_GIO', thongBao: ketQua.chuThich, ketQua };
            }
        } else {
            ketQua.chuThich = 'Công tắc tự bấm đang TẮT — hàng đã vào giỏ, bạn tự bấm Thanh toán.';
        }
        return { ok: true, ketQua };
    }

    const luot = BamThanhToan.taoLuot();
    const bam = await luot.bam(tailieu, {
        choPhep: true, tongMongDoi,
        // Bỏ qua cảnh báo thuế CHỈ khi người dùng bật tường minh. Mặc định tắt.
        boQuaCanhBaoThue: caiDat.boQuaThue === true,
    });
    if (bam.ok) {
        ketQua.daBamThanhToan = true;
        // Ghi lại để người dùng còn đối chiếu sổ sách: hóa đơn này ra trong lúc
        // tài khoản CHƯA thiết lập quản lý thuế.
        if (bam.daBoQuaThue) ketQua.daBoQuaThue = true;
        await xoaDau(boi);          // Tendoo tự dọn giỏ sau khi phát hành
        return { ok: true, ketQua };
    }
    // ── DỌN NGAY THỨ MÌNH VỪA BÀY RA ────────────────────────────────────────
    //
    // ⚠️ CA HỎNG THẬT 22/08/2026. Lượt 11:29 dừng ở bảng xác nhận (BANG_SAI_TONG)
    // rồi bỏ đi, ĐỂ NGUYÊN rổ đầu của khách "ki?n" (1.450.000đ) trong giỏ. Lượt
    // 12:25 tới, thấy giỏ không trống, chết ngay từ chốt đầu tiên. Và cứ thế mãi
    // — MỘT lỗi làm kẹt vô thời hạn mọi lượt sau.
    //
    // Máy vốn có đường dọn "lười": gặp giỏ bẩn ở đầu lượt sau thì dọn. Nhưng
    // đường ấy phải ĐỐI CHIẾU DẤU GIỎ để chắc hàng là của mình, và nó đã không
    // nhận ra. Dọn NGAY TẠI ĐÂY thì không cần đoán: máy vừa bỏ vào, nó biết.
    //
    // ⛔ TRỪ 'KHONG_RO'. Mã ấy nghĩa là ĐÃ BẤM "Xác nhận" mà không đọc được kết
    // quả — hóa đơn có thể đã lên cơ quan thuế. Giỏ phải giữ NGUYÊN để người
    // dùng mở Tendoo đối chiếu tận mắt. Dọn ở đó là xoá mất tang chứng của một
    // chuyện có thể đã xảy ra thật.
    //
    // Mọi mã lỗi còn lại đều xảy ra TRƯỚC cú bấm "Xác nhận" — chắc chắn chưa
    // phát hành gì, và hàng trong giỏ chắc chắn là của máy.
    let themChu = '';
    if (bam.ma !== MA_KHONG_RO) {
        const soMon = BoGio.docCacDongGio(tailieu).length;
        let don = null;
        try { don = await BoGio.xoaSachGio(tailieu); } catch (e) { don = null; }
        ketQua.daDonGio = !!(don && don.ok);
        if (ketQua.daDonGio) {
            await xoaDau(boi);                       // giỏ sạch -> dấu hết nghĩa
            if (soMon > 0) themChu = ` Đã tự dọn ${soMon} món máy vừa bỏ vào giỏ.`;
        } else {
            // ⚠️ PHẢI KÊU LÊN. Im lặng ở đây thì lượt sau chết vì giỏ bẩn mà
            // người đọc log không hiểu vì sao — đúng cái vòng luẩn quẩn 22/08.
            //
            // ⚠️⚠️ VÀ PHẢI MANG THEO LỜI KHAI CỦA xoaSachGio(). Bản 2.22.0 đã
            // làm nó kể ra mọi nút trong dòng giỏ — lớp CSS, nhãn, tên biểu
            // tượng — đúng thứ cần để biết giao diện Tendoo đổi ra sao. Nhưng
            // chỗ này chỉ đọc `don.ok` rồi NÉM `don.thongBao` đi, nên log 22:33
            // ngày 22/08/2026 chỉ còn trơ một câu "KHÔNG dọn được giỏ". Bằng
            // chứng dựng công phu, bị vứt đúng lúc cần nhất.
            const khai = String((don && don.thongBao) || '').trim();
            themChu = ' ⚠ KHÔNG dọn được giỏ — lượt sau sẽ bị chặn. Hãy sang tab Tendoo '
                + 'bấm "Xóa sạch giỏ" trên bảng nổi.'
                + (khai ? ' Máy nói: ' + khai : '');
        }
    }
    // Trả nguyên mã lỗi lên. Riêng KHONG_RO (đã bấm mà không biết kết quả) được
    // hàng đợi xử lý riêng: TREO lệnh và dừng cả loạt, xem KET_QUA_KHONG_RO.
    return { ok: false, ma: bam.ma, thongBao: String(bam.thongBao || '') + themChu, ketQua };
}

const API = { xuLyMotLenh, docCaiDat, donGioConSot, KHOA_CAI_DAT, MA_KHONG_RO,
              LOAI_XU_LY, LOAI_HOI_SAN_SANG, LOAI_DON_GIO, LOAI_CHUP_GIAO_DIEN };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof globalThis !== 'undefined') globalThis.HDT_NhanLenh = API;

// ── Gắn tai nghe trên MỌI trang seller-v3 ───────────────────────────────────
//
// Từ 2026-08-12 phạm vi được mở rộng ra cả `seller-v3.tendoo.vn/*` chứ không chỉ
// `/sales/pos`. Lý do: sau khi đăng nhập, trang được TẢI tại `/callback` rồi ứng
// dụng tự chuyển màn sang `/sales/pos` mà không tải lại — nếu chỉ chèn mã ở
// `/sales/pos` thì trang đó KHÔNG BAO GIỜ có mã của mình, hỏi gì cũng câm.
//
// Đổi lại, tai nghe này giờ nằm trên nhiều trang khác của Tendoo. Nên MỌI việc
// đụng tới giỏ hàng phải tự kiểm "có đúng đang ở trang bán hàng không" trước.
(function tuChay() {
    const G = globalThis;
    if (typeof G.location === 'undefined' || !G.document) return;
    if (!/(^|\.)tendoo\.vn$/i.test(String(G.location.hostname || ''))) return;
    if (!G.chrome || !G.chrome.runtime || !G.chrome.runtime.onMessage) return;

    const KHOA_KHO = 'hdt-kho-tai-khoan';
    /**
     * Đang đứng ở đúng trang bán hàng CŨ chứ không phải trang nào khác.
     *
     * ⚠️ PHẢI KHỚP CHÍNH XÁC `/sales/pos`, KHÔNG chấp nhận `/sales/pos-v2`.
     *
     * Tendoo thông báo ngày 18/08/2026: "hệ thống sẽ chuyển sang giao diện bán
     * hàng mới". Giao diện mới nằm ở /sales/pos-v2 với bộ chọn KHÁC HẲN. Phép
     * so cũ chỉ xét phần đầu chuỗi nên `pos-v2` cũng lọt — extension tự nhận là
     * SẴN SÀNG rồi chạy trên giao diện lạ bằng bộ chọn của giao diện cũ.
     *
     * Hậu quả đã thấy thật ngày 19/08: bốn khách hỏng, mỗi khách một kiểu —
     * không tìm thấy mặt hàng, đọc nhầm công tắc, bảng lạ chặn đường. Lần này
     * các cửa chặn bắt được hết nên không có hóa đơn sai, nhưng đó là nhờ thiết
     * kế chặt chứ không phải vì máy hiểu tình hình.
     *
     * ĐỨNG NHẦM TRANG THÌ TỪ CHỐI, đừng đoán. Máy không biết mình đang ở đâu mà
     * vẫn phát hành hóa đơn thuế là rủi ro không được phép có.
     */
    const laTrangPos = () => /^\/sales\/pos\/?$/.test(String(G.location.pathname || ''));

    /** Đang ở giao diện bán hàng MỚI (chưa hỗ trợ). Tách riêng để nói đúng bệnh. */
    const laTrangPosMoi = () => /^\/sales\/pos-v\d+/i.test(String(G.location.pathname || ''));

    /** Gom mọi bộ phận cần dùng. Một chỗ duy nhất, hai đường dùng chung. */
    const boPhan = () => {
        const luuDau = G.HDT_DauGio ? G.HDT_DauGio.taoLuuTru(G.chrome) : null;
        return {
            tailieu: G.document,
            DieuPhoi: G.HDT_DieuPhoi, Kho: G.HDT_KhoMatKhau,
            DanhTinh: G.HDT_DanhTinh, DocSanPham: G.HDT_DocSanPham,
            GhepTien: G.HDT_GhepTien, ChiaHoaDon: G.HDT_ChiaHoaDon,
            BoGio: G.HDT_BoGio,
            BamThanhToan: G.HDT_BamThanhToan, DauGio: G.HDT_DauGio,
            taoBoNoi: () => G.HDT_BoNoi.taoBoNoi(G.HDT_BoNoi.taoDocKhoTrang(G)),
            docCaiDat: () => docCaiDat(G.chrome),
            docKhoTaiKhoan: async () => {
                const k = await G.chrome.storage.local.get(KHOA_KHO);
                return k[KHOA_KHO] || null;
            },
            ghiDauGio: luuDau
                ? (x) => luuDau.ghi(G.HDT_DauGio.taoDau(x))
                : null,
            docDauGio: luuDau ? () => luuDau.doc() : async () => null,
            xoaDauGio: luuDau ? () => luuDau.ghi(null) : null,
        };
    };

    G.chrome.runtime.onMessage.addListener((tin, nguoiGui, traLoi) => {
        // Tin "hỏi sẵn sàng": trả lời NGAY để cầu nối biết trang này còn sống và
        // đã nạp đủ bộ phận. Không trả lời = tab đang giữ code của bản extension
        // cũ (chưa tải lại trang) -> phải báo rõ cho người dùng, không để họ đoán.
        if (tin && tin.loai === LOAI_HOI_SAN_SANG) {
            // ⚠️ PHẢI LIỆT KÊ ĐỦ MỌI BỘ PHẬN THẬT SỰ DÙNG TỚI.
            // Bản cũ chỉ xét 5 cái và THIẾU `HDT_DoiTaiKhoan` — nên một tab nạp
            // hụt vẫn được báo "sẵn sàng", rồi chết ở bước đổi tài khoản với câu
            // "Không xóa được trạng thái đăng nhập cũ". Gặp thật 2026-08-13.
            const thieu = BO_PHAN_BAT_BUOC.filter(t => !G[t]);
            // Đang ở trang khác của Tendoo thì CHƯA sẵn sàng, dù đủ bộ phận.
            // Không có dòng này, một trang /callback sẽ tự nhận là sẵn sàng và
            // cầu nối sẽ gửi lệnh bỏ hàng vào một trang không có giỏ nào.
            // Nói ĐÚNG BỆNH. "Đang ở trang khác" và "đang ở giao diện mới chưa hỗ
            // trợ" cần hai cách chữa khác hẳn nhau — gộp một câu là bắt người
            // dùng ngồi đoán, đúng cái bẫy đã dính nhiều lần trước.
            if (laTrangPosMoi()) {
                thieu.push('giao-dien-moi-chua-ho-tro:' + String(G.location.pathname || ''));
            } else if (!laTrangPos()) {
                thieu.push('dang-o-trang-khac:' + String(G.location.pathname || ''));
            }
            // Báo luôn trạng thái giỏ để cầu nối chặn NGAY từ đầu, thay vì để
            // xếp hàng đợi rồi mới lỗi ở khách đầu tiên.
            let gioTrong = null, soDongGio = 0;
            if (G.HDT_BoGio) {
                try {
                    soDongGio = G.HDT_BoGio.docCacDongGio(G.document).length;
                    gioTrong = soDongGio === 0;
                } catch (e) { gioTrong = null; }
            }
            traLoi({ sanSang: thieu.length === 0, thieu, gioTrong, soDongGio,
                     url: String(G.location.href || '') });
            return true;
        }
        // Xóa sạch trạng thái tài khoản cũ (bước 1 của đổi tài khoản).
        if (tin && tin.loai === 'hdt-xoa-trang-thai') {
            const bo = G.HDT_DoiTaiKhoan;
            // Nói rõ THIẾU BỘ PHẬN, đừng để tầng trên đoán. Thiếu bộ phận chữa
            // được bằng F5; localStorage bị chặn thì không.
            traLoi(bo ? bo.xoaTrangThaiCu(G)
                      : { ok: false, daXoa: [], thieuBoPhan: 'HDT_DoiTaiKhoan' });
            return true;
        }

        // Đọc mã cửa hàng đang đăng nhập (bước đối chiếu sau khi đổi).
        if (tin && tin.loai === 'hdt-lay-danh-tinh') {
            (async () => {
                try {
                    const bn = G.HDT_BoNoi.taoBoNoi(G.HDT_BoNoi.taoDocKhoTrang(G));
                    const dt = G.HDT_DanhTinh.doc(await bn.layPhien());
                    traLoi({ maCuaHang: (dt && dt.maCuaHang) || '',
                             tenTaiKhoan: (dt && dt.tenTaiKhoan) || '' });
                } catch (e) {
                    traLoi({ maCuaHang: '', tenTaiKhoan: '' });
                }
            })();
            return true;
        }

        // ── CHỤP GIAO DIỆN POS BẰNG CHỮ ─────────────────────────────────
        //
        // ⚠️ Ngày 22/08/2026 Tendoo thay giao diện và mọi khách hỏng cùng lúc.
        // Lúc ấy không có cách nào nhìn thấy trang: nó là ứng dụng React sau
        // đăng nhập, tải bằng lệnh chỉ ra cái vỏ rỗng. Mà extension thì ĐÃ Ở
        // SẴN TRONG TRANG — chỉ là chưa ai nghĩ tới việc bảo nó kể lại.
        //
        // ⛔ CHỈ ĐỌC. Không bấm gì, không điền gì, không phát hành gì.
        if (tin && tin.loai === LOAI_CHUP_GIAO_DIEN) {
            try {
                const C = G.HDT_ChupGiaoDien;
                if (!C) {
                    traLoi({ ok: false, thongBao: 'Thiếu bộ chụp giao diện — tải lại extension.' });
                } else {
                    traLoi({ ok: true, chu: C.chupGiaoDien(G.document, tin.tuyChon || {}) });
                }
            } catch (e) {
                traLoi({ ok: false, thongBao: 'Chụp hỏng: ' + ((e && e.message) || String(e)) });
            }
            return true;
        }

        // Dọn giỏ còn sót — chỉ dọn thứ do CHÍNH MÁY để lại.
        if (tin && tin.loai === LOAI_DON_GIO) {
            if (!laTrangPos()) {
                traLoi({ ok: false, ma: 'KHONG_PHAI_TRANG_POS', daXoa: 0,
                         thongBao: 'Tab Tendoo không ở trang bán hàng — không dọn gì cả.' });
                return true;
            }
            donGioConSot(boPhan()).then(traLoi).catch((e) => traLoi({
                ok: false, ma: 'NGOAI_LE', daXoa: 0,
                thongBao: 'Lỗi khi dọn giỏ: ' + (e && e.message ? e.message : String(e)),
            }));
            return true;
        }

        if (!tin || tin.loai !== LOAI_XU_LY) return false;

        // ⛔ CHỈ LÀM VIỆC Ở TRANG BÁN HÀNG. Tai nghe này nay nằm trên mọi trang
        // seller-v3; chạy lệnh ở trang khác là đọc một cái giỏ không tồn tại rồi
        // rút ra kết luận bừa. Từ chối thẳng, đừng cố.
        if (!laTrangPos()) {
            traLoi({ ok: false, ma: 'KHONG_PHAI_TRANG_POS',
                     thongBao: 'Tab Tendoo đang ở "' + String(G.location.pathname || '')
                        + '", không phải trang bán hàng. Đã dừng, chưa làm gì cả.' });
            return true;
        }

        xuLyMotLenh(tin.lenh, boPhan()).then(traLoi).catch((e) => traLoi({
            ok: false, ma: 'NGOAI_LE',
            thongBao: 'Lỗi bất ngờ trên trang Tendoo: ' + (e && e.message ? e.message : String(e)),
        }));

        return true;    // báo Chrome rằng sẽ trả lời bất đồng bộ
    });
})();

})();
