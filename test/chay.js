'use strict';

// Bộ chạy test tí hon — không cài thư viện nào. Hỗ trợ cả test bất đồng bộ
// (cần cho MutationObserver, vốn chạy ở microtask).

const cacCa = [];
let dat = 0, hong = 0;

function test(ten, ham) { cacCa.push({ ten, ham }); }

function ghiChu(chu) { cacCa.push({ ghiChu: chu }); }

async function chay(tieuDe) {
    console.log('\n' + tieuDe + '\n');
    for (const ca of cacCa) {
        if (ca.ghiChu) { console.log('  ' + ca.ghiChu); continue; }
        try {
            await ca.ham();
            console.log('  \x1b[32m✔\x1b[0m ' + ca.ten);
            dat++;
        } catch (e) {
            console.log('  \x1b[31m✘\x1b[0m ' + ca.ten);
            console.log('      ' + String(e.message).split('\n').slice(0, 3).join('\n      '));
            hong++;
        }
    }
    console.log(`\n${dat} đạt, ${hong} hỏng\n`);
    process.exitCode = hong ? 1 : 0;
    return hong;
}

/** Đợi MutationObserver chạy xong (nó chạy ở microtask, không đồng bộ). */
const doiMotNhip = () => new Promise(r => setTimeout(r, 0));

module.exports = { test, ghiChu, chay, doiMotNhip };
