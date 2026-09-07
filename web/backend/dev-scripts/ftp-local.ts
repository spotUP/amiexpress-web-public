/**
 * The FTP server, on this machine, against this checkout's board.
 *
 * WHY IT EXISTS. Every deploy of the live board recreates the container and
 * drops the callers who are on it (sysop, 2026-09-07: "we are throwing users
 * out of the live bbs"). Iterating on FTP by deploying is therefore expensive
 * in the one currency that matters. This runs the REAL server - the real
 * command loop, the real tree, the real filing service, the real password
 * check - on localhost, so a client can be pointed at it instead.
 *
 * It also does NOT start the BBS. Three sessions share one running dev server
 * on this machine; restarting that to test FTP would drop their work too. This
 * is a separate process that binds one port and nothing else.
 *
 *   cd web/backend
 *   npx tsx dev-scripts/ftp-local.ts
 *
 * Then connect to `localhost:2121` with your normal BBS handle and password.
 * Plain FTP is fine: loopback is the one place the board allows a plaintext
 * login, so no certificate is needed here.
 *
 * IT WRITES TO THIS CHECKOUT'S BOARD. An upload really is filed - DIR entry,
 * catalogue row, the lot - into the board data in this repository. That is the
 * point (it proves the filing), but it is the sysop's own data, so upload test
 * files rather than anything you mind seeing in a conference.
 *
 * Overridable: FTP_PORT (2121), FTP_PASSIVE_PORTS (34101-34110),
 * FTP_PASSIVE_ADDRESS (127.0.0.1).
 */
import { boardFtpDeps } from '../src/ftp/ftp-auth';
import { startFtpServer } from '../src/ftp/start-ftp';

async function main(): Promise<void> {
  const port = process.env.FTP_PORT ?? '2121';
  const passivePorts = process.env.FTP_PASSIVE_PORTS ?? '34101-34110';
  const passiveAddress = process.env.FTP_PASSIVE_ADDRESS ?? '127.0.0.1';

  const server = await startFtpServer(
    // The board's own config is not consulted for the switch: this script IS
    // the decision to run one.
    { ftp_enabled: true },
    boardFtpDeps(),
    {
      FTP_ENABLED: '1',
      FTP_PORT: port,
      FTP_HOST: '127.0.0.1',
      FTP_PASSIVE_PORTS: passivePorts,
      FTP_PASSIVE_ADDRESS: passiveAddress,
    }
  );

  if (!server) {
    console.error('[ftp-local] the server refused to start');
    process.exit(1);
  }

  const bound = server.address()?.port;
  console.log(`[ftp-local] listening on 127.0.0.1:${bound}`);
  console.log(`[ftp-local] passive data ports ${passivePorts}, advertised as ${passiveAddress}`);
  console.log('[ftp-local] connect with plain FTP and your BBS handle - loopback needs no TLS');
  console.log('[ftp-local] uploads are filed into THIS checkout\'s board data');

  const stop = async (): Promise<void> => {
    console.log('\n[ftp-local] stopping');
    await server.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
}

void main();
