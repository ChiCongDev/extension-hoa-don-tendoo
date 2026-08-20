'use strict';

// Test cho việc CHÈN CỘT vào bảng báo cáo của Sell.
// Chạy: node test/chenCot.test.js   (cần biến HDT_JSDOM trỏ tới gói jsdom)

const assert = require('node:assert');
const { JSDOM } = require(process.env.HDT_JSDOM || 'jsdom');
const { test, chay, doiMotNhip } = require('./chay');
const { taoTrang, veLaiBang, KHACH_MAU } = require('./trangGiaLap');

// Nạp các module đúng thứ tự như manifest, chúng tự gắn vào globalThis.
globalThis.__HDT_KHONG_TU_CHAY__ = true;
require('../chung/ghepTien');
require('../sell/docBang');
require('../sell/oKhaiBao');
const ChenCot = require('../sell/chenCot');

function dungTrang(tuyChon) {
    const dom = new JSDOM(taoTrang(tuyChon));
    // chenCot dùng MutationObserver lấy từ cửa sổ của chính tài liệu -> jsdom có sẵn.
    return { dom, tailieu: dom.window.document, bang: dom.window.document.getElementById('tableKhachHang') };
}

/** Số cột thật của một dòng, tính cả colspan. */
function demCot(tr) {
    return [...tr.children].reduce((t, o) => t + (Number(o.getAttribute('colspan')) || 1), 0);
}

function moiDongDuCot(bang) {
    const chuan = demCot(bang.querySelector('thead tr'));
    const cacDong = [...bang.querySelectorAll('tbody tr'), ...bang.querySelectorAll('tfoot tr')];
    cacDong.forEach((tr, i) => {
        assert.strictEqual(demCot(tr), chuan,
            `dòng thứ ${i} có ${demCot(tr)} cột, tiêu đề có ${chuan}`);
    });
    return chuan;
}

// ------------------------------------------------------------ chèn cột
test('chèn thêm đúng 1 cột vào tiêu đề', () => {
    const { bang } = dungTrang();
    const truoc = bang.querySelectorAll('thead th').length;
    ChenCot.chenVao(bang);
    assert.strictEqual(bang.querySelectorAll('thead th').length, truoc + 1);
});

test('gọi chèn 2 lần KHÔNG sinh cột trùng', () => {
    const { bang } = dungTrang();
    ChenCot.chenVao(bang);
    const sau1 = bang.querySelectorAll('thead th').length;
    ChenCot.chenVao(bang);
    ChenCot.chenVao(bang);
    assert.strictEqual(bang.querySelectorAll('thead th').length, sau1);
    assert.strictEqual(bang.querySelectorAll('td[data-hdt-cot]').length,
        bang.querySelectorAll('tbody tr').length + 1, 'ô bị chèn trùng');
});

test('MỌI dòng có đủ số cột — thân bảng và chân bảng khớp tiêu đề', () => {
    const { bang } = dungTrang();
    ChenCot.chenVao(bang);
    assert.strictEqual(moiDongDuCot(bang), 10);
});

test('dòng khách lẻ vẫn được thêm ô (không có ô tick) để bảng không lệch', () => {
    const { bang } = dungTrang();
    ChenCot.chenVao(bang);
    const dongLe = [...bang.querySelectorAll('tbody tr')].find(tr => tr.dataset.ma === 'le');
    const oCuoi = dongLe.lastElementChild;
    assert.strictEqual(oCuoi.dataset.hdtCot, '1');
    assert.strictEqual(oCuoi.querySelector('input'), null, 'khách lẻ không được có ô tick');
    assert.strictEqual(oCuoi.textContent.trim(), '—');
});

test('chỉ khách xuất được hóa đơn mới có ô tick — đúng 4 ô', () => {
    const { bang } = dungTrang();
    ChenCot.chenVao(bang);
    assert.strictEqual(bang.querySelectorAll('input.hdt-tick').length, 4);
});

// ------------------------------------------------------------ colspan
test('dòng "Đang tải..." được cộng colspan lên 10', () => {
    const { bang } = dungTrang({ dangTai: true });
    ChenCot.chenVao(bang);
    const o = bang.querySelector('tbody td[colspan]');
    assert.strictEqual(o.getAttribute('colspan'), '10');
    assert.strictEqual(moiDongDuCot(bang), 10);
});

test('gọi nhiều lần KHÔNG cộng dồn colspan', () => {
    const { bang } = dungTrang({ dangTai: true });
    ChenCot.chenVao(bang);
    ChenCot.chenVao(bang);
    ChenCot.chenVao(bang);
    assert.strictEqual(bang.querySelector('tbody td[colspan]').getAttribute('colspan'), '10');
});

test('ô TỔNG CỘNG ở chân bảng KHÔNG bị đổi colspan, chỉ thêm ô trống', () => {
    const { bang } = dungTrang();
    ChenCot.chenVao(bang);
    const oTong = bang.querySelector('tfoot td[colspan]');
    assert.strictEqual(oTong.getAttribute('colspan'), '3', 'colspan chân bảng bị sửa nhầm');
    assert.strictEqual(bang.querySelector('tfoot tr').lastElementChild.dataset.hdtCot, '1');
});

test('bảng "Không có dữ liệu" cũng khớp cột', () => {
    const { bang } = dungTrang({ khach: [] });
    ChenCot.chenVao(bang);
    assert.strictEqual(moiDongDuCot(bang), 10);
});

// ------------------------------------------------------------ vẽ lại bảng
test('Sell vẽ lại bảng (lọc/sắp xếp/đổi trang) → cột tự chèn lại', async () => {
    const { tailieu, bang } = dungTrang();
    ChenCot.chenVao(bang);
    ChenCot.theoDoi(bang);

    // Đây chính là điều renderTable() của Sell làm: ghi đè sạch tbody.
    veLaiBang(tailieu, KHACH_MAU.slice(0, 2));
    assert.strictEqual(bang.querySelectorAll('input.hdt-tick').length, 0, 'chưa kịp chèn lại');

    await doiMotNhip();
    assert.strictEqual(bang.querySelectorAll('input.hdt-tick').length, 2, 'không chèn lại sau khi vẽ lại');
    assert.strictEqual(moiDongDuCot(bang), 10);
});

test('vẽ lại nhiều lần liên tiếp vẫn không sinh cột trùng', async () => {
    const { tailieu, bang } = dungTrang();
    ChenCot.chenVao(bang);
    ChenCot.theoDoi(bang);
    veLaiBang(tailieu, KHACH_MAU);
    await doiMotNhip();
    veLaiBang(tailieu, KHACH_MAU);
    await doiMotNhip();
    assert.strictEqual(bang.querySelectorAll('thead th').length, 10);
    assert.strictEqual(moiDongDuCot(bang), 10);
});

// ------------------------------------------------------------ chọn khách
test('tick 1 khách → thanh nổi hiện đúng tên số tiền', () => {
    const { tailieu, bang } = dungTrang();
    ChenCot.chenVao(bang);
    const tick = bang.querySelector('input.hdt-tick');
    tick.checked = true;
    tick.dispatchEvent(new tailieu.defaultView.Event('change'));

    const thanh = tailieu.getElementById('hdt-thanh-noi');
    assert.ok(thanh, 'không hiện thanh nổi');
    assert.ok(thanh.textContent.includes('1 khách'));
    assert.ok(thanh.textContent.includes('134.040.000'));
});

test('tick tất cả → chọn cả 4 khách, cộng đúng tổng tiền', () => {
    const { tailieu, bang } = dungTrang();
    ChenCot.chenVao(bang);
    const tatCa = tailieu.getElementById('hdt-tick-tat-ca');
    tatCa.checked = true;
    tatCa.dispatchEvent(new tailieu.defaultView.Event('change'));

    assert.strictEqual(ChenCot.dsDaTick(bang).length, 4);
    const tong = 134040000 + 115825000 + 3790000 + 4339999;
    assert.ok(tailieu.getElementById('hdt-thanh-noi').textContent.includes(
        new Intl.NumberFormat('vi-VN').format(tong)));
});

test('bỏ tick hết → thanh nổi biến mất', () => {
    const { tailieu, bang } = dungTrang();
    ChenCot.chenVao(bang);
    const tatCa = tailieu.getElementById('hdt-tick-tat-ca');
    tatCa.checked = true;
    tatCa.dispatchEvent(new tailieu.defaultView.Event('change'));
    assert.ok(tailieu.getElementById('hdt-thanh-noi'));

    tatCa.checked = false;
    tatCa.dispatchEvent(new tailieu.defaultView.Event('change'));
    assert.strictEqual(tailieu.getElementById('hdt-thanh-noi'), null);
});

// ------------------------------------------------------------ modal
test('bấm "Tạo HĐ" mở modal đúng khách đó', () => {
    const { tailieu, bang } = dungTrang();
    ChenCot.chenVao(bang);
    bang.querySelector('button.hdt-nut').click();

    const modal = tailieu.getElementById('hdt-modal');
    assert.ok(modal, 'modal không mở');
    assert.ok(modal.textContent.includes('Phương Anh - PA'));
    assert.ok(modal.textContent.includes('134.040.000'));
});

test('modal nói ĐÚNG SỰ THẬT về đăng nhập: tự làm, nhưng phải khai báo trước', async () => {
    // Trước kia modal ghi "Máy KHÔNG tự đăng nhập". Từ khi có bộ đổi tài khoản
    // thì câu đó là nói dối người dùng, nên phải nói lại cho đúng.
    const { tailieu, bang } = dungTrang();
    ChenCot.chenVao(bang);
    bang.querySelector('button.hdt-nut').click();
    await new Promise(r => setTimeout(r, 40));
    const chu = tailieu.getElementById('hdt-modal').textContent;
    assert.ok(!/KHÔNG tự đăng nhập/i.test(chu), 'modal vẫn nói dối là không tự đăng nhập');
    assert.match(chu, /tự đăng nhập và tự đổi tài khoản/i);
    assert.match(chu, /khai báo tài khoản trong popup/i);
    assert.match(chu, /khóa mở/i);
    assert.match(chu, /gửi sang Tendoo/i);
});

test('modal KHÔNG hiện kết quả ghép nào — việc ghép làm bên Tendoo', () => {
    // Trước đây modal ghép thử trên "lưới hàng mẫu" rồi hiện số. Con số đó
    // KHÔNG phải cái sẽ ra thật (hàng thật nằm bên Tendoo), nên hiện lên là
    // nói dối người dùng. Giờ modal chỉ liệt kê khách + số tiền cần khớp.
    const { tailieu, bang } = dungTrang();
    ChenCot.chenVao(bang);
    bang.querySelector('button.hdt-nut').click();
    const chu = tailieu.getElementById('hdt-modal').textContent;
    assert.ok(!/Ghép được/.test(chu), 'modal vẫn khoe kết quả ghép giả lập');
    assert.ok(!/GIẢ LẬP/i.test(chu), 'modal vẫn nói đang ở chế độ giả lập');
    assert.match(chu, /Doanh thu cần khớp/);
});

test('nút Xác nhận ĐÃ MỞ và gọi đúng cầu nối', async () => {
    const { tailieu, bang } = dungTrang();
    const daGui = [];
    tailieu.defaultView.chrome = {
        runtime: { sendMessage: async (tin) => { daGui.push(tin); return { xong: [{}], loi: [] }; } },
    };
    ChenCot.chenVao(bang);
    bang.querySelector('button.hdt-nut').click();

    const nut = tailieu.getElementById('hdt-xac-nhan');
    assert.ok(nut, 'không thấy nút Xác nhận');
    assert.strictEqual(nut.disabled, false, 'nút vẫn bị khóa');
    nut.click();
    const lenh = () => daGui.filter(t => t.loai === 'hdt-tao-hoa-don');
    for (let i = 0; i < 50 && lenh().length === 0; i++) await new Promise(r => setTimeout(r, 10));

    assert.strictEqual(lenh().length, 1, 'gửi lệnh tạo hóa đơn nhiều hơn 1 lần');
    assert.strictEqual(lenh()[0].danhSach[0].maKH, 'PA');
    assert.strictEqual(lenh()[0].danhSach[0].soTien, 134040000);
});

test('không có extension → báo lỗi, KHÔNG nổ', async () => {
    const { tailieu, bang } = dungTrang();
    tailieu.defaultView.chrome = undefined;
    ChenCot.chenVao(bang);
    bang.querySelector('button.hdt-nut').click();
    tailieu.getElementById('hdt-xac-nhan').click();
    await new Promise(r => setTimeout(r, 30));
    assert.match(tailieu.getElementById('hdt-ket-qua-that').textContent, /Không gọi được extension/);
});

test('cầu nối trả về DỪNG → hiện đúng lý do cho người dùng', async () => {
    const { tailieu, bang } = dungTrang();
    tailieu.defaultView.chrome = { runtime: { sendMessage: async () => ({
        dung: true, ly_do: 'KHONG_CO_TAB_TENDOO',
        thongBao: 'Chưa mở trang bán hàng Tendoo. Hãy mở seller-v3...' }) } };
    ChenCot.chenVao(bang);
    bang.querySelector('button.hdt-nut').click();
    tailieu.getElementById('hdt-xac-nhan').click();
    for (let i = 0; i < 50 && !tailieu.getElementById('hdt-ket-qua-that'); i++) {
        await new Promise(r => setTimeout(r, 10));
    }
    await new Promise(r => setTimeout(r, 30));
    assert.match(tailieu.getElementById('hdt-ket-qua-that').textContent, /Chưa mở trang bán hàng/);
});

test('có khách lỗi → liệt kê từng khách kèm lý do', async () => {
    const { tailieu, bang } = dungTrang();
    tailieu.defaultView.chrome = { runtime: { sendMessage: async () => ({
        xong: [{ maKH: 'PA' }],
        loi: [{ maKH: 'TB', maLoi: 'LECH_QUA_200K', thongBao: 'chệnh nhau quá 200.000' }] }) } };
    ChenCot.chenVao(bang);
    bang.querySelector('button.hdt-nut').click();
    tailieu.getElementById('hdt-xac-nhan').click();
    await new Promise(r => setTimeout(r, 60));
    const chu = tailieu.getElementById('hdt-ket-qua-that').textContent;
    assert.match(chu, /1 khách mới vào giỏ/);
    assert.match(chu, /1 khách lỗi/);
    assert.match(chu, /TB.*chệnh nhau quá 200\.000/);
});

test('vai trò nhân viên bán hàng: cột vẫn chèn đúng, bảng vẫn khớp', () => {
    const { bang } = dungTrang({ isNVBH: true });
    ChenCot.chenVao(bang);
    assert.strictEqual(moiDongDuCot(bang), 7);
    assert.strictEqual(bang.querySelectorAll('input.hdt-tick').length, 4);
});

// ------------------------------------------------------------ không phá Sell
test('KHÔNG sửa bất kỳ ô nào có sẵn của Sell', () => {
    const { bang } = dungTrang();
    const truoc = [...bang.querySelectorAll('tbody tr')].map(tr =>
        [...tr.children].map(o => o.className + '|' + o.textContent).join('#'));
    ChenCot.chenVao(bang);
    const sau = [...bang.querySelectorAll('tbody tr')].map(tr =>
        [...tr.children].filter(o => !o.dataset.hdtCot)
            .map(o => o.className + '|' + o.textContent).join('#'));
    assert.deepStrictEqual(sau, truoc, 'nội dung ô cũ của Sell bị thay đổi');
});

test('KHÔNG đụng vào nút "Chi tiết" sẵn có của Sell', () => {
    const { bang } = dungTrang();
    ChenCot.chenVao(bang);
    // 5 chứ không phải 4: khách doanh thu 0 (X0) không xuất hóa đơn được nên
    // KHÔNG có ô tick của mình, nhưng Sell vẫn cho nó nút "Chi tiết" như thường.
    // Sell hiển thị thế nào là việc của Sell — mình không được can thiệp.
    const nutCu = bang.querySelectorAll('button[onclick*="xemChiTiet"]');
    assert.strictEqual(nutCu.length, 5);
    assert.ok(nutCu[0].getAttribute('onclick').startsWith('xemChiTiet(1,'));
});

// --------------------------------------------- nút khai báo tài khoản trên dòng
function ganChromeKho(tailieu, tinhTrang, caiDat = { tuBam: false, daHieu: false }) {
    const daHoi = [];
    tailieu.defaultView.chrome = { runtime: {
        getURL: (t) => 'chrome-extension://abcxyz/' + t,
        sendMessage: async (tin) => {
            daHoi.push(tin);
            if (tin.loai === 'hdt-hoi-cai-dat') return caiDat;
            if (tin.loai === 'hdt-tinh-trang-kho') return tinhTrang;
            return { xong: [], loi: [] };
        },
    } };
    return daHoi;
}

const KHO_TRONG = { coKho: false, dangMo: false, khach: {} };

test('mỗi dòng khách có thêm nút khai báo tài khoản, cạnh nút Tạo HĐ', async () => {
    const { tailieu, bang } = dungTrang();
    ganChromeKho(tailieu, KHO_TRONG);
    ChenCot.chenVao(bang);
    await new Promise(r => setTimeout(r, 40));
    assert.strictEqual(bang.querySelectorAll('button[data-hdt-khai-bao]').length, 4);
    const o = bang.querySelector('td[data-hdt-cot] button.hdt-nut').parentElement;
    assert.ok(o.querySelector('button[data-hdt-khai-bao]'),
        'nút khai báo không nằm cùng ô với nút Tạo HĐ');
});

test('nút khai báo mang ĐÚNG mã khách của dòng đó', async () => {
    const { tailieu, bang } = dungTrang();
    ganChromeKho(tailieu, KHO_TRONG);
    ChenCot.chenVao(bang);
    await new Promise(r => setTimeout(r, 40));
    const dong = [...bang.querySelectorAll('tbody tr')].find(tr => tr.dataset.ma === 'pa');
    assert.strictEqual(dong.querySelector('button[data-hdt-khai-bao]').dataset.hdtKhaiBao, 'PA');
});

test('khách đã khai báo và kho đã mở → nút xanh, khách chưa → nút xám', async () => {
    const { tailieu, bang } = dungTrang();
    ganChromeKho(tailieu, { coKho: true, dangMo: true,
                            khach: { PA: { daKhaiBao: true, daMoKhoa: true } } });
    ChenCot.chenVao(bang);
    await new Promise(r => setTimeout(r, 40));
    const cua = (ma) => bang.querySelector(`button[data-hdt-khai-bao="${ma}"]`);
    assert.strictEqual(cua('PA').dataset.hdtMuc, 'xong');
    assert.strictEqual(cua('TB').dataset.hdtMuc, 'chua');
});

test('kho đang khóa → hiện thanh nhắc nhập khóa mở ngay trên bảng', async () => {
    const { tailieu, bang } = dungTrang();
    ganChromeKho(tailieu, { coKho: true, dangMo: false,
                            khach: { PA: { daKhaiBao: true, daMoKhoa: false } } });
    ChenCot.chenVao(bang);
    await new Promise(r => setTimeout(r, 40));
    const thanh = tailieu.getElementById('hdt-thanh-khoa');
    assert.ok(thanh, 'không thấy thanh nhắc');
    assert.strictEqual(thanh.parentElement, bang.parentElement, 'thanh nhắc đặt sai chỗ');
});

test('bấm nút khai báo → mở khung iframe của extension, KHÔNG mở modal tạo hóa đơn', async () => {
    const { tailieu, bang } = dungTrang();
    ganChromeKho(tailieu, KHO_TRONG);
    ChenCot.chenVao(bang);
    await new Promise(r => setTimeout(r, 40));
    bang.querySelector('button[data-hdt-khai-bao]').click();
    assert.ok(tailieu.querySelector('iframe'), 'không mở khung khai báo');
    assert.strictEqual(tailieu.getElementById('hdt-modal'), null,
        'bấm khai báo mà lại mở modal tạo hóa đơn');
});

test('nút khai báo KHÔNG làm tick chọn khách bị bật theo', async () => {
    const { tailieu, bang } = dungTrang();
    ganChromeKho(tailieu, KHO_TRONG);
    ChenCot.chenVao(bang);
    await new Promise(r => setTimeout(r, 40));
    bang.querySelector('button[data-hdt-khai-bao]').click();
    assert.strictEqual(ChenCot.dsDaTick(bang).length, 0);
});

test('vẽ lại bảng → nút khai báo cũng được chèn lại đủ', async () => {
    const { tailieu, bang } = dungTrang();
    ganChromeKho(tailieu, KHO_TRONG);
    ChenCot.chenVao(bang);
    ChenCot.theoDoi(bang);
    veLaiBang(tailieu, KHACH_MAU.slice(0, 2));
    await doiMotNhip();
    await new Promise(r => setTimeout(r, 40));
    assert.strictEqual(bang.querySelectorAll('button[data-hdt-khai-bao]').length, 2);
});

test('KHÔNG có tiến trình nền → cột vẫn chèn xong, bảng vẫn khớp cột', async () => {
    const { tailieu, bang } = dungTrang();
    tailieu.defaultView.chrome = undefined;
    ChenCot.chenVao(bang);
    await new Promise(r => setTimeout(r, 40));
    assert.strictEqual(moiDongDuCot(bang), 10, 'mất cột khi không có nền');
});

test('⭐ thêm nút khai báo KHÔNG làm lệch số cột của bảng', async () => {
    const { tailieu, bang } = dungTrang();
    ganChromeKho(tailieu, KHO_TRONG);
    ChenCot.chenVao(bang);
    await new Promise(r => setTimeout(r, 40));
    assert.strictEqual(moiDongDuCot(bang), 10,
        'nút khai báo bị đặt thành cột riêng — bảng của Sell lệch');
});

// ---------------------------------------------------- gỡ lệnh bị ngắt giữa chừng
function ganChromeTreo(tailieu, treo, tra = { dung: true, ly_do: 'CO_LENH_TREO', thongBao: 'Có 1 lệnh bị ngắt giữa chừng chưa xử lý.' }) {
    const daGui = [];
    let conTreo = [...treo];
    tailieu.defaultView.chrome = { runtime: {
        getURL: (t) => 'chrome-extension://abcxyz/' + t,
        sendMessage: async (tin) => {
            daGui.push(tin);
            if (tin.loai === 'hdt-hoi-cai-dat') return { tuBam: false, daHieu: false };
            if (tin.loai === 'hdt-tinh-trang-kho') return { coKho: false, dangMo: false, khach: {} };
            if (tin.loai === 'hdt-lenh-treo') return { ok: true, treo: conTreo };
            if (tin.loai === 'hdt-xu-ly-treo') {
                conTreo = conTreo.filter(l => l.id !== tin.id);
                return { ok: true, conLai: conTreo };
            }
            return tra;
        },
    } };
    return { daGui, conTreo: () => conTreo };
}

const TREO_MAU = [{ id: 'L1', maKH: 'PA', tenKH: 'Phương Anh', soTien: 134040000,
                    batDauLuc: Date.UTC(2026, 7, 11, 3, 0), trangThai: 'treo' }];

async function bamXacNhan(tailieu, bang) {
    ChenCot.chenVao(bang);
    bang.querySelector('button.hdt-nut').click();
    await new Promise(r => setTimeout(r, 30));
    tailieu.getElementById('hdt-xac-nhan').click();
    for (let i = 0; i < 60 && !tailieu.getElementById('hdt-ket-qua-that'); i++) {
        await new Promise(r => setTimeout(r, 10));
    }
    await new Promise(r => setTimeout(r, 40));
}

test('⭐ có lệnh treo → hiện ĐƯỜNG GỠ, không để người dùng kẹt cứng', async () => {
    // Trước đây câu "Có 1 lệnh bị ngắt giữa chừng" là ngõ cụt: chạy lại bao nhiêu
    // lần cũng ra đúng câu đó, không có nút nào để thoát.
    const { tailieu, bang } = dungTrang();
    ganChromeTreo(tailieu, TREO_MAU);
    await bamXacNhan(tailieu, bang);

    assert.match(tailieu.getElementById('hdt-ket-qua-that').textContent, /bị ngắt giữa chừng/);
    const go = tailieu.getElementById('hdt-go-treo');
    assert.ok(go, '❌ không có đường gỡ — người dùng kẹt vĩnh viễn');
    assert.ok(go.querySelector('.hdt-treo-da-ra'), 'thiếu nút "đã ra rồi"');
    assert.ok(go.querySelector('.hdt-treo-chua-ra'), 'thiếu nút "chưa ra"');
});

test('màn gỡ nói rõ khách nào, bao nhiêu tiền, chạy lúc nào', async () => {
    const { tailieu, bang } = dungTrang();
    ganChromeTreo(tailieu, TREO_MAU);
    await bamXacNhan(tailieu, bang);
    const chu = tailieu.getElementById('hdt-go-treo').textContent;
    assert.match(chu, /PA/);
    assert.match(chu, /Phương Anh/);
    assert.match(chu, /134\.040\.000/);
    assert.match(chu, /Bắt đầu chạy lúc/);
});

test('⭐ màn gỡ bắt người dùng TỰ KIỂM TRA, không bảo máy tự đoán', async () => {
    const { tailieu, bang } = dungTrang();
    ganChromeTreo(tailieu, TREO_MAU);
    await bamXacNhan(tailieu, bang);
    const chu = tailieu.getElementById('hdt-go-treo').textContent;
    assert.match(chu, /mở Tendoo/i);
    assert.match(chu, /hóa đơn trùng/i);
});

test('bấm "đã ra rồi" → gửi kết luận ĐÚNG cho tiến trình nền', async () => {
    const { tailieu, bang } = dungTrang();
    const { daGui } = ganChromeTreo(tailieu, TREO_MAU);
    await bamXacNhan(tailieu, bang);
    tailieu.querySelector('.hdt-treo-da-ra').click();
    await new Promise(r => setTimeout(r, 40));
    const t = daGui.find(x => x.loai === 'hdt-xu-ly-treo');
    assert.ok(t, 'không gửi kết luận đi đâu cả');
    assert.strictEqual(t.id, 'L1');
    assert.strictEqual(t.daPhatHanh, true);
});

test('bấm "chưa ra" → gửi kết luận CHƯA phát hành', async () => {
    const { tailieu, bang } = dungTrang();
    const { daGui } = ganChromeTreo(tailieu, TREO_MAU);
    await bamXacNhan(tailieu, bang);
    tailieu.querySelector('.hdt-treo-chua-ra').click();
    await new Promise(r => setTimeout(r, 40));
    assert.strictEqual(daGui.find(x => x.loai === 'hdt-xu-ly-treo').daPhatHanh, false);
});

test('gỡ hết → báo có thể chạy tiếp, màn gỡ biến mất', async () => {
    const { tailieu, bang } = dungTrang();
    ganChromeTreo(tailieu, TREO_MAU);
    await bamXacNhan(tailieu, bang);
    tailieu.querySelector('.hdt-treo-da-ra').click();
    await new Promise(r => setTimeout(r, 60));
    assert.match(tailieu.getElementById('hdt-ket-qua-that').textContent, /chạy tiếp/);
    assert.strictEqual(tailieu.getElementById('hdt-go-treo'), null);
});

test('còn lệnh treo khác → nói rõ còn mấy cái, vẫn giữ màn gỡ', async () => {
    const { tailieu, bang } = dungTrang();
    ganChromeTreo(tailieu, [
        ...TREO_MAU,
        { id: 'L2', maKH: 'TB', tenKH: 'Trang Bé', soTien: 115825000, trangThai: 'treo' },
    ]);
    await bamXacNhan(tailieu, bang);
    assert.strictEqual(tailieu.querySelectorAll('.hdt-dong-treo').length, 2);
    tailieu.querySelector('.hdt-treo-da-ra').click();
    await new Promise(r => setTimeout(r, 60));
    assert.match(tailieu.getElementById('hdt-ket-qua-that').textContent, /Còn 1 lệnh treo/);
    assert.strictEqual(tailieu.querySelectorAll('.hdt-dong-treo').length, 1);
});

test('dừng vì lý do KHÁC (không phải treo) → KHÔNG bày màn gỡ ra', async () => {
    const { tailieu, bang } = dungTrang();
    ganChromeTreo(tailieu, TREO_MAU,
        { dung: true, ly_do: 'KHONG_CO_TAB', thongBao: 'Không mở được tab Tendoo.' });
    await bamXacNhan(tailieu, bang);
    assert.strictEqual(tailieu.getElementById('hdt-go-treo'), null,
        'bày màn gỡ lệnh treo trong khi lỗi là chuyện khác');
});

test('⭐ modal báo SẴN trạng thái công tắc thuế — tắt', async () => {
    // Không hiện sẵn thì phải chạy xong mới biết mình thiếu một bước.
    const { tailieu, bang } = dungTrang();
    ganChrome(tailieu, { tuBam: true, daHieu: true, boQuaThue: false });
    ChenCot.chenVao(bang);
    bang.querySelector('button.hdt-nut').click();
    await new Promise(r => setTimeout(r, 40));

    const chu = tailieu.getElementById('hdt-canh-bao').textContent;
    assert.match(chu, /"Bỏ qua cảnh báo thuế" đang TẮT/);
    assert.match(chu, /không ra hóa đơn/);
});

test('⭐ modal báo SẴN trạng thái công tắc thuế — bật, kèm hậu quả', async () => {
    const { tailieu, bang } = dungTrang();
    ganChrome(tailieu, { tuBam: true, daHieu: true, boQuaThue: true });
    ChenCot.chenVao(bang);
    bang.querySelector('button.hdt-nut').click();
    await new Promise(r => setTimeout(r, 40));

    const chu = tailieu.getElementById('hdt-canh-bao').textContent;
    assert.match(chu, /"Bỏ qua cảnh báo thuế" ĐANG BẬT/);
    assert.match(chu, /Tờ khai thuế/);
    assert.match(chu, /Sổ kế toán/);
});

test('công tắc tự bấm TẮT → không nói gì về thuế cho đỡ rối', async () => {
    // Tắt tự bấm thì máy không bao giờ bấm Thanh toán, nên chẳng bao giờ gặp
    // bảng thuế — nhắc tới nó chỉ tổ làm người dùng phân tâm.
    const { tailieu, bang } = dungTrang();
    ganChrome(tailieu, { tuBam: false, daHieu: false, boQuaThue: true });
    ChenCot.chenVao(bang);
    bang.querySelector('button.hdt-nut').click();
    await new Promise(r => setTimeout(r, 40));
    assert.strictEqual(tailieu.getElementById('hdt-canh-bao-thue'), null);
});

// ------------------------------- loạt bị dừng vẫn phải kể đủ đã làm được gì
test('⭐ loạt bị DỪNG giữa chừng → vẫn liệt kê khách ĐÃ XONG kèm số tiền', async () => {
    // Trước đây nhánh "dừng" chỉ hiện mỗi câu lỗi và VỨT BỎ danh sách đã xong.
    // Với công tắc tự bấm đang bật, nghĩa là hóa đơn THẬT đã ra mà màn hình
    // không hề nói — người dùng chạy lại là ra hóa đơn trùng.
    const { tailieu, bang } = dungTrang();
    ganChromeTreo(tailieu, [], {
        dung: true, ly_do: 'SAI_TAI_KHOAN', thongBao: 'Sai tài khoản, đã dừng.',
        xong: [{ maKH: 'PA', tenKH: 'Phương Anh',
                 ketQua: { tong: 1676320, daBamThanhToan: true } }],
        loi: [],
    });
    await bamXacNhan(tailieu, bang);

    const chu = tailieu.getElementById('hdt-ket-qua-that').textContent;
    assert.match(chu, /Sai tài khoản/);
    assert.match(chu, /ĐÃ PHÁT HÀNH 1 hóa đơn/, '❌ giấu mất khách đã ra hóa đơn');
    assert.match(chu, /ĐỪNG chạy lại/);
    assert.match(chu, /PA/);
    assert.match(chu, /1\.676\.320/, 'không nói số tiền đã xuất');
});

test('loạt bị dừng mà CHƯA xong khách nào → không bịa ra dòng thừa', async () => {
    const { tailieu, bang } = dungTrang();
    ganChromeTreo(tailieu, [], {
        dung: true, ly_do: 'KHONG_CO_TAB', thongBao: 'Không mở được tab.', xong: [], loi: [],
    });
    await bamXacNhan(tailieu, bang);
    assert.ok(!/ĐÃ PHÁT HÀNH/.test(tailieu.getElementById('hdt-ket-qua-that').textContent));
});

test('⭐ ĐÃ RA HÓA ĐƠN và MỚI VÀO GIỎ phải đếm RIÊNG, không gộp', async () => {
    // Đây chính là lỗi người dùng báo: màn hình ghi "Xong 2 khách" trong khi
    // thực tế chỉ có 1 hóa đơn, khách còn lại mới chỉ được bỏ hàng vào giỏ.
    const { tailieu, bang } = dungTrang();
    ganChromeTreo(tailieu, [], {
        dung: false,
        xong: [
            { maKH: 'PA', tenKH: 'hoa', ketQua: { tong: 1676320, daBamThanhToan: true } },
            { maKH: 'TB', tenKH: 'tiền', ketQua: { tong: 1142016, daBamThanhToan: false,
                                                chuThich: 'Công tắc tự bấm đang TẮT' } },
        ],
        loi: [],
    });
    await bamXacNhan(tailieu, bang);
    const chu = tailieu.getElementById('hdt-ket-qua-that').textContent;

    assert.ok(!/Xong 2 khách/.test(chu), '❌ VẪN GỘP — đúng lỗi người dùng báo');
    assert.match(chu, /đã phát hành 1 hóa đơn/i);
    assert.match(chu, /1 khách mới vào giỏ/i);
    assert.match(chu, /ĐÃ PHÁT HÀNH 1 hóa đơn THẬT/);
    assert.match(chu, /MỚI BỎ VÀO GIỎ, CHƯA phát hành/);
    assert.match(chu, /Công tắc tự bấm đang TẮT/, 'không nói vì sao khách kia chưa ra');
});

test('chạy trọn vẹn, CÓ hóa đơn thật → báo đúng số hóa đơn', async () => {
    const { tailieu, bang } = dungTrang();
    ganChromeTreo(tailieu, [], {
        dung: false,
        xong: [{ maKH: 'PA', ketQua: { tong: 1, daBamThanhToan: true } }],
        loi: [{ maKH: 'TB', thongBao: 'thiếu hàng' }],
    });
    await bamXacNhan(tailieu, bang);
    const chu = tailieu.getElementById('hdt-ket-qua-that').textContent;
    assert.match(chu, /Đã phát hành 1 hóa đơn, 1 khách lỗi/);
    assert.match(chu, /TB: thiếu hàng/);
});

test('⭐ KHÔNG hóa đơn nào ra → KHÔNG được tô xanh như thành công', async () => {
    const { tailieu, bang } = dungTrang();
    ganChromeTreo(tailieu, [], {
        dung: false,
        xong: [{ maKH: 'PA', ketQua: { tong: 1, daBamThanhToan: false } }],
        loi: [],
    });
    await bamXacNhan(tailieu, bang);
    const o = tailieu.getElementById('hdt-ket-qua-that');
    assert.ok(!o.className.includes('ok'), '❌ tô xanh trong khi chưa có hóa đơn nào');
});

test('⭐ hóa đơn ra khi CHƯA thiết lập thuế → liệt kê RIÊNG bằng chữ đỏ', async () => {
    // Người dùng cần đúng danh sách này khi làm sổ sách — giấu đi là để họ
    // tự phát hiện sau, lúc đã muộn.
    const { tailieu, bang } = dungTrang();
    ganChromeTreo(tailieu, [], {
        dung: false,
        xong: [
            { maKH: 'PA', tenKH: 'hoa', ketQua: { tong: 1676320, daBamThanhToan: true } },
            { maKH: 'TB', tenKH: 'tiền',
              ketQua: { tong: 1142016, daBamThanhToan: true, daBoQuaThue: true } },
        ],
        loi: [],
    });
    await bamXacNhan(tailieu, bang);
    const chu = tailieu.getElementById('hdt-ket-qua-that').textContent;

    assert.match(chu, /Đã phát hành 2 hóa đơn/i);
    assert.match(chu, /1 trong số đó phát hành khi CHƯA thiết lập quản lý thuế/);
    assert.match(chu, /Tờ khai thuế/);
    // Phải nêu ĐÚNG khách bị ảnh hưởng, không nêu bừa cả hai.
    const dong = [...tailieu.querySelectorAll('#hdt-ket-qua-that .hdt-hang')]
        .map(e => e.textContent).filter(x => x.trim().startsWith('·'));
    assert.strictEqual(dong.length, 1, 'liệt kê sai số khách bỏ qua thuế');
    assert.match(dong[0], /TB/);
});

test('không hóa đơn nào bỏ qua thuế → KHÔNG hiện cảnh báo thừa', async () => {
    const { tailieu, bang } = dungTrang();
    ganChromeTreo(tailieu, [], {
        dung: false,
        xong: [{ maKH: 'PA', ketQua: { tong: 1, daBamThanhToan: true } }],
        loi: [],
    });
    await bamXacNhan(tailieu, bang);
    assert.ok(!/CHƯA thiết lập quản lý thuế/.test(
        tailieu.getElementById('hdt-ket-qua-that').textContent));
});

// ------------------------------------------------- công tắc tự bấm hiện trên modal

function ganChrome(tailieu, caiDat, daGui = []) {
    tailieu.defaultView.chrome = { runtime: { sendMessage: async (tin) => {
        daGui.push(tin);
        if (tin.loai === 'hdt-hoi-cai-dat') return caiDat;
        return { xong: [{}], loi: [] };
    } } };
    return daGui;
}

test('công tắc TẮT → modal nói máy sẽ DỪNG ở giỏ hàng', async () => {
    const { tailieu, bang } = dungTrang();
    ganChrome(tailieu, { tuBam: false, daHieu: false });
    ChenCot.chenVao(bang);
    bang.querySelector('button.hdt-nut').click();
    await new Promise(r => setTimeout(r, 40));

    const canh = tailieu.getElementById('hdt-canh-bao');
    assert.match(canh.textContent, /bỏ hàng vào giỏ rồi DỪNG/);
    assert.match(canh.textContent, /bạn tự bấm Thanh toán/);
    assert.ok(!canh.className.includes('hdt-do'), 'tô đỏ dù công tắc đang tắt');
});

test('⚠ công tắc BẬT → modal cảnh báo ĐỎ, nói rõ sẽ ra hóa đơn thật', async () => {
    const { tailieu, bang } = dungTrang();
    ganChrome(tailieu, { tuBam: true, daHieu: true });
    ChenCot.chenVao(bang);
    bang.querySelector('button.hdt-nut').click();
    await new Promise(r => setTimeout(r, 40));

    const canh = tailieu.getElementById('hdt-canh-bao');
    assert.match(canh.textContent, /TỰ BẤM THANH TOÁN ĐANG BẬT/);
    assert.match(canh.textContent, /HÓA ĐƠN THẬT/);
    assert.match(canh.textContent, /Không có bước dừng nào nữa/);
    assert.ok(canh.className.includes('hdt-do'), 'phải tô đỏ khi công tắc bật');
});

test('bật lớp trên nhưng CHƯA xác nhận → vẫn báo là sẽ dừng ở giỏ', async () => {
    const { tailieu, bang } = dungTrang();
    ganChrome(tailieu, { tuBam: true, daHieu: false });
    ChenCot.chenVao(bang);
    bang.querySelector('button.hdt-nut').click();
    await new Promise(r => setTimeout(r, 40));
    assert.match(tailieu.getElementById('hdt-canh-bao').textContent, /DỪNG/);
});

test('modal nói rõ máy TỰ MỞ tab Tendoo nếu chưa có', async () => {
    const { tailieu, bang } = dungTrang();
    ganChrome(tailieu, { tuBam: false, daHieu: false });
    ChenCot.chenVao(bang);
    bang.querySelector('button.hdt-nut').click();
    await new Promise(r => setTimeout(r, 40));
    assert.match(tailieu.getElementById('hdt-canh-bao').textContent, /máy tự mở, xong tự đóng/);
});

chay('CHÈN CỘT VÀO BẢNG BÁO CÁO');
