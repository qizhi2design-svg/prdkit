# prdkit CLI

用于初始化产品项目骨架，并根据模板仓库中的 `templates.json` 创建文档与页面原型。

## 命令

- `prdkit init`
- `prdkit create`
- `prdkit prototype create`

## 原型创建

`prdkit prototype create` 创建页面后会自动生成初始 checkpoint。

原型模板默认会生成：

- `index.html`
- `style.css`
- `script.js`
- `mock.js`

## 开发

```bash
pnpm install
pnpm dev --help
pnpm test
pnpm typecheck
```
