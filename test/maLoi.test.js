'use strict';

// ============================================================================
//  CANH BẢNG MÃ LỖI — chặn hẳn một lớp lỗi đã cắn thật ngày 2026-08-13.
//
//  Chuyện đã xảy ra: thêm `MA.TAB_CAM` bằng một phép thay chuỗi KHÔNG KHỚP nên
//  im lặng không làm gì. `MA.TAB_CAM` thành `undefined`, code trả về
//  `{ ma: undefined }`, hàng đợi làm `(kq.ma) || 'KHONG_RO'` -> rơi về
//  'KHONG_RO' -> TREO oan -> KHÓA HẲN hẹn giờ.
//
//  Và 916 test vẫn xanh, vì bài test viết:
//        assert.strictEqual(kq.ma, MA.TAB_CAM);
//  hai vế đều `undefined` nên bằng nhau. So một hằng số không tồn tại với một
//  giá trị không tồn tại rồi gọi là đạt.
//
//  File này canh đúng hai điều đó, cho MỌI bảng mã trong dự án:
//    1. Mọi giá trị trong bảng MA phải là CHUỖI KHÔNG RỖNG.
//    2. Mọi `MA.X` được dùng trong mã nguồn phải CÓ MẶT trong bảng MA.
// ============================================================================

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { test, ghiChu, chay } = require('./chay');

const GOC = path.join(__dirname, '..');
const doc = (f) => fs.readFileSync(path.join(GOC, f), 'utf8');

// Mọi file có bảng `MA`. Thiếu jsdom cũng nạp được vì đây là logic thuần.
require('../chung/domReact');
const CO_BANG_MA = [
    ['chung/doiTaiKhoan.js', () => require('../chung/doiTaiKhoan').MA],
    ['tendoo/boGio.js', () => require('../tendoo/boGio').MA],
    ['tendoo/bamThanhToan.js', () => require('../tendoo/bamThanhToan').MA],
    ['sell/epHomNay.js', () => require('../sell/epHomNay').MA],
];

ghiChu('— ⭐ Mọi mã lỗi phải TỒN TẠI THẬT —');

for (const [ten, lay] of CO_BANG_MA) {
    test(`⭐ ${ten}: mọi giá trị trong MA là chuỗi không rỗng`, () => {
        const MA = lay();
        assert.ok(MA && typeof MA === 'object', `${ten} không xuất bảng MA`);
        const hong = Object.entries(MA)
            .filter(([, v]) => typeof v !== 'string' || v.trim() === '');
        assert.deepStrictEqual(hong, [],
            `có mã lỗi rỗng/undefined — sẽ rơi về 'KHONG_RO' và treo oan`);
    });

    test(`⭐ ${ten}: mọi MA.X dùng trong file đều CÓ trong bảng MA`, () => {
        const MA = lay();
        const ma = doc(ten);
        // Bỏ phần khai báo bảng để không tự đối chiếu với chính nó.
        const dau = ma.indexOf('const MA = {');
        const cuoi = ma.indexOf('};', dau);
        const than = (dau >= 0 ? ma.slice(0, dau) + ma.slice(cuoi) : ma);
        const dung = new Set((than.match(/\bMA\.([A-Z0-9_]+)\b/g) || [])
            .map(x => x.slice(3)));
        const thieu = [...dung].filter(k => !(k in MA));
        assert.deepStrictEqual(thieu, [],
            `dùng MA.${thieu.join(', MA.')} nhưng bảng MA không có — giá trị sẽ là undefined`);
    });
}

ghiChu('— ⭐ Không mã lỗi nào được trùng giá trị —');

test('⭐ trong một bảng MA, hai tên khác nhau không được cùng một giá trị', () => {
    // Trùng giá trị nghĩa là hai tình huống khác nhau bị gộp làm một ở tầng
    // trên — đúng kiểu sai "SAI_TAI_KHOAN vs KHONG_DOC_DUOC_DANH_TINH" cũ.
    for (const [ten, lay] of CO_BANG_MA) {
        const MA = lay();
        const giaTri = Object.values(MA);
        assert.strictEqual(new Set(giaTri).size, giaTri.length,
            `${ten}: có hai mã lỗi trùng giá trị`);
    }
});

ghiChu('— ⭐ Lỗi TRƯỚC KHI đụng Tendoo KHÔNG được thành TREO —');

test('⭐ hàng đợi phải xét cờ chuaLamGi trước khi treo', () => {
    // TREO nghĩa là "không rõ hóa đơn đã ra chưa" và nó CHẶN HẲN hẹn giờ cho tới
    // khi người dùng tự kết luận. Hỏng trước khi đụng giỏ hàng thì chắc chắn
    // chưa có hóa đơn nào — treo lại là oan.
    const ma = doc('chung/hangDoi.js');
    assert.match(ma, /KET_QUA_KHONG_RO\.has\(ma\)\s*&&\s*!\(kq && kq\.chuaLamGi\)/,
        'treo mà không xét cờ chuaLamGi');
});

test('⭐ cầu nối phải GẮN cờ chuaLamGi cho lỗi ở móc trước mỗi khách', () => {
    const ma = doc('chung/cauNoi.js');
    const than = ma.slice(ma.indexOf('truocMoiKhach'));
    assert.match(than, /chuaLamGi:\s*true/,
        'lỗi đổi tài khoản không được gắn cờ — sẽ treo oan nếu mã lỗi lọt lưới');
});

test('⭐ chạy thật: lỗi có cờ chuaLamGi → LỖI, không phải TREO', async () => {
    const HangDoi = require('../chung/hangDoi');
    const SoGhiDau = require('../chung/soGhiDau');

    const dungHangDoi = async () => {
        let kho = null;
        const so = SoGhiDau.taoSo({ async doc() { return kho; },
                                    async ghi(o) { kho = o; } });
        await so.nap();
        const hd = HangDoi.taoHangDoi({
            so, khoaLuuTru: { async doc() { return null; }, async ghi() {} },
            mayId: 'test', tuyChon: { nguNghi: async () => {}, ngauNhien: () => 0 },
        });
        await hd.xepHang([{ maKH: 'A', tenKH: 'a', soTien: 1000 },
                          { maKH: 'B', tenKH: 'b', soTien: 2000 }]);
        return { so, hd };
    };

    // (a) KHÔNG có cờ -> mã lạ rơi về KHONG_RO -> ghi TREO (nhưng không còn
    //     chặn loạt, xem hangDoi.test.js).
    const t1 = await dungHangDoi();
    const kq1 = await t1.hd.chayLoat(async () => ({ ok: false }));
    assert.strictEqual(t1.so.layLenhTreo().length, 2, 'không ghi lại là treo');
    assert.strictEqual(kq1.loi.length, 0, 'lẽ ra phải là treo, không phải lỗi thường');

    // (b) CÓ cờ -> ghi là lỗi thường, KHÔNG treo, và chạy tiếp khách sau.
    const t2 = await dungHangDoi();
    const kq2 = await t2.hd.chayLoat(async () => ({ ok: false, chuaLamGi: true }));
    assert.strictEqual(t2.so.layLenhTreo().length, 0, 'vẫn treo dù chắc chắn chưa làm gì');
    assert.strictEqual(kq2.loi.length, 2, 'không chạy tiếp khách sau');
    assert.notStrictEqual(kq2.ly_do, 'CO_LENH_TREO');
});

test('⭐ có cờ chuaLamGi nhưng mã lỗi là loại DỪNG CẢ LOẠT → vẫn dừng', async () => {
    // Cờ chỉ đổi "treo hay không treo", KHÔNG được nới lỏng chuyện dừng loạt:
    // sai tài khoản mà chạy tiếp là ra hóa đơn nhầm cửa hàng.
    const HangDoi = require('../chung/hangDoi');
    const SoGhiDau = require('../chung/soGhiDau');
    let kho = null;
    const so = SoGhiDau.taoSo({ async doc() { return kho; }, async ghi(o) { kho = o; } });
    await so.nap();
    const hd = HangDoi.taoHangDoi({
        so, khoaLuuTru: { async doc() { return null; }, async ghi() {} },
        mayId: 'test', tuyChon: { nguNghi: async () => {}, ngauNhien: () => 0 },
    });
    await hd.xepHang([{ maKH: 'A', soTien: 1 }, { maKH: 'B', soTien: 2 }]);
    const kq = await hd.chayLoat(async () => ({
        ok: false, ma: 'SAI_TAI_KHOAN', chuaLamGi: true, thongBao: 'nhầm cửa hàng' }));
    assert.strictEqual(kq.dung, true, 'không dừng loạt dù sai tài khoản');
    assert.strictEqual(so.layLenhTreo().length, 0, 'treo dù chắc chắn chưa làm gì');
});

ghiChu('— ⭐ Tab câm: mã lỗi phải đi tới nơi —');

test('⭐ TAB_CAM là chuỗi thật, không phải undefined', () => {
    const MA = require('../chung/doiTaiKhoan').MA;
    assert.strictEqual(typeof MA.TAB_CAM, 'string');
    assert.ok(MA.TAB_CAM.length > 0);
    assert.strictEqual(typeof MA.TAB_THIEU_BO_PHAN, 'string');
});

test('⭐ lỗi tab câm KHÔNG rơi về KHONG_RO ở hàng đợi', () => {
    const MA = require('../chung/doiTaiKhoan').MA;
    // Đúng phép tính hàng đợi đang làm.
    const ma = ({ ma: MA.TAB_CAM }).ma || 'KHONG_RO';
    assert.strictEqual(ma, 'TAB_CAM', 'mã lỗi rỗng nên bị coi là "không rõ" -> treo oan');
});

chay('BẢNG MÃ LỖI VÀ ĐƯỜNG TREO');
