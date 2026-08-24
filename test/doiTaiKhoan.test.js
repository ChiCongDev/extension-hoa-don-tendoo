'use strict';

// Test ĐỔI TÀI KHOẢN TENDOO + KHO PHIÊN giữ mật khẩu đã giải mã.
// Không cần Chrome: mọi thứ thuộc trình duyệt đều được thay bằng hàm giả.
//
// Câu hỏi cả file trả lời: "có bao giờ máy tưởng đã đổi tài khoản trong khi
// thực tế chưa đổi không?" — phải luôn là KHÔNG.

const assert = require('node:assert');
const { JSDOM } = require(process.env.HDT_JSDOM || 'jsdom');
const { test, ghiChu, chay } = require('./chay');
const DoiTK = require('../chung/doiTaiKhoan');

const { MA } = DoiTK;
const CH_PA = '2c683a17-09ab-4655-8dbf-50ca8105373c';
const CH_TB = '9f1c0b22-1111-2222-3333-444455556666';
const MK_GIA = 'MatKhauGia!123';

const tkPA = { maKH: 'PA', tenDangNhap: '0344168490', matKhau: MK_GIA, maCuaHangMongDoi: CH_PA };

/**
 * Trình duyệt giả: giữ url của tab, mô phỏng "xóa token thì bị đẩy sang trang
 * đăng nhập", "đăng nhập xong thì quay lại POS".
 */
function trinhDuyetGia({ maCuaHangSauKhiVao = CH_PA, hong = null,
                         rongMayLanDau = 0, nemMayLanDau = 0,
                         canTaiLaiMoiCoMa = false } = {}) {
    let url = 'https://seller-v3.tendoo.vn/sales/pos';
    let coToken = true;
    const nhatKy = [];
    let soLanHoiDanhTinh = 0;
    // Mô phỏng đúng cảnh thật: sau khi đăng nhập, trang được TẢI tại /callback
    // rồi ứng dụng tự chuyển màn sang /sales/pos — Chrome chưa chèn mã extension
    // vào trang đó, nên hỏi gì cũng câm cho tới khi TẢI LẠI.
    let coMaExtension = true;

    const doiTrang = async (tabId, hop) => {
        // Trình duyệt thật mất vài nhịp; ở đây quyết định ngay theo trạng thái.
        for (let i = 0; i < 3; i++) {
            if (hop(url)) return url;
            await new Promise(r => setTimeout(r, 1));
        }
        return null;
    };

    return {
        nhatKy,
        dem: (loai) => nhatKy.filter(x => x === loai).length,
        urlHienTai: () => url,
        boi: {
            nghi: async () => {},
            hanMs: 50,
            guiToiTab: async (tabId, tin) => {
                nhatKy.push(tin.loai);
                if (tin.loai === DoiTK.LOAI_TIN.XOA_TRANG_THAI) {
                    if (hong === 'xoa') return { ok: false };
                    coToken = false;
                    return { ok: true, daXoa: ['@access_token', '@business_id'] };
                }
                if (tin.loai === DoiTK.LOAI_TIN.DANG_NHAP) {
                    if (hong === 'captcha') return { ok: false, ma: 'CAPTCHA', thongBao: 'captcha' };
                    if (hong === 'saiMatKhau') return { ok: false, ma: 'SAI_MAT_KHAU', thongBao: 'Sai mật khẩu' };
                    if (hong === 'khongVePos') return { ok: true };
                    // Đăng nhập XONG (có token) nhưng cú chuyển hướng của Tendoo
                    // không tới nơi. Tự mở lại trang thì vào được — đúng cảnh
                    // khách Trang Bé TB hỏng lúc 18:05 ngày 21/08/2026.
                    if (hong === 'vePosChamNhungMoLaiDuoc') { coToken = true; return { ok: true }; }
                    coToken = true;
                    url = 'https://seller-v3.tendoo.vn/sales/pos';
                    if (canTaiLaiMoiCoMa) coMaExtension = false;
                    return { ok: true };
                }
                return null;
            },
            dieuHuongTab: async (tabId, dich) => {
                nhatKy.push('dieuHuong');
                // Không còn token -> ứng dụng đẩy sang trang đăng nhập.
                url = coToken ? dich
                    : 'https://id-v3.tendoo.vn/vi/signin?callback=' + encodeURIComponent(dich);
                if (hong === 'khongToiDangNhap') url = dich;   // phiên cũ vẫn còn
            },
            doiTrang,
            // Đọc danh tính CHẬM là chuyện bình thường: sau khi đăng nhập, trang
            // POS còn phải nạp lại script, ghi token, gọi API /info. Trang giả
            // phải mô phỏng được cảnh đó, nếu không test sẽ xanh trong khi thực
            // tế máy hỏi quá sớm rồi báo "sai tài khoản" oan.
            taiLaiTab: async () => {
                nhatKy.push('taiLai');
                coMaExtension = true;          // tải lại -> Chrome chèn lại mã
            },
            layDanhTinh: async () => {
                soLanHoiDanhTinh++;
                // Không có mã extension = KHÔNG AI TRẢ LỜI -> phải ném lỗi, đúng
                // như chrome.tabs.sendMessage ngoài đời.
                if (!coMaExtension) throw new Error('Could not establish connection');
                if (hong === 'khongDocDuocDanhTinh') return '';
                if (soLanHoiDanhTinh <= nemMayLanDau) {
                    throw new Error('Could not establish connection');   // script chưa nạp
                }
                if (soLanHoiDanhTinh <= nemMayLanDau + rongMayLanDau) return '';
                return maCuaHangSauKhiVao;
            },
        },
        soLanHoiDanhTinh: () => soLanHoiDanhTinh,
    };
}

/** Rút ngắn nhịp hỏi để test chạy nhanh, giữ nguyên hành vi. */
const NHANH = { hanDocDanhTinhMs: 120, nhipDocMs: 10 };

ghiChu('— Kiên nhẫn đợi trang trả lời danh tính —');

test('⭐ trang trả lời RỖNG vài lần rồi mới trả lời thật → vẫn đổi được', async () => {
    // Đây chính là cảnh gây ra lỗi thật: sau khi đăng nhập, trang POS cần hơn
    // 12 giây mới nói được nó đang ở cửa hàng nào. Code cũ đợi cứng 2,5 giây rồi
    // hỏi ĐÚNG MỘT LẦN, hỏi hụt là báo "sai tài khoản" và dừng cả loạt.
    const tr = trinhDuyetGia({ rongMayLanDau: 5 });
    const bo = DoiTK.taoBoDoiTaiKhoan({ ...tr.boi, ...NHANH });
    const kq = await bo.doiSang(7, tkPA);
    assert.strictEqual(kq.ok, true, JSON.stringify(kq));
    assert.strictEqual(kq.maCuaHang, CH_PA);
    assert.ok(tr.soLanHoiDanhTinh() >= 6, 'phải hỏi lại nhiều lần');
});

test('⭐ content script chưa nạp (gửi tin NÉM LỖI) → hỏi lại, không chết', async () => {
    const tr = trinhDuyetGia({ nemMayLanDau: 4 });
    const bo = DoiTK.taoBoDoiTaiKhoan({ ...tr.boi, ...NHANH });
    const kq = await bo.doiSang(7, tkPA);
    assert.strictEqual(kq.ok, true, JSON.stringify(kq));
});

test('trả lời được ngay lần đầu → KHÔNG đợi thêm nhịp nào', async () => {
    const tr = trinhDuyetGia();
    const bo = DoiTK.taoBoDoiTaiKhoan({ ...tr.boi, ...NHANH });
    await bo.doiSang(7, tkPA);
    assert.strictEqual(tr.soLanHoiDanhTinh(), 1, 'hỏi thừa — đường thuận lợi bị làm chậm');
});

test('⭐ hết hạn vẫn không đọc được → mã RIÊNG, KHÔNG đổ cho "sai tài khoản"', async () => {
    const tr = trinhDuyetGia({ hong: 'khongDocDuocDanhTinh' });
    const bo = DoiTK.taoBoDoiTaiKhoan({ ...tr.boi, ...NHANH });
    const kq = await bo.doiSang(7, tkPA);
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ma, MA.KHONG_DOC_DUOC_DANH_TINH);
    assert.notStrictEqual(kq.ma, MA.SAI_TAI_KHOAN,
        '❌ vẫn đổ tội cho khai báo trong khi chỉ là trang chậm');
    assert.match(kq.thongBao, /KHÔNG sai/i, 'phải nói rõ khai báo của người dùng không sai');
    assert.match(kq.thongBao, /thử lại/i);
    assert.match(kq.thongBao, /\d+\/\d+ lần/, 'phải nói rõ hỏng bao nhiêu trên bao nhiêu lần');
});

test('⭐ đọc được nhưng LÀ CỬA HÀNG KHÁC → vẫn dừng NGAY, không kiên nhẫn', async () => {
    // Kiên nhẫn chỉ dành cho "chưa trả lời". Trả lời sai thì hỏi lại bao nhiêu
    // lần cũng vô nghĩa, và mỗi nhịp chờ là một nhịp đứng ở nhầm tài khoản.
    const tr = trinhDuyetGia({ maCuaHangSauKhiVao: CH_TB });
    const bo = DoiTK.taoBoDoiTaiKhoan({ ...tr.boi, ...NHANH });
    const kq = await bo.doiSang(7, tkPA);
    assert.strictEqual(kq.ma, MA.SAI_TAI_KHOAN);
    assert.strictEqual(tr.soLanHoiDanhTinh(), 1, 'hỏi lại khi đã biết là sai — thừa và nguy hiểm');
});

test('thông báo SAI TÀI KHOẢN nói rõ CẢ HAI mã, không nói "không đọc được"', async () => {
    const tr = trinhDuyetGia({ maCuaHangSauKhiVao: CH_TB });
    const bo = DoiTK.taoBoDoiTaiKhoan({ ...tr.boi, ...NHANH });
    const kq = await bo.doiSang(7, tkPA);
    assert.ok(kq.thongBao.includes(CH_TB), 'thiếu mã cửa hàng đang mở');
    assert.ok(kq.thongBao.includes(CH_PA), 'thiếu mã cửa hàng đáng ra phải mở');
    assert.ok(!/không đọc được/i.test(kq.thongBao),
        '❌ nói "không đọc được" trong khi đọc được — đúng câu đã đánh lừa người dùng');
});

ghiChu('— docDanhTinhKienNhan: hàm đọc kiên nhẫn —');

test('trả về ngay khi có kết quả, đếm đúng số lần hỏi', async () => {
    let n = 0;
    const kq = await DoiTK.docDanhTinhKienNhan(async () => (++n < 3 ? '' : CH_PA), 1,
        { hanMs: 100, nhipMs: 10, nghi: async () => {} });
    assert.strictEqual(kq.maCuaHang, CH_PA);
    assert.strictEqual(kq.soLanHoi, 3);
});

test('luôn hỏi ÍT NHẤT một lần, kể cả hạn bằng 0', async () => {
    let n = 0;
    const kq = await DoiTK.docDanhTinhKienNhan(async () => { n++; return CH_PA; }, 1,
        { hanMs: 0, nhipMs: 10, nghi: async () => {} });
    assert.strictEqual(n, 1);
    assert.strictEqual(kq.maCuaHang, CH_PA);
});

test('không bao giờ hỏi quá hạn', async () => {
    let n = 0;
    await DoiTK.docDanhTinhKienNhan(async () => { n++; return ''; }, 1,
        { hanMs: 50, nhipMs: 10, nghi: async () => {} });
    assert.ok(n <= 6, 'hỏi ' + n + ' lần — vượt hạn');
});

test('cắt khoảng trắng thừa quanh mã cửa hàng', async () => {
    const kq = await DoiTK.docDanhTinhKienNhan(async () => '  ' + CH_PA + ' ', 1,
        { hanMs: 10, nhipMs: 10, nghi: async () => {} });
    assert.strictEqual(kq.maCuaHang, CH_PA);
});

test('chỉ toàn khoảng trắng → coi như CHƯA đọc được, không nhận bừa', async () => {
    const kq = await DoiTK.docDanhTinhKienNhan(async () => '   ', 1,
        { hanMs: 20, nhipMs: 10, nghi: async () => {} });
    assert.strictEqual(kq.maCuaHang, '');
});

test('hạn đọc TRƯỚC khi đổi ngắn hơn hẳn hạn đọc SAU khi đăng nhập', () => {
    // Trước khi đổi, "chưa đọc được" là chuyện bình thường (chưa đăng nhập bao
    // giờ) -> đọc không ra thì đi đăng nhập luôn, không bắt người dùng ngồi đợi.
    // Sau khi đăng nhập thì ngược lại: phải đợi đủ lâu, vì rỗng ở đó là lỗi.
    assert.ok(DoiTK.HAN_DOC_TRUOC_KHI_DOI_MS < DoiTK.HAN_DOC_DANH_TINH_MS);

    // ⭐ Điều CẦN giữ là SỐ LẦN HỎI, không phải số giây. Trước đây hạn 8 giây với
    // nhịp 1 giây = 8 lần hỏi. Nay hạn 2,5 giây với nhịp 0,25 giây = 10 lần hỏi
    // — hỏi NHIỀU HƠN trong thời gian NGẮN HƠN. Bám vào số giây là bám nhầm thứ.
    const soLanTruocKhiDoi = Math.floor(DoiTK.HAN_DOC_TRUOC_KHI_DOI_MS / DoiTK.NHIP_DOC_MS);
    assert.ok(soLanTruocKhiDoi >= 8,
        `chỉ hỏi ${soLanTruocKhiDoi} lần trước khi đổi — ít quá, dễ hỏi hụt`);
    const soLanSauDangNhap = Math.floor(DoiTK.HAN_DOC_DANH_TINH_MS / DoiTK.NHIP_DOC_MS);
    assert.ok(soLanSauDangNhap >= 30, 'sau đăng nhập phải hỏi đủ kiên nhẫn');
});

ghiChu('— Tải lại trang sau khi đăng nhập (nếu không, mã extension không có mặt) —');

test('⭐ trang sau đăng nhập KHÔNG có mã extension → tải lại rồi vẫn chạy được', async () => {
    // Đây chính là lỗi thật: đăng nhập xong, trình duyệt được tải tại
    // /callback rồi ứng dụng tự chuyển màn sang /sales/pos. Chrome chỉ chèn mã
    // lúc trang được TẢI, nên trang đó không hề có mã của mình -> hỏi 31 lần
    // trong 30 giây đều câm.
    const tr = trinhDuyetGia({ canTaiLaiMoiCoMa: true });
    const bo = DoiTK.taoBoDoiTaiKhoan({ ...tr.boi, ...NHANH });
    const kq = await bo.doiSang(7, tkPA);
    assert.strictEqual(kq.ok, true, JSON.stringify(kq));
    assert.strictEqual(tr.dem('taiLai'), 1, 'phải tải lại đúng một lần');
});

test('⭐ KHÔNG tải lại → hỏng đúng như bạn gặp (chứng minh bước đó là bắt buộc)', async () => {
    const tr = trinhDuyetGia({ canTaiLaiMoiCoMa: true });
    const boi = { ...tr.boi, ...NHANH };
    delete boi.taiLaiTab;                       // bỏ đúng bước 4b
    const kq = await DoiTK.taoBoDoiTaiKhoan(boi).doiSang(7, tkPA);
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ma, MA.KHONG_DOC_DUOC_DANH_TINH);
});

test('tải lại xong mà vẫn không về được trang bán hàng → dừng, không mò tiếp', async () => {
    const tr = trinhDuyetGia();
    const bo = DoiTK.taoBoDoiTaiKhoan({
        ...tr.boi, ...NHANH,
        taiLaiTab: async () => { tr.boi.dieuHuongTab(7, 'https://seller-v3.tendoo.vn/khac'); },
        doiTrang: async (tabId, hop) => (hop(tr.urlHienTai()) ? tr.urlHienTai() : null),
    });
    const kq = await bo.doiSang(7, tkPA);
    assert.strictEqual(kq.ok, false);
});

ghiChu('— Nói đúng bệnh: tab câm hay tab chưa biết —');

test('⭐ tab KHÔNG TRẢ LỜI → chỉ đúng cách chữa là F5, không đổ cho mạng chậm', async () => {
    const tr = trinhDuyetGia({ canTaiLaiMoiCoMa: true });
    const boi = { ...tr.boi, ...NHANH };
    delete boi.taiLaiTab;
    const kq = await DoiTK.taoBoDoiTaiKhoan(boi).doiSang(7, tkPA);
    assert.match(kq.thongBao, /KHÔNG TRẢ LỜI/);
    assert.match(kq.thongBao, /F5/);
    assert.ok(!/mạng chậm/i.test(kq.thongBao), 'đổ nhầm cho mạng chậm');
});

test('⭐ tab CÓ trả lời nhưng rỗng → chỉ đúng bệnh là phiên chưa dựng xong', async () => {
    const tr = trinhDuyetGia({ hong: 'khongDocDuocDanhTinh' });
    const kq = await DoiTK.taoBoDoiTaiKhoan({ ...tr.boi, ...NHANH }).doiSang(7, tkPA);
    assert.match(kq.thongBao, /có trả lời nhưng chưa biết/i);
    assert.ok(!/F5/.test(kq.thongBao), 'bảo F5 trong khi tab vẫn trả lời bình thường');
});

test('hàm đọc kiên nhẫn đếm riêng "tab câm" và "trả lời rỗng"', async () => {
    let n = 0;
    const kq = await DoiTK.docDanhTinhKienNhan(async () => {
        n++;
        if (n <= 2) throw new Error('Could not establish connection');
        if (n <= 4) return '';
        return CH_PA;
    }, 1, { hanMs: 100, nhipMs: 10, nghi: async () => {} });
    assert.strictEqual(kq.maCuaHang, CH_PA);
    assert.strictEqual(kq.soLanTabCam, 2);
    assert.strictEqual(kq.soLanRong, 2);
    assert.strictEqual(kq.soLanHoi, 5);
});

ghiChu('— Xóa trạng thái tài khoản cũ —');

test('xóa SẠCH mọi khóa "@", không sót khóa nào', () => {
    // jsdom cần địa chỉ trang thật thì mới cho dùng localStorage.
    const dom = new JSDOM('', { url: 'https://seller-v3.tendoo.vn/sales/pos' });
    const ls = dom.window.localStorage;
    for (const k of ['@access_token', '@refresh_token', '@business_id', '@business_store',
                     '@permissions', '@user_store', '@tax_store', '@locale']) {
        ls.setItem(k, 'gia-tri');
    }
    ls.setItem('theme', 'dark');           // khóa của trang, không phải của tài khoản

    const kq = DoiTK.xoaTrangThaiCu(dom.window);
    assert.strictEqual(kq.ok, true);
    assert.strictEqual(kq.daXoa.length, 8);
    for (let i = 0; i < ls.length; i++) {
        assert.ok(!String(ls.key(i)).startsWith('@'), 'còn sót ' + ls.key(i));
    }
    assert.strictEqual(ls.getItem('theme'), 'dark', 'xóa nhầm khóa không phải của tài khoản');
});

test('không có localStorage → báo hỏng, không nổ', () => {
    assert.strictEqual(DoiTK.xoaTrangThaiCu(null).ok, false);
    assert.strictEqual(DoiTK.xoaTrangThaiCu({}).ok, false);
});

ghiChu('— Đổi tài khoản: đường suôn sẻ —');

test('đổi được: xóa → đẩy sang đăng nhập → điền form → về POS → đối chiếu', async () => {
    const td = trinhDuyetGia();
    const bo = DoiTK.taoBoDoiTaiKhoan(td.boi);
    const kq = await bo.doiSang(7, tkPA);

    assert.strictEqual(kq.ok, true, kq.thongBao);
    assert.strictEqual(kq.maCuaHang, CH_PA);
    // 'taiLai' nằm cuối: bước BẮT BUỘC để Chrome chèn lại mã extension vào
    // trang — xem chú thích bước 4b trong doiTaiKhoan.js.
    assert.deepStrictEqual(td.nhatKy,
        ['hdt-xoa-trang-thai', 'dieuHuong', 'hdt-dang-nhap', 'taiLai']);
    assert.match(td.urlHienTai(), /sales\/pos/);
});

test('KHÔNG dùng nút Đăng xuất của Tendoo — chỉ xóa trạng thái rồi tải lại', async () => {
    const ma = require('fs').readFileSync(
        require('path').join(__dirname, '..', 'chung', 'doiTaiKhoan.js'), 'utf8');
    assert.ok(!/logout|dang-xuat|signout/i.test(ma),
        'code có nhắc tới đăng xuất — cách làm phải là xóa trạng thái, không phụ thuộc nút đó');
});

ghiChu('— Mọi đường hỏng đều DỪNG, không đi tiếp —');

test('thiếu tài khoản/mật khẩu → dừng ngay, không đụng vào trang', async () => {
    const td = trinhDuyetGia();
    const bo = DoiTK.taoBoDoiTaiKhoan(td.boi);
    for (const thieu of [null, {}, { tenDangNhap: 'x' }, { matKhau: 'y' }]) {
        const kq = await bo.doiSang(7, thieu);
        assert.strictEqual(kq.ok, false);
        assert.strictEqual(kq.ma, MA.DANG_NHAP_LOI);
    }
    assert.strictEqual(td.nhatKy.length, 0, 'đã đụng vào trang dù thiếu thông tin');
});

test('xóa trạng thái thất bại → DỪNG, không điều hướng đi đâu', async () => {
    const td = trinhDuyetGia({ hong: 'xoa' });
    const kq = await DoiTK.taoBoDoiTaiKhoan(td.boi).doiSang(7, tkPA);
    assert.strictEqual(kq.ma, MA.KHONG_XOA_DUOC);
    assert.strictEqual(td.dem('dieuHuong'), 0);
    assert.strictEqual(td.dem('hdt-dang-nhap'), 0);
});

test('⚠ XÓA XONG MÀ KHÔNG bị đẩy sang trang đăng nhập → DỪNG', async () => {
    // Đây là ca nguy hiểm nhất: phiên cũ vẫn còn ở đâu đó. Chạy tiếp nghĩa là
    // làm việc trên tài khoản CŨ trong khi tưởng đã đổi.
    const td = trinhDuyetGia({ hong: 'khongToiDangNhap' });
    const kq = await DoiTK.taoBoDoiTaiKhoan(td.boi).doiSang(7, tkPA);
    assert.strictEqual(kq.ma, MA.KHONG_TOI_TRANG_DANG_NHAP);
    assert.match(kq.thongBao, /phiên cũ có thể vẫn còn/i);
    assert.strictEqual(td.dem('hdt-dang-nhap'), 0, 'vẫn cố đăng nhập dù chưa rời tài khoản cũ');
});

test('sai mật khẩu → DANG_NHAP_LOI', async () => {
    const td = trinhDuyetGia({ hong: 'saiMatKhau' });
    const kq = await DoiTK.taoBoDoiTaiKhoan(td.boi).doiSang(7, tkPA);
    assert.strictEqual(kq.ma, MA.DANG_NHAP_LOI);
    assert.match(kq.thongBao, /Sai mật khẩu/);
});

test('gặp captcha → CAPTCHA (nhóm dừng cả loạt)', async () => {
    const td = trinhDuyetGia({ hong: 'captcha' });
    const kq = await DoiTK.taoBoDoiTaiKhoan(td.boi).doiSang(7, tkPA);
    assert.strictEqual(kq.ma, MA.CAPTCHA);
    const HangDoi = require('../chung/hangDoi');
    assert.ok(HangDoi.LOI_DUNG_CA_LOAT.has('CAPTCHA'));
});

test('đăng nhập xong mà không quay lại trang bán hàng → DỪNG', async () => {
    const td = trinhDuyetGia({ hong: 'khongVePos' });
    const kq = await DoiTK.taoBoDoiTaiKhoan(td.boi).doiSang(7, tkPA);
    assert.strictEqual(kq.ma, MA.KHONG_QUAY_LAI_POS);
    assert.match(kq.thongBao, /đã thử tự mở lại trang một lần/,
        'không nói là đã thử lại: ' + kq.thongBao);
});

test('⭐⭐ chuyển hướng không tới nơi → TỰ MỞ LẠI TRANG, cứu được cả khách', async () => {
    // ⚠️ CA HỎNG THẬT 21/08/2026, mốc 18:05: khách Trang Bé TB (8.795.000đ) mất
    // trắng vì «Đăng nhập xong nhưng không quay lại được trang bán hàng». Đăng
    // nhập ĐÃ THÀNH CÔNG; chỉ là cú chuyển hướng của Tendoo không tới nơi.
    //
    // ⚠️ AN TOÀN: chỗ này nằm TRƯỚC MỌI THAO TÁC VỚI GIỎ — chưa bỏ món nào,
    // chưa bấm Thanh toán, chưa có tờ hóa đơn nào tồn tại.
    const td = trinhDuyetGia({ hong: 'vePosChamNhungMoLaiDuoc' });
    const kq = await DoiTK.taoBoDoiTaiKhoan(td.boi).doiSang(7, tkPA);
    assert.strictEqual(kq.ok, true, 'thông báo: ' + kq.thongBao);
});

ghiChu('— ⛔ Cửa chặn cuối: vào rồi vẫn phải đúng cửa hàng —');

test('vào NHẦM cửa hàng khác → SAI_TAI_KHOAN', async () => {
    const td = trinhDuyetGia({ maCuaHangSauKhiVao: CH_TB });
    const kq = await DoiTK.taoBoDoiTaiKhoan(td.boi).doiSang(7, tkPA);
    assert.strictEqual(kq.ma, MA.SAI_TAI_KHOAN);
    assert.match(kq.thongBao, /không khớp khai báo/);
});

test('không đọc được cửa hàng sau khi vào → DỪNG, không đoán bừa là đúng', async () => {
    // Vẫn phải dừng. Chỉ khác ở chỗ mã lỗi nay nói đúng bản chất: chưa đọc được,
    // chứ không phải khai báo sai. Xem nhóm test "Kiên nhẫn đợi trang trả lời".
    const td = trinhDuyetGia({ hong: 'khongDocDuocDanhTinh' });
    const kq = await DoiTK.taoBoDoiTaiKhoan({ ...td.boi, ...NHANH }).doiSang(7, tkPA);
    assert.strictEqual(kq.ok, false, '❌ CHO QUA khi không biết đang ở cửa hàng nào');
    assert.strictEqual(kq.ma, MA.KHONG_DOC_DUOC_DANH_TINH);
});

test('khai báo thiếu mã cửa hàng mong đợi → KHÔNG cho qua', async () => {
    const td = trinhDuyetGia();
    const kq = await DoiTK.taoBoDoiTaiKhoan(td.boi)
        .doiSang(7, { ...tkPA, maCuaHangMongDoi: '' });
    assert.strictEqual(kq.ma, MA.SAI_TAI_KHOAN);
});

test('so mã cửa hàng không phân biệt hoa thường', async () => {
    const td = trinhDuyetGia({ maCuaHangSauKhiVao: CH_PA.toUpperCase() });
    const kq = await DoiTK.taoBoDoiTaiKhoan(td.boi).doiSang(7, tkPA);
    assert.strictEqual(kq.ok, true);
});

// ─── KHO PHIÊN ──────────────────────────────────────────────────────────────
// Nhóm test "kho phiên" đã bỏ: từ 2026-08-12 không còn khóa mở, nên không
// còn bộ nhớ phiên giữ mật khẩu đã giải mã. Mật khẩu đọc thẳng từ kho.


ghiChu('— ⭐ TAB CÂM: nói đúng bệnh, và tự chữa —');

const URL_POS_T = DoiTK.URL_POS;

// Ngày 2026-08-13, hai lượt hẹn giờ hỏng liên tiếp với đúng một câu
// "Không xóa được trạng thái đăng nhập cũ trên trang Tendoo" — gộp ba chuyện
// khác hẳn nhau, và VỨT ĐI nguyên văn lý do Chrome trả về. Không cách nào biết
// vì sao. Bộ test dưới đây khóa lại cả ba đường.

/** Bộ đổi tài khoản với tab trả lời theo kịch bản cho sẵn. */
function dungTabTheoKichBan(cacTraLoi, { taiLaiTab, urlSauTaiLai = URL_POS_T } = {}) {
    const daGui = [];
    let soLanTaiLai = 0;
    let traCuoi = null;
    let urlHienTai = URL_POS_T;
    const bo = DoiTK.taoBoDoiTaiKhoan({
        // Hết kịch bản thì GIỮ NGUYÊN câu trả lời cuối. Máy nay hỏi lại nhiều
        // lần cho tới khi tab trả lời được, nên một tab câm phải câm MÃI với
        // cùng một lý do — chứ không phải câm rồi hóa thành "rỗng, không rõ".
        guiToiTab: async (tabId, tin) => {
            daGui.push(tin.loai);
            if (cacTraLoi.length) traCuoi = cacTraLoi.shift();
            return typeof traCuoi === 'function' ? traCuoi() : traCuoi;
        },
        dieuHuongTab: async (tabId, url) => { urlHienTai = url; },
        doiTrang: async (tabId, hop) => (hop(urlHienTai) ? urlHienTai : null),
        layDanhTinh: async () => '',
        taiLaiTab: taiLaiTab === null ? null : (taiLaiTab || (async () => {
            soLanTaiLai++;
            urlHienTai = urlSauTaiLai;
        })),
        nghi: async () => {},
        hanMs: 30,
    });
    return { bo, daGui, soLanTaiLai: () => soLanTaiLai };
}

const tk = { maKH: 'PA', tenDangNhap: 'a', matKhau: 'b', maCuaHangMongDoi: 'ch' };

test('⭐ tab CÂM → tải lại tab rồi thử lại, chạy tiếp bình thường', async () => {
    // Tải lại tab chính là bấm F5: Chrome chèn lại mã extension vào trang.
    const { bo, soLanTaiLai } = dungTabTheoKichBan([
        { __loiGui: 'Could not establish connection. Receiving end does not exist.' },
        { ok: true, daXoa: ['@access_token'] },   // sau khi tải lại thì trả lời được
        { ok: true },                             // đăng nhập
    ], { urlSauTaiLai: 'https://id-v3.tendoo.vn/signin' });

    const kq = await bo.doiSang(1, tk);
    assert.strictEqual(soLanTaiLai(), 1, 'không tự tải lại tab');
    // Đi qua được bước 1 là đủ — các bước sau đã có test riêng.
    assert.notStrictEqual(kq.ma, MA.TAB_CAM, kq.thongBao);
    assert.notStrictEqual(kq.ma, MA.KHONG_XOA_DUOC, kq.thongBao);
});

test('⭐ tải lại rồi VẪN CÂM → dừng, nói thẳng phải F5, kèm lý do thật', async () => {
    const { bo, soLanTaiLai } = dungTabTheoKichBan([
        { __loiGui: 'Receiving end does not exist.' },
        { __loiGui: 'Receiving end does not exist.' },
    ]);
    const kq = await bo.doiSang(1, tk);
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ma, 'TAB_CAM');
    assert.strictEqual(kq.ma, MA.TAB_CAM);
    assert.match(kq.thongBao, /KHÔNG TRẢ LỜI/);
    assert.match(kq.thongBao, /Receiving end does not exist/,
        'vứt mất nguyên văn lý do Chrome trả về — đúng lỗi cũ');
    assert.match(kq.thongBao, /F5/);
    assert.match(kq.thongBao, /chưa phát hành hóa đơn nào/);
    assert.strictEqual(soLanTaiLai(), 1, 'tải lại nhiều hơn một lần');
});

test('⭐ CHỈ tự chữa MỘT lần — không tải lại mãi', async () => {
    const { bo, soLanTaiLai } = dungTabTheoKichBan([
        { __loiGui: 'x' }, { __loiGui: 'y' },
    ]);
    await bo.doiSang(1, tk);
    assert.strictEqual(soLanTaiLai(), 1);
});

test('⭐ tab THIẾU BỘ PHẬN → nói đúng bệnh, khác hẳn "tab câm"', async () => {
    const { bo } = dungTabTheoKichBan([
        { ok: false, daXoa: [], thieuBoPhan: 'HDT_DoiTaiKhoan' },
        { ok: false, daXoa: [], thieuBoPhan: 'HDT_DoiTaiKhoan' },
    ]);
    const kq = await bo.doiSang(1, tk);
    assert.strictEqual(kq.ma, 'TAB_THIEU_BO_PHAN');
    assert.strictEqual(kq.ma, MA.TAB_THIEU_BO_PHAN);
    assert.match(kq.thongBao, /THIẾU BỘ PHẬN/);
    assert.match(kq.thongBao, /F5/);
});

test('⭐ localStorage bị chặn → KHÔNG đổ cho tab câm, nói đúng chuyện', async () => {
    // Cái này F5 không chữa được, nên không được nói "hãy F5".
    const { bo } = dungTabTheoKichBan([
        { ok: false, daXoa: [] }, { ok: false, daXoa: [] },
    ]);
    const kq = await bo.doiSang(1, tk);
    assert.strictEqual(kq.ma, 'KHONG_XOA_DUOC_TRANG_THAI');
    assert.strictEqual(kq.ma, MA.KHONG_XOA_DUOC);
    assert.match(kq.thongBao, /localStorage/);
    assert.ok(!/F5/.test(kq.thongBao), 'bảo F5 trong khi F5 không chữa được');
});

test('không có cách tải lại tab → vẫn báo lỗi đàng hoàng, không nổ', async () => {
    const { bo, soLanTaiLai } = dungTabTheoKichBan([{ __loiGui: 'x' }], { taiLaiTab: null });
    const kq = await bo.doiSang(1, tk);
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.ma, 'TAB_CAM');
    assert.strictEqual(soLanTaiLai(), 0);
});

test('tab trả lời tốt ngay lần đầu → KHÔNG tải lại tab vô ích', async () => {
    const { bo, soLanTaiLai } = dungTabTheoKichBan([
        { ok: true, daXoa: ['@access_token'] }, { ok: true },
    ], { urlSauTaiLai: 'https://id-v3.tendoo.vn/signin' });
    await bo.doiSang(1, tk);
    assert.strictEqual(soLanTaiLai(), 0, 'tải lại tab dù tab vẫn tốt — chậm vô ích');
});

test('⭐ xóa trạng thái xong mới được đi tiếp — thứ tự không được đảo', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const ma = fs.readFileSync(path.join(__dirname, '..', 'chung', 'doiTaiKhoan.js'), 'utf8');
    const than = ma.slice(ma.indexOf('async function doiSang'));
    const iXoa = than.indexOf('xoaTrangThaiCoChuaCham');
    const iDieuHuong = than.indexOf('dieuHuongTab');
    assert.ok(iXoa > 0 && iXoa < iDieuHuong,
        'điều hướng trước khi xóa trạng thái — phiên cũ có thể còn nguyên');
});

ghiChu('— ⭐ Kiểm sẵn sàng phải xét ĐỦ bộ phận —');

test('⭐ danh sách bộ phận bắt buộc có ĐỦ những thứ thật sự dùng tới', () => {
    // Bản cũ chỉ xét 5 cái và thiếu HDT_DoiTaiKhoan, nên tab nạp hụt vẫn được
    // báo "sẵn sàng" rồi chết ở bước đổi tài khoản.
    const fs = require('node:fs');
    const path = require('node:path');
    const ma = fs.readFileSync(path.join(__dirname, '..', 'tendoo', 'nhanLenh.js'), 'utf8');
    const dau = ma.indexOf('const BO_PHAN_BAT_BUOC');
    const doan = ma.slice(dau, ma.indexOf('];', dau));
    for (const t of ['HDT_BoNoi', 'HDT_DocSanPham', 'HDT_DanhTinh', 'HDT_GhepTien',
                     'HDT_BoGio', 'HDT_DomReact', 'HDT_BamThanhToan', 'HDT_DoiTaiKhoan',
                     'HDT_DauGio', 'HDT_CaiDat']) {
        assert.ok(doan.includes(t), `thiếu ${t} trong danh sách bộ phận bắt buộc`);
    }
});

test('⭐ mọi bộ phận bắt buộc đều ĐƯỢC MANIFEST NẠP vào trang POS', () => {
    // Đòi một bộ phận mà manifest không nạp thì trang POS không bao giờ sẵn sàng.
    const fs = require('node:fs');
    const path = require('node:path');
    const GOC = path.join(__dirname, '..');
    const mf = JSON.parse(fs.readFileSync(path.join(GOC, 'manifest.json'), 'utf8'));
    const cs = mf.content_scripts.find(c => c.matches.some(m => m.includes('seller-v3')));
    const chu = cs.js.map(f => fs.readFileSync(path.join(GOC, f), 'utf8')).join('\n');
    const ma = fs.readFileSync(path.join(GOC, 'tendoo', 'nhanLenh.js'), 'utf8');
    const dau = ma.indexOf('const BO_PHAN_BAT_BUOC');
    const doan = ma.slice(dau, ma.indexOf('];', dau));
    for (const t of doan.match(/HDT_[A-Za-z]+/g) || []) {
        assert.ok(chu.includes(`globalThis.${t} =`) || chu.includes(`${t} =`),
            `${t} bị đòi nhưng manifest không nạp file định nghĩa nó`);
    }
});


ghiChu('— ⭐ CÓ PHẢI ĐỔI TÀI KHOẢN KHÔNG — chỗ quyết định chuyện chung cửa hàng —');

test('⭐ ĐÚNG cửa hàng đang mở → KHÔNG đổi (chung cửa hàng chỉ đăng nhập 1 lần)', () => {
    // Đây chính là dòng làm cho hai, ba khách dùng chung một cửa hàng Tendoo
    // chỉ phải đăng nhập một lần. Trước 2026-08-15 nó chôn trong background.js
    // nên không bài kiểm nào chạm tới.
    assert.strictEqual(DoiTK.canDoiTaiKhoan('ch-abc', 'ch-abc'), false);
});

test('⭐ KHÁC cửa hàng → PHẢI đổi', () => {
    assert.strictEqual(DoiTK.canDoiTaiKhoan('ch-abc', 'ch-xyz'), true);
});

test('⭐ không phân biệt hoa thường và khoảng trắng thừa', () => {
    // Mã cửa hàng là UUID, copy từ chỗ khác rất hay dính hoa thường lẫn lộn.
    // So sai ở đây là đăng nhập lại một cách vô ích — mất cả phút mỗi khách.
    assert.strictEqual(DoiTK.canDoiTaiKhoan('CH-ABC', 'ch-abc'), false);
    assert.strictEqual(DoiTK.canDoiTaiKhoan('  ch-abc  ', 'ch-abc'), false);
    assert.strictEqual(DoiTK.canDoiTaiKhoan('ch-ABC', '  CH-abc'), false);
});

test('⭐ CHƯA ĐỌC ĐƯỢC cửa hàng đang mở → PHẢI đổi, không được đoán bừa', () => {
    // Rỗng nghĩa là "không biết", không phải "chắc đúng rồi". Đoán bừa là hóa
    // đơn ra ở tài khoản người khác — không hoàn tác được.
    for (const rong of ['', null, undefined, '   ']) {
        assert.strictEqual(DoiTK.canDoiTaiKhoan(rong, 'ch-abc'), true,
            'coi ' + JSON.stringify(rong) + ' là khớp — sẽ chạy nhầm tài khoản');
    }
});

test('⭐ khách CHƯA khai mã cửa hàng → PHẢI đổi (để tầng trên bắt lỗi)', () => {
    for (const rong of ['', null, undefined]) {
        assert.strictEqual(DoiTK.canDoiTaiKhoan('ch-abc', rong), true);
    }
});

test('⭐ CẢ HAI cùng rỗng vẫn PHẢI đổi — "không biết gì" không phải là "khớp"', () => {
    // Ca này là lý do tồn tại của dòng chặn rỗng. Không có nó thì phép so trần
    // `'' !== ''` ra false, tức KHỚP — máy kết luận "đang đúng cửa hàng rồi"
    // trong khi thật ra chẳng biết gì cả, rồi bỏ qua đăng nhập.
    for (const a of ['', null, undefined, '  ']) {
        for (const b of ['', null, undefined, '  ']) {
            assert.strictEqual(DoiTK.canDoiTaiKhoan(a, b), true,
                `coi ${JSON.stringify(a)} và ${JSON.stringify(b)} là khớp`);
        }
    }
});

test('⭐ background.js DÙNG hàm này, không tự so lại một kiểu khác', () => {
    // Hai chỗ cùng so cửa hàng là sớm muộn lệch nhau, mà lệch ở đây nghĩa là
    // hóa đơn ra nhầm tài khoản.
    const fs = require('fs');
    const path = require('path');
    const ma = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
    assert.match(ma, /canDoiTaiKhoan\(dangMo, banGhi\.maCuaHang\)/,
        'background.js chưa dùng canDoiTaiKhoan');
    const than = ma.slice(ma.indexOf('async function taoMocDoiTaiKhoan'),
                          ma.indexOf('async function docSo'));
    assert.ok(!/dangMo\.toLowerCase\(\) ===/.test(than),
        'còn phép so cửa hàng viết tay trong background.js');
});


ghiChu('— ⭐ TAB Ở TRANG ĐĂNG NHẬP TENDOO: đi đăng nhập luôn, đừng kết luận "tab câm" —');

/**
 * Trình duyệt giả mô phỏng ĐÚNG cảnh 2026-08-15: phiên Tendoo hết, tab bị đá về
 * id-v3.tendoo.vn/signin. Ở trang đó manifest CHỈ nạp dangNhap.js, nên tin
 * 'hdt-xoa-trang-thai' KHÔNG AI TRẢ LỜI.
 */
function trinhDuyetHetPhien({ vaoDuoc = true } = {}) {
    let url = 'https://id-v3.tendoo.vn/vi/signin?callback=%2Fsales%2Fpos';
    let coPhien = false;              // phiên Tendoo đã hết — đó là cả kịch bản
    const nhatKy = [];
    return {
        nhatKy,
        dem: (loai) => nhatKy.filter(x => x === loai).length,
        urlHienTai: () => url,
        boi: {
            nghi: async () => {},
            hanMs: 50,
            // ⚠️ Trang đăng nhập KHÔNG trả lời tin xoá trạng thái — trả null,
            // đúng như chrome.tabs.sendMessage khi không ai nghe.
            guiToiTab: async (tabId, tin) => {
                nhatKy.push(tin.loai);
                if (tin.loai === DoiTK.LOAI_TIN.XOA_TRANG_THAI) return null;
                if (tin.loai === DoiTK.LOAI_TIN.DANG_NHAP) {
                    if (!vaoDuoc) return { ok: false, ma: 'SAI_MAT_KHAU', thongBao: 'Sai mật khẩu' };
                    coPhien = true;
                    url = 'https://seller-v3.tendoo.vn/sales/pos';
                    return { ok: true };
                }
                return null;
            },
            // ⚠️ HẾT PHIÊN thì vào trang bán hàng sẽ BỊ ĐÁ NGƯỢC về trang
            // đăng nhập — đúng như Tendoo thật. Không mô phỏng chỗ này thì bài
            // dò xanh/đỏ đều không nói lên điều gì về đời thật.
            dieuHuongTab: async (tabId, dich) => {
                nhatKy.push('dieuHuong');
                url = coPhien ? dich
                    : 'https://id-v3.tendoo.vn/vi/signin?callback=' + encodeURIComponent(dich);
            },
            doiTrang: async (tabId, hop) => (hop(url) ? url : null),
            taiLaiTab: async () => { nhatKy.push('taiLai'); },
            layDanhTinh: async () => CH_PA,
            docUrlTab: async () => url,
        },
    };
}

test('⭐ hết phiên Tendoo → máy TỰ ĐĂNG NHẬP và chạy tiếp, KHÔNG báo tab câm', async () => {
    // Trước 2026-08-15: đòi xoá trạng thái trước, không ai trả lời, kết luận
    // "tab câm", tải lại tab vẫn ở trang đăng nhập nên vẫn câm → DỪNG cả lượt.
    // Máy có sẵn tài khoản mà tự chặn mình ở bước lau dọn.
    const tr = trinhDuyetHetPhien();
    const bo = DoiTK.taoBoDoiTaiKhoan({ ...tr.boi, ...NHANH });
    const kq = await bo.doiSang(7, {
        maKH: 'PA', tenDangNhap: 'pa@x', matKhau: 'MatKhau!1', maCuaHangMongDoi: CH_PA,
    });
    assert.strictEqual(kq.ok, true, 'vẫn hỏng: ' + JSON.stringify(kq));
    assert.strictEqual(kq.ma, DoiTK.MA.XONG);
    assert.strictEqual(kq.maCuaHang, CH_PA);
});

test('⭐ ở trang đăng nhập thì KHÔNG phí công tải lại tab TRƯỚC khi đăng nhập', async () => {
    // Tải lại một trang đăng nhập thì vẫn ra trang đăng nhập — mất thời gian mà
    // chẳng chữa được gì.
    //
    // ⚠️ Lần tải lại SAU khi đăng nhập thì VẪN PHẢI CÓ (bước 4b): trang mở tại
    // /callback rồi tự chuyển màn, Chrome chưa chèn mã vào đó. Nên ở đây chỉ
    // canh THỨ TỰ, không canh tổng số lần.
    const tr = trinhDuyetHetPhien();
    const bo = DoiTK.taoBoDoiTaiKhoan({ ...tr.boi, ...NHANH });
    await bo.doiSang(7, { maKH: 'PA', tenDangNhap: 'pa@x', matKhau: 'M!1', maCuaHangMongDoi: CH_PA });
    const iTaiLai = tr.nhatKy.indexOf('taiLai');
    const iDangNhap = tr.nhatKy.indexOf(DoiTK.LOAI_TIN.DANG_NHAP);
    assert.ok(iDangNhap >= 0, 'không hề thử đăng nhập');
    assert.ok(iTaiLai === -1 || iTaiLai > iDangNhap,
        'tải lại tab TRƯỚC khi đăng nhập — vô ích: ' + tr.nhatKy.join(' → '));
});

test('⭐ ở trang đăng nhập mà SAI MẬT KHẨU → vẫn báo đúng bệnh, không nói "tab câm"', async () => {
    const tr = trinhDuyetHetPhien({ vaoDuoc: false });
    const bo = DoiTK.taoBoDoiTaiKhoan({ ...tr.boi, ...NHANH });
    const kq = await bo.doiSang(7, {
        maKH: 'PA', tenDangNhap: 'pa@x', matKhau: 'sai', maCuaHangMongDoi: CH_PA,
    });
    assert.strictEqual(kq.ok, false);
    assert.notStrictEqual(kq.ma, DoiTK.MA.TAB_CAM, 'vẫn đổ cho "tab câm"');
    assert.strictEqual(kq.ma, DoiTK.MA.DANG_NHAP_LOI);
    assert.match(kq.thongBao, /Sai mật khẩu/, 'nuốt mất nguyên văn lý do Tendoo trả về');
});

ghiChu('— ⭐ TAB CÂM THẬT: phải nói ĐÚNG BỆNH, không "không rõ lý do" —');

/** Tab câm hoàn toàn, đứng ở địa chỉ `url`. */
function trinhDuyetCam(url) {
    return {
        nghi: async () => {},
        hanMs: 30,
        guiToiTab: async () => null,          // không ai trả lời
        dieuHuongTab: async () => {},
        doiTrang: async () => null,
        taiLaiTab: async () => {},
        layDanhTinh: async () => { throw new Error('Could not establish connection'); },
        docUrlTab: async () => url,
    };
}

test('⭐ câm ở TRANG BÁN HÀNG → bảo bấm F5 (thường do vừa tải lại extension)', async () => {
    const bo = DoiTK.taoBoDoiTaiKhoan({
        ...trinhDuyetCam('https://seller-v3.tendoo.vn/sales/pos'), ...NHANH });
    const kq = await bo.doiSang(7, { maKH: 'PA', tenDangNhap: 'x', matKhau: 'y', maCuaHangMongDoi: CH_PA });
    assert.strictEqual(kq.ma, DoiTK.MA.TAB_CAM);
    assert.match(kq.thongBao, /ĐÚNG trang bán hàng/);
    assert.match(kq.thongBao, /F5/);
    assert.match(kq.thongBao, /chưa phát hành hóa đơn nào/);
});

test('⭐ câm ở TRANG LẠ → nói rõ đang ở đâu', async () => {
    const bo = DoiTK.taoBoDoiTaiKhoan({
        ...trinhDuyetCam('https://seller-v3.tendoo.vn/settings'), ...NHANH });
    const kq = await bo.doiSang(7, { maKH: 'PA', tenDangNhap: 'x', matKhau: 'y', maCuaHangMongDoi: CH_PA });
    assert.strictEqual(kq.ma, DoiTK.MA.TAB_CAM);
    assert.match(kq.thongBao, /trang khác/);
    assert.match(kq.thongBao, /settings/, 'không nêu ra địa chỉ thật để người dùng tự đối chiếu');
});

test('⭐ KHÔNG đọc được địa chỉ (tab đã đóng) → nói đúng thế', async () => {
    const boi = trinhDuyetCam(null);
    boi.docUrlTab = async () => null;
    const bo = DoiTK.taoBoDoiTaiKhoan({ ...boi, ...NHANH });
    const kq = await bo.doiSang(7, { maKH: 'PA', tenDangNhap: 'x', matKhau: 'y', maCuaHangMongDoi: CH_PA });
    assert.strictEqual(kq.ma, DoiTK.MA.TAB_CAM);
    assert.match(kq.thongBao, /tab đã bị đóng|không đọc được địa chỉ/i);
});

test('⭐ BA tình huống ra BA câu KHÁC NHAU — không gộp thành một câu chung', async () => {
    // Đây là cả vấn đề: 2026-08-15 ba bệnh ra cùng một câu "không rõ lý do",
    // nên chủ dự án phải đi hỏi mới biết chuyện gì xảy ra.
    const cau = [];
    for (const u of ['https://id-v3.tendoo.vn/vi/signin',
                     'https://seller-v3.tendoo.vn/sales/pos',
                     'https://vidu.com/khac']) {
        const boi = trinhDuyetCam(u);
        // Ép đi tới nhánh "câm" kể cả với trang đăng nhập: bỏ docUrlTab ở bước
        // rẽ nhánh đầu bằng cách cho đăng nhập hỏng câm.
        const bo = DoiTK.taoBoDoiTaiKhoan({ ...boi, ...NHANH });
        const kq = await bo.doiSang(7, { maKH: 'PA', tenDangNhap: 'x', matKhau: 'y', maCuaHangMongDoi: CH_PA });
        cau.push(kq.thongBao);
    }
    assert.strictEqual(new Set(cau).size, 3, 'có câu trùng nhau:\n' + cau.join('\n---\n'));
});

test('KHÔNG truyền docUrlTab → vẫn chạy như cũ, không nổ', async () => {
    // Bộ đổi tài khoản còn được dùng ở chỗ khác; thiếu hàm đọc URL thì chỉ mất
    // phần chẩn bệnh, không được hỏng.
    const boi = trinhDuyetCam('https://seller-v3.tendoo.vn/sales/pos');
    delete boi.docUrlTab;
    const bo = DoiTK.taoBoDoiTaiKhoan({ ...boi, ...NHANH });
    const kq = await bo.doiSang(7, { maKH: 'PA', tenDangNhap: 'x', matKhau: 'y', maCuaHangMongDoi: CH_PA });
    assert.strictEqual(kq.ma, DoiTK.MA.TAB_CAM);
    assert.match(kq.thongBao, /F5/);
});

test('⭐ background.js CÓ truyền docUrlTab xuống', () => {
    const fs = require('fs');
    const path = require('path');
    const ma = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
    const than = ma.slice(ma.indexOf('taoBoDoiTaiKhoan({'), ma.indexOf('return async function truocMoiKhach'));
    assert.match(than, /docUrlTab:/, 'nền không truyền docUrlTab — mất hết phần chẩn bệnh');
    assert.match(than, /chrome\.tabs\.get/);
});

chay('ĐỔI TÀI KHOẢN & KHO PHIÊN');
