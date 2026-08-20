'use strict';

// Test BỎ HÀNG VÀO GIỎ trên bản sao trang POS của Tendoo.
// Chạy: node test/boGio.test.js   (cần biến HDT_JSDOM)
//
// Bài test quan trọng nhất ở đây không phải "bỏ được hàng vào giỏ", mà là
// "KHÔNG BAO GIỜ bấm Thanh toán" và "thà dừng còn hơn chọn nhầm mặt hàng".

const assert = require('node:assert');
const { test, ghiChu, chay } = require('./chay');
require('../chung/domReact');                 // gắn HDT_DomReact vào globalThis
const BoGio = require('../tendoo/boGio');
const { taoTrangPos, HANG_MAU } = require('./trangPosGiaLap');

const { MA } = BoGio;
const nhanh = { nghi: async () => {}, doiVeLuoi: 0 };

const mon = (ten, soLuong) => {
    const h = HANG_MAU.find(x => x.ten === ten);
    return { id: 'id-' + ten, ten: h.ten, gia: h.gia, soLuong };
};

ghiChu('— Đọc màn hình —');

test('đọc đúng tên, giá, tồn của từng thẻ hàng', () => {
    const t = taoTrangPos();
    const the = BoGio.docCacTheHang(t.tailieu);
    assert.strictEqual(the.length, HANG_MAU.length);
    const ao = the.find(x => x.ten === 'Áo khoác dạ dáng dài nữ');
    assert.strictEqual(ao.gia, 990000);
    assert.strictEqual(ao.ton, 22);
});

test('⚠ chọn ĐÚNG ô tìm sản phẩm, KHÔNG nhầm sang ô tìm khách hàng', () => {
    const t = taoTrangPos();
    const o = BoGio.timOTimKiem(t.tailieu);
    assert.ok(o, 'không tìm thấy ô tìm kiếm');
    assert.strictEqual(o.id, 'oTimSanPham');
    assert.notStrictEqual(o.id, 'oTimKhachHang',
        'gõ tên hàng vào ô khách hàng = chọn nhầm khách cho đơn');
});

test('giỏ trống thì báo trống, có hàng thì báo có', () => {
    assert.strictEqual(BoGio.gioDangTrong(taoTrangPos().tailieu), true);
    const t2 = taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }] });
    assert.strictEqual(BoGio.gioDangTrong(t2.tailieu), false);
});

test('đọc được "Tổng thanh toán" Tendoo hiện lên', () => {
    const t = taoTrangPos({ gioBanDau: [
        { ten: 'Áo khoác dạ dáng dài nữ', soLuong: 2 },   // 1.980.000
        { ten: 'Quần Jogger thể thao nữ', soLuong: 1 },   //   490.000
    ] });
    assert.strictEqual(BoGio.docTongGio(t.tailieu), 2470000);
    assert.strictEqual(BoGio.docTongGio(t.tailieu), t.tongHienTai());
});

ghiChu('— Bỏ hàng vào giỏ —');

test('bỏ một món, số lượng 1', async () => {
    const t = taoTrangPos();
    const kq = await BoGio.boVaoGio(t.tailieu, [mon('Quần Jogger thể thao nữ', 1)], nhanh);
    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.deepStrictEqual(t.xemGio(), [{ ten: 'Quần Jogger thể thao nữ', gia: 490000, soLuong: 1 }]);
    assert.strictEqual(kq.tongTendoo, 490000);
});

test('bỏ nhiều món, mỗi món nhiều cái', async () => {
    const t = taoTrangPos();
    const kq = await BoGio.boVaoGio(t.tailieu, [
        mon('Áo khoác dạ dáng dài nữ', 3),          // 2.970.000
        mon('Giày Boots nam cổ cao da lộn', 2),     // 2.900.000
    ], nhanh);
    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.deepStrictEqual(t.xemGio().map(d => [d.ten, d.soLuong]), [
        ['Áo khoác dạ dáng dài nữ', 3], ['Giày Boots nam cổ cao da lộn', 2],
    ]);
    assert.strictEqual(kq.tongTendoo, 5870000);
});

test('tổng Tendoo hiện lên KHỚP tổng tự tính — nguyên liệu cho cửa chặn 2', async () => {
    const t = taoTrangPos();
    const ds = [mon('Áo khoác dạ dáng dài nữ', 4), mon('Áo Gilet phao Thu Đông nữ', 2)];
    const kq = await BoGio.boVaoGio(t.tailieu, ds, nhanh);
    const tuTinh = ds.reduce((s, m) => s + m.gia * m.soLuong, 0);
    assert.strictEqual(kq.tongTendoo, tuTinh);
});

test('⚠ PHÂN BIỆT ĐƯỢC hai món trùng chữ viết tắt nhưng khác giá', async () => {
    // "ÁGPTĐN" là chữ viết tắt của CẢ "Áo Gilet phao Thu Đông nam" (850.000)
    // lẫn "... nữ" (890.000). Chọn nhầm là hóa đơn sai tiền.
    const t = taoTrangPos();
    const kq = await BoGio.boVaoGio(t.tailieu, [mon('Áo Gilet phao Thu Đông nữ', 1)], nhanh);
    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.deepStrictEqual(t.xemGio(), [
        { ten: 'Áo Gilet phao Thu Đông nữ', gia: 890000, soLuong: 1 },
    ]);
});

ghiChu('— Thà dừng còn hơn làm sai —');

test('GIỎ ĐANG CÓ HÀNG → DỪNG NGAY, không bỏ thêm gì', async () => {
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }] });
    const kq = await BoGio.boVaoGio(t.tailieu, [mon('Áo khoác dạ dáng dài nữ', 2)], nhanh);
    assert.strictEqual(kq.ma, MA.GIO_KHONG_TRONG);
    assert.strictEqual(t.xemGio().length, 1, 'đã bỏ thêm vào giỏ đang dở');
    // Thông báo phải chỉ rõ CÓ MẤY MÓN và NÚT XÓA Ở ĐÂU — người dùng đang
    // đứng ở tab Sell, nút lại nằm ở tab Tendoo.
    assert.match(kq.thongBao, /đang có sẵn 1 món/);
    assert.match(kq.thongBao, /Xóa sạch giỏ/);
    assert.match(kq.thongBao, /góc dưới bên phải/);
});

test('không tìm thấy hàng → dừng, KHÔNG bấm bừa thẻ nào', async () => {
    const t = taoTrangPos();
    const kq = await BoGio.boVaoGio(t.tailieu,
        [{ id: 'x', ten: 'Món không hề tồn tại', gia: 123000, soLuong: 1 }], nhanh);
    assert.strictEqual(kq.ma, MA.KHONG_TIM_THAY_HANG);
    assert.strictEqual(t.xemGio().length, 0);
});

test('tên đúng nhưng GIÁ LỆCH → coi như không tìm thấy, không bấm', async () => {
    const t = taoTrangPos();
    const kq = await BoGio.boVaoGio(t.tailieu,
        [{ id: 'x', ten: 'Áo khoác dạ dáng dài nữ', gia: 111000, soLuong: 1 }], nhanh);
    assert.strictEqual(kq.ma, MA.KHONG_TIM_THAY_HANG);
    assert.strictEqual(t.xemGio().length, 0, 'đã bấm dù giá không khớp');
});

test('HAI món trùng CẢ tên lẫn giá → DỪNG, tuyệt đối không đoán', async () => {
    const hang = [...HANG_MAU,
        { ma: 'TRUNG', ten: 'Hàng trùng tên', gia: 500000, ton: 5 },
        { ma: 'TRUNG', ten: 'Hàng trùng tên', gia: 500000, ton: 5 }];
    const t = taoTrangPos({ hang });
    const kq = await BoGio.boVaoGio(t.tailieu,
        [{ id: 'x', ten: 'Hàng trùng tên', gia: 500000, soLuong: 1 }], nhanh);
    assert.strictEqual(kq.ma, MA.KHONG_PHAN_BIET_DUOC);
    assert.strictEqual(t.xemGio().length, 0, 'đã chọn bừa một trong hai');
    assert.match(kq.thongBao, /không phân biệt được/i);
});

test('đòi nhiều hơn tồn kho → DỪNG TRƯỚC KHI bấm', async () => {
    const t = taoTrangPos();
    // Quần Jogger chỉ còn 1 cái.
    const kq = await BoGio.boVaoGio(t.tailieu, [mon('Quần Jogger thể thao nữ', 5)], nhanh);
    assert.strictEqual(kq.ma, MA.KHONG_DAT_DUOC_SO_LUONG);
    assert.strictEqual(t.xemGio().length, 0, 'đã bấm dù biết thừa là không đủ hàng');
    assert.match(kq.thongBao, /chỉ còn 1/);
});

test('Tendoo chặn số lượng giữa chừng → báo lỗi, KHÔNG coi là xong', async () => {
    // Ép tồn kho tụt xuống ngay sau khi đọc thẻ: giống hệt cảnh có người khác
    // vừa mua mất hàng.
    const hang = HANG_MAU.map(h => ({ ...h }));
    const t = taoTrangPos({ hang });
    const sp = hang.find(h => h.ten === 'Áo khoác dạ dáng dài nữ');
    // Gắn vào KHUNG BẢNG GỢI Ý — đó mới là nơi máy thật sự bấm để chọn hàng
    // (gõ tìm kiếm KHÔNG lọc lưới). Khung này sống qua các lần vẽ lại.
    t.tailieu.getElementById('bangGoiY')
        .addEventListener('click', () => { sp.ton = 1; }, { once: true });
    const kq = await BoGio.boVaoGio(t.tailieu, [mon('Áo khoác dạ dáng dài nữ', 5)], nhanh);
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ma, MA.KHONG_DAT_DUOC_SO_LUONG);
});

test('không đọc được "Tổng thanh toán" → báo lỗi chứ không đoán số', async () => {
    // Giỏ TRỐNG mà không có dòng tổng là chuyện BÌNH THƯỜNG của Tendoo (đo trang
    // thật 2026-08-12), nên chỗ đó máy hiểu là 0. Cảnh hỏng thật là bỏ hàng vào
    // rồi mà vẫn không đọc được tổng — lúc ấy máy phải DỪNG, không được đoán.
    const t = taoTrangPos({ khongCoDongTong: true });
    const kq = await BoGio.boVaoGio(t.tailieu, [mon('Quần Jogger thể thao nữ', 1)], nhanh);
    assert.strictEqual(kq.ok, false);
    assert.ok(kq.ma === MA.KHONG_DOC_DUOC_TONG || kq.ma === MA.KHONG_VAO_GIO,
              `mã lạ: ${kq.ma}`);
    assert.strictEqual(t.daBam.thanhToan, 0, 'không đọc được tổng mà vẫn bấm Thanh toán');
});

ghiChu('— ⛔ TUYỆT ĐỐI KHÔNG BẤM THANH TOÁN —');

test('bỏ hàng thành công vẫn KHÔNG bấm Thanh toán, KHÔNG bấm Lưu đơn', async () => {
    const t = taoTrangPos();
    await BoGio.boVaoGio(t.tailieu, [
        mon('Áo khoác dạ dáng dài nữ', 2), mon('Giày Boots nữ cổ ngắn da mềm', 1),
    ], nhanh);
    assert.strictEqual(t.daBam.thanhToan, 0, '❌ ĐÃ BẤM THANH TOÁN — phát hành hóa đơn thật!');
    assert.strictEqual(t.daBam.luuDon, 0, 'đã bấm Lưu đơn');
});

test('mọi đường LỖI cũng không bấm Thanh toán', async () => {
    const cacCa = [
        { ds: [{ id: 'x', ten: 'Không có', gia: 1, soLuong: 1 }], gioBanDau: [] },
        { ds: [mon('Quần Jogger thể thao nữ', 99)], gioBanDau: [] },
        { ds: [mon('Áo khoác dạ dáng dài nữ', 1)],
          gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }] },
    ];
    for (const ca of cacCa) {
        const t = taoTrangPos({ gioBanDau: ca.gioBanDau });
        await BoGio.boVaoGio(t.tailieu, ca.ds, nhanh);
        assert.strictEqual(t.daBam.thanhToan, 0, '❌ ĐÃ BẤM THANH TOÁN trên đường lỗi!');
    }
});

test('xóa sạch giỏ cũng không đụng tới nút Thanh toán', async () => {
    const t = taoTrangPos({ gioBanDau: [
        { ten: 'Quần Jogger thể thao nữ' }, { ten: 'Áo khoác dạ dáng dài nữ', soLuong: 2 },
    ] });
    const kq = await BoGio.xoaSachGio(t.tailieu, nhanh);
    assert.strictEqual(kq.ok, true);
    assert.strictEqual(t.xemGio().length, 0);
    assert.strictEqual(t.daBam.thanhToan, 0);
    assert.strictEqual(t.daBam.luuDon, 0);
});

ghiChu('— Dọn dẹp sau khi làm —');

test('làm xong thì trả ô tìm kiếm về trống', async () => {
    const t = taoTrangPos();
    await BoGio.boVaoGio(t.tailieu, [mon('Quần Jogger thể thao nữ', 1)], nhanh);
    assert.strictEqual(t.tailieu.getElementById('oTimSanPham').value, '');
});

test('KHÔNG gõ gì vào ô tìm khách hàng', async () => {
    const t = taoTrangPos();
    await BoGio.boVaoGio(t.tailieu, [mon('Quần Jogger thể thao nữ', 1)], nhanh);
    assert.strictEqual(t.tailieu.getElementById('oTimKhachHang').value, '',
        'đã gõ vào ô khách hàng — sẽ gán nhầm khách cho đơn');
});

ghiChu('— ⭐ Bảng gợi ý: thứ Tendoo THẬT hiện ra khi gõ tìm kiếm —');

test('gõ tìm kiếm KHÔNG lọc lưới — lưới vẫn nguyên', async () => {
    // Quan sát thật 2026-08-11: gõ xong, lưới vẫn 50 thẻ. Trước đây code tưởng
    // lưới bị lọc nên đi đọc lưới -> báo "không tìm thấy" dù Tendoo đã tìm ra.
    const t = taoTrangPos();
    const truoc = t.tailieu.querySelectorAll('#luoiHang > div').length;
    const D = globalThis.HDT_DomReact;
    D.datGiaTri(BoGio.timOTimKiem(t.tailieu), 'Quần Jogger');
    await new Promise(r => setTimeout(r, 10));
    assert.strictEqual(t.tailieu.querySelectorAll('#luoiHang > div').length, truoc,
        'trang giả đang lọc lưới — không giống Tendoo thật');
    assert.ok(t.tailieu.querySelectorAll('.ant-select-item-option').length > 0,
        'gõ xong phải mở bảng gợi ý');
});

test('đọc đúng tên/giá/tồn từ dòng gợi ý, dù chữ dính liền nhau', () => {
    const t = taoTrangPos();
    const D = globalThis.HDT_DomReact;
    D.datGiaTri(BoGio.timOTimKiem(t.tailieu), 'Quần Jogger thể thao nữ');
    const ds = BoGio.docCacDongGoiY(t.tailieu);
    assert.strictEqual(ds.length, 1);
    assert.strictEqual(ds[0].ten, 'Quần Jogger thể thao nữ', 'tên bị dính đơn vị hoặc mã SP');
    assert.strictEqual(ds[0].gia, 490000);
    assert.strictEqual(ds[0].ton, 1);
});

ghiChu('— ⭐ Nút xóa nhận theo lớp "dangerous", không theo vị trí —');

test('mỗi dòng giỏ có 4 nút KHÔNG CHỮ — phải chọn đúng nút xóa', async () => {
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }] });
    const dong = BoGio.docCacDongGio(t.tailieu)[0];
    const nutKhongChu = [...dong.khoi.querySelectorAll('button')]
        .filter(b => !(b.textContent || '').trim());
    assert.ok(nutKhongChu.length >= 4, 'trang giả chưa giống thật: phải có ≥4 nút không chữ');

    const nutXoa = BoGio.timNutXoaDong(dong.khoi);
    assert.ok(nutXoa, 'không tìm được nút xóa');
    assert.match(String(nutXoa.className), /dangerous/,
        'chọn nút xóa theo vị trí là ăn may — phải theo lớp "dangerous"');
});

test('bấm nhầm nút "+" thì giỏ KHÔNG hết — nên phải chọn đúng nút', async () => {
    // Nút + nhận theo HÌNH VẼ / vị trí, vì trang thật không cho nó lớp riêng.
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Áo khoác dạ dáng dài nữ' }] });
    const dong = BoGio.docCacDongGio(t.tailieu)[0];
    BoGio.timNutCong(dong.oSoLuong).click();
    assert.strictEqual(t.xemGio().length, 1, 'nút + phải tăng số lượng, không xóa dòng');
    assert.strictEqual(t.xemGio()[0].soLuong, 2);
});

test('xóa sạch giỏ nhiều dòng — dùng đúng nút, không chạy vô tận', async () => {
    const t = taoTrangPos({ gioBanDau: [
        { ten: 'Quần Jogger thể thao nữ' },
        { ten: 'Áo khoác dạ dáng dài nữ', soLuong: 3 },
        { ten: 'Giày Boots nữ cổ ngắn da mềm', soLuong: 2 },
    ] });
    const kq = await BoGio.xoaSachGio(t.tailieu, nhanh);
    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.strictEqual(t.xemGio().length, 0);
    assert.strictEqual(t.daBam.thanhToan, 0);
});

test('không có nút "dangerous" nào → báo KHÔNG xóa được, tuyệt đối không báo xong', async () => {
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }] });
    // Nút xóa THẬT mang HAI lớp: `ant-btn-dangerous` và `ant-btn-color-dangerous`.
    // Gỡ mỗi lớp thứ nhất là vẫn còn lớp thứ hai -> nút vẫn bị tìm thấy và giỏ
    // vẫn bị xóa, test tưởng đã dựng đúng cảnh "không có nút xóa" mà thật ra không.
    t.tailieu.querySelectorAll('#cacDongGio .xoa').forEach((b) => {
        b.className = String(b.className).split(/\s+/).filter(c => !/danger/i.test(c)).join(' ');
    });
    const kq = await BoGio.xoaSachGio(t.tailieu, nhanh);
    assert.strictEqual(kq.ok, false, '❌ báo "đã xóa sạch" trong khi giỏ vẫn còn hàng');
    assert.strictEqual(t.xemGio().length, 1);
});

test('⭐ không dọn được giỏ → thông báo phải CHỈ ĐƯỜNG, không bỏ lửng', async () => {
    // Câu cũ chỉ có mỗi "Không thấy nút xóa dòng trong giỏ" — người dùng đứng ở
    // tab Sell, đọc xong không biết làm gì, cũng không biết hóa đơn ra chưa.
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }] });
    t.tailieu.querySelectorAll('#cacDongGio .xoa').forEach((b) => {
        b.className = String(b.className).split(/\s+/).filter(c => !/danger/i.test(c)).join(' ');
    });
    const kq = await BoGio.xoaSachGio(t.tailieu, nhanh);
    assert.strictEqual(kq.ok, false);
    assert.match(kq.thongBao, /đang có 1 món/, 'không nói giỏ có mấy món');
    assert.match(kq.thongBao, /sang tab Tendoo/i, 'không chỉ việc phải làm');
    assert.match(kq.thongBao, /CHƯA phát hành hóa đơn nào/, 'không trấn an về hóa đơn');
});

ghiChu('— ⭐ Kiểm NGAY sau mỗi món, không đợi tới cuối —');

test('⭐ cú bấm đầu bị NUỐT → thử lại một lần, giỏ vẫn đủ và tổng khớp', async () => {
    // Đây ĐÚNG là cảnh đã xảy ra thật: máy chọn 2 món, chỉ 1 món vào giỏ,
    // "Tendoo hiện 890000 nhưng mình tính 1680000".
    const t = taoTrangPos({ nuotCuBamDau: 1 });
    const ds = [mon('Áo Gilet phao Thu Đông nữ', 1), mon('Quần Jogger thể thao nữ', 1)];
    const kq = await BoGio.boVaoGio(t.tailieu, ds, nhanh);

    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.strictEqual(t.xemGio().length, 2, 'vẫn mất món');
    assert.strictEqual(kq.tongTendoo, ds.reduce((s, m) => s + m.gia, 0));
});

test('⭐ bị nuốt liên tục → DỪNG ngay tại món đó, NÓI RÕ TÊN MÓN', async () => {
    // Bản cũ đi tiếp im lặng, tới cuối mới báo hai con số lệch nhau — đúng
    // nhưng vô dụng, vì không ai biết MÓN NÀO thiếu.
    const t = taoTrangPos({ nuotCuBamDau: 5 });
    const kq = await BoGio.boVaoGio(t.tailieu, [mon('Áo Gilet phao Thu Đông nữ', 1)], nhanh);

    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ma, MA.KHONG_VAO_GIO);
    assert.match(kq.thongBao, /Áo Gilet phao Thu Đông nữ/, 'không nói tên món');
    assert.match(kq.thongBao, /890\.000/, 'không nói giá món');
    assert.match(kq.thongBao, /CHƯA phát hành hóa đơn nào/);
    assert.strictEqual(t.xemGio().length, 0);
});

test('⭐ thử lại TỐI ĐA MỘT lần — không bấm mãi thành thêm trùng', async () => {
    // Bấm thẻ hàng không phát hành gì nên thử lại an toàn, nhưng bấm mãi thì
    // có ngày một món vào giỏ hai lần — hóa đơn sai tiền.
    const t = taoTrangPos({ nuotCuBamDau: 5 });
    let soLanBam = 0;
    t.tailieu.getElementById('bangGoiY')
        .addEventListener('click', () => { soLanBam++; }, true);
    await BoGio.boVaoGio(t.tailieu, [mon('Áo Gilet phao Thu Đông nữ', 1)], nhanh);
    assert.ok(soLanBam <= 2, `bấm ${soLanBam} lần cho một món — quá trần`);
});

test('⭐ món vào giỏ HAI LẦN → bắt được ngay, không để ra hóa đơn sai tiền', async () => {
    // Một cú bấm mà Tendoo thêm hai cái (tay nghe bị gắn hai lần). Bản cũ tin
    // vào dòng giỏ bắt được lúc trước nên không thấy; nay đọc lại giỏ để kiểm.
    const t = taoTrangPos({ themGapDoi: true });
    const kq = await BoGio.boVaoGio(t.tailieu, [mon('Áo Gilet phao Thu Đông nữ', 1)], nhanh);

    assert.strictEqual(kq.ok, false, 'cho qua dù giỏ có 2 cái');
    assert.strictEqual(kq.ma, MA.KHONG_DAT_DUOC_SO_LUONG);
    assert.match(kq.thongBao, /Áo Gilet phao Thu Đông nữ/);
    assert.match(kq.thongBao, /giỏ đang có 2/);
});


test('⭐ TỔNG phải tăng ĐÚNG bằng tiền món vừa bỏ', async () => {
    // Ép Tendoo hiện tổng sai (giảm giá, đổi giá…) — phải bắt được NGAY tại món
    // gây ra, chứ không để dồn tới cuối rồi báo hai con số trống không.
    const t = taoTrangPos();
    const kq0 = await BoGio.boVaoGio(t.tailieu, [mon('Quần Jogger thể thao nữ', 1)], nhanh);
    assert.strictEqual(kq0.ok, true, kq0.thongBao);

    // Lần hai: bóp méo tổng ngay sau khi vẽ lại. Phải theo dõi CẢ KHỐI PHẢI, vì
    // giỏ trống thì chân giỏ chưa tồn tại — đúng như trang thật.
    const t2 = taoTrangPos();
    new t2.cuaSo.MutationObserver(() => {
        const o = t2.tailieu.getElementById('tongTt');
        if (o && o.textContent !== '111') o.textContent = '111';
    }).observe(t2.tailieu.getElementById('khoiPhai'),
               { childList: true, characterData: true, subtree: true });
    const kq = await BoGio.boVaoGio(t2.tailieu, [mon('Quần Jogger thể thao nữ', 1)], nhanh);
    assert.strictEqual(kq.ok, false, 'cho qua dù tổng không tăng đúng');
});

test('⭐ mọi phép chờ đều phải ĐƯỢC ĐỌC KẾT QUẢ, không vứt đi', () => {
    // `await nhinToiKhi(...)` mà không ai đọc giá trị trả về = hết hạn rồi im lặng
    // đi tiếp, y như chờ thành công. Đó là cách món bị mất mà không ai biết.
    const fs = require('fs');
    const path = require('path');
    const ma = fs.readFileSync(path.join(__dirname, '..', 'tendoo', 'boGio.js'), 'utf8');
    const dau = ma.indexOf('for (const mon of danhSach)');
    const than = ma.slice(dau);
    // Sau mỗi cú bấm phải có bước ĐỌC LẠI GIỎ để xác minh.
    assert.match(than, /timDongCua/, 'không đọc lại giỏ sau khi bấm');
    assert.match(than, /MA\.KHONG_VAO_GIO/, 'không có đường báo món không vào giỏ');
    assert.match(than, /MA\.GIO_LECH_TUNG_MON/, 'không kiểm tổng sau từng món');
});

ghiChu('— ⭐ Xác minh bằng TỔNG của Tendoo, không bằng tên món —');

// Chờ thật, vì hai cảnh dưới đây kiểm chuyện SỚM/MUỘN.
const choThat = { nghi: (ms) => new Promise(r => setTimeout(r, ms)),
                  doiVeLuoi: 800, nhipNhin: 10 };

test('⭐ TỔNG cập nhật TRỄ hơn dòng giỏ → máy phải CHỜ, không báo lỗi oan', async () => {
    // Trang thật vẽ dòng giỏ trước, "Tổng thanh toán" nhảy sau. Đọc tổng một
    // phát rồi kết luận = dừng oan một đơn hoàn toàn đúng.
    const t = taoTrangPos({ tongTreMs: 120 });
    let soLanBam = 0;
    t.tailieu.getElementById('bangGoiY')
        .addEventListener('click', () => { soLanBam++; }, true);

    const kq = await BoGio.boVaoGio(t.tailieu, [mon('Áo Gilet phao Thu Đông nữ', 1)], choThat);

    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.strictEqual(t.xemGio().length, 1);
    assert.strictEqual(soLanBam, 1, `chờ không nổi nên bấm lại ${soLanBam} lần`);
});

test('⭐ TỔNG trễ QUÁ HẠN → dừng đàng hoàng, KHÔNG phát hành gì', async () => {
    const t = taoTrangPos({ tongTreMs: 5000 });
    const kq = await BoGio.boVaoGio(t.tailieu, [mon('Áo Gilet phao Thu Đông nữ', 1)],
                                    { nghi: choThat.nghi, doiVeLuoi: 60, nhipNhin: 10 });
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ma, MA.KHONG_VAO_GIO);
    assert.match(kq.thongBao, /CHƯA phát hành hóa đơn nào/);
});

// Bẫy THẬT: hai mặt hàng mà tên món này NẰM TRONG tên món kia. Đây chính là
// cảnh đã xảy ra ngày 2026-08-12 — máy báo 'tổng đáng ra tăng 790.000đ nhưng
// thực tế tăng 0đ', tức nó ĐÃ tưởng món có trong giỏ (nếu không tưởng thì đã
// báo "không vào giỏ"), vì có dòng khác mang đúng chuỗi tên đó.
const HANG_TEN_LONG_NHAU = [
    { ma: 'ALCT', ten: 'Áo len cổ tim Thu Đông nữ', gia: 550000, ton: 9 },
    { ma: 'ALCTL', ten: 'Áo len cổ tim Thu Đông nữ size L', gia: 590000, ton: 9 },
];
const monTrong = (dsHang, ten, soLuong) => {
    const h = dsHang.find(x => x.ten === ten);
    return { id: 'id-' + ten, ten: h.ten, gia: h.gia, soLuong };
};

test('⭐ tên món NẰM TRONG tên món khác đã ở giỏ → KHÔNG được nhận nhầm là đã thêm', async () => {
    const t = taoTrangPos({ hang: HANG_TEN_LONG_NHAU });
    // Nuốt mọi cú bấm vào ĐÚNG món "Áo len cổ tim Thu Đông nữ" (không phải bản
    // size L). Giỏ sẽ chỉ có size L, mà dòng size L lại chứa nguyên tên kia.
    t.tailieu.getElementById('bangGoiY').addEventListener('click', (su) => {
        const d = su.target.closest && su.target.closest('.ant-select-item-option');
        if (d && d.textContent.includes('Áo len cổ tim Thu Đông nữ')
              && !d.textContent.includes('size L')) su.stopImmediatePropagation();
    }, true);

    const kq = await BoGio.boVaoGio(t.tailieu, [
        monTrong(HANG_TEN_LONG_NHAU, 'Áo len cổ tim Thu Đông nữ size L', 1),
        monTrong(HANG_TEN_LONG_NHAU, 'Áo len cổ tim Thu Đông nữ', 1),
    ], nhanh);

    assert.strictEqual(kq.ok, false, 'nhận nhầm dòng size L là món đã thêm');
    assert.strictEqual(kq.ma, MA.KHONG_VAO_GIO);
    assert.strictEqual(t.xemGio().length, 1, 'giỏ đáng ra chỉ có mỗi size L');
    assert.strictEqual(t.tongHienTai(), 590000);
});

test('⭐ thông báo lỗi phải KỂ LẠI GIỎ đang có gì (số dòng, tên, tổng)', async () => {
    // Hai lần liên tiếp phải ngồi đoán vì thông báo chỉ có hai con số trống
    // không. Có phần kể này thì lần sau nhìn phát là biết.
    const t = taoTrangPos({ hang: HANG_TEN_LONG_NHAU });
    t.tailieu.getElementById('bangGoiY').addEventListener('click', (su) => {
        const d = su.target.closest && su.target.closest('.ant-select-item-option');
        if (d && !d.textContent.includes('size L')) su.stopImmediatePropagation();
    }, true);

    const kq = await BoGio.boVaoGio(t.tailieu, [
        monTrong(HANG_TEN_LONG_NHAU, 'Áo len cổ tim Thu Đông nữ size L', 1),
        monTrong(HANG_TEN_LONG_NHAU, 'Áo len cổ tim Thu Đông nữ', 1),
    ], nhanh);

    assert.strictEqual(kq.ok, false);
    assert.match(kq.thongBao, /Giỏ đang có 1 dòng/, 'không kể số dòng');
    assert.match(kq.thongBao, /size L/, 'không kể tên món đang có trong giỏ');
    assert.match(kq.thongBao, /Tổng: 590\.000đ/, 'không kể tổng máy đang thấy');
});

test('⭐ tổng đứng im → nói thẳng "KHÔNG nhúc nhích", không nói lửng lơ', async () => {
    const t = taoTrangPos({ nuotCuBamDau: 5 });
    const kq = await BoGio.boVaoGio(t.tailieu, [mon('Áo Gilet phao Thu Đông nữ', 1)], nhanh);
    assert.strictEqual(kq.ma, MA.KHONG_VAO_GIO);
    assert.match(kq.thongBao, /KHÔNG nhúc nhích/);
    assert.match(kq.thongBao, /Giỏ đang có 0 dòng/);
});

test('⭐ mã nguồn: xác minh món phải dựa trên docTongGio, KHÔNG dựa trên tên', () => {
    // Chốt lại bằng mã nguồn, vì đây đúng là chỗ đã sai và rất dễ sai lại:
    // ai đó thấy `timDongCua` gọn hơn là quay về so tên ngay.
    const fs = require('node:fs');
    const path = require('node:path');
    const ma = fs.readFileSync(path.join(__dirname, '..', 'tendoo', 'boGio.js'), 'utf8');
    const dau = ma.indexOf('BẤM RỒI XÁC MINH');
    const cuoi = ma.indexOf('if (themDu != null)', dau);
    assert.ok(dau > 0 && cuoi > dau, 'không tìm thấy vòng bấm–xác minh');
    const doan = ma.slice(dau, cuoi);      // đúng vòng bấm rồi quyết định
    assert.match(doan, /docTongGio\(tailieu\)/, 'không xác minh bằng tổng của Tendoo');
    assert.ok(!/timDongCua/.test(doan), 'lại xác minh bằng tên món');
});

ghiChu('— ⭐ GIỎ TRỐNG THÌ TENDOO KHÔNG VẼ CHÂN GIỎ —');

// Đo trang THẬT 2026-08-12 (scratchpad/ketQuaDo/nut-truoc-khi-bo-hang.json):
// lúc giỏ chưa có gì, trang KHÔNG có chữ "Tổng thanh toán" và KHÔNG có nút
// "Thanh toán (F1)". Bỏ một món vào thì cả hai mới hiện.
// Trang giả trước đây luôn vẽ "Tổng thanh toán: 0" -> 734 test xanh trong khi
// ngoài đời máy đọc tổng trước món đầu, nhận null, rồi dừng CẢ LOẠT.

test('⭐ giỏ trống → KHÔNG có "Tổng thanh toán", KHÔNG có nút Thanh toán', () => {
    const t = taoTrangPos();
    assert.strictEqual(BoGio.gioDangTrong(t.tailieu), true);
    assert.ok(!/Tổng thanh toán/.test(t.tailieu.body.textContent),
              'trang giả lại bịa dòng tổng lúc giỏ trống');
    assert.strictEqual(t.tailieu.getElementById('nutThanhToan'), null,
                       'trang giả lại bịa nút Thanh toán lúc giỏ trống');
    assert.strictEqual(BoGio.docTongGio(t.tailieu), null);
});

test('⭐ bỏ một món vào → chân giỏ mới hiện ra', async () => {
    const t = taoTrangPos();
    const kq = await BoGio.boVaoGio(t.tailieu, [mon('Quần Jogger thể thao nữ', 1)], nhanh);
    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.ok(/Tổng thanh toán/.test(t.tailieu.body.textContent));
    assert.ok(t.tailieu.getElementById('nutThanhToan'));
    assert.strictEqual(BoGio.docTongGio(t.tailieu), 490000);
});

test('⭐ giỏ trống thì TỔNG LÀ 0 — không phải "đọc hỏng"', async () => {
    const t = taoTrangPos();
    const tong = await BoGio.docTongGioChoKip(t.tailieu, { nghi: nhanh.nghi, hanMs: 0, nhipMs: 10 });
    assert.strictEqual(tong, 0, 'lại coi giỏ trống là đọc hỏng — đúng lỗi ngày 2026-08-12');
});

test('⭐ giỏ CÓ HÀNG mà mất dòng tổng → trả null, để tầng trên dừng', async () => {
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }],
                            khongCoDongTong: true });
    const tong = await BoGio.docTongGioChoKip(t.tailieu, { nghi: nhanh.nghi, hanMs: 0, nhipMs: 10 });
    assert.strictEqual(tong, null);
});

test('⭐ chân giỏ vẽ TRỄ → chờ được, không kết luận vội', async () => {
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }],
                            khongCoDongTong: true });
    // 60ms sau mới trả dòng tổng về — y như React vẽ chậm.
    setTimeout(() => {
        const chan = t.tailieu.getElementById('chanGio');
        const d = t.tailieu.createElement('div');
        d.id = 'dongTongTt';
        d.textContent = 'Tổng thanh toán: 490.000 đ';
        chan.appendChild(d);
    }, 60);
    const tong = await BoGio.docTongGioChoKip(
        t.tailieu, { nghi: choThat.nghi, hanMs: 800, nhipMs: 10 });
    assert.strictEqual(tong, 490000, 'không chờ nổi chân giỏ vẽ trễ');
});

test('⭐ bỏ HAI món liên tiếp từ giỏ trống — cảnh đã hỏng thật ngày 2026-08-12', async () => {
    // Đúng cảnh trong ảnh: 2 khách, cả hai đều dừng ở MÓN ĐẦU TIÊN với
    // "Không đọc được Tổng thanh toán ... trước khi bỏ ...".
    const t = taoTrangPos();
    const ds = [mon('Áo Gilet phao Thu Đông nữ', 1), mon('Quần Jogger thể thao nữ', 1)];
    const kq = await BoGio.boVaoGio(t.tailieu, ds, nhanh);
    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.strictEqual(kq.tongTendoo, 890000 + 490000);
    assert.strictEqual(t.xemGio().length, 2);
});

test('⭐ trang vẽ TRỄ (vừa tải lại tab) → chờ, không báo "không tìm thấy mặt hàng"', async () => {
    // Đổi tài khoản bắt buộc tải lại tab, nên máy bước vào đây lúc React chưa vẽ
    // gì là chuyện thường. Đọc ngay một phát = báo lỗi oan.
    const t = taoTrangPos();
    const khoiTren = t.tailieu.querySelector('.thanh-tren');
    const luoi = t.tailieu.getElementById('luoiHang');
    const giuTren = khoiTren.innerHTML;
    const giuLuoi = luoi.innerHTML;
    khoiTren.innerHTML = '';
    luoi.innerHTML = '';
    setTimeout(() => { khoiTren.innerHTML = giuTren; luoi.innerHTML = giuLuoi; }, 80);

    const kq = await BoGio.boVaoGio(t.tailieu, [mon('Quần Jogger thể thao nữ', 1)], choThat);
    assert.notStrictEqual(kq.ma, MA.KHONG_TIM_THAY_HANG, 'không chờ nổi trang vẽ');
});


ghiChu('— ⭐ ĐẶT SỐ LƯỢNG: bấm nút "+", KHÔNG gõ vào ô —');

// Ngày 2026-08-13, chạy thật: máy gõ "6" vào ô số lượng, ô hiện 6 nhưng giỏ vẫn
// chỉ có 1 cái và tổng đứng im ở một đơn giá. React chưa từng nhận cú gõ.
// Trang POS giả lúc đó LẠI NHẬN gõ, nên toàn bộ test đặt số lượng đều xanh.

test('⭐ ô số lượng KHÔNG nhận gõ (đúng như trang thật) → vẫn đặt được số lượng', async () => {
    const t = taoTrangPos();                       // mặc định: ô không nhận gõ
    const kq = await BoGio.boVaoGio(t.tailieu, [mon('Giày Boots nữ cổ ngắn da mềm', 3)], nhanh);
    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.strictEqual(t.xemGio()[0].soLuong, 3);
    assert.strictEqual(kq.tongTendoo, 1400000 * 3);
});

test('⭐ bấm "+" ĐÚNG số lần cần — không thừa một cái nào', async () => {
    // Bấm thừa = hóa đơn nhiều tiền hơn doanh thu thật.
    const t = taoTrangPos();
    await BoGio.boVaoGio(t.tailieu, [mon('Giày Boots nữ cổ ngắn da mềm', 4)], nhanh);
    assert.strictEqual(t.soLanBamCong(), 3, `bấm + ${t.soLanBamCong()} lần cho 4 cái`);
});

test('⭐ mã nguồn: nhánh đặt số lượng KHÔNG được gõ vào ô nữa', () => {
    // Rất dễ quay lại: `dienChacChan` gọn hơn hẳn vòng bấm nút.
    const fs = require('node:fs');
    const path = require('node:path');
    const ma = fs.readFileSync(path.join(__dirname, '..', 'tendoo', 'boGio.js'), 'utf8');
    const dau = ma.indexOf('Đặt số lượng: BẤM NÚT');
    const cuoi = ma.indexOf('} else {', dau);
    assert.ok(dau > 0 && cuoi > dau, 'không tìm thấy nhánh đặt số lượng');
    const doan = ma.slice(dau, cuoi);
    assert.ok(!/dienChacChan/.test(doan), 'lại gõ thẳng vào ô số lượng');
    assert.match(doan, /timNutCong/, 'không bấm nút +');
    assert.match(doan, /docTongGio\(tailieu\)/, 'không kiểm bằng tổng của Tendoo');
});

test('⭐ Tendoo CHẶN giữa chừng → dừng ngay, nói ĐÚNG số thật nhận được', async () => {
    // Đây là ca đã hỏng thật. Thông báo cũ đọc số lượng từ chính ô vừa gõ nên in
    // ra câu vô nghĩa "Cần 6 cái nhưng giỏ chỉ nhận 6".
    const t = taoTrangPos({ chanTangTai: 2 });
    const kq = await BoGio.boVaoGio(t.tailieu, [mon('Giày Boots nữ cổ ngắn da mềm', 5)], nhanh);
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ma, MA.KHONG_DAT_DUOC_SO_LUONG);
    assert.match(kq.thongBao, /Cần 5 cái/);
    assert.match(kq.thongBao, /chỉ nhận 2/, 'lại nói số lượng lấy từ ô nhập');
    assert.ok(!/chỉ nhận 5/.test(kq.thongBao), 'thông báo tự mâu thuẫn: cần 5 nhận 5');
    assert.match(kq.thongBao, /CHƯA phát hành hóa đơn nào/);
});

test('⭐ thông báo phải nói TIỀN, không chỉ nói số cái', async () => {
    const t = taoTrangPos({ chanTangTai: 2 });
    const kq = await BoGio.boVaoGio(t.tailieu, [mon('Giày Boots nữ cổ ngắn da mềm', 5)], nhanh);
    assert.match(kq.thongBao, /2\.800\.000đ/, 'không nói tổng thực tế');
    assert.match(kq.thongBao, /7\.000\.000đ/, 'không nói tổng đáng ra phải có');
});

test('⭐ chặn giữa chừng thì KHÔNG bấm thêm nữa', async () => {
    const t = taoTrangPos({ chanTangTai: 2 });
    await BoGio.boVaoGio(t.tailieu, [mon('Giày Boots nữ cổ ngắn da mềm', 6)], nhanh);
    // 1 lần lên 2 (thành công), 1 lần nữa không nhúc nhích -> dừng. Tối đa 2.
    assert.ok(t.soLanBamCong() <= 2, `vẫn bấm ${t.soLanBamCong()} lần sau khi bị chặn`);
});

test('⭐ nút "+" nhận theo HÌNH VẼ, không theo lớp bịa ra', () => {
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Áo khoác dạ dáng dài nữ' }] });
    const dong = BoGio.docCacDongGio(t.tailieu)[0];
    // Trang thật KHÔNG có lớp nào như thế này — nếu còn thì trang giả lại bịa.
    assert.strictEqual(dong.khoi.querySelector('.cong'), null,
        'trang giả lại gắn lớp "cong" — trang thật không có');
    const nut = BoGio.timNutCong(dong.oSoLuong);
    assert.ok(nut, 'không nhận ra nút +');
    assert.ok(nut.querySelector('path[d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"]'),
        'nhận nhầm sang nút khác');
});

test('⭐ KHÔNG được nhầm nút "+" với nút XÓA', () => {
    const t = taoTrangPos({ gioBanDau: [{ ten: 'Áo khoác dạ dáng dài nữ' }] });
    const dong = BoGio.docCacDongGio(t.tailieu)[0];
    const nut = BoGio.timNutCong(dong.oSoLuong);
    assert.notStrictEqual(nut, BoGio.timNutXoaDong(dong.khoi), 'nhầm nút + thành nút xóa');
    nut.click();
    assert.strictEqual(t.xemGio().length, 1, 'bấm + mà dòng biến mất — đó là nút xóa');
});

test('⭐ mất nút "+" (Tendoo đổi giao diện) → báo rõ, không im lặng', async () => {
    const t = taoTrangPos();
    // Gỡ mọi nút + ngay khi giỏ vừa được vẽ lại.
    new t.cuaSo.MutationObserver(() => {
        t.tailieu.querySelectorAll('#cacDongGio button').forEach((b) => {
            if (b.querySelector('path[d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"]')) b.remove();
        });
    }).observe(t.tailieu.getElementById('cacDongGio'), { childList: true, subtree: true });

    const kq = await BoGio.boVaoGio(t.tailieu, [mon('Giày Boots nữ cổ ngắn da mềm', 2)], nhanh);
    assert.strictEqual(kq.ok, false);
    assert.match(kq.thongBao, /nút "\+"/);
    assert.match(kq.thongBao, /CHƯA phát hành hóa đơn nào/);
});

test('⭐ React vẽ lại giỏ sau mỗi cú bấm → phải TÌM LẠI nút, không giữ nút cũ', async () => {
    // Trang giả vẽ lại toàn bộ dòng giỏ sau mỗi thay đổi (đúng như React), nên
    // nút cũ đã bị gỡ khỏi trang. Giữ nút cũ là bấm vào hư không.
    const t = taoTrangPos();
    const kq = await BoGio.boVaoGio(t.tailieu, [mon('Giày Boots nữ cổ ngắn da mềm', 5)], nhanh);
    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.strictEqual(t.xemGio()[0].soLuong, 5);
});

chay('BỎ HÀNG VÀO GIỎ TRÊN TRANG POS');
