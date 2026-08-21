'use strict';

// ⚠️ TOÀN BỘ FILE NẰM TRONG MỘT PHẠM VI RIÊNG (hàm bọc ngoài).
// Chrome nạp nhiều file vào CÙNG MỘT phạm vi — hai file cùng khai `const API`
// là file thứ hai nổ ngay khi nạp, và KHÔNG có lỗi nào hiện ra cho người dùng:
// popup chỉ đơn giản trống trơn. Đã dính đúng lỗi này một lần. Bọc lại để không
// bao giờ dính nữa. Xuất ra ngoài qua globalThis.HDT_* ở cuối file.

(function () {

// ============================================================================
//  MÀN HÌNH KHAI BÁO TÀI KHOẢN TENDOO (trong popup)
//
//  Ba trạng thái:
//    1. CHƯA CÓ KHO   -> đặt khóa mở lần đầu
//    2. ĐANG KHÓA     -> nhập khóa mở để mở
//    3. ĐÃ MỞ         -> xem/thêm/sửa/xóa khai báo, đổi khóa mở, khóa lại
//
//  NGUYÊN TẮC KHÔNG ĐƯỢC PHÁ
//    - Mật khẩu KHÔNG BAO GIỜ được vẽ ra màn hình, kể cả dạng mã hóa.
//    - Khóa mở và mật khẩu chỉ nằm trong ô nhập, xóa ngay sau khi dùng.
//    - "Khóa lại" phải quét sạch mọi thứ nhạy cảm khỏi màn hình lẫn bộ nhớ.
//    - HAI KHÁCH KHÔNG ĐƯỢC TRỎ VỀ CÙNG MỘT CỬA HÀNG: nếu trùng thì chốt chặn
//      nhầm tài khoản mất tác dụng, và hóa đơn của khách này sẽ ra ở chỗ khách
//      kia. Đây là lỗi chặn, không phải cảnh báo.
//
//  Dùng textContent (không dùng innerHTML) cho mọi dữ liệu người dùng nhập —
//  tên khách hàng là dữ liệu ngoài, không được để nó thành mã chạy được.
// ============================================================================

function gan(goc, phuThuoc) {
    const { Kho, luuTru } = phuThuoc;
    const luuTruCuaHang = phuThuoc.luuTruCuaHang || null;   // "cửa hàng vừa thấy"
    // Bộ dọn/kiểm chuỗi mã cửa hàng. Không có thì lùi về mức tối thiểu để popup
    // vẫn chạy, nhưng khi đó KHÔNG kiểm được định dạng.
    const Sach = phuThuoc.GhiNhan || {
        lamSachMa: (x) => String(x == null ? '' : x).trim().replace(/^["']+|["']+$/g, '').trim(),
        laMaHopLe: () => true,
    };

    // Tải xuống và đọc tệp là việc của trình duyệt -> truyền từ ngoài vào để
    // test được bằng Node.
    const taiXuong = phuThuoc.taiXuong || null;
    const chonTep = phuThuoc.chonTep || null;
    // Khách vừa được bấm bên bảng báo cáo Sell -> điền sẵn mã + tên cho khỏi gõ.
    // Chỉ điền vào ô ĐANG TRỐNG: người dùng đã gõ gì thì không được đè lên.
    const dienSanKhach = phuThuoc.dienSanKhach || null;
    // Gửi tin cho tiến trình nền — dùng cho khối "gửi kết quả sang Sell".
    // Không có thì khối đó không hiện, màn khai báo vẫn chạy như cũ.
    const guiNen = phuThuoc.guiNen || null;

    let kho = null;          // đối tượng kho (có bản mã), đọc từ ổ đĩa
    let cuaHangVuaThay = null;   // { maCuaHang, tenCuaHang, luc } — chỉ để đối chiếu
    let dienSan = null;          // giá trị điền sẵn vào form sau khi vẽ lại
    let choXacNhan = null;       // bản sao đang chờ người dùng xác nhận ghi đè
    let choGoToken = false;      // đang hỏi xác nhận gỡ token
    let tepChoMatKhau = null;    // tệp có mật khẩu, đang chờ người dùng gõ
    let khoa = null;         // khóa AES — CHỈ trong bộ nhớ, không bao giờ ghi ra
    let baoLoi = '';
    let baoOk = '';
    let caiDatSell = null;   // { sellUrl, sellToken } — nơi gửi kết quả sang Sell
    let soChoGui = 0;        // số dòng chưa gửi được sang Sell
    let caiDatTg = null;     // { telegramDaCoToken, telegramChatId } — báo Telegram
    let baoTg = null;        // kết quả thao tác Telegram gần nhất, vẽ ngay tại khối
    let lanBaoTg = null;     // lần báo tự động gần nhất (để lộ ra lỗi im lặng)
    let baoSell = null;      // { chu, loi } — báo NGAY TRONG khối gửi sang Sell

    const tao = (the, lop, chu) => {
        const e = goc.ownerDocument.createElement(the);
        if (lop) e.className = lop;
        if (chu != null) e.textContent = chu;
        return e;
    };

    function oNhap(id, nhan, loai = 'text', gyChu = '') {
        const boc = tao('div', 'hdt-truong');
        const l = tao('label', null, nhan);
        l.setAttribute('for', id);
        const i = goc.ownerDocument.createElement('input');
        i.id = id;
        i.type = loai;
        if (gyChu) i.placeholder = gyChu;
        boc.appendChild(l);
        boc.appendChild(i);
        return boc;
    }

    const layO = (id) => goc.querySelector('#' + id);
    const layGiaTri = (id) => { const o = layO(id); return o ? o.value : ''; };
    const xoaO = (id) => { const o = layO(id); if (o) o.value = ''; };

    async function ghiKhoXuongDia() { await luuTru.ghi(kho); }

    // ─── Hành động ──────────────────────────────────────────────────────────

    /** Kho mới, chìa tự sinh. Không hỏi ai câu nào. */
    async function dungKhoMoi() {
        kho = await Kho.taoKho();
        const mo = await Kho.moKho(kho);
        khoa = mo.khoa;
        await ghiKhoXuongDia();
    }

    /** Xin khóa mở ĐÚNG MỘT LẦN CUỐI để chuyển kho cũ sang kho không khóa. */
    async function chuyenKhoCu(khoaMo) {
        baoLoi = ''; baoOk = '';
        const kq = await Kho.chuyenKhoCu(kho, khoaMo);
        if (!kq.ok) { baoLoi = kq.lyDo; return veLai(); }
        kho = kq.kho;
        const mo = await Kho.moKho(kho);
        khoa = mo.khoa;
        await ghiKhoXuongDia();
        baoOk = `Đã chuyển ${kq.soKhach} khai báo sang kho không khóa. `
            + 'Từ giờ không phải gõ khóa mở nữa.';
        return veLai();
    }

    /** Quên khóa mở cũ -> bỏ kho cũ, khai báo lại từ đầu. KHÔNG hoàn tác được. */
    async function boKhoCu() {
        baoLoi = ''; baoOk = '';
        const soCu = kho && kho.khach ? Object.keys(kho.khach).length : 0;
        await dungKhoMoi();
        baoOk = `Đã bỏ kho cũ (${soCu} khai báo). Hãy khai báo lại từng khách.`;
        return veLai();
    }

    async function themKhach({ maKH, maCuaHang, tenDangNhap, matKhau, ghiChu }) {
        baoLoi = ''; baoOk = '';
        if (!khoa) { baoLoi = 'Kho chưa sẵn sàng'; return veLai(); }

        const ma = String(maKH || '').trim();
        // Dọn dấu nháy + khoảng trắng TRƯỚC khi kiểm: copy từ Local Storage rất
        // hay dính dấu nháy, nhìn mắt thường không thấy khác gì.
        const cuaHang = Sach.lamSachMa(maCuaHang);

        if (cuaHang && !Sach.laMaHopLe(cuaHang)) {
            baoLoi = 'Mã cửa hàng không đúng dạng. Phải là 36 ký tự theo nhịp '
                + '8-4-4-4-12, ví dụ 2c683a17-09ab-4655-8dbf-50ca8105373c.';
            return veLai();
        }

        // ⚠️ DÙNG CHUNG CỬA HÀNG ĐƯỢC PHÉP (chủ dự án chốt 2026-08-15) — trước
        // đây chặn thẳng.
        //
        // Chặn cũ sinh ra để bắt lỗi GÕ NHẦM: dán nhầm mã cửa hàng của khách này
        // sang khách kia thì hóa đơn ra ở chỗ người khác. Nhưng nó không phân
        // biệt được "gõ nhầm" với "cố ý dùng chung", nên cấm luôn cả trường hợp
        // hợp lệ.
        //
        // Dùng chung KHÔNG làm hóa đơn ra nhầm chỗ: nếu hai khách chung một cửa
        // hàng Tendoo thì hóa đơn của cả hai vốn PHẢI ra ở đó. Phép so cửa hàng
        // trước mỗi khách vẫn đúng, chỉ là khớp sẵn nên khỏi đăng nhập lại.
        //
        // Vẫn NÓI RA, để gõ nhầm thì còn nhận ra được — chỉ khác là không cấm.
        const cungCuaHang = Kho.timCacKhachTheoCuaHang(kho, cuaHang).filter(k => k !== ma);

        try {
            await Kho.ghiKhach(kho, khoa, ma, { maCuaHang: cuaHang, tenDangNhap, matKhau, ghiChu });
            await ghiKhoXuongDia();
            baoOk = `Đã lưu khai báo cho "${ma}".`;
            // Nói ra việc dùng chung NGAY LÚC LƯU. Gõ nhầm mã cửa hàng thì đây
            // là chỗ duy nhất người dùng còn cơ hội nhận ra.
            if (cungCuaHang.length) {
                baoOk += ` ⚠ Cửa hàng này đang dùng chung với khách `
                    + `${cungCuaHang.join(', ')}. Hóa đơn của các khách này sẽ CÙNG ra ở `
                    + 'một cửa hàng Tendoo — nếu bạn dán nhầm mã cửa hàng thì sửa lại ngay.';
            }
            dienSan = null;
            ['kbMaKH', 'kbCuaHang', 'kbTenDangNhap', 'kbMatKhau', 'kbGhiChu'].forEach(xoaO);
        } catch (e) {
            baoLoi = e.message;
        }
        return veLai();
    }

    async function xoaKhach(maKH) {
        baoLoi = ''; baoOk = '';
        Kho.xoaKhach(kho, maKH);
        await ghiKhoXuongDia();
        baoOk = `Đã xóa khai báo của "${maKH}".`;
        return veLai();
    }

    /** Xuất bản sao. Không cần mở kho: file vẫn là bản mã. */
    /**
     * Xuất bản sao. `matKhauTep` bỏ trống cũng được.
     *
     * Đây là chỗ DUY NHẤT còn hỏi mật khẩu, và có lý do: kho trên đĩa nay mang
     * sẵn chìa bên trong, nên chép nguyên kho ra tệp = chép luôn mật khẩu đọc
     * được. Mà tệp thì đi USB, đi Zalo, lên Drive — rời khỏi cái máy này.
     */
    async function xuatBanSao(matKhauTep = '') {
        baoLoi = ''; baoOk = '';
        try {
            const chuoi = await Kho.taoBanSaoLuu(kho, matKhauTep);
            const ngay = new Date().toISOString().slice(0, 10);
            const ten = `khai-bao-tendoo-${ngay}.json`;
            if (taiXuong) taiXuong(ten, chuoi);
            baoOk = `Đã xuất ${Object.keys(kho.khach || {}).length} khai báo ra tệp "${ten}". `
                + (matKhauTep
                    ? 'Tệp được mã hóa bằng mật khẩu bạn vừa đặt — nhớ kỹ, mất là không mở được.'
                    : '⚠ Tệp KHÔNG có mật khẩu — ai cầm được cũng đọc được mật khẩu Tendoo '
                      + 'của mọi khách. Đừng gửi qua mạng, đừng để trên Drive.');
            xoaO('kbMatKhauTep');
            veLai();
            return chuoi;
        } catch (e) {
            baoLoi = e.message;
            veLai();
            return null;
        }
    }

    /**
     * Nhập bản sao. GHI ĐÈ TOÀN BỘ khai báo hiện có — nên phải xác nhận trước,
     * và sau khi nhập thì KHÓA LẠI: bản sao có khóa mở riêng của nó, khóa mở
     * đang dùng chưa chắc mở được.
     */
    async function nhapBanSao(chuoi, daXacNhan, matKhauTep = '') {
        baoLoi = ''; baoOk = '';
        const doc = await Kho.docBanSaoLuu(chuoi, matKhauTep);
        if (!doc.ok) {
            // Tệp có mật khẩu mà chưa nhập -> nhớ lại nội dung để hỏi, không bắt
            // người dùng chọn tệp lại từ đầu.
            if (doc.canMatKhau) tepChoMatKhau = chuoi;
            baoLoi = 'Không nhập được: ' + doc.lyDo;
            return veLai();
        }
        tepChoMatKhau = null;

        const soHienCo = kho && kho.khach ? Object.keys(kho.khach).length : 0;
        if (!daXacNhan && soHienCo > 0) {
            choXacNhan = { chuoi, matKhauTep, soMoi: doc.soKhach, soCu: soHienCo, luc: doc.luc };
            return veLai();
        }

        kho = doc.kho;
        choXacNhan = null;
        dienSan = null;
        // Bản sao cũ (bản 1) vẫn còn khóa mở -> màn hình sẽ hỏi chuyển đổi.
        const mo = await Kho.moKho(kho);
        khoa = mo.ok ? mo.khoa : null;
        await ghiKhoXuongDia();
        baoOk = `Đã nhập ${doc.soKhach} khai báo.`
            + (mo.ok ? '' : ' Bản sao này từ bản cũ — hãy chuyển đổi bên dưới.');
        return veLai();
    }

    // ─── Vẽ ─────────────────────────────────────────────────────────────────

    function veThongBao() {
        if (baoLoi) {
            const e = tao('div', 'hdt-loi', baoLoi);
            e.id = 'kbLoi';
            goc.appendChild(e);
        }
        if (baoOk) {
            const e = tao('div', 'hdt-ok', baoOk);
            e.id = 'kbOk';
            goc.appendChild(e);
        }
    }

    /**
     * KHO CŨ (bản 1) — còn mã hóa bằng khóa mở.
     *
     * Bỏ khóa mở đi mà không chuyển thì những khai báo cũ vĩnh viễn không đọc
     * được nữa. Xin khóa mở ĐÚNG MỘT LẦN CUỐI rồi thôi.
     */
    function veKhoCu() {
        const n = Object.keys(kho.khach || {}).length;
        const hop = tao('div', 'hdt-canh-do');
        hop.id = 'kbKhoCu';
        hop.appendChild(tao('div', null,
            `Kho cũ còn ${n} khai báo đang mã hóa bằng khóa mở. `
            + 'Nhập khóa mở ĐÚNG MỘT LẦN CUỐI để chuyển sang kho không khóa — '
            + 'từ sau không phải gõ gì nữa.'));
        goc.appendChild(hop);

        goc.appendChild(oNhap('kbKhoaMo', 'Khóa mở cũ', 'password'));
        const nut = tao('button', 'hdt-chinh', 'Chuyển sang kho không khóa');
        nut.id = 'kbChuyenKhoCu';
        nut.onclick = () => chuyenKhoCu(layGiaTri('kbKhoaMo'));
        goc.appendChild(nut);

        const hang = tao('div', 'hdt-cong-cu');
        const nutBo = tao('button', 'hdt-xoa', 'Quên khóa mở — bỏ kho cũ, khai báo lại');
        nutBo.id = 'kbBoKhoCu';
        nutBo.onclick = () => boKhoCu();
        hang.appendChild(nutBo);
        goc.appendChild(hang);
        goc.appendChild(tao('div', 'hdt-phu',
            `Bỏ kho cũ là MẤT HẢN ${n} khai báo đó, không hoàn tác được.`));
    }

    /**
     * Hộp "cửa hàng vừa thấy" — đối chiếu với khai báo đang có.
     * Đây là thứ DUY NHẤT kiểm chứng được rằng UUID bạn dán vào đúng là cửa
     * hàng của khách đó, chứ không phải copy nhầm lúc đang đăng nhập tài khoản
     * khác. Mắt thường không làm được việc này.
     */
    function veCuaHangVuaThay() {
        const hop = tao('div', 'hdt-vua-thay');
        hop.id = 'kbVuaThay';

        if (!cuaHangVuaThay || !cuaHangVuaThay.maCuaHang) {
            hop.classList.add('hdt-mo');
            hop.appendChild(tao('div', null, 'Chưa ghi nhận cửa hàng nào.'));
            hop.appendChild(tao('div', 'hdt-phu',
                'Mở trang bán hàng Tendoo bằng tài khoản của khách, rồi quay lại đây.'));
            goc.appendChild(hop);
            return;
        }

        // ⚠️ KỂ ĐỦ MỌI KHÁCH dùng cửa hàng này. Một cửa hàng nay gán được cho
        // nhiều khách; chỉ nêu một người là giấu mất những người còn lại, mà
        // "ai được nêu" lại phụ thuộc thứ tự lưu trong kho.
        const cacKhachDaGan = Kho.timCacKhachTheoCuaHang(kho, cuaHangVuaThay.maCuaHang);
        const tenHienThi = cuaHangVuaThay.tenCuaHang || '(không đọc được tên)';

        hop.appendChild(tao('div', 'hdt-nhan', 'Cửa hàng Tendoo bạn mở gần nhất'));
        hop.appendChild(tao('div', 'hdt-ten', tenHienThi));
        hop.appendChild(tao('div', 'hdt-phu', cuaHangVuaThay.maCuaHang));
        if (cuaHangVuaThay.luc) {
            hop.appendChild(tao('div', 'hdt-phu', 'Ghi nhận lúc: '
                + new Date(cuaHangVuaThay.luc).toLocaleString('vi-VN')));
        }

        if (cacKhachDaGan.length) {
            hop.classList.add('hdt-khop');
            const ds = Kho.danhSachKhach(kho);
            const keTen = (m) => {
                const bg = ds.find(k => k.maKH === m) || {};
                return `"${m}"${bg.ghiChu ? ' — ' + bg.ghiChu : ''}`;
            };
            hop.appendChild(tao('div', 'hdt-ket-luan',
                cacKhachDaGan.length === 1
                    ? `✓ Đã gán cho khách ${keTen(cacKhachDaGan[0])}`
                    : `✓ Đã gán cho ${cacKhachDaGan.length} khách: `
                        + cacKhachDaGan.map(keTen).join(' · ')));
        } else {
            hop.classList.add('hdt-chua-gan');
            hop.appendChild(tao('div', 'hdt-ket-luan', '⚠ Cửa hàng này CHƯA gán cho khách nào'));
            const nut = tao('button', null, 'Dùng để khai báo');
            nut.id = 'kbDungVuaThay';
            nut.onclick = () => {
                dienSan = {
                    maCuaHang: cuaHangVuaThay.maCuaHang,
                    ghiChu: cuaHangVuaThay.tenCuaHang || '',
                };
                baoLoi = ''; baoOk = 'Đã điền sẵn mã cửa hàng. Gõ nốt Mã KH và mật khẩu.';
                veLai();
            };
            hop.appendChild(nut);
        }
        goc.appendChild(hop);
    }

    function veDanhSach() {
        const ds = Kho.danhSachKhach(kho);
        const bang = tao('div', 'hdt-ds');
        bang.id = 'kbDanhSach';

        if (!ds.length) {
            bang.appendChild(tao('p', 'hdt-trong', 'Chưa khai báo khách nào.'));
        }
        for (const kh of ds) {
            const dong = tao('div', 'hdt-dong');
            dong.setAttribute('data-ma-kh', kh.maKH);
            const trai = tao('div');
            trai.appendChild(tao('b', null, kh.maKH));
            trai.appendChild(tao('div', 'hdt-phu', kh.ghiChu || ''));
            trai.appendChild(tao('div', 'hdt-phu', 'Cửa hàng: ' + kh.maCuaHang));
            if (kh.tenDangNhap) trai.appendChild(tao('div', 'hdt-phu', 'Đăng nhập: ' + kh.tenDangNhap));
            const nutXoa = tao('button', 'hdt-xoa', 'Xóa');
            nutXoa.setAttribute('data-xoa', kh.maKH);
            nutXoa.onclick = () => xoaKhach(kh.maKH);
            dong.appendChild(trai);
            dong.appendChild(nutXoa);
            bang.appendChild(dong);
        }
        goc.appendChild(bang);
    }

    function veFormThem() {
        const form = tao('div', 'hdt-form');
        form.appendChild(tao('h2', null, 'Thêm / sửa khai báo'));
        form.appendChild(oNhap('kbMaKH', 'Mã KH trong bongtom.store', 'text', 'PA'));
        form.appendChild(oNhap('kbCuaHang', 'Mã cửa hàng Tendoo', 'text', 'UUID lấy từ Tendoo'));
        if (dienSan) {
            const o = form.querySelector('#kbCuaHang');
            if (o) o.value = dienSan.maCuaHang || '';
        }
        form.appendChild(oNhap('kbTenDangNhap', 'Tên đăng nhập Tendoo', 'text'));
        form.appendChild(oNhap('kbMatKhau', 'Mật khẩu Tendoo', 'password'));
        form.appendChild(oNhap('kbGhiChu', 'Ghi chú', 'text', 'Phương Anh'));
        if (dienSan && dienSan.ghiChu) {
            const o = form.querySelector('#kbGhiChu');
            if (o) o.value = dienSan.ghiChu;
        }
        if (dienSanKhach) {
            const oMa = form.querySelector('#kbMaKH');
            if (oMa && !oMa.value) oMa.value = dienSanKhach.maKH || '';
            const oGc = form.querySelector('#kbGhiChu');
            if (oGc && !oGc.value) oGc.value = dienSanKhach.ghiChu || '';
            // Đã biết khai báo cũ của khách này thì mở sẵn để sửa, khỏi gõ lại
            // mã cửa hàng — nhưng KHÔNG bao giờ điền lại mật khẩu.
            const cu = (kho && kho.khach) ? kho.khach[dienSanKhach.maKH] : null;
            const oCh = form.querySelector('#kbCuaHang');
            const oTdn = form.querySelector('#kbTenDangNhap');
            if (cu && oCh && !oCh.value) oCh.value = cu.maCuaHang || '';
            if (cu && oTdn && !oTdn.value) oTdn.value = cu.tenDangNhap || '';
            if (cu && oGc && !oGc.value) oGc.value = cu.ghiChu || '';
        }
        const nut = tao('button', 'hdt-chinh', 'Lưu khai báo');
        nut.id = 'kbLuu';
        nut.onclick = () => themKhach({
            maKH: layGiaTri('kbMaKH'), maCuaHang: layGiaTri('kbCuaHang'),
            tenDangNhap: layGiaTri('kbTenDangNhap'), matKhau: layGiaTri('kbMatKhau'),
            ghiChu: layGiaTri('kbGhiChu'),
        });
        form.appendChild(nut);
        goc.appendChild(form);
    }

    /** Khối SAO LƯU — xuất ra tệp, nhập lại từ tệp. */
    function veSaoLuu() {
        const khoi = tao('div', 'hdt-sao-luu');
        khoi.id = 'kbSaoLuu';
        khoi.appendChild(tao('div', 'hdt-nhan', 'Sao lưu khai báo'));

        if (choXacNhan) {
            // Ghi đè là việc KHÔNG hoàn tác được -> bắt xác nhận, và nói rõ mất gì.
            const canh = tao('div', 'hdt-canh-do');
            canh.id = 'kbXacNhanNhap';
            canh.appendChild(tao('div', null,
                `Tệp có ${choXacNhan.soMoi} khai báo. Máy này đang có ${choXacNhan.soCu}. `
                + 'Nhập vào sẽ XÓA HẾT khai báo hiện tại và thay bằng tệp.'));
            const hang = tao('div', 'hdt-cong-cu');
            const nutOk = tao('button', null, 'Vẫn nhập, ghi đè');
            nutOk.id = 'kbNhapXacNhan';
            nutOk.onclick = () => nhapBanSao(choXacNhan.chuoi, true, choXacNhan.matKhauTep || '');
            const nutHuy = tao('button', null, 'Hủy');
            nutHuy.id = 'kbNhapHuy';
            nutHuy.onclick = () => { choXacNhan = null; veLai(); };
            hang.appendChild(nutOk); hang.appendChild(nutHuy);
            canh.appendChild(hang);
            khoi.appendChild(canh);
            goc.appendChild(khoi);
            return;
        }

        // Tệp đang chờ mật khẩu: hỏi ngay tại chỗ, khỏi bắt chọn tệp lại từ đầu.
        if (tepChoMatKhau) {
            const hop = tao('div', 'hdt-canh-do');
            hop.id = 'kbHoiMatKhauTep';
            hop.appendChild(tao('div', null, 'Tệp này có mật khẩu. Nhập mật khẩu của tệp:'));
            khoi.appendChild(hop);
            khoi.appendChild(oNhap('kbMatKhauTepNhap', 'Mật khẩu của tệp', 'password'));
            const hangMk = tao('div', 'hdt-cong-cu');
            const nutMo = tao('button', 'hdt-chinh', 'Mở tệp');
            nutMo.id = 'kbMoTep';
            nutMo.onclick = () => {
                const tep = tepChoMatKhau;
                const mk = layGiaTri('kbMatKhauTepNhap');
                tepChoMatKhau = null;
                return nhapBanSao(tep, false, mk);
            };
            const nutBo = tao('button', null, 'Thôi');
            nutBo.id = 'kbBoTep';
            nutBo.onclick = () => { tepChoMatKhau = null; veLai(); };
            hangMk.appendChild(nutMo); hangMk.appendChild(nutBo);
            khoi.appendChild(hangMk);
            goc.appendChild(khoi);
            return;
        }

        // Mật khẩu cho tệp là TÙY CHỌN — bỏ trống thì tệp đọc được bằng tay không.
        khoi.appendChild(oNhap('kbMatKhauTep', 'Mật khẩu cho tệp (bỏ trống cũng được)', 'password'));

        const hang = tao('div', 'hdt-cong-cu');
        const nutXuat = tao('button', null, 'Xuất bản sao');
        nutXuat.id = 'kbXuatBanSao';
        nutXuat.onclick = () => xuatBanSao(layGiaTri('kbMatKhauTep'));
        hang.appendChild(nutXuat);

        const nutNhap = tao('button', null, 'Nhập bản sao');
        nutNhap.id = 'kbNhapBanSao';
        nutNhap.onclick = async () => {
            if (!chonTep) { baoLoi = 'Không mở được hộp chọn tệp'; return veLai(); }
            const noiDung = await chonTep();
            if (noiDung == null) return;            // người dùng bấm Hủy
            await nhapBanSao(noiDung, false);
        };
        hang.appendChild(nutNhap);
        khoi.appendChild(hang);

        khoi.appendChild(tao('div', 'hdt-phu',
            'Đặt mật khẩu thì tệp được mã hóa, chỉ mở được bằng đúng mật khẩu đó. '
            + 'Bỏ trống thì tệp đọc được bằng tay không — đừng gửi qua mạng.'));
        goc.appendChild(khoi);
    }

    /**
     * Khối GỬI KẾT QUẢ SANG SELL — cho trang "Kế toán tổng hợp".
     *
     * Đặt ở ĐÂY chứ không ở popup: popup có chốt cứng "không được có bất kỳ ô
     * nhập chữ/mật khẩu nào" (test/popupTichHop.test.js), mà token là bí mật.
     * Màn khai báo này vốn đã là CHỖ DUY NHẤT nhập bí mật — giữ đúng một chỗ
     * thì người dùng không phải nhớ hai nơi.
     *
     * ⛔ KHÔNG BAO GIỜ vẽ token đã lưu ra màn hình. Ô trống = giữ nguyên cái cũ,
     * đúng cách đang làm với mật khẩu Tendoo.
     */
    function veGuiSell() {
        if (!guiNen) return;                   // không nối được nền thì thôi
        const c = caiDatSell || { sellUrl: '', sellToken: '' };

        const khoi = tao('div', 'hdt-sao-luu');
        khoi.id = 'kbGuiSell';
        khoi.appendChild(tao('div', 'hdt-nhan', 'Gửi kết quả sang bongtom.store (kế toán tổng hợp)'));
        // ⚠️ CHỮ NÀY PHẢI ĐÚNG VỚI BẢN 2.15.0. Trước đó token chỉ là lối phụ để
        // GHI, có hay không cũng gần như nhau. Từ 2.15.0 token còn là đường
        // CHÍNH để ĐỌC doanh thu: khai rồi thì máy không đọc trang báo cáo nữa,
        // và đó là thứ duy nhất giúp máy chạy khi chưa đăng nhập Sell. Để nguyên
        // câu cũ là nói dối người dùng ngay trên màn hình.
        khoi.appendChild(tao('div', 'hdt-dan',
            'Sau mỗi lần chạy, máy ghi kết quả vào trang Kế toán tổng hợp bên bongtom.store — '
            + 'đã ra hóa đơn thì ghi, CHƯA ra cũng ghi kèm lý do.'));
        khoi.appendChild(tao('div', 'hdt-dan',
            'Khai token thì máy ĐỌC DOANH THU thẳng từ bongtom.store, nên chạy được cả khi bạn '
            + 'CHƯA ĐĂNG NHẬP hoặc đã đăng xuất — và khi đó máy không đọc trang báo cáo nữa. '
            + 'Chưa khai cũng được: máy đọc trang báo cáo và ghi qua chính tab bongtom.store bạn đang '
            + 'đăng nhập, nhưng phải còn đăng nhập thì mới chạy.'));

        // ⚠️ TRẠNG THÁI HIỆN TẠI, ngay khi mở — chưa cần bấm gì.
        // Trước đây không có dòng này: bấm Lưu xong không thấy gì, mà cũng không
        // biết đang thiếu địa chỉ hay thiếu token.
        const tt = tao('div', 'hdt-dan');
        tt.id = 'kbSellTrangThai';
        if (c.sellUrl && c.sellToken) {
            tt.textContent = `✓ Đã nối với ${c.sellUrl} · token đã lưu. `
                + 'Máy đọc doanh thu thẳng từ bongtom.store, chạy được cả khi bạn chưa đăng nhập.';
        } else if (!c.sellUrl && !c.sellToken) {
            tt.textContent = 'Chưa nối — máy đọc trang báo cáo và ghi qua tab bongtom.store, '
                + 'nên PHẢI còn đăng nhập thì mới chạy.';
        } else {
            tt.textContent = c.sellUrl
                ? `⚠ Chưa nối được — đã có địa chỉ (${c.sellUrl}) nhưng CHƯA CÓ TOKEN.`
                : '⚠ Chưa nối được — đã có token nhưng CHƯA ĐIỀN ĐỊA CHỈ SELL.';
            tt.style.color = '#b45309';
        }
        khoi.appendChild(tt);

        // ⚠️ HỎI TRƯỚC KHI GỠ. Gỡ token đổi hẳn cách máy lấy số (thôi đọc thẳng
        // từ Sell, quay về đọc trang báo cáo) và làm máy chết hẳn khi bạn đăng
        // xuất. Bấm nhầm một cái mà mất luôn khả năng đó thì quá đắt.
        if (choGoToken) {
            const canh = tao('div', 'hdt-canh-do');
            canh.id = 'kbXacNhanGoToken';
            canh.appendChild(tao('div', null,
                'Gỡ token thì máy KHÔNG đọc được doanh thu khi bạn chưa đăng nhập bongtom.store nữa, '
                + 'và hẹn giờ sẽ quay về đọc trang báo cáo (phải còn đăng nhập). '
                + 'Địa chỉ bongtom.store vẫn giữ lại.'));
            const hangX = tao('div', 'hdt-cong-cu');
            const nutOk = tao('button', null, 'Vẫn gỡ token');
            nutOk.id = 'kbGoTokenXacNhan';
            nutOk.onclick = () => goToken();
            const nutHuy = tao('button', null, 'Hủy');
            nutHuy.id = 'kbGoTokenHuy';
            nutHuy.onclick = () => { choGoToken = false; return veLai(); };
            hangX.appendChild(nutOk); hangX.appendChild(nutHuy);
            canh.appendChild(hangX);
            khoi.appendChild(canh);
        }

        khoi.appendChild(oNhap('kbSellUrl', 'Địa chỉ bongtom.store',
            'text', 'Ví dụ: http://127.0.0.1:8000'));
        khoi.appendChild(oNhap('kbSellToken', 'Token',
            'password', c.sellToken ? '(đã lưu — gõ để đổi)' : 'Dán token từ .env của bongtom.store'));

        const hang = tao('div', 'hdt-cong-cu');
        const nut = tao('button', 'hdt-chinh', 'Lưu nơi gửi');
        nut.id = 'kbLuuSell';
        nut.onclick = () => luuNoiGui();
        hang.appendChild(nut);

        const nutThu = tao('button', null, 'Thử kết nối');
        nutThu.id = 'kbThuKetNoi';
        nutThu.onclick = () => thuKetNoi();
        hang.appendChild(nutThu);

        // ⚠️ CHỈ HIỆN KHI ĐANG CÓ TOKEN. Ô token là loại password nên mở lại
        // không hiện token cũ, và bấm Lưu với ô trống thì GIỮ NGUYÊN token (cố
        // ý, kẻo mỗi lần lưu là mất). Hệ quả: không có nút này thì token đã lưu
        // là vĩnh viễn, không đường nào gỡ.
        if (c.sellToken) {
            const nutGo = tao('button', null, 'Gỡ token');
            nutGo.id = 'kbGoToken';
            nutGo.onclick = () => { choGoToken = true; return veLai(); };
            hang.appendChild(nutGo);
        }

        // ⚠️ ĐANG CHỜ GỬI — con số cho biết Sell có đang thiếu số hay không.
        if (soChoGui > 0) {
            const nutLai = tao('button', null, `Gửi lại ${soChoGui} dòng chưa gửi`);
            nutLai.id = 'kbGuiLaiSell';
            nutLai.onclick = () => guiLaiSell();
            hang.appendChild(nutLai);
        }
        khoi.appendChild(hang);

        // ⚠️ BÁO KẾT QUẢ NGAY TẠI ĐÂY, không dùng chỗ báo chung ở ĐẦU màn hình.
        // Khối này nằm CUỐI màn; bấm Lưu trong lúc đang cuộn ở cuối thì thông báo
        // trên đầu nằm ngoài tầm nhìn — người dùng tưởng nút không ăn. Đã gặp
        // thật ngày 2026-08-14.
        const bao = tao('div', 'hdt-dan');
        bao.id = 'kbSellBao';
        if (baoSell) {
            bao.textContent = baoSell.chu;
            bao.style.color = baoSell.loi ? '#b91c1c' : '#15803d';
            bao.style.fontWeight = '600';
        }
        khoi.appendChild(bao);

        const chu = tao('div', 'hdt-dan', soChoGui > 0
            ? `⚠ Còn ${soChoGui} dòng CHƯA gửi được sang bongtom.store — trang kế toán đang `
              + 'thiếu ngần đó. Máy sẽ tự gửi bù ở lần chạy sau, hoặc bấm nút trên.'
            : 'Không còn dòng nào đang chờ gửi.');
        chu.id = 'kbSoChoGui';
        if (soChoGui > 0) chu.style.color = '#b91c1c';
        khoi.appendChild(chu);

        goc.appendChild(khoi);

        // Điền SAU khi đã gắn vào cây, để `layO` tìm thấy.
        const oUrl = layO('kbSellUrl');
        if (oUrl) oUrl.value = c.sellUrl || '';
    }

    // ── BÁO VỀ TELEGRAM ────────────────────────────────────────────────────
    //
    // Chủ dự án chốt 2026-08-20: BOT RIÊNG, chat riêng, chỉ báo thành công.
    //
    // ⚠️ RỦI RO LỚN NHẤT CỦA TÍNH NĂNG NÀY LÀ HỎNG TRONG IM LẶNG: sai token hay
    // sai chat id thì người dùng không nhận được gì mà cũng không biết vì sao,
    // và cứ tưởng hóa đơn chưa ra. Nên khối này BẮT BUỘC phải có ba thứ: nút
    // gửi thử, dòng trạng thái lần báo gần nhất, và nút dò chat id.
    function veBaoTelegram() {
        if (!guiNen) return;
        const c = caiDatTg || { telegramDaCoToken: false, telegramChatId: '' };
        const daDu = c.telegramDaCoToken && c.telegramChatId;

        const khoi = tao('div', 'hdt-sao-luu');
        khoi.id = 'kbTelegram';
        khoi.appendChild(tao('div', 'hdt-nhan', 'Báo về Telegram khi xuất hóa đơn xong'));
        khoi.appendChild(tao('div', 'hdt-dan',
            'Mỗi khi một khách xuất hóa đơn xong, máy nhắn cho bạn tên khách, số tiền, '
            + 'ngày số liệu và giờ xuất. CHỈ báo khi hóa đơn ĐÃ RA THẬT — bỏ vào giỏ mà '
            + 'chưa bấm thì không báo.'));
        khoi.appendChild(tao('div', 'hdt-dan',
            'Cần một bot RIÊNG: mở @BotFather trên Telegram, gõ /newbot, lấy token. '
            + 'Rồi NHẮN CHO BOT một câu bất kỳ (bot không nhắn trước cho người lạ được) '
            + 'và bấm "Dò chat id".'));

        const tt = tao('div', 'hdt-dan');
        tt.id = 'kbTgTrangThai';
        if (daDu) {
            tt.textContent = `✓ Đã nối — token đã lưu · chat id ${c.telegramChatId}.`;
        } else if (!c.telegramDaCoToken && !c.telegramChatId) {
            tt.textContent = 'Chưa bật — để trống thì máy không nhắn gì cả.';
        } else {
            tt.textContent = c.telegramDaCoToken
                ? '⚠ Đã có token nhưng CHƯA CÓ CHAT ID — chưa nhắn được.'
                : '⚠ Đã có chat id nhưng CHƯA CÓ TOKEN — chưa nhắn được.';
            tt.style.color = '#b45309';
        }
        khoi.appendChild(tt);

        // ⚠️ LẦN BÁO TỰ ĐỘNG GẦN NHẤT. Đây là thứ duy nhất lộ ra được lỗi im
        // lặng: gửi thử thành công không có nghĩa là đường tự động đang chạy.
        if (lanBaoTg) {
            const l = tao('div', 'hdt-dan');
            l.id = 'kbTgLanCuoi';
            if (Number(lanBaoTg.hong) > 0) {
                l.textContent = '✗ Lần báo gần nhất HỎNG: '
                    + (lanBaoTg.thongBao || lanBaoTg.ma || 'không rõ');
                l.style.color = '#b91c1c';
                l.style.fontWeight = '600';
            } else if (Number(lanBaoTg.daGui) > 0) {
                l.textContent = `✓ Lần báo gần nhất: đã nhắn ${lanBaoTg.daGui} tin.`;
                l.style.color = '#15803d';
            }
            khoi.appendChild(l);
        }

        khoi.appendChild(oNhap('kbTgToken', 'Token bot Telegram', 'password',
            c.telegramDaCoToken ? '(đã lưu — gõ để đổi)' : 'Dán token từ @BotFather'));
        khoi.appendChild(oNhap('kbTgChatId', 'Chat id', 'text',
            'Bấm "Dò chat id" là máy tự điền'));

        const hang = tao('div', 'hdt-cong-cu');
        const nutLuu = tao('button', 'hdt-chinh', 'Lưu');
        nutLuu.id = 'kbTgLuu';
        nutLuu.onclick = () => luuTelegram();
        hang.appendChild(nutLuu);

        const nutDo = tao('button', null, 'Dò chat id');
        nutDo.id = 'kbTgDoChatId';
        nutDo.onclick = () => doChatId();
        hang.appendChild(nutDo);

        const nutThu = tao('button', null, 'Gửi thử');
        nutThu.id = 'kbTgGuiThu';
        nutThu.onclick = () => guiThuTelegram();
        hang.appendChild(nutThu);

        // ⚠️ Cùng lý do với nút "Gỡ token" của khối Sell: ô token là loại
        // password nên bấm Lưu với ô trống thì GIỮ NGUYÊN cái cũ. Không có nút
        // này thì token đã lưu là vĩnh viễn, không đường nào tắt.
        if (c.telegramDaCoToken || c.telegramChatId) {
            const nutTat = tao('button', null, 'Tắt báo Telegram');
            nutTat.id = 'kbTgTat';
            nutTat.onclick = () => tatTelegram();
            hang.appendChild(nutTat);
        }
        khoi.appendChild(hang);

        const bao = tao('div', 'hdt-dan');
        bao.id = 'kbTgBao';
        if (baoTg) {
            bao.textContent = baoTg.chu;
            bao.style.color = baoTg.loi ? '#b91c1c' : '#15803d';
            bao.style.fontWeight = '600';
        }
        khoi.appendChild(bao);
        goc.appendChild(khoi);

        const oChat = layO('kbTgChatId');
        if (oChat) oChat.value = c.telegramChatId || '';
    }

    async function luuTelegram() {
        const tin = { loai: 'hdt-dat-cai-dat', telegramChatId: layGiaTri('kbTgChatId') };
        // Ô token TRỐNG -> giữ nguyên token cũ, không xoá mất.
        const tk = layGiaTri('kbTgToken');
        if (String(tk || '').trim() !== '') tin.telegramToken = tk;

        const tra = await guiNen(tin);
        if (tra && tra.ok) {
            caiDatTg = { telegramDaCoToken: !!tra.telegramDaCoToken,
                         telegramChatId: tra.telegramChatId || '' };
            baoTg = caiDatTg.telegramDaCoToken && caiDatTg.telegramChatId
                ? { chu: '✓ Đã lưu. Bấm "Gửi thử" để chắc chắn nhắn được.', loi: false }
                : { chu: caiDatTg.telegramDaCoToken
                        ? '⚠ Đã lưu token nhưng CHƯA CÓ CHAT ID.'
                        : '⚠ Đã lưu chat id nhưng CHƯA CÓ TOKEN.', loi: true };
        } else {
            baoTg = { chu: '✗ Không lưu được.', loi: true };
        }
        return veLai();
    }

    async function tatTelegram() {
        const tra = await guiNen({ loai: 'hdt-dat-cai-dat', xoaTelegram: true });
        if (tra && tra.ok) {
            caiDatTg = { telegramDaCoToken: false, telegramChatId: '' };
            baoTg = { chu: '✓ Đã tắt — máy không nhắn Telegram nữa.', loi: false };
        } else {
            baoTg = { chu: '✗ Không tắt được.', loi: true };
        }
        return veLai();
    }

    async function doChatId() {
        baoTg = { chu: 'Đang dò…', loi: false };
        veLai();
        const kq = await guiNen({ loai: 'hdt-telegram-do-chat-id' });
        if (kq && kq.ok && kq.chatId) {
            const o = layO('kbTgChatId');
            if (o) o.value = kq.chatId;
            baoTg = { chu: `✓ Thấy chat id ${kq.chatId}${kq.ten ? ' (' + kq.ten + ')' : ''}. `
                + 'Bấm Lưu để dùng.', loi: false };
            // Điền lại SAU khi vẽ, vì veLai() dựng lại cả màn hình.
            const chatMoi = kq.chatId;
            veLai();
            const o2 = layO('kbTgChatId');
            if (o2) o2.value = chatMoi;
            return goc;
        }
        baoTg = { chu: '✗ Không dò được: '
            + ((kq && (kq.thongBao || kq.ma)) || 'không rõ'), loi: true };
        return veLai();
    }

    async function guiThuTelegram() {
        baoTg = { chu: 'Đang gửi…', loi: false };
        veLai();
        const kq = await guiNen({ loai: 'hdt-telegram-gui-thu' });
        baoTg = kq && kq.ok
            ? { chu: '✓ Đã gửi — mở Telegram xem có tin chưa.', loi: false }
            : { chu: '✗ Chưa gửi được: '
                + ((kq && (kq.thongBao || kq.ma)) || 'không rõ'), loi: true };
        return veLai();
    }

    /**
     * Thử kết nối: gửi một gói RỖNG rồi báo thẳng máy chủ trả lời thế nào.
     *
     * Biết ngay trong một giây, thay vì phải chạy hẳn một lượt hóa đơn thật mới
     * biết token có đúng không.
     */
    async function thuKetNoi() {
        baoSell = { chu: 'Đang thử…', loi: false };
        veLai();
        const kq = await guiNen({ loai: 'hdt-thu-ket-noi-sell' });
        if (kq && kq.ok) {
            baoSell = { chu: `✓ Kết nối được — ${kq.duong === 'TAB_SELL'
                ? 'ghi qua tab bongtom.store đang đăng nhập (không cần token)'
                : 'qua token'}.`, loi: false };
        } else {
            baoSell = { chu: '✗ Chưa kết nối được: '
                + ((kq && (kq.thongBao || kq.boQua)) || 'không rõ'), loi: true };
        }
        return veLai();
    }

    async function guiLaiSell() {
        const kq = await guiNen({ loai: 'hdt-gui-lai-sell' });
        if (kq && kq.ok) {
            soChoGui = Number(kq.conLai) || 0;
            baoSell = { chu: `✓ Đã gửi ${Number(kq.daGui) || 0} dòng sang bongtom.store.`, loi: false };
        } else {
            soChoGui = (kq && Number(kq.conLai)) || soChoGui;
            baoSell = { chu: '✗ Vẫn chưa gửi được: '
                + ((kq && (kq.thongBao || kq.boQua)) || 'không rõ')
                + ' — các dòng vẫn được giữ lại, không mất.', loi: true };
        }
        return veLai();
    }

    /**
     * GỠ TOKEN — gửi chuỗi RỖNG để kho xoá thật.
     *
     * ⚠️ Phải gửi tường minh `sellToken: ''`. `luuNoiGui` cố ý KHÔNG gửi khoá
     * này khi ô trống (để bấm Lưu không làm mất token), nên nếu không có đường
     * riêng này thì token đã lưu là vĩnh viễn.
     *
     * ⚠️ GIỮ LẠI ĐỊA CHỈ SELL. Địa chỉ không phải bí mật; xoá luôn thì lần sau
     * khai lại phải gõ cả hai. Muốn xoá địa chỉ thì xoá ô rồi bấm Lưu — vốn đã
     * làm được từ trước.
     */
    async function goToken() {
        const tra = await guiNen({ loai: 'hdt-dat-cai-dat', sellToken: '' });
        choGoToken = false;
        if (tra && tra.ok) {
            caiDatSell = { sellUrl: tra.sellUrl || '', sellToken: tra.sellToken || '' };
            baoSell = caiDatSell.sellToken
                ? { chu: '✗ Gỡ không thành công — token vẫn còn trong máy.', loi: true }
                : { chu: '✓ Đã gỡ token. Máy quay về đọc trang báo cáo và ghi qua tab bongtom.store — '
                        + 'phải còn đăng nhập thì mới chạy.', loi: false };
        } else {
            baoSell = { chu: '✗ Không gỡ được token.', loi: true };
        }
        return veLai();
    }

    async function luuNoiGui() {
        const tin = { loai: 'hdt-dat-cai-dat', sellUrl: layGiaTri('kbSellUrl') };
        // Ô token TRỐNG -> giữ nguyên token cũ, không xoá mất.
        const tk = layGiaTri('kbSellToken');
        if (String(tk || '').trim() !== '') tin.sellToken = tk;

        const tra = await guiNen(tin);
        if (tra && tra.ok) {
            caiDatSell = { sellUrl: tra.sellUrl || '', sellToken: tra.sellToken || '' };
            // Nói ĐÚNG cái còn thiếu, đừng nói chung chung "thiếu địa chỉ hoặc token".
            if (caiDatSell.sellUrl && caiDatSell.sellToken) {
                baoSell = { chu: `✓ Đã lưu. Lối phụ gửi về ${caiDatSell.sellUrl}.`, loi: false };
            } else if (!caiDatSell.sellUrl && !caiDatSell.sellToken) {
                baoSell = { chu: '✓ Đã xoá lối phụ. Máy vẫn ghi qua tab bongtom.store đang đăng nhập.',
                            loi: false };
            } else {
                baoSell = { chu: caiDatSell.sellUrl
                    ? '⚠ Đã lưu địa chỉ nhưng CHƯA CÓ TOKEN — lối phụ chưa dùng được.'
                    : '⚠ Đã lưu token nhưng CHƯA ĐIỀN ĐỊA CHỈ SELL — lối phụ chưa dùng được.',
                    loi: true };
            }
        } else {
            baoSell = { chu: '✗ Không lưu được nơi gửi.', loi: true };
        }
        return veLai();
    }

    function veLai() {
        goc.textContent = '';                  // xóa sạch màn hình cũ
        veThongBao();
        if (kho && Kho.laKhoCu(kho)) veKhoCu();
        else { veCuaHangVuaThay(); veDanhSach(); veFormThem(); veSaoLuu(); veGuiSell();
               veBaoTelegram(); }
        return goc;
    }

    async function nap() {
        kho = await luuTru.doc();
        khoa = null;
        // Đọc nơi gửi sang Sell. Hỏng thì để rỗng — không được chặn màn khai báo.
        if (guiNen) {
            try {
                const c = await guiNen({ loai: 'hdt-hoi-cai-dat' });
                caiDatSell = { sellUrl: (c && c.sellUrl) || '',
                               sellToken: (c && c.sellToken) || '' };
                // ⚠️ Nền KHÔNG trả token Telegram (xem cheTokenTelegram trong
                // background.js) — chỉ trả cờ "đã có". Đủ dùng: ô token là loại
                // password, không bao giờ vẽ lại giá trị cũ.
                caiDatTg = { telegramDaCoToken: !!(c && c.telegramDaCoToken),
                             telegramChatId: (c && c.telegramChatId) || '' };
            } catch (e) {
                caiDatSell = { sellUrl: '', sellToken: '' };
                caiDatTg = { telegramDaCoToken: false, telegramChatId: '' };
            }
            try {
                const t = await guiNen({ loai: 'hdt-telegram-trang-thai' });
                lanBaoTg = (t && t.ketQua) || null;
            } catch (e) { lanBaoTg = null; }
            try {
                const n = await guiNen({ loai: 'hdt-so-cho-gui-sell' });
                soChoGui = (n && Number(n.soCho)) || 0;
            } catch (e) { soChoGui = 0; }
        }
        dienSan = null;
        choGoToken = false;      // mở lại màn thì bỏ câu hỏi đang treo
        cuaHangVuaThay = null;
        // KHÔNG CÒN KHÓA MỞ: chưa có kho thì dựng luôn, có rồi thì mở luôn.
        // Riêng kho cũ (bản 1) thì để nguyên để màn hình hỏi chuyển đổi.
        if (!kho) {
            await dungKhoMoi();
        } else if (!Kho.laKhoCu(kho)) {
            const mo = await Kho.moKho(kho);
            if (mo.ok) khoa = mo.khoa;
            else baoLoi = mo.lyDo;
        }
        if (luuTruCuaHang) {
            try { cuaHangVuaThay = await luuTruCuaHang.doc(); } catch (e) { cuaHangVuaThay = null; }
        }
        return veLai();
    }

    return {
        nap, veLai, themKhach, xoaKhach, chuyenKhoCu, boKhoCu,
        dangMo: () => !!khoa,
        cuaHangVuaThay: () => cuaHangVuaThay,
        dienSan: () => dienSan,
        xuatBanSao, nhapBanSao,
        choXacNhan: () => choXacNhan,
        choGoToken: () => choGoToken,
        soKhaiBao: () => (kho && kho.khach) ? Object.keys(kho.khach).length : 0,
    };
}

const API = { gan };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof globalThis !== 'undefined') globalThis.HDT_KhaiBao = API;
})();
