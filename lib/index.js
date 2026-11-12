/**
 * dsh-wallpaper 宿主半：本插件的全部逻辑都在浏览器半（./client）。
 * 宿主进程只需一个可加载的 cordis 插件入口，让 bundle patch 的 insert 行成立。
 */
export const name = "dsh-wallpaper";

export const inject = [];

export function apply() {}
