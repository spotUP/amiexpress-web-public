/**
 * Point the board at a directory for one test.
 *
 * The board's root is config.dataDir (utils/board-root.util boardRoot()
 * returns it), and config reads the environment once, when it loads - so a
 * test that sets BBS_DATA_DIR after the modules are in is too late. This
 * overrides what config answers instead, the way the admin changes it at
 * runtime. Call the returned function (or jest.restoreAllMocks) to undo.
 */
import { config } from '../../src/config';

export function setBoardRoot(root: string): () => void {
  const get = config.get.bind(config);
  const getConfig = config.getConfig.bind(config);
  const spyGet = jest.spyOn(config, 'get').mockImplementation(((key: string) => (key === 'dataDir' ? root : get(key as never))) as never);
  const spyAll = jest.spyOn(config, 'getConfig').mockImplementation(() => ({ ...getConfig(), dataDir: root }));
  return () => { spyGet.mockRestore(); spyAll.mockRestore(); };
}
