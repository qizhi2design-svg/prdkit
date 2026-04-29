export const COPY = {
  rootDescription: "产品经理项目工具套件",
  rootHelpAfter: `
常用流程
  1. prdkit init ./my-product --name "My Product" --author "Alice"
  2. prdkit prd create "支付流程优化"
  3. prdkit prototype create "首页原型"
  4. prdkit mark list --prototype dashboard
`,
  initDescription: "初始化产品项目",
  initHelpAfter: `
示例：
  prdkit init
  prdkit init ./my-product --name "My Product" --author "Alice"

说明：
  在指定目录创建完整的项目结构，包含文档管理所需的目录和配置。
`,
  createDescription: "创建文档（兼容命令）",
  createHelpAfter: `
示例：
  prdkit create "支付流程优化" --template prd
  prdkit create "首页原型" --template prototype --dir ./workspace/prototypes
  prdkit create --template prd --non-interactive --name "My Product" --author "Alice" "结算改版"

说明：
  这是兼容保留命令。
  推荐改用 prdkit prd create 或 prdkit prototype create。
`,
  prdDescription: "PRD 文档相关命令",
  prdCreateDescription: "创建 PRD 文档",
  prdCreateHelpAfter: `
示例：
  prdkit prd create "支付流程优化"
  prdkit prd create "结算改版" --dir ./workspace/prds

说明：
  默认使用 prd 模板创建文档，输出目录默认来自项目配置中的 workspace/prds。
`,
  prototypeDescription: "原型相关命令",
  prototypeCreateDescription: "创建原型文档",
  prototypeCreateHelpAfter: `
示例：
  prdkit prototype create "首页原型"
  prdkit prototype create "登录页" --dir ./workspace/prototypes

说明：
  默认使用 prototype 模板创建内容，输出目录默认来自项目配置中的 workspace/prototypes。
`,
  prototypeListDescription: "列出当前项目中的所有原型",
  prototypeListHelpAfter: `
示例：
  prdkit prototype list
  prdkit prototype list --json

说明：
  输出 workspace/prototypes 下的所有原型入口页面路径。
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
  publishDescription: "导出 publish 协议产物目录",
  publishHelpAfter: `
示例：
  prdkit publish
  prdkit publish --output ./dist/publish/demo

说明：
  导出标准只读数据协议目录，包含 manifest.json、marks.json 和 prototypes/。
  该产物供后续 viewer-publish 项目或公网静态服务消费，不包含只读 viewer 页面。
`,
  updateDescription: "检查并更新 prdkit 到最新版本",
  updateHelpAfter: `
示例：
  prdkit update

说明：
  检查 npm 上的最新版本，如果有更新则自动安装。
`,
  markDescription: "标记相关命令",
  markListDescription: "列出指定原型下的所有标记",
  markListHelpAfter: `
示例：
  prdkit mark list --prototype dashboard
  prdkit mark list --prototype dashboard --json

说明：
  读取指定原型目录下 marks 文件夹中的所有标记文件。
`,
  markCreateDescription: "创建标记",
  markCreateHelpAfter: `
示例：
  prdkit mark create --prototype dashboard --title "按钮文案需要统一"
  prdkit mark create --prototype login --title "密码框提示不清晰" --desc "建议补充错误态文案"

说明：
  在指定原型下创建一个新的 mark 文件。
  标记 ID 会由系统自动按时间戳生成。
  创建时仍可补充 selector、DOM 路径和位置信息。
`,
  markEditDescription: "编辑标记",
  markEditHelpAfter: `
示例：
  prdkit mark edit mark-1777349007244 --prototype dashboard --title "图例层级不清晰"
  prdkit mark edit mark-1777349007244 --prototype dashboard --desc-file ./notes/legend.md

说明：
  只更新标题和描述内容，不修改 selector、DOM 路径或位置信息。
`,
  markDeleteDescription: "删除标记",
  markDeleteHelpAfter: `
示例：
  prdkit mark delete mark-1777349007244 --prototype dashboard

说明：
  删除指定原型下对应 ID 的 mark 文件。
`,
  listMarksDescription: "列出原型下的所有标记或原型列表（兼容命令）",
  listMarksHelpAfter: `
示例：
  prdkit list my-prototype      # 列出指定原型的标记
  prdkit list --prototypes      # 列出所有原型

说明：
  这是兼容保留命令。
  推荐改用 prdkit mark list 或 prdkit prototype list。
`
} as const;
