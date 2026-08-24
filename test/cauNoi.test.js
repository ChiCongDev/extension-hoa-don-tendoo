'use strict';

// Test CẦU NỐI Sell ↔ Tendoo (giai đoạn 6). Không cần Chrome: mọi thứ thuộc
// trình duyệt đều được thay bằng hàm giả.

const assert = require('node:assert');
const { test, ghiChu, chay } = require('./chay');
const CauNoi = require('../chung/cauNoi');
const SoGhiDau = require('../chung/soGhiDau');
const HangDoi = require('../chung/hangDoi');

const { LY_DO } = CauNoi;

function luuTruTam() {
    let o = null;
    return { async doc() { return o ? JSON.parse(JSON.stringify(o)) : null; },
             async ghi(x) { o = x ? JSON.parse(JSON.stringify(x)) : null; } };
}

/** Dựng cầu nối với tab giả và một "tab Tendoo" trả lời theo kịch bản. */
async function dung({ coTab = true, traLoi = null, luuSo = luuTruTam(), sanSang,
                      truocMoiKhach, choMoTab = true, sanSangSauNLan = 0,
                      donGio = null } = {}) {
    const so = SoGhiDau.taoSo(luuSo);
    await so.nap();
    const hangDoi = HangDoi.taoHangDoi({
        so, khoaLuuTru: luuTruTam(), mayId: 'may-test',
        tuyChon: { nguNghi: async () => {}, ngauNhien: () => 0 },
    });
    const daGui = [];
    const daDonGio = [];
    const tab = { daMo: 0, daDong: [] };
    let lanHoi = 0;
    const cn = CauNoi.taoCauNoi({
        so, hangDoi, truocMoiKhach,
        nghi: async () => {},
        timTabTendoo: async () => (coTab ? { id: 7, url: 'https://seller-v3.tendoo.vn/sales/pos' } : null),
        moTab: choMoTab ? (async () => { tab.daMo++; return { id: 99 }; }) : undefined,
        dongTab: async (id) => { tab.daDong.push(id); },
        guiToiTab: async (tabId, tin) => {
            if (tin.loai === CauNoi.LOAI_TIN.HOI_SAN_SANG) {
                lanHoi++;
                if (lanHoi <= sanSangSauNLan) return { sanSang: false, thieu: [] };
                return sanSang === undefined
                    ? { sanSang: true, thieu: [], gioTrong: true, soDongGio: 0 }
                    : sanSang;
            }
            if (tin.loai === CauNoi.LOAI_TIN.DON_GIO) {
                daDonGio.push(tabId);
                // Mặc định: trang POS dọn được (giỏ đúng là của máy để lại).
                return donGio === null ? { ok: true, daXoa: 3, ma: 'DA_XOA_GIO_CUA_MAY',
                                           thongBao: 'Đã tự dọn 3 món máy để lại.' }
                                       : donGio;
            }
            daGui.push({ tabId, tin });
            if (typeof traLoi === 'function') return traLoi(tin.lenh, daGui.length);
            return traLoi !== null ? traLoi
                : { ok: true, ketQua: { tong: tin.lenh.soTien, lech: 0, soCai: 1, soLoai: 1 } };
        },
    });
    return { cn, so, daGui, tab, daDonGio, soLanHoi: () => lanHoi };
}

const khach = (ma, tien) => ({ maKH: ma, tenKH: ma, soTien: tien });

ghiChu('— Phải có tab Tendoo đang mở —');

test('không có tab VÀ không mở được → dừng, KHÔNG gửi lệnh nào', async () => {
    const { cn, daGui } = await dung({ coTab: false, choMoTab: false });
    const kq = await cn.taoHoaDon([khach('PA', 3000000)]);
    assert.strictEqual(kq.dung, true);
    assert.strictEqual(kq.ly_do, LY_DO.KHONG_CO_TAB);
    assert.strictEqual(daGui.length, 0, 'đã gửi lệnh dù không có tab');
});

ghiChu('— Tự mở tab, xong tự đóng —');

test('chưa có tab → TỰ MỞ, làm xong TỰ ĐÓNG', async () => {
    const { cn, daGui, tab } = await dung({ coTab: false });
    const kq = await cn.taoHoaDon([khach('PA', 1000000)]);
    assert.strictEqual(kq.dung, false, JSON.stringify(kq));
    assert.strictEqual(tab.daMo, 1, 'phải tự mở đúng một tab');
    assert.deepStrictEqual(tab.daDong, [99], 'phải tự đóng tab mình mở');
    assert.ok(daGui.every(g => g.tabId === 99), 'phải làm việc trên tab vừa mở');
});

test('⭐ ĐÃ CÓ tab của người dùng → dùng lại, TUYỆT ĐỐI KHÔNG đóng', async () => {
    const { cn, tab, daGui } = await dung({ coTab: true });
    await cn.taoHoaDon([khach('PA', 1000000)]);
    assert.strictEqual(tab.daMo, 0, 'đã mở thêm tab dù có sẵn');
    assert.deepStrictEqual(tab.daDong, [], '❌ đã đóng tab của người dùng');
    assert.ok(daGui.every(g => g.tabId === 7));
});

test('CHỈ MỘT tab cho cả loạt nhiều khách', async () => {
    const { cn, tab, daGui } = await dung({ coTab: false });
    await cn.taoHoaDon([khach('PA', 1), khach('TB', 1), khach('S3', 1)]);
    assert.strictEqual(tab.daMo, 1, 'mở nhiều tab cho một loạt');
    assert.strictEqual(tab.daDong.length, 1);
    assert.strictEqual(new Set(daGui.map(g => g.tabId)).size, 1, 'dùng nhiều tab khác nhau');
});

test('lỗi giữa chừng vẫn ĐÓNG tab mình mở, không bỏ quên', async () => {
    const { cn, tab } = await dung({
        coTab: false, traLoi: () => { throw new Error('nổ giữa chừng'); },
    });
    await cn.taoHoaDon([khach('PA', 1000000)]);
    assert.deepStrictEqual(tab.daDong, [99], 'tab bị bỏ quên khi có lỗi');
});

test('tab vừa mở cần thời gian tải → hỏi lại nhiều lần chứ không bỏ cuộc ngay', async () => {
    const { cn, tab, soLanHoi } = await dung({ coTab: false, sanSangSauNLan: 5 });
    const kq = await cn.taoHoaDon([khach('PA', 1000000)]);
    assert.strictEqual(kq.dung, false, 'bỏ cuộc quá sớm: ' + JSON.stringify(kq));
    assert.ok(soLanHoi() >= 6, 'phải hỏi lại nhiều lần khi tab đang tải');
    assert.strictEqual(tab.daDong.length, 1);
});

test('tab CÓ SẴN của người dùng mà chưa sẵn sàng → hỏi ĐÚNG MỘT lần rồi báo F5', async () => {
    const { cn, soLanHoi } = await dung({ coTab: true, sanSang: { sanSang: false, thieu: [] } });
    const kq = await cn.taoHoaDon([khach('PA', 1000000)]);
    assert.strictEqual(kq.ly_do, LY_DO.TAB_CHUA_SAN_SANG);
    assert.strictEqual(soLanHoi(), 1, 'bắt người dùng đợi vô ích trên tab cũ');
});

test('chưa chọn khách nào → báo, không làm gì', async () => {
    const { cn, daGui } = await dung();
    for (const ds of [[], null, undefined, 'PA']) {
        const kq = await cn.taoHoaDon(ds);
        assert.strictEqual(kq.dung, true);
        assert.strictEqual(kq.ly_do, 'KHONG_CO_KHACH');
    }
    assert.strictEqual(daGui.length, 0);
});

ghiChu('— Chạy tuần tự, đúng thứ tự —');

test('gửi lệnh cho TỪNG khách, đúng thứ tự, đúng tab', async () => {
    const { cn, daGui } = await dung();
    const kq = await cn.taoHoaDon([khach('PA', 1000000), khach('TB', 2000000), khach('S3', 3000000)]);
    assert.strictEqual(kq.xong.length, 3, JSON.stringify(kq.loi));
    assert.deepStrictEqual(daGui.map(g => g.tin.lenh.maKH), ['PA', 'TB', 'S3']);
    assert.ok(daGui.every(g => g.tabId === 7));
    assert.ok(daGui.every(g => g.tin.loai === CauNoi.LOAI_TIN.XU_LY_KHACH));
});

test('KHÔNG chạy song song — lượt sau phải đợi lượt trước xong', async () => {
    let dangLam = 0, viPham = 0;
    const { cn } = await dung({
        traLoi: async () => {
            dangLam++;
            if (dangLam > 1) viPham++;
            await new Promise(r => setTimeout(r, 5));
            dangLam--;
            return { ok: true, ketQua: { tong: 1 } };
        },
    });
    await cn.taoHoaDon([khach('A', 1), khach('B', 1), khach('C', 1)]);
    assert.strictEqual(viPham, 0, 'có lúc hai khách chạy chồng nhau');
});

test('đang chạy mà gọi tiếp → từ chối, không xếp chồng', async () => {
    const { cn } = await dung({
        traLoi: async () => { await new Promise(r => setTimeout(r, 30)); return { ok: true, ketQua: {} }; },
    });
    const p = cn.taoHoaDon([khach('PA', 1000000)]);
    const chen = await cn.taoHoaDon([khach('TB', 2000000)]);
    assert.strictEqual(chen.ly_do, LY_DO.DANG_CHAY);
    await p;
});

ghiChu('— Tab không trả lời —');

test('tab im lặng → coi là lỗi nghiêm trọng, KHÔNG bỏ qua', async () => {
    const { cn } = await dung({ traLoi: undefined });
    // traLoi undefined -> guiToiTab trả về mặc định; ép trả về không hợp lệ:
    const { cn: cn2, daGui } = await dung({ traLoi: () => null });
    const kq = await cn2.taoHoaDon([khach('PA', 1000000)]);
    assert.strictEqual(kq.loi.length, 1);
    assert.strictEqual(kq.loi[0].maLoi, 'TAB_KHONG_TRA_LOI');
    assert.match(kq.loi[0].thongBao, /không phản hồi/i);
    assert.strictEqual(daGui.length, 1);
    void cn;
});

test('tab trả về thứ không phải đối tượng → cũng coi là không trả lời', async () => {
    for (const xau of ['ok', 123, true]) {
        const { cn } = await dung({ traLoi: () => xau });
        const kq = await cn.taoHoaDon([khach('PA', 1000000)]);
        assert.strictEqual(kq.loi[0].maLoi, 'TAB_KHONG_TRA_LOI', String(xau));
    }
});

ghiChu('— Lỗi nghiêm trọng thì dừng cả loạt —');

test('SAI TÀI KHOẢN giữa loạt → dừng, khách sau bị bỏ', async () => {
    const { cn, daGui } = await dung({
        traLoi: (lenh) => lenh.maKH === 'TB'
            ? { ok: false, ma: 'SAI_TAI_KHOAN', thongBao: 'đang đăng nhập cửa hàng khác' }
            : { ok: true, ketQua: { tong: lenh.soTien } },
    });
    const kq = await cn.taoHoaDon([khach('PA', 1), khach('TB', 1), khach('S3', 1)]);
    assert.strictEqual(kq.dung, true);
    assert.strictEqual(kq.ly_do, 'SAI_TAI_KHOAN');
    assert.strictEqual(kq.bo, 1);
    assert.deepStrictEqual(daGui.map(g => g.tin.lenh.maKH), ['PA', 'TB'], 'đã chạy tiếp S3');
});

test('lệch quá dung sai → chỉ khách đó lỗi, loạt vẫn chạy tiếp', async () => {
    const { cn, daGui } = await dung({
        traLoi: (lenh) => lenh.maKH === 'TB'
            ? { ok: false, ma: 'LECH_QUA_200K', thongBao: 'chệnh quá' }
            : { ok: true, ketQua: { tong: lenh.soTien } },
    });
    const kq = await cn.taoHoaDon([khach('PA', 1), khach('TB', 1), khach('S3', 1)]);
    assert.strictEqual(kq.dung, false);
    assert.strictEqual(kq.xong.length, 2);
    assert.strictEqual(kq.loi.length, 1);
    assert.strictEqual(daGui.length, 3);
});

ghiChu('— Sổ ghi dấu vẫn bảo vệ ở tầng này —');

test('⭐ bị ngắt giữa chừng → lượt sau VẪN CHẠY, lệnh cũ KHÔNG tự chạy lại', async () => {
    // Chủ dự án chốt 2026-08-13: có lệnh là chạy, treo không chặn nữa.
    // Nhưng chốt còn giữ: lệnh ĐÃ TỪNG bấm Thanh toán không bao giờ tự chạy lại.
    const luuSo = luuTruTam();
    {
        const { cn } = await dung({ luuSo, traLoi: () => { throw new Error('Chrome giết tiến trình'); } });
        const kq = await cn.taoHoaDon([khach('PA', 1000000), khach('TB', 2000000)]);
        assert.strictEqual(kq.ly_do, 'NGOAI_LE');
    }
    {
        const { cn, daGui, so } = await dung({ luuSo });
        const kq = await cn.taoHoaDon([khach('S3', 3000000)]);
        assert.notStrictEqual(kq.ly_do, 'CO_LENH_TREO', 'vẫn bị chặn vì lệnh treo');
        const daXuLy = daGui.filter(g => g.tin.loai === CauNoi.LOAI_TIN.XU_LY_KHACH)
            .map(g => g.tin.lenh.maKH);
        assert.deepStrictEqual(daXuLy, ['S3'],
            'khách mới không được chạy, hoặc lệnh cũ bị tự chạy lại');
        assert.strictEqual(so.layLenhTreo().length, 0, 'treo còn đọng lại sau loạt');
    }
});

test('trạng thái báo đúng có lệnh treo hay không', async () => {
    // Sau khi chạy một loạt, treo tồn đọng đã được tự kết luận nên hết. Muốn
    // xem `trangThai()` báo có treo thì phải hỏi TRƯỚC khi chạy loạt mới.
    const luuSo = luuTruTam();
    {
        const { cn } = await dung({ luuSo, traLoi: () => { throw new Error('chết'); } });
        await cn.taoHoaDon([khach('PA', 1000000)]);
    }
    const { cn, so } = await dung({ luuSo });
    await so.quetKhiKhoiDong();                    // dấu dở dang -> treo
    const tt = cn.trangThai();
    assert.strictEqual(tt.coLenhTreo, true);
    assert.strictEqual(tt.lenhTreo.length, 1);
    assert.strictEqual(tt.lenhTreo[0].maKH, 'PA');
    assert.ok(so.coLenhTreo());

    // Và chạy loạt mới thì treo được tự dọn, không đọng lại.
    await cn.taoHoaDon([khach('TB', 1)]);
    assert.strictEqual(so.layLenhTreo().length, 0);
});

ghiChu('— Báo tiến độ ra ngoài —');

test('bắn tin tiến độ cho từng khách', async () => {
    const { cn } = await dung();
    const tin = [];
    await cn.taoHoaDon([khach('PA', 1), khach('TB', 1)], (t) => tin.push(t.loai + ':' + (t.lenh && t.lenh.maKH)));
    assert.deepStrictEqual(tin, ['bat-dau:PA', 'xong:PA', 'bat-dau:TB', 'xong:TB']);
});

ghiChu('— Tab phải SẴN SÀNG mới chạy —');

test('tab không trả lời "sẵn sàng" → nói thẳng phải F5 tab Tendoo', async () => {
    const { cn, daGui } = await dung({ sanSang: null });
    const kq = await cn.taoHoaDon([khach('PA', 1000000)]);
    assert.strictEqual(kq.dung, true);
    assert.strictEqual(kq.ly_do, CauNoi.LY_DO.TAB_CHUA_SAN_SANG);
    assert.match(kq.thongBao, /F5 TRÊN TAB TENDOO/i);
    assert.strictEqual(daGui.length, 0, 'đã gửi lệnh dù tab chưa sẵn sàng');
});

test('tab thiếu bộ phận → nói rõ thiếu cái gì', async () => {
    const { cn, daGui } = await dung({ sanSang: { sanSang: false, thieu: ['HDT_BoGio'] } });
    const kq = await cn.taoHoaDon([khach('PA', 1000000)]);
    assert.strictEqual(kq.ly_do, CauNoi.LY_DO.TAB_CHUA_SAN_SANG);
    assert.match(kq.thongBao, /HDT_BoGio/);
    assert.match(kq.thongBao, /tải lại trang Tendoo/i);
    assert.strictEqual(daGui.length, 0);
});

test('tab chưa sẵn sàng → KHÔNG xếp lệnh nào vào sổ', async () => {
    const luuSo = luuTruTam();
    const { cn, so } = await dung({ luuSo, sanSang: null });
    await cn.taoHoaDon([khach('PA', 1000000), khach('TB', 2000000)]);
    assert.strictEqual(so.danhSach().length, 0,
        'đã tạo lệnh trong sổ dù chưa gửi được — sổ sẽ đầy rác');
});

test('hỏi sẵn sàng TRƯỚC cả loạt — số lần hỏi KHÔNG tăng theo số khách', async () => {
    // ⚠️ Ý THẬT của bài này là "đừng hỏi lại cho TỪNG KHÁCH", chứ không phải
    // "đúng một lần". Bản cũ chốt cứng con số 1, nên khi thêm một cú hỏi lại để
    // xác nhận giỏ (vá 22/08/2026) nó đỏ lên vì CHÍNH BẢN VÁ — đỏ sai lý do.
    // Giờ đo đúng cái bất biến: chạy 1 khách và 5 khách phải tốn NHƯ NHAU.
    const demVoi = async (soKhach) => {
        let soLanHoi = 0;
        const so = SoGhiDau.taoSo(luuTruTam());
        await so.nap();
        const cn = CauNoi.taoCauNoi({
            so,
            hangDoi: HangDoi.taoHangDoi({ so, khoaLuuTru: luuTruTam(), mayId: 'm',
                                          tuyChon: { nguNghi: async () => {}, ngauNhien: () => 0 } }),
            nghi: async () => {},
            timTabTendoo: async () => ({ id: 7 }),
            guiToiTab: async (tabId, tin) => {
                if (tin.loai === CauNoi.LOAI_TIN.HOI_SAN_SANG) { soLanHoi++; return { sanSang: true }; }
                return { ok: true, ketQua: { tong: 1 } };
            },
        });
        await cn.taoHoaDon(Array.from({ length: soKhach }, (_, i) => khach('K' + i, 1)));
        return soLanHoi;
    };
    const it = await demVoi(1);
    const nhieu = await demVoi(5);
    assert.strictEqual(it, nhieu, `hỏi ${it} lần với 1 khách nhưng ${nhieu} lần với 5 khách`);
    assert.ok(nhieu <= 2, 'hỏi sẵn sàng quá nhiều lần cho một loạt: ' + nhieu);
});

ghiChu('— Giỏ phải trống trước khi bắt đầu —');

test('⭐ giỏ còn sót CỦA MÁY → tự dọn rồi chạy tiếp, không bắt người dùng xóa tay', async () => {
    const luuSo = luuTruTam();
    const { cn, daGui, daDonGio } = await dung({
        luuSo, sanSang: { sanSang: true, thieu: [], gioTrong: false, soDongGio: 3 },
    });
    const kq = await cn.taoHoaDon([khach('PA', 1000000), khach('TB', 2000000)]);

    assert.strictEqual(kq.dung, false, 'vẫn chặn dù đã dọn được: ' + JSON.stringify(kq));
    assert.strictEqual(daDonGio.length, 1, 'phải thử dọn đúng một lần');
    assert.strictEqual(daGui.length, 2, 'dọn xong rồi mà không chạy khách nào');
});

test('⭐ giỏ LẠ (trang POS từ chối dọn) → CHẶN NGAY, không xếp lệnh nào vào sổ', async () => {
    const luuSo = luuTruTam();
    const { cn, so, daGui } = await dung({
        luuSo, sanSang: { sanSang: true, thieu: [], gioTrong: false, soDongGio: 3 },
        donGio: { ok: false, ma: 'GIO_LA', daXoa: 0,
                  thongBao: 'Giỏ hàng trên tab Tendoo đang có 3 món KHÔNG PHẢI do máy bỏ vào.' },
    });
    const kq = await cn.taoHoaDon([khach('PA', 1000000), khach('TB', 2000000)]);

    assert.strictEqual(kq.dung, true);
    assert.strictEqual(kq.ly_do, CauNoi.LY_DO.GIO_KHONG_TRONG);
    assert.match(kq.thongBao, /KHÔNG PHẢI do máy bỏ vào/);
    assert.strictEqual(daGui.length, 0, 'đã gửi lệnh dù giỏ chưa trống');
    assert.strictEqual(so.danhSach().length, 0, 'đã tạo lệnh rác trong sổ');
});

test('dọn giỏ hỏng giữa chừng → vẫn chặn, không chạy bừa', async () => {
    const { cn, daGui } = await dung({
        sanSang: { sanSang: true, thieu: [], gioTrong: false, soDongGio: 2 },
        donGio: { ok: false, ma: 'KHONG_DON_DUOC_GIO', daXoa: 0, thongBao: 'Xóa mãi không hết giỏ' },
    });
    const kq = await cn.taoHoaDon([khach('PA', 1000000)]);
    assert.strictEqual(kq.dung, true);
    assert.strictEqual(daGui.length, 0);
});

test('giỏ ĐÃ trống sẵn → KHÔNG gửi lệnh dọn nào cho phí', async () => {
    const { cn, daDonGio } = await dung();
    await cn.taoHoaDon([khach('PA', 1000000)]);
    assert.strictEqual(daDonGio.length, 0, 'dọn giỏ trống — thừa một vòng gửi tin');
});

test('trang không báo được trạng thái giỏ → vẫn cho chạy (tầng dưới còn chặn)', async () => {
    const { cn, daGui } = await dung({
        sanSang: { sanSang: true, thieu: [], gioTrong: null },
    });
    const kq = await cn.taoHoaDon([khach('PA', 1000000)]);
    assert.strictEqual(kq.dung, false);
    assert.strictEqual(daGui.length, 1);
});


ghiChu('— ⭐⭐⭐ ĐỌC GIỎ MỘT LẦN LÀ KHÔNG ĐỦ (ca 21:20 ngày 22/08/2026) —');

/** Bộ dựng cho phép mỗi lần hỏi sẵn sàng trả lời KHÁC nhau. */
async function dungNhieuCauTraLoi(cacCauTraLoi) {
    const luuSo = luuTruTam();
    const so = SoGhiDau.taoSo(luuSo);
    await so.nap();
    const daGui = [];
    const daDonGio = [];
    const daNghi = [];
    let lan = 0;
    const cn = CauNoi.taoCauNoi({
        so,
        hangDoi: HangDoi.taoHangDoi({ so, khoaLuuTru: luuTruTam(), mayId: 'm',
                                      tuyChon: { nguNghi: async () => {}, ngauNhien: () => 0 } }),
        // ⚠️ GHI LẠI ĐỘ DÀI NHỊP. Bộ dựng thay `nghi` bằng hàm rỗng cho test
        // chạy nhanh — nhưng thế thì "có chờ" và "chờ 0ms" trông y hệt nhau, và
        // gài lỗi `cho(0)` sẽ XANH. Ghi lại thì đo được.
        nghi: async (ms) => { daNghi.push(Number(ms) || 0); },
        timTabTendoo: async () => ({ id: 7, url: 'https://seller-v3.tendoo.vn/sales/pos' }),
        guiToiTab: async (tabId, tin) => {
            if (tin.loai === CauNoi.LOAI_TIN.HOI_SAN_SANG) {
                const t = cacCauTraLoi[Math.min(lan, cacCauTraLoi.length - 1)];
                lan++;
                if (lan === 1) daNghi.length = 0;   // chỉ đo phần GIỮA hai cú hỏi
                return t;
            }
            if (tin.loai === CauNoi.LOAI_TIN.DON_GIO) {
                daDonGio.push(tabId);
                return { ok: false, ma: 'GIO_LA', daXoa: 0,
                         thongBao: 'Giỏ hàng trên tab Tendoo đang có 2 món KHÔNG PHẢI do máy bỏ vào.' };
            }
            daGui.push(tin);
            return { ok: true, ketQua: { tong: tin.lenh.soTien } };
        },
    });
    return { cn, so, daGui, daDonGio, daNghi, soLanHoi: () => lan };
}

const TRONG = { sanSang: true, thieu: [], gioTrong: true, soDongGio: 0 };
const CO_HANG = { sanSang: true, thieu: [], gioTrong: false, soDongGio: 2 };

test('⭐⭐⭐ lần đầu bảo "trống" nhưng React vẽ sau → vẫn phải CHẶN Ở TẦNG LƯỢT', async () => {
    // ⚠️ CA HỎNG THẬT 21:20 ngày 22/08/2026. Câu trả lời "sẵn sàng" chỉ đo đã
    // nạp đủ bộ phận và đúng địa chỉ — KHÔNG đo React đã vẽ xong giỏ chưa. Tab
    // vừa mở trả lời ngay khi content script chạy, lúc Tendoo chưa dựng lại đơn
    // hàng đang dở, nên giỏ trông TRỐNG. Cửa chặn không đóng, cả lượt đi tiếp,
    // rồi chết ở khách đầu tiên — sổ lệnh có thêm một dòng lỗi thừa.
    const { cn, daGui, daDonGio } = await dungNhieuCauTraLoi([TRONG, CO_HANG]);
    const kq = await cn.taoHoaDon([khach('PA', 1000000)]);
    assert.strictEqual(kq.dung, true, '⛔ không chặn — lỗi 21:20 quay lại');
    assert.strictEqual(kq.ly_do, CauNoi.LY_DO.GIO_KHONG_TRONG, JSON.stringify(kq));
    assert.strictEqual(daDonGio.length, 1, 'phải thử dọn đúng một lần rồi mới chịu thua');
    assert.strictEqual(daGui.length, 0,
        '⛔ ĐÃ GỬI LỆNH cho khách trong khi giỏ còn hàng người dùng');
});

test('⭐⭐ và KHÔNG được xếp lệnh nào vào sổ', async () => {
    // Cửa chặn sinh ra là để dừng TRƯỚC khi xếp hàng đợi. Chặn muộn thì sổ đã
    // có một dòng lỗi, và người dùng phải đọc lỗi lồng trong kết quả.
    const { cn, so } = await dungNhieuCauTraLoi([TRONG, CO_HANG]);
    await cn.taoHoaDon([khach('PA', 1000000), khach('TB', 2000000)]);
    assert.strictEqual(so.danhSach().length, 0, '⛔ sổ đã có lệnh dù cả lượt bị chặn');
});

test('⛔ nghe "CÓ HÀNG" ngay lần đầu thì KHÔNG hỏi lại cho phí', async () => {
    // Đó là câu trả lời đã đúng rồi. Hỏi thêm chỉ tốn thời gian đúng vào lúc xấu
    // nhất, mà lúc ấy người dùng đang chờ xem hỏng ở đâu.
    const { cn, soLanHoi } = await dungNhieuCauTraLoi([CO_HANG]);
    await cn.taoHoaDon([khach('PA', 1000000)]);
    assert.strictEqual(soLanHoi(), 1, 'hỏi lại thừa: ' + soLanHoi());
});

test('⭐⭐ phải CHỜ THẬT giữa hai cú hỏi — hỏi lại ngay lập tức thì vô nghĩa', async () => {
    // ⚠️ React cần thời gian để dựng lại đơn hàng đang dở. Hỏi lại NGAY thì cả
    // hai câu trả lời đều chụp cùng một khoảnh khắc chưa vẽ xong, và cú hỏi thứ
    // hai chỉ tốn công chứ không cứu được gì.
    const { cn, daNghi } = await dungNhieuCauTraLoi([TRONG, CO_HANG]);
    await cn.taoHoaDon([khach('PA', 1000000)]);
    const lauNhat = Math.max(0, ...daNghi);
    assert.ok(lauNhat >= 500,
        '⛔ không chờ đủ lâu giữa hai cú hỏi (dài nhất ' + lauNhat + 'ms)');
});

test('⛔ câu trả lời thứ hai HỎNG thì giữ câu đầu, đừng tự làm mù mình', async () => {
    // Tab tắt giữa chừng trả về rỗng. Lấy rỗng đè lên câu trả lời hợp lệ là
    // biến "đã biết giỏ trống" thành "không biết gì", rồi dừng oan cả lượt.
    const { cn, daGui } = await dungNhieuCauTraLoi([TRONG, null]);
    const kq = await cn.taoHoaDon([khach('PA', 1000000)]);
    assert.strictEqual(kq.dung, false, 'dừng oan: ' + JSON.stringify(kq));
    assert.strictEqual(daGui.length, 1);
});

ghiChu('— Báo cho trang Tendoo biết còn khách phía sau —');

test('khách CUỐI được báo là hết — để giữ giỏ cho người dùng xem', async () => {
    const { cn, daGui } = await dung();
    await cn.taoHoaDon([khach('PA', 1), khach('TB', 1), khach('S3', 1)]);
    const co = daGui.map(g => g.tin.lenh.conKhachPhiaSau);
    assert.deepStrictEqual(co, [true, true, false],
        'khách cuối phải được báo là hết, không thì giỏ bị dọn mất trước khi kiểm tra');
});

test('chạy một khách duy nhất → báo ngay là không còn ai phía sau', async () => {
    const { cn, daGui } = await dung();
    await cn.taoHoaDon([khach('PA', 1)]);
    assert.strictEqual(daGui[0].tin.lenh.conKhachPhiaSau, false);
});

test('có khách lỗi giữa chừng, khách sau vẫn được báo đúng', async () => {
    const { cn, daGui } = await dung({
        traLoi: (lenh) => lenh.maKH === 'TB'
            ? { ok: false, ma: 'LECH_QUA_200K', thongBao: 'chệnh quá' }
            : { ok: true, ketQua: { tong: 1 } },
    });
    await cn.taoHoaDon([khach('PA', 1), khach('TB', 1), khach('S3', 1)]);
    assert.deepStrictEqual(daGui.map(g => g.tin.lenh.conKhachPhiaSau), [true, true, false]);
});

ghiChu('— Móc chạy trước mỗi khách (đổi tài khoản) —');

test('móc chạy TRƯỚC, đúng một lần cho mỗi khách', async () => {
    const daGoiMoc = [];
    const { cn, daGui } = await dung({
        truocMoiKhach: async (tabId, lenh) => { daGoiMoc.push(lenh.maKH); return null; },
    });
    await cn.taoHoaDon([khach('PA', 1), khach('TB', 1)]);
    assert.deepStrictEqual(daGoiMoc, ['PA', 'TB']);
    assert.strictEqual(daGui.length, 2);
});

test('móc báo lỗi → KHÔNG gửi lệnh cho khách đó', async () => {
    const { cn, daGui } = await dung({
        truocMoiKhach: async (tabId, lenh) => (lenh.maKH === 'TB'
            ? { ok: false, ma: 'LECH_QUA_200K', thongBao: 'đổi tài khoản hỏng' } : null),
    });
    const kq = await cn.taoHoaDon([khach('PA', 1), khach('TB', 1), khach('S3', 1)]);
    assert.deepStrictEqual(daGui.map(g => g.tin.lenh.maKH), ['PA', 'S3'],
        'vẫn gửi lệnh cho khách mà móc đã báo lỗi');
    assert.strictEqual(kq.loi.length, 1);
});

test('móc báo lỗi NGHIÊM TRỌNG → dừng cả loạt', async () => {
    const { cn, daGui } = await dung({
        truocMoiKhach: async (tabId, lenh) => (lenh.maKH === 'TB'
            ? { ok: false, ma: 'SAI_TAI_KHOAN', thongBao: 'đổi tài khoản vào nhầm cửa hàng' }
            : null),
    });
    const kq = await cn.taoHoaDon([khach('PA', 1), khach('TB', 1), khach('S3', 1)]);
    assert.strictEqual(kq.dung, true);
    assert.strictEqual(kq.ly_do, 'SAI_TAI_KHOAN');
    assert.deepStrictEqual(daGui.map(g => g.tin.lenh.maKH), ['PA'], 'đã chạy tiếp sau khi dừng');
});

test('không có móc → chạy như cũ, không hỏng gì', async () => {
    const { cn, daGui } = await dung();
    const kq = await cn.taoHoaDon([khach('PA', 1), khach('TB', 1)]);
    assert.strictEqual(kq.xong.length, 2);
    assert.strictEqual(daGui.length, 2);
});

ghiChu('— Tìm tab —');

test('tìm đúng tab POS Tendoo, ưu tiên tab đang hiện', async () => {
    const tim = CauNoi.taoTimTab({
        tabs: { query: async () => ([{ id: 1, active: false }, { id: 2, active: true }]) },
    });
    assert.strictEqual((await tim()).id, 2);
});

test('không có tab nào khớp → trả null', async () => {
    const tim = CauNoi.taoTimTab({ tabs: { query: async () => [] } });
    assert.strictEqual(await tim(), null);
    const tim2 = CauNoi.taoTimTab({});
    assert.strictEqual(await tim2(), null);
});

test('chỉ tìm đúng trang bán hàng, không quét bừa mọi tab', async () => {
    let mauDaDung = null;
    const tim = CauNoi.taoTimTab({ tabs: { query: async (dk) => { mauDaDung = dk.url; return []; } } });
    await tim();
    assert.strictEqual(mauDaDung, 'https://seller-v3.tendoo.vn/sales/pos*');
});

// ── ⭐⭐ Chọn nhầm tab: nguyên nhân lượt chạy hỏng 4/4 ngày 19/08/2026 ──────
ghiChu('— ⭐⭐ KHÔNG được chọn tab giao diện MỚI —');

const tabPos = (id, active = false) =>
    ({ id, active, url: 'https://seller-v3.tendoo.vn/sales/pos' });
const tabV2 = (id, active = false) =>
    ({ id, active, url: 'https://seller-v3.tendoo.vn/sales/pos-v2' });
// ⚠ taoTimTab trả về MỘT HÀM, phải gọi nó. Quên cặp ngoặc là mọi phép kiểm
// đều nhận undefined và đỏ vì lý do sai — đã dính đúng vậy lúc viết.
const timVoi = (cac) => CauNoi.taoTimTab({ tabs: { query: async () => cac } })();

test('⭐⭐ có CẢ HAI tab → chọn tab bản CŨ, dù tab v2 đang hiện', async () => {
    // Đúng cảnh 19/08: người dùng mở pos-v2 để xem thử, máy vớ đúng tab đó rồi
    // chạy cả lượt trên giao diện mới. Không phải bốn lỗi — một tab sai.
    const t = await timVoi([tabV2(1, true), tabPos(2, false)]);
    assert.strictEqual(t.id, 2, '❌ vẫn chọn tab pos-v2');
});

test('⭐⭐ CHỈ có tab pos-v2 → trả null để tầng trên tự mở tab đúng', async () => {
    // Trả bừa tab không dùng được thì cả lượt dừng; trả null thì moTab() mở một
    // tab /sales/pos đúng chuẩn và chạy tiếp.
    assert.strictEqual(await timVoi([tabV2(1, true), tabV2(2)]), null);
});

test('chỉ có tab bản cũ → chọn nó, ưu tiên tab đang hiện', async () => {
    const t = await timVoi([tabPos(1), tabPos(2, true)]);
    assert.strictEqual(t.id, 2);
});

test('⭐ mọi biến thể pos-vN đều bị loại', async () => {
    for (const u of ['pos-v2', 'pos-v3', 'pos-v10', 'pos-moi', 'posx']) {
        const cac = [{ id: 9, active: true, url: 'https://seller-v3.tendoo.vn/sales/' + u }];
        assert.strictEqual(await timVoi(cac), null, u + ' lọt lưới');
    }
});

test('⭐ bản cũ kèm ?query hoặc #neo vẫn nhận', async () => {
    for (const u of ['/sales/pos', '/sales/pos/', '/sales/pos?a=1', '/sales/pos#x']) {
        const cac = [{ id: 5, active: true, url: 'https://seller-v3.tendoo.vn' + u }];
        const t = await timVoi(cac);
        assert.ok(t && t.id === 5, u + ' bị loại oan');
    }
});

test('tab KHÔNG đọc được url (Chrome giấu) → vẫn nhận, không loại oan', async () => {
    // Mẫu truy vấn đã lọc sẵn rồi; loại thêm ở đây là phá đường chạy cũ.
    const t = await timVoi([{ id: 7, active: true }]);
    assert.ok(t && t.id === 7);
});

test('mẫu truy vấn giữ nguyên — không siết được ở tầng Chrome', async () => {
    // tabs.query chỉ nhận mẫu đơn giản, không nói được "pos nhưng không pos-v2".
    let mau = null;
    const tim = CauNoi.taoTimTab({ tabs: { query: async (dk) => { mau = dk.url; return []; } } });
    await tim();
    assert.strictEqual(mau, 'https://seller-v3.tendoo.vn/sales/pos*');
});

chay('CẦU NỐI SELL ↔ TENDOO');
