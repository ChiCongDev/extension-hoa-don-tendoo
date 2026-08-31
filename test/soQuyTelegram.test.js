'use strict';

// ============================================================================
//  HAI CON SỐ TRONG TIN NHẮN TELEGRAM — chủ dự án chốt 31/08/2026.
//
//    Doanh thu hôm nay: 9.000.000
//    Quý tháng 6-7-8: 920.893.858
//
//  ── BA QUYẾT ĐỊNH ĐÃ CHỐT ────────────────────────────────────────────────
//  1. QUÝ LÀ KHỐI CỐ ĐỊNH 12-1-2 · 3-4-5 · 6-7-8 · 9-10-11 — lệch một tháng so
//     với quý lịch. Chốt theo đúng hai ví dụ: tháng 8 ra 6-7-8, tháng 10 ra
//     9-10-11; hai ví dụ ấy CHỈ khớp nhau với cách chia này.
//  2. Số quý GỒM CẢ TỜ VỪA XUẤT -> phải ghi sổ Sell xong rồi mới đọc.
//  3. Đọc không được thì GHI THẲNG "không đọc được", không im lặng bỏ dòng.
//
//  ⛔ VIỆC PHỤ. Sell sập, sai token, mất mạng — hóa đơn vẫn ra bình thường và
//  tin nhắn vẫn gửi, chỉ là hai dòng ấy ghi "không đọc được".
// ============================================================================

const assert = require('node:assert');
const path = require('node:path');
const { test, ghiChu, chay } = require('./chay');
const HenGio = require('../chung/henGio');
const KeToan = require('../chung/docKeToanQuy');
const Tg = require('../chung/baoTelegram');

const GOC = path.join(__dirname, '..');

ghiChu('── KHỐI BA THÁNG: đúng hai ví dụ chủ dự án đưa ──');

test('⭐⭐⭐ tháng 8 -> 6-7-8, tháng 10 -> 9-10-11', () => {
    assert.deepStrictEqual(HenGio.khoiBaThang('2026-08-28').thang, [6, 7, 8]);
    assert.deepStrictEqual(HenGio.khoiBaThang('2026-10-05').thang, [9, 10, 11],
        'không khớp ví dụ thứ hai — đây là chỗ phân biệt cách chia này với '
        + '"hai tháng trước cộng tháng này" (ra 8-9-10)');
});

test('⭐⭐ KHÔNG phải quý lịch', () => {
    // Quý lịch thì tháng 8 rơi vào 7-8-9. Chủ dự án chốt 6-7-8.
    assert.notDeepStrictEqual(HenGio.khoiBaThang('2026-08-28').thang, [7, 8, 9]);
    assert.deepStrictEqual(HenGio.khoiBaThang('2026-03-01').thang, [3, 4, 5]);
    assert.deepStrictEqual(HenGio.khoiBaThang('2026-05-31').thang, [3, 4, 5]);
});

test('⭐⭐ khối 12-1-2 VẮT QUA GIAO THỪA', () => {
    // Quên chỗ này là tháng 1 và tháng 2 cộng nhầm cả một năm.
    const a = HenGio.khoiBaThang('2026-01-15');
    assert.deepStrictEqual(a.thang, [12, 1, 2]);
    assert.strictEqual(a.tu, '2025-12-01', 'không lùi về tháng 12 NĂM TRƯỚC');
    assert.strictEqual(a.den, '2026-02-28');

    const b = HenGio.khoiBaThang('2026-12-31');
    assert.strictEqual(b.tu, '2026-12-01');
    assert.strictEqual(b.den, '2027-02-28', 'khối bắt đầu tháng 12 phải kéo sang năm sau');
});

test('⭐ ngày cuối khối tính đúng cả năm nhuận', () => {
    assert.strictEqual(HenGio.khoiBaThang('2028-02-10').den, '2028-02-29');
    assert.strictEqual(HenGio.khoiBaThang('2026-06-01').den, '2026-08-31');
});

test('ngày sai định dạng -> null, không đoán bừa', () => {
    for (const v of ['', null, '28/08/2026', '2026-13-01x']) {
        assert.strictEqual(HenGio.khoiBaThang(v), null, 'đoán bừa với: ' + JSON.stringify(v));
    }
});

ghiChu('── Đọc hai con số từ Sell ──');

/** Sell giả trả về đúng hình mà `apiBang` trả. */
function sellGia({ than, ok = true, status = 200, nem = null } = {}) {
    const daGoi = [];
    const f = async (url, tuyChon) => {
        daGoi.push({ url, tuyChon });
        if (nem) throw new Error(nem);
        return { ok, status, json: async () => than };
    };
    f.daGoi = daGoi;
    return f;
}

const THAN_MAU = {
    khach: [
        { khach_hang_id: 7, ma_khach_hang: '2002123321', ten: 'c?ng' },
        { khach_hang_id: 9, ma_khach_hang: 'KH2607160002', ten: 'hoa' },
    ],
    cong_don: {
        7: { ds: 77210825, xhd: 200860000, xhdTuChon: 55000000, xhdHeThong: 145860000 },
        9: { ds: 92036900, xhd: 165900000, xhdTuChon: 26000000, xhdHeThong: 139900000 },
    },
    dong: [
        { ngay: '2026-08-27', o: { 7: { ds: 1, xhd: 0 }, 9: { ds: 2, xhd: 0 } } },
        { ngay: '2026-08-28', o: { 7: { ds: 9000000, xhd: 5000000 }, 9: { ds: 3, xhd: 0 } } },
    ],
};

const CAI_DAT = { sellUrl: 'https://bongtom.store', sellToken: 'abc' };
const KHOI = HenGio.khoiBaThang('2026-08-28');

test('⭐⭐⭐ một lần gọi ra CẢ HAI con số', async () => {
    const f = sellGia({ than: THAN_MAU });
    const kq = await KeToan.docQua(CAI_DAT, '2026-08-28', KHOI, f);
    assert.strictEqual(kq.ok, true, kq.thongBao || kq.ma);
    assert.strictEqual(f.daGoi.length, 1, 'gọi nhiều hơn một lần cho cùng một khoảng');
    assert.strictEqual(kq.theoMa['2002123321'].xhdQuy, 200860000,
        'không lấy đúng cột TIỀN XUẤT HÓA ĐƠN');
    assert.strictEqual(kq.theoMa['2002123321'].dsHomNay, 9000000,
        'không lấy đúng doanh thu của HÔM NAY');
});

test('⭐⭐ xin ĐÚNG khoảng ba tháng, và chỉ ĐỌC', async () => {
    const f = sellGia({ than: THAN_MAU });
    await KeToan.docQua(CAI_DAT, '2026-08-28', KHOI, f);
    const g = f.daGoi[0];
    assert.match(g.url, /tu_ngay=2026-06-01/, 'sai ngày đầu khối: ' + g.url);
    assert.match(g.url, /den_ngay=2026-08-31/, 'sai ngày cuối khối: ' + g.url);
    assert.match(g.url, /ky=tuy_chon/);
    // Không truyền method -> GET. Đây là đường CHỈ ĐỌC.
    assert.ok(!g.tuyChon || !g.tuyChon.method || g.tuyChon.method === 'GET',
        'gọi bằng phương thức ghi — đường này phải chỉ đọc');
    assert.match(g.tuyChon.headers.Authorization, /^Bearer /);
});

test('⭐ lấy DOANH THU CỦA ĐÚNG NGÀY, không lấy nhầm ngày khác', async () => {
    const f = sellGia({ than: THAN_MAU });
    const kq = await KeToan.docQua(CAI_DAT, '2026-08-27', KHOI, f);
    assert.strictEqual(kq.theoMa['2002123321'].dsHomNay, 1,
        'lấy nhầm doanh thu của ngày khác');
});

test('⭐⭐ bắc cầu mã khách qua danh sách Sell gửi kèm, không đoán', async () => {
    // Bảng trả về theo `khach_hang_id`; extension chỉ biết MÃ KHÁCH.
    const f = sellGia({ than: THAN_MAU });
    const kq = await KeToan.docQua(CAI_DAT, '2026-08-28', KHOI, f);
    assert.ok(kq.theoMa['KH2607160002'], 'mất khách thứ hai khi bắc cầu id -> mã');
    assert.strictEqual(kq.theoMa['KH2607160002'].xhdQuy, 165900000);
});

test('⛔ chưa khai token thì KHÔNG gọi mạng', async () => {
    const f = sellGia({ than: THAN_MAU });
    const kq = await KeToan.docQua({ sellUrl: '', sellToken: '' }, '2026-08-28', KHOI, f);
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ma, 'CHUA_KHAI_BAO');
    assert.strictEqual(f.daGoi.length, 0);
});

test('⛔ Sell hỏng thì trả mã lý do, KHÔNG ném', async () => {
    for (const [dat, ma] of [
        [{ ok: false, status: 403 }, 'SAI_TOKEN'],
        [{ ok: false, status: 404 }, 'SAI_DIA_CHI'],
        [{ ok: false, status: 500 }, 'SELL_LOI'],
        [{ nem: 'mất mạng' }, 'KHONG_GOI_DUOC'],
    ]) {
        const kq = await KeToan.docQua(CAI_DAT, '2026-08-28', KHOI, sellGia(dat));
        assert.strictEqual(kq.ok, false);
        assert.strictEqual(kq.ma, ma);
    }
});

ghiChu('── Nhớ ngắn hạn: một loạt nhiều khách chỉ tốn MỘT lần gọi ──');

test('⭐⭐ hỏi lại cùng khoảng thì dùng lại kết quả', async () => {
    const f = sellGia({ than: THAN_MAU });
    let t = 1000;
    const doc = KeToan.taoBoDoc({ layFetch: f, dongHo: () => t });
    await doc(CAI_DAT, '2026-08-28', KHOI);
    await doc(CAI_DAT, '2026-08-28', KHOI);
    await doc(CAI_DAT, '2026-08-28', KHOI);
    assert.strictEqual(f.daGoi.length, 1,
        'mỗi khách một lần gọi -> loạt bốn khách gọi Sell bốn lần vô ích');
});

test('⭐ quá hạn nhớ thì hỏi lại', async () => {
    const f = sellGia({ than: THAN_MAU });
    let t = 1000;
    const doc = KeToan.taoBoDoc({ layFetch: f, dongHo: () => t });
    await doc(CAI_DAT, '2026-08-28', KHOI);
    t += KeToan.HAN_NHO_MS + 1;
    await doc(CAI_DAT, '2026-08-28', KHOI);
    assert.strictEqual(f.daGoi.length, 2, 'nhớ mãi -> khách sau đọc phải số cũ');
});

test('⭐⭐ KHÔNG nhớ lần HỎNG — một cú mạng chập không được làm cả loạt thiếu số', async () => {
    let hong = true;
    const daGoi = [];
    const f = async (url, o) => {
        daGoi.push(url);
        if (hong) throw new Error('mất mạng');
        return { ok: true, status: 200, json: async () => THAN_MAU };
    };
    let t = 1000;
    const doc = KeToan.taoBoDoc({ layFetch: f, dongHo: () => t });
    const a = await doc(CAI_DAT, '2026-08-28', KHOI);
    assert.strictEqual(a.ok, false);
    hong = false;
    const b = await doc(CAI_DAT, '2026-08-28', KHOI);
    assert.strictEqual(b.ok, true, 'nhớ cả lần hỏng -> cả loạt thiếu số vì một cú mạng chập');
    assert.strictEqual(daGoi.length, 2);
});

ghiChu('── Tin nhắn ──');

const donGoc = () => ({
    ket_qua: 'RA_HOA_DON', ten_khach_hang: 'c?ng', ma_khach_hang: '2002123321',
    so_tien: 5000000, ngay: '2026-08-28', chay_luc: Date.parse('2026-08-28T04:19:17Z'),
});

test('⭐⭐⭐ tin nhắn in ĐÚNG hai dòng chủ dự án yêu cầu', () => {
    const chu = Tg.soanTin({ ...donGoc(),
        ds_hom_nay: 9000000, xhd_quy: 920893858, quy_thang: [6, 7, 8] });
    assert.match(chu, /Doanh thu hôm nay: 9\.000\.000/);
    assert.match(chu, /Quý tháng 6-7-8: 920\.893\.858/);
    // Thứ tự đọc: xuất bao nhiêu -> hôm nay bán bao nhiêu -> cả quý -> giờ.
    const d = chu.split('\n');
    const iTien = d.findIndex(x => x.startsWith('Số tiền'));
    const iDs = d.findIndex(x => x.startsWith('Doanh thu hôm nay'));
    const iQuy = d.findIndex(x => x.startsWith('Quý tháng'));
    const iLuc = d.findIndex(x => x.startsWith('Lúc'));
    assert.ok(iTien < iDs && iDs < iQuy && iQuy < iLuc,
        'sai thứ tự dòng: ' + JSON.stringify(d));
});

test('⭐⭐ đọc không được thì GHI THẲNG, không im lặng bỏ dòng', () => {
    const chu = Tg.soanTin({ ...donGoc(),
        ds_hom_nay: null, xhd_quy: null, quy_thang: [6, 7, 8] });
    assert.match(chu, /Doanh thu hôm nay: không đọc được/,
        'bỏ dòng đi thì người đọc tưởng máy quên, không biết Sell đang hỏng');
    assert.match(chu, /Quý tháng 6-7-8: không đọc được/);
});

test('⭐ số 0 KHÁC "không đọc được"', () => {
    // Khách hôm nay chưa bán được đồng nào là một chuyện; Sell hỏng là chuyện
    // khác hẳn. Gộp làm một là mất hẳn tín hiệu Sell đang hỏng.
    const chu = Tg.soanTin({ ...donGoc(), ds_hom_nay: 0, xhd_quy: 0, quy_thang: [6, 7, 8] });
    assert.match(chu, /Doanh thu hôm nay: 0/);
    assert.ok(!/không đọc được/.test(chu));
});

test('⭐⭐⭐ ĐỌC HỎNG KHÔNG ĐƯỢC CHẶN TIN NHẮN', () => {
    // ⚠️ Việc phụ. Sell sập thì hóa đơn vẫn ra và tin vẫn phải tới tay — chỉ là
    // hai dòng ấy ghi "không đọc được". Chặn tin là mất hẳn thứ quan trọng
    // (hóa đơn vừa ra) vì một thứ phụ (hai con số tham khảo).
    const nen = doc('background.js');
    const than = nen.slice(nen.indexOf('async function themSoKeToan'),
                           nen.indexOf('async function baoTelegram'));
    assert.match(than, /catch \(e\) \{[\s\S]{0,40}?return dong;/,
        'themSoKeToan ném ra ngoài -> nuốt luôn cả tin nhắn');
    // Và soạn tin vẫn ra đủ các dòng cũ khi hai con số không có.
    const chu = Tg.soanTin({ ...donGoc(), ds_hom_nay: null, xhd_quy: null, quy_thang: [6, 7, 8] });
    assert.match(chu, /✅ Đã xuất hóa đơn/);
    assert.match(chu, /Số tiền: 5\.000\.000đ/);
    assert.match(chu, /Lúc: /);
});

test('⭐⭐ "khách chưa được chọn" KHÁC HẲN "Sell hỏng"', () => {
    // `apiBang` chỉ trả về khách nằm trong "Chọn khách hiển thị". Khách bị bỏ
    // tích ở đó mà báo "không đọc được" là nói SAI BỆNH: người đọc sẽ đi kiểm
    // token, kiểm mạng, trong khi chỉ cần tích thêm một ô.
    const chu = Tg.soanTin({ ...donGoc(), ds_hom_nay: null, xhd_quy: null,
                             quy_thang: [6, 7, 8], ngoai_bang_ke_toan: true });
    assert.match(chu, /khách chưa được chọn trên trang Kế toán/);
    assert.ok(!/không đọc được/.test(chu), 'vẫn nói nhầm thành Sell hỏng');
});

test('⭐ nền phân biệt được hai ca ấy', () => {
    const nen = doc('background.js');
    assert.match(nen, /const ngoaiBang = kq\.ok && !o;/,
        'không phân biệt -> khách chưa tích cũng báo là Sell hỏng');
    assert.match(nen, /ngoai_bang_ke_toan: true/);
});

test('⭐ tin CŨ (không có hai khoá) giữ nguyên dạng cũ', () => {
    // Bản ghi cũ trong hàng chờ, và đường chạy tay — không đi hỏi thì không
    // được mọc thêm dòng nào.
    const chu = Tg.soanTin(donGoc());
    assert.ok(!/Doanh thu hôm nay/.test(chu), 'tin cũ mọc thêm dòng rỗng');
    assert.ok(!/Quý tháng/.test(chu));
});

test('⭐ hai dòng mới chỉ thêm chữ, KHÔNG đụng phần cũ', () => {
    const chu = Tg.soanTin({ ...donGoc(),
        ds_hom_nay: 9000000, xhd_quy: 920893858, quy_thang: [6, 7, 8] });
    assert.match(chu, /✅ Đã xuất hóa đơn/);
    assert.match(chu, /Khách hàng: c\?ng \(2002123321\)/);
    assert.match(chu, /Số tiền: 5\.000\.000đ/);
    assert.match(chu, /Lúc: 28\/08\/2026 11:19:17/);
});

ghiChu('── Nối dây trong tiến trình nền ──');

const fs = require('node:fs');
const doc = (f) => fs.readFileSync(path.join(GOC, f), 'utf8');

test('⭐⭐⭐ GHI SỔ SELL XONG rồi mới đọc số quý', () => {
    // Chủ dự án chốt: số quý phải GỒM CẢ TỜ VỪA XUẤT. Chạy song song như bản cũ
    // thì có lần kịp có lần không — cùng một tình huống ra hai con số khác nhau.
    const nen = doc('background.js');
    assert.match(nen, /await daySangSell\(dong\);\s*\n\s*await baoTelegram\(await themSoKeToan\(dong\)\)/,
        'chưa xếp thứ tự ghi-sổ-trước-đọc-sau');
    assert.ok(!/if \(dong\) daySangSell\(dong\);\s*\n\s*if \(dong\) baoTelegram\(dong\)/.test(nen),
        'vẫn còn kiểu chạy song song cũ');
});

test('⭐⭐ lưới an toàn cuối loạt CŨNG gắn hai con số', () => {
    // Không lo nhánh này thì cùng một lượt ra hai kiểu tin nhắn khác nhau, tuỳ
    // đường nào gửi được trước.
    const nen = doc('background.js');
    assert.match(nen, /baoTelegram\(await themSoKeToan\(self\.HDT_DayVeSell\.goiTuBanGhi\(banGhi\)\)\)/,
        'lưới an toàn gửi tin thiếu hai dòng');
});

test('⭐⭐ tiến trình nền có nạp bộ đọc', () => {
    const nen = doc('background.js');
    assert.match(nen, /'chung\/docKeToanQuy\.js'/, 'quên nạp -> nền nổ ngay khi khởi động');
    assert.match(nen, /self\.HDT_DocKeToanQuy\.taoBoDoc\(\)/,
        'không dùng bộ nhớ ngắn hạn -> mỗi khách một lần gọi Sell');
});

chay('HAI CON SỐ TRONG TIN NHẮN TELEGRAM');
