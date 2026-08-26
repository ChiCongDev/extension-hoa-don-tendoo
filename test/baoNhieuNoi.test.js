'use strict';

// BÁO TELEGRAM VỀ NHIỀU NƠI CÙNG LÚC — chủ dự án chốt 26/08/2026.
//
// Anh ấy thêm bot vào một nhóm rồi hỏi vì sao nhóm không nhận được gì. Câu trả
// lời: extension chỉ gửi tới ĐÚNG MỘT chat id lưu trong cài đặt. Nay ô "Chat
// id" nhận nhiều nơi, cách nhau dấu phẩy.
//
// ⚠️ CHỖ NGUY HIỂM NHẤT KHÔNG PHẢI "GỬI ĐƯỢC NHIỀU NƠI" mà là HỎNG MỘT PHẦN.
// Sổ "đã báo" đóng dấu theo mã lệnh, không theo từng nơi. Gửi được nhóm mà
// trượt chat riêng thì:
//   · giữ dấu  -> chat riêng MẤT HẲN tin đó
//   · gỡ dấu   -> nhóm nhận tin ĐÓ HAI LẦN ở lượt gửi lại cuối loạt
// Đầu tệp baoTelegram.js đã chốt "Chọn mất tin hơn là báo trùng", nên phải giữ
// dấu — và ĐỔI LẠI, phải kêu thật to, chứ im lặng là nơi trượt chết âm thầm.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require(process.env.HDT_JSDOM || 'jsdom');
const { test, ghiChu, chay } = require('./chay');
const KhaiBao = require('../popup/khaiBao');
const Kho = require('../chung/khoMatKhau');
const Tg = require('../chung/baoTelegram');
const CaiDat = require('../chung/caiDat');

const GOC = path.join(__dirname, '..');
const doc = (f) => fs.readFileSync(path.join(GOC, f), 'utf8');

const TOKEN = '123456:BI-MAT-KHONG-DUOC-LO';

/** fetch giả: ghi lại mọi lần gọi, cho phép đặt kết quả riêng cho từng chat. */
function taoFetch(theoChat = {}) {
    const cac = [];
    const f = async (url, tuyChon) => {
        const than = JSON.parse((tuyChon && tuyChon.body) || '{}');
        cac.push({ url, chat: String(than.chat_id), text: String(than.text || '') });
        const dat = theoChat[String(than.chat_id)];
        if (dat === undefined || dat === true) {
            return { ok: true, status: 200, json: async () => ({ ok: true }) };
        }
        return {
            ok: false, status: dat.status || 400,
            json: async () => ({ ok: false, description: dat.mo_ta || 'chat not found' }),
        };
    };
    f.cac = cac;
    return f;
}

const caiDat = (chatId) => ({ telegramToken: TOKEN, telegramChatId: chatId });

/** Kho giả cho sổ "đã báo". */
function taoKho() {
    let du = null;
    return { doc: async () => du, ghi: async (x) => { du = x; }, xem: () => du };
}

const dongRaHoaDon = (ma) => ({
    ma_lenh: ma, ket_qua: 'RA_HOA_DON', so_tien: 5000000,
    ten_khach_hang: 'Anh A', ma_khach_hang: 'KH1', ngay: '2026-08-26',
});

ghiChu('── Ô "Chat id" nhận danh sách ──');

test('⭐⭐ MỘT id vẫn ra ĐÚNG một id, không suy suyển', () => {
    // Cài đặt đang chạy của chủ dự án phải qua bộ chuẩn hoá mà không đổi một
    // ký tự. Sai chỗ này là cả tính năng đang chạy tắt ngóm.
    assert.strictEqual(CaiDat.chuanChatId('123456789'), '123456789');
    assert.strictEqual(CaiDat.chuanChatId('  123456789  '), '123456789');
});

test('⭐ nhiều nơi, cách nhau dấu phẩy', () => {
    assert.strictEqual(CaiDat.chuanChatId('123, -1001234567890'), '123, -1001234567890');
});

test('⭐ id NHÓM (số âm) không bị vứt', () => {
    assert.strictEqual(CaiDat.chuanChatId('-1001234567890'), '-1001234567890',
        'dấu trừ bị nuốt — mọi id nhóm thành vô nghĩa');
});

test('xuống dòng, chấm phẩy, khoảng trắng đều tách được', () => {
    assert.strictEqual(CaiDat.chuanChatId('123\n-999 ; @kenh'), '123, -999, @kenh');
});

test('bỏ trùng, giữ thứ tự', () => {
    assert.strictEqual(CaiDat.chuanChatId('123, 123, -999'), '123, -999');
});

test('⭐ rác bị bỏ hẳn, không đem đi gọi mạng', () => {
    assert.strictEqual(CaiDat.chuanChatId('123, xin chào, --5, @a, 456'), '123, 456');
});

test('trống thì trống', () => {
    assert.strictEqual(CaiDat.chuanChatId(''), '');
    assert.strictEqual(CaiDat.chuanChatId(null), '');
    assert.strictEqual(CaiDat.chuanChatId(undefined), '');
});

test('⭐ cả hai đường vào cài đặt đều đi qua bộ chuẩn hoá', () => {
    const c = CaiDat.gop({}, { telegramChatId: ' 123 , 123 , -999 ' });
    assert.strictEqual(c.telegramChatId, '123, -999', 'đường gop() không chuẩn hoá');
    const k = CaiDat.tuKho({ telegramChatId: '123,-999' });
    assert.strictEqual(k.telegramChatId, '123, -999', 'đường tuKho() không chuẩn hoá');
});

ghiChu('── Gửi tới mọi nơi ──');

test('⭐⭐ hai nơi thì gọi HAI lần, mỗi nơi một lần', async () => {
    const f = taoFetch();
    const kq = await Tg.guiTin(caiDat('111, -999'), 'xin chào', f);
    assert.strictEqual(kq.ok, true);
    assert.strictEqual(kq.soNoi, 2);
    assert.strictEqual(kq.soDat, 2);
    assert.deepStrictEqual(f.cac.map(x => x.chat), ['111', '-999'],
        'không gửi đủ hai nơi');
});

test('nội dung gửi đi GIỐNG HỆT nhau ở mọi nơi', async () => {
    const f = taoFetch();
    await Tg.guiTin(caiDat('111, -999'), 'một câu duy nhất', f);
    assert.strictEqual(f.cac[0].text, f.cac[1].text);
});

test('một nơi thì vẫn đúng một lần gọi', async () => {
    const f = taoFetch();
    const kq = await Tg.guiTin(caiDat('111'), 'x', f);
    assert.strictEqual(f.cac.length, 1);
    assert.strictEqual(kq.ok, true);
});

test('chưa khai chat id nào thì KHÔNG gọi mạng', async () => {
    const f = taoFetch();
    const kq = await Tg.guiTin(caiDat(''), 'x', f);
    assert.strictEqual(kq.ma, 'CHUA_KHAI_BAO');
    assert.strictEqual(f.cac.length, 0);
});

ghiChu('── HỎNG MỘT PHẦN: chỗ nguy hiểm nhất ──');

test('⭐⭐ gửi được một nơi -> ok, để sổ GIỮ DẤU (không báo trùng)', async () => {
    const f = taoFetch({ '111': { status: 400, mo_ta: 'chat not found' } });
    const kq = await Tg.guiTin(caiDat('111, -999'), 'x', f);
    assert.strictEqual(kq.ok, true,
        'trả ok=false thì sổ gỡ dấu, và nơi ĐÃ NHẬN sẽ nhận tin đó lần thứ hai');
    assert.strictEqual(kq.soDat, 1);
    assert.strictEqual(kq.soHong, 1);
});

test('⭐⭐ nơi hỏng KHÔNG được im lặng — phải kể tên nó ra', async () => {
    const f = taoFetch({ '111': { status: 400, mo_ta: 'chat not found' } });
    const kq = await Tg.guiTin(caiDat('111, -999'), 'x', f);
    assert.match(String(kq.thongBao || ''), /111/,
        'không nói nơi nào hỏng — người dùng không biết đường mà sửa');
    assert.ok(!/-999/.test(String(kq.thongBao || '')), 'kể nhầm cả nơi gửi được');
});

test('⭐ hỏng HẾT thì ok=false và giữ nguyên mã lý do cũ', async () => {
    const f = taoFetch({ '111': { status: 400 }, '-999': { status: 400 } });
    const kq = await Tg.guiTin(caiDat('111, -999'), 'x', f);
    assert.strictEqual(kq.ok, false);
    assert.strictEqual(kq.soDat, 0);
    assert.strictEqual(kq.ma, 'SAI_CHAT_ID',
        'mất mã lý do -> mọi câu dịch lỗi ra tiếng người đều hỏng theo');
});

test('⛔ thông báo lỗi nhiều nơi KHÔNG được chứa token', async () => {
    const f = taoFetch({ '111': { status: 401 }, '-999': { status: 403 } });
    const kq = await Tg.guiTin(caiDat('111, -999'), 'x', f);
    assert.ok(!String(kq.thongBao || '').includes(TOKEN), 'token lọt vào thông báo lỗi');
});

test('một nơi ném lỗi mạng thì nơi kia VẪN được gửi', async () => {
    const cac = [];
    const f = async (url, tuyChon) => {
        const than = JSON.parse(tuyChon.body);
        cac.push(String(than.chat_id));
        if (String(than.chat_id) === '111') throw new Error('mất mạng');
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };
    const kq = await Tg.guiTin(caiDat('111, -999'), 'x', f);
    assert.deepStrictEqual(cac, ['111', '-999'], 'một nơi ném lỗi là chặn luôn nơi sau');
    assert.strictEqual(kq.ok, true);
    assert.strictEqual(kq.soHong, 1);
});

ghiChu('── BỊ CHẶN TỐC ĐỘ (429): lỗi TẠM THỜI, không được biến thành mất tin ──');

// ⚠️ VÌ SAO KHỐI NÀY QUAN TRỌNG HƠN NÓ TRÔNG. Gửi nhiều nơi làm số lần gọi
// Telegram nhân lên, nên 429 dễ gặp hơn hẳn. Mà luật "gửi được một nơi là xong"
// GIỮ DẤU đã báo — nơi dính 429 sẽ không bao giờ được gọi lại. Một cái ngừng
// vài giây hoá thành MẤT TIN VĨNH VIỄN. Đây là lỗi do chính việc gửi nhiều nơi
// đẻ ra, không có ở bản chỉ gửi một nơi.

/** fetch giả: nơi này bị 429 đúng `soLan` lần đầu, sau đó thông. */
function fetch429(chatBiChan, soLan, choGiay = 3) {
    const dem = {};
    const cac = [];
    const f = async (url, tuyChon) => {
        const than = JSON.parse(tuyChon.body);
        const chat = String(than.chat_id);
        cac.push(chat);
        dem[chat] = (dem[chat] || 0) + 1;
        if (chat === chatBiChan && dem[chat] <= soLan) {
            return {
                ok: false, status: 429,
                json: async () => ({ ok: false, error_code: 429,
                                     description: 'Too Many Requests',
                                     parameters: { retry_after: choGiay } }),
            };
        }
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };
    f.cac = cac;
    return f;
}

test('⭐ 429 được nhận ra là lỗi RIÊNG, kèm số giây phải đợi', async () => {
    const tra = { ok: false, status: 429,
                  json: async () => ({ ok: false, error_code: 429,
                                       parameters: { retry_after: 7 } }) };
    const r = await Tg.docTraLoi(tra);
    assert.strictEqual(r.ma, 'BI_CHAN_TOC_DO',
        'gộp 429 vào nhánh lỗi chung -> không phân biệt được lỗi tạm với lỗi đứng yên');
    assert.strictEqual(r.choGiay, 7);
});

test('⭐⭐ dính 429 thì ĐỢI RỒI THỬ LẠI đúng nơi đó, không mất tin', async () => {
    const f = fetch429('-999', 1);
    const daDoi = [];
    const kq = await Tg.guiTin(caiDat('111, -999'), 'x', f, async (ms) => { daDoi.push(ms); });
    assert.strictEqual(kq.soDat, 2, 'nơi bị chặn mất hẳn tin — mà nó chỉ cần đợi vài giây');
    assert.strictEqual(kq.soHong, 0);
    assert.deepStrictEqual(f.cac, ['111', '-999', '-999'], 'không gọi lại nơi bị chặn');
    assert.deepStrictEqual(daDoi, [3000], 'không đợi đúng số giây Telegram bảo');
});

test('⭐ chặn dai dẳng thì CHỊU THUA, không thử mãi', async () => {
    const f = fetch429('-999', 99);
    const daDoi = [];
    const kq = await Tg.guiTin(caiDat('111, -999'), 'x', f, async (ms) => { daDoi.push(ms); });
    assert.strictEqual(kq.soHong, 1);
    assert.strictEqual(f.cac.filter(x => x === '-999').length, Tg.SO_LAN_THU_LAI + 1,
        'thử quá số lần đã định — treo cạnh luồng phát hành hóa đơn');
    assert.match(String(kq.thongBao || ''), /-999/);
});

test('⭐⭐ ĐỢI CÓ TRẦN — Telegram bảo đợi 999 giây thì KHÔNG đợi 999 giây', async () => {
    const f = fetch429('-999', 99, 999);
    const daDoi = [];
    await Tg.guiTin(caiDat('-999'), 'x', f, async (ms) => { daDoi.push(ms); });
    for (const ms of daDoi) {
        assert.ok(ms <= Tg.CHO_TOI_DA_GIAY * 1000,
            `đợi ${ms}ms — treo việc phụ lâu hơn cả lượt phát hành hóa đơn`);
    }
});

test('⛔ CHỈ thử lại với 429 — lỗi đứng yên thì thử lại là phí công', async () => {
    for (const ma of [401, 403, 400]) {
        const f = taoFetch({ '-999': { status: ma } });
        await Tg.guiTin(caiDat('-999'), 'x', f, async () => {});
        assert.strictEqual(f.cac.length, 1,
            `gọi lại khi gặp lỗi ${ma} — sai token/sai chat id thử mấy lần cũng thế`);
    }
});

test('429 không có retry_after thì vẫn đợi một nhịp rồi thử lại', async () => {
    const f = async (url, tuyChon) => {
        f.n = (f.n || 0) + 1;
        if (f.n === 1) {
            return { ok: false, status: 429,
                     json: async () => ({ ok: false, error_code: 429 }) };
        }
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };
    const daDoi = [];
    const kq = await Tg.guiTin(caiDat('111'), 'x', f, async (ms) => { daDoi.push(ms); });
    assert.strictEqual(kq.soDat, 1);
    assert.strictEqual(daDoi.length, 1);
    assert.ok(daDoi[0] > 0, 'thử lại tức thì -> gần như chắc chắn lại dính 429');
});

ghiChu('── Đường tự động phải nói ra hỏng một phần ──');

test('⭐⭐ baoCacDong: gửi được 1/2 nơi thì ghi hongMotPhan', async () => {
    const f = taoFetch({ '111': { status: 400, mo_ta: 'chat not found' } });
    const kq = await Tg.baoCacDong({
        cacDong: [dongRaHoaDon('L1')], caiDat: caiDat('111, -999'),
        kho: taoKho(), layFetch: f, luc: Date.now(),
    });
    assert.strictEqual(kq.daGui, 1);
    assert.strictEqual(kq.hong, 0, 'coi là hỏng hẳn thì sổ gỡ dấu -> nơi kia nhận hai lần');
    assert.strictEqual(kq.hongMotPhan, 1,
        'im lặng nuốt mất nơi trượt — cả tháng nhóm không nhận gì mà không ai biết');
    assert.match(String(kq.thongBao || ''), /111/);
});

test('gửi đủ mọi nơi thì KHÔNG có hongMotPhan', async () => {
    const kq = await Tg.baoCacDong({
        cacDong: [dongRaHoaDon('L1')], caiDat: caiDat('111, -999'),
        kho: taoKho(), layFetch: taoFetch(), luc: Date.now(),
    });
    assert.strictEqual(kq.daGui, 1);
    assert.ok(!kq.hongMotPhan, 'báo hỏng một phần trong khi mọi nơi đều nhận được');
});

test('⭐ baoLuot (tin "cả lượt KHÔNG chạy") cũng nói ra hỏng một phần', async () => {
    const f = taoFetch({ '111': { status: 400 } });
    const kq = await Tg.baoLuot({
        banGhi: { chay: false, lyDo: 'KHONG_CO_KHACH', luc: Date.now(),
                  moc: '18:30', thongBao: 'không khách nào' },
        caiDat: caiDat('111, -999'), kho: taoKho(), layFetch: f, luc: Date.now(),
    });
    assert.strictEqual(kq.daGui, 1);
    assert.strictEqual(kq.hongMotPhan, 1);
});

test('⭐ sổ "đã báo" vẫn chống trùng: cùng mã lệnh chỉ gửi một lượt', async () => {
    const kho = taoKho();
    const f = taoFetch();
    const chung = { caiDat: caiDat('111, -999'), kho, layFetch: f, luc: Date.now() };
    await Tg.baoCacDong({ cacDong: [dongRaHoaDon('L1')], ...chung });
    await Tg.baoCacDong({ cacDong: [dongRaHoaDon('L1')], ...chung });
    assert.strictEqual(f.cac.length, 2,
        'gửi lại lần hai -> mỗi nơi nhận hai tin cho cùng một hóa đơn');
});

ghiChu('── Dò chat id: cộng thêm, không thay thế ──');

// ⚠️ BA BÀI DƯỚI ĐÂY CHẠY THẬT MÀN KHAI BÁO trong jsdom, không bám chữ trong
// mã nguồn. Bản đầu tôi viết bằng cách soi chữ, và vòng gài lỗi chứng minh nó
// vô dụng: thay cả đoạn đọc ô hiện tại bằng `[]` mà test vẫn xanh, vì mấy chữ
// nó soi thì còn nguyên.
async function dungMan(chatBanDau, timThay) {
    const dom = new JSDOM('<!doctype html><div id="goc"></div>');
    const g = dom.window.document.getElementById('goc');
    let c = CaiDat.gop(null, { telegramToken: TOKEN, telegramChatId: chatBanDau });
    const guiNen = async (tin) => {
        if (tin.loai === 'hdt-hoi-cai-dat') {
            const { telegramToken, ...con } = c;
            return { ...con, telegramDaCoToken: !!telegramToken };
        }
        if (tin.loai === 'hdt-dat-cai-dat') { c = CaiDat.gop(c, tin); return { ok: true, ...c }; }
        if (tin.loai === 'hdt-telegram-do-chat-id') {
            return { ok: true, chatId: timThay[timThay.length - 1].id,
                     ten: timThay[timThay.length - 1].ten, cacChat: timThay };
        }
        if (tin.loai === 'hdt-so-cho-gui-sell') return { soCho: 0 };
        return { ok: true };
    };
    const mh = KhaiBao.gan(g, { Kho, luuTru: taoLuuTruTam(), guiNen });
    await mh.nap();
    return { g, oChat: () => g.querySelector('#kbTgChatId') };
}

function taoLuuTruTam() {
    let o = null;
    return { async doc() { return o; }, async ghi(x) { o = x; } };
}

const nhip = () => new Promise(r => setTimeout(r, 0));

// ⚠️ DANH SÁCH DÒ RA CHỈ CÓ NHÓM, KHÔNG CÓ CHAT RIÊNG — và đây mới là đời
// thật: Telegram xoá các update đã đọc, nên bấm dò sau khi gõ trong nhóm thì
// getUpdates chỉ còn tin của nhóm. Bản đầu tôi cho cả '111' vào danh sách dò,
// thành ra dù mã có ghi đè sạch ô thì kết quả vẫn ra đủ hai id — test xanh mà
// không chứng minh gì. Vòng gài lỗi bắt được đúng chỗ này.
test('⭐⭐ đang có chat riêng, dò ra nhóm -> Ô GIỮ CẢ HAI', async () => {
    const { g, oChat } = await dungMan('111', [
        { id: '-1009', ten: 'Nhóm hóa đơn', nhom: true },
    ]);
    g.querySelector('#kbTgDoChatId').onclick();
    await nhip(); await nhip();
    const trongO = String(oChat().value);
    assert.match(trongO, /111/, 'GHI ĐÈ mất chat riêng — anh ấy chỉ biết lúc đêm không thấy tin');
    assert.match(trongO, /-1009/, 'không thêm được nhóm vừa dò ra');
});

test('⭐ ô đang trống thì dò ra bao nhiêu điền bấy nhiêu', async () => {
    const { g, oChat } = await dungMan('', [{ id: '-1009', ten: 'Nhóm', nhom: true }]);
    g.querySelector('#kbTgDoChatId').onclick();
    await nhip(); await nhip();
    assert.strictEqual(String(oChat().value), '-1009');
});

test('⭐ bấm dò HAI LẦN không làm ô đầy id lặp', async () => {
    // Đây thì danh sách dò PHẢI trùng với thứ đang có — bấm nút lần hai khi
    // Telegram vẫn trả về đúng đoạn chat cũ.
    const { g, oChat } = await dungMan('111', [{ id: '111', ten: 'Chung', nhom: false }]);
    g.querySelector('#kbTgDoChatId').onclick();
    await nhip(); await nhip();
    g.querySelector('#kbTgDoChatId').onclick();
    await nhip(); await nhip();
    assert.strictEqual(String(oChat().value), '111', 'ô thành "111, 111" — nhận tin hai lần');
});

test('⭐ popup chỉ đường lấy id NHÓM (bot không đọc được tin thường)', () => {
    const kb = doc('popup/khaiBao.js');
    // Bám ĐÚNG câu lệnh người dùng phải gõ. Bỏ nó đi là họ nhắn vào nhóm mãi mà
    // nút dò cứ im, không hiểu vì sao — đúng chỗ anh ấy đang mắc.
    assert.match(kb, /\/start@tên_bot/,
        'không nói câu lệnh phải gõ trong nhóm');
    // Phải nói ở CẢ HAI chỗ: lời dẫn và nhãn ô. Người dùng đọc chỗ nào cũng
    // phải biết ô này nhận nhiều nơi.
    assert.strictEqual((kb.match(/cách nhau dấu phẩy/g) || []).length, 2,
        'chỉ còn một chỗ nói ô nhận nhiều nơi');
});

test('⭐⭐ "Gửi thử" không được nói "✓ đã gửi" khi có nơi trượt', () => {
    const kb = doc('popup/khaiBao.js');
    const than = kb.slice(kb.indexOf('async function guiThuTelegram'));
    const doan = than.slice(0, 1400);
    assert.match(doan, /Number\(kq\.soHong\) > 0/,
        'không xét nơi hỏng — gửi được 1/2 nơi vẫn hiện dấu tích xanh');
});

test('⭐ tiến trình nền chuyển tiếp số nơi đạt/hỏng ra popup', () => {
    const nen = doc('background.js');
    const than = nen.slice(nen.indexOf("'hdt-telegram-gui-thu'"));
    assert.match(than.slice(0, 800), /soHong: kq\.soHong/,
        'nền nuốt mất số nơi hỏng -> popup không có gì để bày ra');
    const than2 = nen.slice(nen.indexOf("'hdt-telegram-do-chat-id'"));
    assert.match(than2.slice(0, 800), /cacChat/,
        'nền nuốt mất danh sách chat -> nút dò lại chỉ thấy một nơi');
});

test('⭐ màn khai báo bày HỎNG MỘT PHẦN bằng màu đỏ, như hỏng hẳn', () => {
    const kb = doc('popup/khaiBao.js');
    assert.match(kb, /Number\(lanBaoTg\.hongMotPhan\) > 0/,
        'không bày hỏng một phần -> đúng cái lỗi im lặng mà cả khối này dựng lên để tránh');
    const i = kb.indexOf('hongMotPhan');
    assert.match(kb.slice(i, i + 700), /#b91c1c/, 'bày bằng màu xanh/xám — không ai để ý');
});

ghiChu('── Không phá nếp cũ ──');

test('⭐ phiên bản đã tăng', () => {
    assert.strictEqual(JSON.parse(doc('manifest.json')).version, '2.34.0');
});

test('⭐ vẫn CHỈ báo khi hóa đơn ĐÃ RA THẬT', async () => {
    const f = taoFetch();
    const kq = await Tg.baoCacDong({
        cacDong: [{ ...dongRaHoaDon('L1'), ket_qua: 'VAO_GIO' }],
        caiDat: caiDat('111, -999'), kho: taoKho(), layFetch: f, luc: Date.now(),
    });
    assert.strictEqual(kq.daGui, 0);
    assert.strictEqual(f.cac.length, 0, 'mới bỏ vào giỏ mà đã nhắn đi hai nơi');
});

chay('BÁO TELEGRAM VỀ NHIỀU NƠI');
