'use strict';

// ============================================================================
//  HAI LỊCH TÁCH RỜI — chủ dự án chốt 27/08/2026.
//
//  Mỗi khách có tối đa HAI lượt trong ngày, không dính gì nhau:
//    · he_thong — xuất theo DOANH THU hôm nay, giờ ở `moc` (trống -> giờ chung)
//    · tu_chon  — xuất đúng `soTienNgay`, giờ ở `mocTien` (trống -> KHÔNG chạy)
//
//  ── VÌ SAO CHUYỆN NÀY KHÔNG PHÁ LUẬT "MỖI NGÀY ĐÚNG MỘT MỐC" ──────────────
//  Luật 13/08/2026 sinh ra vì lượt hệ thống lấy "doanh thu hôm nay tính tới lúc
//  chạy": chạy hai lần là tính trùng phần buổi sáng. Lượt tự chọn KHÔNG đọc
//  doanh thu, nên không có gì để tính trùng. Vẫn ĐÚNG MỘT lượt hệ thống mỗi
//  ngày, cộng thêm một lượt tự chọn độc lập.
//
//  ── CHỖ NGUY HIỂM NHẤT ───────────────────────────────────────────────────
//  Đây là mã quyết định HÓA ĐƠN THUẾ THẬT. Hai cách hỏng đắt nhất:
//    1. Cài đặt cũ bị hiểu sai -> khách mọc thêm một tờ chưa ai yêu cầu
//    2. Hai ô cùng giờ -> một lượt biến mất im lặng, tối ngồi đếm mới biết
// ============================================================================

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require(process.env.HDT_JSDOM || 'jsdom');
const { test, ghiChu, chay, doiMotNhip } = require('./chay');
const { taoTrang } = require('./trangGiaLap');
globalThis.__HDT_KHONG_TU_CHAY__ = true;
require('../chung/ghepTien');
require('../chung/caiDat');
require('../chung/henGio');
require('../chung/lichSuChay');
require('../sell/docBang');
require('../sell/oKhaiBao');
const ChenCot = require('../sell/chenCot');
const HenGio = require('../chung/henGio');
const CaiDat = require('../chung/caiDat');
const ApDung = require('../chung/apDungSoDat');

const GOC = path.join(__dirname, '..');
const doc = (f) => fs.readFileSync(path.join(GOC, f), 'utf8');

/**
 * Gói lịch đã qua bộ chuẩn hoá THẬT, đúng như tiến trình nền đọc lên.
 *
 * ⚠️ PHẢI TRUYỀN `HenGio` VÀO `gop`. Không truyền thì `chuanKhach` bỏ qua mọi
 * mốc giờ (nó cần `HenGio.chuanMotMoc` để đọc) và test xanh/đỏ vì lý do sai.
 */
const lich = (moc, khach) => CaiDat.gop(null, {
    henGio: { bat: true, moc: [moc], khach },
}, HenGio).henGio;

const mocCua = (h) => HenGio.gomTheoMoc(h).map(o => o.moc);
const tai = (h, m) => HenGio.khachCuaMoc(h, m)
    .map(k => `${k.maKH}:${k.kieu}`).sort();

ghiChu('── CHUYỂN CÀI ĐẶT CŨ: không được mọc thêm hóa đơn nào ──');

test('⭐⭐ khách cũ CÓ tiền/ngày -> vẫn ĐÚNG MỘT tờ, vào đúng giờ cũ', () => {
    // Nếp cũ: `soTienNgay` THAY doanh thu, khách ra một tờ tại `moc`.
    // Chuyển sai thành "bật cả hai" là phát hành thêm hóa đơn thuế thật mà chủ
    // dự án chưa bao giờ yêu cầu — và hóa đơn đã gửi thuế thì không rút lại được.
    const h = lich('09:00', [{ maKH: 'A', tenKH: 'A', moc: '15:10', soTienNgay: '5000000' }]);
    const k = h.khach[0];
    assert.strictEqual(k.batHeThong, false, 'tự bật lượt hệ thống -> khách mọc thêm một tờ');
    assert.strictEqual(k.batTuChon, true);
    assert.strictEqual(k.mocTien, '15:10', 'mất giờ cũ -> lượt tự chọn không chạy nữa');
    assert.deepStrictEqual(mocCua(h), ['09:00', '15:10']);
    assert.deepStrictEqual(tai(h, '15:10'), ['A:tu_chon']);
    assert.deepStrictEqual(tai(h, '09:00'), [], 'khách này lại chạy cả ở giờ chung');
});

test('⭐⭐ khách cũ KHÔNG có tiền/ngày -> chạy hệ thống y như cũ', () => {
    const h = lich('09:00', [{ maKH: 'A', tenKH: 'A' }]);
    assert.strictEqual(h.khach[0].batHeThong, true);
    assert.strictEqual(h.khach[0].batTuChon, false);
    assert.deepStrictEqual(tai(h, '09:00'), ['A:he_thong']);
});

test('⭐ khách cũ có tiền/ngày mà KHÔNG có giờ riêng -> lấy giờ chung làm giờ tự chọn', () => {
    // Nếp cũ: không có `moc` thì chạy ở giờ chung. Phải giữ đúng giờ ấy.
    const h = lich('09:00', [{ maKH: 'A', tenKH: 'A', soTienNgay: '5000000' }]);
    assert.strictEqual(h.khach[0].mocTien, '09:00');
    assert.deepStrictEqual(tai(h, '09:00'), ['A:tu_chon']);
});

test('có cờ rồi thì KHÔNG đoán lại nữa', () => {
    const h = lich('09:00', [{ maKH: 'A', tenKH: 'A', soTienNgay: '5000000',
                               batHeThong: true, batTuChon: false }]);
    assert.strictEqual(h.khach[0].batHeThong, true);
    assert.strictEqual(h.khach[0].batTuChon, false, 'đoán đè lên lựa chọn của người dùng');
});

test('⭐ tắt tích rồi lưu thì lần sau mở lên vẫn TẮT', () => {
    // `batTuChon: false` là khoá CÓ MẶT với giá trị false. Bỏ khoá đi thì bộ
    // chuẩn hoá tưởng là bản ghi cũ và tự bật lại theo `soTienNgay`.
    const h = lich('09:00', [{ maKH: 'A', tenKH: 'A', soTienNgay: '5000000',
                               batHeThong: false, batTuChon: false }]);
    assert.strictEqual(h.khach[0].batTuChon, false);
    assert.deepStrictEqual(mocCua(h), ['09:00']);
    assert.deepStrictEqual(tai(h, '09:00'), [], 'tắt cả hai mà vẫn chạy');
});

ghiChu('── HAI LỊCH THẬT SỰ TÁCH RỜI ──');

test('⭐⭐ bật cả hai -> HAI mốc, mỗi mốc một kiểu', () => {
    const h = lich('09:00', [{
        maKH: 'A', tenKH: 'A', moc: '15:10', soTienNgay: '5000000', mocTien: '10:00',
        batHeThong: true, batTuChon: true,
    }]);
    // Giờ chung 09:00 vẫn nằm trong danh sách dù không còn khách nào — cố ý,
    // để màn hình nói được "mốc này không còn ai" thay vì im lặng.
    assert.deepStrictEqual(mocCua(h), ['09:00', '10:00', '15:10']);
    assert.deepStrictEqual(tai(h, '15:10'), ['A:he_thong']);
    assert.deepStrictEqual(tai(h, '10:00'), ['A:tu_chon']);
    assert.deepStrictEqual(tai(h, '09:00'), [], 'khách này còn chạy cả ở giờ chung');
});

test('⭐ giờ hệ thống để trống -> lượt hệ thống theo GIỜ CHUNG, lượt tự chọn không đổi', () => {
    const h = lich('09:00', [{
        maKH: 'A', tenKH: 'A', soTienNgay: '5000000', mocTien: '10:00',
        batHeThong: true, batTuChon: true,
    }]);
    assert.deepStrictEqual(tai(h, '09:00'), ['A:he_thong']);
    assert.deepStrictEqual(tai(h, '10:00'), ['A:tu_chon']);
});

test('⭐⭐ HAI Ô CÙNG GIỜ -> giữ CẢ HAI, không nuốt mất lượt nào', () => {
    // Bản cũ bỏ trùng theo MÃ KHÁCH nên một trong hai biến mất, không báo gì —
    // người dùng chỉ biết khi tối ngồi đếm thiếu một tờ hóa đơn.
    const h = lich('09:00', [{
        maKH: 'A', tenKH: 'A', moc: '10:00', soTienNgay: '5000000', mocTien: '10:00',
        batHeThong: true, batTuChon: true,
    }]);
    assert.deepStrictEqual(mocCua(h), ['09:00', '10:00']);
    assert.deepStrictEqual(tai(h, '10:00'), ['A:he_thong', 'A:tu_chon'],
        'một trong hai lượt bị nuốt mất');
});

test('⭐ BẬT tự chọn mà KHÔNG điền giờ -> KHÔNG chạy, không mượn giờ nào', () => {
    // Mượn giờ chung hay giờ cột bên là phát hành một tờ hóa đơn thuế vào giờ
    // người dùng chưa hề chọn.
    const h = lich('09:00', [{
        maKH: 'A', tenKH: 'A', soTienNgay: '5000000',
        batHeThong: false, batTuChon: true,
    }]);
    assert.deepStrictEqual(tai(h, '09:00'), [], 'mượn giờ chung để chạy lượt tự chọn');
    assert.strictEqual(HenGio.khachThieuGioTien(h).length, 1,
        'không ai kêu lên -> người dùng chờ mãi một tờ hóa đơn không bao giờ tới');
});

test('chỉ bật tự chọn thì KHÔNG bị kể vào "khách chưa có giờ nào"', () => {
    // Giờ chung không liên quan gì tới khách chỉ chạy tự chọn.
    const h = lich('', [{ maKH: 'A', tenKH: 'A', soTienNgay: '5000000', mocTien: '10:00',
                          batHeThong: false, batTuChon: true }]);
    assert.strictEqual(HenGio.khachKhongCoGio(h).length, 0);
});

test('chỉ bật hệ thống mà chưa có giờ chung -> VẪN bị kể là chưa có giờ', () => {
    const h = lich('', [{ maKH: 'A', tenKH: 'A', batHeThong: true, batTuChon: false }]);
    assert.strictEqual(HenGio.khachKhongCoGio(h).length, 1);
});

test('⭐ giờ tự chọn gõ sai thì BỎ HẲN, không giữ mốc vô nghĩa', () => {
    // Giữ lại "25:99" là dựng một báo thức không bao giờ kêu, và người dùng
    // thấy giờ mình gõ nằm đó nên tưởng đã đặt xong.
    for (const rac of ['25:99', 'chín giờ', '9', '', '  ']) {
        const h = lich('09:00', [{ maKH: 'A', tenKH: 'A', soTienNgay: '5000000',
                                   mocTien: rac, batHeThong: false, batTuChon: true }]);
        assert.ok(!h.khach[0].mocTien || /^\d{2}:\d{2}$/.test(h.khach[0].mocTien),
            'giữ lại giờ rác: ' + JSON.stringify(rac) + ' -> ' + h.khach[0].mocTien);
    }
});

test('⭐⭐ ĐỌC TỪ KHO cũng phải kế thừa giờ chung (không chỉ lúc lưu)', () => {
    // ⚠️ HAI ĐƯỜNG VÀO CÀI ĐẶT: `gop` khi người dùng bấm Lưu, và `tuKho` khi
    // tiến trình nền đọc lên lúc khởi động. Chỉ vá một đường thì máy tính khởi
    // động lại là lượt tự chọn của khách dùng giờ chung ngừng chạy.
    globalThis.HDT_HenGio = HenGio;
    const c = CaiDat.tuKho({
        henGio: { bat: true, moc: ['09:00'],
                  khach: [{ maKH: 'A', tenKH: 'A', soTienNgay: 5000000 }] },
    });
    assert.strictEqual(c.henGio.khach[0].mocTien, '09:00',
        'đường tuKho không kế thừa giờ chung -> khởi động lại là mất lượt tự chọn');
});

test('⭐ tự chọn KHÔNG được mượn giờ của cột hệ thống', () => {
    // Hai lịch tách rời: gõ giờ ở cột trái không có nghĩa là cột phải cũng chạy
    // vào giờ ấy. Mượn ngầm là ra một tờ hóa đơn thuế vào giờ chưa ai chọn.
    const h = lich('', [{ maKH: 'A', tenKH: 'A', moc: '15:10', soTienNgay: '5000000',
                          batHeThong: true, batTuChon: true }]);
    assert.deepStrictEqual(tai(h, '15:10'), ['A:he_thong'],
        'lượt tự chọn mượn giờ của cột hệ thống');
    assert.strictEqual(HenGio.khachThieuGioTien(h).length, 1);
});

ghiChu('── SỐ TIỀN: mỗi kiểu lấy một nguồn, không lẫn ──');

const ghepMau = { chay: [{ maKH: 'A', tenKH: 'A', soTien: 1234567 }], thieu: [] };

test('⭐⭐⭐ HAI Ô CÙNG GIỜ: cả hai tờ đều ra, không tờ nào biến mất', () => {
    // ⚠️ LỖI THẬT ĐÃ TỪNG CÓ. `gomTheoMoc` giữ đúng hai mục, nhưng `apDung` lọc
    // theo MÃ KHÁCH nên vứt luôn mục hệ thống: khách ra đúng một tờ tiền/ngày,
    // còn tờ theo doanh thu biến mất không một lời nào.
    const trongLich = [
        { maKH: 'A', tenKH: 'A', soTienNgay: 5000000, kieu: 'he_thong' },
        { maKH: 'A', tenKH: 'A', soTienNgay: 5000000, kieu: 'tu_chon' },
    ];
    const ghep = HenGio.ghepVoiBang(trongLich, [{ maKH: 'A', tenKH: 'A', doanhThu: 1234567 }], true);
    const r = ApDung.apDung({ trongLich, ghep });
    const tien = r.chay.map(x => x.soTien).sort((a, b) => a - b);
    assert.deepStrictEqual(tien, [1234567, 5000000],
        'mất một tờ khi hai ô đặt trùng giờ');
    assert.strictEqual(r.chay.filter(x => x.soTienDat).length, 1,
        'gắn cờ tự chọn cho cả hai -> Sell xếp cả hai vào cột tự chọn');
});

test('⭐⭐ ghepVoiBang MANG CỜ kieu sang, kẻo apDung mất căn cứ', () => {
    const g = HenGio.ghepVoiBang(
        [{ maKH: 'A', tenKH: 'A', kieu: 'he_thong' }, { maKH: 'B', tenKH: 'B', kieu: 'tu_chon' }],
        [{ maKH: 'A', tenKH: 'A', doanhThu: 100 }], true);
    assert.strictEqual(g.chay[0].kieu, 'he_thong', 'nhánh chạy đánh rơi cờ');
    assert.strictEqual(g.thieu[0].kieu, 'tu_chon', 'nhánh thiếu đánh rơi cờ');
});

test('⭐⭐ mục he_thong GIỮ doanh thu, dù khách có đặt số ở lượt kia', () => {
    // Bản cũ đoán qua sự có mặt của `soTienNgay` -> mục hệ thống của chính
    // khách ấy cũng bị thay bằng số đã đặt, mất hẳn lượt xuất theo doanh thu.
    const r = ApDung.apDung({
        trongLich: [{ maKH: 'A', tenKH: 'A', soTienNgay: 5000000, kieu: 'he_thong' }],
        ghep: ghepMau,
    });
    assert.strictEqual(r.coAiDat, false, 'mốc hệ thống lại rẽ sang nhánh số đã đặt');
    assert.strictEqual(r.chay[0].soTien, 1234567, 'lượt hệ thống bị thay bằng số đã đặt');
    assert.ok(!r.chay[0].soTienDat, 'gắn nhầm cờ tự chọn -> Sell xếp sai cột');
});

test('⭐ mục tu_chon lấy ĐÚNG số đã đặt', () => {
    const r = ApDung.apDung({
        trongLich: [{ maKH: 'A', tenKH: 'A', soTienNgay: 5000000, kieu: 'tu_chon' }],
        ghep: { chay: [], thieu: [] },
    });
    assert.strictEqual(r.chay.length, 1);
    assert.strictEqual(r.chay[0].soTien, 5000000);
    assert.strictEqual(r.chay[0].soTienDat, 5000000);
});

test('⭐ mục tu_chon chạy KỂ CẢ khi hôm nay không có doanh thu', () => {
    const r = ApDung.apDung({
        trongLich: [{ maKH: 'A', tenKH: 'A', soTienNgay: 5000000, kieu: 'tu_chon' }],
        ghep: { chay: [], thieu: [{ maKH: 'A', tenKH: 'A', lyDo: 'chưa phát sinh' }] },
    });
    assert.strictEqual(r.chay.length, 1, 'cả điểm của tính năng là xuất cho doanh số ngày cũ');
});

test('gói KHÔNG có cờ kieu (dựng tay) vẫn chạy nếp cũ', () => {
    const r = ApDung.apDung({
        trongLich: [{ maKH: 'A', tenKH: 'A', soTienNgay: 5000000 }],
        ghep: ghepMau,
    });
    assert.strictEqual(r.chay[0].soTien, 5000000);
});

ghiChu('── MỐC THUẦN TỰ CHỌN: không cần bảng doanh thu ──');

test('⭐⭐ mốc toàn mục tu_chon -> nhận ra là không cần bảng', () => {
    assert.strictEqual(ApDung.mocThuanTuChon(
        [{ maKH: 'A', kieu: 'tu_chon' }, { maKH: 'B', kieu: 'tu_chon' }]), true);
});

test('⭐ lẫn một mục he_thong là VẪN phải đọc bảng', () => {
    assert.strictEqual(ApDung.mocThuanTuChon(
        [{ maKH: 'A', kieu: 'tu_chon' }, { maKH: 'B', kieu: 'he_thong' }]), false,
        'bỏ đọc bảng thì mục hệ thống không có doanh thu để xuất');
});

test('mốc rỗng thì KHÔNG coi là thuần tự chọn', () => {
    assert.strictEqual(ApDung.mocThuanTuChon([]), false);
});

test('⭐⭐ tiến trình nền bỏ qua cửa "đọc được bảng chưa" cho mốc thuần tự chọn', () => {
    const nen = doc('background.js');
    assert.match(nen, /const thuanTuChon = self\.HDT_ApDungSoDat\.mocThuanTuChon\(trongLich\)/,
        'không hỏi -> một trang báo cáo hỏng giết chết lượt hóa đơn không liên quan');
    assert.match(nen, /const tinCay = thuanTuChon/,
        'vẫn chặn vì bảng -> lượt tự chọn mất hóa đơn hoàn toàn vô cớ');
    assert.match(nen, /thuanTuChon\s*\n?\s*\?\s*\{ chay: \[\], thieu: \[\]/,
        'vẫn gọi ghepVoiBang với bảng rỗng -> mọi khách bị kể là không có doanh thu');
});

ghiChu('── GIAO DIỆN ──');

const CC = 'sell/chenCot.js';

// ⚠️ MẤY BÀI DƯỚI ĐÂY DỰNG BẢNG CÀI ĐẶT THẬT rồi bấm vào nó. Bản đầu tôi soi
// chữ trong mã nguồn, và vòng gài lỗi chứng minh nó vô dụng: đổi tên lớp CSS ở
// chỗ TẠO ô tích (giữ nguyên chỗ ĐỌC) là ô tích mất hẳn tác dụng, mà test vẫn
// xanh vì chuỗi ấy còn nằm ở chỗ đọc.
function dungBang(caiDat) {
    const dom = new JSDOM(taoTrang());
    const cua = dom.window;
    const daGui = [];
    cua.chrome = {
        runtime: {
            sendMessage: async (tin) => {
                daGui.push(tin);
                if (tin.loai === 'hdt-hoi-cai-dat') return caiDat;
                if (tin.loai === 'hdt-ket-qua-hen-gio') return { ok: true, sapToi: [] };
                if (tin.loai === 'hdt-dat-cai-dat') return { ok: true, ...caiDat };
                if (tin.loai === 'hdt-tinh-trang-san-sang') {
                    return { ok: true, muc: [], sanSang: true, chanBoi: [] };
                }
                if (tin.loai === 'hdt-lich-su-chay') return { ok: true, ds: [] };
                return null;
            },
            onMessage: { addListener: () => {} },
        },
    };
    return { cua, tailieu: cua.document, daGui,
             bang: cua.document.getElementById('tableKhachHang') };
}

async function moBang(caiDat) {
    const t = dungBang(caiDat);
    ChenCot.chenVao(t.bang);
    await ChenCot.moBangCaiDat(t.bang);
    return t;
}

const CAI_DAT_MAU = {
    tuBam: true, daHieu: true,
    henGio: { bat: true, moc: ['09:00'], khach: [] },
};

const nhip = async () => { await doiMotNhip(); await doiMotNhip(); };

test('⭐⭐ ô tích và ô giờ tự chọn CÓ THẬT trên màn hình', async () => {
    const { tailieu } = await moBang(CAI_DAT_MAU);
    const ds = tailieu.getElementById('hdt-hen-ds-khach');
    assert.ok(ds.querySelector('input.hdt-bat-ht'), 'không có ô tích cột hệ thống');
    assert.ok(ds.querySelector('input.hdt-bat-tc'), 'không có ô tích cột tự chọn');
    assert.ok(ds.querySelector('input.hdt-gio-tien'),
        'không có ô giờ cho lượt tiền/ngày — đúng thứ chủ dự án hỏi');
});

test('⭐⭐⭐ BẤM THẬT rồi LƯU: cờ và giờ mới đi được tới tiến trình nền', async () => {
    // Bài chứng minh cả tính năng đã nối dây xong. Đổi tên lớp CSS ở một đầu là
    // bài này đỏ ngay, dù chuỗi ấy còn nằm ở đầu kia.
    const { tailieu, daGui } = await moBang(CAI_DAT_MAU);
    const ds = tailieu.getElementById('hdt-hen-ds-khach');
    const o = ds.querySelector('input.hdt-tick-hen');
    const ma = o.dataset.ma;
    o.checked = true;
    ds.querySelector('input.hdt-bat-ht[data-ma="' + ma + '"]').checked = false;
    ds.querySelector('input.hdt-bat-tc[data-ma="' + ma + '"]').checked = true;
    ds.querySelector('input.hdt-tien-ngay[data-ma="' + ma + '"]').value = '5000000';
    ds.querySelector('input.hdt-gio-tien[data-ma="' + ma + '"]').value = '10:30';

    tailieu.getElementById('hdt-luu-cai-dat').click();
    await nhip();

    const tin = daGui.filter(t => t.loai === 'hdt-dat-cai-dat').pop();
    assert.ok(tin, 'bấm Lưu mà không gửi gì đi');
    const k = ((tin.henGio || {}).khach || []).find(x => x.maKH === ma);
    assert.ok(k, 'khách vừa tích không có trong gói gửi đi');
    assert.strictEqual(k.batHeThong, false, 'tắt tích hệ thống mà vẫn gửi đi là bật');
    assert.strictEqual(k.batTuChon, true, 'bật tích tự chọn mà không gửi đi');
    assert.strictEqual(k.mocTien, '10:30', 'giờ tiền/ngày gõ xong bấm Lưu là mất');
    assert.strictEqual(String(k.soTienNgay), '5000000');
});

test('⭐⭐ BẤM THẬT: gõ tiền mà quên giờ thì màn hình KÊU LÊN', async () => {
    const { tailieu } = await moBang(CAI_DAT_MAU);
    const ds = tailieu.getElementById('hdt-hen-ds-khach');
    const o = ds.querySelector('input.hdt-tick-hen');
    const ma = o.dataset.ma;
    o.checked = true;
    ds.querySelector('input.hdt-bat-tc[data-ma="' + ma + '"]').checked = true;
    const oTien = ds.querySelector('input.hdt-tien-ngay[data-ma="' + ma + '"]');
    oTien.value = '5000000';
    oTien.dispatchEvent(new tailieu.defaultView.Event('input', { bubbles: true }));
    await nhip();

    const ghi = tailieu.getElementById('hdt-hen-khach');
    assert.match(ghi.textContent, /CHƯA ĐIỀN GIỜ/,
        'im lặng -> bấm Lưu thấy bình thường rồi chờ mãi một tờ không bao giờ tới');
    assert.ok(ghi.classList.contains('hdt-do'), 'kêu bằng chữ xám, không ai để ý');
});

test('⭐⭐ BẤM THẬT: tắt cả hai cột thì màn hình KÊU LÊN', async () => {
    const { tailieu } = await moBang(CAI_DAT_MAU);
    const ds = tailieu.getElementById('hdt-hen-ds-khach');
    const o = ds.querySelector('input.hdt-tick-hen');
    const ma = o.dataset.ma;
    o.checked = true;
    ds.querySelector('input.hdt-bat-ht[data-ma="' + ma + '"]').checked = false;
    ds.dispatchEvent(new tailieu.defaultView.Event('change', { bubbles: true }));
    await nhip();

    const ghi = tailieu.getElementById('hdt-hen-khach');
    assert.match(ghi.textContent, /TẮT CẢ HAI cột/,
        'khách có tên trong lịch mà không chạy lượt nào — hỏng im lặng');
});

test('⭐ mở lại bảng thì ô giờ tự chọn hiện đúng giờ đã lưu', async () => {
    const { tailieu } = await moBang({
        ...CAI_DAT_MAU,
        henGio: { bat: true, moc: ['09:00'], khach: [
            { maKH: 'PA', tenKH: 'PA', soTienNgay: 5000000, mocTien: '10:30',
              batHeThong: false, batTuChon: true },
        ] },
    });
    const ds = tailieu.getElementById('hdt-hen-ds-khach');
    const g = ds.querySelector('input.hdt-gio-tien[data-ma="PA"]');
    assert.ok(g, 'không thấy dòng của khách đã lưu');
    assert.strictEqual(g.value, '10:30', 'giờ đã lưu không hiện lại — tưởng bị mất');
    assert.strictEqual(ds.querySelector('input.hdt-bat-tc[data-ma="PA"]').checked, true);
    assert.strictEqual(ds.querySelector('input.hdt-bat-ht[data-ma="PA"]').checked, false,
        'tắt tích rồi lưu, mở lên vẫn thấy bật');
});

test('⭐⭐ đường lưu gom đủ cờ và giờ mới', () => {
    const v = doc(CC);
    const t = v.slice(v.indexOf('const dsKhachDaTick'));
    const than = t.slice(0, t.indexOf('capNhatGhiTran'));
    assert.match(than, /if \(mocTien\) k2\.mocTien = mocTien;/,
        'không lưu giờ tự chọn -> gõ xong bấm Lưu là mất');
    // Phải gửi CẢ KHI false, kẻo bộ chuẩn hoá tưởng là bản ghi cũ và bật lại.
    assert.match(than, /batHeThong: bHT \? !!bHT\.checked : true/);
    assert.match(than, /batTuChon: bTC \? !!bTC\.checked : false/);
});

test('⭐⭐ kêu lên khi gõ tiền mà quên gõ giờ', () => {
    const v = doc(CC);
    assert.match(v, /khachThieuGioTien/,
        'im lặng -> bấm Lưu thấy mọi thứ bình thường rồi chờ mãi một tờ không tới');
    assert.match(v, /CHƯA ĐIỀN GIỜ/);
});

test('⭐ kêu lên khi tắt cả hai cột', () => {
    const v = doc(CC);
    assert.match(v, /TẮT CẢ HAI cột/,
        'khách có tên trong lịch mà không chạy lượt nào — cũng là hỏng im lặng');
});

test('⭐ gõ vào ô giờ tự chọn thì lời nhắc tính lại ngay', () => {
    const v = doc(CC);
    const t = v.slice(v.indexOf("oKhach.addEventListener('input'"));
    assert.match(t.slice(0, 700), /hdt-gio-tien/,
        'cảnh báo "chưa điền giờ" không bao giờ tắt dù người dùng đã điền');
});

test('lời dẫn nói rõ luật một-lần-mỗi-ngày CHỈ áp cho lượt hệ thống', () => {
    const v = doc(CC);
    assert.match(v, /Lượt XUẤT THEO HỆ THỐNG mỗi khách chỉ chạy ĐÚNG MỘT lần mỗi ngày/);
    assert.match(v, /Lượt TIỀN\/NGÀY nằm ngoài luật này/,
        'không nói ra -> người đọc tưởng máy đang phá luật cũ');
});

ghiChu('── Không phá nếp cũ ──');

test('⭐ luật MỘT MỐC CHUNG mỗi ngày vẫn còn (gõ nhiều giờ chỉ giữ sớm nhất)', () => {
    assert.deepStrictEqual(HenGio.chuanMoc(['21:00', '09:00', '15:00']), ['09:00']);
});

test('⭐ phiên bản KHÔNG tụt về trước bản mang tính năng này', () => {
    const so = (v) => String(v).split('.').map(Number);
    const [a, b, c] = so(JSON.parse(doc('manifest.json')).version);
    const [x, y, z] = so('2.35.0');
    assert.ok(a !== x ? a > x : (b !== y ? b > y : c >= z),
        'phiên bản tụt về trước 2.35.0 — bản đó chưa có hai lịch tách rời');
});

chay('HAI LỊCH TÁCH RỜI');
