'use strict';

// ============================================================================
//  HẸN GIỜ — logic thuần, không đụng chrome.alarms.
//
//  Tách ra để test được bằng Node: chuyện giờ giấc là chỗ dễ sai âm thầm nhất
//  (nửa đêm, đổi ngày, mốc vừa trôi qua vài giây…), mà sai ở đây thì hoặc lịch
//  không bao giờ chạy, hoặc chạy sai giờ — cả hai đều chỉ lộ ra sau nhiều ngày.
//
//  ⚠️ Máy tính TẮT thì không có gì chạy cả. Ở đây không có máy chủ nào; hẹn giờ
//  chỉ là báo thức của Chrome, Chrome đóng là im. Bảng cài đặt phải nói thẳng
//  điều đó, đừng để người dùng tưởng đã hẹn là chắc chắn có hóa đơn.
// ============================================================================

(function () {

const TIEN_TO = 'hdt-hen-';
const MOT_NGAY_PHUT = 24 * 60;

// ── NGÀY THEO GIỜ VIỆT NAM ──────────────────────────────────────────────────
//
// ⚠️ KHÔNG DÙNG GIỜ MÁY, cùng lý do đã ghi ở baoTelegram.js: máy chạy lúc không
// có ai ngồi xem, và máy đặt sai múi giờ hay đang ở nơi khác thì "hôm nay" lệch
// một ngày. Ở đây "hôm nay" quyết định một khách CÒN được xuất hóa đơn thuế hay
// không, nên lệch một ngày là xuất thừa hoặc thiếu một tờ.
const MUI_GIO = 'Asia/Ho_Chi_Minh';

/** Mốc thời gian -> "YYYY-MM-DD" theo giờ Việt Nam. */
function ngayVN(luc) {
    const t = new Date(Number(luc) || Date.now());
    if (Number.isNaN(t.getTime())) return '';
    try {
        const p = new Intl.DateTimeFormat('en-GB', {
            timeZone: MUI_GIO, year: 'numeric', month: '2-digit', day: '2-digit',
        }).formatToParts(t).reduce((o, x) => (o[x.type] = x.value, o), {});
        return `${p.year}-${p.month}-${p.day}`;
    } catch (e) {
        return '';
    }
}

/** "YYYY-MM-DD" + n ngày -> "YYYY-MM-DD". Không đúng dạng -> ''. */
function congNgay(iso, n) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
    if (!m) return '';
    // Dùng UTC để cộng ngày: không có giờ mùa hè, không nhảy múi.
    const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(t + (Number(n) || 0) * 24 * 3600 * 1000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-`
        + `${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * KHỐI BA THÁNG chứa ngày này — chủ dự án chốt 31/08/2026.
 *
 * ⚠️ KHÔNG PHẢI QUÝ LỊCH. Các khối là 12-1-2 · 3-4-5 · 6-7-8 · 9-10-11, tức là
 * lệch một tháng so với quý kế toán thông thường. Chốt theo đúng hai ví dụ chủ
 * dự án đưa: đang tháng 8 thì ra 6-7-8, đang tháng 10 thì ra 9-10-11 — hai ví
 * dụ ấy CHỈ khớp nhau với cách chia này.
 *
 * Tháng bắt đầu = m − (m mod 3); ra 0 nghĩa là tháng 12 của NĂM TRƯỚC (khối
 * 12-1-2 vắt qua giao thừa — quên chỗ này là tháng 1 và 2 cộng nhầm cả năm).
 *
 * @returns {{tu:string, den:string, thang:number[]}} khoảng ngày và 3 số tháng
 */
function khoiBaThang(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
    if (!m) return null;
    const nam = Number(m[1]);
    const thang = Number(m[2]);
    let namDau = nam;
    let thangDau = thang - (thang % 3);
    if (thangDau === 0) { thangDau = 12; namDau = nam - 1; }

    const cac = [];
    let n = namDau;
    let t = thangDau;
    for (let i = 0; i < 3; i++) {
        cac.push({ nam: n, thang: t });
        t += 1;
        if (t > 12) { t = 1; n += 1; }
    }
    const cuoi = cac[2];
    const soNgayCuoi = new Date(Date.UTC(cuoi.nam, cuoi.thang, 0)).getUTCDate();
    const hai = (x) => String(x).padStart(2, '0');
    return {
        tu: `${cac[0].nam}-${hai(cac[0].thang)}-01`,
        den: `${cuoi.nam}-${hai(cuoi.thang)}-${hai(soNgayCuoi)}`,
        thang: cac.map(x => x.thang),
    };
}

/**
 * NGÀY CUỐI CÙNG lượt tự chọn của khách này còn được chạy. '' = không đặt hạn.
 *
 * ⚠️ TÍNH LẠI MỖI LẦN TỪ (ngày bắt đầu + số ngày), KHÔNG giữ số đếm lùi. Số đếm
 * lùi phải trừ đúng một lần mỗi ngày, mà Chrome giết tiến trình nền giữa chừng
 * là chuyện thường: trừ hai lần thì mất ngày, trừ hụt thì chạy dai. Hai con số
 * đứng yên thì không có gì để hỏng.
 *
 * Ngày bắt đầu TÍNH LUÔN: đặt 1 ngày nghĩa là chỉ chạy đúng hôm đó.
 */
function ngayHetHanTuChon(k) {
    const so = Number(k && k.soNgayTuChon);
    const batDau = String((k && k.batDauTuChon) || '').trim();
    if (!Number.isFinite(so) || so <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(batDau)) return '';
    return congNgay(batDau, so - 1);
}

/** Lượt tự chọn của khách này đã hết hạn tính tới ngày `homNay` chưa. */
function hetHanTuChon(k, homNay) {
    const het = ngayHetHanTuChon(k);
    if (!het) return false;                 // không đặt hạn -> chạy mãi
    return String(homNay || ngayVN()) > het;
}

/** Hôm nay có phải NGÀY CUỐI của khách này không (để báo trước khi dừng). */
function laNgayCuoiTuChon(k, homNay) {
    const het = ngayHetHanTuChon(k);
    return !!het && String(homNay || ngayVN()) === het;
}

/** Còn bao nhiêu ngày nữa (kể cả hôm nay). Không đặt hạn -> null. */
function soNgayConLai(k, homNay) {
    const het = ngayHetHanTuChon(k);
    if (!het) return null;
    const nay = String(homNay || ngayVN());
    if (nay > het) return 0;
    let n = 0;
    for (let d = nay; d <= het && n < 4000; d = congNgay(d, 1)) n++;
    return n;
}

/**
 * KHÁCH NÀY HÔM NAY ĐÃ CHẠY LƯỢT TIỀN/NGÀY CHƯA — đọc từ lịch sử chạy.
 *
 * ⚠️ "ĐÃ CHẠY" KHÔNG PHẢI "ĐÃ RA HÓA ĐƠN" — chủ dự án chốt 27/08/2026. Lượt
 * chạy rồi mà hỏng thì NGÀY ẤY VẪN TIÊU: báo thức hôm nay không kêu lại nữa, và
 * ngày dừng đã tính sẵn từ ngày bắt đầu nên không đổi. Chỉ đếm lần ra hóa đơn
 * thì có hôm con số đứng yên trong khi ngày dừng vẫn tiến — hai thứ trên cùng
 * một màn hình nói hai điều khác nhau.
 *
 * Nhận ra lượt tự chọn bằng `soTienDat > 0`: đó là dấu duy nhất phân biệt nó
 * với lượt theo doanh thu, và nó đi theo bản ghi từ `apDungSoDat` tới đây.
 */
function daChayTuChonHomNay(maKH, lichSu, homNay) {
    const ma = String(maKH || '').trim();
    if (!ma) return false;
    const nay = String(homNay || ngayVN());
    return (Array.isArray(lichSu) ? lichSu : []).some((b) => {
        if (!b || ngayVN(b.luc) !== nay) return false;
        return (b.khach || []).some(
            k => k && String(k.maKH || '').trim() === ma && Number(k.soTienDat) > 0);
    });
}

/**
 * SỐ NGÀY CÒN CHẠY ĐƯỢC KỂ TỪ BÂY GIỜ — con số bảng cài đặt bày ra.
 *
 * Khác `soNgayConLai` đúng một điểm: hôm nay ĐÃ chạy rồi thì không tính nữa.
 * Chủ dự án chốt 27/08/2026 — xuất xong mà con số đứng yên tới nửa đêm thì nhìn
 * như máy không ghi nhận gì.
 */
function soNgayChayTiep(k, lichSu, homNay) {
    const con = soNgayConLai(k, homNay);
    if (con == null) return null;
    if (con <= 0) return 0;
    return daChayTuChonHomNay(k && k.maKH, lichSu, homNay) ? con - 1 : con;
}

/** "9:5" -> "09:05". Không phải giờ hợp lệ -> null. */
function chuanMotMoc(v) {
    const s = String(v == null ? '' : v).trim();
    const m = s.match(/^(\d{1,2})\s*[:h]\s*(\d{1,2})$/i);
    if (!m) return null;
    const gio = Number(m[1]);
    const phut = Number(m[2]);
    if (!(gio >= 0 && gio <= 23) || !(phut >= 0 && phut <= 59)) return null;
    return String(gio).padStart(2, '0') + ':' + String(phut).padStart(2, '0');
}

/** Danh sách mốc giờ: bỏ cái sai, bỏ trùng, sắp theo thứ tự trong ngày. */
function chuanMocThoDai(ds) {
    if (!Array.isArray(ds)) return [];
    const thay = new Set();
    for (const v of ds) {
        const m = chuanMotMoc(v);
        if (m) thay.add(m);
    }
    return [...thay].sort();
}

/**
 * ⚠️ MỖI NGÀY ĐÚNG MỘT MỐC — quyết định của chủ dự án ngày 2026-08-13.
 *
 * Vì luật lấy tiền là "doanh thu HÔM NAY tính tới lúc chạy". Hai mốc trong cùng
 * một ngày là tính trùng: 09:00 xuất 500.000, tới 21:00 doanh thu hôm nay đã là
 * 2.000.000 thì nó xuất tiếp 2.000.000 — 500.000 buổi sáng bị tính hai lần.
 * Chốt chống trùng sẵn có KHÔNG bắt được, vì nó đòi trùng cả số tiền.
 *
 * Giữ mốc SỚM NHẤT và trả về những mốc đã bỏ, để màn hình nói rõ chứ không
 * lặng lẽ cắt bớt.
 */
function chuanMoc(ds) {
    const cac = chuanMocThoDai(ds);
    return cac.slice(0, 1);
}

function chuanMocKeRo(ds) {
    const cac = chuanMocThoDai(ds);
    return { giu: cac.slice(0, 1), boDi: cac.slice(1) };
}

const tenBaoThuc = (moc) => TIEN_TO + moc;
const mocTuTen = (ten) => {
    const s = String(ten || '');
    return s.startsWith(TIEN_TO) ? chuanMotMoc(s.slice(TIEN_TO.length)) : null;
};

/**
 * Lần kế tiếp mốc `moc` xảy ra, tính từ `bayGio` (mốc thời gian ms).
 *
 * ⚠️ Mốc TRÙNG ĐÚNG phút hiện tại được đẩy sang NGÀY MAI. Nếu không, người dùng
 * lưu lịch lúc 09:00:30 cho mốc 09:00 sẽ bị chạy ngay lập tức — họ vừa bấm Lưu
 * đã thấy máy phát hành hóa đơn, không kịp hiểu chuyện gì.
 *
 * @param {string} moc      "HH:MM"
 * @param {number} bayGio   Date.now()
 * @param {(ms:number)=>Date} [taoNgay]  cho test bơm múi giờ giả
 * @returns {number|null}   mốc thời gian ms, hoặc null nếu mốc sai
 */
function lanKeTiep(moc, bayGio, taoNgay) {
    const m = chuanMotMoc(moc);
    if (m == null) return null;
    const lam = taoNgay || ((ms) => new Date(ms));
    const nay = lam(bayGio);
    const [gio, phut] = m.split(':').map(Number);

    const dich = new Date(nay.getTime());
    dich.setHours(gio, phut, 0, 0);
    if (dich.getTime() <= bayGio) dich.setTime(dich.getTime() + MOT_NGAY_PHUT * 60000);
    return dich.getTime();
}

/**
 * GOM KHÁCH THEO MỐC GIỜ.
 *
 * ⚠️ Mỗi khách có thể mang MỐC GIỜ RIÊNG. Có giờ riêng thì GIỜ CHUNG KHÔNG đụng
 * tới khách đó nữa — đây là điểm mấu chốt, quên là khách bị chạy hai lần trong
 * một ngày và ra hai hóa đơn.
 *
 * Hai mốc trùng nhau (giờ chung 09:00 và giờ riêng 09:00) được GỘP LÀM MỘT lượt,
 * chứ không dựng hai báo thức: hai lượt sát nhau thì lượt sau đụng khóa chống
 * chạy chồng và bị bỏ qua.
 *
 * ── HAI LỊCH TÁCH RỜI (chủ dự án chốt 27/08/2026) ──────────────────────────
 * Mỗi khách sinh ra TỐI ĐA HAI mục, mỗi mục mang cờ `kieu`:
 *   · 'he_thong' — bật bằng `batHeThong`, giờ `moc` (trống -> giờ chung)
 *   · 'tu_chon'  — bật bằng `batTuChon`, giờ `mocTien`, tiền `soTienNgay`
 *
 * ⚠️ KHÓA BỎ TRÙNG PHẢI LÀ (mã khách + kiểu), KHÔNG PHẢI mã khách. Bản cũ bỏ
 * trùng theo mã: đặt giờ hệ thống 10:00 và giờ tự chọn 10:00 cho cùng một khách
 * thì một trong hai BIẾN MẤT, không báo gì, và người dùng chỉ biết khi tối ngồi
 * đếm thiếu một tờ hóa đơn.
 *
 * ⚠️ `tu_chon` PHẢI CÓ GIỜ RIÊNG mới chạy — chủ dự án chốt: gõ tiền mà quên gõ
 * giờ thì KHÔNG chạy phần ấy. Không mượn giờ chung, không mượn giờ hệ thống:
 * mượn ngầm là ra một tờ hóa đơn thuế vào giờ người dùng không hề chọn.
 *
 * @returns {Array<{moc:string, khach:Array, laGioChung:boolean}>} sắp theo giờ
 */
function gomTheoMoc(henGio, homNay) {
    const h = henGio || {};
    const nay = String(homNay || ngayVN());
    const gioChung = chuanMoc(h.moc)[0] || null;
    const theoMoc = new Map();

    const them = (moc, k, laChung, kieu) => {
        if (!moc) return;
        if (!theoMoc.has(moc)) theoMoc.set(moc, { moc, khach: [], laGioChung: false });
        const o = theoMoc.get(moc);
        if (laChung) o.laGioChung = true;
        if (!o.khach.some(x => x.maKH === k.maKH && (x.kieu || 'he_thong') === kieu)) {
            o.khach.push({ ...k, kieu });
        }
    };

    for (const k of h.khach || []) {
        // Bản ghi cũ (chưa có hai cờ) coi như BẬT hệ thống. `caiDat.chuanKhach`
        // đã chuyển hết sang cờ rồi; đây là lưới đỡ cho gói dựng tay.
        const coCo = ('batHeThong' in k) || ('batTuChon' in k);
        const batHT = coCo ? !!k.batHeThong : true;
        const batTC = coCo ? !!k.batTuChon : false;

        if (batHT) {
            const rieng = chuanMotMoc(k.moc);
            if (rieng) them(rieng, k, false, 'he_thong');
            else them(gioChung, k, true, 'he_thong');
        }
        // ⚠️ HẾT HẠN THÌ KHÔNG DỰNG MỐC NỮA — chủ dự án chốt 27/08/2026. Ô tích
        // vẫn để nguyên (bảng cài đặt sẽ ghi "đã hết hạn"); tiến trình nền KHÔNG
        // tự sửa cài đặt của người dùng. Lọc ở đây là đủ: không có mục thì
        // `dungLich` không dựng báo thức, và `khachCuaMoc` cũng không trả về.
        if (batTC && !hetHanTuChon(k, nay)) {
            // Không có giờ -> KHÔNG chạy. Cố ý; xem chú thích đầu hàm.
            const mocT = chuanMotMoc(k.mocTien);
            // ⚠️ ĐÓNG DẤU NGÀY CUỐI ngay tại đây, chỗ DUY NHẤT biết cả khách
            // lẫn "hôm nay". Báo Telegram phải nhắn ở LƯỢT CHẠY CUỐI ("từ mai
            // không xuất nữa") chứ không phải hôm sau — hôm sau mốc này không
            // còn báo thức nào để đánh thức máy dậy mà nhắn.
            if (mocT) them(mocT, laNgayCuoiTuChon(k, nay) ? { ...k, ngayCuoi: true } : k,
                           false, 'tu_chon');
        }
    }
    // Giờ chung có đặt nhưng không còn khách nào theo nó thì vẫn giữ mốc lại,
    // để màn hình nói được "mốc này không còn khách nào" thay vì im lặng.
    if (gioChung && !theoMoc.has(gioChung)) {
        theoMoc.set(gioChung, { moc: gioChung, khach: [], laGioChung: true });
    }
    return [...theoMoc.values()].sort((a, b) => a.moc.localeCompare(b.moc));
}

/** Những khách sẽ chạy vào ĐÚNG mốc này. */
function khachCuaMoc(henGio, moc, homNay) {
    const m = chuanMotMoc(moc);
    const o = gomTheoMoc(henGio, homNay).find(x => x.moc === m);
    return o ? o.khach : [];
}

/** Khách BẬT tự chọn nhưng đã HẾT HẠN — để bảng cài đặt nói ra. */
function khachHetHanTuChon(henGio, homNay) {
    return ((henGio || {}).khach || []).filter(
        k => k && k.batTuChon && hetHanTuChon(k, homNay));
}

/** Khách nằm trong lịch nhưng KHÔNG có giờ nào để chạy (chưa đặt giờ chung). */
function khachKhongCoGio(henGio) {
    const h = henGio || {};
    if (chuanMoc(h.moc)[0]) return [];
    return (h.khach || []).filter((k) => {
        const coCo = ('batHeThong' in k) || ('batTuChon' in k);
        const batHT = coCo ? !!k.batHeThong : true;
        // Khách chỉ bật tự chọn thì giờ chung không liên quan gì tới họ.
        if (!batHT) return false;
        return !chuanMotMoc(k.moc);
    });
}

/**
 * Khách BẬT tự chọn, ĐÃ gõ tiền, nhưng CHƯA gõ giờ -> phần ấy KHÔNG chạy.
 *
 * ⚠️ Phải bày ra màn hình. Người dùng gõ "5.000.000" vào ô tiền rồi bấm Lưu, và
 * mọi thứ trông như đã xong — trong khi phần ấy sẽ không bao giờ chạy. Đây là
 * đúng kiểu hỏng im lặng mà cả dự án này đang tránh.
 */
function khachThieuGioTien(henGio) {
    return ((henGio || {}).khach || []).filter(
        k => k && k.batTuChon && !chuanMotMoc(k.mocTien));
}

/**
 * Khách BẬT tự chọn nhưng KHÔNG CÓ SỐ TIỀN DÙNG ĐƯỢC -> phần ấy không chạy.
 *
 * ⚠️ Hai đường dẫn tới đây, cả hai đều IM LẶNG nếu không nói ra:
 *   · để trống ô tiền — bật công tắc mà quên gõ số
 *   · gõ số quá lớn — trên 2^53 thì bộ đọc số TỪ CHỐI, vì JavaScript không giữ
 *     nổi từng đồng và lưu vào là lưu một số khác số người dùng gõ
 *
 * Cả hai đều dẫn tới "hôm đó không có hóa đơn nào" mà bảng cài đặt trông vẫn
 * bình thường. `soTienNgay` chỉ có mặt khi bộ chuẩn hoá đã nhận, nên thiếu nó
 * nghĩa là một trong hai ca trên.
 */
function khachThieuTienTuChon(henGio) {
    return ((henGio || {}).khach || []).filter(
        k => k && k.batTuChon && !(Number(k.soTienNgay) > 0));
}

/**
 * Hai mốc cách nhau quá sát.
 *
 * Máy chạy TUẦN TỰ từng khách, mỗi khách khoảng nửa phút tới một phút. Hai mốc
 * sát nhau thì lượt sau đụng khóa chống chạy chồng và BỊ BỎ QUA — hôm đó khách
 * kia không có hóa đơn. Phải cảnh báo trước, đừng để họ phát hiện qua lịch sử.
 */
function mocQuaSat(henGio, cachToiThieuPhut = 5) {
    const cac = gomTheoMoc(henGio).map(o => o.moc);
    const phut = (m) => Number(m.slice(0, 2)) * 60 + Number(m.slice(3, 5));
    const sat = [];
    for (let i = 1; i < cac.length; i++) {
        if (phut(cac[i]) - phut(cac[i - 1]) < cachToiThieuPhut) {
            sat.push([cac[i - 1], cac[i]]);
        }
    }
    return sat;
}

/** Mọi báo thức cần dựng: một cái cho MỖI mốc khác nhau, đã gộp trùng. */
function dungLich(hoacMocHoacHenGio, bayGio, taoNgay) {
    // Nhận cả danh sách mốc (kiểu cũ) lẫn cả gói henGio (kiểu mới có giờ riêng).
    const cac = Array.isArray(hoacMocHoacHenGio)
        ? chuanMoc(hoacMocHoacHenGio)
        : gomTheoMoc(hoacMocHoacHenGio).map(o => o.moc);
    return cac
        .map(m => ({ ten: tenBaoThuc(m), moc: m, khi: lanKeTiep(m, bayGio, taoNgay) }))
        .filter(b => b.khi != null);
}

const LY_DO = {
    TAT: 'HEN_GIO_TAT',
    KHONG_CO_MOC: 'KHONG_CO_MOC',
    KHONG_CO_KHACH: 'KHONG_CO_KHACH',
    CHUA_BAT_TU_BAM: 'CHUA_BAT_TU_BAM',
    CO_LENH_TREO: 'CO_LENH_TREO',
    DANG_CHAY: 'DANG_CHAY',
    KHONG_DOC_DUOC_CAI_DAT: 'KHONG_DOC_DUOC_CAI_DAT',
};

/**
 * Tới giờ rồi — có được chạy không?
 *
 * ⚠️ Đây là lúc KHÔNG CÓ AI NGỒI TRƯỚC MÁY. Mọi thứ mập mờ đều phải trả lời là
 * KHÔNG. Thà bỏ một lần hẹn còn hơn phát hành nhầm lúc nửa đêm rồi sáng ra mới
 * biết — hóa đơn điện tử đã gửi cơ quan thuế thì không rút lại được.
 */
function duocChay({ caiDat, soLenhTreo, dangChay }) {
    const c = caiDat || {};
    if (c.docDuoc === false) {
        return { chay: false, lyDo: LY_DO.KHONG_DOC_DUOC_CAI_DAT,
                 thongBao: 'Không đọc được cài đặt — bỏ qua lần hẹn này để khỏi làm bừa.' };
    }
    const h = c.henGio || {};
    if (!h.bat) {
        return { chay: false, lyDo: LY_DO.TAT, thongBao: 'Hẹn giờ đang tắt.' };
    }
    // Có mốc nghĩa là có ÍT NHẤT MỘT mốc — giờ chung HOẶC giờ riêng của khách nào đó.
    if (!gomTheoMoc(h).length) {
        return { chay: false, lyDo: LY_DO.KHONG_CO_MOC, thongBao: 'Lịch không có mốc giờ nào.' };
    }
    if (!Array.isArray(h.khach) || !h.khach.length) {
        return { chay: false, lyDo: LY_DO.KHONG_CO_KHACH,
                 thongBao: 'Lịch chưa chọn khách nào.' };
    }
    // Công tắc tự bấm TẮT nghĩa là máy chỉ bỏ hàng vào giỏ rồi dừng chờ người
    // bấm. Chạy lúc 3 giờ sáng để lại một giỏ hàng đầy không ai bấm là vô ích,
    // lại chặn luôn lần chạy sau (giỏ phải trống mới chạy được).
    if (!(c.tuBam && c.daHieu)) {
        return { chay: false, lyDo: LY_DO.CHUA_BAT_TU_BAM,
                 thongBao: 'Công tắc "Tự bấm Thanh toán" đang tắt nên hẹn giờ không chạy — '
                    + 'máy sẽ chỉ bỏ hàng vào giỏ rồi dừng, để lại giỏ đầy không ai bấm.' };
    }
    // ⚠️ LỆNH TREO KHÔNG CÒN CHẶN — quyết định của chủ dự án 2026-08-13:
    // "không cần quan tâm trùng hay không, chỉ cần có lệnh chạy là chạy".
    // Treo vẫn được ghi và hiện trong lịch sử, chỉ không dùng để chặn nữa.
    // Đánh đổi đã được chấp nhận: có thể ra hóa đơn trùng.
    if (dangChay) {
        return { chay: false, lyDo: LY_DO.DANG_CHAY,
                 thongBao: 'Đang có một loạt đang chạy — bỏ qua lần hẹn này.' };
    }
    return { chay: true, lyDo: 'OK', thongBao: '' };
}

/**
 * TÌNH TRẠNG SẴN SÀNG — trả lời thẳng "tới giờ có chạy được không".
 *
 * ⚠️ Trước đây bốn thứ chặn hẹn giờ đều VÔ HÌNH: lịch chưa bật, còn lệnh treo,
 * công tắc tự bấm tắt, chưa có tab báo cáo. Người dùng ngồi đợi tới giờ rồi
 * thấy không có gì xảy ra, mà không có chỗ nào nói vì sao. Hàm này bày hết ra.
 *
 * Trả về danh sách mục, mỗi mục có `dat` (đạt hay không) và `chan` (có chặn
 * hẳn không). Có mục không đạt mà không chặn — VD chưa có tab báo cáo, vì máy
 * tự mở được.
 */
function kiemSanSang({ caiDat, soLenhTreo, dangChay, coTabBang, lanKeTiepMs }) {
    const c = caiDat || {};
    const h = c.henGio || {};
    const muc = [];
    const them = (ten, dat, chu, chan) => muc.push({ ten, dat: !!dat, chu, chan: !!chan });

    const cacMoc = gomTheoMoc(h);
    them('Lịch hẹn', h.bat && cacMoc.length,
         h.bat && cacMoc.length
            ? 'BẬT — ' + cacMoc.map(o => `${o.moc} (${o.khach.length} khách)`).join(' · ')
            : 'TẮT — chưa bật hoặc chưa có giờ',
         true);

    const lacLoi = khachKhongCoGio(h);
    them('Khách trong lịch', h.khach && h.khach.length,
         h.khach && h.khach.length
            ? `${h.khach.length} khách`
              + (lacLoi.length
                  ? ` — nhưng ${lacLoi.length} khách CHƯA CÓ GIỜ NÀO (chưa đặt giờ chung, `
                    + `cũng không có giờ riêng): ${lacLoi.map(k => k.tenKH || k.maKH).join(', ')}`
                  : '')
            : 'CHƯA CHỌN khách nào — lịch sẽ không bật được',
         true);

    them('Công tắc tự bấm Thanh toán', c.tuBam && c.daHieu,
         (c.tuBam && c.daHieu)
            ? 'BẬT — tới giờ sẽ phát hành hóa đơn thật'
            : 'TẮT — hẹn giờ sẽ KHÔNG chạy (máy không để lại giỏ đầy lúc vắng người)',
         true);

    // ⚠️ CHỈ LÀ THÔNG TIN, KHÔNG CHẶN (chủ dự án chốt 2026-08-13). Vẫn hiện số
    // lượng để bạn biết, nhưng có treo hay không thì tới giờ máy vẫn chạy.
    const treo = Number(soLenhTreo) || 0;
    them('Lệnh treo', treo === 0,
         treo === 0 ? 'không có'
            : `${treo} lệnh chưa rõ kết quả — KHÔNG chặn, tới giờ máy vẫn chạy. `
              + 'Máy sẽ tự bỏ qua chúng khi bắt đầu loạt mới.',
         false);

    const sat = mocQuaSat(h);
    them('Khoảng cách giữa các mốc', sat.length === 0,
         sat.length === 0 ? 'đủ xa'
            : sat.map(([a, b]) => `${a} và ${b}`).join('; ')
              + ' cách nhau dưới 5 phút — lượt sau có thể bị bỏ qua vì lượt trước chưa xong',
         false);

    them('Đang chạy dở', !dangChay,
         dangChay ? 'có một loạt đang chạy — lần hẹn tới sẽ bị bỏ qua' : 'không',
         false);

    them('Tab trang báo cáo', coTabBang !== false,
         coTabBang === false ? 'chưa mở — máy sẽ tự mở khi tới giờ' : 'đã có',
         false);

    const chanBoi = muc.filter(m => m.chan && !m.dat);
    return {
        muc,
        sanSang: chanBoi.length === 0,
        chanBoi: chanBoi.map(m => m.ten),
        lanKeTiepMs: lanKeTiepMs || null,
    };
}

/**
 * Ghép khách trong lịch với bảng đọc được lúc chạy.
 *
 * Số tiền LẤY TỪ BẢNG, không lấy số đã lưu: doanh thu đổi từng ngày, dùng số cũ
 * là ra hóa đơn sai.
 *
 * ⚠️ KHÁCH KHÔNG CÓ DÒNG LÀ CHUYỆN BÌNH THƯỜNG. Bảng báo cáo dựng từ đơn hàng
 * và phiếu trả TRONG KHOẢNG NGÀY rồi gom theo khách (BaoCaoController.php).
 * Hôm nay khách không mua gì thì không có dòng nào để gom — họ biến mất khỏi
 * bảng. Đây KHÔNG phải lỗi, không được dừng cả loạt, và tuyệt đối không được
 * gạch tên họ khỏi lịch: mai họ mua thì mai chạy.
 *
 * Hai ca nữa cũng không xuất được, và phải gọi đúng tên chứ đừng gộp làm một:
 *   · doanh thu = 0  -> mua rồi trả hết trong ngày
 *   · doanh thu < 0  -> hôm nay chỉ trả hàng của đơn hôm trước (bảng cộng
 *                       -tong_tien_tra nên ra số âm)
 *
 * ⚠️ `bangTinCay` KHÔNG PHẢI trang trí. Bảng tải hỏng thì MỌI khách đều "không
 * có dòng", và máy sẽ báo "hôm nay cả lịch đều im" trong khi sự thật là nó
 * không đọc được gì. Đúng kiểu lỗi đã dính một lần rồi ("đọc cài đặt hỏng" bị
 * hiểu nhầm thành "công tắc tắt"). Chưa chắc bảng đúng thì KHÔNG kết luận gì.
 */
function ghepVoiBang(khachTrongLich, cacDongBang, bangTinCay = true) {
    if (!bangTinCay) {
        return {
            chay: [], thieu: [], tinCay: false,
            thongBao: 'Chưa chắc bảng đang hiện đúng khoảng ngày nên KHÔNG kết luận khách '
                + 'nào có hay không có doanh thu.',
        };
    }
    const theoMa = new Map((cacDongBang || []).map(d => [String(d.maKH), d]));
    const chay = [];
    const thieu = [];
    for (const k of khachTrongLich || []) {
        const d = theoMa.get(String(k.maKH));
        const tien = d ? Number(d.doanhThu) : null;
        if (d && tien > 0) {
            // ⚠️ MANG CỜ `kieu` SANG. Một mốc có thể chứa cả mục hệ thống lẫn
            // mục tự chọn của CÙNG một khách (người dùng đặt hai giờ trùng
            // nhau). Không mang cờ thì `apDungSoDat` chỉ còn mã khách để phân
            // biệt, và nó vứt mất mục hệ thống.
            chay.push({ maKH: d.maKH, tenKH: d.tenKH || k.tenKH, soTien: tien,
                        ...(k.kieu ? { kieu: k.kieu } : {}) });
            continue;
        }
        let lyDo;
        if (!d) lyDo = 'hôm nay chưa phát sinh doanh thu';
        else if (tien === 0) lyDo = 'doanh thu bằng 0 — mua rồi trả hết trong ngày';
        else if (tien < 0) lyDo = `doanh thu âm (${tien}) — trả hàng nhiều hơn bán`;
        else lyDo = 'không đọc được doanh thu';
        thieu.push({ maKH: k.maKH, tenKH: k.tenKH, lyDo,
                     ...(k.kieu ? { kieu: k.kieu } : {}) });
    }
    return { chay, thieu, tinCay: true, thongBao: '' };
}

const API = { TIEN_TO, chuanMotMoc, chuanMoc, chuanMocKeRo, chuanMocThoDai,
              tenBaoThuc, mocTuTen, lanKeTiep, dungLich, duocChay, ghepVoiBang,
              kiemSanSang, gomTheoMoc, khachCuaMoc, khachKhongCoGio,
              khachThieuGioTien, khachThieuTienTuChon, khachHetHanTuChon,
              mocQuaSat, LY_DO,
              ngayVN, congNgay, ngayHetHanTuChon, hetHanTuChon,
              laNgayCuoiTuChon, soNgayConLai, daChayTuChonHomNay, soNgayChayTiep,
              khoiBaThang,
              MUI_GIO };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof globalThis !== 'undefined') globalThis.HDT_HenGio = API;

})();
