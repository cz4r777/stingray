const fs = require('fs');
const path = require('path');

const cmakePath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-libsodium',
  'android',
  'CMakeLists.txt'
);

if (!fs.existsSync(cmakePath)) {
  process.exit(0);
}

const original = fs.readFileSync(cmakePath, 'utf8');

if (original.includes('NODE_MODULES_DIR_CMAKE')) {
  process.exit(0);
}

let updated = original;

updated = updated.replace(
  'set (CMAKE_CXX_STANDARD 20)\n',
  'set (CMAKE_CXX_STANDARD 20)\n\nfile(TO_CMAKE_PATH "${NODE_MODULES_DIR}" NODE_MODULES_DIR_CMAKE)\n'
);

updated = updated.replaceAll('${NODE_MODULES_DIR}', '${NODE_MODULES_DIR_CMAKE}');

if (updated !== original) {
  fs.writeFileSync(cmakePath, updated);
  process.stdout.write('Patched react-native-libsodium CMakeLists.txt for Windows paths.\n');
}
