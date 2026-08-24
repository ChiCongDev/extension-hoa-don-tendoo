'use strict';

// ⚠️ TOÀN BỘ FILE NẰM TRONG MỘT PHẠM VI RIÊNG (hàm bọc ngoài).

(function () {

// ============================================================================
//  CẦU NỐI SELL ↔ TENDOO  —  giai đoạn 6
//
//  Trang Sell và trang Tendoo là HAI TAB, HAI TÊN MIỀN khác nhau. Chúng không
//  nói chuyện trực tiếp được. Tiến trình nền làm người đưa thư:
//
//      Tab Sell  ──►  tiến trình nền  ──►  Tab Tendoo
//      (tick khách)   (file này)          (làm việc thật)
//           ▲                                   │
//           └────────── kết quả ◄───────────────┘
//
//  File này CHỈ chứa phần logic, mọi thứ thuộc về Chrome đều truyền từ ngoài
//  vào -> test được bằng Node, không cần trình duyệt.
//
//  BỐN LUẬT Ở TẦNG NÀY:
//   1. Không có tab Tendoo đang mở -> TỰ MỞ MỘT TAB, làm xong TỰ ĐÓNG.
//      Trước đây luật này là "không tự mở", vì mở tab nghĩa là tự quyết định
//      đăng nhập tài khoản nào. Từ khi có bảng khai báo + đổi tài khoản tự động
//      (giai đoạn 7) thì việc đó vốn ĐÃ xảy ra ở giữa loạt rồi — mở tab chỉ là
//      làm cùng quyết định đó sớm hơn một bước. Chốt chặn đối chiếu tài khoản
//      vẫn nguyên vẹn, nên hỏng thì vẫn dừng chứ không xuất nhầm.
//      ⚠️ CHỈ ĐÓNG TAB DO MÌNH MỞ. Tab người dùng đang mở thì không đụng.
//   2. Chạy TUẦN TỰ từng khách. Không song song.
//   3. Mọi lệnh đều đi qua SỔ GHI DẤU -> Chrome giết tiến trình giữa chừng
//      không bao giờ dẫn tới xuất trùng.
//   4. Lỗi nghiêm trọng (sai tài khoản, captcha) -> DỪNG CẢ LOẠT.
// ============================================================================

const LOAI_TIN = {
    TAO_HOA_DON: 'hdt-tao-hoa-don',      // Sell -> nền
    XU_LY_KHACH: 'hdt-xu-ly-khach',      // nền -> Tendoo
    TIEN_DO: 'hdt-tien-do',              // nền -> Sell
    HOI_TRANG_THAI: 'hdt-hoi-trang-thai',
    HOI_SAN_SANG: 'hdt-hoi-san-sang',    // nền -> Tendoo, kiểm tra tab còn sống
    DON_GIO: 'hdt-don-gio',              // nền -> Tendoo, dọn giỏ máy để lại
};

const LY_DO = {
    KHONG_CO_TAB: 'KHONG_CO_TAB_TENDOO',
    TAB_CHUA_SAN_SANG: 'TAB_CHUA_SAN_SANG',
    GIO_KHONG_TRONG: 'GIO_KHONG_TRONG',
    CO_LENH_TREO: 'CO_LENH_TREO',
    DANG_CHAY: 'DANG_CHAY',
};

/**
 * @param {object} phuThuoc
 * @param {()=>Promise<{id:number, url:string}|null>} phuThuoc.timTabTendoo
 * @param {(tabId:number, tin:object)=>Promise<object>} phuThuoc.guiToiTab
 * @param {object} phuThuoc.so        sổ ghi dấu đã nạp
 * @param {object} phuThuoc.hangDoi   hàng đợi đã dựng trên sổ đó
 */
function taoCauNoi({ timTabTendoo, guiToiTab, so, hangDoi, truocMoiKhach,
                     moTab, dongTab, nghi }) {
    const cho = nghi || (ms => new Promise(r => setTimeout(r, ms)));
    let dangChay = false;

    // Nhịp chờ trước khi hỏi lại trạng thái giỏ. React dựng lại đơn hàng dở
    // trong khoảng này. Lượt chỉ chạy 1-2 lần mỗi ngày nên thêm chừng này là
    // rẻ hơn nhiều so với mất một tầng bảo vệ.
    const NHIP_XAC_NHAN_GIO_MS = 1500;

    /**
     * @param {Array<{maKH:string, tenKH?:string, soTien:number}>} danhSach
     * @param {(tin:object)=>void} [bao] báo tiến độ ra ngoài
     */

    async function taoHoaDon(danhSach, bao = () => {}) {
        if (dangChay) {
            return { dung: true, ly_do: LY_DO.DANG_CHAY,
                     thongBao: 'Đang chạy một lượt khác — đợi xong đã.' };
        }
        if (!Array.isArray(danhSach) || danhSach.length === 0) {
            return { dung: true, ly_do: 'KHONG_CO_KHACH', thongBao: 'Chưa chọn khách nào.' };
        }

        // ⚠️ Đặt cờ NGAY, TRƯỚC mọi lệnh chờ. Đặt sau một `await` là để hở một
        // khe: hai lượt bấm nhanh liên tiếp cùng lọt qua cửa rồi giẫm lên nhau,
        // và cùng nhận một lệnh trong hàng đợi. Test bắt được đúng chuyện này.
        dangChay = true;
        let taMoTab = false;
        let tab = null;
        try {
            // ── LUẬT 1: có sẵn thì DÙNG LẠI, không có thì TỰ MỞ ─────────────
            tab = await timTabTendoo();
            if (!tab && moTab) {
                tab = await moTab();
                taMoTab = !!tab;
            }
            if (!tab) {
                return {
                    dung: true, ly_do: LY_DO.KHONG_CO_TAB,
                    thongBao: 'Không mở được trang bán hàng Tendoo. Hãy tự mở '
                        + 'seller-v3.tendoo.vn/sales/pos rồi thử lại.',
                };
            }

            // ── Hỏi tab đã sẵn sàng chưa, TRƯỚC khi xếp hàng đợi ────────────
            // Chrome chỉ chèn code vào trang lúc trang TẢI. Tải lại extension
            // xong, tab đang mở vẫn giữ code bản cũ — code đó đã bị ngắt khỏi
            // extension và không trả lời được. Phải nói thẳng "hãy F5 tab
            // Tendoo", chứ báo chung chung là người dùng ngồi đoán.
            // Tab mình vừa mở cần vài giây để tải xong -> hỏi lại nhiều lần.
            // Tab người dùng đã mở sẵn thì hỏi một lần là đủ; hỏi lại 30 lần chỉ
            // làm họ đợi vô ích khi tab đó đang giữ code bản cũ.
            const soLanHoi = taMoTab ? 40 : 1;
            let sanSang = null;
            for (let i = 0; i < soLanHoi; i++) {
                sanSang = await guiToiTab(tab.id, { loai: LOAI_TIN.HOI_SAN_SANG });
                if (sanSang && sanSang.sanSang) break;
                if (i < soLanHoi - 1) await cho(1000);
            }
            if (!sanSang || !sanSang.sanSang) {
                const thieu = (sanSang && sanSang.thieu) || [];
                // ⚠️ GIAO DIỆN MỚI CỦA TENDOO — nói thẳng, đừng để lẫn vào câu
                // "nạp thiếu bộ phận" rồi bắt người dùng bấm F5 mãi không xong.
                // Tendoo thông báo 18/08/2026 chuyển sang /sales/pos-v2, bộ chọn
                // khác hẳn. Extension CHƯA hỗ trợ và cố ý từ chối chạy.
                const moi = thieu.find((x) => String(x).startsWith('giao-dien-moi'));
                if (moi) {
                    return {
                        dung: true, ly_do: LY_DO.TAB_CHUA_SAN_SANG,
                        thongBao: 'Tab Tendoo đang ở GIAO DIỆN BÁN HÀNG MỚI ('
                            + String(moi).split(':')[1] + '). Extension chưa hỗ trợ giao diện này '
                            + 'nên đã DỪNG, chưa phát hành hóa đơn nào — chạy tiếp trên giao diện '
                            + 'lạ có thể ra hóa đơn sai. Hãy mở '
                            + 'https://seller-v3.tendoo.vn/sales/pos (bản cũ) rồi chạy lại; '
                            + 'nếu Tendoo đã bỏ hẳn bản cũ thì extension cần được cập nhật.',
                    };
                }
                return {
                    dung: true, ly_do: LY_DO.TAB_CHUA_SAN_SANG,
                    thongBao: thieu.length
                        ? 'Tab Tendoo nạp thiếu bộ phận (' + thieu.join(', ')
                          + ') — hãy tải lại trang Tendoo (F5).'
                        : 'Tab Tendoo chưa sẵn sàng. Nếu bạn vừa cập nhật extension, '
                          + 'hãy BẤM F5 TRÊN TAB TENDOO rồi thử lại — Chrome chỉ chèn '
                          + 'code vào trang lúc trang tải.',
                };
            }

            // ⚠️⚠️ ĐỌC GIỎ MỘT LẦN LÀ KHÔNG ĐỦ — HỎI LẠI KHI NGHE "TRỐNG".
            //
            // Câu trả lời "sẵn sàng" chỉ đo ĐÃ NẠP ĐỦ BỘ PHẬN và ĐANG ĐỨNG ĐÚNG
            // TRANG. Cả hai thứ ấy có ngay khi content script chạy — KHÔNG cái
            // nào đo "React đã vẽ xong giỏ chưa". Tab vừa được máy tự mở trả lời
            // "sẵn sàng" trong lúc Tendoo chưa dựng lại đơn hàng đang dở, nên
            // giỏ trông TRỐNG.
            //
            // CA HỎNG THẬT 21:20 ngày 22/08/2026: giỏ có 2 món (1.840.000đ) do
            // người dùng tự chọn, nhưng cửa chặn ngay dưới đây không đóng vì
            // `gioTrong` về true. Cả lượt đi tiếp rồi mới chết ở khách đầu tiên
            // — sổ lệnh có thêm một dòng lỗi lẽ ra không nên có, và mất hẳn một
            // tầng bảo vệ. (Không phát hành sai gì: tầng dưới vẫn chặn đúng.)
            //
            // ⚠️ CHỈ HỎI LẠI KHI LẦN ĐẦU NÓI "TRỐNG". Đó là câu trả lời DUY NHẤT
            // có thể sai theo hướng nguy hiểm — nghe "có hàng" thì đã đúng rồi,
            // hỏi thêm chỉ tốn thời gian đúng vào lúc xấu nhất.
            if (sanSang.gioTrong !== false) {
                await cho(NHIP_XAC_NHAN_GIO_MS);
                const lai = await guiToiTab(tab.id, { loai: LOAI_TIN.HOI_SAN_SANG });
                // Câu sau chỉ được thay câu trước khi nó CÒN HỢP LỆ. Tab tắt
                // giữa chừng trả về rỗng — lấy rỗng đè lên là tự làm mù mình.
                if (lai && lai.sanSang) sanSang = lai;
            }

            // ── Giỏ phải TRỐNG trước khi bắt đầu ────────────────────────────
            // Chặn NGAY ở đây, trước khi xếp hàng đợi. Để lỗi rơi vào khách đầu
            // tiên thì sổ đã có lệnh lỗi, và người dùng phải đọc lỗi lồng trong
            // kết quả thay vì thấy ngay lúc bấm.
            if (sanSang.gioTrong === false) {
                // Thử TỰ DỌN trước khi từ chối. Trang POS chỉ dọn nếu giỏ đó đúng
                // là do chính máy để lại (đối chiếu dấu giỏ) — hàng người dùng tự
                // chọn thì nó từ chối, và mình chuyển nguyên lời từ chối ra ngoài.
                const don = await guiToiTab(tab.id, { loai: LOAI_TIN.DON_GIO });
                if (!don || !don.ok) {
                    const n = Number(sanSang.soDongGio || 0);
                    return {
                        dung: true, ly_do: LY_DO.GIO_KHONG_TRONG,
                        thongBao: (don && don.thongBao)
                            || `Giỏ hàng trên tab Tendoo đang có sẵn ${n} món và không dọn được. `
                               + 'Sang tab Tendoo, bấm nút "Xóa sạch giỏ" trên bảng nổi góc dưới '
                               + 'bên phải, rồi chạy lại.',
                    };
                }
                if (don.daXoa) bao({ loai: 'da-don-gio', soMon: don.daXoa, thongBao: don.thongBao });
            }

            await hangDoi.xepHang(danhSach);
            const kq = await hangDoi.chayLoat(
                async (lenh) => {
                    // Móc chạy TRƯỚC mỗi khách — nơi đổi tài khoản Tendoo nếu
                    // khách này thuộc cửa hàng khác. Trả về lỗi thì bỏ qua khách
                    // đó (hoặc dừng cả loạt, tùy mã lỗi) và KHÔNG gửi lệnh đi.
                    if (truocMoiKhach) {
                        const truoc = await truocMoiKhach(tab.id, lenh);
                        // ⚠️ CỜ `chuaLamGi`: móc này chạy TRƯỚC MỌI VIỆC với giỏ
                        // hàng. Hỏng ở đây thì CHẮC CHẮN chưa bỏ hàng, chắc chắn
                        // chưa bấm Thanh toán — không có gì "không rõ" cả.
                        //
                        // Không có cờ này thì một mã lỗi lọt lưới sẽ rơi về
                        // KHONG_RO ở hàng đợi, thành TREO, và khóa hẳn hẹn giờ
                        // cho tới khi người dùng tự kết luận. Đã xảy ra thật
                        // 2026-08-13 với `MA.TAB_CAM` bị thiếu.
                        if (truoc && truoc.ok === false) return { ...truoc, chuaLamGi: true };
                    }
                    // Báo cho trang Tendoo biết còn khách phía sau hay không:
                    // còn thì nó tự dọn giỏ sau khi xong, hết thì giữ nguyên cho
                    // người dùng kiểm tra.
                    // Khách HIỆN TẠI đã được đánh dấu "đang xử lý" trước khi
                    // gọi vào đây, nên không còn nằm trong hàng chờ -> so > 0.
                    const conKhachPhiaSau = so.layLenhCho().length > 0;
                    const tra = await guiToiTab(tab.id, {
                        loai: LOAI_TIN.XU_LY_KHACH,
                        lenh: { ...lenh, conKhachPhiaSau },
                    });
                    // Tab không trả lời (đã đóng, đổi trang, script chưa nạp) —
                    // coi là lỗi nghiêm trọng chứ KHÔNG bỏ qua: mình không biết
                    // nó đã làm gì trên trang đó.
                    if (!tra || typeof tra !== 'object') {
                        return { ok: false, ma: 'TAB_KHONG_TRA_LOI',
                                 thongBao: 'Tab Tendoo không phản hồi — có thể đã đóng hoặc đổi trang.' };
                    }
                    return tra;
                },
                (tin) => bao(tin),
            );
            return kq;
        } finally {
            // Dọn dẹp thứ MÌNH bày ra: chỉ đóng tab do mình mở.
            if (taMoTab && tab && dongTab) {
                try { await dongTab(tab.id); } catch (e) { /* tab có thể đã đóng */ }
            }
            dangChay = false;
        }
    }

    /** Trạng thái để trang Sell hiển thị: còn lệnh treo không, đang chạy không. */
    function trangThai() {
        return {
            dangChay,
            coLenhTreo: so.coLenhTreo(),
            lenhTreo: so.layLenhTreo().map(l => ({
                id: l.id, maKH: l.maKH, tenKH: l.tenKH, soTien: l.soTien, thongBao: l.thongBao,
            })),
        };
    }

    return { taoHoaDon, trangThai, dangChay: () => dangChay };
}

/** Tìm tab Tendoo đang mở. Trả null nếu không có — KHÔNG tự mở tab mới. */
/**
 * Đúng trang bán hàng CŨ — thứ duy nhất extension biết cách làm việc.
 *
 * ⚠️ Chấp nhận `/sales/pos`, `/sales/pos/`, kèm `?...` hoặc `#...`.
 * TỪ CHỐI `/sales/pos-v2` và mọi biến thể khác.
 */
const LA_POS_CU = /^https:\/\/seller-v3\.tendoo\.vn\/sales\/pos(?:[/?#]|$)/i;

/**
 * Tìm tab Tendoo để làm việc.
 *
 * ⚠️ MẪU TRUY VẤN CỦA CHROME CÓ DẤU `*` Ở CUỐI nên nó khớp CẢ `/sales/pos-v2`.
 * Đây chính là nguyên nhân lượt chạy 19/08/2026 hỏng cả 4 khách: người dùng mở
 * một tab pos-v2 để xem thử, máy vớ đúng tab đó rồi chạy toàn bộ lượt trên giao
 * diện mới bằng bộ chọn của giao diện cũ. Không phải bốn lỗi — một tab sai.
 *
 * Không thể siết chính mẫu truy vấn: `tabs.query` chỉ nhận mẫu đơn giản, không
 * có cách nói "pos nhưng không pos-v2". Nên vẫn hỏi rộng rồi TỰ LỌC.
 *
 * ⚠️ CHỈ CÓ TAB pos-v2 -> TRẢ NULL, đừng trả bừa tab không dùng được. Trả null
 * thì tầng trên tự mở một tab `/sales/pos` đúng chuẩn và chạy tiếp; trả bừa thì
 * cả lượt dừng trong khi vấn đề chỉ là chọn nhầm tab.
 */
function taoTimTab(chromeApi, mau = 'https://seller-v3.tendoo.vn/sales/pos*') {
    return async function timTabTendoo() {
        if (!chromeApi || !chromeApi.tabs || !chromeApi.tabs.query) return null;
        const cac = await chromeApi.tabs.query({ url: mau });
        if (!cac || !cac.length) return null;

        // Tab KHÔNG có url (Chrome giấu khi thiếu quyền) thì vẫn nhận: mẫu truy
        // vấn đã lọc sẵn, và loại bỏ chúng sẽ làm hỏng đường chạy cũ.
        const dungDuoc = cac.filter(t => !t.url || LA_POS_CU.test(String(t.url)));
        if (!dungDuoc.length) return null;

        // Ưu tiên tab đang hiện, để người dùng nhìn thấy máy làm gì.
        return dungDuoc.find(t => t.active) || dungDuoc[0];
    };
}

const API = { taoCauNoi, taoTimTab, LA_POS_CU, LOAI_TIN, LY_DO };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof globalThis !== 'undefined') globalThis.HDT_CauNoi = API;

})();
