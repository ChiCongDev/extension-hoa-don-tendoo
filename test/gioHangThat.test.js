'use strict';

// ============================================================================
//  TEST CHẠY THẲNG TRÊN HTML THẬT — không qua trang giả
//
//  VÌ SAO CÓ FILE NÀY
//  Ba lần liên tiếp bộ test xanh trong khi thực tế hỏng, đều cùng một nguyên
//  nhân: trang POS giả được dựng theo TƯỞNG TƯỢNG chứ không theo trang thật.
//    1. Ô tìm kiếm   — tưởng gõ vào là lọc lưới, thật ra mở bảng gợi ý
//    2. Nút Thanh toán — tưởng bấm là phát hành, thật ra mở bảng xác nhận
//    3. Dòng giỏ     — tưởng nút xóa nằm trong tầm 5 tầng, thật ra ở tầng 6
//
//  Lần thứ ba làm hỏng liền ba tính năng: không dọn được giỏ, không nhận ra giỏ
//  do chính máy để lại, không đặt được số lượng > 1. Mà 657 test vẫn xanh.
//
//  File này đọc `test/mau/gioHangThat.html` — bản chụp NGUYÊN VĂN từ trang POS
//  thật ngày 2026-08-12. Nó KHÔNG THỂ xanh giả: trang giả có sai thế nào thì
//  những khẳng định ở đây vẫn phải đúng trên HTML thật.
//
//  Ai sửa cách đọc giỏ mà làm đỏ file này thì đừng sửa file này — sửa lại mã.
// ============================================================================

const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require(process.env.HDT_JSDOM || 'jsdom');
const { test, ghiChu, chay } = require('./chay');

require('../chung/domReact');
const BoGio = require('../tendoo/boGio');
globalThis.HDT_BoGio = BoGio;
const DauGio = require('../chung/dauGio');

const TEN_MON = 'Áo Polo phối cổ nữ';
const GIA = 490000;

function trangThat() {
    const html = fs.readFileSync(path.join(__dirname, 'mau', 'gioHangThat.html'), 'utf8');
    const dom = new JSDOM('<!doctype html><body>' + html + '</body>');
    return { dom, tailieu: dom.window.document };
}

ghiChu('— Bản chụp phải còn nguyên —');

test('bản chụp có thật và trông đúng là giỏ hàng Tendoo', () => {
    const html = fs.readFileSync(path.join(__dirname, 'mau', 'gioHangThat.html'), 'utf8');
    assert.ok(html.includes(TEN_MON), 'bản chụp không còn tên món — đã bị sửa?');
    assert.ok(html.includes('ant-btn-dangerous'), 'bản chụp mất nút xóa');
    assert.ok(html.includes('Tổng thanh toán'), 'bản chụp thiếu dòng tổng');
});

test('⭐ bản chụp KHÔNG chứa gì nhạy cảm', () => {
    // Nó nằm trong thư mục dự án, phải sạch tuyệt đối.
    const html = fs.readFileSync(path.join(__dirname, 'mau', 'gioHangThat.html'), 'utf8');
    for (const cam of ['0344168490', 'Duong123', 'access_token', 'Bearer ', 'eyJ']) {
        assert.ok(!html.includes(cam), `bản chụp lọt "${cam}"`);
    }
});

ghiChu('— ⭐ Đọc dòng giỏ trên trang THẬT —');

test('⭐ đọc ra ĐÚNG MỘT dòng giỏ', () => {
    const { tailieu } = trangThat();
    assert.strictEqual(BoGio.docCacDongGio(tailieu).length, 1);
    assert.strictEqual(BoGio.gioDangTrong(tailieu), false);
});

test('⭐ TÌM ĐƯỢC NÚT XÓA — đây chính là lỗi người dùng gặp', () => {
    // Bản cũ đi ngược lên đúng 5 tầng rồi dừng ở khối `flex-shrink-0` (chỉ có
    // cụm − 1 +, chữ RỖNG, không có nút xóa) -> "Không thấy nút xóa dòng trong
    // giỏ", trong khi nút xóa vẫn nằm ngay trên trang.
    const { tailieu } = trangThat();
    const dong = BoGio.docCacDongGio(tailieu)[0];
    assert.ok(BoGio.timNutXoaDong(dong.khoi),
        '❌ KHÔNG THẤY NÚT XÓA — đúng lỗi đã xảy ra thật');
});

test('⭐ khối dòng giỏ phải chứa TÊN MÓN', () => {
    // Thiếu tên món thì `chu` vô dụng cho hai việc sống còn: nhận ra giỏ do
    // chính máy để lại, và đặt số lượng > 1.
    const dong = BoGio.docCacDongGio(trangThat().tailieu)[0];
    assert.ok(dong.chu.includes(TEN_MON),
        `❌ khối dòng không có tên món. chu = ${JSON.stringify(dong.chu)}`);
});

test('khối dòng giỏ chứa cả số tiền của dòng', () => {
    const dong = BoGio.docCacDongGio(trangThat().tailieu)[0];
    assert.match(dong.chu, /490\.000/);
});

test('đọc đúng số lượng', () => {
    assert.strictEqual(BoGio.docCacDongGio(trangThat().tailieu)[0].soLuong, 1);
});

test('⭐ khối dòng KHÔNG được ôm cả giỏ — chỉ chứa ĐÚNG MỘT ô số lượng', () => {
    // Trèo quá cao thì hai dòng gộp làm một, tên món dòng này lẫn sang dòng kia.
    const dong = BoGio.docCacDongGio(trangThat().tailieu)[0];
    const soO = [...dong.khoi.querySelectorAll('input')]
        .filter(i => /^\d+$/.test(String(i.value)) && i.type !== 'checkbox').length;
    assert.strictEqual(soO, 1, 'khối dòng đã trèo lên khối chứa nhiều dòng');
});

test('ô số lượng lấy được đúng là ô trong dòng đó', () => {
    const dong = BoGio.docCacDongGio(trangThat().tailieu)[0];
    assert.ok(dong.khoi.contains(dong.oSoLuong));
    assert.strictEqual(dong.oSoLuong.value, '1');
});

ghiChu('— ⭐ Đọc tổng tiền trên trang THẬT —');

test('đọc đúng "Tổng thanh toán"', () => {
    assert.strictEqual(BoGio.docTongGio(trangThat().tailieu), GIA);
});

ghiChu('— ⭐ Dọn giỏ trên trang THẬT —');

test('⭐ xóa sạch giỏ chạy được, không kêu "không thấy nút xóa"', async () => {
    const { tailieu } = trangThat();
    // Bản chụp là HTML tĩnh: bấm nút xóa không làm dòng biến mất như trang thật.
    // Nên tự gỡ dòng khi nút được bấm, để kiểm ĐÚNG một điều: có tìm thấy và
    // bấm được nút xóa hay không.
    const dong = BoGio.docCacDongGio(tailieu)[0];
    const nut = BoGio.timNutXoaDong(dong.khoi);
    assert.ok(nut, 'không thấy nút xóa');
    nut.addEventListener('click', () => dong.khoi.remove());

    const kq = await BoGio.xoaSachGio(tailieu, { nghi: async () => {} });
    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.strictEqual(BoGio.docCacDongGio(tailieu).length, 0);
});

ghiChu('— ⭐ Dấu giỏ nhận ra giỏ của chính máy, trên trang THẬT —');

test('⭐ dấu ghi từ chính món đó → KHỚP với giỏ thật', () => {
    // Trước khi sửa, `chu` rỗng nên phép so tên không bao giờ khớp — tính năng
    // tự dọn giỏ coi như không tồn tại trên trang thật.
    const { tailieu } = trangThat();
    const dau = DauGio.taoDau({
        maKH: 'PA', danhSach: [{ ten: TEN_MON, soLuong: 1 }], tong: GIA,
    });
    const kt = DauGio.khopVoiGio(dau, BoGio.docCacDongGio(tailieu), BoGio.docTongGio(tailieu));
    assert.strictEqual(kt.khop, true, '❌ không nhận ra giỏ của chính mình: ' + kt.lyDo);
});

test('dấu của món KHÁC → KHÔNG khớp, vẫn giữ nguyên tính thận trọng', () => {
    const { tailieu } = trangThat();
    const dau = DauGio.taoDau({
        maKH: 'TB', danhSach: [{ ten: 'Giày Boots nữ cổ ngắn da mềm', soLuong: 1 }], tong: GIA,
    });
    assert.strictEqual(
        DauGio.khopVoiGio(dau, BoGio.docCacDongGio(tailieu), BoGio.docTongGio(tailieu)).khop,
        false);
});

test('dấu đúng tên nhưng SAI số lượng → KHÔNG khớp', () => {
    const { tailieu } = trangThat();
    const dau = DauGio.taoDau({ maKH: 'PA', danhSach: [{ ten: TEN_MON, soLuong: 3 }], tong: GIA });
    assert.strictEqual(
        DauGio.khopVoiGio(dau, BoGio.docCacDongGio(tailieu), BoGio.docTongGio(tailieu)).khop,
        false);
});

ghiChu('— ⭐ Trang giả phải khớp trang thật —');

test('⭐ trang giả và trang thật cho ra CÙNG hình dạng dòng giỏ', () => {
    // Đây là bài test ngăn lần thứ tư: nếu ai dựng lại trang giả nông hơn thật,
    // hai bên sẽ lệch và test này đỏ ngay.
    const { taoTrangPos } = require('./trangPosGiaLap');
    const gia = taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }] });
    const dGia = BoGio.docCacDongGio(gia.tailieu)[0];
    const dThat = BoGio.docCacDongGio(trangThat().tailieu)[0];

    for (const [ten, d, tenMon] of [['giả', dGia, 'Quần Jogger thể thao nữ'],
                                    ['thật', dThat, TEN_MON]]) {
        assert.ok(BoGio.timNutXoaDong(d.khoi), `trang ${ten}: không thấy nút xóa`);
        assert.ok(d.chu.includes(tenMon), `trang ${ten}: khối dòng thiếu tên món`);
        assert.match(d.chu, /\d{1,3}[.,]\d{3}/, `trang ${ten}: khối dòng thiếu số tiền`);
        assert.strictEqual(d.soLuong, 1, `trang ${ten}: đọc sai số lượng`);
        assert.ok(BoGio.timNutCong(d.oSoLuong), `trang ${ten}: không nhận ra nút "+"`);
    }
});

ghiChu('— ⭐ Nút "+" trên HTML THẬT —');

test('⭐ nhận ra nút "+" ngay trên bản chụp thật', () => {
    // Ngày 2026-08-13 máy gõ số vào ô số lượng trên trang thật: ô hiện 6 nhưng
    // giỏ vẫn 1 cái, tổng đứng im. Nay máy bấm nút "+" — nên nút đó phải nhận ra
    // được TRÊN CHÍNH HTML THẬT, không phải chỉ trên trang giả.
    const { tailieu } = trangThat();
    const dong = BoGio.docCacDongGio(tailieu)[0];
    const nut = BoGio.timNutCong(dong.oSoLuong);
    assert.ok(nut, 'không nhận ra nút "+" trên trang thật');
    assert.strictEqual(nut.tagName, 'BUTTON');
});

test('⭐ KHÔNG nhầm nút "+" với nút "−" hay nút XÓA', () => {
    const { tailieu } = trangThat();
    const dong = BoGio.docCacDongGio(tailieu)[0];
    const cong = BoGio.timNutCong(dong.oSoLuong);
    // Nút − nằm NGAY TRƯỚC ô nhập; nhầm là giảm số lượng thay vì tăng.
    const tru = dong.oSoLuong.previousElementSibling;
    assert.notStrictEqual(cong, tru, 'nhận nhầm nút "−" thành nút "+"');
    assert.notStrictEqual(cong, BoGio.timNutXoaDong(dong.khoi), 'nhầm nút "+" thành nút xóa');
    // Và nó phải nằm SAU ô nhập, đúng thứ tự [−] [ô] [+] của trang thật.
    assert.strictEqual(dong.oSoLuong.nextElementSibling, cong);
});

test('⭐ hai nút − và + KHÔNG có chữ, KHÔNG có lớp riêng — chỉ khác hình vẽ', () => {
    // Chốt lại sự thật này bằng chính HTML thật, để không ai quay lại tìm nút
    // bằng lớp `cong`/`tru` do trang giả bịa ra.
    const { tailieu } = trangThat();
    const dong = BoGio.docCacDongGio(tailieu)[0];
    const khung = dong.oSoLuong.parentElement;
    const nut = [...khung.querySelectorAll('button')];
    assert.strictEqual(nut.length, 2, 'khung số lượng phải có đúng hai nút');
    for (const b of nut) {
        assert.strictEqual((b.textContent || '').trim(), '', 'nút có chữ — trang thật không có');
        assert.ok(!/\b(cong|tru|plus|minus)\b/.test(String(b.className || '')),
            'nút có lớp gợi ý — trang thật không có, đừng dựa vào');
        assert.ok(b.querySelector('svg path[d]'), 'nút không có hình vẽ để phân biệt');
    }
});

chay('GIỎ HÀNG — CHẠY THẲNG TRÊN HTML THẬT');
