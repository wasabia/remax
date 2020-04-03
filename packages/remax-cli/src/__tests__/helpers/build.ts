import * as path from 'path';
import webpack, { Configuration } from 'webpack';
import { createFsFromVolume, Volume, IFs } from 'memfs';
import joinPath from 'memory-fs/lib/join';
import API from '../../API';
import webpackConfig from '../../build/webpackConfig';
import getConfig from '../../getConfig';
import { PlatformTarget } from '../../build/platform';
import winPath from '../../winPath';

function ensureWebpackMemoryFs(fs: IFs) {
  const nextFs = Object.create(fs);
  nextFs.join = joinPath;

  return nextFs;
}

function buildWebpackCompiler(fs: IFs, webpackConfig: Configuration) {
  const webpackFs = ensureWebpackMemoryFs(fs);

  const compiler = webpack(webpackConfig);

  compiler.outputFileSystem = webpackFs;

  return compiler;
}

interface OutputFile {
  fileName: string;
  code: string;
}

function getFilesInDir(fs: IFs, root: string, fsPath: string) {
  const list = fs.readdirSync(fsPath);
  let outputs: OutputFile[] = [];

  list.forEach((fileName: any) => {
    const filePath = winPath(path.join(fsPath, fileName));
    if (fs.statSync(filePath).isDirectory()) {
      outputs = outputs.concat(getFilesInDir(fs, root, filePath));
    } else {
      outputs.push({
        fileName: filePath.replace(root, ''),
        code: fs.readFileSync(filePath).toString(),
      });
    }
  });

  return outputs;
}

interface Options {
  include: string[];
  exclude: string[];
}

export default async function build(app: string, target: PlatformTarget, options: Partial<Options> = {}) {
  const cwd = path.resolve(__dirname, `../fixtures/${app}`);
  process.chdir(cwd);
  process.env.REMAX_PLATFORM = target;
  const remaxOptions = getConfig();
  API.registerAdapterPlugins(target, remaxOptions);
  const webpackOptions = webpackConfig(
    {
      ...remaxOptions,
      cwd,
      progress: false,
      configWebpack: config => {
        config
          .mode('none')
          .resolve.alias.merge({
            '@components': path.resolve(cwd, 'src/components'),
            '@c': path.resolve(cwd, 'src/components'),
          })
          .end()
          .end()
          .externals({
            react: 'react',
            'react-reconciler': 'react-reconciler',
            scheduler: 'scheduler',
            'regenerator-runtime': 'regenerator-runtime',
          });

        if (typeof remaxOptions.configWebpack === 'function') {
          remaxOptions.configWebpack(config);
        }
      },
    },
    target
  );

  const fs = createFsFromVolume(new Volume());
  const compiler = buildWebpackCompiler(fs, webpackOptions);

  return new Promise(resolve => {
    compiler.run((error, stats) => {
      if (error) {
        console.error(error.message);
        throw error;
      }

      const info = stats.toJson();

      if (stats.hasErrors()) {
        console.error(info.errors);
        throw new Error(info.errors.join('\n'));
      }

      if (stats.hasWarnings()) {
        info.warnings.forEach(warning => {
          console.warn(warning);
        });
      }

      const exclude = options.exclude || ['node_modules'];
      const include = options.include || [];
      const includeRegExp = new RegExp(`(${include.join('|')})`);
      const excludeRegExp = new RegExp(`(${exclude.join('|')})`);
      const outputDir = path.join(cwd, remaxOptions.output);
      const output = getFilesInDir(fs, outputDir + '/', outputDir).filter(
        c =>
          (include.length > 0 && includeRegExp.test(c.fileName)) ||
          (exclude.length > 0 && !excludeRegExp.test(c.fileName))
      );

      resolve(output);
    });
  });
}

export const JEST_BUILD_TIMEOUT = 60 * 1000;
