// ═══════════════════════════════════════════════════════════════
//  FileLoader  —  File → ArrayBuffer → decoded AudioBuffer
// ═══════════════════════════════════════════════════════════════
class FileLoader {
  constructor(audioEngine) {
    this.ctx = audioEngine.masterContext;
  }

  load(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          // slice(0) passes a copy — avoids detached ArrayBuffer issues
          const buffer = await this.ctx.decodeAudioData(e.target.result.slice(0));
          resolve(buffer);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }
}
