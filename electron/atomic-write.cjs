// Crash-safe file write (durability). Write to a temp file in the SAME directory, flush it to disk,
// then atomically rename it over the target. A crash/full-disk mid-write leaves only the harmless .tmp
// orphan; the real file is never half-written, so a bad write can't corrupt or lose your data. The
// rename is atomic on the same filesystem (POSIX and Windows/NTFS). This is platform plumbing (file
// storage) — desktop CJS; the web server keeps its own equivalent.
const fs = require("fs");
const path = require("path");
function atomicWriteFileSync(file, data) {
  const tmp = path.join(path.dirname(file), "." + path.basename(file) + ".tmp-" + process.pid + "-" + Date.now());
  let fd;
  try {
    fd = fs.openSync(tmp, "w");
    fs.writeFileSync(fd, data);
    try { fs.fsyncSync(fd); } catch {}
  } finally { if (fd !== undefined) { try { fs.closeSync(fd); } catch {} } }
  try { fs.renameSync(tmp, file); }
  catch (e) { try { fs.unlinkSync(tmp); } catch {} throw e; }
}
module.exports = { atomicWriteFileSync };
