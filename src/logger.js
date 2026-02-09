// Simple logger with levels and UI sink
export const Logger = (() => {
  const levels = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40 };
  let currentLevel = levels.DEBUG;
  let uiSink = null;

  function ts() {
    return new Date().toISOString();
  }

  function setLevel(name) {
    if (levels[name] !== undefined) currentLevel = levels[name];
  }

  function setUiSink(element) {
    uiSink = element;
  }

  function write(levelName, msg, data) {
    const lvl = levels[levelName] ?? levels.INFO;
    if (lvl < currentLevel) return;
    const line = `[${ts()}] ${levelName} ${msg}`;
    // Console
    if (lvl >= levels.ERROR) console.error(line, data ?? "");
    else if (lvl >= levels.WARN) console.warn(line, data ?? "");
    else if (lvl >= levels.INFO) console.info(line, data ?? "");
    else console.debug(line, data ?? "");
    // UI
    if (uiSink) {
      const text = data ? `${line} \n${safeJson(data)}\n` : `${line}\n`;
      uiSink.textContent += text;
      uiSink.scrollTop = uiSink.scrollHeight;
    }
  }

  function safeJson(obj) {
    try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
  }

  return {
    levels,
    setLevel,
    setUiSink,
    debug: (msg, data) => write('DEBUG', msg, data),
    info:  (msg, data) => write('INFO', msg, data),
    warn:  (msg, data) => write('WARN', msg, data),
    error: (msg, data) => write('ERROR', msg, data),
  };
})();
