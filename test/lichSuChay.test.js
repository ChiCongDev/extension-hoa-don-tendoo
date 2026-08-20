'use strict';

// Test LỊCH SỬ CHẠY và TÌNH TRẠNG SẴN SÀNG.
//
// ⚠️ Máy chạy lúc KHÔNG CÓ AI NGỒI XEM. Hai thứ này là toàn bộ những gì người
// dùng có để biết chuyện gì đã xảy ra. Sai ở đây thì hỏng cũng không ai biết.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { test, ghiChu, chay } = require('./chay');
const LS = require('../chung/lichSuChay');
const HenGio = require('../chung/henGio');

const doc = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

ghiChu('— Một lần chạy: khách nào thành công, khách nào không —');

const lich = [{ maKH: 'A', tenKH: 'hoa' }, { maKH: 'B', tenKH: 'tiền' },
              { maKH: 'C', tenKH: 'kiên' }, { maKH: 'D', tenKH: 'công' }];

test('⭐ mỗi khách có đúng MỘT dòng kết quả, không sót ai', () => {
    const b = LS.taoBanGhi({
        chay: true, trongLich: lich,
        thieu: [{ maKH: 'D', tenKH: 'công', lyDo: 'hôm nay chưa phát sinh doanh thu' }],
        ketQua: {
            xong: [{ maKH: 'A', tenKH: 'hoa', soTien: 500000,
                     ketQua: { daBamThanhToan: true, tong: 500000, lech: 0 } }],
            loi: [{ maKH: 'B', tenKH: 'tiền', soTien: 300000,
                    maLoi: 'SAI_TAI_KHOAN', thongBao: 'Kho hàng không thuộc cửa hàng' }],
        },
    });
    assert.strictEqual(b.khach.length, 4, 'mất khách');
    assert.deepStrictEqual(b.khach.map(k => k.maKH).sort(), ['A', 'B', 'C', 'D']);
});

test('⭐ "XONG" mà chưa bấm Thanh toán thì KHÔNG được ghi là đã ra hóa đơn', () => {
    // Đã có lần báo "Xong 2 khách" trong khi chỉ có 1 hóa đơn. Hai trạng thái
    // này phải tách hẳn, nếu không lịch sử nói dối.
    const b = LS.taoBanGhi({
        chay: true, trongLich: [{ maKH: 'A' }],
        ketQua: { xong: [{ maKH: 'A', soTien: 1, ketQua: { daBamThanhToan: false } }] },
    });
    assert.strictEqual(b.khach[0].ket, LS.KET.VAO_GIO);
    assert.strictEqual(b.dem.raHoaDon, 0);
    assert.strictEqual(b.dem.vaoGio, 1);
    assert.match(b.khach[0].chiTiet, /tự bấm đang tắt/);
});

test('bấm Thanh toán rồi → RA_HOA_DON, kèm tổng và độ lệch', () => {
    const b = LS.taoBanGhi({
        chay: true, trongLich: [{ maKH: 'A' }],
        ketQua: { xong: [{ maKH: 'A', soTien: 500000,
                           ketQua: { daBamThanhToan: true, tong: 490000, lech: 10000 } }] },
    });
    assert.strictEqual(b.khach[0].ket, LS.KET.RA_HOA_DON);
    assert.strictEqual(b.khach[0].tongTendoo, 490000);
    assert.strictEqual(b.khach[0].lech, 10000);
    assert.strictEqual(b.dem.raHoaDon, 1);
});

test('⭐ TREO đè lên mọi trạng thái khác — nó là thứ nguy hiểm nhất', () => {
    // Treo nghĩa là KHÔNG BIẾT hóa đơn đã ra hay chưa. Để một dòng "xong" lấp
    // mất nó là người dùng bỏ qua đúng thứ cần xử lý.
    const b = LS.taoBanGhi({
        chay: true, trongLich: [{ maKH: 'A' }],
        ketQua: {
            xong: [{ maKH: 'A', soTien: 1, ketQua: { daBamThanhToan: true } }],
            treo: [{ maKH: 'A', soTien: 1, thongBao: 'không rõ đã phát hành chưa' }],
        },
    });
    assert.strictEqual(b.khach[0].ket, LS.KET.TREO);
    assert.strictEqual(b.dem.treo, 1);
    assert.strictEqual(b.dem.raHoaDon, 0);
});

test('⭐ loạt dừng giữa chừng → khách phía sau ghi "chưa chạy tới", không biến mất', () => {
    const b = LS.taoBanGhi({
        chay: true, trongLich: lich,
        ketQua: { xong: [{ maKH: 'A', soTien: 1, ketQua: { daBamThanhToan: true } }],
                  dung: true, ly_do: 'SAI_TAI_KHOAN' },
    });
    assert.strictEqual(b.dem.chuaChay, 3);
    assert.ok(b.khach.filter(k => k.ket === LS.KET.CHUA_CHAY).every(k => k.maKH !== 'A'));
});

test('bỏ qua giữ NGUYÊN VĂN lý do — ba lý do khác nhau phải đọc ra khác nhau', () => {
    const b = LS.taoBanGhi({
        chay: true, trongLich: [{ maKH: 'A' }, { maKH: 'B' }, { maKH: 'C' }],
        thieu: [{ maKH: 'A', lyDo: 'hôm nay chưa phát sinh doanh thu' },
                { maKH: 'B', lyDo: 'doanh thu bằng 0 — mua rồi trả hết trong ngày' },
                { maKH: 'C', lyDo: 'doanh thu âm (-300000) — trả hàng nhiều hơn bán' }],
    });
    const ly = b.khach.map(k => k.chiTiet);
    assert.strictEqual(new Set(ly).size, 3);
    assert.strictEqual(b.dem.boQua, 3);
});

test('lần KHÔNG chạy cũng được ghi, kèm lý do', () => {
    const b = LS.taoBanGhi({
        chay: false, lyDo: 'CO_LENH_TREO', thongBao: 'Đang có 2 lệnh treo',
        trongLich: lich,
    });
    assert.strictEqual(b.chay, false);
    assert.match(LS.tomTat(b), /KHÔNG chạy/);
    assert.match(LS.tomTat(b), /2 lệnh treo/);
    assert.strictEqual(b.khach.length, 4, 'không kể ra khách nào bị lỡ');
});

test('tóm tắt đọc được bằng mắt, không phải mã máy', () => {
    const b = LS.taoBanGhi({
        chay: true, trongLich: [{ maKH: 'A' }, { maKH: 'B' }],
        thieu: [{ maKH: 'B', lyDo: 'x' }],
        ketQua: { xong: [{ maKH: 'A', ketQua: { daBamThanhToan: true } }] },
    });
    assert.match(LS.tomTat(b), /1 ra hóa đơn/);
    assert.match(LS.tomTat(b), /1 bỏ qua/);
});

ghiChu('— Giữ nhiều lần, không đè lên nhau —');

test('⭐ mới nhất lên đầu', () => {
    let ds = [];
    ds = LS.themVao(ds, { luc: 1 });
    ds = LS.themVao(ds, { luc: 2 });
    assert.deepStrictEqual(ds.map(b => b.luc), [2, 1]);
});

test('⭐ cắt bớt khi quá giới hạn — kho Chrome có hạn, phình là hỏng cả kho', () => {
    let ds = [];
    for (let i = 0; i < 80; i++) ds = LS.themVao(ds, { luc: i }, 60);
    assert.strictEqual(ds.length, 60);
    assert.strictEqual(ds[0].luc, 79, 'cắt nhầm đầu — mất lần mới nhất');
});

test('lịch sử hỏng / chưa có → vẫn thêm được, không nổ', () => {
    assert.strictEqual(LS.themVao(null, { luc: 1 }).length, 1);
    assert.strictEqual(LS.themVao('bậy bạ', { luc: 1 }).length, 1);
});

ghiChu('— ⭐ Tới giờ có chạy được không —');

const duHet = {
    tuBam: true, daHieu: true, docDuoc: true,
    henGio: { bat: true, moc: ['09:00'], khach: [{ maKH: 'A' }] },
};

test('đủ mọi thứ → SẴN SÀNG', () => {
    const t = HenGio.kiemSanSang({ caiDat: duHet, soLenhTreo: 0, dangChay: false,
                                   coTabBang: true });
    assert.strictEqual(t.sanSang, true, JSON.stringify(t.chanBoi));
    assert.strictEqual(t.chanBoi.length, 0);
});

test('⭐ LỆNH TREO vẫn hiện số lượng, nhưng KHÔNG chặn nữa', () => {
    // Chủ dự án chốt 2026-08-13: có lệnh là chạy. Vẫn phải hiện ra để biết,
    // chỉ không dùng làm cửa chặn.
    const t = HenGio.kiemSanSang({ caiDat: duHet, soLenhTreo: 2, coTabBang: true });
    assert.strictEqual(t.sanSang, true, JSON.stringify(t.chanBoi));
    assert.ok(!t.chanBoi.includes('Lệnh treo'));
    const m = t.muc.find(x => x.ten === 'Lệnh treo');
    assert.match(m.chu, /2 lệnh/);
    assert.match(m.chu, /KHÔNG chặn/);
});

test('⭐ chưa chọn khách → chặn, và nói rõ lịch sẽ không bật được', () => {
    const t = HenGio.kiemSanSang({
        caiDat: { ...duHet, henGio: { ...duHet.henGio, khach: [] } }, coTabBang: true });
    assert.strictEqual(t.sanSang, false);
    assert.ok(t.chanBoi.includes('Khách trong lịch'));
});

test('⭐ công tắc tự bấm tắt → chặn', () => {
    const t = HenGio.kiemSanSang({ caiDat: { ...duHet, tuBam: false }, coTabBang: true });
    assert.strictEqual(t.sanSang, false);
    assert.ok(t.chanBoi.includes('Công tắc tự bấm Thanh toán'));
});

test('chưa có tab báo cáo → KHÔNG chặn, vì máy tự mở được', () => {
    const t = HenGio.kiemSanSang({ caiDat: duHet, soLenhTreo: 0, coTabBang: false });
    assert.strictEqual(t.sanSang, true);
    const m = t.muc.find(x => x.ten === 'Tab trang báo cáo');
    assert.strictEqual(m.dat, false);
    assert.strictEqual(m.chan, false);
    assert.match(m.chu, /tự mở/);
});

test('⭐ mọi mục chặn đều phải nói CÁCH CHỮA, không chỉ báo hỏng', () => {
    const t = HenGio.kiemSanSang({
        caiDat: { tuBam: false, daHieu: false, henGio: { bat: false, moc: [], khach: [] } },
        soLenhTreo: 3, coTabBang: false });
    for (const m of t.muc.filter(x => x.chan && !x.dat)) {
        assert.ok(m.chu && m.chu.length > 10, `mục "${m.ten}" không nói gì hữu ích`);
    }
});

ghiChu('— Nối dây —');

test('⭐ hẹn giờ ghi lịch sử ở MỌI nhánh, kể cả nhánh không chạy', () => {
    const ma = doc('background.js');
    const than = ma.slice(ma.indexOf('async function chayTheoHen'),
                          ma.indexOf('async function kiemTraThu'));
    const soGhi = (than.match(/ghiKetQuaVaLichSu/g) || []).length;
    const soThoat = (than.match(/\n        return;/g) || []).length;
    assert.ok(soGhi >= 4, `chỉ ghi lịch sử ở ${soGhi} nhánh — có nhánh thoát im lặng`);
    assert.ok(soGhi >= soThoat, 'có nhánh thoát mà không ghi lại gì');
});

test('⭐ chạy TAY cũng vào lịch sử — một nguồn sự thật duy nhất', () => {
    const ma = doc('background.js');
    const than = ma.slice(ma.indexOf('TAO_HOA_DON'));
    assert.match(than.slice(0, 2000), /NGUON\.TAY/, 'chạy tay không được ghi lại');
});

test('⛔ KIỂM TRA THỬ tuyệt đối KHÔNG đụng Tendoo', () => {
    // Một cái nút "chạy thử" mà phát hành hóa đơn thật là tai họa.
    const ma = doc('background.js');
    const than = ma.slice(ma.indexOf('async function kiemTraThu'),
                          ma.indexOf('chrome.alarms.onAlarm'));
    assert.ok(!/taoHoaDon/.test(than), 'kiểm tra thử lại gọi tạo hóa đơn thật');
    assert.ok(!/dungCauNoi/.test(than), 'kiểm tra thử lại dựng cầu nối sang Tendoo');
    assert.ok(!/URL_POS|tabs\.create/.test(than), 'kiểm tra thử lại mở tab Tendoo');
});

test('mất lịch sử KHÔNG được làm hỏng lần chạy', () => {
    const ma = doc('background.js');
    const than = ma.slice(ma.indexOf('async function ghiLichSu'));
    assert.match(than.slice(0, 600), /catch/, 'ghi lịch sử hỏng là nổ cả lần chạy');
});

chay('LỊCH SỬ CHẠY VÀ TÌNH TRẠNG SẴN SÀNG');
