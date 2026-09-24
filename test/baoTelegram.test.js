'use strict';

// BÁO VỀ TELEGRAM MỖI KHI XUẤT HÓA ĐƠN THÀNH CÔNG.
// Chạy: node test/baoTelegram.test.js
//
// Chủ dự án chốt 2026-08-20: BOT RIÊNG · CHAT RIÊNG · CHỈ BÁO THÀNH CÔNG.
//
// ── HAI ĐIỀU NGUY HIỂM NHẤT, VÀ VÌ SAO ─────────────────────────────────────
//
// 1. BÁO TRÙNG. Mã gửi sang Sell chạy HAI đường cho cùng một khách: gửi ngay
//    sau mỗi khách, và gửi lại toàn bộ ở cuối loạt làm lưới an toàn. Sell chịu
//    được vì nó chống trùng bằng `ma_lenh`. Telegram thì không — móc vào một
//    cách ngây thơ là mỗi hóa đơn nhận hai tin, và người đọc dễ tưởng hóa đơn
//    đã xuất hai lần.
//
// 2. BÁO NHẦM CÁI CHƯA RA. 'VAO_GIO' nghĩa là công tắc tự bấm đang TẮT: hàng
//    mới nằm trong giỏ, CHƯA có hóa đơn nào. Nhắn "đã xuất hóa đơn" cho cảnh
//    ấy là nói dối trắng trợn, và người dùng sẽ không bao giờ đi kiểm lại.
//
// ── VÀ MỘT ĐIỀU KHÔNG ĐƯỢC QUÊN ────────────────────────────────────────────
// Đây là VIỆC PHỤ. Telegram sập, mất mạng, sai token — hóa đơn vẫn phải ra
// bình thường. Không hàm nào ở đây được phép ném ra ngoài.

const assert = require('node:assert');
const { test, ghiChu, chay } = require('./chay');
const Tg = require('../chung/baoTelegram');
const CaiDat = require('../chung/caiDat');
const DayVeSell = require('../chung/dayVeSell');

const CAI_DAT = { telegramToken: '123456:AAbbCC-token-bi-mat', telegramChatId: '98765' };

/** Sổ "đã báo" giả — cùng hình dạng với `luuTru(khoa)` của background.js. */
function taoKho(banDau = null) {
    let du = banDau;
    return {
        doc: async () => du,
        ghi: async (o) => { du = o; },
        xem: () => du,
    };
}

/** fetch giả: ghi lại mọi cú gọi, trả về thứ mình đặt sẵn. */
function taoFetch(tra = { ok: true, than: { ok: true } }) {
    const cac = [];
    const f = async (url, tuyChon) => {
        cac.push({ url, tuyChon, than: tuyChon && tuyChon.body ? JSON.parse(tuyChon.body) : null });
        if (typeof tra === 'function') return tra(cac.length);
        if (tra instanceof Error) throw tra;
        return { ok: tra.ok !== false, status: tra.status || 200,
                 json: async () => tra.than };
    };
    f.cac = cac;
    return f;
}

const DONG = {
    ngay: '2026-08-19',
    ma_khach_hang: 'TB',
    ten_khach_hang: 'Trang Bé TB',
    so_tien: 9980000,
    ket_qua: 'RA_HOA_DON',
    ly_do: '',
    ma_lenh: 'lenh-abc-123',
    chay_luc: Date.UTC(2026, 7, 19, 11, 5, 32),   // 18:05:32 giờ Việt Nam
};

const bao = (them = {}, kho = taoKho(), f = taoFetch()) =>
    Tg.baoCacDong({ cacDong: [{ ...DONG, ...them }], caiDat: CAI_DAT, kho, layFetch: f, luc: 1 })
        .then(kq => ({ kq, kho, f }));

ghiChu('— Chỉ báo cái ĐÃ RA THẬT —');

test('⭐⭐ RA_HOA_DON thì báo', async () => {
    const { kq, f } = await bao();
    assert.strictEqual(kq.daGui, 1, JSON.stringify(kq));
    assert.strictEqual(f.cac.length, 1);
});

test('⛔⛔ VAO_GIO thì TUYỆT ĐỐI KHÔNG báo — hàng mới vào giỏ, chưa có hóa đơn', async () => {
    const { kq, f } = await bao({ ket_qua: 'VAO_GIO' });
    assert.strictEqual(kq.daGui, 0);
    assert.strictEqual(f.cac.length, 0, 'đã nhắn "đã xuất hóa đơn" cho đơn CHƯA xuất');
});

test('⛔ trạng thái KHÔNG hiểu được thì im lặng, không đoán bừa', async () => {
    // ⚠️ Từ 22/08/2026 LOI và TREO CÓ báo (chủ dự án chốt) — xem mục riêng ở
    // dưới. Còn những trạng thái lạ thì vẫn phải im: đoán bừa một cái tên
    // trạng thái là nhắn sai bản chất việc đã xảy ra.
    for (const k of ['', 'RA_HOA_DONX', 'ra_hoa_don', 'VAO_GIO', 'BO_QUA', 'CHUA_CHAY']) {
        const { f } = await bao({ ket_qua: k });
        assert.strictEqual(f.cac.length, 0, 'đã báo với ket_qua=' + JSON.stringify(k));
    }
});

test('⛔ số tiền 0 hoặc âm thì không báo', async () => {
    for (const t of [0, -1, null, undefined, 'abc']) {
        const { f } = await bao({ so_tien: t });
        assert.strictEqual(f.cac.length, 0, 'đã báo với so_tien=' + JSON.stringify(t));
    }
});

test('⛔ thiếu mã lệnh thì không báo — không có mã thì chống trùng vô nghĩa', async () => {
    const { f } = await bao({ ma_lenh: '' });
    assert.strictEqual(f.cac.length, 0);
});

ghiChu('— Nội dung tin —');

test('⭐⭐ đủ tên khách, số tiền, NGÀY và GIỜ', async () => {
    const { f } = await bao();
    const chu = f.cac[0].than.text;
    assert.match(chu, /Trang Bé TB/, chu);
    assert.match(chu, /\(TB\)/, chu);
    assert.match(chu, /9\.980\.000đ/, chu);
    assert.match(chu, /19\/08\/2026/, chu);
    assert.match(chu, /18:05:32/, 'thiếu giờ — chủ dự án đòi ghi rõ giờ: ' + chu);
});

ghiChu('— ⭐ RÚT GỌN: ngày số liệu chỉ hiện khi KHÁC ngày xuất —');

test('⭐⭐ cùng ngày → KHÔNG có dòng "Số liệu ngày", tin gọn 4 dòng', async () => {
    // ⚠️ BÀI TRÊN KHÔNG CANH ĐƯỢC VIỆC NÀY. Nó đòi chuỗi "19/08/2026" có mặt —
    // mà chuỗi ấy VẪN NẰM trong dòng "Lúc", nên bỏ hay giữ dòng "Số liệu ngày"
    // nó đều xanh. Phải đòi thẳng: dòng ấy KHÔNG ĐƯỢC CÓ.
    const { f } = await bao();
    const chu = f.cac[0].than.text;
    assert.ok(!/Số liệu ngày/.test(chu), 'vẫn lặp ngày hai lần: ' + chu);
    assert.match(chu, /Lúc: 19\/08\/2026 18:05:32/, 'mất luôn ngày: ' + chu);
    assert.strictEqual(chu.split('\n').length, 4, 'số dòng không đúng: ' + chu);
});

test('⭐⭐ VẮT QUA NỬA ĐÊM → PHẢI hiện lại dòng "Số liệu ngày"', async () => {
    // Đọc báo cáo ngày 19, nhưng tờ này mãi 00:03 ngày 20 mới ra. Không nói ra
    // thì người đọc tưởng đây là doanh thu ngày 20.
    const { f } = await bao({ chay_luc: Date.UTC(2026, 7, 19, 17, 3, 11) });
    const chu = f.cac[0].than.text;
    assert.match(chu, /Số liệu ngày: 19\/08\/2026/, 'im lặng đúng lúc cần lên tiếng: ' + chu);
    assert.match(chu, /Lúc: 20\/08\/2026 00:03:11/, chu);
});

test('⛔ đọc không ra giờ thì VẪN phải giữ ngày — kẻo mất hẳn', async () => {
    // ⚠️ Bản đầu tôi dùng `chay_luc: 'rác'` — SAI ĐƯỜNG. chuGio() làm
    // `Number('rác') || Date.now()`, nên rác lại lùi về GIỜ HIỆN TẠI chứ không
    // ra rỗng; bài test khi ấy đi vào nhánh "hai ngày khác nhau" và xanh vì lý
    // do sai. Gài lỗi đúng nhánh này thì nó lọt lưới.
    //
    // Muốn `gio` thật sự rỗng thì phải cho một mốc NGOÀI TẦM của Date.
    const { f } = await bao({ chay_luc: 1e20 });
    const chu = f.cac[0].than.text;
    assert.ok(!/Lúc:/.test(chu), 'cảnh dựng sai — vẫn đọc được giờ: ' + chu);
    assert.match(chu, /Số liệu ngày: 19\/08\/2026/,
        'không còn dòng nào mang ngày: ' + chu);
});

test('ngayTrongGio cắt đúng phần ngày', () => {
    assert.strictEqual(Tg.ngayTrongGio('21/08/2026 08:53:27'), '21/08/2026');
    assert.strictEqual(Tg.ngayTrongGio(''), '');
    assert.strictEqual(Tg.ngayTrongGio(null), '');
    assert.strictEqual(Tg.ngayTrongGio(undefined), '');
});

test('⭐⭐ GIỜ ÉP CỨNG theo Việt Nam, KHÔNG theo múi giờ máy', () => {
    // ⚠️ MÁY CHẠY BÀI TEST NÀY ĐANG Ở +07, nên chỉ so số không chứng minh được
    // gì cả: bỏ hẳn `timeZone` đi thì kết quả vẫn y hệt. Đã gài lỗi và nó lọt
    // lưới thật. Phải ĐỔI MÚI GIỜ MÁY rồi mới kiểm.
    const tzCu = process.env.TZ;
    try {
        process.env.TZ = 'America/New_York';       // -04, lệch 11 tiếng
        assert.strictEqual(Tg.chuGio(Date.UTC(2026, 7, 19, 11, 5, 32)), '19/08/2026 18:05:32',
            'giờ chạy theo múi giờ MÁY — máy đặt sai là tin nhắn ghi sai giờ');
        process.env.TZ = 'UTC';
        assert.strictEqual(Tg.chuGio(Date.UTC(2026, 7, 19, 11, 5, 32)), '19/08/2026 18:05:32');
    } finally {
        if (tzCu === undefined) delete process.env.TZ; else process.env.TZ = tzCu;
    }
    assert.strictEqual(Tg.chuGio(Date.UTC(2026, 7, 19, 11, 5, 32)), '19/08/2026 18:05:32');
    // Nửa đêm UTC = 7 giờ sáng HÔM ĐÓ ở Việt Nam, không phải hôm trước.
    assert.strictEqual(Tg.chuGio(Date.UTC(2026, 7, 19, 0, 0, 0)), '19/08/2026 07:00:00');
    // 18:00 UTC = 01:00 SÁNG HÔM SAU ở Việt Nam — chỗ dễ sai nhất.
    assert.strictEqual(Tg.chuGio(Date.UTC(2026, 7, 19, 18, 0, 0)), '20/08/2026 01:00:00');
});

test('ngày số liệu đổi từ 2026-08-19 sang 19/08/2026', () => {
    assert.strictEqual(Tg.chuNgay('2026-08-19'), '19/08/2026');
    assert.strictEqual(Tg.chuNgay('linh tinh'), 'linh tinh');
    assert.strictEqual(Tg.chuNgay(''), '');
});

test('⭐⭐ hóa đơn ra DỞ DANG phải nói ra, không được trông như trọn vẹn', async () => {
    // Ra 2/3 tờ rồi dừng: tiền đã ra thật nhưng CÒN THIẾU. Im lặng ở đây là để
    // người dùng yên tâm nhầm rồi không bao giờ kiểm lại.
    const { f } = await bao({ so_tien: 3450000, ly_do: 'Ra 2 hóa đơn rồi dừng. Giỏ vẫn còn hàng.' });
    const chu = f.cac[0].than.text;
    assert.match(chu, /Ra 2 hóa đơn rồi dừng/, chu);
    assert.match(chu, /3\.450\.000đ/, chu);
});

test('⛔⛔ GỬI CHỮ TRƠN — không parse_mode, khỏi phải thoát ký tự', async () => {
    // Tên khách có _ * [ ` là Markdown vỡ, và lỗi ấy chỉ lộ ra đúng lúc gặp
    // khách có tên đó — tức là lúc không ai ngồi xem.
    const { f } = await bao({ ten_khach_hang: 'Shop *Bình* _Minh_ [A] `x`' });
    assert.strictEqual(f.cac[0].than.parse_mode, undefined,
        'có parse_mode là mở đường cho lỗi thoát ký tự');
    assert.match(f.cac[0].than.text, /Shop \*Bình\* _Minh_ \[A\] `x`/,
        'tên khách bị đổi khác: ' + f.cac[0].than.text);
});

test('⛔ TOKEN không bao giờ được nằm trong nội dung tin', async () => {
    const { f } = await bao();
    assert.ok(!f.cac[0].than.text.includes(CAI_DAT.telegramToken), 'token lọt vào tin nhắn');
});

test('gọi đúng bot và đúng chat', async () => {
    const { f } = await bao();
    assert.match(f.cac[0].url, /^https:\/\/api\.telegram\.org\/bot/, f.cac[0].url);
    assert.match(f.cac[0].url, /\/sendMessage$/, f.cac[0].url);
    assert.strictEqual(f.cac[0].than.chat_id, '98765');
});

ghiChu('— ⭐⭐ BÁO CẢ KHI LỖI (chủ dự án chốt 2026-08-22) —');

// ⚠️ VÌ SAO THÊM. Trước 22/08 chỉ báo thành công. Đêm 21/08 ba tờ ra thì có
// tin, còn HAI LỖI thì IM LẶNG HOÀN TOÀN — kiểu im lặng tệ nhất, vì người đọc
// tưởng mọi thứ đều ổn trong khi mất 8.795.000đ và cả một mốc giờ.

test('⭐⭐ LOI → báo, kèm số tiền ĐỊNH xuất và lý do', async () => {
    const { kq, f } = await bao({
        ket_qua: 'LOI', so_tien: 8795000,
        ly_do: 'Đăng nhập xong nhưng không quay lại được trang bán hàng.',
    });
    assert.strictEqual(kq.daGui, 1, JSON.stringify(kq));
    const chu = f.cac[0].than.text;
    assert.match(chu, /❌ KHÔNG xuất được hóa đơn/, chu);
    assert.match(chu, /Số tiền định xuất: 8\.795\.000đ/,
        'gọi là "Số tiền" thì người đọc tưởng tiền đã ra: ' + chu);
    assert.match(chu, /Lý do: Đăng nhập xong nhưng không quay lại/, chu);
    assert.ok(!/Đã xuất hóa đơn/.test(chu), 'tin lỗi mà đầu đề như tin thành công: ' + chu);
});

test('⭐⭐⭐ TREO → tin phải HÉT LÊN, đây là loại nguy hiểm nhất', async () => {
    // Máy đã bấm "Xác nhận" mà không đọc được kết quả — tiền CÓ THỂ đã lên cơ
    // quan thuế. Người đọc phải mở Tendoo kiểm tận mắt, nên tin này không được
    // lẫn với hai loại kia.
    const { kq, f } = await bao({
        ket_qua: 'TREO', so_tien: 5500000,
        ly_do: 'Đã bấm "Xác nhận" nhưng giỏ vẫn còn hàng.',
    });
    assert.strictEqual(kq.daGui, 1, JSON.stringify(kq));
    const chu = f.cac[0].than.text;
    assert.match(chu, /KHÔNG RÕ đã xuất hóa đơn hay chưa/, chu);
    assert.match(chu, /KIỂM TRA TENDOO/, 'không bảo người đọc phải làm gì: ' + chu);
    assert.match(chu, /Lý do: Đã bấm "Xác nhận"/, chu);
});

test('⛔ ba loại tin phải có ĐẦU ĐỀ KHÁC NHAU', async () => {
    const dau = {};
    for (const k of ['RA_HOA_DON', 'LOI', 'TREO']) {
        const { f } = await bao({ ket_qua: k, ly_do: 'x' });
        dau[k] = f.cac[0].than.text.split('\n')[0];
    }
    assert.notStrictEqual(dau.RA_HOA_DON, dau.LOI);
    assert.notStrictEqual(dau.LOI, dau.TREO);
    assert.notStrictEqual(dau.RA_HOA_DON, dau.TREO);
});

test('⛔ tin THÀNH CÔNG dở dang vẫn dùng dấu ⚠, không phải "Lý do:"', async () => {
    // Ra 4/6 tờ rồi dừng: tiền ĐÃ ra thật, nên đầu đề vẫn là ✅ và lời cảnh báo
    // là phụ chú — khác hẳn tin lỗi, nơi lý do CHÍNH LÀ nội dung.
    const { f } = await bao({ ly_do: 'Ra 4 hóa đơn rồi dừng.' });
    const chu = f.cac[0].than.text;
    assert.match(chu, /⚠ Ra 4 hóa đơn rồi dừng/, chu);
    assert.ok(!/Lý do:/.test(chu), chu);
});

test('⭐ LOI với số tiền 0 vẫn phải báo — lỗi là lỗi', async () => {
    // Khác tin thành công: 'RA_HOA_DON' mà 0đ thì không có gì để khoe, nhưng
    // một lỗi thì vẫn phải kêu dù chưa kịp tính ra số tiền nào.
    const { kq } = await bao({ ket_qua: 'LOI', so_tien: 0, ly_do: 'x' });
    assert.strictEqual(kq.daGui, 1, JSON.stringify(kq));
});

test('loaiTin phân loại đúng', () => {
    const g = (o) => Tg.loaiTin({ ma_khach_hang: 'TB', ma_lenh: 'x', so_tien: 1000, ...o });
    assert.strictEqual(g({ ket_qua: 'RA_HOA_DON' }), 'RA');
    assert.strictEqual(g({ ket_qua: 'LOI' }), 'LOI');
    assert.strictEqual(g({ ket_qua: 'TREO' }), 'TREO');
    assert.strictEqual(g({ ket_qua: 'VAO_GIO' }), null);
    assert.strictEqual(g({ ket_qua: 'BO_QUA' }), null);
    assert.strictEqual(g({ ket_qua: 'CHUA_CHAY' }), null);
    assert.strictEqual(g({ ket_qua: 'RA_HOA_DON', so_tien: 0 }), null);
    assert.strictEqual(Tg.loaiTin({ ket_qua: 'LOI' }), null, 'thiếu mã mà vẫn nhận');
    assert.strictEqual(Tg.loaiTin(null), null);
});

ghiChu('— ⭐⭐ TIN CẢ LƯỢT KHÔNG CHẠY —');

const LUOT = {
    moc: '18:10', ngay: { tu: '2026-08-21' }, chay: false,
    lyDo: 'KHONG_MO_DUOC_BANG',
    thongBao: 'Không gọi được bongtom.store ở https://bongtom.store: Failed to fetch',
    khach: [{ maKH: 'S1', tenKH: 'Bích Ngọc S1', ket: 'CHUA_CHAY' }],
};
const baoL = (them = {}, kho = taoKho(), f = taoFetch()) =>
    Tg.baoLuot({ banGhi: { ...LUOT, ...them }, caiDat: CAI_DAT, kho, layFetch: f, luc: 1 })
        .then(kq => ({ kq, kho, f }));

test('⭐⭐⭐ cả lượt không chạy → PHẢI báo, vì không dòng khách nào mang nổi lý do', async () => {
    // Lượt 18:10 ngày 21/08 hỏng vì «Không gọi được bongtom.store» — lý do ấy
    // nằm ở TẦNG LƯỢT. Chỉ báo theo dòng khách thì cả lượt hỏng mà người dùng
    // KHÔNG NHẬN ĐƯỢC GÌ.
    const { kq, f } = await baoL();
    assert.strictEqual(kq.daGui, 1, JSON.stringify(kq));
    const chu = f.cac[0].than.text;
    assert.match(chu, /🚫 Cả lượt KHÔNG chạy — mốc 18:10/, chu);
    assert.match(chu, /Không gọi được bongtom.store/, chu);
    assert.match(chu, /Bỏ lỡ: 1 khách \(Bích Ngọc S1\)/, 'không nói bỏ lỡ ai: ' + chu);
});

test('⭐⭐ NGÀY YÊN Ả cũng PHẢI báo — chủ dự án chốt 24/08/2026', async () => {
    // ⚠️ ĐÂY LÀ QUYẾT ĐỊNH BỊ ĐẢO NGƯỢC, cố ý.
    //
    // Bản cũ TUYỆT ĐỐI không báo hai lý do này, vì chúng xảy ra gần như mỗi tối
    // và "tin rác thì giết luôn giá trị của những tin thật". Tôi đã trình đúng
    // lo ngại ấy kèm một phương án gộp-một-tin-mỗi-lượt; chủ dự án nghe rồi vẫn
    // chọn BÁO HẾT — muốn lượt nào chạy xong cũng biết.
    //
    // Ghi lại ở đây để người đọc sau này thấy đây là một lựa chọn có cân nhắc,
    // không phải một chốt bị quên.
    for (const l of ['KHONG_KHACH_NAO_PHAT_SINH', 'MOC_KHONG_CO_KHACH']) {
        const { kq, f } = await baoL({ lyDo: l });
        assert.strictEqual(f.cac.length, 1, 'KHÔNG báo ngày yên ả: ' + l);
        assert.strictEqual(kq.daGui, 1, 'lý do: ' + l);
        assert.strictEqual(kq.hong, 0, 'đếm thành hỏng → báo động đỏ giả: ' + l);
    }
});

test('⛔ lượt CÓ chạy thì không báo gì thêm — từng khách đã có tin riêng', async () => {
    const { f } = await baoL({ chay: true });
    assert.strictEqual(f.cac.length, 0);
});

test('⭐⭐ mỗi MỐC GIỜ chỉ báo MỘT lần dù gọi lại nhiều lượt', async () => {
    const kho = taoKho();
    const f = taoFetch();
    const g = { banGhi: LUOT, caiDat: CAI_DAT, kho, layFetch: f, luc: 1 };
    await Tg.baoLuot(g);
    await Tg.baoLuot(g);
    assert.strictEqual(f.cac.length, 1, 'nhắn ' + f.cac.length + ' tin cho một mốc');
});

test('hai mốc khác nhau thì báo hai tin', async () => {
    const kho = taoKho();
    const f = taoFetch();
    await Tg.baoLuot({ banGhi: LUOT, caiDat: CAI_DAT, kho, layFetch: f, luc: 1 });
    await Tg.baoLuot({ banGhi: { ...LUOT, moc: '18:20' }, caiDat: CAI_DAT, kho, layFetch: f, luc: 2 });
    assert.strictEqual(f.cac.length, 2);
});

test('⭐ gửi hỏng thì TRẢ CHỖ, lượt sau còn thử lại được', async () => {
    const kho = taoKho();
    const hong = taoFetch({ ok: false, status: 500, than: { ok: false } });
    await Tg.baoLuot({ banGhi: LUOT, caiDat: CAI_DAT, kho, layFetch: hong, luc: 1 });
    assert.deepStrictEqual(kho.xem(), [], 'còn giữ dấu → tin này mất vĩnh viễn');
    const tot = taoFetch();
    const kq2 = await Tg.baoLuot({ banGhi: LUOT, caiDat: CAI_DAT, kho, layFetch: tot, luc: 2 });
    assert.strictEqual(kq2.daGui, 1);
});

test('⛔⛔ baoLuot KHÔNG BAO GIỜ được ném, và chưa khai báo thì im', async () => {
    // ⚠️ ĐỪNG JSON.stringify cái bẫy. Bản đầu tôi đưa nó vào lời nhắn của
    // assert — mà lời nhắn được tính NGAY, nên chính bài test gọi vào getter
    // rồi nổ, trong khi baoLuot() đã bắt lỗi đúng như phải thế. Bài test tự
    // nổ thì cho ra kết luận sai y như mã hỏng.
    const cacRac = [null, undefined, {}, { chay: false, get khach() { throw new Error('vỡ'); } }];
    for (let i = 0; i < cacRac.length; i++) {
        const kq = await Tg.baoLuot({ banGhi: cacRac[i], caiDat: CAI_DAT, kho: taoKho(),
                                      layFetch: taoFetch(), luc: 1 });
        assert.strictEqual(typeof kq, 'object', 'ném với rác số ' + i);
    }
    // Cái bẫy PHẢI thật sự nổ, nếu không bài này chẳng kiểm được gì.
    const kqBay = await Tg.baoLuot({
        banGhi: cacRac[3], caiDat: CAI_DAT, kho: taoKho(), layFetch: taoFetch(), luc: 1 });
    assert.strictEqual(kqBay.ma, 'NGOAI_LE', 'cảnh dựng không chạm tới lớp bắt lỗi');
    const f = taoFetch();
    const kq = await Tg.baoLuot({ banGhi: LUOT, caiDat: {}, kho: taoKho(), layFetch: f, luc: 1 });
    assert.strictEqual(f.cac.length, 0, 'chưa khai báo mà vẫn gọi mạng');
    assert.strictEqual(kq.ma, 'CHUA_KHAI_BAO');
    assert.strictEqual(kq.hong, 0, 'chưa khai báo mà đếm thành hỏng');
});

test('mã chống trùng của lượt gắn với NGÀY, không chỉ mốc giờ', () => {
    // Cùng mốc 18:10 nhưng hai ngày khác nhau là hai chuyện khác nhau.
    const a = Tg.maLuot(LUOT);
    const b = Tg.maLuot({ ...LUOT, ngay: { tu: '2026-08-22' } });
    assert.notStrictEqual(a, b, 'hôm sau hỏng lại thì im lặng luôn');
});

ghiChu('— Nối vào nền: tin cả lượt —');

test('⭐ nền có gọi baoLuot khi ghi lịch sử', () => {
    const ma = doc('background.js');
    // ⚠️ ĐÒI ĐÚNG CÂU LỆNH GỌI, không chỉ đòi cái tên có mặt. Bản đầu tôi chỉ
    // dò tên hàm — gài lỗi bọc nó trong `if (0)` thì tên vẫn còn nguyên và bài
    // test vẫn xanh, trong khi tin cả-lượt đã chết hẳn.
    assert.match(ma, /const kq = await self\.HDT_BaoTelegram\.baoLuot\(\{[\s\S]{0,120}banGhi/,
        'quên nối tin cả-lượt → cả lượt hỏng mà không ai biết');
    assert.ok(!/if \((?:0|false)\)[^\n]*baoLuot/.test(ma), 'lời gọi baoLuot bị vô hiệu hoá');
});

test('⛔⛔ tin cả lượt cũng KHÔNG được làm hỏng lần chạy', () => {
    const ma = doc('background.js');
    const b = ma.indexOf('self.HDT_BaoTelegram.baoLuot');
    const khuc = ma.slice(Math.max(0, b - 400), b + 600);
    assert.match(khuc, /try \{/, 'không bọc trong try: ' + khuc.slice(-200));
    assert.match(khuc, /catch \(e\) \{ \/\* cố ý nuốt/, 'không nuốt lỗi');
});

ghiChu('— ⭐⭐ CHỐNG BÁO TRÙNG —');

test('⭐⭐ cùng một mã lệnh gọi HAI lần chỉ nhắn MỘT tin', async () => {
    const kho = taoKho();
    const f = taoFetch();
    const g = { cacDong: [DONG], caiDat: CAI_DAT, kho, layFetch: f, luc: 1 };
    await Tg.baoCacDong(g);
    await Tg.baoCacDong(g);
    assert.strictEqual(f.cac.length, 1, 'đã nhắn ' + f.cac.length + ' tin cho một hóa đơn');
});

test('⭐⭐ ĐÚNG HAI ĐƯỜNG GỬI THẬT: sau mỗi khách, rồi gửi lại cuối loạt', async () => {
    // Đây là cảnh thật, không phải giả định: background.js gọi baoTelegram hai
    // lần cho cùng một khách. Bài này đi qua ĐÚNG hai hàm dựng dòng của
    // dayVeSell.js, để chắc mã chống trùng khớp nhau ở cả hai — nếu chúng lệch
    // thì mỗi hóa đơn nhận hai tin.
    const lenh = { id: 'lenh-that-99', maKH: 'S3', tenKH: 'Thùy Dương S3', soTien: 8717000 };
    const dong1 = DayVeSell.dongTuTienDo(
        { loai: 'xong', lenh, ketQua: { daBamThanhToan: true, tong: 8717000 } },
        '2026-08-19', Date.UTC(2026, 7, 19, 11, 15, 0));
    const banGhi = { ngay: { tu: '2026-08-19' }, luc: Date.UTC(2026, 7, 19, 11, 30, 0),
                     khach: [{ maKH: 'S3', tenKH: 'Thùy Dương S3', maLenh: 'lenh-that-99',
                               ket: 'RA_HOA_DON', tongTendoo: 8717000, chiTiet: '' }] };
    const dong2 = DayVeSell.goiTuBanGhi(banGhi);

    assert.strictEqual(dong1.ma_lenh, dong2[0].ma_lenh,
        'HAI ĐƯỜNG GỬI DÙNG MÃ KHÁC NHAU — chống trùng sẽ vỡ');

    const kho = taoKho();
    const f = taoFetch();
    await Tg.baoCacDong({ cacDong: [dong1], caiDat: CAI_DAT, kho, layFetch: f, luc: 1 });
    await Tg.baoCacDong({ cacDong: dong2, caiDat: CAI_DAT, kho, layFetch: f, luc: 2 });
    assert.strictEqual(f.cac.length, 1, 'nhắn ' + f.cac.length + ' tin cho một hóa đơn');
});

test('hai khách khác nhau thì nhắn hai tin', async () => {
    const kho = taoKho();
    const f = taoFetch();
    await Tg.baoCacDong({
        cacDong: [DONG, { ...DONG, ma_lenh: 'lenh-khac', ma_khach_hang: 'S3' }],
        caiDat: CAI_DAT, kho, layFetch: f, luc: 1,
    });
    assert.strictEqual(f.cac.length, 2);
});

ghiChu('— ⭐ GỬI HỎNG THÌ TRẢ CHỖ, ĐỂ CÒN THỬ LẠI —');

test('⭐⭐ gửi hỏng → sổ KHÔNG giữ dấu → lượt sau thử lại được', async () => {
    const kho = taoKho();
    const hong = taoFetch({ ok: false, status: 500, than: { ok: false } });
    const kq = await Tg.baoCacDong({ cacDong: [DONG], caiDat: CAI_DAT, kho, layFetch: hong, luc: 1 });
    assert.strictEqual(kq.hong, 1);
    assert.strictEqual(kq.daGui, 0);
    assert.deepStrictEqual(kho.xem(), [], 'còn giữ dấu → tin này mất vĩnh viễn');

    const tot = taoFetch();
    const kq2 = await Tg.baoCacDong({ cacDong: [DONG], caiDat: CAI_DAT, kho, layFetch: tot, luc: 2 });
    assert.strictEqual(kq2.daGui, 1, 'không thử lại được sau khi hỏng');
});

test('⭐⭐ gửi ĐƯỢC thì sổ GIỮ dấu → không nhắn lại', async () => {
    const kho = taoKho();
    await Tg.baoCacDong({ cacDong: [DONG], caiDat: CAI_DAT, kho, layFetch: taoFetch(), luc: 1 });
    assert.strictEqual((kho.xem() || []).length, 1, 'không ghi dấu → sẽ nhắn lại');
    assert.strictEqual(kho.xem()[0].ma, DONG.ma_lenh);
});

test('⛔ ĐÁNH DẤU TRƯỚC KHI GỬI, không phải sau', async () => {
    // Nếu đánh dấu sau khi gửi thì service worker chết giữa chừng là báo trùng.
    // Bài này soi vào đúng khoảnh khắc đang gửi.
    const kho = taoKho();
    let trongLucGui = null;
    const f = async () => {
        trongLucGui = kho.xem();
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };
    await Tg.baoCacDong({ cacDong: [DONG], caiDat: CAI_DAT, kho, layFetch: f, luc: 1 });
    assert.ok(Array.isArray(trongLucGui) && trongLucGui.length === 1,
        'lúc đang gửi mà sổ chưa có dấu → chết giữa chừng là báo trùng');
});

ghiChu('— ⛔ VIỆC PHỤ: KHÔNG BAO GIỜ ĐƯỢC NÉM —');

test('⛔⛔ fetch ném lỗi cũng không được ném ra ngoài', async () => {
    const kq = await Tg.baoCacDong({
        cacDong: [DONG], caiDat: CAI_DAT, kho: taoKho(),
        layFetch: async () => { throw new Error('mất mạng'); }, luc: 1,
    });
    assert.strictEqual(kq.hong, 1);
    assert.strictEqual(kq.ma, 'KHONG_GOI_DUOC');
});

test('⛔⛔ sổ hỏng (đọc/ghi đều ném) cũng không được ném ra ngoài', async () => {
    const khoVo = { doc: async () => { throw new Error('vỡ'); },
                    ghi: async () => { throw new Error('vỡ'); } };
    const kq = await Tg.baoCacDong({ cacDong: [DONG], caiDat: CAI_DAT, kho: khoVo,
                                     layFetch: taoFetch(), luc: 1 });
    assert.strictEqual(typeof kq, 'object');
    assert.strictEqual(kq.daGui, 0, 'sổ hỏng mà vẫn gửi → mất chống trùng');
});

test('⛔⛔ dòng dữ liệu tự nó NỔ cũng không được ném ra ngoài', async () => {
    // ⚠️ Hai bài ngay trên KHÔNG chạm tới lớp bắt lỗi ngoài cùng của
    // baoCacDong: fetch nổ thì guiTin đã bắt, sổ nổ thì gianhCho đã bắt. Gài
    // lỗi cho lớp ngoài cùng ném ra thì cả hai bài vẫn XANH — tức là lớp ấy
    // chưa từng được kiểm. Đây là bài chạm tới nó.
    // ⚠️ Phải có ĐỦ mã khách và mã lệnh, nếu không loaiTin() chặn ngay ở khâu
    // kiểm mã và không bao giờ chạm tới cái bẫy — bài test khi ấy xanh vì lý
    // do sai, và lớp bắt lỗi ngoài cùng lại chưa từng được kiểm.
    const nomit = { ma_khach_hang: 'TB', ma_lenh: 'x',
                    get ket_qua() { throw new Error('vỡ khi đọc'); } };
    const kq = await Tg.baoCacDong({ cacDong: [nomit], caiDat: CAI_DAT, kho: taoKho(),
                                     layFetch: taoFetch(), luc: 1 });
    assert.strictEqual(typeof kq, 'object');
    assert.strictEqual(kq.ma, 'NGOAI_LE', JSON.stringify(kq));
});

test('⛔⛔ dữ liệu rác đủ kiểu cũng không được ném', async () => {
    for (const x of [null, undefined, 0, '', [], [null], [{}], {}]) {
        const kq = await Tg.baoCacDong({ cacDong: x, caiDat: CAI_DAT, kho: taoKho(),
                                         layFetch: taoFetch(), luc: 1 });
        assert.strictEqual(typeof kq, 'object', 'vỡ với ' + JSON.stringify(x));
    }
    assert.strictEqual(typeof Tg.soanTin(null), 'string');
    assert.strictEqual(Tg.nenBao(null), false);
    assert.strictEqual(Tg.nenBao(undefined), false);
    assert.strictEqual(typeof Tg.chuGio('rác'), 'string');
});

ghiChu('— Chưa khai báo thì im lặng, KHÔNG gọi mạng —');

test('⛔ thiếu token hoặc thiếu chat id → không gọi Telegram lần nào', async () => {
    for (const c of [{}, { telegramToken: 'x' }, { telegramChatId: 'y' },
                     { telegramToken: '  ', telegramChatId: 'y' }]) {
        const f = taoFetch();
        const kq = await Tg.baoCacDong({ cacDong: [DONG], caiDat: c, kho: taoKho(),
                                         layFetch: f, luc: 1 });
        assert.strictEqual(f.cac.length, 0, 'vẫn gọi mạng với ' + JSON.stringify(c));
        assert.strictEqual(kq.ma, 'CHUA_KHAI_BAO');
        // ⚠️ VÀ KHÔNG ĐƯỢC ĐẾM LÀ HỎNG. Tính năng đang TẮT là chuyện bình
        // thường, không phải sự cố. Đếm là hỏng thì background.js ghi trạng
        // thái "lần báo gần nhất HỎNG", và màn khai báo bật báo động đỏ cho
        // một tính năng người dùng cố ý không dùng.
        assert.strictEqual(kq.hong, 0,
            'chưa khai báo mà bị đếm là hỏng → báo động đỏ giả với ' + JSON.stringify(c));
    }
});

test('⭐⭐ chưa khai báo thì KHÔNG được ghi dấu "đã báo"', async () => {
    // ⚠️ Đây mới là chỗ đau. Nếu chưa khai mà vẫn ghi dấu, thì hôm sau người
    // dùng khai token xong, những hóa đơn đã chạy trong lúc chưa khai sẽ MÃI
    // MÃI không được nhắc — sổ bảo là đã báo rồi.
    //
    // Bài "không gọi mạng" ngay trên KHÔNG bắt được chuyện này: guiTin cũng tự
    // chặn khi thiếu khai báo, nên bỏ chốt ở baoCacDong đi thì mạng vẫn im mà
    // sổ thì đã bẩn. Đã gài lỗi và nó lọt lưới thật.
    const kho = taoKho();
    await Tg.baoCacDong({ cacDong: [DONG], caiDat: {}, kho, layFetch: taoFetch(), luc: 1 });
    assert.ok(!(kho.xem() || []).length, 'sổ đã bị ghi dấu trong khi chưa gửi gì: '
        + JSON.stringify(kho.xem()));

    // Khai xong thì hóa đơn ấy vẫn phải được nhắc.
    const f = taoFetch();
    const kq = await Tg.baoCacDong({ cacDong: [DONG], caiDat: CAI_DAT, kho, layFetch: f, luc: 2 });
    assert.strictEqual(kq.daGui, 1, 'hóa đơn cũ bị nuốt mất vì sổ đã bẩn');
});

ghiChu('— Telegram từ chối: phải NÓI ĐƯỢC PHẢI SỬA Ở ĐÂU —');

test('⭐ 401 → chỉ thẳng tới @BotFather', async () => {
    const kq = await Tg.guiTin(CAI_DAT, 'x',
        taoFetch({ ok: false, status: 401, than: { ok: false, description: 'Unauthorized' } }));
    assert.strictEqual(kq.ma, 'SAI_TOKEN');
    assert.match(kq.thongBao, /BotFather/, kq.thongBao);
});

test('⭐ "chat not found" → bảo người dùng NHẮN CHO BOT trước', async () => {
    const kq = await Tg.guiTin(CAI_DAT, 'x', taoFetch(
        { ok: false, status: 400, than: { ok: false, description: 'Bad Request: chat not found' } }));
    assert.strictEqual(kq.ma, 'SAI_CHAT_ID');
    assert.match(kq.thongBao, /NHẮN CHO BOT/, kq.thongBao);
});

test('403 → bot bị chặn', async () => {
    const kq = await Tg.guiTin(CAI_DAT, 'x', taoFetch(
        { ok: false, status: 403, than: { ok: false, description: 'Forbidden: bot was blocked' } }));
    assert.strictEqual(kq.ma, 'BOT_BI_CHAN');
});

test('⛔ thông báo lỗi KHÔNG được chứa token', async () => {
    for (const t of [401, 400, 403, 500]) {
        const kq = await Tg.guiTin(CAI_DAT, 'x',
            taoFetch({ ok: false, status: t, than: { ok: false, description: 'x' } }));
        assert.ok(!String(kq.thongBao || '').includes(CAI_DAT.telegramToken),
            'token lọt vào thông báo lỗi ' + t);
    }
});

ghiChu('— Dò chat id —');

test('⭐ chatId vẫn là nơi gần nhất (chỗ gọi cũ không phải sửa)', async () => {
    const f = taoFetch({ ok: true, than: { ok: true, result: [
        { message: { chat: { id: 111, type: 'private', first_name: 'Cũ' } } },
        { message: { chat: { id: 222, type: 'private', username: 'chung' } } },
    ] } });
    const kq = await Tg.doChatId(CAI_DAT, f);
    assert.strictEqual(kq.ok, true);
    assert.strictEqual(kq.chatId, '222');
    assert.match(f.cac[0].url, /\/getUpdates$/, f.cac[0].url);
});

// ⚠️ ĐẢO LẠI LUẬT CŨ (26/08/2026). Chỗ này trước đây khoá "BỎ QUA nhóm — chủ
// dự án chốt chat RIÊNG". Chủ dự án đổi ý khi muốn báo về cả nhóm: thêm bot vào
// nhóm mà nút dò vẫn lọc bỏ nhóm thì không đường nào lấy được id nhóm.
test('⭐ THẤY CẢ NHÓM, không lọc bỏ nữa', async () => {
    const f = taoFetch({ ok: true, than: { ok: true, result: [
        { message: { chat: { id: 111, type: 'private', first_name: 'Chung' } } },
        { message: { chat: { id: -999, type: 'group', title: 'Nhóm hóa đơn' } } },
    ] } });
    const kq = await Tg.doChatId(CAI_DAT, f);
    assert.strictEqual(kq.ok, true);
    assert.deepStrictEqual(kq.cacChat.map(x => x.id), ['111', '-999'],
        'nhóm vẫn bị lọc bỏ — thêm bot vào nhóm xong không lấy được id');
    const nhom = kq.cacChat.find(x => x.id === '-999');
    assert.strictEqual(nhom.nhom, true, 'không đánh dấu đây là nhóm');
    assert.strictEqual(nhom.ten, 'Nhóm hóa đơn',
        'mất tên nhóm — người dùng không biết chọn cái nào');
});

test('bỏ trùng theo id, giữ lần nhắc CUỐI (tên nhóm có thể vừa đổi)', async () => {
    const f = taoFetch({ ok: true, than: { ok: true, result: [
        { message: { chat: { id: -999, type: 'group', title: 'Tên cũ' } } },
        { message: { chat: { id: -999, type: 'group', title: 'Tên mới' } } },
    ] } });
    const kq = await Tg.doChatId(CAI_DAT, f);
    assert.strictEqual(kq.cacChat.length, 1, 'một nhóm hiện ra hai lần');
    assert.strictEqual(kq.cacChat[0].ten, 'Tên mới');
});

test('chưa nhắn cho bot → nói rõ phải làm gì', async () => {
    const kq = await Tg.doChatId(CAI_DAT, taoFetch({ ok: true, than: { ok: true, result: [] } }));
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ma, 'CHUA_CO_TIN');
    // Phải chỉ đường cho CẢ HAI: chat riêng và nhóm. Nhóm có luật khác hẳn —
    // bot không đọc được tin thường, nên không nói ra là người dùng nhắn mãi
    // vào nhóm mà nút này cứ im.
    assert.match(kq.thongBao, /nhắn cho bot/i, kq.thongBao);
    assert.match(kq.thongBao, /[/]start@/,
        'không chỉ đường lấy id NHÓM: ' + kq.thongBao);
});

test('chưa có token thì không gọi mạng', async () => {
    const f = taoFetch();
    const kq = await Tg.doChatId({}, f);
    assert.strictEqual(kq.ma, 'CHUA_CO_TOKEN');
    assert.strictEqual(f.cac.length, 0);
});

ghiChu('— Sổ không được phình mãi —');

test('bỏ bản ghi cũ hơn 7 ngày', () => {
    const nay = Date.UTC(2026, 7, 20, 0, 0, 0);
    const ds = [{ ma: 'cu', luc: nay - 8 * 24 * 3600 * 1000 },
                { ma: 'moi', luc: nay - 1000 }];
    const con = Tg.donSo(ds, nay);
    assert.deepStrictEqual(con.map(x => x.ma), ['moi']);
});

test('cắt bớt khi quá giới hạn, giữ phần MỚI NHẤT', () => {
    const nay = Date.now();
    const ds = Array.from({ length: Tg.GIOI_HAN_SO + 50 },
                          (_, i) => ({ ma: 'm' + i, luc: nay }));
    const con = Tg.donSo(ds, nay);
    assert.strictEqual(con.length, Tg.GIOI_HAN_SO);
    assert.strictEqual(con[con.length - 1].ma, 'm' + (Tg.GIOI_HAN_SO + 49));
});

test('sổ rác thì coi như rỗng, không ném', () => {
    for (const x of [null, undefined, 'chuỗi', 42, [null], [{}]]) {
        assert.ok(Array.isArray(Tg.donSo(x, Date.now())), 'vỡ với ' + JSON.stringify(x));
    }
});

ghiChu('— Cài đặt: ô trống KHÔNG được xoá mất token —');

test('⭐⭐ ô token để trống thì GIỮ NGUYÊN cái đã lưu', () => {
    // Màn khai báo không bao giờ vẽ lại bí mật đã lưu, nên ô trống là chuyện
    // thường. Nhận chuỗi rỗng ở đây là mỗi lần bấm Lưu vì việc khác lại âm thầm
    // xoá token — tính năng tắt mà không ai hay.
    const cu = { telegramToken: 'token-cu', telegramChatId: '111' };
    const moi = CaiDat.gop(cu, { telegramToken: '', telegramChatId: '222' });
    assert.strictEqual(moi.telegramToken, 'token-cu');
    assert.strictEqual(moi.telegramChatId, '222');
});

test('gõ token mới thì đổi', () => {
    const moi = CaiDat.gop({ telegramToken: 'cu' }, { telegramToken: 'moi' });
    assert.strictEqual(moi.telegramToken, 'moi');
});

test('⭐ muốn TẮT thì phải nói thẳng', () => {
    const moi = CaiDat.gop({ telegramToken: 'cu', telegramChatId: '111' },
                           { xoaTelegram: true });
    assert.strictEqual(moi.telegramToken, '');
    assert.strictEqual(moi.telegramChatId, '');
});

test('⛔ lưu công tắc khác KHÔNG được đụng tới Telegram', () => {
    const moi = CaiDat.gop({ telegramToken: 'cu', telegramChatId: '111' }, { tuBam: true });
    assert.strictEqual(moi.telegramToken, 'cu');
    assert.strictEqual(moi.telegramChatId, '111');
});

test('mặc định là TẮT', () => {
    assert.strictEqual(CaiDat.MAC_DINH.telegramToken, '');
    assert.strictEqual(CaiDat.MAC_DINH.telegramChatId, '');
    const c = CaiDat.tuKho(null);
    assert.strictEqual(c.telegramToken, '');
});

ghiChu('— Nối vào nền: đúng chỗ, đúng thứ tự —');

const fs = require('node:fs');
const path = require('node:path');
const GOC = path.join(__dirname, '..');
const doc = (f) => fs.readFileSync(path.join(GOC, f), 'utf8');

test('nền có nạp chung/baoTelegram.js', () => {
    const ma = doc('background.js');
    assert.match(ma, /importScripts\([\s\S]*?'chung\/baoTelegram\.js'[\s\S]*?\);/,
        'chưa nạp module — self.HDT_BaoTelegram sẽ là undefined lúc chạy thật');
});

test('manifest có quyền gọi api.telegram.org', () => {
    const m = JSON.parse(doc('manifest.json'));
    assert.ok(m.host_permissions.includes('https://api.telegram.org/*'),
        'thiếu quyền → fetch bị chặn, không tin nào ra khỏi máy');
});

test('⛔ KHÔNG nhét baoTelegram.js vào content script', () => {
    // Nó chỉ chạy ở service worker. Đưa vào trang web là mở rộng mặt tiếp xúc
    // mà chẳng được gì.
    const m = JSON.parse(doc('manifest.json'));
    for (const nhom of m.content_scripts) {
        assert.ok(!nhom.js.includes('chung/baoTelegram.js'),
            'baoTelegram.js bị nạp vào trang: ' + nhom.matches.join(','));
    }
});

// ⚠️ BA BÀI DƯỚI ĐÂY TRƯỚC ĐÂY GHIM ĐÚNG MỘT DÒNG MÃ (`if (dong) baoTelegram(dong)`).
// Ngày 31/08/2026 móc ấy phải xếp lại thứ tự (ghi sổ Sell xong rồi mới đọc số
// quý), và cả ba đỏ lên vì chuỗi đổi — trong khi LỜI HỨA vẫn còn nguyên. Tệ hơn:
// bài "KHÔNG await" chuyển sang XANH RỖNG, vì chuỗi nó đi tìm biến mất luôn.
//
// Nay bám vào thân hàm và vào TÍNH CHẤT cần giữ, không bám vào cách viết.
const thanHam = (ma, ten) => {
    const i = ma.indexOf(ten);
    if (i < 0) return '';
    // Đủ dài để trùm hết thân hàm, không lấn sang hàm kế tiếp.
    return ma.slice(i, i + 1600);
};

test('⭐⭐ báo NGAY SAU MỖI KHÁCH, cạnh đường đẩy sang Sell', () => {
    const than = thanHam(doc('background.js'), 'function taoMocDaySell');
    assert.match(than, /daySangSell\(dong\)/, 'móc từng khách không đẩy sang Sell');
    assert.match(than, /baoTelegram\(/, 'chưa móc báo Telegram vào móc chạy-sau-mỗi-khách');
});

test('⛔⛔ KHÔNG await — Telegram chậm KHÔNG được làm chậm loạt hóa đơn', () => {
    // Hàm móc PHẢI trả về ngay. Việc chậm (đẩy Sell, đọc số quý, nhắn tin) nằm
    // trong một khối chạy nền tự bắn đi. Để hàm móc thành `async` là cả vòng
    // phát hành hóa đơn đứng đợi Telegram.
    const than = thanHam(doc('background.js'), 'function taoMocDaySell');
    assert.ok(!/return\s+async\s*\(/.test(than),
        'hàm móc thành async -> loạt phát hành đứng đợi Telegram');
    assert.match(than, /\(async \(\) => \{[\s\S]*?\}\)\(\)/,
        'không có khối chạy nền -> việc chậm nằm thẳng trong hàm móc');
    assert.match(than, /\.catch\(/,
        'khối chạy nền không bắt lỗi -> một lời hứa treo làm nền nổ');
});

test('⭐ có lưới an toàn cuối loạt', () => {
    const than = thanHam(doc('background.js'), 'async function ghiLichSu');
    assert.match(than, /baoTelegram\([\s\S]{0,80}?goiTuBanGhi\(banGhi\)/,
        'thiếu lưới cuối loạt → tin hỏng giữa chừng không bao giờ được thử lại');
});

test('⛔⛔ KHÔNG bám vào hàng chờ gửi Sell', () => {
    // Hàng chờ ấy được gửi lại nhiều lần cho tới khi Sell nhận được. Bám vào đó
    // là mỗi lần gửi bù lại thêm một tin Telegram.
    const ma = doc('background.js');
    const than = ma.slice(ma.indexOf('async function baoTelegram'),
                          ma.indexOf('async function daySangSell'));
    assert.ok(!/khoChoGui|xepVaGui/.test(than),
        'baoTelegram đang đụng vào hàng chờ gửi Sell: ' + than.slice(0, 400));
});

ghiChu('— ⛔ TOKEN KHÔNG ĐƯỢC RỜI KHỎI NỀN —');

/** Lấy đúng hàm `cheTokenTelegram` ra khỏi background.js để chạy thật. */
function layCheToken() {
    const ma = doc('background.js');
    const b = ma.indexOf('function cheTokenTelegram');
    assert.ok(b > 0, 'không tìm thấy cheTokenTelegram trong background.js');
    const e = ma.indexOf('\n}', b) + 2;
    // eslint-disable-next-line no-new-func
    return new Function(ma.slice(b, e) + '\nreturn cheTokenTelegram;')();
}

test('⭐⭐ câu trả lời KHÔNG mang theo token, chỉ mang cờ "đã có"', () => {
    // `hdt-hoi-cai-dat` và `hdt-dat-cai-dat` KHÔNG chỉ phục vụ màn khai báo —
    // bảng cài đặt bên bongtom.store cũng gửi đúng hai tin này, mà đó là CONTENT
    // SCRIPT chạy trong trang web. Trả cả gói về là đặt token trong tầm với của
    // mã trên trang ấy.
    const che = layCheToken();
    const ra = che({ telegramToken: 'bi-mat-123', telegramChatId: '999', tuBam: true });
    assert.strictEqual(ra.telegramToken, undefined, 'TOKEN VẪN LỌT RA NGOÀI');
    assert.strictEqual(ra.telegramDaCoToken, true);
    assert.strictEqual(ra.telegramChatId, '999', 'chat id phải giữ để màn khai báo hiện được');
    assert.strictEqual(ra.tuBam, true, 'không được làm mất phần cài đặt khác');
});

test('chưa khai token thì cờ là false', () => {
    const che = layCheToken();
    assert.strictEqual(che({}).telegramDaCoToken, false);
    assert.strictEqual(che({ telegramToken: '   ' }).telegramDaCoToken, false);
    assert.strictEqual(che(null).telegramDaCoToken, false);
});

test('⛔ KHÔNG sửa vào gói gốc — nền còn dùng lại nó để gửi thật', () => {
    const che = layCheToken();
    const goc = { telegramToken: 'bi-mat-123' };
    che(goc);
    assert.strictEqual(goc.telegramToken, 'bi-mat-123',
        'đã xoá token khỏi gói gốc → lần gửi sau không còn token để dùng');
});

test('⭐⭐ CẢ HAI tin cài đặt đều phải đi qua bộ che', () => {
    const ma = doc('background.js');
    for (const tin of ['hdt-hoi-cai-dat', 'hdt-dat-cai-dat']) {
        const b = ma.indexOf(`tin.loai === '${tin}'`);
        assert.ok(b > 0, 'không thấy nhánh ' + tin);
        // ⚠️ Cắt tới HẾT nhánh (dòng `return true;` kết thúc nó), KHÔNG cắt
        // theo số ký tự. Bản đầu lấy 900 ký tự; nhánh dài thêm ra là bài kiểm
        // đỏ dù bộ che vẫn nguyên chỗ cũ.
        const het = ma.indexOf('\n        return true;', b);
        assert.ok(het > b, `không thấy chỗ kết thúc nhánh ${tin}`);
        const khuc = ma.slice(b, het);
        assert.match(khuc, /cheTokenTelegram/, `nhánh ${tin} trả token ra ngoài`);
    }
});

test('⛔ màn khai báo KHÔNG được đọc telegramToken từ câu trả lời', () => {
    // Nền không trả trường ấy nữa; màn khai báo mà vẫn đọc thì lặng lẽ coi như
    // "chưa khai" và hiện sai trạng thái.
    const ma = doc('popup/khaiBao.js');
    assert.ok(!/\.telegramToken\b/.test(ma.replace(/tin\.telegramToken|telegramToken:/g, '')),
        'khaiBao.js còn đọc giá trị telegramToken từ nền');
});

chay('BÁO VỀ TELEGRAM KHI XUẤT HÓA ĐƠN');
