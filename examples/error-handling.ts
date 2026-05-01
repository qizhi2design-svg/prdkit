/**
 * 错误处理示例
 *
 * 展示如何使用 prdkit 的错误处理系统
 */

import {
  ConfigError,
  FileSystemError,
  GitError,
  NetworkError,
  ValidationError,
  TemplateError,
  PrototypeError,
  ServerError,
  UserCancelledError,
  ErrorCode,
  isPrdkitError,
  isRecoverableError,
  fromNativeError,
} from '../src/errors.js';

import {
  handleError,
  withErrorHandling,
  assert,
  tryOr,
  tryOrUndefined,
  wrapError,
  isErrorCode,
  isErrorType,
} from '../src/error-handler.js';

// ============================================================================
// 1. 抛出错误
// ============================================================================

function throwConfigError() {
  // 配置文件不存在
  throw ConfigError.notFound('/path/to/config.json');
}

function throwFileSystemError() {
  // 文件已存在
  throw FileSystemError.fileAlreadyExists('/path/to/file.md');
}

function throwValidationError() {
  // 无效的端口号
  throw ValidationError.invalidPort(99999);
}

function throwGitError() {
  // Git 克隆失败
  throw GitError.cloneFailed('git@github.com:user/repo.git');
}

function throwNetworkError() {
  // 网络超时
  throw NetworkError.timeout('https://api.example.com');
}

function throwTemplateError() {
  // 模板不存在
  throw TemplateError.notFound('custom-template');
}

function throwPrototypeError() {
  // Mark 文件格式无效
  throw PrototypeError.markFileInvalid('/path/to/mark.md', '文件名格式错误');
}

function throwServerError() {
  // 端口被占用
  throw ServerError.portInUse(8080);
}

function throwUserCancelledError() {
  // 用户取消操作
  throw new UserCancelledError('初始化项目');
}

// ============================================================================
// 2. 包装命令函数
// ============================================================================

// 使用 withErrorHandling 包装命令函数，自动处理错误
export const exampleCommand = withErrorHandling(async (options: any) => {
  console.log('执行命令...');

  // 任何抛出的错误都会被自动捕获和格式化
  if (options.fail) {
    throw ConfigError.notFound();
  }

  console.log('命令执行成功');
});

// ============================================================================
// 3. 条件断言
// ============================================================================

function validatePort(port: number) {
  // 使用 assert 进行条件检查
  assert(
    port >= 1 && port <= 65535,
    ValidationError.invalidPort(port)
  );

  console.log(`端口 ${port} 有效`);
}

function validateConfig(config: any) {
  // 检查必填字段
  assert(
    config.projectName,
    ValidationError.missingRequired('projectName')
  );

  assert(
    config.author,
    ValidationError.missingRequired('author')
  );

  console.log('配置验证通过');
}

// ============================================================================
// 4. 错误转换
// ============================================================================

async function readFileWithErrorHandling(path: string): Promise<string> {
  // 使用 wrapError 将原生错误转换为 PrdkitError
  return await wrapError(
    async () => {
      // 模拟文件读取
      throw new Error('ENOENT: no such file or directory');
    },
    (cause) => FileSystemError.readFailed(path, cause)
  );
}

async function cloneRepositoryWithErrorHandling(repoUrl: string): Promise<void> {
  return await wrapError(
    async () => {
      // 模拟 Git 克隆
      throw new Error('fatal: repository not found');
    },
    (cause) => GitError.cloneFailed(repoUrl, cause)
  );
}

// ============================================================================
// 5. 提供默认值
// ============================================================================

async function loadConfigWithDefault(): Promise<any> {
  // 使用 tryOr 在错误时返回默认值
  const config = await tryOr(
    async () => {
      // 尝试加载配置
      throw ConfigError.notFound();
    },
    {
      projectName: 'Default Project',
      author: 'Anonymous',
    }
  );

  console.log('配置:', config);
  return config;
}

async function loadOptionalConfig(): Promise<any | undefined> {
  // 使用 tryOrUndefined 在错误时返回 undefined
  const config = await tryOrUndefined(async () => {
    throw ConfigError.notFound();
  });

  console.log('可选配置:', config);
  return config;
}

// ============================================================================
// 6. 检查错误类型
// ============================================================================

async function handleSpecificErrors() {
  try {
    throw ConfigError.notFound();
  } catch (error) {
    // 检查错误代码
    if (isErrorCode(error, ErrorCode.CONFIG_NOT_FOUND)) {
      console.log('配置文件不存在，使用默认配置');
    }

    // 检查错误类型
    if (isErrorType(error, ConfigError)) {
      console.log('这是一个配置错误');
    }

    // 检查是否为 PrdkitError
    if (isPrdkitError(error)) {
      console.log('错误代码:', error.code);
      console.log('错误消息:', error.message);
      console.log('建议:', error.suggestions);
    }
  }
}

// ============================================================================
// 7. 错误恢复
// ============================================================================

async function handleRecoverableErrors() {
  try {
    throw FileSystemError.fileAlreadyExists('/path/to/file.md');
  } catch (error) {
    if (isRecoverableError(error)) {
      console.log('这是一个可恢复的错误，可以提示用户重试');
      // 提供替代方案或提示用户
    } else {
      console.log('这是一个不可恢复的错误，程序应该退出');
      throw error;
    }
  }
}

// ============================================================================
// 8. 错误链
// ============================================================================

async function errorChainExample() {
  try {
    // 原始错误
    const nativeError = new Error('ENOENT: no such file or directory');

    // 包装为 FileSystemError
    const fsError = FileSystemError.readFailed('/path/to/file', nativeError);

    // 再包装为 ConfigError
    throw ConfigError.invalid('无法读取配置文件', fsError);
  } catch (error) {
    if (isPrdkitError(error)) {
      console.log('错误消息:', error.message);
      console.log('错误详情:', error.details);

      // 访问错误链
      if (error.cause) {
        console.log('原因:', error.cause);
      }
    }
  }
}

// ============================================================================
// 9. 从原生错误转换
// ============================================================================

function convertNativeErrors() {
  // ENOENT 错误
  try {
    throw new Error('ENOENT: no such file or directory');
  } catch (error) {
    const prdkitError = fromNativeError(error, '读取配置文件');
    console.log('转换后的错误:', prdkitError.code); // FILE_NOT_FOUND
  }

  // EACCES 错误
  try {
    throw new Error('EACCES: permission denied');
  } catch (error) {
    const prdkitError = fromNativeError(error);
    console.log('转换后的错误:', prdkitError.code); // PERMISSION_DENIED
  }

  // EADDRINUSE 错误
  try {
    throw new Error('EADDRINUSE: address already in use 8080');
  } catch (error) {
    const prdkitError = fromNativeError(error);
    console.log('转换后的错误:', prdkitError.code); // PORT_IN_USE
  }

  // 网络超时错误
  try {
    throw new Error('Connection timed out');
  } catch (error) {
    const prdkitError = fromNativeError(error);
    console.log('转换后的错误:', prdkitError.code); // CONNECTION_TIMEOUT
  }
}

// ============================================================================
// 10. 实际使用场景
// ============================================================================

// 场景 1: 读取配置文件
async function readConfig(path: string): Promise<any> {
  return await wrapError(
    async () => {
      // 实际的文件读取逻辑
      throw new Error('ENOENT');
    },
    (cause) => ConfigError.invalid('配置文件读取失败', cause)
  );
}

// 场景 2: 验证用户输入
function validateUserInput(input: any) {
  assert(input.title, ValidationError.missingRequired('title'));
  assert(input.title.length > 0, ValidationError.invalidInput('title', '标题不能为空'));
  assert(input.title.length <= 100, ValidationError.invalidInput('title', '标题过长'));
}

// 场景 3: 处理端口冲突
async function startServer(port: number): Promise<void> {
  try {
    // 尝试启动服务器
    throw new Error('EADDRINUSE');
  } catch (error) {
    if (error instanceof Error && error.message.includes('EADDRINUSE')) {
      throw ServerError.portInUse(port);
    }
    throw error;
  }
}

// 场景 4: 处理 Git 操作
async function cloneRepository(repoUrl: string): Promise<void> {
  try {
    // 执行 git clone
    throw new Error('fatal: repository not found');
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        throw GitError.repositoryNotFound(repoUrl);
      }
      if (error.message.includes('timeout')) {
        throw NetworkError.timeout(repoUrl);
      }
      throw GitError.cloneFailed(repoUrl, error);
    }
    throw error;
  }
}

// 场景 5: 处理文件已存在
async function createFile(path: string, content: string): Promise<void> {
  // 检查文件是否存在
  const exists = true; // 模拟检查

  if (exists) {
    throw FileSystemError.fileAlreadyExists(path);
  }

  // 创建文件
  console.log('文件创建成功');
}

// ============================================================================
// 运行示例
// ============================================================================

async function runExamples() {
  console.log('=== 错误处理示例 ===\n');

  // 示例 1: 条件断言
  console.log('1. 条件断言');
  try {
    validatePort(8080);
    validatePort(99999); // 会抛出错误
  } catch (error) {
    if (isPrdkitError(error)) {
      console.log('错误:', error.message);
    }
  }
  console.log();

  // 示例 2: 提供默认值
  console.log('2. 提供默认值');
  await loadConfigWithDefault();
  await loadOptionalConfig();
  console.log();

  // 示例 3: 检查错误类型
  console.log('3. 检查错误类型');
  await handleSpecificErrors();
  console.log();

  // 示例 4: 错误恢复
  console.log('4. 错误恢复');
  await handleRecoverableErrors();
  console.log();

  // 示例 5: 错误链
  console.log('5. 错误链');
  await errorChainExample();
  console.log();

  // 示例 6: 从原生错误转换
  console.log('6. 从原生错误转换');
  convertNativeErrors();
  console.log();
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  runExamples().catch(console.error);
}
