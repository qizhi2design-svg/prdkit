# PRDKit 原型预览包

这是一个打包后的 PRDKit 原型预览文件，包含了选中的原型和标记数据。

## 使用方法

此预览包需要通过 HTTP 服务器访问。你可以：

1. 使用 PRDKit 预览服务器（推荐）
2. 使用任何静态文件服务器

### 使用静态文件服务器

**Node.js:**
```bash
npx serve .
```

**Python 3:**
```bash
python3 -m http.server 8080
```

**Python 2:**
```bash
python -m SimpleHTTPServer 8080
```

然后在浏览器中访问：http://localhost:8080

## 文件结构

```
.
├── index.html          # 预览器入口
├── assets/             # 预览器资源文件（JS/CSS）
├── data.json           # 原型数据和标记
├── prototypes/         # 原型文件
│   └── [原型名]/
│       ├── index.html
│       └── assets/
└── README.md           # 本文件
```

## 功能说明

- **只读模式**：此预览包为只读模式，无法编辑或添加标记
- **原型预览**：可以浏览所有打包的原型
- **标记查看**：可以查看已有的标记和注释

## 注意事项

⚠️ **必须通过 HTTP 服务器访问**

由于浏览器的安全限制，不能直接双击 index.html 打开，必须通过 HTTP 服务器访问。

## 技术支持

如有问题，请访问：https://github.com/qizhi2design-svg/prdkit


