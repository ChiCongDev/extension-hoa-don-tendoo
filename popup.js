'use strict';

// ⚠️ TOÀN BỘ FILE NẰM TRONG MỘT PHẠM VI RIÊNG (hàm bọc ngoài).
// Chrome nạp nhiều file vào CÙNG MỘT phạm vi — hai file cùng khai `const API`
// là file thứ hai nổ ngay khi nạp, và KHÔNG có lỗi nào hiện ra cho người dùng:
// popup chỉ đơn giản trống trơn. Đã dính đúng lỗi này một lần. Bọc lại để không
// bao giờ dính nữa. Xuất ra ngoài qua globalThis.HDT_* ở cuối file.

(function () {

// Popup CHỈ còn hai việc: hiện tình trạng, và giữ công tắc tự bấm Thanh toán.
//
// Mọi ô nhập (mã cửa hàng, tên đăng nhập, mật khẩu, khóa mở) đã dời sang trang
// báo cáo của Sell — xem sell/oKhaiBao.js và khaiBao.html. Popup KHÔNG đọc kho,
// KHÔNG giữ khóa mở, KHÔNG có chỗ nào gõ mật khẩu.

/** Gửi tin cho tiến trình nền. Nuốt lỗi: không có nền cũng không chặn popup. */
async function guiNen(tin) {
    try {
        if (typeof chrome === 'undefined' || !chrome.runtime) return null;
        return await chrome.runtime.sendMessage(tin);
    } catch (e) {
        return null;
    }
}

/**
 * Công tắc tự bấm Thanh toán — HAI LỚP, mặc định TẮT.
 * Đặt ở popup để bật/tắt được mà không phải mở trang Tendoo.
 */
async function ganCongTacTuBam() {
    const khoi = document.getElementById('congTacTuBam');
    const oTuBam = document.getElementById('ctTuBam');
    const oDaHieu = document.getElementById('ctDaHieu');
    const lopHai = document.getElementById('ctLopHai');
    const trangThai = document.getElementById('ctTrangThai');
    if (!khoi || !oTuBam || !oDaHieu) return;

    const c = (await guiNen({ loai: 'hdt-hoi-cai-dat' })) || { tuBam: false, daHieu: false };

    function ve(tuBam, daHieu) {
        oTuBam.checked = !!tuBam;
        oDaHieu.checked = !!daHieu;
        lopHai.style.display = tuBam ? '' : 'none';
        khoi.className = 'hdt-tu-bam' + (tuBam && daHieu ? ' bat' : '');
        trangThai.textContent = (tuBam && daHieu)
            ? '⚠ ĐANG BẬT — bấm "Tạo HĐ" bên bongtom.store là máy phát hành hóa đơn thật, không có bước dừng nào nữa.'
            : (tuBam ? 'Đã bật nhưng CHƯA xác nhận — máy vẫn chỉ bỏ hàng vào giỏ.'
                     : 'Đang TẮT — máy chỉ bỏ hàng vào giỏ, bạn tự bấm Thanh toán.');
    }

    async function luu() {
        // Tắt lớp trên thì xóa luôn xác nhận — bật lại phải tick lại từ đầu.
        const tuBam = oTuBam.checked;
        const daHieu = tuBam && oDaHieu.checked;
        await guiNen({ loai: 'hdt-dat-cai-dat', tuBam, daHieu });
        ve(tuBam, daHieu);
    }

    oTuBam.addEventListener('change', luu);
    oDaHieu.addEventListener('change', luu);
    ve(c.tuBam, c.daHieu);
}

/**
 * Công tắc "bỏ qua cảnh báo chưa thiết lập quản lý thuế".
 *
 * MẶC ĐỊNH TẮT. Bật là chấp nhận điều chính Tendoo cảnh báo: dữ liệu trên Tờ
 * khai thuế và Sổ kế toán sẽ không chính xác. Đó là quyết định kế toán của
 * người dùng, nên phải do họ gạt tường minh — không có đường nào bật ngầm.
 *
 * Chỉ có tác dụng khi công tắc TỰ BẤM THANH TOÁN đang bật: tắt cái kia thì máy
 * không bao giờ bấm Thanh toán nên chẳng bao giờ gặp bảng thuế.
 */
async function ganCongTacBoQuaThue() {
    const o = document.getElementById('ctBoQuaThue');
    const trangThai = document.getElementById('ctBoQuaThueTrangThai');
    if (!o) return;

    const c = (await guiNen({ loai: 'hdt-hoi-cai-dat' })) || {};
    function ve(bat) {
        o.checked = !!bat;
        trangThai.textContent = bat
            ? '⚠ ĐANG BẬT — hóa đơn vẫn ra, nhưng Tờ khai thuế và Sổ kế toán sẽ KHÔNG chính xác. '
              + 'Máy sẽ đánh dấu riêng những hóa đơn này để bạn đối chiếu.'
            : 'Đang TẮT — gặp bảng "Chưa thiết lập quản lý thuế" thì máy dừng, không phát hành.';
        trangThai.style.color = bat ? '#b91c1c' : '';
    }
    o.addEventListener('change', async () => {
        await guiNen({ loai: 'hdt-dat-cai-dat', boQuaThue: o.checked });
        ve(o.checked);
    });
    ve(c.boQuaThue);
}

/**
 * Công tắc "tự xóa giỏ kể cả khi không phải giỏ của máy".
 *
 * MẶC ĐỊNH TẮT. Bật là cho phép máy xóa cả hàng người dùng đang tự chọn dở —
 * nên phải do người dùng gạt tường minh, không có đường nào bật ngầm.
 */
async function ganCongTacXoaGio() {
    const o = document.getElementById('ctXoaGioLa');
    const trangThai = document.getElementById('ctXoaGioTrangThai');
    if (!o) return;

    const c = (await guiNen({ loai: 'hdt-hoi-cai-dat' })) || {};
    function ve(bat) {
        o.checked = !!bat;
        trangThai.textContent = bat
            ? '⚠ Máy sẽ xóa MỌI giỏ đang có, kể cả hàng bạn tự chọn.'
            : 'Chỉ tự dọn giỏ do chính máy để lại. Giỏ lạ thì dừng và hỏi bạn.';
    }
    o.addEventListener('change', async () => {
        await guiNen({ loai: 'hdt-dat-cai-dat', xoaGioLa: o.checked });
        ve(o.checked);
    });
    ve(c.xoaGioLa);
}

/** Tóm tắt kho — chỉ đếm, tuyệt đối không hiện tên đăng nhập hay mật khẩu. */
async function hienTomTatKho() {
    const o = document.getElementById('tomTatKho');
    if (!o) return;
    const t = await guiNen({ loai: 'hdt-tinh-trang-kho' });
    if (!t) { o.textContent = 'Chưa đọc được tình trạng kho.'; return; }
    const so = Object.keys(t.khach || {}).length;
    if (!t.coKho) { o.textContent = 'Chưa khai báo khách nào.'; return; }
    o.textContent = t.dangMo
        ? `✔ ${so} khách đã khai báo — sẵn sàng, máy tự đăng nhập được.`
        : `⚠ ${so} khách khai báo từ bản cũ — cần chuyển đổi MỘT LẦN bên trang bongtom.store.`;
}

document.addEventListener('DOMContentLoaded', async () => {
    const oPhienBan = document.getElementById('phienBan');
    if (oPhienBan) {
        const tin = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest)
            ? chrome.runtime.getManifest()
            : { version: '?' };
        oPhienBan.textContent = `Phiên bản ${tin.version} — giai đoạn 4b / 5`;
    }

    await ganCongTacTuBam();
    await ganCongTacBoQuaThue();
    await ganCongTacXoaGio();
    await hienTomTatKho();
});


})();
