import * as esbuild from 'esbuild';

// 把 three 的 import 指向「现有的全局 THREE」，这样不会打出第二份 three
const globalThree = {
  name: 'global-three',
  setup(build) {
    build.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'gthree' }));
    build.onLoad({ filter: /.*/, namespace: 'gthree' }, () => ({
      contents: 'module.exports = window.THREE;',
      loader: 'js'
    }));
  }
};

await esbuild.build({
  entryPoints: ['entry.js'],
  bundle: true,
  format: 'iife',
  minify: true,
  target: ['es2018'],
  outfile: '../vendor/gltfloader.min.js',
  plugins: [globalThree],
  legalComments: 'none'
});
console.log('built');
