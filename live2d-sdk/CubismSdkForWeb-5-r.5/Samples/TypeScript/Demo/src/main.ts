/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { LAppDelegate } from './lappdelegate';
import * as LAppDefine from './lappdefine';

/**
 * ブラウザロード後の処理
 */
window.addEventListener(
  'load',
  (): void => {
    // Initialize WebGL and create the application instance
    if (!LAppDelegate.getInstance().initialize()) {
      return;
    }

    LAppDelegate.getInstance().run();
  },
  { passive: true }
);

/**
 * 終了時の処理
 */
window.addEventListener(
  'beforeunload',
  (): void => LAppDelegate.releaseInstance(),
  { passive: true }
);

// รับคำสั่งจาก parent page
window.addEventListener('message', (e: MessageEvent) => {
  const d = e.data || {};
  if (typeof d.mouth === 'number')   (window as any)._mouthValue = d.mouth;
  if (typeof d.zoom === 'number')    (window as any)._zoom = d.zoom;
  if (typeof d.offsetY === 'number') (window as any)._offsetY = d.offsetY;
  if (typeof d.model === 'number')   LAppDelegate.getInstance().switchModel(d.model);
});
