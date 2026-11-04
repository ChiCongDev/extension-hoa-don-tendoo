'use strict';

// Test CÔNG TẮC "TỰ BẤM THANH TOÁN" trên bảng — giai đoạn 5.
// Chạy: node test/bangThuTuBam.test.js   (cần biến HDT_JSDOM)
//
// Câu hỏi cả file này trả lời: "có bao giờ nút Thanh toán bị bấm khi lẽ ra
// không được không?" — và câu trả lời phải luôn là KHÔNG.

const assert = require('node:assert');
const { test, ghiChu, chay } = require('./chay');
require('./hanChoNganChoTest');   // hạn chờ ngắn cho test — xem file đó
require('../chung/domReact');
const BoGio = require('../tendoo/boGio');
globalThis.HDT_BoGio = BoGio;
const BamThanhToan = require('../tendoo/bamThanhToan');
const BangThu = require('../tendoo/bangThu');
const DocSanPham = require('../tendoo/docSanPham');
const DanhTinh = require('../tendoo/danhTinh');
const GhepTien = require('../chung/ghepTien');
const { taoTrangPos, HANG_MAU } = require('./trangPosGiaLap');

const CH = '2c683a17-09ab-4655-8dbf-50ca8105373c';

function boNoiGia() {
    return {
        async layPhien() {
            return { success: true, data: {
                account: { display_name: 'CH THUỲ DƯƠNG', max_store_count: 1 },
                business_info: { current_store: { id: CH, store_name: 'CH THUỲ DƯƠNG' },
                                 current_role: { role_name: 'Chủ cửa hàng' } } } };
        },
        async goiTrangSanPham(trang) {
            return { success: true,
                data: HANG_MAU.map((h, i) => ({
                    id: 'sp-' + i, name: h.ten, product_code: 'SP' + i,
                    variant_mode: 'non_variant', business_id: CH,
                    base_price: h.gia, final_price: h.gia,
                    available_quantity: h.ton, is_out_of_stock: true, version: 2 })),
                meta: { total: HANG_MAU.length, size: 200, page: trang, total_pages: 1 } };
        },
    };
}

function luuTruCaiDat(banDau = null) {
    let o = banDau;
    return { async doc() { return o; }, async ghi(x) { o = x; }, xem: () => o };
}

async function dung({ caiDat = null, khongCoBam = false, tuyChonTrang = {} } = {}) {
    const trang = taoTrangPos(tuyChonTrang);
    const lt = luuTruCaiDat(caiDat);
    const bang = BangThu.taoBang(trang.tailieu, {
        DocSanPham, DanhTinh, GhepTien, BoGio,
        BamThanhToan: khongCoBam ? null : BamThanhToan,
        luuTruCaiDat: lt,
        taoBoNoi: () => boNoiGia(),
    });
    await bang.napCaiDat();
    bang.ve();
    return { trang, bang, td: trang.tailieu, luu: lt };
}

// Trang giả nay đã tự dọn giỏ sau khi bấm "Xác nhận", đúng như trang thật —
// nên không cần bắt chước bằng tay nữa. Muốn thử cảnh Tendoo treo giữa chừng
// thì dựng trang với { giuGioSauXacNhan: true }.

ghiChu('— ⛔ Mặc định TẮT —');

test('mở lần đầu: công tắc TẮT, không có ô xác nhận', async () => {
    const { td, bang } = await dung();
    assert.strictEqual(bang.tuBam(), false);
    assert.strictEqual(td.getElementById('hdt-thu-tu-bam').checked, false);
    assert.strictEqual(td.getElementById('hdt-thu-da-hieu'), null, 'lộ ô xác nhận khi chưa bật');
});

test('công tắc TẮT → chạy xong KHÔNG bấm Thanh toán', async () => {
    const { trang, bang } = await dung();
    await bang.chay(3000000);
    assert.strictEqual(bang.ketQua().dat, true, bang.ketQua().chu);
    assert.ok(trang.xemGio().length > 0, 'giỏ phải có hàng');
    assert.strictEqual(trang.daBam.thanhToan, 0, '❌ ĐÃ BẤM khi công tắc TẮT');
    assert.match(bang.ketQua().chu, /bạn tự bấm Thanh toán/);
});

test('BẬT công tắc nhưng CHƯA tick xác nhận → vẫn KHÔNG bấm', async () => {
    const { trang, bang, td } = await dung();
    td.getElementById('hdt-thu-tu-bam').click();
    assert.strictEqual(bang.tuBam(), true);
    assert.strictEqual(bang.daHieu(), false);
    await bang.chay(3000000);
    assert.strictEqual(trang.daBam.thanhToan, 0, '❌ ĐÃ BẤM khi chưa tick xác nhận');
});

test('bật rồi TẮT lại → xác nhận bị xóa theo, không còn hiệu lực', async () => {
    const { bang, td } = await dung();
    td.getElementById('hdt-thu-tu-bam').click();
    td.getElementById('hdt-thu-da-hieu').click();
    assert.strictEqual(bang.daHieu(), true);

    td.getElementById('hdt-thu-tu-bam').click();          // tắt
    assert.strictEqual(bang.tuBam(), false);
    assert.strictEqual(bang.daHieu(), false, 'xác nhận còn sót lại sau khi tắt');
});

test('không có bộ bấm (chưa nạp script) → không hiện công tắc, không bấm', async () => {
    const { trang, bang, td } = await dung({ khongCoBam: true });
    assert.strictEqual(td.getElementById('hdt-thu-khoi-tu-bam'), null);
    await bang.chay(3000000);
    assert.strictEqual(trang.daBam.thanhToan, 0);
});

ghiChu('— Bật đủ hai lớp mới phát hành —');

test('BẬT + tick xác nhận → bấm ĐÚNG MỘT lần, báo đã phát hành', async () => {
    const { trang, bang, td } = await dung();
    td.getElementById('hdt-thu-tu-bam').click();
    td.getElementById('hdt-thu-da-hieu').click();

    await bang.chay(3000000);
    assert.strictEqual(trang.daBam.thanhToan, 1, 'phải bấm Thanh toán đúng một lần');
    assert.strictEqual(trang.daBam.xacNhan, 1, 'phải bấm Xác nhận đúng một lần');
    assert.strictEqual(trang.daBam.luuDon, 0);
    assert.deepStrictEqual(trang.xemGio(), [], 'Tendoo dọn giỏ sau khi phát hành');
    assert.strictEqual(bang.ketQua().dat, true, bang.ketQua().chu);
    assert.match(bang.ketQua().chu, /ĐÃ PHÁT HÀNH/);
});

test('giao diện đổi hẳn khi bật: nút đỏ, tiêu đề và cảnh báo nói rõ', async () => {
    const { bang, td } = await dung();
    td.getElementById('hdt-thu-tu-bam').click();
    td.getElementById('hdt-thu-da-hieu').click();
    assert.match(td.getElementById('hdt-thu-chay').textContent, /PHÁT HÀNH/);
    assert.ok(td.getElementById('hdt-thu-chay').className.includes('hdt-do'), 'nút phải đỏ');
    assert.match(td.getElementById('hdt-thu-canh').textContent, /HÓA ĐƠN THẬT/);
    assert.match(td.getElementById(BangThu.ID_BANG).textContent, /TỰ PHÁT HÀNH ĐANG BẬT/);
    void bang;
});

test('bấm Xác nhận xong giỏ CÒN NGUYÊN → báo KHÔNG RÕ, không bấm lại', async () => {
    // Tendoo treo giữa chừng: bảng đóng nhưng giỏ không được dọn.
    const { trang, bang, td } = await dung({ tuyChonTrang: { giuGioSauXacNhan: true } });
    td.getElementById('hdt-thu-tu-bam').click();
    td.getElementById('hdt-thu-da-hieu').click();

    await bang.chay(3000000);
    assert.strictEqual(trang.daBam.thanhToan, 1);
    assert.strictEqual(trang.daBam.xacNhan, 1);
    assert.strictEqual(bang.ketQua().dat, false);
    assert.strictEqual(bang.ketQua().khongRo, true);
    assert.match(bang.ketQua().chu, /KHÔNG RÕ/i);
});

ghiChu('— Cửa chặn vẫn chặn dù công tắc đã bật —');

test('giỏ đang có hàng sẵn → không bỏ chồng, KHÔNG bấm', async () => {
    const trang = taoTrangPos({ gioBanDau: [{ ten: 'Quần Jogger thể thao nữ' }] });
    const bang = BangThu.taoBang(trang.tailieu, {
        DocSanPham, DanhTinh, GhepTien, BoGio, BamThanhToan,
        luuTruCaiDat: luuTruCaiDat({ tuBam: true, daHieu: true }),
        taoBoNoi: () => boNoiGia(),
    });
    await bang.napCaiDat();
    await bang.chay(3000000);
    assert.strictEqual(bang.tuBam(), true, 'công tắc phải đang bật');
    assert.strictEqual(trang.daBam.thanhToan, 0, '❌ ĐÃ BẤM dù giỏ đang dở');
});

test('không đủ hàng để ghép → KHÔNG bấm', async () => {
    const { trang, bang, td } = await dung();
    td.getElementById('hdt-thu-tu-bam').click();
    td.getElementById('hdt-thu-da-hieu').click();
    await bang.chay(900000000);
    assert.strictEqual(bang.ketQua().dat, false);
    assert.strictEqual(trang.daBam.thanhToan, 0);
});

test('không nhập số tiền → KHÔNG bấm', async () => {
    const { trang, bang, td } = await dung();
    td.getElementById('hdt-thu-tu-bam').click();
    td.getElementById('hdt-thu-da-hieu').click();
    await bang.chay(0);
    assert.strictEqual(trang.daBam.thanhToan, 0);
});

test('tổng trên màn hình bị lệch → KHÔNG bấm', async () => {
    const { trang, bang, td } = await dung();
    td.getElementById('hdt-thu-tu-bam').click();
    td.getElementById('hdt-thu-da-hieu').click();
    // Ép con số trên màn hình lệch 7đ so với thực tế — giống cảnh Tendoo đổi
    // giá hoặc chặn bớt hàng ngay trước lúc bấm. Bộ bấm đọc tổng qua đúng cửa
    // này, nên nó sẽ thấy lệch và phải từ chối.
    const goc = BoGio.docTongGio;
    BoGio.docTongGio = (td2) => goc(td2) + 7;
    try {
        await bang.chay(3000000);
        assert.strictEqual(trang.daBam.thanhToan, 0, '❌ ĐÃ BẤM dù tổng lệch');
    } finally {
        BoGio.docTongGio = goc;
    }
});

ghiChu('— Cài đặt được nhớ giữa các lần mở —');

test('bật xong thì ghi xuống bộ nhớ', async () => {
    const { td, luu } = await dung();
    td.getElementById('hdt-thu-tu-bam').click();
    td.getElementById('hdt-thu-da-hieu').click();
    assert.deepStrictEqual(luu.xem(), { tuBam: true, daHieu: true });
});

test('mở lại với cài đặt đã bật → giữ nguyên trạng thái bật', async () => {
    const { bang, td } = await dung({ caiDat: { tuBam: true, daHieu: true } });
    assert.strictEqual(bang.tuBam(), true);
    assert.strictEqual(bang.daHieu(), true);
    assert.match(td.getElementById('hdt-thu-chay').textContent, /PHÁT HÀNH/);
});

test('cài đặt hỏng (tuBam bật nhưng thiếu xác nhận) → coi như CHƯA xác nhận', async () => {
    const { trang, bang } = await dung({ caiDat: { tuBam: true } });
    assert.strictEqual(bang.tuBam(), true);
    assert.strictEqual(bang.daHieu(), false);
    await bang.chay(3000000);
    assert.strictEqual(trang.daBam.thanhToan, 0, '❌ ĐÃ BẤM dù chưa xác nhận');
});

chay('CÔNG TẮC TỰ BẤM THANH TOÁN');
