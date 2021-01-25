import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import chalk from 'chalk';
import { ethers } from 'ethers';
import { flatten, unflatten } from 'flat';

import {
  BlockchainTools,
  createContext,
  createContextOptions,
  createContextPaths,
  createParams,
  createResult,
  CreationStatus,
  EnvVariable,
  EnvVariables,
  HardhatOptions,
  TruffleOptions,
} from '../types';

// eslint-disable-next-line @typescript-eslint/ban-types
const prettyStringify = (obj: object): string => JSON.stringify(obj, null, 2);

// eslint-disable-next-line @typescript-eslint/ban-types
const injectFlattenedJsonToFile = (
  file: string,
  options: object,
  maybeUnflattened?: object
) => {
  !fs.existsSync(file) && fs.writeFileSync(file, JSON.stringify({}));
  fs.writeFileSync(
    file,
    prettyStringify({
      ...unflatten({
        ...(flatten(
          JSON.parse(fs.readFileSync(file, 'utf-8'))
          // eslint-disable-next-line @typescript-eslint/ban-types
        ) as object),
        ...options,
      }),
      ...(typeof maybeUnflattened === 'object' ? maybeUnflattened : {}),
    })
  );
};

const createBaseProject = ({ name }: createParams) =>
  execSync(`npx create-react-native-app ${name} -t with-typescript`, {
    stdio: 'inherit',
  });

const ejectExpoProject = (ctx: createContext) => {
  const {
    options: { bundleIdentifier, packageName, uriScheme },
  } = ctx;
  const {
    paths: { appJson },
  } = ctx;
  // TODO: Icon can go here.
  injectFlattenedJsonToFile(appJson, {
    'expo.ios.bundleIdentifier': bundleIdentifier,
    'expo.android.package': packageName,
    'expo.scheme': uriScheme,
  });
  return execSync(`cd ${ctx.paths.projectDir}; expo eject --non-interactive;`, {
    stdio: 'inherit',
  });
};

// TODO: Configure the application icon in Expo.
const setAppIcon = () => null;

// TODO: Add jest and show a working demonstration of solc.
const createTests = () => null;

const createFileThunk = (root: string) => (f: readonly string[]): string => {
  return path.resolve(root, ...f);
};

const maybeTruffleOptions = (
  params: createParams,
  projectFile: (f: readonly string[]) => string,
  scriptFile: (f: readonly string[]) => string,
  migrationFile: (f: readonly string[]) => string
): TruffleOptions | null => {
  if (params.blockchainTools === BlockchainTools.TRUFFLE) {
    return {
      contract: projectFile(['contracts', 'Hello.sol']),
      ganache: scriptFile(['ganache.js']),
      initialMigration: migrationFile(['1_initial_migration.js']),
    } as TruffleOptions;
  }
  return null;
};

const maybeHardhatOptions = async (
  params: createParams,
  projectFile: (f: readonly string[]) => string,
  scriptFile: (f: readonly string[]) => string
): Promise<HardhatOptions | null> => {
  if (params.blockchainTools === BlockchainTools.HARDHAT) {
    const hardhatAccounts = await Promise.all(
      [...Array(10)].map(async () => {
        const { privateKey } = await ethers.Wallet.createRandom();
        return { privateKey, balance: '1000000000000000000000' }; // 1000 ETH
      })
    );
    return {
      hardhat: scriptFile(['hardhat.js']),
      hardhatConfig: projectFile(['hardhat.config.js']),
      hardhatAccounts,
    } as HardhatOptions;
  }
  return null;
};

const createBaseContext = async (
  params: createParams
): Promise<createContext> => {
  const { name } = params;
  const projectDir = path.resolve(name);
  const scriptsDir = path.resolve(projectDir, 'scripts');
  const testsDir = path.resolve(projectDir, 'test');
  const migrationsDir = path.resolve(projectDir, 'migrations');
  const projectFile = createFileThunk(projectDir);
  const scriptFile = createFileThunk(scriptsDir);
  const testFile = createFileThunk(testsDir);
  const migrationFile = createFileThunk(migrationsDir);
  const paths = {
    // project
    projectDir,
    index: projectFile(['index.js']),
    pkg: projectFile(['package.json']),
    metroConfig: projectFile(['metro.config.js']),
    babelConfig: projectFile(['babel.config.js']),
    env: projectFile(['.env']),
    exampleEnv: projectFile(['.env.example']),
    app: projectFile(['App.tsx']),
    appJson: projectFile(['app.json']),
    typeRoots: projectFile(['index.d.ts']),
    tsc: projectFile(['tsconfig.json']),
    // Migrations
    migrationsDir,
    // Tests
    testsDir,
    test: testFile(['Hello.test.js']),
    gitignore: projectFile(['.gitignore']),
    // scripts
    scriptsDir,
    postinstall: scriptFile(['postinstall.js']),
    eslint: projectFile(['.eslintrc.json']),
    cspell: projectFile(['.cspell.json']),
  };
  const options = {
    ...params,
    yarn: fs.existsSync(projectFile(['yarn.lock'])),
    truffle: maybeTruffleOptions(
      params,
      projectFile,
      scriptFile,
      migrationFile
    ),
    hardhat: await maybeHardhatOptions(params, projectFile, scriptFile),
  };

  const shouldCreateContext = (
    paths: createContextPaths,
    options: createContextOptions
  ): createContext =>
    Object.freeze({
      paths,
      options,
    });

  return shouldCreateContext(paths, options);
};

// TODO: Find a nice version.
const shimProcessVersion = 'v9.40';

const injectShims = (ctx: createContext) =>
  fs.writeFileSync(
    ctx.paths.index,
    `
// This file has been auto-generated by Ξ create-react-native-dapp Ξ.
// Feel free to modify it, but please take care to maintain the exact
// procedure listed between /* dapp-begin */ and /* dapp-end */, as 
// this will help persist a known template for future migrations.

/* dapp-begin */
const {Platform, LogBox} = require('react-native');

if (Platform.OS !== 'web') {
  require('react-native-get-random-values');
  LogBox.ignoreLogs(
    [
      "Warning: The provided value 'ms-stream' is not a valid 'responseType'.",
      "Warning: The provided value 'moz-chunked-arraybuffer' is not a valid 'responseType'.",
    ],
  );
}

if (typeof Buffer === 'undefined') {
  global.Buffer = require('buffer').Buffer;
}

global.btoa = global.btoa || require('base-64').encode;
global.atob = global.atob || require('base-64').decode;

process.version = '${shimProcessVersion}';

import { registerRootComponent } from 'expo';
const { default: App } = require('./App');
/* dapp-end */

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in the Expo client or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
    
    `.trim()
  );

const maybeCreateTruffleScripts = (ctx: createContext) => {
  if (ctx.options.truffle) {
    const {
      options: {
        truffle: { ganache },
      },
    } = ctx;
    fs.writeFileSync(
      ganache,
      `
require('dotenv/config');
const {execSync} = require('child_process');

execSync('npx truffle compile;', {stdio: 'inherit'});
execSync('node node_modules/.bin/ganache-cli --account_keys_path ./ganache.json', {stdio: 'inherit'});
      `.trim()
    );
  }
};

const maybeCreateHardhatScripts = (ctx: createContext) => {
  if (ctx.options.hardhat) {
    const {
      options: {
        hardhat: { hardhat },
      },
    } = ctx;

    fs.writeFileSync(
      hardhat,
      `
require('dotenv/config');
const {execSync} = require('child_process');

execSync('npx hardhat compile', {stdio: 'inherit'});
execSync('npx hardhat node', {stdio: 'inherit'});
      `.trim()
    );
  }
};

const createScripts = (ctx: createContext) => {
  fs.mkdirSync(ctx.paths.scriptsDir);
  fs.writeFileSync(
    ctx.paths.postinstall,
    `
require('dotenv/config');
const {execSync} = require('child_process');

execSync('npx pod-install', {stdio: 'inherit'});
    `.trim()
  );
  maybeCreateTruffleScripts(ctx);
  maybeCreateHardhatScripts(ctx);
};

const maybeGetTruffleVariables = (ctx: createContext): EnvVariables => {
  if (ctx.options.truffle) {
    return [['GANACHE_URL', 'string', 'http://127.0.0.1:8545']];
  }
  return [];
};

const maybeGetHardhatVariables = (ctx: createContext): EnvVariables => {
  if (ctx.options.blockchainTools === BlockchainTools.HARDHAT) {
    const {
      options: { hardhat: maybeHardhatOptions },
    } = ctx;
    const { hardhatAccounts } = maybeHardhatOptions as HardhatOptions;
    return [
      ['HARDHAT_URL', 'string', 'http://localhost:8545'],
      ['HARDHAT_PRIVATE_KEY', 'string', hardhatAccounts[0].privateKey],
    ];
  }
  return [];
};

const maybeGetDefaultVariables = (ctx: createContext): EnvVariables => {
  if (ctx.options.blockchainTools === BlockchainTools.NONE) {
    return [['INFURA_API_KEY', 'string', '']];
  }
  return [];
};

const getAllEnvVariables = (ctx: createContext): EnvVariables => {
  return [
    ...maybeGetTruffleVariables(ctx),
    ...maybeGetHardhatVariables(ctx),
    ...maybeGetDefaultVariables(ctx),
  ];
};

const shouldPrepareTypeRoots = (ctx: createContext) => {
  const stringsToRender = getAllEnvVariables(ctx).map(
    ([name, type]: EnvVariable) => `   export const ${name}: ${type};`
  );
  return fs.writeFileSync(
    ctx.paths.typeRoots,
    `
declare module '@env' {
${stringsToRender.join('\n')}
}
    `.trim()
  );
};

const shouldPrepareSpelling = (ctx: createContext) => fs.writeFileSync(
  ctx.paths.cspell,
  JSON.stringify({
    words: ["bytecode", "dapp"],
  }),
);

const shouldPrepareTsc = (ctx: createContext) =>
  fs.writeFileSync(
    ctx.paths.tsc,
    prettyStringify({
      compilerOptions: {
        allowSyntheticDefaultImports: true,
        jsx: 'react-native',
        lib: ['dom', 'esnext'],
        moduleResolution: 'node',
        noEmit: true,
        skipLibCheck: true,
        resolveJsonModule: true,
        typeRoots: ['index.d.ts'],
      },
      include: ['**/*.ts', '**/*.tsx'],
      exclude: [
        'node_modules',
        'babel.config.js',
        'metro.config.js',
        'jest.config.js',
      ],
    })
  );

// eslint-disable-next-line @typescript-eslint/ban-types
const maybeGetTruffleFlattenedScripts = (ctx: createContext): object => {
  if (ctx.options.truffle) {
    return {
      'scripts.ganache': 'node scripts/ganache',
      'scripts.test': 'npx truffle test',
    };
  }
  return {};
};

// eslint-disable-next-line @typescript-eslint/ban-types
const maybeGetHardhatFlattenedScripts = (ctx: createContext): object => {
  if (ctx.options.blockchainTools === BlockchainTools.HARDHAT) {
    return {
      'scripts.hardhat': 'node scripts/hardhat',
      'scripts.test': 'npx hardhat test',
    };
  }
  return {};
};

const maybeGetTruffleFlattenedDevDependencies = (
  ctx: createContext
  // eslint-disable-next-line @typescript-eslint/ban-types
): object => {
  if (ctx.options.truffle) {
    return { 'devDependencies.ganache-cli': '6.12.1' };
  }
  return {};
};

const maybeGetHardhatFlattenedDevDependencies = (
  ctx: createContext
  // eslint-disable-next-line @typescript-eslint/ban-types
): object => {
  if (ctx.options.blockchainTools === BlockchainTools.HARDHAT) {
    return {
      'devDependencies.hardhat': '2.0.6',
      'devDependencies.@nomiclabs/hardhat-ethers': '^2.0.1',
      'devDependencies.@nomiclabs/hardhat-waffle': '^2.0.1',
      'devDependencies.chai': '^4.2.0',
      'devDependencies.ethereum-waffle': '^3.2.1',
    };
  }
  return {};
};

const preparePackage = (ctx: createContext) =>
  injectFlattenedJsonToFile(
    ctx.paths.pkg,
    {
      license: 'MIT',
      author: 'Alex Thomas (@cawfree) <hello@cawfree.com>',
      keywords: [
        'react',
        'react-native',
        'dapp',
        'ethereum',
        'web3',
        'starter',
        'react-native-web',
      ],
      // scripts
      'scripts.postinstall': 'node scripts/postinstall',
      ...maybeGetTruffleFlattenedScripts(ctx),
      ...maybeGetHardhatFlattenedScripts(ctx),
      // husky
      'husky.hooks.pre-commit': 'lint-staged',
      // dependencies
      'dependencies.base-64': '1.0.0',
      'dependencies.buffer': '6.0.3',
      'dependencies.web3': '1.3.1',
      'dependencies.node-libs-browser': '2.2.1',
      'dependencies.path-browserify': '0.0.0',
      'dependencies.react-native-stream': '0.1.9',
      'dependencies.react-native-crypto': '2.2.0',
      'dependencies.react-native-get-random-values': '1.5.0',
      'dependencies.react-native-dotenv': '2.4.3',
      // devDependencies
      'devDependencies.dotenv': '8.2.0',
      'devDependencies.prettier': '2.2.1',
      'devDependencies.husky': '4.3.8',
      'devDependencies.@typescript-eslint/eslint-plugin': '^4.0.1',
      'devDependencies.@typescript-eslint/parser': '^4.0.1',
      'devDependencies.eslint': '^7.8.0',
      'devDependencies.eslint-config-prettier': '^6.11.0',
      'devDependencies.eslint-plugin-eslint-comments': '^3.2.0',
      'devDependencies.eslint-plugin-functional': '^3.0.2',
      'devDependencies.eslint-plugin-import': '^2.22.0',
      'devDependencies.lint-staged': '10.5.3',
      ...maybeGetTruffleFlattenedDevDependencies(ctx),
      ...maybeGetHardhatFlattenedDevDependencies(ctx),
      // react-native
      'react-native.stream': 'react-native-stream',
      'react-native.crypto': 'react-native-crypto',
      'react-native.path': 'path-browserify',
      'react-native.process': 'node-libs-browser/mock/process',
    },
    {
      'lint-staged': {
        '*.{ts,tsx}': "eslint --ext '.ts,.tsx' -c .eslintrc.json",
      },
    }
  );

const shouldPrepareMetro = (ctx: createContext) =>
  fs.writeFileSync(
    ctx.paths.metroConfig,
    `
const extraNodeModules = require('node-libs-browser');

module.exports = {
  resolver: {
    extraNodeModules,
  },
  transformer: {
    assetPlugins: ['expo-asset/tools/hashAssetFiles'],
  },
};
    `.trim()
  );

const shouldPrepareBabel = (ctx: createContext) =>
  fs.writeFileSync(
    ctx.paths.babelConfig,
    `
module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['module:react-native-dotenv'],
    ],
  };
};
    `.trim()
  );

const shouldPrepareEslint = (ctx: createContext) =>
  fs.writeFileSync(
    ctx.paths.eslint,
    JSON.stringify({
      root: true,
      parser: '@typescript-eslint/parser',
      //parserOptions: { project: './tsconfig.json' },
      env: { es6: true },
      ignorePatterns: ['node_modules', 'build', 'coverage'],
      plugins: ['import', 'eslint-comments', 'functional'],
      extends: [
        'eslint:recommended',
        'plugin:eslint-comments/recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:import/typescript',
        'plugin:functional/lite',
        'prettier',
        'prettier/@typescript-eslint',
      ],
      globals: {
        //BigInt: true,
        console: true,
        __DEV__: true,
      },
      rules: {
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        'eslint-comments/disable-enable-pair': [
          'error',
          { allowWholeFile: true },
        ],
        'eslint-comments/no-unused-disable': 'error',
        'import/order': [
          'error',
          { 'newlines-between': 'always', alphabetize: { order: 'asc' } },
        ],
        'sort-imports': [
          'error',
          { ignoreDeclarationSort: true, ignoreCase: true },
        ],
      },
    })
  );

const shouldWriteEnv = (ctx: createContext) => {
  const lines = getAllEnvVariables(ctx).map(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ([name, _type, value]) => `${name}=${value}`
  );
  fs.writeFileSync(ctx.paths.env, `${lines.join('\n')}\n`);
  fs.copyFileSync(ctx.paths.env, ctx.paths.exampleEnv);
};

const shouldInstall = (ctx: createContext) =>
  execSync(
    `cd ${ctx.paths.projectDir}; ${
      ctx.options.yarn ? 'yarn' : 'npm i'
    }; `.trim(),
    {
      stdio: 'inherit',
    }
  );

const getExampleContract = () =>
  `
// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

contract Hello {
  string defaultSuffix;
  constructor() public {
    defaultSuffix = '!';
  }
  function sayHello(string memory name) public view returns(string memory) {
    return string(abi.encodePacked("Welcome to ", name, defaultSuffix));
  }
}
`.trim();

const shouldPrepareTruffleExample = (ctx: createContext) => {
  const {
    paths: { projectDir, app, test },
    options,
  } = ctx;
  const { truffle } = options;

  execSync(`cd ${projectDir}; npx truffle init;`, {
    stdio: 'inherit',
  });

  // Write Test File.
  fs.writeFileSync(
    test,
    `
const { assert } = require('console');
const Hello = artifacts.require('Hello');

contract('Hello', (accounts) => {
  let instance;
  beforeEach('should setup the contract instance', async () => {
    instance = await Hello.deployed();
  });
  it('should return the list of accounts', async () => {
    const result = await instance.sayHello.call('React Native');
    assert(result === 'Welcome to React Native!');
  });
});
    `.trim()
  );

  fs.writeFileSync(
    (truffle as TruffleOptions).initialMigration,
    `
const Migrations = artifacts.require('Migrations');
const Hello = artifacts.require('Hello');

module.exports = function (deployer) {
  deployer.deploy(Migrations);
  deployer.deploy(Hello);
};
    `.trim()
  );

  fs.writeFileSync((truffle as TruffleOptions).contract, getExampleContract());
  fs.writeFileSync(
    app,
    `
import {GANACHE_URL} from '@env';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Web3 from 'web3';

import Hello from './build/contracts/Hello.json'
import {private_keys as privateKeys} from './ganache.json';

const styles = StyleSheet.create({
  center: {alignItems: 'center', justifyContent: 'center'},
});

export default function App(): JSX.Element {
  const [message, setMessage] = React.useState<string>('');
  const web3 = React.useMemo(
    () => new Web3(new Web3.providers.HttpProvider(GANACHE_URL)),
    []
  );
  const shouldDeployContract = React.useCallback(async (abi, data, from: string) => {
    const deployment = new web3.eth.Contract(abi).deploy({data});
    const gas = await deployment.estimateGas();
    const {
      options: { address: contractAddress },
    } = await deployment.send({from, gas});
    return new web3.eth.Contract(abi, contractAddress);
  }, [web3]);
  React.useEffect(() => {
    (async () => {
      const [address, privateKey] = Object.entries(privateKeys)[0];
      await web3.eth.accounts.privateKeyToAccount(privateKey);
      const contract = await shouldDeployContract(Hello.abi, Hello.bytecode, address);
      setMessage(await contract.methods.sayHello("React Native").call());
    })();
  }, [shouldDeployContract, setMessage]);
  return (
    <View style={[StyleSheet.absoluteFill, styles.center]}>
      <Text>{message}</Text>
    </View>
  );
}
    `.trim()
  );
};

const shouldPrepareDefaultExample = (ctx: createContext) => {
  fs.writeFileSync(
    ctx.paths.app,
    `
import { INFURA_API_KEY } from '@env';
import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import Web3 from 'web3';

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});

export default function App(): JSX.Element {
  const web3 = React.useMemo(
    () =>
      new Web3(
        new Web3.providers.HttpProvider(
          \`https://ropsten.infura.io/v3/\${INFURA_API_KEY}\`
        )
      ),
    []
  );
  const [latestBlock, setLatestBlock] = React.useState<any>();
  React.useEffect(() => {
    (async () => {
      setLatestBlock(await web3.eth.getBlock('latest'));
    })();
  }, [setLatestBlock, web3]);
  return (
    <View style={[StyleSheet.absoluteFill, styles.center]}>
      <Text>Welcome to React Native!</Text>
      {!!latestBlock && (
        <Text>{\`The latest block's mining difficulty is: \${latestBlock.difficulty}.\`}</Text>
      )}
    </View>
  );
}
    `.trim()
  );
};

const shouldPrepareHardhatExample = (ctx: createContext) => {
  const {
    paths: { app, testsDir, test },
    options: { hardhat: maybeHardhatOptions },
  } = ctx;
  const {
    hardhatConfig,
    hardhatAccounts,
  } = maybeHardhatOptions as HardhatOptions;
  const contracts = path.resolve(ctx.paths.projectDir, 'contracts');
  !fs.existsSync(contracts) && fs.mkdirSync(contracts);
  !fs.existsSync(testsDir) && fs.mkdirSync(testsDir);

  // Write Test File.
  fs.writeFileSync(
    test,
    `
const { expect } = require("chai");

describe("Hello", function() {
  it("Should return the default greeting", async function() {
    const Hello = await ethers.getContractFactory("Hello");
    const hello = await Hello.deploy();
    
    await hello.deployed();

    expect(await hello.sayHello("React Native")).to.equal("Welcome to React Native!");
    expect(await hello.sayHello("Web3")).to.equal("Welcome to Web3!");
  });
});
    `
  );

  const contract = path.resolve(contracts, 'Hello.sol');
  fs.writeFileSync(contract, getExampleContract());

  fs.writeFileSync(
    hardhatConfig,
    `
/**
 * @type import('hardhat/config').HardhatUserConfig
 */
require("@nomiclabs/hardhat-waffle");

module.exports = {
  solidity: "0.7.3",
  networks: {
    hardhat: {
      accounts: ${JSON.stringify(hardhatAccounts)}
    },
  },
};
    `.trim()
  );

  fs.writeFileSync(
    app,
    `
import { HARDHAT_PRIVATE_KEY, HARDHAT_URL } from '@env';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Web3 from 'web3';

import Hello from './artifacts/contracts/Hello.sol/Hello.json';

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});

const shouldDeployContract = async (web3, abi, data, from: string) => {
  const deployment = new web3.eth.Contract(abi).deploy({ data });
  const gas = await deployment.estimateGas();
  const {
    options: { address: contractAddress },
  } = await deployment.send({ from, gas });
  return new web3.eth.Contract(abi, contractAddress);
};

export default function App(): JSX.Element {
  const [message, setMessage] = React.useState<string>('');
  const web3 = React.useMemo(
    () => new Web3(new Web3.providers.HttpProvider(HARDHAT_URL)),
    [HARDHAT_URL]
  );
  React.useEffect(() => {
    (async () => {
      const { address } = await web3.eth.accounts.privateKeyToAccount(HARDHAT_PRIVATE_KEY);
      const contract = await shouldDeployContract(
        web3,
        Hello.abi,
        Hello.bytecode,
        address
      );
      setMessage(await contract.methods.sayHello('React Native').call());
    })();
  }, [web3, shouldDeployContract, setMessage, HARDHAT_PRIVATE_KEY]);
  return (
    <View style={[StyleSheet.absoluteFill, styles.center]}>
      <Text>{message}</Text>
    </View>
  );
}
    `.trim()
  );
};

const shouldPrepareExample = (ctx: createContext) => {
  if (ctx.options.blockchainTools === BlockchainTools.TRUFFLE) {
    return shouldPrepareTruffleExample(ctx);
  } else if (ctx.options.blockchainTools === BlockchainTools.HARDHAT) {
    return shouldPrepareHardhatExample(ctx);
  }
  return shouldPrepareDefaultExample(ctx);
};

const shouldPrettify = (ctx: createContext) => {
  execSync(`cd ${ctx.paths.projectDir}; yarn prettier --write .`, {
    stdio: 'inherit',
  });
};

const maybeReturnGanacheGitIgnore = (ctx: createContext): string | null => {
  if (ctx.options.blockchainTools === BlockchainTools.TRUFFLE) {
    return `
# Truffle Suite
ganache.json
    `.trim();
  }
  return null;
};

const maybeReturnHardhatGitIgnore = (ctx: createContext): string | null => {
  if (ctx.options.blockchainTools === BlockchainTools.HARDHAT) {
    return `
# Hardhat
artifacts/
cache/
    `.trim();
  }
  return null;
};

const shouldPrepareGitignore = (ctx: createContext) => {
  const lines = [
    maybeReturnGanacheGitIgnore(ctx),
    maybeReturnHardhatGitIgnore(ctx),
  ].filter((e) => !!e) as readonly string[];
  fs.writeFileSync(
    ctx.paths.gitignore,
    `
${fs.readFileSync(ctx.paths.gitignore, 'utf-8')}
# Environment Variables (Store safe defaults in .env.example!)
.env

${lines.join('\n\n')}

  `.trim()
  );
};

const getScriptCommandString = (ctx: createContext, str: string) =>
  chalk.white.bold`${ctx.options.yarn ? 'yarn' : 'npm run-script'} ${str}`;

export const getSuccessMessagePrefix = (ctx: createContext): string | null => {
  if (ctx.options.blockchainTools === BlockchainTools.TRUFFLE) {
    return `
Before starting, you must initialize the simulated blockchain by executing:
- ${getScriptCommandString(ctx, 'ganache')}
    `.trim();
  } else if (ctx.options.blockchainTools === BlockchainTools.HARDHAT) {
    return `
Before starting, you must initialize the simulated blockchain by executing:
- ${getScriptCommandString(ctx, 'hardhat')}
    `.trim();
  }
  return null;
};

export const getSuccessMessageSuffix = (ctx: createContext): string | null => {
  if (ctx.options.blockchainTools === BlockchainTools.TRUFFLE) {
    return `
To recompile your contracts you can execute:
${chalk.white.bold`npx truffle compile`}

You can also test your contracts using:
${getScriptCommandString(ctx, 'test')}
    `.trim();
  } else if (ctx.options.blockchainTools === BlockchainTools.HARDHAT) {
    return `
To recompile your contracts you can execute:
${chalk.white.bold`npx hardhat compile`}

You can also test your contracts using:
${getScriptCommandString(ctx, 'test')}
    `;
  }
  return `
By the way, we've added a tiny stub that connects to Infura for you.
You'll need to fill in an INFURA_API_KEY in your ${chalk.white
    .bold`.env`} for this to work.
  `.trim();
};

export const getSuccessMessage = (ctx: createContext): string => {
  const pfx = getSuccessMessagePrefix(ctx);
  const sfx = getSuccessMessageSuffix(ctx);
  return `
${chalk.green`✔`} Successfully integrated Web3 into React Native!
${
  pfx
    ? ` 
${pfx}`
    : ''
}

To compile and run your project in development, execute one of the following commands:
- ${getScriptCommandString(ctx, `ios`)}
- ${getScriptCommandString(ctx, `android`)}
- ${getScriptCommandString(ctx, `web`)}
${
  sfx
    ? `
${sfx}`
    : ''
}

  `.trim();
};

export const create = async (params: createParams): Promise<createResult> => {
  createBaseProject(params);

  const ctx = await createBaseContext(params);

  if (!fs.existsSync(ctx.paths.projectDir)) {
    return Object.freeze({
      ...ctx,
      status: CreationStatus.FAILURE,
      message: `Failed to resolve project directory.`,
    });
  }

  setAppIcon();
  ejectExpoProject(ctx);
  injectShims(ctx);
  createScripts(ctx);
  createTests();
  preparePackage(ctx);
  shouldPrepareMetro(ctx);
  shouldPrepareBabel(ctx);
  shouldPrepareEslint(ctx);
  shouldPrepareTypeRoots(ctx);
  shouldPrepareSpelling(ctx);
  shouldPrepareTsc(ctx);
  shouldPrepareGitignore(ctx);
  shouldWriteEnv(ctx);

  shouldInstall(ctx);
  shouldPrepareExample(ctx);
  shouldPrettify(ctx);

  return Object.freeze({
    ...ctx,
    status: CreationStatus.SUCCESS,
    message: getSuccessMessage(ctx),
  });
};
