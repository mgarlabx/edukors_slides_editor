// Editing functions of motion.ts, exposed to a browser page (scripts/test-player-motion.mjs).
import {setAnimation,animationsAt,appendAnimations} from '../src/shared/motion';
(globalThis as any).motion={setAnimation,animationsAt,appendAnimations};
