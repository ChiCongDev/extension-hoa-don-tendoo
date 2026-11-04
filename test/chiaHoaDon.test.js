'use strict';

// ===========================================================================
//  TEST CHIA HÓA ĐƠN — ghép MỘT LẦN cho cả doanh thu, rồi chia thành nhiều rổ.
//  Chạy: node test/chiaHoaDon.test.js   (cần biến HDT_JSDOM)
//
//  ⚠️ VIẾT LẠI 2026-08-18 (lần hai). Bản trước cắt từng khúc ≤ trần rồi ghép
//  riêng từng khúc — sáu lần ghép là sáu cơ hội hỏng, và khúc cuối ôm phần lẻ
//  rất dễ không ghép nổi. Nay ghép một lần rồi chia rổ: chia rổ là phép cộng,
//  không có gì để hỏng.
//
//  Trọng tâm — sáu thứ hỏng thì đau nhất:
//    1. TỔNG CÁC RỔ phải bằng ĐÚNG số đã ghép. Lệch một đồng là sổ sách sai.
//    2. ĐỘ LỆCH phải bằng mức TỐT NHẤT đạt được — không đánh đổi lấy đa dạng.
//    3. KHÔNG RỔ NÀO vượt trần.
//    4. LẬP KHÔNG ĐƯỢC thì KHÔNG xuất tờ nào, và không kéo đổ khách sau.
//    5. HỎNG GIỮA CHỪNG thì ghi đúng số đã xuất VÀ tự dọn giỏ.
//    6. TẮT TRẦN thì chạy y hệt bản một hóa đơn.
// ===========================================================================

const assert = require('node:assert');
const { test, ghiChu, chay } = require('./chay');
require('./hanChoNganChoTest');   // hạn chờ ngắn cho test — xem file đó
require('../chung/domReact');
const BoGio = require('../tendoo/boGio');
globalThis.HDT_BoGio = BoGio;
const BamThanhToan = require('../tendoo/bamThanhToan');
const NhanLenh = require('../tendoo/nhanLenh');
const DanhTinh = require('../tendoo/danhTinh');
const DocSanPham = require('../tendoo/docSanPham');
const GhepTien = require('../chung/ghepTien');
const ChiaHoaDon = require('../chung/chiaHoaDon');
const CaiDat = require('../chung/caiDat');
const DayVeSell = require('../chung/dayVeSell');
const SoGhiDau = require('../chung/soGhiDau');
const HangDoi = require('../chung/hangDoi');
const { taoTrangPos, HANG_MAU } = require('./trangPosGiaLap');

const CH = '2c683a17-09ab-4655-8dbf-50ca8105373c';

// ⚠️ BẢNG GIÁ THẬT, chép từ ảnh chụp màn hình Tendoo của chủ dự án ngày
// 2026-08-18. Dùng số thật thì mới biết cách chia có chạy được với hàng hóa
// người ta đang bán hay không — bảng mẫu tự nghĩ ra rất dễ đẹp một cách giả tạo.
const KHO_THAT = [
    ['SP0399', 'Áo gió túi cuộn thông minh nam', 850000, 9],
    ['SP0453', 'Áo Croptop rút dây nữ', 890000, 14],
    ['SP0385', 'Chân váy dài ôm body nữ', 790000, 15],
    ['SP0452', 'Quần Short Kaki nam', 550000, 14],
    ['SP0446', 'Set nỉ gân Thu Đông nam', 850000, 10],
    ['SP0500', 'Quần Cargo túi hộp nam', 890000, 15],
    ['SP0495', 'Set áo Hoodie quần Jogger nữ', 790000, 1],
    ['SP0387', 'Giày Slip-on vải canvas nữ', 1000000, 8],
    ['SP0504', 'Set váy áo công sở nữ', 990000, 14],
    ['SP0357', 'Áo Ba lỗ tập gym nữ', 690000, 10],
    ['SP0450', 'Quần lửng qua gối nam', 890000, 10],
    ['SP0447', 'Áo len cổ tim Thu Đông nữ', 550000, 20],
].map(([ma, ten, gia, ton]) => ({ ma, ten, gia, ton }));

const congRo = (k) => k.ro.reduce((t, r) => t + r.tong, 0);

// ════════════════════════════════════════════════════════════════════════════
//  PHẦN A — BỘ LẬP KẾ HOẠCH (thuần tính toán, không đụng Tendoo)
// ════════════════════════════════════════════════════════════════════════════

ghiChu('— ⭐ Tổng các rổ phải bằng ĐÚNG số đã ghép —');

test('⭐ mọi mức doanh thu: cộng rổ lại = số đã ghép, không lệch một đồng', () => {
    for (const so of [11676756, 9361884, 24816414, 2060604, 1717170, 3456789, 999999]) {
        const k = ChiaHoaDon.lapKeHoach({ sanPham: KHO_THAT, soTien: so, tran: 2000000, dungSai: 200000 });
        assert.strictEqual(k.ma, 'OK', so + ': ' + k.thongBao);
        assert.strictEqual(congRo(k), k.tong, so + ': cộng rổ ra ' + congRo(k) + ' mà ghép là ' + k.tong);
    }
});

test('⭐ độ lệch cả loạt KHÔNG QUÁ dung sai — chỉ MỘT lần, không cộng dồn', () => {
    for (const so of [11676756, 9361884, 24816414, 2060604]) {
        const k = ChiaHoaDon.lapKeHoach({ sanPham: KHO_THAT, soTien: so, tran: 2000000, dungSai: 200000 });
        assert.ok(Math.abs(k.lech) <= 200000, so + ' lệch ' + k.lech + ' qua ' + k.soRo + ' rổ');
    }
});

test('⭐⭐ ĐỘ LỆCH phải bằng mức TỐT NHẤT — không đánh đổi lấy đa dạng', () => {
    // Bẫy đã đo được thật: lấy mức trần số lượng ĐẦU TIÊN chạy được thì
    // 9.361.884 lệch -181.884 (trong dung sai, nhưng tệ gần 100 lần mức cần).
    // Phải so với chính kết quả chạy KHÔNG hạn chế.
    for (const so of [11676756, 9361884, 24816414, 2060604, 1717170]) {
        const goc = GhepTien.ghepSanPham({ sanPham: KHO_THAT, soTien: so, dungSai: 200000 });
        assert.strictEqual(goc.ma, 'OK', String(so));
        const k = ChiaHoaDon.lapKeHoach({ sanPham: KHO_THAT, soTien: so, tran: 2000000, dungSai: 200000 });
        assert.strictEqual(Math.abs(k.lech), Math.abs(goc.lech),
            so + ': chia rổ lệch ' + k.lech + ' trong khi ghép thẳng chỉ lệch ' + goc.lech);
    }
});

ghiChu('— ⭐ Không rổ nào vượt trần —');

test('⭐ mọi rổ đều ≤ trần', () => {
    for (const so of [11676756, 24816414, 3456789]) {
        for (const tran of [2000000, 1500000, 1000000, 3000000]) {
            const k = ChiaHoaDon.lapKeHoach({ sanPham: KHO_THAT, soTien: so, tran, dungSai: 200000 });
            if (k.ma !== 'OK') continue;
            for (const r of k.ro) {
                assert.ok(r.tong <= tran, so + '/' + tran + ': có rổ ' + r.tong);
            }
        }
    }
});

test('⭐ trần NHỎ HƠN món rẻ nhất → từ chối rõ ràng, không trả rổ rỗng', () => {
    const k = ChiaHoaDon.lapKeHoach({ sanPham: KHO_THAT, soTien: 5000000, tran: 100000, dungSai: 200000 });
    assert.strictEqual(k.ma, 'HANG_DAT_HON_TRAN');
    assert.match(k.thongBao, /nâng trần/);
});

test('món đắt hơn trần bị LOẠI TRƯỚC khi ghép, không lọt vào rổ', () => {
    const kho = [...KHO_THAT, { ma: 'TO', ten: 'Hàng rất đắt', gia: 9000000, ton: 5 }];
    const k = ChiaHoaDon.lapKeHoach({ sanPham: kho, soTien: 11676756, tran: 2000000, dungSai: 200000 });
    assert.strictEqual(k.ma, 'OK');
    for (const r of k.ro) {
        assert.ok(!r.chon.some((d) => d.ma === 'TO'), 'hàng 9 triệu lọt vào rổ ≤ 2 triệu');
    }
});

ghiChu('— ⭐⭐ TỒN KHO: kế hoạch đọc kho MỘT LẦN, nhưng xuất nhiều tờ —');

// ⚠️ ĐÂY LÀ BẤT BIẾN QUYẾT ĐỊNH. Bản trước đọc lại kho trước MỖI tờ; nay đọc
// một lần rồi xuất N tờ, mà mỗi tờ ăn vào kho thật của Tendoo. Nếu kế hoạch
// dùng nhiều hơn tồn kho thì tờ thứ k sẽ chết giữa chừng với "chỉ còn X nhưng
// cần Y" — đúng loại hỏng mà cả thay đổi này sinh ra để dẹp.
//
// Trang giả lập KHÔNG trừ tồn kho nên không dò được bằng cách chạy thật; khoá
// thẳng vào bất biến mới là cách chắc chắn.
function tongDungTheoMa(k) {
    const m = new Map();
    for (const r of k.ro) {
        for (const d of r.chon) m.set(d.ma, (m.get(d.ma) || 0) + d.soLuong);
    }
    return m;
}

test('⭐⭐ TỔNG số lượng dùng của mỗi mặt hàng KHÔNG vượt tồn kho', () => {
    for (const so of [11676756, 9361884, 24816414, 39000000]) {
        const k = ChiaHoaDon.lapKeHoach({ sanPham: KHO_THAT, soTien: so, tran: 2000000, dungSai: 200000 });
        if (k.ma !== 'OK') continue;
        for (const [ma, dung] of tongDungTheoMa(k)) {
            const ton = KHO_THAT.find((h) => h.ma === ma).ton;
            assert.ok(dung <= ton, so + ': dùng ' + dung + ' cái "' + ma + '" mà kho chỉ có ' + ton);
        }
    }
});

test('⭐⭐ kho ÍT HÀNG: vẫn không mặt hàng nào bị dùng quá tồn', () => {
    // Kho eo hẹp là lúc dễ vượt nhất — thuật toán dàn đều càng phải dàn rộng.
    const kho = KHO_THAT.map((h) => ({ ...h, ton: 3 }));
    const k = ChiaHoaDon.lapKeHoach({ sanPham: kho, soTien: 11676756, tran: 2000000, dungSai: 200000 });
    if (k.ma === 'OK') {
        for (const [ma, dung] of tongDungTheoMa(k)) {
            assert.ok(dung <= 3, 'dùng ' + dung + ' cái "' + ma + '" mà kho chỉ có 3');
        }
    }
});

test('⭐ KHÔNG rổ nào cần nhiều hơn tồn kho của một mặt hàng', () => {
    const k = ChiaHoaDon.lapKeHoach({ sanPham: KHO_THAT, soTien: 24816414, tran: 2000000, dungSai: 200000 });
    for (const r of k.ro) {
        for (const d of r.chon) {
            const ton = KHO_THAT.find((h) => h.ma === d.ma).ton;
            assert.ok(d.soLuong <= ton, 'một rổ cần ' + d.soLuong + ' cái "' + d.ma + '", kho có ' + ton);
        }
    }
});

test('⭐ tồn kho 1 cái thì cả loạt chỉ được dùng đúng 1', () => {
    // SP0495 tồn đúng 1 trong bảng thật — ca biên tự nhiên, không phải bịa.
    const k = ChiaHoaDon.lapKeHoach({ sanPham: KHO_THAT, soTien: 24816414, tran: 2000000, dungSai: 200000 });
    const dung = tongDungTheoMa(k).get('SP0495') || 0;
    assert.ok(dung <= 1, 'dùng ' + dung + ' cái SP0495 mà kho chỉ có 1');
});

ghiChu('— ⭐ Các rổ khác nhau —');

test('⭐ 11.676.756 → MỌI rổ đều khác tổ hợp nhau', () => {
    const k = ChiaHoaDon.lapKeHoach({ sanPham: KHO_THAT, soTien: 11676756, tran: 2000000, dungSai: 200000 });
    assert.strictEqual(k.soToHopKhacNhau, k.soRo, k.soToHopKhacNhau + '/' + k.soRo + ' rổ khác nhau');
});

test('⭐ nhiều mức doanh thu đều ra rổ khác nhau hết', () => {
    for (const so of [11676756, 9361884, 24816414]) {
        const k = ChiaHoaDon.lapKeHoach({ sanPham: KHO_THAT, soTien: so, tran: 2000000, dungSai: 200000 });
        assert.strictEqual(k.soToHopKhacNhau, k.soRo, so + ': ' + k.soToHopKhacNhau + '/' + k.soRo);
    }
});

test('⭐ hai rổ CÙNG mặt hàng nhưng KHÁC SỐ LƯỢNG là KHÁC NHAU', () => {
    // Chủ dự án chốt: trùng = giống hệt CẢ mặt hàng LẪN số lượng. Không có ca
    // này thì cách đếm chỉ nhìn mã hàng vẫn xanh — gài lỗi vào lọt lưới thật.
    const kho = [{ ma: 'A', ten: 'Một loại', gia: 500000, ton: 100 }];
    const k = ChiaHoaDon.lapKeHoach({ sanPham: kho, soTien: 2500000, tran: 2000000, dungSai: 200000 });
    assert.strictEqual(k.ma, 'OK');
    assert.strictEqual(k.soRo, 2, 'ra ' + k.soRo + ' rổ');
    const sl = k.ro.map((r) => r.chon[0].soLuong).sort();
    assert.notDeepStrictEqual(sl[0], sl[1], 'hai rổ lại cùng số lượng');
    assert.strictEqual(k.soToHopKhacNhau, 2,
        'hai rổ cùng mặt hàng khác số lượng phải tính là 2 tổ hợp, đang tính '
        + k.soToHopKhacNhau);
});

test('kho CHỈ CÓ MỘT mặt hàng → đành chịu trùng, nhưng vẫn chia được', () => {
    // "Chỉ trùng khi không còn cách nào khác" — đây đúng là ca không còn cách.
    const kho = [{ ma: 'A', ten: 'Một loại duy nhất', gia: 500000, ton: 100 }];
    const k = ChiaHoaDon.lapKeHoach({ sanPham: kho, soTien: 6000000, tran: 2000000, dungSai: 200000 });
    assert.strictEqual(k.ma, 'OK');
    assert.strictEqual(congRo(k), k.tong);
    for (const r of k.ro) assert.ok(r.tong <= 2000000);
});

test('tắt ưu tiên khác nhau → vẫn đúng tổng, chỉ ít tổ hợp hơn', () => {
    const bat = ChiaHoaDon.lapKeHoach({ sanPham: KHO_THAT, soTien: 11676756, tran: 2000000,
                                        dungSai: 200000, uuTienKhacNhau: true });
    const tat = ChiaHoaDon.lapKeHoach({ sanPham: KHO_THAT, soTien: 11676756, tran: 2000000,
                                        dungSai: 200000, uuTienKhacNhau: false });
    assert.strictEqual(congRo(tat), tat.tong);
    assert.strictEqual(Math.abs(tat.lech), Math.abs(bat.lech), 'tắt đa dạng mà độ lệch lại đổi');
    assert.ok(tat.soToHopKhacNhau <= bat.soToHopKhacNhau);
});

ghiChu('— Tắt trần: một rổ duy nhất —');

test('⭐ trần 0 → ĐÚNG MỘT rổ, y hệt ghép thẳng', () => {
    const k = ChiaHoaDon.lapKeHoach({ sanPham: KHO_THAT, soTien: 11676756, tran: 0, dungSai: 200000 });
    assert.strictEqual(k.ma, 'OK');
    assert.strictEqual(k.soRo, 1);
    const goc = GhepTien.ghepSanPham({ sanPham: KHO_THAT, soTien: 11676756, dungSai: 200000 });
    assert.strictEqual(k.tong, goc.tong);
    assert.strictEqual(k.lech, goc.lech);
});

test('doanh thu NHỎ HƠN trần → một rổ', () => {
    const k = ChiaHoaDon.lapKeHoach({ sanPham: KHO_THAT, soTien: 1500000, tran: 2000000, dungSai: 200000 });
    assert.strictEqual(k.soRo, 1);
});

ghiChu('— Đầu vào rác —');

test('số tiền ≤ 0 hoặc không phải số → từ chối, không nổ', () => {
    for (const so of [0, -5, NaN, null, undefined, 'abc']) {
        const k = ChiaHoaDon.lapKeHoach({ sanPham: KHO_THAT, soTien: so, tran: 2000000 });
        assert.notStrictEqual(k.ma, 'OK', String(so) + ' lại lập được kế hoạch');
    }
});

test('kho rỗng → từ chối, không nổ', () => {
    const k = ChiaHoaDon.lapKeHoach({ sanPham: [], soTien: 5000000, tran: 2000000 });
    assert.notStrictEqual(k.ma, 'OK');
});

test('kho không đủ hàng → chuyển NGUYÊN lỗi của hàm ghép lên', () => {
    const kho = [{ ma: 'A', ten: 'A', gia: 500000, ton: 1 }];
    const k = ChiaHoaDon.lapKeHoach({ sanPham: kho, soTien: 50000000, tran: 2000000, dungSai: 200000 });
    assert.strictEqual(k.ma, 'KHONG_DU_HANG');
});

// ════════════════════════════════════════════════════════════════════════════
//  PHẦN B — CHẠY THẬT QUA TRANG POS GIẢ LẬP
// ════════════════════════════════════════════════════════════════════════════

const KHO_ROI_RAO = HANG_MAU.map((h) => ({ ...h, ton: 400 }));

function boNoiGia(hang, maCuaHang = CH) {
    return {
        async layPhien() {
            return { success: true, data: {
                account: { display_name: 'CH THUỲ DƯƠNG', max_store_count: 1 },
                business_info: { current_store: { id: maCuaHang, store_name: 'CH THUỲ DƯƠNG' },
                                 current_role: { role_name: 'Chủ cửa hàng' } } } };
        },
        async goiTrangSanPham(trang) {
            return { success: true,
                data: hang.map((h, i) => ({
                    id: 'sp-' + i, name: h.ten, product_code: 'SP' + i,
                    variant_mode: 'non_variant', business_id: maCuaHang,
                    base_price: h.gia, final_price: h.gia,
                    available_quantity: h.ton, is_out_of_stock: true, version: 2 })),
                meta: { total: hang.length, size: 200, page: trang, total_pages: 1 } };
        },
    };
}

function dung({ tran = 2000000, gioBanDau = [], hang = KHO_ROI_RAO, tuBam = true,
                dungSai = 200000, hongTuTo = 0, giuGioSauXacNhan = false,
                khoCuaHangKhac = false, tongTreMs = 0, tongBangXn = null } = {}) {
    const trang = taoTrangPos({ hang, gioBanDau, giuGioSauXacNhan, tongTreMs, tongBangXn });
    const dem = { bo: 0 };
    let dauGio = null;                     // dấu giỏ, giữ như kho thật

    // Bọc bước BẤM THANH TOÁN để mô phỏng "tờ thứ k hỏng". Chọn bước này chứ
    // không phải bước bỏ giỏ, vì đây mới là cảnh giỏ ĐÃ ĐẦY ĐỦ và dấu giỏ ĐÃ
    // GHI ĐÚNG — tức là cảnh mà việc tự dọn giỏ có ý nghĩa. Hỏng ngay ở bước bỏ
    // giỏ thì giỏ dở dang, dấu không khớp, và máy CỐ Ý không dọn (xem phép kiểm
    // "giỏ dở dang" bên dưới).
    const BamBoc = tuBam ? {
        ...BamThanhToan,
        taoLuot() {
            const that = BamThanhToan.taoLuot();
            return {
                ...that,
                async bam(td, tc) {
                    dem.bo++;
                    if (hongTuTo && dem.bo >= hongTuTo) {
                        return { ok: false, ma: 'KHONG_HIEN_BANG',
                                 thongBao: 'Bảng xác nhận không hiện ra.' };
                    }
                    return that.bam(td, tc);
                },
            };
        },
    } : null;

    const boi = {
        tailieu: trang.tailieu,
        DanhTinh, DocSanPham, BoGio, ChiaHoaDon,
        DauGio: require('../chung/dauGio'),
        BamThanhToan: BamBoc,
        taoBoNoi: () => (khoCuaHangKhac
            ? { ...boNoiGia(hang, 'cua-hang-khac-9999'), layPhien: boNoiGia(hang, CH).layPhien }
            : boNoiGia(hang)),
        docCaiDat: async () => ({ tuBam, daHieu: tuBam, docDuoc: true,
                                  dungSai, tranMoiHoaDon: tran }),
        docKhoTaiKhoan: async () => ({ khach: {
            PA: { maCuaHang: CH, tenDangNhap: 'x', matKhauMaHoa: { iv: 'a', duLieu: 'b' } } } }),
        // ⚠️ DẤU GIỎ PHẢI LƯU THẬT. donGioConSot chỉ dọn thứ nó NHẬN RA là của
        // chính máy — không có dấu thì nó từ chối dọn, đúng như thiết kế. Stub
        // rỗng làm phép kiểm "tự dọn giỏ" đỏ vì lý do sai (dữ liệu thử sai).
        // ⚠️ PHẢI DỰNG DẤU QUA DauGio.taoDau — y hệt bản thật (xem nhanLenh.js:
        // `ghiDauGio: (x) => luuDau.ghi(G.HDT_DauGio.taoDau(x))`). Lưu thô thì
        // khopVoiGio báo "chưa từng ghi dấu nào" và phép kiểm tự dọn giỏ đỏ vì
        // lý do sai — dữ liệu thử sai, không phải mã sai.
        ghiDauGio: async (d) => { dauGio = require('../chung/dauGio').taoDau(d); },
        docDauGio: async () => dauGio,
        xoaDauGio: async () => { dauGio = null; },
    };
    return { trang, boi, dem };
}

const lenh = (them = {}) => ({ maKH: 'PA', tenKH: 'Phương Anh', soTien: 11676756, ...them });

ghiChu('— ⭐ Xuất thật: đúng số tờ, đúng tổng —');

test('⭐ ra đúng số tờ mà kế hoạch đã hứa', async () => {
    const { trang, boi } = dung();
    const kq = await NhanLenh.xuLyMotLenh(lenh(), boi);
    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.strictEqual(kq.ketQua.soHoaDon, kq.ketQua.soHoaDonTheoKeHoach);
    assert.strictEqual(trang.daBam.thanhToan, kq.ketQua.soHoaDon);
});

test('⭐ tổng đã xuất = cộng lại từng tờ, và lệch ≤ dung sai', async () => {
    const { boi } = dung();
    const kq = await NhanLenh.xuLyMotLenh(lenh(), boi);
    const cong = kq.ketQua.cacHoaDon.reduce((t, x) => t + x.tong, 0);
    assert.strictEqual(kq.ketQua.tong, cong);
    assert.ok(Math.abs(kq.ketQua.tong - 11676756) <= 200000, 'lệch ' + kq.ketQua.lech);
});

test('⭐ mỗi tờ đều được Tendoo xác nhận đúng tổng', async () => {
    const { boi } = dung();
    const kq = await NhanLenh.xuLyMotLenh(lenh(), boi);
    for (const t of kq.ketQua.cacHoaDon) assert.strictEqual(t.tongTendoo, t.tong);
});

test('⭐ trần 0 → đúng một tờ, y hệt bản cũ', async () => {
    const { trang, boi } = dung({ tran: 0 });
    const kq = await NhanLenh.xuLyMotLenh(lenh(), boi);
    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.strictEqual(kq.ketQua.soHoaDon, 1);
    assert.strictEqual(trang.daBam.thanhToan, 1);
});

ghiChu('— ⭐ Lập không được: KHÔNG xuất tờ nào —');

test('⭐ kho không đủ → bỏ qua khách, chưa bấm Thanh toán lần nào', async () => {
    const { trang, boi } = dung({ hang: [{ ten: 'X', gia: 500000, ton: 1 }] });
    const kq = await NhanLenh.xuLyMotLenh(lenh({ soTien: 50000000 }), boi);
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(trang.daBam.thanhToan, 0, '❌ đã xuất hóa đơn rồi mới từ chối');
    assert.strictEqual(trang.xemGio().length, 0, '❌ đã bỏ hàng vào giỏ');
});

test('⭐ lập không được thì mang cờ chuaLamGi → hàng đợi không TREO oan', async () => {
    const { boi } = dung({ hang: [{ ten: 'X', gia: 500000, ton: 1 }] });
    const kq = await NhanLenh.xuLyMotLenh(lenh({ soTien: 50000000 }), boi);
    assert.strictEqual(kq.chuaLamGi, true);
});

test('⭐ quá 40 tờ → từ chối trước, không xuất gì', async () => {
    const { trang, boi } = dung();
    const kq = await NhanLenh.xuLyMotLenh(lenh({ soTien: 200000000 }), boi);
    assert.strictEqual(kq.ma, 'QUA_NHIEU_HOA_DON');
    assert.strictEqual(trang.daBam.thanhToan, 0);
    assert.match(kq.thongBao, /CHƯA xuất tờ nào/);
});

ghiChu('— ⭐⭐ Tờ hỏng giữa chừng: ghi đúng số VÀ dọn giỏ —');

test('⭐ hỏng ở tờ 3 → báo lỗi nhưng giữ đúng số đã xuất', async () => {
    const { boi } = dung({ hongTuTo: 3 });
    const kq = await NhanLenh.xuLyMotLenh(lenh(), boi);
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ketQua.soHoaDon, 2);
    const cong = kq.ketQua.cacHoaDon.reduce((t, x) => t + x.tong, 0);
    assert.strictEqual(kq.ketQua.tong, cong);
    assert.strictEqual(kq.ketQua.daBamThanhToan, true);
});

test('⭐⭐ tờ hỏng → TỰ DỌN GIỎ để khách sau không đổ theo', async () => {
    // Đây chính là chuỗi đổ đã xảy ra thật 18/08: c?ng hỏng một tờ để lại giỏ
    // bẩn, ki?n và ti?n chết theo vì "giỏ chưa trống".
    const { trang, boi } = dung({ hongTuTo: 3 });
    await NhanLenh.xuLyMotLenh(lenh(), boi);
    assert.strictEqual(trang.xemGio().length, 0,
        '❌ giỏ còn ' + trang.xemGio().length + ' món — khách sau sẽ bị chặn');
});

test('⭐⭐ khách sau VẪN CHẠY ĐƯỢC sau khi khách trước hỏng dở', async () => {
    const { trang, boi, dem } = dung({ hongTuTo: 3 });
    await NhanLenh.xuLyMotLenh(lenh({ conKhachPhiaSau: true }), boi);
    dem.bo = -1000;                       // khách sau: cho chạy trơn tru
    const kq2 = await NhanLenh.xuLyMotLenh(lenh({ soTien: 1717170 }), boi);
    assert.strictEqual(kq2.ok, true, 'khách sau bị chặn: ' + kq2.thongBao);
});

test('lời nhắc nói rõ đã ra mấy tờ và bao nhiêu tiền', async () => {
    const { boi } = dung({ hongTuTo: 3 });
    const kq = await NhanLenh.xuLyMotLenh(lenh(), boi);
    assert.match(kq.thongBao, /Đã phát hành 2\//);
    const cong = kq.ketQua.cacHoaDon.reduce((t, x) => t + x.tong, 0);
    assert.ok(kq.thongBao.includes(cong.toLocaleString('vi-VN')), kq.thongBao);
});

ghiChu('— ⭐⭐ TRANG VẼ CHẬM: đúng lỗi ngày 18/08/2026 —');

// Ngày 18/08 máy báo «Tendoo hiện 1.250.000 nhưng mình tính 2.000.000» rồi dừng
// — nhưng NGAY SAU ĐÓ khách kế tiếp bị chặn vì "giỏ đang có 2 món (2.000.000đ)".
// Cùng một giỏ, hai con số: hàng đã vào đủ, chỉ là ĐỌC SỚM. Nguyên nhân: chỗ
// đọc tổng LẦN CUỐI trong boVaoGio ngủ cứng 100ms rồi đọc luôn — chỗ chờ cứng
// duy nhất còn sót, đúng thứ chung/nhipDo.js cấm hẳn.
//
// Dò THẲNG vào boVaoGio với MỘT món: cách ly đúng phép đọc cuối cùng đó.
test('⭐⭐ tổng vẽ chậm 300ms → boVaoGio vẫn trả về ĐÚNG tổng', async () => {
    const trang = taoTrangPos({ hang: HANG_MAU, tongTreMs: 300 });
    const mon = [{ ma: 'x', ten: HANG_MAU[0].ten, gia: HANG_MAU[0].gia, soLuong: 1 }];
    const r = await BoGio.boVaoGio(trang.tailieu, mon);
    assert.strictEqual(r.ok, true, r.thongBao);
    assert.strictEqual(r.tongTendoo, HANG_MAU[0].gia,
        'đọc ra ' + r.tongTendoo + ' trong khi giỏ có ' + HANG_MAU[0].gia);
});

test('⭐⭐ tổng vẽ chậm → nhiều món cùng loại vẫn ra đúng tổng', async () => {
    const trang = taoTrangPos({ hang: HANG_MAU, tongTreMs: 200 });
    const mon = [{ ma: 'x', ten: HANG_MAU[0].ten, gia: HANG_MAU[0].gia, soLuong: 3 }];
    const r = await BoGio.boVaoGio(trang.tailieu, mon);
    assert.strictEqual(r.ok, true, r.thongBao);
    assert.strictEqual(r.tongTendoo, HANG_MAU[0].gia * 3);
});

test('⭐ tổng KHÔNG BAO GIỜ đúng → báo lỗi rõ, KHÔNG trả số sai', async () => {
    // Chờ mãi mà tổng vẫn lệch thì phải nói thẳng, chứ không trả một con số
    // sai để cửa chặn phía sau kêu bằng câu khó hiểu.
    const trang = taoTrangPos({ hang: HANG_MAU, themGapDoi: true });
    const mon = [{ ma: 'x', ten: HANG_MAU[0].ten, gia: HANG_MAU[0].gia, soLuong: 1 }];
    const r = await BoGio.boVaoGio(trang.tailieu, mon);
    assert.strictEqual(r.ok, false);
});

ghiChu('— ⭐ Cửa chặn tài khoản và giỏ người dùng —');

test('⭐ kho thuộc cửa hàng KHÁC → dừng, không xuất tờ nào', async () => {
    const { trang, boi } = dung({ khoCuaHangKhac: true });
    const kq = await NhanLenh.xuLyMotLenh(lenh(), boi);
    assert.strictEqual(kq.ma, 'SAI_TAI_KHOAN');
    assert.strictEqual(trang.daBam.thanhToan, 0);
});

test('⭐ giỏ đang có hàng NGƯỜI DÙNG bày → dừng, KHÔNG xóa', async () => {
    const { trang, boi } = dung({ gioBanDau: [{ ten: HANG_MAU[0].ten, gia: HANG_MAU[0].gia, soLuong: 2 }] });
    const truoc = trang.xemGio().length;
    const kq = await NhanLenh.xuLyMotLenh(lenh(), boi);
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(trang.xemGio().length, truoc, '❌ đã tự xóa giỏ của người dùng');
});

test('⭐ Tendoo giữ giỏ sau khi phát hành → DỪNG với KHONG_RO', async () => {
    const { boi } = dung({ giuGioSauXacNhan: true });
    const kq = await NhanLenh.xuLyMotLenh(lenh(), boi);
    assert.strictEqual(kq.ok, false);
    assert.match(String(kq.ma || ''), /KHONG_RO/);
});

// ════════════════════════════════════════════════════════════════════════════
//  PHẦN C — ĐI HẾT ĐƯỜNG: hàng đợi -> đẩy về Sell
// ════════════════════════════════════════════════════════════════════════════

ghiChu('— ⭐⭐ Nối hai đầu, không kiểm từng mảnh rời —');

// ⚠️ Kiểm dayVeSell riêng và hangDoi riêng thì CẢ HAI ĐỀU XANH mà đường nối
// giữa chúng đứt — đã dính đúng vậy 2026-08-18: hangDoi quên gửi `ketQua` nên
// tiền đã xuất biến mất khỏi mọi sổ, mà không phép kiểm nào đỏ.
async function chayQuaHangDoi(ketQuaTraVe) {
    let noiDung = null;
    const luuTru = {
        async doc() { return noiDung ? JSON.parse(JSON.stringify(noiDung)) : null; },
        async ghi(o) { noiDung = o ? JSON.parse(JSON.stringify(o)) : null; },
    };
    const so = SoGhiDau.taoSo(luuTru);
    await so.nap();
    let khoa = null;
    const hd = HangDoi.taoHangDoi({
        so, khoaLuuTru: { async doc() { return khoa; }, async ghi(o) { khoa = o; } },
        mayId: 'may-thu',
    });
    await hd.xepHang([{ maKH: 'PA', tenKH: 'Phương Anh', soTien: 11676756 }]);
    const tin = [];
    await hd.chayLoat(async () => ketQuaTraVe, (t) => tin.push(t));
    return tin;
}

const DA_RA_3_TO = { tong: 5940000, soHoaDon: 3, daBamThanhToan: true };

test('⭐⭐ lỗi thường sau 3 tờ → dòng gửi Sell mang đúng 5.940.000', async () => {
    const tin = await chayQuaHangDoi({ ok: false, ma: 'KHONG_DU_HANG',
                                       thongBao: 'hết hàng', ketQua: DA_RA_3_TO });
    const l = tin.find((x) => x.loai === 'loi');
    assert.ok(l && l.ketQua, '❌ tin lỗi KHÔNG mang theo ketQua');
    const d = DayVeSell.dongTuTienDo(l, '2026-08-18', Date.now());
    assert.strictEqual(d.so_tien, 5940000);
    assert.strictEqual(d.ket_qua, 'RA_HOA_DON');
});

test('⭐⭐ treo sau 3 tờ → dòng gửi Sell cũng mang đúng 5.940.000', async () => {
    const tin = await chayQuaHangDoi({ ok: false, ma: 'KHONG_RO',
                                       thongBao: 'không rõ', ketQua: DA_RA_3_TO });
    const t = tin.find((x) => x.loai === 'treo');
    assert.ok(t && t.ketQua, '❌ tin treo KHÔNG mang theo ketQua');
    const d = DayVeSell.dongTuTienDo(t, '2026-08-18', Date.now());
    assert.strictEqual(d.so_tien, 5940000);
    assert.strictEqual(d.ket_qua, 'RA_HOA_DON');
});

test('chưa ra tờ nào → vẫn là LOI / TREO thật', async () => {
    const a = await chayQuaHangDoi({ ok: false, ma: 'KHONG_DU_HANG', thongBao: 'hết hàng' });
    assert.strictEqual(DayVeSell.dongTuTienDo(a.find((x) => x.loai === 'loi'),
                                              '2026-08-18', Date.now()).ket_qua, 'LOI');
    const b = await chayQuaHangDoi({ ok: false, ma: 'KHONG_RO', thongBao: 'không rõ' });
    assert.strictEqual(DayVeSell.dongTuTienDo(b.find((x) => x.loai === 'treo'),
                                              '2026-08-18', Date.now()).ket_qua, 'TREO');
});

// ════════════════════════════════════════════════════════════════════════════
//  PHẦN D — CÀI ĐẶT
// ════════════════════════════════════════════════════════════════════════════

ghiChu('— Cài đặt trần mỗi hóa đơn —');

test('mặc định 2.000.000', () => {
    assert.strictEqual(CaiDat.MAC_DINH.tranMoiHoaDon, 2000000);
});

test('⭐ để TRỐNG = TẮT, không rơi về mặc định', () => {
    for (const v of ['', null, undefined, '-5', 'abc', 0]) {
        assert.strictEqual(CaiDat.chuanTranMoiHoaDon(v), 0, String(v));
    }
});

test('đọc được số có dấu chấm/phẩy', () => {
    assert.strictEqual(CaiDat.chuanTranMoiHoaDon('2.000.000'), 2000000);
    assert.strictEqual(CaiDat.chuanTranMoiHoaDon('2,000,000'), 2000000);
});

test('gop() và tuKho() đều chuẩn hóa trần', () => {
    assert.strictEqual(CaiDat.gop({ tranMoiHoaDon: 1500000 }, { dungSai: '3' }, null).tranMoiHoaDon, 1500000);
    assert.strictEqual(CaiDat.gop({}, { tranMoiHoaDon: '2.500.000' }, null).tranMoiHoaDon, 2500000);
    assert.strictEqual(CaiDat.tuKho({ tranMoiHoaDon: 'rác' }, true).tranMoiHoaDon, 0);
});

chay('CHIA HÓA ĐƠN — ghép một lần, chia nhiều rổ');
