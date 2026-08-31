'use strict';

// ============================================================================
//  LỆNH CÒN KẸT TỪ LƯỢT TRƯỚC — lỗi thật, chủ dự án phát hiện 31/08/2026.
//
//  ── CHUYỆN ĐÃ XẢY RA ─────────────────────────────────────────────────────
//  Mốc 15:35 chỉ có khách ki?n. Nhưng Telegram báo HAI hóa đơn, cách nhau 10
//  giây: c?ng 5.000.000đ (15:35:17) rồi ki?n (15:35:27). Hóa đơn của c?ng RA
//  THẬT, vào giờ chủ dự án không hề hẹn.
//
//  ── VÌ SAO ───────────────────────────────────────────────────────────────
//  `cauNoi` XẾP HÀNG TRƯỚC rồi mới để `chayLoat` đi giành khóa:
//      await hangDoi.xepHang(danhSach);      // ghi lệnh vào sổ, trạng thái CHỜ
//      await hangDoi.chayLoat(...)           // -> giuKhoa() -> khóa bận -> return
//  Khóa bận thì lượt ấy trả về ngay, nhưng lệnh ĐÃ nằm trong sổ và không ai dọn:
//  `quetKhiKhoiDong` chỉ đụng lệnh ĐANG XỬ LÝ, `boCacLenhCho` chỉ chạy khi cả
//  loạt hỏng giữa chừng. Rồi `chayLoat` của lượt sau rút SẠCH mọi lệnh CHỜ:
//      while ((lenh = so.layLenhCho()[0])) { ... }
//  nên nó gánh luôn lệnh của lượt trước.
//
//  Kẹt qua đêm còn tệ hơn: hóa đơn ra vào NGÀY HÔM SAU, tính vào sổ ngày ấy.
//
//  ── SỬA CẢ HAI ĐẦU (chủ dự án chốt) ──────────────────────────────────────
//  1. `xepHang` GIÀNH KHÓA TRƯỚC khi ghi lệnh -> lượt bị bỏ qua không để lại gì.
//  2. `chayLoat` DỌN lệnh CHỜ không thuộc lượt này -> lo nốt lệnh đã kẹt sẵn,
//     và ca Chrome giết tiến trình nền giữa `xepHang` và vòng chạy.
//  3. Bỏ lệnh cũ thì BÁO TELEGRAM — kẹt lệnh nghĩa là một lượt đã BỊ LỠ.
// ============================================================================

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { test, ghiChu, chay } = require('./chay');
const SoGhiDau = require('../chung/soGhiDau');
const HangDoi = require('../chung/hangDoi');
const Tg = require('../chung/baoTelegram');

const GOC = path.join(__dirname, '..');
const doc = (f) => fs.readFileSync(path.join(GOC, f), 'utf8');

// ⚠️ chrome.storage TUẦN TỰ HÓA khi ghi và dựng lại đối tượng mới khi đọc.
// Kho giả mà giữ nguyên tham chiếu thì sửa trong bộ nhớ cũng "thấy" được sau khi
// nạp lại — mọi khẳng định về việc GHI XUỐNG ĐĨA thành ra vô nghĩa. Phải sao chép.
const khoTam = () => {
    let o = null;
    return {
        doc: async () => (o == null ? null : JSON.parse(o)),
        ghi: async (x) => { o = x == null ? null : JSON.stringify(x); },
    };
};

/** Một bộ sổ + hàng đợi dùng chung một kho, đúng như trong tiến trình nền. */
function dungBo(khoSo, khoKhoa, mayId) {
    const so = SoGhiDau.taoSo(khoSo);
    return { so, hd: HangDoi.taoHangDoi({ so, khoaLuuTru: khoKhoa, mayId,
                                          tuyChon: { nghiKhoang: [0, 0] } }) };
}

const chayXong = async (hd, xep) => hd.chayLoat(
    async (l) => ({ ok: true, ketQua: { tong: l.soTien } }), () => {},
    xep && xep.daXep);

ghiChu('── DỰNG LẠI ĐÚNG TÌNH HUỐNG 31/08/2026 ──');

test('⭐⭐⭐ khóa bận -> KHÔNG ghi lệnh nào vào sổ', async () => {
    const khoSo = khoTam();
    const khoKhoa = khoTam();
    // Một lượt khác đang giữ khóa.
    await khoKhoa.ghi({ mayId: 'ai-do', hetHanLuc: Date.now() + 600000, giuLuc: Date.now() });

    const A = dungBo(khoSo, khoKhoa, 'may-A');
    await A.so.nap();
    const xep = await A.hd.xepHang([{ maKH: 'c?ng', tenKH: 'c?ng',
                                      soTien: 5000000, soTienDat: 5000000 }]);
    assert.strictEqual(xep.ok, false, 'vẫn xếp hàng dù khóa đang bận');
    assert.strictEqual(xep.ly_do, 'DANG_CHAY_CHO_KHAC');
    assert.deepStrictEqual(A.so.danhSach().filter(l => l.trangThai === 'cho'), [],
        'để lại lệnh CHỜ trong sổ -> lượt sau gánh, hóa đơn ra vào giờ không ai hẹn');
});

test('⭐⭐⭐ lượt sau CHỈ chạy khách của mốc mình', async () => {
    const khoSo = khoTam();
    const khoKhoa = khoTam();
    await khoKhoa.ghi({ mayId: 'ai-do', hetHanLuc: Date.now() + 600000, giuLuc: Date.now() });

    const A = dungBo(khoSo, khoKhoa, 'may-A');
    await A.so.nap();
    await A.hd.xepHang([{ maKH: 'c?ng', tenKH: 'c?ng', soTien: 5000000, soTienDat: 5000000 }]);

    await khoKhoa.ghi(null);                       // khóa đã nhả
    const B = dungBo(khoSo, khoKhoa, 'may-B');
    await B.so.nap();
    const xep = await B.hd.xepHang([{ maKH: 'ki?n', tenKH: 'ki?n', soTien: 6850000 }]);
    const kq = await chayXong(B.hd, xep);
    assert.deepStrictEqual(kq.xong.map(l => l.maKH), ['ki?n'],
        'mốc chỉ có ki?n mà lại xuất cả hóa đơn của c?ng');
});

ghiChu('── LỆNH ĐÃ KẸT SẴN TRONG SỔ (bản cũ, hoặc Chrome giết tiến trình) ──');

test('⭐⭐⭐ dọn lệnh kẹt, KHÔNG xuất hóa đơn cho chúng', async () => {
    const khoSo = khoTam();
    const khoKhoa = khoTam();
    const so = SoGhiDau.taoSo(khoSo);
    await so.nap();
    await so.taoLenh({ maKH: 'c?ng', tenKH: 'c?ng', soTien: 5000000, soTienDat: 5000000 });

    const hd = HangDoi.taoHangDoi({ so, khoaLuuTru: khoKhoa, mayId: 'may-B',
                                    tuyChon: { nghiKhoang: [0, 0] } });
    const xep = await hd.xepHang([{ maKH: 'ki?n', tenKH: 'ki?n', soTien: 6850000 }]);
    const kq = await chayXong(hd, xep);

    assert.deepStrictEqual(kq.xong.map(l => l.maKH), ['ki?n'],
        'lệnh kẹt vẫn được xuất hóa đơn');
    assert.deepStrictEqual(kq.boLenhCu.map(l => l.maKH), ['c?ng'],
        'không kể ra lệnh nào bị bỏ -> không báo được cho chủ dự án');
    assert.strictEqual(
        so.danhSach().filter(l => l.trangThai === 'cho').length, 0,
        'còn sót lệnh CHỜ -> lượt kế tiếp lại gánh');
});

test('⭐⭐ lệnh của CHÍNH lượt này KHÔNG bị dọn nhầm', async () => {
    // Dọn nhầm là khách của mốc này mất hóa đơn — hỏng theo hướng ngược lại.
    const khoSo = khoTam();
    const khoKhoa = khoTam();
    const B = dungBo(khoSo, khoKhoa, 'may-B');
    await B.so.nap();
    const xep = await B.hd.xepHang([
        { maKH: 'ki?n', tenKH: 'ki?n', soTien: 6850000 },
        { maKH: 'hoa', tenKH: 'hoa', soTien: 4000000 },
    ]);
    const kq = await chayXong(B.hd, xep);
    assert.deepStrictEqual(kq.xong.map(l => l.maKH).sort(), ['hoa', 'ki?n']);
    assert.deepStrictEqual(kq.boLenhCu, [], 'dọn nhầm lệnh của chính lượt này');
});

test('⭐⭐ hai lượt xếp CÙNG một khách: chỉ bỏ lệnh CŨ, giữ lệnh mới', async () => {
    // Phân biệt bằng id lệnh, không bằng mã khách — cùng một khách có thể có
    // lệnh cũ kẹt và lệnh mới hợp lệ.
    const khoSo = khoTam();
    const khoKhoa = khoTam();
    const so = SoGhiDau.taoSo(khoSo);
    await so.nap();
    const cu = await so.taoLenh({ maKH: 'c?ng', tenKH: 'c?ng', soTien: 5000000 });

    const hd = HangDoi.taoHangDoi({ so, khoaLuuTru: khoKhoa, mayId: 'may-B',
                                    tuyChon: { nghiKhoang: [0, 0] } });
    const xep = await hd.xepHang([{ maKH: 'c?ng', tenKH: 'c?ng', soTien: 9066544 }]);
    const kq = await chayXong(hd, xep);
    assert.deepStrictEqual(kq.xong.map(l => l.soTien), [9066544],
        'chạy nhầm lệnh cũ thay vì lệnh mới');
    assert.deepStrictEqual(kq.boLenhCu.map(l => l.id), [cu.id]);
});

test('⭐⭐ không truyền danh sách lượt này thì KHÔNG dọn gì (giữ nếp cũ)', async () => {
    // ⚠️ Thà bỏ sót còn hơn bỏ nhầm. `moiXep` rỗng nghĩa là "người gọi không nói
    // lượt này xếp lệnh nào" — dọn lúc ấy là bỏ SẠCH mọi lệnh CHỜ, kể cả lệnh
    // hợp lệ vừa xếp bằng đường khác. Bài này phải KIỂM CẢ HAI VẾ: không kể ra,
    // và cũng KHÔNG ĐỘNG vào sổ. Bản đầu chỉ kiểm vế đầu nên gài lỗi lọt lưới.
    const khoSo = khoTam();
    const khoKhoa = khoTam();
    const so = SoGhiDau.taoSo(khoSo);
    await so.nap();
    await so.taoLenh({ maKH: 'c?ng', tenKH: 'c?ng', soTien: 5000000 });
    const hd = HangDoi.taoHangDoi({ so, khoaLuuTru: khoKhoa, mayId: 'may-B',
                                    tuyChon: { nghiKhoang: [0, 0] } });
    const kq = await hd.chayLoat(async (l) => ({ ok: true, ketQua: { tong: l.soTien } }));
    assert.deepStrictEqual(kq.boLenhCu, []);
    // Không dọn thì lệnh ấy phải được CHẠY như nếp cũ, chứ không bị bỏ im lặng.
    assert.deepStrictEqual(kq.xong.map(l => l.maKH), ['c?ng'],
        'dọn sạch cả lệnh hợp lệ khi người gọi không nói lượt này xếp gì');
    assert.strictEqual(so.danhSach().filter(l => l.trangThai === 'bo').length, 0,
        'đánh dấu BỎ cho lệnh mà không ai bảo bỏ');
});

test('⭐⭐ dọn xong phải GHI XUỐNG ĐĨA, kẻo khởi động lại lệnh kẹt sống lại', async () => {
    // ⚠️ Sổ ghi dấu nằm trong chrome.storage chính là để sống sót qua việc
    // Chrome giết tiến trình nền. Dọn trong bộ nhớ mà không lưu thì lần nạp sau
    // lệnh kẹt vẫn còn nguyên — và lại chạy ké lượt kế tiếp.
    const khoSo = khoTam();
    const khoKhoa = khoTam();
    const so = SoGhiDau.taoSo(khoSo);
    await so.nap();
    await so.taoLenh({ maKH: 'c?ng', tenKH: 'c?ng', soTien: 5000000 });
    const hd = HangDoi.taoHangDoi({ so, khoaLuuTru: khoKhoa, mayId: 'may-B',
                                    tuyChon: { nghiKhoang: [0, 0] } });
    // ⚠️ Lượt này CỐ Ý không có lệnh nào của mình. Nếu lượt có lệnh, chính lệnh ấy
    // sẽ `luu()` sau đó và ghi ké luôn dấu BỎ — che mất việc dọn không tự ghi.
    // Mốc rỗng là có thật: mọi khách của mốc đều đã hết hạn hoặc bị lọc ra.
    const xep = await hd.xepHang([]);
    await chayXong(hd, xep);

    // Nạp LẠI từ chính cái kho ấy — đúng như tiến trình nền khởi động lại.
    const so2 = SoGhiDau.taoSo(khoSo);
    await so2.nap();
    assert.strictEqual(so2.danhSach().filter(l => l.trangThai === 'cho').length, 0,
        'lệnh kẹt sống lại sau khi nạp lại -> lượt sau vẫn gánh');
});

ghiChu('── BÁO TELEGRAM ──');

test('⭐⭐ tin báo nói rõ KHÔNG xuất hóa đơn, và chỉ đường sửa', async () => {
    const chu = Tg.soanTinBoLenhCu(
        [{ maKH: 'c?ng', tenKH: 'c?ng', soTien: 5000000 }],
        Date.parse('2026-08-31T08:35:00Z'), '15:35');
    assert.match(chu, /KHÔNG xuất hóa đơn/, 'không nói rõ là đã bỏ, không xuất');
    assert.match(chu, /c\?ng \(5\.000\.000đ\)/, 'không kể tên khách và số tiền');
    assert.match(chu, /BỊ LỠ/, 'không nói ra hệ quả: một lượt đã bị lỡ');
    assert.match(chu, /quá sát/, 'không chỉ đường sửa (giãn các mốc ra)');
    assert.match(chu, /mốc 15:35/);
});

test('⭐⭐ nền có móc báo, ở chỗ CẢ HAI lối cùng đi qua', async () => {
    const nen = doc('background.js');
    const than = nen.slice(nen.indexOf('async function ghiKetQuaVaLichSu'),
                           nen.indexOf('async function ghiKetQuaVaLichSu') + 900);
    assert.match(than, /boLenhCu/, 'không móc báo -> im lặng mất một tờ hóa đơn');
    assert.match(than, /baoBoLenhCu\(dsBo, o\.moc\)/);
    assert.match(than, /catch \(e\)/, 'không nuốt lỗi -> việc phụ làm hỏng việc ghi sổ');
});

test('⭐ nhắn ĐÚNG MỘT LẦN, và gửi hỏng thì còn thử lại', async () => {
    const nen = doc('background.js');
    const than = nen.slice(nen.indexOf('async function baoBoLenhCu'),
                           nen.indexOf('async function themSoKeToan'));
    assert.match(than, /gianhCho\(/, 'không chống trùng -> nhắn lặp mỗi lượt');
    assert.match(than, /traCho\(/, 'gửi hỏng mà giữ dấu -> mất hẳn tin, không ai biết');
});

ghiChu('── Không phá nếp cũ ──');

test('⭐⭐ cauNoi DỪNG NGAY khi xếp hàng bị từ chối', async () => {
    const cn = doc('chung/cauNoi.js');
    assert.match(cn, /const xep = await hangDoi\.xepHang\(danhSach\);/);
    assert.match(cn, /if \(xep && xep\.ok === false\)/,
        'không xét kết quả xếp hàng -> chạy tiếp với hàng đợi rỗng');
    assert.match(cn, /xep\.daXep,/, 'không truyền danh sách lượt này -> hàng đợi không dọn được');
});

test('⭐ lệnh treo cũ vẫn được tự kết luận như trước (luật 13/08/2026)', async () => {
    const hd = doc('chung/hangDoi.js');
    assert.match(hd, /so\.xuLyLenhTreo\(l\.id, false\)/,
        'bỏ mất bước tự kết luận lệnh treo -> hẹn giờ khóa cứng như bản trước 13/08');
});

test('⭐ phiên bản KHÔNG tụt về trước bản có bản vá này', () => {
    const so = (v) => String(v).split('.').map(Number);
    const [a, b, c] = so(JSON.parse(doc('manifest.json')).version);
    const [x, y, z] = so('2.40.0');
    assert.ok(a !== x ? a > x : (b !== y ? b > y : c >= z),
        'phiên bản tụt về trước 2.40.0 — bản đó còn để lệnh kẹt chạy ké');
});

chay('LỆNH CÒN KẸT TỪ LƯỢT TRƯỚC');
