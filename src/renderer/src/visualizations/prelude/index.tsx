import { EdgePanel } from '@/design/EdgePanel';
import { FloatingRig } from '@/design/FloatingRig';
import type { SceneProps, VisualizationModule } from '../types';
import { preludeMeta } from './meta';
import { PreludeView } from './PreludeView';
import './prelude.css';

function PreludeScene(props: SceneProps) {
  return (
    <div className="prelude-scene">
      <div className="scene-floor" aria-hidden />
      <FloatingRig className="prelude-scene__rig">
        <EdgePanel
          className="prelude-scene__window"
          radius={16}
          notch={{ width: 132, depth: 9, at: 0.5 }}
          breathe
          data-testid="stage-window"
        >
          <PreludeView {...props} />
        </EdgePanel>
      </FloatingRig>
    </div>
  );
}

const mod: VisualizationModule = { meta: preludeMeta, Scene: PreludeScene };
export default mod;
export const { meta, Scene } = mod;
