import blessed, { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

// Helper to invalidate coordinate cache after direct position modification
function invalidateCache(element: any) {
  element._coordsCacheValid = false;
  if (element.children) {
    for (const child of element.children) {
      invalidateCache(child);
    }
  }
}

export function createDialogs(s: Screen, ib: any) {
  const mo = blessed.overlay({ parent: s, top: 0, left: 0, width: '100%', height: '100%', opacity: 0.5, hidden: true, style: { bg: 'black' } });

  function showModal(w: any) {
    // Update overlay dimensions to current screen size
    mo.position.width = s.width;
    mo.position.height = s.height;
    invalidateCache(mo);
    mo.show();
    mo.setFront();  // Bring overlay to front first
    w.show();
    w.setFront();   // Then bring modal on top of overlay
    w.focus();
    s.render();
  }

  function hideModal(w: any) {
    mo.hide();
    w.hide();
    ib.focus();
    s.render();
  }

  const md = blessed.message({ parent: s, top: 'center', left: 'center', width: 50, trapFocus: true, style: { fg: 'white', bg: 'black', border: { fg: 'cyan' } } });
  const pd = blessed.prompt({ parent: s, top: 'center', left: 'center', width: 50, trapFocus: true, style: { fg: 'white', bg: 'black', border: { fg: 'green' } } });
  const qd = blessed.question({ parent: s, top: 'center', left: 'center', width: 45, title: ' Confirm ', trapFocus: true, style: { fg: 'white', bg: 'black', border: { fg: 'yellow' } } });

  function showMessageDialog(t: string, cb?: () => void) {
    mo.position.width = s.width;
    mo.position.height = s.height;
    invalidateCache(mo);
    mo.show();
    md.once('hide', () => { mo.hide(); ib.focus(); s.render(); });
    md.display(t, () => { if (cb) cb(); });
  }

  function showPromptDialog(t: string, v: string, cb: (e: Error | null, val?: string) => void) {
    mo.position.width = s.width;
    mo.position.height = s.height;
    invalidateCache(mo);
    mo.show();
    pd.once('hide', () => { mo.hide(); ib.focus(); s.render(); });
    pd.showInput(t, v, (e, val) => { cb(e, val); });
  }

  function showConfirmDialog(t: string, cb: (a: boolean) => void) {
    mo.position.width = s.width;
    mo.position.height = s.height;
    invalidateCache(mo);
    mo.show();
    qd.once('hide', () => { mo.hide(); ib.focus(); s.render(); });
    qd.ask(t, (a: boolean) => { cb(a); });
  }

  return { modalOverlay: mo, showModal, hideModal, messageDialog: md, promptDialog: pd, questionDialog: qd, showMessageDialog, showPromptDialog, showConfirmDialog };
}
