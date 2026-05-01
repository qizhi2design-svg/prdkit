/**
 * 日志系统示例
 *
 * 展示如何使用 prdkit 的日志系统
 */

import { Logger, logger } from '../src/logger.js';

// ============================================================================
// 1. 基本使用
// ============================================================================

function basicLogging() {
  console.log('=== 基本日志使用 ===\n');

  // 使用全局 logger 实例
  logger.debug('这是调试信息');
  logger.info('这是普通信息');
  logger.warn('这是警告信息');
  logger.error('这是错误信息');
  logger.success('这是成功信息');

  console.log();
}

// ============================================================================
// 2. 结构化日志
// ============================================================================

function structuredLogging() {
  console.log('=== 结构化日志 ===\n');

  // 添加元数据
  logger.info('用户登录', {
    userId: 123,
    username: 'alice',
    ip: '192.168.1.1',
    timestamp: Date.now(),
  });

  logger.error('API 请求失败', {
    url: 'https://api.example.com',
    method: 'POST',
    statusCode: 500,
    duration: 1234,
  });

  logger.debug('函数调用', {
    function: 'processTemplate',
    args: { templateId: 'prd', variables: { title: 'Test' } },
  });

  console.log();
}

// ============================================================================
// 3. 不同日志级别
// ============================================================================

function logLevels() {
  console.log('=== 日志级别过滤 ===\n');

  // 创建不同级别的 logger
  const debugLogger = new Logger({ level: 'debug' });
  const infoLogger = new Logger({ level: 'info' });
  const warnLogger = new Logger({ level: 'warn' });
  const errorLogger = new Logger({ level: 'error' });

  console.log('Debug 级别（显示所有）:');
  debugLogger.debug('debug message');
  debugLogger.info('info message');
  debugLogger.warn('warn message');
  debugLogger.error('error message');

  console.log('\nInfo 级别（不显示 debug）:');
  infoLogger.debug('debug message - 不会显示');
  infoLogger.info('info message');
  infoLogger.warn('warn message');
  infoLogger.error('error message');

  console.log('\nWarn 级别（只显示 warn 和 error）:');
  warnLogger.debug('debug message - 不会显示');
  warnLogger.info('info message - 不会显示');
  warnLogger.warn('warn message');
  warnLogger.error('error message');

  console.log('\nError 级别（只显示 error）:');
  errorLogger.debug('debug message - 不会显示');
  errorLogger.info('info message - 不会显示');
  errorLogger.warn('warn message - 不会显示');
  errorLogger.error('error message');

  console.log();
}

// ============================================================================
// 4. 日志格式
// ============================================================================

function logFormats() {
  console.log('=== 日志格式 ===\n');

  // Pretty 格式（默认）
  console.log('Pretty 格式:');
  const prettyLogger = new Logger({ format: 'pretty' });
  prettyLogger.info('这是 pretty 格式的日志');
  prettyLogger.success('操作成功', { duration: '2.5s' });

  // JSON 格式
  console.log('\nJSON 格式:');
  const jsonLogger = new Logger({ format: 'json' });
  jsonLogger.info('这是 JSON 格式的日志');
  jsonLogger.success('操作成功', { duration: '2.5s' });

  // 动态切换格式
  console.log('\n动态切换格式:');
  const dynamicLogger = new Logger({ format: 'pretty' });
  dynamicLogger.info('Pretty 格式');
  dynamicLogger.setFormat('json');
  dynamicLogger.info('JSON 格式');

  console.log();
}

// ============================================================================
// 5. Spinner 使用
// ============================================================================

async function spinnerUsage() {
  console.log('=== Spinner 使用 ===\n');

  // 基本使用
  const spinner1 = logger.spinner('正在处理...');
  spinner1.start();
  await sleep(1000);
  spinner1.succeed('处理完成');

  // 失败情况
  const spinner2 = logger.spinner('正在执行操作...');
  spinner2.start();
  await sleep(1000);
  spinner2.fail('操作失败');

  // 警告情况
  const spinner3 = logger.spinner('正在检查...');
  spinner3.start();
  await sleep(1000);
  spinner3.warn('发现警告');

  // 更新消息
  const spinner4 = logger.spinner('步骤 1/3');
  spinner4.start();
  await sleep(500);
  spinner4.text = '步骤 2/3';
  await sleep(500);
  spinner4.text = '步骤 3/3';
  await sleep(500);
  spinner4.succeed('所有步骤完成');

  console.log();
}

// ============================================================================
// 6. 命令执行日志
// ============================================================================

async function commandExecutionLogging() {
  console.log('=== 命令执行日志 ===\n');

  logger.info('开始执行命令', { command: 'init', args: { targetDir: './my-project' } });

  logger.debug('检查项目配置');
  await sleep(200);

  logger.info('克隆模板仓库');
  await sleep(500);

  logger.info('复制文件');
  await sleep(300);

  logger.success('项目初始化完成', { duration: '1.2s' });

  console.log();
}

// ============================================================================
// 7. 错误日志
// ============================================================================

function errorLogging() {
  console.log('=== 错误日志 ===\n');

  try {
    throw new Error('操作失败');
  } catch (error) {
    logger.error('捕获到错误', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }

  console.log();
}

// ============================================================================
// 8. 警告日志
// ============================================================================

function warningLogging() {
  console.log('=== 警告日志 ===\n');

  const config = { projectName: 'Test' };

  if (!config.author) {
    logger.warn('未设置作者，使用默认值', {
      field: 'author',
      defaultValue: 'Anonymous',
    });
  }

  logger.warn('端口 8080 已被占用，尝试使用端口 8081');

  console.log();
}

// ============================================================================
// 9. 调试日志
// ============================================================================

function debugLogging() {
  console.log('=== 调试日志 ===\n');

  const debugLogger = new Logger({ level: 'debug' });

  const startTime = Date.now();

  debugLogger.debug('函数调用', {
    function: 'processTemplate',
    args: { templateId: 'prd', variables: { title: 'Test' } },
    timestamp: startTime,
  });

  // 模拟处理
  const result = { success: true, output: '/path/to/output.md' };

  debugLogger.debug('函数返回', {
    function: 'processTemplate',
    result,
    duration: Date.now() - startTime,
  });

  console.log();
}

// ============================================================================
// 10. 进度日志
// ============================================================================

async function progressLogging() {
  console.log('=== 进度日志 ===\n');

  const files = ['file1.md', 'file2.md', 'file3.md', 'file4.md', 'file5.md'];

  logger.info(`找到 ${files.length} 个文件`);

  for (let i = 0; i < files.length; i++) {
    logger.debug(`处理文件 ${i + 1}/${files.length}`, {
      file: files[i],
      progress: `${Math.round(((i + 1) / files.length) * 100)}%`,
    });
    await sleep(200);
  }

  logger.success('所有文件处理完成');

  console.log();
}

// ============================================================================
// 11. 性能监控
// ============================================================================

async function performanceMonitoring() {
  console.log('=== 性能监控 ===\n');

  // 记录操作耗时
  const startTime = Date.now();

  await sleep(1000);

  const duration = Date.now() - startTime;
  logger.info('操作完成', { duration: `${duration}ms` });

  // 记录内存使用
  const memUsage = process.memoryUsage();
  logger.debug('内存使用情况', {
    heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
    rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
  });

  console.log();
}

// ============================================================================
// 12. 环境变量配置
// ============================================================================

function environmentConfiguration() {
  console.log('=== 环境变量配置 ===\n');

  console.log('当前环境变量:');
  console.log('PRDKIT_LOG_LEVEL:', process.env.PRDKIT_LOG_LEVEL || '未设置');
  console.log('PRDKIT_LOG_FORMAT:', process.env.PRDKIT_LOG_FORMAT || '未设置');
  console.log('PRDKIT_LOG_FILE:', process.env.PRDKIT_LOG_FILE || '未设置');

  console.log('\n使用示例:');
  console.log('PRDKIT_LOG_LEVEL=debug pnpm dev');
  console.log('PRDKIT_LOG_FORMAT=json pnpm dev');
  console.log('PRDKIT_LOG_FILE=/tmp/prdkit.log pnpm dev');

  console.log();
}

// ============================================================================
// 13. 实际使用场景
// ============================================================================

// 场景 1: 初始化项目
async function initProjectExample() {
  console.log('=== 场景：初始化项目 ===\n');

  logger.info('开始初始化项目');

  const spinner = logger.spinner('正在克隆 scaffold 仓库...');
  spinner.start();
  await sleep(1000);
  spinner.succeed('Scaffold 仓库克隆完成');

  logger.info('复制项目文件');
  await sleep(500);

  logger.info('创建配置文件');
  await sleep(300);

  logger.success('项目初始化完成', {
    path: './my-project',
    duration: '1.8s',
  });

  console.log();
}

// 场景 2: 创建文档
async function createDocumentExample() {
  console.log('=== 场景：创建文档 ===\n');

  logger.info('开始创建文档', { template: 'prd', title: '用户登录功能' });

  logger.debug('读取模板文件', { path: '.prdkit/templates/prd.md' });
  await sleep(200);

  logger.debug('渲染模板变量');
  await sleep(300);

  logger.info('写入文档文件', { output: 'workspace/prds/用户登录功能.md' });
  await sleep(200);

  logger.success('文档创建成功');

  console.log();
}

// 场景 3: 启动服务器
async function startServerExample() {
  console.log('=== 场景：启动服务器 ===\n');

  logger.info('启动原型预览服务器');

  logger.debug('扫描原型目录', { path: 'workspace/prototypes' });
  await sleep(300);

  logger.warn('端口 8080 已被占用');
  logger.info('尝试使用端口 8081');

  const spinner = logger.spinner('正在启动服务器...');
  spinner.start();
  await sleep(1000);
  spinner.succeed('服务器启动成功');

  logger.success('服务器运行中', {
    url: 'http://localhost:8081',
    port: 8081,
  });

  console.log();
}

// 场景 4: 错误处理
async function errorHandlingExample() {
  console.log('=== 场景：错误处理 ===\n');

  logger.info('开始读取配置文件');

  try {
    throw new Error('配置文件不存在');
  } catch (error) {
    logger.error('配置文件读取失败', {
      error: error instanceof Error ? error.message : String(error),
      path: '.prdkit/config.json',
    });

    logger.warn('使用默认配置');
  }

  logger.success('配置加载完成');

  console.log();
}

// ============================================================================
// 工具函数
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// 运行所有示例
// ============================================================================

async function runAllExamples() {
  console.log('\n');
  console.log('╔════════════════════════════════════════╗');
  console.log('║     prdkit 日志系统使用示例            ║');
  console.log('╚════════════════════════════════════════╝');
  console.log('\n');

  basicLogging();
  structuredLogging();
  logLevels();
  logFormats();
  await spinnerUsage();
  await commandExecutionLogging();
  errorLogging();
  warningLogging();
  debugLogging();
  await progressLogging();
  await performanceMonitoring();
  environmentConfiguration();

  console.log('╔════════════════════════════════════════╗');
  console.log('║         实际使用场景示例               ║');
  console.log('╚════════════════════════════════════════╝');
  console.log('\n');

  await initProjectExample();
  await createDocumentExample();
  await startServerExample();
  await errorHandlingExample();

  console.log('所有示例运行完成！');
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples().catch(console.error);
}

// 导出示例函数供其他模块使用
export {
  basicLogging,
  structuredLogging,
  logLevels,
  logFormats,
  spinnerUsage,
  commandExecutionLogging,
  errorLogging,
  warningLogging,
  debugLogging,
  progressLogging,
  performanceMonitoring,
  environmentConfiguration,
  initProjectExample,
  createDocumentExample,
  startServerExample,
  errorHandlingExample,
};
