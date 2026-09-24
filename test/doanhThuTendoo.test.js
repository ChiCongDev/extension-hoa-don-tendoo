'use strict';

// ============================================================================
//  DOANH THU TENDOO — đọc ngược từ Tendoo về, đặt cạnh cột Doanh số.
//
//  Chủ dự án duyệt 22/09/2026. Đường API KHÔNG lấy từ tài liệu (Tendoo không
//  công bố tài liệu nào) mà QUAN SÁT TRỰC TIẾP trên phiên thật cùng ngày:
//
//      POST apiv3.tendoo.vn/e-invoice/v2/invoices/summary
//      { start_time, end_time, filter_date_type:"issued_date",
//        list_status:["published"], reference_type:["order","ecom_order"] }
//   -> { success:true, data:{ sum, total_amount_after_discount, total_count } }
//
//  Đã đối chiếu từng chữ số với màn hình cùng thời điểm:
//      167.790.000 / 167.790.000 / 123
//
//  ── BA ĐIỀU BỘ KIỂM NÀY PHẢI GHIM ──────────────────────────────────────────
//  1. QUY ĐỔI NGÀY. Lệch một tiếng là con số nhảy sang ngày khác mà vẫn trông
//     hợp lý — không ai nhìn ra.
//  2. THẺ KHÔNG ĐƯỢC RÒ. Thẻ ngang mật khẩu; lọt vào log hay lên màn hình là
//     rò cả tài khoản Tendoo.
//  3. VIỆC NÀY KHÔNG ĐƯỢC LÀM HỎNG VIỆC XUẤT HÓA ĐƠN. Đây là ràng buộc nặng
//     nhất: hóa đơn thuế đã phát hành thì không rút lại được.
// ============================================================================

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { test, ghiChu, chay } = require('./chay');

const Doc = require('../chung/docTongTendoo');
const KhoThe = require('../chung/khoThe');
const Quet = require('../chung/quetTendoo');
const CaiDat = require('../chung/caiDat');
const HenGio = require('../chung/henGio');

const GOC = path.join(__dirname, '..');
const doc = (f) => fs.readFileSync(path.join(GOC, f), 'utf8');

// ⚠️ Kho giả PHẢI tuần tự hóa. chrome.storage dựng lại đối tượng mới khi đọc;
// kho giả giữ nguyên tham chiếu thì mọi khẳng định về việc ghi xuống đĩa đều
// rỗng ruột. Đã dính đúng bẫy đó ngày 31/08/2026.
const khoTam = () => {
    let o = null;
    return {
        doc: async () => (o == null ? null : JSON.parse(o)),
        ghi: async (x) => { o = x == null ? null : JSON.stringify(x); },
    };
};

/** Thẻ JWT giả: chỉ phần giữa là thật (JSON base64url), chữ ký là rác. */
function theGia(expGiay) {
    const than = Buffer.from(JSON.stringify({ exp: expGiay }), 'utf8')
        .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return 'eyJhbGciOiJIUzI1NiJ9.' + than + '.chu-ky-rac';
}

const PHAN_HOI_THAT = {
    success: true,
    data: {
        sum: 167790000,
        total_count: 123,
        error_publishing_count: 0, draft_count: 0,
        total_amount_after_discount: 167790000,
        total_adjust_amount20: 0, total_tax_amount: 0,
        is_replaced: { sum: 0 }, no_invoice_order_count: 0,
    },
};

ghiChu('── QUY ĐỔI NGÀY: lệch một tiếng là sai sổ kế toán ──');

test('⭐⭐⭐ một ngày Việt Nam -> đúng cặp mốc UTC mà Tendoo dùng', () => {
    // Đây là con số THẬT trang Tendoo gửi khi chọn 01/09 -> 22/09/2026.
    const k = Quet.khoangNgayVN('2026-09-01');
    assert.strictEqual(k.tu, '2026-08-31T17:00:00.000Z',
        '00:00 giờ VN phải là 17:00Z HÔM TRƯỚC — sai là số nhảy sang ngày khác');
    assert.strictEqual(k.den, '2026-09-01T16:59:59.999Z');
});

test('⭐⭐⭐ khoảng đúng một ngày, không hụt không tràn', () => {
    const k = Quet.khoangNgayVN('2026-09-22');
    const dai = Date.parse(k.den) - Date.parse(k.tu);
    assert.strictEqual(dai, 24 * 3600 * 1000 - 1,
        'khoảng không đúng một ngày -> đếm thiếu hoặc đếm trùng hóa đơn');
});

test('⭐⭐ ngày cuối tháng sang đầu tháng vẫn đúng', () => {
    const k = Quet.khoangNgayVN('2026-10-01');
    assert.strictEqual(k.tu, '2026-09-30T17:00:00.000Z');
});

test('⭐⭐ KHÔNG phụ thuộc múi giờ của máy đang chạy', () => {
    // Máy người dùng đặt sai múi giờ thì con số vẫn phải đúng.
    const cu = process.env.TZ;
    try {
        process.env.TZ = 'America/New_York';
        const a = Quet.khoangNgayVN('2026-09-01');
        process.env.TZ = 'Asia/Tokyo';
        const b = Quet.khoangNgayVN('2026-09-01');
        assert.deepStrictEqual(a, b, 'đổi múi giờ máy mà kết quả đổi theo');
        assert.strictEqual(a.tu, '2026-08-31T17:00:00.000Z');
    } finally { process.env.TZ = cu; }
});

test('ngày hỏng -> null, không đoán bừa', () => {
    for (const x of ['', null, '2026-9-1', 'hôm nay', '20260901']) {
        assert.strictEqual(Quet.khoangNgayVN(x), null, String(x));
    }
});

ghiChu('── BÓC PHẢN HỒI THẬT ──');

test('⭐⭐⭐ bóc đúng ba con số của phản hồi THẬT ngày 22/09/2026', () => {
    const k = Doc.boc(PHAN_HOI_THAT);
    assert.strictEqual(k.ok, true);
    assert.strictEqual(k.doanhThuTruocThue, 167790000);
    assert.strictEqual(k.tongTienDonHang, 167790000);
    assert.strictEqual(k.soLuong, 123);
});

test('⭐⭐⭐ hai con số LỆCH nhau -> phải nêu cờ, không lặng lẽ chọn một cái', () => {
    // Cửa hàng dùng để dò không chiết khấu nên hai số bằng nhau — ngày nào có
    // chiết khấu thật thì chúng lệch, và lúc ấy KHÔNG được đoán.
    const k = Doc.boc({ data: { sum: 200000000,
        total_amount_after_discount: 167790000, total_count: 123 } });
    assert.strictEqual(k.ok, true);
    assert.strictEqual(k.lech, true, 'hai số lệch mà không báo -> ghi sai sổ kế toán');
    assert.strictEqual(k.doanhThuTruocThue, 167790000,
        'phải lấy total_amount_after_discount theo nghĩa của tên gọi');
});

test('⭐⭐ hai số bằng nhau -> không nêu cờ (khỏi báo động giả)', () => {
    assert.strictEqual(Doc.boc(PHAN_HOI_THAT).lech, false);
});

test('⭐⭐⭐ thiếu MỘT trong ba con số -> hỏng CẢ, không lấy tạm phần còn lại', () => {
    const thieu = [
        { sum: 1, total_count: 2 },                              // thiếu doanh thu
        { total_amount_after_discount: 1, total_count: 2 },      // thiếu tổng đơn
        { sum: 1, total_amount_after_discount: 1 },              // thiếu số lượng
    ];
    for (const d of thieu) {
        const k = Doc.boc({ data: d });
        assert.strictEqual(k.ok, false, JSON.stringify(d));
    }
});

test('⭐⭐ số lẻ, số âm, chuỗi, số quá lớn đều bị từ chối', () => {
    const xau = [1.5, -1, '167790000', NaN, Infinity, Number.MAX_SAFE_INTEGER + 2];
    for (const v of xau) {
        const k = Doc.boc({ data: { sum: v,
            total_amount_after_discount: v, total_count: 1 } });
        assert.strictEqual(k.ok, false, String(v));
    }
});

test('phản hồi rỗng / thiếu data -> hỏng, không nổ', () => {
    for (const x of [null, undefined, {}, { data: null }, { data: 5 }]) {
        assert.strictEqual(Doc.boc(x).ok, false);
    }
});

ghiChu('── THẺ RA VÀO: ngang mật khẩu, không được rò ──');

test('⭐⭐⭐ đọc đúng hạn dùng ghi trong thẻ', () => {
    // Thẻ thật quan sát được: cấp 15:54 22/09, hết 15:54 22/10 (~30 ngày).
    const het = Math.floor(Date.UTC(2026, 9, 22, 8, 54, 25) / 1000);
    assert.strictEqual(KhoThe.hanCuaThe(theGia(het)), het * 1000);
});

test('⭐⭐ thẻ không đọc được -> coi như HẾT HẠN, không dùng liều', () => {
    for (const x of [null, '', 'abc', 'a.b', 'a.b.c.d', 'a.khong-phai-base64.c']) {
        assert.strictEqual(KhoThe.hanCuaThe(x), null, String(x));
        assert.strictEqual(KhoThe.conDung(x), false, String(x));
    }
});

test('⭐⭐⭐ thẻ sắp hết hạn bị coi là KHÔNG dùng được (lề an toàn)', () => {
    const nay = Date.now();
    const sapHet = theGia(Math.floor((nay + 60 * 60 * 1000) / 1000));   // còn 1 giờ
    assert.strictEqual(KhoThe.conDung(sapHet, nay), false,
        'nhận một thẻ sắp tắt là lượt quét chết giữa chừng');
    const conLau = theGia(Math.floor((nay + 20 * 24 * 3600 * 1000) / 1000));
    assert.strictEqual(KhoThe.conDung(conLau, nay), true);
});

test('⭐⭐⭐ lietKe() KHÔNG BAO GIỜ trả chuỗi thẻ ra ngoài', async () => {
    // Danh sách này đi thẳng vào DOM của trang Kế toán. Rò ở đây là rò cả kho.
    const kho = khoTam();
    const k = KhoThe.taoKhoThe(kho);
    const the = theGia(Math.floor((Date.now() + 20 * 864e5) / 1000));
    await k.ghi('c?ng', the);
    const ds = await k.lietKe();
    assert.strictEqual(ds.length, 1);
    const chu = JSON.stringify(ds);
    assert.ok(!chu.includes(the), 'lietKe() làm rò nguyên cái thẻ');
    assert.ok(!chu.includes(the.split('.')[1]), 'rò phần thân của thẻ');
    assert.deepStrictEqual(Object.keys(ds[0]).sort(), ['conDung', 'hetHanLuc', 'maKH']);
});

test('⭐⭐ cất rồi đọc lại được, và ghi XUỐNG ĐĨA thật', async () => {
    const kho = khoTam();
    const the = theGia(Math.floor((Date.now() + 20 * 864e5) / 1000));
    await KhoThe.taoKhoThe(kho).ghi('c?ng', the);
    // Bộ MỚI trên cùng cái kho — đúng như tiến trình nền khởi động lại.
    assert.strictEqual(await KhoThe.taoKhoThe(kho).doc('c?ng'), the);
});

test('⭐⭐ thẻ hỏng thì KHÔNG cất — cất vào chỉ để sau lôi ra rồi vứt', async () => {
    const k = KhoThe.taoKhoThe(khoTam());
    for (const x of ['', 'abc', null, 'a.b.c']) {
        assert.strictEqual(await k.ghi('c?ng', x), false, String(x));
    }
});

test('⭐⭐⭐ xóa thẻ rồi thì đọc ra null — dùng khi Tendoo từ chối', async () => {
    const kho = khoTam();
    const k = KhoThe.taoKhoThe(kho);
    await k.ghi('c?ng', theGia(Math.floor((Date.now() + 20 * 864e5) / 1000)));
    await k.xoa('c?ng');
    assert.strictEqual(await KhoThe.taoKhoThe(kho).doc('c?ng'), null,
        'thẻ chết vẫn nằm lại -> lượt sau lại dùng rồi lại bị từ chối');
});

test('⭐⭐ thẻ của khách này KHÔNG lẫn sang khách khác', async () => {
    const kho = khoTam();
    const k = KhoThe.taoKhoThe(kho);
    const a = theGia(Math.floor((Date.now() + 20 * 864e5) / 1000));
    const b = theGia(Math.floor((Date.now() + 19 * 864e5) / 1000));
    await k.ghi('c?ng', a);
    await k.ghi('ki?n', b);
    assert.strictEqual(await k.doc('c?ng'), a);
    assert.strictEqual(await k.doc('ki?n'), b);
    await k.xoa('c?ng');
    assert.strictEqual(await k.doc('ki?n'), b, 'xóa khách này làm mất thẻ khách kia');
});

test('donThe() dọn thẻ đã chết, giữ thẻ còn hạn', async () => {
    const kho = khoTam();
    const k = KhoThe.taoKhoThe(kho);
    await k.ghi('chet', theGia(Math.floor((Date.now() - 864e5) / 1000)));
    await k.ghi('song', theGia(Math.floor((Date.now() + 20 * 864e5) / 1000)));
    assert.strictEqual(await k.donThe(), 1);
    const ds = await KhoThe.taoKhoThe(kho).lietKe();
    assert.deepStrictEqual(ds.map(x => x.maKH), ['song']);
});

ghiChu('── KHOẢNG CÁCH GIỮA HAI LẦN LẤY ──');

test('⭐⭐⭐ gõ nhỏ hơn 15 phút thì KÉO LÊN 15, không nhận', () => {
    // Để "1 phút" lọt là máy quay vòng gõ cửa Tendoo cả ngày rồi bị chặn tốc
    // độ — lúc ấy hỏng lây sang việc XUẤT HÓA ĐƠN.
    for (const v of ['1', '5', '14', 1, 14]) {
        assert.strictEqual(CaiDat.chuanPhutLayLai(v), 15, String(v));
    }
    assert.strictEqual(CaiDat.chuanPhutLayLai('15'), 15);
    assert.strictEqual(CaiDat.chuanPhutLayLai('60'), 60);
});

test('⭐⭐ gõ sai hẳn -> null (dùng mặc định), không nhận số rác', () => {
    for (const v of ['', null, 'abc', '-5', '1.5', '999999']) {
        assert.strictEqual(CaiDat.chuanPhutLayLai(v), null, String(v));
    }
});

test('⭐⭐⭐ denLucQuet: chưa lấy lần nào thì lấy ngay', () => {
    assert.strictEqual(Quet.denLucQuet(null, 60, Date.now()), true);
});

test('⭐⭐⭐ chưa đủ khoảng thì CHƯA lấy lại', () => {
    const nay = 1_800_000_000_000;
    assert.strictEqual(Quet.denLucQuet(nay - 59 * 60000, 60, nay), false);
    assert.strictEqual(Quet.denLucQuet(nay - 60 * 60000, 60, nay), true);
});

test('⭐⭐⭐ khoảng bé tí vẫn bị chặn dưới 15 phút ở BỘ QUÉT nữa', () => {
    // Chặn hai lớp: lúc lưu (chuanPhutLayLai) và lúc chạy. Cài đặt cũ lưu từ
    // trước khi có luật, hoặc ai đó sửa thẳng trong kho, vẫn phải bị chặn.
    const nay = 1_800_000_000_000;
    assert.strictEqual(Quet.denLucQuet(nay - 60000, 1, nay), false,
        'khoảng 1 phút lọt qua -> quay vòng gõ cửa Tendoo');
    assert.strictEqual(Quet.denLucQuet(nay - 15 * 60000, 1, nay), true);
});

ghiChu('── CÀI ĐẶT THEO KHÁCH ──');

test('⭐⭐⭐ bật đọc doanh thu KHÔNG kéo theo bật xuất hóa đơn', () => {
    // Đây là ràng buộc nặng: đọc là chỉ đọc. Bật nhầm một lịch xuất hóa đơn là
    // phát hành hóa đơn thuế mà người dùng không hề yêu cầu.
    const ra = CaiDat.chuanKhach([{
        maKH: 'c?ng', tenKH: 'c?ng',
        batDoanhThuTendoo: true, phutLayLai: '60',
        batHeThong: false, batTuChon: false,
    }], HenGio, '08:00');
    assert.strictEqual(ra[0].batDoanhThuTendoo, true);
    assert.strictEqual(ra[0].phutLayLai, 60);
    assert.notStrictEqual(ra[0].batHeThong, true, 'đọc doanh thu mà bật luôn lịch hệ thống');
    assert.notStrictEqual(ra[0].batTuChon, true, 'đọc doanh thu mà bật luôn lịch tự chọn');
});

test('⭐⭐ không tích thì KHÔNG lưu cờ (bản ghi sạch như cũ)', () => {
    const ra = CaiDat.chuanKhach([{ maKH: 'c?ng', tenKH: 'c?ng' }], HenGio, '08:00');
    assert.ok(!('batDoanhThuTendoo' in ra[0]));
});

test('⭐⭐⭐ cờ chỉ bật khi đúng giá trị true, không nhận "true" hay 1', () => {
    for (const v of ['true', 1, 'on', {}]) {
        const ra = CaiDat.chuanKhach([{ maKH: 'c?ng', batDoanhThuTendoo: v }],
                                     HenGio, '08:00');
        assert.ok(!('batDoanhThuTendoo' in ra[0]), String(v));
    }
});

ghiChu('── QUÉT MỘT KHÁCH ──');

/** Bộ nối giả, ghi lại mọi lời gọi để soi. */
function boNoiGia(tra) {
    const daGoi = [];
    return {
        daGoi,
        layTongHoaDon: async (tu, den) => {
            daGoi.push({ tu, den });
            const r = typeof tra === 'function' ? tra(daGoi.length) : tra;
            if (r instanceof Error) throw r;
            return r;
        },
    };
}

test('⭐⭐⭐ lấy được -> bản ghi đủ ba con số và ngày đúng', async () => {
    const bn = boNoiGia(PHAN_HOI_THAT);
    const kq = await Quet.quetMotKhach({
        khach: { maKH: 'c?ng', tenKH: 'Công' },
        moBoNoi: async () => bn,
        ngayCanLay: ['2026-09-22'],
        dongHo: () => 1_790_000_000_000,
    });
    assert.strictEqual(kq.banGhi.length, 1);
    const b = kq.banGhi[0];
    assert.strictEqual(b.ma_khach_hang, 'c?ng');
    assert.strictEqual(b.ngay, '2026-09-22');
    assert.strictEqual(b.doanh_thu_truoc_thue, 167790000);
    assert.strictEqual(b.so_luong_hoa_don, 123);
    assert.ok(!('loi' in b), 'lấy được mà vẫn ghi lỗi');
    // Gọi đúng khoảng UTC của ngày ấy.
    assert.strictEqual(bn.daGoi[0].tu, '2026-09-21T17:00:00.000Z');
});

test('⭐⭐⭐ CHƯA CÓ THẺ -> ghi dòng lỗi, KHÔNG im lặng để trống', async () => {
    const kq = await Quet.quetMotKhach({
        khach: { maKH: 'c?ng', tenKH: 'Công' },
        moBoNoi: async () => null,
        ngayCanLay: ['2026-09-22', '2026-09-21'],
        dongHo: () => 1_790_000_000_000,
    });
    assert.strictEqual(kq.heThong, 'CHUA_CO_THE');
    assert.strictEqual(kq.banGhi.length, 1, 'chưa có thẻ mà ghi lỗi cho mọi ngày');
    assert.ok(kq.banGhi[0].loi, 'không ghi lý do -> trên trang trống trơn không ai hiểu');
    assert.ok(!('doanh_thu_truoc_thue' in kq.banGhi[0]), 'chưa lấy được mà vẫn kèm số');
});

test('⭐⭐⭐ THẺ CHẾT giữa chừng -> DỪNG HẲN khách này, không gõ cửa tiếp', async () => {
    // Gọi tiếp 30 ngày chỉ để nhận 30 lần từ chối là quấy máy chủ, và dễ bị
    // chặn tốc độ — lúc ấy hỏng lây sang việc xuất hóa đơn.
    const loi = Object.assign(new Error('Phiên Tendoo đã hết hạn'), { ma: 'HET_PHIEN' });
    const bn = boNoiGia(loi);
    const kq = await Quet.quetMotKhach({
        khach: { maKH: 'c?ng' },
        moBoNoi: async () => bn,
        ngayCanLay: ['2026-09-22', '2026-09-21', '2026-09-20'],
        dongHo: () => 1_790_000_000_000,
    });
    assert.strictEqual(bn.daGoi.length, 1, 'thẻ chết rồi vẫn gọi tiếp');
    assert.strictEqual(kq.heThong, 'THE_CHET');
    assert.strictEqual(kq.banGhi.length, 1);
    assert.ok(kq.banGhi[0].loi);
});

test('⭐⭐ MẤT MẠNG -> cũng dừng, ngày sau chắc chắn cũng hỏng', async () => {
    const bn = boNoiGia(Object.assign(new Error('mất mạng'), { ma: 'MAT_MANG' }));
    const kq = await Quet.quetMotKhach({
        khach: { maKH: 'c?ng' }, moBoNoi: async () => bn,
        ngayCanLay: ['2026-09-22', '2026-09-21'], dongHo: () => 1,
    });
    assert.strictEqual(bn.daGoi.length, 1);
    assert.strictEqual(kq.heThong, 'MAT_MANG');
});

test('⭐⭐⭐ một ngày hỏng KHÔNG chặn các ngày còn lại', async () => {
    // Lỗi lẻ của một ngày (máy chủ trả rác) thì vẫn đi tiếp — khác hẳn thẻ chết.
    const bn = boNoiGia((lan) => (lan === 1 ? { data: { sum: 'rác' } } : PHAN_HOI_THAT));
    const kq = await Quet.quetMotKhach({
        khach: { maKH: 'c?ng' }, moBoNoi: async () => bn,
        ngayCanLay: ['2026-09-22', '2026-09-21', '2026-09-20'], dongHo: () => 1,
    });
    assert.strictEqual(bn.daGoi.length, 3, 'một ngày rác mà bỏ luôn các ngày sau');
    assert.strictEqual(kq.banGhi.filter(b => b.loi).length, 1);
    assert.strictEqual(kq.banGhi.filter(b => !b.loi).length, 2);
});

test('⭐⭐⭐ THÔNG BÁO LỖI không bao giờ mang theo thẻ', async () => {
    // Thông báo này đi thẳng vào cơ sở dữ liệu Sell rồi lên màn hình.
    const the = theGia(Math.floor((Date.now() + 20 * 864e5) / 1000));
    const bn = boNoiGia(Object.assign(new Error('Tendoo trả lỗi 500 khi gọi với ' + the),
                                      { ma: 'MAY_CHU_LOI' }));
    const kq = await Quet.quetMotKhach({
        khach: { maKH: 'c?ng' }, moBoNoi: async () => bn,
        ngayCanLay: ['2026-09-22'], dongHo: () => 1,
    });
    const chu = JSON.stringify(kq.banGhi);
    assert.ok(!chu.includes(the), 'thông báo lỗi làm rò thẻ vào cơ sở dữ liệu Sell');
});

ghiChu('── LẤP SỐ LIỆU QUÁ KHỨ ──');

test('⭐⭐ cacNgayCanLay: mới nhất trước, đủ số ngày', () => {
    const ds = Quet.cacNgayCanLay('2026-09-22', 3);
    assert.deepStrictEqual(ds, ['2026-09-22', '2026-09-21', '2026-09-20']);
});

test('⭐⭐ mặc định chỉ lấy hôm nay', () => {
    assert.deepStrictEqual(Quet.cacNgayCanLay('2026-09-22'), ['2026-09-22']);
});

test('⭐⭐ số ngày lùi bị chặn trên, không cho đòi cả nghìn ngày', () => {
    assert.ok(Quet.cacNgayCanLay('2026-09-22', 99999).length <= 400,
        'không chặn -> một lần bấm là vài nghìn lời gọi sang Tendoo');
});

ghiChu('── GIỮ NGUYÊN NẾP CŨ (không được phá) ──');

test('⭐⭐⭐ đường đẩy doanh thu KHÁC đường ghi kết quả xuất hóa đơn', () => {
    const D = require('../chung/dayVeSell');
    assert.strictEqual(D.DUONG_API, '/api/extension/hoa-don/ghi-nhan');
    assert.strictEqual(D.DUONG_DOANH_THU_TENDOO, '/api/extension/hoa-don/doanh-thu-tendoo');
    assert.notStrictEqual(D.DUONG_API, D.DUONG_DOANH_THU_TENDOO,
        'trộn hai đường là số đọc ngược đè lên số xuất hóa đơn');
});

test('⭐⭐⭐ guiCacDong KHÔNG truyền đường thì vẫn về đường cũ', async () => {
    const D = require('../chung/dayVeSell');
    let daGoi = '';
    const fetchGia = async (url) => { daGoi = url; return { ok: true, json: async () => ({ thanh_cong: true }) }; };
    await D.guiCacDong([{ ma_khach_hang: 'x' }],
        { sellUrl: 'http://x', sellToken: 't' }, fetchGia);
    assert.ok(daGoi.endsWith(D.DUONG_API), 'đổi mặc định là mọi kết quả cũ đi sai chỗ');
});

/**
 * Bỏ chú thích để soi MÃ THẬT.
 *
 * ⚠️ Bản đầu của bài kiểm ngay dưới bắt nhầm chính DÒNG CHÚ THÍCH giải thích
 * "không đụng sổ ghi dấu" — đỏ vì lý do sai. Một bài kiểm đỏ vì lý do sai thì
 * còn thấy mà sửa; nguy hiểm hơn là ngày nào đó nó xanh vì lý do sai.
 */
function chiMa(s) {
    return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

test('⭐⭐⭐ bộ quét KHÔNG đụng sổ ghi dấu hay khóa chạy', () => {
    // Ràng buộc nặng nhất: việc đọc không được chen vào việc xuất hóa đơn.
    const s = chiMa(doc('chung/quetTendoo.js'));
    for (const cam of ['soGhiDau', 'hangDoi', 'giuKhoa', 'taoLenh',
                       'layLenhCho', 'doiTaiKhoan']) {
        assert.ok(!s.includes(cam),
            `quetTendoo.js nhắc tới ${cam} — bộ đọc phải đứng hoàn toàn ngoài đường xuất hóa đơn`);
    }
});

test('⭐⭐⭐ bộ quét trong nền LUÔN nhường khi đang xuất hóa đơn', () => {
    const s = doc('background.js');
    const i = s.indexOf('async function quetDoanhThuTendoo');
    assert.ok(i > 0, 'không tìm thấy bộ quét trong nền');
    const than = s.slice(i, i + 3000);
    assert.ok(than.includes('KHOA_KHOA_CHAY') && than.includes('DANG_XUAT_HOA_DON'),
        'bộ quét không kiểm khóa chạy -> chen ngang lượt xuất hóa đơn');
});

test('⭐⭐⭐ chuông quét TÁCH RỜI chuông xuất hóa đơn', () => {
    // Tắt lịch xuất hóa đơn KHÔNG được làm chết việc đọc doanh thu.
    const s = doc('background.js');
    const i = s.indexOf('async function dungLaiBaoThuc');
    const than = s.slice(i, s.indexOf('async function', i + 10));
    assert.ok(!than.includes('TEN_CHUONG_QUET'),
        'chuông quét bị dựng chung với chuông xuất hóa đơn -> tắt lịch là mất luôn');
});

test('⭐⭐⭐ chuông quét không bị XÓA NHẦM khi dựng lại lịch xuất hóa đơn', () => {
    // dungLaiBaoThuc() xóa mọi báo thức "của mình" trước khi dựng lại. Nếu phép
    // lọc ấy nhận nhầm tên chuông quét thì mỗi lần lưu cài đặt là việc đọc
    // doanh thu chết lặng lẽ.
    assert.strictEqual(HenGio.mocTuTen('hdt-quet-tendoo'), null,
        'mocTuTen() nhận nhầm chuông quét là một mốc giờ');
});

test('⭐⭐ phần nền xử lý chuông quét TRƯỚC khi lọc mốc giờ', () => {
    // ⚠️ Phải bỏ chú thích: chính dòng chú thích giải thích "mocTuTen sẽ trả
    // null" đứng TRƯỚC đoạn mã, nên bản đầu của bài kiểm đỏ vì lý do sai.
    const s = chiMa(doc('background.js'));
    const i = s.indexOf('chrome.alarms.onAlarm.addListener');
    assert.ok(i > 0, 'không tìm thấy bộ bắt chuông');
    // Cắt tới HẾT thân hàm thay vì đếm ký tự: đếm ký tự thì thêm vài dòng chú
    // thích là bài kiểm đỏ vì lý do sai — mà chính bản đầu đã dính đúng thế.
    const than = s.slice(i, s.indexOf('\n});', i));
    const iQuet = than.indexOf('TEN_CHUONG_QUET');
    const iMoc = than.indexOf('mocTuTen');
    assert.ok(iQuet >= 0, 'bộ bắt chuông không hề xét chuông quét');
    assert.ok(iMoc >= 0, 'không thấy phép lọc mốc giờ — bài kiểm đang soi nhầm chỗ');
    assert.ok(iQuet < iMoc,
        'xét mốc giờ trước thì chuông quét bị trả về sớm, không bao giờ chạy');
});

ghiChu('── LỜI GỌI GỬI SANG TENDOO: sai một tham số là sai cả sổ ──');

/** Dựng bộ nối thật với fetch giả, bắt lấy đúng thân yêu cầu nó gửi đi. */
async function batThanYeuCau() {
    const BoNoi = require('../tendoo/boNoi');
    let daGui = null;
    const bn = BoNoi.taoBoNoi({
        layToken: async () => 'the-gia',
        goiMang: async (url, o) => {
            daGui = { url, ...o, than: JSON.parse(o.body) };
            return { ok: true, status: 200, json: async () => PHAN_HOI_THAT };
        },
    });
    await bn.layTongHoaDon('2026-09-21T17:00:00.000Z', '2026-09-22T16:59:59.999Z');
    return daGui;
}

test('⭐⭐⭐ CHỈ lấy hóa đơn ĐÃ PHÁT HÀNH, không lấy tab khác', async () => {
    // Bỏ lọc này là tiền của hóa đơn CHƯA phát hành cũng vào sổ kế toán —
    // tức là báo doanh thu cho những tờ chưa hề gửi cơ quan thuế.
    const g = await batThanYeuCau();
    assert.deepStrictEqual(g.than.list_status, ['published'],
        'lọc sai tab -> đếm cả hóa đơn chưa phát hành');
});

test('⭐⭐⭐ tính theo NGÀY PHÁT HÀNH, không phải ngày tạo đơn', async () => {
    // Đơn tạo hôm qua mà phát hành hôm nay thì thuộc về HÔM NAY — đúng như
    // trang Tendoo đang hiện. Lấy nhầm `created_date` là mọi con số lệch ngày.
    const g = await batThanYeuCau();
    assert.strictEqual(g.than.filter_date_type, 'issued_date',
        'tính theo ngày tạo đơn -> hóa đơn bị tính sang ngày khác');
});

test('⭐⭐ gửi đúng khoảng ngày được truyền vào, không tự chế', async () => {
    const g = await batThanYeuCau();
    assert.strictEqual(g.than.start_time, '2026-09-21T17:00:00.000Z');
    assert.strictEqual(g.than.end_time, '2026-09-22T16:59:59.999Z');
});

test('⭐⭐ gọi đúng đường summary, bằng POST, kèm thẻ', async () => {
    const g = await batThanYeuCau();
    assert.ok(g.url.endsWith('/e-invoice/v2/invoices/summary'), g.url);
    assert.strictEqual(g.method, 'POST');
    assert.strictEqual(g.headers.Authorization, 'Bearer the-gia');
});

test('⭐⭐⭐ đường này CHỈ ĐỌC — không đụng đường phát hành hóa đơn', () => {
    // Tendoo có /e-invoice/v2/invoices/viettel/issue và .../batch-issue trong
    // cùng họ. Bộ nối TUYỆT ĐỐI không được biết tới chúng.
    const s = chiMa(doc('tendoo/boNoi.js'));
    // ⚠️ So theo ĐƯỜNG DẪN, không so theo từ lẻ: chuỗi 'issued_date' có chữ
    // 'issue' trong nó, nên bản đầu đỏ vì lý do sai.
    for (const cam of ['/issue', 'batch-issue', 'cancelTransaction',
                       '/cancel', 'adjust-invoice']) {
        assert.ok(!s.includes(cam),
            `boNoi.js nhắc tới "${cam}" — bộ đọc doanh thu không được chạm vào đường phát hành`);
    }
});

ghiChu('── THẺ KHÔNG ĐƯỢC RÒ RA NGOÀI KHO ──');

test('⭐⭐⭐ không file nào ghi thẻ ra console', () => {
    for (const f of ['chung/khoThe.js', 'chung/quetTendoo.js',
                     'sell/chenCotKeToan.js', 'background.js']) {
        const s = doc(f);
        for (const dong of s.split('\n')) {
            if (!/console\.(log|warn|error|info)/.test(dong)) continue;
            assert.ok(!/\bthe\b|token|Token/.test(dong.replace(/\/\/.*$/, '')),
                `${f}: có dòng console nhắc tới thẻ -> ${dong.trim().slice(0, 80)}`);
        }
    }
});

test('⭐⭐⭐ lệnh hỏi tình trạng thẻ CHỈ trả mã khách và hạn', () => {
    const s = doc('background.js');
    const i = s.indexOf("'hdt-tinh-trang-the'");
    assert.ok(i > 0, 'không có lệnh hỏi tình trạng thẻ');
    const than = s.slice(i, i + 400);
    assert.ok(than.includes('lietKe'),
        'phải đi qua lietKe() — hàm duy nhất cam kết không trả chuỗi thẻ');
    assert.ok(!/\.doc\(/.test(than), 'gọi doc() ở đây là trả nguyên thẻ ra ngoài');
});

test('⭐⭐⭐ giao diện KHÔNG bao giờ đọc chuỗi thẻ', () => {
    // Phần nền trả về `trangThaiThe` (mã khách + hạn). Một trường tên trống
    // trơn là `the` trên đường truyền bị CẤM hẳn: nó mời người sửa sau này
    // tưởng trong đó có chuỗi thẻ rồi đem đi hiện lên màn hình.
    const s = chiMa(doc('sell/chenCotKeToan.js'));
    assert.ok(!/\.the\b/.test(s),
        'giao diện đọc một trường tên `the` — phải là trangThaiThe cho rõ nghĩa');
    const n = chiMa(doc('background.js'));
    const i = n.indexOf("'hdt-tinh-trang-the'");
    assert.ok(i > 0);
    assert.ok(!/\bthe:\s/.test(n.slice(i, i + 400)),
        'phần nền trả về một trường tên `the` — dễ bị hiểu nhầm là chuỗi thẻ');
});

test('⭐⭐ nhặt thẻ là VIỆC PHỤ, không được chặn lượt xuất hóa đơn', () => {
    const s = doc('background.js');
    const i = s.indexOf('function nhatTheCua');
    assert.ok(i > 0);
    const than = s.slice(i, i + 900);
    assert.ok(than.includes('catch('), 'nhặt thẻ không nuốt lỗi -> hỏng cả lượt xuất hóa đơn');
    // Gọi mà KHÔNG await: hàm không được khai là async, và nơi gọi không await.
    assert.ok(!/^\s*async function nhatTheCua/m.test(s),
        'nhatTheCua khai async -> dễ bị await rồi làm chậm lượt xuất hóa đơn');
});

ghiChu('── GIAO DIỆN ──');

test('⭐⭐ không có dấu huyền trong khối CSS (đã từng làm chết cả file)', () => {
    const s = doc('sell/chenCotKeToan.js');
    const m = /const KIEU = `([\s\S]*?)`;/.exec(s);
    assert.ok(m, 'không tìm thấy khối CSS');
    assert.ok(!m[1].includes('`'), 'dấu huyền trong chuỗi mẫu -> file chết lúc chạy');
});

test('⭐⭐ manifest: trang Kế toán được nạp đúng một file', () => {
    const m = JSON.parse(doc('manifest.json'));
    const khoi = m.content_scripts.find(c =>
        c.matches.some(x => x.includes('ke-toan-tong-hop')));
    assert.ok(khoi, 'chưa khai trang Kế toán trong manifest');
    // nhipDo trước, đúng nếp mọi nhóm khác: nó giữ MỌI con số thời gian của dự
    // án, và file nào cũng có thể cần tới.
    assert.deepStrictEqual(khoi.js, ['chung/nhipDo.js', 'sell/chenCotKeToan.js']);
    // Phải có cả ba địa chỉ, y như trang Báo cáo khách hàng.
    assert.strictEqual(khoi.matches.length, 3);
});

test('⭐⭐⭐ manifest: KHÔNG đụng vào các khối content script cũ', () => {
    const m = JSON.parse(doc('manifest.json'));
    const cu = m.content_scripts.find(c =>
        c.matches.some(x => x.includes('bao-cao-khach-hang')));
    assert.ok(cu.js.includes('sell/chenCot.js'), 'mất bảng cài đặt cũ');
    assert.ok(!cu.js.includes('sell/chenCotKeToan.js'),
        'nhét file trang Kế toán vào trang Báo cáo -> hai bảng chồng nhau');
    const td = m.content_scripts.find(c => c.matches[0].includes('seller-v3'));
    assert.ok(td.js.includes('tendoo/nhanLenh.js'));
});

ghiChu('── NẠP THẬT PHẦN NỀN: những chỗ đọc mã không kiểm nổi ──');

/**
 * Nạp `background.js` trong node với `self`/`importScripts`/`chrome` giả.
 * Cách này đã dùng ở chayTheoHen.test.js từ 31/08 — nó cho phép GỌI THẬT hàm
 * trong phần nền thay vì chỉ soi chữ trong mã, vốn là thứ dễ xanh vì lý do sai.
 */
function napNen() {
    globalThis.self = globalThis;
    globalThis.importScripts = (...tep) => { for (const t of tep) require(path.join(GOC, t)); };
    const nghe = {};
    const kho = {};
    const chuongDaDat = [];
    const chuongDaXoa = [];
    const tinDaGuiTab = [];
    let traLoiTab = {};

    globalThis.chrome = {
        storage: { local: {
            async get(k) { const r = {}; for (const x of [].concat(k)) if (x in kho) r[x] = kho[x]; return r; },
            async set(o) { Object.assign(kho, o); },
            async remove(k) { for (const x of [].concat(k)) delete kho[x]; },
        } },
        alarms: {
            create: (ten, o) => chuongDaDat.push({ ten, ...o }),
            clear: async (ten) => { chuongDaXoa.push(ten); },
            clearAll: async () => {}, getAll: async () => [],
            onAlarm: { addListener: (f) => { nghe.alarm = f; } },
        },
        tabs: {
            query: async () => [], create: async () => ({ id: 9 }), remove: async () => {},
            get: async (id) => ({ id, status: 'complete', url: 'https://seller-v3.tendoo.vn/sales/pos' }),
            update: async () => {}, reload: async () => {},
            sendMessage: async (id, tin) => { tinDaGuiTab.push(tin); return traLoiTab; },
        },
        runtime: {
            onStartup: { addListener: (f) => { nghe.khoiDong = f; } },
            onInstalled: { addListener: () => {} },
            onMessage: { addListener: (f) => { nghe.tin = f; } },
            getManifest: () => ({ version: 'thu' }),
        },
        action: { setBadgeText: () => {}, setBadgeBackgroundColor: () => {}, setTitle: () => {} },
    };
    require(path.join(GOC, 'background.js'));
    return { nghe, kho, chuongDaDat, chuongDaXoa, tinDaGuiTab,
             datTraLoiTab: (o) => { traLoiTab = o; } };
}

/**
 * Gửi một tin vào phần nền và đợi câu trả lời.
 *
 * ⚠️ Lái qua ĐÚNG CỬA VÀO THẬT (bộ bắt tin, bộ bắt chuông) chứ không gọi thẳng
 * hàm nội bộ — `background.js` nạp bằng require thì hàm của nó nằm trong phạm
 * vi riêng, mà quan trọng hơn: đi qua cửa thật mới chứng minh được đường dây
 * nối đúng, chứ không chỉ chứng minh cái hàm chạy đúng khi gọi tay.
 */
function guiTin(tin) {
    return new Promise((giai) => {
        const xong = NEN.nghe.tin(tin, {}, giai);
        if (xong !== true) giai(undefined);
    });
}

const NEN = napNen();
const nhuongNhip = async (n = 30) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0)); };

test('⭐⭐⭐ chuông quét mang tên KHÔNG bị dungLaiBaoThuc xóa nhầm', async () => {
    // `dungLaiBaoThuc()` xóa mọi báo thức mà `mocTuTen()` nhận ra, rồi dựng
    // lại theo lịch xuất hóa đơn. Đặt tên chuông quét rơi vào khuôn ấy là mỗi
    // lần người dùng bấm Lưu, việc đọc doanh thu chết lặng lẽ.
    //
    // Lái qua CỬA VÀO THẬT: lưu cài đặt có khách bật đọc doanh thu.
    NEN.chuongDaDat.length = 0;
    await guiTin({ loai: 'hdt-dat-cai-dat',
                   henGio: { khach: [{ maKH: 'c?ng', tenKH: 'Công', batDoanhThuTendoo: true }] } });

    const cacTen = NEN.chuongDaDat.map(c => c.ten);
    assert.ok(cacTen.length, 'lưu cài đặt xong mà không dựng chuông quét nào');
    const quet = NEN.chuongDaDat.filter(c => HenGio.mocTuTen(c.ten) === null);
    assert.ok(quet.length,
        `mọi chuông vừa dựng đều bị mocTuTen nhận là mốc giờ (${cacTen.join(', ')}) `
        + '-> dungLaiBaoThuc sẽ xóa sạch, việc đọc doanh thu chết lặng lẽ');
    assert.ok(quet.some(c => c.periodInMinutes > 0), 'chuông quét không lặp lại');

    // ⚠️⚠️ QUAN TRỌNG NHẤT, và là chỗ đã lọt lưới một lượt gài lỗi: chuông
    // dựng ra phải mang ĐÚNG cái tên mà bộ bắt chuông chịu nhận. Đặt một tên,
    // nghe một tên khác thì chuông reo vào hư không — không báo lỗi, không ai
    // biết, cột cứ trống mãi.
    //
    // Kiểm bằng HIỆU ỨNG chứ không so tên: reo đúng cái chuông vừa dựng, rồi
    // xem bộ quét có THẬT SỰ chạy không. So tên thì phải chép hằng số sang đây,
    // mà chép là hai chỗ có thể trôi khỏi nhau.
    delete NEN.kho['hdt-quet-tendoo'];
    delete NEN.kho['hdt-kho-the'];
    for (const c of quet) NEN.nghe.alarm({ name: c.ten });
    await nhuongNhip(60);
    assert.ok(NEN.kho['hdt-quet-tendoo'],
        'reo đúng cái chuông vừa dựng mà bộ quét không hề chạy '
        + '-> tên chuông và tên bộ bắt chuông đang nghe không khớp nhau');
});

test('⭐⭐ không khách nào bật thì XÓA chuông, khỏi quét không công', async () => {
    NEN.chuongDaDat.length = 0; NEN.chuongDaXoa.length = 0;
    await guiTin({ loai: 'hdt-dat-cai-dat',
                   henGio: { khach: [{ maKH: 'c?ng', tenKH: 'Công' }] } });
    const quet = NEN.chuongDaDat.filter(c => HenGio.mocTuTen(c.ten) === null);
    assert.strictEqual(quet.length, 0, 'không ai bật mà vẫn dựng chuông quét');
    assert.ok(NEN.chuongDaXoa.length > 0, 'không xóa chuông cũ -> quét mãi dù đã tắt');
});

test('⭐⭐⭐ ĐỐI CHIẾU CỬA HÀNG trước khi cất thẻ', () => {
    // Cất nhầm thẻ khách A vào ô khách B là sau này đọc ra doanh thu của CỬA
    // HÀNG KHÁC rồi ghi thẳng vào sổ kế toán. Phép so để ở khoThe.cungCuaHang()
    // đúng nếp doiTaiKhoan.canDoiTaiKhoan() — chôn trong phần nền thì không
    // bài kiểm nào chạm tới.
    assert.strictEqual(KhoThe.cungCuaHang('ABC-123', 'ABC-123'), true);
    assert.strictEqual(KhoThe.cungCuaHang('abc-123', 'ABC-123'), true, 'phân biệt hoa thường');
    assert.strictEqual(KhoThe.cungCuaHang(' ABC-123 ', 'ABC-123'), true, 'không cắt khoảng trắng');
    assert.strictEqual(KhoThe.cungCuaHang('ABC-123', 'XYZ-999'), false,
        'cửa hàng khác nhau mà bảo giống -> thẻ khách A vào ô khách B');
    // ⚠️ RỖNG LÀ KHÔNG KHỚP. Tab chưa biết mình ở cửa hàng nào thì thà bỏ lỡ
    // một lần nhặt thẻ, còn hơn cất bừa.
    for (const [a, b] of [['', 'ABC'], ['ABC', ''], ['', ''], [null, null],
                          [undefined, 'ABC'], ['  ', 'ABC']]) {
        assert.strictEqual(KhoThe.cungCuaHang(a, b), false, `${a} / ${b}`);
    }
});

test('⭐⭐⭐ phần nền THẬT SỰ dùng phép đối chiếu ấy khi nhặt thẻ', () => {
    const s = chiMa(doc('background.js'));
    const i = s.indexOf('function nhatTheCua');
    assert.ok(i > 0, 'không tìm thấy chỗ nhặt thẻ');
    const than = s.slice(i, s.indexOf('\n}', i));
    assert.ok(/cungCuaHang\(/.test(than),
        'nhặt thẻ mà không đối chiếu cửa hàng -> thẻ khách A cất vào ô khách B');
    assert.ok(/return;/.test(than), 'đối chiếu xong mà không dừng lại khi lệch');
});

test('⭐⭐⭐ nền QUÉT ĐÚNG những ngày được truyền vào (ngayCanLay + hôm nay)', async () => {
    // Nút "Xem báo cáo" tính ngày thiếu rồi truyền xuống; nền phải quét ĐÚNG
    // các ngày ấy, cộng hôm nay. Bỏ qua ngayCanLay là cột không khớp mốc.
    const KhoMatKhau = require('../chung/khoMatKhau');
    const kho = await KhoMatKhau.taoKho();
    const mo = await KhoMatKhau.moKho(kho);
    await KhoMatKhau.ghiKhach(kho, mo.khoa, 'c?ng', {
        maCuaHang: 'CH', tenDangNhap: '+8490', matKhau: 'mk' });
    NEN.kho['hdt-kho-tai-khoan'] = kho;
    NEN.kho['hdt-cai-dat'] = { henGio: { bat: true, moc: [],
        khach: [{ maKH: 'c?ng', tenKH: 'Công', batDoanhThuTendoo: true }] } };
    delete NEN.kho['hdt-kho-the'];
    delete NEN.kho['hdt-quet-tendoo'];
    const theMoi = theGia(Math.floor((Date.now() + 20 * 864e5) / 1000));
    const ngayDaHoi = [];
    globalThis.fetch = async (url, o) => {
        if (String(url).includes('/auth/login'))
            return { ok: true, status: 200, json: async () => ({ data: { access_token: theMoi } }) };
        if (String(url).includes('/invoices/summary')) {
            ngayDaHoi.push(JSON.parse(o.body).start_time.slice(0, 10));  // mốc UTC ngày trước
            return { ok: true, status: 200, json: async () => PHAN_HOI_THAT };
        }
        return { ok: false, status: 404, json: async () => ({}) };
    };
    try {
        await guiTin({ loai: 'hdt-quet-tendoo-ngay', maKH: ['c?ng'],
                       ngayCanLay: ['2026-07-01', '2026-07-02'], themHomNay: false });
    } finally {
        delete globalThis.fetch; delete NEN.kho['hdt-kho-tai-khoan'];
        delete NEN.kho['hdt-kho-the'];
    }
    // start_time là 17:00Z HÔM TRƯỚC, nên 2026-07-01 -> hỏi mốc 2026-06-30.
    assert.deepStrictEqual(ngayDaHoi.sort(), ['2026-06-30', '2026-07-01'],
        'nền không quét đúng các ngày được truyền -> cột không khớp mốc');
});

test('⭐⭐⭐ bộ quét NHƯỜNG khi khóa xuất hóa đơn đang giữ', async () => {
    NEN.kho['hdt-khoa-dang-chay'] = { mayId: 'ai-do', hetHanLuc: Date.now() + 600000 };
    const kq = await guiTin({ loai: 'hdt-quet-tendoo-ngay', maKH: ['c?ng'] });
    assert.ok(kq && kq.ok, 'lệnh quét không trả lời');
    assert.strictEqual(kq.boQua, 'DANG_XUAT_HOA_DON',
        'quét chen vào lúc đang xuất hóa đơn -> đá nhau với việc quan trọng hơn');
    assert.strictEqual(kq.daQuet, 0);
    delete NEN.kho['hdt-khoa-dang-chay'];
});

test('⭐⭐⭐ chưa có thẻ nhưng CÓ tài khoản -> TỰ ĐĂNG NHẬP API rồi đọc được', async () => {
    // Đây là điều khiến khách cả tháng không xuất hóa đơn vẫn có doanh thu:
    // không đợi lượt xuất hóa đơn nào, tự đăng nhập bằng API trong nền.
    const KhoMatKhau = require('../chung/khoMatKhau');
    const kho = await KhoMatKhau.taoKho();
    const mo = await KhoMatKhau.moKho(kho);
    await KhoMatKhau.ghiKhach(kho, mo.khoa, 'c?ng', {
        maCuaHang: 'CH-CONG', tenDangNhap: '+84379215004', matKhau: 'mk-thu-cong' });
    NEN.kho['hdt-kho-tai-khoan'] = kho;
    NEN.kho['hdt-cai-dat'] = { henGio: { bat: true, moc: [],
        khach: [{ maKH: 'c?ng', tenKH: 'Công', batDoanhThuTendoo: true }] } };
    delete NEN.kho['hdt-kho-the'];

    // Chặn mạng: /auth/login trả thẻ giả còn hạn; /invoices/summary trả số thật.
    const theMoi = theGia(Math.floor((Date.now() + 20 * 864e5) / 1000));
    let daDangNhap = false;
    globalThis.fetch = async (url) => {
        if (String(url).includes('/auth/login')) {
            daDangNhap = true;
            return { ok: true, status: 200,
                     json: async () => ({ data: { access_token: theMoi } }) };
        }
        if (String(url).includes('/invoices/summary')) {
            return { ok: true, status: 200, json: async () => PHAN_HOI_THAT };
        }
        return { ok: false, status: 404, json: async () => ({}) };
    };
    try {
        const kq = await guiTin({ loai: 'hdt-quet-tendoo-ngay', maKH: ['c?ng'] });
        assert.ok(kq && kq.ok, 'lệnh quét không trả lời');
        assert.strictEqual(daDangNhap, true, 'chưa có thẻ mà KHÔNG tự đăng nhập');
        const luuThe = NEN.kho['hdt-kho-the'];
        assert.ok(luuThe && luuThe.the && luuThe.the['c?ng'],
            'đăng nhập xong không cất thẻ -> lần sau lại đăng nhập');
        const so = NEN.kho['hdt-so-ghi-dau'];
        assert.ok(!so || !(so.lenh || []).length, 'việc đọc lại đẻ ra lệnh xuất hóa đơn');
    } finally {
        delete globalThis.fetch;
        delete NEN.kho['hdt-kho-tai-khoan'];
        delete NEN.kho['hdt-kho-the'];
    }
});

test('⭐⭐ device_id ỔN ĐỊNH — hai lần đăng nhập mang cùng một id', async () => {
    // device_id đổi mỗi lần đăng nhập -> Tendoo coi là thiết bị mới liên tục,
    // có thể gửi cảnh báo đăng nhập hoặc đụng giới hạn thiết bị. Phải cố định.
    // Kiểm QUA HÀNH VI: bắt device_id trong thân yêu cầu đăng nhập, chạy hai
    // lượt (xóa thẻ giữa chừng để buộc đăng nhập lại), so hai id.
    const KhoMatKhau = require('../chung/khoMatKhau');
    const kho = await KhoMatKhau.taoKho();
    const mo = await KhoMatKhau.moKho(kho);
    await KhoMatKhau.ghiKhach(kho, mo.khoa, 'c?ng', {
        maCuaHang: 'CH-CONG', tenDangNhap: '+84379215004', matKhau: 'mk' });
    NEN.kho['hdt-kho-tai-khoan'] = kho;
    NEN.kho['hdt-cai-dat'] = { henGio: { bat: true, moc: [],
        khach: [{ maKH: 'c?ng', tenKH: 'Công', batDoanhThuTendoo: true }] } };
    delete NEN.kho['hdt-device-id'];
    const theMoi = theGia(Math.floor((Date.now() + 20 * 864e5) / 1000));
    const idDaGui = [];
    globalThis.fetch = async (url, o) => {
        if (String(url).includes('/auth/login')) {
            idDaGui.push(JSON.parse(o.body).device_id);
            return { ok: true, status: 200, json: async () => ({ data: { access_token: theMoi } }) };
        }
        return { ok: true, status: 200, json: async () => PHAN_HOI_THAT };
    };
    try {
        await guiTin({ loai: 'hdt-quet-tendoo-ngay', maKH: ['c?ng'] });
        delete NEN.kho['hdt-kho-the'];                 // buộc lượt sau đăng nhập lại
        await guiTin({ loai: 'hdt-quet-tendoo-ngay', maKH: ['c?ng'] });
    } finally {
        delete globalThis.fetch;
        delete NEN.kho['hdt-kho-tai-khoan'];
        delete NEN.kho['hdt-kho-the'];
    }
    assert.strictEqual(idDaGui.length, 2, 'không đăng nhập đủ hai lần');
    assert.ok(idDaGui[0], 'không gửi device_id');
    assert.strictEqual(idDaGui[0], idDaGui[1],
        'device_id đổi giữa hai lần -> Tendoo thấy thiết bị mới mỗi lần');
});

test('⭐⭐⭐ khách chưa có thẻ -> ghi dòng lỗi, KHÔNG xuất hóa đơn nào', async () => {
    // Đường chạy ĐẦY ĐỦ qua phần nền: chưa có thẻ VÀ chưa khai tài khoản, nên
    // tự-đăng-nhập trả null ngay (không gọi mạng), bản ghi phải mang lý do, và
    // tuyệt đối không có lệnh xuất hóa đơn nào được sinh ra.
    delete NEN.kho['hdt-kho-tai-khoan'];
    delete NEN.kho['hdt-kho-the'];
    NEN.kho['hdt-cai-dat'] = { henGio: { bat: true, moc: [],
        khach: [{ maKH: 'c?ng', tenKH: 'Công', batDoanhThuTendoo: true }] } };
    const kq = await guiTin({ loai: 'hdt-quet-tendoo-ngay', maKH: ['c?ng'] });
    assert.ok(kq && kq.ok, 'lệnh quét không trả lời');
    assert.strictEqual(kq.daQuet, 1);
    assert.ok(kq.daGui >= 1, 'chưa có thẻ mà không ghi dòng lý do nào');
    // ⛔ Sổ lệnh xuất hóa đơn phải SẠCH TRƠN.
    const so = NEN.kho['hdt-so-ghi-dau'];
    assert.ok(!so || !(so.lenh || []).length,
        'việc ĐỌC doanh thu lại sinh ra lệnh trong sổ xuất hóa đơn');
});

test('⭐⭐ lệnh hỏi tình trạng thẻ chạy được và không kèm thẻ', async () => {
    const kq = await guiTin({ loai: 'hdt-tinh-trang-the' });
    assert.ok(kq && kq.ok, 'lệnh không trả lời');
    assert.ok(Array.isArray(kq.trangThaiThe));
    assert.ok(!('the' in kq), 'câu trả lời có trường tên `the`');
});

ghiChu('── GIAO DIỆN: lái bảng cài đặt THẬT bằng jsdom ──');

const { JSDOM } = require(process.env.HDT_JSDOM || 'jsdom');
const ChenCotKeToan = require('../sell/chenCotKeToan');

/**
 * Dựng một trang Kế toán tối giản và mở hộp cài đặt THẬT.
 *
 * ⚠️ Phải lái qua giao diện thật chứ không soi chữ trong mã: hai lỗ hổng lọt
 * lưới ngày 22/09 đều nằm ở chỗ hộp này ĐỌC và GỬI cài đặt sai đường
 * (`khach` thay vì `henGio.khach`) — bấm Lưu mà không lưu được gì, và bảng
 * thì luôn trống. Soi chữ không bắt được, lái tay mới bắt được.
 */
async function moBangCaiDat(khachDangLuu) {
    const dom = new JSDOM('<!doctype html><html><body>'
        + '<div><button>Xuất CSV</button></div></body></html>');
    const cua = dom.window;
    const daGui = [];
    cua.chrome = {
        runtime: {
            sendMessage: async (tin) => {
                daGui.push(tin);
                if (tin.loai === 'hdt-hoi-cai-dat') {
                    // Hình dạng THẬT của cài đặt: khách nằm trong henGio.khach.
                    return { henGio: { bat: true, moc: [], khach: khachDangLuu } };
                }
                if (tin.loai === 'hdt-tinh-trang-the') return { ok: true, trangThaiThe: [] };
                return { ok: true };
            },
        },
    };
    await ChenCotKeToan.moHop(cua.document);
    return { cua, tailieu: cua.document, daGui };
}

ghiChu('── "XEM BÁO CÁO" TỰ LẤY KHỚP MỐC THỜI GIAN ──');

test('⭐⭐⭐ cacNgayTrong liệt kê đúng các ngày trong khoảng', () => {
    assert.deepStrictEqual(
        ChenCotKeToan.cacNgayTrong('2026-09-20', '2026-09-23'),
        ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23']);
    // Một ngày.
    assert.deepStrictEqual(ChenCotKeToan.cacNgayTrong('2026-09-23', '2026-09-23'),
        ['2026-09-23']);
    // Qua đầu tháng.
    assert.deepStrictEqual(ChenCotKeToan.cacNgayTrong('2026-08-31', '2026-09-01'),
        ['2026-08-31', '2026-09-01']);
    // den < tu, hoặc ngày hỏng -> rỗng, không nổ.
    assert.deepStrictEqual(ChenCotKeToan.cacNgayTrong('2026-09-23', '2026-09-20'), []);
    assert.deepStrictEqual(ChenCotKeToan.cacNgayTrong('bậy', '2026-09-20'), []);
});

/**
 * Dựng trang Kế toán có nút "Xem báo cáo" + fetch api/bang giả, rồi bấm nút.
 * Trả về mọi tin đã gửi lên nền để soi lệnh quét.
 */
function dungTrangXem({ ky = 'tuy_chon', tu = '2026-09-20', den = '2026-09-23',
                        ngayDaCo = {}, khachBat = ['c?ng'] } = {}) {
    const dom = new JSDOM('<!doctype html><html><body>'
        + '<select id="ktKy"><option value="tuy_chon" selected>Tùy chọn</option></select>'
        + `<input id="ktTuNgay" value="${tu}">`
        + `<input id="ktDenNgay" value="${den}">`
        + '<input id="ktMotNgay" value="">'
        + '<button id="ktXem">Xem báo cáo</button>'
        + '<button>Xuất CSV</button></body></html>');
    const cua = dom.window;
    const daGui = [];
    const dtt = {};
    for (const [id, ds] of Object.entries(ngayDaCo)) dtt[id] = { ngay_da_co: ds };
    cua.fetch = async () => ({ ok: true, json: async () => ({
        thanh_cong: true,
        thoi_gian: { tu_ngay_iso: tu, den_ngay_iso: den },
        doanh_thu_tendoo: dtt,
    }) });
    cua.chrome = { runtime: { sendMessage: async (tin) => {
        daGui.push(tin);
        if (tin.loai === 'hdt-hoi-cai-dat') {
            return { henGio: { khach: khachBat.map(m => ({ maKH: m, batDoanhThuTendoo: true })) } };
        }
        if (tin.loai === 'hdt-quet-tendoo-ngay') return { ok: true, daQuet: 1, daGui: 1 };
        return { ok: true };
    } } };
    ChenCotKeToan.ganXemBaoCao(cua.document);
    return { cua, tailieu: cua.document, daGui };
}

const doiNhip = (cua, n = 40) => new Promise((giai) => {
    let i = 0;
    const b = () => (++i >= n ? giai() : cua.setTimeout(b, 0));
    cua.setTimeout(b, 0);
});

test('⭐⭐⭐ bấm "Xem báo cáo" -> quét đúng NGÀY THIẾU + hôm nay', async () => {
    // 20-23/09, khách đã có 20 và 21 -> chỉ thiếu 22, 23. themHomNay=true.
    const { cua, tailieu, daGui } = dungTrangXem({
        tu: '2026-09-20', den: '2026-09-23',
        ngayDaCo: { 'c?ng': ['2026-09-20', '2026-09-21'] } });
    tailieu.getElementById('ktXem').click();
    await doiNhip(cua);
    const quet = daGui.find(t => t.loai === 'hdt-quet-tendoo-ngay');
    assert.ok(quet, 'bấm Xem báo cáo mà không gửi lệnh quét');
    assert.deepStrictEqual(quet.ngayCanLay.sort(), ['2026-09-22', '2026-09-23'],
        'lấy lại cả ngày đã có -> dội Tendoo; hoặc bỏ sót ngày thiếu');
    assert.strictEqual(quet.themHomNay, true, 'không lấy lại hôm nay -> số hôm nay cũ');
    assert.deepStrictEqual(quet.maKH, ['c?ng']);
});

test('⭐⭐⭐ mọi ngày đã có -> vẫn quét (nhờ themHomNay lấy lại hôm nay)', async () => {
    const { cua, tailieu, daGui } = dungTrangXem({
        tu: '2026-09-22', den: '2026-09-23',
        ngayDaCo: { 'c?ng': ['2026-09-22', '2026-09-23'] } });
    tailieu.getElementById('ktXem').click();
    await doiNhip(cua);
    const quet = daGui.find(t => t.loai === 'hdt-quet-tendoo-ngay');
    assert.ok(quet, 'không gửi lệnh quét');
    assert.deepStrictEqual(quet.ngayCanLay, [], 'không có ngày thiếu mà vẫn liệt kê ngày');
    assert.strictEqual(quet.themHomNay, true, 'phải dựa themHomNay để lấy lại hôm nay');
});

test('⭐⭐⭐ KHÔNG khách nào bật -> KHÔNG gọi gì, không phiền Tendoo', async () => {
    const { cua, tailieu, daGui } = dungTrangXem({ khachBat: [] });
    tailieu.getElementById('ktXem').click();
    await doiNhip(cua);
    assert.ok(!daGui.some(t => t.loai === 'hdt-quet-tendoo-ngay'),
        'không ai bật mà vẫn quét Tendoo');
});

test('⭐⭐⭐ chỉ quét khách ĐÃ BẬT, bỏ khách tắt', async () => {
    // Có khách bật và khách tắt cùng lúc -> chỉ gửi mã khách bật lên nền.
    const dom = new JSDOM('<!doctype html><html><body>'
        + '<input id="ktTuNgay" value="2026-09-23"><input id="ktDenNgay" value="2026-09-23">'
        + '<input id="ktMotNgay" value=""><button id="ktXem">Xem</button></body></html>');
    const cua = dom.window;
    const daGui = [];
    cua.fetch = async () => ({ ok: true, json: async () => ({
        thoi_gian: { tu_ngay_iso: '2026-09-23', den_ngay_iso: '2026-09-23' },
        doanh_thu_tendoo: {} }) });
    cua.chrome = { runtime: { sendMessage: async (tin) => {
        daGui.push(tin);
        if (tin.loai === 'hdt-hoi-cai-dat') return { henGio: { khach: [
            { maKH: 'c?ng', batDoanhThuTendoo: true },
            { maKH: 'ki?n', batDoanhThuTendoo: false },   // TẮT
            { maKH: 'hoa' },                               // chưa đặt = tắt
        ] } };
        return { ok: true };
    } } };
    ChenCotKeToan.ganXemBaoCao(cua.document);
    cua.document.getElementById('ktXem').click();
    await doiNhip(cua);
    const quet = daGui.find(t => t.loai === 'hdt-quet-tendoo-ngay');
    assert.ok(quet, 'không gửi lệnh quét');
    assert.deepStrictEqual(quet.maKH, ['c?ng'],
        'quét cả khách chưa bật -> phiền Tendoo và đăng nhập tài khoản không cần');
});

test('⭐⭐⭐ bấm DỒN khi đang quét -> chỉ quét MỘT lần', async () => {
    // Người dùng bấm "Xem báo cáo" hai lần nhanh. Lần hai khi lần một chưa xong
    // phải bị bỏ qua, không quét chồng (dội Tendoo, đăng nhập trùng).
    let lanQuet = 0;
    let nhaQuet;
    const choQuet = new Promise((r) => { nhaQuet = r; });
    const dom = new JSDOM('<!doctype html><html><body>'
        + '<input id="ktTuNgay" value="2026-09-23"><input id="ktDenNgay" value="2026-09-23">'
        + '<input id="ktMotNgay" value=""><button id="ktXem">Xem</button></body></html>');
    const cua = dom.window;
    cua.fetch = async () => ({ ok: true, json: async () => ({
        thoi_gian: { tu_ngay_iso: '2026-09-23', den_ngay_iso: '2026-09-23' },
        doanh_thu_tendoo: {} }) });
    cua.chrome = { runtime: { sendMessage: async (tin) => {
        if (tin.loai === 'hdt-hoi-cai-dat') return { henGio: { khach: [{ maKH: 'c?ng', batDoanhThuTendoo: true }] } };
        if (tin.loai === 'hdt-quet-tendoo-ngay') { lanQuet++; await choQuet; return { ok: true, daQuet: 1 }; }
        return { ok: true };
    } } };
    ChenCotKeToan.ganXemBaoCao(cua.document);
    const nut = cua.document.getElementById('ktXem');
    nut.click();                       // lần 1 -> bắt đầu quét, kẹt ở choQuet
    await doiNhip(cua, 10);
    nut.click();                       // lần 2 -> phải bị dangQuet chặn
    await doiNhip(cua, 10);
    nhaQuet({});                       // thả lần 1 chạy tiếp
    await doiNhip(cua, 40);
    assert.strictEqual(lanQuet, 1,
        'bấm dồn mà quét ' + lanQuet + ' lần -> không chống bấm dồn');
});

test('⭐⭐⭐ lần bấm để LÀM MỚI (do mình) KHÔNG quét lại -> chống vòng lặp', async () => {
    let lanQuet = 0;
    const dom = new JSDOM('<!doctype html><html><body>'
        + '<input id="ktTuNgay" value="2026-09-23"><input id="ktDenNgay" value="2026-09-23">'
        + '<input id="ktMotNgay" value=""><button id="ktXem">Xem</button></body></html>');
    const cua = dom.window;
    cua.fetch = async () => ({ ok: true, json: async () => ({
        thoi_gian: { tu_ngay_iso: '2026-09-23', den_ngay_iso: '2026-09-23' },
        doanh_thu_tendoo: {} }) });
    cua.chrome = { runtime: { sendMessage: async (tin) => {
        if (tin.loai === 'hdt-hoi-cai-dat') return { henGio: { khach: [{ maKH: 'c?ng', batDoanhThuTendoo: true }] } };
        if (tin.loai === 'hdt-quet-tendoo-ngay') { lanQuet++; return { ok: true, daQuet: 1 }; }
        return { ok: true };
    } } };
    ChenCotKeToan.ganXemBaoCao(cua.document);
    cua.document.getElementById('ktXem').click();   // người dùng bấm
    await doiNhip(cua, 80);
    assert.strictEqual(lanQuet, 1,
        lanQuet === 0 ? 'không quét lần nào' : 'quét ' + lanQuet + ' lần -> vòng lặp: '
        + 'lần bấm làm-mới của chính mình lại kích hoạt quét');
});

test('⭐⭐⭐ bảng cài đặt ĐỌC được danh sách khách (không trống trơn)', async () => {
    const { tailieu } = await moBangCaiDat([
        { maKH: 'c?ng', tenKH: 'Công', batDoanhThuTendoo: true, phutLayLai: 60 },
        { maKH: 'ki?n', tenKH: 'Kiên' },
    ]);
    const hang = tailieu.querySelectorAll('#hdt-hop-dt-tendoo tbody tr[data-ma]');
    assert.strictEqual(hang.length, 2,
        'không đọc được khách -> bảng trống, người dùng không bật được cho ai');
    assert.strictEqual(hang[0].querySelector('[data-o="bat"]').checked, true,
        'khách đã bật mà ô tích không được đánh dấu');
    assert.strictEqual(hang[1].querySelector('[data-o="bat"]').checked, false);
});

test('⭐⭐⭐ bấm Lưu gửi ĐÚNG ĐƯỜNG henGio.khach, không phải khach', async () => {
    // Gửi sai đường là `caiDat.gop()` bỏ qua hoàn toàn: bấm Lưu, thấy báo
    // "Đã lưu", mà thực ra không có gì được lưu.
    const { tailieu, daGui } = await moBangCaiDat([
        { maKH: 'c?ng', tenKH: 'Công' },
    ]);
    const hang = tailieu.querySelector('#hdt-hop-dt-tendoo tr[data-ma]');
    hang.querySelector('[data-o="bat"]').checked = true;
    hang.querySelector('[data-o="phut"]').value = '45';
    tailieu.querySelector('#hdt-hop-dt-tendoo [data-viec="luu"]').click();
    for (let i = 0; i < 30; i++) await new Promise(r => setTimeout(r, 0));

    const luu = daGui.filter(t => t.loai === 'hdt-dat-cai-dat').pop();
    assert.ok(luu, 'bấm Lưu mà không gửi gì');
    assert.ok(luu.henGio && Array.isArray(luu.henGio.khach),
        'gửi sai đường: caiDat.gop() chỉ đọc henGio.khach, gửi kiểu khác là MẤT TRẮNG');
    assert.ok(!('khach' in luu), 'còn gửi kèm `khach` ở tầng ngoài — thừa và gây hiểu nhầm');
    const k = luu.henGio.khach[0];
    assert.strictEqual(k.batDoanhThuTendoo, true);
    assert.strictEqual(k.phutLayLai, '45');
    assert.strictEqual(k.maKH, 'c?ng', 'mất mã khách');
});

test('⭐⭐⭐ Lưu GIỮ NGUYÊN mọi cài đặt khác của khách', async () => {
    // Gửi thiếu một trường là chuanKhach() hiểu thành "người dùng bỏ trường
    // đó" — tức là TẮT LỊCH XUẤT HÓA ĐƠN của khách mà không ai cố ý.
    const goc = { maKH: 'c?ng', tenKH: 'Công', moc: '09:00', mocTien: '15:00',
                  soTienNgay: 5000000, batHeThong: true, batTuChon: true,
                  soNgayTuChon: 7, batDauTuChon: '2026-09-01' };
    const { tailieu, daGui } = await moBangCaiDat([goc]);
    tailieu.querySelector('#hdt-hop-dt-tendoo [data-viec="luu"]').click();
    for (let i = 0; i < 30; i++) await new Promise(r => setTimeout(r, 0));
    const k = daGui.filter(t => t.loai === 'hdt-dat-cai-dat').pop().henGio.khach[0];
    for (const truong of Object.keys(goc)) {
        assert.strictEqual(k[truong], goc[truong],
            `bấm Lưu làm mất "${truong}" -> đổi cả lịch xuất hóa đơn thuế của khách`);
    }
});

test('⭐⭐ nút được chèn cạnh "Xuất CSV", không phá bố cục', async () => {
    const dom = new JSDOM('<!doctype html><html><body>'
        + '<div id="thanh"><button>Xuất CSV</button></div></body></html>');
    const tailieu = dom.window.document;
    assert.strictEqual(ChenCotKeToan.chenNut(tailieu), true);
    const nut = tailieu.getElementById('hdt-nut-dt-tendoo');
    assert.ok(nut, 'không chèn được nút');
    assert.strictEqual(nut.parentElement.id, 'thanh');
    // Chèn hai lần không đẻ ra hai nút.
    assert.strictEqual(ChenCotKeToan.chenNut(tailieu), false);
    assert.strictEqual(tailieu.querySelectorAll('#hdt-nut-dt-tendoo').length, 1);
});

test('⭐⭐ không thấy thanh công cụ thì THÔI, không nhét bừa', async () => {
    // Sell đổi giao diện -> thà thiếu một nút còn hơn làm vỡ bảng của họ.
    const dom = new JSDOM('<!doctype html><html><body><div>trang lạ</div></body></html>');
    assert.strictEqual(ChenCotKeToan.chenNut(dom.window.document), false);
    assert.strictEqual(dom.window.document.getElementById('hdt-nut-dt-tendoo'), null);
});

ghiChu('── GIAO DIỆN (tiếp) ──');

test('⭐ con số thời gian lấy từ nhipDo, không viết cứng trong file giao diện', () => {
    // nhipDo.js là nơi giữ MỌI con số thời gian của dự án — viết cứng rải rác
    // đúng là thói quen mà file kia sinh ra để dẹp.
    const nd = require('../chung/nhipDo');
    assert.ok(Number.isInteger(nd.HAN_CHO_THANH_CONG_CU) && nd.HAN_CHO_THANH_CONG_CU > 0,
        'nhipDo chưa khai HAN_CHO_THANH_CONG_CU');
    const s = chiMa(doc('sell/chenCotKeToan.js'));
    assert.ok(s.includes('HAN_CHO_THANH_CONG_CU'),
        'file giao diện viết cứng con số thời gian thay vì lấy từ nhipDo');
});

test('⭐⭐ phiên bản đã tăng', () => {
    const m = JSON.parse(doc('manifest.json'));
    assert.ok(m.version > '2.40.0', 'quên tăng phiên bản -> Chrome không nạp bản mới');
});

chay('DOANH THU TENDOO — đọc ngược từ Tendoo về (22/09/2026)');
