'use strict';

// ============================================================================
//  LƯỚI HÀNG MẪU — DỮ LIỆU TEST, không phải code chạy thật.
//
//  Chép từ ảnh chụp màn hình POS Tendoo thật ngày 2026-08-08 (16 mặt hàng đầu).
//  Trước đây nằm ở chung/luoiGiaLap.js và được nạp vào trang Sell để chạy "chế
//  độ giả lập". Từ giai đoạn 6, trang Sell KHÔNG ghép tiền nữa — việc ghép làm
//  bên Tendoo với hàng thật — nên dữ liệu này chỉ còn dùng cho test.
//
//  ⚠️ Lưu ý một chi tiết có thật trong dữ liệu: hai cặp mã trùng nhau
//     (ÁGPTĐN nam/nữ, ÁPPCN nam/nữ) nhưng KHÁC GIÁ. Đó là lý do thuật toán phải
//     phân biệt theo vị trí chứ không gộp theo mã.
// ============================================================================

const LUOI_MAU = [
    { ma: 'ÁKDDDN',  ten: 'Áo khoác dạ dáng dài nữ',      gia:  990000, ton: 22 },
    { ma: 'SÁKGQGN', ten: 'Set áo khoác gió quần gió nam', gia:  990000, ton:  3 },
    { ma: 'GBNCNDM', ten: 'Giày Boots nữ cổ ngắn da mềm',  gia: 1400000, ton:  6 },
    { ma: 'ÁGPTĐN',  ten: 'Áo Gilet phao Thu Đông nam',    gia:  850000, ton:  4 },
    { ma: 'QJTTN',   ten: 'Quần Jogger thể thao nữ',       gia:  490000, ton:  1 },
    { ma: 'ÁGPTĐN',  ten: 'Áo Gilet phao Thu Đông nữ',     gia:  890000, ton: 13 },
    { ma: 'ÁKDCNN',  ten: 'Áo khoác dù chống nước nhẹ',    gia:  950000, ton:  9 },
    { ma: 'SÁGNQNN', ten: 'Set áo giữ nhiệt quần nỉ nam',  gia:  850000, ton:  6 },
    { ma: 'GCGNMN7', ten: 'Giày cao gót nữ mũi nhọn 7cm',  gia: 1350000, ton:  1 },
    { ma: 'GBNCCDL', ten: 'Giày Boots nam cổ cao da lộn',  gia: 1450000, ton: 19 },
    { ma: 'ÁPPCN',   ten: 'Áo Polo phối cổ nam',           gia:  990000, ton: 19 },
    { ma: 'ÁBTTN',   ten: 'Áo Bomber thể thao nam',        gia:  790000, ton: 19 },
    { ma: 'GBRCTN',  ten: 'Giày bóng rổ cổ thấp nam',      gia: 1100000, ton: 19 },
    { ma: 'GTDNHĐ',  ten: 'Giày Tây Derby nam hiện đại',   gia: 1450000, ton:  5 },
    { ma: 'ÁPPCN',   ten: 'Áo Polo phối cổ nữ',            gia:  490000, ton: 18 },
    { ma: 'QNTĐN',   ten: 'Quần nỉ Thu Đông nữ',           gia:  750000, ton: 19 },
];

module.exports = { LUOI_MAU, LUOI_GIA_LAP: LUOI_MAU };
