export const COPY = {
  rootDescription: "产品经理项目工具套件",
  rootHelpAfter: `
常用流程
  1. prdkit init ./my-product --name "My Product" --author "Alice"
  2. prdkit prd create "支付流程优化"
  3. prdkit prd check "支付流程优化"
  4. prdkit prototype create "首页原型" --template mobile
  5. prdkit mark list --prototype dashboard
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
  prdkit create "工作台" --template prototype-admin --dir ./workspace/prototypes
  prdkit create --template prd --non-interactive --name "My Product" --author "Alice" "结算改版"

说明：
  这是兼容保留命令。
  推荐改用 prdkit prd create 或 prdkit prototype create。
`,
  prdDescription: "PRD 文档相关命令",
  prdCreateDescription: "创建 PRD 文档",
  prdCheckDescription: "定位 PRD 并给出 review skill 使用入口",
  prdCreateHelpAfter: `
示例：
  prdkit prd create "支付流程优化"
  prdkit prd create "结算改版" --dir ./workspace/prds
  prdkit prd create --from-plan ./draft/reference/支付流程优化-prd-plan.md

说明：
  默认使用 prd 模板创建文档，输出目录默认来自项目配置中的 workspace/prds。
  推荐先通过 prdkit-prd-create skill 完成复杂度判断和方案确认，再用 --from-plan 生成正式 PRD 初稿。
`,
  prdCheckHelpAfter: `
示例：
  prdkit prd check
  prdkit prd check "支付流程优化"
  prdkit prd check 支付流程优化-prd.md
  prdkit prd check ./workspace/prds/支付流程优化-prd.md

说明：
  该命令不会在 CLI 内直接执行 AI 评审，而是负责定位目标 PRD，并给出推荐的 prdkit-prd-check skill 调用方式。
  推荐在支持 skill 的终端中，基于命令输出继续执行 review。
`,
  prdListDescription: "列出当前项目中的所有 PRD",
  prdListHelpAfter: `
示例：
  prdkit prd list
  prdkit prd list --json

说明：
  输出 workspace/prds 下的所有 PRD 文档列表。
`,
  prdCheckpointDescription: "管理 PRD 文档的 checkpoint",
  prdCheckpointCreateDescription: "为指定 PRD 创建 checkpoint",
  prdCheckpointCreateHelpAfter: `
示例：
  prdkit prd checkpoint create
  prdkit prd checkpoint create "支付流程优化" -m "补充验收标准"

说明：
  默认选择最近修改的一份 PRD。
  如果内容与最近一次 checkpoint 完全一致，则不会重复创建。
`,
  prdCheckpointListDescription: "列出 PRD checkpoint 时间线",
  prdCheckpointListHelpAfter: `
示例：
  prdkit prd checkpoint list
  prdkit prd checkpoint list "支付流程优化" --json

说明：
  可按单份 PRD 过滤，也可查看整个项目下的所有 PRD checkpoint。
`,
  prdCheckpointShowDescription: "查看单个 PRD checkpoint 详情",
  prdCheckpointShowHelpAfter: `
示例：
  prdkit prd checkpoint show prd-manual-2026-05-06T00-00-00-000Z-ab12cd

说明：
  展示 checkpoint 的元信息、文档大小与行数。
`,
  prdCheckpointDiffDescription: "对比两个 PRD checkpoint 的文本差异摘要",
  prdCheckpointDiffHelpAfter: `
示例：
  prdkit prd checkpoint diff checkpoint-a checkpoint-b
  prdkit prd checkpoint diff checkpoint-a checkpoint-b --json

说明：
  输出文本是否变化，以及新增/删除的行数摘要。
`,
  prdCheckpointStatusDescription: "查看当前 PRD 相对最近 checkpoint 的状态",
  prdCheckpointStatusHelpAfter: `
示例：
  prdkit prd checkpoint status
  prdkit prd checkpoint status "支付流程优化" --json

说明：
  默认选择最近修改的一份 PRD，并输出当前工作区的变化摘要。
`,
  prdCheckpointRestoreDescription: "恢复到指定 PRD checkpoint",
  prdCheckpointRestoreHelpAfter: `
示例：
  prdkit prd checkpoint restore checkpoint-a
  prdkit prd checkpoint restore checkpoint-a --force

说明：
  默认遇到未归档变更会停止。
  使用 --force 时会先创建 pre-restore checkpoint 再恢复。
`,
  prototypeDescription: "原型相关命令",
  prototypeCreateDescription: "创建原型文档",
  prototypeCreateHelpAfter: `
示例：
  prdkit prototype create "首页原型"
  prdkit prototype create "移动首页" --template mobile
  prdkit prototype create "运营后台" --template admin --dir ./workspace/prototypes

说明：
  默认使用 web 原型模板创建内容，输出目录默认来自项目配置中的 workspace/prototypes。
  可通过 --template 选择 web、mobile、admin 三种原型骨架。
  创建页面后会自动生成初始 checkpoint。
`,
  prototypeListDescription: "列出当前项目中的所有原型",
  prototypeListHelpAfter: `
示例：
  prdkit prototype list
  prdkit prototype list --json

说明：
  输出 workspace/prototypes 下的所有原型入口页面路径。
`,
  prototypePublishDescription: "发布原型到本地目录或云端",
  prototypePublishHelpAfter: `
示例：
  prdkit prototype publish
  prdkit prototype publish --output ./dist/publish/demo
  prdkit prototype publish --cloud --project demo-workspace

说明：
  默认导出标准只读数据协议目录，包含 manifest.json、marks.json 和 prototypes/。
  使用 --cloud 时发布到云端项目；项目可通过 --project 指定，或先在本地 viewer 中选择。
`,
  checkpointDescription: "checkpoint 存储、对比与恢复",
  checkpointCreateDescription: "为指定原型创建 checkpoint",
  checkpointCreateHelpAfter: `
示例：
  prdkit checkpoint create dashboard
  prdkit checkpoint create dashboard -m "首页导航改版"

说明：
  手动创建一个 checkpoint。
  如果内容与最近一次 checkpoint 完全一致，则不会重复创建。
`,
  checkpointSessionDescription: "管理手动 checkpoint session",
  checkpointSessionStartDescription: "启动一个手动 session",
  checkpointSessionStartHelpAfter: `
示例：
  prdkit checkpoint session start
  prdkit checkpoint session start --name "AI 改版第 1 轮"

说明：
  记录当前进行中的手动 session。
  不会自动创建 checkpoint，需在合适时机执行 checkpoint create。
`,
  checkpointSessionStatusDescription: "查看当前 session 状态",
  checkpointSessionStatusHelpAfter: `
示例：
  prdkit checkpoint session status

说明：
  查看当前是否存在进行中的手动 session。
`,
  checkpointSessionEndDescription: "结束当前手动 session",
  checkpointSessionEndHelpAfter: `
示例：
  prdkit checkpoint session end

说明：
  只结束 session 状态，不会自动创建 checkpoint。
  如需保存版本，请先执行 checkpoint create。
`,
  checkpointListDescription: "列出 checkpoint 时间线",
  checkpointListHelpAfter: `
示例：
  prdkit checkpoint list
  prdkit checkpoint list dashboard --json

说明：
  可按原型筛选，也可查看整个项目下已记录的 checkpoint。
`,
  checkpointShowDescription: "查看单个 checkpoint 详情",
  checkpointShowHelpAfter: `
示例：
  prdkit checkpoint show manual-2026-04-30T00-00-00-000Z-ab12cd

说明：
  展示 checkpoint 的元信息、文件数与标记数。
`,
  checkpointDiffDescription: "对比两个 checkpoint 的结构化差异",
  checkpointDiffHelpAfter: `
示例：
  prdkit checkpoint diff checkpoint-a checkpoint-b
  prdkit checkpoint diff checkpoint-a checkpoint-b --json

说明：
  输出新增/修改/删除文件，以及标记的新增/更新/删除摘要。
`,
  checkpointPreviewDescription: "生成 checkpoint 的可访问预览目录",
  checkpointPreviewHelpAfter: `
示例：
  prdkit checkpoint preview checkpoint-a
  prdkit checkpoint preview checkpoint-a --open

说明：
  将 checkpoint 版本还原到 .prdkit/checkpoints/previews/<checkpoint-id>/ 下。
  适合在本地直接打开该历史版本页面进行检查。
`,
  checkpointRestoreDescription: "恢复到指定 checkpoint",
  checkpointRestoreHelpAfter: `
示例：
  prdkit checkpoint restore checkpoint-a
  prdkit checkpoint restore checkpoint-a --force

说明：
  默认遇到未归档变更会停止。
  使用 --force 时会先创建 pre-restore checkpoint 再恢复。
`,
  checkpointStatusDescription: "查看工作区相对最近 checkpoint 的状态",
  checkpointStatusHelpAfter: `
示例：
  prdkit checkpoint status
  prdkit checkpoint status dashboard --json

说明：
  输出当前原型是否为 dirty，以及文件和标记层面的变化摘要。
`,
  checkpointPruneDescription: "清理超出保留上限的自动 checkpoint",
  checkpointPruneHelpAfter: `
示例：
  prdkit checkpoint prune
  prdkit checkpoint prune dashboard

说明：
  清理历史遗留的 auto checkpoint，不会删除 manual 或 pre-restore。
`,
  initProjectNameMessage: "输入项目名称",
  initAuthorMessage: "输入作者名称",
  createTemplateMessage: "选择要创建的模板",
  createTitleMessage: "输入文档标题",
  createOutputDirMessage: "输入输出目录",
  nonInteractiveTemplateRequired: "--non-interactive 模式下必须通过 --template 指定模板 ID",
  nonInteractiveTitleRequired: "--non-interactive 模式下必须提供标题参数",
  targetNotEmpty: "目标目录包含非骨架文件，初始化可能覆盖现有内容",
  createNextStep: "下一步：执行 prdkit prd create <标题> 或 prdkit prototype create <标题> 开始产出内容",
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
  通过 \`prdkit prototype create\` 新建页面时会自动生成初始 checkpoint。
  文件监听本身不会持续自动创建 checkpoint。
  自动选择可用端口并打开浏览器。
`,
  serveStatusDescription: "查看服务运行状态",
  serveStatusHelpAfter: `
示例：
  prdkit serve status

说明：
  检查当前项目是否有正在运行的预览服务器。
  显示服务的端口、模式、启动时间等信息。
`,
  publishDescription: "已废弃，请改用 prototype publish",
  publishHelpAfter: `
示例：
  prdkit prototype publish
  prdkit prototype publish --output ./dist/publish/demo
  prdkit prototype publish --cloud --project demo-workspace

说明：
  顶级 publish 命令已移除。
  请改用 prdkit prototype publish 管理本地发布和云端发布。
`,
  updateDescription: "检查并更新 prdkit 到最新版本",
  updateHelpAfter: `
示例：
  prdkit update

说明：
  检查 npm 上的最新版本，如果有更新则自动安装。
`,
  infoDescription: "查看项目信息和内容统计",
  infoHelpAfter: `
示例：
  prdkit info
  prdkit info --json

说明：
  显示项目名称、作者以及各类文档的统计信息。
  同时包含云端服务器地址、登录状态、默认项目和最近发布信息。
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
  markGetDescription: "获取指定标记的详细信息",
  markGetHelpAfter: `
示例：
  prdkit mark get mark-1777349007244 --prototype dashboard
  prdkit mark get mark-1777349007244 --prototype dashboard --json

说明：
  读取指定标记的完整内容，包括标题、描述、选择器等信息。
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
`,
  jsonOutputOption: "以 JSON 格式输出",
  notInProjectError: "当前目录不在 prdkit 项目中"
} as const;
