import type { AppModule, AppRoute } from './types';

/** 自动收集 pages 目录下所有 routes.tsx 导出的模块定义 */
const modules = import.meta.glob<{ default: AppModule }>('../pages/**/routes.tsx', { eager: true });

export const appModules: AppModule[] = Object.values(modules)
  .map((m) => m.default)
  .filter(Boolean)
  .sort((a, b) => a.group.order - b.group.order);

export const allRoutes: AppRoute[] = appModules
  .flatMap((m) => m.routes.map((r) => ({ ...r, group: m.group } as any)))
  .sort((a, b) => {
    // 具体路径优先于动态参数路径
    const score = (p: string) => (p.includes(':') ? 1 : 0);
    return score(a.path) - score(b.path);
  });

export function findRoute(pathname: string): AppRoute | undefined {
  const exact = allRoutes.find((r) => r.path === pathname);
  if (exact) return exact;
  // 动态路由匹配（:id）
  for (const r of allRoutes) {
    if (!r.path.includes(':')) continue;
    const pattern = new RegExp('^' + r.path.replace(/:[^/]+/g, '[^/]+') + '$');
    if (pattern.test(pathname)) return r;
  }
  return undefined;
}

export function groupOfPath(pathname: string) {
  const r = findRoute(pathname);
  return r ? (r as any).group : undefined;
}

export type { AppModule, AppRoute };
