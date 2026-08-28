'use strict';

// ============================================================================
//  CÀI ĐẶT — chuẩn hóa và GỘP, ở một chỗ duy nhất.
//
//  Trước đây phần gộp nằm thẳng trong background.js nên không test được, mà đây
//  lại đúng là chỗ dễ sai nhất: mỗi công tắc trong popup chỉ gửi phần của mình,
//  ghi đè cả gói là gạt công tắc này thì công tắc kia tự tắt theo.
//
//  ⚠️ NGUYÊN TẮC: đọc hỏng thì KHÔNG BAO GIỜ ngả về phía "được phép". Không đọc
//  được cài đặt nghĩa là không biết người dùng muốn gì -> coi như mọi công tắc
//  đều TẮT, và `docDuoc: false` để tầng trên báo lỗi thay vì báo "Xong".
// ============================================================================

(function () {

const DUNG_SAI_MAC_DINH = 200000;

/** Mức lệch mà vượt qua thì phải cảnh báo người dùng. Không phải trần cứng. */
const DUNG_SAI_DANG_LO = 200000;

// TRẦN MỖI HÓA ĐƠN — chủ dự án chốt 2026-08-18. Một khách có doanh thu lớn thì
// chẻ thành nhiều hóa đơn trên CÙNG tài khoản Tendoo đó, mỗi tờ không quá mức
// này. Đặt 0 (ô để trống) = KHÔNG chẻ nhỏ, ra đúng một tờ như trước.
const TRAN_MOI_HOA_DON_MAC_DINH = 2000000;

const MAC_DINH = {
    tuBam: false, daHieu: false, xoaGioLa: false, boQuaThue: false,
    dungSai: DUNG_SAI_MAC_DINH,
    tranMoiHoaDon: TRAN_MOI_HOA_DON_MAC_DINH,
    // `urlBang` là địa chỉ trang báo cáo lúc người dùng lưu lịch. Tới giờ, máy
    // cần mở lại ĐÚNG trang đó để đọc số mới — bongtom.store và 127.0.0.1:8000
    // là hai nơi khác nhau, đoán bừa là đọc nhầm bảng của môi trường khác.
    henGio: { bat: false, moc: [], khach: [], urlBang: '' },
    // Nơi đẩy kết quả về cho trang "Kế toán tổng hợp" bên Sell. Để trống thì
    // không đẩy — người dùng có thể cố ý không dùng trang kế toán.
    sellUrl: '',
    sellToken: '',
    // Báo về Telegram mỗi khi xuất hóa đơn xong. BOT RIÊNG, chat riêng — chủ dự
    // án chốt 2026-08-20. Để trống BẤT KỲ ô nào = TẮT hẳn tính năng, y như
    // sellUrl/sellToken ngay trên.
    telegramToken: '',
    telegramChatId: '',
};

/**
 * TRẦN MỖI HÓA ĐƠN, đọc từ thứ người dùng gõ vào ô.
 *
 * ⚠️ KHÁC HẲN chuanDungSai: ở đây RỖNG hay ĐỌC KHÔNG RA đều trả 0, nghĩa là
 * "không chẻ nhỏ". Rơi về mặc định 2 triệu như dung sai thì người xóa trắng ô
 * để tắt tính năng lại bị bật lên — im lặng chẻ hóa đơn của họ thành nhiều tờ.
 * Số âm cũng là 0: không có nghĩa nào khác hợp lý.
 */
function chuanTranMoiHoaDon(v) {
    if (v == null || v === '') return 0;
    const so = typeof v === 'number' ? v : Number(String(v).replace(/[.,\s]/g, ''));
    if (!Number.isFinite(so) || so <= 0) return 0;
    return Math.floor(so);
}

/**
 * Độ lệch tối đa, đọc từ thứ người dùng gõ vào ô.
 *
 * Nhận cả "250.000", "250000", " 250,000 " — người ta gõ tiền có dấu chấm là
 * chuyện thường. Không đọc ra số thì trả về mặc định 200.000 chứ KHÔNG trả 0:
 * dung sai 0 nghĩa là đòi khớp tuyệt đối từng đồng, gần như không khách nào
 * ghép được, và người dùng sẽ tưởng máy hỏng chứ không nghĩ là do gõ sai.
 */
function chuanDungSai(v) {
    if (v == null || v === '') return DUNG_SAI_MAC_DINH;
    const so = typeof v === 'number' ? v : Number(String(v).replace(/[.,\s]/g, ''));
    if (!Number.isFinite(so) || so < 0) return DUNG_SAI_MAC_DINH;
    return Math.floor(so);
}

/**
 * SỐ TIỀN XUẤT MỖI NGÀY — phải là số nguyên DƯƠNG. Không phải thì trả null.
 *
 * ⚠️ Nhận cả chuỗi có dấu chấm/phẩy nhóm nghìn ("1.500.000") vì người dùng gõ
 * tay vào ô trên trang. Nhưng số âm, số 0, số lẻ đồng và chữ rác đều BỊ BỎ:
 * con số này đi thẳng vào hóa đơn thuế, không có chỗ cho "gần đúng".
 */
function chuanSoTienNgay(v) {
    if (v == null || v === '') return null;
    const chu = String(v).trim();
    // ⚠️ CHỈ nhận hai dạng: chữ số trần ("1500000") hoặc nhóm nghìn ĐÚNG CHUẨN
    // ("1.500.000" / "1,500,000"). Mọi thứ khác BỎ.
    //
    // Vì sao chặt đến vậy: bản nháp của tôi chỉ bóc hết dấu chấm phẩy rồi cộng
    // lại, nên "1.5" ra 15. Người gõ "1.5" gần như chắc chắn định nói 1,5 triệu
    // — mà máy lại hiểu là mười lăm đồng, rồi đem con số ấy đi xuất hóa đơn
    // thuế. Chỗ này không có quyền đoán: mập mờ thì từ chối.
    const goc = chu.replace(/\s+/g, '');
    if (!/^\d+$/.test(goc) && !/^\d{1,3}(?:[.,]\d{3})+$/.test(goc)) return null;
    const so = Number(goc.replace(/[.,]/g, ''));
    if (!Number.isFinite(so) || !Number.isInteger(so) || so <= 0) return null;
    // ⚠️ TRÊN 2^53 THÌ JAVASCRIPT KHÔNG GIỮ NỔI TỪNG ĐỒNG. Gõ
    // "9007199254740993" mà `Number()` trả về "…992" — lệch một đồng, im lặng,
    // rồi con số sai ấy đi thẳng vào hóa đơn thuế. Thà TỪ CHỐI còn hơn lưu một
    // số khác số người dùng gõ; mà số tiền cỡ ấy thì chắc chắn là gõ nhầm.
    if (so > Number.MAX_SAFE_INTEGER) return null;
    return so;
}

/**
 * SỐ NGÀY lượt tự chọn được phép chạy. Không hợp lệ / để trống -> null (chạy mãi).
 *
 * ⚠️ Cố tình KHÔNG nhận dấu nhóm nghìn: đây là số ngày, "1.000 ngày" là gõ nhầm
 * chứ không phải ý thật. Trần 3650 (mười năm) để một cú gõ thừa số 0 không biến
 * thành cái hạn không bao giờ tới.
 */
function chuanSoNgay(v) {
    if (v == null || v === '') return null;
    const chu = String(v).trim();
    if (!/^\d+$/.test(chu)) return null;
    const so = Number(chu);
    if (!Number.isInteger(so) || so <= 0 || so > 3650) return null;
    return so;
}

/**
 * Danh sách khách của lịch hẹn: mã, tên, MỐC GIỜ RIÊNG và SỐ TIỀN MỖI NGÀY
 * (cả hai đều tùy chọn).
 *
 * ⚠️ Khách có `moc` riêng thì GIỜ CHUNG KHÔNG đụng tới nữa (xem henGio.gomTheoMoc).
 * Bỏ trùng theo mã, giữ nguyên thứ tự.
 */
function chuanKhach(ds, HenGio, gioChung, khachCu) {
    if (!Array.isArray(ds)) return [];
    // Bản ĐANG LƯU, để biết hạn tự chọn của khách đã bắt đầu từ hôm nào.
    const cuTheoMa = new Map((Array.isArray(khachCu) ? khachCu : [])
        .map(x => [String((x && x.maKH) || '').trim(), x || {}]));
    const thay = new Set();
    const ra = [];
    for (const k of ds) {
        const ma = String((k && k.maKH) || '').trim();
        if (!ma || thay.has(ma)) continue;
        thay.add(ma);
        const o = { maKH: ma, tenKH: String((k && k.tenKH) || '').trim() };
        // Giờ riêng gõ sai thì BỎ HẲN, coi như theo giờ chung — thà chạy theo
        // giờ chung còn hơn giữ một mốc vô nghĩa rồi khách không bao giờ chạy.
        const moc = HenGio ? HenGio.chuanMotMoc(k && k.moc) : null;
        if (moc) o.moc = moc;
        // `soTienNgay`: SỐ TIỀN XUẤT MỖI NGÀY do người dùng tự đặt, thay HẲN cho
        // doanh số hôm nay. KHÔNG so với dữ liệu nào — chủ dự án chốt 25/08/2026.
        //
        // ⚠️ GÕ SAI THÌ BỎ HẲN, y như giờ riêng ở trên — ô rỗng nghĩa là "chạy
        // nếp cũ", và nếp cũ thì đã chạy đúng. Giữ lại một con số rác ở đây là
        // đem nó đi xuất hóa đơn thuế.
        const soTien = chuanSoTienNgay(k && k.soTienNgay);
        if (soTien != null) o.soTienNgay = soTien;

        // ── HAI LỊCH TÁCH RỜI — chủ dự án chốt 27/08/2026 ───────────────────
        //
        //   · hệ thống  — xuất theo DOANH THU hôm nay, giờ ở `moc`
        //   · tự chọn   — xuất đúng `soTienNgay`, giờ ở `mocTien`
        //
        // Hai lịch KHÔNG liên quan gì nhau: một khách có thể ra HAI hóa đơn
        // trong ngày, mỗi cái một giờ.
        //
        // ⚠️ VÌ SAO CHUYỆN NÀY KHÔNG PHÁ LUẬT "MỖI NGÀY ĐÚNG MỘT MỐC"
        // (henGio.js, chốt 13/08/2026): luật ấy sinh ra vì lượt HỆ THỐNG lấy
        // "doanh thu hôm nay tính tới lúc chạy", chạy hai lần là tính trùng
        // phần buổi sáng. Lượt TỰ CHỌN không đọc doanh thu, không có gì để
        // tính trùng. Nên vẫn ĐÚNG MỘT lượt hệ thống mỗi ngày, cộng thêm lượt
        // tự chọn độc lập.
        const mocTien = HenGio ? HenGio.chuanMotMoc(k && k.mocTien) : null;
        if (mocTien) o.mocTien = mocTien;

        // ⚠️ CHUYỂN CÀI ĐẶT CŨ SANG KIỂU MỚI — chỗ này quyết định hóa đơn THẬT.
        // Bản ghi cũ không có hai cờ này. Nếp cũ: có `soTienNgay` thì con số ấy
        // THAY HẲN doanh thu, và khách ra ĐÚNG MỘT tờ tại `moc`. Nên chuyển
        // sang: bật tự chọn, TẮT hệ thống, giờ tự chọn lấy chính `moc` cũ.
        //
        // Bật cả hai ở đây là PHÁT HÀNH THÊM HÓA ĐƠN THUẾ mà người dùng chưa
        // bao giờ yêu cầu, và hóa đơn đã gửi cơ quan thuế thì không rút lại
        // được. Thà giữ nguyên như hôm qua rồi để họ tự bật.
        const cu = !('batHeThong' in (k || {})) && !('batTuChon' in (k || {}));
        if (cu) {
            if (o.soTienNgay) {
                o.batHeThong = false;
                o.batTuChon = true;
                    // ⚠️ KHÔNG CÓ GIỜ RIÊNG THÌ KẾ THỪA GIỜ CHUNG. Nếp cũ: khách
                // để trống ô giờ vẫn chạy — theo giờ chung. Bỏ trống `mocTien`
                // ở đây là lượt tự chọn NGỪNG CHẠY HẲN từ mai, và người dùng
                // chỉ biết khi tối ngồi đếm thiếu một tờ hóa đơn.
                if (!o.mocTien) o.mocTien = o.moc || gioChung || '';
                if (!o.mocTien) delete o.mocTien;
            } else {
                o.batHeThong = true;
                o.batTuChon = false;
            }
        } else {
            o.batHeThong = !!(k && k.batHeThong);
            o.batTuChon = !!(k && k.batTuChon);
        }

        // ── HẠN CHẠY CỦA LƯỢT TỰ CHỌN — chủ dự án chốt 27/08/2026 ───────────
        //
        // Lưu HAI con số đứng yên (số ngày + ngày bắt đầu), KHÔNG lưu số đếm
        // lùi. `henGio.ngayHetHanTuChon` tính lại mỗi lần từ hai con số ấy.
        // Xem chú thích dài ở đó: số đếm lùi phải trừ đúng một lần mỗi ngày,
        // mà Chrome giết tiến trình nền giữa chừng là chuyện thường.
        const soNgay = chuanSoNgay(k && k.soNgayTuChon);
        if (soNgay != null && o.batTuChon) {
            o.soNgayTuChon = soNgay;
            // ⚠️ MỐC BẮT ĐẦU CHỈ ĐẶT LẠI KHI SỐ NGÀY ĐỔI. Nếu mỗi lần bấm Lưu
            // mà mốc nhảy về hôm nay thì hạn "7 ngày" chạy MÃI MÃI: người dùng
            // sửa giờ của khách khác, bấm Lưu, thế là gia hạn cả bảng mà không
            // ai hay.
            //
            // So với BẢN ĐANG LƯU (`cu`), không so với thứ màn hình gửi lên —
            // màn hình không gửi mốc bắt đầu, và bắt nó gửi là đặt một luật
            // quan trọng vào chỗ không bài kiểm nào với tới.
            const truoc = cuTheoMa.get(ma) || {};
            const batDauCu = String(truoc.batDauTuChon || '').trim();
            const giuMoc = Number(truoc.soNgayTuChon) === soNgay
                && /^\d{4}-\d{2}-\d{2}$/.test(batDauCu);
            const batDau = giuMoc ? batDauCu : (HenGio ? HenGio.ngayVN() : '');
            if (batDau) o.batDauTuChon = batDau;
        }
        ra.push(o);
    }
    return ra;
}

/**
 * CHUẨN HOÁ DANH SÁCH CHAT ID của Telegram.
 *
 * Chủ dự án chốt 26/08/2026: báo về CẢ NHÓM LẪN CHAT RIÊNG. Nên ô "Chat id"
 * nhận NHIỀU nơi, cách nhau dấu phẩy (xuống dòng hay khoảng trắng cũng được —
 * người ta dán từ chỗ khác vào là hay dính mấy thứ đó).
 *
 * ⚠️ MỘT ID VẪN RA ĐÚNG MỘT ID, không thêm dấu phẩy, không đổi gì. Cài đặt
 * đang chạy của người dùng phải qua đây mà không suy suyển.
 *
 * Chỉ nhận hai dạng Telegram thật sự hiểu:
 *   · số  — chat riêng dương, nhóm âm (-100…)
 *   · @ten — kênh/nhóm công khai
 * Rác thì BỎ HẲN. Giữ lại một id sai là mỗi lượt chạy lại tốn một lần gọi hỏng
 * và một dòng báo lỗi, mà không nơi nào nhận thêm được gì.
 */
function chuanChatId(v) {
    const thay = new Set();
    const ra = [];
    for (const phan of String(v == null ? '' : v).split(/[,;\s]+/)) {
        const t = phan.trim();
        if (!t) continue;
        if (!/^-?\d+$/.test(t) && !/^@[A-Za-z0-9_]{3,}$/.test(t)) continue;
        if (thay.has(t)) continue;
        thay.add(t);
        ra.push(t);
    }
    return ra.join(', ');
}

/**
 * GỘP cài đặt mới vào cài đặt cũ.
 *
 * Chỉ đụng tới trường nào CÓ MẶT trong `tin`. Đây là điểm mấu chốt: popup và
 * bảng cài đặt bên trang Sell là hai nơi khác nhau, mỗi nơi chỉ gửi phần nó
 * quản. Ghi đè cả gói là nơi này lưu thì nơi kia mất.
 */
function gop(cu, tin, HenGio) {
    const c = { ...MAC_DINH, ...(cu || {}) };
    const t = tin || {};

    if ('tuBam' in t || 'daHieu' in t) {
        c.tuBam = !!t.tuBam;
        // "Đã hiểu" chỉ có nghĩa khi công tắc bật. Tắt rồi mà vẫn giữ dấu đã
        // hiểu thì lần bật sau sẽ bỏ qua bước xác nhận — không được.
        c.daHieu = !!(t.tuBam && t.daHieu);
    }
    if ('xoaGioLa' in t) c.xoaGioLa = !!t.xoaGioLa;
    if ('boQuaThue' in t) c.boQuaThue = !!t.boQuaThue;
    if ('dungSai' in t) c.dungSai = chuanDungSai(t.dungSai);
    if ('tranMoiHoaDon' in t) c.tranMoiHoaDon = chuanTranMoiHoaDon(t.tranMoiHoaDon);
    // Bỏ dấu / thừa ở cuối để khỏi ra "…//api/…" khi ghép đường dẫn.
    if ('sellUrl' in t) c.sellUrl = String(t.sellUrl || '').trim().replace(/\/+$/, '');
    if ('sellToken' in t) c.sellToken = String(t.sellToken || '').trim();
    // ⚠️ CHỈ GHI ĐÈ KHI CÓ CHỮ. Màn khai báo KHÔNG BAO GIỜ vẽ lại bí mật đã lưu
    // (xem popup/khaiBao.js), nên ô trống nghĩa là "giữ nguyên cái cũ" chứ
    // không phải "xóa đi". Nhận cả chuỗi rỗng ở đây là mỗi lần người dùng bấm
    // Lưu vì việc khác lại âm thầm xóa mất token — tính năng tắt mà không ai hay.
    if ('telegramToken' in t && String(t.telegramToken || '').trim()) {
        c.telegramToken = String(t.telegramToken).trim();
    }
    if ('telegramChatId' in t && String(t.telegramChatId || '').trim()) {
        c.telegramChatId = chuanChatId(t.telegramChatId);
    }
    // Muốn TẮT thì phải nói thẳng, không nhập nhằng với ô để trống.
    if (t.xoaTelegram === true) { c.telegramToken = ''; c.telegramChatId = ''; }

    if ('henGio' in t) {
        const h = t.henGio || {};
        const cuH = c.henGio || MAC_DINH.henGio;
        const moc = 'moc' in h
            ? (HenGio ? HenGio.chuanMoc(h.moc) : (Array.isArray(h.moc) ? h.moc : []))
            : (cuH.moc || []);
        c.henGio = {
            bat: 'bat' in h ? !!h.bat : !!cuH.bat,
            moc,
            khach: 'khach' in h
                ? chuanKhach(h.khach, HenGio, moc[0], cuH.khach)
                : (cuH.khach || []),
            urlBang: 'urlBang' in h ? String(h.urlBang || '') : String(cuH.urlBang || ''),
        };
        // Bật lịch mà không có khách, hoặc không có MỐC NÀO (kể cả giờ riêng của
        // khách), thì lịch vô nghĩa — để nguyên "bật" chỉ làm người dùng tưởng
        // máy sẽ chạy. Tắt thẳng.
        // ⚠️ PHẢI ĐẾM CẢ GIỜ TIỀN/NGÀY. Bản 27/08 chỉ nhìn `k.moc` (giờ của lượt
        // hệ thống), nên khách chỉ đặt giờ tiền/ngày mà không có giờ chung là
        // bấm Lưu một cái LỊCH TỰ TẮT — không chạy gì, không báo gì, người dùng
        // chỉ biết khi tối ngồi đếm không thấy tờ nào.
        const coMocNaoDo = c.henGio.moc.length > 0
            || c.henGio.khach.some(k => k.moc || (k.batTuChon && k.mocTien));
        if (c.henGio.bat && (!coMocNaoDo || !c.henGio.khach.length)) {
            c.henGio.bat = false;
        }
    }

    return c;
}

/** Đọc cài đặt từ kho ra, luôn đủ trường, luôn có cờ `docDuoc`. */
function tuKho(o, docDuoc) {
    const c = { ...MAC_DINH, ...(o || {}) };
    c.dungSai = chuanDungSai(c.dungSai);
    c.tranMoiHoaDon = chuanTranMoiHoaDon(c.tranMoiHoaDon);
    const h = c.henGio || {};
    c.henGio = {
        bat: !!h.bat,
        moc: Array.isArray(h.moc) ? h.moc.slice() : [],
        // ⚠️ Đọc từ kho thì bản "cũ" CHÍNH LÀ nó: mốc bắt đầu đã lưu phải được
        // giữ nguyên, không được đặt lại thành hôm nay mỗi lần khởi động.
        khach: chuanKhach(h.khach,
                          (typeof globalThis !== 'undefined' && globalThis.HDT_HenGio) || null,
                          (Array.isArray(h.moc) ? h.moc : [])[0],
                          h.khach),
        urlBang: String(h.urlBang || ''),
    };
    c.daHieu = !!(c.tuBam && c.daHieu);
    c.sellUrl = String(c.sellUrl || '').trim().replace(/\/+$/, '');
    c.sellToken = String(c.sellToken || '').trim();
    c.telegramToken = String(c.telegramToken || '').trim();
    c.telegramChatId = chuanChatId(c.telegramChatId);
    c.docDuoc = docDuoc !== false;
    return c;
}

/** Cài đặt "khóa hết" dùng khi đọc kho hỏng. */
const khiDocHong = () => tuKho(null, false);

const API = { chuanSoTienNgay, MAC_DINH, DUNG_SAI_MAC_DINH, DUNG_SAI_DANG_LO,
              TRAN_MOI_HOA_DON_MAC_DINH,
              chuanDungSai, chuanTranMoiHoaDon, chuanKhach, chuanChatId, chuanSoNgay,
              gop, tuKho, khiDocHong };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof globalThis !== 'undefined') globalThis.HDT_CaiDat = API;

})();
