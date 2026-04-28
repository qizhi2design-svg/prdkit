export const COPY = {
  rootDescription: "产品经理项目工具套件",
  rootHelpAfter: `
常用流程
  1. prdkit init ./my-product --name "My Product" --author "Alice"
  2. prdkit create "支付流程优化" --template prd
  3. prdkit create "首页原型" --template prototype
`,
  initDescription: "初始化产品项目",
  initHelpAfter: `
示例：
  prdkit init
  prdkit init ./my-product --name "My Product" --author "Alice"

说明：
  在指定目录创建完整的项目结构，包含文档管理所需的目录和配置。
`,
  createDescription: "创建文档",
  createHelpAfter: `
示例：
  prdkit create "支付流程优化" --template prd
  prdkit create "首页原型" --template prototype --dir ./workspace/prototypes
  prdkit create --template prd --non-interactive --name "My Product" --author "Alice" "结算改版"

说明：
  根据选择的模板类型快速创建文档，支持 PRD、原型等多种文档类型。
`,
  initProjectNameMessage: "输入项目名称",
  initAuthorMessage: "输入作者名称",
  createTemplateMessage: "选择要创建的模板",
  createTitleMessage: "输入文档标题",
  createOutputDirMessage: "输入输出目录",
  nonInteractiveTemplateRequired: "--non-interactive 模式下必须通过 --template 指定模板 ID",
  nonInteractiveTitleRequired: "--non-interactive 模式下必须提供标题参数",
  targetNotEmpty: "目标目录包含非骨架文件，初始化可能覆盖现有内容",
  createNextStep: "下一步：执行 prdkit create --template <id> <title> 创建文档",
  doctorDescription: "检查并修复项目问题",
  doctorHelpAfter: `
示例：
  prdkit doctor
  prdkit doctor --fix

说明：
  检查项目结构完整性和文档格式规范，发现问题后可自动修复。
`,
  serveDescription: "启动原型预览服务器",
  serveHelpAfter: `
示例：
  prdkit serve
  prdkit serve --port 8080
  prdkit serve --no-open

说明：
  启动本地预览服务器，支持实时预览和热更新。
  自动选择可用端口并打开浏览器。
`,
  updateDescription: "检查并更新 prdkit 到最新版本",
  updateHelpAfter: `
示例：
  prdkit update

说明：
  检查 npm 上的最新版本，如果有更新则自动安装。
`,
  listMarksDescription: "列出原型下的所有标记或原型列表",
  listMarksHelpAfter: `
示例：
  prdkit list my-prototype                    # 列出标记（表格格式）
  prdkit list my-prototype --format simple    # 简单列表
  prdkit list my-prototype --format detailed  # 详细列表
  prdkit list my-prototype --format json      # JSON 格式
  prdkit list --prototypes                    # 列出所有原型
  prdkit list --prototypes --format tree      # 树形格式

说明：
  列出指定原型目录下 marks 文件夹中的所有标记文件。
  使用 --prototypes 选项可以列出所有原型。
  支持多种输出格式：table（表格）、simple（简单列表）、detailed（详细列表）、json（JSON）、tree（树形，仅原型列表）。
`
} as const;
