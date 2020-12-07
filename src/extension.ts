import { promises } from "dns";
import { url } from "inspector";
import { start } from "repl";
import * as vscode from "vscode";
const yaml = require("js-yaml");

export function activate(context: vscode.ExtensionContext) {
  vscode.commands.registerCommand("flutter-assets-codegen.codegen", codegen);
}

async function codegen() {
  //查找工作区所有pubspec.yaml   忽略**/.symlinks/**中的pubspec.yaml
  const yamlUris = await vscode.workspace.findFiles(
    "**/pubspec.yaml",
    "**/.symlinks/**"
  );

  //按文件进行多次异步创建
  const promises: Promise<void>[] = [];
  ///to add promises
  for (const yamlUri of yamlUris) {
    const promise = new Promise<void>(async (resolve, reject) => {
      const stat = await vscode.workspace.fs.stat(yamlUri);
      //yaml不是文件，退出
      if (stat.type !== vscode.FileType.File) {
        return resolve();
      }
      const yamlStr = await vscode.workspace.fs.readFile(yamlUri);
      let yamlObj: PubModel = {};
      try {
        yamlObj = yaml.load(yamlStr.toString());
      } catch (error) {}
      const packageName = yamlObj?.name;
      if (!packageName) {
        return resolve();
      }
      const assets = yamlObj?.flutter?.assets ?? [];
      if (!assets?.length) {
        return resolve();
      }
      const is_project = yamlObj?.is_project;

      const rootUri = vscode.Uri.joinPath(yamlUri, "../");

      //item
      const strs: string[] = [];

      //build item
      function toStatic(str: string): string {
        const shift = `$${str
          .replace(/^lib\//, "")
          .replace(/\W/g, "_")
          .replace(/^_*/, "")}`;
        const path = `'${is_project ? "" : `package/${packageName}/`}${str}';`;
        return `  static const ${shift} = ${path}`;
      }

      const stats = assets.map(async (e) => {
        const asset = vscode.Uri.joinPath(rootUri, e);
        const stat = await vscode.workspace.fs.stat(asset);
        if (stat.type === vscode.FileType.File) {
          strs.push(toStatic(e));
        } else if (stat.type === vscode.FileType.Directory) {
          const files = await vscode.workspace.fs.readDirectory(asset);
          for (const item of files) {
            if (item[1] === vscode.FileType.File) {
              const uri = vscode.Uri.joinPath(asset, item[0]);
              const path = uri.fsPath.replace(rootUri.fsPath, "");
              strs.push(toStatic(path));
            }
          }
        }
      });
      await Promise.all(stats);

      //去重
      const deWeight = Array.from(new Set(strs));
      if (!deWeight.length) {
        return resolve();
      }

      //即将生成的文件路径
      const fileUri = vscode.Uri.joinPath(rootUri, "lib/src/asset_list.dart");

      const itemStr = deWeight.join("\n\n");
      const content = `// GENERATED CODE - DO NOT MODIFY BY HAND\n\nclass AssetList{\n  AssetList._();\n${itemStr}\n}`;

      //写入文件
      await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content));

      vscode.window.showInformationMessage(
        `[${packageName}] Assets codegen success.`
      );

      return resolve();
    });

    //end
    promises.push(promise);
  }
}

interface PubModel {
  name?: string;
  is_project?: boolean;
  flutter?: {
    assets?: string[];
  };
}

/**
 * 驼峰
 * @param str
 */
function toHump(str: string): string {
  return str.replace(/\_(\w)/g, function ($0, $1) {
    return $1.toUpperCase();
  });
}
/**
 * 首字母大写
 * @param str
 */
function toFirstUpperCase(str: string): string {
  return str.slice(0, 1)?.toUpperCase() + str.slice(1) ?? "";
}
/**
 * 首字母小写
 * @param str
 */
function toFirstLowercase(str: string): string {
  return str.slice(0, 1)?.toLowerCase() + str.slice(1) ?? "";
}

/**
 * 大写驼峰
 * @param str
 */
function toUpperCaseHump(str: string): string {
  return toFirstUpperCase(toHump(str));
}
/**
 * 小写驼峰
 * @param str
 */
function toLowercaseHump(str: string): string {
  return toFirstLowercase(toHump(str));
}
