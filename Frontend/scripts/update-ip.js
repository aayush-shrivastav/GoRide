const os = require('os');
const fs = require('fs');
const path = require('path');

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  const preferredNames = ['wi-fi', 'wifi', 'wlan', 'ethernet', 'eth', 'en0'];
  let candidate = null;

  for (const name of Object.keys(interfaces)) {
    const lowerName = name.toLowerCase();
    const isPreferred = preferredNames.some((p) => lowerName.includes(p));

    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (isPreferred) {
          return iface.address;
        }
        if (!candidate) {
          candidate = iface.address;
        }
      }
    }
  }

  return candidate || 'localhost';
}

function updateEnvFile() {
  const currentIp = getLocalIp();
  const envPath = path.resolve(__dirname, '..', '.env');

  console.log('\n========================================');
  console.log(`🌐 [GoRide] Auto-detected IP: ${currentIp}`);
  console.log('========================================\n');

  if (!fs.existsSync(envPath)) {
    console.warn(`⚠️ .env file not found at ${envPath}`);
    return currentIp;
  }

  let envContent = fs.readFileSync(envPath, 'utf8');

  const newApiUrl = `EXPO_PUBLIC_API_URL=http://${currentIp}:5000/api`;
  const newSocketUrl = `EXPO_PUBLIC_SOCKET_URL=http://${currentIp}:5000`;

  const apiUrlRegex = /^EXPO_PUBLIC_API_URL=.*$/m;
  const socketUrlRegex = /^EXPO_PUBLIC_SOCKET_URL=.*$/m;

  if (apiUrlRegex.test(envContent)) {
    envContent = envContent.replace(apiUrlRegex, newApiUrl);
  } else {
    envContent = `${newApiUrl}\n${envContent}`;
  }

  if (socketUrlRegex.test(envContent)) {
    envContent = envContent.replace(socketUrlRegex, newSocketUrl);
  } else {
    envContent = `${newSocketUrl}\n${envContent}`;
  }

  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log(`✅ Updated Frontend/.env with IP: ${currentIp}\n`);

  return currentIp;
}

updateEnvFile();
