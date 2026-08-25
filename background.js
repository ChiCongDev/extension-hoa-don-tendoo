'use strict';

// ============================================================================
//  TIẾN TRÌNH NỀN — người đưa thư giữa tab Sell và tab Tendoo
//
//  File này CỐ Ý MỎNG. Mọi logic nằm ở chung/cauNoi.js, chung/soGhiDau.js,
//  chung/hangDoi.js — những file test được bằng Node. Ở đây chỉ nối dây với
//  Chrome, vì phần nối dây không test tự động được.
//
//  Manifest V3 có thể giết tiến trình này bất cứ lúc nào. Vì vậy SỔ GHI DẤU
//  nằm trong chrome.storage chứ không nằm trong bộ nhớ — chết giữa chừng thì
//  lần sau đọc lại thấy dấu "đang xử lý" và treo, không bao giờ tự chạy lại.
// ============================================================================

importScripts(
    'chung/nhipDo.js',
    'chung/soGhiDau.js',
    'chung/hangDoi.js',
    'chung/cauNoi.js',
    'chung/khoMatKhau.js',
    'chung/doiTaiKhoan.js',
    'chung/caiDat.js',
    'chung/henGio.js',
    'chung/lichSuChay.js',
    'chung/dayVeSell.js',
    'chung/docBangToken.js',
    'chung/baoTelegram.js',
    'chung/soDuKeToan.js',
    'chung/apDungSoDat.js',
);

/** Tab mình tự mở thì tự dọn. Tab người dùng đang mở thì để nguyên. */
function dongTabNeuTuMo(tab) {
    if (tab && tab.tuMo) chrome.tabs.remove(tab.id).catch(() => {});
}

/**
 * ĐỌC DOANH THU BẰNG TOKEN — đường CHÍNH.
 *
 * ⚠️ Trả `null` KHI VÀ CHỈ KHI chưa khai token: lúc đó mới rơi xuống đọc bảng
 * trên tab. Khai rồi mà gọi hỏng thì trả lỗi luôn, KHÔNG rơi xuống tab — tab có
 * thể đang hiện số cũ từ sáng (Sell nuốt lỗi AJAX im lặng khi hết phiên), rơi
 * xuống đó là xuất hóa đơn thuế thật theo số cũ.
 *
 * Trả về đúng hình mà `hdt-doc-bang` trả, để mọi bước sau không cần biết số đến
 * từ đâu.
 */
async function docSoQuaToken(caiDat) {
    const c = caiDat || {};
    if (!String(c.sellUrl || '').trim() || !String(c.sellToken || '').trim()) return null;

    const kq = await self.HDT_DocBangToken.docBangQuaToken(c);
    if (!kq.ok) return { ok: false, tinCay: false, ma: kq.ma, thongBao: kq.thongBao };
    // Máy chủ tự chốt "hôm nay" theo giờ Việt Nam nên số này luôn của đúng hôm
    // nay — không phải đi ép bộ lọc rồi kiểm chứng như đường đọc bảng.
    return { ok: true, tinCay: true, dong: kq.dong, ngay: kq.ngay, nguon: 'TOKEN' };
}

const KHOA_SO = 'hdt-so-ghi-dau';
const KHOA_KHOA_CHAY = 'hdt-khoa-dang-chay';
const KHOA_KHO_TAI_KHOAN = 'hdt-kho-tai-khoan';
const KHOA_CAI_DAT = 'hdt-cai-dat-bang-thu';
const KHOA_KET_QUA_HEN = 'hdt-ket-qua-hen-gio';
const KHOA_DAY_SELL = 'hdt-day-ve-sell';

const luuTru = (khoa) => ({
    async doc() {
        const k = await chrome.storage.local.get(khoa);
        return k[khoa] || null;
    },
    async ghi(o) {
        if (o == null) await chrome.storage.local.remove(khoa);
        else await chrome.storage.local.set({ [khoa]: o });
    },
});

const guiTab = (tabId, tin) => chrome.tabs.sendMessage(tabId, tin)
    .catch((e) => ({ __loiGui: String((e && e.message) || e) }));

/** Đợi tab tới một địa chỉ khớp điều kiện. Quá hạn -> null. */
async function doiTrang(tabId, hop, hanMs) {
    const het = Date.now() + hanMs;
    while (Date.now() < het) {
        try {
            const tab = await chrome.tabs.get(tabId);
            if (tab && tab.status === 'complete' && hop(String(tab.url || ''))) return tab.url;
        } catch (e) {
            return null;        // tab đã đóng
        }
        await new Promise(r => setTimeout(r, self.HDT_NhipDo.NHIN_TAB));
    }
    return null;
}

/**
 * Đọc mật khẩu Tendoo của một khách từ kho.
 *
 * KHÔNG CÒN KHÓA MỞ (2026-08-12): chìa nằm ngay trong kho nên mở được ngay,
 * không phải chờ người dùng gõ gì. Kho CŨ (bản 1) thì không mở được — trả null,
 * tầng trên sẽ bảo người dùng đi chuyển đổi.
 *
 * ⛔ KHÔNG được ghi giá trị trả về ra log hay thông báo lỗi.
 */
async function docMatKhauCua(kho, maKH) {
    const mo = await self.HDT_KhoMatKhau.moKho(kho);
    if (!mo.ok) return null;
    return self.HDT_KhoMatKhau.docMatKhau(kho, mo.khoa, maKH);
}

/**
 * Móc chạy TRƯỚC mỗi khách: nếu khách này thuộc cửa hàng khác cửa hàng đang mở
 * thì đổi tài khoản. Không cần đổi -> trả null để đi tiếp.
 */
async function taoMocDoiTaiKhoan() {
    // NÉM LỖI khi tab không trả lời, TRẢ CHUỖI RỖNG khi tab trả lời mà chưa biết
    // cửa hàng. Hai chuyện khác nhau, cần hai cách chữa khác nhau — gộp lại là
    // bắt người dùng ngồi đoán.
    const layDanhTinhTab = async (tabId) => {
        const t = await guiTab(tabId, { loai: 'hdt-lay-danh-tinh' });
        if (t && t.__loiGui) throw new Error('Tab không trả lời: ' + t.__loiGui);
        return (t && t.maCuaHang) || '';
    };

    const boDoi = self.HDT_DoiTaiKhoan.taoBoDoiTaiKhoan({
        guiToiTab: guiTab,
        dieuHuongTab: (tabId, url) => chrome.tabs.update(tabId, { url }),
        doiTrang,
        layDanhTinh: layDanhTinhTab,
        // Bắt buộc: sau đăng nhập trang được tải tại /callback rồi tự chuyển màn
        // sang /sales/pos — mã extension chưa từng được chèn vào. Tải lại đúng
        // như bấm F5 thì mới có. Xem chú thích dài ở doiTaiKhoan.js bước 4b.
        taiLaiTab: (tabId) => chrome.tabs.reload(tabId),
        // Để bộ đổi tài khoản biết tab ĐANG Ở ĐÂU: đang ở trang đăng nhập
        // Tendoo thì đi đăng nhập luôn thay vì kết luận "tab câm", và khi câm
        // thật thì còn nói được đúng bệnh. Tab đã đóng -> null, không nổ.
        docUrlTab: async (tabId) => {
            try {
                const t = await chrome.tabs.get(tabId);
                return (t && t.url) || null;
            } catch (e) { return null; }
        },
    });

    return async function truocMoiKhach(tabId, lenh) {
        const k = await chrome.storage.local.get(KHOA_KHO_TAI_KHOAN);
        const kho = k[KHOA_KHO_TAI_KHOAN];
        const banGhi = kho && kho.khach && kho.khach[lenh.maKH];
        if (!banGhi || !banGhi.maCuaHang) return null;   // để tầng dưới báo CHUA_KHAI_BAO

        // Hỏi KIÊN NHẪN, không hỏi một lần rồi thôi. Trang POS vừa mở cần thời
        // gian mới trả lời được; hỏi hụt là máy tưởng đang ở cửa hàng khác rồi
        // đăng nhập lại một cách vô ích — mất cả phút và thêm một lần rủi ro.
        const { maCuaHang: dangMo } = await self.HDT_DoiTaiKhoan.docDanhTinhKienNhan(
            layDanhTinhTab, tabId,
            { hanMs: self.HDT_DoiTaiKhoan.HAN_DOC_TRUOC_KHI_DOI_MS });
        // Đúng cửa hàng rồi thì khỏi đổi — đây cũng là chỗ khiến NHIỀU KHÁCH
        // DÙNG CHUNG một cửa hàng chỉ phải đăng nhập một lần. Phép so nằm ở
        // doiTaiKhoan.canDoiTaiKhoan() để test được; chôn ở đây thì không bài
        // kiểm nào chạm tới.
        if (!self.HDT_DoiTaiKhoan.canDoiTaiKhoan(dangMo, banGhi.maCuaHang)) {
            return null;
        }
        // Vẫn rỗng sau khi hỏi mãi -> coi như chưa đăng nhập, đi đăng nhập tiếp.
        // Ở ĐÂY rỗng KHÔNG phải lỗi: đăng nhập lại rồi đối chiếu vẫn an toàn.

        // KHÔNG CÒN KHÓA MỞ: đọc thẳng mật khẩu từ kho, không qua bộ nhớ phiên,
        // không chờ người dùng gõ gì.
        const matKhau = await docMatKhauCua(kho, lenh.maKH);
        if (!matKhau) {
            return {
                ok: false, ma: 'KHOA_MO_SAI',
                thongBao: `Khách "${lenh.maKH}" thuộc cửa hàng khác, cần đăng nhập lại nhưng `
                    + 'không đọc được mật khẩu trong kho. Hãy mở bảng khai báo bên bongtom.store '
                    + '(nút chìa khóa) và khai báo lại cho khách này.',
            };
        }

        const kq = await boDoi.doiSang(tabId, {
            maKH: lenh.maKH, tenDangNhap: banGhi.tenDangNhap, matKhau,
            maCuaHangMongDoi: banGhi.maCuaHang,
        });
        if (kq.ok) return null;
        return { ok: false, ma: kq.ma, thongBao: kq.thongBao };
    };
}

/** Mở sổ ghi dấu, đã quét dấu sót lại. Dùng cho các việc KHÔNG chạy hàng loạt. */
async function docSo() {
    const so = self.HDT_SoGhiDau.taoSo(luuTru(KHOA_SO));
    await so.nap();
    await so.quetKhiKhoiDong();
    return so;
}

/** Gọn lại một lệnh treo để hiện cho người dùng. Không kèm gì nhạy cảm. */
function gonLenhTreo(l) {
    return {
        id: l.id, maKH: l.maKH, tenKH: l.tenKH, soTien: l.soTien,
        batDauLuc: l.batDauLuc || null, treoLuc: l.treoLuc || null,
        trangThai: l.trangThai,
    };
}

/**
 * Tình trạng kho, dành cho trang Sell tô dấu hiệu trên từng dòng khách.
 *
 * ⚠️ RANH GIỚI: trang Sell chỉ được biết ĐÚNG HAI ĐIỀU cho mỗi khách — đã khai
 * báo chưa, và có dùng được ngay không. KHÔNG trả mã cửa hàng, KHÔNG trả tên
 * đăng nhập, và dĩ nhiên KHÔNG trả mật khẩu. Trang Sell là trang web, mọi thứ
 * gửi sang đó coi như công khai; nó không cần những thứ kia để vẽ một cái nút.
 */
async function tinhTrangKho() {
    const k = await chrome.storage.local.get(KHOA_KHO_TAI_KHOAN);
    const kho = k[KHOA_KHO_TAI_KHOAN];
    const dsMa = Object.keys((kho && kho.khach) || {});

    // KHÔNG CÒN KHÓA MỞ -> khai báo rồi là dùng được ngay. Giữ nguyên tên trường
    // `daMoKhoa` để trang Sell khỏi phải đổi, nhưng nay nó luôn đúng. Riêng kho
    // CŨ (bản 1) thì chưa dùng được cho tới khi người dùng chuyển đổi.
    const dungDuoc = !!kho && !self.HDT_KhoMatKhau.laKhoCu(kho);
    const khach = {};
    for (const ma of dsMa) khach[ma] = { daKhaiBao: true, daMoKhoa: dungDuoc };
    return { coKho: !!kho, dangMo: dungDuoc, khoCu: !!kho && !dungDuoc, khach };
}

/** Dựng lại cầu nối mỗi lần dùng — tiến trình nền có thể đã bị giết giữa chừng. */
async function dungCauNoi() {
    const so = self.HDT_SoGhiDau.taoSo(luuTru(KHOA_SO));
    await so.nap();
    const hangDoi = self.HDT_HangDoi.taoHangDoi({
        so,
        khoaLuuTru: luuTru(KHOA_KHOA_CHAY),
        mayId: 'nen-' + (self.crypto && self.crypto.randomUUID
            ? self.crypto.randomUUID().slice(0, 8) : String(Date.now())),
    });
    return self.HDT_CauNoi.taoCauNoi({
        so, hangDoi,
        timTabTendoo: self.HDT_CauNoi.taoTimTab(chrome),
        // KHÔNG nuốt lỗi: giữ lại lý do thật để tầng trên còn nói được cho
        // người dùng biết vì sao (tab đã đóng, chưa tải lại trang, …).
        guiToiTab: guiTab,
        truocMoiKhach: await taoMocDoiTaiKhoan(),

        // Tự mở tab Tendoo khi chưa có. Mở tab THẬT, nhìn thấy được: Chrome bóp
        // thời gian chờ ở tab ẩn, mà trang POS là ứng dụng nặng — chạy ngầm rất
        // dễ treo giữa chừng. Người dùng nhìn thấy máy làm cũng là điều tốt.
        moTab: async () => {
            const tab = await chrome.tabs.create({
                url: self.HDT_DoiTaiKhoan.URL_POS, active: true,
            });
            return tab && tab.id != null ? { id: tab.id, url: tab.url } : null;
        },
        dongTab: (tabId) => chrome.tabs.remove(tabId),
    });
}

// ════════════════════════════════════════════════════════════════════════════
//  HẸN GIỜ TỰ CHẠY
//
//  ⚠️ Đây là con đường DUY NHẤT máy phát hành hóa đơn khi KHÔNG CÓ AI NGỒI
//  TRƯỚC MÁY. Mọi cửa chặn ở đây phải nghiêng về phía KHÔNG LÀM GÌ. Hóa đơn
//  điện tử đã gửi cơ quan thuế thì không rút lại được.
//
//  Máy tính tắt hoặc Chrome đóng thì không có gì chạy — ở đây không có máy chủ.
// ════════════════════════════════════════════════════════════════════════════

const khoCaiDat = {
    async doc() {
        try {
            const k = await chrome.storage.local.get(KHOA_CAI_DAT);
            return self.HDT_CaiDat.tuKho(k[KHOA_CAI_DAT], true);
        } catch (e) {
            return self.HDT_CaiDat.khiDocHong();
        }
    },
    async ghi(c) { await chrome.storage.local.set({ [KHOA_CAI_DAT]: c }); },
};

/** Dựng lại toàn bộ báo thức theo lịch đang lưu. Gọi mỗi khi lịch đổi. */
async function dungLaiBaoThuc() {
    // Xóa sạch báo thức CỦA MÌNH rồi dựng lại. Không xóa hết bừa: extension
    // khác không dùng chung kho báo thức, nhưng bản thân mình có thể còn báo
    // thức của mốc đã bị người dùng bỏ đi.
    const cu = await chrome.alarms.getAll();
    for (const b of cu) {
        if (self.HDT_HenGio.mocTuTen(b.name)) await chrome.alarms.clear(b.name);
    }
    const c = await khoCaiDat.doc();
    if (!c.henGio.bat) return { dungMay: 0, moc: [] };

    // Dựng báo thức cho MỌI mốc: giờ chung + từng giờ riêng của khách, đã gộp
    // trùng. Truyền cả gói henGio chứ không chỉ danh sách mốc chung.
    const lich = self.HDT_HenGio.dungLich(c.henGio, Date.now());
    for (const b of lich) {
        chrome.alarms.create(b.ten, { when: b.khi, periodInMinutes: 24 * 60 });
    }
    return { dungMay: lich.length, moc: lich.map(b => b.moc) };
}

// ── ĐẨY KẾT QUẢ SANG SELL ───────────────────────────────────────────────────
//
// ⚠️ VIỆC PHỤ, luôn nuốt lỗi. Xem chú thích đầu chung/dayVeSell.js.
const khoChoGui = () => luuTru(self.HDT_DayVeSell.KHOA_CHO_GUI);

/**
 * Xếp dòng vào hàng chờ rồi thử gửi. Gửi không được thì GIỮ LẠI, lần sau gửi bù.
 * `dongMoi` để trống = chỉ gửi bù phần đang đọng.
 */
/**
 * Cách gửi: ƯU TIÊN ghi qua TAB SELL ĐANG ĐĂNG NHẬP, token chỉ là lối phụ.
 *
 * ⚠️ Qua tab thì KHÔNG PHẢI KHAI GÌ CẢ — không token, không cả địa chỉ, vì địa
 * chỉ chính là tab đang mở. Và nó CHẶT HƠN token: Sell xác thực bằng phiên đăng
 * nhập admin của chính bạn, không phải một chuỗi bí mật dùng chung.
 *
 * Không có tab (hoặc tab từ chối) thì mới thử token. Cả hai đều hỏng thì trả
 * ok:false, và `xepVaGui` GIỮ NGUYÊN hàng chờ để lần sau gửi bù.
 */
function taoHamGui(caiDat) {
    return async (cacDong) => {
        // (a) Qua tab Sell đang đăng nhập.
        try {
            const cac = await chrome.tabs.query({});
            const tab = (cac || []).find(t => laTrangBaoCao(t.url));
            if (tab) {
                const tra = await guiTab(tab.id, {
                    loai: 'hdt-ghi-nhan-tu-may', banGhi: cacDong,
                });
                if (tra && tra.ok) return { ...tra, duong: 'TAB_SELL' };
                // Tab có nhưng ghi không được (chưa đăng nhập, hết phiên, chưa
                // F5 sau khi cập nhật extension) -> thử tiếp đường token.
            }
        } catch (e) { /* rơi xuống đường token */ }

        // (b) Lối phụ: gọi thẳng bằng token, nếu đã khai.
        const kq = await self.HDT_DayVeSell.guiCacDong(cacDong, caiDat);
        return { ...kq, duong: 'TOKEN' };
    };
}

// ── BÁO VỀ TELEGRAM ─────────────────────────────────────────────────────────
//
// ⚠️ VIỆC PHỤ, LUÔN NUỐT LỖI — y hệt đường đẩy sang Sell ngay dưới. Telegram
// sập hay sai token thì hóa đơn vẫn phải ra bình thường.
const khoDaBaoTg = () => luuTru(self.HDT_BaoTelegram.KHOA_SO_DA_BAO);

/**
 * Báo những dòng vừa sinh ra. Chống trùng nằm trong baoTelegram.js.
 *
 * ⚠️ CHỈ NHẬN `dongMoi`, KHÔNG nhận phần đang đọng trong hàng chờ gửi Sell.
 * Hàng chờ ấy được gửi lại nhiều lần cho tới khi Sell nhận được; bám vào đó là
 * mỗi lần gửi bù lại thêm một tin Telegram.
 */
async function baoTelegram(dongMoi) {
    try {
        if (!dongMoi) return null;
        const c = await khoCaiDat.doc();
        const kq = await self.HDT_BaoTelegram.baoCacDong({
            cacDong: dongMoi, caiDat: c, kho: khoDaBaoTg(), luc: Date.now(),
        });
        // Ghi lại để màn khai báo còn nói được "lần gửi gần nhất ra sao".
        // Hỏng trong im lặng là rủi ro lớn nhất của tính năng này: sai token thì
        // người dùng không nhận được gì mà cũng không biết vì sao.
        if (kq.daGui || kq.hong) {
            await chrome.storage.local.set({
                [self.HDT_BaoTelegram.KHOA_TRANG_THAI]: { luc: Date.now(), ...kq },
            });
        }
        return kq;
    } catch (e) {
        return null;                       // cố ý nuốt
    }
}

async function daySangSell(dongMoi) {
    try {
        const c = await khoCaiDat.doc();
        const kq = await self.HDT_DayVeSell.xepVaGui({
            kho: khoChoGui(), caiDat: c, dongMoi, gui: taoHamGui(c),
        });
        await chrome.storage.local.set({
            [KHOA_DAY_SELL]: { luc: Date.now(), ...kq },
        });
        return kq;
    } catch (e) {
        return { ok: false, daGui: 0, conLai: 0, thongBao: String((e && e.message) || e) };
    }
}

/**
 * Móc chạy SAU MỖI KHÁCH: khách nào vừa xong là đẩy sang Sell ngay.
 *
 * ⚠️ ĐỪNG ĐỢI HẾT LOẠT. Trước đây chỉ gửi một lần ở cuối; loạt bị ngắt giữa
 * chừng (Chrome đóng, máy sập) là những hóa đơn ĐÃ RA THẬT cũng không sang được
 * Sell — Tendoo có hóa đơn, trang kế toán trống.
 *
 * Mã chống trùng lấy từ id lệnh, nên lần gửi ở cuối loạt chỉ cập nhật lại
 * chính dòng này, không sinh dòng mới.
 */
function taoMocDaySell(ngaySoLieu) {
    return (tienDo) => {
        try {
            const dong = self.HDT_DayVeSell.dongTuTienDo(tienDo, ngaySoLieu, Date.now());
            if (dong) daySangSell(dong);      // cố ý KHÔNG await: đừng làm chậm loạt
            if (dong) baoTelegram(dong);      // cũng KHÔNG await, cũng nuốt lỗi
        } catch (e) { /* cố ý nuốt */ }
    };
}

const ghiKetQuaHen = (o) => chrome.storage.local
    .set({ [KHOA_KET_QUA_HEN]: { ...o, luc: Date.now() } }).catch(() => {});

/**
 * GHI VÀO LỊCH SỬ — giữ nhiều lần chạy, không đè lên nhau.
 *
 * ⚠️ Ô `KHOA_KET_QUA_HEN` cũ chỉ giữ LẦN GẦN NHẤT. Máy chạy lúc không có ai
 * ngồi xem, nên đè xong là mất sạch dấu vết. Vẫn ghi ô cũ (màn hình đang đọc
 * nó) NHƯNG thêm bản ghi đầy đủ vào lịch sử.
 */
async function ghiLichSu(banGhi) {
    try {
        const KHOA = self.HDT_LichSuChay.KHOA;
        const k = await chrome.storage.local.get(KHOA);
        const ds = self.HDT_LichSuChay.themVao(k[KHOA], banGhi);
        await chrome.storage.local.set({ [KHOA]: ds });
    } catch (e) { /* mất lịch sử không được phép làm hỏng lần chạy */ }

    // Đẩy thêm một bản sao sang Sell — LƯỚI AN TOÀN cho đường gửi-từng-khách.
    // Gửi trùng không sao: mã chống trùng lấy từ id lệnh nên Sell cập nhật lại
    // đúng dòng cũ, không thêm dòng mới. Ở đây còn gom cả những khách CHƯA từng
    // chạy (bỏ qua, chưa chạy tới) — đường từng-khách không có tin cho họ.
    try {
        await daySangSell(self.HDT_DayVeSell.goiTuBanGhi(banGhi));
    } catch (e) { /* cố ý nuốt */ }

    // ⚠️ LƯỚI AN TOÀN CHO TELEGRAM, cùng lý do với dòng ngay trên. Đường
    // báo-từng-khách có thể trượt: mạng chập đúng lúc ấy, hoặc tin tiến độ
    // không tới. Sổ chống trùng lo phần không gửi lại cái đã gửi — và đây cũng
    // chính là LẦN THỬ LẠI của những tin vừa hỏng (chúng đã được trả chỗ).
    try {
        await baoTelegram(self.HDT_DayVeSell.goiTuBanGhi(banGhi));
    } catch (e) { /* cố ý nuốt */ }

    // ⚠️ TIN CẢ LƯỢT KHÔNG CHẠY. Lý do nằm ở TẦNG LƯỢT chứ không ở dòng khách
    // nào — lượt 18:10 ngày 21/08/2026 hỏng vì «Không gọi được bongtom.store»,
    // và không một dòng khách nào mang nổi câu ấy. Chỉ báo theo dòng khách thì
    // cả lượt hỏng mà người dùng KHÔNG NHẬN ĐƯỢC GÌ.
    try {
        const c = await khoCaiDat.doc();
        const kq = await self.HDT_BaoTelegram.baoLuot({
            banGhi, caiDat: c, kho: khoDaBaoTg(), luc: Date.now(),
        });
        if (kq.daGui || kq.hong) {
            await chrome.storage.local.set({
                [self.HDT_BaoTelegram.KHOA_TRANG_THAI]: { luc: Date.now(), ...kq },
            });
        }
    } catch (e) { /* cố ý nuốt — việc phụ, không được làm hỏng lần chạy */ }
}

/** Ghi CẢ HAI: ô "lần gần nhất" và một bản ghi lịch sử đầy đủ. */
/** Số hiệu bản extension đang chạy. Không hỏi được thì để trống, đừng bịa. */
function banDangChay() {
    try { return String(chrome.runtime.getManifest().version || ''); } catch (e) { return ''; }
}

async function ghiKetQuaVaLichSu(o, trongLich) {
    await ghiKetQuaHen(o);
    await ghiLichSu(self.HDT_LichSuChay.taoBanGhi({
        banExt: banDangChay(),
        nguon: o.nguon || self.HDT_LichSuChay.NGUON.HEN_GIO,
        moc: o.moc, ngay: o.ngay, chay: o.chay, lyDo: o.lyDo, thongBao: o.thongBao,
        trongLich: trongLich || [], thieu: o.thieu, ketQua: o.ketQua,
    }));
}

/** Địa chỉ trang báo cáo Sell mà lịch đã ghi lại. Chưa có thì không đoán bừa. */
const laTrangBaoCao = (url) => /\/bao-cao-khach-hang/.test(String(url || ''));

/**
 * Tìm tab trang báo cáo Sell; chưa có thì MỞ đúng địa chỉ đã lưu lúc đặt lịch.
 *
 * Không đoán địa chỉ: bongtom.store và 127.0.0.1:8000 là hai nơi khác nhau,
 * đọc nhầm bảng của môi trường kia là ra hóa đơn theo số của môi trường kia.
 */
async function timHoacMoTabBang(urlBang) {
    const cac = await chrome.tabs.query({});
    const co = cac.find(t => laTrangBaoCao(t.url));
    if (co) return { id: co.id, tuMo: false };
    if (!laTrangBaoCao(urlBang)) return null;
    const tab = await chrome.tabs.create({ url: urlBang, active: false });
    if (!tab || tab.id == null) return null;
    // Trang Sell là ứng dụng thường, chờ nó tải xong rồi mới hỏi.
    await doiTrang(tab.id, laTrangBaoCao, self.HDT_NhipDo.HAN_DOI_TRANG);
    return { id: tab.id, tuMo: true };
}

async function chayTheoHen(moc) {
    const c = await khoCaiDat.doc();
    const so = await docSo();
    const soLenhTreo = so.layLenhTreo().length;
    const khoa = await luuTru(KHOA_KHOA_CHAY).doc();
    const dangChay = !!(khoa && Number(khoa.hetHanLuc) > Date.now());

    // ⚠️ CHỈ những khách CỦA ĐÚNG MỐC NÀY. Khách có giờ riêng thì giờ chung
    // KHÔNG đụng tới — quên chỗ này là khách chạy hai lần trong ngày.
    const trongLich = self.HDT_HenGio.khachCuaMoc(c.henGio, moc);
    const cho = self.HDT_HenGio.duocChay({ caiDat: c, soLenhTreo, dangChay });
    if (!cho.chay) {
        await ghiKetQuaVaLichSu({ moc, chay: false, lyDo: cho.lyDo,
                                  thongBao: cho.thongBao }, trongLich);
        return;
    }

    // Mốc này không còn khách nào (người dùng vừa chuyển hết sang giờ riêng) —
    // ghi lại rồi thôi, không mở tab, không đụng Tendoo.
    if (!trongLich.length) {
        await ghiKetQuaVaLichSu({
            moc, chay: false, lyDo: 'MOC_KHONG_CO_KHACH',
            thongBao: `Mốc ${moc} không còn khách nào (có thể đã chuyển hết sang giờ riêng). `
                + 'Chưa làm gì cả.',
        }, []);
        return;
    }

    // ⚠️ ĐỌC BẰNG TOKEN TRƯỚC — chạy được cả khi KHÔNG đăng nhập Sell. Khai
    // token rồi thì KHÔNG bao giờ đụng tới trang báo cáo nữa, nên đăng nhập hay
    // đăng xuất cũng ra cùng một con số.
    let bang = await docSoQuaToken(c);
    let tab = null;
    if (!bang) {
        // Chưa khai token — lối phụ: đọc bảng trên trang báo cáo như trước.
        tab = await timHoacMoTabBang(c.henGio.urlBang);
        if (!tab) {
            await ghiKetQuaVaLichSu({
                moc, chay: false, lyDo: 'KHONG_MO_DUOC_BANG',
                thongBao: 'Không mở được trang báo cáo để đọc số mới. Hãy lưu lại lịch một lần '
                    + 'nữa khi đang đứng ở trang báo cáo, để máy nhớ đúng địa chỉ. '
                    + '(Khai token ở màn 🔑 thì máy đọc thẳng số, khỏi cần trang này.)',
            }, trongLich);
            return;
        }
        // ⚠️ ÉP BẢNG VỀ "HÔM NAY" rồi mới đọc. Trang mặc định lọc "Tháng này",
        // đọc thẳng là lấy doanh thu CẢ THÁNG — quyết định của chủ dự án
        // 2026-08-13: hẹn giờ chỉ lấy số của đúng ngày hôm đó.
        bang = await guiTab(tab.id, { loai: 'hdt-doc-bang', epHomNay: true });
    }
    const tinCay = !!(bang && bang.ok && bang.tinCay && Array.isArray(bang.dong));
    if (!tinCay) {
        dongTabNeuTuMo(tab);
        // KHÔNG được kết luận "hôm nay cả lịch đều im" ở đây: bảng chưa chắc đúng
        // thì mọi khách đều trông như không có doanh thu.
        await ghiKetQuaVaLichSu({
            moc, chay: false, lyDo: (bang && bang.ma) || 'KHONG_DOC_DUOC_BANG',
            ngay: bang && bang.ngay,
            thongBao: (bang && bang.thongBao)
                || `Không đọc được bảng theo đúng hôm nay (${(bang && bang.__loiGui) || 'không có dữ liệu'}). `
                   + 'Chưa làm gì cả, chưa tạo hóa đơn nào.',
        }, trongLich);
        return;
    }

    const ghep = self.HDT_HenGio.ghepVoiBang(trongLich, bang.dong, true);
    let dsChay = ghep.chay;
    let thieu = ghep.thieu;
    let loiDatSo = [];

    // ── SỐ TIỀN NGƯỜI DÙNG TỰ ĐẶT ───────────────────────────────────────────
    //
    // ⚠️ CHỈ CHẠM VÀO KHI CÓ NGƯỜI ĐẶT SỐ. Không ai đặt thì không một lần gọi
    // mạng nào, không một điều kiện mới nào — khách để trống ô phải chạy đúng
    // nếp cũ, và nếp cũ thì đã chạy đúng.
    if (self.HDT_ApDungSoDat.coKhachDatSo(trongLich)) {
        const kqDu = await self.HDT_SoDuKeToan.docSoDu({ caiDat: c, luc: Date.now() });
        let soDu = kqDu.ok ? kqDu.soDu : null;
        // Trừ những tờ ĐÃ RA THẬT mà chưa đẩy được về Sell — số dư Sell trả về
        // chỉ phản ánh phần đã tới nơi. Xem chú thích truHangCho().
        if (soDu) {
            let cho = [];
            try { cho = (await khoChoGui().doc()) || []; } catch (e) { cho = []; }
            soDu = self.HDT_ApDungSoDat.truHangCho(soDu, Array.isArray(cho) ? cho : cho.ds);
        }
        const ap = self.HDT_ApDungSoDat.apDung({
            trongLich, ghep, soDu, loiSoDu: kqDu.thongBao,
        });
        dsChay = ap.chay;
        thieu = ap.thieu;
        loiDatSo = ap.loi;
    }

    if (!dsChay.length && !loiDatSo.length) {
        dongTabNeuTuMo(tab);
        // Đây là NGÀY YÊN Ả, không phải lỗi: khách không mua thì không có gì để
        // xuất. Không mở tab Tendoo, không đăng nhập ai, không gạch tên ai.
        // ⚠️ NÓI ĐÚNG LÝ DO THẬT, đừng đóng đinh một câu.
        //
        // Lượt 16:45 ngày 24/08/2026 nhắn "không khách nào phát sinh doanh thu"
        // trong khi lý do thật là "số dư chưa xuất hóa đơn không đủ". Câu ấy
        // đóng đinh sẵn ở đây nên nó nói sai mà không ai biết — đúng loại lỗi
        // đã mất mấy ngày để moi ra ở chỗ khác.
        const keLyDo = (thieu || [])
            .filter(x => x && x.lyDo)
            .map(x => `${x.tenKH || x.maKH}: ${x.lyDo}`)
            .slice(0, 6);
        await ghiKetQuaVaLichSu({
            moc, chay: false, lyDo: 'KHONG_KHACH_NAO_PHAT_SINH', thieu, ngay: bang.ngay,
            thongBao: `Hôm nay (${bang.ngay.tu}) không khách nào trong lịch chạy được. `
                + (keLyDo.length ? 'Lý do từng khách — ' + keLyDo.join('; ') + '. '
                                 : 'Không khách nào phát sinh doanh thu. ')
                + 'Lịch giữ nguyên, mai chạy tiếp.',
        }, trongLich);
        return;
    }

    const cn = await dungCauNoi();
    // Gửi sang Sell NGAY sau mỗi khách, không đợi hết loạt.
    //
    // Không còn ai chạy được (tất cả đều hỏng ở khâu số dư) thì KHÔNG mở tab
    // Tendoo cho phí — nhưng vẫn phải dựng một kết quả để những lỗi ấy đi tiếp
    // vào lịch sử và Telegram, chứ không biến mất.
    const tra = dsChay.length
        ? await cn.taoHoaDon(dsChay, taoMocDaySell(bang.ngay && bang.ngay.tu))
        : { dung: true, ly_do: 'KHONG_DOC_DUOC_SO_DU', xong: [], loi: [], treo: [],
            thongBao: 'Không khách nào chạy được vì chưa biết trần số dư.' };
    // Ghép lỗi khâu số dư vào cùng chỗ với lỗi khi chạy — một đường duy nhất ra
    // lịch sử và Telegram, khỏi phải nhớ có hai loại lỗi ở hai nơi.
    if (loiDatSo.length) {
        tra.loi = [...(tra.loi || []), ...loiDatSo.map(x => ({
            id: '', maKH: x.maKH, tenKH: x.tenKH, soTien: 0,
            maLoi: 'SO_DU_KHONG_DUNG', thongBao: x.thongBao,
        }))];
    }
    // ⚠️ KHÔNG được đóng đinh `chay: true`. Cầu nối có năm đường bỏ cuộc ở TẦNG
    // LƯỢT (đang chạy dở, không có tab, tab chưa sẵn sàng, giao diện lạ, giỏ còn
    // hàng) — cả năm đều trả về TRƯỚC khi đụng tới khách nào. Khai là "đã chạy"
    // thì lý do bị vứt, bảng hiện trơ "chưa chạy tới", Telegram không báo gì.
    await ghiKetQuaVaLichSu({
        moc, chay: self.HDT_LichSuChay.daChay(tra),
        lyDo: (tra && tra.ly_do) || '', thongBao: (tra && tra.thongBao) || '',
        thieu, ngay: bang.ngay, soKhach: dsChay.length, ketQua: tra,
    }, trongLich);
    dongTabNeuTuMo(tab);
}

/**
 * KIỂM TRA THỬ — đi hết đường của hẹn giờ nhưng DỪNG TRƯỚC KHI ĐỤNG TENDOO.
 *
 * ⚠️ TUYỆT ĐỐI KHÔNG phát hành gì, không mở tab Tendoo, không đăng nhập ai,
 * không đổi tài khoản. Chỉ trả lời câu "tới giờ thì nó sẽ làm gì" — mà trước
 * đây phải ngồi đợi tới giờ mới biết, và biết rồi cũng không rõ hỏng ở đâu.
 *
 * Kiểm tới đâu thì nói tới đó: phần sau Tendoo (đăng nhập, ghép tiền theo kho
 * hàng của từng khách) KHÔNG kiểm được mà không đụng vào tài khoản thật.
 */
async function kiemTraThu() {
    const c = await khoCaiDat.doc();
    const so = await docSo();
    const soLenhTreo = so.layLenhTreo().length;
    const khoa = await luuTru(KHOA_KHOA_CHAY).doc();
    const dangChay = !!(khoa && Number(khoa.hetHanLuc) > Date.now());
    const trongLich = c.henGio.khach || [];

    const cac = await chrome.tabs.query({});
    const tabBang = cac.find(t => laTrangBaoCao(t.url)) || null;

    const sanSang = self.HDT_HenGio.kiemSanSang({
        caiDat: c, soLenhTreo, dangChay, coTabBang: !!tabBang,
    });
    const cua = self.HDT_HenGio.duocChay({ caiDat: c, soLenhTreo, dangChay });

    const ra = { ok: true, sanSang, cua, ngay: null, chay: [], thieu: [], bang: null };

    // ⚠️ ĐI ĐÚNG ĐƯỜNG MÀ LÚC CHẠY THẬT SẼ ĐI. Kiểm thử bằng một đường rồi chạy
    // thật bằng đường khác thì kiểm thử chẳng chứng minh được gì.
    let bang = await docSoQuaToken(c);
    if (!bang) {
        if (!tabBang) {
            ra.bang = { ok: false, thongBao: 'Chưa khai token, mà cũng chưa mở tab trang báo cáo '
                + 'nên chưa đọc thử được. Khai token ở màn 🔑 thì máy đọc thẳng số kể cả khi '
                + 'không đăng nhập bongtom.store; hoặc mở sẵn trang báo cáo để kiểm thử.' };
            return ra;
        }
        bang = await guiTab(tabBang.id, { loai: 'hdt-doc-bang', epHomNay: true });
    }
    if (!bang || !bang.ok || !bang.tinCay || !Array.isArray(bang.dong)) {
        ra.bang = {
            ok: false,
            thongBao: (bang && bang.thongBao)
                || `Không đọc được bảng theo đúng hôm nay (${(bang && bang.__loiGui)
                    || 'trang chưa nạp code mới — hãy bấm F5 trên tab báo cáo'}).`,
        };
        return ra;
    }

    ra.bang = { ok: true, soDong: bang.dong.length, nguon: bang.nguon || 'TRANG_BAO_CAO' };
    ra.ngay = bang.ngay;
    // Kể theo TỪNG MỐC: mốc nào chạy cho ai, chứ không gộp một đống.
    ra.theoMoc = self.HDT_HenGio.gomTheoMoc(c.henGio).map((o) => {
        const g = self.HDT_HenGio.ghepVoiBang(o.khach, bang.dong, true);
        return { moc: o.moc, laGioChung: o.laGioChung, chay: g.chay, thieu: g.thieu };
    });
    const g = self.HDT_HenGio.ghepVoiBang(trongLich, bang.dong, true);
    ra.chay = g.chay;
    ra.thieu = g.thieu;
    return ra;
}

chrome.alarms.onAlarm.addListener((bao) => {
    const moc = self.HDT_HenGio.mocTuTen(bao && bao.name);
    if (!moc) return;      // báo thức không phải của mình -> kệ
    chayTheoHen(moc).catch(e => ghiKetQuaHen({
        moc, chay: false, lyDo: 'NGOAI_LE',
        thongBao: 'Lỗi khi chạy theo hẹn: ' + (e && e.message ? e.message : String(e)),
    }));
});

// Chrome vừa mở lại / extension vừa cài lại -> báo thức cũ có thể đã mất.
// Chrome vừa mở lại -> dựng lại báo thức VÀ gửi bù phần còn đọng trong hàng chờ.
chrome.runtime.onStartup.addListener(() => {
    dungLaiBaoThuc().catch(() => {});
    daySangSell().catch(() => {});
});
chrome.runtime.onInstalled.addListener(() => {
    dungLaiBaoThuc().catch(() => {});
    daySangSell().catch(() => {});
});

/**
 * BỎ TOKEN TELEGRAM RA KHỎI CÂU TRẢ LỜI, chỉ để lại "đã khai hay chưa".
 *
 * ⚠️ `hdt-hoi-cai-dat` và `hdt-dat-cai-dat` KHÔNG chỉ phục vụ màn khai báo —
 * bảng cài đặt bên trang bongtom.store cũng gửi đúng hai tin này, và đó là một
 * CONTENT SCRIPT chạy trong trang web. Trả cả gói về nghĩa là token nằm trong
 * tầm với của mã trên trang ấy.
 *
 * Màn khai báo không cần giá trị token: nó vốn KHÔNG BAO GIỜ vẽ lại bí mật đã
 * lưu, chỉ cần biết "đã có" để đổi chữ gợi ý trong ô. Nên đưa ít đi không mất
 * gì cả.
 *
 * (Chat id thì để nguyên: nó không phải bí mật, và màn khai báo phải hiện được
 * cho người dùng đối chiếu.)
 */
function cheTokenTelegram(c) {
    const o = { ...(c || {}) };
    o.telegramDaCoToken = !!String(o.telegramToken || '').trim();
    delete o.telegramToken;
    return o;
}

chrome.runtime.onMessage.addListener((tin, nguoiGui, traLoi) => {
    if (!tin || typeof tin !== 'object') return false;

    if (tin.loai === self.HDT_CauNoi.LOAI_TIN.TAO_HOA_DON) {
        // Chạy TAY cũng ghi lịch sử: một nguồn sự thật duy nhất cho cả hai lối,
        // để mở bảng lịch sử ra là thấy hết chứ không phải nhớ mình đã bấm gì.
        const dsTay = (tin.danhSach || []).map(k => ({ maKH: k.maKH, tenKH: k.tenKH }));
        const mocDaySellTay = taoMocDaySell(tin.ngaySoLieu || null);
        dungCauNoi()
            .then(cn => cn.taoHoaDon(tin.danhSach, (tienDo) => {
                // Gửi sang Sell NGAY sau mỗi khách. Chạy tay thì ngày số liệu
                // là khoảng đang hiện trên bảng — không có thì lùi về ngày máy.
                mocDaySellTay(tienDo);
                // Báo tiến độ ngược về trang Sell. Nuốt lỗi: tab có thể đã đóng.
                if (nguoiGui && nguoiGui.tab && nguoiGui.tab.id != null) {
                    chrome.tabs.sendMessage(nguoiGui.tab.id, {
                        loai: self.HDT_CauNoi.LOAI_TIN.TIEN_DO, tienDo,
                    }).catch(() => {});
                }
            }))
            .then(async (kq) => {
                await ghiLichSu(self.HDT_LichSuChay.taoBanGhi({
                    banExt: banDangChay(),
                    nguon: self.HDT_LichSuChay.NGUON.TAY,
                    chay: self.HDT_LichSuChay.daChay(kq),
                    lyDo: (kq && kq.ly_do) || '', thongBao: (kq && kq.thongBao) || '',
                    trongLich: dsTay, ketQua: kq,
                }));
                return kq;
            })
            .then(traLoi)
            .catch((e) => traLoi({
                dung: true, ly_do: 'NGOAI_LE',
                thongBao: 'Lỗi ở tiến trình nền: ' + (e && e.message ? e.message : String(e)),
            }));
        return true;
    }

    // Trang Sell hỏi danh sách lệnh bị ngắt giữa chừng, để người dùng tự kết luận.
    if (tin.loai === 'hdt-lenh-treo') {
        docSo()
            .then(so => traLoi({ ok: true, treo: so.layLenhTreo().map(gonLenhTreo) }))
            .catch(e => traLoi({ ok: false, thongBao: String(e && e.message), treo: [] }));
        return true;
    }

    // Người dùng đã tự mở Tendoo kiểm tra và kết luận. CHỈ họ mới được kết luận —
    // máy không bao giờ tự đoán, vì đoán sai là hoặc mất hóa đơn, hoặc ra trùng.
    if (tin.loai === 'hdt-xu-ly-treo') {
        docSo()
            .then(async (so) => {
                const l = await so.xuLyLenhTreo(tin.id, !!tin.daPhatHanh);
                return { ok: true, lenh: gonLenhTreo(l),
                         conLai: so.layLenhTreo().map(gonLenhTreo) };
            })
            .then(traLoi)
            .catch(e => traLoi({ ok: false, thongBao: String(e && e.message) }));
        return true;
    }

    // Trang Sell / popup hỏi tình trạng kho tài khoản, để tô dấu hiệu trên bảng.
    if (tin.loai === 'hdt-tinh-trang-kho') {
        tinhTrangKho()
            .then(traLoi)
            .catch(() => traLoi({ coKho: false, dangMo: false, khach: {} }));
        return true;
    }


    // Trang Sell / popup hỏi trạng thái các công tắc, độ lệch và lịch hẹn.
    if (tin.loai === 'hdt-hoi-cai-dat') {
        khoCaiDat.doc()
            .then(c => traLoi(cheTokenTelegram(c)))
            .catch(() => traLoi(self.HDT_CaiDat.khiDocHong()));
        return true;
    }

    if (tin.loai === 'hdt-dat-cai-dat') {
        // GỘP chứ không ghi đè: popup, bảng cài đặt bên Sell và lịch hẹn là ba
        // nơi khác nhau, mỗi nơi chỉ gửi phần của mình. Ghi đè cả gói là lưu
        // chỗ này thì chỗ kia tự mất — người dùng không hiểu vì sao.
        chrome.storage.local.get(KHOA_CAI_DAT)
            .then(async (k) => {
                const c = self.HDT_CaiDat.gop(k[KHOA_CAI_DAT], tin, self.HDT_HenGio);
                await khoCaiDat.ghi(c);
                // Lịch đổi thì báo thức phải dựng lại NGAY. Để lần sau mới dựng
                // là người dùng bấm Lưu xong, tắt máy, và không có gì chạy cả.
                const lich = await dungLaiBaoThuc();
                return { ...c, lich };
            })
            .then(c => traLoi({ ok: true, ...cheTokenTelegram(c) }))
            .catch(e => traLoi({ ok: false, thongBao: String(e && e.message) }));
        return true;
    }

    // Màn khai báo hỏi: còn bao nhiêu dòng đang chờ gửi sang Sell.
    if (tin.loai === 'hdt-so-cho-gui-sell') {
        self.HDT_DayVeSell.soDangCho(khoChoGui())
            .then(n => traLoi({ ok: true, soCho: n }))
            .catch(() => traLoi({ ok: false, soCho: 0 }));
        return true;
    }

    // Người dùng bấm "Thử kết nối" — gửi một gói RỖNG để xem máy chủ trả lời gì.
    // Biết ngay trong một giây thay vì phải chạy hẳn một lượt hóa đơn thật.
    if (tin.loai === 'hdt-thu-ket-noi-sell') {
        // Gói THĂM DÒ: một dòng KHÔNG CÓ MÃ KHÁCH. Sell nhận gói, bỏ qua dòng đó
        // (vòng lặp `continue` khi mã rỗng) rồi trả về thành công với da_ghi=0.
        // Đi hết đường xác thực mà KHÔNG ghi gì vào sổ kế toán.
        khoCaiDat.doc()
            .then(c => taoHamGui(c)([{ ngay: '', ma_khach_hang: '', so_tien: 0 }]))
            .then(kq => traLoi({ ok: !!kq.ok, ...kq }))
            .catch(e => traLoi({ ok: false, thongBao: String(e && e.message) }));
        return true;
    }

    // Màn khai báo bấm "Chụp giao diện POS" — nhờ tab Tendoo kể lại nó thấy gì.
    //
    // ⛔ CHỈ ĐỌC. Tin này không bấm gì trên trang bán hàng.
    if (tin.loai === 'hdt-chup-giao-dien') {
        (async () => {
            try {
                const cac = await chrome.tabs.query({ url: 'https://seller-v3.tendoo.vn/*' });
                const tab = (cac || [])[0];
                if (!tab) {
                    traLoi({ ok: false, thongBao: 'Chưa mở tab Tendoo nào. Hãy mở trang bán hàng '
                        + '(seller-v3.tendoo.vn/sales/pos) rồi bấm lại.' });
                    return;
                }
                const tra = await guiTab(tab.id, { loai: 'hdt-chup-giao-dien', tuyChon: {} });
                traLoi(tra && tra.ok ? tra : {
                    ok: false, thongBao: (tra && tra.thongBao)
                        || 'Tab Tendoo không trả lời — hãy tải lại trang bán hàng rồi thử lại.',
                });
            } catch (e) {
                traLoi({ ok: false, thongBao: String((e && e.message) || e) });
            }
        })();
        return true;
    }

    // Người dùng bấm "Gửi thử" ở màn khai báo Telegram.
    if (tin.loai === 'hdt-telegram-gui-thu') {
        khoCaiDat.doc()
            .then(c => self.HDT_BaoTelegram.guiThu(c, null, Date.now()))
            .then(kq => traLoi({ ok: !!kq.ok, ma: kq.ma, thongBao: kq.thongBao }))
            .catch(e => traLoi({ ok: false, thongBao: String(e && e.message) }));
        return true;
    }

    // Người dùng bấm "Dò chat id" sau khi đã nhắn cho bot một câu.
    if (tin.loai === 'hdt-telegram-do-chat-id') {
        khoCaiDat.doc()
            .then(c => self.HDT_BaoTelegram.doChatId(c))
            .then(kq => traLoi({ ok: !!kq.ok, chatId: kq.chatId, ten: kq.ten,
                                 ma: kq.ma, thongBao: kq.thongBao }))
            .catch(e => traLoi({ ok: false, thongBao: String(e && e.message) }));
        return true;
    }

    // Màn khai báo hỏi lần báo Telegram gần nhất.
    if (tin.loai === 'hdt-telegram-trang-thai') {
        chrome.storage.local.get(self.HDT_BaoTelegram.KHOA_TRANG_THAI)
            .then(k => traLoi({ ok: true,
                                ketQua: k[self.HDT_BaoTelegram.KHOA_TRANG_THAI] || null }))
            .catch(() => traLoi({ ok: false, ketQua: null }));
        return true;
    }

    // Người dùng bấm "Gửi lại phần chưa gửi".
    if (tin.loai === 'hdt-gui-lai-sell') {
        daySangSell()
            .then(kq => traLoi({ ok: !!kq.ok, ...kq }))
            .catch(e => traLoi({ ok: false, thongBao: String(e && e.message) }));
        return true;
    }

    // Popup hỏi lần gửi sang Sell gần nhất.
    if (tin.loai === 'hdt-lan-day-sell') {
        chrome.storage.local.get(KHOA_DAY_SELL)
            .then(k => traLoi({ ok: true, ketQua: k[KHOA_DAY_SELL] || null }))
            .catch(() => traLoi({ ok: false, ketQua: null }));
        return true;
    }

    // Trang Sell hỏi LỊCH SỬ: khách nào thành công, khách nào không, vì sao.
    if (tin.loai === 'hdt-lich-su-chay') {
        chrome.storage.local.get(self.HDT_LichSuChay.KHOA)
            .then(k => traLoi({ ok: true, ds: k[self.HDT_LichSuChay.KHOA] || [] }))
            .catch(e => traLoi({ ok: false, ds: [], thongBao: String(e && e.message) }));
        return true;
    }

    // Trang Sell hỏi: TỚI GIỜ CÓ CHẠY ĐƯỢC KHÔNG, và đang vướng cái gì.
    if (tin.loai === 'hdt-tinh-trang-san-sang') {
        (async () => {
            const c = await khoCaiDat.doc();
            const so = await docSo();
            const khoa = await luuTru(KHOA_KHOA_CHAY).doc();
            const cac = await chrome.tabs.query({}).catch(() => []);
            const bao = await chrome.alarms.getAll().catch(() => []);
            const sapToi = (bao || [])
                .filter(b => self.HDT_HenGio.mocTuTen(b.name))
                .map(b => b.scheduledTime).sort((a, b) => a - b);
            return {
                ok: true,
                ...self.HDT_HenGio.kiemSanSang({
                    caiDat: c,
                    soLenhTreo: so.layLenhTreo().length,
                    dangChay: !!(khoa && Number(khoa.hetHanLuc) > Date.now()),
                    coTabBang: (cac || []).some(t => laTrangBaoCao(t.url)),
                    lanKeTiepMs: sapToi[0] || null,
                }),
                soBaoThuc: sapToi.length,
            };
        })()
            .then(traLoi)
            .catch(e => traLoi({ ok: false, thongBao: String(e && e.message) }));
        return true;
    }

    // Kiểm tra thử — KHÔNG phát hành gì, không đụng Tendoo.
    if (tin.loai === 'hdt-kiem-tra-thu') {
        kiemTraThu()
            .then(traLoi)
            .catch(e => traLoi({ ok: false, thongBao: String(e && e.message) }));
        return true;
    }

    // Trang Sell hỏi lần hẹn gần nhất đã làm gì — vì lúc đó không ai ngồi xem.
    if (tin.loai === 'hdt-ket-qua-hen-gio') {
        Promise.all([
            chrome.storage.local.get(KHOA_KET_QUA_HEN),
            chrome.alarms.getAll().catch(() => []),
        ])
            .then(([k, bao]) => traLoi({
                ok: true,
                ketQua: k[KHOA_KET_QUA_HEN] || null,
                sapToi: (bao || [])
                    .filter(b => self.HDT_HenGio.mocTuTen(b.name))
                    .map(b => ({ moc: self.HDT_HenGio.mocTuTen(b.name), khi: b.scheduledTime }))
                    .sort((a, b) => a.khi - b.khi),
            }))
            .catch(e => traLoi({ ok: false, thongBao: String(e && e.message) }));
        return true;
    }

    return false;
});
