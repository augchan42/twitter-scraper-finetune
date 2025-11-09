import fs from 'fs';

// Read Netscape format cookies
const netscapeCookies = fs.readFileSync('cookies/sixlinesapp-fresh.txt', 'utf-8');

const cookies = [];
const lines = netscapeCookies.split('\n');

for (const line of lines) {
  // Skip comments and empty lines
  if (line.startsWith('#') || !line.trim()) continue;

  const parts = line.split('\t');
  if (parts.length < 7) continue;

  const [domain, flag, path, secure, expiration, name, value] = parts;

  // Convert to cookie string format (Set-Cookie header format)
  let cookieString = `${name}=${value}`;
  cookieString += `; Domain=${domain}`;
  cookieString += `; Path=${path}`;

  if (secure === 'TRUE') {
    cookieString += '; Secure';
  }

  // Add expiration if it's not a session cookie
  const expirationNum = parseInt(expiration);
  if (expirationNum > 0 && expirationNum < 2147483647) {
    const expiryDate = new Date(expirationNum * 1000).toUTCString();
    cookieString += `; Expires=${expiryDate}`;
  }

  cookies.push(cookieString);
}

// Save as JSON
fs.writeFileSync('cookies/sixlinesapp_cookies.json', JSON.stringify(cookies, null, 2));

console.log(`✅ Converted ${cookies.length} cookies to string format`);
console.log('📁 Saved to: cookies/sixlinesapp_cookies.json');
console.log('\nKey cookies found:');
console.log('  auth_token:', cookies.some(c => c.includes('auth_token=')) ? '✓' : '✗');
console.log('  ct0 (csrf):', cookies.some(c => c.includes('ct0=')) ? '✓' : '✗');
console.log('  twid:', cookies.some(c => c.includes('twid=')) ? '✓' : '✗');
