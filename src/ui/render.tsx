import React, { createContext, useContext } from 'react';
import { render } from 'ink';

// ─── Result callback context ────────────────────────────────────────────
// 每个 ink 提示组件通过此 context 获取 resolve 回调，
// 调用后会终止 ink 渲染并将值返回给调用方。

type ResolveCtx<T = unknown> = {
  resolve: (value: T) => void;
};

const ResolveContext = createContext<ResolveCtx | null>(null);

export function useResolve<T>(): (value: T) => void {
  const ctx = useContext(ResolveContext);
  if (!ctx) throw new Error('useResolve must be used inside runInk');
  return ctx.resolve as (value: T) => void;
}

/**
 * 渲染一个 ink React 元素，并返回 Promise。
 * 组件内部通过 useResolve() 获取 resolve 回调来结束交互。
 */
export function runInk<T>(element: React.ReactElement): Promise<T> {
  return new Promise<T>((resolve) => {
    const instance = render(
      <ResolveContext.Provider value={{ resolve: (v: unknown) => {
        resolve(v as T);
        instance.unmount();
      } }}>
        {element}
      </ResolveContext.Provider>,
    );
  });
}
