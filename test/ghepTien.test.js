'use strict';

// Test cho thuật toán ghép tiền. Chạy: node test/ghepTien.test.js
// Không cần thư viện ngoài.

const assert = require('node:assert');
const { test, ghiChu, chay } = require('./chay');
const { ghepSanPham, KET_QUA } = require('../chung/ghepTien');
const { LUOI_MAU: LUOI_GIA_LAP } = require('./luoiMau');

test('ghép trúng chính xác, lệch 0', () => {
    const kq = ghepSanPham({ sanPham: [
        { ma: 'A', gia: 1000000, ton: 1 }, { ma: 'B', gia: 500000, ton: 1 },
    ], soTien: 1500000 });
    assert.strictEqual(kq.ma, KET_QUA.OK);
    assert.strictEqual(kq.tong, 1500000);
    assert.strictEqual(kq.lech, 0);
});

test('lấy nhiều cái cùng một loại khi cần', () => {
    const kq = ghepSanPham({ sanPham: [{ ma: 'A', gia: 990000, ton: 5 }], soTien: 2000000 });
    assert.strictEqual(kq.ma, KET_QUA.OK);
    assert.strictEqual(kq.chon[0].soLuong, 2);
    assert.strictEqual(Math.abs(kq.lech), 20000);
});

test('KHÔNG vượt tồn kho', () => {
    const kq = ghepSanPham({ sanPham: [
        { ma: 'HIEM', gia: 990000, ton: 1 }, { ma: 'NHIEU', gia: 100000, ton: 50 },
    ], soTien: 1980000 });
    assert.strictEqual(kq.ma, KET_QUA.OK);
    const hiem = kq.chon.find(d => d.ma === 'HIEM');
    assert.ok(!hiem || hiem.soLuong <= 1, 'lấy quá tồn kho');
});

test('vét sạch kho vẫn thiếu → "không đủ hàng", KHÔNG phải lỗi lệch', () => {
    const kq = ghepSanPham({ sanPham: [{ ma: 'A', gia: 1000000, ton: 1 }], soTien: 5000000 });
    assert.strictEqual(kq.ma, KET_QUA.KHONG_DU_HANG);
});

test('đủ hàng nhưng không ghép nổi → "chệnh quá 200.000" + báo mức gần nhất', () => {
    const kq = ghepSanPham({ sanPham: [
        { ma: 'A', gia: 900000, ton: 1 }, { ma: 'B', gia: 1500000, ton: 1 },
        { ma: 'TO', gia: 5000000, ton: 1 },
    ], soTien: 2700000 });
    assert.strictEqual(kq.ma, KET_QUA.LECH_QUA_DUNG_SAI);
    assert.strictEqual(kq.tongGanNhat, 2400000);
    assert.strictEqual(kq.lechGanNhat, 300000);
});

test('đúng ngưỡng 200.000 thì VẪN được tạo (khoản đủ lớn để 5% không siết)', () => {
    // 5% của 4.000.000 = 200.000 -> dung sai thực vẫn là 200.000.
    const kq = ghepSanPham({ sanPham: [{ ma: 'A', gia: 3800000, ton: 1 }], soTien: 4000000 });
    assert.strictEqual(kq.ma, KET_QUA.OK);
    assert.strictEqual(kq.lech, -200000);
});

test('quá ngưỡng 1 đồng thì TỪ CHỐI (kho vẫn thừa hàng)', () => {
    // Kho thừa tiền (10,8 triệu) nên KHÔNG phải lỗi "không đủ hàng";
    // chỉ là không mệnh giá nào rơi vào khoảng cho phép, thiếu đúng 1 đồng.
    const kq = ghepSanPham({ sanPham: [
        { ma: 'A', gia: 1799999, ton: 1 }, { ma: 'TO', gia: 9000000, ton: 1 },
    ], soTien: 2000000, tyLeToiDa: 0 });
    assert.strictEqual(kq.ma, KET_QUA.LECH_QUA_DUNG_SAI);
    assert.strictEqual(kq.tongGanNhat, 1799999);
    assert.strictEqual(kq.lechGanNhat, 200001);
});

test('hòa lệch → ưu tiên phương án THẤP HƠN số đích', () => {
    const kq = ghepSanPham({ sanPham: [
        { ma: 'THAP', gia: 9900000, ton: 1 }, { ma: 'CAO', gia: 10100000, ton: 1 },
    ], soTien: 10000000 });
    assert.strictEqual(kq.tong, 9900000);
});

test('cùng tổng → chọn ÍT sản phẩm hơn', () => {
    const kq = ghepSanPham({ sanPham: [
        { ma: 'MOT', gia: 1000000, ton: 1 }, { ma: 'HAI', gia: 500000, ton: 2 },
    ], soTien: 1000000 });
    assert.strictEqual(kq.soCai, 1);
    assert.strictEqual(kq.chon[0].ma, 'MOT');
});

test('mã trùng nhau nhưng giá khác → xử lý theo vị trí, không gộp nhầm', () => {
    const kq = ghepSanPham({ sanPham: [
        { ma: 'X', gia: 490000, ton: 1 }, { ma: 'X', gia: 990000, ton: 1 },
    ], soTien: 1480000 });
    assert.strictEqual(kq.tong, 1480000);
    assert.strictEqual(kq.chon.length, 2);
});

test('số tiền lẻ không tròn nghìn vẫn ghép được', () => {
    const kq = ghepSanPham({ sanPham: [{ ma: 'A', gia: 990000, ton: 10 }], soTien: 4949999 });
    assert.strictEqual(kq.ma, KET_QUA.OK);
    assert.strictEqual(kq.lech, 1);
});

test('không có sản phẩm nào còn hàng', () => {
    const kq = ghepSanPham({ sanPham: [{ ma: 'A', gia: 990000, ton: 0 }], soTien: 1000000 });
    assert.strictEqual(kq.ma, KET_QUA.KHONG_CO_HANG);
});

test('danh sách sản phẩm rỗng / null không làm nổ', () => {
    assert.strictEqual(ghepSanPham({ sanPham: [], soTien: 1000 }).ma, KET_QUA.KHONG_CO_HANG);
    assert.strictEqual(ghepSanPham({ sanPham: null, soTien: 1000 }).ma, KET_QUA.KHONG_CO_HANG);
});

test('số tiền âm / bằng 0 bị từ chối', () => {
    assert.strictEqual(ghepSanPham({ sanPham: LUOI_GIA_LAP, soTien: 0 }).ma, KET_QUA.KHONG_CO_HANG);
    assert.strictEqual(ghepSanPham({ sanPham: LUOI_GIA_LAP, soTien: -5 }).ma, KET_QUA.KHONG_CO_HANG);
});

test('giá hoặc tồn kho hỏng (NaN, âm, chữ) bị loại, không làm sai kết quả', () => {
    const kq = ghepSanPham({ sanPham: [
        { ma: 'HONG1', gia: NaN, ton: 5 }, { ma: 'HONG2', gia: 500000, ton: -3 },
        { ma: 'HONG3', gia: 'abc', ton: 2 }, { ma: 'TOT', gia: 1000000, ton: 2 },
    ], soTien: 2000000 });
    assert.strictEqual(kq.ma, KET_QUA.OK);
    assert.strictEqual(kq.chon.length, 1);
    assert.strictEqual(kq.chon[0].ma, 'TOT');
});

test('CA THẬT: Phương Anh 134.040.000 — lệch 0, dưới 1 giây', () => {
    const batDau = Date.now();
    const kq = ghepSanPham({ sanPham: LUOI_GIA_LAP, soTien: 134040000 });
    const mili = Date.now() - batDau;
    assert.strictEqual(kq.ma, KET_QUA.OK);
    assert.strictEqual(kq.lech, 0);
    assert.ok(mili < 1000, `chạy quá chậm: ${mili}ms`);
    console.log(`      → ${kq.tong.toLocaleString('vi-VN')}đ · lệch ${kq.lech}đ · `
        + `${kq.chon.length} loại / ${kq.soCai} cái · ${mili}ms`);
});

test('CA THẬT: Trang Bé 115.825.000', () => {
    const kq = ghepSanPham({ sanPham: LUOI_GIA_LAP, soTien: 115825000 });
    assert.strictEqual(kq.ma, KET_QUA.OK);
    assert.ok(Math.abs(kq.lech) <= 200000);
    console.log(`      → ${kq.tong.toLocaleString('vi-VN')}đ · lệch ${kq.lech}đ · `
        + `${kq.chon.length} loại / ${kq.soCai} cái`);
});

test('CA THẬT: 300 triệu vượt tổng giá trị kho → không đủ hàng', () => {
    assert.strictEqual(ghepSanPham({ sanPham: LUOI_GIA_LAP, soTien: 300000000 }).ma,
        KET_QUA.KHONG_DU_HANG);
});

test('KẾT QUẢ ỔN ĐỊNH: chạy 2 lần cho cùng một đáp án', () => {
    const a = ghepSanPham({ sanPham: LUOI_GIA_LAP, soTien: 47000000 });
    const b = ghepSanPham({ sanPham: LUOI_GIA_LAP, soTien: 47000000 });
    assert.deepStrictEqual(a.chon, b.chon);
});

test('QUÉT RỘNG: 400 số tiền ngẫu nhiên đều cho kết quả hợp lệ', () => {
    const kho = LUOI_GIA_LAP.reduce((t, sp) => t + sp.gia * sp.ton, 0);
    for (let i = 0; i < 400; i++) {
        const soTien = Math.floor(Math.random() * kho * 1.1) + 1;
        const kq = ghepSanPham({ sanPham: LUOI_GIA_LAP, soTien });
        if (kq.ma !== KET_QUA.OK) {
            assert.ok([KET_QUA.KHONG_DU_HANG, KET_QUA.LECH_QUA_DUNG_SAI].includes(kq.ma),
                `mã lạ: ${kq.ma} với ${soTien}`);
            continue;
        }
        // Bất biến 1: tổng phải bằng đúng tổng các dòng đã chọn.
        const tong = kq.chon.reduce((t, d) => t + d.gia * d.soLuong, 0);
        assert.strictEqual(tong, kq.tong, `tổng không khớp với ${soTien}`);
        // Bất biến 2: không bao giờ lệch quá dung sai.
        assert.ok(Math.abs(kq.tong - soTien) <= 200000, `lệch quá ngưỡng với ${soTien}`);
        // Bất biến 3: không vượt tồn kho.
        kq.chon.forEach(d => {
            const ton = LUOI_GIA_LAP
                .filter(sp => sp.ma === d.ma && sp.gia === d.gia)
                .reduce((t, sp) => t + sp.ton, 0);
            assert.ok(d.soLuong <= ton, `vượt tồn kho ${d.ma} với ${soTien}`);
        });
    }
});

// --------------------------------------------------------------------------
//  ĐỐI CHỨNG BẰNG VÉT CẠN
//  Trên kho nhỏ, thử HẾT mọi tổ hợp rồi so với đáp án của thuật toán. Vét cạn
//  chậm nhưng chắc chắn đúng — nó là trọng tài. Đây là cách bắt được loại lỗi
//  mà test viết tay không nghĩ ra nổi (chính lỗi dùng trùng gói hàng).
// --------------------------------------------------------------------------
function vetCan(kho, soTien, dungSai = 200000, tyLeToiDa = 0) {
    // Trọng tài phải dùng ĐÚNG luật dung sai như thuật toán. Mặc định: chỉ trần
    // tuyệt đối 200.000, KHÔNG chặn theo tỷ lệ.
    dungSai = tyLeToiDa > 0 ? Math.min(dungSai, Math.floor(soTien * tyLeToiDa)) : dungSai;
    let tot = null;
    const duyet = (i, tong, soCai) => {
        if (i === kho.length) {
            if (soCai === 0) return;
            const lech = Math.abs(tong - soTien);
            if (lech > dungSai) return;
            if (tot === null || lech < tot.lech
                || (lech === tot.lech && tong < tot.tong)
                || (lech === tot.lech && tong === tot.tong && soCai < tot.soCai)) {
                tot = { tong, lech, soCai };
            }
            return;
        }
        for (let k = 0; k <= kho[i].ton; k++) {
            duyet(i + 1, tong + k * kho[i].gia, soCai + k);
        }
    };
    duyet(0, 0, 0);
    return tot;
}

test('ĐỐI CHỨNG: 300 ca ngẫu nhiên khớp đúng kết quả vét cạn', () => {
    let soCaSo = 0;
    for (let lan = 0; lan < 300; lan++) {
        const kho = [];
        const soLoai = 2 + Math.floor(Math.random() * 3);          // 2–4 loại
        for (let i = 0; i < soLoai; i++) {
            kho.push({
                ma: 'SP' + i,
                gia: (1 + Math.floor(Math.random() * 9)) * 100000, // 100k–900k
                ton: 1 + Math.floor(Math.random() * 3),            // 1–3 cái
            });
        }
        const soTien = (1 + Math.floor(Math.random() * 60)) * 100000;

        const thuatToan = ghepSanPham({ sanPham: kho, soTien });
        const trongTai = vetCan(kho, soTien);

        if (trongTai === null) {
            assert.notStrictEqual(thuatToan.ma, KET_QUA.OK,
                `vét cạn nói không có lời giải, thuật toán lại trả OK (${soTien})`);
            continue;
        }

        assert.strictEqual(thuatToan.ma, KET_QUA.OK,
            `vét cạn tìm được ${trongTai.tong} nhưng thuật toán trả ${thuatToan.ma} (${soTien})`);
        assert.strictEqual(thuatToan.tong, trongTai.tong,
            `tổng khác vét cạn với ${soTien}`);
        assert.strictEqual(thuatToan.soCai, trongTai.soCai,
            `số cái khác vét cạn với ${soTien}: ${thuatToan.soCai} vs ${trongTai.soCai}`);

        // Bất biến: không vượt tồn kho.
        thuatToan.chon.forEach(d => {
            const ton = kho.find(sp => sp.ma === d.ma).ton;
            assert.ok(d.soLuong <= ton, `vượt tồn ${d.ma}: ${d.soLuong}/${ton}`);
        });
        soCaSo++;
    }
    console.log(`      → so khớp ${soCaSo} ca có lời giải`);
});

test('ĐỐI CHỨNG kho vừa: số cái đúng bằng mức tối thiểu vét cạn tìm được', () => {
    const kho = [
        { ma: 'A', gia: 1450000, ton: 3 }, { ma: 'B', gia: 990000, ton: 4 },
        { ma: 'C', gia: 490000, ton: 5 },  { ma: 'D', gia: 750000, ton: 2 },
    ];
    for (const soTien of [1450000, 2440000, 4900000, 7000000, 9500000, 12000000]) {
        const tt = ghepSanPham({ sanPham: kho, soTien });
        const vc = vetCan(kho, soTien);
        if (vc === null) { assert.notStrictEqual(tt.ma, KET_QUA.OK); continue; }
        assert.strictEqual(tt.tong, vc.tong, `tổng sai với ${soTien}`);
        assert.strictEqual(tt.soCai, vc.soCai, `số cái sai với ${soTien}`);
    }
});

ghiChu('— Trần cứng 200.000, không chặn theo tỷ lệ —');

test('TRẦN LÀ 200.000 với MỌI mức tiền, không phân biệt lớn nhỏ', () => {
    // Khoản nhỏ: lệch 120.302 vẫn dưới 200.000 -> ĐƯỢC chấp nhận.
    const kho = [{ ma: 'QJTTN', gia: 490000, ton: 5 }, { ma: 'K', gia: 990000, ton: 5 }];
    const kq = ghepSanPham({ sanPham: kho, soTien: 369698 });
    assert.strictEqual(kq.ma, KET_QUA.OK);
    assert.strictEqual(kq.tong, 490000);
    assert.strictEqual(kq.lech, 120302);
});

test('vượt 200.000 dù chỉ 1 đồng thì TỪ CHỐI', () => {
    const kq = ghepSanPham({ sanPham: [
        { ma: 'A', gia: 1799999, ton: 1 }, { ma: 'TO', gia: 9000000, ton: 1 },
    ], soTien: 2000000 });
    assert.strictEqual(kq.ma, KET_QUA.LECH_QUA_DUNG_SAI);
    assert.strictEqual(kq.dungSaiThuc, 200000);
});

test('đúng 200.000 thì VẪN được tạo, ở mọi mức tiền', () => {
    for (const [gia, soTien] of [[800000, 1000000], [3800000, 4000000], [299800000, 300000000]]) {
        const kq = ghepSanPham({ sanPham: [{ ma: 'A', gia, ton: 1 }], soTien });
        assert.strictEqual(kq.ma, KET_QUA.OK, `${soTien} phải chấp nhận lệch đúng 200.000`);
        assert.strictEqual(kq.lech, -200000);
    }
});

test('báo lỗi ghi đúng ngưỡng 200.000', () => {
    const kq = ghepSanPham({ sanPham: [
        { ma: 'A', gia: 700000, ton: 1 }, { ma: 'TO', gia: 9000000, ton: 1 },
    ], soTien: 1000000 });
    assert.strictEqual(kq.ma, KET_QUA.LECH_QUA_DUNG_SAI);
    assert.strictEqual(kq.dungSaiThuc, 200000);
    assert.ok(kq.thongBao.includes('200.000'));
});

test('KHOẢN LỚN không đổi gì so với trước', () => {
    const kho = [
        { ma: 'A', gia: 990000, ton: 22 }, { ma: 'B', gia: 1450000, ton: 19 },
        { ma: 'C', gia: 890000, ton: 13 }, { ma: 'D', gia: 1100000, ton: 19 },
        { ma: 'E', gia: 790000, ton: 19 }, { ma: 'F', gia: 750000, ton: 19 },
        { ma: 'G', gia: 990000, ton: 3 },  { ma: 'H', gia: 1400000, ton: 6 },
        { ma: 'I', gia: 850000, ton: 4 },  { ma: 'K', gia: 950000, ton: 9 },
        { ma: 'L', gia: 850000, ton: 6 },  { ma: 'M', gia: 1450000, ton: 5 },
        { ma: 'N', gia: 490000, ton: 18 },
    ];
    const kq = ghepSanPham({ sanPham: kho, soTien: 134040000 });
    assert.strictEqual(kq.ma, KET_QUA.OK);
    assert.strictEqual(kq.lech, 0);
});

test('vẫn BẬT LẠI được chặn theo tỷ lệ nếu sau này cần', () => {
    const kho = [{ ma: 'QJTTN', gia: 490000, ton: 5 }, { ma: 'K', gia: 990000, ton: 5 }];
    assert.strictEqual(ghepSanPham({ sanPham: kho, soTien: 369698 }).ma, KET_QUA.OK);
    assert.strictEqual(
        ghepSanPham({ sanPham: kho, soTien: 369698, tyLeToiDa: 0.05 }).ma,
        KET_QUA.LECH_QUA_DUNG_SAI, 'bật lại 5% thì phải siết như cũ');
});

ghiChu('— Nới trần KHÔNG làm kết quả kém sát đi —');

test('ĐỐI CHỨNG 400 ca: nới trần chỉ biến TỪ CHỐI thành CHẤP NHẬN', () => {
    // Điều cần chứng minh: với mọi ca mà luật CHẶT (200.000 + 5%) đã ghép được,
    // luật RỘNG (chỉ 200.000) phải cho ra ĐÚNG cùng một kết quả — không tệ hơn
    // một đồng. Nới trần chỉ mở thêm phương án XA HƠN, mà thuật toán luôn chọn
    // phương án gần nhất.
    let daChap = 0, moiChap = 0;
    for (let lan = 0; lan < 400; lan++) {
        const kho = [];
        const soLoai = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < soLoai; i++) {
            kho.push({ ma: 'SP' + i,
                       gia: (1 + Math.floor(Math.random() * 9)) * 100000,
                       ton: 1 + Math.floor(Math.random() * 4) });
        }
        const soTien = (1 + Math.floor(Math.random() * 80)) * 100000;

        const chat = ghepSanPham({ sanPham: kho, soTien, tyLeToiDa: 0.05 });
        const rong = ghepSanPham({ sanPham: kho, soTien });

        if (chat.ma === KET_QUA.OK) {
            daChap++;
            assert.strictEqual(rong.ma, KET_QUA.OK,
                `luật rộng lại từ chối ca mà luật chặt chấp nhận (${soTien})`);
            assert.strictEqual(rong.tong, chat.tong,
                `nới trần làm đổi kết quả với ${soTien}: ${chat.tong} -> ${rong.tong}`);
            assert.strictEqual(rong.soCai, chat.soCai, `số cái đổi với ${soTien}`);
        } else if (rong.ma === KET_QUA.OK) {
            moiChap++;
            assert.ok(Math.abs(rong.lech) <= 200000, 'vượt trần 200.000');
        }
    }
    assert.ok(daChap > 0, 'không có ca nào để đối chứng');
    console.log(`      → ${daChap} ca giữ nguyên kết quả, ${moiChap} ca từ TỪ CHỐI thành CHẤP NHẬN`);
});

test('mọi kết quả OK đều lệch tối đa 200.000 — quét 300 ca ngẫu nhiên', () => {
    for (let lan = 0; lan < 300; lan++) {
        const kho = [];
        for (let i = 0; i < 2 + Math.floor(Math.random() * 4); i++) {
            kho.push({ ma: 'SP' + i,
                       gia: (1 + Math.floor(Math.random() * 15)) * 100000,
                       ton: 1 + Math.floor(Math.random() * 5) });
        }
        const soTien = (1 + Math.floor(Math.random() * 100)) * 100000 + Math.floor(Math.random() * 1000);
        const kq = ghepSanPham({ sanPham: kho, soTien });
        if (kq.ma !== KET_QUA.OK) continue;
        assert.ok(Math.abs(kq.lech) <= 200000,
            `lệch ${kq.lech} vượt trần với số tiền ${soTien}`);
    }
});

test('mọi hàng đều đắt hơn số tiền → vẫn báo được mức gần nhất là món rẻ nhất', () => {
    // Số tiền 300.000 mà món rẻ nhất đã 990.000 -> không tổ hợp nào với tới,
    // bảng tính cũng không vươn tới. Vẫn phải nói được "gần nhất là 990.000".
    const kq = ghepSanPham({ sanPham: [
        { ma: 'RE', gia: 990000, ton: 5 }, { ma: 'DAT', gia: 1400000, ton: 5 },
    ], soTien: 300000 });
    assert.strictEqual(kq.ma, KET_QUA.LECH_QUA_DUNG_SAI);
    assert.strictEqual(kq.tongGanNhat, 990000);
    assert.strictEqual(kq.lechGanNhat, 690000);
});

chay('THUẬT TOÁN GHÉP TIỀN');
