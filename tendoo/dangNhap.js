'use strict';

// ⚠️ TOÀN BỘ FILE NẰM TRONG MỘT PHẠM VI RIÊNG (hàm bọc ngoài).
// Chrome nạp nhiều file vào CÙNG MỘT phạm vi — hai file cùng khai `const API`
// là file thứ hai nổ ngay khi nạp, và KHÔNG có lỗi nào hiện ra cho người dùng:
// popup chỉ đơn giản trống trơn. Đã dính đúng lỗi này một lần. Bọc lại để không
// bao giờ dính nữa. Xuất ra ngoài qua globalThis.HDT_* ở cuối file.

(function () {

// ============================================================================
//  ĐĂNG NHẬP TENDOO — điều khiển form trên id-v3.tendoo.vn
//
//  Selector lấy từ quan sát thật ngày 2026-08-10:
//    #phone_login_form_phone_number   ô số điện thoại
//    #phone_login_form_pwd            ô mật khẩu
//    <button> có chữ ĐÚNG BẰNG "Đăng nhập"
//  Tài khoản thử nghiệm KHÔNG có captcha, KHÔNG có OTP.
//
//  HAI CÁI BẪY ĐÃ TRẢ GIÁ ĐỂ BIẾT:
//
//  1. GÁN `input.value` THẲNG LÀ VÔ HÌNH VỚI REACT.
//     Form dùng Ant Design (React). Gán thẳng .value thì ô hiện chữ nhưng React
//     vẫn nghĩ nó rỗng -> bấm Đăng nhập báo "Nhập số điện thoại". Phải gọi
//     native setter rồi phát sự kiện `input` để React nhận.
//
//  2. FORM VẼ LẠI SAU KHI GẮN, XÓA TRẮNG THỨ VỪA GÕ.
//     Lần đăng nhập đầu tiên hỏng vì lý do này. Bắt buộc: điền xong phải ĐỌC
//     LẠI để xác nhận, sai thì làm lại, tối đa 3 lần.
//
//  3. NÚT "Zalo" CŨNG MANG CLASS `ant-btn-primary`.
//     Chọn nút theo class là có ngày bấm nhầm sang đăng nhập Zalo. Phải so
//     CHỮ TRÊN NÚT bằng đúng "Đăng nhập".
// ============================================================================

const NhipDo = (typeof module !== 'undefined' && module.exports)
    ? require('../chung/nhipDo') : globalThis.HDT_NhipDo;

const O_SDT = '#phone_login_form_phone_number';
const O_MAT_KHAU = '#phone_login_form_pwd';
const CHU_NUT = 'Đăng nhập';

const MA = {
    OK: 'OK',
    KHONG_THAY_FORM: 'KHONG_THAY_FORM',
    KHONG_DIEN_DUOC: 'KHONG_DIEN_DUOC',
    KHONG_THAY_NUT: 'KHONG_THAY_NUT',
    CAPTCHA: 'CAPTCHA',
    SAI_MAT_KHAU: 'SAI_MAT_KHAU',
    QUA_HAN_CHO: 'QUA_HAN_CHO',
};

/** Đặt giá trị theo cách React/Ant Design thật sự nhìn thấy. */
function datGiaTri(o, giaTri) {
    const mota = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(o) || {}, 'value');
    if (mota && mota.set) mota.set.call(o, giaTri);
    else o.value = giaTri;

    const CuaSo = (o.ownerDocument && o.ownerDocument.defaultView) || globalThis;
    for (const ten of ['input', 'change']) {
        const su = CuaSo.Event ? new CuaSo.Event(ten, { bubbles: true }) : null;
        if (su) o.dispatchEvent(su);
    }
}

/** Nhận diện captcha / OTP — gặp là DỪNG, không mò. */
function coRaoCan(tailieu) {
    const html = (tailieu.body && tailieu.body.innerHTML) || '';
    if (/captcha|recaptcha|hcaptcha|turnstile/i.test(html)) return 'captcha';
    // innerText không phải lúc nào cũng có -> LUÔN có textContent làm lối lui.
    // Thiếu cái này thì phần dò OTP im lặng bỏ qua, tưởng là sạch.
    const chu = docChu(tailieu);
    if (/mã otp|mã xác (minh|thực)|nhập mã gồm/i.test(chu)) return 'otp';
    return null;
}

/** Đọc chữ trên trang, chịu được cả nơi không có innerText. */
function docChu(tailieu) {
    const b = tailieu && tailieu.body;
    if (!b) return '';
    return b.innerText || b.textContent || '';
}

function timNutDangNhap(tailieu) {
    return [...tailieu.querySelectorAll('button')]
        .find(b => (b.innerText || b.textContent || '').trim() === CHU_NUT) || null;
}

function docLoiTrenTrang(tailieu) {
    const chu = docChu(tailieu);
    const m = chu.match(/(Sai (số điện thoại|mật khẩu)[^\n]{0,60}|Tài khoản[^\n]{0,60}(khóa|không tồn tại)[^\n]{0,30})/i);
    return m ? m[0].trim() : null;
}

/**
 * @param {Document} tailieu
 * @param {{tenDangNhap:string, matKhau:string}} thongTin
 * @param {{soLanThu?:number, nghi?:(ms:number)=>Promise<void>, doiRoiTrang?:()=>Promise<boolean>}} [tuyChon]
 * @returns {Promise<{ok:boolean, ma:string, thongBao?:string}>}
 */
async function dangNhap(tailieu, thongTin, tuyChon = {}) {
    const soLanThu = tuyChon.soLanThu || 3;
    const nghi = tuyChon.nghi || (ms => new Promise(r => setTimeout(r, ms)));

    const rao = coRaoCan(tailieu);
    if (rao) {
        return { ok: false, ma: MA.CAPTCHA,
                 thongBao: rao === 'otp' ? 'Tendoo hỏi mã OTP — cần bạn nhập tay'
                                         : 'Tendoo hiện captcha — đã dừng' };
    }

    // Chờ Ô NHẬP THẬT SỰ xuất hiện, thay vì để bên gọi ngủ cứng 1,2 giây rồi đoán.
    // Form gắn xong sau 80ms thì đi tiếp ngay; gắn chậm 3 giây thì vẫn chờ được.
    const hanO = tuyChon.hanChoO == null ? NhipDo.HAN_CHO_O_DANG_NHAP : tuyChon.hanChoO;
    const nhipO = tuyChon.nhipChoO || NhipDo.NHIN_DOM;
    let oSdt = null;
    let oMatKhau = null;
    for (let da = 0; da <= hanO; da += nhipO) {
        oSdt = tailieu.querySelector(O_SDT);
        oMatKhau = tailieu.querySelector(O_MAT_KHAU);
        if (oSdt && oMatKhau) break;
        if (da + nhipO > hanO) break;
        await nghi(nhipO);
    }
    if (!oSdt || !oMatKhau) {
        return { ok: false, ma: MA.KHONG_THAY_FORM,
                 thongBao: 'Không thấy form đăng nhập — giao diện Tendoo có thể đã đổi' };
    }

    // Điền rồi ĐỌC LẠI để chắc chắn, vì form hay bị vẽ lại làm mất chữ.
    for (const [o, giaTri, ten] of [[oSdt, thongTin.tenDangNhap, 'số điện thoại'],
                                    [oMatKhau, thongTin.matKhau, 'mật khẩu']]) {
        let xong = false;
        for (let lan = 0; lan < soLanThu && !xong; lan++) {
            datGiaTri(o, '');
            datGiaTri(o, giaTri);
            await nghi(tuyChon.nhipDienO || NhipDo.NHIN_DIEN_O);
            xong = (o.value === giaTri);
        }
        if (!xong) {
            return { ok: false, ma: MA.KHONG_DIEN_DUOC,
                     thongBao: `Không điền được ô ${ten} — form bị vẽ lại liên tục` };
        }
    }

    const nut = timNutDangNhap(tailieu);
    if (!nut) {
        return { ok: false, ma: MA.KHONG_THAY_NUT, thongBao: 'Không thấy nút Đăng nhập' };
    }
    nut.click();

    // Đợi rời khỏi trang đăng nhập. Bên gọi cung cấp cách chờ (điều hướng thật
    // không mô phỏng được trong test).
    if (tuyChon.doiRoiTrang) {
        const daRoi = await tuyChon.doiRoiTrang();
        if (!daRoi) {
            const raoSau = coRaoCan(tailieu);
            if (raoSau) return { ok: false, ma: MA.CAPTCHA, thongBao: 'Tendoo hiện captcha/OTP sau khi bấm' };
            const loi = docLoiTrenTrang(tailieu);
            if (loi) return { ok: false, ma: MA.SAI_MAT_KHAU, thongBao: loi };
            return { ok: false, ma: MA.QUA_HAN_CHO, thongBao: 'Bấm Đăng nhập rồi mà không vào được' };
        }
    }
    return { ok: true, ma: MA.OK };
}

// ── Nghe lệnh đăng nhập từ tiến trình nền (giai đoạn 7) ─────────────────────
(function ganTaiNghe() {
    const G = globalThis;
    if (typeof G.location === 'undefined' || !G.document) return;
    if (!/(^|\.)tendoo\.vn$/i.test(String(G.location.hostname || ''))) return;
    if (!G.chrome || !G.chrome.runtime || !G.chrome.runtime.onMessage) return;

    G.chrome.runtime.onMessage.addListener((tin, nguoiGui, traLoi) => {
        if (!tin || tin.loai !== 'hdt-dang-nhap') return false;
        dangNhap(G.document,
            { tenDangNhap: tin.tenDangNhap, matKhau: tin.matKhau },
            { doiRoiTrang: async () => true })      // việc đợi trang do tiến trình nền lo
            .then(traLoi)
            .catch(e => traLoi({ ok: false, ma: MA.KHONG_THAY_FORM,
                                 thongBao: 'Lỗi khi đăng nhập: ' + (e && e.message) }));
        return true;
    });
})();

const API = { dangNhap, datGiaTri, coRaoCan, timNutDangNhap, docChu, MA, O_SDT, O_MAT_KHAU, CHU_NUT };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof globalThis !== 'undefined') globalThis.HDT_DangNhap = API;
})();
