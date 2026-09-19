import { layoutTable, type SceneTile, type TableSceneState } from '../../shared/table-scene';

/** The approved preview uses the production layout without additional offsets. */
export function previewTableLayout(state: TableSceneState): SceneTile[] {
  return layoutTable(state);
}
