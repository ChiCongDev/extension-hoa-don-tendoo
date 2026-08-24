'use strict';

// ============================================================================
//  BA BẢN VÁ NGÀY 22/08/2026 — sau khi bốn lượt liên tiếp hỏng trong IM LẶNG.
//
//  Diễn biến thật: lượt 11:29 hỏng và để lại một rổ 1.450.000đ trong giỏ. Từ
//  đó mọi lượt sau đều chết ở cửa "giỏ phải trống", KHÔNG dọn được, và — đây
//  mới là chỗ độc — KHÔNG NÓI RA. Bảng lịch sử hiện trơ "1 chưa chạy tới",
//  Telegram im thin thít. Người dùng chỉ thấy "extension không hoạt động".
//
//  A. Thôi nói dối về "lượt này có chạy" (chung/lichSuChay.js + background.js)
//  B. Nhận nút xóa dòng cho chắc, và trượt thì phải KHAI RA (tendoo/boGio.js)
//  C. Khôi phục phép đối chiếu hai nguồn ở chân giỏ (tendoo/boGio.js)
// ============================================================================

const assert = require('assert');
const { taoTrangPos, HANG_MAU } = require('./trangPosGiaLap');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const dungTaiLieu = (html) =>
    new JSDOM('<!doctype html><body>' + html + '</body>').window.document;

require('../chung/domReact');
const BoGio = require('../tendoo/boGio');
const BamThanhToan = require('../tendoo/bamThanhToan');
const LichSuChay = require('../chung/lichSuChay');
const BaoTelegram = require('../chung/baoTelegram');

let dat = 0, hong = 0;
const cho = [];
function test(ten, fn) { cho.push([ten, fn]); }
function ghiChu(chu) { cho.push([chu, null]); }

// ────────────────────────────────────────────────────────────────────────────
ghiChu('— A. LƯỢT KHÔNG CHẠY PHẢI NÓI LÀ KHÔNG CHẠY —');

test('⭐⭐⭐ cầu nối bỏ cuộc ở TẦNG LƯỢT → daChay() phải nói KHÔNG', () => {
    // Đúng thứ cauNoi.js trả về khi giỏ còn hàng: dừng trước khi đụng khách nào.
    for (const lyDo of ['DANG_CHAY', 'KHONG_CO_TAB', 'TAB_CHUA_SAN_SANG',
                        'GIO_KHONG_TRONG', 'KHONG_CO_KHACH']) {
        const tra = { dung: true, ly_do: lyDo, thongBao: 'vì lý do ' + lyDo };
        assert.strictEqual(LichSuChay.daChay(tra), false, 'lý do: ' + lyDo);
    }
});

test('⭐⭐ làm được DÙ CHỈ MỘT khách thì vẫn là CÓ chạy', () => {
    // ⚠️ Lối chạy tay cũ chỉ đếm `xong`. Lượt hỏng ngay khách đầu sẽ bị khai là
    // "cả lượt KHÔNG chạy" — trong khi khách ấy đã có tin Telegram riêng rồi.
    // Bắn thêm tin "cả lượt không chạy" nữa là báo sai, và báo sai thì lần sau
    // người dùng không tin tin nào nữa.
    assert.strictEqual(LichSuChay.daChay({ dung: true, xong: [], loi: [{ id: 'a' }] }), true,
        'có một khách LỖI mà vẫn khai là cả lượt không chạy');
    assert.strictEqual(LichSuChay.daChay({ dung: true, xong: [], treo: [{ id: 'a' }] }), true,
        'có một khách TREO mà vẫn khai là cả lượt không chạy');
    assert.strictEqual(LichSuChay.daChay({ dung: true, xong: [{ id: 'a' }] }), true);
    assert.strictEqual(LichSuChay.daChay({ dung: false, xong: [], loi: [], treo: [] }), true);
});

test('⛔ không có kết quả gì → coi là KHÔNG chạy, để nó phải KÊU', () => {
    for (const x of [null, undefined, 'rác', 0, []]) {
        assert.strictEqual(LichSuChay.daChay(x), false, 'với ' + JSON.stringify(x));
    }
});

test('⭐⭐⭐ bản ghi phải MANG THEO lý do, không được nuốt', () => {
    // Đây chính là bản ghi 14:41 ngày 22/08 mà người dùng chụp màn hình gửi về.
    const tra = { dung: true, ly_do: 'GIO_KHONG_TRONG',
                  thongBao: 'Giỏ hàng trên tab Tendoo đang có sẵn 1 món và không dọn được.' };
    const b = LichSuChay.taoBanGhi({
        nguon: 'HEN_GIO', moc: '14:41', ngay: { tu: '22/08/2026' },
        chay: LichSuChay.daChay(tra),
        lyDo: tra.ly_do, thongBao: tra.thongBao,
        trongLich: [{ maKH: 'KH2607160003', tenKH: 'ki?n' }], ketQua: tra,
    });
    assert.strictEqual(b.chay, false);
    assert.match(LichSuChay.tomTat(b), /KHÔNG chạy/,
        '⛔ vẫn khoe "1 chưa chạy tới" mà giấu lý do — đúng lỗi 22/08');
    assert.match(LichSuChay.tomTat(b), /không dọn được/, 'lý do bị nuốt: ' + LichSuChay.tomTat(b));
});

test('⭐⭐⭐ và Telegram PHẢI nổ — cửa `chay !== false` mở được', async () => {
    // ⚠️ baoLuot() có cửa `if (b.chay !== false) return`. Đóng đinh chay:true là
    // khoá luôn cửa ấy: cả lượt hỏng mà người dùng KHÔNG NHẬN ĐƯỢC GÌ.
    const daGui = [];
    const kho = { doc: async () => ({}), ghi: async () => {} };
    // ⚠️ `layFetch` LÀ hàm fetch, không phải nhà máy sinh ra fetch. Viết lồng
    // thêm một tầng thì guiTin() nhận về một hàm thay vì một Response, và bài
    // kiểm đỏ vì CHÍNH NÓ sai — đỏ sai lý do thì vô giá trị y như xanh sai.
    const layFetch = async (u, o) => {
        daGui.push(JSON.parse(o.body).text);
        return { ok: true, json: async () => ({ ok: true, result: {} }) };
    };
    const tra = { dung: true, ly_do: 'GIO_KHONG_TRONG', thongBao: 'giỏ còn 1 món, không dọn được' };
    const b = LichSuChay.taoBanGhi({
        nguon: 'HEN_GIO', moc: '14:41', ngay: { tu: '22/08/2026' },
        chay: LichSuChay.daChay(tra), lyDo: tra.ly_do, thongBao: tra.thongBao,
        trongLich: [{ maKH: 'KH2607160003', tenKH: 'ki?n' }], ketQua: tra,
    });
    const kq = await BaoTelegram.baoLuot({
        banGhi: b, caiDat: { telegramToken: 'tk', telegramChatId: 'ct' },
        kho, layFetch, luc: Date.now(),
    });
    assert.strictEqual(kq.daGui, 1, '⛔ KHÔNG gửi Telegram: ' + JSON.stringify(kq));
    assert.match(daGui[0], /Cả lượt KHÔNG chạy/);
    assert.match(daGui[0], /không dọn được/, 'tin không mang lý do: ' + daGui[0]);
    assert.match(daGui[0], /ki\?n/, 'tin không kể tên khách bị bỏ lỡ: ' + daGui[0]);
});

test('⛔ lượt CÓ chạy thì TUYỆT ĐỐI không bắn thêm tin "cả lượt không chạy"', async () => {
    // Từng khách đã có tin riêng rồi — thêm tin nữa là tin rác, và tin rác giết
    // luôn giá trị của những tin thật.
    const kho = { doc: async () => ({}), ghi: async () => {} };
    const tra = { dung: true, xong: [], loi: [{ id: 'l1', maKH: 'A', tenKH: 'A', thongBao: 'x' }] };
    const b = LichSuChay.taoBanGhi({
        nguon: 'HEN_GIO', moc: '14:41', chay: LichSuChay.daChay(tra),
        trongLich: [{ maKH: 'A', tenKH: 'A' }], ketQua: tra,
    });
    const kq = await BaoTelegram.baoLuot({
        banGhi: b, caiDat: { telegramToken: 'tk', telegramChatId: 'ct' },
        kho, layFetch: async () => { throw new Error('KHÔNG ĐƯỢC GỬI'); }, luc: Date.now(),
    });
    assert.strictEqual(kq.daGui, 0);
    assert.strictEqual(kq.hong, 0, 'đã thử gửi trong khi không được phép gửi');
});

// ────────────────────────────────────────────────────────────────────────────
ghiChu('— A2. VÀ CHỖ NỐI TRONG TIẾN TRÌNH NỀN PHẢI THẬT SỰ DÙNG NÓ —');

// ⚠️ VÌ SAO PHẢI CÓ KHÚC NÀY, dù daChay() đã có bài kiểm riêng ở trên.
// Vòng gài lỗi đầu tiên cho thấy: gài lại y nguyên lỗi 22/08 — đóng đinh
// `chay: true` ngay tại chỗ gọi trong background.js — mà TOÀN BỘ bài kiểm vẫn
// XANH. Vì chúng chỉ đo cái hàm, không đo SỢI DÂY nối hàm ấy vào máy. Kiểm cái
// bóng đèn còn tốt thì chứng minh được gì khi dây điện đã bị cắt.
//
// background.js là service worker (importScripts, chrome.*), không nạp thẳng
// vào node được. Dự án đã có sẵn lối đọc MÃ NGUỒN để chốt chỗ nối — dùng lại,
// nhưng đòi ĐÚNG CÂU LỆNH chứ không chỉ đòi cái tên có mặt.
const maNen = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
// ⚠️ GỠ CHÚ THÍCH TRƯỚC KHI SOI. Câu cảnh báo "KHÔNG được đóng đinh chay:true"
// nằm ngay trong chú thích — soi cả chú thích thì bài đỏ vì CHÍNH LỜI CẢNH BÁO,
// đúng kiểu đỏ sai lý do, vô giá trị y như xanh sai lý do.
const maThat = maNen.split('\n').filter(d => !/^\s*\/\//.test(d)).join('\n');

test('⭐⭐⭐ lối HẸN GIỜ phải hỏi daChay(), không được đóng đinh', () => {
    assert.match(maNen, /moc, chay: self\.HDT_LichSuChay\.daChay\(tra\),/,
        '⛔ chỗ nối lối hẹn giờ không dùng daChay — đúng lỗi 22/08 quay lại');
    assert.ok(!/chay: true/.test(maThat),
        '⛔ còn chỗ ĐÓNG ĐINH chay:true trong tiến trình nền');
});

test('⭐⭐⭐ và phải CHUYỂN TIẾP lý do của hàng đợi vào bản ghi', () => {
    // Thiếu hai chữ này thì bản ghi rỗng lý do, bảng hiện trơ "chưa chạy tới",
    // và soanTinLuot() nhắn về Telegram đúng một câu "Lý do: không rõ".
    assert.match(maNen,
        /lyDo: \(tra && tra\.ly_do\) \|\| '', thongBao: \(tra && tra\.thongBao\) \|\| '',/,
        '⛔ lý do của hàng đợi bị vứt trên đường vào bản ghi');
});

test('⭐⭐ lối CHẠY TAY dùng chung một luật, không tụt lại bản cũ', () => {
    assert.match(maNen, /chay: self\.HDT_LichSuChay\.daChay\(kq\),/,
        '⛔ lối chạy tay vẫn dùng luật riêng');
    assert.ok(!/chay: !\(kq && kq\.dung/.test(maThat),
        '⛔ luật cũ "chỉ đếm xong" còn sót — sẽ báo oan "cả lượt không chạy"');
});

test('⛔ daChay phải được XUẤT RA, không thì tiến trình nền gọi vào hư vô', () => {
    assert.strictEqual(typeof LichSuChay.daChay, 'function');
});

// ────────────────────────────────────────────────────────────────────────────
ghiChu('— B. NÚT XÓA: nhận cho chắc, trượt thì phải KHAI RA —');

const DONG = (them) => dungTaiLieu(
    '<div id="d">'
    + '<button title="Giảm"><svg><path d="M19 13H5v-2h14v2z"></path></svg></button>'
    + '<input type="text" value="2">'
    + '<button title="Tăng"><svg><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"></path></svg></button>'
    + '<button class="ant-btn ant-btn-icon-only" id="nhanBan">'
    + '<span class="anticon anticon-copy"><svg data-icon="copy"></svg></span></button>'
    + them + '</div>').getElementById('d');

const THUNG_TRON_TRUI = '<button class="ant-btn ant-btn-icon-only" id="thung">'
    + '<span role="img" class="anticon anticon-delete">'
    + '<svg data-icon="delete" viewBox="64 64 896 896">'
    + '<path d="M292.7 840h438.6l24.2-512h-487z"></path></svg></span></button>';

test('⭐⭐⭐ thùng rác KHÔNG lớp "dangerous", KHÔNG nhãn → vẫn phải nhận ra', () => {
    // Ảnh trang thật 22/08/2026: thùng rác màu XÁM, cạnh nút nhân bản, cả hai
    // đều không chữ. Hai đường nhận dạng cũ đều trượt -> khóa chết ở "không dọn
    // được giỏ", và đó là vòng lặp đã chặn cả bốn lượt trong ngày.
    const n = BoGio.timNutXoaDong(DONG(THUNG_TRON_TRUI));
    assert.ok(n, '⛔ không nhận ra thùng rác — cả lượt sẽ khóa chết');
    assert.strictEqual(n.id, 'thung');
});

test('⛔⛔ và VẪN không được vơ nhầm nút NHÂN BẢN', () => {
    // Biểu tượng "copy" cũng là một anticon-* không chữ y hệt. Nhận theo tên
    // biểu tượng mà nhận ẩu thì mỗi cú bấm làm giỏ DÀI THÊM một dòng.
    assert.strictEqual(BoGio.timNutXoaDong(DONG('')), null,
        '⛔ vơ nhầm nút nhân bản — giỏ sẽ phình ra chứ không hết');
    assert.strictEqual(BoGio.coBieuTuongXoa(
        dungTaiLieu('<button id="b"><span class="anticon anticon-copy"></span></button>')
            .getElementById('b')), false);
});

test('⛔ lớp "dangerous" VẪN được ưu tiên hơn tên biểu tượng', () => {
    // Tên lớp do thư viện đặt — đổi thư viện là mất. Đường chắc hơn phải thắng.
    const k = DONG('<button class="ant-btn ant-btn-dangerous" id="that"></button>'
        + THUNG_TRON_TRUI.replace('id="thung"', 'id="giaMao"'));
    assert.strictEqual(BoGio.timNutXoaDong(k).id, 'that');
});

test('⭐⭐⭐ chịu thua thì phải KỂ RA MÌNH THẤY GÌ, không nói trống không', async () => {
    // ⚠️ Câu "không tìm thấy nút xóa" là đúng nhưng vô dụng: tôi vẫn phải ngồi
    // đoán giao diện mới, người dùng thì không có gì để gửi đi. Kèm bằng chứng
    // vào thì LẦN HỎNG SAU TỰ NÓ LÀ BẢN CHỤP GIAO DIỆN.
    const t = taoTrangPos({ gioBanDau: [{ ten: HANG_MAU[0].ten }],
                            giaoDienMoi: true, kieuNutXoa: 'voDanh' });
    const kq = await BoGio.xoaSachGio(t.tailieu, { nghi: async () => {}, hanXoaDong: 0 });
    assert.strictEqual(kq.ok, false);
    assert.match(kq.thongBao, /CÁC NÚT TRONG DÒNG/, 'không kèm bằng chứng: ' + kq.thongBao);
    assert.match(kq.thongBao, /ant-btn/, 'không kể lớp CSS: ' + kq.thongBao);
    assert.match(kq.thongBao, /Tách dòng/, 'không kể nhãn nút bên cạnh: ' + kq.thongBao);
    assert.match(kq.thongBao, /hình=/, 'không kể hình vẽ để phân biệt − và +: ' + kq.thongBao);
});

test('⭐⭐ thùng rác chỉ có biểu tượng → DỌN SẠCH được giỏ thật', async () => {
    const t = taoTrangPos({ gioBanDau: [{ ten: HANG_MAU[0].ten }, { ten: HANG_MAU[1].ten }],
                            giaoDienMoi: true, kieuNutXoa: 'bieuTuong' });
    assert.strictEqual(BoGio.docCacDongGio(t.tailieu).length, 2);
    const kq = await BoGio.xoaSachGio(t.tailieu, { nghi: async () => {} });
    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.strictEqual(t.xemGio().length, 0, '⛔ giỏ chưa sạch — lượt sau vẫn bị chặn');
});

// ────────────────────────────────────────────────────────────────────────────
ghiChu('— C. CHÂN GIỎ: đọc theo VỊ TRÍ, và phải đối chiếu —');

test('⭐⭐⭐ giao diện mới mất nhãn → vẫn đọc được tổng ở chân giỏ', () => {
    const t = taoTrangPos({ gioBanDau: [{ ten: HANG_MAU[0].ten, soLuong: 2 }],
                            giaoDienMoi: true, khongCoDongTong: true });
    assert.strictEqual(BoGio.docTongTheoNhan(t.tailieu), null, 'giao diện mới vẫn còn nhãn?');
    assert.strictEqual(BoGio.docTongChanGio(t.tailieu), HANG_MAU[0].gia * 2,
        '⛔ không đọc nổi chân giỏ — lưới an toàn hai nguồn vẫn chết');
});

test('⭐⭐⭐ chân giỏ LỆCH với tổng các dòng → DỪNG, đúng cảnh trong ảnh 22/08', () => {
    // Ảnh trang thật: giỏ đúng MỘT dòng 1.450.000, chân giỏ ghi 2.300.000.
    // Một trong hai sai. Tin bên nào cũng có thể ra hóa đơn thuế sai tiền.
    const t = taoTrangPos({ gioBanDau: [{ ten: HANG_MAU[0].ten }],
                            giaoDienMoi: true, khongCoDongTong: true,
                            chanGioLech: HANG_MAU[0].gia + 850000 });
    assert.strictEqual(BoGio.docTongChanGio(t.tailieu), HANG_MAU[0].gia + 850000);
    assert.strictEqual(BoGio.docTongTuCacDong(t.tailieu), HANG_MAU[0].gia);
    assert.strictEqual(BoGio.docTongGio(t.tailieu), null,
        '⛔ hai nguồn lệch nhau mà vẫn chọn bừa một bên — ra hóa đơn thuế sai tiền');
});

test('⛔⛔ chân giỏ có NHIỀU con số khác nhau → trả null, KHÔNG vơ số đầu tiên', () => {
    // Chân giỏ thật có thể mọc thêm dòng "Giảm giá", "Phí giao hàng"… Vơ đại con
    // số gặp đầu tiên là đúng kiểu đoán mò đã đẻ ra lỗi 841.450.000 — và ở đây
    // nó còn tệ hơn: con số ấy sẽ đi đối chiếu với tổng các dòng rồi bắt DỪNG
    // oan, hoặc tệ hơn nữa là tình cờ trùng và cho phát hành sai tiền.
    const d = dungTaiLieu(
        '<div id="chan">'
        + '<div>Giảm giá: <span>100.000</span> đ</div>'
        + '<div>Tổng: <span>2.300.000</span> đ</div>'
        + '<div><button>Lưu đơn (F2)</button><button>Thanh toán (F1)</button></div>'
        + '</div>');
    assert.strictEqual(BoGio.docTongChanGio(d), null,
        '⛔ vơ đại một con số ở chân giỏ');
});

test('⛔⛔ chân giỏ không có số → KHÔNG được lấy tiền của DÒNG GIỎ thay vào', () => {
    // ⚠️ Đây là cái bẫy tinh vi nhất của cả bản vá C. Leo từ nút "Thanh toán"
    // lên đủ cao thì gặp ngay các dòng giỏ. Đọc tiền ở đó rồi gọi là "chân giỏ"
    // thì docTongGio() đang đối chiếu tổng các dòng VỚI CHÍNH NÓ — hai nguồn
    // luôn luôn đồng ý, lưới an toàn trông vẫn còn nguyên mà thật ra đã chết.
    const t = taoTrangPos({ gioBanDau: [{ ten: HANG_MAU[0].ten }], giaoDienMoi: true });
    for (const id of ['dongTongTt', 'dongTongSp']) {
        const o = t.tailieu.getElementById(id);
        if (o) o.remove();
    }
    assert.strictEqual(BoGio.docTongChanGio(t.tailieu), null,
        '⛔ đang đối chiếu tổng các dòng với CHÍNH NÓ — lưới hai nguồn đã chết');
});

test('⛔⛔ chân giỏ mất nút → KHÔNG được neo sang nút của BẢNG XÁC NHẬN', () => {
    // Bảng xác nhận cũng có chữ "thanh toán" và cũng có số tiền. Lúc nó đang mở,
    // nút "Thanh toán (F1)" ở chân giỏ có thể đã bị React tháo đi — và nếu neo
    // sang bảng thì mình đang đối chiếu giỏ với CHÍNH CÁI BẢNG cần đối chiếu.
    const t = taoTrangPos({ gioBanDau: [{ ten: HANG_MAU[0].ten }], giaoDienMoi: true });
    t.tailieu.getElementById('nutThanhToan').remove();
    const bang = t.tailieu.createElement('div');
    bang.setAttribute('role', 'dialog');
    bang.className = 'ant-modal';
    bang.innerHTML = '<div>Tổng cộng <span>9.999.000</span> đ</div>'
        + '<button>Xác nhận thanh toán</button>';
    t.tailieu.body.appendChild(bang);
    assert.strictEqual(BoGio.docTongChanGio(t.tailieu), null,
        '⛔ đã neo vào bảng xác nhận thay vì chân giỏ');
});

test('⛔ và cũng KHÔNG được neo vào BẢNG NỔI CỦA CHÍNH MÌNH', () => {
    // Bảng "Ghép hóa đơn" có ô "Số tiền cần khớp" và chữ "Thanh toán" trong
    // nhãn công tắc. Neo vào đó là đọc con số do chính mình vừa gõ vào.
    const t = taoTrangPos({ gioBanDau: [{ ten: HANG_MAU[0].ten }], giaoDienMoi: true });
    t.tailieu.getElementById('nutThanhToan').remove();
    const bang = t.tailieu.createElement('div');
    bang.id = 'hdt-bang-thu';
    bang.innerHTML = '<div>Số tiền cần khớp <span>3.000.000</span></div>'
        + '<button>Tự bấm Thanh toán</button>';
    t.tailieu.body.appendChild(bang);
    assert.strictEqual(BoGio.docTongChanGio(t.tailieu), null,
        '⛔ đã đọc con số trên bảng nổi của chính extension');
});

test('⭐ giỏ trống → chân giỏ không có, trả null chứ không nổ', () => {
    const t = taoTrangPos({ giaoDienMoi: true });
    assert.strictEqual(BoGio.docTongChanGio(t.tailieu), null);
    assert.strictEqual(BoGio.docTongGio(t.tailieu), null);
});

test('⛔⛔ giỏ CÓ hàng mà không cộng nổi các dòng → null, dù chân giỏ đọc được', () => {
    // Dòng tự mâu thuẫn nghĩa là mình đang đọc sai giao diện — và lúc ấy con số
    // ở chân giỏ cũng chẳng đáng tin hơn. Bản cũ vẫn nhắm mắt tin cái nhãn.
    const t = taoTrangPos({ gioBanDau: [{ ten: HANG_MAU[0].ten, soLuong: 2 }],
                            giaoDienMoi: true, thanhTienSai: true });
    assert.notStrictEqual(BoGio.docTongChanGio(t.tailieu), null, 'chân giỏ phải đọc được');
    assert.strictEqual(BoGio.docTongTuCacDong(t.tailieu), null);
    assert.strictEqual(BoGio.docTongGio(t.tailieu), null,
        '⛔ dòng giỏ tự mâu thuẫn mà vẫn dám kết luận tổng');
});

test('⭐ giao diện CŨ: nhãn và các dòng và chân giỏ cùng đồng ý', () => {
    const t = taoTrangPos({ gioBanDau: [{ ten: HANG_MAU[0].ten, soLuong: 2 }] });
    const mong = HANG_MAU[0].gia * 2;
    assert.strictEqual(BoGio.docTongTheoNhan(t.tailieu), mong);
    assert.strictEqual(BoGio.docTongChanGio(t.tailieu), mong);
    assert.strictEqual(BoGio.docTongGio(t.tailieu), mong);
});

// ────────────────────────────────────────────────────────────────────────────
ghiChu('— ĐO THEO ẢNH CHỤP TRANG THẬT 22/08/2026, không theo trí nhớ —');

test('⭐⭐⭐ nút đổi chữ thành "Thanh toán & Xuất hóa đơn (F1)" → vẫn phải nhận ra', () => {
    // Ảnh chụp 22/08: Tendoo đổi chữ trên nút chân giỏ. Dò bằng phép SO KHỚP
    // TRỌN VẸN thì trượt sạch, và cả hai việc dưới đây chết theo:
    //   · bamThanhToan không tìm ra nút để bấm
    //   · docTongChanGio mất chỗ neo -> lưới đối chiếu hai nguồn chết
    const t = taoTrangPos({ gioBanDau: [{ ten: HANG_MAU[0].ten }], giaoDienMoi: true });
    const nut = t.tailieu.getElementById('nutThanhToan');
    assert.match(nut.textContent, /Xuất hóa đơn/, 'trang giả chưa dựng đúng chữ mới');
    assert.ok(BamThanhToan.timNutThanhToan(t.tailieu),
        '⛔ không tìm ra nút Thanh toán với chữ mới');
    assert.strictEqual(BoGio.docTongChanGio(t.tailieu), HANG_MAU[0].gia,
        '⛔ mất chỗ neo chân giỏ vì nút đổi chữ');
});

test('⛔ và VẪN không được vơ nhầm nút "Lưu đơn (F2)"', () => {
    const t = taoTrangPos({ gioBanDau: [{ ten: HANG_MAU[0].ten }], giaoDienMoi: true });
    assert.strictEqual(BamThanhToan.timNutThanhToan(t.tailieu).id, 'nutThanhToan');
});

test('⭐⭐⭐ chữ "Xóa sản phẩm" nằm trong Ant Tooltip → mã KHÔNG với tới, phải bám biểu tượng', async () => {
    // ⚠️ Ảnh chụp thật cho thấy rê chuột lên thùng rác thì hiện "Xóa sản phẩm".
    // Rất dễ tưởng là title= rồi yên tâm. Nhưng Ant Design vẽ Tooltip Ở MỘT GÓC
    // KHÁC của trang và KHÔNG đặt title/aria-label lên nút — chữ ấy nhìn thấy
    // bằng mắt mà mã không với tới. Đường duy nhất còn lại là tên biểu tượng.
    const t = taoTrangPos({ gioBanDau: [{ ten: HANG_MAU[0].ten }, { ten: HANG_MAU[1].ten }],
                            giaoDienMoi: true, kieuNutXoa: 'tooltip' });
    const dong = BoGio.docCacDongGio(t.tailieu)[0];
    const nut = BoGio.timNutXoaDong(dong.khoi);
    assert.ok(nut, '⛔ không nhận ra thùng rác kiểu Tooltip — cả lượt sẽ khóa chết');
    assert.strictEqual(String(nut.getAttribute('title') || ''), '',
        'trang giả đặt title — thế thì đâu còn dựng lại đúng cái bẫy');

    const kq = await BoGio.xoaSachGio(t.tailieu, { nghi: async () => {} });
    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.strictEqual(t.xemGio().length, 0, '⛔ giỏ chưa sạch — lượt sau vẫn bị chặn');
});

// ────────────────────────────────────────────────────────────────────────────
ghiChu('— ⭐⭐⭐ E. CÔNG TẮC "HÓA ĐƠN ĐIỆN TỬ" — chốt chống NÓI DỐI —');

// ⚠️ Ảnh chụp trang thật 22/08/2026, hai tấm cách nhau vài phút:
//     công tắc BẬT -> nút đỏ ghi "Thanh toán & Xuất hóa đơn (F1)"
//     công tắc TẮT -> nút đỏ ghi "Thanh toán (F1)"      <-- KHÔNG xuất gì cả
// Tắt mà cứ bấm thì đơn VẪN chốt, máy vẫn ghi "đã ra hóa đơn", sổ Sell và
// Telegram đều nhận tin mừng — mà không có tờ hóa đơn nào. Máy NÓI DỐI.

const monHang = (soTien) => ({ ma: 'SP0095', ten: HANG_MAU[0].ten, soLuong: 1, gia: soTien });

async function bamThu(tuyChonTrang) {
    const t = taoTrangPos({ gioBanDau: [{ ten: HANG_MAU[0].ten }], ...tuyChonTrang });
    const luot = BamThanhToan.taoLuot();
    const kq = await luot.bam(t.tailieu, {
        daHieu: true, choPhep: true, tongMongDoi: HANG_MAU[0].gia,
        nghi: async () => {}, hanChoNutMo: 0, nhipChoMs: 5,
    });
    return { t, kq };
}

test('⭐⭐⭐ công tắc TẮT → DỪNG, tuyệt đối KHÔNG bấm', async () => {
    const { t, kq } = await bamThu({ giaoDienMoi: true, hoaDonDienTu: false });
    assert.strictEqual(kq.ok, false, 'đã bấm trong khi công tắc tắt!');
    assert.strictEqual(kq.ma, BamThanhToan.MA.HOA_DON_DIEN_TU_TAT, 'mã lạ: ' + kq.ma);
    assert.strictEqual(t.daBam.thanhToan, 0,
        '⛔⛔ ĐÃ BẤM THANH TOÁN — đơn chốt mà KHÔNG ra hóa đơn, và máy sẽ khai là đã ra');
    assert.match(kq.thongBao, /đang TẮT/, kq.thongBao);
    assert.match(kq.thongBao, /KHÔNG tự bật/, 'không nói rõ máy không tự bật: ' + kq.thongBao);
});

test('⭐ TRANG GIẢ phải trung thành: chữ nút đi theo công tắc', async () => {
    // ⚠️ Đây là chốt cho chính trang giả, không phải cho mã thật. Hai ảnh chụp
    // 22/08/2026 cho thấy chữ trên nút LÀ MỘT DẤU HIỆU ĐỘC LẬP của chế độ xuất
    // hóa đơn. Trang giả cứ ghi "Xuất hóa đơn" bất kể công tắc thì dấu hiệu thứ
    // hai không còn phân biệt được gì, và mọi bài dựa vào nó thành xanh giả.
    const bat = taoTrangPos({ gioBanDau: [{ ten: HANG_MAU[0].ten }],
                              giaoDienMoi: true, hoaDonDienTu: true });
    const tat = taoTrangPos({ gioBanDau: [{ ten: HANG_MAU[0].ten }],
                              giaoDienMoi: true, hoaDonDienTu: false });
    assert.match(bat.tailieu.getElementById('nutThanhToan').textContent, /Xuất hóa đơn/);
    assert.doesNotMatch(tat.tailieu.getElementById('nutThanhToan').textContent, /Xuất hóa đơn/,
        '⛔ công tắc TẮT mà nút vẫn khoe "Xuất hóa đơn" — trang giả bịa');
});

test('⭐⭐ công tắc BẬT → đi tiếp bình thường', async () => {
    const { t, kq } = await bamThu({ giaoDienMoi: true, hoaDonDienTu: true });
    assert.notStrictEqual(kq.ma, BamThanhToan.MA.HOA_DON_DIEN_TU_TAT,
        '⛔ chặn oan trong khi công tắc đang bật');
    assert.strictEqual(t.daBam.thanhToan, 1, 'công tắc bật mà không chịu bấm');
});

test('⛔⛔ KHÔNG nhận ra công tắc → cũng DỪNG, ngả về phía an toàn', async () => {
    // Giao diện đổi khác thứ mình biết. Dừng oan thì mất một lượt; chốt đơn mà
    // tưởng đã xuất hóa đơn thì sổ sách sai và KHÔNG AI BIẾT để sửa.
    const t = taoTrangPos({ gioBanDau: [{ ten: HANG_MAU[0].ten }],
                            giaoDienMoi: true, hoaDonDienTu: true });
    // Tendoo đổi chữ nhãn -> không còn gắn được công tắc với nhãn nào.
    t.tailieu.querySelector('#dongHddt > span').textContent = 'Chứng từ số';
    t.tailieu.getElementById('nutThanhToan').textContent = 'Thanh toán (F1)';
    const luot = BamThanhToan.taoLuot();
    const kq = await luot.bam(t.tailieu, {
        daHieu: true, choPhep: true, tongMongDoi: HANG_MAU[0].gia,
        nghi: async () => {}, hanChoNutMo: 0, nhipChoMs: 5,
    });
    assert.strictEqual(kq.ma, BamThanhToan.MA.HOA_DON_DIEN_TU_TAT, 'mã lạ: ' + kq.ma);
    assert.strictEqual(t.daBam.thanhToan, 0, '⛔⛔ ĐÃ BẤM khi không biết mình đang ở chế độ nào');
    assert.match(kq.thongBao, /KHÔNG nhận ra/, kq.thongBao);
});

test('⛔⛔ một khối có HAI công tắc → KHÔNG đoán cái nào của nhãn nào', async () => {
    // ⚠️ Tendoo thêm một công tắc nữa cạnh "Hóa đơn điện tử" là mã hết phân biệt
    // được. Vơ đại cái gặp trước rồi coi là công tắc hóa đơn thì có ngày đọc
    // trạng thái của một thứ hoàn toàn khác — đúng kiểu lỗi 19/08/2026 với "Ghi
    // nợ". Thà chịu thua và nói ra còn hơn trả lời chắc nịch một câu sai.
    const t = taoTrangPos({ gioBanDau: [{ ten: HANG_MAU[0].ten }],
                            giaoDienMoi: true, hoaDonDienTu: false });
    // Công tắc lạ chen lên ĐẦU và đang BẬT. Vơ cái đầu tiên là ra "bật" — ngược
    // hẳn sự thật, và máy sẽ bấm trong khi hóa đơn điện tử đang tắt.
    const la = t.tailieu.createElement('button');
    la.setAttribute('role', 'switch');
    la.setAttribute('aria-checked', 'true');
    la.className = 'ant-switch ant-switch-checked';
    const khoi = t.tailieu.getElementById('dongHddt');
    khoi.insertBefore(la, khoi.firstChild);

    const kiem = BamThanhToan.kiemHoaDonDienTu(t.tailieu);
    assert.strictEqual(kiem.bat, false,
        '⛔ đã vơ đại một công tắc trong khối có nhiều công tắc');
    assert.strictEqual(kiem.lyDo, 'KHONG_NHAN_RA', 'lý do sai: ' + kiem.lyDo);

    const luot = BamThanhToan.taoLuot();
    const kq = await luot.bam(t.tailieu, {
        daHieu: true, choPhep: true, tongMongDoi: HANG_MAU[0].gia,
        nghi: async () => {}, hanChoNutMo: 0, nhipChoMs: 5,
    });
    assert.strictEqual(kq.ma, BamThanhToan.MA.HOA_DON_DIEN_TU_TAT, 'mã lạ: ' + kq.ma);
    assert.strictEqual(t.daBam.thanhToan, 0, '⛔⛔ ĐÃ BẤM khi không biết mình đang ở chế độ nào');
});

test('⭐ giao diện CŨ (không có công tắc nào) → giữ nguyên nếp cũ, không chặn oan', async () => {
    // Giao diện cũ vẫn xuất hóa đơn qua bảng xác nhận. Chặn ở đây là làm hỏng
    // một đường vốn đang chạy tốt.
    const { t, kq } = await bamThu({ hoaDonDienTu: 'khong' });
    assert.notStrictEqual(kq.ma, BamThanhToan.MA.HOA_DON_DIEN_TU_TAT,
        '⛔ chặn oan giao diện cũ');
    assert.strictEqual(t.daBam.thanhToan, 1);
});

test('⭐⭐ mất nhãn NHƯNG nút ghi "Xuất hóa đơn" → dấu hiệu thứ hai cứu được', async () => {
    // Hai dấu hiệu độc lập: công tắc và chữ trên nút. Mất một cái mà cái kia
    // khẳng định rõ ràng thì không cần dừng.
    const t = taoTrangPos({ gioBanDau: [{ ten: HANG_MAU[0].ten }],
                            giaoDienMoi: true, hoaDonDienTu: true });
    t.tailieu.querySelector('#dongHddt > span').textContent = 'Chứng từ số';
    const luot = BamThanhToan.taoLuot();
    const kq = await luot.bam(t.tailieu, {
        daHieu: true, choPhep: true, tongMongDoi: HANG_MAU[0].gia,
        nghi: async () => {}, hanChoNutMo: 0, nhipChoMs: 5,
    });
    assert.notStrictEqual(kq.ma, BamThanhToan.MA.HOA_DON_DIEN_TU_TAT, kq.thongBao);
    assert.strictEqual(t.daBam.thanhToan, 1);
});

test('⛔ KHÔNG được vơ nhầm công tắc "Ghi nợ" trong bảng xác nhận', async () => {
    // Bảng xác nhận có công tắc riêng. Lấy nó rồi coi là "Hóa đơn điện tử" là
    // trả lời một câu hỏi hoàn toàn khác — đúng lỗi đã trả giá ngày 19/08/2026.
    const t = taoTrangPos({ gioBanDau: [{ ten: HANG_MAU[0].ten }],
                            giaoDienMoi: true, hoaDonDienTu: false });
    const bang = t.tailieu.createElement('div');
    bang.setAttribute('role', 'dialog');
    bang.innerHTML = '<div><button role="switch" aria-checked="true" '
        + 'class="ant-switch ant-switch-checked"></button><span>Hóa đơn điện tử</span></div>';
    t.tailieu.body.appendChild(bang);
    assert.strictEqual(BamThanhToan.kiemHoaDonDienTu(t.tailieu).bat, false,
        '⛔ đã đọc công tắc trong bảng thay vì công tắc ở chân giỏ');
});

// ────────────────────────────────────────────────────────────────────────────
ghiChu('— ⭐⭐⭐ F. BẢNG XÁC NHẬN: "(1 sản phẩm)" KHÔNG phải số tiền —');

/** Dựng lại ĐÚNG bảng mà log 22:33 ngày 22/08/2026 kể ra. */
const BANG_2233 = () => dungTaiLieu(`<div id="b" role="dialog">
  <div><span>Tổng tiền hàng (1 sản phẩm)</span><span>1.450.000</span></div>
  <div><span>Tổng</span><span>1.450.000</span></div>
  <div><span>Khách cần trả</span><span>1.450.000</span></div>
  <div><span>Ghi nợ</span><span>1.450.000</span></div>
  <div><span>Gợi ý mức khách thanh toán</span><span>1.450.000</span>
       <span>1.500.000</span><span>1.600.000</span></div>
</div>`).getElementById('b');

test('⭐⭐⭐ bảng hiện đúng 1.450.000 → PHẢI chấp nhận (ca ki?n 22:33)', () => {
    // ⚠️ Bản cũ đọc ra con số 1 — nhặt từ "(1 sản phẩm)" — rồi từ chối phát
    // hành một tờ hóa đơn hoàn toàn hợp lệ. Ba lỗi chồng nhau: nhận chữ số trần
    // làm tiền; [^\d] không vượt nổi chữ số để với tới con số thật; và break
    // chốt luôn cái rác đầu tiên.
    assert.strictEqual(BamThanhToan.coTongDung(BANG_2233(), 1450000), true,
        '⛔ từ chối một bảng ĐÚNG — đúng lỗi 22:33 ngày 22/08/2026');
});

test('⛔⛔ và VẪN phải từ chối khi bảng hiện số KHÁC', () => {
    // Chốt này tồn tại để chặn phát hành sai tiền. Chữa cho nó đọc được thì
    // phải chắc nó KHÔNG đồng thời trở nên dễ dãi.
    assert.strictEqual(BamThanhToan.coTongDung(BANG_2233(), 1500000), false,
        '⛔ nhận bừa một con số GỢI Ý làm tổng — sẽ phát hành sai tiền');
    assert.strictEqual(BamThanhToan.coTongDung(BANG_2233(), 990000), false);
    assert.strictEqual(BamThanhToan.coTongDung(BANG_2233(), 1), false,
        '⛔ vẫn coi "1" trong "(1 sản phẩm)" là một khoản tiền');
});

test('⭐⭐ chữ số lẻ chen giữa nhãn và số tiền → vẫn với tới được', () => {
    // "(12 sản phẩm)" nằm chắn ngang. [^\d] cũ tắc ở đây; quét tìm HÌNH DẠNG
    // TIỀN thì đi qua được.
    assert.strictEqual(
        BamThanhToan.soTienSauNhan('Tổng tiền hàng (12 sản phẩm) 9.612.236', 'Tổng tiền hàng'),
        9612236);
    assert.strictEqual(BamThanhToan.soTienSauNhan('Tổng tiền hàng (1 sản phẩm)', 'Tổng'), null,
        '⛔ vẫn nhặt chữ số trần làm tiền');
});

test('⛔ nhãn cách số tiền QUÁ XA thì không phải của nhau', () => {
    const xa = 'Khách cần trả' + ' '.repeat(80) + '1.450.000';
    assert.strictEqual(BamThanhToan.soTienSauNhan(xa, 'Khách cần trả'), null,
        '⛔ vơ tiền của dòng khác vì nhãn đứng cách xa');
});

test('⭐ danh sách nhãn phải có đúng chữ TRANG THẬT dùng', () => {
    // Trang ghi "Khách cần trả"; danh sách cũ ghi "Khách phải trả" nên trượt.
    for (const n of ['Khách cần trả', 'Tổng tiền hàng']) {
        assert.ok(BamThanhToan.CAC_NHAN_TONG.includes(n), 'thiếu nhãn thật: ' + n);
    }
});

// ────────────────────────────────────────────────────────────────────────────
ghiChu('— ⭐⭐ H. MỖI BẢN GHI PHẢI KHAI MÌNH DO BẢN NÀO SINH RA —');

test('⭐⭐ bản ghi giữ số hiệu bản extension', () => {
    // ⚠️ Ngày 22/08/2026 vá bốn đợt trong một ngày. Đọc log lượt 22:33 mà không
    // xác định nổi nó chạy 2.21 hay 2.23 — trong khi điều đó đổi hẳn cách luận
    // bệnh. Đoán "lúc ấy máy chạy mã nào" là luận bệnh trên cát.
    const b = LichSuChay.taoBanGhi({ banExt: '2.24.0', nguon: 'HEN_GIO', moc: '22:33',
                                     chay: false, lyDo: 'X', trongLich: [] });
    assert.strictEqual(b.banExt, '2.24.0');
    assert.strictEqual(LichSuChay.taoBanGhi({}).banExt, '', 'không có thì để trống, đừng bịa');
});

test('⭐⭐ tin Telegram "cả lượt không chạy" cũng mang số hiệu bản', async () => {
    const daGui = [];
    const kho = { doc: async () => ({}), ghi: async () => {} };
    const b = LichSuChay.taoBanGhi({
        banExt: '2.24.0', nguon: 'HEN_GIO', moc: '22:33', ngay: { tu: '22/08/2026' },
        chay: false, lyDo: 'GIO_KHONG_TRONG', thongBao: 'giỏ còn hàng',
        trongLich: [{ maKH: 'A', tenKH: 'ki?n' }],
    });
    await BaoTelegram.baoLuot({
        banGhi: b, caiDat: { telegramToken: 'tk', telegramChatId: 'ct' }, kho,
        layFetch: async (u, o) => {
            daGui.push(JSON.parse(o.body).text);
            return { ok: true, json: async () => ({ ok: true, result: {} }) };
        },
        luc: Date.now(),
    });
    assert.strictEqual(daGui.length, 1, 'không gửi tin nào');
    assert.match(daGui[0], /bản 2\.24\.0/, 'tin không mang số hiệu bản: ' + daGui[0]);
});

test('⭐ tiến trình nền phải THẬT SỰ điền số hiệu vào', () => {
    // Lại đúng bẫy đã dính với daChay(): hàm đúng mà sợi dây không nối thì vô
    // dụng. Đo chỗ nối, không chỉ đo cái hàm.
    assert.match(maThat, /banExt: banDangChay\(\),[\s\S]{0,200}NGUON\.HEN_GIO/,
        '⛔ lối hẹn giờ không điền số hiệu bản');
    assert.match(maThat, /banExt: banDangChay\(\),[\s\S]{0,120}NGUON\.TAY/,
        '⛔ lối chạy tay không điền số hiệu bản');
    // Hỏi không được thì ĐỂ TRỐNG. Bịa ra '?' hay 'khong-ro' là tự tay tạo một
    // số hiệu không có thật, rồi có ngày đi tìm nó trong lịch sử phát hành.
    assert.match(maThat, /catch \(e\) \{ return ''; \}/,
        '⛔ bịa số hiệu khi không hỏi được manifest');
    assert.match(maThat, /chrome\.runtime\.getManifest\(\)\.version/,
        '⛔ không hề hỏi manifest — số hiệu ở đâu ra?');
});

// ────────────────────────────────────────────────────────────────────────────
ghiChu('— ⭐⭐⭐ I. BẢNG XÁC NHẬN KIỂU 23/08/2026 (ca c?ng 10:45) —');

// ⚠️ MỘT Ô NHẬP KHÔNG ĐIỀN ĐƯỢC, BA TẦNG HẬU QUẢ:
//   nhãn đổi "Khách đã đưa" -> "Khách thanh toán"  =>  ô nằm TRỐNG
//   Tendoo hiểu khách đưa 0đ                        =>  TỰ TICK "Ghi nợ"
//   khách là "Khách lẻ", không ghi nợ được          =>  "Xác nhận" bị NUỐT im lặng
// Kết cục: lệnh TREO — trạng thái tốn công người nhất trong cả dự án.

const bangMoi = (them = {}) => taoTrangPos({
    gioBanDau: [{ ten: HANG_MAU[0].ten }], giaoDienMoi: true, bangXnMoi: true,
    khongDienSanDaDua: true, ...them,
});

test('⭐⭐ TRANG GIẢ phải trung thành với bảng xác nhận 23/08/2026', () => {
    // ⚠️ Đây là chốt cho CHÍNH TRANG GIẢ, không phải cho mã thật. Vòng gài lỗi
    // cho thấy: sửa trang giả về nhãn cũ, hoặc thay ô tick bằng một thẻ bịa —
    // mọi bài kiểm I1/I2 vẫn XANH. Trang giả bịa thì bài kiểm chứng minh cho
    // một thế giới không tồn tại, và đó là kiểu xanh sai lý do nguy hiểm nhất.
    const nhan = (t) => String(
        t.tailieu.getElementById('xnKhachDua').parentElement.textContent || '')
        .replace(/\s+/g, ' ').trim();
    const cu = taoTrangPos({ gioBanDau: [{ ten: HANG_MAU[0].ten }] });
    const moi = taoTrangPos({ gioBanDau: [{ ten: HANG_MAU[0].ten }], bangXnMoi: true });

    assert.match(nhan(moi), /Khách thanh toán/, '⛔ bảng mới vẫn dựng nhãn CŨ: ' + nhan(moi));
    assert.match(nhan(cu), /Khách đã đưa/, 'bảng cũ phải giữ nhãn cũ: ' + nhan(cu));

    // Ghi nợ: bảng mới là Ô TICK thật của Ant, bảng cũ là CÔNG TẮC GẠT.
    const gnMoi = moi.tailieu.getElementById('xnGhiNo');
    assert.strictEqual(gnMoi.getAttribute('type'), 'checkbox', '⛔ Ghi nợ mới không phải ô tick');
    assert.ok(gnMoi.closest('.ant-checkbox'), '⛔ thiếu lớp .ant-checkbox thật của Ant Design');
    assert.ok(gnMoi.closest('.ant-checkbox-wrapper'), '⛔ thiếu .ant-checkbox-wrapper');
    const gnCu = cu.tailieu.getElementById('xnGhiNo');
    assert.strictEqual(gnCu.getAttribute('role'), 'switch', 'bảng cũ phải giữ công tắc gạt');

    // Và chân bảng: mới ghi "Hủy", cũ ghi "Quay lại".
    assert.match(moi.tailieu.getElementById('xnQuayLai').textContent, /Hủy/);
    assert.match(cu.tailieu.getElementById('xnQuayLai').textContent, /Quay lại/);
});

test('⭐⭐⭐ ô "Khách thanh toán" phải ĐIỀN ĐƯỢC — gốc của cả ca 10:45', async () => {
    const t = bangMoi();
    const luot = BamThanhToan.taoLuot();
    const kq = await luot.bam(t.tailieu, {
        daHieu: true, choPhep: true, tongMongDoi: HANG_MAU[0].gia,
        nghi: async () => {}, hanChoNutMo: 0, nhipChoMs: 5,
    });
    assert.strictEqual(kq.ok, true, 'thông báo: ' + kq.thongBao);
    assert.strictEqual(t.daBam.xacNhan, 1, 'không bấm được Xác nhận');
    const o = t.tailieu.getElementById('xnKhachDua');
    assert.strictEqual(Number(String(o.value).replace(/[^\d]/g, '')), HANG_MAU[0].gia,
        '⛔ ô tiền khách trả vẫn TRỐNG — đúng bệnh 10:45 ngày 23/08');
});

test('⭐⭐ điền xong thì Tendoo TỰ BỎ TICK Ghi nợ', async () => {
    // Đây là lý do bản vá chọn chữa ở ô nhập chứ không đi gỡ tick: gỡ tick là
    // chữa triệu chứng, điền tiền mới là chữa bệnh.
    const t = bangMoi();
    const luot = BamThanhToan.taoLuot();
    await luot.bam(t.tailieu, {
        daHieu: true, choPhep: true, tongMongDoi: HANG_MAU[0].gia,
        nghi: async () => {}, hanChoNutMo: 0, nhipChoMs: 5,
    });
    assert.strictEqual(t.tailieu.getElementById('xnGhiNo').checked, false);
});

test('⛔⛔ Ô TICK "Ghi nợ" đang tick → PHẢI nhìn thấy và TỪ CHỐI', async () => {
    // ⚠️ Bản cũ chỉ hỏi [role=switch], .ant-switch. Ô tick vuông không khớp cái
    // nào -> hàm báo "không có công tắc nào" -> tầng trên khai thành "Ghi nợ
    // tắt" -> máy ĐI THẲNG QUA chốt và phát hành một hóa đơn GHI NỢ.
    const t = bangMoi({ ghiNoBat: true, khongDienSanDaDua: false });
    const luot = BamThanhToan.taoLuot();
    const kq = await luot.bam(t.tailieu, {
        daHieu: true, choPhep: true, tongMongDoi: HANG_MAU[0].gia,
        nghi: async () => {}, hanChoNutMo: 0, nhipChoMs: 5,
    });
    assert.strictEqual(kq.ma, BamThanhToan.MA.GHI_NO_DANG_BAT, 'mã lạ: ' + kq.ma);
    assert.strictEqual(t.daBam.xacNhan, 0,
        '⛔⛔ ĐÃ PHÁT HÀNH một hóa đơn GHI NỢ — sai bản chất khoản thu, xóa cũng không sửa được');
});

test('⛔⛔ và LỜI KỂ không được nói "tắt" khi chưa kiểm được gì', () => {
    // ⚠️ Log 10:45 ngày 23/08/2026 ghi thẳng "Ghi nợ tắt" trong khi ẢNH CHỤP cho
    // thấy ô ĐANG TICK. Máy nói chắc nịch một câu sai — nó đánh lừa cả người
    // đang ngồi sửa nó, mất trọn một vòng đi tìm nhầm bệnh.
    const trong = dungTaiLieu('<div id="b"><span>Tổng cộng</span><span>1.450.000</span></div>')
        .getElementById('b');
    const ke = BamThanhToan.keRuotBang(trong);
    assert.doesNotMatch(ke, /Ghi nợ (tắt|đã kiểm)/,
        '⛔ khai là "tắt" trong khi không hề tìm thấy nút nào: ' + ke);
    assert.match(ke, /KHÔNG thấy nút Ghi nợ nào/, ke);

    const tick = dungTaiLieu('<div id="b"><label class="ant-checkbox-wrapper">'
        + '<span class="ant-checkbox ant-checkbox-checked">'
        + '<input type="checkbox" checked></span><span>Ghi nợ</span></label></div>')
        .getElementById('b');
    assert.match(BamThanhToan.keRuotBang(tick), /Ghi nợ ĐANG BẬT/,
        BamThanhToan.keRuotBang(tick));
});

test('⛔⛔ LỚP CSS nói "đã tick" mà thuộc tính chưa kịp theo → vẫn phải coi là BẬT', () => {
    // ⚠️ React đánh dấu ô tick bằng lớp CSS trước, đồng bộ thuộc tính `checked`
    // của thẻ input sau. Chỉ tin một trong hai là có khoảnh khắc máy nhìn thấy
    // "chưa tick" trong khi màn hình đã hiện tick — rồi phát hành một hóa đơn
    // ghi nợ. Hỏi CẢ HAI, và bên nào nói "bật" thì tin bên đó.
    const k = dungTaiLieu('<div id="b"><label class="ant-checkbox-wrapper ant-checkbox-wrapper-checked">'
        + '<span class="ant-checkbox ant-checkbox-checked">'
        + '<input type="checkbox"></span>'      // <-- thuộc tính CHƯA theo kịp
        + '<span>Ghi nợ</span></label></div>').getElementById('b');
    assert.strictEqual(BamThanhToan.kiemGhiNo(k).bat, true,
        '⛔ chỉ tin thuộc tính `checked` — bỏ lọt ô đã tick trên màn hình');
    assert.match(BamThanhToan.keRuotBang(k), /Ghi nợ ĐANG BẬT/);
});

test('⛔ ô tick lồng ba lớp KHÔNG được đếm thành ba nút', () => {
    // .ant-checkbox-wrapper > .ant-checkbox > input là BA phần tử của CÙNG một
    // ô tick. Đếm cả ba thì chốt "khối có nhiều hơn một nút" bắn oan, và máy từ
    // chối phát hành với lý do sai hoàn toàn.
    const k = dungTaiLieu('<div id="b"><label class="ant-checkbox-wrapper">'
        + '<span class="ant-checkbox"><input type="checkbox"></span>'
        + '<span>Ghi nợ</span></label></div>').getElementById('b');
    assert.strictEqual(BamThanhToan.cacCongTac(k).length, 1);
    assert.strictEqual(BamThanhToan.kiemGhiNo(k).bat, false, 'từ chối oan');
    assert.strictEqual(BamThanhToan.kiemGhiNo(k).daKiem, true);
});

test('⭐⭐ bằng chứng: nút CÓ CHỮ phải đứng trước 8 nút gợi ý tiền', () => {
    // ⚠️ Log 10:45 kể ra đúng 8 con số rồi hết — nút "Xác nhận" bị cắt mất, và
    // tôi đi tìm nhầm bệnh trọn một vòng vì cái danh sách ấy.
    // ⚠️ Phải viết ĐÚNG định dạng tiền Việt "1.450.000". Bản nháp của tôi viết
    // "1450.000" — bốn chữ số ở nhóm đầu — nên nó KHÔNG phải hình dạng tiền, bộ
    // xếp coi như nút chữ và bài đỏ vì chính dữ liệu giả, không vì mã.
    const k = dungTaiLieu('<div id="b">'
        + ['1.450.000', '1.500.000', '1.600.000', '1.700.000',
           '1.800.000', '1.900.000', '2.000.000', '2.100.000']
            .map(x => `<button>${x}</button>`).join('')
        + '<button>Xác nhận</button><button>Hủy</button></div>').getElementById('b');
    const ke = BamThanhToan.keRuotBang(k);
    assert.match(ke, /nút trong bảng: «Xác nhận»/, '⛔ nút thật vẫn bị số che mất: ' + ke);
    assert.match(ke, /«Hủy»/, ke);
});

test('⭐⭐ bảng không có "Quay lại" → vẫn phải HỦY được, đừng để nằm mở', async () => {
    // ⚠️ Bảng nằm mở thì cửa "giỏ phải trống" chặn luôn mọi lượt sau — đúng
    // vòng luẩn quẩn đã ăn trọn ngày 22/08/2026.
    const t = bangMoi({ ghiNoBat: true, khongDienSanDaDua: false });
    const luot = BamThanhToan.taoLuot();
    const kq = await luot.bam(t.tailieu, {
        daHieu: true, choPhep: true, tongMongDoi: HANG_MAU[0].gia,
        nghi: async () => {}, hanChoNutMo: 0, nhipChoMs: 5,
    });
    assert.strictEqual(kq.ma, BamThanhToan.MA.GHI_NO_DANG_BAT);
    assert.strictEqual(t.daBam.quayLai, 1,
        '⛔ không hủy được bảng vì nó ghi "Hủy" chứ không ghi "Quay lại"');
});

// ────────────────────────────────────────────────────────────────────────────
ghiChu('— ⭐⭐⭐ J. NÚT XÓA DÒNG GIỎ — đọc từ DOM THẬT, không đoán —');

// ⚠️ Lời khai của xoaSachGio() lượt 14:13 ngày 23/08/2026 kể ra SÁU nút:
//   #1 «Ghi chú»                              -> có chữ
//   #2 «—» M19 13H5v-2h14v2z                  -> nút TRỪ
//   #3 «—» M19 13h-6v6h-2v-6H5v…              -> nút CỘNG
//   #4 «990.000» M7.97606 1.82159…            -> nút SỬA GIÁ   ⛔ nguy hiểm nhất
//   #5 «—» M6 10C6 8.11438…                   -> NHÂN BẢN dòng
//   #6 «—» M13 3.66406…                       -> THÙNG RÁC
// Không lớp "dangerous", không title, không tên biểu tượng — cả ba đường nhận
// dạng cũ đều trượt, và cả lượt khóa chết ở "không dọn được giỏ".

const dongThat = () => taoTrangPos({
    gioBanDau: [{ ten: HANG_MAU[0].ten }, { ten: HANG_MAU[1].ten }],
    giaoDienMoi: true, kieuNutXoa: 'hinhThat',
});

test('⭐⭐ TRANG GIẢ phải dựng ĐỦ ba nút không chữ của dòng giỏ thật', () => {
    // ⚠️ Chốt cho CHÍNH TRANG GIẢ. Thiếu nút nhân bản hoặc nút sửa giá thì hai
    // luật loại trừ chẳng còn gì để loại, và mọi bài dựa vào chúng thành xanh
    // giả — trang giả bịa thì bài kiểm chứng minh cho một thế giới không có.
    const t = dongThat();
    const nut = [...BoGio.docCacDongGio(t.tailieu)[0].khoi.querySelectorAll('button')];
    assert.ok(nut.some(b => /990\.000/.test(b.textContent)), '⛔ thiếu nút SỬA GIÁ');
    assert.ok(nut.some(b => BoGio.coDauHinh(b, BoGio.DAU_HINH_NHAN_BAN)), '⛔ thiếu nút NHÂN BẢN');
    assert.ok(nut.some(b => BoGio.coDauHinh(b, BoGio.DAU_HINH_THUNG_RAC)), '⛔ thiếu THÙNG RÁC');
});

test('⭐⭐⭐ nhận ra THÙNG RÁC thật và dọn sạch được giỏ', async () => {
    const t = dongThat();
    assert.strictEqual(BoGio.docCacDongGio(t.tailieu).length, 2);
    const kq = await BoGio.xoaSachGio(t.tailieu, { nghi: async () => {} });
    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.strictEqual(t.xemGio().length, 0,
        '⛔ giỏ chưa sạch — đúng vòng khóa chết 23/08');
});

test('⛔⛔⛔ TUYỆT ĐỐI không bấm nút SỬA GIÁ «990.000»', () => {
    // Đây là nút nguy hiểm nhất trong dòng: bấm vào là mở ô đổi GIÁ BÁN, ngay
    // trước lúc xuất hóa đơn thuế. Sai tiền trên tờ hóa đơn thì xóa cũng không
    // sửa được. Nó không có chữ "xóa", không có lớp nguy hiểm — thứ duy nhất
    // phân biệt là CHỮ trên nút chính là một SỐ TIỀN.
    const t = dongThat();
    const khoi = BoGio.docCacDongGio(t.tailieu)[0].khoi;
    const nut = BoGio.timNutXoaDong(khoi);
    assert.ok(nut, 'không nhận ra nút xóa');
    assert.ok(!/990\.000/.test(nut.textContent),
        '⛔⛔ đã chọn nút SỬA GIÁ làm nút xóa: «' + nut.textContent + '»');
    assert.ok(BoGio.coDauHinh(nut, BoGio.DAU_HINH_THUNG_RAC),
        '⛔ nút chọn được không mang hình thùng rác');
});

test('⛔⛔ TUYỆT ĐỐI không bấm nút NHÂN BẢN DÒNG', () => {
    // Bấm nhầm nó thì giỏ DÀI THÊM mỗi lần, và vòng dọn sẽ bấm tới 60 lần.
    const t = dongThat();
    const khoi = BoGio.docCacDongGio(t.tailieu)[0].khoi;
    const nut = BoGio.timNutXoaDong(khoi);
    assert.ok(!BoGio.coDauHinh(nut, BoGio.DAU_HINH_NHAN_BAN),
        '⛔ đã chọn nút nhân bản — giỏ sẽ phình ra chứ không hết');
});

// ⚠️ HAI LUẬT LOẠI TRỪ DƯỚI ĐÂY TỪNG KHÔNG GÁNH GÌ. Vòng gài lỗi cho thấy: gỡ
// hẳn chúng đi mà mọi bài vẫn XANH — vì luật nhận hình thùng rác đã chọn đúng
// trước rồi. Một chốt không bài nào phân biệt được là một chốt chưa tồn tại.
//
// Chúng gánh ở chỗ khác: khi nút cần loại MANG THÊM một dấu hiệu MẠNH HƠN.
// Loại trừ chạy TRƯỚC mọi luật nhận dạng, nên nó phải thắng cả lớp "dangerous".

const DONG_CO_DAU_MANH = (themVaoNut) => {
    const AB = 'ant-btn ant-btn-text ant-btn-color-default';
    const ve = (...d) => '<svg>' + d.map(x => `<path d="${x}"></path>`).join('') + '</svg>';
    return dungTaiLieu('<div id="d">'
        + `<button id="gia" class="${AB}${themVaoNut === 'gia' ? ' ant-btn-dangerous' : ''}">`
        + `990.000${ve('M7.97606 1.82159L8.9')}</button>`
        + `<button id="nhanBan" class="${AB}${themVaoNut === 'nhanBan' ? ' ant-btn-dangerous' : ''}">`
        + `${ve('M6 10C6 8.11438 6 7.11157', 'M11.3339 5.9987C11.3')}</button>`
        + `<button id="thungRac" class="${AB}">`
        + `${ve('M13 3.66406L12.5868', 'M2 3.66536L14 3.6653', 'M6.33398 11L6.3339')}</button>`
        + '</div>').getElementById('d');
};

test('⛔⛔⛔ nút SỬA GIÁ dù mang lớp "dangerous" cũng KHÔNG BAO GIỜ là nút xóa', () => {
    // Tendoo tô đỏ nút giá là chuyện hoàn toàn có thể. Nếu lớp "dangerous" thắng
    // được, máy sẽ bấm vào ô ĐỔI GIÁ BÁN ngay trước lúc xuất hóa đơn thuế —
    // sai tiền trên tờ hóa đơn, xóa đi cũng không sửa được.
    const n = BoGio.timNutXoaDong(DONG_CO_DAU_MANH('gia'));
    assert.ok(n, 'không nhận ra nút xóa nào');
    assert.strictEqual(n.id, 'thungRac', '⛔⛔ đã chọn nút «' + n.textContent + '»');
});

test('⛔⛔ nút NHÂN BẢN dù mang lớp "dangerous" cũng KHÔNG BAO GIỜ là nút xóa', () => {
    // Bấm nhầm nó thì giỏ DÀI THÊM mỗi lần, và vòng dọn bấm tới 60 lần.
    const n = BoGio.timNutXoaDong(DONG_CO_DAU_MANH('nhanBan'));
    assert.ok(n, 'không nhận ra nút xóa nào');
    assert.strictEqual(n.id, 'thungRac', '⛔⛔ đã chọn nút NHÂN BẢN');
});

test('⛔ và chữ ký NHÂN BẢN phải đúng, sai là hết loại được', () => {
    // Chốt cho chính hằng số: chữ ký sai thì luật loại trừ trở nên vô hình.
    const k = DONG_CO_DAU_MANH('nhanBan');
    const nb = k.querySelector('#nhanBan');
    assert.ok(BoGio.coDauHinh(nb, BoGio.DAU_HINH_NHAN_BAN),
        '⛔ chữ ký nhân bản không khớp hình vẽ thật của Tendoo');
    assert.ok(!BoGio.coDauHinh(nb, BoGio.DAU_HINH_THUNG_RAC),
        '⛔ chữ ký thùng rác trùng cả với nút nhân bản — không phân biệt được');
});

test('⛔⛔ HAI nút cùng khớp một luật → TỪ CHỐI, không lấy cái đầu tiên', () => {
    // ⚠️ `find` lặng lẽ lấy phần tử đầu tiên, tức là ĐOÁN. Trang mọc thêm một
    // nút trông giống thùng rác thì mình không còn biết cái nào là thật —
    // lúc ấy phải dừng và khai ra, chứ không được bấm bừa.
    const t = dongThat();
    const khoi = BoGio.docCacDongGio(t.tailieu)[0].khoi;
    const that = BoGio.timNutXoaDong(khoi);
    khoi.appendChild(that.cloneNode(true));      // một thùng rác thứ hai
    assert.strictEqual(BoGio.timNutXoaDong(khoi), null,
        '⛔ hai nút giống hệt mà vẫn dám chọn một cái');
});

test('⛔ luật CHẮC HƠN mà mập mờ thì DỪNG HẲN, không rơi xuống luật yếu', () => {
    // Hai nút cùng mang lớp "dangerous" -> trang lạ hẳn so với thứ mình biết.
    // Rơi xuống luật hình vẽ để "gỡ gạc" là tự cho phép mình đoán.
    const k = dungTaiLieu('<div id="d">'
        + '<button class="ant-btn ant-btn-dangerous">a</button>'
        + '<button class="ant-btn ant-btn-dangerous">b</button>'
        + '<button class="ant-btn"><svg><path d="M13 3.66406L12.5868"></path></svg></button>'
        + '</div>').getElementById('d');
    assert.strictEqual(BoGio.timNutXoaDong(k), null);
});

test('⭐⭐ lời khai phải kể HÌNH VẼ đủ dài để nhận ra chữ ký', () => {
    // ⚠️ Lượt 23/08 cắt hình vẽ ở 20 ký tự, tôi phải SUY chữ ký từ đoạn cụt.
    // Đủ dài thì lần Tendoo đổi biểu tượng sau sửa được ngay trong một lượt.
    const t = dongThat();
    const ke = BoGio.keCacNutTrongDong(BoGio.docCacDongGio(t.tailieu)[0].khoi);
    assert.match(ke, /M6 10C6 8\.11438 6 7\.11157 6\.58579 6\.52579/,
        'hình vẽ vẫn bị cắt quá ngắn: ' + ke);
});

test('⛔ đọc hình vẽ KHÔNG BAO GIỜ được ném — nó chạy trên đường thoát', () => {
    for (const x of [null, undefined, {}, { querySelectorAll: () => { throw new Error('vỡ'); } }]) {
        assert.doesNotThrow(() => BoGio.cacDuongVe(x));
        assert.deepStrictEqual(BoGio.cacDuongVe(x), []);
    }
});

// ────────────────────────────────────────────────────────────────────────────
(async () => {
    console.log('\nBA BẢN VÁ 22/08/2026\n');
    for (const [ten, fn] of cho) {
        if (!fn) { console.log('  ' + ten); continue; }
        try { await fn(); dat++; console.log('  \x1b[32m✔\x1b[0m ' + ten); }
        catch (e) {
            hong++;
            console.log('  \x1b[31m✘\x1b[0m ' + ten);
            console.log('      ' + String(e && e.message).split('\n').join('\n      '));
        }
    }
    console.log(`\n${dat} đạt, ${hong} hỏng`);
    if (hong) process.exitCode = 1;
})();
