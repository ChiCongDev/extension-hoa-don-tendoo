'use strict';

// BẤM "XÁC NHẬN" MÀ KHÔNG CÓ GÌ XẢY RA — vì sao, và làm sao biết được vì sao.
// Chạy: node test/bamVaoKhoangKhong.test.js   (cần biến HDT_JSDOM)
//
// ── CA HỎNG THẬT: 20/08/2026, khách "hoa", tờ thứ 5/6 ──────────────────────
//
//   ⚠ hoa (7.854.000đ) — TREO: Đã phát hành 4/6 hóa đơn (5.500.000) rồi dừng:
//     Đã bấm "Xác nhận" nhưng giỏ vẫn còn hàng sau 8 giây — KHÔNG RÕ hóa đơn
//     đã phát hành hay chưa. Máy nhìn thấy: bảng xác nhận VẪN đang mở; giỏ
//     còn 1 dòng, tổng 1.200.000đ.
//
// Chủ dự án kiểm Tendoo: CHỈ CÓ 4 TỜ. Nghĩa là cú bấm thật sự không đi tới
// đâu cả — không phải Tendoo xử lý chậm.
//
// ── BA KHẢ NĂNG, NHÌN TỪ NGOÀI GIỐNG HỆT NHAU ──────────────────────────────
//   1. Bấm vào KHOẢNG KHÔNG — nút đã bị React tháo khỏi trang, sự kiện không
//      tới được ai cả. Không lỗi, không cảnh báo, im lặng tuyệt đối.
//   2. Tendoo NHẬN cú bấm rồi TỪ CHỐI im lặng.
//   3. Tendoo đang xử lý chậm (hệ thống thuế trả lời lâu).
//
// Cả ba đều cho ra: bảng còn mở, giỏ y nguyên, không một dấu hiệu nào.
//
// ── CÁI CHUÔNG ─────────────────────────────────────────────────────────────
// Gắn một người nghe lên TÀI LIỆU trước khi bấm, rồi hỏi: sự kiện có nổi tới
// nơi không? React gắn người nghe ở GỐC TÀI LIỆU chứ không trên từng nút, nên
// đó mới đúng là phép đo "React có nhìn thấy cú bấm này không".
//   · KHÔNG nổi tới -> khả năng 1. CHẮC CHẮN chưa phát hành gì.
//   · CÓ nổi tới    -> khả năng 2 hoặc 3. Bệnh nằm chỗ khác hẳn.
//
// ⚠️ Bản đầu tôi gắn chuông thẳng LÊN NÚT — vô dụng: nut.click() luôn gọi
// người nghe trên chính nút đó, kể cả khi nút đã rời trang. Chuông kêu 100%
// số lần và chưa từng đo được gì.
// Chuông chỉ NGHE. Không bấm gì, không đổi gì, không thể sinh hóa đơn trùng.
//
// ⛔ VÀ ĐIỀU KHÔNG BAO GIỜ ĐƯỢC LÀM: bấm "Xác nhận" lần thứ hai. Kể cả khi
// chuông chứng minh cú bấm đầu rơi vào khoảng không. Sai ở đây không phải mất
// một tờ hóa đơn — mà là xuất TRÙNG một tờ đã lên cơ quan thuế.

const assert = require('node:assert');
const { test, ghiChu, chay } = require('./chay');
require('./hanChoNganChoTest');   // hạn chờ ngắn cho test — xem file đó
require('../chung/domReact');
const BoGio = require('../tendoo/boGio');
const T = require('../tendoo/bamThanhToan');
const { taoTrangPos } = require('./trangPosGiaLap');

const { MA } = T;
const NHANH = { nghi: async () => {}, hanChoBangMs: 60, nhipChoMs: 10,
                hanChoThueDong: 40, doiSauBam: 40, hanChoQuay: 40 };
const THAT = (them = {}) => ({
    nghi: (ms) => new Promise(r => setTimeout(r, ms)),
    hanChoBangMs: 400, nhipChoMs: 10, hanChoThueDong: 200,
    doiSauBam: 120, hanChoQuay: 800, ...them,
});

async function chayMotLuot(tuyChonTrang = {}, tuyChonBam = NHANH) {
    const trang = taoTrangPos({
        gioBanDau: [{ ten: 'Áo khoác dạ dáng dài nữ', soLuong: 2 }],   // 1.980.000
        khongDienSanDaDua: true,     // bắt máy phải tự điền -> bảng mới vẽ lại
        ...tuyChonTrang,
    });
    const luot = T.taoLuot();
    const kq = await luot.bam(trang.tailieu, {
        choPhep: true, tongMongDoi: 1980000, ...tuyChonBam,
    });
    return { trang, luot, kq };
}

ghiChu('— ⭐⭐ CA "hoa": BẤM VÀO KHOẢNG KHÔNG —');

test('⭐⭐ bảng bị vẽ lại → KHÔNG bấm vào nút cũ nữa, mà tìm lại nút sống', async () => {
    // `veLaiBangXn`: React tháo nút cũ ra khỏi trang ngay sau khi ô "Khách đã
    // đưa" đổi giá trị. Bản cũ giữ tham chiếu bảng từ TRƯỚC đó, nên bấm vào
    // một nút không còn tồn tại — im lặng tuyệt đối, rồi treo lệnh sau 8 giây.
    const { trang, kq } = await chayMotLuot({ veLaiBangXn: true }, THAT());
    assert.strictEqual(kq.ma, MA.XONG, 'thông báo: ' + kq.thongBao);
    assert.strictEqual(trang.daBam.xacNhan, 1, 'phải xác nhận ĐÚNG một lần');
});

test('⭐⭐ nút KHÔNG còn trong trang → DỪNG THẲNG, đừng bấm rồi đợi 8 giây', async () => {
    // `thaoBangXn`: React tháo HẲN bảng khỏi trang sau khi điền "Khách đã đưa".
    // Tham chiếu bảng cũ vẫn tìm được nút — nhưng nút ấy không còn trong trang.
    //
    // Máy phải nhận ra và nói thẳng "chưa phát hành gì", thay vì bấm vào khoảng
    // không rồi treo lệnh với kết luận "KHÔNG RÕ" — bắt người đi kiểm tận mắt
    // một chuyện CHẮC CHẮN chưa xảy ra.
    const { trang, kq } = await chayMotLuot({ thaoBangXn: true }, THAT());
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(trang.daBam.xacNhan, 0, 'không được xác nhận gì');
    assert.notStrictEqual(kq.ma, MA.KHONG_RO,
        '⛔ vẫn treo lệnh oan cho chuyện CHẮC CHẮN chưa xảy ra: ' + kq.thongBao);
    assert.match(kq.thongBao, /KHÔNG còn nằm trong trang/, kq.thongBao);
    assert.match(kq.thongBao, /CHƯA phát hành/, kq.thongBao);
});

test('⛔⛔ conTrongTrang: nút đã gỡ khỏi trang thì phải nhận ra', () => {
    const trang = taoTrangPos();
    const n = trang.tailieu.getElementById('xnXacNhan');
    assert.strictEqual(T.conTrongTrang(trang.tailieu, n), true);
    n.remove();
    assert.strictEqual(T.conTrongTrang(trang.tailieu, n), false,
        'nút đã rời trang mà vẫn tưởng còn → bấm vào khoảng không');
    // Rác thì trả false, không ném.
    for (const x of [null, undefined, {}]) {
        assert.strictEqual(T.conTrongTrang(trang.tailieu, x), false);
    }
    assert.strictEqual(T.conTrongTrang(null, n), false);
});

ghiChu('— ⭐⭐ CÁI CHUÔNG: cú bấm có NỔI TỚI TRANG không —');

test('⭐⭐ Tendoo NHẬN mà không làm gì → nói rõ "cú bấm ĐÃ NỔI TỚI TRANG"', async () => {
    const { trang, kq } = await chayMotLuot({ xacNhanNuot: true });
    assert.strictEqual(kq.ma, MA.KHONG_RO, 'thông báo: ' + kq.thongBao);
    assert.strictEqual(kq.chuongKeu, true, 'chuông phải kêu — Tendoo có nhận cú bấm');
    assert.match(kq.thongBao, /ĐÃ NỔI TỚI TRANG/, kq.thongBao);
    assert.ok(!/KHÔNG NỔI TỚI TRANG/.test(kq.thongBao), 'đổ oan cho khả năng khác: ' + kq.thongBao);
    assert.strictEqual(trang.daBam.xacNhan, 1);
});

test('⭐⭐ Tendoo mất người nghe nhưng cú bấm VẪN nổi tới trang → chuông KÊU', async () => {
    // Nút bị thay bằng bản sao không mang người nghe, nhưng vẫn nằm trong
    // trang. Sự kiện vẫn nổi lên tới tài liệu, nên React VẪN nhìn thấy — bệnh
    // nằm ở phía Tendoo, không phải ở cú bấm.
    const trang = taoTrangPos({
        gioBanDau: [{ ten: 'Áo khoác dạ dáng dài nữ', soLuong: 2 }],
        khongDienSanDaDua: true,
    });
    trang.tailieu.getElementById('xnKhachDua').addEventListener('input', () => {
        const cu = trang.tailieu.getElementById('xnXacNhan');
        if (cu) cu.replaceWith(cu.cloneNode(true));   // mất hết người nghe
    }, { once: true });

    const kq = await T.taoLuot().bam(trang.tailieu,
        { choPhep: true, tongMongDoi: 1980000, ...NHANH });
    assert.strictEqual(kq.ma, MA.KHONG_RO, 'thông báo: ' + kq.thongBao);
    assert.strictEqual(kq.chuongKeu, true, 'nút còn trong trang thì chuông phải kêu');
    assert.strictEqual(trang.daBam.xacNhan, 0, 'Tendoo KHÔNG hề nhận');
});

test('⭐⭐⭐ có kẻ CHẶN cú bấm giữa đường → chuông IM, nói rõ React không thấy', async () => {
    // ⚠️ ĐÂY LÀ BÀI DUY NHẤT CHỨNG MINH CÁI CHUÔNG CÓ GIÁ TRỊ.
    //
    // Bản chuông đầu tiên tôi gắn thẳng lên nút — vô dụng: `nut.click()` luôn
    // gọi người nghe gắn trên chính nút đó, kể cả khi nút đã rời trang. Chuông
    // kêu 100% số lần. Gài lỗi "chuông luôn báo kêu" mà không bài nào đỏ, vì
    // nó chưa từng đo được gì.
    //
    // React gắn người nghe ở GỐC TÀI LIỆU, nên phép đo đúng là "sự kiện có nổi
    // tới tài liệu không". Ở đây mặt nạ bảng gọi stopPropagation: nút vẫn nhận
    // cú bấm, nhưng React thì không bao giờ thấy.
    const { kq } = await chayMotLuot({ chanCuBamXn: true, xacNhanNuot: true });
    assert.strictEqual(kq.ma, MA.KHONG_RO, 'thông báo: ' + kq.thongBao);
    assert.strictEqual(kq.chuongKeu, false,
        '⛔ chuông kêu trong khi cú bấm bị chặn giữa đường — chuông đang đo nhầm thứ');
    assert.match(kq.thongBao, /KHÔNG NỔI TỚI TRANG/, kq.thongBao);
    assert.match(kq.thongBao, /CHƯA phát hành/, kq.thongBao);
});

test('⭐ chạy trơn thì chuông cũng kêu, và không dính chữ chẩn đoán', async () => {
    const { kq } = await chayMotLuot();
    assert.strictEqual(kq.ma, MA.XONG, 'thông báo: ' + kq.thongBao);
    assert.ok(!/NỔI TỚI TRANG/.test(kq.thongBao), 'lối thành công bị dính chữ chẩn đoán');
});

ghiChu('— ⭐ CHỜ THEO TÍN HIỆU, KHÔNG THEO ĐỒNG HỒ —');

test('⭐⭐ nút còn QUAY thì còn chờ — đừng treo lệnh oan', async () => {
    // Phát hành hóa đơn điện tử là gọi lên hệ thống thuế, chậm hơn mọi thao
    // tác khác. Hạn cứng 120ms ở đây sẽ hết TRƯỚC khi Tendoo trả lời (300ms);
    // chỉ có việc nhìn vòng quay mới cứu được.
    const { trang, kq } = await chayMotLuot({ xacNhanQuayMs: 300 }, THAT());
    assert.strictEqual(kq.ma, MA.XONG, 'thông báo: ' + kq.thongBao);
    assert.strictEqual(trang.daBam.xacNhan, 1, '⛔ đã bấm Xác nhận nhiều hơn MỘT lần');
});

test('⛔ chờ vòng quay cũng CÓ HẠN — quay mãi thì vẫn phải dừng', async () => {
    const { trang, kq } = await chayMotLuot(
        { xacNhanQuayMs: 100000 }, THAT({ hanChoQuay: 150 }));
    assert.strictEqual(kq.ma, MA.KHONG_RO, 'thông báo: ' + kq.thongBao);
    assert.strictEqual(trang.daBam.xacNhan, 1, 'không được bấm lại');
});

test('⛔⛔ chờ lâu hơn KHÔNG được nới chốt nào', async () => {
    // Vẫn phải THẤY GIỎ TRỐNG mới coi là XONG.
    const { kq } = await chayMotLuot(
        { xacNhanQuayMs: 60, giuGioSauXacNhan: true }, THAT());
    assert.strictEqual(kq.ok, false, 'giỏ còn hàng mà vẫn báo XONG');
    assert.strictEqual(kq.ma, MA.KHONG_RO);
    assert.match(kq.thongBao, /KHÔNG được bấm lại/, kq.thongBao);
});

ghiChu('— ⭐ KỂ RUỘT BẢNG XÁC NHẬN —');

test('⭐⭐ bảng báo lỗi đỏ thì phải CHÉP RA nguyên văn', async () => {
    // Hôm 20/08 máy kể được CÁI VỎ ("bảng xác nhận vẫn đang mở") mà chưa kể
    // được RUỘT. Dòng lỗi trong bảng mới là thứ nói vì sao Tendoo từ chối.
    const { kq } = await chayMotLuot({ xacNhanBaoLoi: 'Số tiền khách đưa không hợp lệ' });
    assert.strictEqual(kq.ma, MA.KHONG_RO);
    assert.match(kq.thongBao, /Trong bảng:/, kq.thongBao);
    assert.match(kq.thongBao, /Số tiền khách đưa không hợp lệ/,
        'không chép dòng lỗi của bảng: ' + kq.thongBao);
});

test('⭐ kể cả trạng thái nút, Ghi nợ và ô tiền khách trả', async () => {
    const { kq } = await chayMotLuot({ xacNhanNuot: true });
    assert.match(kq.thongBao, /nút trong bảng:.*«Xác nhận»/, kq.thongBao);
    // ⚠️ PHẢI NÓI RÕ LÀ ĐÃ KIỂM. Bản cũ viết cụt lủn "Ghi nợ tắt" cho CẢ HAI
    // trường hợp — đã kiểm và thấy tắt, lẫn không tìm thấy nút nào để mà kiểm.
    // Log 10:45 ngày 23/08/2026 ghi đúng câu ấy trong khi ảnh chụp cho thấy ô
    // ĐANG TICK: một câu SAI nằm ngay trong bằng chứng, đánh lừa cả người đi sửa.
    assert.match(kq.thongBao, /Ghi nợ đã kiểm: tắt/, kq.thongBao);
    assert.match(kq.thongBao, /ô tiền khách trả đang là/, kq.thongBao);
});

test('⭐ nút đang quay thì phải ghi ĐANG QUAY', async () => {
    const { kq } = await chayMotLuot(
        { xacNhanQuayMs: 100000 }, THAT({ hanChoQuay: 150 }));
    assert.match(kq.thongBao, /«Xác nhận»\(ĐANG QUAY\)/, kq.thongBao);
});

test('⛔ keRuotBang KHÔNG BAO GIỜ được ném — nó chạy trên đường thoát', () => {
    for (const x of [null, undefined, {}, { querySelectorAll: () => { throw new Error('vỡ'); } }]) {
        const r = T.keRuotBang(x);
        assert.strictEqual(typeof r, 'string', 'ném với ' + String(x));
    }
});

test('dangQuay nhận đủ các lối Ant Design đánh dấu vòng chờ', () => {
    const trang = taoTrangPos();
    const n = trang.tailieu.getElementById('xnXacNhan');
    assert.strictEqual(T.dangQuay(n), false);
    n.className += ' ant-btn-loading';
    assert.strictEqual(T.dangQuay(n), true);
    n.className = 'ant-btn';
    n.setAttribute('aria-busy', 'true');
    assert.strictEqual(T.dangQuay(n), true);
    n.removeAttribute('aria-busy');
    assert.strictEqual(T.dangQuay(n), false);
    // ⚠️ "loading" phải là NGUYÊN một lớp, không phải một mẩu chữ.
    n.className = 'ant-btn preloading-x';
    assert.strictEqual(T.dangQuay(n), false, 'khớp nhầm vào lớp khác có chữ loading');
    assert.strictEqual(T.dangQuay(null), false);
});

ghiChu('— ⛔⛔ ĐIỀU KHÔNG BAO GIỜ ĐỔI —');

test('⛔⛔ "Xác nhận" bấm TỐI ĐA MỘT LẦN trong mọi cảnh', async () => {
    const cac = [{}, { veLaiBangXn: true }, { xacNhanNuot: true }, { xacNhanQuayMs: 100 },
                 { xacNhanBaoLoi: 'x' }, { giuGioSauXacNhan: true },
                 { giuGioSauXacNhan: true, giuBangSauXacNhan: true }];
    for (const tt of cac) {
        const { trang } = await chayMotLuot(tt, THAT({ hanChoQuay: 200 }));
        assert.ok(trang.daBam.xacNhan <= 1,
            '⛔ BẤM ' + trang.daBam.xacNhan + ' LẦN với ' + JSON.stringify(tt)
            + ' — hóa đơn TRÙNG lên cơ quan thuế');
    }
});

chay('BẤM "XÁC NHẬN" MÀ KHÔNG CÓ GÌ XẢY RA');
