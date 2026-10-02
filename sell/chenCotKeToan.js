'use strict';

// ⚠️ TOÀN BỘ FILE NẰM TRONG MỘT PHẠM VI RIÊNG (hàm bọc ngoài).
// Chrome nạp nhiều file vào CÙNG MỘT phạm vi — hai file cùng khai `const API`
// là file thứ hai nổ ngay khi nạp, và KHÔNG có lỗi nào hiện ra cho người dùng.

(function () {

// ============================================================================
//  BẢNG CÀI ĐẶT "DOANH THU TENDOO" — chèn vào trang Kế toán tổng hợp.
//
//  Cột thì do CHÍNH SELL vẽ (bảng ke_toan_doanh_thu_tendoo). File này chỉ thêm
//  phần ĐIỀU KHIỂN: bật/tắt theo khách, khoảng cách giữa hai lần lấy, và nút
//  lấy ngay. Cố ý tách hẳn khỏi sell/chenCot.js vì hai file chạy trên HAI TRANG
//  KHÁC NHAU — gộp vào là mỗi trang phải nạp cả phần của trang kia.
//
//  ⚠️ KHÔNG ĐỤNG VÀO BẢNG CỦA SELL. File này chỉ thêm một nút vào thanh công
//  cụ và một hộp nổi. Không sửa ô nào, không xóa dòng nào, không vẽ lại bảng.
//  Sell đổi giao diện thì cùng lắm nút không hiện — bảng vẫn nguyên.
//
//  ⛔ KHÔNG BAO GIỜ hiện thẻ ra vào Tendoo ở đây. Phần nền chỉ trả về mã khách
//  và hạn dùng (xem 'hdt-tinh-trang-the'), và đó là tất cả những gì được vẽ.
// ============================================================================

const ID_NUT = 'hdt-nut-dt-tendoo';
const ID_HOP = 'hdt-hop-dt-tendoo';
const ID_KIEU = 'hdt-kieu-dt-tendoo';

// ⚠️ KHÔNG dùng dấu huyền trong khối CSS này. Nó nằm trong chuỗi mẫu, mà một
// dấu huyền lạc vào là cả file chết lúc chạy trong khi `node --check` vẫn qua.
// Đã dính đúng lỗi đó một lần ở sell/chenCot.js.
const KIEU = `
#${ID_HOP} { position: fixed; inset: 0; z-index: 2147483000; display: flex;
  align-items: center; justify-content: center; background: rgba(17,24,39,.45);
  font-family: system-ui, -apple-system, sans-serif; }
#${ID_HOP} .hdt-khung { width: min(760px, 94vw); max-height: 88vh; overflow: auto;
  background: #fff; border-radius: 12px; box-shadow: 0 20px 50px rgba(0,0,0,.3); }
#${ID_HOP} .hdt-dau { display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px; border-bottom: 1px solid #e5e7eb; }
#${ID_HOP} .hdt-dau h3 { margin: 0; font-size: 15px; font-weight: 700; color: #111827; }
#${ID_HOP} .hdt-dong-chu { font-size: 12px; color: #6b7280; margin: 2px 0 0; }
#${ID_HOP} .hdt-than { padding: 14px 18px; }
#${ID_HOP} .hdt-mach { background: #eef2ff; border: 1px solid #c7d2fe; color: #3730a3;
  border-radius: 8px; padding: 9px 11px; font-size: 12px; margin-bottom: 12px; line-height: 1.5; }
#${ID_HOP} table { width: 100%; border-collapse: collapse; font-size: 13px; }
#${ID_HOP} th { text-align: left; font-size: 11px; text-transform: uppercase;
  color: #6b7280; padding: 6px 8px; border-bottom: 1px solid #e5e7eb; }
#${ID_HOP} td { padding: 7px 8px; border-bottom: 1px solid #f3f4f6; color: #111827; }
#${ID_HOP} input[type=number] { width: 84px; border: 1px solid #d1d5db; border-radius: 6px;
  padding: 4px 7px; font-size: 13px; }
#${ID_HOP} .hdt-the { font-size: 11px; }
#${ID_HOP} .hdt-the.co { color: #047857; }
#${ID_HOP} .hdt-the.khong { color: #b45309; }
#${ID_HOP} .hdt-chan { display: flex; gap: 8px; justify-content: flex-end;
  padding: 12px 18px; border-top: 1px solid #e5e7eb; }
#${ID_HOP} button { border: 0; border-radius: 7px; padding: 7px 13px; font-size: 13px;
  cursor: pointer; font-weight: 600; }
#${ID_HOP} .hdt-luu { background: #4f46e5; color: #fff; }
#${ID_HOP} .hdt-ngay { background: #059669; color: #fff; }
#${ID_HOP} .hdt-dong { background: #e5e7eb; color: #374151; }
#${ID_HOP} .hdt-bao { font-size: 12px; color: #374151; margin-right: auto; align-self: center; }
#${ID_NUT} { display: inline-flex; align-items: center; gap: 6px; border: 1px solid #c7d2fe;
  background: #eef2ff; color: #3730a3; border-radius: 8px; padding: 8px 13px;
  font-size: 13px; font-weight: 600; cursor: pointer; }
`;

const goiNen = async (tailieu, tin) => {
    const G = tailieu.defaultView || globalThis;
    const runtime = G.chrome && G.chrome.runtime;
    if (!runtime || !runtime.sendMessage) return null;
    try { return await runtime.sendMessage(tin); } catch (e) { return null; }
};

function chenKieu(tailieu) {
    if (tailieu.getElementById(ID_KIEU)) return;
    const s = tailieu.createElement('style');
    s.id = ID_KIEU;
    s.textContent = KIEU;
    (tailieu.head || tailieu.documentElement).appendChild(s);
}

/** Ngày giờ dễ đọc cho hạn thẻ. Không đọc được -> chuỗi rỗng. */
function gioDeDoc(moc) {
    const n = Number(moc);
    if (!Number.isFinite(n) || n <= 0) return '';
    try {
        return new Date(n).toLocaleString('vi-VN',
            { hour: '2-digit', minute: '2-digit', day: '2-digit',
              month: '2-digit', year: 'numeric' });
    } catch (e) { return ''; }
}

function thoat(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Mở hộp cài đặt.
 *
 * Danh sách khách lấy từ CÀI ĐẶT CỦA EXTENSION, không lấy từ bảng trên trang:
 * khoảng thời gian là hành vi của máy, phải đọc được cả khi không mở trình
 * duyệt, nên nó sống trong extension chứ không trong cơ sở dữ liệu Sell.
 */
async function moHop(tailieu) {
    chenKieu(tailieu);
    const cu = tailieu.getElementById(ID_HOP);
    if (cu) cu.remove();

    const c = await goiNen(tailieu, { loai: 'hdt-hoi-cai-dat' });
    // ⚠️ Khách nằm ở `henGio.khach`, không ở tầng ngoài — giống hệt
    // sell/chenCot.js dòng 938. Đọc nhầm là bảng luôn trống.
    const khach = (c && c.henGio && Array.isArray(c.henGio.khach)) ? c.henGio.khach : [];
    const tt = await goiNen(tailieu, { loai: 'hdt-tinh-trang-the' });
    // ⛔ Chỉ nhận TÌNH TRẠNG thẻ (mã khách + hạn). Phần nền không gửi chuỗi
    // thẻ sang đây, và giao diện cũng không được phép biết nó tồn tại.
    const tt2 = (tt && Array.isArray(tt.trangThaiThe)) ? tt.trangThaiThe : [];
    const theTheoMa = new Map(tt2.map(x => [String(x.maKH), x]));

    const hop = tailieu.createElement('div');
    hop.id = ID_HOP;
    hop.innerHTML = `
      <div class="hdt-khung" role="dialog" aria-label="Cài đặt Doanh thu Tendoo">
        <div class="hdt-dau">
          <div>
            <h3>Doanh thu Tendoo</h3>
            <p class="hdt-dong-chu">Đọc ngược từ Tendoo của từng khách — chỉ đọc, không phát hành hóa đơn nào.</p>
          </div>
          <button class="hdt-dong" data-viec="dong">Đóng</button>
        </div>
        <div class="hdt-than">
          <div class="hdt-mach">
            Máy đọc <b>TỔNG DOANH THU TRƯỚC THUẾ</b> của các hóa đơn <b>đã phát hành</b>
            trên Tendoo của khách, rồi ghi vào cột cạnh Doanh số.<br>
            Máy <b>tự đăng nhập Tendoo bằng tài khoản đã khai</b> để lấy số — không mở
            tab, không làm gián đoạn việc xuất hóa đơn. Khách nào chưa khai tài khoản,
            hoặc sai mật khẩu, thì cột sẽ ghi rõ lý do.
          </div>
          <table>
            <thead><tr>
              <th>Khách hàng</th><th>Đọc doanh thu</th>
              <th>Cách nhau (phút)</th><th>Thẻ ra vào</th>
            </tr></thead>
            <tbody>${khach.map((k) => {
                const ma = String(k.maKH || '');
                const t = theTheoMa.get(ma);
                const han = t && t.hetHanLuc ? gioDeDoc(t.hetHanLuc) : '';
                const oThe = (t && t.conDung)
                    ? `<span class="hdt-the co">còn hạn${han ? ' tới ' + thoat(han) : ''}</span>`
                    : '<span class="hdt-the khong">chưa có — sẽ tự đăng nhập khi lấy</span>';
                return `<tr data-ma="${thoat(ma)}">
                    <td>${thoat(k.tenKH || ma)}</td>
                    <td><input type="checkbox" data-o="bat" ${k.batDoanhThuTendoo ? 'checked' : ''}></td>
                    <td><input type="number" data-o="phut" min="15" max="10080"
                               value="${Number(k.phutLayLai) || 60}" title="Tối thiểu 15 phút"></td>
                    <td>${oThe}</td>
                  </tr>`;
            }).join('') || '<tr><td colspan="4">Chưa khai báo khách nào.</td></tr>'}</tbody>
          </table>
        </div>
        <div class="hdt-chan">
          <span class="hdt-bao" data-o="bao"></span>
          <button class="hdt-luu" data-viec="luu">Lưu</button>
        </div>
      </div>`;
    tailieu.body.appendChild(hop);

    const bao = (chu) => {
        const o = hop.querySelector('[data-o="bao"]');
        if (o) o.textContent = chu;
    };

    /**
     * Gom cài đặt từ bảng, GỘP vào bản đang lưu chứ không ghi đè khách.
     *
     * ⚠️ Tìm hàng bằng cách DUYỆT chứ không bằng bộ chọn CSS. Mã khách do
     * người dùng đặt, có thể chứa dấu nháy hay ký tự lạ làm vỡ bộ chọn — mà
     * vỡ ở đây nghĩa là bấm Lưu thì nổ, hoặc tệ hơn là lưu nhầm sang khách
     * khác. Duyệt vài chục hàng chẳng tốn gì.
     */
    const cacHang = () => Array.from(hop.querySelectorAll('tr[data-ma]'));
    const gomKhach = () => khach.map((k) => {
        const ma = String(k.maKH || '');
        const hang = cacHang().find(h => h.getAttribute('data-ma') === ma);
        if (!hang) return k;
        const bat = !!hang.querySelector('[data-o="bat"]').checked;
        const phut = hang.querySelector('[data-o="phut"]').value;
        // ⚠️ Giữ NGUYÊN mọi trường khác của khách. Gửi lên thiếu một trường là
        // chuanKhach() bên kia hiểu thành "người dùng bỏ trường đó" — tức là
        // tắt lịch xuất hóa đơn của khách mà không ai cố ý.
        return { ...k, batDoanhThuTendoo: bat, phutLayLai: phut };
    });

    hop.addEventListener('click', async (e) => {
        const nut = e.target.closest('[data-viec]');
        if (!nut) {
            if (e.target === hop) hop.remove();
            return;
        }
        const viec = nut.getAttribute('data-viec');
        if (viec === 'dong') { hop.remove(); return; }

        if (viec === 'luu') {
            bao('Đang lưu…');
            const tra = await goiNen(tailieu,
                { loai: 'hdt-dat-cai-dat', henGio: { khach: gomKhach() } });
            bao(tra && tra.ok
                ? 'Đã lưu. Bấm "Xem báo cáo" để lấy doanh thu Tendoo theo mốc đang chọn.'
                : 'Lưu không được.');
            return;
        }
    });
}

// ── "XEM BÁO CÁO" TỰ LẤY DOANH THU TENDOO KHỚP MỐC THỜI GIAN ────────────────
//
// Khi bấm "Xem báo cáo", đọc khoảng ngày đang chọn, tự quét Tendoo cho những
// ngày CÒN THIẾU trong khoảng (+ hôm nay), rồi làm mới bảng để cột khớp luôn.
//
// ⚠️ Content script ở "thế giới cô lập" — KHÔNG đọc được biến JS của trang, chỉ
// thấy DOM. Nên phải TỰ GỌI LẠI api/bang (cùng origin, kèm cookie phiên admin)
// để biết ngày nào đã có số, khỏi lấy lại ngày đã chốt.

let dangQuet = false;      // chống bấm dồn: đang quét thì bỏ qua bấm mới
let tuLamMoi = false;      // cờ: lần bấm "Xem báo cáo" này do MÌNH tạo để refresh

/** Liệt kê các ngày 'YYYY-MM-DD' trong [tu, den], dùng UTC nên không lệch múi giờ. */
function cacNgayTrong(tuISO, denISO) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tuISO) || !/^\d{4}-\d{2}-\d{2}$/.test(denISO)) return [];
    const b = Date.parse(tuISO + 'T00:00:00Z');
    const e = Date.parse(denISO + 'T00:00:00Z');
    if (!Number.isFinite(b) || !Number.isFinite(e) || e < b) return [];
    const ra = [];
    for (let t = b; t <= e && ra.length < 400; t += 86400000) {
        ra.push(new Date(t).toISOString().slice(0, 10));
    }
    return ra;
}

/** Dải báo nhỏ nổi ở góc — cho người dùng biết đang lấy / đã xong. */
function baoTrang(tailieu, chu, mau) {
    const ID = 'hdt-bao-quet';
    let o = tailieu.getElementById(ID);
    if (!chu) { if (o) o.remove(); return; }
    if (!o) {
        o = tailieu.createElement('div');
        o.id = ID;
        o.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483000;'
            + 'padding:10px 14px;border-radius:8px;font:600 13px system-ui,sans-serif;'
            + 'box-shadow:0 8px 24px rgba(0,0,0,.18);';
        tailieu.body.appendChild(o);
    }
    o.style.background = mau === 'xong' ? '#ecfdf5' : (mau === 'loi' ? '#fef2f2' : '#eef2ff');
    o.style.color = mau === 'xong' ? '#047857' : (mau === 'loi' ? '#b91c1c' : '#3730a3');
    o.textContent = chu;
}

/**
 * Đọc api/bang cùng origin để biết khoảng ngày máy chủ dùng và ngày đã có số.
 * Trả null nếu không đọc được (khỏi cản việc xem báo cáo bình thường).
 */
async function docBangTuServer(tailieu) {
    const G = tailieu.defaultView || globalThis;
    const $ = (id) => tailieu.getElementById(id);
    const ky = $('ktKy') ? $('ktKy').value : '';
    const thamSo = new URLSearchParams({ loai: ky || '' });
    if ($('ktTuNgay') && $('ktTuNgay').value) thamSo.set('tu_ngay', $('ktTuNgay').value);
    if ($('ktDenNgay') && $('ktDenNgay').value) thamSo.set('den_ngay', $('ktDenNgay').value);
    if ($('ktMotNgay') && $('ktMotNgay').value) thamSo.set('ngay', $('ktMotNgay').value);
    try {
        const goc = String(G.location.origin || '').replace(/\/+$/, '');
        const tra = await G.fetch(goc + '/ke-toan-tong-hop/api/bang?' + thamSo.toString(),
            { credentials: 'same-origin', headers: { 'Accept': 'application/json' } });
        if (!tra || !tra.ok) return null;
        return await tra.json();
    } catch (e) { return null; }
}

/**
 * Xử lý khi người dùng bấm "Xem báo cáo": quét Tendoo cho khoảng đang chọn.
 * Trang Sell tự vẽ bảng như thường; việc này chạy SONG SONG, xong thì làm mới.
 */
async function khiXemBaoCao(tailieu) {
    if (dangQuet) return;
    dangQuet = true;
    let canLamMoi = false;
    try {
        const c = await goiNen(tailieu, { loai: 'hdt-hoi-cai-dat' });
        const khach = (c && c.henGio && Array.isArray(c.henGio.khach)) ? c.henGio.khach : [];
        const maBat = khach.filter(k => k && k.batDoanhThuTendoo === true)
                           .map(k => String(k.maKH));
        if (!maBat.length) return;          // không ai bật -> không phải việc của mình

        const bang = await docBangTuServer(tailieu);
        if (!bang || !bang.thoi_gian) return;
        const tu = bang.thoi_gian.tu_ngay_iso;
        const den = bang.thoi_gian.den_ngay_iso;
        const dtt = bang.doanh_thu_tendoo || {};

        // Sell đánh số khách bằng khach_hang_id, extension bằng mã khách. Nối
        // hai bên qua danh sách khách đang hiện trên báo cáo.
        const idTheoMa = new Map();
        for (const k of (Array.isArray(bang.khach) ? bang.khach : [])) {
            if (k && k.ma_khach_hang) idTheoMa.set(String(k.ma_khach_hang), String(k.khach_hang_id));
        }
        // Chỉ khách VỪA BẬT VỪA ĐANG HIỆN: nút này phục vụ thứ anh đang nhìn.
        // Khách bị ẩn vẫn được quét nền định kỳ lo.
        const maQuet = maBat.filter(ma => idTheoMa.has(ma));
        if (!maQuet.length) return;

        // ⚠️ LỖI THẬT 02/10/2026 — bản trước dùng phép HỢP: bỏ qua một ngày nếu
        // BẤT KỲ khách nào đã có, trái hẳn với chú thích viết ngay trên nó. Hậu
        // quả: khách thiếu một ngày mà khách khác có rồi thì thiếu MÃI. Bài kiểm
        // khi ấy chỉ dùng một khách nên hợp với giao ra cùng kết quả, không bắt.
        //
        // Đúng phải là GIAO: chỉ bỏ qua một ngày khi MỌI khách đang quét đều đã
        // CHỐT ngày ấy. `ngay_da_co` từ Sell nay chỉ chứa ngày ĐÃ CHỐT (lấy sau
        // lúc ngày kết thúc), không chứa ngày lấy dở lúc còn đang diễn ra.
        const daChotCua = (ma) => {
            const t = dtt[idTheoMa.get(ma)];
            return new Set((t && Array.isArray(t.ngay_da_co)) ? t.ngay_da_co : []);
        };
        const chotTheoKhach = maQuet.map(daChotCua);
        const ngayThieu = cacNgayTrong(tu, den)
            .filter(ng => chotTheoKhach.some(tap => !tap.has(ng)));

        baoTrang(tailieu, 'Đang lấy doanh thu Tendoo…');
        const tra = await goiNen(tailieu, {
            loai: 'hdt-quet-tendoo-ngay',
            maKH: maQuet,
            ngayCanLay: ngayThieu,
            themHomNay: true,          // hôm nay luôn lấy lại, số trong ngày còn đổi
        });
        if (!tra || !tra.ok) { baoTrang(tailieu, 'Không lấy được doanh thu Tendoo.', 'loi'); return; }
        if (tra.boQua === 'DANG_XUAT_HOA_DON') {
            baoTrang(tailieu, 'Đang xuất hóa đơn — để lát nữa lấy, tránh chen ngang.', 'loi');
            return;
        }
        baoTrang(tailieu, 'Đã cập nhật doanh thu Tendoo.', 'xong');
        G_setTimeout(tailieu, () => baoTrang(tailieu, ''), 4000);
        canLamMoi = true;
    } finally {
        dangQuet = false;
    }

    // ⚠️ LÀM MỚI SAU `finally` — lúc dangQuet ĐÃ về false. Nhờ vậy hai lớp
    // chống vòng lặp có vai trò TÁCH BẠCH: `dangQuet` chặn bấm-dồn (hai lần
    // người dùng bấm nhanh), còn `tuLamMoi` chặn đúng lần bấm do MÌNH tạo ra
    // để refresh. Nếu làm mới trong try thì dangQuet che luôn cả hai, và một
    // lớp hỏng cũng không lộ.
    if (canLamMoi) {
        const nut = tailieu.getElementById('ktXem');
        if (nut) { tuLamMoi = true; nut.click(); }
    }
}

function G_setTimeout(tailieu, fn, ms) {
    const G = tailieu.defaultView || globalThis;
    (G.setTimeout || setTimeout)(fn, ms);
}

/** Gắn bắt nút "Xem báo cáo" — qua document nên sống sót khi trang vẽ lại. */
function ganXemBaoCao(tailieu) {
    if (tailieu.__hdtDaGanXem) return;
    tailieu.__hdtDaGanXem = true;
    tailieu.addEventListener('click', (e) => {
        const nut = e.target && e.target.closest && e.target.closest('#ktXem');
        if (!nut) return;
        if (tuLamMoi) { tuLamMoi = false; return; }   // lần bấm do mình -> bỏ qua
        // Không chặn hành vi gốc: để Sell vẽ bảng như thường, mình chạy song song.
        khiXemBaoCao(tailieu).catch(() => {});
    }, true);
}

/**
 * Chèn nút vào thanh công cụ.
 *
 * Bám vào nút "Xuất CSV" đang có — nếu Sell đổi giao diện và không còn nút ấy
 * thì THÔI, không chèn. Thà thiếu nút còn hơn nhét bừa vào chỗ làm vỡ bố cục.
 */
function chenNut(tailieu) {
    if (tailieu.getElementById(ID_NUT)) return false;
    const neo = Array.from(tailieu.querySelectorAll('button, a'))
        .find(e => /xuất csv/i.test((e.textContent || '').trim()));
    if (!neo || !neo.parentElement) return false;

    chenKieu(tailieu);
    const nut = tailieu.createElement('button');
    nut.id = ID_NUT;
    nut.type = 'button';
    nut.textContent = 'Doanh thu Tendoo';
    nut.title = 'Bật/tắt đọc doanh thu Tendoo cho từng khách, và lấy số ngay';
    nut.addEventListener('click', () => { moHop(tailieu).catch(() => {}); });
    neo.parentElement.insertBefore(nut, neo.nextSibling);
    return true;
}

/**
 * Gắn vào trang.
 *
 * Trang Kế toán vẽ lại bảng mỗi lần bấm "Xem báo cáo", nhưng thanh công cụ thì
 * đứng yên. Vẫn theo dõi DOM một lúc vì trang có thể chưa vẽ xong lúc mã này
 * chạy. Dừng hẳn sau khi chèn được — treo mãi một bộ theo dõi là phí.
 */
function gan(tailieu) {
    ganXemBaoCao(tailieu);      // bắt "Xem báo cáo" — không phụ thuộc nút của mình
    if (chenNut(tailieu)) return;
    const G = tailieu.defaultView || globalThis;
    if (!G.MutationObserver) return;
    const doi = new G.MutationObserver(() => {
        if (chenNut(tailieu)) doi.disconnect();
    });
    doi.observe(tailieu.documentElement, { childList: true, subtree: true });
    // ⚠️ Hạn lấy từ chung/nhipDo.js — MỌI con số thời gian của dự án nằm đúng
    // một chỗ. Viết cứng "20000" ngay đây là đúng cái thói quen mà file kia
    // sinh ra để dẹp. Không nạp được thì mới dùng số dự phòng.
    const han = (G.HDT_NhipDo && G.HDT_NhipDo.HAN_CHO_THANH_CONG_CU) || 20000;
    G.setTimeout(() => doi.disconnect(), han);
}

const API = { gan, chenNut, moHop, gioDeDoc, cacNgayTrong, khiXemBaoCao,
              ganXemBaoCao, ID_NUT, ID_HOP };

if (typeof module !== 'undefined' && module.exports) module.exports = API;
globalThis.HDT_ChenCotKeToan = API;

if (typeof document !== 'undefined' && typeof window !== 'undefined'
    && !(typeof module !== 'undefined' && module.exports)) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => gan(document));
    } else {
        gan(document);
    }
}

})();
