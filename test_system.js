const http = require('http');

function request(url, options = {}, data = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: options.method || 'GET',
      headers: options.headers || {}
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch (e) {}
        resolve({ statusCode: res.statusCode, headers: res.headers, body, json });
      });
    });
    req.on('error', reject);
    if (data) req.write(typeof data === 'string' ? data : JSON.stringify(data));
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Starting Automated System Verification...');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // 1. Check HTML
    const htmlRes = await request('http://localhost:3000/');
    assert(htmlRes.statusCode === 200 && htmlRes.body.includes('MAINTENANCE STOCK'), 'Serve index.html with title and brand');

    // 2. Check JS
    const jsRes = await request('http://localhost:3000/js/app.js');
    assert(jsRes.statusCode === 200 && jsRes.body.includes('appState'), 'Serve /js/app.js correctly');

    // 3. Check DB
    const dbRes = await request('http://localhost:3000/api/db');
    assert(dbRes.statusCode === 200 && dbRes.json.parts.length >= 370, `Load 376 factory parts (got: ${dbRes.json ? dbRes.json.parts.length : 0})`);

    // 4. Test Stock In
    const initialPart = dbRes.json.parts.find(p => p.partNumber === 'NA10');
    const prevStock = initialPart.currentStock;
    const inRes = await request('http://localhost:3000/api/stock-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      partNumber: 'NA10',
      quantity: 10,
      unitCost: 20,
      poNumber: 'TEST-PO-001',
      receiver: 'Test Auditor'
    });
    assert(inRes.statusCode === 200 && inRes.json.newBalance === prevStock + 10, `Stock In: balance updated (${prevStock} -> ${prevStock + 10})`);

    // 5. Test Over-issue prevention (Rule 2)
    const overIssueRes = await request('http://localhost:3000/api/stock-issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      partNumber: 'NA10',
      quantity: 999999,
      workOrder: 'WO-FAIL-TEST',
      maintenanceType: 'BM'
    });
    assert(overIssueRes.statusCode === 400 && overIssueRes.json.error.includes('ไม่อนุญาตให้เบิกเกิน'), 'Over-issue rejection (Rule 2 enforced)');

    // 6. Test Valid Stock Issue
    const validIssueRes = await request('http://localhost:3000/api/stock-issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      partNumber: 'NA10',
      quantity: 3,
      workOrder: 'WO-PASS-TEST',
      maintenanceType: 'Preventive Maintenance (PM)',
      machineCode: 'M-001',
      requester: 'Test Tech'
    });
    assert(validIssueRes.statusCode === 200 && validIssueRes.json.newBalance === prevStock + 7, `Valid Stock Issue: balance reduced by 3 (${prevStock + 10} -> ${prevStock + 7})`);

    // 7. Test Return Usable vs Damaged (Rule 6)
    const retUsableRes = await request('http://localhost:3000/api/stock-return', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      partNumber: 'NA10',
      quantity: 2,
      condition: 'New / Unused',
      returnedBy: 'Test Tech'
    });
    assert(retUsableRes.statusCode === 200 && retUsableRes.json.isUsable === true && retUsableRes.json.newBalance === prevStock + 9, 'Return New/Unused adds to Available Stock');

    const retDamagedRes = await request('http://localhost:3000/api/stock-return', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      partNumber: 'NA10',
      quantity: 5,
      condition: 'Damaged',
      returnedBy: 'Test Tech'
    });
    assert(retDamagedRes.statusCode === 200 && retDamagedRes.json.isUsable === false && retDamagedRes.json.newBalance === prevStock + 9, 'Return Damaged does NOT add to Available Stock (Rule 6)');

    // 8. Test Stock Adjustment (Rule 7)
    const adjRes = await request('http://localhost:3000/api/stock-adjust', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      partNumber: 'NA10',
      physicalQuantity: 50,
      adjustmentType: 'Stock Count',
      reason: 'Automated Test Count Reconciliation',
      approvedBy: 'Eng Manager'
    });
    assert(adjRes.statusCode === 200 && adjRes.json.newBalance === 50, 'Stock Adjustment reconciles physical count to 50');

    // 9. Verify Audit Log was recorded
    const finalDb = await request('http://localhost:3000/api/db');
    const latestAudit = finalDb.json.auditLogs[0];
    assert(latestAudit && latestAudit.action === 'STOCK_ADJUSTMENT' && latestAudit.newQty === 50, 'Immutable Audit Log recorded with previous/new/diff');

    console.log(`\n🏁 Test Results: ${passed} Passed, ${failed} Failed`);
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

runTests();
