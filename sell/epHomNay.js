'use strict';

// ⚠️ TOÀN BỘ FILE NẰM TRONG MỘT PHẠM VI RIÊNG (hàm bọc ngoài).

(function () {

// ============================================================================
//  ÉP BẢNG BÁO CÁO VỀ "HÔM NAY" — rồi KIỂM CHỨNG là nó thật sự về hôm nay.
//
//  ⚠️ VÌ SAO PHẢI CÓ FILE NÀY
//  Trang báo cáo của Sell mặc định lọc "Tháng này"
//  (baoCaoKhachHang.blade.php: <option value="thang_nay" selected>).
//  Máy đọc bảng đang hiện gì thì lấy nấy — nên hẹn giờ chạy lúc 9 giờ sáng sẽ
//  lấy DOANH THU CẢ THÁNG rồi xuất hóa đơn theo số đó. Không ai phát hiện, vì
//  con số vẫn "trông hợp lý".
//
//  ⚠️ KIỂM CHỨNG, KHÔNG PHẢI TIN TƯỞNG
//  Bấm xong rồi đọc luôn là sai: mạng chậm một nhịp thì đọc phải bảng cũ. Trang
//  có dòng "Từ … đến …" do CHÍNH MÁY CHỦ điền về sau mỗi lần tải — đó là nguồn
//  sự thật duy nhất. Chỉ khi hai đầu bằng nhau và bằng hôm nay thì mới được đọc.
//
//  Máy chủ định nghĩa "hom_nay" là 00:00→23:59 giờ Việt Nam
//  (BaoCaoController.php: Carbon::today('Asia/Ho_Chi_Minh')).
//
//  ⚠️ CHỈ ĐỘNG VÀO Ô ĐIỀU KHIỂN CÓ SẴN của trang. Không sửa một dòng nào trong
//  project Sell; gỡ extension là trang trở lại y nguyên.
// ============================================================================

const NhipDo = (typeof module !== 'undefined' && module.exports)
    ? require('../chung/nhipDo') : globalThis.HDT_NhipDo;

const MA = {
    OK: 'OK',
    KHONG_THAY_BO_LOC: 'KHONG_THAY_BO_LOC',
    KHONG_VE_DUOC_HOM_NAY: 'KHONG_VE_DUOC_HOM_NAY',
    KHONG_DOC_DUOC_NGAY: 'KHONG_DOC_DUOC_NGAY',
};

const LOAI_HOM_NAY = 'hom_nay';
const SO_BAN_GHI_MUON = '100';

/** "13/8/2026" -> "13/08/2026" — đúng định dạng d/m/Y của Laravel. */
function ngayDMY(d) {
    return String(d.getDate()).padStart(2, '0') + '/'
        + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}

const gonChu = (o) => String((o && o.textContent) || '').replace(/\s+/g, ' ').trim();

function timBoLoc(tailieu) {
    const lay = (id) => tailieu.getElementById(id);
    return {
        loai: lay('filterLoai'),
        loaiDon: lay('filterLoaiDon'),
        tuKhoa: lay('searchKhachHang'),
        soBanGhi: lay('soBanGhiSelect'),
        tuHien: lay('tuNgayHienThi'),
        denHien: lay('denNgayHienThi'),
        dangTai: lay('tableLoading'),
        nutXem: timNutXemBaoCao(tailieu),
    };
}

/**
 * Nút "Xem báo cáo". Trang thật gắn hành vi bằng onclick trong HTML nên nút
 * KHÔNG có id — phải nhận theo chữ. Nhận nhầm nút khác là bấm bừa lên trang
 * của người dùng, nên đòi đúng chữ "Xem báo cáo".
 */
function timNutXemBaoCao(tailieu) {
    const cac = [...tailieu.querySelectorAll('button')];
    return cac.find(b => /^xem báo cáo$/i.test(gonChu(b)))
        || tailieu.getElementById('nutXemBaoCao')
        || null;
}

/** Trang có đang tải dở không? Đang tải mà bấm nữa là cú bấm rơi vào hư không. */
function dangTai(bo) {
    const o = bo.dangTai;
    if (!o) return false;
    const kieu = String((o.style && o.style.display) || '');
    return kieu !== '' && kieu !== 'none';
}

/** Khoảng ngày mà MÁY CHỦ báo là đang hiện. Chưa tải lần nào -> null. */
function docKhoangDangHien(bo) {
    const tu = gonChu(bo.tuHien);
    const den = gonChu(bo.denHien);
    if (!tu || !den || tu === '--' || den === '--') return null;
    return { tu, den };
}

async function nhinToiKhi(dieuKien, { nghi, hanMs, nhipMs }) {
    for (let da = 0; da <= hanMs; da += nhipMs) {
        const kq = dieuKien();
        if (kq) return kq;
        if (da + nhipMs > hanMs) break;
        await nghi(nhipMs);
    }
    return null;
}

/**
 * Ép bảng về đúng HÔM NAY rồi kiểm chứng.
 *
 * @returns {Promise<{ok:boolean, ma:string, ngay?:{tu:string,den:string},
 *                    thongBao:string, daBam:number}>}
 */
async function epVeHomNay(tailieu, tuyChon = {}) {
    const nghi = tuyChon.nghi || (ms => new Promise(r => setTimeout(r, ms)));
    const nhip = tuyChon.nhipNhin || NhipDo.NHIN_DOM;
    const han = tuyChon.hanMs == null ? NhipDo.HAN_CHO_BANG : tuyChon.hanMs;
    const homNay = tuyChon.homNay || ngayDMY(new Date());

    const bo = timBoLoc(tailieu);
    if (!bo.loai || !bo.tuHien || !bo.denHien) {
        return {
            ok: false, ma: MA.KHONG_THAY_BO_LOC, daBam: 0,
            thongBao: 'Không thấy bộ lọc thời gian trên trang báo cáo — có thể bongtom.store đã đổi '
                + 'giao diện. KHÔNG đọc số, không tạo hóa đơn nào.',
        };
    }

    // ── Đặt lại mọi thứ ảnh hưởng tới con số ────────────────────────────────
    // Đặt GIÁ TRỊ thôi, KHÔNG bắn sự kiện: trang thật gắn onchange/onkeyup gọi
    // thẳng loadBaoCao(), bắn lung tung là nhiều lần tải chồng nhau, mà cờ
    // `dangTai` sẽ nuốt mất đúng lần tải mình cần.
    bo.loai.value = LOAI_HOM_NAY;
    // Chữ còn sót trong ô tìm kiếm sẽ LỌC MẤT khách trong lịch — mà máy lại
    // tưởng khách đó "hôm nay không phát sinh doanh thu". Phải dọn.
    if (bo.tuKhoa) bo.tuKhoa.value = '';
    // Người dùng có thể để ở "Đơn order" -> doanh thu chỉ còn một phần.
    if (bo.loaiDon) bo.loaiDon.value = '';

    // ── Chờ lần tải đang dở (nếu có) xong đã ────────────────────────────────
    await nhinToiKhi(() => !dangTai(bo), { nghi, hanMs: han, nhipMs: nhip });

    // ── Bắt trang tải lại ───────────────────────────────────────────────────
    // Ưu tiên đổi số bản ghi: nó vừa nâng 20 -> 100 dòng (khách ở trang 2 sẽ
    // không bị bỏ sót), vừa tự gọi loadBaoCao(1). Số bản ghi đã đủ lớn rồi thì
    // bấm nút "Xem báo cáo" như người dùng vẫn làm.
    let daBam = 0;
    if (bo.soBanGhi && bo.soBanGhi.value !== SO_BAN_GHI_MUON) {
        bo.soBanGhi.value = SO_BAN_GHI_MUON;
        bo.soBanGhi.dispatchEvent(new (tailieu.defaultView || globalThis).Event(
            'change', { bubbles: true }));
        daBam++;
    } else if (bo.nutXem) {
        bo.nutXem.click();
        daBam++;
    } else {
        return {
            ok: false, ma: MA.KHONG_THAY_BO_LOC, daBam: 0,
            thongBao: 'Không thấy nút "Xem báo cáo" lẫn ô số bản ghi — không bắt được trang '
                + 'tải lại theo hôm nay. KHÔNG đọc số.',
        };
    }

    // ── KIỂM CHỨNG: máy chủ phải báo đúng hôm nay ở CẢ HAI đầu ──────────────
    const dat = () => {
        if (dangTai(bo)) return null;
        const k = docKhoangDangHien(bo);
        return (k && k.tu === homNay && k.den === homNay) ? k : null;
    };
    let ngay = await nhinToiKhi(dat, { nghi, hanMs: han, nhipMs: nhip });

    // Chưa được thì thử bấm nút một lần nữa — cú bấm đầu có thể đã rơi vào lúc
    // trang đang tải dở và bị cờ `dangTai` nuốt mất.
    if (!ngay && bo.nutXem) {
        await nhinToiKhi(() => !dangTai(bo), { nghi, hanMs: han, nhipMs: nhip });
        bo.nutXem.click();
        daBam++;
        ngay = await nhinToiKhi(dat, { nghi, hanMs: han, nhipMs: nhip });
    }

    if (!ngay) {
        const k = docKhoangDangHien(bo);
        return {
            ok: false,
            ma: k ? MA.KHONG_VE_DUOC_HOM_NAY : MA.KHONG_DOC_DUOC_NGAY,
            daBam,
            ngay: k || undefined,
            thongBao: k
                ? `Bảng vẫn đang hiện số từ ${k.tu} đến ${k.den}, không phải hôm nay `
                  + `(${homNay}). KHÔNG đọc số, không tạo hóa đơn nào.`
                : 'Không đọc được dòng "Từ … đến …" trên trang báo cáo nên không biết bảng '
                  + 'đang hiện khoảng nào. KHÔNG đọc số, không tạo hóa đơn nào.',
        };
    }

    return { ok: true, ma: MA.OK, ngay, daBam, thongBao: '' };
}

const API = { epVeHomNay, timBoLoc, timNutXemBaoCao, docKhoangDangHien, dangTai,
              ngayDMY, MA, LOAI_HOM_NAY, SO_BAN_GHI_MUON };
if (typeof globalThis !== 'undefined') globalThis.HDT_EpHomNay = API;
if (typeof module !== 'undefined' && module.exports) module.exports = API;

})();
