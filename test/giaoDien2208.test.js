'use strict';

// TENDOO THAY GIAO DIỆN NGÀY 22/08/2026 — ngay trên /sales/pos, không phải pos-v2.
// Chạy: node test/giaoDien2208.test.js   (cần biến HDT_JSDOM)
//
// ── CA HỎNG THẬT ───────────────────────────────────────────────────────────
//
//   ✗ ki?n (8.565.343đ) — Lỗi: Bấm "Giày Tây Derby nam hiện đại" (1.450.000đ)
//     hai lần nhưng tổng giỏ KHÔNG nhúc nhích. Giỏ đang có 1 dòng: "1 Giày Tây
//     Derby nam hiện đại • chiếc Ghi chú 1.450.000 2.900.000" ×2.
//     Tổng: KHÔNG ĐỌC ĐƯỢC.
//
// Đọc ngược lại thì thấy ngay: hàng VÀO GIỎ ĐÚNG (1 dòng, ×2, đơn giá
// 1.450.000, thành tiền 2.900.000). Chỉ mỗi TỔNG là đọc không ra — nên máy
// thấy "không nhúc nhích" rồi dừng.
//
// ── BỐN THỨ ĐỔI, THEO ẢNH CHỤP TRANG THẬT ──────────────────────────────────
//
// 1. CHÂN GIỎ MẤT SẠCH NHÃN. Giờ chỉ còn:  🛒①  1.400.000  ⌄
//    Không còn chữ "Tổng thanh toán" nào để dò. Nới thêm vài cái nhãn là vô
//    ích — KHÔNG CÓ nhãn nào cả.
//    Nhưng bảng giỏ mới có cột "Thành tiền" -> cộng từng dòng.
//
// 2. NÚT CA ĐỔI TÊN: "Mở ca" -> "Vào ca". Chốt viết hôm 21/08 dò đúng chữ cũ
//    nên không bắt được — rất có thể đó mới là thủ phạm thật của hai lượt
//    «nút Thanh toán đang bị khóa» sáng 21/08 (mất 12.000.000đ + 9.612.236đ).
//
// 3. THẺ HÀNG đổi chữ: "(Số lượng tồn: 11)" -> "Còn: 11", và thêm "Mã: SP0095".
//
// 4. DÒNG GIỎ thêm "•" và "Ghi chú" chen vào giữa.
//
// ⛔ ĐIỀU KHÔNG ĐƯỢC ĐÁNH ĐỔI: thà DỪNG còn hơn ĐOÁN. Lấy bừa "số tiền cuối
// dòng" là đúng loại đoán mò đã đẻ ra lỗi 841.450.000 hôm 19/08.

const assert = require('node:assert');
const { test, ghiChu, chay } = require('./chay');
require('../chung/domReact');
const BoGio = require('../tendoo/boGio');
const T = require('../tendoo/bamThanhToan');
const Chup = require('../chung/chupGiaoDien');
const { taoTrangPos, HANG_MAU } = require('./trangPosGiaLap');
const { JSDOM } = require(process.env.HDT_JSDOM || 'jsdom');

const { MA } = BoGio;
const nhanh = { nghi: async () => {}, doiVeLuoi: 30, nhipNhin: 10 };
const dungTaiLieu = (html) =>
    new JSDOM('<!doctype html><body>' + html + '</body>').window.document;

/** Giỏ giao diện MỚI: hai cột tiền, chân giỏ KHÔNG nhãn. */
const trangMoi = (them = {}) => taoTrangPos({
    giaoDienMoi: true, khongCoDongTong: true, ...them,
});

ghiChu('— ⭐⭐ TỔNG GIỎ: cộng từ các dòng —');

test('⭐⭐⭐ CA "ki?n": chân giỏ mất nhãn → vẫn ra ĐÚNG tổng', async () => {
    const t = trangMoi({ gioBanDau: [{ ten: 'Giày Boots nam cổ cao da lộn', soLuong: 2 }] });
    assert.strictEqual(BoGio.docTongGio(t.tailieu), 2900000, '1.450.000 × 2');
});

test('⭐⭐ nhiều dòng thì cộng đủ', () => {
    const t = trangMoi({ gioBanDau: [
        { ten: 'Áo khoác dạ dáng dài nữ', soLuong: 2 },   // 1.980.000
        { ten: 'Quần Jogger thể thao nữ', soLuong: 1 },   //   490.000
    ] });
    assert.strictEqual(BoGio.docTongGio(t.tailieu), 2470000);
});

test('⛔⛔ thành tiền KHÔNG bằng giá × số lượng → trả null, KHÔNG đoán', () => {
    const t = trangMoi({ thanhTienSai: true,
                         gioBanDau: [{ ten: 'Áo khoác dạ dáng dài nữ', soLuong: 2 }] });
    assert.strictEqual(BoGio.docTongGio(t.tailieu), null);
});

test('⛔⛔ HAI ĐƯỜNG ĐỌC LỆCH NHAU → trả null, không chọn bừa bên nào', () => {
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Áo khoác dạ dáng dài nữ', soLuong: 2 }] });
    t.tailieu.getElementById('tongTt').textContent = '999.000';
    assert.strictEqual(BoGio.docTongGio(t.tailieu), null);
});

test('⭐ giao diện CŨ vẫn chạy y như trước', () => {
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Áo khoác dạ dáng dài nữ', soLuong: 2 }] });
    assert.strictEqual(BoGio.docTongGio(t.tailieu), 1980000);
});

test('giỏ trống thì không có tổng để đọc', () => {
    assert.strictEqual(BoGio.docTongGio(trangMoi().tailieu), null);
});

test('⭐⭐ ĐI HẾT LUỒNG trên giao diện mới: bỏ giỏ xong không kẹt', async () => {
    const t = trangMoi();
    const h = HANG_MAU[0];
    const kq = await BoGio.boVaoGio(t.tailieu, [
        { id: 'x', ten: h.ten, gia: h.gia, soLuong: 2 },
    ], nhanh);
    assert.strictEqual(kq.ma, MA.OK, 'thông báo: ' + kq.thongBao);
    assert.strictEqual(t.tongHienTai(), h.gia * 2);
});

ghiChu('— docThanhTienDong: tự kiểm chứng, không lấy bừa —');

const dong = (html, soLuong) => ({ khoi: dungTaiLieu(html).body, soLuong });

test('⭐⭐ hai cột tiền: lấy cột SAU, và phải bằng cột TRƯỚC × số lượng', () => {
    const d = dong('<span>Giày</span><span>1.450.000</span><span>2.900.000</span>', 2);
    assert.strictEqual(BoGio.docThanhTienDong(d), 2900000);
});

test('⛔ quan hệ SAI thì trả null', () => {
    const d = dong('<span>Giày</span><span>1.450.000</span><span>2.900.007</span>', 2);
    assert.strictEqual(BoGio.docThanhTienDong(d), null);
});

test('giao diện CŨ chỉ một số tiền mỗi dòng → lấy luôn số ấy', () => {
    const d = dong('<span>Giày</span><span>2.900.000</span>', 2);
    assert.strictEqual(BoGio.docThanhTienDong(d), 2900000);
});

test('số lượng 1: hai cột bằng nhau, vẫn đọc được', () => {
    const d = dong('<span>Giày</span><span>1.400.000</span><span>1.400.000</span>', 1);
    assert.strictEqual(BoGio.docThanhTienDong(d), 1400000);
});

test('⛔ rác thì trả null, không ném', () => {
    assert.strictEqual(BoGio.docThanhTienDong(null), null);
    assert.strictEqual(BoGio.docThanhTienDong({}), null);
    assert.strictEqual(BoGio.docThanhTienDong(dong('<span>không có tiền</span>', 1)), null);
    assert.strictEqual(BoGio.docThanhTienDong(dong('<span>1.000.000</span>', 0)), null);
});

ghiChu('— ⭐⭐ NÚT CA: "Mở ca" → "Vào ca" —');

test('⭐⭐⭐ nhận ra "Vào ca" — chữ mới của giao diện 22/08', () => {
    const t = taoTrangPos({ coNutMoCa: true });
    const n = t.tailieu.getElementById('nutMoCa');
    for (const c of ['Vào ca', 'vào ca', 'VÀO CA', 'Mở ca']) {
        n.textContent = c;
        assert.ok(T.timNutMoCa(t.tailieu), 'bỏ sót: ' + c);
    }
});

test('⭐⭐⭐ nút thật ghi "→ Vào ca" — có MŨI TÊN đứng trước', () => {
    // ⚠️ Chỉ phát hiện khi dựng lại ĐÚNG cái nút trong ảnh chụp trang thật rồi
    // chạy thử. Mẫu neo đầu chuỗi trượt sạch vì cái mũi tên. Nếu nó là ảnh SVG
    // thì vô hại, nhưng nếu là KÝ TỰ thì chốt 'ca chưa vào' chết câm — đúng lúc
    // cần nó nhất, và người dùng lại nhận câu 'nút Thanh toán bị khóa' vô nghĩa.
    const t = taoTrangPos({ coNutMoCa: true });
    const n = t.tailieu.getElementById('nutMoCa');
    for (const c of ['→ Vào ca', '› Mở ca', 'Vào ca ›', '• Vào ca •']) {
        n.textContent = c;
        assert.ok(T.timNutMoCa(t.tailieu), 'bỏ sót: ' + JSON.stringify(c));
    }
    // ⛔ Gỡ trang trí KHÔNG được biến thành nới lỏng: chỉ gỡ HAI ĐẦU.
    for (const c of ['→ Đóng ca', 'Hướng dẫn vào ca', 'Vào cửa hàng']) {
        n.textContent = c;
        assert.strictEqual(T.timNutMoCa(t.tailieu), null, 'nhận bừa: ' + JSON.stringify(c));
    }
});

test('gonVien chỉ gỡ hai đầu, không đụng vào giữa', () => {
    assert.strictEqual(T.gonVien('→ Vào ca'), 'Vào ca');
    assert.strictEqual(T.gonVien('• Mở ca •'), 'Mở ca');
    assert.strictEqual(T.gonVien('Vào ca'), 'Vào ca');
    assert.strictEqual(T.gonVien('Hướng dẫn vào ca'), 'Hướng dẫn vào ca');
    assert.strictEqual(T.gonVien(''), '');
    assert.strictEqual(T.gonVien(null), '');
});

test('⛔⛔ KHÔNG nhận nhầm chữ nghĩa "ca đang mở"', () => {
    // Nhận nhầm là đẩy người dùng đi vào một cái ca đang mở sẵn — sai bệnh, và
    // họ sẽ không bao giờ tìm ra nguyên nhân thật.
    const t = taoTrangPos({ coNutMoCa: true });
    const n = t.tailieu.getElementById('nutMoCa');
    // ⚠️ 'Vào ca?' ĐÃ BỊ BỎ khỏi danh sách này. Từ khi gỡ đồ trang trí ở hai
    // đầu (nút thật ghi '→ Vào ca'), dấu hỏi cuối cũng bị gỡ theo. Xét lại thì
    // đó là ĐÚNG: một nút hay câu hỏi 'Vào ca?' nghĩa là ca CHƯA vào — nhận ra
    // nó là nói đúng bệnh, không phải nới lỏng.
    for (const c of ['Đóng ca', 'Kết thúc ca', 'Ra ca', 'Vào cửa hàng',
                     'Hướng dẫn vào ca', 'Ca làm việc', 'Vào ca sau']) {
        n.textContent = c;
        assert.strictEqual(T.timNutMoCa(t.tailieu), null, 'nhận bừa: ' + c);
    }
});

ghiChu('— ⭐ THẺ HÀNG: "Còn: 11" và "Mã: SP0095" —');

const THE_MOI = '<div id="the"><span>Còn: 11</span><button>+</button>'
    + '<div><span>Áo khoác dạ dáng dài nữ</span><span>Mã: SP0095</span>'
    + '<span>990.000</span></div></div>';

test('⭐⭐ đọc được thẻ hàng kiểu mới (trước đây đọc ra SỐ KHÔNG)', () => {
    const the = BoGio.docCacTheHang(dungTaiLieu(THE_MOI));
    assert.strictEqual(the.length, 1, 'không đọc ra thẻ nào');
    assert.strictEqual(the[0].gia, 990000);
    assert.strictEqual(the[0].ton, 11);
});

test('⭐⭐ khớp được bằng MÃ HÀNG dù ô ghi "Mã: SP0095"', () => {
    const r = dungTaiLieu(THE_MOI).getElementById('the');
    assert.strictEqual(BoGio.coOMaRieng(r, 'SP0095'), true);
});

test('⛔⛔ vẫn KHÔNG cho mã ngắn khớp vào mã dài', () => {
    // "SP009" nằm gọn trong "SP0095". Nới ở đây là bỏ SAI mặt hàng vào giỏ.
    const r = dungTaiLieu(THE_MOI).getElementById('the');
    assert.strictEqual(BoGio.coOMaRieng(r, 'SP009'), false);
    assert.strictEqual(BoGio.coOMaRieng(r, 'SP00951'), false);
    assert.strictEqual(BoGio.coOMaRieng(r, 'P0095'), false);
});

test('⛔ nhãn lạ thì không nhận', () => {
    const r = dungTaiLieu('<div id=x><span>Xem SP0095</span></div>').getElementById('x');
    assert.strictEqual(BoGio.coOMaRieng(r, 'SP0095'), false);
});

test('⭐ giao diện CŨ ("Số lượng tồn") vẫn đọc được', () => {
    const t = taoTrangPos();
    const the = BoGio.docCacTheHang(t.tailieu);
    assert.strictEqual(the.length, HANG_MAU.length);
    assert.strictEqual(the.find(x => x.ten === HANG_MAU[0].ten).gia, HANG_MAU[0].gia);
});

ghiChu('— ⭐ NÚT XÓA DÒNG GIỎ trên giao diện mới —');

// Giao diện 22/08/2026 để hai biểu tượng cạnh nhau ở cuối dòng giỏ: một hình
// tờ giấy (nhân bản dòng) và một thùng rác (xóa). Bấm nhầm cái đầu là giỏ DÀI
// THÊM — và vòng dọn giỏ sẽ bấm lại tới 60 lần.

const DONG_MOI = (them = '') => dungTaiLieu(
    '<div id="d">'
    + '<button title="Giảm"><svg><path d="M19 13H5v-2h14v2z"></path></svg></button>'
    + '<input type="text" value="2">'
    + '<button title="Tăng"><svg><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"></path></svg></button>'
    + '<button title="Nhân bản dòng" class="ant-btn"></button>'
    + them
    + '</div>').getElementById('d');

test('⭐⭐ giao diện MỚI bỏ lớp "dangerous" → nhận nút xóa theo NHÃN', () => {
    const k = DONG_MOI('<button title="Xóa" class="ant-btn" id="thung"></button>');
    const n = BoGio.timNutXoaDong(k);
    assert.ok(n, 'không tìm ra nút xóa nào');
    assert.strictEqual(n.id, 'thung');
});

test('⛔⛔ TUYỆT ĐỐI KHÔNG bấm nhầm nút NHÂN BẢN DÒNG', () => {
    // Không có nút xóa nào cả -> thà trả null còn hơn vơ đại cái bên cạnh.
    const k = DONG_MOI();
    assert.strictEqual(BoGio.timNutXoaDong(k), null,
        '⛔ vơ nhầm nút nhân bản — giỏ sẽ DÀI THÊM mỗi lần bấm');
});

test('⛔⛔ TUYỆT ĐỐI KHÔNG bấm nhầm nút − hoặc + của ô số lượng', () => {
    // Hai nút ấy KHÔNG có chữ, chỉ khác nhau ở hình vẽ. Bấm nhầm là đổi số
    // lượng — hóa đơn sai tiền mà giỏ vẫn "còn hàng".
    const k = dungTaiLieu('<div id="d">'
        + '<button aria-label="Xóa bớt"><svg><path d="M19 13H5v-2h14v2z"></path></svg></button>'
        + '<button aria-label="Xoá thêm"><svg><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"></path></svg></button>'
        + '</div>').getElementById('d');
    assert.strictEqual(BoGio.timNutXoaDong(k), null, '⛔ nhận nhầm nút đổi số lượng');
});

test('⛔⛔ "Xóa ghi chú" KHÔNG phải nút xóa DÒNG', () => {
    // ⚠️ Bài 'không bấm nhầm nút nhân bản' ở trên KHÔNG chạm tới chốt này: nhãn
    // 'Nhân bản dòng' vốn đã không khớp mẫu XÓA nên bị loại sẵn. Chốt chỉ thật
    // sự gánh việc khi nhãn VỪA có chữ xóa VỪA là việc khác — như 'Xóa ghi chú'.
    // Bấm nhầm nó thì ghi chú bay mất mà dòng giỏ vẫn nguyên, và vòng dọn giỏ
    // quay 60 lần vô ích.
    const k = DONG_MOI('<button title="Xóa ghi chú" class="ant-btn"></button>');
    assert.strictEqual(BoGio.timNutXoaDong(k), null, 'nhận nhầm nút xóa ghi chú');

    // Có nút xóa dòng thật thì phải chọn ĐÚNG cái đó.
    const k2 = DONG_MOI('<button title="Xóa ghi chú" class="ant-btn"></button>'
        + '<button title="Xóa" class="ant-btn" id="thung"></button>');
    assert.strictEqual(BoGio.timNutXoaDong(k2).id, 'thung');
});

test('⭐ đường CŨ (lớp "dangerous") vẫn ưu tiên', () => {
    const k = DONG_MOI('<button class="ant-btn ant-btn-dangerous" id="cu"></button>'
        + '<button title="Xóa" class="ant-btn" id="moi"></button>');
    assert.strictEqual(BoGio.timNutXoaDong(k).id, 'cu');
});

test('⛔ nhãn mơ hồ thì không nhận', () => {
    for (const t of ['Xem chi tiết', 'Ghi chú', 'Tách dòng (SL=1)', 'Sao chép', 'Đóng']) {
        const k = DONG_MOI('<button title="' + t + '" class="ant-btn"></button>');
        assert.strictEqual(BoGio.timNutXoaDong(k), null, 'nhận bừa nhãn: ' + t);
    }
});

test('khối rỗng / rác thì trả null, không ném', () => {
    assert.strictEqual(BoGio.timNutXoaDong(null), null);
    assert.strictEqual(BoGio.timNutXoaDong(dungTaiLieu('<div id=x></div>').getElementById('x')), null);
});

test('⛔⛔ giỏ DÀI THÊM sau khi bấm → DỪNG NGAY, không bấm thêm 59 lần', async () => {
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Áo khoác dạ dáng dài nữ' }] });
    // Nút "xóa" hoá ra là nút nhân bản: mỗi cú bấm lại thêm một dòng.
    const nut = t.tailieu.querySelector('#cacDongGio button.xoa');
    nut.replaceWith(nut.cloneNode(true));
    t.tailieu.querySelector('#cacDongGio button.xoa').addEventListener('click', () => {
        const boc = t.tailieu.getElementById('cacDongGio');
        boc.appendChild(boc.firstElementChild.cloneNode(true));
    });
    const truoc = BoGio.docCacDongGio(t.tailieu).length;
    const kq = await BoGio.xoaSachGio(t.tailieu, { nghi: async () => {}, hanXoaDong: 0 });
    assert.strictEqual(kq.ok, false);
    assert.match(kq.thongBao, /DÀI THÊM/, kq.thongBao);
    const sau = BoGio.docCacDongGio(t.tailieu).length;
    assert.ok(sau - truoc <= 1, '⛔ bấm nhầm ' + (sau - truoc) + ' lần, giỏ phình ra');
});

ghiChu('— ⭐ CHỤP GIAO DIỆN: con mắt, không phải bàn tay —');

test('⭐⭐ chụp ra được chữ, có đủ các mảnh cần', () => {
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Áo khoác dạ dáng dài nữ', soLuong: 2 }] });
    const chu = Chup.chupGiaoDien(t.tailieu);
    assert.ok(chu.length > 100, 'chụp ra quá ít: ' + chu.length);
    for (const m of ['MOT DONG GIO', 'CHAN GIO', 'BANG GOI Y', 'MOT THE HANG',
                     'NUT CA', 'CHU MOC']) {
        assert.ok(chu.includes(m), 'thiếu mảnh: ' + m);
    }
});

test('⛔⛔ CHỈ ĐỌC — không bấm gì trên trang', () => {
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Áo khoác dạ dáng dài nữ' }], coNutMoCa: true });
    let daBamCa = 0;
    t.tailieu.getElementById('nutMoCa').addEventListener('click', () => { daBamCa++; });
    Chup.chupGiaoDien(t.tailieu);
    assert.strictEqual(daBamCa, 0, '⛔ ĐÃ BẤM nút ca');
    assert.strictEqual(t.daBam.thanhToan, 0, '⛔ ĐÃ BẤM Thanh toán');
    assert.strictEqual(t.daBam.xacNhan, 0);
    assert.strictEqual(t.daBam.xoa, undefined, 'đã bấm xóa');
});

test('⛔⛔ KHÔNG BAO GIỜ ném, dù trang hỏng cỡ nào', () => {
    for (const x of [null, undefined, {}, { querySelectorAll: () => { throw new Error('vỡ'); } }]) {
        const r = Chup.chupGiaoDien(x);
        assert.strictEqual(typeof r, 'string', 'ném với ' + String(x));
    }
});

test('⛔⛔ THAM SỐ tự nổ cũng không được ném — chốt ngoài cùng phải sống', () => {
    // ⚠️ Bản đầu đọc tuyChon.tranMoiMang NGAY TRƯỚC khối try, nên một getter nổ
    // ở đó là cả hàm ném ra ngoài. Và gài lỗi bỏ khối catch ngoài cùng thì
    // KHÔNG bài nào đỏ — mọi bước bên trong đều tự bắt lỗi riêng, khối ấy chưa
    // từng được chạy tới. Đây là bài duy nhất chạm được vào nó.
    const t = taoTrangPos();
    const r = Chup.chupGiaoDien(t.tailieu, { get tranMoiMang() { throw new Error('vỡ'); } });
    assert.strictEqual(typeof r, 'string');
    assert.match(r, /chụp dở dang/, 'không kể lại là đã hỏng: ' + r.slice(0, 200));
});

test('⛔ mảnh nào thiếu thì ghi "(không thấy)", KHÔNG mất các mảnh khác', () => {
    // Trang trống trơn: không dòng giỏ, không chân giỏ, không thẻ nào.
    const chu = Chup.chupGiaoDien(dungTaiLieu('<div>trống</div>'));
    assert.ok(chu.includes('(không thấy)'), chu.slice(0, 200));
    assert.ok(chu.includes('CHU MOC'), 'mất mảnh cuối vì một mảnh hỏng');
});

test('⛔ cắt bớt khi quá dài, và NÓI RÕ là đã cắt', () => {
    const dai = 'x'.repeat(9000);
    const r = Chup.catBot(dai, 100);
    assert.ok(r.length < 200);
    assert.match(r, /đã cắt bớt 8900 ký tự/);
    assert.strictEqual(Chup.catBot('ngắn', 100), 'ngắn');
});

ghiChu('— ⭐⭐⭐ TỔNG TRONG BẢNG XÁC NHẬN: chốt cuối trước tiền thật —');

// ── CA HỎNG THẬT: 22/08/2026, lượt 11:29 ───────────────────────────────────
//
//   ✗ ki?n (8.565.343đ) — Lỗi: Tổng cộng trong bảng xác nhận (NULL) không khớp
//     tổng đã tính (1450000) — đã bấm Quay lại, CHƯA phát hành gì.
//
// `null` = ĐỌC KHÔNG RA, không phải sai số. Tendoo bỏ chữ "Tổng cộng" khỏi bảng
// xác nhận — cùng một bệnh với chân giỏ, chỉ dịch sang một chỗ khác.
//
// ⚠️ VÌ SAO NỚI DANH SÁCH NHÃN Ở ĐÂY LÀ AN TOÀN, TRONG KHI Ở CHÂN GIỎ THÌ KHÔNG:
//   · chân giỏ      -> máy LẤY con số đó làm tổng. Đọc nhầm = hóa đơn sai tiền.
//   · bảng xác nhận -> máy chỉ SO SÁNH với con số đã tính. Đọc nhầm = KHÔNG KHỚP
//     -> dừng. Không đời nào thành hóa đơn sai.
// Câu hỏi đúng không phải "tổng trong bảng là bao nhiêu" mà là "bảng có đang
// hiện ĐÚNG con số này không". Hỏi đúng câu thì nới nhãn chẳng nới lỏng được gì.

const bangRoi = (html) => new JSDOM('<!doctype html><body><div id="b">' + html
    + '</div></body>').window.document.getElementById('b');

test('⭐⭐⭐ CA 11:29 — nhãn đổi thành "Phải thu" → VẪN nhận ra đúng số', () => {
    const b = bangRoi('<div><span>Tiền hàng</span><span>1.450.000</span></div>'
        + '<div><span>Phải thu</span><span>1.450.000</span></div>');
    assert.strictEqual(T.coTongDung(b, 1450000), true);
});

test('⭐⭐ nhận nhiều lối Tendoo có thể viết', () => {
    for (const nhan of ['Tổng cộng', 'Tổng tiền', 'Tổng thanh toán', 'Thành tiền',
                        'Khách phải trả', 'Phải thu', 'Cần thanh toán']) {
        const b = bangRoi('<div><span>' + nhan + '</span><span>1.450.000</span></div>');
        assert.strictEqual(T.coTongDung(b, 1450000), true, 'bỏ sót nhãn: ' + nhan);
    }
});

test('⛔⛔ SỐ KHÁC thì vẫn phải TỪ CHỐI — đây là chốt cuối trước tiền thật', () => {
    const b = bangRoi('<div><span>Phải thu</span><span>1.450.000</span></div>');
    assert.strictEqual(T.coTongDung(b, 1450001), false, 'lệch 1 đồng mà vẫn cho qua');
    assert.strictEqual(T.coTongDung(b, 2900000), false);
    assert.strictEqual(T.coTongDung(b, 0), false);
});

test('⛔⛔ nhãn LẠ HOÀN TOÀN → TỪ CHỐI, không vơ đại số nào trong bảng', () => {
    // Đây là điều giữ cho việc nới nhãn không thành nới lỏng: không nhãn nào
    // khớp thì dừng, dù con số đúng đang nằm chình ình ngay đó.
    const b = bangRoi('<div><span>Số tiền cần trả</span><span>1.450.000</span></div>');
    assert.strictEqual(T.coTongDung(b, 1450000), false);
});

test('⛔ rác thì trả false, không ném', () => {
    assert.strictEqual(T.coTongDung(null, 1450000), false);
    assert.strictEqual(T.coTongDung(bangRoi('<span>abc</span>'), 1450000), false);
    assert.strictEqual(T.coTongDung(bangRoi('<span>Phải thu 1.450.000</span>'), NaN), false);
    assert.strictEqual(T.coTongDung(bangRoi('<span>Phải thu 1.450.000</span>'), null), false);
});

ghiChu('— ⭐ KHI DỪNG PHẢI KỂ RA NHÃN MỚI —');

test('⭐⭐⭐ kể ra mọi số tiền kèm CHỮ ĐỨNG TRƯỚC nó', () => {
    // Đây là thứ tự trả lời cho chính danh sách nhãn ở trên: đoán trượt tên thì
    // lần chạy tới log nói ra tên đúng, khỏi chụp ảnh, khỏi mò.
    const b = bangRoi('<div><span>Tiền hàng</span><span>1.450.000</span></div>'
        + '<div><span>Số tiền cần trả</span><span>1.450.000</span></div>');
    const chu = T.keCacSoTrongBang(b);
    assert.match(chu, /«Tiền hàng» 1\.450\.000/, chu);
    assert.match(chu, /«Số tiền cần trả» 1\.450\.000/, 'không kể ra nhãn lạ: ' + chu);
});

test('⛔ keCacSoTrongBang KHÔNG BAO GIỜ ném', () => {
    for (const x of [null, undefined, {}, { querySelectorAll: () => { throw new Error('vỡ'); } }]) {
        assert.strictEqual(typeof T.keCacSoTrongBang(x), 'string', 'ném với ' + String(x));
    }
    assert.match(T.keCacSoTrongBang(bangRoi('<span>abc</span>')), /không thấy số tiền nào/);
});

ghiChu('— ⭐⭐ ĐI HẾT LUỒNG với bảng xác nhận kiểu mới —');

test('⭐⭐⭐ nhãn "Phải thu" → PHÁT HÀNH ĐƯỢC (ca 11:29 được cứu)', async () => {
    const trang = taoTrangPos({
        gioBanDau: [{ ten: 'Áo khoác dạ dáng dài nữ', soLuong: 2 }],
        nhanTongBang: 'Phải thu',
    });
    const kq = await T.taoLuot().bam(trang.tailieu, {
        choPhep: true, tongMongDoi: 1980000, nghi: async () => {},
        hanChoBangMs: 60, nhipChoMs: 10, hanChoThueDong: 40, doiSauBam: 40,
        hanChoQuay: 40, hanChoNutMo: 40,
    });
    assert.strictEqual(kq.ma, T.MA.XONG, 'thông báo: ' + kq.thongBao);
    assert.strictEqual(trang.daBam.xacNhan, 1, 'phải xác nhận đúng MỘT lần');
});

test('⛔⛔ nhãn LẠ → DỪNG, bấm Quay lại, và KỂ RA nhãn ấy', async () => {
    const trang = taoTrangPos({
        gioBanDau: [{ ten: 'Áo khoác dạ dáng dài nữ', soLuong: 2 }],
        nhanTongBang: 'Số tiền cần trả',
    });
    const kq = await T.taoLuot().bam(trang.tailieu, {
        choPhep: true, tongMongDoi: 1980000, nghi: async () => {},
        hanChoBangMs: 60, nhipChoMs: 10, hanChoThueDong: 40, doiSauBam: 40,
        hanChoQuay: 40, hanChoNutMo: 40,
    });
    assert.strictEqual(kq.ma, T.MA.BANG_SAI_TONG, 'thông báo: ' + kq.thongBao);
    assert.strictEqual(trang.daBam.xacNhan, 0, '⛔ ĐÃ PHÁT HÀNH dù không đọc được tổng');
    assert.strictEqual(trang.daBam.quayLai, 1, 'không bấm Quay lại để đóng bảng');
    assert.match(kq.thongBao, /Máy nhìn thấy trong bảng:/, kq.thongBao);
    assert.match(kq.thongBao, /Số tiền cần trả/, 'không kể ra nhãn mới: ' + kq.thongBao);
    assert.match(kq.thongBao, /CHƯA phát hành gì/, kq.thongBao);
});

test('⛔⛔ bảng hiện SAI SỐ thì vẫn dừng như trước', async () => {
    const trang = taoTrangPos({
        gioBanDau: [{ ten: 'Áo khoác dạ dáng dài nữ', soLuong: 2 }],
        tongBangXn: 999000,
    });
    const kq = await T.taoLuot().bam(trang.tailieu, {
        choPhep: true, tongMongDoi: 1980000, nghi: async () => {},
        hanChoBangMs: 60, nhipChoMs: 10, hanChoThueDong: 40, doiSauBam: 40,
        hanChoQuay: 40, hanChoNutMo: 40,
    });
    assert.strictEqual(kq.ma, T.MA.BANG_SAI_TONG);
    assert.strictEqual(trang.daBam.xacNhan, 0);
});

test('⭐ bộ chụp lấy được cả BẢNG XÁC NHẬN khi nó đang mở', () => {
    const trang = taoTrangPos({ gioBanDau: [{ ten: 'Áo khoác dạ dáng dài nữ' }] });
    trang.tailieu.getElementById('nutThanhToan').click();
    const chu = Chup.chupGiaoDien(trang.tailieu);
    assert.ok(chu.includes('BANG XAC NHAN'), 'thiếu mảnh bảng xác nhận');
    // ⚠️ Mẫu đầu tôi viết `[^=]*` — mà giữa hai chỗ ấy có sẵn dấu `=` của dòng
    // tiêu đề, nên nó KHÔNG BAO GIỜ khớp và bài kiểm chẳng canh được gì. Gài
    // lỗi cho bộ chụp thôi lấy bảng xác nhận thì nó vẫn xanh.
    assert.ok(!/BANG XAC NHAN[\s\S]{0,80}\(không thấy\)/.test(chu),
        'không chép được nội dung bảng');
});

ghiChu('— Nối dây —');

const fs = require('node:fs');
const path = require('node:path');
const doc = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('⭐ manifest nạp bộ chụp vào tab Tendoo, TRƯỚC nhanLenh.js', () => {
    // Tai nghe nằm trong nhanLenh.js và cần G.HDT_ChupGiaoDien đã có sẵn.
    const m = JSON.parse(doc('manifest.json'));
    const nhom = m.content_scripts.find(x => x.matches.some(u => /seller-v3/.test(u)));
    const i = nhom.js.indexOf('chung/chupGiaoDien.js');
    const j = nhom.js.indexOf('tendoo/nhanLenh.js');
    assert.ok(i >= 0, 'chưa nạp chung/chupGiaoDien.js');
    assert.ok(i < j, 'nạp SAU nhanLenh.js — lúc tai nghe chạy sẽ không có bộ chụp');
});

test('⛔ KHÔNG nạp bộ chụp vào trang bongtom.store', () => {
    const m = JSON.parse(doc('manifest.json'));
    for (const nhom of m.content_scripts) {
        if (nhom.matches.some(u => /seller-v3/.test(u))) continue;
        assert.ok(!nhom.js.includes('chung/chupGiaoDien.js'),
            'nạp thừa vào: ' + nhom.matches.join(','));
    }
});

test('⭐ nền có cầu nối, và màn khai báo có nút', () => {
    assert.match(doc('background.js'), /tin\.loai === 'hdt-chup-giao-dien'/);
    assert.match(doc('tendoo/nhanLenh.js'), /LOAI_CHUP_GIAO_DIEN/);
    assert.match(doc('popup/khaiBao.js'), /kbChupNut/);
});

chay('TENDOO THAY GIAO DIỆN 22/08/2026');
