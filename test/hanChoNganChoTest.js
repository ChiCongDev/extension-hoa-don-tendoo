'use strict';

// ĐƯA HẠN CHỜ VỀ MỨC CŨ ĐỂ TEST CHẠY NHANH.
//
// ⚠️ 03/11/2026 hạn chờ thật của máy được nâng lên (30 giây ở mỗi chốt, ~80 giây
// ở bước Xác nhận) vì Tendoo buổi tối trả lời chậm. Các test dựng kịch bản LỖI
// với đồng hồ thật mà không truyền hạn chờ riêng sẽ phải ngồi chờ đủ 30 giây mỗi
// chốt — hàng chục giây tới hàng trăm giây cho một file.
//
// Cần require file này TRƯỚC khi nạp các module của extension (bamThanhToan đọc
// một hằng số lúc nạp). Nó chỉ đổi giá trị trong tiến trình test, không đụng gì
// tới extension. Hạn chờ THẬT được kiểm riêng ở test/nhipDo.test.js.
//
// ⛔ CHỈ rút ngắn THỜI GIAN chờ. Không đổi một luật nào của máy.

const NhipDo = require('../chung/nhipDo');

Object.assign(NhipDo, {
    HAN_CHO_BANG_XAC_NHAN: 8000,
    HAN_CHO_GIO_VE_DU: 8000,
    HAN_CHO_DONG_GIO: 4000,
    HAN_CHO_NUT_MO_KHOA: 4000,
    HAN_CHO_TENDOO_QUAY: 30000,
});

module.exports = NhipDo;
