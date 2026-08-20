'use strict';

// ⚠️ TOÀN BỘ FILE NẰM TRONG MỘT PHẠM VI RIÊNG (hàm bọc ngoài).

(function () {

// ============================================================================
//  BẢNG THỬ — nổi trên trang POS Tendoo, dùng để NGHIỆM THU GIAI ĐOẠN 4c
//
//  Mục đích duy nhất: cho bạn NHÌN TẬN MẮT máy ghép tiền và bỏ hàng vào giỏ
//  đúng hay sai, TRƯỚC KHI cho phép nó bấm Thanh toán ở giai đoạn 5.
//
//  CÔNG TẮC "TỰ BẤM THANH TOÁN" — MẶC ĐỊNH TẮT.
//     Tắt  -> bảng chỉ bỏ hàng vào giỏ rồi dừng; bạn tự bấm Thanh toán.
//     Bật  -> phải tick thêm ô xác nhận "Tôi hiểu đây là hóa đơn thật".
//     Kể cả khi bật, việc bấm vẫn phải qua đủ 5 điều kiện tiên quyết trong
//     tendoo/bamThanhToan.js — trong đó có "tổng phải khớp tuyệt đối".
//
//  Nó dùng chính phiên đăng nhập đang mở — KHÔNG đọc mật khẩu, KHÔNG tự đăng
//  nhập, KHÔNG đổi tài khoản. Bạn đang ở cửa hàng nào thì nó làm ở đó.
// ============================================================================

const ID_BANG = 'hdt-bang-thu';

const tien = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(Number(n) || 0));

const KIEU = `
#${ID_BANG} { position: fixed; right: 16px; bottom: 16px; z-index: 2147483000;
  width: 330px; background: #fff; border: 2px solid #2563eb; border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0,0,0,.18); font-family: system-ui, sans-serif;
  font-size: 13px; color: #111827; }
#${ID_BANG} .hdt-dau { background: #2563eb; color: #fff; padding: 8px 11px;
  border-radius: 7px 7px 0 0; display: flex; justify-content: space-between;
  align-items: center; font-weight: 600; font-size: 12.5px; }
#${ID_BANG} .hdt-dau button { background: transparent; border: 0; color: #fff;
  cursor: pointer; font-size: 15px; line-height: 1; padding: 0 2px; }
#${ID_BANG} .hdt-than { padding: 11px; }
#${ID_BANG} .hdt-canh { background: #fffbeb; border: 1px solid #fcd34d; color: #92400e;
  border-radius: 7px; padding: 7px 9px; font-size: 11.5px; margin-bottom: 10px; }
#${ID_BANG} .hdt-ch { font-size: 11.5px; color: #6b7280; margin-bottom: 9px;
  word-break: break-all; }
#${ID_BANG} label { display: block; font-size: 11px; color: #6b7280; margin-bottom: 3px; }
#${ID_BANG} input { width: 100%; box-sizing: border-box; padding: 7px 9px; font-size: 14px;
  border: 1px solid #d1d5db; border-radius: 6px; text-align: right; font-weight: 600; }
#${ID_BANG} .hdt-nut { display: flex; gap: 6px; margin-top: 9px; }
#${ID_BANG} .hdt-nut button { flex: 1; border-radius: 6px; padding: 8px; font-size: 12.5px;
  cursor: pointer; border: 1px solid #d1d5db; background: #fff; }
#${ID_BANG} .hdt-nut .hdt-chinh { background: #2563eb; color: #fff; border-color: #2563eb; }
#${ID_BANG} .hdt-nut button[disabled] { background: #e5e7eb !important; color: #9ca3af !important;
  border-color: #e5e7eb !important; cursor: not-allowed; }
#${ID_BANG} .hdt-tu-bam { margin-top: 10px; border-radius: 7px; padding: 8px 10px;
  font-size: 11.5px; border: 1px solid #e5e7eb; background: #f9fafb; }
#${ID_BANG} .hdt-tu-bam.bat { border-color: #fecaca; background: #fef2f2; color: #b91c1c; }
#${ID_BANG} .hdt-tu-bam label { display: flex; gap: 6px; align-items: flex-start;
  cursor: pointer; color: inherit; font-size: 11.5px; margin: 0; }
#${ID_BANG} .hdt-tu-bam input { width: auto; }
#${ID_BANG} .hdt-nut .hdt-do { background: #dc2626; color: #fff; border-color: #dc2626; }
#${ID_BANG} .hdt-kq { margin-top: 10px; border-radius: 7px; padding: 8px 10px; font-size: 12px; }
#${ID_BANG} .hdt-kq.dat { background: #f0fdf4; border: 1px solid #bbf7d0; }
#${ID_BANG} .hdt-kq.hong { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; }
#${ID_BANG} .hdt-mon { font-size: 11.5px; color: #374151; margin-top: 3px; }
#${ID_BANG} .hdt-tong { font-weight: 700; margin-top: 5px; }
`;

/**
 * @param {Document} tailieu
 * @param {object} boi  { BoNoi, DocSanPham, DanhTinh, GhepTien, BoGio, GhiNhan }
 */
function taoBang(tailieu, boi) {
    const { DocSanPham, DanhTinh, GhepTien, BoGio } = boi;
    const BamThanhToan = boi.BamThanhToan || null;
    const luuTruCaiDat = boi.luuTruCaiDat || null;

    let dangChay = false;
    let ketQua = null;      // { dat:boolean, chu:string, chon?:Array, tong?, lech? }
    let danhTinh = null;
    let tuBam = false;      // CÔNG TẮC — mặc định TẮT
    let daHieu = false;     // đã tick "tôi hiểu đây là hóa đơn thật" chưa

    const tao = (the, lop, chu) => {
        const e = tailieu.createElement(the);
        if (lop) e.className = lop;
        if (chu != null) e.textContent = chu;
        return e;
    };

    function bocKieu() {
        if (tailieu.getElementById(ID_BANG + '-kieu')) return;
        const s = tailieu.createElement('style');
        s.id = ID_BANG + '-kieu';
        s.textContent = KIEU;
        (tailieu.head || tailieu.body).appendChild(s);
    }

    function ve() {
        let bang = tailieu.getElementById(ID_BANG);
        if (!bang) {
            bang = tailieu.createElement('div');
            bang.id = ID_BANG;
            tailieu.body.appendChild(bang);
        }
        bang.textContent = '';

        const dau = tao('div', 'hdt-dau');
        dau.appendChild(tao('span', null, tuBam && daHieu
            ? 'Ghép hóa đơn — TỰ PHÁT HÀNH ĐANG BẬT'
            : 'Thử ghép hóa đơn — CHƯA thanh toán'));
        const nutDong = tao('button', null, '×');
        nutDong.id = 'hdt-thu-dong';
        nutDong.title = 'Ẩn bảng';
        nutDong.onclick = () => bang.remove();
        dau.appendChild(nutDong);
        bang.appendChild(dau);

        const than = tao('div', 'hdt-than');

        const canh = tao('div', 'hdt-canh');
        canh.id = 'hdt-thu-canh';
        canh.textContent = (tuBam && daHieu)
            ? '⚠ TỰ PHÁT HÀNH ĐANG BẬT. Bấm nút đỏ là máy sẽ bấm Thanh toán và '
              + 'phát hành HÓA ĐƠN THẬT lên cơ quan thuế. Không hoàn tác được.'
            : 'Bảng này CHỈ bỏ hàng vào giỏ để bạn kiểm tra. '
              + 'Nó không bấm Thanh toán và không tạo hóa đơn nào.';
        than.appendChild(canh);

        const oCh = tao('div', 'hdt-ch');
        oCh.id = 'hdt-thu-cua-hang';
        oCh.textContent = danhTinh
            ? `Cửa hàng: ${danhTinh.tenTaiKhoan || '(không rõ tên)'} · ${danhTinh.maCuaHang}`
            : 'Chưa đọc được cửa hàng đang đăng nhập';
        than.appendChild(oCh);

        const nhan = tao('label', null, 'Số tiền cần khớp (đ)');
        nhan.setAttribute('for', 'hdt-thu-so-tien');
        than.appendChild(nhan);
        const o = tailieu.createElement('input');
        o.id = 'hdt-thu-so-tien';
        o.type = 'text';
        o.placeholder = '3.000.000';
        than.appendChild(o);

        const hangNut = tao('div', 'hdt-nut');
        const batThat = tuBam && daHieu;
        const nutThu = tao('button', batThat ? 'hdt-do' : 'hdt-chinh',
            dangChay ? 'Đang làm…' : (batThat ? 'Ghép, bỏ giỏ & PHÁT HÀNH' : 'Ghép & bỏ vào giỏ'));
        nutThu.id = 'hdt-thu-chay';
        nutThu.disabled = dangChay;
        nutThu.onclick = () => chay(laySoTien());
        hangNut.appendChild(nutThu);

        const nutXoa = tao('button', null, 'Xóa sạch giỏ');
        nutXoa.id = 'hdt-thu-xoa';
        nutXoa.disabled = dangChay;
        nutXoa.onclick = () => xoaGio();
        hangNut.appendChild(nutXoa);
        than.appendChild(hangNut);

        // ── CÔNG TẮC TỰ BẤM THANH TOÁN — mặc định TẮT ───────────────────────
        if (BamThanhToan) {
            const khoi = tao('div', 'hdt-tu-bam' + (tuBam ? ' bat' : ''));
            khoi.id = 'hdt-thu-khoi-tu-bam';

            const nhan1 = tailieu.createElement('label');
            const o1 = tailieu.createElement('input');
            o1.type = 'checkbox';
            o1.id = 'hdt-thu-tu-bam';
            o1.checked = tuBam;
            o1.onchange = () => {
                tuBam = o1.checked;
                if (!tuBam) daHieu = false;      // tắt thì xóa luôn xác nhận
                luuCaiDat();
                ve();
            };
            nhan1.appendChild(o1);
            nhan1.appendChild(tao('span', null,
                'Tự bấm Thanh toán sau khi bỏ hàng vào giỏ'));
            khoi.appendChild(nhan1);

            if (tuBam) {
                const nhan2 = tailieu.createElement('label');
                nhan2.style.marginTop = '6px';
                const o2 = tailieu.createElement('input');
                o2.type = 'checkbox';
                o2.id = 'hdt-thu-da-hieu';
                o2.checked = daHieu;
                o2.onchange = () => { daHieu = o2.checked; luuCaiDat(); ve(); };
                nhan2.appendChild(o2);
                nhan2.appendChild(tao('span', null,
                    'Tôi hiểu đây là hóa đơn THẬT, đẩy lên cơ quan thuế, không hoàn tác được'));
                khoi.appendChild(nhan2);
            }
            than.appendChild(khoi);
        }

        if (ketQua) {
            const k = tao('div', 'hdt-kq ' + (ketQua.dat ? 'dat' : 'hong'));
            k.id = 'hdt-thu-ket-qua';
            k.appendChild(tao('div', null, ketQua.chu));
            if (ketQua.chon) {
                for (const d of ketQua.chon) {
                    k.appendChild(tao('div', 'hdt-mon',
                        `• ${d.ten} · ${d.soLuong} × ${tien(d.gia)} = ${tien(d.thanhTien)}`));
                }
                k.appendChild(tao('div', 'hdt-tong',
                    `Tổng ${tien(ketQua.tong)}đ · lệch ${tien(ketQua.lech)}đ`));
                if (ketQua.tongTendoo != null) {
                    k.appendChild(tao('div', 'hdt-mon',
                        `Tendoo hiện: ${tien(ketQua.tongTendoo)}đ`
                        + (ketQua.tongTendoo === ketQua.tong ? ' ✓ khớp' : ' ⚠ LỆCH')));
                }
            }
            than.appendChild(k);
        }

        bang.appendChild(than);
        return bang;
    }

    function laySoTien() {
        const o = tailieu.getElementById('hdt-thu-so-tien');
        const so = Number(String(o ? o.value : '').replace(/[^\d]/g, ''));
        return Number.isFinite(so) ? so : 0;
    }

    async function luuCaiDat() {
        if (!luuTruCaiDat) return;
        try { await luuTruCaiDat.ghi({ tuBam, daHieu }); } catch (e) { /* không chặn */ }
    }

    async function napCaiDat() {
        if (!luuTruCaiDat) return;
        try {
            const c = await luuTruCaiDat.doc();
            tuBam = !!(c && c.tuBam);
            daHieu = !!(c && c.daHieu);
            if (!tuBam) daHieu = false;
        } catch (e) { tuBam = false; daHieu = false; }
    }

    async function xoaGio() {
        ketQua = null;
        const kq = await BoGio.xoaSachGio(tailieu);
        ketQua = { dat: kq.ok, chu: kq.ok ? 'Đã xóa sạch giỏ.' : (kq.thongBao || 'Không xóa được giỏ') };
        ve();
    }

    /** Chạy thử: đọc kho → ghép tiền → bỏ vào giỏ. KHÔNG bấm Thanh toán. */
    async function chay(soTien) {
        if (dangChay) return;
        if (!Number.isFinite(soTien) || soTien <= 0) {
            ketQua = { dat: false, chu: 'Hãy nhập số tiền cần khớp.' };
            return ve();
        }
        dangChay = true; ketQua = null; ve();

        try {
            const boNoi = boi.taoBoNoi();

            danhTinh = DanhTinh.doc(await boNoi.layPhien());
            if (!danhTinh) {
                ketQua = { dat: false, chu: 'Không đọc được tài khoản đang đăng nhập.' };
                return;
            }

            const kho = await DocSanPham.layTatCa((t) => boNoi.goiTrangSanPham(t));
            if (!kho.maCuaHang || kho.maCuaHang.toLowerCase() !== danhTinh.maCuaHang.toLowerCase()) {
                ketQua = { dat: false, chu: 'Kho hàng đọc về không thuộc cửa hàng đang đăng nhập — đã dừng.' };
                return;
            }

            const ghep = GhepTien.ghepSanPham({
                sanPham: kho.hang.map(h => ({ ma: h.id, ten: h.ten, gia: h.gia, ton: h.ton })),
                soTien,
            });
            if (ghep.ma !== 'OK') {
                ketQua = { dat: false, chu: ghep.thongBao };
                return;
            }

            const chon = ghep.chon.map(d => ({
                id: d.ma, ten: d.ten, gia: d.gia, soLuong: d.soLuong, thanhTien: d.thanhTien,
            }));

            const boVao = await BoGio.boVaoGio(tailieu, chon);
            if (!boVao.ok) {
                ketQua = { dat: false, chu: boVao.thongBao, chon,
                           tong: ghep.tong, lech: ghep.lech };
                return;
            }

            const nen = { chon, tong: ghep.tong, lech: ghep.lech, tongTendoo: boVao.tongTendoo };

            // ── GIAI ĐOẠN 5: chỉ bấm khi công tắc BẬT và đã tick xác nhận ────
            if (!(BamThanhToan && tuBam && daHieu)) {
                ketQua = { dat: true, ...nen,
                    chu: `Đã bỏ ${chon.length} loại vào giỏ. Hãy KIỂM TRA giỏ bên phải. `
                        + 'Muốn phát hành thì bạn tự bấm Thanh toán.' };
                return;
            }

            const luot = BamThanhToan.taoLuot();
            const bam = await luot.bam(tailieu, { choPhep: true, tongMongDoi: ghep.tong });
            if (bam.ok) {
                ketQua = { dat: true, ...nen, daPhatHanh: true,
                    chu: `ĐÃ PHÁT HÀNH hóa đơn ${tien(ghep.tong)}đ. ${bam.thongBao}` };
            } else if (bam.ma === BamThanhToan.MA.KHONG_RO) {
                // Không biết hóa đơn đã ra hay chưa -> nói thẳng, KHÔNG bấm lại.
                ketQua = { dat: false, ...nen, khongRo: true, chu: '⚠ ' + bam.thongBao };
            } else {
                ketQua = { dat: false, ...nen,
                    chu: 'Đã bỏ hàng vào giỏ nhưng KHÔNG bấm Thanh toán: ' + bam.thongBao };
            }
        } catch (e) {
            ketQua = { dat: false, chu: 'Lỗi: ' + (e && e.message ? e.message : String(e)) };
        } finally {
            dangChay = false;
            ve();
        }
    }

    async function napDanhTinh() {
        await napCaiDat();
        try {
            danhTinh = DanhTinh.doc(await boi.taoBoNoi().layPhien());
        } catch (e) {
            danhTinh = null;
        }
        ve();
    }

    bocKieu();
    ve();
    return { ve, chay, xoaGio, napDanhTinh, napCaiDat, ID_BANG,
             ketQua: () => ketQua, danhTinh: () => danhTinh,
             tuBam: () => tuBam, daHieu: () => daHieu };
}

const API = { taoBang, ID_BANG };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof globalThis !== 'undefined') globalThis.HDT_BangThu = API;

// Tự gắn khi ở đúng trang POS của Tendoo.
(function tuChay() {
    if (typeof globalThis.location === 'undefined' || !globalThis.document) return;
    if (!/(^|\.)tendoo\.vn$/i.test(String(globalThis.location.hostname || ''))) return;
    if (!/\/sales\/pos/.test(String(globalThis.location.pathname || ''))) return;

    const G = globalThis;
    const can = ['HDT_BoNoi', 'HDT_DocSanPham', 'HDT_DanhTinh', 'HDT_GhepTien', 'HDT_BoGio'];
    if (can.some(t => !G[t])) return;      // thiếu bộ phận thì im lặng, không dựng bảng

    const KHOA_CAI_DAT = 'hdt-cai-dat-bang-thu';
    const khoChrome = G.chrome && G.chrome.storage && G.chrome.storage.local;
    const luuTruCaiDat = khoChrome ? {
        async doc() { const k = await khoChrome.get(KHOA_CAI_DAT); return k[KHOA_CAI_DAT] || null; },
        async ghi(o) { await khoChrome.set({ [KHOA_CAI_DAT]: o }); },
    } : null;

    const doc = G.HDT_BoNoi.taoDocKhoTrang(G);
    const bang = taoBang(G.document, {
        BoNoi: G.HDT_BoNoi, DocSanPham: G.HDT_DocSanPham, DanhTinh: G.HDT_DanhTinh,
        GhepTien: G.HDT_GhepTien, BoGio: G.HDT_BoGio,
        BamThanhToan: G.HDT_BamThanhToan || null,
        luuTruCaiDat,
        taoBoNoi: () => G.HDT_BoNoi.taoBoNoi(doc),
    });
    bang.napDanhTinh();
})();

})();
