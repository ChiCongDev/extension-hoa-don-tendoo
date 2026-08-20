'use strict';

// ============================================================================
//  BẢN SAO TRANG BÁO CÁO CỦA SELL — dùng cho test.
//
//  Cấu trúc HTML dưới đây được chép ĐÚNG theo file thật:
//    Sell/resources/views/baoCaoBanHang/baoCaoKhachHang.blade.php
//    - tiêu đề bảng: dòng 306–320
//    - dòng dữ liệu: hàm renderTable(), dòng 597–612
//    - dòng tổng cộng: dòng 322–334
//
//  ⚠️ BỔ SUNG 2026-08-13 — BỘ LỌC THỜI GIAN, chép theo file thật:
//    - <select id="filterLoai"> dòng 175–184, MẶC ĐỊNH là "thang_nay" (Tháng này)
//    - <select id="filterLoaiDon"> dòng 185, mặc định "" = Tất cả đơn
//    - <input id="searchKhachHang"> dòng 278, có onkeyup="debounceSearch()"
//    - <select id="soBanGhiSelect"> dòng 342, mặc định 20 (chỉ 20 dòng/trang!)
//    - nút "Xem báo cáo" onclick="loadBaoCao(1)" dòng 195
//    - "Từ <span id=tuNgayHienThi> đến <span id=denNgayHienThi>" dòng 240 —
//      hai ô này do MÁY CHỦ điền về sau mỗi lần tải, nên đây là chỗ DUY NHẤT
//      kiểm chứng được bảng đang hiện khoảng ngày nào.
//    - <div id="tableLoading"> dòng 266, display:flex lúc đang tải
//
//  Không dựng mấy thứ này thì test sẽ xanh trong khi ngoài đời máy đọc nhầm
//  doanh thu CẢ THÁNG rồi xuất hóa đơn theo số đó.
//
//  Test chạy trên bản sao này chứ KHÔNG đụng vào project Sell.
//  Nếu Sell đổi cấu trúc bảng, test ở đây sẽ vẫn xanh trong khi thực tế đã hỏng
//  — nên mỗi lần Sell sửa trang báo cáo thì phải đối chiếu lại file này.
// ============================================================================

const KHACH_MAU = [
    { id: 1,  ma: 'PA',  ten: 'Phương Anh - PA',  soDon: 119, doanhThu: 134040000, giaVon: 118920000, loiNhuan: 15120000, tyLe: 11.28 },
    { id: 2,  ma: 'TB',  ten: 'Trang Bé TB',      soDon: 106, doanhThu: 115825000, giaVon: 100540000, loiNhuan: 15285000, tyLe: 13.2 },
    { id: 11, ma: '10Q', ten: 'CTV Thủy 10Q',     soDon: 4,   doanhThu: 3790000,   giaVon: 5025000,   loiNhuan: -1235000, tyLe: -32.59 },
    { id: 9,  ma: 'PA2', ten: 'Phạm Thanh Chi PA2', soDon: 6, doanhThu: 4339999,   giaVon: 3950000,   loiNhuan: 389999,   tyLe: 8.99 },
    // Khách lẻ: không có id -> Sell hiện "---" thay cho nút Chi tiết.
    { id: 0,  ma: 'LE',  ten: 'Khách lẻ',         soDon: 3,   doanhThu: 900000,    giaVon: 700000,    loiNhuan: 200000,   tyLe: 22.2 },
    // Doanh thu 0 -> không có gì để xuất hóa đơn.
    { id: 20, ma: 'X0',  ten: 'Khách chưa mua',   soDon: 0,   doanhThu: 0,         giaVon: 0,         loiNhuan: 0,        tyLe: 0 },
];

const so = n => new Intl.NumberFormat('vi-VN').format(n);

function taoDong(k, isNVBH, stt) {
    const oChiTiet = k.id > 0
        ? `<button onclick="xemChiTiet(${k.id}, '${k.ten.replace(/'/g, "\\'")}')" class="text-blue-600 hover:text-blue-800"><svg class="w-5 h-5"></svg></button>`
        : '---';
    return `
                <tr class="hover:bg-gray-50 khach-hang-row" data-ten="${k.ten.toLowerCase()}" data-ma="${k.ma.toLowerCase()}">
                    <td class="px-4 py-3 text-sm text-gray-600">${stt}</td>
                    <td class="px-4 py-3"><span class="text-blue-600 font-medium">${k.ma}</span></td>
                    <td class="px-4 py-3 text-sm font-medium text-gray-800">${k.ten}</td>
                    <td class="px-4 py-3 text-center text-sm text-gray-600">${k.soDon}</td>
                    <td class="px-4 py-3 text-right text-sm font-semibold text-blue-600">${so(k.doanhThu)}</td>
                    ${!isNVBH ? `<td class="px-4 py-3 text-right text-sm font-semibold text-orange-600">${so(k.giaVon)}</td>` : ''}
                    ${!isNVBH ? `<td class="px-4 py-3 text-right text-sm font-semibold">${so(k.loiNhuan)}</td>
                    <td class="px-4 py-3 text-right"><span class="px-2 py-1 rounded-full text-xs">${k.tyLe}%</span></td>` : ''}
                    <td class="px-4 py-3 text-center">${oChiTiet}</td>
                </tr>`;
}

function taoBody(danhSach, isNVBH) {
    if (!danhSach || danhSach.length === 0) {
        return `<tr><td colspan="9" class="px-4 py-8 text-center text-gray-500">Không có dữ liệu</td></tr>`;
    }
    return danhSach.map((k, i) => taoDong(k, isNVBH, i + 1)).join('');
}

/**
 * @param {object} [tuyChon]
 * @param {boolean} [tuyChon.isNVBH=false]  true = vai trò nhân viên bán hàng (ẩn 3 cột)
 * @param {Array}   [tuyChon.khach=KHACH_MAU]
 * @param {boolean} [tuyChon.dangTai=false] true = bảng đang ở trạng thái "Đang tải..."
 * @param {string}  [tuyChon.tuHien='--']    nội dung ô "Từ ..." máy chủ đã điền
 * @param {string}  [tuyChon.denHien='--']   nội dung ô "... đến ..."
 * @param {string}  [tuyChon.tuKhoa='']      chữ còn sót trong ô tìm kiếm
 */
function taoTrang(tuyChon = {}) {
    const { isNVBH = false, khach = KHACH_MAU, dangTai = false,
            tuHien = '--', denHien = '--', tuKhoa = '' } = tuyChon;
    const than = dangTai
        ? `<tr><td colspan="9" class="px-4 py-8 text-center text-gray-500">Đang tải...</td></tr>`
        : taoBody(khach, isNVBH);

    return `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"></head><body>
    <div class="bc-filter-wrapper">
        <select id="filterLoai">
            <option value="hom_nay">Hôm nay</option>
            <option value="hom_qua">Hôm trước</option>
            <option value="tuan_nay">Tuần này</option>
            <option value="tuan_truoc">Tuần trước</option>
            <option value="thang_nay" selected>Tháng này</option>
            <option value="thang_truoc">Tháng trước</option>
            <option value="nam_nay">Năm nay</option>
            <option value="tuy_chon">Tùy chọn</option>
        </select>
        <select id="filterLoaiDon">
            <option value="" selected>Tất cả đơn</option>
            <option value="thuong">Đơn thường</option>
            <option value="order">Đơn order</option>
        </select>
        <div id="tuyCHonNgay" class="bc-custom-date hidden">
            <input type="date" id="tuNgay"><span>đến</span><input type="date" id="denNgay">
        </div>
        <button id="nutXemBaoCao" class="bc-btn-report">Xem báo cáo</button>
    </div>
    <div class="bc-time-display-wrap mt-4 text-center">
        <span class="bc-time-display text-sm text-gray-500">
            Từ <span id="tuNgayHienThi" class="font-medium">${tuHien}</span>
            đến <span id="denNgayHienThi" class="font-medium">${denHien}</span>
        </span>
    </div>
    <div><input type="text" id="searchKhachHang" placeholder="Tìm kiếm khách hàng..." value="${tuKhoa}"></div>
    <div id="tableLoading" style="display:none;"></div>
    <div class="bc-desktop-table overflow-x-auto">
        <table class="w-full" id="tableKhachHang">
            <thead class="bg-gray-50 border-b border-gray-200">
            <tr>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">STT</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Mã KH</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tên khách hàng</th>
                <th class="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Số đơn ↕</th>
                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Doanh thu ↕</th>
                ${!isNVBH ? `<th class="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Giá vốn ↕</th>
                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Lợi nhuận ↕</th>
                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Tỷ suất</th>` : ''}
                <th class="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Chi tiết</th>
            </tr>
            </thead>
            <tbody id="tbodyKhachHang" class="divide-y divide-gray-100">${than}</tbody>
            <tfoot class="bg-gray-50 border-t-2 border-gray-300">
            <tr>
                <td colspan="3" class="px-4 py-3 text-left font-bold text-gray-700">TỔNG CỘNG</td>
                <td id="footerSoDon" class="px-4 py-3 text-center font-bold text-gray-700">0</td>
                <td id="footerDoanhThu" class="px-4 py-3 text-right font-bold text-blue-600">0</td>
                ${!isNVBH ? `<td id="footerGiaVon" class="px-4 py-3 text-right font-bold text-orange-600">0</td>
                <td id="footerLoiNhuan" class="px-4 py-3 text-right font-bold text-green-600">0</td>
                <td id="footerTyLe" class="px-4 py-3 text-right font-bold text-purple-600">0%</td>` : ''}
                <td class="px-4 py-3"></td>
            </tr>
            </tfoot>
        </table>
    </div>
    <div class="bc-pagination-wrap">
        <select id="soBanGhiSelect">
            <option value="20" selected>20</option>
            <option value="50">50</option>
            <option value="100">100</option>
        </select><span>/ trang</span>
    </div></body></html>`;
}

/** Giả lập đúng hành vi renderTable() của Sell: GHI ĐÈ toàn bộ tbody. */
function veLaiBang(tailieu, danhSach, isNVBH = false) {
    tailieu.getElementById('tbodyKhachHang').innerHTML = taoBody(danhSach, isNVBH);
}

/** "13/8/2026" -> "13/08/2026", đúng định dạng d/m/Y mà Laravel trả về. */
function ngayDMY(d) {
    return String(d.getDate()).padStart(2, '0') + '/'
        + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}

/**
 * GẮN HÀNH VI THẬT của trang báo cáo Sell vào trang giả.
 *
 * Chép theo loadBaoCao() (blade dòng 450–520):
 *   · có cờ `dangTai` chặn tải chồng — gọi lúc đang tải là KHÔNG LÀM GÌ CẢ
 *   · hiện #tableLoading, gọi API, rồi mới điền #tuNgayHienThi / #denNgayHienThi
 *   · ghi đè sạch tbody
 *   · đọc #filterLoai, #searchKhachHang, #filterLoaiDon, soBanGhi ngay lúc gọi
 *   · đổi #soBanGhiSelect gọi doiSoBanGhi() -> loadBaoCao(1)
 *   · nút "Xem báo cáo" gọi loadBaoCao(1)
 *
 * ⚠️ Cờ `dangTai` là chỗ dễ sai nhất: máy bấm nút lúc trang đang tải thì cú bấm
 * đó RƠI VÀO HƯ KHÔNG, và nếu máy không biết chờ thì nó đọc bảng cũ của tháng.
 *
 * @param {object} tuyChon
 *   - theoLoai   { hom_nay: [khach…], thang_nay: [khach…] } dữ liệu từng khoảng
 *   - treMs      độ trễ giả của API
 *   - isNVBH
 */
function gaLapSell(cua, { theoLoai = {}, treMs = 0, isNVBH = false } = {}) {
    const td = cua.document;
    let dangTai = false;
    let soBanGhi = 20;
    const soLan = { tai: 0, boQuaVìDangTai: 0 };

    const dat = (id, chu) => { const o = td.getElementById(id); if (o) o.textContent = chu; };

    function khoangCua(loai) {
        const nay = new Date();
        if (loai === 'hom_nay') return { tu: ngayDMY(nay), den: ngayDMY(nay) };
        if (loai === 'hom_qua') {
            const q = new Date(nay.getTime() - 86400000);
            return { tu: ngayDMY(q), den: ngayDMY(q) };
        }
        // Mặc định của trang thật là THÁNG NÀY — cả một khoảng nhiều ngày.
        const dau = new Date(nay.getFullYear(), nay.getMonth(), 1);
        const cuoi = new Date(nay.getFullYear(), nay.getMonth() + 1, 0);
        return { tu: ngayDMY(dau), den: ngayDMY(cuoi) };
    }

    function loadBaoCao() {
        if (dangTai) { soLan.boQuaVìDangTai++; return; }
        dangTai = true;
        soLan.tai++;
        const loai = td.getElementById('filterLoai').value;
        const tuKhoa = String(td.getElementById('searchKhachHang').value || '').trim().toLowerCase();
        const oTai = td.getElementById('tableLoading');
        if (oTai) oTai.style.display = 'flex';

        const xong = () => {
            const kh = (theoLoai[loai] || []).filter(k => !tuKhoa
                || String(k.ten).toLowerCase().includes(tuKhoa)
                || String(k.ma).toLowerCase().includes(tuKhoa));
            const trang = kh.slice(0, soBanGhi);      // CHỈ trang 1, đúng như thật
            veLaiBang(td, trang, isNVBH);
            const k = khoangCua(loai);
            dat('tuNgayHienThi', k.tu);
            dat('denNgayHienThi', k.den);
            if (oTai) oTai.style.display = 'none';
            dangTai = false;
        };
        if (treMs > 0) cua.setTimeout(xong, treMs); else xong();
    }

    td.getElementById('nutXemBaoCao').addEventListener('click', () => loadBaoCao());
    td.getElementById('soBanGhiSelect').addEventListener('change', (su) => {
        soBanGhi = parseInt(su.target.value, 10);
        loadBaoCao();
    });

    return { loadBaoCao, soLan, ngayDMY, laySoBanGhi: () => soBanGhi };
}

module.exports = { taoTrang, veLaiBang, gaLapSell, ngayDMY, KHACH_MAU };
