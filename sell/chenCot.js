'use strict';

// ⚠️ TOÀN BỘ FILE NẰM TRONG MỘT PHẠM VI RIÊNG (hàm bọc ngoài).
// Chrome nạp nhiều file vào CÙNG MỘT phạm vi — hai file cùng khai `const API`
// là file thứ hai nổ ngay khi nạp, và KHÔNG có lỗi nào hiện ra cho người dùng:
// popup chỉ đơn giản trống trơn. Đã dính đúng lỗi này một lần. Bọc lại để không
// bao giờ dính nữa. Xuất ra ngoài qua globalThis.HDT_* ở cuối file.

(function () {

// ============================================================================
//  CHÈN CỘT "Tạo hóa đơn điện tử" vào bảng báo cáo khách hàng của Sell.
//
//  ⚠️ KHÔNG SỬA MỘT DÒNG NÀO trong project Sell. Extension chèn cột lúc trang
//  chạy. Gỡ extension là trang trở lại y nguyên như cũ, không cần deploy lại.
//
//  Hai chỗ dễ hỏng, đã xử lý:
//   1. Sell gọi renderTable() và GHI ĐÈ TOÀN BỘ tbody mỗi lần lọc / sắp xếp /
//      đổi trang -> cột chèn vào bị xóa sạch. Dùng MutationObserver để chèn lại.
//   2. Dòng "Đang tải..." và dòng tổng cộng dùng colspan tính theo số cột cũ.
//      Thêm cột mà không sửa colspan là bảng lệch. Sửa đúng MỘT lần cho mỗi ô
//      (đánh dấu lại), gọi bao nhiêu lần cũng không cộng dồn.
//
//  GIAI ĐOẠN 2: bấm nút chỉ chạy GIẢ LẬP trên lưới hàng mẫu. Chưa mở tab
//  Tendoo, chưa đăng nhập, chưa tạo hóa đơn nào.
// ============================================================================

const DAU_HIEU = 'hdtDaChen';          // dataset.hdtDaChen — dấu chống chèn trùng
const ID_STYLE = 'hdt-style';
const ID_THANH = 'hdt-thanh-noi';
const ID_MODAL = 'hdt-modal';

const tienVN = so => new Intl.NumberFormat('vi-VN').format(so);

/**
 * CHẤM NGĂN NGHÌN cho thứ người dùng vừa gõ vào ô tiền.
 *
 * ⚠️ DẤU CHẤM Ở ĐÂY LÀ NGĂN NGHÌN, KHÔNG PHẢI DẤU THẬP PHÂN. Bộ đọc số
 * (`caiDat.chuanSoTienNgay`) CỐ Ý từ chối "1.5", vì người gõ vậy gần như chắc
 * chắn định nói 1,5 triệu mà máy lại hiểu MƯỜI LĂM ĐỒNG rồi đem đi xuất hóa đơn
 * thuế. Hàm này bóc sạch mọi dấu người dùng gõ rồi tự đặt lại, nên ô ấy không
 * bao giờ còn ở trạng thái "1.5" — nhưng chốt bên `chuanSoTienNgay` VẪN GIỮ, vì
 * cài đặt cũ và các đường lưu khác vẫn đi qua đó.
 *
 * Bỏ mọi ký tự không phải chữ số (kể cả chữ), và bỏ số 0 thừa ở đầu. Rỗng vào
 * thì rỗng ra — KHÔNG trả "0", vì ô trống nghĩa là "không đặt", khác hẳn số 0.
 */
function chamNganNghin(chu) {
    // ⚠️ GHÉP THẲNG TRÊN CHUỖI, KHÔNG QUA `Number()`. Trên 2^53 (khoảng 9 triệu
    // tỷ) `Number()` mất chính xác, và ô sẽ hiện MỘT SỐ KHÁC HẲN số người dùng
    // vừa gõ: "9007199254740993" ra "…992", "99999999999999999999" ra
    // "100.000.000.000.000.000.000". Với ô đi thẳng vào hóa đơn thuế thì đổi
    // thầm một chữ số là chuyện không được phép, dù con số ấy vô lý cỡ nào.
    //
    // Vì bỏ `Number()` nên bước lọc số 0 thừa ở đầu QUAY LẠI LÀM VIỆC THẬT:
    // trước đây `Number('007')` tự bỏ giúp, giờ không còn ai bỏ nữa.
    const so = String(chu == null ? '' : chu).replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    return so ? so.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '';
}

/**
 * Đặt lại con trỏ sau khi chèn dấu chấm.
 *
 * ⚠️ KHÔNG CÓ HÀM NÀY THÌ TÍNH NĂNG THÀNH PHIỀN PHỨC. Mỗi lần chuỗi đổi, trình
 * duyệt đẩy con trỏ về CUỐI ô; sửa một chữ số ở giữa là con trỏ nhảy đi, gõ tiếp
 * ra số hoàn toàn khác. Với ô đi thẳng vào hóa đơn thuế thì đó không phải phiền
 * phức mà là nguy hiểm.
 *
 * Cách đếm: giữ nguyên SỐ CHỮ SỐ đứng trước con trỏ, rồi dò trong chuỗi mới tới
 * đúng chữ số thứ ấy. Dấu chấm thêm hay bớt bao nhiêu cũng không lệch.
 *
 * @returns {number} vị trí con trỏ trong chuỗi MỚI
 */
function viTriConTro(chuCu, viTriCu, chuMoi) {
    const truoc = String(chuCu || '').slice(0, Math.max(0, viTriCu));
    const soChuSo = (truoc.match(/\d/g) || []).length;
    if (soChuSo === 0) return 0;
    let dem = 0;
    for (let i = 0; i < chuMoi.length; i++) {
        if (/\d/.test(chuMoi[i])) {
            dem++;
            if (dem === soChuSo) return i + 1;
        }
    }
    return chuMoi.length;
}

// ---------------------------------------------------------------- giao diện
const CSS = `
.hdt-o { text-align:center; white-space:nowrap; }
.hdt-nut { border:1px solid #2563eb; color:#2563eb; background:#fff; border-radius:6px;
  padding:3px 10px; font-size:12px; cursor:pointer; line-height:1.6; }
.hdt-nut:hover { background:#2563eb; color:#fff; }
.hdt-tieu-de { display:flex; align-items:center; justify-content:center; gap:6px; }
.hdt-thanh { position:fixed; right:20px; bottom:20px; z-index:99998; background:#111827;
  color:#fff; border-radius:10px; padding:10px 14px; display:flex; align-items:center;
  gap:12px; box-shadow:0 8px 24px rgba(0,0,0,.28); font-size:13px; font-family:inherit; }
.hdt-thanh button { background:#2563eb; color:#fff; border:0; border-radius:7px;
  padding:7px 14px; cursor:pointer; font-size:13px; }
.hdt-lop-phu { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:99999;
  display:flex; align-items:center; justify-content:center; padding:16px; }
.hdt-hop { background:#fff; border-radius:12px; width:min(760px,100%); max-height:86vh;
  overflow:auto; font-family:inherit; color:#111827; }
/* ⚠️ CHỈ BẢNG CÀI ĐẶT RỘNG RA, không nới chung lớp .hdt-hop. Mấy hộp thoại kia
   (gỡ lệnh treo, kết quả kiểm thử) chỉ có vài dòng chữ — kéo rộng ra là chữ
   chạy dài cả mét, đọc mệt hơn hẳn.
   Dòng khách ở đây có tới 5 ô nhập nối nhau (giờ · tiền · giờ tiền · số ngày ·
   chữ hạn) nên 760px là tên khách bị bẻ làm ba dòng. */
#hdt-bang-cai-dat .hdt-hop { width:min(1100px,100%); }
.hdt-dau { padding:14px 18px; border-bottom:1px solid #e5e7eb; display:flex;
  align-items:center; justify-content:space-between; }
.hdt-dau h2 { font-size:16px; font-weight:600; margin:0; }
.hdt-than { padding:14px 18px; }
.hdt-chan { padding:12px 18px; border-top:1px solid #e5e7eb; display:flex;
  align-items:center; justify-content:flex-end; gap:8px; }
.hdt-chan button { border-radius:7px; padding:8px 16px; cursor:pointer; font-size:13px; border:1px solid #d1d5db; background:#fff; }
.hdt-chan .hdt-chinh { background:#2563eb; color:#fff; border-color:#2563eb; }
/* Nút bị khóa PHẢI trông như bị khóa — nút xám mà bấm được nhìn giống nút thật
   là mời người dùng bấm nhầm. Ở đây bấm nhầm = phát hành hóa đơn thật. */
.hdt-canh-bao.hdt-do { background:#fef2f2 !important; border-color:#fecaca !important;
  color:#b91c1c !important; font-weight:600; }
.hdt-chan button[disabled] { background:#e5e7eb !important; color:#9ca3af !important;
  border-color:#e5e7eb !important; cursor:not-allowed; }
.hdt-goi-y { flex:1; text-align:left; font-size:11.5px; color:#6b7280; line-height:1.4; }
.hdt-the { border:1px solid #e5e7eb; border-radius:9px; padding:10px 12px; margin-bottom:9px; }
.hdt-the.ok { border-left:4px solid #16a34a; }
.hdt-the.loi { border-left:4px solid #dc2626; background:#fef2f2; }
.hdt-ten { font-weight:600; font-size:14px; }
.hdt-phu { color:#6b7280; font-size:12px; margin-top:2px; }
.hdt-hang { font-size:12px; color:#374151; margin-top:6px; padding-left:2px; }
.hdt-canh-bao { background:#fffbeb; border:1px solid #fcd34d; color:#92400e;
  border-radius:8px; padding:9px 12px; font-size:12px; margin-bottom:12px; }
.hdt-go-treo { margin-top:10px; padding-top:10px; border-top:1px solid #fecaca; }
.hdt-dong-treo { border:1px solid #e5e7eb; border-radius:8px; padding:8px 10px;
  margin-top:8px; background:#fff; }
.hdt-cong-cu-treo { display:flex; gap:8px; margin-top:8px; }
.hdt-cong-cu-treo button { border-radius:7px; padding:5px 12px; font-size:12px;
  cursor:pointer; border:1px solid #d1d5db; background:#fff; }
.hdt-treo-da-ra { border-color:#16a34a !important; color:#15803d; }
.hdt-treo-chua-ra { border-color:#d97706 !important; color:#b45309; }
/* --- bảng cài đặt: độ lệch và hẹn giờ --- */
.hdt-nut-cai { border:0; background:none; cursor:pointer; font-size:14px; line-height:1;
  padding:0 2px; color:#6b7280; }
.hdt-nut-cai:hover { color:#2563eb; }
.hdt-muc { border:1px solid #e5e7eb; border-radius:9px; padding:11px 13px; margin-bottom:11px; }
.hdt-muc > label { display:block; font-weight:600; font-size:13px; margin-bottom:6px; }
.hdt-o-nhap { width:100%; box-sizing:border-box; border:1px solid #d1d5db; border-radius:7px;
  padding:7px 10px; font-size:13px; font-family:inherit; }
.hdt-ghi { font-size:11.5px; color:#6b7280; line-height:1.5; margin-top:6px; }
.hdt-ghi.hdt-do { color:#b91c1c; font-weight:600; }
.hdt-ds-khach { max-height:290px; overflow:auto; border:1px solid #e5e7eb;
  border-radius:7px; padding:6px 8px; }
.hdt-dong-khach { display:flex; align-items:center; gap:8px; font-size:12.5px;
  padding:5px 0; border-bottom:1px dashed #f3f4f6; }
.hdt-dong-khach:last-child { border-bottom:0; }
/* ⚠️ TÊN KHÁCH KHÔNG ĐƯỢC BẺ DÒNG. Bẻ làm ba dòng thì mỗi khách cao gấp ba,
   danh sách chỉ còn nhìn thấy hai người, và mấy ô nhập bên phải lệch hàng nhau
   nên không biết ô nào của ai. Dài quá thì cắt bằng dấu ba chấm — tên đầy đủ
   vẫn còn ở thuộc tính title khi rê chuột. */
.hdt-dong-khach .ten { flex:1; min-width:230px; cursor:pointer;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.hdt-gio-rieng { width:96px; flex-shrink:0; border:1px solid #d1d5db; border-radius:6px;
  padding:3px 6px; font-size:11.5px; font-family:inherit; text-align:center; }
.hdt-gio-rieng.co { border-color:#2563eb; color:#1d4ed8; font-weight:600; }
.hdt-tien-ngay { width:130px; flex-shrink:0; border:1px solid #d1d5db; border-radius:6px;
  padding:4px 8px; font-size:13px; text-align:right; }
.hdt-tien-ngay.co { border-color:#b45309; color:#b45309; font-weight:600; }
/* Giờ của lượt TỰ CHỌN — cùng màu hổ phách với ô tiền để mắt nhìn ra ngay hai
   ô này là MỘT cặp, tách khỏi cặp (tích hệ thống + giờ hệ thống) màu xanh. */
.hdt-gio-tien { width:96px; flex-shrink:0; border:1px solid #d1d5db; border-radius:6px;
  padding:3px 6px; font-size:11.5px; font-family:inherit; text-align:center; }
.hdt-gio-tien.co { border-color:#b45309; color:#b45309; font-weight:600; }
/* Gõ tiền mà quên gõ giờ thì phần tự chọn KHÔNG chạy — phải đỏ lên tại chỗ,
   đừng để người dùng bấm Lưu rồi tưởng đã xong. */
.hdt-gio-tien.thieu { border-color:#b91c1c; background:#fef2f2; }
.hdt-so-ngay { width:74px; flex-shrink:0; border:1px solid #d1d5db; border-radius:6px;
  padding:3px 6px; font-size:11.5px; font-family:inherit; text-align:center; }
.hdt-so-ngay.co { border-color:#b45309; color:#b45309; font-weight:600; }
/* Chữ "còn N ngày" / "hết hạn". Hết hạn phải ĐỎ và ĐẬM: nó nghĩa là khách
   này đã ngừng ra hóa đơn, không phải một dòng ghi chú cho vui. */
.hdt-han { font-size:11px; color:#6b7280; min-width:76px; flex-shrink:0; }
.hdt-han.het { color:#b91c1c; font-weight:600; }
.hdt-vach-doc { width:1px; align-self:stretch; background:#e5e7eb; margin:0 2px;
  flex-shrink:0; }
.hdt-muc-ss { display:flex; justify-content:space-between; gap:10px; font-size:12px;
  padding:3px 0; border-bottom:1px dashed #f3f4f6; }
.hdt-muc-ss:last-child { border-bottom:0; }
.hdt-muc-ss .ten { font-weight:600; flex-shrink:0; }
.hdt-muc-ss .chu { text-align:right; color:#6b7280; }
.hdt-muc-ss.dat .chu { color:#15803d; }
.hdt-muc-ss.chan .chu { color:#b91c1c; font-weight:600; }
.hdt-ls { border:1px solid #e5e7eb; border-radius:8px; padding:8px 10px; margin-top:8px; }
.hdt-ls-dau { font-size:12.5px; font-weight:600; }
.hdt-ls-kh { font-size:12px; padding:2px 0 2px 10px; color:#374151; }
.hdt-ls-kh.ok { color:#15803d; }
.hdt-ls-kh.loi { color:#b91c1c; }
.hdt-ls-kh.treo { color:#b45309; font-weight:600; }
.hdt-ls-trang { display:flex; align-items:center; gap:4px; flex-wrap:wrap; margin-top:10px;
  padding-top:8px; border-top:1px solid #e5e7eb; }
.hdt-ls-nut { border:1px solid #d1d5db; background:#fff; border-radius:6px; padding:3px 9px;
  font-size:11.5px; cursor:pointer; font-family:inherit; color:#374151; }
.hdt-ls-nut:hover:not(:disabled) { background:#f3f4f6; }
.hdt-ls-nut.dang { background:#2563eb; border-color:#2563eb; color:#fff; font-weight:600; }
/* Nút hết đường phải TRÔNG như hết đường — bấm được mà không xảy ra gì là để
   người dùng ngồi đoán mình bấm hụt hay máy hỏng. */
.hdt-ls-nut:disabled { opacity:.4; cursor:not-allowed; }
.hdt-ls-dem { margin-left:auto; font-size:11px; color:#6b7280; }
`;

function themStyle(tailieu) {
    if (tailieu.getElementById(ID_STYLE)) return;
    const the = tailieu.createElement('style');
    the.id = ID_STYLE;
    the.textContent = CSS;
    (tailieu.head || tailieu.documentElement).appendChild(the);
}

// ------------------------------------------------- ô khai báo tài khoản
// Giữ MỘT bộ cho MỖI TRANG. Sell vẽ lại bảng liên tục, mỗi lần vẽ lại mà dựng
// bộ mới là mất tình trạng vừa đọc được và nghe trùng nhiều lần.
//
// Khóa theo tài liệu chứ không dùng một biến chung: một biến chung thì bộ dựng
// cho trang này sẽ tạo phần tử bằng document của trang kia. Thật tế chỉ có một
// trang nên không lộ ra, nhưng sai vẫn là sai và test sẽ dính ngay.
const boKhaiBaoTheoTrang = new WeakMap();

function layOKhaiBao(tailieu) {
    const OKB = globalThis.HDT_OKhaiBao;
    if (!OKB) return null;                    // chưa nạp module -> chạy như cũ
    if (boKhaiBaoTheoTrang.has(tailieu)) return boKhaiBaoTheoTrang.get(tailieu);
    const G = tailieu.defaultView || globalThis;
    const chromeApi = G.chrome || null;
    OKB.themStyle(tailieu);
    const bo = OKB.taoOKhaiBao({
        tailieu,
        diaChiTrang: OKB.taoDiaChiTrang(chromeApi),
        guiNen: async (tin) => {
            if (!chromeApi || !chromeApi.runtime || !chromeApi.runtime.sendMessage) return null;
            try { return await chromeApi.runtime.sendMessage(tin); } catch (e) { return null; }
        },
    });
    boKhaiBaoTheoTrang.set(tailieu, bo);
    return bo;
}

// ---------------------------------------------------------------- chèn cột
function themTieuDe(bang) {
    const dongTieuDe = bang.querySelector('thead tr');
    if (!dongTieuDe || dongTieuDe.dataset[DAU_HIEU]) return false;

    const th = bang.ownerDocument.createElement('th');
    th.className = 'px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase';
    th.dataset.hdtCot = '1';

    const boc = bang.ownerDocument.createElement('div');
    boc.className = 'hdt-tieu-de';

    const tick = bang.ownerDocument.createElement('input');
    tick.type = 'checkbox';
    tick.id = 'hdt-tick-tat-ca';
    tick.title = 'Chọn tất cả khách trên trang này';
    tick.addEventListener('change', () => {
        bang.querySelectorAll('input.hdt-tick').forEach(o => { o.checked = tick.checked; });
        capNhatThanh(bang);
    });

    const chu = bang.ownerDocument.createElement('span');
    chu.textContent = 'Tạo HĐĐT';

    // Cửa vào bảng cài đặt. Đặt ở tiêu đề vì đây là chỗ LUÔN CÓ MẶT — thanh nổi
    // dưới góc chỉ hiện khi đã tích khách, mà độ lệch thì phải cài được bất cứ lúc nào.
    const nutCai = bang.ownerDocument.createElement('button');
    nutCai.type = 'button';
    nutCai.id = 'hdt-nut-cai-dat';
    nutCai.className = 'hdt-nut-cai';
    nutCai.title = 'Cài đặt độ lệch và hẹn giờ tự chạy';
    nutCai.textContent = '⚙';
    nutCai.addEventListener('click', () => moBangCaiDat(bang));

    boc.appendChild(tick);
    boc.appendChild(chu);
    boc.appendChild(nutCai);
    th.appendChild(boc);
    dongTieuDe.appendChild(th);
    dongTieuDe.dataset[DAU_HIEU] = '1';
    return true;
}

/**
 * Cộng 1 vào colspan của ô gộp trong THÂN bảng — tức dòng "Đang tải..." và
 * "Không có dữ liệu", vốn trải hết chiều ngang.
 *
 * CHỈ trong tbody. Ô "TỔNG CỘNG" ở tfoot cũng có colspan nhưng KHÔNG được cộng:
 * chân bảng đã được thêm hẳn một ô trống ở cuối (themOChanBang), cộng thêm nữa
 * là thừa một cột và bảng lệch sang phải.
 *
 * Mỗi ô chỉ được cộng ĐÚNG MỘT LẦN, nhờ dấu data-hdt-colspan.
 */
function suaColspan(bang) {
    bang.querySelectorAll('tbody td[colspan]').forEach(o => {
        if (o.dataset.hdtColspan) return;
        const cu = Number(o.getAttribute('colspan')) || 1;
        o.setAttribute('colspan', String(cu + 1));
        o.dataset.hdtColspan = '1';
    });
}

/** Thêm một ô trống cuối dòng tổng cộng để cột không bị lệch. */
function themOChanBang(bang) {
    const dong = bang.querySelector('tfoot tr');
    if (!dong || dong.dataset[DAU_HIEU]) return;
    const o = bang.ownerDocument.createElement('td');
    o.className = 'px-4 py-3';
    o.dataset.hdtCot = '1';
    dong.appendChild(o);
    dong.dataset[DAU_HIEU] = '1';
}

/**
 * Thêm ô vào MỘT dòng. `khach` = null nghĩa là dòng đó không xuất hóa đơn được
 * (khách lẻ không có id, hoặc doanh thu bằng 0) — vẫn phải thêm ô trống, nếu
 * không dòng đó thiếu một cột và cả bảng lệch.
 */
function themOChoDong(bang, khach, dongTruyenVao) {
    const dong = khach ? khach.dong : dongTruyenVao;
    if (!dong || dong.dataset[DAU_HIEU]) return;

    const tailieu = bang.ownerDocument;
    const o = tailieu.createElement('td');
    o.className = 'px-4 py-3 hdt-o';
    o.dataset.hdtCot = '1';

    if (!khach) {
        o.textContent = '—';
        o.style.color = '#9ca3af';
        dong.appendChild(o);
        dong.dataset[DAU_HIEU] = '1';
        return;
    }

    const tick = tailieu.createElement('input');
    tick.type = 'checkbox';
    tick.className = 'hdt-tick';
    tick.dataset.ma = khach.maKH;
    tick.addEventListener('change', () => capNhatThanh(bang));

    const nut = tailieu.createElement('button');
    nut.type = 'button';
    nut.className = 'hdt-nut';
    nut.textContent = 'Tạo HĐ';
    nut.style.marginLeft = '8px';
    nut.addEventListener('click', () => moModal(bang, [khach]));

    o.appendChild(tick);
    o.appendChild(nut);

    // Nút khai báo tài khoản Tendoo của ĐÚNG khách này — khỏi phải mở popup rồi
    // tự nhớ mã khách mà gõ lại.
    const okb = layOKhaiBao(tailieu);
    if (okb) o.appendChild(okb.taoNut(khach.maKH, khach.tenKH));

    dong.appendChild(o);
    dong.dataset[DAU_HIEU] = '1';
}

/** Chèn/chèn lại toàn bộ. Gọi bao nhiêu lần cũng không sinh cột trùng. */
function chenVao(bang) {
    if (!bang) return { tieuDe: false, soDong: 0 };
    themStyle(bang.ownerDocument);
    const tieuDe = themTieuDe(bang);
    themOChanBang(bang);
    suaColspan(bang);

    // Duyệt MỌI dòng trong thân bảng, không chỉ những dòng xuất được hóa đơn —
    // dòng nào cũng phải có đủ số cột.
    const dsKhach = globalThis.HDT_DocBang.docCacDong(bang);
    const theoDong = new Map(dsKhach.map(k => [k.dong, k]));

    [...bang.querySelectorAll('tbody tr')].forEach(dong => {
        if (dong.dataset[DAU_HIEU]) return;
        // Dòng gộp ("Đang tải...", "Không có dữ liệu") đã xử lý bằng colspan.
        if (dong.querySelector('td[colspan]')) { dong.dataset[DAU_HIEU] = '1'; return; }
        themOChoDong(bang, theoDong.get(dong) || null, dong);
    });

    capNhatThanh(bang);

    // Đọc tình trạng kho rồi tô lại nút + dựng thanh nhắc mở khóa. Chạy nền,
    // KHÔNG chặn việc chèn cột: không có tiến trình nền thì bảng vẫn phải xong.
    const okb = layOKhaiBao(bang.ownerDocument);
    if (okb) {
        if (!okb.daNghe) { okb.nghe(noiDatThanhKhoa(bang)); okb.daNghe = true; }
        okb.lamMoi(noiDatThanhKhoa(bang));
    }
    return { tieuDe, soDong: dsKhach.length };
}

/** Chỗ đặt thanh nhắc mở khóa: ngay trên bảng, trong cùng cái thẻ của Sell. */
function noiDatThanhKhoa(bang) {
    return bang.parentElement || bang.ownerDocument.body;
}

// ---------------------------------------------------------------- thanh nổi
function dsDaTick(bang) {
    const daTick = new Set(
        [...bang.querySelectorAll('input.hdt-tick')].filter(o => o.checked).map(o => o.dataset.ma)
    );
    return globalThis.HDT_DocBang.docCacDong(bang).filter(k => daTick.has(k.maKH));
}

function capNhatThanh(bang) {
    const tailieu = bang.ownerDocument;
    const chon = dsDaTick(bang);
    let thanh = tailieu.getElementById(ID_THANH);

    if (chon.length === 0) { if (thanh) thanh.remove(); return; }

    if (!thanh) {
        thanh = tailieu.createElement('div');
        thanh.id = ID_THANH;
        thanh.className = 'hdt-thanh';
        const chu = tailieu.createElement('span');
        chu.id = 'hdt-thanh-chu';
        const nut = tailieu.createElement('button');
        nut.type = 'button';
        nut.textContent = 'Tạo hóa đơn';
        nut.addEventListener('click', () => moModal(bang, dsDaTick(bang)));
        thanh.appendChild(chu);
        thanh.appendChild(nut);
        (tailieu.body || tailieu.documentElement).appendChild(thanh);
    }

    const tong = chon.reduce((t, k) => t + k.doanhThu, 0);
    thanh.querySelector('#hdt-thanh-chu').textContent =
        `Đã chọn ${chon.length} khách · ${tienVN(tong)}đ`;
}

// ---------------------------------------------------------------- modal
function moModal(bang, dsKhach) {
    const tailieu = bang.ownerDocument;
    dongModal(tailieu);
    if (!dsKhach || dsKhach.length === 0) return null;

    const phu = tailieu.createElement('div');
    phu.className = 'hdt-lop-phu';
    phu.id = ID_MODAL;
    phu.addEventListener('click', su => { if (su.target === phu) dongModal(tailieu); });

    const hop = tailieu.createElement('div');
    hop.className = 'hdt-hop';

    // đầu
    const dau = tailieu.createElement('div');
    dau.className = 'hdt-dau';
    const h2 = tailieu.createElement('h2');
    h2.textContent = `Tạo hóa đơn điện tử — ${dsKhach.length} khách`;
    const nutX = tailieu.createElement('button');
    nutX.textContent = '✕';
    nutX.style.cssText = 'border:0;background:none;font-size:18px;cursor:pointer;color:#6b7280';
    nutX.addEventListener('click', () => dongModal(tailieu));
    dau.appendChild(h2); dau.appendChild(nutX);

    // thân
    const than = tailieu.createElement('div');
    than.className = 'hdt-than';

    const canhBao = tailieu.createElement('div');
    canhBao.className = 'hdt-canh-bao';
    canhBao.id = 'hdt-canh-bao';
    canhBao.textContent = 'Bấm Xác nhận để máy làm việc trên Tendoo. Chưa mở tab Tendoo thì '
        + 'máy tự mở, xong tự đóng. Đang kiểm tra công tắc tự bấm Thanh toán…';
    than.appendChild(canhBao);
    // Hỏi trạng thái công tắc rồi nói rõ cho người dùng TRƯỚC khi họ bấm.
    hienTrangThaiCongTac(tailieu, canhBao);

    // ⚠️ NÓI RÕ SỐ LIỆU LẤY TỪ KHOẢNG NÀO. Chạy tay thì máy KHÔNG tự đổi bộ lọc
    // — bạn đang ngồi đây và tự chọn. Nhưng trang mặc định là "Tháng này", nên
    // rất dễ tưởng con số là của hôm nay. Đọc thẳng dòng máy chủ đã điền.
    const EHN = globalThis.HDT_EpHomNay;
    const khoang = EHN ? EHN.docKhoangDangHien(EHN.timBoLoc(tailieu)) : null;
    if (khoang) {
        const dNgay = tailieu.createElement('div');
        dNgay.className = 'hdt-canh-bao';
        dNgay.id = 'hdt-khoang-ngay';
        dNgay.textContent = khoang.tu === khoang.den
            ? `Số liệu đang lấy của NGÀY ${khoang.tu}.`
            : `⚠ Số liệu đang lấy từ ${khoang.tu} đến ${khoang.den} — KHÔNG phải một ngày. `
              + 'Muốn hóa đơn theo riêng một ngày thì đổi bộ lọc rồi bấm "Xem báo cáo" trước.';
        than.appendChild(dNgay);
    }

    dsKhach.forEach((khach) => {
        const the = tailieu.createElement('div');
        the.className = 'hdt-the';
        the.setAttribute('data-ma-kh', khach.maKH);

        const ten = tailieu.createElement('div');
        ten.className = 'hdt-ten';
        ten.textContent = `${khach.maKH} — ${khach.tenKH}`;
        the.appendChild(ten);

        const phuChu = tailieu.createElement('div');
        phuChu.className = 'hdt-phu';
        phuChu.textContent = `Doanh thu cần khớp: ${tienVN(khach.doanhThu)}đ`;
        the.appendChild(phuChu);

        than.appendChild(the);
    });

    // chân
    const chan = tailieu.createElement('div');
    chan.className = 'hdt-chan';

    const goiY = tailieu.createElement('div');
    goiY.className = 'hdt-goi-y';
    goiY.id = 'hdt-goi-y';
    goiY.textContent = 'Máy tự mở tab Tendoo, tự đăng nhập và tự đổi tài khoản theo từng khách — '
        + 'với điều kiện khách đó ĐÃ được khai báo tài khoản trong popup và bạn ĐÃ nhập khóa mở. '
        + 'Khách chưa khai báo sẽ bị bỏ qua kèm lý do.';
    chan.appendChild(goiY);

    const dong = tailieu.createElement('button');
    dong.textContent = 'Đóng';
    dong.addEventListener('click', () => dongModal(tailieu));

    const xacNhan = tailieu.createElement('button');
    xacNhan.className = 'hdt-chinh';
    xacNhan.id = 'hdt-xac-nhan';
    xacNhan.textContent = 'Xác nhận — gửi sang Tendoo';
    xacNhan.addEventListener('click', () => guiSangTendoo(tailieu, dsKhach, xacNhan, than));
    chan.appendChild(dong); chan.appendChild(xacNhan);

    hop.appendChild(dau); hop.appendChild(than); hop.appendChild(chan);
    phu.appendChild(hop);
    (tailieu.body || tailieu.documentElement).appendChild(phu);
    return phu;
}

/**
 * Hỏi tiến trình nền xem công tắc tự bấm Thanh toán đang bật hay tắt, rồi ghi
 * thẳng vào khung cảnh báo. Người dùng phải biết trước khi bấm là cú bấm này
 * dừng ở giỏ hàng hay ra thẳng hóa đơn thật.
 */
async function hienTrangThaiCongTac(tailieu, khung) {
    const G = tailieu.defaultView || globalThis;
    const runtime = G.chrome && G.chrome.runtime;
    if (!runtime || !runtime.sendMessage) return;
    let c = null;
    try { c = await runtime.sendMessage({ loai: 'hdt-hoi-cai-dat' }); } catch (e) { c = null; }
    if (!khung.isConnected) return;

    const bat = !!(c && c.tuBam && c.daHieu);
    khung.classList.toggle('hdt-do', bat);
    khung.id = 'hdt-canh-bao';
    khung.textContent = bat
        ? '⚠ TỰ BẤM THANH TOÁN ĐANG BẬT. Bấm Xác nhận là máy sẽ phát hành HÓA ĐƠN THẬT '
          + 'lên cơ quan thuế cho từng khách đã chọn. Không có bước dừng nào nữa.'
        : 'Máy sẽ bỏ hàng vào giỏ rồi DỪNG — bạn tự bấm Thanh toán. Muốn máy tự bấm thì '
          + 'bật công tắc trong popup extension. Chưa mở tab Tendoo thì máy tự mở, xong tự đóng.';

    // Trạng thái công tắc thuế — hiện SẮN, trước khi bạn bấm. Không hiện thì
    // gặp bảng "Chưa thiết lập quản lý thuế" mới biết là mình thiếu một bước.
    if (bat) {
        const d = tailieu.createElement('div');
        d.id = 'hdt-canh-bao-thue';
        d.style.cssText = 'margin-top:6px;font-weight:400';
        d.textContent = (c && c.boQuaThue)
            ? '⚠ Công tắc "Bỏ qua cảnh báo thuế" ĐANG BẬT: tài khoản nào chưa thiết lập '
              + 'quản lý thuế thì máy vẫn phát hành — Tờ khai thuế và Sổ kế toán sẽ không chính xác.'
            : 'Công tắc "Bỏ qua cảnh báo thuế" đang TẮT: khách nào có tài khoản chưa thiết '
              + 'lập quản lý thuế sẽ bị bỏ qua, không ra hóa đơn.';
        khung.appendChild(d);
    }
}

/** Gửi danh sách khách sang tiến trình nền, rồi vẽ kết quả trả về. */
async function guiSangTendoo(tailieu, dsKhach, nut, than) {
    const G = tailieu.defaultView || globalThis;
    const runtime = G.chrome && G.chrome.runtime;
    if (!runtime || !runtime.sendMessage) {
        veThongBao(tailieu, than, 'Không gọi được extension — hãy tải lại trang.', false);
        return;
    }

    nut.disabled = true;
    nut.textContent = 'Đang gửi…';
    veThongBao(tailieu, than,
        'Đang làm việc trên Tendoo — đừng đóng tab mà máy vừa mở.', null);

    let tra;
    try {
        // Gửi kèm NGÀY SỐ LIỆU của bảng đang xem, để trang Kế toán tổng hợp bên
        // Sell ghi đúng dòng ngày. Bảng đang ở khoảng nhiều ngày thì để trống —
        // thà không có ngày còn hơn ghi bừa vào một ngày không đúng.
        const EHN = globalThis.HDT_EpHomNay;
        const khoang = EHN ? EHN.docKhoangDangHien(EHN.timBoLoc(tailieu)) : null;
        tra = await runtime.sendMessage({
            loai: 'hdt-tao-hoa-don',
            ngaySoLieu: (khoang && khoang.tu === khoang.den) ? khoang.tu : null,
            danhSach: dsKhach.map(k => ({ maKH: k.maKH, tenKH: k.tenKH, soTien: k.doanhThu })),
        });
    } catch (e) {
        tra = { dung: true, thongBao: 'Không liên lạc được với extension: ' + e.message };
    }

    nut.disabled = false;
    nut.textContent = 'Xác nhận — gửi sang Tendoo';
    veKetQuaThat(tailieu, than, tra);
}

function veThongBao(tailieu, than, chu, dat) {
    let o = tailieu.getElementById('hdt-ket-qua-that');
    if (!o) {
        o = tailieu.createElement('div');
        o.id = 'hdt-ket-qua-that';
        than.insertBefore(o, than.firstChild);
    }
    o.className = 'hdt-the ' + (dat === null ? '' : (dat ? 'ok' : 'loi'));
    o.textContent = chu;
    return o;
}

function veKetQuaThat(tailieu, than, tra) {
    if (!tra) return veThongBao(tailieu, than, 'Không nhận được trả lời từ extension.', false);

    const tatCaXong = tra.xong || [];
    const loi = tra.loi || [];
    // ⚠️ "ok" KHÔNG có nghĩa là "đã ra hóa đơn". Máy trả ok cả khi chỉ mới bỏ
    // hàng vào giỏ (công tắc tự bấm đang tắt). Gộp hai thứ đó vào một con số là
    // nói dối người dùng — đã từng báo "Xong 2 khách" khi chỉ có 1 hóa đơn.
    const daRa = tatCaXong.filter(x => x.ketQua && x.ketQua.daBamThanhToan);
    const moiVaoGio = tatCaXong.filter(x => !(x.ketQua && x.ketQua.daBamThanhToan));

    // ⚠️ LOẠT BỊ DỪNG VẪN PHẢI KỂ ĐỦ ĐÃ LÀM ĐƯỢC GÌ.
    // Trước đây nhánh này chỉ hiện mỗi câu lỗi và VỨT BỎ danh sách khách đã
    // xong. Với công tắc tự bấm đang bật, nghĩa là hóa đơn THẬT đã ra mà màn
    // hình không hề nói — người dùng chạy lại là ra hóa đơn trùng.
    const phan = [];
    if (daRa.length) phan.push(`đã phát hành ${daRa.length} hóa đơn`);
    if (moiVaoGio.length) phan.push(`${moiVaoGio.length} khách mới vào giỏ`);
    if (loi.length) phan.push(`${loi.length} khách lỗi`);

    const dau = tra.dung
        ? '✕ ' + (tra.thongBao || 'Đã dừng: ' + tra.ly_do)
        : (phan.length ? phan.join(', ').replace(/^./, c => c.toUpperCase()) + '.'
                       : 'Không làm được khách nào.');
    // Chỉ tô xanh khi THẬT SỰ có hóa đơn ra và không sót gì.
    const dat = !tra.dung && daRa.length > 0 && moiVaoGio.length === 0 && loi.length === 0;
    const o = veThongBao(tailieu, than, dau, tra.dung ? false : dat);

    if (daRa.length) {
        const d = tailieu.createElement('div');
        d.className = 'hdt-hang';
        d.style.fontWeight = '600';
        d.textContent = `ĐÃ PHÁT HÀNH ${daRa.length} hóa đơn THẬT — ĐỪNG chạy lại những khách này:`;
        o.appendChild(d);
    }
    for (const x of daRa) {
        const d = tailieu.createElement('div');
        d.className = 'hdt-hang';
        const t = x.ketQua && x.ketQua.tong;
        d.textContent = `• ✔ ${x.maKH}${x.tenKH ? ' — ' + x.tenKH : ''}`
            + (t ? ` · ${tienVN(t)}đ` : '');
        o.appendChild(d);
    }

    // Hóa đơn ra trong lúc tài khoản CHƯA thiết lập quản lý thuế. Người dùng cần
    // đúng danh sách này khi làm sổ sách — giấu đi là để họ tự phát hiện sau.
    const boThue = daRa.filter(x => x.ketQua && x.ketQua.daBoQuaThue);
    if (boThue.length) {
        const d = tailieu.createElement('div');
        d.className = 'hdt-hang';
        d.style.cssText = 'font-weight:600;color:#b91c1c';
        d.textContent = `⚠ ${boThue.length} trong số đó phát hành khi CHƯA thiết lập quản lý `
            + 'thuế — Tờ khai thuế và Sổ kế toán sẽ không chính xác:';
        o.appendChild(d);
        for (const x of boThue) {
            const e = tailieu.createElement('div');
            e.className = 'hdt-hang';
            e.style.color = '#b91c1c';
            e.textContent = `   · ${x.maKH}${x.tenKH ? ' — ' + x.tenKH : ''}`;
            o.appendChild(e);
        }
    }
    if (moiVaoGio.length) {
        const d = tailieu.createElement('div');
        d.className = 'hdt-hang';
        d.style.fontWeight = '600';
        d.textContent = `${moiVaoGio.length} khách MỚI BỎ VÀO GIỎ, CHƯA phát hành hóa đơn:`;
        o.appendChild(d);
    }
    for (const x of moiVaoGio) {
        const d = tailieu.createElement('div');
        d.className = 'hdt-hang';
        const t = x.ketQua && x.ketQua.tong;
        const vi = x.ketQua && x.ketQua.chuThich;
        d.textContent = `• ◻ ${x.maKH}${x.tenKH ? ' — ' + x.tenKH : ''}`
            + (t ? ` · ${tienVN(t)}đ` : '') + (vi ? ` · ${vi}` : '');
        o.appendChild(d);
    }
    for (const l of loi) {
        const d = tailieu.createElement('div');
        d.className = 'hdt-hang';
        d.textContent = `• ${l.maKH}: ${l.thongBao || l.maLoi}`;
        o.appendChild(d);
    }
    // Lệnh treo là ngõ cụt: chạy lại bao nhiêu lần cũng chỉ ra đúng câu này.
    // Phải cho người dùng đường gỡ, ngay tại chỗ.
    if (tra.dung && tra.ly_do === 'CO_LENH_TREO') veGoLenhTreo(tailieu, than, o);
    return o;
}

/**
 * MÀN GỠ LỆNH TREO.
 *
 * Lệnh treo nghĩa là máy đã bắt đầu làm cho khách đó rồi đứt giữa chừng — mất
 * điện, đóng tab, Chrome giết tiến trình nền, mạng rớt. Máy KHÔNG BIẾT hóa đơn
 * đã phát hành hay chưa, và tuyệt đối không được đoán:
 *   - đoán "chưa" mà thật ra rồi  -> chạy lại thành HAI hóa đơn cho một khoản
 *   - đoán "rồi" mà thật ra chưa   -> khách thiếu hóa đơn mà không ai biết
 * Nên chỉ người dùng, sau khi tự mở Tendoo nhìn tận mắt, mới được kết luận.
 */
async function veGoLenhTreo(tailieu, than, hop) {
    const G = tailieu.defaultView || globalThis;
    const runtime = G.chrome && G.chrome.runtime;
    if (!runtime || !runtime.sendMessage) return;

    let tra = null;
    try { tra = await runtime.sendMessage({ loai: 'hdt-lenh-treo' }); } catch (e) { tra = null; }
    const ds = (tra && tra.treo) || [];
    if (!ds.length || !hop.isConnected) return;

    const khoi = tailieu.createElement('div');
    khoi.id = 'hdt-go-treo';
    khoi.className = 'hdt-go-treo';

    const dan = tailieu.createElement('div');
    dan.className = 'hdt-hang';
    dan.textContent = 'Hãy mở Tendoo, vào phần hóa đơn của khách bên dưới và nhìn tận '
        + 'mắt xem hóa đơn đã ra chưa, rồi bấm đúng nút. Máy không tự đoán được, '
        + 'đoán sai là ra hóa đơn trùng hoặc thiếu hóa đơn.';
    khoi.appendChild(dan);

    for (const l of ds) {
        const d = tailieu.createElement('div');
        d.className = 'hdt-dong-treo';
        d.setAttribute('data-id-treo', l.id);

        const ten = tailieu.createElement('div');
        ten.className = 'hdt-ten';
        ten.textContent = `${l.maKH}${l.tenKH ? ' — ' + l.tenKH : ''} · ${tienVN(l.soTien || 0)}đ`;
        d.appendChild(ten);

        if (l.batDauLuc) {
            const luc = tailieu.createElement('div');
            luc.className = 'hdt-phu';
            luc.textContent = 'Bắt đầu chạy lúc ' + new Date(l.batDauLuc).toLocaleString('vi-VN');
            d.appendChild(luc);
        }

        const hang = tailieu.createElement('div');
        hang.className = 'hdt-cong-cu-treo';

        const daRa = tailieu.createElement('button');
        daRa.type = 'button';
        daRa.className = 'hdt-treo-da-ra';
        daRa.textContent = 'Hóa đơn ĐÃ ra rồi';
        daRa.addEventListener('click', () => ketLuanTreo(tailieu, than, l.id, true));

        const chuaRa = tailieu.createElement('button');
        chuaRa.type = 'button';
        chuaRa.className = 'hdt-treo-chua-ra';
        chuaRa.textContent = 'CHƯA ra — cho chạy lại';
        chuaRa.addEventListener('click', () => ketLuanTreo(tailieu, than, l.id, false));

        hang.appendChild(daRa);
        hang.appendChild(chuaRa);
        d.appendChild(hang);
        khoi.appendChild(d);
    }
    hop.appendChild(khoi);
    return khoi;
}

async function ketLuanTreo(tailieu, than, id, daPhatHanh) {
    const G = tailieu.defaultView || globalThis;
    const runtime = G.chrome && G.chrome.runtime;
    if (!runtime || !runtime.sendMessage) return;

    let tra = null;
    try {
        tra = await runtime.sendMessage({ loai: 'hdt-xu-ly-treo', id, daPhatHanh });
    } catch (e) {
        tra = { ok: false, thongBao: e.message };
    }
    if (!tra || !tra.ok) {
        veThongBao(tailieu, than, '✕ Không gỡ được: ' + ((tra && tra.thongBao) || 'lỗi không rõ'), false);
        return;
    }

    const conLai = (tra.conLai || []).length;
    veThongBao(tailieu, than, conLai
        ? `Đã ghi nhận. Còn ${conLai} lệnh treo nữa phải xử lý.`
        : 'Đã ghi nhận xong. Giờ bấm "Xác nhận — gửi sang Tendoo" để chạy tiếp.',
        conLai === 0);
    // Còn lệnh khác thì vẽ lại danh sách cho gọn, hết thì thôi.
    const o = tailieu.getElementById('hdt-ket-qua-that');
    if (conLai && o) await veGoLenhTreo(tailieu, than, o);
}

function dongModal(tailieu) {
    const cu = tailieu.getElementById(ID_MODAL);
    if (cu) cu.remove();
}

// ---------------------------------------------------------------- theo dõi
/**
 * Sell ghi đè tbody mỗi lần lọc / sắp xếp / đổi trang -> phải chèn lại.
 */
function theoDoi(bang) {
    const than = bang.querySelector('tbody');
    if (!than) return null;
    const canh = new (bang.ownerDocument.defaultView.MutationObserver)(() => chenVao(bang));
    canh.observe(than, { childList: true });
    return canh;
}

// ---------------------------------------------------------------- cài đặt
const ID_CAI_DAT = 'hdt-bang-cai-dat';

const goiNen = async (tailieu, tin) => {
    const G = tailieu.defaultView || globalThis;
    const runtime = G.chrome && G.chrome.runtime;
    if (!runtime || !runtime.sendMessage) return null;
    try { return await runtime.sendMessage(tin); } catch (e) { return null; }
};

const gioVN = (ms) => {
    if (!ms) return '';
    const d = new Date(ms);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
        + ' ngày ' + d.getDate() + '/' + (d.getMonth() + 1);
};

/** Vẽ bảng "tới giờ có chạy được không". Hỏi nền rồi vẽ, tự cập nhật sau mỗi lần lưu. */
async function veTinhTrangSanSang(tailieu, o) {
    const tt = await goiNen(tailieu, { loai: 'hdt-tinh-trang-san-sang' });
    if (!o.isConnected) return;
    o.textContent = '';
    if (!tt || !tt.ok) {
        o.textContent = 'Không hỏi được tiến trình nền. Hãy tải lại trang (F5).';
        return;
    }
    for (const m of tt.muc || []) {
        const d = tailieu.createElement('div');
        d.className = 'hdt-muc-ss' + (m.dat ? ' dat' : (m.chan ? ' chan' : ''));
        const a = tailieu.createElement('span');
        a.className = 'ten';
        a.textContent = (m.dat ? '✓ ' : (m.chan ? '✗ ' : '• ')) + m.ten;
        const b = tailieu.createElement('span');
        b.className = 'chu';
        b.textContent = m.chu;
        d.appendChild(a); d.appendChild(b);
        o.appendChild(d);
    }
    const ket = tailieu.createElement('div');
    ket.className = 'hdt-ghi' + (tt.sanSang ? '' : ' hdt-do');
    ket.id = 'hdt-san-sang-ket';
    ket.textContent = tt.sanSang
        ? (tt.lanKeTiepMs ? `SẴN SÀNG — lần chạy kế tiếp: ${gioVN(tt.lanKeTiepMs)}.`
                          : 'SẴN SÀNG.')
        : `CHƯA CHẠY ĐƯỢC — đang vướng: ${(tt.chanBoi || []).join(', ')}.`;
    o.appendChild(ket);
}

/** Vẽ kết quả "kiểm tra thử". Không phát hành gì, chỉ nói sẽ làm gì. */
function veKetQuaThu(tailieu, o, kq) {
    o.textContent = '';
    const them = (chu, do_) => {
        const d = tailieu.createElement('div');
        d.className = 'hdt-ghi' + (do_ ? ' hdt-do' : '');
        d.textContent = chu;
        o.appendChild(d);
        return d;
    };
    const nhan = tailieu.createElement('label');
    nhan.textContent = 'Kết quả kiểm tra thử (chưa phát hành gì)';
    o.appendChild(nhan);

    if (!kq || !kq.ok) {
        them('Không kiểm được: ' + ((kq && kq.thongBao) || 'không gọi được extension'), true);
        return;
    }
    if (kq.cua && !kq.cua.chay) them('Tới giờ sẽ KHÔNG chạy — ' + kq.cua.thongBao, true);
    if (kq.bang && !kq.bang.ok) { them(kq.bang.thongBao, true); return; }
    if (kq.ngay) them(`Đã đọc được bảng của NGÀY ${kq.ngay.tu} (${kq.bang.soDong} dòng).`);

    const nhom = kq.theoMoc && kq.theoMoc.length ? kq.theoMoc : null;
    if (nhom) {
        for (const o of nhom) {
            them(`— Mốc ${o.moc}${o.laGioChung ? ' (giờ chung)' : ' (giờ riêng)'}:`);
            for (const k of o.chay || []) {
                them(`   ✓ ${k.tenKH || k.maKH}: sẽ tạo hóa đơn ${tienVN(k.soTien)}đ`);
            }
            for (const k of o.thieu || []) {
                them(`   ⊘ ${k.tenKH || k.maKH}: bỏ qua — ${k.lyDo}`);
            }
            if (!(o.chay || []).length && !(o.thieu || []).length) {
                them('   (mốc này không còn khách nào)');
            }
        }
    } else {
        for (const k of kq.chay || []) {
            them(`✓ ${k.tenKH || k.maKH}: sẽ tạo hóa đơn ${tienVN(k.soTien)}đ`);
        }
        for (const k of kq.thieu || []) {
            them(`⊘ ${k.tenKH || k.maKH}: bỏ qua — ${k.lyDo}`);
        }
    }
    if (!(kq.chay || []).length && !nhom) {
        them('Không khách nào có doanh thu hôm nay để tạo hóa đơn.');
    }
    them('Phần sau (đăng nhập Tendoo, ghép tiền theo kho hàng từng khách) KHÔNG kiểm '
        + 'thử được nếu không đụng vào tài khoản thật, nên dừng ở đây.');
}

/**
 * BẢNG CÀI ĐẶT — độ lệch tối đa và hẹn giờ tự chạy.
 *
 * ⚠️ Bảng này do EXTENSION vẽ lên trang báo cáo, KHÔNG sửa một dòng nào trong
 * project Sell — y như cột "Tạo HĐĐT" vốn có. Ràng buộc của chủ dự án là "cài
 * ở trang này" nhưng "không làm ảnh hưởng đến project Sell"; hai câu đó không
 * mâu thuẫn, và đây là cách thỏa cả hai.
 */
function veBangCaiDat(tailieu, bang, caiDat, tinhTrang, lichSuChay) {
    let capNhatNutLuu = null;      // gán ở phần chân bảng, dùng ở phần chọn khách
    const c = caiDat || {};
    const h = c.henGio || {};
    const chon = bang ? dsDaTick(bang) : [];

    const phu = tailieu.createElement('div');
    phu.className = 'hdt-lop-phu';
    phu.id = ID_CAI_DAT;
    phu.addEventListener('click', su => { if (su.target === phu) phu.remove(); });

    const hop = tailieu.createElement('div');
    hop.className = 'hdt-hop';
    phu.appendChild(hop);

    const dau = tailieu.createElement('div');
    dau.className = 'hdt-dau';
    const tieu = tailieu.createElement('h2');
    tieu.textContent = 'Cài đặt tạo hóa đơn';
    dau.appendChild(tieu);
    hop.appendChild(dau);

    const than = tailieu.createElement('div');
    than.className = 'hdt-than';
    hop.appendChild(than);

    // ── Độ lệch ─────────────────────────────────────────────────────────────
    const khoiLech = tailieu.createElement('div');
    khoiLech.className = 'hdt-muc';
    const nhanLech = tailieu.createElement('label');
    nhanLech.textContent = 'Độ lệch tối đa giữa hóa đơn và doanh thu';
    const oLech = tailieu.createElement('input');
    oLech.type = 'text';
    oLech.id = 'hdt-o-do-lech';
    oLech.className = 'hdt-o-nhap';
    oLech.value = tienVN(c.dungSai == null ? 200000 : c.dungSai);
    const ghiLech = tailieu.createElement('div');
    ghiLech.className = 'hdt-ghi';
    ghiLech.id = 'hdt-ghi-do-lech';
    khoiLech.appendChild(nhanLech);
    khoiLech.appendChild(oLech);
    khoiLech.appendChild(ghiLech);
    than.appendChild(khoiLech);

    const CaiDat = globalThis.HDT_CaiDat;
    const capNhatGhiLech = () => {
        const so = CaiDat ? CaiDat.chuanDungSai(oLech.value) : Number(oLech.value);
        const lo = CaiDat && so > CaiDat.DUNG_SAI_DANG_LO;
        ghiLech.classList.toggle('hdt-do', !!lo);
        ghiLech.textContent = lo
            ? `⚠ ${tienVN(so)}đ cao hơn mức 200.000 xưa nay. Hóa đơn sẽ lệch xa doanh thu `
              + 'thật hơn — đây là số đi vào tờ khai thuế.'
            : `Máy chỉ tạo hóa đơn khi ghép được tổ hợp lệch không quá ${tienVN(so)}đ. `
              + 'Không ghép được thì bỏ qua khách đó, không tạo bừa.';
    };
    oLech.addEventListener('input', capNhatGhiLech);
    capNhatGhiLech();

    // ── Trần mỗi hóa đơn ────────────────────────────────────────────────────
    // Chủ dự án chốt 2026-08-18: một khách doanh thu lớn thì chẻ thành nhiều
    // hóa đơn trên CÙNG tài khoản Tendoo đó, mỗi tờ không quá mức này.
    const khoiTran = tailieu.createElement('div');
    khoiTran.className = 'hdt-muc';
    const nhanTran = tailieu.createElement('label');
    nhanTran.textContent = 'Trần mỗi hóa đơn (để trống = không chẻ nhỏ)';
    const oTran = tailieu.createElement('input');
    oTran.type = 'text';
    oTran.id = 'hdt-o-tran-hoa-don';
    oTran.className = 'hdt-o-nhap';
    oTran.value = Number(c.tranMoiHoaDon) > 0 ? tienVN(c.tranMoiHoaDon) : '';
    const ghiTran = tailieu.createElement('div');
    ghiTran.className = 'hdt-ghi';
    ghiTran.id = 'hdt-ghi-tran-hoa-don';
    khoiTran.appendChild(nhanTran);
    khoiTran.appendChild(oTran);
    khoiTran.appendChild(ghiTran);
    than.appendChild(khoiTran);

    const capNhatGhiTran = () => {
        const so = CaiDat ? CaiDat.chuanTranMoiHoaDon(oTran.value) : Number(oTran.value);
        if (!so) {
            ghiTran.classList.remove('hdt-do');
            ghiTran.textContent = 'Đang TẮT — mỗi khách ra đúng một hóa đơn bằng cả doanh thu, '
                + 'như xưa nay.';
            return;
        }
        // Cho người dùng thấy TRƯỚC số tờ sẽ ra, dựa trên chính khách đang tích.
        // Con số này mới là thứ họ cần cân nhắc, không phải mức trần.
        // ⚠️ `dsKhachDaTick` khai báo Ở DƯỚI, mà hàm này còn được gọi NGAY khi
        // dựng ô — lúc đó nó chưa tồn tại và chạm vào là ném ReferenceError,
        // làm hỏng cả bảng cài đặt. Bọc lại: lần đầu chỉ thiếu con số ước tính,
        // gõ một chữ vào ô là hiện đủ. Có gọi lại một lần ở dưới cho đủ.
        let cacKH = [];
        try { cacKH = dsKhachDaTick(); } catch (e) { cacKH = []; }
        const toiDa = 40;
        let tong = 0;
        let quaNhieu = 0;
        for (const k of cacKH) {
            const n = Math.ceil((Number(k.soTien) || 0) / so);
            tong += n;
            if (n > toiDa) quaNhieu++;
        }
        ghiTran.classList.toggle('hdt-do', quaNhieu > 0);
        ghiTran.textContent = `Mỗi hóa đơn không quá ${tienVN(so)}đ. `
            + (cacKH.length
                ? `${cacKH.length} khách đang tích sẽ ra khoảng ${tong} hóa đơn. `
                : '')
            + (quaNhieu > 0
                ? `⚠ ${quaNhieu} khách vượt ${toiDa} tờ nên sẽ BỊ TỪ CHỐI ngay từ đầu, `
                  + 'không xuất tờ nào. Hãy nâng mức trần.'
                : 'Số tiền lẻ dồn vào tờ cuối; tổng vẫn khớp doanh thu như trước.');
    };
    oTran.addEventListener('input', capNhatGhiTran);
    capNhatGhiTran();

    // ── Hẹn giờ ─────────────────────────────────────────────────────────────
    const khoiHen = tailieu.createElement('div');
    khoiHen.className = 'hdt-muc';
    const nhanHen = tailieu.createElement('label');
    const oBat = tailieu.createElement('input');
    oBat.type = 'checkbox';
    oBat.id = 'hdt-hen-bat';
    oBat.checked = !!h.bat;
    nhanHen.appendChild(oBat);
    nhanHen.appendChild(tailieu.createTextNode(' Tự chạy theo giờ đã hẹn'));
    khoiHen.appendChild(nhanHen);

    const oMoc = tailieu.createElement('input');
    oMoc.type = 'text';
    oMoc.id = 'hdt-hen-moc';
    oMoc.className = 'hdt-o-nhap';
    oMoc.placeholder = 'VD: 21:00 — mỗi ngày một giờ';
    oMoc.value = (h.moc || []).join(', ');
    khoiHen.appendChild(oMoc);

    // ⚠️ MỘT MỐC MỘT NGÀY. Máy lấy "doanh thu hôm nay tính tới lúc chạy", nên
    // chạy hai lần trong ngày là tính trùng phần buổi sáng.
    const ghiMoc = tailieu.createElement('div');
    ghiMoc.className = 'hdt-ghi';
    ghiMoc.id = 'hdt-hen-ghi-moc';
    ghiMoc.textContent = 'Đây là GIỜ CHUNG, áp dụng cho khách nào KHÔNG có giờ riêng. '
        + 'Lượt XUẤT THEO HỆ THỐNG mỗi khách chỉ chạy ĐÚNG MỘT lần mỗi ngày — máy lấy doanh '
        + 'thu của riêng ngày hôm đó (tính tới lúc chạy), nên chạy hai lần trong ngày sẽ tính '
        + 'trùng phần buổi sáng. Gõ nhiều giờ thì máy giữ giờ sớm nhất. '
        + 'Lượt TIỀN/NGÀY nằm ngoài luật này: nó không đọc doanh thu nên có lịch riêng.';
    khoiHen.appendChild(ghiMoc);

    const ghiNgay = tailieu.createElement('div');
    ghiNgay.className = 'hdt-ghi';
    ghiNgay.id = 'hdt-hen-ghi-ngay';
    ghiNgay.textContent = 'Tới giờ, máy tự đặt bộ lọc về "Hôm nay", bấm "Xem báo cáo", rồi '
        + 'kiểm lại dòng "Từ … đến …" phải đúng hôm nay mới đọc số. Khách nào hôm đó chưa '
        + 'phát sinh doanh thu thì bỏ qua — không phải lỗi, và vẫn nằm trong lịch cho hôm sau.';
    khoiHen.appendChild(ghiNgay);

    // ⚠️ CHỌN KHÁCH NGAY TẠI ĐÂY.
    //
    // Bản trước đọc danh sách khách LÚC MỞ bảng, nên phải "tích trên bảng rồi
    // mới mở cài đặt" — mà bảng cài đặt lại che mất bảng khách. Người dùng mở
    // ra, tích ô hẹn giờ, bấm Lưu, rồi nhận về "Hẹn giờ TẮT" mà không hiểu vì
    // sao. Đó là cái bẫy do mình dựng ra. Nay liệt kê khách ngay trong bảng này.
    const nhanKhach = tailieu.createElement('label');
    nhanKhach.textContent = 'Khách sẽ tự tạo hóa đơn — HAI LỊCH TÁCH RỜI: '
        + '[tích + giờ] xuất theo hệ thống (để trống là theo giờ chung) │ '
        + '[tích + tiền/ngày + giờ + số ngày] xuất theo số tự chọn '
        + '(bắt buộc điền giờ; số ngày để trống là chạy mãi)';
    khoiHen.appendChild(nhanKhach);

    const dsBang = bang ? globalThis.HDT_DocBang.docCacDong(bang) : [];
    const daChonSan = new Set([
        ...chon.map(k => k.maKH),
        ...(h.khach || []).map(k => k.maKH),
    ]);
    const oKhach = tailieu.createElement('div');
    oKhach.id = 'hdt-hen-ds-khach';
    oKhach.className = 'hdt-ds-khach';
    // Khách trong lịch mà KHÔNG còn trên bảng vẫn phải hiện ra, nếu không lưu
    // một phát là mất họ khỏi lịch mà chẳng ai hay.
    const daCo = new Set(dsBang.map(k => k.maKH));
    const themNgoai = (h.khach || []).filter(k => !daCo.has(k.maKH));
    // Giờ riêng đang lưu của từng khách, để điền sẵn vào ô.
    const gioRiengCu = new Map((h.khach || []).map(k => [k.maKH, k.moc || '']));
    const tienNgayCu = new Map((h.khach || []).map(
        k => [k.maKH, k.soTienNgay ? String(k.soTienNgay) : '']));
    const gioTienCu = new Map((h.khach || []).map(k => [k.maKH, k.mocTien || '']));
    const soNgayCu = new Map((h.khach || []).map(
        k => [k.maKH, k.soNgayTuChon ? String(k.soNgayTuChon) : '']));
    // Giữ nguyên bản ghi để tính "còn mấy ngày" — cần cả `batDauTuChon`.
    const khachCu = new Map((h.khach || []).map(k => [k.maKH, k]));
    // ⚠️ HAI CÔNG TẮC TÁCH RỜI (27/08/2026). Bản ghi cũ không có hai cờ này;
    // `caiDat.chuanKhach` đã chuyển sang cờ lúc đọc, nhưng ở đây vẫn phải có
    // lưới đỡ cho gói dựng tay — thiếu nó là mở màn hình lên thấy tắt sạch.
    // Nếp cũ: có `soTienNgay` nghĩa là khách ấy CHỈ xuất theo số đã đặt.
    const coCo = (k) => ('batHeThong' in k) || ('batTuChon' in k);
    const batHTCu = new Map((h.khach || []).map(
        k => [k.maKH, coCo(k) ? !!k.batHeThong : !k.soTienNgay]));
    const batTCCu = new Map((h.khach || []).map(
        k => [k.maKH, coCo(k) ? !!k.batTuChon : !!k.soTienNgay]));
    for (const k of [...dsBang, ...themNgoai]) {
        const d = tailieu.createElement('div');
        d.className = 'hdt-dong-khach';

        const nhan = tailieu.createElement('label');
        nhan.className = 'ten';
        const o = tailieu.createElement('input');
        o.type = 'checkbox';
        o.className = 'hdt-tick-hen';
        o.dataset.ma = k.maKH;
        o.dataset.ten = k.tenKH || '';
        o.checked = daChonSan.has(k.maKH);
        nhan.appendChild(o);
        const chuTen = ` ${k.maKH} — ${k.tenKH || ''}`
            + (k.doanhThu != null ? ` (${tienVN(k.doanhThu)}đ)` : ' (không còn trên bảng)');
        nhan.appendChild(tailieu.createTextNode(chuTen));
        // Tên dài bị cắt bằng dấu ba chấm (xem .hdt-dong-khach .ten). Không gắn
        // tên đầy đủ vào đây thì hai khách cùng tiền tố nhìn hệt nhau, mà đây là
        // chỗ chọn ai được phát hành hóa đơn thuế — nhầm là nhầm thật.
        nhan.title = chuTen.trim();
        d.appendChild(nhan);

        // ── CỘT 1: XUẤT THEO HỆ THỐNG (lấy doanh thu hôm nay) ───────────────
        const oBatHT = tailieu.createElement('input');
        oBatHT.type = 'checkbox';
        oBatHT.className = 'hdt-bat-ht';
        oBatHT.dataset.ma = k.maKH;
        oBatHT.checked = batHTCu.get(k.maKH) !== false;
        oBatHT.title = 'Bật = xuất hóa đơn theo DOANH THU hôm nay.\n'
            + 'Tắt = khách này không xuất theo doanh thu nữa, nhưng vẫn xuất\n'
            + 'theo "tiền/ngày" nếu cột bên phải đang bật.';
        d.appendChild(oBatHT);

        // ⚠️ GIỜ RIÊNG: điền vào thì GIỜ CHUNG KHÔNG đụng tới khách này nữa.
        const oGio = tailieu.createElement('input');
        oGio.type = 'text';
        oGio.className = 'hdt-gio-rieng';
        oGio.dataset.ma = k.maKH;
        oGio.placeholder = 'giờ riêng';
        oGio.title = 'Giờ của lượt XUẤT THEO HỆ THỐNG.\n'
            + 'Để trống = chạy theo giờ chung. Điền giờ riêng thì giờ chung '
            + 'không đụng tới khách này nữa.';
        oGio.value = gioRiengCu.get(k.maKH) || '';
        oGio.classList.toggle('co', !!oGio.value);
        d.appendChild(oGio);

        const vach = tailieu.createElement('div');
        vach.className = 'hdt-vach-doc';
        d.appendChild(vach);

        // ── CỘT 2: XUẤT THEO SỐ TỰ CHỌN — LỊCH RIÊNG, KHÔNG DÍNH CỘT 1 ──────
        //
        // ⚠️ Chủ dự án chốt 27/08/2026: hai cột TÁCH RỜI. Bật cả hai thì trong
        // ngày khách ra HAI hóa đơn, mỗi cái một giờ.
        //
        // Chuyện này KHÔNG phá luật "mỗi ngày đúng một mốc" (13/08/2026): luật
        // ấy sinh ra vì lượt hệ thống lấy doanh thu cộng dồn tới lúc chạy, nên
        // chạy hai lần là tính trùng phần buổi sáng. Lượt tự chọn không đọc
        // doanh thu, không có gì để tính trùng.
        const oBatTC = tailieu.createElement('input');
        oBatTC.type = 'checkbox';
        oBatTC.className = 'hdt-bat-tc';
        oBatTC.dataset.ma = k.maKH;
        oBatTC.checked = !!batTCCu.get(k.maKH);
        oBatTC.title = 'Bật = mỗi ngày xuất THÊM một hóa đơn đúng số bên phải,\n'
            + 'vào giờ bên phải. Hoàn toàn tách rời lượt theo hệ thống.';
        d.appendChild(oBatTC);

        const oTien = tailieu.createElement('input');
        oTien.type = 'text';
        oTien.className = 'hdt-tien-ngay';
        oTien.dataset.ma = k.maKH;
        oTien.placeholder = 'tiền/ngày';
        // ⚠️ Chủ dự án chốt 25/08/2026: con số gõ vào đây là con số CUỐI CÙNG,
        // không so với doanh số hôm nay, không so với số dư chưa xuất hóa đơn,
        // không so với bất cứ dữ liệu nào. Bản trước có trần theo số dư; đã bỏ.
        oTien.title = 'Mỗi ngày xuất đúng số này, BẤT KỂ doanh số hôm nay và\n'
            + 'KHÔNG so với bất kỳ dữ liệu nào khác.';
        // Số đã lưu là số trần (5000000); chấm ngay lúc vẽ cho khớp với thứ
        // người dùng sẽ thấy khi gõ.
        oTien.value = chamNganNghin(tienNgayCu.get(k.maKH) || '');
        oTien.classList.toggle('co', !!oTien.value);
        d.appendChild(oTien);

        // ⚠️ GIỜ CỦA LƯỢT TỰ CHỌN. Để trống thì phần tự chọn KHÔNG chạy — chủ
        // dự án chốt. Mượn giờ chung hay mượn giờ cột bên là phát hành một tờ
        // hóa đơn thuế vào giờ người dùng chưa hề chọn.
        const oGioTien = tailieu.createElement('input');
        oGioTien.type = 'text';
        oGioTien.className = 'hdt-gio-tien';
        oGioTien.dataset.ma = k.maKH;
        oGioTien.placeholder = 'giờ tiền/ngày';
        oGioTien.title = 'Giờ của lượt XUẤT THEO TIỀN/NGÀY.\n'
            + 'ĐỂ TRỐNG = phần tiền/ngày KHÔNG chạy (không mượn giờ chung).';
        oGioTien.value = gioTienCu.get(k.maKH) || '';
        oGioTien.classList.toggle('co', !!oGioTien.value);
        d.appendChild(oGioTien);

        // ── HẠN CHẠY: bao nhiêu NGÀY rồi tự dừng ────────────────────────────
        //
        // ⚠️ Chủ dự án chốt 27/08/2026: đếm theo NGÀY LỊCH kể từ lúc lưu, kể cả
        // hôm lưu. Máy tắt hôm nào thì hôm đó vẫn tiêu — đó là lựa chọn có ý,
        // đổi lại không có số đếm lùi nào để hỏng.
        //
        // Hết hạn thì máy NGỪNG CHẠY nhưng KHÔNG tự gạt ô tích: tiến trình nền
        // không tự sửa cài đặt của người dùng. Ô này sẽ hiện "hết hạn".
        const oSoNgay = tailieu.createElement('input');
        oSoNgay.type = 'text';
        oSoNgay.className = 'hdt-so-ngay';
        oSoNgay.dataset.ma = k.maKH;
        oSoNgay.placeholder = 'số ngày';
        oSoNgay.title = 'Lượt tiền/ngày chạy trong bao nhiêu NGÀY rồi tự dừng.\n'
            + 'Tính cả hôm bấm Lưu: gõ 1 là chỉ chạy đúng hôm nay.\n'
            + 'ĐỂ TRỐNG = chạy mãi, như trước.\n'
            + 'Sửa lại con số này thì hạn đếm lại từ hôm nay.';
        oSoNgay.value = soNgayCu.get(k.maKH) || '';
        oSoNgay.classList.toggle('co', !!oSoNgay.value);
        d.appendChild(oSoNgay);

        // Chữ "còn N ngày" / "hết hạn" — người dùng phải nhìn ra ngay còn mấy
        // hôm nữa, chứ không phải ngồi nhẩm từ ngày lưu.
        const chuHan = tailieu.createElement('span');
        chuHan.className = 'hdt-han';
        chuHan.dataset.ma = k.maKH;
        d.appendChild(chuHan);

        oKhach.appendChild(d);
    }
    khoiHen.appendChild(oKhach);

    const ghiKhach = tailieu.createElement('div');
    ghiKhach.className = 'hdt-ghi';
    ghiKhach.id = 'hdt-hen-khach';
    khoiHen.appendChild(ghiKhach);

    const ghiSat = tailieu.createElement('div');
    ghiSat.className = 'hdt-ghi hdt-do';
    ghiSat.id = 'hdt-hen-moc-sat';
    ghiSat.style.display = 'none';
    khoiHen.appendChild(ghiSat);

    const dsKhachDaTick = () => [...oKhach.querySelectorAll('input.hdt-tick-hen')]
        .filter(o => o.checked)
        .map((o) => {
            const g = oKhach.querySelector(`input.hdt-gio-rieng[data-ma="${o.dataset.ma}"]`);
            const moc = g ? String(g.value || '').trim() : '';
            const t = oKhach.querySelector(`input.hdt-tien-ngay[data-ma="${o.dataset.ma}"]`);
            const soTienNgay = t ? String(t.value || '').trim() : '';
            const gt = oKhach.querySelector(`input.hdt-gio-tien[data-ma="${o.dataset.ma}"]`);
            const mocTien = gt ? String(gt.value || '').trim() : '';
            const bHT = oKhach.querySelector(`input.hdt-bat-ht[data-ma="${o.dataset.ma}"]`);
            const bTC = oKhach.querySelector(`input.hdt-bat-tc[data-ma="${o.dataset.ma}"]`);
            // Ô tích ngoài cùng trả lời "có trong lịch không"; hai ô tích bên
            // trong trả lời "chạy lượt nào". Bỏ tích ngoài là ra khỏi lịch, mọi
            // thứ ghi ở các ô kia cũng vô nghĩa.
            //
            // ⚠️ LUÔN GỬI CẢ HAI CỜ, kể cả khi false. Bỏ khoá đi thì
            // `caiDat.chuanKhach` tưởng đây là bản ghi cũ và tự đoán lại — tắt
            // tích rồi lưu xong mở lên vẫn thấy bật.
            const k2 = {
                maKH: o.dataset.ma, tenKH: o.dataset.ten,
                batHeThong: bHT ? !!bHT.checked : true,
                batTuChon: bTC ? !!bTC.checked : false,
            };
            if (moc) k2.moc = moc;
            if (soTienNgay) k2.soTienNgay = soTienNgay;
            if (mocTien) k2.mocTien = mocTien;
            const sn = oKhach.querySelector(`input.hdt-so-ngay[data-ma="${o.dataset.ma}"]`);
            const soNgay = sn ? String(sn.value || '').trim() : '';
            if (soNgay) k2.soNgayTuChon = soNgay;
            return k2;
        });

    // Giờ `dsKhachDaTick` đã có -> vẽ lại lời nhắc trần hóa đơn cho đủ số liệu.
    capNhatGhiTran();

    const HenGio = globalThis.HDT_HenGio;
    const capNhatGhiKhach = () => {
        capNhatGhiTran();          // tích thêm/bớt khách -> số tờ ước tính đổi theo
        const ds = dsKhachDaTick();
        const n = ds.length;
        ghiKhach.classList.toggle('hdt-do', n === 0);
        if (!n) {
            ghiKhach.textContent = '⚠ CHƯA CHỌN KHÁCH NÀO — hẹn giờ sẽ KHÔNG bật được. '
                + 'Tích ít nhất một khách ở trên.';
        } else {
            // Kể theo TỪNG MỐC, để nhìn phát là biết ai chạy lúc nào.
            //
            // ⚠️ CHẠY QUA ĐÚNG BỘ CHUẨN HOÁ CỦA LÚC LƯU. Ô nhập trả về CHUỖI
            // THÔ ("7.000.000", "9h"), còn tiến trình nền chỉ thấy thứ đã qua
            // `chuanKhach`. Xem chuỗi thô ở đây là màn hình nói một đằng mà máy
            // chạy một nẻo: `Number("7.000.000")` ra NaN nên bảng sẽ kêu "chưa
            // có số tiền" trong khi số ấy hoàn toàn hợp lệ.
            const dsChuan = CaiDat ? CaiDat.chuanKhach(ds, HenGio, oMoc.value) : ds;
            const goi = { bat: true, moc: [oMoc.value], khach: dsChuan };
            const nhom = HenGio ? HenGio.gomTheoMoc(goi) : [];
            const lacLoi = HenGio ? HenGio.khachKhongCoGio(goi) : [];
            // ⚠️ Gõ tiền mà quên gõ giờ thì phần tự chọn KHÔNG chạy. Không kêu
            // lên ở đây là người dùng bấm Lưu, thấy mọi thứ bình thường, rồi
            // chờ mãi một tờ hóa đơn không bao giờ tới.
            const thieuGio = HenGio ? HenGio.khachThieuGioTien(goi) : [];
            // ⚠️ Bật tiền/ngày mà ô tiền TRỐNG, hoặc số lớn tới mức bộ đọc số
            // từ chối (trên 2^53) — cả hai đều dẫn tới "hôm đó không có hóa đơn
            // nào" trong khi bảng trông vẫn bình thường.
            const thieuTien = HenGio ? HenGio.khachThieuTienTuChon(goi) : [];
            // Tích khách nhưng tắt cả hai cột = có tên trong lịch mà không chạy
            // lượt nào. Cũng là một cách hỏng im lặng.
            const tatCaHai = dsChuan.filter(k => !k.batHeThong && !k.batTuChon);
            // Mỗi mục nay có cờ `kieu` -> ghi rõ ai chạy kiểu gì, kẻo cùng một
            // tên hiện ở hai mốc mà không biết mốc nào là mốc nào.
            const ten = (k) => (k.tenKH || k.maKH) + (k.kieu === 'tu_chon' ? ' (tiền/ngày)' : '');
            ghiKhach.textContent = `Đã chọn ${n} khách. `
                + (nhom.length
                    ? nhom.map(o => `${o.moc}: ${o.khach.length ? o.khach.map(ten).join(', ')
                        : '(không còn khách nào)'}`).join(' · ')
                    : '')
                + (lacLoi.length
                    ? ` ⚠ ${lacLoi.length} khách CHƯA CÓ GIỜ NÀO (chưa đặt giờ chung, cũng `
                      + `không có giờ riêng): ${lacLoi.map(k => k.tenKH || k.maKH).join(', ')}`
                    : '')
                + (thieuGio.length
                    ? ` ⚠ ${thieuGio.length} khách BẬT "tiền/ngày" NHƯNG CHƯA ĐIỀN GIỜ nên phần `
                      + `đó KHÔNG chạy: ${thieuGio.map(k => k.tenKH || k.maKH).join(', ')}`
                    : '')
                + (thieuTien.length
                    ? ` ⚠ ${thieuTien.length} khách BẬT "tiền/ngày" NHƯNG SỐ TIỀN KHÔNG DÙNG `
                      + `ĐƯỢC (trống, hoặc lớn quá mức máy giữ được từng đồng) nên phần đó `
                      + `KHÔNG chạy: ${thieuTien.map(k => k.tenKH || k.maKH).join(', ')}`
                    : '')
                + (tatCaHai.length
                    ? ` ⚠ ${tatCaHai.length} khách TẮT CẢ HAI cột nên không chạy lượt nào: `
                      + `${tatCaHai.map(k => k.tenKH || k.maKH).join(', ')}`
                    : '');
            ghiKhach.classList.toggle('hdt-do',
                lacLoi.length > 0 || thieuGio.length > 0 || thieuTien.length > 0
                || tatCaHai.length > 0);
        }
        // ⚠️ CHỮ "CÒN N NGÀY" cạnh từng khách. Con số ngày một mình không nói
        // được gì: người dùng phải nhẩm từ hôm lưu mới ra ngày dừng. Bày thẳng
        // ra đây, và tô ĐỎ khi đã hết — hết hạn nghĩa là khách đó ngừng ra hóa
        // đơn, phải nhìn phát thấy ngay.
        if (HenGio) {
            for (const oH of oKhach.querySelectorAll('span.hdt-han')) {
                const ma = oH.dataset.ma;
                const sn = oKhach.querySelector(`input.hdt-so-ngay[data-ma="${ma}"]`);
                const bTC = oKhach.querySelector(`input.hdt-bat-tc[data-ma="${ma}"]`);
                const soGo = sn ? String(sn.value || '').trim() : '';
                oH.classList.remove('het');
                if (!soGo || !(bTC && bTC.checked)) { oH.textContent = ''; continue; }
                const cu2 = khachCu.get(ma) || {};
                // Số vừa gõ KHÁC số đã lưu -> hạn sẽ đếm lại từ hôm nay, nên
                // phải tính theo con số MỚI chứ không theo bản ghi cũ.
                const doiSo = String(cu2.soNgayTuChon || '') !== soGo;
                const ban = doiSo
                    ? { maKH: ma, soNgayTuChon: Number(soGo), batDauTuChon: HenGio.ngayVN() }
                    : { ...cu2, maKH: ma };
                // ⚠️ TRỪ HẲN HÔM NAY RA KHI HÔM NAY ĐÃ CHẠY — chủ dự án chốt
                // 27/08/2026. Xuất xong mà con số đứng yên tới nửa đêm thì nhìn
                // như máy không ghi nhận gì. Con số này nghĩa là "còn bấy nhiêu
                // ngày NỮA sẽ chạy", không phải "còn bấy nhiêu ngày lịch".
                //
                // Gõ số MỚI thì hạn đếm lại từ hôm nay -> hôm nay chưa chạy
                // theo hạn mới, không trừ.
                const conLai = doiSo
                    ? HenGio.soNgayConLai(ban)
                    : HenGio.soNgayChayTiep(ban, lichSuChay);
                if (conLai == null) { oH.textContent = ''; continue; }
                const het = HenGio.ngayHetHanTuChon(ban);
                const daChay = !doiSo
                    && HenGio.daChayTuChonHomNay(ma, lichSuChay);
                if (conLai <= 0) {
                    // Phân biệt HAI ca: hôm nay vừa chạy nốt ngày cuối (mai mới
                    // dừng) và đã quá hạn từ trước. Gộp làm một là người dùng
                    // tưởng máy dừng sớm mất một ngày.
                    oH.textContent = daChay ? 'xong hạn — mai dừng' : 'hết hạn';
                    oH.classList.add('het');
                } else {
                    oH.textContent = `còn ${conLai} ngày`;
                }
                oH.title = (het ? 'Ngày chạy cuối cùng: ' + het : '')
                    + (daChay ? ' · hôm nay đã chạy lượt tiền/ngày rồi' : '');
            }
        }

        // Cảnh báo hai mốc quá sát — lượt sau sẽ bị bỏ qua vì lượt trước chưa xong.
        if (HenGio && ghiSat) {
            const sat = HenGio.mocQuaSat({ moc: [oMoc.value], khach: ds });
            ghiSat.style.display = sat.length ? '' : 'none';
            ghiSat.textContent = sat.length
                ? '⚠ ' + sat.map(([a, b]) => `${a} và ${b}`).join('; ')
                  + ' cách nhau dưới 5 phút. Máy chạy tuần tự từng khách (mỗi khách khoảng '
                  + 'nửa phút tới một phút), nên lượt sau có thể bị bỏ qua vì lượt trước '
                  + 'chưa xong. Nên đặt các mốc cách nhau xa hơn.'
                : '';
        }
        if (typeof capNhatNutLuu === 'function') capNhatNutLuu();
    };
    oKhach.addEventListener('change', capNhatGhiKhach);
    oKhach.addEventListener('input', (su) => {
        const t = su.target;
        if (!t || !t.classList) return;
        // Cả ba ô gõ tay đều phải tô lại và tính lại lời nhắc. Quên ô giờ
        // tiền/ngày ở đây là cảnh báo "chưa điền giờ" không bao giờ tắt đi
        // ngay cả sau khi người dùng đã điền.
        // ⚠️ CHẤM NGĂN NGHÌN NGAY LÚC GÕ — chủ dự án chốt 28/08/2026, và CHỈ cho
        // ô tiền/ngày. Phải đặt lại con trỏ: đổi giá trị ô là trình duyệt đẩy
        // con trỏ về cuối, sửa một chữ số ở giữa thành ra số hoàn toàn khác.
        // Với ô đi thẳng vào hóa đơn thuế thì đó không phải phiền phức.
        if (t.classList.contains('hdt-tien-ngay')) {
            const cu = String(t.value || '');
            const moi = chamNganNghin(cu);
            if (moi !== cu) {
                const viTri = viTriConTro(cu, t.selectionStart, moi);
                t.value = moi;
                // jsdom và vài trình duyệt không cho đặt con trỏ trên ô ẩn —
                // hỏng chỗ này KHÔNG được làm hỏng cả bảng cài đặt.
                try { t.setSelectionRange(viTri, viTri); } catch (e) { /* kệ */ }
            }
        }
        if (t.classList.contains('hdt-gio-rieng') || t.classList.contains('hdt-gio-tien')
            || t.classList.contains('hdt-tien-ngay') || t.classList.contains('hdt-so-ngay')) {
            t.classList.toggle('co', !!String(t.value || '').trim());
            capNhatGhiKhach();
        }
    });

    const ghiHen = tailieu.createElement('div');
    ghiHen.className = 'hdt-ghi hdt-do';
    ghiHen.id = 'hdt-hen-canh-bao';
    ghiHen.textContent = (c.tuBam && c.daHieu)
        ? '⚠ Tới giờ máy sẽ PHÁT HÀNH HÓA ĐƠN THẬT mà không hỏi lại — lúc đó không có '
          + 'ai ngồi đây. Máy tính tắt hoặc Chrome đóng thì không có gì chạy.'
        : '⚠ Công tắc "Tự bấm Thanh toán" đang TẮT nên hẹn giờ sẽ KHÔNG chạy. Máy không '
          + 'để lại một giỏ hàng đầy không ai bấm lúc bạn không có mặt.';
    khoiHen.appendChild(ghiHen);
    than.appendChild(khoiHen);

    // ── TÌNH TRẠNG SẴN SÀNG ─────────────────────────────────────────────────
    // ⚠️ Bốn thứ chặn hẹn giờ vốn VÔ HÌNH: lịch chưa bật, còn lệnh treo, công
    // tắc tự bấm tắt, chưa có tab báo cáo. Người dùng ngồi đợi tới giờ rồi thấy
    // không có gì xảy ra mà không biết vì sao. Bày hết ra đây.
    const khoiSS = tailieu.createElement('div');
    khoiSS.className = 'hdt-muc';
    khoiSS.id = 'hdt-san-sang';
    const nhanSS = tailieu.createElement('label');
    nhanSS.textContent = 'Tới giờ có chạy được không?';
    khoiSS.appendChild(nhanSS);
    const thanSS = tailieu.createElement('div');
    thanSS.id = 'hdt-san-sang-than';
    thanSS.className = 'hdt-ghi';
    thanSS.textContent = 'Đang kiểm…';
    khoiSS.appendChild(thanSS);
    than.appendChild(khoiSS);
    veTinhTrangSanSang(tailieu, thanSS);

    // ── Lịch sử chạy ────────────────────────────────────────────────────────
    const khoiLS = tailieu.createElement('div');
    khoiLS.className = 'hdt-muc';
    khoiLS.id = 'hdt-lich-su';
    than.appendChild(khoiLS);
    veLichSu(tailieu, khoiLS);

    // ── Kết quả kiểm tra thử ────────────────────────────────────────────────
    const khoiThu = tailieu.createElement('div');
    khoiThu.className = 'hdt-muc';
    khoiThu.id = 'hdt-ket-qua-thu';
    khoiThu.style.display = 'none';
    than.appendChild(khoiThu);

    // ── Lần hẹn gần nhất đã làm gì ──────────────────────────────────────────
    const tt = tinhTrang || {};
    if ((tt.sapToi && tt.sapToi.length) || tt.ketQua) {
        const khoiTT = tailieu.createElement('div');
        khoiTT.className = 'hdt-muc';
        khoiTT.id = 'hdt-hen-tinh-trang';
        if (tt.sapToi && tt.sapToi.length) {
            const d = tailieu.createElement('div');
            d.className = 'hdt-ghi';
            d.textContent = 'Lần chạy kế tiếp: '
                + tt.sapToi.map(b => `${b.moc} (${gioVN(b.khi)})`).join(' · ');
            khoiTT.appendChild(d);
        }
        if (tt.ketQua) {
            const k = tt.ketQua;
            const d = tailieu.createElement('div');
            d.className = 'hdt-ghi';
            d.textContent = `Lần hẹn gần nhất (${k.moc || '?'}, ${gioVN(k.luc)}`
                + (k.ngay && k.ngay.tu ? `, số liệu ngày ${k.ngay.tu}` : '') + '): '
                + (k.chay
                    ? `đã chạy với ${k.soKhach} khách.`
                    : `KHÔNG chạy — ${k.thongBao || k.lyDo}`);
            khoiTT.appendChild(d);

            // Khách bị bỏ qua PHẢI kể tên và lý do — lúc đó không ai ngồi xem.
            if (Array.isArray(k.thieu) && k.thieu.length) {
                const t = tailieu.createElement('div');
                t.className = 'hdt-ghi';
                t.id = 'hdt-hen-bo-qua';
                t.textContent = 'Bỏ qua ' + k.thieu.length + ' khách: '
                    + k.thieu.map(x => `${x.tenKH || x.maKH} (${x.lyDo})`).join('; ');
                khoiTT.appendChild(t);
            }
        }
        than.appendChild(khoiTT);
    }

    // ── Chân bảng ───────────────────────────────────────────────────────────
    const chan = tailieu.createElement('div');
    chan.className = 'hdt-chan';
    const nutHuy = tailieu.createElement('button');
    nutHuy.type = 'button';
    nutHuy.className = 'hdt-nut-dong';
    nutHuy.textContent = 'Đóng';
    nutHuy.addEventListener('click', () => phu.remove());
    const nutThu = tailieu.createElement('button');
    nutThu.type = 'button';
    nutThu.id = 'hdt-kiem-tra-thu';
    nutThu.textContent = 'Kiểm tra thử (không phát hành)';
    const nutLuu = tailieu.createElement('button');
    nutLuu.type = 'button';
    nutLuu.id = 'hdt-luu-cai-dat';
    nutLuu.className = 'hdt-chinh';
    nutLuu.textContent = 'Lưu cài đặt';
    chan.appendChild(nutHuy);
    chan.appendChild(nutThu);
    chan.appendChild(nutLuu);
    hop.appendChild(chan);

    // Nút Lưu NÓI TRƯỚC hậu quả. Trước đây bấm xong mới biết "Hẹn giờ TẮT".
    capNhatNutLuu = () => {
        const muonBat = oBat.checked;
        const coKhach = dsKhachDaTick().length > 0;
        const coMoc = String(oMoc.value || '').trim().length > 0;
        nutLuu.textContent = (muonBat && (!coKhach || !coMoc))
            ? `Lưu (hẹn giờ sẽ KHÔNG bật — ${!coKhach ? 'chưa chọn khách' : 'chưa có giờ'})`
            : 'Lưu cài đặt';
    };
    oBat.addEventListener('change', capNhatNutLuu);
    oMoc.addEventListener('input', capNhatNutLuu);
    capNhatGhiKhach();

    const bao = tailieu.createElement('div');
    bao.className = 'hdt-ghi';
    bao.id = 'hdt-cai-dat-bao';
    than.appendChild(bao);

    nutThu.addEventListener('click', async () => {
        nutThu.disabled = true;
        khoiThu.style.display = '';
        khoiThu.textContent = 'Đang kiểm tra thử — KHÔNG phát hành gì…';
        const kq = await goiNen(tailieu, { loai: 'hdt-kiem-tra-thu' });
        nutThu.disabled = false;
        veKetQuaThu(tailieu, khoiThu, kq);
        veTinhTrangSanSang(tailieu, thanSS);
    });

    nutLuu.addEventListener('click', async () => {
        nutLuu.disabled = true;
        const tin = {
            loai: 'hdt-dat-cai-dat',
            dungSai: oLech.value,
            tranMoiHoaDon: oTran.value,
            henGio: {
                bat: oBat.checked,
                moc: String(oMoc.value || '').split(',').map(s => s.trim()).filter(Boolean),
                urlBang: String((tailieu.defaultView || globalThis).location.href || ''),
            },
        };
        // Danh sách khách lấy từ CHÍNH bảng này, đọc ngay lúc bấm Lưu.
        tin.henGio.khach = dsKhachDaTick();
        const tra = await goiNen(tailieu, tin);
        nutLuu.disabled = false;
        if (!tra || !tra.ok) {
            bao.classList.add('hdt-do');
            bao.textContent = 'Không lưu được: ' + ((tra && tra.thongBao) || 'không gọi được extension');
            return;
        }
        bao.classList.remove('hdt-do');
        const hh = tra.henGio || {};
        // Gõ nhiều giờ mà máy chỉ giữ một thì phải NÓI RÕ, không lặng lẽ cắt bớt.
        const daGo = tin.henGio.moc.length;
        const daGiu = (hh.moc || []).length;
        bao.textContent = `Đã lưu. Độ lệch ${tienVN(tra.dungSai)}đ. `
            + (Number(tra.tranMoiHoaDon) > 0
                ? `Trần mỗi hóa đơn ${tienVN(tra.tranMoiHoaDon)}đ. `
                : 'Không chẻ nhỏ hóa đơn. ')
            + (hh.bat
                ? `Hẹn giờ BẬT lúc ${(hh.moc || []).join(', ')} với ${(hh.khach || []).length} khách.`
                : 'Hẹn giờ TẮT.')
            + (daGo > daGiu && daGiu > 0
                ? ` Bạn gõ ${daGo} giờ nhưng máy chỉ giữ giờ sớm nhất (${hh.moc[0]}) — `
                  + 'mỗi ngày chỉ chạy một lần để khỏi tính trùng doanh thu.'
                : '');
        veTinhTrangSanSang(tailieu, thanSS);
    });

    return phu;
}

/**
 * LỊCH SỬ CHẠY — khách nào thành công, khách nào không, và vì sao.
 *
 * ⚠️ Máy chạy lúc không có ai ngồi xem. Không có phần này thì hỏng cũng không
 * ai biết hỏng ở khách nào — trước đây kết quả bị đè lên nhau, chỉ giữ lần cuối.
 */
const MOI_TRANG_LICH_SU = 10;

/** Vẽ MỘT bản ghi lịch sử. */
function veMotBanGhi(tailieu, b) {
    const LS = globalThis.HDT_LichSuChay;
    const khoi = tailieu.createElement('div');
    khoi.className = 'hdt-ls';

    const dau = tailieu.createElement('div');
    dau.className = 'hdt-ls-dau';
    dau.textContent = `${gioVN(b.luc)} · ${b.nguon === 'HEN_GIO' ? 'hẹn giờ' : 'chạy tay'}`
        + (b.moc ? ` ${b.moc}` : '')
        + (b.ngay && b.ngay.tu ? ` · số liệu ngày ${b.ngay.tu}` : '')
        // Bản nào tạo ra dòng này — để không bao giờ phải đoán lại nữa.
        + (b.banExt ? ` · bản ${b.banExt}` : '');
    khoi.appendChild(dau);

    const tom = tailieu.createElement('div');
    tom.className = 'hdt-ghi' + (b.chay ? '' : ' hdt-do');
    tom.textContent = LS ? LS.tomTat(b) : (b.chay ? 'đã chạy' : 'không chạy');
    khoi.appendChild(tom);

    for (const k of b.khach || []) {
        const d = tailieu.createElement('div');
        const xau = k.ket === 'LOI' ? ' loi' : (k.ket === 'TREO' ? ' treo' : '');
        const tot = k.ket === 'RA_HOA_DON' ? ' ok' : '';
        d.className = 'hdt-ls-kh' + xau + tot;
        const dau2 = k.ket === 'RA_HOA_DON' ? '✓'
            : k.ket === 'LOI' ? '✗' : k.ket === 'TREO' ? '⚠' : '⊘';
        d.textContent = `${dau2} ${k.tenKH || k.maKH}`
            + (k.soTien ? ` (${tienVN(k.soTien)}đ)` : '')
            + ' — ' + ((LS && LS.NHAN[k.ket]) || k.ket)
            + (k.chiTiet ? `: ${k.chiTiet}` : '');
        khoi.appendChild(d);
    }
    return khoi;
}

/**
 * LỊCH SỬ CHẠY, chia trang 10 bản ghi.
 *
 * ⚠️ Đổi trang KHÔNG hỏi lại tiến trình nền: cả danh sách đã tải sẵn lúc mở
 * bảng, nên chuyển trang là tức thì. Hỏi lại mỗi lần bấm vừa chậm vừa có thể
 * ra danh sách khác (một lượt chạy vừa xong ở giữa chừng) — bấm "Sau" mà nội
 * dung nhảy lung tung thì không ai hiểu mình đang xem gì.
 */
function veTrangLichSu(tailieu, o, ds, trang) {
    o.textContent = '';
    const nhan = tailieu.createElement('label');
    nhan.textContent = 'Lịch sử chạy';
    o.appendChild(nhan);

    if (!ds.length) {
        const d = tailieu.createElement('div');
        d.className = 'hdt-ghi';
        d.textContent = 'Chưa có lần chạy nào được ghi lại.';
        o.appendChild(d);
        return;
    }

    const soTrang = Math.max(1, Math.ceil(ds.length / MOI_TRANG_LICH_SU));
    // Kẹp lại cho chắc: dữ liệu có thể đã ngắn đi so với lúc chọn trang.
    const t = Math.min(Math.max(1, Number(trang) || 1), soTrang);
    const batDau = (t - 1) * MOI_TRANG_LICH_SU;

    for (const b of ds.slice(batDau, batDau + MOI_TRANG_LICH_SU)) {
        o.appendChild(veMotBanGhi(tailieu, b));
    }

    // Chỉ một trang thì KHÔNG vẽ thanh chuyển trang cho đỡ rối.
    if (soTrang <= 1) return;

    const thanh = tailieu.createElement('div');
    thanh.className = 'hdt-ls-trang';
    thanh.id = 'hdt-ls-trang';

    const nut = (chu, toi, tat, dangXem) => {
        const b = tailieu.createElement('button');
        b.type = 'button';
        b.textContent = chu;
        b.className = 'hdt-ls-nut' + (dangXem ? ' dang' : '');
        // ⚠️ Nút hết đường phải TRÔNG NHƯ hết đường. Nút bấm được mà không xảy ra
        // gì là để người dùng ngồi đoán mình bấm hụt hay máy hỏng.
        if (tat) { b.disabled = true; }
        else b.onclick = () => veTrangLichSu(tailieu, o, ds, toi);
        return b;
    };

    thanh.appendChild(nut('‹ Trước', t - 1, t <= 1));
    for (let i = 1; i <= soTrang; i++) thanh.appendChild(nut(String(i), i, false, i === t));
    thanh.appendChild(nut('Sau ›', t + 1, t >= soTrang));

    const dem = tailieu.createElement('span');
    dem.className = 'hdt-ls-dem';
    dem.textContent = `Trang ${t}/${soTrang} · ${ds.length} lần chạy`;
    thanh.appendChild(dem);

    o.appendChild(thanh);
}

/**
 * LỊCH SỬ CHẠY — khách nào thành công, khách nào không, và vì sao.
 *
 * ⚠️ Máy chạy lúc không có ai ngồi xem. Không có phần này thì hỏng cũng không
 * ai biết hỏng ở khách nào — trước đây kết quả bị đè lên nhau, chỉ giữ lần cuối.
 */
async function veLichSu(tailieu, o) {
    const tra = await goiNen(tailieu, { loai: 'hdt-lich-su-chay' });
    if (!o.isConnected) return;
    veTrangLichSu(tailieu, o, (tra && tra.ds) || [], 1);
}

async function moBangCaiDat(bang) {
    const tailieu = bang.ownerDocument;
    const cu = tailieu.getElementById(ID_CAI_DAT);
    if (cu) cu.remove();
    themStyle(tailieu);

    const caiDat = await goiNen(tailieu, { loai: 'hdt-hoi-cai-dat' });
    const tinhTrang = await goiNen(tailieu, { loai: 'hdt-ket-qua-hen-gio' });
    // ⚠️ LẤY LỊCH SỬ CHẠY NGAY TỪ ĐẦU, không đợi khối lịch sử vẽ xong. Chữ
    // "còn N ngày" cần biết hôm nay khách đã chạy lượt tiền/ngày chưa; thiếu nó
    // thì con số đứng yên sau khi xuất — đúng cái chủ dự án phàn nàn 27/08/2026.
    // Hỏng thì coi như chưa chạy: thà hiện thừa một ngày còn hơn trừ oan.
    const ls = await goiNen(tailieu, { loai: 'hdt-lich-su-chay' });
    const phu = veBangCaiDat(tailieu, bang, caiDat, tinhTrang, (ls && ls.ds) || []);
    (tailieu.body || tailieu.documentElement).appendChild(phu);
    return phu;
}

const DUONG_GHI_NHAN = '/ke-toan-tong-hop/api/ghi-nhan-tu-may';

/**
 * Ghi kết quả vào sổ kế toán, BẰNG PHIÊN ĐĂNG NHẬP của trang này.
 *
 * ⚠️ Chỉ admin mới ghi được (route bên Sell chặn `phanQuyen:admin`). Đăng xuất
 * hay hết phiên thì trả ok:false — tiến trình nền GIỮ LẠI dòng trong hàng chờ,
 * đăng nhập lại là tự gửi bù. Không mất số nào.
 */
async function ghiNhanTuMay(tailieu, banGhi) {
    const G = tailieu.defaultView || globalThis;
    const cac = Array.isArray(banGhi) ? banGhi : [];
    if (!cac.length) return { ok: false, boQua: 'KHONG_CO_GI_DE_GUI' };

    const the = tailieu.querySelector('meta[name="csrf-token"]');
    const csrf = the ? the.getAttribute('content') : '';
    if (!csrf) {
        return { ok: false, ma: 'THIEU_CSRF',
                 thongBao: 'Trang bongtom.store không có thẻ csrf-token — hãy tải lại trang (F5).' };
    }

    let tra;
    try {
        tra = await G.fetch(DUONG_GHI_NHAN, {
            method: 'POST',
            credentials: 'same-origin',       // BẮT BUỘC: mang theo cookie phiên
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-CSRF-TOKEN': csrf,
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: JSON.stringify({ ban_ghi: cac }),
        });
    } catch (e) {
        return { ok: false, thongBao: String((e && e.message) || e) };
    }

    if (!tra.ok) {
        // 401/403 ở đây nghĩa là PHIÊN, không phải token — nói cho đúng bệnh.
        if (tra.status === 401 || tra.status === 403) {
            return { ok: false, ma: 'CHUA_DANG_NHAP',
                     thongBao: 'bongtom.store từ chối: cần đang đăng nhập bằng tài khoản Admin. '
                        + 'Đăng nhập lại rồi máy sẽ tự gửi bù, không mất dòng nào.' };
        }
        if (tra.status === 419) {
            return { ok: false, ma: 'HET_PHIEN',
                     thongBao: 'Phiên đăng nhập bongtom.store đã hết hạn — hãy tải lại trang (F5).' };
        }
        return { ok: false, thongBao: 'bongtom.store trả về ' + tra.status };
    }

    let d = null;
    try { d = await tra.json(); } catch (e) { d = null; }
    return {
        ok: !!(d && d.thanh_cong),
        soDong: cac.length,
        daGhi: (d && d.da_ghi) || 0,
        daCapNhat: (d && d.da_cap_nhat) || 0,
        khongKhopKhach: (d && d.khong_khop_khach) || [],
    };
}

/**
 * Trả lời tiến trình nền khi nó hỏi BẢNG ĐANG CÓ GÌ.
 *
 * Dùng cho hẹn giờ: tới giờ, nền mở/tìm trang này rồi hỏi số MỚI NHẤT, thay vì
 * dùng số đã chốt lúc đặt lịch — doanh thu đổi từng ngày, dùng số cũ là ra hóa
 * đơn sai. Đây là lựa chọn của chủ dự án ngày 2026-08-13.
 *
 * ⚠️ CHỈ ĐỌC. Tin này không bao giờ được phép bắt trang làm gì khác.
 */
function ganTaiNgheDocBang(tailieu) {
    const G = tailieu.defaultView || globalThis;
    const runtime = G.chrome && G.chrome.runtime;
    if (!runtime || !runtime.onMessage || !runtime.onMessage.addListener) return null;

    const tai = (tin, nguoiGui, traLoi) => {
        // ⭐ GHI SỔ KẾ TOÁN QUA CHÍNH TRANG NÀY — khỏi phải khai token.
        //
        // Tiến trình nền gọi thẳng vào Sell thì với Sell nó là NGƯỜI LẠ: không
        // phiên, không biết là ai, nên mới phải có token. Còn ở đây là trang
        // Sell mà bạn ĐANG ĐĂNG NHẬP, nên gửi kèm cookie phiên + CSRF y như mọi
        // thao tác bạn tự bấm. Chặt hơn hẳn một chuỗi token dùng chung.
        if (tin && tin.loai === 'hdt-ghi-nhan-tu-may') {
            ghiNhanTuMay(tailieu, tin.banGhi)
                .then(traLoi)
                .catch(e => traLoi({ ok: false, thongBao: String((e && e.message) || e) }));
            return true;
        }
        if (!tin || tin.loai !== 'hdt-doc-bang') return false;
        (async () => {
            try {
                // ⚠️ Hẹn giờ đòi ÉP VỀ HÔM NAY trước khi đọc. Trang mặc định lọc
                // "Tháng này", đọc thẳng là lấy doanh thu cả tháng.
                let ngay = null;
                if (tin.epHomNay) {
                    const EHN = globalThis.HDT_EpHomNay;
                    if (!EHN) {
                        traLoi({ ok: false, tinCay: false, dong: [], ma: 'THIEU_BO_EP_NGAY',
                                 thongBao: 'Trang chưa nạp bộ ép ngày — hãy tải lại trang báo cáo (F5).' });
                        return;
                    }
                    const ep = await EHN.epVeHomNay(tailieu, {});
                    if (!ep.ok) {
                        traLoi({ ok: false, tinCay: false, dong: [], ma: ep.ma,
                                 ngay: ep.ngay, thongBao: ep.thongBao });
                        return;
                    }
                    ngay = ep.ngay;
                }
                const bang = tailieu.getElementById('tableKhachHang');
                if (!bang) {
                    traLoi({ ok: false, tinCay: false, dong: [],
                             ma: 'KHONG_THAY_BANG', thongBao: 'Chưa thấy bảng khách hàng' });
                    return;
                }
                const dong = globalThis.HDT_DocBang.docCacDong(bang)
                    .map(k => ({ maKH: k.maKH, tenKH: k.tenKH, doanhThu: k.doanhThu }));
                traLoi({ ok: true, tinCay: !tin.epHomNay || !!ngay, dong, ngay,
                         url: String(G.location && G.location.href || '') });
            } catch (e) {
                traLoi({ ok: false, tinCay: false, dong: [], ma: 'NGOAI_LE',
                         thongBao: String(e && e.message) });
            }
        })();
        return true;      // giữ đường trả lời mở, vì phần ép ngày là bất đồng bộ
    };
    runtime.onMessage.addListener(tai);
    return tai;
}

function khoiDong(tailieu) {
    ganTaiNgheDocBang(tailieu);
    const bang = tailieu.getElementById('tableKhachHang');
    if (!bang) return null;
    chenVao(bang);
    theoDoi(bang);
    return bang;
}

const API = { chenVao, themTieuDe, suaColspan, themOChanBang, themOChoDong, capNhatThanh,
              dsDaTick, moModal, dongModal, theoDoi, khoiDong, tienVN,
              chamNganNghin, viTriConTro,
              ganTaiNgheDocBang, ghiNhanTuMay, DUONG_GHI_NHAN,
              moBangCaiDat, veBangCaiDat, veLichSu, veTrangLichSu, MOI_TRANG_LICH_SU,
              veTinhTrangSanSang, veKetQuaThu, ID_CAI_DAT };

if (typeof globalThis !== 'undefined') globalThis.HDT_ChenCot = API;
if (typeof module !== 'undefined' && module.exports) module.exports = API;

// Tự chạy khi ở trong trang thật. Test đặt cờ này để tự gọi khoiDong() thủ công.
if (typeof document !== 'undefined' && !globalThis.__HDT_KHONG_TU_CHAY__) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => khoiDong(document));
    } else {
        khoiDong(document);
    }
}
})();
