'use strict';

// ⚠️ TOÀN BỘ FILE NẰM TRONG MỘT PHẠM VI RIÊNG (hàm bọc ngoài).
// Chrome nạp nhiều file vào CÙNG MỘT phạm vi — hai file cùng khai `const API`
// là file thứ hai nổ ngay khi nạp mà KHÔNG có lỗi nào hiện ra.

(function () {

// ============================================================================
//  Ô KHAI BÁO TÀI KHOẢN — hiện NGAY TRONG TRANG SELL, cạnh nút "Tạo HĐ"
//
//  Trước đây muốn khai báo tài khoản Tendoo của khách thì phải mở popup của
//  extension, tự nhớ mã khách rồi gõ lại. Bất tiện. Nay dời hẳn vào trang báo
//  cáo: mỗi dòng khách có một nút chìa khóa, bấm là mở đúng khách đó.
//
//  ⚠️ VÌ SAO PHẢI DÙNG IFRAME, KHÔNG CẮM THẲNG Ô NHẬP VÀO TRANG
//
//  Content script và trang chủ nhà DÙNG CHUNG MỘT DOM. Nếu ô nhập mật khẩu nằm
//  thẳng trong trang Sell thì MỌI đoạn script của trang đó đọc được value, và
//  nghe được từng phím gõ qua listener ở document. Hôm nay Sell là code nhà
//  mình nên không sao, nhưng chỉ cần một lỗ XSS hay một thư viện ngoài bị chèn
//  là mất sạch mật khẩu Tendoo của mọi khách.
//
//  Iframe trỏ tới chrome-extension:// là một TÀI LIỆU KHÁC NGUỒN GỐC:
//    - trang Sell không với vào được bên trong (contentDocument ném lỗi)
//    - phím gõ trong iframe KHÔNG nổi lên trang cha
//  Trang Sell chỉ thấy một cái khung đục. Đây là ranh giới an toàn, không phải
//  chi tiết trang trí — ai sửa file này xin đừng đổi iframe thành div.
//
//  DỮ LIỆU VẪN THUỘC VỀ EXTENSION. Trang Sell không lưu gì, không gửi gì lên
//  máy chủ, không có bảng nào trong cơ sở dữ liệu. Chỉ mượn chỗ để hiển thị.
//
//  Thứ duy nhất đi từ extension ra trang Sell là TÌNH TRẠNG (khách này đã khai
//  báo chưa, kho mở chưa) — không kèm tên đăng nhập, không kèm mã cửa hàng,
//  tuyệt đối không kèm mật khẩu.
// ============================================================================

const ID_KHUNG = 'hdt-khung-khai-bao';
const ID_THANH_KHOA = 'hdt-thanh-khoa';
const TRANG_KHAI_BAO = 'khaiBao.html';
const HAN_CHO_KHUNG_MS = 4000;         // khung không lên tiếng trong ngần này -> mở lối thoát

const CSS = `
.hdt-kb-nut { border:1px solid #d1d5db; background:#fff; border-radius:6px; cursor:pointer;
  padding:3px 7px; font-size:12px; line-height:1.6; margin-left:6px; color:#6b7280; }
.hdt-kb-nut:hover { border-color:#9ca3af; }
.hdt-kb-nut.chua { border-color:#d1d5db; color:#9ca3af; }
.hdt-kb-nut.xong { border-color:#16a34a; color:#16a34a; }
.hdt-kb-nut.khoa { border-color:#d97706; color:#d97706; }
.hdt-kb-lop { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:100000;
  display:flex; align-items:center; justify-content:center; padding:16px; }
.hdt-kb-hop { background:#fff; border-radius:12px; width:min(560px,100%); display:flex;
  flex-direction:column; max-height:88vh; overflow:hidden; font-family:inherit; color:#111827; }
.hdt-kb-dau { padding:12px 16px; border-bottom:1px solid #e5e7eb; display:flex;
  align-items:center; justify-content:space-between; }
.hdt-kb-dau b { font-size:15px; }
.hdt-kb-dau button { border:0; background:none; font-size:18px; cursor:pointer; color:#6b7280; }
.hdt-kb-khung { border:0; width:100%; height:520px; max-height:78vh; display:block; }
.hdt-kb-chan { padding:8px 16px; border-top:1px solid #e5e7eb; font-size:11.5px;
  color:#6b7280; line-height:1.45; }
.hdt-thanh-khoa { display:flex; align-items:center; gap:10px; background:#fffbeb;
  border:1px solid #fcd34d; color:#92400e; border-radius:8px; padding:8px 12px;
  font-size:12.5px; margin-bottom:10px; font-family:inherit; }
.hdt-thanh-khoa button { border:1px solid #d97706; background:#fff; color:#b45309;
  border-radius:6px; padding:4px 12px; font-size:12px; cursor:pointer; }
`;

function themStyle(tailieu) {
    const ID = 'hdt-style-khai-bao';
    if (tailieu.getElementById(ID)) return;
    const the = tailieu.createElement('style');
    the.id = ID;
    the.textContent = CSS;
    (tailieu.head || tailieu.documentElement).appendChild(the);
}

/**
 * @param {object} boi
 *   - tailieu     : document của trang Sell
 *   - guiNen      : (tin) => Promise  — nói chuyện với tiến trình nền
 *   - diaChiTrang : (ten) => 'chrome-extension://.../khaiBao.html'
 *   - nghePhanHoi : (ham) => huy   — nghe tin iframe báo "đã lưu" (tùy chọn)
 */
function taoOKhaiBao(boi) {
    const tailieu = boi.tailieu;
    const guiNen = boi.guiNen;
    const diaChiTrang = boi.diaChiTrang;

    // { coKho, dangMo, khach: { PA: {daKhaiBao, daMoKhoa} } }
    let tinhTrang = { coKho: false, dangMo: false, khach: {} };
    const cacNut = new Map();          // maKH -> nút, để tô lại khi tình trạng đổi
    let huyNghe = null;

    // ─── Tình trạng ─────────────────────────────────────────────────────────

    async function docTinhTrang() {
        let t = null;
        try { t = await guiNen({ loai: 'hdt-tinh-trang-kho' }); } catch (e) { t = null; }
        tinhTrang = {
            coKho: !!(t && t.coKho),
            dangMo: !!(t && t.dangMo),
            khach: (t && t.khach) || {},
        };
        return tinhTrang;
    }

    /**
     * Hai mức, hai màu. Từ 2026-08-12 KHÔNG CÒN KHÓA MỞ nên không còn mức "khóa"
     * — khai báo rồi là dùng được ngay.
     *
     * Vẫn giữ nhánh 'khoa' cho đúng MỘT trường hợp: kho CŨ (bản 1) chưa được
     * chuyển đổi, vẫn còn mã hóa bằng khóa mở nên chưa dùng được.
     */
    function mucCua(maKH) {
        const k = tinhTrang.khach[String(maKH)];
        if (!k || !k.daKhaiBao) return 'chua';
        if (!k.daMoKhoa) return 'khoa';
        return 'xong';
    }

    function toNut(nut, maKH) {
        const muc = mucCua(maKH);
        nut.className = 'hdt-kb-nut ' + muc;
        nut.dataset.hdtMuc = muc;
        nut.textContent = muc === 'chua' ? '🔑' : (muc === 'khoa' ? '🔒' : '🔑');
        nut.title = muc === 'chua'
            ? `Khách ${maKH} CHƯA khai báo tài khoản Tendoo — bấm để khai báo`
            : (muc === 'khoa'
                ? `Khách ${maKH} khai báo từ bản cũ, cần chuyển đổi một lần — bấm để làm`
                : `Khách ${maKH} đã khai báo, sẵn sàng chạy — bấm để xem/sửa`);
    }

    // ─── Nút trên từng dòng ─────────────────────────────────────────────────

    function taoNut(maKH, tenKH) {
        const nut = tailieu.createElement('button');
        nut.type = 'button';
        nut.dataset.hdtKhaiBao = String(maKH);
        nut.addEventListener('click', (su) => {
            su.stopPropagation();
            mo(maKH, tenKH);
        });
        toNut(nut, maKH);
        cacNut.set(String(maKH), nut);
        return nut;
    }

    /** Tô lại mọi nút theo tình trạng mới nhất. Dòng đã bị Sell vẽ lại thì bỏ. */
    function toLaiTatCa() {
        for (const [maKH, nut] of [...cacNut.entries()]) {
            if (!nut.isConnected) { cacNut.delete(maKH); continue; }
            toNut(nut, maKH);
        }
    }

    // ─── Thanh nhắc mở khóa ─────────────────────────────────────────────────

    /**
     * Hiện thanh nhắc khi có khai báo mà kho còn khóa. Không có khai báo nào thì
     * nhắc khai báo. Kho đã mở thì gỡ thanh đi cho đỡ rối mắt.
     */
    function veThanhKhoa(noiDat) {
        const cu = tailieu.getElementById(ID_THANH_KHOA);
        if (cu) cu.remove();
        if (!noiDat) return null;

        const soKhach = Object.keys(tinhTrang.khach).length;
        if (tinhTrang.coKho && tinhTrang.dangMo) return null;   // mở rồi, khỏi nhắc

        const thanh = tailieu.createElement('div');
        thanh.id = ID_THANH_KHOA;
        thanh.className = 'hdt-thanh-khoa';

        const chu = tailieu.createElement('span');
        chu.style.flex = '1';
        chu.textContent = !tinhTrang.coKho
            ? 'Chưa khai báo tài khoản Tendoo nào. Bấm nút 🔑 ở cột Tạo HĐĐT để khai báo cho từng khách.'
            : `Khai báo cũ (${soKhach} khách) còn mã hóa bằng khóa mở. Cần chuyển đổi MỘT LẦN `
              + 'thì từ sau không phải gõ gì nữa.';

        const nut = tailieu.createElement('button');
        nut.type = 'button';
        nut.id = 'hdt-nut-mo-kho';
        nut.textContent = tinhTrang.coKho ? 'Chuyển đổi ngay' : 'Mở bảng khai báo';
        nut.addEventListener('click', () => mo(''));

        thanh.appendChild(chu);
        thanh.appendChild(nut);
        noiDat.insertBefore(thanh, noiDat.firstChild);
        return thanh;
    }

    // ─── Khung khai báo (iframe) ────────────────────────────────────────────

    function mo(maKH, tenKH) {
        dong();
        const lop = tailieu.createElement('div');
        lop.className = 'hdt-kb-lop';
        lop.id = ID_KHUNG;
        lop.addEventListener('click', su => { if (su.target === lop) dong(); });

        const hop = tailieu.createElement('div');
        hop.className = 'hdt-kb-hop';

        const dau = tailieu.createElement('div');
        dau.className = 'hdt-kb-dau';
        const ten = tailieu.createElement('b');
        ten.textContent = maKH
            ? `Tài khoản Tendoo — ${maKH}${tenKH ? ' · ' + tenKH : ''}`
            : 'Tài khoản Tendoo của khách';
        const nutX = tailieu.createElement('button');
        nutX.type = 'button';
        nutX.textContent = '✕';
        nutX.addEventListener('click', () => dong());
        dau.appendChild(ten);
        dau.appendChild(nutX);

        // Địa chỉ trỏ vào chính extension. Mã khách đi qua đường dẫn chỉ để điền
        // sẵn cho đỡ phải gõ — KHÔNG có gì bí mật nằm ở đây.
        const khung = tailieu.createElement('iframe');
        khung.className = 'hdt-kb-khung';
        khung.id = 'hdt-iframe-khai-bao';
        khung.setAttribute('title', 'Khai báo tài khoản Tendoo');
        khung.src = diaChiTrang(TRANG_KHAI_BAO, { maKH: maKH || '', ten: tenKH || '' });

        // ⚠️ CHỮ BỊ ẨN, KHÔNG BỊ XOÁ (chủ dự án yêu cầu 2026-08-15). Vẫn dựng
        // phần tử và vẫn giữ nguyên chữ: đây là chỗ duy nhất nói ra cam kết
        // "trang Sell không đọc được chữ bạn gõ". Xoá đi là mất hẳn. Ẩn thì bỏ
        // đúng một dòng `style.display` là hiện lại.
        const chan = tailieu.createElement('div');
        chan.className = 'hdt-kb-chan';
        chan.id = 'hdt-kb-chan';
        chan.style.display = 'none';
        chan.textContent = 'Ô nhập nằm trong khung riêng của extension — trang bongtom.store không đọc '
            + 'được chữ bạn gõ. Mật khẩu được mã hóa bằng khóa mở và chỉ nằm trên máy này, '
            + 'không gửi lên máy chủ bongtom.store.';

        // LỐI THOÁT. Trang chủ nhà có quyền chặn iframe bằng CSP frame-src, và
        // nếu chặn thật thì khung này trắng trơn — người dùng mất sạch đường
        // khai báo, vì popup đã bỏ hết ô nhập. Khung con báo "đã tải" ngay khi
        // sống; im lặng quá lâu thì mở lối đi khác chứ không để người dùng kẹt.
        khung.dataset.hdtSong = '';
        const dongY = () => { khung.dataset.hdtSong = '1'; };
        const nghePhut = (su) => {
            const d = su && su.data;
            if (d && typeof d === 'object' && d.hdt === 'khai-bao-doi') dongY();
        };
        const cuaSo = tailieu.defaultView;
        if (cuaSo && cuaSo.addEventListener) cuaSo.addEventListener('message', nghePhut);
        const hen = (cuaSo && cuaSo.setTimeout ? cuaSo.setTimeout : setTimeout)(() => {
            if (cuaSo && cuaSo.removeEventListener) cuaSo.removeEventListener('message', nghePhut);
            if (khung.dataset.hdtSong === '1' || !khung.isConnected) return;
            veLoiThoat(chan, maKH, tenKH);
        }, HAN_CHO_KHUNG_MS);
        lop.dataset.hdtHen = String(hen);

        hop.appendChild(dau);
        hop.appendChild(khung);
        hop.appendChild(chan);
        lop.appendChild(hop);
        (tailieu.body || tailieu.documentElement).appendChild(lop);
        return lop;
    }

    /** Khung không sống được -> chỉ đường mở thẳng trang khai báo trong tab riêng. */
    function veLoiThoat(chan, maKH, tenKH) {
        if (chan.querySelector('#hdt-kb-loi-thoat')) return;
        const khoi = tailieu.createElement('div');
        khoi.id = 'hdt-kb-loi-thoat';
        khoi.style.cssText = 'margin-top:8px;color:#b45309;font-weight:600';
        khoi.textContent = 'Khung không hiện được (trang này chặn nhúng). ';
        const a = tailieu.createElement('a');
        a.id = 'hdt-kb-mo-tab';
        a.href = diaChiTrang(TRANG_KHAI_BAO, { maKH: maKH || '', ten: tenKH || '' });
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = 'Mở bảng khai báo trong tab riêng';
        khoi.appendChild(a);
        chan.appendChild(khoi);
    }

    function dong() {
        const cu = tailieu.getElementById(ID_KHUNG);
        if (!cu) return;
        const hen = Number(cu.dataset.hdtHen || 0);
        const cuaSo = tailieu.defaultView;
        if (hen) (cuaSo && cuaSo.clearTimeout ? cuaSo.clearTimeout : clearTimeout)(hen);
        cu.remove();
    }

    /** Đọc lại tình trạng rồi tô lại nút + thanh nhắc. */
    async function lamMoi(noiDatThanh) {
        await docTinhTrang();
        toLaiTatCa();
        if (noiDatThanh) veThanhKhoa(noiDatThanh);
        return tinhTrang;
    }

    /**
     * Nghe iframe báo "vừa lưu / vừa mở kho" để tô lại ngay, khỏi bắt người dùng
     * tải lại trang. Chỉ nhận tin đúng dạng đã hẹn; mọi thứ khác bỏ qua.
     */
    function nghe(noiDatThanh) {
        const cuaSo = tailieu.defaultView;
        if (!cuaSo || !cuaSo.addEventListener) return null;
        const tay = (su) => {
            const d = su && su.data;
            if (!d || typeof d !== 'object' || d.hdt !== 'khai-bao-doi') return;
            lamMoi(noiDatThanh);
        };
        cuaSo.addEventListener('message', tay);
        huyNghe = () => cuaSo.removeEventListener('message', tay);
        return huyNghe;
    }

    function thoi() { if (huyNghe) { huyNghe(); huyNghe = null; } }

    return {
        docTinhTrang, lamMoi, taoNut, toLaiTatCa, veThanhKhoa, mo, dong, nghe, thoi,
        mucCua,
        tinhTrang: () => tinhTrang,
        soNut: () => cacNut.size,
    };
}

/** Dựng địa chỉ trang trong extension. Ngoài Chrome (lúc test) -> trả đường tương đối. */
function taoDiaChiTrang(chromeApi) {
    return function diaChiTrang(ten, thamSo) {
        const goc = (chromeApi && chromeApi.runtime && chromeApi.runtime.getURL)
            ? chromeApi.runtime.getURL(ten) : ten;
        const q = [];
        for (const [k, v] of Object.entries(thamSo || {})) {
            if (v) q.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
        }
        return q.length ? goc + '?' + q.join('&') : goc;
    };
}

const API = { taoOKhaiBao, taoDiaChiTrang, themStyle, ID_KHUNG, ID_THANH_KHOA,
              TRANG_KHAI_BAO, HAN_CHO_KHUNG_MS };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof globalThis !== 'undefined') globalThis.HDT_OKhaiBao = API;

})();
