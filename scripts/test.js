const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

console.log('Compiling TypeScript test suite...')
const tscResult = spawnSync('npx', ['tsc', '-p', 'tsconfig.test.json'], {
  stdio: 'inherit',
  shell: true,
})

if (tscResult.status !== 0) {
  console.error('TypeScript compilation failed')
  process.exit(tscResult.status || 1)
}

const testDistDir = path.join(__dirname, '..', '.test-dist', 'tests')
if (!fs.existsSync(testDistDir)) {
  console.error('Test dist directory not found:', testDistDir)
  process.exit(1)
}

const testFiles = fs
  .readdirSync(testDistDir)
  .filter((file) => file.endsWith('.test.js'))
  .map((file) => path.join(testDistDir, file))

console.log(`Running ${testFiles.length} test suites with Node test runner...`)
const nodeTestResult = spawnSync('node', ['--test', ...testFiles], {
  stdio: 'inherit',
  shell: true,
})

process.exit(nodeTestResult.status || 0)
