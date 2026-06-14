const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const env = { ...process.env };

if (process.platform === 'win32') {
  const localAppData = env.LOCALAPPDATA || path.join(env.USERPROFILE || '', 'AppData', 'Local');
  const sdkRoot = path.join(localAppData, 'Android', 'Sdk');
  const java21 = path.join('C:', 'Program Files', 'Java', 'jdk-21');
  const pathEntries = [];

  if (fs.existsSync(sdkRoot)) {
    env.ANDROID_HOME = sdkRoot;
    env.ANDROID_SDK_ROOT = sdkRoot;
    pathEntries.push(
      path.join(sdkRoot, 'platform-tools'),
      path.join(sdkRoot, 'emulator'),
      path.join(sdkRoot, 'cmdline-tools', 'latest', 'bin')
    );
  }

  if (fs.existsSync(java21)) {
    env.JAVA_HOME = java21;
    pathEntries.push(path.join(java21, 'bin'));
  }

  const currentPath = (env.Path || env.PATH || '').split(';').filter(Boolean);
  const merged = [...pathEntries, ...currentPath.filter((entry) => !pathEntries.includes(entry))];
  env.Path = merged.join(';');
}

const expoCli = require.resolve('@expo/cli/build/bin/cli');

const child = spawn(process.execPath, [expoCli, 'run:android', ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
