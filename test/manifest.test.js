'use strict';

// Canh manifest.json và popup.html.
// Sai một đường dẫn ở đây là Chrome bỏ qua file đó KHÔNG BÁO GÌ — extension
// chạy nửa vời, cột hiện ra nhưng bấm không ăn. Test này bắt được ngay.

const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { test, ghiChu, chay } = require('./chay');

const GOC = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(GOC, 'manifest.json'), 'utf8'));
const popupHtml = fs.readFileSync(path.join(GOC, 'popup.html'), 'utf8');
const coFile = (p) => fs.existsSync(path.join(GOC, p));

ghiChu('— Đường dẫn file —');

test('mọi file trong content_scripts đều TỒN TẠI', () => {
    for (const cs of manifest.content_scripts) {
        for (const f of cs.js) {
            assert.ok(coFile(f), `thiếu file: ${f} (khai trong matches ${cs.matches[0]})`);
        }
    }
});

test('mọi <script src> và <link> trong hai trang HTML đều tồn tại', () => {
    const khaiBaoHtml = fs.readFileSync(path.join(GOC, 'khaiBao.html'), 'utf8');
    for (const [ten, html] of [['popup.html', popupHtml], ['khaiBao.html', khaiBaoHtml]]) {
        const cac = [
            ...[...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]),
            ...[...html.matchAll(/<link[^>]+href="([^"]+)"/g)].map(m => m[1]),
        ];
        assert.ok(cac.length >= 1, `${ten} thiếu script`);
        for (const f of cac) assert.ok(coFile(f), `${ten} trỏ tới file không có: ${f}`);
    }
});

test('trang khai báo nạp ĐỦ thứ nó cần', () => {
    const html = fs.readFileSync(path.join(GOC, 'khaiBao.html'), 'utf8');
    for (const f of ['chung/khoMatKhau.js', 'popup/khaiBao.js', 'khaiBaoTrang.js']) {
        assert.ok(html.includes(f), `khaiBao.html chưa nạp ${f}`);
    }
});

test('⭐ popup KHÔNG còn nạp màn hình khai báo — chỉ một chỗ khai báo duy nhất', () => {
    // Hai chỗ cùng khai báo là sớm muộn lệch nhau, và người dùng không biết chỗ
    // nào mới là thật. Đã dời hẳn sang trang Sell thì popup phải sạch.
    assert.ok(!popupHtml.includes('popup/khaiBao.js'), 'popup vẫn nạp màn hình khai báo');
    assert.ok(!/id="khaiBao"/.test(popupHtml), 'popup vẫn còn ô chứa màn khai báo');
    assert.ok(!/type="password"/.test(popupHtml), 'popup vẫn còn ô nhập mật khẩu');
});

test('file popup được manifest trỏ tới có thật', () => {
    assert.ok(coFile(manifest.action.default_popup));
});

ghiChu('— Quyền: chỉ xin đúng thứ cần —');

test('có quyền với 3 tên miền Tendoo đã quan sát', () => {
    const q = manifest.host_permissions.join(' ');
    for (const mien of ['seller-v3.tendoo.vn', 'id-v3.tendoo.vn', 'apiv3.tendoo.vn']) {
        assert.ok(q.includes(mien), `thiếu quyền với ${mien}`);
    }
});

test('có quyền với trang báo cáo của Sell', () => {
    const q = manifest.host_permissions.join(' ');
    assert.ok(q.includes('bongtom.store'));
    assert.ok(q.includes('127.0.0.1:8000') || q.includes('localhost:8000'));
});

test('KHÔNG xin quyền rộng kiểu <all_urls> hay *://*/*', () => {
    const q = manifest.host_permissions.join(' ');
    assert.ok(!q.includes('<all_urls>'), 'xin quyền toàn bộ web — quá rộng');
    assert.ok(!/\*:\/\/\*\//.test(q), 'xin quyền toàn bộ web — quá rộng');
});

test('quyền CHỈ gồm storage, tabs, alarms — không xin thêm gì khác', () => {
    // `tabs` thêm ở giai đoạn 6 để TÌM tab Tendoo đang mở.
    // `alarms` thêm ngày 2026-08-13, CHỦ DỰ ÁN ĐÃ DUYỆT, để hẹn giờ tự chạy —
    // chọn "cách B": Chrome mở là chạy, không phải để sẵn tab Sell.
    // Danh sách này vẫn khóa: thêm quyền mới là test đỏ, buộc phải hỏi lại.
    assert.deepStrictEqual([...manifest.permissions].sort(),
                           ['alarms', 'storage', 'tabs']);
});

test('⭐ alarms KHÔNG kéo theo quyền nền chạy vô thời hạn', () => {
    // Máy tính tắt thì không có gì chạy. Đừng để ai tưởng đã xin được thứ đó.
    assert.ok(!manifest.permissions.includes('background'),
        'xin quyền "background" — không cần, và làm extension chạy ngầm mãi');
});

test('có tiến trình nền làm cầu nối hai tab', () => {
    assert.ok(manifest.background && manifest.background.service_worker,
        'thiếu tiến trình nền — nút bên Sell sẽ không gửi được lệnh đi đâu');
    assert.ok(coFile(manifest.background.service_worker));
});

test('tiến trình nền nạp đủ các bộ phận nó cần', () => {
    const ma = fs.readFileSync(path.join(GOC, manifest.background.service_worker), 'utf8');
    for (const f of ['chung/soGhiDau.js', 'chung/hangDoi.js', 'chung/cauNoi.js']) {
        assert.ok(ma.includes(f), `tiến trình nền chưa nạp ${f}`);
        assert.ok(coFile(f), `thiếu file ${f}`);
    }
});

test('trang POS nạp bộ nhận lệnh — nếu không, cầu nối gửi vào hư không', () => {
    const cs = manifest.content_scripts.find(c => c.matches.some(m => m.includes('seller-v3')));
    assert.ok(cs.js.includes('tendoo/nhanLenh.js'));
});

test('chỉ chèn code vào ĐÚNG trang cần, không rải khắp nơi', () => {
    for (const cs of manifest.content_scripts) {
        for (const m of cs.matches) {
            assert.ok(!m.includes('<all_urls>'), 'chèn vào mọi trang — quá rộng');
            // ⚠️ Danh sách TRẮNG, cố ý liệt kê từng trang một. Thêm trang mới
            // thì phải sửa đúng dòng này — đó là chủ đích: mỗi lần nới ra phải
            // là một quyết định có người nhìn, không phải chuyện lẳng lặng xảy
            // ra. Rải mã vào cả bongtom.store là đọc được mọi trang của chủ dự
            // án, kể cả những trang chẳng liên quan gì tới hóa đơn.
            assert.ok(/bao-cao-khach-hang|ke-toan-tong-hop|tendoo\.vn/.test(m),
                `match quá rộng: ${m}`);
        }
    }
});

ghiChu('— Nhất quán —');

test('trang POS Tendoo được nạp đủ bộ đọc sản phẩm + chốt chặn', () => {
    const cs = manifest.content_scripts.find(c => c.matches.some(m => m.includes('seller-v3')));
    assert.ok(cs, 'chưa khai content script cho trang POS');
    for (const f of ['tendoo/danhTinh.js', 'tendoo/docSanPham.js', 'tendoo/boNoi.js']) {
        assert.ok(cs.js.includes(f), `trang POS thiếu ${f}`);
    }
});

test('trang đăng nhập Tendoo được nạp bộ đăng nhập', () => {
    const cs = manifest.content_scripts.find(c => c.matches.some(m => m.includes('id-v3')));
    assert.ok(cs, 'chưa khai content script cho trang đăng nhập');
    assert.ok(cs.js.includes('tendoo/dangNhap.js'));
});

test('mô tả nói rõ những gì máy CHƯA làm, và đánh đổi đã chọn', () => {
    const mt = manifest.description.toUpperCase();
    assert.ok(/CHUA/.test(mt), 'mô tả không nói rõ những gì chưa làm');
    // Người cài extension phải đọc được ngay cái đánh đổi lớn nhất của bản 2.0.
    assert.ok(/KHOA MO/.test(mt), 'mô tả không nói đã bỏ khóa mở');
    assert.ok(/DOC DUOC MAT KHAU|HO SO CHROME/.test(mt),
        'mô tả không nói hậu quả của việc bỏ khóa mở');
});

test('mọi file .js trong dự án đều được dùng ở đâu đó', () => {
    const dungTrongManifest = new Set(manifest.content_scripts.flatMap(c => c.js));
    const khaiBaoHtml = fs.readFileSync(path.join(GOC, 'khaiBao.html'), 'utf8');
    const dungTrongPopup = new Set([
        ...[...popupHtml.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]),
        ...[...khaiBaoHtml.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]),
    ]);
    // ⚠️ ĐỌC THẲNG danh sách importScripts từ mã tiến trình nền, KHÔNG liệt kê
    // tay. Liệt kê tay thì thêm file mới là test đỏ oan, mà người sửa lại chỉ
    // việc thêm tên vào danh sách — phép canh thành thủ tục chép tên, không còn
    // chứng minh được gì.
    const maNen = fs.readFileSync(path.join(GOC, manifest.background.service_worker), 'utf8');
    const khoiImport = /importScripts\(([\s\S]*?)\)/.exec(maNen);
    assert.ok(khoiImport, 'không tìm thấy importScripts trong tiến trình nền');
    const napGianTiep = new Set([
        // Chỉ dùng qua require từ file khác, không nạp vào trang nào.
        'chung/dieuPhoi.js',
        ...[...khoiImport[1].matchAll(/['"]([^'"]+\.js)['"]/g)].map(m => m[1]),
    ]);
    const bo = ['test', 'node_modules', '.git'];
    const quet = (thuMuc, tienTo = '') => {
        for (const ten of fs.readdirSync(path.join(GOC, thuMuc || '.'))) {
            if (bo.includes(ten)) continue;
            const duong = path.join(GOC, thuMuc, ten);
            const tuongDoi = (tienTo + ten).replace(/\\/g, '/');
            if (fs.statSync(duong).isDirectory()) quet(path.join(thuMuc, ten), tuongDoi + '/');
            else if (ten.endsWith('.js')) {
                assert.ok(
                    dungTrongManifest.has(tuongDoi) || dungTrongPopup.has(tuongDoi)
                    || napGianTiep.has(tuongDoi) || tuongDoi === 'popup.js'
                    || tuongDoi === manifest.background.service_worker,
                    `file ${tuongDoi} không được nạp ở đâu cả — code chết hoặc quên khai`);
            }
        }
    };
    quet('');
});

ghiChu('— Tiến trình nền: tự mở / tự đóng tab —');

const maNenChung = fs.readFileSync(path.join(GOC, manifest.background.service_worker), 'utf8');

test('nền có đường TỰ MỞ tab Tendoo và TỰ ĐÓNG lại', () => {
    assert.match(maNenChung, /moTab\s*:/, 'nền chưa truyền moTab -> Sell vẫn phải tự mở tab');
    assert.match(maNenChung, /chrome\.tabs\.create/, 'nền không thật sự mở tab');
    assert.match(maNenChung, /dongTab\s*:/, 'nền chưa truyền dongTab -> tab mở ra rồi bỏ đó');
    assert.match(maNenChung, /chrome\.tabs\.remove/, 'nền không thật sự đóng tab');
});

test('tab tự mở phải là tab THẬT, nhìn thấy được (không chạy lén)', () => {
    // Chrome bóp thời gian chờ ở tab ẩn, mà POS là ứng dụng nặng -> chạy ngầm
    // rất dễ treo. Và người dùng có quyền nhìn thấy máy đang làm gì.
    const doan = maNenChung.slice(maNenChung.indexOf('chrome.tabs.create'));
    assert.match(doan.slice(0, 200), /active\s*:\s*true/, 'mở tab ẩn — dễ treo và giấu người dùng');
});

test('mở tab đúng địa chỉ POS, không tự chế đường dẫn khác', () => {
    const doan = maNenChung.slice(maNenChung.indexOf('chrome.tabs.create'), maNenChung.indexOf('chrome.tabs.create') + 200);
    assert.match(doan, /URL_POS/, 'địa chỉ tab bị viết cứng ở nơi khác — dễ lệch');
});

ghiChu('— Tiến trình nền: công tắc tự bấm Thanh toán —');

test('nền trả lời được câu hỏi công tắc và ghi được công tắc', () => {
    assert.match(maNenChung, /'hdt-hoi-cai-dat'/, 'trang Sell hỏi mà nền không trả lời');
    assert.match(maNenChung, /'hdt-dat-cai-dat'/, 'popup gạt công tắc mà nền không ghi');
});

test('⭐ nền dùng ĐÚNG khóa lưu mà trang POS đọc — sai khóa là gạt công tắc vô nghĩa', () => {
    const maPos = fs.readFileSync(path.join(GOC, 'tendoo/nhanLenh.js'), 'utf8');
    const lay = (ma) => (ma.match(/KHOA_CAI_DAT\s*=\s*'([^']+)'/) || [])[1];
    assert.ok(lay(maNenChung), 'nền không khai khóa cài đặt');
    assert.strictEqual(lay(maNenChung), lay(maPos), 'nền và trang POS lưu công tắc ở hai chỗ khác nhau');
    assert.strictEqual(lay(maNenChung), lay(fs.readFileSync(path.join(GOC, 'tendoo/bangThu.js'), 'utf8')),
        'bảng thử và nền lưu công tắc ở hai chỗ khác nhau');
});

test('⭐ nền LUÔN bắt đủ HAI LỚP: tắt lớp trên là xác nhận mất theo', () => {
    // Nếu chỉ ghi thẳng tin.daHieu thì có thể còn sót daHieu=true khi tuBam=false,
    // bật lại lớp trên là bấm luôn — không hỏi lại lần nào.
    //
    // Luật này nay nằm ở chung/caiDat.js (nền gọi sang), nên kiểm THẲNG BẰNG
    // HÀNH VI chứ không dò chữ trong mã nguồn — chắc hơn hẳn.
    const CaiDat = require('../chung/caiDat');
    assert.strictEqual(CaiDat.gop({ tuBam: true, daHieu: true },
                                  { tuBam: false, daHieu: true }).daHieu, false,
        'ghi daHieu mà không ràng với tuBam');
    assert.strictEqual(CaiDat.tuKho({ tuBam: false, daHieu: true }).daHieu, false,
        'đọc daHieu mà không ràng với tuBam');
    // Và nền phải THẬT SỰ dùng module đó, không tự chép lại một bản khác.
    assert.match(maNenChung, /HDT_CaiDat\.gop/, 'nền không dùng chung/caiDat.js để gộp');
});

test('nền đọc cài đặt hỏng thì coi như TẮT, không bao giờ mặc định BẬT', () => {
    const CaiDat = require('../chung/caiDat');
    const h = CaiDat.khiDocHong();
    for (const t of ['tuBam', 'daHieu', 'xoaGioLa', 'boQuaThue']) {
        assert.strictEqual(h[t], false, `đọc hỏng mà "${t}" không ngã về TẮT`);
    }
    assert.strictEqual(h.henGio.bat, false, 'đọc hỏng mà lịch hẹn vẫn coi như BẬT');
    assert.strictEqual(h.docDuoc, false);
    assert.match(maNenChung, /HDT_CaiDat\.khiDocHong/,
        'nền không ngã về bản khóa hết khi đọc kho hỏng');
});

test('popup và trang Sell hỏi công tắc bằng đúng tên tin nền hiểu', () => {
    for (const f of ['popup.js', 'sell/chenCot.js']) {
        assert.match(fs.readFileSync(path.join(GOC, f), 'utf8'), /'hdt-hoi-cai-dat'/,
            `${f} không hỏi trạng thái công tắc`);
    }
});

ghiChu('— Trang khai báo nhúng vào Sell —');

test('khaiBao.html được mở cho trang web nhúng — thiếu là iframe hiện ra trắng trơn', () => {
    const war = manifest.web_accessible_resources;
    assert.ok(Array.isArray(war) && war.length, 'chưa khai web_accessible_resources');
    assert.ok(war.some(k => (k.resources || []).includes('khaiBao.html')),
        'khaiBao.html chưa được mở — Chrome sẽ chặn iframe');
    assert.ok(coFile('khaiBao.html'));
});

test('⭐ CHỈ mở đúng trang html, không mở cả mã nguồn ra ngoài', () => {
    const mo = manifest.web_accessible_resources.flatMap(k => k.resources || []);
    assert.deepStrictEqual(mo, ['khaiBao.html'],
        'mở thừa tài nguyên ra web: ' + mo.join(', '));
});

test('⭐ CHỈ mở cho trang Sell, KHÔNG mở cho cả internet', () => {
    // Mở rộng là mọi website đều nhúng được trang khai báo của mình.
    for (const k of manifest.web_accessible_resources) {
        assert.ok(Array.isArray(k.matches) && k.matches.length, 'thiếu giới hạn matches');
        for (const m of k.matches) {
            assert.ok(!m.includes('<all_urls>'), 'mở cho mọi trang — quá rộng');
            assert.ok(!/^\*:\/\/\*\//.test(m), 'mở cho mọi trang — quá rộng');
            assert.ok(/bongtom\.store|127\.0\.0\.1:8000|localhost:8000/.test(m),
                `mở cho địa chỉ lạ: ${m}`);
        }
    }
});

test('nơi mở trang khai báo TRÙNG KHỚP nơi chèn cột — lệch là bấm nút không ra gì', () => {
    const cs = manifest.content_scripts.find(c => c.matches.some(m => m.includes('bao-cao-khach-hang')));
    const goc = (m) => String(m).replace(/\/bao-cao-khach-hang\*$/, '/*');
    const mo = new Set(manifest.web_accessible_resources.flatMap(k => k.matches));
    for (const m of cs.matches) {
        assert.ok(mo.has(goc(m)), `chèn cột ở ${m} nhưng không mở khaiBao.html cho nơi đó`);
    }
});

test('trang Sell được nạp bộ ô khai báo', () => {
    const cs = manifest.content_scripts.find(c => c.matches.some(m => m.includes('bao-cao-khach-hang')));
    assert.ok(cs.js.includes('sell/oKhaiBao.js'), 'thiếu sell/oKhaiBao.js — không có nút khai báo');
    assert.ok(cs.js.indexOf('sell/oKhaiBao.js') < cs.js.indexOf('sell/chenCot.js'),
        'oKhaiBao phải nạp TRƯỚC chenCot, không thì chenCot không thấy nó');
});

test('nền trả lời được câu hỏi tình trạng kho', () => {
    assert.match(maNenChung, /'hdt-tinh-trang-kho'/,
        'trang Sell hỏi tình trạng kho mà nền không trả lời — nút lúc nào cũng xám');
});

test('⭐ nền KHÔNG gửi mật khẩu / tên đăng nhập / mã cửa hàng sang trang Sell', () => {
    // Cắt đúng thân hàm tinhTrangKho rồi soi: nó chỉ được trả daKhaiBao + daMoKhoa.
    const dau = maNenChung.indexOf('async function tinhTrangKho');
    assert.ok(dau > 0, 'không tìm thấy hàm tinhTrangKho');
    const than = maNenChung.slice(dau, maNenChung.indexOf('\n}', dau));
    assert.ok(!/matKhau/.test(than), '❌ nền trả mật khẩu sang trang Sell');
    assert.ok(!/tenDangNhap/.test(than), '❌ nền trả tên đăng nhập sang trang Sell');
    assert.ok(!/maCuaHang/.test(than), '❌ nền trả mã cửa hàng sang trang Sell');
    assert.match(than, /daKhaiBao/);
    assert.match(than, /daMoKhoa/);
});

ghiChu('— Gỡ lệnh bị ngắt giữa chừng —');

test('⭐ nền có đường LIỆT KÊ và đường KẾT LUẬN lệnh treo', () => {
    // Thiếu hai đường này thì câu "Có N lệnh bị ngắt giữa chừng" là ngõ cụt:
    // người dùng không bao giờ chạy được nữa. Đã từng đúng như vậy.
    assert.match(maNenChung, /'hdt-lenh-treo'/, 'không có đường xem lệnh treo');
    assert.match(maNenChung, /'hdt-xu-ly-treo'/, 'không có đường gỡ lệnh treo');
    assert.match(maNenChung, /xuLyLenhTreo/, 'nền không gọi tới sổ ghi dấu để gỡ');
});

test('⭐ nền KHÔNG tự kết luận thay người dùng', () => {
    // Kết luận phải đi từ tin nhắn người dùng gửi lên, không được máy tự đặt.
    const dau = maNenChung.indexOf("'hdt-xu-ly-treo'");
    const doan = maNenChung.slice(dau, dau + 500);
    assert.match(doan, /!!tin\.daPhatHanh/,
        'nền tự quyết hóa đơn đã ra hay chưa — phải lấy từ người dùng');
});

test('trang Sell có mã gỡ lệnh treo và gọi đúng tên tin', () => {
    const ma = fs.readFileSync(path.join(GOC, 'sell/chenCot.js'), 'utf8');
    assert.match(ma, /'hdt-lenh-treo'/);
    assert.match(ma, /'hdt-xu-ly-treo'/);
});

ghiChu('— Đọc danh tính phải KIÊN NHẪN —');

test('⭐ nền KHÔNG hỏi danh tính một lần rồi thôi', () => {
    // Trang POS vừa mở / vừa đăng nhập cần hơn 12 giây mới trả lời được. Hỏi một
    // lần là máy tưởng đang ở cửa hàng khác rồi đăng nhập lại vô ích, hoặc tệ
    // hơn: báo "sai tài khoản" và dừng cả loạt dù khai báo hoàn toàn đúng.
    assert.match(maNenChung, /docDanhTinhKienNhan/,
        'nền vẫn đọc danh tính kiểu hỏi-một-lần');
    const dau = maNenChung.indexOf('async function truocMoiKhach');
    assert.ok(dau > 0, 'không tìm thấy móc truocMoiKhach');
    const than = maNenChung.slice(dau, maNenChung.indexOf('\n    };', dau));
    assert.match(than, /docDanhTinhKienNhan/,
        'lần đọc TRƯỚC MỖI KHÁCH vẫn hỏi một lần rồi thôi');
});

test('⭐ hàng đợi DỪNG CẢ LOẠT khi không biết đang ở cửa hàng nào', () => {
    const HangDoi = require('../chung/hangDoi');
    assert.ok(HangDoi.LOI_DUNG_CA_LOAT.has('KHONG_DOC_DUOC_DANH_TINH'),
        'chưa biết đang đứng ở đâu mà vẫn chạy tiếp — mọi bước sau đều dựa vào giả định');
    assert.ok(HangDoi.LOI_DUNG_CA_LOAT.has('SAI_TAI_KHOAN'));
});

test('⭐ hai mã KHÔNG được gộp làm một', () => {
    const DoiTK = require('../chung/doiTaiKhoan');
    assert.notStrictEqual(DoiTK.MA.KHONG_DOC_DUOC_DANH_TINH, DoiTK.MA.SAI_TAI_KHOAN);
    const ma = fs.readFileSync(path.join(GOC, 'chung/doiTaiKhoan.js'), 'utf8');
    // Câu "không đọc được" cũ nằm trong nhánh SAI_TAI_KHOAN — đó chính là chỗ
    // nói dối người dùng. Không được quay lại.
    const dau = ma.indexOf('MA.SAI_TAI_KHOAN,');
    const doan = ma.slice(dau, dau + 400);
    assert.ok(!/không đọc được/i.test(doan),
        '❌ nhánh SAI_TAI_KHOAN lại nói "không đọc được"');
});

test('hạn đợi danh tính đủ dài cho trang POS thật (≥ 20 giây)', () => {
    const DoiTK = require('../chung/doiTaiKhoan');
    assert.ok(DoiTK.HAN_DOC_DANH_TINH_MS >= 20000,
        `hạn ${DoiTK.HAN_DOC_DANH_TINH_MS}ms quá ngắn — đo thật mất hơn 12 giây`);
    assert.ok(DoiTK.NHIP_DOC_MS <= 2000, 'nhịp hỏi quá thưa');
});

ghiChu('— Phạm vi trên seller-v3 —');

test('⭐ content script phủ CẢ trang /callback, không chỉ /sales/pos', () => {
    // Sau khi đăng nhập, trình duyệt được TẢI tại
    //   https://seller-v3.tendoo.vn/callback?step=success&callback=/sales/pos
    // rồi ứng dụng tự chuyển màn sang /sales/pos mà không tải lại. Chrome chỉ
    // chèn mã lúc trang được TẢI — chỉ khai /sales/pos thì trang đó vĩnh viễn
    // không có mã của mình, hỏi gì cũng câm. Đã mất 31 lần hỏi để biết.
    const cs = manifest.content_scripts.find(c => c.matches.some(m => m.includes('seller-v3')));
    const phu = (url) => cs.matches.some(m => {
        const mau = m.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
        return new RegExp('^' + mau + '$').test(url);
    });
    assert.ok(phu('https://seller-v3.tendoo.vn/sales/pos'), 'không phủ trang bán hàng');
    assert.ok(phu('https://seller-v3.tendoo.vn/callback?step=success&callback=/sales/pos'),
        '❌ không phủ /callback — đúng lỗi đã gặp');
});

test('⭐ mở rộng CHỈ trong seller-v3, KHÔNG lan sang tên miền khác', () => {
    const cs = manifest.content_scripts.find(c => c.matches.some(m => m.includes('seller-v3')));
    for (const m of cs.matches) {
        assert.ok(m.startsWith('https://seller-v3.tendoo.vn/'), 'match lan ra ngoài: ' + m);
    }
    // Vẫn nằm trong quyền đã xin từ trước, không phải quyền mới.
    assert.ok(manifest.host_permissions.includes('https://seller-v3.tendoo.vn/*'));
});

test('⭐ mở rộng phạm vi thì phải có chốt "chỉ làm việc ở trang bán hàng"', () => {
    // Tai nghe nay nằm trên mọi trang seller-v3. Không có chốt này thì một lệnh
    // gửi nhầm lúc tab đang ở trang khác sẽ đọc một cái giỏ không tồn tại.
    const ma = fs.readFileSync(path.join(GOC, 'tendoo/nhanLenh.js'), 'utf8');
    assert.match(ma, /laTrangPos/, 'thiếu chốt kiểm tra đang ở trang bán hàng');
    assert.match(ma, /KHONG_PHAI_TRANG_POS/, 'thiếu đường từ chối lệnh khi ở trang khác');
});

test('⭐ nền có bước TẢI LẠI tab sau khi đăng nhập', () => {
    assert.match(maNenChung, /taiLaiTab/, 'nền chưa truyền bước tải lại');
    assert.match(maNenChung, /chrome\.tabs\.reload/, 'nền không thật sự tải lại tab');
});

test('⭐ nền phân biệt "tab không trả lời" với "trả lời rỗng"', () => {
    assert.match(maNenChung, /__loiGui/, 'nền vẫn nuốt lỗi gửi tin thành chuỗi rỗng');
    const dau = maNenChung.indexOf('layDanhTinhTab');
    const doan = maNenChung.slice(dau, dau + 400);
    assert.match(doan, /throw/, 'tab câm mà không ném lỗi — hai bệnh lại gộp làm một');
});

ghiChu('— Tự dọn giỏ —');

test('trang POS được nạp bộ dấu giỏ, TRƯỚC bộ nhận lệnh', () => {
    const cs = manifest.content_scripts.find(c => c.matches.some(m => m.includes('seller-v3')));
    assert.ok(cs.js.includes('chung/dauGio.js'), 'thiếu chung/dauGio.js — không nhận ra giỏ của mình');
    assert.ok(cs.js.indexOf('chung/dauGio.js') < cs.js.indexOf('tendoo/nhanLenh.js'),
        'dauGio phải nạp trước nhanLenh');
});

test('⭐ cầu nối THỬ DỌN trước khi từ chối vì giỏ chưa trống', () => {
    const ma = fs.readFileSync(path.join(GOC, 'chung/cauNoi.js'), 'utf8');
    const dau = ma.indexOf('gioTrong === false');
    assert.ok(dau > 0, 'không tìm thấy chốt giỏ chưa trống');
    const doan = ma.slice(dau, dau + 900);
    assert.match(doan, /DON_GIO/, 'thấy giỏ đầy là từ chối luôn, không thử dọn');
});

test('⭐ trang POS KHÔNG được xóa giỏ khi chưa đối chiếu dấu', () => {
    const ma = fs.readFileSync(path.join(GOC, 'tendoo/nhanLenh.js'), 'utf8');
    const dau = ma.indexOf('async function donGioConSot');
    assert.ok(dau > 0, 'không tìm thấy hàm dọn giỏ');
    const than = ma.slice(dau, ma.indexOf('\n}', dau));
    assert.match(than, /khopVoiGio/, 'dọn giỏ mà không đối chiếu dấu — xóa bừa');
    assert.match(than, /xoaGioLa/, 'không có đường cho người dùng cho phép xóa giỏ lạ');
    // Phép đối chiếu phải nằm TRƯỚC cú xóa.
    assert.ok(than.indexOf('khopVoiGio') < than.indexOf('xoaSachGio'),
        'xóa trước rồi mới đối chiếu — quá muộn');
});

test('⭐ mặc định KHÔNG được xóa giỏ lạ', () => {
    const ma = fs.readFileSync(path.join(GOC, 'tendoo/nhanLenh.js'), 'utf8');
    assert.match(ma, /xoaGioLa:\s*false/, 'đọc cài đặt hỏng mà không ngã về KHÔNG xóa');
});

ghiChu('— Bảng chặn đường —');

test('⭐ nhận diện bảng "Chưa thiết lập quản lý thuế"', () => {
    const ma = fs.readFileSync(path.join(GOC, 'tendoo/bamThanhToan.js'), 'utf8');
    assert.match(ma, /chưa thiết lập quản lý thuế/i, 'không nhận ra bảng đã gặp thật');
    assert.match(ma, /CHUA_THIET_LAP_THUE/);
});

test('⭐ chỉ bấm "Bỏ qua" khi được cho phép TƯỜNG MINH', () => {
    // Ban đầu máy tuyệt đối không bấm nút này. Từ 2026-08-12 chủ dự án quyết
    // định cho phép, vì đó là quyết định kế toán của họ. Nhưng phải có công tắc,
    // và công tắc phải so ĐÚNG BẰNG true — không nhận giá trị "gần giống".
    const ma = fs.readFileSync(path.join(GOC, 'tendoo/bamThanhToan.js'), 'utf8');
    assert.match(ma, /boQuaCanhBaoThue === true/,
        'bỏ qua mà không đòi cho phép tường minh');
    assert.match(ma, /CHU_NUT_BO_QUA/, 'không khai tên nút — dễ bấm nhầm nút khác');
    // Chốt sống còn: không bao giờ bấm nút "Thiết lập quản lý thuế".
    const than = ma.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/timNutTheoChu\([^)]*THIET_LAP/.test(than),
        '❌ có đường bấm "Thiết lập quản lý thuế"');
});


test('hai bảng quảng cáo quen thuộc được khai để khỏi báo nhầm', () => {
    const ma = fs.readFileSync(path.join(GOC, 'tendoo/bamThanhToan.js'), 'utf8');
    assert.match(ma, /CAC_BANG_QUEN_THUOC/);
    assert.match(ma, /pos bán hàng/i);
});

ghiChu('— ⭐ Đã bỏ hẳn khóa mở —');

test('⭐ KHÔNG còn bộ nhớ phiên giữ mật khẩu', () => {
    // Bộ nhớ phiên sinh ra chỉ để cầm mật khẩu đã giải mã giữa hai lần gõ khóa
    // mở. Bỏ khóa mở rồi thì nó thừa — và mỗi thứ thừa là một chỗ rò.
    assert.ok(!coFile('chung/khoPhien.js'), 'chung/khoPhien.js vẫn còn — code chết');
    assert.ok(!/khoPhien|KhoPhien/.test(maNenChung), 'nền vẫn nhắc tới kho phiên');
    assert.ok(!/hdt-nap-kho-phien|hdt-xoa-kho-phien/.test(maNenChung),
        'nền vẫn còn đường nạp/xóa kho phiên');
});

test('⭐ nền đọc mật khẩu THẲNG từ kho, không chờ ai gõ gì', () => {
    assert.match(maNenChung, /docMatKhauCua/, 'nền không có đường đọc mật khẩu từ kho');
    assert.match(maNenChung, /chung\/khoMatKhau\.js/, 'nền chưa nạp bộ kho');
});

test('⭐ mã nguồn nói THẬT về mức bảo vệ, không tự khen', () => {
    // Chìa nằm cạnh kho thì ai đọc được kho cũng đọc được chìa. Chú thích phải
    // ghi đúng như vậy, để người sau không tưởng đây là một lớp phòng thủ.
    const ma = fs.readFileSync(path.join(GOC, 'chung/khoMatKhau.js'), 'utf8');
    assert.match(ma, /CHE MẮT, KHÔNG PHẢI BẢO VỆ/i,
        'thiếu câu nói thẳng rằng đây chỉ là che mắt');
    assert.ok(!/an toàn kể cả khi máy bị sao chép/i.test(ma), 'còn câu tự khen không còn đúng');
});

test('kho mới KHÔNG còn dấu vết PBKDF2 cho việc mở hằng ngày', async () => {
    const Kho = require('../chung/khoMatKhau');
    const kho = await Kho.taoKho();
    assert.strictEqual(kho.muoi, undefined, 'kho mới vẫn còn muối của khóa mở');
    assert.strictEqual(kho.cauKiemTra, undefined, 'kho mới vẫn còn câu kiểm tra khóa mở');
    assert.ok(kho.chiaKhoa);
});

test('⭐ popup và trang khai báo KHÔNG còn ô nhập khóa mở', () => {
    const kb = fs.readFileSync(path.join(GOC, 'popup/khaiBao.js'), 'utf8');
    assert.ok(!/kbDatKhoaMo/.test(kb), 'còn màn đặt khóa mở');
    assert.ok(!/kbMoKho/.test(kb), 'còn màn mở kho');
    assert.ok(!/kbKhoaLai/.test(kb), 'còn nút khóa lại');
    assert.ok(!/kbDoiKhoaMo/.test(kb), 'còn màn đổi khóa mở');
    // Chỗ DUY NHẤT còn hỏi mật khẩu: tệp sao lưu.
    assert.match(kb, /kbMatKhauTep/, 'mất luôn mật khẩu tùy chọn cho tệp sao lưu');
});

ghiChu('— ⭐ "Xong" phải có bằng chứng —');

test('⭐ sổ ghi dấu GIỮ cờ daBamThanhToan, không vứt đi', () => {
    // Vứt đi là mất khả năng phân biệt "đã ra hóa đơn" với "mới bỏ vào giỏ".
    const ma = fs.readFileSync(path.join(GOC, 'chung/soGhiDau.js'), 'utf8');
    const dau = ma.indexOf('async function danhDauXong');
    const than = ma.slice(dau, ma.indexOf('\n    }', dau));
    assert.match(than, /daBamThanhToan/, '❌ sổ lại vứt mất bằng chứng đã phát hành');
});

test('⭐ trang Sell ĐẾM theo cờ, không đếm theo "ok"', () => {
    const ma = fs.readFileSync(path.join(GOC, 'sell/chenCot.js'), 'utf8');
    assert.match(ma, /daBamThanhToan/, 'màn hình không hề nhìn tới cờ đã phát hành');
    assert.ok(!/Xong \$\{xong\.length\} khách/.test(ma),
        '❌ vẫn đếm gộp mọi "ok" thành "Xong N khách"');
});

test('⭐ KHÔNG còn đường nào kết luận "đã phát hành" từ chỗ giỏ trống', () => {
    // Suy đoán từ chỗ KHÔNG THẤY GÌ, trong khi nút "Xác nhận" chưa hề được bấm.
    const ma = fs.readFileSync(path.join(GOC, 'tendoo/bamThanhToan.js'), 'utf8');
    const than = ma.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // Nhánh "bấm Thanh toán xong, giỏ trống đi mà bảng xác nhận không hiện":
    // nhận diện theo chính câu thông báo, không theo vị trí — mã quanh nó đã đổi
    // nhiều lần và bám vị trí là test tự hỏng.
    const dau = than.indexOf('giỏ trống đi nhưng bảng xác nhận không');
    assert.ok(dau > 0, 'không tìm thấy nhánh giỏ trống sau khi bấm Thanh toán');
    const quanh = than.slice(Math.max(0, dau - 300), dau);
    assert.match(quanh, /MA\.KHONG_RO/, 'phải trả KHÔNG RÕ để treo lệnh lại');
    assert.ok(!/ma:\s*MA\.XONG/.test(quanh), '❌ vẫn trả XONG khi chưa bấm "Xác nhận"');

    // ⭐ BẤT BIẾN MẠNH NHẤT: mọi đường trả XONG đều phải nằm SAU cú bấm "Xác nhận".
    const bamXacNhan = than.indexOf('nutXacNhan.click()');
    assert.ok(bamXacNhan > 0, 'không tìm thấy cú bấm "Xác nhận"');
    for (const m of than.matchAll(/ma:\s*MA\.XONG/g)) {
        assert.ok(m.index > bamXacNhan,
            '❌ có đường trả XONG TRƯỚC khi bấm "Xác nhận" — đó là đoán, không phải bằng chứng');
    }
});

test('⭐ "đọc cài đặt hỏng" có mã lỗi RIÊNG, không nhập chung với "công tắc tắt"', () => {
    const ma = fs.readFileSync(path.join(GOC, 'tendoo/nhanLenh.js'), 'utf8');
    assert.match(ma, /docDuoc/, 'không phân biệt được đọc hỏng với tắt');
    assert.match(ma, /KHONG_DOC_DUOC_CAI_DAT/, 'thiếu mã lỗi riêng');
    // Vẫn phải ngã về phía KHÔNG được phép bấm.
    // Đọc hỏng phải ngã về TẮT HẾT — mọi công tắc, không sót cái nào.
    const dau = ma.indexOf('async function docCaiDat');
    const than = ma.slice(dau, ma.indexOf('\n}', dau));
    for (const ct of ['tuBam', 'daHieu', 'xoaGioLa', 'boQuaThue']) {
        assert.match(than, new RegExp(ct + ':\\s*false'),
            `đọc hỏng mà công tắc "${ct}" không ngã về TẮT`);
    }
    assert.match(than, /docDuoc:\s*false/, 'không báo được là đọc hỏng');
});

ghiChu('— ⭐ Không được đếm tầng cứng khi đọc dòng giỏ —');

test('⭐ có bản chụp HTML thật của giỏ hàng trong dự án', () => {
    assert.ok(coFile('test/mau/gioHangThat.html'),
        'mất bản chụp thật — test sẽ lại chỉ chạy trên trang giả và lại xanh giả');
});

test('⭐ tìm khối dòng giỏ theo DẤU HIỆU, không theo số tầng', () => {
    // Bản cũ đi lên đúng 5 tầng rồi dừng. Trang thật để dòng giỏ ở tầng 6 —
    // lệch một tầng, hỏng liền ba tính năng (dọn giỏ, dấu giỏ, số lượng > 1).
    const ma = fs.readFileSync(path.join(GOC, 'tendoo/boGio.js'), 'utf8');
    assert.match(ma, /timKhoiDong/, 'không còn hàm tìm khối dòng riêng');
    const dau = ma.indexOf('function timKhoiDong');
    const than = ma.slice(dau, ma.indexOf('\n}', dau));
    assert.match(than, /timNutXoaDong/, 'không dùng nút xóa làm dấu hiệu dừng');
    assert.match(than, /CO_CHU/, 'không đòi khối phải có TÊN MÓN');
    assert.ok(!/i < 5/.test(than), '❌ lại đếm tầng cứng bằng 5');
});

test('⭐ trang POS giả phải dựng dòng giỏ SÂU như thật', () => {
    // Trang giả nông hơn thật là nguồn gốc của cả ba lần "test xanh mà đời hỏng".
    const ma = fs.readFileSync(path.join(GOC, 'test/trangPosGiaLap.js'), 'utf8');
    for (const lop of ['flex-shrink-0', 'flex flex-col gap-2 lg:flex-row flex-1',
                       'relative border border-neutral-200 rounded-md p-2',
                       'ant-btn-dangerous']) {
        assert.ok(ma.includes(lop), `trang giả thiếu lớp thật: ${lop}`);
    }
});

ghiChu('— ⭐ Bỏ qua cảnh báo thuế —');

test('⭐ KHÔNG có đường nào bấm "Thiết lập quản lý thuế"', () => {
    // Bấm nút đó là rời trang bán hàng giữa một lượt chạy hàng loạt.
    const ma = fs.readFileSync(path.join(GOC, 'tendoo/bamThanhToan.js'), 'utf8');
    const than = ma.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/timNutTheoChu\([^)]*CHU_NUT_THIET_LAP_THUE/.test(than),
        '❌ có đường tìm nút "Thiết lập quản lý thuế" để bấm');
    assert.match(ma, /CHU_NUT_THIET_LAP_THUE/, 'phải khai tên nút để ghi rõ là cấm bấm');
});

test('⭐ chỉ bỏ qua khi được cho phép BẰNG true', () => {
    const ma = fs.readFileSync(path.join(GOC, 'tendoo/bamThanhToan.js'), 'utf8');
    assert.match(ma, /boQuaCanhBaoThue === true/,
        '❌ nhận giá trị "gần giống" — phải so đúng bằng true');
});

test('⭐ cờ "đã bỏ qua thuế" đi được từ nút bấm tới tận màn hình', () => {
    const chang = [['tendoo/bamThanhToan.js', 'daBoQuaThue'],
                   ['tendoo/nhanLenh.js', 'daBoQuaThue'],
                   ['chung/soGhiDau.js', 'daBoQuaThue'],
                   ['sell/chenCot.js', 'daBoQuaThue']];
    for (const [f, tu] of chang) {
        const ma = fs.readFileSync(path.join(GOC, f), 'utf8');
        assert.ok(ma.includes(tu), `${f} làm đứt chuỗi — sổ sách sẽ không biết hóa đơn nào bị ảnh hưởng`);
    }
});

test('⭐ nền đọc hỏng cài đặt → công tắc thuế cũng ngã về TẮT', () => {
    assert.strictEqual(require('../chung/caiDat').khiDocHong().boQuaThue, false,
        'đọc hỏng mà công tắc bỏ qua thuế không ngã về TẮT');
    const ma = fs.readFileSync(path.join(GOC, 'tendoo/nhanLenh.js'), 'utf8');
    assert.match(ma, /boQuaThue:\s*false/, 'trang POS đọc hỏng mà không ngã về TẮT');
});

test('trang POS giả dựng đúng hành vi: bỏ qua xong phải bấm Thanh toán lại', () => {
    const ma = fs.readFileSync(path.join(GOC, 'test/trangPosGiaLap.js'), 'utf8');
    assert.match(ma, /thueLuonChan/, 'thiếu cảnh xấu nhất để kiểm vòng lặp');
    assert.match(ma, /chỉ ĐÓNG LẠI/, 'chưa ghi rõ hành vi thật của nút Bỏ qua');
});

test('⭐ thông báo thuế KHÔNG được viết cứng một câu cho cả hai trạng thái', () => {
    // Câu "Máy KHÔNG tự bấm Bỏ qua" viết từ hồi chưa có công tắc. Giữ nguyên
    // thì công tắc tắt người dùng không biết đường bật, công tắc bật thì câu đó sai.
    const ma = fs.readFileSync(path.join(GOC, 'tendoo/bamThanhToan.js'), 'utf8');
    assert.ok(!/Máy KHÔNG tự bấm "Bỏ qua"/.test(ma),
        '❌ còn câu viết cứng "Máy KHÔNG tự bấm Bỏ qua"');
    assert.match(ma, /daBatBoQuaThue/, 'thông báo không biết công tắc đang bật hay tắt');
    assert.match(ma, /daBat[\s\S]{0,80}\?/, 'không chia hai câu theo trạng thái công tắc');
});

test('⭐ modal bên Sell đọc được công tắc thuế để báo trước', () => {
    const ma = fs.readFileSync(path.join(GOC, 'sell/chenCot.js'), 'utf8');
    assert.match(ma, /boQuaThue/, 'modal không hề nhìn tới công tắc thuế');
    assert.match(ma, /hdt-canh-bao-thue/, 'thiếu chỗ hiện trạng thái công tắc thuế');
});

chay('MANIFEST & TRANG POPUP');
