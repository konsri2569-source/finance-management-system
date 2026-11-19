/**
 * Generates a complete, self-contained 2-file Google Apps Script package:
 * 1) code.gs (Google Apps Script Backend bound to Google Sheets & Drive)
 * 2) index.html (Complete single-file Frontend: HTML + CSS + JavaScript)
 */

export function generateCodeGs(spreadsheetId: string, schoolName?: string): string {
  const safeSheetId = (spreadsheetId || '').trim();
  const safeSchool = (schoolName || 'โรงเรียนบ้านคอนศรีบะสะแบง').replace(/'/g, "\\'");

  return `/**
 * ระบบบริหารการเงินสถานศึกษา (Google Apps Script Edition - Strict 2-File Package)
 * ไฟล์ที่ 1: code.gs (Backend Google Apps Script)
 * ไฟล์ที่ 2: index.html (Frontend HTML + CSS + JavaScript)
 * ห้ามสร้างไฟล์ CSS, JS, JSON หรือ HTML แยกเพิ่มเติม
 */

const CONFIG = {
  SHEET_ID: '${safeSheetId}',
  DEFAULT_SCHOOL_NAME: '${safeSchool}'
};

const CORE_SHEETS = [
  { title: 'FIN_FundTypes', headers: ['id', 'name', 'group', 'color'] },
  { title: 'FIN_Transactions', headers: ['id', 'date', 'fy', 'fund', 'doc', 'desc', 'rec', 'pay', 'loc', 'kind', 'by', 'bank'] },
  { title: 'FIN_Settings', headers: ['key', 'value'] },
  { title: 'FIN_Assets', headers: ['key', 'dataUrl'] },
  { title: 'FIN_Alloc', headers: ['fy', 'json', 'by', 'date'] },
  { title: 'FIN_Loans', headers: ['id', 'no', 'date', 'fy', 'fund', 'borrower', 'purpose', 'amount', 'due', 'txId', 'by'] },
  { title: 'FIN_LoanRets', headers: ['id', 'loan', 'date', 'fy', 'fund', 'voucherNo', 'voucher', 'cashNo', 'cash', 'loc', 'bank', 'txId', 'by'] },
  { title: 'FIN_Reports', headers: ['id', 'fy', 'plan', 'project', 'dept', 'approved', 'spent', 'summary', 'issues', 'status', 'reporter', 'date', 'by', 'files'] },
  { title: 'FIN_Plans', headers: ['id', 'fy', 'fund', 'dept', 'project', 'amount', 'note'] },
  { title: 'FIN_Requests', headers: ['id', 'date', 'fy', 'plan', 'fund', 'dept', 'project', 'item', 'amount', 'person', 'status', 'refLink', 'txId', 'by'] },
  { title: 'FIN_Subsidy', headers: ['id', 'fy', 'level', 'count', 'small', 'total', 'by', 'date', 'grades', 'rates', 'amounts'] },
  { title: 'FIN_Banks', headers: ['id', 'bank', 'accountNo', 'accountName', 'note', 'active'] },
  { title: 'FIN_Users', headers: ['username', 'name', 'role', 'active', 'pw', 'permissionsJson'] },
  { title: 'FIN_Receipts', headers: ['id', 'fy', 'bookNo', 'receiptNo', 'date', 'desc', 'payer', 'amount', 'collector', 'cancelled'] },
  { title: 'FIN_ReceiptReq', headers: ['id', 'date', 'bookType', 'qtyRequested', 'qtyIssued', 'rangeNote', 'requester', 'approver'] },
  { title: 'FIN_DirectorEval', headers: ['id', 'aspect', 'indicator', 'target', 'result', 'score', 'weight', 'evidence'] },
  { title: 'คลังเอกสาร_PDF', headers: ['รหัส', 'ปีงบประมาณ', 'รหัสรายงาน', 'ชื่อเอกสารรายงาน', 'ชื่อไฟล์ PDF', 'ลิงก์ Google Drive', 'วันที่สร้าง', 'ผู้จัดทำ'] }
];

const THAI_REPORT_TABS = [
  'รายงานส่วนที่_1', 'รายงานส่วนที่_2', 'รายงานส่วนที่_3', 'รายงานส่วนที่_4_รับ', 'รายงานส่วนที่_4_จ่าย',
  'รายงานส่วนที่_5', 'สมุดเงินสด', 'รายงานเงินคงเหลือประจำวัน',
  'ทะเบียนคุมเงินนอกงบประมาณ', 'ทะเบียนคุมเงินฝากธนาคาร', 'ทะเบียนคุมเงินอุดหนุนทั่วไป',
  'ทะเบียนเงินกิจกรรมพัฒนาผู้เรียน', 'ทะเบียนเงินลูกเสือ_เนตรนารี', 'ทะเบียนคุมเงินค่ายุวกาชาด',
  'ทะเบียนคุมเงินภาษีหัก_ณ_ที่จ่าย', 'ทะเบียนคุมปัจจัยพื้นฐานยากจน', 'ทะเบียนคุมเงินอุดหนุนอาหารกลางวัน',
  'บันทึกการเก็บรักษาเงิน', 'ใบส่งรายได้แผ่นดิน', 'รายงานใบเสร็จ', 'คลังเอกสาร_PDF'
];

const DEFAULT_FUNDS = [
  { id: 'F01', name: 'เงินอุดหนุนอาหารกลางวัน', group: '1. เงินอุดหนุนและโครงการเฉพาะ', color: '#2563eb' },
  { id: 'F02', name: 'เงินอุดหนุนรายหัว (ก่อนประถม)', group: '2. เงินอุดหนุนรายหัว / เรียนฟรี 15 ปี', color: '#059669' },
  { id: 'F03', name: 'เงินอุดหนุนรายหัว (ประถมศึกษา)', group: '2. เงินอุดหนุนรายหัว / เรียนฟรี 15 ปี', color: '#10b981' },
  { id: 'F04', name: 'ปัจจัยพื้นฐานนักเรียนยากจน', group: '1. เงินอุดหนุนและโครงการเฉพาะ', color: '#0284c7' },
  { id: 'F05', name: 'ค่าเครื่องแบบนักเรียน', group: '2. เงินอุดหนุนรายหัว / เรียนฟรี 15 ปี', color: '#0891b2' },
  { id: 'F06', name: 'ค่าอุปกรณ์การเรียน', group: '2. เงินอุดหนุนรายหัว / เรียนฟรี 15 ปี', color: '#0d9488' },
  { id: 'F07', name: 'ค่าหนังสือเรียน', group: '2. เงินอุดหนุนรายหัว / เรียนฟรี 15 ปี', color: '#0ea5e9' },
  { id: 'F08', name: 'ค่ากิจกรรมพัฒนาคุณภาพผู้เรียน', group: '2. เงินอุดหนุนรายหัว / เรียนฟรี 15 ปี', color: '#4f46e5' },
  { id: 'F09', name: 'เงิน กสศ. (นักเรียนทุนเสมอภาค)', group: '1. เงินอุดหนุนและโครงการเฉพาะ', color: '#d97706' },
  { id: 'F10', name: 'เงินรายได้สถานศึกษา', group: '3. เงินรายได้และเงินนอกอื่นๆ', color: '#7c3aed' },
  { id: 'F11', name: 'เงินรายได้แผ่นดิน (ดอกเบี้ยฯ)', group: '4. เงินรายได้แผ่นดินและภาษี', color: '#dc2626' },
  { id: 'F12', name: 'เงินประกันสัญญา', group: '3. เงินรายได้และเงินนอกอื่นๆ', color: '#64748b' },
  { id: 'F13', name: 'เงินภาษีหัก ณ ที่จ่าย', group: '4. เงินรายได้แผ่นดินและภาษี', color: '#b91c1c' },
  { id: 'F14', name: 'เงินบริจาคและเงินนอกงบฯ อื่น', group: '3. เงินรายได้และเงินนอกอื่นๆ', color: '#475569' },
  { id: 'F15', name: 'รายหัวก่อนประถมและประถมศึกษา (รร.ขนาดเล็ก)', group: '2. เงินอุดหนุนรายหัว / เรียนฟรี 15 ปี', color: '#15803d' }
];

function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('ระบบบริหารการเงินสถานศึกษา - ' + CONFIG.DEFAULT_SCHOOL_NAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getSpreadsheet_() {
  if (CONFIG.SHEET_ID) {
    return SpreadsheetApp.openById(CONFIG.SHEET_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function parseNum_(val) {
  if (typeof val === 'number') return isNaN(val) ? 0 : Math.round(val * 100) / 100;
  var cleaned = String(val === null || val === undefined ? '' : val).replace(/,/g, '').trim();
  var n = Number(cleaned);
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

function numRound_(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function todayISO_() {
  return Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
}

function genId_(prefix) {
  return prefix + '_' + new Date().getTime() + '_' + Math.floor(Math.random() * 1000);
}

/**
 * Normalize transactions so payment vouchers (บค/บจ) or negative receipts
 * always sit positively in pay instead of negative rec.
 */
function normalizeTx_(raw) {
  var doc = String(raw.doc || '').trim();
  var desc = String(raw.desc || '').trim();
  var rec = parseNum_(raw.rec);
  var pay = parseNum_(raw.pay);
  var kind = String(raw.kind || 'normal').trim() === 'open' ? 'open' : 'normal';

  if (rec < 0 && pay === 0) {
    pay = Math.abs(rec);
    rec = 0;
  } else if (pay < 0 && rec === 0) {
    rec = Math.abs(pay);
    pay = 0;
  }

  if (kind === 'open' && pay > 0 && /^(บค|บจ|บย)/i.test(doc)) {
    kind = 'normal';
  }
  if (kind === 'normal' && /^(บค|บจ)/i.test(doc) && rec > 0 && pay === 0 && !/รับคืน|ยกมา/i.test(desc)) {
    pay = rec;
    rec = 0;
  }

  return {
    id: String(raw.id || genId_('TX')),
    date: String(raw.date || todayISO_()).slice(0, 10),
    fy: Number(raw.fy) || (new Date().getFullYear() + 543),
    fund: String(raw.fund || 'F01').trim(),
    doc: doc,
    desc: desc,
    rec: numRound_(rec > 0 ? rec : 0),
    pay: numRound_(pay > 0 ? pay : 0),
    loc: String(raw.loc || 'bank').trim() || 'bank',
    kind: kind,
    by: String(raw.by || 'system').trim(),
    bank: String(raw.bank || '').trim()
  };
}

function setupSheetStructure() {
  var ss = getSpreadsheet_();
  var existing = {};
  ss.getSheets().forEach(function (sh) { existing[sh.getName()] = sh; });

  CORE_SHEETS.forEach(function (cfg) {
    var sh = existing[cfg.title];
    if (!sh) {
      sh = ss.insertSheet(cfg.title);
      existing[cfg.title] = sh;
    }
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, cfg.headers.length).setValues([cfg.headers]).setFontWeight('bold').setBackground('#e2e8f0');
      sh.setFrozenRows(1);
    }
  });

  THAI_REPORT_TABS.forEach(function (tabName) {
    if (!existing[tabName]) {
      ss.insertSheet(tabName);
    }
  });

  var fundSh = existing['FIN_FundTypes'];
  if (fundSh.getLastRow() <= 1) {
    var rows = DEFAULT_FUNDS.map(function (f) { return [f.id, f.name, f.group, f.color]; });
    fundSh.getRange(2, 1, rows.length, 4).setValues(rows);
  }
  return { ok: true, spreadsheetUrl: ss.getUrl() };
}

function readSheetObjects_(sheetName, headers) {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(sheetName);
  if (!sh || sh.getLastRow() <= 1) return [];
  var values = sh.getDataRange().getValues();
  var cols = values[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (row.join('').trim() === '') continue;
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var idx = cols.indexOf(headers[j]);
      if (idx === -1) idx = j;
      var val = row[idx];
      if (val instanceof Date) {
        val = Utilities.formatDate(val, 'Asia/Bangkok', 'yyyy-MM-dd');
      }
      obj[headers[j]] = val === undefined || val === null ? '' : val;
    }
    out.push(obj);
  }
  return out;
}

function writeSheetObjects_(sheetName, headers, list) {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(sheetName);
  if (!sh) {
    setupSheetStructure();
    sh = ss.getSheetByName(sheetName);
  }
  sh.clearContents();
  var matrix = [headers];
  list.forEach(function (item) {
    matrix.push(headers.map(function (h) {
      var v = item[h];
      return v === undefined || v === null ? '' : v;
    }));
  });
  sh.getRange(1, 1, matrix.length, headers.length).setValues(matrix);
  sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e2e8f0');
}

function getInitialData() {
  setupSheetStructure();

  var funds = readSheetObjects_('FIN_FundTypes', ['id', 'name', 'group', 'color']);
  if (!funds.length) funds = DEFAULT_FUNDS;

  var rawTx = readSheetObjects_('FIN_Transactions', ['id', 'date', 'fy', 'fund', 'doc', 'desc', 'rec', 'pay', 'loc', 'kind', 'by', 'bank']);
  var transactions = rawTx.map(normalizeTx_);

  var settingsRows = readSheetObjects_('FIN_Settings', ['key', 'value']);
  var settings = {
    schoolName: CONFIG.DEFAULT_SCHOOL_NAME,
    affiliation: 'สำนักงานเขตพื้นที่การศึกษาประถมศึกษาสกลนคร เขต 3',
    district: 'วานรนิวาส',
    province: 'สกลนคร',
    schoolCode: '',
    schoolSize: 'small',
    director: '',
    financeName: '',
    driveFolderId: ''
  };
  settingsRows.forEach(function (r) {
    if (r.key) settings[r.key] = String(r.value || '');
  });

  var assetsRows = readSheetObjects_('FIN_Assets', ['key', 'dataUrl']);
  var assets = { logo: '', sigDirector: '', sigFinance: '' };
  assetsRows.forEach(function (r) {
    if (r.key) assets[r.key] = String(r.dataUrl || '');
  });

  var allocRows = readSheetObjects_('FIN_Alloc', ['fy', 'json', 'by', 'date']);
  var allocDocs = {};
  allocRows.forEach(function (r) {
    try { allocDocs[String(r.fy)] = JSON.parse(r.json || '{}'); } catch (e) {}
  });

  var plans = readSheetObjects_('FIN_Plans', ['id', 'fy', 'fund', 'dept', 'project', 'amount', 'note']).map(function (p) {
    p.fy = Number(p.fy);
    p.amount = parseNum_(p.amount);
    return p;
  });

  var requests = readSheetObjects_('FIN_Requests', ['id', 'date', 'fy', 'plan', 'fund', 'dept', 'project', 'item', 'amount', 'person', 'status', 'refLink', 'txId', 'by']).map(function (r) {
    r.fy = Number(r.fy);
    r.amount = parseNum_(r.amount);
    return r;
  });

  var loans = readSheetObjects_('FIN_Loans', ['id', 'no', 'date', 'fy', 'fund', 'borrower', 'purpose', 'amount', 'due', 'txId', 'by']).map(function (l) {
    l.fy = Number(l.fy);
    l.amount = parseNum_(l.amount);
    return l;
  });

  var loanRets = readSheetObjects_('FIN_LoanRets', ['id', 'loan', 'date', 'fy', 'fund', 'voucherNo', 'voucher', 'cashNo', 'cash', 'loc', 'bank', 'txId', 'by']).map(function (lr) {
    lr.fy = Number(lr.fy);
    lr.voucher = parseNum_(lr.voucher);
    lr.cash = parseNum_(lr.cash);
    return lr;
  });

  var subsidies = readSheetObjects_('FIN_Subsidy', ['id', 'fy', 'level', 'count', 'small', 'total', 'by', 'date', 'grades', 'rates', 'amounts']).map(function (s) {
    s.fy = Number(s.fy);
    s.count = parseNum_(s.count);
    s.total = parseNum_(s.total);
    s.small = String(s.small) === 'true' || s.small === true;
    try { s.grades = JSON.parse(s.grades || '[]'); } catch (e) { s.grades = []; }
    try { s.rates = JSON.parse(s.rates || '{}'); } catch (e) { s.rates = {}; }
    try { s.amounts = JSON.parse(s.amounts || '{}'); } catch (e) { s.amounts = {}; }
    return s;
  });

  var banks = readSheetObjects_('FIN_Banks', ['id', 'bank', 'accountNo', 'accountName', 'note', 'active']).map(function (b) {
    b.active = String(b.active) !== 'false' && b.active !== false;
    return b;
  });

  var users = readSheetObjects_('FIN_Users', ['username', 'name', 'role', 'active', 'pw', 'permissionsJson']).map(function (u) {
    u.active = String(u.active) !== 'false' && u.active !== false;
    try { u.permissions = JSON.parse(u.permissionsJson || '{}'); } catch (e) { u.permissions = {}; }
    return u;
  });

  var receipts = readSheetObjects_('FIN_Receipts', ['id', 'fy', 'bookNo', 'receiptNo', 'date', 'desc', 'payer', 'amount', 'collector', 'cancelled']).map(function (r) {
    r.fy = Number(r.fy);
    r.amount = parseNum_(r.amount);
    r.cancelled = String(r.cancelled) === 'true' || r.cancelled === true;
    return r;
  });

  var receiptReqs = readSheetObjects_('FIN_ReceiptReq', ['id', 'date', 'bookType', 'qtyRequested', 'qtyIssued', 'rangeNote', 'requester', 'approver']);
  var directorEval = readSheetObjects_('FIN_DirectorEval', ['id', 'aspect', 'indicator', 'target', 'result', 'score', 'weight', 'evidence']).map(function (d) {
    d.score = parseNum_(d.score);
    d.weight = parseNum_(d.weight);
    return d;
  });

  var pdfArchive = readSheetObjects_('คลังเอกสาร_PDF', ['รหัส', 'ปีงบประมาณ', 'รหัสรายงาน', 'ชื่อเอกสารรายงาน', 'ชื่อไฟล์ PDF', 'ลิงก์ Google Drive', 'วันที่สร้าง', 'ผู้จัดทำ']);

  return {
    spreadsheetUrl: getSpreadsheet_().getUrl(),
    funds: funds,
    transactions: transactions,
    settings: settings,
    assets: assets,
    allocDocs: allocDocs,
    plans: plans,
    requests: requests,
    loans: loans,
    loanRets: loanRets,
    subsidies: subsidies,
    banks: banks,
    users: users,
    receipts: receipts,
    receiptReqs: receiptReqs,
    directorEval: directorEval,
    pdfArchive: pdfArchive
  };
}

function saveTransaction(tx) {
  var norm = normalizeTx_(tx);
  if (!norm.desc) throw new Error('กรุณาระบุรายการ');
  if (norm.kind === 'open' && norm.pay > 0) {
    throw new Error('รายการ "ยอดยกมา" ต้องบันทึกในช่อง รับ เท่านั้น');
  }
  if (/^(บค|บจ)/i.test(norm.doc) && parseNum_(tx.rec) > 0 && parseNum_(tx.pay) === 0 && !/รับคืน|ยกมา/i.test(norm.desc)) {
    norm.pay = parseNum_(tx.rec);
    norm.rec = 0;
  }
  if (norm.rec <= 0 && norm.pay <= 0) {
    throw new Error('กรุณาระบุจำนวนเงินรับหรือจ่ายมากกว่า 0');
  }

  var headers = ['id', 'date', 'fy', 'fund', 'doc', 'desc', 'rec', 'pay', 'loc', 'kind', 'by', 'bank'];
  var rows = readSheetObjects_('FIN_Transactions', headers);
  var idx = -1;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === norm.id) { idx = i; break; }
  }
  if (idx >= 0) rows[idx] = norm;
  else rows.push(norm);
  writeSheetObjects_('FIN_Transactions', headers, rows);
  return norm;
}

function deleteTransaction(id) {
  var headers = ['id', 'date', 'fy', 'fund', 'doc', 'desc', 'rec', 'pay', 'loc', 'kind', 'by', 'bank'];
  var rows = readSheetObjects_('FIN_Transactions', headers).filter(function (r) { return String(r.id) !== String(id); });
  writeSheetObjects_('FIN_Transactions', headers, rows);
  return { ok: true };
}

function savePlan(plan) {
  var headers = ['id', 'fy', 'fund', 'dept', 'project', 'amount', 'note'];
  var rows = readSheetObjects_('FIN_Plans', headers);
  var item = {
    id: plan.id || genId_('PL'),
    fy: Number(plan.fy),
    fund: plan.fund,
    dept: plan.dept,
    project: plan.project,
    amount: parseNum_(plan.amount),
    note: plan.note || ''
  };
  var idx = rows.findIndex(function (r) { return r.id === item.id; });
  if (idx >= 0) rows[idx] = item; else rows.push(item);
  writeSheetObjects_('FIN_Plans', headers, rows);
  return item;
}

function deletePlan(id) {
  var headers = ['id', 'fy', 'fund', 'dept', 'project', 'amount', 'note'];
  var rows = readSheetObjects_('FIN_Plans', headers).filter(function (r) { return r.id !== id; });
  writeSheetObjects_('FIN_Plans', headers, rows);
  return { ok: true };
}

function saveRequest(req) {
  var headers = ['id', 'date', 'fy', 'plan', 'fund', 'dept', 'project', 'item', 'amount', 'person', 'status', 'refLink', 'txId', 'by'];
  var rows = readSheetObjects_('FIN_Requests', headers);
  var item = {
    id: req.id || genId_('RQ'),
    date: req.date || todayISO_(),
    fy: Number(req.fy),
    plan: req.plan || '',
    fund: req.fund || 'F03',
    dept: req.dept || '',
    project: req.project || '',
    item: req.item,
    amount: parseNum_(req.amount),
    person: req.person || '',
    status: req.status || 'รออนุมัติ',
    refLink: req.refLink || '',
    txId: req.txId || '',
    by: req.by || 'staff'
  };
  var idx = rows.findIndex(function (r) { return r.id === item.id; });
  if (idx >= 0) rows[idx] = item; else rows.push(item);
  writeSheetObjects_('FIN_Requests', headers, rows);
  return item;
}

function payRequest(payload) {
  var headers = ['id', 'date', 'fy', 'plan', 'fund', 'dept', 'project', 'item', 'amount', 'person', 'status', 'refLink', 'txId', 'by'];
  var rows = readSheetObjects_('FIN_Requests', headers);
  var req = rows.find(function (r) { return r.id === payload.requestId; });
  if (!req) throw new Error('ไม่พบคำขอใช้เงิน');

  var tx = saveTransaction({
    id: genId_('TX'),
    date: payload.date || todayISO_(),
    fy: Number(req.fy),
    fund: req.fund,
    doc: payload.doc || ('บค ' + payload.requestId.slice(-4)),
    desc: 'จ่ายตามคำขอ: ' + req.item + ' (' + req.person + ')',
    rec: 0,
    pay: parseNum_(req.amount),
    loc: payload.loc || 'bank',
    kind: 'normal',
    by: payload.by || 'finance',
    bank: payload.bank || ''
  });

  req.status = 'จ่ายเงินแล้ว';
  req.txId = tx.id;
  writeSheetObjects_('FIN_Requests', headers, rows);
  return { req: req, tx: tx };
}

function createLoan(loan) {
  var headers = ['id', 'no', 'date', 'fy', 'fund', 'borrower', 'purpose', 'amount', 'due', 'txId', 'by'];
  var rows = readSheetObjects_('FIN_Loans', headers);
  var docNo = loan.no || ('บย ' + (rows.length + 1) + '/' + loan.fy);
  var tx = saveTransaction({
    id: genId_('TX'),
    date: loan.date || todayISO_(),
    fy: Number(loan.fy),
    fund: loan.fund,
    doc: docNo,
    desc: 'จ่ายเงินยืม: ' + loan.borrower + ' (' + loan.purpose + ')',
    rec: 0,
    pay: parseNum_(loan.amount),
    loc: loan.loc || 'bank',
    kind: 'normal',
    by: loan.by || 'finance',
    bank: loan.bank || ''
  });
  var item = {
    id: genId_('LN'),
    no: docNo,
    date: loan.date || todayISO_(),
    fy: Number(loan.fy),
    fund: loan.fund,
    borrower: loan.borrower,
    purpose: loan.purpose,
    amount: parseNum_(loan.amount),
    due: loan.due,
    txId: tx.id,
    by: loan.by || 'finance'
  };
  rows.push(item);
  writeSheetObjects_('FIN_Loans', headers, rows);
  return { loan: item, tx: tx };
}

function returnLoan(ret) {
  var headers = ['id', 'loan', 'date', 'fy', 'fund', 'voucherNo', 'voucher', 'cashNo', 'cash', 'loc', 'bank', 'txId', 'by'];
  var rows = readSheetObjects_('FIN_LoanRets', headers);
  var cashAmt = parseNum_(ret.cash);
  var voucherAmt = parseNum_(ret.voucher);
  var txId = '';
  if (cashAmt > 0) {
    var tx = saveTransaction({
      id: genId_('TX'),
      date: ret.date || todayISO_(),
      fy: Number(ret.fy),
      fund: ret.fund,
      doc: ret.cashNo || ('บร ' + (rows.length + 1) + '/' + ret.fy),
      desc: 'รับคืนเงินยืมเหลือจ่าย (' + (ret.borrower || '') + ')',
      rec: cashAmt,
      pay: 0,
      loc: ret.loc || 'bank',
      kind: 'normal',
      by: ret.by || 'finance',
      bank: ret.bank || ''
    });
    txId = tx.id;
  }
  var item = {
    id: genId_('LR'),
    loan: ret.loan,
    date: ret.date || todayISO_(),
    fy: Number(ret.fy),
    fund: ret.fund,
    voucherNo: ret.voucherNo || '',
    voucher: voucherAmt,
    cashNo: ret.cashNo || '',
    cash: cashAmt,
    loc: ret.loc || 'bank',
    bank: ret.bank || '',
    txId: txId,
    by: ret.by || 'finance'
  };
  rows.push(item);
  writeSheetObjects_('FIN_LoanRets', headers, rows);
  return item;
}

function saveSubsidy(sub) {
  var headers = ['id', 'fy', 'level', 'count', 'small', 'total', 'by', 'date', 'grades', 'rates', 'amounts'];
  var rows = readSheetObjects_('FIN_Subsidy', headers);
  var item = {
    id: sub.id || genId_('SB'),
    fy: Number(sub.fy),
    level: sub.level,
    count: parseNum_(sub.count),
    small: Boolean(sub.small),
    total: parseNum_(sub.total),
    by: sub.by || 'staff',
    date: todayISO_(),
    grades: JSON.stringify(sub.grades || []),
    rates: JSON.stringify(sub.rates || {}),
    amounts: JSON.stringify(sub.amounts || {})
  };
  var idx = rows.findIndex(function (r) { return Number(r.fy) === item.fy && r.level === item.level; });
  if (idx >= 0) rows[idx] = item; else rows.push(item);
  writeSheetObjects_('FIN_Subsidy', headers, rows);
  return item;
}

function saveAlloc(fy, docObj, byUser) {
  var headers = ['fy', 'json', 'by', 'date'];
  var rows = readSheetObjects_('FIN_Alloc', headers);
  var idx = rows.findIndex(function (r) { return Number(r.fy) === Number(fy); });
  var rec = { fy: Number(fy), json: JSON.stringify(docObj), by: byUser || 'staff', date: todayISO_() };
  if (idx >= 0) rows[idx] = rec; else rows.push(rec);
  writeSheetObjects_('FIN_Alloc', headers, rows);
  return { ok: true };
}

function saveDirectorEval(list) {
  var headers = ['id', 'aspect', 'indicator', 'target', 'result', 'score', 'weight', 'evidence'];
  writeSheetObjects_('FIN_DirectorEval', headers, list || []);
  return { ok: true };
}

function saveSettings(settings) {
  var headers = ['key', 'value'];
  var rows = Object.keys(settings).map(function (k) {
    return { key: k, value: String(settings[k] || '') };
  });
  writeSheetObjects_('FIN_Settings', headers, rows);
  return { ok: true };
}

function saveBank(bank) {
  var headers = ['id', 'bank', 'accountNo', 'accountName', 'note', 'active'];
  var rows = readSheetObjects_('FIN_Banks', headers);
  var item = {
    id: bank.id || genId_('BK'),
    bank: bank.bank,
    accountNo: bank.accountNo,
    accountName: bank.accountName,
    note: bank.note || '',
    active: bank.active !== false
  };
  var idx = rows.findIndex(function (r) { return r.id === item.id; });
  if (idx >= 0) rows[idx] = item; else rows.push(item);
  writeSheetObjects_('FIN_Banks', headers, rows);
  return item;
}

function saveReceipt(entry) {
  var headers = ['id', 'fy', 'bookNo', 'receiptNo', 'date', 'desc', 'payer', 'amount', 'collector', 'cancelled'];
  var rows = readSheetObjects_('FIN_Receipts', headers);
  var item = {
    id: entry.id || genId_('RC'),
    fy: Number(entry.fy),
    bookNo: entry.bookNo,
    receiptNo: entry.receiptNo,
    date: entry.date || todayISO_(),
    desc: entry.desc,
    payer: entry.payer,
    amount: parseNum_(entry.amount),
    collector: entry.collector || '',
    cancelled: Boolean(entry.cancelled)
  };
  rows.push(item);
  writeSheetObjects_('FIN_Receipts', headers, rows);
  return item;
}

function saveThaiReport(tabName, titleRows, tableHeaders, tableRows) {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(tabName) || ss.insertSheet(tabName);
  sh.clear();

  var rowCursor = 1;
  if (titleRows && titleRows.length) {
    titleRows.forEach(function (t) {
      sh.getRange(rowCursor, 1).setValue(t).setFontWeight('bold').setFontSize(12);
      rowCursor++;
    });
    rowCursor++;
  }

  if (tableHeaders && tableHeaders.length) {
    sh.getRange(rowCursor, 1, 1, tableHeaders.length)
      .setValues([tableHeaders])
      .setFontWeight('bold')
      .setBackground('#14306b')
      .setFontColor('#ffffff');
    rowCursor++;
  }

  if (tableRows && tableRows.length) {
    sh.getRange(rowCursor, 1, tableRows.length, tableHeaders.length).setValues(tableRows);
  }
  sh.autoResizeColumns(1, Math.max(1, (tableHeaders || []).length));
  return { ok: true, tabName: tabName };
}

function savePdfToDrive(fileName, base64Data, folderId, fy, reportKey, reportTitle, byUser) {
  var decoded = Utilities.base64Decode(base64Data);
  var blob = Utilities.newBlob(decoded, 'application/pdf', fileName);
  var folder = folderId ? DriveApp.getFolderById(folderId) : DriveApp.getRootFolder();
  var file = folder.createFile(blob);
  var url = file.getUrl();

  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName('คลังเอกสาร_PDF');
  if (sh) {
    sh.appendRow([genId_('PDF'), fy, reportKey, reportTitle, fileName, url, todayISO_(), byUser || 'staff']);
  }
  return { url: url, name: file.getName() };
}
`;
}

export function generateIndexHtml(schoolName?: string): string {
  const safeSchool = (schoolName || 'โรงเรียนบ้านคอนศรีบะสะแบง').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const closingScript = '</' + 'script>';

  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ระบบบริหารการเงินสถานศึกษา - ${safeSchool}</title>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Sarabun:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11">${closingScript}
  <style>
    :root {
      --navy: #14306b;
      --navy-dark: #0f234f;
      --blue: #2563eb;
      --bg: #f8fafc;
      --card: #ffffff;
      --border: #cbd5e1;
      --text: #0f172a;
      --muted: #64748b;
      --green: #059669;
      --red: #dc2626;
      --amber: #d97706;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: 'Sarabun', sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: var(--text);
      background: var(--bg);
    }
    .num { font-family: 'IBM Plex Mono', 'Sarabun', monospace; font-variant-numeric: tabular-nums; }
    .app-shell { display: flex; min-height: 100vh; }
    .sidebar {
      width: 248px;
      background: var(--navy);
      color: #e2e8f0;
      padding: 16px 12px;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .brand { padding: 8px 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.14); margin-bottom: 6px; }
    .brand h1 { margin: 0; font-size: 15px; color: #ffffff; font-weight: 700; }
    .brand p { margin: 2px 0 0; font-size: 12px; color: #93c5fd; }
    .nav-btn {
      width: 100%; text-align: left; border: none; background: transparent;
      color: #cbd5e1; padding: 9px 12px; border-radius: 8px;
      font-family: inherit; font-size: 13.5px; font-weight: 500; cursor: pointer;
    }
    .nav-btn:hover { background: rgba(255,255,255,0.1); color: #ffffff; }
    .nav-btn.active { background: #ffffff; color: var(--navy); font-weight: 700; }

    .main-area { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .topbar {
      background: #ffffff; border-bottom: 1px solid var(--border);
      padding: 12px 20px; display: flex; flex-wrap: wrap; gap: 10px;
      align-items: center; justify-content: space-between;
    }
    .content { padding: 18px 20px; max-width: 1380px; width: 100%; }
    .card {
      background: var(--card); border: 1px solid var(--border);
      border-radius: 10px; padding: 16px; margin-bottom: 16px;
    }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; margin-bottom: 16px; }
    .kpi { background: #ffffff; border: 1px solid var(--border); border-radius: 10px; padding: 14px; }
    .kpi-label { font-size: 12px; color: var(--muted); }
    .kpi-val { font-size: 22px; font-weight: 700; margin-top: 4px; color: var(--navy); }
    .subtabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
    .subtab {
      border: 1px solid var(--border); background: #ffffff; color: #334155;
      padding: 7px 12px; border-radius: 7px; font-family: inherit; font-size: 12.5px;
      font-weight: 600; cursor: pointer; white-space: nowrap;
    }
    .subtab.active { background: var(--navy); border-color: var(--navy); color: #ffffff; }

    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      border-radius: 7px; padding: 7px 13px; font-family: inherit; font-size: 12.5px;
      font-weight: 600; cursor: pointer; border: 1px solid transparent; white-space: nowrap;
    }
    .btn-primary { background: var(--navy); color: #ffffff; }
    .btn-primary:hover { background: var(--navy-dark); }
    .btn-green { background: var(--green); color: #ffffff; }
    .btn-outline { background: #ffffff; border-color: var(--border); color: #1e293b; }
    .btn-outline:hover { background: #f1f5f9; }
    .btn-danger { background: #fee2e2; color: #b91c1c; border-color: #fecaca; }

    .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(175px, 1fr)); gap: 10px; }
    label.field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; color: #334155; }
    input, select, textarea {
      width: 100%; border: 1px solid var(--border); border-radius: 7px;
      padding: 7px 10px; font-family: inherit; font-size: 13px; background: #ffffff; color: var(--text);
    }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; vertical-align: middle; }
    th { background: #f1f5f9; font-weight: 700; color: #1e293b; text-align: left; }
    .tr { text-align: right; }
    .tc { text-align: center; }
    .text-green { color: var(--green); font-weight: 600; }
    .text-red { color: var(--red); font-weight: 600; }
    .doc-header { border-bottom: 2px solid var(--navy); padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end; }
    .hint { font-size: 11.5px; color: var(--muted); }

    @media (max-width: 900px) {
      .app-shell { flex-direction: column; }
      .sidebar { width: 100%; flex-direction: row; overflow-x: auto; }
      .brand { display: none; }
      .nav-btn { width: auto; white-space: nowrap; }
    }
    @media print {
      .no-print, .sidebar, .topbar, .subtabs { display: none !important; }
      body, .main-area, .content, .card { background: #ffffff !important; border: none !important; padding: 0 !important; margin: 0 !important; }
      input, select, textarea { border: none !important; padding: 0 !important; background: transparent !important; appearance: none; }
      tr { page-break-inside: avoid; break-inside: avoid; }
      th { background: #f1f5f9 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
  <style id="gas-print-page-style">@media print { @page { size: A4 portrait; margin: 1.4cm 1.2cm; } }</style>
</head>
<body>
  <div class="app-shell">
    <aside class="sidebar no-print">
      <div class="brand">
        <h1 id="sb-school">${safeSchool}</h1>
        <p>ระบบบริหารการเงินสถานศึกษา</p>
      </div>
      <button class="nav-btn active" onclick="switchPage('dash', this)">แดชบอร์ดภาพรวม</button>
      <button class="nav-btn" onclick="switchPage('plan', this)">ระบบแผน / งบประมาณ</button>
      <button class="nav-btn" onclick="switchPage('fin', this)">ระบบควบคุมการเงิน</button>
      <button class="nav-btn" onclick="switchPage('docs', this)">เอกสารราชการ &amp; ส่งออก</button>
      <button class="nav-btn" onclick="switchPage('eval', this)">ประเมินสัมฤทธิผลฯ ผอ. (PA)</button>
      <button class="nav-btn" onclick="switchPage('set', this)">ตั้งค่าระบบ</button>
    </aside>

    <div class="main-area">
      <header class="topbar no-print">
        <div>
          <strong id="page-title" style="font-size:16px;color:var(--navy)">แดชบอร์ดภาพรวมการเงิน</strong>
          <div class="hint" id="page-sub">ปีงบประมาณ พ.ศ. 2570 · เชื่อมต่อ Google Apps Script</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <label style="font-size:12px;font-weight:600">ปีงบประมาณ:
            <select id="fy-select" style="width:92px;display:inline-block" onchange="changeFy(this.value)">
              <option value="2568">2568</option>
              <option value="2569">2569</option>
              <option value="2570" selected>2570</option>
              <option value="2571">2571</option>
            </select>
          </label>
          <button class="btn btn-outline" onclick="reloadAll()">รีเฟรช Google Sheets</button>
        </div>
      </header>

      <main class="content" id="view-container">
        <div class="card">กำลังโหลดข้อมูลจาก Google Sheets...</div>
      </main>
    </div>
  </div>

  <script>
    var DB = {
      funds: [], transactions: [], settings: {}, assets: {},
      allocDocs: {}, plans: [], requests: [], loans: [],
      loanRets: [], subsidies: [], banks: [], users: [],
      receipts: [], receiptReqs: [], directorEval: [], pdfArchive: []
    };
    var FY = 2570;
    var PAGE = 'dash';
    var FIN_TAB = 'ledger';
    var DOC_TAB = 'cashbook';
    var ORIENTATION = 'landscape';

    var TH_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

    function esc(s) {
      return String(s === undefined || s === null ? '' : s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function nRound(v) { return Math.round((Number(v) || 0) * 100) / 100; }
    function fmt(n) { return (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function todayISO() { return new Date().toISOString().slice(0, 10); }
    function thDate(iso) {
      if (!iso) return '-';
      var p = String(iso).slice(0, 10).split('-');
      if (p.length !== 3) return iso;
      return Number(p[2]) + ' ' + (TH_MONTHS[Number(p[1]) - 1] || p[1]) + ' ' + (Number(p[0]) + 543);
    }
    function locThai(loc) {
      if (loc === 'cash') return 'เงินสด';
      if (loc === 'bank') return 'เงินฝากธนาคาร';
      if (loc === 'depo') return 'ฝากส่วนราชการ';
      return loc || '-';
    }
    function fundName(id) {
      var f = DB.funds.find(function (x) { return x.id === id; });
      return f ? f.name : id;
    }

    /** Core Receive/Pay Guard matching Thai School Accounting Rules */
    function splitRecPay(tx) {
      var doc = String(tx.doc || '').trim();
      var desc = String(tx.desc || '').trim();
      var rec = Number(tx.rec) || 0;
      var pay = Number(tx.pay) || 0;
      if (rec < 0 && pay === 0) { pay = Math.abs(rec); rec = 0; }
      else if (pay < 0 && rec === 0) { rec = Math.abs(pay); pay = 0; }
      if (/^(บค|บจ)/i.test(doc) && rec > 0 && pay === 0 && !/รับคืน|ยกมา/i.test(desc)) {
        pay = rec; rec = 0;
      }
      return { rec: rec > 0 ? rec : 0, pay: pay > 0 ? pay : 0 };
    }

    function computeBalances() {
      var rows = DB.funds.map(function (f) {
        var txs = DB.transactions.filter(function (t) { return Number(t.fy) === Number(FY) && t.fund === f.id; });
        var open = 0, rec = 0, pay = 0, cash = 0, bank = 0, depo = 0;
        txs.forEach(function (t) {
          var rp = splitRecPay(t);
          if (t.kind === 'open' && rp.rec > 0) open += rp.rec;
          else { rec += rp.rec; pay += rp.pay; }
          var delta = rp.rec - rp.pay;
          if (t.loc === 'cash') cash += delta;
          else if (t.loc === 'depo') depo += delta;
          else bank += delta;
        });
        return {
          id: f.id, name: f.name, open: nRound(open), rec: nRound(rec), pay: nRound(pay),
          bal: nRound(open + rec - pay), cash: nRound(cash), bank: nRound(bank), depo: nRound(depo)
        };
      });
      return rows;
    }

    function setPrintOrientation(ori) {
      ORIENTATION = ori === 'landscape' ? 'landscape' : 'portrait';
      var st = document.getElementById('gas-print-page-style');
      if (st) {
        st.textContent = ORIENTATION === 'landscape'
          ? '@media print { @page { size: A4 landscape; margin: 1cm 1.1cm; } }'
          : '@media print { @page { size: A4 portrait; margin: 1.4cm 1.2cm; } }';
      }
    }

    function callGas(fnName) {
      var args = Array.prototype.slice.call(arguments, 1);
      return new Promise(function (resolve, reject) {
        if (typeof google === 'undefined' || !google.script || !google.script.run) {
          reject(new Error('กรุณาเปิดไฟล์นี้ผ่าน Google Apps Script Web App'));
          return;
        }
        var runner = google.script.run
          .withSuccessHandler(resolve)
          .withFailureHandler(function (err) { reject(new Error(err && err.message ? err.message : String(err))); });
        runner[fnName].apply(runner, args);
      });
    }

    function reloadAll() {
      Swal.fire({ title: 'กำลังโหลดข้อมูล...', allowOutsideClick: false, didOpen: function(){ Swal.showLoading(); } });
      callGas('getInitialData').then(function (data) {
        DB = data;
        document.getElementById('sb-school').textContent = DB.settings.schoolName || 'สถานศึกษา';
        Swal.close();
        renderPage();
      }).catch(function (err) {
        Swal.fire('ไม่สามารถโหลดข้อมูลได้', err.message, 'error');
      });
    }

    function switchPage(page, btn) {
      PAGE = page;
      document.querySelectorAll('.nav-btn').forEach(function (b) { b.classList.remove('active'); });
      if (btn) btn.classList.add('active');
      renderPage();
    }

    function changeFy(val) {
      FY = Number(val) || 2570;
      renderPage();
    }

    function docHeaderHtml(title) {
      var s = DB.settings || {};
      return '<div class="doc-header">' +
        '<div>' +
          '<div style="font-size:16px;font-weight:700">' + esc(s.schoolName || '${safeSchool}') + '</div>' +
          '<div class="hint">' + esc(s.affiliation || '') + ' อ.' + esc(s.district || '-') + ' จ.' + esc(s.province || '-') + '</div>' +
        '</div>' +
        '<div style="text-align:right">' +
          '<div style="font-weight:700">ปีงบประมาณ พ.ศ. ' + FY + '</div>' +
          '<div class="hint">' + esc(title) + '</div>' +
        '</div>' +
      '</div>';
    }

    function renderPage() {
      var c = document.getElementById('view-container');
      var titleEl = document.getElementById('page-title');
      var subEl = document.getElementById('page-sub');
      subEl.textContent = 'ปีงบประมาณ พ.ศ. ' + FY + ' · ' + (DB.settings.schoolName || '');

      if (PAGE === 'dash') {
        titleEl.textContent = 'แดชบอร์ดภาพรวมการเงิน';
        c.innerHTML = renderDashboard();
      } else if (PAGE === 'plan') {
        titleEl.textContent = 'ระบบแผนงาน / โครงการและงบประมาณ';
        c.innerHTML = renderPlans();
      } else if (PAGE === 'fin') {
        titleEl.textContent = 'ระบบควบคุมการเงิน (สมุดบัญชี / ทะเบียนคุม)';
        c.innerHTML = renderFinance();
      } else if (PAGE === 'docs') {
        titleEl.textContent = 'เอกสารราชการและส่งออก (Word / PDF / A4)';
        setPrintOrientation(DOC_TAB === 'cashbook' ? 'landscape' : ORIENTATION);
        c.innerHTML = renderDocs();
      } else if (PAGE === 'eval') {
        titleEl.textContent = 'ประเมินสัมฤทธิผลฯ ผู้อำนวยการสถานศึกษา (PA)';
        setPrintOrientation('portrait');
        c.innerHTML = renderEval();
      } else if (PAGE === 'set') {
        titleEl.textContent = 'ตั้งค่าระบบและฐานข้อมูล';
        c.innerHTML = renderSettings();
      }
    }

    function renderDashboard() {
      var rows = computeBalances();
      var tOpen = 0, tRec = 0, tPay = 0, tBal = 0, tCash = 0, tBank = 0;
      rows.forEach(function (r) { tOpen += r.open; tRec += r.rec; tPay += r.pay; tBal += r.bal; tCash += r.cash; tBank += r.bank; });
      return '<div class="kpi-grid">' +
        '<div class="kpi"><div class="kpi-label">ยอดยกมา + เงินรับรวม</div><div class="kpi-val num">' + fmt(tOpen + tRec) + ' ฿</div></div>' +
        '<div class="kpi"><div class="kpi-label">เบิกจ่ายสะสม</div><div class="kpi-val num" style="color:var(--red)">' + fmt(tPay) + ' ฿</div></div>' +
        '<div class="kpi"><div class="kpi-label">คงเหลือสุทธิ</div><div class="kpi-val num" style="color:var(--green)">' + fmt(tBal) + ' ฿</div></div>' +
        '<div class="kpi"><div class="kpi-label">เงินสดในมือ / เงินฝากธนาคาร</div><div class="kpi-val num" style="font-size:15px">' + fmt(tCash) + ' / ' + fmt(tBank) + ' ฿</div></div>' +
      '</div>' +
      '<div class="card"><h3 style="margin-top:0">สรุปสถานะการเงินแยกตามประเภทเงิน ปี ' + FY + '</h3>' +
      '<div class="table-wrap"><table><thead><tr><th>ประเภทเงิน</th><th class="tr">ยกมา</th><th class="tr">รับระหว่างปี</th><th class="tr">จ่ายระหว่างปี</th><th class="tr">เงินสด</th><th class="tr">ธนาคาร</th><th class="tr">คงเหลือ</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td>' + esc(r.name) + '</td><td class="tr num">' + fmt(r.open) + '</td><td class="tr num text-green">' + fmt(r.rec) + '</td><td class="tr num text-red">' + fmt(r.pay) + '</td><td class="tr num">' + fmt(r.cash) + '</td><td class="tr num">' + fmt(r.bank) + '</td><td class="tr num"><strong>' + fmt(r.bal) + '</strong></td></tr>';
      }).join('') +
      '</tbody></table></div></div>';
    }

    function renderFinance() {
      var tabs = '<div class="subtabs">' +
        '<button class="subtab ' + (FIN_TAB==='ledger'?'active':'') + '" onclick="FIN_TAB=\\'ledger\\';renderPage()">1. บันทึกรับ-จ่าย (สมุดเงินสด)</button>' +
        '<button class="subtab ' + (FIN_TAB==='reg'?'active':'') + '" onclick="FIN_TAB=\\'reg\\';setPrintOrientation(\\'landscape\\');renderPage()">2. ทะเบียนคุมเงินนอกงบฯ</button>' +
        '<button class="subtab ' + (FIN_TAB==='daily'?'active':'') + '" onclick="FIN_TAB=\\'daily\\';setPrintOrientation(\\'portrait\\');renderPage()">3. รายงานคงเหลือประจำวัน</button>' +
      '</div>';

      if (FIN_TAB === 'ledger') {
        var txs = DB.transactions.filter(function (t) { return Number(t.fy) === Number(FY); }).slice().sort(function (a,b) { return a.date < b.date ? 1 : -1; });
        var form = '<div class="card"><h3 style="margin-top:0">ลงรายการรับ - จ่ายเงิน</h3>' +
          '<form onsubmit="submitTx(event)" class="form-grid">' +
            '<label class="field">วันที่<input id="tx-date" type="date" value="' + todayISO() + '" required /></label>' +
            '<label class="field">ประเภทเงิน<select id="tx-fund">' + DB.funds.map(function(f){ return '<option value="'+esc(f.id)+'">'+esc(f.name)+'</option>'; }).join('') + '</select></label>' +
            '<label class="field">ชนิดเอกสาร<select id="tx-pre" onchange="onPreChange(this.value)"><option value="บจ">บจ (จ่ายเงิน)</option><option value="บค">บค (ใบสำคัญจ่าย)</option><option value="บร">บร (รับเงิน)</option><option value="open">ยอดยกมา</option></select></label>' +
            '<label class="field">เลขที่เอกสาร<input id="tx-doc" placeholder="เช่น บค 1/2570" required /></label>' +
            '<label class="field">รายการ<input id="tx-desc" placeholder="รายละเอียด" required /></label>' +
            '<label class="field">รับ (บาท)<input id="tx-rec" type="number" step="0.01" min="0" value="0" /></label>' +
            '<label class="field">จ่าย (บาท)<input id="tx-pay" type="number" step="0.01" min="0" value="0" /></label>' +
            '<label class="field">แหล่งเก็บ<select id="tx-loc"><option value="bank">เงินฝากธนาคาร</option><option value="cash">เงินสดในมือ</option><option value="depo">ฝากส่วนราชการ</option></select></label>' +
            '<div style="display:flex;align-items:flex-end"><button type="submit" class="btn btn-primary">บันทึกลง Google Sheet</button></div>' +
          '</form>' +
          '<div class="hint" style="margin-top:6px">* ระบบบังคับให้เอกสาร บค / บจ ลงช่องจ่ายโดยอัตโนมัติ ป้องกันตัวเลขติดลบในช่องรับ</div>' +
        '</div>';

        var table = '<div class="card"><div class="table-wrap"><table><thead><tr><th>วันที่</th><th>ที่เอกสาร</th><th>ประเภทเงิน</th><th>รายการ</th><th class="tr">รับ</th><th class="tr">จ่าย</th><th>แหล่งเก็บ</th><th class="tc">ลบ</th></tr></thead><tbody>' +
          txs.map(function (t) {
            var rp = splitRecPay(t);
            return '<tr><td>' + thDate(t.date) + '</td><td>' + esc(t.doc || '-') + '</td><td>' + esc(fundName(t.fund)) + '</td><td>' + esc(t.desc) + '</td>' +
              '<td class="tr num text-green">' + (rp.rec > 0 ? fmt(rp.rec) : '-') + '</td>' +
              '<td class="tr num text-red">' + (rp.pay > 0 ? fmt(rp.pay) : '-') + '</td>' +
              '<td>' + esc(locThai(t.loc)) + '</td>' +
              '<td class="tc"><button class="btn btn-danger" onclick="removeTx(\\'' + esc(t.id) + '\\')">ลบ</button></td></tr>';
          }).join('') +
        '</tbody></table></div></div>';
        return tabs + form + table;
      }

      if (FIN_TAB === 'reg') {
        return tabs + '<div class="card">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
            '<strong>ทะเบียนคุมเงินนอกงบประมาณ (แนะนำ A4 แนวนอน)</strong>' +
            '<button class="btn btn-primary" onclick="printWithOrientation(\\'landscape\\')">พิมพ์ A4 แนวนอน</button>' +
          '</div>' +
          renderCashbookHtml() +
        '</div>';
      }

      return tabs + '<div class="card">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
          '<strong>รายงานเงินคงเหลือประจำวัน (A4 แนวตั้ง)</strong>' +
          '<button class="btn btn-primary" onclick="printWithOrientation(\\'portrait\\')">พิมพ์ A4 แนวตั้ง</button>' +
        '</div>' +
        renderDailyBalanceHtml() +
      '</div>';
    }

    function onPreChange(val) {
      var recEl = document.getElementById('tx-rec');
      var payEl = document.getElementById('tx-pay');
      if (val === 'บค' || val === 'บจ') { if (recEl) recEl.value = '0'; }
      else if (val === 'บร' || val === 'open') { if (payEl) payEl.value = '0'; }
    }

    function submitTx(e) {
      e.preventDefault();
      var pre = document.getElementById('tx-pre').value;
      var rec = Number(document.getElementById('tx-rec').value) || 0;
      var pay = Number(document.getElementById('tx-pay').value) || 0;
      var doc = document.getElementById('tx-doc').value.trim();
      var desc = document.getElementById('tx-desc').value.trim();
      if ((pre === 'บค' || pre === 'บจ') && rec > 0 && pay === 0) {
        pay = rec; rec = 0;
      }
      var tx = {
        date: document.getElementById('tx-date').value,
        fy: FY,
        fund: document.getElementById('tx-fund').value,
        doc: doc,
        desc: desc,
        rec: rec,
        pay: pay,
        loc: document.getElementById('tx-loc').value,
        kind: pre === 'open' ? 'open' : 'normal',
        by: 'admin'
      };
      Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: function(){ Swal.showLoading(); } });
      callGas('saveTransaction', tx).then(function (saved) {
        DB.transactions.push(saved);
        Swal.fire('บันทึกสำเร็จ', 'แยกลงรับ/จ่ายเรียบร้อยแล้ว', 'success');
        renderPage();
      }).catch(function (err) { Swal.fire('ข้อผิดพลาด', err.message, 'error'); });
    }

    function removeTx(id) {
      Swal.fire({ title: 'ยืนยันการลบรายการ?', icon: 'warning', showCancelButton: true, confirmButtonText: 'ลบ' }).then(function (r) {
        if (!r.isConfirmed) return;
        callGas('deleteTransaction', id).then(function () {
          DB.transactions = DB.transactions.filter(function (x) { return x.id !== id; });
          renderPage();
        });
      });
    }

    function renderCashbookHtml() {
      var list = DB.transactions.filter(function (t) { return Number(t.fy) === Number(FY); }).slice().sort(function (a,b) { return a.date < b.date ? -1 : 1; });
      var tRec = 0, tPay = 0;
      var body = list.map(function (t) {
        var rp = splitRecPay(t);
        tRec += rp.rec; tPay += rp.pay;
        return '<tr><td>' + thDate(t.date) + '</td><td>' + esc(t.doc || '-') + '</td><td>' + esc(fundName(t.fund)) + '</td><td>' + esc(t.desc) + '</td>' +
          '<td class="tr num">' + (rp.rec > 0 ? fmt(rp.rec) : '-') + '</td><td class="tr num">' + (rp.pay > 0 ? fmt(rp.pay) : '-') + '</td><td>' + esc(locThai(t.loc)) + '</td></tr>';
      }).join('');
      return docHeaderHtml('สมุดเงินสดรับ - จ่าย (A4 แนวนอน)') +
        '<div class="table-wrap"><table><thead><tr><th>วันที่</th><th>ที่เอกสาร</th><th>ประเภทเงิน</th><th>รายการ</th><th class="tr">รับ (บาท)</th><th class="tr">จ่าย (บาท)</th><th>แหล่งเก็บ</th></tr></thead>' +
        '<tbody>' + body + '</tbody>' +
        '<tfoot><tr style="font-weight:700;background:#eef2ff"><td colspan="4" class="tr">รวมทั้งสิ้น</td><td class="tr num">' + fmt(tRec) + '</td><td class="tr num">' + fmt(tPay) + '</td><td>คงเหลือ ' + fmt(tRec - tPay) + '</td></tr></tfoot></table></div>';
    }

    function renderDailyBalanceHtml() {
      var rows = computeBalances();
      var sc = 0, sb = 0, sd = 0, st = 0;
      var body = rows.map(function (r) {
        sc += r.cash; sb += r.bank; sd += r.depo; st += r.bal;
        return '<tr><td>' + esc(r.name) + '</td><td class="tr num">' + fmt(r.cash) + '</td><td class="tr num">' + fmt(r.bank) + '</td><td class="tr num">' + fmt(r.depo) + '</td><td class="tr num"><strong>' + fmt(r.bal) + '</strong></td></tr>';
      }).join('');
      return docHeaderHtml('รายงานเงินคงเหลือประจำวัน (A4 แนวตั้ง)') +
        '<table><thead><tr><th>ประเภทเงิน</th><th class="tr">เงินสดในมือ</th><th class="tr">เงินฝากธนาคาร</th><th class="tr">เงินฝากส่วนราชการ</th><th class="tr">รวมคงเหลือ</th></tr></thead>' +
        '<tbody>' + body + '<tr style="font-weight:700;background:#eef2ff"><td>รวมทั้งสิ้น</td><td class="tr num">' + fmt(sc) + '</td><td class="tr num">' + fmt(sb) + '</td><td class="tr num">' + fmt(sd) + '</td><td class="tr num">' + fmt(st) + '</td></tr></tbody></table>';
    }

    function renderDocs() {
      var isLand = DOC_TAB === 'cashbook';
      var oriLabel = ORIENTATION === 'landscape' ? 'A4 แนวนอน' : 'A4 แนวตั้ง';
      var tabs = '<div class="subtabs">' +
        '<button class="subtab ' + (DOC_TAB==='cashbook'?'active':'') + '" onclick="DOC_TAB=\\'cashbook\\';setPrintOrientation(\\'landscape\\');renderPage()">สมุดเงินสด (แนวนอน)</button>' +
        '<button class="subtab ' + (DOC_TAB==='daily'?'active':'') + '" onclick="DOC_TAB=\\'daily\\';setPrintOrientation(\\'portrait\\');renderPage()">รายงานคงเหลือประจำวัน (แนวตั้ง)</button>' +
        '<button class="subtab ' + (DOC_TAB==='part3'?'active':'') + '" onclick="DOC_TAB=\\'part3\\';setPrintOrientation(\\'portrait\\');renderPage()">ส่วนที่ 3 เงินคงเหลือตามประเภท</button>' +
      '</div>';
      var bar = '<div class="card no-print" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">' +
        '<div><strong>หน้ากระดาษ:</strong> ' + oriLabel + ' <button class="btn btn-outline" onclick="setPrintOrientation(ORIENTATION===\\'landscape\\'?\\'portrait\\':\\'landscape\\');renderPage()">สลับ แนวตั้ง/แนวนอน</button></div>' +
        '<div style="display:flex;gap:8px">' +
          '<button class="btn btn-outline" onclick="exportDocWord()">ส่งออก Word (.doc)</button>' +
          '<button class="btn btn-primary" onclick="printWithOrientation(ORIENTATION)">พิมพ์ / บันทึก PDF (' + oriLabel + ')</button>' +
        '</div>' +
      '</div>';

      var body = DOC_TAB === 'cashbook' ? renderCashbookHtml() : renderDailyBalanceHtml();
      return tabs + bar + '<div class="card" id="doc-print-box">' + body + '</div>';
    }

    function printWithOrientation(ori) {
      setPrintOrientation(ori);
      setTimeout(function () { window.print(); }, 100);
    }

    function exportDocWord() {
      var box = document.getElementById('doc-print-box');
      if (!box) return;
      var pageCss = ORIENTATION === 'landscape'
        ? 'size: 29.7cm 21cm; mso-page-orientation: landscape; margin: 1.2cm;'
        : 'size: 21cm 29.7cm; mso-page-orientation: portrait; margin: 1.4cm;';
      var html = '<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" lang="th"><head><meta charset="utf-8"><style>@page Section1 {' + pageCss + '} div.Section1 { page: Section1; } body { font-family: "TH SarabunPSK","Sarabun",sans-serif; font-size: 14pt; } table { width:100%; border-collapse:collapse; } th,td { border:1px solid #333; padding:4pt 6pt; } .tr{text-align:right}</style></head><body><div class="Section1">' + box.innerHTML + '</div></body></html>';
      var blob = new Blob(['\\ufeff', html], { type: 'application/msword;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'เอกสารการเงิน_' + DOC_TAB + '_' + FY + '.doc';
      a.click();
    }

    function renderPlans() {
      var list = DB.plans.filter(function (p) { return Number(p.fy) === Number(FY); });
      return '<div class="card"><h3 style="margin-top:0">โครงการตามแผนปฏิบัติการ ปีงบประมาณ ' + FY + '</h3>' +
        '<div class="table-wrap"><table><thead><tr><th>โครงการ</th><th>ฝ่ายงาน</th><th>ประเภทเงิน</th><th class="tr">งบตามแผน (บาท)</th></tr></thead><tbody>' +
        (list.length ? list.map(function (p) {
          return '<tr><td>' + esc(p.project) + '</td><td>' + esc(p.dept) + '</td><td>' + esc(fundName(p.fund)) + '</td><td class="tr num">' + fmt(p.amount) + '</td></tr>';
        }).join('') : '<tr><td colspan="4" class="tc hint">ยังไม่มีโครงการในปีงบประมาณนี้</td></tr>') +
        '</tbody></table></div></div>';
    }

    function renderEval() {
      var list = DB.directorEval || [];
      return '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
        '<strong>แบบประเมินสัมฤทธิผลการปฏิบัติงาน ผู้อำนวยการสถานศึกษา (PA)</strong>' +
        '<button class="btn btn-primary no-print" onclick="printWithOrientation(\\'portrait\\')">พิมพ์รายงาน (A4 แนวตั้ง)</button>' +
      '</div><table><thead><tr><th>ด้าน</th><th>ตัวชี้วัด</th><th class="tc">น้ำหนัก</th><th class="tc">คะแนน</th></tr></thead><tbody>' +
      (list.length ? list.map(function (d) {
        return '<tr><td>' + esc(d.aspect) + '</td><td>' + esc(d.indicator) + '</td><td class="tc num">' + d.weight + '%</td><td class="tc num">' + d.score + '</td></tr>';
      }).join('') : '<tr><td colspan="4" class="tc hint">ยังไม่มีรายการตัวชี้วัดใน Google Sheets</td></tr>') +
      '</tbody></table></div>';
    }

    function renderSettings() {
      var s = DB.settings || {};
      return '<div class="card"><h3 style="margin-top:0">ข้อมูลสถานศึกษา</h3>' +
        '<form onsubmit="saveSchoolForm(event)" class="form-grid">' +
          '<label class="field">ชื่อโรงเรียน<input id="s-name" value="' + esc(s.schoolName || '') + '" required /></label>' +
          '<label class="field">สังกัด<input id="s-aff" value="' + esc(s.affiliation || '') + '" /></label>' +
          '<label class="field">ผู้อำนวยการ<input id="s-dir" value="' + esc(s.director || '') + '" /></label>' +
          '<label class="field">เจ้าหน้าที่การเงิน<input id="s-fin" value="' + esc(s.financeName || '') + '" /></label>' +
          '<div style="display:flex;align-items:flex-end"><button type="submit" class="btn btn-primary">บันทึกข้อมูลลง Google Sheets</button></div>' +
        '</form></div>';
    }

    function saveSchoolForm(e) {
      e.preventDefault();
      var next = Object.assign({}, DB.settings, {
        schoolName: document.getElementById('s-name').value,
        affiliation: document.getElementById('s-aff').value,
        director: document.getElementById('s-dir').value,
        financeName: document.getElementById('s-fin').value
      });
      callGas('saveSettings', next).then(function () {
        DB.settings = next;
        Swal.fire('บันทึกสำเร็จ', '', 'success');
        renderPage();
      });
    }

    reloadAll();
  ${closingScript}
</body>
</html>
`;
}
