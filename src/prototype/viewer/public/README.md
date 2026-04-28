# PRDKit 原型预览包

这是一个打包的原型预览应用，包含选中的原型和标记。

## 使用方法

### 方法 1：使用 Node.js 启动（推荐）

1. 确保已安装 Node.js（https://nodejs.org/）
2. 在当前目录打开终端
3. 运行命令：
   ```bash
   node start-server.js
   ```
4. 浏览器会自动打开预览页面

### 方法 2：使用 Python 启动

如果已安装 Python，可以使用以下命令：

**Python 3:**
```bash
python3 -m http.server 8080
```

**Python 2:**
```bash
python -m SimpleHTTPServer 8080
```

然后在浏览器中访问：http://localhost:8080

### 方法 3：使用其他 HTTP 服务器

你可以使用任何静态文件服务器，例如：
- VS Code 的 Live Server 插件
- npx serve
- 其他 HTTP 服务器工具

## 注意事项

⚠️ **不能直接双击 index.html 打开**

由于浏览器的安全限制，必须通过 HTTP 服务器访问才能正常使用。直接用浏览器打开 index.html 文件会导致功能异常。

## 功能说明

- 浏览原型列表
- 查看原型预览
- 查看标记和说明
- 只读模式，无法编辑

## 技术支持

如有问题，请访问：https://github.com/qizhi2design-svg/prdkit
