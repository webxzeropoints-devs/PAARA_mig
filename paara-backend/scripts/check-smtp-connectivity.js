const net = require('net');

const host = String(process.env.SMTP_HOST || process.env.EMAIL_HOST || '').trim();
const port = Number(String(process.env.SMTP_PORT || process.env.EMAIL_PORT || '587').trim());

if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('[SMTP_TCP_RESULT]', {
    ok: false,
    code: 'SMTP_CONFIGURATION_INVALID',
    hostConfigured: Boolean(host),
    port,
  });
  process.exitCode = 2;
} else {
  const startedAt = Date.now();
  const socket = net.createConnection({ host, port });
  let settled = false;

  const finish = (result, exitCode = 0) => {
    if (settled) return;
    settled = true;
    console.log('[SMTP_TCP_RESULT]', {
      ...result,
      host,
      port,
      elapsedMs: Date.now() - startedAt,
    });
    socket.destroy();
    process.exitCode = exitCode;
  };

  socket.setTimeout(10000);
  socket.once('connect', () => finish({ ok: true, event: 'connect' }));
  socket.once('timeout', () => finish({ ok: false, code: 'ETIMEDOUT', event: 'timeout' }, 1));
  socket.once('error', (error) => finish({
    ok: false,
    code: error.code,
    event: 'error',
    message: error.message,
    errno: error.errno,
    syscall: error.syscall,
    address: error.address,
  }, 1));
}
