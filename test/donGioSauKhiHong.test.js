'use strict';

// DỌN GIỎ NGAY KHI BẤM THANH TOÁN HỎNG.
// Chạy: node test/donGioSauKhiHong.test.js   (cần biến HDT_JSDOM)
//
// ── CA HỎNG THẬT: 22/08/2026 ───────────────────────────────────────────────
//
//   11:29 · ✗ ki?n — Tổng cộng trong bảng xác nhận (null) không khớp tổng đã
//           tính (1450000) — đã bấm Quay lại, CHƯA phát hành gì.
//   12:25 · ✗ ki?n — Giỏ hàng trên tab Tendoo đang có sẵn 1 món (1.450.000đ).
//
// Món 1.450.000 ấy CHÍNH LÀ rổ đầu của ki?n mà máy tự bỏ vào lúc 11:29 rồi
// BỎ ĐI, để nguyên trong giỏ. Lượt 12:25 tới, thấy giỏ bẩn, chết ngay từ chốt
// đầu tiên. Và cứ thế mãi — MỘT lỗi làm kẹt vô thời hạn mọi lượt sau.
//
// Máy vốn có đường dọn "lười": gặp giỏ bẩn ở đầu lượt sau thì dọn. Nhưng đường
// ấy phải ĐỐI CHIẾU DẤU GIỎ để chắc hàng là của mình, và nó đã không nhận ra.
//
// ── ĐIỀU KHÔNG ĐƯỢC ĐÁNH ĐỔI ───────────────────────────────────────────────
// 'KHONG_RO' nghĩa là ĐÃ BẤM "Xác nhận" mà không đọc được kết quả — hóa đơn có
// thể đã lên cơ quan thuế. Giỏ phải giữ NGUYÊN để người dùng đối chiếu tận mắt.
// Dọn ở đó là xoá mất tang chứng của một chuyện có thể đã xảy ra thật.

const assert = require('node:assert');
const { test, ghiChu, chay } = require('./chay');

// ⚠️ RÚT NGẮN HẠN CHỜ — VÀ PHẢI LÀM TRƯỚC MỌI `require` KHÁC.
//
// `xuLyMotLenh()` không nhận tham số nhịp độ, nên tệp này chạy với hạn mặc định
// (8 giây chờ bảng, 8 giây chờ giỏ trống, 30 giây chờ vòng quay). Nó mất hơn ba
// phút, trong khi bộ gài lỗi cắt ở 25 giây -> MỌI bài đều "treo" và ra ĐỎ. Đỏ
// vì hết giờ chứ không phải vì chốt chặn bắt được — vô giá trị y như xanh sai
// lý do. Đã dính đúng vậy lúc viết.
//
// ⚠️ HAI CHỖ DỄ SAI, tôi vấp cả hai:
//
// 1. `bamThanhToan.js` chốt `const HAN_CHO_BANG_MS = NhipDo.HAN_CHO_BANG` NGAY
//    LÚC NẠP MÔ-ĐUN. Sửa NhipDo SAU khi require thì nó vẫn giữ số cũ. Nên khối
//    này phải đứng TRƯỚC mọi require khác.
//
// 2. Nhịp phải LỚN, không phải nhỏ. Các vòng chờ đếm theo `da += nhip` chứ không
//    theo đồng hồ thật, nên nhịp càng NHỎ thì càng NHIỀU vòng — mà mỗi
//    setTimeout trên Windows tốn tối thiểu ~15ms. Đặt nhịp 5ms còn chậm hơn.
//
// ⛔ CHỈ rút ngắn THỜI GIAN. Không đổi một luật nào.
const NhipDo = require('../chung/nhipDo');
for (const k of ['HAN_CHO_BANG', 'HAN_CHO_GIO_TRONG', 'HAN_CHO_BANG_THUE_DONG',
                 'HAN_CHO_DONG_GIO', 'HAN_CHO_TENDOO_QUAY', 'HAN_CHO_NUT_MO_KHOA']) {
    NhipDo[k] = 60;
}
NhipDo.NHIN_DOM = 30;
NhipDo.NHIN_XOA_DONG = 30;

require('../chung/domReact');
const BoGio = require('../tendoo/boGio');
const BamThanhToan = require('../tendoo/bamThanhToan');
const NhanLenh = require('../tendoo/nhanLenh');
const HangDoi = require('../chung/hangDoi');
const DauGio = require('../chung/dauGio');
const DanhTinh = require('../tendoo/danhTinh');
const DocSanPham = require('../tendoo/docSanPham');
const ChiaHoaDon = require('../chung/chiaHoaDon');
const { taoTrangPos, HANG_MAU } = require('./trangPosGiaLap');

const CH = '2c683a17-09ab-4655-8dbf-50ca8105373c';

/** Bộ nối giả — trả về đúng hình dạng API Tendoo mà docSanPham cần. */
function boNoiGia(hang) {
    return {
        async layPhien() {
            return { success: true, data: {
                account: { display_name: 'CH', max_store_count: 1 },
                business_info: { current_store: { id: CH, store_name: 'CH' },
                                 current_role: { role_name: 'Chủ' } } } };
        },
        async goiTrangSanPham(t) {
            return { success: true,
                data: hang.map((h, i) => ({ id: 'sp-' + i, name: h.ten, product_code: 'SP' + i,
                    variant_mode: 'non_variant', business_id: CH, base_price: h.gia,
                    final_price: h.gia, available_quantity: h.ton, is_out_of_stock: true,
                    version: 2 })),
                meta: { total: hang.length, size: 200, page: t, total_pages: 1 } };
        },
    };
}

/** Bộ phận giả đủ để chạy xuLyMotLenh trên trang giả. */
function taoBoi(trang, hang, caiDat = {}, dauLech = false) {
    let dau = null;
    return {
        tailieu: trang.tailieu,
        DanhTinh, DocSanPham, BoGio, ChiaHoaDon, DauGio, BamThanhToan,
        taoBoNoi: () => boNoiGia(hang),
        docCaiDat: async () => ({ tuBam: true, daHieu: true, docDuoc: true, dungSai: 200000,
                                  tranMoiHoaDon: 0, xoaGioLa: false, ...caiDat }),
        docKhoTaiKhoan: async () => ({ khach: {
            TB: { maCuaHang: CH, tenDangNhap: 'x', matKhauMaHoa: { iv: 'a', duLieu: 'b' } } } }),
        ghiDauGio: async (d) => { dau = DauGio.taoDau(d); },
        // `dauLech`: dấu giỏ KHÔNG khớp hàng đang có -> donGioConSot() từ chối
        // dọn (nó tưởng là hàng người dùng bày dở). Dùng để tách bạch đường dọn
        // CÓ ĐỐI CHIẾU DẤU với đường dọn NGAY của xuatMotHoaDon().
        docDauGio: async () => (dauLech
            ? DauGio.taoDau({ maKH: 'ZZ', danhSach: [{ ten: 'Món không có thật', soLuong: 9 }],
                              tong: 12345 })
            : dau),
        xoaDauGio: async () => { dau = null; },
        xemDauGio: () => dau,
    };
}

const lenh = (soTien) => ({ id: 'l1', maKH: 'TB', tenKH: 'Trang Bé TB', soTien });

async function chayLenh(tuyChonTrang = {}, caiDat = {}, dauLech = false) {
    // Tồn thật CAO để bộ ghép tiền luôn ra được một rổ đúng bằng số cần.
    const hang = HANG_MAU.map(h => ({ ...h, ton: 400 }));
    const trang = taoTrangPos({ hang, ...tuyChonTrang });
    const boi = taoBoi(trang, hang, caiDat, dauLech);
    const mon = hang[0];                                        // 990.000
    const kq = await NhanLenh.xuLyMotLenh(lenh(mon.gia), boi);
    return { trang, boi, kq };
}

ghiChu('— ⭐⭐⭐ CA 22/08: hỏng ở bảng xác nhận → PHẢI dọn giỏ ngay —');

test('⭐⭐⭐ bảng xác nhận sai tổng → dọn sạch giỏ, KHÔNG để kẹt lượt sau', async () => {
    const { trang, kq } = await chayLenh({ tongBangXn: 111000 });
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ma, BamThanhToan.MA.BANG_SAI_TONG, 'thông báo: ' + kq.thongBao);
    assert.strictEqual(trang.xemGio().length, 0,
        '⛔ VẪN ĐỂ HÀNG TRONG GIỎ — lượt sau sẽ chết y như 12:25 ngày 22/08');
    assert.strictEqual(trang.daBam.xacNhan, 0, 'không được phát hành gì');
});

test('⭐ và PHẢI NÓI RA là đã dọn', async () => {
    const { kq } = await chayLenh({ tongBangXn: 111000 });
    assert.match(kq.thongBao, /Đã tự dọn \d+ món máy vừa bỏ vào giỏ/, kq.thongBao);
    assert.strictEqual(kq.ketQua.daDonGio, true);
});

test('⭐⭐ dọn cho MỌI mã lỗi trước cú bấm "Xác nhận"', async () => {
    // Nút bị khóa, ghi nợ đang bật, bảng không hiện… tất cả đều xảy ra TRƯỚC
    // khi bấm Xác nhận, nên chắc chắn chưa phát hành và hàng là của máy.
    for (const tt of [{ nutTtKhoa: true }, { ghiNoBat: true }, { khongMoBang: true },
                      { tongBangXn: 111000 }]) {
        const { trang, kq } = await chayLenh(tt);
        assert.strictEqual(kq.ok, false, JSON.stringify(tt));
        assert.strictEqual(trang.xemGio().length, 0, '⛔ còn hàng trong giỏ: ' + JSON.stringify(tt));
        assert.strictEqual(trang.daBam.xacNhan, 0, JSON.stringify(tt));
    }
});

ghiChu('— ⛔⛔ KHÔNG RÕ: giữ nguyên giỏ, đó là TANG CHỨNG —');

test('⛔⛔⛔ KHÔNG RÕ + dấu giỏ KHỚP → VẪN phải giữ nguyên giỏ', async () => {
    // ⚠️⚠️ CHỖ HỞ THẬT, log 08:40 ngày 24/08/2026 ghi thẳng ra. xuatMotHoaDon()
    // cố ý KHÔNG dọn ở nhánh KHÔNG RÕ — nhưng TẦNG GỌI nó (vòng chia rổ) lại
    // gọi donGioConSot() cho MỌI rổ hỏng, và dấu giỏ thì khớp vì máy vừa tự tay
    // bỏ hàng vào. Quy tắc viết ở một nơi, bị phá ở nơi khác.
    //
    // Hậu quả không nhỏ: máy bảo "Hãy mở Tendoo kiểm tra tận mắt" rồi tự tay
    // xóa đúng thứ cần nhìn — mà GIỎ TRỐNG CHÍNH LÀ DẤU HIỆU CỦA MỘT LẦN PHÁT
    // HÀNH TRÓT LỌT. Vừa xóa bằng chứng, vừa làm thất bại trông y như thành công.
    const { trang, kq } = await chayLenh({ giuGioSauXacNhan: true });
    assert.strictEqual(kq.ma, BamThanhToan.MA.KHONG_RO, 'thông báo: ' + kq.thongBao);
    assert.ok(trang.xemGio().length > 0,
        '⛔⛔ ĐÃ DỌN GIỎ ở nhánh KHÔNG RÕ — xóa mất tang chứng người dùng cần nhìn');
    assert.ok(!/Đã tự dọn/.test(kq.thongBao),
        'khoe đã dọn trong khi tuyệt đối không được dọn: ' + kq.thongBao);
});

test('⛔⛔ KHÔNG RÕ + dấu giỏ KHÔNG khớp → GIỮ NGUYÊN giỏ', async () => {
    // ⚠️ RANH GIỚI THẬT, và tôi đã hiểu sai nó lúc đầu. Dự án có HAI đường dọn:
    //
    //   · donGioConSot()  — chạy ở mọi lỗi, nhưng ĐỐI CHIẾU DẤU GIỎ trước. Dấu
    //     khớp thì dọn (kể cả ở nhánh KHÔNG RÕ), không khớp thì từ chối.
    //   · dọn NGAY trong xuatMotHoaDon() — thứ vừa thêm, KHÔNG cần dấu, vì máy
    //     vừa tự tay bỏ hàng vào nên biết chắc là của mình.
    //
    // Đường thứ hai MẠNH HƠN, nên CỐ Ý không dùng ở nhánh KHÔNG RÕ: chỗ ấy hóa
    // đơn có thể đã lên cơ quan thuế, và khi không chứng minh được giỏ là của
    // mình thì thà để nguyên cho người dùng nhìn tận mắt.
    const { trang, kq } = await chayLenh({ giuGioSauXacNhan: true }, {}, true);
    assert.strictEqual(kq.ma, BamThanhToan.MA.KHONG_RO, 'thông báo: ' + kq.thongBao);
    assert.ok(trang.xemGio().length > 0, '⛔ ĐÃ DỌN GIỎ dù không chứng minh được là của mình');
    assert.strictEqual(kq.ketQua.daDonGio, undefined, 'đường dọn NGAY đã chạy ở nhánh KHÔNG RÕ');
});

test('⭐⭐ LỖI THƯỜNG + dấu giỏ KHÔNG khớp → VẪN dọn được', async () => {
    // Đây mới là phần đường dọn NGAY thêm vào được: nó không cần dấu. Ngày
    // 22/08 chính chỗ này để lọt rổ 1.450.000 của khách "ki?n" ở lại trong giỏ,
    // rồi chặn mọi lượt sau.
    const { trang, kq } = await chayLenh({ tongBangXn: 111000 }, {}, true);
    assert.strictEqual(kq.ma, BamThanhToan.MA.BANG_SAI_TONG, 'thông báo: ' + kq.thongBao);
    assert.strictEqual(trang.xemGio().length, 0,
        '⛔ dấu giỏ lệch là bó tay — đúng cái đã làm kẹt vô thời hạn ngày 22/08');
    assert.strictEqual(kq.ketQua.daDonGio, true);
});

test('⛔⛔ mã KHÔNG RÕ phải KHỚP với hàng đợi', () => {
    // Hai nơi lệch nhau thì một bên dọn giỏ trong khi bên kia treo lệnh — mâu
    // thuẫn ngay giữa hai quyết định nguy hiểm nhất của cả dự án.
    assert.ok(HangDoi.KET_QUA_KHONG_RO.has(NhanLenh.MA_KHONG_RO),
        'nhanLenh và hangDoi hiểu khác nhau về "không rõ"');
    assert.strictEqual(NhanLenh.MA_KHONG_RO, BamThanhToan.MA.KHONG_RO);
});

ghiChu('— ⭐ Dọn KHÔNG ĐƯỢC thì phải KÊU LÊN —');

test('⭐⭐ không dọn được → nói thẳng, đừng im lặng để lượt sau chết', async () => {
    // Đây chính là cái vòng luẩn quẩn ngày 22/08: im lặng thì lượt sau chết vì
    // giỏ bẩn mà người đọc log không hiểu vì sao.
    const hang = HANG_MAU.map(h => ({ ...h, ton: 400 }));
    const trang = taoTrangPos({ hang, tongBangXn: 111000 });
    const boi = taoBoi(trang, hang);
    // Gỡ nút xóa dòng NGAY KHI dòng giỏ vừa được vẽ -> máy không dọn được.
    const boc = trang.tailieu.getElementById('cacDongGio');
    new trang.cuaSo.MutationObserver(() => {
        for (const n of [...boc.querySelectorAll('button.xoa')]) n.remove();
    }).observe(boc, { childList: true, subtree: true });
    const kq = await NhanLenh.xuLyMotLenh(lenh(hang[0].gia), boi);
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ketQua.daDonGio, false);
    assert.match(kq.thongBao, /KHÔNG dọn được giỏ/, kq.thongBao);
    assert.match(kq.thongBao, /Xóa sạch giỏ/, 'không chỉ đường sửa: ' + kq.thongBao);
});

test('⛔⛔ việc DỌN GIỎ ném lỗi cũng KHÔNG được kéo sập cả lượt', async () => {
    // ⚠️ Chốt try/catch quanh xoaSachGio() ban đầu KHÔNG gánh gì: không bài nào
    // bắt nó ném, nên gài lỗi bỏ đi mà vẫn xanh. Đây là bài chạm tới nó.
    //
    // Dọn giỏ là VIỆC DỌN DẸP. Nó nổ thì cùng lắm là giỏ bẩn — không được biến
    // thành một ngoại lệ nuốt mất cả mã lỗi thật lẫn kết quả đã tính.
    const hang = HANG_MAU.map(h => ({ ...h, ton: 400 }));
    const trang = taoTrangPos({ hang, tongBangXn: 111000 });
    const boi = taoBoi(trang, hang);
    boi.BoGio = { ...BoGio, xoaSachGio: async () => { throw new Error('vỡ khi dọn'); } };

    const kq = await NhanLenh.xuLyMotLenh(lenh(hang[0].gia), boi);
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ma, BamThanhToan.MA.BANG_SAI_TONG,
        'ngoại lệ lúc dọn đã nuốt mất mã lỗi thật: ' + kq.ma);
    assert.strictEqual(kq.ketQua.daDonGio, false);
    assert.match(kq.thongBao, /KHÔNG dọn được giỏ/, kq.thongBao);
});

ghiChu('— ⛔ Không đụng tới lối THÀNH CÔNG —');

test('⛔ phát hành xong thì KHÔNG dính chữ dọn giỏ', async () => {
    const { trang, kq } = await chayLenh();
    assert.strictEqual(kq.ok, true, 'thông báo: ' + JSON.stringify(kq));
    assert.strictEqual(trang.daBam.xacNhan, 1);
    assert.ok(!/Đã tự dọn/.test(String(kq.thongBao || '')), 'lối thành công bị dính chữ thừa');
});

test('⭐ dọn xong thì XOÁ LUÔN DẤU GIỎ — dấu cũ chỉ tổ nhận nhầm về sau', async () => {
    const { boi, kq } = await chayLenh({ tongBangXn: 111000 });
    assert.strictEqual(kq.ketQua.daDonGio, true);
    assert.strictEqual(boi.xemDauGio(), null, 'còn giữ dấu của một giỏ đã sạch');
});

// ────────────────────────────────────────────────────────────────────────────
ghiChu('— ⭐⭐ G. LỜI KHAI CỦA "DỌN GIỎ" KHÔNG ĐƯỢC VỨT —');

test('⭐⭐⭐ dọn không được → thông báo phải MANG THEO danh sách nút đã thấy', async () => {
    // ⚠️ Bản 2.22.0 đã cho xoaSachGio() kể ra mọi nút trong dòng giỏ. Nhưng
    // xuatMotHoaDon() chỉ đọc `don.ok` rồi NÉM `don.thongBao` đi — nên log 22:33
    // ngày 22/08/2026 chỉ còn trơ câu "KHÔNG dọn được giỏ", đúng lúc cần biết
    // giao diện Tendoo đổi ra sao nhất.
    const { kq } = await chayLenh({ tongBangXn: 111000,
                                    giaoDienMoi: true, kieuNutXoa: 'voDanh' });

    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ketQua.daDonGio, false);
    assert.match(kq.thongBao, /KHÔNG dọn được giỏ/, kq.thongBao);
    assert.match(kq.thongBao, /CÁC NÚT TRONG DÒNG/,
        '⛔ lời khai bị vứt — vẫn không biết nút xóa trông thế nào: ' + kq.thongBao);
    assert.match(kq.thongBao, /ant-btn/, 'không kể lớp CSS: ' + kq.thongBao);
});

ghiChu('— Phiên bản phải TĂNG mỗi lần sửa —');

// ⚠️ MỘT CHỖ DUY NHẤT giữ con số này. Bản trước để tiêu đề ghi "2.22.0" trong
// khi phép kiểm chỉ đòi ">= 2.21" — tiêu đề và phép kiểm nói hai đằng, và vòng
// gài lỗi "quên tăng phiên bản" vẫn XANH. Tiêu đề đọc thì tin được, chạy thì
// không chứng minh gì: đúng loại bài kiểm tệ nhất.
const BAN_TOI_THIEU = [2, 29];

test(`⭐ manifest lên ${BAN_TOI_THIEU.join('.')}.x — để người dùng biết mình chạy bản nào`, () => {
    // ⚠️ Ngày 22/08/2026 tôi vá BA đợt mà để nguyên 2.20.0, nên nhìn số phiên
    // bản cũng không biết bản nào đang chạy. Thiếu sót ấy làm việc chẩn bệnh
    // khó thêm một tầng vô ích.
    const fs = require('node:fs');
    const path = require('node:path');
    const m = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
    const [a, b] = String(m.version).split('.').map(Number);
    const [ta, tb] = BAN_TOI_THIEU;
    assert.ok(a > ta || (a === ta && b >= tb), 'phiên bản chưa tăng: ' + m.version);
});

chay('DỌN GIỎ NGAY KHI BẤM THANH TOÁN HỎNG');
