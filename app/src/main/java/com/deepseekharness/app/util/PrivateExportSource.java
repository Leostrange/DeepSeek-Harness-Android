package com.deepseekharness.app.util;

import com.deepseekharness.app.backup.BackupFileSystem;
import java.io.File;
import java.io.IOException;

/** Resolve framework-owned storage aliases without following app-owned descendant links. */
public final class PrivateExportSource {
  private PrivateExportSource() {}

  public static File resolve(BackupFileSystem fs, File appData, File files, File cache, File source)
      throws IOException {
    var host = ColdInstallPackages.bindPrivateFiles(fs, appData, files);
    File authority = host.files.getParentFile();
    for (File declared : new File[] {files, cache}) {
      if (declared == null || !authority.equals(declared.getParentFile().getCanonicalFile()))
        throw new IOException("EXPORT_SOURCE_AUTHORITY");
      String prefix = declared.getAbsolutePath() + File.separator;
      if (source.getAbsolutePath().startsWith(prefix)) {
        File root = fs.child(authority, declared.getName());
        File result = fs.child(root, source.getAbsolutePath().substring(prefix.length())
            .replace(File.separatorChar, '/'));
        if (!fs.stat(result).type.equals("FILE")) throw new IOException("EXPORT_SOURCE_TYPE");
        host.verify(fs);
        return result;
      }
    }
    throw new IOException("EXPORT_SOURCE_OUTSIDE_AUTHORITY");
  }
}
