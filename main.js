const { app, BrowserWindow } = require('electron');
const http = require('http');

const CLI_PORT = 45678;
const CLI_HOST = '127.0.0.1';

let mainWindow = null;
let cliServer = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    backgroundColor: '#0d0d0d',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.loadFile('index.html');
}

// CLI server to communicate with the `bb-*` commands
function startCliServer() {
  cliServer = http.createServer((req, res) => {
    if (req.url === '/ping' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('pong');
      return;
    }

    if (req.url === '/buffer') {
      if (!mainWindow || mainWindow.isDestroyed()) {
        res.writeHead(503);
        res.end('Window not available');
        return;
      }

      if (req.method === 'GET') {
        // Get buffer content
        mainWindow.webContents.executeJavaScript('localStorage.getItem("blackboard-content") || ""')
          .then(content => {
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(content);
          })
          .catch(err => {
            res.writeHead(500);
            res.end('Failed to get buffer');
          });
        return;
      }

      if (req.method === 'POST') {
        // Set buffer content
        let body = '';
        req.setEncoding('utf8');
        const replaceMode = req.headers['x-mode'] === 'replace';
        console.log('POST /buffer - receiving data...', replaceMode ? '(replace)' : '(append)');
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          console.log('POST /buffer - received', body.length, 'bytes');
          const escaped = JSON.stringify(body);
          const script = replaceMode ? `
            (function() {
              const editor = document.getElementById('editor');
              editor.value = ${escaped};
              localStorage.setItem('blackboard-content', ${escaped});
              editor.dispatchEvent(new Event('input'));
              return 'ok';
            })();
          ` : `
            (function() {
              const editor = document.getElementById('editor');
              const newContent = editor.value + ${escaped};
              editor.value = newContent;
              localStorage.setItem('blackboard-content', newContent);
              editor.dispatchEvent(new Event('input'));
              return 'ok';
            })();
          `;
          mainWindow.webContents.executeJavaScript(script)
            .then((result) => {
              res.writeHead(200, { 'Content-Type': 'text/plain' });
              res.end('ok');
            })
            .catch(err => {
              console.error('executeJavaScript error:', err);
              res.writeHead(500);
              res.end('Failed to set buffer: ' + err.message);
            });
        });
        return;
      }

      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  cliServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log('CLI server port in use, another instance may be running');
    } else {
      console.error('CLI server error:', err);
    }
  });

  cliServer.listen(CLI_PORT, CLI_HOST, () => {
    console.log(`CLI server listening on ${CLI_HOST}:${CLI_PORT}`);
  });
}

function stopCliServer() {
  if (cliServer) {
    cliServer.close();
    cliServer = null;
  }
}

app.whenReady().then(() => {
  createWindow();
  startCliServer();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopCliServer();
    app.quit();
  }
});

app.on('before-quit', () => {
  stopCliServer();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
