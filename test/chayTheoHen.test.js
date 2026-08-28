'use strict';

// ============================================================================
//  CHẠY THẬT MỘT LƯỢT HẸN GIỜ, trong node.
//
//  ⚠️ VÌ SAO TỆP NÀY PHẢI CÓ. `background.js` là tiến trình nền — thứ DUY NHẤT
//  phát hành hóa đơn thuế khi không có ai ngồi trước máy — nhưng suốt từ đầu dự
//  án nó chỉ được kiểm bằng cách SOI CHỮ trong mã nguồn, vì "service worker
//  không nạp vào node được".
//
//  Ngày 27/08/2026 điều đó trả giá: mốc thuần "tiền/ngày" đặt `bang = null` rồi
//  vài dòng sau vẫn đọc `bang.ngay` -> TypeError -> cả lượt chết, không phát
//  hành gì, và chủ dự án ngồi đợi 15:05 mãi không thấy. Soi chữ không bao giờ
//  bắt được loại lỗi đó.
//
//  Hoá ra nạp ĐƯỢC: chỉ cần dựng `self`, `importScripts` và một `chrome` giả,
//  rồi tóm lấy listener của báo thức mà gọi. Từ đây đường chạy quan trọng nhất
//  của cả extension có bài kiểm hành vi thật.
// ============================================================================

const assert = require('node:assert');
const path = require('node:path');
const { test, ghiChu, chay } = require('./chay');

const GOC = path.join(__dirname, '..');

/**
 * Dựng tiến trình nền với Chrome giả, trả về cách bấm chuông báo thức.
 *
 * ⚠️ NẠP ĐÚNG MỘT LẦN cho cả tệp: `background.js` gắn listener lúc nạp, và
 * `require` có bộ nhớ đệm. Muốn đổi cài đặt giữa các bài thì sửa thẳng kho giả.
 */
function dungNen() {
    globalThis.self = globalThis;
    globalThis.importScripts = (...tep) => { for (const t of tep) require(path.join(GOC, t)); };

    const nghe = {};
    const kho = {};
    const daMoTab = [];
    const daGuiTab = [];

    globalThis.chrome = {
        storage: {
            local: {
                async get(k) {
                    const r = {};
                    for (const x of [].concat(k)) if (x in kho) r[x] = kho[x];
                    return r;
                },
                async set(o) { Object.assign(kho, o); },
                async remove(k) { for (const x of [].concat(k)) delete kho[x]; },
            },
        },
        alarms: {
            create: () => {}, clearAll: async () => {}, getAll: async () => [],
            onAlarm: { addListener: (f) => { nghe.alarm = f; } },
        },
        // ⚠️ TAB PHẢI CÓ SẴN. Không có thì cầu nối tự mở tab rồi hỏi "sẵn sàng
        // chưa" tới 40 lần, mỗi lần cách nhau một giây — bài kiểm treo 40 giây
        // mà chẳng chứng minh thêm gì.
        tabs: {
            query: async () => (kho.__cacTab || [
                { id: 7, url: 'https://seller-v3.tendoo.vn/sales/pos' },
                { id: 8, url: 'http://x/bao-cao-khach-hang' },
            ]),
            create: async (o) => { daMoTab.push(o && o.url); return { id: 9 }; },
            remove: async () => {},
            get: async (id) => ({ id, status: 'complete',
                                  url: 'https://seller-v3.tendoo.vn/sales/pos' }),
            update: async () => {},
            reload: async () => {},
            sendMessage: async (id, tin) => {
                daGuiTab.push(tin);
                if (tin.loai === 'hdt-doc-bang') {
                    return kho.__bang || { ok: false, tinCay: false, ma: 'KHONG_DOC_DUOC_BANG' };
                }
                // Trả "chưa sẵn sàng" cho tab Tendoo: lượt dừng SỚM và SẠCH ngay
                // trước bước phát hành. Đủ để đi hết đoạn mã mình cần kiểm mà
                // không phải giả lập cả giao diện POS.
                if (tin.loai === 'hdt-hoi-san-sang') return { sanSang: false, thieu: [] };
                return kho.__traTab || {};
            },
        },
        runtime: {
            onStartup: { addListener: () => {} },
            onInstalled: { addListener: () => {} },
            onMessage: { addListener: (f) => { nghe.tin = f; } },
            getManifest: () => ({ version: 'thu' }),
        },
        action: { setBadgeText: () => {}, setBadgeBackgroundColor: () => {}, setTitle: () => {} },
    };

    require(path.join(GOC, 'background.js'));
    return { nghe, kho, daMoTab, daGuiTab };
}

const NEN = dungNen();
const TIEN_TO = require('../chung/henGio').TIEN_TO;

/** Bấm chuông báo thức của một mốc rồi đợi nó chạy xong. */
async function bamChuong(moc) {
    NEN.nghe.alarm({ name: TIEN_TO + moc });
    // Đường chạy có nhiều `await` nối nhau; nhường vài nhịp cho nó xong.
    for (let i = 0; i < 40; i++) await new Promise(r => setTimeout(r, 0));
}

const ketQua = () => NEN.kho['hdt-ket-qua-hen-gio'] || null;

/** Cài đặt tối thiểu để lượt hẹn được phép chạy. */
function datCaiDat(khach, moc = '09:00') {
    NEN.kho['hdt-cai-dat-bang-thu'] = {
        tuBam: true, daHieu: true,
        sellUrl: '', sellToken: '',
        henGio: { bat: true, moc: [moc], khach, urlBang: 'http://x/bao-cao-khach-hang' },
    };
    NEN.kho['hdt-so-ghi-dau'] = null;
    NEN.kho['hdt-khoa-dang-chay'] = null;
    delete NEN.kho['hdt-ket-qua-hen-gio'];
}

ghiChu('── MỐC THUẦN "TIỀN/NGÀY": lỗi đã chặn lượt 15:05 ngày 27/08/2026 ──');

test('⭐⭐⭐ mốc thuần tiền/ngày KHÔNG được chết vì không có bảng', async () => {
    // ⚠️ ĐÂY LÀ BÀI QUAN TRỌNG NHẤT TỆP. Bản 27/08 đặt `bang = null` cho mốc
    // thuần tự chọn rồi vẫn đọc `bang.ngay` -> TypeError -> lượt chết câm.
    datCaiDat([{
        maKH: 'KH1', tenKH: 'ki?n', soTienNgay: 5000000, mocTien: '15:05',
        batHeThong: false, batTuChon: true,
    }]);
    await bamChuong('15:05');

    const kq = ketQua();
    assert.ok(kq, 'lượt chạy không ghi lại gì cả — chết câm, đúng bệnh 27/08');
    assert.notStrictEqual(kq.lyDo, 'NGOAI_LE',
        'lượt nổ ngoại lệ: ' + (kq.thongBao || ''));
    assert.ok(!/Cannot read propert/i.test(String(kq.thongBao || '')),
        'vẫn đọc thuộc tính của null: ' + kq.thongBao);
});

test('⭐⭐ mốc thuần tiền/ngày KHÔNG đi mở trang báo cáo', async () => {
    // Lượt tự chọn không dùng một con số nào của bảng. Mở trang báo cáo là thêm
    // một cách hỏng (trang lỗi, hết phiên) cho việc chẳng cần tới nó.
    NEN.daMoTab.length = 0;
    datCaiDat([{
        maKH: 'KH1', tenKH: 'ki?n', soTienNgay: 5000000, mocTien: '15:05',
        batHeThong: false, batTuChon: true,
    }]);
    await bamChuong('15:05');
    assert.ok(!NEN.daMoTab.some(u => String(u || '').includes('bao-cao')),
        'vẫn mở trang báo cáo cho lượt không cần bảng');
});

test('⭐⭐ mốc thuần tiền/ngày KHÔNG bị kết luận "không khách nào phát sinh doanh thu"', async () => {
    datCaiDat([{
        maKH: 'KH1', tenKH: 'ki?n', soTienNgay: 5000000, mocTien: '15:05',
        batHeThong: false, batTuChon: true,
    }]);
    await bamChuong('15:05');
    const kq = ketQua();
    assert.notStrictEqual(kq.lyDo, 'KHONG_KHACH_NAO_PHAT_SINH',
        'lượt tự chọn bị bỏ vì không có doanh thu — cả điểm của nó là chạy kể cả khi không có');
    assert.notStrictEqual(kq.lyDo, 'KHONG_DOC_DUOC_BANG',
        'vẫn bị chặn vì không đọc được bảng, dù chẳng cần bảng');
});

ghiChu('── Mốc CÓ mục hệ thống thì VẪN phải đọc bảng ──');

test('⭐ mốc có mục hệ thống mà không đọc được bảng -> DỪNG, không đoán bừa', async () => {
    // Bảng hỏng thì MỌI khách đều trông như không có doanh thu. Chạy tiếp là
    // xuất hóa đơn thuế theo một con số không ai biết đúng hay sai.
    datCaiDat([{ maKH: 'KH1', tenKH: 'ki?n', batHeThong: true, batTuChon: false }], '15:00');
    NEN.kho.__bang = { ok: false, tinCay: false, ma: 'KHONG_DOC_DUOC_BANG' };
    await bamChuong('15:00');
    const kq = ketQua();
    assert.ok(kq, 'không ghi lại gì');
    assert.ok(kq.chay === false, 'vẫn chạy tiếp dù chưa chắc bảng đúng');
});

ghiChu('── HẠN CHẠY: quá hạn thì lượt KHÔNG được phát hành gì ──');

test('⭐⭐⭐ quá hạn -> báo thức kêu nhưng KHÔNG xuất hóa đơn nào', async () => {
    // ⚠️ Kiểm ở TẦNG TIẾN TRÌNH NỀN, không chỉ ở hàm thuần. Báo thức cũ của
    // Chrome vẫn còn và vẫn kêu mỗi ngày; nếu đường chạy không tự lọc khách hết
    // hạn thì tiền cứ ra thêm mãi mà không ai chặn.
    const HG = require('../chung/henGio');
    const cu = HG.congNgay(HG.ngayVN(), -30);
    datCaiDat([{
        maKH: 'KH1', tenKH: 'ki?n', soTienNgay: 5000000, mocTien: '15:05',
        batHeThong: false, batTuChon: true,
        soNgayTuChon: 3, batDauTuChon: cu,
    }]);
    NEN.daGuiTab.length = 0;
    await bamChuong('15:05');

    const kq = ketQua();
    assert.ok(kq, 'không ghi lại gì');
    assert.strictEqual(kq.lyDo, 'MOC_KHONG_CO_KHACH',
        'quá hạn mà vẫn chạy tiếp: ' + (kq.lyDo || '') + ' — ' + (kq.thongBao || ''));
    assert.ok(!NEN.daGuiTab.some(t => t && t.loai === 'hdt-xu-ly-khach'),
        'quá hạn mà vẫn gửi lệnh xuống tab Tendoo — tiền ra thêm');
});

test('⭐⭐ CÒN hạn thì vẫn chạy bình thường', async () => {
    const HG = require('../chung/henGio');
    datCaiDat([{
        maKH: 'KH1', tenKH: 'ki?n', soTienNgay: 5000000, mocTien: '15:05',
        batHeThong: false, batTuChon: true,
        soNgayTuChon: 5, batDauTuChon: HG.ngayVN(),
    }]);
    await bamChuong('15:05');
    const kq = ketQua();
    assert.notStrictEqual(kq.lyDo, 'MOC_KHONG_CO_KHACH',
        'còn hạn mà đã ngừng — dừng sớm mất mấy tờ hóa đơn');
});

ghiChu('── Mốc trống ──');

test('mốc không còn khách nào -> ghi lại rồi thôi, không nổ', async () => {
    datCaiDat([{ maKH: 'KH1', tenKH: 'ki?n', mocTien: '15:05',
                 soTienNgay: 5000000, batHeThong: false, batTuChon: true }]);
    await bamChuong('09:00');
    const kq = ketQua();
    assert.ok(kq, 'không ghi lại gì');
    assert.strictEqual(kq.lyDo, 'MOC_KHONG_CO_KHACH');
});

test('báo thức lạ (không phải của mình) thì KỆ, không nổ', async () => {
    delete NEN.kho['hdt-ket-qua-hen-gio'];
    NEN.nghe.alarm({ name: 'bao-thuc-cua-ai-do' });
    await new Promise(r => setTimeout(r, 0));
    assert.strictEqual(ketQua(), null, 'nhận nhầm báo thức của người khác');
});

chay('CHẠY THẬT MỘT LƯỢT HẸN GIỜ');
