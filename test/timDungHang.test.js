'use strict';

// TÌM ĐÚNG MẶT HÀNG — và đừng đổ oan cho mặt hàng đang nằm ngay trước mặt.
// Chạy: node test/timDungHang.test.js   (cần biến HDT_JSDOM)
//
// ── CA HỎNG THẬT: 20/08/2026, khách "ti?n", tờ thứ 5/6 ─────────────────────
//
//   ✗ Đã phát hành 4/6 hóa đơn (5.400.000) rồi dừng: Không tìm thấy "Giày vải
//     thấp cổ unisex" giá 1.000.000đ trên màn hình Tendoo. Máy thấy 1 mặt hàng
//     nhưng không mặt hàng nào tên "Giày vải thấp cổ unisex". Đã dừng, CHƯA
//     phát hành hóa đơn nào.
//
// Chủ dự án chụp màn hình Tendoo: mặt hàng ấy NẰM NGAY ĐÓ. Mã SP0089, đơn vị
// "chiếc", giá đúng 1.000.000, tồn 12 — không có gì bất thường. Phép cắt tên
// chạy trên chính dòng ấy cũng ra đúng tên.
//
// Nên máy KHÔNG hề nhìn vào dòng ấy. Lưới có hai chục thẻ mà nó chỉ "thấy 1
// mặt hàng" -> nó đang đọc BẢNG GỢI Ý CÒN SÓT của lần tìm TRƯỚC.
//
// ── LỖI THẬT: VỨT BỎ HAI TÍN HIỆU DO CHÍNH MÌNH TẠO RA ─────────────────────
//   · dienChacChan() trả true/false — sinh ra CHÍNH VÌ React hay nuốt chữ gõ
//     vào. Chỗ khác trong dự án CÓ kiểm (ô "Khách đã đưa"). Ô tìm kiếm thì bỏ.
//   · nhinToiKhi() trả về "tên cần đã hiện ra chưa" — cũng bỏ.
// Vứt cả hai thì máy đọc thứ còn sót trên màn hình rồi kết luận về mặt hàng,
// trong khi thứ nó cầm còn chưa phải kết quả của câu nó vừa hỏi.
//
// ── LỖI THỨ HAI, NGUY HIỂM HƠN ─────────────────────────────────────────────
// Dòng lỗi trên TỰ NÓI NGƯỢC NHAU: "đã phát hành 4/6" rồi lại "CHƯA phát hành
// hóa đơn nào". Ai đọc tới cuối rồi tin câu sau sẽ cho chạy lại — 4 tờ ĐÃ LÊN
// CƠ QUAN THUẾ bị xuất trùng. Câu ấy còn đi thẳng vào Telegram.

const assert = require('node:assert');
const { test, ghiChu, chay } = require('./chay');
require('../chung/domReact');
const BoGio = require('../tendoo/boGio');
const { taoTrangPos, HANG_MAU } = require('./trangPosGiaLap');

const { MA } = BoGio;
const nhanh = { nghi: async () => {}, doiVeLuoi: 30, nhipNhin: 10 };

/** Mã hàng trên BẢNG GỢI Ý của bản giả: SP0020 + thứ tự. */
const maGoiY = (ten) => 'SP00' + (20 + HANG_MAU.findIndex(h => h.ten === ten));

const mon = (ten, soLuong = 1, them = {}) => {
    const h = HANG_MAU.find(x => x.ten === ten);
    return { id: 'id-' + ten, ma: maGoiY(ten), ten: h.ten, gia: h.gia, soLuong, ...them };
};

const bo = (tuyChonTrang, danhSach, tuyChonBo = {}) => {
    const t = taoTrangPos(tuyChonTrang);
    return BoGio.boVaoGio(t.tailieu, danhSach, { ...nhanh, ...tuyChonBo })
        .then(kq => ({ t, kq }));
};

ghiChu('— ⭐⭐ CA "ti?n": KHÔNG được đổ oan cho mặt hàng —');

test('⭐⭐ danh sách CÒN SÓT một dòng của lần tìm trước → phải kể ra nó thấy gì', async () => {
    // Đúng cảnh 20/08: bảng gợi ý còn nguyên MỘT dòng của mặt hàng khác, không
    // đổi theo chữ vừa gõ. Bản cũ báo "Máy thấy 1 mặt hàng nhưng không mặt hàng
    // nào tên X" — đọc xong không ai biết nó nhìn nhầm vào đâu.
    const { kq } = await bo({ goiYSot: 'Quần Jogger thể thao nữ' },
                            [mon('Áo khoác dạ dáng dài nữ')]);
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ma, MA.KHONG_TIM_THAY_HANG);
    assert.match(kq.thongBao, /Máy thấy 1 mặt hàng/, kq.thongBao);
    assert.match(kq.thongBao, /Máy đang thấy: "Quần Jogger thể thao nữ"/,
        '⛔ KHÔNG kể ra dòng còn sót — đúng chỗ thiếu đã làm mò cả ngày: ' + kq.thongBao);
});

test('⭐⭐ ô bị XÓA TRẮNG trong lúc chờ → danh sách không phải của mình, DỪNG', async () => {
    // React dọn ô tìm kiếm trong khi danh sách vẫn còn trên màn hình. Danh sách
    // ấy có thể khớp tên — nhưng nó không còn là kết quả của chữ vừa gõ, nên
    // mọi kết luận rút ra từ nó đều vô giá trị.
    //
    // `nghi` phải là giấc ngủ THẬT: hàm rỗng thì hẹn giờ của bản giả không bao
    // giờ chạy tới, và cảnh này không dựng được.
    //
    // ⚠️ Ô phải bị xóa SAU khi dienChacChan() đọc lại xong (nó chờ 200ms mỗi
    // lượt). Xóa sớm hơn thì chính dienChacChan bắt được và ra "gõ không ăn" —
    // một cảnh khác hẳn, và bài test này sẽ chứng minh nhầm thứ.
    const { kq } = await bo(
        { oTimXoaSauMs: 260, goiYTreMs: 500 },
        [mon('Áo khoác dạ dáng dài nữ')],
        { nghi: (ms) => new Promise(r => setTimeout(r, ms)), doiVeLuoi: 1500, nhipNhin: 20 });
    assert.strictEqual(kq.ma, MA.GOI_Y_KHONG_KHOP_CHU_GO, 'thông báo: ' + kq.thongBao);
    assert.match(kq.thongBao, /không phải kết quả của thứ máy vừa gõ/, kq.thongBao);
    assert.match(kq.thongBao, /CHƯA phát hành hóa đơn nào/, kq.thongBao);
});

test('⭐⭐ ô tìm kiếm NUỐT CHỮ → nói rõ "gõ không ăn"', async () => {
    const { kq } = await bo({ oTimNuotChu: true }, [mon('Áo khoác dạ dáng dài nữ')]);
    assert.strictEqual(kq.ma, MA.GO_KHONG_VAO_O_TIM, 'thông báo: ' + kq.thongBao);
    assert.match(kq.thongBao, /KHÔNG ĂN/, kq.thongBao);
    assert.match(kq.thongBao, /danh sách còn sót/, kq.thongBao);
});

test('⛔ mọi cảnh hỏng ở khâu tìm đều KHÔNG được bỏ gì vào giỏ', async () => {
    for (const tt of [{ goiYSot: 'Quần Jogger thể thao nữ' }, { oTimNuotChu: true }]) {
        const { t, kq } = await bo(tt, [mon('Áo khoác dạ dáng dài nữ')]);
        assert.strictEqual(kq.ok, false, JSON.stringify(tt));
        assert.strictEqual(t.xemGio().length, 0, 'đã bỏ hàng vào giỏ dù chưa tìm được: '
            + JSON.stringify(tt));
        assert.strictEqual(t.daBam.thanhToan, 0, 'ĐÃ BẤM THANH TOÁN: ' + JSON.stringify(tt));
    }
});

ghiChu('— ⭐ GÕ LẠI ĐÚNG MỘT LẦN —');

test('⭐ gõ hụt lần đầu rồi được lần hai thì vẫn chạy tiếp bình thường', async () => {
    // Gõ vào ô tìm kiếm KHÔNG bấm gì, KHÔNG bỏ gì vào giỏ, KHÔNG phát hành gì.
    // Nên thử lại ở đây an toàn tuyệt đối — khác hẳn mọi chỗ thử lại khác.
    const t = taoTrangPos();
    const o = t.tailieu.getElementById('oTimSanPham');
    let lan = 0;
    const goc = Object.getOwnPropertyDescriptor(t.cuaSo.HTMLInputElement.prototype, 'value');
    Object.defineProperty(o, 'value', {
        configurable: true,
        get() { return goc.get.call(this); },
        set(v) { if (v && lan++ === 0) return; goc.set.call(this, v); },
    });
    const kq = await BoGio.boVaoGio(t.tailieu, [mon('Áo khoác dạ dáng dài nữ')], nhanh);
    assert.strictEqual(kq.ma, MA.OK, 'thông báo: ' + kq.thongBao);
    assert.strictEqual(t.xemGio().length, 1);
});

test('⭐⭐ tìm hụt lần đầu → PHẢI GÕ LẠI, không đọc bừa màn hình', async () => {
    // ⚠️ Bài ngay trên KHÔNG chứng minh được vòng gõ lại: dienChacChan() vốn đã
    // tự thử ba lượt bên trong, nên nó phục hồi ngay trong MỘT vòng ngoài. Gài
    // lỗi bỏ vòng ngoài đi thì bài ấy vẫn xanh. Đây là bài đếm thẳng số lần gõ.
    const { t, kq } = await bo({ boQuaNLanTim: 1 }, [mon('Áo khoác dạ dáng dài nữ')]);
    const coChu = t.xemTim().filter(Boolean);
    assert.ok(coChu.length >= 2,
        'chỉ gõ ' + coChu.length + ' lượt — không hề gõ lại: ' + JSON.stringify(coChu));
    assert.ok(coChu.every(c => c === 'Áo khoác dạ dáng dài nữ'),
        'gõ nhầm chữ khác: ' + JSON.stringify(coChu));
    assert.strictEqual(kq.ma, MA.OK, 'thông báo: ' + kq.thongBao);
});

test('⛔ tìm được ngay thì KHÔNG gõ lại thừa', async () => {
    const { t } = await bo({}, [mon('Áo khoác dạ dáng dài nữ')]);
    assert.strictEqual(t.xemTim().filter(Boolean).length, 1,
        'gõ thừa: ' + JSON.stringify(t.xemTim()));
});

ghiChu('— ⭐⭐ KHỚP BẰNG MÃ HÀNG —');

test('⭐⭐ ĐƠN VỊ LẠ làm phép cắt tên trượt — mã hàng cứu được', async () => {
    // Đây là cả một lớp lỗi bị xoá sổ. Phép cắt tên gỡ đuôi đơn vị theo một
    // danh sách SÁU TỪ cứng (chiếc, cái, bộ, hộp, đôi, kg, gói). Tendoo dùng
    // đơn vị khác — "Cặp", "Thùng", "Set" — là tên cắt ra thừa chữ, so tên
    // trượt, và máy báo "không có mặt hàng nào tên đó" trong khi nó nằm ngay đó.
    //
    // Mã hàng lấy thẳng từ API Tendoo, không phải đoán, nên không dính.
    const { t, kq } = await bo({ donViLa: 'Cặp' }, [mon('Áo khoác dạ dáng dài nữ')]);
    assert.strictEqual(kq.ma, MA.OK, 'thông báo: ' + kq.thongBao);
    assert.strictEqual(t.xemGio().length, 1);
    assert.strictEqual(t.xemGio()[0].ten, 'Áo khoác dạ dáng dài nữ');
});

test('⛔ đơn vị lạ mà KHÔNG có mã thì vẫn phải DỪNG, không đoán bừa', async () => {
    const h = HANG_MAU[0];
    const { kq } = await bo({ donViLa: 'Cặp' },
                            [{ id: 'x', ten: h.ten, gia: h.gia, soLuong: 1 }]);
    assert.strictEqual(kq.ok, false, 'không có mã mà vẫn nhận bừa');
    assert.strictEqual(kq.ma, MA.KHONG_TIM_THAY_HANG);
});

test('⛔⛔ khớp mã RỒI VẪN PHẢI khớp giá — không nới chốt nào', async () => {
    const { kq } = await bo({}, [{ ...mon('Áo khoác dạ dáng dài nữ'), gia: 111000 }]);
    assert.strictEqual(kq.ok, false, 'KHỚP MÃ XONG BỎ QUA GIÁ — sẽ ra hóa đơn sai số tiền');
    assert.strictEqual(kq.ma, MA.KHONG_TIM_THAY_HANG);
});

test('⛔⛔ mã ĐÚNG nhưng TỒN KHÔNG ĐỦ thì vẫn dừng', async () => {
    // 'Quần Jogger thể thao nữ' chỉ còn 1.
    const { kq } = await bo({}, [mon('Quần Jogger thể thao nữ', 3)]);
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ma, MA.KHONG_DAT_DUOC_SO_LUONG, 'thông báo: ' + kq.thongBao);
});

test('⛔⛔ mã CHẶN HAI ĐẦU — "SP002" không được khớp vào "SP0020"', () => {
    assert.strictEqual(BoGio.coMaTrongChu('Áo abc SP0020 990.000', 'SP0020'), true);
    assert.strictEqual(BoGio.coMaTrongChu('Áo abc SP0020 990.000', 'SP002'), false,
        'mã ngắn khớp nhầm vào mã dài → bỏ vào giỏ SAI mặt hàng');
    assert.strictEqual(BoGio.coMaTrongChu('Áo abc SP0020 990.000', 'P0020'), false);
    assert.strictEqual(BoGio.coMaTrongChu('SP0020', 'SP0020'), true);
    assert.strictEqual(BoGio.coMaTrongChu('mã SP0020, giá', 'SP0020'), true);
});

test('⛔⛔ ô mã phải BẰNG NHAU TUYỆT ĐỐI, không phải chứa-là-được', () => {
    // Đọc mã từ đúng ô của nó mà lại so kiểu "chứa" thì "SP002" khớp vào ô ghi
    // "SP0020" — bỏ SAI mặt hàng vào giỏ, ra hóa đơn sai. Chặt hơn cả cách dò
    // trên khối chữ, nên không được nới.
    const { JSDOM } = require(process.env.HDT_JSDOM || 'jsdom');
    const d = new JSDOM('<!doctype html><body><div id="r">'
        + '<span>Áo abc</span><span>SP0020</span><span>990.000</span>'
        + '</div></body>').window.document;
    const r = d.getElementById('r');
    assert.strictEqual(BoGio.coOMaRieng(r, 'SP0020'), true);
    assert.strictEqual(BoGio.coOMaRieng(r, 'SP002'), false, 'mã ngắn khớp vào ô mã dài');
    assert.strictEqual(BoGio.coOMaRieng(r, 'P0020'), false);
    assert.strictEqual(BoGio.coOMaRieng(r, '990.000'), true, 'ô nào bằng đúng thì nhận');
    assert.strictEqual(BoGio.coOMaRieng(r, 'Áo'), false, 'khớp một phần tên');
});

test('coOMaRieng: khối rác thì trả false, không ném', () => {
    for (const x of [null, undefined, {}, 'chuỗi']) {
        assert.strictEqual(BoGio.coOMaRieng(x, 'SP0020'), false, 'với khối=' + String(x));
    }
});

test('mã rỗng / rác thì trả false, không ném', () => {
    for (const x of [null, undefined, '', '   ', 0]) {
        assert.strictEqual(BoGio.coMaTrongChu('SP0020', x), false, 'với mã=' + JSON.stringify(x));
    }
    assert.strictEqual(BoGio.coMaTrongChu(null, 'SP0020'), false);
    assert.strictEqual(BoGio.coMaTrongChu('', 'SP0020'), false);
});

test('⭐ KHÔNG có mã thì lùi về so tên như cũ', async () => {
    // Hàng cũ hoặc API thiếu product_code vẫn phải chạy được.
    const t = taoTrangPos();
    const h = HANG_MAU[0];
    const kq = await BoGio.boVaoGio(t.tailieu, [
        { id: 'x', ten: h.ten, gia: h.gia, soLuong: 1 },      // không có `ma`
    ], nhanh);
    assert.strictEqual(kq.ma, MA.OK, 'thông báo: ' + kq.thongBao);
    assert.strictEqual(t.xemGio().length, 1);
});

ghiChu('— ⭐ THÔNG BÁO PHẢI KỂ RA TÊN ĐANG THẤY —');

test('⭐⭐ không tìm ra thì phải nói máy ĐANG THẤY TÊN GÌ', async () => {
    // Thiếu dòng này là lần sau lại mò từ đầu. Đây là lần thứ ba vá đúng loại
    // lỗ hổng ấy (trước là tên nút trên bảng lạ, rồi màn hình lúc treo).
    const t = taoTrangPos();
    const kq = await BoGio.boVaoGio(t.tailieu, [
        { id: 'x', ma: 'SP9999', ten: 'Mặt hàng không hề tồn tại', gia: 123000, soLuong: 1 },
    ], nhanh);
    assert.strictEqual(kq.ma, MA.KHONG_TIM_THAY_HANG);
    assert.match(kq.thongBao, /Máy đang thấy:/, 'không kể tên: ' + kq.thongBao);
    assert.match(kq.thongBao, /Áo khoác dạ dáng dài nữ|Quần Jogger/, kq.thongBao);
    assert.match(kq.thongBao, /mã SP9999/, 'không nói mã cần tìm: ' + kq.thongBao);
});

ghiChu('— ⛔⛔ CÂU TỰ MÂU THUẪN: "đã ra 4/6" mà lại "CHƯA phát hành nào" —');

const fs = require('node:fs');
const path = require('node:path');
const maNhanLenh = fs.readFileSync(
    path.join(__dirname, '..', 'tendoo', 'nhanLenh.js'), 'utf8');

/** Lấy đúng hàm cắt câu ra khỏi nhanLenh.js để chạy thật. */
function layBoCau() {
    const b = maNhanLenh.indexOf('const CAU_CHUA_RA_TO');
    assert.ok(b > 0, 'không tìm thấy CAU_CHUA_RA_TO trong nhanLenh.js');
    const e = maNhanLenh.indexOf('\n', maNhanLenh.indexOf('boCauChuaRaTo =', b));
    // eslint-disable-next-line no-new-func
    return new Function(maNhanLenh.slice(b, e) + '\nreturn boCauChuaRaTo;')();
}

test('⛔⛔ đã có tờ ra thì PHẢI cắt câu "CHƯA phát hành hóa đơn nào"', () => {
    // Ai đọc tới cuối rồi tin câu ấy sẽ cho chạy lại — 4 tờ ĐÃ LÊN CƠ QUAN
    // THUẾ bị xuất trùng, không rút lại được. Câu này còn đi vào lịch sử, vào
    // trang kế toán bên Sell, và vào tin nhắn Telegram.
    const bo = layBoCau();
    const goc = 'Không tìm thấy "Giày vải thấp cổ unisex" giá 1.000.000đ trên màn hình '
        + 'Tendoo. Máy thấy 1 mặt hàng. Đã dừng, CHƯA phát hành hóa đơn nào.';
    const ra = bo(goc);
    assert.ok(!/CHƯA phát hành hóa đơn nào/.test(ra), 'vẫn còn câu mâu thuẫn: ' + ra);
    assert.ok(!/Đã dừng,\s*$/.test(ra), 'còn sót "Đã dừng," cụt lủn: ' + ra);
});

test('⭐ chỉ cắt ĐÚNG câu ấy, giữ nguyên phần nói VÌ SAO DỪNG', () => {
    const bo = layBoCau();
    const ra = bo('Không tìm thấy "X" giá 1.000.000đ. Máy đang thấy: "Y". '
        + 'Đã dừng, CHƯA phát hành hóa đơn nào.');
    assert.match(ra, /Không tìm thấy "X"/, ra);
    assert.match(ra, /Máy đang thấy: "Y"/, 'đã cắt mất phần chẩn đoán: ' + ra);
});

test('cắt được cả khi câu đứng một mình hoặc viết hoa khác', () => {
    const bo = layBoCau();
    assert.strictEqual(bo('CHƯA phát hành hóa đơn nào.'), '');
    assert.strictEqual(bo('Lý do abc. CHƯA phát hành hóa đơn nào'), 'Lý do abc.');
    assert.strictEqual(bo('Lý do abc. Đã dừng, CHƯA phát hành hóa đơn nào.'), 'Lý do abc.');
});

test('không có câu ấy thì giữ nguyên, và rác thì không ném', () => {
    const bo = layBoCau();
    assert.strictEqual(bo('Giỏ hàng đang trống.'), 'Giỏ hàng đang trống.');
    assert.strictEqual(bo(''), '');
    assert.strictEqual(bo(null), '');
    assert.strictEqual(bo(undefined), '');
});

test('⛔ CHỈ cắt ở nhánh ĐÃ CÓ TỜ RA, không cắt ở nhánh chưa ra tờ nào', () => {
    // Chưa tờ nào ra thì câu "CHƯA phát hành hóa đơn nào" là ĐÚNG và phải giữ —
    // đó là câu trấn an người dùng rằng không có gì để đi kiểm.
    const b = maNhanLenh.indexOf('if (daXuat > 0) {');
    assert.ok(b > 0);
    const trong = maNhanLenh.slice(b, maNhanLenh.indexOf('}', maNhanLenh.indexOf('};', b)));
    assert.match(trong, /boCauChuaRaTo\(to\.thongBao\)/, 'nhánh đã-có-tờ-ra chưa cắt câu');

    const sau = maNhanLenh.slice(maNhanLenh.indexOf('chuaLamGi` CHỈ đúng khi', b));
    assert.ok(!/boCauChuaRaTo/.test(sau.slice(0, 600)),
        'nhánh CHƯA ra tờ nào cũng bị cắt — mất câu trấn an đúng');
});

chay('TÌM ĐÚNG MẶT HÀNG');
