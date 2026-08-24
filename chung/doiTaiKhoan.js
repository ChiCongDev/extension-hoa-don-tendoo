'use strict';

// ⚠️ TOÀN BỘ FILE NẰM TRONG MỘT PHẠM VI RIÊNG (hàm bọc ngoài).

(function () {

// ============================================================================
//  ĐỔI TÀI KHOẢN TENDOO — không cần nút Đăng xuất
//
//  CÁCH LÀM, và vì sao chọn cách này:
//
//    1. Xóa sạch mọi khóa "@…" trong trang  → ứng dụng mất token
//    2. Tải lại trang bán hàng               → ứng dụng TỰ chuyển sang trang
//                                              đăng nhập (đã quan sát thật)
//    3. Điền form đăng nhập bằng selector ĐÃ XÁC MINH
//    4. Đợi quay lại trang bán hàng
//    5. ĐỐI CHIẾU lại tài khoản — sai là dừng
//
//  Không cần biết Tendoo đăng xuất thế nào, không cần biết hình dạng API đăng
//  nhập. Mọi bước đều dựa trên thứ đã quan sát trực tiếp.
//
//  ⚠️ VÌ SAO PHẢI XÓA HẾT chứ không chỉ ghi đè token:
//     Tendoo lưu ~15 khóa gắn với tài khoản đang đăng nhập (@business_id,
//     @permissions, @user_store, @tax_store…). Chỉ thay token mà để lại phần
//     còn lại = token của khách B nhưng mã cửa hàng và quyền vẫn của khách A.
//     Đó đúng là kiểu lẫn lộn dẫn tới hóa đơn ra nhầm cửa hàng.
//
//  ⚠️ MỌI ĐƯỜNG HỎNG ĐỀU AN TOÀN: nếu đổi hỏng nửa chừng, chốt chặn tài khoản
//     ở bước sau sẽ thấy không khớp và DỪNG. Kết cục xấu nhất là "máy không
//     chịu chạy", không phải "hóa đơn vào nhầm chỗ".
// ============================================================================

const URL_POS = 'https://seller-v3.tendoo.vn/sales/pos';
const LA_TRANG_DANG_NHAP = /id-v3\.tendoo\.vn.*signin/i;
const LA_TRANG_POS = /seller-v3\.tendoo\.vn\/sales\/pos/i;

const MA = {
    XONG: 'XONG',
    KHONG_XOA_DUOC: 'KHONG_XOA_DUOC_TRANG_THAI',
    // Tab Tendoo không trả lời — tab đó chưa có mã extension. Chữa được bằng F5.
    TAB_CAM: 'TAB_CAM',
    // Tab trả lời được nhưng thiếu bộ phận đổi tài khoản. Cũng chữa bằng F5.
    TAB_THIEU_BO_PHAN: 'TAB_THIEU_BO_PHAN',
    KHONG_TOI_TRANG_DANG_NHAP: 'KHONG_TOI_TRANG_DANG_NHAP',
    DANG_NHAP_LOI: 'DANG_NHAP_LOI',
    CAPTCHA: 'CAPTCHA',
    KHONG_QUAY_LAI_POS: 'KHONG_QUAY_LAI_POS',
    SAI_TAI_KHOAN: 'SAI_TAI_KHOAN',
    // ⚠️ KHÁC HẲN SAI_TAI_KHOAN, đừng gộp lại:
    //   SAI_TAI_KHOAN            = đọc được, nhưng LÀ CỬA HÀNG KHÁC. Nguy hiểm
    //                              thật: khai báo sai, hóa đơn sẽ ra nhầm chỗ.
    //   KHONG_DOC_DUOC_DANH_TINH = CHƯA đọc được gì cả. Chỉ là trang chậm.
    // Trước đây hai chuyện này chung một mã, nên người dùng bị báo "sai tài
    // khoản" trong khi khai báo của họ hoàn toàn đúng — chỉ là máy hỏi quá sớm.
    KHONG_DOC_DUOC_DANH_TINH: 'KHONG_DOC_DUOC_DANH_TINH',
};

// Sau khi đăng nhập, trang POS còn phải: nạp lại content script, ghi
// @access_token vào bộ nhớ trang, rồi gọi API /info. Đo trên trang thật ngày
// 2026-08-12: mất hơn 12 giây. Trước đây code đợi cứng 2,5 giây rồi hỏi ĐÚNG
// MỘT LẦN — hỏi hụt là coi như sai tài khoản và dừng cả loạt.
const NhipDo = (typeof module !== 'undefined' && module.exports)
    ? require('./nhipDo') : globalThis.HDT_NhipDo;

const HAN_DOC_DANH_TINH_MS = NhipDo.HAN_DOC_DANH_TINH;
const NHIP_DOC_MS = NhipDo.NHIN_DANH_TINH;

// Lần đọc TRƯỚC khi đổi tài khoản thì hạn ngắn hơn hẳn, vì ở đó "chưa đọc được"
// là kết quả BÌNH THƯỜNG (chưa đăng nhập bao giờ) chứ không phải lỗi — đọc
// không ra thì cứ đi đăng nhập, rồi đối chiếu sau vẫn an toàn. Để hạn dài ở đó
// là bắt người dùng ngồi đợi 30 giây vô ích trước mỗi lần đăng nhập.
const HAN_DOC_TRUOC_KHI_DOI_MS = NhipDo.HAN_DOC_TRUOC_KHI_DOI;

const LOAI_TIN = {
    XOA_TRANG_THAI: 'hdt-xoa-trang-thai',
    DANG_NHAP: 'hdt-dang-nhap',
};

/**
 * Hỏi trang xem đang đăng nhập cửa hàng nào — HỎI LẠI cho tới khi trả lời được.
 *
 * Trả về chuỗi rỗng nghĩa là hết hạn mà vẫn chưa đọc được, KHÔNG có nghĩa là
 * "cửa hàng khác". Người gọi phải phân biệt hai điều đó.
 *
 * Trả về NGAY khi đọc được, nên hạn dài không làm chậm đường chạy thuận lợi.
 */
async function docDanhTinhKienNhan(layDanhTinh, tabId, tuyChon = {}) {
    const hanMs = tuyChon.hanMs || HAN_DOC_DANH_TINH_MS;
    const nhipMs = tuyChon.nhipMs || NHIP_DOC_MS;
    const nghi = tuyChon.nghi || (ms => new Promise(r => setTimeout(r, ms)));
    let soLanHoi = 0;
    let soLanTabCam = 0;         // tab không hề trả lời (chưa có mã extension)
    let soLanRong = 0;           // tab có trả lời, nhưng chưa biết cửa hàng nào

    for (let da = 0; da <= hanMs; da += nhipMs) {
        soLanHoi++;
        let ma = '';
        try {
            ma = String((await layDanhTinh(tabId)) || '').trim();
            if (!ma) soLanRong++;
        } catch (e) {
            // Ném lỗi = KHÔNG AI TRẢ LỜI. Khác hẳn "trả lời nhưng rỗng": ở đây
            // trang không hề có mã của extension, hỏi thêm bao nhiêu cũng vô ích
            // nếu không tải lại trang. Đếm riêng để còn nói đúng bệnh.
            soLanTabCam++;
            ma = '';
        }
        if (ma) return { maCuaHang: ma, soLanHoi, soLanTabCam, soLanRong };
        if (da + nhipMs > hanMs) break;
        await nghi(nhipMs);
    }
    return { maCuaHang: '', soLanHoi, soLanTabCam, soLanRong };
}

/**
 * @param {object} boi
 * @param {(tabId:number, tin:object)=>Promise<any>} boi.guiToiTab
 * @param {(tabId:number, url:string)=>Promise<void>} boi.dieuHuongTab
 * @param {(tabId:number, hop:(url:string)=>boolean, hanMs:number)=>Promise<string|null>} boi.doiTrang
 *        Đợi tab tới một địa chỉ khớp `hop`. Quá hạn -> trả null.
 * @param {(tabId:number)=>Promise<string>} boi.layDanhTinh  trả mã cửa hàng, '' nếu không đọc được
 */
function taoBoDoiTaiKhoan(boi) {
    const { guiToiTab, dieuHuongTab, doiTrang, layDanhTinh } = boi;
    const taiLaiTab = boi.taiLaiTab || null;
    // Đọc địa chỉ tab đang mở. Không có thì mọi thứ vẫn chạy như cũ, chỉ là
    // không chẩn được bệnh khi tab câm.
    const docUrlTab = boi.docUrlTab || null;
    const hanMs = boi.hanMs || NhipDo.HAN_DOI_TRANG;
    const nghi = boi.nghi || (ms => new Promise(r => setTimeout(r, ms)));
    const hanDocMs = boi.hanDocDanhTinhMs || HAN_DOC_DANH_TINH_MS;
    const nhipDocMs = boi.nhipDocMs || NHIP_DOC_MS;

    /** Tin trả về từ tab có phải "tab không trả lời" không. */
    const laTabCam = (tra) => !tra || !!tra.__loiGui;

    /**
     * Hỏi tab TỚI KHI NÓ TRẢ LỜI ĐƯỢC, thay vì hỏi một phát rồi kết luận.
     *
     * Mã extension được chèn ở `document_idle` — muộn hơn lúc tab báo đã tải
     * xong. Hỏi đúng khe đó thì tab chưa có tai nghe, Chrome trả về rỗng, và
     * mình kết luận oan "tab câm". Đây là cách chờ-điều-kiện-thật đã dùng ở mọi
     * chỗ khác trong dự án.
     */
    async function hoiToiKhiTraLoi(tabId, hanChoMs = hanDocMs, nhipMs = nhipDocMs) {
        let cuoi = null;
        for (let da = 0; da <= hanChoMs; da += nhipMs) {
            cuoi = await guiToiTab(tabId, { loai: LOAI_TIN.XOA_TRANG_THAI });
            if (!laTabCam(cuoi)) return cuoi;      // trả lời được là dừng ngay
            if (da + nhipMs > hanChoMs) break;
            await nghi(nhipMs);
        }
        return cuoi;
    }

    /**
     * Xóa trạng thái đăng nhập cũ, TỰ CHỮA khi tab câm.
     *
     * Tab câm nghĩa là tab đó không có mã extension — hỏi thêm bao nhiêu lần
     * cũng vô ích. Nhưng TẢI LẠI TAB thì Chrome chèn mã vào, y như bấm F5. Đây
     * đúng cách đã dùng sau khi đăng nhập (bước 4b), nay dùng lại ở đây.
     *
     * Chỉ chữa ĐÚNG MỘT LẦN: tải lại mãi mà vẫn câm thì có tải nữa cũng thế.
     */
    async function xoaTrangThaiCoChuaCham(tabId) {
        // ⚠️ ĐANG Ở TRANG ĐĂNG NHẬP TENDOO thì ĐI ĐĂNG NHẬP LUÔN, đừng đòi xoá
        // trạng thái trước.
        //
        // Manifest chỉ nạp tendoo/nhanLenh.js (nơi DUY NHẤT trả lời tin
        // 'hdt-xoa-trang-thai') vào seller-v3. Trang id-v3 chỉ có dangNhap.js,
        // vốn chỉ trả lời đúng 'hdt-dang-nhap'. Nên hỏi ở đó là KHÔNG AI TRẢ
        // LỜI, máy kết luận "tab câm", tải lại tab vẫn ở trang đăng nhập nên
        // vẫn câm — và dừng hẳn.
        //
        // Máy có sẵn tài khoản, biết cách tự đăng nhập, mà lại tự chặn mình ở
        // bước lau dọn. Mà trạng thái cũ thì đã mất sạch rồi mới bị đá về đây,
        // chẳng còn gì để xoá. Đã xảy ra thật 2026-08-15: hết phiên Tendoo là
        // cả lượt hẹn giờ hỏng, báo "không rõ lý do".
        if (docUrlTab) {
            const url = await docUrlTab(tabId);
            if (url && LA_TRANG_DANG_NHAP.test(String(url))) {
                return { ok: true, boQua: 'DANG_O_TRANG_DANG_NHAP', daXoa: [] };
            }
        }

        let tra = await guiToiTab(tabId, { loai: LOAI_TIN.XOA_TRANG_THAI });
        let daTaiLai = false;

        if ((laTabCam(tra) || (tra && tra.ok !== true)) && taiLaiTab) {
            const lyDoDau = laTabCam(tra)
                ? `tab không trả lời (${(tra && tra.__loiGui) || 'không rõ'})`
                : 'tab thiếu bộ phận';
            try {
                await taiLaiTab(tabId);
                daTaiLai = true;
                // Chờ tab về đúng trang bán hàng…
                await doiTrang(tabId, (u) => LA_TRANG_POS.test(u), hanMs);
                // …RỒI CHỜ TỚI KHI TAB THẬT SỰ TRẢ LỜI ĐƯỢC.
                //
                // ⚠️ "Trang đã tải xong" KHÔNG đồng nghĩa "đã có mã extension".
                // Chrome chèn mã ở `document_idle`, có thể muộn hơn lúc tab báo
                // `status: complete` một nhịp. Hỏi ngay lúc đó là tab chưa kịp
                // gắn tai nghe, và máy kết luận oan "tab câm" — đúng chuyện đã
                // xảy ra ngày 2026-08-13 (Chrome không báo lỗi gì, chỉ trả rỗng).
                tra = await hoiToiKhiTraLoi(tabId);
            } catch (e) {
                return { ok: false, ma: MA.TAB_CAM,
                         thongBao: `Tab Tendoo không trả lời (${lyDoDau}) và tải lại tab cũng `
                            + `không được: ${(e && e.message) || e}. CHƯA làm gì cả.` };
            }
        }

        if (laTabCam(tra)) {
            // ⚠️ ĐỌC ĐỊA CHỈ TAB RỒI NÓI ĐÚNG BỆNH. Ba tình huống khác hẳn nhau,
            // ba cách chữa khác hẳn nhau; gộp thành một câu "không rõ lý do" là
            // bắt người dùng ngồi đoán. Máy biết hỏi URL mà không hỏi.
            let url = null;
            if (docUrlTab) {
                try { url = await docUrlTab(tabId); } catch (e) { url = null; }
            }
            const chiDuong = !docUrlTab
                ? 'Hãy sang tab Tendoo bấm F5 rồi chạy lại.'
                : !url
                    ? 'Không đọc được địa chỉ tab — có thể tab đã bị đóng. Hãy mở lại trang bán '
                      + 'hàng Tendoo rồi chạy lại.'
                    : LA_TRANG_DANG_NHAP.test(String(url))
                        ? 'Tab đang ở TRANG ĐĂNG NHẬP Tendoo — phiên Tendoo đã hết. Hãy đăng nhập '
                          + 'lại Tendoo, để tab ở trang bán hàng rồi chạy lại.'
                        : LA_TRANG_POS.test(String(url))
                            ? 'Tab đang ĐÚNG trang bán hàng nhưng chưa có mã extension — thường do '
                              + 'vừa tải lại extension. Hãy bấm F5 trên tab Tendoo rồi chạy lại.'
                            : `Tab đang ở một trang khác (${url}) chứ không phải trang bán hàng `
                              + 'Tendoo. Hãy mở đúng trang bán hàng rồi chạy lại.';
            return {
                ok: false, ma: MA.TAB_CAM,
                thongBao: 'Tab Tendoo KHÔNG TRẢ LỜI'
                    + (daTaiLai ? ' kể cả sau khi đã tải lại tab' : '')
                    + ` — ${(tra && tra.__loiGui) || 'không rõ lý do'}. `
                    + chiDuong + ' CHƯA làm gì cả, chưa phát hành hóa đơn nào.',
            };
        }
        if (tra.ok !== true) {
            // Trả lời được nhưng không xóa được: thiếu bộ phận, hoặc localStorage
            // bị chặn. Hai cái này khác nhau nên nói tách ra.
            const thieuBoPhan = Array.isArray(tra.daXoa) && tra.daXoa.length === 0
                && tra.thieuBoPhan;
            return {
                ok: false, ma: thieuBoPhan ? MA.TAB_THIEU_BO_PHAN : MA.KHONG_XOA_DUOC,
                thongBao: thieuBoPhan
                    ? 'Tab Tendoo trả lời được nhưng THIẾU BỘ PHẬN đổi tài khoản'
                      + (daTaiLai ? ' kể cả sau khi tải lại' : '')
                      + ' — hãy sang tab Tendoo bấm F5 rồi chạy lại.'
                    : 'Trang Tendoo không cho xóa trạng thái đăng nhập cũ (trình duyệt chặn '
                      + 'localStorage?). Đã dừng để khỏi làm nhầm tài khoản.',
            };
        }
        return { ok: true };
    }

    /**
     * Đổi sang tài khoản của một khách.
     * @param {number} tabId
     * @param {{maKH:string, tenDangNhap:string, matKhau:string, maCuaHangMongDoi:string}} tk
     */
    async function doiSang(tabId, tk) {
        if (!tk || !tk.tenDangNhap || !tk.matKhau) {
            return { ok: false, ma: MA.DANG_NHAP_LOI,
                     thongBao: 'Chưa có tài khoản/mật khẩu để đăng nhập — hãy mở kho trong popup.' };
        }

        // ── 1. Xóa sạch trạng thái của tài khoản cũ ─────────────────────────
        //
        // ⚠️ BA CHUYỆN KHÁC HẲN NHAU, ĐỪNG GỘP LÀM MỘT.
        // Bản cũ gộp hết vào câu "Không xóa được trạng thái đăng nhập cũ" và VỨT
        // ĐI nguyên văn lý do Chrome trả về. Ngày 2026-08-13 gặp thật: hai lượt
        // hẹn giờ hỏng liên tiếp mà không cách nào biết vì sao.
        //   · tab KHÔNG TRẢ LỜI      -> tab đó không có mã extension (hay gặp
        //                               ngay sau khi tải lại extension). CHỮA
        //                               ĐƯỢC: tải lại tab rồi thử lại.
        //   · tab trả lời, thiếu bộ phận -> file chưa nạp; cũng chữa bằng tải lại.
        //   · localStorage bị chặn   -> không chữa được, phải nói thẳng.
        const xoa = await xoaTrangThaiCoChuaCham(tabId);
        if (!xoa.ok) return xoa;

        // ── 2. Tải lại -> ứng dụng tự đẩy sang trang đăng nhập ──────────────
        await dieuHuongTab(tabId, URL_POS);
        const urlDangNhap = await doiTrang(tabId, (u) => LA_TRANG_DANG_NHAP.test(u), hanMs);
        if (!urlDangNhap) {
            // Không tới trang đăng nhập nghĩa là phiên cũ VẪN CÒN ở đâu đó.
            // Dừng — chạy tiếp là làm việc trên tài khoản cũ mà tưởng đã đổi.
            return {
                ok: false, ma: MA.KHONG_TOI_TRANG_DANG_NHAP,
                thongBao: 'Xóa xong mà trang không chuyển sang màn đăng nhập — '
                    + 'phiên cũ có thể vẫn còn. Đã dừng để khỏi làm nhầm tài khoản.',
            };
        }

        // ── 3. Điền form đăng nhập ──────────────────────────────────────────
        // KHÔNG chờ cứng ở đây nữa. Bản cũ ngủ 1,2 giây để "chắc" form React đã
        // gắn xong — vừa chậm vừa không chắc. Nay chính tendoo/dangNhap.js chờ
        // tới khi Ô NHẬP THẬT SỰ xuất hiện rồi mới gõ.
        const dn = await guiToiTab(tabId, {
            loai: LOAI_TIN.DANG_NHAP,
            tenDangNhap: tk.tenDangNhap, matKhau: tk.matKhau,
        });
        if (!dn || !dn.ok) {
            const ma = (dn && dn.ma === 'CAPTCHA') ? MA.CAPTCHA : MA.DANG_NHAP_LOI;
            return { ok: false, ma,
                     thongBao: (dn && dn.thongBao) || 'Không đăng nhập được' };
        }

        // ── 4. Đợi quay lại trang bán hàng ──────────────────────────────────
        let urlPos = await doiTrang(tabId, (u) => LA_TRANG_POS.test(u), hanMs);

        // ── THỬ LẠI MỘT LẦN: TỰ ĐƯA TAB VỀ TRANG BÁN HÀNG ───────────────────
        //
        // ⚠️ CA HỎNG THẬT 21/08/2026, mốc 18:05: khách Trang Bé TB (8.795.000đ)
        // mất trắng vì «Đăng nhập xong nhưng không quay lại được trang bán
        // hàng». Đăng nhập ĐÃ THÀNH CÔNG; chỉ là cú chuyển hướng của Tendoo
        // không tới nơi trong hạn chờ. Mười phút sau mọi thứ lại chạy sạch.
        //
        // ⚠️ VÌ SAO AN TOÀN: chỗ này nằm TRƯỚC MỌI THAO TÁC VỚI GIỎ HÀNG —
        // chưa bỏ món nào, chưa bấm Thanh toán, chưa có tờ hóa đơn nào tồn
        // tại. Đưa tab về đúng địa chỉ không thể sinh ra hóa đơn trùng.
        //
        // ⛔ TỐI ĐA MỘT LẦN. Đứng được tới đây nghĩa là bước đăng nhập đã xong.
        if (!urlPos) {
            try {
                await dieuHuongTab(tabId, URL_POS);
                urlPos = await doiTrang(tabId, (u) => LA_TRANG_POS.test(u), hanMs);
            } catch (e) { /* thất bại thì rơi xuống câu báo lỗi bên dưới */ }
        }
        if (!urlPos) {
            return { ok: false, ma: MA.KHONG_QUAY_LAI_POS,
                     thongBao: 'Đăng nhập xong nhưng không quay lại được trang bán hàng '
                         + '(đã thử tự mở lại trang một lần). Tendoo hoặc mạng đang chậm.' };
        }

        // ── 4b. TẢI LẠI TRANG. Bước này BẮT BUỘC, đừng bỏ ───────────────────
        //
        // Sau khi đăng nhập, trình duyệt được tải tại
        //     https://seller-v3.tendoo.vn/callback?step=success&callback=/sales/pos
        // rồi ứng dụng TỰ CHUYỂN MÀN HÌNH sang /sales/pos mà KHÔNG tải lại trang.
        //
        // Chrome chỉ chèn mã của extension vào một trang ĐÚNG LÚC trang đó được
        // tải. Trang được tải là /callback, nên dù thanh địa chỉ ghi /sales/pos
        // và nhìn y hệt trang bán hàng, mã của mình CHƯA BAO GIỜ có mặt ở đó.
        // Hậu quả: hỏi gì cũng không ai trả lời — đã mất 31 lần hỏi trong 30
        // giây để phát hiện ra điều này.
        //
        // Tải lại = đúng như bấm F5: trang được tải tại /sales/pos, mã được chèn.
        if (taiLaiTab) {
            await taiLaiTab(tabId);
            const urlSauTai = await doiTrang(tabId, (u) => LA_TRANG_POS.test(u), hanMs);
            if (!urlSauTai) {
                return { ok: false, ma: MA.KHONG_QUAY_LAI_POS,
                         thongBao: 'Tải lại trang bán hàng sau khi đăng nhập không xong.' };
            }
        }
        // ── 5. ĐỐI CHIẾU — cửa chặn cuối, không có ngoại lệ ─────────────────
        // Hỏi lại tới khi trang trả lời được. KIÊN NHẪN ở đây KHÔNG nới lỏng
        // chốt chặn: vẫn phải khớp tuyệt đối mới đi tiếp, chỉ là cho trang đủ
        // thời gian để nói nó đang ở đâu.
        const { maCuaHang, soLanHoi, soLanTabCam, soLanRong } =
            await docDanhTinhKienNhan(layDanhTinh, tabId,
                { hanMs: hanDocMs, nhipMs: nhipDocMs, nghi });
        const mongDoi = String(tk.maCuaHangMongDoi || '').trim();

        if (!maCuaHang) {
            // Nói ĐÚNG BỆNH. Hai nguyên nhân này cần hai cách chữa khác hẳn nhau,
            // gộp lại là bắt người dùng ngồi đoán như lần trước.
            const giay = Math.max(1, Math.round(hanDocMs / 1000));
            const chiTiet = soLanTabCam >= soLanRong
                ? `Tab Tendoo KHÔNG TRẢ LỜI (${soLanTabCam}/${soLanHoi} lần) — trang chưa được `
                  + 'chèn mã của extension. Hãy tải lại extension rồi BẤM F5 trên tab Tendoo, '
                  + 'sau đó thử lại.'
                : `Tab có trả lời nhưng chưa biết đang ở cửa hàng nào (${soLanRong}/${soLanHoi} `
                  + 'lần) — phiên đăng nhập chưa dựng xong hoặc mạng chậm, hãy thử lại.';
            return {
                ok: false, ma: MA.KHONG_DOC_DUOC_DANH_TINH,
                thongBao: `Đăng nhập xong nhưng sau ${giay} giây vẫn chưa xác định được cửa hàng. `
                    + chiTiet + ' Khai báo tài khoản của bạn KHÔNG sai.',
            };
        }
        if (!mongDoi || String(maCuaHang).toLowerCase() !== mongDoi.toLowerCase()) {
            return {
                ok: false, ma: MA.SAI_TAI_KHOAN,
                thongBao: `Đăng nhập xong nhưng cửa hàng đang mở (${maCuaHang}) không khớp `
                    + `khai báo của khách (${mongDoi || 'chưa khai báo'}). Đã dừng.`,
            };
        }

        return { ok: true, ma: MA.XONG, maCuaHang };
    }

    return { doiSang, MA, LOAI_TIN };
}

/** Xóa mọi khóa của tài khoản cũ trong trang. Chạy trên trang Tendoo. */
function xoaTrangThaiCu(cuaSo) {
    const ls = cuaSo && cuaSo.localStorage;
    if (!ls) return { ok: false, daXoa: [] };
    const daXoa = [];
    // Gom tên khóa TRƯỚC rồi mới xóa: xóa trong lúc duyệt sẽ nhảy cóc, bỏ sót.
    const ten = [];
    for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k && k.startsWith('@')) ten.push(k);
    }
    for (const k of ten) { ls.removeItem(k); daXoa.push(k); }
    return { ok: true, daXoa };
}

/**
 * CÓ PHẢI ĐỔI TÀI KHOẢN KHÔNG — cửa hàng đang mở so với cửa hàng khách cần.
 *
 * ⚠️ Tách ra thành hàm riêng để TEST ĐƯỢC. Trước đây phép so này nằm chôn trong
 * background.js, nơi đầy API của Chrome nên không bài kiểm nào chạm tới — mà nó
 * lại chính là chỗ quyết định chuyện NHIỀU KHÁCH DÙNG CHUNG MỘT CỬA HÀNG:
 * khớp sẵn thì bỏ qua đăng nhập, cả ba khách chỉ đăng nhập một lần.
 *
 * ⚠️ RỖNG NGHĨA LÀ PHẢI ĐỔI, không phải "chắc là đúng rồi". Chưa đọc được cửa
 * hàng đang mở thì coi như chưa đăng nhập — đăng nhập lại rồi đối chiếu vẫn an
 * toàn, còn đoán bừa là hóa đơn ra ở tài khoản người khác.
 */
function canDoiTaiKhoan(dangMo, mongDoi) {
    const a = String(dangMo || '').trim().toLowerCase();
    const b = String(mongDoi || '').trim().toLowerCase();
    if (!a || !b) return true;
    return a !== b;
}

const API = { taoBoDoiTaiKhoan, xoaTrangThaiCu, docDanhTinhKienNhan, canDoiTaiKhoan, MA, LOAI_TIN,
              URL_POS, LA_TRANG_DANG_NHAP, LA_TRANG_POS,
              HAN_DOC_DANH_TINH_MS, NHIP_DOC_MS, HAN_DOC_TRUOC_KHI_DOI_MS };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof globalThis !== 'undefined') globalThis.HDT_DoiTaiKhoan = API;

})();
