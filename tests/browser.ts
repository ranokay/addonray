import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { InspectorBrowser } from '../lib/inspector';

export const browser: Required<InspectorBrowser> = fakeBrowser;
