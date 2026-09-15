const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
function getDBPath() {
  const rootPath = path.join(__dirname, 'inventory_db.json');
  const dataPath = path.join(__dirname, 'data', 'inventory_db.json');
  if (fs.existsSync(rootPath)) return rootPath;
  return dataPath;
}
const DB_PATH = getDBPath();

// MIME types for static files
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

// Connected Real-time SSE Clients
const sseClients = new Set();

function broadcastEvent(type, payload = {}) {
  const data = JSON.stringify({
    type,
    payload,
    version: currentDBVersion,
    timestamp: new Date().toISOString()
  });
  for (const client of sseClients) {
    try {
      client.write(`data: ${data}\n\n`);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

// In-memory version tracker
let currentDBVersion = Date.now();

// Read Database
function readDB() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const data = JSON.parse(raw);
    if (!data.version) data.version = currentDBVersion;
    return data;
  } catch (err) {
    console.error('Error reading DB:', err);
    return { parts: [], movements: [], auditLogs: [], machines: [], suppliers: [], stockCountRounds: [] };
  }
}

// Write Database
function saveDB(data) {
  try {
    currentDBVersion = Date.now();
    data.version = currentDBVersion;
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving DB:', err);
    return false;
  }
}

// Helper to send JSON response
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

// Helper to read JSON body
function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  // Health Check Endpoint (for Cloud Uptime & Render Keep-Alive)
  if (pathname === '/health' && method === 'GET') {
    return sendJSON(res, 200, {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      service: 'Maintenance Stock System'
    });
  }

  // 1. Real-Time Server-Sent Events (SSE) endpoint
  if (pathname === '/api/events' && method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', version: currentDBVersion, timestamp: new Date().toISOString() })}\n\n`);
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // API Endpoints
  if (pathname.startsWith('/api/')) {
    try {
      const db = readDB();

      // GET /api/version - Lightweight sync check
      if (pathname === '/api/version' && method === 'GET') {
        return sendJSON(res, 200, {
          version: currentDBVersion,
          lastUpdated: db.lastUpdated || new Date().toISOString(),
          activeClients: sseClients.size
        });
      }

      // GET /api/db - Get all inventory database
      if (pathname === '/api/db' && method === 'GET') {
        return sendJSON(res, 200, db);
      }

      // GET /api/parts - List all parts
      if (pathname === '/api/parts' && method === 'GET') {
        return sendJSON(res, 200, db.parts || []);
      }

      // POST /api/parts - Create or update part details (Edit details)
      if (pathname === '/api/parts' && method === 'POST') {
        const payload = await readRequestBody(req);
        if (!payload.partNumber && !payload.id) {
          return sendJSON(res, 400, { error: 'Item Code or ID is required' });
        }

        const existingIdx = db.parts.findIndex(p => (payload.id && p.id === payload.id) || p.partNumber === payload.partNumber);
        if (existingIdx >= 0) {
          const oldPart = db.parts[existingIdx];
          const oldStock = oldPart.currentStock || 0;
          
          // Check if currentStock was edited directly
          if (payload.currentStock !== undefined && payload.currentStock !== null && parseFloat(payload.currentStock) !== oldStock) {
            const newStock = parseFloat(payload.currentStock);
            const diff = newStock - oldStock;
            db.auditLogs.unshift({
              id: `AUD-${Date.now()}`,
              timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
              user: payload.editedBy || 'Data Editor',
              action: 'DATA_EDIT_STOCK',
              partNumber: oldPart.partNumber,
              previousQty: oldStock,
              newQty: newStock,
              difference: diff,
              reason: `แก้ไขข้อมูลหลังบ้าน: ปรับยอดสต็อกโดยตรง (${payload.editReason || 'ปรับปรุงข้อมูลอะไหล่'})`,
              reference: 'ADMIN-EDIT'
            });
            db.movements.unshift({
              id: `MOV-${Date.now()}`,
              transactionNo: `EDT-${Date.now().toString().slice(-6)}`,
              date: new Date().toISOString().replace('T', ' ').substring(0, 19),
              type: 'ADJUSTMENT',
              partNumber: oldPart.partNumber,
              partName: payload.partName || oldPart.partName,
              qtyIn: diff > 0 ? diff : 0,
              qtyOut: diff < 0 ? Math.abs(diff) : 0,
              balance: newStock,
              machine: 'Tool Room',
              user: payload.editedBy || 'Data Editor',
              refDoc: 'Data Edit',
              note: `แก้ไขยอดโดยตรง: ${payload.editReason || 'อัปเดตข้อมูลอะไหล่'}`
            });
          }

          db.parts[existingIdx] = {
            ...oldPart,
            ...payload,
            currentStock: payload.currentStock !== undefined ? parseFloat(payload.currentStock) : oldPart.currentStock,
            minStock: payload.minStock !== undefined ? parseFloat(payload.minStock) : oldPart.minStock,
            maxStock: payload.maxStock !== undefined ? parseFloat(payload.maxStock) : oldPart.maxStock,
            unitCost: payload.unitCost !== undefined ? parseFloat(payload.unitCost) : oldPart.unitCost
          };
        } else {
          const newId = `P-${String((db.parts.length || 0) + 1).padStart(4, '0')}`;
          const newPart = {
            id: newId,
            currentStock: parseFloat(payload.currentStock) || 0,
            minStock: parseFloat(payload.minStock) || 5,
            maxStock: parseFloat(payload.maxStock) || 50,
            reorderPoint: parseFloat(payload.reorderPoint) || 10,
            status: 'Active',
            unit: payload.unit || 'ชิ้น',
            location: payload.location || 'A-R01-S01-B01',
            ...payload
          };
          db.parts.unshift(newPart);
        }

        saveDB(db);
        broadcastEvent('PART_SAVED', { partNumber: payload.partNumber, partName: payload.partName });
        return sendJSON(res, 200, { success: true, message: 'บันทึกแก้ไขข้อมูลเรียบร้อยแล้ว' });
      }

      // GET /api/users - List all users
      if (pathname === '/api/users' && method === 'GET') {
        return sendJSON(res, 200, db.users || []);
      }

      // POST /api/users - Add or edit user details (including Developer itself)
      if (pathname === '/api/users' && method === 'POST') {
        const payload = await readRequestBody(req);
        if (!payload.name) {
          return sendJSON(res, 400, { error: 'กรุณาระบุชื่อผู้ใช้งาน' });
        }

        if (!db.users) db.users = [];

        let targetUser = null;
        if (payload.id) {
          // Edit existing user
          const idx = db.users.findIndex(u => u.id === payload.id);
          if (idx >= 0) {
            db.users[idx] = {
              ...db.users[idx],
              name: payload.name.trim(),
              role: payload.role || db.users[idx].role || 'Store',
              department: payload.department !== undefined ? payload.department : (db.users[idx].department || 'Tool Room'),
              email: payload.email !== undefined ? payload.email : (db.users[idx].email || ''),
              phone: payload.phone !== undefined ? payload.phone : (db.users[idx].phone || ''),
              active: payload.active !== undefined ? payload.active : true
            };
            targetUser = db.users[idx];

            db.auditLogs.unshift({
              id: `AUD-${Date.now()}`,
              timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
              user: payload.operatorName || 'Develop',
              action: 'USER_EDITED',
              partNumber: targetUser.id,
              previousQty: null,
              newQty: null,
              difference: null,
              reason: `แก้ไขข้อมูลผู้ใช้งาน: ${targetUser.name} (${targetUser.role})`,
              reference: targetUser.id
            });
          } else {
            return sendJSON(res, 404, { error: 'ไม่พบผู้ใช้งานที่ระบุ' });
          }
        } else {
          // Add new user
          const newId = `U-${String(db.users.length + 1).padStart(3, '0')}`;
          targetUser = {
            id: newId,
            username: `user_${Date.now().toString().slice(-4)}`,
            name: payload.name.trim(),
            role: payload.role || 'Store',
            department: payload.department || 'Tool Room Store',
            email: payload.email || '',
            phone: payload.phone || '',
            active: true
          };
          db.users.push(targetUser);

          db.auditLogs.unshift({
            id: `AUD-${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: payload.operatorName || 'Develop',
            action: 'USER_CREATED',
            partNumber: newId,
            previousQty: null,
            newQty: null,
            difference: null,
            reason: `เพิ่มผู้ใช้งานใหม่: ${targetUser.name} (สิทธิ์: ${targetUser.role})`,
            reference: newId
          });
        }

        saveDB(db);
        broadcastEvent('USER_UPDATED', { user: targetUser });
        return sendJSON(res, 200, {
          success: true,
          message: payload.id ? `บันทึกแก้ไขผู้ใช้งาน ${targetUser.name} สำเร็จ` : `เพิ่มผู้ใช้งาน ${targetUser.name} สำเร็จ`,
          user: targetUser,
          users: db.users
        });
      }

      // POST /api/stock-in - Receive parts into Tool Room (Streamlined: Fast & Simple)
      if (pathname === '/api/stock-in' && method === 'POST') {
        const data = await readRequestBody(req);
        const { partNumber, quantity, unitCost, receiver, remark } = data;
        const qty = parseFloat(quantity);

        if (!partNumber || isNaN(qty) || qty <= 0) {
          return sendJSON(res, 400, { error: 'กรุณาระบุรหัสอะไหล่และจำนวนที่ถูกต้อง (> 0)' });
        }

        const part = db.parts.find(p => p.partNumber === partNumber);
        if (!part) {
          return sendJSON(res, 404, { error: `ไม่พบอะไหล่รหัส: ${partNumber}` });
        }

        const prevQty = part.currentStock || 0;
        const newQty = prevQty + qty;
        part.currentStock = newQty;
        if (unitCost !== undefined && unitCost !== '' && !isNaN(parseFloat(unitCost))) {
          part.unitCost = parseFloat(unitCost);
        }
        part.lastPurchaseDate = new Date().toISOString().split('T')[0];

        const transNo = `IN-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(Date.now()).slice(-4)}`;
        const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

        // Add Movement
        const movItem = {
          id: `MOV-${Date.now()}`,
          transactionNo: transNo,
          date: nowStr,
          type: 'IN',
          partNumber: part.partNumber,
          partName: part.partName,
          qtyIn: qty,
          qtyOut: 0,
          balance: newQty,
          machine: 'Tool Room',
          user: receiver || 'เจ้าหน้าที่ห้องอะไหล่',
          refDoc: 'รับเข้าสโตร์',
          note: remark || 'รับเข้าห้องอะไหล่ Tool Room'
        };
        db.movements.unshift(movItem);

        // Add Audit Log
        const auditItem = {
          id: `AUD-${Date.now()}`,
          timestamp: nowStr,
          user: receiver || 'เจ้าหน้าที่ห้องอะไหล่',
          action: 'STOCK_IN',
          partNumber: part.partNumber,
          previousQty: prevQty,
          newQty: newQty,
          difference: qty,
          reason: `รับอะไหล่เข้าห้อง Tool Room (+${qty} ${part.unit}) ${remark ? '- ' + remark : ''}`,
          reference: transNo
        };
        db.auditLogs.unshift(auditItem);

        saveDB(db);
        broadcastEvent('STOCK_IN', {
          partNumber: part.partNumber,
          partName: part.partName,
          qtyIn: qty,
          newBalance: newQty,
          user: receiver || 'เจ้าหน้าที่ห้องอะไหล่'
        });

        return sendJSON(res, 200, {
          success: true,
          message: `รับอะไหล่ ${part.partName} จำนวน +${qty} ${part.unit} สำเร็จ (ยอดคงเหลือใหม่: ${newQty} ${part.unit})`,
          transactionNo: transNo,
          newBalance: newQty,
          part
        });
      }

      // POST /api/stock-issue - Issue parts (Streamlined & fast for Tool Room)
      if (pathname === '/api/stock-issue' && method === 'POST') {
        const data = await readRequestBody(req);
        const { partNumber, quantity, requester, usedFor, issuedBy, remark } = data;
        const qty = parseFloat(quantity);

        if (!partNumber || isNaN(qty) || qty <= 0) {
          return sendJSON(res, 400, { error: 'กรุณาระบุรหัสอะไหล่และจำนวนที่ต้องการเบิก (> 0)' });
        }

        const part = db.parts.find(p => p.partNumber === partNumber);
        if (!part) {
          return sendJSON(res, 404, { error: `ไม่พบอะไหล่รหัส: ${partNumber}` });
        }

        // Rule: Cannot issue more than current stock!
        const current = part.currentStock || 0;
        if (qty > current) {
          return sendJSON(res, 400, {
            error: `ไม่อนุญาตให้เบิกเกินยอดคงเหลือ! มีอะไหล่อยู่ในสต็อก ${current} ${part.unit} แต่ขอยืม/เบิก ${qty} ${part.unit}`,
            currentStock: current
          });
        }

        const prevQty = current;
        const newQty = prevQty - qty;
        part.currentStock = newQty;
        part.lastIssueDate = new Date().toISOString().split('T')[0];

        let warning = null;
        if (newQty <= 0) {
          warning = `คำเตือน: อะไหล่ ${part.partName} (${part.partNumber}) หมดสต็อกแล้ว (Stock = 0)!`;
        } else if (newQty <= (part.reorderPoint || 10)) {
          warning = `คำเตือน: อะไหล่ ${part.partName} ถึงจุดสั่งซื้อซ้ำแล้ว (คงเหลือ ${newQty} <= จุดสั่งซื้อ ${part.reorderPoint} ${part.unit})!`;
        } else if (newQty <= (part.minStock || 5)) {
          warning = `คำเตือน: อะไหล่ ${part.partName} ต่ำกว่า Minimum Stock (คงเหลือ ${newQty} <= Min ${part.minStock} ${part.unit})!`;
        }

        const transNo = `ISS-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(Date.now()).slice(-4)}`;
        const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

        // Add Movement
        const movItem = {
          id: `MOV-${Date.now()}`,
          transactionNo: transNo,
          date: nowStr,
          type: 'OUT',
          partNumber: part.partNumber,
          partName: part.partName,
          qtyIn: 0,
          qtyOut: qty,
          balance: newQty,
          machine: usedFor || 'Tool Room Consumable',
          user: requester ? `${requester} (จ่าย: ${issuedBy || 'Store'})` : (issuedBy || 'Store'),
          refDoc: usedFor ? `งาน: ${usedFor}` : '-',
          note: remark || 'เบิกใช้งาน'
        };
        db.movements.unshift(movItem);

        // Add Audit Log
        const auditItem = {
          id: `AUD-${Date.now()}`,
          timestamp: nowStr,
          user: issuedBy || 'Store',
          action: 'STOCK_ISSUE',
          partNumber: part.partNumber,
          previousQty: prevQty,
          newQty: newQty,
          difference: -qty,
          reason: `เบิกใช้งาน (${usedFor || 'งานซ่อมบำรุง/งานช่าง'}) โดยช่าง: ${requester || '-'}`,
          reference: transNo
        };
        db.auditLogs.unshift(auditItem);

        saveDB(db);
        broadcastEvent('STOCK_ISSUE', {
          partNumber: part.partNumber,
          partName: part.partName,
          qtyOut: qty,
          newBalance: newQty,
          user: requester || issuedBy || 'Store'
        });

        return sendJSON(res, 200, {
          success: true,
          message: `เบิกอะไหล่ ${part.partName} จำนวน -${qty} ${part.unit} สำเร็จ (คงเหลือ: ${newQty} ${part.unit})`,
          transactionNo: transNo,
          newBalance: newQty,
          warning,
          part
        });
      }

      // POST /api/stock-return - Return parts
      if (pathname === '/api/stock-return' && method === 'POST') {
        const data = await readRequestBody(req);
        const { partNumber, quantity, condition, originalIssueNo, workOrder, machine, returnedBy, receivedBy, remark } = data;
        const qty = parseFloat(quantity);

        if (!partNumber || isNaN(qty) || qty <= 0) {
          return sendJSON(res, 400, { error: 'กรุณาระบุรหัสอะไหล่และจำนวนที่ส่งคืน (> 0)' });
        }

        const part = db.parts.find(p => p.partNumber === partNumber);
        if (!part) {
          return sendJSON(res, 404, { error: `ไม่พบอะไหล่รหัส: ${partNumber}` });
        }

        const isUsable = ['New / Unused', 'Good', 'Used'].includes(condition);
        const prevQty = part.currentStock || 0;
        let newQty = prevQty;

        if (isUsable) {
          newQty = prevQty + qty;
          part.currentStock = newQty;
        }

        const transNo = `RET-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(Date.now()).slice(-4)}`;
        const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

        // Add Movement
        const movItem = {
          id: `MOV-${Date.now()}`,
          transactionNo: transNo,
          date: nowStr,
          type: 'RETURN',
          partNumber: part.partNumber,
          partName: part.partName,
          qtyIn: isUsable ? qty : 0,
          qtyOut: 0,
          balance: newQty,
          machine: machine || part.machineCode || '-',
          user: returnedBy ? `${returnedBy} (รับโดย: ${receivedBy || 'Store'})` : (receivedBy || 'Store'),
          refDoc: originalIssueNo ? `Ref Issue: ${originalIssueNo} (WO: ${workOrder || '-'})` : (workOrder || '-'),
          note: `คืนอะไหล่ สภาพ: ${condition} ${!isUsable ? '*(ไม่เพิ่มยอดสต็อก เนื่องจากชำรุด/เป็นเศษซาก)*' : ''} ${remark ? '- ' + remark : ''}`
        };
        db.movements.unshift(movItem);

        // Audit Log
        const auditItem = {
          id: `AUD-${Date.now()}`,
          timestamp: nowStr,
          user: receivedBy || 'Store',
          action: 'STOCK_RETURN',
          partNumber: part.partNumber,
          previousQty: prevQty,
          newQty: newQty,
          difference: isUsable ? qty : 0,
          reason: `รับคืนอะไหล่ สภาพ: ${condition}. ผู้คืน: ${returnedBy || '-'}. อ้างอิงใบเบิก: ${originalIssueNo || '-'}`,
          reference: transNo
        };
        db.auditLogs.unshift(auditItem);

        saveDB(db);
        broadcastEvent('STOCK_RETURN', {
          partNumber: part.partNumber,
          partName: part.partName,
          condition,
          isUsable,
          qty,
          newBalance: newQty
        });

        return sendJSON(res, 200, {
          success: true,
          message: isUsable 
            ? `รับคืนอะไหล่สภาพสมบูรณ์ (${condition}) +${qty} ${part.unit} สำเร็จ (คงเหลือ: ${newQty} ${part.unit})`
            : `บันทึกรับคืนอะไหล่ชำรุด (${condition}) จำนวน ${qty} ${part.unit} เรียบร้อย (ไม่เพิ่มในสต็อกใช้งาน)`,
          transactionNo: transNo,
          newBalance: newQty,
          isUsable,
          part
        });
      }

      // POST /api/stock-adjust - Adjust stock
      if (pathname === '/api/stock-adjust' && method === 'POST') {
        const data = await readRequestBody(req);
        const { partNumber, physicalQuantity, adjustmentType, reason, approvedBy, createdBy, remark } = data;
        const physicalQty = parseFloat(physicalQuantity);

        if (!partNumber || isNaN(physicalQty) || physicalQty < 0) {
          return sendJSON(res, 400, { error: 'กรุณาระบุรหัสอะไหล่และยอดตรวจนับจริง (>= 0)' });
        }

        const part = db.parts.find(p => p.partNumber === partNumber);
        if (!part) {
          return sendJSON(res, 404, { error: `ไม่พบอะไหล่รหัส: ${partNumber}` });
        }

        const prevQty = part.currentStock || 0;
        const diff = physicalQty - prevQty;
        part.currentStock = physicalQty;

        const transNo = `ADJ-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(Date.now()).slice(-4)}`;
        const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

        // Movement
        const movItem = {
          id: `MOV-${Date.now()}`,
          transactionNo: transNo,
          date: nowStr,
          type: 'ADJUSTMENT',
          partNumber: part.partNumber,
          partName: part.partName,
          qtyIn: diff > 0 ? diff : 0,
          qtyOut: diff < 0 ? Math.abs(diff) : 0,
          balance: physicalQty,
          machine: part.machineCode || '-',
          user: createdBy ? `${createdBy} (อนุมัติ: ${approvedBy || '-'})` : (approvedBy || 'Admin'),
          refDoc: `Type: ${adjustmentType || 'Stock Count'}`,
          note: `ปรับปรุงยอดสต็อก: ยอดระบบเดิม ${prevQty} -> ยอดจริง ${physicalQty} (ผลต่าง: ${diff > 0 ? '+' : ''}${diff}) เหตุผล: ${reason || '-'} (${remark || ''})`
        };
        db.movements.unshift(movItem);

        // Audit Log
        const auditItem = {
          id: `AUD-${Date.now()}`,
          timestamp: nowStr,
          user: createdBy || 'Store',
          action: 'STOCK_ADJUSTMENT',
          partNumber: part.partNumber,
          previousQty: prevQty,
          newQty: physicalQty,
          difference: diff,
          reason: `ปรับปรุงยอด [${adjustmentType || 'Stock Count'}]: เหตุผล: ${reason || '-'}, ผู้อนุมัติ: ${approvedBy || '-'}`,
          reference: transNo
        };
        db.auditLogs.unshift(auditItem);

        saveDB(db);
        broadcastEvent('STOCK_ADJUST', {
          partNumber: part.partNumber,
          newBalance: physicalQty,
          diff
        });

        return sendJSON(res, 200, {
          success: true,
          message: `ปรับปรุงยอดสต็อก ${part.partName} เป็น ${physicalQty} ${part.unit} สำเร็จ (ผลต่าง: ${diff > 0 ? '+' : ''}${diff})`,
          transactionNo: transNo,
          newBalance: physicalQty,
          difference: diff,
          part
        });
      }

      // POST /api/stock-count - Save Stock Count Round
      if (pathname === '/api/stock-count' && method === 'POST') {
        const data = await readRequestBody(req);
        const { roundTitle, countType, zone, countedItems, conductedBy, autoAdjust } = data;

        const roundId = `CNT-${Date.now()}`;
        const nowStr = new Date().toISOString().slice(0, 10);
        let varianceCount = 0;
        let varianceValue = 0;

        if (Array.isArray(countedItems)) {
          countedItems.forEach(item => {
            const part = db.parts.find(p => p.partNumber === item.partNumber);
            if (part && item.physicalQty !== undefined && item.physicalQty !== null) {
              const phys = parseFloat(item.physicalQty);
              const sys = part.currentStock || 0;
              const diff = phys - sys;
              if (diff !== 0) {
                varianceCount++;
                varianceValue += diff * (part.unitCost || 0);

                if (autoAdjust) {
                  part.currentStock = phys;
                  const transNo = `ADJ-CNT-${String(Date.now()).slice(-4)}`;
                  db.movements.unshift({
                    id: `MOV-${Date.now()}-${part.partNumber}`,
                    transactionNo: transNo,
                    date: new Date().toISOString().replace('T', ' ').substring(0, 19),
                    type: 'ADJUSTMENT',
                    partNumber: part.partNumber,
                    partName: part.partName,
                    qtyIn: diff > 0 ? diff : 0,
                    qtyOut: diff < 0 ? Math.abs(diff) : 0,
                    balance: phys,
                    machine: part.machineCode || '-',
                    user: conductedBy || 'Auditor',
                    refDoc: `Round: ${roundTitle || roundId}`,
                    note: `ปรับยอดอัตโนมัติจากการตรวจนับสต็อก (System: ${sys}, Counted: ${phys})`
                  });
                  db.auditLogs.unshift({
                    id: `AUD-${Date.now()}-${part.partNumber}`,
                    timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
                    user: conductedBy || 'Auditor',
                    action: 'STOCK_COUNT_ADJUSTMENT',
                    partNumber: part.partNumber,
                    previousQty: sys,
                    newQty: phys,
                    difference: diff,
                    reason: `ผลการตรวจนับสต็อก ${roundTitle || roundId}: ${item.note || 'ตรวจนับสต็อกประจำงวด'}`,
                    reference: roundId
                  });
                }
              }
            }
          });
        }

        const newRound = {
          id: roundId,
          title: roundTitle || `ตรวจนับสต็อก ${countType || 'Cycle Count'}`,
          type: countType || 'Cycle Count',
          zone: zone || 'All Zones',
          status: 'Completed',
          createdDate: nowStr,
          createdBy: conductedBy || 'Store',
          itemsCounted: countedItems ? countedItems.length : 0,
          totalItems: db.parts.length,
          varianceCount,
          varianceValue,
          items: countedItems || []
        };

        if (!db.stockCountRounds) db.stockCountRounds = [];
        db.stockCountRounds.unshift(newRound);

        saveDB(db);
        broadcastEvent('STOCK_COUNT', { roundId, varianceCount });

        return sendJSON(res, 200, {
          success: true,
          message: `บันทึกผลการตรวจนับสต็อกสำเร็จ (พบส่วนต่าง ${varianceCount} รายการ, มูลค่าผลต่าง ${varianceValue.toLocaleString()} บาท)`,
          round: newRound
        });
      }

      return sendJSON(res, 404, { error: 'API endpoint not found' });
    } catch (err) {
      console.error('API Error:', err);
      return sendJSON(res, 500, { error: err.message || 'Internal Server Error' });
    }
  }

  // Static File Serving (supports both root and public/ layouts)
  const cleanPath = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  const candidatePaths = [
    path.join(__dirname, 'public', cleanPath),
    path.join(__dirname, cleanPath),
    path.join(__dirname, path.basename(cleanPath)),
    path.join(__dirname, 'public', 'index.html'),
    path.join(__dirname, 'index.html')
  ];
  let filePath = candidatePaths.find(p => fs.existsSync(p) && fs.statSync(p).isFile());
  if (!filePath) {
    filePath = fs.existsSync(path.join(__dirname, 'public', 'index.html'))
      ? path.join(__dirname, 'public', 'index.html')
      : path.join(__dirname, 'index.html');
  }

  const extname = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`500 Server Error: ${err.message}`);
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(content);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🏭 Maintenance Spare Parts Inventory Management System`);
  console.log(`🚀 System running at: http://localhost:${PORT}`);
  console.log(`🌐 Network LAN IP:    http://140.140.1.51:${PORT}`);
  console.log(`⚡ Real-time SSE Sync: Enabled (/api/events)`);
  console.log(`=======================================================`);
});
