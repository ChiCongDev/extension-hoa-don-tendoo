'use strict';

// Test cho sổ ghi dấu + hàng đợi chạy hàng loạt.
// Điểm nhấn: MÔ PHỎNG CHROME GIẾT TIẾN TRÌNH giữa chừng và chứng minh lần chạy
// sau KHÔNG tự xuất trùng hóa đơn.

const assert = require('node:assert');
const { test, ghiChu, chay } = require('./chay');
const SoGhiDau = require('../chung/soGhiDau');
const HangDoi = require('../chung/hangDoi');

const { TRANG_THAI } = SoGhiDau;

/** Ổ đĩa giả — giữ dữ liệu qua các "lần khởi động", ghi lại thứ tự thao tác. */
function taoODia() {
    let noiDung = null;
    const nhatKy = [];
    return {
        nhatKy,
        luuTru: {
            async doc() { return noiDung ? JSON.parse(JSON.stringify(noiDung)) : null; },
            async ghi(o) {
                noiDung = o ? JSON.parse(JSON.stringify(o)) : null;
                nhatKy.push('ghi:' + (o && o.lenh
                    ? o.lenh.map(l => `${l.maKH}=${l.trangThai}`).join(',') : 'khoa'));
            },
        },
        /** Nhìn thẳng vào đĩa, không qua lớp bộ nhớ — như khởi động lại máy. */
        docThang() { return noiDung; },
    };
}

function taoKhoaLuuTru() {
    let khoa = null;
    return { async doc() { return khoa; }, async ghi(o) { khoa = o; } };
}

async function dungHangDoi(oDia, tuyChon = {}) {
    const so = SoGhiDau.taoSo(oDia.luuTru, { dongHo: tuyChon.dongHo });
    await so.nap();
    const hd = HangDoi.taoHangDoi({
        so, khoaLuuTru: tuyChon.khoaLuuTru || taoKhoaLuuTru(), mayId: tuyChon.mayId || 'may-1',
        tuyChon: { nguNghi: async () => {}, ngauNhien: () => 0, ...tuyChon },
    });
    return { so, hd };
}

const OK = (tong) => async () => ({ ok: true, ketQua: { tong, lech: 0, soCai: 1, soLoai: 1 } });

// ─── SỔ GHI DẤU ─────────────────────────────────────────────────────────────
ghiChu('— Sổ ghi dấu —');

test('tạo lệnh xong là ghi xuống đĩa ngay', async () => {
    const oDia = taoODia();
    const { so } = await dungHangDoi(oDia);
    await so.taoLenh({ maKH: 'PA', tenKH: 'Phương Anh', soTien: 134040000 });
    assert.strictEqual(oDia.docThang().lenh.length, 1);
    assert.strictEqual(oDia.docThang().lenh[0].trangThai, TRANG_THAI.CHO);
});

test('số tiền hoặc mã khách hỏng → từ chối tạo lệnh', async () => {
    const { so } = await dungHangDoi(taoODia());
    await assert.rejects(() => so.taoLenh({ maKH: '', soTien: 1000 }));
    await assert.rejects(() => so.taoLenh({ maKH: 'PA', soTien: 0 }));
    await assert.rejects(() => so.taoLenh({ maKH: 'PA', soTien: -5 }));
    await assert.rejects(() => so.taoLenh({ maKH: 'PA', soTien: 'nhiều' }));
});

test('KHÔNG cho chạy lại một lệnh đã xong', async () => {
    const { so } = await dungHangDoi(taoODia());
    const l = await so.taoLenh({ maKH: 'PA', soTien: 1000000 });
    await so.danhDauDangXuLy(l.id);
    await so.danhDauXong(l.id, { tong: 1000000 });
    await assert.rejects(() => so.danhDauDangXuLy(l.id), /không được chạy lại/);
});

test('cảnh báo đã xuất cùng khách + cùng số tiền trong 12 tiếng', async () => {
    let gio = 1_000_000_000_000;
    const { so } = await dungHangDoi(taoODia(), { dongHo: () => gio });
    const l = await so.taoLenh({ maKH: 'PA', soTien: 5000000 });
    await so.danhDauDangXuLy(l.id);
    await so.danhDauXong(l.id, { tong: 5000000 });

    assert.ok(so.timLanXuatGanDay('PA', 5000000), 'phải cảnh báo trùng');
    assert.ok(!so.timLanXuatGanDay('PA', 5000001), 'khác số tiền thì không phải trùng');
    assert.ok(!so.timLanXuatGanDay('TB', 5000000), 'khác khách thì không phải trùng');

    gio += 13 * 60 * 60 * 1000;                    // 13 tiếng sau
    assert.ok(!so.timLanXuatGanDay('PA', 5000000), 'quá hạn thì thôi cảnh báo');
});

// ─── CHROME GIẾT TIẾN TRÌNH ─────────────────────────────────────────────────
ghiChu('— Chrome giết tiến trình giữa chừng —');

test('GHI DẤU XUỐNG ĐĨA TRƯỚC KHI bấm Thanh toán', async () => {
    const oDia = taoODia();
    const { so, hd } = await dungHangDoi(oDia);
    await hd.xepHang([{ maKH: 'PA', tenKH: 'Phương Anh', soTien: 1000000 }]);

    let trangThaiLucBam = null;
    await hd.chayLoat(async () => {
        // Đây là khoảnh khắc "sắp bấm Thanh toán". Nhìn thẳng vào đĩa.
        trangThaiLucBam = oDia.docThang().lenh[0].trangThai;
        return { ok: true, ketQua: { tong: 1000000 } };
    });

    assert.strictEqual(trangThaiLucBam, TRANG_THAI.DANG_XU_LY,
        'chưa ghi dấu mà đã bấm — chết giữa chừng là không biết đường lần');
});

test('bị giết ngay lúc bấm → lần sau ghi TREO rồi TỰ BỎ QUA, chạy tiếp', async () => {
    const oDia = taoODia();

    // Lần chạy 1: nổ đúng lúc đang xử lý (mô phỏng Chrome giết tiến trình).
    {
        const { hd } = await dungHangDoi(oDia);
        await hd.xepHang([{ maKH: 'PA', soTien: 1000000 }, { maKH: 'TB', soTien: 2000000 }]);
        const kq = await hd.chayLoat(async () => { throw new Error('Chrome giết tiến trình'); });
        assert.strictEqual(kq.dung, true);
        assert.strictEqual(kq.ly_do, 'NGOAI_LE');
    }
    // Dấu "đang xử lý" phải còn nguyên trên đĩa.
    assert.strictEqual(oDia.docThang().lenh[0].trangThai, TRANG_THAI.DANG_XU_LY);

    // Lần chạy 2: khởi động lại. Lệnh dở dang được ghi TREO rồi TỰ KẾT LUẬN
    // "chưa ra — cho chạy lại" (chủ dự án chốt 2026-08-13: treo không chặn nữa).
    // ⚠️ Lệnh treo KHÔNG được tự chạy lại — nó chuyển sang LỖI, không quay về
    // hàng chờ. Chỉ những lệnh CHƯA chạy mới được chạy.
    {
        const { so, hd } = await dungHangDoi(oDia);
        let daGoiThucThi = false;
        const kq = await hd.chayLoat(async () => { daGoiThucThi = true; return { ok: true }; });

        assert.strictEqual(kq.dung, false, 'vẫn dừng vì lệnh treo — đáng ra không chặn nữa');
        assert.strictEqual(kq.treoDaTuBoQua, 1, 'không tự bỏ qua lệnh treo tồn đọng');
        assert.strictEqual(so.layLenhTreo().length, 0, 'lệnh treo còn đọng lại');
        assert.strictEqual(oDia.docThang().lenh[0].trangThai, TRANG_THAI.LOI,
            'lệnh dở dang phải thành LỖI, không được tự chạy lại');
        // Khách TB đã bị BỎ ở lần chạy 1 (đường ngoại lệ), nên lần này không còn
        // gì trong hàng chờ. Điều phải đúng: KHÔNG lệnh nào tự chạy lại.
        assert.strictEqual(daGoiThucThi, false, 'TỰ CHẠY LẠI lệnh đã treo — ra hóa đơn trùng');
        // Lý do treo phải còn nguyên trong sổ, dù trạng thái đã chuyển sang LỖI:
        // đó là manh mối duy nhất để tự kiểm hóa đơn trên Tendoo.
        assert.ok(/kiểm tra tận mắt/i.test(oDia.docThang().lenh[0].thongBao),
            'mất nguyên văn lý do treo');
    }
});

test('⭐ còn lệnh treo cũng KHÔNG chặn lần chạy sau nữa', async () => {
    // Chủ dự án chốt 2026-08-13: "không cần quan tâm trùng hay không, chỉ cần
    // có lệnh chạy là chạy". Đánh đổi đã được chấp nhận: máy không biết hóa đơn
    // lần trước đã ra chưa nên có thể ra trùng.
    const oDia = taoODia();
    {
        const { hd } = await dungHangDoi(oDia);
        await hd.xepHang([{ maKH: 'PA', soTien: 1000000 }]);
        await hd.chayLoat(async () => { throw new Error('chết'); });
    }
    for (let lan = 0; lan < 3; lan++) {
        const { so, hd } = await dungHangDoi(oDia);
        await hd.xepHang([{ maKH: 'M' + lan, soTien: 500000 }]);
        let goi = 0;
        const kq = await hd.chayLoat(async () => { goi++; return { ok: true }; });
        assert.notStrictEqual(kq.ly_do, 'CO_LENH_TREO', 'vẫn bị chặn vì lệnh treo');
        assert.strictEqual(goi, 1, 'khách mới không được chạy');
        assert.strictEqual(so.layLenhTreo().length, 0, 'treo còn đọng lại sau mỗi loạt');
    }
});

test('người dùng vẫn tự kết luận được lệnh treo: ĐÃ phát hành → XONG', async () => {
    // Nút kết luận trong màn hình vẫn còn, dù máy không còn bị treo chặn.
    const oDia = taoODia();
    const { so } = await dungHangDoi(oDia);
    const l = await so.taoLenh({ maKH: 'PA', soTien: 1000000 });
    await so.danhDauDangXuLy(l.id);
    await so.danhDauTreo(l.id, 'không rõ');
    await so.xuLyLenhTreo(l.id, true);
    assert.strictEqual(so.layLenh(l.id).trangThai, TRANG_THAI.XONG);
});

test('xác nhận CHƯA phát hành → ghi lỗi, vẫn KHÔNG tự chạy lại', async () => {
    // Kết luận "chưa ra" KHÔNG đưa lệnh về hàng chờ. Đây là chốt còn giữ: máy
    // không bao giờ tự chạy lại một lệnh đã từng bấm Thanh toán.
    const oDia = taoODia();
    const { so, hd } = await dungHangDoi(oDia);
    const l = await so.taoLenh({ maKH: 'PA', soTien: 1000000 });
    await so.danhDauDangXuLy(l.id);
    await so.danhDauTreo(l.id, 'không rõ');
    await so.xuLyLenhTreo(l.id, false);
    assert.strictEqual(so.layLenh(l.id).trangThai, TRANG_THAI.LOI);
    assert.strictEqual(so.layLenh(l.id).maLoi, 'BI_NGAT');

    let goi = 0;
    await hd.chayLoat(async () => { goi++; return { ok: true }; });
    assert.strictEqual(goi, 0, 'lệnh đã kết luận mà vẫn tự chạy lại');
});

// ─── CHẠY HÀNG LOẠT ─────────────────────────────────────────────────────────
ghiChu('— Chạy hàng loạt —');

test('chạy TUẦN TỰ, đúng thứ tự xếp hàng', async () => {
    const { hd } = await dungHangDoi(taoODia());
    await hd.xepHang([
        { maKH: 'PA', soTien: 1000000 }, { maKH: 'TB', soTien: 2000000 },
        { maKH: 'S3', soTien: 3000000 },
    ]);
    const thuTu = [];
    let dangChay = 0;
    await hd.chayLoat(async (l) => {
        dangChay++;
        assert.strictEqual(dangChay, 1, 'chạy song song — sẽ đăng nhập đè lên nhau');
        thuTu.push(l.maKH);
        dangChay--;
        return { ok: true, ketQua: { tong: l.soTien } };
    });
    assert.deepStrictEqual(thuTu, ['PA', 'TB', 'S3']);
});

test('SAI TÀI KHOẢN → DỪNG CẢ LOẠT, khách sau bị bỏ chứ không chạy tiếp', async () => {
    const oDia = taoODia();
    const { so, hd } = await dungHangDoi(oDia);
    await hd.xepHang([
        { maKH: 'PA', soTien: 1000000 }, { maKH: 'TB', soTien: 2000000 },
        { maKH: 'S3', soTien: 3000000 },
    ]);
    const daChay = [];
    const kq = await hd.chayLoat(async (l) => {
        daChay.push(l.maKH);
        if (l.maKH === 'TB') {
            return { ok: false, ma: 'SAI_TAI_KHOAN', thongBao: 'Đang đăng nhập cửa hàng khác' };
        }
        return { ok: true, ketQua: { tong: l.soTien } };
    });

    assert.deepStrictEqual(daChay, ['PA', 'TB'], 'đã chạy tiếp S3 sau khi sai tài khoản!');
    assert.strictEqual(kq.dung, true);
    assert.strictEqual(kq.ly_do, 'SAI_TAI_KHOAN');
    assert.strictEqual(kq.bo, 1);
    assert.strictEqual(so.danhSach().find(l => l.maKH === 'S3').trangThai, TRANG_THAI.BO);
});

test('lệch quá dung sai → CHỈ khách đó lỗi, loạt vẫn chạy tiếp', async () => {
    const { hd } = await dungHangDoi(taoODia());
    await hd.xepHang([
        { maKH: 'PA', soTien: 1000000 }, { maKH: 'TB', soTien: 2000000 },
        { maKH: 'S3', soTien: 3000000 },
    ]);
    const kq = await hd.chayLoat(async (l) => {
        if (l.maKH === 'TB') return { ok: false, ma: 'LECH_QUA_200K', thongBao: 'chệnh quá' };
        return { ok: true, ketQua: { tong: l.soTien } };
    });
    assert.strictEqual(kq.xong.length, 2);
    assert.strictEqual(kq.loi.length, 1);
    assert.strictEqual(kq.dung, false);
});

test('KHONG_DU_HANG và CHUA_KHAI_BAO cũng chỉ lỗi riêng khách đó', async () => {
    for (const ma of ['KHONG_DU_HANG', 'CHUA_KHAI_BAO']) {
        const { hd } = await dungHangDoi(taoODia());
        await hd.xepHang([{ maKH: 'PA', soTien: 1000000 }, { maKH: 'TB', soTien: 2000000 }]);
        const kq = await hd.chayLoat(async (l) =>
            l.maKH === 'PA' ? { ok: false, ma } : { ok: true, ketQua: { tong: l.soTien } });
        assert.strictEqual(kq.dung, false, ma + ' không được làm dừng cả loạt');
        assert.strictEqual(kq.xong.length, 1);
    }
});

test('DANG_NHAP_LOI và CAPTCHA thì dừng cả loạt', async () => {
    for (const ma of ['DANG_NHAP_LOI', 'CAPTCHA']) {
        const { hd } = await dungHangDoi(taoODia());
        await hd.xepHang([{ maKH: 'PA', soTien: 1000000 }, { maKH: 'TB', soTien: 2000000 }]);
        const kq = await hd.chayLoat(async () => ({ ok: false, ma }));
        assert.strictEqual(kq.dung, true, ma + ' phải dừng cả loạt');
        assert.strictEqual(kq.bo, 1);
    }
});

test('nghỉ giữa hai khách, KHÔNG nghỉ trước khách đầu', async () => {
    const cacLanNghi = [];
    const { hd } = await dungHangDoi(taoODia(), {
        nguNghi: async (ms) => cacLanNghi.push(ms),
        ngauNhien: () => 0.5,
    });
    await hd.xepHang([{ maKH: 'A', soTien: 1 }, { maKH: 'B', soTien: 1 }, { maKH: 'C', soTien: 1 }]);
    await hd.chayLoat(OK(1));
    assert.strictEqual(cacLanNghi.length, 2, 'phải nghỉ đúng 2 lần cho 3 khách');

    // ⭐ Nghỉ giữa hai khách chỉ để đỡ dồn dập lên máy chủ Tendoo, không phải để
    // chờ việc gì. Bản cũ nghỉ 5–10 GIÂY: loạt 10 khách mất gần một phút rưỡi
    // ngồi không. Nay lấy từ chung/nhipDo.js và phải NGẮN.
    const NhipDo = require('../chung/nhipDo');
    const [min, max] = NhipDo.NGHI_GIUA_KHACH;
    assert.ok(cacLanNghi.every(ms => ms >= min && ms <= max), JSON.stringify(cacLanNghi));
    assert.ok(max <= 1000, `nghỉ tới ${max}ms giữa hai khách — quá lâu, chỉ ngồi không`);
    assert.ok(min > 0, 'phải còn một nhịp nghỉ, đừng dồn dập lên máy chủ Tendoo');
});

test('chạy tiếp phần còn lại sau khi bị ngắt (không làm lại từ đầu)', async () => {
    const oDia = taoODia();
    {
        const { hd } = await dungHangDoi(oDia);
        await hd.xepHang([{ maKH: 'A', soTien: 1 }, { maKH: 'B', soTien: 1 }, { maKH: 'C', soTien: 1 }]);
        await hd.chayLoat(async (l) =>
            l.maKH === 'B' ? { ok: false, ma: 'CAPTCHA' } : { ok: true, ketQua: { tong: 1 } });
    }
    // A xong, B lỗi, C bị bỏ. Xếp lại C rồi chạy: A không được chạy lại.
    const { so, hd } = await dungHangDoi(oDia);
    await hd.xepHang([{ maKH: 'C', soTien: 1 }]);
    const daChay = [];
    await hd.chayLoat(async (l) => { daChay.push(l.maKH); return { ok: true, ketQua: { tong: 1 } }; });
    assert.deepStrictEqual(daChay, ['C']);
    assert.strictEqual(so.danhSach().filter(l => l.maKH === 'A' && l.trangThai === TRANG_THAI.XONG).length, 1);
});

// ─── KHÓA CHỐNG CHẠY CHỒNG ──────────────────────────────────────────────────
ghiChu('— Khóa chống chạy chồng —');

test('cửa sổ khác đang giữ khóa → từ chối chạy', async () => {
    const khoaLuuTru = taoKhoaLuuTru();
    const oDia = taoODia();
    const a = await dungHangDoi(oDia, { khoaLuuTru, mayId: 'may-A' });
    await a.hd.giuKhoa();

    const b = await dungHangDoi(oDia, { khoaLuuTru, mayId: 'may-B' });
    await b.hd.xepHang([{ maKH: 'PA', soTien: 1 }]);
    let goi = false;
    const kq = await b.hd.chayLoat(async () => { goi = true; return { ok: true }; });
    assert.strictEqual(kq.ly_do, 'DANG_CHAY_CHO_KHAC');
    assert.strictEqual(goi, false);
});

test('khóa TỰ HẾT HẠN nếu tiến trình cũ chết → không kẹt vĩnh viễn', async () => {
    const khoaLuuTru = taoKhoaLuuTru();
    const oDia = taoODia();
    let gio = 1_000_000;
    const dongHo = () => gio;

    const a = await dungHangDoi(oDia, { khoaLuuTru, mayId: 'may-A', dongHo, hanKhoaMs: 60000 });
    await a.hd.giuKhoa();          // rồi "chết", không nhả khóa

    gio += 61000;                  // quá hạn khóa

    const b = await dungHangDoi(oDia, { khoaLuuTru, mayId: 'may-B', dongHo, hanKhoaMs: 60000 });
    await b.hd.xepHang([{ maKH: 'PA', soTien: 1 }]);
    const kq = await b.hd.chayLoat(OK(1));
    assert.strictEqual(kq.dung, false);
    assert.strictEqual(kq.xong.length, 1);
});

test('khóa được NHẢ kể cả khi chạy nổ giữa chừng', async () => {
    const khoaLuuTru = taoKhoaLuuTru();
    const oDia = taoODia();
    const { hd } = await dungHangDoi(oDia, { khoaLuuTru, mayId: 'may-A' });
    await hd.xepHang([{ maKH: 'PA', soTien: 1 }]);
    await hd.chayLoat(async () => { throw new Error('nổ'); });
    assert.strictEqual(await khoaLuuTru.doc(), null, 'khóa bị bỏ quên — lần sau kẹt');
});

test('chạy xong bình thường cũng nhả khóa', async () => {
    const khoaLuuTru = taoKhoaLuuTru();
    const { hd } = await dungHangDoi(taoODia(), { khoaLuuTru, mayId: 'may-A' });
    await hd.xepHang([{ maKH: 'PA', soTien: 1 }]);
    await hd.chayLoat(OK(1));
    assert.strictEqual(await khoaLuuTru.doc(), null);
});

// ─── ĐÃ BẤM MÀ KHÔNG BIẾT KẾT QUẢ ───────────────────────────────────────────
ghiChu('— KHÔNG RÕ đã phát hành hay chưa —');

const KHONG_RO = async () => ({
    ok: false, ma: 'KHONG_RO',
    thongBao: 'Đã bấm Thanh toán nhưng giỏ vẫn còn hàng — KHÔNG RÕ hóa đơn đã phát hành hay chưa.',
});

test('⭐ KHÔNG RÕ → TREO, KHÔNG phải lỗi thường', async () => {
    // Lỗi thường được phép chạy lại. Lệnh này thì tuyệt đối không: đã bấm rồi mà
    // chạy lại là ra HAI hóa đơn cho cùng một khoản tiền.
    const oDia = taoODia();
    const { so, hd } = await dungHangDoi(oDia);
    await so.taoLenh({ maKH: 'PA', tenKH: 'Phương Anh', soTien: 1676320 });
    await hd.chayLoat(KHONG_RO);

    assert.strictEqual(oDia.docThang().lenh[0].trangThai, TRANG_THAI.TREO,
        '❌ ghi thành lỗi thường — khách này sẽ được chạy lại, ra hóa đơn trùng');
    assert.strictEqual(oDia.docThang().lenh[0].maLoi, 'KHONG_RO');
});

test('⭐ KHÔNG RÕ → ghi TREO rồi CHẠY TIẾP khách sau', async () => {
    // Chủ dự án chốt 2026-08-13: có lệnh là chạy, không dừng vì không rõ nữa.
    // Khách bị không-rõ VẪN được ghi là TREO để còn xem lại trong lịch sử.
    const oDia = taoODia();
    const { so, hd } = await dungHangDoi(oDia);
    await so.taoLenh({ maKH: 'PA', tenKH: 'Phương Anh', soTien: 1676320 });
    await so.taoLenh({ maKH: 'TB', tenKH: 'Trang Bé', soTien: 1142016 });

    let daChay = 0;
    const kq = await hd.chayLoat(async () => { daChay++; return (await KHONG_RO()); });

    assert.strictEqual(daChay, 2, 'khách sau bị bỏ — đáng ra phải chạy tiếp');
    assert.strictEqual(kq.dung, false);
    assert.strictEqual(kq.bo, 0, 'không được bỏ khách nào');
    assert.ok(kq.treo && kq.treo.length >= 1, 'không ghi lại lệnh treo để xem lại');
    assert.strictEqual(oDia.docThang().lenh[1].trangThai, TRANG_THAI.TREO);
});

test('⭐ lần chạy sau KHÔNG còn bị chặn, và lệnh treo cũ được tự bỏ qua', async () => {
    const oDia = taoODia();
    const { so, hd } = await dungHangDoi(oDia);
    await so.taoLenh({ maKH: 'PA', tenKH: 'Phương Anh', soTien: 1676320 });
    await hd.chayLoat(KHONG_RO);

    // Lần chạy sau — như thể người dùng bấm lại nút.
    const { so: so2, hd: hd2 } = await dungHangDoi(oDia);
    await so2.taoLenh({ maKH: 'PA', tenKH: 'Phương Anh', soTien: 1676320 });
    let daChay = 0;
    const kq = await hd2.chayLoat(async () => { daChay++; return { ok: true, ketQua: {} }; });

    assert.strictEqual(daChay, 1, 'vẫn bị chặn — đáng ra phải chạy');
    assert.strictEqual(kq.treoDaTuBoQua, 1);
    assert.strictEqual(so2.layLenhTreo().length, 0);
});

test('kết luận "đã ra rồi" → hết chặn, lần sau chạy được', async () => {
    const oDia = taoODia();
    const { so, hd } = await dungHangDoi(oDia);
    const l = await so.taoLenh({ maKH: 'PA', tenKH: 'Phương Anh', soTien: 1676320 });
    await hd.chayLoat(KHONG_RO);
    await so.xuLyLenhTreo(l.id, true);

    const { so: so2, hd: hd2 } = await dungHangDoi(oDia);
    await so2.taoLenh({ maKH: 'TB', tenKH: 'Trang Bé', soTien: 1142016 });
    let daChay = 0;
    await hd2.chayLoat(async () => { daChay++; return { ok: true, ketQua: {} }; });
    assert.strictEqual(daChay, 1, 'gỡ xong rồi mà vẫn chặn');
});

test('lệnh treo được ghi XUỐNG ĐĨA ngay, không chỉ nằm trong bộ nhớ', async () => {
    // Chrome giết tiến trình nền ngay sau đó thì dấu vẫn phải còn.
    const oDia = taoODia();
    const { so, hd } = await dungHangDoi(oDia);
    await so.taoLenh({ maKH: 'PA', tenKH: 'Phương Anh', soTien: 1676320 });
    await hd.chayLoat(KHONG_RO);
    assert.ok(oDia.nhatKy.some(d => d.includes('PA=treo')), 'chưa ghi trạng thái treo xuống đĩa');
});

test('lỗi THƯỜNG (thiếu hàng, lệch quá dung sai) vẫn chạy tiếp như cũ', async () => {
    // Ranh giới phải rõ: những lỗi này chắc chắn CHƯA bấm gì, không được treo oan.
    for (const ma of ['LECH_QUA_DUNG_SAI', 'KHONG_DU_HANG', 'CHUA_KHAI_BAO']) {
        const oDia = taoODia();
        const { so, hd } = await dungHangDoi(oDia);
        await so.taoLenh({ maKH: 'PA', tenKH: 'A', soTien: 1 });
        await so.taoLenh({ maKH: 'TB', tenKH: 'B', soTien: 2 });
        let daChay = 0;
        await hd.chayLoat(async () => { daChay++; return { ok: false, ma, thongBao: 'x' }; });
        assert.strictEqual(daChay, 2, `lỗi ${ma} bị treo oan, không chạy tiếp`);
        assert.strictEqual(oDia.docThang().lenh[0].trangThai, TRANG_THAI.LOI);
    }
});

test('⭐ lệnh treo vẫn GIỮ NGUYÊN VĂN lý do trong sổ, để còn xem lại', async () => {
    // Treo không chặn nữa, nhưng lý do phải còn — đó là toàn bộ manh mối để
    // biết hóa đơn nào cần tự kiểm trên Tendoo.
    const oDia = taoODia();
    const { so, hd } = await dungHangDoi(oDia);
    const l = await so.taoLenh({ maKH: 'PA', tenKH: 'Phương Anh', soTien: 1676320 });
    const kq = await hd.chayLoat(KHONG_RO);
    assert.ok(kq.treo && kq.treo.length === 1, 'không kể lệnh treo ra ngoài');
    assert.match(so.layLenh(l.id).thongBao, /KHÔNG RÕ/i);
    assert.strictEqual(so.layLenh(l.id).trangThai, TRANG_THAI.TREO);
});

ghiChu('— ⭐ Sổ phải GIỮ bằng chứng "đã phát hành" —');

test('⭐ danhDauXong GIỮ cờ daBamThanhToan', async () => {
    // Trước đây sổ chỉ giữ {tong, lech, soCai, soLoai} và VỨT ĐI cờ này. Kể từ
    // lúc đó, không ai còn phân biệt được "đã ra hóa đơn" với "mới bỏ vào giỏ" —
    // và màn hình đã báo "Xong 2 khách" trong khi chỉ có 1 hóa đơn.
    const oDia = taoODia();
    const { so } = await dungHangDoi(oDia);
    const l = await so.taoLenh({ maKH: 'PA', tenKH: 'hoa', soTien: 1676320 });
    await so.danhDauDangXuLy(l.id);
    await so.danhDauXong(l.id, { tong: 1676320, daBamThanhToan: true });

    assert.strictEqual(oDia.docThang().lenh[0].ketQua.daBamThanhToan, true,
        '❌ sổ vứt mất bằng chứng đã phát hành');
});

test('⭐ chỉ bỏ vào giỏ → sổ ghi daBamThanhToan = false kèm lý do', async () => {
    const oDia = taoODia();
    const { so } = await dungHangDoi(oDia);
    const l = await so.taoLenh({ maKH: 'TB', tenKH: 'tiền', soTien: 1142016 });
    await so.danhDauDangXuLy(l.id);
    await so.danhDauXong(l.id, { tong: 1142016, daBamThanhToan: false,
                                 chuThich: 'Công tắc tự bấm đang TẮT' });

    const bg = oDia.docThang().lenh[0].ketQua;
    assert.strictEqual(bg.daBamThanhToan, false);
    assert.match(bg.chuThich, /TẮT/);
});

test('không truyền cờ → mặc định là CHƯA phát hành', async () => {
    // Ngã về phía thận trọng: thiếu bằng chứng thì không được coi là đã ra.
    const oDia = taoODia();
    const { so } = await dungHangDoi(oDia);
    const l = await so.taoLenh({ maKH: 'PA', tenKH: 'x', soTien: 100 });
    await so.danhDauDangXuLy(l.id);
    await so.danhDauXong(l.id, { tong: 100 });
    assert.strictEqual(oDia.docThang().lenh[0].ketQua.daBamThanhToan, false);
});

test('⭐ hàng đợi chuyển nguyên cờ ra ngoài cho màn hình đếm', async () => {
    const oDia = taoODia();
    const { so, hd } = await dungHangDoi(oDia);
    await so.taoLenh({ maKH: 'PA', tenKH: 'hoa', soTien: 1676320 });
    await so.taoLenh({ maKH: 'TB', tenKH: 'tiền', soTien: 1142016 });

    const kq = await hd.chayLoat(async (lenh) => ({
        ok: true,
        ketQua: { tong: lenh.soTien, daBamThanhToan: lenh.maKH === 'PA' },
    }));

    assert.strictEqual(kq.xong.length, 2, 'cả hai đều ok');
    const daRa = kq.xong.filter(x => x.ketQua.daBamThanhToan);
    assert.strictEqual(daRa.length, 1, '❌ màn hình sẽ đếm 2 hóa đơn trong khi chỉ có 1');
    assert.strictEqual(daRa[0].maKH, 'PA');
});

chay('SỔ GHI DẤU & HÀNG ĐỢI HÀNG LOẠT');
