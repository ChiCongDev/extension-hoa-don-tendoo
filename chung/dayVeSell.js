'use strict';

// ============================================================================
//  ĐẨY KẾT QUẢ VỀ SELL — cho trang "Kế toán tổng hợp".
//
//  ⚠️ ĐÂY LÀ VIỆC PHỤ, TUYỆT ĐỐI KHÔNG ĐƯỢC LÀM HỎNG VIỆC CHÍNH.
//  Gửi hỏng, Sell sập, mất mạng, token sai — tất cả đều phải im lặng bỏ qua.
//  Đường phát hành hóa đơn KHÔNG ĐƯỢC phụ thuộc vào việc Sell có sống hay không.
//  Cùng nguyên tắc với `ghiLichSu` bên tiến trình nền.
//
//  ⚠️ GỬI CẢ HAI CHIỀU. Đã ra hóa đơn thì gửi, CHƯA ra cũng gửi kèm lý do —
//  yêu cầu của chủ dự án 2026-08-14. Bên Sell phải trả lời được "vì sao khách
//  này hôm đó không có hóa đơn".
//
//  ⚠️ NGÀY GỬI ĐI LÀ NGÀY SỐ LIỆU, không phải ngày máy chạy. Hai cái lệch nhau
//  khi hẹn giờ chạy lúc nửa đêm, và kế toán cần ngày số liệu.
// ============================================================================

(function () {

const DUONG_API = '/api/extension/hoa-don/ghi-nhan';

/** Kết quả nào tính là ĐÃ RA HÓA ĐƠN THẬT. Chỉ đúng một cái. */
const RA_HOA_DON = 'RA_HOA_DON';

/** "13/08/2026" -> "2026-08-13". Không đọc được -> null. */
function ngayISO(chuoi) {
    const s = String(chuoi || '').trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return s;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
}

/** Ngày của MÁY, dạng ISO — dùng khi bản ghi không kèm ngày số liệu. */
function ngayMay(luc) {
    const d = new Date(luc || Date.now());
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-`
        + `${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * TỜ NÀY THUỘC CỘT NÀO trên trang kế toán Sell.
 *
 * ⚠️ MỘT CHỖ QUYẾT ĐỊNH DUY NHẤT cho CẢ HAI đường gửi (gửi ngay sau mỗi khách,
 * và gửi lại ở cuối loạt). Viết luật hai lần là sớm muộn hai đường lệch nhau,
 * mà lúc ấy cùng một tờ hóa đơn nằm ở hai cột khác nhau tùy đường nào tới trước.
 *
 *   · 'tu_chon'  — người dùng có đặt số trong ô "tiền/ngày"
 *   · 'he_thong' — không đặt, tức xuất theo doanh thu (nếp mặc định)
 *
 * Sell mặc định 'he_thong' khi thiếu khoá, nên bản extension cũ vẫn chạy đúng
 * như trước — chỉ là mọi tờ của nó rơi vào cột "theo hệ thống".
 */
function kieuXuatCua(soTienDat) {
    return Number(soTienDat) > 0 ? 'tu_chon' : 'he_thong';
}

/**
 * Đổi một bản ghi lịch sử thành gói gửi đi.
 *
 * ⚠️ Bản ghi lịch sử KHÔNG mang mã lệnh của sổ ghi dấu, nên mã chống trùng được
 * dựng từ (thời điểm chạy + mã khách). Cùng một lượt chạy gửi lại bao nhiêu lần
 * cũng ra cùng một mã -> Sell cập nhật chứ không thêm dòng mới.
 */
function goiTuBanGhi(banGhi) {
    if (!banGhi || !Array.isArray(banGhi.khach)) return [];
    const ngay = (banGhi.ngay && ngayISO(banGhi.ngay.tu)) || ngayMay(banGhi.luc);
    const luc = Number(banGhi.luc) || Date.now();

    return banGhi.khach
        .filter(k => k && k.maKH)
        .map(k => ({
            ngay,
            ma_khach_hang: String(k.maKH),
            ten_khach_hang: String(k.tenKH || ''),
            // Đã ra hóa đơn thì gửi TỔNG TENDOO TÍNH (số tiền hóa đơn thật);
            // chưa ra thì gửi số tiền định xuất, để còn biết đáng ra là bao nhiêu.
            so_tien: k.ket === RA_HOA_DON && k.tongTendoo != null
                ? Number(k.tongTendoo) : Number(k.soTien || 0),
            // SỐ ĐỊNH XUẤT, chỉ kèm khi nó KHÁC số đã xuất thật. Ngày 24/08/2026
            // bảng ghi 7.000đ còn Telegram ghi 50.000đ cho cùng một khách —
            // hai con số đúng nghĩa khác nhau, nhưng không nói ra thì người đọc
            // không biết tin cái nào, và chuyện vượt trần lọt qua mắt.
            ...(k.ket === RA_HOA_DON && k.tongTendoo != null
                && Number(k.soTien || 0) > 0
                && Number(k.tongTendoo) !== Number(k.soTien)
                ? { so_tien_dinh: Number(k.soTien) } : {}),
            kieu_xuat: kieuXuatCua(k.soTienDat),
            ket_qua: String(k.ket || 'LOI'),
            ly_do: String(k.chiTiet || ''),
            // ⚠️ MÃ CHỐNG TRÙNG PHẢI GIỐNG NHAU Ở CẢ HAI ĐƯỜNG GỬI (gửi ngay
            // sau mỗi khách, và gửi lại ở cuối loạt). Id lệnh trong sổ ghi dấu
            // là thứ duy nhất ổn định cho việc đó. Khách chưa từng chạy (bỏ qua,
            // chưa chạy tới) không có id -> lùi về (thời điểm + mã khách).
            ma_lenh: k.maLenh ? String(k.maLenh) : `${luc}-${k.maKH}`,
            chay_luc: luc,
        }));
}

/**
 * Một dòng gửi đi, dựng từ TIN TIẾN ĐỘ của MỘT khách vừa xong.
 *
 * Đây là đường "gửi ngay sau mỗi khách". Trước đây máy chỉ gửi một lần ở CUỐI
 * loạt — loạt bị ngắt giữa chừng (Chrome đóng, máy sập) là những hóa đơn ĐÃ RA
 * THẬT cũng không sang được Sell: Tendoo có hóa đơn, trang kế toán trống.
 *
 * @returns {object|null} null nếu tin này chưa có gì để gửi (VD 'bat-dau')
 */
function dongTuTienDo(tienDo, ngay, luc) {
    const t = tienDo || {};
    const l = t.lenh || {};
    if (!l.maKH) return null;

    let ket = null;
    let soTien = Number(l.soTien) || 0;
    let lyDo = '';

    if (t.loai === 'xong') {
        const r = t.ketQua || {};
        // ⚠️ CHỈ "đã bấm Thanh toán" mới là ĐÃ RA HÓA ĐƠN. Bỏ vào giỏ thì không.
        ket = r.daBamThanhToan ? 'RA_HOA_DON' : 'VAO_GIO';
        if (r.daBamThanhToan && r.tong != null) soTien = Number(r.tong);
        if (!r.daBamThanhToan) lyDo = 'Công tắc tự bấm đang tắt nên máy dừng ở giỏ hàng.';
    } else if (t.loai === 'loi') {
        // ⚠️ HỎNG DỞ KHI CHẺ NHIỀU HÓA ĐƠN. Từ 2026-08-18 một khách có thể ra
        // NHIỀU tờ; hỏng ở tờ thứ 4 thì 3 tờ đầu ĐÃ RA THẬT và không rút lại
        // được. Ghi 'LOI' với số tiền của lệnh là nói sai theo hai hướng cùng
        // lúc: Sell không đếm đồng nào (chỉ 'RA_HOA_DON' mới tính) trong khi
        // tiền đã ra thật.
        //
        // Nên: có tờ nào đã ra thì báo ĐÚNG số đã ra, kèm lý do dừng. Dùng lại
        // 'RA_HOA_DON' chứ KHÔNG đặt trạng thái mới — Sell chỉ nhận danh sách
        // trạng thái có sẵn, mã lạ bị quy về 'LOI' và tiền lại mất.
        const r = t.ketQua || {};
        const daRa = Number(r.tong) || 0;
        if (r.daBamThanhToan && daRa > 0) {
            ket = 'RA_HOA_DON';
            soTien = daRa;
            const so = Number(r.soHoaDon) || 0;
            lyDo = (so > 1 ? `Ra ${so} hóa đơn rồi dừng. ` : 'Đã ra hóa đơn rồi dừng. ')
                + String(t.thongBao || t.ma || '');
        } else {
            ket = 'LOI';
            lyDo = String(t.thongBao || t.ma || '');
        }
    } else if (t.loai === 'treo') {
        // ⚠️ Y HỆT nhánh 'loi' ngay trên. Hàng đợi phân hai đường: mã lỗi
        // thường -> 'loi'; KHONG_RO -> 'treo'. Lo mỗi đường 'loi' là bỏ sót
        // đúng một nửa — mà nửa bị sót lại là nửa hay gặp hơn, vì bấm xong mà
        // không đọc được kết quả là chuyện thường ngày.
        const r = t.ketQua || {};
        const daRa = Number(r.tong) || 0;
        if (r.daBamThanhToan && daRa > 0) {
            ket = 'RA_HOA_DON';
            soTien = daRa;
            const so = Number(r.soHoaDon) || 0;
            lyDo = (so > 1 ? `Ra ${so} hóa đơn rồi treo. ` : 'Đã ra hóa đơn rồi treo. ')
                + String(t.thongBao || '');
        } else {
            ket = 'TREO';
            lyDo = String(t.thongBao || '');
        }
    } else {
        return null;                      // 'bat-dau' và mọi tin khác
    }

    const khi = Number(luc) || Date.now();
    return {
        ngay: ngayISO(ngay) || ngayMay(khi),
        ma_khach_hang: String(l.maKH),
        ten_khach_hang: String(l.tenKH || ''),
        so_tien: soTien,
        // Xem chú thích cùng tên ở goiTuBanGhi().
        ...(ket === 'RA_HOA_DON' && Number(l.soTien || 0) > 0
            && Number(soTien) !== Number(l.soTien)
            ? { so_tien_dinh: Number(l.soTien) } : {}),
        kieu_xuat: kieuXuatCua(l.soTienDat),
        ket_qua: ket,
        ly_do: lyDo,
        ma_lenh: l.id ? String(l.id) : `${khi}-${l.maKH}`,
        chay_luc: khi,
    };
}

/**
 * Gửi thẳng một mảng dòng sang Sell. Dùng chung cho mọi đường gửi.
 *
 * @returns {Promise<{ok:boolean, boQua?:string, thongBao?:string, soDong?:number}>}
 */
async function guiCacDong(cacDong, caiDat, layFetch) {
    const c = caiDat || {};
    const url = String(c.sellUrl || '').trim().replace(/\/+$/, '');
    const token = String(c.sellToken || '').trim();

    // Chưa khai báo thì thôi, KHÔNG coi là lỗi: người dùng có thể cố ý không
    // dùng trang kế toán.
    if (!url || !token) return { ok: false, boQua: 'CHUA_KHAI_BAO' };

    const banGhiGui = Array.isArray(cacDong) ? cacDong : [];
    if (!banGhiGui.length) return { ok: false, boQua: 'KHONG_CO_GI_DE_GUI' };

    const fetchDung = layFetch || (typeof fetch !== 'undefined' ? fetch : null);
    if (!fetchDung) return { ok: false, boQua: 'KHONG_CO_FETCH' };

    try {
        const tra = await fetchDung(url + DUONG_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': 'Bearer ' + token,
            },
            body: JSON.stringify({ ban_ghi: banGhiGui }),
        });
        if (!tra || !tra.ok) {
            // ⚠️ 403 là nguyên nhân số một khiến cột XHD bên Sell trống, và
            // "Sell trả về 403" thì không ai đoán ra phải làm gì. Nói thẳng.
            if (tra && tra.status === 403) {
                return {
                    ok: false, ma: 'SAI_TOKEN',
                    thongBao: 'bongtom.store TỪ CHỐI TOKEN. Kiểm tra dòng EXTENSION_HOA_DON_TOKEN '
                        + 'trong tệp .env của bongtom.store có khớp với token đã khai ở đây không '
                        + '(chưa có dòng đó cũng bị từ chối). Các dòng vẫn được giữ lại.',
                };
            }
            if (tra && tra.status === 404) {
                return {
                    ok: false, ma: 'SAI_DIA_CHI',
                    thongBao: `Không có đường nhận ở địa chỉ này (${url}). Kiểm tra lại địa chỉ `
                        + 'bongtom.store, và bongtom.store đã cập nhật bản có trang Kế toán tổng hợp chưa.',
                };
            }
            return { ok: false, thongBao: 'bongtom.store trả về ' + ((tra && tra.status) || '?') };
        }
        const d = await tra.json();
        return {
            ok: !!(d && d.thanh_cong),
            soDong: banGhiGui.length,
            daGhi: (d && d.da_ghi) || 0,
            daCapNhat: (d && d.da_cap_nhat) || 0,
            khongKhopKhach: (d && d.khong_khop_khach) || [],
            thongBao: (d && d.thong_bao) || '',
        };
    } catch (e) {
        // ⛔ NUỐT LỖI Ở ĐÂY LÀ CỐ Ý. Xem chú thích đầu file.
        return { ok: false, thongBao: String((e && e.message) || e) };
    }
}

/**
 * Gửi một bản ghi lịch sử sang Sell (đường cũ: gửi cả loạt một lần).
 * Vẫn giữ làm LƯỚI AN TOÀN cho đường gửi-từng-khách: gửi trùng không sao, mã
 * lệnh giống nhau nên Sell cập nhật chứ không thêm dòng.
 */
async function dayVeSell(banGhi, caiDat, layFetch) {
    return guiCacDong(goiTuBanGhi(banGhi), caiDat, layFetch);
}

// ════════════════════════════════════════════════════════════════════════════
//  HÀNG CHỜ GỬI
//
//  ⚠️ VÌ SAO CẦN: trước đây gửi hỏng là MẤT LUÔN. Sell đang tắt, mất mạng, token
//  sai — máy chỉ ghi "lần gửi gần nhất: HỎNG" rồi thôi, không bao giờ thử lại.
//  Số của cả lượt đó biến mất khỏi trang kế toán dù hóa đơn đã ra thật.
//
//  Nay mọi thứ đi qua hàng chờ: xếp vào trước, gửi được thì xoá khỏi hàng, gửi
//  không được thì GIỮ LẠI để lần sau gửi bù.
// ════════════════════════════════════════════════════════════════════════════

const KHOA_CHO_GUI = 'hdt-cho-gui-sell';

/** Cắt bớt khi quá nhiều — kho Chrome có hạn, phình ra là hỏng cả kho. */
const GIOI_HAN_CHO = 500;

/**
 * Thêm dòng vào hàng chờ, BỎ TRÙNG theo mã lệnh (dòng mới đè dòng cũ).
 *
 * Đè chứ không bỏ qua: cùng một lệnh có thể được gửi hai lần với kết quả KHÁC
 * nhau — lần sau đã kết luận được một lệnh trước đó còn treo.
 */
function themVaoCho(dsCu, dongMoi, gioiHan = GIOI_HAN_CHO) {
    const cu = Array.isArray(dsCu) ? dsCu : [];
    const moi = Array.isArray(dongMoi) ? dongMoi : (dongMoi ? [dongMoi] : []);
    const theoMa = new Map();
    for (const d of [...cu, ...moi]) {
        if (!d || !d.ma_khach_hang) continue;
        theoMa.set(String(d.ma_lenh || `${d.ngay}-${d.ma_khach_hang}`), d);
    }
    const ra = [...theoMa.values()];
    // Quá hạn thì bỏ phần CŨ NHẤT — dòng mới quan trọng hơn.
    return ra.length > gioiHan ? ra.slice(ra.length - gioiHan) : ra;
}

/**
 * Xếp dòng mới vào hàng chờ rồi thử gửi cả hàng.
 *
 * @param {object} boi
 *   - kho       { doc(), ghi() } nơi giữ hàng chờ
 *   - gui       (cacDong) => {ok,...}  CÁCH GỬI. Không truyền thì gửi thẳng
 *               bằng token (caiDat + layFetch). Tiến trình nền truyền vào một
 *               hàm ưu tiên ghi qua TAB SELL ĐANG ĐĂNG NHẬP — khỏi cần token.
 *   - caiDat    { sellUrl, sellToken } — chỉ dùng khi không truyền `gui`
 *   - dongMoi   dòng/mảng dòng cần thêm (có thể rỗng — khi đó chỉ gửi bù)
 *   - layFetch  cho test
 * @returns {Promise<{ok:boolean, daGui:number, conLai:number, boQua?:string, thongBao?:string}>}
 */
async function xepVaGui({ kho, caiDat, dongMoi, layFetch, gui }) {
    let hang = [];
    try {
        hang = themVaoCho(await kho.doc(), dongMoi);
        await kho.ghi(hang);
    } catch (e) {
        // Kho hỏng thì vẫn cố gửi phần vừa có, đừng mất luôn.
        hang = themVaoCho([], dongMoi);
    }
    if (!hang.length) return { ok: true, daGui: 0, conLai: 0 };

    const kq = gui ? await gui(hang) : await guiCacDong(hang, caiDat, layFetch);
    if (!kq.ok) {
        // GIỮ NGUYÊN hàng chờ để lần sau gửi bù.
        return { ok: false, daGui: 0, conLai: hang.length,
                 boQua: kq.boQua, thongBao: kq.thongBao };
    }
    try { await kho.ghi([]); } catch (e) { /* gửi xong rồi, xoá hụt cũng không sao */ }
    return { ok: true, daGui: hang.length, conLai: 0,
             khongKhopKhach: kq.khongKhopKhach || [] };
}

/** Còn bao nhiêu dòng đang chờ gửi. */
async function soDangCho(kho) {
    try {
        const h = await kho.doc();
        return Array.isArray(h) ? h.length : 0;
    } catch (e) { return 0; }
}

const API = { dayVeSell, guiCacDong, goiTuBanGhi, dongTuTienDo, kieuXuatCua,
              themVaoCho, xepVaGui, soDangCho,
              ngayISO, ngayMay, DUONG_API, KHOA_CHO_GUI, GIOI_HAN_CHO };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof globalThis !== 'undefined') globalThis.HDT_DayVeSell = API;

})();
