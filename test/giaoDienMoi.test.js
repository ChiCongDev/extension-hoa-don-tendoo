'use strict';

// ===========================================================================
//  TEST BA CHỐT CHẶN thêm ngày 19/08/2026, sau lượt chạy thật hỏng 4/4 khách.
//  Chạy: node test/giaoDienMoi.test.js   (cần biến HDT_JSDOM)
//
//  Bối cảnh: Tendoo thông báo "từ 18/08/2026 chuyển sang giao diện bán hàng
//  mới" (/sales/pos-v2). Extension VẪN tự nhận là sẵn sàng ở đó vì phép so
//  đường dẫn cũ chỉ xét phần đầu chuỗi — rồi chạy bằng bộ chọn của giao diện
//  cũ. Bốn khách hỏng bốn kiểu, mỗi kiểu một chốt chặn khác nhau bắt được.
//
//  Ba chốt:
//    1. ĐỨNG NHẦM GIAO DIỆN -> từ chối, nói rõ tên giao diện
//    2. CÔNG TẮC "Ghi nợ" tìm theo NHÃN, không lấy cái đầu tiên
//    3. KHÔNG THẤY HÀNG -> nói ra máy đang thấy gì
// ===========================================================================

const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { JSDOM } = require(process.env.HDT_JSDOM || 'jsdom');
const { test, ghiChu, chay } = require('./chay');
require('../chung/domReact');
const BamThanhToan = require('../tendoo/bamThanhToan');
const BoGio = require('../tendoo/boGio');
const { taoTrangPos, HANG_MAU } = require('./trangPosGiaLap');

// ════════════════════════════════════════════════════════════════════════════
//  CHỐT 1 — đứng nhầm giao diện thì từ chối
// ════════════════════════════════════════════════════════════════════════════

ghiChu('— ⭐⭐ Chốt 1: giao diện bán hàng MỚI —');

/** Dựng trang, chạy nhanLenh.js trong đó, rồi hỏi "sẵn sàng chưa". */
function hoiSanSang(duongDan) {
    const dom = new JSDOM('<!doctype html><body></body>', {
        url: 'https://seller-v3.tendoo.vn' + duongDan,
        runScripts: 'outside-only',
    });
    const cuaSo = dom.window;
    const cacTai = [];
    cuaSo.chrome = {
        runtime: { onMessage: { addListener: (f) => cacTai.push(f) }, id: 'x' },
        storage: { local: { async get() { return {}; } } },
    };
    for (const t of ['HDT_BoNoi', 'HDT_DocSanPham', 'HDT_DanhTinh', 'HDT_GhepTien',
                     'HDT_ChiaHoaDon', 'HDT_DomReact', 'HDT_BamThanhToan',
                     'HDT_DoiTaiKhoan', 'HDT_DauGio', 'HDT_CaiDat']) {
        cuaSo[t] = {};
    }
    cuaSo.HDT_BoGio = { docCacDongGio: () => [] };
    const ma = fs.readFileSync(path.join(__dirname, '..', 'tendoo', 'nhanLenh.js'), 'utf8');
    vm.runInContext(ma, dom.getInternalVMContext(), { filename: 'tendoo/nhanLenh.js' });

    return new Promise((xong) => {
        for (const f of cacTai) {
            if (f({ loai: 'hdt-hoi-san-sang' }, {}, xong)) return;
        }
        xong(null);
    });
}

test('⭐ /sales/pos (bản cũ) → SẴN SÀNG', async () => {
    const kq = await hoiSanSang('/sales/pos');
    assert.strictEqual(kq.sanSang, true, JSON.stringify(kq.thieu));
});

test('/sales/pos/ (có gạch cuối) → vẫn SẴN SÀNG', async () => {
    const kq = await hoiSanSang('/sales/pos/');
    assert.strictEqual(kq.sanSang, true, JSON.stringify(kq.thieu));
});

test('⭐⭐ /sales/pos-v2 (giao diện MỚI) → TỪ CHỐI', async () => {
    // Đây là lỗi gốc ngày 19/08: phép so cũ `/\/sales\/pos/` khớp cả pos-v2 nên
    // máy tự nhận sẵn sàng rồi chạy bằng bộ chọn của giao diện cũ.
    const kq = await hoiSanSang('/sales/pos-v2');
    assert.strictEqual(kq.sanSang, false, '❌ giao diện mới vẫn tự nhận là sẵn sàng');
});

test('⭐ từ chối bằng lý do RIÊNG, không lẫn vào "đang ở trang khác"', async () => {
    const kq = await hoiSanSang('/sales/pos-v2');
    assert.ok(kq.thieu.some((x) => /giao-dien-moi/.test(x)),
        'lý do phải nói rõ là giao diện mới: ' + JSON.stringify(kq.thieu));
    assert.ok(!kq.thieu.some((x) => /dang-o-trang-khac/.test(x)),
        'không được báo kèm lý do sai');
});

test('lý do có kèm ĐƯỜNG DẪN để còn biết đang đứng ở đâu', async () => {
    const kq = await hoiSanSang('/sales/pos-v2');
    const ly = kq.thieu.find((x) => /giao-dien-moi/.test(x));
    assert.match(ly, /pos-v2/);
});

test('mọi bản pos-vN về sau đều bị chặn, không chỉ v2', async () => {
    for (const d of ['/sales/pos-v3', '/sales/pos-v10']) {
        const kq = await hoiSanSang(d);
        assert.strictEqual(kq.sanSang, false, d + ' lọt lưới');
        assert.ok(kq.thieu.some((x) => /giao-dien-moi/.test(x)), d);
    }
});

test('⭐⭐ đường dẫn LẠ bắt đầu bằng "pos" cũng bị chặn', async () => {
    // `laTrangPosMoi()` chỉ nhận ra dạng pos-vN. Phép so CHẶT của laTrangPos
    // mới là thứ chặn mọi biến thể khác — Tendoo hoàn toàn có thể đặt tên khác
    // (/sales/pos-moi, /sales/posx). Không có phép kiểm này thì việc siết phép
    // so không được cái gì che, sửa hỏng cũng không ai biết.
    for (const d of ['/sales/pos-moi', '/sales/posx', '/sales/pos-beta']) {
        const kq = await hoiSanSang(d);
        assert.strictEqual(kq.sanSang, false, d + ' lọt lưới — tự nhận là sẵn sàng');
        assert.ok(kq.thieu.some((x) => /dang-o-trang-khac|giao-dien-moi/.test(x)), d);
    }
});

test('trang khác hẳn vẫn báo "đang ở trang khác" như cũ', async () => {
    const kq = await hoiSanSang('/callback');
    assert.strictEqual(kq.sanSang, false);
    assert.ok(kq.thieu.some((x) => /dang-o-trang-khac/.test(x)), JSON.stringify(kq.thieu));
});

test('⭐ cầu nối dịch lý do đó thành lời nhắc NGƯỜI ĐỌC HIỂU ĐƯỢC', () => {
    const ma = fs.readFileSync(path.join(__dirname, '..', 'chung', 'cauNoi.js'), 'utf8');
    assert.match(ma, /giao-dien-moi/, 'cầu nối không nhận ra lý do này');
    assert.match(ma, /GIAO DIỆN BÁN HÀNG MỚI/, 'không có lời nhắc riêng');
    // Phải chỉ đường về bản cũ, chứ không bắt người dùng bấm F5 mãi.
    assert.match(ma, /sales\/pos/, 'không chỉ đường sang bản cũ');
});

// ════════════════════════════════════════════════════════════════════════════
//  CHỐT 2 — công tắc "Ghi nợ" tìm theo nhãn
// ════════════════════════════════════════════════════════════════════════════

ghiChu('— ⭐⭐ Chốt 2: "Ghi nợ" phải tìm theo NHÃN —');

/** Dựng một bảng xác nhận giả với các hàng công tắc tuỳ ý. */
function bangVoi(cacHang) {
    const dom = new JSDOM('<!doctype html><body><div class="ant-modal" id="b"></div></body>');
    const b = dom.window.document.getElementById('b');
    b.innerHTML = cacHang.map(([nhan, bat]) => `
        <div class="flex justify-between items-center">
          <span class="text-base font-medium">${nhan}</span>
          <button type="button" role="switch" aria-checked="${bat ? 'true' : 'false'}"
                  class="ant-switch${bat ? ' ant-switch-checked' : ''}"></button>
        </div>`).join('');
    return b;
}

test('bảng như CŨ, Ghi nợ TẮT → không chặn', () => {
    assert.strictEqual(BamThanhToan.ghiNoDangBat(bangVoi([['Ghi nợ', false]])), false);
});

test('bảng như CŨ, Ghi nợ BẬT → chặn', () => {
    assert.strictEqual(BamThanhToan.ghiNoDangBat(bangVoi([['Ghi nợ', true]])), true);
});

test('⭐⭐ công tắc KHÁC đứng TRƯỚC và đang BẬT → KHÔNG được đọc nhầm', () => {
    // Đây là giả thuyết cho hai khách bị chặn oan ngày 19/08. Giao diện mới đưa
    // thêm công tắc (ví dụ "Hóa đơn điện tử", mặc định BẬT) vào bảng xác nhận;
    // bản cũ lấy công tắc ĐẦU TIÊN nên tưởng Ghi nợ đang bật.
    const b = bangVoi([['Hóa đơn điện tử', true], ['Ghi nợ', false]]);
    assert.strictEqual(BamThanhToan.ghiNoDangBat(b), false,
        '❌ đọc nhầm công tắc "Hóa đơn điện tử" thành "Ghi nợ"');
});

test('⭐ công tắc khác đứng trước, Ghi nợ THẬT SỰ bật → vẫn chặn', () => {
    const b = bangVoi([['Hóa đơn điện tử', true], ['Ghi nợ', true]]);
    assert.strictEqual(BamThanhToan.ghiNoDangBat(b), true);
});

test('nhãn viết hoa/thường/dấu khác nhau vẫn nhận ra', () => {
    for (const nhan of ['Ghi nợ', 'GHI NỢ', 'ghi nợ', 'Ghi  nợ']) {
        assert.strictEqual(BamThanhToan.ghiNoDangBat(bangVoi([[nhan, true]])), true, nhan);
    }
});

test('⭐⭐ CÓ công tắc nhưng KHÔNG có nhãn "Ghi nợ" → TỪ CHỐI, không đoán', () => {
    // Ngả về phía an toàn: thà dừng oan còn hơn phát hành nhầm thành ghi nợ —
    // sai bản chất khoản thu thì xóa hóa đơn cũng không sửa được.
    const b = bangVoi([['Hóa đơn điện tử', false], ['Giao hàng', false]]);
    assert.strictEqual(BamThanhToan.ghiNoDangBat(b), true,
        '❌ không nhận ra công tắc nào mà vẫn cho phát hành');
});

test('KHÔNG có công tắc nào → coi như không có Ghi nợ, cho chạy', () => {
    const dom = new JSDOM('<!doctype html><body><div class="ant-modal" id="b">'
        + '<span>Tổng cộng 100.000 đ</span></div></body>');
    assert.strictEqual(BamThanhToan.ghiNoDangBat(dom.window.document.getElementById('b')), false);
});

test('⭐ nói RÕ hai bệnh khác nhau: đang bật, và không nhận ra', () => {
    assert.strictEqual(BamThanhToan.kiemGhiNo(bangVoi([['Ghi nợ', true]])).lyDo, 'CT_BAT');
    const k = BamThanhToan.kiemGhiNo(bangVoi([['Hóa đơn điện tử', false]]));
    assert.strictEqual(k.lyDo, 'KHONG_NHAN_RA');
    assert.strictEqual(k.soCongTac, 1);
});

test('⭐ lời nhắc "không nhận ra" phải khác lời nhắc "đang bật"', () => {
    const ma = fs.readFileSync(path.join(__dirname, '..', 'tendoo', 'bamThanhToan.js'), 'utf8');
    assert.match(ma, /KHÔNG nhận ra cái nào là/, 'thiếu lời nhắc cho ca không nhận ra');
    assert.match(ma, /đã đổi giao diện bảng này/, 'không gợi ý đúng nguyên nhân');
});

// ════════════════════════════════════════════════════════════════════════════
//  CHỐT 3 — không thấy hàng thì nói ra đang thấy gì
// ════════════════════════════════════════════════════════════════════════════

ghiChu('— ⭐ Chốt 3: không tìm thấy hàng thì kể ra máy thấy gì —');

test('⭐⭐ màn hình KHÔNG có mặt hàng nào → nói thẳng nghi giao diện đổi', async () => {
    // Đúng ca `c?ng` ngày 19/08: kho qua API vẫn có món, nhưng đọc trên màn
    // không thấy thẻ nào. Lời nhắc cũ trơ trọi "không tìm thấy X".
    const trang = taoTrangPos({ hang: [] });
    const r = await BoGio.boVaoGio(trang.tailieu,
        [{ ma: 'x', ten: 'Giày Boots nam cổ cao da lộn', gia: 1450000, soLuong: 1 }]);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.ma, 'KHONG_TIM_THAY_HANG');
    assert.strictEqual(r.soThayTrenMan, 0);
    assert.match(r.thongBao, /KHÔNG đọc được mặt hàng nào/);
    assert.match(r.thongBao, /đổi giao diện/);
});

test('⭐ có hàng nhưng SAI GIÁ → nói ra giá đang thấy', async () => {
    const trang = taoTrangPos({ hang: HANG_MAU });
    const r = await BoGio.boVaoGio(trang.tailieu,
        [{ ma: 'x', ten: HANG_MAU[0].ten, gia: 12345, soLuong: 1 }]);
    assert.strictEqual(r.ok, false);
    assert.match(r.thongBao, /nhưng giá là/);
    assert.ok(r.thongBao.includes(HANG_MAU[0].gia.toLocaleString('vi-VN')),
        'không nói ra giá thật đang hiện: ' + r.thongBao);
});

test('⭐ có hàng nhưng KHÔNG có tên đó → nói ra thấy bao nhiêu mặt hàng', async () => {
    const trang = taoTrangPos({ hang: HANG_MAU });
    const r = await BoGio.boVaoGio(trang.tailieu,
        [{ ma: 'x', ten: 'Món không tồn tại trên đời', gia: 990000, soLuong: 1 }]);
    assert.strictEqual(r.ok, false);
    assert.match(r.thongBao, /không cái nào là "Món không tồn tại trên đời"/, r.thongBao);
    assert.ok(r.soThayTrenMan > 0);
    // ⚠️ Từ 20/08/2026 phải KỂ RA tên đang thấy. Bản cũ chỉ nói "không mặt hàng
    // nào tên X" — đọc log xong vẫn không biết máy nhìn nhầm vào đâu, và đúng
    // chỗ thiếu ấy đã làm mò cả ngày với khách "ti?n".
    assert.match(r.thongBao, /Máy đang thấy:/, r.thongBao);
});

test('mọi lời nhắc đều khẳng định CHƯA phát hành gì', async () => {
    const trang = taoTrangPos({ hang: [] });
    const r = await BoGio.boVaoGio(trang.tailieu,
        [{ ma: 'x', ten: 'X', gia: 1000, soLuong: 1 }]);
    assert.match(r.thongBao, /CHƯA phát hành hóa đơn nào/);
});

chay('BA CHỐT CHẶN SAU LƯỢT CHẠY HỎNG 19/08/2026');
