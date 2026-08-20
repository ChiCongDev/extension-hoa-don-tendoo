'use strict';

// Test BẢNG CÀI ĐẶT trên trang báo cáo Sell: độ lệch tự cài và hẹn giờ tự chạy.
// Chạy: node test/bangCaiDat.test.js   (cần HDT_JSDOM)
//
// ⚠️ Hẹn giờ là con đường DUY NHẤT máy phát hành hóa đơn khi KHÔNG CÓ AI NGỒI
// TRƯỚC MÁY. Phần lớn bài ở đây là kiểm chuyện "nói thật với người dùng trước
// khi họ bật", chứ không phải chuyện vẽ đẹp.

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

const GOC = path.join(__dirname, '..');
const doc = (f) => fs.readFileSync(path.join(GOC, f), 'utf8');

/**
 * Trang giả có gắn một `chrome.runtime` giả, ghi lại mọi tin đã gửi đi.
 */
function dungTrang({ caiDat = {}, tinhTrang = null, traLuu = null,
                     sanSang = null, lichSu = null, thu = null } = {}) {
    const dom = new JSDOM(taoTrang());
    const cua = dom.window;
    const daGui = [];
    cua.chrome = {
        runtime: {
            sendMessage: async (tin) => {
                daGui.push(tin);
                if (tin.loai === 'hdt-hoi-cai-dat') return caiDat;
                if (tin.loai === 'hdt-ket-qua-hen-gio') return tinhTrang || { ok: true, sapToi: [] };
                if (tin.loai === 'hdt-dat-cai-dat') {
                    return traLuu || { ok: true, dungSai: 300000,
                                       henGio: { bat: true, moc: ['09:00'], khach: [{ maKH: 'K' }] } };
                }
                if (tin.loai === 'hdt-tinh-trang-san-sang') {
                    return sanSang || { ok: true, muc: [], sanSang: true, chanBoi: [] };
                }
                if (tin.loai === 'hdt-lich-su-chay') return lichSu || { ok: true, ds: [] };
                if (tin.loai === 'hdt-kiem-tra-thu') return thu || { ok: true, chay: [], thieu: [] };
                return null;
            },
            onMessage: { addListener: (f) => { cua.__tai = f; } },
        },
    };
    const tailieu = cua.document;
    const bang = tailieu.getElementById('tableKhachHang');
    return { dom, cua, tailieu, bang, daGui };
}

const tick = (bang, ma) => {
    const o = bang.querySelector(`input.hdt-tick[data-ma="${ma}"]`);
    if (o) { o.checked = true; }
    return o;
};

ghiChu('— Cửa vào: nút cài đặt luôn có mặt —');

test('nút ⚙ nằm ở TIÊU ĐỀ bảng — chỗ luôn hiện, không phải thanh nổi', () => {
    // Thanh nổi chỉ hiện khi đã tích khách. Độ lệch thì phải cài được bất cứ lúc nào.
    const { tailieu, bang } = dungTrang();
    ChenCot.chenVao(bang);
    const nut = tailieu.getElementById('hdt-nut-cai-dat');
    assert.ok(nut, 'không có nút mở bảng cài đặt');
    assert.ok(bang.querySelector('thead').contains(nut), 'nút không nằm ở tiêu đề bảng');
});

test('chèn cột hai lần KHÔNG sinh hai nút cài đặt', () => {
    const { tailieu, bang } = dungTrang();
    ChenCot.chenVao(bang);
    ChenCot.chenVao(bang);
    assert.strictEqual(tailieu.querySelectorAll('#hdt-nut-cai-dat').length, 1);
});

ghiChu('— Độ lệch tự cài —');

test('mở bảng thấy đúng mức đang lưu, không phải mức mặc định', async () => {
    const { tailieu, bang } = dungTrang({ caiDat: { dungSai: 350000 } });
    await ChenCot.moBangCaiDat(bang);
    assert.strictEqual(tailieu.getElementById('hdt-o-do-lech').value, '350.000');
});

test('chưa cài gì thì vẫn là 200.000 — không đổi hành vi cũ', async () => {
    const { tailieu, bang } = dungTrang({ caiDat: {} });
    await ChenCot.moBangCaiDat(bang);
    assert.strictEqual(tailieu.getElementById('hdt-o-do-lech').value, '200.000');
});

test('⭐ đặt cao hơn 200.000 → CẢNH BÁO ngay lúc gõ, nói rõ hậu quả', async () => {
    // Nới độ lệch là hóa đơn lệch xa doanh thu thật hơn — số này đi vào tờ khai
    // thuế. Không chặn (đó là quyền của chủ), nhưng phải nói thẳng.
    const { tailieu, bang } = dungTrang({ caiDat: {} });
    await ChenCot.moBangCaiDat(bang);
    const o = tailieu.getElementById('hdt-o-do-lech');
    o.value = '900000';
    o.dispatchEvent(new tailieu.defaultView.Event('input'));
    const ghi = tailieu.getElementById('hdt-ghi-do-lech');
    assert.ok(ghi.classList.contains('hdt-do'), 'không tô cảnh báo');
    assert.match(ghi.textContent, /thuế/, 'không nói hậu quả về thuế');
});

test('mức 200.000 trở xuống → giải thích bình thường, không dọa', async () => {
    const { tailieu, bang } = dungTrang({ caiDat: {} });
    await ChenCot.moBangCaiDat(bang);
    const ghi = tailieu.getElementById('hdt-ghi-do-lech');
    assert.ok(!ghi.classList.contains('hdt-do'));
    assert.match(ghi.textContent, /không quá 200\.000đ/);
});

test('lưu gửi đúng tin, và độ lệch đi kèm nguyên văn người dùng gõ', async () => {
    const { tailieu, bang, daGui } = dungTrang({ caiDat: {} });
    await ChenCot.moBangCaiDat(bang);
    tailieu.getElementById('hdt-o-do-lech').value = '300.000';
    tailieu.getElementById('hdt-luu-cai-dat').click();
    await doiMotNhip();
    const luu = daGui.find(t => t.loai === 'hdt-dat-cai-dat');
    assert.ok(luu, 'không gửi tin lưu');
    assert.strictEqual(luu.dungSai, '300.000');
});

ghiChu('— Hẹn giờ: nói thật trước khi bật —');

test('⭐ công tắc tự bấm TẮT → nói thẳng hẹn giờ sẽ KHÔNG chạy', async () => {
    const { tailieu, bang } = dungTrang({ caiDat: { tuBam: false } });
    await ChenCot.moBangCaiDat(bang);
    const c = tailieu.getElementById('hdt-hen-canh-bao');
    assert.match(c.textContent, /KHÔNG chạy/, 'không nói rõ là sẽ không chạy');
});

test('⭐ công tắc tự bấm BẬT → nói thẳng máy sẽ PHÁT HÀNH THẬT lúc vắng người', async () => {
    const { tailieu, bang } = dungTrang({ caiDat: { tuBam: true, daHieu: true } });
    await ChenCot.moBangCaiDat(bang);
    const c = tailieu.getElementById('hdt-hen-canh-bao');
    assert.match(c.textContent, /HÓA ĐƠN THẬT/);
    assert.match(c.textContent, /không có\s+ai ngồi đây|không có ai ngồi đây/);
});

test('⭐ phải nói rõ TẮT MÁY thì không có gì chạy — không hứa suông', async () => {
    // Ở đây không có máy chủ nào. Người dùng phải biết điều đó trước khi tin.
    const { tailieu, bang } = dungTrang({ caiDat: { tuBam: true, daHieu: true } });
    await ChenCot.moBangCaiDat(bang);
    assert.match(tailieu.getElementById('hdt-hen-canh-bao').textContent,
                 /Máy tính tắt|Chrome đóng/);
});

test('⭐ CHỌN KHÁCH NGAY TRONG BẢNG — không còn luật "tích trước rồi mở"', async () => {
    // Bản trước đọc danh sách khách LÚC MỞ bảng, mà bảng cài đặt lại che mất
    // bảng khách. Người dùng mở ra, bật hẹn giờ, bấm Lưu, rồi nhận "Hẹn giờ TẮT"
    // mà không hiểu vì sao. Đó là cái bẫy do mình dựng ra.
    const { tailieu, bang } = dungTrang({ caiDat: {} });
    ChenCot.chenVao(bang);
    await ChenCot.moBangCaiDat(bang);
    const ds = tailieu.getElementById('hdt-hen-ds-khach');
    assert.ok(ds, 'không có danh sách khách trong bảng cài đặt');
    assert.ok(ds.querySelectorAll('input.hdt-tick-hen').length >= 3,
        'không liệt kê khách trên bảng để chọn ngay tại đây');
});

test('chưa chọn khách nào → báo ĐỎ, không phải chữ xám lẫn vào đám ghi chú', async () => {
    const { tailieu, bang } = dungTrang({ caiDat: {} });
    ChenCot.chenVao(bang);
    await ChenCot.moBangCaiDat(bang);
    const o = tailieu.getElementById('hdt-hen-khach');
    assert.match(o.textContent, /CHƯA CHỌN KHÁCH NÀO/);
    assert.ok(o.classList.contains('hdt-do'), 'cảnh báo mà không tô đỏ thì không ai thấy');
});

test('⭐ nút Lưu NÓI TRƯỚC hậu quả, không để bấm xong mới biết', async () => {
    const { tailieu, bang } = dungTrang({ caiDat: {} });
    ChenCot.chenVao(bang);
    await ChenCot.moBangCaiDat(bang);
    const oBat = tailieu.getElementById('hdt-hen-bat');
    oBat.checked = true;
    oBat.dispatchEvent(new tailieu.defaultView.Event('change'));
    assert.match(tailieu.getElementById('hdt-luu-cai-dat').textContent,
                 /KHÔNG bật.*chưa chọn khách/);
});

test('⭐ khách đã có trong lịch được TÍCH SẴN — lưu lại không mất', async () => {
    const { tailieu, bang, daGui } = dungTrang({
        caiDat: { henGio: { bat: true, moc: ['09:00'],
                            khach: [{ maKH: 'PA', tenKH: 'Phương Anh - PA' }] } },
    });
    ChenCot.chenVao(bang);
    await ChenCot.moBangCaiDat(bang);
    const o = tailieu.querySelector('input.hdt-tick-hen[data-ma="PA"]');
    assert.ok(o && o.checked, 'khách trong lịch không được tích sẵn');
    tailieu.getElementById('hdt-luu-cai-dat').click();
    await doiMotNhip();
    const luu = daGui.find(t => t.loai === 'hdt-dat-cai-dat');
    assert.deepStrictEqual(luu.henGio.khach.map(k => k.maKH), ['PA']);
});

test('⭐ khách trong lịch mà KHÔNG còn trên bảng vẫn hiện ra, không mất im lặng', async () => {
    const { tailieu, bang } = dungTrang({
        caiDat: { henGio: { bat: true, moc: ['09:00'],
                            khach: [{ maKH: 'CU', tenKH: 'khách cũ' }] } },
    });
    ChenCot.chenVao(bang);
    await ChenCot.moBangCaiDat(bang);
    const o = tailieu.querySelector('input.hdt-tick-hen[data-ma="CU"]');
    assert.ok(o, 'khách trong lịch biến mất khỏi bảng chọn — lưu một phát là mất họ');
    assert.ok(o.checked);
    assert.match(o.parentElement.textContent, /không còn trên bảng/);
});

test('có tích khách → lưu gửi đúng danh sách đó', async () => {
    const { tailieu, bang, daGui } = dungTrang({ caiDat: {} });
    ChenCot.chenVao(bang);
    tick(bang, 'PA');
    await ChenCot.moBangCaiDat(bang);
    tailieu.getElementById('hdt-hen-bat').checked = true;
    tailieu.getElementById('hdt-hen-moc').value = '09:00, 21:00';
    tailieu.getElementById('hdt-luu-cai-dat').click();
    await doiMotNhip();
    const luu = daGui.find(t => t.loai === 'hdt-dat-cai-dat');
    assert.strictEqual(luu.henGio.bat, true);
    assert.deepStrictEqual(luu.henGio.moc, ['09:00', '21:00']);
    assert.strictEqual(luu.henGio.khach.length, 1);
    assert.strictEqual(luu.henGio.khach[0].maKH, 'PA');
});

test('⭐ lưu kèm ĐỊA CHỈ trang, để tới giờ máy mở đúng bảng này', async () => {
    // bongtom.store và 127.0.0.1:8000 là hai nơi khác nhau; đoán bừa là đọc
    // nhầm bảng của môi trường kia rồi ra hóa đơn theo số của môi trường kia.
    const { tailieu, bang, daGui } = dungTrang({ caiDat: {} });
    await ChenCot.moBangCaiDat(bang);
    tailieu.getElementById('hdt-luu-cai-dat').click();
    await doiMotNhip();
    const luu = daGui.find(t => t.loai === 'hdt-dat-cai-dat');
    assert.ok(luu.henGio.urlBang, 'không lưu địa chỉ trang báo cáo');
});

ghiChu('— ⭐ Mỗi ngày ĐÚNG MỘT mốc giờ —');

test('⭐ bảng nói rõ mỗi ngày chỉ một giờ, và vì sao', async () => {
    const { tailieu, bang } = dungTrang({ caiDat: {} });
    await ChenCot.moBangCaiDat(bang);
    const g = tailieu.getElementById('hdt-hen-ghi-moc');
    assert.ok(g, 'không giải thích luật một mốc');
    assert.match(g.textContent, /MỘT/);
    assert.match(g.textContent, /trùng/, 'không nói vì sao chỉ một mốc');
});

test('⭐ bảng nói rõ máy sẽ ép về "Hôm nay" và kiểm lại', async () => {
    const { tailieu, bang } = dungTrang({ caiDat: {} });
    await ChenCot.moBangCaiDat(bang);
    const g = tailieu.getElementById('hdt-hen-ghi-ngay');
    assert.match(g.textContent, /Hôm nay/);
    assert.match(g.textContent, /Từ … đến …|kiểm/);
    assert.match(g.textContent, /chưa phát sinh doanh thu/,
        'không nói trước chuyện khách không có doanh thu thì bị bỏ qua');
});

test('⭐ gõ NHIỀU giờ → máy giữ một, và NÓI RÕ đã bỏ, không lặng lẽ cắt', async () => {
    const { tailieu, bang } = dungTrang({
        caiDat: {},
        traLuu: { ok: true, dungSai: 200000,
                  henGio: { bat: true, moc: ['09:00'], khach: [{ maKH: 'K' }] } },
    });
    ChenCot.chenVao(bang);
    tick(bang, 'PA');
    await ChenCot.moBangCaiDat(bang);
    tailieu.getElementById('hdt-hen-bat').checked = true;
    tailieu.getElementById('hdt-hen-moc').value = '09:00, 14:30, 21:00';
    tailieu.getElementById('hdt-luu-cai-dat').click();
    await doiMotNhip();
    const bao = tailieu.getElementById('hdt-cai-dat-bao');
    assert.match(bao.textContent, /chỉ giữ giờ sớm nhất/);
    assert.match(bao.textContent, /09:00/);
});

test('gõ đúng một giờ → không có câu nhắc thừa', async () => {
    const { tailieu, bang } = dungTrang({
        caiDat: {},
        traLuu: { ok: true, dungSai: 200000,
                  henGio: { bat: true, moc: ['21:00'], khach: [{ maKH: 'K' }] } },
    });
    ChenCot.chenVao(bang);
    tick(bang, 'PA');
    await ChenCot.moBangCaiDat(bang);
    tailieu.getElementById('hdt-hen-moc').value = '21:00';
    tailieu.getElementById('hdt-luu-cai-dat').click();
    await doiMotNhip();
    assert.ok(!/chỉ giữ giờ sớm nhất/.test(tailieu.getElementById('hdt-cai-dat-bao').textContent));
});

ghiChu('— Kể lại lần hẹn gần nhất, vì lúc đó không ai ngồi xem —');

test('⭐ khách bị bỏ qua phải KỂ TÊN và LÝ DO', async () => {
    const { tailieu, bang } = dungTrang({
        caiDat: { tuBam: true, daHieu: true },
        tinhTrang: { ok: true, sapToi: [],
                     ketQua: { moc: '21:00', luc: Date.now(), chay: true, soKhach: 1,
                               ngay: { tu: '13/08/2026', den: '13/08/2026' },
                               thieu: [{ maKH: 'K2', tenKH: 'tiền',
                                         lyDo: 'hôm nay chưa phát sinh doanh thu' }] } },
    });
    await ChenCot.moBangCaiDat(bang);
    const o = tailieu.getElementById('hdt-hen-bo-qua');
    assert.ok(o, 'không kể khách bị bỏ qua');
    assert.match(o.textContent, /tiền/);
    assert.match(o.textContent, /chưa phát sinh doanh thu/);
});

test('⭐ nói rõ số liệu của NGÀY nào — không để đoán', async () => {
    const { tailieu, bang } = dungTrang({
        caiDat: { tuBam: true, daHieu: true },
        tinhTrang: { ok: true, sapToi: [],
                     ketQua: { moc: '21:00', luc: Date.now(), chay: true, soKhach: 2,
                               ngay: { tu: '13/08/2026', den: '13/08/2026' } } },
    });
    await ChenCot.moBangCaiDat(bang);
    assert.match(tailieu.getElementById('hdt-hen-tinh-trang').textContent,
                 /số liệu ngày 13\/08\/2026/);
});

test('⭐ ngày yên ả (không ai phát sinh) → nói rõ, và KHÔNG coi là lỗi', async () => {
    const { tailieu, bang } = dungTrang({
        caiDat: { tuBam: true, daHieu: true },
        tinhTrang: { ok: true, sapToi: [],
                     ketQua: { moc: '21:00', luc: Date.now(), chay: false,
                               lyDo: 'KHONG_KHACH_NAO_PHAT_SINH',
                               ngay: { tu: '13/08/2026', den: '13/08/2026' },
                               thongBao: 'Hôm nay (13/08/2026) không khách nào trong lịch '
                                   + 'phát sinh doanh thu để tạo hóa đơn. Lịch giữ nguyên, '
                                   + 'mai chạy tiếp.' } },
    });
    await ChenCot.moBangCaiDat(bang);
    const t = tailieu.getElementById('hdt-hen-tinh-trang').textContent;
    assert.match(t, /không khách nào/);
    assert.match(t, /Lịch giữ nguyên/, 'không trấn an rằng lịch vẫn còn cho hôm sau');
});

test('⭐ lần hẹn KHÔNG chạy → nói rõ lý do', async () => {
    const { tailieu, bang } = dungTrang({
        caiDat: { tuBam: true, daHieu: true },
        tinhTrang: { ok: true, sapToi: [],
                     ketQua: { moc: '09:00', luc: Date.now(), chay: false,
                               lyDo: 'CO_LENH_TREO', thongBao: 'Đang có 2 lệnh treo' } },
    });
    await ChenCot.moBangCaiDat(bang);
    const o = tailieu.getElementById('hdt-hen-tinh-trang');
    assert.ok(o, 'không hiện tình trạng lần hẹn gần nhất');
    assert.match(o.textContent, /KHÔNG chạy/);
    assert.match(o.textContent, /2 lệnh treo/);
});

test('lần hẹn CÓ chạy → nói rõ chạy với mấy khách', async () => {
    const { tailieu, bang } = dungTrang({
        caiDat: { tuBam: true, daHieu: true },
        tinhTrang: { ok: true, sapToi: [{ moc: '21:00', khi: Date.now() + 3600000 }],
                     ketQua: { moc: '09:00', luc: Date.now(), chay: true, soKhach: 3 } },
    });
    await ChenCot.moBangCaiDat(bang);
    const o = tailieu.getElementById('hdt-hen-tinh-trang');
    assert.match(o.textContent, /3 khách/);
    assert.match(o.textContent, /Lần chạy kế tiếp/);
});

ghiChu('— ⭐ Tới giờ: trang Sell trả bảng cho tiến trình nền —');

test('⭐ trả đúng các dòng đang có trên bảng', () => {
    const { cua, tailieu, bang } = dungTrang();
    ChenCot.ganTaiNgheDocBang(tailieu);
    let tra = null;
    const co = cua.__tai({ loai: 'hdt-doc-bang' }, null, (t) => { tra = t; });
    assert.strictEqual(co, true, 'không nhận tin hdt-doc-bang');
    assert.strictEqual(tra.ok, true);
    assert.ok(tra.dong.length >= 1);
    assert.ok(tra.dong.every(d => d.maKH && typeof d.doanhThu === 'number'));
    void bang;
});

test('⭐ tin LẠ thì KHÔNG đụng vào — trang này chỉ trả lời đúng câu hỏi của mình', () => {
    const { cua, tailieu } = dungTrang();
    ChenCot.ganTaiNgheDocBang(tailieu);
    assert.strictEqual(cua.__tai({ loai: 'hdt-xoa-het-di' }, null, () => {}), false);
    assert.strictEqual(cua.__tai(null, null, () => {}), false);
});

test('chưa có bảng → trả ok:false chứ không nổ', () => {
    const { cua, tailieu } = dungTrang();
    tailieu.getElementById('tableKhachHang').remove();
    ChenCot.ganTaiNgheDocBang(tailieu);
    let tra = null;
    cua.__tai({ loai: 'hdt-doc-bang' }, null, (t) => { tra = t; });
    assert.strictEqual(tra.ok, false);
    assert.deepStrictEqual(tra.dong, []);
});

ghiChu('— Nối dây: những thứ chỉ kiểm được bằng mã nguồn —');

test('⭐ nền dựng LẠI báo thức ngay khi lưu lịch, không đợi lần sau', () => {
    // Bấm Lưu xong tắt máy mà báo thức chưa dựng thì chẳng có gì chạy cả.
    const ma = doc('background.js');
    const doan = ma.slice(ma.indexOf("'hdt-dat-cai-dat'"));
    assert.match(doan.slice(0, 900), /dungLaiBaoThuc\(\)/,
        'lưu lịch xong không dựng lại báo thức');
});

test('⭐ nền dựng lại báo thức cả khi Chrome vừa mở lại', () => {
    const ma = doc('background.js');
    assert.match(ma, /onStartup[\s\S]{0,120}dungLaiBaoThuc/, 'mở lại Chrome là mất lịch');
    assert.match(ma, /onInstalled[\s\S]{0,120}dungLaiBaoThuc/, 'cài lại extension là mất lịch');
});

test('⭐ nền CHỈ nhận báo thức của chính mình', () => {
    // Nhận bừa báo thức lạ = phát hành hóa đơn vì một cái hẹn không phải của mình.
    const ma = doc('background.js');
    const doan = ma.slice(ma.indexOf('alarms.onAlarm'));
    assert.match(doan.slice(0, 400), /mocTuTen/, 'không lọc tên báo thức');
    assert.match(doan.slice(0, 400), /if\s*\(!moc\)\s*return/, 'không bỏ qua báo thức lạ');
});

test('⭐ nền đi qua cửa chặn duocChay TRƯỚC khi làm bất cứ gì', () => {
    const ma = doc('background.js');
    const than = ma.slice(ma.indexOf('async function chayTheoHen'));
    const cho = than.indexOf('duocChay');
    const lam = than.indexOf('taoHoaDon');
    assert.ok(cho > 0, 'chạy theo hẹn mà không qua cửa chặn nào');
    assert.ok(cho < lam, 'gọi tạo hóa đơn trước khi kiểm được phép chạy');
});

test('⭐ nền ĐỌC LẠI BẢNG lúc chạy, không dùng số đã chốt lúc đặt hẹn', () => {
    const ma = doc('background.js');
    const than = ma.slice(ma.indexOf('async function chayTheoHen'));
    assert.match(than, /'hdt-doc-bang'/, 'không hỏi bảng để lấy số mới');
    assert.match(than, /ghepVoiBang/, 'không ghép lịch với bảng vừa đọc');
});

test('⭐ độ lệch cài được PHẢI đi tới tận chỗ ghép tiền', () => {
    // Trước đây chỗ này gọi mà không truyền gì nên cài bao nhiêu cũng vô nghĩa.
    //
    // ⚠ Từ 2026-08-18 đường đi DÀI THÊM MỘT CHẶNG: nhanLenh -> lapKeHoach ->
    // ghepSanPham. Đứt chặng nào cũng ra cùng một hậu quả (cài xong vẫn chạy
    // 200.000), nên phải canh CẢ HAI.
    const ma = doc('tendoo/nhanLenh.js');
    const chang1 = ma.slice(ma.indexOf('ChiaHoaDon.lapKeHoach'));
    assert.match(chang1.slice(0, 400), /dungSai:\s*caiDat\.dungSai/,
        'nhanLenh không đưa độ lệch sang bộ lập kế hoạch');

    const kh = doc('chung/chiaHoaDon.js');
    assert.match(kh, /dungSai:\s*Number\(dungSai\)/,
        'bộ lập kế hoạch không đưa độ lệch xuống hàm ghép tiền');
    // Mọi lời gọi ghepSanPham trong đó đều phải mang theo gói tuỳ chọn ấy.
    const soGoi = (kh.match(/ghepSanPham\(/g) || []).length;
    const soMang = (kh.match(/\.\.\.tuyChonGhep/g) || []).length;
    assert.strictEqual(soMang, soGoi,
        `có ${soGoi} lời gọi ghép tiền nhưng chỉ ${soMang} lời mang theo độ lệch`);
});

test('⭐ HÀNH VI: đổi độ lệch thì kết quả lập kế hoạch ĐỔI THẬT', () => {
    // Phép kiểm trên chỉ đọc mã. Phép này chạy thật: cùng số tiền, cùng kho,
    // chỉ khác độ lệch -> phải ra kết quả khác. Không có nó thì đường dây đứt
    // ở chỗ nào đó mà mã nguồn vẫn "trông đúng".
    const ChiaHoaDon = require('../chung/chiaHoaDon');
    const kho = [{ ma: 'A', ten: 'A', gia: 1000000, ton: 20 }];
    const chat = ChiaHoaDon.lapKeHoach({ sanPham: kho, soTien: 2500000, tran: 2000000, dungSai: 1000 });
    const rong = ChiaHoaDon.lapKeHoach({ sanPham: kho, soTien: 2500000, tran: 2000000, dungSai: 600000 });
    assert.notStrictEqual(chat.ma, 'OK', 'độ lệch 1.000 mà vẫn ghép được 2.500.000 từ hàng 1 triệu');
    assert.strictEqual(rong.ma, 'OK', 'độ lệch 600.000 mà vẫn từ chối');
});

test('trang Sell và nền gọi nhau bằng đúng tên tin', () => {
    for (const f of ['background.js', 'sell/chenCot.js']) {
        assert.match(doc(f), /'hdt-doc-bang'/, `${f} không dùng tên tin đọc bảng`);
    }
    for (const f of ['background.js', 'sell/chenCot.js']) {
        assert.match(doc(f), /'hdt-ket-qua-hen-gio'/, `${f} không dùng tên tin kết quả hẹn`);
    }
});


ghiChu('— ⭐ Tới giờ có chạy được không: bày hết ra —');

const HenGio = require('../chung/henGio');

test('⭐ có LỆNH TREO vẫn báo SẴN SÀNG — treo không chặn nữa', async () => {
    // Chủ dự án chốt 2026-08-13: "chỉ cần có lệnh chạy là chạy". Lệnh treo vẫn
    // hiện số lượng để biết, nhưng không còn là cửa chặn.
    const ss = { ok: true, ...HenGio.kiemSanSang({
        caiDat: { tuBam: true, daHieu: true,
                  henGio: { bat: true, moc: ['09:00'], khach: [{ maKH: 'A' }] } },
        soLenhTreo: 2, coTabBang: true }) };
    const { tailieu, bang } = dungTrang({ caiDat: { tuBam: true, daHieu: true }, sanSang: ss });
    await ChenCot.moBangCaiDat(bang);
    await doiMotNhip();
    const o = tailieu.getElementById('hdt-san-sang-than');
    assert.match(o.textContent, /Lệnh treo/, 'không còn hiện số lệnh treo');
    assert.match(o.textContent, /2 lệnh/);
    assert.match(o.textContent, /KHÔNG chặn/);
    const ket = tailieu.getElementById('hdt-san-sang-ket');
    assert.match(ket.textContent, /SẴN SÀNG/);
    assert.ok(!ket.classList.contains('hdt-do'), 'vẫn tô đỏ dù không chặn');
});

test('⭐ CHƯA CHẠY ĐƯỢC vẫn tô đỏ với cửa chặn THẬT (công tắc tự bấm tắt)', async () => {
    const ss = { ok: true, ...HenGio.kiemSanSang({
        caiDat: { tuBam: false, daHieu: false,
                  henGio: { bat: true, moc: ['09:00'], khach: [{ maKH: 'A' }] } },
        soLenhTreo: 0, coTabBang: true }) };
    const { tailieu, bang } = dungTrang({ caiDat: {}, sanSang: ss });
    await ChenCot.moBangCaiDat(bang);
    await doiMotNhip();
    const ket = tailieu.getElementById('hdt-san-sang-ket');
    assert.match(ket.textContent, /CHƯA CHẠY ĐƯỢC/);
    assert.ok(ket.classList.contains('hdt-do'));
});

test('sẵn sàng → nói rõ lần chạy kế tiếp là khi nào', async () => {
    const ss = { ok: true, muc: [], sanSang: true, chanBoi: [],
                 lanKeTiepMs: Date.now() + 3600000 };
    const { tailieu, bang } = dungTrang({ caiDat: {}, sanSang: ss });
    await ChenCot.moBangCaiDat(bang);
    await doiMotNhip();
    const ket = tailieu.getElementById('hdt-san-sang-ket');
    assert.match(ket.textContent, /SẴN SÀNG/);
    assert.match(ket.textContent, /kế tiếp/);
});

ghiChu('— ⭐ Kiểm tra thử: biết ngay, không phải đợi tới giờ —');

test('⭐ bấm Kiểm tra thử → nói sẽ làm gì với TỪNG khách', async () => {
    const { tailieu, bang } = dungTrang({
        caiDat: {},
        thu: { ok: true, ngay: { tu: '13/08/2026', den: '13/08/2026' },
               bang: { ok: true, soDong: 5 },
               cua: { chay: true },
               chay: [{ maKH: 'A', tenKH: 'hoa', soTien: 500000 }],
               thieu: [{ maKH: 'B', tenKH: 'tiền', lyDo: 'hôm nay chưa phát sinh doanh thu' }] },
    });
    await ChenCot.moBangCaiDat(bang);
    tailieu.getElementById('hdt-kiem-tra-thu').click();
    await doiMotNhip();
    const o = tailieu.getElementById('hdt-ket-qua-thu');
    assert.match(o.textContent, /NGÀY 13\/08\/2026/);
    assert.match(o.textContent, /hoa/);
    assert.match(o.textContent, /500\.000đ/);
    assert.match(o.textContent, /chưa phát sinh doanh thu/);
});

test('⭐ kiểm tra thử phải NÓI RÕ nó dừng ở đâu, không hứa quá', async () => {
    const { tailieu, bang } = dungTrang({ caiDat: {},
        thu: { ok: true, bang: { ok: true, soDong: 1 }, ngay: { tu: 'x' }, chay: [], thieu: [] } });
    await ChenCot.moBangCaiDat(bang);
    tailieu.getElementById('hdt-kiem-tra-thu').click();
    await doiMotNhip();
    assert.match(tailieu.getElementById('hdt-ket-qua-thu').textContent,
                 /KHÔNG kiểm|dừng ở đây/);
});

test('⭐ trang chưa nạp code mới → nói thẳng phải F5', async () => {
    const { tailieu, bang } = dungTrang({ caiDat: {},
        thu: { ok: true, cua: { chay: true },
               bang: { ok: false, thongBao: 'trang chưa nạp code mới — hãy bấm F5 trên tab báo cáo' } } });
    await ChenCot.moBangCaiDat(bang);
    tailieu.getElementById('hdt-kiem-tra-thu').click();
    await doiMotNhip();
    assert.match(tailieu.getElementById('hdt-ket-qua-thu').textContent, /F5/);
});

ghiChu('— ⭐ Lịch sử: khách nào thành công, khách nào không —');

test('⭐ kể từng khách kèm kết quả và lý do', async () => {
    const LS = require('../chung/lichSuChay');
    const b = LS.taoBanGhi({
        nguon: 'HEN_GIO', moc: '09:00', luc: Date.now(), chay: true,
        ngay: { tu: '13/08/2026', den: '13/08/2026' },
        trongLich: [{ maKH: 'A', tenKH: 'hoa' }, { maKH: 'B', tenKH: 'tiền' }],
        thieu: [{ maKH: 'B', tenKH: 'tiền', lyDo: 'hôm nay chưa phát sinh doanh thu' }],
        ketQua: { xong: [{ maKH: 'A', tenKH: 'hoa', soTien: 500000,
                           ketQua: { daBamThanhToan: true } }] },
    });
    const { tailieu, bang } = dungTrang({ caiDat: {}, lichSu: { ok: true, ds: [b] } });
    await ChenCot.moBangCaiDat(bang);
    await doiMotNhip();
    const o = tailieu.getElementById('hdt-lich-su');
    assert.match(o.textContent, /hoa/);
    assert.match(o.textContent, /Đã ra hóa đơn/);
    assert.match(o.textContent, /tiền/);
    assert.match(o.textContent, /chưa phát sinh doanh thu/);
    assert.match(o.textContent, /số liệu ngày 13\/08\/2026/);
});

test('⭐ khách chỉ VÀO GIỎ không được ghi là đã ra hóa đơn', async () => {
    const LS = require('../chung/lichSuChay');
    const b = LS.taoBanGhi({
        chay: true, luc: Date.now(), trongLich: [{ maKH: 'A', tenKH: 'hoa' }],
        ketQua: { xong: [{ maKH: 'A', tenKH: 'hoa', soTien: 1,
                           ketQua: { daBamThanhToan: false } }] },
    });
    const { tailieu, bang } = dungTrang({ caiDat: {}, lichSu: { ok: true, ds: [b] } });
    await ChenCot.moBangCaiDat(bang);
    await doiMotNhip();
    const o = tailieu.getElementById('hdt-lich-su');
    assert.match(o.textContent, /CHƯA phát hành/);
    assert.ok(!/Đã ra hóa đơn/.test(o.textContent));
});

test('chưa có lần chạy nào → nói thẳng, không để trống trơn', async () => {
    const { tailieu, bang } = dungTrang({ caiDat: {}, lichSu: { ok: true, ds: [] } });
    await ChenCot.moBangCaiDat(bang);
    await doiMotNhip();
    assert.match(tailieu.getElementById('hdt-lich-su').textContent, /Chưa có lần chạy nào/);
});


ghiChu('— ⭐ Giờ riêng từng khách trên màn hình —');

test('⭐ mỗi khách có một ô GIỜ RIÊNG, để trống là theo giờ chung', async () => {
    const { tailieu, bang } = dungTrang({ caiDat: {} });
    ChenCot.chenVao(bang);
    await ChenCot.moBangCaiDat(bang);
    const o = tailieu.querySelector('input.hdt-gio-rieng[data-ma="PA"]');
    assert.ok(o, 'không có ô giờ riêng');
    assert.strictEqual(o.value, '');
    // Chữ gợi ý nói Ô NÀY ĐỂ LÀM GÌ. Còn luật "để trống = theo giờ chung" nằm ở
    // dòng nhãn phía trên và ở tooltip — kiểm cả hai ngay dưới đây.
    assert.match(o.placeholder, /giờ riêng/);
    assert.ok(!/giờ chung/.test(o.placeholder),
        'chữ gợi ý vẫn là "giờ chung" — người dùng tưởng ô này để điền giờ chung');
    assert.match(o.title, /Để trống = chạy theo giờ chung/,
        'mất lời giải thích khi trỏ chuột vào ô');
});

test('⭐ luật "để trống = theo giờ chung" vẫn còn hiện trên màn', async () => {
    // Chữ gợi ý trong ô nay là "giờ riêng" (nói ô để làm gì), nên dòng nhãn này
    // là chỗ DUY NHẤT còn nói ra luật mà không phải trỏ chuột vào. Mất nó là
    // người dùng phải tự đoán để trống thì chuyện gì xảy ra.
    const { tailieu, bang } = dungTrang({ caiDat: {} });
    ChenCot.chenVao(bang);
    await ChenCot.moBangCaiDat(bang);
    const chu = tailieu.getElementById('hdt-bang-cai-dat').textContent;
    assert.match(chu, /giờ riêng/);
    assert.match(chu, /để trống là theo giờ chung/);
});

test('⭐ giờ riêng đã lưu được điền sẵn', async () => {
    const { tailieu, bang } = dungTrang({
        caiDat: { henGio: { bat: true, moc: ['11:00'],
                            khach: [{ maKH: 'PA', tenKH: 'Phương Anh - PA', moc: '09:00' }] } },
    });
    ChenCot.chenVao(bang);
    await ChenCot.moBangCaiDat(bang);
    const o = tailieu.querySelector('input.hdt-gio-rieng[data-ma="PA"]');
    assert.strictEqual(o.value, '09:00');
    assert.ok(o.classList.contains('co'), 'ô có giờ riêng phải nhìn khác ô trống');
});

test('⭐ lưu gửi kèm giờ riêng của đúng khách đó', async () => {
    const { tailieu, bang, daGui } = dungTrang({ caiDat: {} });
    ChenCot.chenVao(bang);
    await ChenCot.moBangCaiDat(bang);
    tailieu.querySelector('input.hdt-tick-hen[data-ma="PA"]').checked = true;
    tailieu.querySelector('input.hdt-tick-hen[data-ma="TB"]').checked = true;
    tailieu.querySelector('input.hdt-gio-rieng[data-ma="TB"]').value = '09:00';
    tailieu.getElementById('hdt-hen-moc').value = '21:00';
    tailieu.getElementById('hdt-luu-cai-dat').click();
    await doiMotNhip();
    const luu = daGui.find(t => t.loai === 'hdt-dat-cai-dat');
    const theoMa = new Map(luu.henGio.khach.map(k => [k.maKH, k]));
    assert.strictEqual(theoMa.get('PA').moc, undefined, 'gán giờ riêng cho khách không đặt');
    assert.strictEqual(theoMa.get('TB').moc, '09:00');
});

test('⭐ bỏ tích thì giờ riêng cũng ra khỏi lịch', async () => {
    // Ô tích trả lời "có trong lịch không"; ô giờ chỉ trả lời "lúc mấy giờ".
    const { tailieu, bang, daGui } = dungTrang({ caiDat: {} });
    ChenCot.chenVao(bang);
    await ChenCot.moBangCaiDat(bang);
    tailieu.querySelector('input.hdt-gio-rieng[data-ma="PA"]').value = '09:00';
    // KHÔNG tích PA.
    tailieu.querySelector('input.hdt-tick-hen[data-ma="TB"]').checked = true;
    tailieu.getElementById('hdt-luu-cai-dat').click();
    await doiMotNhip();
    const luu = daGui.find(t => t.loai === 'hdt-dat-cai-dat');
    assert.ok(!luu.henGio.khach.some(k => k.maKH === 'PA'), 'khách chưa tích vẫn vào lịch');
});

test('⭐ màn hình kể rõ MỐC NÀO chạy cho AI', async () => {
    const { tailieu, bang } = dungTrang({ caiDat: {} });
    ChenCot.chenVao(bang);
    await ChenCot.moBangCaiDat(bang);
    tailieu.getElementById('hdt-hen-moc').value = '21:00';
    tailieu.querySelector('input.hdt-tick-hen[data-ma="PA"]').checked = true;
    tailieu.querySelector('input.hdt-tick-hen[data-ma="TB"]').checked = true;
    const oG = tailieu.querySelector('input.hdt-gio-rieng[data-ma="TB"]');
    oG.value = '09:00';
    oG.dispatchEvent(new tailieu.defaultView.Event('input', { bubbles: true }));
    await doiMotNhip();
    const chu = tailieu.getElementById('hdt-hen-khach').textContent;
    assert.match(chu, /09:00/);
    assert.match(chu, /21:00/);
    assert.match(chu, /Trang Bé TB/);
});

test('⭐ hai mốc quá sát → cảnh báo ĐỎ ngay trên màn hình', async () => {
    const { tailieu, bang } = dungTrang({ caiDat: {} });
    ChenCot.chenVao(bang);
    await ChenCot.moBangCaiDat(bang);
    tailieu.getElementById('hdt-hen-moc').value = '09:00';
    tailieu.querySelector('input.hdt-tick-hen[data-ma="PA"]').checked = true;
    tailieu.querySelector('input.hdt-tick-hen[data-ma="TB"]').checked = true;
    const oG = tailieu.querySelector('input.hdt-gio-rieng[data-ma="TB"]');
    oG.value = '09:02';
    oG.dispatchEvent(new tailieu.defaultView.Event('input', { bubbles: true }));
    await doiMotNhip();
    const o = tailieu.getElementById('hdt-hen-moc-sat');
    assert.notStrictEqual(o.style.display, 'none', 'không cảnh báo hai mốc sát nhau');
    assert.match(o.textContent, /dưới 5 phút/);
});

test('mốc cách xa → không cảnh báo thừa', async () => {
    const { tailieu, bang } = dungTrang({ caiDat: {} });
    ChenCot.chenVao(bang);
    await ChenCot.moBangCaiDat(bang);
    tailieu.getElementById('hdt-hen-moc').value = '09:00';
    tailieu.querySelector('input.hdt-tick-hen[data-ma="PA"]').checked = true;
    const oG = tailieu.querySelector('input.hdt-gio-rieng[data-ma="PA"]');
    oG.value = '21:00';
    oG.dispatchEvent(new tailieu.defaultView.Event('input', { bubbles: true }));
    await doiMotNhip();
    assert.strictEqual(tailieu.getElementById('hdt-hen-moc-sat').style.display, 'none');
});

test('⭐ kiểm tra thử kể theo TỪNG MỐC', async () => {
    const { tailieu, bang } = dungTrang({
        caiDat: {},
        thu: { ok: true, ngay: { tu: '13/08/2026', den: '13/08/2026' },
               bang: { ok: true, soDong: 5 }, cua: { chay: true }, chay: [], thieu: [],
               theoMoc: [
                   { moc: '09:00', laGioChung: false,
                     chay: [{ maKH: 'TB', tenKH: 'Trang Bé', soTien: 500000 }], thieu: [] },
                   { moc: '21:00', laGioChung: true, chay: [],
                     thieu: [{ maKH: 'PA', tenKH: 'Phương Anh',
                               lyDo: 'hôm nay chưa phát sinh doanh thu' }] },
               ] },
    });
    await ChenCot.moBangCaiDat(bang);
    tailieu.getElementById('hdt-kiem-tra-thu').click();
    await doiMotNhip();
    const chu = tailieu.getElementById('hdt-ket-qua-thu').textContent;
    assert.match(chu, /Mốc 09:00.*giờ riêng/);
    assert.match(chu, /Mốc 21:00.*giờ chung/);
    assert.match(chu, /Trang Bé/);
    assert.match(chu, /chưa phát sinh doanh thu/);
});


ghiChu('— ⭐ Lịch sử chạy: chia trang 10 bản ghi —');

const LSC = require('../chung/lichSuChay');

/** Dựng N bản ghi lịch sử giả, mới nhất trước. */
function nhieuBanGhi(n) {
    const ds = [];
    for (let i = n; i >= 1; i--) {
        ds.push(LSC.taoBanGhi({
            nguon: 'HEN_GIO', moc: '09:00', luc: 1786000000000 + i * 1000, chay: true,
            trongLich: [{ maKH: 'K' + i, tenKH: 'Khách ' + i }],
            ketQua: { xong: [{ id: 'l' + i, maKH: 'K' + i, tenKH: 'Khách ' + i, soTien: i * 1000,
                               ketQua: { daBamThanhToan: true, tong: i * 1000 } }] },
        }));
    }
    return ds;
}

const demBanGhi = (o) => o.querySelectorAll('.hdt-ls').length;

test('⭐ đúng 10 bản ghi mỗi trang', async () => {
    const { tailieu } = dungTrang({ caiDat: {} });
    const o = tailieu.createElement('div');
    tailieu.body.appendChild(o);
    ChenCot.veTrangLichSu(tailieu, o, nhieuBanGhi(25), 1);
    assert.strictEqual(demBanGhi(o), 10);
    assert.strictEqual(ChenCot.MOI_TRANG_LICH_SU, 10);
});

test('⭐ trang 1 là những lần MỚI NHẤT', async () => {
    const { tailieu } = dungTrang({ caiDat: {} });
    const o = tailieu.createElement('div');
    tailieu.body.appendChild(o);
    const ds = nhieuBanGhi(25);
    ChenCot.veTrangLichSu(tailieu, o, ds, 1);
    // Bản ghi đầu danh sách phải là bản ghi đầu trang 1.
    assert.match(o.querySelector('.hdt-ls').textContent, /Khách 25/);
});

test('⭐ trang cuối chỉ còn phần dư, không vẽ dòng rỗng', async () => {
    const { tailieu } = dungTrang({ caiDat: {} });
    const o = tailieu.createElement('div');
    tailieu.body.appendChild(o);
    ChenCot.veTrangLichSu(tailieu, o, nhieuBanGhi(25), 3);
    assert.strictEqual(demBanGhi(o), 5, '25 bản ghi thì trang 3 chỉ còn 5');
});

test('⭐ bấm "Sau ›" đổi được trang, và KHÔNG hỏi lại tiến trình nền', async () => {
    // Hỏi lại mỗi lần bấm vừa chậm vừa có thể ra danh sách khác (một lượt chạy
    // vừa xong ở giữa chừng) — nội dung nhảy lung tung thì không ai hiểu.
    const { tailieu, daGui } = dungTrang({ caiDat: {} });
    const o = tailieu.createElement('div');
    tailieu.body.appendChild(o);
    ChenCot.veTrangLichSu(tailieu, o, nhieuBanGhi(25), 1);
    const truoc = daGui.length;

    const nut = [...o.querySelectorAll('.hdt-ls-nut')].find(b => /Sau/.test(b.textContent));
    nut.click();
    await doiMotNhip();

    assert.match(o.querySelector('.hdt-ls-dem').textContent, /Trang 2\/3/);
    assert.match(o.querySelector('.hdt-ls').textContent, /Khách 15/, 'sang trang 2 mà nội dung không đổi');
    assert.strictEqual(daGui.length, truoc, 'đổi trang mà vẫn hỏi lại tiến trình nền');
});

test('⭐ bấm thẳng số trang cũng đi được', async () => {
    const { tailieu } = dungTrang({ caiDat: {} });
    const o = tailieu.createElement('div');
    tailieu.body.appendChild(o);
    ChenCot.veTrangLichSu(tailieu, o, nhieuBanGhi(25), 1);
    const nut3 = [...o.querySelectorAll('.hdt-ls-nut')].find(b => b.textContent === '3');
    nut3.click();
    await doiMotNhip();
    assert.match(o.querySelector('.hdt-ls-dem').textContent, /Trang 3\/3/);
});

test('⭐ ở trang đầu thì nút "Trước" BỊ KHÓA, trang cuối thì "Sau" bị khóa', async () => {
    // Nút bấm được mà không xảy ra gì là để người dùng ngồi đoán mình bấm hụt
    // hay máy hỏng.
    const { tailieu } = dungTrang({ caiDat: {} });
    const o = tailieu.createElement('div');
    tailieu.body.appendChild(o);
    const ds = nhieuBanGhi(25);

    ChenCot.veTrangLichSu(tailieu, o, ds, 1);
    const truoc1 = [...o.querySelectorAll('.hdt-ls-nut')].find(b => /Trước/.test(b.textContent));
    const sau1 = [...o.querySelectorAll('.hdt-ls-nut')].find(b => /Sau/.test(b.textContent));
    assert.strictEqual(truoc1.disabled, true, 'trang đầu mà nút Trước vẫn bấm được');
    assert.strictEqual(sau1.disabled, false);

    ChenCot.veTrangLichSu(tailieu, o, ds, 3);
    const truoc3 = [...o.querySelectorAll('.hdt-ls-nut')].find(b => /Trước/.test(b.textContent));
    const sau3 = [...o.querySelectorAll('.hdt-ls-nut')].find(b => /Sau/.test(b.textContent));
    assert.strictEqual(truoc3.disabled, false);
    assert.strictEqual(sau3.disabled, true, 'trang cuối mà nút Sau vẫn bấm được');
});

test('⭐ trang đang xem được TÔ KHÁC để biết mình đang ở đâu', async () => {
    const { tailieu } = dungTrang({ caiDat: {} });
    const o = tailieu.createElement('div');
    tailieu.body.appendChild(o);
    ChenCot.veTrangLichSu(tailieu, o, nhieuBanGhi(25), 2);
    const dang = [...o.querySelectorAll('.hdt-ls-nut.dang')];
    assert.strictEqual(dang.length, 1);
    assert.strictEqual(dang[0].textContent, '2');
});

test('⭐ ≤10 bản ghi → KHÔNG vẽ thanh chuyển trang cho đỡ rối', async () => {
    const { tailieu } = dungTrang({ caiDat: {} });
    const o = tailieu.createElement('div');
    tailieu.body.appendChild(o);
    ChenCot.veTrangLichSu(tailieu, o, nhieuBanGhi(10), 1);
    assert.strictEqual(demBanGhi(o), 10);
    assert.strictEqual(o.querySelector('.hdt-ls-trang'), null, 'chỉ một trang mà vẫn vẽ thanh');
});

test('chưa có lần chạy nào → nói thẳng, không vẽ thanh trang', async () => {
    const { tailieu } = dungTrang({ caiDat: {} });
    const o = tailieu.createElement('div');
    tailieu.body.appendChild(o);
    ChenCot.veTrangLichSu(tailieu, o, [], 1);
    assert.match(o.textContent, /Chưa có lần chạy nào/);
    assert.strictEqual(o.querySelector('.hdt-ls-trang'), null);
});

test('⭐ số trang vượt quá thì KẸP LẠI, không hiện trang trống', async () => {
    // Dữ liệu có thể đã ngắn đi so với lúc chọn trang.
    const { tailieu } = dungTrang({ caiDat: {} });
    const o = tailieu.createElement('div');
    tailieu.body.appendChild(o);
    ChenCot.veTrangLichSu(tailieu, o, nhieuBanGhi(25), 99);
    assert.strictEqual(demBanGhi(o), 5, 'trang vượt quá mà vẫn vẽ trống');
    assert.match(o.querySelector('.hdt-ls-dem').textContent, /Trang 3\/3/);

    ChenCot.veTrangLichSu(tailieu, o, nhieuBanGhi(25), -5);
    assert.match(o.querySelector('.hdt-ls-dem').textContent, /Trang 1\/3/);
});

test('⭐ nội dung mỗi bản ghi GIỮ NGUYÊN sau khi chia trang', async () => {
    const { tailieu } = dungTrang({ caiDat: {} });
    const o = tailieu.createElement('div');
    tailieu.body.appendChild(o);
    const b = LSC.taoBanGhi({
        nguon: 'HEN_GIO', moc: '21:00', luc: Date.now(), chay: true,
        ngay: { tu: '14/08/2026' },
        trongLich: [{ maKH: 'A', tenKH: 'hoa' }, { maKH: 'B', tenKH: 'tiền' }],
        thieu: [{ maKH: 'B', tenKH: 'tiền', lyDo: 'hôm nay chưa phát sinh doanh thu' }],
        ketQua: { xong: [{ id: 'l1', maKH: 'A', tenKH: 'hoa', soTien: 500000,
                           ketQua: { daBamThanhToan: true, tong: 500000 } }] },
    });
    ChenCot.veTrangLichSu(tailieu, o, [b], 1);
    const chu = o.textContent;
    assert.match(chu, /hẹn giờ 21:00/);
    assert.match(chu, /số liệu ngày 14\/08\/2026/);
    assert.match(chu, /1 ra hóa đơn/);
    assert.match(chu, /hoa.*Đã ra hóa đơn/);
    assert.match(chu, /tiền.*chưa phát sinh doanh thu/);
});

test('⭐ đổi trang KHÔNG đụng tới các khối khác của bảng cài đặt', async () => {
    // Vẽ lại cả bảng mỗi lần bấm là mất chỗ đang cuộn, mất cả ô đang gõ dở.
    const { tailieu, bang } = dungTrang({
        caiDat: {},
        lichSu: { ok: true, ds: nhieuBanGhi(25) },
    });
    ChenCot.chenVao(bang);
    await ChenCot.moBangCaiDat(bang);
    await doiMotNhip();

    tailieu.getElementById('hdt-o-do-lech').value = 'đang gõ dở';
    const khoiLS = tailieu.getElementById('hdt-lich-su');
    const nut = [...khoiLS.querySelectorAll('.hdt-ls-nut')].find(b => /Sau/.test(b.textContent));
    nut.click();
    await doiMotNhip();

    assert.strictEqual(tailieu.getElementById('hdt-o-do-lech').value, 'đang gõ dở',
        'đổi trang làm mất thứ đang gõ ở ô khác');
    assert.ok(tailieu.getElementById('hdt-hen-ds-khach'), 'đổi trang làm mất khối chọn khách');
});

chay('BẢNG CÀI ĐẶT: ĐỘ LỆCH VÀ HẸN GIỜ');
