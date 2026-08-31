'use strict';

// ============================================================================
//  BÁO VỀ TELEGRAM MỖI KHI XUẤT HÓA ĐƠN THÀNH CÔNG.
//
//  Chủ dự án chốt 2026-08-20: BOT RIÊNG (không dùng chung với project
//  bot-telegram) · CHAT RIÊNG · CHỈ BÁO THÀNH CÔNG.
//
//  ── VIỆC PHỤ, KHÔNG BAO GIỜ ĐƯỢC LÀM HỎNG LƯỢT CHẠY ────────────────────────
//  Telegram sập, mất mạng, sai token — hóa đơn vẫn phải ra bình thường. Mọi
//  hàm ở đây nuốt lỗi và trả về mã lý do, KHÔNG ném ra ngoài.
//
//  ── VÌ SAO GỬI CHỮ TRƠN, KHÔNG MARKDOWN ────────────────────────────────────
//  Tên khách có dấu _ * [ ` là Markdown vỡ, mà lỗi kiểu đó chỉ lộ ra đúng lúc
//  gặp khách có tên ấy — tức là lúc không ai ngồi xem. Chữ trơn thì không có
//  gì để vỡ, và cũng không phải viết hàm thoát ký tự nào.
//
//  ── CHỐNG BÁO TRÙNG ────────────────────────────────────────────────────────
//  Mã gửi sang Sell chạy HAI đường cho cùng một khách: gửi ngay sau mỗi khách,
//  và gửi lại toàn bộ ở cuối loạt làm lưới an toàn. Sell chịu được vì nó chống
//  trùng bằng `ma_lenh`. TELEGRAM THÌ KHÔNG — móc vào một cách ngây thơ là mỗi
//  hóa đơn nhận hai tin, và tin trùng dễ làm người đọc tưởng hóa đơn xuất hai
//  lần. Nên phải có sổ "đã báo" riêng.
//
//  ⚠️ ĐÁNH DẤU TRƯỚC KHI GỬI, GỬI HỎNG THÌ GỠ DẤU RA. Đúng kỷ luật "đánh dấu
//  TRƯỚC khi bấm" của nhanLenh.js. Hai lối kia đều tệ hơn:
//    · gửi xong mới đánh dấu -> service worker chết giữa chừng là BÁO TRÙNG
//    · đánh dấu trước mà không gỡ -> mạng chập một cái là MẤT TIN vĩnh viễn
//  Gỡ dấu xong thì lượt gửi lại ở cuối loạt tự thử lần nữa — được một lần thử
//  lại miễn phí mà không phải dựng hàng chờ mới.
//
//  ⚠️ CHỖ HỞ CÒN LẠI, GHI RA CHO RÕ: Chrome giết service worker ĐÚNG LÚC đang
//  gửi thì dấu vẫn nằm đó và tin mất luôn. Chọn mất tin hơn là báo trùng.
// ============================================================================

(function () {

const KHOA_SO_DA_BAO = 'hdt-telegram-da-bao';
const KHOA_TRANG_THAI = 'hdt-telegram-trang-thai';

/** Giữ tối đa bấy nhiêu bản ghi trong sổ, và bỏ mọi thứ cũ hơn bấy nhiêu ngày. */
const GIOI_HAN_SO = 300;
const NGAY_GIU = 7;
const MOT_NGAY = 24 * 60 * 60 * 1000;

const MUI_GIO = 'Asia/Ho_Chi_Minh';
const RA_HOA_DON = 'RA_HOA_DON';

const chuoi = (v) => String(v == null ? '' : v).trim();

/**
 * Giờ Việt Nam, ÉP CỨNG múi giờ.
 *
 * ⚠️ KHÔNG dùng giờ máy. Máy chạy lúc không có ai ngồi xem; máy đặt sai múi giờ
 * hay đang ở nơi khác thì tin nhắn ghi sai giờ, mà đó lại đúng là thứ chủ dự án
 * yêu cầu phải rõ ("phải ghi rõ ngày và giờ ra").
 */
function chuGio(luc) {
    const t = new Date(Number(luc) || Date.now());
    if (Number.isNaN(t.getTime())) return '';
    try {
        const p = new Intl.DateTimeFormat('en-GB', {
            timeZone: MUI_GIO, year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        }).formatToParts(t).reduce((o, x) => (o[x.type] = x.value, o), {});
        return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
    } catch (e) {
        return '';
    }
}

/** "2026-08-19" -> "19/08/2026". Không đúng dạng thì trả nguyên si. */
function chuNgay(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(chuoi(iso));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : chuoi(iso);
}

const chuTien = (n) => Number(n).toLocaleString('vi-VN');

/** Phần NGÀY trong chuỗi giờ "21/08/2026 08:53:27" -> "21/08/2026". */
const ngayTrongGio = (gio) => String(gio || '').slice(0, 10);

/**
 * Dòng này thuộc loại tin nào — hay không đáng báo (null).
 *
 * ⚠️ CHỦ DỰ ÁN CHỐT 2026-08-22: phải báo CẢ KHI LỖI. Trước đó chỉ báo thành
 * công, nên đêm 21/08 ba tờ ra thì có tin, còn hai lỗi thì IM LẶNG HOÀN TOÀN —
 * kiểu im lặng tệ nhất, vì người đọc tưởng mọi thứ đều ổn.
 *
 * ⛔ NHƯNG KHÔNG BÁO HẾT MỌI THỨ. Báo hết thì ba ngày sau người dùng tắt thông
 * báo, và lúc đó nó vô dụng. Ba loại dưới đây CỐ Ý bị bỏ qua:
 *   · VAO_GIO   — công tắc tự bấm đang TẮT, đúng ý người dùng, không phải lỗi
 *   · BO_QUA    — khách không phát sinh doanh thu, chuyện thường ngày
 *   · CHUA_CHAY — hệ quả của một lỗi khác; tin "cả lượt không chạy" đã nói rồi
 *
 * ⛔ 'VAO_GIO' đặc biệt nguy hiểm nếu báo nhầm: hàng mới nằm trong giỏ, CHƯA
 * có hóa đơn nào. Nhắn "đã xuất hóa đơn" cho cảnh ấy là nói dối trắng trợn.
 */
function loaiTin(dong) {
    const d = dong || {};
    // Không có mã khách hay mã lệnh thì chống trùng vô nghĩa -> thà bỏ qua.
    if (!chuoi(d.ma_khach_hang) || !chuoi(d.ma_lenh)) return null;
    const ket = chuoi(d.ket_qua);
    if (ket === RA_HOA_DON) return Number(d.so_tien) > 0 ? 'RA' : null;
    if (ket === 'LOI') return 'LOI';
    if (ket === 'TREO') return 'TREO';
    return null;
}

/** Giữ tên cũ: "có đáng báo không" giờ là "có thuộc loại nào không". */
function nenBao(dong) {
    return loaiTin(dong) !== null;
}

/**
 * Soạn tin. CHỮ TRƠN — không Markdown, không HTML, không phải thoát gì.
 *
 * ⚠️ `ly_do` chỉ có chữ khi hóa đơn ra DỞ DANG (ra 2/3 tờ rồi dừng). Phải nói
 * ra, nếu không tin nhắn trông y hệt thành công trọn vẹn trong khi tiền còn
 * thiếu — người đọc yên tâm nhầm rồi không bao giờ kiểm lại.
 */
function soanTin(dong) {
    const d = dong || {};
    const ten = chuoi(d.ten_khach_hang);
    const ma = chuoi(d.ma_khach_hang);
    const dong1 = ten && ma ? `${ten} (${ma})` : (ten || ma);

    const loai = loaiTin(d);
    // ⚠️ Dòng ĐẦU quyết định người đọc có mở ra xem hay không. Tin TREO là loại
    // nguy hiểm nhất — máy đã bấm Xác nhận mà không đọc được kết quả, tiền có
    // thể đã lên cơ quan thuế — nên nó phải hét lên, không được lẫn với hai
    // loại kia.
    const dauDe = loai === 'LOI' ? '❌ KHÔNG xuất được hóa đơn'
        : loai === 'TREO' ? '⚠️ KHÔNG RÕ đã xuất hóa đơn hay chưa — HÃY KIỂM TRA TENDOO'
            : '✅ Đã xuất hóa đơn';
    const nhanTien = loai === 'LOI' ? 'Số tiền định xuất' : 'Số tiền';
    const cac = [
        dauDe,
        `Khách hàng: ${dong1}`,
        `${nhanTien}: ${chuTien(d.so_tien)}đ`
            + (Number(d.so_tien_dinh) > 0
                ? ` (định xuất ${chuTien(d.so_tien_dinh)}đ)` : ''),
    ];
    // ── NGÀY SỐ LIỆU: CHỈ HIỆN KHI NÓ KHÁC NGÀY XUẤT ───────────────────────
    //
    // Chủ dự án chốt 2026-08-21: tin nhắn đang lặp ngày hai lần.
    //
    //     Số liệu ngày: 21/08/2026
    //     Lúc: 21/08/2026 08:53:27
    //
    // Hai dòng ấy gần như LUÔN trùng nhau, vì epHomNay.js ép bảng báo cáo về
    // đúng "hôm nay" rồi mới đọc (và còn kiểm chứng lại). Chạy tay thì cũng
    // lấy ngày của máy lúc chạy. Nên bỏ đi KHÔNG mất thông tin gì: ngày vẫn
    // nằm nguyên trong dòng "Lúc".
    //
    // ⚠️ NHƯNG CÓ ĐÚNG MỘT CẢNH CHÚNG KHÁC NHAU: loạt chạy VẮT QUA NỬA ĐÊM.
    // Đọc báo cáo lúc 23:58 ngày 21 thì số liệu là của ngày 21, nhưng tờ thứ
    // năm mãi 00:03 mới ra — "Lúc" ghi ngày 22. Bỏ hẳn dòng này thì tin nhắn
    // nói hóa đơn ra ngày 22 trong khi tiền là doanh thu ngày 21, và KHÔNG có
    // gì báo cho người đọc biết.
    //
    // Nên: giống thì bỏ, khác thì giữ. Ngắn ở mọi lượt bình thường, mà không
    // im lặng đúng lúc cần lên tiếng.
    //
    // Đọc không ra giờ (`gio` rỗng) cũng coi là KHÁC -> vẫn hiện ngày, vì lúc
    // ấy không còn dòng nào mang ngày nữa.
    // ── HAI CON SỐ TỪ SỔ KẾ TOÁN — chủ dự án chốt 31/08/2026 ───────────────
    //
    // Đặt TRƯỚC dòng "Lúc" để tin nhắn đọc theo thứ tự: xuất bao nhiêu, hôm nay
    // bán được bao nhiêu, cả quý đã xuất bao nhiêu, rồi mới tới giờ.
    //
    // ⚠️ THIẾU SỐ THÌ NÓI THẲNG, KHÔNG IM LẶNG BỎ DÒNG — chủ dự án chốt. Bỏ
    // dòng đi thì người đọc tưởng máy quên, không biết là Sell đang hỏng.
    // `undefined` = không đi hỏi (tin cũ, chạy tay); `null` = có hỏi mà không ra.
    //
    // ⚠️ BA TRẠNG THÁI, KHÔNG PHẢI HAI. "Không đọc được" và "khách chưa được
    // chọn trên trang Kế toán" là hai bệnh khác nhau, chữa hai cách khác nhau:
    // một cái là Sell hỏng, một cái là chỉ cần đi tích thêm một ô. Đóng đinh
    // chung một câu là người đọc chữa nhầm bệnh — đúng vết xe lượt 16:45 ngày
    // 24/08/2026 (xem chú thích ở background.js).
    const chuaChon = d.ngoai_bang_ke_toan === true;
    const noSo = (v) => (chuaChon
        ? 'khách chưa được chọn trên trang Kế toán tổng hợp'
        : (v == null ? 'không đọc được' : chuTien(v)));

    if (d.ds_hom_nay !== undefined) {
        cac.push('Doanh thu hôm nay: ' + noSo(d.ds_hom_nay));
    }
    if (d.xhd_quy !== undefined) {
        const ten = Array.isArray(d.quy_thang) && d.quy_thang.length
            ? d.quy_thang.join('-') : '?';
        cac.push(`Quý tháng ${ten}: ` + noSo(d.xhd_quy));
    }

    const gio = chuGio(d.chay_luc);
    const ngay = chuNgay(d.ngay);
    if (ngay && ngay !== ngayTrongGio(gio)) cac.push(`Số liệu ngày: ${ngay}`);
    if (gio) cac.push(`Lúc: ${gio}`);

    // Tin thành công thì lý do (nếu có) là cảnh báo phụ — ra dở dang chẳng hạn.
    // Tin lỗi/treo thì lý do CHÍNH LÀ nội dung, phải gọi đúng tên nó.
    const lyDo = chuoi(d.ly_do);
    if (lyDo) cac.push(loai === 'RA' ? `⚠ ${lyDo}` : `Lý do: ${lyDo}`);
    // ⚠️ HÔM NAY LÀ NGÀY CUỐI của hạn "chạy trong N ngày" — chủ dự án chốt
    // 27/08/2026. Nhắn ở lượt CUỐI chứ không phải hôm sau: hôm sau mốc ấy không
    // còn báo thức nào để đánh thức máy dậy mà nhắn. Nói trước thì còn kịp gia hạn.
    if (d.ngay_cuoi_tu_chon) {
        cac.push('⏳ Đây là NGÀY CUỐI của hạn "tiền/ngày" cho khách này. '
            + 'Từ mai máy KHÔNG xuất hóa đơn tự chọn cho họ nữa — muốn chạy tiếp '
            + 'thì mở bảng cài đặt gõ lại số ngày.');
    }
    return cac.join('\n');
}

/**
 * Lý do "không chạy" nào là CHUYỆN THƯỜNG NGÀY, không đáng làm phiền.
 *
 * ⚠️ KHONG_KHACH_NAO_PHAT_SINH xảy ra gần như MỖI TỐI — khách không mua thì
 * không có gì để xuất. Báo cái này là mỗi ngày một tin rác, và tin rác thì
 * giết luôn giá trị của những tin thật.
 */
// ⚠️ CHỦ DỰ ÁN CHỐT 24/08/2026: BÁO HẾT, kể cả ngày yên ả.
//
// Trước đây hai lý do dưới đây cố ý im, vì "KHONG_KHACH_NAO_PHAT_SINH xảy ra
// gần như MỖI TỐI, báo là mỗi ngày một tin rác". Tôi đã trình đúng lo ngại ấy
// và chủ dự án vẫn chọn báo hết — muốn lượt nào chạy xong cũng biết.
//
// Giữ lại danh sách (rỗng) chứ không xoá hẳn: chỗ này còn nguyên cửa để im lại
// nếu tin rác thành vấn đề, và người đọc mã sau này thấy được quyết định.
const LY_DO_YEN_A = new Set([]);

/**
 * Soạn tin CẢ LƯỢT KHÔNG CHẠY.
 *
 * ⚠️ VÌ SAO PHẢI CÓ RIÊNG. Lượt 18:10 ngày 21/08/2026 không chạy được vì
 * «Không gọi được bongtom.store: Failed to fetch» — lý do ấy nằm ở TẦNG LƯỢT,
 * không dòng khách nào mang nổi. Chỉ báo theo dòng khách thì cả lượt hỏng mà
 * người dùng KHÔNG NHẬN ĐƯỢC GÌ.
 */
function soanTinLuot(banGhi, luc) {
    const b = banGhi || {};
    const bo = (b.khach || []).filter(k => k && chuoi(k.ket) === 'CHUA_CHAY');
    const ten = bo.map(k => chuoi(k.tenKH) || chuoi(k.maKH)).filter(Boolean).slice(0, 5);
    const cac = ['🚫 Cả lượt KHÔNG chạy' + (chuoi(b.moc) ? ` — mốc ${chuoi(b.moc)}` : '')];
    cac.push(`Lý do: ${chuoi(b.thongBao) || chuoi(b.lyDo) || 'không rõ'}`);
    if (bo.length) {
        cac.push(`Bỏ lỡ: ${bo.length} khách`
            + (ten.length ? ` (${ten.join(', ')}${bo.length > ten.length ? '…' : ''})` : ''));
    }
    const gio = chuGio(luc);
    // ⚠️ KÈM SỐ HIỆU BẢN. Ngày 22/08/2026 vá bốn đợt trong một ngày; đọc lại
    // tin cũ mà không biết nó do bản nào sinh ra thì luận bệnh trên cát.
    if (gio) cac.push(`Lúc: ${gio}` + (chuoi(b.banExt) ? ` · bản ${chuoi(b.banExt)}` : ''));
    return cac.join('\n');
}

/**
 * TIN BÁO LỆNH CŨ BỊ BỎ — chủ dự án chốt 31/08/2026.
 *
 * ⚠️ VÌ SAO PHẢI BÁO. Lệnh kẹt lại từ lượt trước là dấu hiệu MỘT LƯỢT ĐÃ BỊ LỠ:
 * khách ấy đáng ra có hóa đơn mà không có. Im lặng dọn đi thì chủ dự án mất một
 * tờ mà không biết vì sao — và trước ngày 31/08 thì còn tệ hơn, lệnh ấy tự ra
 * hóa đơn vào giờ không ai hẹn.
 */
function soanTinBoLenhCu(dsBo, luc, moc) {
    const ds = (Array.isArray(dsBo) ? dsBo : []).filter(Boolean);
    const ten = ds.map(l => `${chuoi(l.tenKH) || chuoi(l.maKH)} (${chuTien(l.soTien)}đ)`)
        .slice(0, 6);
    const cac = [
        '⚠️ ĐÃ BỎ lệnh còn sót từ lượt trước — KHÔNG xuất hóa đơn cho những lệnh này',
        `Số lệnh bỏ: ${ds.length}` + (ten.length ? ` — ${ten.join('; ')}` : ''),
        'Nghĩa là một lượt trước đó đã BỊ LỠ (thường do hai mốc giờ quá sát nhau, '
            + 'lượt sau đụng khóa chống chạy chồng). Hãy giãn các mốc ra cách nhau '
            + 'trên 5 phút, hoặc đặt trùng giờ hẳn.',
    ];
    const gio = chuGio(luc);
    if (gio) cac.push(`Lúc: ${gio}` + (chuoi(moc) ? ` · mốc ${chuoi(moc)}` : ''));
    return cac.join('\n');
}

/** Khoá chống trùng cho tin cả-lượt: mỗi NGÀY + MỐC GIỜ chỉ báo một lần. */
function maLuot(banGhi) {
    const b = banGhi || {};
    const ngay = chuoi(b.ngay && b.ngay.tu) || chuoi(b.ngay) || '';
    return 'luot-' + ngay + '-' + (chuoi(b.moc) || chuoi(b.lyDo));
}

/**
 * Báo CẢ LƯỢT KHÔNG CHẠY. Không bao giờ ném.
 *
 * @returns {Promise<{daGui:number, boQua:number, hong:number, ma?:string}>}
 */
async function baoLuot({ banGhi, caiDat, kho, layFetch, luc }) {
    const kq = { daGui: 0, boQua: 0, hong: 0 };
    try {
        const b = banGhi || {};
        const c = caiDat || {};
        if (!chuoi(c.telegramToken) || !chuoi(c.telegramChatId)) {
            return { ...kq, ma: 'CHUA_KHAI_BAO' };
        }
        // Lượt CÓ chạy thì từng khách đã có tin riêng — không báo thêm gì.
        if (b.chay !== false) { kq.boQua++; return kq; }
        if (LY_DO_YEN_A.has(chuoi(b.lyDo))) { kq.boQua++; return kq; }

        const ma = maLuot(b);
        const nay = Number(luc) || Date.now();
        if (!(await gianhCho(kho, ma, nay))) { kq.boQua++; return kq; }

        const gui = await guiTin(c, soanTinLuot(b, nay), layFetch);
        if (gui.ok) {
            kq.daGui++;
            // Xem chú thích cùng tên ở baoCacDong().
            if (Number(gui.soHong) > 0) {
                kq.hongMotPhan = Number(gui.soHong);
                kq.thongBao = gui.thongBao;
            }
        } else { await traCho(kho, ma); kq.hong++; kq.ma = gui.ma; kq.thongBao = gui.thongBao; }
    } catch (e) {
        kq.hong++; kq.ma = 'NGOAI_LE'; kq.thongBao = chuoi((e && e.message) || e);
    }
    return kq;
}

// ── SỔ "ĐÃ BÁO" ─────────────────────────────────────────────────────────────

/** Bỏ bản ghi quá cũ và cắt bớt cho khỏi phình. Sổ này chạy mãi không ai dọn. */
function donSo(ds, bayGio) {
    const nay = Number(bayGio) || Date.now();
    const con = (Array.isArray(ds) ? ds : [])
        .filter(x => x && chuoi(x.ma) && nay - (Number(x.luc) || 0) < NGAY_GIU * MOT_NGAY);
    return con.slice(-GIOI_HAN_SO);
}

/**
 * GIÀNH CHỖ để báo một dòng: chưa ai báo thì ghi dấu và trả true.
 *
 * Ghi dấu NGAY, trước khi gửi — xem chú thích đầu tệp.
 */
async function gianhCho(kho, ma, luc) {
    if (!kho || !chuoi(ma)) return false;
    let ds;
    try { ds = await kho.doc(); } catch (e) { return false; }
    const con = donSo(ds, luc);
    if (con.some(x => chuoi(x.ma) === chuoi(ma))) return false;   // đã báo rồi
    con.push({ ma: chuoi(ma), luc: Number(luc) || Date.now() });
    try { await kho.ghi(donSo(con, luc)); } catch (e) { return false; }
    return true;
}

/** Trả chỗ đã giành, để lượt gửi sau thử lại. Dùng khi gửi HỎNG. */
async function traCho(kho, ma) {
    if (!kho || !chuoi(ma)) return;
    try {
        const ds = await kho.doc();
        const con = (Array.isArray(ds) ? ds : []).filter(x => chuoi(x && x.ma) !== chuoi(ma));
        await kho.ghi(con);
    } catch (e) { /* mất chỗ trả cũng chỉ là mất một lần thử lại */ }
}

// ── GỬI ─────────────────────────────────────────────────────────────────────

const goc = (token) => 'https://api.telegram.org/bot' + encodeURIComponent(token);

/**
 * Tách ô "Chat id" thành DANH SÁCH NƠI NHẬN.
 *
 * Chủ dự án chốt 26/08/2026: báo về cả nhóm lẫn chat riêng. `caiDat.js` đã
 * chuẩn hoá thành "a, b, c" rồi, nhưng hàm này vẫn tự tách lại — nó còn được
 * gọi với cài đặt dựng tay trong test và với cài đặt cũ đọc thẳng từ kho.
 */
function tachChatId(v) {
    return String(v == null ? '' : v)
        .split(/[,;\s]+/).map(t => t.trim()).filter(Boolean);
}

/** Đợi bấy nhiêu mili-giây. Tách ra để test bơm đồng hồ giả vào được. */
const nghi = (ms) => new Promise(r => setTimeout(r, ms));

/** Đợi tối đa bấy nhiêu giây khi Telegram chặn tốc độ, và thử lại mấy lần. */
const CHO_TOI_DA_GIAY = 30;
const SO_LAN_THU_LAI = 2;

/**
 * Gửi tin tới ĐÚNG MỘT nơi. Không ném lỗi bao giờ.
 *
 * ⚠️ THỬ LẠI KHI BỊ CHẶN TỐC ĐỘ (429), và CHỈ khi đó. Mọi lỗi khác đều là lỗi
 * đứng yên — sai token, sai chat id, bot bị chặn — thử lại chỉ tốn thêm thời
 * gian mà kết quả vẫn thế.
 *
 * Vì sao phải thử lại ở ĐÂY chứ không để lượt gửi lại cuối loạt lo: từ
 * 26/08/2026 một tin đi tới nhiều nơi, và luật "gửi được một nơi là coi như
 * xong" giữ dấu "đã báo". Nơi dính 429 sẽ KHÔNG bao giờ được gọi lại — một cái
 * ngừng vài giây hoá thành mất tin vĩnh viễn.
 *
 * Đợi có TRẦN: Telegram thỉnh thoảng bảo đợi hàng trăm giây, mà đây là việc phụ
 * chạy cạnh luồng phát hành hóa đơn — treo ở đấy còn tệ hơn mất một tin.
 *
 * ⚠️ HỆ QUẢ PHẢI BIẾT: móc "gửi ngay sau mỗi khách" KHÔNG await nên việc phát
 * hành hóa đơn không bị chậm đi một giây nào. Nhưng LƯỚI AN TOÀN CUỐI LOẠT thì
 * CÓ await (xem background.js) — lúc ấy hóa đơn đã ra hết rồi, chỉ còn tiến
 * trình nền sống thêm. Đổi lại, Chrome có thể giết tiến trình nền ĐÚNG LÚC đang
 * đợi, và tin đó mất luôn vì dấu "đã báo" vẫn nằm đó. Đây CHÍNH LÀ chỗ hở đã
 * ghi ở đầu tệp, nay rộng thêm đúng bằng thời gian đợi — nên trần phải nhỏ.
 */
async function guiMotNoi(token, chat, chu, fetchDung, doiHo) {
    const doi = doiHo || nghi;
    for (let lan = 0; ; lan++) {
        const r = await guiMotLan(token, chat, chu, fetchDung);
        if (r.ok || r.ma !== 'BI_CHAN_TOC_DO' || lan >= SO_LAN_THU_LAI) return r;
        const giay = Math.min(Number(r.choGiay) || 1, CHO_TOI_DA_GIAY);
        await doi(giay * 1000);
    }
}

/** Đúng MỘT cú gọi, không thử lại. */
async function guiMotLan(token, chat, chu, fetchDung) {
    try {
        const tra = await fetchDung(goc(token) + '/sendMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // ⛔ KHÔNG parse_mode. Xem chú thích đầu tệp.
            body: JSON.stringify({
                chat_id: chat, text: String(chu), disable_web_page_preview: true,
            }),
        });
        return await docTraLoi(tra);
    } catch (e) {
        return { ok: false, ma: 'KHONG_GOI_DUOC',
                 thongBao: 'Không gọi được Telegram (mất mạng?): '
                           + chuoi((e && e.message) || e) };
    }
}

/**
 * Gửi MỘT tin tới MỌI nơi đã khai. Không ném lỗi bao giờ.
 *
 * ⚠️ GỬI ĐƯỢC MỘT NƠI LÀ `ok`. Nghe rộng rãi quá, nhưng đây là lựa chọn có ý:
 * bên trên, `baoCacDong` chỉ GỠ DẤU "đã báo" khi `ok` sai. Nếu partial mà trả
 * `ok: false` thì dấu bị gỡ, lượt gửi lại ở cuối loạt chạy lần nữa, và nơi
 * ĐÃ NHẬN ĐƯỢC sẽ nhận tin thứ hai — đúng cái "báo trùng" mà cả tệp này dựng
 * lên để tránh (xem chú thích đầu tệp: "Chọn mất tin hơn là báo trùng").
 *
 * Đổi lại, nơi nào hỏng KHÔNG được im lặng: `chiTiet` kể ra từng nơi, và
 * `thongBao` nói thẳng nơi nào hỏng vì sao, để popup bày ra cho người dùng.
 *
 * @returns {Promise<{ok:boolean, ma?:string, thongBao?:string,
 *                    soNoi:number, soDat:number, soHong:number, chiTiet:Array}>}
 */
async function guiTin(caiDat, chu, layFetch, doiHo) {
    const c = caiDat || {};
    const token = chuoi(c.telegramToken);
    const cacChat = tachChatId(c.telegramChatId);
    const trong = { soNoi: 0, soDat: 0, soHong: 0, chiTiet: [] };
    // Chưa khai thì THÔI, không phải lỗi: người dùng có thể cố ý không dùng.
    if (!token || !cacChat.length) return { ok: false, ma: 'CHUA_KHAI_BAO', ...trong };
    if (!chuoi(chu)) return { ok: false, ma: 'KHONG_CO_NOI_DUNG', ...trong };

    const fetchDung = layFetch || (typeof fetch !== 'undefined' ? fetch : null);
    if (!fetchDung) return { ok: false, ma: 'KHONG_CO_FETCH', ...trong };

    const chiTiet = [];
    for (const chat of cacChat) {
        // ⚠️ TUẦN TỰ, không Promise.all. Telegram chặn tốc độ (429) khi bắn dồn,
        // mà một lượt chạy chỉ có vài nơi nhận — nhanh hơn vài trăm mili-giây
        // không đáng để đánh đổi lấy một tin bị chặn.
        const r = await guiMotNoi(token, chat, chu, fetchDung, doiHo);
        chiTiet.push({ chat, ok: !!r.ok, ma: r.ma, thongBao: r.thongBao });
    }

    const hong = chiTiet.filter(x => !x.ok);
    const dat = chiTiet.length - hong.length;
    const keHong = hong.map(x => `${x.chat}: ${x.thongBao || x.ma || 'không rõ'}`).join(' · ');
    return {
        ok: dat > 0,
        // Hỏng hết thì mượn mã của nơi đầu tiên, để mã lý do cũ vẫn dùng được.
        ...(dat > 0 ? {} : { ma: (hong[0] && hong[0].ma) || 'KHONG_GUI_DUOC' }),
        ...(keHong ? { thongBao: keHong } : {}),
        soNoi: chiTiet.length, soDat: dat, soHong: hong.length, chiTiet,
    };
}

/**
 * Đọc trả lời của Telegram và DỊCH RA TIẾNG NGƯỜI.
 *
 * ⚠️ "Telegram trả về 401" thì không ai đoán ra phải làm gì. Cùng bài học với
 * lỗi 403 của bongtom.store trong dayVeSell.js — nói thẳng phải sửa ở đâu.
 */
async function docTraLoi(tra) {
    if (!tra) return { ok: false, ma: 'KHONG_CO_TRA_LOI' };
    let than = null;
    try { than = await tra.json(); } catch (e) { than = null; }
    if (tra.ok && than && than.ok) return { ok: true, than };

    const maSo = Number(tra.status) || (than && Number(than.error_code)) || 0;
    const moTa = chuoi(than && than.description);
    if (maSo === 401) {
        return { ok: false, ma: 'SAI_TOKEN',
                 thongBao: 'Telegram TỪ CHỐI TOKEN. Mở @BotFather, lấy lại token của bot '
                           + 'rồi khai lại ở đây.' };
    }
    if (maSo === 400 && /chat not found/i.test(moTa)) {
        return { ok: false, ma: 'SAI_CHAT_ID',
                 thongBao: 'Telegram không tìm thấy đoạn chat này. Hãy NHẮN CHO BOT một câu '
                           + 'bất kỳ trước (bot không nhắn trước cho người lạ được), rồi bấm '
                           + '"Dò chat id".' };
    }
    // ⚠️ 429 LÀ LỖI TẠM THỜI, KHÁC HẲN MỌI LỖI TRÊN. Telegram chặn tốc độ
    // (khoảng 20 tin/phút vào cùng một nhóm) rồi bảo đợi bao lâu. Từ 26/08/2026
    // mỗi tin đi tới NHIỀU nơi nên số lần gọi nhân lên, dễ chạm ngưỡng hơn hẳn.
    //
    // Phải tách riêng vì luật "hỏng một phần thì giữ dấu" biến một cái ngừng vài
    // giây thành MẤT TIN VĨNH VIỄN ở nơi bị chặn. Bên gọi (guiMotNoi) đợi rồi
    // thử lại chính nơi đó.
    if (maSo === 429) {
        const cho = Number(than && than.parameters && than.parameters.retry_after) || 0;
        return { ok: false, ma: 'BI_CHAN_TOC_DO', choGiay: cho,
                 thongBao: 'Telegram chặn tốc độ, bảo đợi '
                           + (cho ? cho + ' giây' : 'một lát') + '.' };
    }
    if (maSo === 403) {
        return { ok: false, ma: 'BOT_BI_CHAN',
                 thongBao: 'Bot đang bị chặn hoặc bạn chưa bắt đầu đoạn chat. Mở Telegram, '
                           + 'nhắn cho bot một câu rồi thử lại.' };
    }
    return { ok: false, ma: 'TELEGRAM_TU_CHOI',
             thongBao: 'Telegram từ chối' + (maSo ? ` (mã ${maSo})` : '')
                       + (moTa ? `: ${moTa}` : '') };
}

/** Gửi thử — để người dùng biết ngay token và chat id có đúng không. */
function guiThu(caiDat, layFetch, luc) {
    return guiTin(caiDat,
        'Chào! Extension hóa đơn Tendoo đã nối được với Telegram.\n'
        + 'Từ giờ mỗi khi xuất hóa đơn xong, tin sẽ về đây.\n'
        + 'Lúc gửi thử: ' + chuGio(luc), layFetch);
}

/**
 * DÒ CHAT ID từ tin nhắn người dùng vừa gửi cho bot.
 *
 * Người dùng không có cách nào tự biết chat id của mình. Bắt họ đi tìm ở một
 * bot lạ nào đó là đẩy bí mật sang tay bên thứ ba — dò bằng chính bot của mình
 * thì không phải nhờ ai.
 *
 * ⚠️ TRẢ VỀ CẢ NHÓM, KHÔNG CÒN LỌC RIÊNG CHAT CÁ NHÂN — chủ dự án đảo lại
 * quyết định cũ ngày 26/08/2026 khi muốn báo về cả nhóm. Bản cũ lọc
 * `type === 'private'`, nên thêm bot vào nhóm xong bấm nút này vẫn không bao
 * giờ ra id nhóm, và người dùng không hiểu vì sao.
 *
 * ⚠️ NHÓM CHỈ HIỆN RA KHI BOT ĐỌC ĐƯỢC TIN. Telegram mặc định BẬT "privacy
 * mode": trong nhóm, bot chỉ nhận tin bắt đầu bằng "/" hoặc có nhắc tên nó.
 * Nên phải bảo người dùng gõ "/start@tên_bot" TRONG NHÓM, chứ nhắn câu thường
 * là getUpdates rỗng và nút này im lặng vô lý.
 *
 * `chatId` / `ten` vẫn giữ nguyên (nơi gần nhất) để chỗ gọi cũ không phải sửa;
 * `cacChat` là danh sách đầy đủ để màn khai báo bày ra cho người dùng chọn.
 */
async function doChatId(caiDat, layFetch) {
    const token = chuoi((caiDat || {}).telegramToken);
    if (!token) return { ok: false, ma: 'CHUA_CO_TOKEN',
                         thongBao: 'Khai token của bot trước đã.' };
    const fetchDung = layFetch || (typeof fetch !== 'undefined' ? fetch : null);
    if (!fetchDung) return { ok: false, ma: 'KHONG_CO_FETCH' };

    let tra;
    try {
        tra = await fetchDung(goc(token) + '/getUpdates', { method: 'GET' });
    } catch (e) {
        return { ok: false, ma: 'KHONG_GOI_DUOC',
                 thongBao: 'Không gọi được Telegram (mất mạng?).' };
    }
    const kq = await docTraLoi(tra);
    if (!kq.ok) return kq;

    const tin = ((kq.than && kq.than.result) || [])
        .map(u => (u && (u.message || u.edited_message)) || null)
        .filter(m => m && m.chat && m.chat.id != null);
    if (!tin.length) {
        return { ok: false, ma: 'CHUA_CO_TIN',
                 thongBao: 'Chưa thấy tin nhắn nào. Muốn lấy CHAT RIÊNG thì nhắn cho bot '
                           + 'một câu bất kỳ; muốn lấy NHÓM thì vào nhóm gõ '
                           + '"/start@tên_bot" (nhóm phải gõ đúng kiểu này, bot không '
                           + 'đọc được tin thường). Xong bấm lại nút này.' };
    }

    // Bỏ trùng theo id, GIỮ LẦN NHẮC CUỐI CÙNG của mỗi nơi — tên nhóm có thể
    // vừa đổi, và cái mới mới là cái người dùng đang nhìn thấy trên Telegram.
    const theoId = new Map();
    for (const m of tin) {
        const ch = m.chat;
        theoId.set(String(ch.id), {
            id: String(ch.id),
            loai: chuoi(ch.type),
            nhom: chuoi(ch.type) !== 'private',
            ten: chuoi(ch.title || ch.username || ch.first_name),
        });
    }
    const cacChat = [...theoId.values()];
    const cuoi = cacChat[cacChat.length - 1];
    return { ok: true, chatId: cuoi.id, ten: cuoi.ten, cacChat };
}

// ── ĐƯỜNG CHÍNH: BÁO CHO MỘT MẺ DÒNG ───────────────────────────────────────

/**
 * Lọc, chống trùng, rồi gửi.
 *
 * ⛔ KHÔNG BAO GIỜ NÉM. Hàm này chạy cạnh luồng phát hành hóa đơn; ném ra là
 * kéo theo cả thứ quan trọng hơn nó rất nhiều.
 *
 * @returns {Promise<{daGui:number, boQua:number, hong:number, ma?:string}>}
 */
async function baoCacDong({ cacDong, caiDat, kho, layFetch, luc }) {
    const kq = { daGui: 0, boQua: 0, hong: 0 };
    try {
        const c = caiDat || {};
        if (!chuoi(c.telegramToken) || !chuoi(c.telegramChatId)) {
            return { ...kq, ma: 'CHUA_KHAI_BAO' };
        }
        const ds = (Array.isArray(cacDong) ? cacDong : [cacDong]).filter(Boolean);
        const nay = Number(luc) || Date.now();

        for (const dong of ds) {
            if (!loaiTin(dong)) { kq.boQua++; continue; }
            const ma = chuoi(dong.ma_lenh);
            if (!(await gianhCho(kho, ma, nay))) { kq.boQua++; continue; }

            const gui = await guiTin(c, soanTin(dong), layFetch);
            if (gui.ok) {
                kq.daGui++;
                // ⚠️ GỬI ĐƯỢC MỘT NƠI CŨNG LÀ `ok` (xem guiTin), nên chỗ này
                // phải TỰ NÓI RA nơi nào trượt. Không nói thì màn khai báo chỉ
                // thấy "✓ đã nhắn N tin" trong khi cả tháng nhóm không nhận gì.
                if (Number(gui.soHong) > 0) {
                    kq.hongMotPhan = (kq.hongMotPhan || 0) + Number(gui.soHong);
                    kq.thongBao = gui.thongBao;
                }
            } else {
                // Trả chỗ để lượt gửi lại ở cuối loạt còn thử được lần nữa.
                await traCho(kho, ma);
                kq.hong++;
                kq.ma = gui.ma;
                kq.thongBao = gui.thongBao;
            }
        }
    } catch (e) {
        kq.hong++;
        kq.ma = 'NGOAI_LE';
        kq.thongBao = chuoi((e && e.message) || e);
    }
    return kq;
}

const API = {
    baoCacDong, baoLuot, soanTin, soanTinLuot, soanTinBoLenhCu, maLuot, nenBao, loaiTin,
    chuGio, chuNgay, ngayTrongGio, donSo, LY_DO_YEN_A,
    gianhCho, traCho, guiTin, guiMotNoi, guiMotLan, tachChatId, guiThu, doChatId, docTraLoi,
    CHO_TOI_DA_GIAY, SO_LAN_THU_LAI,
    KHOA_SO_DA_BAO, KHOA_TRANG_THAI, GIOI_HAN_SO, NGAY_GIU, MUI_GIO,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof globalThis !== 'undefined') globalThis.HDT_BaoTelegram = API;

})();
