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
    return so;
}

/**
 * Danh sách khách của lịch hẹn: mã, tên, MỐC GIỜ RIÊNG và SỐ TIỀN MỖI NGÀY
 * (cả hai đều tùy chọn).
 *
 * ⚠️ Khách có `moc` riêng thì GIỜ CHUNG KHÔNG đụng tới nữa (xem henGio.gomTheoMoc).
 * Bỏ trùng theo mã, giữ nguyên thứ tự.
 */
function chuanKhach(ds, HenGio) {
    if (!Array.isArray(ds)) return [];
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
            khach: 'khach' in h ? chuanKhach(h.khach, HenGio) : (cuH.khach || []),
            urlBang: 'urlBang' in h ? String(h.urlBang || '') : String(cuH.urlBang || ''),
        };
        // Bật lịch mà không có khách, hoặc không có MỐC NÀO (kể cả giờ riêng của
        // khách), thì lịch vô nghĩa — để nguyên "bật" chỉ làm người dùng tưởng
        // máy sẽ chạy. Tắt thẳng.
        const coMocNaoDo = c.henGio.moc.length > 0
            || c.henGio.khach.some(k => k.moc);
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
        khach: chuanKhach(h.khach, (typeof globalThis !== 'undefined' && globalThis.HDT_HenGio)
                                   || null),
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
              chuanDungSai, chuanTranMoiHoaDon, chuanKhach, chuanChatId,
              gop, tuKho, khiDocHong };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof globalThis !== 'undefined') globalThis.HDT_CaiDat = API;

})();
