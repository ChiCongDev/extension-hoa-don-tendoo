'use strict';

// Test bộ nối API Tendoo thật. Không gọi mạng: `goiMang` được thay bằng hàm giả.
// Kiểm tra đúng địa chỉ, đúng cách xác thực, và mọi đường hỏng đều có lối thoát.

const assert = require('node:assert');
const { test, ghiChu, chay } = require('./chay');
const BoNoi = require('../tendoo/boNoi');
const DocSanPham = require('../tendoo/docSanPham');
const DanhTinh = require('../tendoo/danhTinh');

const TOKEN = 'token-gia-khong-phai-token-that';
const MA_CUA_HANG = '2c683a17-09ab-4655-8dbf-50ca8105373c';

/** Máy chủ giả ở mức HTTP: ghi lại từng lời gọi. */
function taoMang(traVe) {
    const daGoi = [];
    const goiMang = async (url, tuyChon) => {
        daGoi.push({ url, tuyChon });
        const kq = typeof traVe === 'function' ? await traVe(url, tuyChon) : traVe;
        if (kq instanceof Error) throw kq;
        return {
            ok: kq.trangThai ? kq.trangThai < 400 : true,
            status: kq.trangThai || 200,
            json: async () => {
                if (kq.jsonHong) throw new Error('Unexpected token');
                return kq.than;
            },
        };
    };
    return { daGoi, goiMang };
}

const dung = (mang, them = {}) => BoNoi.taoBoNoi({
    layToken: async () => TOKEN,
    layMaCuaHang: async () => MA_CUA_HANG,
    goiMang: mang.goiMang,
    ...them,
});

const THAN_SP = {
    success: true,
    data: [{
        id: 'sp-1', name: 'Áo khoác', product_code: 'SP0095', variant_mode: 'non_variant',
        business_id: MA_CUA_HANG, final_price: 990000, base_price: 990000,
        available_quantity: 22, is_out_of_stock: true, is_active: false, version: 2,
    }],
    meta: { total: 177, size: 200, page: 1, total_pages: 1 },
};

// ─── ĐỊA CHỈ & XÁC THỰC ─────────────────────────────────────────────────────
ghiChu('— Địa chỉ & xác thực —');

test('gọi ĐÚNG địa chỉ quan sát được trên phiên thật', async () => {
    const m = taoMang({ than: THAN_SP });
    await dung(m).goiTrangSanPham(1);
    const u = m.daGoi[0].url;
    assert.ok(u.startsWith('https://apiv3.tendoo.vn/product/v2/products?'), u);
});

test('dùng page_size=200 — lấy trọn kho trong MỘT lời gọi', async () => {
    const m = taoMang({ than: THAN_SP });
    await dung(m).goiTrangSanPham(1);
    assert.match(m.daGoi[0].url, /page_size=200/);
    assert.match(m.daGoi[0].url, /has_record_deleted=false/);
});

test('gửi kèm business_id để kho trả về chắc chắn đúng cửa hàng', async () => {
    const m = taoMang({ than: THAN_SP });
    await dung(m).goiTrangSanPham(1);
    assert.match(m.daGoi[0].url, new RegExp('business_id=' + MA_CUA_HANG));
});

test('gắn header Authorization: Bearer', async () => {
    const m = taoMang({ than: THAN_SP });
    await dung(m).goiTrangSanPham(1);
    assert.strictEqual(m.daGoi[0].tuyChon.headers.Authorization, 'Bearer ' + TOKEN);
});

test('KHÔNG có token → dừng ngay, không gọi mạng', async () => {
    const m = taoMang({ than: THAN_SP });
    const bn = BoNoi.taoBoNoi({ layToken: async () => null, goiMang: m.goiMang });
    await assert.rejects(() => bn.goiTrangSanPham(1), /chưa đăng nhập/i);
    assert.strictEqual(m.daGoi.length, 0, 'đã gọi mạng dù không có token');
});

test('địa chỉ phiên đăng nhập đúng như quan sát', async () => {
    const m = taoMang({ than: { success: true, data: {} } });
    await dung(m).layPhien();
    assert.strictEqual(m.daGoi[0].url, 'https://apiv3.tendoo.vn/user/v2/auth/info');
});

// ─── ĐƯỜNG HỎNG ─────────────────────────────────────────────────────────────
ghiChu('— Mọi đường hỏng đều có lối thoát —');

test('401/403 → HET_PHIEN, KHÔNG tự đăng nhập lại', async () => {
    for (const ma of [401, 403]) {
        const m = taoMang({ trangThai: ma, than: {} });
        await assert.rejects(() => dung(m).layPhien(), (e) => {
            assert.strictEqual(e.ma, 'HET_PHIEN');
            return true;
        });
        assert.strictEqual(m.daGoi.length, 1, 'đã tự thử lại — có thể nhảy nhầm tài khoản');
    }
});

test('500 → MAY_CHU_LOI, không trả kho rỗng', async () => {
    const m = taoMang({ trangThai: 500, than: {} });
    await assert.rejects(() => dung(m).goiTrangSanPham(1), (e) => e.ma === 'MAY_CHU_LOI');
});

test('success:false → coi là lỗi, kèm thông báo của Tendoo', async () => {
    const m = taoMang({ than: { success: false, error: { message: 'Không có quyền' } } });
    await assert.rejects(() => dung(m).layPhien(), /Không có quyền/);
});

test('phản hồi không phải JSON → PHAN_HOI_HONG', async () => {
    const m = taoMang({ jsonHong: true, than: null });
    await assert.rejects(() => dung(m).layPhien(), (e) => e.ma === 'PHAN_HOI_HONG');
});

test('mất mạng → MAT_MANG chứ không treo', async () => {
    const m = taoMang(new Error('getaddrinfo ENOTFOUND'));
    await assert.rejects(() => dung(m).layPhien(), (e) => e.ma === 'MAT_MANG');
});

test('⭐⭐ HẠN CHỜ MẶC ĐỊNH là 60 GIÂY — chủ dự án chốt 25/08/2026', () => {
    // ⚠️ Lượt 10:05 ngày 25/08/2026 hỏng với «Tendoo không trả lời trong 20s»
    // ngay ở bước đọc tài khoản đang đăng nhập. Ảnh chụp lúc ấy cho thấy trang
    // POS CÒN ĐANG TẢI — Tendoo chậm thật, máy không hỏng.
    //
    // Chốt con số này lại vì nó KHÔNG có gì trên màn hình canh giữ: hạ về 20s
    // thì mọi bài kiểm khác vẫn xanh (chúng đều tự truyền hạn riêng cho nhanh),
    // và lỗi chỉ lộ ra ngoài đời, đúng lúc không ai ngồi xem.
    assert.strictEqual(BoNoi.HAN_CHO_MS, 60000,
        'hạn chờ mặc định không phải 60s: ' + BoNoi.HAN_CHO_MS);
});

test('⭐ câu báo lỗi phải ĐỌC TỪ hằng số, không chép tay con số vào chữ', () => {
    // Chép tay thì đổi hằng số xong câu chữ nói dối: hạn 60s mà vẫn ghi "20s",
    // và người đọc log đi tìm nhầm bệnh.
    const m = taoMang((url, tuyChon) => new Promise((_, tuChoi) => {
        tuyChon.signal.addEventListener('abort', () => {
            const e = new Error('aborted'); e.name = 'AbortError'; tuChoi(e);
        });
    }));
    return assert.rejects(
        () => dung(m, { hanChoMs: 7000 }).layPhien(),
        (e) => e.ma === 'QUA_HAN_CHO' && /trong 7s/.test(e.message));
});

test('RANH GIỚI 5: có hạn chờ, Tendoo im lặng thì bỏ chứ không đợi mãi', async () => {
    const m = taoMang((url, tuyChon) => new Promise((_, tuChoi) => {
        tuyChon.signal.addEventListener('abort', () => {
            const e = new Error('aborted'); e.name = 'AbortError'; tuChoi(e);
        });
    }));
    const bn = dung(m, { hanChoMs: 150 });
    const batDau = Date.now();
    await assert.rejects(() => bn.layPhien(), (e) => e.ma === 'QUA_HAN_CHO');
    assert.ok(Date.now() - batDau < 3000, 'không bỏ cuộc đúng hạn');
});

test('hạn mức hóa đơn lỗi thì trả null, KHÔNG làm hỏng cả luồng', async () => {
    const m = taoMang({ trangThai: 500, than: {} });
    assert.strictEqual(await dung(m).layHanMucHoaDon(), null);
});

// ─── NỐI VỚI BỘ CHUẨN HÓA ───────────────────────────────────────────────────
ghiChu('— Nối với bộ chuẩn hóa (Ranh giới 4) —');

test('JSON thô đi qua docSanPham ra hàng sạch, giữ nguyên bẫy tồn kho', async () => {
    const m = taoMang({ than: THAN_SP });
    const bn = dung(m);
    const kq = await DocSanPham.layTatCa((t) => bn.goiTrangSanPham(t));
    assert.strictEqual(kq.hang.length, 1);
    assert.strictEqual(kq.hang[0].gia, 990000);
    assert.strictEqual(kq.hang[0].ton, 22, 'is_out_of_stock=true đã loại nhầm hàng');
    assert.strictEqual(kq.maCuaHang, MA_CUA_HANG);
    assert.strictEqual(kq.tongTheoMayChu, 177);
});

test('lấy trọn 177 sản phẩm trong ĐÚNG MỘT lời gọi', async () => {
    const m = taoMang({ than: { ...THAN_SP, meta: { total: 177, size: 200, page: 1, total_pages: 1 } } });
    const bn = dung(m);
    await DocSanPham.layTatCa((t) => bn.goiTrangSanPham(t));
    assert.strictEqual(m.daGoi.length, 1, 'vẫn lật nhiều trang dù page_size=200');
});

test('máy chủ phớt lờ page_size → vẫn lật đủ số trang nó báo', async () => {
    const m = taoMang((url) => {
        const trang = Number(new URL(url).searchParams.get('page'));
        return { than: { ...THAN_SP, data: THAN_SP.data.map(d => ({ ...d, id: 'sp-' + trang })),
                         meta: { total: 30, size: 10, page: trang, total_pages: 3 } } };
    });
    const bn = dung(m);
    const kq = await DocSanPham.layTatCa((t) => bn.goiTrangSanPham(t));
    assert.strictEqual(m.daGoi.length, 3);
    assert.strictEqual(kq.hang.length, 3);
});

test('phiên thô đi qua danhTinh ra mã cửa hàng dùng cho chốt chặn', async () => {
    const m = taoMang({ than: { success: true, data: {
        account: { display_name: 'CH THUỲ DƯƠNG', max_store_count: 1 },
        business_info: { current_store: { id: MA_CUA_HANG, store_name: '+84...' },
                         current_role: { role_name: 'Chủ cửa hàng' } },
    } } });
    const dt = DanhTinh.doc(await dung(m).layPhien());
    assert.strictEqual(dt.maCuaHang, MA_CUA_HANG);
    assert.strictEqual(DanhTinh.doiChieu(dt, MA_CUA_HANG).khop, true);
});

// ─── TÍNH TỔNG THEO TENDOO ──────────────────────────────────────────────────
ghiChu('— Tính tổng theo Tendoo (cửa chặn 2) —');

test('gửi đúng hình dạng list_order_item đã quan sát', async () => {
    const m = taoMang({ than: { success: true, data: { calculate_id: 'x' } } });
    await dung(m).tinhTongTheoTendoo([{ id: 'sp-1', gia: 990000, soLuong: 2 }]);
    const g = m.daGoi[0];
    assert.strictEqual(g.tuyChon.method, 'POST');
    assert.strictEqual(g.url, 'https://apiv3.tendoo.vn/pricing/api/v2/calculate-order');
    const than = JSON.parse(g.tuyChon.body);
    assert.strictEqual(than.business_id, MA_CUA_HANG);
    assert.strictEqual(than.list_order_item.length, 1);
    assert.strictEqual(than.list_order_item[0].product_id, 'sp-1');
    assert.strictEqual(than.list_order_item[0].quantity, 2);
    assert.strictEqual(than.list_order_item[0].price, 990000);
    assert.ok(than.list_order_item[0].lineId.startsWith('sp-1-'));
});

// ─── ĐỌC TOKEN TỪ TRANG ─────────────────────────────────────────────────────
ghiChu('— Đọc token từ Local Storage của trang Tendoo —');

const cuaSoGia = (duLieu) => ({ localStorage: { getItem: (k) => (k in duLieu ? duLieu[k] : null) } });

test('đọc đúng khóa @access_token và @business_id', async () => {
    const d = BoNoi.taoDocKhoTrang(cuaSoGia({
        '@access_token': 'abc123', '@business_id': MA_CUA_HANG,
    }));
    assert.strictEqual(await d.layToken(), 'abc123');
    assert.strictEqual(await d.layMaCuaHang(), MA_CUA_HANG);
});

test('khóa được lưu dạng JSON có nháy bao ngoài vẫn đọc ra chuỗi sạch', async () => {
    const d = BoNoi.taoDocKhoTrang(cuaSoGia({ '@access_token': '"abc123"' }));
    assert.strictEqual(await d.layToken(), 'abc123');
});

test('chưa đăng nhập (không có khóa) → trả null, không nổ', async () => {
    const d = BoNoi.taoDocKhoTrang(cuaSoGia({}));
    assert.strictEqual(await d.layToken(), null);
    const d2 = BoNoi.taoDocKhoTrang(null);
    assert.strictEqual(await d2.layToken(), null);
});

chay('BỘ NỐI API TENDOO THẬT');
