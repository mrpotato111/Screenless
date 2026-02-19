const { app, BrowserWindow } = require('electron');

function createWindow() {
    const win = new BrowserWindow({
        width: 375,
        height: 812,
        resizable: false,
        webPreferences: {
            nodeIntegration: true
        }
    });

    win.loadFile('index.html');
}


app.whenReady().then(createWindow);