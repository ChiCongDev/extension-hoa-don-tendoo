'use strict';

// ============================================================================
//  TỰ ĐẶT SỐ TIỀN XUẤT MỖI NGÀY — chủ dự án chốt 24/08/2026.
//
//  LUẬT: mỗi ngày xuất đúng con số người dùng đặt, KHÔNG liên quan doanh số hôm
//  nay. Trần cứng: không bao giờ vượt "tiền chưa xuất hóa đơn" của chính khách
//  đó, tính trên TOÀN BỘ thời gian.
//
//  ⚠️ VÌ SAO TRẦN PHẢI HỎI SELL CHỨ KHÔNG TỰ CỘNG. Bảng Kế toán tổng hợp có
//  những dòng NGƯỜI DÙNG NHẬP TAY (ảnh thật 24/08/2026: "6 dòng nhập tay" ở một
//  nơi, "19 dòng" ở nơi khác). Extension không biết chúng. Tự cộng "đã xuất" là
//  ra số nhỏ hơn thật -> dư to hơn thật -> XUẤT VƯỢT TRẦN hóa đơn thuế.
//
//  ⚠️ LỜI HỨA LỚN NHẤT: khách ĐỂ TRỐNG ô phải chạy y hệt như trước — không thêm
//  một điều kiện nào, không thêm một cách hỏng nào.
// ============================================================================

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const CaiDat = require('../chung/caiDat');
const HenGio = require('../chung/henGio');
const ApDung = require('../chung/apDungSoDat');
const SoDu = require('../chung/soDuKeToan');

let dat = 0, hong = 0;
const cho = [];
function test(ten, fn) { cho.push([ten, fn]); }
function ghiChu(chu) { cho.push([chu, null]); }

const khach = (ma, them = {}) => ({ maKH: ma, tenKH: 'Khách ' + ma, ...them });
const bang = (cac) => cac.map(([ma, dt]) => ({ maKH: ma, tenKH: 'Khách ' + ma, doanhThu: dt }));

// ────────────────────────────────────────────────────────────────────────────
ghiChu('— ⛔⛔⛔ LỜI HỨA: KHÔNG ĐẶT SỐ THÌ KHÔNG ĐỔI GÌ HẾT —');

test('⛔⛔⛔ không ai đặt số → trả về Y HỆT kết quả cũ', () => {
    // Đây là chốt quan trọng nhất cả tệp. Tính năng mới KHÔNG ĐƯỢC làm yếu
    // đường đang chạy tốt — kể cả khi số dư đọc hỏng, kể cả khi không có số dư.
    const trongLich = [khach('A'), khach('B')];
    const ghep = HenGio.ghepVoiBang(trongLich, bang([['A', 990000]]), true);
    for (const soDu of [null, new Map(), new Map([['A', 5]])]) {
        const r = ApDung.apDung({ trongLich, ghep, soDu, loiSoDu: 'hỏng gì đó' });
        assert.deepStrictEqual(r.chay, ghep.chay, 'đã đụng vào danh sách chạy');
        assert.deepStrictEqual(r.thieu, ghep.thieu, 'đã đụng vào danh sách bỏ qua');
        assert.deepStrictEqual(r.loi, [], 'đẻ ra lỗi cho khách không đặt số');
        assert.strictEqual(r.coAiDat, false);
    }
});

test('⛔⛔ khách KHÔNG đặt vẫn nguyên xi khi khách KHÁC có đặt', () => {
    // Một khách bật tính năng không được kéo theo khách bên cạnh.
    const trongLich = [khach('A'), khach('B', { soTienNgay: 3000000 })];
    const ghep = HenGio.ghepVoiBang(trongLich, bang([['A', 990000]]), true);
    const r = ApDung.apDung({ trongLich, ghep, soDu: new Map([['B', 9000000]]) });
    const a = r.chay.find(x => x.maKH === 'A');
    assert.ok(a, 'khách A biến mất');
    assert.strictEqual(a.soTien, 990000, 'doanh số của A bị đổi');
    assert.strictEqual(a.soTienDat, undefined, 'A bị gắn số đặt của người khác');
});

// ────────────────────────────────────────────────────────────────────────────
ghiChu('— ⭐⭐⭐ TRẦN CỨNG: KHÔNG BAO GIỜ VƯỢT SỐ DƯ —');

test('⭐⭐⭐ dư THỪA → xuất đúng số đã đặt', () => {
    const trongLich = [khach('A', { soTienNgay: 10000000 })];
    const ghep = HenGio.ghepVoiBang(trongLich, bang([['A', 990000]]), true);
    const r = ApDung.apDung({ trongLich, ghep, soDu: new Map([['A', 50000000]]) });
    assert.strictEqual(r.chay.length, 1);
    assert.strictEqual(r.chay[0].soTien, 10000000,
        'không xuất đúng số đã đặt — doanh số hôm nay KHÔNG được xen vào');
});

test('⭐⭐⭐ dư ÍT HƠN số đặt → xuất NỐT phần còn lại, không vượt', () => {
    const trongLich = [khach('A', { soTienNgay: 10000000 })];
    const ghep = HenGio.ghepVoiBang(trongLich, bang([['A', 990000]]), true);
    const r = ApDung.apDung({ trongLich, ghep, soDu: new Map([['A', 4000000]]) });
    assert.strictEqual(r.chay[0].soTien, 4000000,
        '⛔⛔ VƯỢT TRẦN — xuất quá phần doanh số còn nợ hóa đơn');
});

test('⭐⭐⭐ dư ÂM hoặc BẰNG 0 → BỎ QUA, và KHÔNG tính là lỗi', () => {
    // Trên máy chủ dự án, cả bốn khách đang âm (−96tr, −84tr, −122tr, −74tr) vì
    // đã xuất nhiều hơn doanh số. Chặn sạch ở đó là ĐÚNG LUẬT, không phải hỏng.
    for (const du of [0, -1, -96471606]) {
        const trongLich = [khach('A', { soTienNgay: 10000000 })];
        const ghep = HenGio.ghepVoiBang(trongLich, bang([['A', 990000]]), true);
        const r = ApDung.apDung({ trongLich, ghep, soDu: new Map([['A', du]]) });
        assert.strictEqual(r.chay.length, 0, '⛔⛔ VẪN XUẤT trong khi dư ' + du);
        assert.strictEqual(r.loi.length, 0, 'dư cạn mà kêu thành LỖI: ' + du);
        assert.strictEqual(r.thieu.length, 1);
        assert.match(r.thieu[0].lyDo, /số dư .*không đủ/, r.thieu[0].lyDo);
    }
});

test('⭐⭐ khách KHÔNG có doanh thu hôm nay VẪN chạy nếu có đặt số', () => {
    // Cả điểm của tính năng: xuất cho phần doanh số NHỮNG NGÀY CŨ còn nợ hóa
    // đơn. Giữ luật "không doanh thu thì bỏ qua" ở đây là vô hiệu hóa nó.
    const trongLich = [khach('A', { soTienNgay: 7000000 })];
    const ghep = HenGio.ghepVoiBang(trongLich, bang([]), true);
    assert.strictEqual(ghep.chay.length, 0, 'bộ ghép cũ phải bỏ qua khách này');
    const r = ApDung.apDung({ trongLich, ghep, soDu: new Map([['A', 20000000]]) });
    assert.strictEqual(r.chay.length, 1, '⛔ vẫn bỏ qua khách đã đặt số');
    assert.strictEqual(r.chay[0].soTien, 7000000);
});

// ────────────────────────────────────────────────────────────────────────────
ghiChu('— ⛔⛔ KHÔNG BIẾT TRẦN THÌ TUYỆT ĐỐI KHÔNG XUẤT —');

test('⛔⛔ đọc số dư HỎNG → DỪNG khách đó, không đoán trần', () => {
    const trongLich = [khach('A', { soTienNgay: 10000000 })];
    const ghep = HenGio.ghepVoiBang(trongLich, bang([['A', 990000]]), true);
    const r = ApDung.apDung({ trongLich, ghep, soDu: null, loiSoDu: 'Sell trả về 500' });
    assert.strictEqual(r.chay.length, 0, '⛔⛔ XUẤT TRONG KHI KHÔNG BIẾT TRẦN');
    assert.strictEqual(r.loi.length, 1);
    assert.match(r.loi[0].thongBao, /KHÔNG đọc được số dư/, r.loi[0].thongBao);
    assert.match(r.loi[0].thongBao, /Sell trả về 500/, 'nuốt mất lý do thật');
});

test('⛔⛔ khách KHÔNG có trong bảng kế toán → DỪNG, không coi là 0 hay vô hạn', () => {
    const trongLich = [khach('A', { soTienNgay: 10000000 })];
    const ghep = HenGio.ghepVoiBang(trongLich, bang([['A', 990000]]), true);
    const r = ApDung.apDung({ trongLich, ghep, soDu: new Map([['B', 50000000]]) });
    assert.strictEqual(r.chay.length, 0, '⛔⛔ XUẤT cho khách không có trần');
    assert.strictEqual(r.loi.length, 1);
    assert.match(r.loi[0].thongBao, /Chọn khách hiển thị/, 'không chỉ đường sửa');
});

test('⛔ số dư đọc ra KHÔNG PHẢI SỐ → cũng DỪNG', () => {
    const trongLich = [khach('A', { soTienNgay: 10000000 })];
    const ghep = HenGio.ghepVoiBang(trongLich, bang([['A', 990000]]), true);
    for (const rac of ['nhiều', NaN, null, undefined]) {
        const r = ApDung.apDung({ trongLich, ghep, soDu: new Map([['A', rac]]) });
        assert.strictEqual(r.chay.length, 0, '⛔ xuất với trần = ' + String(rac));
    }
});

// ────────────────────────────────────────────────────────────────────────────
ghiChu('— ⭐⭐ TRỪ NHỮNG TỜ ĐÃ RA MÀ CHƯA ĐẨY VỀ SELL —');

test('⭐⭐⭐ hàng chờ còn đọng → phải TRỪ ra khỏi số dư', () => {
    // ⚠️ Số dư Sell trả về chỉ phản ánh những dòng ĐÃ TỚI NƠI. Tờ đã phát hành
    // thật mà chưa đẩy được (mất mạng, hết phiên) vẫn nằm trong hàng chờ. Không
    // trừ ra thì số dư trông TO HƠN THẬT, và lượt này xuất vượt đúng bằng phần
    // đang kẹt.
    const du = ApDung.truHangCho(new Map([['A', 10000000]]), [
        { ma_khach_hang: 'A', so_tien: 3000000, ket_qua: 'RA_HOA_DON' },
        { ma_khach_hang: 'A', so_tien: 1000000, ket_qua: 'RA_HOA_DON' },
    ]);
    assert.strictEqual(du.get('A'), 6000000, '⛔ không trừ hàng chờ — sẽ xuất vượt');
});

test('⛔ chỉ trừ tờ ĐÃ RA HÓA ĐƠN — "mới vào giỏ" thì chưa có tờ nào', () => {
    const du = ApDung.truHangCho(new Map([['A', 10000000]]), [
        { ma_khach_hang: 'A', so_tien: 3000000, ket_qua: 'VAO_GIO' },
        { ma_khach_hang: 'A', so_tien: 2000000, ket_qua: 'LOI' },
        { ma_khach_hang: 'A', so_tien: 1000000, ket_qua: 'TREO' },
    ]);
    assert.strictEqual(du.get('A'), 10000000, 'trừ nhầm tờ chưa hề phát hành');
});

test('⛔ hàng chờ rác không được làm hỏng số dư', () => {
    const goc = new Map([['A', 10000000]]);
    for (const cho2 of [null, undefined, 'rác', [null], [{}],
                        [{ ma_khach_hang: 'Z', so_tien: 5, ket_qua: 'RA_HOA_DON' }]]) {
        assert.strictEqual(ApDung.truHangCho(goc, cho2).get('A'), 10000000,
            'hàng chờ rác làm đổi số dư: ' + JSON.stringify(cho2));
    }
});

// ────────────────────────────────────────────────────────────────────────────
ghiChu('— ⭐ Ô NHẬP: mập mờ thì TỪ CHỐI, không đoán —');

test('⛔⛔ "1.5" KHÔNG được hiểu thành 15', () => {
    // Bản nháp của tôi bóc hết dấu chấm rồi cộng lại, nên "1.5" ra 15. Người gõ
    // "1.5" gần như chắc chắn định nói 1,5 triệu — mà máy hiểu là mười lăm đồng
    // rồi đem đi xuất hóa đơn thuế. Mập mờ thì phải từ chối.
    for (const v of ['1.5', '1.50', '1.2345', '0', '-5', 'abc', '', null, '1..000']) {
        assert.strictEqual(CaiDat.chuanSoTienNgay(v), null, 'nhận bừa: ' + JSON.stringify(v));
    }
});

test('⭐ nhận đúng hai dạng người ta hay gõ', () => {
    assert.strictEqual(CaiDat.chuanSoTienNgay('1.500.000'), 1500000);
    assert.strictEqual(CaiDat.chuanSoTienNgay('1500000'), 1500000);
    assert.strictEqual(CaiDat.chuanSoTienNgay(' 2,000,000 '), 2000000);
});

test('⛔ ngày gõ sai thì trả RỖNG, không đoán', () => {
    for (const v of ['2026-02-31', '01/01/2026', '2026-1-1', 'hôm nay', '', null]) {
        assert.strictEqual(CaiDat.chuanNgayISO(v), '', 'nhận bừa: ' + JSON.stringify(v));
    }
    assert.strictEqual(CaiDat.chuanNgayISO('2026-01-01'), '2026-01-01');
});

test('⭐ cài đặt GIỮ ĐƯỢC số đã đặt, và BỎ số rác', () => {
    const c = CaiDat.gop({}, { henGio: { bat: true, moc: ['08:00'], soDuTuNgay: '2026-01-01',
        khach: [khach('A', { soTienNgay: '1.500.000' }), khach('B', { soTienNgay: '1.5' })] } },
        HenGio);
    assert.strictEqual(c.henGio.khach[0].soTienNgay, 1500000);
    assert.strictEqual(c.henGio.khach[1].soTienNgay, undefined, 'giữ lại một con số rác');
    assert.strictEqual(c.henGio.soDuTuNgay, '2026-01-01');
});

// ────────────────────────────────────────────────────────────────────────────
ghiChu('— ⭐⭐ HỎI SELL: đúng khoảng, đúng cửa, không bao giờ ném —');

const CAI_DAT = { sellUrl: 'https://bongtom.store', sellToken: 'tk',
                  henGio: { soDuTuNgay: '2026-01-01' } };
const TRA_LOI = {
    thanh_cong: true,
    khach: [{ khach_hang_id: 7, ma_khach_hang: 'S3', ten: 'Thùy Dương S3' },
            { khach_hang_id: 9, ma_khach_hang: 'S1', ten: 'Bích Ngọc S1' }],
    chua_xuat: { 7: 10710000, 9: 10089000 },
};
const fetchGia = (tra, ghi) => async (url, opt) => {
    if (ghi) ghi.push({ url, opt });
    return { ok: true, status: 200, json: async () => tra };
};

test('⭐⭐⭐ phải hỏi khoảng TẤT CẢ, không phải "hôm nay"', () => {
    // ⚠️ Bên Sell ghi rõ: "Chưa xuất HĐ CỘNG DỒN TRONG KHOẢNG ĐANG XEM, KHÔNG
    // mang số dư từ trước sang." Hỏi sai khoảng là ra sai trần.
    const d = SoDu.taoDuong('https://bongtom.store/', '2026-01-01', '2026-08-24');
    assert.match(d, /loai=tuy_chon/, 'không hỏi kiểu "tùy chọn": ' + d);
    assert.match(d, /tu_ngay=2026-01-01/, d);
    assert.match(d, /den_ngay=2026-08-24/, d);
    assert.ok(!/loai=hom_nay|loai=nam_nay/.test(d), '⛔ hỏi nhầm một kỳ hẹp: ' + d);
});

test('⭐⭐⭐ phải gửi ĐÚNG tiêu đề mà Sell đọc — Authorization: Bearer', async () => {
    // ⚠️ CA HỎNG THẬT 14:30 ngày 24/08/2026, hỏng CẢ BỐN khách.
    //
    // Tôi tự bịa tiêu đề 'X-Extension-Token'. Middleware KiemTraApiHoaDon bên
    // Sell chỉ gọi $request->bearerToken(), tức CHỈ nhìn "Authorization:
    // Bearer …". Sell thấy token rỗng và trả 403.
    //
    // ⚠️ VÀ VÌ SAO BÀI KIỂM CŨ KHÔNG BẮT ĐƯỢC: nó giả lập fetch rồi chỉ soi
    // ĐỊA CHỈ, không soi TIÊU ĐỀ. Giả lập mà không soi hết những gì mình gửi đi
    // thì chỉ chứng minh được rằng mình có gọi, không chứng minh gọi đúng.
    const ghi = [];
    await SoDu.docSoDu({ caiDat: CAI_DAT, layFetch: fetchGia(TRA_LOI, ghi) });
    assert.strictEqual(ghi.length, 1, 'không gọi Sell lần nào');
    const h = (ghi[0].opt && ghi[0].opt.headers) || {};
    assert.strictEqual(h.Authorization, 'Bearer tk',
        '⛔⛔ SAI TIÊU ĐỀ XÁC THỰC — Sell sẽ trả 403: ' + JSON.stringify(h));
});

test('⛔ cách xác thực phải GIỐNG HỆT đường token đang chạy tốt', () => {
    // Hai chỗ cùng gõ một cửa token mà gửi hai kiểu tiêu đề thì sớm muộn một
    // chỗ chết, và chỗ chết là chỗ mới — đúng như đã xảy ra. Neo vào
    // docBangToken.js: nó đã chạy đúng bấy lâu nên nó là chuẩn.
    const goc = path.join(__dirname, '..', 'chung');
    const mau = /'Authorization': 'Bearer ' \+ token/;
    assert.match(fs.readFileSync(path.join(goc, 'docBangToken.js'), 'utf8'), mau,
        'đường token CŨ đã đổi cách xác thực — phải xem lại cả hai chỗ');
    assert.match(fs.readFileSync(path.join(goc, 'soDuKeToan.js'), 'utf8'), mau,
        '⛔ đường đọc số dư không dùng cùng cách xác thực với đường đang chạy tốt');
});

test('⭐⭐ ghép số dư theo MÃ KHÁCH, không theo tên', async () => {
    // Tên đổi được, và dữ liệu thật có tên hiện sai dấu ("ki?n", "ti?n") — ghép
    // theo tên là ghép nhầm người, rồi xuất hóa đơn theo trần của người khác.
    const kq = await SoDu.docSoDu({ caiDat: CAI_DAT, layFetch: fetchGia(TRA_LOI) });
    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.strictEqual(kq.soDu.get('S3'), 10710000);
    assert.strictEqual(kq.soDu.get('S1'), 10089000);
});

test('⛔ khách thiếu MÃ hoặc thiếu số dư → không đưa vào bảng', () => {
    const m = SoDu.docTraLoi({
        khach: [{ khach_hang_id: 1, ma_khach_hang: '' },
                { khach_hang_id: 2, ma_khach_hang: 'B' },
                { khach_hang_id: 3, ma_khach_hang: 'C' }],
        chua_xuat: { 2: 500 },
    });
    assert.deepStrictEqual([...m.keys()], ['B'], 'nhét bừa khách không có số dư');
});

test('⛔⛔ chưa đặt mốc số dư → TỪ CHỐI, không tự chọn bừa một ngày', async () => {
    const kq = await SoDu.docSoDu({
        caiDat: { ...CAI_DAT, henGio: { soDuTuNgay: '' } }, layFetch: fetchGia(TRA_LOI),
    });
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ma, 'THIEU_MOC_SO_DU', kq.thongBao);
});

test('⛔ chưa khai token → TỪ CHỐI', async () => {
    for (const c of [{ ...CAI_DAT, sellToken: '' }, { ...CAI_DAT, sellUrl: '' }]) {
        const kq = await SoDu.docSoDu({ caiDat: c, layFetch: fetchGia(TRA_LOI) });
        assert.strictEqual(kq.ma, 'CHUA_KHAI_BAO', kq.thongBao);
    }
});

test('⛔ Sell từ chối token (401/403) → nói ĐÚNG BỆNH, không thử lại vô ích', async () => {
    let lan = 0;
    const kq = await SoDu.docSoDu({
        caiDat: CAI_DAT,
        layFetch: async () => { lan++; return { ok: false, status: 403 }; },
    });
    assert.strictEqual(kq.ma, 'TOKEN_SAI', kq.thongBao);
    assert.strictEqual(lan, 1, 'thử lại một câu từ chối rõ ràng — chỉ tốn thời gian');
});

test('⭐ mạng chập thì THỬ LẠI, rồi mới chịu thua', async () => {
    let lan = 0;
    const kq = await SoDu.docSoDu({
        caiDat: CAI_DAT, nghi: async () => {},
        layFetch: async () => { lan++; throw new Error('Failed to fetch'); },
    });
    assert.strictEqual(lan, SoDu.SO_LAN_THU_MANG, 'thử ' + lan + ' lần');
    assert.strictEqual(kq.ma, 'KHONG_GOI_DUOC', kq.thongBao);
});

test('⭐ mạng chập rồi thông → vẫn lấy được số dư', async () => {
    let lan = 0;
    const kq = await SoDu.docSoDu({
        caiDat: CAI_DAT, nghi: async () => {},
        layFetch: async () => {
            lan++;
            if (lan < 2) throw new Error('chập');
            return { ok: true, status: 200, json: async () => TRA_LOI };
        },
    });
    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.strictEqual(kq.soDu.get('S3'), 10710000);
});

test('⛔ đường dẫn chưa mở bên Sell → nói rõ, đừng để người dùng đoán', async () => {
    const kq = await SoDu.docSoDu({
        caiDat: CAI_DAT, layFetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
    });
    assert.strictEqual(kq.ma, 'TRA_LOI_LA');
    assert.match(kq.thongBao, /ke-toan-bang/, kq.thongBao);
});

test('⛔⛔ docSoDu KHÔNG BAO GIỜ được ném', async () => {
    for (const f of [async () => { throw new Error('vỡ'); },
                     async () => ({ ok: true, status: 200, json: async () => { throw new Error('vỡ'); } }),
                     async () => null]) {
        const kq = await SoDu.docSoDu({ caiDat: CAI_DAT, layFetch: f, nghi: async () => {} });
        assert.strictEqual(kq.ok, false);
        assert.ok(kq.thongBao, 'chịu thua mà không nói vì sao');
    }
});

// ────────────────────────────────────────────────────────────────────────────
ghiChu('— ⭐⭐ NỐI DÂY: mã có thật sự dùng những thứ trên không —');

const maNen = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
const maThat = maNen.split('\n').filter(d => !/^\s*\/\//.test(d)).join('\n');

test('⭐⭐⭐ tiến trình nền phải NẠP và DÙNG hai module mới', () => {
    // Lại đúng bẫy đã dính với daChay(): hàm đúng mà dây không nối thì vô dụng.
    assert.match(maThat, /'chung\/soDuKeToan\.js',/, 'quên nạp soDuKeToan');
    assert.match(maThat, /'chung\/apDungSoDat\.js',/, 'quên nạp apDungSoDat');
    assert.match(maThat, /self\.HDT_ApDungSoDat\.coKhachDatSo\(trongLich\)/,
        '⛔ không hỏi "có ai đặt số không"');
    assert.match(maThat, /self\.HDT_SoDuKeToan\.docSoDu\(/, '⛔ không đọc số dư');
    assert.match(maThat, /self\.HDT_ApDungSoDat\.truHangCho\(/, '⛔ quên trừ hàng chờ');
    assert.match(maThat, /self\.HDT_ApDungSoDat\.apDung\(/, '⛔ không áp luật');
});

test('⛔⛔ KHÔNG ai đặt số thì KHÔNG được gọi Sell', () => {
    // Lời hứa "khách để trống không kéo theo cách hỏng nào" phải nằm trong CẤU
    // TRÚC mã, không phải chỉ trong lời nói: lời gọi docSoDu bắt buộc nằm TRONG
    // khối `if (coKhachDatSo)`.
    const i = maThat.indexOf('coKhachDatSo(trongLich)');
    const j = maThat.indexOf('HDT_SoDuKeToan.docSoDu(');
    assert.ok(i > 0 && j > i && j - i < 400,
        '⛔ lời gọi đọc số dư nằm NGOÀI cửa "có ai đặt số" — khách để trống cũng bị kéo theo');
});

test('⭐⭐ lỗi khâu số dư phải đi tiếp vào lịch sử và Telegram', () => {
    // ⚠️ BÀI NÀY TỪNG QUÁ LỎNG. Bản đầu chỉ đòi chuỗi `loiDatSo.length` có mặt
    // đâu đó — mà nó còn xuất hiện ở cửa "ngày yên ả" ngay trên. Gài lỗi vô
    // hiệu hoá đúng khối ghép lỗi mà bài vẫn XANH.
    //
    // Nay đòi ĐÚNG HAI DÒNG LIỀN NHAU: cái cửa và câu lệnh nó canh.
    assert.ok(maThat.includes(
        'if (loiDatSo.length) {\n        tra.loi = [...(tra.loi || []), ...loiDatSo.map('),
        '⛔ lỗi khâu số dư KHÔNG được ghép vào kết quả — nó sẽ biến mất khỏi cả '
        + 'lịch sử lẫn Telegram, đúng kiểu hỏng trong im lặng đã mất ba ngày để tìm');
    assert.match(maThat, /maLoi: 'SO_DU_KHONG_DUNG'/, 'không gắn mã lỗi');
});

test('⭐⭐ Sell phải mở đúng đường token cho bảng kế toán', () => {
    const web = fs.readFileSync(
        path.join(__dirname, '..', '..', 'Sell', 'routes', 'web.php'), 'utf8');
    const i = web.indexOf("Route::prefix('api/extension')->middleware('kiemTraApiHoaDon')");
    const j = web.indexOf("/hoa-don/ke-toan-bang");
    assert.ok(i > 0, 'không thấy nhóm route token của extension hóa đơn');
    assert.ok(j > i, '⛔ đường ke-toan-bang KHÔNG nằm trong nhóm token');
    assert.match(web.slice(j - 200, j + 200), /KeToanTongHopController::class, 'apiBang'/,
        'không trỏ vào đúng hàm đang chạy — hai chỗ cùng tính là hai con số');
});

// ────────────────────────────────────────────────────────────────────────────
(async () => {
    console.log('\nTỰ ĐẶT SỐ TIỀN XUẤT MỖI NGÀY\n');
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
