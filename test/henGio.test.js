'use strict';

// Test HẸN GIỜ và CÀI ĐẶT — hai module logic thuần, không cần jsdom.
//
// Bài quan trọng nhất ở đây KHÔNG phải "hẹn đúng giờ", mà là "lúc không có ai
// ngồi trước máy thì mọi thứ mập mờ đều trả lời KHÔNG".

const assert = require('node:assert');
const { test, ghiChu, chay } = require('./chay');
const HenGio = require('../chung/henGio');
const CaiDat = require('../chung/caiDat');

const luc = (chuoi) => new Date(chuoi).getTime();

ghiChu('— Đọc mốc giờ người dùng gõ —');

test('nhận "9:5", "09:05", "9h5" đều ra 09:05', () => {
    for (const v of ['9:5', '09:05', '9 : 5', '9h5', '9H05']) {
        assert.strictEqual(HenGio.chuanMotMoc(v), '09:05', `hỏng với "${v}"`);
    }
});

test('giờ/phút ngoài khoảng → null, không tự bẻ về 0', () => {
    for (const v of ['24:00', '23:60', '-1:00', 'abc', '', null, '9', '9:']) {
        assert.strictEqual(HenGio.chuanMotMoc(v), null, `nhận bừa "${v}"`);
    }
});

test('danh sách mốc: bỏ cái sai, bỏ trùng, sắp theo thứ tự trong ngày', () => {
    assert.deepStrictEqual(
        HenGio.chuanMocThoDai(['21:00', 'xxx', '9:00', '09:00', '14:30']),
        ['09:00', '14:30', '21:00']);
});

test('⭐ MỖI NGÀY ĐÚNG MỘT MỐC — giữ giờ sớm nhất, bỏ phần còn lại', () => {
    // Chủ dự án chọn cách A ngày 2026-08-13. Vì máy lấy "doanh thu hôm nay tính
    // tới lúc chạy": 09:00 xuất 500.000, tới 21:00 doanh thu hôm nay đã là
    // 2.000.000 thì nó xuất tiếp 2.000.000 — buổi sáng bị tính hai lần.
    assert.deepStrictEqual(HenGio.chuanMoc(['21:00', '09:00', '14:30']), ['09:00']);
    assert.deepStrictEqual(HenGio.chuanMoc([]), []);
});

test('⭐ mốc bị bỏ phải KỂ RA được, không lặng lẽ cắt bớt', () => {
    const kq = HenGio.chuanMocKeRo(['21:00', '09:00', '14:30']);
    assert.deepStrictEqual(kq.giu, ['09:00']);
    assert.deepStrictEqual(kq.boDi, ['14:30', '21:00']);
});

test('⭐ chốt chống trùng cũ KHÔNG cứu được — nên phải chặn từ mốc giờ', () => {
    // timLanXuatGanDay đòi trùng CẢ SỐ TIỀN. Doanh thu sáng khác doanh thu tối
    // nên nó không bắt được. Đây là lý do luật một-mốc phải nằm ở tầng cài đặt.
    const so = require('../chung/soGhiDau');
    assert.ok(so.KHOANG_TRUNG_MAC_DINH > 0);
});

test('tên báo thức đi và về khớp nhau', () => {
    const ten = HenGio.tenBaoThuc('09:00');
    assert.strictEqual(HenGio.mocTuTen(ten), '09:00');
    assert.strictEqual(HenGio.mocTuTen('bao-thuc-cua-ai-do'), null,
        'nhận nhầm báo thức của thứ khác — sẽ chạy hóa đơn vì một cái hẹn lạ');
});

ghiChu('— Lần kế tiếp —');

test('mốc còn ở phía trước trong ngày → hôm nay', () => {
    const khi = HenGio.lanKeTiep('14:00', luc('2026-08-13T09:00:00'));
    assert.strictEqual(new Date(khi).getHours(), 14);
    assert.strictEqual(new Date(khi).getDate(), 13);
});

test('mốc đã trôi qua → ngày mai', () => {
    const khi = HenGio.lanKeTiep('09:00', luc('2026-08-13T14:00:00'));
    assert.strictEqual(new Date(khi).getDate(), 14);
    assert.strictEqual(new Date(khi).getHours(), 9);
});

test('⭐ mốc TRÙNG ĐÚNG phút hiện tại → đẩy sang mai, không chạy ngay', () => {
    // Lưu lịch lúc 09:00:30 cho mốc 09:00 mà chạy ngay lập tức thì người dùng
    // vừa bấm Lưu đã thấy máy phát hành hóa đơn — không kịp hiểu chuyện gì.
    const khi = HenGio.lanKeTiep('09:00', luc('2026-08-13T09:00:30'));
    assert.strictEqual(new Date(khi).getDate(), 14, 'chạy ngay lúc vừa bấm Lưu');
});

test('mốc 00:00 sau nửa đêm vẫn ra ngày mai, không âm', () => {
    const khi = HenGio.lanKeTiep('00:00', luc('2026-08-13T00:00:00'));
    assert.ok(khi > luc('2026-08-13T00:00:00'));
    assert.strictEqual(new Date(khi).getDate(), 14);
});

test('dựng lịch: đúng MỘT báo thức, mốc sai bị loại', () => {
    const ds = HenGio.dungLich(['09:00', 'sai', '21:00'], luc('2026-08-13T10:00:00'));
    assert.strictEqual(ds.length, 1, 'dựng nhiều hơn một báo thức trong ngày');
    assert.deepStrictEqual(ds.map(b => b.moc), ['09:00']);
    assert.ok(ds.every(b => b.khi > luc('2026-08-13T10:00:00')));
});

ghiChu('— ⛔ Tới giờ rồi: khi nào KHÔNG được chạy —');

const lichDu = {
    tuBam: true, daHieu: true, docDuoc: true,
    henGio: { bat: true, moc: ['09:00'], khach: [{ maKH: 'KH1', tenKH: 'a' }] },
};

test('đủ điều kiện → chạy', () => {
    const kq = HenGio.duocChay({ caiDat: lichDu, soLenhTreo: 0, dangChay: false });
    assert.strictEqual(kq.chay, true, kq.thongBao);
});

test('⛔ đọc cài đặt hỏng → KHÔNG chạy', () => {
    const kq = HenGio.duocChay({ caiDat: { ...lichDu, docDuoc: false } });
    assert.strictEqual(kq.chay, false);
    assert.strictEqual(kq.lyDo, HenGio.LY_DO.KHONG_DOC_DUOC_CAI_DAT);
});

test('⛔ công tắc TỰ BẤM đang tắt → KHÔNG chạy, nói rõ vì sao', () => {
    // Chạy lúc 3 giờ sáng để lại một giỏ đầy không ai bấm là vô ích, lại chặn
    // luôn lần sau vì giỏ phải trống mới chạy được.
    const kq = HenGio.duocChay({ caiDat: { ...lichDu, tuBam: false } });
    assert.strictEqual(kq.chay, false);
    assert.strictEqual(kq.lyDo, HenGio.LY_DO.CHUA_BAT_TU_BAM);
    assert.match(kq.thongBao, /giỏ/);
});

test('⛔ bật công tắc nhưng CHƯA xác nhận đã hiểu → KHÔNG chạy', () => {
    const kq = HenGio.duocChay({ caiDat: { ...lichDu, daHieu: false } });
    assert.strictEqual(kq.chay, false);
    assert.strictEqual(kq.lyDo, HenGio.LY_DO.CHUA_BAT_TU_BAM);
});

test('⭐ đang có lệnh treo VẪN CHẠY — chủ dự án chốt 2026-08-13', () => {
    // "không cần quan tâm trùng hay không, chỉ cần có lệnh chạy là chạy".
    // Đánh đổi đã được chấp nhận: có thể ra hóa đơn trùng.
    const kq = HenGio.duocChay({ caiDat: lichDu, soLenhTreo: 2 });
    assert.strictEqual(kq.chay, true, kq.thongBao);
});

test('⭐ lệnh treo chỉ còn là THÔNG TIN, không phải cửa chặn', () => {
    const t = HenGio.kiemSanSang({ caiDat: lichDu, soLenhTreo: 3, coTabBang: true });
    assert.strictEqual(t.sanSang, true, JSON.stringify(t.chanBoi));
    const m = t.muc.find(x => x.ten === 'Lệnh treo');
    assert.strictEqual(m.chan, false, 'vẫn để lệnh treo chặn hẹn giờ');
    assert.match(m.chu, /KHÔNG chặn/);
});

test('⛔ đang chạy dở một loạt → bỏ qua lần hẹn này', () => {
    const kq = HenGio.duocChay({ caiDat: lichDu, dangChay: true });
    assert.strictEqual(kq.chay, false);
    assert.strictEqual(kq.lyDo, HenGio.LY_DO.DANG_CHAY);
});

test('⛔ lịch tắt / không mốc / không khách → KHÔNG chạy', () => {
    const tat = { ...lichDu, henGio: { ...lichDu.henGio, bat: false } };
    assert.strictEqual(HenGio.duocChay({ caiDat: tat }).lyDo, HenGio.LY_DO.TAT);
    const khongMoc = { ...lichDu, henGio: { ...lichDu.henGio, moc: [] } };
    assert.strictEqual(HenGio.duocChay({ caiDat: khongMoc }).lyDo, HenGio.LY_DO.KHONG_CO_MOC);
    const khongKhach = { ...lichDu, henGio: { ...lichDu.henGio, khach: [] } };
    assert.strictEqual(HenGio.duocChay({ caiDat: khongKhach }).lyDo, HenGio.LY_DO.KHONG_CO_KHACH);
});

ghiChu('— ⭐ Tới giờ thì ĐỌC LẠI SỐ TỪ BẢNG —');

test('⭐ lấy doanh thu MỚI trong bảng, không lấy số đã lưu lúc đặt hẹn', () => {
    const lich = [{ maKH: 'KH1', tenKH: 'hoa' }, { maKH: 'KH2', tenKH: 'tiền' }];
    const bang = [{ maKH: 'KH1', tenKH: 'hoa', doanhThu: 1676320 },
                  { maKH: 'KH2', tenKH: 'tiền', doanhThu: 1142016 }];
    const { chay: ds, thieu } = HenGio.ghepVoiBang(lich, bang);
    assert.strictEqual(thieu.length, 0);
    assert.deepStrictEqual(ds.map(k => k.soTien), [1676320, 1142016]);
});

test('⭐ khách HÔM NAY chưa phát sinh → bỏ qua và NÓI RÕ, không im lặng', () => {
    // Bảng dựng từ đơn hàng TRONG KHOẢNG NGÀY rồi gom theo khách. Hôm nay khách
    // không mua gì thì không có dòng nào để gom — họ biến mất khỏi bảng. Đây là
    // chuyện BÌNH THƯỜNG, không phải lỗi.
    const lich = [{ maKH: 'KH1', tenKH: 'hoa' }, { maKH: 'MAT', tenKH: 'ai đó' }];
    const bang = [{ maKH: 'KH1', tenKH: 'hoa', doanhThu: 500000 }];
    const kq = HenGio.ghepVoiBang(lich, bang);
    assert.strictEqual(kq.chay.length, 1);
    assert.strictEqual(kq.thieu.length, 1);
    assert.match(kq.thieu[0].lyDo, /chưa phát sinh doanh thu/);
    assert.strictEqual(kq.tinCay, true);
});

test('⭐ doanh thu ÂM (trả hàng của đơn hôm trước) → KHÔNG xuất hóa đơn', () => {
    // Bảng cộng -tong_tien_tra nên hôm nay chỉ trả hàng là ra số âm. Xuất hóa
    // đơn cho số âm là vô nghĩa.
    const kq = HenGio.ghepVoiBang([{ maKH: 'K1', tenKH: 'hoa' }],
                                  [{ maKH: 'K1', tenKH: 'hoa', doanhThu: -300000 }]);
    assert.strictEqual(kq.chay.length, 0);
    assert.match(kq.thieu[0].lyDo, /âm/);
    assert.match(kq.thieu[0].lyDo, /trả hàng nhiều hơn bán/);
});

test('⭐ ba lý do bỏ qua phải NÓI KHÁC NHAU, không gộp làm một', () => {
    const kq = HenGio.ghepVoiBang(
        [{ maKH: 'A' }, { maKH: 'B' }, { maKH: 'C' }],
        [{ maKH: 'B', doanhThu: 0 }, { maKH: 'C', doanhThu: -5 }]);
    const ly = kq.thieu.map(x => x.lyDo);
    assert.strictEqual(new Set(ly).size, 3, 'ba tình huống khác nhau mà nói giống nhau');
});

test('⛔ BẢNG CHƯA TIN CẬY → không kết luận khách nào cả', () => {
    // Bảng tải hỏng thì MỌI khách đều "không có dòng", và máy sẽ báo "hôm nay cả
    // lịch đều im" trong khi sự thật là nó không đọc được gì. Đúng kiểu lỗi đã
    // dính một lần rồi (đọc cài đặt hỏng bị hiểu nhầm thành công tắc tắt).
    const kq = HenGio.ghepVoiBang([{ maKH: 'K1' }], [], false);
    assert.strictEqual(kq.tinCay, false);
    assert.strictEqual(kq.chay.length, 0);
    assert.strictEqual(kq.thieu.length, 0, 'kết luận bừa là khách không có doanh thu');
    assert.match(kq.thongBao, /KHÔNG kết luận/);
});

test('cả lịch không ai phát sinh → không có gì để chạy, và KHÔNG phải lỗi', () => {
    const kq = HenGio.ghepVoiBang([{ maKH: 'A' }, { maKH: 'B' }], []);
    assert.strictEqual(kq.chay.length, 0);
    assert.strictEqual(kq.thieu.length, 2);
    assert.strictEqual(kq.tinCay, true);
});

test('⭐ doanh thu 0 → KHÔNG tạo hóa đơn cho khách đó', () => {
    const kq = HenGio.ghepVoiBang([{ maKH: 'KH1' }],
                                  [{ maKH: 'KH1', tenKH: 'x', doanhThu: 0 }]);
    assert.strictEqual(kq.chay.length, 0);
    assert.match(kq.thieu[0].lyDo, /doanh thu bằng 0/);
});

test('tên khách lấy theo bảng mới, vì người dùng có thể đã đổi tên', () => {
    const kq = HenGio.ghepVoiBang([{ maKH: 'KH1', tenKH: 'tên cũ' }],
                                  [{ maKH: 'KH1', tenKH: 'tên mới', doanhThu: 100 }]);
    assert.strictEqual(kq.chay[0].tenKH, 'tên mới');
});

ghiChu('— Độ lệch tự cài —');

test('mặc định vẫn là 200.000 — không đổi hành vi cũ khi chưa cài gì', () => {
    assert.strictEqual(CaiDat.chuanDungSai(null), 200000);
    assert.strictEqual(CaiDat.chuanDungSai(''), 200000);
    assert.strictEqual(CaiDat.tuKho({}).dungSai, 200000);
});

test('gõ tiền có dấu chấm/phẩy vẫn đọc được', () => {
    assert.strictEqual(CaiDat.chuanDungSai('500.000'), 500000);
    assert.strictEqual(CaiDat.chuanDungSai(' 500,000 '), 500000);
    assert.strictEqual(CaiDat.chuanDungSai(500000), 500000);
});

test('⭐ gõ bậy KHÔNG ra 0 — dung sai 0 là đòi khớp từng đồng', () => {
    // Ra 0 thì gần như không khách nào ghép được, và người dùng sẽ tưởng máy
    // hỏng chứ không nghĩ là do mình gõ sai.
    assert.strictEqual(CaiDat.chuanDungSai('abc'), 200000);
    assert.strictEqual(CaiDat.chuanDungSai(-5), 200000);
    assert.strictEqual(CaiDat.chuanDungSai(NaN), 200000);
});

test('cho phép đặt 0 một cách CÓ CHỦ Ý (gõ đúng số 0)', () => {
    assert.strictEqual(CaiDat.chuanDungSai(0), 0);
    assert.strictEqual(CaiDat.chuanDungSai('0'), 0);
});

ghiChu('— Gộp cài đặt: lưu chỗ này không được xóa chỗ kia —');

test('⭐ lưu độ lệch KHÔNG làm tắt các công tắc', () => {
    const cu = { tuBam: true, daHieu: true, xoaGioLa: true, boQuaThue: true };
    const moi = CaiDat.gop(cu, { dungSai: 300000 }, HenGio);
    assert.strictEqual(moi.dungSai, 300000);
    assert.strictEqual(moi.tuBam, true);
    assert.strictEqual(moi.boQuaThue, true);
    assert.strictEqual(moi.xoaGioLa, true);
});

test('⭐ gạt công tắc KHÔNG làm mất lịch hẹn đã đặt', () => {
    const cu = CaiDat.gop({}, {
        henGio: { bat: true, moc: ['09:00'], khach: [{ maKH: 'KH1' }] },
    }, HenGio);
    const moi = CaiDat.gop(cu, { boQuaThue: true }, HenGio);
    assert.deepStrictEqual(moi.henGio.moc, ['09:00']);
    assert.strictEqual(moi.henGio.khach.length, 1);
});

test('tắt công tắc tự bấm thì dấu "đã hiểu" cũng mất theo', () => {
    const cu = { tuBam: true, daHieu: true };
    const moi = CaiDat.gop(cu, { tuBam: false, daHieu: true }, HenGio);
    assert.strictEqual(moi.daHieu, false, 'giữ dấu đã hiểu → lần bật sau bỏ qua xác nhận');
});

test('⭐ bật lịch mà chưa có mốc hoặc chưa chọn khách → tự TẮT, không hứa suông', () => {
    const a = CaiDat.gop({}, { henGio: { bat: true, moc: [], khach: [{ maKH: 'K' }] } }, HenGio);
    assert.strictEqual(a.henGio.bat, false);
    const b = CaiDat.gop({}, { henGio: { bat: true, moc: ['09:00'], khach: [] } }, HenGio);
    assert.strictEqual(b.henGio.bat, false);
});

test('khách trùng mã bị gộp, mã rỗng bị loại', () => {
    const c = CaiDat.gop({}, {
        henGio: { bat: true, moc: ['09:00'],
                  khach: [{ maKH: 'K1' }, { maKH: 'K1' }, { maKH: '' }, { maKH: 'K2' }] },
    }, HenGio);
    assert.deepStrictEqual(c.henGio.khach.map(k => k.maKH), ['K1', 'K2']);
});

test('đọc kho hỏng → mọi công tắc TẮT và docDuoc=false', () => {
    const c = CaiDat.khiDocHong();
    assert.strictEqual(c.docDuoc, false);
    assert.strictEqual(c.tuBam, false);
    assert.strictEqual(c.henGio.bat, false);
    assert.strictEqual(c.dungSai, 200000);
});


ghiChu('— ⭐ GIỜ RIÊNG TỪNG KHÁCH —');

// Chủ dự án chốt 2026-08-13: khách có giờ riêng thì GIỜ CHUNG KHÔNG đụng tới nữa.
// Quên điều này là khách chạy hai lần trong một ngày và ra hai hóa đơn.

const lichRieng = {
    bat: true, moc: ['11:23'],
    khach: [{ maKH: 'S5', tenKH: 'Ngọc Lan' },
            { maKH: 'S3', tenKH: 'Thùy Dương', moc: '09:00' },
            { maKH: 'S1', tenKH: 'Bích Ngọc', moc: '9:0' }],
};

test('⭐ khách có giờ riêng → KHÔNG nằm trong lượt giờ chung', () => {
    const nhom = HenGio.gomTheoMoc(lichRieng);
    assert.deepStrictEqual(nhom.map(o => o.moc), ['09:00', '11:23']);
    assert.deepStrictEqual(HenGio.khachCuaMoc(lichRieng, '11:23').map(k => k.maKH), ['S5'],
        'giờ chung vẫn ôm cả khách có giờ riêng');
});

test('⭐ nhiều khách cùng một giờ riêng → gộp chung MỘT lượt', () => {
    assert.deepStrictEqual(HenGio.khachCuaMoc(lichRieng, '09:00').map(k => k.maKH),
                           ['S3', 'S1']);
});

test('giờ riêng gõ kiểu "9:0" vẫn hiểu là 09:00', () => {
    assert.deepStrictEqual(HenGio.gomTheoMoc(lichRieng).map(o => o.moc), ['09:00', '11:23']);
});

test('⭐ giờ riêng TRÙNG giờ chung → MỘT mốc, khách KHÔNG bị lặp', () => {
    // Hai báo thức cùng giờ thì lượt sau đụng khóa chống chạy chồng và bị bỏ qua.
    const h = { bat: true, moc: ['09:00'],
                khach: [{ maKH: 'A' }, { maKH: 'B', moc: '09:00' }] };
    const nhom = HenGio.gomTheoMoc(h);
    assert.strictEqual(nhom.length, 1, 'dựng hai mốc trùng giờ');
    assert.deepStrictEqual(nhom[0].khach.map(k => k.maKH), ['A', 'B']);
    assert.strictEqual(HenGio.dungLich(h, luc('2026-08-13T07:00:00')).length, 1);
});

test('⭐ CHỈ có giờ riêng, không đặt giờ chung → vẫn chạy được', () => {
    const h = { bat: true, moc: [], khach: [{ maKH: 'A', moc: '21:00' }] };
    assert.deepStrictEqual(HenGio.gomTheoMoc(h).map(o => o.moc), ['21:00']);
    assert.strictEqual(HenGio.dungLich(h, luc('2026-08-13T07:00:00')).length, 1);
    const kq = HenGio.duocChay({
        caiDat: { tuBam: true, daHieu: true, docDuoc: true, henGio: h } });
    assert.strictEqual(kq.chay, true, kq.thongBao);
});

test('⭐ khách KHÔNG có giờ nào (chưa đặt giờ chung) phải kể ra được', () => {
    // Nếu im lặng thì khách đó không bao giờ chạy mà chẳng ai biết.
    const h = { bat: true, moc: [], khach: [{ maKH: 'A' }, { maKH: 'B', moc: '21:00' }] };
    assert.deepStrictEqual(HenGio.khachKhongCoGio(h).map(k => k.maKH), ['A']);
    assert.deepStrictEqual(HenGio.khachKhongCoGio(lichRieng), [],
        'có giờ chung thì không ai lạc lối');
});

test('giờ chung còn đặt nhưng không còn khách nào theo nó → mốc vẫn hiện', () => {
    const h = { bat: true, moc: ['11:00'], khach: [{ maKH: 'A', moc: '09:00' }] };
    const nhom = HenGio.gomTheoMoc(h);
    assert.deepStrictEqual(nhom.map(o => o.moc), ['09:00', '11:00']);
    assert.strictEqual(nhom.find(o => o.moc === '11:00').khach.length, 0);
});

test('⭐ mỗi mốc dựng ĐÚNG MỘT báo thức, sắp theo giờ trong ngày', () => {
    const ds = HenGio.dungLich(lichRieng, luc('2026-08-13T07:00:00'));
    assert.deepStrictEqual(ds.map(b => b.moc), ['09:00', '11:23']);
    assert.strictEqual(new Set(ds.map(b => b.ten)).size, 2, 'tên báo thức trùng nhau');
});

test('⭐ hai mốc quá sát → cảnh báo, vì lượt sau sẽ bị bỏ qua', () => {
    // Máy chạy tuần tự, mỗi khách nửa phút tới một phút.
    const h = { moc: ['09:00'], khach: [{ maKH: 'A' }, { maKH: 'B', moc: '09:02' }] };
    assert.deepStrictEqual(HenGio.mocQuaSat(h), [['09:00', '09:02']]);
    const xa = { moc: ['09:00'], khach: [{ maKH: 'A' }, { maKH: 'B', moc: '10:00' }] };
    assert.deepStrictEqual(HenGio.mocQuaSat(xa), []);
});

test('⭐ tình trạng sẵn sàng kể TỪNG MỐC chạy cho mấy khách', () => {
    const t = HenGio.kiemSanSang({
        caiDat: { tuBam: true, daHieu: true, docDuoc: true, henGio: lichRieng },
        soLenhTreo: 0, coTabBang: true });
    const m = t.muc.find(x => x.ten === 'Lịch hẹn');
    assert.match(m.chu, /09:00 \(2 khách\)/);
    assert.match(m.chu, /11:23 \(1 khách\)/);
    assert.strictEqual(t.sanSang, true, JSON.stringify(t.chanBoi));
});

test('⭐ khách lạc lối (không giờ nào) hiện ĐỎ trong tình trạng sẵn sàng', () => {
    const t = HenGio.kiemSanSang({
        caiDat: { tuBam: true, daHieu: true, docDuoc: true,
                  henGio: { bat: true, moc: [], khach: [{ maKH: 'A', tenKH: 'hoa' },
                                                        { maKH: 'B', moc: '21:00' }] } },
        soLenhTreo: 0, coTabBang: true });
    const m = t.muc.find(x => x.ten === 'Khách trong lịch');
    assert.match(m.chu, /CHƯA CÓ GIỜ NÀO/);
    assert.match(m.chu, /hoa/);
});

test('mốc quá sát KHÔNG chặn chạy — chỉ nhắc', () => {
    const t = HenGio.kiemSanSang({
        caiDat: { tuBam: true, daHieu: true, docDuoc: true,
                  henGio: { bat: true, moc: ['09:00'],
                            khach: [{ maKH: 'A' }, { maKH: 'B', moc: '09:02' }] } },
        soLenhTreo: 0, coTabBang: true });
    assert.strictEqual(t.sanSang, true);
    const m = t.muc.find(x => x.ten === 'Khoảng cách giữa các mốc');
    assert.match(m.chu, /dưới 5 phút/);
});

test('⛔ TẮT công tắc tổng → giờ RIÊNG cũng KHÔNG chạy', () => {
    // Chốt của chủ dự án 2026-08-13: "Tự chạy theo giờ đã hẹn" là công tắc TỔNG.
    // Cần đúng MỘT chỗ để tắt sạch mọi thứ tự động — nếu giờ riêng vẫn chạy khi
    // đã tắt thì rất dễ tưởng tắt rồi mà đêm vẫn ra hóa đơn.
    const kq = HenGio.duocChay({
        caiDat: { tuBam: true, daHieu: true, docDuoc: true,
                  henGio: { bat: false, moc: [], khach: [{ maKH: 'A', moc: '21:00' }] } } });
    assert.strictEqual(kq.chay, false);
    assert.strictEqual(kq.lyDo, HenGio.LY_DO.TAT);
});

test('⛔ tắt công tắc tổng → nền KHÔNG dựng báo thức nào', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const ma = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
    const than = ma.slice(ma.indexOf('async function dungLaiBaoThuc'));
    const iTat = than.indexOf('if (!c.henGio.bat) return');
    const iDung = than.indexOf('dungLich(');
    assert.ok(iTat > 0, 'không có cửa chặn theo công tắc tổng');
    assert.ok(iTat < iDung, 'dựng báo thức trước khi xét công tắc tổng');
});

ghiChu('— ⭐ Lưu giờ riêng —');

test('⭐ giờ riêng được giữ lại khi lưu', () => {
    const c = CaiDat.gop({}, { henGio: { bat: true, moc: ['11:00'],
        khach: [{ maKH: 'A' }, { maKH: 'B', moc: '9:0' }] } }, HenGio);
    assert.strictEqual(c.henGio.khach[0].moc, undefined, 'tự gán giờ riêng cho khách không có');
    assert.strictEqual(c.henGio.khach[1].moc, '09:00');
});

test('⭐ giờ riêng gõ BẬY thì bỏ hẳn, coi như theo giờ chung', () => {
    // Thà chạy theo giờ chung còn hơn giữ một mốc vô nghĩa rồi không bao giờ chạy.
    const c = CaiDat.gop({}, { henGio: { bat: true, moc: ['11:00'],
        khach: [{ maKH: 'A', moc: '25:99' }, { maKH: 'B', moc: 'abc' }] } }, HenGio);
    assert.strictEqual(c.henGio.khach[0].moc, undefined);
    assert.strictEqual(c.henGio.khach[1].moc, undefined);
    assert.deepStrictEqual(HenGio.khachCuaMoc(c.henGio, '11:00').map(k => k.maKH), ['A', 'B']);
});

test('⭐ bật lịch mà CHỈ có giờ riêng (không giờ chung) → vẫn bật được', () => {
    const c = CaiDat.gop({}, { henGio: { bat: true, moc: [],
        khach: [{ maKH: 'A', moc: '21:00' }] } }, HenGio);
    assert.strictEqual(c.henGio.bat, true, 'tắt oan lịch chỉ có giờ riêng');
});

test('không giờ chung, cũng không giờ riêng nào → lịch tự TẮT', () => {
    const c = CaiDat.gop({}, { henGio: { bat: true, moc: [], khach: [{ maKH: 'A' }] } }, HenGio);
    assert.strictEqual(c.henGio.bat, false);
});

ghiChu('— Nối dây —');

test('⭐ nền chạy ĐÚNG khách của mốc đó, không chạy cả lịch', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const ma = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
    const than = ma.slice(ma.indexOf('async function chayTheoHen'),
                          ma.indexOf('async function kiemTraThu'));
    assert.match(than, /khachCuaMoc\(c\.henGio, moc\)/, 'không lọc khách theo mốc');
    assert.ok(!/ghepVoiBang\(c\.henGio\.khach/.test(than),
        'vẫn ghép cả danh sách khách — khách có giờ riêng sẽ chạy hai lần');
});

test('⭐ nền dựng báo thức cho MỌI mốc, kể cả giờ riêng', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const ma = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
    const than = ma.slice(ma.indexOf('async function dungLaiBaoThuc'));
    assert.match(than.slice(0, 900), /dungLich\(c\.henGio,/,
        'chỉ dựng báo thức cho giờ chung — giờ riêng không bao giờ nổ');
});

chay('HẸN GIỜ VÀ ĐỘ LỆCH TỰ CÀI');
