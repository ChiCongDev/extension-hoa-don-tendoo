'use strict';

// ĐỌC GIÁ VÀ TỒN TỪ ĐÚNG Ô CỦA NÓ.
// Chạy: node test/docGiaTuO.test.js   (cần biến HDT_JSDOM)
//
// ── LỖI ĐANG CHỮA ──────────────────────────────────────────────────────────
// Ngày 19/08/2026 khách "ki?n" hỏng với thông báo: tìm thấy đúng mặt hàng
// "Giày Boots nam cổ cao da lộn" nhưng giá đọc ra là 841.450.000đ.
//
// 841.450.000 = "84" (tồn kho) + "1.450.000" (giá) dính liền nhau. Cách cũ gom
// cả dòng gợi ý thành MỘT chuỗi rồi bắt "số tiền đầu tiên", nên mẫu số tiền
// nuốt luôn cả hai.
//
// ── VÌ SAO LÚC HỎNG LÚC KHÔNG ──────────────────────────────────────────────
// docChu() đọc innerText trước. Trình duyệt tự chèn xuống dòng giữa các khối
// nên bình thường ra "Tồn: 84 1.450.000" — có dấu cách, đọc đúng. Nhưng khi
// bảng gợi ý ĐANG ĐÓNG LẠI thì innerText trả rỗng, máy lùi về textContent,
// thứ KHÔNG chèn dấu cách nào. Đúng lúc đó thì dính.
//
// Nên đây là lỗi MAY RỦI VỀ THỜI ĐIỂM: cùng một đoạn mã, hôm qua hỏng hôm nay
// chạy. Bài test phải dựng lại ĐƯỢC cả hai cảnh, nếu không thì nó chỉ chứng
// minh được cái cảnh may mắn.
//
// ⚠️ jsdom KHÔNG có innerText, nên ở đây mọi thứ luôn đi đường textContent.
// Muốn dựng cảnh "có dấu cách" thì phải tự đặt khoảng trắng vào HTML — đúng
// như trình duyệt thật vẫn làm. Đó là lý do có tham số `cachNhau` dưới đây.

const assert = require('node:assert');
const { test, ghiChu, chay } = require('./chay');
require('../chung/domReact');                 // gắn HDT_DomReact vào globalThis
const BoGio = require('../tendoo/boGio');
const { JSDOM } = require(process.env.HDT_JSDOM || 'jsdom');

const tien = (n) => Number(n).toLocaleString('vi-VN');

/** Dựng một tài liệu từ đoạn HTML thô. */
const dungTaiLieu = (html) =>
    new JSDOM('<!doctype html><body>' + html + '</body>').window.document;

/**
 * Một dòng trong BẢNG GỢI Ý, dựng đúng bố cục thật (ảnh chụp 19/08/2026):
 *
 *     [ảnh]  Giày Boots nam cổ cao da lộn        1.450.000
 *            [Chiếc]                              Tồn: 20
 *            SP0425
 *
 * Cột phải có hai ô: giá và tồn. `tonTruoc` đảo thứ tự HAI ô ấy trong DOM —
 * vì mình KHÔNG có HTML thật của Tendoo, chỉ có ảnh chụp, nên không dám khẳng
 * định thứ tự nào. Cách chữa phải đúng với CẢ HAI, và đó chính là điều bài
 * test này đi kiểm.
 */
function dongGoiY({ ten, ma, gia, ton, tonTruoc = false, cachNhau = false }) {
    const n = cachNhau ? '\n        ' : '';
    const oGia = `<span class="o-gia">${tien(gia)}</span>`;
    const oTon = `<span class="o-ton">Tồn: ${ton}</span>`;
    const phai = tonTruoc ? oTon + n + oGia : oGia + n + oTon;
    return `<div class="ant-select-dropdown">`
        + `<div class="ant-select-item ant-select-item-option">`
        + `<div class="ant-select-item-option-content">`
        + `<div class="trai"><span>${ten}</span>${n}<span>Chiếc</span>${n}<span>${ma}</span></div>${n}`
        + `<div class="phai">${phai}</div>`
        + `</div></div></div>`;
}

/**
 * Một thẻ hàng trên lưới, đúng bố cục thật: giá góc phải trên, tồn dải dưới.
 *
 * `coNgoac` là dấu ngoặc đóng của "(Số lượng tồn: 84)". Nó nhỏ mà quan trọng:
 * xem bài test "dấu ngoặc đóng đang che cho thẻ hàng" ở dưới.
 */
function theHang({ ten, ma, gia, ton, tonTruoc = false, cachNhau = false, coNgoac = true }) {
    const n = cachNhau ? '\n        ' : '';
    const chuTon = coNgoac ? `(Số lượng tồn: ${ton})` : `Số lượng tồn: ${ton}`;
    const oGia = `<div class="goc-phai"><span>${tien(gia)}</span></div>`;
    const oDuoi = `<div class="dai-duoi"><span>${ten}</span>${n}`
        + `<span>${chuTon}</span></div>`;
    return `<div class="the">`
        + `<div class="anh"><span>${ma}</span></div>${n}`
        + (tonTruoc ? oDuoi + n + oGia : oGia + n + oDuoi)
        + `</div>`;
}

const mot = (html) => {
    const d = BoGio.docCacDongGoiY(dungTaiLieu(html));
    assert.strictEqual(d.length, 1, 'phải đọc ra đúng một dòng gợi ý');
    return d[0];
};
const motThe = (html) => {
    const t = BoGio.docCacTheHang(dungTaiLieu(html));
    assert.strictEqual(t.length, 1, 'phải đọc ra đúng một thẻ hàng');
    return t[0];
};

const GIAY = { ten: 'Giày Boots nam cổ cao da lộn', ma: 'SP0425', gia: 1450000, ton: 84 };

ghiChu('— Dựng lại đúng lỗi 19/08/2026 —');

test('⚠ CHỨNG MINH cảnh dựng ra ĐÚNG LÀ cảnh đã làm hỏng thật', () => {
    // Nếu bỏ qua bài này thì mọi bài sau đều vô nghĩa: có thể mình đang dựng
    // một cảnh KHÔNG BAO GIỜ hỏng, rồi mừng vì nó không hỏng.
    const d = mot(dongGoiY({ ...GIAY, tonTruoc: true }));
    assert.ok(d.chu.includes('Tồn: 841.450.000'),
        'chuỗi gộp phải dính thành "Tồn: 841.450.000" — nếu không thì cảnh sai:\n' + d.chu);
    const cachCu = d.chu.match(/\d{1,3}([.,]\d{3})+/);
    assert.strictEqual(cachCu[0], '841.450.000',
        'cách đọc CŨ phải cho ra đúng con số đã báo lỗi hôm ấy');
});

test('⚠ giá đọc ĐÚNG dù tồn đứng sát ngay trước (841.450.000 -> 1.450.000)', () => {
    const d = mot(dongGoiY({ ...GIAY, tonTruoc: true }));
    assert.strictEqual(d.gia, 1450000, 'vẫn đang nuốt số tồn vào giá');
    assert.notStrictEqual(d.gia, 841450000);
});

test('⚠ TỒN cũng đọc đúng (841 -> 84) — chốt chặn tồn kho mới có nghĩa', () => {
    // Cách cũ /Tồn:\s*(\d+)/ bắt tham thành "841". Tồn phóng đại gấp mười lần
    // thì chốt "hàng không đủ" ở boVaoGio() cho lọt qua đúng cái đơn mà kho
    // không gánh nổi — hỏng ở tận bước bấm, sau khi đã bỏ hàng vào giỏ.
    const d = mot(dongGoiY({ ...GIAY, tonTruoc: true }));
    assert.strictEqual(d.ton, 84);
    assert.notStrictEqual(d.ton, 841);
});

ghiChu('— Đúng với MỌI thứ tự và MỌI cách xuống dòng —');

test('giá đứng trước tồn, chữ dính liền', () => {
    const d = mot(dongGoiY({ ...GIAY, tonTruoc: false }));
    assert.strictEqual(d.gia, 1450000);
    assert.strictEqual(d.ton, 84);
});

test('giá đứng trước tồn, có dấu cách (cảnh innerText của trình duyệt)', () => {
    const d = mot(dongGoiY({ ...GIAY, tonTruoc: false, cachNhau: true }));
    assert.strictEqual(d.gia, 1450000);
    assert.strictEqual(d.ton, 84);
});

test('tồn đứng trước giá, có dấu cách', () => {
    const d = mot(dongGoiY({ ...GIAY, tonTruoc: true, cachNhau: true }));
    assert.strictEqual(d.gia, 1450000);
    assert.strictEqual(d.ton, 84);
});

test('tên vẫn cắt đúng, không dính mã hàng hay đơn vị', () => {
    for (const tt of [true, false]) {
        for (const cn of [true, false]) {
            const d = mot(dongGoiY({ ...GIAY, tonTruoc: tt, cachNhau: cn }));
            assert.strictEqual(d.ten, GIAY.ten, `tonTruoc=${tt} cachNhau=${cn}`);
        }
    }
});

ghiChu('— Thẻ hàng trên lưới cũng phải khỏi lỗi ấy —');

test('⚠ DẤU NGOẶC ĐÓNG đang che cho thẻ hàng — đừng tưởng nó vốn an toàn', () => {
    // Nói cho đúng: thẻ hàng KHÔNG hỏng hôm 19/08, và không phải vì cách đọc
    // cũ chắc chắn, mà vì một dấu ")" đứng chen vào giữa:
    //     "(Số lượng tồn: 84)1.450.000"   -> ")" cắt đôi, bắt đúng 1.450.000
    //     "Số lượng tồn: 841.450.000"     -> không có ")" là dính, y hệt gợi ý
    // Tendoo bỏ cặp ngoặc đi lúc nào là thẻ hàng hỏng đúng kiểu ấy. Bài test
    // này ghim lại sự thật đó để đời sau đừng nhầm là thẻ hàng miễn nhiễm.
    const coNgoac = motThe(theHang({ ...GIAY, tonTruoc: true, coNgoac: true }));
    assert.ok(coNgoac.chu.includes('tồn: 84)1.450.000'), coNgoac.chu);
    assert.strictEqual(coNgoac.chu.match(/\d{1,3}([.,]\d{3})+/)[0], '1.450.000',
        'có ngoặc thì cách CŨ vốn đã đúng');

    const khongNgoac = motThe(theHang({ ...GIAY, tonTruoc: true, coNgoac: false }));
    assert.ok(khongNgoac.chu.includes('tồn: 841.450.000'), khongNgoac.chu);
    assert.strictEqual(khongNgoac.chu.match(/\d{1,3}([.,]\d{3})+/)[0], '841.450.000',
        'bỏ ngoặc thì cách CŨ dính y như bảng gợi ý');
});

test('⚠ thẻ hàng: bỏ dấu ngoặc đi vẫn đọc đúng giá và tồn', () => {
    const t = motThe(theHang({ ...GIAY, tonTruoc: true, coNgoac: false }));
    assert.strictEqual(t.gia, 1450000, 'vẫn đang nuốt số tồn vào giá');
    assert.strictEqual(t.ton, 84);
});

test('thẻ hàng: giá và tồn đọc đúng dù tồn đứng trước giá', () => {
    const t = motThe(theHang({ ...GIAY, tonTruoc: true }));
    assert.strictEqual(t.gia, 1450000);
    assert.strictEqual(t.ton, 84);
    assert.strictEqual(t.ten, GIAY.ten);
});

test('thẻ hàng: bố cục thường (giá trên, tồn dưới) không đổi gì', () => {
    for (const cn of [true, false]) {
        const t = motThe(theHang({ ...GIAY, cachNhau: cn }));
        assert.strictEqual(t.gia, 1450000, 'cachNhau=' + cn);
        assert.strictEqual(t.ton, 84);
        assert.strictEqual(t.ten, GIAY.ten);
    }
});

ghiChu('— Không được chọn nhầm ô —');

test('⚠ số tiền NẰM TRONG TÊN HÀNG không được nhận là giá', () => {
    // Có thật trên Tendoo: "Bộ quà tặng 1.000.000". Nếu quét bừa mọi ô thì
    // máy lấy nhầm giá trong tên và bỏ vào giỏ sai mặt hàng.
    const d = mot(dongGoiY({
        ten: 'Bộ quà tặng 1.000.000 đồng', ma: 'SP0999', gia: 250000, ton: 7,
    }));
    assert.strictEqual(d.gia, 250000, 'đã lấy nhầm con số nằm trong tên hàng');
});

test('⚠ ô "Tồn: 20" không được nhận nhầm là giá', () => {
    const d = mot(dongGoiY({ ...GIAY, ton: 20, tonTruoc: true }));
    assert.strictEqual(d.gia, 1450000);
    assert.strictEqual(d.ton, 20);
});

test('⚠ giá viết lồng thẻ con — 1.450.000<sup>đ</sup> — vẫn đọc được', () => {
    // Lý do bỏ điều kiện "chỉ xét phần tử lá": cái <span> bọc ngoài có con nên
    // sẽ bị loại, và máy mất luôn giá. Anh neo ^…$ mới là thứ giữ an toàn.
    const html = '<div class="ant-select-dropdown">'
        + '<div class="ant-select-item ant-select-item-option">'
        + '<span>Giày Boots nam cổ cao da lộn</span><span>SP0425</span>'
        + '<span class="o-ton">Tồn: 84</span>'
        + '<span class="o-gia">1.450.000<sup>đ</sup></span>'
        + '</div></div>';
    const d = mot(html);
    assert.strictEqual(d.gia, 1450000);
    assert.strictEqual(d.ton, 84);
});

test('⚠ số KHÔNG có nhóm ba chữ số không phải là giá', () => {
    assert.strictEqual(BoGio.docGiaTuLa(dungTaiLieu('<div><span>84</span></div>').body), null);
    assert.strictEqual(BoGio.docGiaTuLa(dungTaiLieu('<div><span>7cm</span></div>').body), null);
});

ghiChu('— Đường lùi: không tách được ô thì vẫn phải chạy như cũ —');

test('⚠ cả dòng gói trong MỘT ô -> lùi về cách đọc cũ, KHÔNG hỏng', () => {
    // Tendoo có thể đổi sang dựng cả dòng bằng một khối chữ duy nhất. Lúc ấy
    // không còn ô riêng để đọc, và bản vá này PHẢI im lặng nhường lại cho cách
    // cũ chứ không được trả null làm chết luồng bỏ hàng.
    const html = '<div class="ant-select-dropdown">'
        + '<div class="ant-select-item ant-select-item-option">'
        + 'Set Tất Trắng cổ cao chiếc SP0026 100.000 Tồn: 19</div></div>';
    const d = mot(html);
    assert.strictEqual(d.gia, 100000);
    assert.strictEqual(d.ton, 19);
    assert.strictEqual(d.ten, 'Set Tất Trắng cổ cao');
});

test('⚠ THẺ HÀNG không tách được ô -> cũng phải lùi về cách đọc cũ', () => {
    // Đối xứng với bài trên, cho nhánh thẻ hàng. Thiếu bài này thì việc quên
    // đường lùi ở docCacTheHang() lọt lưới — đã thử gài lỗi và nó lọt thật.
    // Ở đây giá là chữ trần nằm thẳng trong thẻ, không có ô riêng nào cả.
    const html = '<div class="the">SP0425 1.450.000 '
        + '<span>Giày Boots nam cổ cao da lộn (Số lượng tồn: 84)</span></div>';
    const t = motThe(html);
    assert.strictEqual(t.gia, 1450000);
    assert.strictEqual(t.ton, 84);
});

test('không có ô nào khớp thì trả null, không ném lỗi', () => {
    const b = dungTaiLieu('<div><span>chỉ có chữ</span></div>').body;
    assert.strictEqual(BoGio.docGiaTuLa(b), null);
    assert.strictEqual(BoGio.docTonTuLa(b), null);
    assert.strictEqual(BoGio.docGiaTuLa(null), null);
    assert.strictEqual(BoGio.docTonTuLa(undefined), null);
});

ghiChu('— Các lối viết Tendoo dùng —');

test('nhận cả dấu chấm lẫn dấu phẩy, kèm đuôi đ/vnd', () => {
    const gia = (t) => BoGio.docGiaTuLa(dungTaiLieu(`<div><span>${t}</span></div>`).body);
    assert.strictEqual(gia('1.450.000'), 1450000);
    assert.strictEqual(gia('1,450,000'), 1450000);
    assert.strictEqual(gia('1.450.000 đ'), 1450000);
    assert.strictEqual(gia('1.450.000đ'), 1450000);
    assert.strictEqual(gia('1.450.000 VND'), 1450000);
});

test('nhận mọi cách Tendoo viết tồn kho', () => {
    const ton = (t) => BoGio.docTonTuLa(dungTaiLieu(`<div><span>${t}</span></div>`).body);
    assert.strictEqual(ton('Tồn: 20'), 20);
    assert.strictEqual(ton('(Số lượng tồn: 6)'), 6);
    assert.strictEqual(ton('Còn: 9'), 9);
    assert.strictEqual(ton('TỒN: 0'), 0);
    assert.strictEqual(ton('Tồn kho còn nhiều'), null);
});

ghiChu('— Trang POS thật vẫn đọc y như trước —');

test('⚠ bản sao trang POS không đổi kết quả nào', () => {
    const { taoTrangPos, HANG_MAU } = require('./trangPosGiaLap');
    const t = taoTrangPos();
    const the = BoGio.docCacTheHang(t.tailieu);
    assert.strictEqual(the.length, HANG_MAU.length);
    for (const h of HANG_MAU) {
        const x = the.find(y => y.ten === h.ten);
        assert.ok(x, 'mất thẻ: ' + h.ten);
        assert.strictEqual(x.gia, h.gia, 'giá lệch ở ' + h.ten);
        assert.strictEqual(x.ton, h.ton, 'tồn lệch ở ' + h.ten);
    }
});

chay('ĐỌC GIÁ VÀ TỒN TỪ ĐÚNG Ô CỦA NÓ');
