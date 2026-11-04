'use strict';

// KHÓA CHỐNG CHẠY CHỒNG PHẢI ĐƯỢC GIA HẠN TRONG LÚC MỘT KHÁCH ĐANG CHẠY.
// Chạy: node test/khoaHangDoiGiaHan.test.js
//
// ── VÌ SAO ──────────────────────────────────────────────────────────────────
// 03/11/2026 hạn chờ của máy được nâng lên (30 giây ở mỗi chốt, ~80 giây ở bước
// Xác nhận). Một khách gặp Tendoo chậm ở nhiều bước có thể chạy QUÁ 2 PHÚT, mà
// khóa chỉ được gia hạn TRƯỚC mỗi khách. Khóa hết hạn giữa chừng thì lượt thứ hai
// (chuông hẹn giờ 5 phút/lần, hoặc bấm chạy tay) có thể chạy SONG SONG trên cùng
// tab Tendoo -> hóa đơn trùng.

const assert = require('node:assert');
const { test, ghiChu, chay } = require('./chay');
const SoGhiDau = require('../chung/soGhiDau');
const HangDoi = require('../chung/hangDoi');
const NhipDo = require('../chung/nhipDo');

function taoODia() {
    let noiDung = null;
    return { luuTru: {
        async doc() { return noiDung ? JSON.parse(JSON.stringify(noiDung)) : null; },
        async ghi(o) { noiDung = o ? JSON.parse(JSON.stringify(o)) : null; },
    } };
}
function taoKhoaLuuTru() {
    let khoa = null;
    return { async doc() { return khoa; }, async ghi(o) { khoa = o; }, xem: () => khoa };
}

/** Đồng hồ giả + bộ hẹn giờ giả: test tự quyết lúc nào "một nhịp trôi qua". */
function taoDongHoGia() {
    let bay = 1_000_000_000_000;
    const cacNhip = new Map();
    let dem = 0;
    return {
        dongHo: () => bay,
        troi: (ms) => { bay += ms; },
        datNhip: (ham, ms) => { const id = ++dem; cacNhip.set(id, { ham, ms }); return id; },
        huyNhip: (id) => { cacNhip.delete(id); },
        soNhipDangChay: () => cacNhip.size,
        /** Mô phỏng một nhịp gia hạn kêu. */
        keuNhip: async () => { for (const { ham } of [...cacNhip.values()]) await ham(); },
        nhip: () => [...cacNhip.values()].map(x => x.ms),
    };
}

async function dung({ khoa, mayId = 'may-1', dh }) {
    const so = SoGhiDau.taoSo(taoODia().luuTru, { dongHo: dh.dongHo });
    await so.nap();
    const hd = HangDoi.taoHangDoi({
        so, khoaLuuTru: khoa, mayId,
        tuyChon: { nguNghi: async () => {}, ngauNhien: () => 0, dongHo: dh.dongHo,
                   datNhip: dh.datNhip, huyNhip: dh.huyNhip },
    });
    return { so, hd };
}

ghiChu('— khóa được gia hạn khi một khách chạy lâu —');

test('⭐⭐ khách chạy quá hạn khóa (2 phút) mà khóa VẪN CÒN, nhờ gia hạn theo nhịp', async () => {
    const dh = taoDongHoGia(); const khoa = taoKhoaLuuTru();
    const { so, hd } = await dung({ khoa, dh });
    await so.taoLenh({ maKH: 'PA', tenKH: 'Phương Anh', soTien: 1000000 });

    let hetHanTrongLucChay = null;
    await hd.chayLoat(async () => {
        // Khách này chạy 5 phút (gấp hơn hai lần hạn khóa), cứ 30 giây một nhịp kêu.
        for (let i = 0; i < 10; i++) { dh.troi(30_000); await dh.keuNhip(); }
        hetHanTrongLucChay = khoa.xem().hetHanLuc;
        return { ok: true, ketQua: { tong: 1000000, lech: 0, soCai: 1, soLoai: 1 } };
    });
    // Tại thời điểm cuối cùng của khách, khóa còn hạn tới tương lai — không bị hết giữa chừng.
    assert.ok(hetHanTrongLucChay > dh.dongHo(),
        'khóa đã HẾT HẠN giữa lúc khách đang chạy — lượt thứ hai có thể chen vào');
});

test('⭐⭐ KHÔNG gia hạn thì khóa hết hạn giữa chừng (chứng minh test có nghĩa)', async () => {
    const dh = taoDongHoGia(); const khoa = taoKhoaLuuTru();
    const { so, hd } = await dung({ khoa, dh });
    await so.taoLenh({ maKH: 'PA', tenKH: 'Phương Anh', soTien: 1000000 });
    let hetHan = null;
    await hd.chayLoat(async () => {
        dh.troi(5 * 60_000);                 // 5 phút trôi qua, KHÔNG nhịp nào kêu
        hetHan = khoa.xem().hetHanLuc;
        return { ok: true, ketQua: { tong: 1000000, lech: 0, soCai: 1, soLoai: 1 } };
    });
    assert.ok(hetHan <= dh.dongHo(), 'khóa phải hết hạn nếu không ai gia hạn');
});

test('⭐ nhịp gia hạn mặc định là 30 giây, và nhỏ hơn hạn khóa', () => {
    assert.strictEqual(NhipDo.NHIP_GIA_HAN_KHOA_MS, 30000);
    assert.ok(NhipDo.NHIP_GIA_HAN_KHOA_MS * 2 < HangDoi.HAN_KHOA_MAC_DINH,
        'nhịp gia hạn phải dư dả so với hạn khóa');
});
test('⭐ chayLoat đặt nhịp đúng chu kỳ cấu hình', async () => {
    const dh = taoDongHoGia(); const khoa = taoKhoaLuuTru();
    const { so, hd } = await dung({ khoa, dh });
    await so.taoLenh({ maKH: 'PA', tenKH: 'Phương Anh', soTien: 1000000 });
    let nhip = null;
    await hd.chayLoat(async () => { nhip = dh.nhip(); return { ok: true, ketQua: { tong: 1000000, lech: 0, soCai: 1, soLoai: 1 } }; });
    assert.deepStrictEqual(nhip, [NhipDo.NHIP_GIA_HAN_KHOA_MS]);
});

ghiChu('— dọn nhịp, và KHÔNG ghi đè khóa của máy khác —');

test('⭐⭐ khách xong → nhịp bị HỦY (không rò hẹn giờ)', async () => {
    const dh = taoDongHoGia(); const khoa = taoKhoaLuuTru();
    const { so, hd } = await dung({ khoa, dh });
    await so.taoLenh({ maKH: 'PA', tenKH: 'Phương Anh', soTien: 1000000 });
    await hd.chayLoat(async () => ({ ok: true, ketQua: { tong: 1000000, lech: 0, soCai: 1, soLoai: 1 } }));
    assert.strictEqual(dh.soNhipDangChay(), 0, 'nhịp gia hạn còn chạy sau khi khách xong');
});
test('⭐⭐ khách NÉM LỖI → nhịp vẫn bị hủy', async () => {
    const dh = taoDongHoGia(); const khoa = taoKhoaLuuTru();
    const { so, hd } = await dung({ khoa, dh });
    await so.taoLenh({ maKH: 'PA', tenKH: 'Phương Anh', soTien: 1000000 });
    await hd.chayLoat(async () => { throw new Error('Chrome giết tiến trình'); });
    assert.strictEqual(dh.soNhipDangChay(), 0, 'nhịp gia hạn rò rỉ khi khách ném lỗi');
});
test('⛔⛔ khóa đã sang MÁY KHÁC → KHÔNG ghi đè', async () => {
    const dh = taoDongHoGia(); const khoa = taoKhoaLuuTru();
    const { hd } = await dung({ khoa, mayId: 'may-1', dh });
    await khoa.ghi({ mayId: 'may-2', hetHanLuc: dh.dongHo() + 10_000, giuLuc: dh.dongHo() });
    const daGhi = await hd.giaHanNeuConCuaMinh();
    assert.strictEqual(daGhi, false);
    assert.strictEqual(khoa.xem().mayId, 'may-2', 'ghi đè khóa của máy khác -> mở đường chạy chồng');
});
test('⛔ khóa đã được NHẢ (rỗng) → KHÔNG tự giành lại', async () => {
    const dh = taoDongHoGia(); const khoa = taoKhoaLuuTru();
    const { hd } = await dung({ khoa, dh });
    const daGhi = await hd.giaHanNeuConCuaMinh();
    assert.strictEqual(daGhi, false);
    assert.strictEqual(khoa.xem(), null, 'nhịp muộn giành lại khóa vừa nhả');
});
test('⭐ gia hạn khóa của chính mình thì ghi', async () => {
    const dh = taoDongHoGia(); const khoa = taoKhoaLuuTru();
    const { hd } = await dung({ khoa, dh });
    await khoa.ghi({ mayId: 'may-1', hetHanLuc: dh.dongHo() + 1000, giuLuc: dh.dongHo() });
    dh.troi(500);
    assert.strictEqual(await hd.giaHanNeuConCuaMinh(), true);
    assert.ok(khoa.xem().hetHanLuc >= dh.dongHo() + HangDoi.HAN_KHOA_MAC_DINH - 1);
});

chay('KHÓA HÀNG ĐỢI ĐƯỢC GIA HẠN');
