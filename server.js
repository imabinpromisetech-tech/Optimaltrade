const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const rootDir = __dirname;
let port = Number(process.env.PORT || 3000);
const dataFile = path.join(rootDir, 'data', 'app-data.json');

function ensureDataFile() {
  if (!fs.existsSync(path.dirname(dataFile))) {
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  }
  if (!fs.existsSync(dataFile)) {
    const initialData = {
      users: [],
      deposits: [],
      withdrawals: [],
      sessions: [],
      kyc: [],
      settings: {
        balance: 250000,
        kycVerified: false,
        twoFactorEnabled: false
      }
    };
    fs.writeFileSync(dataFile, JSON.stringify(initialData, null, 2));
  }
}

function readData() {
  ensureDataFile();
  const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const migrated = {
    users: Array.isArray(data.users) ? data.users : [],
    deposits: Array.isArray(data.deposits) ? data.deposits : [],
    withdrawals: Array.isArray(data.withdrawals) ? data.withdrawals : [],
    sessions: Array.isArray(data.sessions) ? data.sessions : [],
    kyc: Array.isArray(data.kyc) ? data.kyc : [],
    settings: {
      balance: typeof data?.settings?.balance === 'number' ? data.settings.balance : 250000,
      kycVerified: typeof data?.settings?.kycVerified === 'boolean' ? data.settings.kycVerified : false,
      twoFactorEnabled: typeof data?.settings?.twoFactorEnabled === 'boolean' ? data.settings.twoFactorEnabled : false
    }
  };
  if (JSON.stringify(migrated) !== JSON.stringify(data)) {
    writeData(migrated);
    return migrated;
  }
  return data;
}

function writeData(data) {
  ensureDataFile();
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

function sendJson(res, payload, statusCode = 200) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function sendText(res, text, statusCode = 200, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, { 'Content-Type': contentType });
  res.end(text);
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8'
  };
  return map[ext] || 'application/octet-stream';
}

function serveStatic(req, res) {
  let requestPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  if (requestPath === '/') requestPath = '/Index.html';

  const normalizedPath = path.normalize(requestPath).replace(/^\//, '');
  const filePath = path.join(rootDir, normalizedPath);

  if (!filePath.startsWith(rootDir)) {
    sendText(res, 'Forbidden', 403);
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    sendText(res, fs.readFileSync(filePath, 'utf8'), 200, getMimeType(filePath));
    return;
  }

  if (fs.existsSync(filePath + '.html') && fs.statSync(filePath + '.html').isFile()) {
    sendText(res, fs.readFileSync(filePath + '.html', 'utf8'), 200, getMimeType(filePath + '.html'));
    return;
  }

  sendText(res, 'Not found', 404, 'text/plain; charset=utf-8');
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          resolve(parsed);
          return;
        }
      } catch (error) {
        // fall through to form parsing
      }

      try {
        resolve(Object.fromEntries(new URLSearchParams(body)));
      } catch (error) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  try {
    const decodedPath = decodeURIComponent(pathname);
    const normalizedPath = decodedPath.replace(/\\/g, '/');
    const isAccessRoute = normalizedPath === '/public/Optimizetradepro _ Home.html' ||
      pathname === '/public/Optimizetradepro%20_%20Home.html' ||
      pathname === '/public/Optimizetradepro%20%20_%20%20Home.html' ||
      normalizedPath.endsWith('/public/Optimizetradepro _ Home.html');

    if (req.method === 'GET' && pathname === '/api/health') {
      sendJson(res, { ok: true, message: 'Server is running' });
      return;
    }

    if (req.method === 'POST' && isAccessRoute) {
      const body = await parseBody(req);
      const accessCode = String(body.access_code || '').trim();
      const expectedCode = 'OPTIMALTRADER@33';

      if (!accessCode) {
        sendText(res, 'Access code is required', 400, 'text/plain; charset=utf-8');
        return;
      }

      if (accessCode !== expectedCode) {
        sendText(res, 'Invalid access code', 400, 'text/plain; charset=utf-8');
        return;
      }

      res.writeHead(302, { Location: '/public/Optimizetradepro%20_%20Home.html' });
      res.end();
      return;
    }

    if (req.method === 'POST' && pathname === '/api/auth/register') {
      const data = await parseBody(req);
      const appData = readData();
      const existingUser = appData.users.find(u => u.email.toLowerCase() === String(data.email || '').toLowerCase());
      if (existingUser) {
        sendJson(res, { success: false, message: 'A user with that email already exists.' }, 409);
        return;
      }
      const user = {
        id: Date.now().toString(),
        firstName: data.firstname || '',
        lastName: data.lastname || '',
        username: data.username || '',
        email: data.email,
        phone: data.phone || '',
        nationality: data.nationality || '',
        password: data.password || '',
        balance: appData.settings.balance,
        verified: false,
        twoFactorEnabled: false,
        createdAt: new Date().toISOString()
      };
      const token = `token-${user.id}`;
      appData.users.push(user);
      appData.sessions.push({ userId: user.id, token });
      writeData(appData);
      sendJson(res, { success: true, message: 'Account created successfully.', user, token });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/auth/login') {
      const data = await parseBody(req);
      const appData = readData();
      const user = appData.users.find(u => u.email.toLowerCase() === String(data.email || '').toLowerCase() && u.password === data.password);
      if (!user) {
        sendJson(res, { success: false, message: 'Invalid email or password.' }, 401);
        return;
      }
      const session = appData.sessions.find(s => s.userId === user.id) || { userId: user.id, token: `token-${user.id}` };
      appData.sessions = appData.sessions.filter(s => s.userId !== user.id);
      appData.sessions.push(session);
      writeData(appData);
      sendJson(res, { success: true, message: 'Login successful.', user, token: session.token });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/auth/me') {
      const token = url.searchParams.get('token') || '';
      const appData = readData();
      const session = appData.sessions.find(s => s.token === token);
      if (!session) {
        sendJson(res, { success: false, message: 'Unauthorized' }, 401);
        return;
      }
      const user = appData.users.find(u => u.id === session.userId);
      sendJson(res, { success: true, user });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/deposits') {
      const data = await parseBody(req);
      const appData = readData();
      const deposit = {
        id: Date.now().toString(),
        amount: Number(data.amount),
        method: data.deposit_method || '',
        cryptoType: data.crypto_type || '',
        walletAddress: data.wallet_address || '',
        status: 'pending',
        createdAt: new Date().toISOString()
      };
      appData.deposits.push(deposit);
      writeData(appData);
      sendJson(res, { success: true, deposit_id: deposit.id, message: 'Deposit request submitted successfully.' });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/withdrawals') {
      const data = await parseBody(req);
      const appData = readData();
      const amount = Number(data.amount);
      const balance = appData.settings.balance;
      if (amount > balance) {
        sendJson(res, { success: false, message: 'Insufficient balance.' }, 400);
        return;
      }
      const withdrawal = {
        id: Date.now().toString(),
        amount,
        method: data.withdrawal_method || '',
        cryptoType: data.crypto_type || '',
        walletAddress: data.wallet_address || '',
        status: 'pending',
        createdAt: new Date().toISOString()
      };
      appData.withdrawals.push(withdrawal);
      appData.settings.balance = balance - amount;
      writeData(appData);
      sendJson(res, { success: true, message: 'Withdrawal request submitted successfully.' });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/profile/password') {
      const data = await parseBody(req);
      const appData = readData();
      const token = data.token || '';
      const session = appData.sessions.find(s => s.token === token);
      if (!session) {
        sendJson(res, { success: false, message: 'Unauthorized' }, 401);
        return;
      }
      const user = appData.users.find(u => u.id === session.userId);
      if (!user) {
        sendJson(res, { success: false, message: 'User not found' }, 404);
        return;
      }
      user.password = data.new_password || user.password;
      writeData(appData);
      sendJson(res, { success: true, message: 'Password updated successfully.' });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/profile/2fa') {
      const data = await parseBody(req);
      const appData = readData();
      const token = data.token || '';
      const session = appData.sessions.find(s => s.token === token);
      if (!session) {
        sendJson(res, { success: false, message: 'Unauthorized' }, 401);
        return;
      }
      const user = appData.users.find(u => u.id === session.userId);
      if (!user) {
        sendJson(res, { success: false, message: 'User not found' }, 404);
        return;
      }
      user.twoFactorEnabled = true;
      writeData(appData);
      sendJson(res, { success: true, message: 'Two-factor authentication enabled.' });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/kyc/upload') {
      const data = await parseBody(req);
      const appData = readData();
      const token = String(data.token || '').trim();
      const session = appData.sessions.find(s => s.token === token);
      if (!session) {
        sendJson(res, { success: false, message: 'Unauthorized' }, 401);
        return;
      }
      const user = appData.users.find(u => u.id === session.userId);
      if (!user) {
        sendJson(res, { success: false, message: 'User not found' }, 404);
        return;
      }
      appData.kyc = Array.isArray(appData.kyc) ? appData.kyc : [];
      const submission = {
        id: Date.now().toString(),
        userId: user.id,
        userName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
        frontImage: data.frontImage || '',
        backImage: data.backImage || '',
        status: 'pending',
        createdAt: new Date().toISOString()
      };
      appData.kyc.push(submission);
      writeData(appData);
      sendJson(res, { success: true, message: 'KYC submission received for review.', submission });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/admin/summary') {
      const appData = readData();
      sendJson(res, {
        success: true,
        summary: {
          users: appData.users.length,
          deposits: appData.deposits.length,
          withdrawals: appData.withdrawals.length,
          balance: appData.settings.balance,
          pendingKyc: appData.kyc.filter(item => item.status === 'pending').length
        }
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/admin/users') {
      const appData = readData();
      sendJson(res, { success: true, users: appData.users });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/admin/kyc') {
      const appData = readData();
      sendJson(res, { success: true, kyc: appData.kyc });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/admin/kyc') {
      const data = await parseBody(req);
      const appData = readData();
      const item = appData.kyc.find(entry => entry.id === String(data.id || ''));
      if (!item) {
        sendJson(res, { success: false, message: 'KYC submission not found.' }, 404);
        return;
      }
      item.status = data.status === 'approved' ? 'approved' : 'rejected';
      if (item.status === 'approved') {
        const user = appData.users.find(entry => entry.id === item.userId);
        if (user) user.kycVerified = true;
      }
      writeData(appData);
      sendJson(res, { success: true, message: `KYC ${item.status}` });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/admin/balance') {
      const data = await parseBody(req);
      const appData = readData();
      const user = appData.users.find(entry => entry.id === String(data.userId || ''));
      if (!user) {
        sendJson(res, { success: false, message: 'User not found.' }, 404);
        return;
      }
      const amount = Number(data.amount || 0);
      if (!amount) {
        sendJson(res, { success: false, message: 'Please enter a valid amount.' }, 400);
        return;
      }
      if (data.action === 'subtract') {
        if (user.balance < amount) {
          sendJson(res, { success: false, message: 'Cannot subtract more than the current balance.' }, 400);
          return;
        }
        user.balance -= amount;
      } else {
        user.balance += amount;
      }
      writeData(appData);
      sendJson(res, { success: true, message: 'Balance updated successfully.' });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/admin/approve-user') {
      const data = await parseBody(req);
      const appData = readData();
      const user = appData.users.find(entry => entry.id === String(data.userId || ''));
      if (!user) {
        sendJson(res, { success: false, message: 'User not found.' }, 404);
        return;
      }
      user.verified = true;
      writeData(appData);
      sendJson(res, { success: true, message: 'User approved.' });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/admin/transactions') {
      const appData = readData();
      sendJson(res, { success: true, deposits: appData.deposits, withdrawals: appData.withdrawals });
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    sendJson(res, { success: false, message: 'Server error' }, 500);
  }
});

if (require.main === module) {
  const tryListen = (currentPort) => {
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE' && currentPort < 3010) {
        const fallbackPort = currentPort + 1;
        console.warn(`Port ${currentPort} is busy, retrying on ${fallbackPort}`);
        tryListen(fallbackPort);
        return;
      }
      throw error;
    });

    server.listen(currentPort, () => {
      console.log(`Server listening on http://localhost:${currentPort}`);
    });
  };

  tryListen(port);
}

module.exports = { server, port };
