/**
 * 三方比较（source / dest / baseline）的同步状态判定。
 *
 * baseline 是上次同步时记录的内容哈希（sync-state.json），代表两侧最后一次一致的内容。
 * 只有引入 baseline，才能区分“仅 source 改动”“仅 dest 改动”“双方都改动”这三种本质不同的
 * 差异；仅比较 source 与 dest 只能得到“相等/不等”一个比特，无法归因于哪一侧改动。
 *
 * 方向无关：调用方把“要读取的一侧”作为 source、“要被覆盖的一侧”作为 dest 传入。
 *   sync    : source = 中央(Central), dest = 目标(Target)
 *   collect : source = 目标(Target),  dest = 中央(Central)
 * 因此 `replace` 恒为“覆盖安全”，`dest-ahead` 恒为“覆盖会丢失 dest 的较新内容”。
 */
export type SyncStatus = 'new' | 'same' | 'replace' | 'dest-ahead' | 'conflict';

export type ClassifySyncStatusParams = {
  /** dest 侧是否已存在该条目 */
  destExists: boolean;
  /** source 侧当前内容哈希 */
  srcHash: string;
  /** dest 侧当前内容哈希（destExists 为 true 时应提供；无法计算时传 undefined） */
  destHash?: string;
  /** 上次同步记录的基线哈希；从未同步则为 undefined */
  baselineHash?: string;
};

/**
 * 判定单个条目的同步状态。
 * - new        : dest 不存在 -> 首次写入。
 * - same       : 两侧内容一致 -> 无需操作。
 * - replace    : 仅 source 改动（dest 自上次同步以来未变）-> 覆盖安全。
 * - dest-ahead : 仅 dest 改动（source 未变）-> 覆盖会丢失 dest 的较新内容（很可能方向反了）。
 * - conflict   : 双方都相对基线改动，或无基线可仲裁 -> 真正的分歧。
 *
 * 说明：进入 replace/dest-ahead/conflict 分支时 srcHash !== destHash，
 * 因此 baseline 至多与其中一侧相等，三者互斥。
 */
export function classifySyncStatus(params: ClassifySyncStatusParams): SyncStatus {
  const { destExists, srcHash, destHash, baselineHash } = params;
  if (!destExists) return 'new';
  if (destHash !== undefined && destHash === srcHash) return 'same';
  if (baselineHash !== undefined && destHash !== undefined && baselineHash === destHash) return 'replace';
  if (baselineHash !== undefined && baselineHash === srcHash) return 'dest-ahead';
  return 'conflict';
}

const AUTO_APPLY_STATUSES: ReadonlySet<SyncStatus> = new Set<SyncStatus>(['new', 'replace']);
const GATED_STATUSES: ReadonlySet<SyncStatus> = new Set<SyncStatus>(['dest-ahead', 'conflict']);

/** 安全、可默认选中并自动应用的状态（新增或干净覆盖）。 */
export function isAutoApplyStatus(status: SyncStatus): boolean {
  return AUTO_APPLY_STATUSES.has(status);
}

/** 需要确认 / --force 才能覆盖的状态（会丢失 dest 内容或存在分歧）。 */
export function isGatedStatus(status: SyncStatus): boolean {
  return GATED_STATUSES.has(status);
}
