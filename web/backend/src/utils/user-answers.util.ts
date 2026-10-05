/**
 * Where an account's new-user questionnaire answers are, as express.e finds
 * them for the account editor's `?` (findUserAnswers, 21177-21196).
 *
 * doNewUserQuestions (30332-30340) appends them to the board's Answers/<slot>
 * on a CENTRAL_ANSWERS node, else to Node<n>/Answers - one file per node, which
 * findUserAnswers never reads (it looks for Node<n>/Answers/<slot>).
 */
import * as path from 'path';
import * as amigafs from './amigafs';

/** express.e axconsts.e:43 MAXNODES. */
const MAXNODES = 32;

/**
 * express.e:21177-21196 findUserAnswers: the answers file of account `slot`,
 * or null. Walks Node0, Node1, ... while the node directory exists; a node
 * with CENTRAL_ANSWERS keeps them in the board's `Answers/<slot>`, any other
 * in `Node<n>/Answers/<slot>`. The first that exists is the one.
 */
export function findUserAnswersFile(dataDir: string, slot: number): string | null {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { nodeFlag } = require('./node-tooltypes.util');
  for (let i = 0; i <= MAXNODES; i++) {
    const nodeDir = amigafs.resolvePath(path.join(dataDir, `Node${i}`));
    if (!nodeDir || !amigafs.existsSync(nodeDir)) return null;
    const file = nodeFlag(i, 'CENTRAL_ANSWERS')
      ? path.join(dataDir, 'Answers', String(slot))
      : path.join(nodeDir, 'Answers', String(slot));
    const found = amigafs.resolvePath(file);
    if (found && amigafs.existsSync(found)) {
      try {
        if (amigafs.statSync(found).isFile()) return found;
      } catch { /* not a file: keep looking */ }
    }
  }
  return null;
}
