'use strict';

// Test cho kho tài khoản. Dùng WebCrypto có sẵn của Node — không cài gì.
// Mật khẩu dùng trong test là GIẢ, không phải mật khẩu thật của ai.
//
// Từ 2026-08-12 KHÔNG CÒN KHÓA MỞ: chìa AES do máy tự sinh và nằm ngay trong
// kho. Đây là CHE MẮT chứ không phải bảo vệ — ai đọc được kho thì cũng đọc
// được chìa. Test ở đây vì vậy KHÔNG được khẳng định kho an toàn trước người
// có quyền đọc máy; chúng chỉ canh hai thứ: đọc/ghi đúng, và không để mật khẩu
// nằm dạng chữ thường.

const assert = require('node:assert');
const { test, ghiChu, chay } = require('./chay');
const Kho = require('../chung/khoMatKhau');

const KHOA_MO = 'khoa-mo-thu-nghiem-2026';
const MAT_KHAU_GIA = 'MatKhauGia!123';
const MA_CUA_HANG = '2c683a17-09ab-4655-8dbf-50ca8105373c';

async function khoCoMotKhach() {
    const kho = await Kho.taoKho();
    const { khoa } = await Kho.moKho(kho);
    await Kho.ghiKhach(kho, khoa, 'PA', {
        maCuaHang: MA_CUA_HANG, tenDangNhap: '0344168490',
        matKhau: MAT_KHAU_GIA, ghiChu: 'Phương Anh',
    });
    return { kho, khoa };
}

ghiChu('— Đọc ghi —');

test('mở kho KHÔNG cần gõ gì, lấy lại đúng mật khẩu', async () => {
    const { kho, khoa } = await khoCoMotKhach();
    assert.strictEqual(await Kho.docMatKhau(kho, khoa, 'PA'), MAT_KHAU_GIA);
});

test('⭐ kho KHÔNG có chìa → từ chối, không trả về rác', async () => {
    const mo = await Kho.moKho({ phienBan: 2, khach: {} });
    assert.strictEqual(mo.ok, false);
    assert.strictEqual(mo.khoa, undefined);
});

test('chìa trong kho bị hỏng → từ chối chứ không nổ', async () => {
    const mo = await Kho.moKho({ phienBan: 2, chiaKhoa: 'khong-phai-base64-32-byte', khach: {} });
    assert.strictEqual(mo.ok, false);
});

test('⭐ mỗi kho một chìa RIÊNG — không dùng chung một chìa cứng', async () => {
    // Dùng chung một chìa viết sẵn trong mã nguồn thì ai cũng mở được kho của
    // người khác, kể cả khi không đụng được vào máy này.
    const a = await Kho.taoKho();
    const b = await Kho.taoKho();
    assert.notStrictEqual(a.chiaKhoa, b.chiaKhoa);
    assert.ok(a.chiaKhoa.length >= 40, 'chìa quá ngắn');
});

test('⭐ kho của người khác KHÔNG mở được bằng chìa của mình', async () => {
    const { kho } = await khoCoMotKhach();
    const khoKhac = await Kho.taoKho();
    const moKhac = await Kho.moKho(khoKhac);
    assert.strictEqual(await Kho.docMatKhau(kho, moKhac.khoa, 'PA'), null);
});

test('KHÔNG có mật khẩu dạng thường ở bất cứ đâu trong kho', async () => {
    const { kho } = await khoCoMotKhach();
    const toanBo = JSON.stringify(kho);
    assert.ok(!toanBo.includes(MAT_KHAU_GIA), 'mật khẩu bị lưu dạng đọc được!');
});

test('hai khách cùng mật khẩu → hai bản mã KHÁC NHAU (mỗi bản ghi một IV)', async () => {
    const { kho, khoa } = await khoCoMotKhach();
    await Kho.ghiKhach(kho, khoa, 'TB', {
        maCuaHang: 'cua-hang-khac', tenDangNhap: 'x', matKhau: MAT_KHAU_GIA,
    });
    assert.notStrictEqual(kho.khach.PA.matKhauMaHoa.duLieu, kho.khach.TB.matKhauMaHoa.duLieu);
    assert.notStrictEqual(kho.khach.PA.matKhauMaHoa.iv, kho.khach.TB.matKhauMaHoa.iv);
});

test('hai kho → bản mã khác nhau', async () => {
    const a = await khoCoMotKhach();
    const b = await khoCoMotKhach();
    assert.notStrictEqual(a.kho.chiaKhoa, b.kho.chiaKhoa);
    assert.notStrictEqual(a.kho.khach.PA.matKhauMaHoa.duLieu, b.kho.khach.PA.matKhauMaHoa.duLieu);
});

test('bản mã bị sửa một ký tự → giải mã THẤT BẠI, không trả nửa vời', async () => {
    const { kho, khoa } = await khoCoMotKhach();
    const d = kho.khach.PA.matKhauMaHoa.duLieu;
    kho.khach.PA.matKhauMaHoa.duLieu = (d[0] === 'A' ? 'B' : 'A') + d.slice(1);
    assert.strictEqual(await Kho.docMatKhau(kho, khoa, 'PA'), null);
});

test('tạo kho KHÔNG hỏi gì — không còn khái niệm khóa mở', async () => {
    const kho = await Kho.taoKho();
    assert.strictEqual(kho.phienBan, 2);
    assert.ok(kho.chiaKhoa, 'kho mới phải có chìa tự sinh');
    assert.strictEqual(kho.muoi, undefined, 'kho mới không còn muối của khóa mở');
    assert.strictEqual((await Kho.moKho(kho)).ok, true, 'mở ngay không cần gõ gì');
});

test('số vòng băm đủ mạnh theo khuyến nghị', () => {
    assert.ok(Kho.SO_VONG_BAM >= 600000, 'số vòng băm quá thấp, dễ bị dò');
});

ghiChu('— Quản lý bản ghi —');

test('danh sách hiển thị KHÔNG kèm mật khẩu, kể cả dạng mã hóa', async () => {
    const { kho } = await khoCoMotKhach();
    const ds = Kho.danhSachKhach(kho);
    assert.strictEqual(ds.length, 1);
    assert.strictEqual(ds[0].maKH, 'PA');
    assert.strictEqual(ds[0].maCuaHang, MA_CUA_HANG);
    assert.ok(!('matKhauMaHoa' in ds[0]), 'lộ bản mã ra tầng hiển thị');
    assert.ok(!JSON.stringify(ds).includes(MAT_KHAU_GIA));
});

test('thiếu mã cửa hàng hoặc mật khẩu → từ chối ghi', async () => {
    const { kho, khoa } = await khoCoMotKhach();
    await assert.rejects(() => Kho.ghiKhach(kho, khoa, 'X', { maCuaHang: '', matKhau: 'a' }));
    await assert.rejects(() => Kho.ghiKhach(kho, khoa, 'X', { maCuaHang: 'y', matKhau: '' }));
    await assert.rejects(() => Kho.ghiKhach(kho, khoa, '', { maCuaHang: 'y', matKhau: 'a' }));
});

test('khách chưa khai báo → trả null, KHÔNG nổ', async () => {
    const { kho, khoa } = await khoCoMotKhach();
    assert.strictEqual(await Kho.docMatKhau(kho, khoa, 'KHONG-CO'), null);
});

test('xóa khách thì mất sạch bản ghi', async () => {
    const { kho, khoa } = await khoCoMotKhach();
    Kho.xoaKhach(kho, 'PA');
    assert.strictEqual(Kho.danhSachKhach(kho).length, 0);
    assert.strictEqual(await Kho.docMatKhau(kho, khoa, 'PA'), null);
});

test('tra ngược từ mã cửa hàng ra khách — để đối chiếu tài khoản đang đăng nhập', async () => {
    const { kho } = await khoCoMotKhach();
    assert.strictEqual(Kho.timTheoCuaHang(kho, MA_CUA_HANG), 'PA');
    assert.strictEqual(Kho.timTheoCuaHang(kho, MA_CUA_HANG.toUpperCase()), 'PA');
    assert.strictEqual(Kho.timTheoCuaHang(kho, 'cua-hang-la'), null);
    assert.strictEqual(Kho.timTheoCuaHang(kho, ''), null);
});

ghiChu('— ⭐ Chuyển kho CŨ (bản 1, còn khóa mở) sang kho không khóa —');

/** Dựng một kho bản 1 y như phiên bản cũ tạo ra. */
async function khoCuCoKhach(khoaMo = KHOA_MO) {
    const c = globalThis.crypto;
    const mahoa = new TextEncoder();
    const muoi = c.getRandomValues(new Uint8Array(16));
    const goc = await c.subtle.importKey('raw', mahoa.encode(khoaMo), 'PBKDF2', false, ['deriveKey']);
    const khoa = await c.subtle.deriveKey(
        { name: 'PBKDF2', salt: muoi, iterations: Kho.SO_VONG_BAM, hash: 'SHA-256' },
        goc, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const b64 = (b) => Buffer.from(b).toString('base64');
    const boc = async (chu) => {
        const iv = c.getRandomValues(new Uint8Array(12));
        return { iv: b64(iv),
                 duLieu: b64(await c.subtle.encrypt({ name: 'AES-GCM', iv }, khoa, mahoa.encode(chu))) };
    };
    return {
        phienBan: 1,
        muoi: b64(muoi),
        cauKiemTra: await boc('hdt-kiem-tra-khoa-mo'),
        khach: {
            PA: { maCuaHang: MA_CUA_HANG, tenDangNhap: '0344168490', ghiChu: 'Phương Anh',
                  matKhauMaHoa: await boc(MAT_KHAU_GIA), capNhatLuc: '2026-08-01T00:00:00.000Z' },
        },
    };
}

test('nhận ra kho cũ', async () => {
    assert.strictEqual(Kho.laKhoCu(await khoCuCoKhach()), true);
    assert.strictEqual(Kho.laKhoCu(await Kho.taoKho()), false);
    assert.strictEqual(Kho.laKhoCu(null), false);
});

test('⭐ kho cũ KHÔNG mở thẳng được — phải chuyển đổi trước', async () => {
    const mo = await Kho.moKho(await khoCuCoKhach());
    assert.strictEqual(mo.ok, false);
    assert.strictEqual(mo.khoCu, true, 'không báo được đây là kho cũ — màn hình sẽ không biết hỏi gì');
});

test('⭐ đúng khóa mở cũ → chuyển đủ khai báo, mật khẩu còn nguyên', async () => {
    const kq = await Kho.chuyenKhoCu(await khoCuCoKhach(), KHOA_MO);
    assert.strictEqual(kq.ok, true, kq.lyDo);
    assert.strictEqual(kq.soKhach, 1);
    assert.strictEqual(kq.kho.phienBan, 2);
    const mo = await Kho.moKho(kq.kho);
    assert.strictEqual(await Kho.docMatKhau(kq.kho, mo.khoa, 'PA'), MAT_KHAU_GIA);
    assert.strictEqual(kq.kho.khach.PA.maCuaHang, MA_CUA_HANG);
    assert.strictEqual(kq.kho.khach.PA.tenDangNhap, '0344168490');
});

test('sai khóa mở cũ → KHÔNG chuyển gì, không làm hỏng kho cũ', async () => {
    const khoCu = await khoCuCoKhach();
    const kq = await Kho.chuyenKhoCu(khoCu, 'sai-bet-nhe');
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.kho, undefined);
    assert.strictEqual(khoCu.phienBan, 1, 'kho cũ bị sửa trong lúc chuyển hụt');
});

test('kho mới sau chuyển đổi KHÔNG còn dấu vết khóa mở cũ', async () => {
    const kq = await Kho.chuyenKhoCu(await khoCuCoKhach(), KHOA_MO);
    const chuoi = JSON.stringify(kq.kho);
    assert.ok(!chuoi.includes(KHOA_MO));
    assert.strictEqual(kq.kho.muoi, undefined);
    assert.strictEqual(kq.kho.cauKiemTra, undefined);
});


chay('KHO TÀI KHOẢN TENDOO — KHÔNG CÒN KHÓA MỞ');
