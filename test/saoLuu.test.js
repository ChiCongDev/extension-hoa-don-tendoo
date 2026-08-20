'use strict';

// ============================================================================
//  TEST SAO LƯU / KHÔI PHỤC KHAI BÁO
//
//  Từ 2026-08-12 kho trên đĩa KHÔNG CÒN KHÓA MỞ — chìa nằm ngay trong kho. Nên
//  chép nguyên kho ra tệp là chép luôn mật khẩu đọc được.
//
//  Tệp sao lưu là thứ RỜI KHỎI MÁY: USB, Zalo, Drive. Vì vậy đây là chỗ DUY
//  NHẤT còn hỏi mật khẩu, và nó là TÙY CHỌN:
//    · có mật khẩu -> cả kho bị bọc thêm PBKDF2 + AES, mở cần đúng mật khẩu
//    · bỏ trống    -> tệp đọc được bằng tay không, và người dùng PHẢI được
//                     cảnh báo rõ điều đó
//
//  Hai điều vẫn phải chứng minh như cũ:
//    1. Tệp CÓ mật khẩu thì không lộ gì.
//    2. Nhập một tệp rác KHÔNG được xóa mất khai báo thật.
// ============================================================================

const assert = require('node:assert');
const { JSDOM } = require(process.env.HDT_JSDOM || 'jsdom');
const { test, ghiChu, chay } = require('./chay');
const Kho = require('../chung/khoMatKhau');
const KhaiBao = require('../popup/khaiBao');
const GhiNhan = require('../tendoo/ghiNhanCuaHang');

const MAT_KHAU_GIA = 'MatKhauGia!123';
const MK_TEP = 'mat-khau-cua-tep-2026';
const CH_PA = '2c683a17-09ab-4655-8dbf-50ca8105373c';
const CH_TB = '9f1c0b22-1111-2222-3333-444455556666';

function taoLuuTru(banDau = null) {
    let o = banDau;
    return {
        async doc() { return o ? JSON.parse(JSON.stringify(o)) : null; },
        async ghi(x) { o = x ? JSON.parse(JSON.stringify(x)) : null; },
        xem: () => o,
    };
}

async function dung(luuTru = taoLuuTru()) {
    const dom = new JSDOM('<!doctype html><div id="goc"></div>');
    const goc = dom.window.document.getElementById('goc');
    const daTai = [];
    const mh = KhaiBao.gan(goc, {
        Kho, luuTru, GhiNhan,
        luuTruCuaHang: { async doc() { return null; }, async ghi() {} },
        taiXuong: (ten, noiDung) => daTai.push({ ten, noiDung }),
    });
    await mh.nap();
    return { goc, mh, luuTru, daTai };
}

/** Kho có 2 khách. Không còn khóa mở nên không phải mở gì. */
async function khoHaiKhach() {
    const luuTru = taoLuuTru();
    const t = await dung(luuTru);
    await t.mh.themKhach({ maKH: 'PA', maCuaHang: CH_PA, tenDangNhap: '0344168490',
                           matKhau: MAT_KHAU_GIA, ghiChu: 'Phương Anh' });
    await t.mh.themKhach({ maKH: 'TB', maCuaHang: CH_TB, tenDangNhap: '0987654321',
                           matKhau: MAT_KHAU_GIA, ghiChu: 'Trang Bé' });
    return t;
}

ghiChu('— Xuất bản sao —');

test('xuất ra tệp có tên theo ngày, chứa đủ khai báo', async () => {
    const { mh, daTai } = await khoHaiKhach();
    await mh.xuatBanSao();
    assert.strictEqual(daTai.length, 1);
    assert.match(daTai[0].ten, /^khai-bao-tendoo-\d{4}-\d{2}-\d{2}\.json$/);
    const doc = await Kho.docBanSaoLuu(daTai[0].noiDung);
    assert.strictEqual(doc.ok, true, doc.lyDo);
    assert.strictEqual(doc.soKhach, 2);
});

test('tệp vẫn giữ mã cửa hàng và tên đăng nhập để đối chiếu', async () => {
    const { mh, daTai } = await khoHaiKhach();
    await mh.xuatBanSao();
    assert.ok(daTai[0].noiDung.includes(CH_PA));
    assert.ok(daTai[0].noiDung.includes('0344168490'));
});

test('chưa có khai báo nào → vẫn xuất được, tệp rỗng chứ không nổ', async () => {
    const { mh, daTai } = await dung();
    await mh.xuatBanSao();
    assert.strictEqual(daTai.length, 1);
    assert.strictEqual((await Kho.docBanSaoLuu(daTai[0].noiDung)).soKhach, 0);
});

ghiChu('— ⭐ Mật khẩu cho tệp: TÙY CHỌN, và phải nói thật —');

test('⭐ CÓ mật khẩu → tệp KHÔNG lộ mật khẩu Tendoo, cũng KHÔNG lộ chìa của kho', async () => {
    const { mh, daTai, luuTru } = await khoHaiKhach();
    await mh.xuatBanSao(MK_TEP);
    const noiDung = daTai[0].noiDung;
    assert.ok(!noiDung.includes(MAT_KHAU_GIA), 'MẬT KHẨU NẰM TRẦN TRONG TỆP!');
    assert.ok(!noiDung.includes(MK_TEP), 'mật khẩu của tệp bị ghi vào chính tệp!');
    assert.ok(!noiDung.includes(luuTru.xem().chiaKhoa), '❌ chìa của kho lọt ra tệp');
    assert.ok(!noiDung.includes('0344168490'), 'tên đăng nhập vẫn lộ');
});

test('⭐ BỎ TRỐNG mật khẩu → phải CẢNH BÁO rõ là tệp đọc được bằng tay không', async () => {
    // Kho nay mang sẵn chìa bên trong. Không nói rõ thì người dùng tưởng tệp
    // vẫn an toàn như bản cũ rồi gửi qua Zalo.
    const { goc, mh } = await khoHaiKhach();
    await mh.xuatBanSao('');
    const chu = goc.querySelector('#kbOk').textContent;
    assert.match(chu, /KHÔNG có mật khẩu/i);
    assert.match(chu, /ai cầm được cũng đọc được/i);
    assert.match(chu, /Đừng gửi qua mạng/i);
});

test('có mật khẩu → nhắc người dùng nhớ kỹ', async () => {
    const { goc, mh } = await khoHaiKhach();
    await mh.xuatBanSao(MK_TEP);
    assert.match(goc.querySelector('#kbOk').textContent, /mất là không mở được/i);
});

test('tệp có mật khẩu: đúng mật khẩu mới mở được', async () => {
    const { mh, daTai } = await khoHaiKhach();
    await mh.xuatBanSao(MK_TEP);
    const tep = daTai[0].noiDung;
    assert.strictEqual(Kho.banSaoCanMatKhau(tep), true);
    assert.strictEqual((await Kho.docBanSaoLuu(tep)).canMatKhau, true);
    assert.strictEqual((await Kho.docBanSaoLuu(tep, 'sai-bet')).ok, false);
    assert.strictEqual((await Kho.docBanSaoLuu(tep, MK_TEP)).ok, true);
});

test('tệp KHÔNG mật khẩu thì không đòi mật khẩu', async () => {
    const { mh, daTai } = await khoHaiKhach();
    await mh.xuatBanSao('');
    assert.strictEqual(Kho.banSaoCanMatKhau(daTai[0].noiDung), false);
    assert.strictEqual((await Kho.docBanSaoLuu(daTai[0].noiDung)).ok, true);
});

ghiChu('— Kiểm tra tệp trước khi nhận —');

test('từ chối tệp không phải JSON', async () => {
    for (const rac of ['', 'không phải json', '{hỏng', '<html>']) {
        const kq = await Kho.docBanSaoLuu(rac);
        assert.strictEqual(kq.ok, false, rac);
    }
});

test('từ chối tệp JSON nhưng không phải bản sao của mình', async () => {
    const kq = await Kho.docBanSaoLuu(JSON.stringify({ loai: 'thu-gi-do', kho: {} }));
    assert.strictEqual(kq.ok, false);
    assert.match(kq.lyDo, /Không phải bản sao/);
});

test('từ chối bản sao thiếu phần khóa', async () => {
    const kq = await Kho.docBanSaoLuu(JSON.stringify({
        loai: Kho.LOAI_BAN_SAO, phienBan: 1, kho: { khach: {} },
    }));
    assert.strictEqual(kq.ok, false);
    assert.match(kq.lyDo, /thiếu phần khóa/);
});

test('từ chối bản sao có bản ghi khách bị hỏng', async () => {
    const { mh, daTai } = await khoHaiKhach();
    await mh.xuatBanSao();
    const goi = JSON.parse(daTai[0].noiDung);
    delete goi.kho.khach.PA.matKhauMaHoa;
    const kq = await Kho.docBanSaoLuu(JSON.stringify(goi));
    assert.strictEqual(kq.ok, false);
    assert.match(kq.lyDo, /"PA" bị hỏng/);
});

test('từ chối bản sao của phiên bản mới hơn', async () => {
    const { mh, daTai } = await khoHaiKhach();
    await mh.xuatBanSao();
    const goi = JSON.parse(daTai[0].noiDung);
    goi.phienBan = 99;
    const kq = await Kho.docBanSaoLuu(JSON.stringify(goi));
    assert.strictEqual(kq.ok, false);
    assert.match(kq.lyDo, /phiên bản mới hơn/);
});

ghiChu('— Nhập bản sao —');

test('⚠ tệp rác KHÔNG được xóa mất khai báo thật', async () => {
    const { mh, luuTru } = await khoHaiKhach();
    const truoc = JSON.stringify(luuTru.xem());
    await mh.nhapBanSao('rác không phải json', true);
    assert.strictEqual(JSON.stringify(luuTru.xem()), truoc, 'ĐÃ XÓA MẤT KHAI BÁO THẬT!');
    assert.strictEqual(mh.soKhaiBao(), 2);
});

test('kho đang có khai báo → HỎI XÁC NHẬN trước khi ghi đè', async () => {
    const { goc, mh, daTai, luuTru } = await khoHaiKhach();
    await mh.xuatBanSao();
    const truoc = JSON.stringify(luuTru.xem());

    await mh.nhapBanSao(daTai[0].noiDung, false);
    assert.ok(mh.choXacNhan(), 'không hỏi xác nhận');
    assert.ok(goc.querySelector('#kbXacNhanNhap'), 'không hiện khối xác nhận');
    assert.match(goc.querySelector('#kbXacNhanNhap').textContent, /XÓA HẾT khai báo hiện tại/);
    assert.strictEqual(JSON.stringify(luuTru.xem()), truoc, 'đã ghi đè khi chưa xác nhận');
});

test('bấm Hủy → không ghi đè gì', async () => {
    const { goc, mh, daTai, luuTru } = await khoHaiKhach();
    await mh.xuatBanSao();
    const truoc = JSON.stringify(luuTru.xem());
    await mh.nhapBanSao(daTai[0].noiDung, false);
    goc.querySelector('#kbNhapHuy').click();
    assert.strictEqual(mh.choXacNhan(), null);
    assert.strictEqual(JSON.stringify(luuTru.xem()), truoc);
});

test('⭐ xác nhận → ghi đè, và DÙNG ĐƯỢC NGAY (không bắt gõ gì)', async () => {
    const { goc, mh, daTai } = await khoHaiKhach();
    await mh.xuatBanSao();
    await mh.nhapBanSao(daTai[0].noiDung, true);
    assert.strictEqual(mh.soKhaiBao(), 2);
    assert.ok(goc.querySelector('#kbDanhSach'), 'nhập xong lại bị chặn — đáng ra dùng được ngay');
    assert.ok(goc.querySelector('[data-ma-kh="PA"]'));
});

ghiChu('— Tệp có mật khẩu: hỏi ngay tại chỗ —');

test('⭐ nhập tệp có mật khẩu mà chưa gõ → HỎI, không xóa gì', async () => {
    const nguon = await khoHaiKhach();
    await nguon.mh.xuatBanSao(MK_TEP);
    const tep = nguon.daTai[0].noiDung;

    const may2 = await khoHaiKhach();
    const truoc = JSON.stringify(may2.luuTru.xem());
    await may2.mh.nhapBanSao(tep, true);            // chưa có mật khẩu

    assert.ok(may2.goc.querySelector('#kbHoiMatKhauTep'), 'không hỏi mật khẩu của tệp');
    assert.ok(may2.goc.querySelector('#kbMoTep'), 'thiếu nút mở tệp');
    assert.strictEqual(JSON.stringify(may2.luuTru.xem()), truoc, 'đã ghi đè khi chưa mở được tệp');
});

test('gõ đúng mật khẩu tệp → nhập được đủ khai báo', async () => {
    const nguon = await khoHaiKhach();
    await nguon.mh.xuatBanSao(MK_TEP);
    const may2 = await dung();
    await may2.mh.nhapBanSao(nguon.daTai[0].noiDung, true, MK_TEP);
    assert.strictEqual(may2.mh.soKhaiBao(), 2);
    assert.ok(may2.goc.querySelector('[data-ma-kh="PA"]'));
});

test('gõ SAI mật khẩu tệp → không nhập, không lộ gì', async () => {
    const nguon = await khoHaiKhach();
    await nguon.mh.xuatBanSao(MK_TEP);
    const may2 = await dung();
    await may2.mh.nhapBanSao(nguon.daTai[0].noiDung, true, 'sai-mat-khau');
    assert.strictEqual(may2.mh.soKhaiBao(), 0);
    assert.ok(!may2.goc.textContent.includes('0344168490'), 'lộ tên đăng nhập dù sai mật khẩu');
});

test('bấm "Thôi" → bỏ tệp đang chờ, quay lại bình thường', async () => {
    const nguon = await khoHaiKhach();
    await nguon.mh.xuatBanSao(MK_TEP);
    const may2 = await khoHaiKhach();
    await may2.mh.nhapBanSao(nguon.daTai[0].noiDung, true);
    may2.goc.querySelector('#kbBoTep').click();
    assert.strictEqual(may2.goc.querySelector('#kbHoiMatKhauTep'), null);
    assert.ok(may2.goc.querySelector('#kbXuatBanSao'), 'không quay về màn sao lưu bình thường');
});

ghiChu('— Chuyển sang máy khác —');

test('máy trống → nhập KHÔNG cần hỏi xác nhận (không có gì để mất)', async () => {
    const nguon = await khoHaiKhach();
    await nguon.mh.xuatBanSao();
    const may2 = await dung();
    await may2.mh.nhapBanSao(nguon.daTai[0].noiDung, false);
    assert.strictEqual(may2.mh.choXacNhan(), null);
    assert.strictEqual(may2.mh.soKhaiBao(), 2);
});

test('mật khẩu vẫn giải mã đúng sau khi đi qua tệp', async () => {
    const nguon = await khoHaiKhach();
    await nguon.mh.xuatBanSao(MK_TEP);
    const may2 = await dung();
    await may2.mh.nhapBanSao(nguon.daTai[0].noiDung, true, MK_TEP);

    // Lấy mật khẩu ra bằng chính bộ kho, chứng minh bản mã còn nguyên vẹn.
    const kho = await may2.luuTru.doc();
    const mo = await Kho.moKho(kho);
    assert.strictEqual(await Kho.docMatKhau(kho, mo.khoa, 'PA'), MAT_KHAU_GIA);
    assert.strictEqual(await Kho.docMatKhau(kho, mo.khoa, 'TB'), MAT_KHAU_GIA);
});

test('⭐ chìa đi theo tệp — máy mới KHÔNG cần biết gì thêm', async () => {
    // Đây vừa là tiện lợi vừa là rủi ro, và test này ghi lại đúng sự thật đó:
    // ai cầm được tệp KHÔNG mật khẩu là có toàn bộ mật khẩu Tendoo.
    const nguon = await khoHaiKhach();
    await nguon.mh.xuatBanSao('');
    const doc = await Kho.docBanSaoLuu(nguon.daTai[0].noiDung);
    const mo = await Kho.moKho(doc.kho);
    assert.strictEqual(mo.ok, true);
    assert.strictEqual(await Kho.docMatKhau(doc.kho, mo.khoa, 'PA'), MAT_KHAU_GIA);
});

chay('SAO LƯU / KHÔI PHỤC KHAI BÁO');
