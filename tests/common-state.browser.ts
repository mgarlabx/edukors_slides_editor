// The document state tests, run in headless Chrome (scripts/test-common-headless.mjs): layouts need a real DOM.
import './common-state.test';
export {runTests as run} from './browser-test-shim';
