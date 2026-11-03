import { verifyPackage, stagePackage } from './public-package.mjs'
if (process.argv.includes('--check')) verifyPackage('core')
else await stagePackage('core')
