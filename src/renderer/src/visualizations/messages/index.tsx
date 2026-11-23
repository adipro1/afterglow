import type { SceneProps, VisualizationModule } from '../types';
import { messagesMeta } from './meta';
import { Drift } from './Drift';
import { Lockscreen } from './Lockscreen';
import { Thread } from './Thread';
import { useConversation } from './useConversation';
import './messages.css';
import './lockscreen.css';
import './drift.css';

function MessagesScene(props: SceneProps) {
  const { plan, structure } = useConversation(props.lyrics, props.seed, props.getTime);
  const shared = { ...props, plan, structure };
  return (
    <div className="messages-scene" data-testid="messages-scene" data-variation={props.variation}>
      {props.variation === 'thread' && <Thread {...shared} />}
      {props.variation === 'lockscreen' && <Lockscreen {...shared} />}
      {props.variation === 'drift' && <Drift {...shared} />}
    </div>
  );
}

const mod: VisualizationModule = { meta: messagesMeta, Scene: MessagesScene };
export default mod;
