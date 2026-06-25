const test = require('node:test');
const assert = require('node:assert/strict');
const { server } = require('../server');

let baseUrl;

test.before(async () => {
  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) return reject(err);
      resolve();
    });
  });
});

test('health endpoint works', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
});

test('accepts the configured access code', async () => {
  const response = await fetch(`${baseUrl}/public/Optimizetradepro%20_%20Home.html`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'access_code=OPTIMALTRADER@33'
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/public/Optimizetradepro%20_%20Home.html');
});

test('rejects invalid access codes', async () => {
  const response = await fetch(`${baseUrl}/public/Optimizetradepro%20_%20Home.html`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'access_code=wrong-code'
  });

  assert.equal(response.status, 400);
  const body = await response.text();
  assert.match(body, /invalid/i);
});

test('redirects the protected homepage until access is granted', async () => {
  const response = await fetch(`${baseUrl}/public/Optimizetradepro%20_%20Home.html`, {
    redirect: 'manual'
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/');
});

test('stores pending KYC submissions and exposes them to admin summary', async () => {
  const email = `kyc-${Date.now()}@example.com`;
  const registrationResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstname: 'Admin',
      lastname: 'Test',
      username: `admin${Date.now()}`,
      email,
      phone: '+1234567890',
      nationality: 'United States',
      password: 'password123'
    })
  });

  const registrationData = await registrationResponse.json();
  assert.equal(registrationResponse.status, 200);

  const kycResponse = await fetch(`${baseUrl}/api/kyc/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: registrationData.token,
      frontImage: 'data:image/png;base64,front',
      backImage: 'data:image/png;base64,back'
    })
  });

  assert.equal(kycResponse.status, 200);

  const adminResponse = await fetch(`${baseUrl}/api/admin/summary`);
  const adminData = await adminResponse.json();
  assert.equal(adminResponse.status, 200);
  assert.equal(adminData.summary.pendingKyc, 1);
});
